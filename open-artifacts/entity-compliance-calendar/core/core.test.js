/** Tests for entity-compliance-calendar core. Run: node --test (from artifact root) */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDate, nextDue, buildMatrix, toCsv, toICS, report, auditHealth, ingestAgentReport, applyFilingUpdates } from "./core.js";

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

/* ---------- Wave 2 (plans-v2): provenance, qualifications, health, ingestion ---------- */

test("rule staleness: verifiedOn >365d before asOf → ruleStale true, status unchanged", () => {
  const ob = { ...OBS[0], effectiveFrom: "2020-01-01", verifiedOn: "2025-10-01" }; // 402d before asOf
  const r = nextDue(ob, ENT(), [], AS_OF);
  assert.equal(r.ruleStale, true);
  assert.equal(r.status, "delinquent"); // staleness is metadata, never a verdict change
  assert.equal(nextDue({ ...OBS[0], verifiedOn: "2026-10-01" }, ENT(), [], AS_OF).ruleStale, false); // 37d → fresh
  assert.equal(nextDue(OBS[0], ENT(), [], AS_OF).ruleStale, false); // no verifiedOn → not asserted stale
});

test("rule staleness + good standing + fees surface in CSV and ICS", () => {
  const m = buildMatrix({
    asOf: AS_OF,
    entities: [ENT({ goodStandingConfirmedOn: "2026-10-01" })],
    obligations: [{ ...OBS[0], verifiedOn: "2025-10-01" }],
    filings: [{ entityId: "E-1", obligationId: "de-franchise", period: 2020, filedOn: "2020-03-10", fee: 400 }],
  });
  const csv = toCsv(m);
  assert.match(csv.split("\n")[0], /goodStanding,fee,verifiedOn,ruleStale$/);
  assert.match(csv.split("\n")[1], /,true$/);
  assert.match(csv.split("\n")[1], /,ok,400,/); // standing state + latest filing fee carried per row
  assert.match(toICS(m), /STALE/);
  assert.match(toICS(m), /Good standing: ok/);
});

test("foreign qualifications: obligation binds via qualification, anchored to qualifiedOn", () => {
  const e = ENT({ qualifications: [{ jurisdiction: "US-CA", qualifiedOn: "2022-08-01" }] });
  const filings = [2022, 2024].map((p) => ({ entityId: "E-1", obligationId: "ca-sos-biennial", period: p, filedOn: "x" }));
  const r = nextDue(OBS[1], e, filings, AS_OF); // biennial from 2022-08-01 → next unfiled 2026-08-01, 98d overdue
  assert.equal(r.dueOn, "2026-08-01");
  assert.equal(r.status, "delinquent");
  assert.match(r.ruleNote, /qualification/);
  const r2 = nextDue(OBS[1], e, [...filings, { entityId: "E-1", obligationId: "ca-sos-biennial", period: 2026, filedOn: "x" }], AS_OF);
  assert.deepEqual({ s: r2.status, d: r2.dueOn }, { s: "scheduled", d: "2028-08-01" });
  // not qualified there → n/a with reason
  const na = nextDue(OBS[1], ENT(), [], AS_OF);
  assert.equal(na.status, "n/a");
  assert.match(na.skipReason, /foreign/);
  // qualified but no date → unknown, never guessed
  const nodate = nextDue(OBS[1], ENT({ qualifications: [{ jurisdiction: "US-CA" }] }), [], AS_OF);
  assert.equal(nodate.status, "unknown");
  assert.equal(nodate.dueOn, null);
});

