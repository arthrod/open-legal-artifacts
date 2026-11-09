/**
 * /api/extract schema — ai-governance-benchmark (Wave W6b).
 *
 * Prompt contract: open-artifacts/ai-governance-benchmark/spec.md §"LLM prompt
 * schema (optional answer-interview step)", ADAPTED for completed-questionnaire
 * DOCX imports per tmp/ola-docx-2026-11-08/reconC-inventory.md §4.3(5): the
 * interview becomes a read of a filled-in questionnaire, and the spec's hard
 * rules are kept:
 *   - NEVER choose the level yourself without a stated factual basis;
 *   - evidence ≤280 chars quoting the source;
 *   - questions the document does not answer are OMITTED — the deterministic
 *     core (scoreAssessment) scores them 0 and flags them; never guessed.
 * validateData refuses: ids outside the question bank (the core THROWS on
 * them), non-integer/out-of-range levels, duplicate ids (the core's answer
 * map would silently overwrite), and any answer whose evidence is empty or
 * over 280 chars — a level without a quoted basis never reaches the demo.
 *
 * Self-contained by design: validate.ts is imported TYPE-ONLY (erased at
 * runtime; the coordinator registers this schema into EXTRACT_SCHEMAS after
 * the wave), so the deployed val never reaches across the tree. The question
 * bank below is frozen from core/core.js @ RUBRIC_VERSION 1.1.0 and
 * drift-guarded by the sibling test, which cross-checks it against the real
 * QUESTION_BANK.
 */
import type { ExtractSchema, Valid } from "../validate.ts";

/** One extracted questionnaire answer — the core's assessment.answers entry. */
export interface ExtractedAnswer {
  questionId: string;
  level: number;
  evidence: string;
}

/** Frozen from the core's QUESTION_BANK (id + text only) — see header. */
export const QUESTIONS: ReadonlyArray<{ id: string; text: string }> = Object.freeze([
  { id: "inv-1", text: "Does the company maintain a current inventory of AI systems in use (built and third-party)?" },
  { id: "inv-2", text: "Is each inventory entry assigned a business owner accountable for the system?" },
  { id: "inv-3", text: "Are data flows into and out of each AI system documented (inputs, outputs, retention)?" },
  { id: "risk-1", text: "Is a documented AI risk assessment completed before a new AI system goes live?" },
  { id: "risk-2", text: "Are risks re-assessed on a set schedule or upon material change, not just at launch?" },
  { id: "risk-3", text: "Does the company restrict or review high-risk uses (hiring, credit, biometrics, minors)?" },
  { id: "ven-1", text: "Are AI vendor tools reviewed (security, data use, model changes) before purchase?" },
  { id: "ven-2", text: "Do vendor contracts address AI-specific terms (training on your data, output IP, indemnity)?" },
  { id: "ir-1", text: "Is there a defined process for reporting AI incidents (errors, bias, harms, leaks)?" },
  { id: "ir-2", text: "Are AI incidents triaged with severity levels and a named responder?" },
  { id: "ir-3", text: "Are post-incident reviews fed back into policy or system changes?" },
  { id: "trn-1", text: "Do employees receive training on approved vs. prohibited AI use for their role?" },
  { id: "trn-2", text: "Is there an escalation path employees actually know for AI questions and concerns?" },
]);

const QUESTION_IDS: ReadonlyArray<string> = Object.freeze(QUESTIONS.map((q) => q.id));

/* -- private validators, same strictness style as validate.ts -- */

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

/** Validated shape of the model's data — { answers: [...] } or null (unusable
 *  → the route replies INVALID, the demo falls back to the raw text). */
export function validateAiGovernanceAnswers(v: unknown): Valid<{ answers: ExtractedAnswer[] }> | null {
  if (!isPlainObject(v) || !exactKeys(v, ["answers"])) return null;
  if (!Array.isArray(v.answers) || v.answers.length > QUESTION_IDS.length) return null;
  const out: ExtractedAnswer[] = [];
  const seen = new Set<string>();
  for (const a of v.answers) {
    if (!isPlainObject(a) || !exactKeys(a, ["questionId", "level", "evidence"])) return null;
    if (typeof a.questionId !== "string" || !QUESTION_IDS.includes(a.questionId)) return null; // ids outside the bank: the core throws on them
    if (seen.has(a.questionId)) return null; // duplicates would silently overwrite in the core's map — refuse instead
    seen.add(a.questionId);
    if (typeof a.level !== "number" || !Number.isInteger(a.level) || a.level < 0 || a.level > 3) return null;
    const evidence = str(a.evidence, 1, 280); // NEVER a level without a quoted basis
    if (!evidence) return null;
    out.push({ questionId: a.questionId, level: a.level, evidence });
  }
  return { ok: true, value: { answers: out } };
}

export const schema: ExtractSchema = {
  fields: ["answers"],
  system: [
    "You read a completed AI-governance questionnaire and structure its answers for a deterministic scoring engine; you never score, rank, or advise.",
    "Rate each question the document answers on this scale: 0 not done · 1 ad hoc/informal · 2 defined but partial · 3 defined, repeatable, evidenced.",
    "NEVER choose the level yourself without a stated factual basis: every answer must carry evidence of at most 280 chars quoting the questionnaire (if the document marks the level in a table row or ticked box, copy that level and quote the row or text that carries it).",
    "questionId must be an id from the question bank — never invent, renumber, or translate ids.",
    "If the document does not answer a question, omit that question entirely: the engine scores unanswered questions as 0 and flags them, and a guessed level is worse than a missing one.",
    "Copy levels as stated; do not merge, average, or re-interpret them.",
    'Set confidence.answers to "low" when any level was uncertain, any evidence is not a verbatim quote from the document, or answers may have been missed.',
    'Reply with ONLY a JSON object: {"data": {"answers": [{"questionId": "<id from the bank>", "level": <0-3>, "evidence": "<=280 chars quoting the source>"}]}, "confidence": {"answers": "high"|"low"}}.',
  ].join(" "),
  user: (text) =>
    "Question bank (answer with these ids):\n" +
    QUESTIONS.map((q) => q.id + " — " + q.text).join("\n") +
    "\n\nCompleted questionnaire (imported from a .docx):\n\n" + text,
  maxTokens: 1200,
  validateData: validateAiGovernanceAnswers,
};
