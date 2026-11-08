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
  const classification = classifySubpoena(facts);
  const deadline = computeDeadline(facts.subpoena, rule);
  const deadlinesAll = computeAllDeadlines(facts);
  const scope = analyzeScope(facts.responsive_scope, { thresholds: rule.thresholds });
  const objectionMatrix = applyObjections(facts, scope);
  const provenance = auditProvenance(facts);

  const warnings = [...scope.flags.map((f) => `${f.kind}: ${f.detail}`)];
  warnings.push(...classification.escalation);
  warnings.push(...deadlinesAll.escalation);
  warnings.push(...provenance.warnings);
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
    classification,
    deadline,
    deadlines_all: deadlinesAll,
    deadline_math: { days_remaining: daysRemaining, status: daysRemaining == null ? 'unknown' : daysRemaining < 0 ? 'overdue' : daysRemaining <= 3 ? 'critical' : 'on_track' },
    scope,
    objection_matrix: objectionMatrix,
    privilege: { state: privilegeState, progress },
    objections: resolveObjections(facts.objections_selected ?? []),
    legal_hold: Boolean(facts.legal_hold),
    provenance,
    compliance: buildCompliance(facts, scope),
    today: facts.today ?? null,
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
  if (r.classification?.stop) L.push(`- 🛑 **STOP — GRAND JURY SUBPOENA: escalate to criminal counsel before any substantive response. Standard civil triage does not apply.**`, '');
  L.push(`- Subpoena type: **${r.classification?.type ?? 'unclassified'}** (${r.classification?.basis ?? 'n/a'}).`);
  L.push(`- [ ] Confirm service facts: served ${r.deadline.served_date} by ${r.deadline.service_method} (+${r.deadline.extension_days} extension day(s)).`);
  L.push(`- [ ] **Response deadline: ${r.deadline.deadline}** (${r.deadline.total_days} ${r.deadline.day_type === 'court' ? 'court' : 'calendar'} day(s)) — status: ${r.deadline_math.status}${r.deadline_math.days_remaining != null ? `, ${r.deadline_math.days_remaining} day(s) remaining` : ''}.`);
  if (r.deadlines_all) {
    L.push('', '## All deadlines (calendar all of them)', '');
    for (const kind of ['response', 'objection', 'production', 'quash_window', 'meet_and_confer']) {
      const e = r.deadlines_all[kind];
      if (!e) continue;
      L.push(`- [ ] **${e.label}: ${e.deadline}** — ${e.basis}.`);
    }
    const ed = r.deadlines_all.earliest_deadline;
    L.push('', `Earliest: **${ed.label} ${ed.deadline}**${ed.days_remaining != null ? ` (${ed.days_remaining} day(s) from ${r.today})` : ''}.`);
    for (const n of r.deadlines_all.notes) L.push(`- _${n}_`);
  }
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
  if (r.objection_matrix?.length) {
    L.push('', '## Objection application matrix (deterministic heuristics; not a legal conclusion)', '');
    for (const m of r.objection_matrix) {
      L.push(`- **${m.label}** — strength: **${m.strength}** (${m.strength_basis})`);
      L.push(`  - applies to categories: ${m.categories.join(', ') || '—'}; custodians: ${m.custodians.length}`);
    }
  }
  if (r.compliance) {
    L.push('', '## Compliance plan (if responding)', '');
    L.push(`- Scope of likely production: ${r.compliance.production_scope.join('; ') || '—'}.`);
    L.push(`- Date range: ${r.compliance.date_range.start} → ${r.compliance.date_range.end}.`);
    L.push(`- Custodians to search: ${r.compliance.custodians.join(', ') || '—'}.`);
    L.push(`- Systems: ${r.compliance.systems.join('; ') || '—'}.`);
    L.push(`- Production format: ${r.compliance.production_format}.`);
    L.push(`- Review protocol: ${r.compliance.review_protocol}.`);
    L.push(`- Privilege log fields: ${r.compliance.privilege_log_fields.join(', ')}.`);
  }
  if (r.provenance?.verify_first?.length) {
    L.push('', '## Verify first (unverified sources)', '');
    for (const v of r.provenance.verify_first) L.push(`- ⚠ ${v.field} — source: ${v.source} [verify]`);
  }
  if (r.warnings.length) { L.push('', '## Warnings', ''); for (const w of r.warnings) L.push(`- ⚠ ${w}`); }
  L.push('', '---', '', '_Deterministic output of the open subpoena-response tracker. FRCP-style defaults are configurable rules-as-data, not legal advice; deadlines vary by forum — verify with counsel._');
  return L.join('\n');
}

