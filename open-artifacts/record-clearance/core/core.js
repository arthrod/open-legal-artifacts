/**
 * record-clearance — deterministic core.
 *
 * Record clearance / certificate-of-relief tracker: evaluates each relief
 * type in a jurisdiction rules-as-data file against a client's record,
 * producing an eligibility-prerequisites checklist (met / not_met / unknown —
 * never guessed), filing-deadline date math (earliest and, where the rule
 * defines one, last filing date), status tracking for matters already filed,
 * and referral flags. Deterministic; no LLM; no hidden clocks (all math
 * anchors to caller-supplied `asOf`).
 * @module core
 */

/* ---------- date helpers (self-contained by design) ---------- */

/** Parse "YYYY-MM-DD" to a UTC Date. Null when unparseable — never guessed.
 * @param {string|undefined|null} d @returns {Date|null} */
export function parseDate(d) {
  if (!d || typeof d !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.trim());
  if (!m) return null;
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (Number.isNaN(dt.getTime())) return null;
  if (dt.getUTCMonth() !== +m[2] - 1 || dt.getUTCDate() !== +m[3]) return null;
  return dt;
}

/** Format a UTC date back to "YYYY-MM-DD".
 * @param {Date|null} dt @returns {string|null} */
export function fmtDate(dt) {
  return dt ? dt.toISOString().slice(0, 10) : null;
}

/** Add years with month-end clamping.
 * @param {Date} dt @param {number} years @returns {Date} */
export function addYears(dt, years) {
  const y = dt.getUTCFullYear() + years;
  const m = dt.getUTCMonth();
  let day = dt.getUTCDate();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  if (day > last) day = last;
  return new Date(Date.UTC(y, m, day));
}

/** Whole calendar years elapsed from `from` to `to`.
 * @param {Date} from @param {Date} to @returns {number} */
export function yearsElapsed(from, to) {
  let yrs = to.getUTCFullYear() - from.getUTCFullYear();
  const before =
    to.getUTCMonth() < from.getUTCMonth() ||
    (to.getUTCMonth() === from.getUTCMonth() && to.getUTCDate() < from.getUTCDate());
  if (before) yrs -= 1;
  return yrs;
}

/* ---------- rules-as-data (illustrative, editable) ---------- */

/**
 * Relief-type rules per example jurisdiction, in two tiers: `full` rulesets
 * (default) carry prerequisites + filing math + filingGuidance + authority;
 * `guidance` tier rulesets (e.g. TX) carry a generic screen, a guidanceNote,
 * and a mandatory referral — an answer for every jurisdiction, never a bare
 * error. Each prerequisite has a
 * `kind` the engine knows how to evaluate deterministically:
 *  - probationCompleted · finesPaid · noPendingCases · rapSheetObtained
 *  - offenseNotIn { categories, classes }
 *  - convictionCountMax { max }
 *  - waitingPeriod { years, anchor }  (anchor = conviction field)
 * Filing math: earliestFiling { anchor, years } and optional
 * filingWindow { closeYearsAfterEarliest }.
 * ILLUSTRATIVE ONLY — modeled on common clearance-scheme shapes.
 * @type {Record<string, Object>}
 */
