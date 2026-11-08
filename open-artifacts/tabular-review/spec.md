# tabular-review — specification

Open reimplementation of the Anthropic "Tabular review" legal artifact
(catalog §2.1): a documents × questions comparison table where every answered
cell is source-anchored and **unverified cells are never guessed**.

## Design split: deterministic core vs. LLM

| Capability | Owner |
|---|---|
| Cell verification: answer's quote must locate in the document | core (deterministic) |
| Anchor: classification, similarity, char span, verbatim quote, pinpoint | core (deterministic) |
| Typed-answer schema enforcement (classify/date/duration/currency/number/verbatim) | core (deterministic) |
| Not-found state mapping (`not_present`/`unclear`/`needs_review`) | core (deterministic) |
| Cross-document consistency pass (minority classify values flagged) | core (deterministic) |
| `unverified` classification with machine reasons | core (deterministic) |
| CSV (RFC-4180, reviewer `Verified` column), sources CSV, Markdown, re-run diff | core (deterministic) |
| Reading documents and drafting candidate answers/quotes | LLM (prompt below) |

## Input contract (`MatrixInput`, JSON)

```jsonc
{
  "documents": [ { "id": "nda-1", "name": "NDA (draft 2)", "text": "…" } ],
  "questions": [
    { "id": "Q1", "question": "What is the term?" },              // untyped => free text
    { "id": "Q4", "question": "Is assignment permitted?",
      "type": "classify", "options": ["yes", "no", "consent required"] },
    { "id": "Q1b", "question": "Term length?", "type": "duration",
      "bounds": { "min": 1, "max": 120, "unit": "months" } }
  ],
  "fuzzyThreshold": 0.7,                    // optional, default 0.7
  "cells": [
    { "documentId": "nda-1", "questionId": "Q1",
      "answer": "3 years from the Effective Date",   // null/omitted => unverified
      "quote": "continues for three (3) years",      // REQUIRED to be answered
      "pinpoint": "§ 2" },                           // optional
    { "documentId": "nda-1", "questionId": "Q9",
      "notFound": "not_present" }                    // extractor's explicit state
  ]
}
```

Missing cell entries are treated as `answer: null` — the matrix always covers
the full documents × questions grid.

### Typed questions (`Question.type`)

`classify` (answer must match an `options` entry, case/whitespace-folded;
longest contained option wins), `date` (must parse as a calendar date;
month-year strings such as `March 2025` are accepted leniently and resolve
to the 1st of that month),
`duration` (parsed to canonical months; `bounds` may set `unit`
days|weeks|months|years, default months), `currency` (must carry a parseable
amount like `$50,000` or `50,000 USD`), `number`, `verbatim` (answer must
appear in the document text), `free`/omitted (no schema check). A
quote-verified answer that fails its schema becomes `unverified` with reason
`constraint_violation`; the parsed result is recorded in `cell.schema`
(`matched` option, `value` + `unit`).

### Not-found states

A cell may instead carry `notFound: "not_present" | "unclear" |
"needs_review"` — three extractor assertions the deal team acts on
differently. Each maps to an `unverified` cell with that exact reason,
taking precedence over `answer`.

## Output contract (`MatrixOutput`, JSON)

One `Cell` per document × question:

- `status: "answered"` — only when a non-empty answer carries a quote that
  locates in the document AND satisfies the question's typed schema, if any:
  - `exact` — quote is a verbatim substring;
  - `normalized` — same tokens modulo case/punctuation (≥ 0.95);
  - `fuzzy` — substantial overlap at `fuzzyThreshold`; the answer stands but
    is counted in `summary.flaggedForReview` (⚠ in exports).
  - `verification` carries `{classification, similarity, charStart, charEnd,
    verbatim, pinpoint}`; `schema` carries the parsed typed result.
- `status: "unverified"` with `unverifiedReason`:
  `not_answered` (no answer supplied) · `missing_quote` (answer without a
  source) · `quote_not_verified` (quote does not locate in the document —
  e.g. a hallucinated or stale quote) · `no_such_document` ·
  `constraint_violation` (typed schema failed) · `not_present` · `unclear` ·
  `needs_review`.

`summary.columns[]` reports the verification workload per question
(`answered`, `unverified`, `outliers`, per-reason counts).

### Consistency pass

After per-cell verification the core runs a deterministic cross-document
check over each `classify` column: answered cells whose matched option is a
minority (count ≤ max(1, 10% of the answered column)) are flagged
`outlier_value` — the answer is kept, the flag surfaces in exports and
`summary.outliers`.

### Exports

- `toCSV` — RFC-4180 escaping; anchors inline as `[§ 2]`; unverified cells
  render `UNVERIFIED (reason)`; trailing empty `Verified` column for
  reviewer sign-off.
- `toSourcesCSV` — per-cell audit companion (one row per cell: document,
  question, verbatim anchor, char span, pinpoint, classification/reason).
- `toMarkdown` — pipes escaped, `⚠ quote fuzzy — review` and
  `⚠ outlier_value` markers.
- `diffMatrices(prev, next)` — deterministic re-run diff: per-cell
  added/removed/changed (status, answer, classification, reason), with a
  summary count.

## Templates

`templates/ma-diligence.json` is a typed `Question[]` for a fictional M&A
diligence question set; the demo loads the same set via
`demo/templates.js` (a parity test keeps the two from drifting).

## Prompt schema for the LLM part

The LLM drafts cells but cannot self-certify; the core decides:

```jsonc
{ "cells": [ { "documentId": "nda-1", "questionId": "Q1",
               "answer": "3 years from the Effective Date",
               "quote": "continues for three (3) years",   // copy verbatim
               "pinpoint": "§ 2" } ] }
// If the document does not state the answer, emit answer: null — never infer.
// If the document plainly does not address the question, emit
// notFound: "not_present" | "unclear" | "needs_review" instead of guessing.
```

Pipeline: extract texts → LLM drafts cells → **core verifies every quote and
schema** → matrix + exports. A cell whose quote fails verification ships as
UNVERIFIED, which is the artifact's core promise.

## Determinism

No timestamps/randomness; `examples/run.ts` regenerates byte-identical
`output.json`, `matrix.csv`, `matrix.md`, and `diff.json` (the re-run diff
after the extractor corrects the one rejected quote).

## Known limits

- Verification is per-document text; page-level pinpoints require the
  document text to be page-segmented upstream (pinpoint is carried, not
  validated here — see the cite-check core for that).
- The outlier heuristic is a flag for reviewers, not a legal conclusion.
- Version staleness (a newer amendment replacing the text) is out of scope;
  re-run the pipeline on the current text and diff via `diffMatrices`.
