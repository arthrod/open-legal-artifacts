// Vendored from open-artifacts/_shared/display-labels.js (commit-anchored).
// Do not edit here — change the canonical module, then re-vendor.
/**
 * display-labels — canonical render-time label engine (Track B).
 *
 * Pure ESM, zero imports (ECMAScript builtins only), zero console side
 * effects, ≤20 KB so single-file demos can vendor it. Cores keep emitting
 * machine ids; ONLY the render layer translates ids to human labels:
 *
 *   humanizeKey(id)            — generic fallback (never throws)
 *   makeLabelFn(table)         — label(key) → { label, detail, key }
 *   LEXICON / INK / LEGEND_TEXT — the canonical five verdicts + ink contract
 *   mapToCanonical(tool,state) — tool state → { canonical, subtitle, cls } | null
 *   collapseBoilerplate(...)   — repetition-tax dedup (drop repeats, count)
 *   groupCounts(items, keyOf)  — grouped "reason — ×N" counts
 *   TOOL_LABELS                — the per-tool label inventory (exhaustive-
 *                                inventory-tested; extend here, never in a demo)
 * @module display-labels
 */

/* ---------- canonical verdict lexicon (item 6) ---------- */

export const LEXICON = Object.freeze({
  VERIFIED: "VERIFIED",
  SUPPORTED: "SUPPORTED",
  UNVERIFIED: "UNVERIFIED",
  NOT_FOUND: "NOT FOUND",
  CONFLICT: "CONFLICT",
});

/** Ink contract: CONFLICT (black + flag-tint halo) outranks NOT FOUND (black).
 * Keyed by the canonical display text (LEXICON values). */
export const INK = Object.freeze({
  VERIFIED: "v-verified",
  SUPPORTED: "v-supported",
  UNVERIFIED: "v-unverified",
  "NOT FOUND": "v-notfound",
  CONFLICT: "v-conflict",
});

export const LEGEND_TEXT =
  "Verdicts mean the same thing in every artifact — VERIFIED (checked, matched) · " +
  "SUPPORTED (located, needs review) · UNVERIFIED (not checkable) · NOT FOUND " +
  "(absent from the record) · CONFLICT (sources disagree).";

/* ---------- humanize fallback (item 4) ---------- */

/**
 * Generic fallback: split on [-_]+, lowercase-join, capitalize the first word.
 * `deadline-within-30-days` → "Deadline within 30 days"; `not_found` → "Not
 * found". Idempotent; never throws (null/undefined → "").
 * @param {string|null|undefined|number} id @returns {string} */
export function humanizeKey(id) {
  const s = String(id ?? "").trim();
  if (!s) return "";
  const words = s.toLowerCase().split(/[-_]+/).filter(Boolean);
  if (words.length === 0) return "";
  const first = words[0];
  words[0] = first.charAt(0).toUpperCase() + first.slice(1);
  return words.join(" ");
}

/**
 * Build a label resolver: table override → humanizeKey fallback. Never throws;
 * an unknown key (e.g. a user-defined YAML rule id) still returns a humanized
 * string with the raw key preserved for `data-key`.
 * @param {Record<string, string|{label:string,detail:?string}>} table
 * @returns {(key:string) => { label: string, detail: string|null, key: string }} */
export function makeLabelFn(table) {
  const t = table && typeof table === "object" ? table : {};
  return function label(key) {
    const v = t[key];
    if (v !== undefined && v !== null) {
      if (typeof v === "string") return { label: v, detail: null, key };
      if (typeof v === "object" && typeof v.label === "string" && v.label.length > 0) {
        return { label: v.label, detail: v.detail ?? null, key };
      }
    }
    return { label: humanizeKey(key), detail: null, key };
  };
}

/* ---------- canonical verdict resolution (item 6) ---------- */

