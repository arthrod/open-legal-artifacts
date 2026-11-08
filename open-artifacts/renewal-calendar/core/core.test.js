/** Tests for renewal-calendar core. Run: node --test core/core.test.js (from artifact root) */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDate, fmtDate, daysBetween, quarterEndOnOrAfter, monthEndOnOrAfter, normalizeDateExpression, buildCalendar, toICS, DEFAULT_RULES } from "./core.js";

const AS_OF = "2026-11-07";

/* ---------- date helpers ---------- */

test("quarterEndOnOrAfter picks the right quarter boundary", () => {
  assert.equal(fmtDate(quarterEndOnOrAfter(parseDate("2026-11-07"))), "2026-12-31");
  assert.equal(fmtDate(quarterEndOnOrAfter(parseDate("2026-12-31"))), "2026-12-31");
  assert.equal(fmtDate(quarterEndOnOrAfter(parseDate("2027-01-01"))), "2027-03-31");
  assert.equal(fmtDate(quarterEndOnOrAfter(parseDate("2026-04-15"))), "2026-06-30");
});

test("monthEndOnOrAfter picks the right month boundary", () => {
  assert.equal(fmtDate(monthEndOnOrAfter(parseDate("2026-11-07"))), "2026-11-30");
  assert.equal(fmtDate(monthEndOnOrAfter(parseDate("2026-11-30"))), "2026-11-30");
  assert.equal(fmtDate(monthEndOnOrAfter(parseDate("2026-12-31"))), "2026-12-31");
  assert.equal(fmtDate(monthEndOnOrAfter(parseDate("2027-02-10"))), "2027-02-28");
});

test("parseDate rejects impossible dates", () => {
  assert.equal(parseDate("2027-02-29"), null);
  assert.ok(parseDate("2028-02-29")); // leap year ok
});

/* ---------- date-expression normalization ---------- */

test("normalizeDateExpression: exact ISO passes through as exact", () => {
  const n = normalizeDateExpression("2027-03-31", { asOf: AS_OF });
  assert.deepEqual({ status: n.status, date: n.date }, { status: "exact", date: "2027-03-31" });
});

test("normalizeDateExpression: 'within 60 days of quarter end' is ambiguous with candidates and a conservative pick", () => {
  const n = normalizeDateExpression("within 60 days of quarter end", { asOf: AS_OF });
  assert.equal(n.status, "ambiguous");
  assert.equal(n.date, "2026-11-01"); // 2026-12-31 − 60d (conservative earlier candidate)
  assert.deepEqual(n.candidates, ["2026-11-01", "2027-03-01"]); // both directions listed
  assert.equal(n.ambiguityFlag.type, "window-direction-and-quarter");
  assert.match(n.ambiguityFlag.note, /Confirm clause intent/);
});

test("normalizeDateExpression: 'within N days of' generalizes to any anchor (renewal date)", () => {
  const n = normalizeDateExpression("within 30 days of renewal date", { asOf: AS_OF, renewalDate: "2027-04-01" });
  assert.equal(n.status, "ambiguous");
  assert.deepEqual(n.candidates, ["2027-03-02", "2027-05-01"]);
  assert.equal(n.date, "2027-03-02"); // conservative earlier candidate
  assert.equal(n.ambiguityFlag.type, "window-direction"); // anchor itself is unambiguous
  // anchor missing in context → unresolved, never guessed
  const u = normalizeDateExpression("within 30 days of renewal date", { asOf: AS_OF, renewalDate: null });
  assert.equal(u.status, "unresolved");
  assert.equal(u.date, null);
});

test("normalizeDateExpression: N days before/after computed anchors", () => {
  const ctx = { asOf: AS_OF, renewalDate: "2027-03-31" };
  assert.deepEqual(pick(normalizeDateExpression("90 days before renewal date", ctx)), { status: "computed", date: "2026-12-31", ambiguity: null });
  assert.equal(normalizeDateExpression("30 days after renewal date", ctx).date, "2027-04-30");
  // quarter-end anchor is inherently ambiguous
  const q = normalizeDateExpression("45 days before quarter end", ctx);
  assert.equal(q.status, "ambiguous");
  assert.equal(q.date, "2026-11-16");
  assert.equal(q.ambiguityFlag.type, "quarter-selection");
});

