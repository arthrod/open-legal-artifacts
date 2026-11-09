/**
 * vt-val/api/schemas/ai-governance-benchmark.test.ts — pins the /api/extract
 * schema for the ai-governance-benchmark DOCX import (Wave W6b): the adapted
 * answer-interview prompt contract (near-verbatim hard rules from
 * open-artifacts/ai-governance-benchmark/spec.md), validateData's strictness
 * (ids from the bank, integer 0–3 levels, evidence 1..280 chars — never a
 * level without a quoted basis, no duplicate ids), and a drift-guard that the
 * frozen question list matches the artifact's real QUESTION_BANK.
 * Run: cd vt-val && deno test --allow-all api/ (or the file explicitly).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { schema, QUESTIONS, validateAiGovernanceAnswers } from "./ai-governance-benchmark.ts";
import { QUESTION_BANK } from "../../../open-artifacts/ai-governance-benchmark/core/core.js";
import { validateExtractBody, validateExtractReply, valueOf } from "../validate.ts";
import { normalizeConfidence } from "../extract.ts";

/* Fictional but realistic: a completed-questionnaire extraction covering all
 * 13 bank questions, mixed levels, quoted evidence well under 280 chars. */
const FULL_ANSWERS = [
  { questionId: "inv-1", level: 2, evidence: "Spreadsheet of AI tools started in Q1 2026; 9 tools listed." },
  { questionId: "inv-2", level: 1, evidence: "Owners noted for 4 of 9 tools; rest unmapped." },
  { questionId: "inv-3", level: 0, evidence: "No data-flow documentation exists for any tool." },
  { questionId: "risk-1", level: 1, evidence: "Informal security review for the pricing model only." },
  { questionId: "risk-2", level: 0, evidence: "No re-assessment after the March launch." },
  { questionId: "risk-3", level: 0, evidence: "AI screening of driver applicants in pilot — no heightened review." },
  { questionId: "ven-1", level: 2, evidence: "Standard SaaS security questionnaire covers 3 of 6 AI vendors." },
  { questionId: "ven-2", level: 1, evidence: "One DPA mentions no-training-on-our-data; others silent." },
  { questionId: "ir-1", level: 0, evidence: "No AI-specific incident path; general IT helpdesk only." },
  { questionId: "ir-2", level: 0, evidence: "No severity levels defined for AI issues." },
  { questionId: "ir-3", level: 1, evidence: "Post-outage fixes made but nothing written down." },
  { questionId: "trn-1", level: 1, evidence: "One all-hands slide deck from 2025; no role-based content." },
  { questionId: "trn-2", level: 2, evidence: "Legal inbox published in handbook; usage unclear." },
];

/* ---------- schema shape + prompt contract ---------- */

test("schema shape: fields=[answers], sane maxTokens, user builder embeds the bank and the document text", () => {
  assert.deepEqual(schema.fields, ["answers"]);
  assert.ok(Number.isInteger(schema.maxTokens) && schema.maxTokens >= 600 && schema.maxTokens <= 4000, "maxTokens in a sane range for 13 answers");
  assert.equal(typeof schema.system, "string");
  assert.ok(schema.system.length > 200, "system prompt is substantive");
  const u = schema.user("QUESTIONNAIRE TEXT HERE");
  assert.ok(u.includes("QUESTIONNAIRE TEXT HERE"), "user message carries the document text verbatim");
  for (const q of QUESTIONS) assert.ok(u.includes(q.id), "user message lists bank id " + q.id);
});

test("prompt contract: the spec's hard rules are present near-verbatim (answer-interview, adapted for completed questionnaires)", () => {
  const s = schema.system;
  assert.ok(s.includes("NEVER choose the level yourself without a stated factual basis"), "the spec's load-bearing rule, verbatim");
  assert.ok(s.includes("0 not done · 1 ad hoc/informal · 2 defined but partial · 3 defined, repeatable, evidenced"), "the 0–3 scale, verbatim from the spec");
  assert.ok(s.includes("280"), "evidence length bound stated");
  assert.ok(s.includes("scores unanswered questions as 0 and flags"), "unanswered → 0 + flagged downstream, per spec");
  assert.ok(s.includes("omit"), "unanswered questions must be omitted, not guessed");
  assert.ok(s.includes("never invent"), "ids must come from the bank — never invented");
  assert.ok(s.includes('{"data": {"answers"'), "reply shape is the pinned {data, confidence} envelope");
});

test("drift-guard: QUESTIONS matches the artifact core's QUESTION_BANK (ids + texts)", () => {
  assert.equal(QUESTIONS.length, QUESTION_BANK.length, "same question count as the core");
  assert.deepEqual(
    QUESTIONS.map((q) => ({ id: q.id, text: q.text })),
    QUESTION_BANK.map((q) => ({ id: q.id, text: q.text })),
    "the frozen bank in the schema is exactly the core's bank",
  );
});

