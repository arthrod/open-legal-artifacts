import { test } from "node:test";
import assert from "node:assert/strict";
import {
  splitClauses,
  classifyClause,
  verifyQuote,
  runPlaybookCheck,
  riskSummary,
  renderPlaybookMd,
  DEFAULT_PLAYBOOK,
} from "./core.js";
import EXAMPLE from "../demo/example.js";

const SRC = EXAMPLE.agreementText.replace(/\r\n?/g, "\n");
const clause = (label) => splitClauses(SRC).find((c) => c.label === String(label)).text;

/* ---------- splitClauses ---------- */

test("splitClauses segments the 12 numbered clauses with labels 1–12", () => {
  const clauses = splitClauses(SRC);
  assert.equal(clauses.length, 12);
  assert.deepEqual(clauses.map((c) => c.label), ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]);
  assert.equal(clauses[0].heading, "Definitions");
  assert.equal(clauses[2].heading, "Term and Survival");
});

test("splitClauses offsets resolve back into the source text", () => {
  for (const c of splitClauses(SRC)) {
    assert.equal(SRC.slice(c.start, c.end), c.text);
  }
});

test("splitClauses handles markdown headings as markers", () => {
  const md = "Preamble text.\n\n# Confidentiality\n\nWe keep secrets.\n\n## Governing law\n\nCalifornia wins.\n";
  const clauses = splitClauses(md);
  assert.equal(clauses.length, 2);
  assert.equal(clauses[0].heading, "Confidentiality");
  assert.equal(clauses[1].label, null);
  assert.match(clauses[1].text, /California wins/);
});

test("splitClauses falls back to blank-line paragraphs when no markers exist", () => {
  const clauses = splitClauses("First paragraph stands alone.\n\nSecond paragraph here.\n\nThird one.");
  assert.equal(clauses.length, 3);
  assert.deepEqual(clauses.map((c) => c.label), ["p1", "p2", "p3"]);
  assert.equal(clauses[0].text, "First paragraph stands alone.");
});

test("splitClauses returns [] for empty input", () => {
  assert.deepEqual(splitClauses(""), []);
  assert.deepEqual(splitClauses("   \n  \n"), []);
});

/* ---------- classifyClause ---------- */

test("classifyClause: five-year survival with trade-secret carve-out is preferred", () => {
  const r = classifyClause(clause(3), DEFAULT_PLAYBOOK);
  assert.equal(r.classification, "preferred");
  assert.equal(r.ruleId, "confidentiality-term");
  assert.ok(r.sourceQuote.includes("five (5) years"));
});

test("classifyClause: Delaware law lands on fallback tier 1, ordered tiers respected", () => {
  const r = classifyClause(clause(9), DEFAULT_PLAYBOOK);
  assert.equal(r.classification, "fallback-tier-1");
  assert.equal(r.ruleId, "governing-law");

  const arb = classifyClause("Any dispute arising under this NDA is resolved by final JAMS arbitration seated in Chicago.", DEFAULT_PLAYBOOK);
  assert.equal(arb.classification, "fallback-tier-2");
});

test("classifyClause: 24-month no-hire non-solicit is an avoid position", () => {
  const r = classifyClause(clause(5), DEFAULT_PLAYBOOK);
  assert.equal(r.classification, "avoid");
  assert.equal(r.ruleId, "non-solicit");
  assert.equal(r.position.tier, "avoid");
  assert.ok(r.sourceQuote.length > 0);
});

test("classifyClause: notices clause stays uncovered — never guessed", () => {
  const r = classifyClause("12. Notices. All notices shall be sent by email to the addresses listed above.", DEFAULT_PLAYBOOK);
  assert.equal(r.classification, "uncovered");
  assert.equal(r.ruleId, null);
  assert.ok(/never guessed/.test(r.note));
});

test("classifyClause: topic matched but no position matched is uncovered with a note, not a guess", () => {
  const r = classifyClause("The parties' obligations survive the termination of this Agreement.", DEFAULT_PLAYBOOK);
  assert.equal(r.classification, "uncovered");
  assert.equal(r.ruleId, "confidentiality-term");
  assert.match(r.note, /no playbook position matched — not guessed/);
});

