# litigation-portfolio — specification

Open artifact: a matter portfolio board with statute-of-limitations date
math driven by rules-as-data, exposure banding, rules-of-the-road
metadata per matter, and deterministic dashboard + CSV exports.

## Design split: deterministic core vs. LLM

| Capability | Owner |
|---|---|
| SOL deadline (accrual + years/days, occurrence/discovery accrual, tolling spans) | core (deterministic) |
| days-remaining + status band (expired / critical ≤30d / warning ≤90d / ok) | core (deterministic) |
| Next-deadline horizon buckets (overdue / ≤14d / 15–30d / 31–60d / >60d) | core (deterministic) |
| Exposure banding (low / medium / high / unquantified, configurable bands) | core (deterministic) |
| Exposure provenance (`exposureBasis` + `sourceDoc`) carried into output/CSV | core (deterministic) |
| Materiality classes (reserved / disclosed / monitored / none) + rough midpoint rollups | core (deterministic) |
| 8-check anomaly engine (ids + severity, configurable thresholds) | core (deterministic) |
| Filter layer (`applyFilters`: includeClosed / stale / band / claimType / counsel) | core (deterministic) |
| Dashboard rollups, Markdown dashboard, CSV | core (deterministic) |
| Jurisdiction limitation rules | **rules-as-data** (editable JSON with citations; US defaults) |
| Estimating exposure ranges for a matter | LLM / attorney (prompt schema below) |
| Choosing accrual & discovery dates from facts | attorney |
| Whether a deadline is strategically worth filing on | attorney |

The core never guesses: unknown claim types, missing or unparseable
accrual/discovery dates, and malformed tolling events produce `deadline:
null` plus explicit flags — never an invented date.

## Input contract (JSON)

```jsonc
{
  "asOf": "2026-11-07",                 // evaluation date (ISO)
  "claimRules": {                        // optional overrides merged over DEFAULT_CLAIM_RULES
    "personal-injury-negligence": { "label": "…", "years": 2, "accrual": "occurrence", "cite": "…" }
  },
  "exposureBands": [ { "band": "low", "maxHigh": 50000 } ],   // optional
  "solThresholds": { "critical": 30, "warning": 90 },         // optional
  "matters": [
    {
      "id": "LIT-2026-014", "name": "…", "client": "…",
      "claimType": "breach-of-written-contract",
      "accrualDate": "2025-09-12",        // or discoveryDate for discovery-rule claims
      "tollingEvents": [ { "from": "…", "to": "…", "reason": "…" } ],
      "status": "active", "stage": "discovery",
      "exposureLow": 120000, "exposureHigh": 340000,
      "exposureBasis": "verbatim quote from the estimate memo",   // optional provenance
      "sourceDoc": "MEMO-2026-10-12",                              // optional document id
      "materiality": "disclosed",          // reserved|disclosed|monitored|none (firm-calibrated, verify)
      "lastUpdated": "2026-11-05",         // optional; drives staleness (default >30d = stale)
      "legalHold": true,                   // optional; hold-gap anomaly if absent on active matters
      "conflicts": { "status": "cleared", "override": false },    // optional
      "reserve": { "amount": 25000, "asOf": "2026-08-15" },       // optional; stale after 60d (default)
      "counsel": "…", "venue": "…", "strategy": "…", "nextDeadline": "2026-11-20"
    }
  ]
}
```

All new fields are optional; absence is reported, never guessed (e.g. a
missing `lastUpdated` is itself a `stale-matter` anomaly; quantified
exposure without `exposureBasis` surfaces in `missing-fields`).

## Output contract (JSON)

