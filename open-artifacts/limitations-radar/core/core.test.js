/** Tests: limitations-radar core. Run: node --test 'core/*.test.js' */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseDate, fmtDate, addYears, addDays, daysBetween, getRuleset,
  computeTolling, evaluateClaim, runRadar, toICS, foldLine, renderReport, JURISDICTION_RULES,
} from "./core.js";

const AS_OF = "2026-11-07";
const claim = (over = {}) => ({
  id: "CLM-1",
  claimType: "personal_injury",
  jurisdiction: "CA",
  injuryDate: "2024-06-15",
  discoveryDate: "2024-07-01",
  tollingEvents: [],
  ...over,
});

test("date helpers: clamp, add, diff", () => {
  assert.equal(fmtDate(addYears(parseDate("2024-02-29"), 2)), "2026-02-28");
  assert.equal(fmtDate(addDays(parseDate("2026-11-07"), 21)), "2026-11-28");
  assert.equal(daysBetween(parseDate("2026-01-01"), parseDate("2026-12-31")), 364);
  assert.equal(parseDate("2026-02-30"), null);
});

test("discovery-rule accrual: CA personal_injury runs from discoveryDate when provided", () => {
  const r = evaluateClaim(claim(), parseDate(AS_OF));
  assert.equal(r.accrualDate, "2024-07-01");
  assert.equal(r.deadline, "2026-07-01"); // 2 years
  assert.equal(r.status, "deadline_passed_unfiled");
  assert.ok(r.basis.some((b) => b.ruleId === "CA-SOL-PI" && b.text.includes("Discovery-rule")));
});

test("discovery-rule accrual falls back to injuryDate when no discovery date", () => {
  const r = evaluateClaim(claim({ discoveryDate: null }), parseDate(AS_OF));
  assert.equal(r.accrualDate, "2024-06-15");
  assert.equal(r.deadline, "2026-06-15");
});

test("injury-accrual claim ignores discoveryDate for the clock", () => {
  // NY personal_injury accrues at injury (3y)
  const r = evaluateClaim(claim({ jurisdiction: "NY", injuryDate: "2024-01-10", discoveryDate: "2024-09-10" }), parseDate(AS_OF));
  assert.equal(r.accrualDate, "2024-01-10");
  assert.equal(r.deadline, "2027-01-10");
  assert.equal(r.status, "deadline_upcoming");
});

test("conflict flag when discovery date precedes injury date", () => {
  const r = evaluateClaim(claim({ injuryDate: "2024-06-15", discoveryDate: "2024-05-01" }), parseDate(AS_OF));
  assert.equal(r.conflicts.length, 1);
  assert.equal(r.conflicts[0].code, "discovery_precedes_injury");
});

test("recognized tolling pauses the clock by the event duration", () => {
  const r = evaluateClaim(claim({
    injuryDate: "2024-03-01", discoveryDate: "2024-03-01",
    tollingEvents: [{ type: "defendant_absence", startDate: "2024-06-01", endDate: "2024-12-01" }], // 183 days
  }), parseDate(AS_OF));
  assert.equal(r.tollDays, 183);
  assert.equal(r.deadline, "2026-08-31"); // 2026-03-01 + 183d
  assert.ok(r.tollingApplied.some((t) => t.ruleId === "CA-TOL-2"));
});

test("ongoing tolling event runs to asOf", () => {
  const r = evaluateClaim(claim({
    injuryDate: "2025-01-01", discoveryDate: "2025-01-01",
    tollingEvents: [{ type: "bankruptcy_stay", startDate: "2025-02-01", stillOngoing: true }],
  }), parseDate(AS_OF));
  const expected = daysBetween(parseDate("2025-02-01"), parseDate(AS_OF));
  assert.equal(r.tollDays, expected);
});

test("unrecognized tolling type flagged, no effect applied", () => {
  const rules = getRuleset("CA");
  const t = computeTolling({ tollingEvents: [{ type: "martian_invasion", startDate: "2025-01-01", endDate: "2026-01-01" }] }, rules, parseDate(AS_OF));
  assert.equal(t.tollDays, 0);
  assert.ok(t.flagged[0].text.includes("not recognized"));
  // and TX does not recognize bankruptcy_stay
  const tx = computeTolling({ tollingEvents: [{ type: "bankruptcy_stay", startDate: "2025-01-01", endDate: "2026-01-01" }] }, getRuleset("TX"), parseDate(AS_OF));
  assert.equal(tx.tollDays, 0);
  assert.ok(tx.flagged[0].text.includes("bankruptcy_stay"));
});

test("tolling event with invalid dates excluded and flagged — never guessed", () => {
  const t = computeTolling({ tollingEvents: [{ type: "minority", startDate: "bad" }, { type: "minority", startDate: "2025-05-01" }] }, getRuleset("CA"), parseDate(AS_OF));
  assert.equal(t.tollDays, 0);
  assert.equal(t.flagged.filter((f) => f.type === "minority").length, 2);
});

