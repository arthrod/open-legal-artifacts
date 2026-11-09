/** node:test adapter suite for venture-term-sheet-benchmark — class T DOCX-import
 * wiring (Wave W6a). Run: node --test core/adapter.test.js
 *
 * Two-layer contract per the run's uniform TDD template (amended class T —
 * coordinator adjudication: this artifact is T, not O):
 *  1. SOURCE pins — the demo page must mount the shared control with the D1
 *     dynamic-import specifier and an apply that fills the "Or paste the term
 *     sheet" box (#paste); the existing #capture button stays untouched (the
 *     deterministic keyword capture runs as-is after the fill). These fail
 *     before the wiring exists (RED) and pin it after.
 *  2. FUNCTIONAL mirror — a real .docx fixture (docio writeDocx) through the
 *     shared readDocxText/wireDocxImport (DOM-stub pattern from
 *     open-artifacts/_shared/docx-import.test.js) with an apply closure
 *     mirroring the page's, asserting the fill, the consent gate (nothing is
 *     applied before the explicit Apply), and the fail-closed junk-file path.
 * The mirror is kept honest by pin 1: if the page's apply line changes, the
 * pin fails and forces this file along.
 * Fictional data; no network; no real DOM. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { writeDocx } from '../../_shared/docio.js';
import { readDocxText, wireDocxImport } from '../../_shared/docx-import.js';

const PAGE = readFileSync(new URL('../demo/index.html', import.meta.url), 'utf8');

/* --- DOM stub, same shape as open-artifacts/_shared/docx-import.test.js --- */
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

const docxFile = (paras, name) => {
  const buf = writeDocx(paras);
  return { name, size: buf.length, arrayBuffer: async () => new Uint8Array(buf).slice().buffer };
};

async function pickFile(el, file) {
  const input = el.querySelector('.docx-file-input');
  input.files = [file];
  input.fire('change');
  await settle();
}

const TERMS = [
  'Term sheet (fictional) — Series A',
  '1.5x non-participating liquidation preference; broad-based weighted average anti-dilution.',
  'Two investor board seats; pro rata rights granted to all investors; non-cumulative dividends.',
];

/* ---------- source pins (RED driver) ---------- */

test('page wiring pins: D1 dynamic import specifier, mount above #paste, apply fill, capture untouched', () => {
  assert.ok(
    PAGE.includes('await import("../../_shared/docx-import.js")'),
    'D1-pinned dynamic import specifier for open-artifacts demos',
  );
  assert.ok(PAGE.includes('id="docx-import"'), 'mount element exists');
  assert.ok(
    PAGE.indexOf('id="docx-import"') < PAGE.indexOf('<textarea id="paste"'),
    'the control sits above the paste box it fills',
  );
  assert.ok(
    PAGE.includes("$('paste').value = payload.text;"),
    "the page's apply fills #paste with the imported text",
  );
  assert.ok(
    PAGE.includes('DOCX import is available on the hosted site'),
    'D1 catch hint rendered when the shared module cannot load (file:// etc.)',
  );
  assert.ok(
    PAGE.includes('id="capture"'),
    'the existing Capture into form button is untouched — the deterministic keyword capture runs as-is',
  );
});

/* ---------- functional mirror ---------- */

test('real .docx fixture → consent-gated apply fills #paste', async () => {
  const res = await readDocxText(writeDocx(TERMS));
  assert.equal(res.error, null, 'fixture reads cleanly through the shared reader');
  assert.deepEqual(res.paragraphs, TERMS);

  const target = { value: '' };
  const el = new StubElement();
  wireDocxImport(el, {
    title: 'Import DOCX',
    hint: 'Loads term-sheet text from a .docx into the paste box — “Capture into form →” then works as usual',
    apply: (payload) => { target.value = payload.text; }, // mirrors the page's apply
  });
  await pickFile(el, docxFile(TERMS, 'term-sheet.docx'));
  assert.equal(target.value, '', 'consent gate: the paste box is not touched before the explicit Apply');
  el.querySelector('.docx-apply-btn').fire('click');
  assert.equal(target.value, TERMS.join('\n'), 'apply fills #paste with the document text');
});

test('junk file → inline error, #paste never fed garbage', async () => {
  const target = { value: '1.5x non-participating liquidation preference' };
  const el = new StubElement();
  wireDocxImport(el, { apply: (payload) => { target.value = payload.text; } });
  await pickFile(el, {
    name: 'not-really.docx', size: 21,
    arrayBuffer: async () => new TextEncoder().encode('definitely not a zip').buffer,
  });
  assert.match(el.innerHTML, /docx-import-error/, 'friendly inline error, page never breaks');
  el.querySelector('.docx-apply-btn').fire('click');
  assert.equal(target.value, '1.5x non-participating liquidation preference', 'fail-closed: apply unreachable in error state');
});
