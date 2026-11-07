/** Tests: record-clearance core. Run: node --test 'core/*.test.js' */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseDate, fmtDate, addYears, yearsElapsed, getRuleset,
  evalPrereq, filingDates, trackClearance, renderReport, JURISDICTION_RULES,
} from "./core.js";

const AS_OF = "2026-11-07";
const clientOk = { probationStatus: "completed", finesPaid: true, pendingCases: false, rapSheetObtained: true };
const conv = (over = {}) => ({
  id: "V1",
  offense: "Forgery (fictional)",
  offenseCategory: "fraud",
  offenseClass: "felony_class_W",
  dispositionDate: "2018-05-04",
  sentenceCompletedDate: "2020-08-21",
  probationTerminatedDate: "2020-08-21",
  ...over,
});

test("date helpers: addYears clamps, yearsElapsed floors", () => {
  assert.equal(fmtDate(addYears(parseDate("2024-02-29"), 1)), "2025-02-28");
  assert.equal(yearsElapsed(parseDate("2019-11-08"), parseDate("2026-11-07")), 6);
  assert.equal(yearsElapsed(parseDate("2019-11-07"), parseDate("2026-11-07")), 7);
  assert.equal(parseDate("nodate"), null);
});

test("prereq: probationCompleted met / not_met / unknown tri-state", () => {
  const p = { kind: "probationCompleted" };
  assert.equal(evalPrereq(p, { probationStatus: "completed" }, {}, 1, null).status, "met");
  assert.equal(evalPrereq(p, { probationStatus: "revoked" }, {}, 1, null).status, "not_met");
  assert.equal(evalPrereq(p, {}, {}, 1, null).status, "unknown");
});

test("prereq: offenseNotIn matches categories and classes, unknown when no data", () => {
  const p = { kind: "offenseNotIn", categories: ["sex_offense"], classes: ["felony_class_A"] };
  assert.equal(evalPrereq(p, {}, { offenseCategory: "sex_offense" }, 1, null).status, "not_met");
  assert.equal(evalPrereq(p, {}, { offenseClass: "felony_class_A" }, 1, null).status, "not_met");
  assert.equal(evalPrereq(p, {}, { offenseCategory: "fraud" }, 1, null).status, "met");
  assert.equal(evalPrereq(p, {}, {}, 1, null).status, "unknown");
});

test("prereq: waitingPeriod counts whole years from the rule's anchor", () => {
  const p = { kind: "waitingPeriod", years: 7, anchor: "sentenceCompletedDate" };
  const r = evalPrereq(p, clientOk, conv({ sentenceCompletedDate: "2019-06-01" }), 1, parseDate(AS_OF));
  assert.equal(r.status, "met");
  assert.equal(r.date, "2026-06-01");
  const early = evalPrereq(p, clientOk, conv({ sentenceCompletedDate: "2021-06-01" }), 1, parseDate(AS_OF));
  assert.equal(early.status, "not_met");
  assert.equal(early.date, "2028-06-01");
});

test("prereq: convictionCountMax evaluates against the full record", () => {
  const p = { kind: "convictionCountMax", max: 2 };
  assert.equal(evalPrereq(p, clientOk, conv(), 2, null).status, "met");
  assert.equal(evalPrereq(p, clientOk, conv(), 3, null).status, "not_met");
});

test("filing math: earliest date = anchor + years; window close computed when defined", () => {
  const relief = { earliestFiling: { anchor: "sentenceCompletedDate", years: 3 } };
  const fd = filingDates(relief, conv());
  assert.equal(fd.earliestFilingDate, "2023-08-21");
  assert.equal(fd.lastFilingDate, null);
  const windowed = { earliestFiling: { anchor: "sentenceCompletedDate", years: 0 }, filingWindow: { closeYearsAfterEarliest: 5 } };
  const fw = filingDates(windowed, conv());
  assert.equal(fw.earliestFilingDate, "2020-08-21");
  assert.equal(fw.lastFilingDate, "2025-08-21");
  assert.equal(filingDates(relief, {}).anchorMissing, true);
});

test("all prerequisites met => ready_to_file with full checklist", () => {
  const r = trackClearance({
    jurisdiction: "CA", asOf: AS_OF, client: clientOk,
    convictions: [conv({ sentenceCompletedDate: "2010-01-01", probationTerminatedDate: "2011-01-01" })],
  });
  const item = r.items.find((i) => i.reliefTypeId === "CA-dismissal-petition");
  assert.equal(item.status, "ready_to_file");
  assert.equal(item.checklist.length, 4);
  assert.ok(item.checklist.every((k) => k.status === "met"));
  assert.equal(item.earliestFilingDate, "2011-01-01");
});

