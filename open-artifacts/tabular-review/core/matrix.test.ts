import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMatrix, toCSV, toMarkdown, csvEscape } from './matrix';
import type { MatrixInput } from './matrix';

const A = 'This Agreement commences on the Effective Date and continues for three (3) years. Either party may terminate for convenience upon ninety (90) days written notice. Liability is capped at the fees paid in the preceding twelve months.';
const B = 'Term: two (2) years from the Effective Date. Termination for convenience requires sixty (60) days notice. Neither party is liable for indirect damages. This Agreement is governed by Delaware law.';

const INPUT: MatrixInput = {
  documents: [
    { id: 'nda-1', name: 'NDA, "Acme" side (draft 2)', text: A },
    { id: 'msa-2', name: 'MSA, Beta Corp (signed)', text: B },
  ],
  questions: [
    { id: 'Q1', question: 'What is the term?' },
    { id: 'Q2', question: 'What notice is required to terminate for convenience?' },
    { id: 'Q3', question: 'What is the liability cap?' },
  ],
  cells: [
    { documentId: 'nda-1', questionId: 'Q1', answer: '3 years from the Effective Date', quote: 'continues for three (3) years', pinpoint: '§ 2' },
    { documentId: 'msa-2', questionId: 'Q1', answer: '2 years from the Effective Date', quote: 'Term: two (2) years from the Effective Date', pinpoint: '§ 1' },
    { documentId: 'nda-1', questionId: 'Q2', answer: '90 days written notice', quote: 'Either party may terminate for convenience upon ninety (90) days written notice.' },
    { documentId: 'msa-2', questionId: 'Q2', answer: '60 days notice', quote: 'Termination for convenience requires sixty (60) days notice' },
    { documentId: 'nda-1', questionId: 'Q3', answer: 'Fees paid in the preceding twelve months', quote: 'Liability is capped at the fees paid in the preceding twelve months.' },
    { documentId: 'msa-2', questionId: 'Q3', answer: null }, // extractor found nothing
  ],
};

test('verified cells are answered with exact anchors and pinpoints', () => {
  const out = buildMatrix(INPUT);
  const c = out.cells.find((x) => x.documentId === 'nda-1' && x.questionId === 'Q1')!;
  assert.equal(c.status, 'answered');
  assert.equal(c.verification?.classification, 'exact');
  assert.equal(c.verification?.pinpoint, '§ 2');
  assert.ok(A.slice(c.verification!.charStart, c.verification!.charEnd).startsWith('continues'));
});

test('a missing cell entry is unverified not_answered, never guessed', () => {
  const out = buildMatrix({ ...INPUT, cells: INPUT.cells.filter((c) => !(c.documentId === 'nda-1' && c.questionId === 'Q2')) });
  const c = out.cells.find((x) => x.documentId === 'nda-1' && x.questionId === 'Q2')!;
  assert.equal(c.status, 'unverified');
  assert.equal(c.unverifiedReason, 'not_answered');
  assert.equal(c.answer, null);
});

test('null answer is unverified not_answered', () => {
  const out = buildMatrix(INPUT);
  const c = out.cells.find((x) => x.documentId === 'msa-2' && x.questionId === 'Q3')!;
  assert.equal(c.status, 'unverified');
  assert.equal(c.unverifiedReason, 'not_answered');
});

test('answer without a quote is unverified missing_quote', () => {
  const out = buildMatrix({
    ...INPUT,
    cells: [{ documentId: 'nda-1', questionId: 'Q1', answer: '3 years' }],
  });
  const c = out.cells.find((x) => x.documentId === 'nda-1' && x.questionId === 'Q1')!;
  assert.equal(c.status, 'unverified');
  assert.equal(c.unverifiedReason, 'missing_quote');
});

test('quote that does not exist in the document is unverified quote_not_verified', () => {
  const out = buildMatrix({
    ...INPUT,
    cells: [{ documentId: 'nda-1', questionId: 'Q1', answer: 'Perpetual', quote: 'This Agreement continues in perpetuity until the sun explodes' }],
  });
  const c = out.cells.find((x) => x.documentId === 'nda-1' && x.questionId === 'Q1')!;
  assert.equal(c.status, 'unverified');
  assert.equal(c.unverifiedReason, 'quote_not_verified');
});

test('slightly drifted quote still verifies as normalized', () => {
  const out = buildMatrix({
    ...INPUT,
    cells: [{ documentId: 'nda-1', questionId: 'Q1', answer: '3 years', quote: 'continues for three (3) years — either party' }],
  });
  const c = out.cells.find((x) => x.documentId === 'nda-1' && x.questionId === 'Q1')!;
  assert.equal(c.status, 'answered');
  assert.equal(c.verification?.classification, 'normalized');
});

test('paraphrased quote anchors as fuzzy and is flagged for review (tunable threshold)', () => {
  const out = buildMatrix({
    ...INPUT,
    fuzzyThreshold: 0.6, // looser verification for this run
    cells: [{ documentId: 'msa-2', questionId: 'Q2', answer: '60 days notice', quote: 'termination for convenience requires a notice period of sixty days' }],
  });
  const c = out.cells.find((x) => x.documentId === 'msa-2' && x.questionId === 'Q2')!;
  assert.equal(c.status, 'answered');
  assert.equal(c.verification?.classification, 'fuzzy');
  assert.equal(out.summary.flaggedForReview, 1);
});

test('default threshold rejects a heavy paraphrase as quote_not_verified', () => {
  const out = buildMatrix({
    ...INPUT,
    cells: [{ documentId: 'msa-2', questionId: 'Q2', answer: '60 days notice', quote: 'termination for convenience requires a notice period of sixty days' }],
  });
  const c = out.cells.find((x) => x.documentId === 'msa-2' && x.questionId === 'Q2')!;
  assert.equal(c.status, 'unverified');
  assert.equal(c.unverifiedReason, 'quote_not_verified');
});

test('summary counts every document × question cell', () => {
  const out = buildMatrix(INPUT);
  assert.equal(out.summary.cells, 6); // 2 docs × 3 questions
  assert.equal(out.summary.answered, 5);
  assert.equal(out.summary.unverified, 1);
});

test('CSV export escapes per RFC 4180 and marks unverified cells', () => {
  const out = buildMatrix(INPUT);
  const csv = toCSV(INPUT, out);
  assert.ok(csv.includes('"NDA, ""Acme"" side (draft 2)"'));
  assert.ok(csv.includes('UNVERIFIED (not_answered)'));
  assert.ok(csv.includes('3 years from the Effective Date [§ 2]'));
  assert.ok(csv.endsWith('\r\n'));
  assert.equal(csvEscape('plain'), 'plain');
  assert.equal(csvEscape('a,b'), '"a,b"');
  assert.equal(csvEscape('say "hi"'), '"say ""hi"""');
});

test('Markdown export escapes pipes and marks unverified cells', () => {
  const out = buildMatrix(INPUT);
  const md = toMarkdown(INPUT, out);
  assert.ok(md.startsWith('| Document |'));
  assert.ok(md.includes('**UNVERIFIED** (not_answered)'));
  const pipeDoc = toMarkdown(
    { ...INPUT, documents: [{ id: 'x', name: 'A|B', text: 't' }], questions: INPUT.questions.slice(0, 1) },
    buildMatrix({ ...INPUT, documents: [{ id: 'x', name: 'A|B', text: 't' }], questions: INPUT.questions.slice(0, 1), cells: [] }),
  );
  assert.ok(pipeDoc.includes('A\\|B'));
});
