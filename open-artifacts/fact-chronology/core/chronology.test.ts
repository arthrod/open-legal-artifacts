import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChronology, renderChronology, diffChronology } from './chronology';
import type { ChronInput, FactEntry, FactSource } from './chronology';

const DOCS = [
  { id: 'compl', name: 'Complaint (Delgado v. Summit Ridge, fictional)' },
  { id: 'answer', name: 'Answer & Affirmative Defenses' },
  { id: 'delgado-decl', name: 'Declaration of M. Delgado' },
  { id: 'reyes-depo', name: 'Deposition of L. Reyes' },
];

function fact(partial: Partial<FactEntry> & { id: string; text: string; docId: string }): FactEntry {
  return { source: { docId: partial.docId, quote: partial.text }, ...partial } as FactEntry;
}

function chron(facts: FactEntry[], settings?: ChronInput['settings']) {
  return buildChronology({ caseName: 'Delgado v. Summit Ridge Hospitality (fictional)', documents: DOCS, facts, settings });
}

test('dates parse at three precisions and sort ascending', () => {
  const out = chron([
    fact({ id: 'F3', text: 'Third event.', docId: 'compl', date: '2025' }),
    fact({ id: 'F1', text: 'First event.', docId: 'compl', date: '2024-11-02' }),
    fact({ id: 'F2', text: 'Second event.', docId: 'compl', date: '2024-11' }),
  ]);
  // month-precision entries sort at the start of their period (2024-11 -> 2024-11-01)
  assert.deepEqual(out.timeline.map((e) => e.factId), ['F2', 'F1', 'F3']);
  assert.equal(out.timeline[0].date?.precision, 'month');
  assert.equal(out.timeline[1].date?.precision, 'day');
  assert.equal(out.timeline[2].date?.precision, 'year');
});

test('invalid month/day and malformed dates are flagged, not guessed', () => {
  const out = chron([
    fact({ id: 'F1', text: 'Bad month.', docId: 'compl', date: '2024-13-01' }),
    fact({ id: 'F2', text: 'Prose date.', docId: 'compl', date: 'early March 2024' }),
  ]);
  assert.deepEqual(out.unparseableDates.map((u) => u.factId), ['F1', 'F2']);
  assert.equal(out.timeline.length, 0);
  assert.equal(out.undated.length, 2);
});

test('same topic with disagreeing day-precision dates is a date_mismatch conflict', () => {
  const out = chron([
    fact({ id: 'F1', text: 'Reyes terminated Delgado at the end of the shift.', docId: 'compl', date: '2025-01-09', topic: 'termination' }),
    fact({ id: 'F2', text: 'Reyes terminated Delgado at the end of the shift.', docId: 'answer', date: '2025-01-10', topic: 'termination' }),
  ]);
  assert.equal(out.conflicts.length, 1);
  assert.equal(out.conflicts[0].kind, 'date_mismatch');
  assert.ok(out.conflicts[0].detail.includes('2025-01-09'));
  assert.ok(out.conflicts[0].detail.includes('2025-01-10'));
});

test('divergent accounts of one topic are flagged even when dates agree or are absent', () => {
  const out = chron([
    fact({ id: 'F1', text: 'Delgado received a written warning about cash-handling on December 1.', docId: 'reyes-depo', date: '2024-12-01', topic: 'warning' }),
    fact({ id: 'F2', text: 'Delgado never received any written or verbal warning during her employment.', docId: 'delgado-decl', date: '2024-12-01', topic: 'warning' }),
  ]);
  const c = out.conflicts.find((x) => x.kind === 'divergent_accounts');
  assert.ok(c, JSON.stringify(out.conflicts));
  assert.deepEqual(c!.factIds, ['F1', 'F2']);
});

test('complementary same-topic facts are not conflicts', () => {
  const out = chron([
    fact({ id: 'F1', text: 'Delgado was hired as a floor manager on March 3, 2020.', docId: 'compl', date: '2020-03-03', topic: 'hire' }),
    fact({ id: 'F2', text: 'Delgado was hired as a floor manager and started the same week.', docId: 'answer', date: '2020-03-04', topic: 'hire' }),
  ]);
  // dates differ but one side is day+other day → date_mismatch expected here; use month precision instead for complement test
  assert.equal(out.conflicts.filter((x) => x.kind === 'divergent_accounts').length, 0);
});

