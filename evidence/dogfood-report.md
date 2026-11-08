# Visual Inspector — run aab1079c participant 0

Trail fully read, source cross-checked, and every claim is now pinned to a specific file. Here is the report.

# Dogfood Report — Open Legal Artifacts

**App:** https://arthrod--4075ab70dae211f1929a1607ee4eb77e.web.val.run · **Trail:** `tmp/shots/dogfood/` 01–11, 1280×900 · **Source:** `tmp/open-legal-artifacts/` (`vt-val` = deployed Val Town app, `app/src` = catalog SPA)
**Personas run:** evaluating lawyer (is this credible and precisely worded?) and run-the-code engineer (does the code beat the demo copy?)
**Counts:** blocker 0 · major 2 · minor 7 · nice 3

## Findings

### 1. MAJOR — search silently inherits the last category, producing a false negative
Evidence: [03-search-tabular](<tmp/shots/dogfood/03-search-tabular.png>), [04-empty-state](<tmp/shots/dogfood/04-empty-state.png>)

After clicking **DEADLINES** and then typing `tabular`, the page reads `0 OF 33 · DEADLINES · MATCHES "TABULAR"` and "No matches for ‘tabular’ in Deadlines." The artifact exists — it is in the header nav, top right, as **TABULAR REVIEW**. The only escape offered is **CLEAR SEARCH AND FILTERS**, which destroys the query too. Source confirms it is by design, not a glitch: `applyState({ area: state.area, q: input.value })` in [index.ts](<tmp/open-legal-artifacts/app/src/pages/index.ts>) never drops the area on typing, and the empty state has exactly one action. Shot 04 (`zzzz`) is the good empty state; shot 03 is the harmful one, and the two are textually indistinguishable apart from the category name. A visitor looking for one known artifact can conclude the catalog lacks it — the single worst trust failure for a 33-item index.

### 2. MAJOR — a real 404 is an unstyled dead end
Evidence: [10-404](<tmp/shots/dogfood/10-404.png>)

~8 KB of white page, one 12 px line at top-left, "Open Legal Artifacts — not found", no nav, no search, no back link, no brand. Source: `new Response("Open Legal Artifacts — not found", { status: 404 })` with no content-type in [index.http.tsx](<tmp/open-legal-artifacts/vt-val/index.http.tsx>). The irony: the *hash* 404 is properly designed — `<h1>Not found</h1>` + "← Back to the catalog" — so the product's quality depends on which kind of typo you make. Anyone following a stale link from an email, PDF, or résumé hits the version that looks like a misconfigured server.

### 3. MINOR (systemic) — the brand display face never renders anywhere
Evidence: every shot; wordmark in [01](<tmp/shots/dogfood/01-landing.png>) vs [09](<tmp/shots/dogfood/09-course-lesson.png>)

Three different failure modes for one typeface (see verdict below): landing requests a file that 404s and falls back to system Menlo, course requests a missing file and falls back to JetBrains Mono, and 33 artifact pages have the `@font-face` stripped outright and fall back to JetBrains Mono. Nobody sees broken layout — they see the same wordmark in two different monos across two clicks, which is precisely the "is this one product?" tell a lawyer notices.

### 4. MINOR — the deep link paints the generic hero; nothing confirms it did anything
Evidence: [11-deeplink-contracts](<tmp/shots/dogfood/11-deeplink-contracts.png>) is byte-identical to [01-landing](<tmp/shots/dogfood/01-landing.png>) (both 94,478 bytes)

The filter state is parsed from the hash query and the router always calls `scrollTo(0,0)`, so `#/?area=contracts` applies the filter ~600 px below the fold with no "filtered to contracts" marker, and a recipient of the link sees the standard front page. If the captured link used a path query (`?area=contracts`), it is dropped entirely — `currentQuery()` reads only the hash. That variant would be **major**; I could not settle which form was captured because the trail stores no URLs (gap). Either way the shared-link journey ends in "did that work?"

### 5. MINOR — the back bar is off the content grid
Evidence: [05](<tmp/shots/dogfood/05-citecheck.png>), [07](<tmp/shots/dogfood/07-intake-review.png>), [09](<tmp/shots/dogfood/09-course-lesson.png>)

