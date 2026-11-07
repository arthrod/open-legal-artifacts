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
- `buildBoard(snapshot, asOf)` — stage columns, deadline-sorted, overdue /
  due-soon flags.
- Export diff as **JSON** (version-control friendly) and **CSV**.

## Run

```bash
node --test            # 11 tests (node:test)
node examples/run.js   # diffs the week-44→week-45 example, writes diff.json, diff.csv, board.json, report.md
```

Open `demo/index.html` for the interactive demo (board + changelog + exports).

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
