/**
 * entity-compliance-calendar — extraction schema for POST /api/extract
 * (Wave W3, class LA).
 *
 * Prompt contract from open-artifacts/entity-compliance-calendar/spec.md
 * §"LLM prompt schema (extraction step, optional)":
 *   task: "Structure the provided Secretary-of-State / formation records into entity objects."
 *   output_schema: { "id": "…", "name": "legal name verbatim", "jurisdiction": "US-XX",
 *                    "type": "corp|llc|nonprofit", "formedOn": "YYYY-MM-DD",
 *                    "status": "active|dissolved" }
 *   rules: ["Copy names and dates verbatim; never infer a formation date.",
 *           "Unreadable date → null, never guessed."]
 *
 * Hard rules (load-bearing): names and dates are copied verbatim; a
 * formation date is never inferred; an unreadable date is null. The
 * obligation rule base is never LLM-maintained — rules enter as reviewed
 * data with statutory cites. validateData refuses anything not exactly the
 * spec's entity shape, including non-US-XX jurisdictions and calendar-invalid
 * dates.
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

/** Full ISO calendar date, calendar-valid (rejects 2020-02-30). */
const isoDay = (v: unknown): boolean => {
  if (typeof v !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return dt.getUTCFullYear() === +m[1] && dt.getUTCMonth() === +m[2] - 1 && dt.getUTCDate() === +m[3];
};

export interface ExtractedEntity {
  id: string;
  name: string;
  jurisdiction: string;
  type: string;
  formedOn: string | null;
  status: string;
}

/** Validated entity extraction: verbatim names, US-XX jurisdictions,
 *  formedOn null when unreadable — never guessed. */
export function validateEntities(v: unknown): Valid<{ entities: ExtractedEntity[] }> | null {
  if (!isPlainObject(v) || !exactKeys(v, ["entities"])) return null;
  if (!Array.isArray(v.entities) || v.entities.length > 200) return null;
  const entities: ExtractedEntity[] = [];
  for (const e of v.entities) {
    if (!isPlainObject(e) || !exactKeys(e, ["id", "name", "jurisdiction", "type", "formedOn", "status"])) return null;
    const id = str(e.id, 1, 24);
    if (!id) return null;
    const name = str(e.name, 1, 200);
    if (!name) return null; // legal name verbatim, never blank
    if (typeof e.jurisdiction !== "string" || !/^US-[A-Z]{2}$/.test(e.jurisdiction)) return null; // the record's code, never derived from the name
    if (e.type !== "corp" && e.type !== "llc" && e.type !== "nonprofit") return null;
    if (e.formedOn !== null && !isoDay(e.formedOn)) return null; // unreadable → null, never guessed
    if (e.status !== "active" && e.status !== "dissolved") return null;
    entities.push({ id, name, jurisdiction: e.jurisdiction, type: e.type, formedOn: (e.formedOn as string | null) ?? null, status: e.status });
  }
  return { ok: true, value: { entities } };
}

export const schema: ExtractSchema = {
  fields: ["entities"],
  system: [
    "Structure the provided Secretary-of-State / formation records into entity objects.",
    "Copy names and dates verbatim; never infer a formation date. An unreadable date is null, never guessed.",
    "id is a stable short id you assign in document order (E-1, E-2, …).",
    "type is one of corp|llc|nonprofit; status is one of active|dissolved (active when the record does not say otherwise).",
    "jurisdiction is the US state code as the record states it, in US-XX form (e.g. US-DE) — never derived from the entity name.",
    "The obligation rule base is never yours to maintain — extract entities only; rules enter as reviewed data with statutory cites.",
    'Set confidence.entities to "low" when any name, date, or status was hard to read.',
    'Reply with ONLY a JSON object: {"data": {"entities": [{"id": "E-1", "name": "legal name verbatim", "jurisdiction": "US-DE", "type": "corp", "formedOn": "2020-03-15"|null, "status": "active"}]}, "confidence": {"entities": "high"|"low"}}.',
  ].join(" "),
  user: (text) => "Secretary-of-State / formation record text (imported from a .docx):\n\n" + text,
  maxTokens: 1500,
  validateData: validateEntities,
};

export default schema;
