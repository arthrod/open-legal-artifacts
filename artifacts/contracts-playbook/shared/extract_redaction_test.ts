import { test } from "node:test";
import assert from "node:assert/strict";
import { containsRedactionMarkers, restoreExtractResponse } from "./extract_redaction.ts";
import type { ExtractResponse } from "./types.ts";

/* ---------- containsRedactionMarkers ---------- */

test("containsRedactionMarkers: detects bracketed markers of every kind", () => {
  assert.ok(containsRedactionMarkers("draft mentions [PARTY_1] and [AMOUNT_2]"));
  assert.ok(containsRedactionMarkers("[EMAIL_1] [DATE_1] [PHONE_1] [SSN_1] [URL_1]"));
});

test("containsRedactionMarkers: matches case-insensitively and without brackets", () => {
  assert.ok(containsRedactionMarkers("see amount_2 in the draft"));
  assert.ok(containsRedactionMarkers("PARTY_1 appears unbracketed too"));
});

test("containsRedactionMarkers: plain text and malformed markers do not count", () => {
  assert.ok(!containsRedactionMarkers("no markers in this sentence"));
  assert.ok(!containsRedactionMarkers("PARTY 1 with a space is not a marker"));
  assert.ok(!containsRedactionMarkers("PARTY_one uses a word, not digits"));
});

/* ---------- restoreExtractResponse ---------- */

const RESPONSE: ExtractResponse = {
  agreement_type: "NDA with [PARTY_1]",
  party_vocabulary: "[PARTY_1] is the disclosing party.",
  summary: "Terms proposed for [PARTY_1].",
  ai_notes: "None.",
  intent_suggestion: null,
  intent_suggestion_reason: "mentions [PARTY_1]",
  rules: [
    {
      id: "r1",
      topic: "Use of information by [PARTY_1]",
      preferred: "[PARTY_1] may use information for evaluation",
      alternates: [{ rank: 1, text: "[PARTY_1] affiliates too", risk: "yellow" }],
      avoid: "Unrestricted use by [PARTY_1]",
      risk: "green",
      sample_language: "[PARTY_1] uses it",
      source_quote: "[PARTY_1] shall use",
      escalate_when: "escalate to [PARTY_1]",
      raise_mode: "proactive",
      confidence: 1,
      rationale: "because [PARTY_1]",
    },
  ],
};

const REDACTIONS = [
  { kind: "party" as const, original: "Initech", placeholder: "[PARTY_1]", index: 0 },
];

test("restoreExtractResponse: no redactions returns the same response object", () => {
  assert.equal(restoreExtractResponse(RESPONSE, []), RESPONSE);
});

test("restoreExtractResponse: restores document fields and every rule text field", () => {
  const restored = restoreExtractResponse(RESPONSE, REDACTIONS);
  assert.equal(restored.agreement_type, "NDA with Initech");
  assert.equal(restored.party_vocabulary, "Initech is the disclosing party.");
  assert.equal(restored.summary, "Terms proposed for Initech.");
  assert.equal(restored.intent_suggestion_reason, "mentions Initech");
  const rule = restored.rules[0];
  assert.equal(rule.topic, "Use of information by Initech");
  assert.equal(rule.preferred, "Initech may use information for evaluation");
  assert.equal(rule.alternates[0].text, "Initech affiliates too");
  assert.equal(rule.avoid, "Unrestricted use by Initech");
  assert.equal(rule.sample_language, "Initech uses it");
  assert.equal(rule.source_quote, "Initech shall use");
  assert.equal(rule.escalate_when, "escalate to Initech");
  assert.equal(rule.rationale, "because Initech");
  // Non-text fields pass through untouched.
  assert.equal(rule.risk, "green");
  assert.equal(rule.confidence, 1);
});

test("restoreExtractResponse: keeps a null intent_suggestion_reason null", () => {
  const restored = restoreExtractResponse(
    { ...RESPONSE, intent_suggestion_reason: null },
    REDACTIONS,
  );
  assert.equal(restored.intent_suggestion_reason, null);
});

test("restoreExtractResponse: does not mutate the model response", () => {
  restoreExtractResponse(RESPONSE, REDACTIONS);
  assert.equal(RESPONSE.rules[0].preferred, "[PARTY_1] may use information for evaluation");
  assert.equal(RESPONSE.summary, "Terms proposed for [PARTY_1].");
});
