/** Tests for intake-benchmark core. Run: node --test "core/*.test.js" */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { benchmark, scoreFlow, exportCsv, exportMd, DEFAULT_WEIGHTS, rankStability, validateCapture, compare } from './core.js';
import { getCanon, listCanons } from './canons.js';

const REQUIRED = ['full_name', 'date_of_birth', 'incident_date', 'incident_location', 'contact_email', 'insurance_carrier'];

const flow = (over = {}) => ({
  id: 'f1', name: 'Flow One', kind: 'software',
  steps: [
    { id: 's1', purpose: 'identity', fields: ['Full Name', 'Date of Birth', 'Contact Email'], latency_seconds: 120, fallback: 'phone intake by front desk' },
    { id: 's2', purpose: 'incident', fields: ['incident_date', 'Incident Location'], latency_seconds: 240, fallback: null },
  ],
  ...over,
});

describe('scoreFlow dimensions', () => {
  test('field names are normalized before matching the canon', () => {
    const s = scoreFlow(flow(), REQUIRED);
    assert.deepEqual(s.metrics.covered_fields.sort(), ['contact_email', 'date_of_birth', 'full_name', 'incident_date', 'incident_location']);
  });
  test('completeness is a share of the required canon', () => {
    const s = scoreFlow(flow(), REQUIRED); // 5 of 6 covered
    assert.equal(s.dimensions.completeness, Math.round((5 / 6) * 10000) / 100);
  });
  test('duplicate asks lower non_redundancy; extra fields do not', () => {
    const dup = scoreFlow(flow({ steps: [
      { id: 'a', fields: ['full_name', 'full_name', 'date_of_birth', 'favorite_color'], latency_seconds: 10, fallback: 'x' },
    ] }), REQUIRED);
    assert.equal(dup.metrics.duplicates, 1);
    assert.equal(dup.metrics.extra_field_asks, 1);
    assert.equal(dup.dimensions.non_redundancy, 75);
  });
  test('fallback quality is share of steps with a stated fallback', () => {
    assert.equal(scoreFlow(flow(), REQUIRED).dimensions.fallback_quality, 50);
    assert.equal(scoreFlow(flow({ steps: [{ id: 'x', fields: ['full_name'], latency_seconds: 5 }] }), REQUIRED).dimensions.fallback_quality, 0);
  });
  test('speed scores 100 at/below target and decays above it', () => {
    const at = scoreFlow(flow(), REQUIRED, { latencyTargetSeconds: 360 }); // total 360s
    assert.equal(at.dimensions.speed, 100);
    const over = scoreFlow(flow(), REQUIRED, { latencyTargetSeconds: 180 }); // 180/360 = 50
    assert.equal(over.dimensions.speed, 50);
  });
  test('speed clamps at 100 when far under target', () => {
    const s = scoreFlow(flow(), REQUIRED, { latencyTargetSeconds: 100000 });
    assert.equal(s.dimensions.speed, 100);
  });
  test('steps without latency warn and count as 0', () => {
    const s = scoreFlow({ id: 'x', name: 'X', steps: [{ id: 's', fields: ['full_name'] }] }, REQUIRED);
    assert.equal(s.metrics.total_latency_seconds, 0);
    assert.ok(s.warnings.some((w) => /latency_seconds/.test(w)));
  });
  test('no steps → completeness 0, fallback/speed null, warning', () => {
    const s = scoreFlow({ id: 'x', name: 'X', steps: [] }, REQUIRED);
    assert.equal(s.dimensions.completeness, 0);
    assert.equal(s.dimensions.fallback_quality, null);
    assert.equal(s.dimensions.speed, null);
    assert.ok(s.warnings.length >= 1);
  });
});

