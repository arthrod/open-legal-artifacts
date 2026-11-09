/**
 * Strict input validation for the three AI POST routes.
 *
 * Two layers:
 *  - validate<Route>Body — the untrusted request body. Exact-shape only:
 *    expected keys, string types, length bounds, no unknown keys, no arrays,
 *    no null. Anything else is refused with a safe one-line error; raw
 *    internals never reach the client.
 *  - validateAi<Route> — the model's JSON output (the "validates" half of
 *    the JSON-mode helper). Unknown enum values, out-of-range numbers, and
 *    ids outside the offered grounding are refused so a hallucinated
 *    sourceId can never be served as an answer anchor.
 */


// Wave W schema modules (coordinator registration pass — one entry per schemas/*.ts).
// Registered keys must equal the file basename; registry.test.ts enforces both directions.
import { schema as ai_governance_benchmark_schema } from "./schemas/ai-governance-benchmark.ts";
import { schema as ask_legal_schema } from "./schemas/ask-legal.ts";
import { schema as criminal_charge_reality_check_schema } from "./schemas/criminal-charge-reality-check.ts";
import { schema as discovery_response_log_schema } from "./schemas/discovery-response-log.ts";
import { schema as docket_watch_wall_schema } from "./schemas/docket-watch-wall.ts";
import { schema as entity_compliance_calendar_schema } from "./schemas/entity-compliance-calendar.ts";
import { schema as intake_benchmark_schema } from "./schemas/intake-benchmark.ts";
import { schema as intake_queue_schema } from "./schemas/intake-queue.ts";
import { schema as jurisdiction_survey_matrix_schema } from "./schemas/jurisdiction-survey-matrix.ts";
import { schema as limitations_radar_schema } from "./schemas/limitations-radar.ts";
import { schema as litigation_portfolio_schema } from "./schemas/litigation-portfolio.ts";
import { schema as matter_board_schema } from "./schemas/matter-board.ts";
import { schema as outside_counsel_spend_schema } from "./schemas/outside-counsel-spend.ts";
import { schema as privilege_log_builder_schema } from "./schemas/privilege-log-builder.ts";
import { schema as pro_bono_case_board_schema } from "./schemas/pro-bono-case-board.ts";
import { schema as record_clearance_schema } from "./schemas/record-clearance.ts";
import { schema as record_sealing_screener_schema } from "./schemas/record-sealing-screener.ts";
import { schema as regulatory_horizon_scan_schema } from "./schemas/regulatory-horizon-scan.ts";
import { schema as renewal_calendar_schema } from "./schemas/renewal-calendar.ts";
import { schema as sell_side_qa_log_schema } from "./schemas/sell-side-qa-log.ts";
import { schema as subpoena_response_schema } from "./schemas/subpoena-response.ts";

export type Valid<T> = { ok: true; value: T } | { ok: false; error: string };

/** Narrow a Valid<T> to its value (null on failure) — bridge for askJson's validators. */
export function valueOf<T>(r: Valid<T> | null): T | null {
  return r && r.ok ? r.value : null;
}

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

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

/* ---------- request bodies ---------- */

/** POST /api/ask-legal — { question: 4..500 chars } */
export function validateAskLegalBody(v: unknown): Valid<{ question: string }> {
  if (!isPlainObject(v) || !exactKeys(v, ["question"])) return fail("body must be { question: string }");
  const question = str(v.question, 4, 500);
  if (!question) return fail("question must be 4–500 characters");
  return { ok: true, value: { question } };
}

/** POST /api/triage — { text: 4..2000 chars } */
export function validateTriageBody(v: unknown): Valid<{ text: string }> {
  if (!isPlainObject(v) || !exactKeys(v, ["text"])) return fail("body must be { text: string }");
  const text = str(v.text, 4, 2000);
  if (!text) return fail("text must be 4–2000 characters");
  return { ok: true, value: { text } };
}

