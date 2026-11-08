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
 * Applicability: an obligation binds a home entity by formation jurisdiction,
 * or a foreign entity that holds a qualification in the obligation's
 * jurisdiction (`entity.qualifications: [{ jurisdiction, qualifiedOn }]`); in
 * that case all anchor math uses `qualifiedOn` instead of `formedOn`.
 *
 * Missing anchor data (no formation / qualification date) resolves to the
 * `unknown` status — distinct from `n/a`, which means the rule provably does
 * not apply (wrong jurisdiction/type, inactive entity, impossible rule data).
 *
 * @param {any} ob — obligation rule: { id, jurisdiction, entityTypes?, recurring: "annual"|"biennial"|"event", anchor: "formationAnniversary"|"calendarFixed"|"formation", dueMonth?, dueDay?, dueWithinDays?, name, statuteCite?, effectiveFrom?, verifiedOn? }
 * @param {any} entity — { id, jurisdiction, type, formedOn, status?, qualifications?: [{ jurisdiction, qualifiedOn }] }
 * @param {Array<any>} filings — [{ entityId, obligationId, period: number|"once", filedOn, fee? }]
 * @param {string} asOfIso
 * @returns {{ applies: boolean, skipReason?: string, dueOn: string|null, period: number|"once"|null, status: "delinquent"|"due-soon"|"scheduled"|"satisfied"|"unknown"|"n/a", ruleNote: string, ruleStale: boolean }}
 */
export function nextDue(ob, entity, filings, asOfIso) {
  const r = computeNextDue(ob, entity, filings, asOfIso);
  // Rule provenance: verifiedOn older than 365d before asOf flags the cell as
  // riding on a stale rule. Metadata only — never changes the computed status.
  const v = parseDate(ob?.verifiedOn);
  const asOf = parseDate(asOfIso);
  const ruleStale = r.applies && !!v && !!asOf && (asOf.getTime() - v.getTime()) / 86400000 > 365;
  return { ...r, ruleStale };
}

function computeNextDue(ob, entity, filings, asOfIso) {
  const asOf = parseDate(asOfIso);

  // Applicability
  if ((ob.entityTypes ?? []).length && !(ob.entityTypes ?? []).includes(entity.type))
    return { applies: false, skipReason: `entity type "${entity.type}" not in [${ob.entityTypes.join(", ")}]`, dueOn: null, period: null, status: "n/a", ruleNote: "" };
  const isHome = ob.jurisdiction === entity.jurisdiction;
  const qual = !isHome ? (entity.qualifications ?? []).find((q) => q.jurisdiction === ob.jurisdiction) : null;
  if (!isHome && !qual)
    return { applies: false, skipReason: `obligation jurisdiction ${ob.jurisdiction} ≠ entity jurisdiction ${entity.jurisdiction} and no foreign qualification there`, dueOn: null, period: null, status: "n/a", ruleNote: "" };
  if (String(entity.status ?? "active") !== "active")
    return { applies: false, skipReason: `entity status "${entity.status}" — tracking paused`, dueOn: null, period: null, status: "n/a", ruleNote: "" };

  // Anchor: formation date at home, qualification date abroad.
  const anchorIso = isHome ? entity.formedOn : qual.qualifiedOn;
  const anchorKind = isHome ? "formation" : `foreign qualification in ${ob.jurisdiction}`;

  const filed = new Set(
    (filings ?? [])
      .filter((f) => f.entityId === entity.id && f.obligationId === ob.id)
      .map((f) => String(f.period))
  );

  // Event-driven (e.g. initial report within N days of the anchor event)
  if (ob.recurring === "event") {
    const anchor = parseDate(anchorIso);
    if (!anchor) return { applies: true, dueOn: null, period: null, status: "unknown", ruleNote: `${anchorKind} date missing — cannot compute event obligation` };
    const due = new Date(anchor.getTime() + (ob.dueWithinDays ?? 90) * 86400000);
    const period = "once";
    if (filed.has(period)) return { applies: true, dueOn: fmtDate(due), period, status: "satisfied", ruleNote: `event obligation satisfied (filing recorded)` };
    const overdue = due.getTime() < asOf.getTime();
    return {
      applies: true,
      dueOn: fmtDate(due),
      period,
      status: overdue ? "delinquent" : "scheduled",
      ruleNote: `event: ${ob.dueWithinDays ?? 90}d after ${anchorKind} (${fmtDate(anchor)})`,
    };
  }

  // Recurring: annual or biennial, anchored to formation (home) or qualification (abroad)
  const formed = parseDate(anchorIso);
  if (!formed) return { applies: true, dueOn: null, period: null, status: "unknown", ruleNote: `${anchorKind} date missing` };
  const formationYear = formed.getUTCFullYear();
  const interval = ob.recurring === "biennial" ? 2 : 1;

  /** due date for period year y, or null if the year is off-cycle / before anchor / fixed date impossible */
  const dueInYear = (y) => {
    let due = null;
    if (ob.anchor === "calendarFixed") {
      if (interval === 2 && (y - formationYear) % 2 !== 0) return null; // fixed biennial honors anchor-year parity
      due = fixedDate(ob.dueMonth, ob.dueDay, y);
    } else {
      if ((y - formationYear) % interval !== 0) return null; // off-cycle year
      due = anniversary(anchorIso, y);
    }
    if (!due) return null;
    if (due.getTime() < formed.getTime()) return null; // first cycle always falls on/after the anchor
    return due;
  };
  const anchorLabel = isHome ? "formation" : "qualification";
  const ruleNote =
    ob.anchor === "calendarFixed"
      ? `${ob.recurring}, fixed ${ob.dueMonth}/${ob.dueDay}`
      : `${ob.recurring}, ${anchorLabel} anniversary (${fmtDate(formed).slice(5)})${interval === 2 ? ", even-cycle from anchor year" : ""}`;

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
  const due = dueInYear(y) ?? anniversary(anchorIso, y);
  return { applies: true, dueOn: fmtDate(due), period: y, status: "scheduled", ruleNote };
}

