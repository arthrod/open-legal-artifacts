# rent-ledger-reviewer

Rent ledger auditor for eviction defense. Ledger entries JSON in (payments,
rent due, late fees, misc charges) → running balance recomputed entry by
entry, overcharge/underpayment detection, late-fee cap + grace-period checks
per **rules-as-data** (3 editable example US jurisdictions), and an itemized
dispute report where every line cites the rule that produced it, plus a
recomputed-ledger CSV.

Open reimplementation of the Rising for Justice "Rent ledger reviewer"
(Claude for Legal A2J gallery); the original is D.C.-only and closed. The
recalculation here is pure, inspectable arithmetic — no LLM in the loop.

## Run

```bash
node --test 'core/*.test.js'   # 18 tests
node examples/run.js           # regenerates output.json + report.md + ledger.csv
```

Open `demo/index.html` for the interactive demo (prefilled worked example:
duplicate rent entry, grace-window late fee, over-cap late fee, disallowed
admin fee → $400 overcharge identified).

## Layout

- `spec.md` — IO contract, deterministic/LLM split, prompt schema
- `core/core.js` — dependency-free ES module (browser + Node)
- `core/core.test.js` — node:test suite
- `examples/` — fictional 13-entry ledger → audit outputs (JSON/MD/CSV)
- `demo/index.html` — standalone interactive demo (design tokens)

## Better than the closed counterpart

- Inspectable engine: every audit rule is data with an id; every dispute
  line cites it — defensible in court.
- Two ledgers (as-charged vs lawful-only) make the overcharge delta obvious.
- Portable beyond D.C. by editing rules-as-data.
- Reproducible byte-for-byte; exports CSV + JSON, not just a chat artifact.

⚠️ Illustrative example rulesets and fictional data only. Not legal advice;
figures are screening estimates for attorney review.
