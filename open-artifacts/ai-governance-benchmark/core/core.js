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
 * @type {string}
 */
export const RUBRIC_VERSION = '1.0.0';

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
 * Frameworks referenced (structural mapping only, our own wording):
 *  - NIST AI RMF 1.0 (GOVERN / MEASURE functions)
 *  - ISO/IEC 42001:2023 (AI management-system clauses)
 * Each question answers on a 0–3 scale defined in LEVEL_LABELS.
 * @type {ReadonlyArray<{id: string, pillar: string, text: string, frameworkRefs: string[], remediation: string}>}
 */
export const QUESTION_BANK = Object.freeze([
  { id: 'inv-1', pillar: 'inventory', text: 'Does the company maintain a current inventory of AI systems in use (built and third-party)?', frameworkRefs: ['NIST AI RMF GOVERN-1', 'ISO/IEC 42001 cl. 8.1 (operational planning)'], remediation: 'Stand up a lightweight AI-use registry with named owners and review cadence.' },
  { id: 'inv-2', pillar: 'inventory', text: 'Is each inventory entry assigned a business owner accountable for the system?', frameworkRefs: ['NIST AI RMF GOVERN-2', 'ISO/IEC 42001 cl. 5.3 (roles)'], remediation: 'Add an owner field to the registry; no orphan systems.' },
  { id: 'inv-3', pillar: 'inventory', text: 'Are data flows into and out of each AI system documented (inputs, outputs, retention)?', frameworkRefs: ['NIST AI RMF GOVERN-1', 'ISO/IEC 42001 cl. 8.1'], remediation: 'Attach a one-page data-flow note per system.' },
  { id: 'risk-1', pillar: 'risk_mgmt', text: 'Is a documented AI risk assessment completed before a new AI system goes live?', frameworkRefs: ['NIST AI RMF GOVERN-3 / MAP', 'ISO/IEC 42001 cl. 6.1 (risk)'], remediation: 'Adopt a pre-deployment risk template with sign-off.' },
  { id: 'risk-2', pillar: 'risk_mgmt', text: 'Are risks re-assessed on a set schedule or upon material change, not just at launch?', frameworkRefs: ['NIST AI RMF MEASURE-1', 'ISO/IEC 42001 cl. 9.2 (internal audit)'], remediation: 'Add quarterly or change-triggered re-assessment.' },
  { id: 'risk-3', pillar: 'risk_mgmt', text: 'Does the company restrict or review high-risk uses (hiring, credit, biometrics, minors)?', frameworkRefs: ['NIST AI RMF GOVERN-3', 'ISO/IEC 42001 cl. 8.2'], remediation: 'Define a high-risk use list with mandatory review.' },
  { id: 'ven-1', pillar: 'vendor_mgmt', text: 'Are AI vendor tools reviewed (security, data use, model changes) before purchase?', frameworkRefs: ['NIST AI RMF GOVERN-4 (suppliers)'], remediation: 'Add AI vendors to procurement review with data-use questions.' },
  { id: 'ven-2', pillar: 'vendor_mgmt', text: 'Do vendor contracts address AI-specific terms (training on your data, output IP, indemnity)?', frameworkRefs: ['NIST AI RMF GOVERN-4'], remediation: 'Adopt AI clause checklist for renewals and new deals.' },
  { id: 'ir-1', pillar: 'incident_response', text: 'Is there a defined process for reporting AI incidents (errors, bias, harms, leaks)?', frameworkRefs: ['NIST AI RMF GOVERN-5 / MEASURE-3', 'ISO/IEC 42001 cl. 8.3'], remediation: 'Extend the security IR plan with an AI intake path.' },
  { id: 'ir-2', pillar: 'incident_response', text: 'Are AI incidents triaged with severity levels and a named responder?', frameworkRefs: ['NIST AI RMF MEASURE-3'], remediation: 'Define severity rubric and on-call owner.' },
  { id: 'ir-3', pillar: 'incident_response', text: 'Are post-incident reviews fed back into policy or system changes?', frameworkRefs: ['NIST AI RMF MANAGE-4 / GOVERN-5', 'ISO/IEC 42001 cl. 10.2'], remediation: 'Add a lessons-learned step with tracked actions.' },
  { id: 'trn-1', pillar: 'training', text: 'Do employees receive training on approved vs. prohibited AI use for their role?', frameworkRefs: ['NIST AI RMF GOVERN-2', 'ISO/IEC 42001 cl. 7.2 (competence)'], remediation: 'Ship a role-based AI use training module.' },
  { id: 'trn-2', pillar: 'training', text: 'Is there an escalation path employees actually know for AI questions and concerns?', frameworkRefs: ['NIST AI RMF GOVERN-2 / GOVERN-5'], remediation: 'Publish one named contact and channel; test awareness.' },
]);

