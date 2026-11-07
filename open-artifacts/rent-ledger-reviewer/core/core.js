/**
 * rent-ledger-reviewer — deterministic core.
 *
 * Recomputes a landlord rent ledger entry by entry, validates every charge
 * against jurisdiction rules-as-data (late-fee trigger + cap, allowable
 * charge types), detects overcharges / underpayments / misapplication, and
 * emits an itemized dispute report + CSV. Pure arithmetic — no LLM, no
 * guessing; entries that don't fit a rule are flagged, never assumed.
 *
 * Dependency-free plain-JavaScript ES module; browser + Node compatible.
 * No hidden clocks: all time math anchors to a caller-supplied `asOf`.
 * @module core
 */

/* ---------- date helpers (self-contained by design) ---------- */

/** Parse "YYYY-MM-DD" to a UTC Date. Null when unparseable — never guessed.
 * @param {string|undefined|null} d
 * @returns {Date|null} */
export function parseDate(d) {
  if (!d || typeof d !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.trim());
  if (!m) return null;
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (Number.isNaN(dt.getTime())) return null;
  if (dt.getUTCMonth() !== +m[2] - 1 || dt.getUTCDate() !== +m[3]) return null;
  return dt;
}

/** Format a UTC date back to "YYYY-MM-DD".
 * @param {Date|null} dt
 * @returns {string|null} */
export function fmtDate(dt) {
  return dt ? dt.toISOString().slice(0, 10) : null;
}

/** Add days.
 * @param {Date} dt @param {number} days @returns {Date} */
export function addDays(dt, days) {
  return new Date(dt.getTime() + days * 86400000);
}

/** Whole days from a to b (b - a).
 * @param {Date} a @param {Date} b @returns {number} */
export function daysBetween(a, b) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/** Month key "YYYY-MM" from a UTC date.
 * @param {Date} dt @returns {string} */
export function monthKey(dt) {
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The due date (UTC) of rent for the month of `dt`, on `dueDay`.
 * @param {Date} dt @param {number} dueDay @returns {Date} */
export function dueDateFor(dt, dueDay) {
  const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(dueDay, last);
  return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), day));
}

/** Round to cents.
 * @param {number} n @returns {number} */