/* ------------------------------------------------------------------ *
 * Classification + grand-jury stop gate
 * ------------------------------------------------------------------ */

/**
 * Subpoena taxonomy (mirrors common triage practice; ids are ours).
 * @type {ReadonlyArray<string>}
 */
export const SUBPOENA_TYPES = Object.freeze(['third_party_documents', 'third_party_deposition', 'party', 'civil_investigative_demand', 'grand_jury']);

/** @type {string} */
export const GRAND_JURY_ESCALATION = 'GRAND JURY SUBPOENA: STOP — escalate to criminal counsel immediately before any substantive response; standard civil triage does not apply.';

/**
 * Classify a subpoena from keyword markers, with an explicit type override.
 * The grand-jury keyword scan runs even when `type` is set; a conflict keeps
 * `stop: true` — the gate cannot be suppressed by the override.
 * Grand-jury classification sets `stop: true` — callers must gate on it.
 *
 * @param {object} facts
 * @returns {{type: string, basis: string, stop: boolean, escalation: string[]}}
 * @throws {Error} when facts.subpoena.type is set but not a known type id
 */
export function classifySubpoena(facts) {
  const sub = facts?.subpoena ?? {};
  // The grand-jury scan runs BEFORE the explicit-type branch and always wins:
  // facts JSON is LLM-drafted, so a wrong/forgetful `type` must never be able
  // to suppress the STOP gate. The gate is fail-closed by construction.
  const text = [sub.caption, facts?.matter?.issuing_authority, facts?.matter?.name].filter(Boolean).join(' ').toLowerCase();
  const grandJuryMarker = /grand\s+jur/.test(text);
  if (sub.type != null) {
    if (!SUBPOENA_TYPES.includes(sub.type)) throw new Error(`Unknown subpoena type ${JSON.stringify(sub.type)}; valid: ${SUBPOENA_TYPES.join(', ')}`);
    if (sub.type === 'grand_jury')
      return { type: sub.type, basis: 'explicit override (facts.subpoena.type)', stop: true, escalation: [GRAND_JURY_ESCALATION] };
    if (grandJuryMarker)
      return {
        type: sub.type,
        basis: `explicit override (facts.subpoena.type) contradicted by grand-jury marker in caption/authority text — STOP kept`,
        stop: true,
        escalation: [
          GRAND_JURY_ESCALATION,
          `facts.subpoena.type was "${sub.type}" but caption/authority text matches a grand-jury marker — resolve the conflict with counsel before any substantive response.`,
        ],
      };
    return { type: sub.type, basis: 'explicit override (facts.subpoena.type)', stop: false, escalation: [] };
  }
  const role = String(facts?.matter?.role ?? '').toLowerCase();
  if (grandJuryMarker) {
    return { type: 'grand_jury', basis: `grand-jury marker in caption/authority text`, stop: true, escalation: [GRAND_JURY_ESCALATION] };
  }
  if (/civil investigative|\bcid\b|attorney general|\bftc\b|\bsec\b|state ag\b/.test(text)) {
    return { type: 'civil_investigative_demand', basis: 'regulator/CID marker in caption/authority text', stop: false, escalation: ['Civil Investigative Demand: regulator-specific norms apply — recommend outside regulatory counsel.'] };
  }
  if (/deposition|testimon|30\(b\)\(6\)/.test(text)) {
    return { type: 'third_party_deposition', basis: 'deposition/testimony marker in caption text', stop: false, escalation: [] };
  }
  if (/\bparty\b/.test(role) && !/non-?\s?party/.test(role)) {
    return { type: 'party', basis: `matter role is a party role ("${facts.matter.role}")`, stop: false, escalation: ['Party subpoena: treat as discovery — map to the existing matter, not standalone inbound.'] };
  }
  return { type: 'third_party_documents', basis: 'document categories present; no other type marker matched', stop: false, escalation: [] };
}

