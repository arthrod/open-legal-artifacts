import { test } from "node:test";
import assert from "node:assert/strict";
import { handleExtract, normalizeConfidence, type ExtractDeps } from "./extract.ts";
import {
  EXTRACT_SCHEMAS,
  EXTRACT_TEXT_MAX,
  validateExtractBody,
  validateExtractReply,
  validateExtractFactChronology,
  validateExtractObligations,
  type ExtractReply,
} from "./validate.ts";
import { createRateLimiter } from "./ratelimit.ts";
import type { AskJsonOptions } from "./openai.ts";
import { readFile } from "node:fs/promises";

// POST /api/extract — DOCX-import structured extraction for class-L demos.
// The model call, limiter, and clock are injected (deps), so every path is
// tested deterministically offline; the mounted-router tests at the bottom
// never reach the model (invalid bodies only). Pinned response contract:
//   200 { ok: true, data, confidence: {field: high|low|missing}, source }
//   400 { ok: false, error: "INVALID" }   429 RATE_LIMITED   502 UNAVAILABLE

const IP = { "x-forwarded-for": "203.0.113.9" };
const DOC_TEXT = "On or about January 9, 2025, the complainant was terminated. On March 3, 2025, she filed a charge.";
const CONTRACT_TEXT = "§ 4.1 Customer shall pay the milestone fee of $48,000 within thirty days of acceptance.";

function extractReq(body: unknown): Request {
  return new Request("https://val.test/api/extract", {
    method: "POST",
    headers: { "content-type": "application/json", ...IP },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function fakeAsk(reply: ExtractReply | null | (() => ExtractReply | null)) {
  const calls: AskJsonOptions<ExtractReply>[] = [];
  const fn = async (opts: AskJsonOptions<ExtractReply>): Promise<ExtractReply | null> => {
    calls.push(opts);
    return typeof reply === "function" ? reply() : reply;
  };
  return { calls, fn };
}

const passLimiter = () => createRateLimiter({ windowMs: 60_000, max: 100 });
const deps = (ask: ExtractDeps["ask"]): ExtractDeps => ({ ask, limiter: passLimiter(), now: () => 1_000 });

const FACT = {
  id: "F1",
  date: "2025-01-09",
  dateLabel: "on or about January 9, 2025",
  topic: "termination",
  text: "The complainant was terminated.",
  source: { docId: "imported-docx", quote: "the complainant was terminated", pinpoint: "¶ 14" },
};
const factReply = (confidence: Record<string, "high" | "low">): ExtractReply => ({ data: { facts: [FACT] }, confidence });

const OBLIGATION = {
  id: "OBL-4-1",
  clause: "§ 4.1",
  party: "Customer",
  owner: "Finance (Customer)",
  verb: "pay",
  text: "pay the milestone fee of $48,000",
  dueDate: "2026-10-30",
  condition: null,
  recurrence: null,
  amount: 48000,
  sourceQuote: "Customer shall pay the milestone fee of $48,000 within thirty days of acceptance.",
};

/* ---------- route behavior (injected model) ---------- */

test("valid fact-chronology extraction → 200 { ok, data, confidence, source }", async () => {
  const ask = fakeAsk(factReply({ facts: "high" }));
  const res = await handleExtract(extractReq({ schema: "fact-chronology", text: DOC_TEXT }), deps(ask.fn));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.deepEqual(body.data.facts, [FACT]);
  assert.deepEqual(body.confidence, { facts: "high" });
  assert.equal(body.source, "gpt-5-nano");
  assert.equal(ask.calls.length, 1, "model called exactly once");
  assert.match(ask.calls[0].system, /chronology/i);
  assert.match(ask.calls[0].system, /never resolve an ambiguous date/i, "spec.md rule: ambiguity goes to dateLabel, date stays null");
  assert.ok(ask.calls[0].user.includes(DOC_TEXT), "user message carries the document text");
  assert.equal(ask.calls[0].maxTokens, EXTRACT_SCHEMAS["fact-chronology"].maxTokens);
});

test("confidence propagates fail-closed: low stays low, unreported becomes low", async () => {
  const low = await handleExtract(extractReq({ schema: "fact-chronology", text: DOC_TEXT }), deps(fakeAsk(factReply({ facts: "low" })).fn));
  assert.equal((await low.json()).confidence.facts, "low");
  const unreported = await handleExtract(extractReq({ schema: "fact-chronology", text: DOC_TEXT }), deps(fakeAsk(factReply({})).fn));
  assert.equal((await unreported.json()).confidence.facts, "low", "unreported confidence is never assumed high");
});

test("model unusable (askJson null) → 502 { ok:false, error:'UNAVAILABLE' }", async () => {
  const res = await handleExtract(extractReq({ schema: "fact-chronology", text: DOC_TEXT }), deps(fakeAsk(null).fn));
  assert.equal(res.status, 502);
  const body = await res.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "UNAVAILABLE");
  assert.ok(typeof body.message === "string" && body.message.length > 10, "human-readable fail-closed banner text");
});

test("schema-invalid model data → 400 INVALID (fail-closed, nothing served)", async () => {
  const guessed = { ...FACT, date: "Spring 2024" }; // never-guess rule violated by the model
  const res = await handleExtract(extractReq({ schema: "fact-chronology", text: DOC_TEXT }), deps(fakeAsk({ data: { facts: [guessed] }, confidence: {} }).fn));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "INVALID");
});

test("over budget → 429 { ok:false, error:'RATE_LIMITED' }", async () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
  const d: ExtractDeps = { ask: fakeAsk(factReply({ facts: "high" })).fn, limiter, now: () => 1_000 };
  const first = await handleExtract(extractReq({ schema: "fact-chronology", text: DOC_TEXT }), d);
  assert.equal(first.status, 200);
  const second = await handleExtract(extractReq({ schema: "fact-chronology", text: DOC_TEXT }), d);
  assert.equal(second.status, 429);
  const body = await second.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "RATE_LIMITED");
});

