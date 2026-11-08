# A08 — Visual critique: jurisdiction-survey-matrix (OURS) vs "Survey matrix (Copy) (Copy)" (THEIRS)

Date: 2026-11-08 · Pair: A08 · Stance: adversarial against OURS, charitable to THEIRS.

- OURS: `http://127.0.0.1:8923/open-artifacts/jurisdiction-survey-matrix/demo/index.html`
- THEIRS: `http://127.0.0.1:8923/_to_verify/Survey%20matrix%20%28Copy%29%20%28Copy%29.html`
- Shots: `tmp/shots/to-inspect/jurisdiction-survey-matrix/` (16 files)
- Evidence tags: **[run]** = executed and observed in browser this session; **[inspected]** = read from source; **[inferred]** = judgment.

## Verdict (one line)

THEIRS wins decisively: it boots into a real 51-jurisdiction × 5-question non-compete survey (255 cells of cited, substantive US law) inside a polished app shell with review workflow, filters, keyboard grid nav and four working exports including Word and Excel — OURS boots into a 28-cell fictional example rendered as a flat 4-column list that isn't visually a matrix at all, hides a silent-crash bug, and phones home to Google Fonts while claiming no data leaves the machine. **OURS 3/10, THEIRS 9/10.**

## Method

Playwright (Chrome channel, headless) at 1440×900 and 390×844, DPR 2. Full-page + viewport shots of default and interaction states; download-event capture on both sides' export buttons; console/page-error/request-failure collection; one robustness probe (wrong JSON shape) and one scale probe (51×5) against OURS' core; source inspection of `core.js`, `demo/index.html`, `demo/tokens.css`, and structure/ARIA greps of THEIRS' 3.2 MB bundle. THEIRS allowed 6 s settle after load (inlined fonts/data).

## What THEIRS actually is [run]

- Boots straight into **"Employee non-compete enforceability (sample)"** — 51 US jurisdictions (incl. DC) × 5 questions = **255 answers with real legal prose and citations** (e.g. Alabama: "Yes, if reasonable in time and place… professionals are excluded · 24 months · Ala. Code § 8-1-1…"). Not a toy.
- True matrix layout: jurisdictions as rows, questions as columns, sticky question tabs, jurisdiction quick-jump strip (AK ME WI …), and answer-distribution counts (Yes 30 · No 5 · Conditional 16) in the header.
- **Review workflow**: "4 of 255 checked" tracker, filters for *Needs review (248) · Flagged (3) · Past review date · Checked · No answer yet · Differs from most jurisdictions (68)*, and per-cell popover with the answer, citation + source link, and re-check/research actions (`theirs-cell-open.png`).
- **Keyboard navigation works** — the page announces "Use the arrow keys to move between answers and Enter to open one", and Enter on a focused cell opened the popover in my run (`theirs-keyboard-enter.png`).
- **All four exports really download, dated, client-side** [run]: `…-memo-2026-11-08.docx`, `…-chart-2026-11-08.xlsx`, `…-answers-2026-11-08.csv`, `…-survey-2026-11-08.json` — real .docx/.xlsx generation (docx/xlsx + Blob/createObjectURL machinery in the bundle [inspected]).
- A11y-engineered [inspected]: `role=menuitem/menu/dialog/status/alert/listbox`, 16 `tabindex`, `aria-live/expanded/pressed/haspopup/disabled` throughout.
- Adapts to 390 px cleanly (`theirs-mobile.png`): condensed header, chip row, horizontally scrollable matrix card.

## What OURS is [run]

- A 1,100 px editorial-mono document: yellow rule, stats strip (verified/stale/unverified/coverage %/policy), stacked-bar coverage per jurisdiction, then a **flat table** with columns `Jurisdiction | Question | Cell | Status` — 28 rows for the 7×4 fictional example. Every cell's answer, citation link, verification date, and warnings show inline; error state for invalid JSON is clean (`ours-badjson.png`); as-of date flip correctly re-classifies everything (2027-06-01 → 13 stale / 0 verified [run]).
- Exports verified working [run]: `jurisdiction-survey.csv`, `jurisdiction-survey.md`, `re-verification-worklist.md`.
- Core is genuinely fast: a correct-schema 51×5 survey (255 cells) renders in **3 ms** [run].

## Where OURS loses (the brutal list)

