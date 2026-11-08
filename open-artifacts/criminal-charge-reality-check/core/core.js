/**
 * criminal-charge-reality-check — deterministic core.
 *
 * Charge facts in → typical process timeline stages (arraignment →
 * discovery → motions → trial windows, day counts from rules-as-data,
 * configurable), likely-outcome bands per charge class, and a
 * what-affects-the-range factors list. Outcome bands are STATISTICAL
 * HEURISTICS from illustrative example data — not predictions, not legal
 * advice — and every output carries that disclaimer structurally.
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

/** Add days.
 * @param {Date} dt @param {number} days @returns {Date} */
export function addDays(dt, days) {
  return new Date(dt.getTime() + days * 86400000);
}

/* ---------- rules-as-data (illustrative, editable) ---------- */

/**
 * Example US jurisdiction rulesets. All numbers are ILLUSTRATIVE defaults
 * with no empirical claim — maintainers replace them with published,
 * cited court-data statistics (and record the source + date per band).
 * @type {Record<string, Object>}
 */
export const JURISDICTION_RULES = {
  NY: {
    id: "NY",
    name: "New York (example ruleset)",
    version: "2026-11-example",
    stageDayOffsets: {
      // day offsets from filing (min / typical / max) — configurable data
      arraignment: { min: 0, typical: 1, max: 5 },
      discovery: { min: 30, typical: 45, max: 90 },
      motions: { min: 60, typical: 120, max: 180 },
      trial: { min: 180, typical: 270, max: 365 },
    },
    sentencingRanges: {
      violation: { minMonths: 0, maxMonths: 0.5, ruleId: "NY-SR-V" },
      misdemeanor: { minMonths: 0, maxMonths: 12, ruleId: "NY-SR-M" },
      felony_class_E: { minMonths: 0, maxMonths: 48, ruleId: "NY-SR-E" },
      felony_class_D: { minMonths: 0, maxMonths: 84, ruleId: "NY-SR-D" },
      felony_class_C: { minMonths: 0, maxMonths: 180, ruleId: "NY-SR-C" },
      felony_class_B: { minMonths: 1, maxMonths: 300, ruleId: "NY-SR-B" },
    },
    releasePlaybook: {
      ruleId: "NY-RP-1",
      note: "Illustrative advocacy sequence — not advice; verify every motion against current local rules.",
      steps: [
        { step: "Custody interview: community ties, employment, family, treatment needs", motion: null, dayOffset: 0 },
        { step: "File written release application with a ties package", motion: "release application", dayOffset: 1 },
        { step: "Move for supervised release or non-monetary conditions", motion: "conditions motion", dayOffset: 3 },
        { step: "Request a source-of-funds hearing (fictional example procedure)", motion: "source hearing", dayOffset: 7 },
        { step: "Move for release review on changed circumstances", motion: "review motion", dayOffset: 14 },
      ],
    },
    outcomeBands: {
      // illustrative % of comparable fictional cohorts — NOT court data
      violation: { bandSource: { kind: "illustrative" }, dismissal: [15, 30], plea_conviction: [55, 75], trial_conviction: [3, 10], acquittal: [2, 8] },
      misdemeanor: { bandSource: { kind: "illustrative" }, dismissal: [10, 25], plea_conviction: [60, 78], trial_conviction: [5, 12], acquittal: [2, 6] },
      felony_class_E: { bandSource: { kind: "illustrative" }, dismissal: [8, 20], plea_conviction: [62, 80], trial_conviction: [6, 14], acquittal: [2, 5] },
      felony_class_D: { bandSource: { kind: "illustrative" }, dismissal: [6, 18], plea_conviction: [65, 82], trial_conviction: [7, 15], acquittal: [1, 5] },
      felony_class_C: { bandSource: { kind: "illustrative" }, dismissal: [5, 15], plea_conviction: [68, 84], trial_conviction: [8, 16], acquittal: [1, 4] },
      felony_class_B: { bandSource: { kind: "illustrative" }, dismissal: [4, 12], plea_conviction: [70, 86], trial_conviction: [9, 18], acquittal: [1, 3] },
    },
    factors: [
      { id: "NY-F1", label: "Detention status", direction: "worsens", note: "Pretrial detention correlates with higher plea rates and faster timelines in published research.",
        when: [
          { field: "detained", equals: true, basis: "client.detained = true" },
          { field: "detained", equals: false, basis: "client.detained = false (factor may run the other way)" },
        ] },
      { id: "NY-F2", label: "Prior convictions", direction: "worsens", note: "Prior record typically raises plea terms and lowers dismissal likelihood.",
        when: [{ field: "priorConvictions", gt: 0, basis: "client.priorConvictions = {value}" }] },
      { id: "NY-F3", label: "Counsel at arraignment", direction: "improves", note: "Early representation correlates with better bail and discovery outcomes.",
        when: [{ field: "counselAtArraignment", equals: true, basis: "client.counselAtArraignment = true" }] },
      { id: "NY-F4", label: "Weak or circumstantial evidence", direction: "improves", note: "Proof problems raise dismissal and suppression prospects.",
        when: [{ field: "evidenceIssues", equals: true, basis: "client.evidenceIssues = true" }] },
    ],
  },
  PA: {
    id: "PA",
    name: "Pennsylvania (example ruleset)",
    version: "2026-11-example",
    stageDayOffsets: {
      arraignment: { min: 0, typical: 3, max: 10 },
      discovery: { min: 30, typical: 60, max: 120 },
      motions: { min: 90, typical: 150, max: 240 },
      trial: { min: 200, typical: 320, max: 450 },
    },
    sentencingRanges: {
      misdemeanor: { minMonths: 0, maxMonths: 24, ruleId: "PA-SR-M" },
      felony_class_3: { minMonths: 0, maxMonths: 84, ruleId: "PA-SR-3" },
      felony_class_2: { minMonths: 3, maxMonths: 120, ruleId: "PA-SR-2" },
      felony_class_1: { minMonths: 12, maxMonths: 240, ruleId: "PA-SR-1" },
    },
    releasePlaybook: {
      ruleId: "PA-RP-1",
      note: "Illustrative advocacy sequence — not advice; verify every motion against current local rules.",
      steps: [
        { step: "Custody interview and preliminary-arrangement prep", motion: null, dayOffset: 0 },
        { step: "Present a non-monetary release proposal at arraignment", motion: "release proposal", dayOffset: 0 },
        { step: "File a bail-modification motion with the ties package", motion: "modification motion", dayOffset: 5 },
        { step: "Seek a diversion-screen referral while the motion is pending", motion: "diversion referral", dayOffset: 10 },
        { step: "Move for review on changed circumstances", motion: "review motion", dayOffset: 21 },
      ],
    },
    outcomeBands: {
      misdemeanor: { bandSource: { kind: "illustrative" }, dismissal: [12, 28], plea_conviction: [58, 76], trial_conviction: [5, 12], acquittal: [2, 7] },
      felony_class_3: { bandSource: { kind: "illustrative" }, dismissal: [8, 20], plea_conviction: [63, 81], trial_conviction: [7, 14], acquittal: [1, 5] },
      felony_class_2: { bandSource: { kind: "illustrative" }, dismissal: [6, 16], plea_conviction: [66, 83], trial_conviction: [8, 16], acquittal: [1, 4] },
      felony_class_1: { bandSource: { kind: "illustrative" }, dismissal: [5, 13], plea_conviction: [69, 85], trial_conviction: [9, 18], acquittal: [1, 3] },
    },
    factors: [
      { id: "PA-F1", label: "Diversion program eligibility", direction: "improves", note: "First-time defendants may route to diversion, changing the timeline entirely.",
        when: [{ field: "diversionEligible", equals: true, basis: "client.diversionEligible = true" }] },
      { id: "PA-F2", label: "Prior convictions", direction: "worsens", note: "Prior record score raises sentencing ranges.",
        when: [{ field: "priorConvictions", gt: 0, basis: "client.priorConvictions = {value}" }] },
      { id: "PA-F3", label: "Detention status", direction: "worsens", note: "Detained defendants resolve cases faster, often less favorably.",
        when: [
          { field: "detained", equals: true, basis: "client.detained = true" },
          { field: "detained", equals: false, basis: "client.detained = false (factor may run the other way)" },
        ] },
    ],
  },
  OH: {
    id: "OH",
    name: "Ohio (example ruleset)",
    version: "2026-11-example",
    stageDayOffsets: {
      arraignment: { min: 0, typical: 2, max: 7 },
      discovery: { min: 28, typical: 50, max: 100 },
      motions: { min: 70, typical: 130, max: 200 },
      trial: { min: 190, typical: 290, max: 400 },
    },
    sentencingRanges: {
      misdemeanor: { minMonths: 0, maxMonths: 12, ruleId: "OH-SR-M" },
      felony_class_5: { minMonths: 0, maxMonths: 12, ruleId: "OH-SR-5" },
      felony_class_4: { minMonths: 0, maxMonths: 18, ruleId: "OH-SR-4" },
      felony_class_3: { minMonths: 0, maxMonths: 36, ruleId: "OH-SR-3" },
    },
    releasePlaybook: {
      ruleId: "OH-RP-1",
      note: "Illustrative advocacy sequence — not advice; verify every motion against current local rules.",
      steps: [
        { step: "Custody interview: ties, employment, and treatment needs", motion: null, dayOffset: 0 },
        { step: "Argue for personal recognizance at arraignment", motion: "recognizance argument", dayOffset: 0 },
        { step: "File a bond-reduction motion with the ties package", motion: "bond-reduction motion", dayOffset: 4 },
        { step: "Request intervention-in-lieu screening (fictional example procedure)", motion: "intervention screening", dayOffset: 12 },
        { step: "Move for review on changed circumstances", motion: "review motion", dayOffset: 18 },
      ],
    },
    outcomeBands: {
      misdemeanor: { bandSource: { kind: "illustrative" }, dismissal: [14, 30], plea_conviction: [56, 74], trial_conviction: [4, 11], acquittal: [2, 8] },
      felony_class_5: { bandSource: { kind: "illustrative" }, dismissal: [10, 24], plea_conviction: [60, 78], trial_conviction: [5, 12], acquittal: [2, 6] },
      felony_class_4: { bandSource: { kind: "illustrative" }, dismissal: [8, 20], plea_conviction: [63, 80], trial_conviction: [6, 13], acquittal: [1, 5] },
      felony_class_3: { bandSource: { kind: "illustrative" }, dismissal: [6, 17], plea_conviction: [66, 82], trial_conviction: [7, 15], acquittal: [1, 4] },
    },
    factors: [
      { id: "OH-F1", label: "Intervention in lieu of conviction", direction: "improves", note: "Eligible defendants may avoid conviction entirely.",
        when: [{ field: "diversionEligible", equals: true, basis: "client.diversionEligible = true" }] },
      { id: "OH-F2", label: "Prior convictions", direction: "worsens", note: "Repeat-offender enhancements narrow the favorable band.",
        when: [{ field: "priorConvictions", gt: 0, basis: "client.priorConvictions = {value}" }] },
      { id: "OH-F3", label: "Detention status", direction: "worsens", note: "Detention pressure tends to accelerate pleas.",
        when: [
          { field: "detained", equals: true, basis: "client.detained = true" },
          { field: "detained", equals: false, basis: "client.detained = false (factor may run the other way)" },
        ] },
    ],
  },
};

