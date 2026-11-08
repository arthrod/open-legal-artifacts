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
- **Renumber-robust pairing**: an A-only claim and a B-only claim that are
  limitation-identical (every limitation pairs at ≥ `exactAt`, same type /
  dependency / transitional) report as **`renumbered`** instead of a false
  removed+added pair. Any real amendment keeps removed+added — conservative
  on purpose.
- **Three-way transitional scope**: `comprising` (open) / `consisting of`
  (closed) / `consisting essentially of` (semi-open) stay distinct; a scope
  change between sets is flagged in the chart.
- **Construction-risk flags** (`flagConstructionRisks`): deterministic regex
  screening for means-for (§112(f) [verify]), configured/adapted/operable-to,
  and substantially/about/approximately — spans included, never construed.
- **Reference mapping** (`mapLimitationsToReference`): maps each limitation
  onto a prior-art reference as `verbatim` (span round-trips to the exact
  quote) / `partial` (lexical overlap, flagged as first pass) / `notFound`
  (honest "no teaching found" row). Lexical only — never "support".
- **Coverage matrix** (`buildClaimReferenceMatrix`): claim × reference table
  flagging `anticipation-candidate` (one ref reads on every limitation) vs
  `combination` (greedy first-fit joint cover, listed — not necessarily
  minimal) vs `gaps` (uncovered
  limitations listed). Coverage counts verbatim or complete token overlap —
  first pass, not a legal conclusion.
- **CSV export** (`toCSV` + `toSourcesCSV`): chart CSV with a `_sources`
  companion carrying span anchors; spreadsheet formula-injection cells
  (`=`, `+`, `-`, `@` starts, tab/CR) are apostrophe-prefixed without
  touching normal text. Demo has a download button.

## IO contract

See [spec.md](spec.md). Minimal use:

```js
import { compareClaimSets, toClaimChart } from './core/core.js';
const result = compareClaimSets(claimsAtext, claimsBtext);
console.log(toClaimChart(result)); // markdown chart
```

## Deterministic vs LLM-assisted

**Deterministic:** everything in the core — parsing, alignment,
classification, spans, counts, rendering, reference-span mapping, risk
flagging, CSV export. Same input → identical chart (covered by a determinism
test).

**LLM-assisted (optional, outside core):** construing limitation meaning
(claim construction) and weighing the mapped disclosures. A prompt schema
with verbatim-quote + `teachingFound: 'none'` constraints is in
[spec.md](spec.md); the core renders any `none` mapping as an explicit
no-teaching row. `mapLimitationsToReference` is the deterministic first pass
the LLM step can build on.

## What's better than the closed counterpart

- **Verifiability**: span anchors mean every cell of the chart can be
  highlighted at source — no trusting a summary.
- **Honest absence**: unmatched limitations are loud rows with a count, not
  dropped or paraphrased into "support".
- **Tunable, disclosed thresholds** instead of hidden prompt judgment.
- **Dependency-change and renumber detection** across claim sets.
- **Machine-checkable reference rows**: every mapped span slices back to the
  exact quote in the reference — no trusting LLM-written pin-cites.
- **Export safety**: CSV with a `_sources` companion and formula-injection
  neutralization, deterministic and tested.
- Zero dependencies, runs offline in browser or Node.

## Run / test

```
node --test core/        # 22 unit tests (node:test)
node examples/run.js     # regenerate examples/output.json + examples/claim-chart.md (incl. coverage matrix)
open demo/index.html     # interactive two-pane comparison + CSV/_sources download
```

## Data sources (future hooks)

Claims can be sourced from open data (USPTO bulk, Google Patents BigQuery);
the core accepts plain text, so any pipeline can feed it. No live API here.