test("bad bodies → 400 INVALID (strict validation, ask-legal pattern)", async () => {
  const d = deps(fakeAsk(null).fn);
  const cases: Array<[unknown, string]> = [
    ["not json", "non-JSON body"],
    [{}, "missing keys"],
    [{ schema: "fact-chronology" }, "missing text"],
    [{ text: DOC_TEXT }, "missing schema"],
    [{ schema: "fact-chronology", text: "hi" }, "text below 4 chars"],
    [{ schema: "nope", text: DOC_TEXT }, "unknown schema key"],
    [{ schema: "Drop Table", text: DOC_TEXT }, "schema must be a slug"],
    [{ schema: "fact-chronology", text: "x".repeat(EXTRACT_TEXT_MAX + 1) }, "text over cap"],
    [{ schema: "fact-chronology", text: DOC_TEXT, extra: 1 }, "unknown keys refused"],
  ];
  for (const [body, why] of cases) {
    const res = await handleExtract(extractReq(body), d);
    assert.equal(res.status, 400, why);
    const b = await res.json();
    assert.equal(b.ok, false, why);
    assert.equal(b.error, "INVALID", why);
    assert.ok(typeof b.message === "string" && b.message.length > 0, why);
  }
});

test("obligations-checker exemplar round-trip with its spec.md prompt contract", async () => {
  const ask = fakeAsk({ data: { obligations: [OBLIGATION] }, confidence: { obligations: "high" } });
  const res = await handleExtract(extractReq({ schema: "obligations-checker", text: CONTRACT_TEXT }), deps(ask.fn));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.data.obligations, [OBLIGATION]);
  assert.deepEqual(body.confidence, { obligations: "high" });
  assert.match(ask.calls[0].system, /STABLE across re-extractions/, "spec.md: clause-derived ids so registers can be diffed");
  assert.match(ask.calls[0].system, /Never compute a date yourself/);
});

/* ---------- mounted route (index.http.tsx) ---------- */