test("normalizeDateExpression: month-end anchor is supported and flagged month-selection", () => {
  const ctx = { asOf: AS_OF };
  const m = normalizeDateExpression("15 days before month end", ctx);
  assert.equal(m.status, "ambiguous");
  assert.equal(m.date, "2026-11-15"); // 2026-11-30 − 15d
  assert.equal(m.ambiguityFlag.type, "month-selection");
  const bare = normalizeDateExpression("month end", ctx);
  assert.equal(bare.status, "ambiguous");
  assert.equal(bare.date, "2026-11-30");
  assert.equal(bare.ambiguityFlag.type, "month-selection");
});

test("normalizeDateExpression: 'N days prior to expiration' reads as N days before the renewal date", () => {
  const n = normalizeDateExpression("60 days prior to expiration", { asOf: AS_OF, renewalDate: "2027-04-01" });
  assert.deepEqual({ status: n.status, date: n.date }, { status: "computed", date: "2027-01-31" });
  assert.equal(normalizeDateExpression("90 days prior to expiration date", { asOf: AS_OF, renewalDate: "2027-04-01" }).date, "2027-01-01");
});

test("normalizeDateExpression: unknown anchors and free text are unresolved, never guessed", () => {
  const ctx = { asOf: AS_OF, renewalDate: null };
  const u1 = normalizeDateExpression("90 days before renewal date", ctx); // anchor missing
  assert.equal(u1.status, "unresolved");
  assert.equal(u1.date, null);
  const u2 = normalizeDateExpression("upon mutual agreement of the parties", ctx);
  assert.equal(u2.status, "unresolved");
  assert.match(u2.reason, /not in the supported grammar|not available in contract context/);
  assert.equal(normalizeDateExpression("", ctx).date, null);
});

function pick(n) {
  return { status: n.status, date: n.date, ambiguity: n.ambiguityFlag ?? null };
}

/* ---------- buildCalendar ---------- */

test("buildCalendar: explicit dates → confirmed events with computed notice deadlines", () => {
  const cal = buildCalendar({
    asOf: AS_OF,
    contracts: [
      {
        id: "CTR-001", name: "Foundry SaaS MSA", counterparty: "Foundry Cloud Ltd.",
        effectiveDate: "2025-04-01",
        clauses: [
          { type: "auto-renewal", date: "2027-04-01", quote: "renews automatically for successive one-year terms" },
          { type: "termination-for-convenience", date: "2027-04-01", quote: "either party may terminate on 30 days written notice" },
        ],
      },
    ],
  });
  assert.equal(cal.summary.total, 2);
  assert.equal(cal.summary.confirmed, 2);
  const auto = cal.events.find((e) => e.clauseType === "auto-renewal");
  assert.equal(auto.date, "2027-04-01");
  assert.equal(auto.noticeDeadline, "2027-01-01"); // 90d from rules.byClauseType
  assert.equal(auto.leadTimeSource, "rules.byClauseType[auto-renewal]");
  const term = cal.events.find((e) => e.clauseType === "termination-for-convenience");
  assert.equal(term.noticeDeadline, "2027-03-02"); // 30d lead
  // REAL assert (replaces a former vacuous assert): a 30d lead means the notice deadline is exactly 30 days before the event date
  assert.equal(daysBetween(parseDate(term.noticeDeadline), parseDate(term.date)), 30);
});

