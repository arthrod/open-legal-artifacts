/** node:test adapter suite for client-intake (demo page) — class T DOCX-import
 * wiring (Wave W6a). Run: node --test core/adapter.test.js
 *
 * The demo page is a flow app (boots a worked example at the review step; the
 * start step with the narrative box is one click away). Per the W6a brief the
 * import is wired into the start step's narrative input (#f-narrative) — the
 * decision is pinned below by an ordering assertion (mount inside #s-start,
 * above the textarea).
 *
 * Two-layer contract per the run's uniform TDD template (amended class T):
 *  1. SOURCE pins — the page must mount the shared control with the D1
 *     dynamic-import specifier for artifacts/ originals and an apply that
 *     fills #f-narrative. These fail before the wiring exists (RED) and pin
 *     it after.
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
import { writeDocx } from '../../../open-artifacts/_shared/docio.js';
import { readDocxText, wireDocxImport } from '../../../open-artifacts/_shared/docx-import.js';

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

const NARRATIVE = [
  'My landlord is trying to evict me after I withheld part of one rent payment because repairs were ignored for months.',
  'There is a court date on 2026-11-18. I want to stay in my apartment.',
];

/* ---------- source pins (RED driver) ---------- */

test('page wiring pins: D1 specifier, mount in the start step above #f-narrative, apply fill', () => {
  assert.ok(
    PAGE.includes('await import("../../../open-artifacts/_shared/docx-import.js")'),
    'D1-pinned dynamic import specifier for artifacts/ originals demos',
  );
  assert.ok(PAGE.includes('id="docx-import"'), 'mount element exists');
  const iStart = PAGE.indexOf('id="s-start"');
  const iMount = PAGE.indexOf('id="docx-import"');
  const iNarr = PAGE.indexOf('id="f-narrative"');
  assert.ok(iStart >= 0 && iMount > iStart, 'mount lives inside the start step (#s-start)');
  assert.ok(iNarr > iMount, 'mount sits above the narrative textarea it fills');
  assert.ok(
    PAGE.includes("$('f-narrative').value = payload.text;"),
    "the page's apply fills #f-narrative with the imported text",
  );
  assert.ok(
    PAGE.includes('DOCX import is available on the hosted site'),
    'D1 catch hint rendered when the shared module cannot load (file:// etc.)',
  );
});

/* ---------- functional mirror ---------- */

test('real .docx fixture → consent-gated apply fills #f-narrative', async () => {
  const res = await readDocxText(writeDocx(NARRATIVE));
  assert.equal(res.error, null, 'fixture reads cleanly through the shared reader');
  assert.deepEqual(res.paragraphs, NARRATIVE);

  const target = { value: 'pre-existing narrative' };
  const el = new StubElement();
  wireDocxImport(el, {
    title: 'Import DOCX',
    hint: 'Loads the matter description from a .docx into the narrative box',
    apply: (payload) => { target.value = payload.text; }, // mirrors the page's apply
  });
  await pickFile(el, docxFile(NARRATIVE, 'matter.docx'));
  assert.equal(
    target.value, 'pre-existing narrative',
    'consent gate: the narrative box is not touched before the explicit Apply',
  );
  el.querySelector('.docx-apply-btn').fire('click');
  assert.equal(target.value, NARRATIVE.join('\n'), 'apply fills #f-narrative with the document text');
  assert.ok(target.value.trim().length >= 20, 'the flow\'s 20-character minimum validation can pass on the fill');
});

test('junk file → inline error, #f-narrative never fed garbage', async () => {
  const target = { value: 'pre-existing narrative' };
  const el = new StubElement();
  wireDocxImport(el, { apply: (payload) => { target.value = payload.text; } });
  await pickFile(el, {
    name: 'not-really.docx', size: 21,
    arrayBuffer: async () => new TextEncoder().encode('definitely not a zip').buffer,
  });
  assert.match(el.innerHTML, /docx-import-error/, 'friendly inline error, page never breaks');
  el.querySelector('.docx-apply-btn').fire('click');
  assert.equal(target.value, 'pre-existing narrative', 'fail-closed: apply unreachable in error state');
});