/**
 * FICTIONAL charge-code map for the NY example ruleset. Codes use the made-up
 * "XPL-" prefix with 9xx article numbers that exist in no real penal law —
 * deliberately unmistakably fictional. Real-looking codes are never resolved.
 * @type {Record<string, Object>}
 */
export const CHARGE_CODES = {
  "XPL-901.10": { chargeClass: "misdemeanor", label: "Fictional petty offense (XPL-901.10)" },
  "XPL-910.40": { chargeClass: "felony_class_E", label: "Fictional stolen-property offense, 5th degree (XPL-910.40)" },
  "XPL-910.45": { chargeClass: "felony_class_D", label: "Fictional stolen-property offense, 4th degree (XPL-910.45)" },
  "XPL-910.90": { chargeClass: "felony_class_C", label: "Fictional stolen-property offense, 3rd degree (XPL-910.90)" },
  "XPL-911.20": { label: "Fictional value-dependent offense (XPL-911.20)", candidates: [
    { chargeClass: "felony_class_D", reason: "value of property exceeds the class-D threshold" },
    { chargeClass: "felony_class_E", reason: "value of property falls below the class-D threshold" },
  ] },
};

/** Resolve a fictional charge code to a class, ambiguous candidates, or unknown.
 * Never guesses: real-looking or unmapped codes come back `unknown`.
 * @param {string} code @returns {{status:"resolved"|"ambiguous"|"unknown", code:string, label?:string, chargeClass?:string, candidates?:Array}} */
