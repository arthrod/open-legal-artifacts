/** Tests for ask-legal core. Run: node --test (from artifact root) */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  tokenize, foldToken, retrieve, gaugeConfidence, routeTo, answerQuestion,
  createAuditLog, exportAuditLog, DEFAULT_THRESHOLDS, DEFAULT_SYNONYMS,
  validateKb, applyCorrection, approveEntry, escalationTicket, overdueEscalations,
  loadAudit, saveAudit,
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
  assert.deepEqual(tokenize("Do we need a license to launch a satellite?"), ["license", "launch", "satellite"]); // 'need'/'needs' are stopwords — low-information verbs must not create matches
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
  // strong match (would be high) but guidance is 981d old -> medium
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

/* ---------- A: jurisdiction gating ---------- */

test("jurisdiction mismatch downgrades one tier with a written reason", () => {
  const q = "Can I expense client entertainment over $500 for a matter?"; // US entry, would be high
  assert.equal(answerQuestion(KB, q, { asOf: "2026-11-07" }, createAuditLog()).confidence.level, "high");
  const eu = answerQuestion(KB, q, { asOf: "2026-11-07", jurisdiction: "EU" }, createAuditLog());
  assert.equal(eu.confidence.level, "medium");
  assert.match(eu.confidence.reasons.join(" "), /jurisdiction mismatch/);
  assert.match(eu.confidence.reasons.join(" "), /EU/);
  // matching jurisdiction leaves the level untouched
  const us = answerQuestion(KB, q, { asOf: "2026-11-07", jurisdiction: "us" }, createAuditLog()); // case-insensitive
  assert.equal(us.confidence.level, "high");
});

/* ---------- B: correction loop ---------- */

test("applyCorrection: pending entry is unretrievable until approved, then serves", () => {
  const kb = JSON.parse(JSON.stringify(KB));
  const log = createAuditLog();
  const esc = answerQuestion(kb, "Do we need a license to launch a satellite?", { asOf: "2026-11-07", askedBy: "t.nguyen@example.test" }, log);
  assert.equal(esc.escalate, true);

  const { entry } = applyCorrection(kb, log, {
    auditId: esc.auditId,
    answer: "Fictional guidance: marketing satellite launches need a written waiver from Commercial Legal.",
    approvedBy: "A. Fern, Deputy GC (fictional)", // submitting lawyer
    tags: ["satellite", "licensing"],
    updated: "2026-11-07",
  });
  assert.equal(entry.status, "pending-approval");
  assert.equal(entry.sourceAuditId, esc.auditId);
  assert.equal(entry.question, "Do we need a license to launch a satellite?"); // pulled from the audit link
  // pending: not retrieved, not served — but does not poison validation of the rest
  assert.equal(retrieve(kb, "Do we need a license to launch a satellite?").find((r) => r.entry.id === entry.id), undefined);
  assert.equal(validateKb(kb).length, 0);

  approveEntry(kb, entry.id, "D. Voss, GC (fictional)");
  assert.equal(entry.status, "approved");
  assert.equal(entry.approvedBy, "D. Voss, GC (fictional)");
  const after = answerQuestion(kb, "Do we need a license to launch a satellite?", { asOf: "2026-11-07" }, log);
  assert.equal(after.answered, true);
  assert.equal(after.sourceId, entry.id);
});

test("applyCorrection rejects unknown audit ids; approveEntry guards state", () => {
  const kb = JSON.parse(JSON.stringify(KB));
  assert.throws(() => applyCorrection(kb, createAuditLog(), { auditId: "AUD-99999", answer: "x", updated: "2026-11-07" }), /AUD-99999/);
  assert.throws(() => approveEntry(kb, "kb-nda", "X (fictional)"), /pending-approval/); // already approved
  assert.throws(() => approveEntry(kb, "kb-nope", "X (fictional)"), /kb-nope/);
});

/* ---------- C: escalation ticket ---------- */

test("escalationTicket drafts a deterministic, JSON-serializable intake ticket", () => {
  const log = createAuditLog();
  const esc = answerQuestion(KB, "Do we need a license to launch a satellite for marketing?", { asOf: "2026-11-07", askedBy: "t.nguyen@example.test", routing: ROUTING }, log);
  const ticket = escalationTicket(esc, log);
  assert.deepEqual(Object.keys(ticket).sort(), ["asker", "matchedIds", "question", "reasons", "route", "suggestedEntry"]);
  assert.equal(ticket.route, "legal-intake");
  assert.equal(ticket.question, "Do we need a license to launch a satellite for marketing?");
  assert.equal(ticket.asker, "t.nguyen@example.test");
  assert.deepEqual(ticket.matchedIds, []);
  assert.equal(ticket.suggestedEntry, null); // zero-match escalation has nothing to suggest
  assert.deepEqual(JSON.parse(JSON.stringify(ticket)), ticket);

  // low-confidence-but-matched escalation suggests the closest entry for the lawyer
  const low = answerQuestion(KB, "What is our data-retention approach?", { asOf: "2026-11-07" }, log);
  assert.equal(low.escalate, true);
  const t2 = escalationTicket(low, log);
  assert.deepEqual(t2.suggestedEntry, { id: "kb-stale-privacy", question: "How long do we retain website visitor data?" });
  assert.ok(t2.matchedIds.includes("kb-stale-privacy"));
});

