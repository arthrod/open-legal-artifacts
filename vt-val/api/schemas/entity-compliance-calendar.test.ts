import { test } from "node:test";
import assert from "node:assert/strict";
import schema from "./entity-compliance-calendar.ts";

// Extraction-schema tests for POST /api/extract (Wave W3, class LA).
// Prompt contract: open-artifacts/entity-compliance-calendar/spec.md
// §"LLM prompt schema (extraction step, optional)" — structure SoS/formation
// records into entity objects; "Copy names and dates verbatim; never infer a
// formation date." "Unreadable date → null, never guessed." The obligation
// rule base is never LLM-maintained.

const ENTITY_FULL = { id: "E-1", name: "Northwind Robotics, Inc.", jurisdiction: "US-DE", type: "corp", formedOn: "2020-03-15", status: "active" };
const ENTITY_NULL_DATE = { id: "E-2", name: "Meridian Foods LLC", jurisdiction: "US-CA", type: "llc", formedOn: null, status: "dissolved" };
const SAMPLE = { entities: [ENTITY_FULL, ENTITY_NULL_DATE] };

test("shape: ExtractSchema conformance — fields, system, user, maxTokens, validateData", () => {
  assert.deepEqual(schema.fields, ["entities"]);
  assert.equal(typeof schema.system, "string");
  assert.ok(schema.system.length > 200, "system prompt is the spec's contract, not a stub");
  assert.match(schema.user("SOS RECORD TEXT HERE"), /SOS RECORD TEXT HERE/);
  assert.ok(schema.maxTokens >= 500 && schema.maxTokens <= 4000, "sane token budget");
  assert.equal(typeof schema.validateData, "function");
});

test("validateData accepts a realistic extraction — including an unreadable date carried as null", () => {
  const r = schema.validateData(SAMPLE);
  assert.ok(r && r.ok, "realistic sample must pass");
  assert.deepEqual(r.value, SAMPLE);
});

test("validateData rejects garbage and non-plain shapes", () => {
  for (const bad of [null, undefined, "x", 42, [], {}, { entities: {} }, { entities: [] , extra: 1 }]) {
    assert.equal(schema.validateData(bad), null, JSON.stringify(bad) + " must be refused");
  }
  assert.equal(schema.validateData({ entities: [{ ...ENTITY_FULL, goodStanding: true }] }), null, "unknown entity key refused");
});

test("validateData never lets an inferred formation date or a made-up jurisdiction through", () => {
  for (const formedOn of ["03/15/2020", "March 15, 2020", "2020-3-15", "2020-02-30", "1975?", 20200315]) {
    assert.equal(schema.validateData({ entities: [{ ...ENTITY_FULL, formedOn }] }), null, "non-ISO/unreadable formedOn refused: " + String(formedOn));
  }
  for (const jurisdiction of ["DE", "de", "US-ZZ0", "Delaware", "US-USA", 42]) {
    assert.equal(schema.validateData({ entities: [{ ...ENTITY_FULL, jurisdiction }] }), null, "jurisdiction must be the record's US-XX code: " + String(jurisdiction));
  }
  // a well-formed but unrecognized code (US-ZZ) passes through: the core's
  // honest posture is to flag "unknown jurisdiction" downstream, never to
  // guess or silently drop the entity upstream.
  const zz = schema.validateData({ entities: [{ ...ENTITY_FULL, jurisdiction: "US-ZZ" }] });
  assert.ok(zz && zz.ok, "well-formed unknown US-XX code is carried, not refused");
  assert.equal(schema.validateData({ entities: [{ ...ENTITY_FULL, type: "Inc." }] }), null, "type outside corp|llc|nonprofit refused");
  assert.equal(schema.validateData({ entities: [{ ...ENTITY_FULL, status: "pending" }] }), null, "status outside active|dissolved refused");
  assert.equal(schema.validateData({ entities: [{ ...ENTITY_FULL, name: "  " }] }), null, "blank name refused — names are copied verbatim, not guessed");
});

test("prompt contract: verbatim names/dates, never infer a formation date, null-not-guess", () => {
  assert.match(schema.system, /Copy names and dates verbatim; never infer a formation date\./);
  assert.match(schema.system, /null, never guessed/);
  assert.match(schema.system, /never yours to maintain|rule base is never/i);
  assert.match(schema.system, /"entities"/, "reply shape names the field");
  assert.match(schema.system, /"confidence"/);
});