export const JURISDICTION_RULES = {
  CA: {
    id: "CA",
    name: "California (example ruleset)",
    version: "2026-11-example",
    reliefTypes: [
      {
        id: "CA-dismissal-petition",
        name: "Dismissal petition (record clearance)",
        ruleId: "CA-CR1",
        authority: { cite: "Cal. Penal Code § 1203.4 (dismissal) — illustrative [verify]", url: "https://selfhelp.courts.ca.gov/record-clearance" },
        filingGuidance: {
          steps: [
            "Obtain a certified copy of the rap sheet (illustrative step — verify locally).",
            "Complete the dismissal petition for each conviction and attach disposition documents.",
            "File at the court of conviction and serve the prosecuting attorney.",
            "Comply with any local notice-to-probation requirement before the hearing.",
          ],
          forms: ["Dismissal petition (illustrative form name — verify locally)", "Declaration in support (illustrative)"],
          feeWaiverNote: "A fee-waiver application is available from the clerk on request (illustrative — verify locally).",
        },
        prerequisites: [
          { id: "CA-CR1-a", kind: "probationCompleted", label: "Probation completed or terminated" },
          { id: "CA-CR1-b", kind: "finesPaid", label: "All fines, fees, and restitution paid" },
          { id: "CA-CR1-c", kind: "noPendingCases", label: "No pending criminal cases" },
          { id: "CA-CR1-d", kind: "offenseNotIn", categories: ["sex_offense", "violent_felony"], label: "Offense not excluded from relief" },
        ],
        earliestFiling: { anchor: "probationTerminatedDate", years: 0 },
        referral: null,
      },
      {
        id: "CA-cert-rehab",
        name: "Certificate of Rehabilitation",
        ruleId: "CA-CR2",
        authority: { cite: "Cal. Penal Code § 4852.17 (certificate of rehabilitation) — illustrative [verify]", url: "https://selfhelp.courts.ca.gov/record-clearance" },
        filingGuidance: {
          steps: [
            "Obtain a certified rap sheet and live-scan fingerprinting receipt (illustrative).",
            "Assemble the rehabilitation declaration and supporting letters.",
            "File the petition in the county of residence and serve as the court directs.",
            "Attend the hearing with counsel or the legal aid clinic.",
          ],
          forms: ["Certificate of Rehabilitation petition (illustrative — verify locally)", "Live-scan receipt (illustrative)"],
          feeWaiverNote: "A fee-waiver request may accompany the petition (illustrative — verify locally).",
        },
        prerequisites: [
          { id: "CA-CR2-a", kind: "probationCompleted", label: "Probation completed" },
          { id: "CA-CR2-b", kind: "finesPaid", label: "All court-ordered payments satisfied" },
          { id: "CA-CR2-c", kind: "noPendingCases", label: "No pending cases" },
          { id: "CA-CR2-d", kind: "offenseNotIn", categories: ["sex_offense"], label: "Offense not categorically excluded" },
          { id: "CA-CR2-e", kind: "waitingPeriod", years: 7, anchor: "sentenceCompletedDate", label: "7 years since completion of sentence" },
        ],
        earliestFiling: { anchor: "sentenceCompletedDate", years: 7 },
        referral: "Certificate filings require live-scan and court appearance — refer to counsel or legal aid clinic.",
      },
      {
        id: "CA-governor-pardon",
        name: "Governor's pardon (application)",
        ruleId: "CA-CR3",
        authority: { cite: "Cal. Const. art. V § 8 (governor's pardon) — illustrative [verify]", url: "https://www.gov.ca.gov/" },
        filingGuidance: {
          steps: [
            "Obtain the certified rap sheet and court records for every conviction (illustrative).",
            "Prepare the application narrative and letters of support.",
            "Submit through the governor's office portal or by mail (illustrative).",
            "Coordinate with counsel before submission.",
          ],
          forms: ["Governor's pardon application (illustrative — verify locally)", "Letters of support (illustrative)"],
          feeWaiverNote: "No filing fee is charged for pardon applications in this example ruleset (illustrative — verify).",
        },
        prerequisites: [
          { id: "CA-CR3-a", kind: "noPendingCases", label: "No pending cases" },
          { id: "CA-CR3-b", kind: "waitingPeriod", years: 10, anchor: "sentenceCompletedDate", label: "10 years since sentence completion" },
          { id: "CA-CR3-c", kind: "rapSheetObtained", label: "Certified rap sheet obtained for the application" },
        ],
        earliestFiling: { anchor: "sentenceCompletedDate", years: 10 },
        referral: "Pardon applications route through the governor's office — refer to counsel.",
      },
    ],
  },
  IL: {
    id: "IL",
    name: "Illinois (example ruleset)",
    version: "2026-11-example",
    reliefTypes: [
      {
        id: "IL-expungement",
        name: "Expungement petition",
        ruleId: "IL-CR1",
        authority: { cite: "20 ILCS 2630/5.2 (expungement) — illustrative [verify]", url: "https://www.illinoiscourts.gov/" },
        filingGuidance: {
          steps: [
            "Obtain a certified disposition for each conviction (illustrative).",
            "Verify eligibility against the exclusion list before drafting.",
            "File the expungement petition with the circuit clerk and serve the State's Attorney.",
            "Attend the hearing if the court requires it.",
          ],
          forms: ["Expungement petition (illustrative form name — verify locally)", "Notice to State's Attorney (illustrative)"],
          feeWaiverNote: "A fee-waiver application may be filed with the petition (illustrative — verify locally).",
        },
        prerequisites: [
          { id: "IL-CR1-a", kind: "noPendingCases", label: "No pending criminal cases" },
          { id: "IL-CR1-b", kind: "finesPaid", label: "All fines paid" },
          { id: "IL-CR1-c", kind: "offenseNotIn", categories: ["dui_serious", "sex_offense", "violent_felony"], label: "Offense eligible for expungement" },
          { id: "IL-CR1-d", kind: "waitingPeriod", years: 3, anchor: "sentenceCompletedDate", label: "3-year waiting period after sentence" },
        ],
        earliestFiling: { anchor: "sentenceCompletedDate", years: 3 },
        referral: null,
      },
      {
        id: "IL-sealing",
        name: "Sealing petition",
        ruleId: "IL-CR2",
        authority: { cite: "20 ILCS 2630/5.5 (sealing) — illustrative [verify]", url: "https://www.illinoiscourts.gov/" },
        filingGuidance: {
          steps: [
            "Obtain a certified rap sheet listing all convictions (illustrative).",
            "Confirm the conviction-count cap before filing.",
            "File the sealing petition with the circuit clerk and serve required parties.",
            "Calendar the objection window and any hearing date.",
          ],
          forms: ["Sealing petition (illustrative form name — verify locally)", "Fingerprint card receipt (illustrative)"],
          feeWaiverNote: "A fee-waiver application is available from the circuit clerk (illustrative — verify locally).",
        },
        prerequisites: [
          { id: "IL-CR2-a", kind: "noPendingCases", label: "No pending cases" },
          { id: "IL-CR2-b", kind: "convictionCountMax", max: 2, label: "At most 2 qualifying convictions" },
          { id: "IL-CR2-c", kind: "waitingPeriod", years: 3, anchor: "sentenceCompletedDate", label: "3 years since sentence completion" },
        ],
        earliestFiling: { anchor: "sentenceCompletedDate", years: 3 },
        filingWindow: { closeYearsAfterEarliest: null },
        referral: null,
      },
    ],
  },
  NY: {
    id: "NY",
    name: "New York (example ruleset)",
    version: "2026-11-example",
    reliefTypes: [
      {
        id: "NY-sealing-160.58-style",
        name: "Record sealing petition (illustrative)",
        ruleId: "NY-CR1",
        authority: { cite: "NY CPL § 160.58 (sealing) — illustrative [verify]", url: "https://www.nycourts.gov/" },
        filingGuidance: {
          steps: [
            "Obtain certified dispositions and proof of sentence completion (illustrative).",
            "Draft the relief-interest statement with counsel (discretionary relief).",
            "File the sealing motion with the court and serve the prosecutor.",
            "Attend the hearing if scheduled.",
          ],
          forms: ["Sealing motion + affidavit (illustrative — verify locally)", "Relief-interest statement (illustrative)"],
          feeWaiverNote: "A poor-person order (fee waiver) may be requested with the motion (illustrative — verify).",
        },
        prerequisites: [
          { id: "NY-CR1-a", kind: "noPendingCases", label: "No pending cases" },
          { id: "NY-CR1-b", kind: "convictionCountMax", max: 2, label: "No more than 2 convictions overall (illustrative)" },
          { id: "NY-CR1-c", kind: "waitingPeriod", years: 10, anchor: "sentenceCompletedDate", label: "10 years since sentence completion or release" },
          { id: "NY-CR1-d", kind: "finesPaid", label: "All fines and fees paid" },
        ],
        earliestFiling: { anchor: "sentenceCompletedDate", years: 10 },
        referral: "Sealing petitions are discretionary — refer to counsel for the relief-interest statement.",
      },
      {
        id: "NY-cert-relief",
        name: "Certificate of Relief from Disabilities",
        ruleId: "NY-CR2",
        authority: { cite: "NY Correct. Law § 700 (certificate of relief) — illustrative [verify]", url: "https://www.nycourts.gov/" },
        filingGuidance: {
          steps: [
            "Confirm the sentence and probation conditions are fully satisfied (illustrative).",
            "File the application with the court or probation department as locally required.",
            "Serve the prosecutor and attend any scheduled appearance.",
          ],
          forms: ["Certificate of Relief application (illustrative — verify locally)"],
          feeWaiverNote: "No filing fee in this example ruleset (illustrative — verify locally).",
        },
        prerequisites: [
          { id: "NY-CR2-a", kind: "noPendingCases", label: "No pending cases" },
          { id: "NY-CR2-b", kind: "probationCompleted", label: "Sentence/probation conditions satisfied" },
        ],
        earliestFiling: { anchor: "dispositionDate", years: 0 },
        referral: "First-offender certificates may issue at sentencing — coordinate with counsel.",
      },
    ],
  },
  TX: {
    id: "TX",
    name: "Texas (guidance tier — example)",
    version: "2026-11-example",
    tier: "guidance",
    guidanceNote:
      "Guidance tier: no example relief rules loaded for this jurisdiction yet. " +
      "The screen below performs generic checks only and makes no eligibility " +
      "determination — every item carries a mandatory referral to counsel or a " +
      "legal aid clinic.",
    reliefTypes: [
      {
        id: "TX-generic-screen",
        name: "Generic clearance screen (guidance tier)",
        ruleId: "TX-G1",
        authority: { cite: "Guidance tier — no jurisdiction rules loaded; verify with counsel [verify]", url: "https://www.lawhelp.org/" },
        prerequisites: [
          { id: "TX-G1-a", kind: "noPendingCases", label: "No pending criminal cases" },
          { id: "TX-G1-b", kind: "rapSheetObtained", label: "Certified rap sheet obtained for screening" },
        ],
        referral: "Guidance tier: refer to counsel or a legal aid clinic for this jurisdiction's current clearance remedies.",
      },
    ],
  },
};

