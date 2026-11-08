/** node:test suite for ai-use-case-inventory core. Run: node --test core/core.test.js */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TIER_RULES, tierUseCase, buildInventory, toCSV, dashboard, NIST_RMF_MAPPING,
  ROLES, TIERS, OBLIGATION_NOTES, assessRole, reviewDue, filterInventory, GPAI_SYSTEMIC_FLOPS,
} from './core.js';

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
  const t = tierUseCase(rec({ id: 'AI-09', name: 'X', purpose: 'Emotion recognition employee monitoring with voice cloning scam data' }));
  assert.equal(t.tier, 'prohibited');
  assert.equal(t.basis.ruleId, 'manipulation');
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

// --- Improvement 1: role + dual-role (Art. 25-style) ---

test('assessRole: fine-tuned deployer → dualRoleFlag true with Art. 25-style note', () => {
  const a = assessRole(rec({ role: 'deployer', substantialModification: true }));
  assert.equal(a.role, 'deployer');
  assert.equal(a.dualRoleFlag, true);
  assert.match(a.note, /Art\.?\s*25-style/);
  assert.match(a.note, /\[verify\]/);
});

test('assessRole: unmodified deployer and other roles → no dual-role flag', () => {
  assert.equal(assessRole(rec({ role: 'deployer' })).dualRoleFlag, false);
  assert.equal(assessRole(rec({ role: 'provider', substantialModification: true })).dualRoleFlag, false);
});

test('tierUseCase exposes role, dual-role flag, and role-aware obligations', () => {
  const t = tierUseCase(rec({ id: 'AI-14', purpose: 'resume screening', role: 'deployer', substantialModification: true }));
  assert.equal(t.role, 'deployer');
  assert.equal(t.dualRoleFlag, true);
  assert.ok(t.obligations.startsWith(OBLIGATION_NOTES.deployer.high), 'obligations should keep the deployer note');
  assert.ok(t.obligations.includes(OBLIGATION_NOTES.provider.high), 'dual-role should append the provider×tier note');
  assert.match(t.obligations, /Art\.?\s*26-style/);
  assert.match(t.obligations, /\[verify\]/);
});

// --- Improvement 2: GPAI tiers via training compute (Art. 51-style) ---

test('2e25 FLOPs ⇒ gpai_systemic with threshold-citing basis', () => {
  const t = tierUseCase(rec({ id: 'AI-15', name: 'Foundation model train', purpose: 'General-purpose model training', trainingComputeFlops: 2e25 }));
  assert.equal(t.tier, 'gpai_systemic');
  assert.equal(t.basis.ruleId, 'gpai-systemic');
  assert.match(t.basis.note, /1e\+?25/i);
  assert.match(t.basis.note, /\[verify\]/);
  assert.match(t.nistRmf, /systemic/i);
});

test('sub-threshold compute ⇒ gpai; keyword rules still take precedence over compute track', () => {
  const g = tierUseCase(rec({ id: 'AI-16', purpose: 'General-purpose model training', trainingComputeFlops: 5e23 }));
  assert.equal(g.tier, 'gpai');
  assert.equal(g.basis.ruleId, 'gpai');
  const kw = tierUseCase(rec({ id: 'AI-17', purpose: 'CV screening model', trainingComputeFlops: 9e25 }));
  assert.equal(kw.tier, 'high');
  assert.equal(kw.basis.ruleId, 'employment-screening');
});

test('counts include gpai and gpai_systemic buckets', () => {
  const inv = buildInventory([
    rec({ trainingComputeFlops: 2e25 }),
    rec({ id: 'x2', trainingComputeFlops: 1e24 }),
  ]);
  assert.equal(inv.counts.gpai_systemic, 1);
  assert.equal(inv.counts.gpai, 1);
});

// --- Improvement 3: lifecycle register + review clock ---

test('reviewDue lists nextReview due within 30 days of asOf', () => {
  const inv = buildInventory([
    rec({ id: 'AI-18', nextReview: '2026-11-27' }),            // due in 20d
    rec({ id: 'AI-19', nextReview: '2026-12-31' }),            // not due (54d)
    rec({ id: 'AI-20' }),                                       // no nextReview → skipped
  ]);
  const rd = reviewDue(inv, '2026-11-07');
  assert.deepEqual(rd.dueSoon.map((d) => d.id), ['AI-18']);
  assert.equal(rd.dueSoon[0].days, 20);
});

test('reviewDue flags stale entries overdue by more than a year', () => {
  const inv = buildInventory([
    rec({ id: 'AI-21', nextReview: '2025-06-01' }),            // >1y overdue
    rec({ id: 'AI-22', nextReview: '2026-10-01' }),            // overdue but fresh
  ]);
  const rd = reviewDue(inv, '2026-11-07');
  assert.deepEqual(rd.stale.map((d) => d.id), ['AI-21']);
  assert.ok(rd.dueSoon.some((d) => d.id === 'AI-21'));
});

// --- Improvement 4: EU-nexus scoping gate ---

test('euNexus:false ⇒ tier computed but outOfScope:true with note', () => {
  const t = tierUseCase(rec({ id: 'AI-23', purpose: 'credit scoring', euNexus: false }));
  assert.equal(t.tier, 'high');
  assert.equal(t.basis.ruleId, 'credit-scoring');
  assert.equal(t.outOfScope, true);
  assert.match(t.scopeNote, /nexus/i);
});

