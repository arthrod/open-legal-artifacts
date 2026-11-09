import { test } from "node:test";
import assert from "node:assert/strict";
import { DEMO_FAMILY_ID, demoPlaybook, lineageForSubmit } from "./demo_playbook.ts";

/* ---------- demo record (demoPlaybook) ---------- */

test("demoPlaybook: stable demo family id for the public sample", () => {
  assert.equal(DEMO_FAMILY_ID, "demo-sample-nda");
});

test("demoPlaybook: fictional mutual-NDA record with three rules", () => {
  const record = demoPlaybook();
  assert.equal(record.name, "Sample mutual NDA");
  assert.equal(record.brief.intent, "full_playbook");
  assert.equal(record.brief.audience, "legal");
  assert.equal(record.brief.our_side, "disclosing party");
  assert.equal(record.agreement_type, "mutual NDA");
  assert.equal(record.vault_only, false);
  assert.deepEqual(record.rules.map((r) => r.id), ["demo-term", "demo-use", "demo-compelled"]);
  assert.deepEqual(record.rules.map((r) => r.topic), [
    "Term and survival",
    "Use and disclosure",
    "Compelled disclosure",
  ]);
});

test("demoPlaybook: every rule quote is grounded in the stored source excerpt", () => {
  const record = demoPlaybook();
  for (const rule of record.rules) {
    assert.ok(
      record.source_excerpt.includes(rule.source_quote),
      `source_quote for ${rule.id} must appear in source_excerpt`,
    );
    assert.equal(rule.source_quote, rule.sample_language);
  }
});

test("demoPlaybook: returns a fresh object each call (no shared mutable state)", () => {
  const a = demoPlaybook();
  const b = demoPlaybook();
  assert.notEqual(a, b);
  a.rules[0].topic = "mutated";
  assert.equal(b.rules[0].topic, "Term and survival");
});

/* ---------- lineage guard (lineageForSubmit) ---------- */

test("lineageForSubmit: passes an ordinary family id through", () => {
  assert.equal(lineageForSubmit("fam-123"), "fam-123");
});

test("lineageForSubmit: empty, blank and undefined start a new family", () => {
  assert.equal(lineageForSubmit(undefined), undefined);
  assert.equal(lineageForSubmit(""), undefined);
  assert.equal(lineageForSubmit("   "), undefined);
});

test("lineageForSubmit: rejects submissions into the demo lineage", () => {
  assert.throws(
    () => lineageForSubmit(DEMO_FAMILY_ID),
    /the sample playbook is stored as a demo and cannot take new versions/,
  );
});
