import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPortfolio, toCSV, renderDashboard, computeSol, addYears, addDays,
  isValidIsoDate, DEFAULT_CLAIM_RULES,
} from './core.js';

const AS_OF = '2026-11-07';

function matter(partial) {
  return {
    id: 'M1',
    name: 'Harbor v. Northwind Logistics (fictional)',
    client: 'Harbor Bakehouse Co.',
    claimType: 'personal-injury-negligence',
    accrualDate: '2025-06-15',
    status: 'active',
    stage: 'discovery',
    ...partial,
  };
}

test('addYears handles leap day by clamping to Feb 28', () => {
  assert.equal(addYears('2024-02-29', 2), '2026-02-28');
  assert.equal(addYears('2025-03-01', 1), '2026-03-01');
});

test('addDays crosses month and year boundaries', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('occurrence accrual: PI deadline is accrual + 2 years', () => {
  const out = buildPortfolio({ asOf: AS_OF, matters: [matter()] });
  assert.equal(out.matters[0].sol.deadline, '2027-06-15');
  assert.equal(out.matters[0].sol.accrualUsed, '2025-06-15');
  assert.match(out.matters[0].sol.ruleCite, /335\.1/);
});

test('discovery accrual uses discoveryDate when the rule requires it', () => {
  const out = buildPortfolio({
    asOf: AS_OF,
    matters: [matter({ claimType: 'fraud', accrualDate: '2022-04-01', discoveryDate: '2025-01-10' })],
  });
  assert.equal(out.matters[0].sol.deadline, '2028-01-10');
  assert.equal(out.matters[0].sol.accrualUsed, '2025-01-10');
});

test('day-based rule (300-day EEOC window) computes by days', () => {
  const out = buildPortfolio({
    asOf: AS_OF,
    matters: [matter({ claimType: 'employment-discrimination-federal', accrualDate: '2026-01-01' })],
  });
  assert.equal(out.matters[0].sol.deadline, '2026-10-28');
  assert.equal(out.matters[0].sol.status, 'expired');
  assert.ok(out.matters[0].sol.daysRemaining < 0);
});

test('tolling events extend the deadline by their span', () => {
  const out = buildPortfolio({
    asOf: AS_OF,
    matters: [matter({
      accrualDate: '2024-03-10',
      tollingEvents: [{ from: '2024-06-01', to: '2024-12-01', reason: 'defendant bankruptcy stay (fictional)' }],
    })],
  });
  // 2024-03-10 + 2y = 2026-03-10; tolling adds 183 days -> 2026-09-09
  assert.equal(out.matters[0].sol.deadline, '2026-09-09');
});

test('unparseable tolling dates are flagged and ignored, not guessed', () => {
  const out = buildPortfolio({
    asOf: AS_OF,
    matters: [matter({ tollingEvents: [{ from: 'spring 2024', to: '2024-12-01', reason: 'bad dates' }] })],
  });
  assert.equal(out.matters[0].sol.deadline, '2027-06-15');
  assert.ok(out.matters[0].flags.some((f) => f.includes('tolling event "bad dates"')));
});

test('unknown claim type never invents a deadline', () => {
  const out = buildPortfolio({ asOf: AS_OF, matters: [matter({ claimType: 'exotic-tort' })] });
  assert.equal(out.matters[0].sol.deadline, null);
  assert.equal(out.matters[0].sol.status, 'unverified');
  assert.match(out.matters[0].flags[0], /unknown claim type/);
  assert.equal(out.summary.solUnverified, 1);
});

test('missing accrual date is flagged, deadline null', () => {
  const sol = computeSol({ claimType: 'fraud' }, DEFAULT_CLAIM_RULES);
  assert.equal(sol.deadline, null);
  assert.match(sol.flags[0], /discovery date missing/);
});

test('unparseable accrual date is flagged, never guessed', () => {
  const sol = computeSol({ claimType: 'personal-injury-negligence', accrualDate: 'early 2025' }, DEFAULT_CLAIM_RULES);
  assert.equal(sol.deadline, null);
  assert.match(sol.flags[0], /unparseable occurrence-accrual date/);
});

test('sol status bands: expired / critical / warning / ok', () => {
  const mk = (accrual) => matter({ id: accrual, accrualDate: accrual });
  const out = buildPortfolio({
    asOf: AS_OF,
    matters: [mk('2024-01-01'), mk('2024-11-15'), mk('2025-01-15'), mk('2025-06-15')],
  });
  const byId = Object.fromEntries(out.matters.map((m) => [m.id, m.sol.status]));
  assert.equal(byId['2024-01-01'], 'expired');       // deadline 2026-01-01 < asOf
  assert.equal(byId['2024-11-15'], 'critical');      // ~8 days left
  assert.equal(byId['2025-01-15'], 'warning');       // ~70 days left
  assert.equal(byId['2025-06-15'], 'ok');
  assert.equal(out.summary.solAlerts, 2);
});

test('custom claimRules override defaults (rules-as-data)', () => {
  const out = buildPortfolio({
    asOf: AS_OF,
    claimRules: { 'personal-injury-negligence': { label: 'PI', years: 1, cite: 'Fictional St. § 1 (custom)' } },
    matters: [matter()],
  });
  assert.equal(out.matters[0].sol.deadline, '2026-06-15');
  assert.equal(out.matters[0].sol.ruleCite, 'Fictional St. § 1 (custom)');
});

test('exposure banding at configurable boundaries', () => {
  const mk = (high) => matter({ id: `e${high}`, exposureHigh: high });
  const out = buildPortfolio({ asOf: AS_OF, matters: [mk(49999), mk(50000), mk(500000), mk(500001), matter({ id: 'none' })] });
  const band = Object.fromEntries(out.matters.map((m) => [m.id, m.exposure.band]));
  assert.equal(band['e49999'], 'low');
  assert.equal(band['e50000'], 'low');
  assert.equal(band['e500000'], 'medium');
  assert.equal(band['e500001'], 'high');
  assert.equal(band['none'], 'unquantified');
  assert.equal(out.summary.exposureByBand.high.totalHighEstimate, 500001);
});

test('inverted exposure estimates are flagged', () => {
  const out = buildPortfolio({ asOf: AS_OF, matters: [matter({ exposureLow: 900, exposureHigh: 100 })] });
  assert.ok(out.matters[0].flags.some((f) => f.includes('exposureLow > exposureHigh')));
});

test('CSV has header + one row per matter, escaped where needed', () => {
  const out = buildPortfolio({ asOf: AS_OF, matters: [matter(), matter({ id: 'M2', name: 'Comma, Co. v "Quoted" (fictional)', accrualDate: '2023-01-01' })] });
  const csv = toCSV(out);
  const lines = csv.trimEnd().split('\n');
  assert.equal(lines.length, 3);
  assert.ok(lines[0].startsWith('id,name,client,claimType'));
  assert.ok(lines[2].includes('"Comma, Co. v ""Quoted"" (fictional)"'));
  assert.ok(lines[2].includes('expired'));
});

test('renderDashboard includes summary, band table, and sorted matters', () => {
  const out = buildPortfolio({ asOf: AS_OF, matters: [matter(), matter({ id: 'M0', accrualDate: '2024-01-01' })] });
  const md = renderDashboard(out);
  assert.match(md, /# Litigation portfolio — as of 2026-11-07/);
  assert.match(md, /verify ruleCite/); // disclaimer present
  assert.match(md, /\| Band \| Matters \|/);
  // M0 (expired) listed before M1 (ok): sorted by days remaining
  assert.ok(md.indexOf('M0') < md.indexOf('M1'));
});

test('isValidIsoDate rejects impossible dates', () => {
  assert.equal(isValidIsoDate('2026-02-30'), false);
  assert.equal(isValidIsoDate('2026-13-01'), false);
  assert.equal(isValidIsoDate('2026-02-28'), true);
});