const PLAYBOOK_CANON = {
  compliant: ["VERIFIED", "matches preferred standard"],
  deviates: ["SUPPORTED", "fallback tier / beyond playbook"],
  deal_breaker: ["CONFLICT", "triggers an avoid rule"],
  unclassified: ["UNVERIFIED", "no rule assigned"],
};
const CANON_MAP = {
  "cite-check": {
    exact: ["VERIFIED", "verbatim"],
    normalized: ["VERIFIED", "near-verbatim — case/punctuation only"],
    fuzzy: ["SUPPORTED", "substantial overlap, not verbatim — review"],
    not_found: ["NOT_FOUND", "no located anchor"],
    "pinpoint:mismatch": ["CONFLICT", "cited page ≠ located page"],
  },
  "fact-chronology": {
    verified: ["VERIFIED", "quote located"],
    approximate: ["SUPPORTED", "near-match only"],
    unfound: ["NOT_FOUND", "quote does not locate"],
    date_mismatch: ["CONFLICT", "sources disagree on the date"],
    divergent_accounts: ["CONFLICT", "divergent accounts"],
  },
  "tabular-review": {}, // resolved below (answered depends on classification)
  "playbook-deviation-board": PLAYBOOK_CANON,
  playbook: PLAYBOOK_CANON,
  "limitations-radar": { data_needed: ["UNVERIFIED", "missing data"] },
  "renewal-calendar": { unresolved: ["UNVERIFIED", "needs review"] },
};

/**
 * Resolve a tool state to the canonical five. Deadline states (limitations
 * filed_late / renewal confirmed / matter-board flags) are NOT verification
 * verdicts → null (the caller falls back to `label()`; forcing them into the
 * five would lie).
 * @param {string} tool @param {string|{status:?string,classification:?string,kind:?string}} state
 * @returns {{ canonical: string, text: string, subtitle: string|null, cls: string } | null} */
export function mapToCanonical(tool, state) {
  const st = state && typeof state === "object" ? state : { status: state };
  let entry = null;
  if (tool === "tabular-review") {
    if (st.status === "answered") {
      if (st.classification === "fuzzy") entry = ["SUPPORTED", "quote fuzzy — review"];
      else if (st.classification === "exact") entry = ["VERIFIED", "anchor: verbatim"];
      else if (st.classification === "normalized") entry = ["VERIFIED", "anchor: near-verbatim"];
      else entry = ["VERIFIED", "anchored"];
    } else if (st.status === "unverified") {
      entry = ["UNVERIFIED", null];
    }
  } else {
    const m = CANON_MAP[tool];
    if (m) {
      entry = m[st.status] ?? m[st.kind] ?? null;
      if (!entry && st.status === "pinpoint" && st.classification) entry = m[`pinpoint:${st.classification}`] ?? null;
    }
  }
  if (!entry) return null;
  const [c, subtitle] = entry;
  const canonical = LEXICON[c];
  return { canonical, text: canonical, subtitle, cls: INK[canonical] };
}

/* ---------- repetition-tax dedup (item 7) ---------- */

function matcherHits(mt, note) {
  const n = String(note ?? "");
  const t = mt && mt.test;
  if (typeof t === "function") return !!t(n);
  if (typeof t === "string") return n === t;
  if (t instanceof RegExp) return t.test(n);
  return false;
}

/**
 * Drop repeated boilerplate sentences, keep the count. Default keeps the FIRST
 * matched occurrence in `kept` and drops the rest; `{ keepFirst: false }`
 * drops every match (for cross-card heads that render the sentence once at the
 * section head with the total count). `collapsed[id]` counts ALL matched
 * occurrences. Empty-safe on every argument.
 * @param {string[]} notes @param {{id:string,test:string|RegExp|((n:string)=>boolean)}[]} matchers
 * @param {{keepFirst?:boolean}} [opts]
 * @returns {{ kept: string[], collapsed: Record<string, number> }} */
export function collapseBoilerplate(notes, matchers, opts = {}) {
  const keepFirst = opts.keepFirst !== false;
  const arr = Array.isArray(notes) ? notes : [];
  const mts = Array.isArray(matchers) ? matchers : [];
  const counts = {};
  const seenFirst = new Set();
  const kept = [];
  for (const note of arr) {
    let hit = null;
    for (const mt of mts) {
      if (matcherHits(mt, note)) { hit = mt; break; }
    }
    if (!hit) { kept.push(note); continue; }
    counts[hit.id] = (counts[hit.id] ?? 0) + 1;
    if (keepFirst && !seenFirst.has(hit.id)) { seenFirst.add(hit.id); kept.push(note); }
  }
  return { kept, collapsed: counts };
}

