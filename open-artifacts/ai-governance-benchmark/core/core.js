/**
 * ai-governance-benchmark — deterministic core.
 *
 * Scores a company's AI-governance assessment answers against a transparent,
 * versioned rubric (rules-as-data). No LLM, no network, no dependencies.
 * Browser and Node compatible ES module.
 *
 * @module core
 */

/* ------------------------------------------------------------------ *
 * Rules-as-data: pillars, weights, question bank, maturity bands.
 * Everything below is data, not logic — swap it via config to re-version.
 * ------------------------------------------------------------------ */

/**
 * Assessment pillars with default weights. Weights are configurable
 * (config.pillarWeights) and must sum to 1.
 * @type {ReadonlyArray<{id: string, name: string, weight: number, description: string}>}
 */
export const PILLARS = Object.freeze([
  { id: 'inventory', weight: 0.2, name: 'AI Inventory', description: 'Knowing what AI systems exist, who owns them, and where the data goes.' },
  { id: 'risk_mgmt', weight: 0.25, name: 'Risk Management', description: 'Assessing and mitigating AI risks before and after deployment.' },
  { id: 'vendor_mgmt', weight: 0.2, name: 'Vendor Management', description: 'Contractual and review controls over third-party AI tools.' },
  { id: 'incident_response', weight: 0.2, name: 'Incident Response', description: 'Detecting and handling AI failures, harms, and complaints.' },
  { id: 'training', weight: 0.15, name: 'Training & Culture', description: 'Preparing people to use and govern AI responsibly.' },
]);

/**
 * Rubric version. Bump when the question bank changes meaning.
 * 1.1.0 — added euAiActRefs (illustrative, [verify]-tagged), highRisk flags,
 *         ranked actions, fictional-cohort baseline, sector presets.
 * @type {string}
 */
export const RUBRIC_VERSION = '1.1.0';

/**
 * Maturity bands over the 0–3 score scale.
 * @type {ReadonlyArray<{min: number, id: string, label: string}>}
 */
export const MATURITY_BANDS = Object.freeze([
  { min: 0, id: 'absent', label: 'Absent' },
  { min: 0.5, id: 'ad_hoc', label: 'Ad hoc' },
  { min: 1.5, id: 'developing', label: 'Developing' },
  { min: 2.5, id: 'defined', label: 'Defined' },
]);

/**
 * Question bank. `frameworkRefs` map each question to published-framework
 * clauses so gaps cite something checkable — never invented.
 * `euAiActRefs` map each question to EU AI Act arts. 5–15 structures as an
 * ILLUSTRATIVE mapping — every ref is [verify]-tagged and must be checked
 * against the official text; this is not legal advice.
 * `highRisk: true` marks questions where weak governance most directly
 * exposes high-risk AI uses; it feeds the action-priority ×1.5 multiplier.
 * Frameworks referenced (structural mapping only, our own wording):
 *  - NIST AI RMF 1.0 (GOVERN / MEASURE functions)
 *  - ISO/IEC 42001:2023 (AI management-system clauses)
 *  - EU AI Act arts. 5–15 (illustrative regime mapping, [verify])
 * Each question answers on a 0–3 scale defined in LEVEL_LABELS.
 * @type {ReadonlyArray<{id: string, pillar: string, text: string, frameworkRefs: string[], euAiActRefs: string[], highRisk?: boolean, remediation: string}>}
 */
