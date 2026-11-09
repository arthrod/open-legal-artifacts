// intake-benchmark.test.ts — /api/extract schema test (Wave W4 finish, class LA).
// Pins the intake-benchmark prompt contract (spec.md §"LLM prompt schema (optional
// capture step)") and its data validator: a recorded intake session → flows JSON.
// Hard rules under test: "Extract ONLY what is observable; never invent fields,
// latencies, or fallbacks." · "If a value is not observable, omit the key — do
// not guess a number." Unmeasured latency/fallback are OMITTED keys; fields are
// snake_case; a paper step is kind "human". The downstream audit is the frozen
// core's validateCapture — this validator is the route's first, stricter gate.
// Deno test style matching vt-val/api/schemas/*.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { schema } from "./intake-benchmark.ts";

// Realistic observable-only capture of a paper front-desk session: s1 has a
// measured latency; s2 states a fallback; s3 has neither (omitted keys).
const CAPTURE_FLOWS = [
  {
    id: "front-desk-paper",
    name: "Front-desk paper intake",
    kind: "human",
    steps: [
      { id: "s1", purpose: "collect caller identity", fields: ["full_name", "phone_number"], latency_seconds: 95 },
      { id: "s2", purpose: "record problem summary", fields: ["problem_description"], fallback: "If the caller hangs up, the sheet goes to the callback pile." },
      { id: "s3", purpose: "conflicts check against past clients", fields: ["conflict_check"] },
    ],
  },
  {
    id: "guided-web-form",
    name: "Guided web form",
    kind: "software",
    steps: [
      { id: "w1", purpose: "identity and contact fields", fields: ["full_name", "contact_email"], latency_seconds: 210 },
    ],
  },
];

/* ---------- schema shape ---------- */

test("schema shape: fields, maxTokens, system, user builder", () => {
  assert.deepEqual(schema.fields, ["flows"]);
  assert.ok(schema.maxTokens >= 800 && schema.maxTokens <= 4000, "bounded completion budget (sessions have many steps)");
  assert.ok(schema.system.length > 200, "system prompt is the spec's contract, not a stub");
  const user = schema.user("Step 1: receptionist asks the caller's full name.");
  assert.ok(user.includes("Step 1: receptionist asks the caller's full name."), "user message carries the document text");
  assert.match(user, /docx/i, "user message frames the text as an imported document");
});

/* ---------- validateData: accepts realistic captures ---------- */

test("validateData accepts an observable-only capture (omitted latency/fallback keys, human kind)", () => {
  const r = schema.validateData({ flows: CAPTURE_FLOWS });
  assert.ok(r && r.ok, "valid capture accepted");
  assert.deepEqual((r as { value: { flows: unknown[] } }).value.flows, CAPTURE_FLOWS);
});

test("validateData accepts empty field asks and hybrid flows (a step may ask nothing)", () => {
  const flows = [{ id: "f", name: "Mixed", kind: "hybrid", steps: [{ id: "s", purpose: "orientation", fields: [] }] }];
  const r = schema.validateData({ flows });
  assert.ok(r && r.ok);
});

/* ---------- validateData: rejects garbage (null = unusable → route replies INVALID) ---------- */

test("validateData rejects non-objects and missing/mistyped flows", () => {
  for (const bad of [null, undefined, "x", 42, [], {}, { flows: null }, { flows: "f" }, { flows: {} }, { flows: [] }]) {
    assert.equal(schema.validateData(bad), null, `unusable: ${JSON.stringify(bad)}`);
  }
});

