import test from "node:test";
import assert from "node:assert/strict";

import {
  LEXICON, INK, LEGEND_TEXT,
  humanizeKey, makeLabelFn, mapToCanonical,
  collapseBoilerplate, groupCounts, TOOL_LABELS,
} from "./display-labels.js";

/* ---------- humanizeKey ---------- */

test("humanizeKey covers snake/kebab/mixed/numeric keys", () => {
  assert.equal(humanizeKey("deadline-within-30-days"), "Deadline within 30 days");
  assert.equal(humanizeKey("not_found"), "Not found");
  assert.equal(humanizeKey("due-soon"), "Due soon");
  assert.equal(humanizeKey("30d"), "30d");
  assert.equal(humanizeKey("CA-SOL-PI"), "Ca sol pi");
  assert.equal(humanizeKey("window-direction-and-quarter"), "Window direction and quarter");
});

test("humanizeKey is idempotent", () => {
  for (const k of ["deadline-within-30-days", "not_found", "30d", "CA-SOL-PI", "MARGIN"]) {
    const once = humanizeKey(k);
    assert.equal(humanizeKey(once), once, k);
  }
});

test("humanizeKey never throws on empty/unicode/null and never returns undefined", () => {
  assert.equal(humanizeKey(""), "");
  assert.equal(typeof humanizeKey("🜂_太郎-3"), "string");
  assert.equal(typeof humanizeKey(null), "string");
  assert.equal(typeof humanizeKey(undefined), "string");
  assert.equal(typeof humanizeKey(7), "string");
});

/* ---------- makeLabelFn ---------- */

test("makeLabelFn: table override beats humanizeKey fallback", () => {
  const L = makeLabelFn({ filed_late: "Filed late — past the deadline" });
  assert.equal(L("filed_late").label, "Filed late — past the deadline");
  assert.equal(L("some_random_new_rule").label, "Some random new rule");
});

test("makeLabelFn: {label, detail} entries carry detail; key is always preserved", () => {
  const L = makeLabelFn({ exact: { label: "Verbatim", detail: "byte-identical" } });
  assert.deepEqual(L("exact"), { label: "Verbatim", detail: "byte-identical", key: "exact" });
  assert.equal(L("exact").key, "exact");
  assert.equal(L("zzz_unknown").key, "zzz_unknown");
  assert.equal(L("zzz_unknown").detail, null);
});

test("makeLabelFn never throws on a missing key (user-defined YAML rule ids cannot crash a page)", () => {
  const L = makeLabelFn({});
  assert.equal(typeof L("term").label, "string");
  assert.equal(L("term").label.length > 0, true);
});

/* ---------- LEXICON / ink contract ---------- */

test("LEXICON is the canonical five with ink classes", () => {
  assert.deepEqual(Object.values(LEXICON).sort(), ["CONFLICT", "NOT FOUND", "SUPPORTED", "UNVERIFIED", "VERIFIED"]);
  for (const c of Object.values(LEXICON)) {
    assert.equal(typeof INK[c], "string");
    assert.match(INK[c], /^v-[a-z]+$/);
  }
  for (const w of Object.values(LEXICON)) assert.ok(LEGEND_TEXT.includes(w));
});

/* ---------- mapToCanonical ---------- */

test("mapToCanonical covers every cite-check state (incl. pinpoint mismatch)", () => {
  assert.deepEqual(pick(mapToCanonical("cite-check", "exact")), ["VERIFIED", "verbatim"]);
  assert.deepEqual(pick(mapToCanonical("cite-check", "normalized")), ["VERIFIED", "near-verbatim — case/punctuation only"]);
  assert.deepEqual(pick(mapToCanonical("cite-check", "fuzzy")), ["SUPPORTED", "substantial overlap, not verbatim — review"]);
  assert.deepEqual(pick(mapToCanonical("cite-check", "not_found")), ["NOT FOUND", "no located anchor"]);
  assert.deepEqual(pick(mapToCanonical("cite-check", { status: "pinpoint", classification: "mismatch" })), ["CONFLICT", "cited page ≠ located page"]);
});

test("mapToCanonical covers every fact-chronology state + conflict kinds", () => {
  assert.deepEqual(pick(mapToCanonical("fact-chronology", "verified")), ["VERIFIED", "quote located"]);
  assert.deepEqual(pick(mapToCanonical("fact-chronology", "approximate")), ["SUPPORTED", "near-match only"]);
  assert.deepEqual(pick(mapToCanonical("fact-chronology", "unfound")), ["NOT FOUND", "quote does not locate"]);
  assert.deepEqual(pick(mapToCanonical("fact-chronology", "date_mismatch")), ["CONFLICT", "sources disagree on the date"]);
  assert.deepEqual(pick(mapToCanonical("fact-chronology", "divergent_accounts")), ["CONFLICT", "divergent accounts"]);
});

test("mapToCanonical covers tabular-review answered±fuzzy and unverified", () => {
  assert.deepEqual(pick(mapToCanonical("tabular-review", { status: "answered", classification: "exact" })), ["VERIFIED", "anchor: verbatim"]);
  assert.deepEqual(pick(mapToCanonical("tabular-review", { status: "answered", classification: "normalized" })), ["VERIFIED", "anchor: near-verbatim"]);
  assert.deepEqual(pick(mapToCanonical("tabular-review", { status: "answered", classification: "fuzzy" })), ["SUPPORTED", "quote fuzzy — review"]);
  assert.equal(mapToCanonical("tabular-review", "unverified").canonical, "UNVERIFIED");
});

