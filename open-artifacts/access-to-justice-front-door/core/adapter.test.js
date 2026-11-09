/** node:test adapter suite for access-to-justice-front-door — class T DOCX-import
 * wiring (Wave W6a). Run: node --test core/adapter.test.js
 *
 * Two-layer contract per the run's uniform TDD template (amended class T):
 *  1. SOURCE pins — the demo page must mount the shared control with the D1
 *     dynamic-import specifier and an apply that fills the problem-description
 *     box (#desc). These fail before the wiring exists (RED) and pin it after.
 *  2. FUNCTIONAL mirror — a real .docx fixture (docio writeDocx) through the
 *     shared readDocxText/wireDocxImport (DOM-stub pattern from
 *     open-artifacts/_shared/docx-import.test.js) with an apply closure
 *     mirroring the page's, asserting the fill, the consent gate (nothing is
 *     applied before the explicit Apply), the fail-closed junk-file path, and
 *     that the filled text is consumable by the frozen triage core.
 * The mirror is kept honest by pin 1: if the page's apply line changes, the
 * pin fails and forces this file along.
 * Fictional data; no network; no real DOM. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { writeDocx } from '../../_shared/docio.js';
import { readDocxText, wireDocxImport } from '../../_shared/docx-import.js';
import { triage } from './core.js';

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

const STORY = [
  'My landlord taped a notice to quit on my door and I am three weeks behind on rent after my hours got cut.',
  'There is a court date coming up and I want to stay in my apartment.',
];

/* ---------- source pins (RED driver) ---------- */

test('page wiring pins: D1 dynamic import specifier, mount above #desc, apply fill, hosted-site hint', () => {
  assert.ok(
    PAGE.includes('await import("../../_shared/docx-import.js")'),
    'D1-pinned dynamic import specifier for open-artifacts demos',
  );
  assert.ok(PAGE.includes('id="docx-import"'), 'mount element exists');
  assert.ok(
    PAGE.indexOf('id="docx-import"') < PAGE.indexOf('<textarea id="desc"'),
    'the control sits above the problem-description box it fills',
  );
  assert.ok(
    PAGE.includes("$('desc').value = payload.text;"),
    "the page's apply fills #desc with the imported text",
  );
  assert.ok(
    PAGE.includes('DOCX import is available on the hosted site'),
    'D1 catch hint rendered when the shared module cannot load (file:// etc.)',
  );
});

/* ---------- functional mirror ---------- */

test('real .docx fixture → consent-gated apply fills #desc', async () => {
  const res = await readDocxText(writeDocx(STORY));
  assert.equal(res.error, null, 'fixture reads cleanly through the shared reader');
  assert.deepEqual(res.paragraphs, STORY);

  const target = { value: 'pre-existing story' };
  const el = new StubElement();
  wireDocxImport(el, {
    title: 'Import DOCX',
    hint: 'Loads the visitor story from a .docx into the box below',
    apply: (payload) => { target.value = payload.text; }, // mirrors the page's apply
  });
  await pickFile(el, docxFile(STORY, 'story.docx'));
  assert.equal(
    target.value, 'pre-existing story',
    'consent gate: the box is not touched before the explicit Apply',
  );
  el.querySelector('.docx-apply-btn').fire('click');
  assert.equal(target.value, STORY.join('\n'), 'apply fills #desc with the document text');

  // class T feeds the existing pipeline: the frozen triage core consumes the fill
  const r = triage(target.value);
  assert.ok(r && typeof r === 'object' && Array.isArray(r.referrals), 'filled text triages without error');
});

test('junk file → inline error, #desc never fed garbage', async () => {
  const target = { value: 'pre-existing story' };
  const el = new StubElement();
  wireDocxImport(el, { apply: (payload) => { target.value = payload.text; } });
  await pickFile(el, {
    name: 'not-really.docx', size: 21,
    arrayBuffer: async () => new TextEncoder().encode('definitely not a zip').buffer,
  });
  assert.match(el.innerHTML, /docx-import-error/, 'friendly inline error, page never breaks');
  el.querySelector('.docx-apply-btn').fire('click');
  assert.equal(target.value, 'pre-existing story', 'fail-closed: apply unreachable in error state');
});
