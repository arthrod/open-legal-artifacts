# regulatory-horizon-scan — open artifact spec

Open reimplementation of Anthropic's "Regulatory horizon scan" artifact
(catalog §2.2): *"Maps upcoming regulations on a timeline, based on the
company's business and where it operates, ranked by impact, with links to
sources."*

## What it does

Takes a **feed of regulatory items as JSON** (from Federal Register API,
EUR-Lex, state legislature trackers, or manual entry), then deterministically:

1. **Dedupe** the feed (same rule surfacing from multiple sources). Duplicates
   are *merged*, not discarded: fields missing on the kept item are filled
   from the duplicate (richest source wins) and `mergedFrom` records the drop.
2. **Classify** each item by topic (via a versioned taxonomy) and jurisdiction
   (normalized codes).
3. **Score** each item for impact against a **transparent, versioned scoring
   rubric** (rules-as-data: every point is auditable and re-runnable). The
   rubric may include a `commentWindow` factor — an open comment deadline
   within the threshold earns points; closed or absent windows earn none.
   Two deterministic **band caps** (score is never altered, only the band,
   with a flag): `itemType` ANPR/RFI items are capped below "high"
   (pre-rule exploratory — never "always material"), and non-`primary`
   provenance is capped at "medium" with a "trace to primary" flag.
4. **Timeline** — milestones (effective date *and* comment deadline), split
   into upcoming/past at `asOf`; undated items are kept in their own section,
   never dropped. Each scan item carries
   `actionBy = min(effectiveDate, commentDeadline)`.
5. **Coverage check (Step 0)** — `coverageGaps` lists profile jurisdictions
   (severity high), core topics (medium), and related topics (low) with zero
   feed items.
6. **Diff view** — when a rule changes between two feed snapshots (status,
   effective date, comment deadline, itemType, provenance, amended text),
   show exactly what changed, field by field; rubric version changes are
   diffed too.
7. **Export** — CSV (breakdown + flags serialized per row) and a Markdown
   digest (`toMarkdown`) with a "Bottom line" (action-item count + earliest
   action date), coverage gaps, and a per-band, per-item breakdown.

## IO contract

```js
import {
  dedupeItems, classifyItem, scoreItem, scanFeed, buildTimeline,
  coverageGaps, diffFeeds, diffRubrics, toCsv, toMarkdown, normalizeProvenance
} from "./core/core.js";

scanFeed(items, rubric, profile, asOf)   // => { rubricVersion, items, duplicates, timeline: {upcoming, past, undated}, coverageGaps }
coverageGaps(items, profile, rubric?)    // => [{kind, value, severity, note}]
diffFeeds(previousItems, currentItems)   // => { added, removed, changed }
diffRubrics(previousRubric, currentRubric)
toCsv(scan)                              // => CSV string
toMarkdown(scan)                         // => digest Markdown string
```

- `items`: `[{ id, title, jurisdiction, status, itemType?, effectiveDate?, commentDeadline?, publishedDate?, summary?, source?, provenance?, link? }]`
  - `itemType`: `rule | NPRM | ANPR | RFI | ...` — ANPR/RFI items get the
    pre-rule band cap.
  - `commentDeadline`: `YYYY-MM-DD | null` — feeds the `commentWindow`
    factor and the timeline comment-deadline milestones.
  - `provenance`: `primary | secondary | manual | unknown` — missing or
    unrecognized values are treated as `unknown`; anything non-`primary`
    caps the band at "medium" with a trace-to-primary flag.
- `rubric`: `{ version, factors: [...], topicTaxonomy: { topic: [keywords] } }` — see `examples/input.json`.
- `profile`: `{ jurisdictions: ["US-FED", "US-CA"], coreTopics: ["privacy", "ai"], relatedTopics: ["employment"] }`
- `asOf`: ISO date string. **No hidden clocks** — all time-dependent math is
  anchored to the caller-supplied `asOf`, so a scan is byte-for-byte reproducible.

## Deterministic vs LLM-assisted

| Layer | Who | Why |
|---|---|---|
| Dedup/merge, classification, scoring, band caps, coverage check, diffing, timeline, CSV/MD export | **code** | auditable, reproducible, cheap |
| Turning raw regulator HTML/PDF into the JSON feed items | optional LLM | extraction only; prompt below |
| Choosing rubric weights | **human** | policy judgment, versioned in data |

### LLM prompt schema (extraction step, optional)

```json
{
  "task": "Extract regulatory items from the provided document into the feed schema.",
  "output_schema": {
    "id": "stable-kebab-id",
    "title": "verbatim or near-verbatim rule title",
    "jurisdiction": "ISO-ish code: US-FED | US-XX | EU | UK | ...",
    "status": "proposed | final | effective | rumored",
    "itemType": "rule | NPRM | ANPR | RFI",
    "effectiveDate": "YYYY-MM-DD | null",
    "commentDeadline": "YYYY-MM-DD | null",
    "publishedDate": "YYYY-MM-DD | null",
    "summary": "<=60 words, no legal conclusions",
    "source": "source name",
    "provenance": "primary | secondary | manual | unknown",
    "link": "URL or null"
  },
  "rules": ["Never invent dates; omit rather than guess.", "Quote titles verbatim where possible."]
}
```

The LLM never scores, never ranks, never decides impact. If it feeds the scan,
its output is data the rubric can be re-run against.

## What's better than the closed counterpart

- **Transparent, versioned scoring rubric** — Anthropic's impact ranking is
  opaque; here every point of every score carries a factor name, a rule, and a
  reason string (`scoreItem().breakdown`), and rubric versions are diffable.
- **Deterministic provenance + stage discipline** — the counterpart states
  source tiers and ANPR/RFI caution as LLM prose; here they are code:
  non-primary sources are band-capped with a trace-to-primary flag, and
  ANPR/RFI items are capped below "high". Comment deadlines score, appear as
  timeline milestones, and land in the digest's bottom line.
- **Coverage check (Step 0)** — profile jurisdictions/topics with zero feed
  items are surfaced with severity before any ranking happens.
- **Diff view when a rule changes** — the closed artifact shows a snapshot;
  this core diffs two snapshots (and two rubrics) field-by-field.
- **No hidden clock** — scans are reproducible against a supplied `asOf`.
- **Dependency-free core** — runs in browser and Node, exports CSV + a
  Markdown digest, no platform lock-in.

## Legal accuracy disclaimer

Jurisdiction codes, topic taxonomy, and scoring weights are **configurable
rules-as-data** with sensible US defaults. Nothing here is legal advice; a
regulatory item's true business impact requires lawyer review.
