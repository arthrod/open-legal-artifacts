/** node:test adapter suite for eviction-notice-check-board — class D DOCX-import
 *  wiring (Wave W5): the TESTED deterministic extractDraft (core/extract.js,
 *  MASTER §3.2.3 "tested but demo-unwired") finally wired into the demo via a new
 *  "Paste / upload the notice" section. Run from repo root:
 *    node --test open-artifacts/eviction-notice-check-board/core/adapter.test.js
 *
 *  Layers per the run's uniform TDD template (amended class D):
 *   1. SOURCE pins — the page must carry the paste box + the shared DOCX control
 *     (D1 dynamic-import specifier), import extractDraft from the frozen
 *     core/extract.js, and NEVER auto-map attestations (no data-content writes in
 *     the wiring). These fail before the wiring exists (RED driver).
 *   2. FUNCTIONAL — the page's [notice-draft-wiring] and [docx-import-wiring]
 *     blocks are extracted VERBATIM from demo/index.html and executed against a
 *     stub DOM with the real extractDraft and the real _shared/docx-import.js
 *     injected. Paste path and .docx path (real archive via docio's writeDocx)
 *     both render the draft facts with their verbatim quotes; the human maps
 *     facts onto the form one explicit "Use" click at a time; attestations
 *     (contents selects/quotes) are never touched by the wiring.
 * Fictional notice; no network; no real DOM. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { writeDocx } from '../../_shared/docio.js';
import { extractDraft } from './extract.js';

const PAGE = readFileSync(new URL('../demo/index.html', import.meta.url), 'utf8');
const SPECIFIER = '"../../_shared/docx-import.js"'; // D1-pinned dynamic-import specifier

/* Fictional 3-day pay-or-quit notice (the document under import). */
const PARAS = [
  'NOTICE TO PAY RENT OR QUIT (fictional)',
  'To: Tenant, Unit 4B — Premises: 4B Marigold Lane, Los Angeles, California.',
  'Rent of $1,250.00 is now due. Pay to Marigold Properties, 12 Elm St., within three (3) days of service.',
  'You must surrender the premises if rent is unpaid after the period expires.',
  'Dated: October 1, 2026. A copy was posted on and secured to the front door.',
];
const NOTICE_TEXT = PARAS.join('\n');

/* The frozen extractor's expected draft over the fixture (spot-checked against
 * core/extract.test.js behavior; the unit layer below re-derives it live). */
test('unit: the frozen extractDraft derives the fixture draft (sanity for the wiring tests)', () => {
  const d = extractDraft(NOTICE_TEXT);
  assert.equal(d.statedPeriodDays, 3);
  assert.equal(d.statedPeriodDaysQuote, 'three (3) days');
  assert.deepEqual(d.amounts.map((a) => a.amount), ['$1,250.00']);
  assert.ok(d.dates.some((x) => x.iso === '2026-10-01' && x.raw === 'October 1, 2026'));
  assert.equal(d.jurisdictionHint, 'california-example');
  assert.ok(d.contentHints['amount-due'] && d.contentHints['amount-due'].present);
  assert.ok(d.contentHints['payment-instructions'] && /Pay to Marigold/.test(d.contentHints['payment-instructions'].quote), 'payment-instructions hint carries the verbatim pay line');
  assert.ok(d.contentHints['vacate-demand'] && d.contentHints['vacate-demand'].present);
  assert.match(d.serviceMethodDescription, /^posted on and secured to the front door\.$/i);
});

/* ---------- DOM stub, same shape as _shared/docx-import.test.js ---------- */

class StubElement {
  constructor() { this._html = ''; this._kids = {}; this.handlers = {}; this.clicks = 0; this.files = null; this.disabled = false; this.value = ''; this.textContent = ''; }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this._kids = {}; }
  querySelector(sel) { if (!this._kids[sel]) this._kids[sel] = new StubElement(); return this._kids[sel]; }
  addEventListener(type, fn) { (this.handlers[type] ??= []).push(fn); }
  click() { this.clicks++; for (const f of this.handlers.click ?? []) f(); }
  fire(type, ev) { for (const f of this.handlers[type] ?? []) f(ev); }
}

const settle = () => new Promise((r) => setTimeout(r, 15));
const docxFile = (buf, name) => ({ name, size: buf.length, arrayBuffer: async () => new Uint8Array(buf).slice().buffer });

