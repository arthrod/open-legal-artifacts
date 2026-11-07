# outside-counsel-spend — open artifact spec

Open reimplementation of Anthropic's "Outside counsel spend" artifact (catalog
§2.16): *"track spending across matters and firms, monitor budgets, and flag
unusual billing patterns."*

The closed artifact is a dashboard. This core inverts the emphasis: the
auditable object is a **findings ledger** — every rate exception, budget
breach, and write-off carries the entry id, the rule it violated, the expected
value, and a dollar impact — exportable as JSON/CSV for commit-to-git review.

## What it does

1. **Rate-card compliance** — every hourly entry is checked against the
   negotiated rate card for that firm × matter × date window. Findings:
   `over_rate` (billed above the negotiated level rate; impact in dollars),
   `unknown_level` (timekeeper level absent from the card),
   `no_rate_card` (no card covers the firm/date — never guessed).
2. **Budget variance** — matter × firm spend (net of write-offs) vs approved
   budget, with exact-scope budgets (matter+firm, optionally period-scoped)
   preferred over matter-wide ones. Status: `within` | `over` | `unbudgeted`.
3. **Write-off flags** — entries with write-offs above a configurable
   percentage-of-bill (default 10%) are flagged with evidence; all write-offs
   roll into period totals either way.
4. **Period rollups** — per `YYYY-MM` period: fees, disbursements, write-offs,
   net spend, plus by-firm and by-matter splits.
5. **Exports** — findings CSV (one row per finding, rule cited) and stable
   JSON for version control.

## IO contract

```js
import { runSpendAudit, auditToCsv, auditToJson } from "./core/core.js";

const audit = runSpendAudit(input);
//   => { summary, rateFindings[], budgetVariances[], writeOffFlags[], periodRollups[] }
auditToCsv(audit); auditToJson(audit);
```

- ledger entry: `{ id, matterId, firmId, period: "YYYY-MM", date: "YYYY-MM-DD",
  timekeeper, level, type: "fee"|"disbursement", billing: "hourly"|"flat",
  hours?, rate?, amount?, narrative, writeOff? }`
  (`amount` derived as `hours × rate` when omitted).
- rate card: `{ firmId, matterId?, effectiveFrom?, effectiveTo?,
  rates: { partner: 850, associate: 445, … } }` — matter-scoped cards beat
  firm-wide cards; the entry's `date` must fall inside the effective window.
- budget: `{ matterId, firmId?, period?, approved }` — exact matter+firm
  budgets shadow matter-wide ones for that firm; period-scoped budgets count
  only entries in that period.
- settings (rules-as-data, all overridable): `{ rateToleranceUsd = 0,
  writeOffFlagPct = 10 }`.

All arithmetic in integer cents; no floats in comparisons, no hidden clocks.

## Deterministic vs LLM-assisted

| Layer | Who |
|---|---|
| Rate compliance, budget variance, write-off flags, rollups, exports | **code** |
| Parsing LEDES/e-billing exports or invoices into ledger JSON | optional LLM (extraction) |
| Billing-guideline policy (levels, tolerance, thresholds) | **firm** (rules-as-data) |

### LLM prompt schema (extraction step, optional)

```json
{
  "task": "Convert the provided LEDES/invoice lines into ledger-entry JSON.",
  "output_schema": { "id": "line-item id", "matterId": "…", "firmId": "…", "period": "YYYY-MM", "date": "YYYY-MM-DD", "timekeeper": "…", "level": "one of the firm's levels", "type": "fee|disbursement", "billing": "hourly|flat", "hours": "number or null", "rate": "number or null", "amount": "number", "narrative": "verbatim time-entry text" },
  "rules": ["Never invent rates or amounts; copy them from the invoice.", "Narrative must be verbatim.", "Skip nothing; every line becomes an entry."]
}
```

## What's better than the closed counterpart

- **Findings are the product, not a dashboard.** Every exception is a row with
  entry id, violated rule, expected value, and dollar impact — auditable and
  exportable, not just visualized.
- **Rate cards and thresholds as structured data** — the firm's negotiated
  rates are JSON it owns, not values locked in a vendor UI.
- **Integer-cents arithmetic** — billing comparisons don't drift by floats;
  identical inputs give byte-identical outputs.
- **Reproducible exports** — JSON + CSV suitable for version control and
  reconciliation against the e-billing system of record.

## Disclaimer

Billing-guideline thresholds (write-off percentage, rate tolerance) are
rules-as-data with US-market defaults. All example data fictional. Not legal
or billing advice.