Per matter: `sol { deadline, daysRemaining, status, accrualUsed, ruleCite }`,
`exposure { low, high, band, bandBasis, basis, sourceDoc }`, `rulesOfRoad { counsel, venue,
strategy, nextDeadline }`, `materiality`, `freshness { lastUpdated,
daysSinceUpdate, isStale }`, `anomalies[] { id, severity, detail }`,
`flags[]`. Plus `summary` (counts by status, SOL alerts, unverified,
exposure rollups per band, `anomalies { total, bySeverity, byId }`,
`nextDeadlines` horizon buckets, `materiality` midpoint rollups,
flagged count) and a standing `disclaimer`. Exports: `toCSV()` (one row
per matter, incl. provenance + anomaly columns), `renderDashboard()`
(Markdown incl. ⚠️ anomalies look-first section and stage distribution),
`applyFilters(portfolio, filters)` (pure view over a built portfolio;
closed matters excluded unless `includeClosed`).

## Anomaly engine (8 checks, all pure + unit-tested)

| # | id | severity | fires when |
|---|---|---|---|
| 1 | `overdue-next-deadline` | high | `nextDeadline` is in the past vs `asOf` |
| 2 | `stale-matter` | medium | `lastUpdated` missing or older than `staleDays` (default 30) |
| 3 | `conflicts-open` | high | `conflicts.status` present and not `cleared` |
| 4 | `conflicts-override` | critical | `conflicts.override` true (reason recorded or flagged absent) |
| 5 | `high-risk-no-counsel` | high | SOL expired/critical or high exposure band, and no outside counsel |
| 6 | `stale-reserve` | medium | `reserve` set but not reviewed within `reserveStaleDays` (default 60) |
| 7 | `hold-gap` | medium | status active/settlement/trial and `legalHold !== true` |
| 8 | `missing-fields` | low | missing accrual/discovery date, venue, counsel, or exposure provenance |

Thresholds are editable via `anomalyConfig: { staleDays, reserveStaleDays }`
in the input. Anomalies are severity-sorted (critical → low) everywhere.

## Rules-as-data

`DEFAULT_CLAIM_RULES` ships six US-default claim types (PI negligence 2y,
property damage 3y, fraud 3y-discovery, written contract 4y, oral
contract 2y, Title VII 300-day charge window), each with a `cite` string
marked "verify per state". Every computed deadline carries its `ruleCite`
in output and CSV. Overrides are merged per key; unknown keys flag rather
than fall back.

## Prompt schema for the LLM part (input prep only)

```jsonc
// System: "Extract matter metadata for a litigation portfolio. Fictional-safe. Never compute deadlines."
{ "matters": [ {
    "id": "string",
    "name": "string", "client": "string",
    "claimType": "must be a key from claimRules or a new key flagged for attorney mapping",
    "accrualDate": "ISO date from the documents, or null with a note",
    "discoveryDate": "ISO date if pleaded, else null",
    "tollingEvents": [ { "from": "ISO", "to": "ISO", "reason": "string", "source": "doc id ¶" } ],
    "exposureLow": "number|null", "exposureHigh": "number|null",
    "exposureBasis": "verbatim quote from the estimate memo"
} ] }
```

The LLM only fills this shape; deadline arithmetic stays in the core.

## Materiality rollups

`materiality` (reserved / disclosed / monitored / none) describes the
financial-reporting treatment and is a **firm-calibrated convention, not
law** — defaults are illustrative and flagged for verification. Rollups
report a rough midpoint `(low + high) / 2` per class; a class counts a
matter even when no midpoint is computable.

## What's better than the closed counterpart

- Limitation rules are **editable data with citations**, not a black box —
  every deadline in the UI/CSV shows the rule it came from.
- Deterministic and auditable: same input → same deadlines, testable,
  diffable in git; the closed gallery item gives no such guarantee.
- Unknown rules and missing dates surface as `unverified` flags instead of
  silently plausible dates.
- Every named check of the closed counterpart's portfolio-status skill
  (8 anomaly checks, deadline horizons, filters, materiality rollups,
  stale reserves) is implemented as deterministic, unit-tested code —
  see README for the check → test mapping.
- Runs anywhere (browser demo, Node CLI), exports CSV, no vendor lock-in.

## Legal disclaimers

US defaults only; limitation law varies by state and claim. Not legal
advice; verify `ruleCite` against current law before relying on any date.
