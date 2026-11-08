/** Tests for matter-board core. Run: node --test (from artifact root) */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDate, diffSnapshots, buildBoard, diffToCsv, diffToJson, DEFAULT_FIELD_SEVERITY, detectAnomalies, csvToSnapshot, flaggedToIcs } from "./core.js";

const PREV = {
  capturedAt: "2026-11-01T09:00:00Z",
  matters: [
    { id: "M-101", name: "Halberd v. Perigee (fictional)", client: "Halberd Logistics", owner: "j.moreau", stage: "discovery", nextStep: "Respond to RFPs", nextDeadline: "2026-11-20", updatedAt: "2026-10-28T14:00:00Z" },
    { id: "M-102", name: "Quill trademark opposition", client: "Quill Coffee Co.", owner: "s.okafor", stage: "filing", nextStep: "File opposition", nextDeadline: "2026-11-12", updatedAt: "2026-10-30T10:00:00Z" },
    { id: "M-103", name: "Brightwater lease review", client: "Brightwater LLC", owner: "t.nguyen", stage: "closing", nextStep: "Send execution copies", nextDeadline: "2026-11-08", updatedAt: "2026-10-25T16:00:00Z" },
    { id: "M-104", name: "Oldmatter wind-down", client: "Gone Corp", owner: "j.moreau", stage: "closing", nextStep: "Archive file", nextDeadline: "2026-10-31", updatedAt: "2026-10-20T09:00:00Z" },
  ],
};
const CURR = {
  capturedAt: "2026-11-07T09:00:00Z",
  matters: [
    { id: "M-101", name: "Halberd v. Perigee (fictional)", client: "Halberd Logistics", owner: "t.nguyen", stage: "discovery", nextStep: "Deposition prep", nextDeadline: "2026-11-18", risk: "high", conflicts: "clear", updatedAt: "2026-11-05T11:30:00Z" },
    { id: "M-102", name: "Quill trademark opposition", client: "Quill Coffee Co.", owner: "s.okafor", stage: "filing", nextStep: "File opposition", nextDeadline: "2026-11-12", status: "awaiting-signature", risk: "low", conflicts: "clear", updatedAt: "2026-11-06T08:45:00Z" },
    { id: "M-103", name: "Brightwater lease review", client: "Brightwater LLC", owner: "t.nguyen", stage: "closed", nextStep: "Send execution copies", nextDeadline: "2026-11-08", risk: "low", conflicts: "clear", updatedAt: null },
    { id: "M-105", name: "Northwind vendor suite", client: "Northwind Robotics", owner: "a.fern", stage: "intake", nextStep: "Conflicts check", nextDeadline: "2026-11-21", risk: "high", conflicts: "open" },
  ],
};

test("diffSnapshots detects added and removed matters", () => {
  const d = diffSnapshots(PREV, CURR);
  assert.deepEqual(d.added.map((m) => m.id), ["M-105"]);
  assert.deepEqual(d.removed.map((m) => m.id), ["M-104"]);
  assert.equal(d.counts.added, 1);
  assert.equal(d.counts.removed, 1);
});

test("diffSnapshots flags every changed field with severity and timestamp", () => {
  const d = diffSnapshots(PREV, CURR);
  const m101 = d.changed.filter((c) => c.id === "M-101");
  assert.deepEqual(m101.map((c) => c.field).sort(), ["nextDeadline", "nextStep", "owner"]);
  const owner = m101.find((c) => c.field === "owner");
  assert.equal(owner.severity, "major");
  assert.equal(owner.from, "j.moreau");
  assert.equal(owner.to, "t.nguyen");
  assert.equal(owner.changedAt, "2026-11-05T11:30:00Z"); // matter-level timestamp
  assert.equal(owner.source, "matter.updatedAt");
  const deadline = m101.find((c) => c.field === "nextDeadline");
  assert.equal(deadline.severity, "critical");
});

test("diffSnapshots falls back to snapshot capturedAt when updatedAt missing", () => {
  const d = diffSnapshots(PREV, CURR);
  const m103 = d.changed.find((c) => c.id === "M-103" && c.field === "stage");
  assert.equal(m103.changedAt, CURR.capturedAt);
  assert.equal(m103.source, "snapshot.capturedAt");
});

