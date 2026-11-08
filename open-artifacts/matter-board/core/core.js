/**
 * matter-board — deterministic core.
 *
 * Matter tracking board whose core is CHANGE DETECTION: diff two matter
 * snapshots, flag field changes with timestamps, surface deadline risk, and
 * export JSON/CSV. Snapshots are plain JSON (from practice-management
 * exports, spreadsheets, or an optional LLM extraction step).
 *
 * Dependency-free plain-JavaScript ES module; browser + Node compatible.
 * No hidden clocks: deadline math anchors to caller-supplied `asOf`.
 * @module core
 */

/* ---------- helpers ---------- */

/** Parse "YYYY-MM-DD" to UTC Date (null when unparseable — never guessed).
 * @param {string|null|undefined} d
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

/** Days from asOf to d (negative = overdue). Null-safe.
 * @param {Date|null} d @param {Date} asOf @returns {number|null} */
export function daysUntil(d, asOf) {
  if (!d) return null;
  return Math.round((d.getTime() - asOf.getTime()) / 86400000);
}

/** Matter fields tracked for change detection, in canonical order.
 * @type {string[]} */
export const TRACKED_FIELDS = ["name", "client", "owner", "stage", "nextStep", "nextDeadline", "status", "notes"];

/** Field-change severity classification (rules-as-data; override per board).
 * @type {Record<string, "critical"|"major"|"minor">} */
export const DEFAULT_FIELD_SEVERITY = {
  nextDeadline: "critical", // deadline changes can be malpractice-adjacent
  owner: "major",
  stage: "major",
  status: "major",
  name: "minor",
  client: "major",
  nextStep: "minor",
  notes: "minor",
};

/* ---------- change detection ---------- */

/**
 * Diff two matter snapshots by matter id. For every changed field, the change
 * carries a timestamp: the matter's own `updatedAt` in the newer snapshot
 * when present, else the newer snapshot's `capturedAt`.
 *
 * @param {{ capturedAt: string, matters: Array<any> }} prev
 * @param {{ capturedAt: string, matters: Array<any> }} curr
 * @param {Record<string, "critical"|"major"|"minor">} [fieldSeverity]
 * @returns {{
 *   prevCapturedAt: string, currCapturedAt: string,
 *   added: any[], removed: any[],
 *   changed: Array<{ id: string, name: string, field: string, from: any, to: any, severity: string, changedAt: string, source: string }>,
 *   counts: { added: number, removed: number, changed: number, critical: number }
 * }}
 */
export function diffSnapshots(prev, curr, fieldSeverity = {}) {
  const sev = { ...DEFAULT_FIELD_SEVERITY, ...fieldSeverity };
  const prevMap = new Map((prev.matters ?? []).map((m) => [String(m.id), m]));
  const currMap = new Map((curr.matters ?? []).map((m) => [String(m.id), m]));

  const added = [...currMap.values()].filter((m) => !prevMap.has(String(m.id)));
  const removed = [...prevMap.values()].filter((m) => !currMap.has(String(m.id)));

  /** @type {Array<{id:string,name:string,field:string,from:any,to:any,severity:string,changedAt:string,source:string}>} */
  const changed = [];
  for (const [id, c] of currMap) {
    const p = prevMap.get(id);
    if (!p) continue;
    for (const f of TRACKED_FIELDS) {
      const pv = p[f] ?? null;
      const cv = c[f] ?? null;
      if (String(pv ?? "") !== String(cv ?? "")) {
        const matterTs = c.updatedAt ?? null;
        changed.push({
          id,
          name: c.name ?? p.name ?? id,
          field: f,
          from: pv,
          to: cv,
          severity: sev[f] ?? "minor",
          changedAt: matterTs ?? curr.capturedAt,
          source: matterTs ? "matter.updatedAt" : "snapshot.capturedAt",
        });
      }
    }
  }
  changed.sort((a, b) => String(a.changedAt).localeCompare(String(b.changedAt)) || a.id.localeCompare(b.id) || a.field.localeCompare(b.field));

  return {
    prevCapturedAt: prev.capturedAt,
    currCapturedAt: curr.capturedAt,
    added,
    removed,
    changed,
    counts: {
      added: added.length,
      removed: removed.length,
      changed: changed.length,
      critical: changed.filter((c) => c.severity === "critical").length,
    },
  };
}

/* ---------- board view ---------- */

/**
 * Build a stage-grouped board from a snapshot with deadline risk flags.
 * Optional `owner` / `risk` filters narrow the portfolio; flags and counts
 * always agree with what is shown.
 * @param {{ capturedAt: string, matters: Array<any> }} snapshot
 * @param {string} asOfIso — anchor for overdue/soon computation
 * @param {{ soonDays?: number, stageOrder?: string[], owner?: string, risk?: string }} [opts]
 * @returns {{
 *   capturedAt: string, asOf: string,
 *   stages: Array<{ stage: string, matters: Array<any> }>,
 *   flagged: Array<{ id: string, name: string, flag: string, deadline: string, days: number }>,
 *   counts: { matters: number, risk: Record<string, number>, conflictsOpen: number }
 * }}
 */
