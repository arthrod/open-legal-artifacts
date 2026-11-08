import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  checkNotice, renderBoard, toCSV, JURISDICTIONS,
  computeDeadlines, rulesetHash, RULESET_META,
} from './core.js';

const CA_PAY = {
  jurisdiction: 'california-example',
  noticeType: 'pay-or-quit',
  statedPeriodDays: 3,
  serviceMethod: 'personal',
  contents: {
    'amount-due': true,
    'payment-person': true,
    'payment-methods': true,
    'nonrent-fees-excluded': true,
  },
};

test('fully-attested compliant CA pay-or-quit notice passes every check', () => {
  const b = checkNotice(CA_PAY);
  assert.equal(b.summary.verdict, 'pass');
  assert.equal(b.summary.fail, 0);
  assert.equal(b.summary.unverified, 0);
  assert.ok(b.checks.every((c) => c.status === 'pass'));
});

test('every check row cites the rule it used (or null for jurisdiction)', () => {
  const b = checkNotice(CA_PAY);
  for (const c of b.checks) {
    if (c.id !== 'jurisdiction') assert.ok(c.ruleCite, `check ${c.id} must cite a rule`);
  }
});

test('short notice period fails with required-days detail', () => {
  const b = checkNotice({ ...CA_PAY, statedPeriodDays: 2 });
  const p = b.checks.find((c) => c.id === 'period');
  assert.equal(p.status, 'fail');
  assert.match(p.detail, /rule requires 3/);
  assert.equal(b.summary.verdict, 'fail');
});

test('missing statedPeriodDays is unverified, never inferred', () => {
  const b = checkNotice({ ...CA_PAY, statedPeriodDays: undefined });
  const p = b.checks.find((c) => c.id === 'period');
  assert.equal(p.status, 'unverified');
  assert.match(p.detail, /not inferred/);
  assert.equal(b.summary.verdict, 'unverified');
});

test('elapsed days count lawful days when the rule excludes weekends/holidays (CA)', () => {
  // served Thu 2026-10-01; 3-day excl-weekend counts Fri 10-02 (1), Mon 10-05 (2), Tue 10-06 (3)
  const ok = checkNotice({ ...CA_PAY, serviceDate: '2026-10-01', filedDate: '2026-10-06' });
  const okRow = ok.checks.find((c) => c.id === 'elapsed');
  assert.equal(okRow.status, 'pass');
  assert.match(okRow.detail, /3 lawful days/);
  const short = checkNotice({ ...CA_PAY, serviceDate: '2026-10-01', filedDate: '2026-10-05' });
  const e = short.checks.find((c) => c.id === 'elapsed');
  assert.equal(e.status, 'fail');
  assert.match(e.detail, /only 2 lawful days/);
});

test('elapsed days stay calendar days when the rule has no exclusion (TX)', () => {
  const base = { jurisdiction: 'texas-example', noticeType: 'notice-to-vacate', statedPeriodDays: 3, serviceMethod: 'mail', contents: { 'vacate-demand': true } };
  const ok = checkNotice({ ...base, serviceDate: '2026-10-01', filedDate: '2026-10-04' });
  assert.equal(ok.checks.find((c) => c.id === 'elapsed').status, 'pass');
  const short = checkNotice({ ...base, serviceDate: '2026-10-01', filedDate: '2026-10-03' });
  assert.equal(short.checks.find((c) => c.id === 'elapsed').status, 'fail');
});

test('same-day filing counts 0 elapsed days and fails, never unverified', () => {
  // filed the same day it was served: 0 lawful days elapsed — a definite FAIL, not "span too large"
  const b = checkNotice({ ...CA_PAY, serviceDate: '2026-10-01', filedDate: '2026-10-01' });
  const row = b.checks.find((c) => c.id === 'elapsed');
  assert.equal(row.status, 'fail');
  assert.match(row.detail, /only 0 lawful days/);
});

test('elapsed-days detail uses singular "day" when exactly 1 elapsed', () => {
  // served Thu 2026-10-01, filed Fri 2026-10-02 → exactly 1 lawful day
  const b = checkNotice({ ...CA_PAY, serviceDate: '2026-10-01', filedDate: '2026-10-02' });
  const row = b.checks.find((c) => c.id === 'elapsed');
  assert.equal(row.status, 'fail');
  assert.match(row.detail, /only 1 lawful day elapsed/);
  assert.doesNotMatch(row.detail, /1 lawful days/);
});

test('invalid dates in elapsed check are unverified, not crashed', () => {
  const b = checkNotice({ ...CA_PAY, serviceDate: 'Oct 1', filedDate: '2026-10-05' });
  assert.equal(b.checks.find((c) => c.id === 'elapsed').status, 'unverified');
});

