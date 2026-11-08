# Record sealing screen — District of Columbia (example ruleset, statutes cited for verification)

As of: **2026-11-07** · Ruleset: **DC v2026-11-dc-cited**

**5** cases · 2 potentially eligible · 1 need more time · 1 ineligible · 1 insufficient data

**Next recheck date: 2030-11-30** — earliest date any needs_more_time case may become eligible.

## C-2021-114 (2021-CF-001142) — potentially_eligible

Offense: Possession of a controlled substance (fictional)
Earliest eligibility date: **2024-03-01**
Motion to file: Motion to Seal Conviction Record (D.C. Code § 16-806(a)(3) [verify])

Filing next steps:
- Draft the motion stating all unsealed citations, arrests, charges, and convictions as reasonably known (§ 16-806(c)(1)(A)) [verify]
- Serve a copy of the motion on the prosecutor (§ 16-806(d)) [verify]
- File with the court; the order is due within 180 days (§ 16-806(i)(4)(C)) [verify]
- If granted, records are sealed within 90 days (§ 16-806(j)) [verify]
- Where to file: D.C. Superior Court [verify]
- Fee: No filing fee stated in § 16-806 [verify]

Rule chain:
- `DC-R1` DC conviction path: 8-year wait anchored to sentenceCompletedDate — D.C. Code § 16-806(a)(3) [verify]
- `DC-R1` Waiting period satisfied on or after 2024-03-01; no disqualifier matched. — D.C. Code § 16-806(a)(3) [verify]

## C-2022-037 (2022-CF-000371) — needs_more_time

Offense: Theft II (fictional client matter)
Earliest eligibility date: **2030-11-30**

Rule chain:
- `DC-R1` DC conviction path: 8-year wait anchored to sentenceCompletedDate — D.C. Code § 16-806(a)(3) [verify]
- `DC-R1` As of 2026-11-07, 3 of 8 required years elapsed.

## C-2023-005 (2023-CF-000058) — potentially_eligible

Offense: Assault (fictional)
Earliest eligibility date: **2024-06-20**
Motion to file: Motion to Seal Following Acquittal (D.C. Code § 16-803 [verify])

Filing next steps:
- Draft the motion stating the grounds and supporting facts (§ 16-803(b)(1)) [verify]
- Serve a copy on the prosecutor (§ 16-803(c)) [verify]
- File with the court; may be filed at any time (§ 16-803(b)(2)(B)) [verify]
- Where to file: D.C. Superior Court [verify]
- Fee: No filing fee stated in § 16-803 [verify]

Rule chain:
- `DC-R2` DC acquittal path: 0-year wait anchored to dispositionDate — D.C. Code § 16-803 [verify]
- `DC-R2` Waiting period satisfied on or after 2024-06-20; no disqualifier matched. — D.C. Code § 16-803 [verify]

## C-2024-089 (2024-CF-000894) — ineligible

Offense: Burglary I (fictional)

Disqualifiers (rule cited):
- **disqualifying_category** — Offense category "violent_felony" is disqualifying on the conviction path. `DC-R1` (D.C. Code § 16-806(a)(3) [verify])
- **disqualifying_class** — Offense class "felony_class_B" is disqualifying on the conviction path. `DC-R1` (D.C. Code § 16-806(a)(3) [verify])

Rule chain:
- `DC-R1` DC conviction path: 8-year wait anchored to sentenceCompletedDate — D.C. Code § 16-806(a)(3) [verify]

## C-2026-201 (2026-CF-002019) — insufficient_data

Offense: Trespass (fictional, record incomplete)

Disqualifiers (rule cited):
- **pending_case** — This case is pending; most schemes bar sealing until it resolves. `GATE-PENDING`

Missing data (never guessed):
- disposition (conviction / acquittal / dismissed / nolle_prosequi / deferred_adjudication)

---
> ⚠️ Screening estimate only, produced under illustrative example rulesets. Verify eligibility with licensed counsel in the actual jurisdiction before filing or advising a client.
