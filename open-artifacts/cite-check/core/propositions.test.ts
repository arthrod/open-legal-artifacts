import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPropositionPrompt, mergeVerdicts } from './propositions';
import { runCiteCheck } from './citecheck';
import type { CiteCheckInput } from './citecheck';

const INPUT: CiteCheckInput = {
  document: { name: 'Proposition test (fictional)' },
  sources: [
    {
      id: 'depo',
      name: 'Deposition (fictional)',
      pages: [{ number: 12, text: 'A. Mr. Beltran signed the delivery receipt without noting any exception on the document. The delivery occurred at the loading dock in the late afternoon.' }],
    },
  ],
  quotes: [
    { id: 'Q1', text: 'Mr. Beltran signed the delivery receipt without noting any exception on the document.', sourceId: 'depo', proposition: 'Delivery accepted without exception.' },
    { id: 'Q2', text: 'Mr. Beltran signed the delivery receipt without noting any exception on the document at the loading dock', sourceId: 'depo', proposition: 'Paraphrased version.' },
  ],
};

test('buildPropositionPrompt includes only exact/normalized quotes and their anchors', () => {
  const report = runCiteCheck(INPUT);
  const prompt = buildPropositionPrompt(report);
  assert.ok(prompt.includes('"Q1"'), prompt);
  assert.ok(!prompt.includes('"Q2"'), prompt);
  assert.ok(prompt.includes('signed the delivery receipt'), prompt);
  assert.ok(prompt.includes('verbatim'), prompt);
});

test('mergeVerdicts refuses non-verbatim-verified quotes and anchor mismatches', () => {
  const report = runCiteCheck(INPUT);
  assert.equal(report.results[1].classification, 'fuzzy');
  const merged = mergeVerdicts(report, [
    { id: 'Q1', proposition: 'Delivery accepted without exception.', supported: true, reasoning: 'ok', anchorFromCore: report.results[0].anchor!.verbatim },
    { id: 'Q2', proposition: 'Paraphrased version.', supported: true, reasoning: 'nope' },
    { id: 'Q1', proposition: 'Delivery accepted without exception.', supported: false, reasoning: 'stale', anchorFromCore: 'something else entirely' },
    { id: 'QX', proposition: 'unknown', supported: true, reasoning: '?' },
  ]);
  assert.equal(merged[0].eligible, true);
  assert.equal(merged[0].verdict?.supported, true);
  assert.equal(merged[1].eligible, false);
  assert.ok(merged[1].refusal!.includes('fuzzy'), merged[1].refusal);
  assert.equal(merged[2].eligible, false);
  assert.ok(merged[2].refusal!.includes('anchor'), merged[2].refusal);
  assert.equal(merged[3].eligible, false);
  assert.ok(merged[3].refusal!.includes('no quote'), merged[3].refusal);
});
