import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateAskLegalBody,
  validateTriageBody,
  validatePropSupportBody,
  validateAiAskLegal,
  validateAiTriage,
  validateAiPropSupport,
} from "./validate.ts";

// Strict input validation for the three POST routes + the AI-output
// validators (the "validates" half of the JSON-mode helper). Anything that is
// not exactly the expected shape is refused — no coercion, no guessing.

const KB_IDS = ["kb-001", "kb-002"];

/* ---------- request bodies ---------- */

test("ask-legal body: accepts a plain trimmed question within limits", () => {
  const r = validateAskLegalBody({ question: "  Which NDA template do I use?  " });
  assert.ok(r.ok);
  assert.equal(r.value.question, "Which NDA template do I use?");
});

test("ask-legal body: refuses missing/short/long/non-string/wrong-container", () => {
  assert.ok(!validateAskLegalBody(undefined).ok);
  assert.ok(!validateAskLegalBody(null).ok);
  assert.ok(!validateAskLegalBody([]).ok);
  assert.ok(!validateAskLegalBody("Which NDA?").ok, "a bare string is not a body");
  assert.ok(!validateAskLegalBody({}).ok);
  assert.ok(!validateAskLegalBody({ question: "" }).ok);
  assert.ok(!validateAskLegalBody({ question: "hi" }).ok, "below 4 chars");
  assert.ok(!validateAskLegalBody({ question: 42 }).ok);
  assert.ok(!validateAskLegalBody({ question: "x".repeat(501) }).ok);
  assert.ok(!validateAskLegalBody({ question: "ok?", extra: 1 }).ok, "unknown keys refused");
});

test("triage body: accepts free text 4..2000 chars, refuses everything else", () => {
  const ok = validateTriageBody({ text: "My landlord taped a notice to quit on my door." });
  assert.ok(ok.ok);
  assert.ok(!validateTriageBody({ text: "no" }).ok);
  assert.ok(!validateTriageBody({ text: "x".repeat(2001) }).ok);
  assert.ok(!validateTriageBody({ text: null }).ok);
  assert.ok(!validateTriageBody(null).ok);
});

test("prop-support body: needs quote (10..2000) and proposition (4..500)", () => {
  const ok = validatePropSupportBody({ quote: "Mr. Beltran signed the receipt at 4:20 p.m.", proposition: "Delivery was accepted without exception." });
  assert.ok(ok.ok);
  assert.ok(!validatePropSupportBody({ quote: "short", proposition: "valid prop" }).ok);
  assert.ok(!validatePropSupportBody({ quote: "a long enough quote", proposition: "no" }).ok);
  assert.ok(!validatePropSupportBody({ quote: "a long enough quote" }).ok);
  assert.ok(!validatePropSupportBody({ quote: "a long enough quote", proposition: "valid", junk: true }).ok);
});

/* ---------- AI output validators ---------- */

test("ai ask-legal output: valid grounded answer passes; junk is refused", () => {
  const good = { applicable: true, sourceId: "kb-001", answer: "Use the Mutual NDA (Form L-102) for vendors.", level: "high", reasons: ["entry kb-001 covers vendor NDAs"] };
  const v = validateAiAskLegal(good, KB_IDS);
  assert.ok(v !== null && v.ok === true);
  assert.equal(v.value.sourceId, "kb-001");
  assert.equal(v.value.level, "high");

  assert.equal(validateAiAskLegal({ applicable: true, sourceId: "kb-999", answer: "x", level: "high", reasons: [] }, KB_IDS), null, "sourceId outside the offered grounding is refused (anchor check)");
  assert.equal(validateAiAskLegal({ applicable: true, sourceId: "kb-001", answer: "", level: "high", reasons: [] }, KB_IDS), null, "empty answer refused");
  assert.equal(validateAiAskLegal({ applicable: true, sourceId: "kb-001", answer: "x", level: "certain", reasons: [] }, KB_IDS), null, "unknown level refused");
  assert.equal(validateAiAskLegal({ applicable: true, sourceId: "kb-001", answer: "x", level: "high", reasons: "because" }, KB_IDS), null, "reasons must be an array");
  assert.equal(validateAiAskLegal({ applicable: "yes", sourceId: "kb-001", answer: "x", level: "high", reasons: [] }, KB_IDS), null);
  assert.equal(validateAiAskLegal(null, KB_IDS), null);
  assert.equal(validateAiAskLegal("nope", KB_IDS), null);
});

test("ai ask-legal output: applicable=false escalation shape passes with a reason", () => {
  const v = validateAiAskLegal({ applicable: false, sourceId: "", answer: "", level: "low", reasons: ["no entry covers launching satellites"] }, KB_IDS);
  assert.ok(v !== null && v.ok === true && v.value.applicable === false);
});

test("ai ask-legal output: length caps (answer 600, reasons 6x200)", () => {
  assert.equal(validateAiAskLegal({ applicable: true, sourceId: "kb-001", answer: "x".repeat(601), level: "high", reasons: [] }, KB_IDS), null);
  assert.equal(validateAiAskLegal({ applicable: true, sourceId: "kb-001", answer: "x", level: "high", reasons: Array.from({ length: 7 }, () => "r") }, KB_IDS), null);
  assert.equal(validateAiAskLegal({ applicable: true, sourceId: "kb-001", answer: "x", level: "high", reasons: ["r".repeat(201)] }, KB_IDS), null);
});

test("ai triage output: issue + confidence 0..1 + short reason", () => {
  const v = validateAiTriage({ issue: "housing-eviction", confidence: 0.82, reason: "eviction notice and rent arrears" });
  assert.ok(v !== null && v.ok === true);
  assert.equal(v.value.issue, "housing-eviction");
  assert.equal(validateAiTriage({ issue: "housing-eviction", confidence: 1.2, reason: "x" }), null);
  assert.equal(validateAiTriage({ issue: "housing-eviction", confidence: -0.1, reason: "x" }), null);
  assert.equal(validateAiTriage({ issue: "housing-eviction", confidence: "high", reason: "x" }), null);
  assert.equal(validateAiTriage({ issue: "", confidence: 0.8, reason: "x" }), null);
  assert.equal(validateAiTriage({ confidence: 0.8, reason: "x" }), null);
  assert.equal(validateAiTriage({ issue: "housing-eviction", confidence: 0.8, reason: 7 }), null);
  assert.equal(validateAiTriage(null), null);
});

test("ai prop-support output: verdict enum + one-line reason", () => {
  const v = validateAiPropSupport({ verdict: "supported", reason: "the quote states the receipt was signed without exception" });
  assert.ok(v !== null && v.ok === true);
  assert.equal(v.value.verdict, "supported");
  assert.equal(validateAiPropSupport({ verdict: "maybe", reason: "x" }), null);
  assert.equal(validateAiPropSupport({ verdict: "supported", reason: "" }), null);
  assert.equal(validateAiPropSupport({ verdict: "supported", reason: "x".repeat(301) }), null);
  assert.equal(validateAiPropSupport({ verdict: "supported" }), null);
  assert.equal(validateAiPropSupport([1]), null);
});
