# A10 — Visual critique: venture-term-sheet-benchmark (OURS) vs Term Sheet Benchmarking (Copy) (THEIRS)

- **Date:** 2026-11-08 · **Pair A10** · stance: red-team against OURS, maximum charity to THEIRS.
- **OURS:** `http://127.0.0.1:8923/open-artifacts/venture-term-sheet-benchmark/demo/index.html` (demo/index.html 5.9 KB + tokens.css + core; artifact total ~40 KB).
- **THEIRS:** `http://127.0.0.1:8923/_to_verify/Term%20Sheet%20Benchmarking%20(Copy).html` (2.77 MB single-file export; CDS token kit, inlined fonts, pdf.js, in-page DOCX/XLSX writer; sample round "Quillhaven Lattice Series A" with 6 fictional investor documents).
- **Shots:** `tmp/shots/to-inspect/venture-term-sheet-benchmark/` (13 PNGs, both sides × states).
- **Method:** headless Chrome via Playwright, 1440×900 desktop + 390×844 mobile, light + `prefers-color-scheme: dark`, interactive states clicked through (filters, table view, doc drilldown, export menu, error path, CSV download); core tests run; DOM text probed. Console watched on both sides.

## Verdict (one paragraph)

THEIRS is a finished product that happens to be a law-department tool; OURS is a well-tested library wearing a REPL as its demo. Theirs ingests real documents, benchmarks a whole round of six investor term sheets at once against dated, published WSGR market data (median pre-money $73.8M, "non-participating 96%"), wraps it in a CDS-styled interface with light/dark, filters, search, human sign-off workflow, and exports a Word board memo generated in-page without libraries. Ours asks a lawyer to hand-edit JSON, computes its headline inside/outside verdicts for numeric terms against **placeholder example ranges** (one renders as the degenerate string "1–1 x"), and presents the result as a bare table on cream paper with no dark mode. The only grounds where ours survives are real but narrow: it is deterministic and LLM-free (20/20 tests pass), fully self-contained, and its benchmark grid is inspectable and swappable. On every dimension a buyer can see, theirs wins.

## What each side actually is

| | OURS | THEIRS |
|---|---|---|
| Input model | Hand-authored term-sheet JSON in a textarea | PDF/DOCX term sheets; in-page pdf.js text extraction; Claude subagents read every term and write graded rows with quotes |
| Scope | One term sheet per run | A round: 6 documents (priced equity, SAFEs, convertible notes) cross-compared per term (A/B/C chips) |
| Market data | NVCA structural enums (real, public) + **EXAMPLE numeric defaults** user must replace; grid as-of "2026-01" | Wilson Sonsini Venture Finance Data **Q1–Q3 2026, "read Oct 23, 2026"**, per-term distributions ("Pari passu 80% / Senior 20%"), medians, "B+ published for Series B and later" honesty markers |
| Workflow | Run → read table | Waiting-for-sign-off queue (6), needs-review (2), accept/negotiate decisions, negotiation posture (company/investor), decision log |
| Exports | CSV download (works); Markdown in a read-only textarea (copy-paste) | Board memo **.docx**, table-view CSV, terms-and-quotes CSV, decision-log CSV, saved-round JSON |
| Visual system | Shared repo tokens, cream editorial, 11px mono labels, no dark mode | Claude Design System: full token kit, light + dark, risk/stage palettes, legend, filter chips with counts, search |

## THEIRS — strengths (observed, credited)

1. **Real, dated, on-page provenance.** About panel: "Source · Venture deal terms, Q1-Q3 2026 · Wilson Sonsini, Venture Finance Data, Q1-Q3 2026, read Oct 23, 2026" plus "Notes about these figures" and a consult-counsel line. Every number I probed (medians, frequencies) is traceable to that statement. (`theirs-about.png`, DOM probe.)
2. **Portfolio benchmarking, not single-sheet.** Per-term rows show each document as a chip against the market distribution; outlier chips carry "Favors investor · To negotiate" state set by a human. "6 of 8 off market, all favor the investor" per-document summary lines do in one sentence what ours needs a full table for. (`theirs-home.png`, `theirs-tableview.png`.)
3. **Human-in-the-loop is the product.** Filters "All 56 / Outliers 11 / Waiting for sign-off 6 / Needs review 2", a negotiation-posture selector, per-reading "? A person should check this reading" — the tool knows it is advisory and stages the lawyer's judgment. (`theirs-outliers.png`.)
4. **Document drilldown with quotes.** Clicking Grimsdyke Oxbow opens per-term readings with the source text quoted, e.g. pre-money "$36M — 0.49x the median of $73.8M". Ours has no quote layer at all; it trusts the JSON you typed. (`theirs-doc.png`.)
5. **Exports without dependencies.** Board memo as Word, three CSVs, round JSON — the .docx/.xlsx writers are pure in-page JS (zip of XML with fixed dates, "same data gives the same bytes"). Ours' MD "export" is a textarea you copy from.
6. **Engineering polish:** zero console errors; correct dark theme under `prefers-color-scheme: dark`; no horizontal overflow at 390px; whole app fits ~935px of height at 1440 wide — denser and calmer than ours' 2,493px scroll. (`theirs-dark.png`, `theirs-mobile.png`, console log.)

## OURS — weaknesses (brutal, each observed)

