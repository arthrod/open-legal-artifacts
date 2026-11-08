/** Tests: rent-ledger-reviewer core. Run: node --test 'core/*.test.js' */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseDate, fmtDate, addDays, daysBetween, monthKey, dueDateFor, cents,
  getRuleset, reviewLedger, validateLateFee, toCSV, renderReport,
  JURISDICTION_RULES, parseLedgerTable,
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

/* ---------- wave-2 improvements ---------- */

test("unknown charge type => unknown_charge_type dispute, excluded from lawful balance", () => {
  const ledger = cleanLedger().slice(0, 2).concat([
    e_(9, "2026-01-15", "convenience_fee", 25),
  ]);
  const r = reviewLedger({ jurisdiction: "DC", asOf: "2026-01-31", lease, ledger });
  const d = r.disputes.find((x) => x.issue === "unknown_charge_type");
  assert.ok(d, "unknown_charge_type dispute present");
  assert.equal(d.amountInQuestion, 25);
  assert.equal(r.balance.ledgerFinal, 25);   // still in the as-charged ledger
  assert.equal(r.balance.lawfulFinal, 0);    // never counted lawful
});

test("malformed entries (bad date, non-positive amount, duplicate id) => ignoredEntries, never silent", () => {
  const ledger = [
    e_(1, "2026-01-01", "rent", RENT),
    e_(2, "2026-01-03", "payment", RENT),
    e_(3, "2026-13-01", "rent", RENT),   // impossible month
    e_(4, "2026-01-20", "rent", 0),      // non-positive amount
    e_(1, "2026-01-25", "rent", RENT),   // duplicate id
  ];
  const r = reviewLedger({ jurisdiction: "DC", asOf: "2026-01-31", lease, ledger });
  assert.equal(r.ignoredEntries.length, 3);
  assert.ok(r.ignoredEntries.some((x) => x.reason.includes("unparseable date")));
  assert.ok(r.ignoredEntries.some((x) => x.reason.includes("invalid amount")));
  assert.ok(r.ignoredEntries.some((x) => x.reason.includes("duplicate id")));
  assert.equal(r.rows.length, 2);
  assert.equal(r.disputes.length, 0); // the dirty rows don't leak into the audit
});

test("claimedBalance 1870 vs recomputed 1470 => claimed_balance_mismatch of 400", () => {
  const ledger = [
    e_(1, "2026-01-01", "rent", RENT),
    e_(2, "2026-01-03", "payment", RENT),
    e_(3, "2026-02-01", "rent", RENT),
    e_(4, "2026-02-21", "late_fee", 70, { appliedTo: "2026-02" }), // unpaid Feb: triggered, within cap
  ];
  const r = reviewLedger({ jurisdiction: "DC", asOf: "2026-02-28", lease, claimedBalance: 1870, ledger });
  assert.equal(r.balance.ledgerFinal, 1470);
  const d = r.disputes.find((x) => x.issue === "claimed_balance_mismatch");
  assert.ok(d, "mismatch dispute present");
  assert.equal(d.amountInQuestion, 400);
  assert.equal(r.claimedBalance.delta, 400);
});

test("parseLedgerTable: CSV with dirty rows => parsed entries + ignoredRows", () => {
  const csv = [
    "id,date,type,amount,applied_to,note",
    "1,2026-01-01,rent,1400,,January rent",
    "2,2026-13-01,rent,1400,,bad month",
    "3,2026-01-15,misc_fee,abc,,bad amount",
    "4,2026-01-03,payment,-5,,negative",
    "5,2026-01-03,payment,1400,,ok",
  ].join("\n");
  const p = parseLedgerTable(csv);
  assert.equal(p.errors.length, 0);
  assert.equal(p.entries.length, 2);
  assert.equal(p.ignoredRows.length, 3);
  assert.deepEqual(p.entries[0], { id: 1, date: "2026-01-01", type: "rent", amount: 1400, note: "January rent" });
  assert.ok(p.ignoredRows.every((x) => x.line > 1 && x.reason.length > 0));
  assert.ok(p.ignoredRows.some((x) => x.reason.includes("date")));
  assert.ok(p.ignoredRows.some((x) => x.reason.includes("amount")));
});

