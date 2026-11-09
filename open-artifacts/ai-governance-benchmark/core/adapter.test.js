/** node:test adapter suite for ai-governance-benchmark — class LA DOCX-import
 *  wiring (Wave W6b): completed-questionnaire .docx → shared wireDocxImport
 *  control → POST /api/extract {schema:"ai-governance-benchmark"} (the spec's
 *  answer-interview contract, ADAPTED for completed questionnaires per reconC
 *  §4.3: NEVER a level without quoted evidence ≤280 chars; questions the
 *  document does not answer are omitted so the deterministic core scores them
 *  0 and flags them) → editable answers preview + confidence chip → Apply
 *  fills #input and the page's existing run path takes over. The rubric
 *  engine and the fictional-cohort percentile labeling are untouched.
 *  Run from repo root:
 *    node --test open-artifacts/ai-governance-benchmark/core/adapter.test.js
 *
 *  Layers per the uniform TDD template (amended class LA):
 *   1. SOURCE pins (RED driver) — D1 dynamic-import specifier, mount, exact
 *      schema key, fail-closed banner marker, apply fill, hosted-site hint,
 *      and pins that the existing inputs + cohort labeling survived.
 *   2. FUNCTIONAL mirror with globalThis.fetch MOCKED (never real network):
 *      success with confidence map → editable answers JSON + chip;
 *      ok:false (429) / fetch throw / non-JSON → fail-closed banner + the raw
 *      questionnaire text preserved in a fallback textarea, #input untouched;
 *      Apply reads the user-EDITED preview values and fills #input; the frozen
 *      core's scoreAssessment consumes the applied JSON. The mirror replicates
 *      the page's preview/apply closures (kept honest by the pins); its esc()
 *      is a regex equivalent of the page's DOM-based esc (cosmetic-only
 *      divergence: both escape & < > for textarea content).
 * Fictional data; no real network; no real DOM. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { writeDocx } from '../../_shared/docio.js';
import { wireDocxImport } from '../../_shared/docx-import.js';
import { scoreAssessment, QUESTION_BANK } from './core.js';

const PAGE = readFileSync(new URL('../demo/index.html', import.meta.url), 'utf8');

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

function syncTextarea(el, cls) {
  const m = new RegExp('<textarea class="' + cls + '"[^>]*>([\\s\\S]*?)</textarea>').exec(el.innerHTML);
  assert.ok(m, 'preview renders a .' + cls + ' textarea');
  const ta = el.querySelector('.' + cls);
  ta.value = unesc(m[1]);
  return ta;
}

async function pickFile(el, file) {
  const input = el.querySelector('.docx-file-input');
  input.files = [file];
  input.fire('change');
  await settle();
}

const docxFile = (paras, name = 'questionnaire.docx') => {
  const buf = writeDocx(paras);
  return { name, size: buf.length, arrayBuffer: async () => new Uint8Array(buf).slice().buffer };
};

/* ---------- fetch mocking ---------- */

async function withFetch(mock, run) {
  const orig = globalThis.fetch;
  globalThis.fetch = mock;
  try { return await run(); } finally { globalThis.fetch = orig; }
}

const jsonResponse = (status, obj) => ({ ok: status >= 200 && status < 300, status, json: async () => obj });

/* ---------- fixture + mock data (fictional) ---------- */

const QUESTIONNAIRE = [
  'AI Governance Assessment — Northlake Logistics (fictional)',
  'inv-1 — Level 2: We keep a spreadsheet of AI tools; 9 tools listed as of Q1 2026.',
  'inv-2 — Level 1: Owners noted for 4 of 9 tools; the rest are unmapped.',
  'risk-3 — Level 0: AI screening of driver applicants in pilot, no heightened review.',
  'ir-1 — not answered in this document.',
];

const MOCK_ANSWERS = [
  { questionId: 'inv-1', level: 2, evidence: 'We keep a spreadsheet of AI tools; 9 tools listed as of Q1 2026.' },
  { questionId: 'inv-2', level: 1, evidence: 'Owners noted for 4 of 9 tools; the rest are unmapped.' },
  { questionId: 'risk-3', level: 0, evidence: 'AI screening of driver applicants in pilot, no heightened review.' },
];

const ORG = { name: 'Northlake Logistics (fictional)', sector: 'freight brokerage', assessment_date: '2026-10-12' };

/* ---------- source pins (RED driver) ---------- */

