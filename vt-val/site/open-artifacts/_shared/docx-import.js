// docx-import.js — canonical _shared DOCX import: guarded reader + mountable UI.
// Pure ESM with ZERO imports (fleet rule) so it stays a valid standalone module.
// Served same-origin at /open-artifacts/_shared/docx-import.js (val + gh-pages
// mirror + repo static servers); demo pages load it via DYNAMIC import with a
// fallback chain — see deploy/build-site.mjs and the plan's Addendum 2 (D1).
// docio.js's docx READ path is vendored below BYTE-VERBATIM (parity-tested in
// docx-import.test.js: edit docio.js, then re-vendor the block; never "fix"
// the vendored code here).
// API:
//   await readDocxText(buf, opts?) -> { text, paragraphs, error: null }
//                                   | { error, code } — codes:
//       NOT_DOCX     not a Word .docx (renamed text/PDF, legacy .doc, or a zip without word/document.xml)
//       TRUNCATED    damaged or incomplete archive
//       TOO_LARGE    bytes exceed opts.maxBytes (default 5 MB)
//       EMPTY        readable docx, no extractable text (e.g. scanned images)
//       UNSUPPORTED  archive feature we cannot read (zip64, exotic compression)
//   await readDocxBlocks(buf, opts?) -> { blocks, text, paragraphs, error: null }
//                                    | { error, code } — SAME codes and guards
//       as readDocxText (one shared funnel; never throws). blocks is the
//       document in reading order, one entry per top-level w:p / w:tbl:
//         { type: 'paragraph', text }         w:t runs; w:tab -> \t, w:br
//                                            and w:cr -> \n
//         { type: 'table', rows: string[][] } header row included as rows[0]
//                                            (no separate header field)
//       Join semantics (pinned; D-class adapters rely on them): a cell with
//       several paragraphs is those paragraphs joined '\n'; paragraphs has
//       exactly ONE entry per block — a table's entry is its rows joined
//       '\n' with cells joined '\t' (TSV); text is paragraphs.join('\n').
//       Known limits: nested tables fold into their containing cell's text;
//       merged cells (gridSpan) appear once; the w: namespace prefix is
//       assumed; headers/footers are not read. Table parsers call this
//       directly — wireDocxImport stays pinned to the readDocxText payload.
//   renderImportUi(state) -> html string (pure; no DOM). state:
//       { title?, hint?, status: 'idle'|'reading'|'ready'|'error',
//         fileName?, previewHtml?, warning?, errorMessage?, errorCode? }
//   wireDocxImport(el, { title, hint, preview, apply }) -> void — mounts the
//       Import DOCX control into el. preview(docText) -> html (a returned
//       promise is awaited; if it throws, an editable textarea of the text is
//       shown instead — imported text is never lost). apply(payload, docText)
//       runs ONLY on the explicit Apply click: payload is the readDocxText
//       success value ({ text, paragraphs }); existing page inputs are never
//       touched before Apply.
//   readDocx — docio's verbatim reader, re-exported as-is.
// Stable UI class hooks (demos/tests): .docx-import, .docx-import-head,
// .docx-import-hint, .docx-import-controls, .docx-file-input, .docx-import-btn,
// .docx-apply-btn, .docx-import-file, .docx-import-status, .docx-import-error,
// .docx-import-warning, .docx-import-preview, .docx-import-text.
// No console output; no clocks or randomness; never throws.

/* ---- vendored from _shared/docio.js (read path) — byte-verbatim, parity-tested ---- */

const IS_NODE = typeof process === 'object' && process !== null && !!(process.versions && process.versions.node);

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

/* ---- end vendored from docio.js ---- */

// ---------- guarded reader ----------

export const DEFAULT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB import guard

const MESSAGES = {
  NOT_DOCX: 'This file is not a Word .docx document — a renamed text file, legacy .doc, or PDF will not import.',
  TRUNCATED: 'This .docx looks damaged or incomplete — try re-exporting it from Word.',
  EMPTY: 'No readable text in this .docx (it may contain only images or be empty). Paste the text directly instead.',
  UNSUPPORTED: 'This .docx uses an archive feature the importer cannot read (e.g. zip64).',
};

