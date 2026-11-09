import { test } from "node:test";
import assert from "node:assert/strict";
import { schema, validateDocketEntries } from "./docket-watch-wall.ts";

// docket-watch-wall — docket-report extraction schema (Wave W7, NEW prompt per
// reconC §4.3). The extraction targets the feed-JSON entry shape directly (the shape
// fromRecapPayload normalizes structured RECAP input into): {id, date, description,
// case{name, judge, parties[], practiceArea, court}}. Hard rules: descriptions copied
// verbatim, never compute or guess dates, parties ALWAYS an array (the core's
// party-shape normalization tolerates strings, but the prompt still emits arrays).

const SAMPLE = {
  entries: [
    { id: "12", date: "2026-04-02", description: "Motion for sanctions for discovery misconduct filed by plaintiffs.",
      case: { name: "Meridian Foods, Inc. v. Bluecrest Logistics LLC", judge: "Hon. A. Whitfield", parties: ["Meridian Foods, Inc.", "Bluecrest Logistics LLC"], practiceArea: "commercial-litigation", court: "N.D. Ill. (fictional)" } },
    { id: "13", date: null, description: "Minute entry: hearing held.",
      case: { name: "Orr v. Talos Systems", judge: null, parties: [], practiceArea: null, court: "C.D. Cal. (fictional)" } },
  ],
};

test("docket schema: shape — fields, prompt builder, token budget, validator wiring", () => {
  assert.deepEqual(schema.fields, ["entries"], "one top-level data field: the confidence key set");
  assert.equal(typeof schema.system, "string");
  assert.ok(schema.system.length > 200, "a real prompt contract, not a stub");
  assert.equal(typeof schema.user, "function");
  assert.match(schema.user("DOCKET TEXT"), /DOCKET TEXT/);
  assert.match(schema.user("X"), /imported from a \.docx/, "the user message frames the document source");
  assert.equal(typeof schema.maxTokens, "number");
  assert.ok(schema.maxTokens >= 500 && schema.maxTokens <= 4000);
  assert.equal(schema.validateData, validateDocketEntries, "the exported validator is the schema's validator");
});

test("docket schema: prompt contract — verbatim text, never-guessed dates, array parties, spec entry shape", () => {
  assert.match(schema.system, /never compute or guess a date/i, "dates come from the report or stay null");
  assert.match(schema.system, /verbatim/i, "descriptions are copied verbatim");
  assert.match(schema.system, /ALWAYS an array/i, "parties are always emitted as arrays");
  assert.match(schema.system, /Never invent judges, parties, or courts/i, "no invented case metadata");
  assert.match(schema.system, /"parties"/, "the reply shape pins the parties field");
  assert.match(schema.system, /practiceArea/, "practiceArea is addressed (null unless the report labels one)");
});

test("docket validateData: accepts a realistic docket-report extraction", () => {
  const r = validateDocketEntries(SAMPLE);
  assert.ok(r && r.ok, "accepted");
  assert.equal(r.value.entries.length, 2);
  assert.ok(Array.isArray(r.value.entries[0].case.parties), "parties stay an array");
  assert.equal(r.value.entries[1].date, null, "unprinted date stays null — never guessed");
  assert.equal(r.value.entries[1].case.judge, null, "unprinted judge stays null");
});

test("docket validateData: refuses wrong shapes — including string parties", () => {
  assert.equal(validateDocketEntries(null), null);
  assert.equal(validateDocketEntries("entries"), null);
  assert.equal(validateDocketEntries({ items: [] }), null, "wrong top-level key");
  assert.equal(validateDocketEntries({ entries: "nope" }), null, "entries must be an array");
  assert.equal(validateDocketEntries({ entries: [{ id: "12" }] }), null, "missing keys");
  assert.equal(validateDocketEntries({ entries: [{ ...SAMPLE.entries[0], extra: 1 }] }), null, "unknown keys are refused");
  assert.equal(validateDocketEntries({ entries: [{ ...SAMPLE.entries[0], case: { ...SAMPLE.entries[0].case, parties: "Meridian Foods; Bluecrest" } }] }), null, "string parties are refused at the schema — the prompt demands arrays");
  assert.equal(validateDocketEntries({ entries: [{ ...SAMPLE.entries[0], case: { ...SAMPLE.entries[0].case, extra: 1 } }] }), null, "unknown case keys are refused");
  assert.equal(validateDocketEntries({ entries: [{ ...SAMPLE.entries[0], date: "April 2" }] }), null, "non-ISO date");
  assert.equal(validateDocketEntries({ entries: [{ ...SAMPLE.entries[0], description: "" }] }), null, "empty description");
  assert.equal(validateDocketEntries({ entries: [{ ...SAMPLE.entries[0], case: { ...SAMPLE.entries[0].case, name: "" } }] }), null, "empty case name");
});

test("docket validateData: caps hostile-but-shaped input", () => {
  const long = { entries: [{ ...SAMPLE.entries[0], description: "d".repeat(601) }] };
  assert.equal(validateDocketEntries(long), null, "over-length description refused");
  const many = { entries: Array.from({ length: 501 }, (_, i) => ({ ...SAMPLE.entries[0], id: String(i) })) };
  assert.equal(validateDocketEntries(many), null, "more than 500 entries refused");
});
