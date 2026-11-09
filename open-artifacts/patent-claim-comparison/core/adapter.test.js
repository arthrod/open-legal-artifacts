/** node:test adapter suite for patent-claim-comparison — class T DOCX-import
 * wiring (Wave W6a). Run: node --test core/adapter.test.js
 *
 * Two-layer contract per the run's uniform TDD template (amended class T):
 *  1. SOURCE pins — the demo page must mount the shared control with the D1
 *     dynamic-import specifier and an apply that fills the page's claim-set
 *     textareas. These fail before the wiring exists (RED) and pin it after.
 *  2. FUNCTIONAL mirror — a real .docx fixture (docio writeDocx) through the
 *     shared readDocxText/wireDocxImport (DOM-stub pattern from
 *     open-artifacts/_shared/docx-import.test.js) with an apply closure
 *     mirroring the page's, asserting the fill, the consent gate (nothing is
 *     applied before the explicit Apply), the fail-closed junk-file path, and
 *     that the filled text is consumable by the frozen core. The mirror is
 *     kept honest by pin 1: if the page's apply line changes, the pin fails
 *     and forces this file along.
 * Fictional data; no network; no real DOM. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { writeDocx } from '../../_shared/docio.js';
import { readDocxText, wireDocxImport } from '../../_shared/docx-import.js';
import { compareClaimSets } from './core.js';

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

const CLAIMS = [
  '1. A thermal management system for a battery module, the system comprising:',
  'a coolant channel defined through a stack of prismatic cells; and',
  'a controller configured to modulate coolant flow based on a temperature sensor array.',
  '2. The system of claim 1, wherein the coolant is a dielectric fluid.',
];

/* ---------- source pins (RED driver) ---------- */

test('page wiring pins: D1 dynamic import specifier, both mounts, apply fill, hosted-site hint', () => {
  assert.ok(
    PAGE.includes('await import("../../_shared/docx-import.js")'),
    'D1-pinned dynamic import specifier for open-artifacts demos',
  );
  assert.ok(PAGE.includes('id="docx-a"'), 'mount element for claim set A exists');
  assert.ok(PAGE.includes('id="docx-b"'), 'mount element for claim set B exists');
  assert.ok(
    PAGE.includes('$(areaId).value = payload.text;'),
    "the page's apply fills the target claim-set textarea with the imported text",
  );
  assert.ok(
    PAGE.includes('DOCX import is available on the hosted site'),
    'D1 catch hint rendered when the shared module cannot load (file:// etc.)',
  );
});

/* ---------- functional mirror, per mount ---------- */

for (const [mountId, areaId, label] of [['docx-a', 'setA', 'claim set A'], ['docx-b', 'setB', 'claim set B']]) {
  test(`real .docx fixture → consent-gated apply fills ${areaId} (mount #${mountId})`, async () => {
    const res = await readDocxText(writeDocx(CLAIMS));
    assert.equal(res.error, null, 'fixture reads cleanly through the shared reader');
    assert.deepEqual(res.paragraphs, CLAIMS);

    const target = { value: 'pre-existing draft claims' };
    const el = new StubElement();
    wireDocxImport(el, {
      title: 'Import DOCX — ' + label,
      hint: 'Loads claim text from a .docx into this claim set',
      apply: (payload) => { target.value = payload.text; }, // mirrors the page's apply
    });
    await pickFile(el, docxFile(CLAIMS, 'claims-' + areaId + '.docx'));
    assert.equal(
      target.value, 'pre-existing draft claims',
      'consent gate: the textarea is not touched before the explicit Apply',
    );
    el.querySelector('.docx-apply-btn').fire('click');
    assert.equal(target.value, CLAIMS.join('\n'), 'apply fills the claim-set textarea with the document text');

    // class T feeds the existing pipeline: the frozen core consumes the fill
    const chart = compareClaimSets(target.value, target.value);
    assert.ok(chart && chart.totals && chart.totals.matched >= 1, 'filled text parses as a claim set');
  });

  test(`junk file → inline error, ${areaId} never fed garbage (mount #${mountId})`, async () => {
    const target = { value: 'pre-existing draft claims' };
    const el = new StubElement();
    wireDocxImport(el, { apply: (payload) => { target.value = payload.text; } });
    await pickFile(el, {
      name: 'not-really.docx', size: 21,
      arrayBuffer: async () => new TextEncoder().encode('definitely not a zip').buffer,
    });
    assert.match(el.innerHTML, /docx-import-error/, 'friendly inline error, page never breaks');
    el.querySelector('.docx-apply-btn').fire('click');
    assert.equal(target.value, 'pre-existing draft claims', 'fail-closed: apply unreachable in error state');
  });
}