test("parseLedgerTable: TSV sniffed, $/commas stripped, ids auto-assigned without id column", () => {
  const tsv = "date\ttype\tamount\tnote\n2026-01-01\trent\t$1,400.00\t\"January rent\"\n2026-01-03\tpayment\t1400\t\nok";
  const p = parseLedgerTable(tsv);
  assert.equal(p.errors.length, 0);
  assert.equal(p.entries.length, 2);
  assert.equal(p.entries[0].amount, 1400);
  assert.equal(p.entries[0].id, 1);
  assert.equal(p.entries[0].note, "January rent");
});

test("parseLedgerTable: missing required header column => error, no entries", () => {
  const p = parseLedgerTable("date,amount\n2026-01-01,1400");
  assert.equal(p.errors.length, 1);
  assert.ok(p.errors[0].includes("type"));
  assert.equal(p.entries.length, 0);
});

test("deposit interest credited at 6%/yr vs rule's 25% => interest_miscalculation for the delta", () => {
  const ledger = cleanLedger().slice(0, 2).concat([
    e_(9, "2026-01-31", "interest", 60, { kind: "deposit", principal: 1000, days: 365, ratePct: 6 }),
  ]);
  const r = reviewLedger({ jurisdiction: "DC", asOf: "2026-01-31", lease, ledger });
  const d = r.disputes.find((x) => x.issue === "interest_miscalculation");
  assert.ok(d, "interest dispute present");
  assert.equal(d.amountInQuestion, 190); // expected 250 at 25% − credited 60 at 6%
  assert.equal(d.ruleId, "DC-DI");
  assert.ok(d.citation && d.citation.includes("verify"));
  assert.equal(r.balance.ledgerFinal, -60);  // credit as ledger stands
  assert.equal(r.balance.lawfulFinal, -250); // credit at the ruleset rate
});

test("judgment interest charged above the rule rate => interest_miscalculation overcharge", () => {
  const ledger = cleanLedger().slice(0, 2).concat([
    e_(9, "2026-01-31", "interest", 250, { kind: "judgment", principal: 1000, days: 365, ratePct: 25 }),
  ]);
  const r = reviewLedger({ jurisdiction: "DC", asOf: "2026-01-31", lease, ledger });
  const d = r.disputes.find((x) => x.issue === "interest_miscalculation");
  assert.ok(d && d.amountInQuestion === 190); // charged 250 at 25% vs 60 lawful at 6%
  assert.equal(d.ruleId, "DC-JI");
  assert.equal(r.balance.ledgerFinal, 250);
  assert.equal(r.balance.lawfulFinal, 60);
});

test("interest entry missing principal/days/ratePct => ignored, never silently recomputed", () => {
  const ledger = cleanLedger().slice(0, 2).concat([
    e_(9, "2026-01-31", "interest", 60),
  ]);
  const r = reviewLedger({ jurisdiction: "DC", asOf: "2026-01-31", lease, ledger });
  assert.equal(r.ignoredEntries.length, 1);
  assert.ok(r.ignoredEntries[0].reason.includes("principal"));
});

test("rentSchedule jump of 20% under a 10% cap => rent_increase_over_cap dispute", () => {
  const leaseSched = {
    ...lease,
    rentSchedule: [{ from: "2026-01-01", amount: RENT }, { from: "2026-03-01", amount: 1680 }],
  };
  const ledger = [
    e_(1, "2026-01-01", "rent", RENT), e_(2, "2026-01-03", "payment", RENT),
    e_(3, "2026-02-01", "rent", RENT), e_(4, "2026-02-03", "payment", RENT),
    e_(5, "2026-03-01", "rent", 1680),
  ];
  const r = reviewLedger({ jurisdiction: "DC", asOf: "2026-03-31", lease: leaseSched, ledger });
  const d = r.disputes.find((x) => x.issue === "rent_increase_over_cap");
  assert.ok(d, "cap dispute present");
  assert.equal(d.month, "2026-03");
  assert.equal(d.amountInQuestion, 140); // 1680 − 1400 × 1.10
  assert.ok(d.citation && d.citation.includes("verify"));
  assert.ok(!r.disputes.some((x) => x.issue === "rent_overcharged")); // charged at the scheduled amount
});

test("disputes carry the rule's citation; the report Rule column surfaces it", () => {
  const ledger = cleanLedger().slice(0, 4).concat([
    e_(9, "2026-03-01", "rent", RENT),
    e_(10, "2026-03-02", "payment", RENT),
    e_(11, "2026-03-02", "late_fee", 70, { appliedTo: "2026-03" }),
  ]);
  const r = reviewLedger({ jurisdiction: "DC", asOf: "2026-03-31", lease, ledger });
  const d = r.disputes.find((x) => x.issue === "late_fee_before_grace");
  assert.equal(d.citation, JURISDICTION_RULES.DC.citations["DC-LF"]);
  assert.ok(d.citation.includes("[verify"));
  const md = renderReport(r);
  assert.ok(md.includes(d.citation)); // surfaced in the report's Rule column
});