test("diffSnapshots counts critical changes; changes sorted by timestamp", () => {
  const d = diffSnapshots(PREV, CURR);
  assert.equal(d.counts.critical, 1); // only M-101 nextDeadline
  for (let i = 1; i < d.changed.length; i++) {
    assert.ok(d.changed[i - 1].changedAt.localeCompare(d.changed[i].changedAt) <= 0);
  }
});

test("unchanged matters produce no changes", () => {
  const d = diffSnapshots(PREV, { capturedAt: "2026-11-07T09:00:00Z", matters: PREV.matters });
  assert.equal(d.counts.changed, 0);
  assert.deepEqual(d.counts, { added: 0, removed: 0, changed: 0, critical: 0 });
});

test("severity map is configurable rules-as-data", () => {
  const d = diffSnapshots(PREV, CURR, { ...DEFAULT_FIELD_SEVERITY, stage: "critical" });
  assert.equal(d.changed.find((c) => c.id === "M-103" && c.field === "stage").severity, "critical");
});

test("buildBoard groups by stage, sorts by deadline, flags overdue/soon", () => {
  const b = buildBoard(CURR, "2026-11-07", { soonDays: 14 });
  const stages = b.stages.map((s) => s.stage);
  // stage columns follow first-appearance order in the snapshot
  assert.deepEqual(stages, ["discovery", "filing", "closed", "intake"]);
  const discovery = b.stages.find((s) => s.stage === "discovery");
  assert.equal(discovery.matters.length, 1);
  const flags = Object.fromEntries(b.flagged.map((f) => [`${f.id}:${f.flag}`, f.days]));
  assert.equal(flags["M-103:due-soon"], 1);   // 2026-11-08 is tomorrow
  assert.equal(flags["M-102:due-soon"], 5);   // 2026-11-12
  assert.equal(flags["M-101:due-soon"], 11);  // 2026-11-18
  assert.equal(flags["M-105:due-soon"], 14);  // 2026-11-21
  // M-103 stage=closed but still has deadline within window -> flagged (visible, human decides)
  assert.ok(!b.flagged.some((f) => f.flag === "overdue"));
});

test("buildBoard flags overdue deadlines", () => {
  const snap = { capturedAt: "x", matters: [{ id: "M-9", name: "Late thing", stage: "discovery", nextDeadline: "2026-11-01" }] };
  const b = buildBoard(snap, "2026-11-07");
  assert.deepEqual(b.flagged, [{ id: "M-9", name: "Late thing", flag: "overdue", deadline: "2026-11-01", days: -6 }]);
});

test("matters without parseable deadlines are never flagged as risky", () => {
  const snap = { capturedAt: "x", matters: [{ id: "M-8", name: "No date", stage: "intake", nextDeadline: "TBD" }] };
  assert.deepEqual(buildBoard(snap, "2026-11-07").flagged, []);
});

test("diffToCsv and diffToJson export every change row with escapes", () => {
  const d = diffSnapshots(PREV, CURR);
  const csv = diffToCsv(d);
  const lines = csv.trim().split("\n");
  assert.equal(lines.length, 1 + d.counts.changed + 2); // header + changes + added + removed
  assert.match(lines[0], /^kind,matterId,matter,field/);
  assert.match(csv, /changed,M-101,.*nextDeadline/);
  const json = JSON.parse(diffToJson(d));
  assert.equal(json.counts.changed, d.counts.changed);
  assert.equal(json.currCapturedAt, "2026-11-07T09:00:00Z");
});

test("parseDate rejects rollover dates", () => {
  assert.equal(parseDate("2026-02-30"), null);
  assert.ok(parseDate("2026-02-28"));
});

/* ---------- anomaly layer ---------- */

const ANOMALY_SNAP = {
  capturedAt: "2026-11-07T09:00:00Z",
  matters: [
    { id: "A-1", name: "Fresh matter", owner: "x.ray", stage: "discovery", nextDeadline: "2026-12-01", updatedAt: "2026-11-06T10:00:00Z" },
    { id: "A-2", name: "Stale matter", owner: "y.lee", stage: "discovery", nextDeadline: "2026-12-01", updatedAt: "2026-09-01T10:00:00Z" },
    { id: "A-3", name: "Sparse matter", stage: "intake" }, // no updatedAt, no owner, no deadline
    { id: "A-4", name: "Closed matter", owner: "z.kim", stage: "closed", nextDeadline: "2026-11-08", updatedAt: "2026-11-06T10:00:00Z" },
  ],
};

