# venture-term-sheet-benchmark

Open counterpart of Wilson Sonsini's venture term sheet benchmark (Claude
for Legal partner gallery). Compares term-sheet terms against a **dated,
sourced, editable** market grid:

- per-term verdicts: `inside_market` / `outside_market` (with direction or
  the standard set) / `unknown_value_type` / `no_benchmark` — never a guess;
- every verdict cites its benchmark entry's source and as-of date;
- structural enums cite the public NVCA Model Legal Documents; numeric
  ranges ship as loudly labeled example defaults — swap in your own dated
  market data via `withGrid()`;
- staleness warning when the sheet's vintage postdates the grid.

## Run

```bash
node --test "core/*.test.js"     # 10 tests
node examples/run.js             # regenerates output.json + benchmark.md
```

Demo: `demo/index.html` (standalone, shared design tokens, prefilled with
the fictional Quillform Analytics series A — investor-favorable sheet,
6 outside-market terms).

## Better than the closed counterpart

WSGR's benchmark rides a private deal base you can't inspect. This one
makes the grid itself the product: visible, versioned, dated, swappable —
and honest about every term it can't benchmark. Verdicts describe distance
from a grid, not deal quality. Not legal advice.