"← OPEN LEGAL ARTIFACTS" starts at 20 px while every page's content starts at 107–112 px. The left edge is ragged on all inner pages, and the bar is inline-styled `ui-monospace` in [build-site.mjs](<tmp/open-legal-artifacts/deploy/build-site.mjs>) — the one element that sits on 30+ pages is the one element outside the token system.

### 6. MINOR — same artifact, two different shells
Nav **CITE CHECK** renders inside the white catalog chrome (`#/cite-check`); the card's **Interactive demo ↗** opens `/open-artifacts/cite-check/demo/index.html`, which is a different document with a black bar (shot 05). Two implementations of the same demo (`app/src/pages/cite-check.ts` and `site/cite-check.html`) is also two things to keep in sync. For a product whose pitch is "inspectable," which page is the artifact?

### 7. MINOR — course progress is ten faint unlabeled boxes
Evidence: [09](<tmp/shots/dogfood/09-course-lesson.png>)

`00 / 10 complete` next to ten 14×8 hairline rectangles, 14 px from the A / A+ control, all at hairline weight. They have `aria-label="Progress"` but no visible legend, so they read as broken glyphs or as part of the text-size widget. Nothing is broken behind them; it is a legibility miss on the one page that shows a course is finished-able.

### 8. MINOR — pinpoint anchors are ambiguous to the audience that cares
Evidence: [05](<tmp/shots/dogfood/05-citecheck.png>), [06](<tmp/shots/dogfood/06-tab-focus.png>)

Anchor cells read `page 12 198–295` and `section 9.1 98–189` — a page/section followed by a bare character range with no separator or unit. Only the evidence card lower down says "chars 198–295". The artifact's whole claim is precision; this is the field a lawyer will squint at.

### 9. MINOR — the hero eats the fold
Evidence: [01](<tmp/shots/dogfood/01-landing.png>)

By 900 px you get: wordmark, hero, three counts, a ~120 px empty band, a section header, and two card titles clipped at the fold. The search field and the first complete artifact are both below it. For a 33-item catalog whose promise is inspectability, the first screen is all claim and no evidence — and there is no "jump to catalog" affordance.

### 10. NICE — status chip weighting is inverted
Evidence: [05](<tmp/shots/dogfood/05-citecheck.png>)

`MISMATCH` and `NOT_FOUND` are solid black; `UNVERIFIABLE` — arguably the most damaging verdict ("we could not check this") — is a light outline. Also `8 of 10` spells its "of" while `5`, `1`, `2` do not.

### 11. NICE — no social preview
Source-read, not pixels: `<head>` in [index.html](<tmp/open-legal-artifacts/vt-val/site/index.html>) has a title and description but no `og:image`, `og:title`, or `twitter:card`. Pasted into Slack or an email signature — the actual distribution path for a reputation site — it renders as a bare URL.

### 12. NICE — Back exits the site instead of undoing the filter
Source-read: filters are written with `history.replaceState`, so pressing Back after filtering leaves the catalog rather than returning to "All". Defensible, but on a page whose state is entirely in the URL it is surprising.

## The 404 resource verdict

**Four console 404s = two missing resources, re-requested per document. Nothing else is broken: no images (the landing has no `<img>`), no CSS, no JS — every stylesheet is inline.**

| # | Resource | Why it 404s | Pages affected |
|---|----------|-------------|----------------|
| 1 | `/fonts/DepartureMono-Regular.woff2` | Declared in the landing's inline `@font-face`; the Val Town handler has no `/fonts` route and `vt-val/` has no `fonts/` directory, so it falls to the bare-text 404 | `/` |
| 2 | `/course/fonts/DepartureMono-Regular.woff2` | `course/css/fonts.css` points at `../fonts/…`, but `vt-val/course/fonts/` contains **only** `LICENSE-departure-mono.txt` | `/course/` |
| 3 | `/favicon.ico` | No `<link rel="icon">` anywhere in the deployment, so the browser requests the default; the handler 404s any unknown path | every document (incl. the 404 page) |

