/**
 * Shared OpenAI helper — Val Town's free std/openai (no key), gpt-5-nano,
 * chat completions only, ~10 req/min (mirrored by the in-memory limiter).
 *
 * JSON-mode helper: askJson sends the prompt, extracts/repairs the reply
 * through jsonrepair, validates it with a pure validator, and retries once
 * with a repair instruction. Provider errors are never surfaced raw —
 * askJson returns null and the route serves its safe fallback.
 */
import { OpenAI } from "https://esm.town/v/std/openai";
import { extractJson } from "./jsonrepair.ts";

export const MODEL = "gpt-5-nano";

const openai = new OpenAI();

export interface AskJsonOptions<T> {
  system: string;
  user: string;
  maxTokens?: number;
  /** pure validator from validate.ts, narrowed to a value via valueOf() — null for unusable output */
  validate: (v: unknown) => T | null;
}

/** One chat completion attempt; minimal params on retry if extras are rejected. */
type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

async function complete(messages: ChatMessage[], maxTokens: number): Promise<string | null> {
  try {
    const res = await openai.chat.completions.create({
      model: MODEL,
      messages,
      max_completion_tokens: maxTokens,
      response_format: { type: "json_object" },
    });
    return res?.choices?.[0]?.message?.content ?? null;
  } catch {
    // fall back to the bare documented shape, then to a minimal request
    try {
      const res = await openai.chat.completions.create({ model: MODEL, messages, max_completion_tokens: maxTokens });
      return res?.choices?.[0]?.message?.content ?? null;
    } catch (e) {
      console.error("openai bare(max_completion_tokens) failed:", String(e).slice(0, 300));
      try {
        const res = await openai.chat.completions.create({ model: MODEL, messages });
        return res?.choices?.[0]?.message?.content ?? null;
      } catch (e2) {
        console.error("openai minimal failed:", String(e2).slice(0, 300));
        return null;
      }
    }
  }
}

/**
 * Ask the model for a JSON object and return the validated value, or null
 * (provider down / output unusable after one repair round). Never throws.
 */
export async function askJson<T>(opts: AskJsonOptions<T>): Promise<T | null> {
  const messages: ChatMessage[] = [
    { role: "system", content: opts.system },
    { role: "user", content: opts.user },
  ];
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await complete(messages, opts.maxTokens ?? 500);
    if (raw === null) return null;
    const parsed = extractJson(raw);
    const validated = parsed === null ? null : opts.validate(parsed);
    if (validated !== null) return validated;
    messages.push({ role: "assistant", content: raw });
    messages.push({
      role: "user",
      content:
        "That reply was not a valid JSON object of the required shape. Reply again with ONLY the JSON object — no prose, no markdown fence.",
    });
  }
  return null;
}
