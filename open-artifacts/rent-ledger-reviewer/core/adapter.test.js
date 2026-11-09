/** node:test adapter suite for rent-ledger-reviewer — class D DOCX-import wiring
 *  (Wave W5): ledger .docx TABLE → readDocxBlocks rows → TSV text → the demo's
 *  EXISTING tested parseLedgerTable path (the #csv paste box + #parse button).
 *  Run from repo root:
 *    node --test open-artifacts/rent-ledger-reviewer/core/adapter.test.js
 *
 *  Layers per the run's uniform TDD template (amended class D):
 *   1. SOURCE pins — the page must mount the shared control with the D1
 *      dynamic-import specifier beside the CSV/TSV box (reconC slot), capture the
 *      picked File for readDocxBlocks, and reach the ledger JSON ONLY through the
 *      existing #csv → #parse path. These fail before the wiring exists (RED driver).
 *   2. FUNCTIONAL — the page's [docx-import-wiring] block is extracted VERBATIM
 *      from demo/index.html and executed against a stub DOM with the real
 *      _shared/docx-import.js injected in place of the dynamic import; the page's
 *      existing [ledger-csv-wiring] handler (the unchanged #parse click handler,
 *      now marker-wrapped for extraction) is executed with the REAL frozen core's
 *      parseLedgerTable injected. A real .docx fixture WITH a ledger table
 *      (crafted OOXML package — docio's writeDocx cannot emit w:tbl) drives the
 *      full path: table → TSV → #csv → #parse → #input.ledger replaced, bad rows
 *      surfaced via ignoredRows — never silently dropped. Junk-file fail-closed,
 *      consent gate, and the no-table path are pinned too.
 * Fictional ledger; no network; no real DOM. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { writeDocx } from '../../_shared/docio.js';
import { readDocxBlocks } from '../../_shared/docx-import.js';
import { parseLedgerTable } from './core.js';

const PAGE = readFileSync(new URL('../demo/index.html', import.meta.url), 'utf8');
const SPECIFIER = '"../../_shared/docx-import.js"'; // D1-pinned dynamic-import specifier

/* ---------- DOM stub, same shape as _shared/docx-import.test.js ---------- */

class StubElement {
  constructor() { this._html = ''; this._kids = {}; this.handlers = {}; this.clicks = 0; this.files = null; this.disabled = false; this.value = ''; this.textContent = ''; }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this._kids = {}; }
  querySelector(sel) { if (!this._kids[sel]) this._kids[sel] = new StubElement(); return this._kids[sel]; }
  addEventListener(type, fn) { (this.handlers[type] ??= []).push(fn); }
  click() { this.clicks++; for (const f of this.handlers.click ?? []) f(); }
  fire(type) { for (const f of this.handlers[type] ?? []) f(); }
}

const settle = () => new Promise((r) => setTimeout(r, 15));
const unesc = (s) => String(s).replace(/&(amp|lt|gt|quot);/g, (_, k) => ({ amp: '&', lt: '<', gt: '>', quot: '"' }[k]));

function stubDom() {
  const els = {};
  for (const id of ['docxImportMount', 'input', 'run', 'err', 'csv', 'parse', 'out']) els[id] = new StubElement();
  els.input.value = JSON.stringify({ jurisdiction: 'DC', lease: { monthlyRent: 1400 }, ledger: [{ id: 99, date: '2025-12-01', type: 'rent', amount: 1400 }] }, null, 2);
  els.csv.value = '';
  return { els, mount: els.docxImportMount, document: { getElementById: (id) => els[id] ?? null } };
}

/** change on the file input BUBBLES to the mount (real-DOM semantics), which is
 *  how the page captures the File for readDocxBlocks. */
async function pickFile(el, file) {
  const input = el.querySelector('.docx-file-input');
  input.classList = { contains: (c) => c === 'docx-file-input' };
  input.files = [file];
  input.fire('change');
  for (const fn of el.handlers.change ?? []) fn({ target: input });
  await settle();
}

/** The rendered preview textarea's HTML content becomes the stub element's
 *  .value (what a user would see and edit). */
function syncTextarea(el, cls) {
  const m = new RegExp('<textarea class="' + cls + '"[^>]*>([\\s\\S]*?)</textarea>').exec(el.innerHTML);
  assert.ok(m, 'preview renders a .' + cls + ' textarea');
  const ta = el.querySelector('.' + cls);
  ta.value = unesc(m[1]);
  return ta;
}

