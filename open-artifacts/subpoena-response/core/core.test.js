/** Tests for subpoena-response core. Run: node --test "core/*.test.js" */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDeadline, analyzeScope, transitionPrivilegeState, privilegeProgress,
  resolveObjections, trackResponse, exportChecklistMd, OBJECTION_GROUNDS, PRIVILEGE_STATES, diffDays,
  SUBPOENA_TYPES, classifySubpoena, computeAllDeadlines, applyObjections, auditProvenance,
  crossCheckPortfolio, exportIcs, PROVENANCE_FIELDS, PRIVILEGE_LOG_FIELDS,
} from './core.js';

describe('computeDeadline', () => {
  test('calendar days: served 2026-11-02 + 14 = 2026-11-16', () => {
    const r = computeDeadline({ served_date: '2026-11-02', service_method: 'personal' });
    assert.equal(r.deadline, '2026-11-16');
    assert.equal(r.extension_days, 0);
  });
  test('mail service adds configurable extension days', () => {
    const r = computeDeadline({ served_date: '2026-11-02', service_method: 'mail' }, { mail_extension_days: 3 });
    assert.equal(r.total_days, 17);
    assert.equal(r.deadline, '2026-11-19');
  });
  test('court days skip weekends and listed holidays', () => {
    // served Wed 2026-11-04; 10 court days; holiday Thu 2026-11-26; weekend 11-07/08, 11-14/15, 11-21/22
    const r = computeDeadline({ served_date: '2026-11-04' }, { days: 10, day_type: 'court', holidays: ['2026-11-26'] });
    // count: 5,6,9,10,11,12,13 (7) → 16,17,18 (10) → deadline 2026-11-18 (11-26 holiday not reached)
    assert.equal(r.deadline, '2026-11-18');
    assert.ok(r.skipped_noncourt_days.includes('2026-11-07'));
  });
  test('court-day counting stops before a listed holiday when holiday falls in range', () => {
    const r = computeDeadline({ served_date: '2026-11-16' }, { days: 8, day_type: 'court', holidays: ['2026-11-26', '2026-11-27'] });
    // count 17,18,19,20,23,24,25 (7) → 26,27 skipped → 30 = 8th
    assert.equal(r.deadline, '2026-11-30');
    assert.ok(r.skipped_noncourt_days.includes('2026-11-26'));
  });
  test('configurable day count overrides the 14-day default', () => {
    assert.equal(computeDeadline({ served_date: '2026-03-01' }, { days: 30 }).deadline, '2026-03-31');
  });
  test('invalid served_date or day_type throws', () => {
    assert.throws(() => computeDeadline({ served_date: 'Nov 2' }), /ISO date/);
    assert.throws(() => computeDeadline({ served_date: '2026-11-02' }, { day_type: 'lunar' }), /day_type/);
  });
});

describe('analyzeScope', () => {
  const base = {
    date_range: { start: '2015-01-01', end: '2026-11-01' },
    custodians: Array.from({ length: 10 }, (_, i) => ({ name: `C${i}`, role: 'engineer' })),
    data_types: [{ type: 'email', systems: ['Exchange'] }, { type: 'personal text messages', systems: ['carrier records'] }],
  };
  test('long range + many custodians + personal messages trigger flags and suggestions', () => {
    const s = analyzeScope(base);
    assert.ok(s.flags.some((f) => f.kind === 'overbroad_time'));
    assert.ok(s.flags.some((f) => f.kind === 'overbroad_custodians'));
    assert.ok(s.flags.some((f) => f.kind === 'pii_privacy'));
    for (const id of ['overbroad_time', 'overbroad_custodians', 'pii_privacy', 'privilege']) assert.ok(s.suggested_objections.includes(id));
  });
  test('tight scope triggers no overbreadth flags; privilege always suggested', () => {
    const s = analyzeScope({
      date_range: { start: '2025-01-01', end: '2025-12-31' },
      custodians: [{ name: 'A', role: 'CFO' }],
      data_types: [{ type: 'email', systems: ['Exchange'] }],
    });
    assert.deepEqual(s.flags, []);
    assert.deepEqual(s.suggested_objections, ['privilege']);
  });
  test('thresholds are configurable', () => {
    const s = analyzeScope(base, { thresholds: { overbroad_years: 20, overbroad_custodians: 50 } });
    assert.ok(!s.flags.some((f) => f.kind === 'overbroad_time' || f.kind === 'overbroad_custodians'));
  });
  test('inverted or malformed date range throws', () => {
    assert.throws(() => analyzeScope({ date_range: { start: '2026-01-01', end: '2025-01-01' } }), /inverted/);
    assert.throws(() => analyzeScope({ date_range: { start: 'x', end: '2026-01-01' } }), /ISO/);
  });
});

