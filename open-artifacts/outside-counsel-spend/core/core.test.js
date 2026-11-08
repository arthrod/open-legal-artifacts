/** Tests for outside-counsel-spend core. Run: node --test "core/*.test.js" (from artifact root) */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseDate, toCents, toUsd, resolveRateCard,
  checkRateCompliance, computeBudgetVariance, flagWriteOffs,
  rollupByPeriod, runSpendAudit, auditToCsv, auditToJson, renderReport,
  checkGuidelines, flagAnomalies, renderTalkingPoints,
} from "./core.js";

const RATE_CARDS = [
  { firmId: "HPL", effectiveFrom: "2026-07-01", effectiveTo: "2026-12-31", rates: { partner: 850, associate: 445, paralegal: 185 } },
  { firmId: "HPL", matterId: "M-211", effectiveFrom: "2026-07-01", rates: { partner: 900, associate: 470, paralegal: 195 } }, // matter-scoped overrides
  { firmId: "MVL", effectiveFrom: "2026-09-01", rates: { partner: 775, associate: 410 } },
];

const LEDGER = [
  { id: "L-001", matterId: "M-210", firmId: "HPL", period: "2026-09", date: "2026-09-03", timekeeper: "A. Reyes", level: "partner", hours: 4.0, rate: 850, narrative: "Draft response to FDA letter." },
  { id: "L-002", matterId: "M-210", firmId: "HPL", period: "2026-09", date: "2026-09-04", timekeeper: "J. Osei", level: "associate", hours: 6.5, rate: 445, narrative: "Research predicate device classifications." },
  { id: "L-003", matterId: "M-210", firmId: "HPL", period: "2026-09", date: "2026-09-10", timekeeper: "A. Reyes", level: "partner", hours: 2.0, rate: 925, narrative: "Client call and strategy." }, // over firm card (850)
  { id: "L-004", matterId: "M-211", firmId: "HPL", period: "2026-08", date: "2026-08-12", timekeeper: "S. Ito", level: "partner", hours: 3.0, rate: 825, narrative: "Cease-and-desist review." }, // no card yet: card starts 2026-07-01... firm card covers it; matter card covers it too → matter card 900 → 825 ok
  { id: "L-005", matterId: "M-211", firmId: "HPL", period: "2026-09", date: "2026-09-15", timekeeper: "S. Ito", level: "partner", hours: 5.0, rate: 950, narrative: "TTAB opposition drafting." }, // over matter card (900)
  { id: "L-006", matterId: "M-212", firmId: "MVL", period: "2026-08", date: "2026-08-20", timekeeper: "P. Dorn", level: "partner", hours: 2.5, rate: 775, narrative: "HSR pre-filing analysis." }, // before MVL card window → no_rate_card
  { id: "L-007", matterId: "M-212", firmId: "MVL", period: "2026-10", date: "2026-10-02", timekeeper: "P. Dorn", level: "counsel", hours: 1.5, rate: 600, narrative: "Second request scoping." }, // level not on card
  { id: "L-008", matterId: "M-212", firmId: "MVL", period: "2026-10", date: "2026-10-05", type: "fee", billing: "flat", amount: 25000, narrative: "Fixed fee: HSR filing package." },
  { id: "L-009", matterId: "M-210", firmId: "HPL", period: "2026-09", date: "2026-09-28", type: "disbursement", amount: 1840.25, narrative: "Regulatory printing and courier." },
  { id: "L-010", matterId: "M-211", firmId: "HPL", period: "2026-09", date: "2026-09-30", timekeeper: "S. Ito", level: "partner", hours: 8.0, rate: 900, amount: 7200, writeOff: 1800, narrative: "Opposition brief; partial write-off agreed." }, // 25% write-off → flag
  { id: "L-011", matterId: "M-210", firmId: "HPL", period: "2026-10", date: "2026-10-06", timekeeper: "J. Osei", level: "associate", hours: 4.0, rate: 445, narrative: "Supplemental responses.", writeOff: 89 }, // 5% write-off → below threshold, no flag
];

