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
    outcomeBands: {
      // illustrative % of comparable fictional cohorts — NOT court data
      violation: { bandSource: "illustrative", dismissal: [15, 30], plea_conviction: [55, 75], trial_conviction: [3, 10], acquittal: [2, 8] },
      misdemeanor: { bandSource: "illustrative", dismissal: [10, 25], plea_conviction: [60, 78], trial_conviction: [5, 12], acquittal: [2, 6] },
      felony_class_E: { bandSource: "illustrative", dismissal: [8, 20], plea_conviction: [62, 80], trial_conviction: [6, 14], acquittal: [2, 5] },
      felony_class_D: { bandSource: "illustrative", dismissal: [6, 18], plea_conviction: [65, 82], trial_conviction: [7, 15], acquittal: [1, 5] },
      felony_class_C: { bandSource: "illustrative", dismissal: [5, 15], plea_conviction: [68, 84], trial_conviction: [8, 16], acquittal: [1, 4] },
      felony_class_B: { bandSource: "illustrative", dismissal: [4, 12], plea_conviction: [70, 86], trial_conviction: [9, 18], acquittal: [1, 3] },
    },
    factors: [
      { id: "NY-F1", label: "Detention status", direction: "worsens", note: "Pretrial detention correlates with higher plea rates and faster timelines in published research." },
      { id: "NY-F2", label: "Prior convictions", direction: "worsens", note: "Prior record typically raises plea terms and lowers dismissal likelihood." },
      { id: "NY-F3", label: "Counsel at arraignment", direction: "improves", note: "Early representation correlates with better bail and discovery outcomes." },
      { id: "NY-F4", label: "Weak or circumstantial evidence", direction: "improves", note: "Proof problems raise dismissal and suppression prospects." },
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
    outcomeBands: {
      misdemeanor: { bandSource: "illustrative", dismissal: [12, 28], plea_conviction: [58, 76], trial_conviction: [5, 12], acquittal: [2, 7] },
      felony_class_3: { bandSource: "illustrative", dismissal: [8, 20], plea_conviction: [63, 81], trial_conviction: [7, 14], acquittal: [1, 5] },
      felony_class_2: { bandSource: "illustrative", dismissal: [6, 16], plea_conviction: [66, 83], trial_conviction: [8, 16], acquittal: [1, 4] },
      felony_class_1: { bandSource: "illustrative", dismissal: [5, 13], plea_conviction: [69, 85], trial_conviction: [9, 18], acquittal: [1, 3] },
    },
    factors: [
      { id: "PA-F1", label: "Diversion program eligibility", direction: "improves", note: "First-time defendants may route to diversion, changing the timeline entirely." },
      { id: "PA-F2", label: "Prior convictions", direction: "worsens", note: "Prior record score raises sentencing ranges." },
      { id: "PA-F3", label: "Detention status", direction: "worsens", note: "Detained defendants resolve cases faster, often less favorably." },
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
    outcomeBands: {
      misdemeanor: { bandSource: "illustrative", dismissal: [14, 30], plea_conviction: [56, 74], trial_conviction: [4, 11], acquittal: [2, 8] },
      felony_class_5: { bandSource: "illustrative", dismissal: [10, 24], plea_conviction: [60, 78], trial_conviction: [5, 12], acquittal: [2, 6] },
      felony_class_4: { bandSource: "illustrative", dismissal: [8, 20], plea_conviction: [63, 80], trial_conviction: [6, 13], acquittal: [1, 5] },
      felony_class_3: { bandSource: "illustrative", dismissal: [6, 17], plea_conviction: [66, 82], trial_conviction: [7, 15], acquittal: [1, 4] },
    },
    factors: [
      { id: "OH-F1", label: "Intervention in lieu of conviction", direction: "improves", note: "Eligible defendants may avoid conviction entirely." },
      { id: "OH-F2", label: "Prior convictions", direction: "worsens", note: "Repeat-offender enhancements narrow the favorable band." },
      { id: "OH-F3", label: "Detention status", direction: "worsens", note: "Detention pressure tends to accelerate pleas." },
    ],
  },
};

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
 * Which what-affects-the-range factors apply given client facts (deterministic matching).
 * @param {Object} rules
 * @param {ChargeInput["client"]} client
 * @returns {Array} factors with `applies` flags
 */
export function applicableFactors(rules, client = {}) {
  return rules.factors.map((f) => {
    let applies = false;
    let basis = "";
    if (f.id.endsWith("F1") || f.label === "Detention status") {
      if (client.detained === true) { applies = true; basis = "client.detained = true"; }
      else if (client.detained === false) { applies = true; basis = "client.detained = false (factor may run the other way)"; }
    } else if (f.label === "Prior convictions") {
      if (typeof client.priorConvictions === "number" && client.priorConvictions > 0) {
        applies = true; basis = `client.priorConvictions = ${client.priorConvictions}`;
      }
    } else if (f.label === "Counsel at arraignment") {
      if (client.counselAtArraignment === true) { applies = true; basis = "client.counselAtArraignment = true"; }
    } else if (f.label === "Weak or circumstantial evidence") {
      if (client.evidenceIssues === true) { applies = true; basis = "client.evidenceIssues = true"; }
    } else if (f.label === "Diversion program eligibility" || f.label === "Intervention in lieu of conviction") {
      if (client.diversionEligible === true) { applies = true; basis = "client.diversionEligible = true"; }
    }
    return { ...f, applies, basis };
  });
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
  const sr = rules.sentencingRanges[input.chargeClass] ?? null;
  if (sr) report.sentencingRange = { ...sr };
  else report.errors.push(`chargeClass "${input.chargeClass}" has no sentencing range in the ${rules.id} example ruleset — left unset rather than guessed`);
  const band = outcomeBand(rules, input.chargeClass);
  if (band) report.outcomeBands = band;
  else report.errors.push(`chargeClass "${input.chargeClass}" has no outcome band in the ${rules.id} example ruleset — left unset rather than guessed`);
  report.factors = applicableFactors(rules, input.client ?? {});
  return report;
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
  if (report.sentencingRange) {
    L.push(`## Illustrative sentencing range\n\n${report.sentencingRange.minMonths}–${report.sentencingRange.maxMonths} months \`${report.sentencingRange.ruleId}\``);
    L.push("");
  }
  if (report.outcomeBands) {
    L.push(`## Likely-outcome bands (${report.outcomeBands.bandSource} data — heuristics, NOT predictions)`);
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
