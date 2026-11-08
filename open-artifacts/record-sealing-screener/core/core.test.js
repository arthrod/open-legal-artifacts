/** Tests: record-sealing-screener core. Run: node --test core/ */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseDate, fmtDate, addYears, yearsElapsed, daysBetween,
  getRuleset, screenRecord, screenCase, renderReport, COUNSEL_GATE, JURISDICTION_RULES,
  parseRapSheet,
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

/* ---------- improvement: statutory-cited DC ruleset ---------- */

test("DC ruleset: every path and the lookback rule cite D.C. Code § with lastVerified", () => {
  const rs = getRuleset("DC");
  for (const p of Object.values(rs.paths)) {
    assert.match(p.citation.statute, /D\.C\. Code § 16-8\d+/, `${p.ruleId} statute cite`);
    assert.ok(p.citation.lastVerified, `${p.ruleId} lastVerified`);
    assert.ok(p.citation.detail, `${p.ruleId} detail`);
  }
  assert.match(rs.subsequentConvictionRule.citation.statute, /D\.C\. Code § 16-8\d+/);
  assert.ok(rs.subsequentConvictionRule.citation.lastVerified);
});

test("statutory cite renders in the report (basis and disqualifier lines)", () => {
  const r = screenRecord({ jurisdiction: "DC", asOf: AS_OF, cases: [base({ offenseCategory: "violent_felony" })] });
  const md = renderReport(r);
  assert.match(md, /D\.C\. Code § 16-806/); // basis chain cites the statute
  assert.ok(md.includes("[verify]"));       // illustrative numbers stay verify-tagged
});

/* ---------- improvement: whole-record engine ---------- */

test("whole-record: pending sibling case gates every other case (per-case override kept)", () => {
  const r = screenRecord({
    jurisdiction: "DC", asOf: AS_OF,
    cases: [
      base({ id: "A", subsequentConvictions: undefined }),
      base({ id: "B", disposition: "acquittal", dispositionDate: "2024-06-20", subsequentConvictions: undefined }),
      base({ id: "OVR", disposition: "acquittal", dispositionDate: "2024-06-20", pendingCase: false, subsequentConvictions: undefined }),
      { id: "P", offense: "New charge (fictional)", disposition: "unknown", pendingCase: true },
    ],
  });
  assert.equal(r.results[0].determination, "ineligible");
  const dq = r.results[0].disqualifiers.find((d) => d.code === "pending_case");
  assert.ok(dq && dq.description.includes("P"), "pending flag cites the sibling case id");
  assert.equal(r.results[1].determination, "ineligible");
  assert.equal(r.results[2].determination, "potentially_eligible", "explicit pendingCase:false overrides the record gate");
  assert.equal(r.results[3].determination, "insufficient_data");
});

test("whole-record: sibling conviction feeds the lookback when subsequentConvictions is omitted", () => {
  const r = screenRecord({
    jurisdiction: "DC", asOf: AS_OF,
    cases: [
      base({ id: "OLD", sentenceCompletedDate: "2016-03-01", subsequentConvictions: undefined }),
      base({ id: "NEW", offenseDate: "2020-01-05", dispositionDate: "2020-04-14", sentenceCompletedDate: "2021-02-27" }),
    ],
  });
  assert.equal(r.results[0].determination, "ineligible");
  const sc = r.results[0].disqualifiers.find((d) => d.code === "subsequent_conviction");
  assert.ok(sc && sc.description.includes("NEW"), "lookback disqualifier cites the sibling case id");
  // explicit empty list overrides derivation: same record, manual list, no disqualifier
  const r2 = screenRecord({
    jurisdiction: "DC", asOf: AS_OF,
    cases: [
      base({ id: "OLD", sentenceCompletedDate: "2016-03-01", subsequentConvictions: [] }),
      base({ id: "NEW", offenseDate: "2020-01-05", dispositionDate: "2020-04-14", sentenceCompletedDate: "2021-02-27" }),
    ],
  });
  assert.equal(r2.results[0].determination, "potentially_eligible");
});

test("whole-record: sibling conviction counts toward the lifetime cap", () => {
  const r = screenRecord({
    jurisdiction: "TX", asOf: AS_OF,
    cases: [
      base({ id: "FIRST", sentenceCompletedDate: "2005-01-01", subsequentConvictions: undefined }),
      base({ id: "SECOND", dispositionDate: "2026-01-10", sentenceCompletedDate: "2026-02-01", offenseDate: "2025-11-01" }),
    ],
  });
  assert.equal(r.results[0].determination, "ineligible");
  const cap = r.results[0].disqualifiers.find((d) => d.code === "conviction_count_over_cap");
  assert.ok(cap && cap.description.includes("sibling"), "cap disqualifier says the extra count came from sibling cases");
});

/* ---------- improvement: parseRapSheet ---------- */