/* ---------- matrix ---------- */

/** Good-standing state for one entity: confirmed recently → ok, >365d → stale, never → unknown.
 * @param {any} entity @param {Date} asOf @returns {"ok"|"stale"|"unknown"} */
function standingState(entity, asOf) {
  const gs = parseDate(entity.goodStandingConfirmedOn);
  if (!gs) return "unknown";
  return (asOf.getTime() - gs.getTime()) / 86400000 > 365 ? "stale" : "ok";
}

/** Fee of the LATEST filing (max filedOn; ties → later in list) recorded for one entity × obligation.
 * @param {Array<any>} filings @param {string} entityId @param {string} obligationId @returns {number|null} */
function lastFilingFee(filings, entityId, obligationId) {
  let best = null;
  for (const f of filings)
    if (f.entityId === entityId && f.obligationId === obligationId && f.fee != null)
      if (!best || String(f.filedOn ?? "") >= String(best.filedOn ?? "")) best = f;
  return best ? best.fee : null;
}

/**
 * Build the entities × obligations compliance matrix.
 * @param {{ asOf: string, entities: any[], obligations: any[], filings?: any[], soonDays?: number }} input
 * @returns {{ asOf: string, grid: Array<Array<any>>, entities: any[], obligations: any[],
 *             delinquent: Array<{entityId:string,entityName:string,obligationId:string,obligationName:string,dueOn:string,overdueDays:number}>,
 *             counts: { cells: number, delinquent: number, "due-soon": number, scheduled: number, satisfied: number, unknown: number, "n/a": number },
 *             feeTotals: { recorded: number, byEntity: Record<string, number> },
 *             goodStanding: Array<{entityId:string,entityName:string,jurisdiction:string,confirmedOn:string|null,state:"ok"|"stale"|"unknown"}> }}
 */
export function buildMatrix(input) {
  const soonDays = input.soonDays ?? 45;
  const filings = input.filings ?? [];
  const grid = (input.entities ?? []).map((entity) =>
    (input.obligations ?? []).map((ob) => {
      const r = nextDue(ob, entity, filings, input.asOf);
      // re-evaluate due-soon with configurable window
      if (r.status === "scheduled" && r.dueOn) {
        const due = parseDate(r.dueOn);
        const asOf = parseDate(input.asOf);
        if (due.getTime() - asOf.getTime() <= soonDays * 86400000) r.status = "due-soon";
      }
      return { entity: entity.id, obligation: ob.id, fee: lastFilingFee(filings, entity.id, ob.id), ...r };
    })
  );

  const delinquent = [];
  const counts = { cells: 0, delinquent: 0, "due-soon": 0, scheduled: 0, satisfied: 0, unknown: 0, "n/a": 0 };
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
  const asOfDate = parseDate(input.asOf);
  const feeTotals = { recorded: 0, byEntity: Object.fromEntries((input.entities ?? []).map((e) => [e.id, 0])) };
  for (const f of filings)
    if (typeof f.fee === "number" && f.entityId in feeTotals.byEntity) {
      feeTotals.byEntity[f.entityId] += f.fee;
      feeTotals.recorded += f.fee;
    }
  const goodStanding = (input.entities ?? []).map((e) => ({
    entityId: e.id,
    entityName: e.name,
    jurisdiction: e.jurisdiction,
    confirmedOn: e.goodStandingConfirmedOn ?? null,
    state: standingState(e, asOfDate),
  }));
  return { asOf: input.asOf, grid, entities: input.entities, obligations: input.obligations, delinquent, counts, feeTotals, goodStanding };
}

