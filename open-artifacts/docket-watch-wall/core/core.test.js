/** node:test suite for docket-watch-wall core. Run: node --test core/ */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ESCALATION_RULES, fromRecapPayload, escalate,
  processFeed, stampSeenStore, toMarkdown,
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
