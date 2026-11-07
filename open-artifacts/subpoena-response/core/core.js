/**
 * subpoena-response — deterministic core.
 *
 * Subpoena response tracker: responsive-scope analysis as structured fields,
 * privilege/log workflow states, configurable deadline math (FRCP-style
 * 14-day default, court-day or calendar counting, service extensions), an
 * objection-grounds library, and a checklist export.
 * No LLM, no network, no dependencies. Browser + Node ES module.
 *
 * Jurisdiction note: every default here is a RULE, not a fact. Deadlines and
 * objection grounds vary by forum — override via config, verify with counsel.
 *
 * @module core
 */

/* ------------------------------------------------------------------ *
 * Rules-as-data
 * ------------------------------------------------------------------ */

/**
 * Ordered privilege/log workflow states. Progress = index/(n-1).
 * @type {ReadonlyArray<string>}
 */
export const PRIVILEGE_STATES = Object.freeze(['not_started', 'collecting', 'reviewing', 'log_drafted', 'qc', 'final']);

/**
 * Objection-grounds library (FRCP-style defaults, jurisdiction-dependent).
 * `id` is stable; wording is ours; nothing here is a legal conclusion.
 * @type {ReadonlyArray<{id: string, label: string, description: string, typical_support: string}>}
 */
export const OBJECTION_GROUNDS = Object.freeze([
  { id: 'overbroad_time', label: 'Overbroad time period', description: 'The requested date range exceeds any reasonable connection to the claims.', typical_support: 'Compare the range to the events at issue; propose a narrower window.' },
  { id: 'overbroad_custodians', label: 'Overbroad custodians', description: 'More custodians are named than the facts plausibly implicate.', typical_support: 'Identify custodians with documented involvement; offer the core set first.' },
  { id: 'overbroad_subjects', label: 'Overbroad subject matter', description: 'Requests sweep in entire file categories unrelated to the dispute.', typical_support: 'Tie each category to a claim or defense; offer to meet and confer.' },
  { id: 'undue_burden', label: 'Unduly burdensome / disproportionate', description: 'Cost and effort are disproportionate to the needs of the case.', typical_support: 'Document collection estimates (hours, systems, vendor quotes).' },
  { id: 'privilege', label: 'Privileged material', description: 'Responsive material likely includes privileged communications.', typical_support: 'Run the privilege workflow; produce a log per forum rules.' },
  { id: 'vague_terms', label: 'Vague / undefined terms', description: 'Key terms in the subpoena are undefined or ambiguous.', typical_support: 'List the terms; request definitions or agree on glossary.' },
  { id: 'trade_secret', label: 'Trade secrets / confidential business info', description: 'Requests reach competitively sensitive material.', typical_support: 'Propose a protective order tier before production.' },
  { id: 'pii_privacy', label: 'Personal / sensitive data', description: 'Requests reach employee, patient, or customer personal data.', typical_support: 'Offer redaction or a privacy-protective production protocol.' },
  { id: 'equally_available', label: 'Equally available from another source', description: 'The same material is available from a party or public source at less burden.', typical_support: 'Identify the alternative source specifically.' },
  { id: 'service_defect', label: 'Service / form defects', description: 'Service method, witness-fee tender, or forum rules were not followed.', typical_support: 'Cite the service facts (date, method, fees); verify forum rules.' },
]);

/** Default deadline rule — FRCP-style defaults, configurable rules-as-data. */
export const DEFAULT_DEADLINE_RULE = Object.freeze({
  days: 14,
  day_type: 'calendar', // 'calendar' | 'court'
  mail_extension_days: 3, // added when service_method === 'mail'
  holidays: [], // ISO dates counted as non-court days, e.g. ['2026-11-26']
});

/** Scope heuristics thresholds (rules-as-data; tune per matter). */
export const SCOPE_THRESHOLDS = Object.freeze({
  overbroad_years: 5,
  overbroad_custodians: 8,
});

/* ------------------------------------------------------------------ *
 * Date helpers (ISO-only, no timezone drift)
 * ------------------------------------------------------------------ */

/** @param {string} iso @returns {boolean} */
function isIsoDate(iso) { return typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(Date.parse(iso)); }

