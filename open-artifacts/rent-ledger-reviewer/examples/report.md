# Rent ledger review — DC (ruleset DC v2026-11-example)

As of **2026-04-30** · recomputed **13** entries across **4** expected rent months.

| Balance (as ledger stands) | Balance (lawful charges only) | Overcharge identified |
|---:|---:|---:|
| 1870.00 | 1470.00 | **400.00** |

## Itemized disputes (4)

| # | Issue | Month | Amount | Rule | Entry | Description |
|---|---|---|---:|---|---|---|
| 1 | duplicate_rent_entry | 2026-03 | 1400.00 | `LEDGER-COMPLETENESS` |  | 2 rent entries recorded for 2026-03; only one monthly rent charge is expected. |
| 2 | late_fee_before_grace | 2026-02 | 70.00 | `DC-LF` | 6 | Fee charged for 2026-02, but rent was paid by 2026-02-04, within the 5-day grace window (due 2026-02-01). |
| 3 | late_fee_over_cap | 2026-03 | 80.00 | `DC-LF` | 10 | Fee 150.00 exceeds the 5% of monthly rent cap of 70.00 for 2026-03. |
| 4 | disallowed_charge_type | 2026-01 | 250.00 | `DC-ALLOWABLE` | 3 | Charge of type "misc_fee" (250.00 on 2026-01-15) is not an allowable charge type in the DC example ruleset. |

---
> ⚠️ Recomputation uses illustrative example rulesets; figures are screening estimates for attorney review, not a determination of what is owed. Verify against the actual lease, ledger originals, and current local law.
