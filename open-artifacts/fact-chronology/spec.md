# fact-chronology — specification

Open reimplementation of the Anthropic "Fact chronology" legal artifact
(catalog §2.10): builds a dated timeline from fact entries, anchors every
fact to its source document, flags conflicts where sources disagree, and
detects temporal gaps.

## Design split: deterministic core vs. LLM

| Capability | Owner |
|---|---|
| Date normalization (`2024-03-05` / `2024-03` / `2024`; day/month/year precision) | core (deterministic) |
| Timeline ordering (month/year precision sorts at period start) | core (deterministic) |
| De-dupe (same topic + date-compatible + similarity ≥ `mergeThreshold`) | core (deterministic; `mergedFrom` preserves ids) |
| Quote verification against document text (verified / approximate / unfound) | core (deterministic) |
| Significance tie to the case theory (🔴/🟡/⚪ + `[SME VERIFY]`) | core (deterministic key-term score; attorney override) |
| Provenance passthrough (`document | user | unverified`) and `[verify]` rendering | core (deterministic) |
| Privilege posture passthrough (`ok | flag | review`), SoF exclusion of flagged docs | core (deterministic; privilege CALLS belong to counsel) |
| Per-fact source anchors (document + quote + pinpoint) | core (carried verbatim) |
| Conflict flags: `date_mismatch`, `divergent_accounts` | core (deterministic rules) |
| Gap detection between consecutive day-precision entries | core (deterministic) |
| Variants (`working` / `sof` / `witness`) and version diff | core (deterministic) |
| Extracting `{date, topic, text, source}` tuples from documents | LLM (prompt below) |
| Judging whether a flagged conflict is legally material | attorney |

## Input contract (`ChronInput`, JSON)

```jsonc
{
  "caseName": "…",
  "version": 2,                        // timeline version; diffChronology bumps it
  "posture": "A",                       // Step-0 posture gate, recorded in headers
  "theory": {                           // optional: deterministic significance tie
    "name": "retaliation for wage complaints",
    "keyTerms": ["terminated", "final wages"]
  },
  "settings": { "maxGapDays": 90, "accountSimilarityThreshold": 0.35, "mergeThreshold": 0.6 },
  "documents": [ { "id": "compl", "name": "Complaint",
                   "text": "optional full text — enables quote verification",
                   "priv": "ok | flag | review" } ],
  "facts": [
    { "id": "F1",
      "date": "2025-01-09",          // or "2025-01" / "2025"; omit if undated
      "dateLabel": "on or about January 9, 2025",  // how the doc said it
      "topic": "termination",        // conflict-grouping + merge key
      "text": "…statement of fact…",
      "significance": "high",         // optional attorney override of the theory tie
      "source": { "docId": "compl",
                 "quote": "…verbatim quote…",
                 "pinpoint": "¶ 14",
                 "kind": "document | user | unverified" } }
  ]
}
```

Dates the core cannot parse (e.g. `"Spring 2024"`) are **never guessed**: the
fact lands in the undated section and the raw string is reported in
`unparseableDates` for the LLM/human to normalize explicitly.

**De-dupe rule.** Two facts merge into one entry iff they share a `topic`,
their dates agree at the coarser of the two precisions, and text similarity
≥ `mergeThreshold` (default 0.6 — deliberately above the
divergent-accounts threshold so a merge can never hide a conflict;
**enforced**: `buildChronology` throws when `mergeThreshold` ≤
`accountSimilarityThreshold`). Two
day-precision dates that disagree never merge. The first fact in input
order is the entry's primary; `mergedFrom` lists absorbed ids, so the
merge is always reversible.

**Quote verification rule.** When a document carries `text`, each quote is
machine-checked: verbatim substring → `verified`; otherwise best-window
Jaccard score and coverage both ≥ 0.7 → `approximate`; else `unfound`.
No document text → status `null` (unchecked), rendered without a badge.

