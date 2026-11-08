# Visual Inspector — run 7297b763 participant 4

I have the pixels, the shipped source, and live cross-checks — enough to adjudicate both tracks. Three things conflict, so I'll be explicit about which evidence I trust.

# Dogfood Report: open·legal·artifacts — Round 7 (Visual Inspection)

| Field | Value |
|-------|-------|
| **Date** | 2026-11-08 |
| **App URL** | https://arthrod--4075ab70dae211f1929a1607ee4eb77e.web.val.run |
| **Session** | visual-r7 (Track A catalog UX + Track B content/language) |
| **Scope** | 404 handling, catalog search/category interaction, demo-page nav; content/lexicon on 7 demo pages |
| **Evidence root** | `tmp/open-legal-artifacts/tmp/shots/` → `trackA/` (5 files), `trackB/` (7 files) — all 12 verified present |

**Evidence method (honest tiering).** No browser in this run: I could not drive interactions myself. Every finding below rests on (a) pixels I read in the 12 captures, and/or (b) the shipped source in `tmp/open-legal-artifacts/vt-val/`, and/or (c) live fetches I performed this turn. Where those three disagree I say so and name which one I trust.

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 2 |
| Medium | 9 |
| Low | 9 |
| **Total** | **20** |

## Per-track verdict

**Track A (catalog UX): FAIL** — 1 of 3 acceptance items met as specified.
- 404 on-brand + prefilled search + suggestions: **PARTIAL** — the SPA variant does all three; the server variant has no nav and no prefilled field; the two are different pages.
- Search no longer inherits category: **FAIL** — see ISSUE-001.
- Nav Catalog/Demo/Repo on demo pages, grid-aligned: **PASS on presence** (all 7), **FAIL on alignment** (20px left offset) and inconsistent with the catalog header.

**Track B (content/language): FAIL** — 2 of 4 acceptance items met.
- Zero raw machine keys: **FAIL** — `matter.updatedAt`, `nextDeadline:`, `nextStep:`, `owner:` on matter-board; `near-verbatim` on cite-check; live cite-check still serves `not_found`.
- Unified verdict vocabulary: **PARTIAL** — legend shipped and printed once, but renewal-calendar contradicts its own legend with "CONFIRMED".
- Caveat once per page (not 8×): **PASS** (pixel-verified on cite-check: one sentence, then the legend once).
- Ink contract (failures loudest): **PASS where visible** — black-filled "Past deadline — never filed" (limitations-radar) and black-filled CRITICAL (matter-board). cite-check's NOT FOUND rows fall below the fold → unverified there.

## Issues

### ISSUE-001: Search still inherits the active category — cross-area term is not found
| Field | Value |
|---|---|
| **Severity** | high · **Category** | functional / ux |
| **URL** | `/#/deadlines` then type "tabular" · **Repro Video** | N/A (static capture) |

**Description.** With the **DEADLINES** filter pressed, typing `tabular` yields `0 OF 33 · DEADLINES · MATCHES "TABULAR"` and an empty state. The term lives in the open set but outside Deadlines, so the acceptance criterion ("type a term that lives in another area → it's found now") is not met. Recovery requires a second click on `1 MATCH IN ALL CATEGORIES → SHOW THEM`. Source corroborates: the input handler merges `q` into existing state without clearing `area` (only the filter buttons set `area` explicitly).
**Nuance I must state:** the capture proves this for the *deeplink* path. No capture exercises the chip-click-then-type path, so I cannot say whether that path auto-clears.
**Repro.** 1. Open `/#/deadlines`. 2. Type `tabular` in the search field. 3. **Observe:** 0 of 33, in-category empty state instead of the match. — `trackA/07-deeplink-escape.png`

### ISSUE-002: matter-board still prints raw field keys on every diff row
| Field | Value |
|---|---|
| **Severity** | high · **Category** | content |
| **URL** | `/a/matter-board` · **Repro Video** | N/A |