/** @param {string} iso @returns {Date} (UTC noon to avoid DST edges) */
function parseUtc(iso) { const d = new Date(iso + 'T12:00:00Z'); return d; }

/** @param {Date} d @returns {string} */
function toIso(d) { return d.toISOString().slice(0, 10); }

/** @param {string} iso @returns {number} day of week 0=Sun..6=Sat */
function dayOfWeek(iso) { return parseUtc(iso).getUTCDay(); }

/** Whole-day difference a − b in days. @param {string} a @param {string} b */
export function diffDays(a, b) { return Math.round((parseUtc(a) - parseUtc(b)) / 86400000); }

/**
 * Compute the response deadline.
 *
 * @param {{served_date: string, service_method?: string}} subpoena
 * @param {{days?: number, day_type?: 'calendar'|'court', mail_extension_days?: number, holidays?: string[]}} [rule]
 * @returns {{served_date: string, service_method: string, extension_days: number, total_days: number,
 *            day_type: string, deadline: string, skipped_noncourt_days: string[]}}
 * @throws {Error} on invalid dates or day_type
 */
export function computeDeadline(subpoena, rule = {}) {
  const r = { ...DEFAULT_DEADLINE_RULE, ...rule };
  if (!isIsoDate(subpoena?.served_date)) throw new Error(`served_date must be an ISO date, got ${JSON.stringify(subpoena?.served_date)}`);
  if (r.day_type !== 'calendar' && r.day_type !== 'court') throw new Error(`day_type must be 'calendar' or 'court', got ${JSON.stringify(r.day_type)}`);
  const method = subpoena.service_method ?? 'personal';
  const extension = method === 'mail' ? (r.mail_extension_days ?? 0) : 0;
  const totalDays = r.days + extension;

  const holidays = new Set((r.holidays ?? []).filter(isIsoDate));
  const skipped = [];

  if (r.day_type === 'calendar') {
    let d = new Date(parseUtc(subpoena.served_date));
    d.setUTCDate(d.getUTCDate() + totalDays);
    return { served_date: subpoena.served_date, service_method: method, extension_days: extension, total_days: totalDays, day_type: r.day_type, deadline: toIso(d), skipped_noncourt_days: [] };
  }

  // court days: step forward, counting only weekdays not in holidays
  let cursor = subpoena.served_date;
  let counted = 0;
  let guard = 0;
  while (counted < totalDays && guard < 10000) {
    const d = new Date(parseUtc(cursor));
    d.setUTCDate(d.getUTCDate() + 1);
    cursor = toIso(d);
    const dow = dayOfWeek(cursor);
    if (dow === 0 || dow === 6 || holidays.has(cursor)) { skipped.push(cursor); } else { counted++; }
    guard++;
  }
  return { served_date: subpoena.served_date, service_method: method, extension_days: extension, total_days: totalDays, day_type: r.day_type, deadline: cursor, skipped_noncourt_days: skipped };
}

/* ------------------------------------------------------------------ *
 * Responsive scope analysis
 * ------------------------------------------------------------------ */

/**
 * @param {{date_range: {start: string, end: string},
 *          custodians: Array<{name: string, role?: string}>,
 *          data_types: Array<{type: string, systems?: string[], notes?: string}>}} scope
 * @param {{today?: string, thresholds?: {overbroad_years?: number, overbroad_custodians?: number}}} [config]
 * @returns {{
 *  date_range: {start: string, end: string, span_days: number, span_years: number},
 *  custodians: Array<{name: string, role: string}>, custodian_count: number,
 *  data_types: Array<{type: string, systems: string[], notes: string}>,
 *  flags: Array<{kind: string, detail: string}>,
 *  suggested_objections: string[]
 * }}
 * @throws {Error} on invalid or inverted date range
 */