export const QUESTION_BANK = Object.freeze([
  { id: 'inv-1', pillar: 'inventory', text: 'Does the company maintain a current inventory of AI systems in use (built and third-party)?', frameworkRefs: ['NIST AI RMF GOVERN-1', 'ISO/IEC 42001 cl. 8.1 (operational planning)'], euAiActRefs: ['EU AI Act art. 11 (technical documentation) [verify]', 'EU AI Act art. 12 (record-keeping) [verify]'], remediation: 'Stand up a lightweight AI-use registry with named owners and review cadence.' },
  { id: 'inv-2', pillar: 'inventory', text: 'Is each inventory entry assigned a business owner accountable for the system?', frameworkRefs: ['NIST AI RMF GOVERN-2', 'ISO/IEC 42001 cl. 5.3 (roles)'], euAiActRefs: ['EU AI Act art. 12 (record-keeping) [verify]'], remediation: 'Add an owner field to the registry; no orphan systems.' },
  { id: 'inv-3', pillar: 'inventory', text: 'Are data flows into and out of each AI system documented (inputs, outputs, retention)?', frameworkRefs: ['NIST AI RMF GOVERN-1', 'ISO/IEC 42001 cl. 8.1'], euAiActRefs: ['EU AI Act art. 10 (data governance) [verify]', 'EU AI Act art. 12 (logging) [verify]'], remediation: 'Attach a one-page data-flow note per system.' },
  { id: 'risk-1', pillar: 'risk_mgmt', text: 'Is a documented AI risk assessment completed before a new AI system goes live?', frameworkRefs: ['NIST AI RMF GOVERN-3 / MAP', 'ISO/IEC 42001 cl. 6.1 (risk)'], euAiActRefs: ['EU AI Act art. 9 (risk management system) [verify]'], remediation: 'Adopt a pre-deployment risk template with sign-off.' },
  { id: 'risk-2', pillar: 'risk_mgmt', text: 'Are risks re-assessed on a set schedule or upon material change, not just at launch?', frameworkRefs: ['NIST AI RMF MEASURE-1', 'ISO/IEC 42001 cl. 9.2 (internal audit)'], euAiActRefs: ['EU AI Act art. 9 (risk management system) [verify]'], remediation: 'Add quarterly or change-triggered re-assessment.' },
  { id: 'risk-3', pillar: 'risk_mgmt', text: 'Does the company restrict or review high-risk uses (hiring, credit, biometrics, minors)?', frameworkRefs: ['NIST AI RMF GOVERN-3', 'ISO/IEC 42001 cl. 8.2'], euAiActRefs: ['EU AI Act art. 5 (prohibited practices) [verify]', 'EU AI Act art. 6 (classification rules) [verify]'], highRisk: true, remediation: 'Define a high-risk use list with mandatory review.' },
  { id: 'ven-1', pillar: 'vendor_mgmt', text: 'Are AI vendor tools reviewed (security, data use, model changes) before purchase?', frameworkRefs: ['NIST AI RMF GOVERN-4 (suppliers)'], euAiActRefs: ['EU AI Act art. 9 (risk management system) [verify]'], remediation: 'Add AI vendors to procurement review with data-use questions.' },
  { id: 'ven-2', pillar: 'vendor_mgmt', text: 'Do vendor contracts address AI-specific terms (training on your data, output IP, indemnity)?', frameworkRefs: ['NIST AI RMF GOVERN-4'], euAiActRefs: ['EU AI Act art. 10 (data governance) [verify]'], remediation: 'Adopt AI clause checklist for renewals and new deals.' },
  { id: 'ir-1', pillar: 'incident_response', text: 'Is there a defined process for reporting AI incidents (errors, bias, harms, leaks)?', frameworkRefs: ['NIST AI RMF GOVERN-5 / MEASURE-3', 'ISO/IEC 42001 cl. 8.3'], euAiActRefs: ['EU AI Act art. 12 (logs enabling incident detection) [verify]'], remediation: 'Extend the security IR plan with an AI intake path.' },
  { id: 'ir-2', pillar: 'incident_response', text: 'Are AI incidents triaged with severity levels and a named responder?', frameworkRefs: ['NIST AI RMF MEASURE-3'], euAiActRefs: ['EU AI Act art. 9 (risk management; severity handling) [verify]'], remediation: 'Define severity rubric and on-call owner.' },
  { id: 'ir-3', pillar: 'incident_response', text: 'Are post-incident reviews fed back into policy or system changes?', frameworkRefs: ['NIST AI RMF MANAGE-4 / GOVERN-5', 'ISO/IEC 42001 cl. 10.2'], euAiActRefs: ['EU AI Act art. 9 (risk management; corrective actions) [verify]'], remediation: 'Add a lessons-learned step with tracked actions.' },
  { id: 'trn-1', pillar: 'training', text: 'Do employees receive training on approved vs. prohibited AI use for their role?', frameworkRefs: ['NIST AI RMF GOVERN-2', 'ISO/IEC 42001 cl. 7.2 (competence)'], euAiActRefs: ['EU AI Act art. 14 (human oversight; competence) [verify]'], remediation: 'Ship a role-based AI use training module.' },
  { id: 'trn-2', pillar: 'training', text: 'Is there an escalation path employees actually know for AI questions and concerns?', frameworkRefs: ['NIST AI RMF GOVERN-2 / GOVERN-5'], euAiActRefs: ['EU AI Act art. 14 (human oversight; escalation to humans) [verify]'], remediation: 'Publish one named contact and channel; test awareness.' },
]);

