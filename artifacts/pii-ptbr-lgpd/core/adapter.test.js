/** node:test adapter suite for pii-ptbr-lgpd (demo page) — class T DOCX-import
 * wiring (Wave W6a). Run: node --test core/adapter.test.js
 *
 * The demo has a readonly sample textarea (#input) unlocked by the
 * "usar texto próprio" checkbox (#custom). Per the W6a brief, importing
 * implies own text: the page's apply checks the unlock itself if needed
 * (checkbox set + readOnly cleared) and never removes the checkbox. That
 * decision is pinned below alongside the wiring pins.
 *
 * Two-layer contract per the run's uniform TDD template (amended class T):
 *  1. SOURCE pins — the page must mount the shared control with the D1
 *     dynamic-import specifier for artifacts/ originals and an apply that
 *     unlocks + fills #input. These fail before the wiring exists (RED) and
 *     pin it after.
 *  2. FUNCTIONAL mirror — a real .docx fixture (docio writeDocx) through the
 *     shared readDocxText/wireDocxImport (DOM-stub pattern from
 *     open-artifacts/_shared/docx-import.test.js) with an apply closure
 *     mirroring the page's, asserting the unlock+fill, the consent gate
 *     (nothing is applied before the explicit Apply), the fail-closed
 *     junk-file path, and that the filled text is consumable by the frozen
 *     detectPii core.
 * The mirror is kept honest by pin 1: if the page's apply line changes, the
 * pin fails and forces this file along.
 * Fictional data; no network; no real DOM. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { writeDocx } from '../../../open-artifacts/_shared/docio.js';
import { readDocxText, wireDocxImport } from '../../../open-artifacts/_shared/docx-import.js';
import { detectPii } from './core.js';

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

const EXAMPLE = 'Prezado Dr. Rafael Moraes Santana, encaminho a paciente Sra. Fernanda Costa Ribeiro.';
const DOC = [
  'Prezado Dr. Rafael Moraes Santana,',
  'Encaminho a paciente Sra. Fernanda Costa Ribeiro, CPF 529.982.247-25, nascida em 14/03/1985.',
  'Contato: fernanda.ribeiro@example.com ou (11) 98765-4321.',
];

/* ---------- source pins (RED driver) ---------- */

test('page wiring pins: D1 specifier, mount, unlock-not-remove apply, checkbox preserved', () => {
  assert.ok(
    PAGE.includes('await import("../../../open-artifacts/_shared/docx-import.js")'),
    'D1-pinned dynamic import specifier for artifacts/ originals demos',
  );
  assert.ok(PAGE.includes('id="docx-import"'), 'mount element exists');
  assert.ok(
    PAGE.indexOf('id="docx-import"') < PAGE.indexOf('<button id="run"'),
    'the control sits in the input section, before the Reanalisar button',
  );
  assert.ok(
    PAGE.includes("$('custom').checked = true; $('input').readOnly = false;"),
    "the page's apply unlocks the own-text box (import implies own text)",
  );
  assert.ok(
    PAGE.includes("$('input').value = payload.text;"),
    "the page's apply fills #input with the imported text",
  );
  assert.ok(
    PAGE.includes('DOCX import is available on the hosted site'),
    'D1 catch hint rendered when the shared module cannot load (file:// etc.)',
  );
  assert.ok(
    PAGE.includes('id="custom"') && PAGE.includes('usar texto próprio'),
    'the unlock checkbox and its label are never removed',
  );
});

/* ---------- functional mirror ---------- */

test('real .docx fixture → consent-gated apply unlocks and fills #input', async () => {
  const res = await readDocxText(writeDocx(DOC));
  assert.equal(res.error, null, 'fixture reads cleanly through the shared reader');
  assert.deepEqual(res.paragraphs, DOC);

  const input = { value: EXAMPLE, readOnly: true }; // mirrors the page's #input
  const custom = { checked: false };                // mirrors the page's #custom
  const el = new StubElement();
  wireDocxImport(el, {
    title: 'Importar DOCX',
    hint: 'Carrega o texto de um .docx como texto próprio',
    apply: (payload) => { // mirrors the page's apply
      if (!custom.checked) { custom.checked = true; input.readOnly = false; }
      input.value = payload.text;
    },
  });
  await pickFile(el, docxFile(DOC, 'encaminhamento.docx'));
  assert.equal(input.value, EXAMPLE, 'consent gate: the box is not touched before the explicit Apply');
  assert.equal(custom.checked, false, 'consent gate: the unlock is not flipped before the explicit Apply');
  el.querySelector('.docx-apply-btn').fire('click');
  assert.equal(custom.checked, true, 'apply checks the "usar texto próprio" unlock');
  assert.equal(input.readOnly, false, 'apply clears readOnly — the box becomes editable');
  assert.equal(input.value, DOC.join('\n'), 'apply fills #input with the document text');

  // class T feeds the existing pipeline: the frozen detector consumes the fill
  const entities = detectPii(input.value);
  assert.ok(Array.isArray(entities) && entities.length >= 1, 'filled text runs through the PII detector');
});

test('unlock already engaged → apply just fills, checkbox untouched', async () => {
  const input = { value: EXAMPLE, readOnly: false };
  const custom = { checked: true };
  const el = new StubElement();
  wireDocxImport(el, {
    apply: (payload) => { // mirrors the page's apply
      if (!custom.checked) { custom.checked = true; input.readOnly = false; }
      input.value = payload.text;
    },
  });
  await pickFile(el, docxFile(DOC, 'encaminhamento.docx'));
  el.querySelector('.docx-apply-btn').fire('click');
  assert.equal(input.value, DOC.join('\n'), 'fill works with the unlock already engaged');
});

test('junk file → inline error, #input and the checkbox untouched', async () => {
  const input = { value: EXAMPLE, readOnly: true };
  const custom = { checked: false };
  const el = new StubElement();
  wireDocxImport(el, {
    apply: (payload) => {
      if (!custom.checked) { custom.checked = true; input.readOnly = false; }
      input.value = payload.text;
    },
  });
  await pickFile(el, {
    name: 'not-really.docx', size: 21,
    arrayBuffer: async () => new TextEncoder().encode('definitely not a zip').buffer,
  });
  assert.match(el.innerHTML, /docx-import-error/, 'friendly inline error, page never breaks');
  el.querySelector('.docx-apply-btn').fire('click');
  assert.equal(input.value, EXAMPLE, 'fail-closed: the sample text is never clobbered');
  assert.equal(custom.checked, false, 'fail-closed: the unlock is never flipped by an error');
});
