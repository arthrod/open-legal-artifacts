---
timestamp: 2026-11-08T02:10:00Z
pair: B09
theirs: _to_verify/Tabular review (Copy).html (3,756,938 B, Claude-artifact export)
ours: open-artifacts/tabular-review/ (core/matrix.ts 431-line core.js port, demo, examples, templates)
method: same as B01 — theirs extracted to /tmp/b09/ (notes-for-claude + 23 scripts + sample-data parsed), ours read in repo; both sides loaded over http://127.0.0.1:8923/ and screenshotted; our core probed live with node (core/core.js).
screens: tmp/shots/to-inspect/b09-tabular-review/{ours-default.png,theirs-default.png}
---

# B09 — Tabular review: theirs vs ours (code-level red-team, biased against ours)

## 1. 结论

**Theirs is the stronger artifact, and ours has three core defects that must be fixed before its central promise — "the core verifies, never answers" — is safe on real diligence work.** Theirs is a full agentic review workspace: nonce-fenced prompt-injection defenses around untrusted document text (script14.js `buildPrompt`), word-for-word quote location with offset maps back to original text and hyphen-by-hyphen line-break handling (script10.js `makeLocator`), typed answer coercion incl. exact scale-word currency arithmetic with ambiguity refusal (`parseCurrency`), chunked page-aware extraction with candidate merging, reviewer marks whose corrections win over model answers, per-cell verified state, comments, flags, PDF rendering with on-page quote highlight, and an 8-doc × 13-column fully worked sample (104 cells: 87 ok / 16 notfound / 1 review; 13/104 reviewer-checked, 1 of 18 pages honestly marked unread). Ours is a small, clean, tested deterministic verifier — genuinely better on determinism (29/29 tests, byte-identical regeneration re-verified this run), re-run diffing (`diffMatrices`, which theirs lacks entirely), cross-document classify consistency (`outlier_value`, absent in theirs), numeric bounds enforcement (absent in theirs), and audit exports — but its parsers and its verification loop fail in ways that produce **silently wrong amounts** and **invisible data loss**, and it is 2+ orders of magnitude slower per cell than their locator at document scale.

## 2. 必须修 (ours)

1. **[正确性] `currencyAmount` silently misparses scale words — "$1.5 million" certifies as 1.5.**
   - 位置: `open-artifacts/tabular-review/core/matrix.ts:203-208` (mirrored `core/core.js`).
   - 问题: the regex `[$£€]\s*([\d,]+(?:\.\d+)?)` stops at the digits; scale words ("million", "m", "bn") are never multiplied in. "£2m" → 2, "USD 1.5 million" → 1.5.
   - 影响: verified live (`node`): a currency-typed cell with answer "$1.5 million" ships as `status: "answered"` with `schema.value: 1.5`. In a liability-cap or fees column this turns $1,500,000 into $1.50 **with the core's stamp of verification** — the exact failure mode the artifact exists to prevent. Their counterpart (script14.js `parseCurrency`) expands k/thousand/m/mm/mn/million/b/bn by text-shifting the decimal (exact, no float drift), and returns `''` — flag for a person, never a guess — for ambiguous bare "$", symbols that could be several currencies, and 3-decimal amounts in non-3-decimal currencies.
   - 修复方向: parse the scale suffix into the amount; when the form is ambiguous or unparseable, return null (→ `constraint_violation`), never a wrong number. Port their text-shift trick.

2. **[正确性] `no_such_document` is unreachable; cells referencing unknown documents/questions vanish silently.**
   - 位置: `core/matrix.ts:276-281` (`docObj = docs.get(c.documentId)` guard) and the grid loop at `:275-277`; also dead guard `if (!questions.has(q.id)) continue` (`:277`).
   - 问题: the loop iterates `input.documents × input.questions`, and `c` is fetched by `${doc.id}::${q.id}` — so `c.documentId` always resolves and `docObj` is never undefined. A supplied cell whose `documentId` or `questionId` has a typo (or references a doc not in the list) is never picked up and never appears in output. Verified live: input with 4 cells incl. one `documentId: "ghost"` → `summary.cells: 3`, no diagnostic.
   - 影响: spec.md's Output contract promises `no_such_document` as an emitted `unverifiedReason`; that promise cannot fire through the documented input path. At extraction scale, one wrong join key silently deletes a cell from the matrix — the reviewer never knows a question went unasked for a document.
   - 修复方向: validate `input.cells` keys against the documents/questions sets before the grid loop; emit unverified cells (or a top-level warnings list) for orphans, which also makes `no_such_document` real.

3. **[性能] No per-document tokenization cache — 20 cells on one ~72k-token document took 16.1 s.**
   - 位置: `core/matrix.ts` `verifyQuote` → `core/textutil.ts:57-91` (`bestWindow` runs `tokenizeWithSpans(source)` and a full O(tokens × windowSizes × quoteTokens) slide **per cell**; `buildMatrix` calls it for every cell).
   - 影响: measured live: 20 quote verifications on one document ≈ 16.1 s (≈0.8 s/cell). A realistic 40-doc × 30-question matrix on comparable documents ≈ 20 minutes of pure verification, single-threaded. Their counterpart normalizes each document once (`makeLocator`, script14 keeps a per-doc locator; `locate()` is `indexOf` over precomputed normalized forms + binary-search offset map) — microseconds per quote.
   - 修复方向: build once per document a cached tokenization + token→positions index (or a locator object like theirs); skip the window slide entirely when the exact/normalized pass already hit; reuse across cells and across the consistency pass.

