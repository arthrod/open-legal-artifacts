import { test } from "node:test";
import assert from "node:assert/strict";
import schema, { validateNormalizedRapText, isGrammarLine, KNOWN_DISPOSITIONS } from "./record-sealing-screener.ts";
import { parseRapSheet } from "../../../open-artifacts/record-sealing-screener/core/core.js";

// Extraction-schema tests for POST /api/extract (Wave W5, class LA).
// The demo (demo/index.html) POSTs {schema:"record-sealing-screener", text}
// and requires j.data.text to be a non-empty STRING in the documented paste
// format, which it applies into the `rap` box for the deterministic
// parseRapSheet grammar. Spec hard rule (§"Prompt schema for the LLM part"):
// "Unmapped or uncertain fields must be omitted (not guessed) — the engine
// turns omissions into insufficient_data flags."

const GOOD_TEXT = [
  "JURISDICTION: CA",
  "CASE C1 (2015-CF-00421)",
  "OFFENSE: Possession of a controlled substance",
  "CATEGORY: drug_possession",
  "CLASS: misdemeanor",
  "DISPOSITION: conviction",
  "OFFENSE DATE: 2015-04-02",
  "DISPOSITION DATE: 2015-09-10",
  "SENTENCE COMPLETED: 2016-03-01",
  "FINE PAID: yes",
  "PENDING: no",
].join("\n");

test("shape: ExtractSchema conformance — single text field matching the demo's wired expectation", () => {
  assert.deepEqual(schema.fields, ["text"]);
  assert.equal(typeof schema.system, "string");
  assert.ok(schema.system.length > 200, "system prompt is the spec's contract, not a stub");
  assert.match(schema.user("RAP SHEET TEXT HERE"), /RAP SHEET TEXT HERE/);
  assert.ok(schema.maxTokens >= 500 && schema.maxTokens <= 4000, "sane token budget");
  assert.equal(typeof schema.validateData, "function");
});

test("validateData accepts a fully normalized rap sheet and normalizes whitespace", () => {
  const r = schema.validateData({ text: GOOD_TEXT.replace(/\n/g, "\r\n") + "\n\n   " });
  assert.ok(r && r.ok, "documented paste format must pass");
  assert.deepEqual(r.value, { text: GOOD_TEXT }, "CRLF and trailing blanks normalize to clean LF text");
});

test("validateData rejects garbage and non-plain shapes", () => {
  for (const bad of [null, undefined, "x", 42, [], {}, { text: 42 }, { text: "" }, { text: "   " }, { text: GOOD_TEXT, extra: 1 }]) {
    assert.equal(schema.validateData(bad), null, JSON.stringify(bad) + " must be refused");
  }
});

test("unmapped lines are omitted, never passed through — the spec's insufficient_data contract", () => {
  const messy = [
    GOOD_TEXT,
    "Notes: subject on probation until further order", // lowercase key — outside the grammar
    "CONDITIONS: stay away from venue", // real UPPERCASE key, but not in the documented set
  ].join("\n");
  const r = validateNormalizedRapText({ text: messy });
  assert.ok(r && r.ok, "still usable — the grammar-valid core survives");
  assert.equal(r.value.text, GOOD_TEXT, "unmapped lines dropped from the served text");
});

test("ambiguous values are omitted line-by-line: unknown disposition, non-ISO date, non-boolean flag, lowercase jurisdiction", () => {
  assert.equal(isGrammarLine("DISPOSITION: deferred"), false, "value outside the six known dispositions is omitted");
  assert.equal(KNOWN_DISPOSITIONS.size, 6);
  for (const bad of [
    "OFFENSE DATE: 04/02/2015",
    "OFFENSE DATE: 2015-4-2",
    "OFFENSE DATE: 2015-02-30",
    "SENTENCE COMPLETED: unknown",
    "FINE PAID: maybe",
    "PENDING: n/a",
    "JURISDICTION: ca",
    "JURISDICTION: California",
    "CASE", // header without an id is not the grammar
    "TOTAL: 3 cases", // undocumented key
  ]) {
    assert.equal(isGrammarLine(bad), false, "grammar rejects: " + bad);
  }
  const withBadDate = validateNormalizedRapText({ text: "OFFENSE DATE: 04/02/2015\n" + GOOD_TEXT });
  assert.ok(withBadDate && withBadDate.ok);
  assert.equal(withBadDate.value.text, GOOD_TEXT, "bad date line omitted, the rest served");
  assert.equal(schema.validateData({ text: "DISPOSITION: convicted" }), null, "nothing grammar-valid remains → refused, never a guess");
});

test("integration: validator output feeds the deterministic parseRapSheet with zero unmapped lines", () => {
  const r = validateNormalizedRapText({ text: GOOD_TEXT });
  assert.ok(r && r.ok, "good text validates");
  const parsed = parseRapSheet(r.value.text);
  assert.equal(parsed.jurisdiction, "CA");
  assert.equal(parsed.cases.length, 1);
  assert.deepEqual(parsed.unmappedLines, [], "the grammar gate guarantees the parser maps every served line");
  assert.equal(parsed.cases[0].caseNumber, "2015-CF-00421");
  assert.equal(parsed.cases[0].disposition, "conviction");
  assert.equal(parsed.cases[0].offenseDate, "2015-04-02");
  assert.equal(parsed.cases[0].finePaid, true);
  assert.equal(parsed.cases[0].pendingCase, false);
  // omitted-line path: a case missing its dates parses but leaves the gap for insufficient_data
  const partial = validateNormalizedRapText({ text: "JURISDICTION: DC\nCASE C9\nOFFENSE: Shoplifting\nDISPOSITION: dismissed" });
  assert.ok(partial && partial.ok, "partial-but-grammar-valid text passes");
  const parsedPartial = parseRapSheet(partial.value.text);
  assert.equal(parsedPartial.cases[0].dispositionDate, undefined, "omitted date stays absent — insufficient_data downstream, never inferred");
});

test("prompt contract: verbatim offense text; ambiguous dates omitted; insufficient_data is the correct output", () => {
  assert.match(schema.system, /never reclassify/i);
  assert.match(schema.system, /OMITTED, never guessed|omitted, never guessed/);
  assert.match(schema.system, /insufficient_data/);
  assert.match(schema.system, /YYYY-MM-DD/);
  assert.match(schema.system, /"text"/);
});
