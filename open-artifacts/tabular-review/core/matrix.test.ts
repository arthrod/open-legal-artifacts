import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMatrix, toCSV, toMarkdown, csvEscape, diffMatrices, toSourcesCSV, currencyAmount } from './matrix';
import type { MatrixInput } from './matrix';
import { makeLocator, bestWindowIn, tokenizeWithSpans } from './textutil';

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

const ASG_TEXT = "Neither party may assign this Agreement without the other's prior written consent.";

test('classify answer outside the option set is unverified constraint_violation', () => {
  const out = buildMatrix({
    documents: [{ id: 'asg-1', name: 'Assignment clause (fictional)', text: ASG_TEXT }],
    questions: [{ id: 'Q4', question: 'Is assignment permitted?', type: 'classify', options: ['yes', 'no', 'consent required'] }],
    cells: [{ documentId: 'asg-1', questionId: 'Q4', answer: 'Banana', quote: ASG_TEXT }],
  });
  const c = out.cells.find((x) => x.questionId === 'Q4')!;
  assert.equal(c.status, 'unverified');
  assert.equal(c.unverifiedReason, 'constraint_violation');
  assert.equal(c.answer, null);
});

test('classify answer matching an option is answered with the matched option recorded', () => {
  const out = buildMatrix({
    documents: [
      { id: 'asg-1', name: 'Assignment clause (fictional)', text: ASG_TEXT },
      { id: 'msa-2', name: 'MSA, Beta Corp (signed)', text: B },
    ],
    questions: [{ id: 'Q4', question: 'Is assignment permitted?', type: 'classify', options: ['yes', 'no', 'consent required'] }],
    cells: [
      { documentId: 'asg-1', questionId: 'Q4', answer: 'No — consent required', quote: ASG_TEXT },
      { documentId: 'msa-2', questionId: 'Q4', answer: 'Yes, to a merger successor', quote: 'Neither party is liable for indirect damages.' },
    ],
  });
  const c1 = out.cells.find((x) => x.documentId === 'asg-1')!;
  const c2 = out.cells.find((x) => x.documentId === 'msa-2')!;
  assert.equal(c1.status, 'answered');
  assert.equal(c1.schema?.matched, 'consent required'); // longest contained option
  assert.equal(c2.status, 'answered');
  assert.equal(c2.schema?.matched, 'yes');
});

test('duration answers are machine-checked against schema bounds', () => {
  const out = buildMatrix({
    documents: INPUT.documents,
    questions: [{ id: 'Q1', question: 'What is the term?', type: 'duration', bounds: { min: 1, max: 120, unit: 'months' } }],
    cells: [
      { documentId: 'nda-1', questionId: 'Q1', answer: '3 years from the Effective Date', quote: 'continues for three (3) years' },
      { documentId: 'msa-2', questionId: 'Q1', answer: '99 years', quote: 'Term: two (2) years from the Effective Date' },
    ],
  });
  const ok = out.cells.find((x) => x.documentId === 'nda-1')!;
  const bad = out.cells.find((x) => x.documentId === 'msa-2')!;
  assert.equal(ok.status, 'answered');
  assert.equal(ok.schema?.value, 36); // 3 years -> months
  assert.equal(bad.status, 'unverified');
  assert.equal(bad.unverifiedReason, 'constraint_violation'); // 99 years = 1188 months > 120
});

