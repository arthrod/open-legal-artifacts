/**
 * jurisdiction-survey-matrix — survey-memo extraction schema for POST /api/extract
 * (Wave W7). The spec's "LLM prompt schema (research-draft step, optional)" ADAPTED
 * to memo extraction per reconC §4.3: the spec prompt researches one cell from
 * nothing; here the memo itself is the input and the model lifts cells out of it.
 * Hard rules carried over verbatim-ish: quote verbatim, never paraphrase into a
 * citation, never estimate dates/thresholds/penalties, silence when the memo gives
 * no authoritative basis. Every imported cell lands UNVERIFIED — verifiedBy and the
 * verification date stay human (the core classifies dateless cells as unverified).
 * Registered by the coordinator after the wave (validate.ts EXTRACT_SCHEMAS).
 */
import type { ExtractSchema, Valid } from "../validate.ts";

export interface SurveyCell {
  jurisdiction: string;
  question: string;
  answer: string;
  citation: string;
  quotedText: string;
  sourceUrl: string;
}

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

/** Validated survey-memo cell extraction — exact keys, non-empty jurisdiction/
 *  question/citation, verbatim-carrying quotedText, no verifiedBy anywhere (that
 *  field does not exist in this shape). null = unusable → the route replies INVALID. */
export function validateSurveyCells(v: unknown): Valid<{ cells: SurveyCell[] }> | null {
  if (!isPlainObject(v) || !exactKeys(v, ["cells"])) return null;
  if (!Array.isArray(v.cells) || v.cells.length > 300) return null;
  const out: SurveyCell[] = [];
  for (const c of v.cells) {
    if (!isPlainObject(c) || !exactKeys(c, ["jurisdiction", "question", "answer", "citation", "quotedText", "sourceUrl"])) return null;
    const jurisdiction = str(c.jurisdiction, 1, 32);
    if (!jurisdiction) return null;
    const question = str(c.question, 1, 120);
    if (!question) return null;
    const answer = str(c.answer, 1, 600);
    if (!answer) return null;
    const citation = str(c.citation, 1, 200);
    if (!citation) return null;
    const quotedText = str(c.quotedText, 0, 600);
    if (quotedText === null) return null;
    const sourceUrl = c.sourceUrl == null ? "" : str(c.sourceUrl, 0, 300);
    if (sourceUrl === null) return null; // scheme safety is downstream: safeUrl only links http(s)
    out.push({ jurisdiction, question, answer, citation, quotedText, sourceUrl });
  }
  return { ok: true, value: { cells: out } };
}

export const schema: ExtractSchema = {
  fields: ["cells"],
  system: [
    "You extract survey cells from an imported jurisdiction-survey memo for the jurisdiction-survey-matrix demo. Output is UNVERIFIED until a human records the citation and verification date.",
    'Each cell is {"jurisdiction", "question", "answer", "citation", "quotedText", "sourceUrl"}: jurisdiction is the memo\'s jurisdiction code (e.g. US-TX); question is the question id or short question label the memo organizes by; answer restates the memo\'s answer; citation is the statute or regulation cite plus pinpoint exactly as the memo gives it.',
    "Quote verbatim text from the memo (or the source it quotes) into quotedText; never paraphrase into a citation.",
    "Never estimate dates, thresholds, or penalties — copy figures exactly as the memo states them; if a value is not stated, leave it out of the answer.",
    "sourceUrl is the http(s) URL the memo cites for the cell, or null when it cites none — never fabricate a URL.",
    "If the memo gives no authoritative basis for a cell, do not emit that cell — silence is correct output.",
    "You never produce a verifier or a verification date — a human records the citation and verification date for every cell before it renders as verified.",
    'Set confidence.cells to "low" when any quote is not verbatim, any figure was uncertain, or cells may have been missed.',
    'Reply with ONLY a JSON object: {"data": {"cells": [{"jurisdiction": "US-TX", "question": "q1", "answer": "…", "citation": "Tex. Bus. & Com. Code § 15.50(a)", "quotedText": "…", "sourceUrl": "https://…"|null}]}, "confidence": {"cells": "high"|"low"}}.',
  ].join(" "),
  user: (text) => "Survey memo text (imported from a .docx):\n\n" + text,
  maxTokens: 1500,
  validateData: validateSurveyCells,
};
