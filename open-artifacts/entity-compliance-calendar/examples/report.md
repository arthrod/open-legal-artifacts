# entity-compliance-calendar — worked example (2026-11-07, Northwind Robotics group (fictional))

**3 delinquent · 0 due soon (≤45d) · 2 scheduled · 1 satisfied · 1 unknown · 28 n/a** across 35 entity × obligation cells.

Fees recorded on filings: **$3759** (E-1 $3680, E-2 $40, E-3 $9, E-4 $30).

## Delinquency flags (most overdue first)

- 🔴 **Northwind Robotics NY LLC** — NY biennial statement: due **2021-04-15**, overdue 2032d
- 🔴 **Northwind Robotics California, Inc.** — CA statement of information: due **2025-06-01**, overdue 524d
- 🔴 **Northwind Robotics, Inc.** — CA statement of information: due **2026-08-01**, overdue 98d

## Filing windows (cumulative; overdue always included)

### ≤30d — 3 filings

- 2021-04-15 (2032d overdue) · **Northwind Robotics NY LLC** — NY biennial statement [delinquent]
- 2025-06-01 (524d overdue) · **Northwind Robotics California, Inc.** — CA statement of information [delinquent]
- 2026-08-01 (98d overdue) · **Northwind Robotics, Inc.** — CA statement of information [delinquent]

### ≤60d — 3 filings

- 2021-04-15 (2032d overdue) · **Northwind Robotics NY LLC** — NY biennial statement [delinquent]
- 2025-06-01 (524d overdue) · **Northwind Robotics California, Inc.** — CA statement of information [delinquent]
- 2026-08-01 (98d overdue) · **Northwind Robotics, Inc.** — CA statement of information [delinquent]

### ≤90d — 3 filings

- 2021-04-15 (2032d overdue) · **Northwind Robotics NY LLC** — NY biennial statement [delinquent]
- 2025-06-01 (524d overdue) · **Northwind Robotics California, Inc.** — CA statement of information [delinquent]
- 2026-08-01 (98d overdue) · **Northwind Robotics, Inc.** — CA statement of information [delinquent]

### ≤180d — 4 filings

- 2021-04-15 (2032d overdue) · **Northwind Robotics NY LLC** — NY biennial statement [delinquent]
- 2025-06-01 (524d overdue) · **Northwind Robotics California, Inc.** — CA statement of information [delinquent]
- 2026-08-01 (98d overdue) · **Northwind Robotics, Inc.** — CA statement of information [delinquent]
- 2027-03-15 (in 128d) · **Northwind Robotics, Inc.** — DE franchise tax [scheduled]

## Health audit

- ⚠️ `good-standing-stale` — **Northwind Robotics California, Inc.**: last good-standing confirmation 2024-11-01 (736d old, >365d)
- ⚠️ `good-standing-unknown` — **Northwind Robotics Texas LLC**: no good-standing confirmation on record (goodStandingConfirmedOn missing)
- ⚠️ `foreign-qualification-gap` — **Northwind Robotics Texas LLC**: footprint includes US-WA but entity holds no qualification there [verify with agent]
- ⚠️ `dormant-dissolution-candidate` — **Petrel Systems, Inc.**: dormant 2777d (>5y since 2019-04-01) — dissolution candidate [verify with agent]
- ⚠️ `missing-formedOn` — **Kestrel Labs LLC**: no parseable formation date — deadlines and entity age cannot be computed

### Good standing (fictional confirmations)

- ✅ **Northwind Robotics, Inc.** — ok (confirmed 2026-10-15)
- 🟡 **Northwind Robotics California, Inc.** — stale (confirmed 2024-11-01)
- ✅ **Northwind Robotics NY LLC** — ok (confirmed 2026-08-01)
- ❓ **Northwind Robotics Texas LLC** — unknown
- ❓ **Gale Force Labs, Inc. (dormant sub)** — unknown
- ✅ **Petrel Systems, Inc.** — ok (confirmed 2026-06-01)
- ✅ **Kestrel Labs LLC** — ok (confirmed 2026-10-01)

## Upcoming filings (next-due, chronological, actionable cells only)

- 2027-03-15 · **Northwind Robotics, Inc.** — DE franchise tax (annual, formation anniversary (03-15)) [fictional 8 Del. C. § 391-analog]
- 2027-06-01 · **Northwind Robotics, Inc.** — DE registered agent renewal (annual, fixed 6/1) [fictional 8 Del. C. § 132-analog]

## Rules applied (rules-as-data)

- `de-franchise` DE franchise tax — US-DE, corp, annual [effective 2020-01-01] [verified 2025-06-01] [fictional 8 Del. C. § 391-analog]
- `ca-sos-biennial` CA statement of information — US-CA, corp/llc, biennial [effective 2021-01-01] [verified 2026-09-15] [fictional Cal. Corp. Code § 6210-analog]
- `ny-annual-report` NY biennial statement — US-NY, corp/llc, biennial fixed 4/15 [effective 2019-01-01] [verified 2026-08-20] [fictional NY LLC Law § 301-analog]
- `tx-initial-report` TX initial information report — US-TX, corp/llc, event [effective 2024-01-01] [verified 2026-10-01] [fictional Tex. Bus. Orgs. Code § 5.257-analog]
- `de-registered-agent` DE registered agent renewal — US-DE, corp/llc, annual fixed 6/1 [effective 2020-01-01] [verified 2026-07-10] [fictional 8 Del. C. § 132-analog]

_All entities, obligations, and statutory cites fictional (US-flavored defaults). Obligation rules change — maintain the rule base with effective dates before operational use. Not legal advice._