/** Load a ruleset by id; null when unknown (never a fallback guess).
 * @param {string} id @returns {Object|null} */
export function getRuleset(id) {
  return JURISDICTION_RULES[id] ?? null;
}

/** The gate attached to every report.
 * @type {{required:boolean, message:string}} */
export const GATE = {
  required: true,
  message:
    "Example rulesets only. Prerequisites marked unknown need court records " +
    "before any determination; verify everything with counsel or a legal aid " +
    "clinic before filing.",
};

/* ---------- prerequisite evaluation ---------- */

/**
 * Evaluate one prerequisite against client + conviction facts.
 * Returns met | not_met | unknown — unknown when the data is missing (never guessed).
 * @param {Object} prereq
 * @param {Object} client
 * @param {Object} conviction
 * @param {number} totalConvictions
 * @param {Date|null} asOf screening date for waiting-period math
 * @returns {{status:'met'|'not_met'|'unknown', detail:string, date?:string|null}}
 */
export function evalPrereq(prereq, client, conviction, totalConvictions, asOf) {
  switch (prereq.kind) {
    case "probationCompleted": {
      const own = conviction?.probationStatus;
      const v = own ?? client?.probationStatus; // conviction-level fact overrides client-level
      if (v == null) return { status: "unknown", detail: "client.probationStatus not provided" };
      const met = v === "completed" || v === "terminated";
      return { status: met ? "met" : "not_met", detail: `probationStatus = ${v}${own != null ? " (conviction-level override)" : ""}` };
    }
    case "finesPaid": {
      const own = conviction?.finesPaid;
      const v = own ?? client?.finesPaid; // conviction-level fact overrides client-level
      if (v == null) return { status: "unknown", detail: "client.finesPaid not provided" };
      return { status: v ? "met" : "not_met", detail: `finesPaid = ${v}${own != null ? " (conviction-level override)" : ""}` };
    }
    case "noPendingCases": {
      const v = client?.pendingCases;
      if (v == null) return { status: "unknown", detail: "client.pendingCases not provided" };
      return { status: v ? "not_met" : "met", detail: `pendingCases = ${v}` };
    }
    case "rapSheetObtained": {
      const v = client?.rapSheetObtained;
      if (v == null) return { status: "unknown", detail: "client.rapSheetObtained not provided" };
      return { status: v ? "met" : "not_met", detail: `rapSheetObtained = ${v}` };
    }
    case "offenseNotIn": {
      if (conviction?.offenseCategory && prereq.categories?.includes(conviction.offenseCategory)) {
        return { status: "not_met", detail: `offenseCategory "${conviction.offenseCategory}" is excluded from this relief` };
      }
      if (conviction?.offenseClass && prereq.classes?.includes(conviction.offenseClass)) {
        return { status: "not_met", detail: `offenseClass "${conviction.offenseClass}" is excluded from this relief` };
      }
      if (!conviction?.offenseCategory && !conviction?.offenseClass) {
        return { status: "unknown", detail: "conviction has no offenseCategory/offenseClass to test against exclusions" };
      }
      return { status: "met", detail: `category/class not in exclusion list` };
    }
    case "convictionCountMax": {
      if (typeof totalConvictions !== "number") return { status: "unknown", detail: "conviction count unknown" };
      const met = totalConvictions <= prereq.max;
      return { status: met ? "met" : "not_met", detail: `${totalConvictions} conviction(s); cap ${prereq.max}` };
    }
    case "waitingPeriod": {
      const anchor = parseDate(conviction?.[prereq.anchor]);
      if (!anchor) return { status: "unknown", detail: `${prereq.anchor} missing/unparseable`, date: null };
      const done = addYears(anchor, prereq.years);
      const met = asOf && yearsElapsed(anchor, asOf) >= prereq.years;
      return {
        status: met ? "met" : "not_met",
        detail: `${prereq.years} years from ${fmtDate(anchor)}; satisfied ${fmtDate(done)}`,
        date: fmtDate(done),
      };
    }
    default:
      return { status: "unknown", detail: `unknown prerequisite kind "${prereq.kind}" (ruleset error)` };
  }
}

