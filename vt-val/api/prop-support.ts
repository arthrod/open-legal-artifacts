/**
 * POST /api/prop-support — cite-check proposition judging: given a located
 * verbatim quote and the proposition it is offered to prove, the model rules
 * supported / partial / unrelated with a one-line reason. Mirrors the
 * propositions.ts harness rule: judgment only — the model never re-classifies
 * the quote and never sees anything but the quote + proposition.
 */
import { askJson } from "./openai.ts";
import { validatePropSupportBody, validateAiPropSupport, valueOf, type AiPropSupport } from "./validate.ts";
import { apiLimiter, clientIp, jsonError, jsonResponse, readJsonBody } from "./http.ts";

const SYSTEM = [
  "You judge whether a verbatim quote from a source document supports a legal proposition a brief attributes to it.",
  "Base your judgment ONLY on the quote text and the proposition — no outside facts, no assumptions about the case.",
  "supported = the quote clearly establishes the proposition; partial = the quote supports part of it, or only with caveats; unrelated = the quote does not establish it.",
  'Reply with ONLY a JSON object: {"verdict": "supported"|"partial"|"unrelated", "reason": "<one sentence, quoting the decisive words>"}',
].join(" ");

export async function handlePropSupport(req: Request): Promise<Response> {
  if (!apiLimiter.allow(clientIp(req), Date.now())) {
    return jsonError(429, "Too many requests — the live-AI budget is 10 requests per minute.");
  }
  const body = await readJsonBody(req);
  if (body === null) return jsonError(400, "Body must be a JSON object.");
  const parsed = validatePropSupportBody(body);
  if (!parsed.ok) return jsonError(400, parsed.error);

  const ai = await askJson<AiPropSupport>({
    system: SYSTEM,
    user: `Quote (verbatim, located in the cited source):\n"""${parsed.value.quote}"""\n\nProposition it is offered to prove: ${parsed.value.proposition}`,
    maxTokens: 300,
    validate: (v) => valueOf(validateAiPropSupport(v)),
  });

  if (ai === null) {
    return jsonError(502, "Live AI is unavailable or returned an unusable verdict — nothing was served.");
  }
  return jsonResponse({ verdict: ai.verdict, reason: ai.reason, mode: "live-ai" });
}
