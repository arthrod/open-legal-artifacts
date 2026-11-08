# cite-check — specification

Open reimplementation of the Anthropic "Cite check" legal artifact
(catalog §2.5). Verifies quoted passages in a legal document against their
cited source documents and flags quote mismatches, altered numbers, silent
omissions, wrong pinpoints, and missing sources.

## Design split: deterministic core vs. LLM

Everything in `core/` runs **without an LLM** and is fully reproducible:

| Capability | Owner |
|---|---|
| Quote-vs-source string matching (exact / normalized / fuzzy / not_found) | core (deterministic) |
| Number guard: altered numeric tokens cap the class at fuzzy + note | core (deterministic) |
| Omission detection: dropped tokens noted; explicit ellipsis accepted | core (deterministic) |
| Verbatim anchor (source id, page/§/¶ segment, char offsets) + LCS token diff | core (deterministic) |
| Document-side extraction of quotes + footnote pinpoints (`extract.ts`) | core (deterministic) |
| Pinpoint parsing & validation against the located anchor's segment | core (deterministic) |
| Coverage roll-up ("Checked N of M"; unchecked never "confirmed") | core (deterministic) |
| Markdown report generation | core (deterministic) |
| "Does the source actually support the proposition?" | LLM or human (out of core, gated by `propositions.ts`) |

The catalog explicitly calls for this split: "Deterministic core … should be
non-LLM code; the LLM only judges 'does the source support the proposition.'"

## Input contract (`CiteCheckInput`, JSON)

```jsonc
{
  "document": { "name": "Brief name", "text": "…" },   // text optional; used by the extractor
  "fuzzyThreshold": 0.7,              // optional, default 0.7
  "sources": [
    { "id": "depo", "name": "…", "aliases": ["Okafor Deposition"],   // optional aliases
      "text": "…",                                                    // free-text source, OR
      "pages":     [ { "number": 12, "text": "line 1\nline 2" } ],   // \n = line segmentation
      "sections":  [ { "label": "5.2", "text": "…" } ],              // for Tr. page:line checks
      "paragraphs":[ { "number": 8,  "text": "…" } ] }
  ],
  "quotes": [                          // optional — omit to extract from document.text
    { "id": "Q1", "text": "quoted passage",
      "sourceId": "depo",
      "pinpoint": "p. 12",             // optional
      "proposition": "what the quote is offered to prove" }          // optional, LLM-judged
  ]
}
```

## Output contract (`CiteCheckReport`, JSON)

One `QuoteResult` per input quote:

- `classification`: `exact` | `normalized` | `fuzzy` | `not_found`
  - **exact** — quote appears verbatim (whitespace-trimmed) in the source.
  - **normalized** — same tokens modulo case/punctuation/whitespace (best-window Jaccard ≥ 0.95), *unless* a guard fires (below).
  - **fuzzy** — best-window Jaccard ≥ `fuzzyThreshold` (default 0.7) and quote-token coverage ≥ 0.6. Substantial overlap, not verbatim: flagged for human review, never treated as verified.
  - **not_found** — below the fuzzy threshold. The closest window is preserved in `bestCandidate` as evidence only, never as verification.
- `similarity`, `coverage`: the scores behind the classification.
- `anchor` (null for not_found): `{ sourceId, sourceName, segmentKind, segmentLabel, charStart, charEnd, verbatim }`. For near-verbatim quotes the span is LCS-aligned and extended to the end of the quoted sentence, so dropped tail tokens stay inside the anchor instead of being trimmed away.
- `diff`: LCS diff ops quote ↔ anchor span (`equal` / `delete` / `insert` / `replace`, deletes and replaces carry `sourceSpan` char offsets). Machine-checkable evidence for every flag.
- `pinpoint` (when the quote carries one): `parsed` form plus a status:
  `ok` · `mismatch` (e.g. cite says p. 15, quote lives on p. 12) · `unverifiable` (with a truthful detail: *source not provided*, *quote not located in the source*, *source does not declare such segments*, *core does not model footnote/article/clause segments*, *page not line-segmented*) · `unparseable` (syntax not recognized — never guessed).
- `notes`: human-readable findings: number-guard mismatches
  (`quote "120" vs source "90"`), omissions (`omits "on the document"` —
  `— explicit ellipsis, accepted` when the quote marks the cut with `…`/`...`),
  inserted tokens (`inserts "never"`), negation flips (`negation "not" in the
  quote has no counterpart in the located source text — meaning may be
  flipped`), and whether the *proposition* still needs LLM/human judgment.
- `summary`: `total`, per-class counts, `checked` (located = total − not_found),
  `couldNotCheck` (never reported as "confirmed"), `unparseablePinpoints`,
  `pinpointIssues`.

### Deterministic guards

1. **Number guard** — numeric tokens (`34,800` tokenizes as `34` + `800`) are
   multiset-compared between quote and anchor. Any quote-side difference caps
   the classification at fuzzy and is noted. One changed digit in a long quote
   can otherwise still score ≥ 0.95 and pass as "normalized".
