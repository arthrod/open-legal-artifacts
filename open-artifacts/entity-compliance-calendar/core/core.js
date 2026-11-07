/**
 * entity-compliance-calendar — deterministic core.
 *
 * Entities × obligations compliance matrix. Obligations are rules-as-data
 * (jurisdiction + entity type + recurrence + statutory cite, fictional US
 * defaults); the core computes next-due dates for annual / biennial /
 * event-driven recurrences from each entity's formation anchor and recorded
 * filings, flags delinquency, and exports CSV + ICS (with recurrence rules).
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

/** Anniversary of `formedOn` in year y (month/day preserved). Feb-29 anchors roll to Feb-28 in non-leap years.
 * @param {string} formedOnIso @param {number} y @returns {Date} */
function anniversary(formedOnIso, y) {
  const f = parseDate(formedOnIso);
  const m = f.getUTCMonth();
  let d = f.getUTCDate();
  if (m === 1 && d === 29) {
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    if (!leap) d = 28;
  }
  return new Date(Date.UTC(y, m, d));
}

/** Fixed calendar date in year y. @param {number} month 1-12 @param {number} day @param {number} y @returns {Date} */
function fixedDate(month, day, y) {
  const dt = new Date(Date.UTC(y, month - 1, day));
  // reject impossible fixed dates (e.g. Feb 30) — never roll silently
  return dt.getUTCMonth() === month - 1 ? dt : null;
}

/* ---------- next-due computation ---------- */

/**
 * Compute the next (unfiled) due date for one obligation × entity.
 *
 * @param {any} ob — obligation rule: { id, jurisdiction, entityTypes?, recurring: "annual"|"biennial"|"event", anchor: "formationAnniversary"|"calendarFixed"|"formation", dueMonth?, dueDay?, dueWithinDays?, name, statuteCite? }
 * @param {any} entity — { id, jurisdiction, type, formedOn, status? }
 * @param {Array<any>} filings — [{ entityId, obligationId, period: number|"once", filedOn }]
 * @param {string} asOfIso
 * @returns {{ applies: boolean, skipReason?: string, dueOn: string|null, period: number|"once"|null, status: "delinquent"|"due-soon"|"scheduled"|"satisfied"|"n/a", ruleNote: string }}
 */
