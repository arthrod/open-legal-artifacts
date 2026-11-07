/** Tests for sell-side-qa-log core. Run: node --test "core/*.test.js" (from artifact root) */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  currentAnswer, pendingDraft, itemStatus, sentences, keywords, extractNumbers,
  compareAnswers, detectContradictions, readinessScore, buildQaLog,
  qaLogToCsv, qaLogToJson, renderReport, DEFAULT_ANTONYM_PAIRS,
} from "./core.js";

const ITEMS = [
  {
    id: "Q-001", buyerId: "B1", category: "litigation",
    question: "Are there any pending lawsuits against the target?",
    answers: [
      { text: "Yes. There are 3 pending lawsuits, all employment-related.", status: "draft", at: "2026-10-01" },
      { text: "Yes. There are 3 pending lawsuits: two employment matters and one commercial dispute.", status: "sent", at: "2026-10-03" },
    ],
  },
  {
    id: "Q-002", buyerId: "B2", category: "litigation",
    question: "Does the target have any active litigation exposure?",
    answers: [
      { text: "No. All 2 lawsuits from 2024 were settled and dismissed; there are no pending lawsuits against the target.", status: "sent", at: "2026-10-05" },
    ],
  },
  {
    id: "Q-003", buyerId: "B1", category: "customers",
    question: "How many customers does the target have?",
    answers: [
      { text: "The target serves 1,200 active customers across 14 locations.", status: "sent", at: "2026-10-04" },
    ],
  },
  {
    id: "Q-004", buyerId: "B3", category: "customers",
    question: "What is the customer base?",
    answers: [
      { text: "Approximately 950 active customers as of the latest quarter.", status: "sent", at: "2026-10-06" },
    ],
  },
  {
    id: "Q-005", buyerId: "B2", category: "financials",
    question: "What was 2025 revenue growth?",
    answers: [
      { text: "Revenue grew 12% in 2025.", status: "sent", at: "2026-10-02" },
      // pending draft that contradicts the sent answer in the same category as Q-006
      { text: "Revenue grew 12% in 2025, but EBITDA declined 4% year over year.", status: "draft", at: "2026-10-20" },
    ],
  },
  {
    id: "Q-006", buyerId: "B1", category: "financials",
    question: "How did profitability trend in 2025?",
    answers: [
      { text: "EBITDA increased 4% year over year in 2025.", status: "sent", at: "2026-10-08" },
    ],
  },
  {
    id: "Q-007", buyerId: "B2", category: "ip",
    question: "Is the IP exclusively licensed?",
    answers: [], // open
  },
  {
    id: "Q-008", buyerId: "B3", category: "ip",
    question: "Are any licenses exclusive?",
    answers: [
      { text: "The core patent portfolio is licensed exclusively to Meridian Manufacturing.", status: "sent", at: "2026-10-09" },
      { text: "The core patent portfolio is licensed exclusively to Meridian Manufacturing; two trademarks are non-exclusive.", status: "draft", at: "2026-10-22" }, // pending draft, same item → not a contradiction
    ],
  },
];

const INPUT = {
  deal: { name: "Project Copperfield — sale of Kestrel Data Systems, Inc. (fictional)" },
  buyers: [
    { id: "B1", name: "Oryx Growth Partners" },
    { id: "B2", name: "Lantern Harbor Capital" },
    { id: "B3", name: "Fairwind Industrials" },
  ],
  items: ITEMS,
};

test("currentAnswer picks the latest sent answer; stale drafts ignored", () => {
  const cur = currentAnswer(ITEMS[0]);
  assert.equal(cur.text, "Yes. There are 3 pending lawsuits: two employment matters and one commercial dispute.");
  assert.equal(cur.at, "2026-10-03");
  assert.equal(currentAnswer(ITEMS[6]), null);
});

test("pendingDraft only counts drafts on/after the canonical answer", () => {
  assert.equal(pendingDraft(ITEMS[0]), null); // draft predates the sent answer
  const dr = pendingDraft(ITEMS[4]);
  assert.match(dr.text, /EBITDA declined/);
  assert.equal(pendingDraft(ITEMS[7]).text.includes("non-exclusive"), true); // same-item draft is pending
});