export function cents(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/* ---------- rules-as-data (illustrative, editable) ---------- */

/**
 * Example US jurisdiction rulesets. ILLUSTRATIVE ONLY — modeled on common
 * tenant-protection shapes (grace periods, late-fee caps as % of monthly
 * rent or flat), not legal advice. Maintainers edit data, not code.
 * @type {Record<string, Object>}
 */
export const JURISDICTION_RULES = {
  DC: {
    id: "DC",
    name: "District of Columbia (example ruleset)",
    version: "2026-11-example",
    lateFee: {
      ruleId: "DC-LF",
      graceDays: 5,                    // no late fee until rent is this many days past due
      capType: "percent_monthly_rent",
      capValue: 5,                     // 5% of monthly rent
      oncePerMonth: true,
    },
    allowableChargeTypes: ["rent", "late_fee"],
    disallowedChargeTypes: ["misc_fee", "court_cost", "repair", "replacement_key"],
    partialPayments: "must_be_accepted", // ledger may not reject/short-apply partial payment
    notes: "Modeled on D.C.-style tenant protections (5-day grace, 5%-of-rent cap).",
  },
  CA: {
    id: "CA",
    name: "California (example ruleset)",
    version: "2026-11-example",
    lateFee: {
      ruleId: "CA-LF",
      graceDays: 3,
      capType: "flat",
      capValue: 75,
      oncePerMonth: true,
    },
    allowableChargeTypes: ["rent", "late_fee"],
    disallowedChargeTypes: ["misc_fee", "court_cost", "repair"],
    partialPayments: "must_be_accepted",
    notes: "Illustrative flat-cap example; CA law requires late fees be 'reasonable'.",
  },
  MA: {
    id: "MA",
    name: "Massachusetts (example ruleset)",
    version: "2026-11-example",
    lateFee: {
      ruleId: "MA-LF",
      graceDays: 30,
      capType: "percent_monthly_rent",
      capValue: 4,
      oncePerMonth: true,
    },
    allowableChargeTypes: ["rent", "late_fee"],
    disallowedChargeTypes: ["misc_fee", "repair", "replacement_key"],
    partialPayments: "must_be_accepted",
    notes: "Illustrative: 30-day grace shape with a 4%-of-rent cap.",
  },
};

/** Load a ruleset by id; null when unknown (never a fallback guess).
 * @param {string} id @returns {Object|null} */
export function getRuleset(id) {
  return JURISDICTION_RULES[id] ?? null;
}

/* ---------- engine ---------- */

/**
 * @typedef {Object} LedgerEntry
 * @property {string|number} id
 * @property {string} date
 * @property {string} type rent|late_fee|payment|<anything>
 * @property {number} amount               positive number
 * @property {string} [note]
 * @property {string} [appliedTo]          "YYYY-MM" target month claimed by landlord
 */

/**
 * @typedef {Object} ReviewInput
 * @property {string} jurisdiction
 * @property {string} asOf
 * @property {{monthlyRent:number, leaseStart:string, rentDueDay?:number}} lease
 * @property {LedgerEntry[]} ledger
 */

/**
 * Validate a late fee against the ruleset for a given month.
 * @param {LedgerEntry} fee
 * @param {string} month "YYYY-MM"
 * @param {Object} ctx { monthlyRent, dueDate, paymentDate|null (Date), rules }
 * @returns {{lawful:boolean, lawfulAmount:number, reasons:{code:string, ruleId:string, text:string}[]}}
 */
export function validateLateFee(fee, month, ctx) {
  const reasons = [];
  const lf = ctx.rules.lateFee;
  let lawfulAmount = 0;
  const deadline = addDays(ctx.dueDate, lf.graceDays);
  const triggered = ctx.paymentDate === null
    ? true // unpaid: fee MAY be triggered (still capped)
    : daysBetween(deadline, ctx.paymentDate) > 0;
  if (!triggered) {
    reasons.push({
      code: "late_fee_before_grace",
      ruleId: lf.ruleId,
      text: `Fee charged for ${month}, but rent was paid by ${fmtDate(ctx.paymentDate)}, within the ${lf.graceDays}-day grace window (due ${fmtDate(ctx.dueDate)}).`,
    });
  }
  const cap = lf.capType === "percent_monthly_rent" ? (ctx.monthlyRent * lf.capValue) / 100 : lf.capValue;
  const cappedAmount = Math.min(fee.amount, cap);
  if (fee.amount > cap) {
    reasons.push({
      code: "late_fee_over_cap",
      ruleId: lf.ruleId,
      text: `Fee ${fee.amount.toFixed(2)} exceeds the ${lf.capType === "percent_monthly_rent" ? lf.capValue + "% of monthly rent" : "flat"} cap of ${cents(cap).toFixed(2)} for ${month}.`,
    });
  }
  if (triggered) lawfulAmount = cents(cappedAmount);
  return { lawful: reasons.length === 0, lawfulAmount, reasons };
}

/**
 * Recompute the ledger and produce the itemized review.
 * @param {ReviewInput} input
 * @returns {Object} review report
 */
export function reviewLedger(input) {
  const asOf = parseDate(input?.asOf);
  const rules = input?.jurisdiction ? getRuleset(input.jurisdiction) : null;
  const out = {
    asOf: input?.asOf ?? null,
    jurisdiction: input?.jurisdiction ?? null,
    ruleset: rules ? { id: rules.id, name: rules.name, version: rules.version } : null,
    rows: [],
    disputes: [],
    balance: { ledgerFinal: 0, lawfulFinal: 0, overchargeTotal: 0 },
    underpayments: [],
    gate: GATE,
  };
  if (!rules || !asOf || !input?.lease || typeof input.lease.monthlyRent !== "number" || !parseDate(input.lease.leaseStart)) {
    out.errors = ["Input incomplete: need jurisdiction with a ruleset, asOf (YYYY-MM-DD), lease.monthlyRent and lease.leaseStart."];
    return out;
  }
  const monthlyRent = cents(input.lease.monthlyRent);
  const dueDay = input.lease.rentDueDay ?? 1;
  const start = parseDate(input.lease.leaseStart);
  const entries = [...(input.ledger ?? [])].filter((e) => parseDate(e?.date));
  entries.sort((a, b) => {
    const d = parseDate(a.date).getTime() - parseDate(b.date).getTime();
    return d !== 0 ? d : String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
  });

  // --- expected rent schedule (months whose due date has passed by asOf) ---
  /** @type {{month:string, dueDate:Date}[]} */
  const expected = [];
  for (let cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)); cur <= asOf; cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1))) {
    const due = dueDateFor(cur, dueDay);
    if (due >= start && due <= asOf) expected.push({ month: monthKey(cur), dueDate: due });
  }

  // --- index ledger entries ---
  const rentDueByMonth = new Map();   // month -> entries of type rent
  const paymentsByMonth = new Map();  // month -> entries (for late-fee trigger detection we allocate oldest-first below)
  for (const e of entries) {
    if (e.type === "rent") {
      if (!rentDueByMonth.has(monthKey(parseDate(e.date)))) rentDueByMonth.set(monthKey(parseDate(e.date)), []);
      rentDueByMonth.get(monthKey(parseDate(e.date))).push(e);
    }
    if (e.type === "payment") {
      if (!paymentsByMonth.has(monthKey(parseDate(e.date)))) paymentsByMonth.set(monthKey(parseDate(e.date)), []);
      paymentsByMonth.get(monthKey(parseDate(e.date))).push(e);
    }
  }

  // --- schedule checks: missing / duplicate / wrong-amount rent dues ---
  for (const { month } of expected) {
    const dues = rentDueByMonth.get(month) ?? [];
    if (dues.length === 0) {
      out.disputes.push({
        issue: "missing_rent_entry",
        severity: "landlord_omission",
        month,
        amountInQuestion: monthlyRent,
        ruleId: "LEDGER-COMPLETENESS",
        text: `No rent entry recorded for ${month} though the lease was active and the due date passed ${fmtDate(asOf) ? "by " + out.asOf : ""}.`,
      });
    } else if (dues.length > 1) {
      out.disputes.push({
        issue: "duplicate_rent_entry",
        severity: "overcharge",
        month,
        amountInQuestion: cents(dues.slice(1).reduce((s, d) => s + d.amount, 0)),
        ruleId: "LEDGER-COMPLETENESS",
        text: `${dues.length} rent entries recorded for ${month}; only one monthly rent charge is expected.`,
        entryIds: dues.map((d) => d.id),
      });
    }
    for (const d of dues) {
      if (d.amount > monthlyRent + 0.005) {
        out.disputes.push({
          issue: "rent_overcharged",
          severity: "overcharge",
          month,
          entryId: d.id,
          amountInQuestion: cents(d.amount - monthlyRent),
          ruleId: "LEASE-RENT",
          text: `Rent charged ${d.amount.toFixed(2)} for ${month} exceeds the lease rent ${monthlyRent.toFixed(2)}.`,
        });
      }
    }
  }

  // --- allocate payments oldest-first; find underpayments & late-fee context ---
  const remaining = new Map(expected.map(({ month }) => [month, monthlyRent]));
  /** month -> Date of payment that first covered the month's rent (or null) */
  const coveredOn = new Map(expected.map(({ month }) => [month, null]));
  const openMonths = [...remaining.keys()];
  for (const e of entries) {
    if (e.type !== "payment") continue;
    let credit = e.amount;
    // misapplication: landlord tagged this payment to a newer month while older months are open
    if (e.appliedTo && openMonths.some((m) => m < e.appliedTo && remaining.get(m) > 0)) {
      out.disputes.push({
        issue: "payment_misapplied",
        severity: "misapplication",
        entryId: e.id,
        month: e.appliedTo,
        amountInQuestion: 0,
        ruleId: "ALLOCATION-OLDEST-FIRST",
        text: `Payment on ${e.date} recorded against ${e.appliedTo}, but ${openMonths.find((m) => m < e.appliedTo && remaining.get(m) > 0)} still carried a balance. Standard allocation applies payments to the oldest debt first.`,
      });
    }
    for (const m of openMonths) {
      if (credit <= 0) break;
      const owed = remaining.get(m);
      if (owed <= 0) continue;
      const applied = Math.min(credit, owed);
      remaining.set(m, cents(owed - applied));
      credit = cents(credit - applied);
      if (remaining.get(m) === 0 && !coveredOn.get(m)) coveredOn.set(m, parseDate(e.date));
    }
  }
  for (const { month, dueDate } of expected) {
    const short = remaining.get(month);
    if (short > 0) {
      out.underpayments.push({ month, dueDate: fmtDate(dueDate), shortfall: short, stillOwed: short });
    }
  }

  // --- late fee validation ---
  const feesByMonth = new Map();
  for (const e of entries) {
    if (e.type !== "late_fee") continue;
    const mk = e.appliedTo ?? monthKey(addDays(parseDate(e.date), -30)); // fall back to the month before the fee date
    if (!feesByMonth.has(mk)) feesByMonth.set(mk, []);
    feesByMonth.get(mk).push(e);
  }
  for (const [mk, fees] of feesByMonth) {
    const ctxMonth = expected.find((x) => x.month === mk);
    const dueDate = ctxMonth ? ctxMonth.dueDate : dueDateFor(parseDate(`${mk}-01`), dueDay);
    for (const [i, fee] of fees.entries()) {
      if (rules.lateFee.oncePerMonth && i > 0) {
        out.disputes.push({
          issue: "late_fee_charged_twice",
          severity: "overcharge",
          entryId: fee.id, month: mk, amountInQuestion: fee.amount,
          ruleId: rules.lateFee.ruleId,
          text: `More than one late fee recorded for ${mk}.`,
        });
        continue;
      }
      const verdict = validateLateFee(fee, mk, {
        monthlyRent, dueDate,
        paymentDate: coveredOn.get(mk) ?? null,
        rules,
      });
      for (const r of verdict.reasons) {
        out.disputes.push({
          issue: r.code,
          severity: "overcharge",
          entryId: fee.id, month: mk,
          amountInQuestion: cents(fee.amount - verdict.lawfulAmount),
          ruleId: r.ruleId,
          text: r.text,
        });
      }
    }
  }

  // --- disallowed charge types ---
  for (const e of entries) {
    if (rules.disallowedChargeTypes.includes(e.type)) {
      out.disputes.push({
        issue: "disallowed_charge_type",
        severity: "overcharge",
        entryId: e.id, month: monthKey(parseDate(e.date)),
        amountInQuestion: e.amount,
        ruleId: `${rules.id}-ALLOWABLE`,
        text: `Charge of type "${e.type}" (${e.amount.toFixed(2)} on ${e.date}) is not an allowable charge type in the ${rules.id} example ruleset.`,
      });
    }
  }

  // --- running balance recomputation (ledger vs lawful) ---
  let bal = 0;
  let lawfulBal = 0;
  const lawfulFee = new Map(); // entryId -> lawful amount for disallowed portions
  for (const e of entries) {
    let lawfulDelta = null;
    if (e.type === "payment") { bal = cents(bal - e.amount); lawfulBal = cents(lawfulBal - e.amount); }
    else if (e.type === "rent") { bal = cents(bal + e.amount); lawfulBal = cents(lawfulBal + Math.min(e.amount, monthlyRent)); }
    else if (e.type === "late_fee") {
      bal = cents(bal + e.amount);
      const mk = e.appliedTo ?? monthKey(addDays(parseDate(e.date), -30));
      const ctxMonth = expected.find((x) => x.month === mk);
      const verdict = validateLateFee(e, mk, {
        monthlyRent,
        dueDate: ctxMonth ? ctxMonth.dueDate : dueDateFor(parseDate(`${mk}-01`), dueDay),
        paymentDate: coveredOn.get(mk) ?? null,
        rules,
      });
      lawfulFee.set(String(e.id), verdict.lawfulAmount);
      lawfulBal = cents(lawfulBal + verdict.lawfulAmount);
    } else if (rules.disallowedChargeTypes.includes(e.type)) {
      bal = cents(bal + e.amount); // stays in ledger balance, excluded from lawful
    } else {
      bal = cents(bal + e.amount); lawfulBal = cents(lawfulBal + e.amount);
    }
    out.rows.push({
      entryId: e.id, date: e.date, type: e.type, note: e.note ?? "",
      amount: cents(e.amount), balanceAfter: bal,
      lawfulBalanceAfter: lawfulBal,
    });
  }
  out.balance = {
    ledgerFinal: bal,
    lawfulFinal: lawfulBal,
    overchargeTotal: cents(Math.max(0, bal - lawfulBal)),
  };
  out.expectedMonths = expected.length;
  return out;
}

