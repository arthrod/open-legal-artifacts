/** node:test adapter suite for ai-use-case-inventory — class D DOCX-import
 *  wiring (Wave W6b): inventory .docx TABLE → readDocxBlocks rows → records[]
 *  JSON → #input. Run from repo root:
 *    node --test open-artifacts/ai-use-case-inventory/core/adapter.test.js
 *
 *  Two layers per the run's uniform TDD template (amended class D):
 *   1. SOURCE pins — the page must mount the shared control with the D1
 *      dynamic-import specifier, capture the picked File for readDocxBlocks
 *      (D2 pins wireDocxImport's payload to readDocxText, so the D adapter
 *      re-reads the file block-wise via a delegated change listener on the
 *      mount), and fill #input only on the explicit Apply. These fail before
 *      the wiring exists (RED driver).
 *   2. FUNCTIONAL — the page's deterministic table→records transform is
 *      extracted VERBATIM from demo/index.html between the inv-table-transform
 *      markers and executed here (marker extraction is the fleet's established
 *      pattern — cf. _shared/docx-import.test.js's vendoring-honesty test), so
 *      these tests always run the shipped code, never a drifted copy. A real
 *      .docx fixture WITH tables (crafted OOXML package — docio's writeDocx
 *      cannot emit w:tbl, verified against _shared/docio.js) drives
 *      readDocxBlocks → best-mapped table → transform → expected records[] →
 *      the frozen core's buildInventory consumes them. Unmappable rows and
 *      unrecognized enum values surface as flags — never guessed. Consent
 *      gate, junk-file fail-closed, and the no-table path are pinned too.
 * Fictional data; no network; no real DOM. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { writeDocx } from '../../_shared/docio.js';
import { readDocxBlocks, wireDocxImport } from '../../_shared/docx-import.js';
import { buildInventory, ROLES } from './core.js';

const PAGE = readFileSync(new URL('../demo/index.html', import.meta.url), 'utf8');

/* ---------- extract the page's transform (single source of truth) ---------- */

const MARK_START = '/* inv-table-transform —';
const MARK_END = '/* end inv-table-transform */';

/** Runs the page's marker block: keep that block self-contained in the page
 *  (no references to page scope) or this extraction fails loudly. */
function pageTransform() {
  const i = PAGE.indexOf(MARK_START);
  assert.ok(i >= 0, 'page defines the inv-table-transform block (marker: ' + MARK_START + ')');
  const j = PAGE.indexOf(MARK_END, i);
  assert.ok(j > i, 'inv-table-transform block is closed (marker: ' + MARK_END + ')');
  const src = PAGE.slice(i, j + MARK_END.length);
  return new Function(src + '\n;return { INV_ENUMS, INV_HEADERS, invNorm, invHeaderKey, invMappedCount, invTableToRecords };')();
}

/* ---------- DOM stub, same shape as _shared/docx-import.test.js ---------- */

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

const unesc = (s) => String(s).replace(/&(amp|lt|gt|quot);/g, (_, k) => ({ amp: '&', lt: '<', gt: '>', quot: '"' }[k]));

/** Simulate the browser: the rendered preview textarea's HTML content becomes
 *  the stub element's .value (what a user would see and edit). */
function syncTextarea(el, cls) {
  const m = new RegExp('<textarea class="' + cls + '"[^>]*>([\\s\\S]*?)</textarea>').exec(el.innerHTML);
  assert.ok(m, 'preview renders a .' + cls + ' textarea');
  const ta = el.querySelector('.' + cls);
  ta.value = unesc(m[1]);
  return ta;
}

/** change on the file input BUBBLES to the mount (real-DOM semantics), which
 *  is how the page captures the File for readDocxBlocks. The stub input gets
 *  a classList because the real <input class="docx-file-input"> has one — the
 *  page's defensive e.target.classList check depends on it. */
