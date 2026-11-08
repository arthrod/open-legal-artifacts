# regulatory-horizon-scan

Open reimplementation of Anthropic's **Regulatory horizon scan** artifact —
*"laws on one timeline, scored for impact"* — with the two things the closed
version lacks: a **transparent, versioned scoring rubric** and a **diff view
when a rule changes**.

## What it does

- **Dedupe + merge** a JSON feed of regulatory items (multiple sources, one
  rule): duplicates fill missing fields on the kept item (richest wins) and
  `mergedFrom` records every drop.
- **Classify** each item by topic (keyword taxonomy in the rubric) and
  normalized jurisdiction (US states, US-FED, EU, …).
- **Score** impact 0–100 via a rules-as-data rubric — every point comes with
  factor, rule, and reason. Rubric versions are diffable. A `commentWindow`
  factor rewards open comment deadlines (≤30d in the default rubric).
- **Deterministic guardrails** — `itemType` ANPR/RFI is capped below "high"
  (pre-rule exploratory); non-`primary` provenance caps the band at "medium"
  with a trace-to-primary flag. Scores are never silently altered.
- **Coverage check (Step 0)** — profile jurisdictions/topics with zero feed
  items are reported with severity.
- **Timeline** by `actionBy = min(effectiveDate, commentDeadline)` — upcoming,
  past, and undated sections; comment-deadline milestones included; nothing
  dropped.
- **Diff** two feed snapshots (field-level changes: status, dates, itemType,
  provenance, …).
- **Export** CSV (breakdown + flags per row) and a Markdown digest
  (`toMarkdown`) with a "Bottom line", coverage gaps, and per-item breakdowns.

## Run

```bash
node --test core/core.test.js  # 26 tests (node:test)
node examples/run.js          # regenerates examples/scan.json, scan.csv, digest.md, report.md
```

Open `demo/index.html` for the interactive demo (prefilled worked example;
editable rubric weights, coverage-gap chips, timeline sections, diff view,
CSV + digest export; no build step, no dependencies — relative imports are
inlined by `deploy/build-site.mjs` at bundle time).

## What's better than the closed counterpart

1. **Auditable scoring.** Anthropic's impact ranking is opaque. Here the rubric
   is versioned data (`examples/input.json`), each score carries a full
   breakdown, and `diffRubrics` shows exactly what changed between versions.
2. **Deterministic provenance & stage discipline.** The counterpart's
   source-tier and ANPR/RFI policies are LLM prose; here they are tested code:
   non-primary sources are band-capped with a trace-to-primary flag, ANPR/RFI
   items never reach "high", and comment deadlines score and appear as
   timeline milestones.
3. **Coverage check.** Profile jurisdictions/topics absent from the feed are
   surfaced with severity before ranking (Step 0).
4. **Diff view.** The closed artifact snapshots; this core diffs — added,
   removed, and per-field changes between feed snapshots.
5. **No hidden clock.** All time math anchors to a caller-supplied `asOf`, so
   scans are reproducible byte-for-byte.
6. **LLM never scores.** The deterministic core does dedupe/merge/classify/
   score/diff/export; a model (optional) only structures raw regulator text
   into feed items (prompt schema in `spec.md`).

## Layout

- `spec.md` — IO contract, deterministic-vs-LLM split, prompt schema
- `core/core.js` — dependency-free ES module (browser + Node)
- `core/core.test.js` — node:test suite
- `examples/` — fictional worked example + runner + generated outputs
  (`scan.json`, `scan.csv`, `digest.md`, `report.md`)
- `demo/index.html` — standalone demo using the shared design tokens

## Disclaimer

Jurisdiction codes, taxonomy, and weights are configurable rules-as-data with
sensible US defaults. All example data is fictional. Not legal advice.