test("unknown status: missing anchor data splits from n/a and is counted", () => {
  assert.equal(nextDue(OBS[0], ENT({ formedOn: null }), [], AS_OF).status, "unknown");
  assert.equal(nextDue(OBS[3], ENT({ jurisdiction: "US-TX", formedOn: null }), [], AS_OF).status, "unknown");
  const m = buildMatrix({ asOf: AS_OF, entities: [ENT({ formedOn: null }), ENT()], obligations: [OBS[0]], filings: [] });
  assert.equal(m.counts.unknown, 1);
  assert.equal(m.counts.delinquent, 1);
  assert.equal(m.counts["n/a"], 0);
  // impossible fixed dates remain n/a — that is bad RULE data, not missing ENTITY data
  assert.equal(nextDue({ ...OBS[2], dueDay: 30, dueMonth: 2 }, ENT({ jurisdiction: "US-NY" }), [], AS_OF).status, "n/a");
});

test("fees + good standing: matrix totals, standing states, CSV columns", () => {
  const m = buildMatrix({
    asOf: AS_OF,
    entities: [
      ENT({ goodStandingConfirmedOn: "2026-10-01" }), // ok
      ENT({ id: "E-2", jurisdiction: "US-CA", formedOn: "2021-06-01", goodStandingConfirmedOn: "2025-01-01" }), // stale
      ENT({ id: "E-3", jurisdiction: "US-TX", type: "llc", formedOn: "2026-06-01" }), // unknown
    ],
    obligations: OBS,
    filings: [
      { entityId: "E-1", obligationId: "de-franchise", period: 2020, filedOn: "x", fee: 400 },
      { entityId: "E-1", obligationId: "de-franchise", period: 2021, filedOn: "x", fee: 400 },
      { entityId: "E-2", obligationId: "ca-sos-biennial", period: 2021, filedOn: "x", fee: 20 },
    ],
  });
  assert.equal(m.feeTotals.recorded, 820);
  assert.deepEqual(m.feeTotals.byEntity, { "E-1": 800, "E-2": 20, "E-3": 0 });
  const st = Object.fromEntries(m.goodStanding.map((g) => [g.entityId, g.state]));
  assert.deepEqual(st, { "E-1": "ok", "E-2": "stale", "E-3": "unknown" });
  const e1row = toCsv(m).split("\n").find((l) => l.startsWith("E-1,") && l.includes("de-franchise"));
  assert.ok(e1row.endsWith(",ok,400,,"), e1row); // standing, latest filing fee, no verifiedOn, not stale
});

test("report(): 30/60/90/180 windows bucket actionable cells cumulatively", () => {
  const ob = (id, month, day) => ({ ...OBS[2], id, recurring: "annual", dueMonth: month, dueDay: day });
  const obligations = [ob("a35", 12, 12), ob("b75", 1, 21), ob("c100", 2, 15), ob("dOver", 6, 1)];
  const m = buildMatrix({
    asOf: AS_OF,
    entities: [ENT({ jurisdiction: "US-NY", formedOn: "2025-12-12" })],
    obligations,
    filings: [
      { entityId: "E-1", obligationId: "a35", period: 2025, filedOn: "x" }, // next 2026-12-12, +35d
      { entityId: "E-1", obligationId: "b75", period: 2026, filedOn: "x" }, // next 2027-01-21, +75d
      { entityId: "E-1", obligationId: "c100", period: 2026, filedOn: "x" }, // next 2027-02-15, +100d
    ],
  });
  const rep = report(m);
  assert.deepEqual(rep.windows.map((w) => w.days), [30, 60, 90, 180]);
  assert.deepEqual(rep.windows.map((w) => w.count), [1, 2, 3, 4]); // overdue always in; +35 @60; +75 @90; +100 @180
  assert.equal(rep.windows[0].items[0].obligationId, "dOver"); // 159d overdue sorts first
  assert.equal(rep.actionable.length, 4);
  // custom windows are honored
  assert.deepEqual(report(m, [45, 120]).windows.map((w) => w.days), [45, 120]);
});