test('currency answers must carry a parseable amount (fictional figures)', () => {
  const out = buildMatrix({
    documents: [
      { id: 'liab-1', name: 'Liability clause (fictional)', text: 'Disclosing party\'s total liability is limited to $50,000.' },
      { id: 'nda-1', name: 'NDA, "Acme" side (draft 2)', text: A },
    ],
    questions: [{ id: 'Q3', question: 'What is the liability cap?', type: 'currency', bounds: { min: 1, max: 10000000 } }],
    cells: [
      { documentId: 'liab-1', questionId: 'Q3', answer: '$50,000 total', quote: 'Disclosing party\'s total liability is limited to $50,000.' },
      { documentId: 'nda-1', questionId: 'Q3', answer: 'Fees paid in the preceding 12 months', quote: 'Liability is capped at the fees paid in the preceding twelve months.' },
    ],
  });
  const ok = out.cells.find((x) => x.documentId === 'liab-1')!;
  const bad = out.cells.find((x) => x.documentId === 'nda-1')!;
  assert.equal(ok.status, 'answered');
  assert.equal(ok.schema?.value, 50000);
  assert.equal(bad.status, 'unverified');
  assert.equal(bad.unverifiedReason, 'constraint_violation'); // no currency amount in answer
});

test('date answers must parse as calendar dates', () => {
  const docs = [...INPUT.documents, { id: 'dated-3', name: 'Dated letter (fictional)', text: 'This Agreement is entered into as of March 5, 2025 by the parties below.' }];
  const out = buildMatrix({
    documents: docs,
    questions: [{ id: 'Q6', question: 'What is the effective date?', type: 'date' }],
    cells: [
      { documentId: 'dated-3', questionId: 'Q6', answer: 'March 5, 2025', quote: 'This Agreement is entered into as of March 5, 2025 by the parties below.' },
      { documentId: 'nda-1', questionId: 'Q6', answer: 'the Effective Date', quote: 'This Agreement commences on the Effective Date and continues for three (3) years.' },
    ],
  });
  const ok = out.cells.find((x) => x.documentId === 'dated-3')!;
  const bad = out.cells.find((x) => x.documentId === 'nda-1')!;
  assert.equal(ok.status, 'answered');
  assert.equal(bad.status, 'unverified');
  assert.equal(bad.unverifiedReason, 'constraint_violation');
});

test('verbatim answers must appear in the document text', () => {
  const out = buildMatrix({
    documents: INPUT.documents,
    questions: [{ id: 'Q5', question: 'What law governs?', type: 'verbatim' }],
    cells: [
      { documentId: 'msa-2', questionId: 'Q5', answer: 'Delaware', quote: 'This Agreement is governed by Delaware law.' },
      { documentId: 'nda-1', questionId: 'Q5', answer: 'Delaware law applies here', quote: 'Liability is capped at the fees paid in the preceding twelve months.' },
    ],
  });
  const ok = out.cells.find((x) => x.documentId === 'msa-2')!;
  const bad = out.cells.find((x) => x.documentId === 'nda-1')!;
  assert.equal(ok.status, 'answered');
  assert.equal(bad.status, 'unverified');
  assert.equal(bad.unverifiedReason, 'constraint_violation');
});

test('notFound states map to their own unverified reasons', () => {
  const out = buildMatrix({
    ...INPUT,
    cells: [
      { documentId: 'msa-2', questionId: 'Q3', notFound: 'unclear' },
      { documentId: 'nda-1', questionId: 'Q3', notFound: 'needs_review', answer: 'Fees paid in the preceding twelve months', quote: 'Liability is capped at the fees paid in the preceding twelve months.' },
    ],
  });
  const unclear = out.cells.find((x) => x.documentId === 'msa-2' && x.questionId === 'Q3')!;
  const needs = out.cells.find((x) => x.documentId === 'nda-1' && x.questionId === 'Q3')!;
  assert.equal(unclear.status, 'unverified');
  assert.equal(unclear.unverifiedReason, 'unclear');
  assert.equal(needs.status, 'unverified');
  assert.equal(needs.unverifiedReason, 'needs_review');
});

