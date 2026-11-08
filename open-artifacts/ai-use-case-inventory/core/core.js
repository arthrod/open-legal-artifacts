/**
 * ai-use-case-inventory — deterministic core.
 *
 * Inventory of a firm's / company's AI use cases with a transparent,
 * rules-as-data risk-tiering rubric (EU AI Act-ish classes as sensible
 * defaults; NIST AI RMF mapping noted). Outputs tiered records, role-aware
 * obligation notes, gap flags, lifecycle review clock, EU-nexus scoping,
 * dashboard counts, filters, and CSV export.
 *
 * Plain-JavaScript ES module, zero dependencies, browser + Node compatible.
 * ALL DATA IS FICTIONAL. Not legal advice; tiering is a first-pass screen.
 * Statutory references are "-style" approximations tagged [verify].
 */

// ---------------------------------------------------------------------------
// Rubric — rules-as-data
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} TierRule
 * @property {'prohibited'|'high'|'limited'} tier
 * @property {string} id
 * @property {string} label
 * @property {string[]} anyOfKeywords  matched against purpose/use text (case-insensitive)
 * @property {string[]} [noneOfKeywords]  negation guard: a hit skips the rule and flags needsHumanReview — but only when an anyOf keyword also matched (word-boundary match)
 * @property {string} [evidenceNote]
 */