/* ---------- filing math ---------- */

/**
 * Compute earliest and (when the rule defines a window) last filing dates.
 * @param {Object} relief relief type rule
 * @param {Object} conviction
 * @returns {{earliestFilingDate:string|null, lastFilingDate:string|null, anchorMissing:boolean}}
 */
export function filingDates(relief, conviction) {
  if (!relief?.earliestFiling) {
    // guidance-tier relief types carry no filing math — surfaced as unknown, never guessed
    return { earliestFilingDate: null, lastFilingDate: null, anchorMissing: true };
  }
  const anchor = parseDate(conviction?.[relief.earliestFiling.anchor]);
  if (!anchor) return { earliestFilingDate: null, lastFilingDate: null, anchorMissing: true };
  const earliest = addYears(anchor, relief.earliestFiling.years);
  let last = null;
  if (relief.filingWindow?.closeYearsAfterEarliest != null) {
    last = addYears(earliest, relief.filingWindow.closeYearsAfterEarliest);
  }
  return { earliestFilingDate: fmtDate(earliest), lastFilingDate: fmtDate(last), anchorMissing: false };
}

/* ---------- engine ---------- */

/**
 * @typedef {Object} ClearanceInput
 * @property {string} jurisdiction
 * @property {string} asOf
 * @property {Object} client  { probationStatus, finesPaid, pendingCases, rapSheetObtained }
 * @property {Array} convictions  [{ id, offense, offenseCategory, offenseClass, dispositionDate,
 *                                   sentenceCompletedDate, probationTerminatedDate }]
 * @property {Array} [filings]  [{ reliefTypeId, convictionId, date, status: filed|granted|denied }]
 */

