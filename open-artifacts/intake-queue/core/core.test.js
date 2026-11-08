import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processQueue, transition, assign, decide, renderLetter, toICS, ingestSubmission, normalizeName, nameSimilarity, assessUrgency, toCSV, renderQueue } from './core.js';

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

// ------------------------------------------------- decision layer

test('decide: decline from conflict-review ok; from duplicate rejected; missing reason rejected', () => {
  const q = processQueue({
    asOf: AS_OF, roster: ROSTER,
    submissions: [
      sub({ id: 'C1', client: { name: 'Brightpath Solar' }, opposing: { name: 'Zeta Print Co' }, deadline: '2026-12-01' }),
      sub({ id: 'D1', client: { name: 'Cedar Lane HOA' }, opposing: { name: 'Foxglove Rentals LLC' } }),
      sub({ id: 'D2', client: { name: 'Cedar Lane HOA' }, opposing: { name: 'Foxglove Rentals, LLC' } }),
    ],
  });
  const r = decide(q, 'C1', 'decline', 'gc-lee', 'conflict: Brightpath Solar LLC adverse on LIT-2025-003');
  assert.equal(r.ok, true);
  const c1 = q.items.find((i) => i.id === 'C1');
  assert.equal(c1.state, 'declined');
  assert.equal(c1.decision.action, 'decline');
  assert.equal(c1.decision.by, 'gc-lee');
  assert.equal(c1.decision.reason, 'conflict: Brightpath Solar LLC adverse on LIT-2025-003');
  assert.equal(c1.decision.at, AS_OF);
  // duplicate state is a dead end for decisions
  assert.equal(decide(q, 'D2', 'decline', 'x', 'r').ok, false);
  assert.match(decide(q, 'D2', 'decline', 'x', 'r').error, /not allowed/);
  // terminal state: already declined, no second decision
  assert.equal(decide(q, 'C1', 'accept', 'x', 'r').ok, false);
  // missing reason / unknown action / unknown id
  assert.match(decide(q, 'D1', 'accept', 'x', '').error, /reason/);
  assert.match(decide(q, 'D1', 'bonkers', 'x', 'r').error, /unknown decision/);
  assert.equal(decide(q, 'zzz', 'accept', 'x', 'r').ok, false);
});

test('decide: empty/whitespace/missing actor (by) rejected exactly like missing reason; letter never shows an empty actor', () => {
  const q = processQueue({
    asOf: AS_OF, roster: [],
    submissions: [sub({ id: 'A1', client: { name: 'Other Client LLC' }, opposing: { name: 'Third Party Co' } })],
  });
  const auditBefore = q.audit.length;
  for (const by of ['', '   ', '\t', null, undefined]) {
    const r = decide(q, 'A1', 'decline', by, 'real reason');
    assert.equal(r.ok, false, `by=${JSON.stringify(by)} must be rejected`);
    assert.match(r.error, /actor/);
  }
  const it = q.items.find((i) => i.id === 'A1');
  assert.equal(it.state, 'assignable'); // untouched by rejected decisions
  assert.equal(it.decision, undefined);
  assert.equal(q.audit.length, auditBefore); // rejected decisions append nothing
  // a valid decision renders a named actor in the letter — never "by  on"
  assert.equal(decide(q, 'A1', 'decline', 'gc-lee', 'no capacity').ok, true);
  const letter = renderLetter(q, 'A1', 'declination');
  assert.ok(letter.includes('decline by gc-lee on 2026-11-07'));
  assert.ok(!/by {2}/.test(letter));
});

test('decide: accept from assignable and escalate from conflict-review land in guarded terminal states', () => {
  const q = processQueue({
    asOf: AS_OF, roster: ROSTER,
    submissions: [
      sub({ id: 'A1', client: { name: 'Other Client LLC' }, opposing: { name: 'Third Party Co' } }),
      sub({ id: 'E1', client: { name: 'Brightpath Solar' }, opposing: { name: 'Zeta Print Co' }, deadline: '2026-12-01' }),
    ],
  });
  assert.equal(decide(q, 'A1', 'accept', 'gc-lee', 'capacity confirmed').ok, true);
  assert.equal(q.items.find((i) => i.id === 'A1').state, 'accepted');
  assert.equal(decide(q, 'E1', 'escalate', 'partner-oh', 'needs partner review of conflict').ok, true);
  assert.equal(q.items.find((i) => i.id === 'E1').state, 'escalated');
});

// ------------------------------------------------- audit trail

