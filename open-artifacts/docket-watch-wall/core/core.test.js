/** node:test suite for docket-watch-wall core. Run: node --test core/ */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ESCALATION_RULES, DEADLINE_RULES, fromRecapPayload, escalate,
  processFeed, stampSeenStore, toMarkdown, extractDeadlines, lintRule,
  pruneSeenStore, toDeadlineFeed, SafeRuleError, normalizeParties,
} from './core.js';

const entry = (over = {}) => ({
  id: 'E-1',
  date: '2026-04-02',
  description: 'Motion to dismiss filed by defendants',
  case: {
    name: 'Meridian Foods v. Bluecrest Logistics',
    judge: 'Hon. A. Whitfield',
    parties: ['Meridian Foods, Inc.', 'Bluecrest Logistics LLC'],
    practiceArea: 'commercial-litigation',
    court: 'N.D. Ill. (fictional)',
  },
  ...over,
});

const watcher = { id: 'w1', name: 'Judge Whitfield — commercial', judge: 'whitfield' };

test('watcher matches on judge (case-insensitive substring)', () => {
  const r = processFeed([entry()], [watcher], {});
  assert.equal(r.wall[0].newEntries.length, 1);
  const miss = processFeed([entry()], [{ id: 'w2', name: 'x', judge: 'kovac' }], {});
  assert.equal(miss.wall[0].newEntries.length, 0);
});

test('watcher matches on party and practice-area filters', () => {
  const byParty = processFeed([entry()], [{ id: 'w3', name: 'p', party: 'bluecrest' }], {});
  assert.equal(byParty.wall[0].newEntries.length, 1);
  const byArea = processFeed([entry()], [{ id: 'w4', name: 'a', practiceArea: 'Commercial-Litigation' }], {});
  assert.equal(byArea.wall[0].newEntries.length, 1);
  const wrongArea = processFeed([entry()], [{ id: 'w5', name: 'a', practiceArea: 'ip' }], {});
  assert.equal(wrongArea.wall[0].newEntries.length, 0);
});

test('seen-store diffing: second run reports nothing new', () => {
  const r1 = processFeed([entry()], [watcher], {});
  assert.equal(r1.stats.newEntries, 1);
  const r2 = processFeed([entry()], [watcher], r1.nextSeenStore);
  assert.equal(r2.stats.newEntries, 0);
  assert.deepEqual(r2.wall[0].newEntries, []);
  // a genuinely new entry id still comes through
  const r3 = processFeed([entry(), entry({ id: 'E-2', description: 'Order entered' })], [watcher], r1.nextSeenStore);
  assert.equal(r3.stats.newEntries, 1);
  assert.equal(r3.wall[0].newEntries[0].id, 'E-2');
});

test('escalation rules fire on motion to dismiss, sanctions, show cause', () => {
  assert.deepEqual(escalate(entry()).map((e) => e.ruleId), ['dismissal']);
  const s = escalate(entry({ description: 'Order to show cause re sanctions issued' }));
  assert.deepEqual(s.map((e) => e.ruleId), ['sanctions', 'show-cause']);
  assert.ok(s.every((e) => e.level === 'urgent'));
  const none = escalate(entry({ description: 'Stipulation extending discovery deadlines' }));
  assert.deepEqual(none, []);
});

test('escalatedNew lists watcher-scoped escalations of new entries only', () => {
  const feed = [
    entry({ id: 'E-9', description: 'Motion for sanctions filed' }),
    entry({ id: 'E-8', description: 'Stipulation extending discovery deadlines' }),
  ];
  const r = processFeed(feed, [watcher], { ids: [] });
  assert.equal(r.escalatedNew.length, 1);
  assert.equal(r.escalatedNew[0].entry.id, 'E-9');
  assert.equal(r.escalatedNew[0].escalations[0].level, 'urgent');
});