**Description.** Every change row is labelled with an internal field path: `2026-11-05T11:30:00Z · matter.updatedAt` (5 visible rows), then `nextDeadline:`, `nextStep:`, `owner:`, `notes:`. Verdict vocabulary was addressed here; the field-key leak was not. This is exactly the "zero raw machine keys" criterion, violated 5× on one screen. Values are also raw handles (`j.moreau → t.nguyen`).
**Repro.** 1. Open `/a/matter-board`. 2. Read the rows under "WHAT CHANGED SINCE THE LAST SNAPSHOT". — `trackB/matter-board.png`

### ISSUE-003: Two different 404 pages for the same mistake
| Field | Value |
|---|---|
| **Severity** | medium · **Category** | visual / ux / consistency |
| **URL** | `/a/nope-404` vs `/#/a/cite-chek` · **Repro Video** | N/A |

**Description.** `/a/typo` → a standalone page with the wordmark only (**no nav at all**), no inline search field (a "Search the catalog for …" link instead), 4 suggestions with taglines, `GET /a/cite-chek · 404 · text/html` diagnostics. `#/a/typo` → full SPA chrome with the light 5-item nav, a real prefilled search input, 3 suggestions with no taglines, `404 · #/A/CITE-CHEK · CATALOG V33 ARTIFACTS`. Header grids also differ: the server page's wordmark sits at x≈90 while its content column starts at x≈250. Two implementations (`vt-val/notfound.ts`, `vt-val/site/index.html`) have drifted.
**Repro.** Open both URLs; compare nav, search affordance, suggestion count. — `trackA/val-404.png`, `trackA/404-spa.png`

### ISSUE-004: Header nav is two different components across the product
| Field | Value |
|---|---|
| **Severity** | medium · **Category** | visual / consistency |
| **URL** | `/a/*` vs `/#/*` · **Repro Video** | N/A |

**Description.** Demo pages carry the new black `CATALOG · DEMO · REPO ↗` bar; the catalog and the SPA 404 still carry the old light 5-item bar (`CATALOG · CITE CHECK · DEVIATION BOARD · CHRONOLOGY · TABULAR REVIEW`). Clicking "Catalog" from the black bar lands the user in a page with a different header — height, colour, item count and font all change.
**Repro.** Open `/a/cite-check` then click "Catalog". — `trackB/cite-check.png`, `trackA/404-spa.png`

### ISSUE-005: Black navbar's inactive links fail AA contrast
| Field | Value |
|---|---|
| **Severity** | medium · **Category** | accessibility |
| **URL** | all `/a/*` pages · **Repro Video** | N/A |

**Description.** The new bar is `background:#0a0a0a` with inactive links `color:#6b6b6b` at `font-size:11px` (inline, `cite-check.html:202`). Computed ratio **3.71:1**, below the 4.5:1 AA threshold for small text. The same grey on the old light bar computes 5.11:1 — the bar was darkened without re-deriving the muted token.
**Repro.** Inspect `CATALOG` / `REPO ↗` on any demo page. — `trackB/renewal-calendar.png`

### ISSUE-006: limitations-radar duplicates one rule label and orphans another
| Field | Value |
|---|---|
| **Severity** | medium · **Category** | content / visual |
| **URL** | `/a/limitations-radar` · **Repro Video** | N/A |

**Description.** CLM-102 prints the identical line twice: `NY · breach of contract (written) · limitations period` / `NY · breach of contract (written) · limitations period`. Source confirms the cause: `ruleLabel()` maps distinct rule ids to the same string and the renderer does not dedupe. CLM-101 shows the inverse failure — an orphan `Filing margin` chip carrying no value, because the `MARGIN` pseudo-rule is painted as if it were a rule.
**Repro.** Open the page, read the CLM-101 and CLM-102 cards. — `trackB/limitations-radar.png`

### ISSUE-007: renewal-calendar's stats contradict the legend printed directly below them
| Field | Value |
|---|---|
| **Severity** | medium · **Category** | content |
| **URL** | `/a/renewal-calendar` · **Repro Video** | N/A |

