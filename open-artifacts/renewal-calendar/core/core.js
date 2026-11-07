/**
 * renewal-calendar — deterministic core.
 *
 * Extracts renewal/deadline dates from STRUCTURED clause JSON (an upstream
 * step — human or LLM — fills the clause objects; see spec.md), normalizes
 * date expressions including ambiguity flags (e.g. "within 60 days of
 * quarter end"), computes notice deadlines from rules-as-data lead times,
 * and exports an ICS calendar.
 *
 * Rules: every derived date carries provenance; ambiguous expressions are
 * flagged, unresolvable ones are flagged and excluded from the calendar —
 * NEVER guessed into a date.
 *
 * Dependency-free plain-JavaScript ES module; browser + Node compatible.
 * No hidden clocks: all math anchors to caller-supplied `asOf`.
 * @module core
 */

/* ---------- date helpers ---------- */

/** Parse "YYYY-MM-DD" to UTC Date; null when unparseable.
 * @param {string|null|undefined} d @returns {Date|null} */
export function parseDate(d) {
  if (!d || typeof d !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.trim());
  if (!m) return null;
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (Number.isNaN(dt.getTime())) return null;
  if (dt.getUTCMonth() !== +m[2] - 1 || dt.getUTCDate() !== +m[3]) return null;
  return dt;
}

/** Format UTC date as "YYYY-MM-DD". @param {Date} dt @returns {string} */
export function fmtDate(dt) {
  return dt.toISOString().slice(0, 10);
}

/** Whole days between two dates (b - a).
 * @param {Date} a @param {Date} b @returns {number} */
export function daysBetween(a, b) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/** Nearest calendar-quarter end on or after d.
 * @param {Date} d @returns {Date} */
export function quarterEndOnOrAfter(d) {
  const y = d.getUTCFullYear();
  const q = Math.floor(d.getUTCMonth() / 3); // 0..3
  const ends = [[2, 31], [5, 30], [8, 30], [11, 31]].map(([m, day]) => new Date(Date.UTC(y, m, day)));
  for (const e of ends) if (e.getTime() >= d.getTime()) return e;
  return new Date(Date.UTC(y + 1, 2, 31)); // Q1 of next year
}

/* ---------- date-expression normalization ---------- */

/**
 * Normalize a date expression against contract context.
 *
 * Supported grammar (rules-as-data — extend by adding patterns):
 *   - "YYYY-MM-DD"                          → exact date
 *   - "N days before <anchor>" / "N days after <anchor>"
 *       anchors: "renewal date", "quarter end", "effective date"
 *   - "within N days of quarter end"        → treated as "on or before quarter end − N days"? NO —
 *       flagged ambiguous: interpreted as quarter-end anchor, both directions listed as candidates
 *   - "quarter end"                         → nearest quarter end on/after context date, ambiguous
 *   - anything else                         → unresolved with reason (never guessed)
 *
 * @param {string} expr
 * @param {{ asOf: string, renewalDate?: string|null, effectiveDate?: string|null }} ctx
 * @returns {{
 *   status: "exact"|"computed"|"ambiguous"|"unresolved",
 *   date: string|null,
 *   reason: string,
 *   candidates?: string[],
 *   ambiguityFlag?: { type: string, note: string }
 * }}
 */