test("detectAnomalies surfaces stale, missing-field, closed-with-deadline", () => {
  const anomalies = detectAnomalies(ANOMALY_SNAP, "2026-11-07");
  assert.deepEqual(anomalies, [
    { id: "A-2", name: "Stale matter", anomaly: "stale", detail: "updatedAt 2026-09-01T10:00:00Z is 67d before asOf" },
    { id: "A-3", name: "Sparse matter", anomaly: "missing-field", detail: "nextDeadline" },
    { id: "A-3", name: "Sparse matter", anomaly: "missing-field", detail: "owner" },
    { id: "A-3", name: "Sparse matter", anomaly: "stale", detail: "no updatedAt" },
    { id: "A-4", name: "Closed matter", anomaly: "closed-with-deadline", detail: "deadline 2026-11-08 stands after stage=closed" },
  ]);
});

test("detectAnomalies rules are data: staleDays/required/closedStage overridable; clean snapshot yields none", () => {
  // default staleDays=30: A-2 (67d) stale; with staleDays=90 it is fresh (A-4 still closed-with-deadline)
  assert.deepEqual(detectAnomalies(ANOMALY_SNAP, "2026-11-07", { staleDays: 90, required: ["name", "owner", "stage"] }).map((a) => a.id), ["A-3", "A-3", "A-4"]);
  // closedStage vocabulary is firm data
  const reNamed = detectAnomalies(ANOMALY_SNAP, "2026-11-07", { closedStage: "wrapped" });
  assert.ok(!reNamed.some((a) => a.anomaly === "closed-with-deadline"));
  // fully clean snapshot → empty list
  const clean = { capturedAt: "x", matters: [{ id: "A-1", name: "Fresh matter", owner: "x.ray", stage: "discovery", nextDeadline: "2026-12-01", updatedAt: "2026-11-06T10:00:00Z" }] };
  assert.deepEqual(detectAnomalies(clean, "2026-11-07"), []);
});

test("buildBoard appends stages missing from a custom stageOrder (counts still agree with what is shown)", () => {
  const b = buildBoard(CURR, "2026-11-07", { stageOrder: ["intake", "filing"] });
  // custom order first, then unlisted stages in first-appearance order
  assert.deepEqual(b.stages.map((s) => s.stage), ["intake", "filing", "discovery", "closed"]);
  const shown = b.stages.flatMap((s) => s.matters.map((m) => m.id)).sort();
  assert.deepEqual(shown, ["M-101", "M-102", "M-103", "M-105"]);
  assert.equal(b.counts.matters, shown.length);
});

/* ---------- CSV ingest ---------- */

test("csvToSnapshot parses RFC4180 subset (quotes, embedded commas, CRLF) to an equivalent snapshot", () => {
  const csv = [
    "id,name,client,owner,stage,nextStep,nextDeadline,risk,conflicts",
    'M-201,"Quill ""QC"" opposition","Quill, Inc.",s.okafor,filing,"File opposition, pay fee",2026-11-12,low,open',
    "M-202,Plain row,Brightwater LLC,t.nguyen,closing,Send copies,,high,clear",
  ].join("\r\n") + "\r\n";
  const snap = csvToSnapshot(csv, { capturedAt: "2026-11-07T09:00:00Z", source: "practice-export.csv (fictional)" });
  assert.deepEqual(snap, {
    capturedAt: "2026-11-07T09:00:00Z",
    source: "practice-export.csv (fictional)",
    matters: [
      { id: "M-201", name: 'Quill "QC" opposition', client: "Quill, Inc.", owner: "s.okafor", stage: "filing", nextStep: "File opposition, pay fee", nextDeadline: "2026-11-12", risk: "low", conflicts: "open" },
      { id: "M-202", name: "Plain row", client: "Brightwater LLC", owner: "t.nguyen", stage: "closing", nextStep: "Send copies", nextDeadline: null, risk: "high", conflicts: "clear" },
    ],
  });
  // empty cell → explicit null, which the anomaly layer can then catch
  assert.equal(snap.matters[1].nextDeadline, null);
});

