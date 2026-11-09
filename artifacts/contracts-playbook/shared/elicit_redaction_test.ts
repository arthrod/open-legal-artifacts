import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareElicitation } from "./elicit_redaction.ts";
import type { BriefElicitation } from "./types.ts";

const DOC =
  "Initech will pay $500,000 by January 15, 2027. Contact counsel@initech.com for details.";

const ELICITATION: BriefElicitation = {
  intro: "I reviewed the agreement with [PARTY_1].",
  detected_agreement_type: "payment agreement with [PARTY_1]",
  detected_parties: "[PARTY_1] and the counterparty",
  intent_suggestion: null,
  intent_suggestion_reason: "mentions [AMOUNT_1] payment",
  fields: [
    {
      id: "our_side",
      label: "Your side ([PARTY_1]?)",
      help: "e.g. [PARTY_1]",
      suggestions: ["[PARTY_1]", "the recipient"],
      recommended: "[PARTY_1]",
      required: true,
      input_type: "text",
    },
  ],
};

/* ---------- disabled: identity ---------- */

test("prepareElicitation: disabled passes the text through with nothing masked", () => {
  const prepared = prepareElicitation(DOC, false);
  assert.equal(prepared.text, DOC);
  const restored = prepared.restore(ELICITATION);
  assert.deepEqual(restored, ELICITATION);
});

/* ---------- enabled: masking before the model call ---------- */

test("prepareElicitation: enabled masks amounts, dates and emails without a parties list", () => {
  const prepared = prepareElicitation(DOC, true);
  assert.ok(!prepared.text.includes("$500,000"));
  assert.ok(!prepared.text.includes("January 15, 2027"));
  assert.ok(!prepared.text.includes("counsel@initech.com"));
  assert.match(prepared.text, /\[AMOUNT_1\]/);
  assert.match(prepared.text, /\[DATE_1\]/);
  assert.match(prepared.text, /\[EMAIL_1\]/);
  // A name with no corporate suffix is only masked when passed as a party.
  assert.ok(prepared.text.includes("Initech"));
});

test("prepareElicitation: known party names are masked when provided", () => {
  const prepared = prepareElicitation(DOC, true, ["Initech"]);
  assert.ok(!prepared.text.includes("Initech"));
  assert.match(prepared.text, /\[PARTY_1\]/);
});

/* ---------- restore: map the model's answer back to real values ---------- */

test("prepareElicitation: restore maps every elicitation field back to real values", () => {
  const prepared = prepareElicitation(DOC, true, ["Initech"]);
  const restored = prepared.restore(ELICITATION);
  assert.equal(restored.intro, "I reviewed the agreement with Initech.");
  assert.equal(restored.detected_agreement_type, "payment agreement with Initech");
  assert.equal(restored.detected_parties, "Initech and the counterparty");
  assert.equal(restored.intent_suggestion_reason, "mentions $500,000 payment");
  assert.equal(restored.fields[0].label, "Your side (Initech?)");
  assert.equal(restored.fields[0].help, "e.g. Initech");
  assert.deepEqual(restored.fields[0].suggestions, ["Initech", "the recipient"]);
  assert.equal(restored.fields[0].recommended, "Initech");
  // Nulls stay null, never restored into strings.
  assert.equal(restored.intent_suggestion, null);
  // The input elicitation is not mutated.
  assert.equal(ELICITATION.intro, "I reviewed the agreement with [PARTY_1].");
});

test("prepareElicitation: restore keeps a null intent_suggestion_reason null", () => {
  const prepared = prepareElicitation(DOC, true, ["Initech"]);
  const restored = prepared.restore({ ...ELICITATION, intent_suggestion_reason: null });
  assert.equal(restored.intent_suggestion_reason, null);
});
