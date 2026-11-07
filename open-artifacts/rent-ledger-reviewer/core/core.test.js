/** Tests: rent-ledger-reviewer core. Run: node --test 'core/*.test.js' */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseDate, fmtDate, addDays, daysBetween, monthKey, dueDateFor, cents,
  getRuleset, reviewLedger, validateLateFee, toCSV, renderReport,
} from "./core.js";

const RENT = 1400;
const lease = { monthlyRent: RENT, leaseStart: "2026-01-01", rentDueDay: 1 };
const asOf = "2026-04-30";
/** Build a clean 4-month ledger helper. */
const e_ = (id, date, type, amount, extra = {}) => ({ id, date, type, amount, ...extra });
function cleanLedger() {
  return [
    e_(1, "2026-01-01", "rent", RENT), e_(2, "2026-01-03", "payment", RENT),
    e_(3, "2026-02-01", "rent", RENT), e_(4, "2026-02-04", "payment", RENT),
    e_(5, "2026-03-01", "rent", RENT), e_(6, "2026-03-03", "payment", RENT),
    e_(7, "2026-04-01", "rent", RENT), e_(8, "2026-04-02", "payment", RENT),
  ];
}

test("date/month helpers: dueDateFor clamps month-end, daysBetween, cents", () => {
  assert.equal(fmtDate(dueDateFor(parseDate("2026-02-10"), 31)), "2026-02-28");
  assert.equal(fmtDate(dueDateFor(parseDate("2026-01-10"), 1)), "2026-01-01");
  assert.equal(daysBetween(parseDate("2026-01-01"), parseDate("2026-01-06")), 5);
  assert.equal(monthKey(parseDate("2026-11-07")), "2026-11");
  assert.equal(cents(0.1 + 0.2), 0.3);
  assert.equal(parseDate("2026-02-30"), null);
});

test("clean ledger: zero disputes, both balances reconcile to 0", () => {
  const r = reviewLedger({ jurisdiction: "DC", asOf, lease, ledger: cleanLedger() });
  assert.equal(r.disputes.length, 0);
  assert.equal(r.underpayments.length, 0);
  assert.equal(r.balance.ledgerFinal, 0);
  assert.equal(r.balance.lawfulFinal, 0);
  assert.equal(r.expectedMonths, 4);
});

test("running balance recomputed per entry (rent +, payment -)", () => {
  const r = reviewLedger({ jurisdiction: "DC", asOf, lease, ledger: cleanLedger().slice(0, 2) });
  assert.equal(r.rows[0].balanceAfter, RENT);      // rent due
  assert.equal(r.rows[1].balanceAfter, 0);         // payment clears
});

test("late fee charged within 5-day grace => dispute, full amount in question", () => {
  const ledger = cleanLedger().slice(0, 4).concat([
    e_(9, "2026-03-01", "rent", RENT),
    e_(10, "2026-03-02", "payment", RENT),        // 1 day after due, within grace
    e_(11, "2026-03-02", "late_fee", 70, { appliedTo: "2026-03" }),
  ]);
  const r = reviewLedger({ jurisdiction: "DC", asOf: "2026-03-31", lease, ledger });
  const d = r.disputes.find((x) => x.issue === "late_fee_before_grace");
  assert.ok(d, "grace dispute present");
  assert.equal(d.amountInQuestion, 70); // nothing lawful — payment within grace
  assert.equal(r.balance.lawfulFinal, 0);
});

test("late fee over 5% cap => over_cap dispute with capped lawful amount", () => {
  const ledger = cleanLedger().slice(0, 4).concat([
    e_(9, "2026-03-01", "rent", RENT),
    e_(10, "2026-03-20", "payment", RENT),        // 19 days late — triggered
    e_(11, "2026-03-21", "late_fee", 150, { appliedTo: "2026-03" }), // cap = 5% * 1400 = 70
  ]);
  const r = reviewLedger({ jurisdiction: "DC", asOf: "2026-03-31", lease, ledger });
  const d = r.disputes.find((x) => x.issue === "late_fee_over_cap");
  assert.ok(d);
  assert.equal(d.amountInQuestion, 80); // 150 - lawful 70
  assert.equal(r.balance.lawfulFinal, 70);
  assert.equal(r.balance.overchargeTotal, 80);
});

