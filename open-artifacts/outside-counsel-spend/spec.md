# outside-counsel-spend — open artifact spec

Open reimplementation of Anthropic's "Outside counsel spend" artifact (catalog
§2.16). Counterpart description, verified against Anthropic's Academy page
(academy.claude.com/use-cases/outside-counsel-review): it reviews
outside-counsel invoices against the company's own billing guidelines (for
example block-billing and staffing rules), attributes budget variance to the
activities that drove it, and ends in partner-review talking points, with
matter/invoice coverage via iManage/NetDocuments connectors. (Secondary,
gallery one-liner via S4: "checks invoices against your billing guidelines.")

The closed artifact is a dashboard. This core inverts the emphasis: the
auditable object is a **findings ledger** — every rate exception, budget
breach, guideline violation, and write-off carries the entry id, the rule it
violated, the expected value, and a dollar impact — exportable as JSON/CSV for
commit-to-git review. Every compliance decision is code: identical input
produces byte-identical output.

## What it does

1. **Rate-card compliance** — every hourly entry is checked against the
   negotiated rate card for that firm × matter × date window. Findings:
   `over_rate` (billed above the negotiated level rate; impact in dollars),
   `unknown_level` (timekeeper level absent from the card),
   `no_rate_card` (no card covers the firm/date — never guessed).
2. **Budget variance** — matter × firm spend (net of write-offs) vs approved
   budget, with exact-scope budgets (matter+firm, optionally period-scoped)
   preferred over matter-wide ones. Status: `within` | `over` | `unbudgeted`.
   Over-budget pairs carry **variance drivers**: the top-3 largest billed
   entries (id + amount) — the "why it's over", cited, not narrated.
3. **Billing-guideline rules engine** — typed rules-as-data in
   `input.guidelines` (the counterpart re-reads prose guidelines with an LLM
   each run; here every decision is deterministic code):
   - `block_billing` — narrative splits into ≥ `minPhrases` (default 2)
     `;`- or " / "-separated activity phrases, or exceeds `maxWords`
     (default 40). Impact = full billed amount.
   - `disallowed_expense` — disbursement `category` over `capUsd`;
     impact = the excess over the cap.
   - `max_hours_per_day` — timekeeper-day over `maxHours` across entries;
     impact = over-cap hours × entry rates, allocated in ledger order.
   - `staffing_ratio` — matter-wide junior/senior hours below `minRatio`
     (senior levels configurable, default `["partner"]`). Informational.
   - Unknown rule types surface as `unknown_rule_type` findings — a
     misconfigured guideline is visible, never silently ignored.
4. **Anomaly flags** — trend flags per firm × timekeeper across consecutive
   periods: `rate_creep` (realized rate up > `rateCreepPct`% period over
   period, default 10) and `hours_spike` (hours > `hoursSpikeFactor`× the
   prior period, default 2). Flags are ledger rows with entry ids and
   period-to-period deltas, not dashboard glances. Integer cross-multiplied
   comparisons — no float division in the decision.
5. **Write-off flags** — entries with write-offs above a configurable
   percentage-of-bill (default 10%) are flagged with evidence; all write-offs
   roll into period totals either way.
6. **Period rollups** — per `YYYY-MM` period: fees, disbursements, write-offs,
   net spend, plus by-firm and by-matter splits.
7. **Talking points** — `renderTalkingPoints(audit)` renders one
   partner-review section per firm, plus a panel-wide section for
   matter-wide findings (`staffing_ratio`, `unknown_rule_type` — firmId is
   null because they span every firm on the matter); totals tie to
   `audit.summary` and every claim cites a finding or driver id.
   Deterministic code output, reproducible run over run (the counterpart
   drafts these with an LLM each month).
8. **Exports** — findings CSV (one row per finding, rule cited) and stable
   JSON for version control.

## IO contract

```js
import { runSpendAudit, auditToCsv, auditToJson, renderTalkingPoints } from "./core/core.js";
import { parseLedes } from "./core/ledes.js";

const audit = runSpendAudit(input);
//   => { summary, rateFindings[], budgetVariances[], writeOffFlags[],
//        guidelineFindings[], anomalyFlags[], periodRollups[] }
auditToCsv(audit); auditToJson(audit); renderTalkingPoints(audit, names);

const { ledger, errors } = parseLedes(ledesText, { firmId: "HPL" });
//   malformed lines → structured error rows, never guessed
```