describe('benchmark', () => {
  test('human process without abandonment still ranks on remaining dimensions', () => {
    const human = {
      id: 'paper', name: 'Paper intake', kind: 'human',
      steps: [
        { id: 'p1', fields: ['full_name', 'date_of_birth', 'incident_date', 'incident_location', 'contact_email', 'insurance_carrier'], latency_seconds: 3600, fallback: 'voicemail + callback next business day' },
      ],
    };
    const r = benchmark({ scenario: { name: 'PI', required_fields: REQUIRED }, flows: [flow(), human] });
    const p = r.flows.find((f) => f.id === 'paper');
    assert.equal(p.dimensions.retention, null);
    assert.ok(Number.isFinite(p.composite) && p.composite > 0);
    assert.ok(r.flows.every((f) => typeof f.rank === 'number'));
  });
  test('ranks by composite descending', () => {
    const r = benchmark({ scenario: { required_fields: REQUIRED }, flows: [
      flow({ id: 'bad', name: 'Bad', steps: [{ id: 'z', fields: ['full_name'], latency_seconds: 9999 }] }),
      flow(),
    ] });
    assert.equal(r.flows[0].name, 'Flow One');
    assert.equal(r.flows[0].rank, 1);
  });
  test('invalid abandonment_rate throws', () => {
    assert.throws(() => benchmark({ scenario: { required_fields: REQUIRED }, flows: [flow({ abandonment_rate: 1.5 })] }), /abandonment_rate/);
  });
  test('zero flows or unknown weight keys throw', () => {
    assert.throws(() => benchmark({ scenario: { required_fields: REQUIRED }, flows: [] }), /At least one/);
    assert.throws(() => benchmark({ scenario: { required_fields: REQUIRED }, flows: [flow()], config: { weights: { vibes: 1 } } }), /vibes/);
  });
});

describe('canon library', () => {
  test('listCanons returns the four practice areas; unknown id throws', () => {
    assert.deepEqual(listCanons().sort(), ['consumer', 'family', 'housing', 'immigration']);
    assert.throws(() => getCanon('nope'), /Unknown canon/);
  });
  test('getCanon fields are tagged core/deadline/conflict with both risk classes present', () => {
    for (const id of listCanons()) {
      const c = getCanon(id);
      assert.ok(c.fields.length >= 6, `${id} canon too thin`);
      for (const f of c.fields) {
        assert.ok(typeof f.name === 'string' && f.name.length > 0);
        assert.ok(['core', 'deadline', 'conflict'].includes(f.risk_class), `${id}.${f.name} bad risk_class`);
      }
      assert.ok(c.fields.some((f) => f.risk_class === 'deadline'), `${id} lacks a deadline field`);
      assert.ok(c.fields.some((f) => f.risk_class === 'conflict'), `${id} lacks a conflict field`);
    }
  });
  test('benchmark accepts scenario.canon and scores flow fields against it', () => {
    const housing = getCanon('housing');
    const r = benchmark({ scenario: { canon: 'housing' }, flows: [flow()] });
    const covered = housing.fields.filter((f) => ['full_name', 'date_of_birth', 'contact_email', 'incident_date', 'incident_location'].includes(f.name));
    assert.equal(r.flows[0].dimensions.completeness, Math.round((covered.length / housing.fields.length) * 10000) / 100);
    assert.equal(r.flows[0].dimensions.deadline_capture, 0); // no deadline fields asked
    for (const f of housing.fields.filter((x) => x.risk_class !== 'core')) {
      assert.ok(r.flows[0].metrics.missing_critical.includes(f.name), `${f.name} should be in missing_critical`);
    }
  });
  test('scenario with both canon and required_fields: canon wins with a warning', () => {
    const r = benchmark({ scenario: { canon: 'housing', required_fields: REQUIRED }, flows: [flow()] });
    assert.equal(r.flows[0].metrics.covered_fields.length, 2); // full_name + contact_email only in housing canon
    assert.ok(r.warnings.some((w) => /canon "housing" overrides/.test(w)));
  });
});

