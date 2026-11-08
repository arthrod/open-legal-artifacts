# A07 — Visual critique: Regulatory horizon scan (OURS vs _to_verify)

- **Pair**: OURS `tmp/open-legal-artifacts/open-artifacts/regulatory-horizon-scan/demo/index.html` (served at `/open-artifacts/regulatory-horizon-scan/demo/index.html`) vs THEIRS `_to_verify/Regulatory horizon scan (Copy).html` (2.6 MB single-file export, served at `/_to_verify/Regulatory%20horizon%20scan%20%28Copy%29.html`).
- **Local server**: http://127.0.0.1:8923/ (both returned 200).
- **Method**: headless Chrome (CDP over Node WebSocket, no external deps) at 1280×900 and 390×900; full-page PNG captures in multiple interaction states; DOM text extraction of their 2.6 MB bundle; functional probe of our demo (clicks, weight edits, re-run) executed in-page. Stance per batch brief: adversarial against OURS, charitable to THEIRS.
- **Screenshots** (workspace root, `tmp/shots/to-inspect/regulatory-horizon-scan/`): `ours-default`, `ours-diff`, `ours-breakdown`, `ours-error`, `ours-mobile`, `theirs-default`, `theirs-all`, `theirs-detail`, `theirs-profile`, `theirs-mobile`.

## 1. First impression (1280×900)

**THEIRS** opens as a finished compliance product: left "Scans" rail, header with live counters ("60 developments · 50 need attention · Scanned 19 Oct 2026 · 1 of 54 checked · Refresh due"), a **graphical horizon timeline** (Jul 2026 → Jan 2028, month ticks, jurisdiction lanes EU / New York / UK / California / Other US states, a "Today" marker, one dot per development), a filter chip row (Impact, Proposed→in force, Passed, No date ahead, Next 90 days, New or changed, By jurisdiction, By topic), and a top-10 list of development cards with impact chips and relative dates ("in 24 days", "13 days ago"). `theirs-default.png`, `theirs-all.png`.

**OURS** opens as a well-typeset instrument: mono wordmark, yellow rule, serif headline, a 180px **raw JSON textarea** as the primary input, then a fieldset grid of rubric weights, a 6-row ranked table, a text-list "timeline", an empty diff section, and a disclaimer footer. It reads as an engineer's audit tool, not a product a compliance team would sit in front of. `ours-default.png`.

Verdict on first impression: **theirs wins decisively**. Ours looks deliberate and coherent, but it presents a 7-item toy feed next to their 54-development live corpus.

## 2. Where OURS loses (evidence-backed)

1. **Data scale and realism are embarrassing next to theirs.** Our worked example is 7 feed items → 6 rendered rows (probe: `document.querySelectorAll('#scanTable tbody tr').length === 6`); theirs ships 54 developments with **full statute-level citations** per row ("Regulation (EU) 2024/1689, Article 5(1)(ba) and (bb), added by Regulation (EU) 2026/1744", "SB 1119 (2026), Chapter 190, Statutes of 2026"). Our titles are generic fictions ("EU Umbrella Data Regulation 2026"). On screen, our scan section looks like a stub.
2. **Citations are collected but never shown.** Our feed items carry `source`, `provenance`, `link` (verified in `demo/example.js`), but `renderScan()` emits no source/citation column — provenance only leaks into score-cell flags. For a regulatory tool, per-row source provenance on screen is table stakes; theirs displays it on every row. This is our most damning gap because the data is *already in the feed* and we drop it at render time.
3. **No horizon visualization.** Our "Timeline" is a bare text `<ul>` with upcoming/past/undated labels (`ours-default.png` bottom). Theirs renders a multi-lane month timeline with a Today marker and per-jurisdiction rows — the single most memorable element of their page. A product named *horizon scan* whose horizon is a bulleted list has a naming problem.
4. **No filters, no search, no segments.** Theirs: eight filter dimensions plus "To decide 50 / All 55 / Unchecked 53" tabs plus "Show all 54". Ours: none; the only ways to narrow are editing JSON or weights.
5. **No workflow.** Theirs models the actual compliance loop: checked/unchecked per item, owner assignment (named reviewers), "Mark checked against source", reviewer notes, relevant/not-relevant with a reason that "the next refresh reads", an action plan, "Brief the business" → internal briefing export to **Word**, per-item "Ask Claude". Ours has none of this — no per-item state, no notes, no assignment, no briefing output. Our only outputs are CSV and a Markdown digest.
6. **No persistence or scan lifecycle.** Theirs (even as a static export) stages a scans list, scan history, refresh cadence and an explicit cost model ("About $2 a scan"); ours resets on reload and offers no concept of a saved scan.
7. **Primary input UX is a JSON textarea.** For the stated audience (compliance/legal), a JSON textarea with a "Run scan" button is a developer fixture. Theirs' input surface is "What should Claude watch?" + profile toggles (sectors, jurisdictions, activities) that visibly re-score the scan.
8. **Table density and mobile.** 10 columns in ~1180px is cramped at desktop (`ours-default.png`); at 390px the table survives only via horizontal pan inside `overflow-x:auto` (`ours-mobile.png`) — usable but punishing. Theirs collapses cleanly to one column with the timeline intact (`theirs-mobile.png`).
9. **Scoring surface is opaque-by-default.** "Why this score" is a collapsed `<summary>breakdown</summary>` — one extra click before anything is auditable. Their impact chip (High/Medium/Low) is coarser, but their per-card "Covers X and Y · key date in N days" line explains *relevance* in plain language at first paint, which is what a business reader actually wants first.

