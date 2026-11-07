/** Tests for ai-governance-benchmark core. Run: node --test core/ */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PILLARS, QUESTION_BANK, scoreAssessment, maturityBand, exportReportMd, RUBRIC_VERSION } from './core.js';

/** Answer every question at the given level. */
function allAt(level) {
  return { org: { name: 'Fictional Corp' }, answers: QUESTION_BANK.map((q) => ({ questionId: q.id, level, evidence: `evidence-${level}` })) };
}

describe('rules-as-data integrity', () => {
  test('default pillar weights sum to 1', () => {
    const sum = PILLARS.reduce((s, p) => s + p.weight, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9);
  });
  test('every question maps to a known pillar', () => {
    const ids = new Set(PILLARS.map((p) => p.id));
    for (const q of QUESTION_BANK) assert.ok(ids.has(q.pillar), `${q.id} -> ${q.pillar}`);
  });
  test('every pillar has at least one question and a framework ref per question', () => {
    const counts = Object.fromEntries(PILLARS.map((p) => [p.id, 0]));
    for (const q of QUESTION_BANK) { counts[q.pillar]++; assert.ok(q.frameworkRefs.length >= 1, q.id); }
    for (const [p, n] of Object.entries(counts)) assert.ok(n > 0, p);
  });
});

describe('maturityBand', () => {
  test('bands map 0, 1, 2, 3 correctly', () => {
    assert.equal(maturityBand(0).id, 'absent');
    assert.equal(maturityBand(0.6).id, 'ad_hoc');
    assert.equal(maturityBand(1.99).id, 'developing');
    assert.equal(maturityBand(2.9).id, 'defined');
  });
});

describe('scoreAssessment', () => {
  test('all-3 answers give 3.00 overall and Defined band', () => {
    const r = scoreAssessment(allAt(3));
    assert.equal(r.overall.score, 3);
    assert.equal(r.overall.maturity.id, 'defined');
    assert.deepEqual(r.gaps, []);
    assert.deepEqual(r.unanswered, []);
  });
  test('per-pillar mean is correct (mixed levels in one pillar)', () => {
    const answers = QUESTION_BANK.filter((q) => q.pillar === 'training').map((q, i) => ({ questionId: q.id, level: i % 2 === 0 ? 3 : 1 }));
    const training = QUESTION_BANK.filter((q) => q.pillar === 'training');
    const expected = training.reduce((s, q, i) => s + (i % 2 === 0 ? 3 : 1), 0) / training.length;
    const r = scoreAssessment({ answers }, { gapThreshold: -1 });
    assert.equal(r.pillars.find((p) => p.id === 'training').score, expected);
  });
  test('weighted overall uses configured weights', () => {
    const r = scoreAssessment(allAt(2), { pillarWeights: Object.fromEntries(PILLARS.map((p) => [p.id, p.id === 'risk_mgmt' ? 1 : 0])) });
    assert.equal(r.overall.score, 2);
  });
  test('custom weights that do not sum to 1 throw', () => {
    assert.throws(() => scoreAssessment(allAt(1), { pillarWeights: { inventory: 0.5, risk_mgmt: 0.5, vendor_mgmt: 0.5, incident_response: 0, training: 0 } }), /sum to 1/);
  });
  test('unanswered questions score 0, are listed, and are never guessed', () => {
    const r = scoreAssessment({ answers: [{ questionId: 'inv-1', level: 3 }] });
    assert.ok(r.unanswered.includes('inv-2'));
    assert.ok(r.warnings.some((w) => /unanswered/.test(w)));
    const inv = r.pillars.find((p) => p.id === 'inventory');
    const answered = inv.questions.find((q) => q.id === 'inv-1');
    assert.equal(answered.answered, true);
  });
  test('unknown questionId throws', () => {
    assert.throws(() => scoreAssessment({ answers: [{ questionId: 'nope-1', level: 1 }] }), /nope-1/);
  });
  test('non-integer level throws', () => {
    assert.throws(() => scoreAssessment({ answers: [{ questionId: 'inv-1', level: 1.5 }] }), /invalid level/);
    assert.throws(() => scoreAssessment({ answers: [{ questionId: 'inv-1', level: 4 }] }), /invalid level/);
  });
  test('gaps respect threshold and carry evidence + framework refs', () => {
    const r = scoreAssessment(allAt(1), { gapThreshold: 1 });
    assert.equal(r.gaps.length, QUESTION_BANK.length);
    for (const g of r.gaps) {
      assert.equal(g.level, 1);
      assert.equal(g.evidence, 'evidence-1');
      assert.ok(g.frameworkRefs.length >= 1);
      assert.ok(g.remediation.length > 0);
    }
  });
});

describe('exportReportMd', () => {
  test('report includes org, pillars table, gaps, and disclaimer', () => {
    const r = scoreAssessment(allAt(1));
    const md = exportReportMd(r);
    assert.ok(md.includes('Fictional Corp'));
    assert.ok(md.includes('| Pillar | Weight | Score | Maturity |'));
    assert.ok(md.includes('inv-1'));
    assert.ok(md.includes(RUBRIC_VERSION));
    assert.ok(md.includes('not legal advice'));
  });
});
