# Sell-side Q&A log — Project Copperfield — sale of Kestrel Data Systems, Inc. (fictional)

**8 questions:** 7 sent · 0 draft-only · 1 open · 2 draft-pending · **5 contradiction(s)**

Disclosure readiness: **67/100 (nearly ready)** — coverage 88% × 0.4, pipeline 88% × 0.15, consistency 25% × 0.25, provenance 63% × 0.2.

Aging as of 2026-10-23 (SLA: warn 3d, breach 5d): **5 of 8 overdue**.

| Id | Buyer | Category | Status | Aging | Contradicted |
|---|---|---|---|---|---|
| Q-001 | Oryx Growth Partners | litigation | sent | 25d (overdue) | **yes** |
| Q-002 | Lantern Harbor Capital | litigation | sent | 13d (overdue) | **yes** |
| Q-003 | Oryx Growth Partners | customers | sent | 7d (overdue) | **yes** |
| Q-004 | Fairwind Industrials | customers | sent | 4d (due soon) | **yes** |
| Q-005 | Lantern Harbor Capital | financials | draft-pending | 21d (overdue) | **yes** |
| Q-006 | Oryx Growth Partners | financials | sent | 5d (overdue) | **yes** |
| Q-007 | Lantern Harbor Capital | ip | open | 3d (due soon) | — |
| Q-008 | Fairwind Industrials | ip | draft-pending | 1d | — |

## Contradictions (deterministic heuristics — attorney review required)

- **number_conflict** (customers) · Q-003 vs Q-004 — disjoint bare-count values: Q-003 (sent) says 1200, Q-004 (sent) says 950 — 1200 vs 950.
  - `Q-003` (sent): "The target serves 1,200 active customers across 14 locations."
  - `Q-004` (sent): "Approximately 950 active customers as of the latest quarter."
- **number_conflict** (financials) · Q-005 vs Q-006 — disjoint "%" values: Q-005 (sent) says 12, Q-006 (sent) says 4 — 12 vs 4.
  - `Q-005` (sent): "Revenue grew 12% in 2025."
  - `Q-006` (sent): "EBITDA increased 4% year over year in 2025."
- **number_conflict** (litigation) · Q-001 vs Q-002 — disjoint bare-count values: Q-001 (sent) says 3, Q-002 (sent) says 2/2024 — 3 vs 2/2024.
  - `Q-001` (sent): "There are 3 pending lawsuits: two employment matters and one commercial dispute."
  - `Q-002` (sent): "All 2 lawsuits from 2024 were settled and dismissed; there are no pending lawsuits against the target."
- **antonym_conflict** (litigation) · Q-001 vs Q-002 — Q-001 says "yes" where Q-002 says "no".
  - `Q-001` (sent): "Yes. There are 3 pending lawsuits: two employment matters and one commercial dispute."
  - `Q-002` (sent): "No. All 2 lawsuits from 2024 were settled and dismissed; there are no pending lawsuits against the target."
- **antonym_conflict** (litigation) · Q-001 vs Q-002 — Q-001 says "pending" where Q-002 says "settled".
  - `Q-001` (sent): "There are 3 pending lawsuits: two employment matters and one commercial dispute."
  - `Q-002` (sent): "All 2 lawsuits from 2024 were settled and dismissed; there are no pending lawsuits against the target."

## Current answers

### Q-001 — Oryx Growth Partners · litigation · sent

> Are there any pending lawsuits against the target?

Yes. There are 3 pending lawsuits: two employment matters and one commercial dispute.

- source: `DR-014` §2.1 — "Three actions pending: two employment, one commercial."

### Q-002 — Lantern Harbor Capital · litigation · sent

> Does the target have any active litigation exposure?

No. All 2 lawsuits from 2024 were settled and dismissed; there are no pending lawsuits against the target.

- source: `DR-014` §2.2 — "All 2024 matters settled and dismissed with prejudice."

### Q-003 — Oryx Growth Partners · customers · sent

> How many customers does the target have?

The target serves 1,200 active customers across 14 locations.

### Q-004 — Fairwind Industrials · customers · sent

> What is the customer base?

Approximately 950 active customers as of the latest quarter.

### Q-005 — Lantern Harbor Capital · financials · draft-pending

> What was 2025 revenue growth?

Revenue grew 12% in 2025.

- source: `DR-002` p. 7 — "FY2025 revenue growth of 12 percent."

_Pending draft (not sent):_ "Revenue grew 12% in 2025, but EBITDA declined 4% year over year."

_Release blockers:_ `unapproved`, `number_conflict`

### Q-006 — Oryx Growth Partners · financials · sent

> How did profitability trend in 2025?

EBITDA increased 4% year over year in 2025.

- source: `DR-002` p. 9 — "EBITDA increased 4 percent year over year in FY2025."

### Q-007 — Lantern Harbor Capital · ip · open

> Is the IP exclusively licensed?

_no sent answer yet_

### Q-008 — Fairwind Industrials · ip · draft-pending

> Are any licenses exclusive?

The core patent portfolio is licensed exclusively to Meridian Manufacturing.

- source: `DR-021` Exhibit C — "Core patent portfolio licensed exclusively to Meridian Manufacturing."

_Pending draft (not sent):_ "The core patent portfolio is licensed exclusively to Meridian Manufacturing; two trademarks are non-exclusive."

_Release blockers:_ `unapproved`

_All data fictional. Contradiction flags are keyword/number heuristics for human review, not legal conclusions. Not legal advice._