const fmtMB = (n) => (n / 1048576).toFixed(1) + ' MB';
const tooLargeMessage = (size, maxBytes) => 'This file is ' + fmtMB(size) + ' — the import limit is ' + fmtMB(maxBytes) + '.';
const fail = (code, message) => ({ error: message || MESSAGES[code], code });

function mapCode(e) {
  const msg = String((e && e.message) || e);
  if (/^not a zip archive|^no word\/document\.xml/.test(msg)) return 'NOT_DOCX';
  if (/^truncated zip|^corrupt zip/.test(msg)) return 'TRUNCATED';
  if ((e && e.name) === 'UnsupportedCompression' || /^unsupported compression|^zip64 unsupported/.test(msg)) return 'UNSUPPORTED';
  return 'TRUNCATED'; // unknown parse failure — surfaced as damaged, never a crash
}

// Shared guard funnel: input coercion, the size cap, archive opening, entry
// resolution, and error mapping live here once so readDocxText and
// readDocxBlocks cannot drift apart.
function maxBytesOf(opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  return Number.isFinite(o.maxBytes) && o.maxBytes > 0 ? o.maxBytes : DEFAULT_MAX_BYTES;
}

async function readDocumentXml(buf, opts) {
  const maxBytes = maxBytesOf(opts);
  let u8;
  try { u8 = toU8(buf); } catch { return fail('NOT_DOCX'); }
  if (u8.length > maxBytes) return fail('TOO_LARGE', tooLargeMessage(u8.length, maxBytes));
  try {
    const arc = await openArchive(u8);
    const names = [...arc.entries.keys()];
    const name = names.includes('word/document.xml')
      ? 'word/document.xml'
      : names.find((k) => k.toLowerCase().endsWith('word/document.xml'));
    if (!name) throw new Error('no word/document.xml in archive');
    return { xml: new TextDecoder().decode(await arc.read(name)) };
  } catch (e) {
    return fail(mapCode(e));
  }
}

export async function readDocxText(buf, opts) {
  const r = await readDocumentXml(buf, opts);
  if (r.error) return r;
  const paragraphs = docxParagraphs(r.xml);
  const text = paragraphs.join('\n');
  if (!text || !text.trim()) return fail('EMPTY');
  return { text, paragraphs, error: null };
}

// ---------- table-preserving reader (readDocxBlocks) ----------
// Ported from the PROVEN reconB reference implementation
// (tmp/ola-docx-2026-11-08/reconB-docx-lab/docx.mjs — validated against real
// OOXML incl. a 2x3 table): a w:-anchored tag scan with depth-counted element
// matching, so tables survive as {type:'table', rows} instead of flattening
// into loose paragraphs. Adapted: block type is 'paragraph' (not the
// reference's 'p'), entity decoding reuses the vendored decodeXml, and the
// guards are the shared readDocumentXml funnel above.

// Next opening tag `name` whose name ends at the hit ("<w:pPr" is NOT "w:p").
function findTag(s, name, from) {
  const pat = '<' + name;
  for (let i = s.indexOf(pat, from); i >= 0; i = s.indexOf(pat, i + pat.length)) {
    const c = s.charCodeAt(i + pat.length);
    if (c === 0x3e /*>*/ || c === 0x2f /*/*/ || c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) return i;
  }
  return -1;
}

// Element opening at s[start] (a findTag hit): {content, end} just past its
// close. Depth-counts nested same-name opens (w:tbl in w:tc, w:p in txbxContent).
function matchEl(s, start, name) {
  const gt = s.indexOf('>', start);
  if (gt < 0) return null;
  if (s.charCodeAt(gt - 1) === 0x2f) return { content: '', end: gt + 1 }; // self-closing <w:p/>
  const open = '<' + name, close = '</' + name + '>', contentStart = gt + 1;
  let depth = 1, j = contentStart;
  while (depth > 0) {
    const nc = s.indexOf(close, j);
    if (nc < 0) return null;
    const no = findTag(s, name, j);
    if (no >= 0 && no < nc) {
      const gt2 = s.indexOf('>', no);
      if (s.charCodeAt(gt2 - 1) === 0x2f) { j = gt2 + 1; continue; } // nested self-closing: no depth change
      depth++; j = gt2 + 1;
    } else {
      j = nc + close.length;
      if (--depth === 0) return { content: s.slice(contentStart, nc), end: j };
    }
  }
}

