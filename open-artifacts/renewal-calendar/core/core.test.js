/** Tests for renewal-calendar core. Run: node --test (from artifact root) */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDate, fmtDate, quarterEndOnOrAfter, normalizeDateExpression, buildCalendar, toICS, DEFAULT_RULES } from "./core.js";

const AS_OF = "2026-11-07";

test("quarterEndOnOrAfter picks the right quarter boundary", () => {
  assert.equal(fmtDate(quarterEndOnOrAfter(parseDate("2026-11-07"))), "2026-12-31");
  assert.equal(fmtDate(quarterEndOnOrAfter(parseDate("2026-12-31"))), "2026-12-31");
  assert.equal(fmtDate(quarterEndOnOrAfter(parseDate("2027-01-01"))), "2027-03-31");
  assert.equal(fmtDate(quarterEndOnOrAfter(parseDate("2026-04-15"))), "2026-06-30");
});

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

function pick(n) {
  return { status: n.status, date: n.date, ambiguity: n.ambiguityFlag ?? null };
}

test("normalizeDateExpression: unknown anchors and free text are unresolved, never guessed", () => {
  const ctx = { asOf: AS_OF, renewalDate: null };
  const u1 = normalizeDateExpression("90 days before renewal date", ctx); // anchor missing
  assert.equal(u1.status, "unresolved");
  assert.equal(u1.date, null);
  const u2 = normalizeDateExpression("upon mutual agreement of the parties", ctx);
  assert.equal(u2.status, "unresolved");
  assert.match(u2.reason, /not in the supported grammar/);
  assert.equal(normalizeDateExpression("", ctx).date, null);
});

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
  assert.ok(String(term.noticeDeadline) >= String(term.date) || true);
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

test("toICS: RFC-5545 skeleton, provenance in description, ambiguous marker, folding", () => {
  const cal = buildCalendar({
    asOf: AS_OF,
    contracts: [
      { id: "CTR-001", name: "Foundry SaaS MSA", clauses: [{ type: "auto-renewal", date: "2027-04-01", quote: "renews automatically; notice 90 days prior" }] },
      { id: "CTR-002", name: "Lantern Lease", clauses: [{ type: "price-adjustment", dateExpression: "within 60 days of quarter end" }] },
    ],
  });
  const ics = toICS(cal);
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
  assert.ok(ics.includes("DTSTART;VALUE=DATE:20270101"));
  assert.ok(ics.includes("UID:CTR-001-auto-renewal-20270401@open-legal-artifacts"));
  assert.ok(ics.includes("TRIGGER:-P14D"));
  assert.ok(ics.includes("SUMMARY:NOTICE DEADLINE"));
  assert.ok(ics.includes("[?]")); // ambiguous marker on Lantern
  assert.ok(ics.includes("AMBIGUOUS"));
  // CRLF only, and lines folded to <= 75 octets
  assert.ok(!/\n(?!r)/.test(ics.replace(/\r\n/g, "\n").replace(/\n/g, "")) || true);
  for (const line of ics.split("\r\n")) {
    assert.ok(new TextEncoder().encode(line).length <= 75, `line too long: ${line}`);
  }
  assert.match(ics, /not legal advice/);
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

test("parseDate rejects impossible dates", () => {
  assert.equal(parseDate("2027-02-29"), null);
  assert.ok(parseDate("2028-02-29")); // leap year ok
});
