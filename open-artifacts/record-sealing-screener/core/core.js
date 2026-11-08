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
 *
 * The DC ruleset additionally carries `citation` blocks pointing at the real
 * D.C. Code chapter (verified 2026-11-07 against code.dccouncil.gov). The
 * numbers on the DC paths remain ILLUSTRATIVE and [verify]-tagged: the
 * citation tells a maintainer exactly which statute to check, never that
 * these parameters ARE the statute. CA and TX stay uncited fictional data.
 *
 * @type {Record<string, JurisdictionRules>}
 */
export const JURISDICTION_RULES = {
  DC: {
    id: "DC",
    name: "District of Columbia (example ruleset, statutes cited for verification)",
    version: "2026-11-dc-cited",
    paths: {
      conviction: {
        ruleId: "DC-R1",
        citation: {
          statute: "D.C. Code § 16-806(a)(3)",
          detail:
            "Motion to seal a conviction after a waiting period measured from completion of the sentence " +
            "— 5 years (misdemeanor) / 8 years (felony) under the current statute; this example path uses a " +
            "flat 8-year wait and its caps/categories are illustrative [verify against current statute].",
          effectiveDate: "2023-03-10 [verify]", // Second Chance Amendment Act of 2022 restated this chapter
          lastVerified: "2026-11-07",
          source: "https://code.dccouncil.gov/us/dc/council/code/sections/16-806",
        },
        waitingPeriodYears: 8,
        waitingAnchor: "sentenceCompletedDate",
        maxLifetimeConvictions: 2,
        disqualifyingCategories: ["violent_felony", "sex_offense", "dui_serious"],
        disqualifyingClasses: ["felony_class_A", "felony_class_B"],
        motion: "Motion to Seal Conviction Record",
        whereToFile: "D.C. Superior Court [verify]",
        fee: "No filing fee stated in § 16-806 [verify]",
        filingSteps: [
          "Draft the motion stating all unsealed citations, arrests, charges, and convictions as reasonably known (§ 16-806(c)(1)(A)) [verify]",
          "Serve a copy of the motion on the prosecutor (§ 16-806(d)) [verify]",
          "File with the court; the order is due within 180 days (§ 16-806(i)(4)(C)) [verify]",
          "If granted, records are sealed within 90 days (§ 16-806(j)) [verify]",
        ],
      },
      acquittal: {
        ruleId: "DC-R2",
        citation: {
          statute: "D.C. Code § 16-803",
          detail:
            "Actual-innocence expungement by motion may be filed at any time (§ 16-803(b)(2)(B)); an acquittal " +
            "alone does NOT establish a presumption of relief (§ 16-803(e)). The 0-year wait here is an " +
            "illustrative simplification [verify against current statute].",
          effectiveDate: "2023-03-10 [verify]",
          lastVerified: "2026-11-07",
          source: "https://code.dccouncil.gov/us/dc/council/code/sections/16-803",
        },
        waitingPeriodYears: 0,
        waitingAnchor: "dispositionDate",
        disqualifyingCategories: [],
        disqualifyingClasses: [],
        motion: "Motion to Seal Following Acquittal",
        whereToFile: "D.C. Superior Court [verify]",
        fee: "No filing fee stated in § 16-803 [verify]",
        filingSteps: [
          "Draft the motion stating the grounds and supporting facts (§ 16-803(b)(1)) [verify]",
          "Serve a copy on the prosecutor (§ 16-803(c)) [verify]",
          "File with the court; may be filed at any time (§ 16-803(b)(2)(B)) [verify]",
        ],
      },
      dismissed: {
        ruleId: "DC-R3",
        citation: {
          statute: "D.C. Code § 16-806(a)(1)",
          detail:
            "Sealing by motion where the case was terminated by the prosecutor or otherwise reached a final " +
            "disposition without conviction or acquittal, on an interests-of-justice showing. The 1-year wait " +
            "here is illustrative — the cited subsection has no stated waiting period [verify].",
          effectiveDate: "2023-03-10 [verify]",
          lastVerified: "2026-11-07",
          source: "https://code.dccouncil.gov/us/dc/council/code/sections/16-806",
        },
        waitingPeriodYears: 1,
        waitingAnchor: "dispositionDate",
        disqualifyingCategories: [],
        disqualifyingClasses: [],
        motion: "Motion to Seal Dismissed Case",
        whereToFile: "D.C. Superior Court [verify]",
        fee: "No filing fee stated in § 16-806 [verify]",
        filingSteps: [
          "Draft the motion demonstrating it is in the interests of justice to seal (§ 16-806(a)(1)(C)) [verify]",
          "Serve a copy on the prosecutor (§ 16-806(d)) [verify]",
          "File with the court [verify]",
        ],
      },
      nolle_prosequi: {
        ruleId: "DC-R4",
        citation: {
          statute: "D.C. Code § 16-806(a)(1)",
          detail:
            "Sealing by motion where the case was terminated by the prosecutor (nolle prosequi) without " +
            "conviction or acquittal. The 2-year wait here is illustrative [verify].",
          effectiveDate: "2023-03-10 [verify]",
          lastVerified: "2026-11-07",
          source: "https://code.dccouncil.gov/us/dc/council/code/sections/16-806",
        },
        waitingPeriodYears: 2,
        waitingAnchor: "dispositionDate",
        disqualifyingCategories: [],
        disqualifyingClasses: [],
        motion: "Motion to Seal Nolle Prosequi",
        whereToFile: "D.C. Superior Court [verify]",
        fee: "No filing fee stated in § 16-806 [verify]",
        filingSteps: [
          "Draft the motion demonstrating it is in the interests of justice to seal (§ 16-806(a)(1)(C)) [verify]",
          "Serve a copy on the prosecutor (§ 16-806(d)) [verify]",
          "File with the court [verify]",
        ],
      },
      deferred_adjudication: {
        ruleId: "DC-R5",
        citation: {
          statute: "D.C. Code § 16-806",
          detail:
            "The cited chapter has no deferred-adjudication-specific path; this example path and its " +
            "3-year wait are illustrative fiction [verify].",
          effectiveDate: "2023-03-10 [verify]",
          lastVerified: "2026-11-07",
          source: "https://code.dccouncil.gov/us/dc/council/code/sections/16-806",
        },
        waitingPeriodYears: 3,
        waitingAnchor: "dispositionDate",
        requiresFinePaid: true,
        disqualifyingCategories: ["violent_felony", "sex_offense"],
        disqualifyingClasses: ["felony_class_A"],
        motion: "Motion to Seal After Deferred Adjudication",
        whereToFile: "D.C. Superior Court [verify]",
        fee: "No filing fee stated in § 16-806 [verify]",
        filingSteps: [
          "Confirm fine/restitution paid before filing (illustrative condition of this path) [verify]",
          "Draft and serve the motion on the prosecutor (§ 16-806(d)) [verify]",
          "File with the court [verify]",
        ],
      },
    },
    subsequentConvictionRule: {
      ruleId: "DC-R6",
      citation: {
        statute: "D.C. Code § 16-806(b)(2)(B)(iii)(VI)",
        detail:
          "The court weighs the movant's criminal history in the interests-of-justice analysis; the hard " +
            "8-year disqualifying lookback here is illustrative [verify].",
        effectiveDate: "2023-03-10 [verify]",
        lastVerified: "2026-11-07",
        source: "https://code.dccouncil.gov/us/dc/council/code/sections/16-806",
      },
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
        whereToFile: "(illustrative) superior court of the county of conviction",
        fee: "(illustrative) check the court fee schedule",
        filingSteps: [
          "(illustrative) draft the petition",
          "(illustrative) serve the district attorney",
          "(illustrative) file with the court and attend the hearing if set",
        ],
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
        whereToFile: "(illustrative) district court of the county of conviction",
        fee: "(illustrative) check the court fee schedule",
        filingSteps: [
          "(illustrative) draft the petition",
          "(illustrative) serve the prosecutor",
          "(illustrative) file with the court and attend the hearing if set",
        ],
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
 *
 * `record` carries whole-record context derived from the sibling cases by
 * `screenRecord`: `pendingSiblingIds` (any case flagged pending gates every
 * other case) and `siblingConvictions` (used for the lookback and the
 * lifetime cap when this case does not carry an explicit
 * `subsequentConvictions` array — an explicit array, even empty, overrides).
 *
 * @param {SealingCase} c
 * @param {ReturnType<typeof getRuleset>} rules
 * @param {Date} asOf
 * @param {{pendingSiblingIds?:string[], siblingConvictions?:{date:string|null,offenseCategory?:string,sourceCaseId:string}[]}} [record]
 * @returns {Object} determination result
 */
export function screenCase(c, rules, asOf, record = {}) {
  /** @type {{code:string, description:string, ruleId:string, statute?:string|null}[]} */
  const disqualifiers = [];
  /** @type {string[]} */
  const missingData = [];
  /** @type {{ruleId:string, text:string, statute?:string|null}[]} */
  const basis = [];
  /** Statute string for a rule's citation block, or null when the rule has none. */
  const citeOf = (rule) => (rule?.citation ? `${rule.citation.statute} [verify]` : null);
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
    statute: null,
    filingSteps: null,
    whereToFile: null,
    fee: null,
  };
  // Pending gate: own flag first, then the record-level gate from siblings.
  // An explicit `pendingCase: false` on this case overrides the record gate.
  const pendingSiblings = (record.pendingSiblingIds ?? []).filter((id) => id !== c.id);
  if (c.pendingCase === true) {
    disqualifiers.push({
      code: "pending_case",
      description: "This case is pending; most schemes bar sealing until it resolves.",
      ruleId: "GATE-PENDING",
    });
  } else if (c.pendingCase === undefined && pendingSiblings.length > 0) {
    disqualifiers.push({
      code: "pending_case",
      description: `Pending sibling case(s) ${pendingSiblings.join(", ")} elsewhere on this record; most schemes bar sealing until they resolve.`,
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
  const pathCite = citeOf(path);
  basis.push({
    ruleId: path.ruleId,
    text: `${rules.id} ${disp} path: ${path.waitingPeriodYears}-year wait anchored to ${path.waitingAnchor}`,
    statute: pathCite,
  });

  // Disqualifying offense categories / classes
  if (c.offenseCategory && path.disqualifyingCategories.includes(c.offenseCategory)) {
    disqualifiers.push({
      code: "disqualifying_category",
      description: `Offense category "${c.offenseCategory}" is disqualifying on the ${disp} path.`,
      ruleId: path.ruleId,
      statute: pathCite,
    });
  }
  if (c.offenseClass && path.disqualifyingClasses.includes(c.offenseClass)) {
    disqualifiers.push({
      code: "disqualifying_class",
      description: `Offense class "${c.offenseClass}" is disqualifying on the ${disp} path.`,
      ruleId: path.ruleId,
      statute: pathCite,
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
      statute: pathCite,
    });
  }

  // Subsequent convictions inside the lookback window. When the case carries
  // no explicit `subsequentConvictions` array, derive them from sibling
  // conviction cases on the record (whole-record screening).
  const explicitSubs = Array.isArray(c.subsequentConvictions);
  const subs = explicitSubs
    ? c.subsequentConvictions
    : (record.siblingConvictions ?? []).filter((s) => s.sourceCaseId !== c.id);
  const lookback = rules.subsequentConvictionRule;
  const windowEnd = addYears(anchor, lookback.disqualifiesWithinYears);
  for (const sc of subs) {
    const d = parseDate(sc.date);
    if (!d) {
      missingData.push(
        (sc.sourceCaseId ? `sibling case "${sc.sourceCaseId}" conviction date "${sc.date}"` : `subsequent conviction date "${sc.date}"`) +
        " missing or unparseable — excluded, flagged",
      );
      continue;
    }
    if (d > anchor && d <= (asOf < windowEnd ? asOf : windowEnd)) {
      disqualifiers.push({
        code: "subsequent_conviction",
        description: `Conviction on ${sc.date}${sc.sourceCaseId ? ` (sibling case ${sc.sourceCaseId})` : ""} falls inside the ${lookback.disqualifiesWithinYears}-year lookback from the anchor date.`,
        ruleId: lookback.ruleId,
        statute: citeOf(lookback),
      });
    }
  }

  // Lifetime conviction cap (this conviction + subsequent/sibling convictions)
  if (path.maxLifetimeConvictions != null && disp === "conviction") {
    const total = 1 + subs.length;
    if (total > path.maxLifetimeConvictions) {
      disqualifiers.push({
        code: "conviction_count_over_cap",
        description: `${total} convictions on this record${explicitSubs ? "" : " (this case plus sibling convictions)"}; the ${rules.id} ${disp} path caps eligibility at ${path.maxLifetimeConvictions}.`,
        ruleId: path.ruleId,
        statute: pathCite,
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
  result.statute = pathCite;
  result.filingSteps = path.filingSteps ?? null;
  result.whereToFile = path.whereToFile ?? null;
  result.fee = path.fee ?? null;
  basis.push({
    ruleId: path.ruleId,
    text: `Waiting period satisfied on or after ${fmtDate(eligibleOn)}; no disqualifier matched.`,
    statute: pathCite,
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
 * Derive whole-record context from the sibling cases: which cases are still
 * pending, and which sibling cases are convictions (candidates for another
 * case's lookback window and lifetime cap when not explicitly listed).
 * @param {SealingCase[]} cases
 * @returns {{pendingSiblingIds:string[], siblingConvictions:{date:string|null,offenseCategory?:string,sourceCaseId:string}[]}}
 */
function deriveRecordContext(cases) {
  const pendingSiblingIds = cases.filter((c) => c?.pendingCase === true).map((c) => c.id);
  const siblingConvictions = cases
    .filter((c) => c?.disposition === "conviction")
    .map((c) => ({
      date: c.dispositionDate ?? c.sentenceCompletedDate ?? null,
      offenseCategory: c.offenseCategory,
      sourceCaseId: c.id,
    }));
  return { pendingSiblingIds, siblingConvictions };
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
    nextReviewDate: null,
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
      statute: null,
      filingSteps: null,
      whereToFile: null,
      fee: null,
    }));
    report.summary.insufficient_data = report.results.length;
    report.summary.total = report.results.length;
    return report;
  }
  report.ruleset = { id: rules.id, name: rules.name, version: rules.version };
  if (!asOf) return invalidAsOf_(report, input);
  const record = deriveRecordContext(input.cases ?? []);
  for (const c of input.cases ?? []) results.push(screenCase(c, rules, asOf, record));
  report.summary.total = results.length;
  for (const r of results) {
    if (report.summary[r.determination] != null) report.summary[r.determination] += 1;
  }
  // Recheck calendar: earliest date any needs_more_time case becomes eligible.
  for (const r of results) {
    if (r.determination === "needs_more_time" && r.eligibleOnDate && (!report.nextReviewDate || r.eligibleOnDate < report.nextReviewDate)) {
      report.nextReviewDate = r.eligibleOnDate;
    }
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
    statute: null,
    filingSteps: null,
    whereToFile: null,
    fee: null,
  }));
  report.summary.total = report.results.length;
  report.summary.insufficient_data = report.results.length;
  return report;
}

/* ---------- rap-sheet paste parser (deterministic, never guesses) ---------- */

/** Disposition values the parser will map; anything else goes to unmappedLines. */
const RAP_KNOWN_DISPOSITIONS = new Set([
  "conviction",
  "acquittal",
  "dismissed",
  "nolle_prosequi",
  "deferred_adjudication",
  "unknown",
]);

/**
 * Parse the documented rap-sheet paste format (see spec.md) into the
 * `SealingInput` case shape. Deterministic line grammar; every line that is
 * not part of the documented format lands in `unmappedLines` with its line
 * number — the parser never guesses a disposition, date, or flag.
 *
 * Output: `{ jurisdiction: string|null, cases: SealingCase[],
 * unmappedLines: {line:number, text:string}[] }`. The caller supplies `asOf`
 * separately (the parser has no clock).
 *
 * @param {string} text
 * @returns {{jurisdiction:string|null, cases:Object[], unmappedLines:{line:number,text:string}[]}}
 */
export function parseRapSheet(text) {
  /** @type {{jurisdiction:string|null, cases:Object[], unmappedLines:{line:number,text:string}[]}} */
  const out = { jurisdiction: null, cases: [], unmappedLines: [] };
  if (typeof text !== "string") return out;
  let cur = null;
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const n = i + 1;
    const unmapped = () => out.unmappedLines.push({ line: n, text: line });
    // Case header: "CASE <id> [(<caseNumber>)]" — no colon, starts a new case.
    const caseHeader = /^CASE\s+(\S+)(?:\s+\((.+)\))?\s*$/.exec(line);
    if (caseHeader) {
      cur = { id: caseHeader[1], caseNumber: caseHeader[2] ?? null };
      out.cases.push(cur);
      return;
    }
    const kv = /^([A-Z][A-Z ]*?):\s*(.*)$/.exec(line);
    if (!kv) return unmapped();
    const key = kv[1];
    const v = kv[2].trim();
    if (!v) return unmapped();
    if (key === "JURISDICTION") {
      if (/^[A-Z]{2}$/.test(v)) out.jurisdiction = v;
      else unmapped();
      return;
    }
    if (!cur) return unmapped();
    switch (key) {
      case "OFFENSE":
        cur.offense = v;
        return;
      case "CATEGORY":
        cur.offenseCategory = v;
        return;
      case "CLASS":
        cur.offenseClass = v;
        return;
      case "DISPOSITION":
        if (RAP_KNOWN_DISPOSITIONS.has(v)) cur.disposition = v;
        else unmapped();
        return;
      case "OFFENSE DATE":
      case "DISPOSITION DATE":
      case "SENTENCE COMPLETED": {
        if (!parseDate(v)) return unmapped();
        const field =
          key === "OFFENSE DATE" ? "offenseDate" : key === "DISPOSITION DATE" ? "dispositionDate" : "sentenceCompletedDate";
        cur[field] = v;
        return;
      }
      case "FINE PAID":
      case "PENDING": {
        const bool = /^yes$/i.test(v) ? true : /^no$/i.test(v) ? false : null;
        if (bool === null) return unmapped();
        if (key === "FINE PAID") cur.finePaid = bool;
        else cur.pendingCase = bool;
        return;
      }
      default:
        unmapped();
    }
  });
  return out;
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
  if (report.nextReviewDate) {
    L.push(`**Next recheck date: ${report.nextReviewDate}** — earliest date any needs_more_time case may become eligible.`);
    L.push("");
  }
  for (const r of report.results) {
    L.push(`## ${r.caseId}${r.caseNumber ? ` (${r.caseNumber})` : ""} — ${r.determination}`);
    L.push("");
    if (r.offense) L.push(`Offense: ${r.offense}`);
    if (r.eligibleOnDate) L.push(`Earliest eligibility date: **${r.eligibleOnDate}**`);
    if (r.motion) L.push(`Motion to file: ${r.motion}${r.statute ? ` (${r.statute})` : ""}`);
    if (r.filingSteps?.length) {
      L.push("");
      L.push("Filing next steps:");
      for (const s of r.filingSteps) L.push(`- ${s}`);
      if (r.whereToFile) L.push(`- Where to file: ${r.whereToFile}`);
      if (r.fee != null) L.push(`- Fee: ${r.fee}`);
    }
    if (r.disqualifiers?.length) {
      L.push("");
      L.push("Disqualifiers (rule cited):");
      for (const d of r.disqualifiers) L.push(`- **${d.code}** — ${d.description} \`${d.ruleId}\`${d.statute ? ` (${d.statute})` : ""}`);
    }
    if (r.missingData?.length) {
      L.push("");
      L.push("Missing data (never guessed):");
      for (const m of r.missingData) L.push(`- ${m}`);
    }
    if (r.basis?.length) {
      L.push("");
      L.push("Rule chain:");
      for (const b of r.basis) L.push(`- \`${b.ruleId}\` ${b.text}${b.statute ? ` — ${b.statute}` : ""}`);
    }
    L.push("");
  }
  L.push("---");
  L.push(`> ⚠️ ${report.gate.message}`);
  return L.join("\n") + "\n";
}