test("buildCalendar: ambiguous expressions are flagged but scheduled (conservatively); unresolved are excluded", () => {
  const cal = buildCalendar({
    asOf: AS_OF,
    contracts: [
      {
        id: "CTR-002", name: "Lantern Lease",
        clauses: [
          { type: "price-adjustment", dateExpression: "within 60 days of quarter end", quote: "CPI adjustment within 60 days of quarter end" },
          { type: "notice", dateExpression: "on mutual agreement", quote: "…" },
        ],
      },
    ],
  });
  assert.equal(cal.summary.ambiguous, 1);
  assert.equal(cal.summary.unresolved, 1);
  const amb = cal.events[0];
  assert.equal(amb.status, "ambiguous");
  assert.equal(amb.date, "2026-11-01");
  assert.equal(amb.noticeDeadline, "2026-07-04"); // 120d price-adjustment lead time
  assert.equal(cal.unresolved[0].date ?? null, null); // unresolved items never carry a date
  assert.match(cal.unresolved[0].reason, /not in the supported grammar/);
});

test("buildCalendar: lead times are configurable rules-as-data, incl. clause overrides", () => {
  const input = {
    asOf: AS_OF,
    contracts: [{ id: "C", name: "X", clauses: [{ type: "auto-renewal", date: "2027-06-30" }] }],
  };
  const def = buildCalendar(input);
  assert.equal(def.events[0].leadTimeDays, DEFAULT_RULES.byClauseType["auto-renewal"]);
  const custom = buildCalendar(input, { byClauseType: { "auto-renewal": 180 } });
  assert.equal(custom.events[0].noticeDeadline, "2027-01-01");
  const overridden = buildCalendar({
    asOf: AS_OF,
    contracts: [{ id: "C", name: "X", clauses: [{ type: "auto-renewal", date: "2027-06-30", leadTimeDaysOverride: 0 }] }],
  });
  assert.equal(overridden.events[0].noticeDeadline, "2027-06-30");
  assert.equal(overridden.events[0].leadTimeSource, "clause override");
});

test("buildCalendar sorts events by notice deadline", () => {
  const cal = buildCalendar({
    asOf: AS_OF,
    contracts: [
      { id: "A", name: "A", clauses: [{ type: "auto-renewal", date: "2027-12-31" }] },
      { id: "B", name: "B", clauses: [{ type: "notice", date: "2026-12-15" }] },
    ],
  });
  assert.deepEqual(cal.events.map((e) => e.contractId), ["B", "A"]);
});

test("urgency tiers: every event carries daysUntil + tier; past deadlines are overdue, not plain events", () => {
  const cal = buildCalendar({
    asOf: AS_OF,
    contracts: [{
      id: "C", name: "X",
      clauses: [
        { type: "price-adjustment", dateExpression: "within 60 days of quarter end" }, // notice 2026-07-04 → overdue
        { type: "notice", date: "2027-02-01" },        // notice 2026-12-03, +26d → 30d
        { type: "auto-renewal", date: "2027-04-01" },  // notice 2027-01-01, +55d → 60d
        { type: "notice", date: "2027-03-15" },        // notice 2027-01-14, +68d → 90d
        { type: "evergreen", date: "2028-06-15" },     // notice 2028-03-30, +509d → later
      ],
    }],
  });
  const pd = cal.events.find((e) => e.clauseType === "price-adjustment");
  assert.equal(pd.daysUntil, -126);
  assert.equal(pd.urgency.tier, "overdue");
  assert.equal(pd.urgency.daysUntil, -126);
  assert.equal(cal.events.find((e) => e.clauseType === "notice" && e.date === "2027-02-01").urgency.tier, "30d");
  assert.equal(cal.events.find((e) => e.clauseType === "auto-renewal").urgency.tier, "60d");
  assert.equal(cal.events.find((e) => e.date === "2027-03-15").urgency.tier, "90d");
  assert.equal(cal.events.find((e) => e.clauseType === "evergreen").urgency.tier, "later");
  assert.ok(cal.events.every((e) => typeof e.daysUntil === "number"));
});

