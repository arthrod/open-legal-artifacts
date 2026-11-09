import { test } from "node:test";
import assert from "node:assert/strict";
import schema from "./outside-counsel-spend.ts";

// Extraction-schema tests for POST /api/extract (Wave W3, class LA — the
// non-LEDES invoice path). Prompt contract:
// open-artifacts/outside-counsel-spend/spec.md §"LLM prompt schema
// (extraction step, optional, non-LEDES formats)" — "Never invent rates or
// amounts; copy them from the invoice." "Narrative must be verbatim."
// "Skip nothing; every line becomes an entry." LEDES 1998B text never takes
// this path — it parses deterministically through core/ledes.js.

const FEE_LINE = {
  id: "L-1",
  matterId: "M-210",
  firmId: "HPL",
  period: "2026-09",
  date: "2026-09-03",
  timekeeper: "A. Reyes",
  level: "partner",
  type: "fee",
  billing: "hourly",
  hours: 4,
  rate: 850,
  amount: 3400,
  category: null,
  narrative: "Draft response to FDA 483 letter; call with regulatory team.",
};
const EXPENSE_LINE = {
  id: "L-2",
  matterId: "M-210",
  firmId: null,
  period: "2026-09",
  date: "2026-09-28",
  timekeeper: null,
  level: null,
  type: "disbursement",
  billing: "flat",
  hours: null,
  rate: null,
  amount: 1840.25,
  category: "printing",
  narrative: "Regulatory printing and courier charges.",
};
const SAMPLE = { ledger: [FEE_LINE, EXPENSE_LINE] };

test("shape: ExtractSchema conformance — fields, system, user, maxTokens, validateData", () => {
  assert.deepEqual(schema.fields, ["ledger"]);
  assert.equal(typeof schema.system, "string");
  assert.ok(schema.system.length > 200, "system prompt is the spec's contract, not a stub");
  assert.match(schema.user("INVOICE TEXT HERE"), /INVOICE TEXT HERE/);
  assert.ok(schema.maxTokens >= 500 && schema.maxTokens <= 8000, "invoices carry many lines — budgeted larger than single-clause schemas");
  assert.equal(typeof schema.validateData, "function");
});

test("validateData accepts a realistic ledger — hourly fee AND flat disbursement lines", () => {
  const r = schema.validateData(SAMPLE);
  assert.ok(r && r.ok, "realistic sample must pass");
  assert.deepEqual(r.value, SAMPLE);
});

test("validateData rejects garbage and non-plain shapes", () => {
  for (const bad of [null, undefined, "x", 42, [], {}, { ledger: {} }, { ledger: [], extra: 1 }]) {
    assert.equal(schema.validateData(bad), null, JSON.stringify(bad) + " must be refused");
  }
  assert.equal(schema.validateData({ ledger: [{ ...FEE_LINE, writeOff: 100 }] }), null, "unknown entry key refused");
});

test("validateData never lets an invented rate, amount, date, or rewritten narrative through", () => {
  assert.equal(schema.validateData({ ledger: [{ ...FEE_LINE, amount: "3,400" }] }), null, "amount must be a number, not a formatted string");
  assert.equal(schema.validateData({ ledger: [{ ...FEE_LINE, rate: 0 }] }), null, "rate 0 refused — copy the invoice or null");
  assert.equal(schema.validateData({ ledger: [{ ...FEE_LINE, hours: -2 }] }), null, "negative hours refused");
  for (const d of ["09/03/2026", "2026-9-3", "2026-09-31", ""]) {
    assert.equal(schema.validateData({ ledger: [{ ...FEE_LINE, date: d }] }), null, "non-ISO date refused: " + JSON.stringify(d));
  }
  assert.equal(schema.validateData({ ledger: [{ ...FEE_LINE, period: "2026-9" }] }), null, "period must be YYYY-MM");
  assert.equal(schema.validateData({ ledger: [{ ...FEE_LINE, type: "expense" }] }), null, "type must be fee|disbursement");
  assert.equal(schema.validateData({ ledger: [{ ...FEE_LINE, billing: "retainer" }] }), null, "billing must be hourly|flat");
  assert.equal(schema.validateData({ ledger: [{ ...FEE_LINE, narrative: "   " }] }), null, "blank narrative refused — narratives are verbatim, never rewritten");
});

test("prompt contract: never invent rates/amounts, verbatim narratives, skip nothing", () => {
  assert.match(schema.system, /Never invent rates or amounts; copy them from the invoice\./);
  assert.match(schema.system, /Narrative must be verbatim\./);
  assert.match(schema.system, /Skip nothing; every line becomes an entry\./);
  assert.match(schema.system, /not LEDES 1998B|LEDES/i);
  assert.match(schema.system, /"ledger"/, "reply shape names the field");
  assert.match(schema.system, /"confidence"/);
});
