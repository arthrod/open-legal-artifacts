/** Tests: record-clearance core. Run: node --test 'core/*.test.js' */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  parseDate, fmtDate, addYears, yearsElapsed, getRuleset,
  evalPrereq, filingDates, trackClearance, renderReport, validateIntake, JURISDICTION_RULES,
} from "./core.js";

const here = dirname(fileURLToPath(import.meta.url));

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

test("rules-as-data: full-tier jurisdictions + TX guidance tier, each with rule ids", () => {
  const full = Object.entries(JURISDICTION_RULES).filter(([, rs]) => (rs.tier ?? "full") === "full");
  assert.deepEqual(full.map(([id]) => id).sort(), ["CA", "IL", "NY"]);
  for (const [, rs] of full) {
    assert.ok(rs.reliefTypes.length >= 2);
    for (const rt of rs.reliefTypes) assert.ok(rt.ruleId && rt.prerequisites.length >= 2);
  }
  const tx = JURISDICTION_RULES.TX;
  assert.equal(tx.tier, "guidance");
  assert.ok(tx.guidanceNote.length > 0);
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

/* ---------- filing guidance as data ---------- */

test("filing guidance: ready_to_file item carries forms/steps/fee-waiver; report renders them", () => {
  const r = trackClearance({
    jurisdiction: "CA", asOf: AS_OF, client: clientOk,
    convictions: [conv({ sentenceCompletedDate: "2010-01-01", probationTerminatedDate: "2011-01-01" })],
  });
  const item = r.items.find((i) => i.reliefTypeId === "CA-dismissal-petition" && i.status === "ready_to_file");
  assert.ok(item.filingGuidance, "item carries filingGuidance");
  assert.ok(Array.isArray(item.filingGuidance.forms) && item.filingGuidance.forms.length > 0);
  assert.ok(Array.isArray(item.filingGuidance.steps) && item.filingGuidance.steps.length > 0);
  assert.ok(typeof item.filingGuidance.feeWaiverNote === "string" && item.filingGuidance.feeWaiverNote.length > 0);
  const md = renderReport(r);
  assert.match(md, /fee waiver/i);
  assert.match(md, /Forms:/);
});

test("filing guidance: every full-tier relief type defines filingGuidance and authority", () => {
  for (const rs of Object.values(JURISDICTION_RULES)) {
    if ((rs.tier ?? "full") !== "full") continue;
    for (const rt of rs.reliefTypes) {
      assert.ok(rt.filingGuidance?.forms?.length, `${rt.id} missing filingGuidance.forms`);
      assert.ok(rt.filingGuidance?.steps?.length, `${rt.id} missing filingGuidance.steps`);
      assert.ok(rt.filingGuidance?.feeWaiverNote, `${rt.id} missing feeWaiverNote`);
    }
  }
});

/* ---------- two-tier coverage ---------- */

test("guidance tier: known-but-unloaded jurisdiction returns a guidance report, never a bare error", () => {
  const r = trackClearance({ jurisdiction: "TX", asOf: AS_OF, client: clientOk, convictions: [conv()] });
  assert.ok(!r.errors, "no errors for guidance-tier jurisdiction");
  assert.equal(r.coverageTier, "guidance");
  assert.ok(r.gate && r.gate.required);
  assert.ok(r.guidanceNote.length > 0);
  assert.ok(r.items.length > 0);
  // mandatory referral: guidance tier refers every item regardless of status
  for (const it of r.items) assert.ok(it.referral, "guidance-tier items carry a referral");
  assert.ok(r.referrals.length >= r.items.length);
  const md = renderReport(r);
  assert.match(md, /guidance/i);
});

test("guidance tier: filing math tolerates relief types without an earliestFiling anchor", () => {
  const r = trackClearance({ jurisdiction: "TX", asOf: AS_OF, client: clientOk, convictions: [conv()] });
  for (const it of r.items) assert.equal(it.earliestFilingDate, null);
});

/* ---------- per-conviction facts ---------- */

test("per-conviction facts override client-level probation/fines on mixed records", () => {
  const r = trackClearance({
    jurisdiction: "CA", asOf: AS_OF,
    client: { ...clientOk, probationStatus: "completed" },
    convictions: [
      conv({ sentenceCompletedDate: "2010-01-01", probationTerminatedDate: "2011-01-01" }),
      conv({ id: "V2", probationStatus: "revoked", sentenceCompletedDate: "2010-01-01", probationTerminatedDate: "2011-01-01" }),
    ],
  });
  const pick = (cid) => r.items.find((i) => i.convictionId === cid && i.reliefTypeId === "CA-dismissal-petition");
  assert.equal(pick("V1").status, "ready_to_file");
  assert.equal(pick("V2").status, "blocked");
  const v2row = pick("V2").checklist.find((k) => k.label.includes("Probation"));
  assert.equal(v2row.status, "not_met");
  assert.match(v2row.detail, /conviction-level/);
});

test("conviction-level finesPaid override surfaces in the checklist detail", () => {
  const r = evalPrereq({ kind: "finesPaid" }, { finesPaid: true }, { finesPaid: false }, 1, null);
  assert.equal(r.status, "not_met");
  assert.match(r.detail, /conviction-level/);
});

/* ---------- validateIntake (LLM boundary) ---------- */

test("validateIntake: uncertain fields dropped + logged as issues, never guessed", () => {
  const { input, issues } = validateIntake({
    jurisdiction: "IL", asOf: AS_OF,
    client: { probationStatus: "completed", finesPaid: true, pendingCases: false, extraJunk: 1 },
    convictions: [conv()],
    uncertain: [{ field: "finesPaid", reason: "rap sheet shows balance, amount unclear" }],
  });
  assert.equal(input.client.finesPaid, undefined);
  assert.equal(input.client.probationStatus, "completed");
  assert.equal(input.client.extraJunk, undefined, "unknown keys normalized away");
  assert.ok(issues.length >= 1);
  assert.match(issues[0], /finesPaid/);
  // feeding the normalized input through the engine turns the gap into `unknown`, not a guess
  const r = trackClearance(input);
  const item = r.items.find((i) => i.reliefTypeId === "IL-expungement");
  assert.ok(item.checklist.some((k) => k.label.includes("fines") && k.status === "unknown"));
});

test("validateIntake: uncertain conviction-level field dropped per conviction; missing ids assigned", () => {
  const { input, issues } = validateIntake({
    client: { finesPaid: true },
    convictions: [{ offense: "X", finesPaid: true }, { id: "V9", offense: "Y" }],
    uncertain: [{ field: "finesPaid", reason: "unclear" }],
  });
  assert.equal(input.client.finesPaid, undefined);
  assert.ok(input.convictions.every((c) => c.finesPaid === undefined));
  assert.deepEqual(input.convictions.map((c) => c.id), ["C1", "V9"]);
  assert.equal(issues.filter((i) => i.includes("finesPaid")).length, 3); // 1 client + 2 convictions
  assert.match(issues.find((i) => i.includes("C1")), /missing id/);
});

/* ---------- authority links ---------- */

test("authority: every item carries { cite, url } and the report renders them", () => {
  const r = trackClearance({ jurisdiction: "CA", asOf: AS_OF, client: clientOk, convictions: [conv()] });
  for (const it of r.items) {
    assert.ok(it.authority && typeof it.authority.url === "string" && it.authority.url.startsWith("https://"));
    assert.ok(it.authority.cite.length > 0);
  }
  const md = renderReport(r);
  assert.match(md, /Authority:/);
  assert.match(md, /\[verify\]/);
});

/* ---------- worked intake example (examples/intake.json) ---------- */

test("examples/intake.json: validateIntake -> trackClearance pipeline runs clean", () => {
  const intake = JSON.parse(readFileSync(join(here, "../examples/intake.json"), "utf8"));
  const { input, issues } = validateIntake(intake);
  assert.ok(issues.length >= 1);
  const r = trackClearance(input);
  assert.ok(!r.errors);
  assert.ok(r.items.length > 0);
  // the uncertain client-level fact must not leak through as a guess
  assert.equal(input.client.finesPaid, undefined);
});
