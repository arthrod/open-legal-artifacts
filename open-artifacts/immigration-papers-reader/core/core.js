/**
 * immigration-papers-reader — deterministic core.
 *
 * Paperwork text in (parseNotice, per-form rules-as-data templates) and/or
 * case-type facts JSON → required-documents checklist (rules-as-data),
 * per-document status with date math (missing / present / expiring_soon /
 * expired / uncertain), readiness score, key-date taxonomy with loud
 * per-type copy and next action, bilingual (EN/ES) Markdown export, and a
 * referral flag when case complexity exceeds this tool's scope.
 * No LLM, no network, no clock reads, no dependencies. Browser + Node ES module.
 *
 * Safety framing: this is a checklist helper, not legal advice. Anything
 * safety-critical (hearing dates, deadlines) is surfaced loudly, unreadable
 * input is marked `uncertain` — never guessed — and out-of-scope cases are
 * referred, never squeezed through the rubric.
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
  tps: Object.freeze({
    label: 'Temporary Protected Status (I-821) [verify current designation requirements]',
    required: Object.freeze([
      { id: 'government_id', label: 'Passport or government photo ID' },
      { id: 'nationality_evidence', label: 'Proof of nationality/identity (passport, birth certificate) with certified translation if needed' },
      { id: 'tps_receipt', label: 'I-821 TPS application/re-registration receipt or approval notice' },
      { id: 'continuous_residence_evidence', label: 'Evidence of continuous residence (per the country designation — verify dates)' },
    ]),
    optional: Object.freeze([
      { id: 'ead_card', label: 'Employment Authorization Document (I-766) if seeking work authorization', note: 'Expiry-sensitive document.' },
    ]),
  }),
  u_visa: Object.freeze({
    label: 'U nonimmigrant status (I-918) [verify current requirements]',
    required: Object.freeze([
      { id: 'government_id', label: 'Passport or other government ID' },
      { id: 'law_enforcement_certification', label: 'Law-enforcement certification (I-918 Supplement B)' },
      { id: 'u_visa_receipt', label: 'I-918 petition receipt notice' },
      { id: 'qualifying_activity_evidence', label: 'Evidence of the qualifying criminal activity and helpfulness (records, declarations)' },
    ]),
    optional: Object.freeze([
      { id: 'personal_statement', label: 'Personal statement describing harm and helpfulness' },
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
  removal_proceedings: 'Notice to Appear on file — case is in removal proceedings; refer to counsel authorized to practice in immigration court.',
  out_of_scope_case_type: 'Case type exceeds this tool’s scope (removal defense).',
});

/**
 * Key-date taxonomy (rules-as-data): each type carries loud copy (why the
 * date is safety-critical) and next-action copy. `hearing` copy is written
 * for immigration-court appearances — an in-absentia order is the failure
 * mode this exists to prevent.
 * @type {Readonly<Record<'hearing'|'filing_deadline'|'expiry'|'other',
 *   {label: string, loud: string, action: string}>>}
 */
export const KEY_DATE_TYPES = Object.freeze({
  hearing: Object.freeze({
    label: 'Hearing / court appearance',
    loud: 'HEARING DATE — missing it may result in an in-absentia removal order. If it may have been missed, refer immediately.',
    action: 'Attend this appearance; confirm date, time, and venue with the court. If you cannot attend, ask about rescheduling in advance — never just miss it.',
  }),
  filing_deadline: Object.freeze({
    label: 'Filing deadline',
    loud: 'FILING DEADLINE — missing it can forfeit the benefit or the chance to respond.',
    action: 'File or respond before this date.',
  }),
  expiry: Object.freeze({
    label: 'Document expiry',
    loud: 'EXPIRY — plan renewal or replacement before this date.',
    action: 'Renew or replace the document before it expires.',
  }),
  other: Object.freeze({
    label: 'Date',
    loud: '',
    action: 'Confirm what this date requires and act before it passes.',
  }),
});

/** Documents expiring within this window (days) are flagged expiring_soon. */
export const EXPIRING_SOON_DAYS = 180;

