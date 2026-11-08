# A06 — Visual critique: Playbook deviation board

**Pair:** OURS `tmp/open-legal-artifacts/open-artifacts/playbook-deviation-board/demo/index.html` vs THEIRS `tmp/open-legal-artifacts/_to_verify/Playbook%20deviation%20board%20%28Copy%29.html`
**Served at:** `http://127.0.0.1:8923/` (both sides HTTP 200)
**Date:** 2026-11-08 · **Stance:** adversarial against OURS, charitable to THEIRS
**Verdict: THEIRS wins decisively.** Theirs is a working multi-review legal product (matrix board, docx renderer, decision workflow, exports, dark mode, a11y). Ours is a clean but static single-example exhibit with raw enum labels surfacing in the UI. Ours is outclassed on every interactive dimension; its only defensible ground is the deterministic, traceable classification story.

## Method

Headless Chrome 156 via CDP (private instance, port 9444, DPR 2; 1440×900 desktop, 390×844 mobile, `prefers-color-scheme` and `data-theme` dark/light states). Screenshots in `tmp/shots/to-inspect/playbook-deviation-board/` (`<side>-<state>.png`). Evidence tiers marked: **[V]** = vision-model analysis of the actual screenshot; **[D]** = DOM probe in live page (geometry/computed styles/text); **[C]** = code reading of the artifact source. No repo files modified.

**Contamination note (method integrity):** a concurrent duplicate critique run was discovered driving the *same* Chrome debug port (shared tab; foreign files `ours-initial/theirs-initial/theirs-full/theirs-cell` appeared in the shots dir at 01:59–02:13). All THEIRS key states were re-captured on a fresh private Chrome instance; behavior probes reproduced identically (auto-open sample review, 8 contracts, filter → "7 of 8 contracts", contract view 5 issues). Foreign files left in place but are not cited as evidence.

## What each side actually is

**OURS [C/D]** — single-page editorial report: kicker + H1 + lede, a 6-cell counts strip, a 4-column kanban of 8 clause cards (compliant 1 / deviates 4 / deal_breaker 2 / unclassified 1), an evidence section (7 blocks: quote, reason, suggested redline, collapsible decision trace with rule chain, similarity vs thresholds, char span, routing), two export buttons (board.md / output.json). Deterministic core (`core/core.js`) runs in-browser; playbook parsed by a dependency-free YAML parser. No other interaction exists on the page.

