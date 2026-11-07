/**
 * record-sealing-screener — deterministic core.
 *
 * Screens a criminal-record case-facts JSON against jurisdiction sealing
 * rules-as-data and returns per-case eligibility determinations with the
 * cited rule behind every flag. It NEVER guesses: unknown dispositions or
 * missing dates produce `insufficient_data`, never an eligibility call.
 * Every report is gated with "verify with counsel".
 *
 * Rules are illustrative, editable data (3 example US jurisdictions) —
 * legal-aid maintainers add jurisdictions by adding data, not code.
 *
 * Dependency-free plain-JavaScript ES module; browser + Node compatible.
 * No hidden clocks: all time math anchors to a caller-supplied `asOf`.
 * @module core
 */

/* ---------- date helpers (self-contained by design) ---------- */

/** Parse "YYYY-MM-DD" to a UTC Date. Null when unparseable — never guessed.
 * @param {string|undefined|null} d
 * @returns {Date|null} */
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
 * @param {Date|null} dt
 * @returns {string|null} */
export function fmtDate(dt) {
  return dt ? dt.toISOString().slice(0, 10) : null;
}

/** Add years, clamping month-end (Feb 29 → Feb 28).
 * @param {Date} dt
 * @param {number} years
 * @returns {Date} */
export function addYears(dt, years) {
  const y = dt.getUTCFullYear() + years;
  const m = dt.getUTCMonth();
  let day = dt.getUTCDate();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  if (day > last) day = last;
  return new Date(Date.UTC(y, m, day));
}

/** Whole years elapsed from `from` to `to` (calendar years, floor).
 * @param {Date} from
 * @param {Date} to
 * @returns {number} */
export function yearsElapsed(from, to) {
  let yrs = to.getUTCFullYear() - from.getUTCFullYear();
  const before =
    to.getUTCMonth() < from.getUTCMonth() ||
    (to.getUTCMonth() === from.getUTCMonth() && to.getUTCDate() < from.getUTCDate());
  if (before) yrs -= 1;
  return yrs;
}

/** Days between two UTC dates (b - a), floored.
 * @param {Date} a
 * @param {Date} b
 * @returns {number} */
export function daysBetween(a, b) {
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}

/* ---------- rules-as-data (illustrative, editable) ---------- */

/**
 * Example US jurisdiction rulesets. Every number cites a `ruleId` that the
 * engine echoes back on each determination. ILLUSTRATIVE ONLY — modeled on
 * common sealing-scheme shapes (waiting periods, conviction-count caps,
 * disqualifying offense categories/classes), not legal advice.
 * @type {Record<string, JurisdictionRules>}
 */
