# renewal-calendar — worked example (2026-11-07, Northwind Robotics, Inc. (fictional))

**8 confirmed · 1 ambiguous · 2 unresolved · 1 coverage gap(s)**. Unresolved items produce NO calendar entry; coverage gaps are contracts with no dated clause at all — quiet is not clean.

## Notice deadlines (chronological, by urgency tier)

| Notice deadline | Event date | Contract | Clause | Lead time | Urgency | Escalation | Status |
|---|---|---|---|---|---|---|---|
| 2026-07-04 | 2026-10-02 | Lantern Warehouse Lease | auto-renewal | 90d (rules.byClauseType[auto-renewal]) | **overdue** (126d overdue) | general-counsel | ambiguous ⚠ |
| 2026-10-02 | 2026-11-01 | Quillmaster Reseller Deal | termination-for-convenience | 30d (rules.byClauseType[termination-for-convenience]) | **overdue** (36d overdue) | general-counsel | confirmed |
| 2026-11-01 | 2027-03-01 | Lantern Warehouse Lease | price-adjustment | 120d (rules.byClauseType[price-adjustment]) | **overdue** (6d overdue) | general-counsel | confirmed |
| 2027-01-01 | 2027-04-01 (cycle 1/12mo) | Foundry SaaS MSA | auto-renewal | 90d (rules.byClauseType[auto-renewal]) | **60d** (55d) | contract-owner | confirmed |
| 2027-03-02 | 2027-04-01 | Foundry SaaS MSA | termination-for-convenience | 30d (clause override) | **180d** (115d) | — | confirmed |
| 2027-08-03 | 2027-11-01 (cycle 1/12mo) | Quillmaster Reseller Deal | auto-renewal | 90d (rules.byClauseType[auto-renewal]) | **later** (269d) | — | confirmed |
| 2028-01-02 | 2028-04-01 (cycle 2/12mo) | Foundry SaaS MSA | auto-renewal | 90d (rules.byClauseType[auto-renewal]) | **later** (421d) | — | confirmed |
| 2028-03-17 | 2028-06-15 | Helix Maintenance Agreement | evergreen | 90d (rules.byClauseType[evergreen]) | **later** (496d) | — | confirmed |
| 2028-08-03 | 2028-11-01 (cycle 2/12mo) | Quillmaster Reseller Deal | auto-renewal | 90d (rules.byClauseType[auto-renewal]) | **later** (635d) | — | confirmed |

### ✓ Confirmed — Lantern Warehouse Lease (price-adjustment)

- pinned date: `2027-03-01` by K. Alvarez, outside counsel on 2026-11-06 (resolved `window-direction-and-quarter` flag)

### ⚠ Ambiguity — Lantern Warehouse Lease (auto-renewal)

- expression: `90 days before quarter end`
- interpretation: 90 days before quarter end (2026-12-31)
- flag (quarter-selection): Assumed nearest quarter end 2026-12-31 on/after 2026-11-07.

## Unresolved (excluded from calendar — human review required)

- **Helix Maintenance Agreement** `notice` — `on mutual agreement`: expression "on mutual agreement" not in the supported grammar — human review required
- **Orchid Office Lease** `renewal` — `on mutual agreement`: expression "on mutual agreement" not in the supported grammar — human review required

## Coverage audit (quiet is not clean)

Contracts with **no dated renewal/notice clause** — nothing above is tracking them:

- **Orchid Office Lease** [CTR-005]: no dated renewal/notice clause — 1 clause(s) found, none resolvable to a date; human review required

## Rules applied (rules-as-data)

Default lead time 60d; by clause type: `auto-renewal`=90d, `evergreen`=90d, `termination-for-convenience`=30d, `price-adjustment`=120d. Clause-level overrides win.

Escalation (most urgent first): ≤7d → **general-counsel**, ≤30d → **procurement-lead**, ≤90d → **contract-owner**.

_All data fictional. Extracted dates require human confirmation — an ambiguous reading is a prompt to read the clause, not a deadline to rely on. Not legal advice._