/* ---------- filing-window report ---------- */

/**
 * Bucket actionable cells (delinquent / due-soon / scheduled) into cumulative
 * filing windows (default 30/60/90/180 days). Overdue items (negative daysOut)
 * appear in every bucket. `satisfied`, `n/a`, and `unknown` cells are excluded.
 * @param {any} matrix — output of buildMatrix
 * @param {number[]} [windows]
 * @returns {{ asOf: string, actionable: Array<any>, windows: Array<{ days: number, count: number, items: Array<any> }> }}
 */
export function report(matrix, windows = [30, 60, 90, 180]) {
  const asOf = parseDate(matrix.asOf);
  const actionable = [];
  matrix.entities.forEach((e, r) =>
    matrix.obligations.forEach((o, c) => {
      const cell = matrix.grid[r][c];
      if (!cell.dueOn || cell.status === "satisfied" || cell.status === "n/a" || cell.status === "unknown") return;
      const due = parseDate(cell.dueOn);
      actionable.push({
        entityId: e.id,
        entityName: e.name,
        obligationId: o.id,
        obligationName: o.name,
        dueOn: cell.dueOn,
        status: cell.status,
        daysOut: Math.round((due.getTime() - asOf.getTime()) / 86400000),
      });
    })
  );
  actionable.sort((a, b) => a.daysOut - b.daysOut);
  const wins = [...new Set(windows)].sort((a, b) => a - b).map((days) => {
    const items = actionable.filter((x) => x.daysOut <= days);
    return { days, count: items.length, items };
  });
  return { asOf: matrix.asOf, actionable, windows: wins };
}

/* ---------- health audit ---------- */

/**
 * Deterministic portfolio health audit. Flags (all fictional heuristics, [verify] before operational use):
 * - `missing-formedOn` — no parseable formation date;
 * - `dormant-dissolution-candidate` — status "dormant" and dormant (dormantSince ?? formedOn) > 5 years;
 * - `good-standing-unknown` / `good-standing-stale` — no / >365d-old goodStandingConfirmedOn (skipped for dissolved entities);
 * - `foreign-qualification-gap` — entity.footprint lists a jurisdiction ≠ formation state with no qualification there.
 * @param {{ asOf: string, entities: any[], obligations?: any[] }} input
 * @returns {{ asOf: string, flags: Array<{code:string,entityId:string,entityName:string,jurisdiction?:string,detail:string}>, counts: { flags: number, byCode: Record<string,number> } }}
 */
export function auditHealth(input) {
  const asOf = parseDate(input.asOf);
  const flags = [];
  for (const e of input.entities ?? []) {
    const formed = parseDate(e.formedOn);
    if (!formed)
      flags.push({ code: "missing-formedOn", entityId: e.id, entityName: e.name, jurisdiction: e.jurisdiction, detail: "no parseable formation date — deadlines and entity age cannot be computed" });
    if (String(e.status ?? "active") === "dormant") {
      const since = parseDate(e.dormantSince) ?? formed;
      const days = since ? Math.round((asOf.getTime() - since.getTime()) / 86400000) : null;
      if (days !== null && days > 5 * 365)
        flags.push({ code: "dormant-dissolution-candidate", entityId: e.id, entityName: e.name, jurisdiction: e.jurisdiction, detail: `dormant ${days}d (>5y since ${fmtDate(since)}) — dissolution candidate [verify with agent]` });
    }
    if (String(e.status ?? "active") !== "dissolved") {
      const gs = parseDate(e.goodStandingConfirmedOn);
      if (!gs)
        flags.push({ code: "good-standing-unknown", entityId: e.id, entityName: e.name, jurisdiction: e.jurisdiction, detail: "no good-standing confirmation on record (goodStandingConfirmedOn missing)" });
      else {
        const days = Math.round((asOf.getTime() - gs.getTime()) / 86400000);
        if (days > 365)
          flags.push({ code: "good-standing-stale", entityId: e.id, entityName: e.name, jurisdiction: e.jurisdiction, detail: `last good-standing confirmation ${fmtDate(gs)} (${days}d old, >365d)` });
      }
    }
    const quals = new Set((e.qualifications ?? []).map((q) => q.jurisdiction));
    for (const j of e.footprint ?? [])
      if (j !== e.jurisdiction && !quals.has(j))
        flags.push({ code: "foreign-qualification-gap", entityId: e.id, entityName: e.name, jurisdiction: j, detail: `footprint includes ${j} but entity holds no qualification there [verify with agent]` });
  }
  const byCode = {};
  for (const f of flags) byCode[f.code] = (byCode[f.code] ?? 0) + 1;
  return { asOf: input.asOf, flags, counts: { flags: flags.length, byCode } };
}