function* iterBlocks(s, name, from = 0) {
  for (;;) {
    const start = findTag(s, name, from);
    if (start < 0) return;
    const m = matchEl(s, start, name);
    if (!m) return;
    yield m;
    from = m.end;
  }
}

// Text of a paragraph / cell chunk: w:t runs, w:tab -> \t, w:br|w:cr -> \n.
const TOK = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<(w:tab|w:br|w:cr)\b[^>]*>/g;
function textOf(s) {
  let out = '';
  for (const m of s.matchAll(TOK)) out += m[1] !== undefined ? m[1] : (m[2] === 'w:tab' ? '\t' : '\n');
  return decodeXml(out);
}

// Cell text: the cell's paragraphs joined '\n' (a nested table's paragraphs
// fold in here too — documented limit).
const cellText = (s) => [...iterBlocks(s, 'w:p')].map((m) => textOf(m.content)).join('\n');

function tableRows(tblXml) {
  const rows = [];
  for (const r of iterBlocks(tblXml, 'w:tr')) {
    rows.push([...iterBlocks(r.content, 'w:tc')].map((c) => cellText(c.content)));
  }
  return rows;
}

function xmlToBlocks(xml) {
  const bodyStart = findTag(xml, 'w:body', 0);
  let s = xml;
  if (bodyStart >= 0) {
    const b = matchEl(xml, bodyStart, 'w:body');
    if (b) s = b.content;
  }
  s = s // unwrap content controls so blocks inside w:sdtContent are kept
    .replace(/<w:sdtPr(?:\s[^>]*)?>[\s\S]*?<\/w:sdtPr>/g, '')
    .replace(/<\/?w:sdt(?:Content)?(?:\s[^>]*)?>/g, '');
  const blocks = [];
  let i = 0;
  for (;;) { // document order: next top-level w:p or w:tbl (cells' paragraphs stay inside their table)
    const np = findTag(s, 'w:p', i), nt = findTag(s, 'w:tbl', i);
    if (np < 0 && nt < 0) break;
    const useTable = nt >= 0 && (np < 0 || nt < np);
    const m = matchEl(s, useTable ? nt : np, useTable ? 'w:tbl' : 'w:p');
    if (!m) break;
    blocks.push(useTable ? { type: 'table', rows: tableRows(m.content) } : { type: 'paragraph', text: textOf(m.content) });
    i = m.end;
  }
  return blocks;
}

// One paragraphs entry per block: paragraph -> its text; table -> TSV
// (rows '\n'-joined, cells '\t'-joined). text is paragraphs.join('\n').
const blockToParagraph = (b) => (b.type === 'table' ? b.rows.map((r) => r.join('\t')).join('\n') : b.text);

export async function readDocxBlocks(buf, opts) {
  const r = await readDocumentXml(buf, opts);
  if (r.error) return r;
  const blocks = xmlToBlocks(r.xml);
  const paragraphs = blocks.map(blockToParagraph);
  const text = paragraphs.join('\n');
  if (!text || !text.trim()) return fail('EMPTY');
  return { blocks, text, paragraphs, error: null };
}

// ---------- pure renderer ----------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function defaultPreview(text) {
  const t = String(text ?? '');
  const cap = 5000;
  const shown = t.length > cap ? t.slice(0, cap) + '\n… (' + (t.length - cap) + ' more characters not shown)' : t;
  return '<textarea class="docx-import-text" rows="8" style="width:100%;box-sizing:border-box">' + esc(shown) + '</textarea>';
}

