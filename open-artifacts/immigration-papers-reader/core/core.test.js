/** Tests for immigration-papers-reader core. Run: node --test "core/*.test.js" */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  readCase, documentStatus, exportChecklistMd, parseNotice,
  CASE_TYPES, REFERRAL_FACTORS, NOTICE_TEMPLATES, diffDays,
} from './core.js';

const TODAY = '2026-11-07';

const BASE = {
  case_type: 'naturalization', today: TODAY,
  documents: {
    green_card: { present: true, expiry_date: '2029-04-01' },
    n400_receipt: { present: true },
    tax_returns: { present: true },
  },
};

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
  test('tps and u_visa ship as data with >=3 required docs each', () => {
    for (const key of ['tps', 'u_visa']) {
      assert.ok(CASE_TYPES[key], key);
      assert.equal(CASE_TYPES[key].outOfScope, undefined);
      assert.ok(CASE_TYPES[key].required.length >= 3, key);
      for (const d of CASE_TYPES[key].required) assert.ok(d.id && d.label, `${key}.${d.id}`);
    }
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
    assert.equal(documentStatus({ present: true, expiry_date: '2026-11-20' }, TODAY, { expiringSoonDays: 10 }).status, 'present'); // 13d
  });
  test('malformed dates throw', () => {
    assert.throws(() => documentStatus({ present: true, expiry_date: 'soon' }, TODAY), /ISO/);
    assert.throws(() => documentStatus({}, 'Nov 7'), /today/);
  });
});

describe('parseNotice (deterministic paperwork parser)', () => {
  const I797C = [
    'U.S. Citizenship and Immigration Services (fictional sample)',
    'Form I-797C, Notice of Action',
    'Receipt Number: LIN2609012345',
    'Notice Date: October 31, 2026',
    'Notice Type: Receipt Confirmation',
    'Application Type: FORM I-140, Immigrant Petition for Alien Worker',
  ].join('\n');

  test('fictional I-797C text → exact facts, byte-identical across runs', () => {
    const p = parseNotice(I797C);
    assert.equal(p.matched, true);
    assert.equal(p.form_type, 'i797c');
    assert.deepEqual(p.facts.documents, { i140_notice: { present: true } });
    assert.deepEqual(p.facts.key_dates, { 'Notice date (I-797C)': { date: '2026-10-31', type: 'other' } });
    assert.deepEqual(p.facts.uncertain, []);
    assert.deepEqual(parseNotice(I797C), p); // determinism: same input, identical output object
  });
  test('unreadable date lands in uncertain — never guessed', () => {
    const p = parseNotice(I797C.replace('October 31, 2026', 'ILLEGIBLE SMEAR'));
    assert.equal(p.matched, true);
    assert.equal(p.facts.key_dates['Notice date (I-797C)'], undefined);
    assert.ok(p.facts.uncertain.some((u) => /notice date/i.test(u) && /unreadable/i.test(u)));
  });
  test('NTA → typed hearing key date + removal-proceedings referral complexity', () => {
    const NTA = [
      'EXECUTIVE OFFICE FOR IMMIGRATION REVIEW (fictional sample)',
      'Notice to Appear',
      'You are ordered to appear before an immigration judge on 12/15/2026 at 9:00 AM.',
    ].join('\n');
    const p = parseNotice(NTA);
    assert.equal(p.form_type, 'nta');
    assert.deepEqual(p.facts.key_dates, { 'Immigration court hearing (NTA)': { date: '2026-12-15', type: 'hearing' } });
    assert.deepEqual(p.facts.complexity, ['removal_proceedings']);
    assert.deepEqual(p.facts.documents, {});
  });
  test('EAD card → ead_card present with parsed expiry', () => {
    const EAD = [
      'DHS / USCIS (fictional sample)',
      'Form I-766, Employment Authorization Card',
      'Card Expires: 03/14/2028',
    ].join('\n');
    const p = parseNotice(EAD);
    assert.equal(p.form_type, 'ead');
    assert.deepEqual(p.facts.documents, { ead_card: { present: true, expiry_date: '2028-03-14' } });
    assert.deepEqual(p.facts.key_dates, {});
  });
  test('biometrics appointment (an I-797C variant) and I-693 parse without guessing validity', () => {
    const BIO = [
      'USCIS (fictional sample)',
      'Form I-797C, Notice of Action',
      'Application Support Center — Biometrics Appointment',
      'Appointment Date: November 24, 2026',
    ].join('\n');
    const b = parseNotice(BIO);
    assert.equal(b.form_type, 'biometrics'); // biometrics wins over generic I-797C
    assert.deepEqual(b.facts.documents, { biometrics_notice: { present: true } });
    assert.deepEqual(b.facts.key_dates, { 'Biometrics appointment': { date: '2026-11-24', type: 'other' } });
    const MED = 'USCIS (fictional sample)\nForm I-693, Report of Immigration Medical Examination and Vaccination Record';
    const m = parseNotice(MED);
    assert.equal(m.form_type, 'i693');
    assert.deepEqual(m.facts.documents, { i693_medical: { present: true } }); // no guessed validity window
  });
  test('unrecognized text → matched false, uncertain, no guessed facts', () => {
    const p = parseNotice('grocery list: eggs, milk, tortillas');
    assert.equal(p.matched, false);
    assert.equal(p.form_type, null);
    assert.ok(p.facts.uncertain.length >= 1);
    assert.deepEqual(p.facts.documents, {});
    assert.deepEqual(p.facts.key_dates, {});
  });
  test('every extracted value is traceable to a named template rule', () => {
    const p = parseNotice(I797C);
    assert.ok(p.extraction_log.some((e) => e.template === 'i797c' && e.field === 'notice_date' && e.value === '2026-10-31'));
    assert.ok(p.extraction_log.some((e) => e.field === 'document:i140_notice'));
    for (const e of p.extraction_log) assert.ok(NOTICE_TEMPLATES[e.template], e.template);
  });
});