/* ------------------------------------------------------------------ *
 * Date helpers (ISO-only, no clock reads)
 * ------------------------------------------------------------------ */

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const parseUtc = (s) => new Date(s + 'T12:00:00Z');
/** Whole-day difference a − b. @param {string} a @param {string} b */
export function diffDays(a, b) { return Math.round((parseUtc(a) - parseUtc(b)) / 86400000); }

const MONTHS = Object.freeze({
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
});
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const iso = (y, m, d) => `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/**
 * Parse the first valid date in a captured text segment. Accepted formats:
 * ISO YYYY-MM-DD; 'Month D, YYYY' (full or 3-letter month); MM/DD/YYYY
 * (US convention used on USCIS notices — [verify] per document type).
 * No clock reads, no guessing: returns null when nothing valid is found.
 * @param {string} segment @returns {string|null} ISO date
 */
export function parseDateStrict(segment) {
  const s = String(segment);
  let m = s.match(/\b([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})\b/);
  if (m) {
    const mon = MONTHS[m[1].toLowerCase()];
    const d = Number(m[2]), y = Number(m[3]);
    if (mon && d >= 1 && d <= daysInMonth(y, mon)) return iso(y, mon, d);
  }
  m = s.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  if (m) {
    const mon = Number(m[1]), d = Number(m[2]), y = Number(m[3]);
    if (mon >= 1 && mon <= 12 && d >= 1 && d <= daysInMonth(y, mon)) return iso(y, mon, d);
  }
  m = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) {
    const y = Number(m[1]), mon = Number(m[2]), d = Number(m[3]);
    if (mon >= 1 && mon <= 12 && d >= 1 && d <= daysInMonth(y, mon)) return iso(y, mon, d);
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Deterministic notice parser
 * ------------------------------------------------------------------ */

/**
 * Per-form extraction templates (rules-as-data). `markers` must all match to
 * identify the form; `docs` map matched text to checklist document ids;
 * `dates` capture a labeled line and either set a document expiry (`doc`)
 * or produce a typed key date. Templates are fictional-sample-oriented and
 * illustrative — real notice layouts vary; [verify] against current forms.
 * Detection order matters: e.g. ASC biometrics notices ARE I-797Cs, so the
 * more specific template is checked first.
 */
export const NOTICE_TEMPLATES = Object.freeze({
  nta: Object.freeze({
    label: 'Notice to Appear (immigration court)',
    markers: Object.freeze([/Notice to Appear/i]),
    dates: Object.freeze([
      Object.freeze({
        field: 'hearing', label: 'Immigration court hearing (NTA)', type: 'hearing',
        re: /(?:appear before an?[^\n]*?\bon\b|Hearing Date:)[ \t]*([^\n\r]+)/i,
      }),
    ]),
    docs: Object.freeze([]),
    complexity: Object.freeze(['removal_proceedings']),
  }),
  biometrics: Object.freeze({
    label: 'ASC biometrics appointment notice',
    markers: Object.freeze([/Application Support Center|ASC Appointment/i, /Biometrics/i]),
    dates: Object.freeze([
      Object.freeze({
        field: 'appointment', label: 'Biometrics appointment', type: 'other',
        re: /Appointment Date:[ \t]*([^\n\r]+)/i,
      }),
    ]),
    docs: Object.freeze([Object.freeze({ id: 'biometrics_notice', re: /Biometrics/i })]),
  }),
  ead: Object.freeze({
    label: 'Employment Authorization Document (I-766 card)',
    markers: Object.freeze([/Form I-766|Employment Authorization Card/i]),
    dates: Object.freeze([
      Object.freeze({
        field: 'card_expires', label: 'EAD card expires', type: 'expiry', doc: 'ead_card',
        re: /Card Expires:[ \t]*([^\n\r]+)/i,
      }),
    ]),
    docs: Object.freeze([Object.freeze({ id: 'ead_card', re: /Form I-766|Employment Authorization Card/i })]),
  }),
  i693: Object.freeze({
    label: 'I-693 medical examination report',
    markers: Object.freeze([/Form I-693/i]),
    // No validity window is computed — the I-693 validity rule is real-law
    // dependent, so expiry stays unset rather than guessed.
    dates: Object.freeze([]),
    docs: Object.freeze([Object.freeze({ id: 'i693_medical', re: /Form I-693/i })]),
  }),
  i797c: Object.freeze({
    label: 'I-797C Notice of Action (USCIS receipt/action notice)',
    markers: Object.freeze([/Form I-797C|Notice of Action/i]),
    dates: Object.freeze([
      Object.freeze({
        field: 'notice_date', label: 'Notice date (I-797C)', type: 'other',
        re: /Notice Date:[ \t]*([^\n\r]+)/i,
      }),
    ]),
    docs: Object.freeze([
      Object.freeze({ id: 'i140_notice', re: /Form I-140|Immigrant Petition for Alien Worker/i }),
      Object.freeze({ id: 'petition_receipt', re: /Form I-130|Petition for Alien Relative/i }),
      Object.freeze({ id: 'i589_receipt', re: /Form I-589/i }),
      Object.freeze({ id: 'n400_receipt', re: /Form N-400|Application for Naturalization/i }),
      Object.freeze({ id: 'tps_receipt', re: /Form I-821/i }),
      Object.freeze({ id: 'u_visa_receipt', re: /Form I-918/i }),
    ]),
  }),
});

/** Detection order: most specific template first (see NOTICE_TEMPLATES doc). */
const NOTICE_ORDER = Object.freeze(['nta', 'biometrics', 'ead', 'i693', 'i797c']);

/**
 * Parse notice/paperwork text into a facts fragment for readCase.
 * Deterministic: same text in, byte-identical facts out; unreadable values
 * land in `facts.uncertain` — never guessed.
 *
 * @param {string} text notice text (paste or OCR)
 * @returns {{
 *   matched: boolean, form_type: string|null, form_label: string|null,
 *   facts: { documents: Record<string, {present: boolean, expiry_date?: string}>,
 *            key_dates: Record<string, {date: string, type: string}>,
 *            complexity: string[], uncertain: string[] },
 *   extraction_log: Array<{template: string, field: string, value: string, rule: string}>
 * }}
 * @throws {Error} if text is not a string
 */
export function parseNotice(text) {
  if (typeof text !== 'string') throw new Error(`parseNotice expects notice text as a string, got ${typeof text}`);
  const out = {
    matched: false, form_type: null, form_label: null,
    facts: { documents: {}, key_dates: {}, complexity: [], uncertain: [] },
    extraction_log: [],
  };
  let id = null, tpl = null;
  for (const tid of NOTICE_ORDER) {
    const t = NOTICE_TEMPLATES[tid];
    if (t.markers.every((re) => re.test(text))) { id = tid; tpl = t; break; }
  }
  if (!tpl) {
    out.facts.uncertain.push('No notice template matched — nothing extracted; do not guess.');
    return out;
  }
  out.matched = true;
  out.form_type = id;
  out.form_label = tpl.label;
  for (const d of tpl.docs) {
    if (d.re.test(text)) {
      out.facts.documents[d.id] = { present: true };
      out.extraction_log.push({ template: id, field: `document:${d.id}`, value: 'present', rule: 'docs' });
    }
  }
  for (const dr of tpl.dates) {
    const m = text.match(dr.re);
    if (!m) continue; // field simply absent from the page — not uncertainty
    const parsed = parseDateStrict(m[1]);
    if (parsed == null) {
      out.facts.uncertain.push(`${dr.label} is present but unreadable (${JSON.stringify(m[1].trim().slice(0, 40))}) — never guessed.`);
      continue;
    }
    if (dr.doc) out.facts.documents[dr.doc] = { present: true, expiry_date: parsed };
    else out.facts.key_dates[dr.label] = { date: parsed, type: dr.type };
    out.extraction_log.push({ template: id, field: dr.field, value: parsed, rule: 'dates' });
  }
  for (const c of tpl.complexity ?? []) out.facts.complexity.push(c);
  if (out.extraction_log.length === 0) {
    out.facts.uncertain.push('Notice type recognized but no fields could be extracted — verify manually.');
  }
  return out;
}

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
 * Deterministic: `facts.today` is required — the clock is never read.
 *
 * @param {{case_type: string, today: string,
 *          documents?: Record<string, {present?: boolean, expiry_date?: string|null, uncertain?: boolean}>,
 *          complexity?: string[], key_dates?: Record<string, string|{date: string, type?: string}>,
 *          uncertain?: string[], applicant?: object}} facts
 * @param {{expiringSoonDays?: number, urgentDays?: number}} [config]
 * @returns {{
 *   case_type: string, case_label: string, today: string,
 *   checklist: Array<{id: string, label: string, required: boolean, note: string,
 *                     status: string, detail: string}>,
 *   readiness: {score: number, ready_count: number, required_count: number, has_uncertain: boolean,
 *               not_ready: Array<{id: string, label: string, status: string}>},
 *   key_dates: Array<{label: string, date: string, type: string, loud: string,
 *                     days_until: number|null, urgent: boolean}>,
 *   next_action: {label: string, date: string, days_until: number, type: string, action: string}|null,
 *   referral: {flag: boolean, reasons: Array<{id: string, label: string}>},
 *   summary: string[], warnings: string[]
 * }}
 * @throws {Error} unknown case type; missing/malformed today; malformed or
 *   untyped-bad dates; non-array `uncertain`
 */
export function readCase(facts, config = {}) {
  const caseType = facts.case_type;
  const template = CASE_TYPES[caseType];
  if (!template) throw new Error(`Unknown case_type "${caseType}"; valid: ${Object.keys(CASE_TYPES).join(', ')}`);
  if (facts.today == null) throw new Error('facts.today is required (ISO YYYY-MM-DD) — readCase never reads the clock, so output stays reproducible.');
  const today = facts.today;
  if (!ISO.test(today)) throw new Error(`today must be an ISO date, got ${JSON.stringify(today)}`);
  const urgentDays = config.urgentDays ?? 14;
  const warnings = [];

  // ---- uncertain capture notes (honesty bridge from parsing) -----------
  let uncertainNotes = [];
  if (facts.uncertain !== undefined) {
    if (!Array.isArray(facts.uncertain) || facts.uncertain.some((u) => typeof u !== 'string')) {
      throw new Error('facts.uncertain must be an array of strings (capture notes naming documents or describing what was unreadable).');
    }
    uncertainNotes = facts.uncertain;
  }
  /** @param {string} id @param {{uncertain?: boolean}} docFacts */
  const flagsDoc = (id, docFacts) => docFacts.uncertain === true || uncertainNotes.some((u) => u.includes(id));

  // ---- key dates: taxonomy, loud copy, sort, next action ----------------
  const keyDates = [];
  for (const [label, value] of Object.entries(facts.key_dates ?? {})) {
    let date, type = 'other';
    if (typeof value === 'string') date = value;
    else if (value != null && typeof value === 'object' && !Array.isArray(value)) {
      date = value.date;
      if (value.type != null) {
        if (!Object.hasOwn(KEY_DATE_TYPES, value.type)) {
          throw new Error(`key_dates.${label}.type must be one of ${Object.keys(KEY_DATE_TYPES).join(', ')}; got ${JSON.stringify(value.type)}`);
        }
        type = value.type;
      }
    } else {
      throw new Error(`key_dates.${label} must be an ISO date string or {date, type}, got ${JSON.stringify(value)}`);
    }
    if (typeof date !== 'string' || !ISO.test(date)) throw new Error(`key_dates.${label} must be an ISO date, got ${JSON.stringify(date)}`);
    const loud = KEY_DATE_TYPES[type].loud;
    const daysUntil = diffDays(date, today);
    const urgent = daysUntil >= 0 && daysUntil <= urgentDays;
    if (urgent) warnings.push(`URGENT: ${label} on ${date} — ${daysUntil} day(s) away.${loud ? ` ${loud}` : ''}`);
    if (daysUntil < 0) warnings.push(`PASSED: ${label} was ${date} (${-daysUntil} day(s) ago) — confirm what happened.${type === 'hearing' ? ` ${KEY_DATE_TYPES.hearing.loud}` : ''}`);
    keyDates.push({ label, date, type, loud, days_until: daysUntil, urgent });
  }
  keyDates.sort((a, b) => a.days_until - b.days_until || a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
  const upcoming = keyDates.find((k) => k.days_until >= 0);
  const next_action = upcoming
    ? { label: upcoming.label, date: upcoming.date, days_until: upcoming.days_until, type: upcoming.type, action: KEY_DATE_TYPES[upcoming.type].action }
    : null;

  // ---- referral: out-of-scope cases and complexity are never scored ----
  const complexity = facts.complexity ?? [];
  const referralReasons = [];
  if (template.outOfScope) referralReasons.push({ id: 'out_of_scope_case_type', label: REFERRAL_FACTORS.out_of_scope_case_type });
  for (const c of complexity) {
    const label = REFERRAL_FACTORS[c];
    if (!label) { warnings.push(`Unknown complexity factor "${c}" included verbatim; not mapped in the referral library.`); referralReasons.push({ id: c, label: `Reported complexity: ${c} (unmapped).` }); continue; }
    referralReasons.push({ id: c, label });
  }
  if (keyDates.some((k) => k.type === 'hearing' && k.days_until < 0) && !referralReasons.some((x) => x.id === 'missed_hearing')) {
    referralReasons.push({ id: 'missed_hearing', label: `${REFERRAL_FACTORS.missed_hearing} (Detected: a hearing date in key_dates has already passed.)` });
  }

  // ---- checklist ----------------------------------------------------------
  const docs = facts.documents ?? {};
  const checklist = [];
  for (const group of [{ list: template.required, required: true }, { list: template.optional ?? [], required: false }]) {
    for (const d of group.list) {
      const docFacts = docs[d.id] ?? {};
      let status, detail;
      if (docFacts.present && flagsDoc(d.id, docFacts)) {
        status = 'uncertain';
        detail = 'On file but flagged uncertain during capture — verify manually before relying on this.';
      } else {
        ({ status, detail } = documentStatus(docFacts, today, config));
      }
      checklist.push({ id: d.id, label: d.label, required: group.required, note: d.note ?? '', status, detail });
    }
  }
  const hasUncertain = checklist.some((c) => c.status === 'uncertain');
  for (const c of checklist) {
    if (c.status === 'uncertain') warnings.push(`UNCERTAIN: ${c.label} — extraction was not confident; verify before relying on this checklist.`);
  }
  for (const u of uncertainNotes) {
    if (!checklist.some((c) => u.includes(c.id))) warnings.push(`UNCERTAIN (capture note): ${u}`);
  }

  const requiredItems = checklist.filter((c) => c.required);
  const okStatuses = requiredItems.filter((c) => c.status === 'present' || c.status === 'expiring_soon');
  const notReady = requiredItems.filter((c) => c.status === 'missing' || c.status === 'expired' || c.status === 'uncertain')
    .map((c) => ({ id: c.id, label: c.label, status: c.status }));
  const score = requiredItems.length ? Math.round((okStatuses.length / requiredItems.length) * 100) : 0;
  if (template.outOfScope) warnings.push('Readiness score is not computed for out-of-scope case types; this case must be referred.');

  // ---- plain-language summary ----------------------------------------------
  const summary = [];
  summary.push(`Case type: ${template.label}. Checklist checked against ${today}.`);
  if (!template.outOfScope) {
    summary.push(`${okStatuses.length} of ${requiredItems.length} required documents are on file and valid — readiness ${score}%.`);
    if (notReady.length) summary.push(`Still needed, expired, or uncertain: ${notReady.map((n) => `${n.label} (${n.status})`).join('; ')}.`);
  }
  if (hasUncertain) summary.push('At least one document was flagged uncertain during capture — verify it before relying on this checklist.');
  for (const k of keyDates) summary.push(`${k.label}: ${k.date}${k.days_until >= 0 ? ` — ${k.days_until} day(s) from now` : ` — ${-k.days_until} day(s) ago`}${k.urgent ? ' (URGENT)' : ''}.`);
  if (next_action) summary.push(`Next action: ${next_action.label} on ${next_action.date} (${next_action.days_until} day(s) away) — ${next_action.action}`);
  if (referralReasons.length) summary.push('This case should be referred to an accredited attorney or accredited representative before anything is filed.');
  summary.push('This checklist is not legal advice.');

  return {
    case_type: caseType, case_label: template.label, today,
    checklist, readiness: { score, ready_count: okStatuses.length, required_count: requiredItems.length, has_uncertain: hasUncertain, not_ready: notReady },
    key_dates: keyDates, next_action,
    referral: { flag: referralReasons.length > 0, reasons: referralReasons },
    summary, warnings,
  };
}

/* ------------------------------------------------------------------ *
 * Markdown export (bilingual EN/ES)
 * ------------------------------------------------------------------ */

/**
 * Export strings. The Spanish rendering is an unofficial translation
 * (marked as such in the footer) — it needs native review before
 * community use.
 */
const I18N = Object.freeze({
  en: Object.freeze({
    title: 'Immigration document checklist',
    asOf: 'Checked as of', readiness: 'Readiness', requiredValid: 'required valid',
    referralHead: '**REFERRAL RECOMMENDED**',
    requiredDocs: 'Required documents', ifApplicable: 'If applicable',
    keyDates: 'Key dates', nextAction: 'Next action',
    warnings: 'Warnings', note: 'note',
    daysAway: (n) => `${n} day(s) away`, daysAgo: (n) => `${n} day(s) ago`,
    footer: '_Deterministic output of the open immigration-papers-reader. Checklists are configurable rules-as-data and change with USCIS/EOIR practice; not legal advice._',
  }),
  es: Object.freeze({
    title: 'Lista de verificación de documentos de inmigración',
    asOf: 'Verificado al', readiness: 'Preparación', requiredValid: 'requeridos válidos',
    referralHead: '**SE RECOMIENDA DERIVACIÓN**',
    requiredDocs: 'Documentos requeridos', ifApplicable: 'Si aplica',
    keyDates: 'Fechas clave', nextAction: 'Próxima acción',
    warnings: 'Advertencias', note: 'nota',
    daysAway: (n) => `en ${n} día(s)`, daysAgo: (n) => `hace ${n} día(s)`,
    footer: '_Salida determinista del immigration-papers-reader abierto. Las listas de verificación son datos configurables y cambian con la práctica de USCIS/EOIR; traducción no oficial; no es asesoría legal._',
  }),
});

/**
 * Markdown checklist export (bilingual).
 * @param {ReturnType<readCase>} r
 * @param {{lang?: 'en'|'es'}} [options]
 */
export function exportChecklistMd(r, options = {}) {
  const lang = options.lang ?? 'en';
  const s = I18N[lang];
  if (!s) throw new Error(`lang must be one of ${Object.keys(I18N).join(', ')}; got ${JSON.stringify(lang)}`);
  const L = [];
  L.push(`# ${s.title} — ${r.case_label}`, '',
    `${s.asOf} ${r.today}. ${s.readiness}: **${r.readiness.score}%** (${r.readiness.ready_count}/${r.readiness.required_count} ${s.requiredValid}).`, '');
  if (r.referral.flag) { L.push(`> ${s.referralHead}`, '', ...r.referral.reasons.map((x) => `> - ${x.label}`), ''); }
  L.push(`## ${s.requiredDocs}`, '');
  for (const c of r.checklist.filter((x) => x.required)) {
    const done = c.status === 'present' || c.status === 'expiring_soon';
    L.push(`- [${done ? 'x' : ' '}] **${c.label}** — ${c.status}: ${c.detail}${c.note ? ` (${s.note}: ${c.note})` : ''}`);
  }
  const opt = r.checklist.filter((x) => !x.required);
  if (opt.length) { L.push('', `## ${s.ifApplicable}`, ''); for (const c of opt) L.push(`- [ ] ${c.label} — ${c.status}`); }
  if (r.key_dates.length) {
    L.push('', `## ${s.keyDates}`, '');
    for (const k of r.key_dates) {
      L.push(`- ${k.label}: **${k.date}** (${k.days_until >= 0 ? `${s.daysAway(k.days_until)}${k.urgent ? ' — URGENT' : ''}` : s.daysAgo(-k.days_until)})${k.type !== 'other' ? ` — ${KEY_DATE_TYPES[k.type].label}` : ''}`);
    }
  }
  if (r.next_action) L.push('', `**${s.nextAction}:** ${r.next_action.label} — ${r.next_action.date} (${s.daysAway(r.next_action.days_until)}) — ${r.next_action.action}`);
  if (r.warnings.length) { L.push('', `## ${s.warnings}`, ''); for (const w of r.warnings) L.push(`- ⚠ ${w}`); }
  L.push('', '---', '', s.footer);
  return L.join('\n');
}