test("saved-by margin: timely filing computes positive margin in days", () => {
  const r = evaluateClaim(claim({ injuryDate: "2024-01-10", discoveryDate: "2024-01-10", filingDate: "2025-11-10" }), parseDate(AS_OF));
  assert.equal(r.deadline, "2026-01-10");
  assert.equal(r.savedByDays, 61);
  assert.equal(r.status, "filed_timely");
});

test("late filing computes negative margin and status filed_late", () => {
  const r = evaluateClaim(claim({ injuryDate: "2024-01-10", discoveryDate: "2024-01-10", filingDate: "2026-03-01" }), parseDate(AS_OF));
  assert.equal(r.savedByDays, -50);
  assert.equal(r.status, "filed_late");
});

test("unknown jurisdiction or claimType => data_needed / flag, never a guess", () => {
  const r1 = evaluateClaim(claim({ jurisdiction: "ZZ" }), parseDate(AS_OF));
  assert.equal(r1.status, "data_needed");
  assert.ok(r1.flags[0].includes("unknown jurisdiction"));
  const r2 = evaluateClaim(claim({ claimType: "interstellar_tort" }), parseDate(AS_OF));
  assert.equal(r2.status, "data_needed");
  assert.ok(r2.flags[0].includes("never guessed"));
});

test("missing accrual dates => data_needed with what's missing", () => {
  const r = evaluateClaim(claim({ injuryDate: null, discoveryDate: null }), parseDate(AS_OF));
  assert.equal(r.status, "data_needed");
  assert.ok(r.flags[0].includes("discoveryDate or injuryDate"));
});

test("runRadar summary counts across claims", () => {
  const r = runRadar({
    asOf: AS_OF,
    claims: [
      claim({ id: "A", injuryDate: "2024-01-10", discoveryDate: "2024-01-10", filingDate: "2025-06-01" }),
      claim({ id: "B", jurisdiction: "NY", injuryDate: "2024-01-10", discoveryDate: "2024-01-10" }),
      claim({ id: "C", jurisdiction: "NOPE" }),
    ],
  });
  assert.equal(r.summary.total, 3);
  assert.equal(r.summary.filed_timely, 1);
  assert.equal(r.summary.deadline_upcoming, 1);
  assert.equal(r.summary.data_needed, 1);
  assert.equal(r.gate.required, true);
});

test("rules-as-data: 3 example jurisdictions with discovery + injury accrual mixes", () => {
  assert.deepEqual(Object.keys(JURISDICTION_RULES).sort(), ["CA", "NY", "TX"]);
  assert.equal(JURISDICTION_RULES.CA.claimTypes.personal_injury.accrual, "discovery");
  assert.equal(JURISDICTION_RULES.NY.claimTypes.personal_injury.accrual, "injury");
  assert.equal(getRuleset("NOPE"), null);
});

test("ICS export: VCALENDAR structure, per-claim VEVENT, DTSTART from deadline, deterministic UID", () => {
  const report = runRadar({
    asOf: AS_OF,
    claims: [claim({ id: "CLM-9", injuryDate: "2025-01-01", discoveryDate: "2025-01-01" })], // deadline 2027-01-01
  });
  const ics = toICS(report);
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
  assert.match(ics, /DTSTART;VALUE=DATE:20270101/);
  assert.match(ics, /UID:CLM-9-sol-20270101@limitations-radar/);
  assert.match(ics, /TRIGGER:-P30D/);
  assert.match(ics, /DTSTAMP:20261107T000000Z/);
  const events = ics.match(/BEGIN:VEVENT/g) ?? [];
  assert.equal(events.length, 1);
});

test("ICS marks overdue deadlines with [OVERDUE] and skips claims without deadlines", () => {
  const report = runRadar({
    asOf: AS_OF,
    claims: [
      claim({ id: "L", injuryDate: "2020-01-01", discoveryDate: "2020-01-01" }), // long expired
      claim({ id: "N", jurisdiction: "ZZ" }),                                   // no deadline computed
    ],
  });
  const ics = toICS(report);
  assert.match(ics, /\[OVERDUE\]/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 1);
});

test("foldLine keeps ICS lines within 75 octets and preserves CRLF folding", () => {
  const long = "DESCRIPTION:" + "x".repeat(200);
  const folded = foldLine(long);
  for (const seg of folded.split("\r\n")) assert.ok(seg.length <= 75);
  assert.ok(folded.startsWith("DESCRIPTION:xxxxxxxx"));
  assert.match(folded, /\r\n /);
});

test("markdown report lists deadlines, margins, conflicts, and the gate", () => {
  const md = renderReport(runRadar({
    asOf: AS_OF,
    claims: [claim({ injuryDate: "2024-06-15", discoveryDate: "2024-05-01", filingDate: "2025-07-01" })],
  }));
  assert.match(md, /# Limitations radar/);
  assert.match(md, /discovery_precedes_injury/);
  assert.match(md, /saved by/);
  assert.match(md, /Verify every deadline with counsel/);
});