test('per-column summary reports verification workload per question', () => {
  const out = buildMatrix({
    ...INPUT,
    cells: INPUT.cells.map((c) => (c.documentId === 'msa-2' && c.questionId === 'Q3' ? { documentId: 'msa-2', questionId: 'Q3', notFound: 'not_present' } : c)),
  });
  assert.equal(out.summary.columns.length, 3);
  const q3 = out.summary.columns.find((col) => col.questionId === 'Q3')!;
  assert.equal(q3.answered, 1);
  assert.equal(q3.unverified, 1);
  assert.equal(q3.reasons.not_present, 1);
  assert.equal(out.summary.columns[0].questionId, 'Q1');
});

test('minority classify value in a column is flagged outlier_value but stays answered', () => {
  const docs = [1, 2, 3, 4, 5].map((i) => ({ id: `d${i}`, name: `Doc ${i} (fictional)`, text: 'Disputes are resolved by binding arbitration in Seattle.' }));
  const cells = docs.map((d, i) => ({
    documentId: d.id,
    questionId: 'QF',
    answer: i < 4 ? 'arbitration' : 'mediation',
    quote: 'Disputes are resolved by binding arbitration in Seattle.',
  }));
  const out = buildMatrix({
    documents: docs,
    questions: [{ id: 'QF', question: 'How are disputes resolved?', type: 'classify', options: ['arbitration', 'mediation', 'litigation'] }],
    cells,
  });
  const minority = out.cells.find((c) => c.documentId === 'd5')!;
  const majority = out.cells.find((c) => c.documentId === 'd1')!;
  assert.equal(minority.status, 'answered'); // answer kept
  assert.ok(minority.flags.includes('outlier_value'));
  assert.equal(majority.status, 'answered');
  assert.equal(majority.flags.length, 0);
  assert.equal(out.summary.outliers, 1);
});

test('uniform classify column raises no outlier flags', () => {
  const docs = [1, 2, 3].map((i) => ({ id: `d${i}`, name: `Doc ${i} (fictional)`, text: 'This Agreement is governed by Delaware law.' }));
  const out = buildMatrix({
    documents: docs,
    questions: [{ id: 'QG', question: 'Governing law?', type: 'classify', options: ['Delaware', 'New York'] }],
    cells: docs.map((d) => ({ documentId: d.id, questionId: 'QG', answer: 'Delaware', quote: 'This Agreement is governed by Delaware law.' })),
  });
  assert.equal(out.summary.outliers, 0);
  assert.ok(out.cells.every((c) => c.flags.length === 0));
});

test('diffMatrices: changing one answer yields exactly one changed cell', () => {
  const prev = buildMatrix(INPUT);
  const next = buildMatrix({
    ...INPUT,
    cells: INPUT.cells.map((c) =>
      c.documentId === 'nda-1' && c.questionId === 'Q1' ? { ...c, answer: 'Thirty-six (36) months from the Effective Date' } : c,
    ),
  });
  const diff = diffMatrices(prev, next);
  assert.equal(diff.summary.changed, 1);
  assert.equal(diff.summary.unchanged, 5);
  assert.equal(diff.summary.added, 0);
  assert.equal(diff.summary.removed, 0);
  const changed = diff.cells.filter((c) => c.changed);
  assert.equal(changed.length, 1);
  assert.equal(changed[0].documentId, 'nda-1');
  assert.equal(changed[0].questionId, 'Q1');
  assert.equal(changed[0].prev?.answer, '3 years from the Effective Date');
  assert.equal(changed[0].next?.answer, 'Thirty-six (36) months from the Effective Date');
});

test('diffMatrices: added and removed documents produce added/removed cells', () => {
  const prev = buildMatrix(INPUT);
  const withExtra = buildMatrix({
    ...INPUT,
    documents: [...INPUT.documents, { id: 'extra-1', name: 'Extra doc (fictional)', text: 'Term: one (1) year.' }],
    cells: [...INPUT.cells, { documentId: 'extra-1', questionId: 'Q1', answer: '1 year', quote: 'Term: one (1) year.' }],
  });
  const added = diffMatrices(prev, withExtra);
  assert.equal(added.summary.added, 3); // 3 questions × new doc
  assert.equal(added.cells.find((c) => c.documentId === 'extra-1' && c.questionId === 'Q1')!.added, true);
  const removed = diffMatrices(withExtra, prev);
  assert.equal(removed.summary.removed, 3);
});

