/**
 * sell-side-qa-log — buyer-questions extraction schema for POST /api/extract (Wave W7).
 * NEW prompt contract (reconC §4.3; the demo had no input section today — the wiring
 * adds one). Buyer-questions DOCX → the IO contract's item shape {id, buyerId,
 * category, question, receivedAt}. The spec's data-room answer-drafting prompt is a
 * LATER PHASE and is deliberately NOT built here: the model never drafts answers,
 * imported items start open with no answers, and receivedAt is copied from the
 * document, never computed. Registered by the coordinator after the wave
 * (validate.ts EXTRACT_SCHEMAS).
 */
import type { ExtractSchema, Valid } from "../validate.ts";

export interface QuestionItem {
  id: string;
  buyerId: string;
  category: string;
  question: string;
  receivedAt: string | null;
}

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

/** Strict real YYYY-MM-DD (rejects rollover like 2026-09-99). */
function isoDay(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return !Number.isNaN(d.getTime()) && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/** Validated buyer-questions extraction — exact keys (NO answers key: extraction
 *  never drafts answers), non-empty id/buyerId/category/question, real-or-null
 *  received date. null = unusable → the route replies INVALID. */
export function validateQuestionItems(v: unknown): Valid<{ items: QuestionItem[] }> | null {
  if (!isPlainObject(v) || !exactKeys(v, ["items"])) return null;
  if (!Array.isArray(v.items) || v.items.length > 200) return null;
  const out: QuestionItem[] = [];
  for (const it of v.items) {
    if (!isPlainObject(it) || !exactKeys(it, ["id", "buyerId", "category", "question", "receivedAt"])) return null;
    const id = str(it.id, 1, 24);
    if (!id) return null;
    const buyerId = str(it.buyerId, 1, 60);
    if (!buyerId) return null;
    const category = str(it.category, 1, 40);
    if (!category) return null;
    const question = str(it.question, 4, 500);
    if (!question) return null;
    if (it.receivedAt !== null && !isoDay(it.receivedAt)) return null; // the document's stated date, never computed
    out.push({ id, buyerId, category, question, receivedAt: it.receivedAt === null ? null : (it.receivedAt as string).trim() });
  }
  return { ok: true, value: { items: out } };
}

export const schema: ExtractSchema = {
  fields: ["items"],
  system: [
    "You extract buyer diligence questions from an imported buyer-questions document for the sell-side-qa-log demo.",
    'Each item is {"id", "buyerId", "category", "question", "receivedAt"}: id follows Q-001, Q-002, … in document order; buyerId is the buyer identifier exactly as the document names the asking party (e.g. "B1" or the buyer\'s name) — never invent a buyer the document does not name; category is the diligence category the document groups by (e.g. financials, litigation, ip, customers, employment) or "general"; question is the buyer\'s question copied verbatim; receivedAt is the date the document states the question was received, in YYYY-MM-DD — never compute or guess a date, null when not stated.',
    "You never draft answers — answer drafting from data-room excerpts is a separate later step owned by humans with citations; every item you emit starts open, with no answers.",
    'Set confidence.items to "low" when any buyer, category, or date was uncertain.',
    'Reply with ONLY a JSON object: {"data": {"items": [{"id": "Q-001", "buyerId": "B1", "category": "financials", "question": "…", "receivedAt": "2026-10-02"|null}]}, "confidence": {"items": "high"|"low"}}.',
  ].join(" "),
  user: (text) => "Buyer questions document text (imported from a .docx):\n\n" + text,
  maxTokens: 1500,
  validateData: validateQuestionItems,
};
