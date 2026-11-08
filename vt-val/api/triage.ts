/**
 * POST /api/triage — front-door triage on free text: the model classifies
 * the problem into EXACTLY ONE taxonomy issue with a confidence; the route
 * gates it (0.4, same as the deterministic core) and serves referral info
 * copied verbatim from the taxonomy snapshot — never advice. Unknown issue
 * ids from the model are refused (escalate), never guessed.
 */
import { askJson } from "./openai.ts";
import { validateTriageBody, validateAiTriage, valueOf, type AiTriage } from "./validate.ts";
import { assessUrgency, extractDates } from "./textsignals.ts";
import { FRONT_DOOR_TAXONOMY, FRONT_DOOR_DISCLAIMER, FRONT_DOOR_ESCALATE_MESSAGE, TRIAGE_MIN_CONFIDENCE, type Taxonomy } from "./data.ts";
import { apiLimiter, clientIp, jsonError, jsonResponse, readJsonBody } from "./http.ts";

/** Copy a referral (incl. approved guidance) verbatim from taxonomy data — same as the core. */
function referralFor(issue: string, taxonomy: Taxonomy, confidence: number) {
  const def = taxonomy[issue];
  return {
    issue,
    label: def.label,
    confidence,
    legalAidCategory: def.referral.legalAidCategory,
    serviceDescription: def.referral.serviceDescription,
    whereToGo: def.referral.whereToGo,
    guidance: (def.guidance ?? []).map((g) => ({ point: g.point, source: { ...g.source } })),
  };
}

const SYSTEM = [
  "You are an intake triage assistant at a legal aid front door. You classify the person's own-words problem into EXACTLY ONE issue from the provided taxonomy.",
  "You never give advice, never evaluate merits, never add facts. If the problem fits none of the issues, use issue \"none\".",
  'Reply with ONLY a JSON object: {"issue": "<issue id or none>", "confidence": <number 0..1>, "reason": "<one short sentence>"}.',
].join(" ");

export async function handleTriage(req: Request): Promise<Response> {
  if (!apiLimiter.allow(clientIp(req), Date.now())) {
    return jsonError(429, "Too many requests — the live-AI budget is 10 requests per minute. The deterministic matcher has no limit.");
  }
  const body = await readJsonBody(req);
  if (body === null) return jsonError(400, "Body must be a JSON object.");
  const parsed = validateTriageBody(body);
  if (!parsed.ok) return jsonError(400, parsed.error);

  const text = parsed.value.text;
  const urgency = assessUrgency(text);
  const dates = extractDates(text);
  const escalate = (reason: string, extra: Record<string, unknown> = {}) =>
    jsonResponse({
      status: "escalate",
      reason,
      escalate: FRONT_DOOR_ESCALATE_MESSAGE,
      disclaimer: FRONT_DOOR_DISCLAIMER,
      candidates: [],
      matchedFragments: [],
      urgency,
      dates,
      mode: "live-ai",
      ...extra,
    });

  const issues = Object.entries(FRONT_DOOR_TAXONOMY)
    .map(([id, def]) => `${id} — ${def.label} (e.g. ${def.keywords.slice(0, 4).map((k) => k.k).join("; ")})`)
    .join("\n");

  const ai = await askJson<AiTriage>({
    system: SYSTEM,
    user: `Taxonomy issues:\n${issues}\n\nProblem description: ${text}`,
    maxTokens: 300,
    validate: (v) => valueOf(validateAiTriage(v)),
  });

  if (ai === null) {
    return jsonError(502, "Live AI is unavailable or returned an unusable classification — nothing was served. The deterministic matcher still works.");
  }
  if (ai.issue === "none" || !FRONT_DOOR_TAXONOMY[ai.issue]) {
    return escalate("no-valid-issue", { aiReason: ai.reason });
  }
  if (ai.confidence < TRIAGE_MIN_CONFIDENCE) {
    return escalate("low-confidence", { aiReason: ai.reason, aiConfidence: ai.confidence });
  }

  return jsonResponse({
    status: "classified",
    primaryIssue: ai.issue,
    primaryLabel: FRONT_DOOR_TAXONOMY[ai.issue].label,
    confidence: ai.confidence,
    multiIssue: false,
    matchedKeywords: [], // deterministic matcher fields stay empty in AI mode — nothing is fabricated
    resolvedBy: "live-ai",
    referrals: [referralFor(ai.issue, FRONT_DOOR_TAXONOMY, ai.confidence)],
    otherCandidates: [],
    disclaimer: FRONT_DOOR_DISCLAIMER,
    urgency,
    dates,
    aiReason: ai.reason,
    mode: "live-ai",
  });
}