1. **It isn't a matrix on screen.** Rows are jurisdiction×question flattened; comparing jurisdictions on one question means scanning 51 interleaved blocks. At 51×5 the page becomes a **24,552 px scroll dump** [run: `body.scrollHeight`], no filters, no search, no column view, no virtualization. THEIRS holds the same 255 cells in one screen-height grid with filters and keyboard nav. This is the artifact's namesake feature and OURS doesn't render it.
2. **Silent-crash bug** [run]: pasting a survey whose `cells` is a keyed object instead of an array (a natural JSON shape — mine was `{"al:q1": {…}}`) throws `TypeError: object is not iterable` inside `buildMatrix` (`core.js`, `for (const c of survey.cells ?? [])`), which `render()` does not catch — the page shows **the previous matrix with zero error message** (`msgs` empty, table still 28 rows, error visible only in console). A user gets a silently wrong artifact. Shot: `ours-cells-object-bug.png`.
3. **Privacy claim contradicted in its own lede.** The page says "everything renders client-side; no data leaves the machine" — yet `tokens.css` `@import`s Google Fonts, and my run captured requests to `fonts.googleapis.com` and `fonts.gstatic.com` [run]. Departure Mono is self-hosted; Manrope/JetBrains are not. Either self-host or delete the claim.
4. **Content depth: 28 fictional cells vs 255 real ones.** OURS' example is deliberately fictional (honest, labeled) — but as a demo it demonstrates the schema, not the product. THEIRS demonstrates a lawyer-usable survey on day one, with an honest "248 need review" badge.
5. **Exports stop where lawyers start.** CSV/MD/worklist are fine for auditors; there is no Word memo and no Excel chart — the two artifacts opposing counsel and partners actually want. THEIRS generated both, dated, offline, in one click each [run].
6. **No workflow.** No checked/flagged/needs-review states, no per-cell re-check action, no diff ("See what changed"), no question sets, no questionnaire for local counsel — all present in THEIRS' shell [inspected from DOM + menu items].
7. **A11y gap.** Semantic `<table>`, real buttons, `aria-label`s on inputs — decent basics. But no `aria-live` for render messages, no grid keyboard model, and coverage bars encode status by fill color first (the text count mitigates). THEIRS ships live regions and full menu/dialog semantics.
8. **Aesthetic risk taken, but thin.** The brutalist mono system is consistent (`--radius: 0`, hairlines, yellow rule), yet the whole page is one undifferentiated column; status pills are the only color spend; hover is the only row affordance. Next to THEIRS' serif/sans editorial polish it reads as a debug view with good typography.
9. Input UX is a 220 px JSON textarea — developer-grade. THEIRS never shows raw JSON (import/export only).

## Where OURS genuinely holds (undeniable only)

- **Verification discipline is architectural, not procedural** [inspected + run]: an answer without citation + sourceUrl + parseable verification date *cannot* render as verified (`classifyCell`), future-dated verifications are rejected, staleness is a hard policy window with no hidden clock, figure-vs-quote consistency warnings are generated. THEIRS' sample is 97% "needs review" and its answers render regardless; OURS' unverified cells render as UNVERIFIED, never guessed. This is the one dimension where OURS is the more trustworthy artifact.
- **12 KB vs 3.2 MB**; dependency-free module; 3 ms at 255 cells; runs identically in Node [inspected core; run in browser].
- XSS hygiene: every interpolation escaped, `rel="noopener"` on external links [inspected].

## THEIRS' own flaws (noted with charity)

- Export artifacts leak their history: title is "Survey matrix (Copy) (Copy)".
- In static export, three Anthropic webfonts 404 (`/_runtime/…woff2`) and the page falls back to system fonts [run] — an artifact-export infrastructure gap, not a design error; the layout survived it.
- View-only sample gates editing (Research/Documents unreachable); the research pipeline and "About $0.80 a jurisdiction" pricing were **not exercisable** here — quality of the LLM-research loop is unverified, and 248/255 unchecked cells is an honest admission that the sample's answers are mostly unreviewed.
- favicon 404 on this server (both sides share it; trivial).

## Not verified

- THEIRS' Research flow, diff view, import, questionnaire, and localStorage persistence — hidden/disabled in the view-only export; needs the live Claude artifact environment.
- THEIRS' .docx/.xlsx **content fidelity** — downloads verified byte-for-byte as events, files not opened/validated.
- OURS file-upload path (only paste path driven), print stylesheet (none on either side), screen-reader behavior (ARIA inspected, not audited by AT), >255-cell performance for THEIRS.

## Scorecard

| Dimension | OURS | THEIRS |
|---|---|---|
| Visual design / craft | 5 | 9 |
| Information architecture (matrix!) | 2 | 9 |
| Content depth of demo | 3 | 9 |
| Interaction / workflow | 3 | 9 |
| Exports | 5 | 9 |
| Accessibility | 5 | 8 |
| Robustness (this run) | 3 | 8 |
| Trust/verification discipline | 9 | 6 |
| Footprint/determinism | 9 | 5 |

**Bottom line:** OURS wins the ethics layer (never-guess verification policy) and loses nearly everything a user sees or clicks. Fix the flat-table-pretending-to-be-a-matrix, the swallowed `buildMatrix` exception, and the Google Fonts phone-home before anything else.