test('page wiring pins: D1 specifier, mount, schema key, /api/extract POST, apply fill, fail-closed banner, hint, existing surfaces intact', () => {
  assert.ok(PAGE.includes('await import("../../_shared/docx-import.js")'), 'D1-pinned dynamic import specifier for open-artifacts demos');
  assert.ok(PAGE.includes('id="docx-import"'), 'mount element exists');
  assert.ok(PAGE.includes("title: 'Import completed questionnaire'"), 'reconC slot title');
  assert.ok(PAGE.includes("fetch('/api/extract'"), 'extraction goes through the shared /api/extract route');
  assert.ok(PAGE.includes("schema: 'ai-governance-benchmark'"), 'the artifact\'s registered schema key is posted');
  assert.ok(PAGE.includes("$('input').value = JSON.stringify({ org: state.org, answers: v.answers }, null, 2);"), 'apply fills the existing assessment-JSON input with the user-edited answers');
  assert.ok(PAGE.includes('DOCX import is available on the hosted site'), 'D1 catch hint for unloadable shared module (file:// etc.)');
  assert.ok(PAGE.includes('agov-raw'), 'fail-closed fallback textarea for the raw questionnaire text');
  assert.ok(PAGE.includes('preserved below'), 'fail-closed banner copy');
  assert.ok(PAGE.includes('aria-label="Assessment JSON"'), 'existing assessment textarea is untouched by the wiring');
  assert.ok(PAGE.includes('esc(cmp.cohort)'), 'fictional-cohort percentile labeling is untouched by the wiring');
  assert.ok(PAGE.includes('QUESTION_BANK.length'), 'answered-count copy is derived from the question bank, not hardcoded');
});

/* ---------- functional mirror (fetch mocked) ---------- */

/** Mirrors the page's preview/apply closures — drift-guarded by the pins. */
function mountMirror(target, org) {
  const el = new StubElement();
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const agovFail = (msg, text) =>
    '<p class="err" role="alert">' + esc(msg) + '</p>'
    + '<p class="muted">Nothing was applied — answer the interview from this text or paste an assessment JSON.</p>'
    + '<textarea class="agov-raw" rows="10" style="width:100%;box-sizing:border-box">' + esc(text) + '</textarea>';
  wireDocxImport(el, {
    title: 'Import completed questionnaire',
    hint: '.docx → answers[] via live AI (gpt-5-nano); review, edit, then Apply',
    preview: async (docText) => {
      let res;
      try {
        res = await fetch('/api/extract', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ schema: 'ai-governance-benchmark', text: docText }) });
      } catch { return agovFail('The extraction service could not be reached — nothing was extracted. The questionnaire text is preserved below.', docText); }
      let body = null;
      try { body = await res.json(); } catch { body = null; }
      if (!res.ok || !body || body.ok !== true || !body.data || !Array.isArray(body.data.answers))
        return agovFail('Structured extraction unavailable' + (body && body.message ? ' — ' + body.message.replace(/\.\s*$/, '') : '') + '. The questionnaire text is preserved below.', docText);
      const conf = (body.confidence && body.confidence.answers) || 'missing';
      const chip = conf === 'high'
        ? '<span class="muted">extraction confidence: high</span>'
        : '<span class="err">extraction confidence: ' + conf + ' — review the answers before applying</span>';
      return '<p style="margin:0 0 8px">' + chip + ' · <span class="muted">' + body.data.answers.length + ' of ' + QUESTION_BANK.length + ' questions answered — the rest score 0 and are flagged by the rubric. Every level must trace to its quoted evidence; edit anything wrong, then Apply.</span></p>'
        + '<textarea class="agov-json" rows="14" style="width:100%;box-sizing:border-box">' + esc(JSON.stringify({ answers: body.data.answers }, null, 2)) + '</textarea>';
    },
    apply: () => {
      const ta = el.querySelector('.agov-json');
      if (!ta) throw new Error('no extracted answers to apply');
      const v = JSON.parse(ta.value);
      if (!v || !Array.isArray(v.answers)) throw new Error('no answers array');
      target.value = JSON.stringify({ org, answers: v.answers }, null, 2);
    },
  });
  return el;
}

test('mocked /api/extract success → editable answers preview + high-confidence chip; consent-gated Apply fills #input; frozen core consumes', async () => {
  const calls = [];
  const mock = async (url, opts) => { calls.push([url, opts]); return jsonResponse(200, { ok: true, data: { answers: MOCK_ANSWERS }, confidence: { answers: 'high' }, source: 'gpt-5-nano' }); };
  const target = { value: 'PRE-EXISTING ASSESSMENT' };
  const el = mountMirror(target, ORG);
  await withFetch(mock, () => pickFile(el, docxFile(QUESTIONNAIRE)));

  assert.equal(calls.length, 1, 'exactly one extraction call');
  assert.equal(calls[0][0], '/api/extract');
  assert.deepEqual(JSON.parse(calls[0][1].body), { schema: 'ai-governance-benchmark', text: QUESTIONNAIRE.join('\n') }, 'body carries the artifact schema key and the imported document text');

  assert.match(el.innerHTML, /extraction confidence: high/, 'per-field confidence chip (high = ok)');
  assert.match(el.innerHTML, /3 of 13 questions answered/, 'answered-count copy derives from the bank');
  assert.match(el.innerHTML, /agov-json/, 'editable answers JSON rendered');
  assert.equal(target.value, 'PRE-EXISTING ASSESSMENT', 'consent gate: #input is not touched before the explicit Apply');

  const ta = syncTextarea(el, 'agov-json');
  assert.deepEqual(JSON.parse(ta.value), { answers: MOCK_ANSWERS });

  el.querySelector('.docx-apply-btn').fire('click');
  const applied = JSON.parse(target.value);
  assert.deepEqual(applied.org, ORG, 'org preserved from the page state');
  assert.deepEqual(applied.answers, MOCK_ANSWERS, 'answers applied');

  const r = scoreAssessment(applied); // the frozen rubric engine runs downstream, unchanged
  assert.equal(r.unanswered.length, 10, 'omitted questions score 0 and are flagged — never guessed');
  assert.ok(r.warnings.some((w) => /unanswered/.test(w)));
  assert.equal(r.pillars.find((p) => p.id === 'inventory').score, 1, '(2+1+0)/3');
});

