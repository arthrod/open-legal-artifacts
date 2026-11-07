/**
 * limitations-radar — deterministic core. (original-idea artifact)
 *
 * Statute-of-limitations deadline tracker: claims JSON (claim type,
 * jurisdiction, injury date, discovery date, tolling events) → deadline
 * computation from rules-as-data (claim-type periods per example
 * jurisdictions, discovery-rule accrual, recognized statutory tolling),
 * saved-by margin vs the filing date, conflict flags when discovery
 * precedes injury, and calendar-alert ICS export. Never guesses: unknown
 * jurisdictions or claim types come back as errors; missing dates as
 * data_needed.
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

/** Add days.
 * @param {Date} dt @param {number} days @returns {Date} */
export function addDays(dt, days) {
  return new Date(dt.getTime() + days * 86400000);
}

/** Whole days from a to b (b - a).
 * @param {Date} a @param {Date} b @returns {number} */
export function daysBetween(a, b) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/* ---------- rules-as-data (illustrative, editable) ---------- */

/**
 * Example US jurisdiction rulesets. `accrual` picks the trigger date:
 *  - "injury"     — clock runs from injuryDate
 *  - "discovery"  — clock runs from discoveryDate when provided (discovery rule)
 * `tolling` maps tolling-event types the jurisdiction recognizes to their
 * effect: "pause" (extend the deadline by the event's duration) or
 * "not_recognized" (flagged, no effect).
 * ILLUSTRATIVE ONLY — maintainers replace with cited statutes.
 * @type {Record<string, Object>}
 */
export const JURISDICTION_RULES = {
  CA: {
    id: "CA",
    name: "California (example ruleset)",
    version: "2026-11-example",
    claimTypes: {
      personal_injury: { periodYears: 2, accrual: "discovery", ruleId: "CA-SOL-PI" },
      breach_of_contract_oral: { periodYears: 2, accrual: "injury", ruleId: "CA-SOL-CO" },
      breach_of_contract_written: { periodYears: 4, accrual: "injury", ruleId: "CA-SOL-CW" },
      fraud: { periodYears: 3, accrual: "discovery", ruleId: "CA-SOL-F" },
      property_damage: { periodYears: 3, accrual: "discovery", ruleId: "CA-SOL-PD" },
    },
    tolling: {
      minority: { effect: "pause", ruleId: "CA-TOL-1", note: "Clock paused during minority (illustrative)." },
      defendant_absence: { effect: "pause", ruleId: "CA-TOL-2", note: "Clock paused while defendant out of state (illustrative)." },
      bankruptcy_stay: { effect: "pause", ruleId: "CA-TOL-3", note: "Automatic stay pauses the clock (illustrative)." },
      fraudulent_concealment: { effect: "pause", ruleId: "CA-TOL-4", note: "Concealment tolls until discovery (illustrative)." },
    },
  },
  NY: {
    id: "NY",
    name: "New York (example ruleset)",
    version: "2026-11-example",
    claimTypes: {
      personal_injury: { periodYears: 3, accrual: "injury", ruleId: "NY-SOL-PI" },
      breach_of_contract_oral: { periodYears: 2, accrual: "injury", ruleId: "NY-SOL-CO" },
      breach_of_contract_written: { periodYears: 6, accrual: "injury", ruleId: "NY-SOL-CW" },
      fraud: { periodYears: 6, accrual: "discovery", ruleId: "NY-SOL-F" },
      property_damage: { periodYears: 3, accrual: "injury", ruleId: "NY-SOL-PD" },
    },
    tolling: {
      minority: { effect: "pause", ruleId: "NY-TOL-1", note: "Infancy toll until age 18 (illustrative)." },
      defendant_absence: { effect: "pause", ruleId: "NY-TOL-2", note: "Nonresidence toll (illustrative)." },
      bankruptcy_stay: { effect: "pause", ruleId: "NY-TOL-3", note: "Stay tolls limitations (illustrative)." },
    },
  },
  TX: {
    id: "TX",
    name: "Texas (example ruleset)",
    version: "2026-11-example",
    claimTypes: {
      personal_injury: { periodYears: 2, accrual: "discovery", ruleId: "TX-SOL-PI" },
      breach_of_contract_oral: { periodYears: 4, accrual: "injury", ruleId: "TX-SOL-CO" },
      breach_of_contract_written: { periodYears: 4, accrual: "injury", ruleId: "TX-SOL-CW" },
      fraud: { periodYears: 4, accrual: "discovery", ruleId: "TX-SOL-F" },
      property_damage: { periodYears: 2, accrual: "discovery", ruleId: "TX-SOL-PD" },
    },
    tolling: {
      minority: { effect: "pause", ruleId: "TX-TOL-1", note: "Legal disability toll (illustrative)." },
      defendant_absence: { effect: "pause", ruleId: "TX-TOL-2", note: "Absence toll (illustrative)." },
    },
  },
};

