# entity-compliance-calendar

Open reimplementation of Anthropic's **Entity compliance calendar** — filing
deadlines across every entity — where the rule base, not the model, is the
product: obligations are rules-as-data with statutory cites, deadlines are
computed by code, and delinquency surfaces at the true age of the miss.

## What it does

- Entities × obligations matrix: each cell carries next due date, period,
  computation rule, and status (`delinquent / due-soon / scheduled /
  satisfied / unknown / n/a` with reasons — `unknown` = missing entity
  data, `n/a` = rule provably inapplicable).
- Recurring scheduling: annual & biennial formation-anniversary or fixed
  calendar dates (biennial honors anchor-year parity; Feb-29 anchors roll
  correctly; impossible dates produce none), plus event-driven obligations
  (e.g. initial report 90 days after formation).
- **Foreign qualifications** — obligations bind through
  `entity.qualifications[].qualifiedOn`; foreign deadlines are computed
  from the qualification date, not flagged in prose.
- **Rule provenance & staleness** — obligations carry
  `effectiveFrom`/`verifiedOn`; cells flag `ruleStale` when verification is
  >365d old (surfaced in CSV + ICS).
- **Health audit** — deterministic flags: dormant >5y dissolution
  candidates, missing formation dates, stale/unknown good standing,
  footprint-vs-qualified gaps.
- **Agent-report ingestion** — fictional registered-agent CSV matched by
  normalized entity name ("Acme Holdings LLC" ≡ "Acme Holdings, LLC") with
  matched/unmatched/notInReport diff and a confirm-gated pure apply.
- **Fees & good standing** — filing fees totaled per entity; standing
  states (ok/stale/unknown) carried into CSV and ICS.
- **Filing windows** — `report(matrix, [30, 60, 90, 180])` buckets
  actionable filings cumulatively (overdue always included); the demo adds
  a window filter.
- **Earliest-unfiled-period semantics** — a missed 2021 filing is delinquent
  since 2021; filings skip satisfied periods; gaps never disappear.
- Exports: CSV (full audit trail incl. cites, provenance, standing, fees)
  and ICS with recurrence rules (`RRULE:FREQ=YEARLY;INTERVAL=2`) and alarms.

## Run

```bash
node --test            # 22 tests (node:test)
node examples/run.js   # 7 fictional entities × 5 obligations → matrix.json, compliance.csv, compliance.ics, report.md
```

Open `demo/index.html` for the interactive matrix.

## What's better than the closed counterpart

1. **Inspectable rule base** — every obligation is data with a statutory
   cite (fictional in examples); every computed deadline states its rule.
   Deadline rules are statutory and change — a maintained open dataset
   beats a product-internal one.
2. **Computed staleness, not vibes** — rules carry `verifiedOn` and cells
   flag `ruleStale` past 365d; the counterpart's "verify the law" caveat
   becomes a per-cell tested signal.
3. **True delinquency ages** — the worked example surfaces a biennial
   statement 2,032 days overdue, not "this year's filing".
4. **Foreign qualifications computed** — qualification-anniversary math
   produces real foreign deadlines; the counterpart flags them in prose.
5. **Auditable ingestion + deterministic audit** — agent reports match by
   normalized name with an explicit diff and confirm-gated apply; health
   flags (dormancy, standing, gaps) are computed, not LLM-judged.
6. **Recurrence-aware ICS export** — calendar systems keep scheduling
   future cycles automatically.
7. **No fabricated dates, ever** — dissolved entities, off-type
   obligations, and impossible fixed dates resolve to explicit `n/a` with
   reasons; missing entity data resolves to `unknown`; both are counted.

## Layout

- `spec.md` — IO contract, recurrence semantics, extraction prompt schema
- `core/core.js` — dependency-free ES module (browser + Node)
- `core/core.test.js` — node:test suite
- `examples/` — fictional worked example + runner + outputs (CSV + ICS)
- `demo/index.html` — standalone demo using the shared design tokens

## Disclaimer

All entities, obligations, and statutory cites fictional (US-flavored
defaults). Rules are jurisdiction-dependent and change — maintain the rule
base with effective dates. Not legal advice.