**Significance rule.** With `theory.keyTerms` present, each key term scores
1 when all its tokens appear in the fact's `topic`+`text`, 0.5 when a
multi-token term is missing exactly one token. Score ≥ 2 → 🔴 high,
≥ 1 → 🟡 medium, else ⚪ low. A fractional (borderline) score takes the
same band but is flagged `[SME VERIFY]`. An explicit `significance` on the
fact overrides the tie and is never flagged.

## Output contract (`ChronOutput`, JSON)

- `timeline` — dated entries sorted ascending; each carries its `date`
  (`{raw, iso, precision}`), `text`, `topic`, `significance` + `smeVerify`,
  `provenance`, `privFlagged`/`privReview`, `mergedFrom`, and `anchors[]`
  (`{docId, docName, quote, pinpoint, priv, quoteStatus}`); `anchor` is the
  first anchor (null when the source doc is unknown).
- `undated` — undated + unparseable entries, kept visible with `dateLabel`.
- `conflicts` — pairs of entries sharing a `topic` (computed after de-dupe):
  - `date_mismatch`: both day-precision and different dates;
  - `divergent_accounts`: text similarity below
    `accountSimilarityThreshold` (default 0.35). This is a **potential
    conflict for attorney review** (impeachment work), not a legal conclusion.
- `gaps` — intervals over `maxGapDays` (default 90) between consecutive
  day-precision entries, with day counts and the bracketing fact ids.
- `summary` — counts for each section, plus `merged` (facts absorbed by
  de-dupe) and `unfoundQuotes`.

`renderChronology(out, { format })` emits deterministic Markdown in three
variants: `working` (the full record — every flag, privilege, provenance),
`sof` (dated, non-privilege-flagged entries only; conflicts/gaps are work
product and stay out), and `witness` (verbatim quotes for refresh plus
impeachment flags). Rendered conflicts and gaps carry `[computed from: …]`
naming their input facts; unverified facts carry `[verify]`.

`diffChronology(prev, next)` compares two versions by fact id and returns
`{ fromVersion, toVersion, added, removed, changed[{factId, fields}],
summary }` — the version bumps by one exactly when anything changed. A
`removed` id that was absorbed by a merge in the newer version is annotated
`(absorbed into …)` in the summary — nothing is ever silently deleted.

## Prompt schema for the LLM part

The LLM structures documents into facts; it never invents dates or quotes:

```jsonc
{ "facts": [ { "id": "F1",
               "date": "2025-01-09",        // ISO only; null if the document
                                          // gives no machine-usable date
               "dateLabel": "on or about January 9, 2025",
               "topic": "termination",      // short slug, consistent per event
               "text": "one sentence of fact",
               "source": { "docId": "compl", "quote": "verbatim span", "pinpoint": "¶ 14" } } ] }
```

Rules for the extractor: one fact per row; `quote` must be verbatim from the
named document (the core machine-checks it against `documents[].text` when
available and badges `approximate`/`unfound` quotes); ambiguous dates go to
`dateLabel` with `date: null` rather than being resolved by the model;
anything the model knows but cannot source goes to `source.kind:
"unverified"` so it renders `[verify]` — fabrication risk is surfaced,
never stripped.

## Determinism

No timestamps or randomness; `examples/run.ts` regenerates byte-identical
outputs.

## Known limits

- Conflict detection is same-`topic` only; topics are supplied upstream, so a
  missed topic label is a missed conflict (and a missed merge).
- `divergent_accounts` measures token dissimilarity; complementary statements
  that share few words can still be flagged — every flag requires attorney
  review anyway.
- Gap detection uses day-precision entries only (month/year entries cannot
  bound a gap reliably).
- De-dupe compares against each group's primary text only (no transitive
  chaining) — two near-duplicates straddling the threshold may both survive
  as entries; that is the conservative direction.
- Quote verification is token-window based: a quote stitched from two
  distant sentences can score `approximate`; `verified` is the only status
  that asserts verbatim presence.
- The significance tie is keyword scoring, not legal judgment; `[SME VERIFY]`
  marks the borderline calls for attorney/SME review.
- Variant exclusion of `priv: "flag"` documents is a drafting aid, not a
  privilege determination — privilege calls belong to counsel.