describe('readCase', () => {
  test('readiness counts only valid required docs; selective service missing', () => {
    const r = readCase(BASE);
    assert.equal(r.readiness.required_count, 4);
    assert.equal(r.readiness.ready_count, 3);
    assert.equal(r.readiness.score, 75);
    assert.ok(r.readiness.not_ready.some((n) => n.id === 'selective_service' && n.status === 'missing'));
    assert.equal(r.referral.flag, false);
    assert.equal(r.readiness.has_uncertain, false);
  });
  test('expired required doc counts against readiness and lands in not_ready', () => {
    const r = readCase({ ...BASE, documents: { ...BASE.documents, green_card: { present: true, expiry_date: '2025-01-01' } } });
    assert.equal(r.readiness.ready_count, 2);
    assert.ok(r.readiness.not_ready.some((n) => n.status === 'expired'));
  });
  test('complexity factors trigger referral with mapped labels', () => {
    const r = readCase({ ...BASE, complexity: ['criminal_history', 'prior_denial'] });
    assert.equal(r.referral.flag, true);
    assert.deepEqual(r.referral.reasons.map((x) => x.id), ['criminal_history', 'prior_denial']);
    assert.ok(r.summary.some((s) => /referred/.test(s)));
  });
  test('unknown complexity factor warns but still refers', () => {
    const r = readCase({ ...BASE, complexity: ['something_new'] });
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
    assert.throws(() => readCase({ case_type: 'deduction', today: TODAY }), /Unknown case_type/);
  });
  test('missing today throws — readCase never reads the clock', () => {
    assert.throws(() => readCase({ case_type: 'naturalization' }), /today/);
    assert.throws(() => readCase({ case_type: 'naturalization', today: null }), /today/);
  });
  test('urgent and passed key dates warn; days_until exact; sorted soonest-first', () => {
    const r = readCase({ ...BASE, key_dates: { 'Interview (fictional)': '2026-11-12', 'Biometrics': '2026-10-01' } });
    assert.deepEqual(r.key_dates.map((k) => k.days_until), [-37, 5]); // ascending days_until
    assert.equal(r.key_dates[1].urgent, true);
    assert.ok(r.warnings.some((w) => /URGENT/.test(w)));
    assert.ok(r.warnings.some((w) => /PASSED/.test(w)));
  });
});