- **[P1] It benchmarks numbers against invented data and still prints verdicts.** The demo's headline "3 inside · 7 outside" includes numeric verdicts computed against the default grid whose source column admits: "NVCA structure + **EXAMPLE numeric default — replace with dated market data**". The honesty label is in 11px secondary text; the verdict chip is a filled tint. A skimming partner reads "outside_market" as market knowledge. It is not. Worse, the liquidation-preference benchmark renders as the degenerate string **"1–1 x"** (p25=p75=1) — visible in the shipped demo table. (`ours-initial.png`; reproduced via `benchmarkTermSheet` in node.)
- **[P1] Input model excludes the actual user.** The only way in is a 440px-tall JSON textarea. A venture lawyer does not write `"anti_dilution": "full_ratchet"`. Theirs' user drops the PDF they already have. Every virtue of the core (typo guard, favor direction) is gated behind JSON literacy. (`ours-initial.png`.)
- **[P1] No round, no comparison.** One term sheet per run; no way to see three competing term sheets against each other — the core scenario of a Series A. Theirs' whole home page is that scenario.
- **[P2] No workflow.** No accept/negotiate state, no sign-off queue, no decision log, no negotiation posture. The tool's output ends at "here is a table"; theirs' output ends at "here is the board memo."
- **[P2] Visual layer is a dev harness.** Raw slug as h1 ("venture-term-sheet-benchmark"), 11px mono uppercase labels at the system floor, no dark adaptation under `prefers-color-scheme: dark` (body stays `rgb(250,250,248)`; theirs flips to a full dark palette), no filters, no search, no distribution bars — the market grid, allegedly "the product", is invisible: you never see the distribution your term sits in, only a pass/fail chip. (`ours-dark-scheme.png` vs `theirs-dark.png`.)
- **[P2] Error path is raw V8.** Invalid JSON prints "Expected property name or '}' in JSON at position 2 (line 1 column 3)" with no line context in the textarea, no recovery hint. (`ours-error.png`.)
- **[P3] Exports asymmetric.** CSV download works (verified: `term-sheet-benchmark-series_a.csv`), but Markdown — the format a deal team would paste into a memo — has no download, only a readonly textarea.

## Credits OURS keeps (only the undeniable)

1. **Deterministic, LLM-free, tested.** `node --test core/*.test.js` → **20/20 pass, 0 fail** (run this session). Theirs' reading layer is literally instructions for Claude subagents embedded in the file; in this static export the app is view-only ("You can view this page but not change it") and "Add documents" cannot work without the Claude environment. Ours computes in any browser, offline, ~40 KB vs 2.77 MB.
2. **The grid is inspectable and swappable by design** (`withGrid()`, per-entry merge), and every verdict carries favor-direction (investor/company), a typo guard that refuses to flag unknown enums off-market, and per-term links to the public NVCA model docs. These are real, tested properties (20 tests) theirs does not advertise.
3. **No mobile overflow at 390px**; both sides clean on that check. Console: one favicon 404 (ours), none (theirs).

## Scorecard (adversarial: ours must prove, theirs gets benefit)

| Dimension | OURS | THEIRS |
|---|---|---|
| Input model / who can use it | 2/10 | 9/10 |
| Market-data substance & provenance | 4/10 (NVCA enums real; numerics fake, dated "2026-01") | 9/10 (real WSGR Q1–Q3 2026, dated, on-page) |
| Information design | 4/10 | 9/10 |
| Visual craft / theming | 4/10 | 9/10 |
| Workflow (decisions, sign-off) | 1/10 | 9/10 |
| Exports | 5/10 | 9/10 |
| Trust machinery (favor dir, typo guard, no-guess) | 8/10 | 7/10 (B+ markers, needs-review; but readings are LLM output) |
| Robustness / portability (tests, size, no runtime deps) | 9/10 | 6/10 (view-only without Claude; 2.77 MB) |
| Error handling / UX copy | 3/10 | 8/10 |

## Fix list for OURS (priority)

1. **[P1] Ship a real dated grid** (or partner data) for the numeric terms, and demote verdicts on EXAMPLE rows to a visually distinct "example verdict" state — the tint must not look like market knowledge. Fix the "1–1 x" degenerate label (render "1x" when min=max).
2. **[P1] Kill the JSON textarea as the primary input** — a term-by-term form (chips for enums, steppers for numbers) over the same core; JSON stays as an advanced tab.
3. **[P1] Multi-sheet rounds:** accept 2+ term sheets and render the per-term A/B comparison theirs proves lawyers want.
4. **[P2] Show the distribution** (min/p50/max bar with the value marked) instead of a bare verdict chip; add outlier-only filtering; add accept/negotiate state per row; download button for the MD export.
5. **[P2] Dark scheme + focus-visible + curated parse errors** (map JSON errors to "line N: expected …" with a jump link).

## Evidence index

- Shots (13): `tmp/shots/to-inspect/venture-term-sheet-benchmark/{ours-initial,ours-rerun,ours-error,ours-dark-scheme,ours-mobile,theirs-home,theirs-tableview,theirs-outliers,theirs-export(theirs-about),theirs-doc,theirs-dark,theirs-mobile}.png`
- Commands: `node --test core/*.test.js` (20 pass); Playwright scripts `tmp/shots/a10-probe-theirs.mjs`, `a10-probe-about.mjs`, `a10-shots.mjs` (console captured: ours 1 favicon 404; theirs none).
- Not verified: theirs' "New round"/"Add documents"/DOCX byte output (requires Claude artifact environment — static export is view-only); either side's keyboard/a11y depth; ours' `withGrid()` merge in a UI (API only, no surface).