test('toSourcesCSV emits one row per cell and main CSV gains a Verified column', () => {
  const out = buildMatrix(INPUT);
  const src = toSourcesCSV(INPUT, out);
  const lines = src.split('\r\n');
  assert.equal(lines[0], 'Document,Question,Verbatim,Span,Pinpoint,Classification');
  assert.equal(lines.length - 2, out.summary.cells); // rows == cells (trailing CRLF)
  const okRow = lines.find((l) => l.includes('continues for three (3) years'))!;
  assert.ok(/\d+-\d+/.test(okRow)); // char span present
  assert.ok(okRow.includes('exact'));
  const csv = toCSV(INPUT, out);
  assert.ok(csv.split('\r\n')[0].endsWith(',Verified')); // reviewer sign-off column
});

test('ma-diligence template parses as a typed Question[]', () => {
  const tpl = JSON.parse(readFileSync(new URL('../templates/ma-diligence.json', import.meta.url), 'utf8'));
  assert.ok(Array.isArray(tpl));
  assert.ok(tpl.length >= 5);
  const ids = new Set<string>();
  const TYPES = ['classify', 'date', 'duration', 'currency', 'number', 'verbatim', 'free'];
  for (const q of tpl) {
    assert.equal(typeof q.id, 'string');
    assert.equal(typeof q.question, 'string');
    assert.ok(!ids.has(q.id));
    ids.add(q.id);
    assert.ok(TYPES.includes(q.type));
    if (q.type === 'classify') assert.ok(q.options.length >= 2);
    if (q.type === 'duration' || q.type === 'currency' || q.type === 'number') {
      assert.equal(typeof q.bounds.min, 'number');
      assert.equal(typeof q.bounds.max, 'number');
    }
  }
});

test('demo templates mirror templates/ma-diligence.json (no drift)', () => {
  const tpl = JSON.parse(readFileSync(new URL('../templates/ma-diligence.json', import.meta.url), 'utf8'));
  const js = readFileSync(new URL('../demo/templates.js', import.meta.url), 'utf8');
  const m = js.match(/export default\s*(\[[\s\S]*?\])\s*;/);
  assert.ok(m, 'demo/templates.js must export a JSON array literal');
  assert.deepEqual(JSON.parse(m[1]), tpl);
});

