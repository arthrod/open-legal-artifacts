import { test } from "node:test";
import assert from "node:assert/strict";
import schema, { validateClearanceIntake, CLIENT_KEYS, CONVICTION_KEYS } from "./record-clearance.ts";
import { validateIntake } from "../../../open-artifacts/record-clearance/core/core.js";

// Extraction-schema tests for POST /api/extract (Wave W5, class LA).
// Prompt contract: open-artifacts/record-clearance/spec.md §"Prompt schema for
// the LLM part" — the LLM only structures a rap sheet; uncertain fields are
// omitted and the deterministic `validateIntake` gate drops them. The demo
// (demo/index.html) POSTs {schema:"record-clearance", text} and applies the
// returned draft straight through validateIntake, so the validator must accept
// exactly that contract and nothing looser.

const SAMPLE = {
  client: { probationStatus: "completed", finesPaid: true, pendingCases: false, rapSheetObtained: true },
  convictions: [
    { id: "V1", offense: "Welfare fraud — overpayment", offenseCategory: "fraud", offenseClass: null, dispositionDate: "2018-06-11", sentenceCompletedDate: "2020-08-21", probationTerminatedDate: null, probationStatus: null, finesPaid: null },
  ],
  uncertain: [{ field: "finesPaid", reason: "rap sheet shows balance, amount unclear" }],
};

test("shape: ExtractSchema conformance — fields, system, user, maxTokens, validateData", () => {
  assert.deepEqual(schema.fields, ["client", "convictions", "uncertain"]);
  assert.equal(typeof schema.system, "string");
  assert.ok(schema.system.length > 200, "system prompt is the spec's contract, not a stub");
  assert.match(schema.user("RAP SHEET TEXT HERE"), /RAP SHEET TEXT HERE/);
  assert.ok(schema.maxTokens >= 500 && schema.maxTokens <= 4000, "sane token budget");
  assert.equal(typeof schema.validateData, "function");
});

test("validateData accepts the spec's example extraction and an empty-but-well-formed one", () => {
  const r = schema.validateData(SAMPLE);
  assert.ok(r && r.ok, "spec-shaped sample must pass");
  assert.deepEqual(r.value, SAMPLE);
  const empty = schema.validateData({ client: {}, convictions: [], uncertain: [] });
  assert.ok(empty && empty.ok, "nothing-found is a valid result (gaps become unknown rows downstream)");
});

test("validateData rejects garbage and non-plain shapes", () => {
  for (const bad of [null, undefined, "x", 42, [], {}, { client: {} }, { convictions: [] }, { client: {}, convictions: [], uncertain: [], extra: 1 }]) {
    assert.equal(schema.validateData(bad), null, JSON.stringify(bad) + " must be refused");
  }
});

test("validateData enforces the core's exact key sets — unknown keys are model drift", () => {
  assert.equal(schema.validateData({ ...SAMPLE, client: { ...SAMPLE.client, notes: "…" } }), null, "unknown client key refused");
  assert.equal(schema.validateData({ ...SAMPLE, convictions: [{ ...SAMPLE.convictions[0], severity: "high" }] }), null, "unknown conviction key refused");
  assert.ok(CLIENT_KEYS.length === 6 && CONVICTION_KEYS.length === 9, "key sets mirror core CLIENT_KEYS/CONVICTION_KEYS");
});

test("validateData never lets a guessed date or mistyped boolean through", () => {
  for (const d of ["June 11, 2018", "2018-6-11", "2018-02-30", ""]) {
    assert.equal(schema.validateData({ ...SAMPLE, convictions: [{ ...SAMPLE.convictions[0], dispositionDate: d }] }), null, "non-ISO dispositionDate refused: " + JSON.stringify(d));
  }
  assert.equal(schema.validateData({ ...SAMPLE, client: { ...SAMPLE.client, finesPaid: "yes" } }), null, "string boolean refused");
  assert.equal(schema.validateData({ ...SAMPLE, client: { ...SAMPLE.client, pendingCases: 0 } }), null, "0/1 is not a boolean");
  assert.equal(schema.validateData({ ...SAMPLE, convictions: [{ ...SAMPLE.convictions[0], offense: 42 }] }), null, "offense must be a string");
  assert.equal(schema.validateData({ ...SAMPLE, convictions: [{}] }), null, "empty conviction object refused");
  const nulled = schema.validateData({ ...SAMPLE, convictions: [{ ...SAMPLE.convictions[0], dispositionDate: null }] });
  assert.ok(nulled && nulled.ok, "null date (= unknown) is accepted — never guessed, just absent");
});

test("validateData anchors every uncertain entry to a recognized field with a reason", () => {
  assert.equal(schema.validateData({ ...SAMPLE, uncertain: [{ field: "severity", reason: "not a real field" }] }), null, "uncertain field outside CLIENT/CONVICTION keys refused");
  assert.equal(schema.validateData({ ...SAMPLE, uncertain: [{ field: "finesPaid" }] }), null, "reason is required");
  assert.equal(schema.validateData({ ...SAMPLE, uncertain: [{ field: "finesPaid", reason: "" }] }), null, "empty reason refused");
});

test("integration: the deterministic validateIntake gate consumes the validated draft exactly as the demo applies it", () => {
  // happy path — no uncertainty, nothing dropped
  const clean = schema.validateData({ client: SAMPLE.client, convictions: SAMPLE.convictions, uncertain: [] });
  assert.ok(clean && clean.ok, "clean draft validates");
  const okNorm = validateIntake(clean.value);
  assert.deepEqual(okNorm.issues, []);
  assert.equal(okNorm.input.convictions[0].offenseCategory, "fraud");
  // uncertain path — the gate drops client.finesPaid and logs it (spec contract)
  const withUncertain = validateClearanceIntake(SAMPLE);
  assert.ok(withUncertain && withUncertain.ok, "sample validates");
  const norm = validateIntake(withUncertain.value);
  assert.equal(norm.input.client.finesPaid, undefined, "uncertain field dropped from client");
  assert.equal(norm.input.convictions[0].finesPaid, undefined, "uncertain field dropped from every conviction");
  assert.ok(norm.issues.some((i) => i.includes("finesPaid") && i.includes("dropped")), "drop is surfaced as an issue: " + norm.issues.join(" | "));
});

test("prompt contract: never guess; uncertain fields omitted; engine converts gaps to unknown", () => {
  assert.match(schema.system, /never guess/i);
  assert.match(schema.system, /must be omitted from client and convictions/);
  assert.match(schema.system, /unknown checklist rows/);
  assert.match(schema.system, /YYYY-MM-DD/);
  assert.match(schema.system, /"uncertain"/);
});
