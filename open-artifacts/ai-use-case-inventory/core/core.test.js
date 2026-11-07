/** node:test suite for ai-use-case-inventory core. Run: node --test core/ */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TIER_RULES, tierUseCase, buildInventory, toCSV, dashboard, NIST_RMF_MAPPING } from './core.js';

const rec = (over = {}) => ({
  id: 'AI-01', name: 'Contract clause reviewer',
  purpose: 'Drafts fallback positions for NDAs for attorney review',
  dataSensitivity: 'confidential', humanOversight: 'human-in-loop', autonomy: 'draft-with-review',
  department: 'Legal', ...over,
});

test('attorney-assist workflow tiers minimal with evidence', () => {
  const t = tierUseCase(rec());
  assert.equal(t.tier, 'minimal');
  assert.equal(t.basis.ruleId, 'default');
  assert.equal(t.nistRmf, NIST_RMF_MAPPING.minimal);
});

test('CV screening rule fires high with matched keyword evidence', () => {
  const t = tierUseCase(rec({ id: 'AI-02', name: 'Talent screen', purpose: 'CV screening and candidate ranking for open roles' }));
  assert.equal(t.tier, 'high');
  assert.equal(t.basis.ruleId, 'employment-screening');
  assert.ok(t.basis.matchedKeyword.length > 0);
  assert.match(t.basis.evidenceNote, /Annex III/);
});

test('social scoring is prohibited and produces a blocker gap', () => {
  const t = tierUseCase(rec({ id: 'AI-03', name: 'Community trust index', purpose: 'Social scoring of marketplace users for general trustworthiness' }));
  assert.equal(t.tier, 'prohibited');
  const blocker = t.gaps.find((g) => g.severity === 'blocker');
  assert.ok(blocker && blocker.id === 'prohibited-practice');
});

test('high tier without human oversight → mandatory-oversight gap', () => {
  const t = tierUseCase(rec({
    id: 'AI-04', name: 'Auto-loan desk', purpose: 'Creditworthiness evaluation for micro-loans',
    humanOversight: 'notify', autonomy: 'autonomous',
  }));
  assert.equal(t.tier, 'high');
  assert.ok(t.gaps.some((g) => g.id === 'missing-oversight' && g.severity === 'blocker'));
  assert.ok(t.gaps.some((g) => g.id === 'autonomy-high-tier'));
  assert.ok(t.gaps.some((g) => g.id === 'no-evaluation'));
});

test('sensitive data with no matching rule bumps minimal → limited', () => {
  const t = tierUseCase(rec({ id: 'AI-05', name: 'HR policy Q&A', purpose: 'Answers staff HR questions', dataSensitivity: 'personal' }));
  assert.equal(t.tier, 'limited');
  assert.equal(t.basis.ruleId, 'sensitive-data');
});

test('chatbot transparency rule fires for client-facing assistant', () => {
  const t = tierUseCase(rec({ id: 'AI-06', name: 'Client helper', purpose: 'Customer-facing assistant chatbot for intake questions' }));
  assert.equal(t.tier, 'limited');
  assert.equal(t.basis.ruleId, 'transparency-chatbot');
});

test('special-category data without privacy controls is flagged', () => {
  const flagged = tierUseCase(rec({ id: 'AI-07', name: 'Health notes summarizer', purpose: 'Summarizes clinician notes', dataSensitivity: 'special-category' }));
  assert.ok(flagged.gaps.some((g) => g.id === 'special-category-controls'));
  const clean = tierUseCase(rec({ id: 'AI-08', name: 'Health notes summarizer', purpose: 'Summarizes clinician notes', dataSensitivity: 'special-category', existingControls: ['DPA signed', 'GDPR mapping v2'] }));
  assert.ok(!clean.gaps.some((g) => g.id === 'special-category-controls'));
});

test('first-match-wins: prohibited beats high when both could apply', () => {
  const t = tierUseCase(rec({ id: 'AI-09', name: 'X', purpose: 'Emotion recognition employee monitoring with voice cloning scam detection data' }));
  assert.equal(t.tier, 'prohibited');
});

test('buildInventory: counts, gap rollup, blockers, CSV', () => {
  const inv = buildInventory([
    rec(),
    rec({ id: 'AI-10', name: 'Talent screen', purpose: 'resume screening', humanOversight: 'none', autonomy: 'autonomous' }),
    rec({ id: 'AI-11', name: 'Bot', purpose: 'chatbot for clients', dataSensitivity: 'personal', humanOversight: 'human-decides' }),
  ]);
  assert.equal(inv.counts.high, 1);
  assert.equal(inv.counts.limited, 1);
  assert.equal(inv.counts.minimal, 1);
  assert.equal(inv.blockers, 1);
  assert.ok(inv.gapCounts.blocker >= 1);
  const lines = inv.csv.split('\r\n').filter(Boolean);
  assert.equal(lines.length, 4);
  assert.ok(lines[0].startsWith('id,name,department,tier,'));
  assert.ok(lines[2].includes('resume screening') || lines[2].includes('employment-screening'));
  assert.match(inv.disclaimer, /Not legal advice/);
});

test('toCSV escapes quotes and joins multiple gaps', () => {
  const t = [tierUseCase(rec({ id: 'AI-12', name: 'Weird "quoted" name', purpose: 'credit scoring', humanOversight: 'none', autonomy: 'autonomous' }))];
  const csv = toCSV(t);
  assert.ok(csv.includes('"Weird ""quoted"" name"'));
  assert.ok(csv.includes('missing-oversight; autonomy-high-tier') || csv.includes('missing-oversight;autonomy-high-tier') || /missing-oversight; autonomy-high-tier/.test(csv));
});

test('dashboard aggregates totals, blockers, and department counts', () => {
  const inv = buildInventory([
    rec({ department: 'Legal' }),
    rec({ id: 'AI-13', name: 'T', purpose: 'predictive policing pilot', department: 'Ops', humanOversight: 'human-in-loop', autonomy: 'assist' }),
  ]);
  const d = dashboard(inv);
  assert.equal(d.total, 2);
  assert.equal(d.counts.high, 1);
  assert.deepEqual(d.byDepartment, { Legal: 1, Ops: 1 });
  assert.equal(d.blockers.length, 0);
});

test('rubric is non-trivial and every rule carries evidence', () => {
  assert.ok(DEFAULT_TIER_RULES.length >= 10);
  for (const r of DEFAULT_TIER_RULES) {
    assert.ok(r.tier && r.id && r.label && r.anyOfKeywords.length && r.evidenceNote, 'rule missing fields: ' + JSON.stringify(r));
  }
});

test('determinism: same records → identical inventory JSON', () => {
  const a = JSON.stringify(buildInventory([rec(), rec({ id: 'x', purpose: 'credit scoring' })]));
  const b = JSON.stringify(buildInventory([rec(), rec({ id: 'x', purpose: 'credit scoring' })]));
  assert.equal(a, b);
});
