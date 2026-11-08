# jurisdiction-survey-matrix

Open reimplementation of Anthropic's **Jurisdiction survey matrix** — one
table comparing a legal topic across states or countries — with a hard
cite-before-claim contract: **unverified cells are never guessed.**

## What it does

- Jurisdictions × legal-questions matrix from JSON input.
- Every populated cell carries answer + source citation + **sourceUrl linking
  the underlying law** (`policy.requireSourceUrl`, default on) + verification
  date + verified-by; anything less renders as an explicit **UNVERIFIED** cell
  with the reason.
- Optional verbatim `quotedText` powers a figure-consistency check: digits in
  the answer missing from the quote are flagged (warning-only).
- Input integrity: duplicates, orphan cells, and empty lists produce
  `matrix.warnings` — nothing is dropped silently.
- Stale cells (older than the configurable `maxAgeDays` policy) keep their
  content but carry a re-verification warning.
- Coverage stats (overall + per-jurisdiction + per-question), a prioritized
  re-verification worklist (`toWorklist`), and CSV + Markdown exports where
  UNVERIFIED stays explicit and citations render as links.
- Demo loads your own survey (paste JSON or file, as-of picker) — client-side
  only, no data leaves the machine.

## Run

```bash
node --test            # 16 tests (node:test)
node examples/run.js   # builds the 7×4 worked example, writes matrix.json, survey.csv, survey.md
```

Open `demo/index.html` for the interactive demo.

## What's better than the closed counterpart

1. **Structural anti-hallucination.** The catalog itself rates this artifact
   family the highest hallucination risk. Here the validator *is* the render
   path: no citation + source link + verification date → no answer text, in
   the UI, the CSV, and the Markdown alike. The counterpart's link to the law
   is decoration; ours is a render precondition.
2. **Figure-consistency against the quoted source.** Transcribed numbers are
   the #1 hallucination vector in survey tables — digits in an answer that the
   verbatim quote doesn't contain are flagged for re-checking.
3. **Verification dates and staleness policy, with an actionable gap queue.**
   Law changes; the 180-day window (configurable rules-as-data) plus per-cell
   verified-by makes the survey's age auditable, and `toWorklist` turns stale
   + unverified cells into a prioritized re-verification queue.
4. **Coverage stats up front** — 8/28 verified (29%) in the worked example is
   visible immediately, with per-jurisdiction bars; gaps can't hide in a wall
   of green.
5. **Input integrity** — duplicate or orphan cells warn instead of vanishing.
6. **LLM output starts unverified.** An optional research-draft prompt
   (spec.md) explicitly returns silence when it can't find an authoritative
   source; a human records the citation to promote the cell.

## Layout

- `spec.md` — IO contract, cell validation rules, research-draft prompt schema
- `core/core.js` — dependency-free ES module (browser + Node)
- `core/core.test.js` — node:test suite
- `examples/` — fictional worked example + runner + outputs
- `demo/index.html` — standalone demo using the shared design tokens

## Disclaimer

All example data fictional (fictionalized statute analogs, invented
jurisdiction takes). Re-verify against current law before any reliance.
Not legal advice.
