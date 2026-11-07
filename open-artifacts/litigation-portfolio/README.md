# litigation-portfolio

Open, deterministic matter portfolio: statute-of-limitations math from
editable rules-as-data (US defaults, configurable, cited), exposure
banding, rules-of-the-road metadata, dashboard + CSV export.

## Run

- Demo: open `demo/index.html` (standalone, styled with the shared design
  tokens, prefilled with the worked example).
- Tests: `node --test core/core.test.js` — 17 tests.
- Example: `node examples/run.js` → regenerates `examples/output.json`,
  `dashboard.md`, `portfolio.csv` from `examples/input.json`.

## How it works

1. Each matter carries a `claimType` key; the limitation rule (years/days,
   occurrence vs discovery accrual, statutory cite) comes from
   `DEFAULT_CLAIM_RULES` or your override in the input JSON.
2. Deadline = accrual date + period, extended by tolling spans.
   Feb-29 clamps to Feb-28; malformed tolling dates are flagged and
   ignored — never guessed.
3. Days-remaining bands the matter expired / critical (≤30d) /
   warning (≤90d) / ok; unknown claim types or missing dates →
   `unverified` with explicit flags.
4. Exposure bands (low <$50k / medium <$500k / high ≥$500k /
   unquantified) are configurable; rollups feed the dashboard.

## Better than the closed counterpart

- Limitation rules are visible, cited, editable data — not hidden
  model behavior; every output date shows its `ruleCite`.
- Deterministic and reproducible (17 unit tests), exports CSV,
  runs browser-side with zero dependencies.
- Fails open questions loudly (`unverified`) instead of inventing dates.

All data in examples/demo is fictional. Not legal advice; verify all
limitation rules against current law in the governing jurisdiction.
