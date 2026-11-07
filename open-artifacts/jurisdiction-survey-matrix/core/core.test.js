/** Tests for jurisdiction-survey-matrix core. Run: node --test (from artifact root) */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDate, classifyCell, buildMatrix, toCsv, toMarkdown } from "./core.js";

const AS_OF = "2026-11-07";

const SURVEY = {
  topic: "Data breach notification basics (fictional survey)",
  jurisdictions: ["US-CA", "US-NY", "US-TX", "EU"],
  questions: [
    { id: "deadline", text: "How many days to notify individuals after a breach?" },
    { id: "threshold", text: "What risk threshold triggers individual notice?" },
  ],
  cells: [
    { jurisdiction: "US-CA", question: "deadline", answer: "Without undue delay; state AG if >500 residents (fictional example).", citation: "Fictional Civ. Code § 1798.82-like statute", verifiedDate: "2026-08-01", verifiedBy: "R. Castellan" },
    { jurisdiction: "US-CA", question: "threshold", answer: "Reasonable likelihood of harm (fictional).", citation: "Fictional Civ. Code § 1798.82(b)-like statute", verifiedDate: "2026-08-01", verifiedBy: "R. Castellan" },
    { jurisdiction: "US-NY", question: "deadline", answer: "30 days (fictional example).", citation: "Fictional Gen. Bus. Law § 899-aa-like statute", verifiedDate: "2026-01-20", verifiedBy: "M. Delacroix" }, // stale at asOf (291d)
    { jurisdiction: "US-NY", question: "threshold", answer: "Private information exposure (fictional).", citation: "", verifiedDate: "2026-01-20" }, // no citation -> unverified
    // US-TX: entirely missing -> unverified
    { jurisdiction: "EU", question: "deadline", answer: "72 hours to supervisory authority (GDPR-style, fictionalized).", citation: "Fictional GDPR art. 33-like provision", verifiedDate: "2026-10-30", verifiedBy: "A. Fern" },
    { jurisdiction: "EU", question: "threshold", answer: "Risk to rights and freedoms (fictionalized).", citation: "Fictional GDPR art. 33/34-like provision", verifiedDate: "2026-10-30", verifiedBy: "A. Fern", },
  ],
};

test("parseDate validates strictly", () => {
  assert.equal(parseDate("2026-13-01"), null);
  assert.equal(parseDate("2026/08/01"), null);
  assert.ok(parseDate("2026-08-01") instanceof Date);
});

test("classifyCell: complete fresh cell is verified with age reason", () => {
  const c = classifyCell(SURVEY.cells[0], {}, AS_OF);
  assert.equal(c.status, "verified");
  assert.equal(c.ageDays, 98);
  assert.match(c.reason, /verified 98d ago by R\. Castellan/);
});

test("classifyCell: answer without citation is unverified, never surfaced", () => {
  const c = classifyCell(SURVEY.cells[3], {}, AS_OF);
  assert.equal(c.status, "unverified");
  assert.match(c.reason, /no source citation/);
});

test("classifyCell: citation without answer and malformed dates are unverified", () => {
  assert.match(classifyCell({ answer: "", citation: "X v. Y", verifiedDate: "2026-01-01" }, {}, AS_OF).reason, /no answer/);
  assert.match(classifyCell({ answer: "yes", citation: "X v. Y", verifiedDate: "Jan 1 2026" }, {}, AS_OF).reason, /verification date missing or malformed/);
  assert.match(classifyCell({ answer: "yes", citation: "X v. Y", verifiedDate: "2027-01-01" }, {}, AS_OF).reason, /in the future/);
});

test("classifyCell: stale window is configurable rules-as-data", () => {
  const stale = classifyCell(SURVEY.cells[2], {}, AS_OF); // 291d old
  assert.equal(stale.status, "stale");
  const fresh = classifyCell(SURVEY.cells[2], { maxAgeDays: 400 }, AS_OF);
  assert.equal(fresh.status, "verified");
});

test("buildMatrix: missing cells are unverified, never guessed; coverage counts match", () => {
  const m = buildMatrix(SURVEY, AS_OF);
  assert.equal(m.grid.length, 4); // jurisdictions
  assert.equal(m.grid[0].length, 2); // questions
  const tx = m.grid[2];
  assert.ok(tx.every((c) => c.status === "unverified" && c.answer === undefined));
  assert.match(tx[0].reason, /no research recorded/);
  assert.equal(m.coverage.total, 8);
  assert.equal(m.coverage.verified, 4);
  assert.equal(m.coverage.stale, 1);
  assert.equal(m.coverage.unverified, 3);
  assert.equal(m.coverage.pctVerified, 50);
});

test("buildMatrix: stale cells keep answer + citation but flagged", () => {
  const m = buildMatrix(SURVEY, AS_OF);
  const ny = m.grid[1][0];
  assert.equal(ny.status, "stale");
  assert.ok(ny.answer.includes("30 days"));
  assert.match(ny.reason, /re-verification required/);
});

test("buildMatrix accepts plain-string questions", () => {
  const m = buildMatrix({ topic: "t", jurisdictions: ["A"], questions: ["one thing"], cells: [] }, AS_OF);
  assert.deepEqual(m.questions, [{ id: "q1", text: "one thing" }]);
  assert.equal(m.grid[0][0].status, "unverified");
});

test("toCsv marks unverified cells UNVERIFIED, never the guess", () => {
  const csv = toCsv(buildMatrix(SURVEY, AS_OF));
  const lines = csv.trim().split("\n");
  assert.equal(lines.length, 9);
  assert.match(lines[0], /^jurisdiction,questionId/);
  const txRow = lines.find((l) => l.startsWith("US-TX"));
  assert.match(txRow, /UNVERIFIED — not researched/);
  const nyStale = lines.find((l) => l.startsWith("US-NY,deadline"));
  assert.match(nyStale, /stale/);
});

test("toMarkdown renders header, coverage, and explicit UNVERIFIED cells", () => {
  const md = toMarkdown(buildMatrix(SURVEY, AS_OF));
  assert.match(md, /# Jurisdiction survey: Data breach notification basics/);
  assert.match(md, /4\/8 verified.*50%/);
  assert.match(md, /\*\*UNVERIFIED\*\*/);
  assert.match(md, /STALE/);
  assert.match(md, /re-verified against current law/);
});
