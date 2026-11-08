# A02 — Visual critique: Cite check (OURS) vs "Cite check (Copy)" (THEIRS)

Pair: OURS `/open-artifacts/cite-check/demo/index.html` · THEIRS `/_to_verify/Cite%20check%20%28Copy%29.html`
Date: 2026-11-08 · Method: Puppeteer (system Chrome, headless new), viewports 1440×900 and 390×844, full interaction on both sides, local server 127.0.0.1:8923.
Stance: adversarial against OURS, charitable to THEIRS.

## Verdict

THEIRS wins decisively. Theirs is a working citation-review workbench — document pane, exception-by-exception comparison of brief text against source text, decision states, four export formats, a methodology panel. Ours is a static, one-example report page whose only interactive elements are two download buttons — and on a phone it **clips the two most important columns of its results table off-screen with no way to scroll to them**. Our one structural advantage (deterministic, LLM-free core) is invisible in this demo and the table's repetitive anchors actively make the output look cheap.

## Method

- Loaded each side at desktop 1440×900 and mobile 390×844; full-page screenshots; console/pageerror captured; `document.fonts` statuses checked; per-element geometry measured in-page.
- OURS exercised: both export buttons (real downloads captured and read), button hover, flag-row highlight, evidence cards, mobile table geometry.
- THEIRS exercised: Findings/Sources tabs, finding rows → exception-detail drawer, next-exception, "Flag for attorney", find-in-document, zoom in/out (102%→128%), kebab menu → "How this was checked", "Copy prompt" modal, export menu → CSV (download captured and read), rename/delete on sample, new-cite-check flow (attempted with a crafted DOCX brief), reload persistence, localStorage inspection, mobile tabs + drawer.
- Screenshots: `tmp/shots/to-inspect/cite-check/` (workspace root), 50 files, `ours-*` / `theirs-*`.
- Downloads: `tmp/a02-downloads-ours-*`, `tmp/a02-downloads-theirs-*`.

## OURS — the brutal list

1. **Mobile hides the verdict.** At 390px the results table renders 342px wide but its content needs 562px. The `.scroll { overflow-x: auto }` wrapper (demo/index.html) reports `scrollWidth == clientWidth == 342` — it never becomes scrollable — while row cells paint past it: measured row Q1, Anchor cell right edge x=469, Pinpoint cell right edge x=587, both beyond the 390px viewport (`ours-mobile-rowclip.png`, `ours-mobile-tabletop.png`). Every row's anchor and pinpoint — the two columns a reviewer actually needs — are clipped or fully invisible on a phone. This is a data-visibility defect, not a cosmetic one.
2. **It's a document, not a tool.** The entire interactive surface is two export buttons. No document view, no source view, no way to navigate from a finding to the cited passage, no review/decision workflow, no filtering. Compare theirs: per-exception "brief says / source says" panes with reviewer decisions.
3. **The centerpiece table looks degenerate.** 6 of 10 rows show the identical anchor "Deposition of Sandra Okafor (Jan. 14, 2026), page 12 (chars 198–295)" because the worked example is one base quote with variants. Whatever the pedagogical intent, visually it reads as copy-pasted filler in the hero component of the page (`ours-desktop-table.png`).
4. **No real matter in view.** The brief itself, the sources, the quotes-in-context — none are shown. Evidence cards give one-line blockquotes; there is no side-by-side, no pagination, nothing that resembles checking a real document. Theirs renders a 10-page Fourth Circuit brief and its source PDFs.
5. **Unexplained jargon as UI.** "normalized", "fuzzy", "charStart–charEnd", "token diff del/ins" — no tooltips, no legend, no progressive disclosure. For a demo aimed at lawyers this is engineer-speak.
6. Favicon 404 in console (trivial, but theirs gets dinged for the same class of thing below).

### What ours genuinely gets right (only where undeniable)

- Fonts actually load: `Manrope` and `Departure Mono` both `loaded` via `document.fonts` — ours ships real typography; theirs does not (see below).
- Exports are real and self-consistent: `cite-check-report.md` (5,320 B: summary table, per-quote sections, token diffs, honest "proposition support is not evaluated by this core" notes) and `cite-check-output.json` (14,818 B, full structured report). Both downloaded successfully.
- Status colors pass WCAG AA on white (computed: `--warn #8a6d00` ≥4.85:1, `--ok #1b6b2f` higher; `--accent #ffd400` correctly reserved for structural use, never text).
- Zero horizontal page overflow at either viewport (the damage is *inside* the inert scroll wrapper, item 1), zero console errors on mobile, ~830–860ms load.

## THEIRS — the charitable list