test('no elapsed check at all when neither service nor filing date is given', () => {
  const b = checkNotice(CA_PAY);
  assert.equal(b.checks.find((c) => c.id === 'elapsed'), undefined);
});

test('contents: true passes, false fails, absent is unverified', () => {
  const b = checkNotice({ ...CA_PAY, contents: { 'amount-due': true, 'payment-person': false } });
  const by = (id) => b.checks.find((c) => c.id === `content:${id}`).status;
  assert.equal(by('amount-due'), 'pass');
  assert.equal(by('payment-person'), 'fail');
  assert.equal(by('payment-methods'), 'unverified');
  assert.match(b.checks.find((c) => c.id === 'content:payment-methods').detail, /never assumed/);
});

test('unauthorized service method fails with authorized list shown', () => {
  const b = checkNotice({ ...CA_PAY, serviceMethod: 'text-message' });
  const s = b.checks.find((c) => c.id === 'service');
  assert.equal(s.status, 'fail');
  assert.match(s.detail, /NOT in the authorized list/);
  assert.match(s.ruleCite, /1162/);
});

test('missing service method is unverified, never assumed', () => {
  const b = checkNotice({ ...CA_PAY, serviceMethod: undefined });
  const s = b.checks.find((c) => c.id === 'service');
  assert.equal(s.status, 'unverified');
  assert.match(s.detail, /do not assume/);
});

test('unknown jurisdiction refuses to approximate another jurisdiction', () => {
  const b = checkNotice({ ...CA_PAY, jurisdiction: 'atlantis' });
  const j = b.checks[0];
  assert.equal(j.status, 'unverified');
  assert.match(j.detail, /refusing to approximate/);
  assert.equal(b.summary.verdict, 'unverified');
});

test('unknown notice type lists known types and stays unverified', () => {
  const b = checkNotice({ ...CA_PAY, noticeType: 'sneaky-self-help' });
  const t = b.checks.find((c) => c.id === 'notice-type');
  assert.equal(t.status, 'unverified');
  assert.match(t.detail, /pay-or-quit, termination-month-to-month/);
});

test('long-tenancy tier raises the required period (CA 60-day rule)', () => {
  const base = {
    jurisdiction: 'california-example',
    noticeType: 'termination-month-to-month',
    serviceMethod: 'personal',
    contents: { 'termination-date': true },
  };
  const short = checkNotice({ ...base, statedPeriodDays: 30, tenancyYears: 3 });
  assert.equal(short.checks.find((c) => c.id === 'period').status, 'fail');
  assert.match(short.checks.find((c) => c.id === 'period').detail, /requires 60/);
  const long = checkNotice({ ...base, statedPeriodDays: 60, tenancyYears: 3 });
  assert.equal(long.checks.find((c) => c.id === 'period').status, 'pass');
});

test('NY 14-day rent demand and WA 14-day pay-or-vacate defaults', () => {
  const ny = checkNotice({ jurisdiction: 'new-york-example', noticeType: 'rent-demand', statedPeriodDays: 14, serviceMethod: 'mail', contents: { 'amount-due': true, 'rent-periods': true } });
  assert.equal(ny.summary.verdict, 'pass');
  const waShort = checkNotice({ jurisdiction: 'washington-example', noticeType: 'pay-or-vacate', statedPeriodDays: 10, serviceMethod: 'personal', contents: { 'amount-due': true, 'payment-address': true, 'deadline-date': true } });
  assert.equal(waShort.summary.verdict, 'fail');
});

test('editable rules-as-data: custom jurisdiction JSON plugs in', () => {
  const custom = {
    'fiction-state': {
      name: 'Fiction State (test)',
      noticeTypes: {
        'pay-or-quit': {
          minDays: 10,
          contents: [{ id: 'amount-due', label: 'Amount due', cite: 'Fiction Code § 1' }],
          service: { methods: ['personal'], cite: 'Fiction Code § 2' },
          cite: 'Fiction Code § 1',
        },
      },
    },
  };
  const b = checkNotice({ jurisdiction: 'fiction-state', noticeType: 'pay-or-quit', statedPeriodDays: 10, serviceMethod: 'personal', contents: { 'amount-due': true } }, custom);
  assert.equal(b.summary.verdict, 'pass');
  assert.equal(b.checks.find((c) => c.id === 'period').ruleCite, 'Fiction Code § 1');
});

test('ten example jurisdictions plus a fictional city overlay ship in the data', () => {
  assert.equal(Object.keys(JURISDICTIONS).length, 11);
  assert.ok(JURISDICTIONS['fiction-city-example'].name.match(/fictional/i));
});

test('renderBoard lists verdict, disclaimer, and all rows with cites', () => {
  const md = renderBoard(checkNotice(CA_PAY));
  assert.match(md, /\*\*Verdict: PASS\*\*/);
  assert.match(md, /verify every cited rule/);
  assert.match(md, /\| PASS \| Jurisdiction ruleset loaded/);
});

