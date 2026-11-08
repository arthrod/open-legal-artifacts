# A09 — Visual critique: Tabular review

Pair: OURS `tmp/open-legal-artifacts/open-artifacts/tabular-review/demo/index.html` (10.3 KB page + 431-line core)
vs THEIRS `tmp/open-legal-artifacts/_to_verify/Tabular review (Copy).html` (3.76 MB single-file Claude artifact export).
Method note: the A01 report was not present when this ran (empty critique dir), so sections follow the shared-context rules directly: adversarial-against-OURS stance, screenshots as evidence, verified vs inferred kept separate.
Server: `http://127.0.0.1:8923/` (both sides 200). Screenshots via headless Chrome 1440×1000 @2x and 390×900 @2x (CDP driver `tmp/critique-shot.mjs`), theirs given 9–16 s settle for the bundle. DOM probes via CDP `Runtime.evaluate`.

Shots (workspace-root-relative, under `tmp/shots/to-inspect/tabular-review/`):
`ours-default.png`, `ours-typed.png`, `ours-mobile.png`, `theirs-default.png`, `theirs-filter.png`, `theirs-cite.png`, `theirs-mobile.png`.

## Verdict

THEIRS wins, decisively. Their bundle is a working review product with a 104-document seeded sample, one-click citation-to-passage document viewing, filters, bulk actions, Word/Excel export, light/dark theming and real accessibility engineering. OURS is a technically honest but visually impoverished 3×5 static matrix whose central promise — verified, anchored answers — is (a) matched in kind by their own quote-locator, and (b) dead-ends in our demo at character offsets nobody can act on. Our only genuinely unique axes are the typed-schema constraint checking, the machine-reason taxonomy printed on the page, and cell-level diff export; all three are real and behaviorally verified below, and all three are invisible next to a page that looks like an engineering printout.

## What THEIRS actually is (evidence)

- Auto-seeds and auto-opens a real sample review. DOM probe after load: `view=project`, name "Ostrevane material contracts (sample)", header "Checked 13 / 104", `#grid` 9 visible rows, 112 `.cell` elements, **88 `.cell__cite` citation links** (verified 2×, ≤4.5 s after load). All desktop shots show this populated project, not an empty state. `theirs-default.png`.
- Citation click opens the document at the passage. Probed: `.cell__cite` first element `.click()` → a document viewer opened with the quoted passage highlighted (page grew 1035→1055 px; drawer visible in shot). `theirs-cite.png`.
- Filtering works. Clicking the "Needs review 6" chip: pressed state + filtered rows in `theirs-filter.png`.
- Quote verification exists on their side too. Source (read, not run): `checkedSources` — "The passages the answer quotes, each looked for in the document: one that is not there word for word is not offered as a citation", plus `validateAskReply` ("Never throws") for Ask-the-table replies. This directly overlaps the one thing our lede claims as unique.
- Product surface (markup read): reviews home + new-review flow; Run handoff to Claude with cost tooltip; Ask; columns via checklist/templates/per-column instructions; bulk assign/flag/mark-checked; search + filter menu + row density; Issues list (Word), Survey summary (Word), Table (Excel) exports; "Out of date"/"Not saved" cell states; unreadable-document handling; view-only copy disables writes (`new-review` `disabled=true`, probed) with a dismissible copy note.
- Craft: full CDS token kit, light/dark via `prefers-color-scheme` + `data-theme`, `aria-live` regions, `role=menu`/`status`, sr-only labels, explicit focus-ring rules, responsive breakpoint block. Their custom Anthropic fonts 404 on this host (`/_runtime/*.woff2` → 404, checked) and the page still renders correctly on fallbacks — graceful degradation verified visually.

## What OURS actually is (evidence)

- Instant static render of a 3-documents × 5-questions fictional worked example. Free-text mode summary (live probe of `buildMatrix`): 15 cells / 13 answered / 2 unverified (`not_answered`, `quote_not_verified`) — matching the lede's promised "one deliberately unanswered and one quote that does not locate". `ours-default.png`.
- Typed schema mode works: switching the select re-renders with `[classify: …]`/`[value: … unit]` badges; live probe: 12 answered / 3 unverified incl. `constraint_violation`. `ours-typed.png`.
- Exports work (behaviorally verified by importing `core.js` in the page and running the functions): `toCSV` emits header + rows with `[§ 2]`-style pins and a trailing `Verified` column; `toMarkdown` emits the same as a table. `matrix-output.json`, `diff.json` buttons wire the same core (code-read, not download-tested — headless downloads not exercised).
- Mobile: table gets horizontal scroll via `.scroll` wrapper; no sticky first column, so document names scroll out of view; summary boxes wrap acceptably. `ours-mobile.png`.