export function analyzeScope(scope, config = {}) {
  const th = { ...SCOPE_THRESHOLDS, ...config.thresholds };
  const { start, end } = scope.date_range ?? {};
  if (!isIsoDate(start) || !isIsoDate(end)) throw new Error(`date_range needs ISO start/end, got ${JSON.stringify(scope.date_range)}`);
  const spanDays = diffDays(end, start);
  if (spanDays < 0) throw new Error(`date_range inverted: start ${start} is after end ${end}`);
  const spanYears = spanDays / 365.25;

  const custodians = (scope.custodians ?? []).map((c) => ({ name: String(c.name), role: String(c.role ?? 'unspecified') }));
  const dataTypes = (scope.data_types ?? []).map((d) => ({ type: String(d.type), systems: (d.systems ?? []).map(String), notes: String(d.notes ?? '') }));

  const flags = [];
  const suggested = [];
  if (spanYears > th.overbroad_years) {
    flags.push({ kind: 'overbroad_time', detail: `Date range spans ${spanYears.toFixed(1)} years (> ${th.overbroad_years}-year threshold).` });
    suggested.push('overbroad_time');
  }
  if (custodians.length > th.overbroad_custodians) {
    flags.push({ kind: 'overbroad_custodians', detail: `${custodians.length} custodians named (> ${th.overbroad_custodians} threshold).` });
    suggested.push('overbroad_custodians');
  }
  const personal = dataTypes.filter((d) => /personal|mobile|text|sms|private/i.test(d.type));
  if (personal.length) {
    flags.push({ kind: 'pii_privacy', detail: `Personal-device/message data types requested: ${personal.map((d) => d.type).join(', ')}.` });
    suggested.push('pii_privacy');
  }
  const defensibleAlways = ['privilege']; // privilege workflow is always run
  for (const id of defensibleAlways) if (!suggested.includes(id)) suggested.push(id);

  return {
    date_range: { start, end, span_days: spanDays, span_years: Math.round(spanYears * 10) / 10 },
    custodians, custodian_count: custodians.length,
    data_types: dataTypes,
    flags, suggested_objections: suggested,
  };
}

/* ------------------------------------------------------------------ *
 * Privilege / log workflow
 * ------------------------------------------------------------------ */

/**
 * @param {string} current
 * @param {string} next
 * @returns {{ok: boolean, from: string, to: string, progress: number, warning?: string}}
 */
export function transitionPrivilegeState(current, next) {
  const i = PRIVILEGE_STATES.indexOf(current);
  const j = PRIVILEGE_STATES.indexOf(next);
  if (i === -1 || j === -1) throw new Error(`Unknown privilege state (${current} → ${next}); valid: ${PRIVILEGE_STATES.join(', ')}`);
  const progress = Math.round((j / (PRIVILEGE_STATES.length - 1)) * 100);
  if (j < i) return { ok: false, from: current, to: next, progress, warning: 'Backward transitions are blocked in this workflow; reopen via a new QC cycle instead.' };
  if (j > i + 1) return { ok: true, from: current, to: next, progress, warning: `Skipped ${j - i - 1} state(s); record why intermediate steps were bypassed.` };
  return { ok: true, from: current, to: next, progress };
}

/** @param {string} state @returns {number} */
export function privilegeProgress(state) {
  const i = PRIVILEGE_STATES.indexOf(state);
  if (i === -1) throw new Error(`Unknown privilege state "${state}"`);
  return Math.round((i / (PRIVILEGE_STATES.length - 1)) * 100);
}

/**
 * Validate that selected objections exist in the library; return enriched entries.
 * @param {string[]} ids
 * @returns {Array<{id: string, label: string, description: string, typical_support: string}>}
 * @throws {Error} listing unknown ids
 */
