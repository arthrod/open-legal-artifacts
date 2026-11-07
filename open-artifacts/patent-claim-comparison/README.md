# patent-claim-comparison

> Parse patent claims into numbered limitations, compare claim set A vs B
> limitation-by-limitation, and emit matched / added / removed / modified rows
> with span anchors. "No teaching found" rows are explicit — never guessed.
> Open counterpart to Anthropic's "Patent claim comparison" artifact.

**Fictional data only. Not legal advice; charts are attorney work product.**

## What it does

- **Clause splitter**: claim text → preamble (number, transitional phrase,
  dependency) + numbered limitations split at `;` / `wherein` / `whereby`,
  each with `[start,end)` span anchors into the original text.
- **Comparison**: greedy stable best-match alignment (Jaccard over
  stopword-trimmed tokens); pairs classify as `matched` (sim ≥ 0.96) or
  `modified` (≥ 0.45); A-only limitations are `removed`, B-only are `added`.
- **Never-guess rule**: any limitation without a counterpart produces an
  explicit row — *"no teaching found in set B — absent, not inferred"* — and
  a counter of such rows in the totals. Silence never implies a teaching.
- **Dependency flags**: `The system of claim 1` → `claim 2` changes are
  surfaced per claim.

## IO contract

See [spec.md](spec.md). Minimal use:

```js
import { compareClaimSets, toClaimChart } from './core/core.js';
const result = compareClaimSets(claimsAtext, claimsBtext);
console.log(toClaimChart(result)); // markdown chart
```

## Deterministic vs LLM-assisted

**Deterministic:** everything in the core — parsing, alignment,
classification, spans, counts, rendering. Same input → identical chart
(covered by a determinism test).

**LLM-assisted (optional, outside core):** mapping limitations onto a
prior-art reference's disclosure and claim construction. A prompt schema with
verbatim-quote + `teachingFound: 'none'` constraints is in [spec.md](spec.md);
the core renders any `none` mapping as an explicit no-teaching row.

## What's better than the closed counterpart

- **Verifiability**: span anchors mean every cell of the chart can be
  highlighted at source — no trusting a summary.
- **Honest absence**: unmatched limitations are loud rows with a count, not
  dropped or paraphrased into "support".
- **Tunable, disclosed thresholds** instead of hidden prompt judgment.
- **Dependency-change detection** across claim sets.
- Zero dependencies, runs offline in browser or Node.

## Run / test

```
node --test core/        # 12 unit tests (node:test)
node examples/run.js     # regenerate examples/output.json + examples/claim-chart.md
open demo/index.html     # interactive two-pane comparison
```

## Data sources (future hooks)

Claims can be sourced from open data (USPTO bulk, Google Patents BigQuery);
the core accepts plain text, so any pipeline can feed it. No live API here.