/** @type {TierRule[]} Rules evaluated top-down; first hit wins. EU AI Act-ish defaults. */
export const DEFAULT_TIER_RULES = [
  {
    tier: 'prohibited', id: 'social-scoring', label: 'Social scoring',
    anyOfKeywords: ['social score', 'social scoring', 'citizen score', 'trustworthiness score of persons'],
    noneOfKeywords: ['detect', 'flag', 'block', 'moderate'],
    evidenceNote: 'EU AI Act Art. 5(1)(c)-style: evaluating or classifying persons for general social behavior.',
  },
  {
    tier: 'prohibited', id: 'manipulation', label: 'Manipulative / exploitative techniques',
    anyOfKeywords: ['subliminal manipulation', 'dark pattern', 'exploit vulnerability', 'voice cloning scam'],
    noneOfKeywords: ['detect', 'flag', 'block', 'moderate'],
    evidenceNote: 'EU AI Act Art. 5(1)(a)/(b)-style: manipulation causing significant harm.',
  },
  {
    tier: 'prohibited', id: 'emotion-inference-workplace', label: 'Emotion inference in workplace/education',
    anyOfKeywords: ['emotion recognition employee', 'emotion inference workplace', 'sentiment scoring of staff'],
    noneOfKeywords: ['detect', 'flag', 'block', 'moderate'],
    evidenceNote: 'EU AI Act Art. 5(1)(f)-style prohibition (limited exceptions).',
  },
  {
    tier: 'high', id: 'critical-infrastructure', label: 'Safety component of critical infrastructure',
    anyOfKeywords: ['critical infrastructure', 'safety component for road traffic', 'water treatment control', 'gas pipeline monitoring', 'power grid dispatch'],
    evidenceNote: 'EU AI Act Annex III 2-style: critical-infrastructure safety components (traffic, water, gas, power) [verify].',
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
    tier: 'high', id: 'migration-asylum-border', label: 'Migration, asylum and border control',
    anyOfKeywords: ['asylum eligibility', 'visa applicant assessment', 'migration risk assessment', 'border control screening', 'asylum claim triage'],
    evidenceNote: 'EU AI Act Annex III 8-style: migration, asylum and border-control management [verify].',
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

/** @type {string[]} All tiers, in evaluation-precedence order. */
export const TIERS = ['prohibited', 'gpai_systemic', 'gpai', 'high', 'limited', 'minimal'];

/** @type {string[]} Role enum a record can hold (EU AI Act-style supply-chain roles). */
export const ROLES = ['provider', 'deployer', 'importer', 'distributor', 'authorised-representative', 'manufacturer'];

/**
 * Training-compute threshold (FLOPs) at which a general-purpose model is
 * presumed to pose systemic risk. EU AI Act Art. 51-style presumption [verify].
 */
export const GPAI_SYSTEMIC_FLOPS = 1e25;

/** @type {Record<string,string>} NIST AI RMF function mapping per tier (govern/map/measure/manage). */
export const NIST_RMF_MAPPING = {
  prohibited: 'Govern: prohibit; remove system (GE-1).',
  gpai_systemic: 'Govern + Map + Measure + Manage: systemic-risk evaluation, adversarial testing, incident reporting (Art. 55-ish) [verify].',
  gpai: 'Govern + Map: GPAI provider duties — technical documentation, copyright policy, training-data summary (Art. 53-ish) [verify].',
  high: 'Govern + Map + Measure + Manage: risk management system, logging, human oversight (Art. 9-15-ish).',
  limited: 'Govern + Map: transparency disclosures (Art. 50-ish).',
  minimal: 'Map: inventory entry, no mandatory obligations (voluntary code of conduct).',
};

// ---------------------------------------------------------------------------
// Obligations — cited data per role × tier ("-style" + [verify]; illustrative)
// ---------------------------------------------------------------------------

/**
 * Role- and tier-specific obligation notes, EU AI Act-style, each tagged
 * [verify]. Illustrative defaults — never treat as legal advice.
 * @type {Record<string, Record<string, string>>}
 */
export const OBLIGATION_NOTES = {
  provider: {
    prohibited: 'Prohibited practice: placing it on the market is banned — decommission; other provider duties never apply (Art. 5-style) [verify].',
    gpai_systemic: 'Systemic-risk GPAI provider: model evaluation, adversarial testing, systemic-risk assessment and mitigation, serious-incident reporting (Art. 55-style) [verify].',
    gpai: 'GPAI provider: technical documentation, copyright-compliance policy, training-data summary; pass information down the value chain (Art. 53-style) [verify].',
    high: 'Provider duties: risk-management system, data governance, technical documentation, logging, transparency, human oversight, accuracy/robustness (Art. 8–15-style) [verify].',
    limited: 'Provider duties: design for transparency — disclose AI interaction, mark synthetic content (Art. 50-style) [verify].',
    minimal: 'No mandatory provider obligations; voluntary code of conduct applies (Art. 69-style) [verify].',
  },
  deployer: {
    prohibited: 'Deploying a prohibited practice is itself banned — stop use and document removal (Art. 5-style) [verify].',
    gpai_systemic: 'Deploying a systemic-risk GPAI model: verify the provider\u2019s Art. 55-style measures and incident-reporting channel; monitor and report serious incidents [verify].',
    gpai: 'Deploying a GPAI model: verify the provider supplied Art. 53-style documentation; relay transparency information to end users [verify].',
    high: 'Deployer duties: competent human oversight, relevant and sufficient input data, worker information, log retention, compliance with provider instructions (Art. 26-style) [verify].',
    limited: 'Deployer duties: tell users they are interacting with AI; mark deepfakes/synthetic content (Art. 50-style) [verify].',
    minimal: 'No mandatory deployer obligations; keep the inventory entry current (Art. 69-style voluntary code) [verify].',
  },
  importer: {
    prohibited: 'Importing a prohibited practice is banned — halt import and notify authorities (Art. 5-style) [verify].',
    gpai_systemic: 'Importer of systemic-risk GPAI: verify the provider\u2019s Art. 55-style measures; report incidents to provider and authorities [verify].',
    gpai: 'Importer of GPAI: verify Art. 53-style provider documentation reaches EU deployers [verify].',
    high: 'Importer duties: verify provider conformity/documentation before import, keep a register, act as EU addressee when the provider is non-EU (Art. 23-style) [verify].',
    limited: 'Importer duties: verify provider transparency markings before placing on the market (Art. 50-style) [verify].',
    minimal: 'No mandatory importer obligations for the minimal tier [verify].',
  },
  distributor: {
    prohibited: 'Making a prohibited practice available is banned — withdraw and notify authorities (Art. 5-style) [verify].',
    gpai_systemic: 'Distributor of systemic-risk GPAI: preserve the provider\u2019s incident-reporting channel (Art. 55-style) [verify].',
    gpai: 'Distributor of GPAI: pass provider technical documentation down the value chain (Art. 53-style) [verify].',
    high: 'Distributor duties: verify CE marking and documentation before making available; withdraw and report non-compliance (Art. 22-style) [verify].',
    limited: 'Distributor duties: verify Art. 50-style transparency disclosures before making available [verify].',
    minimal: 'No mandatory distributor obligations for the minimal tier [verify].',
  },
  'authorised-representative': {
    prohibited: 'An authorised representative cannot legitimise a banned practice — terminate the mandate (Art. 5-style) [verify].',
    gpai_systemic: 'AR for a systemic-risk GPAI provider: relay incident reports and authority requests (Art. 55-style) [verify].',
    gpai: 'AR for a GPAI provider: keep Art. 53-style documentation available to authorities [verify].',
    high: 'AR duties for high-risk providers: keep documentation, cooperate with authorities, act as contact point (Art. 22-style) [verify].',
    limited: 'AR duties: maintain transparency-related documentation; authority contact point (Art. 22-style) [verify].',
    minimal: 'No mandatory authorised-representative obligations for the minimal tier [verify].',
  },
  manufacturer: {
    prohibited: 'Banned practice — no manufacturer pathway; cease integration (Art. 5-style) [verify].',
    gpai_systemic: 'Manufacturer embedding a systemic-risk GPAI model: preserve the incident-reporting path (Art. 55-style) [verify].',
    gpai: 'Manufacturer embedding a GPAI model: obtain and preserve provider documentation (Art. 53-style) [verify].',
    high: 'Manufacturer integrating a high-risk AI system into a product: product-safety conformity regime applies (Art. 6(1)/Annex I-style, e.g. machinery) [verify].',
    limited: 'Manufacturer duties: ensure transparency markings survive product integration (Art. 50-style) [verify].',
    minimal: 'No mandatory manufacturer obligations for the minimal tier [verify].',
  },
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
 * @property {'provider'|'deployer'|'importer'|'distributor'|'authorised-representative'|'manufacturer'} [role]  supply-chain role (default 'deployer')
 * @property {boolean} [substantialModification]  deployer fine-tunes/modifies under own name → dual-role flag (Art. 25-style)
 * @property {number} [trainingComputeFlops]  model-side track: ⇒ gpai / gpai_systemic when no specific-use rule fires
 * @property {'planned'|'pilot'|'production'|'retired'} [status]  lifecycle status
 * @property {string} [owner]  accountable owner (name or role)
 * @property {string} [nextReview]  ISO date of the next scheduled review
 * @property {boolean} [euNexus]  false ⇒ system outside EU AI Act scope; tier still computed for information
 */

/**
 * Assess the supply-chain role of a record. A deployer that substantially
 * modifies a system under its own name takes on provider duties as well
 * (EU AI Act Art. 25-style dual-role shift) [verify].
 * @param {UseCaseRecord} record
 * @returns {{ role: string, dualRoleFlag: boolean, note: string }}
 */
export function assessRole(record) {
  const role = record.role && ROLES.includes(record.role) ? record.role : 'deployer';
  const dualRoleFlag = role === 'deployer' && Boolean(record.substantialModification);
  const note = dualRoleFlag
    ? 'EU AI Act Art. 25-style: substantial modification / fine-tuning under the deployer\u2019s own name shifts the deployer into the provider role — provider obligations now also apply [verify].'
    : `Obligations mapped for role: ${role} [verify].`;
  return { role, dualRoleFlag, note };
}

/**
 * Tier one use case: first matching rule wins; negation guard (noneOfKeywords)
 * skips a rule when a detect/flag/block/moderate-style verb suggests the system
 * polices the practice instead of performing it — and never classifies
 * silently: needsHumanReview is set, but only when the rule’s own anyOf
 * keyword also hit (a real prohibited-practice match co-occurs), so
 * detect-style language alone never fabricates review flags. Model-side
 * compute (trainingComputeFlops) assigns the GPAI track when no specific-use
 * rule fired. No rule → minimal,
 * with a data-sensitivity bump (personal/special-category → limited).
 * Every tier decision returns the rule + matched keyword (or a threshold/
 * default note) as evidence.
 *
 * @param {UseCaseRecord} record
 * @param {TierRule[]} [rules]
 * @returns {{ record: UseCaseRecord, tier: string, basis: {ruleId: string, matchedKeyword: string, evidenceNote: string}|{ruleId: string, note: string},
 *             gaps: Array<{id: string, severity: 'blocker'|'major'|'minor', message: string}>,
 *             nistRmf: string, role: string, dualRoleFlag: boolean, roleNote: string,
 *             obligations: string, outOfScope: boolean, scopeNote: string,
 *             needsHumanReview: boolean }}
 */
export function tierUseCase(record, rules = DEFAULT_TIER_RULES) {
  const text = `${record.name} ${record.purpose}`.toLowerCase();
  let tier = 'minimal';
  let basis = { ruleId: 'default', note: 'no rubric rule matched; minimal by default' };
  let needsHumanReview = false;

  for (const rule of rules) {
    const hit = guardHits(text, rule);
    if (hit) { needsHumanReview = true; continue; } // never classify silently
    const matched = rule.anyOfKeywords.find((k) => text.includes(k.toLowerCase()));
    if (matched) { tier = rule.tier; basis = { ruleId: rule.id, matchedKeyword: matched, evidenceNote: rule.evidenceNote }; break; }
  }
  if (basis.ruleId === 'default' && typeof record.trainingComputeFlops === 'number' && record.trainingComputeFlops > 0) {
    if (record.trainingComputeFlops >= GPAI_SYSTEMIC_FLOPS) {
      tier = 'gpai_systemic';
      basis = { ruleId: 'gpai-systemic', note: `training compute ${record.trainingComputeFlops.toExponential()} FLOPs ≥ 1e25 FLOPs — systemic-risk presumption (EU AI Act Art. 51-style) [verify]` };
    } else {
      tier = 'gpai';
      basis = { ruleId: 'gpai', note: `general-purpose model training track (${record.trainingComputeFlops.toExponential()} FLOPs; systemic-risk presumption starts at 1e25, EU AI Act Art. 51-style) [verify]` };
    }
  }
  if (basis.ruleId === 'default' && (record.dataSensitivity === 'personal' || record.dataSensitivity === 'special-category')) {
    tier = 'limited';
    basis = { ruleId: 'sensitive-data', note: 'personal / special-category data → transparency tier' };
  }

  const { role, dualRoleFlag, note: roleNote } = assessRole(record);
  const outOfScope = record.euNexus === false;
  const scopeNote = outOfScope
    ? 'EU-nexus gate: euNexus:false — the EU AI Act does not apply to this system as registered; tier shown for information only [verify].'
    : '';

  const gaps = [];
  if (tier === 'prohibited') {
    gaps.push({ id: 'prohibited-practice', severity: 'blocker', message: 'Prohibited-style practice per rubric — suspend pending counsel review.' });
  }
  if (needsHumanReview) {
    gaps.push({ id: 'needs-human-review', severity: 'major', message: 'Negation guard: a prohibited-practice keyword hit co-occurs with detect/flag/block/moderate-style language — the system may police rather than perform the practice. Confirm intent with the owner; never classify silently. [verify]' });
  }
  if (dualRoleFlag) {
    gaps.push({ id: 'dual-role-shift', severity: 'major', message: 'Substantial modification under own name — deployer also takes provider obligations (Art. 25-style) [verify].' });
  }
  if (outOfScope) {
    gaps.push({ id: 'out-of-eu-scope', severity: 'minor', message: 'EU-nexus gate says out of scope — confirm the nexus assessment before relying on EU-AI-Act tiering [verify].' });
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

  // Dual-role (Art. 25-style): the deployer note stays first, but the
  // provider×tier obligations now also apply and are appended. [review 64 nit 3]
  const baseObligations = (OBLIGATION_NOTES[role] && OBLIGATION_NOTES[role][tier]) || '';
  const obligations = dualRoleFlag
    ? `${baseObligations} Dual role (Art. 25-style) — provider obligations also apply [verify]: ${OBLIGATION_NOTES.provider[tier] || ''}`
    : baseObligations;

  return { record, tier, basis, gaps, nistRmf: NIST_RMF_MAPPING[tier], role, dualRoleFlag, roleNote,
    obligations, outOfScope, scopeNote, needsHumanReview };
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
  const counts = Object.fromEntries(TIERS.map((t) => [t, 0]));
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
 * CSV export of the tiered inventory, incl. role / lifecycle / scoping columns.
 * @param {ReturnType<typeof tierUseCase>[]} items
 * @returns {string}
 */
export function toCSV(items) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = 'id,name,department,tier,basisRule,matchedKeyword,role,status,nextReview,needsReview,outOfScope,dataSensitivity,humanOversight,autonomy,gaps,severity';
  const rows = items.map((it) => [
    it.record.id, it.record.name, it.record.department || '', it.tier,
    it.basis.ruleId, it.basis.matchedKeyword || '', it.role || 'deployer',
    it.record.status || '', it.record.nextReview || '',
    it.needsHumanReview ? 'yes' : 'no', it.outOfScope ? 'yes' : 'no',
    it.record.dataSensitivity, it.record.humanOversight, it.record.autonomy,
    it.gaps.map((g) => g.id).join('; '),
    it.gaps.length ? [...new Set(it.gaps.map((g) => g.severity))].join('/') : 'none',
  ].map(q).join(','));
  return [head, ...rows].join('\r\n') + '\r\n';
}

/**
 * Lifecycle review clock: entries whose nextReview falls within 30 days of
 * asOf (including overdue) and entries stale by more than a year.
 * @param {ReturnType<typeof tierUseCase>[]|{items: ReturnType<typeof tierUseCase>[]}} inventory
 * @param {string} asOfISO  ISO date the clock is evaluated at
 * @returns {{ dueSoon: Array<{id: string, name: string, tier: string, nextReview: string, days: number}>,
 *             stale: Array<{id: string, name: string, tier: string, nextReview: string, daysOverdue: number}> }}
 */
export function reviewDue(inventory, asOfISO) {
  const items = Array.isArray(inventory) ? inventory : inventory.items;
  const asOf = Date.parse(asOfISO);
  const DAY = 86400000;
  const dueSoon = [];
  const stale = [];
  for (const it of items) {
    if (!it.record.nextReview) continue;
    const t = Date.parse(it.record.nextReview);
    if (Number.isNaN(t)) continue;
    const days = Math.round((t - asOf) / DAY);
    if (days <= 30) dueSoon.push({ id: it.record.id, name: it.record.name, tier: it.tier, nextReview: it.record.nextReview, days });
    if (days < -365) stale.push({ id: it.record.id, name: it.record.name, tier: it.tier, nextReview: it.record.nextReview, daysOverdue: -days });
  }
  return { dueSoon, stale };
}

/**
 * Filter tiered items by tier, lifecycle status, or EU nexus.
 * @param {ReturnType<typeof tierUseCase>[]|{items: ReturnType<typeof tierUseCase>[]}} inventory
 * @param {{ tier?: string, status?: string, nexus?: 'in-scope'|'out-of-scope', needsReview?: boolean }} [filters]
 * @returns {ReturnType<typeof tierUseCase>[]}
 */
export function filterInventory(inventory, filters = {}) {
  const items = Array.isArray(inventory) ? inventory : inventory.items;
  return items.filter((it) => {
    if (filters.tier && it.tier !== filters.tier) return false;
    if (filters.status && it.record.status !== filters.status) return false;
    if (filters.nexus === 'in-scope' && it.outOfScope) return false;
    if (filters.nexus === 'out-of-scope' && !it.outOfScope) return false;
    if (filters.needsReview === true && !it.needsHumanReview) return false;
    return true;
  });
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
    needsReview: inventory.items.filter((i) => i.needsHumanReview).length,
    outOfScope: inventory.items.filter((i) => i.outOfScope).length,
    byDepartment: countBy(inventory.items.map((i) => i.record.department || 'unassigned')),
    byRole: countBy(inventory.items.map((i) => i.role || 'deployer')),
    byStatus: countBy(inventory.items.map((i) => i.record.status || 'unspecified')),
  };
}

function countBy(arr) {
  const m = {};
  for (const a of arr) m[a] = (m[a] || 0) + 1;
  return m;
}

/**
 * Negation-guard matcher for one rule: fires (returns the matched anyOf
 * keyword) only when the rule’s prohibited-practice keyword AND a
 * detect/flag/block/moderate-style verb both hit — guarded with word
 * boundaries (plus common inflections) so substrings like “blockchain” or
 * “flagship” never trigger the guard. [review 64 findings 2+4]
 * @param {string} text  lowercased name + purpose
 * @param {TierRule} rule
 * @returns {string|undefined} the matched anyOf keyword, or undefined
 */
function guardHits(text, rule) {
  const guard = (rule.noneOfKeywords || []).some((k) => {
    const esc = k.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${esc}(?:s|es|ed|d|ing)?\\b`).test(text);
  });
  if (!guard) return undefined;
  return rule.anyOfKeywords.find((k) => text.includes(k.toLowerCase()));
}