test('golden: buildMatrix(examples/input.json) matches examples/output.json', () => {
  const input = JSON.parse(readFileSync(new URL('../examples/input.json', import.meta.url), 'utf8'));
  const golden = JSON.parse(readFileSync(new URL('../examples/output.json', import.meta.url), 'utf8'));
  assert.deepEqual(buildMatrix(input), golden);
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
test('core/core.js port stays in sync with the TypeScript core', async () => {
  const js = await import('./core.js');
  for (const fn of ['buildMatrix', 'toCSV', 'toMarkdown', 'toSourcesCSV', 'diffMatrices', 'csvEscape']) {
    assert.equal(typeof js[fn], 'function', 'core.js must export ' + fn);
  }
  const input = JSON.parse(readFileSync(new URL('../examples/input.json', import.meta.url), 'utf8'));
  assert.deepEqual(js.buildMatrix(input), buildMatrix(input));
  const out = js.buildMatrix(input);
  assert.equal(js.toCSV(input, out), toCSV(input, out));
  assert.equal(js.toMarkdown(input, out), toMarkdown(input, out));
  // The worked example is untyped (classify-only), so it never exercises the
  // typed paths. A typed mini-fixture pins parity for checkSchema (via
  // buildMatrix on date/duration/currency/classify, including a
  // constraint_violation) and the sources/diff exporters too.
  const typed: MatrixInput = {
    documents: [
      {
        id: 'kf-1',
        name: 'KOAN-FLUX "Vela" MoU (rev 3)',
        text: 'The pilot commences 3 March 2025 and runs for six (6) months. Fees are capped at $75,000 USD per quarter. Disputes go to Delaware courts.',
      },
    ],
    questions: [
      { id: 'T1', question: 'Commencement date', type: 'date' },
      { id: 'T2', question: 'Pilot length', type: 'duration', bounds: { min: 1, max: 24, unit: 'months' } },
      { id: 'T3', question: 'Quarterly fee cap', type: 'currency' },
      { id: 'T4', question: 'Governing forum', type: 'classify', options: ['Delaware', 'New York'] },
    ],
    cells: [
      { documentId: 'kf-1', questionId: 'T1', answer: '3 March 2025', quote: 'commences 3 March 2025', pinpoint: '§ 1.1' },
      { documentId: 'kf-1', questionId: 'T2', answer: 'six (6) months', quote: 'runs for six (6) months' },
      { documentId: 'kf-1', questionId: 'T3', answer: '$75,000 USD', quote: 'capped at $75,000 USD per quarter', pinpoint: '§ 4.2' },
      { documentId: 'kf-1', questionId: 'T4', answer: 'Banana', quote: 'Disputes go to Delaware courts.' },
    ],
  };
  assert.deepEqual(js.buildMatrix(typed), buildMatrix(typed));
  // pins the scaled-currency + orphan join-key paths in the core.js port too
  const fixed: MatrixInput = {
    documents: [
      {
        id: 'kf-1',
        name: 'KOAN-FLUX "Vela" MoU (rev 3)',
        text: 'The pilot commences 3 March 2025 and runs for six (6) months. Fees are capped at $1.5 million per quarter. Disputes go to Delaware courts.',
      },
    ],
    questions: [
      { id: 'T3', question: 'Quarterly fee cap', type: 'currency', bounds: { min: 1, max: 2000000 } },
      { id: 'T4', question: 'Governing forum', type: 'classify', options: ['Delaware', 'New York'] },
    ],
    cells: [
      { documentId: 'kf-1', questionId: 'T3', answer: '$1.5 million per quarter', quote: 'capped at $1.5 million per quarter' },
      { documentId: 'ghost-doc', questionId: 'T3', answer: 'USD 2 million', quote: 'anything' },
      { documentId: 'kf-1', questionId: 'T99', answer: 'Delaware', quote: 'Disputes go to Delaware courts.' },
    ],
  };
  const fTs = buildMatrix(fixed);
  assert.equal(fTs.cells.find((c) => c.questionId === 'T3' && c.documentId === 'kf-1')!.schema?.value, 1500000); // sanity: scale folded in
  assert.equal(fTs.cells.find((c) => c.documentId === 'ghost-doc')!.unverifiedReason, 'no_such_document'); // sanity: orphan surfaced
  assert.equal(fTs.cells.find((c) => c.questionId === 'T99')!.unverifiedReason, 'no_such_question'); // sanity: orphan surfaced
  assert.deepEqual(js.buildMatrix(fixed), fTs);
  const tOut = buildMatrix(typed);
  assert.equal(tOut.cells.find((c) => c.questionId === 'T4')!.status, 'unverified'); // sanity: constraint_violation path reached
  assert.equal(js.toSourcesCSV(typed, tOut), toSourcesCSV(typed, tOut));
  const reRun = buildMatrix({ ...typed, cells: typed.cells.filter((c) => c.questionId !== 'T3') });
  assert.deepEqual(js.diffMatrices(tOut, reRun), diffMatrices(tOut, reRun));
});

test('currencyAmount folds scale words in exactly — never silently drops them', () => {
  assert.equal(currencyAmount('$1.5 million'), 1500000); // was: 1.5 (scale silently dropped)
  assert.equal(currencyAmount('USD 1.5 million'), 1500000);
  assert.equal(currencyAmount('1.5 million USD'), 1500000);
  assert.equal(currencyAmount('£2m'), 2000000);
  assert.equal(currencyAmount('$750k'), 750000);
  assert.equal(currencyAmount('$1.5bn'), 1500000000);
  assert.equal(currencyAmount('$1,234.56 thousand'), 1234560); // decimal shift is exact, no float drift
  assert.equal(currencyAmount('$1.5 million and $2.5 million'), 1500000); // first amount wins deterministically
  assert.equal(currencyAmount('$50,000'), 50000); // unscaled form unchanged
  assert.equal(currencyAmount('up to $ million total'), null); // scale with no amount is unparseable, never a guess
  assert.equal(currencyAmount('fees as agreed'), null);
});

test('a scaled currency answer can never certify as its mantissa', () => {
  const text = 'Aggregate liability shall not exceed $1.5 million.';
  const out = buildMatrix({
    documents: [{ id: 'cap-1', name: 'Liability cap (fictional)', text }],
    questions: [{ id: 'QC', question: 'What is the liability cap?', type: 'currency', bounds: { min: 1, max: 10000000 } }],
    cells: [{ documentId: 'cap-1', questionId: 'QC', answer: '$1.5 million', quote: 'Aggregate liability shall not exceed $1.5 million.' }],
  });
  const c = out.cells[0];
  assert.equal(c.status, 'answered');
  assert.equal(c.schema?.value, 1500000); // not 1.5
  // and with a cap the mantissa would pass but the real amount violates:
  const tight = buildMatrix({
    documents: [{ id: 'cap-1', name: 'Liability cap (fictional)', text }],
    questions: [{ id: 'QC', question: 'What is the liability cap?', type: 'currency', bounds: { min: 1, max: 100000 } }],
    cells: [{ documentId: 'cap-1', questionId: 'QC', answer: '$1.5 million', quote: 'Aggregate liability shall not exceed $1.5 million.' }],
  });
  const t = tight.cells[0];
  assert.equal(t.status, 'unverified');
  assert.equal(t.unverifiedReason, 'constraint_violation');
});

test('a supplied cell referencing an unknown document surfaces as no_such_document, never vanishes', () => {
  const out = buildMatrix({
    ...INPUT,
    cells: [...INPUT.cells, { documentId: 'ghost', questionId: 'Q1', answer: '3 years', quote: 'continues for three (3) years' }],
  });
  const ghost = out.cells.find((c) => c.documentId === 'ghost')!;
  assert.ok(ghost, 'ghost cell must appear in output');
  assert.equal(ghost.status, 'unverified');
  assert.equal(ghost.unverifiedReason, 'no_such_document');
  assert.equal(ghost.answer, null);
  assert.equal(out.summary.cells, INPUT.documents.length * INPUT.questions.length + 1); // 6 grid + 1 ghost
  const q1 = out.summary.columns.find((col) => col.questionId === 'Q1')!;
  assert.equal(q1.reasons.no_such_document, 1);
  assert.equal(out.summary.unverified, 2); // msa-2 Q3 not_answered + ghost
});

test('a supplied cell referencing an unknown question surfaces as no_such_question', () => {
  const out = buildMatrix({
    ...INPUT,
    cells: [...INPUT.cells, { documentId: 'nda-1', questionId: 'Q99', answer: '3 years', quote: 'continues for three (3) years' }],
  });
  const ghost = out.cells.find((c) => c.questionId === 'Q99')!;
  assert.ok(ghost, 'ghost question cell must appear in output');
  assert.equal(ghost.status, 'unverified');
  assert.equal(ghost.unverifiedReason, 'no_such_question');
  assert.equal(ghost.answer, null);
  assert.equal(out.summary.cells, 7); // 6 grid + 1 orphan
});

test('bestWindowIn (cached locator) is byte-identical to the naive per-window scan', () => {
  // deterministic pseudo-random fixture (seeded LCG — no Math.random)
  let seed = 42;
  const rnd = (n: number): number => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
  const WORDS = ['agreement', 'terminate', 'liability', 'Delaware', 'notice', 'thirty', 'days', 'confidential', 'party', 'fees'];
  for (let trial = 0; trial < 30; trial++) {
    const src = Array.from({ length: 40 + rnd(60) }, () => WORDS[rnd(WORDS.length)]).join(' ');
    const quote = Array.from({ length: 3 + rnd(8) }, () => WORDS[rnd(WORDS.length)]).join(' ');
    const loc = makeLocator(src);
    const got = bestWindowIn(loc, quote);
    // naive reference: rebuild the multiset for every window (pre-optimization semantics)
    const S = tokenizeWithSpans(src);
    const q = quote.toLowerCase().match(/[a-z0-9.]+/g) ?? [];
    const qSet = new Map<string, number>();
    for (const t of q) qSet.set(t, (qSet.get(t) ?? 0) + 1);
    let want: { score: number; coverage: number; start: number; end: number; verbatim: string } | null = null;
    for (let size = Math.max(1, q.length - 2); size <= q.length + 6; size++) {
      for (let st = 0; st + size <= S.length; st++) {
        const wSet = new Map<string, number>();
        for (const t of S.slice(st, st + size)) wSet.set(t.norm, (wSet.get(t.norm) ?? 0) + 1);
        let inter = 0;
        for (const [tok, c] of qSet) inter += Math.min(c, wSet.get(tok) ?? 0);
        const union = q.length + size - inter;
        const score = union === 0 ? 1 : inter / union;
        const coverage = inter / q.length;
        if (!want || score > want.score || (score === want.score && coverage > want.coverage)) {
          want = { score, coverage, start: S[st].start, end: S[st + size - 1].end, verbatim: src.slice(S[st].start, S[st + size - 1].end) };
        }
      }
    }
    assert.deepEqual(got, want);
  }
});

test('perf: one cached locator verifies a full row of quotes on a large document quickly', () => {
  const para = 'The parties agree that the confidentiality obligations survive termination and governing law is Delaware with arbitration in Seattle. ';
  const text = para.repeat(1500); // ~22k tokens
  const docs = [{ id: 'big-1', name: 'Big agreement (fictional)', text }];
  const questions = Array.from({ length: 40 }, (_, i) => ({ id: `QP${i}`, question: `q${i}` }));
  const cells = questions.map((q, i) => ({
    documentId: 'big-1',
    questionId: q.id,
    answer: `answer ${i}`,
    quote: `governing law is Delaware with arbitration in Seattle and more words drift ${i}`,
  }));
  const t0 = Date.now();
  const out = buildMatrix({ documents: docs, questions, cells });
  const ms = Date.now() - t0;
  assert.equal(out.summary.cells, 40);
  // before the per-document locator cache this fixture took ~7s (every cell
  // re-tokenized the document and rebuilt per-window multisets); budget 3s
  // leaves >6x headroom over the cached path.
  assert.ok(ms < 3000, `40 quote verifications on one ~22k-token document took ${ms}ms (budget 3000ms)`);
});

test('examples/diff.json is the deterministic re-run diff of the worked example', () => {
  const diff = JSON.parse(readFileSync(new URL('../examples/diff.json', import.meta.url), 'utf8'));
  assert.deepEqual(diff.summary, { added: 0, removed: 0, changed: 1, unchanged: 14 });
  const changed = diff.cells.filter((c: any) => c.changed);
  assert.equal(changed.length, 1);
  assert.equal(changed[0].documentId, 'harbor-saas');
  assert.equal(changed[0].questionId, 'Q5');
  assert.equal(changed[0].prev?.unverifiedReason, 'quote_not_verified');
  assert.equal(changed[0].next?.status, 'answered');
});