const docxFile = (buf, name) => ({ name, size: buf.length, arrayBuffer: async () => new Uint8Array(buf).slice().buffer });

/* ---------- test-only zip builder + OOXML fixture (writeDocx cannot emit
   tables — verified: _shared/docio.js writeDocx maps paragraphs only) ---------- */

function crc32(u8) {
  let c = -1;
  for (let i = 0; i < u8.length; i++) {
    c ^= u8[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? -306674912 ^ (c >>> 1) : c >>> 1;
  }
  return ~c >>> 0;
}

function craftZip(files, method = 0) {
  const enc = new TextEncoder();
  const parts = [], cd = [];
  let off = 0;
  for (const [name, content] of files) {
    const raw = typeof content === 'string' ? enc.encode(content) : content;
    const data = method === 0 ? raw : raw; // STORE only — sufficient for fixtures
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
  const out = new Uint8Array(off + cdSize + 22);
  let o = 0;
  for (const p of [...parts, ...cd, eocd]) { out.set(p, o); o += p.length; }
  return out;
}

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const CT_TYPES = XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
const PKG_RELS = XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';

const xesc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const cell = (t) => '<w:tc><w:tcPr><w:tcW w:w="1800" w:type="dxa"/></w:tcPr><w:p><w:r><w:t xml:space="preserve">' + xesc(t) + '</w:t></w:r></w:p></w:tc>';
const trow = (cells) => '<w:tr>' + cells.map(cell).join('') + '</w:tr>';
const tbl = (rows) => '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid>' + rows[0].map(() => '<w:gridCol w:w="1800"/>').join('') + '</w:tblGrid>' + rows.map(trow).join('') + '</w:tbl>';
const para = (t) => '<w:p><w:r><w:t xml:space="preserve">' + xesc(t) + '</w:t></w:r></w:p>';

/* Fixture: a junk key/value table FIRST (no ledger columns — must lose the
   best-table selection), then the ledger table: valid rows, a $/comma amount,
   and ONE bad row (unparseable date) that must surface via ignoredRows. */
const LEDGER_ROWS = [
  ['id', 'date', 'type', 'amount', 'applied_to', 'note'],
  ['1', '2026-01-01', 'rent', '1,400.00', '', 'January rent'],
  ['2', '2026-01-03', 'payment', '$1,400.00', '', 'money order #4401 (fictional)'],
  ['3', '2026-02-05', 'late_fee', '70.00', '2026-02', 'February late fee'],
  ['4', 'not-a-date', 'misc_fee', '25.00', '', 'bad row — must be ignored, not dropped silently'],
];
const LEDGER_DOC = XML + '<w:document xmlns:w="' + W_NS + '"><w:body>'
  + para('RENT LEDGER — SOURCE EXTRACT (fictional)')
  + tbl([['Key', 'Value'], ['Prepared by', 'A. Landlord']])
  + tbl(LEDGER_ROWS)
  + '</w:body></w:document>';
const ledgerDocx = () => craftZip([['[Content_Types].xml', CT_TYPES], ['_rels/.rels', PKG_RELS], ['word/document.xml', LEDGER_DOC]]);

const EXPECTED_ENTRIES = [
  { id: 1, date: '2026-01-01', type: 'rent', amount: 1400, note: 'January rent' },
  { id: 2, date: '2026-01-03', type: 'payment', amount: 1400, note: 'money order #4401 (fictional)' },
  { id: 3, date: '2026-02-05', type: 'late_fee', amount: 70, appliedTo: '2026-02', note: 'February late fee' },
];
const LEDGER_TSV = LEDGER_ROWS.map((r) => r.join('\t')).join('\n');

/* ---------- extract + execute the page's actual wiring blocks ---------- */

function block(tag) {
  const START = `/* ---- [${tag}] ---- */`;
  const END = `/* ---- [/${tag}] ---- */`;
  const i = PAGE.indexOf(START);
  assert.ok(i >= 0, `demo/index.html must carry the [${tag}] block`);
  const j = PAGE.indexOf(END, i);
  assert.ok(j > i, `demo/index.html [${tag}] block must be closed`);
  return PAGE.slice(i, j + END.length);
}

/** Executes the page's DOCX wiring with the real shared module injected. */
async function runDocxWiring(document) {
  const wiring = block('docx-import-wiring');
  assert.equal(wiring.split(`import(${SPECIFIER})`).length - 1, 1, 'exactly one dynamic import, with the D1-pinned specifier');
  const shared = await import('../../_shared/docx-import.js');
  const injectable = wiring.replace(`import(${SPECIFIER})`, 'Promise.resolve(__SHARED__)');
  new Function('document', '__SHARED__', injectable)(document, shared);
  await settle();
}

/** Executes the page's EXISTING #parse handler (marker-wrapped, code unchanged)
 *  with the real frozen core parser + the page's element bindings injected. */
function runCsvWiring(document, els) {
  new Function('document', 'parseLedgerTable', '$input', '$err', '$csv', block('ledger-csv-wiring'))(
    document, parseLedgerTable, els.input, els.err, els.csv);
}

/* ---------- source pins (RED driver) ---------- */

test('page wiring pins: D1 specifier, mount beside the CSV box, delegated file capture, existing csv path intact', () => {
  assert.ok(PAGE.includes(`await import(${SPECIFIER})`), 'D1-pinned dynamic import specifier for open-artifacts demos');
  assert.ok(PAGE.includes('id="docxImportMount"'), 'mount element exists');
  assert.ok(PAGE.indexOf('id="csv"') < PAGE.indexOf('id="docxImportMount"'), 'mount sits beside (after) the CSV/TSV paste box — reconC slot');
  assert.ok(PAGE.indexOf('id="docxImportMount"') < PAGE.indexOf('id="out"'), 'mount stays inside the input column, above the results');
  assert.ok(PAGE.includes('readDocxBlocks'), 'class-D table reader called directly (F3b/D2)');
  assert.ok(/classList\.contains\(['"]docx-file-input['"]\)/.test(PAGE), 'delegated change listener captures the picked File for the block-wise re-read');
  assert.ok(PAGE.includes("$(\"parse\").click()") || PAGE.includes("$('parse').click()"), 'Apply routes through the EXISTING #parse path, not a copy of the parser');
  assert.ok(PAGE.includes('DOCX import is available on the hosted site'), 'D1 catch hint for unloadable shared module (file:// etc.)');
  assert.ok(!/import\s[^;]*from\s*"[^"]*docx-import\.js"/.test(PAGE), 'the shared module is never statically imported (build must not inline it)');
  assert.ok(block('ledger-csv-wiring').includes('parseLedgerTable($csv.value)'), 'the existing parse handler still runs the frozen parseLedgerTable');
});

test('page wiring pins: existing inputs and controls untouched', () => {
  for (const id of ['input', 'run', 'err', 'csv', 'parse', 'out']) {
    assert.ok(PAGE.includes(`id="${id}"`), `existing element #${id} untouched`);
  }
  assert.ok(PAGE.includes('aria-label="Ledger (JSON)"'), 'existing ledger textarea aria-label untouched');
  assert.ok(PAGE.includes('aria-label="Paste ledger table (CSV/TSV)"'), 'existing CSV/TSV textarea aria-label untouched');
});

/* ---------- functional: deterministic layer, unit level ---------- */

test('readDocxBlocks on the real fixture: best-mapped table wins; TSV → parseLedgerTable → entries + ignoredRows', async () => {
  const res = await readDocxBlocks(ledgerDocx());
  assert.equal(res.error, null, 'fixture reads cleanly through the shared block reader');
  const tables = res.blocks.filter((b) => b.type === 'table');
  assert.equal(tables.length, 2, 'fixture: junk key/value table + ledger table');
  const isLedger = (rows) => ['date', 'type', 'amount'].every((c) => rows[0].some((h) => h.trim().toLowerCase() === c));
  const ledger = tables.find((t) => isLedger(t.rows));
  assert.ok(ledger, 'the ledger table is identifiable by its header');
  const tsv = ledger.rows.map((r) => r.join('\t')).join('\n');
  assert.equal(tsv, LEDGER_TSV, 'rows join to the TSV the demo csv path expects');
  const p = parseLedgerTable(tsv);
  assert.deepEqual(p.entries, EXPECTED_ENTRIES, '$ and comma amounts parse; applied_to maps to appliedTo');
  assert.equal(p.ignoredRows.length, 1, 'the bad row surfaces');
  assert.match(p.ignoredRows[0].reason, /unparseable date "not-a-date"/, 'ignoredRows carry the reason — never silently dropped');
});

/* ---------- functional: wired control, full path ---------- */

test('real .docx with a ledger table → TSV preview; Apply → #csv filled → #parse runs → #input.ledger replaced; bad row surfaced', async () => {
  const dom = stubDom();
  const before = dom.els.input.value;
  await runDocxWiring(dom.document);
  runCsvWiring(dom.document, dom.els);
  await pickFile(dom.mount, docxFile(ledgerDocx(), 'ledger.docx'));

  assert.match(dom.mount.innerHTML, /ledger-tsv/, 'editable TSV textarea rendered');
  assert.match(dom.mount.innerHTML, /4 row\(s\)/, 'row count from the ledger table (4 data rows incl. the bad one; the parser ignores it with a reason)');
  assert.equal(dom.els.input.value, before, 'consent gate: the ledger JSON is untouched before the explicit Apply');
  assert.equal(dom.els.csv.value, '', 'the CSV box is untouched before Apply');

  const ta = syncTextarea(dom.mount, 'ledger-tsv');
  assert.equal(ta.value, LEDGER_TSV, 'preview carries exactly the deterministic table TSV');

  dom.mount.querySelector('.docx-apply-btn').click();
  assert.equal(dom.els.csv.value, LEDGER_TSV, 'Apply fills the EXISTING CSV/TSV box');
  assert.equal(dom.els.parse.clicks, 1, 'Apply clicks the EXISTING #parse button');
  const data = JSON.parse(dom.els.input.value);
  assert.deepEqual(data.ledger, EXPECTED_ENTRIES, 'the existing parse path replaced the ledger entries');
  assert.equal(data.jurisdiction, 'DC', 'everything outside ledger[] preserved');
  assert.match(dom.els.err.textContent, /Parsed 3 entries/, 'success message names the parsed count');
  assert.match(dom.els.err.textContent, /Ignored 1 row\(s\)/, 'ignoredRows surfaced to the user');
  assert.match(dom.els.err.textContent, /unparseable date/);
});

test('user-edited TSV in the preview is what lands in #csv (not the raw extraction)', async () => {
  const dom = stubDom();
  await runDocxWiring(dom.document);
  runCsvWiring(dom.document, dom.els);
  await pickFile(dom.mount, docxFile(ledgerDocx(), 'ledger.docx'));
  const ta = syncTextarea(dom.mount, 'ledger-tsv');
  const edited = ta.value.replace('not-a-date', '2026-02-20'); // the user fixes the bad row
  ta.value = edited;
  dom.mount.querySelector('.docx-apply-btn').click();
  assert.equal(dom.els.csv.value, edited, 'the EDITED TSV is applied');
  assert.equal(JSON.parse(dom.els.input.value).ledger.length, 4, 'the fixed row now parses');
  assert.equal(dom.els.parse.clicks, 1);
});

test('junk (non-docx) file → inline error, ledger JSON never fed garbage (fail-closed)', async () => {
  const dom = stubDom();
  const before = dom.els.input.value;
  await runDocxWiring(dom.document);
  await pickFile(dom.mount, { name: 'notes.txt', size: 30, arrayBuffer: async () => new TextEncoder().encode('plain prose, not a zip').buffer });
  assert.match(dom.mount.innerHTML, /docx-import-error/, 'friendly inline error, page never breaks');
  assert.equal(dom.els.input.value, before, 'ledger JSON untouched');
  assert.equal(dom.els.csv.value, '', 'CSV box untouched');
  assert.equal(dom.mount.querySelector('.docx-apply-btn').disabled, true, 'Apply stays disabled in the error state');
});

test('no-table .docx → honest no-table message + raw text preserved; Apply refused, nothing applied', async () => {
  const dom = stubDom();
  const before = dom.els.input.value;
  await runDocxWiring(dom.document);
  runCsvWiring(dom.document, dom.els);
  await pickFile(dom.mount, docxFile(writeDocx(['Prose-only ledger note.', 'No table anywhere.']), 'prose.docx'));
  assert.match(dom.mount.innerHTML, /No table found in this document/, 'honest no-table message');
  const m = /<textarea class="docx-import-text"[^>]*>([\s\S]*?)<\/textarea>/.exec(dom.mount.innerHTML);
  assert.ok(m, 'fallback textarea with the raw document text');
  assert.equal(unesc(m[1]), 'Prose-only ledger note.\nNo table anywhere.', 'text is never lost');
  dom.mount.querySelector('.docx-apply-btn').click();
  assert.match(dom.mount.innerHTML, /docx-import-warning/, 'Apply refused with a warning');
  assert.equal(dom.els.input.value, before, 'nothing applied on the no-table path');
  assert.equal(dom.els.parse.clicks, 0, 'the parse path never ran');
});
