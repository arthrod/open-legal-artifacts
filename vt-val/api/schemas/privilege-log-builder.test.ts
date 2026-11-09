/** Schema test for the privilege-log-builder extraction (Wave W4). validateData
 * accepts a realistic extraction, refuses garbage, and the prompt contract carries
 * its load-bearing hard rules (metadata only, roles-or-null + uncertain[], never
 * decides privilege). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { schema, validatePrivilegeLog, ROLES } from "./privilege-log-builder.ts";

const SAMPLE = {
  documents: [
    { id: "IM-0001", date: "2026-02-03", docType: "email", author: { name: "A. Moreno", role: "attorney" }, recipients: [{ name: "J. Vale", role: "client" }], subject: "Initial case assessment", anticipationOfLitigation: null },
    { id: "IM-0002", date: "2026-02-11", docType: "memo", author: { name: "A. Moreno", role: "attorney" }, recipients: [], subject: "Research memo: forum-selection exposure", anticipationOfLitigation: true },
    { id: "IM-0003", date: null, docType: "email", author: { name: "R. Silva", role: null }, recipients: [{ name: "M. Ito", role: null }], subject: "Shipping schedule Q2", anticipationOfLitigation: null },
  ],
  uncertain: [
    { docId: "IM-0003", field: "role", candidates: ["operations", "third_party"], reason: "sender and recipient functions are not stated in the text" },
  ],
};

test("validateData: accepts a realistic extraction and normalizes nothing", () => {
  const r = validatePrivilegeLog(SAMPLE);
  assert.ok(r && r.ok);
  assert.deepEqual(r.value, SAMPLE);
});

test("validateData: accepts an empty uncertain list (everything determinable)", () => {
  const r = validatePrivilegeLog({ ...SAMPLE, uncertain: [] });
  assert.ok(r && r.ok);
  assert.deepEqual(r.value.uncertain, []);
});

test("validateData: refuses an invented role outside the INFERENCE_RULES vocabulary", () => {
  const bad = JSON.parse(JSON.stringify(SAMPLE));
  bad.documents[2].author.role = "probably_operations";
  assert.equal(validatePrivilegeLog(bad), null, "a guessed role never reaches the document set");
});

test("validateData: refuses garbage and wrong shapes", () => {
  for (const bad of [
    undefined, null, "documents", [], 42,
    {},
    { ...SAMPLE, extra: 1 },
    { documents: [], uncertain: [] }, // empty documents
    { ...SAMPLE, documents: "many" },
    { ...SAMPLE, uncertain: [{ docId: "IM-0003", field: "role", candidates: [], reason: "…" }] }, // empty candidates
    { ...SAMPLE, documents: [{ ...SAMPLE.documents[0], date: "February 3, 2026" }] }, // non-ISO date
    { ...SAMPLE, documents: [{ ...SAMPLE.documents[0], anticipationOfLitigation: "yes" }] }, // non-boolean
    { ...SAMPLE, documents: [{ ...SAMPLE.documents[0], author: { name: "A. Moreno" } }] }, // missing role key
    { ...SAMPLE, documents: [{ ...SAMPLE.documents[0], subject: "" }] }, // empty subject string
  ]) {
    const label = JSON.stringify(bad) ?? String(bad);
    assert.equal(validatePrivilegeLog(bad), null, `refuses ${label.slice(0, 60)}`);
  }
});

test("schema: registry shape matches the ExtractSchema interface the route consumes", () => {
  assert.deepEqual(schema.fields, ["documents", "uncertain"]);
  assert.equal(typeof schema.system, "string");
  assert.equal(typeof schema.user, "function");
  assert.equal(schema.user("DOC SET TEXT"), "Email / memo document text (imported from a .docx):\n\nDOC SET TEXT");
  assert.ok(schema.maxTokens > 0 && schema.maxTokens <= 4000);
  assert.equal(schema.validateData, validatePrivilegeLog);
});

test("prompt contract: the hard rules are present verbatim-ish (spec §'Prompt schema for the LLM part')", () => {
  const s = schema.system;
  assert.match(s, /only extracts metadata from raw documents/, "metadata-only rule");
  assert.match(s, /never decides privilege/, "the LLM never decides privilege");
  assert.match(s, /never guess an inference/, "never-guess rule");
  assert.match(s, /uncertain/, "uncertain[] surfaced");
  assert.match(s, /Copy names, subjects, and dates verbatim/, "verbatim rule");
  assert.match(s, /ISO YYYY-MM-DD or null when not stated/, "null-not-infer for dates");
  for (const role of ["attorney", "paralegal", "client", "corporate_officer", "third_party", "vendor", "opposing_counsel", "expert"]) {
    assert.ok(s.includes(role), `role vocabulary includes ${role}`);
  }
  assert.deepEqual(ROLES, ["attorney", "paralegal", "client", "corporate_officer", "third_party", "vendor", "opposing_counsel", "expert"]);
});

test("prompt contract: reply shape is the exact envelope the route's askJson validates", () => {
  assert.match(schema.system, /\{"data": \{"documents": \[…\], "uncertain": \[…\]\}/);
  assert.match(schema.system, /"confidence": \{"documents": "high"\|"low", "uncertain": "high"\|"low"\}/);
});