test("mapToCanonical covers playbook verdicts, limitations data_needed, renewal unresolved", () => {
  assert.deepEqual(pick(mapToCanonical("playbook", "compliant")), ["VERIFIED", "matches preferred standard"]);
  assert.deepEqual(pick(mapToCanonical("playbook", "deviates")), ["SUPPORTED", "fallback tier / beyond playbook"]);
  assert.deepEqual(pick(mapToCanonical("playbook", "deal_breaker")), ["CONFLICT", "triggers an avoid rule"]);
  assert.deepEqual(pick(mapToCanonical("playbook", "unclassified")), ["UNVERIFIED", "no rule assigned"]);
  assert.deepEqual(pick(mapToCanonical("limitations-radar", "data_needed")), ["UNVERIFIED", "missing data"]);
  assert.deepEqual(pick(mapToCanonical("renewal-calendar", "unresolved")), ["UNVERIFIED", "needs review"]);
});

test("mapToCanonical returns null for deadline states and unknowns (caller falls back to label())", () => {
  assert.equal(mapToCanonical("limitations-radar", "filed_late"), null);
  assert.equal(mapToCanonical("limitations-radar", "deadline_upcoming"), null);
  assert.equal(mapToCanonical("renewal-calendar", "confirmed"), null);
  assert.equal(mapToCanonical("renewal-calendar", "ambiguous"), null);
  assert.equal(mapToCanonical("cite-check", "nope"), null);
  assert.equal(mapToCanonical("matter-board", "overdue"), null);
  assert.equal(mapToCanonical("unknown-tool", "exact"), null);
});

function pick(r) { assert.ok(r, "expected a mapping"); return [r.canonical, r.subtitle]; }

/* ---------- collapseBoilerplate ---------- */

const PROP = "proposition support is an LLM/human judgment — not evaluated by this core";
const REVIEW = "substantial overlap but not verbatim — requires human review";

test("collapseBoilerplate keeps the first occurrence, drops repeats, counts all matches", () => {
  const r = collapseBoilerplate([PROP, "data note", PROP, PROP, REVIEW], [
    { id: "prop", test: PROP },
    { id: "review", test: (n) => n === REVIEW },
  ]);
  assert.deepEqual(r.kept, [PROP, "data note", REVIEW]);
  assert.deepEqual(r.collapsed, { prop: 3, review: 1 });
});

test("collapseBoilerplate keepFirst:false drops every matched note but still counts", () => {
  const r = collapseBoilerplate([PROP, "data note", PROP], [{ id: "prop", test: PROP }], { keepFirst: false });
  assert.deepEqual(r.kept, ["data note"]);
  assert.deepEqual(r.collapsed, { prop: 2 });
});

test("collapseBoilerplate accepts string, RegExp and predicate matchers; empty-safe", () => {
  const r = collapseBoilerplate(["x matches tail", "y"], [{ id: "re", test: /tail$/ }]);
  assert.deepEqual(r.kept, ["x matches tail", "y"]); // default keeps the first match
  assert.deepEqual(r.collapsed, { re: 1 });
  assert.deepEqual(r.collapsed, { re: 1 });
  assert.deepEqual(collapseBoilerplate([], [{ id: "a", test: "b" }]), { kept: [], collapsed: {} });
  assert.deepEqual(collapseBoilerplate(null, null).kept, []);
});

/* ---------- groupCounts ---------- */

test("groupCounts groups identical keys with counts in first-appearance order", () => {
  assert.deepEqual(groupCounts(["b", "a", "b", "a", "a"], (x) => x), [
    { key: "b", count: 2 }, { key: "a", count: 3 },
  ]);
  assert.deepEqual(groupCounts([], (x) => x), []);
});

/* ---------- exhaustive label inventory (§3–§4 of the Track B plan) ----------
 * Every enum key sampled from the seven cores must map to a non-empty label
 * that differs from the raw key. Adding a core enum without a label entry
 * fails HERE (visible), never silently via the humanizeKey fallback. */
test("exhaustive inventory: every known enum key has a non-empty label ≠ the raw key", () => {
  const expected = {
    "limitations-radar": ["filed_timely", "filed_late", "deadline_upcoming", "deadline_passed_unfiled", "data_needed",
      "personal_injury", "breach_of_contract_oral", "breach_of_contract_written", "fraud", "property_damage",
      "discovery_precedes_injury"],
    "cite-check": ["exact", "normalized", "fuzzy", "not_found", "ok", "mismatch", "unverifiable", "unparseable"],
    "fact-chronology": ["verified", "approximate", "unfound", "day", "month", "year",
      "date_mismatch", "divergent_accounts", "document", "user", "unverified"],
    "tabular-review": ["answered", "unverified", "not_answered", "missing_quote", "quote_not_verified",
      "constraint_violation", "no_such_document", "no_such_question", "unclear", "needs_review", "not_present",
      "outlier_value"],
    "playbook-deviation-board": ["compliant", "deviates", "deal_breaker", "unclassified"],
    "renewal-calendar": ["confirmed", "ambiguous", "unresolved", "computed", "overdue", "30d", "60d", "90d", "180d", "later",
      "quarter-selection", "month-selection", "window-direction", "window-direction-and-quarter", "window-direction-and-month",
      "rules.defaultLeadTimeDays"],
    "matter-board": ["critical", "major", "minor", "overdue", "due-soon", "closed-with-deadline"],
  };
  for (const [tool, keys] of Object.entries(expected)) {
    const table = TOOL_LABELS[tool];
    assert.ok(table, `missing TOOL_LABELS table for ${tool}`);
    for (const k of keys) {
      assert.ok(k in table, `${tool}: no label entry for key "${k}"`);
      const L = makeLabelFn(table)(k);
      assert.equal(L.key, k);
      assert.ok(L.label.length > 0, `${tool}/${k}: empty label`);
      assert.notEqual(L.label, k, `${tool}/${k}: label equals the raw key`);
    }
  }
});
