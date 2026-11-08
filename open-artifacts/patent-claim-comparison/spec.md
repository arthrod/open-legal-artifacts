# Spec — patent-claim-comparison

## Purpose
First-pass claim charting: parse patent claims into numbered limitations
(preamble + clauses at `;` / `wherein` / `whereby` boundaries), then compare
claim set A vs set B limitation-by-limitation, classifying each pair
**matched / modified / added / removed** with span anchors into the source
text. Limitations with no counterpart are reported as explicit
**"no teaching found"** rows — never guessed, never silently omitted.

## Interface (core/core.js, dependency-free ES module)

| Export | Purpose |
|---|---|
| `tokenize(text)` | Stopword-trimmed token set (legalese like "said"/"comprising" excluded from scoring) |
| `similarity(a, b)` | Jaccard similarity 0..1 |
| `parseClaim(claimText)` | `{number, preamble{span}, transitional, dependsOn, limitations[{id,text,span}], type}` |
| `parseClaimSet(text)` | Multi-claim document → parsed claims (split on leading "N.") |
| `compareLimitations(limsA, limsB, thresholds?)` | Greedy stable best-match alignment → `{rows, counts}` |
| `compareClaimSets(setA, setB, thresholds?)` | Claim-by-claim pairing by claim number; limitation-identical A-only/B-only pairs → `renumbered` (conservative) → `{claims, totals, noTeachingFound}` |
| `mapLimitationsToReference(claim, refText, thresholds?)` | Limitation → reference rows: `verbatim` (span round-trips to exact quote) / `partial` (lexical, `tokenCoverage`) / `notFound`; `{partialAt: 0.5}` |
| `flagConstructionRisks(claim)` | Deterministic spans for means-for / configured-adapted-operable-to / substantially-about-approximately; never construes |
| `buildClaimReferenceMatrix(claims, refs, thresholds?)` | Claim × reference coverage → `anticipation-candidate` / `combination` (greedy first-fit cover, input order — not necessarily minimal) / `gaps`; coverage = verbatim or complete token overlap |
| `toCSV(result)` | Chart CSV; formula-injection cells (=+-@ starts, tab/CR) apostrophe-prefixed |
| `toSourcesCSV(result)` | `_sources` companion CSV: one row per chart row with span anchors |
| `toClaimChart(result)` | Markdown chart; every row explicit; flags transitional-scope changes |

Thresholds (rules-as-data): `{ exactAt: 0.96, modifiedAt: 0.45 }` — tune per
practice; matching is deterministic (ties broken by index order), so identical
inputs always yield byte-identical charts.

## IO contract

```
input:  { setA: "<claims text>", setB: "<claims text>" }   // or parsed arrays
row:    { relation: 'matched'|'modified'|'removed'|'added',
          aId, aText, aSpan:[start,end), bId, bText, bSpan, similarity, note }
claims: [{ claimNo, aClaim, bClaim, dependencyChanged, transitionalChanged,
           result: 'compared'|'claim renumbered in set B'|'claim removed in set B'|'claim added in set B',
           renumberedTo?, comparison:{rows,counts} }]
refRow: { id, text, span, state: 'verbatim'|'partial'|'notFound',
          quote, refSpan, tokenCoverage?, note }
```

## Deterministic vs LLM-assisted

- **Deterministic (core):** parsing, alignment, classification, similarity,
  span anchors, chart rendering, dependency-change detection.
- **LLM-assisted (optional, outside core):** construing limitation meaning
  (claim construction), mapping a limitation to a prior-art *reference's*
  disclosure paragraphs, drafting prosecution/invalidity argument prose.

### LLM prompt schema (for the reference-mapping step, when wired)

```json
{
  "task": "Map each claim limitation to the reference's disclosure, or mark no teaching.",
  "claim": { "number": 1, "limitations": [{ "id": "L1", "text": "..." }] },
  "reference": { "id": "US-2010-9999999-A1 (fictional)", "text": "..." },
  "output_schema": {
    "rows": [{ "limitationId": "L1", "disclosureSpan": [1204, 1388] | null,
               "verbatimQuote": "string | null",
               "teachingFound": "direct | implicit | none" }],
    "unsupported_rows": ["L1"]
  },
  "constraints": [
    "disclosureSpan must index into reference.text verbatim; quote must be exact.",
    "If you cannot find verbatim support, teachingFound='none' — never paraphrase as support.",
    "Mark uncertain mappings in unsupported_rows instead of guessing."
  ]
}
```

The deterministic chart then merges these rows; any `teachingFound:'none'`
renders as an explicit "no teaching found" row with **no** similarity score
invented for it.

## Better than the closed counterpart

1. **Explicit no-teaching rows** with a guarantee written into tests — absence
   is absence, never inferred support.
2. **Span anchors on both sides** — every row is verifiable against source
   text (charts are attorney work product; pinpoints matter).
3. **Tunable thresholds as data**, disclosed up front, instead of a hidden
   prompt's judgment.
4. **Dependency tracking** — claim-reference changes (`of claim 5` → `of
   claim 7`) are flagged, a classic reexam/ILP trap.
5. Deterministic, offline, zero dependencies, testable.

## Non-goals
No patent data ingestion (wire Google Patents BigQuery / USPTO bulk data
upstream — see README), no claim-construction opinions, no infringement
conclusions.

## Disclaimers
Fictional example data. First-pass tooling only; charts require attorney
review and are work product. Not legal advice.
