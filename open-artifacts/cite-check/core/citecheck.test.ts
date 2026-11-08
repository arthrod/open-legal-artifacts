import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCiteCheck, renderReport } from './citecheck';
import type { CiteCheckInput } from './citecheck';
import { parsePinpoint } from './pinpoint';
import { similarity } from './textutil';

const DEPO: CiteCheckInput = {
  document: { name: "Petitioner’s Brief" },
  sources: [
    {
      id: 'okafor-depo',
      name: 'Deposition of Sandra Okafor (Jan. 14, 2026)',
      pages: [
        {
          number: 11,
          text: 'Q. What happened at the loading dock? A. The trailer arrived at the dock around 4 p.m. and the seal was already broken when our team inspected it.',
        },
        {
          number: 12,
          text: 'Q. Who signed the delivery receipt? A. Mr. Beltran signed the delivery receipt at 4:20 p.m. without noting any exception on the document.',
        },
        {
          number: 15,
          text: 'Q. Was the cargo ever weighed? A. We weighed the pallets the next morning and found a shortfall of 340 kilograms.',
        },
      ],
    },
  ],
  quotes: [
    { id: 'Q1', text: 'Mr. Beltran signed the delivery receipt at 4:20 p.m. without noting any exception on the document.', sourceId: 'okafor-depo', pinpoint: 'p. 12' },
    { id: 'Q2', text: 'mr. beltran signed the delivery receipt at 4:20 p.m. — without noting any exception', sourceId: 'okafor-depo', pinpoint: 'p. 12' },
    { id: 'Q3', text: 'Mr. Beltran signed the delivery receipt without noting any exception on the document at the loading dock', sourceId: 'okafor-depo', pinpoint: 'p. 12' },
    { id: 'Q4', text: 'The trailer was unloaded by a night crew while the driver waited outside the gate.', sourceId: 'okafor-depo', pinpoint: 'p. 12' },
    { id: 'Q5', text: 'Mr. Beltran signed the delivery receipt at 4:20 p.m. without noting any exception on the document.', sourceId: 'okafor-depo', pinpoint: 'p. 15' },
    { id: 'Q6', text: 'We weighed the pallets the next morning and found a shortfall of 340 kilograms.', sourceId: 'okafor-depo', pinpoint: 'at 15' },
    { id: 'Q7', text: 'The seal was intact.', sourceId: 'ghost-doc' },
  ],
};

test('exact quote is classified exact with a verbatim anchor', () => {
  const r = runCiteCheck(DEPO).results.find((x) => x.id === 'Q1')!;
  assert.equal(r.classification, 'exact');
  assert.equal(r.similarity, 1);
  assert.equal(r.anchor?.segmentKind, 'page');
  assert.equal(r.anchor?.segmentLabel, '12');
  assert.ok(r.anchor!.verbatim.includes('Beltran signed the delivery receipt'));
  assert.equal(r.pinpoint?.status, 'ok');
});

test('case/punctuation drift is classified normalized', () => {
  const r = runCiteCheck(DEPO).results.find((x) => x.id === 'Q2')!;
  assert.equal(r.classification, 'normalized');
  assert.equal(r.anchor?.segmentLabel, '12');
});

test('paraphrase lands in fuzzy with similarity below 1', () => {
  const r = runCiteCheck(DEPO).results.find((x) => x.id === 'Q3')!;
  assert.equal(r.classification, 'fuzzy');
  assert.ok(r.similarity >= 0.7 && r.similarity < 0.95, `similarity ${r.similarity}`);
  assert.ok(r.notes.some((n) => n.includes('human review')));
});

test('unsupported quote is not_found, best candidate kept as evidence only', () => {
  const r = runCiteCheck(DEPO).results.find((x) => x.id === 'Q4')!;
  assert.equal(r.classification, 'not_found');
  assert.equal(r.anchor, null);
  assert.ok(r.bestCandidate !== null); // closest window, clearly not a verification
});

test('wrong page pinpoint is flagged as mismatch', () => {
  const r = runCiteCheck(DEPO).results.find((x) => x.id === 'Q5')!;
  assert.equal(r.classification, 'exact');
  assert.equal(r.pinpoint?.status, 'mismatch');
  assert.ok(r.pinpoint!.detail.includes('located on 12'));
});

test('"at 15" parses as a page pinpoint and validates', () => {
  const r = runCiteCheck(DEPO).results.find((x) => x.id === 'Q6')!;
  assert.deepEqual(r.pinpoint?.parsed, { kind: 'page', from: 15 });
  assert.equal(r.pinpoint?.status, 'ok');
});