test("itemStatus derives the full workflow ladder", () => {
  const st = Object.fromEntries(ITEMS.map((it) => [it.id, itemStatus(it)]));
  assert.equal(st["Q-001"], "sent");
  assert.equal(st["Q-002"], "sent");
  assert.equal(st["Q-005"], "draft-pending");
  assert.equal(st["Q-007"], "open");
  assert.equal(st["Q-008"], "draft-pending");
});

test("extractNumbers parses units, commas, currency, and bare counts", () => {
  const ns = extractNumbers("Revenue grew 12% while $3.5 million was spent across 1,200 active customers.");
  // note: "active customers" has an adjective between number and noun, so the
  // count parses as a bare number (units must directly follow the number)
  assert.deepEqual(ns.map((n) => [n.value, n.unit]), [[12, "%"], [3.5, "million"], [1200, ""]]);
  const all = extractNumbers("EBITDA increased 4% year over year.");
  assert.equal(all[0].unit, "%");
  const bare = extractNumbers("There are 3 pending lawsuits against the company.");
  assert.deepEqual(bare.map((n) => [n.value, n.unit]), [[3, ""]]);
});

test("sentences and keywords behave deterministically", () => {
  const s = sentences("One. Two sentences? Three!");
  assert.deepEqual(s, ["One.", "Two sentences?", "Three!"]);
  assert.ok(keywords("The company will disclose the customers of the company").has("disclose"));
  assert.ok(!keywords("The company will disclose the customers").has("the"));
});

test("number conflict: same unit, disjoint values, with evidence quotes", () => {
  const conflicts = compareAnswers(
    { id: "A", statusLabel: "sent" }, { id: "B", statusLabel: "sent" },
    "The target serves 1,200 active customers across 14 locations.",
    "Approximately 950 active customers as of the latest quarter.",
  );
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].kind, "number_conflict");
  assert.match(conflicts[0].detail, /950/);
  assert.equal(conflicts[0].evidence[0].itemId, "A");
  assert.match(conflicts[0].evidence[0].quote, /1,200 active customers/);
});

test("number agreement in the same unit is not a conflict", () => {
  const conflicts = compareAnswers(
    { id: "A" }, { id: "B" },
    "Revenue grew 12% in 2025.",
    "We confirm 12% revenue growth for 2025.",
  );
  assert.equal(conflicts.filter((c) => c.kind === "number_conflict").length, 0);
});

test("bare-count conflict requires a shared keyword anchor", () => {
  const anchored = compareAnswers(
    { id: "A" }, { id: "B" },
    "There are 3 pending lawsuits against the company.",
    "The company faces 5 pending lawsuits.",
  );
  assert.equal(anchored.filter((c) => c.kind === "number_conflict").length, 1);
  const unanchored = compareAnswers(
    { id: "A" }, { id: "B" },
    "There are 3 pending lawsuits against the company.",
    "The board has 5 standing committees.",
  );
  assert.equal(unanchored.filter((c) => c.kind === "number_conflict").length, 0);
});

test("antonym conflict fires on permitted/prohibited with sentence evidence", () => {
  const conflicts = compareAnswers(
    { id: "A" }, { id: "B" },
    "Assignment is permitted with notice.",
    "Assignment is prohibited without prior written consent.",
  );
  const a = conflicts.find((c) => c.kind === "antonym_conflict");
  assert.ok(a);
  assert.match(a.detail, /permitted/);
  assert.match(a.evidence[1].quote, /prohibited/);
});