export function resolveObjections(ids) {
  const out = [];
  for (const id of ids ?? []) {
    const g = OBJECTION_GROUNDS.find((x) => x.id === id);
    if (!g) throw new Error(`Unknown objection ground "${id}"; valid: ${OBJECTION_GROUNDS.map((x) => x.id).join(', ')}`);
    out.push({ ...g });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Full tracker + checklist export
 * ------------------------------------------------------------------ */

/**
 * Run the full tracker over a subpoena-facts JSON.
 * @param {object} facts see README/spec for shape
 * @returns {{matter, deadline, deadline_math: {days_remaining: number|null, status: string},
 *            scope: ReturnType<analyzeScope>, privilege: {state, progress},
 *            objections: ReturnType<resolveObjections>, legal_hold: boolean, warnings: string[]}}
 */
export function trackResponse(facts) {
  const rule = facts.deadline_rule ?? {};
  const deadline = computeDeadline(facts.subpoena, rule);
  const scope = analyzeScope(facts.responsive_scope, { thresholds: rule.thresholds });

  const warnings = [...scope.flags.map((f) => `${f.kind}: ${f.detail}`)];
  let daysRemaining = null;
  if (facts.today && isIsoDate(facts.today)) {
    daysRemaining = diffDays(deadline.deadline, facts.today);
    if (daysRemaining < 0) warnings.push(`DEADLINE PASSED by ${-daysRemaining} day(s) — escalate immediately; this tool does not waive anything.`);
    else if (daysRemaining <= 3) warnings.push(`Only ${daysRemaining} day(s) to deadline.`);
  }

  const privilegeState = facts.privilege_review?.state ?? 'not_started';
  const progress = privilegeProgress(privilegeState);
  if (progress < 100 && daysRemaining != null && daysRemaining <= 3) warnings.push('Privilege log not final with ≤3 days to deadline.');

  return {
    matter: facts.matter ?? {},
    deadline,
    deadline_math: { days_remaining: daysRemaining, status: daysRemaining == null ? 'unknown' : daysRemaining < 0 ? 'overdue' : daysRemaining <= 3 ? 'critical' : 'on_track' },
    scope,
    privilege: { state: privilegeState, progress },
    objections: resolveObjections(facts.objections_selected ?? []),
    legal_hold: Boolean(facts.legal_hold),
    warnings,
  };
}

/**
 * Markdown checklist export.
 * @param {ReturnType<trackResponse>} r
 */
export function exportChecklistMd(r) {
  const L = [];
  L.push(`# Subpoena response checklist — ${r.matter?.name ?? 'matter'}`, '');
  L.push(`- [ ] Confirm service facts: served ${r.deadline.served_date} by ${r.deadline.service_method} (+${r.deadline.extension_days} extension day(s)).`);
  L.push(`- [ ] **Response deadline: ${r.deadline.deadline}** (${r.deadline.total_days} ${r.deadline.day_type === 'court' ? 'court' : 'calendar'} day(s)) — status: ${r.deadline_math.status}${r.deadline_math.days_remaining != null ? `, ${r.deadline_math.days_remaining} day(s) remaining` : ''}.`);
  L.push(`- [ ] Legal hold ${r.legal_hold ? 'already issued — verify scope covers new custodians' : 'NOT yet issued — issue before collection'}.`);
  L.push('', '## Responsive scope (structured)', '');
  L.push(`- Date range: ${r.scope.date_range.start} → ${r.scope.date_range.end} (${r.scope.date_range.span_years} yrs).`);
  L.push(`- Custodians (${r.scope.custodian_count}):`);
  for (const c of r.scope.custodians) L.push(`  - [ ] ${c.name} — ${c.role}`);
  L.push(`- Data types:`);
  for (const d of r.scope.data_types) L.push(`  - [ ] ${d.type}${d.systems.length ? ` (${d.systems.join('; ')})` : ''}${d.notes ? ` — ${d.notes}` : ''}`);
  L.push('', `## Privilege / log workflow — ${r.privilege.state} (${r.privilege.progress}%)`, '');
  for (const s of PRIVILEGE_STATES) L.push(`- [${s === r.privilege.state ? 'x' : ' '}] ${s}`);
  if (r.objections.length) {
    L.push('', '## Objection grounds (jurisdiction-dependent; verify against forum rules)', '');
    for (const o of r.objections) L.push(`- [ ] **${o.label}** — ${o.description} (Support: ${o.typical_support})`);
  }
  if (r.warnings.length) { L.push('', '## Warnings', ''); for (const w of r.warnings) L.push(`- ⚠ ${w}`); }
  L.push('', '---', '', '_Deterministic output of the open subpoena-response tracker. FRCP-style defaults are configurable rules-as-data, not legal advice; deadlines vary by forum — verify with counsel._');
  return L.join('\n');
}