export const JURISDICTION_RULES = {
  DC: {
    id: "DC",
    name: "District of Columbia (example ruleset)",
    version: "2026-11-example",
    paths: {
      conviction: {
        ruleId: "DC-R1",
        waitingPeriodYears: 8,
        waitingAnchor: "sentenceCompletedDate",
        maxLifetimeConvictions: 2,
        disqualifyingCategories: ["violent_felony", "sex_offense", "dui_serious"],
        disqualifyingClasses: ["felony_class_A", "felony_class_B"],
        motion: "Motion to Seal Conviction Record",
      },
      acquittal: {
        ruleId: "DC-R2",
        waitingPeriodYears: 0,
        waitingAnchor: "dispositionDate",
        disqualifyingCategories: [],
        disqualifyingClasses: [],
        motion: "Motion to Seal Following Acquittal",
      },
      dismissed: {
        ruleId: "DC-R3",
        waitingPeriodYears: 1,
        waitingAnchor: "dispositionDate",
        disqualifyingCategories: [],
        disqualifyingClasses: [],
        motion: "Motion to Seal Dismissed Case",
      },
      nolle_prosequi: {
        ruleId: "DC-R4",
        waitingPeriodYears: 2,
        waitingAnchor: "dispositionDate",
        disqualifyingCategories: [],
        disqualifyingClasses: [],
        motion: "Motion to Seal Nolle Prosequi",
      },
      deferred_adjudication: {
        ruleId: "DC-R5",
        waitingPeriodYears: 3,
        waitingAnchor: "dispositionDate",
        requiresFinePaid: true,
        disqualifyingCategories: ["violent_felony", "sex_offense"],
        disqualifyingClasses: ["felony_class_A"],
        motion: "Motion to Seal After Deferred Adjudication",
      },
    },
    subsequentConvictionRule: {
      ruleId: "DC-R6",
      disqualifiesWithinYears: 8,
      scope: "any conviction between anchor date and asOf",
    },
  },
  CA: {
    id: "CA",
    name: "California (example ruleset)",
    version: "2026-11-example",
    paths: {
      conviction: {
        ruleId: "CA-R1",
        waitingPeriodYears: 2,
        waitingAnchor: "sentenceCompletedDate",
        maxLifetimeConvictions: 3,
        disqualifyingCategories: ["sex_offense", "violent_felony"],
        disqualifyingClasses: ["felony_class_A", "felony_class_B"],
        motion: "Petition for Dismissal (sealing analog)",
      },
      acquittal: {
        ruleId: "CA-R2",
        waitingPeriodYears: 0,
        waitingAnchor: "dispositionDate",
        disqualifyingCategories: [],
        disqualifyingClasses: [],
        motion: "Petition to Seal Acquittal",
      },
      dismissed: {
        ruleId: "CA-R3",
        waitingPeriodYears: 1,
        waitingAnchor: "dispositionDate",
        disqualifyingCategories: [],
        disqualifyingClasses: [],
        motion: "Petition to Seal Dismissal",
      },
      nolle_prosequi: {
        ruleId: "CA-R4",
        waitingPeriodYears: 1,
        waitingAnchor: "dispositionDate",
        disqualifyingCategories: [],
        disqualifyingClasses: [],
        motion: "Petition to Seal (no complaint filed)",
      },
      deferred_adjudication: {
        ruleId: "CA-R5",
        waitingPeriodYears: 1,
        waitingAnchor: "dispositionDate",
        requiresFinePaid: true,
        disqualifyingCategories: ["sex_offense", "violent_felony"],
        disqualifyingClasses: ["felony_class_A"],
        motion: "Petition After Deferred Entry of Judgment",
      },
    },
    subsequentConvictionRule: {
      ruleId: "CA-R6",
      disqualifiesWithinYears: 2,
      scope: "any conviction between anchor date and asOf",
    },
  },
  TX: {
    id: "TX",
    name: "Texas (example ruleset)",
    version: "2026-11-example",
    paths: {
      conviction: {
        ruleId: "TX-R1",
        waitingPeriodYears: 5,
        waitingAnchor: "sentenceCompletedDate",
        maxLifetimeConvictions: 1,
        disqualifyingCategories: ["sex_offense", "violent_felony", "family_violence"],
        disqualifyingClasses: ["felony_class_A", "felony_class_B"],
        motion: "Petition for Nondisclosure",
      },
      acquittal: {
        ruleId: "TX-R2",
        waitingPeriodYears: 0,
        waitingAnchor: "dispositionDate",
        disqualifyingCategories: [],
        disqualifyingClasses: [],
        motion: "Petition for Expunction (acquittal)",
      },
      dismissed: {
        ruleId: "TX-R3",
        waitingPeriodYears: 2,
        waitingAnchor: "dispositionDate",
        disqualifyingCategories: [],
        disqualifyingClasses: [],
        motion: "Petition for Expunction (dismissal)",
      },
      nolle_prosequi: {
        ruleId: "TX-R4",
        waitingPeriodYears: 2,
        waitingAnchor: "dispositionDate",
        disqualifyingCategories: [],
        disqualifyingClasses: [],
        motion: "Petition for Expunction (nolle prosequi)",
      },
      deferred_adjudication: {
        ruleId: "TX-R5",
        waitingPeriodYears: 4,
        waitingAnchor: "dispositionDate",
        requiresFinePaid: true,
        disqualifyingCategories: ["sex_offense", "violent_felony"],
        disqualifyingClasses: ["felony_class_A"],
        motion: "Petition for Nondisclosure (deferred)",
      },
    },
    subsequentConvictionRule: {
      ruleId: "TX-R6",
      disqualifiesWithinYears: 5,
      scope: "any conviction between anchor date and asOf",
    },
  },
};

/** The counsel gate attached to every report, without exception.
 * @type {{required: boolean, message: string}} */
export const COUNSEL_GATE = {
  required: true,
  message:
    "Screening estimate only, produced under illustrative example rulesets. " +
    "Verify eligibility with licensed counsel in the actual jurisdiction " +
    "before filing or advising a client.",
};

/* ---------- engine ---------- */

/**
 * @typedef {Object} SealingCase
 * @property {string} id
 * @property {string} [caseNumber]
 * @property {string} offense
 * @property {string} [offenseCategory] e.g. "drug_possession"
 * @property {string} [offenseClass] e.g. "misdemeanor_class_A"
 * @property {string} disposition conviction|acquittal|dismissed|nolle_prosequi|deferred_adjudication|unknown
 * @property {string} [offenseDate]
 * @property {string} [dispositionDate]
 * @property {string} [sentenceCompletedDate]
 * @property {boolean} [finePaid]
 * @property {{date:string, offenseCategory?:string}[]} [subsequentConvictions]
 * @property {boolean} [pendingCase]
 */

/**
 * @typedef {Object} SealingInput
 * @property {string} jurisdiction
 * @property {string} asOf
 * @property {SealingCase[]} cases
 */