/* ------------------------------------------------------------------ *
 * Multi-deadline engine
 * ------------------------------------------------------------------ */

/**
 * Default sub-deadline rules (rules-as-data; override per forum via
 * `deadline_rule.deadlines.<kind> = { days }`, disable a kind with `null`).
 * Objections default to the EARLIER-of rule many forums apply.
 * @type {ReadonlyArray<{kind: string, label: string, days: number, earlier_of_compliance?: boolean}>}
 */
export const DEFAULT_SUB_DEADLINE_RULES = Object.freeze([
  { kind: 'response', label: 'Response / compliance', days: 14 },
  { kind: 'objection', label: 'Objections', days: 10, earlier_of_compliance: true },
  { kind: 'production', label: 'Production', days: 30 },
  { kind: 'quash_window', label: 'Motion-to-quash window (outer limit)', days: 14 },
  { kind: 'meet_and_confer', label: 'Meet and confer', days: 7 },
]);

/** @type {string} */
export const EARLIER_OF_NOTE = 'Objection deadlines often run from the EARLIER of the compliance date or a fixed number of days after service — this varies by forum; research the applicable rule before relying on any date here.';

/**
 * Compute all tracked deadlines from one facts JSON, plus the earliest of
 * them for escalation. All dates use the same day_type / mail-extension /
 * holidays configuration as the response rule.
 *
 * @param {object} facts see examples/input.json
 * @returns {Record<string, {kind: string, label: string, deadline: string, basis: string,
 *   total_days: number, day_type: string, candidates?: {compliance_date: string, fixed_days_after_service: string}}>
 *   & {earliest_deadline: {kind: string, label: string, deadline: string, days_remaining: number|null},
 *      escalation: string[], notes: string[]}}
 * @throws {Error} on invalid served_date or rule (via computeDeadline)
 */
