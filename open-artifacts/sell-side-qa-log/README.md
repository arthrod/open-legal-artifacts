# sell-side-qa-log

Open reimplementation of Anthropic's **Sell-side Q&A log** artifact — buyer
questions during diligence — where **contradiction detection is the core**:
deterministic heuristics cross-examine every answer (numbers by unit, terms
by antonym pairs) and quote the evidence for each flag.

## What it does

- Workflow state per item: answer history (`draft` / `sent` with dates) →
  canonical answer (latest sent), pending draft (newer than the sent answer),
  status `open → draft → sent → draft-pending`.
- `detectContradictions(input)` — pairwise within each category, across
  buyers: `number_conflict` (disjoint values in the same unit; bare counts
  need a shared keyword anchor) and `antonym_conflict` (rules-as-data pairs
  like `permitted`/`prohibited`, `yes`/`no`). Pending drafts are compared
  against every sent answer in the category — inconsistencies surface before
  they are sent. Same-item answers are never compared (revision ≠
  contradiction). Every flag carries verbatim evidence quotes.
- `readinessScore(input, contradictions)` — coverage (sent answers, ×0.5) +
  pipeline (no open items, ×0.2) + consistency (no contradicted items, ×0.3);
  weights and bands are rules-as-data.
- Export **JSON** (version-control friendly) and **CSV** (whole log with
  flags).

## Run

```bash
node --test "core/*.test.js"   # 16 tests (node:test)
node examples/run.js           # builds the example log → output.json, qa-log.csv, report.md
```

Open `demo/index.html` for the interactive demo (readiness score,
contradiction cards with evidence, buyer filter, exports).

## What's better than the closed counterpart

1. **Contradictions as a first-class output.** The closed artifact tracks
   answers; this core cross-examines them and quotes the evidence — before an
   inconsistent statement reaches a second buyer.
2. **Drafts checked pre-send.** A pending draft is compared against
   everything already sent in its category while it is still editable.
3. **Auditable readiness score** — formula, weights, and bands are
   rules-as-data, not a black box.
4. **Buyer-isolated by construction** — the log is plain JSON you host;
   per-buyer views are a `buyerId` filter, no vendor access control.

## Layout

- `spec.md` — IO contract, schemas, drafting prompt schema, determinism
- `core/core.js` — dependency-free ES module (browser + Node)
- `core/core.test.js` — node:test suite
- `examples/` — fictional worked example + runner + outputs
- `demo/index.html` — standalone demo using the shared design tokens

## Disclaimer

All example data fictional. Conflict flags are keyword/number heuristics for
attorney review, not legal conclusions. Not legal advice.