describe('risk dimensions', () => {
  const TAGGED = [
    { name: 'full_name', risk_class: 'core' },
    { name: 'statute_of_limitations_date', risk_class: 'deadline' },
    { name: 'adverse_party_name', risk_class: 'conflict' },
  ];
  test('untagged canon leaves deadline_capture/conflict_check null', () => {
    const s = scoreFlow(flow(), REQUIRED);
    assert.equal(s.dimensions.deadline_capture, null);
    assert.equal(s.dimensions.conflict_check, null);
    assert.deepEqual(s.metrics.missing_critical, []);
  });
  test('unasked deadline/conflict fields score <100 and land in missing_critical', () => {
    const s = scoreFlow(flow({ steps: [{ id: 's1', fields: ['Full Name'], latency_seconds: 10, fallback: 'x' }] }), TAGGED);
    assert.equal(s.dimensions.deadline_capture, 0);
    assert.equal(s.dimensions.conflict_check, 0);
    assert.deepEqual(s.metrics.missing_critical, ['statute_of_limitations_date', 'adverse_party_name']);
  });
  test('all critical fields asked score 100 with empty missing_critical', () => {
    const s = scoreFlow(flow({ steps: [{ id: 's1', fields: ['full_name', 'statute_of_limitations_date', 'adverse_party_name'], latency_seconds: 10, fallback: 'x' }] }), TAGGED);
    assert.equal(s.dimensions.deadline_capture, 100);
    assert.equal(s.dimensions.conflict_check, 100);
    assert.deepEqual(s.metrics.missing_critical, []);
  });
  test('unknown risk_class throws', () => {
    assert.throws(() => scoreFlow(flow(), [{ name: 'x', risk_class: 'urgent' }]), /risk_class/);
  });
});

describe('rankStability', () => {
  const tenFields = Array.from({ length: 10 }, (_, i) => `f${i + 1}`);
  const mk = (id, name, fields, latency) => ({
    id, name, kind: 'software', abandonment_rate: 0,
    steps: [{ id: 's1', purpose: 'all', fields, latency_seconds: latency, fallback: 'phone' }],
  });
  test('clear winner → zero flips, robust', () => {
    const r = rankStability({ scenario: { required_fields: tenFields }, flows: [
      mk('good', 'Good', tenFields, 100),
      mk('bad', 'Bad', ['f1'], 99999),
    ] });
    assert.equal(r.flips, 0);
    assert.equal(r.flip_rate, 0);
    assert.equal(r.verdict, 'robust');
    assert.ok(r.runs >= 4);
  });
  test('near-tie → some flips, fragile', () => {
    const r = rankStability({ scenario: { required_fields: tenFields }, flows: [
      mk('wide', 'Wide', tenFields, 3000),  // completeness 100, speed 30
      mk('fast', 'Fast', tenFields.slice(0, 7), 300), // completeness 70, speed 100
    ] });
    assert.ok(r.flips > 0, `expected flips > 0, got ${r.flips}`);
    assert.equal(r.verdict, 'fragile');
    assert.ok(r.flip_rate > 0 && r.flip_rate <= 1);
  });
  test('deterministic: identical output on rerun', () => {
    const input = { scenario: { required_fields: REQUIRED }, flows: [flow(), flow({ id: 'two', name: 'Flow Two' })] };
    assert.deepEqual(rankStability(input), rankStability(input));
  });
});

describe('fair mode', () => {
  test('composites recompute on the intersection of available dimensions, with warning', () => {
    const input = {
      scenario: { required_fields: REQUIRED },
      flows: [
        flow({ id: 'with', name: 'With telemetry', abandonment_rate: 0 }),
        flow({ id: 'without', name: 'Without telemetry', abandonment_rate: null }),
      ],
    };
    const plain = benchmark(input);
    const fair = benchmark({ ...input, config: { fairMode: true } });
    const withT = plain.flows.find((f) => f.id === 'with');
    const withoutT = plain.flows.find((f) => f.id === 'without');
    // without fair mode retention boosts the flow that has it
    assert.ok(withT.composite > withoutT.composite);
    const fw = fair.flows.find((f) => f.id === 'with');
    const fwOut = fair.flows.find((f) => f.id === 'without');
    assert.equal(fw.composite, fwOut.composite); // identical once retention is excluded for both
    assert.ok(fw.composite < withT.composite);
    assert.ok(fair.warnings.some((w) => /fair mode/i.test(w) && /retention/.test(w)));
  });
  test('fair mode with all dimensions shared changes nothing and stays quiet', () => {
    const input = { scenario: { required_fields: REQUIRED }, flows: [flow({ abandonment_rate: 0.2 }), flow({ id: 'two', name: 'Flow Two', abandonment_rate: 0.4 })] };
    const plain = benchmark(input);
    const fair = benchmark({ ...input, config: { fairMode: true } });
    assert.deepEqual(plain.flows.map((f) => [f.id, f.composite]), fair.flows.map((f) => [f.id, f.composite]));
    assert.ok(!fair.warnings.some((w) => /fair mode/i.test(w)));
  });
});