const BUDGETS = [
  { matterId: "M-210", firmId: "HPL", approved: 8000 },
  { matterId: "M-211", approved: 50000 }, // matter-wide (any firm)
];

const INPUT = { ledger: LEDGER, rateCards: RATE_CARDS, budgets: BUDGETS };

test("resolveRateCard prefers matter-scoped cards and honors date windows", () => {
  const matterCard = resolveRateCard({ firmId: "HPL", matterId: "M-211", date: "2026-09-15" }, RATE_CARDS);
  assert.equal(matterCard.card.rates.partner, 900);
  const firmCard = resolveRateCard({ firmId: "HPL", matterId: "M-210", date: "2026-09-03" }, RATE_CARDS);
  assert.equal(firmCard.card.rates.partner, 850);
  const beforeWindow = resolveRateCard({ firmId: "MVL", matterId: "M-212", date: "2026-08-20" }, RATE_CARDS);
  assert.equal(beforeWindow, null);
});

test("checkRateCompliance flags over_rate with dollar impact and skips non-hourly", () => {
  const { findings, okCount, checked } = checkRateCompliance(INPUT);
  // hourly entries: L-001..L-007, L-010 (8) — flat L-008 and disbursement L-009 skipped, L-011 hourly
  assert.equal(checked, 9);
  const over = findings.filter((f) => f.status === "over_rate");
  assert.equal(over.length, 2);
  const l3 = over.find((f) => f.entryId === "L-003");
  assert.equal(l3.expectedRate, 850);
  assert.equal(l3.rateVariance, 75);
  assert.equal(l3.amountImpact, 150); // 75 × 2h
  const l5 = over.find((f) => f.entryId === "L-005");
  assert.equal(l5.expectedRate, 900); // matter card, not firm card
  assert.equal(l5.amountImpact, 250);
  assert.equal(okCount, 5); // L-001, L-002, L-004, L-010, L-011
});

test("checkRateCompliance reports no_rate_card and unknown_level separately", () => {
  const { findings } = checkRateCompliance(INPUT);
  const noCard = findings.find((f) => f.entryId === "L-006");
  assert.equal(noCard.status, "no_rate_card");
  assert.equal(noCard.expectedRate, null);
  const unknown = findings.find((f) => f.entryId === "L-007");
  assert.equal(unknown.status, "unknown_level");
  assert.match(unknown.detail, /counsel/);
});

test("checkRateCompliance honors a configured rate tolerance", () => {
  const { findings } = checkRateCompliance({ ...INPUT, settings: { rateToleranceUsd: 60 } });
  assert.ok(findings.some((f) => f.entryId === "L-003")); // 925 vs 850 = $75 over → still flagged
  assert.ok(!findings.some((f) => f.entryId === "L-005")); // 950 vs 900 = $50 over → within tolerance
});

test("amounts are derived as hours × rate when omitted (integer cents)", () => {
  assert.equal(toUsd(toCents(4.0) * toCents(850) / 100), 3400);
  const { summary } = runSpendAudit(INPUT);
  assert.equal(summary.entries, 11);
});

test("computeBudgetVariance nets write-offs and prefers exact matter+firm budgets", () => {
  const rows = computeBudgetVariance(INPUT);
  const m210 = rows.find((r) => r.matterId === "M-210" && r.firmId === "HPL");
  // gross: 3400 + 2892.50 + 1850 + 1840.25 + 1780 = 11762.75; net = gross − 89 write-off
  assert.equal(m210.gross, 11762.75);
  assert.equal(m210.net, 11673.75);
  assert.equal(m210.variance, 3673.75);
  assert.equal(m210.status, "over");
});

test("computeBudgetVariance falls back to matter-wide budgets and marks unbudgeted pairs", () => {
  const rows = computeBudgetVariance(INPUT);
  const m211 = rows.find((r) => r.matterId === "M-211" && r.firmId === "HPL");
  assert.equal(m211.approved, 50000); // matter-wide budget applied
  assert.equal(m211.status, "within");
  const m212 = rows.find((r) => r.matterId === "M-212" && r.firmId === "MVL");
  assert.equal(m212.status, "unbudgeted");
  assert.equal(m212.approved, null);
});

