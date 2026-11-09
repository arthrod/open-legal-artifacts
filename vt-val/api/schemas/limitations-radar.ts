/**
 * limitations-radar — extraction schema for POST /api/extract (Wave W3, class LA).
 *
 * Prompt contract from open-artifacts/limitations-radar/spec.md §"Prompt
 * schema for the LLM part":
 *   { "claims": [ { "id": "CLM-1", "claimType": "personal_injury", "jurisdiction": "CA",
 *                   "injuryDate": "2025-03-10", "discoveryDate": "2025-04-02",
 *                   "tollingEvents": [] } ],
 *     "uncertain": [ { "claimId": "CLM-1", "field": "claimType",
 *                      "candidates": ["fraud", "breach_of_contract_written"],
 *                      "reason": "pleading not yet characterized" } ] }
 *   "The LLM only extracts claim facts from intake material" …
 *   "Uncertain claims run per candidate (the core is cheap and deterministic);
 *    they are never collapsed into one guess."
 *
 * Hard rules (load-bearing): never compute deadlines; dates are copied as
 * stated or null — never guessed; uncertain claims are listed with their
 * candidate values so the deterministic core can run every candidate.
 * validateData anchors every uncertain entry to a real claim id and refuses
 * candidate-less uncertainty, hanging tolling spans, and non-ISO dates.
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

/** Full ISO calendar date, calendar-valid (rejects 2025-02-30). */
const isoDay = (v: unknown): boolean => {
  if (typeof v !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return dt.getUTCFullYear() === +m[1] && dt.getUTCMonth() === +m[2] - 1 && dt.getUTCDate() === +m[3];
};

export interface ExtractedTollingEvent {
  type: string;
  startDate: string;
  endDate: string | null;
  stillOngoing: boolean | null;
}

export interface ExtractedClaim {
  id: string;
  claimType: string;
  jurisdiction: string;
  injuryDate: string | null;
  discoveryDate: string | null;
  tollingEvents: ExtractedTollingEvent[];
}

export interface ExtractedUncertain {
  claimId: string;
  field: string;
  candidates: string[];
  reason: string;
}

/** Validated limitations-radar extraction: claims + anchored uncertainty. */
export function validateClaims(v: unknown): Valid<{ claims: ExtractedClaim[]; uncertain: ExtractedUncertain[] }> | null {
  if (!isPlainObject(v) || !exactKeys(v, ["claims", "uncertain"])) return null;
  if (!Array.isArray(v.claims) || v.claims.length > 200) return null;
  if (!Array.isArray(v.uncertain) || v.uncertain.length > 200) return null;
  const claims: ExtractedClaim[] = [];
  const ids: string[] = [];
  for (const c of v.claims) {
    if (!isPlainObject(c) || !exactKeys(c, ["id", "claimType", "jurisdiction", "injuryDate", "discoveryDate", "tollingEvents"])) return null;
    const id = str(c.id, 1, 24);
    if (!id) return null;
    const claimType = str(c.claimType, 1, 64);
    if (!claimType) return null;
    const jurisdiction = str(c.jurisdiction, 1, 16);
    if (!jurisdiction) return null; // unknown jurisdictions stay as-stated — the core flags them, never guesses
    if (c.injuryDate !== null && !isoDay(c.injuryDate)) return null; // never guess a date
    if (c.discoveryDate !== null && !isoDay(c.discoveryDate)) return null;
    if (!Array.isArray(c.tollingEvents) || c.tollingEvents.length > 20) return null;
    const tollingEvents: ExtractedTollingEvent[] = [];
    for (const t of c.tollingEvents) {
      if (!isPlainObject(t) || !exactKeys(t, ["type", "startDate", "endDate", "stillOngoing"])) return null;
      const type = str(t.type, 1, 64);
      if (!type) return null;
      if (!isoDay(t.startDate)) return null;
      if (t.endDate !== null && !isoDay(t.endDate)) return null;
      if (t.stillOngoing !== null && t.stillOngoing !== true) return null;
      if (t.endDate === null && t.stillOngoing !== true) return null; // a span needs an end or is ongoing — never a silent zero
      tollingEvents.push({ type, startDate: t.startDate as string, endDate: (t.endDate as string | null) ?? null, stillOngoing: (t.stillOngoing as boolean | null) ?? null });
    }
    ids.push(id);
    claims.push({ id, claimType, jurisdiction, injuryDate: (c.injuryDate as string | null) ?? null, discoveryDate: (c.discoveryDate as string | null) ?? null, tollingEvents });
  }
  const uncertain: ExtractedUncertain[] = [];
  for (const u of v.uncertain) {
    if (!isPlainObject(u) || !exactKeys(u, ["claimId", "field", "candidates", "reason"])) return null;
    const claimId = str(u.claimId, 1, 24);
    if (!claimId || !ids.includes(claimId)) return null; // uncertainty anchors a real claim
    const field = str(u.field, 1, 32);
    if (!field) return null;
    if (!Array.isArray(u.candidates) || u.candidates.length < 1 || u.candidates.length > 6) return null; // never collapsed, never empty
    const candidates: string[] = [];
    for (const cand of u.candidates) {
      const s = str(cand, 1, 64);
      if (!s) return null;
      candidates.push(s);
    }
    const reason = str(u.reason, 1, 300);
    if (!reason) return null;
    uncertain.push({ claimId, field, candidates, reason });
  }
  return { ok: true, value: { claims, uncertain } };
}

export const schema: ExtractSchema = {
  fields: ["claims", "uncertain"],
  system: [
    "You extract claim facts from intake material (an intake note or a complaint) for a statute-of-limitations radar. You never compute deadlines — the deterministic core owns that math.",
    "Copy claim types, jurisdictions, and dates as stated; dates are ISO YYYY-MM-DD or null when the document does not clearly state one — never guess a date.",
    "tollingEvents carry only tolling the document states, with startDate and endDate, or stillOngoing true when the document says the stay is still in effect.",
    "When a claim's claimType, jurisdiction, or dates are ambiguous, keep your best reading in claims AND list the ambiguity in uncertain with the candidate values — uncertain claims are run per candidate downstream and are never collapsed into one guess.",
    'Set confidence.claims to "low" when any date was unclear or a claim may have been missed, and confidence.uncertain the same.',
    'Reply with ONLY a JSON object: {"data": {"claims": [{"id": "CLM-1", "claimType": "personal_injury", "jurisdiction": "CA", "injuryDate": "2025-03-10"|null, "discoveryDate": "2025-04-02"|null, "tollingEvents": [{"type": "bankruptcy_stay", "startDate": "2022-09-01", "endDate": "2023-05-01", "stillOngoing": null}]}], "uncertain": [{"claimId": "CLM-1", "field": "claimType", "candidates": ["fraud", "breach_of_contract_written"], "reason": "pleading not yet characterized"}]|[]}, "confidence": {"claims": "high"|"low", "uncertain": "high"|"low"}}.',
  ].join(" "),
  user: (text) => "Intake / complaint text (imported from a .docx):\n\n" + text,
  maxTokens: 1500,
  validateData: validateClaims,
};

export default schema;
