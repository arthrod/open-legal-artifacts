/**
 * pro-bono-case-board — /api/extract schema (Wave W4 finish, class LA).
 * Prompt contract from open-artifacts/pro-bono-case-board/spec.md §"Prompt
 * schema for the LLM part (input prep only)": "Normalize this intake note into
 * case-board fields. Use only the skill tags from the provided taxonomy.
 * Never invent a volunteer match." Output is exactly
 * { problem, requiredSkills, optionalSkills, confidence, unknownTerms } —
 * words that do not map to the taxonomy go to unknownTerms, never into the
 * skill arrays; no volunteerId, no case id, no dates are extracted (those are
 * the caller's and the deterministic core's jobs). The taxonomy below is the
 * artifact's shipped example vocabulary; the demo additionally flags proposed
 * tags that are missing from the board's actual roster. Registered by the
 * coordinator's post-wave pass (children do not edit validate.ts); the demo
 * posts { schema: "pro-bono-case-board", text }.
 */
import type { ExtractSchema, Valid } from "../validate.ts";

export interface ExtractedCaseFields {
  problem: string;
  requiredSkills: string[];
  optionalSkills: string[];
  confidence: number;
  unknownTerms: string[];
}

/** The shipped example skill-tag taxonomy (examples/*.json + demo roster). */
export const TAXONOMY = [
  "housing",
  "tenant-defense",
  "family",
  "benefits",
  "consumer",
  "immigration",
  "spanish",
] as const;

/* ---------- strict helpers (same posture as validate.ts's private set) ---------- */

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

const KEYS = ["problem", "requiredSkills", "optionalSkills", "confidence", "unknownTerms"];
const TAG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function tagList(v: unknown, max: number): string[] | null {
  if (!Array.isArray(v) || v.length > max) return null;
  const out: string[] = [];
  for (const t of v) {
    const s = str(t, 1, 40);
    if (!s || !TAG.test(s)) return null; // lowercase kebab-case taxonomy tags only
    out.push(s);
  }
  return out;
}

/**
 * Validated pro-bono-case-board extraction — the spec's exact 5-key shape.
 * Skill arrays hold only well-formed taxonomy-shaped tags; unknownTerms is the
 * honest parking lot. null = unusable.
 */
export function validateExtractProBonoCaseBoard(v: unknown): Valid<ExtractedCaseFields> | null {
  if (!isPlainObject(v) || !exactKeys(v, KEYS)) return null;
  const problem = str(v.problem, 1, 200);
  if (!problem) return null;
  const requiredSkills = tagList(v.requiredSkills, 20);
  if (!requiredSkills) return null;
  const optionalSkills = tagList(v.optionalSkills, 20);
  if (!optionalSkills) return null;
  const unknownTerms = tagList(v.unknownTerms, 40);
  if (!unknownTerms) return null;
  const confidence = v.confidence;
  if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;
  return { ok: true, value: { problem, requiredSkills, optionalSkills, confidence, unknownTerms } };
}

/** The registered schema entry (key "pro-bono-case-board"). */
export const schema: ExtractSchema = {
  fields: ["problem", "requiredSkills", "optionalSkills", "unknownTerms"],
  system: [
    "Normalize this intake note into case-board fields. Use only the skill tags from the provided taxonomy. Never invent a volunteer match.",
    'The taxonomy is exactly: "housing", "tenant-defense", "family", "benefits", "consumer", "immigration", "spanish" (lowercase kebab-case tags).',
    "problem is a one-line summary of the client's legal problem, in the note's own terms.",
    "requiredSkills are the taxonomy tags the case genuinely needs; optionalSkills are tags that would help. Words you could not map to the taxonomy go in unknownTerms — never into the skill arrays.",
    "confidence is a number from 0.0 to 1.0 reflecting how certain the normalization is.",
    "Never propose, guess, or mention a volunteer; never output a case id, client name, or dates — those belong to the coordinator and the board.",
    'Set confidence per field to "low" (in the reply envelope) when the value was ambiguous or you were unsure of the mapping.',
    'Reply with ONLY a JSON object: {"data": {"problem": "…", "requiredSkills": ["housing"], "optionalSkills": ["spanish"], "confidence": 0.7, "unknownTerms": ["benefits-law"]}, "confidence": {"problem": "high"|"low", "requiredSkills": "high"|"low", "optionalSkills": "high"|"low", "unknownTerms": "high"|"low"}}.',
  ].join(" "),
  user: (text) => "Pro bono intake note (imported from a .docx):\n\n" + text,
  maxTokens: 500,
  validateData: validateExtractProBonoCaseBoard,
};