test("flagWriteOffs flags only over-threshold write-offs with evidence", () => {
  const flags = flagWriteOffs(INPUT);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].entryId, "L-010");
  assert.equal(flags[0].writeOff, 1800);
  assert.equal(flags[0].writeOffPct, 25);
  assert.match(flags[0].detail, /threshold 10%/);
  const custom = flagWriteOffs({ ...INPUT, settings: { writeOffFlagPct: 4 } });
  assert.equal(custom.length, 2); // L-010 (25%) and L-011 (5%)
});

test("rollupByPeriod sums fees, disbursements, write-offs, and per-firm nets", () => {
  const rolls = rollupByPeriod(INPUT);
  assert.deepEqual(rolls.map((r) => r.period), ["2026-08", "2026-09", "2026-10"]);
  const sep = rolls.find((r) => r.period === "2026-09");
  // fees: 3400 + 2892.5 + 1850 + 4750 + 7200 = 20092.5; disb 1840.25; wo 1800
  assert.equal(sep.fees, 20092.5);
  assert.equal(sep.disbursements, 1840.25);
  assert.equal(sep.writeOffs, 1800);
  assert.equal(sep.net, 20092.5 + 1840.25 - 1800);
  assert.equal(sep.byFirm.HPL, 20092.5 + 1840.25 - 1800);
  const oct = rolls.find((r) => r.period === "2026-10");
  assert.equal(oct.byMatter["M-212"], 25000 + 1.5 * 600 - 0);
});

test("runSpendAudit summary ties the findings together", () => {
  const a = runSpendAudit(INPUT);
  assert.equal(a.summary.entries, 11);
  assert.equal(a.summary.rateExceptions, 4); // L-003, L-005, L-006, L-007
  assert.equal(a.summary.overBudget, 1); // M-210 × HPL
  assert.equal(a.summary.unbudgeted, 1); // M-212 × MVL
  assert.equal(a.summary.writeOffFlags, 1);
  assert.equal(a.periodRollups.length, 3);
});

test("auditToCsv emits one row per actionable finding with header and escapes", () => {
  const a = runSpendAudit(INPUT);
  const csv = auditToCsv(a);
  const lines = csv.trim().split("\n");
  // rate 4 + budget 2 (over + unbudgeted) + write_off 1 + anomaly 2 (S. Ito rate_creep 2026-08→09 and hours_spike 3h→13h) = 9 findings + header
  assert.equal(lines.length, 10);
  assert.match(lines[0], /^kind,ref,matterId/);
  assert.match(csv, /rate,L-003,.*over_rate/);
  assert.match(csv, /budget,M-210×HPL/);
  assert.match(csv, /write_off,L-010/);
});

test("auditToJson round-trips the audit", () => {
  const a = runSpendAudit(INPUT);
  const j = JSON.parse(auditToJson(a));
  assert.equal(j.summary.entries, a.summary.entries);
  assert.equal(j.rateFindings.length, a.rateFindings.length);
});