**Description.** Stat labels read `CONFIRMED — EXACT DATE`, `AMBIGUOUS — FLAGGED, CONSERVATIVE READING`, `UNVERIFIED — NEEDS REVIEW`, `OVERDUE`, `COVERAGE GAPS`. The legend immediately beneath declares the canonical set as `VERIFIED / SUPPORTED / UNVERIFIED / NOT FOUND / CONFLICT`. "CONFIRMED" is not in the vocabulary, yet it is the loudest label on the page — the reader is told two different naming systems on one screen. cite-check compounds it by talking about what is "never reported as confirmed".
**Repro.** Open the page, compare PORTFOLIO STATE labels to the legend under the strip. — `trackB/renewal-calendar.png`

### ISSUE-008: Stat strips break their grid (empty trailing cell, orphan row)
| Field | Value |
|---|---|
| **Severity** | medium · **Category** | visual |
| **URL** | `/a/renewal-calendar`, `/a/matter-board` · **Repro Video** | N/A |

**Description.** renewal-calendar: 4 cells in row 1 plus an empty trailing cell, then `1 COVERAGE GAPS` orphaned into row 2 at roughly half width — the strip looks truncated rather than designed. matter-board: same pattern, one large empty cell swallowing the right third of the strip.
**Repro.** Open either page, look at the summary strip. — `trackB/renewal-calendar.png`, `trackB/matter-board.png`

### ISSUE-009: Kebab-case verdict qualifiers still on screen in cite-check
| Field | Value |
|---|---|
| **Severity** | medium · **Category** | content |
| **URL** | `/a/cite-check` · **Repro Video** | N/A |

**Description.** Badges read `VERIFIED verbatim`, `VERIFIED near-verbatim — case/punctuation only`; the stat card repeats `VERIFIED — NEAR-VERBATIM`. A caps canonical glued to a lowercase kebab enum is neither a sentence nor a key — it is a machine value wearing a label. This is the remaining instance of the class the track set out to remove.
**Repro.** Open the page, read the VERDICT column and the SUMMARY strip. — `trackB/cite-check.png`

### ISSUE-010: cite-check ANCHOR column too narrow — text collides with the row divider
| Field | Value |
|---|---|
| **Severity** | medium · **Category** | visual |
| **URL** | `/a/cite-check` · **Repro Video** | N/A |

**Description.** The anchor value wraps to seven lines in a ~90px column (`Deposition / of Sandra / Okafor / (Jan. 14, / 2026) · / page 12 · / chars 198– / 296 ↗`) and the final line sits on top of the row's dotted divider — the quote is the app's whole point and it is the least readable thing on the page.
**Repro.** Open the page, read the Q1 row's ANCHOR cell. — `trackB/cite-check.png`

### ISSUE-011: The live deployment is not the build that was captured
| Field | Value |
|---|---|
| **Severity** | medium · **Category** | content / process |
| **URL** | `/a/cite-check` · **Repro Video** | N/A |

**Description.** My live fetch this turn returns `exact / normalized / fuzzy / not_found classification` and "9 quotes"; the round-7 capture shows `verbatim / near-verbatim / fuzzy / not-found` and "10 quotes". So the humanized-lexicon fix exists in the captured build but **the shipped URL still serves the snake_case key**. Track B's "zero raw machine keys" claim therefore fails against the artifact a user actually reaches. Either the fix is unmerged/un-deployed, or two builds are in play.
**Repro.** Fetch `/a/cite-check` and read the lede paragraph. — live fetch this turn + `trackB/cite-check.png`

### ISSUE-012: SPA 404 suggestions are raw slugs, with stray bullets
| Field | Value |
|---|---|
| **Severity** | low · **Category** | content / visual |
| **URL** | `/#/a/cite-chek` · **Repro Video** | N/A |

**Description.** Recovery offers `CITE-CHECK • TABULAR-REVIEW • FACT-CHRONOLOGY` — the kebab slugs rather than the catalog's titles ("Cite check", "Tabular review", "Fact chronology"), each rendered with a leading bullet although it is a link row (`.detail-links` never resets `list-style`). The server variant gets titles-adjacent treatment (slug + tagline) but the SPA one does not.
**Repro.** Open `/#/a/cite-chek`. — `trackA/404-spa.png`

