/** Tests for entity-compliance-calendar core. Run: node --test (from artifact root) */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDate, nextDue, buildMatrix, toCsv, toICS } from "./core.js";

const AS_OF = "2026-11-07";

const OBS = [
  { id: "de-franchise", name: "DE franchise tax", jurisdiction: "US-DE", entityTypes: ["corp"], recurring: "annual", anchor: "formationAnniversary", statuteCite: "fictional 8 Del. C. § 391-analog" },
  { id: "ca-sos-biennial", name: "CA statement of information", jurisdiction: "US-CA", entityTypes: ["corp", "llc"], recurring: "biennial", anchor: "formationAnniversary", statuteCite: "fictional Cal. Corp. Code § 6210-analog" },
  { id: "ny-annual-report", name: "NY annual report", jurisdiction: "US-NY", entityTypes: ["corp", "llc"], recurring: "annual", anchor: "calendarFixed", dueMonth: 4, dueDay: 15, statuteCite: "fictional NY LLC § 301-analog" },
  { id: "tx-initial-report", name: "TX initial information report", jurisdiction: "US-TX", entityTypes: ["corp", "llc"], recurring: "event", anchor: "formation", dueWithinDays: 90, statuteCite: "fictional Tex. Bus. Orgs. § 5.257-analog" },
];

const ENT = (over = {}) => ({
  id: "E-1", name: "Northwind Robotics, Inc.", jurisdiction: "US-DE", type: "corp",
  formedOn: "2020-03-15", status: "active", ...over,
});

test("annual formation-anniversary: earliest UNFILED period decides (never-filed → delinquent since year one)", () => {
  // formed 2020-03-15, no filings at all: earliest unfiled period is 2020 → delinquent since 2020-03-15
  const r = nextDue(OBS[0], ENT(), [], AS_OF);
  assert.equal(r.status, "delinquent");
  assert.equal(r.dueOn, "2020-03-15");
  assert.equal(r.period, 2020);
  // entity formed 2026-11-20: FIRST anniversary 2026-11-20 is 13d away → due-soon
  const r2 = nextDue(OBS[0], ENT({ formedOn: "2026-11-20" }), [], AS_OF);
  assert.equal(r2.status, "due-soon");
  assert.equal(r2.dueOn, "2026-11-20");
  // fully filed through 2026 → next cycle scheduled
  const filings = [2020, 2021, 2022, 2023, 2024, 2025, 2026].map((period) => ({ entityId: "E-1", obligationId: "de-franchise", period, filedOn: `${period}-03-10` }));
  const r3 = nextDue(OBS[0], ENT(), filings, AS_OF);
  assert.deepEqual({ s: r3.status, d: r3.dueOn }, { s: "scheduled", d: "2027-03-15" });
});

test("annual formation-anniversary: filings skip satisfied periods", () => {
  // 2020–2025 filed, 2026 unfiled → delinquent 2026-03-15
  const filings = [2020, 2021, 2022, 2023, 2024, 2025].map((period) => ({ entityId: "E-1", obligationId: "de-franchise", period, filedOn: `${period}-03-10` }));
  const r = nextDue(OBS[0], ENT(), filings, AS_OF);
  assert.equal(r.dueOn, "2026-03-15");
  assert.equal(r.status, "delinquent");
  // add 2026 filing → rolls to 2027 anniversary, scheduled
  filings.push({ entityId: "E-1", obligationId: "de-franchise", period: 2026, filedOn: "2026-03-01" });
  const r2 = nextDue(OBS[0], ENT(), filings, AS_OF);
  assert.equal(r2.dueOn, "2027-03-15");
  assert.equal(r2.status, "scheduled");
});

