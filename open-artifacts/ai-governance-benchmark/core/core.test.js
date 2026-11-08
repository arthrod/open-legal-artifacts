/** Tests for ai-governance-benchmark core. Run: node --test core/ */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PILLARS, QUESTION_BANK, scoreAssessment, maturityBand, exportReportMd, RUBRIC_VERSION,
  SECTOR_PRESETS, COHORT_BASELINE, compare, diffAssessments, exportGapsCsv,
} from './core.js';

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

describe('ranked action plan', () => {
  test('allAt(0): actions strictly non-increasing priority, ties in bank order', () => {
    const r = scoreAssessment(allAt(0));
    assert.equal(r.actions.length, QUESTION_BANK.length);
    const prios = r.actions.map((a) => a.priority);
    for (let i = 1; i < prios.length; i++) assert.ok(prios[i - 1] >= prios[i] - 1e-9, `pos ${i}: ${prios[i - 1]} < ${prios[i]}`);
    const bankIndex = new Map(QUESTION_BANK.map((q, i) => [q.id, i]));
    for (let i = 1; i < r.actions.length; i++) {
      if (Math.abs(prios[i - 1] - prios[i]) < 1e-9) {
        assert.ok(bankIndex.get(r.actions[i - 1].questionId) < bankIndex.get(r.actions[i].questionId), 'tie not in bank order');
      }
    }
  });
  test('priority = pillarWeight × (3 − level) × (highRisk ? 1.5 : 1); high-risk risk-3 ranks first', () => {
    const r = scoreAssessment(allAt(0));
    const riskW = PILLARS.find((p) => p.id === 'risk_mgmt').weight;
    assert.equal(r.actions[0].questionId, 'risk-3');
    assert.equal(r.actions[0].priority, Math.round(riskW * 3 * 1.5 * 10000) / 10000);
    assert.equal(r.actions[0].highRisk, true);
    const ir1 = r.actions.find((a) => a.questionId === 'ir-1');
    assert.equal(ir1.priority, Math.round(PILLARS.find((p) => p.id === 'incident_response').weight * 3 * 10000) / 10000);
    assert.equal(ir1.highRisk, false);
  });
  test('allAt(3): no gaps → no actions', () => {
    assert.equal(scoreAssessment(allAt(3)).actions.length, 0);
  });
});

describe('fictional cohort baseline', () => {
  test('fixture scores map to declared percentiles; cohort labeled fictional', () => {
    const c = compare(scoreAssessment(allAt(0)));
    assert.match(c.cohort, /fictional/i);
    assert.equal(c.pillars.find((p) => p.id === 'inventory').percentile, COHORT_BASELINE.inventory[0].pctl);
    assert.equal(c.overall.percentile, COHORT_BASELINE._overall[0].pctl);
    const c2 = compare(scoreAssessment(allAt(1)));
    assert.equal(c2.pillars.find((p) => p.id === 'risk_mgmt').percentile, COHORT_BASELINE.risk_mgmt[1].pctl);
    assert.equal(c2.overall.percentile, COHORT_BASELINE._overall[1].pctl);
  });
});

describe('diffAssessments', () => {
  test('one +1 answer is flagged improved with positive pillar/overall deltas', () => {
    const prev = allAt(1);
    const curr = { ...prev, answers: prev.answers.map((a) => (a.questionId === 'ir-1' ? { ...a, level: 2 } : a)) };
    const d = diffAssessments(prev, curr);
    const ir1 = d.questions.find((q) => q.questionId === 'ir-1');
    assert.equal(ir1.delta, 1);
    assert.equal(ir1.direction, 'improved');
    assert.equal(d.summary.improved, 1);
    assert.equal(d.summary.regressed, 0);
    assert.equal(d.summary.unchanged, QUESTION_BANK.length - 1);
    const ir = d.pillars.find((p) => p.id === 'incident_response');
    assert.equal(ir.prevScore, 1);
    assert.equal(ir.currScore, 1.33); // (2+1+1)/3 rounded to 2dp, as scored
    assert.ok(ir.delta > 0);
    assert.ok(d.overall.delta > 0);
  });
  test('one −1 answer is flagged regressed', () => {
    const prev = allAt(2);
    const curr = { ...prev, answers: prev.answers.map((a) => (a.questionId === 'trn-1' ? { ...a, level: 1 } : a)) };
    const d = diffAssessments(prev, curr);
    assert.equal(d.questions.find((q) => q.questionId === 'trn-1').direction, 'regressed');
    assert.equal(d.summary.regressed, 1);
    assert.ok(d.overall.delta < 0);
  });
});