/* ---------- registered-agent report ingestion (fictional CSV format) ---------- */

/** Minimal CSV parser: quoted fields, embedded commas/quotes, CRLF. @param {string} text @returns {string[][]} */
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  const s = String(text ?? "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQ) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); field = ""; rows.push(row); row = []; }
    else if (ch !== "\r") field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || (r[0] ?? "") !== "");
}

/** Normalize an entity name for matching: lowercase, punctuation → spaces, collapsed.
 * "Acme Holdings, LLC" ≡ "ACME Holdings LLC". @param {string} s @returns {string} */
function normName(s) {
  return String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Ingest a fictional registered-agent report CSV (header required):
 * `Report Date,Entity Name,Jurisdiction,Status,Good Standing` with Yes/No standing.
 * Matches entities by normalized name (case/punctuation-insensitive), disambiguated
 * by jurisdiction when several entities share a name. Returns an auditable diff —
 * nothing is applied here; pair with applyFilingUpdates.
 * @param {any[]} entities @param {string} csvText
 * @returns {{ reportDate: string|null, matched: any[], unmatched: any[], notInReport: any[] }}
 */
export function ingestAgentReport(entities, csvText) {
  const rows = parseCsv(csvText);
  const none = { reportDate: null, matched: [], unmatched: [], notInReport: (entities ?? []).map((e) => ({ entityId: e.id, entityName: e.name })) };
  if (!rows.length) return none;
  const header = rows[0].map((h) => String(h).toLowerCase().replace(/[^a-z0-9]/g, ""));
  const idx = (names) => header.findIndex((h) => names.includes(h));
  const iDate = idx(["reportdate", "date"]), iName = idx(["entityname", "name", "entity"]);
  const iJur = idx(["jurisdiction", "domicile"]), iStatus = idx(["status"]), iGs = idx(["goodstanding", "standing"]);
  if (iName < 0) throw new Error("agent report CSV must have an Entity Name column");
  const byName = new Map();
  for (const e of entities ?? []) {
    const k = normName(e.name);
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(e);
  }
  const matched = [], unmatched = [];
  let reportDate = null;
  for (const r of rows.slice(1)) {
    const reportName = String(r[iName] ?? "");
    const jur = String((iJur >= 0 ? r[iJur] : "") ?? "");
    if (iDate >= 0 && r[iDate] && !reportDate) reportDate = String(r[iDate]);
    let cands = byName.get(normName(reportName)) ?? [];
    if (cands.length > 1 && jur) cands = cands.filter((e) => e.jurisdiction === jur);
    if (cands.length === 1)
      matched.push({
        entityId: cands[0].id,
        entityName: cands[0].name,
        reportName,
        jurisdiction: jur || cands[0].jurisdiction,
        status: String((iStatus >= 0 ? r[iStatus] : "") ?? "").trim(),
        goodStanding: /^(yes|true|1|good)$/i.test(String(iGs >= 0 ? r[iGs] : "")),
        reportDate: (iDate >= 0 ? r[iDate] : null) ?? null,
      });
    else
      unmatched.push({ reportName, jurisdiction: jur, reason: cands.length === 0 ? "no entity matched by normalized name" : "ambiguous name match (same normalized name and jurisdiction)" });
  }
  const matchedIds = new Set(matched.map((m) => m.entityId));
  return {
    reportDate,
    matched,
    unmatched,
    notInReport: (entities ?? []).filter((e) => !matchedIds.has(e.id)).map((e) => ({ entityId: e.id, entityName: e.name })),
  };
}

/**
 * Apply an ingest diff to entities — pure, two-phase. Default is a dry run that
 * only proposes updates (`{ entityId, field, from, to }`); `{ confirm: true }`
 * returns a new entities array with goodStandingConfirmedOn (= report date) and
 * status aligned to the report. The input array is never mutated; a second run
 * is a no-op (idempotent).
 * @param {any[]} entities @param {any} ingest — output of ingestAgentReport
 * @param {{ confirm?: boolean }} [opts]
 * @returns {{ entities: any[], updates: Array<{entityId:string,field:string,from:any,to:any}>, applied: boolean }}
 */
export function applyFilingUpdates(entities, ingest, { confirm = false } = {}) {
  const list = entities ?? [];
  const updates = [];
  for (const m of ingest?.matched ?? []) {
    const e = list.find((x) => x.id === m.entityId);
    if (!e) continue;
    const rd = ingest.reportDate ?? m.reportDate ?? null;
    if (m.goodStanding && rd && e.goodStandingConfirmedOn !== rd)
      updates.push({ entityId: e.id, field: "goodStandingConfirmedOn", from: e.goodStandingConfirmedOn ?? null, to: rd });
    const st = String(m.status ?? "").toLowerCase();
    if (st && st !== String(e.status ?? "active").toLowerCase())
      updates.push({ entityId: e.id, field: "status", from: e.status ?? "active", to: st });
  }
  if (!confirm) return { entities: list, updates, applied: false };
  const next = list.map((e) => {
    const us = updates.filter((u) => u.entityId === e.id);
    return us.length ? { ...e, ...Object.fromEntries(us.map((u) => [u.field, u.to])) } : e;
  });
  return { entities: next, updates, applied: true };
}

/* ---------- exports ---------- */

function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV export of the matrix (entity × obligation rows) with rule provenance
 * (verifiedOn, ruleStale), entity good-standing state, and the latest filing
 * fee per cell.
 * @param {any} matrix — output of buildMatrix
 * @returns {string} */
export function toCsv(matrix) {
  const header = ["entityId", "entity", "jurisdiction", "obligationId", "obligation", "recurring", "status", "nextDue", "period", "statuteCite", "ruleNote", "skipReason", "goodStanding", "fee", "verifiedOn", "ruleStale"];
  const gsByEntity = Object.fromEntries((matrix.goodStanding ?? []).map((g) => [g.entityId, g.state]));
  const rows = [];
  matrix.entities.forEach((e, r) => {
    matrix.obligations.forEach((o, c) => {
      const cell = matrix.grid[r][c];
      rows.push([e.id, e.name, e.jurisdiction, o.id, o.name, o.recurring, cell.status, cell.dueOn ?? "", cell.period ?? "", o.statuteCite ?? "", cell.ruleNote, cell.skipReason ?? "", gsByEntity[e.id] ?? "", cell.fee ?? "", o.verifiedOn ?? "", cell.ruleStale ? "true" : ""]);
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
 * recurrence, statutory cite, good-standing state, rule-staleness caveat,
 * and a 30-day alarm.
 * @param {any} matrix
 * @returns {string} */
export function toICS(matrix) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//open-legal-artifacts//entity-compliance-calendar//EN", "CALSCALE:GREGORIAN"];
  const gsByEntity = Object.fromEntries((matrix.goodStanding ?? []).map((g) => [g.entityId, g]));
  matrix.entities.forEach((e, r) => {
    matrix.obligations.forEach((o, c) => {
      const cell = matrix.grid[r][c];
      if (!cell.dueOn || cell.status === "satisfied" || cell.status === "n/a" || cell.status === "unknown") return;
      const gs = gsByEntity[e.id];
      const desc = [
        `${e.name} [${e.id}] — ${o.name}`,
        `Statute (fictional): ${o.statuteCite ?? "n/a"}`,
        `Rule: ${cell.ruleNote}`,
        o.verifiedOn ? `Rule verified: ${o.verifiedOn}${cell.ruleStale ? " — STALE (>365d): re-verify before relying" : ""}` : "Rule verified: unknown",
        gs ? `Good standing: ${gs.state}${gs.confirmedOn ? ` (confirmed ${gs.confirmedOn})` : ""}` : "",
        cell.status === "delinquent" ? "STATUS: DELINQUENT — cure immediately (fictional data)" : `Status: ${cell.status}`,
        "Rules-as-data defaults; verify against current statute. Not legal advice.",
      ].filter(Boolean).join("\\n");
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