test("lawful late fee (late payment, within cap) => no dispute, carried in both balances", () => {
  const ledger = cleanLedger().slice(0, 4).concat([
    e_(9, "2026-03-01", "rent", RENT),
    e_(10, "2026-03-20", "payment", RENT),
    e_(11, "2026-03-21", "late_fee", 70, { appliedTo: "2026-03" }),
  ]);
  const r = reviewLedger({ jurisdiction: "DC", asOf: "2026-03-31", lease, ledger });
  assert.equal(r.disputes.filter((x) => String(x.issue).startsWith("late_fee")).length, 0);
  assert.equal(r.balance.ledgerFinal, 70);
  assert.equal(r.balance.lawfulFinal, 70);
});

test("two late fees in one month => charged_twice dispute", () => {
  const ledger = cleanLedger().slice(0, 4).concat([
    e_(9, "2026-03-01", "rent", RENT), e_(10, "2026-03-20", "payment", RENT),
    e_(11, "2026-03-21", "late_fee", 70, { appliedTo: "2026-03" }),
    e_(12, "2026-03-25", "late_fee", 70, { appliedTo: "2026-03" }),
  ]);
  const r = reviewLedger({ jurisdiction: "DC", asOf: "2026-03-31", lease, ledger });
  assert.ok(r.disputes.some((x) => x.issue === "late_fee_charged_twice" && x.amountInQuestion === 70));
});

test("duplicate rent entry for one month => duplicate_rent_entry overcharge", () => {
  const ledger = [e_(1, "2026-01-01", "rent", RENT), e_(2, "2026-01-01", "rent", RENT), e_(3, "2026-01-03", "payment", RENT)];
  const r = reviewLedger({ jurisdiction: "DC", asOf: "2026-01-31", lease, ledger });
  const d = r.disputes.find((x) => x.issue === "duplicate_rent_entry");
  assert.ok(d && d.amountInQuestion === RENT);
});

test("rent charged above lease rent => rent_overcharged dispute for the delta", () => {
  const ledger = [e_(1, "2026-01-01", "rent", 1600), e_(2, "2026-01-03", "payment", 1600)];
  const r = reviewLedger({ jurisdiction: "DC", asOf: "2026-01-31", lease, ledger });
  const d = r.disputes.find((x) => x.issue === "rent_overcharged");
  assert.ok(d && d.amountInQuestion === 200);
  assert.equal(r.balance.lawfulFinal, -200); // lawful side: tenant overpaid by 200 => credit
});

test("missing rent month => landlord_omission dispute (completeness check)", () => {
  const ledger = [e_(1, "2026-01-01", "rent", RENT), e_(2, "2026-01-03", "payment", RENT)];
  const r = reviewLedger({ jurisdiction: "DC", asOf: "2026-02-28", lease, ledger });
  assert.ok(r.disputes.some((x) => x.issue === "missing_rent_entry" && x.month === "2026-02"));
});

test("missed payment => underpayment shortfall carried to final balance", () => {
  const ledger = [e_(1, "2026-01-01", "rent", RENT), e_(2, "2026-02-01", "rent", RENT), e_(3, "2026-02-03", "payment", RENT)];
  const r = reviewLedger({ jurisdiction: "DC", asOf: "2026-02-28", lease, ledger });
  // the only payment allocates oldest-first to Jan => Feb carries the shortfall
  assert.equal(r.underpayments.length, 1);
  assert.equal(r.underpayments[0].month, "2026-02");
  assert.equal(r.underpayments[0].shortfall, RENT);
  assert.equal(r.balance.ledgerFinal, RENT);
});

