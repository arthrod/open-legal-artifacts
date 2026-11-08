# venture-term-sheet-benchmark

Open counterpart of Wilson Sonsini's venture term sheet benchmark (Claude
for Legal partner gallery). Compares term-sheet terms against a **dated,
sourced, editable** market grid:

- per-term verdicts: `inside_market` / `outside_market` (with direction or
  the standard set) / `unknown_value_type` / `no_benchmark` — never a guess;
- every outside-market row carries a **favor direction** (investor /
  company) — who the off-market drift benefits;
- optional p25/p50/p75 **distribution bands** on range entries place a value
  in the distribution (“above p75”) — always labeled EXAMPLE percentiles;
- **typo guard**: an enum value matching no grid vocabulary anywhere (e.g.
  `participatng`) is `unknown_value_type` with a suggested correction —
  never a false off-market flag;
- **flag kind** scores boolean terms (e.g. `founder_vesting_restart`) with
  real verdicts instead of `no_benchmark`;
- every verdict cites its benchmark entry's source and as-of date, and
  every known term links to the public NVCA model docs (`TERM_CATALOG`);
- structural enums cite the public NVCA Model Legal Documents; numeric
  ranges ship as loudly labeled example defaults — swap in your own dated
  market data via `withGrid()` (per-entry merge: override one term, keep
  the rest of the round);
- staleness warning when the sheet's vintage postdates the grid;
- exports: Markdown (`exportMd`) and CSV (`exportCsv`, one row per term).

## Run

```bash
node --test "core/*.test.js"     # 20 tests
node examples/run.js             # regenerates output.json + benchmark.md
```

Demo: `demo/index.html` (standalone, shared design tokens, prefilled with
the fictional Quillform Analytics series A — investor-favorable sheet,
7 outside-market terms, CSV download).

## Better than the closed counterpart

WSGR's benchmark rides a private deal base you can't inspect. This one
makes the grid itself the product: visible, versioned, dated, swappable —
and honest about every term it can't benchmark. Verdicts describe distance
from a grid, not deal quality. Not legal advice.
