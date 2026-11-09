import { test } from "node:test";
import assert from "node:assert/strict";
import { schema, validateSurveyCells } from "./jurisdiction-survey-matrix.ts";

// jurisdiction-survey-matrix — survey-memo extraction schema (Wave W7; the spec's
// research-draft prompt ADAPTED to memo extraction per reconC §4.3). Hard rules are
// load-bearing: verbatim quotes / never paraphrase into a citation / never estimate
// dates, thresholds, or penalties / silence when no authoritative basis / output is
// UNVERIFIED until a human records citation + verification date.

const SAMPLE = {
  cells: [
    { jurisdiction: "US-TX", question: "q1", answer: "Unenforceable unless part of an otherwise enforceable agreement.", citation: "Tex. Bus. & Com. Code § 15.50(a)", quotedText: "Agreements not to compete are unenforceable unless part of an otherwise enforceable agreement", sourceUrl: "https://statutes.fictional.example/tx/15-50" },
    { jurisdiction: "US-CA", question: "q1", answer: "Void as to any lawful profession.", citation: "Cal. Bus. & Prof. Code § 16600", quotedText: "", sourceUrl: null },
  ],
};

test("jsm schema: shape — fields, prompt builder, token budget, validator wiring", () => {
  assert.deepEqual(schema.fields, ["cells"], "one top-level data field: the confidence key set");
  assert.equal(typeof schema.system, "string");
  assert.ok(schema.system.length > 200, "a real prompt contract, not a stub");
  assert.equal(typeof schema.user, "function");
  assert.match(schema.user("MEMO TEXT"), /MEMO TEXT/);
  assert.match(schema.user("X"), /imported from a \.docx/, "the user message frames the document source");
  assert.equal(typeof schema.maxTokens, "number");
  assert.ok(schema.maxTokens >= 500 && schema.maxTokens <= 4000);
  assert.equal(schema.validateData, validateSurveyCells, "the exported validator is the schema's validator");
});

test("jsm schema: prompt contract — unverified landing, verbatim quotes, no estimated figures, silence rule", () => {
  assert.match(schema.system, /UNVERIFIED until a human records the citation and verification date/i, "spec: output enters the matrix unverified until a human records citation + verification date");
  assert.match(schema.system, /never paraphrase into a citation/i, "spec: verbatim quotes, never paraphrased citations");
  assert.match(schema.system, /Never estimate dates, thresholds, or penalties/i, "spec hard rule");
  assert.match(schema.system, /silence is correct output/i, "spec: no authoritative basis → no cell");
  assert.match(schema.system, /copy figures exactly|copy them exactly/i, "figures are copied, not estimated");
  assert.doesNotMatch(schema.system, /"verifiedBy"/, "the reply shape never includes a verifiedBy field — that stays human");
  assert.match(schema.system, /a human records the citation and verification date/i, "verification stays a human act");
});

test("jsm validateData: accepts a realistic memo extraction", () => {
  const r = validateSurveyCells(SAMPLE);
  assert.ok(r && r.ok, "accepted");
  assert.equal(r.value.cells.length, 2);
  assert.equal(r.value.cells[0].quotedText.length > 0, true);
  assert.equal(r.value.cells[1].sourceUrl, "", "null sourceUrl normalizes to empty — no invented URL");
});

test("jsm validateData: refuses wrong shapes", () => {
  assert.equal(validateSurveyCells(null), null);
  assert.equal(validateSurveyCells("cells"), null);
  assert.equal(validateSurveyCells({ entries: [] }), null, "wrong top-level key");
  assert.equal(validateSurveyCells({ cells: "nope" }), null, "cells must be an array");
  assert.equal(validateSurveyCells({ cells: [{ jurisdiction: "US-TX" }] }), null, "missing keys");
  assert.equal(validateSurveyCells({ cells: [{ ...SAMPLE.cells[0], note: "extra" }] }), null, "unknown keys are refused");
  assert.equal(validateSurveyCells({ cells: [{ ...SAMPLE.cells[0], jurisdiction: "" }] }), null, "empty jurisdiction");
  assert.equal(validateSurveyCells({ cells: [{ ...SAMPLE.cells[0], citation: "" }] }), null, "a cell without a citation is not survey research");
});

test("jsm validateData: caps and trims hostile-but-shaped input", () => {
  const long = { cells: [{ ...SAMPLE.cells[0], answer: "a".repeat(601) }] };
  assert.equal(validateSurveyCells(long), null, "over-length answer refused");
  const many = { cells: Array.from({ length: 301 }, (_, i) => ({ ...SAMPLE.cells[0], jurisdiction: "US-" + i })) };
  assert.equal(validateSurveyCells(many), null, "more than 300 cells refused");
  const trimmed = validateSurveyCells({ cells: [{ ...SAMPLE.cells[0], question: "  q1  " }] });
  assert.ok(trimmed && trimmed.ok);
  assert.equal(trimmed.value.cells[0].question, "q1");
});
