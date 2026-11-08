import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRegister, toCSV, renderRegister, diffRegisters, renderDiff, toICS } from './core.js';

const AS_OF = '2026-11-07';

function reg(obligations, satisfaction = [], settings) {
  return buildRegister({ asOf: AS_OF, obligations, satisfaction, settings });
}

function ob(partial) {
  return {
    id: 'OBL-1',
    clause: '§ 5.2',
    party: 'Supplier',
    verb: 'deliver',
    text: 'deliver the platform audit report',
    dueDate: '2026-12-01',
    ...partial,
  };
}

test('future obligation with no satisfaction record is pending', () => {
  const r = reg([ob()]);
  assert.equal(r.obligations[0].status, 'pending');
  assert.equal(r.obligations[0].breachRisk, false);
  assert.equal(r.summary.open, 1);
});

test('due date within dueSoonDays flags due-soon (boundary inclusive)', () => {
  const r = reg([ob({ dueDate: '2026-11-21' })]); // 14 days out
  assert.equal(r.obligations[0].status, 'due-soon');
  const r2 = reg([ob({ dueDate: '2026-11-22' })]); // 15 days out
  assert.equal(r2.obligations[0].status, 'pending');
  const r3 = reg([ob({ dueDate: '2026-11-21' })], [], { dueSoonDays: 7 });
  assert.equal(r3.obligations[0].status, 'pending'); // configurable window
});

test('past due date without satisfaction record → overdue + breach-risk flag', () => {
  const r = reg([ob({ dueDate: '2026-10-15' })]);
  const o = r.obligations[0];
  assert.equal(o.status, 'overdue');
  assert.equal(o.breachRisk, true);
  assert.match(o.flags[0], /breach risk: due 2026-10-15 — 23 days past/);
  assert.equal(r.summary.breachRisk, 1);
});

test('on-time satisfaction record → satisfied, no flags', () => {
  const r = reg([ob({ dueDate: '2026-10-15' })], [
    { obligationId: 'OBL-1', satisfiedOn: '2026-10-14', evidence: 'email 2026-10-14 (fictional)' },
  ]);
  const o = r.obligations[0];
  assert.equal(o.status, 'satisfied');
  assert.equal(o.flags.length, 0);
  assert.equal(o.satisfaction.evidence, 'email 2026-10-14 (fictional)');
});

test('late satisfaction is satisfied but flagged with the day count', () => {
  const r = reg([ob({ dueDate: '2026-10-15' })], [
    { obligationId: 'OBL-1', satisfiedOn: '2026-10-20' },
  ]);
  const o = r.obligations[0];
  assert.equal(o.status, 'satisfied');
  assert.equal(o.breachRisk, false);
  assert.match(o.flags[0], /5 days late/);
  assert.equal(r.summary.satisfiedLate, 1);
});

test('latest satisfaction date wins regardless of record order', () => {
  const r = reg([ob({ dueDate: '2026-10-15' })], [
    { obligationId: 'OBL-1', satisfiedOn: '2026-10-20', note: 'first' },
    { obligationId: 'OBL-1', satisfiedOn: '2026-10-16', note: 'earlier correction' },
  ]);
  // 2026-10-20 is the latest satisfiedOn, so it wins (deterministic rule)
  assert.equal(r.obligations[0].satisfaction.satisfiedOn, '2026-10-20');
  assert.equal(r.obligations[0].satisfaction.note, 'first');
  assert.match(r.obligations[0].flags[0], /5 days late/);
});

test('satisfaction with invalid date stays satisfied but flags unverified lateness', () => {
  const r = reg([ob({ dueDate: '2026-10-15' })], [
    { obligationId: 'OBL-1', satisfiedOn: 'mid-October' },
  ]);
  assert.equal(r.obligations[0].status, 'satisfied');
  assert.match(r.obligations[0].flags[0], /lateness unverified/);
});

test('invalid due date → unscheduled, never guessed', () => {
  const r = reg([ob({ dueDate: 'end of the month' })]);
  const o = r.obligations[0];
  assert.equal(o.status, 'unscheduled');
  assert.match(o.flags[0], /never guessed/);
});