test('user-edited preview values are what Apply applies (not the original extraction)', async () => {
  const mock = async () => jsonResponse(200, { ok: true, data: { answers: MOCK_ANSWERS }, confidence: { answers: 'high' }, source: 'gpt-5-nano' });
  const target = { value: '' };
  const el = mountMirror(target, ORG);
  await withFetch(mock, () => pickFile(el, docxFile(QUESTIONNAIRE)));
  const ta = syncTextarea(el, 'agov-json');
  const edited = JSON.parse(ta.value);
  edited.answers[0].level = 3; // the user corrects a level in the preview
  ta.value = JSON.stringify(edited, null, 2);
  el.querySelector('.docx-apply-btn').fire('click');
  assert.equal(JSON.parse(target.value).answers[0].level, 3, 'the EDITED level lands in #input');
});

test('low confidence → chip flagged for review (never presented as trusted)', async () => {
  const mock = async () => jsonResponse(200, { ok: true, data: { answers: MOCK_ANSWERS }, confidence: { answers: 'low' }, source: 'gpt-5-nano' });
  const target = { value: 'PRE-EXISTING ASSESSMENT' };
  const el = mountMirror(target, ORG);
  await withFetch(mock, () => pickFile(el, docxFile(QUESTIONNAIRE)));
  assert.match(el.innerHTML, /extraction confidence: low — review the answers before applying/, 'low confidence is flagged, house .err styling');
  assert.match(el.innerHTML, /agov-json/, 'editable preview still rendered — review-then-apply, not a dead end');
});

test('ok:false (429 RATE_LIMITED) → fail-closed banner with the API message + raw text preserved; #input untouched; Apply refuses', async () => {
  const mock = async () => jsonResponse(429, { ok: false, error: 'RATE_LIMITED', message: 'Too many requests — the live-AI budget is 10 requests per minute. Import the text directly instead.' });
  const target = { value: 'PRE-EXISTING ASSESSMENT' };
  const el = mountMirror(target, ORG);
  await withFetch(mock, () => pickFile(el, docxFile(QUESTIONNAIRE)));
  assert.match(el.innerHTML, /role="alert"/, 'banner is an alert');
  assert.match(el.innerHTML, /Structured extraction unavailable — Too many requests — the live-AI budget is 10 requests per minute/, 'API message surfaced in the banner');
  const m = /<textarea class="agov-raw"[^>]*>([\s\S]*?)<\/textarea>/.exec(el.innerHTML);
  assert.ok(m, 'fallback textarea rendered');
  assert.ok(unesc(m[1]).includes('Northlake Logistics'), 'the raw questionnaire text is preserved (never lost)');
  assert.equal(target.value, 'PRE-EXISTING ASSESSMENT', 'existing inputs untouched');
  el.querySelector('.docx-apply-btn').fire('click');
  assert.match(el.innerHTML, /docx-import-warning/, 'Apply refused with a warning');
  assert.equal(target.value, 'PRE-EXISTING ASSESSMENT', 'still untouched after the refused Apply');
});

test('fetch throws (network down) → same fail-closed posture: banner + text preserved + #input untouched', async () => {
  const mock = async () => { throw new Error('network down'); };
  const target = { value: 'PRE-EXISTING ASSESSMENT' };
  const el = mountMirror(target, ORG);
  await withFetch(mock, () => pickFile(el, docxFile(QUESTIONNAIRE)));
  assert.match(el.innerHTML, /The extraction service could not be reached — nothing was extracted/);
  const m = /<textarea class="agov-raw"[^>]*>([\s\S]*?)<\/textarea>/.exec(el.innerHTML);
  assert.ok(m && unesc(m[1]).includes('inv-1 — Level 2'), 'raw text preserved');
  assert.equal(target.value, 'PRE-EXISTING ASSESSMENT');
});

test('non-JSON 200 response → same fail-closed posture (never fed garbage)', async () => {
  const mock = async () => ({ ok: true, status: 200, json: async () => { throw new Error('not json'); } });
  const target = { value: 'PRE-EXISTING ASSESSMENT' };
  const el = mountMirror(target, ORG);
  await withFetch(mock, () => pickFile(el, docxFile(QUESTIONNAIRE)));
  assert.match(el.innerHTML, /Structured extraction unavailable/, 'unusable reply → banner');
  assert.match(el.innerHTML, /agov-raw/, 'raw text preserved in the fallback textarea');
  assert.equal(target.value, 'PRE-EXISTING ASSESSMENT', 'existing inputs untouched');
});