export function computeAllDeadlines(facts) {
  if (!isIsoDate(facts?.subpoena?.served_date)) throw new Error(`subpoena.served_date must be an ISO date, got ${JSON.stringify(facts?.subpoena?.served_date)}`);
  const rule = facts.deadline_rule ?? {};
  const overrides = rule.deadlines ?? {};

  const responseRule = { ...rule, ...(overrides.response?.days != null ? { days: overrides.response.days } : {}) };
  const base = computeDeadline(facts.subpoena, responseRule);
  const entries = {
    response: {
      kind: 'response', label: DEFAULT_SUB_DEADLINE_RULES[0].label, deadline: base.deadline, total_days: base.total_days, day_type: base.day_type,
      basis: `${base.total_days} ${base.day_type} day(s) from service ${facts.subpoena.served_date} by ${base.service_method} (+${base.extension_days} ext.)`,
    },
  };

  for (const d of DEFAULT_SUB_DEADLINE_RULES) {
    if (d.kind === 'response') continue;
    const ov = overrides[d.kind];
    if (ov === null) continue; // explicitly disabled
    const o = { ...d, ...(ov ?? {}) };
    if (o.days == null) continue;
    const fixed = computeDeadline(facts.subpoena, { ...rule, days: o.days });
    if (o.earlier_of_compliance) {
      const earlier = base.deadline <= fixed.deadline ? base.deadline : fixed.deadline;
      entries[d.kind] = {
        kind: d.kind, label: d.label, deadline: earlier, total_days: fixed.total_days, day_type: fixed.day_type,
        basis: `earlier of compliance date (${base.deadline}) and ${o.days} day(s) after service (${fixed.deadline}) → ${earlier}`,
        candidates: { compliance_date: base.deadline, fixed_days_after_service: fixed.deadline },
      };
    } else {
      entries[d.kind] = {
        kind: d.kind, label: d.label, deadline: fixed.deadline, total_days: fixed.total_days, day_type: fixed.day_type,
        basis: `${fixed.total_days} ${fixed.day_type} day(s) from service ${facts.subpoena.served_date} (incl. ${fixed.extension_days} ext.)`,
      };
    }
  }

  const ordered = Object.values(entries).filter((e) => e.deadline).sort((a, b) => (a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : 0));
  const first = ordered[0];
  let daysRemaining = null;
  const escalation = [];
  if (facts.today && isIsoDate(facts.today)) {
    daysRemaining = diffDays(first.deadline, facts.today);
    if (daysRemaining < 0) escalation.push(`EARLIEST DEADLINE PASSED: ${first.label} was ${first.deadline} (${-daysRemaining} day(s) ago) — escalate immediately.`);
    else if (daysRemaining <= 3) escalation.push(`Earliest deadline (${first.label}) is ${first.deadline} — only ${daysRemaining} day(s) remain.`);
  }
  return { ...entries, earliest_deadline: { kind: first.kind, label: first.label, deadline: first.deadline, days_remaining: daysRemaining }, escalation, notes: [EARLIER_OF_NOTE] };
}

/* ------------------------------------------------------------------ *
 * Objection application matrix
 * ------------------------------------------------------------------ */

/**
 * Apply each triggered objection ground to the actual scope: which data
 * categories and custodians it reaches, and a deterministic strength rating
 * from the scope heuristics (≥2× threshold = strong, >1× = moderate; grounds
 * without a numeric heuristic are 'unrated' — manual assessment, no fake
 * confidence). Covers suggested ∪ selected grounds.
 *
 * @param {object} facts
 * @param {ReturnType<analyzeScope>} [scope] precomputed scope (optional)
 * @returns {Array<{id: string, label: string, strength: 'strong'|'moderate'|'unrated', strength_basis: string, categories: string[], custodians: string[]}>}
 * @throws {Error} on unknown objection ids (via resolveObjections)
 */
export function applyObjections(facts, scope) {
  const s = scope ?? analyzeScope(facts.responsive_scope, { thresholds: facts.deadline_rule?.thresholds });
  const th = { ...SCOPE_THRESHOLDS, ...facts.deadline_rule?.thresholds };
  const ids = [...new Set([...s.suggested_objections, ...(facts.objections_selected ?? [])])];
  resolveObjections(ids); // validate ids → throws on unknown
  const allCategories = s.data_types.map((d) => d.type);
  const allCustodians = s.custodians.map((c) => c.name);
  const rows = [];
  for (const id of ids) {
    const g = OBJECTION_GROUNDS.find((x) => x.id === id);
    let strength = 'unrated';
    let basis = 'No numeric heuristic for this ground — strength is a manual assessment.';
    let categories = [];
    let custodians = [];
    if (id === 'overbroad_time') {
      const ratio = s.date_range.span_years / th.overbroad_years;
      strength = ratio >= 2 ? 'strong' : 'moderate';
      basis = `${s.date_range.span_years}-year range is ${ratio.toFixed(1)}× the ${th.overbroad_years}-year threshold.`;
      categories = allCategories; custodians = allCustodians;
    } else if (id === 'overbroad_custodians') {
      const ratio = s.custodian_count / th.overbroad_custodians;
      strength = ratio >= 2 ? 'strong' : ratio > 1 ? 'moderate' : 'unrated';
      basis = `${s.custodian_count} custodians is ${ratio.toFixed(1)}× the ${th.overbroad_custodians}-custodian threshold.`;
      categories = allCategories; custodians = allCustodians;
    } else if (id === 'pii_privacy') {
      categories = allCategories.filter((t) => /personal|mobile|text|sms|private/i.test(t));
      custodians = allCustodians;
      strength = 'moderate';
      basis = `Personal/sensitive categories requested (${categories.join(', ') || 'none matched'}); strength depends on applicable privacy law.`;
    } else if (id === 'privilege') {
      categories = allCategories.filter((t) => /mail|text|message|chat|memo|communication/i.test(t));
      if (!categories.length) categories = allCategories;
      custodians = allCustodians;
      strength = 'moderate';
      basis = 'Privilege review always runs; strength depends on counsel involvement in the implicated categories.';
    }
    rows.push({ id: g.id, label: g.label, strength, strength_basis: basis, categories, custodians });
  }
  return rows;
}