/** POST /api/prop-support — { quote: 10..2000, proposition: 4..500 } */
export function validatePropSupportBody(v: unknown): Valid<{ quote: string; proposition: string }> {
  if (!isPlainObject(v) || !exactKeys(v, ["quote", "proposition"])) {
    return fail("body must be { quote: string, proposition: string }");
  }
  const quote = str(v.quote, 10, 2000);
  const proposition = str(v.proposition, 4, 500);
  if (!quote || !proposition) return fail("quote must be 10–2000 and proposition 4–500 characters");
  return { ok: true, value: { quote, proposition } };
}

/* ---------- AI output validators ---------- */

export interface AiAskLegal {
  applicable: boolean;
  sourceId: string;
  answer: string;
  level: "high" | "medium" | "low";
  reasons: string[];
}

/** Validated shape of the ask-legal model reply. `ids` = the ids actually offered as grounding. */
export function validateAiAskLegal(v: unknown, ids: string[]): Valid<AiAskLegal> | null {
  if (!isPlainObject(v)) return null;
  if (typeof v.applicable !== "boolean") return null;
  if (!Array.isArray(v.reasons) || v.reasons.length > 6 || !v.reasons.every((r: unknown) => typeof r === "string" && r.length <= 200 && r.trim().length > 0)) return null;
  if (v.applicable) {
    if (typeof v.sourceId !== "string" || !ids.includes(v.sourceId)) return null;
    const answer = str(v.answer, 1, 600);
    if (!answer) return null;
    if (v.level !== "high" && v.level !== "medium" && v.level !== "low") return null;
    return { ok: true, value: { applicable: true, sourceId: v.sourceId, answer, level: v.level, reasons: v.reasons as string[] } };
  }
  // escalation: no sourceId/answer required, level forced low by the caller
  return { ok: true, value: { applicable: false, sourceId: "", answer: "", level: "low", reasons: v.reasons as string[] } };
}

export interface AiTriage {
  issue: string; // may be "none" — the caller escalates on it
  confidence: number; // 0..1
  reason: string;
}

/** Validated shape of the triage model reply. */
export function validateAiTriage(v: unknown): Valid<AiTriage> | null {
  if (!isPlainObject(v)) return null;
  if (!exactKeys(v, ["issue", "confidence", "reason"])) return null;
  if (typeof v.issue !== "string" || v.issue.length === 0 || v.issue.length > 64) return null;
  if (typeof v.confidence !== "number" || !Number.isFinite(v.confidence) || v.confidence < 0 || v.confidence > 1) return null;
  const reason = str(v.reason, 1, 200);
  if (!reason) return null;
  return { ok: true, value: { issue: v.issue, confidence: v.confidence, reason } };
}

export interface AiPropSupport {
  verdict: "supported" | "partial" | "unrelated";
  reason: string;
}

/** Validated shape of the prop-support model reply. */
export function validateAiPropSupport(v: unknown): Valid<AiPropSupport> | null {
  if (!isPlainObject(v)) return null;
  if (!exactKeys(v, ["verdict", "reason"])) return null;
  if (v.verdict !== "supported" && v.verdict !== "partial" && v.verdict !== "unrelated") return null;
  const reason = str(v.reason, 1, 300);
  if (!reason) return null;
  return { ok: true, value: { verdict: v.verdict, reason } };
}

/* ---------- POST /api/extract: body + reply validators + schema registry ---------- */

/** Max characters of document text one extraction may carry (DOCX text is
 *  document-sized; readJsonBody's 32 KB cap does not fit this route). */
export const EXTRACT_TEXT_MAX = 100_000;

