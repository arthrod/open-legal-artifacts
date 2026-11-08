// docio.js — canonical _shared DOCX/XLSX/ZIP I/O. Dependency-free ESM (browser + Node).
// API (contract per docs/plans-v3/backend.md):
//   await readDocx(buf)  -> { text: string, paragraphs: string[] }   buf: ArrayBuffer | Uint8Array
//   await readXlsx(buf)  -> { sheets: [{ name: string, rows: string[][] }] }
//   writeDocx(paragraphs: (string | { text })[]) -> Blob (browser) | Buffer (Node)
//   writeXlsx(rows: (string|number|null)[][], { name } = {}) -> Blob | Buffer
//   redlineMarkdown(changes: { op: 'ins'|'del'|'ctx', text: string }[]) -> string
// ZIP: reads STORE + DEFLATE; writes STORE (deterministic bytes on all platforms).
// DEFLATE: node:zlib inflateRawSync in Node, DecompressionStream('deflate-raw') in
// browsers; any other method or missing inflater throws Error('unsupported compression …')
// with .name 'UnsupportedCompression'. Truncated entries throw Error('truncated zip …');
// zip64 archives throw Error('zip64 unsupported'). No console output; no clocks/random in output.

const IS_NODE = typeof process === 'object' && process !== null && !!(process.versions && process.versions.node);
const XMLDECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const RELS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';

// ---------- shared bits ----------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(u8) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function unsupported(detail) {
  const e = new Error('unsupported compression: ' + detail);
  e.name = 'UnsupportedCompression';
  e.code = 'UNSUPPORTED_COMPRESSION';
  return e;
}

function toU8(buf) {
  if (buf instanceof Uint8Array) return buf;
  if (buf instanceof ArrayBuffer) return new Uint8Array(buf);
  if (buf && buf.buffer instanceof ArrayBuffer) return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  throw new TypeError('docio: expected ArrayBuffer or typed array');
}

const decodeXml = (s) => s.replace(/&(?:#x([0-9a-fA-F]+)|#([0-9]+)|amp|lt|gt|quot|apos);/g, (m, hex, dec) => {
  try {
    if (hex) return String.fromCodePoint(parseInt(hex, 16));
    if (dec) return String.fromCodePoint(parseInt(dec, 10));
  } catch {
    return m; // hostile ref (lone surrogate, out of range): keep literally, never crash
  }
  return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[m.slice(1, -1)];
});

const encodeXml = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

function attr(tag, name) {
  const m = new RegExp('\\s' + name + '="([^"]*)"').exec(tag);
  return m ? m[1] : undefined;
}

function output(u8) {
  if (IS_NODE && typeof Buffer !== 'undefined') return Buffer.from(u8);
  return new Blob([u8]);
}

// ---------- zip writer (STORE, deterministic) ----------

function buildZip(files) {
  const enc = new TextEncoder();
  const parts = [], cd = [];
  let offset = 0;
  for (const [name, content] of files) {
    const data = typeof content === 'string' ? enc.encode(content) : content;
    const nb = enc.encode(name), crc = crc32(data), lho = offset;
    const lh = new Uint8Array(30), v = new DataView(lh.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);        // version needed
    v.setUint16(12, 0x21, true);     // date 1980-01-01 (fixed)
    v.setUint32(14, crc, true);
    v.setUint32(18, data.length, true);
    v.setUint32(22, data.length, true);
    v.setUint16(26, nb.length, true);
    parts.push(lh, nb, data);
    offset += 30 + nb.length + data.length;
    const c = new Uint8Array(46), u = new DataView(c.buffer);
    u.setUint32(0, 0x02014b50, true);
    u.setUint16(4, 20, true);        // version made by
    u.setUint16(6, 20, true);        // version needed
    u.setUint16(14, 0x21, true);     // date
    u.setUint32(16, crc, true);
    u.setUint32(20, data.length, true);
    u.setUint32(24, data.length, true);
    u.setUint16(28, nb.length, true);
    u.setUint32(42, lho, true);
    cd.push(c, nb);
  }
  const cdSize = cd.reduce((n, p) => n + p.length, 0);
  const eocd = new Uint8Array(22), e = new DataView(eocd.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, cdSize, true);
  e.setUint32(16, offset, true);     // offset == cd start
  const all = [...parts, ...cd, eocd];
  const out = new Uint8Array(offset + cdSize + 22);
  let o = 0;
  for (const p of all) { out.set(p, o); o += p.length; }
  return out;
}

// ---------- zip reader (STORE + DEFLATE) ----------

let nodeInflateRaw = null;

