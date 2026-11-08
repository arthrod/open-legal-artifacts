/** Tests: criminal-charge-reality-check core. Run: node --test 'core/*.test.js' */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseDate, fmtDate, addDays, getRuleset, buildTimeline, outcomeBand,
  applicableFactors, realityCheck, renderReport, renderPlainLanguage,
  realityCheckMulti, resolveCharge, validateBandSource, formatBandSource,
  DISCLAIMER, JURISDICTION_RULES,
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

test("factors: PA-F1/OH-F1 are diversion factors — never flagged by detention (cross-jurisdiction bug)", () => {
  const pa = applicableFactors(getRuleset("PA"), { detained: true });
  assert.equal(pa.find((f) => f.id === "PA-F1").applies, false); // was mis-flagged via id.endsWith("F1")
  const paF3 = pa.find((f) => f.id === "PA-F3");
  assert.ok(paF3.applies);
  assert.match(paF3.basis, /detained/);
  const oh = applicableFactors(getRuleset("OH"), { detained: true });
  assert.equal(oh.find((f) => f.id === "OH-F1").applies, false);
});

test("factors: diversionEligible flags PA-F1/OH-F1 diversion factors", () => {
  const pa = applicableFactors(getRuleset("PA"), { diversionEligible: true });
  const paF1 = pa.find((f) => f.id === "PA-F1");
  assert.ok(paF1.applies);
  assert.match(paF1.basis, /diversionEligible/);
  const oh = applicableFactors(getRuleset("OH"), { diversionEligible: true, detained: true });
  assert.ok(oh.find((f) => f.id === "OH-F1").applies);
  assert.ok(oh.find((f) => f.id === "OH-F3").applies); // detention still flags OH-F3
});

test("factors: every factor carries explicit when-rules (data, not id/label matching)", () => {
  for (const rs of Object.values(JURISDICTION_RULES)) {
    for (const f of rs.factors) {
      assert.ok(Array.isArray(f.when) && f.when.length > 0, `${f.id} missing when rules`);
      for (const w of f.when) {
        assert.ok(typeof w.field === "string" && w.field.length > 0, `${f.id} rule missing field`);
        assert.ok(("equals" in w) !== ("gt" in w), `${f.id} rule needs exactly one of equals|gt`);
        assert.ok(typeof w.basis === "string" && w.basis.includes(w.field), `${f.id} basis should name the field`);
      }
    }
  }
});