test("index.http.tsx mounts /api/extract (import + API_ROUTES entry)", async () => {
  const src = await readFile(new URL("../index.http.tsx", import.meta.url));
  assert.ok(src.includes('import { handleExtract } from "./api/extract.ts"'), "route handler imported");
  assert.ok(src.includes('"/api/extract": handleExtract'), "registered in API_ROUTES");
});

test("mounted /api/extract: OPTIONS 204, strict-400 bad POST, GET 405", async (t) => {
  let router: typeof import("../index.http.tsx");
  try {
    router = await import("../index.http.tsx");
  } catch {
    return t.skip("router module needs OPENAI_API_KEY locally (openai.ts constructs OpenAI() at import); runs on Val Town / with a stub key");
  }
  const handler = router.default;
  const opt = await handler(new Request("https://val.test/api/extract", { method: "OPTIONS", headers: IP }));
  assert.equal(opt.status, 204);
  const bad = await handler(extractReq("not json"));
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error, "INVALID");
  const get = await handler(new Request("https://val.test/api/extract", { method: "GET", headers: IP }));
  assert.equal(get.status, 405);
});

/* ---------- validators (validate.ts) ---------- */

test("validateExtractBody: exact shape, slug schema, text 4..EXTRACT_TEXT_MAX", () => {
  assert.equal(EXTRACT_TEXT_MAX, 100_000, "document-sized cap (readJsonBody's 32KB is too small for DOCX text)");
  const ok = validateExtractBody({ schema: "fact-chronology", text: DOC_TEXT });
  assert.ok(ok.ok);
  assert.equal(ok.value.schema, "fact-chronology");
  assert.equal(ok.value.text, DOC_TEXT);
  const bads: unknown[] = [
    null, [], "x", {},
    { schema: "x" }, { text: "t" },
    { schema: "x", text: 42 },
    { schema: "X Y", text: DOC_TEXT },
    { schema: "x", text: "hi" },
    { schema: "x", text: "x".repeat(EXTRACT_TEXT_MAX + 1) },
    { schema: "x", text: DOC_TEXT, z: 1 },
  ];
  for (const b of bads) assert.ok(!validateExtractBody(b).ok, JSON.stringify(b).slice(0, 48));
});

test("validateExtractReply: { data, confidence } exact shape; confidence values only high|low", () => {
  const good = validateExtractReply({ data: { facts: [] }, confidence: { facts: "high" } });
  assert.ok(good !== null && good.ok);
  assert.equal(validateExtractReply({ data: { facts: [] } }), null, "missing confidence");
  assert.equal(validateExtractReply({ data: { facts: [] }, confidence: {}, extra: 1 }), null, "unknown keys refused");
  assert.equal(validateExtractReply({ data: [], confidence: {} }), null, "data must be a plain object");
  assert.equal(validateExtractReply({ data: {}, confidence: { f: "medium" } }), null, "confidence enum is high|low");
  assert.equal(validateExtractReply("nope"), null);
  assert.equal(validateExtractReply(null), null);
});

test("fact-chronology data validator: spec.md shape, ISO-or-null dates, exact source keys", () => {
  const good = validateExtractFactChronology({ facts: [FACT] });
  assert.ok(good !== null && good.ok);
  assert.deepEqual(good.value.facts, [FACT]);
  const empty = validateExtractFactChronology({ facts: [] });
  assert.ok(empty !== null && empty.ok, "zero facts is a valid (if low-confidence) answer");
  const bads: unknown[] = [
    "nope",
    { facts: "no" },
    { facts: [{ ...FACT, date: "Spring 2024" }] }, // ambiguous date must be null, never guessed
    { facts: [{ ...FACT, date: "2025-13-01" }] }, // month out of range
    { facts: [{ ...FACT, date: "09.01.2025" }] }, // non-ISO
    { facts: [{ ...FACT, id: "" }] },
    { facts: [{ ...FACT, topic: "" }] },
    { facts: [{ ...FACT, text: "" }] },
    { facts: [{ ...FACT, source: { docId: "x" } }] }, // source exact keys
    { facts: [{ ...FACT, extra: 1 }] }, // unknown fact key
    { facts: [FACT], junk: 1 }, // unknown top-level key
    { facts: Array.from({ length: 201 }, () => FACT) }, // runaway output cap
  ];
  for (const b of bads) assert.equal(validateExtractFactChronology(b), null, JSON.stringify(b).slice(0, 48));
});