2. **Omission detection** — for near-verbatim quotes, tokens present in the
   located span but dropped from the quote are noted verbatim
   (`omits "on the document"`). A quote containing an explicit ellipsis
   (`…` or `...`) marks the omission as accepted. Sentence-bounded: a quote
   that legitimately ends at a sentence boundary is never flagged.
3. **Insertion guard** — tokens present in the quote but absent from the
   located span are noted (`inserts "never"`) and cap the classification at
   fuzzy. A quote must not add words and still pass as near-verbatim.
4. **Negation guard** — negation tokens (`not`, `no`, `never`, `none`,
   `neither`, `nor`, `nobody`, `nothing`, `nowhere`, `cannot`) are
   multiset-compared between quote and anchor. An inserted or dropped negator
   flips meaning, so any divergence is noted
   (`negation "never" in the quote has no counterpart in the located source
   text — meaning may be flipped`) and caps the classification at fuzzy.

Exact-branch anchors are re-verified byte-equal to the trimmed quote
(`anchor.verbatim === quote.trim()`); when the window search ties on a
non-verbatim look-alike (e.g. a case-drifted duplicate sentence), the anchor
falls back to the literal `indexOf` position, so an `exact` verdict always
carries a verbatim anchor.

`renderReport(report)` produces a deterministic Markdown report (coverage
roll-up line, per-quote table, anchored verbatim block quotes, token-diff
marks, notes).

## Pinpoint grammar

Parsed forms (`pinpoint.ts`): `p. 12` · `pp. 12-13` · `at 123` · `§ 5.2` ·
`Sec. 5` · `¶ 8` · `Para. 8` — plus v2: `Tr. 12:4` · `12:4` · `Tr. 12:4-12:8` ·
`12:4-8` · `§§ 5-6` · `Secs. 5.2-5.4` · `¶¶ 7-8` · `id. at 123` · `id. at 12:4` ·
`n. 12` · `art. 3` · `cl. 8`.

Validation never guesses: page:line pinpoints validate only against pages whose
text is line-segmented (`\n`); `§`/`¶` pinpoints into page-only sources are
`unverifiable`, not `ok`; footnote/article/clause pinpoints parse and
round-trip but stay `unverifiable` (the core models no such segments).

## Document-side extractor (`core/extract.ts`)

Deterministic replacement for LLM extraction. When `quotes` is omitted and
`document.text` is given, `runCiteCheck` extracts quotes itself:

- body: `“quoted passage”[1]` or `"quoted passage"[1]`
- footnote: `[1] <source name or alias>[, <pinpoint>][.]` — the source is
  resolved by longest name/alias match (case-insensitive); the remainder after
  the comma is the pinpoint (raw — the engine reports unparseable syntax
  rather than guessing)

Unresolvable footnotes and unmarked quotations become `extractionWarnings`
on the report — never fabricated entries. Messier documents (inline cites,
superscripts, ibid.) are out of grammar: use the LLM extraction path and feed
the explicit `quotes` array.

## Proposition harness (`core/propositions.ts`)

- `buildPropositionPrompt(report)` — structured prompt for the LLM/human stage:
  lists ONLY exact/normalized quotes with their core anchors, instructs the
  judge to rule on support only, never to re-classify.
- `mergeVerdicts(report, verdicts)` — merges verdicts back, gating on the core:
  fuzzy/not_found quotes are `refused` ("not verbatim-verified"), verdicts whose
  echoed `anchorFromCore` does not match the core anchor are refused, unknown
  ids are refused.

```jsonc
// Task (a): extract quotations from the document under review (LLM alternative to extract.ts)
{ "quotes": [ { "id": "Q1", "text": "…", "sourceId": "depo", "pinpoint": "p. 12" } ] }

// Task (b): judge support, ONLY for quotes the core classified exact/normalized
{ "verdicts": [ { "id": "Q1", "proposition": "…", "supported": true | false | "unclear",
                  "reasoning": "…", "anchorFromCore": "<verbatim anchor echoed back>" } ] }
```

The pipeline is: extract (deterministic `extract.ts` or LLM) → **core classifies
+ anchors + guards** → LLM/human judges propositions only for located,
verbatim-verified quotes. Unlocated quotes (`not_found`) skip the LLM entirely.

## Determinism

No timestamps, no randomness, no network. Same input file → byte-identical
`output.json` and `report.md` (see `examples/run.ts`). `core/core.js` is a
hand-port kept at output parity with the TypeScript core by
`core/parity.test.ts`.

## Known limits

- Matching is token-based (alphanumeric + interior dots), but altered numbers
  are caught by the number guard, and commas split large numbers
  (`12,480` → `12` + `480`) — changes inside either piece still trip the guard.
- Pinpoint validation compares only against segments the source declares;
  `§`/`¶` pinpoints into page-only sources are `unverifiable`, not `ok`.
- Omission notes are sentence-bounded and capped at 30 extended tokens;
  multi-sentence tail drops are reported as a lower bound.
- Full reporter-aware citation parsing (eyecite-style) is out of scope for the
  core; pinpoints are expected as a dedicated field or in the extractor's
  footnote grammar.