test("full report: timeline + sentencing range + bands + factors assembled", () => {
  const r = realityCheck(base());
  assert.equal(r.errors.length, 0);
  assert.equal(r.timeline.length, 4);
  assert.equal(r.sentencingRange.ruleId, "NY-SR-D");
  assert.equal(r.outcomeBands.bandSource.kind, "illustrative");
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

/* ---------- release playbook (shown when client detained) ---------- */

test("release playbook: dated steps computed from arraignment when client detained", () => {
  const r = realityCheck(base()); // client.detained: true
  assert.ok(r.release, "detained client must get a release playbook");
  assert.equal(r.release.applies, true);
  assert.ok(r.release.steps.length >= 3);
  const arr = r.timeline.find((s) => s.stage === "arraignment");
  assert.equal(r.release.anchoredOn, arr.window.typical); // anchor = arraignment typical date
  const offs = r.release.steps.map((s) => s.dayOffset);
  assert.deepEqual(offs, [...offs].sort((a, b) => a - b)); // ascending
  for (const st of r.release.steps) {
    assert.match(st.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(st.date, fmtDate(addDays(parseDate(r.release.anchoredOn), st.dayOffset)));
    assert.ok(typeof st.step === "string" && st.step.length > 0);
  }
});

test("release playbook: null when not detained; each ruleset carries its own playbook", () => {
  assert.equal(realityCheck(base({ client: { detained: false } })).release, null);
  const pa = realityCheck({ jurisdiction: "PA", chargeClass: "felony_class_2", filedOn: "2026-01-05", client: { detained: true } });
  const oh = realityCheck({ jurisdiction: "OH", chargeClass: "misdemeanor", filedOn: "2026-01-05", client: { detained: true } });
  assert.equal(pa.release.applies, true);
  assert.equal(oh.release.applies, true);
  assert.notEqual(pa.release.ruleId, oh.release.ruleId);
  assert.ok(pa.release.steps.some((s) => s.motion));
});

test("markdown renders the release playbook section only when detained", () => {
  assert.match(renderReport(realityCheck(base())), /Release playbook/);
  assert.doesNotMatch(renderReport(realityCheck(base({ client: { detained: false } }))), /Release playbook/);
});

/* ---------- structured band provenance ---------- */

test("bandSource is structured provenance; every ruleset band validates", () => {
  for (const rs of Object.values(JURISDICTION_RULES)) {
    for (const [cls, band] of Object.entries(rs.outcomeBands)) {
      const v = validateBandSource(band.bandSource);
      assert.ok(v.ok, `${rs.id} ${cls}: ${v.errors.join("; ")}`);
      assert.equal(band.bandSource.kind, "illustrative");
    }
  }
});

test("validateBandSource rejects malformed provenance", () => {
  assert.ok(!validateBandSource("illustrative").ok); // string, not a structured object
  assert.ok(!validateBandSource(null).ok);
  assert.ok(!validateBandSource({}).ok); // missing kind
  assert.ok(!validateBandSource({ kind: "wild-guess" }).ok); // unknown kind
  assert.ok(!validateBandSource({ kind: "cited" }).ok); // cited needs url + asOf
  assert.ok(!validateBandSource({ kind: "cited", url: "not-a-url", asOf: "2026-01-01" }).ok);
  assert.ok(!validateBandSource({ kind: "cited", url: "https://example.gov/x", asOf: "January 2026" }).ok);
  assert.ok(!validateBandSource({ kind: "illustrative", url: "https://example.gov/x" }).ok); // illustrative must not imply a data source
  assert.ok(validateBandSource({ kind: "cited", url: "https://example.gov/x", asOf: "2026-01-01", cohort: "fictional cohort", sample: 500 }).ok);
});

test("render: cited bands show asOf/url/cohort; illustrative says 'no empirical claim'", () => {
  assert.match(renderReport(realityCheck(base())), /no empirical claim/);
  const r = realityCheck(base());
  r.outcomeBands = { ...r.outcomeBands, bandSource: { kind: "cited", url: "https://fictional.gov/report", asOf: "2026-01-01", cohort: "fictional cohort", sample: 500 } };
  const md = renderReport(r);
  assert.match(md, /2026-01-01/);
  assert.match(md, /fictional\.gov/);
  assert.match(md, /fictional cohort/);
  assert.match(formatBandSource({ kind: "illustrative" }), /illustrative/);
});

/* ---------- charge-code resolution + uncertain-candidate multi-run ---------- */

test("resolveCharge: fictional code map resolves a class, surfaces ambiguity, never guesses reals", () => {
  const r = resolveCharge("XPL-910.45");
  assert.equal(r.status, "resolved");
  assert.equal(r.chargeClass, "felony_class_D");
  assert.match(r.label, /fictional/i);
  const amb = resolveCharge("XPL-911.20");
  assert.equal(amb.status, "ambiguous");
  assert.equal(amb.candidates.length, 2);
  assert.ok(amb.candidates.every((c) => JURISDICTION_RULES.NY.sentencingRanges[c.chargeClass]));
  assert.equal(resolveCharge("PL-165.45").status, "unknown"); // real-looking codes never guessed
  assert.equal(resolveCharge("XPL-000.00").status, "unknown");
});

test("realityCheckMulti: runs once per uncertain candidate and shows both", () => {
  const multi = realityCheckMulti(base({
    chargeClass: undefined,
    uncertain: [{ field: "chargeClass", candidates: ["felony_class_D", "felony_class_E"], reason: "degree depends on value of property" }],
  }));
  assert.equal(multi.reports.length, 2);
  assert.deepEqual(multi.reports.map((x) => x.report.chargeClass), ["felony_class_D", "felony_class_E"]);
  assert.ok(multi.reports.every((x) => x.report.errors.length === 0));
  assert.equal(multi.reason, "degree depends on value of property");
  // candidate unknown to the ruleset => that run reports it unset (still shown, never guessed)
  const bad = realityCheckMulti(base({ chargeClass: undefined, uncertain: [{ field: "chargeClass", candidates: ["super_felony"] }] }));
  assert.equal(bad.reports[0].report.sentencingRange, null);
  // no uncertain block => single run, no candidate field
  const single = realityCheckMulti(base());
  assert.equal(single.reports.length, 1);
  assert.equal(single.candidateField, null);
});

/* ---------- plain-language client-facing output ---------- */

test("renderPlainLanguage: <=200 words, disclaimer first, no leaked nulls, readable sentences", () => {
  const text = renderPlainLanguage(realityCheck(base()));
  const words = text.trim().split(/\s+/);
  assert.ok(words.length > 20 && words.length <= 200, `got ${words.length} words`);
  const firstSentence = text.split(/(?<=[.!?])\s/)[0];
  assert.match(firstSentence, /not a prediction/i);
  assert.match(firstSentence, /not legal advice/i);
  assert.ok(!text.includes("undefined"), "leaked undefined");
  assert.ok(!text.includes("null"), "leaked null");
  assert.ok(!text.includes("[object"), "leaked object coercion");
  const sentences = text.split(/(?<=[.!?])\s/).filter((s) => s.trim());
  const avg = words.length / sentences.length;
  assert.ok(avg <= 25, `avg sentence length ${avg} > 25`);
});

test("renderPlainLanguage: error reports say what is not available; still disclaimer-first", () => {
  const text = renderPlainLanguage(realityCheck({ jurisdiction: "ZZ", chargeClass: "x", filedOn: "2026-01-01" }));
  assert.match(text.split(/(?<=[.!?])\s/)[0], /not a prediction/i);
  assert.match(text, /not available/i);
  assert.ok(!text.includes("undefined"));
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
