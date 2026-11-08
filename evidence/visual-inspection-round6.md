# Visual Inspector — run dc77f578 participant 6

Verification complete across all four remediations, at three evidence tiers (live pixels, deployed build, source). Report follows.

---

# Visual Inspection — Round 6: Remediation Verification

| Field | Value |
|-------|-------|
| **Date** | 2026-11-07 |
| **App URL** | https://arthrod--4075ab70dae211f1929a1607ee4eb77e.web.val.run |
| **Session** | ver-20261107-r6 |
| **Scope** | Five-finding remediation (plan `docs/plan-critique-remediation.md`, waves 1–7): P1-A verdict inversion, P1-B chrome-on-tokens, P2-A intake step 3, P2-B course voice, P3 landing baseline |
| **Evidence** | Fresh live captures `tmp/shots/wave7/` (1280×2400) + deployed build `vt-val/site/`, `vt-val/course/` + source |

## Overall verdict: **PASS WITH FIXES**

| # | Remediation | Verdict |
|---|---|---|
| 1 | P1-A verdict inversion | **PASS** — with one medium deviation (TINT-01) |
| 2 | P1-B chrome-on-tokens | **FAIL** — course half never reached production |
| 3 | P2-A client-intake step 3 | **PASS** |
| 4 | P3 landing baseline | **PASS** |

Summary: C/0 · H/1 · M/2 · L/1 · **Total 4**

---

## 1 · P1-A — verdict inversion → **PASS** (2 of 3 sub-criteria clean)

**Failure louder than pass — verified in pixels.**

Cite-check ([cite-check.png](tmp/shots/wave7/cite-check.png), SUMMARY table): 9 quotes — 5 exact, 1 normalized, 1 fuzzy, 2 not found, 2 pinpoint issues.
- Failures take the ink: `NOT FOUND` solid near-black pill on Q4 and Q9; `MISMATCH` solid ink pill in the PINPOINT column on Q5 and Q7. Their rows also carry the 1.5px ink bottom rule.
- Passes whisper: `EXACT` / `NORMALIZED` are hairline outlines with no fill; `FUZZY` is an amber *outline* (`--warn` as text+border only).
- Hierarchy reads correctly at a glance: the two darkest objects on the page are the two failures.

Limitations ([limitations.png](tmp/shots/wave7/limitations.png), 5 claim cards): `deadline_passed_unfiled` (CLM-103) is a solid ink badge on a tinted card — the loudest element on the page; `filed_timely` (CLM-101) is a hairline outline; `deadline_upcoming` (CLM-102, CLM-104) and `data_needed` (CLM-105) are amber outlines. **Zero accent/yellow status fills** on either page.

**Deviation — TINT-01 (medium).** The "exactly one flag-tint surface" budget is exceeded, because the tint scales with the number of failing items rather than being a single spend:
- Cite-check: the flag rule fires on **4 rows** — `tr.flag td{background:var(--flag-tint)}` (source `open-artifacts/cite-check/demo/index.html:28,108`; deployed `vt-val/site/cite-check.html:160,240`). The beige (`--flag-tint: #f2e9d0`) is unmistakable on both `NOT FOUND` rows; on Q5/Q7 it reads close to white at 1067px JPEG scale while their ink `MISMATCH` pill remains the loudest object in the row.
- Limitations: **2 tinted cards** — CLM-103 (status fail) and CLM-105 (unknown-jurisdiction flag), per `.claim.expired` + the `flags.length > 0` condition (`limitations-radar/demo/index.html:24,98`).

The tint is still never spent on a pass — so the *rule* holds — but at 4-of-9 rows it stops functioning as "the one row to act on". Recommendation: either tint only the highest-priority failing row per table, or drop row tint and let the ink pill carry it (which already works).

## 2 · P1-B — chrome-on-tokens → **FAIL**

**Clean on the catalog + four demo targets:**
- No side-stripes: swept the deployed build — zero accent- or status-hued `border-left` remain. Survivors are the sanctioned neutral `var(--border)` quote/timeline rails (cite-check, contracts-playbook, playbook-deviation-board, fact-chronology, renewal-calendar, sell-side-qa-log).
- No sub-11px type: `vt-val/site` returns **0 hits** for both `font-size: ≤10px` and `font-size: 0.6x rem`. Landing labels (`--eyebrow`, `.section-title`, `.tile-meta`, `.tile-links a`) are all 11px in `app/src/styles.css`.

**The course is a live FAIL** ([course.png](tmp/shots/wave7/course.png)):

**ISSUE-001 — [HIGH · visual/content] Course still ships the dark CTA funnel; second type system survives on the live copy**

| Field | Value |
|---|---|
| **URL** | /course/ |
| **Repro Video** | N/A (static) |

Expected (Wave 6, option a): Manrope + Departure Mono, no dark CTA band, proof ending (lesson list + `Run the tools →` / `Read the source ↗`), field-colored footer. Observed on the live page: a black `AFTER THE COURSE` band with "Let's get rid of that problem nobody wants to solve." and a `CONTACT →` button ([course.png](tmp/shots/wave7/course.png), y≈1348–1540 of 2000), a black `A.S.R` footer beneath it, and Libre Franklin/Roboto Mono texture.

