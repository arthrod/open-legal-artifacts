/**
 * litigation-portfolio — extraction schema for POST /api/extract (Wave W3,
 * class LA).
 *
 * Prompt contract from open-artifacts/litigation-portfolio/spec.md §"Prompt
 * schema for the LLM part (input prep only)":
 *   System: "Extract matter metadata for a litigation portfolio. Fictional-safe.
 *            Never compute deadlines."
 *   { "matters": [ { "id", "name", "client", "claimType", "accrualDate",
 *                    "discoveryDate", "tollingEvents", "exposureLow",
 *                    "exposureHigh", "exposureBasis" } ] }
 *   claimType: "must be a key from claimRules or a new key flagged for attorney
 *              mapping"; exposureBasis: "verbatim quote from the estimate memo".
 *
 * Hard rules (load-bearing): the LLM only fills this shape — deadline
 * arithmetic stays in the core; dates come from the documents or are null;
 * exposureBasis is a verbatim quote or null. validateData refuses anything
 * not exactly the spec's matter shape (portfolio fields like counsel/venue
 * are the attorney's, not the model's).
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

/** Full ISO calendar date, calendar-valid (rejects 2025-09-31). */
const isoDay = (v: unknown): boolean => {
  if (typeof v !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return dt.getUTCFullYear() === +m[1] && dt.getUTCMonth() === +m[2] - 1 && dt.getUTCDate() === +m[3];
};

export interface ExtractedTolling {
  from: string;
  to: string;
  reason: string;
  source: string;
}

export interface ExtractedMatter {
  id: string;
  name: string;
  client: string;
  claimType: string;
  accrualDate: string | null;
  discoveryDate: string | null;
  tollingEvents: ExtractedTolling[];
  exposureLow: number | null;
  exposureHigh: number | null;
  exposureBasis: string | null;
}

/** Validated litigation-portfolio extraction — the spec's matter shape only. */
export function validateMatters(v: unknown): Valid<{ matters: ExtractedMatter[] }> | null {
  if (!isPlainObject(v) || !exactKeys(v, ["matters"])) return null;
  if (!Array.isArray(v.matters) || v.matters.length > 200) return null;
  const matters: ExtractedMatter[] = [];
  for (const m of v.matters) {
    if (!isPlainObject(m) || !exactKeys(m, ["id", "name", "client", "claimType", "accrualDate", "discoveryDate", "tollingEvents", "exposureLow", "exposureHigh", "exposureBasis"])) return null;
    const id = str(m.id, 1, 32);
    if (!id) return null;
    const name = str(m.name, 1, 200);
    if (!name) return null;
    const client = str(m.client, 1, 200);
    if (!client) return null;
    const claimType = str(m.claimType, 1, 64);
    if (!claimType) return null; // a claimRules key or a new key — the core flags unknown keys for attorney mapping
    if (m.accrualDate !== null && !isoDay(m.accrualDate)) return null; // from the documents or null — never inferred
    if (m.discoveryDate !== null && !isoDay(m.discoveryDate)) return null;
    if (!Array.isArray(m.tollingEvents) || m.tollingEvents.length > 20) return null;
    const tollingEvents: ExtractedTolling[] = [];
    for (const t of m.tollingEvents) {
      if (!isPlainObject(t) || !exactKeys(t, ["from", "to", "reason", "source"])) return null;
      if (!isoDay(t.from) || !isoDay(t.to)) return null;
      const reason = str(t.reason, 1, 300);
      if (!reason) return null;
      const source = str(t.source, 0, 64);
      if (source === null) return null;
      tollingEvents.push({ from: t.from as string, to: t.to as string, reason, source });
    }
    for (const n of [m.exposureLow, m.exposureHigh]) {
      if (n !== null && (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 1e12)) return null; // copied from the memo or null
    }
    let exposureBasis: string | null = null;
    if (m.exposureBasis !== null) {
      exposureBasis = str(m.exposureBasis, 1, 600);
      if (!exposureBasis) return null; // a verbatim quote from the estimate memo
    }
    matters.push({ id, name, client, claimType, accrualDate: (m.accrualDate as string | null) ?? null, discoveryDate: (m.discoveryDate as string | null) ?? null, tollingEvents, exposureLow: (m.exposureLow as number | null) ?? null, exposureHigh: (m.exposureHigh as number | null) ?? null, exposureBasis });
  }
  return { ok: true, value: { matters } };
}

export const schema: ExtractSchema = {
  fields: ["matters"],
  system: [
    "Extract matter metadata for a litigation portfolio. Fictional-safe. Never compute deadlines. Deadline arithmetic stays in the deterministic core.",
    "The documents are a complaint and/or an estimate memo imported from a .docx. Copy matter names, client names, and dates as stated; accrualDate and discoveryDate are ISO YYYY-MM-DD from the documents or null when not stated — never inferred.",
    "claimType must be a key from claimRules or a new key flagged for attorney mapping; when the pleading does not clearly characterize the claim, use your closest reading — the core flags unknown keys rather than guessing.",
    "tollingEvents carry only tolling the documents state, each with from/to ISO dates, a reason, and a source (doc id ¶).",
    "exposureLow and exposureHigh are numbers copied from the estimate memo or null; exposureBasis is a verbatim quote from the estimate memo supporting the range, or null when the memo states no estimate.",
    "Portfolio fields the documents do not state (counsel, venue, status, reserves) are not extracted — absence is reported by the core, never guessed.",
    'Set confidence.matters to "low" when any date, name, or exposure figure was uncertain or matters may have been missed.',
    'Reply with ONLY a JSON object: {"data": {"matters": [{"id": "LIT-2026-014", "name": "…", "client": "…", "claimType": "breach-of-written-contract", "accrualDate": "2025-09-12"|null, "discoveryDate": null, "tollingEvents": [{"from": "2022-09-01", "to": "2023-05-01", "reason": "bankruptcy stay", "source": "MEMO-1 ¶4"}], "exposureLow": 120000|null, "exposureHigh": 340000|null, "exposureBasis": "verbatim quote from the estimate memo"|null}]}, "confidence": {"matters": "high"|"low"}}.',
  ].join(" "),
  user: (text) => "Complaint / estimate-memo text (imported from a .docx):\n\n" + text,
  maxTokens: 1500,
  validateData: validateMatters,
};

export default schema;
