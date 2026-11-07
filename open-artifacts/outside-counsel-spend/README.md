# outside-counsel-spend

Open reimplementation of Anthropic's **Outside counsel spend** artifact —
spend across matters and firms — where **the findings ledger is the core**:
every rate exception, budget breach, and write-off flag cites the entry, the
violated rule, the expected value, and the dollar impact.

## What it does

- `checkRateCompliance(input)` — every hourly entry vs the negotiated rate
  card for that firm × matter × date window (matter-scoped cards shadow
  firm-wide ones). Findings: `over_rate` (with dollar impact),
  `unknown_level`, `no_rate_card` — never guessed.
- `computeBudgetVariance(input)` — matter × firm spend **net of write-offs**
  vs approved budgets; exact matter+firm budgets shadow matter-wide ones;
  period-scoped budgets count only their period. `within` | `over` |
  `unbudgeted`.
- `flagWriteOffs(input)` — write-offs ≥ `writeOffFlagPct`% of the bill
  (default 10%, rules-as-data) flagged with evidence.
- `rollupByPeriod(input)` — per `YYYY-MM`: fees, disbursements, write-offs,
  net, by-firm and by-matter splits.
- Export **JSON** (version-control friendly) and **findings CSV**.

All money arithmetic in integer cents. No hidden clocks.

## Run

```bash
node --test "core/*.test.js"   # 14 tests (node:test)
node examples/run.js           # audits the example ledger → audit.json, findings.csv, report.md
```

Open `demo/index.html` for the interactive demo (findings tables, budget
bars, period filter, exports).

## What's better than the closed counterpart

1. **Findings, not a dashboard.** The closed artifact visualizes spend; this
   core's auditable object is the findings ledger — every exception row is
   reproducible from the input and exportable.
2. **Rate cards as data the firm owns** — negotiated rates are JSON, not
   values locked in a vendor UI; thresholds (`rateToleranceUsd`,
   `writeOffFlagPct`) are rules-as-data.
3. **Integer-cents arithmetic** — no float drift in billing comparisons;
   identical inputs → byte-identical outputs.
4. **Open exports** — JSON + CSV, no platform lock-in.

## Layout

- `spec.md` — IO contract, schemas, extraction prompt schema, determinism
- `core/core.js` — dependency-free ES module (browser + Node)
- `core/core.test.js` — node:test suite
- `examples/` — fictional worked example + runner + outputs
- `demo/index.html` — standalone demo using the shared design tokens

## Disclaimer

All example data fictional. Parsing LEDES/invoices into ledger JSON may be
LLM-assisted (schema in spec.md), but compliance checks, variance, flags, and
rollups are pure code. Not legal or billing advice.