test("auditHealth: each flag fires exactly once on its fixture; clean and dissolved entities stay clean", () => {
  const entities = [
    ENT({ goodStandingConfirmedOn: "2026-10-01" }), // clean
    ENT({ id: "E-2", formedOn: null, goodStandingConfirmedOn: "2026-10-01" }), // missing formedOn
    ENT({ id: "E-3", formedOn: "2018-03-01", status: "dormant", goodStandingConfirmedOn: "2026-10-01" }), // dormant >5y
    ENT({ id: "E-4", goodStandingConfirmedOn: "2025-01-01" }), // stale standing (675d)
    ENT({ id: "E-5" }), // unknown standing
    ENT({ id: "E-6", footprint: ["US-WA"], qualifications: [{ jurisdiction: "US-CA", qualifiedOn: "2022-01-01" }], goodStandingConfirmedOn: "2026-10-01" }), // WA gap, CA covered
    ENT({ id: "E-7", status: "dissolved" }), // standing checks skipped for dissolved
  ];
  const h = auditHealth({ asOf: AS_OF, entities, obligations: OBS });
  const codes = h.flags.map((f) => f.code).sort();
  assert.deepEqual(codes, ["dormant-dissolution-candidate", "foreign-qualification-gap", "good-standing-stale", "good-standing-unknown", "missing-formedOn"]);
  assert.equal(h.counts.flags, 5);
  assert.equal(h.counts.byCode["good-standing-stale"], 1);
  assert.ok(!h.flags.some((f) => f.entityId === "E-1" || f.entityId === "E-7"), "clean/dissolved entities must not flag");
});

const AGENT_CSV = [
  "Report Date,Entity Name,Jurisdiction,Status,Good Standing",
  '2026-10-31,"Acme Holdings, LLC",US-DE,Active,Yes',
  "2026-10-31,Borealis Craft LLC,US-CO,Active,No",
  "2026-10-31,Zephyr Ghost Inc,US-TX,Active,Yes",
].join("\n");

test("ingestAgentReport: case/punctuation-insensitive matching with matched/unmatched/notInReport diff", () => {
  const entities = [
    ENT({ name: "ACME Holdings LLC" }), // ≡ "Acme Holdings, LLC" modulo case + comma
    ENT({ id: "E-2", name: "Northwind Robotics NY LLC", jurisdiction: "US-NY", formedOn: "2019-07-01" }),
  ];
  const r = ingestAgentReport(entities, AGENT_CSV);
  assert.equal(r.reportDate, "2026-10-31");
  assert.equal(r.matched.length, 1);
  assert.equal(r.matched[0].entityId, "E-1");
  assert.equal(r.matched[0].reportName, "Acme Holdings, LLC");
  assert.equal(r.matched[0].goodStanding, true);
  assert.deepEqual(r.unmatched.map((u) => u.reportName), ["Borealis Craft LLC", "Zephyr Ghost Inc"]);
  assert.deepEqual(r.notInReport.map((u) => u.entityId), ["E-2"]);
});

test("applyFilingUpdates: dry-run proposes only; confirm applies without mutating input; idempotent", () => {
  const entities = [ENT({ name: "ACME Holdings LLC", goodStandingConfirmedOn: "2025-05-01" })];
  const ing = ingestAgentReport(entities, AGENT_CSV);
  const dry = applyFilingUpdates(entities, ing);
  assert.equal(dry.applied, false);
  assert.ok(dry.updates.some((u) => u.entityId === "E-1" && u.field === "goodStandingConfirmedOn" && u.to === "2026-10-31"));
  assert.equal(entities[0].goodStandingConfirmedOn, "2025-05-01"); // untouched by dry run
  const done = applyFilingUpdates(entities, ing, { confirm: true });
  assert.equal(done.applied, true);
  assert.equal(done.entities.find((e) => e.id === "E-1").goodStandingConfirmedOn, "2026-10-31");
  assert.equal(entities[0].goodStandingConfirmedOn, "2025-05-01"); // original array never mutated
  assert.equal(applyFilingUpdates(done.entities, ing).updates.length, 0); // idempotent
});