## 3. 值得考虑 (ours)

1. **`durationMonths` rejects the standard legal drafting form.** `core/matrix.ts:192-198` — "eighteen (18) months" / "ninety (90) days" fail (numeral followed by `)` is not `\s*`), so a correct extraction becomes `constraint_violation` (verified live). Widen the regex to allow a closing paren between numeral and unit, or strip parenthetical numerals first. Related: on violation the core discards the answer entirely (`answer: null`); consider keeping the raw answer visible in exports the way theirs keeps `value` with `valid: false` (script14 `normalizeValue`).
2. **Fuzzy anchors certify.** At the default threshold (score ≥0.7, coverage ≥0.6; `matrix.ts:238-241`) a quote where 4 of 10 tokens differ anchors a cell as `answered` plus a ⚠; the typed-schema badge then prints a parsed amount beside it. Spec discloses the design, but `answered` remains the headline status in JSON and the ⚠ is easy to lose in a 30-column CSV. Consider a distinct status for fuzzy (theirs never marks a cell `ok` when the quote fails to locate: status `review`, reason `quote`).
3. **`parseDate` invents day=1 for month-year strings** (`matrix.ts:174-176`; spec-disclosed). Downstream sorting/dedup treats the invented day as data. Consider recording precision in `SchemaInfo` (theirs' form: "YYYY-MM when the text gives no more; never invent a day or month").
4. **Demo hides the sources audit CSV.** spec.md and README sell `toSourcesCSV` (per-cell verbatim anchor + char span) as a differentiator; `demo/index.html` offers csv/md/json/diff buttons only. One more button.
5. **No review workflow.** Ours ends at exports with an empty reviewer `Verified` CSV column that nothing in the artifact supports end-to-end. Theirs' entire second half is that workflow: marks (reviewer corrections win over model answers — `cleanMark`/`checkStands`), per-cell verified checkmarks (their sample shows 13/104 checked), comments, doc-level flags with meanings, issues-list export with a not-legal-advice footer.

## 4. 仅记录

- Neither side validates that a located quote actually *supports* the answer; both gate on location/typing only and trust the extractor for relevance.
- Their confidence field is model self-report, coerced leniently (unknown → medium; script14 `confidenceOf`).
- Theirs: no numeric bounds, no cross-document consistency pass, no cell-level run-to-run diff, no test suite, single 3.75 MB opaque file with 1.8 MB inlined pdf.js.
- Ours: `git status` flags `examples/matrix.csv` dirty after regeneration on this checkout (CRLF vs autocrlf); content verified byte-identical — a `.gitattributes` eol rule would silence it.
- Ours: pinpoint strings carried unvalidated (spec discloses); theirs validates page numbers against real PDF pages and highlights the quote on the rendered page (script11).
- Our worked example is 3×5 fictional cells; theirs ships 8 documents × 13 columns with partial-read honesty ("1 of 18 pages not read").

## 5. 审阅范围与未覆盖

**核对了 (ours):** full read of spec.md, README.md, core/matrix.ts, core/textutil.ts, demo/index.html + example.js; ran `npx tsx --test core/*.test.ts` (29/29 pass, includes golden-output and core.js parity tests); ran `npx tsx examples/run.ts` and confirmed byte-identical regeneration (only line-ending git noise); live node probes against `core/core.js` for currency/duration/classify parsing, ghost-cell handling, and bestWindow cost; demo loaded at /open-artifacts/tabular-review/demo/index.html (renders, exports wired).

**核对了 (theirs):** notes-for-claude in full (add/run/columns/ask/issues actions, injection defenses, subagent fan-out, notfound discipline); script10.js (locator/normalization) in full; script14.js (parseCurrency, normalizeValue, guessColumn, buildPrompt nonce fencing, validateReply, mergeCandidates, recheckCell/checkPassages, seal/marks, exports) read at the function level; sample-data parsed (53 records: 1 project, 13 columns, 8 docs, 8 rows, 104 cells, statuses 87/16/1); page loaded at /_to_verify/Tabular%20review%20(Copy).html and screenshotted (renders the worked review, filter chips, flags, ask box).

**未覆盖:** their agentic actions (add/run/ask/issues) need a live Claude + ArtifactData backend — not exercisable here, so their end-to-end extraction quality is taken from code + shipped sample, not observed; their pdf.js ingestion path only smoke-checked via the rendered page; their `parseCurrency` correctness hand-traced, not unit-tested (no harness exists on their side); our TS core verified through the generated core.js port, which the parity test pins to matrix.ts. Standards used: spec.md's own IO contract as the baseline for ours; for theirs, the shipped sample + notes as self-description.
