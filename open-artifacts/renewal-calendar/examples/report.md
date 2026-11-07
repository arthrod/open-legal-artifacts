# renewal-calendar — worked example (2026-11-07, Northwind Robotics, Inc. (fictional))

**5 confirmed · 2 ambiguous · 1 unresolved** events. Unresolved items produce NO calendar entry.

## Notice deadlines (chronological)

| Notice deadline | Event date | Contract | Clause | Lead time | Status |
|---|---|---|---|---|---|
| 2026-07-04 | 2026-10-02 | Lantern Warehouse Lease | auto-renewal | 90d (rules.byClauseType[auto-renewal]) | ambiguous ⚠ |
| 2026-07-04 | 2026-11-01 | Lantern Warehouse Lease | price-adjustment | 120d (rules.byClauseType[price-adjustment]) | ambiguous ⚠ |
| 2026-08-03 | 2026-11-01 | Quillmaster Reseller Deal | auto-renewal | 90d (rules.byClauseType[auto-renewal]) | confirmed |
| 2026-10-02 | 2026-11-01 | Quillmaster Reseller Deal | termination-for-convenience | 30d (rules.byClauseType[termination-for-convenience]) | confirmed |
| 2027-01-01 | 2027-04-01 | Foundry SaaS MSA | auto-renewal | 90d (rules.byClauseType[auto-renewal]) | confirmed |
| 2027-03-02 | 2027-04-01 | Foundry SaaS MSA | termination-for-convenience | 30d (clause override) | confirmed |
| 2028-03-17 | 2028-06-15 | Helix Maintenance Agreement | evergreen | 90d (rules.byClauseType[evergreen]) | confirmed |

### ⚠ Ambiguity — Lantern Warehouse Lease (auto-renewal)

- expression: `90 days before quarter end`
- interpretation: 90 days before quarter end (2026-12-31)
- flag (quarter-selection): Assumed nearest quarter end 2026-12-31 on/after 2026-11-07.

### ⚠ Ambiguity — Lantern Warehouse Lease (price-adjustment)

- expression: `within 60 days of quarter end`
- interpretation: "within 60 days of quarter end" — direction unstated; conservatively using the EARLIER candidate (quarter end − 60d)
- flag (window-direction-and-quarter): Assumed nearest quarter end 2026-12-31 on/after 2026-11-07 and "before" reading (conservative). Confirm clause intent with a lawyer.

## Unresolved (excluded from calendar — human review required)

- **Helix Maintenance Agreement** `notice` — `on mutual agreement`: expression "on mutual agreement" not in the supported grammar — human review required

## Rules applied (rules-as-data)

Default lead time 60d; by clause type: `auto-renewal`=90d, `evergreen`=90d, `termination-for-convenience`=30d, `price-adjustment`=120d. Clause-level overrides win.

_All data fictional. Extracted dates require human confirmation — an ambiguous reading is a prompt to read the clause, not a deadline to rely on. Not legal advice._