export function buildBoard(snapshot, asOfIso, opts = {}) {
  const soonDays = opts.soonDays ?? 14;
  const asOf = parseDate(asOfIso);
  const filtered = (snapshot.matters ?? []).filter(
    (m) =>
      (opts.owner === undefined || m.owner === opts.owner) &&
      (opts.risk === undefined || m.risk === opts.risk)
  );
  const ordered = opts.stageOrder ?? [];
  const stageOrder = [...ordered, ...[...new Set(filtered.map((m) => m.stage ?? "unassigned"))].filter((s) => !ordered.includes(s))];

  const matters = [...filtered].sort(
    (a, b) => String(a.nextDeadline ?? "9999").localeCompare(String(b.nextDeadline ?? "9999")) || String(a.id).localeCompare(String(b.id))
  );
  // every filtered matter lands in exactly one column (unlisted stages appended)
  const stages = stageOrder.map((stage) => ({ stage, matters: matters.filter((m) => (m.stage ?? "unassigned") === stage) }));

  /** @type {Array<{id:string,name:string,flag:string,deadline:string,days:number}>} */
  const flagged = [];
  if (asOf) {
    for (const m of filtered) {
      const d = parseDate(m.nextDeadline ?? null);
      const days = daysUntil(d, asOf);
      if (days === null) continue;
      if (days < 0) flagged.push({ id: String(m.id), name: m.name ?? String(m.id), flag: "overdue", deadline: m.nextDeadline, days });
      else if (days <= soonDays) flagged.push({ id: String(m.id), name: m.name ?? String(m.id), flag: "due-soon", deadline: m.nextDeadline, days });
    }
    flagged.sort((a, b) => a.days - b.days || a.id.localeCompare(b.id));
  }

  const counts = {
    matters: filtered.length,
    risk: { high: 0, medium: 0, low: 0 },
    conflictsOpen: filtered.filter((m) => m.conflicts === "open").length,
  };
  for (const m of filtered) if (m.risk != null && m.risk !== "__proto__") counts.risk[m.risk] = (counts.risk[m.risk] ?? 0) + 1;

  return { capturedAt: snapshot.capturedAt, asOf: asOfIso, stages, flagged, counts };
}

/* ---------- anomaly layer ---------- */

/** Days after which a matter without an `updatedAt` within the window is stale.
 * @type {number} */
export const DEFAULT_STALE_DAYS = 30;

/** Fields every matter should carry; a null/missing one is an anomaly.
 * @type {string[]} */
export const DEFAULT_REQUIRED_FIELDS = ["name", "owner", "stage", "nextDeadline"];

/**
 * Rules-as-data anomaly checks over a snapshot (parity with the closed
 * counterpart's prompt-prose rules, but deterministic and tested):
 * - `stale` — no `updatedAt`, or last update older than `staleDays` before `asOf`;
 * - `missing-field` — a required field is null/missing/empty;
 * - `closed-with-deadline` — matter at `closedStage` still carries a parseable deadline.
 * @param {{ capturedAt: string, matters: Array<any> }} snapshot
 * @param {string} asOfIso — anchor for staleness computation (no hidden clocks)
 * @param {{ staleDays?: number, required?: string[], closedStage?: string }} [opts]
 * @returns {Array<{ id: string, name: string, anomaly: string, detail: string }>}
 */
export function detectAnomalies(snapshot, asOfIso, opts = {}) {
  const staleDays = opts.staleDays ?? DEFAULT_STALE_DAYS;
  const required = opts.required ?? DEFAULT_REQUIRED_FIELDS;
  const closedStage = opts.closedStage ?? "closed";
  const asOf = parseDate(asOfIso);
  if (!asOf) {
    throw new Error(`detectAnomalies: asOfIso must be "YYYY-MM-DD" (got ${JSON.stringify(asOfIso)}) — staleness must not be silently skipped (no hidden clocks)`);
  }

  /** @type {Array<{id:string,name:string,anomaly:string,detail:string}>} */
  const anomalies = [];
  for (const m of snapshot.matters ?? []) {
    const id = String(m.id);
    const name = m.name ?? id;

    const updated = m.updatedAt ? new Date(m.updatedAt) : null;
    if (!updated || Number.isNaN(updated.getTime())) {
      anomalies.push({ id, name, anomaly: "stale", detail: "no updatedAt" });
    } else if (asOf) {
      const ageDays = -Math.round((updated.getTime() - asOf.getTime()) / 86400000);
      if (ageDays > staleDays) anomalies.push({ id, name, anomaly: "stale", detail: `updatedAt ${m.updatedAt} is ${ageDays}d before asOf` });
    }

    for (const f of required) {
      if (m[f] === undefined || m[f] === null || m[f] === "") anomalies.push({ id, name, anomaly: "missing-field", detail: f });
    }

    if ((m.stage ?? "") === closedStage && parseDate(m.nextDeadline ?? null)) {
      anomalies.push({ id, name, anomaly: "closed-with-deadline", detail: `deadline ${m.nextDeadline} stands after stage=${closedStage}` });
    }
  }
  anomalies.sort((a, b) => a.id.localeCompare(b.id) || a.anomaly.localeCompare(b.anomaly) || a.detail.localeCompare(b.detail));
  return anomalies;
}