test('nextSeenStore merges old + new ids, sorted, without timestamps', () => {
  const r = processFeed([entry({ id: 'B' }), entry({ id: 'A' })], [watcher], { ids: ['Z'] });
  assert.deepEqual(r.nextSeenStore.ids, ['A', 'B', 'Z']);
  assert.equal(r.nextSeenStore.updatedAt, null); // caller stamps its own clock
  assert.equal(r.nextSeenStore.count, 3);
  const stamped = stampSeenStore(r.nextSeenStore, '2026-04-03T09:00:00Z');
  assert.equal(stamped.updatedAt, '2026-04-03T09:00:00Z');
});

test('fromRecapPayload normalizes a RECAP-shaped payload without network', () => {
  const e = fromRecapPayload({
    id: 8841,
    date_filed: '2026-04-01T00:00:00Z',
    description: 'Opposition to motion for preliminary injunction',
    docket: {
      case_name: 'Orr v. Talos Systems',
      date_filed: '2026-01-05',
      assigned_to: { name: 'Maria Delgado' },
      court: { short_name: 'C.D. Cal.' },
    },
    parties: [{ name: 'Orr' }, { name: 'Talos Systems' }],
  });
  assert.equal(e.id, '8841');
  assert.equal(e.date, '2026-04-01');
  assert.equal(e.case.judge, 'Maria Delgado');
  assert.deepEqual(e.case.parties, ['Orr', 'Talos Systems']);
  assert.equal(e.case.practiceArea, null);
  assert.equal(escalate(e)[0].ruleId, 'injunction');
});

test('fromRecapPayload: string parties (RECAP feed shape) normalize instead of crashing', () => {
  // regression — coordinator repro: a CourtListener payload whose `parties` is
  // a ';'-separated string used to throw
  // "TypeError: (recap.parties || d.parties || []).map is not a function"
  const e = fromRecapPayload({
    case_name: 'X',
    parties: 'Test Plaintiff; Test Defendant',
    docket_entries: [],
    id: 8842,
    date_filed: '2026-04-01',
    description: 'Complaint filed',
    docket: { case_name: 'X', court: { short_name: 'C.D. Cal.' } },
  });
  assert.deepEqual(e.case.parties, ['Test Plaintiff', 'Test Defendant']);
  // array-of-strings and absent-parties shapes keep working end-to-end
  const arr = fromRecapPayload({ id: 8843, date_filed: '2026-04-01', description: 'x', parties: ['Plaintiff A', 'Defendant B'] });
  assert.deepEqual(arr.case.parties, ['Plaintiff A', 'Defendant B']);
  assert.deepEqual(fromRecapPayload({ id: 8844, date_filed: '2026-04-01', description: 'x' }).case.parties, []);
  // d.parties fallback (recap.parties absent) still maps {name} objects
  const viaDocket = fromRecapPayload({
    id: 8845, date_filed: '2026-04-01', description: 'Answer filed',
    docket: { case_name: 'Y', parties: [{ name: 'Plain' }, { name: 'Def' }] },
  });
  assert.deepEqual(viaDocket.case.parties, ['Plain', 'Def']);
});

test('normalizeParties: string split on ; and , (trim, drop empties); arrays; undefined', () => {
  // string — split on both ';' and ',', trim each segment, drop empties
  assert.deepEqual(normalizeParties('Test Plaintiff; Test Defendant'), ['Test Plaintiff', 'Test Defendant']);
  assert.deepEqual(normalizeParties(' Alpha , Beta; , ;Gamma ,, '), ['Alpha', 'Beta', 'Gamma']);
  assert.deepEqual(normalizeParties(';;;,'), []);
  assert.deepEqual(normalizeParties('Solo Party'), ['Solo Party']);
  // array of strings / array of {name} objects (RECAP party records)
  assert.deepEqual(normalizeParties(['Plaintiff A', 'Defendant B']), ['Plaintiff A', 'Defendant B']);
  assert.deepEqual(normalizeParties([{ name: 'Orr' }, { name: 'Talos Systems' }]), ['Orr', 'Talos Systems']);
  // undefined / empty → [], never a throw (fail-closed on unknown shapes)
  assert.deepEqual(normalizeParties(undefined), []);
  assert.deepEqual(normalizeParties([]), []);
});