function stubDom() {
  const els = {};
  for (const id of ['docxImportMount', 'noticeText', 'noticeBtn', 'noticeDraft', 'jur', 'type', 'days', 'tenancy', 'service', 'sd', 'fd', 'contents', 'checklist', 'run', 'err', 'board', 'batchJson']) els[id] = new StubElement();
  els.jur.value = 'california-example';
  return { els, mount: els.docxImportMount, document: { getElementById: (id) => els[id] ?? null } };
}

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

function runNoticeWiring(document) {
  new Function('document', 'extractDraft', block('notice-draft-wiring'))(document, extractDraft);
}

async function runDocxWiring(document) {
  const wiring = block('docx-import-wiring');
  assert.equal(wiring.split(`import(${SPECIFIER})`).length - 1, 1, 'exactly one dynamic import, with the D1-pinned specifier');
  const shared = await import('../../_shared/docx-import.js');
  const injectable = wiring.replace(`import(${SPECIFIER})`, 'Promise.resolve(__SHARED__)');
  new Function('document', '__SHARED__', injectable)(document, shared);
  await settle();
}

async function runDocxWiringImportFails(document) {
  const injectable = block('docx-import-wiring').replace(`import(${SPECIFIER})`, 'Promise.reject(new Error("module unavailable (file:// or offline)"))');
  new Function('document', injectable)(document);
  await settle();
}

async function pickFile(mount, file) {
  const input = mount.querySelector('.docx-file-input');
  input.files = [file];
  input.fire('change');
  await settle();
}

/* ---------- source pins (RED driver) ---------- */

test('page wiring pins: D1 specifier, paste/upload section present, extractDraft imported from the frozen core', () => {
  assert.ok(PAGE.includes(`await import(${SPECIFIER})`), 'D1-pinned dynamic import specifier for open-artifacts demos');
  assert.ok(PAGE.includes('id="docxImportMount"'), 'mount element exists');
  assert.ok(PAGE.includes('id="noticeText"') && PAGE.includes('id="noticeBtn"') && PAGE.includes('id="noticeDraft"'), 'paste/extract/draft elements exist');
  assert.ok(/import\s*\{[^}]*extractDraft[^}]*\}\s*from\s*['"]\.\.\/core\/extract\.js['"]/.test(PAGE), 'the tested extractDraft is imported from the frozen core/extract.js');
  assert.ok(PAGE.indexOf('id="docxImportMount"') < PAGE.indexOf('id="noticeText"'), 'the upload control sits with the paste box');
  assert.ok(PAGE.indexOf('id="noticeText"') < PAGE.indexOf('id="jur"'), 'the paste/upload section sits above the notice-facts form (reconC slot)');
  assert.ok(!/import\s[^;]*from\s*["'][^"']*docx-import\.js["']/.test(PAGE), 'the shared module is never statically imported (build must not inline it)');
  assert.ok(PAGE.includes('DOCX import is available on the hosted site'), 'D1 catch hint for unloadable shared module (file:// etc.)');
});

test('page wiring pins: extraction never attests — no contents/data-content writes in the wiring', () => {
  const w = block('notice-draft-wiring');
  assert.ok(!/data-content|data-quote|querySelectorAll/.test(w), 'the draft wiring never touches attestation controls');
  assert.ok(/Extraction ≠ attestation|Extraction is not attestation/.test(w + PAGE), 'the extraction-vs-attestation boundary is stated on the page');
});

test('page wiring pins: existing form and batch controls untouched', () => {
  for (const id of ['jur', 'type', 'days', 'tenancy', 'service', 'sd', 'fd', 'contents', 'checklist', 'run', 'err', 'mdBtn', 'csvBtn', 'jsonBtn', 'board', 'batchJson', 'batchRun', 'batch']) {
    assert.ok(PAGE.includes(`id="${id}"`), `existing element #${id} untouched`);
  }
});

/* ---------- functional: paste path ---------- */