export function nextDue(ob, entity, filings, asOfIso) {
  const asOf = parseDate(asOfIso);

  // Applicability
  if ((ob.entityTypes ?? []).length && !(ob.entityTypes ?? []).includes(entity.type))
    return { applies: false, skipReason: `entity type "${entity.type}" not in [${ob.entityTypes.join(", ")}]`, dueOn: null, period: null, status: "n/a", ruleNote: "" };
  if (ob.jurisdiction !== entity.jurisdiction)
    return { applies: false, skipReason: `obligation jurisdiction ${ob.jurisdiction} ≠ entity jurisdiction ${entity.jurisdiction}`, dueOn: null, period: null, status: "n/a", ruleNote: "" };
  if (String(entity.status ?? "active") !== "active")
    return { applies: false, skipReason: `entity status "${entity.status}" — tracking paused`, dueOn: null, period: null, status: "n/a", ruleNote: "" };

  const filed = new Set(
    (filings ?? [])
      .filter((f) => f.entityId === entity.id && f.obligationId === ob.id)
      .map((f) => String(f.period))
  );

  // Event-driven (e.g. initial report within N days of formation)
  if (ob.recurring === "event") {
    const anchor = parseDate(entity.formedOn);
    if (!anchor) return { applies: true, dueOn: null, period: null, status: "n/a", ruleNote: "formation date missing — cannot compute event obligation" };
    const due = new Date(anchor.getTime() + (ob.dueWithinDays ?? 90) * 86400000);
    const period = "once";
    if (filed.has(period)) return { applies: true, dueOn: fmtDate(due), period, status: "satisfied", ruleNote: `event obligation satisfied (filing recorded)` };
    const overdue = due.getTime() < asOf.getTime();
    return {
      applies: true,
      dueOn: fmtDate(due),
      period,
      status: overdue ? "delinquent" : "scheduled",
      ruleNote: `event: ${ob.dueWithinDays ?? 90}d after formation (${fmtDate(anchor)})`,
    };
  }

  // Recurring: annual or biennial
  const formed = parseDate(entity.formedOn);
  if (!formed) return { applies: true, dueOn: null, period: null, status: "n/a", ruleNote: "formation date missing" };
  const formationYear = formed.getUTCFullYear();
  const interval = ob.recurring === "biennial" ? 2 : 1;

  /** due date for period year y, or null if the year is off-cycle / before formation / fixed date impossible */
  const dueInYear = (y) => {
    let due = null;
    if (ob.anchor === "calendarFixed") {
      if (interval === 2 && (y - formationYear) % 2 !== 0) return null; // fixed biennial honors formation-year parity
      due = fixedDate(ob.dueMonth, ob.dueDay, y);
    } else {
      if ((y - formationYear) % interval !== 0) return null; // off-cycle year
      due = anniversary(entity.formedOn, y);
    }
    if (!due) return null;
    if (due.getTime() < formed.getTime()) return null; // first cycle always falls on/after formation
    return due;
  };
  const ruleNote =
    ob.anchor === "calendarFixed"
      ? `${ob.recurring}, fixed ${ob.dueMonth}/${ob.dueDay}`
      : `${ob.recurring}, formation anniversary (${fmtDate(formed).slice(5)})${interval === 2 ? ", even-cycle from formation year" : ""}`;

  // Scan from first eligible year forward; the EARLIEST UNFILED period decides
  // (an unfiled 2020 obligation in 2026 is delinquent since 2020, not "current year").
  let anyDueYear = false;
  for (let y = formationYear; y <= asOf.getUTCFullYear() + interval; y++) {
    const due = dueInYear(y);
    if (!due) continue;
    anyDueYear = true;
    if (filed.has(String(y))) continue;
    const overdue = due.getTime() < asOf.getTime();
    const dueSoon = !overdue && due.getTime() - asOf.getTime() <= 45 * 86400000;
    return {
      applies: true,
      dueOn: fmtDate(due),
      period: y,
      status: overdue ? "delinquent" : dueSoon ? "due-soon" : "scheduled",
      ruleNote,
    };
  }
  if (!anyDueYear)
    return { applies: true, dueOn: null, period: null, status: "n/a", ruleNote: `recurring rule produced no valid due date (${ruleNote}) — verify rule data` };
  // every period through asOf+interval filed → next cycle
  const y = asOf.getUTCFullYear() + interval;
  const due = dueInYear(y) ?? anniversary(entity.formedOn, y);
  return { applies: true, dueOn: fmtDate(due), period: y, status: "scheduled", ruleNote };
}

/* ---------- matrix ---------- */

/**
 * Build the entities × obligations compliance matrix.
 * @param {{ asOf: string, entities: any[], obligations: any[], filings?: any[], soonDays?: number }} input
 * @returns {{ asOf: string, grid: Array<Array<any>>, entities: any[], obligations: any[],
 *             delinquent: Array<{entityId:string,entityName:string,obligationId:string,obligationName:string,dueOn:string,overdueDays:number}>,
 *             counts: { cells: number, delinquent: number, "due-soon": number, scheduled: number, satisfied: number, "n/a": number } }}
 */
export function buildMatrix(input) {
  const soonDays = input.soonDays ?? 45;
  const grid = (input.entities ?? []).map((entity) =>
    (input.obligations ?? []).map((ob) => {
      const r = nextDue(ob, entity, input.filings ?? [], input.asOf);
      // re-evaluate due-soon with configurable window
      if (r.status === "scheduled" && r.dueOn) {
        const due = parseDate(r.dueOn);
        const asOf = parseDate(input.asOf);
        if (due.getTime() - asOf.getTime() <= soonDays * 86400000) r.status = "due-soon";
      }
      return { entity: entity.id, obligation: ob.id, ...r };
    })
  );

  const delinquent = [];
  const counts = { cells: 0, delinquent: 0, "due-soon": 0, scheduled: 0, satisfied: 0, "n/a": 0 };
  (input.entities ?? []).forEach((entity, r) => {
    (input.obligations ?? []).forEach((ob, c) => {
      const cell = grid[r][c];
      counts.cells++;
      if (cell.status in counts) counts[cell.status]++;
      if (cell.status === "delinquent") {
        const asOf = parseDate(input.asOf);
        delinquent.push({
          entityId: entity.id,
          entityName: entity.name,
          obligationId: ob.id,
          obligationName: ob.name,
          dueOn: cell.dueOn,
          overdueDays: Math.round((asOf.getTime() - parseDate(cell.dueOn).getTime()) / 86400000),
        });
      }
    });
  });
  delinquent.sort((a, b) => b.overdueDays - a.overdueDays);
  return { asOf: input.asOf, grid, entities: input.entities, obligations: input.obligations, delinquent, counts };
}

