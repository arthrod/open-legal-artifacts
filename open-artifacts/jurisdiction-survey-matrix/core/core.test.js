/** Tests for jurisdiction-survey-matrix core. Run: node --test (from artifact root) */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDate, classifyCell, buildMatrix, toCsv, toMarkdown, toWorklist, worklistToMarkdown, safeUrl } from "./core.js";

const AS_OF = "2026-11-07";

const SURVEY = {
  topic: "Data breach notification basics (fictional survey)",
  jurisdictions: ["US-CA", "US-NY", "US-TX", "EU"],
  questions: [
    { id: "deadline", text: "How many days to notify individuals after a breach?" },
    { id: "threshold", text: "What risk threshold triggers individual notice?" },
  ],
  cells: [
    { jurisdiction: "US-CA", question: "deadline", answer: "Without undue delay; state AG if >500 residents (fictional example).", citation: "Fictional Civ. Code § 1798.82-like statute", sourceUrl: "https://fictional.example/us-ca/civ-1798-82", quotedText: "disclosure shall be made in the most expedient time possible and without unreasonable delay; a copy shall be sent to the Attorney General if more than 500 residents are notified", verifiedDate: "2026-08-01", verifiedBy: "R. Castellan" },
    { jurisdiction: "US-CA", question: "threshold", answer: "Reasonable likelihood of harm (fictional).", citation: "Fictional Civ. Code § 1798.82(b)-like statute", sourceUrl: "https://fictional.example/us-ca/civ-1798-82", quotedText: "reasonable likelihood of material damage to a resident", verifiedDate: "2026-08-01", verifiedBy: "R. Castellan" },
    { jurisdiction: "US-NY", question: "deadline", answer: "30 days (fictional example).", citation: "Fictional Gen. Bus. Law § 899-aa-like statute", sourceUrl: "https://fictional.example/us-ny/gbl-899-aa", quotedText: "notification shall be made within 30 days of discovery", verifiedDate: "2026-01-20", verifiedBy: "M. Delacroix" }, // stale at asOf (291d)
    { jurisdiction: "US-NY", question: "threshold", answer: "Private information exposure (fictional).", citation: "", verifiedDate: "2026-01-20" }, // no citation -> unverified
    // US-TX: entirely missing -> unverified
    { jurisdiction: "EU", question: "deadline", answer: "72 hours to supervisory authority (GDPR-style, fictionalized).", citation: "Fictional GDPR art. 33-like provision", sourceUrl: "https://fictional.example/eu/gdpr-art-33", quotedText: "the controller shall notify the supervisory authority within 72 hours", verifiedDate: "2026-10-30", verifiedBy: "A. Fern" },
    { jurisdiction: "EU", question: "threshold", answer: "Risk to rights and freedoms (fictionalized).", citation: "Fictional GDPR art. 33/34-like provision", sourceUrl: "https://fictional.example/eu/gdpr-art-34", quotedText: "risk to the rights and freedoms of natural persons", verifiedDate: "2026-10-30", verifiedBy: "A. Fern", },
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
  assert.match(classifyCell({ answer: "yes", citation: "X v. Y", sourceUrl: "https://fictional.example/x", verifiedDate: "Jan 1 2026" }, {}, AS_OF).reason, /verification date missing or malformed/);
  assert.match(classifyCell({ answer: "yes", citation: "X v. Y", sourceUrl: "https://fictional.example/x", verifiedDate: "2027-01-01" }, {}, AS_OF).reason, /in the future/);
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

test("link gate: cited cell without sourceUrl is unverified (requireSourceUrl defaults on)", () => {
  const gated = classifyCell({ ...SURVEY.cells[0], sourceUrl: undefined }, {}, AS_OF);
  assert.equal(gated.status, "unverified");
  assert.match(gated.reason, /sourceUrl/);
  const relaxed = classifyCell({ ...SURVEY.cells[0], sourceUrl: undefined }, { requireSourceUrl: false }, AS_OF);
  assert.equal(relaxed.status, "verified");
});

test("buildMatrix surfaces sourceUrl + quotedText; CSV/MD link the law", () => {
  const m = buildMatrix(SURVEY, AS_OF);
  const ca = m.grid[0][0];
  assert.equal(ca.sourceUrl, SURVEY.cells[0].sourceUrl);
  assert.ok(ca.quotedText.includes("unreasonable delay"));
  const lines = toCsv(m).trim().split("\n");
  assert.match(lines[0], /sourceUrl/);
  assert.match(lines.find((l) => l.startsWith("US-CA,deadline")), /fictional\.example/);
  const md = toMarkdown(m);
  assert.match(md, /\[Fictional Civ\. Code § 1798\.82-like statute\]\(https:\/\/fictional\.example\/us-ca\/civ-1798-82\)/);
});

test("buildMatrix warns on duplicates, orphans, and empty lists — no silent drops", () => {
  const survey = {
    topic: "t",
    jurisdictions: ["A"],
    questions: [{ id: "q1", text: "?" }],
    cells: [
      { jurisdiction: "A", question: "q1", answer: "first", citation: "c1", sourceUrl: "https://fictional.example/1", verifiedDate: "2026-01-01" },
      { jurisdiction: "A", question: "q1", answer: "second", citation: "c2", sourceUrl: "https://fictional.example/2", verifiedDate: "2026-02-01" },
      { jurisdiction: "ZZ", question: "q1", answer: "x", citation: "c", sourceUrl: "https://fictional.example/3", verifiedDate: "2026-01-01" },
      { jurisdiction: "A", question: "nope", answer: "x", citation: "c", sourceUrl: "https://fictional.example/4", verifiedDate: "2026-01-01" },
    ],
  };
  const m = buildMatrix(survey, AS_OF);
  assert.ok(m.warnings.some((w) => /duplicate/i.test(w) && /a\|q1/.test(w)));
  assert.ok(m.warnings.some((w) => /orphan/i.test(w) && /ZZ/.test(w)));
  assert.ok(m.warnings.some((w) => /orphan/i.test(w) && /nope/.test(w)));
  assert.equal(m.grid[0][0].citation, "c2"); // last one wins, but the drop is warned
  const empty = buildMatrix({ topic: "t", jurisdictions: [], questions: [], cells: [] }, AS_OF);
  assert.ok(empty.warnings.filter((w) => /empty/i.test(w)).length >= 2);
});

test("figure consistency: answer digits missing from quotedText are flagged, warning-only", () => {
  const cell = {
    jurisdiction: "A", question: "q1", answer: "Notify within 30 days.", citation: "c",
    sourceUrl: "https://fictional.example/x", verifiedDate: "2026-08-01",
    quotedText: "notification shall be made without unreasonable delay",
  };
  const flagged = classifyCell(cell, {}, AS_OF);
  assert.equal(flagged.status, "verified"); // warning-only, never a silent drop of content
  assert.ok(flagged.warnings.some((w) => /figures not in quoted source: 30/.test(w)));
  const clean = classifyCell({ ...cell, quotedText: "notification shall be made within 30 days" }, {}, AS_OF);
  assert.deepEqual(clean.warnings, []);
  const m = buildMatrix({ topic: "t", jurisdictions: ["A"], questions: [{ id: "q1", text: "?" }], cells: [cell] }, AS_OF);
  assert.ok(m.grid[0][0].warnings[0].includes("figures not in quoted source"));
});

test("toWorklist: stale + unverified only, stale ranked first", () => {
  const m = buildMatrix(SURVEY, AS_OF);
  const wl = toWorklist(m);
  assert.equal(wl.length, m.coverage.stale + m.coverage.unverified); // 1 + 3
  assert.equal(wl[0].status, "stale");
  assert.equal(wl[0].jurisdiction, "US-NY");
  assert.ok(wl.every((r) => r.status === "stale" || r.status === "unverified"));
  const md = worklistToMarkdown(m);
  assert.match(md, /# Re-verification worklist/);
  assert.match(md, /\| 1 \| STALE \| US-NY \|/);
});

test("coverage breakdown: byJurisdiction and byQuestion", () => {
  const m = buildMatrix(SURVEY, AS_OF);
  assert.deepEqual(m.coverage.byJurisdiction["US-TX"], { total: 2, verified: 0, stale: 0, unverified: 2 });
  assert.equal(m.coverage.byJurisdiction["US-CA"].verified, 2);
  assert.deepEqual(m.coverage.byQuestion["threshold"], { total: 4, verified: 2, stale: 0, unverified: 2 });
});

/* ---------- B08 fixes: URL scheme allowlist, CSV injection, input-shape crash ---------- */

const VERIFIED_CELL = {
  jurisdiction: "A", question: "q1", answer: "Yes (fictional).", citation: "Fictional Stat. § 1",
  sourceUrl: "https://fictional.example/x", verifiedDate: "2026-08-01", verifiedBy: "R. Castellan",
};

test("safeUrl: only http/https schemes are linkable", () => {
  assert.equal(safeUrl("https://fictional.example/x"), "https://fictional.example/x");
  assert.equal(safeUrl("http://fictional.example/x"), "http://fictional.example/x");
  assert.equal(safeUrl("HTTPS://Example.com/X"), "HTTPS://Example.com/X");
  assert.equal(safeUrl("  https://fictional.example/x  "), "https://fictional.example/x");
  assert.equal(safeUrl("javascript:alert(document.domain)"), null);
  assert.equal(safeUrl(" javascript:alert(1)"), null); // leading whitespace must not smuggle a scheme
  assert.equal(safeUrl("JAVASCRIPT:alert(1)"), null);
  assert.equal(safeUrl("data:text/html,<script>alert(1)</script>"), null);
  assert.equal(safeUrl("vbscript:msgbox(1)"), null);
  assert.equal(safeUrl("ftp://fictional.example/x"), null);
  assert.equal(safeUrl(""), null);
  assert.equal(safeUrl(null), null);
  assert.equal(safeUrl(42), null);
});

test("unsafe sourceUrl fails requireSourceUrl — a javascript: cell is never verified", () => {
  const c = classifyCell({ ...VERIFIED_CELL, sourceUrl: "javascript:alert(document.domain)" }, {}, AS_OF);
  assert.equal(c.status, "unverified");
  assert.match(c.reason, /sourceUrl.*http/);
  const https = classifyCell(VERIFIED_CELL, {}, AS_OF);
  assert.equal(https.status, "verified");
});

test("unsafe sourceUrl is never surfaced as a link — inert text + warning, even with requireSourceUrl off", () => {
  const m = buildMatrix(
    { topic: "t", jurisdictions: ["A"], questions: [{ id: "q1", text: "?" }],
      policy: { requireSourceUrl: false },
      cells: [{ ...VERIFIED_CELL, sourceUrl: "javascript:alert(1)" }] },
    AS_OF,
  );
  const cell = m.grid[0][0];
  assert.equal(cell.status, "verified"); // policy relaxed, but the URL itself is still never linked
  assert.equal(cell.sourceUrl, null);
  assert.ok((cell.warnings ?? []).some((w) => /sourceUrl.*not.*http/i.test(w) && /javascript:alert\(1\)/.test(w)));
  const md = toMarkdown(m);
  assert.ok(!md.includes("](javascript:"));
  assert.match(md, /Fictional Stat\. § 1/); // citation still visible as inert text
  assert.match(md, /javascript:alert\(1\)/); // ...and the rejected URL is shown as text with its warning
});

test("toMarkdown never emits a non-http(s) link, even for hand-built matrices", () => {
  const m = buildMatrix(SURVEY, AS_OF);
  m.grid[0][0].sourceUrl = "javascript:alert(document.domain)"; // hostile/buggy caller
  const md = toMarkdown(m);
  assert.ok(!/\]\(javascript:/i.test(md));
  assert.match(md, /Fictional Civ\. Code § 1798\.82-like statute/);
});

test("toCsv neutralizes spreadsheet formula injection (= + - @ tab CR)", () => {
  const hostile = {
    topic: "t", jurisdictions: ["A"], questions: [{ id: "q1", text: "?" }],
    cells: [{
      jurisdiction: "A", question: "q1",
      answer: '=HYPERLINK("http://evil.example","click") — injected',
      citation: "@SUM(1+1)*cmd|' /C calc'!A0",
      sourceUrl: "https://fictional.example/x",
      quotedText: "\tTAB-led quote\nsecond line",
      verifiedDate: "2026-08-01", verifiedBy: "+CMD-injector\r",
    }],
  };
  const csv = toCsv(buildMatrix(hostile, AS_OF));
  for (const line of csv.trim().split("\n").slice(1)) {
    // every exported cell that could start a formula (or already carries ' ) is apostrophe-prefixed and quoted
    const fields = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
      else if (ch === "," && !inQ) { fields.push(cur); cur = ""; }
      else cur += ch;
    }
    fields.push(cur);
    for (const f of fields) {
      assert.ok(!/^[=+\-@\t\r]/.test(f), `cell not hardened: ${JSON.stringify(f)}`);
    }
  }
  assert.match(csv, /"'=HYPERLINK/); // the guard is visible in the bytes
  assert.match(csv, /"'@SUM/);
});

test("toCsv leaves ordinary cells untouched (no spurious quoting/prefixing)", () => {
  const csv = toCsv(buildMatrix(SURVEY, AS_OF));
  const ca = csv.trim().split("\n").find((l) => l.startsWith("US-CA,deadline"));
  assert.ok(ca && !ca.includes("'"), ca);
});

test("buildMatrix never throws on wrong cell shapes — keyed-object cells warn, not crash", () => {
  const m = buildMatrix(
    { topic: "t", jurisdictions: ["A"], questions: [{ id: "q1", text: "?" }],
      cells: { "a|q1": { answer: "yes", citation: "c", sourceUrl: "https://fictional.example/x", verifiedDate: "2026-08-01" } } },
    AS_OF,
  ); // A08 repro: keyed object instead of array used to throw TypeError (object is not iterable)
  assert.equal(m.grid[0][0].status, "unverified");
  assert.ok(m.warnings.some((w) => /cells must be an array/i.test(w)));
  assert.equal(m.coverage.unverified, 1);
});

test("buildMatrix tolerates non-object cell entries (null, string) with orphan warnings", () => {
  const m = buildMatrix(
    { topic: "t", jurisdictions: ["A"], questions: [{ id: "q1", text: "?" }],
      cells: [null, "not a cell", { jurisdiction: "A", question: "q1", answer: "ok", citation: "c", sourceUrl: "https://fictional.example/x", verifiedDate: "2026-08-01" }] },
    AS_OF,
  );
  assert.equal(m.grid[0][0].status, "verified");
  assert.equal(m.warnings.filter((w) => /cell entry is not an object/i.test(w)).length, 2);
});