test("biennial: only even offsets from formation year are due", () => {
  // formed 2021-06-01 → biennial years 2021, 2023, 2025, 2027…
  const e = ENT({ jurisdiction: "US-CA", formedOn: "2021-06-01" });
  const r = nextDue(OBS[1], e, [{ entityId: "E-1", obligationId: "ca-sos-biennial", period: 2021, filedOn: "2021-06-10" }, { entityId: "E-1", obligationId: "ca-sos-biennial", period: 2023, filedOn: "2023-06-10" }, { entityId: "E-1", obligationId: "ca-sos-biennial", period: 2025, filedOn: "2025-06-10" }], AS_OF);
  assert.equal(r.dueOn, "2027-06-01");
  assert.equal(r.period, 2027);
  assert.equal(r.status, "scheduled");
  // miss 2025 → delinquent on 2025-06-01
  const r2 = nextDue(OBS[1], e, [{ entityId: "E-1", obligationId: "ca-sos-biennial", period: 2021, filedOn: "x" }, { entityId: "E-1", obligationId: "ca-sos-biennial", period: 2023, filedOn: "x" }], AS_OF);
  assert.equal(r2.dueOn, "2025-06-01");
  assert.equal(r2.status, "delinquent");
});

test("calendarFixed annual: fixed month/day every year; cycles before formation skipped", () => {
  const e = ENT({ jurisdiction: "US-NY", formedOn: "2019-07-01" });
  const r = nextDue(OBS[2], e, [], AS_OF);
  assert.equal(r.dueOn, "2020-04-15"); // 2019-04-15 predates formation → first cycle is 2020
  assert.equal(r.status, "delinquent");
  const filedThrough2026 = [2020, 2021, 2022, 2023, 2024, 2025, 2026].map((p) => ({ entityId: "E-1", obligationId: "ny-annual-report", period: p, filedOn: "x" }));
  const r2 = nextDue(OBS[2], e, filedThrough2026, AS_OF);
  assert.equal(r2.dueOn, "2027-04-15");
});

test("calendarFixed biennial: formation-year parity governs which years are due", () => {
  const biennialFixed = { ...OBS[2], recurring: "biennial" };
  const e = ENT({ jurisdiction: "US-NY", formedOn: "2019-07-01" }); // odd formation year → 2021, 2023, 2025…
  const r = nextDue(biennialFixed, e, [], AS_OF);
  assert.equal(r.dueOn, "2021-04-15");
  assert.equal(r.period, 2021);
  const filed21 = [{ entityId: "E-1", obligationId: "ny-annual-report", period: 2021, filedOn: "x" }];
  assert.equal(nextDue(biennialFixed, e, filed21, AS_OF).dueOn, "2023-04-15");
});

test("event-driven: dueWithinDays after formation; satisfied once filed", () => {
  const e = ENT({ jurisdiction: "US-TX", formedOn: "2026-10-01" });
  const r = nextDue(OBS[3], e, [], AS_OF); // due 2026-12-30
  assert.equal(r.dueOn, "2026-12-30");
  assert.equal(r.status, "scheduled");
  const late = nextDue(OBS[3], ENT({ jurisdiction: "US-TX", formedOn: "2026-06-01" }), [], AS_OF); // due 2026-08-30
  assert.equal(late.status, "delinquent");
  const ok = nextDue(OBS[3], e, [{ entityId: "E-1", obligationId: "tx-initial-report", period: "once", filedOn: "2026-10-20" }], AS_OF);
  assert.equal(ok.status, "satisfied");
});

test("applicability: wrong jurisdiction, wrong entity type, inactive entity → n/a with reason", () => {
  assert.equal(nextDue(OBS[0], ENT({ jurisdiction: "US-CA" }), [], AS_OF).status, "n/a");
  assert.equal(nextDue(OBS[0], ENT({ type: "llc" }), [], AS_OF).status, "n/a");
  const inactive = nextDue(OBS[0], ENT({ status: "dissolved" }), [], AS_OF);
  assert.equal(inactive.status, "n/a");
  assert.match(inactive.skipReason, /dissolved/);
  // missing formation date never guesses a date
  const nodate = nextDue(OBS[0], ENT({ formedOn: "TBD" }), [], AS_OF);
  assert.equal(nodate.dueOn, null);
});

