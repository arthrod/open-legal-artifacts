# outside-counsel-spend

Open reimplementation of Anthropic's **Outside counsel spend** artifact —
spend across matters and firms — where **the findings ledger is the core**:
every rate exception, budget breach, guideline violation, and write-off flag
cites the entry, the violated rule, the expected value, and the dollar impact.

## What it does

- `checkRateCompliance(input)` — every hourly entry vs the negotiated rate
  card for that firm × matter × date window (matter-scoped cards shadow
  firm-wide ones). Findings: `over_rate` (with dollar impact),
  `unknown_level`, `no_rate_card` — never guessed.
- `computeBudgetVariance(input)` — matter × firm spend **net of write-offs**
  vs approved budgets; exact matter+firm budgets shadow matter-wide ones;
  period-scoped budgets count only their period. `within` | `over` |
  `unbudgeted`. Over-budget pairs carry **drivers** — the top-3 billed
  entries (id + amount) that pushed them over.
- `checkGuidelines(input)` — typed billing-guideline rules-as-data:
  `block_billing` (separator/word-count heuristics), `disallowed_expense`
  (category caps), `max_hours_per_day`, `staffing_ratio`. Unknown rule types
  surface as findings, never silently ignored.
- `flagAnomalies(input)` — `rate_creep` (realized rate up > `rateCreepPct`%
  period over period) and `hours_spike` (> `hoursSpikeFactor`× prior-period
  hours) per firm × timekeeper, as ledger rows citing entry ids.
- `flagWriteOffs(input)` — write-offs ≥ `writeOffFlagPct`% of the bill
  (default 10%, rules-as-data) flagged with evidence.
- `rollupByPeriod(input)` — per `YYYY-MM`: fees, disbursements, write-offs,
  net, by-firm and by-matter splits.
- `renderTalkingPoints(audit, names?)` — deterministic partner-review talking
  points, one section per firm plus a panel-wide section for matter-wide
  findings (e.g. staffing_ratio); totals tie to the audit summary and every
  claim cites a finding or driver id.
- `parseLedes(text, opts?)` (core/ledes.js) — deterministic **LEDES 1998B**
  parser: pipe-delimited line items (F/E fees and expenses, IF/IE invoice
  adjustments, negative discounts preserved) → ledger entries; malformed
  lines (including fee units × cost ≠ total) become structured error rows,
  never guessed.
- Export **JSON** (version-control friendly) and **findings CSV** (every row
  cites its rule).

All money arithmetic in integer cents. No hidden clocks.

## Run

```bash
node --test core/*.test.js    # 32 tests (node:test; 27 core + 5 LEDES)
node examples/run.js          # audits the example ledger → audit.json, findings.csv, report.md, talking-points.md
```

Open `demo/index.html` for the interactive demo (findings tables, budget
bars with drivers, guideline & anomaly flags, period filter, exports
including talking points).

## What's better than the closed counterpart

Counterpart (verified against Anthropic's Academy page,
academy.claude.com/use-cases/outside-counsel-review): an LLM reviews
outside-counsel invoices against prose billing guidelines and drafts
partner-review talking points per run.

1. **Every compliance decision is code.** Guidelines are typed rules-as-data
   evaluated deterministically — identical input → byte-identical audit
   JSON/CSV — where the counterpart re-interprets prose with an LLM each run.
2. **Findings, not a dashboard.** The closed artifact visualizes spend; this
   core's auditable object is the findings ledger — every exception row is
   reproducible from the input, cites its rule id, and carries a dollar
   impact.
3. **Variance drivers computed and cited** — over-budget pairs name their
   top-3 contributing entries, not an LLM's narration.
4. **LEDES 1998B parsed deterministically** — structured errors for malformed
   lines; zero hallucinated numbers.
5. **Rate cards, guidelines, and thresholds as data the firm owns** — JSON,
   not values locked in a vendor UI.
6. **Integer-cents arithmetic + open exports** — no float drift, no platform
   lock-in.

## Layout

- `spec.md` — IO contract, schemas, guideline/anomaly semantics, LEDES
  dialect scope, extraction prompt schema, determinism
- `core/core.js` — dependency-free ES module (browser + Node)
- `core/ledes.js` — deterministic LEDES 1998B parser
- `core/core.test.js`, `core/ledes.test.js` — node:test suites
- `examples/` — fictional worked example + runner + outputs
- `demo/index.html` — standalone demo using the shared design tokens

## Disclaimer

All example data fictional. Non-LEDES invoice formats may be LLM-assisted
(schema in spec.md); LEDES 1998B parsing and all compliance checks, variance,
drivers, flags, talking points, and rollups are pure code. Not legal or
billing advice.