test('missing source is not_found with an explanatory note', () => {
  const r = runCiteCheck(DEPO).results.find((x) => x.id === 'Q7')!;
  assert.equal(r.classification, 'not_found');
  assert.ok(r.notes.some((n) => n.includes('not provided')));
});

test('summary counts match classifications', () => {
  const s = runCiteCheck(DEPO).summary;
  assert.equal(s.total, 7);
  assert.equal(s.exact, 3); // Q1, Q5, Q6
  assert.equal(s.normalized, 1); // Q2
  assert.equal(s.fuzzy, 1); // Q3
  assert.equal(s.not_found, 2); // Q4, Q7
});

test('report renders a markdown table with every quote', () => {
  const md = renderReport(runCiteCheck(DEPO));
  assert.ok(md.includes('# Cite check — Petitioner’s Brief'));
  for (const id of ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7']) assert.ok(md.includes(`| ${id} |`), id);
  assert.ok(md.includes('PINPOINT ISSUE'));
});

test('sections and paragraphs anchor and validate', () => {
  const input: CiteCheckInput = {
    document: { name: 'Memo' },
    sources: [
      {
        id: 'msa',
        name: 'Master Services Agreement',
        sections: [
          { label: '5.2', text: 'Customer may terminate this Agreement for convenience upon ninety (90) days prior written notice.' },
          { label: '9.1', text: 'Neither party shall be liable for indirect or consequential damages.' },
        ],
        paragraphs: [{ number: 8, text: 'The witness recalled that the alarm sounded twice before midnight.' }],
      },
    ],
    quotes: [
      { id: 'S1', text: 'Customer may terminate this Agreement for convenience upon ninety (90) days prior written notice.', sourceId: 'msa', pinpoint: '§ 5.2' },
      { id: 'S2', text: 'Customer may terminate this Agreement for convenience upon ninety (90) days prior written notice.', sourceId: 'msa', pinpoint: '§ 9.1' },
      { id: 'P1', text: 'The witness recalled that the alarm sounded twice before midnight.', sourceId: 'msa', pinpoint: '¶ 8' },
    ],
  };
  const res = runCiteCheck(input).results;
  assert.equal(res[0].classification, 'exact');
  assert.equal(res[0].pinpoint?.status, 'ok');
  assert.equal(res[1].pinpoint?.status, 'mismatch');
  assert.equal(res[2].anchor?.segmentKind, 'paragraph');
  assert.equal(res[2].pinpoint?.status, 'ok');
});

test('pinpoint parser handles the documented forms and rejects the rest', () => {
  assert.deepEqual(parsePinpoint('p. 12'), { kind: 'page', from: 12 });
  assert.deepEqual(parsePinpoint('pp. 12-13'), { kind: 'page', from: 12, to: 13 });
  assert.deepEqual(parsePinpoint('at 123'), { kind: 'page', from: 123 });
  assert.deepEqual(parsePinpoint('§ 5.2'), { kind: 'section', label: '5.2' });
  assert.deepEqual(parsePinpoint('Sec. 5'), { kind: 'section', label: '5' });
  assert.deepEqual(parsePinpoint('¶ 8'), { kind: 'paragraph', number: 8 });
  assert.deepEqual(parsePinpoint('Para. 8'), { kind: 'paragraph', number: 8 });
  assert.equal(parsePinpoint('somewhere in there'), null);
});

test('similarity is symmetric and bounded', () => {
  const a = 'the trailer arrived at the dock around 4 p.m.';
  assert.equal(similarity(a, a), 1);
  assert.equal(similarity(a, 'something else entirely') < 0.3, true);
});

test('number guard caps a near-verbatim quote with an altered digit at fuzzy, with a note', () => {
  const text = 'The auditor determined that the total loss attributable to the February pipe failure was 34,800 dollars, covering repairs, replacement parts, and three days of lost production at the Millbrook plant, and the report was signed on March 9 by the lead engineer.';
  const input: CiteCheckInput = {
    document: { name: 'Motion (fictional)' },
    sources: [{ id: 'audit', name: 'Audit Report (fictional)', text }],
    quotes: [{ id: 'N1', text: text.replace('34,800', '35,800'), sourceId: 'audit' }],
  };
  const r = runCiteCheck(input).results[0];
  assert.equal(r.classification, 'fuzzy', JSON.stringify(r));
  assert.ok(r.notes.some((n) => n.includes('quote "35" vs source "34"')), JSON.stringify(r.notes));
  assert.ok(r.diff!.some((o) => o.op === 'replace' && o.quote.includes('35') && o.source.includes('34')), JSON.stringify(r.diff));
});

test('omission detection flags silently dropped tokens (Q2 fixture)', () => {
  const r = runCiteCheck(DEPO).results.find((x) => x.id === 'Q2')!;
  assert.equal(r.classification, 'normalized');
  assert.ok(r.notes.some((n) => n.includes('omits "on the document"')), JSON.stringify(r.notes));
  assert.ok(r.anchor!.verbatim.endsWith('on the document'), r.anchor!.verbatim);
  const del = r.diff!.find((o) => o.op === 'delete')!;
  assert.equal(del.source.join(' '), 'on the document');
  assert.equal(r.anchor!.verbatim.slice(del.sourceSpan.start, del.sourceSpan.end), 'on the document');
  assert.equal(del.sourceSpan.end, r.anchor!.verbatim.length);
});

test('explicit ellipsis makes an omission acceptable (noted, still normalized)', () => {
  const text = 'The auditor determined that the total loss attributable to the February pipe failure was 34,800 dollars, covering repairs, replacement parts, and three days of lost production at the Millbrook plant, and the report was signed on March 9 by the lead engineer.';
  const input: CiteCheckInput = {
    document: { name: 'Motion (fictional)' },
    sources: [{ id: 'audit', name: 'Audit Report (fictional)', text }],
    quotes: [{ id: 'E1', text: text.replace('covering repairs, replacement parts,', 'covering repairs …'), sourceId: 'audit' }],
  };
  const r = runCiteCheck(input).results[0];
  assert.equal(r.classification, 'normalized', JSON.stringify(r.notes));
  assert.ok(r.notes.some((n) => n.includes('ellipsis') && n.includes('replacement parts')), JSON.stringify(r.notes));
});

test('coverage roll-up reports Checked N of M and never claims confirmation for unchecked quotes', () => {
  const sub: CiteCheckInput = {
    ...DEPO,
    quotes: [DEPO.quotes[0], DEPO.quotes[1], DEPO.quotes[2], DEPO.quotes[3]],
  };
  const report = runCiteCheck(sub);
  assert.equal(report.summary.checked, 3);
  assert.equal(report.summary.couldNotCheck, 1);
  assert.equal(report.summary.unparseablePinpoints, 0);
  const md = renderReport(report);
  assert.ok(md.includes('Checked 3 of 4'), md.slice(0, 300));
  assert.ok(md.includes('never reported as "confirmed"'));
});

test('unverifiable pinpoint details distinguish missing source, unlocated quote, and missing segments', () => {
  const ghost: CiteCheckInput = {
    ...DEPO,
    quotes: [{ id: 'G1', text: 'The seal was intact.', sourceId: 'ghost-doc', pinpoint: 'p. 3' }],
  };
  const g = runCiteCheck(ghost).results[0];
  assert.equal(g.pinpoint?.status, 'unverifiable');
  assert.ok(g.pinpoint!.detail.includes('source not provided'), g.pinpoint!.detail);

  const q4 = runCiteCheck(DEPO).results.find((x) => x.id === 'Q4')!;
  assert.equal(q4.pinpoint?.status, 'unverifiable');
  assert.ok(q4.pinpoint!.detail.includes('quote not located'), q4.pinpoint!.detail);

  const unsegmented: CiteCheckInput = {
    document: { name: 'Free text (fictional)' },
    sources: [{ id: 'f', name: 'Free-text Source', text: 'Some unsegmented free text.' }],
    quotes: [{ id: 'F1', text: 'Some unsegmented free text.', sourceId: 'f', pinpoint: 'p. 3' }],
  };
  const f = runCiteCheck(unsegmented).results[0];
  assert.equal(f.pinpoint?.status, 'unverifiable');
  assert.ok(f.pinpoint!.detail.includes('source does not declare page segments'), f.pinpoint!.detail);
});

test('runCiteCheck derives quotes from document.text when quotes are not supplied', () => {
  const input = {
    document: {
      name: 'Extracted brief (fictional)',
      text: 'She testified that “The seal was already broken.”[1]\n\n[1] Okafor Deposition, p. 11.',
    },
    sources: [{ id: 'okafor-depo', name: 'Okafor Deposition (fictional)', aliases: ['Okafor Deposition'], pages: [{ number: 11, text: 'A. The seal was already broken.' }] }],
  };
  const report = runCiteCheck(input as unknown as CiteCheckInput);
  assert.equal(report.summary.total, 1);
  assert.equal(report.results[0].classification, 'exact');
  assert.equal(report.results[0].id, 'Q1');
});