test('determinism: identical inputs → identical result JSON', () => {
  const feed = [entry(), entry({ id: 'E-2', description: 'Contempt motion noted' })];
  const a = JSON.stringify(processFeed(feed, [watcher], { ids: ['E-1'] }));
  const b = JSON.stringify(processFeed(feed, [watcher], { ids: ['E-1'] }));
  assert.equal(a, b);
});

test('toMarkdown renders per-watcher sections and escalation tags', () => {
  const r = processFeed(
    [entry({ id: 'E-5', description: 'Motion for sanctions filed' })],
    [watcher], { ids: [] },
  );
  const md = toMarkdown(r);
  assert.ok(md.includes('## Judge Whitfield — commercial (1 new)'));
  assert.ok(md.includes('[URGENT: Sanctions motion/order]'));
  assert.ok(md.includes('no network calls'));
});

test('custom escalation rules replace defaults cleanly', () => {
  const custom = [{ id: 'cust', label: 'Anything about arbitration', pattern: 'arbitrat', level: 'important' }];
  const e = escalate(entry({ description: 'Petition to compel arbitration' }), custom);
  assert.deepEqual(e.map((x) => x.ruleId), ['cust']);
  assert.deepEqual(escalate(entry(), custom), []);
  assert.ok(DEFAULT_ESCALATION_RULES.length >= 6);
});

test('extractDeadlines: "response due within 14 days" → asOf+14d, needsVerification', () => {
  const e = entry({ id: 'E-1', date: '2026-04-02', description: 'Order re motions; response due within 14 days of entry' });
  const d = extractDeadlines(e, { asOf: '2026-04-02' });
  assert.equal(d.length, 1);
  assert.equal(d[0].date, '2026-04-16');
  assert.equal(d[0].label, 'Response due');
  assert.equal(d[0].basis, 'response-days');
  assert.equal(d[0].confidence, 'medium');
  assert.equal(d[0].needsVerification, true);
  // no deadline basis in the text → no deadline, never a silent default
  assert.deepEqual(
    extractDeadlines(entry({ description: 'Stipulation extending discovery deadlines' }), { asOf: '2026-04-02' }),
    [],
  );
});

test('blank court → low confidence; non-empty court keeps rule tier; unusable anchor → []', () => {
  const noCourt = entry({
    description: 'answer due within 21 days',
    case: { name: 'X v. Y', judge: null, parties: [], practiceArea: null, court: '' },
  });
  assert.equal(extractDeadlines(noCourt, { asOf: '2026-04-02' })[0].confidence, 'low');
  // a non-empty court the core does not recognize still keeps the rule tier —
  // the core keeps no court registry (jurisdiction tables out of scope)
  const oddCourt = entry({
    description: 'answer due within 21 days',
    case: { name: 'X v. Y', judge: null, parties: [], practiceArea: null, court: 'Ct. of Exotic Fiction' },
  });
  assert.equal(extractDeadlines(oddCourt, { asOf: '2026-04-02' })[0].confidence, 'medium');
  // asOf falls back to entry.date; when neither parses there is no anchor → no deadlines
  const noDate = entry({ date: '', description: 'response due within 14 days' });
  assert.deepEqual(extractDeadlines(noDate, {}), []);
});

test('processFeed threads escalationRules end-to-end through toMarkdown (no re-derive)', () => {
  const custom = [{ id: 'arb', label: 'Arbitration watch', pattern: 'arbitrat', level: 'important' }];
  const r = processFeed(
    [entry({ id: 'E-7', description: 'Petition to compel arbitration filed' })],
    [watcher], { ids: [] }, { escalationRules: custom },
  );
  assert.equal(r.escalatedNew.length, 1);
  assert.equal(r.escalatedNew[0].escalations[0].ruleId, 'arb');
  const md = toMarkdown(r);
  assert.ok(md.includes('[IMPORTANT: Arbitration watch]'));
  assert.ok(!md.includes('Sanctions'));
});

