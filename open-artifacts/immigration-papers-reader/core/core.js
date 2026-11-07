/**
 * immigration-papers-reader — deterministic core.
 *
 * Case-type facts JSON → required-documents checklist (rules-as-data),
 * per-document status with date math (missing / present / expiring_soon /
 * expired), readiness score, key-date surfacing, and a referral flag when
 * case complexity exceeds this tool's scope.
 * No LLM, no network, no dependencies. Browser + Node ES module.
 *
 * Safety framing: this is a checklist helper, not legal advice. Anything
 * safety-critical (hearing dates, deadlines) is surfaced loudly, and
 * out-of-scope cases are referred, never squeezed through the rubric.
 *
 * @module core
 */

/* ------------------------------------------------------------------ *
 * Rules-as-data
 * ------------------------------------------------------------------ */

/**
 * Checklist templates per case type (US-context defaults; jurisdiction- and
 * form-dependent — treat as configurable data, verify current requirements).
 * `outOfScope` types are referred instead of checked.
 * @type {Readonly<Record<string, {label: string, outOfScope?: boolean,
 *   required: ReadonlyArray<{id: string, label: string, note?: string}>,
 *   optional?: ReadonlyArray<{id: string, label: string, note?: string}>}>>}
 */
export const CASE_TYPES = Object.freeze({
  family_based: Object.freeze({
    label: 'Family-based adjustment / consular processing',
    required: Object.freeze([
      { id: 'government_id', label: 'Government-issued photo ID / passport', note: 'For every applicant.' },
      { id: 'birth_certificate', label: 'Birth certificate (with certified translation if needed)' },
      { id: 'relationship_evidence', label: 'Proof of relationship to petitioner (marriage/birth record)' },
      { id: 'petition_receipt', label: 'I-130 receipt or approval notice' },
      { id: 'photos', label: 'Passport-style photos to spec' },
    ]),
    optional: Object.freeze([
      { id: 'i693_medical', label: 'I-693 medical exam (sealed)', note: 'Timing matters — check validity window.' },
    ]),
  }),
  employment_based: Object.freeze({
    label: 'Employment-based adjustment',
    required: Object.freeze([
      { id: 'government_id', label: 'Passport / government photo ID' },
      { id: 'i140_notice', label: 'I-140 receipt or approval notice' },
      { id: 'employment_letter', label: 'Employer verification letter (current terms)' },
      { id: 'pay_stubs', label: 'Recent pay stubs' },
      { id: 'i693_medical', label: 'I-693 medical exam (sealed)', note: 'Expiry-sensitive document.' },
    ]),
    optional: Object.freeze([
      { id: 'tax_returns', label: 'Recent tax transcripts' },
    ]),
  }),
  asylum_affirmative: Object.freeze({
    label: 'Affirmative asylum (I-589)',
    required: Object.freeze([
      { id: 'government_id', label: 'Passport or other government ID' },
      { id: 'i589_receipt', label: 'I-589 receipt notice' },
      { id: 'personal_statement', label: 'Applicant declaration / personal statement' },
      { id: 'country_evidence', label: 'Country-conditions evidence' },
      { id: 'biometrics_notice', label: 'Biometrics/fingerprint notice' },
    ]),
    optional: Object.freeze([
      { id: 'translation_cert', label: 'Certified translations for foreign documents' },
    ]),
  }),
  naturalization: Object.freeze({
    label: 'Naturalization (N-400)',
    required: Object.freeze([
      { id: 'green_card', label: 'Permanent resident card (I-551)', note: 'Expiry-sensitive; check renewal timing.' },
      { id: 'n400_receipt', label: 'N-400 receipt notice' },
      { id: 'tax_returns', label: 'Tax returns for the statutory period' },
      { id: 'selective_service', label: 'Selective Service registration proof (if applicable)' },
    ]),
    optional: Object.freeze([
      { id: 'marriage_certificate', label: 'Marriage certificate (if applying on 3-year basis)' },
    ]),
  }),
  removal_defense: Object.freeze({
    label: 'Removal defense / immigration court',
    outOfScope: true,
    required: Object.freeze([]),
  }),
});

/**
 * Complexity factors that trigger referral (rules-as-data).
 * @type {Readonly<Record<string, string>>}
 */
export const REFERRAL_FACTORS = Object.freeze({
  criminal_history: 'Any criminal history or arrests (even dismissed) — eligibility analysis needed.',
  prior_removal_order: 'Prior removal or deportation order.',
  missed_hearing: 'Previously missed a hearing or received an in-absentia order.',
  prior_denial: 'Prior denial of this or a related benefit.',
  detention: 'Applicant or family member currently detained.',
  prior_unlawful_presence: 'Prior unlawful presence over 180/365 days (bars may apply).',
  out_of_scope_case_type: 'Case type exceeds this tool’s scope (removal defense).',
});