### ISSUE-013: Demo navbar is not grid-aligned with the content column
| Field | Value |
|---|---|
| **Severity** | low · **Category** | visual |
| **URL** | all `/a/*` pages · **Repro Video** | N/A |

**Description.** The navbar uses `max-width:1100px` with `padding:8px 20px`, putting the wordmark at x≈110 while `.wrap` content starts at x≈130 — a 20px left step visible on every demo page. Right edges coincide, so the bar looks subtly tilted relative to the page.
**Repro.** Open any demo page; compare the wordmark's left edge with the kicker's. — `trackA/08-demo-navbar.png`

### ISSUE-014: 404 pages show routing/diagnostic strings
| Field | Value |
|---|---|
| **Severity** | low · **Category** | content |
| **URL** | both 404 variants · **Repro Video** | N/A |

**Description.** SPA: `No page at #/a/cite-chek` and footer `404 · #/A/CITE-CHEK · CATALOG V33 ARTIFACTS`. Server: `GET /a/cite-chek · 404 · text/html`. Hash-route syntax and HTTP metadata are developer output on a user-facing page; the user only needs "that page doesn't exist".
**Repro.** Open either 404. — `trackA/404-spa.png`, `trackA/val-404.png`

### ISSUE-015: Global search is placed inside a section heading
| Field | Value |
|---|---|
| **Severity** | low · **Category** | ux / information architecture |
| **URL** | `/#/` · **Repro Video** | N/A |

**Description.** The search field + area chips render directly under the `OPEN REIMPLEMENTATIONS` heading, after the four ORIGINALS tiles — yet the counter it drives reads `of 33`, i.e. the whole open set. Users must scroll past the originals to reach a search that is not scoped to where it appears.
**Repro.** Open the catalog, scroll to the search bar. — `trackA/06-search-autoclear.png`, `trackA/07-deeplink-escape.png`

### ISSUE-016: Singular/plural errors in generated counts
| Field | Value |
|---|---|
| **Severity** | low · **Category** | content |
| **URL** | `/a/matter-board`, `/a/playbook-deviation-board` · **Repro Video** | N/A |

**Description.** `1 MATTERS ADDED` (count 1, plural noun); `Board built: 8 clauses · 4 deviate · 2 deal-breaker · 1 unclassified` ("2 deal-breaker"). The counters are template-built without the `n===1` branch the search empty state already implements correctly.
**Repro.** Open both pages. — `trackB/matter-board.png`, `trackB/playbook-deviation-board.png`

### ISSUE-017: Two page-header systems in one demo set
| Field | Value |
|---|---|
| **Severity** | low · **Category** | visual / consistency |
| **URL** | `/a/matter-board`, `/a/renewal-calendar` vs the other 5 · **Repro Video** | N/A |

**Description.** Five pages use a sans 40px h1 with a `OPEN-LEGAL-ARTIFACTS · DETERMINISTIC CORE` kicker. matter-board and renewal-calendar use a mono ~22px letterspaced headline under an `open-legal-artifacts.exe` wordmark, which also renders with an apparent doubled space (`Matter  board`) from the mono tracking. Same family of pages, two typographic voices.
**Repro.** Compare `matter-board` and `cite-check` headers. — `trackB/matter-board.png`, `trackB/cite-check.png`

### ISSUE-018: Sub-11px type still declared and reachable
| Field | Value |
|---|---|
| **Severity** | low · **Category** | visual / accessibility |
| **URL** | `/a/limitations-radar` · **Repro Video** | N/A |

**Description.** `.badge small{font-size:10px}` (`limitations-radar.html:180`) is emitted whenever `mapToCanonical` maps a status (`:258`). **Not observed rendered** on the captured cards — both visible badges took the unmapped fallback — so this is a latent violation of the ≥11px floor, not a visible one. I am flagging it as declared-and-reachable, not as seen.
**Repro.** Read the stylesheet and the badge builder. — source only