/* ---------- wave-3.5 fix round (review 88) ---------- */

test("two +9% steps one month apart exceed the 10% annual cap on a 12-month lookback", () => {
  const leaseSched = {
    ...lease,
    rentSchedule: [
      { from: "2026-01-01", amount: RENT },
      { from: "2026-02-01", amount: 1526 },    // +9% — lawful alone
      { from: "2026-03-01", amount: 1663.34 }, // second +9% within 12 months ⇒ +18.8% vs base
    ],
  };
  const ledger = [
    e_(1, "2026-01-01", "rent", RENT), e_(2, "2026-01-03", "payment", RENT),
    e_(3, "2026-02-01", "rent", 1526), e_(4, "2026-02-03", "payment", 1526),
    e_(5, "2026-03-01", "rent", 1663.34),
  ];
  const r = reviewLedger({ jurisdiction: "DC", asOf: "2026-03-31", lease: leaseSched, ledger });
  const d = r.disputes.find((x) => x.issue === "rent_increase_over_cap");
  assert.ok(d, "back-to-back +9% steps must trip the annual cap");
  assert.equal(d.month, "2026-03");
  assert.equal(d.amountInQuestion, 123.34); // 1663.34 − 1400 × 1.10
});

test("increases spaced ≥12 months apart compare against the rent effective 12 months prior, not the previous step", () => {
  // step3 is +9% vs the previous step (old check) but +18.8% vs the 1400 effective 12 months prior
  const leaseClose = {
    ...lease,
    rentSchedule: [
      { from: "2026-01-01", amount: RENT },
      { from: "2026-06-01", amount: 1526 },    // +9%
      { from: "2027-01-01", amount: 1663.34 }, // 7 months later ⇒ cumulative vs 12-mo base
    ],
  };
  const rClose = reviewLedger({ jurisdiction: "DC", asOf: "2027-01-31", lease: leaseClose, ledger: [] });
  assert.ok(rClose.disputes.some((x) => x.issue === "rent_increase_over_cap" && x.month === "2027-01"));
  // same steps spaced ≥12 months apart are lawful under the rolling cap
  const leaseSpaced = {
    ...lease,
    rentSchedule: [
      { from: "2026-01-01", amount: RENT },
      { from: "2026-06-01", amount: 1526 },
      { from: "2027-07-01", amount: 1663.34 }, // 13 months after the +9% step
    ],
  };
  const rSpaced = reviewLedger({ jurisdiction: "DC", asOf: "2027-07-31", lease: leaseSpaced, ledger: [] });
  assert.ok(!rSpaced.disputes.some((x) => x.issue === "rent_increase_over_cap"));
});

test("interest severity derives from sign: under-charged judgment / over-credited deposit are not tenant-harm severities", () => {
  const ledger = cleanLedger().slice(0, 2).concat([
    e_(9, "2026-01-31", "interest", 30, { kind: "judgment", principal: 1000, days: 365, ratePct: 3 }),  // below the 6% rule rate
    e_(10, "2026-01-31", "interest", 300, { kind: "deposit", principal: 1000, days: 365, ratePct: 30 }), // above the 25% rule rate
  ]);
  const r = reviewLedger({ jurisdiction: "DC", asOf: "2026-01-31", lease, ledger });
  const ds = r.disputes.filter((x) => x.issue === "interest_miscalculation");
  assert.equal(ds.length, 2);
  for (const d of ds) assert.equal(d.severity, "accuracy"); // neither direction harms the tenant
  assert.equal(ds[0].amountInQuestion, 30);   // judgment: expected 60, charged 30
  assert.equal(ds[1].amountInQuestion, 50);   // deposit: credited 300, rule requires 250
});

test("parseLedgerTable: leading-zero id like \"007\" is preserved as text, not coerced to 7", () => {
  const csv = "id,date,type,amount\n007,2026-01-01,rent,1400\n7,2026-01-03,payment,1400";
  const p = parseLedgerTable(csv);
  assert.equal(p.errors.length, 0);
  assert.equal(p.entries.length, 2);
  assert.equal(p.entries[0].id, "007");
  assert.equal(p.entries[1].id, 7);
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