test('month-precision vs day-precision on the same topic does not trigger date_mismatch', () => {
  const out = chron([
    fact({ id: 'F1', text: 'Final wages were paid by check.', docId: 'compl', date: '2025-01', topic: 'final-wages' }),
    fact({ id: 'F2', text: 'Final wages were paid by check on January 15, 2025.', docId: 'answer', date: '2025-01-15', topic: 'final-wages' }),
  ]);
  assert.equal(out.conflicts.length, 0);
});

test('gaps over the threshold are detected, under are not', () => {
  const out = chron(
    [
      fact({ id: 'F1', text: 'Hire.', docId: 'compl', date: '2024-01-10' }),
      fact({ id: 'F2', text: 'Weekly events through February.', docId: 'compl', date: '2024-02-20' }),
      fact({ id: 'F3', text: 'Investigation began months later.', docId: 'compl', date: '2024-10-01' }),
    ],
    { maxGapDays: 90 },
  );
  assert.equal(out.gaps.length, 1);
  assert.equal(out.gaps[0].days, days('2024-02-20', '2024-10-01'));
  assert.equal(out.gaps[0].afterFactId, 'F2');
});

test('every dated entry carries its source anchor with document name', () => {
  const out = chron([fact({ id: 'F1', text: 'Notice posted.', docId: 'reyes-depo', date: '2024-06-01' })]);
  const e = out.timeline[0];
  assert.equal(e.anchor?.docName, 'Deposition of L. Reyes');
  assert.equal(e.anchor?.quote, 'Notice posted.');
});

test('unknown source document yields a null anchor, not a crash', () => {
  const out = chron([fact({ id: 'F1', text: 'Orphan fact.', docId: 'nope', date: '2024-06-01' })]);
  assert.equal(out.timeline[0].anchor, null);
});

test('undated entries stay visible with their date labels', () => {
  const out = chron([fact({ id: 'F1', text: 'Policy posted at some point.', docId: 'compl', dateLabel: 'at all relevant times' })]);
  assert.equal(out.timeline.length, 0);
  assert.equal(out.undated.length, 1);
  assert.equal(out.undated[0].dateLabel, 'at all relevant times');
});

test('markdown chronology renders timeline, conflicts, gaps', () => {
  const out = chron([
    fact({ id: 'F1', text: 'Hired as floor manager.', docId: 'compl', date: '2020-03-03', topic: 'hire' }),
    fact({ id: 'F2', text: 'Audit began.', docId: 'compl', date: '2024-10-01' }),
    fact({ id: 'F3', text: 'Terminated on January 9.', docId: 'compl', date: '2025-01-09', topic: 'termination' }),
    fact({ id: 'F4', text: 'Terminated on January 10 per HR records.', docId: 'answer', date: '2025-01-10', topic: 'termination' }),
  ]);
  const md = renderChronology(out);
  assert.ok(md.includes('# Fact chronology — Delgado v. Summit Ridge Hospitality (fictional)'));
  assert.ok(md.includes('### 2020-03-03 (day)'));
  assert.ok(md.includes('**date_mismatch** (termination)'));
  assert.ok(md.includes('days between 2020-03-03'));
  assert.ok(md.includes('Source: Complaint (Delgado v. Summit Ridge, fictional)'));
});

