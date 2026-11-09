// fact-chronology.test.ts — /api/extract schema test (Wave W2, class LA).
// CHARACTERIZATION, not new-code TDD: the fact-chronology ExtractSchema shipped
// registered in ../validate.ts as F3's exemplar, so this file pins that registered
// entry against the spec's prompt contract (open-artifacts/fact-chronology/spec.md
// §"Prompt schema for the LLM part") rather than defining a duplicate schema in
// schemas/ (registration stays single-sourced). The known delta vs spec.md is pinned
// explicitly below so a coordinator tightening pass must consciously update it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EXTRACT_SCHEMAS } from "../validate.ts";

const S = EXTRACT_SCHEMAS["fact-chronology"];

const FACTS = [
  {
    id: "F1",
    date: "2025-01-09",
    dateLabel: "on or about January 9, 2025",
    topic: "termination",
    text: "Reyes told Delgado her employment ended that day.",
    source: { docId: "imported-docx", quote: "she was terminated, effective at the end of her shift", pinpoint: "¶ 7" },
  },
  {
    id: "F2",
    date: null,
    dateLabel: "Spring 2024",
    topic: "policy-update",
    text: "The cash-handling policy was updated.",
    source: { docId: "imported-docx", quote: "the cash-handling policy was updated", pinpoint: "" },
  },
];

test("the exemplar is registered under the artifact key the demo posts", () => {
  assert.ok(S, "EXTRACT_SCHEMAS['fact-chronology'] exists (registered by F3)");
  assert.deepEqual(S.fields, ["facts"]);
  assert.ok(S.maxTokens >= 500 && S.maxTokens <= 4000, "bounded completion budget");
  const user = S.user("On January 9, 2025, she was terminated.");
  assert.ok(user.includes("On January 9, 2025, she was terminated."), "user message carries the document text");
});

/* ---------- validateData: accepts realistic extractions ---------- */

test("validateData accepts a realistic extraction (dated fact + ambiguous date as dateLabel with date:null)", () => {
  const r = S.validateData({ facts: FACTS });
  assert.ok(r && r.ok, "valid shape accepted");
  assert.deepEqual(r.value, { facts: FACTS });
});

test("validateData accepts month- and year-precision ISO dates", () => {
  for (const date of ["2025-01", "2025"]) {
    const r = S.validateData({ facts: [{ ...FACTS[0], date }] });
    assert.ok(r && r.ok, `loose ISO date ${date} accepted (core parses precision)`);
  }
});

test("validateData accepts an empty facts array (no dated events is a valid answer)", () => {
  const r = S.validateData({ facts: [] });
  assert.ok(r && r.ok);
});

/* ---------- validateData: rejects garbage (null = unusable → route replies INVALID) ---------- */

test("validateData rejects non-objects and missing/mistyped facts", () => {
  for (const bad of [null, undefined, "x", 42, [], {}, { facts: null }, { facts: "F1" }, { facts: {} }]) {
    assert.equal(S.validateData(bad), null, `unusable: ${JSON.stringify(bad)}`);
  }
});

test("validateData rejects wrong fact shapes (missing key, extra key, bad source)", () => {
  const base = FACTS[0] as unknown as Record<string, unknown>;
  const drop = (k: string) => { const f = { ...base }; delete f[k]; return { facts: [f] }; };
  for (const k of ["id", "date", "dateLabel", "topic", "text", "source"]) {
    assert.equal(S.validateData(drop(k)), null, `missing key ${k} refused (exact shape)`);
  }
  assert.equal(S.validateData({ facts: [{ ...base, extra: 1 }] }), null, "unknown key refused");
  assert.equal(S.validateData({ facts: [{ ...base, source: { docId: "x" } }] }), null, "source must be {docId,quote,pinpoint}");
  assert.equal(S.validateData({ facts: [null] }), null, "null fact refused");
  assert.equal(S.validateData({ facts: [{ ...base, topic: "" }] }), null, "topic is the conflict-grouping key — empty refused");
});

test("validateData rejects resolved-from-prose dates — ambiguity must stay in dateLabel (never guessed)", () => {
  for (const bad of ["January 9, 2025", "09/01/2025", "2025-13-09", "Spring 2024", 20250109]) {
    assert.equal(S.validateData({ facts: [{ ...FACTS[0], date: bad }] }), null, `ambiguous/malformed date refused: ${String(bad)}`);
  }
});

test("validateData caps facts at 200 (route memory guard)", () => {
  const many = { facts: Array.from({ length: 201 }, (_, i) => ({ ...FACTS[1], id: "F" + i })) };
  assert.equal(S.validateData(many), null);
  const cap = { facts: Array.from({ length: 200 }, (_, i) => ({ ...FACTS[1], id: "F" + i })) };
  assert.ok(S.validateData(cap)?.ok, "exactly 200 passes");
});

/* ---------- prompt contract (spec.md rules, near-verbatim) ---------- */

test("prompt contract: the spec's hard rules are present in the system prompt", () => {
  assert.match(S.system, /never resolve an ambiguous date yourself/, "ambiguity goes to dateLabel, date stays null — never resolved by the model");
  assert.match(S.system, /verbatim span copied from the document text/, "quotes must be verbatim (the core machine-checks them)");
  assert.match(S.system, /Never invent dates, quotes, or events/, "no fabrication");
  assert.match(S.system, /dateLabel/, "dateLabel is the ambiguity channel");
  assert.match(S.system, /imported-docx/, "docId pinned to the import so quotes anchor to the added document");
  assert.match(S.system, /ONLY a JSON object/, "JSON-only reply demanded");
  assert.match(S.system, /confidence\.facts/, "per-field confidence is requested");
});

test("prompt contract: KNOWN DELTA vs spec.md — unsourced facts are dropped, not surfaced as kind:'unverified'", () => {
  // spec.md: "anything the model knows but cannot source goes to source.kind:'unverified' so it
  // renders [verify] — fabrication risk is surfaced, never stripped." The registered exemplar
  // instead refuses to emit unquotable facts ("do not emit that fact") and its validator has no
  // `kind` key. This pins the delta so a coordinator tightening pass must consciously update it.
  assert.match(S.system, /do not emit that fact/, "current posture: unquotable facts are dropped");
  assert.ok(!/unverified/.test(S.system), "current posture: source.kind 'unverified' is NOT offered");
});
