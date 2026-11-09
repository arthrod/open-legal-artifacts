/**
 * intake-queue — extraction schema for POST /api/extract (Wave W4, class LA).
 *
 * Prompt contract from open-artifacts/intake-queue/spec.md §"Prompt schema for
 * the LLM part (extraction only)":
 *   "Extract structured parties from this intake email. Copy names verbatim;
 *    never canonicalize, never infer the opposing party."
 *   { "client": { "name": "verbatim|null" }, "opposing": { "name": "verbatim|null" },
 *     "matterType": "one phrase or null", "deadlineSeen": "ISO|null + source quote" }
 *
 * Hard rules (load-bearing — the demo's tested ingestSubmission gate
 * machine-verifies them downstream): names are copied verbatim, never
 * canonicalized, and the opposing party is never inferred; the deadline is
 * only what the document states, with the source quote — never computed or
 * extended. validateData refuses anything that is not exactly this shape.
 */
import type { ExtractSchema, Valid } from "../validate.ts";

/* ---------- local strict helpers (validate.ts keeps its own private set) ---------- */

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const exactKeys = (v: Record<string, unknown>, keys: string[]): boolean =>
  Object.keys(v).length === keys.length && keys.every((k) => k in v);

/** String field of length [min,max] after trim; null otherwise. */
const str = (v: unknown, min: number, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length >= min && s.length <= max ? s : null;
};

/** Full ISO calendar date (the demo's deadline input + ingestSubmission shape). */
const isoDate = (v: unknown): boolean =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number(v.slice(5, 7)) >= 1 && Number(v.slice(5, 7)) <= 12 &&
  Number(v.slice(8, 10)) >= 1 && Number(v.slice(8, 10)) <= 31;

export interface ExtractedIntake {
  client: { name: string | null };
  opposing: { name: string | null };
  matterType: string | null;
  deadlineSeen: { date: string | null; quote: string } | null;
}

/** Validated intake-queue extraction — exact shape, verbatim-or-null fields. */
export function validateIntakeQueue(v: unknown): Valid<ExtractedIntake> | null {
  if (!isPlainObject(v) || !exactKeys(v, ["client", "opposing", "matterType", "deadlineSeen"])) return null;
  const side = (s: unknown): { name: string | null } | null => {
    if (!isPlainObject(s) || !exactKeys(s, ["name"])) return null;
    if (s.name === null) return { name: null };
    const name = str(s.name, 1, 120);
    return name ? { name } : null;
  };
  const client = side(v.client);
  if (!client) return null;
  const opposing = side(v.opposing);
  if (!opposing) return null;
  let matterType: string | null = null;
  if (v.matterType !== null) {
    matterType = str(v.matterType, 1, 120);
    if (!matterType) return null;
  }
  let deadlineSeen: ExtractedIntake["deadlineSeen"] = null;
  if (v.deadlineSeen !== null) {
    const d = v.deadlineSeen;
    if (!isPlainObject(d) || !exactKeys(d, ["date", "quote"])) return null;
    const quote = str(d.quote, 1, 600);
    if (!quote) return null;
    if (d.date !== null && !isoDate(d.date)) return null; // a stated-but-unparseable date is a job for the human, not the model
    deadlineSeen = { date: (d.date as string | null) ?? null, quote };
  }
  return { ok: true, value: { client, opposing, matterType, deadlineSeen } };
}

export const schema: ExtractSchema = {
  fields: ["client", "opposing", "matterType", "deadlineSeen"],
  system: [
    "You extract structured parties from an intake email or letter for a legal-team demo.",
    "Copy names verbatim; never canonicalize, never infer the opposing party.",
    "client.name and opposing.name are copied character-for-character from the document text, or null when the document does not state them.",
    "matterType is one short phrase summarizing the dispute, or null.",
    'deadlineSeen is the deadline the document itself states: {"date": "YYYY-MM-DD", "quote": "<verbatim span mentioning the deadline>"} — or null when the document states no deadline.',
    "Never compute, extend, or look up a deadline; if the date is stated but not ISO-formattable, keep the verbatim quote and use null for date.",
    'Set confidence per field to "low" when the value was ambiguous, or you could not copy it verbatim from the document.',
    'Reply with ONLY a JSON object: {"data": {"client": {"name": "…"|null}, "opposing": {"name": "…"|null}, "matterType": "…"|null, "deadlineSeen": {"date": "2026-12-04"|null, "quote": "…"}|null}, "confidence": {"client": "high"|"low", "opposing": "high"|"low", "matterType": "high"|"low", "deadlineSeen": "high"|"low"}}.',
  ].join(" "),
  user: (text) => "Intake email / letter text (imported from a .docx):\n\n" + text,
  maxTokens: 700,
  validateData: validateIntakeQueue,
};
