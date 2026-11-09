import { test } from "node:test";
import assert from "node:assert/strict";
import schema from "./limitations-radar.ts";

// Extraction-schema tests for POST /api/extract (Wave W3, class LA).
// Prompt contract: open-artifacts/limitations-radar/spec.md §"Prompt schema
// for the LLM part" — the LLM only extracts claim facts from intake
// material, never computes deadlines; uncertain claims are listed with
// candidates and run per candidate downstream — never collapsed into one
// guess. The validator pins that contract's shape.

const CLAIM_TOLLING = {
  id: "CLM-1",
  claimType: "personal_injury",
  jurisdiction: "CA",
  injuryDate: "2025-03-10",
  discoveryDate: "2025-04-02",
  tollingEvents: [{ type: "bankruptcy_stay", startDate: "2022-09-01", endDate: "2023-05-01", stillOngoing: null }],
};
const CLAIM_ONGOING = {
  id: "CLM-2",
  claimType: "fraud",
  jurisdiction: "TX",
  injuryDate: null,
  discoveryDate: "2021-02-15",
  tollingEvents: [{ type: "minority", startDate: "2024-12-01", endDate: null, stillOngoing: true }],
};
const SAMPLE = {
  claims: [CLAIM_TOLLING, CLAIM_ONGOING],
  uncertain: [{ claimId: "CLM-2", field: "claimType", candidates: ["fraud", "breach_of_contract_written"], reason: "pleading not yet characterized" }],
};

test("shape: ExtractSchema conformance — fields, system, user, maxTokens, validateData", () => {
  assert.deepEqual(schema.fields, ["claims", "uncertain"]);
  assert.equal(typeof schema.system, "string");
  assert.ok(schema.system.length > 200, "system prompt is the spec's contract, not a stub");
  assert.match(schema.user("INTAKE NARRATIVE HERE"), /INTAKE NARRATIVE HERE/);
  assert.ok(schema.maxTokens >= 500 && schema.maxTokens <= 4000, "sane token budget");
  assert.equal(typeof schema.validateData, "function");
});

test("validateData accepts a realistic extraction with tolling and uncertainty", () => {
  const r = schema.validateData(SAMPLE);
  assert.ok(r && r.ok, "realistic sample must pass");
  assert.deepEqual(r.value, SAMPLE);
  const empty = schema.validateData({ claims: [], uncertain: [] });
  assert.ok(empty && empty.ok, "empty-but-well-formed extraction passes (nothing found is a result)");
});

test("validateData rejects garbage and non-plain shapes", () => {
  for (const bad of [null, undefined, "x", 42, [], {}, { claims: [] }, { uncertain: [] }, { claims: [], uncertain: [], extra: 1 }]) {
    assert.equal(schema.validateData(bad), null, JSON.stringify(bad) + " must be refused");
  }
  assert.equal(schema.validateData({ claims: [{ ...CLAIM_TOLLING, note: "…" }], uncertain: [] }), null, "unknown claim key refused");
});

test("validateData never lets a guessed date or a hanging tolling span through", () => {
  for (const d of ["March 10, 2025", "2025-3-10", "2025-02-30", ""]) {
    assert.equal(schema.validateData({ claims: [{ ...CLAIM_TOLLING, injuryDate: d }], uncertain: [] }), null, "non-ISO injuryDate refused: " + JSON.stringify(d));
  }
  assert.equal(schema.validateData({ claims: [{ ...CLAIM_TOLLING, discoveryDate: "2025-13-02" }], uncertain: [] }), null, "impossible month refused");
  assert.equal(
    schema.validateData({ claims: [{ ...CLAIM_TOLLING, tollingEvents: [{ type: "bankruptcy_stay", startDate: "2022-09-01", endDate: null, stillOngoing: null }] }], uncertain: [] }),
    null,
    "tolling span with neither endDate nor stillOngoing refused",
  );
  assert.equal(
    schema.validateData({ claims: [{ ...CLAIM_TOLLING, tollingEvents: [{ type: "bankruptcy_stay", startDate: "2022-09-01", endDate: "2023-05-01", stillOngoing: "yes" }] }], uncertain: [] }),
    null,
    "stillOngoing must be boolean-or-null, never a string",
  );
});

test("validateData anchors every uncertain entry to a real claim with real candidates", () => {
  assert.equal(schema.validateData({ claims: SAMPLE.claims, uncertain: [{ ...SAMPLE.uncertain[0], claimId: "CLM-99" }] }), null, "uncertain entry for an unknown claim refused");
  assert.equal(schema.validateData({ claims: SAMPLE.claims, uncertain: [{ ...SAMPLE.uncertain[0], candidates: [] }] }), null, "zero candidates refused — an uncertainty with no alternatives is a guess");
  assert.equal(schema.validateData({ claims: SAMPLE.claims, uncertain: [{ ...SAMPLE.uncertain[0], candidates: "fraud" }] }), null, "candidates must be an array");
});

test("prompt contract: never compute deadlines; uncertain claims run per candidate, never collapsed", () => {
  assert.match(schema.system, /never compute deadlines/i);
  assert.match(schema.system, /never guess a date/);
  assert.match(schema.system, /never collapsed into one guess/);
  assert.match(schema.system, /per candidate/);
  assert.match(schema.system, /"uncertain"/, "reply shape names the uncertainty channel");
  assert.match(schema.system, /"candidates"/);
});
