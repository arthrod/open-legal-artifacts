# tabular-review — specification

Open reimplementation of the Anthropic "Tabular review" legal artifact
(catalog §2.1): a documents × questions comparison table where every answered
cell is source-anchored and **unverified cells are never guessed**.

## Design split: deterministic core vs. LLM

| Capability | Owner |
|---|---|
| Cell verification: answer's quote must locate in the document | core (deterministic) |
| Anchor: classification, similarity, char span, verbatim quote, pinpoint | core (deterministic) |
| `unverified` classification with machine reasons | core (deterministic) |
| CSV (RFC-4180) and Markdown export with anchors preserved | core (deterministic) |
| Reading documents and drafting candidate answers/quotes | LLM (prompt below) |

## Input contract (`MatrixInput`, JSON)

```jsonc
{
  "documents": [ { "id": "nda-1", "name": "NDA (draft 2)", "text": "…" } ],
  "questions": [ { "id": "Q1", "question": "What is the term?" } ],
  "fuzzyThreshold": 0.7,                    // optional, default 0.7
  "cells": [
    { "documentId": "nda-1", "questionId": "Q1",
      "answer": "3 years from the Effective Date",   // null/omitted => unverified
      "quote": "continues for three (3) years",      // REQUIRED to be answered
      "pinpoint": "§ 2" }                            // optional
  ]
}
```

Missing cell entries are treated as `answer: null` — the matrix always covers
the full documents × questions grid.

## Output contract (`MatrixOutput`, JSON)

One `Cell` per document × question:

- `status: "answered"` — only when a non-empty answer carries a quote that
  locates in the document:
  - `exact` — quote is a verbatim substring;
  - `normalized` — same tokens modulo case/punctuation (≥ 0.95);
  - `fuzzy` — substantial overlap at `fuzzyThreshold`; the answer stands but
    is counted in `summary.flaggedForReview` (⚠ in exports).
  - `verification` carries `{classification, similarity, charStart, charEnd,
    verbatim, pinpoint}`.
- `status: "unverified"` with `unverifiedReason`:
  `not_answered` (no answer supplied) · `missing_quote` (answer without a
  source) · `quote_not_verified` (quote does not locate in the document —
  e.g. a hallucinated or stale quote) · `no_such_document`.

Exports: `toCSV` (RFC-4180 escaping; anchors inline as `[§ 2]`; unverified
cells render `UNVERIFIED (reason)`) and `toMarkdown` (pipes escaped, `⚠ quote
fuzzy — review` markers).

## Prompt schema for the LLM part

The LLM drafts cells but cannot self-certify; the core decides:

```jsonc
{ "cells": [ { "documentId": "nda-1", "questionId": "Q1",
               "answer": "3 years from the Effective Date",
               "quote": "continues for three (3) years",   // copy verbatim
               "pinpoint": "§ 2" } ] }
// If the document does not state the answer, emit answer: null — never infer.
```

Pipeline: extract texts → LLM drafts cells → **core verifies every quote** →
matrix + exports. A cell whose quote fails verification ships as UNVERIFIED,
which is the artifact's core promise.

## Determinism

No timestamps/randomness; `examples/run.ts` regenerates byte-identical
`output.json`, `matrix.csv`, `matrix.md`.

## Known limits

- Verification is per-document text; page-level pinpoints require the
  document text to be page-segmented upstream (pinpoint is carried, not
  validated here — see the cite-check core for that).
- Version staleness (a newer amendment replacing the text) is out of scope;
  re-run the pipeline on the current text and diff.
