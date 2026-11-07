/**
 * ai-use-case-inventory — deterministic core.
 *
 * Inventory of a firm's / company's AI use cases with a transparent,
 * rules-as-data risk-tiering rubric (EU AI Act-ish classes as sensible
 * defaults; NIST AI RMF mapping noted). Outputs tiered records, gap flags,
 * dashboard counts, and CSV export.
 *
 * Plain-JavaScript ES module, zero dependencies, browser + Node compatible.
 * ALL DATA IS FICTIONAL. Not legal advice; tiering is a first-pass screen.
 */

// ---------------------------------------------------------------------------
// Rubric — rules-as-data
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} TierRule
 * @property {'prohibited'|'high'|'limited'|'minimal'} tier
 * @property {string} id
 * @property {string} label
 * @property {string[]} anyOfKeywords  matched against purpose/use text (case-insensitive)
 * @property {string} [evidenceNote]
 */

/** @type {TierRule[]} Rules evaluated top-down; first hit wins. EU AI Act-ish defaults. */
export const DEFAULT_TIER_RULES = [
  {
    tier: 'prohibited', id: 'social-scoring', label: 'Social scoring',
    anyOfKeywords: ['social score', 'social scoring', 'citizen score', 'trustworthiness score of persons'],
    evidenceNote: 'EU AI Act Art. 5(1)(c)-style: evaluating or classifying persons for general social behavior.',
  },
  {
    tier: 'prohibited', id: 'manipulation', label: 'Manipulative / exploitative techniques',
    anyOfKeywords: ['subliminal manipulation', 'dark pattern', 'exploit vulnerability', 'voice cloning scam'],
    evidenceNote: 'EU AI Act Art. 5(1)(a)/(b)-style: manipulation causing significant harm.',
  },
  {
    tier: 'prohibited', id: 'emotion-inference-workplace', label: 'Emotion inference in workplace/education',
    anyOfKeywords: ['emotion recognition employee', 'emotion inference workplace', 'sentiment scoring of staff'],
    evidenceNote: 'EU AI Act Art. 5(1)(f)-style prohibition (limited exceptions).',
  },
  {
    tier: 'high', id: 'employment-screening', label: 'Employment / recruitment screening',
    anyOfKeywords: ['cv screening', 'resume screening', 'candidate ranking', 'hiring decision', 'promotion decision', 'performance monitoring of employees', 'employee termination recommendation'],
    evidenceNote: 'EU AI Act Annex III 4(a)-style: employment and worker management.',
  },
  {
    tier: 'high', id: 'credit-scoring', label: 'Creditworthiness evaluation',
    anyOfKeywords: ['creditworthiness', 'credit scoring', 'loan denial', 'loan approval'],
    evidenceNote: 'EU AI Act Annex III 5(b)-style: creditworthiness assessment.',
  },
  {
    tier: 'high', id: 'essential-services', label: 'Access to essential services',
    anyOfKeywords: ['insurance eligibility', 'benefit eligibility', 'emergency triage', 'housing allocation', 'utility shutoff'],
    evidenceNote: 'EU AI Act Annex III 5-style: essential private/public services.',
  },
  {
    tier: 'high', id: 'education-admission', label: 'Education admission / evaluation',
    anyOfKeywords: ['admission decision', 'exam grading', 'student evaluation', 'learning outcome scoring'],
    evidenceNote: 'EU AI Act Annex III 3-style: education and vocational training.',
  },
  {
    tier: 'high', id: 'law-enforcement', label: 'Law-enforcement evaluation',
    anyOfKeywords: ['criminal risk prediction', 'predictive policing', 'fraud detection for law enforcement', 'biometric identification', 'face recognition'],
    evidenceNote: 'EU AI Act Annex III 6/2-style: law enforcement and remote biometric ID.',
  },
  {
    tier: 'high', id: 'legal-advice-automation', label: 'Automated legal advice to consumers',
    anyOfKeywords: ['automated legal advice to consumers', 'unattended legal determination', 'automated benefits determination'],
    evidenceNote: 'Annex III-style administration-of-justice adjacent uses; flagged high for oversight.',
  },
  {
    tier: 'limited', id: 'transparency-chatbot', label: 'Human-facing generative system',
    anyOfKeywords: ['chatbot', 'virtual assistant', 'customer-facing assistant', 'copilot for clients', 'chat with documents for clients'],
    evidenceNote: 'EU AI Act Art. 50-style transparency: users must be told they interact with AI.',
  },
  {
    tier: 'limited', id: 'synthetic-content', label: 'Synthetic content generation',
    anyOfKeywords: ['generate marketing images', 'synthetic media', 'deepfake', 'voice clone for marketing', 'generate video'],
    evidenceNote: 'EU AI Act Art. 50(2)/(4)-style disclosure of synthetic content.',
  },
];