### ISSUE-019: Count fragments mix grammatical roles
| Field | Value |
|---|---|
| **Severity** | low · **Category** | content |
| **URL** | `/a/playbook-deviation-board` · **Repro Video** | N/A |

**Description.** `8 clauses · 4 deviate · 2 deal-breaker · 1 unclassified` — a noun, a verb, and two adjectives in one parallel list. Reads as debug output rather than a summary sentence.
**Repro.** Open the page, read the line beside the buttons. — `trackB/playbook-deviation-board.png`

### ISSUE-020: Status sentences diverge between pages (no legend coverage)
| Field | Value |
|---|---|
| **Severity** | low · **Category** | content |
| **URL** | `/a/limitations-radar` · **Repro Video** | N/A |

**Description.** Statuses read `Filed on time` / `Deadline ahead — not yet filed` / `Past deadline — never filed` — good, human prose, but no legend ties them to the canonical set the other pages advertise, so "never filed" and "NOT FOUND" are indistinguishable concepts to a reader moving between artifacts.
**Repro.** Open the page, read the three card badges. — `trackB/limitations-radar.png`

## Verified good (positive signals, not absences)

- **Caveat discipline holds.** cite-check prints the checked/could-not-check sentence exactly once, then the verdict legend once — not 8×. Source has one emission site (`cite-check.html:1053`).
- **Ink contract holds where failure is on screen.** `Past deadline — never filed` and `CRITICAL` are the only black-filled chips on their pages; mild/ok states are outlined. Failure is unmistakably the loudest element.
- **No side-stripes.** Tiles use a 4px *top* accent stripe; the only left border is fact-chronology's timeline rail, which is a rail, not a status stripe.
- **Type floor mostly respected** in the SPA stylesheet (12px labels, 13px nav, 15px brand); the single 10px declaration is ISSUE-018.
- **Dark mode is legible.** tabular-review was captured in dark theme (`Theme: auto`); yellow underline, chips and muted text all read cleanly — no dark-mode defect found.
- **404 recovery exists in both variants** and the SPA's field is genuinely prefilled with the attempted slug (`cite-chek`), which is the right instinct.

## Gaps (what I could not verify, and why)

1. **No browser in this run** — I could not reproduce ISSUE-001's chip-click path, could not click the escape button, could not read console errors, could not test focus order or responsive widths. Those checklist items are untested this round, not passed.
2. **Global empty state `/ ?q=zzz` unverified** — `fetch_content` returned `invalid_response` for both `/?q=zzz` and `/a/nope-404`, and the hash route renders client-side, so no server text exists to read. The only empty-state pixels I have are the *category-scoped* one in ISSUE-001.
3. **cite-check's hard-failure ink** — NOT FOUND rows are below the fold in the capture; I verified the ink contract on limitations-radar and matter-board instead.
4. **ISSUE-011 drift is unresolved by design** — I can prove live ≠ captured, not which one is intended. If the deployed build is authoritative, live cite-check fails the zero-machine-key gate outright.

## Overall verdict

**FAIL** — both tracks still miss their headline acceptance criterion: search remains category-scoped in the deeplink path (ISSUE-001), and raw machine keys are still on screen (ISSUE-002, ISSUE-009, ISSUE-011). Nothing is critical or blocking, the caveat/ink/type work from round 6 has genuinely landed, and each failure is a single focused change — but "zero" and "found now" are not yet true, and the live deployment lags the captured build.

---

Status: DONE_WITH_CONCERNS
Session: visual-r7
Report: inline above (per instruction — parent saves; no file written, no browser available this run)
Counts: C/0 · H/2 · M/9 · L/9
Top findings: search still inherits category (1 extra click to escape); matter-board prints `matter.updatedAt`/`nextStep:`/`owner:` on every diff row; live cite-check still serves `not_found` while the capture shows `not-found` — deploy drift.
Gaps: no browser (chip-path, console, focus, responsive untested); `/ ?q=zzz` global empty state unfetchable; cite-check NOT FOUND ink below fold.