# regulatory-horizon-scan — open artifact spec

Open reimplementation of Anthropic's "Regulatory horizon scan" artifact
(catalog §2.2): *"Maps upcoming regulations on a timeline, based on the
company's business and where it operates, ranked by impact, with links to
sources."*

## What it does

Takes a **feed of regulatory items as JSON** (from Federal Register API,
EUR-Lex, state legislature trackers, or manual entry), then deterministically:

1. **Dedupe** the feed (same rule surfacing from multiple sources).
2. **Classify** each item by topic (via a versioned taxonomy) and jurisdiction
   (normalized codes).
3. **Score** each item for impact against a **transparent, versioned scoring
   rubric** (rules-as-data: every point is auditable and re-runnable).
4. **Timeline** — items sorted by effective date, ranked by score.
5. **Diff view** — when a rule changes between two feed snapshots (status,
   effective date, amended text), show exactly what changed, field by field;
   rubric version changes are diffed too.
6. **Export CSV.**

## IO contract

```js
import {
  dedupeItems, classifyItem, scoreItem, scanFeed,
  diffFeeds, diffRubrics, toCsv
} from "./core/core.js";

scanFeed(items, rubric, profile, asOf) // => { rubricVersion, items: [...], duplicates: [...], timeline: [...] }
diffFeeds(previousItems, currentItems) // => { added, removed, changed }
diffRubrics(previousRubric, currentRubric)
toCsv(scan)                            // => CSV string
```

- `items`: `[{ id, title, jurisdiction, status, effectiveDate?, publishedDate?, summary?, source?, link? }]`
- `rubric`: `{ version, factors: [...], topicTaxonomy: { topic: [keywords] } }` — see `examples/input.json`.
- `profile`: `{ jurisdictions: ["US-FED", "US-CA"], coreTopics: ["privacy", "ai"], relatedTopics: ["employment"] }`
- `asOf`: ISO date string. **No hidden clocks** — all time-dependent math is
  anchored to the caller-supplied `asOf`, so a scan is byte-for-byte reproducible.

## Deterministic vs LLM-assisted

| Layer | Who | Why |
|---|---|---|
| Dedup, classification, scoring, diffing, timeline, CSV | **code** | auditable, reproducible, cheap |
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
    "effectiveDate": "YYYY-MM-DD | null",
    "publishedDate": "YYYY-MM-DD | null",
    "summary": "<=60 words, no legal conclusions",
    "source": "source name",
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
- **Diff view when a rule changes** — the closed artifact shows a snapshot;
  this core diffs two snapshots (and two rubrics) field-by-field.
- **No hidden clock** — scans are reproducible against a supplied `asOf`.
- **Dependency-free core** — runs in browser and Node, exports CSV, no
  platform lock-in.

## Legal accuracy disclaimer

Jurisdiction codes, topic taxonomy, and scoring weights are **configurable
rules-as-data** with sensible US defaults. Nothing here is legal advice; a
regulatory item's true business impact requires lawyer review.