test("escalation: rules.escalation[] assigns an owner by days-out; overdue hits the most-urgent owner", () => {
  const rules = {
    escalation: [
      { maxDaysOut: 7, owner: "general-counsel" },
      { maxDaysOut: 30, owner: "procurement-lead" },
      { maxDaysOut: 90, owner: "contract-owner" },
    ],
  };
  const cal = buildCalendar({
    asOf: AS_OF,
    contracts: [{
      id: "C", name: "X",
      clauses: [
        { type: "notice", date: "2027-02-01" },        // +26d → procurement-lead
        { type: "auto-renewal", date: "2027-04-01" },  // +55d → contract-owner
        { type: "price-adjustment", dateExpression: "within 60 days of quarter end" }, // −126d overdue → general-counsel
        { type: "evergreen", date: "2028-06-15" },     // +509d → no owner
      ],
    }],
  }, rules);
  assert.equal(cal.events.find((e) => e.date === "2027-02-01").escalation.owner, "procurement-lead");
  assert.equal(cal.events.find((e) => e.clauseType === "auto-renewal").escalation.owner, "contract-owner");
  assert.equal(cal.events.find((e) => e.clauseType === "price-adjustment").escalation.owner, "general-counsel");
  assert.equal(cal.events.find((e) => e.clauseType === "evergreen").escalation, null);
  // no escalation rules configured → no owner anywhere
  const bare = buildCalendar({ asOf: AS_OF, contracts: [{ id: "C", name: "X", clauses: [{ type: "notice", date: "2026-12-01" }] }] });
  assert.ok(!bare.events[0].escalation);
});

test("coverage audit: contracts with no dated renewal/notice clause are listed, not silent", () => {
  const cal = buildCalendar({
    asOf: AS_OF,
    contracts: [
      { id: "COVERED", name: "Has dates", clauses: [{ type: "auto-renewal", date: "2027-04-01" }] },
      { id: "BARE", name: "Mutual agreement only", clauses: [{ type: "notice", dateExpression: "on mutual agreement" }] },
      { id: "EMPTY", name: "No clauses at all", clauses: [] },
    ],
  });
  assert.deepEqual(cal.coverage.map((c) => c.contractId), ["BARE", "EMPTY"]);
  assert.equal(cal.coverage[0].datedClauses, 0);
  assert.match(cal.coverage[0].reason, /no dated/);
  assert.match(cal.coverage[1].reason, /no clauses/);
  assert.equal(cal.summary.coverageGaps, 2);
  // a covered contract never appears
  const ok = buildCalendar({ asOf: AS_OF, contracts: [{ id: "COVERED", name: "Y", clauses: [{ type: "notice", date: "2026-12-01" }] }] });
  assert.deepEqual(ok.coverage, []);
});

test("confirmations: pinning a candidate promotes ambiguous → confirmed with provenance", () => {
  const input = {
    asOf: AS_OF,
    contracts: [{ id: "CTR-002", name: "Lantern Lease", clauses: [{ type: "price-adjustment", dateExpression: "within 60 days of quarter end" }] }],
  };
  const bare = buildCalendar(input);
  assert.equal(bare.events[0].status, "ambiguous");
  assert.ok(bare.events[0].ambiguityFlag);

  const cal = buildCalendar(input, {}, [
    { contractId: "CTR-002", clauseType: "price-adjustment", date: "2027-03-01", confirmedBy: "K. Alvarez, outside counsel", on: "2026-11-06" },
  ]);
  assert.equal(cal.events[0].status, "confirmed");
  assert.equal(cal.events[0].date, "2027-03-01"); // pinned LATER candidate replaces the conservative pick
  assert.equal(cal.events[0].noticeDeadline, "2026-11-01"); // 120d lead recomputed from the pinned date
  assert.equal(cal.events[0].daysUntil, -6); // 2026-11-01 vs asOf 2026-11-07
  assert.ok(!cal.events[0].ambiguityFlag);
  assert.equal(cal.events[0].confirmation.confirmedBy, "K. Alvarez, outside counsel");
  assert.equal(cal.events[0].confirmation.on, "2026-11-06");
  assert.match(cal.events[0].confirmation.resolvedFlag, /window-direction/);
  assert.equal(cal.summary.confirmed, 1);
  assert.equal(cal.summary.ambiguous, 0);

  // pinning a date that is NOT a candidate is refused loudly, not silently applied
  const miss = buildCalendar(input, {}, [
    { contractId: "CTR-002", clauseType: "price-adjustment", date: "2020-01-01", confirmedBy: "x" },
  ]);
  assert.equal(miss.events[0].status, "ambiguous");
  assert.equal(miss.unappliedConfirmations.length, 1);
  assert.match(miss.unappliedConfirmations[0].reason, /not among/);
});