test("obligations data validator: spec.md shape, verb enum, recurrence, amount", () => {
  const good = validateExtractObligations({ obligations: [OBLIGATION] });
  assert.ok(good !== null && good.ok);
  assert.deepEqual(good.value.obligations, [OBLIGATION]);
  const noOwner = { ...OBLIGATION, owner: null };
  assert.ok(validateExtractObligations({ obligations: [noOwner] }) !== null, "owner null is valid");
  const conditional = { ...OBLIGATION, id: "OBL-9-1", dueDate: null, condition: "within 30 days of Acceptance" };
  assert.ok(validateExtractObligations({ obligations: [conditional] }) !== null, "event-triggered: dueDate null + condition");
  const recurring = { ...OBLIGATION, id: "OBL-7-2", dueDate: null, recurrence: { cadence: "quarterly", anchor: "2026-03-31" } };
  assert.ok(validateExtractObligations({ obligations: [recurring] }) !== null, "recurring duty with cadence + anchor");
  const bads: unknown[] = [
    "nope",
    { obligations: "no" },
    { obligations: [{ ...OBLIGATION, verb: "escalate" }] }, // outside the spec enum
    { obligations: [{ ...OBLIGATION, amount: "48k" }] }, // amount must be a number
    { obligations: [{ ...OBLIGATION, amount: -1 }] },
    { obligations: [{ ...OBLIGATION, recurrence: { cadence: "yearly", anchor: "2026-03-31" } }] }, // cadence enum
    { obligations: [{ ...OBLIGATION, recurrence: { cadence: "quarterly" } }] }, // anchor required
    { obligations: [{ ...OBLIGATION, dueDate: "end of month" }] }, // never compute dates
    { obligations: [{ ...OBLIGATION, sourceQuote: "" }] }, // audit trail required
    { obligations: [{ ...OBLIGATION, party: "" }] },
    { obligations: [OBLIGATION], extra: 1 },
    { obligations: Array.from({ length: 201 }, () => OBLIGATION) },
  ];
  for (const b of bads) assert.equal(validateExtractObligations(b), null, JSON.stringify(b).slice(0, 48));
});

test("normalizeConfidence: high only when the model says high; absent data field → missing", () => {
  assert.deepEqual(normalizeConfidence(["a", "b"], { a: 1, b: 2 }, { a: "high", b: "low" }), { a: "high", b: "low" });
  assert.deepEqual(normalizeConfidence(["a", "b"], { a: 1 }, { a: "high" }), { a: "high", b: "missing" });
  assert.deepEqual(normalizeConfidence(["a"], { a: [] }, {}), { a: "low" }, "unreported → low, never assumed high");
  assert.deepEqual(normalizeConfidence(["a"], {}, { a: "high" }), { a: "missing" }, "model claiming high for an absent field is still missing");
});

test("EXTRACT_SCHEMAS ships exactly the two F3 exemplars with usable prompt contracts", () => {
  assert.deepEqual(Object.keys(EXTRACT_SCHEMAS).sort(), ["fact-chronology", "obligations-checker"]);
  for (const [key, s] of Object.entries(EXTRACT_SCHEMAS)) {
    assert.ok(Array.isArray(s.fields) && s.fields.length > 0, key + ": fields");
    assert.equal(typeof s.system, "string", key + ": system");
    assert.ok(s.system.length > 100, key + ": prompt contract is substantive");
    assert.equal(typeof s.user("x"), "string", key + ": user builder");
    assert.ok(s.maxTokens >= 300 && s.maxTokens <= 4000, key + ": maxTokens");
    assert.equal(typeof s.validateData, "function", key + ": validator");
  }
});