test("csvToSnapshot refuses to invent capturedAt (no hidden clocks)", () => {
  assert.throws(() => csvToSnapshot("id,name\r\nM-1,X", {}), /capturedAt/);
});

test("detectAnomalies refuses an unparseable asOf (staleness must not be silently skipped)", () => {
  assert.throws(() => detectAnomalies(ANOMALY_SNAP, "not-a-date"), /asOf/);
});

/* ---------- ICS export ---------- */

test("flaggedToIcs emits one all-day VEVENT per flag with SUMMARY/DTSTART", () => {
  const board = buildBoard(CURR, "2026-11-07", { soonDays: 14 });
  const ics = flaggedToIcs(board);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, board.flagged.length);
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(ics.includes("SUMMARY:[DUE SOON] Quill trademark opposition"));
  assert.ok(ics.includes("DTSTART;VALUE=DATE:20261112"));
  assert.ok(ics.includes("DTSTAMP:20261107T000000Z")); // deterministic: derived from asOf, not wall clock
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  // every flag's deadline appears as an all-day DATE
  for (const f of board.flagged) assert.ok(ics.includes(`DTSTART;VALUE=DATE:${f.deadline.replace(/-/g, "")}`));
});

test("flaggedToIcs marks overdue distinctly", () => {
  const snap = { capturedAt: "x", matters: [{ id: "M-9", name: "Late thing", stage: "discovery", nextDeadline: "2026-11-01" }] };
  const ics = flaggedToIcs(buildBoard(snap, "2026-11-07"));
  assert.ok(ics.includes("SUMMARY:[OVERDUE] Late thing"));
  assert.ok(ics.includes("DTSTART;VALUE=DATE:20261101"));
});

test("flaggedToIcs escapes CR/LF in matter names (RFC 5545 TEXT), incl. names ingested from CSV", () => {
  // a quoted CSV cell can carry an embedded newline straight into a matter name
  const csv = 'id,name,stage,nextDeadline\r\n"M-N","Two\nline name",discovery,2026-11-01\r\n';
  const snap = csvToSnapshot(csv, { capturedAt: "2026-11-07T09:00:00Z" });
  assert.equal(snap.matters[0].name, "Two\nline name");
  const ics = flaggedToIcs(buildBoard(snap, "2026-11-07"));
  assert.ok(ics.includes("SUMMARY:[OVERDUE] Two\\nline name")); // literal \n escape
  assert.ok(!ics.includes("Two\nline"));                      // no raw newline mid-property
  assert.ok(!/[^\r]\n/.test(ics) && !/\r[^\n]/.test(ics));     // CRLF line folding only
});

/* ---------- risk / conflicts rollups + filters ---------- */

test("buildBoard rolls up risk and open-conflicts counts", () => {
  const b = buildBoard(CURR, "2026-11-07");
  assert.deepEqual(b.counts, { matters: 4, risk: { high: 2, medium: 0, low: 2 }, conflictsOpen: 1 });
});

test("buildBoard filters by owner and risk (board, flags, and counts agree)", () => {
  const byOwner = buildBoard(CURR, "2026-11-07", { owner: "t.nguyen" });
  assert.deepEqual(byOwner.stages.flatMap((s) => s.matters.map((m) => m.id)), ["M-101", "M-103"]);
  assert.deepEqual(byOwner.flagged.map((f) => f.id), ["M-103", "M-101"]);
  assert.equal(byOwner.counts.matters, 2);

  const byRisk = buildBoard(CURR, "2026-11-07", { risk: "high" });
  assert.deepEqual(byRisk.stages.flatMap((s) => s.matters.map((m) => m.id)).sort(), ["M-101", "M-105"]);
  assert.equal(byRisk.counts.conflictsOpen, 1); // M-105
});

test("risk rollup ignores __proto__ keys (no prototype pollution)", () => {
  const snap = { capturedAt: "x", matters: [{ id: "P-1", name: "Edge risk", stage: "intake", nextDeadline: "2026-11-20", risk: "__proto__" }] };
  assert.deepEqual(buildBoard(snap, "2026-11-07").counts.risk, { high: 0, medium: 0, low: 0 });
});