/* ---------- validateData: accepts ---------- */

test("validateData accepts a realistic full extraction (13 answers) and returns it unchanged", () => {
  const r = validateAiGovernanceAnswers({ answers: FULL_ANSWERS });
  assert.ok(r && r.ok, "accepted");
  assert.deepEqual(r.value, { answers: FULL_ANSWERS });
  const viaSchema = schema.validateData({ answers: FULL_ANSWERS });
  assert.ok(viaSchema && viaSchema.ok, "same validator is wired into the schema");
});

test("validateData accepts an empty answers array — a blank questionnaire is honest input; the core flags every question unanswered", () => {
  const r = validateAiGovernanceAnswers({ answers: [] });
  assert.ok(r && r.ok && r.value.answers.length === 0);
});

test("validateData accepts evidence of exactly 280 chars and trims surrounding whitespace", () => {
  const evidence = "x".repeat(280);
  const r = validateAiGovernanceAnswers({ answers: [{ questionId: "inv-1", level: 3, evidence: "  " + evidence + "  " }] });
  assert.ok(r && r.ok);
  assert.equal(r.value.answers[0].evidence, evidence, "trimmed to exactly 280 — the spec's bound is inclusive");
});

/* ---------- validateData: rejects (fail-closed → route replies INVALID) ---------- */

test("validateData rejects garbage and contract violations", () => {
  const bad = [
    ["null", null],
    ["non-object", "answers"],
    ["number", 42],
    ["array", []],
    ["missing answers key", {}],
    ["extra key", { answers: [], org: {} }],
    ["answers not an array", { answers: "nope" }],
    ["entry not an object", { answers: ["x"] }],
    ["entry extra key", { answers: [{ questionId: "inv-1", level: 1, evidence: "e", extra: 1 }] }],
    ["unknown questionId — the core THROWS on those", { answers: [{ questionId: "inv-99", level: 1, evidence: "e" }] }],
    ["renumbered id", { answers: [{ questionId: "inv-01", level: 1, evidence: "e" }] }],
    ["level 4", { answers: [{ questionId: "inv-1", level: 4, evidence: "e" }] }],
    ["level -1", { answers: [{ questionId: "inv-1", level: -1, evidence: "e" }] }],
    ["non-integer level", { answers: [{ questionId: "inv-1", level: 1.5, evidence: "e" }] }],
    ["string level", { answers: [{ questionId: "inv-1", level: "2", evidence: "e" }] }],
    ["empty evidence — a level without a stated factual basis", { answers: [{ questionId: "inv-1", level: 2, evidence: "" }] }],
    ["whitespace-only evidence", { answers: [{ questionId: "inv-1", level: 2, evidence: "   " }] }],
    ["missing evidence key", { answers: [{ questionId: "inv-1", level: 2 }] }],
    ["evidence over 280 chars", { answers: [{ questionId: "inv-1", level: 2, evidence: "x".repeat(281) }] }],
    ["duplicate questionId — the core's map would silently overwrite", { answers: [
      { questionId: "inv-1", level: 1, evidence: "first" },
      { questionId: "inv-1", level: 3, evidence: "second" },
    ] }],
    ["more answers than bank questions", { answers: FULL_ANSWERS.concat([{ questionId: "trn-1", level: 1, evidence: "dup filler" }]) }],
  ] as const;
  for (const [label, input] of bad) {
    assert.equal(validateAiGovernanceAnswers(input), null, "rejected: " + label);
  }
});

/* ---------- composed pipeline (the /api/extract sequence, exported pieces only) ---------- */

test("composed pipeline: body → reply envelope → validateData → normalizeConfidence, the exact handleExtract sequence", () => {
  const body = validateExtractBody({ schema: "ai-governance-benchmark", text: "Completed questionnaire: inv-1 — Level 2, spreadsheet of AI tools." });
  assert.ok(body.ok, "artifact key passes the body slug check");

  const reply = { data: { answers: FULL_ANSWERS }, confidence: { answers: "high" as const } };
  const ai = valueOf(validateExtractReply(reply));
  assert.ok(ai, "reply envelope validates");

  const data = valueOf(schema.validateData(ai.data));
  assert.ok(data, "schema data validates");
  assert.deepEqual(data, { answers: FULL_ANSWERS });

  assert.deepEqual(normalizeConfidence(schema.fields, data, ai.confidence), { answers: "high" });
  assert.deepEqual(normalizeConfidence(schema.fields, data, {}), { answers: "low" }, "present but unreported → low, never guessed upward");
  assert.deepEqual(normalizeConfidence(schema.fields, {}, {}), { answers: "missing" }, "absent field → missing");
});
