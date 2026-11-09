// matter-board.test.ts — /api/extract schema test (Wave W2, class LA).
// Pins the matter-board prompt contract (spec.md "LLM prompt schema (extraction
// step, optional)") and its data validator: engagement letters / email threads →
// snapshot matters. Hard rules under test: never invent deadlines (nextDeadline is
// strict YYYY-MM-DD or null), owner unknown → null never guessed, verbatim matter
// names (name is required and non-empty), capturedAt is caller-supplied (it is not
// part of the model's output at all). Deno test style matching vt-val/api/*.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { schema, type ExtractedMatter } from "./matter-board.ts";

const ENGAGEMENT_LETTER_MATTERS = [
  {
    id: "M-101",
    name: "Halberd v. Perigee (fictional)",
    client: "Halberd Logistics",
    owner: "j.moreau",
    stage: "discovery",
    nextStep: "Respond to RFP set two",
    nextDeadline: "2026-11-20",
    updatedAt: "2026-10-28T14:00:00Z",
  },
  {
    id: "northwind-vendor-suite",
    name: "Northwind vendor suite",
    client: null,
    owner: null,
    stage: null,
    nextStep: "Conflicts check",
    nextDeadline: null,
    updatedAt: null,
  },
];

/* ---------- schema shape ---------- */

test("schema shape: fields, maxTokens, system, user builder", () => {
  assert.deepEqual(schema.fields, ["matters"]);
  assert.ok(schema.maxTokens >= 500 && schema.maxTokens <= 4000, "bounded completion budget");
  assert.ok(schema.system.length > 200, "system prompt is the spec's contract, not a stub");
  const user = schema.user("Re: Northwind vendor suite — conflicts check next.");
  assert.ok(user.includes("Re: Northwind vendor suite — conflicts check next."), "user message carries the document text");
  assert.match(user, /docx/i, "user message frames the text as an imported document");
});

/* ---------- validateData: accepts realistic extractions ---------- */

test("validateData accepts a realistic engagement-letter extraction (incl. null owner / no stated deadline)", () => {
  const r = schema.validateData({ matters: ENGAGEMENT_LETTER_MATTERS });
  assert.ok(r && r.ok, "valid shape accepted");
  assert.deepEqual(r.value, { matters: ENGAGEMENT_LETTER_MATTERS } as { matters: ExtractedMatter[] });
});

test("validateData accepts updatedAt as a bare ISO date (letters often carry dates, not times)", () => {
  const r = schema.validateData({ matters: [{ ...ENGAGEMENT_LETTER_MATTERS[0], updatedAt: "2026-10-28" }] });
  assert.ok(r && r.ok);
});

test("validateData accepts an empty matters array (a document may state no matters — silence is correct)", () => {
  const r = schema.validateData({ matters: [] });
  assert.ok(r && r.ok);
  assert.deepEqual(r.value, { matters: [] });
});

/* ---------- validateData: rejects garbage (null = unusable → route replies INVALID) ---------- */

test("validateData rejects non-objects and missing/mistyped matters", () => {
  for (const bad of [null, undefined, "x", 42, [], {}, { matters: null }, { matters: "M-101" }, { matters: {} }]) {
    assert.equal(schema.validateData(bad), null, `unusable: ${JSON.stringify(bad)}`);
  }
});

test("validateData rejects wrong matter shapes (missing key, extra key, non-string values)", () => {
  const base = ENGAGEMENT_LETTER_MATTERS[0];
  const drop = (k: string) => { const m = { ...base } as Record<string, unknown>; delete m[k]; return { matters: [m] }; };
  for (const k of ["id", "name", "client", "owner", "stage", "nextStep", "nextDeadline", "updatedAt"]) {
    assert.equal(schema.validateData(drop(k)), null, `missing key ${k} refused (exact shape)`);
  }
  assert.equal(schema.validateData({ matters: [{ ...base, extra: 1 }] }), null, "unknown key refused");
  assert.equal(schema.validateData({ matters: [{ ...base, owner: 5 }] }), null, "owner must be string|null, never a guessed number");
  assert.equal(schema.validateData({ matters: [{ ...base, name: "" }] }), null, "verbatim matter names are required — empty name refused");
  assert.equal(schema.validateData({ matters: [{ ...base, id: "" }] }), null, "empty id refused");
  assert.equal(schema.validateData({ matters: [null] }), null, "null matter refused");
});

test("validateData rejects computed/guessed deadline forms — nextDeadline is strict YYYY-MM-DD or null", () => {
  const base = ENGAGEMENT_LETTER_MATTERS[0];
  for (const bad of ["Nov 20", "November 20, 2026", "2026/11/20", "2026-13-01", "2026-11-32", "2026-11", 20261120, true]) {
    assert.equal(schema.validateData({ matters: [{ ...base, nextDeadline: bad }] }), null, `never-compute-dates guard: ${String(bad)} refused`);
  }
});

test("validateData rejects malformed updatedAt stamps", () => {
  const base = ENGAGEMENT_LETTER_MATTERS[0];
  for (const bad of ["yesterday", "20-10-2026", "2026-10-28T99:00:00Z is wrong", 42]) {
    assert.equal(schema.validateData({ matters: [{ ...base, updatedAt: bad }] }), null, `unusable stamp: ${String(bad)}`);
  }
});

test("validateData caps matters at 200 (route memory guard, mirroring the exemplar schemas)", () => {
  const many = { matters: Array.from({ length: 201 }, (_, i) => ({ ...ENGAGEMENT_LETTER_MATTERS[1], id: "M-" + i })) };
  assert.equal(schema.validateData(many), null);
  const cap = { matters: Array.from({ length: 200 }, (_, i) => ({ ...ENGAGEMENT_LETTER_MATTERS[1], id: "M-" + i })) };
  assert.ok(schema.validateData(cap)?.ok, "exactly 200 passes");
});

/* ---------- prompt contract (spec.md rules, near-verbatim) ---------- */

test("prompt contract: the spec's hard rules are present in the system prompt", () => {
  assert.match(schema.system, /Never invent deadlines; omit when the source does not state one/, "spec rule verbatim");
  assert.match(schema.system, /Owner unknown → null, never guessed/, "spec rule verbatim");
  assert.match(schema.system, /Keep verbatim matter names/, "spec rule verbatim");
  assert.match(schema.system, /Extract matters from the provided email\/thread\/document into the snapshot schema/, "spec task verbatim");
  assert.match(schema.system, /stable id from the source system/i, "spec id rule");
  assert.match(schema.system, /kebab-case/i, "spec id fallback rule");
});

test("prompt contract: reply envelope + null-not-guess phrasing is machine-checkable", () => {
  assert.match(schema.system, /"matters"/, "the reply names the matters field");
  assert.match(schema.system, /null/g, "nulls are explicit");
  assert.match(schema.system, /confidence/, "per-field confidence is requested");
  assert.match(schema.system, /ONLY a JSON object/, "JSON-only reply demanded");
  assert.ok(!/capturedAt/.test(schema.system), "capturedAt is caller-supplied per spec — the model is never asked for it");
});
