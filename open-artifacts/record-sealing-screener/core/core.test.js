/** Tests: record-sealing-screener core. Run: node --test core/ */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseDate, fmtDate, addYears, yearsElapsed, daysBetween,
  getRuleset, screenRecord, screenCase, renderReport, COUNSEL_GATE, JURISDICTION_RULES,
} from "./core.js";

const AS_OF = "2026-11-07";
const base = (over = {}) => ({
  id: "C1",
  offense: "Possession of a controlled substance",
  offenseCategory: "drug_possession",
  offenseClass: "misdemeanor",
  disposition: "conviction",
  offenseDate: "2015-04-02",
  dispositionDate: "2015-09-10",
  sentenceCompletedDate: "2016-03-01",
  subsequentConvictions: [],
  ...over,
});

test("date helpers: parse, clamp, elapsed", () => {
  assert.equal(fmtDate(parseDate("2020-02-29")), "2020-02-29");
  assert.equal(parseDate("2020-13-01"), null);
  assert.equal(parseDate("not-a-date"), null);
  assert.equal(fmtDate(addYears(parseDate("2024-02-29"), 1)), "2025-02-28"); // clamp
  assert.equal(fmtDate(addYears(parseDate("2020-02-29"), 8)), "2028-02-29"); // leap target stays
  assert.equal(yearsElapsed(parseDate("2016-03-01"), parseDate("2026-11-07")), 10);
  assert.equal(daysBetween(parseDate("2026-11-01"), parseDate("2026-11-07")), 6);
});

test("conviction path: waiting period satisfied => potentially_eligible with rule chain", () => {
  const r = screenRecord({ jurisdiction: "DC", asOf: AS_OF, cases: [base()] });
  assert.equal(r.results[0].determination, "potentially_eligible");
  assert.equal(r.results[0].eligibleOnDate, "2024-03-01");
  assert.ok(r.results[0].motion.includes("Seal"));
  assert.ok(r.results[0].basis.some((b) => b.ruleId === "DC-R1"));
});

test("conviction path: waiting period not yet satisfied => needs_more_time + future date", () => {
  const r = screenRecord({ jurisdiction: "DC", asOf: AS_OF, cases: [base({ sentenceCompletedDate: "2022-01-15" })] });
  assert.equal(r.results[0].determination, "needs_more_time");
  assert.equal(r.results[0].eligibleOnDate, "2030-01-15");
});

test("disqualifying offense category => ineligible with cited rule", () => {
  const r = screenRecord({ jurisdiction: "DC", asOf: AS_OF, cases: [base({ offenseCategory: "violent_felony" })] });
  assert.equal(r.results[0].determination, "ineligible");
  const dq = r.results[0].disqualifiers.find((d) => d.code === "disqualifying_category");
  assert.ok(dq && dq.ruleId === "DC-R1");
});

test("disqualifying class => ineligible (class match)", () => {
  const r = screenRecord({ jurisdiction: "TX", asOf: AS_OF, cases: [base({ offenseClass: "felony_class_B", sentenceCompletedDate: "2000-01-01" })] });
  assert.equal(r.results[0].determination, "ineligible");
  assert.ok(r.results[0].disqualifiers.some((d) => d.code === "disqualifying_class"));
});

test("unknown disposition => insufficient_data, never a guess", () => {
  const r = screenRecord({ jurisdiction: "DC", asOf: AS_OF, cases: [base({ disposition: "unknown" })] });
  assert.equal(r.results[0].determination, "insufficient_data");
  assert.ok(r.results[0].missingData.some((m) => m.includes("disposition")));
});

test("missing sentence completion date on conviction path => insufficient_data", () => {
  const r = screenRecord({ jurisdiction: "DC", asOf: AS_OF, cases: [base({ sentenceCompletedDate: undefined })] });
  assert.equal(r.results[0].determination, "insufficient_data");
  assert.ok(r.results[0].missingData.some((m) => m.includes("sentenceCompletedDate")));
});