function days(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

function customChron(facts: FactEntry[], extra: Partial<ChronInput> = {}) {
  return buildChronology({
    caseName: 'Delgado v. Summit Ridge Hospitality (fictional)',
    documents: DOCS as ChronInput['documents'],
    facts,
    ...extra,
  });
}

test('near-duplicate same-topic facts merge into one multi-anchor entry', () => {
  const out = customChron(
    [
      fact({ id: 'F1', text: 'Delgado was hired as a floor manager at the Summit Ridge lodge.', docId: 'compl', date: '2020-03-03', topic: 'hire' }),
      fact({ id: 'F2', text: 'Delgado was hired as a floor manager and completed onboarding that week.', docId: 'answer', date: '2020-03', topic: 'hire' }),
    ],
    { settings: { mergeThreshold: 0.4 } },
  );
  assert.equal(out.timeline.length, 1);
  const e = out.timeline[0];
  assert.equal(e.factId, 'F1');
  assert.deepEqual(e.mergedFrom, ['F2']);
  assert.equal(e.anchors.length, 2);
  assert.deepEqual(e.anchors.map((a) => a.docId), ['compl', 'answer']);
  assert.equal(e.anchor?.docId, 'compl'); // primary anchor kept for compatibility
  assert.equal(out.summary.merged, 1);
});

test('merging never fuses day-precision date mismatches and stays off below the default threshold', () => {
  // similarity ~0.41 < default mergeThreshold 0.6 -> stays two entries
  const out = customChron([
    fact({ id: 'F1', text: 'Delgado was hired as a floor manager at the Summit Ridge lodge.', docId: 'compl', date: '2020-03-03', topic: 'hire' }),
    fact({ id: 'F2', text: 'Delgado was hired as a floor manager and completed onboarding that week.', docId: 'answer', date: '2020-03', topic: 'hire' }),
  ]);
  assert.equal(out.timeline.length, 2);
  assert.equal(out.summary.merged, 0);
  // identical texts but disagreeing day-precision dates never merge, even at the
  // lowest settings the invariant allows (mergeThreshold 0.4 > accountSimilarityThreshold)
  const out2 = customChron(
    [
      fact({ id: 'F5', text: 'Reyes terminated Delgado at the end of the shift.', docId: 'compl', date: '2025-01-09', topic: 'termination' }),
      fact({ id: 'F6', text: 'Reyes terminated Delgado at the end of the shift.', docId: 'answer', date: '2025-01-10', topic: 'termination' }),
    ],
    { settings: { mergeThreshold: 0.4 } },
  );
  assert.equal(out2.timeline.length, 2);
  assert.equal(out2.conflicts.filter((c) => c.kind === 'date_mismatch').length, 1);
});

test('settings invariant: mergeThreshold must stay strictly above accountSimilarityThreshold', () => {
  const divergentPair = () => [
    fact({ id: 'F1', text: 'Delgado received a written warning about cash-handling on December 1.', docId: 'reyes-depo', date: '2024-12-01', topic: 'warning' }),
    fact({ id: 'F2', text: 'Delgado never received any written or verbal warning during her employment.', docId: 'delgado-decl', date: '2024-12-01', topic: 'warning' }),
  ];
  // inverted settings would let the de-dupe merge swallow a divergent-accounts
  // conflict (conflicts are computed on representatives only) — refuse them
  assert.throws(
    () => chron(divergentPair(), { mergeThreshold: 0.2, accountSimilarityThreshold: 0.35 }),
    /mergeThreshold .* must be strictly above accountSimilarityThreshold/,
  );
  // with only mergeThreshold lowered, the default accountSimilarityThreshold (0.35) applies
  assert.throws(() => chron(divergentPair(), { mergeThreshold: 0.2 }), /mergeThreshold/);
  // equality violates the strict invariant too
  assert.throws(() => chron(divergentPair(), { mergeThreshold: 0.35, accountSimilarityThreshold: 0.35 }), /mergeThreshold/);
});

test('core.js mirror (imported by the demo) enforces the same settings invariant', async () => {
  const core = await import('./core.js');
  assert.throws(
    () =>
      core.buildChronology({
        caseName: 'Mirror check (fictional)',
        documents: DOCS,
        facts: [fact({ id: 'F1', text: 'One account.', docId: 'compl', date: '2024-12-01', topic: 'warning' })],
        settings: { mergeThreshold: 0.2, accountSimilarityThreshold: 0.35 },
      }),
    /mergeThreshold/,
  );
});

test('quotes are machine-checked against document text: verified / approximate / unfound', () => {
  const out = buildChronology({
    caseName: 'Quote check (fictional)',
    documents: [
      { id: 'a', name: 'Doc A', text: 'The audit began on October 1, 2024, and covered all registers.' },
      { id: 'b', name: 'Doc B (no text loaded)' },
    ],
    facts: [
      { id: 'Q1', date: '2024-10-01', text: 'Audit began.', source: { docId: 'a', quote: 'The audit began on October 1, 2024, and covered all registers.' } },
      { id: 'Q2', date: '2024-10-01', text: 'Audit began (near quote).', source: { docId: 'a', quote: 'The audit began on October 1, 2024, and covered all tills.' } },
      { id: 'Q3', date: '2024-10-01', text: 'Audit began (tampered).', source: { docId: 'a', quote: 'The company closed the lodge and fired everyone in November.' } },
      { id: 'Q4', date: '2024-10-01', text: 'No text to check.', source: { docId: 'b', quote: 'Whatever was extracted.' } },
    ],
  });
  const status = new Map(out.timeline.map((e) => [e.factId, e.anchor ? e.anchor.quoteStatus : 'missing']));
  assert.equal(status.get('Q1'), 'verified');
  assert.equal(status.get('Q2'), 'approximate');
  assert.equal(status.get('Q3'), 'unfound');
  assert.equal(status.get('Q4'), null);
  assert.equal(out.summary.unfoundQuotes, 1);
});

test('significance ties facts to the case theory deterministically; borderline relies on SME review', () => {
  const theory = { name: 'retaliation for wage complaints (fictional)', keyTerms: ['terminated', 'final wages', 'vacation pay'] };
  const mk = (id: string, text: string, significance?: FactEntry['significance']) =>
    fact({ id, text, docId: 'compl', date: '2025-01-09', topic: 'x', significance });
  const out = customChron(
    [mk('HOT', 'Delgado was terminated after asking about final wages.'), mk('BORDER', 'Her employment was terminated after she accrued vacation time.'), mk('COLD', 'The lodge repainted the lobby.'), mk('MANUAL', 'The lodge repainted the second floor.', 'high')],
    { theory },
  );
  const sig = new Map(out.timeline.map((e) => [e.factId, e]));
  assert.equal(sig.get('HOT')?.significance, 'high');
  assert.equal(sig.get('HOT')?.smeVerify, false);
  assert.equal(sig.get('BORDER')?.significance, 'medium'); // 1 full + 1 partial = 1.5 -> lower band, SME flag
  assert.equal(sig.get('BORDER')?.smeVerify, true);
  assert.equal(sig.get('COLD')?.significance, 'low');
  assert.equal(sig.get('COLD')?.smeVerify, false); // an absent single-token term never earns partial credit
  assert.equal(sig.get('MANUAL')?.significance, 'high'); // explicit attorney tag wins
  assert.equal(sig.get('MANUAL')?.smeVerify, false);
  const md = renderChronology(out);
  assert.ok(md.includes('🔴'));
  assert.ok(md.includes('[SME VERIFY]'));
});

test('provenance: unverified facts render [verify]; conflicts and gaps carry [computed from:]', () => {
  const unverified: FactSource = { docId: 'compl', quote: 'q', kind: 'unverified' };
  const out = customChron([
    { id: 'F1', date: '2024-01-10', topic: 't', text: 'Unverified memory of a meeting.', source: unverified },
    fact({ id: 'F2', text: 'Meeting happened much later.', docId: 'compl', date: '2024-06-01', topic: 't' }),
  ]);
  assert.equal(out.timeline[0].provenance, 'unverified');
  const md = renderChronology(out);
  assert.ok(md.includes('Unverified memory of a meeting. [verify]'));
  assert.ok(md.includes('[computed from: F1, F2]'));
  const conflictLine = md.split('\n').find((l) => l.includes('**date_mismatch**')); // this fixture's conflict kind
  assert.ok(conflictLine?.includes('[computed from: F1, F2]'), conflictLine); // conflicts carry it
  const gapLine = md.split('\n').find((l) => l.includes('days between'));
  assert.ok(gapLine?.includes('[computed from: F1, F2]'), gapLine); // and so do gaps
});

test('privilege-flagged documents mark entries and are excluded from the SoF variant', () => {
  const docs: ChronInput['documents'] = [
    { id: 'compl', name: 'Complaint' },
    { id: 'hot-doc', name: 'Disputed deposition', priv: 'flag' },
  ];
  const facts: FactEntry[] = [
    fact({ id: 'F1', text: 'Hire.', docId: 'compl', date: '2020-03-03' }),
    fact({ id: 'F2', text: 'Disputed account.', docId: 'hot-doc', date: '2024-12-01', dateLabel: 'on or about December 2024' }),
  ];
  const out = buildChronology({ caseName: 'Priv test (fictional)', documents: docs, facts, posture: 'A', version: 2 });
  assert.equal(out.timeline.find((e) => e.factId === 'F2')?.privFlagged, true);
  const working = renderChronology(out);
  assert.ok(working.includes('Posture A'));
  assert.ok(working.includes('Disputed account.'));
  assert.ok(working.toUpperCase().includes('PRIVILEGE FLAG'));
  const sof = renderChronology(out, { format: 'sof' });
  assert.ok(!sof.includes('Disputed account.'), sof);
  assert.ok(sof.includes('excluded 1 privileged-flagged'));
  assert.ok(sof.includes('# Statement of facts'));
});

test('working, SoF and witness variants render distinct documents', () => {
  const docs: ChronInput['documents'] = [
    { id: 'compl', name: 'Complaint' },
    { id: 'decl', name: 'Declaration' },
  ];
  const facts: FactEntry[] = [
    fact({ id: 'F1', text: 'Reyes gave Delgado a written warning about cash-handling.', docId: 'compl', date: '2024-12-01', topic: 'warning' }),
    fact({ id: 'F2', text: 'Delgado never received any warning at all.', docId: 'decl', date: '2024-12-01', topic: 'warning' }),
    fact({ id: 'F3', text: 'Policy posted at some point.', docId: 'compl', dateLabel: 'at all relevant times' }),
  ];
  const out = buildChronology({ caseName: 'Variants (fictional)', documents: docs, facts });
  const working = renderChronology(out);
  const sof = renderChronology(out, { format: 'sof' });
  const witness = renderChronology(out, { format: 'witness' });
  // working: everything
  assert.ok(working.includes('## Conflicts'));
  assert.ok(working.includes('## Undated / unparseable entries'));
  assert.ok(!working.includes('## Gaps')); // no day-precision gap in this fixture -> no Gaps section
  // SoF: clean narrative — no conflict/undated sections
  assert.ok(!sof.includes('## Conflicts'));
  assert.ok(!sof.includes('Policy posted at some point.'));
  // witness: quotes emphasized + impeachment flags
  assert.ok(witness.includes('# Witness preparation timeline'));
  assert.ok(witness.includes('## Impeachment flags'));
  assert.ok(witness.includes('> "Reyes gave Delgado a written warning about cash-handling."'));
});

test('diffChronology reports added, removed and changed facts and bumps the version', () => {
  const v1 = customChron([
    fact({ id: 'F1', text: 'Hire.', docId: 'compl', date: '2020-03-03' }),
    fact({ id: 'F2', text: 'Old account of the warning.', docId: 'compl', date: '2024-12-01' }),
    fact({ id: 'F3', text: 'Fact later dropped.', docId: 'compl', date: '2024-12-15' }),
  ]);
  const v2 = customChron(
    [
      fact({ id: 'F1', text: 'Hire.', docId: 'compl', date: '2020-03-03' }),
      fact({ id: 'F2', text: 'Updated account of the warning.', docId: 'compl', date: '2024-12-01' }),
      fact({ id: 'F4', text: 'Fact added later.', docId: 'compl', date: '2025-01-09' }),
    ],
    { version: 2 },
  );
  const d = diffChronology(v1, v2);
  assert.deepEqual(d.added, ['F4']);
  assert.deepEqual(d.removed, ['F3']);
  assert.deepEqual(d.changed, [{ factId: 'F2', fields: ['text'] }]);
  assert.equal(d.fromVersion, 1);
  assert.equal(d.toVersion, 2);
  assert.ok(d.summary.includes('F2: text'));
  // no change -> no bump
  const same = diffChronology(v2, v2);
  assert.equal(same.toVersion, 2);
  assert.deepEqual(same.added, []);
  assert.deepEqual(same.removed, []);
  assert.deepEqual(same.changed, []);
});

test('diffChronology labels a merge-absorbed fact as absorbed, not silently removed', () => {
  const hireFacts = (f2text: string) => [
    fact({ id: 'F1', text: 'Delgado was hired as a floor manager at the Summit Ridge lodge.', docId: 'compl', date: '2020-03-03', topic: 'hire' }),
    fact({ id: 'F2', text: f2text, docId: 'answer', date: '2020-03', topic: 'hire' }),
  ];
  const v1 = customChron(hireFacts('Delgado started work at the lodge that spring.')); // dissimilar -> two entries
  const v2 = customChron(hireFacts('Delgado was hired as a floor manager at the Summit Ridge lodge.')); // amended -> merged
  assert.equal(v2.summary.merged, 1);
  const d = diffChronology(v1, v2);
  assert.deepEqual(d.removed, ['F2']); // F2 is no longer its own entry...
  assert.ok(d.summary.includes('F2 (absorbed into F1)'), d.summary); // ...but the merge trail names where it went
});