export function normalizeDateExpression(expr, ctx) {
  const raw = String(expr ?? "").trim();
  if (!raw) return { status: "unresolved", date: null, reason: "empty expression" };

  // 1. Exact ISO date
  if (parseDate(raw)) return { status: "exact", date: raw, reason: "explicit ISO date" };

  const asOf = parseDate(ctx.asOf) ?? new Date(Date.UTC(2026, 0, 1));
  const renewal = parseDate(ctx.renewalDate ?? null);
  const effective = parseDate(ctx.effectiveDate ?? null);

  // 2. "within N days of quarter end" — the classic ambiguity: before or after? which quarter?
  let m = /^within\s+(\d+)\s+days?\s+of\s+quarter\s+end$/i.exec(raw);
  if (m) {
    const n = +m[1];
    const qe = quarterEndOnOrAfter(asOf);
    const candidates = [fmtDate(new Date(qe.getTime() - n * 86400000)), fmtDate(new Date(qe.getTime() + n * 86400000))];
    return {
      status: "ambiguous",
      date: candidates[0],
      reason: `"within ${n} days of quarter end" — direction unstated; conservatively using the EARLIER candidate (quarter end − ${n}d)`,
      candidates,
      ambiguityFlag: {
        type: "window-direction-and-quarter",
        note: `Assumed nearest quarter end ${fmtDate(qe)} on/after ${ctx.asOf} and "before" reading (conservative). Confirm clause intent with a lawyer.`,
      },
    };
  }

  // 3. "N days before/after <anchor>"
  m = /^(\d+)\s+days?\s+(before|after)\s+(.+)$/i.exec(raw);
  if (m) {
    const n = +m[1];
    const dir = m[2].toLowerCase();
    const anchorName = m[3].trim().toLowerCase();
    let anchor = null;
    let ambiguity = null;
    if (anchorName === "quarter end") {
      anchor = quarterEndOnOrAfter(asOf);
      ambiguity = { type: "quarter-selection", note: `Assumed nearest quarter end ${fmtDate(anchor)} on/after ${ctx.asOf}.` };
    } else if (anchorName === "renewal date") {
      anchor = renewal;
    } else if (anchorName === "effective date") {
      anchor = effective;
    }
    if (!anchor) {
      return {
        status: "unresolved",
        date: null,
        reason: `anchor "${m[3].trim()}" not available in contract context${anchorName === "renewal date" || anchorName === "effective date" ? " (date missing)" : ""}`,
      };
    }
    const date = new Date(anchor.getTime() + (dir === "before" ? -n : n) * 86400000);
    const out = { status: "computed", date: fmtDate(date), reason: `${n} days ${dir} ${anchorName} (${fmtDate(anchor)})` };
    if (ambiguity) {
      out.status = "ambiguous";
      out.ambiguityFlag = ambiguity;
      out.candidates = [out.date];
    }
    return out;
  }

  // 4. Bare "quarter end"
  if (/^quarter\s+end$/i.test(raw)) {
    const qe = quarterEndOnOrAfter(asOf);
    return {
      status: "ambiguous",
      date: fmtDate(qe),
      reason: "bare 'quarter end' — assumed nearest quarter end on/after as-of date",
      candidates: [fmtDate(qe)],
      ambiguityFlag: { type: "quarter-selection", note: `Assumed ${fmtDate(qe)}; confirm which quarter the clause means.` },
    };
  }

  // 5. Unresolvable — never guessed
  return { status: "unresolved", date: null, reason: `expression "${raw}" not in the supported grammar — human review required` };
}

/* ---------- calendar ---------- */

/** Default lead-time rules (rules-as-data; override per portfolio).
 * @type {{ defaultLeadTimeDays: number, byClauseType: Record<string, number> }} */
export const DEFAULT_RULES = {
  defaultLeadTimeDays: 60,
  byClauseType: { "auto-renewal": 90, "evergreen": 90, "termination-for-convenience": 30, "price-adjustment": 120 },
};

/**
 * Build the renewal calendar from structured clause JSON.
 *
 * Clause shape: { contractId?, type, dateExpression | date, quote?, leadTimeDaysOverride? }
 * Emits renewal/notice events with provenance, ambiguity flags, and
 * status: confirmed | ambiguous | unresolved (unresolved events are listed
 * for review but produce no calendar entry).
 *
 * @param {{ asOf: string, contracts: Array<{ id: string, name: string, counterparty?: string, effectiveDate?: string, clauses: any[] }> }} input
 * @param {{ defaultLeadTimeDays?: number, byClauseType?: Record<string, number> }} [rules]
 * @returns {{ asOf: string, events: any[], unresolved: any[], summary: { total: number, confirmed: number, ambiguous: number, unresolved: number } }}
 */