describe('privilege workflow', () => {
  test('forward transition one step is clean', () => {
    const t = transitionPrivilegeState('not_started', 'collecting');
    assert.equal(t.ok, true);
    assert.ok(!t.warning);
  });
  test('skipping states warns but succeeds; backward moves are blocked', () => {
    const skip = transitionPrivilegeState('not_started', 'log_drafted');
    assert.equal(skip.ok, true);
    assert.match(skip.warning, /Skipped/);
    const back = transitionPrivilegeState('reviewing', 'collecting');
    assert.equal(back.ok, false);
  });
  test('unknown states throw; progress maps 0–100', () => {
    assert.throws(() => privilegeProgress('nope'), /Unknown privilege state/);
    assert.equal(privilegeProgress('final'), 100);
    assert.equal(privilegeProgress('not_started'), 0);
  });
});

describe('objection library', () => {
  test('every ground has id, label, description, support', () => {
    for (const g of OBJECTION_GROUNDS) for (const k of ['id', 'label', 'description', 'typical_support']) assert.ok(String(g[k]).length > 0);
  });
  test('resolveObjections enriches and rejects unknown ids', () => {
    const r = resolveObjections(['undue_burden']);
    assert.equal(r[0].label, 'Unduly burdensome / disproportionate');
    assert.throws(() => resolveObjections(['frivolous']), /frivolous/);
  });
});

describe('trackResponse + export', () => {
  const facts = {
    matter: { name: 'Fictional: Drummond v. Halvorsen Freight' },
    today: '2026-11-13',
    subpoena: { served_date: '2026-11-02', service_method: 'mail' },
    deadline_rule: { days: 14, day_type: 'calendar', mail_extension_days: 3 },
    responsive_scope: {
      date_range: { start: '2016-01-01', end: '2026-11-01' },
      custodians: [{ name: 'R. Okonkwo', role: 'VP Operations' }, { name: 'T. Marsh', role: 'Dispatcher' }],
      data_types: [{ type: 'email', systems: ['Exchange'] }],
    },
    privilege_review: { state: 'reviewing' },
    objections_selected: ['overbroad_time', 'undue_burden'],
    legal_hold: true,
  };
  test('deadline math, status, and privilege progress combine', () => {
    const r = trackResponse(facts);
    assert.equal(r.deadline.deadline, '2026-11-19');
    assert.equal(r.deadline_math.days_remaining, 6);
    assert.equal(r.deadline_math.status, 'on_track');
    assert.equal(r.privilege.progress, 40);
    assert.ok(r.scope.flags.some((f) => f.kind === 'overbroad_time'));
  });
  test('overdue deadline escalates', () => {
    const r = trackResponse({ ...facts, today: '2026-11-25' });
    assert.equal(r.deadline_math.status, 'overdue');
    assert.ok(r.warnings.some((w) => /DEADLINE PASSED/.test(w)));
  });
  test('checklist includes deadline, custodians, states, objections, disclaimer', () => {
    const md = exportChecklistMd(trackResponse(facts));
    for (const needle of ['2026-11-19', 'R. Okonkwo', '- [x] reviewing', 'Overbroad time period', 'not legal advice']) assert.ok(md.includes(needle), needle);
    for (const s of PRIVILEGE_STATES) assert.ok(md.includes(s));
  });
});

/* ------------------------------------------------------------------ *
 * Wave-2 improvements: classification, multi-deadline engine, objection
 * matrix, provenance, portfolio cross-check, compliance plan, ICS.
 * ------------------------------------------------------------------ */

const WAVE2_FACTS = {
  matter: { name: 'Fictional: Drummond v. Halvorsen Freight', client: 'Halvorsen Freight Co.', role: 'non-party responding to subpoena', issuing_authority: 'Superior Court of Maricopa County (fictionalized caption)' },
  today: '2026-11-13',
  subpoena: { served_date: '2026-11-02', service_method: 'mail', caption: 'Drummond v. Halvorsen Freight Co., No. CV-2026-01142 (fictional)' },
  deadline_rule: { days: 14, day_type: 'calendar', mail_extension_days: 3 },
  responsive_scope: {
    date_range: { start: '2016-01-01', end: '2026-11-01' },
    custodians: Array.from({ length: 10 }, (_, i) => ({ name: `C${i}`, role: 'engineer' })),
    data_types: [{ type: 'email', systems: ['Exchange Online'] }, { type: 'personal text messages', systems: ['carrier records'] }, { type: 'telemetry logs', systems: ['FleetTrack SaaS'] }],
  },
  privilege_review: { state: 'reviewing' },
  objections_selected: ['overbroad_time', 'overbroad_custodians', 'undue_burden', 'pii_privacy'],
  legal_hold: true,
};