test('paste path: extract → draft facts with verbatim quotes; form untouched until an explicit Use', () => {
  const dom = stubDom();
  runNoticeWiring(dom.document);
  dom.els.noticeText.value = NOTICE_TEXT;
  dom.els.noticeBtn.click();
  const html = dom.els.noticeDraft.innerHTML;
  assert.match(html, /three \(3\) days/, 'stated period with its verbatim quote');
  assert.match(html, /3 day\(s\)/, 'the numeric period surfaced');
  assert.match(html, /\$1,250\.00/, 'amount stated');
  assert.match(html, /california-example/, 'jurisdiction hint (state literally on the notice)');
  assert.match(html, /October 1, 2026/, 'raw date shown verbatim');
  assert.match(html, /2026-10-01/, 'ISO form offered for the service-date field');
  assert.match(html, /Pay to Marigold/, 'payment-instructions quote');
  assert.match(html, /posted on and secured to the front door/i, 'service method description verbatim');
  assert.match(html, /extraction/i, 'extraction ≠ attestation boundary stated');
  // consent gate: nothing mapped onto the form by extraction alone
  assert.equal(dom.els.days.value, '', 'days untouched until a Use click');
  assert.equal(dom.els.sd.value, '', 'service date untouched');
  assert.equal(dom.els.service.value, '', 'service method select untouched — the human picks it');
});

test('paste path: one explicit Use click maps exactly one fact; attestations never auto-mapped', () => {
  const dom = stubDom();
  runNoticeWiring(dom.document);
  dom.els.noticeText.value = NOTICE_TEXT;
  dom.els.noticeBtn.click();
  dom.els.noticeDraft.fire('click', { target: { dataset: { days: '3' } } });
  assert.equal(dom.els.days.value, '3', 'days mapped after the explicit Use');
  assert.equal(dom.els.sd.value, '', 'other fields still untouched');
  dom.els.noticeDraft.fire('click', { target: { dataset: { jur: 'california-example' } } });
  assert.equal(dom.els.jur.value, 'california-example', 'jurisdiction mapped after its own Use');
  dom.els.noticeDraft.fire('click', { target: { dataset: { sd: '2026-10-01' } } });
  assert.equal(dom.els.sd.value, '2026-10-01', 'service date mapped after its own Use');
  // attestation controls: the wiring has no path to them (pinned statically); the
  // contents container is never written by the draft wiring
  assert.equal(dom.els.contents.value, '', 'attestation container untouched — present/absent stays human');
});

/* ---------- functional: .docx path ---------- */

test('docx path: real .docx → text preview; Apply loads the paste box and runs the SAME extractor', async () => {
  const dom = stubDom();
  runNoticeWiring(dom.document);
  await runDocxWiring(dom.document);
  await pickFile(dom.mount, docxFile(writeDocx(PARAS), 'notice.docx'));
  assert.match(dom.mount.innerHTML, /xtext/, 'notice text preview rendered');
  assert.match(dom.mount.innerHTML, /NOTICE TO PAY RENT OR QUIT/, 'the document text is visible');
  assert.equal(dom.els.noticeText.value, '', 'paste box untouched before the explicit Apply');
  dom.mount.querySelector('.docx-apply-btn').click();
  assert.equal(dom.els.noticeText.value, NOTICE_TEXT, 'Apply loads the extracted text into the paste box');
  assert.equal(dom.els.noticeBtn.clicks, 1, 'Apply runs the same deterministic extractor as the paste path');
  assert.match(dom.els.noticeDraft.innerHTML, /three \(3\) days/, 'draft facts rendered through the shared path');
  assert.equal(dom.els.days.value, '', 'still nothing attested or mapped automatically');
});

test('docx path: junk (non-docx) file → inline error, paste box never fed garbage (fail-closed)', async () => {
  const dom = stubDom();
  runNoticeWiring(dom.document);
  await runDocxWiring(dom.document);
  await pickFile(dom.mount, { name: 'notes.txt', size: 30, arrayBuffer: async () => new TextEncoder().encode('plain prose, not a zip').buffer });
  assert.match(dom.mount.innerHTML, /docx-import-error/, 'friendly inline error, page never breaks');
  assert.equal(dom.els.noticeText.value, '', 'paste box untouched');
  assert.equal(dom.mount.querySelector('.docx-apply-btn').disabled, true, 'Apply stays disabled in the error state');
});

test('docx path: failed shared-module import renders the hosted-site hint, page intact', async () => {
  const dom = stubDom();
  runNoticeWiring(dom.document);
  dom.els.noticeText.value = NOTICE_TEXT;
  await runDocxWiringImportFails(dom.document);
  assert.match(dom.mount.innerHTML, /DOCX import is available on the hosted site/, 'fail-closed hint rendered');
  assert.equal(dom.els.noticeText.value, NOTICE_TEXT, 'existing paste content untouched');
  dom.els.noticeBtn.click();
  assert.match(dom.els.noticeDraft.innerHTML, /three \(3\) days/, 'paste path still works independently of the upload control');
});