/** Level labels for the 0–3 answer scale. @type {ReadonlyArray<string>} */
export const LEVEL_LABELS = Object.freeze([
  '0 — Not done',
  '1 — Ad hoc / informal',
  '2 — Defined but partial',
  '3 — Defined, repeatable, evidenced',
]);

/**
 * Named sector weight presets (rules-as-data). Pass one via
 * `scoreAssessment(input, { preset: 'healthcare' })`; explicit
 * `pillarWeights` still win over the preset.
 * @type {Readonly<Record<string, {label: string, rationale: string, pillarWeights: Record<string, number>}>>}
 */
export const SECTOR_PRESETS = Object.freeze({
  general: {
    label: 'General (default)',
    rationale: 'Balanced default identical to the shipped PILLARS weights.',
    pillarWeights: { inventory: 0.2, risk_mgmt: 0.25, vendor_mgmt: 0.2, incident_response: 0.2, training: 0.15 },
  },
  financial_services: {
    label: 'Financial services',
    rationale: 'Money-and-credit decisions put risk management and incident response first.',
    pillarWeights: { inventory: 0.15, risk_mgmt: 0.3, vendor_mgmt: 0.2, incident_response: 0.25, training: 0.1 },
  },
  healthcare: {
    label: 'Healthcare',
    rationale: 'Clinical-adjacent AI raises risk management and vendor (device/model) scrutiny.',
    pillarWeights: { inventory: 0.15, risk_mgmt: 0.3, vendor_mgmt: 0.25, incident_response: 0.15, training: 0.15 },
  },
  public_sector: {
    label: 'Public sector',
    rationale: 'Accountability-facing: inventory transparency and workforce training weigh heavier.',
    pillarWeights: { inventory: 0.25, risk_mgmt: 0.2, vendor_mgmt: 0.15, incident_response: 0.15, training: 0.25 },
  },
});

/**
 * FICTIONAL reference cohort for percentile comparison — illustrative data,
 * NOT market research. Breakpoints: `{ score, pctl }` = share of the fictional
 * cohort at or below `score`. `_overall` maps the weighted overall score.
 * Swap this block (and keep the label) to re-version against a real cohort.
 * @type {Readonly<Record<string, ReadonlyArray<{score: number, pctl: number}>>>}
 */
export const COHORT_BASELINE = Object.freeze({
  inventory: [{ score: 0, pctl: 5 }, { score: 1, pctl: 40 }, { score: 2, pctl: 75 }, { score: 3, pctl: 97 }],
  risk_mgmt: [{ score: 0, pctl: 4 }, { score: 1, pctl: 30 }, { score: 2, pctl: 70 }, { score: 3, pctl: 95 }],
  vendor_mgmt: [{ score: 0, pctl: 8 }, { score: 1, pctl: 45 }, { score: 2, pctl: 78 }, { score: 3, pctl: 98 }],
  incident_response: [{ score: 0, pctl: 6 }, { score: 1, pctl: 38 }, { score: 2, pctl: 72 }, { score: 3, pctl: 96 }],
  training: [{ score: 0, pctl: 10 }, { score: 1, pctl: 48 }, { score: 2, pctl: 80 }, { score: 3, pctl: 98 }],
  _overall: [{ score: 0, pctl: 5 }, { score: 1, pctl: 35 }, { score: 2, pctl: 72 }, { score: 3, pctl: 96 }],
});

/** Cohort label — always surfaced with percentiles so they never read as real market data. @type {string} */
export const COHORT_LABEL = 'fictional reference cohort (illustrative, not market data)';

/* ------------------------------------------------------------------ *
 * Logic
 * ------------------------------------------------------------------ */

/**
 * Map a numeric score (0–3) to a maturity band id/label.
 * @param {number} score
 * @returns {{id: string, label: string}}
 */
export function maturityBand(score) {
  let band = MATURITY_BANDS[0];
  for (const b of MATURITY_BANDS) if (score >= b.min) band = b;
  return { id: band.id, label: band.label };
}

/**
 * Validate inputs and normalize answers into a per-question map.
 * Unanswered questions are kept at level 0 and flagged (never guessed).
 *
 * @param {{answers?: Array<{questionId: string, level: number, evidence?: string}>, org?: object}} assessment
 * @returns {{byId: Map<string, {level: number, evidence: string, answered: boolean}>, errors: string[]}}
 */