/** The counsel/verify gate attached to every report.
 * @type {{required:boolean, message:string}} */
export const GATE = {
  required: true,
  message:
    "Recomputation uses illustrative example rulesets; figures are screening " +
    "estimates for attorney review, not a determination of what is owed. " +
    "Verify against the actual lease, ledger originals, and current local law.",
};

/** CSV export of the recomputed ledger rows.
 * @param {ReturnType<reviewLedger>} review
 * @returns {string} */
export function toCSV(review) {
  const head = "entry_id,date,type,amount,balance_after,lawful_balance_after,note";
  const rows = (review.rows ?? []).map((r) =>
    [r.entryId, r.date, r.type, r.amount.toFixed(2), r.balanceAfter.toFixed(2), r.lawfulBalanceAfter.toFixed(2), JSON.stringify(r.note ?? "")].join(","),
  );
  return [head, ...rows].join("\r\n") + "\r\n";
}

/** Markdown dispute report.
 * @param {ReturnType<reviewLedger>} review
 * @returns {string} */
export function renderReport(review) {
  const L = [];
  const rs = review.ruleset ? `${review.ruleset.id} v${review.ruleset.version}` : "none";
  L.push(`# Rent ledger review — ${review.jurisdiction ?? "?"} (ruleset ${rs})`);
  L.push("");
  L.push(`As of **${review.asOf ?? "?"}** · recomputed **${review.rows.length}** entries across **${review.expectedMonths ?? 0}** expected rent months.`);
  L.push("");
  L.push(`| Balance (as ledger stands) | Balance (lawful charges only) | Overcharge identified |`);
  L.push(`|---:|---:|---:|`);
  L.push(`| ${review.balance.ledgerFinal.toFixed(2)} | ${review.balance.lawfulFinal.toFixed(2)} | **${review.balance.overchargeTotal.toFixed(2)}** |`);
  L.push("");
  if (review.disputes.length) {
    L.push(`## Itemized disputes (${review.disputes.length})`);
    L.push("");
    L.push("| # | Issue | Month | Amount | Rule | Entry | Description |");
    L.push("|---|---|---|---:|---|---|---|");
    review.disputes.forEach((d, i) => {
      L.push(`| ${i + 1} | ${d.issue} | ${d.month ?? ""} | ${(d.amountInQuestion ?? 0).toFixed(2)} | \`${d.ruleId}\` | ${d.entryId != null ? String(d.entryId) : ""} | ${d.text.replace(/\|/g, "\\|")} |`);
    });
  } else {
    L.push("## Itemized disputes\n\nNone — no rule violations detected in the recomputation.");
  }
  if (review.underpayments?.length) {
    L.push("");
    L.push(`## Underpayments / shortfalls (${review.underpayments.length})`);
    for (const u of review.underpayments) L.push(`- ${u.month} (due ${u.dueDate}): shortfall **${u.shortfall.toFixed(2)}**`);
  }
  if (review.errors?.length) {
    L.push("");
    L.push("## Input errors");
    for (const e of review.errors) L.push(`- ${e}`);
  }
  L.push("");
  L.push("---");
  L.push(`> ⚠️ ${review.gate.message}`);
  return L.join("\n") + "\n";
}
