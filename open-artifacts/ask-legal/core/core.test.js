/** Tests for ask-legal core. Run: node --test (from artifact root) */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tokenize, retrieve, gaugeConfidence, routeTo, answerQuestion,
  createAuditLog, exportAuditLog, DEFAULT_THRESHOLDS,
} from "./core.js";

const KB = [
  {
    id: "kb-nda",
    question: "Which NDA template should I use for a prospective vendor?",
    answer: "Use the Mutual NDA (Form L-102) for all prospective vendors. Route exceptions to Commercial Legal.",
    tags: ["nda", "vendor", "contracts"],
    jurisdiction: "US",
    updated: "2026-09-15",
    approvedBy: "A. Fern (fictional)",
  },
  {
    id: "kb-nda-consultant",
    question: "Which NDA template should I use for an individual consultant?",
    answer: "Use the Consultant NDA (Form L-104) with the IP assignment rider attached.",
    tags: ["nda", "consultant", "contracts"],
    jurisdiction: "US",
    updated: "2026-09-20",
    approvedBy: "A. Fern (fictional)",
  },
  {
    id: "kb-expenses",
    question: "Can I expense client entertainment over $500?",
    answer: "Entertainment over $500 needs pre-approval from Finance and the matter partner.",
    tags: ["expenses", "finance"],
    jurisdiction: "US",
    updated: "2026-01-10",
    approvedBy: "Finance (fictional)",
  },
  {
    id: "kb-stale-privacy",
    question: "How long do we retain website visitor data?",
    answer: "Current policy: 26 months, per the 2024 retention schedule.",
    tags: ["privacy", "data-retention"],
    jurisdiction: "US",
    updated: "2024-03-01", // very stale
    approvedBy: "Privacy Team (fictional)",
  },
];
const ROUTING = { privacy: "privacy-counsel", expenses: "finance-ops", contracts: "commercial-legal", default: "legal-intake" };

test("tokenize removes stopwords and punctuation", () => {
  assert.deepEqual(tokenize("What is the NDA template for a Vendor?"), ["nda", "template", "vendor"]);
});

test("retrieve ranks by tag hits + term overlap, deterministically", () => {
  const r = retrieve(KB, "Which NDA template should I use for a vendor?");
  assert.equal(r[0].entry.id, "kb-nda");
  assert.ok(r[0].score >= r.find((x) => x.entry.id === "kb-nda-consultant").score);
  assert.ok(r[0].matchedTags.includes("nda"));
  assert.equal(r.find((x) => x.entry.id === "kb-expenses"), undefined); // zero overlap -> not retrieved, not guessed
});

test("retrieve returns empty array on zero overlap (no guessing)", () => {
  assert.equal(retrieve(KB, "astronaut helmet certification").length, 0);
});

test("gaugeConfidence: high on a strong unique match", () => {
  const g = gaugeConfidence(KB, "Can I expense client entertainment over $500 for a matter?", {}, "2026-11-07");
  assert.equal(g.level, "high");
  assert.ok(g.reasons.length >= 2);
  assert.match(g.reasons.join(" "), /freshness|verified/);
});

test("gaugeConfidence: ambiguity between close entries downgrades high → medium", () => {
  // nda vs nda-consultant both match strongly
  const g = gaugeConfidence(KB, "Which NDA template should I use?", {}, "2026-11-07");
  assert.equal(g.level, "medium");
  assert.match(g.reasons.join(" "), /downgraded: runner-up/);
});

test("gaugeConfidence: stale guidance is downgraded one tier with a written reason", () => {
  // strong match (would be high) but guidance is 986d old -> medium
  const g = gaugeConfidence(KB, "How long do we retain website visitor data per the privacy policy?", {}, "2026-11-07");
  assert.equal(g.level, "medium");
  assert.match(g.reasons.join(" "), /freshness window/);
  // would-be medium match that is also stale -> low (escalates)
  const weak = gaugeConfidence(KB, "What is our data-retention approach?", { high: 99 }, "2026-11-07");
  if (weak.top && weak.top.id === "kb-stale-privacy") assert.equal(weak.level, "low");
});

test("gaugeConfidence: no match is low with explicit reason", () => {
  const g = gaugeConfidence(KB, "astronaut helmet certification");
  assert.equal(g.level, "low");
  assert.equal(g.top, null);
  assert.match(g.reasons[0], /no knowledge-base entry/);
});

test("routeTo resolves tags against the routing table, falls back to default", () => {
  assert.equal(routeTo(KB[3], ROUTING), "privacy-counsel");
  assert.equal(routeTo(null, ROUTING), "legal-intake");
  assert.equal(routeTo({ tags: ["unknown-topic"] }, ROUTING), "legal-intake");
});

test("answerQuestion answers high/medium, escalates low with no answer text", () => {
  const log = createAuditLog();
  const ok = answerQuestion(KB, "Can I expense client entertainment over $500?", { asOf: "2026-11-07", askedBy: "j.moreau@example.test", routing: ROUTING }, log);
  assert.equal(ok.answered, true);
  assert.equal(ok.confidence.level, "high");
  assert.equal(ok.escalate, false);
  assert.equal(ok.answer, KB[2].answer);

  const esc = answerQuestion(KB, "Do we need a license to launch a satellite?", { asOf: "2026-11-07", askedBy: "j.moreau@example.test", routing: ROUTING }, log);
  assert.equal(esc.answered, false);
  assert.equal(esc.answer, null);
  assert.equal(esc.escalate, true);
  assert.equal(esc.route, "legal-intake");
});

test("audit log records every question, matched ids, confidence, and escalation", () => {
  const log = createAuditLog();
  answerQuestion(KB, "Which NDA template should I use for a vendor?", { asOf: "2026-11-07T10:00:00Z", askedBy: "s.okafor@example.test" }, log);
  answerQuestion(KB, "astronaut helmet certification", { asOf: "2026-11-07T10:05:00Z", askedBy: "s.okafor@example.test" }, log);
  assert.equal(log.length, 2);
  assert.equal(log[0].auditId, "AUD-00001");
  assert.ok(log[0].matched.includes("kb-nda"));
  assert.equal(log[1].escalated, true);
  assert.match(exportAuditLog(log), /"auditId":"AUD-00001"/);
  assert.equal(exportAuditLog(log).trim().split("\n").length, 2);
});

test("thresholds are configurable rules-as-data", () => {
  // same question, stricter bar → medium instead of high
  const q = "Can I expense client entertainment over $500 for a matter?";
  assert.equal(gaugeConfidence(KB, q, {}, "2026-11-07").level, "high");
  assert.equal(gaugeConfidence(KB, q, { high: DEFAULT_THRESHOLDS.high + 50 }, "2026-11-07").level, "medium");
});
