/**
 * subpoena-response — extraction schema for POST /api/extract (Wave W4, class LA).
 *
 * Prompt contract from open-artifacts/subpoena-response/spec.md §"LLM prompt
 * schema (optional capture step)":
 *   "You are extracting structured facts from a subpoena document. Extract ONLY
 *    what the document states; never compute deadlines or suggest objections.
 *    Schema: { "subpoena": { "served_date": "<ISO, from certificate of service>",
 *    "service_method": "personal"|"mail"|"email"|null, "caption": "..." },
 *    "responsive_scope": { "date_range": {"start","end"}|null, "custodians":
 *    [{"name","role"}], "data_types": [{"type","systems","notes"}] },
 *    "objections_selected": [] }.
 *    If a field is not stated in the document, use null — do not infer."
 *
 * Hard rules (load-bearing): never compute deadlines, never suggest objections
 * (objections_selected is forced to the empty array by validateData), null when
 * not stated. Deadline computation and objection selection stay in deterministic
 * code downstream (computeDeadline / applyObjections).
 */
import type { ExtractSchema, Valid } from "../validate.ts";

/* ---------- local strict helpers (validate.ts keeps its own private set) ---------- */

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const exactKeys = (v: Record<string, unknown>, keys: string[]): boolean =>
  Object.keys(v).length === keys.length && keys.every((k) => k in v);

const str = (v: unknown, min: number, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length >= min && s.length <= max ? s : null;
};

/** ISO calendar date YYYY-MM-DD with plausible month/day (or null). */
const isoOrNull = (v: unknown): string | null => {
  if (v === null) return null;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const m = Number(v.slice(5, 7)), d = Number(v.slice(8, 10));
  return m >= 1 && m <= 12 && d >= 1 && d <= 31 ? v : null;
};

const METHODS = ["personal", "mail", "email"];

export interface ExtractedSubpoenaFacts {
  subpoena: { served_date: string | null; service_method: string | null; caption: string | null };
  responsive_scope: {
    date_range: { start: string | null; end: string | null } | null;
    custodians: { name: string; role: string | null }[];
    data_types: { type: string; systems: string[]; notes: string | null }[];
  };
  objections_selected: [];
}

/** Validated subpoena-response extraction — exact shape, null-not-infer, no objections. */
export function validateSubpoenaResponse(v: unknown): Valid<ExtractedSubpoenaFacts> | null {
  if (!isPlainObject(v) || !exactKeys(v, ["subpoena", "responsive_scope", "objections_selected"])) return null;
  const sub = v.subpoena;
  if (!isPlainObject(sub) || !exactKeys(sub, ["served_date", "service_method", "caption"])) return null;
  const served_date = isoOrNull(sub.served_date);
  if (served_date === null && sub.served_date !== null) return null;
  let service_method: string | null = null;
  if (sub.service_method !== null) {
    if (typeof sub.service_method !== "string" || !METHODS.includes(sub.service_method)) return null;
    service_method = sub.service_method;
  }
  let caption: string | null = null;
  if (sub.caption !== null) {
    caption = str(sub.caption, 1, 200);
    if (!caption) return null;
  }
  const rs = v.responsive_scope;
  if (!isPlainObject(rs) || !exactKeys(rs, ["date_range", "custodians", "data_types"])) return null;
  let date_range: ExtractedSubpoenaFacts["responsive_scope"]["date_range"] = null;
  if (rs.date_range !== null) {
    const dr = rs.date_range;
    if (!isPlainObject(dr) || !exactKeys(dr, ["start", "end"])) return null;
    const start = isoOrNull(dr.start), end = isoOrNull(dr.end);
    if (start === null && dr.start !== null) return null;
    if (end === null && dr.end !== null) return null;
    date_range = { start, end };
  }
  if (!Array.isArray(rs.custodians) || rs.custodians.length > 200) return null;
  const custodians: ExtractedSubpoenaFacts["responsive_scope"]["custodians"] = [];
  for (const c of rs.custodians) {
    if (!isPlainObject(c) || !exactKeys(c, ["name", "role"])) return null;
    const name = str(c.name, 1, 120);
    if (!name) return null;
    let role: string | null = null;
    if (c.role !== null) {
      role = str(c.role, 1, 120);
      if (!role) return null;
    }
    custodians.push({ name, role });
  }
  if (!Array.isArray(rs.data_types) || rs.data_types.length > 200) return null;
  const data_types: ExtractedSubpoenaFacts["responsive_scope"]["data_types"] = [];
  for (const t of rs.data_types) {
    if (!isPlainObject(t) || !exactKeys(t, ["type", "systems", "notes"])) return null;
    const type = str(t.type, 1, 120);
    if (!type) return null;
    if (!Array.isArray(t.systems) || t.systems.length > 40) return null;
    const systems: string[] = [];
    for (const s of t.systems) {
      const sys = str(s, 1, 120);
      if (!sys) return null;
      systems.push(sys);
    }
    let notes: string | null = null;
    if (t.notes !== null) {
      notes = str(t.notes, 1, 400);
      if (!notes) return null;
    }
    data_types.push({ type, systems, notes });
  }
  if (!Array.isArray(v.objections_selected) || v.objections_selected.length !== 0) return null; // the LLM never suggests objections
  return {
    ok: true,
    value: {
      subpoena: { served_date, service_method, caption },
      responsive_scope: { date_range, custodians, data_types },
      objections_selected: [],
    },
  };
}

export const schema: ExtractSchema = {
  fields: ["subpoena", "responsive_scope", "objections_selected"],
  system: [
    "You are extracting structured facts from a subpoena document. Extract ONLY what the document states; never compute deadlines or suggest objections.",
    'Schema: { "subpoena": { "served_date": "<ISO, from certificate of service>", "service_method": "personal"|"mail"|"email"|null, "caption": "..." }, "responsive_scope": { "date_range": {"start","end"}|null, "custodians": [{"name","role"}], "data_types": [{"type","systems","notes"}] }, "objections_selected": [] }.',
    "If a field is not stated in the document, use null — do not infer.",
    "Copy captions, custodian names, roles, and system names verbatim from the document; served_date comes only from the certificate of service.",
    "objections_selected must always be the empty array — objection selection stays with the responding attorney.",
    'Set confidence.subpoena and confidence.responsive_scope to "low" when any value was ambiguous or had to be null.',
    'Reply with ONLY a JSON object: {"data": { …the schema above… }, "confidence": {"subpoena": "high"|"low", "responsive_scope": "high"|"low", "objections_selected": "high"|"low"}}.',
  ].join(" "),
  user: (text) => "Subpoena document text (imported from a .docx):\n\n" + text,
  maxTokens: 1200,
  validateData: validateSubpoenaResponse,
};