async function inflateRaw(raw) {
  if (IS_NODE) {
    if (!nodeInflateRaw) nodeInflateRaw = (await import('node:zlib')).inflateRawSync;
    return new Uint8Array(nodeInflateRaw(raw));
  }
  if (typeof DecompressionStream === 'undefined')
    throw unsupported('DEFLATE (no inflater available)');
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function openArchive(buf) {
  const u8 = toU8(buf);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  const floor = Math.max(0, u8.length - 22 - 65536);
  for (let i = u8.length - 22; i >= floor; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip archive (no end-of-central-directory record)');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const entries = new Map();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('corrupt zip central directory');
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const entryName = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen));
    const entry = {
      method: dv.getUint16(p + 10, true),
      csize: dv.getUint32(p + 20, true),
      lho: dv.getUint32(p + 42, true),
    };
    if (entry.csize === 0xFFFFFFFF || entry.lho === 0xFFFFFFFF)
      throw new Error('zip64 unsupported: ' + entryName);
    entries.set(entryName, entry);
    p += 46 + nlen + elen + clen;
  }
  const read = async (name) => {
    const entry = entries.get(name);
    if (!entry) return null;
    if (dv.getUint32(entry.lho, true) !== 0x04034b50) throw new Error('corrupt zip local header: ' + name);
    const nlen = dv.getUint16(entry.lho + 26, true), elen = dv.getUint16(entry.lho + 28, true);
    const start = entry.lho + 30 + nlen + elen;
    if (start + entry.csize > u8.length)
      throw new Error('truncated zip: entry ' + name + ' extends past end of archive');
    const raw = u8.subarray(start, start + entry.csize);
    if (entry.method === 0) return raw;
    if (entry.method !== 8) throw unsupported('method ' + entry.method + ' in ' + name);
    return inflateRaw(raw);
  };
  return { entries, read };
}

// ---------- docx read ----------

function docxParagraphs(xml) {
  const out = [];
  let cur = null, takeText = false;
  for (const tk of xml.split(/(<[^>]*>)/)) {
    if (!tk) continue;
    if (tk.charCodeAt(0) === 60) {
      const m = /^<(\/)?([^<\/\s>]+)([^>]*)>$/.exec(tk);
      if (!m) continue;
      const local = m[2].split(':').pop(); // namespace-agnostic
      const closed = !!m[1], empty = m[3].trimEnd().endsWith('/');
      if (local === 'p') {
        if (closed || empty) {
          if (cur !== null) { out.push(cur); cur = null; }
          if (empty && !closed) out.push('');
        } else if (cur === null) cur = '';
      } else if (cur !== null) {
        if (local === 't') takeText = !closed && !empty;
        else if (local === 'tab' && !closed) { cur += '\t'; takeText = false; }
        else if (local === 'br' && !closed) { cur += '\n'; takeText = false; }
        else takeText = false;
      }
    } else if (takeText && cur !== null) {
      cur += decodeXml(tk);
      takeText = false;
    }
  }
  if (cur !== null) out.push(cur);
  return out;
}

export async function readDocx(buf) {
  const arc = await openArchive(buf);
  const names = [...arc.entries.keys()];
  const name = names.includes('word/document.xml')
    ? 'word/document.xml'
    : names.find((k) => k.toLowerCase().endsWith('word/document.xml'));
  if (!name) throw new Error('no word/document.xml in archive');
  const xml = new TextDecoder().decode(await arc.read(name));
  const paragraphs = docxParagraphs(xml);
  return { text: paragraphs.join('\n'), paragraphs };
}

// ---------- xlsx read ----------

function colIndex(letters) {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function resolvePart(baseDir, target) {
  if (target.startsWith('/')) return target.replace(/^\/+/, '');
  const out = baseDir ? baseDir.split('/') : [];
  for (const seg of target.split('/')) {
    if (seg === '..') out.pop();
    else if (seg && seg !== '.') out.push(seg);
  }
  return out.join('/');
}

function collectInlineT(xml) {
  let s = '';
  for (const t of xml.matchAll(/<t\b(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) s += decodeXml(t[1]);
  return s;
}

function parseSheet(xml, shared) {
  const rows = [];
  for (const rm of xml.matchAll(/<row\b[^>]*>/g)) {
    const rIdx = parseInt(attr(rm[0], 'r'), 10) - 1;
    if (!(rIdx >= 0)) continue;
    let body = '';
    if (!rm[0].endsWith('/>')) {
      const end = xml.indexOf('</row', rm.index);
      if (end >= 0) body = xml.slice(rm.index + rm[0].length, end);
    }
    const cells = [];
    for (const cm of body.matchAll(/<c\b[^>]*>/g)) {
      const ref = /\sr="([A-Za-z]+)(\d+)"/.exec(cm[0]);
      if (!ref) continue;
      let inner = '';
      if (!cm[0].endsWith('/>')) {
        const end = body.indexOf('</c', cm.index);
        inner = end < 0 ? body.slice(cm.index + cm[0].length) : body.slice(cm.index + cm[0].length, end);
      }
      const t = attr(cm[0], 't') || 'n';
      const v = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(inner);
      let val = '';
      if (t === 'inlineStr') val = collectInlineT(/<is(?:\s[^>]*)?>([\s\S]*?)<\/is>/.exec(inner)?.[1] ?? '');
      else if (t === 's') val = shared[parseInt(v?.[1], 10)] ?? '';
      else if (t === 'b') val = v?.[1] === '1' ? 'TRUE' : 'FALSE';
      else val = v ? decodeXml(v[1]) : '';
      cells[colIndex(ref[1])] = val;
    }
    for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = '';
    rows[rIdx] = cells;
  }
  for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
  return rows;
}

export async function readXlsx(buf) {
  const arc = await openArchive(buf);
  const read = async (name) => {
    const names = [...arc.entries.keys()];
    const full = names.includes(name) ? name : names.find((k) => k.toLowerCase() === name.toLowerCase());
    return full ? new TextDecoder().decode(await arc.read(full)) : null;
  };
  const wb = await read('xl/workbook.xml');
  if (!wb) throw new Error('no xl/workbook.xml in archive');
  const relsXml = await read('xl/_rels/workbook.xml.rels') || '';
  const relTarget = new Map();
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], 'Id'), tgt = attr(m[0], 'Target');
    if (id && tgt) relTarget.set(id, resolvePart('xl', tgt));
  }
  const shared = [];
  const sst = await read('xl/sharedStrings.xml');
  if (sst) for (const si of sst.matchAll(/<si\b[\s\S]*?<\/si>/g)) shared.push(collectInlineT(si[0]));
  const sheets = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const rid = /\sr:id="([^"]*)"/.exec(m[0])?.[1];
    let part = rid && relTarget.get(rid);
    if (!part) {
      const ks = [...arc.entries.keys()].filter((k) => /^xl\/worksheets\/[^/]+\.xml$/.test(k)).sort();
      part = ks[sheets.length];
    }
    if (!part) continue;
    const xml = await read(part);
    if (xml) sheets.push({ name: decodeXml(attr(m[0], 'name') ?? ''), rows: parseSheet(xml, shared) });
  }
  return { sheets };
}

