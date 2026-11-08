# Outside counsel spend audit

**17 entries · fees 57610 · disbursements 2055 · write-offs 1889 · net spend 57776**

Rate check: 14 hourly entries, 10 ok, **4 exception(s)** · Budgets: **1 over**, 1 unbudgeted · Write-off flags: **1**

## Rate-card exceptions

- `L-003` · Project Kite — FDA response × Hale & Prior LLP · A. Reyes (partner) · 2026-09 — **over_rate**: billed 925/h for level "partner" but card rate is 850/h (firm card, from 2026-07-01) — impact 150 over 2h.
- `L-005` · Atlas IP enforcement × Hale & Prior LLP · S. Ito (partner) · 2026-09 — **over_rate**: billed 950/h for level "partner" but card rate is 900/h (matter card, from 2026-07-01) — impact 250 over 5h.
- `L-006` · Dune merger — HSR filing × Merrick Vaughan LLP · P. Dorn (partner) · 2026-08 — **no_rate_card**: no rate card covers firm "MVL" on 2026-08-20.
- `L-007` · Dune merger — HSR filing × Merrick Vaughan LLP · P. Dorn (counsel) · 2026-10 — **unknown_level**: level "counsel" is not on rate card for firm "MVL" — expected rate cannot be determined.

## Budget variance (net of write-offs)

| Matter | Firm | Net | Approved | Variance | Drivers | Status |
|---|---|---|---|---|---|---|
| Project Kite — FDA response | Hale & Prior LLP | 11673.75 | 8000 | 3673.75 (45.92%) | L-001 (3400), L-002 (2892.5), L-003 (1850) | over |
| Atlas IP enforcement | Hale & Prior LLP | 12625 | 50000 | -37375 (-74.75%) | — | within |
| Dune merger — HSR filing | Merrick Vaughan LLP | 25900 | 30000 | -4100 (-13.67%) | — | within |
| Northwind wage-and-hour audit | Hale & Prior LLP | 5639.75 | — | — | — | unbudgeted |

## Write-off flags

- `L-010` · Atlas IP enforcement × Hale & Prior LLP · 2026-09 — write-off 1800 is 25% of the 7200 bill (threshold 10%) — narrative: "Opposition brief finalization; senior-partner review; partial write-off agreed with billing partner.".

## Billing-guideline flags

- rule `BG-01` · **block_billing** · entry `L-001` · 2 activities in one entry (separator-joined) — rule BG-01 treats the entry as block-billed; impact is the full billed amount (3400).
- rule `BG-01` · **block_billing** · entry `L-002` · 2 activities in one entry (separator-joined) — rule BG-01 treats the entry as block-billed; impact is the full billed amount (2892.5).
- rule `BG-01` · **block_billing** · entry `L-004` · 2 activities in one entry (separator-joined) — rule BG-01 treats the entry as block-billed; impact is the full billed amount (2475).
- rule `BG-01` · **block_billing** · entry `L-010` · 3 activities in one entry (separator-joined) — rule BG-01 treats the entry as block-billed; impact is the full billed amount (7200).
- rule `DE-01` · **disallowed_expense** · entry `L-017` · category "meals" billed 214.75 over the 75 cap (rule DE-01) — excess 139.75.
- rule `HD-01` · **max_hours_per_day** · 2 entries (`L-015`, `L-016`) · D. Lindqvist billed 11.5h on 2026-09-15 across 2 entries (cap 10h, rule HD-01) — over-cap portion billed at entry rates is 277.5.
- rule `SR-01` · **staffing_ratio** · 3 entries (`L-004`, `L-005`, `L-010`) · junior/senior staffing ratio 0 on matter M-211 is below the 1.5 minimum (rule SR-01) — 0 non-senior hours vs 16 senior hours.
- rule `SR-01` · **staffing_ratio** · 2 entries (`L-006`, `L-007`) · junior/senior staffing ratio 0.6 on matter M-212 is below the 1.5 minimum (rule SR-01) — 1.5 non-senior hours vs 2.5 senior hours.

## Anomaly flags

- `hours_spike` · Hale & Prior LLP · D. Lindqvist · 2026-08→2026-09 — 11.5h in 2026-09 vs 3h in 2026-08 — more than 2× the prior period (entries `L-014`, `L-015`, `L-016`).
- `rate_creep` · Hale & Prior LLP · K. Kwan · 2026-07→2026-08 — realized rate rose from 395/h to 445/h (+12.66%, threshold 10%) between 2026-07 and 2026-08 (entries `L-012`, `L-013`).
- `hours_spike` · Hale & Prior LLP · S. Ito · 2026-08→2026-09 — 13h in 2026-09 vs 3h in 2026-08 — more than 2× the prior period (entries `L-004`, `L-005`, `L-010`).
- `rate_creep` · Hale & Prior LLP · S. Ito · 2026-08→2026-09 — realized rate rose from 825/h to 919.23/h (+11.42%, threshold 10%) between 2026-08 and 2026-09 (entries `L-004`, `L-005`, `L-010`).

## Period rollups

| Period | Entries | Fees | Disbursements | Write-offs | Net |
|---|---|---|---|---|---|
| 2026-07 | 1 | 1185 | 0 | 0 | 1185 |
| 2026-08 | 4 | 6525 | 0 | 0 | 6525 |
| 2026-09 | 9 | 22220 | 2055 | 1800 | 22475 |
| 2026-10 | 3 | 27680 | 0 | 89 | 27591 |

_All data fictional. Rate cards and thresholds are rules-as-data. Not legal or billing advice._