Confirmed at all three tiers: pixels (above); live HTML text — fetched `/course/` returns `/ After the course … Contact →`; source — the served copy `vt-val/course/` still has `.cta` (`home.css:21`, `js/app.js:43`), ink `.ftr` (`footer.css:2`), ink `.mbar`/`.resp` (`responsive.css:16`, `lesson-sections.css:30`), and `--ff: "Libre Franklin"` / `--mono: "Roboto Mono"` (`css/tokens.css:44-45`). The canonical copy **was** migrated — `artifacts/prompting-for-attorneys/css/tokens.css:45-46` has the catalog stack, and `js/app.js:44-45` has `.proof` + the two catalog links, with no `.cta`. So Wave 6 landed in the canonical tree and never synced to the copy that deploys: exactly the plan's risk #3 (manual sync assumption).

**ISSUE-003 — [MEDIUM · visual/accessibility] Course lesson pages still break the P1-B floor**

Source-verified, **not captured** (no lesson-page shot in this round's set): `vt-val/course/css/compare.css:15` `.prompt mark sup{font-size:10px}` (sub-11px, and it sets ink-on-dark chips); `vt-val/course/css/lesson-layout.css:19` `.art .one{…border-left:3px solid var(--mark)}` — a 3px accent side-stripe, the banned pattern, on live lesson pages.

**ISSUE-004 — [LOW · visual] One ink side-stripe survives the sweep**

Deployed `vt-val/site/discovery-response-log.html:161`: `.err{…border-left:3px solid var(--text)}`. Ink rather than accent, so the sweep regex (scoped to accent/status hues) passed over it — but it is still a >1px colored side-stripe. Source-verified, not visible in this round's five captures.

## 3 · P2-A — client-intake review step → **PASS**

[client-intake.png](tmp/shots/wave7/client-intake.png):
- **4 blocks, with headers and counts:** `IDENTITY & CONTACT · 3`, `THE MATTER · 3`, `DATES & DEADLINES · 2`, `OUTCOME & NEXT STEPS · 2` — matches `REVIEW_BLOCKS` (`demo/index.html:325`).
- **Summary at top:** `5 rewritten — review these` with five in-page anchors (Your full name · Best way to reach you · Contact details · Any important dates or deadlines? · Anything else we should know?) — count reconciles with the five `rewritten` tags rendered below.
- **Chip-only enums:** "Best way to reach you" shows only Phone call / Email / ONE MORE and "How time-sensitive is this?" only the four time chips; no duplicate text inputs, with the stated rule "the chips are the single control for this answer" (`demo/index.html:349-352`).
- **Sticky action bar:** present (`← Back` + `Build the firm summary →`, top hairline). Stickiness verified in source — `#s-review .actions{position:sticky;bottom:0;z-index:var(--z-actions,9)}` (`demo/index.html:40`). Pixel caveat: a full-page capture renders a sticky bar in flow (y≈1686), so the *pinned* state is not visible in this shot. Code-verified, not pixel-verified.

## 4 · P3 — landing baseline → **PASS**

[landing.png](tmp/shots/wave7/landing.png):
- **Originals 2×2, equal density:** four tiles, two columns, two rows; each row's tiles are height-matched with equal 3-line descriptions (`app/src/styles.css:316` `.cards-2col{grid-template-columns:repeat(2,1fr)}`; deployed `vt-val/site/index.html:59`).
- **Link rows on one baseline:** within every row the mono link strips sit at identical y (y≈683 for row 1, y≈878 for row 2 of originals; y≈1286 / 1509 in the 3-col contract grid) — `margin-top:auto` on `.tile-links` (`styles.css:386`).
- **Single accent rule under h1:** one 2px × 56px accent rule; no stacked hairline (no duplicate `.rule` + `header{border-bottom}` in this family).

---

## Gaps (what I could not verify)

1. **No cite-check before-state.** `tmp/shots/wave0/base-cite-check.png` captured an empty table (auto-run script did not render rows in the baseline run), so the wave7 image cannot be diffed against a true pre-fix baseline; the "before" rests on the plan's documented state.
2. **No interaction testing this round** — no browser/exec tool was available in this session, so chip-click → tag flip → summary increment, anchor jump, and the pinned action bar were verified in source only, not exercised. Everything above is pixel- or code-verified; nothing is asserted from memory.
3. **Lesson pages uncaptured** — ISSUE-003 is source-verified only (no lesson-page screenshot in the wave7 set).
4. Deployed-vs-source parity was checked per page (`vt-val/site`, `vt-val/course`); I did not byte-diff the whole build against the live URL. Live text for `/` and `/course/` matches the corresponding builds.

## Recommended fixes, in order

1. Sync the migrated course into the copy that deploys (or make `vt-val/course` the build output of `artifacts/prompting-for-attorneys`), then redeploy and re-capture `/course/` — this closes ISSUE-001 and its own risk register entry.
2. Fix the course lesson-page floor (10px sup, 3px accent rail) in the same commit — ISSUE-003.
3. Decide the tint budget: one tinted surface per table/card list, or none — ISSUE-002.
4. Replace `discovery-response-log` `.err` left rail with a full hairline box — ISSUE-004.

Status:  DONE_WITH_CONCERNS
Session: ver-20261107-r6
Report:  answer text (no write tool in session; parent saves)
Counts:  C/0 · H/1 · M/2 · L/1
Top findings: course P2-B remediation absent from production (dark CTA funnel + `CONTACT →` + second type system live); flag tint exceeded on cite-check (4 rows) and limitations (2 cards)
Gaps:    no usable cite-check baseline (empty wave0 capture); no interaction testing (no browser tool); lesson pages source-verified only