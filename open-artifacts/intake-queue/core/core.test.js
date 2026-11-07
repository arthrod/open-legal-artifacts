import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processQueue, transition, assign, normalizeName, nameSimilarity, assessUrgency, toCSV, renderQueue } from './core.js';

const AS_OF = '2026-11-07';

const ROSTER = [
  { name: 'Northwind Logistics, Inc.', role: 'client', matter: 'LIT-2026-014' },
  { name: 'Brightpath Solar LLC', role: 'adverse', matter: 'LIT-2025-003' },
  { name: 'Meridian Foods Corp.', role: 'adverse', matter: 'LIT-2026-030' },
];

function sub(partial) {
  return {
    id: 'INT-001',
    submittedAt: '2026-11-05',
    client: { name: 'Harbor Bakehouse Co.' },
    opposing: { name: 'Delgado Trucking LLC' },
    matterType: 'contract dispute',
    ...partial,
  };
}

// ------------------------------------------------- name matching

test('normalizeName lowercases, strips punctuation and corporate suffixes', () => {
  assert.equal(normalizeName('Northwind Logistics, Inc.'), 'northwind logistics');
  assert.equal(normalizeName('  THE BrightPath Solar LLC '), 'brightpath solar');
  assert.equal(normalizeName('Delgado Trucking, L.L.C.'), 'delgado trucking');
  assert.equal(normalizeName('M. Iwata'), 'm iwata'); // initials retained
});

test('nameSimilarity: exact-normalized = 1, containment scores high, distinct = low', () => {
  assert.equal(nameSimilarity('Northwind Logistics, Inc.', 'northwind logistics'), 1);
  assert.ok(nameSimilarity('Northwind Logistics', 'Northwind Logistics Group') > 0.6);
  assert.equal(nameSimilarity('Harbor Bakehouse', 'Delgado Trucking'), 0);
});

// ------------------------------------------------- dedupe

test('same client + same opposing (normalized) flags duplicate, first is primary', () => {
  const q = processQueue({
    asOf: AS_OF, roster: [],
    submissions: [
      sub({ id: 'A', client: { name: 'Cedar Lane HOA' }, opposing: { name: 'Foxglove Rentals LLC' } }),
      sub({ id: 'B', client: { name: 'Cedar Lane HOA' }, opposing: { name: 'Foxglove Rentals, LLC' }, deadline: '2026-12-01' }),
    ],
  });
  const b = q.items.find((i) => i.id === 'B');
  assert.equal(b.duplicateOf, 'A');
  assert.equal(b.state, 'duplicate');
  assert.equal(q.items.find((i) => i.id === 'A').duplicateOf, null);
  assert.equal(q.summary.duplicates, 1);
});

test('same client but different opposing is NOT a duplicate', () => {
  const q = processQueue({
    asOf: AS_OF, roster: [],
    submissions: [
      sub({ id: 'A', client: { name: 'Cedar Lane HOA' }, opposing: { name: 'Foxglove Rentals LLC' } }),
      sub({ id: 'B', client: { name: 'Cedar Lane HOA' }, opposing: { name: 'Quill Press Publishing' } }),
    ],
  });
  assert.equal(q.items.find((i) => i.id === 'B').duplicateOf, null);
});

test('third copy duplicates the first, not the second', () => {
  const q = processQueue({
    asOf: AS_OF, roster: [],
    submissions: [
      sub({ id: 'A', client: { name: 'Acme Anvil' }, opposing: { name: 'Beta Corp' } }),
      sub({ id: 'B', client: { name: 'Acme Anvil' }, opposing: { name: 'Beta Corporation' } }),
      sub({ id: 'C', client: { name: 'ACME Anvil Co.' }, opposing: { name: 'Beta Corp.' } }),
    ],
  });
  assert.equal(q.items.find((i) => i.id === 'B').duplicateOf, 'A');
  assert.equal(q.items.find((i) => i.id === 'C').duplicateOf, 'A');
});

// ------------------------------------------------- conflicts

test('client matching an adverse roster party routes to conflict-review with score', () => {
  const q = processQueue({
    asOf: AS_OF, roster: ROSTER,
    submissions: [sub({ client: { name: 'Brightpath Solar' }, opposing: { name: 'Anyone' }, deadline: '2026-12-01' })],
  });
  const it = q.items[0];
  assert.equal(it.state, 'conflict-review');
  assert.equal(it.conflicts[0].role, 'adverse');
  assert.equal(it.conflicts[0].matchedSide, 'client');
  assert.ok(it.conflicts[0].score >= 0.8);
});

test('opposing party matching a current client conflicts too', () => {
  const q = processQueue({
    asOf: AS_OF, roster: ROSTER,
    submissions: [sub({ opposing: { name: 'Northwind Logistics, Inc.' }, deadline: '2026-12-01' })],
  });
  assert.equal(q.items[0].state, 'conflict-review');
  assert.equal(q.items[0].conflicts[0].matchedSide, 'opposing');
});

