import { test } from "node:test";
import assert from "node:assert/strict";
import { schema, validateKbDrafts } from "./ask-legal.ts";

// ask-legal — KB-ingestion extraction schema (Wave W7, NEW prompt per reconC §4.3).
// The prompt contract is the load-bearing part: drafts land pending-approval, the
// model never approves, never adds guidance the document does not state, and never
// computes dates. validateData must accept a realistic policy-bulletin extraction
// and refuse garbage.

const SAMPLE = {
  entries: [
    { id: "kb-imp-001", question: "Which NDA template do I use for a prospective vendor?", answer: "Use the Mutual NDA (Form L-102) for all prospective vendors; exceptions route to Commercial Legal.", tags: ["nda", "vendor", "contracts"], jurisdiction: "US", updated: "2026-10-30" },
    { id: "kb-imp-002", question: "Can I expense client entertainment over $500?", answer: "Entertainment above $500 requires pre-approval from Finance and the responsible partner before the event.", tags: [], jurisdiction: null, updated: null },
  ],
};

test("ask-legal schema: shape — fields, prompt builder, token budget, validator wiring", () => {
  assert.deepEqual(schema.fields, ["entries"], "one top-level data field: the confidence key set");
  assert.equal(typeof schema.system, "string");
  assert.ok(schema.system.length > 200, "a real prompt contract, not a stub");
  assert.equal(typeof schema.user, "function");
  assert.match(schema.user("POLICY TEXT"), /POLICY TEXT/);
  assert.match(schema.user("X"), /imported from a \.docx/, "the user message frames the document source");
  assert.equal(typeof schema.maxTokens, "number");
  assert.ok(schema.maxTokens >= 500 && schema.maxTokens <= 4000);
  assert.equal(schema.validateData, validateKbDrafts, "the exported validator is the schema's validator");
});

test("ask-legal schema: prompt contract — pending-approval landing, human gate, no invented content, no computed dates", () => {
  assert.match(schema.system, /pending-approval/, "drafts explicitly land pending-approval");
  assert.match(schema.system, /never approve/i, "the model never approves — approveEntry stays the human gate");
  assert.match(schema.system, /never add obligations, deadlines, or exceptions the document does not state/i, "no invented guidance");
  assert.match(schema.system, /never compute or guess a date/i, "updated is copied from the document, never computed");
  assert.match(schema.system, /verbatim/i, "answers copy the document's wording where possible");
});

test("ask-legal validateData: accepts a realistic policy-bulletin extraction", () => {
  const r = validateKbDrafts(SAMPLE);
  assert.ok(r && r.ok, "accepted");
  assert.equal(r.value.entries.length, 2);
  assert.deepEqual(r.value.entries[0].tags, ["nda", "vendor", "contracts"]);
  assert.equal(r.value.entries[1].jurisdiction, null, "unstated jurisdiction stays null");
  assert.equal(r.value.entries[1].updated, null, "unstated document date stays null — never guessed");
});

test("ask-legal validateData: refuses wrong shapes", () => {
  assert.equal(validateKbDrafts(null), null);
  assert.equal(validateKbDrafts("entries"), null);
  assert.equal(validateKbDrafts({ facts: [] }), null, "wrong top-level key");
  assert.equal(validateKbDrafts({ entries: "nope" }), null, "entries must be an array");
  assert.equal(validateKbDrafts({ entries: [{ id: "kb-imp-001", question: "Q?", answer: "A." }] }), null, "missing keys (tags/jurisdiction/updated)");
  assert.equal(validateKbDrafts({ entries: [{ ...SAMPLE.entries[0], extra: 1 }] }), null, "unknown keys are refused");
  assert.equal(validateKbDrafts({ entries: [{ ...SAMPLE.entries[0], question: "" }] }), null, "empty question");
  assert.equal(validateKbDrafts({ entries: [{ ...SAMPLE.entries[0], tags: "nda" }] }), null, "tags must be an array");
  assert.equal(validateKbDrafts({ entries: [{ ...SAMPLE.entries[0], updated: "September 2026" }] }), null, "non-ISO date");
  assert.equal(validateKbDrafts({ entries: [{ ...SAMPLE.entries[0], updated: "2026-02-30" }] }), null, "rollover date is not a real date");
});

test("ask-legal validateData: caps and trims hostile-but-shaped input", () => {
  const long = { entries: [{ ...SAMPLE.entries[0], question: "q".repeat(301) }] };
  assert.equal(validateKbDrafts(long), null, "over-length question refused");
  const many = { entries: Array.from({ length: 61 }, (_, i) => ({ ...SAMPLE.entries[0], id: "kb-imp-" + i })) };
  assert.equal(validateKbDrafts(many), null, "more than 60 entries refused");
  const trimmed = validateKbDrafts({ entries: [{ ...SAMPLE.entries[0], question: "  padded question text?  " }] });
  assert.ok(trimmed && trimmed.ok);
  assert.equal(trimmed.value.entries[0].question, "padded question text?");
});