/** POST /api/extract — { schema: artifact key slug, text: 4..EXTRACT_TEXT_MAX }. */
export function validateExtractBody(v: unknown): Valid<{ schema: string; text: string }> {
  if (!isPlainObject(v) || !exactKeys(v, ["schema", "text"])) return fail("body must be { schema: string, text: string }");
  if (typeof v.schema !== "string" || !/^[a-z0-9-]{1,64}$/.test(v.schema)) {
    return fail("schema must be an artifact key (lowercase letters, digits, dashes)");
  }
  const text = str(v.text, 4, EXTRACT_TEXT_MAX);
  if (!text) return fail("text must be 4–" + EXTRACT_TEXT_MAX + " characters");
  return { ok: true, value: { schema: v.schema, text } };
}

export interface ExtractReply {
  data: Record<string, unknown>;
  confidence: Record<string, "high" | "low">;
}

/** Structural validator for the model's reply envelope (runs inside askJson
 *  via valueOf, so the repair-retry applies); the per-artifact data validator
 *  runs in the route afterwards. */
export function validateExtractReply(v: unknown): Valid<ExtractReply> | null {
  if (!isPlainObject(v) || !exactKeys(v, ["data", "confidence"])) return null;
  if (!isPlainObject(v.data) || !isPlainObject(v.confidence)) return null;
  for (const val of Object.values(v.confidence)) {
    if (val !== "high" && val !== "low") return null;
  }
  return { ok: true, value: { data: v.data, confidence: v.confidence as Record<string, "high" | "low"> } };
}

/** ISO date forms the cores parse: YYYY, YYYY-MM, YYYY-MM-DD (with ranges). */
function isoLooseDate(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(v);
  if (!m) return false;
  if (m[2] !== undefined && (parseInt(m[2], 10) < 1 || parseInt(m[2], 10) > 12)) return false;
  if (m[3] !== undefined && (parseInt(m[3], 10) < 1 || parseInt(m[3], 10) > 31)) return false;
  return true;
}

export interface ExtractedFact {
  id: string;
  date: string | null;
  dateLabel: string;
  topic: string;
  text: string;
  source: { docId: string; quote: string; pinpoint: string };
}

/** Validated fact-chronology extraction — prompt schema from
 *  open-artifacts/fact-chronology/spec.md: ISO-or-null dates (ambiguity stays
 *  in dateLabel), verbatim quotes, exact keys. */
export function validateExtractFactChronology(v: unknown): Valid<{ facts: ExtractedFact[] }> | null {
  if (!isPlainObject(v) || !exactKeys(v, ["facts"])) return null;
  if (!Array.isArray(v.facts) || v.facts.length > 200) return null;
  const facts: ExtractedFact[] = [];
  for (const f of v.facts) {
    if (!isPlainObject(f) || !exactKeys(f, ["id", "date", "dateLabel", "topic", "text", "source"])) return null;
    const id = str(f.id, 1, 24);
    if (!id) return null;
    if (f.date !== null && !isoLooseDate(f.date)) return null; // ambiguous dates must be dateLabel-only, never guessed
    const dateLabel = f.dateLabel == null ? "" : str(f.dateLabel, 0, 200);
    if (dateLabel === null) return null;
    const topic = str(f.topic, 1, 64);
    if (!topic) return null;
    const text = str(f.text, 1, 600);
    if (!text) return null;
    if (!isPlainObject(f.source) || !exactKeys(f.source, ["docId", "quote", "pinpoint"])) return null;
    const docId = str(f.source.docId, 0, 64);
    if (docId === null) return null;
    const quote = str(f.source.quote, 0, 600);
    if (quote === null) return null;
    const pinpoint = str(f.source.pinpoint, 0, 64);
    if (pinpoint === null) return null;
    facts.push({ id, date: f.date as string | null, dateLabel, topic, text, source: { docId, quote, pinpoint } });
  }
  return { ok: true, value: { facts } };
}

export interface ExtractedObligation {
  id: string;
  clause: string;
  party: string;
  owner: string | null;
  verb: string;
  text: string;
  dueDate: string | null;
  condition: string | null;
  recurrence: { cadence: string; anchor: string } | null;
  amount: number | null;
  sourceQuote: string;
}

