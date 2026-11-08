/**
 * POST /api/ask-legal — question → grounded answer, mirroring the ask-legal
 * core contract (confidence high/medium/low with reasons, escalate-when-low,
 * provisional label on medium, suggestedEntry for the lawyer). The model may
 * only RESTATE approved guidance from the demo's KB snapshot; it never
 * generates legal content. Zero grounding ⇒ escalate without calling the
 * model (mirrors the core's "nothing is guessed").
 */
import { askJson } from "./openai.ts";
import { selectGrounding } from "./grounding.ts";
import { validateAskLegalBody, validateAiAskLegal, valueOf, type AiAskLegal } from "./validate.ts";
import { ASK_LEGAL } from "./data.ts";
import { apiLimiter, clientIp, jsonError, jsonResponse, readJsonBody } from "./http.ts";

/** Route resolution on the demo's routing table (rules-as-data, same as core routeTo). */
function routeFor(tags: string[] | undefined): string {
  for (const tag of tags ?? []) {
    const team = ASK_LEGAL.routing[tag];
    if (team) return team;
  }
  return ASK_LEGAL.routing.default;
}

function escalate(reasons: string[], suggested: { id: string; question: string } | null, route: string) {
  return jsonResponse({
    answered: false,
    answer: null,
    sourceId: null,
    confidence: { level: "low", reasons },
    escalate: true,
    route,
    provisional: false,
    label: null,
    suggestedEntry: suggested,
    mode: "live-ai",
  });
}

const SYSTEM = [
  "You answer internal guidance questions for a fictional company's legal-ops demo.",
  "You may ONLY restate guidance contained in the approved guidance entries provided — rephrase for the asker, but add NO new obligations, deadlines, numbers, or exceptions.",
  "Pick the single entry that applies. If none applies, set applicable=false and explain briefly in reasons.",
  "level: high = the entry clearly answers the question; medium = it partially covers it or is a stretch; low = you are unsure.",
  'Reply with ONLY a JSON object: {"applicable": boolean, "sourceId": string, "answer": string, "level": "high"|"medium"|"low", "reasons": string[]}.',
].join(" ");

export async function handleAskLegal(req: Request): Promise<Response> {
  if (!apiLimiter.allow(clientIp(req), Date.now())) {
    return jsonError(429, "Too many requests — the live-AI budget is 10 requests per minute. The deterministic engine has no limit.");
  }
  const body = await readJsonBody(req);
  if (body === null) return jsonError(400, "Body must be a JSON object.");
  const parsed = validateAskLegalBody(body);
  if (!parsed.ok) return jsonError(400, parsed.error);

  const hits = selectGrounding(ASK_LEGAL.knowledgeBase, parsed.value.question);
  if (hits.length === 0) {
    return escalate(
      ["no knowledge-base entry matched any question term or tag — escalated without calling the model"],
      null,
      routeFor(undefined),
    );
  }

  const entriesJson = hits
    .map((h) =>
      JSON.stringify({
        id: h.entry.id,
        question: h.entry.question,
        answer: h.entry.answer,
        tags: h.entry.tags,
        updated: h.entry.updated,
      }),
    )
    .join("\n");
  const user = [
    `Approved guidance entries (the ONLY things you may restate):\n${entriesJson}`,
    "",
    `Question: ${parsed.value.question}`,
    "",
    `Deterministic retrieval score of the best entry: ${hits[0].score} (matched: ${hits[0].matched.join(", ") || "none"}). Guidance older than ${ASK_LEGAL.thresholds.freshnessDays} days must lower the level one step (as-of date ${ASK_LEGAL.asOf}).`,
  ].join("\n");

  const ai = await askJson<AiAskLegal>({
    system: SYSTEM,
    user,
    maxTokens: 500,
    validate: (v) => valueOf(validateAiAskLegal(v, hits.map((h) => h.entry.id))),
  });

  if (ai === null) {
    return jsonError(502, "Live AI is unavailable or returned an unusable answer — nothing was served. The deterministic engine still works.");
  }

  const reasons = [
    `grounded in ${hits.map((h) => h.entry.id).join(", ")} (deterministic selection)`,
    ...ai.reasons,
  ];

  if (!ai.applicable || ai.level === "low") {
    const suggested = hits[0] ? { id: hits[0].entry.id, question: hits[0].entry.question } : null;
    return escalate(
      [...reasons, ai.applicable ? "model confidence was low — escalated instead of guessing" : "no approved guidance entry applies — escalated"],
      suggested,
      routeFor(hits[0]?.entry.tags),
    );
  }

  const provisional = ai.level === "medium";
  return jsonResponse({
    answered: true,
    answer: ai.answer,
    sourceId: ai.sourceId,
    confidence: { level: ai.level, reasons },
    escalate: false,
    route: null,
    provisional,
    label: provisional ? "Provisional guidance — confirm with Legal." : null,
    suggestedEntry: null,
    mode: "live-ai",
  });
}
