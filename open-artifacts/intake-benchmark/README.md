# intake-benchmark

Open counterpart of Harvey Intake (Claude for Legal partner gallery). Instead
of *being* an intake product, it benchmarks any intake flows — software or a
human paper process — on one explicit, vendor-neutral rubric.

Dimensions (all formulas in `spec.md`): completeness, non-redundancy,
fallback quality, speed, retention → weighted composite, ranks, side-by-side
MD/CSV tables. Unmeasured data is a blank, never a guessed zero.

Beyond the base rubric:

- **Canon library** — four practice-area starter canons (housing,
  immigration, family, consumer), every field tagged
  `core | deadline | conflict`. Illustrative, `[verify]` against local rules.
- **Risk dimensions** — `deadline_capture` and `conflict_check` score
  deadline/conflict field capture separately; unasked critical fields are
  listed per flow (`missing_critical`).
- **Rank stability** — `rankStability()` re-scores over deterministic
  perturbed-weight grids (dimension drops + ±25% mixes); robust/fragile
  verdict with flip counts.
- **Fair mode** — `config.fairMode` recomputes composites on the dimensions
  every flow has, so measured telemetry can't beat an unmeasured rival.
- **Capture QA** — `validateCapture()` audits the optional LLM capture step
  against the documented schema (missing purposes, >7-day latencies,
  out-of-bounds abandonment).
- **Drift diff** — `compare()` diffs two runs: per-dimension deltas + rank
  flips. See `examples/drift.md`.

## Run

```bash
node --test "core/*.test.js"     # 34 tests
node examples/run.js             # regenerates output.json, comparison.csv/.md, drift.json/.md
```

Demo: `demo/index.html` (standalone, shared design tokens, prefilled with
the fictional Bertram & Ozawa example: guided web form vs. legacy paper
intake; canon picker + rank-stability badge).

## Better than the closed counterpart

Harvey cannot fairly benchmark itself against your phone-and-paper process.
This rubric scores both first-class, states every formula, measures legal
risk (deadline/conflict capture) instead of asserting quality, puts error
bars on its own rankings, and keeps the optional LLM step limited to
observable-fact extraction — then audits it. Fictional data; not legal
advice.