/** The gate attached to every report.
 * @type {{required:boolean, message:string}} */
export const GATE = {
  required: true,
  message:
    "Deadlines computed from illustrative example rulesets; limitations law " +
    "is full of exceptions and accrual disputes. Verify every deadline with " +
    "counsel before relying on it.",
};

/** Load a ruleset by id; null when unknown (never a fallback guess).
 * @param {string} id @returns {Object|null} */
export function getRuleset(id) {
  return JURISDICTION_RULES[id] ?? null;
}

/* ---------- engine ---------- */

/**
 * Compute the tolling extension (days) for one claim from recognized events.
 * @param {Object} claim
 * @param {Object} rules
 * @param {Date} asOf
 * @returns {{tollDays:number, applied:{type:string,days:number,ruleId:string}[], flagged:{type:string,text:string}[]}}
 */
export function computeTolling(claim, rules, asOf) {
  let tollDays = 0;
  const applied = [];
  const flagged = [];
  for (const ev of claim.tollingEvents ?? []) {
    const rule = rules.tolling?.[ev.type];
    if (!rule) {
      flagged.push({ type: ev.type, text: `tolling type "${ev.type}" not recognized in the ${rules.id} example ruleset — no effect applied; flagged for review` });
      continue;
    }
    if (rule.effect === "not_recognized") {
      flagged.push({ type: ev.type, text: `${rules.id} rules mark "${ev.type}" as not recognized — no effect applied` });
      continue;
    }
    const start = parseDate(ev.startDate);
    if (!start) {
      flagged.push({ type: ev.type, text: `tolling event "${ev.type}" has no parseable startDate — excluded, flagged` });
      continue;
    }
    const end = ev.stillOngoing ? asOf : parseDate(ev.endDate);
    if (!end || end < start) {
      flagged.push({ type: ev.type, text: `tolling event "${ev.type}" has no valid end (endDate missing/invalid and not ongoing) — excluded, flagged` });
      continue;
    }
    const days = daysBetween(start, end);
    tollDays += days;
    applied.push({ type: ev.type, days, ruleId: rule.ruleId, note: rule.note });
  }
  return { tollDays, applied, flagged };
}

/**
 * Evaluate one claim's deadline.
 * @param {Object} claim
 * @param {Date} asOf
 * @returns {Object} claim result
 */
