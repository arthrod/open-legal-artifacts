/**
 * criminal-charge-reality-check — extraction schema for POST /api/extract
 * (Wave W5 FINISH, class LA).
 *
 * Prompt contract from open-artifacts/criminal-charge-reality-check/spec.md
 * §"Prompt schema for the LLM part": the LLM only maps a raw charge
 * description into the input contract:
 *   { "jurisdiction": "NY", "chargeClass": "felony_class_D",
 *     "charge": "Criminal possession of stolen property, 4th degree",
 *     "filedOn": "2026-11-02",
 *     "client": { "priorConvictions": 1, "detained": true },
 *     "uncertain": [ { "field": "chargeClass",
 *                      "candidates": ["felony_class_D", "felony_class_E"],
 *                      "reason": "degree depends on value of property" } ] }
 *
 * Hard rules (load-bearing): when the class is uncertain, chargeClass is null
 * and uncertain[] carries the candidates — realityCheckMulti (deterministic
 * core) runs once per candidate and never collapses uncertainty into one
 * guess. Dates are copied as stated (ISO) or null — never computed, never
 * guessed. Client facts only when the document states them.
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

const CLIENT_KEYS = ["priorConvictions", "detained", "counselAtArraignment", "evidenceIssues", "diversionEligible"] as const;

export interface ExtractedChargeFacts {
  jurisdiction: string | null;
  chargeClass: string | null;
  charge: string | null;
  filedOn: string | null;
  client: Partial<Record<typeof CLIENT_KEYS[number], number | boolean>> | null;
  uncertain: { field: string; candidates: string[]; reason: string }[];
}

/** Validated criminal-charge-reality-check extraction — exact shape, null-not-guess, uncertainty surfaced. */
export function validateCriminalChargeRealityCheck(v: unknown): Valid<ExtractedChargeFacts> | null {
  if (!isPlainObject(v) || !exactKeys(v, ["jurisdiction", "chargeClass", "charge", "filedOn", "client", "uncertain"])) return null;
  let jurisdiction: string | null = null;
  if (v.jurisdiction !== null) {
    jurisdiction = str(v.jurisdiction, 2, 64);
    if (!jurisdiction) return null;
  }
  let chargeClass: string | null = null;
  if (v.chargeClass !== null) {
    chargeClass = str(v.chargeClass, 3, 64);
    if (!chargeClass) return null;
  }
  let charge: string | null = null;
  if (v.charge !== null) {
    charge = str(v.charge, 1, 300);
    if (!charge) return null;
  }
  const filedOn = isoOrNull(v.filedOn);
  if (filedOn === null && v.filedOn !== null) return null;
  let client: ExtractedChargeFacts["client"] = null;
  if (v.client !== null) {
    if (!isPlainObject(v.client)) return null;
    const c: Record<string, number | boolean> = {};
    for (const [k, val] of Object.entries(v.client)) {
      if (!(CLIENT_KEYS as readonly string[]).includes(k)) return null; // unknown client fact — refuse, never guess a shape
      if (k === "priorConvictions") {
        if (typeof val !== "number" || !Number.isInteger(val) || val < 0) return null;
        c[k] = val;
      } else {
        if (typeof val !== "boolean") return null;
        c[k] = val;
      }
    }
    client = c;
  }
  if (!Array.isArray(v.uncertain) || v.uncertain.length > 50) return null;
  const uncertain: ExtractedChargeFacts["uncertain"] = [];
  for (const u of v.uncertain) {
    if (!isPlainObject(u) || !exactKeys(u, ["field", "candidates", "reason"])) return null;
    const field = str(u.field, 1, 64);
    if (!field) return null;
    if (!Array.isArray(u.candidates) || u.candidates.length === 0 || u.candidates.length > 10) return null;
    const candidates: string[] = [];
    for (const cand of u.candidates) {
      const s = str(cand, 1, 64);
      if (!s) return null;
      candidates.push(s);
    }
    const reason = str(u.reason, 1, 400);
    if (!reason) return null;
    uncertain.push({ field, candidates, reason });
  }
  return {
    ok: true,
    value: { jurisdiction, chargeClass, charge, filedOn, client, uncertain },
  };
}

export const schema: ExtractSchema = {
  fields: ["jurisdiction", "chargeClass", "charge", "filedOn", "client", "uncertain"],
  system: [
    "You are mapping a raw charging instrument (complaint, information, or filing narrative) into the input contract of a charge reality-check tool. Extract ONLY what the document states.",
    'Schema: { "jurisdiction": "…", "chargeClass": "…|null", "charge": "…", "filedOn": "YYYY-MM-DD"|null, "client": { "priorConvictions": n, "detained": bool, … }|null, "uncertain": [ { "field": "chargeClass", "candidates": ["…","…"], "reason": "…" } ] }.',
    "Copy the charge description, jurisdiction, and client facts verbatim from the document; if a fact is not stated, use null — do not infer.",
    "filedOn must be the filing date as stated, in ISO form (YYYY-MM-DD), or null when the document does not state a parseable date — never compute or guess a date.",
    "When the charge class or degree is uncertain or value-dependent, set chargeClass to null and list every plausible class in uncertain[].candidates with a reason — never collapse uncertainty into one guess: realityCheckMulti runs every candidate in the deterministic core and shows all reports.",
    "Include client only with facts the document states (priorConvictions as an integer count, detained/counselAtArraignment/evidenceIssues/diversionEligible as booleans); omit keys that are not stated.",
    'Set confidence.chargeClass to "low" whenever chargeClass is null or an uncertain[] entry exists, and confidence.filedOn to "low" when the date was hard to read.',
    'Reply with ONLY a JSON object: {"data": { …the schema above… }, "confidence": {"jurisdiction": "high"|"low", "chargeClass": "high"|"low", "charge": "high"|"low", "filedOn": "high"|"low", "client": "high"|"low", "uncertain": "high"|"low"}}.',
  ].join(" "),
  user: (text) => "Charging instrument text (imported from a .docx):\n\n" + text,
  maxTokens: 900,
  validateData: validateCriminalChargeRealityCheck,
};