/* ---------- D: provisional flag ---------- */

test("medium answers are flagged provisional; low escalates with no answer", () => {
  const log = createAuditLog();
  const med = answerQuestion(KB, "Which NDA template should I use?", { asOf: "2026-11-07" }, log);
  assert.equal(med.confidence.level, "medium");
  assert.equal(med.provisional, true);
  assert.match(med.label, /Provisional guidance — confirm with Legal\./);
  const hi = answerQuestion(KB, "Can I expense client entertainment over $500?", { asOf: "2026-11-07" }, log);
  assert.equal(hi.provisional, false);
  assert.equal(hi.label, null);
  const low = answerQuestion(KB, "astronaut helmet certification", { asOf: "2026-11-07" }, log);
  assert.equal(low.answer, null);
  assert.equal(low.provisional, false);
});

/* ---------- E: KB validation ---------- */

test("validateKb flags unapproved guidance; answerQuestion refuses an invalid KB", () => {
  assert.deepEqual(validateKb(KB), []); // baseline KB is clean
  const bad = JSON.parse(JSON.stringify(KB));
  delete bad[0].approvedBy;
  const issues = validateKb(bad);
  assert.ok(issues.some((i) => i.entryId === "kb-nda" && i.field === "approvedBy"));
  assert.throws(
    () => answerQuestion(bad, "Which NDA template should I use for a vendor?", { asOf: "2026-11-07" }),
    /knowledge base failed validation/
  );
});

/* ---------- F: routing SLAs ---------- */

test("routing SLAs: object routes carry {team, slaDays}; overdueEscalations flags breaches", () => {
  const routing = { privacy: { team: "privacy-counsel", slaDays: 3 }, default: { team: "legal-intake", slaDays: 3 } };
  assert.equal(routeTo(KB[3], routing), "privacy-counsel"); // object form resolves like strings
  const log = [
    { auditId: "AUD-00001", escalated: true, route: "privacy-counsel", ts: "2026-11-03" }, // 4d old > 3d SLA
    { auditId: "AUD-00002", escalated: true, route: "privacy-counsel", ts: "2026-11-06" }, // 1d old, within SLA
    { auditId: "AUD-00003", escalated: false, route: null, ts: "2026-11-01" }, // not an escalation
    { auditId: "AUD-00004", escalated: true, route: "unknown-team", ts: "2026-11-01" }, // no SLA configured → not flagged
  ];
  const overdue = overdueEscalations(log, routing, "2026-11-07");
  assert.equal(overdue.length, 1);
  assert.equal(overdue[0].auditId, "AUD-00001");
  assert.equal(overdue[0].route, "privacy-counsel");
  assert.equal(overdue[0].slaDays, 3);
  assert.equal(overdue[0].ageDays, 4);
  assert.equal(overdue[0].overdueByDays, 1);
});

/* ---------- G: retrieval hardening ---------- */

test("plural folding: 'vendors' query hits kb-nda 'vendor' terms", () => {
  const r = retrieve(KB, "template for new vendors");
  const hit = r.find((x) => x.entry.id === "kb-nda");
  assert.ok(hit, "kb-nda retrieved");
  assert.ok(hit.matchedTerms.includes("vendor"), `matchedTerms=${hit.matchedTerms}`);
});

test("short tags no longer substring-match: query 'tips' does not hit tag 'ip'", () => {
  const kb = [{ id: "kb-ip", question: "Who owns inventions?", answer: "Invention assignment policy applies.", tags: ["ip"], jurisdiction: "US", updated: "2026-01-01", approvedBy: "X (fictional)" }];
  assert.equal(retrieve(kb, "any tips for the launch?").length, 0); // zero overlap → not retrieved, not guessed
});

test("foldToken: -es after a non-sibilant stem keeps the 'e' (licenses → license)", () => {
  assert.equal(foldToken("licenses"), "license");
  assert.equal(foldToken("clauses"), "clause");
  assert.equal(foldToken("expenses"), "expense");
  // true -es plurals (sibilant stems) still strip both letters
  assert.equal(foldToken("boxes"), "box");
  assert.equal(foldToken("buzzes"), "buzz");
  assert.equal(foldToken("watches"), "watch");
  assert.equal(foldToken("dishes"), "dish");
  assert.equal(foldToken("classes"), "class");
  // regression guards: plain -s and untouched words
  assert.equal(foldToken("vendors"), "vendor");
  assert.equal(foldToken("business"), "business");
});

test("retrieve: query 'expenses' matches the 'expenses' tag/answer via license-class folding", () => {
  const r = retrieve(KB, "entertainment expenses");
  const hit = r.find((x) => x.entry.id === "kb-expenses");
  assert.ok(hit, "kb-expenses retrieved");
  assert.ok(hit.matchedTags.includes("expenses"));
});

