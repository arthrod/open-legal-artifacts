# Record sealing screen — District of Columbia (example ruleset)

As of: **2026-11-07** · Ruleset: **DC v2026-11-example**

**5** cases · 2 potentially eligible · 1 need more time · 1 ineligible · 1 insufficient data

## C-2021-114 (2021-CF-001142) — potentially_eligible

Offense: Possession of a controlled substance (fictional)
Earliest eligibility date: **2024-03-01**
Motion to file: Motion to Seal Conviction Record

Rule chain:
- `DC-R1` DC conviction path: 8-year wait anchored to sentenceCompletedDate
- `DC-R1` Waiting period satisfied on or after 2024-03-01; no disqualifier matched.

## C-2022-037 (2022-CF-000371) — needs_more_time

Offense: Theft II (fictional client matter)
Earliest eligibility date: **2030-11-30**

Rule chain:
- `DC-R1` DC conviction path: 8-year wait anchored to sentenceCompletedDate
- `DC-R1` As of 2026-11-07, 3 of 8 required years elapsed.

## C-2023-005 (2023-CF-000058) — potentially_eligible

Offense: Assault (fictional)
Earliest eligibility date: **2024-06-20**
Motion to file: Motion to Seal Following Acquittal

Rule chain:
- `DC-R2` DC acquittal path: 0-year wait anchored to dispositionDate
- `DC-R2` Waiting period satisfied on or after 2024-06-20; no disqualifier matched.

## C-2024-089 (2024-CF-000894) — ineligible

Offense: Burglary I (fictional)

Disqualifiers (rule cited):
- **disqualifying_category** — Offense category "violent_felony" is disqualifying on the conviction path. `DC-R1`
- **disqualifying_class** — Offense class "felony_class_B" is disqualifying on the conviction path. `DC-R1`

Rule chain:
- `DC-R1` DC conviction path: 8-year wait anchored to sentenceCompletedDate

## C-2026-201 (2026-CF-002019) — insufficient_data

Offense: Trespass (fictional, record incomplete)

Disqualifiers (rule cited):
- **pending_case** — A pending case is open; most schemes bar sealing until it resolves. `GATE-PENDING`

Missing data (never guessed):
- disposition (conviction / acquittal / dismissed / nolle_prosequi / deferred_adjudication)

---
> ⚠️ Screening estimate only, produced under illustrative example rulesets. Verify eligibility with licensed counsel in the actual jurisdiction before filing or advising a client.
