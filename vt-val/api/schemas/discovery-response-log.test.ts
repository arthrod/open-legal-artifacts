/** Schema test for the discovery-response-log requests extraction (Wave W4).
 * validateData accepts a realistic extraction, refuses garbage, and the prompt
 * contract carries its load-bearing hard rules (requests only, verbatim text,
 * never invent numbers, never draft responses/objections/deadlines). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { schema, validateDiscoveryResponseLog } from "./discovery-response-log.ts";

const SAMPLE = {
  entries: [
    { requestNo: "RFP 1", type: "rfp", requestText: "All documents concerning the design, testing, or manufacture of the VX-2 battery module." },
    { requestNo: "ROG 3", type: "interrogatory", requestText: "Identify every person with knowledge of the QC-14 test deviations." },
    { requestNo: "RFA 12", type: "rfa", requestText: "Admit that the QC-14 test log was altered after March 2025." },
  ],
};

test("validateData: accepts a realistic extraction and normalizes nothing", () => {
  const r = validateDiscoveryResponseLog(SAMPLE);
  assert.ok(r && r.ok);
  assert.deepEqual(r.value, SAMPLE);
});

test("validateData: accepts an unclear type as \"other\" and an empty requests set", () => {
  const r = validateDiscoveryResponseLog({
    entries: [{ requestNo: "SPECIAL 1", type: "other", requestText: "Do whatever the subpoena duces tecum attached hereto commands." }],
  });
  assert.ok(r && r.ok);
  assert.equal(r.value.entries[0].type, "other", "unclear type is never collapsed into a guessed enum");
  assert.ok(validateDiscoveryResponseLog({ entries: [] })?.ok, "a document with no numbered requests is honest output");
});

test("validateData: refuses garbage and wrong shapes", () => {
  for (const bad of [
    undefined, null, "requests", [], 42,
    {},
    { ...SAMPLE, extra: 1 },
    { entries: "RFP 1" },
    { entries: [{ requestNo: "RFP 1", type: "rfp" }] }, // missing requestText
    { entries: [{ requestNo: "RFP 1", type: "rfp", requestText: "ok text", objectionIds: [] }] }, // drafting leakage
    { entries: [{ requestNo: "RFP 1", type: "rfp", requestText: "ok text", responseText: "produced" }] }, // drafting leakage
    { entries: [{ requestNo: "", type: "rfp", requestText: "ok text" }] }, // empty requestNo
    { entries: [{ requestNo: "RFP 1", type: "production", requestText: "ok text" }] }, // off-enum type
    { entries: [{ requestNo: "RFP 1", type: null, requestText: "ok text" }] }, // null type is not allowed — use "other"
    { entries: [{ requestNo: "RFP 1", type: "rfp", requestText: "" }] }, // empty text
  ]) {
    const label = JSON.stringify(bad) ?? String(bad);
    assert.equal(validateDiscoveryResponseLog(bad), null, `refuses ${label.slice(0, 60)}`);
  }
});

test("schema: registry shape matches the ExtractSchema interface the route consumes", () => {
  assert.deepEqual(schema.fields, ["entries"]);
  assert.equal(typeof schema.system, "string");
  assert.equal(typeof schema.user, "function");
  assert.equal(schema.user("REQUESTS TEXT"), "Discovery requests document text (imported from a .docx):\n\nREQUESTS TEXT");
  assert.ok(schema.maxTokens > 0 && schema.maxTokens <= 4000);
  assert.equal(schema.validateData, validateDiscoveryResponseLog);
});

test("prompt contract: the hard rules are present verbatim-ish (reconC §4.3 new prompt + README invariants)", () => {
  const s = schema.system;
  assert.match(s, /Extract ONLY the requests — never draft, suggest, or compute responses, objections, or deadlines/, "requests-only rule");
  assert.match(s, /never invent a number/, "request numbers are the document's own");
  assert.match(s, /copied verbatim/, "verbatim request text demanded");
  assert.match(s, /Skip instructions, definitions, and preamble/, "non-request sections skipped");
  assert.match(s, /use "other" — never guess a type/, "type null-not-guess");
  assert.match(s, /"entries"/, "schema names entries");
  assert.match(s, /"requestText"/, "schema names requestText (spec DraftEntry field)");
});

test("prompt contract: reply shape is the exact envelope the route's askJson validates", () => {
  assert.match(schema.system, /"confidence": \{"entries": "high"\|"low"\}/);
});
