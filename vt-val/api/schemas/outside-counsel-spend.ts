/**
 * outside-counsel-spend — extraction schema for POST /api/extract (Wave W3,
 * class LA — the non-LEDES invoice path).
 *
 * Prompt contract from open-artifacts/outside-counsel-spend/spec.md §"LLM
 * prompt schema (extraction step, optional, non-LEDES formats)":
 *   task: "Convert the provided invoice lines into ledger-entry JSON."
 *   rules: ["Never invent rates or amounts; copy them from the invoice.",
 *           "Narrative must be verbatim.", "Skip nothing; every line becomes an entry."]
 *
 * Hard rules (load-bearing): rates and amounts are copied from the invoice,
 * never invented; narratives are verbatim; every line becomes an entry. The
 * ledger-entry field set is the core's own IO contract (spec §"IO contract"),
 * which carries `category` for disbursement lines — the spec's abridged
 * output_schema omits it, but the disallowed_expense guideline matches on it,
 * so the extraction includes it (verbatim from the invoice, null when absent).
 * LEDES 1998B text never takes this path — it parses deterministically
 * through core/ledes.js in the demo.
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

/** Full ISO calendar date, calendar-valid (rejects 2026-09-31). */
const isoDay = (v: unknown): boolean => {
  if (typeof v !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return dt.getUTCFullYear() === +m[1] && dt.getUTCMonth() === +m[2] - 1 && dt.getUTCDate() === +m[3];
};

export interface ExtractedLedgerEntry {
  id: string;
  matterId: string | null;
  firmId: string | null;
  period: string;
  date: string;
  timekeeper: string | null;
  level: string | null;
  type: string;
  billing: string;
  hours: number | null;
  rate: number | null;
  amount: number;
  category: string | null;
  narrative: string;
}

/** Validated invoice→ledger extraction — the core's ledger-entry shape. */
export function validateLedger(v: unknown): Valid<{ ledger: ExtractedLedgerEntry[] }> | null {
  if (!isPlainObject(v) || !exactKeys(v, ["ledger"])) return null;
  if (!Array.isArray(v.ledger) || v.ledger.length > 500) return null;
  const ledger: ExtractedLedgerEntry[] = [];
  for (const e of v.ledger) {
    if (!isPlainObject(e) || !exactKeys(e, ["id", "matterId", "firmId", "period", "date", "timekeeper", "level", "type", "billing", "hours", "rate", "amount", "category", "narrative"])) return null;
    const id = str(e.id, 1, 24);
    if (!id) return null;
    const opt = (x: unknown): string | null | false => (x === null ? null : str(x, 1, 64));
    const matterId = opt(e.matterId);
    if (matterId === false) return null;
    const firmId = opt(e.firmId);
    if (firmId === false) return null;
    const timekeeper = opt(e.timekeeper);
    if (timekeeper === false) return null;
    const level = opt(e.level);
    if (level === false) return null;
    const category = opt(e.category);
    if (category === false) return null;
    if (typeof e.period !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(e.period)) return null;
    if (!isoDay(e.date)) return null;
    if (e.type !== "fee" && e.type !== "disbursement") return null;
    if (e.billing !== "hourly" && e.billing !== "flat") return null;
    for (const n of [e.hours, e.rate]) {
      if (n !== null && (typeof n !== "number" || !Number.isFinite(n) || n <= 0 || n > 1e5)) return null; // copied from the invoice or null — a zero/negative rate is an invention
    }
    if (typeof e.amount !== "number" || !Number.isFinite(e.amount) || Math.abs(e.amount) > 1e9) return null; // the line total as printed
    const narrative = str(e.narrative, 1, 600);
    if (!narrative) return null; // verbatim time-entry text, never rewritten
    ledger.push({ id, matterId, firmId, period: e.period, date: e.date as string, timekeeper, level, type: e.type, billing: e.billing, hours: (e.hours as number | null) ?? null, rate: (e.rate as number | null) ?? null, amount: e.amount, category, narrative });
  }
  return { ok: true, value: { ledger } };
}

export const schema: ExtractSchema = {
  fields: ["ledger"],
  system: [
    "Convert the provided invoice lines into ledger-entry JSON. This path is for invoice formats that are not LEDES 1998B — LEDES text is parsed deterministically elsewhere.",
    "Never invent rates or amounts; copy them from the invoice. Narrative must be verbatim. Skip nothing; every line becomes an entry.",
    "id is a stable per-line id in invoice order (L-1, L-2, …); period is YYYY-MM and date is YYYY-MM-DD as printed on the invoice.",
    "type is fee or disbursement; billing is hourly or flat; hours and rate are numbers on hourly fee lines and null otherwise; amount is the line total as printed; category is the disbursement category when the invoice states one, else null.",
    "Firm and matter identifiers are copied as printed; null when the invoice states none.",
    'Set confidence.ledger to "low" when any rate, amount, date, or narrative was hard to read.',
    'Reply with ONLY a JSON object: {"data": {"ledger": [{"id": "L-1", "matterId": "M-210"|null, "firmId": "HPL"|null, "period": "2026-09", "date": "2026-09-03", "timekeeper": "A. Reyes"|null, "level": "partner"|null, "type": "fee", "billing": "hourly", "hours": 4.0|null, "rate": 850|null, "amount": 3400, "category": null, "narrative": "verbatim time-entry text"}]}, "confidence": {"ledger": "high"|"low"}}.',
  ].join(" "),
  user: (text) => "Invoice text (imported from a .docx):\n\n" + text,
  maxTokens: 2500,
  validateData: validateLedger,
};

export default schema;
