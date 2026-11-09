/**
 * record-clearance — extraction schema for POST /api/extract (Wave W5, class LA).
 *
 * Prompt contract from open-artifacts/record-clearance/spec.md §"Prompt schema
 * for the LLM part": the LLM only structures a rap sheet into the intake
 * contract —
 *   { "client": { "probationStatus": "completed", "finesPaid": true, ... },
 *     "convictions": [ { "id": "V1", "offense": "…", "offenseCategory": "fraud",
 *                        "sentenceCompletedDate": "2020-08-21" } ],
 *     "uncertain": [ { "field": "finesPaid", "reason": "rap sheet shows
 *                      balance, amount unclear" } ] }
 *   "Fields in `uncertain` must be omitted from the record —
 *    core.validateIntake implements this contract: … drops each `uncertain`
 *    field from the client and every conviction … the engine then converts
 *    the gaps to `unknown` checklist rows rather than letting the model guess."
 *
 * The demo (demo/index.html apply handler) runs the returned draft through
 * the deterministic `validateIntake` post-gate, so this validator accepts
 * exactly that shape: client/conviction keys limited to the core's
 * CLIENT_KEYS/CONVICTION_KEYS, dates ISO-or-null (never guessed), booleans
 * boolean-or-null, and every `uncertain` entry naming a recognized field.
 */
import type { ExtractSchema, Valid } from "../validate.ts";