export function resolveCharge(code) {
  const hit = typeof code === "string" ? CHARGE_CODES[code.trim()] : undefined;
  if (!hit) return { status: "unknown", code };
  if (Array.isArray(hit.candidates)) {
    return { status: "ambiguous", code, label: hit.label, candidates: hit.candidates.map((c) => ({ ...c })) };
  }
  return { status: "resolved", code, label: hit.label, chargeClass: hit.chargeClass };
}

/** The structural disclaimer attached to EVERY output, without exception.
 * @type {{statisticalHeuristics:boolean, prediction:boolean, legalAdvice:boolean, text:string}} */
export const DISCLAIMER = {
  statisticalHeuristics: true,
  prediction: false,
  legalAdvice: false,
  text:
    "STRONG DISCLAIMER: these are STATISTICAL HEURISTICS from illustrative " +
    "example data — not a prediction of this case's outcome, not legal " +
    "advice, and no substitute for a defense attorney. Bands describe " +
    "typical ranges for comparable fictional cohorts; individual outcomes " +
    "vary enormously. Nothing here should be communicated to a client as " +
    "a likelihood for their case.",
};

/** Load a ruleset by id; null when unknown (never a fallback guess).
 * @param {string} id @returns {Object|null} */
export function getRuleset(id) {
  return JURISDICTION_RULES[id] ?? null;
}