test("approveEntry refuses corrections that would poison validateKb", () => {
  const kb = JSON.parse(JSON.stringify(KB));
  const log = createAuditLog();
  const esc = answerQuestion(kb, "Do we need a license to launch a satellite?", { asOf: "2026-11-07" }, log);
  const { entry } = applyCorrection(kb, log, {
    auditId: esc.auditId,
    answer: "Fictional guidance: marketing satellite launches need a written waiver from Commercial Legal.",
    approvedBy: "A. Fern, Deputy GC (fictional)",
    // updated omitted — must block approval, not poison the KB
  });
  assert.throws(() => approveEntry(kb, entry.id, "D. Voss, GC (fictional)"), /updated/);
  assert.equal(entry.status, "pending-approval"); // refusal leaves the entry pending
  entry.updated = "not-a-date";
  assert.throws(() => approveEntry(kb, entry.id, "D. Voss, GC (fictional)"), /updated/);
  entry.updated = "2026-11-07";
  entry.answer = "   ";
  assert.throws(() => approveEntry(kb, entry.id, "D. Voss, GC (fictional)"), /answer/);
  entry.answer = "Fictional guidance: written waiver from Commercial Legal required.";
  approveEntry(kb, entry.id, "D. Voss, GC (fictional)");
  assert.equal(validateKb(kb).length, 0); // approved KB stays servable end-to-end
});

test("synonym map (rules-as-data) expands query vocabulary", () => {
  const r = retrieve(KB, "which confidentiality form for a new vendor?", DEFAULT_SYNONYMS);
  const hit = r.find((x) => x.entry.id === "kb-nda");
  assert.ok(hit, "kb-nda retrieved via confidentiality→nda synonym");
  assert.ok(hit.matchedTags.includes("nda"));
});

/* ---------- H: durable audit log (persistence round-trip) ---------- */

test("saveAudit/loadAudit round-trip: a reloaded log continues AUD numbering — reload no longer wipes history", () => {
  const log = createAuditLog();
  answerQuestion(KB, "Which NDA template should I use for a vendor?", { asOf: "2026-11-07", askedBy: "s.okafor@example.test" }, log);
  answerQuestion(KB, "astronaut helmet certification", { asOf: "2026-11-07", askedBy: "s.okafor@example.test" }, log);
  const persisted = saveAudit(log);
  const reloaded = loadAudit(persisted);
  assert.deepEqual(reloaded, log); // full-fidelity reload: nothing dropped or reordered
  // the demo-persistence pin: answering after a reload appends, never restarts numbering
  const next = answerQuestion(KB, "Can I expense client entertainment over $500?", { asOf: "2026-11-07" }, reloaded);
  assert.equal(next.auditId, "AUD-00003");
  assert.equal(reloaded.length, 3);
  assert.deepEqual(loadAudit(saveAudit(reloaded)).map((e) => e.auditId), ["AUD-00001", "AUD-00002", "AUD-00003"]);
});

test("loadAudit refuses malformed input with line numbers — never silently repairs", () => {
  assert.deepEqual(loadAudit(""), []);
  assert.deepEqual(loadAudit(null), []);
  assert.deepEqual(loadAudit(saveAudit([])), []);
  assert.throws(() => loadAudit("{not json}\n{\"auditId\":\"AUD-00001\"}"), /line 1/);
  assert.throws(() => loadAudit("{\"auditId\":\"AUD-00001\"}\n[1,2]"), /line 2/);
  assert.throws(() => loadAudit("{\"question\":\"no id\"}"), /auditId/);
  assert.throws(
    () => loadAudit("{\"auditId\":\"AUD-00001\"}\n{\"auditId\":\"AUD-00001\"}"),
    /duplicate auditId AUD-00001/
  );
});

test("saveAudit refuses to persist a corrupted log and matches exportAuditLog byte-for-byte on real logs", () => {
  assert.throws(() => saveAudit([{ question: "entry without an id" }]), /auditId/);
  assert.throws(() => saveAudit(["not an object"]), /not an object/);
  assert.throws(() => saveAudit([{ auditId: "AUD-00001" }, { auditId: "AUD-00001" }]), /duplicate auditId AUD-00001/);
  const log = createAuditLog();
  answerQuestion(KB, "astronaut helmet certification", { asOf: "2026-11-07" }, log);
  assert.equal(saveAudit(log), exportAuditLog(log)); // validation never changes the on-disk format
});

test("loadAudit reads the shipped examples/audit-log.jsonl and saveAudit reproduces it byte-for-byte", () => {
  const jsonl = readFileSync(new URL("../examples/audit-log.jsonl", import.meta.url), "utf8");
  const log = loadAudit(jsonl);
  assert.equal(log.length, 5);
  assert.equal(log[log.length - 1].auditId, "AUD-00005");
  assert.equal(saveAudit(log), jsonl); // durable form is the shipped artifact itself
});