test("renderReport includes every section", () => {
  const md = renderReport(runSpendAudit(INPUT));
  assert.match(md, /# Outside counsel spend audit/);
  assert.match(md, /Rate-card exceptions/);
  assert.match(md, /Budget variance/);
  assert.match(md, /Write-off flags/);
  assert.match(md, /Period rollups/);
  assert.match(md, /All data fictional/);
});

test("parseDate rejects rollover dates; toCents/toUsd round-trip", () => {
  assert.equal(parseDate("2026-02-30"), null);
  assert.ok(parseDate("2026-02-28"));
  assert.equal(toCents(445.1), 44510);
  assert.equal(toUsd(44510), 445.1);
});

/* ---------- billing-guideline rules engine ---------- */

const GUIDELINES = [
  { id: "BG-01", type: "block_billing", minPhrases: 2, maxWords: 45 },
  { id: "DE-01", type: "disallowed_expense", category: "meals", capUsd: 75 },
  { id: "HD-01", type: "max_hours_per_day", maxHours: 10 },
  { id: "SR-01", type: "staffing_ratio", minRatio: 1.5 },
];

test("checkGuidelines flags block-billing narratives with the rule id and billed amount", () => {
  const input = {
    ledger: [
      { id: "G-001", matterId: "M-1", firmId: "F", period: "2026-09", date: "2026-09-02", timekeeper: "T. Kay", level: "associate", hours: 2, rate: 400, narrative: "Draft brief; call with client; research." },
    ],
    guidelines: GUIDELINES,
  };
  const findings = checkGuidelines(input);
  const bb = findings.find((f) => f.flag === "block_billing");
  assert.ok(bb, "block_billing finding present");
  assert.equal(bb.ruleId, "BG-01");
  assert.equal(bb.entryId, "G-001");
  assert.equal(bb.amountImpact, 800); // full billed amount of the non-compliant entry
  assert.match(bb.detail, /3 activities/);
});

test("checkGuidelines block_billing also fires on word-count over the rule cap", () => {
  const long = Array.from({ length: 50 }, (_, i) => `word${i}`).join(" ");
  const input = {
    ledger: [{ id: "G-002", matterId: "M-1", firmId: "F", period: "2026-09", date: "2026-09-03", timekeeper: "T. Kay", level: "associate", hours: 1, rate: 400, narrative: long }],
    guidelines: [{ id: "BG-02", type: "block_billing", minPhrases: 2, maxWords: 45 }],
  };
  const bb = checkGuidelines(input).find((f) => f.flag === "block_billing");
  assert.ok(bb);
  assert.equal(bb.ruleId, "BG-02");
  assert.match(bb.detail, /50 words/);
});

test("checkGuidelines flags meal disbursements over the category cap with the excess as impact", () => {
  const input = {
    ledger: [
      { id: "G-010", matterId: "M-1", firmId: "F", period: "2026-09", date: "2026-09-20", type: "disbursement", category: "meals", amount: 214.75, narrative: "Team dinner during filing week." },
      { id: "G-011", matterId: "M-1", firmId: "F", period: "2026-09", date: "2026-09-21", type: "disbursement", category: "meals", amount: 41.0, narrative: "Working lunch." },
      { id: "G-012", matterId: "M-1", firmId: "F", period: "2026-09", date: "2026-09-22", type: "disbursement", category: "printing", amount: 300, narrative: "Printing." },
    ],
    guidelines: GUIDELINES,
  };
  const f = checkGuidelines(input).filter((x) => x.flag === "disallowed_expense");
  assert.equal(f.length, 1); // only the over-cap meal fires
  assert.equal(f[0].entryId, "G-010");
  assert.equal(f[0].ruleId, "DE-01");
  assert.equal(f[0].amountImpact, 139.75); // 214.75 − 75 cap
});

test("checkGuidelines max_hours_per_day flags timekeeper-days over the cap with over-cap dollars", () => {
  const mk = (id, date, hours) => ({ id, matterId: "M-1", firmId: "F", period: "2026-09", date, timekeeper: "T. Kay", level: "associate", hours, rate: 400, narrative: "Work." });
  const input = {
    ledger: [mk("G-020", "2026-09-02", 6), mk("G-021", "2026-09-02", 6), mk("G-022", "2026-09-03", 4)],
    guidelines: GUIDELINES,
  };
  const f = checkGuidelines(input).filter((x) => x.flag === "max_hours_per_day");
  assert.equal(f.length, 1); // one finding per timekeeper-day
  assert.deepEqual(f[0].entryIds, ["G-020", "G-021"]);
  assert.equal(f[0].totalHours, 12);
  assert.equal(f[0].amountImpact, 800); // 2 hours beyond the 10h cap at $400/h
});

test("checkGuidelines staffing_ratio flags matters staffed below the minimum junior/senior ratio", () => {
  const mk = (id, level, hours) => ({ id, matterId: "M-1", firmId: "F", period: "2026-09", date: "2026-09-04", timekeeper: "X", level, hours, rate: 400, narrative: "Work." });
  const input = {
    ledger: [mk("G-030", "partner", 10), mk("G-031", "associate", 5)],
    guidelines: GUIDELINES,
  };
  const f = checkGuidelines(input).find((x) => x.flag === "staffing_ratio");
  assert.ok(f);
  assert.equal(f.ruleId, "SR-01");
  assert.equal(f.matterId, "M-1");
  assert.match(f.detail, /0.5/); // 5 junior hours / 10 senior hours
  // an unknown rule type surfaces instead of being silently ignored
  const bogus = checkGuidelines({ ledger: [], guidelines: [{ id: "X-1", type: "bogus" }] });
  assert.equal(bogus[0].flag, "unknown_rule_type");
});

/* ---------- variance drivers ---------- */

test("computeBudgetVariance attaches top-3 drivers to over-budget pairs only", () => {
  const rows = computeBudgetVariance(INPUT);
  const m210 = rows.find((r) => r.matterId === "M-210" && r.firmId === "HPL");
  assert.equal(m210.status, "over");
  assert.deepEqual(m210.drivers, [
    { entryId: "L-001", amount: 3400 },
    { entryId: "L-002", amount: 2892.5 },
    { entryId: "L-003", amount: 1850 },
  ]);
  const m211 = rows.find((r) => r.matterId === "M-211" && r.firmId === "HPL");
  assert.equal(m211.status, "within");
  assert.equal(m211.drivers, undefined);
});

/* ---------- anomaly flags ---------- */

const TREND_LEDGER = [
  { id: "T-001", matterId: "M-1", firmId: "F1", period: "2026-01", date: "2026-01-10", timekeeper: "R. Voss", level: "associate", hours: 10, rate: 400, narrative: "Drafting." },
  { id: "T-002", matterId: "M-1", firmId: "F1", period: "2026-02", date: "2026-02-10", timekeeper: "R. Voss", level: "associate", hours: 3, rate: 450, narrative: "Drafting." },
  { id: "T-003", matterId: "M-1", firmId: "F1", period: "2026-03", date: "2026-03-10", timekeeper: "R. Voss", level: "associate", hours: 7, rate: 460, narrative: "Drafting." },
];

test("flagAnomalies raises rate_creep with periods, rates, and delta", () => {
  const flags = flagAnomalies({ ledger: TREND_LEDGER });
  const creep = flags.find((f) => f.flag === "rate_creep");
  assert.ok(creep);
  assert.equal(creep.timekeeper, "R. Voss");
  assert.equal(creep.fromPeriod, "2026-01");
  assert.equal(creep.toPeriod, "2026-02");
  assert.equal(creep.fromRate, 400);
  assert.equal(creep.toRate, 450);
  assert.equal(creep.deltaPct, 12.5);
  assert.deepEqual(creep.entryIds, ["T-001", "T-002"]);
});

test("flagAnomalies raises hours_spike beyond twice the prior period", () => {
  const flags = flagAnomalies({ ledger: TREND_LEDGER });
  const spike = flags.find((f) => f.flag === "hours_spike");
  assert.ok(spike); // 7h in March > 2 × 3h in February
  assert.equal(spike.fromHours, 3);
  assert.equal(spike.toHours, 7);
  assert.deepEqual(spike.entryIds, ["T-002", "T-003"]);
  assert.equal(flags.filter((f) => f.flag === "rate_creep").length, 1); // 450→460 is +2.2%, no second creep
});

test("flagAnomalies thresholds are rules-as-data", () => {
  const lenient = flagAnomalies({ ledger: TREND_LEDGER, settings: { rateCreepPct: 20, hoursSpikeFactor: 3 } });
  assert.equal(lenient.length, 0);
});

/* ---------- talking points ---------- */

test("renderTalkingPoints sections cite exactly each firm's finding ids and tie totals to the summary", () => {
  const a = runSpendAudit(INPUT);
  const md = renderTalkingPoints(a, {
    firmNames: { HPL: "Hale & Prior LLP", MVL: "Merrick Vaughan LLP" },
    matterNames: { "M-210": "Project Kite", "M-211": "Atlas IP", "M-212": "Dune merger" },
  });
  const sections = md.split("\n## ").slice(1).map((s) => s.split("\n")[0]);
  assert.deepEqual(sections, ["Hale & Prior LLP", "Merrick Vaughan LLP"]); // sorted by firm id
  const section = (name) => { const start = md.indexOf(`\n## ${name}`); const end = md.indexOf("\n## ", start + 1); return md.slice(start, end > -1 ? end : undefined); };
  const hplIds = new Set([...section("Hale & Prior LLP").matchAll(/L-\d+/g)].map((m) => m[0]));
  const mvlIds = new Set([...section("Merrick Vaughan LLP").matchAll(/L-\d+/g)].map((m) => m[0]));
  // every HPL finding id appears in the HPL section; no MVL finding id leaks in
  for (const id of ["L-003", "L-005", "L-010"]) assert.ok(hplIds.has(id), `${id} in HPL section`);
  for (const id of ["L-006", "L-007"]) assert.ok(!hplIds.has(id), `${id} not in HPL section`);
  for (const id of ["L-006", "L-007"]) assert.ok(mvlIds.has(id), `${id} in MVL section`);
  // grand total ties to the audit summary
  assert.ok(md.includes(`Total net spend: ${a.summary.netSpend}`));
});

test("renderTalkingPoints renders matter-wide staffing_ratio findings in a panel-wide section", () => {
  const a = runSpendAudit({ ...INPUT, guidelines: GUIDELINES });
  const md = renderTalkingPoints(a, {
    firmNames: { HPL: "Hale & Prior LLP", MVL: "Merrick Vaughan LLP" },
    matterNames: { "M-210": "Project Kite", "M-211": "Atlas IP", "M-212": "Dune merger" },
  });
  const panel = md.slice(md.indexOf("\n## Panel-wide"), md.indexOf("**Total net spend"));
  assert.ok(panel.includes("staffing_ratio"), "panel section lists staffing_ratio");
  assert.ok(panel.includes("SR-01"), "panel cites the rule id");
  assert.ok(panel.includes("Atlas IP"), "matter name resolved (M-211 below ratio)");
  assert.ok(panel.includes("Dune merger"), "matter name resolved (M-212 below ratio)");
  // every guideline finding is rendered exactly once (firm-level in firm
  // sections, matter-wide in the panel) — the count in the header must match
  const rendered = (md.match(/rule `[^`]+`/g) ?? []).length;
  assert.equal(rendered, a.summary.guidelineFlags);
});

/* ---------- audit integration + counterpart attribution ---------- */

test("runSpendAudit and exports include guideline and anomaly findings", () => {
  const a = runSpendAudit({ ...INPUT, guidelines: GUIDELINES });
  assert.equal(a.summary.guidelineFlags, a.guidelineFindings.length);
  assert.ok(a.summary.guidelineFlags > 0);
  assert.equal(a.summary.anomalyFlags, a.anomalyFlags.length);
  const csv = auditToCsv(a);
  assert.match(csv, /guideline,L-010,M-211,HPL,2026-09,block_billing/); // L-010's multi-activity narrative trips BG-01
  assert.match(csv, /BG-01/);
  assert.match(csv, /anomaly,/);
  const md = renderReport(a);
  assert.match(md, /Billing-guideline flags/);
  assert.match(md, /Anomaly flags/);
});

test("spec and README cite the verified counterpart description, not the unverified one", () => {
  const spec = readFileSync(new URL("../spec.md", import.meta.url), "utf8");
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  for (const doc of [spec, readme]) {
    assert.ok(!doc.includes("flag unusual billing patterns"), "unverified quote removed");
    assert.ok(doc.includes("academy.claude.com/use-cases/outside-counsel-review"), "Academy citation present");
  }
});