/* ---------- band provenance (structured, machine-checkable) ---------- */

/**
 * Validate a band `bandSource` provenance object.
 * `illustrative` = fictional example data, no empirical claim (and no data
 * source allowed). `cited` = real published statistics — requires an http(s)
 * url and an asOf date; cohort/sample optional but encouraged.
 * @param {Object} bs @returns {{ok:boolean, errors:string[]}} */
export function validateBandSource(bs) {
  const errors = [];
  if (!bs || typeof bs !== "object" || Array.isArray(bs)) {
    errors.push("bandSource must be a structured object, not a string");
  } else if (bs.kind === "illustrative") {
    if (bs.url != null || bs.asOf != null) errors.push('illustrative bandSource must not carry a data source — that would imply an empirical claim');
  } else if (bs.kind === "cited") {
    if (typeof bs.url !== "string" || !/^https:\/\//.test(bs.url)) errors.push("cited bandSource needs an https url");
    if (typeof bs.asOf !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(bs.asOf)) errors.push("cited bandSource needs an asOf date (YYYY-MM-DD)");
  } else {
    errors.push('bandSource.kind must be "illustrative" or "cited"');
  }
  return { ok: errors.length === 0, errors };
}

/** Human-readable provenance line for reports.
 * @param {Object} bs @returns {string} */
export function formatBandSource(bs) {
  const v = validateBandSource(bs);
  if (!v.ok) return `(malformed provenance: ${v.errors.join("; ")})`;
  if (bs.kind === "illustrative") return "illustrative — no empirical claim";
  const bits = [`cited data as of ${bs.asOf}`, bs.url, bs.cohort ? `cohort: ${bs.cohort}` : null, bs.sample != null ? `sample: ${bs.sample}` : null];
  return bits.filter(Boolean).join(" · ");
}

/* ---------- engine ---------- */

/**
 * @typedef {Object} ChargeInput
 * @property {string} jurisdiction
 * @property {string} chargeClass        e.g. "felony_class_D"
 * @property {string} [charge]
 * @property {string} filedOn            filing date "YYYY-MM-DD"
 * @property {{ priorConvictions?:number, detained?:boolean, counselAtArraignment?:boolean,
 *              evidenceIssues?:boolean, diversionEligible?:boolean }} [client]
 * @property {Object} [stageOverrides]   e.g. { trial: { min: 240, typical: 330, max: 420 } }
 */

/**
 * Build the typical process timeline: each stage with min/typical/max day
 * offsets from filing, converted to calendar windows.
 * @param {Object} rules
 * @param {Date} filedOn
 * @param {Object} [stageOverrides]
 * @returns {{stage:string, dayOffset:Object, window:{min:string,typical:string,max:string}}[]}
 */
export function buildTimeline(rules, filedOn, stageOverrides = {}) {
  const stages = [];
  for (const [stage, offsets] of Object.entries(rules.stageDayOffsets)) {
    const o = { ...offsets, ...(stageOverrides[stage] ?? {}) };
    stages.push({
      stage,
      dayOffset: { min: o.min, typical: o.typical, max: o.max },
      window: {
        min: fmtDate(addDays(filedOn, o.min)),
        typical: fmtDate(addDays(filedOn, o.typical)),
        max: fmtDate(addDays(filedOn, o.max)),
      },
    });
  }
  return stages;
}

/**
 * Look up the likely-outcome band for a charge class. Returns null when the
 * class is unknown to the ruleset — never a nearest-class guess.
 * @param {Object} rules
 * @param {string} chargeClass
 * @returns {Object|null}
 */
export function outcomeBand(rules, chargeClass) {
  return rules.outcomeBands[chargeClass] ?? null;
}

/**
 * Which what-affects-the-range factors apply given client facts. Matching is
 * driven ONLY by each factor's explicit `when` rules-as-data (first matching
 * rule wins) — never by factor id or label strings, which broke across
 * jurisdictions (e.g. PA-F1 is diversion, not detention).
 * Each rule: `{ field, equals }` (strict equality) or `{ field, gt }` (number
 * comparison), with a `basis` template where `{value}` is the matched value.
 * @param {Object} rules
 * @param {ChargeInput["client"]} client
 * @returns {Array} factors with `applies` flags
 */
export function applicableFactors(rules, client = {}) {
  return rules.factors.map((f) => {
    let applies = false;
    let basis = "";
    for (const w of f.when ?? []) {
      const v = client[w.field];
      const hit = "gt" in w ? typeof v === "number" && v > w.gt : v === w.equals;
      if (hit) {
        applies = true;
        basis = w.basis.replace("{value}", String(v));
        break;
      }
    }
    return { ...f, applies, basis };
  });
}

/**
 * Build the release playbook for a detained client: each ruleset's steps and
 * motions with day offsets from arraignment, anchored on the arraignment
 * window's typical date, converted to calendar dates. Null when the client is
 * not detained or the ruleset has no playbook — never fabricated.
 * @param {Object} rules @param {Date} filedOn @param {boolean} detained
 * @returns {Object|null}
 */
export function buildReleasePlan(rules, filedOn, detained) {
  if (detained !== true || !rules.releasePlaybook) return null;
  const pb = rules.releasePlaybook;
  const anchor = rules.stageDayOffsets.arraignment.typical;
  const anchoredOn = fmtDate(addDays(filedOn, anchor));
  return {
    applies: true,
    ruleId: pb.ruleId,
    note: pb.note,
    anchoredOn,
    anchorBasis: `arraignment typical date (filing + ${anchor} days)`,
    steps: pb.steps
      .map((s) => ({ step: s.step, motion: s.motion ?? null, dayOffset: s.dayOffset, date: fmtDate(addDays(filedOn, anchor + s.dayOffset)) }))
      .sort((a, b) => a.dayOffset - b.dayOffset),
  };
}

/**
 * Run the reality check.
 * @param {ChargeInput} input
 * @returns {Object} report
 */
export function realityCheck(input) {
  const rules = input?.jurisdiction ? getRuleset(input.jurisdiction) : null;
  const filedOn = parseDate(input?.filedOn);
  const report = {
    jurisdiction: input?.jurisdiction ?? null,
    charge: input?.charge ?? null,
    chargeClass: input?.chargeClass ?? null,
    filedOn: input?.filedOn ?? null,
    ruleset: rules ? { id: rules.id, name: rules.name, version: rules.version } : null,
    timeline: [],
    sentencingRange: null,
    outcomeBands: null,
    factors: [],
    disclaimer: DISCLAIMER,
    errors: [],
  };
  if (!rules) {
    report.errors.push(`unknown jurisdiction "${input?.jurisdiction}" — no ruleset loaded`);
    return report;
  }
  if (!filedOn) {
    report.errors.push("filedOn missing or unparseable (YYYY-MM-DD)");
    return report;
  }
  report.timeline = buildTimeline(rules, filedOn, input.stageOverrides ?? {});
  report.release = buildReleasePlan(rules, filedOn, input.client?.detained === true);
  const sr = rules.sentencingRanges[input.chargeClass] ?? null;
  if (sr) report.sentencingRange = { ...sr };
  else report.errors.push(`chargeClass "${input.chargeClass}" has no sentencing range in the ${rules.id} example ruleset — left unset rather than guessed`);
  const band = outcomeBand(rules, input.chargeClass);
  if (band) report.outcomeBands = band;
  else report.errors.push(`chargeClass "${input.chargeClass}" has no outcome band in the ${rules.id} example ruleset — left unset rather than guessed`);
  report.factors = applicableFactors(rules, input.client ?? {});
  return report;
}

/**
 * Uncertain charge class? Run the core once per candidate and show both —
 * uncertainty is surfaced, never collapsed into one guess. Accepts a
 * `ChargeInput` with an optional `uncertain: [{field:"chargeClass",
 * candidates:[...], reason}]` block; without it, runs once.
 * @param {ChargeInput & {uncertain?:Array}} input
 * @returns {{candidateField:string|null, reason:string|null, reports:{chargeClass:string, report:Object}[]}} */
export function realityCheckMulti(input) {
  const unc = input?.uncertain?.find((u) => u?.field === "chargeClass" && Array.isArray(u.candidates) && u.candidates.length > 0);
  const candidates = unc ? unc.candidates : [input?.chargeClass ?? null];
  return {
    candidateField: unc ? "chargeClass" : null,
    reason: unc?.reason ?? null,
    reports: candidates.map((c) => ({
      chargeClass: c,
      report: realityCheck({ ...input, chargeClass: c, uncertain: undefined }),
    })),
  };
}

/**
 * Plain-language client-facing summary: disclaimer first, ≤200 words, short
 * deterministic sentences assembled only from fields that are actually set.
 * A readability aid, not a validated readability instrument.
 * @param {ReturnType<realityCheck>} report @returns {string} */
export function renderPlainLanguage(report) {
  const S = ["This plain-language summary is not a prediction and is not legal advice."];
  if (!report || !Array.isArray(report.errors)) {
    S.push("No report is available.");
    return S.join(" ");
  }
  if (report.errors.length) {
    S.push("Some information for this case is not available, and the tool leaves it blank rather than guessing.");
  } else {
    const chargeName = report.charge ?? report.chargeClass ?? "this charge";
    S.push(`It describes the charge "${chargeName}" under the example ${report.jurisdiction} ruleset, filed ${report.filedOn}.`);
    const arr = report.timeline?.find((s) => s.stage === "arraignment");
    if (arr) S.push(`Arraignment usually happens between ${arr.window.min} and ${arr.window.max}.`);
    const trial = report.timeline?.find((s) => s.stage === "trial");
    if (trial) S.push(`If the case goes to trial, it would usually start between ${trial.window.min} and ${trial.window.max}.`);
    if (report.sentencingRange) S.push(`The illustrative sentencing range is ${report.sentencingRange.minMonths} to ${report.sentencingRange.maxMonths} months.`);
    if (report.release) S.push(`Because the client is held in custody, an example release plan lists ${report.release.steps.length} advocacy steps starting ${report.release.steps[0].date}.`);
  }
  S.push("The numbers are example figures, not real court statistics.");
  S.push("Talk to a defense attorney about what this means for this case.");
  return S.join(" ");
}

/** Markdown report with the disclaimer rendered prominently.
 * @param {ReturnType<realityCheck>} report
 * @returns {string} */
export function renderReport(report) {
  const L = [];
  L.push(`# Charge reality check — ${report.charge ?? report.chargeClass ?? "?"} (${report.jurisdiction ?? "?"})`);
  L.push("");
  L.push(`Filed **${report.filedOn ?? "?"}** · ruleset ${report.ruleset ? `${report.ruleset.id} v${report.ruleset.version}` : "—"}`);
  L.push("");
  L.push(`> ⚠️ **${report.disclaimer.text.split(". ")[0]}.** ${report.disclaimer.text.split(". ").slice(1).join(". ")}`);
  L.push("");
  if (report.errors.length) {
    L.push("## Unset (never guessed)");
    for (const e of report.errors) L.push(`- ${e}`);
    L.push("");
  }
  if (report.timeline.length) {
    L.push("## Typical process timeline (days from filing, configurable data)");
    L.push("");
    L.push("| Stage | Earliest | Typical | Latest |");
    L.push("|---|---|---|---|");
    for (const s of report.timeline) {
      L.push(`| ${s.stage} (day ${s.dayOffset.min}–${s.dayOffset.max}, typical ${s.dayOffset.typical}) | ${s.window.min} | ${s.window.typical} | ${s.window.max} |`);
    }
    L.push("");
  }
  if (report.release) {
    L.push(`## Release playbook (client detained — illustrative advocacy steps, not advice)`);
    L.push("");
    L.push(`Anchored on the ${report.release.anchorBasis} = **${report.release.anchoredOn}** · playbook \`${report.release.ruleId}\``);
    L.push("");
    L.push("| Day | Step | Motion | Target date |");
    L.push("|---:|---|---|---|");
    for (const s of report.release.steps) {
      L.push(`| +${s.dayOffset} | ${s.step} | ${s.motion ?? "—"} | ${s.date} |`);
    }
    L.push("");
  }
  if (report.sentencingRange) {
    L.push(`## Illustrative sentencing range\n\n${report.sentencingRange.minMonths}–${report.sentencingRange.maxMonths} months \`${report.sentencingRange.ruleId}\``);
    L.push("");
  }
  if (report.outcomeBands) {
    L.push(`## Likely-outcome bands (${formatBandSource(report.outcomeBands.bandSource)} — heuristics, NOT predictions)`);
    L.push("");
    L.push("| Outcome | Band |");
    L.push("|---|---:|");
    for (const k of ["dismissal", "plea_conviction", "trial_conviction", "acquittal"]) {
      if (report.outcomeBands[k]) L.push(`| ${k.replace(/_/g, " ")} | ${report.outcomeBands[k][0]}–${report.outcomeBands[k][1]}% |`);
    }
    L.push("");
  }
  if (report.factors.length) {
    L.push("## What affects the range");
    for (const f of report.factors) {
      L.push(`- ${f.applies ? "**" : ""}${f.label}${f.applies ? "**" : ""} (${f.direction}) — ${f.note}${f.basis ? ` _[${f.basis}]_` : ""}`);
    }
    L.push("");
  }
  L.push("---");
  L.push(`> ⚠️ ${report.disclaimer.text}`);
  return L.join("\n") + "\n";
}