describe('classifySubpoena', () => {
  test('grand-jury caption → type grand_jury with STOP gate and escalation', () => {
    const c = classifySubpoena({ matter: {}, subpoena: { served_date: '2026-11-02', caption: 'In re Grand Jury Investigation No. 26-GJ-044' } });
    assert.equal(c.type, 'grand_jury');
    assert.equal(c.stop, true);
    assert.ok(c.escalation.some((w) => /criminal counsel/i.test(w)));
  });
  test('explicit type override wins; unknown type throws', () => {
    const c = classifySubpoena({ ...WAVE2_FACTS, subpoena: { ...WAVE2_FACTS.subpoena, type: 'third_party_deposition' } });
    assert.equal(c.type, 'third_party_deposition');
    assert.equal(c.stop, false);
    assert.throws(() => classifySubpoena({ subpoena: { type: 'wedding_invitation' } }), /Unknown subpoena type/);
  });
  test('grand-jury marker overrides a non-grand-jury explicit type — STOP fails closed', () => {
    const c = classifySubpoena({ ...WAVE2_FACTS, subpoena: { ...WAVE2_FACTS.subpoena, type: 'third_party_documents', caption: 'In re Grand Jury Investigation No. 26-GJ-044' } });
    assert.equal(c.stop, true);
    assert.ok(c.escalation.some((w) => /criminal counsel/i.test(w)));
    assert.match(c.basis, /grand-jury marker/i);
  });
  test('explicit grand-jury type keeps STOP; explicit type without markers stays open', () => {
    const gj = classifySubpoena({ ...WAVE2_FACTS, subpoena: { ...WAVE2_FACTS.subpoena, type: 'grand_jury' } });
    assert.equal(gj.stop, true);
    const plain = classifySubpoena({ ...WAVE2_FACTS, subpoena: { ...WAVE2_FACTS.subpoena, type: 'third_party_deposition' } });
    assert.equal(plain.stop, false);
  });
  test('CID and party-role detection from text', () => {
    const cid = classifySubpoena({ matter: {}, subpoena: { caption: 'Civil Investigative Demand No. 314-2 (FTC)' } });
    assert.equal(cid.type, 'civil_investigative_demand');
    assert.ok(cid.escalation.some((w) => /regulatory counsel/i.test(w)));
    const party = classifySubpoena({ matter: { role: 'defendant; party to the litigation' }, subpoena: { caption: 'Drummond v. Halvorsen Freight Co.' } });
    assert.equal(party.type, 'party');
  });
  test('document subpoena is the default; every type id is valid', () => {
    const c = classifySubpoena(WAVE2_FACTS);
    assert.equal(c.type, 'third_party_documents');
    assert.equal(c.stop, false);
    assert.equal(SUBPOENA_TYPES.length, 5);
    for (const t of ['third_party_documents', 'third_party_deposition', 'party', 'civil_investigative_demand', 'grand_jury']) assert.ok(SUBPOENA_TYPES.includes(t));
  });
});

describe('computeAllDeadlines', () => {
  test('computes all five deadlines exactly, including the earlier-of objection rule', () => {
    const d = computeAllDeadlines(WAVE2_FACTS);
    assert.equal(d.response.deadline, '2026-11-19');          // 14+3 calendar days
    assert.equal(d.objection.deadline, '2026-11-15');         // earlier of compliance 11-19 vs 10+3=13 days → 11-15
    assert.equal(d.objection.candidates.compliance_date, '2026-11-19');
    assert.equal(d.objection.candidates.fixed_days_after_service, '2026-11-15');
    assert.equal(d.production.deadline, '2026-12-05');        // 30+3 = 33 days
    assert.equal(d.quash_window.deadline, '2026-11-19');      // 14+3 = 17 days
    assert.equal(d.meet_and_confer.deadline, '2026-11-12');   // 7+3 = 10 days
    assert.equal(d.earliest_deadline.kind, 'meet_and_confer');
    assert.equal(d.earliest_deadline.deadline, '2026-11-12');
    assert.equal(d.earliest_deadline.days_remaining, -1);     // today 2026-11-13
  });
  test('earlier-of flips to the compliance date when the fixed window runs longer', () => {
    const d = computeAllDeadlines({ ...WAVE2_FACTS, deadline_rule: { ...WAVE2_FACTS.deadline_rule, deadlines: { objection: { days: 30 } } } });
    assert.equal(d.objection.deadline, '2026-11-19');
    assert.ok(/compliance/i.test(d.objection.basis));
  });
  test('passed earliest deadline escalates; note warns that forums differ', () => {
    const d = computeAllDeadlines(WAVE2_FACTS);
    assert.ok(d.escalation.some((w) => /EARLIEST DEADLINE PASSED/i.test(w)));
    assert.ok(d.notes.some((n) => /EARLIER of the compliance date/i.test(n)), 'earlier-of jurisdiction note');
  });
  test('per-kind day overrides are honored and disable via null', () => {
    const d = computeAllDeadlines({ ...WAVE2_FACTS, deadline_rule: { ...WAVE2_FACTS.deadline_rule, deadlines: { production: { days: 45 }, meet_and_confer: null } } });
    assert.equal(d.production.deadline, '2026-12-20'); // 45+3 = 48 days from 11-02
    assert.equal(d.meet_and_confer, undefined);
  });
});

