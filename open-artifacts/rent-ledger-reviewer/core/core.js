/**
 * rent-ledger-reviewer — deterministic core.
 *
 * Recomputes a landlord rent ledger entry by entry, validates every charge
 * against jurisdiction rules-as-data (late-fee trigger + cap, allowable
 * charge types, interest rates, annual rent-increase caps), detects
 * overcharges / underpayments / misapplication / claimed-balance mismatches,
 * and emits an itemized dispute report + CSV. Pure arithmetic — no LLM, no
 * guessing; entries that don't fit a rule are flagged, never assumed.
 * Deterministic `parseLedgerTable` turns a pasted CSV/TSV ledger into the
 * entry contract, listing rows it cannot trust instead of guessing them.
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
 * rent or flat, deposit/judgment interest rates, annual increase caps),
 * not legal advice. Each rule carries a `citations[ruleId]` pointer for
 * attorney verification — illustrative, always [verify]-tagged.
 * Maintainers edit data, not code.
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
    depositInterestPct: 25,    // annual % interest owed on the security deposit — illustrative [verify]
    judgmentInterestPct: 6,    // annual % on money judgments — illustrative [verify]
    annualIncreaseCapPct: 10,  // annual rent-increase cap — illustrative [verify]
    citations: {
      "DC-LF": "D.C. Code tit. 42, rent-stabilization late-fee provisions [verify — illustrative]",
      "DC-ALLOWABLE": "D.C. Code tit. 42 + DCMR housing regs [verify — illustrative]",
      "DC-CAP": "D.C. rent-stabilization annual-increase provisions [verify — illustrative]",
      "DC-DI": "D.C. security-deposit escrow/interest provisions [verify — illustrative]",
      "DC-JI": "D.C. judgment-interest provisions [verify — illustrative]",
    },
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
    depositInterestPct: 0,     // no general deposit-interest requirement — illustrative [verify]
    judgmentInterestPct: 10,   // annual % on money judgments — illustrative [verify]
    annualIncreaseCapPct: 5,   // annual rent-increase cap — illustrative [verify]
    citations: {
      "CA-LF": "Cal. Civ. Code late-fee reasonableness case law [verify — illustrative]",
      "CA-ALLOWABLE": "Cal. Civ. Code + local rent ordinances [verify — illustrative]",
      "CA-CAP": "Cal. tenant-protection rent-cap provisions [verify — illustrative]",
      "CA-DI": "Cal. local deposit-interest ordinances [verify — illustrative]",
      "CA-JI": "Cal. judgment-interest provisions [verify — illustrative]",
    },
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
    depositInterestPct: 5,     // annual % interest owed on the security deposit — illustrative [verify]
    judgmentInterestPct: 12,   // annual % on money judgments — illustrative [verify]
    annualIncreaseCapPct: 10,  // annual rent-increase cap — illustrative [verify]
    citations: {
      "MA-LF": "Mass. Gen. Laws ch. 186 late-fee provisions [verify — illustrative]",
      "MA-ALLOWABLE": "Mass. Gen. Laws ch. 186 + 254 CMR [verify — illustrative]",
      "MA-CAP": "Mass. local rent-stabilization/tenancy provisions [verify — illustrative]",
      "MA-DI": "Mass. security-deposit interest provisions [verify — illustrative]",
      "MA-JI": "Mass. judgment-interest provisions [verify — illustrative]",
    },
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
 * Recompute an interest entry at the ruleset's rate. `kind:"deposit"`
 * (default) is interest credited to the tenant (e.g. security-deposit
 * escrow interest); `kind:"judgment"` is interest charged on arrears.
 * @param {LedgerEntry} e type "interest" with principal, days, ratePct
 * @param {Object} rules
 * @returns {{kind:string, pct:number, expected:number, lawfulAmount:number, ok:boolean, amountInQuestion:number}}
 */