/**
 * Group identical values with counts, first-appearance order — the grouped
 * "no answer supplied — ×12" mode of the repetition tax.
 * @param {any[]} items @param {(x:any)=>string} keyOf
 * @returns {{key:string,count:number}[]} */
export function groupCounts(items, keyOf) {
  const arr = Array.isArray(items) ? items : [];
  const order = [];
  const by = new Map();
  for (const x of arr) {
    const k = String(keyOf(x));
    if (!by.has(k)) { by.set(k, 0); order.push(k); }
    by.set(k, by.get(k) + 1);
  }
  return order.map((key) => ({ key, count: by.get(key) }));
}

/* ---------- per-tool label inventory (item 4) ----------
 * Presentation data, not core data: cores keep emitting these ids. The
 * exhaustive-inventory test in display-labels.test.js pins this list to the
 * enums actually sampled from the cores — extend the table, never a demo. */

export const TOOL_LABELS = Object.freeze({
  "limitations-radar": Object.freeze({
    filed_timely: "Filed on time",
    filed_late: "Filed late — past the deadline",
    deadline_upcoming: "Deadline ahead — not yet filed",
    deadline_passed_unfiled: "Past deadline — never filed",
    data_needed: "Cannot compute — missing data",
    personal_injury: "Personal injury",
    breach_of_contract_oral: "Breach of contract (oral)",
    breach_of_contract_written: "Breach of contract (written)",
    fraud: "Fraud",
    property_damage: "Property damage",
    discovery_precedes_injury: "Discovery date precedes injury date",
  }),
  "cite-check": Object.freeze({
    exact: "Verbatim",
    normalized: "Near-verbatim (case/punctuation)",
    fuzzy: "Substantial overlap — not verbatim",
    not_found: "Not in the record",
    ok: "Pinpoint confirmed",
    mismatch: "Pinpoint mismatch",
    unverifiable: "Pinpoint not checkable",
    unparseable: "Pinpoint format not recognized",
  }),
  "fact-chronology": Object.freeze({
    verified: "Quote located",
    approximate: "Quote approximate",
    unfound: "Quote not found",
    day: "Exact day",
    month: "Month only",
    year: "Year only",
    date_mismatch: "Sources disagree on the date",
    divergent_accounts: "Divergent accounts",
    document: "From documents",
    user: "User-supplied",
    unverified: "Unverified",
  }),
  "tabular-review": Object.freeze({
    answered: "Answered — anchored",
    unverified: "Unverified",
    not_answered: "no answer supplied",
    missing_quote: "no supporting quote",
    quote_not_verified: "quote does not locate in the document",
    constraint_violation: "answer fails the question's schema",
    no_such_document: "references an unknown document",
    no_such_question: "references an unknown question",
    unclear: "clause unclear — needs human reading",
    needs_review: "flagged for review",
    not_present: "not found in the document",
    outlier_value: "outlier — differs from the column",
  }),
  "playbook-deviation-board": Object.freeze({
    compliant: "Compliant",
    deviates: "Deviates",
    deal_breaker: "Deal-breaker",
    unclassified: "Unclassified",
  }),
  "renewal-calendar": Object.freeze({
    confirmed: "Confirmed — exact date",
    ambiguous: "Ambiguous — flagged, conservative reading",
    unresolved: "Unresolved — needs review",
    computed: "Computed from the clause",
    overdue: "Overdue",
    "30d": "due within 30 days",
    "60d": "due within 60 days",
    "90d": "due within 90 days",
    "180d": "due within 180 days",
    later: "Due later",
    "quarter-selection": "quarter-end assumed",
    "month-selection": "month-end assumed",
    "window-direction": "direction unstated — earlier date used",
    "window-direction-and-quarter": "direction unstated and quarter-end assumed — earlier date used",
    "window-direction-and-month": "direction unstated and month-end assumed — earlier date used",
    "rules.defaultLeadTimeDays": "lead time from default rules",
  }),
  "matter-board": Object.freeze({
    critical: "Critical — deadline moved",
    major: "Major",
    minor: "Minor",
    overdue: "Overdue",
    "due-soon": "Due soon",
    "closed-with-deadline": "closed matter still carries a deadline",
  }),
});