describe('applyObjections (objection application matrix)', () => {
  test('10.8-year range → overbroad_time strong with categories and all custodians', () => {
    const m = applyObjections(WAVE2_FACTS);
    const time = m.find((r) => r.id === 'overbroad_time');
    assert.equal(time.strength, 'strong'); // 10.8 >= 2 × 5
    assert.ok(time.categories.includes('email'));
    assert.equal(time.custodians.length, 10);
    assert.match(time.strength_basis, /10\.8/);
  });
  test('10 vs 8 custodians → moderate; manual grounds unrated; covers suggested ∪ selected', () => {
    const m = applyObjections(WAVE2_FACTS);
    const cust = m.find((r) => r.id === 'overbroad_custodians');
    assert.equal(cust.strength, 'moderate');
    const burden = m.find((r) => r.id === 'undue_burden');
    assert.equal(burden.strength, 'unrated');
    const priv = m.find((r) => r.id === 'privilege');
    assert.equal(priv.strength, 'moderate');
    const ids = m.map((r) => r.id);
    for (const id of ['overbroad_time', 'overbroad_custodians', 'pii_privacy', 'privilege', 'undue_burden']) assert.ok(ids.includes(id), id);
  });
  test('pii_privacy applied only to personal categories; unknown selected id throws', () => {
    const m = applyObjections(WAVE2_FACTS);
    const pii = m.find((r) => r.id === 'pii_privacy');
    assert.deepEqual(pii.categories, ['personal text messages']);
    assert.throws(() => applyObjections({ ...WAVE2_FACTS, objections_selected: ['frivolous'] }), /frivolous/);
  });
});

describe('auditProvenance', () => {
  test('untagged critical fields → warnings naming them', () => {
    const p = auditProvenance(WAVE2_FACTS); // no provenance block at all
    assert.ok(p.warnings.some((w) => w.includes('subpoena.served_date')));
    assert.ok(p.warnings.some((w) => w.includes('responsive_scope.date_range.start')));
    assert.equal(p.verify_first.length, 0);
  });
  test('verified tags clear the warning; verify-status tags land in verify_first; unknown keys warn', () => {
    const facts = {
      ...WAVE2_FACTS,
      provenance: {
        'subpoena.served_date': { source: 'certificate of service, p. 3 of subpoena', status: 'verified' },
        'subpoena.service_method': { source: 'certificate of service', status: 'verify' },
        typo_field: { source: 'x', status: 'verified' },
      },
    };
    const p = auditProvenance(facts);
    assert.ok(!p.warnings.some((w) => w.includes('subpoena.served_date')));
    assert.ok(p.verify_first.some((v) => v.field === 'subpoena.service_method'));
    assert.ok(p.warnings.some((w) => /unknown field key "typo_field"/.test(w)));
    assert.equal(PROVENANCE_FIELDS.length, 5);
  });
});

