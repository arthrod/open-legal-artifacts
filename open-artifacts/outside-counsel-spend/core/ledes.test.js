/** Tests for the deterministic LEDES 1998B parser. Run: node --test "core/*.test.js" (from artifact root) */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLedes } from "./ledes.js";

const HEADER =
  "LEDES_FILE_TYPE[]|INVOICE_DATE[]|INVOICE_ID[]|CLIENT_ID[]|LAW_FIRM_MATTER_ID[]|LINE_ITEM_DATE[]|EXP/FEE/INV_ADJ_TYPE[]|LINE_ITEM_NUMBER_OF_UNITS[]|LINE_ITEM_UNIT_COST[]|LINE_ITEM_TOTAL[]|TIMEKEEPER_NAME[]|TIMEKEEPER_LEVEL[]|LINE_ITEM_DESCRIPTION[]";

const DOC = [
  HEADER,
  "LEDES1998B|20260930|INV-100|ACME|M-210|20260903|F|4.0|850|3400.00|A. Reyes|Partner|Draft response to FDA 483 letter",
  "LEDES1998B|20260930|INV-100|ACME|M-210|20260910|F|2.0|925|1850.00|A. Reyes|Partner|Client call and strategy",
  "LEDES1998B|20260930|INV-100|ACME|M-210|20260928|E|1||1840.25|||Regulatory printing and courier",
].join("\n");

test("parseLedes maps a 3-line 1998B fixture to exact ledger entries", () => {
  const { ledger, errors } = parseLedes(DOC, { firmId: "HPL" });
  assert.equal(errors.length, 0);
  assert.equal(ledger.length, 3);
  assert.deepEqual(ledger[0], {
    id: "LIN-1",
    matterId: "M-210",
    firmId: "HPL",
    period: "2026-09",
    date: "2026-09-03",
    type: "fee",
    billing: "hourly",
    hours: 4,
    rate: 850,
    amount: 3400,
    timekeeper: "A. Reyes",
    level: "partner",
    narrative: "Draft response to FDA 483 letter",
  });
  assert.deepEqual(ledger[2], {
    id: "LIN-3",
    matterId: "M-210",
    firmId: "HPL",
    period: "2026-09",
    date: "2026-09-28",
    type: "disbursement",
    billing: "flat",
    hours: null,
    rate: null,
    amount: 1840.25,
    timekeeper: null,
    level: null,
    narrative: "Regulatory printing and courier",
  });
  // parsed LEDES output feeds the deterministic audit unchanged
  assert.equal(ledger[0].narrative, "Draft response to FDA 483 letter"); // verbatim, never rewritten
});

test("parseLedes reports malformed lines as structured errors and never guesses", () => {
  const bad = [
    HEADER,
    "LEDES1998B|20260930|INV-100|ACME|M-210|20260903|F|4.0|850|3400.00|A. Reyes|Partner", // 12 of 13 columns
    "LEDES1998B|20260930|INV-100|ACME|M-210|20261399|F|2.0|925|1850.00|A. Reyes|Partner|Impossible date", // bad date
    "LEDES1998B|20260930|INV-100|ACME|M-210|20260910|X|2.0|925|1850.00|A. Reyes|Partner|Unknown line type", // bad EXP/FEE type
    "LEDES1998B|20260930|INV-100|ACME|M-210|20260912|F|abc|925|1850.00|A. Reyes|Partner|Units not numeric", // bad units
    "LEDES1998B|20260930|INV-100|ACME|M-210|20260914|F|2.0|925|one-eighty|A. Reyes|Partner|Total not numeric", // bad total
  ].join("\n");
  const { ledger, errors } = parseLedes(bad, { firmId: "HPL" });
  assert.equal(ledger.length, 0);
  assert.equal(errors.length, 5);
  assert.deepEqual(
    errors.map((e) => [e.line, e.error]),
    [
      [2, "column_count"],
      [3, "bad_date"],
      [4, "bad_line_type"],
      [5, "bad_number"],
      [6, "bad_number"],
    ]
  );
  for (const e of errors) assert.ok(e.detail, "each error carries a detail");
});

test("parseLedes accepts IF/IE invoice-adjustment lines as flat adjustments", () => {
  const doc = [
    HEADER,
    "LEDES1998B|20260930|INV-100|ACME|M-210|20260903|F|4.0|850|3400.00|A. Reyes|Partner|Draft response to FDA 483 letter",
    "LEDES1998B|20260930|INV-100|ACME|M-210|20260929|IF|||-150.00|||Aggregate discount applied to fees",
    "LEDES1998B|20260930|INV-100|ACME|M-210|20260930|IE|||-40.25|||Credit for courier billed in error",
  ].join("\n");
  const { ledger, errors } = parseLedes(doc, { firmId: "HPL" });
  assert.deepEqual(errors, []);
  assert.equal(ledger.length, 3);
  assert.deepEqual(ledger[1], {
    id: "LIN-2",
    matterId: "M-210",
    firmId: "HPL",
    period: "2026-09",
    date: "2026-09-29",
    type: "fee",
    billing: "flat",
    hours: null,
    rate: null,
    amount: -150, // negative adjustment total preserved verbatim
    timekeeper: null,
    level: null,
    narrative: "Aggregate discount applied to fees",
  });
  assert.deepEqual(ledger[2], {
    id: "LIN-3",
    matterId: "M-210",
    firmId: "HPL",
    period: "2026-09",
    date: "2026-09-30",
    type: "disbursement",
    billing: "flat",
    hours: null,
    rate: null,
    amount: -40.25,
    timekeeper: null,
    level: null,
    narrative: "Credit for courier billed in error",
  });
  // the discount reduces period fee spend when the parsed ledger is audited
  const fees = ledger.filter((e) => e.type === "fee").reduce((s, e) => s + e.amount, 0);
  assert.equal(fees, 3250);
});

test("parseLedes flags fee lines whose units × unit cost does not equal the total", () => {
  const doc = [
    HEADER,
    "LEDES1998B|20260930|INV-100|ACME|M-210|20260903|F|4.0|850|3401.00|A. Reyes|Partner|Total off by a dollar",
  ].join("\n");
  const { ledger, errors } = parseLedes(doc, { firmId: "HPL" });
  assert.equal(ledger.length, 0);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].line, 2);
  assert.equal(errors[0].error, "total_mismatch");
  assert.match(errors[0].detail, /3401/);
});

test("parseLedes rejects headers missing required columns", () => {
  const { ledger, errors } = parseLedes("A[]|B[]\n1|2", { firmId: "HPL" });
  assert.equal(ledger.length, 0);
  assert.equal(errors[0].line, 1);
  assert.equal(errors[0].error, "missing_columns");
  assert.ok(errors[0].detail.includes("LINE_ITEM_DATE[]"));
});
