/**
 * POST /api/extract — structured extraction for DOCX imports on class-L demos
 * (plan F3). Body { schema, text } picks a registered prompt contract +
 * validator (EXTRACT_SCHEMAS in validate.ts; prompt contracts come from each
 * artifact's spec.md); the free std/openai gpt-5-nano recipe does the rest.
 * Fail-closed, machine-readable codes — demos branch on `error`, surface
 * `message` in the banner, and fall back to the imported text:
 *   200 { ok: true, data, confidence: {field: "high"|"low"|"missing"}, source: "gpt-5-nano" }
 *   400 { ok: false, error: "INVALID", message }      bad body / unknown schema / unusable shape
 *   429 { ok: false, error: "RATE_LIMITED", message } shared 10 req/min/IP budget
 *   502 { ok: false, error: "UNAVAILABLE", message }  model down / unusable output
 * The model call, limiter, and clock are injectable (deps) so tests stay
 * deterministic and offline. openai.ts is imported TYPE-ONLY here and loaded
 * lazily at first real call: its top-level `new OpenAI()` throws outside Val
 * Town without an OPENAI_API_KEY, and this module (unlike the ask-legal
 * family) must stay importable by the credential-free test suite.
 */
import type { AskJsonOptions } from "./openai.ts";
import { EXTRACT_SCHEMAS, validateExtractBody, validateExtractReply, valueOf, type ExtractReply } from "./validate.ts";
import { apiLimiter, clientIp, jsonResponse } from "./http.ts";
import type { RateLimiter } from "./ratelimit.ts";

export interface ExtractDeps {
  /** model call — defaults to the shared askJson recipe (lazy-loaded) */
  ask?: (opts: AskJsonOptions<ExtractReply>) => Promise<ExtractReply | null>;
  /** rate limiter — defaults to the shared /api/* budget */
  limiter?: RateLimiter;
  /** clock — defaults to Date.now */
  now?: () => number;
}

/** Pinned source value; openai.ts's MODEL stays authoritative whenever the
 *  real module is loaded (first live call). */
const DEFAULT_SOURCE = "gpt-5-nano";

type RealModule = { askJson: <T>(opts: AskJsonOptions<T>) => Promise<T | null>; MODEL: string };
let realModule: RealModule | undefined; // undefined = not loaded yet (a failed load is retried, never cached)

async function defaultAsk(opts: AskJsonOptions<ExtractReply>): Promise<ExtractReply | null> {
  if (!realModule) realModule = await (import("./openai.ts") as Promise<RealModule>);
  return realModule.askJson(opts);
}

/** readJsonBody's 32 KB cap is too small for document text; this route parses
 *  its own body with a document-sized cap (EXTRACT_TEXT_MAX + JSON overhead). */
const MAX_BODY_CHARS = 300_000;

type BodyResult = { ok: true; body: Record<string, unknown> } | { ok: false; message: string };

async function readExtractBody(req: Request): Promise<BodyResult> {
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return { ok: false, message: "Body must be a JSON object." };
  }
  if (raw.length > MAX_BODY_CHARS) {
    return { ok: false, message: "Request body too large — send at most 100,000 characters of text." };
  }
  try {
    const v = JSON.parse(raw);
    if (typeof v !== "object" || v === null || Array.isArray(v)) return { ok: false, message: "Body must be a JSON object." };
    return { ok: true, body: v as Record<string, unknown> };
  } catch {
    return { ok: false, message: "Body must be a JSON object." };
  }
}

/** Per-field confidence, derived fail-closed: a field is "high" only when the
 *  model explicitly said so; present-but-unreported → "low"; absent from the
 *  data → "missing". Never guesses upward. */
export function normalizeConfidence(
  fields: string[],
  data: unknown,
  model: Record<string, string> | undefined,
): Record<string, "high" | "low" | "missing"> {
  const out: Record<string, "high" | "low" | "missing"> = {};
  const d = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  for (const f of fields) {
    out[f] = f in d ? (model && model[f] === "high" ? "high" : "low") : "missing";
  }
  return out;
}

export async function handleExtract(req: Request, deps: ExtractDeps = {}): Promise<Response> {
  const limiter = deps.limiter ?? apiLimiter;
  const now = deps.now ?? Date.now;
  const ask = deps.ask ?? defaultAsk;
  const fail = (status: number, error: "INVALID" | "RATE_LIMITED" | "UNAVAILABLE", message: string) =>
    jsonResponse({ ok: false, error, message }, status);

  if (!limiter.allow(clientIp(req), now())) {
    return fail(429, "RATE_LIMITED", "Too many requests — the live-AI budget is 10 requests per minute. Import the text directly instead.");
  }
  const parsedBody = await readExtractBody(req);
  if (!parsedBody.ok) return fail(400, "INVALID", parsedBody.message);
  const parsed = validateExtractBody(parsedBody.body);
  if (!parsed.ok) return fail(400, "INVALID", parsed.error);
  const entry = EXTRACT_SCHEMAS[parsed.value.schema];
  if (!entry) {
    return fail(400, "INVALID", `Unknown schema "${parsed.value.schema}" — registered: ${Object.keys(EXTRACT_SCHEMAS).join(", ")}.`);
  }

  let ai: ExtractReply | null;
  try {
    ai = await ask({
      system: entry.system,
      user: entry.user(parsed.value.text),
      maxTokens: entry.maxTokens,
      validate: (v) => valueOf(validateExtractReply(v)),
    });
  } catch {
    return fail(502, "UNAVAILABLE", "Live AI is unavailable or returned an unusable extraction — nothing was served. Import the text directly instead.");
  }
  if (ai === null) {
    return fail(502, "UNAVAILABLE", "Live AI is unavailable or returned an unusable extraction — nothing was served. Import the text directly instead.");
  }
  const data = valueOf(entry.validateData(ai.data));
  if (data === null) {
    return fail(400, "INVALID", "The extracted structure did not match the artifact's schema — nothing was served. Import the text directly instead.");
  }
  return jsonResponse({
    ok: true,
    data,
    confidence: normalizeConfidence(entry.fields, data, ai.confidence),
    source: realModule ? realModule.MODEL : DEFAULT_SOURCE,
  });
}