test("recurrence: renewalTermMonths projects the next two cycles, dedupes, and advances past cycles", () => {
  const cal = buildCalendar({
    asOf: AS_OF,
    contracts: [{ id: "R", name: "X", clauses: [{ type: "auto-renewal", date: "2027-04-01", renewalTermMonths: 12 }] }],
  });
  assert.deepEqual(cal.events.map((e) => e.date), ["2027-04-01", "2028-04-01"]);
  assert.deepEqual(cal.events.map((e) => e.recurrence.cycle), [1, 2]);
  assert.equal(cal.events[0].recurrence.termMonths, 12);
  // dedupe: a second clause already listing a projected date collapses (same id+clauseType+date)
  const dup = buildCalendar({
    asOf: AS_OF,
    contracts: [{
      id: "R", name: "X",
      clauses: [
        { type: "auto-renewal", date: "2027-04-01", renewalTermMonths: 12 },
        { type: "auto-renewal", date: "2028-04-01" },
      ],
    }],
  });
  assert.deepEqual(dup.events.map((e) => e.date), ["2027-04-01", "2028-04-01"]);
  // base date already past asOf → advance to the first cycle on/after asOf
  const past = buildCalendar({
    asOf: AS_OF,
    contracts: [{ id: "R", name: "X", clauses: [{ type: "auto-renewal", date: "2026-11-01", renewalTermMonths: 12 }] }],
  });
  assert.deepEqual(past.events.map((e) => e.date), ["2027-11-01", "2028-11-01"]);
  // month-end clamping: term starting on a month end keeps landing on month ends
  const clamp = buildCalendar({
    asOf: AS_OF,
    contracts: [{ id: "R", name: "X", clauses: [{ type: "auto-renewal", date: "2027-01-31", renewalTermMonths: 1 }] }],
  });
  assert.deepEqual(clamp.events.map((e) => e.date), ["2027-01-31", "2027-02-28"]);
  // recurrence only applies to renewal clause types — a notice clause stays single
  const single = buildCalendar({
    asOf: AS_OF,
    contracts: [{ id: "R", name: "X", clauses: [{ type: "notice", date: "2027-04-01", renewalTermMonths: 12 }] }],
  });
  assert.deepEqual(single.events.map((e) => e.date), ["2027-04-01"]);
  // stable, distinct UIDs per cycle
  const ics = toICS(cal);
  assert.ok(ics.includes("UID:R-auto-renewal-20270401@open-legal-artifacts"));
  assert.ok(ics.includes("UID:R-auto-renewal-20280401@open-legal-artifacts"));
});

/* ---------- ICS export ---------- */