test("validateData rejects wrong shapes (missing/extra keys, non-snake_case fields, bad kind)", () => {
  const base = CAPTURE_FLOWS[0];
  const drop = (k: string) => { const f = { ...base } as Record<string, unknown>; delete f[k]; return { flows: [f] }; };
  for (const k of ["id", "name", "kind", "steps"]) {
    assert.equal(schema.validateData(drop(k)), null, `missing flow key ${k} refused (exact shape)`);
  }
  assert.equal(schema.validateData({ flows: [{ ...base, extra: 1 }] }), null, "unknown flow key refused");
  assert.equal(schema.validateData({ flows: [{ ...base, kind: "magical" }] }), null, "kind must be software|human|hybrid|unspecified");
  const stepDrop = (k: string) => { const s = { ...base.steps[0] } as Record<string, unknown>; delete s[k]; return { flows: [{ ...base, steps: [s] }] }; };
  for (const k of ["id", "purpose", "fields"]) {
    assert.equal(schema.validateData(stepDrop(k)), null, `missing step key ${k} refused`);
  }
  assert.equal(schema.validateData({ flows: [{ ...base, steps: [{ ...base.steps[0], extra: true }] }] }), null, "unknown step key refused");
  assert.equal(schema.validateData({ flows: [{ ...base, steps: [] }] }), null, "a flow with no steps is unusable (validateCapture rejects it too)");
  for (const bad of [["Date of Birth"], ["date-of-birth"], ["fullName"], [""], [42]]) {
    assert.equal(schema.validateData({ flows: [{ ...base, steps: [{ ...base.steps[0], fields: bad }] }] }), null,
      `fields must be snake_case strings: ${JSON.stringify(bad)}`);
  }
});

test("validateData rejects invented latency forms — never-guess guard", () => {
  const base = CAPTURE_FLOWS[0];
  const withLat = (v: unknown) => ({ flows: [{ ...base, steps: [{ ...base.steps[0], latency_seconds: v }] }] });
  for (const bad of [null, "about 2 minutes", -5, 0, 604801, Number.NaN, true]) {
    assert.equal(schema.validateData(withLat(bad)), null, `unusable latency: ${String(bad)} (omit the key when not measurable — null is not "omitted")`);
  }
  assert.ok(schema.validateData(withLat(604800))?.ok, "exactly 7 days passes (validateCapture's own ceiling)");
  assert.ok(schema.validateData(withLat(1))?.ok, "a small positive latency passes");
});

test("validateData rejects malformed fallbacks", () => {
  const base = CAPTURE_FLOWS[0];
  for (const bad of [42, "", "   "]) {
    assert.equal(schema.validateData({ flows: [{ ...base, steps: [{ ...base.steps[0], fallback: bad }] }] }), null, `unusable fallback: ${JSON.stringify(bad)}`);
  }
  assert.ok(schema.validateData({ flows: [{ ...base, steps: [{ ...base.steps[0], fallback: null }] }] })?.ok, "an explicit null fallback (stated as none) is the spec's own shape");
});

test("validateData caps volume (route memory guard, mirroring the exemplar schemas)", () => {
  const one = { flows: [CAPTURE_FLOWS[0]] };
  const many = { flows: Array.from({ length: 51 }, () => CAPTURE_FLOWS[0]) };
  assert.equal(schema.validateData(many), null, "at most 50 flows");
  assert.ok(schema.validateData(one)?.ok);
});

/* ---------- prompt contract (spec.md rules, near-verbatim) ---------- */

test("prompt contract: the spec's hard rules are present in the system prompt", () => {
  assert.match(schema.system, /Extract ONLY what is observable; never invent fields, latencies, or fallbacks/, "spec rule verbatim");
  assert.match(schema.system, /If a value is not observable, omit the key — do not guess a number/, "spec rule verbatim");
  assert.match(schema.system, /A step a human performs on paper is kind "human"/, "spec rule verbatim");
  assert.match(schema.system, /converting a recorded intake session into structured JSON/, "spec task verbatim");
  assert.match(schema.system, /snake_case/, "field-name casing rule");
});

test("prompt contract: reply envelope + observable-only phrasing is machine-checkable", () => {
  assert.match(schema.system, /"flows"/, "the reply names the flows field");
  assert.match(schema.system, /latency_seconds/, "the optional latency key is named");
  assert.match(schema.system, /confidence/, "per-field confidence is requested");
  assert.match(schema.system, /ONLY a JSON object/, "JSON-only reply demanded");
  assert.ok(!/abandonment_rate/.test(schema.system), "abandonment is MEASURED telemetry, not extractable from a recording — the model is never asked for it");
});
