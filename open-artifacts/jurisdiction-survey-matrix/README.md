# jurisdiction-survey-matrix

Open reimplementation of Anthropic's **Jurisdiction survey matrix** — one
table comparing a legal topic across states or countries — with a hard
cite-before-claim contract: **unverified cells are never guessed.**

## What it does

- Jurisdictions × legal-questions matrix from JSON input.
- Every populated cell carries answer + source citation + verification date +
  verified-by; anything less renders as an explicit **UNVERIFIED** cell with
  the reason.
- Stale cells (older than the configurable `maxAgeDays` policy) keep their
  content but carry a re-verification warning.
- Coverage stats and CSV + Markdown exports where UNVERIFIED stays explicit.

## Run

```bash
node --test            # 10 tests (node:test)
node examples/run.js   # builds the 7×4 worked example, writes matrix.json, survey.csv, survey.md
```

Open `demo/index.html` for the interactive demo.

## What's better than the closed counterpart

1. **Structural anti-hallucination.** The catalog itself rates this artifact
   family the highest hallucination risk. Here the validator *is* the render
   path: no citation + verification date → no answer text, in the UI, the
   CSV, and the Markdown alike.
2. **Verification dates and staleness policy.** Law changes; the 180-day
   window (configurable rules-as-data) plus per-cell verified-by makes the
   survey's age auditable.
3. **Coverage stats up front** — 8/28 verified (29%) in the worked example is
   visible immediately; gaps can't hide in a wall of green.
4. **LLM output starts unverified.** An optional research-draft prompt
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
