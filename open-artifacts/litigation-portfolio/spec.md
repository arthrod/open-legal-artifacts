# litigation-portfolio — specification

Open artifact: a matter portfolio board with statute-of-limitations date
math driven by rules-as-data, exposure banding, rules-of-the-road
metadata per matter, and deterministic dashboard + CSV exports.

## Design split: deterministic core vs. LLM

| Capability | Owner |
|---|---|
| SOL deadline (accrual + years/days, occurrence/discovery accrual, tolling spans) | core (deterministic) |
| days-remaining + status band (expired / critical ≤30d / warning ≤90d / ok) | core (deterministic) |
| Exposure banding (low / medium / high / unquantified, configurable bands) | core (deterministic) |
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
      "counsel": "…", "venue": "…", "strategy": "…", "nextDeadline": "2026-11-20"
    }
  ]
}
```

## Output contract (JSON)

Per matter: `sol { deadline, daysRemaining, status, accrualUsed, ruleCite }`,
`exposure { low, high, band, bandBasis }`, `rulesOfRoad { counsel, venue,
strategy, nextDeadline }`, `flags[]`. Plus `summary` (counts by status,
SOL alerts, unverified, exposure rollups per band, flagged count) and a
standing `disclaimer`. Exports: `toCSV()` (one row per matter),
`renderDashboard()` (Markdown).

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

## What's better than the closed counterpart

- Limitation rules are **editable data with citations**, not a black box —
  every deadline in the UI/CSV shows the rule it came from.
- Deterministic and auditable: same input → same deadlines, testable,
  diffable in git; the closed gallery item gives no such guarantee.
- Unknown rules and missing dates surface as `unverified` flags instead of
  silently plausible dates.
- Runs anywhere (browser demo, Node CLI), exports CSV, no vendor lock-in.

## Legal disclaimers

US defaults only; limitation law varies by state and claim. Not legal
advice; verify `ruleCite` against current law before relying on any date.
