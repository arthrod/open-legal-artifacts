import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkNotice, renderBoard, toCSV, JURISDICTIONS } from './core.js';

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

test('elapsed days between service and filing verified when both dates known', () => {
  const ok = checkNotice({ ...CA_PAY, serviceDate: '2026-10-01', filedDate: '2026-10-05' });
  assert.equal(ok.checks.find((c) => c.id === 'elapsed').status, 'pass');
  const short = checkNotice({ ...CA_PAY, serviceDate: '2026-10-01', filedDate: '2026-10-02' });
  const e = short.checks.find((c) => c.id === 'elapsed');
  assert.equal(e.status, 'fail');
  assert.match(e.detail, /only 1 days elapsed/);
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

test('five example jurisdictions ship in the data', () => {
  assert.equal(Object.keys(JURISDICTIONS).length, 5);
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