Verified directly: a prior capture's network record for this same val shows `…/fonts/DepartureMono-Regular.woff2 :: net::ERR_ABORTED` plus two "Failed to load resource … 404" entries on `/` ([critique-console-raw.json](<tmp/shots/critique-console-raw.json>)), and the four-shot trail matches that shape (2 documents × font + favicon). The per-page split for *this* run is inferred — the trail kept no console log.

Fourth mechanism, not a 404 but the same defect: 33 artifact pages don't even request the font. [build-site.mjs](<tmp/open-legal-artifacts/deploy/build-site.mjs>) strips `@font-face … Departure Mono` from any page over Val Town's 80 KB/file cap, and the source comment says so: *"drop the ~30KB base64 Departure Mono woff2; --font-mono falls back to JetBrains Mono / ui-monospace."* So the brand face is absent from 100% of the deployed site in three different ways, and the console noise is the only symptom a visitor can't see.

## What held up (no finding)

- **Filter counts are honest.** `DEADLINES` = `3 OF 33` with exactly the three deadline artifacts (Entity Compliance Calendar, Limitations Radar, Renewal Calendar); `0 OF 33` on a miss. Chips carry `aria-pressed`.
- **Focus is visible, both surfaces.** The Export button in [06](<tmp/shots/dogfood/06-tab-focus.png>) shows a clean 2 px ring at 2 px offset against the page, and the search input in [03](<tmp/shots/dogfood/03-search-tabular.png>) keeps focus, caret, and query across the 150 ms re-render (`applyState` refocuses and restores selection). Keyboard path works.
- **Chip feedback is real, not janky.** Clicking `Phone call` in [08](<tmp/shots/dogfood/08-intake-chip-click.png>) flips the chip fill, flips the tag `rewritten → draft accepted`, drops the count `5 → 4`, and removes the item from "review these" — matching `summaryLineHTML` in the source.
- **The disclaimers are doing their job.** "deterministic simulation of the live app — no LLM, no network · all data fictional" and cite-check's "(fictional)" are exactly the attorney-advertising boundary the product needs.
- **Lesson substance is strong** (source-read): each lesson has weak/strong prompts with numbered change marks, a per-change rationale, a check question with per-option feedback, and a source link; 57 min totals match "about an hour."
- The "Claude for Legal gallery" claim is real, not invented — Anthropic shipped that gallery on 28 Oct 2026 ([unite.ai](https://www.unite.ai/anthropic-adds-ready-to-use-legal-artifacts-gallery-to-claude)).

## Top 3 fixes

1. **Serve the brand face and an icon, once, properly.** Copy `DepartureMono-Regular.woff2` into `vt-val/fonts/` and `vt-val/course/fonts/`, add a `/fonts/*` (and `/favicon.svg`) route to the handler, add `<link rel="icon">` to every head, and stop stripping the font in `build-site.mjs` (host it, don't inline 30 KB base64). Kills all four console errors and unifies the wordmark.
2. **Make a miss unmissable when the category is the culprit.** When `results.length === 0` and an area is active but All has matches: "3 matches in all categories → show them", one click, query preserved. Cheapest single change to perceived completeness of the catalog.
3. **Replace the plain-text 404 with the catalog shell**, and make filtering deep links land on their results (`scrollIntoView` the results block + a visible "filtered: contracts ×" line). That closes both dead-end journeys — the typo'd URL and the shared link.

## Gaps

No browser in this run: no clicks, so `export report.md/json`, downloads, and the `prompts` ZIP are unverified; no mobile/tablet capture; lesson *rendering* unverified (shot 09 is the course index, not a lesson — lesson quality above is source-read only); no load timings; capture URLs weren't stored, so the deep-link form and the exact 404 path are unknown.

Status: DONE_WITH_CONCERNS
Session: dogfood-20261108 (trail `tmp/shots/dogfood/`, 01–11)
Report: this reply (parent saves it)
Counts: B/0 · Maj/2 · Min/7 · Nice/3
Top findings: search inherits the category and returns a false negative on a real artifact; a real 404 is an unstyled text dead end; the brand mono face is missing site-wide via three separate mechanisms
Gaps: no interactive click-through (exports/downloads), no mobile viewport, no lesson render, no timings, capture URLs unrecorded