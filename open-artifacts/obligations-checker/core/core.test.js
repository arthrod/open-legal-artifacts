import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRegister, toCSV, renderRegister } from './core.js';

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
  assert.ok(lines[0].startsWith('id,clause,party,verb,text,dueDate'));
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