/* ---------- exports ---------- */

function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV export of the matrix (entity × obligation rows).
 * @param {any} matrix — output of buildMatrix
 * @returns {string} */
export function toCsv(matrix) {
  const header = ["entityId", "entity", "jurisdiction", "obligationId", "obligation", "recurring", "status", "nextDue", "period", "statuteCite", "ruleNote", "skipReason"];
  const rows = [];
  matrix.entities.forEach((e, r) => {
    matrix.obligations.forEach((o, c) => {
      const cell = matrix.grid[r][c];
      rows.push([e.id, e.name, e.jurisdiction, o.id, o.name, o.recurring, cell.status, cell.dueOn ?? "", cell.period ?? "", o.statuteCite ?? "", cell.ruleNote, cell.skipReason ?? ""]);
    });
  });
  return [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n") + "\n";
}

function icsEscape(s) {
  return String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
function fold(line) {
  const out = [];
  let rest = line;
  const len = (s) => new TextEncoder().encode(s).length;
  while (len(rest) > 75) {
    let cut = 74;
    while (cut > 1 && len(rest.slice(0, cut + 1)) > 74) cut--;
    out.push(rest.slice(0, cut));
    rest = " " + rest.slice(cut);
  }
  out.push(rest);
  return out.join("\r\n");
}
function ymd(d) {
  return String(d).replace(/-/g, "");
}

/**
 * ICS export: one VEVENT per actionable cell (delinquent, due-soon,
 * scheduled) at its next due date, with RRULE for annual/biennial
 * recurrence, statutory cite in the description, and a 30-day alarm.
 * @param {any} matrix
 * @returns {string} */
export function toICS(matrix) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//open-legal-artifacts//entity-compliance-calendar//EN", "CALSCALE:GREGORIAN"];
  matrix.entities.forEach((e, r) => {
    matrix.obligations.forEach((o, c) => {
      const cell = matrix.grid[r][c];
      if (!cell.dueOn || cell.status === "satisfied" || cell.status === "n/a") return;
      const desc = [
        `${e.name} [${e.id}] — ${o.name}`,
        `Statute (fictional): ${o.statuteCite ?? "n/a"}`,
        `Rule: ${cell.ruleNote}`,
        cell.status === "delinquent" ? "STATUS: DELINQUENT — cure immediately (fictional data)" : `Status: ${cell.status}`,
        "Rules-as-data defaults; verify against current statute. Not legal advice.",
      ].join("\\n");
      lines.push(
        "BEGIN:VEVENT",
        `UID:${e.id}-${o.id}-${ymd(cell.dueOn)}@open-legal-artifacts`,
        `DTSTAMP:${ymd(matrix.asOf)}T000000Z`,
        `DTSTART;VALUE=DATE:${ymd(cell.dueOn)}`,
        `SUMMARY:${icsEscape((cell.status === "delinquent" ? "[DELINQUENT] " : "") + o.name + " — " + e.name + " (" + e.jurisdiction + ")")}`,
        fold(`DESCRIPTION:${desc}`),
        ...(o.recurring === "annual" ? ["RRULE:FREQ=YEARLY"] : []),
        ...(o.recurring === "biennial" ? ["RRULE:FREQ=YEARLY;INTERVAL=2"] : []),
        "BEGIN:VALARM",
        "TRIGGER:-P30D",
        "ACTION:DISPLAY",
        fold(`DESCRIPTION:${icsEscape("Filing window — " + o.name + " (" + e.name + ")")}`),
        "END:VALARM",
        "END:VEVENT"
      );
    });
  });
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
