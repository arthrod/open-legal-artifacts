/** Tests for immigration-papers-reader core. Run: node --test "core/*.test.js" */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readCase, documentStatus, exportChecklistMd, CASE_TYPES, REFERRAL_FACTORS, diffDays } from './core.js';

const TODAY = '2026-11-07';

describe('rules-as-data integrity', () => {
  test('every in-scope case type has required docs with ids and labels', () => {
    for (const [key, t] of Object.entries(CASE_TYPES)) {
      if (t.outOfScope) continue;
      assert.ok(t.required.length >= 3, key);
      for (const d of t.required) assert.ok(d.id && d.label, `${key}.${d.id}`);
    }
  });
  test('removal defense is out of scope', () => {
    assert.equal(CASE_TYPES.removal_defense.outOfScope, true);
  });
});

describe('documentStatus date math', () => {
  test('missing when not present', () => {
    assert.equal(documentStatus({}, TODAY).status, 'missing');
  });
  test('present with no tracked expiry', () => {
    assert.equal(documentStatus({ present: true }, TODAY).status, 'present');
  });
  test('expired when expiry is in the past or today', () => {
    assert.equal(documentStatus({ present: true, expiry_date: '2026-11-06' }, TODAY).status, 'expired');
    assert.equal(documentStatus({ present: true, expiry_date: TODAY }, TODAY).status, 'expired');
  });
  test('expiring_soon inside the window, present outside it', () => {
    assert.equal(documentStatus({ present: true, expiry_date: '2027-02-03' }, TODAY).status, 'expiring_soon'); // 88d
    assert.equal(documentStatus({ present: true, expiry_date: '2027-05-06' }, TODAY).status, 'expiring_soon'); // 180d exactly — boundary is inside
    assert.equal(documentStatus({ present: true, expiry_date: '2027-05-07' }, TODAY).status, 'present'); // 181d
  });
  test('window is configurable', () => {
    assert.equal(documentStatus({ present: true, expiry_date: '2026-11-20' }, TODAY, { expiringSoonDays: 15 }).status, 'expiring_soon'); // 13d
    assert.equal(documentStatus({ present: true, expiry_date: '2026-11-20' }, TODAY, { expiringSoonDays: 10 }).status, 'present');
  });
  test('malformed dates throw', () => {
    assert.throws(() => documentStatus({ present: true, expiry_date: 'soon' }, TODAY), /ISO/);
    assert.throws(() => documentStatus({}, 'Nov 7'), /today/);
  });
});

describe('readCase', () => {
  const base = {
    case_type: 'naturalization', today: TODAY,
    documents: {
      green_card: { present: true, expiry_date: '2029-04-01' },
      n400_receipt: { present: true },
      tax_returns: { present: true },
    },
  };
  test('readiness counts only valid required docs; selective service missing', () => {
    const r = readCase(base);
    assert.equal(r.readiness.required_count, 4);
    assert.equal(r.readiness.ready_count, 3);
    assert.equal(r.readiness.score, 75);
    assert.ok(r.readiness.not_ready.some((n) => n.id === 'selective_service' && n.status === 'missing'));
    assert.equal(r.referral.flag, false);
  });
  test('expired required doc counts against readiness and lands in not_ready', () => {
    const r = readCase({ ...base, documents: { ...base.documents, green_card: { present: true, expiry_date: '2025-01-01' } } });
    assert.equal(r.readiness.ready_count, 2);
    assert.ok(r.readiness.not_ready.some((n) => n.status === 'expired'));
  });
  test('complexity factors trigger referral with mapped labels', () => {
    const r = readCase({ ...base, complexity: ['criminal_history', 'prior_denial'] });
    assert.equal(r.referral.flag, true);
    assert.deepEqual(r.referral.reasons.map((x) => x.id), ['criminal_history', 'prior_denial']);
    assert.ok(r.summary.some((s) => /referred/.test(s)));
  });
  test('unknown complexity factor warns but still refers', () => {
    const r = readCase({ ...base, complexity: ['something_new'] });
    assert.equal(r.referral.flag, true);
    assert.ok(r.warnings.some((w) => /something_new/.test(w)));
  });
  test('removal defense is referred, never scored', () => {
    const r = readCase({ case_type: 'removal_defense', today: TODAY, documents: {} });
    assert.equal(r.referral.flag, true);
    assert.ok(r.referral.reasons.some((x) => x.id === 'out_of_scope_case_type'));
    assert.ok(r.warnings.some((w) => /not computed/.test(w)));
  });
  test('unknown case type throws', () => {
    assert.throws(() => readCase({ case_type: 'deduction' }), /Unknown case_type/);
  });
  test('urgent and passed key dates warn; days_until is exact', () => {
    const r = readCase({ ...base, key_dates: { 'Interview (fictional)': '2026-11-12', 'Biometrics': '2026-10-01' } });
    assert.equal(r.key_dates[0].days_until, 5);
    assert.equal(r.key_dates[0].urgent, true);
    assert.equal(r.key_dates[1].days_until, -37);
    assert.ok(r.warnings.some((w) => /URGENT/.test(w)));
    assert.ok(r.warnings.some((w) => /PASSED/.test(w)));
  });
});

describe('exportChecklistMd', () => {
  test('checklist shows statuses, referral, key dates, disclaimer', () => {
    const r = readCase({
      case_type: 'asylum_affirmative', today: TODAY,
      documents: { government_id: { present: true }, i589_receipt: { present: true }, personal_statement: { present: true } },
      complexity: ['prior_denial'],
      key_dates: { 'Asylum interview (fictional)': '2026-11-20' },
    });
    const md = exportChecklistMd(r);
    assert.ok(md.includes('**REFERRAL RECOMMENDED**'));
    assert.ok(md.includes('- [ ] **Country-conditions evidence**'));
    assert.ok(md.includes('- [x] **Passport or other government ID**'));
    assert.ok(md.includes('Asylum interview (fictional): **2026-11-20**'));
    assert.ok(md.includes('not legal advice'));
  });
});