test('conditional obligation without a calendar date is tracked as conditional', () => {
  const r = reg([ob({ dueDate: null, condition: 'within 10 days of Regulatory Approval (as defined)' })]);
  const o = r.obligations[0];
  assert.equal(o.status, 'conditional');
  assert.match(o.flags[0], /Regulatory Approval/);
  assert.equal(r.summary.unscheduledOrConditional, 1);
});

test('obligation with neither date nor condition is unscheduled', () => {
  const r = reg([ob({ dueDate: null })]);
  assert.equal(r.obligations[0].status, 'unscheduled');
  assert.match(r.obligations[0].flags[0], /no due date and no condition/);
});

test('satisfaction for an unknown id is ignored (no phantom obligations)', () => {
  const r = reg([ob()], [{ obligationId: 'GHOST', satisfiedOn: '2026-11-01' }]);
  assert.equal(r.obligations.length, 1);
  assert.equal(r.obligations[0].status, 'pending');
});

test('payment obligations carry amount and sort with the register', () => {
  const r = reg([
    ob({ id: 'A', verb: 'pay', text: 'pay the milestone fee', amount: 45000, dueDate: '2027-06-01' }),
    ob({ id: 'B', dueDate: '2026-10-01' }),
  ]);
  assert.equal(r.obligations[0].amount, 45000);
  const md = renderRegister(r);
  assert.ok(md.indexOf('| B (') < md.indexOf('| A (')); // overdue sorts first
  assert.match(md, /pay the milestone fee/);
});

test('summary rollups are consistent', () => {
  const r = reg([
    ob({ id: 'A', dueDate: '2026-10-01' }),                                // overdue
    ob({ id: 'B', dueDate: '2026-11-10' }),                                // due-soon
    ob({ id: 'C', dueDate: '2027-01-01' }),                                // pending
    ob({ id: 'D', dueDate: '2026-10-15' }),                                // satisfied
  ], [{ obligationId: 'D', satisfiedOn: '2026-10-15' }]);
  assert.deepEqual(r.summary.byStatus, { overdue: 1, 'due-soon': 1, pending: 1, satisfied: 1 });
  assert.equal(r.summary.breachRisk, 1);
  assert.equal(r.summary.satisfied, 1);
  assert.equal(r.summary.open, 3);
});

test('CSV has header + one row per obligation with escaped text', () => {
  const r = reg([ob({ text: 'deliver "the" deliverables, per § 5' })]);
  const lines = toCSV(r).trimEnd().split('\n');
  assert.equal(lines.length, 2);
  assert.ok(lines[0].startsWith('id,clause,party,owner,verb,text,dueDate'));
  assert.ok(lines[0].includes('nextDue') && lines[0].includes('sourceQuote'));
  assert.ok(lines[1].includes('"deliver ""the"" deliverables, per § 5"'));
});