/**
 * Run the tracker.
 * @param {ClearanceInput} input
 * @returns {Object} report
 */
export function trackClearance(input) {
  const asOf = parseDate(input?.asOf);
  const rules = input?.jurisdiction ? getRuleset(input.jurisdiction) : null;
  /** @type {any[]} */
  const items = [];
  const report = {
    asOf: input?.asOf ?? null,
    jurisdiction: input?.jurisdiction ?? null,
    ruleset: rules ? { id: rules.id, name: rules.name, version: rules.version } : null,
    coverageTier: rules ? (rules.tier ?? "full") : null,
    ...(rules?.tier === "guidance" ? { guidanceNote: rules.guidanceNote } : {}),
    items,
    summary: { total: 0, ready_to_file: 0, waiting: 0, blocked: 0, data_needed: 0, filed: 0, granted: 0, denied: 0 },
    referrals: [],
    gate: GATE,
  };
  if (!rules) {
    report.errors = [`unknown jurisdiction "${input?.jurisdiction}" — no ruleset loaded (add one in rules-as-data)`];
    return report;
  }
  if (!asOf) {
    report.errors = ["asOf missing or unparseable (YYYY-MM-DD)"];
    return report;
  }
  const client = input.client ?? {};
  const convictions = input.convictions ?? [];
  const filings = input.filings ?? [];
  for (const relief of rules.reliefTypes) {
    const guidanceTier = rules.tier === "guidance"; // referral mandatory on every item, not just actionable ones
    for (const c of convictions) {
      const checklist = relief.prerequisites.map((p) => ({
        id: p.id, label: p.label ?? p.kind, ruleId: relief.ruleId,
        ...evalPrereq(p, client, c, convictions.length, asOf),
      }));
      const filing = filings.find(
        (f) => f.reliefTypeId === relief.id && f.convictionId === c.id,
      );
      const fd = filingDates(relief, c);
      let status;
      if (filing) {
        status = filing.status; // filed | granted | denied (tracked, not recomputed)
      } else if (checklist.some((k) => k.status === "not_met")) {
        const blockingWait = checklist.find((k) => k.status === "not_met" && k.date != null && parseDate(k.date) > asOf);
        status = blockingWait ? "waiting" : "blocked";
      } else if (checklist.some((k) => k.status === "unknown")) {
        status = "data_needed";
      } else {
        status = "ready_to_file";
      }
      const item = {
        convictionId: c.id,
        offense: c.offense ?? "(unspecified)",
        reliefTypeId: relief.id,
        reliefName: relief.name,
        ruleId: relief.ruleId,
        checklist,
        filing: filing ?? null,
        filingGuidance: relief.filingGuidance ?? null,
        authority: relief.authority ?? null,
        earliestFilingDate: fd.earliestFilingDate,
        lastFilingDate: fd.lastFilingDate,
        status,
        referral: relief.referral,
      };
      items.push(item);
      if (relief.referral && (guidanceTier || status === "ready_to_file" || status === "waiting")) {
        report.referrals.push({ reliefTypeId: relief.id, convictionId: c.id, note: relief.referral });
      }
    }
  }
  report.summary.total = items.length;
  for (const it of items) {
    const key = it.status === "waiting" ? "waiting" : it.status;
    if (report.summary[key] != null) report.summary[key] += 1;
  }
  return report;
}