test('toCSV emits header plus one row per check', () => {
  const csv = toCSV(checkNotice(CA_PAY));
  const lines = csv.trimEnd().split('\n');
  assert.equal(lines[0], 'id,requirement,status,detail,ruleCite');
  assert.equal(lines.length, 1 + 8); // jurisdiction + type + period + 4 contents + service (no elapsed: no dates given)
});

// --------------------------------------------- improvement 1: evidence-backed attestations

test('evidence-backed contents: {present, quote} echoes the verbatim quote in the row', () => {
  const b = checkNotice({
    ...CA_PAY,
    contents: {
      'amount-due': { present: true, quote: 'Rent of $1,250.00 is now due' },
      'payment-person': true,
      'payment-methods': true,
      'nonrent-fees-excluded': true,
    },
  });
  const row = b.checks.find((c) => c.id === 'content:amount-due');
  assert.equal(row.status, 'pass');
  assert.match(row.detail, /Rent of \$1,250\.00 is now due/);
  assert.equal(b.summary.verdict, 'pass');
});

test('evidence-backed contents: present without a quote stays unverified (auditable evidence missing)', () => {
  const b = checkNotice({
    ...CA_PAY,
    contents: { 'amount-due': { present: true } },
  });
  const row = b.checks.find((c) => c.id === 'content:amount-due');
  assert.equal(row.status, 'unverified');
  assert.match(row.detail, /no verbatim quote/);
  assert.equal(b.summary.verdict, 'unverified');
});

test('evidence-backed contents: {present: false, quote} fails and still shows the quote', () => {
  const b = checkNotice({
    ...CA_PAY,
    contents: { 'payment-methods': { present: false, quote: 'online payment only' } },
  });
  const row = b.checks.find((c) => c.id === 'content:payment-methods');
  assert.equal(row.status, 'fail');
  assert.match(row.detail, /online payment only/);
});

// --------------------------------------------- improvement 2: deadline engine

test('deadline engine: served Friday, 3-day excl-weekend → earliest lawful filing Wednesday', () => {
  const d = computeDeadlines('2026-10-02', 3, { excludeWeekendsHolidays: true, holidays: [] });
  assert.equal(d.earliestFiling, '2026-10-07'); // Mon 10-05 (1), Tue 10-06 (2), Wed 10-07 (3)
  assert.equal(d.expires, '2026-10-07');
  assert.deepEqual(d.skippedDays, ['2026-10-03', '2026-10-04']);
  assert.equal(d.counting, 'business');
});

test('deadline engine: listed holidays are skipped like weekends', () => {
  const d = computeDeadlines('2026-10-02', 3, { excludeWeekendsHolidays: true, holidays: ['2026-10-05'] });
  assert.equal(d.earliestFiling, '2026-10-08'); // Mon 10-05 is a holiday → Tue (1), Wed (2), Thu (3)
  assert.ok(d.skippedDays.includes('2026-10-05'));
});

test('deadline engine: calendar counting when the rule has no exclusion', () => {
  const d = computeDeadlines('2026-10-01', 3, { excludeWeekendsHolidays: false });
  assert.equal(d.earliestFiling, '2026-10-04');
  assert.equal(d.counting, 'calendar');
  assert.deepEqual(d.skippedDays, []);
});

test('deadline engine: invalid inputs return null, never a guess', () => {
  assert.equal(computeDeadlines('Oct 1', 3), null);
  assert.equal(computeDeadlines('2026-10-01', 0), null);
});

test('board carries deadlines and renderBoard prints the earliest lawful filing', () => {
  const b = checkNotice({ ...CA_PAY, serviceDate: '2026-10-02' });
  assert.equal(b.deadlines.earliestFiling, '2026-10-07');
  const md = renderBoard(b);
  assert.match(md, /Earliest lawful filing: 2026-10-07/);
});

test('plan acceptance: served Fri 3-day excl-weekend passes only from Wednesday', () => {
  const tue = checkNotice({ ...CA_PAY, serviceDate: '2026-10-02', filedDate: '2026-10-06' });
  assert.equal(tue.checks.find((c) => c.id === 'elapsed').status, 'fail');
  const wed = checkNotice({ ...CA_PAY, serviceDate: '2026-10-02', filedDate: '2026-10-07' });
  assert.equal(wed.checks.find((c) => c.id === 'elapsed').status, 'pass');
});

// --------------------------------------------- improvement 3: ruleset provenance