describe('readCase uncertain handling (capture honesty)', () => {
  test('present-but-uncertain doc lowers score, excluded from ready count, warns', () => {
    const r = readCase({ ...BASE, documents: { ...BASE.documents, tax_returns: { present: true, uncertain: true } } });
    assert.equal(r.readiness.ready_count, 2);
    assert.equal(r.readiness.score, 50);
    assert.equal(r.readiness.has_uncertain, true);
    assert.equal(r.checklist.find((c) => c.id === 'tax_returns').status, 'uncertain');
    assert.ok(r.readiness.not_ready.some((n) => n.id === 'tax_returns' && n.status === 'uncertain'));
    assert.ok(r.warnings.some((w) => /UNCERTAIN/.test(w) && /tax returns/i.test(w)));
  });
  test('top-level facts.uncertain entries naming a doc id flag that doc', () => {
    const r = readCase({
      ...BASE,
      documents: { ...BASE.documents, selective_service: { present: true } },
      uncertain: ['selective_service — registration status unreadable', 'the mailing address block was smudged'],
    });
    assert.equal(r.checklist.find((c) => c.id === 'selective_service').status, 'uncertain');
    assert.equal(r.readiness.ready_count, 3); // selective_service no longer counts as ready
    assert.ok(r.warnings.some((w) => /mailing address/.test(w))); // unmatched note surfaced verbatim
  });
  test('uncertain must be an array of strings', () => {
    assert.throws(() => readCase({ ...BASE, uncertain: 'green_card unreadable' }), /uncertain/);
    assert.throws(() => readCase({ ...BASE, uncertain: [42] }), /uncertain/);
  });
});

describe('key-date taxonomy', () => {
  test('typed dates carry type + loud copy, sort by days_until, feed next_action', () => {
    const r = readCase({
      ...BASE,
      key_dates: {
        'EAD renewal deadline (fictional)': { date: '2026-12-01', type: 'filing_deadline' },
        'Master calendar hearing (fictional)': { date: '2026-11-18', type: 'hearing' },
        'Biometrics (fictional)': '2026-10-01',
      },
    });
    assert.deepEqual(r.key_dates.map((k) => k.days_until), [-37, 11, 24]);
    assert.equal(r.key_dates[1].type, 'hearing');
    assert.ok(r.key_dates[1].loud.includes('in-absentia'));
    assert.ok(r.key_dates[2].loud.includes('FILING DEADLINE'));
    assert.equal(r.next_action.type, 'hearing');
    assert.equal(r.next_action.date, '2026-11-18');
    assert.ok(r.next_action.action.length > 10);
    assert.ok(r.summary.some((s) => /Next action/.test(s)));
  });
  test('a hearing date already passed auto-triggers missed_hearing referral', () => {
    const r = readCase({ ...BASE, key_dates: { 'Master calendar hearing (fictional)': { date: '2026-10-01', type: 'hearing' } } });
    assert.ok(r.referral.reasons.some((x) => x.id === 'missed_hearing'));
    assert.equal(r.referral.flag, true);
    const dup = readCase({ ...BASE, complexity: ['missed_hearing'], key_dates: { 'MCH (fictional)': { date: '2026-10-01', type: 'hearing' } } });
    assert.equal(dup.referral.reasons.filter((x) => x.id === 'missed_hearing').length, 1); // deduped
  });
  test('invalid key-date type or shape throws', () => {
    assert.throws(() => readCase({ ...BASE, key_dates: { x: { date: '2026-11-18', type: 'party' } } }), /type/);
    assert.throws(() => readCase({ ...BASE, key_dates: { x: 42 } }), /key_dates/);
    assert.throws(() => readCase({ ...BASE, key_dates: { x: { date: 'soon', type: 'hearing' } } }), /ISO/);
  });
  test('plain ISO string dates remain accepted with type other and empty loud copy', () => {
    const r = readCase({ ...BASE, key_dates: { 'Interview (fictional)': '2026-11-12' } });
    assert.equal(r.key_dates[0].type, 'other');
    assert.equal(r.key_dates[0].loud, '');
    assert.equal(r.next_action.date, '2026-11-12');
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

describe('bilingual export (EN/ES)', () => {
  test('es export uses Spanish headings and unofficial-translation disclaimer', () => {
    const r = readCase({ ...BASE, complexity: ['prior_denial'], key_dates: { 'Interview (fictional)': { date: '2026-11-12', type: 'hearing' } } });
    const md = exportChecklistMd(r, { lang: 'es' });
    assert.ok(md.includes('## Documentos requeridos'));
    assert.ok(md.includes('Fechas clave'));
    assert.ok(md.includes('Advertencias'));
    assert.ok(md.includes('SE RECOMIENDA DERIVACIÓN'));
    assert.ok(md.includes('no oficial'));
    assert.ok(/no es asesoría legal/i.test(md));
    assert.ok(!md.includes('## Required documents'));
  });
  test('default is english; unknown lang throws', () => {
    assert.ok(exportChecklistMd(readCase(BASE)).includes('## Required documents'));
    assert.throws(() => exportChecklistMd(readCase(BASE), { lang: 'fr' }), /lang/);
  });
});
