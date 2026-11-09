/** Schema test for the criminal-charge-reality-check extraction (Wave W5
 * FINISH, class LA). validateData accepts a realistic extraction (including
 * the uncertain-chargeClass block that realityCheckMulti fans out), refuses
 * garbage, and the prompt contract carries its load-bearing hard rules
 * (extract only stated, never guess a class — surface candidates via
 * uncertain[], never collapse uncertainty, ISO filedOn or null). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { schema, validateCriminalChargeRealityCheck } from "./criminal-charge-reality-check.ts";

const SAMPLE = {
  jurisdiction: "NY",
  chargeClass: null,
  charge: "Fictional value-dependent offense (code XPL-911.20)",
  filedOn: "2026-11-02",
  client: { priorConvictions: 1, detained: true },
  uncertain: [
    { field: "chargeClass", candidates: ["felony_class_D", "felony_class_E"], reason: "degree depends on value of property" },
  ],
};

test("validateData: accepts a realistic uncertain-class extraction and normalizes nothing", () => {
  const r = validateCriminalChargeRealityCheck(SAMPLE);
  assert.ok(r && r.ok);
  assert.deepEqual(r.value, SAMPLE);
});

test("validateData: accepts a resolved-class extraction with no client and no uncertainty", () => {
  const r = validateCriminalChargeRealityCheck({
    jurisdiction: "PA",
    chargeClass: "misdemeanor",
    charge: "Fictional petty offense (code XPL-901.10)",
    filedOn: null,
    client: null,
    uncertain: [],
  });
  assert.ok(r && r.ok);
  assert.equal(r.value.chargeClass, "misdemeanor");
  assert.equal(r.value.filedOn, null, "unreadable filing date stays null — never guessed");
  assert.equal(r.value.client, null);
});

test("validateData: refuses garbage and wrong shapes", () => {
  for (const bad of [
    undefined, null, "charge", [], 42,
    {},
    { ...SAMPLE, extra: 1 },
    { ...SAMPLE, jurisdiction: 7 },
    { ...SAMPLE, chargeClass: 4 },
    { ...SAMPLE, filedOn: "November 2, 2026" }, // non-ISO date
    { ...SAMPLE, filedOn: "2026-13-02" }, // impossible date
    { ...SAMPLE, client: { priorConvictions: "one" } }, // non-number
    { ...SAMPLE, client: { priorConvictions: -1 } }, // negative count
    { ...SAMPLE, client: { rapSheet: true } }, // unknown client key
    { ...SAMPLE, uncertain: "ambiguous" }, // not an array
    { ...SAMPLE, uncertain: [{ field: "chargeClass", candidates: [], reason: "x" }] }, // empty candidates
    { ...SAMPLE, uncertain: [{ field: "chargeClass", candidates: ["felony_class_D", ""], reason: "x" }] }, // blank candidate
    { ...SAMPLE, uncertain: [{ field: "chargeClass", candidates: ["felony_class_D"] }] }, // missing reason
  ]) {
    const label = JSON.stringify(bad) ?? String(bad);
    assert.equal(validateCriminalChargeRealityCheck(bad), null, `refuses ${label.slice(0, 70)}`);
  }
});

test("schema: registry shape matches the ExtractSchema interface the route consumes", () => {
  assert.deepEqual(schema.fields, ["jurisdiction", "chargeClass", "charge", "filedOn", "client", "uncertain"]);
  assert.equal(typeof schema.system, "string");
  assert.equal(typeof schema.user, "function");
  assert.equal(schema.user("CHARGING TEXT"), "Charging instrument text (imported from a .docx):\n\nCHARGING TEXT");
  assert.ok(schema.maxTokens > 0 && schema.maxTokens <= 4000);
  assert.equal(schema.validateData, validateCriminalChargeRealityCheck);
});

test("prompt contract: the hard rules are present verbatim-ish (spec §'Prompt schema for the LLM part')", () => {
  const s = schema.system;
  assert.match(s, /Extract ONLY what the document states/i, "extract-only-stated opening rule");
  assert.match(s, /never collapse uncertainty/i, "uncertainty is never collapsed into one guess");
  assert.match(s, /uncertain.*candidates.*realityCheckMulti runs every candidate|realityCheckMulti runs every candidate/i, "per-candidate fan-out demanded");
  assert.match(s, /If .*class .* (is|is not stated|uncertain|ambiguous).*use null|use null.*do not (infer|guess)/i, "null-not-guess rule present");
  assert.match(s, /filedOn.*ISO|ISO.*filedOn/i, "filedOn must be ISO");
  assert.match(s, /verbatim/i, "verbatim copying demanded");
  assert.match(s, /"chargeClass"/, "schema names chargeClass");
  assert.match(s, /"uncertain"/, "schema names uncertain");
});

test("prompt contract: reply shape is the exact envelope the route's askJson validates", () => {
  assert.match(schema.system, /"confidence": \{"jurisdiction": "high"\|"low"/);
});