/** @type {Record<string,string>} NIST AI RMF function mapping per tier (govern/map/measure/manage). */
export const NIST_RMF_MAPPING = {
  prohibited: 'Govern: prohibit; remove system (GE-1).',
  high: 'Govern + Map + Measure + Manage: risk management system, logging, human oversight (Art. 9-15-ish).',
  limited: 'Govern + Map: transparency disclosures (Art. 50-ish).',
  minimal: 'Map: inventory entry, no mandatory obligations (voluntary code of conduct).',
};

// ---------------------------------------------------------------------------
// Records + tiering
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} UseCaseRecord
 * @property {string} id
 * @property {string} name
 * @property {string} purpose            free-text purpose / use description
 * @property {'public'|'internal'|'confidential'|'personal'|'special-category'} dataSensitivity
 * @property {'none'|'notify'|'human-in-loop'|'human-decides'} humanOversight
 * @property {'assist'|'draft-with-review'|'act-with-review'|'autonomous'} autonomy
 * @property {string} [department]
 * @property {string[]} [existingControls]  e.g. ['DPA signed','model card','red-team log']
 */

/**
 * Tier one use case: first matching rule wins; no rule → minimal, with a
 * data-sensitivity bump (personal/special-category data raises minimal→limited).
 * Every tier decision returns the rule + matched keyword as evidence.
 *
 * @param {UseCaseRecord} record
 * @param {TierRule[]} [rules]
 * @returns {{ record: UseCaseRecord, tier: string, basis: {ruleId: string, matchedKeyword: string, evidenceNote: string}|{ruleId: string, note: string},
 *             gaps: Array<{id: string, severity: 'blocker'|'major'|'minor', message: string}>,
 *             nistRmf: string }}
 */
export function tierUseCase(record, rules = DEFAULT_TIER_RULES) {
  const text = `${record.name} ${record.purpose}`.toLowerCase();
  let tier = 'minimal';
  let basis = { ruleId: 'default', note: 'no rubric rule matched; minimal by default' };

  for (const rule of rules) {
    const hit = rule.anyOfKeywords.find((k) => text.includes(k.toLowerCase()));
    if (hit) { tier = rule.tier; basis = { ruleId: rule.id, matchedKeyword: hit, evidenceNote: rule.evidenceNote }; break; }
  }
  if (basis.ruleId === 'default' && (record.dataSensitivity === 'personal' || record.dataSensitivity === 'special-category')) {
    tier = 'limited';
    basis = { ruleId: 'sensitive-data', note: 'personal / special-category data → transparency tier' };
  }

  const gaps = [];
  if (tier === 'prohibited') {
    gaps.push({ id: 'prohibited-practice', severity: 'blocker', message: 'Prohibited-style practice per rubric — suspend pending counsel review.' });
  }
  if ((tier === 'high') && (record.humanOversight === 'none' || record.humanOversight === 'notify')) {
    gaps.push({ id: 'missing-oversight', severity: 'blocker', message: 'High tier with no meaningful human oversight — mandatory oversight gap.' });
  }
  if ((tier === 'high') && (record.autonomy === 'autonomous' || record.autonomy === 'act-with-review')) {
    gaps.push({ id: 'autonomy-high-tier', severity: 'major', message: 'High tier with action autonomy — verify logging, fallback, and review SLAs.' });
  }
  if ((tier === 'limited') && (record.humanOversight === 'none')) {
    gaps.push({ id: 'no-disclosure-owner', severity: 'major', message: 'Transparency tier without any oversight owner — disclosure may be missed.' });
  }
  if ((record.dataSensitivity === 'special-category') && !(record.existingControls || []).some((c) => /dpa|privacy|lgpd|gdpr/i.test(c))) {
    gaps.push({ id: 'special-category-controls', severity: 'major', message: 'Special-category data without documented privacy controls (DPA/GDPR/LGPD mapping).' });
  }
  if ((record.autonomy === 'autonomous') && !(record.existingControls || []).some((c) => /red-team|eval|monitor/i.test(c))) {
    gaps.push({ id: 'no-evaluation', severity: 'minor', message: 'Autonomous action without logged evaluation/red-team/monitoring control.' });
  }
  if (tier === 'minimal') gaps.length || gaps.push({ id: 'none', severity: 'minor', message: 'No gaps flagged by the rubric — keep in inventory.' });

  return { record, tier, basis, gaps, nistRmf: NIST_RMF_MAPPING[tier] };
}