/* ------------------------------------------------------------------ *
 * Provenance trail
 * ------------------------------------------------------------------ */

/**
 * Critical fact fields that must carry a source tag. A missing tag is a
 * warning (never silently trusted); a tag with status 'verify' is listed
 * verify-first in exports.
 * @type {ReadonlyArray<string>}
 */
export const PROVENANCE_FIELDS = Object.freeze([
  'subpoena.served_date',
  'subpoena.service_method',
  'subpoena.caption',
  'responsive_scope.date_range.start',
  'responsive_scope.date_range.end',
]);

/** @param {object} o @param {string} path */
function getField(o, path) { return path.split('.').reduce((acc, k) => (acc == null ? undefined : acc[k]), o); }

/**
 * Audit source tags on critical fact fields.
 * @param {object} facts facts with optional `provenance` map: field path → { source: string, status: 'verified'|'verify' }
 * @returns {{entries: Array<{field: string, status: 'verified'|'verify'|'untagged'|'invalid'|'not_present', source: string|null}>,
 *   verify_first: Array<{field: string, source: string}>, warnings: string[]}}
 */
export function auditProvenance(facts) {
  const prov = facts?.provenance ?? {};
  const entries = [];
  const verifyFirst = [];
  const warnings = [];
  for (const f of PROVENANCE_FIELDS) {
    if (getField(facts, f) == null) { entries.push({ field: f, status: 'not_present', source: null }); continue; }
    const tag = prov[f];
    if (tag == null) {
      entries.push({ field: f, status: 'untagged', source: null });
      warnings.push(`provenance: ${f} has no source tag — verify against the subpoena before relying on it.`);
    } else if (typeof tag === 'object' && tag != null && typeof tag.source === 'string') {
      const status = tag.status === 'verified' ? 'verified' : 'verify';
      entries.push({ field: f, status, source: tag.source });
      if (status === 'verify') verifyFirst.push({ field: f, source: tag.source });
    } else {
      entries.push({ field: f, status: 'invalid', source: null });
      warnings.push(`provenance: "${f}" tag must be { source, status } — got ${JSON.stringify(tag)}.`);
    }
  }
  for (const k of Object.keys(prov)) {
    if (!PROVENANCE_FIELDS.includes(k)) warnings.push(`provenance: unknown field key "${k}" — not a tracked field.`);
  }
  return { entries, verify_first: verifyFirst, warnings };
}

/* ------------------------------------------------------------------ *
 * Portfolio cross-check
 * ------------------------------------------------------------------ */