describe('exportGapsCsv', () => {
  /** Minimal RFC4180 parser for round-trip verification. */
  function parseCsv(s) {
    const rows = []; let row = []; let field = ''; let inQ = false; let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (inQ) {
        if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i += 2; continue; } inQ = false; i++; continue; }
        field += ch; i++; continue;
      }
      if (ch === '"') { inQ = true; i++; continue; }
      if (ch === ',') { row.push(field); field = ''; i++; continue; }
      if (ch === '\r') { i++; continue; }
      if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
      field += ch; i++;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows;
  }
  test('RFC4180 quoting: comma + quote in evidence round-trips', () => {
    const tricky = 'a, b "quoted", c';
    const r = scoreAssessment({ answers: [{ questionId: 'inv-1', level: 0, evidence: tricky }] }, { gapThreshold: 1 });
    const csv = exportGapsCsv(r);
    const header = parseCsv(csv.split('\r\n')[0])[0];
    const row = parseCsv(csv).find((x) => x[0] === 'inv-1');
    assert.equal(header.length, row.length);
    assert.equal(row[header.indexOf('evidence')], tricky);
  });
});

describe('regime mapping', () => {
  test('every question carries ≥1 EU AI Act ref tagged [verify]', () => {
    for (const q of QUESTION_BANK) {
      assert.ok(q.euAiActRefs.length >= 1, q.id);
      for (const ref of q.euAiActRefs) {
        assert.match(ref, /EU AI Act art\. (5|6|9|10|11|12|13|14|15)/, `${q.id}: ${ref}`);
        assert.ok(ref.includes('[verify]'), `${q.id}: ${ref}`);
      }
    }
  });
});

describe('sector presets', () => {
  test('every preset has all pillar weights summing to 1', () => {
    for (const [id, preset] of Object.entries(SECTOR_PRESETS)) {
      const sum = PILLARS.reduce((s, p) => s + preset.pillarWeights[p.id], 0);
      assert.ok(Math.abs(sum - 1) < 1e-9, `${id}: ${sum}`);
    }
  });
  test('scoreAssessment applies a named preset; unknown preset throws', () => {
    const r = scoreAssessment(allAt(2), { preset: 'healthcare' });
    assert.equal(r.pillars.find((p) => p.id === 'risk_mgmt').weight, SECTOR_PRESETS.healthcare.pillarWeights.risk_mgmt);
    assert.throws(() => scoreAssessment(allAt(2), { preset: 'nope' }), /nope/);
  });
});

describe('exportReportMd additions', () => {
  test('report includes ranked Next actions, fictional-cohort comparison, regime coverage', () => {
    const md = exportReportMd(scoreAssessment(allAt(0)));
    const na = md.slice(md.indexOf('## Next actions'));
    assert.ok(na.indexOf('risk-3') < na.indexOf('inv-1'));
    assert.match(md, /Fictional-cohort/i);
    assert.match(md, /fictional/i);
    assert.ok(md.includes('EU AI Act'));
    assert.ok(md.includes('[verify]'));
  });
});

describe('demo conventions', () => {
  test('demo keeps the relative-import convention (deploy/build-site.mjs inlines) and ships the guided interview', () => {
    const html = readFileSync(new URL('../demo/index.html', import.meta.url), 'utf8');
    assert.ok(html.includes('<link rel="stylesheet" href="tokens.css">'), 'tokens.css relative link');
    assert.ok(html.includes("from '../core/core.js'"), 'core.js relative import');
    assert.ok(html.includes('data-qid='), 'interview question cards');
    assert.ok(html.includes('diffAssessments'), 're-run diff');
    assert.ok(html.includes('exportGapsCsv'), 'CSV export');
  });
});
