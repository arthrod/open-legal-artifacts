# regulatory-horizon-scan

Open reimplementation of Anthropic's **Regulatory horizon scan** artifact —
*"laws on one timeline, scored for impact"* — with the two things the closed
version lacks: a **transparent, versioned scoring rubric** and a **diff view
when a rule changes**.

## What it does

- **Dedupe** a JSON feed of regulatory items (multiple sources, one rule).
- **Classify** each item by topic (keyword taxonomy in the rubric) and
  normalized jurisdiction (US states, US-FED, EU, …).
- **Score** impact 0–100 via a rules-as-data rubric — every point comes with
  factor, rule, and reason. Rubric versions are diffable.
- **Timeline** by effective date, ranked by score.
- **Diff** two feed snapshots (field-level changes: status, effective date, …).
- **Export CSV.**

## Run

```bash
node --test            # 12 tests (node:test)
node examples/run.js   # regenerates examples/scan.json, scan.csv, report.md
```

Open `demo/index.html` for the interactive demo (prefilled worked example;
no build step, no dependencies).

## What's better than the closed counterpart

1. **Auditable scoring.** Anthropic's impact ranking is opaque. Here the rubric
   is versioned data (`examples/input.json`), each score carries a full
   breakdown, and `diffRubrics` shows exactly what changed between versions.
2. **Diff view.** The closed artifact snapshots; this core diffs — added,
   removed, and per-field changes between feed snapshots.
3. **No hidden clock.** All time math anchors to a caller-supplied `asOf`, so
   scans are reproducible byte-for-byte.
4. **LLM never scores.** The deterministic core does dedupe/classify/score/
   diff/export; a model (optional) only structures raw regulator text into
   feed items (prompt schema in `spec.md`).

## Layout

- `spec.md` — IO contract, deterministic-vs-LLM split, prompt schema
- `core/core.js` — dependency-free ES module (browser + Node)
- `core/core.test.js` — node:test suite
- `examples/` — fictional worked example + runner + generated outputs
- `demo/index.html` — standalone demo using the shared design tokens

## Disclaimer

Jurisdiction codes, taxonomy, and weights are configurable rules-as-data with
sensible US defaults. All example data is fictional. Not legal advice.
