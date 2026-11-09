/** Schema test for the subpoena-response extraction (Wave W4). validateData
 * accepts a realistic extraction, refuses garbage, and the prompt contract
 * carries its load-bearing hard rules (extract only stated, null-not-infer,
 * never compute deadlines, never suggest objections). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { schema, validateSubpoenaResponse } from "./subpoena-response.ts";

const SAMPLE = {
  subpoena: { served_date: "2026-11-02", service_method: "personal", caption: "No. CV-2026-01142 (fictional)" },
  responsive_scope: {
    date_range: { start: "2018-01-01", end: "2026-11-01" },
    custodians: [{ name: "R. Okonkwo", role: "VP Operations" }, { name: "T. Marsh", role: null }],
    data_types: [
      { type: "email", systems: ["Exchange Online"], notes: null },
      { type: "maintenance records", systems: ["ShopFloor DB", "paper"], notes: "paper files at the depot" },
    ],
  },
  objections_selected: [],
};

test("validateData: accepts a realistic extraction and normalizes nothing", () => {
  const r = validateSubpoenaResponse(SAMPLE);
  assert.ok(r && r.ok);
  assert.deepEqual(r.value, SAMPLE);
});

test("validateData: accepts an all-null subpoena (nothing stated in the document)", () => {
  const r = validateSubpoenaResponse({
    subpoena: { served_date: null, service_method: null, caption: null },
    responsive_scope: { date_range: null, custodians: [], data_types: [] },
    objections_selected: [],
  });
  assert.ok(r && r.ok);
  assert.equal(r.value.subpoena.served_date, null);
  assert.equal(r.value.responsive_scope.date_range, null);
});

test("validateData: refuses a non-empty objections_selected — the LLM never suggests objections", () => {
  const r = validateSubpoenaResponse({ ...SAMPLE, objections_selected: ["overbroad_time"] });
  assert.equal(r, null);
});

test("validateData: refuses garbage and wrong shapes", () => {
  for (const bad of [
    undefined, null, "subpoena", [], 42,
    {},
    { ...SAMPLE, extra: 1 },
    { ...SAMPLE, subpoena: { served_date: "2026-11-02" } }, // missing keys
    { ...SAMPLE, subpoena: { ...SAMPLE.subpoena, served_date: "November 2, 2026" } }, // non-ISO date
    { ...SAMPLE, subpoena: { ...SAMPLE.subpoena, served_date: "2026-13-02" } }, // impossible date
    { ...SAMPLE, subpoena: { ...SAMPLE.subpoena, service_method: "fax" } }, // off-enum method
    { ...SAMPLE, responsive_scope: { ...SAMPLE.responsive_scope, custodians: [{ name: "", role: null }] } }, // empty name
    { ...SAMPLE, responsive_scope: { ...SAMPLE.responsive_scope, data_types: [{ type: "email", systems: "Exchange", notes: null }] } }, // systems not an array
    { ...SAMPLE, responsive_scope: { ...SAMPLE.responsive_scope, date_range: { start: "2018-01-01" } } }, // missing end
  ]) {
    const label = JSON.stringify(bad) ?? String(bad);
    assert.equal(validateSubpoenaResponse(bad), null, `refuses ${label.slice(0, 60)}`);
  }
});

test("schema: registry shape matches the ExtractSchema interface the route consumes", () => {
  assert.deepEqual(schema.fields, ["subpoena", "responsive_scope", "objections_selected"]);
  assert.equal(typeof schema.system, "string");
  assert.equal(typeof schema.user, "function");
  assert.equal(schema.user("SUBPOENA TEXT"), "Subpoena document text (imported from a .docx):\n\nSUBPOENA TEXT");
  assert.ok(schema.maxTokens > 0 && schema.maxTokens <= 4000);
  assert.equal(schema.validateData, validateSubpoenaResponse);
});

test("prompt contract: the hard rules are present verbatim-ish (spec §'LLM prompt schema (optional capture step)')", () => {
  const s = schema.system;
  assert.match(s, /Extract ONLY what the document states; never compute deadlines or suggest objections/, "the spec's opening hard rule");
  assert.match(s, /If a field is not stated in the document, use null — do not infer/, "null-not-infer");
  assert.match(s, /never compute deadlines/i, "never-compute-dates rule");
  assert.match(s, /objections_selected must always be the empty array/, "objections never suggested");
  assert.match(s, /verbatim/i, "verbatim copying demanded");
  assert.match(s, /"served_date"/, "schema names served_date");
  assert.match(s, /"responsive_scope"/, "schema names responsive_scope");
});

test("prompt contract: reply shape is the exact envelope the route's askJson validates", () => {
  assert.match(schema.system, /"confidence": \{"subpoena": "high"\|"low"/);
});