test("payment tagged to a newer month while older month open => misapplication flag", () => {
  const ledger = [
    e_(1, "2026-01-01", "rent", RENT),
    e_(2, "2026-02-01", "rent", RENT),
    e_(3, "2026-02-05", "payment", RENT, { appliedTo: "2026-02" }), // Jan still open
  ];
  const r = reviewLedger({ jurisdiction: "DC", asOf: "2026-02-28", lease, ledger });
  const d = r.disputes.find((x) => x.issue === "payment_misapplied");
  assert.ok(d && d.month === "2026-02");
});

test("disallowed charge type (misc_fee) flagged and excluded from lawful balance", () => {
  const ledger = cleanLedger().slice(0, 2).concat([
    e_(9, "2026-01-15", "misc_fee", 250, { note: "administrative fee" }),
  ]);
  const r = reviewLedger({ jurisdiction: "DC", asOf: "2026-01-31", lease, ledger });
  const d = r.disputes.find((x) => x.issue === "disallowed_charge_type");
  assert.ok(d && d.amountInQuestion === 250 && d.ruleId === "DC-ALLOWABLE");
  assert.equal(r.balance.ledgerFinal, 250);
  assert.equal(r.balance.lawfulFinal, 0);
  assert.equal(r.balance.overchargeTotal, 250);
});

test("unknown jurisdiction => input error, never a guessed ruleset", () => {
  const r = reviewLedger({ jurisdiction: "ZZ", asOf, lease, ledger: cleanLedger() });
  assert.ok(r.errors && r.errors.length === 1);
  assert.ok(r.errors[0].includes("jurisdiction"));
});

test("rules-as-data: three example jurisdictions, editable shape", () => {
  for (const id of ["DC", "CA", "MA"]) {
    const rs = getRuleset(id);
    assert.ok(rs && rs.lateFee.ruleId && rs.version);
    assert.ok(typeof rs.lateFee.capValue === "number");
  }
  assert.equal(getRuleset("NOPE"), null);
});

test("validateLateFee: MA 30-day grace means a 10-day-late payment never triggers", () => {
  const v = validateLateFee(
    { id: 1, date: "2026-01-12", type: "late_fee", amount: 50 },
    "2026-01",
    { monthlyRent: RENT, dueDate: parseDate("2026-01-01"), paymentDate: parseDate("2026-01-11"), rules: getRuleset("MA") },
  );
  assert.equal(v.lawful, false);
  assert.equal(v.lawfulAmount, 0);
  assert.ok(v.reasons[0].text.includes("grace"));
});

test("CSV export: header + row-per-entry, CRLF terminated", () => {
  const r = reviewLedger({ jurisdiction: "DC", asOf: "2026-01-31", lease, ledger: cleanLedger().slice(0, 2) });
  const csv = toCSV(r);
  const lines = csv.split("\r\n").filter(Boolean);
  assert.equal(lines[0], "entry_id,date,type,amount,balance_after,lawful_balance_after,note");
  assert.equal(lines.length, 3); // header + 2 entries
  assert.match(lines[1], /^1,2026-01-01,rent,1400\.00,1400\.00,1400\.00/);
});

test("markdown report includes balances, disputes, and the verify gate", () => {
  const r = reviewLedger({ jurisdiction: "DC", asOf: "2026-03-31", lease, ledger: [
    e_(1, "2026-01-01", "rent", RENT), e_(2, "2026-01-03", "payment", RENT),
    e_(3, "2026-02-01", "rent", RENT), e_(4, "2026-02-04", "payment", RENT),
    e_(5, "2026-03-01", "rent", RENT), e_(6, "2026-03-02", "payment", RENT),
    e_(7, "2026-03-02", "late_fee", 70, { appliedTo: "2026-03" }),
  ] });
  const md = renderReport(r);
  assert.match(md, /# Rent ledger review/);
  assert.match(md, /Itemized disputes/);
  assert.match(md, /late_fee_before_grace/);
  assert.match(md, /Verify/);
});