test("toICS: RFC-5545 skeleton, urgency CATEGORIES + SUMMARY prefix, provenance, folding", () => {
  const cal = buildCalendar({
    asOf: AS_OF,
    contracts: [
      { id: "CTR-001", name: "Foundry SaaS MSA", clauses: [{ type: "auto-renewal", date: "2027-04-01", quote: "renews automatically; notice 90 days prior" }] },
      { id: "CTR-002", name: "Lantern Lease", clauses: [{ type: "price-adjustment", dateExpression: "within 60 days of quarter end" }] },
    ],
  });
  const ics = toICS(cal);
  // RFC-5545 folding can split phrases mid-word — unfold (\r\n + space → "") before matching content
  const flat = ics.replace(/\r\n /g, "");
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
  assert.ok(ics.includes("DTSTART;VALUE=DATE:20270101"));
  assert.ok(ics.includes("UID:CTR-001-auto-renewal-20270401@open-legal-artifacts"));
  assert.ok(ics.includes("TRIGGER:-P14D"));
  // urgency tier: SUMMARY prefix + CATEGORIES
  assert.match(ics, /SUMMARY:\[60d\] NOTICE DEADLINE/);
  assert.ok(ics.includes("CATEGORIES:60d"));
  assert.ok(ics.includes("CATEGORIES:overdue"));
  assert.ok(ics.includes("[?]")); // ambiguous marker on Lantern
  assert.ok(flat.includes("AMBIGUOUS"));
  // REAL CRLF check (replaces a former vacuous assert): every LF is preceded by CR, no bare CR either
  assert.ok(!/[^\r]\n/.test(ics), "bare LF without preceding CR");
  assert.ok(!/\r(?!\n)/.test(ics), "bare CR not followed by LF");
  // line-structure: each property must START its own content line (regression: nested-array push
  // collapsed every VEVENT into one comma-joined line and substring asserts still passed)
  assert.match(ics, /^UID:/m);
  assert.match(ics, /^DTSTART;VALUE=DATE:/m);
  assert.match(ics, /^END:VEVENT\r?\n/m);
  const count = (re) => [...ics.matchAll(re)].length; // global regex required for counting
  assert.equal(count(/^BEGIN:VEVENT$/gm), cal.events.length, "one BEGIN:VEVENT per event");
  assert.equal(count(/^END:VEVENT$/gm), cal.events.length, "one END:VEVENT per event");
  // lines folded to <= 75 octets
  for (const line of ics.split("\r\n")) {
    assert.ok(new TextEncoder().encode(line).length <= 75, `line too long: ${line}`);
  }
  assert.match(ics, /not legal advice/);
});

test("toICS: escalation owner rides along in CATEGORIES and DESCRIPTION", () => {
  const cal = buildCalendar(
    { asOf: AS_OF, contracts: [{ id: "C", name: "X", clauses: [{ type: "price-adjustment", dateExpression: "within 60 days of quarter end" }] }] },
    { escalation: [{ maxDaysOut: 7, owner: "general-counsel" }, { maxDaysOut: 90, owner: "contract-owner" }] }
  );
  const ics = toICS(cal);
  const flat = ics.replace(/\r\n /g, "");
  assert.ok(flat.includes("CATEGORIES:overdue,general-counsel"));
  assert.ok(flat.includes("Escalation owner: general-counsel"));
  assert.equal([...ics.matchAll(/^END:VEVENT$/gm)].length, cal.events.length);
});

test("toICS: attorney confirmation is recorded in the DESCRIPTION", () => {
  const cal = buildCalendar(
    { asOf: AS_OF, contracts: [{ id: "C", name: "X", clauses: [{ type: "price-adjustment", dateExpression: "within 60 days of quarter end" }] }] },
    {},
    [{ contractId: "C", clauseType: "price-adjustment", date: "2026-11-01", confirmedBy: "K. Alvarez, outside counsel", on: "2026-11-06" }]
  );
  const ics = toICS(cal);
  const flat = ics.replace(/\r\n /g, "");
  assert.match(flat, /Confirmed by K\. Alvarez\\, outside counsel/); // comma is escaped per RFC 5545
  assert.ok(!flat.includes("AMBIGUOUS (")); // flag resolved
});

test("toICS never emits events for unresolved dates", () => {
  const cal = buildCalendar({
    asOf: AS_OF,
    contracts: [{ id: "C", name: "X", clauses: [{ type: "notice", dateExpression: "upon mutual agreement" }] }],
  });
  const ics = toICS(cal);
  assert.equal(cal.events.length, 0);
  assert.ok(!ics.includes("DTSTART"));
});
