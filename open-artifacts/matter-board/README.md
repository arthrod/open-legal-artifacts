# matter-board

Open reimplementation of Anthropic's **Matter board** — one board of open
matters with owner, next step, next deadline — where **change detection is
the core**: field-level diffs between snapshots, each change timestamped and
severity-classified.

## What it does

- `diffSnapshots(prev, curr)` — added/removed matters + per-field changes
  with `changedAt` (matter `updatedAt` when present, else snapshot
  `capturedAt`; provenance recorded) and severity (deadline changes are
  **critical**, configurable rules-as-data).
- `buildBoard(snapshot, asOf)` — stage columns (custom `stageOrder` orders the
  front; stages it omits are appended, so every filtered matter is shown and
  counts always agree), deadline-sorted, overdue /
  due-soon flags; optional `owner` / `risk` filters; rollup counts
  (`counts.matters`, `counts.risk`, `counts.conflictsOpen`).
- `detectAnomalies(snapshot, asOf)` — `stale` (default >30d), `missing-field`,
  `closed-with-deadline`; rules (`staleDays`, `required`, `closedStage`) are
  data, overridable per call.
- `csvToSnapshot(csv, { capturedAt, source })` — spreadsheet → snapshot
  (RFC4180 subset), zero LLM; capture time never guessed.
- Export a diff as **JSON** (version-control friendly) or **CSV**; flagged
  deadlines as all-day **ICS** (`flaggedToIcs`).

## Run

```bash
node --test            # 23 tests (node:test)
node examples/run.js   # diffs the week-44→week-45 example, writes diff.json, diff.csv, board.json, report.md
```

Open `demo/index.html` — loads the worked example by default, and you can
paste your own snapshot JSON (+ previous snapshot for a diff) and an `asOf`
date to render a live board client-side with the same `core.js`.

## What's better than the closed counterpart

1. **The diff is the product.** "A board built from emails ages from day
   one" — the board here is a view; the auditable object is the timestamped,
   field-by-field change log between snapshots, with provenance for every
   timestamp.
2. **Severity as rules-as-data** — a firm can make owner changes critical
   (conflicts) by editing one object; deadline changes default to critical.
3. **Deadline risk anchored to a caller-supplied date** — reproducible,
   testable, no hidden clocks.
4. **Open exports** — JSON + CSV, no platform lock-in.

## Layout

- `spec.md` — IO contract, snapshot schema, extraction prompt schema
- `core/core.js` — dependency-free ES module (browser + Node)
- `core/core.test.js` — node:test suite
- `examples/` — fictional worked example + runner + outputs
- `demo/index.html` — standalone demo using the shared design tokens

## Disclaimer

All example data fictional. Extraction (emails → snapshots) may be
LLM-assisted, but diffs, severity, and timestamps are pure code.
Not legal advice.
