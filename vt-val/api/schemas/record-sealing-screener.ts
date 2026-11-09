/**
 * record-sealing-screener — extraction schema for POST /api/extract
 * (Wave W5, class LA).
 *
 * The demo (demo/index.html) does NOT want the spec's intermediate cases[]
 * JSON — it normalizes an arbitrary-format rap sheet DIRECTLY into the
 * documented paste-format text (spec.md §"rap-sheet paste format") that the
 * deterministic `parseRapSheet` grammar consumes:
 *   JURISDICTION: CA
 *   CASE C1 (2015-CF-00421)
 *   OFFENSE: Possession of a controlled substance
 *   CATEGORY: drug_possession
 *   CLASS: misdemeanor
 *   DISPOSITION: conviction
 *   OFFENSE DATE: 2015-04-02
 *   DISPOSITION DATE: 2015-09-10
 *   SENTENCE COMPLETED: 2016-03-01
 *   FINE PAID: yes
 *   PENDING: no
 * Spec hard rule (§"Prompt schema for the LLM part"): "Unmapped or uncertain
 * fields must be omitted (not guessed) — the engine turns omissions into
 * insufficient_data flags."
 *
 * So `data` is a single { text } field: the normalized paste text. The
 * validator is itself a deterministic grammar gate — every line that does not
 * match the documented grammar (the unmapped content the spec says to omit)
 * is DROPPED, never passed through; a result with no grammar-valid line at
 * all is refused. Dates must be unambiguous ISO YYYY-MM-DD; dispositions must
 * be one of the six known values; FINE PAID / PENDING only as stated.
 */
import type { ExtractSchema, Valid } from "../validate.ts";

/* ---------- local strict helpers (validate.ts keeps its own private set) ---------- */

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Calendar-valid ISO day — mirrors the core's parseDate acceptance. */
const isoDay = (s: string): boolean => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return dt.getUTCFullYear() === +m[1] && dt.getUTCMonth() === +m[2] - 1 && dt.getUTCDate() === +m[3];
};

/** Known DISPOSITION values (RAP_KNOWN_DISPOSITIONS in core/core.js). */
export const KNOWN_DISPOSITIONS = new Set([
  "conviction", "acquittal", "dismissed", "nolle_prosequi", "deferred_adjudication", "unknown",
]);

const CASE_HEADER = /^CASE\s+(\S+)(?:\s+\((.+)\))?\s*$/;
const KV = /^([A-Z][A-Z ]*?):\s*(\S.*)$/;
const DATE_KEYS = new Set(["OFFENSE DATE", "DISPOSITION DATE", "SENTENCE COMPLETED"]);

/**
 * Does ONE trimmed line belong to the documented paste grammar?
 * Mirrors parseRapSheet's line rules exactly (core/core.js parseRapSheet).
 */
export function isGrammarLine(line: string): boolean {
  if (CASE_HEADER.test(line)) return true;
  const kv = KV.exec(line);
  if (!kv) return false;
  const [, key, v] = kv;
  const val = v.trim();
  switch (key) {
    case "JURISDICTION":
      return /^[A-Z]{2}$/.test(val);
    case "OFFENSE":
    case "CATEGORY":
    case "CLASS":
      return true; // copied as stated — the core treats them as plain strings
    case "DISPOSITION":
      return KNOWN_DISPOSITIONS.has(val);
    case "FINE PAID":
    case "PENDING":
      return /^(yes|no)$/i.test(val);
    default:
      if (DATE_KEYS.has(key)) return isoDay(val);
      return false; // any other key is unmapped — omitted per the spec
  }
}

/** Deterministic grammar gate over a model-supplied normalization. */
export function validateNormalizedRapText(v: unknown): Valid<{ text: string }> | null {
  if (!isPlainObject(v) || Object.keys(v).length !== 1 || !("text" in v)) return null;
  if (typeof v.text !== "string") return null;
  if (v.text.length > 20_000) return null;
  const lines = v.text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const kept = lines.filter(isGrammarLine); // unmapped/uncertain lines are OMITTED, never passed through
  if (kept.length === 0) return null; // nothing grammar-valid — refuse rather than serve a guess
  return { ok: true, value: { text: kept.join("\n") } };
}

export const schema: ExtractSchema = {
  fields: ["text"],
  system: [
    "You normalize an arbitrary-format rap sheet (imported from a .docx) into the documented paste format of a deterministic record-sealing screener. You only reformat — the parser and eligibility engine are deterministic and own every decision.",
    "Output format, one item per line, exactly: JURISDICTION: <2-letter code> on its own line when the jurisdiction is clear; then for each case a line CASE <id> optionally followed by ( <case number> in parentheses ), followed by that case's field lines: OFFENSE: <verbatim offense description>, CATEGORY: <offense category as stated>, CLASS: <offense class as stated>, DISPOSITION: <one of conviction, acquittal, dismissed, nolle_prosequi, deferred_adjudication, unknown>, OFFENSE DATE: <YYYY-MM-DD>, DISPOSITION DATE: <YYYY-MM-DD>, SENTENCE COMPLETED: <YYYY-MM-DD>, FINE PAID: yes|no, PENDING: yes|no.",
    "Copy offense descriptions, categories, and classes verbatim — never reclassify. Dates go in ONLY when the document states them unambiguously and you can render them exactly as YYYY-MM-DD; a partial, ambiguous, or unreadable date is OMITTED, never guessed — omitted fields surface as insufficient_data downstream, which is the correct output.",
    "DISPOSITION goes in ONLY when the document's wording clearly matches one of the six values; otherwise omit the line. FINE PAID and PENDING only when the document states them.",
    "Anything you cannot map (narrative notes, conditions of release, unparseable lines) is simply left out — never paraphrased into a field.",
    'Set confidence.text to "low" when any case, date, or disposition was ambiguous, partial, or had to be omitted.',
    'Reply with ONLY a JSON object: {"data": {"text": "JURISDICTION: CA\\nCASE C1\\nOFFENSE: …\\nDISPOSITION: conviction\\nOFFENSE DATE: 2015-04-02\\n…"}, "confidence": {"text": "high"|"low"}} — the text value is the multi-line paste-format normalization.',
  ].join(" "),
  user: (text) => "Rap-sheet text in an arbitrary format (imported from a .docx):\n\n" + text,
  maxTokens: 1500,
  validateData: validateNormalizedRapText,
};

export default schema;
