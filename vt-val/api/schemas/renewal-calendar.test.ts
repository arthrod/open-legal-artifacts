import { test } from "node:test";
import assert from "node:assert/strict";
import schema from "./renewal-calendar.ts";

// Extraction-schema tests for POST /api/extract (Wave W3, class LA). The
// schema module is registered under the artifact key "renewal-calendar" by
// the coordinator's post-wave pass; these tests pin the spec's prompt
// contract (open-artifacts/renewal-calendar/spec.md §"LLM prompt schema
// (extraction step, optional)") and the strict validator the route applies
// to the model's reply. Hard rules are load-bearing: temporal phrases are
// copied verbatim into dateExpression — never interpreted — and no dates are
// invented; interpretation stays with the deterministic grammar + human
// confirmations.

const CLAUSE_EXPLICIT = {
  type: "auto-renewal",
  date: "2027-04-01",
  dateExpression: null,
  quote: "This Agreement renews automatically for successive one (1) year terms unless either party gives written notice at least ninety (90) days prior to the end of the then-current term.",
  leadTimeDaysOverride: null,
  renewalTermMonths: 12,
};
const CLAUSE_EXPRESSION = {
  type: "price-adjustment",
  date: null,
  dateExpression: "within 60 days of quarter end",
  quote: "Base rent shall adjust to CPI within sixty (60) days of quarter end.",
  leadTimeDaysOverride: null,
  renewalTermMonths: null,
};
const SAMPLE = { clauses: [CLAUSE_EXPLICIT, CLAUSE_EXPRESSION] };

test("shape: ExtractSchema conformance — fields, system, user, maxTokens, validateData", () => {
  assert.deepEqual(schema.fields, ["clauses"]);
  assert.equal(typeof schema.system, "string");
  assert.ok(schema.system.length > 200, "system prompt is the spec's contract, not a stub");
  assert.match(schema.user("CLAUSE TEXT GOES HERE"), /CLAUSE TEXT GOES HERE/);
  assert.match(schema.user("x"), /contract text/i);
  assert.ok(schema.maxTokens >= 500 && schema.maxTokens <= 4000, "sane token budget");
  assert.equal(typeof schema.validateData, "function");
});

test("validateData accepts a realistic extraction (explicit dates AND verbatim expressions)", () => {
  const r = schema.validateData(SAMPLE);
  assert.ok(r && r.ok, "realistic sample must pass");
  assert.deepEqual(r.value, SAMPLE);
});

test("validateData rejects garbage and non-plain shapes", () => {
  for (const bad of [null, undefined, "x", 42, [], {}, { clauses: {} }, { clauses: [], extra: 1 }, { clauses: null }]) {
    assert.equal(schema.validateData(bad), null, JSON.stringify(bad) + " must be refused");
  }
  assert.equal(schema.validateData({ clauses: [{ ...CLAUSE_EXPLICIT, nope: 1 }] }), null, "unknown clause key refused");
});

test("validateData enforces one anchor per clause — never both, never neither", () => {
  assert.equal(schema.validateData({ clauses: [{ ...CLAUSE_EXPRESSION, date: "2027-03-01" }] }), null, "date AND dateExpression refused");
  assert.equal(schema.validateData({ clauses: [{ ...CLAUSE_EXPLICIT, date: null }] }), null, "no anchor at all refused");
});

test("validateData never lets an interpreted or malformed date through", () => {
  for (const date of ["April 2027", "2027-4-1", "2027-13-01", "2027-02-30", 20270401, ""]) {
    assert.equal(schema.validateData({ clauses: [{ ...CLAUSE_EXPRESSION, date, dateExpression: null }] }), null, "non-ISO date refused: " + String(date));
  }
  assert.equal(schema.validateData({ clauses: [{ ...CLAUSE_EXPLICIT, type: "renewal-option" }] }), null, "clause type outside the spec enum refused");
  assert.equal(schema.validateData({ clauses: [{ ...CLAUSE_EXPLICIT, quote: "   " }] }), null, "blank quote refused — quotes are the audit trail");
  assert.equal(schema.validateData({ clauses: [{ ...CLAUSE_EXPLICIT, renewalTermMonths: 12.5 }] }), null, "fractional term refused");
});

test("prompt contract: verbatim dateExpression + no invented dates are stated as hard rules", () => {
  assert.match(schema.system, /Copy temporal phrases verbatim into dateExpression — never interpret them\./);
  assert.match(schema.system, /No invented dates/);
  assert.match(schema.system, /never resolve an ambiguity yourself/);
  assert.match(schema.system, /deterministic grammar and human confirmations/);
  assert.match(schema.system, /"dateExpression"/, "reply shape names the field");
  assert.match(schema.system, /"confidence"/, "reply shape carries confidence");
});
