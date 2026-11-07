/** Tests: criminal-charge-reality-check core. Run: node --test 'core/*.test.js' */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseDate, fmtDate, addDays, getRuleset, buildTimeline, outcomeBand,
  applicableFactors, realityCheck, renderReport, DISCLAIMER, JURISDICTION_RULES,
} from "./core.js";

const base = (over = {}) => ({
  jurisdiction: "NY",
  charge: "Criminal possession of stolen property, 4th degree (fictional)",
  chargeClass: "felony_class_D",
  filedOn: "2026-11-02",
  client: { priorConvictions: 1, detained: true, counselAtArraignment: true },
  ...over,
});

test("date helpers", () => {
  assert.equal(fmtDate(addDays(parseDate("2026-11-02"), 45)), "2026-12-17");
  assert.equal(parseDate("bad"), null);
  assert.equal(parseDate("2026-11-31"), null);
});

test("timeline: stages ordered with min<=typical<=max windows from filing date", () => {
  const rules = getRuleset("NY");
  const tl = buildTimeline(rules, parseDate("2026-11-02"));
  assert.deepEqual(tl.map((s) => s.stage), ["arraignment", "discovery", "motions", "trial"]);
  for (const s of tl) {
    assert.ok(s.dayOffset.min <= s.dayOffset.typical && s.dayOffset.typical <= s.dayOffset.max);
    assert.ok(s.window.min <= s.window.typical && s.window.typical <= s.window.max);
  }
  assert.equal(tl[0].window.typical, "2026-11-03"); // filing + 1 day
  assert.equal(tl[3].window.max, "2027-11-02");     // filing + 365 days
});

test("timeline: stage day counts configurable via overrides", () => {
  const rules = getRuleset("NY");
  const tl = buildTimeline(rules, parseDate("2026-11-02"), { trial: { min: 240, typical: 330, max: 420 } });
  assert.deepEqual(tl[3].dayOffset, { min: 240, typical: 330, max: 420 });
  assert.equal(tl[3].window.typical, "2027-09-28");
});

test("outcome bands: returned per charge class; unknown class => null (no guess)", () => {
  const rules = getRuleset("NY");
  const band = outcomeBand(rules, "felony_class_D");
  assert.ok(band.plea_conviction[0] <= band.plea_conviction[1]);
  assert.equal(outcomeBand(rules, "capital_case"), null);
});

test("bands are sane: no band endpoint negative or above 100", () => {
  for (const rs of Object.values(JURISDICTION_RULES)) {
    for (const band of Object.values(rs.outcomeBands)) {
      for (const k of ["dismissal", "plea_conviction", "trial_conviction", "acquittal"]) {
        const [lo, hi] = band[k];
        assert.ok(lo >= 0 && hi <= 100 && lo <= hi, `${rs.id} ${k} band ${lo}-${hi}`);
      }
    }
  }
});

test("factors: client facts deterministically flagged as applicable", () => {
  const rules = getRuleset("NY");
  const fs = applicableFactors(rules, { priorConvictions: 2, detained: true, counselAtArraignment: true, evidenceIssues: true });
  assert.ok(fs.find((f) => f.label === "Prior convictions").applies);
  assert.ok(fs.find((f) => f.label === "Detention status").applies);
  assert.ok(fs.find((f) => f.label === "Counsel at arraignment").applies);
  assert.ok(fs.find((f) => f.label === "Weak or circumstantial evidence").applies);
});

test("factors: empty client facts => none flagged, list still shown", () => {
  const fs = applicableFactors(getRuleset("NY"), {});
  assert.ok(fs.length >= 4);
  assert.ok(fs.every((f) => !f.applies || f.label === "Detention status"));
});

test("full report: timeline + sentencing range + bands + factors assembled", () => {
  const r = realityCheck(base());
  assert.equal(r.errors.length, 0);
  assert.equal(r.timeline.length, 4);
  assert.equal(r.sentencingRange.ruleId, "NY-SR-D");
  assert.equal(r.outcomeBands.bandSource, "illustrative");
  assert.ok(r.factors.some((f) => f.applies));
});

test("disclaimer is structural on every report, including errors", () => {
  for (const input of [base(), { jurisdiction: "ZZ", chargeClass: "x", filedOn: "2026-01-01" }, base({ filedOn: "bad" })]) {
    const r = realityCheck(input);
    assert.equal(r.disclaimer.statisticalHeuristics, true);
    assert.equal(r.disclaimer.prediction, false);
    assert.equal(r.disclaimer.legalAdvice, false);
    assert.match(r.disclaimer.text, /NOT a prediction/i);
  }
});

test("unknown jurisdiction => error, nothing guessed", () => {
  const r = realityCheck({ jurisdiction: "ZZ", chargeClass: "misdemeanor", filedOn: "2026-01-01" });
  assert.ok(r.errors[0].includes("unknown jurisdiction"));
  assert.equal(r.timeline.length, 0);
});

test("charge class unknown to ruleset => explicitly unset, not nearest-class guess", () => {
  const r = realityCheck(base({ chargeClass: "super_felony" }));
  assert.equal(r.sentencingRange, null);
  assert.equal(r.outcomeBands, null);
  assert.equal(r.errors.filter((e) => e.includes("rather than guessed")).length, 2);
});

test("jurisdiction portability: PA and OH produce their own timelines and bands", () => {
  const pa = realityCheck({ jurisdiction: "PA", chargeClass: "felony_class_2", filedOn: "2026-01-05" });
  const oh = realityCheck({ jurisdiction: "OH", chargeClass: "misdemeanor", filedOn: "2026-01-05" });
  assert.equal(pa.timeline[0].dayOffset.typical, 3);
  assert.equal(pa.sentencingRange.ruleId, "PA-SR-2");
  assert.equal(oh.sentencingRange.maxMonths, 12);
  assert.notEqual(pa.outcomeBands.plea_conviction[0], oh.outcomeBands.plea_conviction[0]);
});

test("markdown report renders timeline table, bands, factors, and the strong disclaimer", () => {
  const md = renderReport(realityCheck(base()));
  assert.match(md, /Typical process timeline/);
  assert.match(md, /arraignment/);
  assert.match(md, /Likely-outcome bands/);
  assert.match(md, /NOT predictions/);
  assert.match(md, /What affects the range/);
  assert.match(md, /not legal advice/);
});
