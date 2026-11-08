/** Tests for sell-side-qa-log core. Run: node --test "core/*.test.js" (from artifact root) */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  currentAnswer, pendingDraft, itemStatus, sentences, keywords, extractNumbers,
  compareAnswers, detectContradictions, readinessScore, buildQaLog,
  qaLogToCsv, qaLogToJson, renderReport, DEFAULT_ANTONYM_PAIRS,
  transition, releaseBlockers, buyerView, itemAging, DEFAULT_SLA,
} from "./core.js";

const ITEMS = [
  {
    id: "Q-001", buyerId: "B1", category: "litigation", receivedAt: "2026-09-28",
    question: "Are there any pending lawsuits against the target?",
    answers: [
      { text: "Yes. There are 3 pending lawsuits, all employment-related.", status: "draft", at: "2026-10-01" },
      { text: "Yes. There are 3 pending lawsuits: two employment matters and one commercial dispute.", status: "sent", at: "2026-10-03",
        citations: [{ docId: "DR-014", locator: "§2.1", quote: "Three actions pending: two employment, one commercial." }] },
    ],
  },
  {
    id: "Q-002", buyerId: "B2", category: "litigation", receivedAt: "2026-10-10",
    question: "Does the target have any active litigation exposure?",
    answers: [
      { text: "No. All 2 lawsuits from 2024 were settled and dismissed; there are no pending lawsuits against the target.", status: "sent", at: "2026-10-05",
        citations: [{ docId: "DR-014", locator: "§2.2", quote: "All 2024 matters settled and dismissed with prejudice." }] },
    ],
  },
  {
    id: "Q-003", buyerId: "B1", category: "customers", receivedAt: "2026-10-16",
    question: "How many customers does the target have?",
    answers: [
      { text: "The target serves 1,200 active customers across 14 locations.", status: "sent", at: "2026-10-04" },
    ],
  },
  {
    id: "Q-004", buyerId: "B3", category: "customers", receivedAt: "2026-10-19",
    question: "What is the customer base?",
    answers: [
      { text: "Approximately 950 active customers as of the latest quarter.", status: "sent", at: "2026-10-06" },
    ],
  },
  {
    id: "Q-005", buyerId: "B2", category: "financials", receivedAt: "2026-10-02",
    question: "What was 2025 revenue growth?",
    answers: [
      { text: "Revenue grew 12% in 2025.", status: "sent", at: "2026-10-02",
        citations: [{ docId: "DR-002", locator: "p. 7", quote: "FY2025 revenue growth of 12 percent." }] },
      // pending draft that contradicts the sent answer in the same category as Q-006
      { text: "Revenue grew 12% in 2025, but EBITDA declined 4% year over year.", status: "draft", at: "2026-10-20" },
    ],
  },
  {
    id: "Q-006", buyerId: "B1", category: "financials", receivedAt: "2026-10-18",
    question: "How did profitability trend in 2025?",
    answers: [
      { text: "EBITDA increased 4% year over year in 2025.", status: "sent", at: "2026-10-08",
        citations: [{ docId: "DR-002", locator: "p. 9", quote: "EBITDA increased 4 percent year over year in FY2025." }] },
    ],
  },
  {
    id: "Q-007", buyerId: "B2", category: "ip", receivedAt: "2026-10-20",
    question: "Is the IP exclusively licensed?",
    answers: [], // open
  },
  {
    id: "Q-008", buyerId: "B3", category: "ip", receivedAt: "2026-10-22",
    question: "Are any licenses exclusive?",
    answers: [
      { text: "The core patent portfolio is licensed exclusively to Meridian Manufacturing.", status: "sent", at: "2026-10-09",
        citations: [{ docId: "DR-021", locator: "Exhibit C", quote: "Core patent portfolio licensed exclusively to Meridian Manufacturing." }] },
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
  settings: { asOf: "2026-10-23", sla: { warnDays: 3, breachDays: 5 } },
};

test("currentAnswer picks the latest sent answer; stale drafts ignored; citations carried", () => {
  const cur = currentAnswer(ITEMS[0]);
  assert.equal(cur.text, "Yes. There are 3 pending lawsuits: two employment matters and one commercial dispute.");
  assert.equal(cur.at, "2026-10-03");
  assert.equal(cur.citations.length, 1);
  assert.equal(cur.citations[0].docId, "DR-014");
  assert.equal(currentAnswer(ITEMS[6]), null);
});

test("pendingDraft only counts drafts on/after the canonical answer; approval carried", () => {
  assert.equal(pendingDraft(ITEMS[0]), null); // draft predates the sent answer
  const dr = pendingDraft(ITEMS[4]);
  assert.match(dr.text, /EBITDA declined/);
  assert.equal(dr.approvedBy, null); // not yet approved
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

test("extractNumbers parses units, commas, currency, bare counts + canonical base", () => {
  const ns = extractNumbers("Revenue grew 12% while $3.5 million was spent across 1,200 active customers.");
  // note: "active customers" has an adjective between number and noun, so the
  // count parses as a bare number (units must directly follow the number)
  assert.deepEqual(ns.map((n) => [n.value, n.unit]), [[12, "%"], [3.5, "million"], [1200, ""]]);
  const all = extractNumbers("EBITDA increased 4% year over year.");
  assert.equal(all[0].unit, "%");
  const bare = extractNumbers("There are 3 pending lawsuits against the company.");
  assert.deepEqual(bare.map((n) => [n.value, n.unit]), [[3, ""]]);
  // magnitude normalization: $3.5 million and $3,500,000 share a canonical base
  const a = extractNumbers("The reserve is $3.5 million.")[0];
  const b = extractNumbers("The reserve is $3,500,000.")[0];
  assert.equal(a.baseUnit, "usd");
  assert.equal(b.baseUnit, "usd");
  assert.equal(a.baseValue, b.baseValue);
  assert.equal(a.baseValue, 3500000);
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

test("magnitude normalization: $3.5 million vs $3,500,000 agrees", () => {
  const conflicts = compareAnswers(
    { id: "A" }, { id: "B" },
    "The litigation reserve is $3.5 million.",
    "The litigation reserve is $3,500,000.",
  );
  assert.equal(conflicts.length, 0);
});

test("magnitude normalization: $2 million vs $3,500,000 conflicts in canonical usd", () => {
  const conflicts = compareAnswers(
    { id: "A" }, { id: "B" },
    "The litigation reserve is $2 million.",
    "The litigation reserve is $3,500,000.",
  );
  const num = conflicts.filter((c) => c.kind === "number_conflict");
  assert.equal(num.length, 1);
  assert.match(num[0].detail, /usd/);
  assert.match(num[0].detail, /2000000/);
  assert.match(num[0].detail, /3500000/);
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

test("multiple conflicts per pair: no break after first unit or first antonym", () => {
  const multi = compareAnswers(
    { id: "A" }, { id: "B" },
    "Revenue grew 12% and $2 million was reserved.",
    "Revenue grew 10% and $3 million was reserved.",
  );
  const numUnits = new Set(multi.filter((c) => c.kind === "number_conflict").map((c) => c.detail.match(/"([^"]+)"/)?.[1] ?? "bare-count"));
  assert.equal(multi.filter((c) => c.kind === "number_conflict").length, 2);
  assert.ok(numUnits.has("%") && numUnits.has("usd"));
  const ants = compareAnswers(
    { id: "A" }, { id: "B" },
    "The deal is binding and exclusive.",
    "The deal is non-binding and non-exclusive.",
  );
  assert.equal(ants.filter((c) => c.kind === "antonym_conflict").length, 2);
});

test("antonym quotes are at least 3 words (fall back to fuller sentence)", () => {
  const conflicts = compareAnswers(
    { id: "A" }, { id: "B" },
    "Yes. The assignment is permitted.",
    "No. The assignment is prohibited.",
  );
  const a = conflicts.find((c) => c.kind === "antonym_conflict");
  assert.ok(a);
  for (const e of a.evidence) {
    assert.ok(e.quote.trim().split(/\s+/).length >= 3, `quote too short: "${e.quote}"`);
  }
  assert.match(a.evidence[0].quote, /permitted/);
  assert.match(a.evidence[1].quote, /prohibited/);
});

test("antonym evidence quotes anchor on whole words, not substrings", () => {
  const conflicts = compareAnswers(
    { id: "A" }, { id: "B" },
    "The contract is not assignable today. No assignment is permitted under it.",
    "Yes, assignment is currently permitted.",
  );
  const a = conflicts.find((c) => c.kind === "antonym_conflict");
  assert.ok(a);
  // "no" must anchor on the token "No", never the substring inside "not"
  assert.match(a.evidence[0].quote, /No assignment is permitted/);
});

test("crossCategory is off by default; keyword-anchored when enabled", () => {
  const CROSS = {
    items: [
      { id: "C-1", category: "financials", question: "What are the litigation reserves?",
        answers: [{ text: "We have reserved $3.5 million for pending lawsuits.", status: "sent", at: "2026-10-01" }] },
      { id: "C-2", category: "litigation", question: "Detail the pending litigation.",
        answers: [{ text: "There are 3 pending lawsuits with reserves of $4 million.", status: "sent", at: "2026-10-02" }] },
    ],
  };
  assert.deepEqual(detectContradictions(CROSS), []); // default: category-siloed only
  const cs = detectContradictions({ ...CROSS, settings: { crossCategory: true } });
  assert.equal(cs.length, 1);
  assert.equal(cs[0].crossCategory, true);
  assert.equal(cs[0].category, "financials × litigation");
  assert.deepEqual(cs[0].between, ["C-1", "C-2"]);
  // unanchored cross-category pairs stay quiet even when enabled; note this
  // pair IS keyword-anchored (shared "grew") — it stays quiet because the two
  // answers share no common unit or antonym pair, not because it is unanchored
  const LOOSE = {
    items: [
      { id: "L-1", category: "financials", question: "Revenue?",
        answers: [{ text: "Revenue grew 12%.", status: "sent", at: "2026-10-01" }] },
      { id: "L-2", category: "hr", question: "Headcount?",
        answers: [{ text: "The team grew by 40 people.", status: "sent", at: "2026-10-02" }] },
    ],
  };
  assert.deepEqual(detectContradictions({ ...LOOSE, settings: { crossCategory: true } }), []);
});

test("detectContradictions groups by category, compares drafts vs sent, skips same-item", () => {
  const cs = detectContradictions(INPUT);
  // litigation: Q-001 (3 pending) vs Q-002 (2 settled, none pending) → number + yes/no + settled/pending
  const lit = cs.filter((c) => c.category === "litigation");
  assert.equal(lit.length, 3);
  assert.ok(lit.some((c) => c.kind === "number_conflict" && c.between.join() === "Q-001,Q-002"));
  assert.ok(lit.some((c) => c.kind === "antonym_conflict" && c.detail.includes('"yes"')));
  assert.ok(lit.some((c) => c.kind === "antonym_conflict" && c.detail.includes("settled")));
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

test("readinessScore weights coverage, pipeline, consistency, provenance", () => {
  const cs = detectContradictions(INPUT);
  const r = readinessScore(INPUT, cs);
  // sent items: Q-001..Q-006, Q-008 (7/8); open: 1; contradicted: Q-001..Q-006 (6); cited sent: 5/8
  assert.equal(Math.round(r.components.coverage * 100), 88);
  assert.equal(Math.round(r.components.pipeline * 100), 88);
  assert.equal(Math.round(r.components.consistency * 100), 25);
  assert.equal(Math.round(r.components.provenance * 100), 63);
  assert.equal(r.score, Math.round(100 * (0.4 * 7 / 8 + 0.15 * 7 / 8 + 0.25 * 2 / 8 + 0.2 * 5 / 8)));
  assert.equal(r.score, 67);
  assert.equal(r.band, "nearly ready");
  assert.deepEqual(r.contradictedItems, ["Q-001", "Q-002", "Q-003", "Q-004", "Q-005", "Q-006"]);
});

test("readinessScore accepts custom weights and bands", () => {
  const cs = detectContradictions(INPUT);
  const r = readinessScore(INPUT, cs, { weights: { coverage: 1, pipeline: 0, consistency: 0, provenance: 0 }, bands: { nearly: 10, ready: 50 } });
  assert.equal(r.score, 88);
  assert.equal(r.band, "ready");
});

test("buildQaLog assembles summary, items, contradictions, readiness, aging", () => {
  const log = buildQaLog(INPUT);
  assert.equal(log.deal.name.includes("Copperfield"), true);
  assert.deepEqual(log.summary, { items: 8, sent: 7, draftOnly: 0, open: 1, pendingDrafts: 2, contradictions: 5, overdue: 5 });
  assert.equal(log.aging.asOf, "2026-10-23");
  assert.equal(log.aging.sla.breachDays, 5);
  const q3 = log.items.find((i) => i.id === "Q-003");
  assert.equal(q3.buyer, "Oryx Growth Partners");
  assert.equal(q3.status, "sent");
  assert.equal(q3.contradicted, true);
  assert.equal(q3.citations, null); // uncited sent answer → provenance gap
  const q1 = log.items.find((i) => i.id === "Q-001");
  assert.equal(q1.citations.length, 1);
  assert.equal(q1.daysOpen, 25);
  assert.equal(q1.sla, "overdue");
  assert.equal(log.readiness.score >= 0 && log.readiness.score <= 100, true);
});

test("qaLogToCsv exports one row per item with flags; qaLogToJson round-trips", () => {
  const log = buildQaLog(INPUT);
  const csv = qaLogToCsv(log);
  const lines = csv.trim().split("\n");
  assert.equal(lines.length, 9); // header + 8 items
  assert.match(lines[0], /^id,buyer,category,status/);
  assert.match(lines[0], /daysOpen,sla,citations,answers/);
  const q2 = lines.find((l) => l.startsWith("Q-002"));
  assert.match(q2, /number_conflict; antonym_conflict/);
  const q7 = lines.find((l) => l.startsWith("Q-007"));
  assert.match(q7, /,open,/);
  const q1 = lines.find((l) => l.startsWith("Q-001"));
  assert.match(q1, /25,overdue,1,/);
  const j = JSON.parse(qaLogToJson(log));
  assert.equal(j.summary.items, 8);
  assert.equal(j.contradictions.length, log.contradictions.length);
});

test("renderReport includes readiness, provenance, aging, citations, contradictions, answers", () => {
  const md = renderReport(buildQaLog(INPUT));
  assert.match(md, /# Sell-side Q&A log — Project Copperfield/);
  assert.match(md, /Disclosure readiness: \*\*\d+\/100/);
  assert.match(md, /provenance/);
  assert.match(md, /5 of 8 overdue/);
  assert.match(md, /DR-014` §2\.1/);
  assert.match(md, /number_conflict/);
  assert.match(md, /there are no pending lawsuits against the target/);
  assert.match(md, /All data fictional/);
});

test("DEFAULT_ANTONYM_PAIRS is non-empty rules-as-data", () => {
  assert.ok(DEFAULT_ANTONYM_PAIRS.length >= 8);
  assert.ok(DEFAULT_ANTONYM_PAIRS.some(([a, b]) => a === "permitted" && b === "prohibited"));
});

test("transition approve→send records approver+date and moves draft to sent", () => {
  const approved = transition(ITEMS[4], { type: "approve", approver: "A. Reyes (GC)", at: "2026-10-23" });
  const dr = approved.answers.find((a) => a.status === "draft");
  assert.equal(dr.approvedBy, "A. Reyes (GC)");
  assert.equal(dr.approvedAt, "2026-10-23");
  const sent = transition(approved, { type: "send" });
  assert.equal(sent.answers.some((a) => a.status === "draft"), false);
  assert.equal(itemStatus(sent), "sent");
  // immutability: the original item is untouched
  assert.equal(itemStatus(ITEMS[4]), "draft-pending");
  assert.equal(ITEMS[4].answers.some((a) => a.approvedBy), false);
});

test("transition refuses send without approve; validates events", () => {
  assert.throws(() => transition(ITEMS[4], { type: "send" }), /not approved/);
  assert.throws(() => transition(ITEMS[6], { type: "approve", approver: "x", at: "2026-10-23" }), /no pending draft/);
  assert.throws(() => transition(ITEMS[4], { type: "shred" }), /unknown event/);
});

test("releaseBlockers lists unapproved drafts and contradictions involving the item", () => {
  const cs = detectContradictions(INPUT);
  const b5 = releaseBlockers(ITEMS[4], cs); // Q-005: unapproved draft + conflicts with Q-006
  assert.ok(b5.some((b) => b.code === "unapproved"));
  assert.ok(b5.some((b) => b.detail.includes("Q-006")));
  const b8 = releaseBlockers(ITEMS[7], cs); // Q-008: unapproved draft, no contradictions
  assert.equal(b8.length, 1);
  assert.equal(b8[0].code, "unapproved");
  assert.deepEqual(releaseBlockers(ITEMS[2], cs), []); // Q-003: contradicted but nothing pending to release
});

test("buyerView projects one buyer's log; cross-buyer evidence redacted; scoped CSV", () => {
  const log = buildQaLog(INPUT);
  const v = buyerView(log, "B1");
  assert.deepEqual(v.items.map((i) => i.id), ["Q-001", "Q-003", "Q-006"]);
  assert.equal(v.summary.items, 3);
  assert.equal(v.summary.overdue, 3); // Q-001 25d, Q-003 7d, Q-006 5d — all past the 5-day breach
  assert.equal(v.contradictions.length, 0); // Q-001's conflicts were vs B2's Q-002 → redacted
  const j = JSON.stringify(v);
  assert.ok(!j.includes("Lantern Harbor") && !j.includes("Fairwind") && !j.includes("Q-002"));
  assert.equal(v.readiness.components.consistency, 1); // no within-view contradictions
  const csv = qaLogToCsv(v);
  assert.equal(csv.trim().split("\n").length, 4); // header + 3 items
});

test("buyerView recomputes contradicted from the scoped set (ethical wall)", () => {
  const log = buildQaLog(INPUT);
  const v = buyerView(log, "B1");
  // Q-001 is contradicted in the full log only via cross-buyer pairs (vs B2's
  // Q-002); the scoped set is empty, so B1 must not see even the *existence*
  // of a conflict — contradicted included
  const q1 = v.items.find((i) => i.id === "Q-001");
  assert.equal(log.items.find((i) => i.id === "Q-001").contradicted, true);
  assert.equal(q1.contradicted, false);
  for (const it of v.items) {
    assert.equal(it.contradicted, v.contradictions.some((c) => c.between.includes(it.id)));
  }
  // true direction: a within-buyer contradiction survives scoping
  const SCOPED = {
    deal: { name: "Scoped (fictional)" },
    buyers: [{ id: "B1", name: "One" }, { id: "B2", name: "Two" }],
    items: [
      { id: "S-1", buyerId: "B1", category: "ip", question: "Scope?", answers: [{ text: "The license is exclusive.", status: "sent", at: "2026-01-01" }] },
      { id: "S-2", buyerId: "B2", category: "licenses", question: "Scope?", answers: [{ text: "The license is non-exclusive.", status: "sent", at: "2026-01-02" }] },
      { id: "S-3", buyerId: "B1", category: "ip", question: "Scope?", answers: [{ text: "The license is non-exclusive.", status: "sent", at: "2026-01-03" }] },
      { id: "S-4", buyerId: "B1", category: "licenses", question: "Scope?", answers: [{ text: "The license is exclusive.", status: "sent", at: "2026-01-04" }] },
    ],
  };
  const full = buildQaLog(SCOPED);
  const b1 = buyerView(full, "B1");
  // full log: S-1×S-3 (both B1) and S-2×S-4 (cross-buyer) → all four flagged
  for (const id of ["S-1", "S-2", "S-3", "S-4"]) {
    assert.equal(full.items.find((i) => i.id === id).contradicted, true);
  }
  assert.equal(b1.items.find((i) => i.id === "S-1").contradicted, true); // within-buyer conflict survives scoping
  assert.equal(b1.items.find((i) => i.id === "S-3").contradicted, true);
  assert.equal(b1.items.find((i) => i.id === "S-4").contradicted, false); // S-4's only conflict was vs B2's S-2 → redacted
});

test("itemAging: daysOpen vs SLA bands; null without receivedAt/asOf", () => {
  assert.deepEqual(itemAging({ receivedAt: "2026-10-13" }, { asOf: "2026-10-23", sla: { warnDays: 3, breachDays: 5 } }), { daysOpen: 10, sla: "overdue" });
  assert.equal(itemAging({ receivedAt: "2026-10-20" }, { asOf: "2026-10-23", sla: { warnDays: 3, breachDays: 5 } }).sla, "due-soon");
  assert.equal(itemAging({ receivedAt: "2026-10-22" }, { asOf: "2026-10-23" }).sla, "on-track"); // default SLA
  assert.deepEqual(itemAging({}, { asOf: "2026-10-23" }), { daysOpen: null, sla: null });
  assert.deepEqual(itemAging({ receivedAt: "2026-10-01" }, {}), { daysOpen: null, sla: null });
  assert.equal(DEFAULT_SLA.breachDays, 5);
});

test("aging absent asOf: no daysOpen, no overdue", () => {
  const log = buildQaLog({ ...INPUT, settings: {} });
  assert.equal(log.aging, null);
  assert.equal(log.items[0].daysOpen, null);
  assert.equal(log.items[0].sla, null);
  assert.equal(log.summary.overdue, 0);
});

test("determinism: byte-identical output on rerun (deep-cloned input)", () => {
  const a = qaLogToJson(buildQaLog(INPUT));
  const b = qaLogToJson(buildQaLog(JSON.parse(JSON.stringify(INPUT))));
  assert.equal(a, b);
  const c = renderReport(buildQaLog(JSON.parse(JSON.stringify(INPUT))));
  assert.equal(c, renderReport(buildQaLog(JSON.parse(JSON.stringify(INPUT)))));
});

test("robustness: buildQaLog({}) returns a valid empty log", () => {
  const empty = buildQaLog({});
  assert.deepEqual(empty.summary, { items: 0, sent: 0, draftOnly: 0, open: 0, pendingDrafts: 0, contradictions: 0, overdue: 0 });
  assert.deepEqual(empty.items, []);
  assert.deepEqual(empty.contradictions, []);
  assert.ok(Number.isFinite(empty.readiness.score));
  assert.match(qaLogToCsv(empty).trim().split("\n")[0], /^id,buyer,/);
});

test("robustness: duplicate ids and malformed items do not throw; deterministic", () => {
  const dup = {
    items: [
      { id: "D-1", category: "x", question: "a?", answers: [{ text: "Yes. One breach occurred.", status: "sent", at: "2026-01-01" }] },
      { id: "D-1", category: "x", question: "a?", answers: [{ text: "No breaches occurred.", status: "sent", at: "2026-01-02" }] },
      {},
    ],
  };
  const log = buildQaLog(dup);
  assert.equal(log.summary.items, 3);
  assert.equal(log.contradictions.length, 0); // same-id pairs are treated as the same item → skipped
  const again = buildQaLog(JSON.parse(JSON.stringify(dup)));
  assert.equal(qaLogToJson(log), qaLogToJson(again));
});