export function evaluateClaim(claim, asOf) {
  const rules = claim?.jurisdiction ? getRuleset(claim.jurisdiction) : null;
  /** @type {any[]} */
  const conflicts = [];
  const result = {
    claimId: claim?.id ?? "(unnamed claim)",
    claimType: claim?.claimType ?? null,
    jurisdiction: claim?.jurisdiction ?? null,
    status: "data_needed",
    accrualDate: null, deadline: null, tollDays: 0, tollingApplied: [], flags: [],
    conflicts, filingDate: claim?.filingDate ?? null,
    savedByDays: null, daysRemainingAsOf: null, basis: [], gate: GATE,
  };
  if (!rules) {
    result.status = "data_needed";
    result.flags.push(`unknown jurisdiction "${claim?.jurisdiction}" — no ruleset loaded`);
    return result;
  }
  const ct = rules.claimTypes[claim.claimType];
  if (!ct) {
    result.flags.push(`claimType "${claim.claimType}" not in the ${rules.id} example ruleset — never guessed`);
    return result;
  }
  const injury = parseDate(claim.injuryDate);
  const discovery = parseDate(claim.discoveryDate);
  // Conflict: discovery predates injury
  if (injury && discovery && discovery < injury) {
    conflicts.push({
      code: "discovery_precedes_injury",
      text: `discoveryDate ${claim.discoveryDate} precedes injuryDate ${claim.injuryDate} — check the dates; both retained, accrual picks ${ct.accrual === "discovery" ? "discovery (earlier)" : "injury"}.`,
    });
  }
  let accrual = null;
  if (ct.accrual === "discovery") {
    accrual = discovery ?? injury;
    result.basis.push({ ruleId: ct.ruleId, text: `Discovery-rule accrual: uses discoveryDate when provided (${claim.discoveryDate ?? "not provided"}), else injuryDate.` });
  } else {
    accrual = injury;
    result.basis.push({ ruleId: ct.ruleId, text: `Accrual at injury: uses injuryDate (${claim.injuryDate ?? "not provided"}).` });
  }
  if (!accrual) {
    result.flags.push(`no usable accrual date: ${ct.accrual} claim needs ${ct.accrual === "discovery" ? "discoveryDate or injuryDate" : "injuryDate"}`);
    return result;
  }
  const { tollDays, applied, flagged } = computeTolling(claim, rules, asOf);
  result.tollDays = tollDays;
  result.tollingApplied = applied;
  result.flags.push(...flagged.map((f) => f.text));
  const deadline = addDays(addYears(accrual, ct.periodYears), tollDays);
  result.accrualDate = fmtDate(accrual);
  result.deadline = fmtDate(deadline);
  result.basis.push({ ruleId: ct.ruleId, text: `${ct.periodYears} years from accrual ${fmtDate(accrual)}${tollDays ? ` + ${tollDays} tolling days` : ""} => ${fmtDate(deadline)}` });
  const filing = parseDate(claim.filingDate);
  if (filing) {
    result.savedByDays = daysBetween(filing, deadline); // + => filed before the deadline, with that many days to spare
    result.status = filing <= deadline ? "filed_timely" : "filed_late";
    result.basis.push({ ruleId: "MARGIN", text: `Filed ${claim.filingDate}: ${result.savedByDays >= 0 ? "saved by " + result.savedByDays + " days" : "past deadline by " + Math.abs(result.savedByDays) + " days"}.` });
  } else {
    result.daysRemainingAsOf = daysBetween(asOf, deadline);
    result.status = deadline >= asOf ? "deadline_upcoming" : "deadline_passed_unfiled";
  }
  return result;
}

/**
 * Run the radar across all claims.
 * @param {{asOf:string, claims:Object[]}} input
 * @returns {Object} report
 */
export function runRadar(input) {
  const asOf = parseDate(input?.asOf);
  const results = (input?.claims ?? []).map((c) => evaluateClaim(c, asOf ?? new Date(0)));
  const summary = { total: results.length, filed_timely: 0, filed_late: 0, deadline_upcoming: 0, deadline_passed_unfiled: 0, data_needed: 0, conflicts: 0 };
  for (const r of results) {
    if (summary[r.status] != null) summary[r.status] += 1;
    if (r.conflicts.length) summary.conflicts += 1;
  }
  return { asOf: input?.asOf ?? null, results, summary, gate: GATE };
}

/* ---------- ICS export ---------- */

/** Escape text for an ICS property value (RFC 5545 §3.3.11 subset).
 * @param {string} s @returns {string} */