## 3. Where OURS holds (only undeniable, probed)

1. **Auditable, editable scoring — the one thing theirs does not show anywhere in its exported DOM.** Every score point renders as `factor +points — rule (note)` in the breakdown list (`ours-breakdown.png`), and the rubric is rules-as-data: probe verified editing jurisdiction weight 30→300 and clicking "Apply weights & re-run" changed the top score 95→100 and re-ranked rows (FCC item rose). Theirs re-scores when profile toggles switch, but no rubric, weights, or per-point breakdown is visible in the exported DOM — its scoring is a black box on the page.
2. **Diff vs previous snapshot.** Clicking "Diff vs previous snapshot" produced ＋/−/↻ field-level changes with from→to styling (`ours-diff.png`). Theirs has a "New or changed" filter but no visible structural diff of feed changes.
3. **Dedupe and coverage gaps as first-class UI.** Probe confirmed the dedupe chip ("ca-ccpa-amend-dup → ca-ccpa-amend") and coverage-gap chips ("high · jurisdiction UK", "low · topic security"). Nothing comparable appears in their DOM.
4. **Error path.** Malformed input (`{oops`) yields a visible inline "Input error: …" (`ours-error.png`). Necessary but not a differentiator.
5. **Footprint.** Ours: ~16 KB HTML + small core/example/CSS; theirs: 2.6 MB single file. Factual, though it reflects the export format as much as engineering.
6. **Determinism claim is real on our side** (no LLM in scoring; the demo provably re-scores deterministically). Theirs' pipeline is Claude-in-the-loop by design — with that come the per-refresh cost and non-reproducibility, which they themselves surface ("About $2 a scan"). This is our genuine architectural argument; the demo just buries it in a footer.

## 4. Verdict

**Theirs 8.5 / ours 4.5.** As a visual/UX artifact theirs is a different weight class: horizon timeline, filters, reviewer workflow, brief-to-business, per-row citations, realistic 54-item corpus. Ours wins exactly one axis — transparent, editable, per-point auditable scoring with feed diffing — and then under-sells even that: it hides provenance data it already holds, renders its namesake horizon as a text list, and fronts the worst possible input control. Fix list, in order of leverage: (1) render `source/provenance/link` as a citation column; (2) replace the text timeline with a real lane chart; (3) grow the worked example to 30+ items with statute-grade citations; (4) add filters/tabs over the ranked table; (5) surface breakdown content by default or as side panel; (6) add a profile editor (jurisdictions/topics toggles) that re-runs the deterministic core — that would match their flashiest interaction while keeping our auditability edge.

## 5. Not verified / out of scope

- THEIRS' Profile panel could not be opened via a `button` selector (`theirs-profile.png` is a re-load of default; the export is a view-only sample — "This scan cannot be changed"), so their profile-toggle re-scoring was **not** observed live; it is asserted by in-page copy ("The scan re-scores as you switch") and marked inference here.
- OURS' CSV/Markdown downloads were not opened (buttons exist; download function inspected, not executed).
- No console-error sweep on either side; no keyboard/screen-reader pass (both use real buttons/details/summary — structural impression only).
- Cross-browser rendering, print, and dark-mode not tested.
