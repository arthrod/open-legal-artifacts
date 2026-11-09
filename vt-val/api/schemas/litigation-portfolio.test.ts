import { test } from "node:test";
import assert from "node:assert/strict";
import schema from "./litigation-portfolio.ts";

// Extraction-schema tests for POST /api/extract (Wave W3, class LA).
// Prompt contract: open-artifacts/litigation-portfolio/spec.md §"Prompt
// schema for the LLM part (input prep only)" — "Extract matter metadata for
// a litigation portfolio. Fictional-safe. Never compute deadlines."
// exposureBasis is a verbatim quote from the estimate memo; the LLM only
// fills the shape, deadline arithmetic stays in the core.

const MATTER_FULL = {
  id: "LIT-2026-014",
  name: "Harbor Bakehouse v. Northwind Logistics (fictional)",
  client: "Harbor Bakehouse Co.",
  claimType: "breach-of-written-contract",
  accrualDate: "2025-09-12",
  discoveryDate: null,
  tollingEvents: [{ from: "2022-09-01", to: "2023-05-01", reason: "bankruptcy stay", source: "MEMO-1 ¶4" }],
  exposureLow: 120000,
  exposureHigh: 340000,
  exposureBasis: "Counsel memo 2026-10-12: defense-range estimate (fictional)",
};
const MATTER_BARE = {
  id: "LIT-2026-021",
  name: "Delgado v. Summit Ridge Hospitality (fictional)",
  client: "M. Delgado",
  claimType: "personal-injury-negligence",
  accrualDate: null,
  discoveryDate: null,
  tollingEvents: [],
  exposureLow: null,
  exposureHigh: null,
  exposureBasis: null,
};
const SAMPLE = { matters: [MATTER_FULL, MATTER_BARE] };

test("shape: ExtractSchema conformance — fields, system, user, maxTokens, validateData", () => {
  assert.deepEqual(schema.fields, ["matters"]);
  assert.equal(typeof schema.system, "string");
  assert.ok(schema.system.length > 200, "system prompt is the spec's contract, not a stub");
  assert.match(schema.user("COMPLAINT TEXT HERE"), /COMPLAINT TEXT HERE/);
  assert.ok(schema.maxTokens >= 500 && schema.maxTokens <= 4000, "sane token budget");
  assert.equal(typeof schema.validateData, "function");
});

test("validateData accepts a realistic extraction — full matter AND a bare one (absence reported, never guessed)", () => {
  const r = schema.validateData(SAMPLE);
  assert.ok(r && r.ok, "realistic sample must pass");
  assert.deepEqual(r.value, SAMPLE);
});

test("validateData rejects garbage and non-plain shapes", () => {
  for (const bad of [null, undefined, "x", 42, [], {}, { matters: {} }, { matters: [], extra: 1 }]) {
    assert.equal(schema.validateData(bad), null, JSON.stringify(bad) + " must be refused");
  }
  assert.equal(schema.validateData({ matters: [{ ...MATTER_FULL, counsel: "A. Ferreira" }] }), null, "unknown matter key refused — portfolio fields are not extracted");
});

test("validateData never lets a computed date or an invented exposure through", () => {
  for (const d of ["09/12/2025", "September 12, 2025", "2025-9-12", "2025-09-31", ""]) {
    assert.equal(schema.validateData({ matters: [{ ...MATTER_FULL, accrualDate: d }] }), null, "non-ISO accrualDate refused: " + JSON.stringify(d));
  }
  assert.equal(schema.validateData({ matters: [{ ...MATTER_FULL, tollingEvents: [{ from: "2022-09-01", to: "09/2023", reason: "x", source: "y" }] }] }), null, "non-ISO tolling bound refused");
  assert.equal(schema.validateData({ matters: [{ ...MATTER_FULL, exposureLow: "120k" }] }), null, "exposure must be a number, never a string");
  assert.equal(schema.validateData({ matters: [{ ...MATTER_FULL, exposureLow: -1 }] }), null, "negative exposure refused");
  assert.equal(schema.validateData({ matters: [{ ...MATTER_FULL, exposureBasis: 42 }] }), null, "exposureBasis is a verbatim quote or null");
});

test("prompt contract: never compute deadlines; exposureBasis is a verbatim quote from the estimate memo", () => {
  assert.match(schema.system, /Extract matter metadata for a litigation portfolio\. Fictional-safe\. Never compute deadlines\./);
  assert.match(schema.system, /never inferred|never infer/i);
  assert.match(schema.system, /verbatim quote from the estimate memo/);
  assert.match(schema.system, /"matters"/, "reply shape names the field");
  assert.match(schema.system, /"confidence"/);
});