/** Level labels for the 0–3 answer scale. @type {ReadonlyArray<string>} */
export const LEVEL_LABELS = Object.freeze([
  '0 — Not done',
  '1 — Ad hoc / informal',
  '2 — Defined but partial',
  '3 — Defined, repeatable, evidenced',
]);

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
 * @param {{pillarWeights?: Record<string, number>, gapThreshold?: number}} [config]
 * @returns {{
 *   rubricVersion: string, org: object,
 *   pillars: Array<{id: string, name: string, weight: number, score: number, maturity: {id: string, label: string},
 *     questions: Array<{id: string, text: string, level: number, levelLabel: string, evidence: string, answered: boolean, frameworkRefs: string[], remediation: string}>}>,
 *   overall: {score: number, maturity: {id: string, label: string}},
 *   gaps: Array<{questionId: string, pillar: string, text: string, level: number, evidence: string, frameworkRefs: string[], remediation: string}>,
 *   unanswered: string[],
 *   warnings: string[]
 * }}
 * @throws {Error} on unknown question ids, invalid levels, or bad weights
 */
export function scoreAssessment(assessment, config = {}) {
  const weights = { ...(Object.fromEntries(PILLARS.map((p) => [p.id, p.weight]))), ...config.pillarWeights };
  const weightSum = PILLARS.reduce((s, p) => s + (weights[p.id] ?? 0), 0);
  if (Math.abs(weightSum - 1) > 1e-9) throw new Error(`Pillar weights must sum to 1 (got ${weightSum})`);
  const gapThreshold = config.gapThreshold ?? 1;

  const { byId, errors } = normalizeAnswers(assessment);
  if (errors.length) throw new Error(errors.join('; '));

  const pillars = PILLARS.map((p) => {
    const qs = QUESTION_BANK.filter((q) => q.pillar === p.id).map((q) => {
      const a = byId.get(q.id);
      return { id: q.id, text: q.text, level: a.level, levelLabel: LEVEL_LABELS[a.level], evidence: a.evidence, answered: a.answered, frameworkRefs: [...q.frameworkRefs], remediation: q.remediation };
    });
    const score = qs.length ? qs.reduce((s, q) => s + q.level, 0) / qs.length : 0;
    return { id: p.id, name: p.name, weight: weights[p.id], score: round2(score), maturity: maturityBand(score), questions: qs };
  });

  const overallScore = round2(pillars.reduce((s, p) => s + p.score * p.weight, 0));

  const gaps = [];
  const unanswered = [];
  for (const p of pillars) for (const q of p.questions) {
    if (!q.answered) unanswered.push(q.id);
    if (q.level <= gapThreshold) gaps.push({ questionId: q.id, pillar: p.id, text: q.text, level: q.level, evidence: q.evidence, frameworkRefs: q.frameworkRefs, remediation: q.remediation });
  }

  const warnings = [];
  if (unanswered.length) warnings.push(`${unanswered.length} unanswered question(s) scored as 0 — not guessed.`);

  return {
    rubricVersion: RUBRIC_VERSION,
    org: assessment?.org ?? {},
    pillars, overall: { score: overallScore, maturity: maturityBand(overallScore) },
    gaps, unanswered, warnings,
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
    lines.push(`  - Remediation: ${g.remediation}`);
  }
  lines.push('', '---', '', '_Deterministic output of the open ai-governance-benchmark rubric. Framework references point at published structures (NIST AI RMF 1.0, ISO/IEC 42001:2023) for verification; this tool is not legal advice and is not affiliated with any firm._');
  return lines.join('\n');
}

/** @param {number} n @returns {number} */
function round2(n) { return Math.round(n * 100) / 100; }