describe('crossCheckPortfolio', () => {
  test('same caption in portfolio → match + coordinated-issuance flag', () => {
    const cc = crossCheckPortfolio(WAVE2_FACTS, [
      { caption: 'Drummond v. Halvorsen Freight Co., No. CV-2026-01142 (fictional)', status: 'active' },
    ]);
    assert.equal(cc.matches.length, 1);
    assert.equal(cc.matches[0].caption_match, true);
    assert.equal(cc.coordinated_issuance, true);
    assert.ok(cc.warnings.some((w) => /coordinated/i.test(w)));
  });
  test('unrelated portfolio → no matches, no flag', () => {
    const cc = crossCheckPortfolio(WAVE2_FACTS, [{ caption: 'Unrelated Corp. v. Other (fictional)', parties: ['Unrelated Corp.'] }]);
    assert.equal(cc.matches.length, 0);
    assert.equal(cc.coordinated_issuance, false);
  });
  test('party overlap alone still matches as a related matter', () => {
    const cc = crossCheckPortfolio(WAVE2_FACTS, [{ parties: ['Halvorsen Freight Co.'] }]);
    assert.equal(cc.matches.length, 1);
    assert.equal(cc.matches[0].caption_match, false);
    assert.deepEqual(cc.matches[0].party_overlap, ['Halvorsen Freight Co.']);
  });
});

describe('trackResponse integration + exports (wave 2)', () => {
  const tagged = {
    ...WAVE2_FACTS,
    provenance: Object.fromEntries(PROVENANCE_FIELDS.map((f) => [f, { source: 'subpoena document (fictional fixture)', status: 'verified' }])),
  };
  test('grand-jury STOP and multi-deadline escalation surface in warnings', () => {
    const r = trackResponse({ ...tagged, subpoena: { ...tagged.subpoena, caption: 'In re Grand Jury Subpoena 26-GJ-044' } });
    assert.equal(r.classification.type, 'grand_jury');
    assert.ok(r.warnings.some((w) => /GRAND JURY/i.test(w)));
    assert.ok(r.warnings.some((w) => /EARLIEST DEADLINE PASSED/i.test(w)));
    assert.equal(r.deadlines_all.objection.deadline, '2026-11-15');
  });
  test('objection matrix and provenance ride along; compliance fields present', () => {
    const r = trackResponse(tagged);
    assert.ok(r.objection_matrix.some((row) => row.id === 'overbroad_time' && row.strength === 'strong'));
    assert.equal(r.provenance.verify_first.length, 0);
    for (const f of PRIVILEGE_LOG_FIELDS) assert.ok(r.compliance.privilege_log_fields.includes(f));
    assert.ok(r.compliance.production_format.length > 0);
  });
  test('checklist includes compliance plan, deadlines table, verify-first, matrix strength', () => {
    const r = trackResponse(tagged);
    const md = exportChecklistMd(r);
    assert.ok(md.includes('Compliance plan'), 'compliance section');
    assert.ok(md.includes('Production format'), 'production format');
    assert.ok(md.includes('privilege_basis'), 'privilege-log field');
    assert.ok(md.includes('Exchange Online'), 'custodian system');
    assert.ok(md.includes('2026-11-15'), 'objection deadline in checklist');
    assert.ok(md.includes('Meet and confer'), 'meet-and-confer deadline');
    assert.ok(md.includes('strong'), 'matrix strength');
    const withUnverified = exportChecklistMd(trackResponse({ ...tagged, provenance: { ...tagged.provenance, 'subpoena.service_method': { source: 'process server email', status: 'verify' } } }));
    assert.ok(withUnverified.includes('Verify first'));
    assert.ok(withUnverified.includes('subpoena.service_method'));
  });
  test('ICS export: one VEVENT per deadline, RFC-style CRLF, compact dates', () => {
    const ics = exportIcs(trackResponse(tagged));
    assert.ok(ics.startsWith('BEGIN:VCALENDAR'));
    assert.ok(ics.trimEnd().endsWith('END:VCALENDAR'));
    assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 5);
    assert.ok(ics.includes('DTSTART;VALUE=DATE:20261112'));
    assert.ok(ics.includes('DTSTART;VALUE=DATE:20261205'));
    assert.ok(ics.includes('\r\n'));
    assert.ok(ics.includes('Meet and confer'));
  });
  test('ICS TEXT values escape comma, semicolon, backslash (RFC 5545)', () => {
    const ics = exportIcs(trackResponse({ ...tagged, matter: { ...tagged.matter, name: 'Fictional: Drummond v. Halvorsen Freight Co., No. CV-2026-01142' } }));
    assert.ok(ics.includes('SUMMARY:Fictional: Drummond v. Halvorsen Freight Co.\\, No. CV-2026-01142 — '));
    assert.ok(!/SUMMARY:[^\r\n]*[^\\],/.test(ics), 'no unescaped comma inside SUMMARY');
    const ics2 = exportIcs(trackResponse({ ...tagged, matter: { ...tagged.matter, name: 'A;B\\C (fictional)' } }));
    assert.ok(ics2.includes('SUMMARY:A\\;B\\\\C (fictional)'));
  });
});
