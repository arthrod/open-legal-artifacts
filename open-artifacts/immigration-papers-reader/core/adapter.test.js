/** node:test adapter suite for immigration-papers-reader — class T DOCX-import
 * wiring (Wave W5 FINISH). Run: node --test core/adapter.test.js
 *
 * Two-layer contract per the run's uniform TDD template (amended class T):
 *  1. SOURCE pins — the demo page must mount the shared control with the D1
 *     dynamic-import specifier and an apply that fills the page's notice
 *     paste box (#notice). These fail before the wiring exists (RED) and pin
 *     it after.
 *  2. FUNCTIONAL mirror — a real .docx fixture (docio writeDocx) through the
 *     shared readDocxText/wireDocxImport (DOM-stub pattern from
 *     open-artifacts/_shared/docx-import.test.js) with an apply closure
 *     mirroring the page's, asserting the fill, the consent gate (nothing is
 *     applied before the explicit Apply), the fail-closed junk-file path, and
 *     that the filled text is consumable by the frozen deterministic core
 *     (parseNotice — the templated-notice parser the page already runs).
 * The mirror is kept honest by pin 1: if the page's apply line changes, the
 * pin fails and forces this file along.
 * Fictional data; no network; no real DOM. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { writeDocx } from '../../_shared/docio.js';
import { readDocxText, wireDocxImport } from '../../_shared/docx-import.js';
import { parseNotice } from './core.js';

const PAGE = readFileSync(new URL('../demo/index.html', import.meta.url), 'utf8');

/* --- DOM stub, same shape as open-artifacts/_shared/docx-import.test.js --- */
class StubElement {
  constructor() { this._html = ''; this._kids = {}; this.handlers = {}; this.files = null; this.disabled = false; this.value = ''; }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this._kids = {}; }
  querySelector(sel) { if (!this._kids[sel]) this._kids[sel] = new StubElement(); return this._kids[sel]; }
  addEventListener(type, fn) { (this.handlers[type] ??= []).push(fn); }
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

/* The fictional templated notice (I-797C biometrics variant) the demo ships —
 * the DOCX under import. parseNotice handles it deterministically. */
const NOTICE = [
  'U.S. Citizenship and Immigration Services (fictional sample)',
  'Form I-797C, Notice of Action',
  'Application Support Center — Biometrics Appointment Notice',
  'Application Type: FORM I-140, Immigrant Petition for Alien Worker',
  'Appointment Date: November 24, 2026',
  'Time: 9:00 AM',
  'Please bring this notice and photo identification.',
];
const NOTICE_TEXT = NOTICE.join('\n');

/* ---------- source pins (RED driver) ---------- */

test('page wiring pins: D1 dynamic import specifier, notice mount above the paste box, apply fill, hosted-site hint', () => {
  assert.ok(
    PAGE.includes('await import("../../_shared/docx-import.js")'),
    'D1-pinned dynamic import specifier for open-artifacts demos',
  );
  assert.ok(PAGE.includes('id="docxImportMount"'), 'mount element for the notice import exists');
  const mountAt = PAGE.indexOf('id="docxImportMount"');
  const noticeAt = PAGE.indexOf('id="notice"');
  assert.ok(mountAt > 0 && noticeAt > 0 && mountAt < noticeAt, 'mount sits above the notice textarea it fills');
  assert.ok(
    PAGE.includes("$('notice').value = payload.text;"),
    "the page's apply fills the notice paste box with the imported text",
  );
  assert.ok(
    PAGE.includes('DOCX import is available on the hosted site'),
    'D1 catch hint rendered when the shared module cannot load (file:// etc.)',
  );
  assert.ok(
    !/import\s[^;]*from\s*"[^"]*docx-import\.js"/.test(PAGE),
    'the shared module is never statically imported (build must not inline it)',
  );
  // additive: the existing parse button handler stays untouched
  assert.ok(PAGE.includes("$('parse').addEventListener('click'"), 'existing Parse notice handler untouched');
});

/* ---------- functional mirror ---------- */

test('real .docx fixture → consent-gated apply fills #notice; the frozen core parses the fill', async () => {
  const res = await readDocxText(writeDocx(NOTICE));
  assert.equal(res.error, null, 'fixture reads cleanly through the shared reader');
  assert.deepEqual(res.paragraphs, NOTICE);

  const target = { value: 'pre-existing pasted notice' };
  const el = new StubElement();
  wireDocxImport(el, {
    title: 'Import notice (.docx)',
    hint: 'Loads the notice text; the deterministic parser does the rest',
    apply: (payload) => { target.value = payload.text; }, // mirrors the page's apply
  });
  await pickFile(el, docxFile(NOTICE, 'i797c-biometrics.docx'));
  assert.equal(
    target.value, 'pre-existing pasted notice',
    'consent gate: #notice is not touched before the explicit Apply',
  );
  assert.match(el.innerHTML, /docx-import-preview/, 'preview shown before any apply');
  el.querySelector('.docx-apply-btn').fire('click');
  assert.equal(target.value, NOTICE_TEXT, 'apply fills the notice paste box with the document text');

  // class T feeds the existing pipeline: the frozen deterministic core consumes the fill
  const p = parseNotice(target.value);
  assert.equal(p.matched, true, 'the filled text parses as a templated notice');
  assert.equal(typeof p.form_label, 'string');
  assert.ok(p.extraction_log.length >= 1, 'template rules fired — extraction is traceable');
});

test('untemplated text still fills #notice honestly; parseNotice reports no match instead of guessing', async () => {
  const WEIRD = ['Random correspondence, not a USCIS template (fictional).', 'No dates worth guessing.'];
  const target = { value: '' };
  const el = new StubElement();
  wireDocxImport(el, { apply: (payload) => { target.value = payload.text; } });
  await pickFile(el, docxFile(WEIRD, 'letter.docx'));
  el.querySelector('.docx-apply-btn').fire('click');
  assert.equal(target.value, WEIRD.join('\n'), 'text is loaded, never dropped');
  const p = parseNotice(target.value);
  assert.equal(p.matched, false, 'core stays honest — no guessed facts');
});

test('junk file → inline error, #notice never fed garbage', async () => {
  const target = { value: 'pre-existing pasted notice' };
  const el = new StubElement();
  wireDocxImport(el, { apply: (payload) => { target.value = payload.text; } });
  await pickFile(el, {
    name: 'not-really.docx', size: 21,
    arrayBuffer: async () => new TextEncoder().encode('definitely not a zip').buffer,
  });
  assert.match(el.innerHTML, /docx-import-error/, 'friendly inline error, page never breaks');
  assert.equal(el.querySelector('.docx-apply-btn').disabled, true, 'apply unreachable in the error state');
  el.querySelector('.docx-apply-btn').fire('click');
  assert.equal(target.value, 'pre-existing pasted notice', 'fail-closed: target untouched');
});