/* ---------- intake normalization (LLM boundary) ---------- */

/** Client keys accepted in the normalized ClearanceInput (spec prompt schema). */
const CLIENT_KEYS = ["id", "name", "probationStatus", "finesPaid", "pendingCases", "rapSheetObtained"];
/** Conviction keys accepted in the normalized ClearanceInput. */
const CONVICTION_KEYS = ["id", "offense", "offenseCategory", "offenseClass", "dispositionDate",
  "sentenceCompletedDate", "probationTerminatedDate", "probationStatus", "finesPaid"];

/**
 * Normalize LLM-structured intake (the spec's "Prompt schema for the LLM
 * part") into a ClearanceInput. Fields listed in `uncertain` are dropped
 * from the client AND from every conviction, and logged as issues — the
 * engine then turns the gap into `unknown` checklist rows instead of
 * trusting a guess. Unknown keys are normalized away; convictions missing
 * an id get sequential ids (C1, C2, …) and are flagged.
 * @param {Object} llm @returns {{input:Object, issues:string[]}}
 */
export function validateIntake(llm) {
  const issues = [];
  const raw = llm ?? {};
  const pick = (obj, keys) =>
    Object.fromEntries(keys.filter((k) => obj?.[k] !== undefined).map((k) => [k, obj[k]]));
  const client = pick(raw.client, CLIENT_KEYS);
  const convictions = (Array.isArray(raw.convictions) ? raw.convictions : []).map((c, i) => {
    const norm = pick(c, CONVICTION_KEYS);
    if (!norm.id) {
      norm.id = `C${i + 1}`;
      issues.push(`conviction ${i + 1} missing id — assigned "${norm.id}"`);
    }
    return norm;
  });
  for (const u of Array.isArray(raw.uncertain) ? raw.uncertain : []) {
    if (!u || typeof u.field !== "string") continue;
    const why = u.reason ? ` — ${u.reason}` : "";
    if (!CLIENT_KEYS.includes(u.field) && !CONVICTION_KEYS.includes(u.field)) {
      issues.push(`uncertain: unrecognized field "${u.field}" ignored${why}`);
      continue;
    }
    if (u.field in client) {
      delete client[u.field];
      issues.push(`uncertain: client.${u.field} dropped${why}`);
    }
    for (const c of convictions) {
      if (u.field in c) {
        delete c[u.field];
        issues.push(`uncertain: conviction ${c.id}.${u.field} dropped${why}`);
      } else {
        issues.push(`uncertain: conviction ${c.id}.${u.field} treated as unknown (client value not inherited)${why}`);
      }
    }
  }
  return {
    input: {
      jurisdiction: typeof raw.jurisdiction === "string" ? raw.jurisdiction : null,
      asOf: typeof raw.asOf === "string" ? raw.asOf : null,
      client,
      convictions,
      filings: Array.isArray(raw.filings) ? raw.filings : [],
    },
    issues,
  };
}

