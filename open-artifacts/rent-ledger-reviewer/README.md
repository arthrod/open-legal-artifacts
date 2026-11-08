# rent-ledger-reviewer

Rent ledger auditor for eviction defense. Ledger entries JSON in (payments,
rent due, late fees, interest, misc charges — or a pasted CSV/TSV table via
the deterministic `parseLedgerTable`) → running balance recomputed entry by
entry, overcharge/underpayment detection, late-fee cap + grace-period checks,
interest recomputation, rent-schedule cap checks, claimed-balance mismatch,
and unknown/disallowed charge flagging per **rules-as-data** (3 editable
example US jurisdictions, each rule carrying an illustrative [verify]-tagged
citation pointer) — plus an itemized dispute report where every line cites
the rule that produced it, and a recomputed-ledger CSV.

Open reimplementation of the Rising for Justice "Rent ledger reviewer"
(Claude for Legal A2J gallery); the original is D.C.-only and closed. The
recalculation here is pure, inspectable arithmetic — no LLM in the loop.

## Run

```bash
node --test 'core/*.test.js'   # 33 tests
node examples/run.js           # regenerates output.json + report.md + ledger.csv
```

Open `demo/index.html` for the interactive demo (prefilled worked example:
duplicate rent entry, grace-window late fee, over-cap late fee, disallowed
admin fee, landlord-claimed balance $400 above the recomputation → $400
overcharge identified; plus a paste box that turns a CSV/TSV ledger table
into input deterministically, no LLM).

## Layout

- `spec.md` — IO contract, deterministic/LLM split, prompt schema
- `core/core.js` — dependency-free ES module (browser + Node)
- `core/core.test.js` — node:test suite
- `examples/` — fictional 13-entry ledger → audit outputs (JSON/MD/CSV)
- `demo/index.html` — standalone interactive demo (design tokens)

## Better than the closed counterpart

- Inspectable engine: every audit rule is data with an id; every dispute
  line cites it — and carries an illustrative [verify]-tagged citation
  pointer — defensible in court.
- Two ledgers (as-charged vs lawful-only) make the overcharge delta obvious.
- Covers the checks the closed counterpart is known for — interest
  miscalculation and rent-increase caps — plus a claimed-balance-vs-
  recomputation check it doesn't advertise.
- LLM-free, deterministic CSV/TSV table ingestion: dirty rows are listed,
  never guessed; same input + ruleset version ⇒ byte-identical output.
- Portable beyond D.C. by editing rules-as-data.
- Reproducible byte-for-byte; exports CSV + JSON, not just a chat artifact.

⚠️ Illustrative example rulesets and fictional data only. Not legal advice;
figures are screening estimates for attorney review.