test('no false conflict for genuinely distinct names', () => {
  const q = processQueue({ asOf: AS_OF, roster: ROSTER, submissions: [sub()] });
  assert.equal(q.items[0].conflicts.length, 0);
  assert.equal(q.items[0].state, 'assignable'); // no deadline -> routine
});

test('conflict threshold is configurable', () => {
  const subs = [sub({ opposing: { name: 'Northwind Logistics Group' }, deadline: '2026-12-01' })];
  const def = processQueue({ asOf: AS_OF, roster: ROSTER, submissions: subs });
  const strict = processQueue({ asOf: AS_OF, roster: ROSTER, submissions: subs, settings: { conflictThreshold: 1.01 } });
  assert.equal(def.items[0].conflicts.length > 0, true);
  assert.equal(strict.items[0].conflicts.length, 0);
});

// ------------------------------------------------- urgency

test('urgency levels: overdue, urgent, deadline-soon, routine', () => {
  const mk = (deadline) => assessUrgency({ deadline }, AS_OF, {});
  assert.equal(mk('2026-11-01').level, 'overdue');
  assert.equal(mk('2026-11-14').level, 'urgent');
  assert.equal(mk('2026-12-01').level, 'deadline-soon');
  assert.equal(mk('2027-01-01').level, 'routine');
  assert.equal(mk(undefined).level, 'routine');
});

test('aged matter bumps urgency with a limitations hint', () => {
  const u = assessUrgency({ occurredOn: '2024-06-01' }, AS_OF, {});
  assert.equal(u.level, 'urgent');
  assert.ok(u.reasons.some((r) => r.includes('check limitations')));
});

test('invalid deadline dates are flagged unverified, not crashed', () => {
  const u = assessUrgency({ deadline: 'next week' }, AS_OF, {});
  assert.equal(u.level, 'routine');
  assert.ok(u.reasons.some((r) => r.includes('unverified')));
});

test('urgent submission lands in urgent state ahead of assignable', () => {
  const q = processQueue({
    asOf: AS_OF, roster: [],
    submissions: [sub({ id: 'U', deadline: '2026-11-12' }), sub({ id: 'R', client: { name: 'Other Client LLC' }, opposing: { name: 'Third Party Co' }, deadline: '2027-03-01' })],
  });
  assert.equal(q.items.find((i) => i.id === 'U').state, 'urgent');
  assert.equal(q.items.find((i) => i.id === 'R').state, 'assignable');
  assert.equal(q.summary.urgent, 1);
});

// ------------------------------------------------- workflow / assign

test('assign works from urgent/assignable but not from duplicate', () => {
  const q = processQueue({
    asOf: AS_OF, roster: [],
    submissions: [
      sub({ id: 'U', deadline: '2026-11-12' }),
      sub({ id: 'A', client: { name: 'X Group' }, opposing: { name: 'Y Ltd' } }),
      sub({ id: 'D', client: { name: 'X Group' }, opposing: { name: 'Y Limited' } }),
    ],
  });
  const r1 = assign(q, 'U', 'staff-1');
  assert.equal(r1.ok, true);
  assert.equal(q.items.find((i) => i.id === 'U').state, 'assigned');
  assert.equal(q.items.find((i) => i.id === 'U').assignedTo, 'staff-1');
  const r2 = assign(q, 'D', 'staff-1');
  assert.equal(r2.ok, false);
  assert.match(r2.error, /duplicate → assigned not allowed/);
});

test('transition rejects unknown states and assign without staff', () => {
  assert.equal(transition({ state: 'assignable' }, 'bonkers').ok, false);
  assert.match(transition({ state: 'assignable', assignedTo: null }, 'assigned').error, /without assignedTo/);
  assert.equal(transition({ state: 'new' }, 'duplicate').ok, true);
});

// ------------------------------------------------- exports

test('CSV has header + one row per submission with escaped fields', () => {
  const q = processQueue({
    asOf: AS_OF, roster: [],
    submissions: [sub({ id: 'A', client: { name: 'Comma, Co.' } }), sub({ id: 'B' })],
  });
  const lines = toCSV(q).trimEnd().split('\n');
  assert.equal(lines.length, 3);
  assert.ok(lines[0].startsWith('id,submittedAt,client'));
  assert.ok(lines[1].includes('"Comma, Co."'));
});

test('renderQueue shows summary line and sorted rows', () => {
  const q = processQueue({
    asOf: AS_OF, roster: ROSTER,
    submissions: [
      sub({ id: 'A', deadline: '2026-11-12' }),
      sub({ id: 'B', client: { name: 'Brightpath Solar' }, opposing: { name: 'Zeta' }, deadline: '2026-12-15' }),
    ],
  });
  const md = renderQueue(q);
  assert.match(md, /# Intake queue — as of 2026-11-07/);
  assert.match(md, /conflicts \*\*1\*\*/);
  // urgent row (A) sorts before conflict-review row (B)
  assert.ok(md.indexOf('| A |') < md.indexOf('| B |'));
});

test('invalid asOf throws', () => {
  assert.throws(() => processQueue({ asOf: 'today', submissions: [] }), /ISO/);
});
