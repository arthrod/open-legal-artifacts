/**
 * discovery-response-log — extraction schema for POST /api/extract (Wave W4, class LA).
 *
 * New requests-extraction prompt (reconC §4.3 item 3 — no spec contract existed;
 * the README's prompt covers response DRAFTING, which stays a later phase).
 * Output model follows the spec's DraftEntry request fields:
 *   spec.md §Interface: "requestNo, type: 'interrogatory'|'rfp'|'rfa', requestText".
 * The demo's Apply maps entries onto the discovery-set requests[] (requestText → text).
 *
 * Hard rules (load-bearing): extract ONLY the requests — never draft responses,
 * never suggest objections, never compute deadlines; copy request numbers and
 * request text verbatim; skip instructions/definitions/preamble; type null-not-guess
 * ("other" when genuinely unclear). Response drafting, objection selection and the
 * deadline engine stay with the human + the deterministic core downstream.
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

const TYPES = ["rfp", "interrogatory", "rfa", "other"];

export interface ExtractedRequestEntry {
  requestNo: string;
  type: "rfp" | "interrogatory" | "rfa" | "other";
  requestText: string;
}

/** Validated discovery-response-log extraction — exact shape, verbatim requests only. */
export function validateDiscoveryResponseLog(v: unknown): Valid<{ entries: ExtractedRequestEntry[] }> | null {
  if (!isPlainObject(v) || !exactKeys(v, ["entries"])) return null;
  if (!Array.isArray(v.entries) || v.entries.length > 300) return null;
  const entries: ExtractedRequestEntry[] = [];
  for (const e of v.entries) {
    if (!isPlainObject(e) || !exactKeys(e, ["requestNo", "type", "requestText"])) return null;
    const requestNo = str(e.requestNo, 1, 40);
    if (!requestNo) return null;
    if (typeof e.type !== "string" || !TYPES.includes(e.type)) return null;
    const requestText = str(e.requestText, 4, 4000);
    if (!requestText) return null;
    entries.push({ requestNo, type: e.type as ExtractedRequestEntry["type"], requestText });
  }
  return { ok: true, value: { entries } };
}

export const schema: ExtractSchema = {
  fields: ["entries"],
  system: [
    "You are extracting the written discovery requests from a requests document (interrogatories, requests for production, requests for admission). Extract ONLY the requests — never draft, suggest, or compute responses, objections, or deadlines.",
    'Schema: { "entries": [{ "requestNo": "RFP 1", "type": "rfp"|"interrogatory"|"rfa"|"other", "requestText": "…" }] }.',
    'requestNo: the document\'s own numbering in short form (e.g. "REQUEST FOR PRODUCTION NO. 1" → "RFP 1", "Interrogatory No. 3" → "ROG 3", "Request for Admission No. 12" → "RFA 12") — never invent a number.',
    "requestText: the request's operative text copied verbatim from the document, without the request-number heading.",
    "Skip instructions, definitions, and preamble sections — only numbered requests become entries.",
    'If a request\'s type is not clearly one of rfp, interrogatory, or rfa, use "other" — never guess a type.',
    'Set confidence.entries to "low" when any entry was ambiguous, any text could not be copied verbatim, or requests may have been missed.',
    'Reply with ONLY a JSON object: {"data": {"entries": [{"requestNo": "RFP 1", "type": "rfp", "requestText": "…"}]}, "confidence": {"entries": "high"|"low"}}.',
  ].join(" "),
  user: (text) => "Discovery requests document text (imported from a .docx):\n\n" + text,
  maxTokens: 2000,
  validateData: validateDiscoveryResponseLog,
};
