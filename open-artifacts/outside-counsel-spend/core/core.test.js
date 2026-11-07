/** Tests for outside-counsel-spend core. Run: node --test "core/*.test.js" (from artifact root) */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseDate, toCents, toUsd, resolveRateCard,
  checkRateCompliance, computeBudgetVariance, flagWriteOffs,
  rollupByPeriod, runSpendAudit, auditToCsv, auditToJson, renderReport,
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
  // rate 4 + budget 2 (over + unbudgeted) + write_off 1 = 7 findings + header
  assert.equal(lines.length, 8);
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