/* ---------- verifyQuote (edge cases) ---------- */

test("verifyQuote: verbatim quote is exact with an anchor", () => {
  const r = verifyQuote("This Agreement is governed by the laws of the State of Delaware", SRC);
  assert.equal(r.classification, "exact");
  assert.ok(r.anchor && r.anchor.charEnd > r.anchor.charStart);
  assert.equal(SRC.slice(r.anchor.charStart, r.anchor.charEnd), "This Agreement is governed by the laws of the State of Delaware");
});

test("verifyQuote: case/hyphen/punctuation drift is normalized", () => {
  const r = verifyQuote(
    "this agreement is governed by the laws of the state of delaware, without regard to its conflict of laws rules",
    SRC,
  );
  assert.equal(r.classification, "normalized");
  assert.ok(r.similarity >= 0.95 && r.coverage >= 0.95);
});

test("verifyQuote: near-verbatim paraphrase is fuzzy, flagged for human review", () => {
  const r = verifyQuote(
    "Neither Party shall solicit or hire the other Party's employees or solicit the other Party's customers in order to divert business.",
    SRC,
  );
  assert.equal(r.classification, "fuzzy");
  assert.ok(r.similarity >= 0.7);
  assert.ok(r.notes.some((n) => n.includes("human review")));
});

test("verifyQuote: absent quote is not_found, and empty quotes never verify", () => {
  const r = verifyQuote("The indemnitor shall defend the indemnified party against any and all claims without any cap whatsoever.", SRC);
  assert.equal(r.classification, "not_found");
  assert.equal(r.anchor, null);

  const empty = verifyQuote("   ", SRC);
  assert.equal(empty.classification, "not_found");
  assert.ok(empty.notes.some((n) => n.includes("empty quote")));
});

/* ---------- pipeline, summary, markdown ---------- */

test("runPlaybookCheck: expected deviation mix and quote ladder on the example", () => {
  const report = runPlaybookCheck(EXAMPLE.agreementText, DEFAULT_PLAYBOOK);
  const s = report.summary;
  assert.equal(s.totalClauses, 12);
  assert.equal(s.preferred, 3); // use, confidentiality term, liability cap
  assert.equal(s.fallbacks, 4); // compelled, indemnity, governing law, renewal
  assert.equal(s.avoid, 1); // non-solicit
  assert.equal(s.uncovered, 4); // definitions, return, no license, general
  assert.equal(s.green, 3);
  assert.equal(s.yellow, 4);
  assert.equal(s.red, 1);
  assert.deepEqual(s.quotes, { total: 8, exact: 5, normalized: 1, fuzzy: 1, not_found: 1 });
});

test("riskSummary counts independently of the full run", () => {
  const results = [
    { classification: "preferred", quote: { classification: "exact" } },
    { classification: "fallback-tier-2", quote: { classification: "not_found" } },
    { classification: "uncovered", quote: null },
  ];
  const s = riskSummary(results);
  assert.equal(s.totalClauses, 3);
  assert.equal(s.covered, 2);
  assert.equal(s.green, 1);
  assert.equal(s.yellow, 1);
  assert.equal(s.red, 0);
  assert.equal(s.unverifiedQuotes, 1);
});

test("renderPlaybookMd: deviation table, full ACC rows, uncovered list, disclaimer", () => {
  const report = runPlaybookCheck(EXAMPLE.agreementText, DEFAULT_PLAYBOOK);
  const md = renderPlaybookMd(report);
  assert.match(md, /# Playbook draft/);
  assert.match(md, /\| Clause \| Topic \| Classification \| Position \| Quote \|/);
  assert.match(md, /## Term and survival of confidentiality — GREEN/);
  assert.match(md, /## Non-solicitation — RED/);
  assert.match(md, /\*\*Fallbacks \(in order\):\*\*/);
  assert.match(md, /Source quote — not_found/);
  assert.match(md, /## Uncovered clauses/);
  assert.match(md, /left uncovered, never guessed|no playbook rule matched/);
  assert.match(md, /Not legal advice/);
  assert.match(md, /no LLM in the loop/);
});