**THEIRS [C/D/V]** — full app: reviews list → review → board → contract view. Sample review "Tessamere Group supplier contracts" auto-opens: 8 realistic contracts (e.g. "Draycombe Wex Software GmbH — Software Licence and Support Agreement.docx · their paper · Federal Republic of Germany"), 10 playbook positions as board columns (each column header carries the firm's standard as tooltip: "Our standard: The supplier's total liability … capped at no less than 150% of the fees…"), cells hold chips (Deviation/Fallback/Standard/Missing, risk levels, "Needs review", "Waiting for a decision"). Toolbar: search + filter chips with live counts; live finding line ("15 deviations across 8 contracts. 1 clause needs review. 10 waiting for a decision."). Contract view: paginated **docx renderer** (7 pages, zoom, find-in-document, "Word layout is approximate" caveat), issues ranked most-serious-first with quotes, cross-reads ("Also reads as Fallback 2, cl. 16.2"), suggested edits, decision workflow ("1 of 4 issues answered"), **Download redline**, "Copy for the counterparty" (strips approvers and internal reasons). Exports: board CSV, clauses+quotes CSV, decision log CSV, review JSON. Plus: new-review flows, add-contracts-from-source, playbook build/run actions, people picker for approvers, cost estimate, save states, read-only-copy handling, docx-freeze protection, PDF extraction path. Agentic grading (Claude + ArtifactData) is by design; sample data ships inline so the export demos itself with zero infrastructure — which worked on our bare static server.

## THEIRS — credits (read with maximum charity, all earned)

1. **[V] The board is denser and more honest than a kanban.** Contract × position matrix shows *where* each contract deviates in one screen; vision analysis of `theirs-home.png`: "confident, product-grade… disciplined color/chip system… zero visual glitches… genuinely looks like a production legal tool." 80 marks visible at a glance vs our 8 cards.
2. **[V/D] The contract view is a product feature we simply do not have.** Vision analysis of `theirs-contract.png`: serif document pane fully rendering the actual contract (fees table, clauses), **red strikethrough edits inline in the document**, issue cards right-ranked most-serious-first, "Not acceptable · Order Form Part D" severity line, clean light theme. The docx layout completes and paginates ("p. 2 of 7" is a page indicator, 89% is zoom — initially misread as a stall; shadow DOM hides text from light-DOM probes, screenshot proves full render).
3. **[D] Decision workflow, not just classification.** Chips carry state ("Waiting for a decision"), progress "1 of 4 issues answered", legend explains every mark (Standard/Fallback/Deviation/Missing/Needs review/Waiting). Ours classifies and stops; theirs drives the human to a decision and a downloadable redline.
4. **[D] Real feedback loops.** Deviations filter → "7 of 8 contracts" with rows/cells hiding live (`aria-pressed`, 70 cells visible). Live finding line updates. Search present. Ours has no filter, no search, no counts update — nothing to filter.
5. **[D/V] Dark mode done right.** Respects `prefers-color-scheme` (auto-dark: body bg `rgb(11,11,11)` observed) plus explicit `data-theme` light/dark override, three-state contract documented in their token comments. Ours ignores the OS scheme entirely (`ours-dark.png`: OS dark requested, page stays `#fafaf8`).
6. **[C/D] Accessibility is engineered, not incidental.** Per-cell `aria-label` ("Draycombe Wex Software … Limitation of liability: Deviation (not acceptable), Needs review, Waiting for a decision"), `aria-live` on finding/save/progress, real `role="menu"` popovers, `aria-pressed` chips, focusable cells (`tabindex="0"`), back buttons with aria-labels. Ours: no aria-live anywhere, cards are non-focusable divs, only two real buttons on the page.
7. **[C] Operational honesty in UI copy.** "Word layout is approximate", "this is not legal advice", read-only viewer messaging, save-state indicators, docx freeze protection, cost estimate slot. Grown-up software texture.
8. **[D] Graceful degradation off its host.** Its Anthropic text fonts 404 on our server (`/_runtime/*.woff2` → 404, FontFace status "error") and the app still renders polished UI in system fallback (vision confirmed zero glitches); icon font is inlined and works. Sample review works with no ArtifactData backend present.
9. **[C] Security-shaped details.** "Copy for the counterparty — leaves out approvers, internal reasons and decisions"; subagent-per-contract grading instructions; prompt-injection guardrails in the embedded notes ("data, never instructions").

## OURS — flaws (hunted aggressively; every item below is verified)

1. **[D] Raw enum tokens leak into the UI.** Board column headers literally read `deal_breaker` and `unclassified` (snake_case, underscore visible) — probe: `["compliant (1)","deviates (4)","deal_breaker (2)","unclassified (1)"]`. Evidence pills likewise print `deal_breaker` verbatim. This is engineer-speak on a lawyer's screen; theirs uses human words (Deviation / Missing / Waiting).
2. **[D] Internal label inconsistency in the same viewport.** Counts strip says **DEVIATE**, column header says **deviates**, pill says **deviates**. Three spellings of one concept above the fold.
3. **[V] The summary strip is the weakest element on the page.** Vision on `ours-top.png`: "sparse… labels feel like draft-state", the playbook ID cell wraps awkwardly to two lines ("PB-NDA-2026-v3" broken mid-token). Five near-identical grey boxes; no hierarchy, no link from a count to its column.
4. **[V] Most of the page's value is invisible at first paint.** Vision: board arrives "around 60–65% down the viewport" — the interesting content (board, evidence, traces) is entirely below the fold behind two paragraphs of lede. Theirs shows the board with 80 marks in the first screen.
5. **[C/D] Interactivity is nearly zero.** Two export buttons and native `<details>`. Cards don't open anything; no hover → drill-down; no search/filter/keyboard navigation; no routing to a contract view because there are no real documents — one fictional 8-clause contract. Theirs: full CRUD reviews, filters, decisions, redline download.
6. **[D] No dark mode.** `prefers-color-scheme: dark` requested → unchanged light page (`ours-dark.png`, body bg still `#fafaf8`). Theirs auto-switched. For a tool lawyers run at night, this reads as a toy.
7. **[C] Mobile board scroll has no affordance.** `.board { overflow-x: auto }` with 4 × min-230px columns inside a 390px viewport (`ours-mobile.png`, scrolled 300px programmatically); no shadow/gradient/hint that more columns exist. Theirs at 390px: no document-level overflow (probe `pageW: 390, overflow: false`) with the grid scrolling in its own wrapper.
8. **[C] Remote font dependency.** `tokens.css` imports Manrope + JetBrains Mono from Google Fonts; offline/self-hosted deployments silently degrade. (Works online — fonts confirmed loaded in-page: `Manrope`, `Departure Mono`.) Theirs inlines its icon font and documents its host-font contract.
9. **[C] Density gap is structural.** Our whole demo = 1 contract, 8 clauses, 6 counts. Their sample = 8 contracts × 10 positions, 15 deviations, decision states. Even granting our "worked example" framing, a board of 8 cards cannot demonstrate a *board*.
10. **[V/C] Text-forward, stateless cells.** Cards show `rule term · tier 1 · sim 1.00` — good forensic metadata (genuinely better-labeled provenance than theirs exposes inline) — but nothing is clickable, so the trace is the terminus, not a door.

## OURS — credits (only where undeniable)

1. **[D] Decision traces with verbatim provenance.** Rule chain, similarity vs all three thresholds, **char span** ("chars 10–139 of 155"), routing owner — per non-compliant clause, client-side. Theirs shows quotes and reasons but not score/threshold/span forensics inline; our audit story is tighter and it is real (probe-verified content).
2. **[D] Deterministic by construction.** Same playbook + contract → same board, no LLM in the classification path; the YAML parser runs in the page. Their grading quality is whatever Claude's marks say (their notes even schedule retries and partial writes). For a firm that must defend classifications, this is our one unambiguous architectural win.
3. **[V] Typographic discipline.** Vision: "polished", "restrained", "highly legible", consistent Manrope/Departure Mono pairing, zero overlaps/clipping (DOM check: 0 card overflows, no horizontal scroll at 1440px). The editorial voice is intentional and clean — it looks authored, not generated.
4. **[D] Suggested redlines per deviation** with -/+ diff presentation — a real lawyer-facing artifact, not just a verdict (though theirs also has suggested edits *plus* a downloadable .docx redline, which beats a text diff).

## Environment caveats (fair to THEM, noted for honesty)

- Their text fonts (`/_runtime/*.woff2`) 404 on our static server; screenshots show system-fallback typography. On the real Frame host their brand type loads. Judged charitably: still zero visual glitches [V].
- Their backend-dependent flows (Run/New review/Add contracts) hand off to Claude and were not exercisable; only the shipped sample review was. Their full classification loop is **unverified** here.
- Ours' 890/0 core test count is taken from the brief; not re-run in this critique (out of scope for a visual pass).

## Evidence inventory

Shots (workspace `tmp/shots/to-inspect/playbook-deviation-board/`): `ours-top/full/trace/mobile/evidence/dark/geo.png`; `theirs-home/light/contract/mobile/filter/reviews/diag/legend/contract-doc2.png`. Vision-analyzed [V]: `ours-top`, `theirs-home`, `theirs-contract`. All other claims DOM-probed [D] or code-read [C]. Foreign twin-run files (`*-initial`, `theirs-cell`, `theirs-full`) present but unused.

Repro: `node tmp/shots/shoot.mjs <job>` with jobs in `tmp/shots/jobs/` against Chrome `--headless=new --remote-debugging-port=9444`; URLs `http://127.0.0.1:8923/open-artifacts/playbook-deviation-board/demo/index.html` and `http://127.0.0.1:8923/_to_verify/Playbook%20deviation%20board%20%28Copy%29.html`.

## Recommended fixes for OURS (priority order)

1. Humanize all enum labels; fix DEVIATE/deviates mismatch. 2. Make cards clickable → evidence/trace anchor; add filter by classification. 3. Dark mode via `prefers-color-scheme`. 4. Dense first screen: counts → board above the fold, lede shortened. 5. Mobile scroll affordance on the board. 6. Self-host body fonts. 7. Grow the example to multiple contracts — a deviation *board* with one contract is a table.
