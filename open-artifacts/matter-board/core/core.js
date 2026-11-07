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
 * @param {{ capturedAt: string, matters: Array<any> }} snapshot
 * @param {string} asOfIso — anchor for overdue/soon computation
 * @param {{ soonDays?: number, stageOrder?: string[] }} [opts]
 * @returns {{ capturedAt: string, asOf: string, stages: Array<{ stage: string, matters: Array<any> }>, flagged: Array<{ id: string, name: string, flag: string, deadline: string, days: number }> }}
 */
export function buildBoard(snapshot, asOfIso, opts = {}) {
  const soonDays = opts.soonDays ?? 14;
  const asOf = parseDate(asOfIso);
  const stageOrder = opts.stageOrder ?? [...new Set((snapshot.matters ?? []).map((m) => m.stage ?? "unassigned"))];

  const matters = [...(snapshot.matters ?? [])].sort(
    (a, b) => String(a.nextDeadline ?? "9999").localeCompare(String(b.nextDeadline ?? "9999")) || String(a.id).localeCompare(String(b.id))
  );
  const stages = stageOrder.map((stage) => ({ stage, matters: matters.filter((m) => (m.stage ?? "unassigned") === stage) }));
  for (const s of stages.slice()) if (!stageOrder.includes(s.stage)) stages.push(s);

  /** @type {Array<{id:string,name:string,flag:string,deadline:string,days:number}>} */
  const flagged = [];
  if (asOf) {
    for (const m of snapshot.matters ?? []) {
      const d = parseDate(m.nextDeadline ?? null);
      const days = daysUntil(d, asOf);
      if (days === null) continue;
      if (days < 0) flagged.push({ id: String(m.id), name: m.name ?? String(m.id), flag: "overdue", deadline: m.nextDeadline, days });
      else if (days <= soonDays) flagged.push({ id: String(m.id), name: m.name ?? String(m.id), flag: "due-soon", deadline: m.nextDeadline, days });
    }
    flagged.sort((a, b) => a.days - b.days || a.id.localeCompare(b.id));
  }
  return { capturedAt: snapshot.capturedAt, asOf: asOfIso, stages, flagged };
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
