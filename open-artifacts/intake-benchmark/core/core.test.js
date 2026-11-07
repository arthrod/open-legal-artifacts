/** Tests for intake-benchmark core. Run: node --test "core/*.test.js" */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { benchmark, scoreFlow, exportCsv, exportMd, DEFAULT_WEIGHTS } from './core.js';

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