function normalizeAnswers(assessment) {
  const byId = new Map();
  const errors = [];
  for (const q of QUESTION_BANK) byId.set(q.id, { level: 0, evidence: '', answered: false });
  for (const a of assessment?.answers ?? []) {
    const q = QUESTION_BANK.find((x) => x.id === a.questionId);
    if (!q) { errors.push(`Unknown questionId "${a.questionId}"`); continue; }
    const level = Number(a.level);
    if (!Number.isInteger(level) || level < 0 || level > 3) {
      errors.push(`Answer for "${a.questionId}" has invalid level ${JSON.stringify(a.level)} (need integer 0–3)`);
      continue;
    }
    byId.set(a.questionId, { level, evidence: String(a.evidence ?? ''), answered: true });
  }
  return { byId, errors };
}

/**
 * Score a full assessment.
 *
 * @param {{answers: Array<{questionId: string, level: number, evidence?: string}>, org?: object}} assessment
 * @param {{preset?: string, pillarWeights?: Record<string, number>, gapThreshold?: number}} [config]
 * @returns {{
 *   rubricVersion: string, org: object,
 *   pillars: Array<{id: string, name: string, weight: number, score: number, maturity: {id: string, label: string},
 *     questions: Array<{id: string, text: string, level: number, levelLabel: string, evidence: string, answered: boolean, frameworkRefs: string[], euAiActRefs: string[], highRisk: boolean, remediation: string}>}>,
 *   overall: {score: number, maturity: {id: string, label: string}},
 *   gaps: Array<{questionId: string, pillar: string, text: string, level: number, evidence: string, frameworkRefs: string[], euAiActRefs: string[], highRisk: boolean, remediation: string, priority: number}>,
 *   actions: Array<{questionId: string, pillar: string, text: string, level: number, remediation: string, highRisk: boolean, priority: number}>,
 *   unanswered: string[],
 *   warnings: string[]
 * }}
 * @throws {Error} on unknown question ids, invalid levels, unknown preset, or bad weights
 */
export function scoreAssessment(assessment, config = {}) {
  const defaults = Object.fromEntries(PILLARS.map((p) => [p.id, p.weight]));
  let base = defaults;
  if (config.preset != null) {
    const preset = SECTOR_PRESETS[config.preset];
    if (!preset) throw new Error(`Unknown preset "${config.preset}" (available: ${Object.keys(SECTOR_PRESETS).join(', ')})`);
    base = { ...defaults, ...preset.pillarWeights };
  }
  const weights = { ...base, ...config.pillarWeights };
  const weightSum = PILLARS.reduce((s, p) => s + (weights[p.id] ?? 0), 0);
  if (Math.abs(weightSum - 1) > 1e-9) throw new Error(`Pillar weights must sum to 1 (got ${weightSum})`);
  const gapThreshold = config.gapThreshold ?? 1;

  const { byId, errors } = normalizeAnswers(assessment);
  if (errors.length) throw new Error(errors.join('; '));

  const pillars = PILLARS.map((p) => {
    const qs = QUESTION_BANK.filter((q) => q.pillar === p.id).map((q) => {
      const a = byId.get(q.id);
      return { id: q.id, text: q.text, level: a.level, levelLabel: LEVEL_LABELS[a.level], evidence: a.evidence, answered: a.answered, frameworkRefs: [...q.frameworkRefs], euAiActRefs: [...q.euAiActRefs], highRisk: !!q.highRisk, remediation: q.remediation };
    });
    const score = qs.length ? qs.reduce((s, q) => s + q.level, 0) / qs.length : 0;
    return { id: p.id, name: p.name, weight: weights[p.id], score: round2(score), maturity: maturityBand(score), questions: qs };
  });

  const overallScore = round2(pillars.reduce((s, p) => s + p.score * p.weight, 0));

  const gaps = [];
  const unanswered = [];
  for (const p of pillars) for (const q of p.questions) {
    if (!q.answered) unanswered.push(q.id);
    if (q.level <= gapThreshold) gaps.push({
      questionId: q.id, pillar: p.id, text: q.text, level: q.level, evidence: q.evidence,
      frameworkRefs: q.frameworkRefs, euAiActRefs: q.euAiActRefs, highRisk: q.highRisk, remediation: q.remediation,
      priority: round4(weights[p.id] * (3 - q.level) * (q.highRisk ? 1.5 : 1)),
    });
  }

  // Ranked action plan: gaps sorted by descending priority (weight × (3 − level) × high-risk ×1.5).
  // Gaps are built in question-bank order and the sort is stable, so ties keep bank order.
  const actions = gaps
    .map((g) => ({ questionId: g.questionId, pillar: g.pillar, text: g.text, level: g.level, remediation: g.remediation, highRisk: g.highRisk, priority: g.priority }))
    .sort((a, b) => b.priority - a.priority);

  const warnings = [];
  if (unanswered.length) warnings.push(`${unanswered.length} unanswered question(s) scored as 0 — not guessed.`);

  return {
    rubricVersion: RUBRIC_VERSION,
    org: assessment?.org ?? {},
    pillars, overall: { score: overallScore, maturity: maturityBand(overallScore) },
    gaps, actions, unanswered, warnings,
  };
}