export function buildCalendar(input, rules = {}) {
  const r = { ...DEFAULT_RULES, ...rules };
  const rByType = { ...DEFAULT_RULES.byClauseType, ...(rules.byClauseType ?? {}) };
  /** @type {any[]} */ const events = [];
  /** @type {any[]} */ const unresolved = [];

  for (const contract of input.contracts ?? []) {
    const renewalClause = (contract.clauses ?? []).find((c) => /renew/i.test(String(c.type)));
    const ctx = {
      asOf: input.asOf,
      renewalDate: renewalClause && (renewalClause.date ?? null),
      effectiveDate: contract.effectiveDate ?? null,
    };

    for (const clause of contract.clauses ?? []) {
      const expr = clause.date ?? clause.dateExpression ?? null;
      const norm = clause.date
        ? { status: parseDate(clause.date) ? "exact" : "unresolved", date: parseDate(clause.date) ? clause.date : null,
            reason: parseDate(clause.date) ? "explicit ISO date in clause data" : `clause.date "${clause.date}" is not a valid ISO date` }
        : normalizeDateExpression(expr, ctx);

      const base = {
        contractId: contract.id,
        contractName: contract.name,
        counterparty: contract.counterparty ?? null,
        clauseType: clause.type,
        quote: clause.quote ?? null,
        expression: expr,
        normalized: norm,
      };

      if (!norm.date) {
        unresolved.push({ ...base, status: "unresolved", reason: norm.reason });
        continue;
      }

      const leadTime = clause.leadTimeDaysOverride ?? rByType[clause.type] ?? r.defaultLeadTimeDays;
      const hasOverride = clause.leadTimeDaysOverride !== undefined && clause.leadTimeDaysOverride !== null;
      const anchorDate = parseDate(norm.date);
      const noticeDate = fmtDate(new Date(anchorDate.getTime() - leadTime * 86400000));

      events.push({
        ...base,
        status: norm.status === "exact" ? "confirmed" : "ambiguous",
        date: norm.date,
        noticeDeadline: noticeDate,
        leadTimeDays: leadTime,
        leadTimeSource: hasOverride ? "clause override" : rByType[clause.type] ? `rules.byClauseType[${clause.type}]` : "rules.defaultLeadTimeDays",
        reason: norm.reason,
        ...(norm.ambiguityFlag ? { ambiguityFlag: norm.ambiguityFlag } : {}),
      });
    }
  }

  events.sort((a, b) => String(a.noticeDeadline).localeCompare(String(b.noticeDeadline)));
  return {
    asOf: input.asOf,
    events,
    unresolved,
    summary: {
      total: events.length + unresolved.length,
      confirmed: events.filter((e) => e.status === "confirmed").length,
      ambiguous: events.filter((e) => e.status === "ambiguous").length,
      unresolved: unresolved.length,
    },
  };
}

/* ---------- ICS export ---------- */

function icsEscape(s) {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function fold(line) {
  // RFC 5545 §3.1 — fold lines longer than 75 octets
  const out = [];
  let rest = line;
  while (BufferLineLen(rest) > 75) {
    let cut = 74; // leave room for leading space of the continuation
    while (cut > 1 && BufferLineLen(rest.slice(0, cut + 1)) > 74) cut--;
    out.push(rest.slice(0, cut));
    rest = " " + rest.slice(cut);
  }
  out.push(rest);
  return out.join("\r\n");
}

function BufferLineLen(s) {
  return new TextEncoder().encode(s).length;
}

function ymdNoDashes(d) {
  return String(d).replace(/-/g, "");
}

/**
 * ICS (RFC 5545) export. Only confirmed/ambiguous events with dates become
 * VEVENTs; each event carries an alarm 14 days ahead and full provenance in
 * the description. Unresolved items are appended as a comment header —
 * they are never silently dropped.
 * @param {any} calendar — output of buildCalendar
 * @returns {string}
 */
export function toICS(calendar) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//open-legal-artifacts//renewal-calendar//EN",
    "CALSCALE:GREGORIAN",
  ];
  for (const e of calendar.events ?? []) {
    const desc = [
      e.quote ? `Clause: "${icsEscape(e.quote)}"` : `Expression: ${icsEscape(e.expression)}`,
      `Normalization: ${icsEscape(e.reason)}`,
      `Notice lead time: ${e.leadTimeDays}d (${e.leadTimeSource})`,
      e.ambiguityFlag ? `AMBIGUOUS (${e.ambiguityFlag.type}): ${icsEscape(e.ambiguityFlag.note)}` : "Status: confirmed",
      `Contract: ${icsEscape(e.contractName)} [${e.contractId}]` + (e.counterparty ? ` c/o ${icsEscape(e.counterparty)}` : ""),
      "Fictional example data. Human confirmation required — not legal advice.",
    ].join("\\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.contractId}-${e.clauseType}-${ymdNoDashes(e.date)}@open-legal-artifacts`,
      `DTSTAMP:${ymdNoDashes(calendar.asOf)}T000000Z`,
      `DTSTART;VALUE=DATE:${ymdNoDashes(e.noticeDeadline)}`,
      `SUMMARY:${icsEscape((e.ambiguityFlag ? "[?] " : "") + "NOTICE DEADLINE — " + e.contractName + " (" + e.clauseType + ")")}`,
      `DESCRIPTION:${desc}`,
      "BEGIN:VALARM",
      "TRIGGER:-P14D",
      "ACTION:DISPLAY",
      `DESCRIPTION:${icsEscape("Notice window opening — " + e.contractName)}`,
      "END:VALARM",
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
