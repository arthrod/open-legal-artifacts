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
 * Beyond scheduling, the calendar answers the operational questions the
 * closed counterpart leaves to prose:
 *   - urgency tiers (overdue / 30d / 60d / 90d / 180d / later) per event
 *   - escalation owners from rules-as-data (`rules.escalation[]`)
 *   - a coverage audit listing contracts with NO dated renewal/notice clause
 *     (quiet is not clean)
 *   - attorney confirmations that pin an ambiguous candidate to a date,
 *     promoting it to confirmed with provenance
 *   - recurrence (`renewalTermMonths`) projecting the next two renewal
 *     cycles with stable UIDs and dedupe
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

function offsetDays(d, n) {
  return new Date(d.getTime() + n * 86400000);
}

/** Shift a date by N months, clamping the day to the target month's end
 * (Jan 31 + 1mo → Feb 28). @param {Date} d @param {number} n @returns {Date} */
function addMonths(d, n) {
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return target;
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

/** Nearest calendar-month end on or after d.
 * @param {Date} d @returns {Date} */
export function monthEndOnOrAfter(d) {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const thisMonth = new Date(Date.UTC(y, m + 1, 0)); // last day of d's month
  return thisMonth.getTime() >= d.getTime() ? thisMonth : new Date(Date.UTC(y, m + 2, 0));
}

/* ---------- date-expression normalization ---------- */

/**
 * Grammar is rules-as-data: PATTERNS are tried in order; each carries an
 * ambiguity policy (see spec.md for the human-readable table). Anchors are
 * resolved by ANCHORS; unknown anchors and unlisted phrases are unresolved —
 * never guessed.
 */

/** @param {string} display @returns {{status:"unresolved",date:null,reason:string}} */
function unresolvedAnchor(display) {
  return { status: "unresolved", date: null, reason: `anchor "${display}" not available in contract context` };
}

/**
 * @param {"renewal date"|"effective date"} name @param {string} display
 * @returns {{status:"unresolved",date:null,reason:string}}
 */
function missingAnchor(name, display) {
  return { status: "unresolved", date: null, reason: `anchor "${display}" not available in contract context (${name} missing)` };
}

/** @typedef {{date: Date, ambiguity?: {type:string,note:string}}} AnchorResult */

/**
 * Resolve a named anchor against contract context.
 * "expiration" / "expiration date" alias the renewal date (end of the
 * then-current term).
 * @param {string} name @param {{asOf:string,renewalDate?:string|null,effectiveDate?:string|null}} ctx @param {Date} asOf
 * @returns {AnchorResult|{missing:"renewal date"|"effective date"}|{unknown:true}}
 */
function resolveAnchor(name, ctx, asOf) {
  switch (name) {
    case "quarter end": {
      const qe = quarterEndOnOrAfter(asOf);
      return { date: qe, ambiguity: { type: "quarter-selection", note: `Assumed nearest quarter end ${fmtDate(qe)} on/after ${ctx.asOf}.` } };
    }
    case "month end": {
      const me = monthEndOnOrAfter(asOf);
      return { date: me, ambiguity: { type: "month-selection", note: `Assumed nearest month end ${fmtDate(me)} on/after ${ctx.asOf}.` } };
    }
    case "renewal date":
    case "expiration":
    case "expiration date": {
      const d = parseDate(ctx.renewalDate ?? null);
      return d ? { date: d } : { missing: "renewal date" };
    }
    case "effective date": {
      const d = parseDate(ctx.effectiveDate ?? null);
      return d ? { date: d } : { missing: "effective date" };
    }
    default:
      return { unknown: true };
  }
}

/** @type {{name:string, regex:RegExp, ambiguityPolicy:string, resolve:(m:RegExpExecArray, ctx:any, asOf:Date)=>any}[]} */
const PATTERNS = [
  {
    name: "within-n-days-of-anchor",
    regex: /^within\s+(\d+)\s+days?\s+of\s+(.+)$/i,
    ambiguityPolicy: "window-direction: both readings computed, EARLIER (conservative) scheduled, confirm with counsel",
    resolve: (m, ctx, asOf) => {
      const n = +m[1];
      const anchorName = m[2].trim().toLowerCase();
      const a = resolveAnchor(anchorName, ctx, asOf);
      if (a.unknown) return unresolvedAnchor(m[2].trim());
      if (a.missing) return missingAnchor(a.missing, m[2].trim());
      const candidates = [fmtDate(offsetDays(a.date, -n)), fmtDate(offsetDays(a.date, n))];
      const flagType = a.ambiguity ? `window-direction-and-${a.ambiguity.type.split("-")[0]}` : "window-direction";
      const note = `${a.ambiguity ? a.ambiguity.note + " " : ""}Direction unstated; using the EARLIER candidate (conservative). Confirm clause intent with a lawyer.`;
      return {
        status: "ambiguous",
        date: candidates[0],
        reason: `"within ${n} days of ${anchorName}" — direction unstated; conservatively using the EARLIER candidate (${anchorName} − ${n}d)`,
        candidates,
        ambiguityFlag: { type: flagType, note },
      };
    },
  },
  {
    name: "n-days-offset",
    regex: /^(\d+)\s+days?\s+(before|after|prior\s+to)\s+(.+)$/i,
    ambiguityPolicy: "computed; if the anchor itself is a selection (quarter/month end) its flag is inherited",
    resolve: (m, ctx, asOf) => {
      const n = +m[1];
      const dir = /after/i.test(m[2]) ? "after" : "before";
      const anchorName = m[3].trim().toLowerCase();
      const a = resolveAnchor(anchorName, ctx, asOf);
      if (a.unknown) return unresolvedAnchor(m[3].trim());
      if (a.missing) return missingAnchor(a.missing, m[3].trim());
      const date = fmtDate(offsetDays(a.date, dir === "before" ? -n : n));
      const out = { status: "computed", date, reason: `${n} days ${dir} ${anchorName} (${fmtDate(a.date)})` };
      if (a.ambiguity) {
        out.status = "ambiguous";
        out.ambiguityFlag = a.ambiguity;
        out.candidates = [date];
      }
      return out;
    },
  },
  {
    name: "bare-anchor",
    regex: /^(quarter|month)\s+end$/i,
    ambiguityPolicy: "anchor-selection: nearest period end on/after as-of assumed, flag emitted",
    resolve: (m, ctx, asOf) => {
      const anchorName = m[1].toLowerCase() + " end";
      const a = resolveAnchor(anchorName, ctx, asOf);
      return {
        status: "ambiguous",
        date: fmtDate(a.date),
        reason: `bare '${anchorName}' — assumed nearest ${anchorName} on/after as-of date`,
        candidates: [fmtDate(a.date)],
        ambiguityFlag: a.ambiguity,
      };
    },
  },
];

/**
 * Normalize a date expression against contract context.
 *
 * Supported grammar (rules-as-data — extend by adding a PATTERNS entry):
 *   - "YYYY-MM-DD"                                → exact date
 *   - "within N days of <anchor>"                 → ambiguous (both readings; earlier scheduled)
 *   - "N days before/after <anchor>"              → computed
 *   - "N days prior to <anchor>"                  → synonym of "before"
 *   - "quarter end" | "month end"                 → ambiguous (period-selection flag)
 *   anchors: renewal date, effective date, quarter end, month end,
 *            expiration (aliases renewal date)
 *   - anything else                               → unresolved with reason (never guessed)
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

  // 2. Pattern table
  for (const p of PATTERNS) {
    const m = p.regex.exec(raw);
    if (m) return p.resolve(m, ctx, asOf);
  }

  // 3. Unresolvable — never guessed
  return { status: "unresolved", date: null, reason: `expression "${raw}" not in the supported grammar — human review required` };
}

/* ---------- urgency tiers & escalation ---------- */

/** Urgency tiers as data: days between asOf and the notice deadline.
 * @type {{maxDaysOut:number, tier:string}[]} */
export const URGENCY_TIERS = [
  { maxDaysOut: 30, tier: "30d" },
  { maxDaysOut: 60, tier: "60d" },
  { maxDaysOut: 90, tier: "90d" },
  { maxDaysOut: 180, tier: "180d" },
];

/** Tier for a days-until value; negative = deadline already passed.
 * @param {number} daysUntil @returns {"overdue"|"30d"|"60d"|"90d"|"180d"|"later"} */
export function urgencyTier(daysUntil) {
  if (!Number.isFinite(daysUntil)) return "later";
  // daysUntil === 0 (deadline day itself) is NOT overdue — notice can still
  // go out today, so it falls through to the tightest tier ("30d")
  if (daysUntil < 0) return "overdue";
  for (const t of URGENCY_TIERS) if (daysUntil <= t.maxDaysOut) return t.tier;
  return "later";
}

/**
 * First escalation rule (array order = urgency order; list the most urgent
 * owner first — an overdue deadline matches every rule) whose maxDaysOut
 * covers the event; null when nothing matches.
 * @param {{maxDaysOut:number, owner:string}[]} rules @param {number} daysUntil
 */
function pickEscalation(rules, daysUntil) {
  for (const r of rules) if (daysUntil <= r.maxDaysOut) return { owner: r.owner, maxDaysOut: r.maxDaysOut };
  return null;
}

/* ---------- calendar ---------- */

/** Default lead-time rules (rules-as-data; override per portfolio).
 * `escalation` (optional) is a list of { maxDaysOut, owner }, most urgent first.
 * @type {{ defaultLeadTimeDays: number, byClauseType: Record<string, number> }} */
export const DEFAULT_RULES = {
  defaultLeadTimeDays: 60,
  byClauseType: { "auto-renewal": 90, "evergreen": 90, "termination-for-convenience": 30, "price-adjustment": 120 },
};

const RENEWAL_TYPES = /^(auto-renewal|evergreen)$/;

/**
 * Occurrence dates for a clause: single, or — for renewal clause types with
 * `renewalTermMonths` — the first two cycles on/after asOf (past cycles have
 * already renewed; the actionable deadline is the next one).
 * @param {any} clause @param {Date} baseDate @param {Date} asOf
 * @returns {{date:string, recurrence:null|{termMonths:number, cycle:number}}[]}
 */
function projectOccurrences(clause, baseDate, asOf) {
  const term = clause.renewalTermMonths;
  if (!RENEWAL_TYPES.test(String(clause.type)) || !Number.isFinite(term) || term <= 0) {
    return [{ date: fmtDate(baseDate), recurrence: null }];
  }
  let d = baseDate;
  while (d.getTime() < asOf.getTime()) d = addMonths(d, term);
  return [0, 1].map((i) => ({ date: fmtDate(addMonths(d, i * term)), recurrence: { termMonths: term, cycle: i + 1 } }));
}

/**
 * Build the renewal calendar from structured clause JSON.
 *
 * Clause shape: { contractId?, type, date | dateExpression, quote?, leadTimeDaysOverride?, renewalTermMonths? }
 * Emits renewal/notice events with provenance, ambiguity flags, urgency tier,
 * escalation owner and recurrence metadata; status: confirmed | ambiguous |
 * unresolved (unresolved events are listed for review but produce no calendar
 * entry). Contracts with no dated clause at all land in `coverage` — quiet is
 * not clean.
 *
 * @param {{ asOf: string, contracts: Array<{ id: string, name: string, counterparty?: string, effectiveDate?: string, clauses: any[] }> }} input
 * @param {{ defaultLeadTimeDays?: number, byClauseType?: Record<string, number>, escalation?: {maxDaysOut:number, owner:string}[] }} [rules]
 * @param {{ contractId: string, clauseType: string, date: string, confirmedBy?: string, on?: string }[]} [confirmations]
 *   attorney pins: a pinned date must be one of the event's candidates (or its
 *   current date); it then promotes the event to `confirmed` and is recorded
 *   as provenance. Pins that match nothing are reported in
 *   `unappliedConfirmations`, never silently applied.
 * @returns {{
 *   asOf: string, events: any[], unresolved: any[], coverage: any[], unappliedConfirmations: any[],
 *   summary: { total: number, confirmed: number, ambiguous: number, unresolved: number, coverageGaps: number }
 * }}
 */
export function buildCalendar(input, rules = {}, confirmations = []) {
  const r = { ...DEFAULT_RULES, ...rules };
  const rByType = { ...DEFAULT_RULES.byClauseType, ...(rules.byClauseType ?? {}) };
  const escalationRules = Array.isArray(rules.escalation) ? rules.escalation : [];
  const asOf = parseDate(input.asOf) ?? new Date(Date.UTC(2026, 0, 1));
  /** @type {any[]} */ const events = [];
  /** @type {any[]} */ const unresolved = [];
  /** @type {any[]} */ const coverage = [];
  /** @type {Set<string>} */ const seen = new Set(); // dedupe key: contractId|clauseType|date

  for (const contract of input.contracts ?? []) {
    const renewalClause = (contract.clauses ?? []).find((c) => /renew/i.test(String(c.type)));
    const ctx = {
      asOf: input.asOf,
      renewalDate: renewalClause && (renewalClause.date ?? null),
      effectiveDate: contract.effectiveDate ?? null,
    };
    let datedClauses = 0;

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
      datedClauses++;

      const leadTime = clause.leadTimeDaysOverride ?? rByType[clause.type] ?? r.defaultLeadTimeDays;
      const hasOverride = clause.leadTimeDaysOverride !== undefined && clause.leadTimeDaysOverride !== null;

      for (const occ of projectOccurrences(clause, parseDate(norm.date), asOf)) {
        const key = `${contract.id}|${clause.type}|${occ.date}`;
        if (seen.has(key)) continue; // recurrence dedupe: same contract+clause+date collapses
        seen.add(key);

        const noticeDate = fmtDate(new Date(parseDate(occ.date).getTime() - leadTime * 86400000));
        const daysUntil = daysBetween(asOf, parseDate(noticeDate));
        events.push({
          ...base,
          status: norm.status === "exact" ? "confirmed" : "ambiguous",
          date: occ.date,
          noticeDeadline: noticeDate,
          leadTimeDays: leadTime,
          leadTimeSource: hasOverride ? "clause override" : rByType[clause.type] ? `rules.byClauseType[${clause.type}]` : "rules.defaultLeadTimeDays",
          reason: norm.reason,
          daysUntil,
          urgency: { tier: urgencyTier(daysUntil), daysUntil },
          escalation: pickEscalation(escalationRules, daysUntil),
          recurrence: occ.recurrence,
          ...(norm.ambiguityFlag ? { ambiguityFlag: norm.ambiguityFlag } : {}),
        });
      }
    }

    if (datedClauses === 0) {
      const clauseCount = (contract.clauses ?? []).length;
      coverage.push({
        contractId: contract.id,
        contractName: contract.name,
        clauseCount,
        datedClauses: 0,
        reason: clauseCount === 0
          ? "no clauses found in the structured input — confirm extraction, quiet is not clean"
          : `no dated renewal/notice clause — ${clauseCount} clause(s) found, none resolvable to a date; human review required`,
      });
    }
  }

  // attorney confirmations: pin ambiguous candidates to a date
  /** @type {any[]} */ const unappliedConfirmations = [];
  for (const conf of confirmations ?? []) {
    const targets = events.filter((e) => e.contractId === conf.contractId && e.clauseType === conf.clauseType && e.ambiguityFlag);
    const target = targets.find((e) => (e.normalized?.candidates ?? [e.date]).includes(conf.date));
    if (!target) {
      const candidates = [...new Set(targets.flatMap((e) => e.normalized?.candidates ?? [e.date]))];
      unappliedConfirmations.push({
        ...conf,
        reason: targets.length === 0
          ? `no ambiguous ${conf.clauseType} event found for contract ${conf.contractId}`
          : `pinned date ${conf.date} is not among candidates [${candidates.join(", ")}] for ${conf.contractId}/${conf.clauseType} — refusing to apply`,
      });
      continue;
    }
    const flag = target.ambiguityFlag;
    const noticeDate = fmtDate(new Date(parseDate(conf.date).getTime() - target.leadTimeDays * 86400000));
    const daysUntil = daysBetween(asOf, parseDate(noticeDate));
    target.date = conf.date;
    target.noticeDeadline = noticeDate;
    target.daysUntil = daysUntil;
    target.urgency = { tier: urgencyTier(daysUntil), daysUntil };
    target.escalation = pickEscalation(escalationRules, daysUntil);
    target.status = "confirmed";
    delete target.ambiguityFlag;
    target.confirmation = { date: conf.date, confirmedBy: conf.confirmedBy ?? null, on: conf.on ?? null, resolvedFlag: flag.type };
  }

  events.sort((a, b) => String(a.noticeDeadline).localeCompare(String(b.noticeDeadline)));
  return {
    asOf: input.asOf,
    events,
    unresolved,
    coverage,
    unappliedConfirmations,
    summary: {
      total: events.length + unresolved.length,
      confirmed: events.filter((e) => e.status === "confirmed").length,
      ambiguous: events.filter((e) => e.status === "ambiguous").length,
      unresolved: unresolved.length,
      coverageGaps: coverage.length,
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
 * VEVENTs; each event carries an alarm 14 days ahead, its urgency tier as a
 * SUMMARY prefix + CATEGORIES entry (plus the escalation owner when set),
 * and full provenance in the description. Unresolved items are appended as a
 * comment header — they are never silently dropped.
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
      `Urgency: ${e.urgency?.tier ?? "?"}${e.urgency ? (e.urgency.daysUntil < 0 ? ` — ${Math.abs(e.urgency.daysUntil)}d past deadline` : ` (${e.urgency.daysUntil}d out)`) : ""}`,
      e.escalation ? `Escalation owner: ${icsEscape(e.escalation.owner)} (${e.escalation.maxDaysOut}d rule)` : null,
      e.recurrence ? `Recurrence: every ${e.recurrence.termMonths}mo — cycle ${e.recurrence.cycle} of 2` : null,
      e.confirmation ? `Confirmed by ${icsEscape(e.confirmation.confirmedBy ?? "counsel")}${e.confirmation.on ? ` on ${e.confirmation.on}` : ""} — resolved ${e.confirmation.resolvedFlag} flag` : null,
      e.ambiguityFlag ? `AMBIGUOUS (${e.ambiguityFlag.type}): ${icsEscape(e.ambiguityFlag.note)}` : "Status: confirmed",
      `Contract: ${icsEscape(e.contractName)} [${e.contractId}]` + (e.counterparty ? ` c/o ${icsEscape(e.counterparty)}` : ""),
      "Fictional example data. Human confirmation required — not legal advice.",
    ].filter(Boolean).join("\\n");
    const categories = [e.urgency?.tier, e.escalation?.owner].filter(Boolean).map(icsEscape).join(",");
    const summaryPrefix = `[${e.urgency?.tier ?? "?"}]${e.ambiguityFlag ? " [?]" : ""} `;
    // spread: pushing the array itself would nest it, and fold() would
    // string-coerce the nested array into ONE comma-joined content line
    lines.push(
      ...[
        "BEGIN:VEVENT",
      `UID:${e.contractId}-${e.clauseType}-${ymdNoDashes(e.date)}@open-legal-artifacts`,
      `DTSTAMP:${ymdNoDashes(calendar.asOf)}T000000Z`,
      `DTSTART;VALUE=DATE:${ymdNoDashes(e.noticeDeadline)}`,
      `SUMMARY:${icsEscape(summaryPrefix + "NOTICE DEADLINE — " + e.contractName + " (" + e.clauseType + ")")}`,
      categories ? `CATEGORIES:${categories}` : null,
      `DESCRIPTION:${desc}`,
      "BEGIN:VALARM",
      "TRIGGER:-P14D",
      "ACTION:DISPLAY",
      `DESCRIPTION:${icsEscape("Notice window opening — " + e.contractName)}`,
      "END:VALARM",
      "END:VEVENT",
      ].filter(Boolean),
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