const RAP_FIXTURE = [
  "JURISDICTION: DC",
  "CASE C-1001 (2021-CF-0001)",
  "OFFENSE: Possession of a controlled substance (fictional)",
  "CATEGORY: drug_possession",
  "CLASS: misdemeanor",
  "DISPOSITION: conviction",
  "OFFENSE DATE: 2015-04-02",
  "DISPOSITION DATE: 2015-09-10",
  "SENTENCE COMPLETED: 2016-03-01",
  "FINE PAID: yes",
  "some free-form note the parser must not guess at",
  "CASE C-1002",
  "OFFENSE: Theft II (fictional)",
  "CATEGORY: theft",
  "CLASS: misdemeanor",
  "DISPOSITION: acquittal",
  "DISPOSITION DATE: 2024-06-20",
  "CONDITION OF RELEASE: ankle monitor (unclassifiable)",
  "CASE C-1003",
  "OFFENSE: Trespass (fictional)",
  "CATEGORY: trespass",
  "DISPOSITION: deferred_adjudication",
  "DISPOSITION DATE: 2022-08-01",
  "FINE PAID: no",
].join("\n");

test("parseRapSheet: fixture → 3 cases + 2 unmappedLines, never guesses", () => {
  const parsed = parseRapSheet(RAP_FIXTURE);
  assert.equal(parsed.jurisdiction, "DC");
  assert.equal(parsed.cases.length, 3);
  assert.equal(parsed.unmappedLines.length, 2);
  assert.equal(parsed.cases[0].id, "C-1001");
  assert.equal(parsed.cases[0].caseNumber, "2021-CF-0001");
  assert.equal(parsed.cases[0].disposition, "conviction");
  assert.equal(parsed.cases[0].finePaid, true);
  assert.equal(parsed.cases[0].sentenceCompletedDate, "2016-03-01");
  assert.equal(parsed.cases[1].disposition, "acquittal");
  assert.equal(parsed.cases[2].finePaid, false);
  assert.ok(parsed.unmappedLines.every((u) => Number.isInteger(u.line) && typeof u.text === "string"));
});

test("parseRapSheet: unknown disposition value or bad date → unmapped, never guessed", () => {
  const parsed = parseRapSheet("CASE X\nDISPOSITION: banana\nDISPOSITION DATE: not-a-date");
  assert.equal(parsed.cases.length, 1);
  assert.equal(parsed.cases[0].disposition, undefined);
  assert.equal(parsed.cases[0].dispositionDate, undefined);
  assert.equal(parsed.unmappedLines.length, 2);
  const parsed2 = parseRapSheet("");
  assert.equal(parsed2.cases.length, 0);
  assert.equal(parsed2.jurisdiction, null);
});

/* ---------- improvement: filing next steps ---------- */

test("filing next steps: eligible case carries steps, where to file, fee; report renders them", () => {
  const r = screenRecord({ jurisdiction: "DC", asOf: AS_OF, cases: [base()] });
  const res = r.results[0];
  assert.ok(Array.isArray(res.filingSteps) && res.filingSteps.length >= 3);
  assert.ok(res.whereToFile);
  assert.ok(res.fee != null);
  const md = renderReport(r);
  assert.match(md, /Filing next steps/);
  assert.ok(md.includes(res.whereToFile));
});

/* ---------- improvement: recheck calendar ---------- */

test("recheck calendar: nextReviewDate = earliest eligibleOnDate among needs_more_time", () => {
  const r = screenRecord({
    jurisdiction: "DC", asOf: AS_OF,
    cases: [
      base({ id: "LATE", sentenceCompletedDate: "2022-01-15" }),   // eligible 2030-01-15
      base({ id: "EARLY", sentenceCompletedDate: "2020-12-01" }),  // eligible 2028-12-01
    ],
  });
  assert.equal(r.summary.needs_more_time, 2);
  assert.equal(r.nextReviewDate, "2028-12-01");
  assert.match(renderReport(r), /Next recheck date: 2028-12-01/);
  const r2 = screenRecord({ jurisdiction: "DC", asOf: AS_OF, cases: [base()] });
  assert.equal(r2.nextReviewDate, null, "no needs_more_time cases → no recheck date");
});

/* ---------- improvement: golden-file reproducibility ---------- */

test("golden file: screenRecord+renderReport ≡ examples/output.json + report.md byte-for-byte", () => {
  const input = JSON.parse(readFileSync(new URL("../examples/input.json", import.meta.url), "utf8"));
  const out = readFileSync(new URL("../examples/output.json", import.meta.url), "utf8");
  const md = readFileSync(new URL("../examples/report.md", import.meta.url), "utf8");
  const report = screenRecord(input);
  assert.equal(JSON.stringify(report, null, 2) + "\n", out);
  assert.equal(renderReport(report), md);
});
