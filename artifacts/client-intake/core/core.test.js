/**
 * client-intake demo core tests — three worked examples (one per matter area:
 * landlord-tenant, employment dismissal, contract breach) plus catalog,
 * party-extraction, urgency-rule and reference checks.
 *
 * Run: node --test "core/*.test.js"
 * All data fictional. Deterministic: every date is explicit.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  AREAS,
  PERSONAS,
  proposeQuestions,
  fieldsForArea,
  firstMissingRequired,
  extractParties,
  classifyName,
  urgencyFlags,
  buildFirmSummary,
  confirmIntake,
  makeReference,
  summaryText,
} from "./core.js";

const AS_OF = "2026-11-07";

// ------------------------------------------------ worked example factories

function workedExample(area, overrides = {}) {
  const proposal = proposeQuestions(area);
  const answers = {};
  for (const q of proposal.questions) {
    // accept every suggested draft, except where the example rewrites one
    answers[q.id] = overrides[q.id] ?? q.draft;
  }
  answers.matter_area = area;
  answers.persona = "client";
  return { proposal, answers };
}

// ============================================ worked example 1: landlord / tenant

const LT = workedExample("landlord_tenant", {
  full_name: "Mara Ellison",
  contact_method: "Phone call",
  contact_detail: "555-0143",
  key_dates: "Court date 2026-11-18 for the eviction hearing",
  matter_detail: "My landlord filed an eviction after I withheld part of one rent payment over ignored repairs.",
});

test("worked example 1 — landlord/tenant proposal shape", () => {
  const p = LT.proposal;
  assert.equal(p.area, "landlord_tenant");
  assert.equal(p.areaLabel, "Landlord / tenant dispute");
  assert.ok(p.intro.length > 10);
  assert.ok(p.empathyNote.length > 0); // client persona gets empathy
  const ids = p.questions.map((q) => q.id);
  assert.deepEqual(ids, [
    "full_name", "contact_method", "contact_detail", "opposing_parties",
    "jurisdiction", "key_dates", "documents", "desired_outcome", "urgency", "matter_detail",
  ]);
  const byId = Object.fromEntries(p.questions.map((q) => [q.id, q]));
  assert.equal(byId.key_dates.type, "date");
  assert.equal(byId.urgency.type, "choice");
  assert.equal(byId.urgency.options.length, 5);
  assert.ok(byId.full_name.required);
  assert.ok(byId.contact_detail.required);
  assert.ok(byId.opposing_parties.required);
  assert.ok(!byId.documents.required);
  for (const q of p.questions) {
    assert.ok(["text", "choice", "date"].includes(q.type), `${q.id} type`);
    assert.ok(q.label.length > 0, `${q.id} label`);
  }
});

test("worked example 1 — required-field gate", () => {
  const missing = firstMissingRequired(LT.proposal.questions, { ...LT.answers, full_name: "" });
  assert.equal(missing?.id, "full_name");
  assert.equal(firstMissingRequired(LT.proposal.questions, LT.answers), null);
});

test("worked example 1 — parties extracted from opposing field", () => {
  const parties = extractParties(LT.answers.opposing_parties);
  assert.deepEqual(parties, [
    { name: "Copperfield Property Management LLC", kind: "entity", role: "opposing" },
  ]);
});

test("worked example 1 — court date + deadline within 30 days → urgent", () => {
  const flags = urgencyFlags(LT.answers, AS_OF);
  const rules = flags.map((f) => f.rule);
  assert.ok(rules.includes("deadline-within-30-days"));
  assert.ok(rules.includes("court-date-mentioned"));
  const d = flags.find((f) => f.rule === "deadline-within-30-days");
  assert.equal(d.date, "2026-11-18");
  assert.match(d.reason, /11 days away/);
  assert.ok(flags.every((f) => f.level === "urgent" && f.escalate));
});

test("worked example 1 — firm summary and confirmed record", () => {
  const firm = buildFirmSummary(LT.answers, AS_OF);
  assert.match(firm.summary, /^Landlord \/ tenant dispute matter\./);
  assert.ok(firm.summary.includes("Mara Ellison"));
  assert.equal(firm.jurisdiction, "Franklin County, Ohio");
  const roles = firm.conflict_parties.map((p) => `${p.name}:${p.role}`);
  assert.deepEqual(roles, ["Mara Ellison:client", "Copperfield Property Management LLC:opposing"]);
  assert.equal(firm.urgency.escalate, true);
  assert.equal(firm.urgency.deadline_note, "2026-11-18");

  const record = confirmIntake({
    persona: "client",
    matterArea: "landlord_tenant",
    narrative: "Landlord filed an eviction after a repair dispute.",
    answers: LT.answers,
    asOf: AS_OF,
    refRand: 0.5,
  });
  assert.equal(record.reference, "INT-2611-I000");
  assert.ok(record.next_steps.length >= 3);
  assert.match(record.next_steps[0], /deadline or court date was flagged/i);
  const text = summaryText(record);
  assert.match(text, /# Intake INT-2611-I000/);
  assert.match(text, /Copperfield Property Management LLC — entity \/ opposing/);
});

// ======================================= worked example 2: employment dismissal

const EMP = workedExample("employment", {
  full_name: "Dev Okafor",
  contact_method: "Email",
  contact_detail: "dev.okafor@example.org",
  key_dates: "Termination letter 2026-10-29; administrative filing deadline 2026-12-01",
});

test("worked example 2 — employment dismissal proposal", () => {
  const p = EMP.proposal;
  assert.equal(p.empathyNote.length > 0, true);
  const ids = p.questions.map((q) => q.id);
  assert.deepEqual(ids, [
    "full_name", "contact_method", "contact_detail", "opposing_parties",
    "jurisdiction", "key_dates", "documents", "desired_outcome", "urgency", "matter_detail",
  ]);
  assert.equal(p.questions.find((q) => q.id === "opposing_parties").draft, "Brightpath Solar LLC");
});

test("worked example 2 — person + entity extraction with 'and' heuristic", () => {
  const parties = extractParties(
    "Brightpath Solar LLC and Dana Whitfield (my former supervisor)",
    "opposing",
  );
  assert.deepEqual(parties, [
    { name: "Brightpath Solar LLC", kind: "entity", role: "opposing" },
    { name: "Dana Whitfield", kind: "person", role: "opposing" },
  ]);
  // "and" inside an entity name must NOT split it
  assert.deepEqual(extractParties("Delgado and Sons Trucking LLC"), [
    { name: "Delgado and Sons Trucking LLC", kind: "entity", role: "opposing" },
  ]);
});

test("worked example 2 — deadline in 24 days → urgent (recent date also flagged)", () => {
  const flags = urgencyFlags(EMP.answers, AS_OF);
  // 2026-10-29 (9 days past) → recently-passed; 2026-12-01 → 24 days ahead
  assert.deepEqual(flags.map((f) => f.rule), ["deadline-recently-passed", "deadline-within-30-days"]);
  assert.match(flags[1].reason, /2026-12-01 is 24 days away/);
  const firm = buildFirmSummary(EMP.answers, AS_OF);
  assert.equal(firm.urgency.escalate, true);
  assert.match(firm.summary, /^Employment dismissal matter\./);
});

// ========================================== worked example 3: contract breach

const CON = workedExample("contract_breach", {
  full_name: "Harbor Bakehouse Co.",
  contact_method: "Text message",
  contact_detail: "555-0187",
  other_parties: "Harbor Regional Warehouse — where the goods were stored",
  key_dates: "Contract signed 2026-03-02; breach noticed 2026-09-15",
  urgency: "soon",
});

test("worked example 3 — contract breach proposal includes other_parties", () => {
  const p = CON.proposal;
  const ids = p.questions.map((q) => q.id);
  // area extras are inserted before desired_outcome, as in the live catalog
  assert.deepEqual(ids, [
    "full_name", "contact_method", "contact_detail", "opposing_parties",
    "jurisdiction", "other_parties", "documents", "key_dates",
    "desired_outcome", "urgency", "matter_detail",
  ]);
  assert.equal(p.questions.find((q) => q.id === "other_parties").type, "text");
});

test("worked example 3 — em-dash note dropped, no parties invented", () => {
  const opp = extractParties(CON.answers.opposing_parties, "opposing");
  const rel = extractParties(CON.answers.other_parties, "related");
  assert.deepEqual(opp, [{ name: "Delgado and Sons Trucking LLC", kind: "entity", role: "opposing" }]);
  assert.deepEqual(rel, [{ name: "Harbor Regional Warehouse", kind: "entity", role: "related" }]);
  // garbage text yields nothing rather than invented parties
  assert.deepEqual(extractParties("not sure yet"), []);
});

test("worked example 3 — dates older than 30 days stay non-urgent", () => {
  const flags = urgencyFlags(CON.answers, AS_OF);
  assert.deepEqual(flags, []); // both dates > 30 days from asOf, no court mention
  const firm = buildFirmSummary(CON.answers, AS_OF);
  assert.equal(firm.urgency.level, "soon");
  assert.equal(firm.urgency.escalate, false);
  assert.match(firm.summary, /^Contract breach matter\./);
  // entity client is kept as the client party
  assert.deepEqual(
    firm.conflict_parties.map((p) => `${p.name}:${p.role}:${p.kind}`),
    [
      "Harbor Bakehouse Co.:client:entity",
      "Delgado and Sons Trucking LLC:opposing:entity",
      "Harbor Regional Warehouse:related:entity",
    ],
  );
});

// -------------------------------------------------------- catalog + rules

test("all five demo areas propose valid question sets", () => {
  assert.equal(AREAS.length, 5);
  for (const a of AREAS) {
    const p = proposeQuestions(a.id);
    assert.ok(p.questions.length >= 9, `${a.id} question count`);
    assert.ok(p.questions.every((q) => q.draft !== undefined));
    const ids = fieldsForArea(a.id);
    assert.equal(new Set(ids).size, ids.length, `${a.id} de-duped`);
  }
  assert.throws(() => proposeQuestions("family"), /unknown matter area/);
});

test("both personas exist; staff pack carries no empathy note", () => {
  assert.deepEqual(PERSONAS.map((p) => p.id), ["client", "staff"]);
  assert.equal(proposeQuestions("contract_breach").empathyNote, "");
});

test("contactName grounds the full_name draft", () => {
  const p = proposeQuestions("personal_injury", { contactName: "Ana Ferreira" });
  assert.equal(p.questions.find((q) => q.id === "full_name").draft, "Ana Ferreira");
});

test("classifyName separates persons, entities and non-names", () => {
  assert.equal(classifyName("Mara Ellison"), "person");
  assert.equal(classifyName("M. Iwata"), "person");
  assert.equal(classifyName("Sable Insurance Company"), "entity");
  assert.equal(classifyName("The Landlord Group"), "entity");
  assert.equal(classifyName("My landlord is upset"), null);
  assert.equal(classifyName("Not sure yet"), null);
});

test("urgency edge cases: past-but-recent deadline, garbage dates, other fields ignored", () => {
  // 5 days past asOf → recently-passed urgent
  const past = urgencyFlags({ key_dates: "response was due 2026-11-02" }, AS_OF);
  assert.equal(past[0].rule, "deadline-recently-passed");
  assert.match(past[0].reason, /passed 5 days ago/);
  // far-future date → no flag
  assert.deepEqual(urgencyFlags({ key_dates: "hearing 2027-06-01" }, AS_OF).map((f) => f.rule), ["court-date-mentioned"]);
  // far-past date → no flag, no court word
  assert.deepEqual(urgencyFlags({ key_dates: "incident 2026-03-02" }, AS_OF), []);
  // court word in matter_detail alone still flags
  assert.equal(urgencyFlags({ matter_detail: "trial scheduled soon" }, AS_OF)[0].rule, "court-date-mentioned");
  // empty answers → nothing
  assert.deepEqual(urgencyFlags({}, AS_OF), []);
});

test("makeReference is deterministic, UTC-shaped and clamped", () => {
  const t = Date.parse("2026-11-07T09:00:00Z");
  assert.equal(makeReference(t, 0.5), "INT-2611-I000");
  assert.equal(makeReference(t, 0.42), "INT-2611-F4BI");
  assert.equal(makeReference(t, 0), "INT-2611-0000");
  assert.equal(makeReference(t, 0), "INT-2611-0000");
  assert.equal(makeReference(t, 2), makeReference(t, 0.999999)); // clamped
  assert.equal(makeReference(Date.parse("2027-01-31T00:00:00Z"), 0.1), "INT-2701-3LLL");
});

test("confirmIntake builds the record only from confirmed answers", () => {
  const record = confirmIntake({
    persona: "staff",
    matterArea: "employment",
    narrative: "Caller dismissed after raising a safety concern.",
    answers: { ...EMP.answers, persona: undefined },
    asOf: AS_OF,
  });
  assert.ok(record.reference.startsWith("INT-"));
  assert.equal(record.persona, "staff");
  assert.equal(record.urgency.escalate, true);
  assert.ok(record.next_steps.some((s) => /duty attorney/i.test(s))); // staff + escalate
});