## Brutal findings against OURS

1. **The anchor is a dead end.** Answered cells show `chars 438–459 · exact` — a character range into a document the page never shows. A reviewer cannot open, read, or confirm anything. Theirs opens the source document with the passage highlighted in one click (`theirs-cite.png`). Our "anchors survive export" claim is true and useless in the demo.
2. **"The core verifies, never answers" is not a differentiator here.** Their `checkedSources` also refuses to offer a citation for a passage that is not in the document word-for-word. What they add on top: page-aware offsets, a visible reader, and a checked/needs-review workflow. Our uniqueness is narrower than the lede implies: fuzzy-flagging, typed schemas, reason taxonomy, diff.
3. **Zero interactivity beyond one `<select>` and four download buttons.** No cell inspection, no filters, no search, no sort, no flag/assign/check workflow, no upload of one's own documents, no persistence. Three fictional documents is a museum diorama; theirs demonstrates at 104-doc scale.
4. **No deliverable a lawyer would send.** CSV/MD/JSON/diff are engineer formats. Theirs exports an Issues list and Survey summary in Word and the table in Excel — the actual work product of contract review.
5. **Visual poverty.** 12.5 px table text, mono-everything, yellow `UNVERIFIED (…)` blocks, no icons, no hierarchy beyond a yellow rule. Next to the CDS-kit artifact it reads as a debug view, not a product.
6. **Accessibility gaps (code-read):** no `prefers-color-scheme`/dark mode (grep: 0 matches in demo), no `aria-live` on the re-rendered matrix/reasons, `<th>` without `scope`, status conveyed by class+text (text present, so not color-only — partial credit).
7. **Fuzzy/outlier demo values are 0 in the default view** (live probe: `flaggedForReview: 0`, `outliers: 0`) — the summary boxes advertise machinery the default screenshot never exercises; the fuzziness story is told, not shown.

## Credits to OURS (only where undeniable)

- Typed question schemas with machine-checked constraints (`constraint_violation` produced live in typed mode) — no equivalent observed in theirs.
- On-page machine-reason taxonomy and per-column reason counts in JSON — theirs communicates trust via the checked workflow, not a printed reason ledger.
- `diff.json`: cell-level prev/next diff of two extractions (code-read; `diffMatrices` exercised via the demo's own diff button path) — theirs has staleness ("Out of date") but no observed diff export.
- Deterministic, LLM-free, dependency-free: 10 KB, renders in <2.5 s incl. module fetch; theirs is 3.7 MB and needs up to ~9 s before the sample review is usable, plus `/_runtime` font requests that 404 off-host.
- Both sides' fictional-sample honesty is comparable (ours labels fictional; theirs marks "(sample)").

## Verification ledger

Verified by running (screenshots/DOM probes, this session): both URLs 200; ours free/typed summaries and reason taxonomy via `buildMatrix` import; `toCSV`/`toMarkdown` output content; theirs auto-open state, 88 citations / 112 cells, "Needs review 6" filter effect, citation-click document drawer, write-buttons disabled in view-only copy; `/_runtime` font 404.
Inferred from source read (not executed): their `checkedSources` word-for-word gate, `validateAskReply`, Word/Excel export wiring, dark-mode and a11y rules.
Not verified: actual file downloads from either side (headless download bar not exercised); theirs' Run/Ask against a live Claude (impossible here); ours' visual hover/focus states; print/PDF rendering.

## Bottom line

If the goal of the open artifact is to prove the deterministic core, it proves it and then hides it: the verifiable substance (schemas, reasons, diffs, anchored CSV) is all real, but the presentation gives a reviewer nothing to do and nothing to look at. Theirs is what the artifact would need to become to compete: same verification instinct, wrapped in a document reader, a workflow, and export formats the trade actually uses. Recommended priorities if acting on this: (1) a passage viewer for anchors, (2) filters/search over cells, (3) Word/Excel outputs, (4) dark mode + a11y pass, (5) exercise fuzzy/outlier visibly in the default sample.
