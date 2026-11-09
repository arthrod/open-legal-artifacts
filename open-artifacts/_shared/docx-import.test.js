// docx-import.test.js — node:test suite for _shared/docx-import.js.
// Fixtures are REAL .docx archives: docio's writeDocx (STORE) and a crafted
// DEFLATE zip; the five error codes, the 5 MB guard, the pure renderImportUi
// output, and wireDocxImport behavior (via a minimal DOM stub — never a real
// browser) are pinned. A byte-parity test keeps the vendored docio read path
// honest. Fictional data; [verify] tags per fleet rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { writeDocx } from './docio.js';
import { readDocxText, renderImportUi, wireDocxImport, DEFAULT_MAX_BYTES } from './docx-import.js';

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

// --- test-only zip builder (supports arbitrary methods, unlike the writer) ---
function crc32(u8) {
  let c = -1;
  for (let i = 0; i < u8.length; i++) {
    c ^= u8[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? -306674912 ^ (c >>> 1) : c >>> 1;
  }
  return ~c >>> 0;
}

function craftZip(files, method) {
  const enc = new TextEncoder();
  const parts = [], cd = [];
  let off = 0;
  for (const [name, content] of files) {
    const raw = typeof content === 'string' ? enc.encode(content) : content;
    const data = method === 8 ? deflateRawSync(raw) : raw;
    const nb = enc.encode(name), crc = crc32(raw), lho = off;
    const lh = new Uint8Array(30), v = new DataView(lh.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(8, method, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, data.length, true);
    v.setUint32(22, raw.length, true);
    v.setUint16(26, nb.length, true);
    parts.push(lh, nb, data);
    off += 30 + nb.length + data.length;
    const c = new Uint8Array(46), u = new DataView(c.buffer);
    u.setUint32(0, 0x02014b50, true);
    u.setUint16(10, method, true);
    u.setUint32(16, crc, true);
    u.setUint32(20, data.length, true);
    u.setUint32(24, raw.length, true);
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
  e.setUint32(16, off, true);
  const all = [...parts, ...cd, eocd];
  const out = new Uint8Array(off + cdSize + 22);
  let o = 0;
  for (const p of all) { out.set(p, o); o += p.length; }
  return out;
}

function docXml(paras) {
  const body = paras
    .map((p) => '<w:p><w:r><w:t xml:space="preserve">' + p.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</w:t></w:r></w:p>')
    .join('');
  return XML + '<w:document xmlns:w="' + W_NS + '"><w:body>' + body + '</w:body></w:document>';
}

/** Turn a valid single-entry zip into a "liar": the central directory and local
 *  header claim a csize far past EOF, so the entry read hits the truncation
 *  path while the EOCD/CD structure itself stays parseable. */
function liarCsize(zip) {
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  assert.equal(dv.getUint32(0, true), 0x04034b50, 'fixture: local header at 0');
  const nlen = dv.getUint16(26, true);
  const csize = dv.getUint32(18, true);
  const cdStart = 30 + nlen + csize;
  const claim = csize + 4096;
  dv.setUint32(18, claim, true);
  dv.setUint32(cdStart + 20, claim, true);
  return zip;
}

/* ---------- readDocxText: happy paths ---------- */

test('readDocxText: happy path via real writeDocx fixture (STORE)', async () => {
  const paras = ['First paragraph.', 'Second — with émoji ☕ and <tag> & "quotes".'];
  const buf = writeDocx(paras);
  const res = await readDocxText(buf);
  assert.deepEqual(res, { text: paras.join('\n'), paragraphs: paras, error: null });
});

test('readDocxText: accepts ArrayBuffer and byte-offset Uint8Array views', async () => {
  const paras = ['Alpha', 'Beta'];
  const buf = new Uint8Array(writeDocx(paras)); // Buffer → copy as plain u8
  const padded = new Uint8Array(8 + buf.length); // non-zero byteOffset view
  padded.set(buf, 8);
  const view = padded.subarray(8);
  assert.equal(view.byteOffset, 8);
  const fromAb = await readDocxText(view.slice().buffer);
  const fromView = await readDocxText(view);
  assert.equal(fromAb.text, 'Alpha\nBeta');
  assert.equal(fromView.text, 'Alpha\nBeta');
});

test('readDocxText: DEFLATE-compressed archive (Node zlib inflate path)', async () => {
  const zip = craftZip([
    ['[Content_Types].xml', XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'],
    ['word/document.xml', docXml(['Deflated one', 'Deflated two', 'Deflated three'])],
  ], 8);
  const res = await readDocxText(zip);
  assert.equal(res.error, null);
  assert.deepEqual(res.paragraphs, ['Deflated one', 'Deflated two', 'Deflated three']);
  assert.equal(res.text, 'Deflated one\nDeflated two\nDeflated three');
});

/* ---------- readDocxText: the five error codes ---------- */

test('readDocxText: NOT_DOCX — plain text renamed .docx', async () => {
  const res = await readDocxText(new TextEncoder().encode('just some prose, definitely not a zip archive'));
  assert.equal(res.code, 'NOT_DOCX');
  assert.ok(typeof res.error === 'string' && res.error.length > 0, 'friendly message present');
  assert.equal(res.text, undefined, 'failure shape carries no text');
});

test('readDocxText: NOT_DOCX — valid zip with no word/document.xml', async () => {
  const zip = craftZip([['readme.txt', 'not a word document']], 0);
  const res = await readDocxText(zip);
  assert.equal(res.code, 'NOT_DOCX');
});

test('readDocxText: TRUNCATED — entry claims bytes past EOF', async () => {
  const zip = liarCsize(craftZip([['word/document.xml', docXml(['will not be read'])]], 0));
  const res = await readDocxText(zip);
  assert.equal(res.code, 'TRUNCATED');
  assert.match(res.error, /damaged|incomplete/i);
});

test('readDocxText: UNSUPPORTED — exotic compression method', async () => {
  const zip = craftZip([['word/document.xml', docXml(['bzip'])]], 12);
  const res = await readDocxText(zip);
  assert.equal(res.code, 'UNSUPPORTED');
});

test('readDocxText: EMPTY — readable docx with no text (scanned-image case)', async () => {
  const res = await readDocxText(writeDocx([]));
  assert.equal(res.code, 'EMPTY');
  assert.match(res.error, /paste/i, 'paste-instead affordance in the message');
  const blank = await readDocxText(writeDocx(['', '   ']));
  assert.equal(blank.code, 'EMPTY');
});

test('readDocxText: EMPTY on whitespace-only, but real text survives trimming-adjacent cases', async () => {
  const res = await readDocxText(writeDocx(['  real content  ']));
  assert.equal(res.error, null);
  assert.equal(res.text, '  real content  ', 'text is returned verbatim, not trimmed');
});

/* ---------- readDocxText: the 5 MB size guard ---------- */

test('readDocxText: TOO_LARGE — default 5 MB guard fires before parsing', async () => {
  assert.equal(DEFAULT_MAX_BYTES, 5 * 1024 * 1024, 'pinned 5 MB default');
  const res = await readDocxText(new Uint8Array(DEFAULT_MAX_BYTES + 1));
  assert.equal(res.code, 'TOO_LARGE');
  assert.match(res.error, /5\.0 MB/);
});

test('readDocxText: TOO_LARGE — custom maxBytes, and an exact-size buffer passes', async () => {
  const buf = writeDocx(['exactly at the cap']);
  const tooSmall = await readDocxText(buf, { maxBytes: buf.length - 1 });
  assert.equal(tooSmall.code, 'TOO_LARGE');
  assert.match(tooSmall.error, /import limit/);
  const atCap = await readDocxText(buf, { maxBytes: buf.length });
  assert.equal(atCap.error, null, 'boundary is inclusive: > maxBytes rejects, == passes');
});

test('readDocxText: never throws on hostile inputs', async () => {
  for (const bad of ['a string', null, undefined, 42, {}]) {
    const res = await readDocxText(bad);
    assert.equal(res.code, 'NOT_DOCX', 'non-buffer input maps to NOT_DOCX, no throw');
  }
});

/* ---------- renderImportUi: pure renderer ---------- */

test('renderImportUi: idle — file input, Import DOCX button, disabled Apply', () => {
  const html = renderImportUi({ title: 'Import the complaint', hint: 'Loads text from a .docx' });
  assert.match(html, /<section class="docx-import"/);
  assert.match(html, /<input type="file" class="docx-file-input" accept="\.docx"/);
  assert.match(html, /class="docx-import-btn"[^>]*>Import DOCX</);
  assert.match(html, /class="docx-apply-btn" disabled>Apply</);
  assert.match(html, /Import the complaint/);
  assert.match(html, /Loads text from a \.docx/);
});

test('renderImportUi: idle — default title when none given, no hint span', () => {
  const html = renderImportUi({ status: 'idle' });
  assert.match(html, /Import DOCX</);
  assert.ok(!html.includes('docx-import-hint'));
  assert.ok(!html.includes('docx-import-preview'), 'no empty preview panel before a file is read');
});

test('renderImportUi: ready — preview panel embedded, Apply enabled, warning shown', () => {
  const html = renderImportUi({ status: 'ready', fileName: 'contract.docx', previewHtml: '<b>PREVIEW</b>', warning: 'fell back' });
  assert.match(html, /<div class="docx-import-preview"><b>PREVIEW<\/b><\/div>/);
  assert.match(html, /class="docx-apply-btn">Apply</, 'Apply enabled');
  assert.ok(!html.includes('class="docx-apply-btn" disabled'));
  assert.match(html, /docx-import-warning.*fell back/);
  assert.match(html, /contract\.docx/);
});

test('renderImportUi: error — inline message, Apply disabled, everything escaped', () => {
  const html = renderImportUi({
    status: 'error',
    fileName: '<img src=x onerror=alert(1)>.docx',
    title: '<script>t</script>',
    errorMessage: 'This file is not a Word .docx document — bad <file> & "quotes"',
  });
  assert.ok(!html.includes('<img src=x'), 'hostile filename escaped');
  assert.ok(!html.includes('<script>'), 'hostile title escaped');
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;\.docx/);
  assert.match(html, /role="alert"/);
  assert.match(html, /This file is not a Word \.docx document/);
  assert.match(html, /class="docx-apply-btn" disabled/);
});

test('renderImportUi: reading — status line, both buttons gated', () => {
  const html = renderImportUi({ status: 'reading', fileName: 'big.docx' });
  assert.match(html, /Reading document…/);
  assert.match(html, /class="docx-import-btn" disabled/);
  assert.match(html, /class="docx-apply-btn" disabled/);
});

test('renderImportUi: garbage state never throws', () => {
  for (const bad of [null, undefined, 'nope', 42]) {
    const html = renderImportUi(bad);
    assert.match(html, /<section class="docx-import"/);
    assert.match(html, />Apply</);
  }
});

/* ---------- wireDocxImport: DOM-stub behavior ---------- */

class StubElement {
  constructor() { this._html = ''; this._kids = {}; this.handlers = {}; this.clicks = 0; this.files = null; this.disabled = false; this.value = ''; }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this._kids = {}; }
  querySelector(sel) { if (!this._kids[sel]) this._kids[sel] = new StubElement(); return this._kids[sel]; }
  addEventListener(type, fn) { (this.handlers[type] ??= []).push(fn); }
  click() { this.clicks++; for (const f of this.handlers.click ?? []) f(); }
  fire(type) { for (const f of this.handlers[type] ?? []) f(); }
}

const settle = () => new Promise((r) => setTimeout(r, 15));

function mount(opts) {
  const el = new StubElement();
  const calls = { preview: [], apply: [] };
  wireDocxImport(el, {
    ...opts,
    preview: opts?.preview ?? ((t) => { calls.preview.push(t); return '<i class="pv">' + calls.preview.length + '</i>'; }),
    apply: opts?.apply ?? ((payload, docText) => { calls.apply.push([payload, docText]); }),
  });
  return { el, calls };
}

async function pickFile(el, file) {
  const input = el.querySelector('.docx-file-input');
  input.files = [file];
  input.fire('change');
  await settle();
}

const docxFile = (paras, name = 'doc.docx') => {
  const buf = writeDocx(paras);
  return { name, size: buf.length, arrayBuffer: async () => new Uint8Array(buf).slice().buffer };
};

test('wireDocxImport: mounts the control and wires pick → file dialog, apply gated', () => {
  const { el, calls } = mount({});
  assert.match(el.innerHTML, /class="docx-import-btn"[^>]*>Import DOCX</);
  assert.equal(el.querySelector('.docx-apply-btn').disabled, true, 'Apply disabled at idle');
  el.querySelector('.docx-import-btn').fire('click');
  assert.ok(el.querySelector('.docx-file-input').clicks >= 1, 'pick button opens the file input');
  el.querySelector('.docx-apply-btn').fire('click');
  assert.equal(calls.apply.length, 0, 'Apply at idle is a no-op');
});

test('wireDocxImport: happy import → preview(docText), then apply(payload, docText)', async () => {
  const { el, calls } = mount({});
  await pickFile(el, docxFile(['Event one.', 'Event two.'], 'chronology.docx'));
  assert.deepEqual(calls.preview, ['Event one.\nEvent two.'], 'preview receives the document text');
  assert.match(el.innerHTML, /<i class="pv">1<\/i>/, 'preview HTML rendered');
  assert.match(el.innerHTML, /chronology\.docx/);
  assert.equal(el.querySelector('.docx-apply-btn').disabled, false, 'Apply enabled once ready');
  el.querySelector('.docx-apply-btn').fire('click');
  assert.equal(calls.apply.length, 1);
  const [payload, docText] = calls.apply[0];
  assert.equal(docText, 'Event one.\nEvent two.');
  assert.equal(payload.text, docText, 'payload is the readDocxText success value');
  assert.deepEqual(payload.paragraphs, ['Event one.', 'Event two.']);
});

test('wireDocxImport: promise-returning preview is awaited', async () => {
  const { el } = mount({ preview: (t) => Promise.resolve('<b>async-' + t.length + '</b>') });
  await pickFile(el, docxFile(['abc']));
  assert.match(el.innerHTML, /<b>async-3<\/b>/);
});

test('wireDocxImport: junk file → inline error, apply never fires, no crash', async () => {
  const { el, calls } = mount({});
  await pickFile(el, { name: 'essay.txt', size: 30, arrayBuffer: async () => new TextEncoder().encode('not a zip at all, just words').buffer });
  assert.match(el.innerHTML, /docx-import-error/);
  assert.match(el.innerHTML, /not a Word \.docx/);
  el.querySelector('.docx-apply-btn').fire('click');
  assert.equal(calls.apply.length, 0, 'fail-closed: apply is unreachable in error state');
});

test('wireDocxImport: client-side size guard rejects before reading the file', async () => {
  const { el } = mount({});
  let read = false;
  await pickFile(el, { name: 'huge.docx', size: DEFAULT_MAX_BYTES + 1, arrayBuffer: async () => { read = true; return new ArrayBuffer(0); } });
  assert.equal(read, false, 'oversized file never enters arrayBuffer()');
  assert.match(el.innerHTML, /TOO_LARGE|import limit/);
  assert.match(el.innerHTML, /huge\.docx/);
});

test('wireDocxImport: EMPTY docx → paste-instead message', async () => {
  const { el } = mount({});
  await pickFile(el, docxFile(['   '], 'scan.docx'));
  assert.match(el.innerHTML, /paste/i);
});

test('wireDocxImport: throwing preview falls back to an editable textarea — text is never lost', async () => {
  const { el, calls } = mount({ preview: () => { throw new Error('boom'); } });
  await pickFile(el, docxFile(['Recoverable text.'], 'ok.docx'));
  assert.match(el.innerHTML, /docx-import-warning/);
  assert.match(el.innerHTML, /<textarea[^>]*>Recoverable text\.<\/textarea>/, 'default editable preview carries the text');
  el.querySelector('.docx-apply-btn').fire('click');
  assert.equal(calls.apply.length, 1, 'Apply still works after a preview failure');
  assert.equal(calls.apply[0][1], 'Recoverable text.');
});

test('wireDocxImport: throwing apply shows a warning, keeps the preview, no crash', async () => {
  const { el } = mount({ preview: (t) => '<pre class="raw">' + t + '</pre>', apply: () => { throw new Error('kaput'); } });
  await pickFile(el, docxFile(['Still here.']));
  el.querySelector('.docx-apply-btn').fire('click');
  assert.match(el.innerHTML, /docx-import-warning/);
  assert.match(el.innerHTML, /<pre class="raw">Still here\.<\/pre>/, 'imported text stays on screen — no silent data loss');
});

test('wireDocxImport: a second change during an in-flight read is ignored', async () => {
  const { el } = mount({});
  await pickFile(el, { name: 'hanging.docx', size: 100, arrayBuffer: () => new Promise(() => {}) });
  let second = false;
  const input = el.querySelector('.docx-file-input');
  input.files = [{ name: 'junk.docx', size: 10, arrayBuffer: async () => { second = true; return new ArrayBuffer(10); } }];
  input.fire('change');
  await settle();
  assert.equal(second, false, 'no concurrent read');
  assert.match(el.innerHTML, /Reading document…/);
});

test('wireDocxImport: change with no selected file is a no-op', async () => {
  const { el } = mount({});
  const input = el.querySelector('.docx-file-input');
  input.files = [];
  input.fire('change');
  await settle();
  assert.match(el.innerHTML, /Import DOCX</);
  assert.ok(!el.innerHTML.includes('docx-import-error'));
});

test('wireDocxImport: hostile mounts never throw', () => {
  wireDocxImport(null, {});
  wireDocxImport(undefined, undefined);
  wireDocxImport({}, {});
  const el = new StubElement();
  wireDocxImport(el, null);
  assert.match(el.innerHTML, /Import DOCX</, 'null opts still mounts a sane control');
});

/* ---------- vendoring honesty: the read path is docio, byte-verbatim ---------- */

test('vendored read path in docx-import.js is byte-identical to docio.js', () => {
  const docio = readFileSync(new URL('./docio.js', import.meta.url), 'utf8');
  const mod = readFileSync(new URL('./docx-import.js', import.meta.url), 'utf8');
  const between = (src, start, end) => {
    const i = src.indexOf(start);
    assert.ok(i >= 0, 'docio.js marker: ' + start);
    const j = src.indexOf(end, i);
    assert.ok(j >= 0, 'docio.js end marker: ' + end);
    return src.slice(i, j).trim();
  };
  const segments = [
    between(docio, 'const IS_NODE =', '\n'),
    between(docio, 'function unsupported(detail) {', 'const encodeXml = (s)'),
    between(docio, 'let nodeInflateRaw = null;', '// ---------- docx read'),
    between(docio, '// ---------- docx read', '// ---------- xlsx read'),
  ];
  for (const seg of segments) {
    assert.ok(seg.length > 50, 'segment extracted, not empty');
    assert.ok(mod.includes(seg), 'docx-import.js must contain docio.js read-path segment verbatim (re-vendor after editing docio.js): ' + seg.slice(0, 60) + '…');
  }
});