/* ---------- CSV ingest ---------- */

/** RFC4180 subset parser: quoted cells, embedded commas/quotes/newlines, CRLF or LF.
 * @param {string} text @returns {string[][]} */
function parseCsvRows(text) {
  /** @type {string[][]} */
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  const s = String(text);
  const endRow = () => {
    row.push(cell);
    cell = "";
    if (row.length > 1 || row[0] !== "") rows.push(row); // skip blank lines
    row = [];
  };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      endRow();
    } else cell += c;
  }
  if (cell !== "" || row.length) endRow();
  return rows;
}

/**
 * Ingest a CSV export (header row + one matter per row) into a snapshot —
 * the closed counterpart's headline input ("spreadsheets"), with zero LLM.
 * Empty cells become explicit `null` so the anomaly layer can catch them.
 * The capture time must come from the caller; it is never guessed.
 * @param {string} csv
 * @param {{ capturedAt: string, source?: string }} opts
 * @returns {{ capturedAt: string, source: string, matters: Array<any> }}
 */
export function csvToSnapshot(csv, opts = {}) {
  if (typeof opts.capturedAt !== "string" || !opts.capturedAt) {
    throw new Error("csvToSnapshot: opts.capturedAt is required — capture time comes from the caller, never guessed (no hidden clocks)");
  }
  const rows = parseCsvRows(csv);
  const header = rows.length ? rows[0].map((h) => h.trim()) : [];
  const matters = rows.slice(1).map((r) => {
    /** @type {any} */
    const m = {};
    header.forEach((h, i) => { m[h] = r[i] === undefined || r[i] === "" ? null : r[i]; });
    return m;
  });
  return { capturedAt: opts.capturedAt, source: opts.source ?? "csv", matters };
}

/* ---------- exports ---------- */

function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV export of a diff (one row per change; added/removed included).
 * @param {any} diff — output of diffSnapshots
 * @returns {string}
 */
export function diffToCsv(diff) {
  const header = ["kind", "matterId", "matter", "field", "from", "to", "severity", "changedAt", "timestampSource"];
  const rows = [
    ...diff.changed.map((c) => ["changed", c.id, c.name, c.field, c.from, c.to, c.severity, c.changedAt, c.source]),
    ...diff.added.map((m) => ["added", m.id, m.name ?? m.id, "*", "", m.stage ?? "", "", diff.currCapturedAt, "snapshot.capturedAt"]),
    ...diff.removed.map((m) => ["removed", m.id, m.name ?? m.id, "*", m.stage ?? "", "", "", diff.currCapturedAt, "snapshot.capturedAt"]),
  ];
  return [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n") + "\n";
}

/**
 * JSON export of a diff (stable key order; safe to commit to version control).
 * @param {any} diff
 * @returns {string} */
export function diffToJson(diff) {
  return JSON.stringify(diff, null, 2) + "\n";
}

/* ---------- ICS export ---------- */

/** Escape TEXT values per RFC 5545 (backslash, semicolon, comma; CR/LF as literal \\n / \\r).
 * @param {any} v @returns {string} */
function icsEscape(v) {
  return String(v ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

/** "YYYY-MM-DD" → "YYYYMMDD". @param {string} iso @returns {string} */
function toIcsDate(iso) {
  return String(iso).replace(/-/g, "");
}

/** Day after a DATE (DTEND is exclusive for all-day events).
 * @param {string} iso @returns {string} */
function nextDayIso(iso) {
  const d = parseDate(iso);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Calendar export of flagged deadlines — one all-day VEVENT per overdue /
 * due-soon flag, DATE values only (no timezone math). `DTSTAMP` derives from
 * the board's caller-supplied `asOf`, so output is byte-stable and
 * reproducible (no hidden clocks).
 * @param {{ asOf: string, flagged: Array<{ id: string, name: string, flag: string, deadline: string, days: number }> }} board
 * @returns {string}
 */
export function flaggedToIcs(board) {
  const asOf = parseDate(board.asOf ?? null);
  const stamp = asOf ? asOf.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "") + "Z" : "19700101T000000Z";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//open-legal-artifacts//matter-board//EN",
    "CALSCALE:GREGORIAN",
  ];
  for (const f of board.flagged ?? []) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${f.id}:${f.deadline}@matter-board`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${toIcsDate(f.deadline)}`,
      `DTEND;VALUE=DATE:${toIcsDate(nextDayIso(f.deadline))}`,
      `SUMMARY:${f.flag === "overdue" ? "[OVERDUE]" : "[DUE SOON]"} ${icsEscape(f.name)}`,
      `DESCRIPTION:flag=${f.flag}; days=${f.days}; deadline=${f.deadline}; matter=${icsEscape(f.id)}`
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