function icsEsc(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Fold long ICS lines at 74 chars (RFC 5545 §3.1), CRLF continuation.
 * @param {string} line @returns {string} */
export function foldLine(line) {
  if (line.length <= 74) return line;
  const parts = [];
  let rest = line;
  parts.push(rest.slice(0, 74));
  rest = rest.slice(74);
  while (rest.length > 0) {
    parts.push(" " + rest.slice(0, 73));
    rest = rest.slice(73);
  }
  return parts.join("\r\n");
}

/**
 * Calendar alerts (ICS) for every computed deadline (and passed-deadline warnings).
 * Deterministic: DTSTAMP anchors to the report's asOf; UIDs derive from claim + deadline.
 * @param {ReturnType<runRadar>} report
 * @returns {string} ICS text
 */
export function toICS(report) {
  const stamp = (parseDate(report.asOf) ?? new Date(0)).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//open-legal-artifacts//limitations-radar//EN",
    "CALSCALE:GREGORIAN",
  ];
  let n = 0;
  for (const r of report.results) {
    if (!r.deadline) continue;
    n += 1;
    const d = r.deadline.replace(/-/g, "");
    const late = r.status === "deadline_passed_unfiled" || r.status === "filed_late";
    const desc =
      `Claim ${r.claimId} (${r.claimType}, ${r.jurisdiction}). ` +
      `Accrual ${r.accrualDate}; ${r.tollDays} tolling day(s). ` +
      (r.savedByDays != null ? `Filed ${r.filingDate} (saved by ${r.savedByDays} days). ` : `Status ${r.status}. `) +
      `Example ruleset — verify with counsel.`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${icsEsc(r.claimId)}-sol-${d}@limitations-radar`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${d}`,
      `SUMMARY:${icsEsc(late ? "[OVERDUE] " : "")}SOL deadline — ${r.claimType} (${r.jurisdiction}), claim ${r.claimId}`,
      `DESCRIPTION:${icsEsc(desc)}`,
      "BEGIN:VALARM",
      "TRIGGER:-P30D",
      "ACTION:DISPLAY",
      `DESCRIPTION:${icsEsc(`30-day warning: SOL deadline for ${r.claimId}`)}`,
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** Markdown report.
 * @param {ReturnType<runRadar>} report
 * @returns {string} */
export function renderReport(report) {
  const L = [];
  L.push(`# Limitations radar — as of ${report.asOf ?? "?"}`);
  L.push("");
  const s = report.summary;
  L.push(`**${s.total}** claims · ${s.filed_timely} filed timely · ${s.deadline_upcoming} upcoming · ${s.deadline_passed_unfiled} expired unfiled · ${s.filed_late} filed late · ${s.data_needed} data needed · ${s.conflicts} with conflicts`);
  L.push("");
  for (const r of report.results) {
    L.push(`## ${r.claimId} — ${r.claimType ?? "?"} (${r.jurisdiction ?? "?"}) · ${r.status}`);
    L.push("");
    if (r.deadline) {
      L.push(`- Deadline: **${r.deadline}** (accrual ${r.accrualDate}${r.tollDays ? `, +${r.tollDays} tolling days` : ""})`);
      if (r.savedByDays != null) L.push(`- Filed ${r.filingDate} — ${r.savedByDays >= 0 ? `saved by **${r.savedByDays} days**` : `**past deadline by ${Math.abs(r.savedByDays)} days**`}`);
      if (r.daysRemainingAsOf != null) L.push(`- ${r.daysRemainingAsOf >= 0 ? `${r.daysRemainingAsOf} days remaining` : `expired ${Math.abs(r.daysRemainingAsOf)} days ago`}`);
    }
    for (const t of r.tollingApplied) L.push(`- Tolling applied: ${t.type} +${t.days}d \`${t.ruleId}\``);
    for (const c of r.conflicts) L.push(`- ⚠️ Conflict (${c.code}): ${c.text}`);
    for (const f of r.flags) L.push(`- Flag: ${f}`);
    for (const b of r.basis) L.push(`- Basis \`${b.ruleId}\`: ${b.text}`);
    L.push("");
  }
  L.push("---");
  L.push(`> ⚠️ ${report.gate.message}`);
  return L.join("\n") + "\n";
}
