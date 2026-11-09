import { test } from "node:test";
import assert from "node:assert/strict";
import { schema, validateQuestionItems } from "./sell-side-qa-log.ts";

// sell-side-qa-log — buyer-questions extraction schema (Wave W7, NEW prompt per
// reconC §4.3; the demo had no input section today — the wiring adds one). Output is
// the IO contract's item shape {id, buyerId, category, question, receivedAt}. The
// data-room answer-drafting prompt (spec's drafting step) is a LATER PHASE and is
// deliberately NOT built: the model never drafts answers, and receivedAt is copied
// from the document, never computed.

const SAMPLE = {
  items: [
    { id: "Q-001", buyerId: "B1", category: "litigation", question: "Are there any pending lawsuits against the target?", receivedAt: "2026-09-28" },
    { id: "Q-002", buyerId: "B2", category: "financials", question: "What was 2025 revenue growth?", receivedAt: null },
  ],
};

test("sell-side schema: shape — fields, prompt builder, token budget, validator wiring", () => {
  assert.deepEqual(schema.fields, ["items"], "one top-level data field: the confidence key set");
  assert.equal(typeof schema.system, "string");
  assert.ok(schema.system.length > 200, "a real prompt contract, not a stub");
  assert.equal(typeof schema.user, "function");
  assert.match(schema.user("QUESTIONS TEXT"), /QUESTIONS TEXT/);
  assert.match(schema.user("X"), /imported from a \.docx/, "the user message frames the document source");
  assert.equal(typeof schema.maxTokens, "number");
  assert.ok(schema.maxTokens >= 500 && schema.maxTokens <= 4000);
  assert.equal(schema.validateData, validateQuestionItems, "the exported validator is the schema's validator");
});

test("sell-side schema: prompt contract — no answer drafting, verbatim questions, no computed dates", () => {
  assert.match(schema.system, /never draft answers/i, "answer drafting is a later human+citations phase — not this prompt");
  assert.match(schema.system, /no answers|without answers/i, "imported items start open");
  assert.match(schema.system, /copied verbatim/i, "questions are copied verbatim");
  assert.match(schema.system, /never compute or guess a date/i, "receivedAt is copied from the document, never computed");
  assert.match(schema.system, /never invent a buyer/i, "buyers come from the document only");
});

test("sell-side validateData: accepts a realistic buyer-questions extraction", () => {
  const r = validateQuestionItems(SAMPLE);
  assert.ok(r && r.ok, "accepted");
  assert.equal(r.value.items.length, 2);
  assert.equal(r.value.items[0].receivedAt, "2026-09-28");
  assert.equal(r.value.items[1].receivedAt, null, "unstated received date stays null — never guessed");
});

test("sell-side validateData: refuses wrong shapes", () => {
  assert.equal(validateQuestionItems(null), null);
  assert.equal(validateQuestionItems("items"), null);
  assert.equal(validateQuestionItems({ entries: [] }), null, "wrong top-level key");
  assert.equal(validateQuestionItems({ items: "nope" }), null, "items must be an array");
  assert.equal(validateQuestionItems({ items: [{ id: "Q-001" }] }), null, "missing keys");
  assert.equal(validateQuestionItems({ items: [{ ...SAMPLE.items[0], answers: [] }] }), null, "unknown keys (answers) are refused — extraction never drafts answers");
  assert.equal(validateQuestionItems({ items: [{ ...SAMPLE.items[0], question: "" }] }), null, "empty question");
  assert.equal(validateQuestionItems({ items: [{ ...SAMPLE.items[0], buyerId: "" }] }), null, "empty buyerId");
  assert.equal(validateQuestionItems({ items: [{ ...SAMPLE.items[0], receivedAt: "late September" }] }), null, "non-ISO date");
  assert.equal(validateQuestionItems({ items: [{ ...SAMPLE.items[0], receivedAt: "2026-09-99" }] }), null, "rollover date");
});

test("sell-side validateData: caps hostile-but-shaped input", () => {
  const long = { items: [{ ...SAMPLE.items[0], question: "q".repeat(501) }] };
  assert.equal(validateQuestionItems(long), null, "over-length question refused");
  const many = { items: Array.from({ length: 201 }, (_, i) => ({ ...SAMPLE.items[0], id: "Q-" + i })) };
  assert.equal(validateQuestionItems(many), null, "more than 200 items refused");
});