test("detectContradictions groups by category, compares drafts vs sent, skips same-item", () => {
  const cs = detectContradictions(INPUT);
  // litigation: Q-001 (3 pending) vs Q-002 (2 settled, none pending) → number + yes/no antonym
  const lit = cs.filter((c) => c.category === "litigation");
  assert.equal(lit.length, 2);
  assert.ok(lit.some((c) => c.kind === "number_conflict" && c.between.join() === "Q-001,Q-002"));
  assert.ok(lit.some((c) => c.kind === "antonym_conflict"));
  // customers: 1200 vs 950 (both bare counts — "active customers" is not a
  // direct unit) anchored on shared keyword "customers" → number conflict
  const cust = cs.filter((c) => c.category === "customers");
  assert.equal(cust.length, 1);
  assert.equal(cust[0].between.join(), "Q-003,Q-004");
  assert.match(cust[0].detail, /bare-count/);
  // financials: Q-005 sent (12% revenue) vs Q-006 sent (4% EBITDA) → % values disjoint → flagged for review;
  // Q-005's pending draft (12% and 4%) agrees with Q-006 on 4% → draft comparison stays quiet
  const fin = cs.filter((c) => c.category === "financials");
  assert.equal(fin.length, 1);
  assert.equal(fin[0].kind, "number_conflict");
  assert.deepEqual(fin[0].between, ["Q-005", "Q-006"]);
  // ip: Q-008's own draft vs its own sent answer → never compared
  const ip = cs.filter((c) => c.category === "ip");
  assert.deepEqual(ip, []);
});

test("readinessScore weights coverage, pipeline, consistency", () => {
  const cs = detectContradictions(INPUT);
  const r = readinessScore(INPUT, cs);
  // sent items: Q-001..Q-006, Q-008 (7/8); open: 1; contradicted: Q-001..Q-006 (6)
  assert.equal(Math.round(r.components.coverage * 100), 88);
  assert.equal(Math.round(r.components.pipeline * 100), 88);
  assert.equal(Math.round(r.components.consistency * 100), 25);
  assert.equal(r.score, Math.round(100 * (0.5 * 7 / 8 + 0.2 * 7 / 8 + 0.3 * 2 / 8)));
  assert.equal(r.band, "nearly ready");
  assert.deepEqual(r.contradictedItems, ["Q-001", "Q-002", "Q-003", "Q-004", "Q-005", "Q-006"]);
});

test("readinessScore accepts custom weights and bands", () => {
  const cs = detectContradictions(INPUT);
  const r = readinessScore(INPUT, cs, { weights: { coverage: 1, pipeline: 0, consistency: 0 }, bands: { nearly: 10, ready: 50 } });
  assert.equal(r.score, 88);
  assert.equal(r.band, "ready");
});

test("buildQaLog assembles summary, items, contradictions, readiness", () => {
  const log = buildQaLog(INPUT);
  assert.equal(log.deal.name.includes("Copperfield"), true);
  assert.deepEqual(log.summary, { items: 8, sent: 7, draftOnly: 0, open: 1, pendingDrafts: 2, contradictions: 4 });
  const q3 = log.items.find((i) => i.id === "Q-003");
  assert.equal(q3.buyer, "Oryx Growth Partners");
  assert.equal(q3.status, "sent");
  assert.equal(q3.contradicted, true);
  assert.equal(log.readiness.score >= 0 && log.readiness.score <= 100, true);
});

test("qaLogToCsv exports one row per item with flags; qaLogToJson round-trips", () => {
  const log = buildQaLog(INPUT);
  const csv = qaLogToCsv(log);
  const lines = csv.trim().split("\n");
  assert.equal(lines.length, 9); // header + 8 items
  assert.match(lines[0], /^id,buyer,category,status/);
  const q2 = lines.find((l) => l.startsWith("Q-002"));
  assert.match(q2, /number_conflict; antonym_conflict/);
  const q7 = lines.find((l) => l.startsWith("Q-007"));
  assert.match(q7, /,open,/);
  const j = JSON.parse(qaLogToJson(log));
  assert.equal(j.summary.items, 8);
  assert.equal(j.contradictions.length, log.contradictions.length);
});

test("renderReport includes readiness, contradictions with quotes, and answers", () => {
  const md = renderReport(buildQaLog(INPUT));
  assert.match(md, /# Sell-side Q&A log — Project Copperfield/);
  assert.match(md, /Disclosure readiness: \*\*\d+\/100/);
  assert.match(md, /number_conflict/);
  assert.match(md, /there are no pending lawsuits against the target/);
  assert.match(md, /All data fictional/);
});

test("DEFAULT_ANTONYM_PAIRS is non-empty rules-as-data", () => {
  assert.ok(DEFAULT_ANTONYM_PAIRS.length >= 8);
  assert.ok(DEFAULT_ANTONYM_PAIRS.some(([a, b]) => a === "permitted" && b === "prohibited"));
});