/**
 * Screen one case against a jurisdiction ruleset.
 * @param {SealingCase} c
 * @param {ReturnType<typeof getRuleset>} rules
 * @param {Date} asOf
 * @returns {Object} determination result
 */
export function screenCase(c, rules, asOf) {
  /** @type {{code:string, description:string, ruleId:string}[]} */
  const disqualifiers = [];
  /** @type {string[]} */
  const missingData = [];
  /** @type {{ruleId:string, text:string}[]} */
  const basis = [];
  const result = {
    caseId: c.id,
    caseNumber: c.caseNumber ?? null,
    offense: c.offense ?? "(unspecified offense)",
    determination: "insufficient_data",
    eligibleOnDate: null,
    disqualifiers,
    missingData,
    basis,
    motion: null,
  };
  if (c.pendingCase) {
    disqualifiers.push({
      code: "pending_case",
      description: "A pending case is open; most schemes bar sealing until it resolves.",
      ruleId: "GATE-PENDING",
    });
  }
  const disp = c.disposition;
  if (!disp || disp === "unknown") {
    missingData.push("disposition (conviction / acquittal / dismissed / nolle_prosequi / deferred_adjudication)");
    return result;
  }
  const path = rules.paths[disp];
  if (!path) {
    missingData.push(`no ruleset path for disposition "${disp}" in ${rules.id}`);
    return result;
  }
  basis.push({ ruleId: path.ruleId, text: `${rules.id} ${disp} path: ${path.waitingPeriodYears}-year wait anchored to ${path.waitingAnchor}` });

  // Disqualifying offense categories / classes
  if (c.offenseCategory && path.disqualifyingCategories.includes(c.offenseCategory)) {
    disqualifiers.push({
      code: "disqualifying_category",
      description: `Offense category "${c.offenseCategory}" is disqualifying on the ${disp} path.`,
      ruleId: path.ruleId,
    });
  }
  if (c.offenseClass && path.disqualifyingClasses.includes(c.offenseClass)) {
    disqualifiers.push({
      code: "disqualifying_class",
      description: `Offense class "${c.offenseClass}" is disqualifying on the ${disp} path.`,
      ruleId: path.ruleId,
    });
  }

  // Anchor date
  const anchorRaw = path.waitingAnchor === "sentenceCompletedDate" ? c.sentenceCompletedDate : c.dispositionDate;
  if (path.waitingAnchor === "sentenceCompletedDate" && disp === "conviction" && !c.sentenceCompletedDate) {
    missingData.push("sentenceCompletedDate (required to start the conviction waiting period)");
    return result;
  }
  const anchor = parseDate(anchorRaw);
  if (!anchor) {
    missingData.push(`${path.waitingAnchor} (unparseable or missing)`);
    return result;
  }

  // Fine condition
  if (path.requiresFinePaid && c.finePaid === false) {
    disqualifiers.push({
      code: "fines_unpaid",
      description: "Fines/restitution reported unpaid; required condition not met.",
      ruleId: path.ruleId,
    });
  }

  // Subsequent convictions inside the lookback window
  const lookback = rules.subsequentConvictionRule;
  const windowEnd = addYears(anchor, lookback.disqualifiesWithinYears);
  for (const sc of c.subsequentConvictions ?? []) {
    const d = parseDate(sc.date);
    if (!d) {
      missingData.push(`subsequent conviction date "${sc.date}" unparseable — excluded, flagged`);
      continue;
    }
    if (d > anchor && d <= (asOf < windowEnd ? asOf : windowEnd)) {
      disqualifiers.push({
        code: "subsequent_conviction",
        description: `Conviction on ${sc.date} falls inside the ${lookback.disqualifiesWithinYears}-year lookback from the anchor date.`,
        ruleId: lookback.ruleId,
      });
    }
  }

  // Lifetime conviction cap (heuristic: count subsequent + this conviction)
  if (path.maxLifetimeConvictions != null && disp === "conviction") {
    const total = 1 + (c.subsequentConvictions ?? []).length;
    if (total > path.maxLifetimeConvictions) {
      disqualifiers.push({
        code: "conviction_count_over_cap",
        description: `${total} convictions reported; the ${rules.id} ${disp} path caps eligibility at ${path.maxLifetimeConvictions}.`,
        ruleId: path.ruleId,
      });
    }
  }

  // Any hard disqualifier ⇒ ineligible, no guessing
  if (disqualifiers.length > 0) {
    result.determination = "ineligible";
    return result;
  }

  // Waiting period
  const eligibleOn = addYears(anchor, path.waitingPeriodYears);
  result.eligibleOnDate = fmtDate(eligibleOn);
  if (yearsElapsed(anchor, asOf) < path.waitingPeriodYears) {
    result.determination = "needs_more_time";
    basis.push({
      ruleId: path.ruleId,
      text: `As of ${fmtDate(asOf)}, ${yearsElapsed(anchor, asOf)} of ${path.waitingPeriodYears} required years elapsed.`,
    });
    return result;
  }

  result.determination = "potentially_eligible";
  result.motion = path.motion;
  basis.push({
    ruleId: path.ruleId,
    text: `Waiting period satisfied on or after ${fmtDate(eligibleOn)}; no disqualifier matched.`,
  });
  return result;
}