/** Validated obligations-checker extraction — prompt schema from
 *  open-artifacts/obligations-checker/spec.md: clause-derived stable ids,
 *  verb enum, recurrence {cadence, anchor}, never-computed dates. */
export function validateExtractObligations(v: unknown): Valid<{ obligations: ExtractedObligation[] }> | null {
  if (!isPlainObject(v) || !exactKeys(v, ["obligations"])) return null;
  if (!Array.isArray(v.obligations) || v.obligations.length > 200) return null;
  const VERBS = ["deliver", "pay", "notify", "return", "maintain", "renew", "other"];
  const CADENCES = ["monthly", "quarterly", "annual"];
  const out: ExtractedObligation[] = [];
  for (const o of v.obligations) {
    if (!isPlainObject(o) || !exactKeys(o, ["id", "clause", "party", "owner", "verb", "text", "dueDate", "condition", "recurrence", "amount", "sourceQuote"])) return null;
    const id = str(o.id, 1, 40);
    if (!id) return null;
    const clause = str(o.clause, 0, 64);
    if (clause === null) return null;
    const party = str(o.party, 1, 100);
    if (!party) return null;
    let owner: string | null = null;
    if (o.owner !== null) {
      owner = str(o.owner, 1, 100);
      if (!owner) return null;
    }
    if (typeof o.verb !== "string" || !VERBS.includes(o.verb)) return null;
    const text = str(o.text, 1, 400);
    if (!text) return null;
    if (o.dueDate !== null && !isoLooseDate(o.dueDate)) return null; // "Never compute a date yourself"
    let condition: string | null = null;
    if (o.condition !== null) {
      condition = str(o.condition, 1, 300);
      if (!condition) return null;
    }
    let recurrence: { cadence: string; anchor: string } | null = null;
    if (o.recurrence !== null) {
      if (!isPlainObject(o.recurrence) || !exactKeys(o.recurrence, ["cadence", "anchor"])) return null;
      if (typeof o.recurrence.cadence !== "string" || !CADENCES.includes(o.recurrence.cadence)) return null;
      if (!isoLooseDate(o.recurrence.anchor)) return null;
      recurrence = { cadence: o.recurrence.cadence, anchor: o.recurrence.anchor as string };
    }
    if (o.amount !== null && (typeof o.amount !== "number" || !Number.isFinite(o.amount) || o.amount < 0 || o.amount > 1e12)) return null;
    const sourceQuote = str(o.sourceQuote, 1, 600);
    if (!sourceQuote) return null;
    out.push({ id, clause, party, owner, verb: o.verb, text, dueDate: o.dueDate as string | null, condition, recurrence, amount: o.amount as number | null, sourceQuote });
  }
  return { ok: true, value: { obligations: out } };
}

/** One registered extraction schema: the artifact's prompt contract (from its
 *  spec.md) plus the validator its `data` must satisfy.
 *  W2 class-L tasks: define your schema in vt-val/api/schemas/<artifact>.ts
 *  exporting an ExtractSchema, then add ONE entry to EXTRACT_SCHEMAS below —
 *  nothing else in the route changes. */
export interface ExtractSchema {
  /** top-level fields of `data` — the per-field confidence key set */
  fields: string[];
  /** system prompt (the artifact's prompt contract) */
  system: string;
  /** user message builder over the imported document text */
  user: (text: string) => string;
  /** max_completion_tokens for the model call */
  maxTokens: number;
  /** validates the model's `data`; null = unusable → route replies INVALID */
  validateData: (v: unknown) => Valid<unknown> | null;
}

