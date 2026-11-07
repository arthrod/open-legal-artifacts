/** Tests for matter-board core. Run: node --test (from artifact root) */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDate, diffSnapshots, buildBoard, diffToCsv, diffToJson, DEFAULT_FIELD_SEVERITY } from "./core.js";

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
    { id: "M-101", name: "Halberd v. Perigee (fictional)", client: "Halberd Logistics", owner: "t.nguyen", stage: "discovery", nextStep: "Deposition prep", nextDeadline: "2026-11-18", updatedAt: "2026-11-05T11:30:00Z" },
    { id: "M-102", name: "Quill trademark opposition", client: "Quill Coffee Co.", owner: "s.okafor", stage: "filing", nextStep: "File opposition", nextDeadline: "2026-11-12", status: "awaiting-signature", updatedAt: "2026-11-06T08:45:00Z" },
    { id: "M-103", name: "Brightwater lease review", client: "Brightwater LLC", owner: "t.nguyen", stage: "closed", nextStep: "Send execution copies", nextDeadline: "2026-11-08", updatedAt: null },
    { id: "M-105", name: "Northwind vendor suite", client: "Northwind Robotics", owner: "a.fern", stage: "intake", nextStep: "Conflicts check", nextDeadline: "2026-11-21" },
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