/**
 * Load a ruleset by id. Returns null for unknown jurisdictions (never a fallback guess).
 * @param {string} id
 * @returns {Object|null}
 */
export function getRuleset(id) {
  return JURISDICTION_RULES[id] ?? null;
}

/**
 * Run the full screen.
 * @param {SealingInput} input
 * @returns {Object} report
 */
export function screenRecord(input) {
  const asOf = parseDate(input?.asOf);
  /** @type {{determination:string, caseId:string}[] } results */
  const results = [];
  const report = {
    asOf: input?.asOf ?? null,
    jurisdiction: input?.jurisdiction ?? null,
    ruleset: null,
    results,
    gate: COUNSEL_GATE,
    summary: { total: 0, potentially_eligible: 0, needs_more_time: 0, ineligible: 0, insufficient_data: 0 },
  };
  const rules = input?.jurisdiction ? getRuleset(input.jurisdiction) : null;
  if (!rules) {
    report.results = (input?.cases ?? []).map((c) => ({
      caseId: c.id,
      determination: "insufficient_data",
      missingData: [`unknown jurisdiction "${input?.jurisdiction}" — no ruleset loaded; add one in rules-as-data`],
      disqualifiers: [],
      basis: [],
      eligibleOnDate: null,
      motion: null,
    }));
    report.summary.insufficient_data = report.results.length;
    report.summary.total = report.results.length;
    return report;
  }
  report.ruleset = { id: rules.id, name: rules.name, version: rules.version };
  if (!asOf) return invalidAsOf_(report, input);
  for (const c of input.cases ?? []) results.push(screenCase(c, rules, asOf));
  report.summary.total = results.length;
  for (const r of results) {
    if (report.summary[r.determination] != null) report.summary[r.determination] += 1;
  }
  return report;
}

/** @private */
function invalidAsOf_(report, input) {
  report.results = (input?.cases ?? []).map((c) => ({
    caseId: c.id,
    determination: "insufficient_data",
    missingData: ["asOf date missing or unparseable (format YYYY-MM-DD)"],
    disqualifiers: [],
    basis: [],
    eligibleOnDate: null,
    motion: null,
  }));
  report.summary.total = report.results.length;
  report.summary.insufficient_data = report.results.length;
  return report;
}

/** Render the report as deterministic Markdown.
 * @param {ReturnType<screenRecord>} report
 * @returns {string} */
export function renderReport(report) {
  const L = [];
  L.push(`# Record sealing screen — ${report.ruleset ? report.ruleset.name : "unknown jurisdiction"}`);
  L.push("");
  L.push(`As of: **${report.asOf ?? "?"}** · Ruleset: **${report.ruleset ? `${report.ruleset.id} v${report.ruleset.version}` : "none loaded"}**`);
  L.push("");
  const s = report.summary;
  L.push(`**${s.total}** cases · ${s.potentially_eligible} potentially eligible · ${s.needs_more_time} need more time · ${s.ineligible} ineligible · ${s.insufficient_data} insufficient data`);
  L.push("");
  for (const r of report.results) {
    L.push(`## ${r.caseId}${r.caseNumber ? ` (${r.caseNumber})` : ""} — ${r.determination}`);
    L.push("");
    if (r.offense) L.push(`Offense: ${r.offense}`);
    if (r.eligibleOnDate) L.push(`Earliest eligibility date: **${r.eligibleOnDate}**`);
    if (r.motion) L.push(`Motion to file: ${r.motion}`);
    if (r.disqualifiers?.length) {
      L.push("");
      L.push("Disqualifiers (rule cited):");
      for (const d of r.disqualifiers) L.push(`- **${d.code}** — ${d.description} \`${d.ruleId}\``);
    }
    if (r.missingData?.length) {
      L.push("");
      L.push("Missing data (never guessed):");
      for (const m of r.missingData) L.push(`- ${m}`);
    }
    if (r.basis?.length) {
      L.push("");
      L.push("Rule chain:");
      for (const b of r.basis) L.push(`- \`${b.ruleId}\` ${b.text}`);
    }
    L.push("");
  }
  L.push("---");
  L.push(`> ⚠️ ${report.gate.message}`);
  return L.join("\n") + "\n";
}