/* ---------- local strict helpers (validate.ts keeps its own private set) ---------- */

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Full ISO calendar date, calendar-valid (rejects 2025-02-30). */
const isoDay = (v: unknown): boolean => {
  if (typeof v !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return dt.getUTCFullYear() === +m[1] && dt.getUTCMonth() === +m[2] - 1 && dt.getUTCDate() === +m[3];
};

/** String of length [min,max] after trim; null otherwise. */
const str = (v: unknown, min: number, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length >= min && s.length <= max ? s : null;
};

/** Key sets mirror the core's CLIENT_KEYS / CONVICTION_KEYS exactly
 * (open-artifacts/record-clearance/core/core.js ~494-497) — the deterministic
 * gate only ever reads these, so anything else is model drift. */
export const CLIENT_KEYS = ["id", "name", "probationStatus", "finesPaid", "pendingCases", "rapSheetObtained"] as const;
export const CONVICTION_KEYS = [
  "id", "offense", "offenseCategory", "offenseClass", "dispositionDate",
  "sentenceCompletedDate", "probationTerminatedDate", "probationStatus", "finesPaid",
] as const;
const CLIENT_DATE_KEYS: readonly string[] = [];
const CLIENT_BOOL_KEYS = new Set<string>(["finesPaid", "pendingCases", "rapSheetObtained"]);
const CONVICTION_DATE_KEYS = new Set<string>(["dispositionDate", "sentenceCompletedDate", "probationTerminatedDate"]);
const CONVICTION_BOOL_KEYS = new Set<string>(["finesPaid"]);
const ALL_KEYS = new Set<string>([...CLIENT_KEYS, ...CONVICTION_KEYS]);

/** Check one keyed record against its key sets; returns a trimmed copy or
 * null on any unknown key or mistyped value. Values may be null (= unknown,
 * the engine's first-class "unknown" status) — but never a guessed date. */
const pickRecord = (
  v: unknown,
  allowed: readonly string[],
  boolKeys: Set<string>,
  dateKeys: Set<string>,
): Record<string, unknown> | null => {
  if (!isPlainObject(v)) return null;
  const out: Record<string, unknown> = {};
  for (const [k, raw] of Object.entries(v)) {
    if (!allowed.includes(k)) return null; // unknown key = model drift, refuse the whole draft
    if (raw === null) {
      out[k] = null;
      continue;
    }
    if (boolKeys.has(k)) {
      if (typeof raw !== "boolean") return null;
      out[k] = raw;
      continue;
    }
    if (dateKeys.has(k)) {
      if (!isoDay(raw)) return null; // never a guessed or partial date
      out[k] = raw;
      continue;
    }
    const s = str(raw, 1, 200); // offense text, categories, names — copied as stated
    if (s === null) return null;
    out[k] = s;
  }
  return out;
};

export interface ExtractedClearance {
  client: Record<string, unknown>;
  convictions: Record<string, unknown>[];
  uncertain: { field: string; reason: string }[];
}

/** Validated record-clearance extraction: client facts + convictions +
 * uncertainty the deterministic gate will apply. */
export function validateClearanceIntake(v: unknown): Valid<ExtractedClearance> | null {
  if (!isPlainObject(v)) return null;
  if (!("client" in v && "convictions" in v && "uncertain" in v)) return null;
  if (Object.keys(v).length !== 3) return null;
  const client = pickRecord(v.client, CLIENT_KEYS, CLIENT_BOOL_KEYS, new Set(CLIENT_DATE_KEYS));
  if (client === null) return null;
  if (!Array.isArray(v.convictions) || v.convictions.length > 200) return null;
  const convictions: Record<string, unknown>[] = [];
  for (const c of v.convictions) {
    const norm = pickRecord(c, CONVICTION_KEYS, CONVICTION_BOOL_KEYS, CONVICTION_DATE_KEYS);
    if (norm === null) return null;
    if (Object.keys(norm).length === 0) return null; // an empty conviction carries nothing — refuse
    convictions.push(norm);
  }
  if (!Array.isArray(v.uncertain) || v.uncertain.length > 200) return null;
  const uncertain: { field: string; reason: string }[] = [];
  for (const u of v.uncertain) {
    if (!isPlainObject(u) || Object.keys(u).length !== 2 || !("field" in u) || !("reason" in u)) return null;
    const field = str(u.field, 1, 32);
    const reason = str(u.reason, 1, 300);
    if (field === null || reason === null) return null;
    if (!ALL_KEYS.has(field)) return null; // uncertainty must name a real client/conviction field
    uncertain.push({ field, reason });
  }
  return { ok: true, value: { client, convictions, uncertain } };
}

export const schema: ExtractSchema = {
  fields: ["client", "convictions", "uncertain"],
  system: [
    "You structure a rap sheet (imported from a .docx) into the intake contract for a record-clearance tracker. You only extract — the deterministic engine owns every eligibility call and all date math.",
    'Copy client facts into "client" using only these keys: id, name, probationStatus, finesPaid, pendingCases, rapSheetObtained. Copy each conviction into "convictions" using only: id, offense, offenseCategory, offenseClass, dispositionDate, sentenceCompletedDate, probationTerminatedDate, probationStatus, finesPaid.',
    "Copy offense descriptions, categories, classes, and statuses as stated on the rap sheet — never reclassify, never canonicalize wording. Dates are ISO YYYY-MM-DD exactly as printed, or null — never interpret, complete, or compute a date.",
    "Never guess: when a field is absent, ambiguous, or unreadable, omit it from the record AND list it in \"uncertain\" as {\"field\": ..., \"reason\": ...} — the deterministic gate drops uncertain fields and the engine converts the gaps into unknown checklist rows, which is the correct output.",
    "Fields listed in uncertain must be omitted from client and convictions entirely.",
    'Set confidence.client to "low" when any client fact was unclear or omitted, confidence.convictions to "low" when a conviction may have been missed or any of its fields were unclear, and confidence.uncertain to "high" when you are confident the uncertain list is complete.',
    'Reply with ONLY a JSON object: {"data": {"client": {"probationStatus": "completed"|"on probation"|null, "finesPaid": true|false|null, "pendingCases": true|false|null, "rapSheetObtained": true|false|null}, "convictions": [{"id": "V1", "offense": "…", "offenseCategory": "fraud"|null, "offenseClass": null, "dispositionDate": "2020-08-21"|null, "sentenceCompletedDate": null, "probationTerminatedDate": null, "probationStatus": null, "finesPaid": null}], "uncertain": [{"field": "finesPaid", "reason": "rap sheet shows balance, amount unclear"}]}, "confidence": {"client": "high"|"low", "convictions": "high"|"low", "uncertain": "high"|"low"}}. Use only the keys each record actually states; omit nothing you can copy verbatim.',
  ].join(" "),
  user: (text) => "Rap-sheet text (imported from a .docx):\n\n" + text,
  maxTokens: 1500,
  validateData: validateClearanceIntake,
};

export default schema;