/** @param {string|undefined|null} s */
function normCaption(s) { return String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

/**
 * Cross-check this subpoena against a portfolio of other inbound matters.
 * A caption match flags coordinated issuance; a party-only overlap flags a
 * related matter.
 *
 * @param {object} facts
 * @param {Array<{caption?: string, parties?: string[], status?: string}>} [portfolio]
 * @returns {{matches: Array<{entry_index: number, caption: string|null, caption_match: boolean, party_overlap: string[]}>,
 *   coordinated_issuance: boolean, warnings: string[]}}
 */
export function crossCheckPortfolio(facts, portfolio = []) {
  const caption = normCaption(facts?.subpoena?.caption);
  const ours = new Set([facts?.matter?.client, facts?.matter?.opposing].filter(Boolean).map(normCaption));
  const matches = [];
  let coordinated = false;
  portfolio.forEach((entry, i) => {
    const captionMatch = Boolean(caption) && Boolean(entry?.caption) && normCaption(entry.caption) === caption;
    const overlap = (entry?.parties ?? []).filter((p) => ours.has(normCaption(p)));
    if (captionMatch || overlap.length) {
      if (captionMatch) coordinated = true;
      matches.push({ entry_index: i, caption: entry.caption ?? null, caption_match: captionMatch, party_overlap: overlap });
    }
  });
  const warnings = [];
  if (coordinated) warnings.push('Coordinated issuance: another subpoena in the portfolio matches this caption — consider a single coordinated response strategy.');
  else if (matches.length) warnings.push(`Related matter(s) found by party overlap (${matches.flatMap((m) => m.party_overlap).join(', ')}).`);
  return { matches, coordinated_issuance: coordinated, warnings };
}

/* ------------------------------------------------------------------ *
 * Compliance plan + ICS export
 * ------------------------------------------------------------------ */

/**
 * Privilege-log fields we plan to populate (rules-as-data; forum rules vary).
 * @type {ReadonlyArray<string>}
 */
export const PRIVILEGE_LOG_FIELDS = Object.freeze(['date', 'author', 'recipients', 'subject/matter', 'privilege_basis', 'withheld_in_part']);

/**
 * Compliance-plan data (production scope, custodians/systems, format,
 * review protocol, privilege-log fields) from facts + scope.
 * @param {object} facts @param {ReturnType<analyzeScope>} scope
 */
function buildCompliance(facts, scope) {
  return {
    production_scope: scope.data_types.map((d) => d.type),
    date_range: { start: scope.date_range.start, end: scope.date_range.end },
    custodians: scope.custodians.map((c) => c.name),
    systems: [...new Set(scope.data_types.flatMap((d) => d.systems))],
    production_format: String(facts.production_format ?? 'per the subpoena or a negotiated protocol (unspecified — confirm before production)'),
    review_protocol: String(facts.review_protocol ?? 'unassigned'),
    privilege_log_fields: [...PRIVILEGE_LOG_FIELDS],
  };
}

/**
 * ICS calendar export of every tracked deadline (RFC 5545-style plain text,
 * CRLF line endings, no dependencies). Deterministic: DTSTAMP derives from
 * facts.today (fallback: served date), never from clock time.
 *
 * @param {ReturnType<trackResponse>} r
 * @returns {string}
 * @throws {Error} when r has no deadlines_all
 */
export function exportIcs(r) {
  if (!r?.deadlines_all) throw new Error('exportIcs needs a trackResponse result containing deadlines_all');
  const stampDate = (r.today && /^\d{4}-\d{2}-\d{2}$/.test(r.today) ? r.today : r.deadline.served_date).replace(/-/g, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//open-legal-artifacts//subpoena-response//EN', 'CALSCALE:GREGORIAN'];
  /** RFC 5545 §3.3.11 TEXT escaping: backslash, semicolon, comma, newline. @param {string} s */
  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  for (const kind of ['response', 'objection', 'production', 'quash_window', 'meet_and_confer']) {
    const e = r.deadlines_all[kind];
    if (!e?.deadline) continue;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.kind}-${e.deadline}@open-legal-artifacts-subpoena-response`,
      `DTSTAMP:${stampDate}T000000Z`,
      `DTSTART;VALUE=DATE:${e.deadline.replace(/-/g, '')}`,
      `SUMMARY:${esc(`${r.matter?.name ?? 'Subpoena matter'} — ${e.label} (${e.deadline})`)}`,
      `DESCRIPTION:${esc('open subpoena-response tracker; verify deadline against forum rules before relying on it')}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