describe('capture QA (validateCapture)', () => {
  test('latency outliers beyond 7 days are flagged', () => {
    const r = validateCapture({ flows: [{ id: 'f1', name: 'F1', kind: 'software', steps: [{ id: 's1', purpose: 'identity', fields: ['full_name'], latency_seconds: 7 * 86400 + 1 }] }] });
    assert.equal(r.valid, true);
    assert.ok(r.warnings.some((w) => /latency_seconds.*7 days/.test(w)));
  });
  test('missing purpose and out-of-bounds abandonment warn; empty/invalid structure errors', () => {
    const r = validateCapture({ flows: [{ id: 'f1', name: 'F1', steps: [{ id: 's1', fields: ['full_name'], latency_seconds: 5 }], abandonment_rate: 2 }] });
    assert.ok(r.warnings.some((w) => /purpose/.test(w)));
    assert.ok(r.warnings.some((w) => /abandonment_rate/.test(w)));
    const bad = validateCapture({ flows: [] });
    assert.equal(bad.valid, false);
    assert.ok(bad.errors.length >= 1);
  });
  test('well-formed capture passes clean', () => {
    const r = validateCapture({ flows: [flow({ abandonment_rate: 0.1 })] });
    assert.equal(r.valid, true);
    assert.deepEqual(r.warnings, []);
  });
});

describe('drift diff (compare)', () => {
  const mkInput = (aAb, bAb) => ({
    scenario: { required_fields: REQUIRED },
    flows: [
      flow({ id: 'a', name: 'Flow A', abandonment_rate: aAb }),
      flow({ id: 'b', name: 'Flow B', abandonment_rate: bAb }),
    ],
  });
  test('changed abandonment → retention delta and rank flip flagged', () => {
    const before = benchmark(mkInput(0.5, 0.1));
    const after = benchmark(mkInput(0.1, 0.5));
    const d = compare(after, before);
    const a = d.flows.find((f) => f.id === 'a');
    const b = d.flows.find((f) => f.id === 'b');
    assert.equal(a.dimensions.retention, 40);
    assert.equal(a.rank.changed, true);
    assert.deepEqual(a.rank, { from: 2, to: 1, changed: true });
    assert.deepEqual(b.rank, { from: 1, to: 2, changed: true });
    assert.equal(a.composite > 0, true);
  });
  test('identical runs → zero deltas, no rank changes', () => {
    const r = benchmark(mkInput(0.2, 0.3));
    const d = compare(r, benchmark(mkInput(0.2, 0.3)));
    for (const f of d.flows) {
      assert.equal(f.composite, 0);
      assert.equal(f.rank.changed, false);
      for (const v of Object.values(f.dimensions)) assert.equal(v, 0);
    }
  });
});

describe('exports', () => {
  const r = benchmark({ scenario: { name: 'PI intake', required_fields: REQUIRED }, flows: [flow({ abandonment_rate: 0.1 }), flow({ id: 'two', name: 'Flow Two', abandonment_rate: null })] });
  test('CSV has header row, all dimensions, rank and missing fields', () => {
    const csv = exportCsv(r);
    const rows = csv.trim().split('\n');
    assert.equal(rows[0], 'dimension,Flow One,Flow Two');
    assert.ok(rows.some((x) => x.startsWith('completeness,')));
    assert.ok(rows.some((x) => x.startsWith('missing_fields,')));
  });
  test('Markdown shows blanks for unscored dimensions', () => {
    const md = exportMd(r);
    assert.ok(md.includes('# Intake flow benchmark — PI intake'));
    assert.ok(/\| retention \| 90 \| — \|/.test(md));
  });
});
