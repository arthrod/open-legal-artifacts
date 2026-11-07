# intake-benchmark

Open counterpart of Harvey Intake (Claude for Legal partner gallery). Instead
of *being* an intake product, it benchmarks any intake flows — software or a
human paper process — on one explicit, vendor-neutral rubric.

Dimensions (all formulas in `spec.md`): completeness, non-redundancy,
fallback quality, speed, retention → weighted composite, ranks, side-by-side
MD/CSV tables. Unmeasured data is a blank, never a guessed zero.

## Run

```bash
node --test "core/*.test.js"     # 14 tests
node examples/run.js             # regenerates output.json, comparison.csv/.md
```

Demo: `demo/index.html` (standalone, shared design tokens, prefilled with
the fictional Bertram & Ozawa example: guided web form vs. legacy paper
intake).

## Better than the closed counterpart

Harvey cannot fairly benchmark itself against your phone-and-paper process.
This rubric scores both first-class, states every formula, and keeps the
optional LLM step limited to observable-fact extraction. Fictional data;
not legal advice.