// ---------- docx / xlsx write ----------

export function writeDocx(paragraphs) {
  const body = (paragraphs ?? []).map((p) => {
    const text = typeof p === 'string' ? p : p && p.text != null ? String(p.text) : '';
    return '<w:p><w:r><w:t xml:space="preserve">' + encodeXml(text) + '</w:t></w:r></w:p>';
  }).join('');
  const doc = XMLDECL +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + body +
    '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>' +
    '</w:body></w:document>';
  return output(buildZip([
    ['[Content_Types].xml', XMLDECL +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>'],
    ['_rels/.rels', XMLDECL +
      '<Relationships xmlns="' + RELS_NS + '">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>'],
    ['word/document.xml', doc],
  ]));
}

// Excel sheet-name rules: forbidden : \ / ? * [ ] replaced with '_', 31-char cap,
// empty result (or no name) falls back to 'Sheet1'.
function sanitizeSheetName(name) {
  const n = String(name ?? '').replace(/[:\\/?*[\]]/g, '_').slice(0, 31);
  return n || 'Sheet1';
}

export function writeXlsx(rows, opts) {
  const sheetName = sanitizeSheetName((opts && typeof opts === 'object' && opts.name) || 'Sheet1');
  const colName = (i) => {
    let s = '';
    for (let n = i + 1; n; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s;
  };
  const body = (rows ?? []).map((row, ri) => {
    const cells = (row ?? []).map((v, ci) => {
      const ref = ' r="' + colName(ci) + (ri + 1) + '"';
      if (typeof v === 'number' && Number.isFinite(v)) return '<c' + ref + '><v>' + v + '</v></c>';
      return '<c' + ref + ' t="inlineStr"><is><t xml:space="preserve">' + encodeXml(v == null ? '' : String(v)) + '</t></is></c>';
    }).join('');
    return '<row r="' + (ri + 1) + '">' + cells + '</row>';
  }).join('');
  const SS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  return output(buildZip([
    ['[Content_Types].xml', XMLDECL +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '</Types>'],
    ['_rels/.rels', XMLDECL +
      '<Relationships xmlns="' + RELS_NS + '">' +
      '<Relationship Id="rId1" Type="' + REL + '/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>'],
    ['xl/workbook.xml', XMLDECL +
      '<workbook xmlns="' + SS + '" xmlns:r="' + REL + '"><sheets>' +
      '<sheet name="' + encodeXml(sheetName) + '" sheetId="1" r:id="rId1"/>' +
      '</sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', XMLDECL +
      '<Relationships xmlns="' + RELS_NS + '">' +
      '<Relationship Id="rId1" Type="' + REL + '/worksheet" Target="worksheets/sheet1.xml"/>' +
      '</Relationships>'],
    ['xl/worksheets/sheet1.xml', XMLDECL +
      '<worksheet xmlns="' + SS + '"><sheetData>' + body + '</sheetData></worksheet>'],
  ]));
}

// ---------- redline ----------

export function redlineMarkdown(changes) {
  const list = changes ?? [];
  const fence = list.some((c) => c && typeof c.text === 'string' && c.text.includes('```')) ? '````' : '```';
  const lines = list.map((c) => {
    const op = c && c.op === 'ins' ? '+ ' : c && c.op === 'del' ? '- ' : '  ';
    return op + (c && c.text != null ? String(c.text) : '');
  });
  return fence + 'diff\n' + lines.join('\n') + (lines.length ? '\n' : '') + fence + '\n';
}