test('renderRegister shows summary line and worst-first ordering', () => {
  const r = reg([
    ob({ id: 'OK', dueDate: '2026-10-15' }),
  ], [{ obligationId: 'OK', satisfiedOn: '2026-10-15' }]);
  const md = renderRegister(r);
  assert.match(md, /# Obligations register — as of 2026-11-07/);
  assert.match(md, /satisfied \*\*1\*\*/);
  assert.match(md, /§ 5\.2/);
});

test('invalid asOf throws instead of computing nonsense', () => {
  assert.throws(() => buildRegister({ asOf: 'today', obligations: [] }), /ISO/);
});

// --- I2: sourceQuote becomes auditable data ---

test('sourceQuote is carried to the row, the CSV column, and a Markdown sources section', () => {
  const quote = 'Supplier shall deliver the platform security audit report by November 12, 2026.';
  const r = reg([ob({ sourceQuote: quote })]);
  assert.equal(r.obligations[0].sourceQuote, quote);
  const lines = toCSV(r).trimEnd().split('\n');
  assert.ok(lines[0].includes('sourceQuote'));
  assert.ok(lines[1].includes(quote));
  const md = renderRegister(r);
  assert.match(md, /## Sources/);
  assert.match(md, /OBL-1.*§ 5\.2: "Supplier shall deliver/);
});

// --- I3: diffRegisters ---

test('diffRegisters reports per-id status transitions and new flags between two registers', () => {
  const before = buildRegister({ asOf: '2026-11-01', obligations: [ob({ id: 'A', dueDate: '2026-12-15' })] }); // pending
  const after = buildRegister({ asOf: '2026-11-07', obligations: [ob({ id: 'A', dueDate: '2026-11-06' })] });  // overdue
  const d = diffRegisters(before, after);
  assert.deepEqual(d.transitions, [{ id: 'A', party: 'Supplier', from: 'pending', to: 'overdue' }]);
  assert.deepEqual(d.added, []);
  assert.deepEqual(d.removed, []);
  assert.equal(d.newFlags.length, 1);
  assert.equal(d.newFlags[0].id, 'A');
  assert.ok(d.newFlags[0].flags.every((f) => f.startsWith('breach risk')));
  const md = renderDiff(d);
  assert.match(md, /pending → overdue/);
  assert.match(md, /breach risk/);
});

test('diffRegisters reports added and removed obligations (amendment awareness)', () => {
  const before = reg([ob({ id: 'A', dueDate: '2027-01-01' }), ob({ id: 'B', dueDate: '2027-01-01' })]);
  const after = reg([ob({ id: 'B', dueDate: '2027-01-01' }), ob({ id: 'C', dueDate: '2027-01-01' })]);
  const d = diffRegisters(before, after);
  assert.deepEqual(d.added, ['C']);
  assert.deepEqual(d.removed, ['A']);
  assert.equal(d.transitions.length, 0);
  const md = renderDiff(d);
  assert.match(md, /\+ C/);
  assert.match(md, /\n- A/);
});

// --- I4: recurrence ---

test('two missed quarterly cycles → overdue + breach risk with both dates listed', () => {
  const r = reg([ob({ dueDate: null, recurrence: { cadence: 'quarterly', anchor: '2026-05-15' } })]);
  const o = r.obligations[0];
  assert.equal(o.status, 'overdue');
  assert.equal(o.breachRisk, true);
  assert.equal(o.cyclesMissed, 2);
  assert.match(o.flags[0], /2 missed quarterly cycles — due 2026-05-15, 2026-08-15 with no satisfaction record/);
  assert.equal(o.nextDue, '2026-11-15');
});

test('monthly recurrence clamps to month end (Jan 31 anchor → Feb 28 next due)', () => {
  const r = buildRegister({ asOf: '2026-02-15', obligations: [ob({ dueDate: null, recurrence: { cadence: 'monthly', anchor: '2026-01-31' } })] });
  const o = r.obligations[0];
  assert.equal(o.cyclesMissed, 1);
  assert.match(o.flags[0], /2026-01-31/);
  assert.equal(o.nextDue, '2026-02-28');
});

test('annual recurrence clamps a Feb 29 leap anchor to Feb 28 in non-leap years', () => {
  const r = buildRegister({ asOf: '2025-03-01', obligations: [ob({ dueDate: null, recurrence: { cadence: 'annual', anchor: '2024-02-29' } })] });
  const o = r.obligations[0];
  assert.equal(o.cyclesMissed, 2); // 2024-02-29 and clamped 2025-02-28 both past
  assert.match(o.flags[0], /2025-02-28/);
  assert.equal(o.nextDue, '2026-02-28');
});

test('latest satisfaction record covers only the most recent past cycle; earlier misses still count', () => {
  const r = reg(
    [ob({ dueDate: null, recurrence: { cadence: 'quarterly', anchor: '2026-05-15' } })],
    [{ obligationId: 'OBL-1', satisfiedOn: '2026-09-20' }],
  );
  const o = r.obligations[0];
  assert.equal(o.cyclesMissed, 1); // the 2026-05-15 cycle
  assert.equal(o.status, 'overdue');
  assert.ok(o.flags.some((f) => /^breach risk: 1 missed quarterly cycle — due 2026-05-15 with no satisfaction record$/.test(f)));
  assert.ok(o.flags.some((f) => /36 days late for cycle due 2026-08-15/.test(f)));
});

test('recurring obligation with the latest cycle satisfied and none missed is satisfied', () => {
  const r = reg(
    [ob({ dueDate: null, recurrence: { cadence: 'monthly', anchor: '2026-10-31' } })],
    [{ obligationId: 'OBL-1', satisfiedOn: '2026-10-30' }],
  );
  const o = r.obligations[0];
  assert.equal(o.cyclesMissed, 0);
  assert.equal(o.status, 'satisfied');
  assert.equal(o.breachRisk, false);
  assert.equal(o.nextDue, '2026-11-30');
});

test('invalid recurrence cadence or anchor → unscheduled, never guessed', () => {
  const r = reg([ob({ dueDate: null, recurrence: { cadence: 'biweekly', anchor: '2026-01-15' } })]);
  assert.equal(r.obligations[0].status, 'unscheduled');
  assert.match(r.obligations[0].flags[0], /never guessed/);
  const r2 = reg([ob({ dueDate: null, recurrence: { cadence: 'quarterly', anchor: 'Q1' } })]);
  assert.equal(r2.obligations[0].status, 'unscheduled');
  assert.match(r2.obligations[0].flags[0], /never guessed/);
});

// --- I5: toICS ---

test('toICS emits one VEVENT+VALARM per open dated obligation (satisfied/conditional excluded)', () => {
  const r = reg([
    ob({ id: 'OPEN', dueDate: '2026-11-10' }),
    ob({ id: 'LATE', dueDate: '2026-10-01' }),
    ob({ id: 'DONE', dueDate: '2026-10-15' }),
  ], [{ obligationId: 'DONE', satisfiedOn: '2026-10-15' }]);
  const ics = toICS(r);
  assert.match(ics, /BEGIN:VCALENDAR\nVERSION:2.0\n/);
  assert.match(ics, /\nEND:VCALENDAR\n$/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.equal((ics.match(/BEGIN:VALARM/g) || []).length, 2);
  assert.match(ics, /DTSTART;VALUE=DATE:20261110/);
  assert.match(ics, /DTEND;VALUE=DATE:20261111/);
  assert.match(ics, /UID:OPEN@/);
  assert.ok(!ics.includes('DONE'));
});

test('toICS escapes commas, semicolons, and newlines per RFC 5545', () => {
  const r = reg([ob({ id: 'E', text: 'deliver tea, coffee; and biscuits\nquarterly' })]);
  assert.ok(toICS(r).includes('tea\\, coffee\\; and biscuits\\nquarterly'));
});

test('toICS uses the next cycle date for recurring obligations', () => {
  const r = reg([ob({ id: 'R', dueDate: null, recurrence: { cadence: 'monthly', anchor: '2026-10-31' } })]);
  assert.match(toICS(r), /DTSTART;VALUE=DATE:20261130/);
});

// --- I6: owner + byParty rollup ---

test('owner field is carried through to rows and the CSV', () => {
  const r = reg([ob({ owner: 'Ops lead' })]);
  assert.equal(r.obligations[0].owner, 'Ops lead');
  assert.ok(toCSV(r).trimEnd().split('\n')[0].includes('owner'));
  assert.ok(toCSV(r).includes('Ops lead'));
});

test('summary.byParty rolls up open, overdue, and exposure (Σ overdue amounts)', () => {
  const r = reg([
    ob({ id: 'A', party: 'Customer', verb: 'pay', amount: 48000, dueDate: '2026-10-01' }), // overdue
    ob({ id: 'B', party: 'Customer', verb: 'pay', amount: 12000, dueDate: '2026-11-10' }), // due-soon
    ob({ id: 'C', party: 'Supplier', dueDate: '2027-01-01' }),                              // pending
    ob({ id: 'D', party: 'Supplier', dueDate: '2026-10-15' }),                              // satisfied
  ], [{ obligationId: 'D', satisfiedOn: '2026-10-15' }]);
  assert.deepEqual(r.summary.byParty, {
    Customer: { open: 2, overdue: 1, exposure: 48000 },
    Supplier: { open: 1, overdue: 0, exposure: 0 },
  });
});