test('board stamps ruleset provenance: asOf, version, stable hash', () => {
  const b1 = checkNotice(CA_PAY);
  const b2 = checkNotice(CA_PAY);
  assert.ok(b1.ruleset.asOf);
  assert.ok(b1.ruleset.version);
  assert.match(b1.ruleset.hash, /^[0-9a-f]{8}$/);
  assert.equal(b1.ruleset.hash, b2.ruleset.hash); // stable across calls
  assert.equal(b1.ruleset.hash, rulesetHash(JURISDICTIONS));
});

test('ruleset hash changes when the rules change', () => {
  const custom = { 'fiction-state': { name: 'Fiction State', noticeTypes: {} } };
  const b = checkNotice({ ...CA_PAY }, custom);
  assert.notEqual(b.ruleset.hash, rulesetHash(JURISDICTIONS));
});

test('renderBoard shows the ruleset version line', () => {
  const md = renderBoard(checkNotice(CA_PAY));
  assert.match(md, new RegExp(`Ruleset: v\\S+ · as of \\S{10} · hash [0-9a-f]{8}`));
});

// --------------------------------------------- improvement 4: clinic-checklist import

test('clinic checklist items merge as extra cited rows with never-guess semantics', () => {
  const notice = {
    ...CA_PAY,
    checklist: [
      { id: 'utility-contact', label: 'Landlord/utility contact printed on notice', cite: 'Fiction Clinic intake checklist v3 (fictional)' },
      { id: 'case-number', label: 'Clinic case number recorded', cite: 'Fiction Clinic intake checklist v3 (fictional)' },
    ],
    contents: {
      ...CA_PAY.contents,
      'utility-contact': { present: true, quote: 'Questions? Call Fiction Properties, (555) 010-1031' },
    },
  };
  const b = checkNotice(notice);
  const row = b.checks.find((c) => c.id === 'content:utility-contact');
  assert.equal(row.status, 'pass');
  assert.equal(row.ruleCite, 'Fiction Clinic intake checklist v3 (fictional)');
  assert.match(row.detail, /\(555\) 010-1031/);
  const missing = b.checks.find((c) => c.id === 'content:case-number');
  assert.equal(missing.status, 'unverified');
  const md = renderBoard(b);
  assert.match(md, /Clinic case number recorded/);
  assert.match(md, /Fiction Clinic intake checklist v3/);
});

test('checklist item without a cite is labeled user-supplied, never silently un-cited', () => {
  const b = checkNotice({ ...CA_PAY, checklist: [{ id: 'extra-item', label: 'Extra item' }], contents: { ...CA_PAY.contents, 'extra-item': true } });
  const row = b.checks.find((c) => c.id === 'content:extra-item');
  assert.equal(row.status, 'pass');
  assert.match(row.ruleCite, /user-supplied checklist/);
});

// --------------------------------------------- improvement 6: breadth + city overlay

test('fiction-city overlay inherits CA types and adds its own bilingual requirement row', () => {
  const b = checkNotice({
    jurisdiction: 'fiction-city-example',
    noticeType: 'pay-or-quit',
    statedPeriodDays: 3,
    serviceMethod: 'personal',
    contents: {
      'amount-due': true,
      'payment-person': true,
      'payment-methods': true,
      'nonrent-fees-excluded': true,
      'bilingual-notice': true,
    },
  });
  assert.equal(b.summary.verdict, 'pass');
  const row = b.checks.find((c) => c.id === 'content:bilingual-notice');
  assert.equal(row.status, 'pass');
  assert.match(row.ruleCite, /fictional/i);
});

test('overlay jurisdiction unknown-type row lists inherited + local notice types', () => {
  const b = checkNotice({ ...CA_PAY, jurisdiction: 'fiction-city-example', noticeType: 'mystery-type' });
  const t = b.checks.find((c) => c.id === 'notice-type');
  assert.equal(t.status, 'unverified');
  assert.match(t.detail, /pay-or-quit, termination-month-to-month/);
});

// --------------------------------------------- improvement 7: demo (see push-back on inlining)

test('shipped example output is fresh: output.json hash matches the current ruleset', () => {
  const out = JSON.parse(readFileSync(new URL('../examples/output.json', import.meta.url), 'utf8'));
  for (const b of out) assert.equal(b.ruleset.hash, rulesetHash(JURISDICTIONS));
});

test('demo stays self-contained: no external src= or href="http links', () => {
  const html = readFileSync(new URL('../demo/index.html', import.meta.url), 'utf8');
  assert.equal(/src\s*=\s*["']https?:/.test(html), false);
  assert.equal(/href\s*=\s*["']https?:/.test(html), false);
});

test('demo wires batch mode and MD/CSV exports through renderBoard/toCSV', () => {
  const html = readFileSync(new URL('../demo/index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('toCSV('));
  assert.ok(html.includes('renderBoard('));
  assert.ok(html.includes('id="batchJson"'));
  assert.ok(html.includes('id="mdBtn"'));
  assert.ok(html.includes('id="csvBtn"'));
});