/** Markdown tracker report.
 * @param {ReturnType<trackClearance>} report
 * @returns {string} */
export function renderReport(report) {
  const L = [];
  L.push(`# Record clearance tracker — ${report.ruleset ? report.ruleset.name : "unknown jurisdiction"}`);
  L.push("");
  L.push(`As of **${report.asOf ?? "?"}** · ruleset ${report.ruleset ? `${report.ruleset.id} v${report.ruleset.version}` : "—"}`);
  L.push("");
  if (report.guidanceNote) {
    L.push(`> 🧭 ${report.guidanceNote}`);
    L.push("");
  }
  if (report.errors?.length) {
    for (const e of report.errors) L.push(`- ⚠️ ${e}`);
    L.push("");
  }
  for (const it of report.items) {
    L.push(`## ${it.reliefName} — ${it.offense} (${it.convictionId}) · ${it.status.toUpperCase()}`);
    L.push("");
    const mark = { met: "[x]", not_met: "[ ]", unknown: "[?]" };
    for (const k of it.checklist) L.push(`- ${mark[k.status] ?? "[?]"} ${k.label} — ${k.detail} \`${k.ruleId}\``);
    L.push(`- Earliest filing: **${it.earliestFilingDate ?? "unknown (missing anchor date)"}**` +
      (it.lastFilingDate ? ` · last: **${it.lastFilingDate}**` : ""));
    if (it.filingGuidance) {
      L.push(`- Forms: ${it.filingGuidance.forms.join(" · ")}`);
      it.filingGuidance.steps.forEach((s, n) => L.push(`  ${n + 1}. ${s}`));
      L.push(`- Fee waiver: ${it.filingGuidance.feeWaiverNote}`);
    }
    if (it.authority) L.push(`- Authority: ${it.authority.cite} — ${it.authority.url}`);
    if (it.filing) L.push(`- Filed ${it.filing.date} — status: **${it.filing.status}**`);
    if (it.referral) L.push(`- Referral: ${it.referral}`);
    L.push("");
  }
  if (report.referrals.length) {
    L.push(`## Referral flags (${report.referrals.length})`);
    for (const r of report.referrals) L.push(`- ${r.reliefTypeId} for ${r.convictionId}: ${r.note}`);
    L.push("");
  }
  L.push("---");
  L.push(`> ⚠️ ${report.gate.message}`);
  return L.join("\n") + "\n";
}