test('deadline horizon flags: 10d within default 14 → true; 20d → false; watcher override wins', () => {
  const r = processFeed(
    [
      entry({ id: 'A', date: '2026-04-02', description: 'response due within 10 days' }),
      entry({ id: 'B', date: '2026-04-02', description: 'response due within 20 days' }),
    ],
    [watcher], { ids: [] }, { asOf: '2026-04-02' },
  );
  const byId = Object.fromEntries(r.deadlinesNew.map((d) => [d.entry.id, d.deadlines]));
  assert.equal(byId.A[0].withinHorizon, true);
  assert.equal(byId.B[0].withinHorizon, false);
  assert.equal(r.stats.deadlines, 2);
  const tight = processFeed(
    [entry({ id: 'A', date: '2026-04-02', description: 'response due within 10 days' })],
    [{ ...watcher, deadlineHorizonDays: 5 }], { ids: [] }, { asOf: '2026-04-02' },
  );
  assert.equal(tight.deadlinesNew[0].deadlines[0].withinHorizon, false);
});

test('lintRule rejects unsafe patterns with SafeRuleError; shipped rule sets pass', () => {
  const mk = (pattern) => ({ id: 'x', label: 'x', pattern, level: 'urgent' });
  assert.throws(() => lintRule(mk('(a+)+$')), SafeRuleError);          // nested quantifier
  assert.throws(() => lintRule(mk('a'.repeat(201))), SafeRuleError);   // >200 chars
  assert.throws(() => lintRule(mk('one|two|three|four|five|six')), SafeRuleError); // >4 branches
  assert.throws(() => lintRule(mk('(a|b)+c')), SafeRuleError);         // alternation in quantified group
  assert.throws(() => lintRule(mk('(')), SafeRuleError);               // invalid regex
  assert.throws(() => lintRule(mk('')), SafeRuleError);                // empty pattern
  for (const rule of [...DEFAULT_ESCALATION_RULES, ...DEADLINE_RULES]) {
    assert.doesNotThrow(() => lintRule(rule));
  }
  // escalate refuses to compile an unsafe rule over untrusted filer text
  assert.throws(
    () => escalate(entry(), [{ id: 'x', label: 'x', pattern: '(a+)+$', level: 'urgent' }]),
    SafeRuleError,
  );
});

test('pruneSeenStore caps ids while always keeping current feed ids', () => {
  const ids = Array.from({ length: 100 }, (_, i) => `E-${String(i).padStart(3, '0')}`);
  const store = { ids, updatedAt: '2026-04-03T09:00:00Z', count: 100 };
  const pruned = pruneSeenStore(store, { keep: ['E-097', 'E-098', 'E-099'], maxIds: 50 });
  assert.equal(pruned.ids.length, 50);
  assert.equal(pruned.count, 50);
  for (const k of ['E-097', 'E-098', 'E-099']) assert.ok(pruned.ids.includes(k));
  assert.equal(pruned.updatedAt, '2026-04-03T09:00:00Z');
  // keep ids win even over a smaller cap
  const tiny = pruneSeenStore(store, { keep: ['E-001', 'E-002'], maxIds: 1 });
  assert.deepEqual(tiny.ids, ['E-001', 'E-002']);
});

test('toDeadlineFeed emits a deduped iCal VEVENT with X-NEEDS-VERIFICATION', () => {
  const r = processFeed(
    [entry({ id: 'E-11', date: '2026-04-02', description: 'Order; response due within 14 days' })],
    [watcher, { id: 'w2', name: 'Party watch', party: 'meridian' }],
    { ids: [] }, { asOf: '2026-04-02' },
  );
  const ics = toDeadlineFeed(r);
  assert.ok(ics.startsWith('BEGIN:VCALENDAR'));
  assert.ok(ics.includes('BEGIN:VEVENT'));
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20260416'));
  assert.ok(ics.includes('X-NEEDS-VERIFICATION:TRUE'));
  assert.ok(ics.includes('END:VCALENDAR'));
  // same entry seen by two watchers → one VEVENT, not two
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.ok(ics.endsWith('\r\n'));
});
