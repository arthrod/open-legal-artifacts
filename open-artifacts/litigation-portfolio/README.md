# litigation-portfolio

Open, deterministic matter portfolio: statute-of-limitations math from
editable rules-as-data (US defaults, configurable, cited), exposure
banding, rules-of-the-road metadata, dashboard + CSV export.

## Run

- Demo: open `demo/index.html` (standalone, styled with the shared design
  tokens, prefilled with the worked example).
- Tests: `node --test core/core.test.js` — 26 tests.
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
   unquantified) are configurable; band rollups feed the dashboard.
   Materiality classes (reserved / disclosed / monitored / none) with
   rough midpoint totals per class roll up into the summary JSON
   (CSV carries per-matter `materiality`; the dashboard shows none).
5. Eight deterministic anomaly checks (stable ids + severity,
   configurable thresholds): overdue next deadline, stale matter,
   conflicts open/override, high risk without outside counsel, stale
   reserve, hold gap, missing fields. Next-deadline horizon buckets
   (overdue / ≤14d / 15–30d / 31–60d / >60d) roll up in summary and
   dashboard; the dashboard adds a severity-sorted ⚠️ anomalies section
   with a deterministic "look first" line and a stage-distribution table.
6. `applyFilters()` is the closed skill's CLI flags as data —
   includeClosed / stale-only / band / claimType / counsel — and the
   demo wires them into the board live (closed matters excluded by
   default).
7. Exposure provenance (`exposureBasis` + `sourceDoc`) travels from
   input through output JSON, CSV, and the dashboard.

## Better than the closed counterpart

- Limitation rules are visible, cited, editable data — not hidden
  model behavior; every output date shows its `ruleCite`.
- Deterministic and reproducible (26 unit tests), exports CSV,
  runs browser-side with zero dependencies.
- Fails open questions loudly (`unverified`) instead of inventing dates.
- Their 8 prompt-interpreted anomaly checks, implemented as tested code:

| Their check | Our anomaly id | Test |
|---|---|---|
| overdue next_deadline | `overdue-next-deadline` | `detectAnomalies fires each of the 8 checks…` |
| stale >30d | `stale-matter` | `staleness: 45-day-old lastUpdated is stale…` |
| conflicts unresolved | `conflicts-open` | `detectAnomalies fires each of the 8 checks…` |
| conflicts override | `conflicts-override` | `detectAnomalies fires each of the 8 checks…` |
| high/critical risk w/o outside counsel | `high-risk-no-counsel` | `detectAnomalies fires each of the 8 checks…` |
| stale reserve >60d | `stale-reserve` | `staleness: 45-day-old lastUpdated is stale…` (config) + 8-check test |
| hold gap | `hold-gap` | `detectAnomalies fires each of the 8 checks…` |
| missing fields | `missing-fields` | `detectAnomalies fires each of the 8 checks…` |

Plus what theirs lacks: cited rules-as-data SOL computation, horizon
buckets, materiality midpoint rollups, exposure provenance in exports,
CSV export, reproducible git-diffable output, 0-dependency browser demo.

All data in examples/demo is fictional. Not legal advice; verify all
limitation rules against current law in the governing jurisdiction.
