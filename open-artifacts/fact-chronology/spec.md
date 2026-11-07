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
| Per-fact source anchors (document + quote + pinpoint) | core (carried verbatim) |
| Conflict flags: `date_mismatch`, `divergent_accounts` | core (deterministic rules) |
| Gap detection between consecutive day-precision entries | core (deterministic) |
| Extracting `{date, topic, text, source}` tuples from documents | LLM (prompt below) |
| Judging whether a flagged conflict is legally material | attorney |

## Input contract (`ChronInput`, JSON)

```jsonc
{
  "caseName": "…",
  "settings": { "maxGapDays": 90, "accountSimilarityThreshold": 0.35 },
  "documents": [ { "id": "compl", "name": "Complaint" } ],
  "facts": [
    { "id": "F1",
      "date": "2025-01-09",          // or "2025-01" / "2025"; omit if undated
      "dateLabel": "on or about January 9, 2025",  // how the doc said it
      "topic": "termination",        // conflict-grouping key
      "text": "…statement of fact…",
      "source": { "docId": "compl", "quote": "…verbatim quote…", "pinpoint": "¶ 14" } }
  ]
}
```

Dates the core cannot parse (e.g. `"Spring 2024"`) are **never guessed**: the
fact lands in the undated section and the raw string is reported in
`unparseableDates` for the LLM/human to normalize explicitly.

## Output contract (`ChronOutput`, JSON)

- `timeline` — dated entries sorted ascending; each carries its `date`
  (`{raw, iso, precision}`), `text`, `topic`, and full `anchor`
  (`{docId, docName, quote, pinpoint}`).
- `undated` — undated + unparseable entries, kept visible with `dateLabel`.
- `conflicts` — pairs of facts sharing a `topic`:
  - `date_mismatch`: both day-precision and different dates;
  - `divergent_accounts`: text similarity below
    `accountSimilarityThreshold` (default 0.35). This is a **potential
    conflict for attorney review** (impeachment work), not a legal conclusion.
- `gaps` — intervals over `maxGapDays` (default 90) between consecutive
  day-precision entries, with day counts and the bracketing fact ids.
- `summary` — counts for each section.

`renderChronology(out)` emits deterministic Markdown (timeline, undated,
conflicts, gaps).

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
named document (the cite-check core can verify it); ambiguous dates go to
`dateLabel` with `date: null` rather than being resolved by the model.

## Determinism

No timestamps or randomness; `examples/run.ts` regenerates byte-identical
outputs.

## Known limits

- Conflict detection is same-`topic` only; topics are supplied upstream, so a
  missed topic label is a missed conflict.
- `divergent_accounts` measures token dissimilarity; complementary statements
  that share few words can still be flagged — every flag requires attorney
  review anyway.
- Gap detection uses day-precision entries only (month/year entries cannot
  bound a gap reliably).
