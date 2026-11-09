/**
 * ask-legal — KB-ingestion extraction schema for POST /api/extract (Wave W7).
 * NEW prompt contract (reconC §4.3: the spec's only prompt is the answer-polish
 * step, which is NOT a document-ingestion contract). Policy/guidance DOCX → DRAFT
 * KB entries matching the demo's embedded KB shape. Every drafted entry lands
 * status "pending-approval" in the demo — the core's approveEntry lifecycle stays
 * the human gate; the model never approves, never adds guidance the document does
 * not state, and never computes dates (updated is the document's own date or null).
 * Registered by the coordinator after the wave (validate.ts EXTRACT_SCHEMAS).
 */
import type { ExtractSchema, Valid } from "../validate.ts";

export interface KbDraft {
  id: string;
  question: string;
  answer: string;
  tags: string[];
  jurisdiction: string | null;
  updated: string | null;
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

/** Strict real YYYY-MM-DD (rejects rollover like 2026-02-30). */
function isoDay(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return !Number.isNaN(d.getTime()) && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/** Validated ask-legal KB draft extraction — exact keys, bounded strings, tags
 *  array, real-or-null document date. null = unusable → the route replies INVALID. */
export function validateKbDrafts(v: unknown): Valid<{ entries: KbDraft[] }> | null {
  if (!isPlainObject(v) || !exactKeys(v, ["entries"])) return null;
  if (!Array.isArray(v.entries) || v.entries.length > 60) return null;
  const out: KbDraft[] = [];
  for (const e of v.entries) {
    if (!isPlainObject(e) || !exactKeys(e, ["id", "question", "answer", "tags", "jurisdiction", "updated"])) return null;
    const id = str(e.id, 1, 24);
    if (!id) return null;
    const question = str(e.question, 4, 300);
    if (!question) return null;
    const answer = str(e.answer, 1, 1000);
    if (!answer) return null;
    if (!Array.isArray(e.tags) || e.tags.length > 8 || !e.tags.every((t: unknown) => typeof t === "string" && t.trim().length >= 1 && t.trim().length <= 32)) return null;
    let jurisdiction: string | null = null;
    if (e.jurisdiction !== null) {
      jurisdiction = str(e.jurisdiction, 1, 32);
      if (!jurisdiction) return null;
    }
    if (e.updated !== null && !isoDay(e.updated)) return null; // the document's own date, never computed or guessed
    out.push({
      id,
      question,
      answer,
      tags: (e.tags as string[]).map((t) => t.trim()),
      jurisdiction,
      updated: e.updated === null ? null : (e.updated as string).trim(),
    });
  }
  return { ok: true, value: { entries: out } };
}

export const schema: ExtractSchema = {
  fields: ["entries"],
  system: [
    "You draft knowledge-base entries for the ask-legal demo from an imported policy or guidance document.",
    'Each entry is {"id", "question", "answer", "tags", "jurisdiction", "updated"}: question is the colleague-facing question the passage answers; answer restates ONLY what the document states — copy its wording verbatim where you can and never add obligations, deadlines, or exceptions the document does not state.',
    'tags are short lowercase slugs drawn from the document\'s own subject matter; jurisdiction is the document\'s stated jurisdiction, or null when it states none.',
    'updated is the document\'s own date in YYYY-MM-DD form — copy it, never compute or guess a date; null when the document states none.',
    'Every entry you draft lands status "pending-approval" and is invisible to colleagues until a human approves it — you never approve anything.',
    "Ids run kb-imp-001, kb-imp-002, … in document order.",
    'Set confidence.entries to "low" when any answer paraphrases rather than quotes, any date was uncertain, or passages may have been missed.',
    'Reply with ONLY a JSON object: {"data": {"entries": [{"id": "kb-imp-001", "question": "…", "answer": "…", "tags": ["nda", "contracts"], "jurisdiction": "US"|null, "updated": "2026-09-15"|null}]}, "confidence": {"entries": "high"|"low"}}.',
  ].join(" "),
  user: (text) => "Policy / guidance document text (imported from a .docx):\n\n" + text,
  maxTokens: 1500,
  validateData: validateKbDrafts,
};
