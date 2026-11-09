/**
 * privilege-log-builder — extraction schema for POST /api/extract (Wave W4, class LA).
 *
 * Prompt contract from open-artifacts/privilege-log-builder/spec.md §"Prompt schema
 * for the LLM part":
 *   "The LLM only extracts metadata from raw documents:"
 *   { "documents": [ { "id", "date", "docType", "author": {"name","role"},
 *     "recipients": [{"name","role"}], "subject", "anticipationOfLitigation" } ],
 *     "uncertain": [ { "docId", "field", "candidates", "reason" } ] }
 *   "Uncertain roles land in `uncertain`, and those documents get
 *    `incomplete_entry`-style review flags rather than a guessed inference."
 *
 * Hard rules (load-bearing): the LLM never decides privilege (inference is
 * deterministic metadata heuristics downstream); roles come from the core's
 * INFERENCE_RULES vocabulary or stay null with an `uncertain` entry — never a
 * guess; names/subjects copied verbatim; dates ISO or null when not stated.
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

/** Role vocabulary from the core's INFERENCE_RULES (attorney/client/third-party sides). */
export const ROLES = ["attorney", "paralegal", "client", "corporate_officer", "third_party", "vendor", "opposing_counsel", "expert"];

export interface ExtractedPrivilegeDoc {
  id: string;
  date: string | null;
  docType: string;
  author: { name: string; role: string | null };
  recipients: { name: string; role: string | null }[];
  subject: string | null;
  anticipationOfLitigation: boolean | null;
}

export interface ExtractedPrivilege {
  documents: ExtractedPrivilegeDoc[];
  uncertain: { docId: string; field: string; candidates: string[]; reason: string }[];
}

const person = (p: unknown): { name: string; role: string | null } | null => {
  if (!isPlainObject(p) || !exactKeys(p, ["name", "role"])) return null;
  const name = str(p.name, 1, 120);
  if (!name) return null;
  let role: string | null = null;
  if (p.role !== null) {
    if (typeof p.role !== "string" || !ROLES.includes(p.role)) return null; // unknown role → null + uncertain, never a guess
    role = p.role;
  }
  return { name, role };
};

/** Validated privilege-log-builder extraction — exact shape, roles-or-null, uncertain[] surfaced. */
export function validatePrivilegeLog(v: unknown): Valid<ExtractedPrivilege> | null {
  if (!isPlainObject(v) || !exactKeys(v, ["documents", "uncertain"])) return null;
  if (!Array.isArray(v.documents) || v.documents.length === 0 || v.documents.length > 500) return null;
  const documents: ExtractedPrivilegeDoc[] = [];
  for (const d of v.documents) {
    if (!isPlainObject(d) || !exactKeys(d, ["id", "date", "docType", "author", "recipients", "subject", "anticipationOfLitigation"])) return null;
    const id = str(d.id, 1, 40);
    if (!id) return null;
    const date = isoOrNull(d.date);
    if (date === null && d.date !== null) return null;
    const docType = str(d.docType, 1, 40);
    if (!docType) return null;
    const author = person(d.author);
    if (!author) return null;
    if (!Array.isArray(d.recipients) || d.recipients.length > 100) return null;
    const recipients: { name: string; role: string | null }[] = [];
    for (const r of d.recipients) {
      const p = person(r);
      if (!p) return null;
      recipients.push(p);
    }
    let subject: string | null = null;
    if (d.subject !== null) {
      subject = str(d.subject, 1, 300);
      if (!subject) return null;
    }
    if (d.anticipationOfLitigation !== null && typeof d.anticipationOfLitigation !== "boolean") return null;
    documents.push({ id, date, docType, author, recipients, subject, anticipationOfLitigation: d.anticipationOfLitigation as boolean | null });
  }
  if (!Array.isArray(v.uncertain) || v.uncertain.length > 200) return null;
  const uncertain: ExtractedPrivilege["uncertain"] = [];
  for (const u of v.uncertain) {
    if (!isPlainObject(u) || !exactKeys(u, ["docId", "field", "candidates", "reason"])) return null;
    const docId = str(u.docId, 1, 40);
    if (!docId) return null;
    const field = str(u.field, 1, 40);
    if (!field) return null;
    if (!Array.isArray(u.candidates) || u.candidates.length === 0 || u.candidates.length > 8) return null;
    const candidates: string[] = [];
    for (const c of u.candidates) {
      const cand = str(c, 1, 60);
      if (!cand) return null;
      candidates.push(cand);
    }
    const reason = str(u.reason, 1, 300);
    if (!reason) return null;
    uncertain.push({ docId, field, candidates, reason });
  }
  return { ok: true, value: { documents, uncertain } };
}

export const schema: ExtractSchema = {
  fields: ["documents", "uncertain"],
  system: [
    "You extract document metadata from emails and memos for a privilege log draft.",
    "The LLM only extracts metadata from raw documents — it never decides privilege; privilege types are inferred downstream by deterministic metadata heuristics.",
    'documents[]: { "id", "date", "docType", "author": {"name","role"}, "recipients": [{"name","role"}], "subject", "anticipationOfLitigation" }.',
    "Copy names, subjects, and dates verbatim; dates as ISO YYYY-MM-DD or null when not stated.",
    "role is one of: " + ROLES.join(", ") + " — when a person's role is not clearly determinable from the document, leave role null and list the document in uncertain; never guess an inference.",
    "anticipationOfLitigation is true only when the document itself shows it (e.g. prepared-in-anticipation language), else null.",
    'uncertain[]: { "docId", "field", "candidates", "reason" } — every field you could not determine; those documents get incomplete-entry review flags downstream.',
    'Set confidence.documents to "low" when any role or date was uncertain.',
    'Reply with ONLY a JSON object: {"data": {"documents": […], "uncertain": […]}, "confidence": {"documents": "high"|"low", "uncertain": "high"|"low"}}.',
  ].join(" "),
  user: (text) => "Email / memo document text (imported from a .docx):\n\n" + text,
  maxTokens: 2000,
  validateData: validatePrivilegeLog,
};