test("waiting period not elapsed => status waiting with future date surfaced", () => {
  const r = trackClearance({
    jurisdiction: "IL", asOf: AS_OF, client: clientOk,
    convictions: [conv({ sentenceCompletedDate: "2025-01-01" })],
  });
  const item = r.items.find((i) => i.reliefTypeId === "IL-expungement");
  assert.equal(item.status, "waiting");
  assert.equal(item.earliestFilingDate, "2028-01-01");
});

test("hard prerequisite failed (pending case) => blocked, not waiting", () => {
  const r = trackClearance({
    jurisdiction: "IL", asOf: AS_OF, client: { ...clientOk, pendingCases: true },
    convictions: [conv({ sentenceCompletedDate: "2000-01-01" })],
  });
  assert.equal(r.items.find((i) => i.reliefTypeId === "IL-expungement").status, "blocked");
});

test("excluded offense category => blocked on the exclusion rule", () => {
  const r = trackClearance({
    jurisdiction: "IL", asOf: AS_OF, client: clientOk,
    convictions: [conv({ offenseCategory: "dui_serious", sentenceCompletedDate: "2000-01-01" })],
  });
  const item = r.items.find((i) => i.reliefTypeId === "IL-expungement");
  assert.equal(item.status, "blocked");
  assert.ok(item.checklist.some((k) => k.status === "not_met" && k.detail.includes("dui_serious")));
});

test("missing client facts => data_needed, never guessed", () => {
  const r = trackClearance({
    jurisdiction: "NY", asOf: AS_OF, client: { pendingCases: false },
    convictions: [conv({ sentenceCompletedDate: "2000-01-01" })],
  });
  const item = r.items.find((i) => i.reliefTypeId === "NY-cert-relief");
  assert.equal(item.status, "data_needed");
  assert.ok(item.checklist.some((k) => k.status === "unknown"));
});

test("status tracking: existing filing overrides recomputed status", () => {
  const r = trackClearance({
    jurisdiction: "CA", asOf: AS_OF, client: clientOk,
    convictions: [conv({ sentenceCompletedDate: "2010-01-01", probationTerminatedDate: "2011-01-01" })],
    filings: [{ reliefTypeId: "CA-dismissal-petition", convictionId: "V1", date: "2026-09-15", status: "filed" }],
  });
  const item = r.items.find((i) => i.reliefTypeId === "CA-dismissal-petition");
  assert.equal(item.status, "filed");
  assert.equal(item.filing.date, "2026-09-15");
  assert.equal(r.summary.filed, 1);
});

test("referral flags raised for counsel-dependent relief types", () => {
  const r = trackClearance({
    jurisdiction: "CA", asOf: AS_OF, client: clientOk,
    convictions: [conv({ sentenceCompletedDate: "2005-01-01", probationTerminatedDate: "2006-01-01" })],
  });
  assert.ok(r.referrals.some((x) => x.reliefTypeId === "CA-cert-rehab"));
  assert.ok(r.referrals.some((x) => x.reliefTypeId === "CA-governor-pardon"));
});

test("unknown jurisdiction => error, no fallback", () => {
  const r = trackClearance({ jurisdiction: "ZZ", asOf: AS_OF, client: clientOk, convictions: [conv()] });
  assert.ok(r.errors[0].includes("unknown jurisdiction"));
});

test("summary counts statuses across all conviction x relief pairs", () => {
  const r = trackClearance({
    jurisdiction: "IL", asOf: AS_OF, client: clientOk,
    convictions: [conv({ sentenceCompletedDate: "2000-01-01" }), conv({ id: "V2", offenseCategory: "dui_serious" })],
  });
  assert.equal(r.summary.total, 4); // 2 convictions x 2 IL relief types
  assert.equal(r.summary.ready_to_file + r.summary.blocked + r.summary.waiting + r.summary.data_needed, 4);
});

test("rules-as-data: 3 example jurisdictions, each with relief types + rule ids", () => {
  assert.deepEqual(Object.keys(JURISDICTION_RULES).sort(), ["CA", "IL", "NY"]);
  for (const rs of Object.values(JURISDICTION_RULES)) {
    assert.ok(rs.reliefTypes.length >= 2);
    for (const rt of rs.reliefTypes) assert.ok(rt.ruleId && rt.prerequisites.length >= 2);
  }
  assert.equal(getRuleset("NOPE"), null);
});

test("markdown report includes checklist marks, filing dates, referrals, gate", () => {
  const r = trackClearance({
    jurisdiction: "CA", asOf: AS_OF, client: clientOk,
    convictions: [conv({ sentenceCompletedDate: "2005-01-01", probationTerminatedDate: "2006-01-01" })],
  });
  const md = renderReport(r);
  assert.match(md, /\[x\]/);
  assert.match(md, /Earliest filing/);
  assert.match(md, /Referral/);
  assert.match(md, /counsel/);
});