- ledger entry: `{ id, matterId, firmId, period: "YYYY-MM", date: "YYYY-MM-DD",
  timekeeper, level, type: "fee"|"disbursement", billing: "hourly"|"flat",
  hours?, rate?, amount?, category?, narrative, writeOff? }`
  (`amount` derived as `hours × rate` when omitted).
- rate card: `{ firmId, matterId?, effectiveFrom?, effectiveTo?,
  rates: { partner: 850, associate: 445, … } }` — matter-scoped cards beat
  firm-wide cards; the entry's `date` must fall inside the effective window.
- budget: `{ matterId, firmId?, period?, approved }` — exact matter+firm
  budgets shadow matter-wide ones for that firm; period-scoped budgets count
  only entries in that period.
- guideline rule: `{ id, type: "block_billing"|"disallowed_expense"|
  "max_hours_per_day"|"staffing_ratio", …type params }`.
- settings (rules-as-data, all overridable): `{ rateToleranceUsd = 0,
  writeOffFlagPct = 10, rateCreepPct = 10, hoursSpikeFactor = 2 }`.

All arithmetic in integer cents; no floats in comparisons, no hidden clocks.

## LEDES ingestion (deterministic)

`core/ledes.js` parses **LEDES 1998B** line-item text (pipe-delimited; the
first non-empty line is the verbatim header) into ledger entries — no LLM.
Every malformed line (wrong column count, bad date, bad line type, bad
number, fee `total_mismatch` where units × unit cost ≠ LINE_ITEM_TOTAL[])
becomes a structured error row `{ line, error, detail }` and is skipped:
numbers are never inferred. Dialect scope is 1998B line items only
(documented); other e-billing dialects are out of scope. Non-LEDES invoice
formats may still use the optional LLM extraction step below.

Line types accepted in `EXP/FEE/INV_ADJ_TYPE[]`: `F` (hourly fee), `E`
(expense), and 1998B invoice adjustments `IF` / `IE`, which map to flat
fee / disbursement entries carrying `LINE_ITEM_TOTAL[]` verbatim — negative
adjustment totals are preserved, so invoice-level discounts reduce period
fees/spend instead of losing those rows to error rows. Escaped LEDES atoms
(`/PIPE/`, `/amp/`) are **not** unescaped: a raw `|` in a field fails loudly
as `column_count` rather than being silently guessed.

## Deterministic vs LLM-assisted

| Layer | Who |
|---|---|
| Rate compliance, budget variance + drivers, guideline rules, anomaly flags, write-off flags, rollups, talking points, exports | **code** |
| LEDES 1998B invoice text → ledger entries | **code** (`core/ledes.js`) |
| Other invoice formats → ledger JSON | optional LLM (extraction) |
| Billing-guideline policy (rules, tolerance, thresholds) | **firm** (rules-as-data) |

### LLM prompt schema (extraction step, optional, non-LEDES formats)

```json
{
  "task": "Convert the provided invoice lines into ledger-entry JSON.",
  "output_schema": { "id": "line-item id", "matterId": "…", "firmId": "…", "period": "YYYY-MM", "date": "YYYY-MM-DD", "timekeeper": "…", "level": "one of the firm's levels", "type": "fee|disbursement", "billing": "hourly|flat", "hours": "number or null", "rate": "number or null", "amount": "number", "narrative": "verbatim time-entry text" },
  "rules": ["Never invent rates or amounts; copy them from the invoice.", "Narrative must be verbatim.", "Skip nothing; every line becomes an entry."]
}
```

## What's better than the closed counterpart

- **Every compliance decision is code.** The counterpart has an LLM interpret
  prose billing guidelines per run; here guidelines are typed rules-as-data
  and identical input → byte-identical audit JSON/CSV.
- **Findings are the product, not a dashboard.** Every exception is a row with
  entry id, violated rule id, expected value, and dollar impact — auditable and
  exportable, not just visualized.
- **Variance drivers computed and cited** — over-budget pairs name their
  top-3 contributing entries (id + amount), not an LLM's narration.
- **LEDES parsed deterministically** — 1998B line items become ledger entries
  with structured errors for malformed lines; zero hallucinated numbers.
- **Rate cards, guidelines, and thresholds as structured data** — the firm's
  negotiated rates and policies are JSON it owns, not values locked in a
  vendor UI.
- **Integer-cents arithmetic** — billing comparisons don't drift by floats.
- **Reproducible talking points** — per-firm partner-review sections tied to
  the audit summary, regenerable at will.

## Disclaimer

Billing-guideline thresholds (write-off percentage, rate tolerance, anomaly
thresholds) are rules-as-data with illustrative US-market defaults. All
example data fictional. Not legal or billing advice.
