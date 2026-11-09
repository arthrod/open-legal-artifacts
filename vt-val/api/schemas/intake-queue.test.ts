/** Schema test for the intake-queue extraction (Wave W4). validateData accepts
 * a realistic extraction, refuses garbage, and the prompt contract carries its
 * load-bearing hard rules (verbatim names, never infer the opposing party,
 * never compute a deadline). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { schema, validateIntakeQueue } from "./intake-queue.ts";

const SAMPLE = {
  client: { name: "Northgate Tool Works LLC" },
  opposing: { name: "Brightline Capital Partners LP" },
  matterType: "contract dispute",
  deadlineSeen: { date: "2026-12-18", quote: "our answer is due December 18, 2026" },
};

test("validateData: accepts a realistic extraction and normalizes nothing", () => {
  const r = validateIntakeQueue(SAMPLE);
  assert.ok(r && r.ok);
  assert.deepEqual(r.value, SAMPLE);
});

test("validateData: accepts all-null fields (nothing stated in the document)", () => {
  const r = validateIntakeQueue({ client: { name: null }, opposing: { name: null }, matterType: null, deadlineSeen: null });
  assert.ok(r && r.ok);
  assert.equal(r.value.client.name, null);
  assert.equal(r.value.deadlineSeen, null);
});

test("validateData: accepts a stated deadline whose date is not ISO-formattable (quote kept, date null)", () => {
  const r = validateIntakeQueue({ ...SAMPLE, deadlineSeen: { date: null, quote: "answer due the second Friday of December" } });
  assert.ok(r && r.ok);
  assert.equal(r.value.deadlineSeen && r.value.deadlineSeen.date, null);
});

test("validateData: refuses garbage and wrong shapes", () => {
  for (const bad of [
    undefined, null, "client", [], 42,
    {}, // missing keys
    { ...SAMPLE, extra: 1 }, // unknown key
    { ...SAMPLE, client: { name: "X", role: "client" } }, // unknown nested key
    { ...SAMPLE, client: "Northgate Tool Works LLC" }, // side not an object
    { ...SAMPLE, client: { name: "" } }, // empty name
    { ...SAMPLE, client: { name: 7 } },
    { ...SAMPLE, matterType: 42 },
    { ...SAMPLE, deadlineSeen: { date: "December 18, 2026", quote: "…" } }, // non-ISO date
    { ...SAMPLE, deadlineSeen: { date: "2026-12-18" } }, // quote missing
    { ...SAMPLE, deadlineSeen: { date: "2026-12-18", quote: "" } },
    { ...SAMPLE, deadlineSeen: { date: "2026-13-40", quote: "…" } }, // impossible date
  ]) {
    const label = JSON.stringify(bad) ?? String(bad);
    assert.equal(validateIntakeQueue(bad), null, `refuses ${label.slice(0, 60)}`);
  }
});

test("schema: registry shape matches the ExtractSchema interface the route consumes", () => {
  assert.deepEqual(schema.fields, ["client", "opposing", "matterType", "deadlineSeen"]);
  assert.equal(typeof schema.system, "string");
  assert.equal(typeof schema.user, "function");
  assert.equal(schema.user("ENQUIRY TEXT"), "Intake email / letter text (imported from a .docx):\n\nENQUIRY TEXT");
  assert.ok(schema.maxTokens > 0 && schema.maxTokens <= 4000);
  assert.equal(schema.validateData, validateIntakeQueue);
});

test("prompt contract: the hard rules are present verbatim-ish (spec §'Prompt schema for the LLM part')", () => {
  const s = schema.system;
  assert.match(s, /Copy names verbatim/i, "names copied verbatim");
  assert.match(s, /never canonicalize, never infer the opposing party/i, "no canonicalization, no inferred opposing party");
  assert.match(s, /never compute/i, "never-compute rule for the deadline");
  assert.match(s, /null when the document does not state them/i, "null-not-infer for names");
  assert.match(s, /verbatim span/i, "the deadline carries a verbatim source quote");
  assert.match(s, /"client"/, "schema names client");
  assert.match(s, /"deadlineSeen"/, "schema names deadlineSeen");
});

test("prompt contract: reply shape is the exact envelope the route's askJson validates", () => {
  assert.match(schema.system, /\{"data": \{"client"/);
  assert.match(schema.system, /"confidence": \{"client": "high"\|"low"/);
});
