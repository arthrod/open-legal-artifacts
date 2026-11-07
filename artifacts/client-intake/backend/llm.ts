// Structured-LLM calls for client-intake: elicit → finalize → help.
// Free Val Town OpenAI proxy (gpt-5-nano), strict json_schema, parse → repair →
// assert → one retry. Self-contained: only imports the local shared catalog.
import { OpenAI } from "https://esm.town/v/std/openai";
import {
  assertFinalizeIntake,
  buildElicitIntakePrompt,
  buildFinalizeIntakePrompt,
  buildHelpPrompt,
  ELICIT_INTAKE_SCHEMA,
  FINALIZE_INTAKE_SCHEMA,
  matterAreaLabel,
  repairElicitIntake,
  repairFinalizeIntake,
  truncateNarrative,
} from "../shared/catalog.ts";
import type {
  FinalizeIntakeResponse,
  IntakeBrief,
  IntakeElicitation,
} from "../shared/types.ts";

// Free Val Town OpenAI proxy — no API key required.
const MODEL = "gpt-5-nano";
const openai = new OpenAI();

function parseJson(raw: string | null | undefined, tag: string): unknown {
  if (!raw) throw new Error(`${tag}: LLM returned no content`);
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`${tag}: invalid JSON (${raw.length} chars): ${(e as Error).message}`);
  }
}

/**
 * Narrative + brief → AI proposes the intake fields (each with ≥2 suggestions)
 * tailored to the matter area + persona. The user confirms/edits before finalize.
 */
export async function elicitIntake(brief: IntakeBrief): Promise<IntakeElicitation> {
  const narrative = truncateNarrative(brief.narrative);
  if (narrative.length < 20) {
    throw new Error(
      "Please describe what's going on in a sentence or two so we can ask the right questions.",
    );
  }

  const system = buildElicitIntakePrompt(brief);
  const user =
    `Persona: ${brief.persona}\n` +
    `Practice area: ${matterAreaLabel(brief.matter_area)}\n` +
    `Name so far: ${brief.contact_name || "(none)"}\n\n` +
    `--- NARRATIVE START ---\n${narrative}\n--- NARRATIVE END ---\n\n` +
    "Return JSON matching IntakeElicitation. Propose the right questions with alternatives.";

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_schema", json_schema: ELICIT_INTAKE_SCHEMA },
  });

  const parsed = parseJson(completion.choices[0]?.message?.content, "elicit-intake");
  return repairElicitIntake(parsed, brief);
}

/**
 * Confirmed answers → structured intake: firm-facing summary, exhaustive
 * conflict_parties, urgency flag, and plain-language next steps. Locked-output
 * discipline: strict json_schema → repair → assert (one retry).
 */
export async function finalizeIntake(
  brief: IntakeBrief,
  answers: Record<string, string>,
): Promise<FinalizeIntakeResponse> {
  const narrative = truncateNarrative(brief.narrative);
  const answerLines = Object.entries(answers ?? {})
    .filter(([, v]) => typeof v === "string" && v.trim())
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");

  const system = buildFinalizeIntakePrompt(brief);
  const user =
    `Persona: ${brief.persona}\n` +
    `Practice area: ${matterAreaLabel(brief.matter_area)}\n` +
    `Client name on file: ${brief.contact_name || "(from answers)"}\n\n` +
    `--- NARRATIVE START ---\n${narrative}\n--- NARRATIVE END ---\n\n` +
    `--- CONFIRMED ANSWERS ---\n${answerLines || "(none)"}\n--- END ANSWERS ---\n\n` +
    "Return JSON matching FinalizeIntake. Extract EVERY named party for the conflict check.";

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_schema", json_schema: FINALIZE_INTAKE_SCHEMA },
  });

  const parsed = parseJson(completion.choices[0]?.message?.content, "finalize-intake");
  const repaired = repairFinalizeIntake(parsed, brief, answers);
  try {
    assertFinalizeIntake(repaired);
    return repaired;
  } catch (e) {
    console.warn("finalize-intake assert failed, retrying:", (e as Error).message);
    const retry = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        {
          role: "system",
          content:
            `Your previous output was rejected: "${(e as Error).message}". ` +
            "Re-emit a valid FinalizeIntake. summary MUST be a non-empty neutral " +
            "paragraph, and conflict_parties MUST list every named person/entity " +
            "(including the client). Do not invent facts.",
        },
        { role: "user", content: user },
      ],
      response_format: { type: "json_schema", json_schema: FINALIZE_INTAKE_SCHEMA },
    });
    const parsed2 = parseJson(retry.choices[0]?.message?.content, "finalize-intake retry");
    const repaired2 = repairFinalizeIntake(parsed2, brief, answers);
    assertFinalizeIntake(repaired2);
    return repaired2;
  }
}

/** Plain-language help for an intake term/question. Persona-aware, never advice. */
export async function explain(
  brief: Partial<IntakeBrief>,
  question: string,
): Promise<string> {
  const { system, user } = buildHelpPrompt(brief, question);
  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) {
    return "Sorry, I couldn't generate an explanation. Try rephrasing your question.";
  }
  return raw;
}