/**
 * Render a Markdown benchmark report from a scoreAssessment result.
 * @param {ReturnType<scoreAssessment>} result
 * @returns {string}
 */
export function exportReportMd(result) {
  const lines = [];
  const orgName = result.org?.name ?? 'Assessed organization';
  lines.push(`# AI Governance Benchmark — ${orgName}`, '');
  lines.push(`Rubric version: ${result.rubricVersion} · Overall maturity: **${result.overall.maturity.label}** (${result.overall.score.toFixed(2)} / 3.00)`, '');
  if (result.warnings.length) lines.push('> ' + result.warnings.join(' '), '');
  lines.push('## Pillar maturity', '', '| Pillar | Weight | Score | Maturity |', '|---|---|---|---|');
  for (const p of result.pillars) lines.push(`| ${p.name} | ${(p.weight * 100).toFixed(0)}% | ${p.score.toFixed(2)} | ${p.maturity.label} |`);
  lines.push('', '## Gap list (scored ≤ gap threshold, with evidence)', '');
  if (!result.gaps.length) lines.push('No gaps at the configured threshold.');
  for (const g of result.gaps) {
    lines.push(`- **${g.questionId}** (${g.pillar}, level ${g.level}) — ${g.text}`);
    if (g.evidence) lines.push(`  - Evidence: “${g.evidence}”`);
    if (g.frameworkRefs.length) lines.push(`  - Framework refs: ${g.frameworkRefs.join('; ')}`);
    if (g.euAiActRefs?.length) lines.push(`  - EU AI Act (illustrative, [verify]): ${g.euAiActRefs.join('; ')}`);
    lines.push(`  - Remediation: ${g.remediation}`);
  }

  lines.push('', '## Next actions (ranked)', '');
  lines.push('_Priority = pillar weight × (3 − level) × (high-risk question ×1.5). Ties keep question-bank order. Address the top of this list first._', '');
  if (!result.actions?.length) lines.push('No actions — no gaps at the configured threshold.');
  for (const [i, a] of (result.actions ?? []).entries()) {
    lines.push(`${i + 1}. **${a.questionId}** (priority ${a.priority.toFixed(3)}${a.highRisk ? ' · high-risk ×1.5' : ''}) — ${a.remediation}`);
  }

  const cmp = compare(result);
  lines.push('', '## Fictional-cohort comparison (illustrative)', '',
    `Percentile within a ${cmp.cohort} — not real market data.`, '',
    '| Pillar | Score | Percentile |', '|---|---|---|');
  for (const p of cmp.pillars) lines.push(`| ${p.name} | ${p.score.toFixed(2)} | p${p.percentile} |`);
  lines.push(`| Overall | ${cmp.overall.score.toFixed(2)} | p${cmp.overall.percentile} |`);

  lines.push('', 'Regime coverage: NIST AI RMF 1.0 · ISO/IEC 42001:2023 · EU AI Act arts. 5–15 (illustrative mapping — [verify] each ref against the official text; not legal advice).');
  lines.push('', '---', '', '_Deterministic output of the open ai-governance-benchmark rubric. Framework references point at published structures (NIST AI RMF 1.0, ISO/IEC 42001:2023, EU AI Act arts. 5–15) for verification; this tool is not legal advice and is not affiliated with any firm._');
  return lines.join('\n');
}
/** @param {number} n @returns {number} */
function round2(n) { return Math.round(n * 100) / 100; }

/** @param {number} n @returns {number} */
function round4(n) { return Math.round(n * 10000) / 10000; }

/**
 * Percentile of `score` within a breakpoint list (piecewise-constant step:
 * the pctl of the last breakpoint whose score it meets or beats).
 * @param {number} score @param {ReadonlyArray<{score: number, pctl: number}>} breakpoints
 * @returns {number}
 */
