import { test } from "node:test";
import assert from "node:assert/strict";
import { schema, validateFeedItems } from "./regulatory-horizon-scan.ts";

// regulatory-horizon-scan — bulletin/notice extraction schema (Wave W7; spec's
// "LLM prompt schema (extraction step, optional)" implemented near-verbatim). Hard
// rules: never invent dates (omit rather than guess), quote titles verbatim, the
// LLM never scores / never ranks / never decides impact. Items land as unverified
// feed entries the rubric can be re-run against.

const SAMPLE = {
  items: [
    { id: "fpc-breach-nprm", title: "Breach Notification Rulemaking", jurisdiction: "US-FED", status: "proposed", itemType: "NPRM", effectiveDate: null, commentDeadline: "2027-01-15", publishedDate: "2026-11-01", summary: "Proposes requiring breach notification within 30 days of discovery.", source: "Federal Privacy Commission (fictional)", provenance: "primary", link: "https://example.gov/fpc-breach-nprm" },
    { id: "wa-chatbot-bill", title: "WA Chatbot Disclosure Bill", jurisdiction: "Washington", status: "final", itemType: "rule", effectiveDate: "2027-04-01", commentDeadline: null, publishedDate: null, summary: "", source: "", provenance: "unknown", link: null },
  ],
};

test("rhs schema: shape — fields, prompt builder, token budget, validator wiring", () => {
  assert.deepEqual(schema.fields, ["items"], "one top-level data field: the confidence key set");
  assert.equal(typeof schema.system, "string");
  assert.ok(schema.system.length > 200, "a real prompt contract, not a stub");
  assert.equal(typeof schema.user, "function");
  assert.match(schema.user("BULLETIN TEXT"), /BULLETIN TEXT/);
  assert.match(schema.user("X"), /imported from a \.docx/, "the user message frames the document source");
  assert.equal(typeof schema.maxTokens, "number");
  assert.ok(schema.maxTokens >= 500 && schema.maxTokens <= 4000);
  assert.equal(schema.validateData, validateFeedItems, "the exported validator is the schema's validator");
});

test("rhs schema: prompt contract — spec rules verbatim-ish", () => {
  assert.match(schema.system, /Never invent dates; omit rather than guess/i, "spec hard rule");
  assert.match(schema.system, /Quote titles verbatim/i, "spec hard rule");
  assert.match(schema.system, /never scores, never ranks, never decides impact/i, "spec: the LLM never scores/ranks/decides impact");
  assert.match(schema.system, /no legal conclusions/i, "spec: summary carries no legal conclusions");
  assert.match(schema.system, /proposed\|final\|effective\|rumored/, "status vocabulary is pinned in the prompt");
});

test("rhs validateData: accepts a realistic bulletin extraction", () => {
  const r = validateFeedItems(SAMPLE);
  assert.ok(r && r.ok, "accepted");
  assert.equal(r.value.items.length, 2);
  assert.equal(r.value.items[0].commentDeadline, "2027-01-15");
  assert.equal(r.value.items[1].effectiveDate, "2027-04-01");
  assert.equal(r.value.items[1].commentDeadline, null, "unstated date stays null — never guessed");
});

test("rhs validateData: refuses wrong shapes and enums", () => {
  assert.equal(validateFeedItems(null), null);
  assert.equal(validateFeedItems("items"), null);
  assert.equal(validateFeedItems({ cells: [] }), null, "wrong top-level key");
  assert.equal(validateFeedItems({ items: "nope" }), null, "items must be an array");
  assert.equal(validateFeedItems({ items: [{ id: "x" }] }), null, "missing keys");
  assert.equal(validateFeedItems({ items: [{ ...SAMPLE.items[0], extra: 1 }] }), null, "unknown keys are refused");
  assert.equal(validateFeedItems({ items: [{ ...SAMPLE.items[0], title: "" }] }), null, "an item without a title cannot be deduped or scored");
  assert.equal(validateFeedItems({ items: [{ ...SAMPLE.items[0], status: "maybe" }] }), null, "unknown status enum");
  assert.equal(validateFeedItems({ items: [{ ...SAMPLE.items[0], itemType: "guidance" }] }), null, "unknown itemType enum");
  assert.equal(validateFeedItems({ items: [{ ...SAMPLE.items[0], provenance: "hearsay" }] }), null, "unknown provenance enum");
  assert.equal(validateFeedItems({ items: [{ ...SAMPLE.items[0], publishedDate: "last Tuesday" }] }), null, "non-ISO date");
  assert.equal(validateFeedItems({ items: [{ ...SAMPLE.items[0], publishedDate: "2026-11-32" }] }), null, "rollover date");
});

test("rhs validateData: caps hostile-but-shaped input", () => {
  const long = { items: [{ ...SAMPLE.items[0], title: "t".repeat(301) }] };
  assert.equal(validateFeedItems(long), null, "over-length title refused");
  const many = { items: Array.from({ length: 101 }, (_, i) => ({ ...SAMPLE.items[0], id: "x-" + i })) };
  assert.equal(validateFeedItems(many), null, "more than 100 items refused");
});
