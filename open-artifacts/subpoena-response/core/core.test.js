/** Tests for subpoena-response core. Run: node --test "core/*.test.js" */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDeadline, analyzeScope, transitionPrivilegeState, privilegeProgress,
  resolveObjections, trackResponse, exportChecklistMd, OBJECTION_GROUNDS, PRIVILEGE_STATES, diffDays,
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
