# Sell-side Q&A log — Project Copperfield — sale of Kestrel Data Systems, Inc. (fictional)

**8 questions:** 7 sent · 0 draft-only · 1 open · 2 draft-pending · **4 contradiction(s)**

Disclosure readiness: **69/100 (nearly ready)** — coverage 88%, pipeline 88%, consistency 25%.

| Id | Buyer | Category | Status | Contradicted |
|---|---|---|---|---|
| Q-001 | Oryx Growth Partners | litigation | sent | **yes** |
| Q-002 | Lantern Harbor Capital | litigation | sent | **yes** |
| Q-003 | Oryx Growth Partners | customers | sent | **yes** |
| Q-004 | Fairwind Industrials | customers | sent | **yes** |
| Q-005 | Lantern Harbor Capital | financials | draft-pending | **yes** |
| Q-006 | Oryx Growth Partners | financials | sent | **yes** |
| Q-007 | Lantern Harbor Capital | ip | open | — |
| Q-008 | Fairwind Industrials | ip | draft-pending | — |

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
  - `Q-001` (sent): "Yes."
  - `Q-002` (sent): "No."

## Current answers

### Q-001 — Oryx Growth Partners · litigation · sent

> Are there any pending lawsuits against the target?

Yes. There are 3 pending lawsuits: two employment matters and one commercial dispute.

### Q-002 — Lantern Harbor Capital · litigation · sent

> Does the target have any active litigation exposure?

No. All 2 lawsuits from 2024 were settled and dismissed; there are no pending lawsuits against the target.

### Q-003 — Oryx Growth Partners · customers · sent

> How many customers does the target have?

The target serves 1,200 active customers across 14 locations.

### Q-004 — Fairwind Industrials · customers · sent

> What is the customer base?

Approximately 950 active customers as of the latest quarter.

### Q-005 — Lantern Harbor Capital · financials · draft-pending

> What was 2025 revenue growth?

Revenue grew 12% in 2025.

_Pending draft (not sent):_ "Revenue grew 12% in 2025, but EBITDA declined 4% year over year."

### Q-006 — Oryx Growth Partners · financials · sent

> How did profitability trend in 2025?

EBITDA increased 4% year over year in 2025.

### Q-007 — Lantern Harbor Capital · ip · open

> Is the IP exclusively licensed?

_no sent answer yet_

### Q-008 — Fairwind Industrials · ip · draft-pending

> Are any licenses exclusive?

The core patent portfolio is licensed exclusively to Meridian Manufacturing.

_Pending draft (not sent):_ "The core patent portfolio is licensed exclusively to Meridian Manufacturing; two trademarks are non-exclusive."

_All data fictional. Contradiction flags are keyword/number heuristics for human review, not legal conclusions. Not legal advice._