1. **A real workbench.** Two-pane layout: 893px document pane rendering the brief like paper, 547px findings panel; drawer for exception detail. Findings grouped Can't be found / Substance / Form, each with case, page, decision state (Flag for attorney / Fixed / Has a note / Not an issue), plus "Worth a look 2 · 1 source to pull · 3 reading notes".
2. **The exception detail is the killer feature.** Clicking "Quotation differs: a word was changed" opens a drawer showing *The brief says* (full quote, `p. 7, ¶ 10, pincite 800`) against *The source says* (`p. 800`, `Mennonite Board of Missions v. Adams.pdf`, rendered source page) — exactly the comparison a checker must make (`theirs-desktop-exception-detail.png`).
3. **Exports that a firm would use.** Four formats offered; CSV verified by download: 31 citations × columns for location, citation, authority type, source status, quote check, pincite check, "Support (Claude's reading)", other findings, reviewer decision, note — with substantive per-citation reasoning prose, not placeholders.
4. **Methodology transparency.** "How this was checked" (kebab menu) states the manual (Bluebook 22nd ed. 2025), its provenance and limits ("not checked against the Bluebook itself"), and what the page checks by itself (cross-references, form, quotations/pincites once a source is supplied) vs what needs Claude.
5. **Document-tooling depth.** Find-in-document, working zoom (102%→128%), prev/next exception navigation, close-detail; icon buttons carry aria-labels ("Find in document", "Zoom out", "Next exception"…). Mobile gets a genuine app adaptation: bottom tab bar Document/Findings, no horizontal overflow (`sw==cw==390`).
6. **Honest LLM workflow.** "Copy prompt / paste what Claude returned" makes the human-in-the-loop explicit rather than hiding it; requests and results persist via localStorage (`cc:*` keys).

### Theirs' defects (stated as fact, read charitably)

- The three Anthropic font families (`Anthropic Sans/Serif/Mono`) **fail to load** (`document.fonts` status `error`; three `_runtime/*.woff2` 404s) — the whole UI renders on system-ui fallback. Charitably: an artifact-export packaging gap, and the layout survives it intact.
- The export is **view-only**: "The sample cite check cannot be changed." "New cite check" has no active control in this build; "Flag for attorney" clicks don't change the "5 of 7 decided" counter; rename/delete are inert on the sample. Charitably: sensible read-only sample sealing; the flows exist in markup and the app is designed for an owner with edit access.
- Sort/filter ("Worst first", "Undecided only", footnote range, "My footnotes to…") exists in markup but is not reachable in the sample state — could not be exercised.
- The mobile "All cite checks" drawer did not open on my click attempt (may be gesture-driven).

## Head-to-head

| Dimension | Ours | Theirs |
|---|---|---|
| Product surface | Static report page, 2 buttons | Full review workbench, dozens of controls |
| Document in view | None (blockquotes only) | Rendered 10-page brief + source PDFs |
| Findings presentation | 10-row table + cards | Grouped findings, exception detail, decisions |
| Exports | md + json (verified) | Word + CSV + md + json (CSV verified, far richer) |
| Mobile | Table columns clipped off-screen, no scroll | Proper app adaptation, no overflow |
| Typography | Fonts load (Manrope/Departure Mono) | Intended fonts 404, system fallback |
| Trust model | Deterministic, LLM-free, verifiable output | LLM-in-loop, methodology disclosed |

Ours' only defensible wins are font delivery, AA contrast, and the determinism of its (fixed, fictional, repetitive) output. Everything a user sees and touches is better on theirs.

## Recommendations for our side

1. Fix the mobile table now: make `.scroll` actually scroll (the table must size to content, not `width:100%`), or collapse to cards under 768px. This is the worst defect found.
2. Vary the worked example so anchors aren't identical across 6 rows; or add a second document/source pair.
3. Show the brief and at least one source page side-by-side for a flagged quote — evidence without context is assertion.
4. Add a legend/tooltip layer for normalized/fuzzy/similarity/diff notation.

## Evidence index

Screenshots (workspace root `tmp/shots/to-inspect/cite-check/`): `ours-desktop-initial/-table/-evidence/-hover`, `ours-mobile-initial/-table/-tabletop/-rowclip`; `theirs-desktop-initial/-findings/-exception-detail/-exception-next/-howchecked-open/-kebab-menu/-exportmenu3/-sources2/-zoomin/-find/-afterflag/-copyprompt5`, `theirs-mobile-initial/-doc/-findings/-drawer2`.
Downloads: `tmp/a02-downloads-ours-cite-check-report.md`, `tmp/a02-downloads-ours-cite-check-output.json`, `tmp/a02-downloads-theirs-brannock-sample-sheet-2026-11-08.csv`.
Scripts (rerunnable): `tmp/a02-stage1..12.mjs` at workspace root.