export const EXTRACT_SCHEMAS: Record<string, ExtractSchema> = {
  "fact-chronology": {
    fields: ["facts"],
    system: [
      "You structure documents into a dated fact chronology for a legal-team demo.",
      "Extract every dated event as one fact. Never invent dates, quotes, or events.",
      'date must be ISO ("2025-01-09", "2025-01", or "2025") or null — when the document is vague ("Spring 2024", "on or about…"), put the wording in dateLabel, set date null, and never resolve an ambiguous date yourself.',
      "quote must be a verbatim span copied from the document text; if you cannot quote the document for a fact, do not emit that fact.",
      'topic is a short consistent slug per event type (e.g. "termination", "filing", "payment").',
      'source is always { "docId": "imported-docx", "quote": "<verbatim span>", "pinpoint": "<section or paragraph if stated, else empty>" }.',
      'Set confidence.facts to "low" when any date was ambiguous, any quote is not verbatim, or events may have been missed.',
      'Reply with ONLY a JSON object: {"data": {"facts": [{"id": "F1", "date": "2025-01-09"|null, "dateLabel": "…", "topic": "…", "text": "one sentence of fact", "source": {"docId": "imported-docx", "quote": "…", "pinpoint": "…"}}]}, "confidence": {"facts": "high"|"low"}}.',
    ].join(" "),
    user: (text) => "Document text (imported from a .docx):\n\n" + text,
    maxTokens: 1500,
    validateData: validateExtractFactChronology,
  },
  "obligations-checker": {
    fields: ["obligations"],
    system: [
      "Extract every obligation from the contract text.",
      "Copy party names, deadlines, and the source sentence verbatim; normalize ONLY to the shape below.",
      "If a deadline is event-triggered, put the trigger in condition and leave dueDate null.",
      "If a duty recurs, set recurrence from the contract's stated cadence and first due date. Never compute a date yourself.",
      "Ids must be STABLE across re-extractions of the same contract (derive them from the clause citation, e.g. OBL-4-1 for § 4.1) so registers can be diffed.",
      "verb is one of deliver|pay|notify|return|maintain|renew|other; owner and amount are null when not stated.",
      'Set confidence.obligations to "low" when any deadline, party, or cadence was uncertain.',
      'Reply with ONLY a JSON object: {"data": {"obligations": [{"id": "OBL-4-1", "clause": "§ 4.1", "party": "Customer", "owner": "Finance (Customer)"|null, "verb": "pay", "text": "one-sentence obligation", "dueDate": "2026-10-30"|null, "condition": "…"|null, "recurrence": {"cadence": "quarterly", "anchor": "2026-03-31"}|null, "amount": 48000|null, "sourceQuote": "verbatim sentence from the contract"}]}, "confidence": {"obligations": "high"|"low"}}.',
    ].join(" "),
    user: (text) => "Contract text (imported from a .docx):\n\n" + text,
    maxTokens: 1500,
    validateData: validateExtractObligations,
  },
  "ai-governance-benchmark": ai_governance_benchmark_schema,
  "ask-legal": ask_legal_schema,
  "criminal-charge-reality-check": criminal_charge_reality_check_schema,
  "discovery-response-log": discovery_response_log_schema,
  "docket-watch-wall": docket_watch_wall_schema,
  "entity-compliance-calendar": entity_compliance_calendar_schema,
  "intake-benchmark": intake_benchmark_schema,
  "intake-queue": intake_queue_schema,
  "jurisdiction-survey-matrix": jurisdiction_survey_matrix_schema,
  "limitations-radar": limitations_radar_schema,
  "litigation-portfolio": litigation_portfolio_schema,
  "matter-board": matter_board_schema,
  "outside-counsel-spend": outside_counsel_spend_schema,
  "privilege-log-builder": privilege_log_builder_schema,
  "pro-bono-case-board": pro_bono_case_board_schema,
  "record-clearance": record_clearance_schema,
  "record-sealing-screener": record_sealing_screener_schema,
  "regulatory-horizon-scan": regulatory_horizon_scan_schema,
  "renewal-calendar": renewal_calendar_schema,
  "sell-side-qa-log": sell_side_qa_log_schema,
  "subpoena-response": subpoena_response_schema,
};