export function validateInterest(e, rules) {
  const kind = e.kind === "judgment" ? "judgment" : "deposit";
  const pct = kind === "judgment" ? rules.judgmentInterestPct : rules.depositInterestPct;
  const expected = cents((e.principal * pct * e.days) / 36500);
  const lawfulAmount = kind === "judgment" ? Math.min(e.amount, expected) : Math.max(e.amount, expected);
  return {
    kind, pct, expected,
    lawfulAmount: cents(lawfulAmount),
    ok: Math.abs(e.amount - expected) <= 0.005,
    amountInQuestion: cents(Math.abs(e.amount - expected)),
  };
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
    claimedBalance: null,
    underpayments: [],
    ignoredEntries: [],
    gate: GATE,
  };
  const errors = [];
  if (!rules || !asOf || !input?.lease || typeof input.lease.monthlyRent !== "number" || !parseDate(input.lease.leaseStart)) {
    errors.push("Input incomplete: need jurisdiction with a ruleset, asOf (YYYY-MM-DD), lease.monthlyRent and lease.leaseStart.");
  }
  if (input?.ledger != null && !Array.isArray(input.ledger)) {
    errors.push("Input ledger must be an array of entries.");
  }
  // optional rent schedule: [{from:"YYYY-MM-DD", amount}] steps — validated, never guessed
  const schedule = [];
  if (input?.lease && input.lease.rentSchedule != null) {
    if (!Array.isArray(input.lease.rentSchedule)) {
      errors.push("lease.rentSchedule must be an array of {from, amount} steps.");
    } else {
      for (const s of input.lease.rentSchedule) {
        const f = parseDate(s?.from);
        if (!f || typeof s?.amount !== "number" || !Number.isFinite(s.amount) || s.amount <= 0) {
          errors.push(`Invalid lease.rentSchedule step: ${JSON.stringify(s)}`);
        } else {
          schedule.push({ from: f, month: monthKey(f), amount: cents(s.amount) });
        }
      }
    }
  }
  if (errors.length) { out.errors = errors; return out; }
  const monthlyRent = cents(input.lease.monthlyRent);
  const dueDay = input.lease.rentDueDay ?? 1;
  const start = parseDate(input.lease.leaseStart);
  // entry hardening: invalid entries are listed in ignoredEntries, never dropped silently
  const entries = [];
  const seenIds = new Set();
  for (const e of Array.isArray(input.ledger) ? input.ledger : []) {
    const reasons = [];
    if (e == null || typeof e !== "object") {
      reasons.push("entry is not an object");
    } else {
      if (e.id == null || e.id === "") reasons.push("missing id");
      else if (seenIds.has(String(e.id))) reasons.push(`duplicate id ${e.id}`);
      if (!parseDate(e.date)) reasons.push(`unparseable date ${JSON.stringify(e.date)}`);
      if (typeof e.amount !== "number" || !Number.isFinite(e.amount) || e.amount <= 0) reasons.push(`invalid amount ${JSON.stringify(e.amount)}`);
      if (e.type == null || e.type === "") reasons.push("missing type");
      if (e.type === "interest") {
        const kind = e.kind ?? "deposit";
        if (kind !== "deposit" && kind !== "judgment") reasons.push(`unknown interest kind ${JSON.stringify(e.kind)}`);
        for (const f of ["principal", "days", "ratePct"]) {
          if (typeof e[f] !== "number" || !Number.isFinite(e[f]) || e[f] < 0) reasons.push(`interest entry missing valid ${f}`);
        }
      }
    }
    if (reasons.length) out.ignoredEntries.push({ entry: e, reason: reasons.join("; ") });
    else { seenIds.add(String(e.id)); entries.push(e); }
  }
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

  /** Scheduled rent for a month: the last rentSchedule step effective by then. */
  const rentForMonth = (mk) => {
    let amt = monthlyRent;
    for (const s of schedule) if (s.month <= mk) amt = s.amount;
    return amt;
  };

  // --- rent schedule vs annual-increase cap (rolling 12-month lookback) ---
  // Each step is compared to the rent effective <= 12 months before it (the
  // lease-start rent when the lookback predates the tenancy), so two lawful
  // steps stacked inside 12 months cannot slip past an annual cap.
  if (typeof rules.annualIncreaseCapPct === "number" && schedule.length) {
    const timeline = [{ from: start, month: monthKey(start), amount: monthlyRent }, ...schedule];
    for (let i = 1; i < timeline.length; i++) {
      const s = timeline[i];
      const lookback = new Date(Date.UTC(s.from.getUTCFullYear() - 1, s.from.getUTCMonth(), s.from.getUTCDate()));
      let base = timeline[0].amount; // lookback predates the tenancy: base = lease-start rent
      for (let j = 0; j < i; j++) if (timeline[j].from <= lookback) base = timeline[j].amount;
      const risePct = base > 0 ? ((s.amount - base) / base) * 100 : 0;
      if (risePct > rules.annualIncreaseCapPct + 1e-9) {
        const capLine = cents(base * (1 + rules.annualIncreaseCapPct / 100));
        out.disputes.push({
          issue: "rent_increase_over_cap",
          severity: "overcharge",
          month: s.month,
          amountInQuestion: cents(s.amount - capLine),
          ruleId: `${rules.id}-CAP`,
          citation: rules.citations?.[`${rules.id}-CAP`],
          text: `Scheduled rent rises to ${s.amount.toFixed(2)} effective ${fmtDate(s.from)} (+${risePct.toFixed(1)}% over the ${base.toFixed(2)} in effect 12 months prior), above the ${rules.annualIncreaseCapPct}% annual-increase cap (illustrative); capped at ${capLine.toFixed(2)}.`,
        });
      }
    }
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
        amountInQuestion: rentForMonth(month),
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
      const sched = rentForMonth(month);
      if (d.amount > sched + 0.005) {
        out.disputes.push({
          issue: "rent_overcharged",
          severity: "overcharge",
          month,
          entryId: d.id,
          amountInQuestion: cents(d.amount - sched),
          ruleId: "LEASE-RENT",
          text: `Rent charged ${d.amount.toFixed(2)} for ${month} exceeds the scheduled rent ${sched.toFixed(2)}.`,
        });
      }
    }
  }

  // --- allocate payments oldest-first; find underpayments & late-fee context ---
  const remaining = new Map(expected.map(({ month }) => [month, rentForMonth(month)]));
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
          citation: rules.citations?.[rules.lateFee.ruleId],
          text: `More than one late fee recorded for ${mk}.`,
        });
        continue;
      }
      const verdict = validateLateFee(fee, mk, {
        monthlyRent: rentForMonth(mk), dueDate,
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
          citation: rules.citations?.[r.ruleId],
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
        citation: rules.citations?.[`${rules.id}-ALLOWABLE`],
        text: `Charge of type "${e.type}" (${e.amount.toFixed(2)} on ${e.date}) is not an allowable charge type in the ${rules.id} example ruleset.`,
      });
    }
  }

  // --- unknown charge types: neither known nor listed — flagged, never assumed lawful ---
  const KNOWN_TYPES = ["rent", "payment", "late_fee", "interest"];
  for (const e of entries) {
    if (KNOWN_TYPES.includes(e.type)) continue;
    if (rules.disallowedChargeTypes.includes(e.type) || rules.allowableChargeTypes.includes(e.type)) continue;
    out.disputes.push({
      issue: "unknown_charge_type",
      severity: "unverifiable",
      entryId: e.id, month: monthKey(parseDate(e.date)),
      amountInQuestion: e.amount,
      ruleId: `${rules.id}-ALLOWABLE`,
      citation: rules.citations?.[`${rules.id}-ALLOWABLE`],
      text: `Charge of type "${e.type}" (${e.amount.toFixed(2)} on ${e.date}) is neither a known ledger type nor in the ${rules.id} example ruleset's allowable list; excluded from the lawful balance pending attorney review.`,
    });
  }

  // --- running balance recomputation (ledger vs lawful) ---
  let bal = 0;
  let lawfulBal = 0;
  const lawfulFee = new Map(); // entryId -> lawful amount for disallowed portions
  for (const e of entries) {
    if (e.type === "payment") { bal = cents(bal - e.amount); lawfulBal = cents(lawfulBal - e.amount); }
    else if (e.type === "rent") { bal = cents(bal + e.amount); lawfulBal = cents(lawfulBal + Math.min(e.amount, rentForMonth(monthKey(parseDate(e.date))))); }
    else if (e.type === "late_fee") {
      bal = cents(bal + e.amount);
      const mk = e.appliedTo ?? monthKey(addDays(parseDate(e.date), -30));
      const ctxMonth = expected.find((x) => x.month === mk);
      const verdict = validateLateFee(e, mk, {
        monthlyRent: rentForMonth(mk),
        dueDate: ctxMonth ? ctxMonth.dueDate : dueDateFor(parseDate(`${mk}-01`), dueDay),
        paymentDate: coveredOn.get(mk) ?? null,
        rules,
      });
      lawfulFee.set(String(e.id), verdict.lawfulAmount);
      lawfulBal = cents(lawfulBal + verdict.lawfulAmount);
    } else if (e.type === "interest") {
      const v = validateInterest(e, rules);
      const ruleId = v.kind === "judgment" ? `${rules.id}-JI` : `${rules.id}-DI`;
      if (v.kind === "judgment") { bal = cents(bal + e.amount); lawfulBal = cents(lawfulBal + v.lawfulAmount); }
      else { bal = cents(bal - e.amount); lawfulBal = cents(lawfulBal - v.lawfulAmount); }
      if (!v.ok) {
        // severity from the direction of the error, not the interest kind:
        // only amount-vs-expected in the tenant-harm direction is an overcharge/shortfall
        const overcharged = e.amount > v.expected;
        out.disputes.push({
          issue: "interest_miscalculation",
          severity: v.kind === "judgment"
            ? (overcharged ? "overcharge" : "accuracy")
            : (overcharged ? "accuracy" : "tenant_credit_shortfall"),
          entryId: e.id, month: monthKey(parseDate(e.date)),
          amountInQuestion: v.amountInQuestion,
          ruleId,
          citation: rules.citations?.[ruleId],
          text: `Interest ${v.kind === "judgment" ? "charged" : "credited"} ${e.amount.toFixed(2)} on principal ${e.principal.toFixed(2)} at ${e.ratePct}%/yr for ${e.days} days, but the ${rules.id} example ruleset rate is ${v.pct}%/yr ⇒ ${v.expected.toFixed(2)} — a ${v.amountInQuestion.toFixed(2)} difference.`,
        });
      }
    } else if (rules.disallowedChargeTypes.includes(e.type) || !rules.allowableChargeTypes.includes(e.type)) {
      bal = cents(bal + e.amount); // disallowed or unknown: stays in ledger balance, excluded from lawful (flagged above)
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
  // --- claimed balance (what the landlord/complaint says is owed) vs recomputation ---
  const claimedRaw = input?.claimedBalance && typeof input.claimedBalance === "object" ? input.claimedBalance.amount : input.claimedBalance;
  if (typeof claimedRaw === "number" && Number.isFinite(claimedRaw)) {
    const claimed = cents(claimedRaw);
    const delta = cents(claimed - bal);
    out.claimedBalance = { claimed, recomputed: bal, delta };
    if (Math.abs(delta) > 0.005) {
      out.disputes.push({
        issue: "claimed_balance_mismatch",
        severity: "accuracy",
        amountInQuestion: Math.abs(delta),
        ruleId: "RECOMPUTE",
        text: `The landlord-claimed balance of ${claimed.toFixed(2)} differs from the recomputed as-charged balance of ${bal.toFixed(2)} by ${Math.abs(delta).toFixed(2)} — verify the amount demanded in the complaint.`,
      });
    }
  }
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

/**
 * Deterministic CSV/TSV ledger-table parser (subset: no embedded-delimiter
 * quoting; optional surrounding double quotes only). Required header
 * columns: date, type, amount. Optional: id (or entry_id), applied_to,
 * note, kind, rate_pct, principal, days. Without an id column, accepted
 * rows get sequential ids 1..n. Rows that fail entry validation are listed
 * in ignoredRows with a reason — never dropped silently.
 * @param {string} text
 * @returns {{entries: Object[], ignoredRows: {line:number, reason:string, raw:string}[], errors: string[]}}
 */
export function parseLedgerTable(text) {
  const result = { entries: [], ignoredRows: [], errors: [] };
  if (typeof text !== "string" || !text.trim()) {
    result.errors.push("parseLedgerTable: empty input");
    return result;
  }
  const lines = text.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => l.trim() !== "");
  const delim = lines[headerIdx].includes("\t") ? "\t" : ",";
  const ALIAS = { entry_id: "id", entryid: "id", rate_pct: "ratepct", applied_to: "appliedto" };
  const header = lines[headerIdx].split(delim).map((h) => {
    const k = h.trim().toLowerCase().replace(/[\s-]+/g, "_");
    return ALIAS[k] ?? k;
  });
  const col = {};
  header.forEach((h, i) => { if (!(h in col)) col[h] = i; });
  const missing = ["date", "type", "amount"].filter((c) => !(c in col));
  if (missing.length) {
    result.errors.push(`parseLedgerTable: header missing required column(s): ${missing.join(", ")}.`);
    return result;
  }
  const hasId = "id" in col;
  const unquote = (s) => {
    const t = s.trim();
    return t.length >= 2 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t;
  };
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    const cells = raw.split(delim);
    const cell = (name) => (name in col && col[name] < cells.length ? unquote(cells[col[name]]) : "");
    const reasons = [];
    const date = cell("date");
    const type = cell("type");
    const amountRaw = cell("amount");
    const amount = Number(amountRaw.replace(/[$,\s]/g, ""));
    let id;
    if (hasId) {
      const idText = cell("id");
      if (idText === "") reasons.push("missing id");
      else id = /^0\d/.test(idText) ? idText : (/^\d+$/.test(idText) ? Number(idText) : idText);
    }
    if (!parseDate(date)) reasons.push(`unparseable date "${date}"`);
    if (type === "") reasons.push("missing type");
    if (!Number.isFinite(amount) || amount <= 0) reasons.push(`invalid amount "${amountRaw}"`);
    if (reasons.length) {
      result.ignoredRows.push({ line: i + 1, reason: reasons.join("; "), raw });
      continue;
    }
    const entry = { id: hasId ? id : result.entries.length + 1, date, type, amount };
    if (cell("appliedto")) entry.appliedTo = cell("appliedto");
    if (cell("note")) entry.note = cell("note");
    if (cell("kind")) entry.kind = cell("kind");
    for (const [colName, field] of [["ratepct", "ratePct"], ["principal", "principal"], ["days", "days"]]) {
      const t = cell(colName);
      if (t !== "") {
        const n = Number(t.replace(/[$,\s]/g, ""));
        if (Number.isFinite(n)) entry[field] = n;
      }
    }
    result.entries.push(entry);
  }
  return result;
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
  if (review.claimedBalance) {
    const cb = review.claimedBalance;
    L.push(`Landlord-claimed balance **${cb.claimed.toFixed(2)}** vs recomputed as-charged **${cb.recomputed.toFixed(2)}** — difference **${Math.abs(cb.delta).toFixed(2)}**.`);
    L.push("");
  }
  if (review.disputes.length) {
    L.push(`## Itemized disputes (${review.disputes.length})`);
    L.push("");
    L.push("| # | Issue | Month | Amount | Rule | Entry | Description |");
    L.push("|---|---|---|---:|---|---|---|");
    review.disputes.forEach((d, i) => {
      const rule = d.citation ? `\`${d.ruleId}\` ${d.citation}` : `\`${d.ruleId}\``;
      L.push(`| ${i + 1} | ${d.issue} | ${d.month ?? ""} | ${(d.amountInQuestion ?? 0).toFixed(2)} | ${rule} | ${d.entryId != null ? String(d.entryId) : ""} | ${d.text.replace(/\|/g, "\\|")} |`);
    });
  } else {
    L.push("## Itemized disputes\n\nNone — no rule violations detected in the recomputation.");
  }
  if (review.underpayments?.length) {
    L.push("");
    L.push(`## Underpayments / shortfalls (${review.underpayments.length})`);
    for (const u of review.underpayments) L.push(`- ${u.month} (due ${u.dueDate}): shortfall **${u.shortfall.toFixed(2)}**`);
  }
  if (review.ignoredEntries?.length) {
    L.push("");
    L.push(`## Ignored entries (${review.ignoredEntries.length})`);
    for (const g of review.ignoredEntries) L.push(`- ${JSON.stringify(g.entry)} — ${g.reason}`);
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