test("acquittal path: zero-year wait => immediately potentially_eligible", () => {
  const r = screenRecord({ jurisdiction: "CA", asOf: AS_OF, cases: [base({ disposition: "acquittal", dispositionDate: "2026-10-01" })] });
  assert.equal(r.results[0].determination, "potentially_eligible");
  assert.equal(r.results[0].eligibleOnDate, "2026-10-01");
});

test("subsequent conviction inside lookback => ineligible under lookback rule", () => {
  const r = screenRecord({
    jurisdiction: "DC", asOf: AS_OF,
    cases: [base({ subsequentConvictions: [{ date: "2020-06-01", offenseCategory: "theft" }] })],
  });
  assert.equal(r.results[0].determination, "ineligible");
  assert.ok(r.results[0].disqualifiers.some((d) => d.code === "subsequent_conviction" && d.ruleId === "DC-R6"));
});

test("subsequent conviction outside lookback does not disqualify", () => {
  // anchor 2016-03-01 + 8y window ends 2024-03-01; conviction after window
  const r = screenRecord({
    jurisdiction: "DC", asOf: AS_OF,
    cases: [base({ subsequentConvictions: [{ date: "2026-01-01" }] })],
  });
  assert.equal(r.results[0].determination, "potentially_eligible");
});

test("deferred path: unpaid fines flag as disqualifier with rule id", () => {
  const r = screenRecord({
    jurisdiction: "TX", asOf: AS_OF,
    cases: [base({ disposition: "deferred_adjudication", dispositionDate: "2018-05-01", finePaid: false })],
  });
  assert.equal(r.results[0].determination, "ineligible");
  assert.ok(r.results[0].disqualifiers.some((d) => d.code === "fines_unpaid" && d.ruleId === "TX-R5"));
});

test("lifetime conviction cap: TX cap 1 => second conviction blocks", () => {
  const r = screenRecord({
    jurisdiction: "TX", asOf: AS_OF,
    cases: [base({ subsequentConvictions: [{ date: "2015-01-01" }] })], // outside lookback, but counts toward cap
  });
  assert.equal(r.results[0].determination, "ineligible");
  assert.ok(r.results[0].disqualifiers.some((d) => d.code === "conviction_count_over_cap"));
});

test("unknown jurisdiction => all cases insufficient_data, no fallback guess", () => {
  const r = screenRecord({ jurisdiction: "ZZ", asOf: AS_OF, cases: [base()] });
  assert.equal(r.results[0].determination, "insufficient_data");
  assert.ok(r.results[0].missingData[0].includes("unknown jurisdiction"));
});

test("report always carries the verify-with-counsel gate", () => {
  const r = screenRecord({ jurisdiction: "DC", asOf: AS_OF, cases: [base()] });
  assert.equal(r.gate.required, true);
  assert.match(r.gate.message, /Verify .* counsel/i);
  assert.match(renderReport(r), /counsel/i);
});

test("summary counts match determinations", () => {
  const r = screenRecord({
    jurisdiction: "DC", asOf: AS_OF,
    cases: [base(), base({ id: "C2", disposition: "unknown" }), base({ id: "C3", offenseCategory: "sex_offense" })],
  });
  assert.equal(r.summary.total, 3);
  assert.equal(r.summary.potentially_eligible, 1);
  assert.equal(r.summary.insufficient_data, 1);
  assert.equal(r.summary.ineligible, 1);
});

test("rules-as-data: three example jurisdictions present and editable shape", () => {
  for (const id of ["DC", "CA", "TX"]) {
    const rs = getRuleset(id);
    assert.ok(rs && rs.version && rs.paths.conviction.ruleId);
    assert.ok(typeof rs.paths.conviction.waitingPeriodYears === "number");
  }
  assert.equal(getRuleset("NOPE"), null);
  assert.equal(Object.keys(JURISDICTION_RULES).length, 3);
});
