import { test } from "node:test";
import assert from "node:assert/strict";
import { selectGrounding, type KbEntry } from "./grounding.ts";

// Grounding selection for /api/ask-legal: deterministic pre-selection of
// which approved KB entries enter the LLM prompt. Pure — same question ⇒
// same selection. Snapshot of the demo KB (open-artifacts/ask-legal/demo/example.js).

const KB: KbEntry[] = [
  { id: "kb-001", question: "Which NDA template should I use for a prospective vendor?", answer: "Use the Mutual NDA (Form L-102) for all prospective vendors; do not sign the vendor's own paper.", tags: ["nda", "vendor", "contracts"], jurisdiction: "US", updated: "2026-09-15", approvedBy: "A. Fern" },
  { id: "kb-002", question: "Which NDA template should I use for an individual consultant?", answer: "Use the Consultant NDA (Form L-104) with the IP assignment rider attached.", tags: ["nda", "consultant", "contracts"], jurisdiction: "US", updated: "2026-09-20", approvedBy: "A. Fern" },
  { id: "kb-003", question: "Can I expense client entertainment over $500?", answer: "Entertainment above $500 requires pre-approval from Finance and the responsible partner.", tags: ["expenses", "finance"], jurisdiction: "US", updated: "2026-06-02", approvedBy: "Finance Committee" },
  { id: "kb-004", question: "How do I report a suspected data privacy incident?", answer: "Email security-incidents@example.test within 1 hour of discovery.", tags: ["privacy", "security", "incident"], jurisdiction: "US", updated: "2026-10-30", approvedBy: "R. Castellan" },
  { id: "kb-005", question: "How long do we retain website visitor data?", answer: "26 months per the 2024 retention schedule, then anonymize or delete.", tags: ["privacy", "data-retention"], jurisdiction: "US", updated: "2024-03-01", approvedBy: "Privacy Team" },
];

test("NDA vendor question ranks the vendor NDA entry first", () => {
  const hits = selectGrounding(KB, "Which NDA template do I use for a new analytics vendor?");
  assert.ok(hits.length >= 1);
  assert.equal(hits[0].entry.id, "kb-001");
  assert.ok(hits[0].score > 0);
});

test("plural folding: 'vendors' matches 'vendor'", () => {
  const hits = selectGrounding(KB, "guidance for onboarding new vendors");
  assert.ok(hits.some((h) => h.entry.id === "kb-001"));
});

test("no overlap ⇒ empty selection (route must escalate, never guess)", () => {
  assert.deepEqual(selectGrounding(KB, "Do we need a license to launch a satellite for the marketing team?"), []);
});

test("pending-approval entries are never selected", () => {
  const kb = [...KB, { id: "kb-006", question: "satellite license marketing", answer: "draft", tags: ["marketing"], status: "pending-approval" } as KbEntry];
  assert.deepEqual(selectGrounding(kb, "satellite license marketing"), [], "pending corrections are invisible");
});

test("ranked best-first; ties broken by id", () => {
  const hits = selectGrounding(KB, "How long do we retain website visitor data?");
  assert.ok(hits.length >= 2);
  assert.equal(hits[0].entry.id, "kb-005", "the retention entry outranks the incident entry");
  const scores = hits.map((h) => h.score);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a), "scores are non-increasing");
  const tie = selectGrounding(
    [
      { id: "kb-b", question: "vendor onboarding", answer: "x", tags: ["vendor"] },
      { id: "kb-a", question: "vendor onboarding", answer: "x", tags: ["vendor"] },
    ] as KbEntry[],
    "vendor onboarding",
  );
  assert.deepEqual(tie.map((h) => h.entry.id), ["kb-a", "kb-b"], "equal scores fall back to id order");
});

test("limit is respected (default caps prompt size)", () => {
  const hits = selectGrounding(KB, "nda vendor consultant contract privacy incident expenses", { limit: 2 });
  assert.ok(hits.length <= 2);
  assert.deepEqual(selectGrounding(KB, "nda", { limit: 0 }), []);
});

test("empty/odd inputs are safe", () => {
  assert.deepEqual(selectGrounding([], "anything"), []);
  assert.deepEqual(selectGrounding(KB, ""), []);
  assert.deepEqual(selectGrounding(KB, "?!."), []);
});
