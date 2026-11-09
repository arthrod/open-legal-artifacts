// pro-bono-case-board.test.ts — /api/extract schema test (Wave W4 finish, class LA).
// Pins the pro-bono-case-board prompt contract (spec.md §"Prompt schema for the
// LLM part (input prep only)") and its data validator: an intake note →
// case-board fields. Hard rules under test: "Use only the skill tags from the
// provided taxonomy. Never invent a volunteer match." · words that do not map
// to the taxonomy go to unknownTerms, never into the skill arrays · no
// volunteerId/id/dates are extracted (input prep only — matching, ids, and
// dates stay with the human coordinator and the deterministic core).
// Deno test style matching vt-val/api/schemas/*.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { schema } from "./pro-bono-case-board.ts";

// Realistic extraction of a fictional eviction-intake note.
const EXTRACTION = {
  problem: "eviction defense after a benefits overpayment",
  requiredSkills: ["housing", "tenant-defense"],
  optionalSkills: ["spanish", "benefits"],
  confidence: 0.7,
  unknownTerms: ["benefits-law"],
};
const EXTRACTION_EMPTY = {
  problem: "general advice, area unclear",
  requiredSkills: [],
  optionalSkills: [],
  confidence: 0.1,
  unknownTerms: ["unfair-papers", "notice-taker"],
};

/* ---------- schema shape ---------- */

test("schema shape: fields, maxTokens, system, user builder", () => {
  assert.deepEqual(schema.fields, ["problem", "requiredSkills", "optionalSkills", "unknownTerms"]);
  assert.ok(schema.maxTokens >= 200 && schema.maxTokens <= 1500, "bounded completion budget");
  assert.ok(schema.system.length > 200, "system prompt is the spec's contract, not a stub");
  const user = schema.user("Client: T. Alvarez. Tenant received a 3-day notice.");
  assert.ok(user.includes("Client: T. Alvarez. Tenant received a 3-day notice."), "user message carries the document text");
  assert.match(user, /docx/i, "user message frames the text as an imported document");
});

/* ---------- validateData: accepts realistic extractions ---------- */

test("validateData accepts a realistic intake-note extraction (tags + unknownTerms + confidence)", () => {
  const r = schema.validateData(EXTRACTION);
  assert.ok(r && r.ok, "valid shape accepted");
  assert.deepEqual((r as { value: unknown }).value, EXTRACTION);
});

test("validateData accepts empty skill arrays with unknownTerms doing the honest work", () => {
  const r = schema.validateData(EXTRACTION_EMPTY);
  assert.ok(r && r.ok);
  assert.deepEqual((r as { value: unknown }).value, EXTRACTION_EMPTY);
});

/* ---------- validateData: rejects garbage (null = unusable → route replies INVALID) ---------- */

test("validateData rejects non-objects and missing/mistyped keys", () => {
  for (const bad of [null, undefined, "x", 42, [], {}, { problem: "x" }]) {
    assert.equal(schema.validateData(bad), null, `unusable: ${JSON.stringify(bad)}`);
  }
  for (const bad of [
    { ...EXTRACTION, problem: 42 },
    { ...EXTRACTION, problem: "" },
    { ...EXTRACTION, requiredSkills: "housing" },
    { ...EXTRACTION, optionalSkills: [42] },
    { ...EXTRACTION, unknownTerms: "benefits-law" },
    { ...EXTRACTION, confidence: "high" },
  ]) {
    assert.equal(schema.validateData(bad), null, `wrong type refused: ${JSON.stringify(bad)}`);
  }
});

test("validateData rejects wrong shapes (missing key, extra key, non-tag skill, confidence out of range)", () => {
  const drop = (k: string) => { const v = { ...EXTRACTION } as Record<string, unknown>; delete v[k]; return v; };
  for (const k of ["problem", "requiredSkills", "optionalSkills", "confidence", "unknownTerms"]) {
    assert.equal(schema.validateData(drop(k)), null, `missing key ${k} refused (exact 5-key shape)`);
  }
  assert.equal(schema.validateData({ ...EXTRACTION, volunteerId: "V-01" }), null, "a volunteer proposal is refused outright — never invent a volunteer match");
  assert.equal(schema.validateData({ ...EXTRACTION, id: "PB-1" }), null, "case ids are caller-supplied, not extracted");
  for (const bad of [["Housing"], ["tenant defense"], ["tenant_defense"], [""], ["a".repeat(41)]]) {
    assert.equal(schema.validateData({ ...EXTRACTION, requiredSkills: bad }), null, `skill tags are lowercase kebab-case: ${JSON.stringify(bad)}`);
  }
  for (const bad of [-0.1, 1.01, Number.NaN]) {
    assert.equal(schema.validateData({ ...EXTRACTION, confidence: bad }), null, `confidence outside 0–1 refused: ${String(bad)}`);
  }
});

test("validateData caps volume (route memory guard, mirroring the exemplar schemas)", () => {
  const many = { ...EXTRACTION, requiredSkills: Array.from({ length: 21 }, (_, i) => "tag-" + i) };
  assert.equal(schema.validateData(many), null, "at most 20 tags per array");
  const cap = { ...EXTRACTION, requiredSkills: Array.from({ length: 20 }, (_, i) => "tag-" + i) };
  assert.ok(schema.validateData(cap)?.ok, "exactly 20 passes");
});

/* ---------- prompt contract (spec.md rules, near-verbatim) ---------- */

test("prompt contract: the spec's hard rules are present in the system prompt", () => {
  assert.match(schema.system, /Normalize this intake note into case-board fields/, "spec task verbatim");
  assert.match(schema.system, /Use only the skill tags from the provided taxonomy/, "spec rule verbatim");
  assert.match(schema.system, /Never invent a volunteer match/, "spec rule verbatim");
  assert.match(schema.system, /words you could not map to the taxonomy/i, "unknownTerms rule from the spec's schema comment");
});

test("prompt contract: the taxonomy is listed and the envelope is machine-checkable", () => {
  for (const tag of ["housing", "tenant-defense", "family", "benefits", "consumer", "immigration", "spanish"]) {
    assert.ok(schema.system.includes('"' + tag + '"'), `taxonomy tag ${tag} listed`);
  }
  assert.match(schema.system, /"problem"/, "the reply names the problem field");
  assert.match(schema.system, /unknownTerms/, "unknownTerms is an explicit output");
  assert.match(schema.system, /confidence/, "self-confidence number is requested");
  assert.match(schema.system, /ONLY a JSON object/, "JSON-only reply demanded");
  assert.ok(!/volunteerId/.test(schema.system), "the model is never asked for a volunteer");
});
