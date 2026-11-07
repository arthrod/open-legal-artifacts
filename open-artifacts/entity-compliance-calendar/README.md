# entity-compliance-calendar

Open reimplementation of Anthropic's **Entity compliance calendar** — filing
deadlines across every entity — where the rule base, not the model, is the
product: obligations are rules-as-data with statutory cites, deadlines are
computed by code, and delinquency surfaces at the true age of the miss.

## What it does

- Entities × obligations matrix: each cell carries next due date, period,
  computation rule, and status (`delinquent / due-soon / scheduled /
  satisfied / n/a` with reasons).
- Recurring scheduling: annual & biennial formation-anniversary or fixed
  calendar dates (biennial honors formation-year parity; Feb-29 anchors roll
  correctly; impossible dates produce none), plus event-driven obligations
  (e.g. initial report 90 days after formation).
- **Earliest-unfiled-period semantics** — a missed 2021 filing is delinquent
  since 2021; filings skip satisfied periods; gaps never disappear.
- Exports: CSV (full audit trail incl. statute cites) and ICS with
  recurrence rules (`RRULE:FREQ=YEARLY;INTERVAL=2`) and alarms.

## Run

```bash
node --test            # 13 tests (node:test)
node examples/run.js   # 5 fictional entities × 5 obligations → matrix.json, compliance.csv, compliance.ics, report.md
```

Open `demo/index.html` for the interactive matrix.

## What's better than the closed counterpart

1. **Inspectable rule base** — every obligation is data with a statutory
   cite (fictional in examples); every computed deadline states its rule.
   Deadline rules are statutory and change — a maintained open dataset
   beats a product-internal one.
2. **True delinquency ages** — the worked example surfaces a biennial
   statement 2,032 days overdue, not "this year's filing".
3. **Recurrence-aware ICS export** — calendar systems keep scheduling
   future cycles automatically.
4. **No fabricated dates, ever** — dissolved entities, off-type
   obligations, missing formation dates, and impossible fixed dates all
   resolve to explicit `n/a` with reasons.

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