async function pickFileBubble(el, file) {
  const input = el.querySelector('.docx-file-input');
  input.classList = { contains: (c) => c === 'docx-file-input' };
  input.files = [file];
  input.fire('change');
  for (const fn of el.handlers.change ?? []) fn({ target: input });
  await settle();
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

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const CT_TYPES = XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
const PKG_RELS = XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';

const xesc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const cell = (t) => '<w:tc><w:tcPr><w:tcW w:w="1800" w:type="dxa"/></w:tcPr><w:p><w:r><w:t xml:space="preserve">' + xesc(t) + '</w:t></w:r></w:p></w:tc>';
const trow = (cells) => '<w:tr>' + cells.map(cell).join('') + '</w:tr>';
const tbl = (rows) => '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid>' + rows[0].map(() => '<w:gridCol w:w="1800"/>').join('') + '</w:tblGrid>' + rows.map(trow).join('') + '</w:tbl>';
const para = (t) => '<w:p><w:r><w:t xml:space="preserve">' + xesc(t) + '</w:t></w:r></w:p>';

/* Fixture: a junk key/value table FIRST (zero mapped columns — must lose the
   best-mapped-table selection), then the inventory table whose header uses
   WORDING that differs from the core's field names (exercises the documented
   mapping), including an unrecognized autonomy value, an unmapped column, and
   an unmappable row. Fictional data. */
const INVENTORY_ROWS = [
  ['Use case ID', 'Use case', 'Description', 'Data sensitivity', 'Human oversight', 'Autonomy', 'Department', 'Owner', 'Next review', 'Risk owner'],
  ['AI-01', 'Client intake helper', 'Customer-facing assistant chatbot answering intake questions', 'Confidential', 'Human in Loop', 'Draft with Review', 'Sales', 'K. Kowalski', '2027-01-15', 'R. Vader'],
  ['AI-02', 'Grid-stability predictor', 'Power grid dispatch recommendations for the regional utility control room', 'Internal', 'Human decides', 'draft-with-review', 'Energy', 'D. Haugen', '2026-11-25', 'R. Vader'],
  ['AI-03', 'Talent screen', 'CV screening and candidate ranking for engineering roles', 'Personal', 'Notify', 'Fully automatic', 'People', 'L. Byrne', '', 'R. Vader'],
  ['AI-04', '', 'purpose without a name', 'Public', 'Notify', 'Assist', '', '', '', ''],
];
const INVENTORY_DOC = XML + '<w:document xmlns:w="' + W_NS + '"><w:body>'
  + para('AI Use Case Inventory — Q4 2026 (fictional)')
  + tbl([['Key', 'Value'], ['Prepared by', 'A. Assessor']])
  + tbl(INVENTORY_ROWS)
  + '</w:body></w:document>';
const inventoryDocx = () => craftZip([['[Content_Types].xml', CT_TYPES], ['_rels/.rels', PKG_RELS], ['word/document.xml', INVENTORY_DOC]], 0);

const EXPECTED_RECORDS = [
  { id: 'AI-01', name: 'Client intake helper', purpose: 'Customer-facing assistant chatbot answering intake questions', dataSensitivity: 'confidential', humanOversight: 'human-in-loop', autonomy: 'draft-with-review', department: 'Sales', owner: 'K. Kowalski', nextReview: '2027-01-15' },
  { id: 'AI-02', name: 'Grid-stability predictor', purpose: 'Power grid dispatch recommendations for the regional utility control room', dataSensitivity: 'internal', humanOversight: 'human-decides', autonomy: 'draft-with-review', department: 'Energy', owner: 'D. Haugen', nextReview: '2026-11-25' },
  { id: 'AI-03', name: 'Talent screen', purpose: 'CV screening and candidate ranking for engineering roles', dataSensitivity: 'personal', humanOversight: 'notify', autonomy: 'Fully automatic', department: 'People', owner: 'L. Byrne' },
];

/* ---------- source pins (RED driver) ---------- */

test('page wiring pins: D1 specifier, mount, delegated file capture, readDocxBlocks, apply fill, hosted-site hint, existing input intact', () => {
  assert.ok(PAGE.includes('await import("../../_shared/docx-import.js")'), 'D1-pinned dynamic import specifier for open-artifacts demos');
  assert.ok(PAGE.includes('id="docx-import"'), 'mount element exists');
  assert.ok(PAGE.includes("title: 'Import inventory table'"), 'reconC slot title');
  assert.ok(PAGE.includes('readDocxBlocks'), 'class-D table reader called directly (F3b/D2)');
  assert.ok(PAGE.includes("classList.contains('docx-file-input')"), 'delegated change listener captures the picked File for the block-wise re-read');
  assert.ok(PAGE.includes("invMount.querySelector('.inv-records')"), 'apply reads the user-edited preview textarea from the mount');
  assert.ok(PAGE.includes("$('input').value = ta.value;"), 'apply fills the existing records-JSON input');
  assert.ok(PAGE.includes('DOCX import is available on the hosted site'), 'D1 catch hint for unloadable shared module (file:// etc.)');
  assert.ok(PAGE.indexOf(MARK_START) >= 0 && PAGE.indexOf(MARK_END) > PAGE.indexOf(MARK_START), 'transform block markers present');
  assert.ok(PAGE.includes('aria-label="Use-case records (JSON)"'), 'existing records textarea is untouched by the wiring');
  assert.ok(PAGE.includes('id="run"'), 'existing run button is untouched by the wiring');
});

test('INV_ENUMS (extracted from the page) matches the frozen core — roles deep-equal, enum sets per the core typedef', () => {
  const T = pageTransform();
  assert.deepEqual(T.INV_ENUMS.role, ROLES, 'role enum must be the core\'s ROLES export, verbatim');
  assert.deepEqual(T.INV_ENUMS.dataSensitivity, ['public', 'internal', 'confidential', 'personal', 'special-category']);
  assert.deepEqual(T.INV_ENUMS.humanOversight, ['none', 'notify', 'human-in-loop', 'human-decides']);
  assert.deepEqual(T.INV_ENUMS.autonomy, ['assist', 'draft-with-review', 'act-with-review', 'autonomous']);
  assert.deepEqual(T.INV_ENUMS.status, ['planned', 'pilot', 'production', 'retired']);
});

/* ---------- functional: the extracted page transform, unit level ---------- */

test('invTableToRecords (extracted page code): documented mapping normalizes enums, keeps unknown values verbatim, flags everything', () => {
  const T = pageTransform();
  const { records, flags } = T.invTableToRecords([
    ['ID', 'Name', 'Purpose', 'Data sensitivity', 'Human oversight', 'Autonomy', 'Role', 'EU nexus', 'Existing controls', 'Substantial modification'],
    ['X-1', 'N', 'P', 'Special Category', 'Human-Decides', 'ACT WITH REVIEW', 'Authorised Representative', 'Yes', 'DPA signed; model card', 'No'],
    ['X-2', 'N2', 'P2', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', ''],
  ]);
  assert.deepEqual(records, [
    { id: 'X-1', name: 'N', purpose: 'P', dataSensitivity: 'special-category', humanOversight: 'human-decides', autonomy: 'act-with-review', role: 'authorised-representative', euNexus: true, existingControls: ['DPA signed', 'model card'], substantialModification: false },
    { id: 'X-2', name: 'N2', purpose: 'P2' },
  ], 'enum cells normalize to core enum forms; unknown/empty cells never guess');
  assert.equal(flags.length, 3, 'X-2 flags each missing REQUIRED enum; the blank row is skipped silently');
  assert.match(flags[0], /X-2.*missing required dataSensitivity/);
  assert.match(flags[1], /X-2.*missing required humanOversight/);
  assert.match(flags[2], /X-2.*missing required autonomy/);
});

test('invTableToRecords (extracted page code): unrecognized enums and unmappable rows surface as flags, values kept verbatim', () => {
  const T = pageTransform();
  const { records, flags } = T.invTableToRecords(INVENTORY_ROWS);
  assert.deepEqual(records, EXPECTED_RECORDS);
  assert.equal(flags.length, 3);
  assert.equal(flags[0], 'Column "Risk owner" is not mapped to a record field — its cells are ignored.');
  assert.equal(flags[1], 'Row 4: unrecognized autonomy "Fully automatic" — kept verbatim; expected one of: assist, draft-with-review, act-with-review, autonomous.');
  assert.match(flags[2], /^Row 5 is not mappable \(needs id, name and purpose\) — not imported:/);
  assert.ok(flags[2].includes('AI-04'), 'the unmappable row\'s raw cells are surfaced, nothing is silently dropped');
});

/* ---------- functional: wired control (mirror of the page's glue) ---------- */

/** Mirrors the page's preview/apply closures (drift-guarded by the source
 *  pins above). `captured` stands in for the page's invFile. */
function mountMirror(target, T) {
  const el = new StubElement();
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let captured = null;
  el.addEventListener('change', (e) => {
    if (e.target && e.target.classList && e.target.classList.contains('docx-file-input')) captured = (e.target.files && e.target.files[0]) || null;
  });
  wireDocxImport(el, {
    title: 'Import inventory table',
    hint: 'Reads a .docx table into records JSON — review the flags, then Apply',
    preview: async () => {
      if (!captured) throw new Error('no captured file');
      const res = await readDocxBlocks(await captured.arrayBuffer());
      if (res.error) throw new Error(res.error);
      const tables = res.blocks.filter((b) => b.type === 'table');
      if (!tables.length) return '<p class="docx-import-warning">No table found in this document — this import reads an inventory table (prose inventories are not extracted). The document text is below so nothing is lost.</p><textarea class="docx-import-text" rows="8" style="width:100%;box-sizing:border-box">' + esc(res.text) + '</textarea>';
      let best = 0;
      for (let t = 1; t < tables.length; t++) if (T.invMappedCount(tables[t].rows) > T.invMappedCount(tables[best].rows)) best = t;
      const out = T.invTableToRecords(tables[best].rows);
      // flags render as element text content — quotes stay literal (browser innerHTML serialization)
      const escText = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
      return (out.flags.length ? '<div class="gap" style="margin:0 0 8px">' + out.flags.map((f) => '<div class="gap">⚠ ' + escText(f) + '</div>').join('') + '</div>' : '')
        + '<p class="muted">' + out.records.length + ' record(s) extracted' + (tables.length > 1 ? ' from the best-mapped of ' + tables.length + ' tables' : '') + ' · ' + out.flags.length + ' flag(s) — fix flagged values in the JSON below, then Apply.</p>'
        + '<textarea class="inv-records" rows="14" style="width:100%;box-sizing:border-box;font-family:var(--font-mono);font-size:12px">' + esc(JSON.stringify(out.records, null, 2)) + '</textarea>';
    },
    apply: () => {
      const ta = el.querySelector('.inv-records');
      const edited = JSON.parse(ta.value);
      if (!Array.isArray(edited) || !edited.length) throw new Error('no records to apply');
      target.value = ta.value;
    },
  });
  return el;
}

test('real .docx with tables → readDocxBlocks → best-mapped table wins → records preview; consent-gated Apply fills #input; frozen core consumes', async () => {
  const T = pageTransform();
  const res = await readDocxBlocks(inventoryDocx());
  assert.equal(res.error, null, 'fixture reads cleanly through the shared block reader');
  const tables = res.blocks.filter((b) => b.type === 'table');
  assert.equal(tables.length, 2, 'fixture: junk table + inventory table');
  assert.equal(T.invMappedCount(tables[0].rows), 0, 'junk table maps no columns');
  assert.equal(T.invMappedCount(tables[1].rows), 9, 'inventory table maps 9 of its 10 columns');

  const target = { value: 'PRE-EXISTING RECORDS' };
  const el = mountMirror(target, T);
  await pickFileBubble(el, docxFile(inventoryDocx(), 'inventory.docx'));
  assert.match(el.innerHTML, /inv-records/, 'editable records JSON rendered');
  assert.match(el.innerHTML, /3 record\(s\) extracted from the best-mapped of 2 tables/, 'best-mapped table won over the first (junk) table');
  assert.match(el.innerHTML, /unrecognized autonomy "Fully automatic"/, 'unknown enum value flagged in the preview');
  assert.match(el.innerHTML, /Risk owner" is not mapped/, 'unmapped column flagged');
  assert.equal(target.value, 'PRE-EXISTING RECORDS', 'consent gate: #input is not touched before the explicit Apply');

  const ta = syncTextarea(el, 'inv-records');
  assert.deepEqual(JSON.parse(ta.value), EXPECTED_RECORDS, 'preview carries exactly the deterministic records');

  el.querySelector('.docx-apply-btn').fire('click');
  assert.deepEqual(JSON.parse(target.value), EXPECTED_RECORDS, 'Apply fills the records-JSON input');

  const inv = buildInventory(JSON.parse(target.value));
  assert.equal(inv.counts.limited, 1, 'AI-01 chatbot purpose → limited tier');
  assert.equal(inv.counts.high, 2, 'AI-02 grid + AI-03 cv screening → high tier');
  assert.equal(inv.counts.minimal, 0);
  const ai01 = inv.items.find((i) => i.record.id === 'AI-01');
  assert.equal(ai01.tier, 'limited');
  assert.equal(ai01.basis.ruleId, 'transparency-chatbot');
});

test('user-edited preview values are what Apply applies (not the original extraction)', async () => {
  const T = pageTransform();
  const target = { value: '' };
  const el = mountMirror(target, T);
  await pickFileBubble(el, docxFile(inventoryDocx(), 'inventory.docx'));
  const ta = syncTextarea(el, 'inv-records');
  const edited = JSON.parse(ta.value);
  edited[0].dataSensitivity = 'special-category'; // the user fixes a flagged/na value in the preview
  ta.value = JSON.stringify(edited, null, 2);
  el.querySelector('.docx-apply-btn').fire('click');
  assert.equal(JSON.parse(target.value)[0].dataSensitivity, 'special-category', 'the EDITED value lands in #input');
});

test('junk file → inline error, #input never fed garbage (fail-closed)', async () => {
  const T = pageTransform();
  const target = { value: 'PRE-EXISTING RECORDS' };
  const el = mountMirror(target, T);
  await pickFileBubble(el, { name: 'not-really.docx', size: 21, arrayBuffer: async () => new TextEncoder().encode('definitely not a zip').buffer });
  assert.match(el.innerHTML, /docx-import-error/, 'friendly inline error, page never breaks');
  el.querySelector('.docx-apply-btn').fire('click');
  assert.equal(target.value, 'PRE-EXISTING RECORDS', 'apply is unreachable in error state — nothing applied');
});

test('no-table .docx → explicit no-table flag + raw text preserved; Apply refuses, #input untouched', async () => {
  const T = pageTransform();
  const target = { value: 'PRE-EXISTING RECORDS' };
  const el = mountMirror(target, T);
  await pickFileBubble(el, docxFile(writeDocx(['Prose-only inventory note.', 'No table anywhere.']), 'prose.docx'));
  assert.match(el.innerHTML, /No table found in this document/, 'honest no-table message');
  const m = /<textarea class="docx-import-text"[^>]*>([\s\S]*?)<\/textarea>/.exec(el.innerHTML);
  assert.ok(m, 'fallback textarea with the raw document text');
  assert.equal(unesc(m[1]), 'Prose-only inventory note.\nNo table anywhere.', 'text is never lost');
  el.querySelector('.docx-apply-btn').fire('click');
  assert.match(el.innerHTML, /docx-import-warning/, 'Apply refused with a warning');
  assert.equal(target.value, 'PRE-EXISTING RECORDS', 'nothing applied on the no-table path');
});
