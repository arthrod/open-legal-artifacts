# cite-check — specification

Open reimplementation of the Anthropic "Cite check" legal artifact
(catalog §2.5). Verifies quoted passages in a legal document against their
cited source documents and flags quote mismatches, wrong pinpoints, and
missing sources.

## Design split: deterministic core vs. LLM

Everything in `core/` runs **without an LLM** and is fully reproducible:

| Capability | Owner |
|---|---|
| Quote-vs-source string matching (exact / normalized / fuzzy / not_found) | core (deterministic) |
| Verbatim anchor with source id, page/§/¶ segment, char offsets | core (deterministic) |
| Pinpoint parsing (`p. 12`, `pp. 12-13`, `at 123`, `§ 5.2`, `Sec. 5`, `¶ 8`, `Para. 8`) | core (deterministic) |
| Pinpoint validation against the located anchor's segment | core (deterministic) |
| Markdown report generation | core (deterministic) |
| "Does the source actually support the proposition?" | LLM or human (out of core) |

The catalog explicitly calls for this split: "Deterministic core … should be
non-LLM code; the LLM only judges 'does the source support the proposition.'"

## Input contract (`CiteCheckInput`, JSON)

```jsonc
{
  "document": { "name": "Brief name" },
  "fuzzyThreshold": 0.7,              // optional, default 0.7
  "sources": [
    { "id": "depo", "name": "…", "text": "…" },                    // free-text source, OR
    { "id": "msa", "name": "…",
      "pages":     [ { "number": 12, "text": "…" } ],              // any mix of
      "sections":  [ { "label": "5.2", "text": "…" } ],            // segment arrays
      "paragraphs":[ { "number": 8,  "text": "…" } ] }             // (validated pinpoints)
  ],
  "quotes": [
    { "id": "Q1", "text": "quoted passage",
      "sourceId": "depo",
      "pinpoint": "p. 12",            // optional
      "proposition": "what the quote is offered to prove" }        // optional, LLM-judged
  ]
}
```

## Output contract (`CiteCheckReport`, JSON)

One `QuoteResult` per input quote:

- `classification`: `exact` | `normalized` | `fuzzy` | `not_found`
  - **exact** — quote appears verbatim (whitespace-trimmed) in the source.
  - **normalized** — same tokens modulo case/punctuation/whitespace (best-window Jaccard ≥ 0.95).
  - **fuzzy** — best-window Jaccard ≥ `fuzzyThreshold` (default 0.7) and quote-token coverage ≥ 0.6. Substantial overlap, not verbatim: flagged for human review, never treated as verified.
  - **not_found** — below the fuzzy threshold. The closest window is preserved in `bestCandidate` as evidence only, never as verification.
- `similarity`, `coverage`: the scores behind the classification.
- `anchor` (null for not_found): `{ sourceId, sourceName, segmentKind, segmentLabel, charStart, charEnd, verbatim }` — the located verbatim span in the source.
- `pinpoint` (when the quote carries one): `parsed` form plus a status:
  `ok` · `mismatch` (e.g. cite says p. 15, quote lives on p. 12) · `unverifiable` (source declares no comparable segments) · `unparseable` (syntax not recognized — never guessed).
- `notes`: human-readable findings, including whether the *proposition* still needs LLM/human judgment.

`renderReport(report)` produces a deterministic Markdown report (summary line,
per-quote table, anchored verbatim block quotes).

## Prompt schema for the LLM part

The LLM never classifies quote fidelity. Its only job in the full artifact is
(a) extracting quote/pinpoint pairs from the reviewed document and (b) judging
proposition support. Suggested structured prompt output:

```jsonc
// Task (a): extract quotations from the document under review
{ "quotes": [ { "id": "Q1", "text": "…", "sourceId": "depo", "pinpoint": "p. 12" } ] }

// Task (b): judge support, ONLY for quotes the core classified exact/normalized
{ "verdicts": [ { "id": "Q1", "proposition": "…", "supported": true | false | "unclear",
                  "reasoning": "…", "anchorFromCore": "<verbatim anchor echoed back>" } ] }
```

The pipeline is: extract → **core classifies + anchors** → LLM/human judges
propositions only for located quotes. Unlocated quotes (`not_found`) skip the
LLM entirely; there is nothing to judge against.

## Determinism

No timestamps, no randomness, no network. Same input file → byte-identical
`output.json` and `report.md` (see `examples/run.ts`).

## Known limits

- Matching is token-based (alphanumeric + interior dots), so altered numbers
  (`90` → `120`) lower similarity by one token; they surface as `normalized`
  or `fuzzy`, and the `verbatim` anchor exposes the true figure.
- Pinpoint validation compares only against segments the source declares;
  `§`/`¶` pinpoints into page-only sources are `unverifiable`, not `ok`.
- Full reporter-aware citation parsing (eyecite-style) is out of scope for
  the core; pinpoints are expected as a dedicated field, not parsed out of
  prose footnotes.