/** Documents expiring within this window (days) are flagged expiring_soon. */
export const EXPIRING_SOON_DAYS = 180;

/* ------------------------------------------------------------------ *
 * Date helpers (ISO-only)
 * ------------------------------------------------------------------ */

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const parseUtc = (s) => new Date(s + 'T12:00:00Z');
/** Whole-day difference a − b. @param {string} a @param {string} b */
export function diffDays(a, b) { return Math.round((parseUtc(a) - parseUtc(b)) / 86400000); }

/* ------------------------------------------------------------------ *
 * Per-document status
 * ------------------------------------------------------------------ */

/**
 * Compute one document's status.
 * @param {{present?: boolean, expiry_date?: string|null}} doc
 * @param {string} today ISO
 * @param {{expiringSoonDays?: number}} [config]
 * @returns {{status: 'missing'|'present'|'expiring_soon'|'expired', detail: string}}
 * @throws {Error} on malformed dates
 */
export function documentStatus(doc, today, config = {}) {
  const soonDays = config.expiringSoonDays ?? EXPIRING_SOON_DAYS;
  if (!ISO.test(today)) throw new Error(`today must be an ISO date, got ${JSON.stringify(today)}`);
  if (doc?.expiry_date != null && !ISO.test(doc.expiry_date)) throw new Error(`expiry_date must be ISO, got ${JSON.stringify(doc.expiry_date)}`);
  if (!doc?.present) return { status: 'missing', detail: 'Not reported in file.' };
  if (doc.expiry_date == null) return { status: 'present', detail: 'On file; no expiry tracked.' };
  const d = diffDays(doc.expiry_date, today);
  if (d < 0) return { status: 'expired', detail: `Expired ${-d} day(s) ago (on ${doc.expiry_date}).` };
  if (d === 0) return { status: 'expired', detail: `Expires today (${doc.expiry_date}).` };
  if (d <= soonDays) return { status: 'expiring_soon', detail: `Valid but expires in ${d} day(s) (${doc.expiry_date}).` };
  return { status: 'present', detail: `Valid through ${doc.expiry_date}.` };
}

/* ------------------------------------------------------------------ *
 * Case reader
 * ------------------------------------------------------------------ */

/**
 * Read a case's facts and produce checklist + readiness + referral.
 *
 * @param {{case_type: string, today?: string,
 *          documents?: Record<string, {present?: boolean, expiry_date?: string|null}>,
 *          complexity?: string[], key_dates?: Record<string, string>,
 *          applicant?: object}} facts
 * @param {{expiringSoonDays?: number, urgentDays?: number}} [config]
 * @returns {{
 *   case_type: string, case_label: string, today: string,
 *   checklist: Array<{id: string, label: string, required: boolean, note: string,
 *                     status: string, detail: string}>,
 *   readiness: {score: number, ready_count: number, required_count: number,
 *               not_ready: Array<{id: string, label: string, status: string}>},
 *   key_dates: Array<{label: string, date: string, days_until: number|null, urgent: boolean}>,
 *   referral: {flag: boolean, reasons: Array<{id: string, label: string}>},
 *   summary: string[], warnings: string[]
 * }}
 * @throws {Error} unknown case type or malformed dates
 */
