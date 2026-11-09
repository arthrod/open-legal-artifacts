/**
 * renewal-calendar — extraction schema for POST /api/extract (Wave W3, class LA).
 *
 * Prompt contract from open-artifacts/renewal-calendar/spec.md §"LLM prompt
 * schema (extraction step, optional)":
 *   task: "Extract renewal/notice/termination clause objects from the provided contract text."
 *   rules: ["Copy temporal phrases verbatim into dateExpression — never interpret them.",
 *           "No invented dates."]
 *
 * Hard rules (load-bearing): temporal phrases ride verbatim in dateExpression
 * and are never interpreted; dates exist only when the clause states one
 * explicitly; interpretation of ambiguous phrases stays with the
 * deterministic grammar + human confirmations, never the model. validateData
 * refuses anything that is not exactly the spec's clause shape — including a
 * clause carrying both a date and an expression, or neither.
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

/** Full ISO calendar date, calendar-valid (rejects 2027-02-30). */
const isoDay = (v: unknown): boolean => {
  if (typeof v !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return dt.getUTCFullYear() === +m[1] && dt.getUTCMonth() === +m[2] - 1 && dt.getUTCDate() === +m[3];
};

const TYPES = ["auto-renewal", "evergreen", "termination-for-convenience", "notice", "price-adjustment"];

export interface ExtractedClause {
  type: string;
  date: string | null;
  dateExpression: string | null;
  quote: string;
  leadTimeDaysOverride: number | null;
  renewalTermMonths: number | null;
}

/** Validated renewal-calendar extraction: clause objects with verbatim
 *  dateExpression, explicit-date-or-expression (never both, never neither). */
export function validateRenewalClauses(v: unknown): Valid<{ clauses: ExtractedClause[] }> | null {
  if (!isPlainObject(v) || !exactKeys(v, ["clauses"])) return null;
  if (!Array.isArray(v.clauses) || v.clauses.length > 200) return null;
  const clauses: ExtractedClause[] = [];
  for (const c of v.clauses) {
    if (!isPlainObject(c) || !exactKeys(c, ["type", "date", "dateExpression", "quote", "leadTimeDaysOverride", "renewalTermMonths"])) return null;
    if (typeof c.type !== "string" || !TYPES.includes(c.type)) return null;
    if (c.date !== null && !isoDay(c.date)) return null; // "No invented dates" — explicit calendar dates only
    if (c.dateExpression !== null && !str(c.dateExpression, 1, 200)) return null;
    if ((c.date === null) === (c.dateExpression === null)) return null; // exactly one anchor: never both, never neither
    const quote = str(c.quote, 1, 600);
    if (!quote) return null; // the clause text, verbatim
    for (const n of [c.leadTimeDaysOverride, c.renewalTermMonths]) {
      if (n !== null && (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 1200)) return null;
    }
    clauses.push({
      type: c.type,
      date: (c.date as string | null) ?? null,
      dateExpression: (c.dateExpression as string | null) ?? null,
      quote,
      leadTimeDaysOverride: (c.leadTimeDaysOverride as number | null) ?? null,
      renewalTermMonths: (c.renewalTermMonths as number | null) ?? null,
    });
  }
  return { ok: true, value: { clauses } };
}

export const schema: ExtractSchema = {
  fields: ["clauses"],
  system: [
    "Extract renewal/notice/termination clause objects from the provided contract text.",
    "Copy temporal phrases verbatim into dateExpression — never interpret them. No invented dates: set date only when the clause states an explicit calendar date; otherwise leave date null and carry the phrase in dateExpression.",
    "quote must be the clause text copied verbatim.",
    "leadTimeDaysOverride is set only when the clause states its own notice window; renewalTermMonths only when the clause renews for successive terms; otherwise null.",
    "type is one of auto-renewal|evergreen|termination-for-convenience|notice|price-adjustment.",
    "Resolving ambiguous phrases stays with the deterministic grammar and human confirmations — never resolve an ambiguity yourself.",
    'Set confidence.clauses to "low" when any clause may have been missed or any quote is not verbatim.',
    'Reply with ONLY a JSON object: {"data": {"clauses": [{"type": "auto-renewal", "date": "2027-04-01"|null, "dateExpression": "within 60 days of quarter end"|null, "quote": "verbatim clause text", "leadTimeDaysOverride": 30|null, "renewalTermMonths": 12|null}]}, "confidence": {"clauses": "high"|"low"}}.',
  ].join(" "),
  user: (text) => "Contract text (imported from a .docx):\n\n" + text,
  maxTokens: 1500,
  validateData: validateRenewalClauses,
};

export default schema;
