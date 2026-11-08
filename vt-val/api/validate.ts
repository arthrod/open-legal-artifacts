/**
 * Strict input validation for the three AI POST routes.
 *
 * Two layers:
 *  - validate<Route>Body — the untrusted request body. Exact-shape only:
 *    expected keys, string types, length bounds, no unknown keys, no arrays,
 *    no null. Anything else is refused with a safe one-line error; raw
 *    internals never reach the client.
 *  - validateAi<Route> — the model's JSON output (the "validates" half of
 *    the JSON-mode helper). Unknown enum values, out-of-range numbers, and
 *    ids outside the offered grounding are refused so a hallucinated
 *    sourceId can never be served as an answer anchor.
 */

export type Valid<T> = { ok: true; value: T } | { ok: false; error: string };

/** Narrow a Valid<T> to its value (null on failure) — bridge for askJson's validators. */
export function valueOf<T>(r: Valid<T> | null): T | null {
  return r && r.ok ? r.value : null;
}

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function exactKeys(v: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(v).length === keys.length && keys.every((k) => k in v);
}

/** String field of length [min,max] after trim; null otherwise. */
function str(v: unknown, min: number, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length >= min && s.length <= max ? s : null;
}

/* ---------- request bodies ---------- */

/** POST /api/ask-legal — { question: 4..500 chars } */
export function validateAskLegalBody(v: unknown): Valid<{ question: string }> {
  if (!isPlainObject(v) || !exactKeys(v, ["question"])) return fail("body must be { question: string }");
  const question = str(v.question, 4, 500);
  if (!question) return fail("question must be 4–500 characters");
  return { ok: true, value: { question } };
}

/** POST /api/triage — { text: 4..2000 chars } */
export function validateTriageBody(v: unknown): Valid<{ text: string }> {
  if (!isPlainObject(v) || !exactKeys(v, ["text"])) return fail("body must be { text: string }");
  const text = str(v.text, 4, 2000);
  if (!text) return fail("text must be 4–2000 characters");
  return { ok: true, value: { text } };
}

/** POST /api/prop-support — { quote: 10..2000, proposition: 4..500 } */
export function validatePropSupportBody(v: unknown): Valid<{ quote: string; proposition: string }> {
  if (!isPlainObject(v) || !exactKeys(v, ["quote", "proposition"])) {
    return fail("body must be { quote: string, proposition: string }");
  }
  const quote = str(v.quote, 10, 2000);
  const proposition = str(v.proposition, 4, 500);
  if (!quote || !proposition) return fail("quote must be 10–2000 and proposition 4–500 characters");
  return { ok: true, value: { quote, proposition } };
}

/* ---------- AI output validators ---------- */

export interface AiAskLegal {
  applicable: boolean;
  sourceId: string;
  answer: string;
  level: "high" | "medium" | "low";
  reasons: string[];
}

/** Validated shape of the ask-legal model reply. `ids` = the ids actually offered as grounding. */
export function validateAiAskLegal(v: unknown, ids: string[]): Valid<AiAskLegal> | null {
  if (!isPlainObject(v)) return null;
  if (typeof v.applicable !== "boolean") return null;
  if (!Array.isArray(v.reasons) || v.reasons.length > 6 || !v.reasons.every((r: unknown) => typeof r === "string" && r.length <= 200 && r.trim().length > 0)) return null;
  if (v.applicable) {
    if (typeof v.sourceId !== "string" || !ids.includes(v.sourceId)) return null;
    const answer = str(v.answer, 1, 600);
    if (!answer) return null;
    if (v.level !== "high" && v.level !== "medium" && v.level !== "low") return null;
    return { ok: true, value: { applicable: true, sourceId: v.sourceId, answer, level: v.level, reasons: v.reasons as string[] } };
  }
  // escalation: no sourceId/answer required, level forced low by the caller
  return { ok: true, value: { applicable: false, sourceId: "", answer: "", level: "low", reasons: v.reasons as string[] } };
}

export interface AiTriage {
  issue: string; // may be "none" — the caller escalates on it
  confidence: number; // 0..1
  reason: string;
}

/** Validated shape of the triage model reply. */
export function validateAiTriage(v: unknown): Valid<AiTriage> | null {
  if (!isPlainObject(v)) return null;
  if (!exactKeys(v, ["issue", "confidence", "reason"])) return null;
  if (typeof v.issue !== "string" || v.issue.length === 0 || v.issue.length > 64) return null;
  if (typeof v.confidence !== "number" || !Number.isFinite(v.confidence) || v.confidence < 0 || v.confidence > 1) return null;
  const reason = str(v.reason, 1, 200);
  if (!reason) return null;
  return { ok: true, value: { issue: v.issue, confidence: v.confidence, reason } };
}

export interface AiPropSupport {
  verdict: "supported" | "partial" | "unrelated";
  reason: string;
}

/** Validated shape of the prop-support model reply. */
export function validateAiPropSupport(v: unknown): Valid<AiPropSupport> | null {
  if (!isPlainObject(v)) return null;
  if (!exactKeys(v, ["verdict", "reason"])) return null;
  if (v.verdict !== "supported" && v.verdict !== "partial" && v.verdict !== "unrelated") return null;
  const reason = str(v.reason, 1, 300);
  if (!reason) return null;
  return { ok: true, value: { verdict: v.verdict, reason } };
}