export function readCase(facts, config = {}) {
  const caseType = facts.case_type;
  const template = CASE_TYPES[caseType];
  if (!template) throw new Error(`Unknown case_type "${caseType}"; valid: ${Object.keys(CASE_TYPES).join(', ')}`);
  const today = facts.today ?? new Date().toISOString().slice(0, 10);
  const urgentDays = config.urgentDays ?? 14;
  const warnings = [];

  // ---- referral first: out-of-scope cases are never scored ----------------
  const complexity = facts.complexity ?? [];
  const referralReasons = [];
  if (template.outOfScope) referralReasons.push({ id: 'out_of_scope_case_type', label: REFERRAL_FACTORS.out_of_scope_case_type });
  for (const c of complexity) {
    const label = REFERRAL_FACTORS[c];
    if (!label) { warnings.push(`Unknown complexity factor "${c}" included verbatim; not mapped in the referral library.`); referralReasons.push({ id: c, label: `Reported complexity: ${c} (unmapped).` }); continue; }
    referralReasons.push({ id: c, label });
  }

  // ---- checklist ----------------------------------------------------------
  const docs = facts.documents ?? {};
  const checklist = [];
  for (const group of [{ list: template.required, required: true }, { list: template.optional ?? [], required: false }]) {
    for (const d of group.list) {
      const { status, detail } = documentStatus(docs[d.id] ?? {}, today, config);
      checklist.push({ id: d.id, label: d.label, required: group.required, note: d.note ?? '', status, detail });
    }
  }

  const requiredItems = checklist.filter((c) => c.required);
  const okStatuses = requiredItems.filter((c) => c.status === 'present' || c.status === 'expiring_soon');
  const notReady = requiredItems.filter((c) => c.status === 'missing' || c.status === 'expired')
    .map((c) => ({ id: c.id, label: c.label, status: c.status }));
  const score = requiredItems.length ? Math.round((okStatuses.length / requiredItems.length) * 100) : 0;
  if (template.outOfScope) warnings.push('Readiness score is not computed for out-of-scope case types; this case must be referred.');

  // ---- key dates ----------------------------------------------------------
  const keyDates = [];
  for (const [label, date] of Object.entries(facts.key_dates ?? {})) {
    if (!ISO.test(date)) throw new Error(`key_dates.${label} must be an ISO date, got ${JSON.stringify(date)}`);
    const daysUntil = diffDays(date, today);
    const urgent = daysUntil >= 0 && daysUntil <= urgentDays;
    if (urgent) warnings.push(`URGENT: ${label} on ${date} — ${daysUntil} day(s) away.`);
    if (daysUntil < 0) warnings.push(`PASSED: ${label} was ${date} (${-daysUntil} day(s) ago) — confirm what happened.`);
    keyDates.push({ label, date, days_until: daysUntil, urgent });
  }

  // ---- plain-language summary ----------------------------------------------
  const summary = [];
  summary.push(`Case type: ${template.label}. Checklist checked against ${today}.`);
  if (!template.outOfScope) {
    summary.push(`${okStatuses.length} of ${requiredItems.length} required documents are on file and valid — readiness ${score}%.`);
    if (notReady.length) summary.push(`Still needed or expired: ${notReady.map((n) => `${n.label} (${n.status})`).join('; ')}.`);
  }
  for (const k of keyDates) summary.push(`${k.label}: ${k.date}${k.days_until >= 0 ? ` — ${k.days_until} day(s) from now` : ` — ${-k.days_until} day(s) ago`}${k.urgent ? ' (URGENT)' : ''}.`);
  if (referralReasons.length) summary.push('This case should be referred to an accredited attorney or accredited representative before anything is filed.');
  summary.push('This checklist is not legal advice.');

  return {
    case_type: caseType, case_label: template.label, today,
    checklist, readiness: { score, ready_count: okStatuses.length, required_count: requiredItems.length, not_ready: notReady },
    key_dates: keyDates,
    referral: { flag: referralReasons.length > 0, reasons: referralReasons },
    summary, warnings,
  };
}

/**
 * Markdown checklist export.
 * @param {ReturnType<readCase>} r
 */
export function exportChecklistMd(r) {
  const L = [];
  L.push(`# Immigration document checklist — ${r.case_label}`, '',
    `Checked as of ${r.today}. Readiness: **${r.readiness.score}%** (${r.readiness.ready_count}/${r.readiness.required_count} required valid).`, '');
  if (r.referral.flag) { L.push('> **REFERRAL RECOMMENDED**', ''); for (const x of r.referral.reasons) L.push(`> - ${x.label}`); L.push(''); }
  L.push('## Required documents', '');
  for (const c of r.checklist.filter((x) => x.required)) L.push(`- [${c.status === 'present' || c.status === 'expiring_soon' ? 'x' : ' '}] **${c.label}** — ${c.status}: ${c.detail}${c.note ? ` (note: ${c.note})` : ''}`);
  const opt = r.checklist.filter((x) => !x.required);
  if (opt.length) { L.push('', '## If applicable', ''); for (const c of opt) L.push(`- [ ] ${c.label} — ${c.status}`); }
  if (r.key_dates.length) { L.push('', '## Key dates', ''); for (const k of r.key_dates) L.push(`- ${k.label}: **${k.date}** (${k.days_until >= 0 ? `${k.days_until} day(s) away${k.urgent ? ' — URGENT' : ''}` : `${-k.days_until} day(s) ago`})`); }
  if (r.warnings.length) { L.push('', '## Warnings', ''); for (const w of r.warnings) L.push(`- ⚠ ${w}`); }
  L.push('', '---', '', '_Deterministic output of the open immigration-papers-reader. Checklists are configurable rules-as-data and change with USCIS/EOIR practice; not legal advice._');
  return L.join('\n');
}