/**
 * Build the full inventory: tiered records, dashboard counts, gap rollup, CSV.
 * @param {UseCaseRecord[]} records
 * @param {TierRule[]} [rules]
 * @returns {{ items: ReturnType<typeof tierUseCase>[], counts: Record<string, number>,
 *             gapCounts: Record<string, number>, blockers: number, csv: string,
 *             disclaimer: string }}
 */
export function buildInventory(records, rules = DEFAULT_TIER_RULES) {
  const items = records.map((r) => tierUseCase(r, rules));
  const counts = { prohibited: 0, high: 0, limited: 0, minimal: 0 };
  const gapCounts = { blocker: 0, major: 0, minor: 0 };
  for (const it of items) {
    counts[it.tier] += 1;
    for (const g of it.gaps) gapCounts[g.severity] += 1;
  }
  const blockers = items.filter((i) => i.gaps.some((g) => g.severity === 'blocker')).length;
  return { items, counts, gapCounts, blockers, csv: toCSV(items), disclaimer:
    'First-pass screen against a configurable EU AI Act-ish rubric; not a compliance determination. Fictional data. Not legal advice.' };
}

/**
 * CSV export of the tiered inventory.
 * @param {ReturnType<typeof tierUseCase>[]} items
 * @returns {string}
 */
export function toCSV(items) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = 'id,name,department,tier,basisRule,matchedKeyword,dataSensitivity,humanOversight,autonomy,gaps,severity';
  const rows = items.map((it) => [
    it.record.id, it.record.name, it.record.department || '', it.tier,
    it.basis.ruleId, it.basis.matchedKeyword || '', it.record.dataSensitivity,
    it.record.humanOversight, it.record.autonomy,
    it.gaps.map((g) => g.id).join('; '),
    it.gaps.length ? [...new Set(it.gaps.map((g) => g.severity))].join('/') : 'none',
  ].map(q).join(','));
  return [head, ...rows].join('\r\n') + '\r\n';
}

/**
 * Dashboard view: counts + top blockers, for the wall chart.
 * @param {ReturnType<typeof buildInventory>} inventory
 */
export function dashboard(inventory) {
  return {
    total: inventory.items.length,
    counts: inventory.counts,
    gapCounts: inventory.gapCounts,
    blockers: inventory.items
      .filter((i) => i.gaps.some((g) => g.severity === 'blocker'))
      .map((i) => ({ id: i.record.id, name: i.record.name, tier: i.tier, gap: i.gaps.find((g) => g.severity === 'blocker').message })),
    byDepartment: countBy(inventory.items.map((i) => i.record.department || 'unassigned')),
  };
}

function countBy(arr) {
  const m = {};
  for (const a of arr) m[a] = (m[a] || 0) + 1;
  return m;
}