test('audit: process + assign + decide → three ordered entries', () => {
  const q = processQueue({
    asOf: AS_OF, roster: [],
    submissions: [
      sub({ id: 'A1', deadline: '2026-11-12' }),
      sub({ id: 'B1', client: { name: 'Other Client LLC' }, opposing: { name: 'Third Party Co' } }),
    ],
  });
  assert.equal(q.audit.length, 1);
  assert.equal(q.audit[0].action, 'process');
  assert.equal(assign(q, 'A1', 'staff-1').ok, true);
  assert.equal(decide(q, 'B1', 'accept', 'gc-lee', 'capacity confirmed').ok, true);
  assert.equal(q.audit.length, 3);
  assert.deepEqual(q.audit.map((a) => a.seq), [1, 2, 3]);
  assert.deepEqual(q.audit.map((a) => a.actor), ['system', 'staff-1', 'gc-lee']);
  assert.ok(q.audit.every((a) => a.at === AS_OF));
  // failed actions leave no audit entry
  assert.equal(assign(q, 'B1', 'staff-2').ok, false); // B1 is accepted, not assignable
  assert.equal(q.audit.length, 3);
});

test('renderQueue includes the audit log table', () => {
  const q = processQueue({ asOf: AS_OF, roster: [], submissions: [sub()] });
  const md = renderQueue(q);
  assert.match(md, /## Audit log/);
  assert.match(md, /\| 1 \| 2026-11-07 \| system \| process \|/);
});

// ------------------------------------------------- alias-aware roster

test('roster alias matches first-class: exact alias scores 1 with aliasMatch flag', () => {
  const roster = [{ name: 'Brightpath Solar LLC', role: 'adverse', matter: 'LIT-2025-003', aliases: ['BPS Solarworks'] }];
  const q = processQueue({
    asOf: AS_OF, roster,
    submissions: [sub({ opposing: { name: 'BPS Solarworks' }, deadline: '2026-12-01' })],
  });
  const it = q.items[0];
  assert.equal(it.state, 'conflict-review');
  assert.equal(it.conflicts.length, 1);
  assert.equal(it.conflicts[0].rosterName, 'Brightpath Solar LLC');
  assert.equal(it.conflicts[0].score, 1);
  assert.equal(it.conflicts[0].aliasMatch, true);
  assert.equal(it.conflicts[0].matchedVia, 'BPS Solarworks');
  assert.ok(it.flags.some((f) => f.includes('alias')));
});

test('alias matching respects the configurable conflict threshold', () => {
  const roster = [{ name: 'Brightpath Solar LLC', role: 'adverse', aliases: ['BPS Solarworks'] }];
  const subs = [sub({ opposing: { name: 'BPS Solarworks' }, deadline: '2026-12-01' })];
  const strict = processQueue({ asOf: AS_OF, roster, submissions: subs, settings: { conflictThreshold: 1.01 } });
  assert.equal(strict.items[0].conflicts.length, 0);
});

// ------------------------------------------------- letters

test('declination letter cites matched roster party and score, no unresolved placeholders', () => {
  const q = processQueue({
    asOf: AS_OF, roster: ROSTER,
    submissions: [sub({ id: 'C1', client: { name: 'Brightpath Solar' }, opposing: { name: 'Zeta Print Co' }, deadline: '2026-12-01' })],
  });
  assert.equal(decide(q, 'C1', 'decline', 'gc-lee', 'conflict with adverse party on LIT-2025-003').ok, true);
  const letter = renderLetter(q, 'C1', 'declination');
  assert.ok(letter.includes('Brightpath Solar LLC'));
  assert.ok(/score 1\b/.test(letter));
  assert.ok(letter.includes('C1'));
  assert.ok(!letter.includes('{{'));
  assert.ok(letter.includes('[JURISDICTION]'));
  assert.ok(/not legal advice/i.test(letter));
});

test('engagement letter names client and matter with jurisdiction placeholder; bad id/kind throw', () => {
  const q = processQueue({ asOf: AS_OF, roster: ROSTER, submissions: [sub({ id: 'E1', deadline: '2026-12-15' })] });
  const letter = renderLetter(q, 'E1', 'engagement');
  assert.ok(letter.includes('Harbor Bakehouse Co.'));
  assert.ok(letter.includes('contract dispute'));
  assert.ok(letter.includes('no roster match at or above the 0.8 conflict threshold'));
  assert.ok(letter.includes('[JURISDICTION]'));
  assert.ok(!letter.includes('{{'));
  assert.throws(() => renderLetter(q, 'nope', 'engagement'), /no item/);
  assert.throws(() => renderLetter(q, 'E1', 'bonkers'), /unknown letter kind/);
});

test('declination letter for an alias match cites the alias verbatim', () => {
  const roster = [{ name: 'Brightpath Solar LLC', role: 'adverse', matter: 'LIT-2025-003', aliases: ['BPS Solarworks'] }];
  const q = processQueue({
    asOf: AS_OF, roster,
    submissions: [sub({ id: 'A1', opposing: { name: 'BPS Solarworks' }, deadline: '2026-12-01' })],
  });
  assert.equal(decide(q, 'A1', 'decline', 'gc-lee', 'alias conflict').ok, true);
  const letter = renderLetter(q, 'A1', 'declination');
  assert.ok(letter.includes('BPS Solarworks'));
  assert.ok(letter.includes('alias'));
  assert.ok(!letter.includes('{{'));
});

// ------------------------------------------------- ICS export

test('toICS: folding respects the 75-octet limit for lines with multibyte characters', () => {
  const q = processQueue({
    asOf: AS_OF, roster: [],
    submissions: [sub({
      id: 'V9', deadline: '2026-11-20',
      client: { name: 'Ångström—Büro Northwind Holdings ÅÄÖ' },
      opposing: { name: 'Ünrelated Party — Very Long Named Company With Em Dashes Co' },
    })],
  });
  for (const line of toICS(q).split('\r\n')) {
    assert.ok(
      Buffer.byteLength(line, 'utf8') <= 75,
      `line is ${Buffer.byteLength(line, 'utf8')} octets (> 75): ${line}`,
    );
  }
});

test('toICS: one VEVENT per valid deadline, CRLF endings, escaped text', () => {
  const q = processQueue({
    asOf: AS_OF, roster: [],
    submissions: [
      sub({ id: 'V1', deadline: '2026-11-13', client: { name: 'Comma, Co.' }, opposing: { name: 'Semi;Colon LLC' } }),
      sub({ id: 'V2', client: { name: 'Distinct Client Group' }, opposing: { name: 'Unrelated Party Co' } }), // no deadline
    ],
  });
  const ics = toICS(q);
  assert.ok(ics.startsWith('BEGIN:VCALENDAR'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 1); // V2 has no deadline
  assert.ok(ics.includes('UID:V1@intake-queue'));
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20261113'));
  assert.ok(ics.includes('DTSTAMP:20261107T000000Z'));
  assert.ok(ics.includes('\\,')); // RFC 5545 comma escape
  assert.ok(ics.includes('\\;'));
  assert.ok(ics.split('\r\n').every((l) => !l.endsWith('\n'))); // only CRLF endings
});

// ------------------------------------------------- ingest verifier

test('ingestSubmission: name glued to another word via uppercase letter is NOT verbatim', () => {
  const gluedBefore = ingestSubmission(
    { client: { name: 'Ridgeline Dental Group PC' }, opposing: { name: 'Sable Insurance Company' } },
    'Contact XRidgeline Dental Group PC about a billing dispute with Sable Insurance Company.',
  );
  assert.equal(gluedBefore.ok, false); // 'X' directly before the name breaks verbatim
  assert.ok(gluedBefore.issues.some((i) => i.includes('client')));
  const gluedAfter = ingestSubmission(
    { client: { name: 'Sable Insurance Company' } },
    'v. Sable Insurance CompanyX today.',
  );
  assert.equal(gluedAfter.ok, false); // 'X' directly after the name breaks verbatim too
});

test('ingestSubmission: verbatim names verify; altered name flagged unverified-extraction', () => {
  const source = 'From: Dana Reyes (fictional). My company Ridgeline Dental Group PC has a billing dispute with Sable Insurance Company.';
  const good = ingestSubmission(
    { client: { name: 'Ridgeline Dental Group PC' }, opposing: { name: 'Sable Insurance Company' }, matterType: 'billing dispute' },
    source,
  );
  assert.equal(good.ok, true);
  assert.deepEqual(good.submission.flags, []);
  const bad = ingestSubmission(
    { client: { name: 'Ridgeline Dental Group PC' }, opposing: { name: 'Sable Insurance Co' }, matterType: 'billing dispute' },
    source,
  );
  assert.equal(bad.ok, false);
  assert.ok(bad.submission.flags.includes('unverified-extraction'));
  assert.ok(bad.issues.some((i) => i.includes('opposing')));
  // null name = nothing extracted, not a verification failure
  const nullName = ingestSubmission({ client: { name: 'Ridgeline Dental Group PC' }, opposing: { name: null } }, source);
  assert.equal(nullName.ok, true);
});