export function renderImportUi(state) {
  const s = state && typeof state === 'object' ? state : {};
  const status = s.status === 'reading' || s.status === 'ready' || s.status === 'error' ? s.status : 'idle';
  const busy = status === 'reading';
  const title = esc(s.title || 'Import DOCX');
  const hint = s.hint ? '<span class="docx-import-hint">' + esc(s.hint) + '</span>' : '';
  const file = s.fileName ? '<span class="docx-import-file">' + esc(s.fileName) + '</span>' : '';
  const statusLine = busy ? '<p class="docx-import-status">Reading document…</p>' : '';
  const warning = s.warning ? '<p class="docx-import-warning">' + esc(s.warning) + '</p>' : '';
  const error = status === 'error' && s.errorMessage ? '<p class="docx-import-error" role="alert">' + esc(s.errorMessage) + '</p>' : '';
  const preview = status === 'ready' && s.previewHtml != null ? '<div class="docx-import-preview">' + s.previewHtml + '</div>' : '';
  const btn = (cls, label, dis) => '<button type="button" class="' + cls + '"' + (dis ? ' disabled' : '') + '>' + label + '</button>';
  return '<section class="docx-import" style="margin:12px 0;padding:10px 12px;border:1px solid #d8d8d2">'
    + '<style>.docx-import button{font:inherit}</style>'
    + '<div class="docx-import-head"><strong class="docx-import-title">' + title + '</strong>' + hint + '</div>'
    + '<div class="docx-import-controls">'
    + '<input type="file" class="docx-file-input" accept=".docx" hidden aria-label="Choose a .docx file">'
    + btn('docx-import-btn', 'Import DOCX', busy)
    + btn('docx-apply-btn', 'Apply', status !== 'ready')
    + file
    + '</div>'
    + statusLine + warning + error + preview
    + '</section>';
}

// ---------- mountable control ----------

export function wireDocxImport(el, opts) {
  if (!el || typeof el.querySelector !== 'function' || typeof el.innerHTML !== 'string') return;
  const o = opts && typeof opts === 'object' ? opts : {};
  const base = () => ({ title: o.title, hint: o.hint });
  let state = { title: o.title, hint: o.hint, status: 'idle' };
  let payload = null, docText = null, reading = false;

  const render = () => { el.innerHTML = renderImportUi(state); bind(); };
  const set = (next) => { state = next; render(); };

  function bind() {
    const input = el.querySelector('.docx-file-input');
    const pick = el.querySelector('.docx-import-btn');
    const applyBtn = el.querySelector('.docx-apply-btn');
    if (pick && input) pick.addEventListener('click', () => { input.click(); });
    if (input) {
      input.addEventListener('change', () => { onFile(input); });
      if (typeof input.value === 'string') input.value = ''; // allow re-picking the same file
    }
    if (applyBtn) {
      applyBtn.disabled = state.status !== 'ready';
      applyBtn.addEventListener('click', onApply);
    }
  }

  async function onFile(input) {
    if (reading) return;
    const file = input.files && input.files[0];
    if (!file) return;
    const name = typeof file.name === 'string' ? file.name : 'document.docx';
    const size = typeof file.size === 'number' ? file.size : 0;
    if (size > DEFAULT_MAX_BYTES) {
      set({ ...base(), status: 'error', fileName: name, errorCode: 'TOO_LARGE', errorMessage: tooLargeMessage(size, DEFAULT_MAX_BYTES) });
      return;
    }
    reading = true;
    set({ ...base(), status: 'reading', fileName: name });
    try {
      const buf = await file.arrayBuffer();
      const res = await readDocxText(buf);
      if (res.error) {
        set({ ...base(), status: 'error', fileName: name, errorCode: res.code, errorMessage: res.error });
        return;
      }
      payload = { text: res.text, paragraphs: res.paragraphs };
      docText = res.text;
      let previewHtml = null;
      if (typeof o.preview === 'function') {
        try {
          const r = o.preview(res.text);
          previewHtml = String(r && typeof r.then === 'function' ? await r : r);
        } catch { previewHtml = null; }
      }
      let warning = null;
      if (previewHtml == null) {
        previewHtml = defaultPreview(res.text);
        if (typeof o.preview === 'function') {
          warning = 'The document preview could not be rendered — the imported text is loaded below and nothing was lost.';
        }
      }
      set({ ...base(), status: 'ready', fileName: name, previewHtml, warning });
    } catch {
      set({ ...base(), status: 'error', fileName: name, errorMessage: 'The import failed while reading this file.' });
    } finally {
      reading = false;
    }
  }

  function onApply() {
    if (state.status !== 'ready' || docText === null) return;
    if (typeof o.apply !== 'function') {
      set({ ...state, warning: 'This demo wires no apply handler — nothing was applied.' });
      return;
    }
    try {
      o.apply(payload, docText);
    } catch {
      set({ ...state, warning: 'Applying the import failed — nothing was applied. The imported text is still below.' });
    }
  }

  render();
}