test("Feb-29 formation anniversary rolls to Feb-28 in non-leap years", () => {
  const e = ENT({ formedOn: "2020-02-29" }); // 2020 leap
  const r = nextDue(OBS[0], e, [2020, 2021, 2022, 2023, 2024, 2025].map((p) => ({ entityId: "E-1", obligationId: "de-franchise", period: p, filedOn: "x" })), AS_OF);
  assert.equal(r.dueOn, "2026-02-28");
});

test("impossible fixed dates (Feb 30) are rejected, not rolled", () => {
  const bad = { ...OBS[2], dueDay: 30, dueMonth: 2 };
  const r = nextDue(bad, ENT({ jurisdiction: "US-NY" }), [], AS_OF);
  assert.equal(r.dueOn, null); // no fabricated date
  assert.equal(r.status, "n/a");
  assert.match(r.ruleNote, /verify rule data/);
});

test("buildMatrix: counts and delinquent list with overdue days", () => {
  const m = buildMatrix({
    asOf: AS_OF,
    entities: [ENT(), ENT({ id: "E-2", name: "Northwind Robotics TX LLC", jurisdiction: "US-TX", type: "llc", formedOn: "2026-06-01" })],
    obligations: OBS,
    filings: [],
    soonDays: 45,
  });
  assert.equal(m.counts.cells, 8);
  // E-1: DE delinquent; CA/NY/TX n/a. E-2: TX event delinquent (due 2026-08-30).
  assert.equal(m.counts.delinquent, 2);
  assert.equal(m.delinquent.length, 2);
  assert.ok(m.delinquent.every((d) => typeof d.overdueDays === "number" && d.dueOn));
  const first = m.delinquent[0]; // most overdue: 2026-03-15 (237d) vs 2026-08-30 (69d)
  assert.equal(first.entityId, "E-1");
  assert.equal(first.obligationId, "de-franchise");
});

test("toCsv: full matrix rows with statute cites and skip reasons", () => {
  const m = buildMatrix({ asOf: AS_OF, entities: [ENT()], obligations: [OBS[0]], filings: [] });
  const csv = toCsv(m);
  const lines = csv.trim().split("\n");
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^entityId,entity,jurisdiction,obligationId/);
  assert.match(lines[1], /E-1,"Northwind Robotics, Inc\.",US-DE,de-franchise/);
  assert.match(lines[1], /fictional 8 Del\. C\./);
  assert.match(lines[1], /delinquent,2020-03-15,2020/);
});

test("toICS: recurrence rules per obligation kind, delinquent marker, folding", () => {
  const m = buildMatrix({
    asOf: AS_OF,
    entities: [
      ENT(),
      ENT({ id: "E-2", jurisdiction: "US-CA", formedOn: "2026-10-15" }),
      ENT({ id: "E-3", jurisdiction: "US-NY", formedOn: "2026-01-10" }),
    ],
    obligations: OBS,
    filings: [],
  });
  const ics = toICS(m);
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.ok(ics.includes("RRULE:FREQ=YEARLY\r\n") || ics.includes("RRULE:FREQ=YEARLY"));
  assert.ok(ics.includes("RRULE:FREQ=YEARLY;INTERVAL=2"));
  assert.ok(ics.includes("[DELINQUENT]"));
  assert.ok(ics.includes("DTSTART;VALUE=DATE:20200315")); // earliest unfiled DE period
  assert.ok(ics.includes("TRIGGER:-P30D"));
  for (const line of ics.split("\r\n")) {
    assert.ok(new TextEncoder().encode(line).length <= 75, `line too long: ${line}`);
  }
  // satisfied and n/a cells emit no events: count VEVENTs equals actionable cells
  const vevents = (ics.match(/BEGIN:VEVENT/g) || []).length;
  assert.equal(vevents, m.counts.delinquent + m.counts["due-soon"] + m.counts.scheduled);
});

test("parseDate rejects malformed dates", () => {
  assert.equal(parseDate("2026-11-31"), null);
  assert.ok(parseDate("2026-11-30"));
});