function percentileFor(score, breakpoints) {
  let pctl = breakpoints[0].pctl;
  for (const b of breakpoints) if (score >= b.score - 1e-9) pctl = b.pctl;
  return pctl;
}

/**
 * Compare a scoreAssessment result against the FICTIONAL reference cohort.
 * The cohort label is part of the result — always surface it, never present
 * these percentiles as real market data.
 * @param {ReturnType<scoreAssessment>} result
 * @returns {{cohort: string, pillars: Array<{id: string, name: string, score: number, percentile: number}>, overall: {score: number, percentile: number}}}
 */
export function compare(result) {
  return {
    cohort: COHORT_LABEL,
    pillars: result.pillars.map((p) => ({ id: p.id, name: p.name, score: p.score, percentile: percentileFor(p.score, COHORT_BASELINE[p.id]) })),
    overall: { score: result.overall.score, percentile: percentileFor(result.overall.score, COHORT_BASELINE._overall) },
  };
}

/**
 * Diff two assessments (e.g. baseline vs. re-run after remediation).
 * Both are scored with the same config; per-question deltas are reported for
 * changed answers only, with improved/regressed direction flags.
 * @param {{answers: Array<{questionId: string, level: number, evidence?: string}>, org?: object}} prevAssessment
 * @param {{answers: Array<{questionId: string, level: number, evidence?: string}>, org?: object}} currAssessment
 * @param {{preset?: string, pillarWeights?: Record<string, number>, gapThreshold?: number}} [config]
 * @returns {{
 *   rubricVersion: string,
 *   questions: Array<{questionId: string, pillar: string, text: string, prevLevel: number, currLevel: number, delta: number, direction: 'improved'|'regressed'}>,
 *   pillars: Array<{id: string, name: string, prevScore: number, currScore: number, delta: number}>,
 *   overall: {prevScore: number, currScore: number, delta: number},
 *   summary: {improved: number, regressed: number, unchanged: number}
 * }}
 */
export function diffAssessments(prevAssessment, currAssessment, config = {}) {
  const prev = scoreAssessment(prevAssessment, config);
  const curr = scoreAssessment(currAssessment, config);
  let improved = 0, regressed = 0, unchanged = 0;
  const questions = [];
  for (const pp of prev.pillars) {
    const cp = curr.pillars.find((x) => x.id === pp.id);
    for (const q of pp.questions) {
      const cq = cp.questions.find((x) => x.id === q.id);
      const delta = cq.level - q.level;
      if (delta > 0) { improved++; questions.push({ questionId: q.id, pillar: pp.id, text: q.text, prevLevel: q.level, currLevel: cq.level, delta, direction: 'improved' }); }
      else if (delta < 0) { regressed++; questions.push({ questionId: q.id, pillar: pp.id, text: q.text, prevLevel: q.level, currLevel: cq.level, delta, direction: 'regressed' }); }
      else unchanged++;
    }
  }
  const pillars = prev.pillars.map((pp, i) => {
    const cp = curr.pillars[i];
    return { id: pp.id, name: pp.name, prevScore: pp.score, currScore: cp.score, delta: round2(cp.score - pp.score) };
  });
  return {
    rubricVersion: RUBRIC_VERSION,
    questions,
    pillars,
    overall: { prevScore: prev.overall.score, currScore: curr.overall.score, delta: round2(curr.overall.score - prev.overall.score) },
    summary: { improved, regressed, unchanged },
  };
}

/**
 * Quote one CSV field per RFC4180 (quote fields containing comma, quote, CR, LF;
 * double embedded quotes).
 * @param {unknown} v @returns {string}
 */
function csvField(v) {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/**
 * Render the gap list as RFC4180 CSV (CRLF line endings) for tracker import.
 * @param {ReturnType<scoreAssessment>} result
 * @returns {string}
 */
export function exportGapsCsv(result) {
  const header = ['questionId', 'pillar', 'level', 'text', 'evidence', 'frameworkRefs', 'euAiActRefs', 'remediation', 'priority'];
  const rows = [header];
  for (const g of result.gaps) {
    rows.push([g.questionId, g.pillar, String(g.level), g.text, g.evidence, g.frameworkRefs.join('; '), g.euAiActRefs.join('; '), g.remediation, g.priority.toFixed(3)]);
  }
  return rows.map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n';
}