test('euNexus true/absent ⇒ in scope', () => {
  assert.equal(tierUseCase(rec({ purpose: 'credit scoring' })).outOfScope, false);
  assert.equal(tierUseCase(rec({ purpose: 'credit scoring', euNexus: true })).outOfScope, false);
});

// --- Improvement 5: negation-safe matching ---

test('"detects dark patterns" ⇒ minimal + needsHumanReview, not prohibited', () => {
  const t = tierUseCase(rec({ id: 'AI-24', name: 'Dark-pattern detector', purpose: 'Detects dark patterns in the marketing site and flags them for removal' }));
  assert.equal(t.tier, 'minimal');
  assert.equal(t.basis.ruleId, 'default');
  assert.equal(t.needsHumanReview, true);
  assert.ok(t.gaps.some((g) => g.id === 'needs-human-review' && g.severity === 'major'));
});

// --- Review 64 fixes: guard conditional on a real keyword hit; word boundaries ---

test('negation guard fires only when the rule’s anyOf keyword also matched', () => {
  const t = tierUseCase(rec({ id: 'AI-28', name: 'Invoice fraud check', purpose: 'Detects fraud in invoices and blocks suspicious payments' }));
  assert.equal(t.needsHumanReview, false);
  assert.ok(!t.gaps.some((g) => g.id === 'needs-human-review'));
});

test('guard uses word boundaries: blockchain/flagship substrings do not trigger it', () => {
  const t = tierUseCase(rec({ id: 'AI-29', name: 'Blockchain scoring pilot', purpose: 'Trustworthiness score of persons on the blockchain flagship registry' }));
  assert.equal(t.tier, 'prohibited');
  assert.equal(t.basis.ruleId, 'social-scoring');
  assert.equal(t.needsHumanReview, false);
});

test('prohibited rules carry noneOfKeywords; performing (not detecting) still prohibits', () => {
  for (const r of DEFAULT_TIER_RULES.filter((x) => x.tier === 'prohibited')) {
    assert.ok(Array.isArray(r.noneOfKeywords) && r.noneOfKeywords.length > 0, 'prohibited rule missing noneOfKeywords: ' + r.id);
  }
  const t = tierUseCase(rec({ id: 'AI-25', purpose: 'Voice cloning scam calls generated from customer recordings' }));
  assert.equal(t.tier, 'prohibited');
  assert.equal(t.needsHumanReview, false);
});

// --- Improvement 6: obligations as cited data ---

test('OBLIGATION_NOTES covers every role × tier combo with [verify] tags', () => {
  for (const role of ROLES) {
    for (const tier of TIERS) {
      const note = OBLIGATION_NOTES[role][tier];
      assert.ok(typeof note === 'string' && note.length > 20, `missing obligation note for ${role}×${tier}`);
      assert.match(note, /\[verify\]/, `${role}×${tier} missing [verify] tag`);
    }
  }
  assert.match(OBLIGATION_NOTES.deployer.high, /oversight/i);
});

// --- Improvement 7: coverage + exports ---

test('critical-infrastructure and migration/asylum rules fire high', () => {
  const ci = tierUseCase(rec({ id: 'AI-26', purpose: 'Safety component for road traffic management at the plant' }));
  assert.equal(ci.tier, 'high');
  assert.equal(ci.basis.ruleId, 'critical-infrastructure');
  const mig = tierUseCase(rec({ id: 'AI-27', purpose: 'Asylum claim triage support for the registrar' }));
  assert.equal(mig.tier, 'high');
  assert.equal(mig.basis.ruleId, 'migration-asylum-border');
});

test('CSV header gains role, status, nextReview, needsReview, outOfScope columns', () => {
  const inv = buildInventory([rec({ role: 'deployer', status: 'production', nextReview: '2026-12-01' })]);
  assert.equal(
    inv.csv.split('\r\n')[0],
    'id,name,department,tier,basisRule,matchedKeyword,role,status,nextReview,needsReview,outOfScope,dataSensitivity,humanOversight,autonomy,gaps,severity',
  );
  const row = inv.csv.split('\r\n')[1];
  assert.ok(row.includes('"deployer"') && row.includes('"production"') && row.includes('2026-12-01') && row.includes('"no"'));
});

test('filterInventory filters by tier, status, and nexus', () => {
  const inv = buildInventory([
    rec({ id: 'A', purpose: 'credit scoring', status: 'production', euNexus: false }),
    rec({ id: 'B', purpose: 'chatbot for clients', status: 'pilot' }),
    rec({ id: 'C' }),
  ]);
  assert.deepEqual(filterInventory(inv, { tier: 'high' }).map((i) => i.record.id), ['A']);
  assert.deepEqual(filterInventory(inv, { status: 'pilot' }).map((i) => i.record.id), ['B']);
  assert.deepEqual(filterInventory(inv, { nexus: 'in-scope' }).map((i) => i.record.id), ['B', 'C']);
  assert.deepEqual(filterInventory(inv, { nexus: 'out-of-scope' }).map((i) => i.record.id), ['A']);
  assert.equal(filterInventory(inv).length, 3);
});
