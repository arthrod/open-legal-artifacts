/**
 * docket-watch-wall — docket-report extraction schema for POST /api/extract (Wave W7).
 * NEW prompt contract (reconC §4.3: the spec's only prompt is entry summarization,
 * which is NOT a document-ingestion contract). The extraction targets the feed-JSON
 * entry shape directly — the same shape fromRecapPayload normalizes structured
 * CourtListener RECAP input into: {id, date, description, case{name, judge,
 * parties[], practiceArea, court}}. Hard rules: descriptions copied verbatim, never
 * compute or guess dates, parties ALWAYS an array (the Wave F core fix normalizes
 * string parties, but the prompt still emits arrays), never invent case metadata.
 * Registered by the coordinator after the wave (validate.ts EXTRACT_SCHEMAS).
 */
import type { ExtractSchema, Valid } from "../validate.ts";

export interface DocketCase {
  name: string;
  judge: string | null;
  parties: string[];
  practiceArea: string | null;
  court: string;
}

export interface DocketEntry {
  id: string;
  date: string | null;
  description: string;
  case: DocketCase;
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

/** Strict real YYYY-MM-DD (rejects rollover like 2026-04-31). */
function isoDay(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return !Number.isNaN(d.getTime()) && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/** Validated docket-report extraction — exact keys on entry and case, parties
 *  strictly an array of non-empty strings, real-or-null filing date. null =
 *  unusable → the route replies INVALID. */
export function validateDocketEntries(v: unknown): Valid<{ entries: DocketEntry[] }> | null {
  if (!isPlainObject(v) || !exactKeys(v, ["entries"])) return null;
  if (!Array.isArray(v.entries) || v.entries.length > 500) return null;
  const out: DocketEntry[] = [];
  for (const e of v.entries) {
    if (!isPlainObject(e) || !exactKeys(e, ["id", "date", "description", "case"])) return null;
    const id = str(e.id, 1, 40);
    if (!id) return null;
    if (e.date !== null && !isoDay(e.date)) return null; // the report's printed date, never computed
    const description = str(e.description, 1, 600);
    if (!description) return null;
    const c = e.case;
    if (!isPlainObject(c) || !exactKeys(c, ["name", "judge", "parties", "practiceArea", "court"])) return null;
    const name = str(c.name, 1, 200);
    if (!name) return null;
    let judge: string | null = null;
    if (c.judge !== null) {
      judge = str(c.judge, 1, 120);
      if (!judge) return null;
    }
    if (!Array.isArray(c.parties) || c.parties.length > 20 || !c.parties.every((p: unknown) => typeof p === "string" && p.trim().length >= 1 && p.trim().length <= 160)) return null; // ALWAYS an array
    let practiceArea: string | null = null;
    if (c.practiceArea !== null) {
      practiceArea = str(c.practiceArea, 1, 60);
      if (!practiceArea) return null;
    }
    const court = str(c.court, 1, 120);
    if (!court) return null;
    out.push({
      id,
      date: e.date === null ? null : (e.date as string).trim(),
      description,
      case: { name, judge, parties: (c.parties as string[]).map((p) => p.trim()), practiceArea, court },
    });
  }
  return { ok: true, value: { entries: out } };
}

export const schema: ExtractSchema = {
  fields: ["entries"],
  system: [
    "You extract docket entries from an imported docket report for the docket-watch-wall demo.",
    'Each entry is {"id", "date", "description", "case"}: id is the docket entry number exactly as printed (e.g. "12"); date is the filing date as printed in YYYY-MM-DD — never compute or guess a date, null when not printed; description is the docket text copied verbatim.',
    'case is {"name", "judge", "parties", "practiceArea", "court"}: name is the case caption as printed; judge is the judge as printed or null; parties is ALWAYS an array of party names exactly as printed, never a string; practiceArea is null unless the report itself labels one (watchers apply their own taxonomy); court is the court as printed.',
    "Never invent judges, parties, or courts — copy what the report states; omit rather than guess.",
    "One entry per docket line, in document order.",
    'Set confidence.entries to "low" when any date, party, or caption was uncertain.',
    'Reply with ONLY a JSON object: {"data": {"entries": [{"id": "12", "date": "2026-04-02"|null, "description": "…", "case": {"name": "…", "judge": "…"|null, "parties": ["…"], "practiceArea": null, "court": "…"}}]}, "confidence": {"entries": "high"|"low"}}.',
  ].join(" "),
  user: (text) => "Docket report text (imported from a .docx):\n\n" + text,
  maxTokens: 1500,
  validateData: validateDocketEntries,
};
