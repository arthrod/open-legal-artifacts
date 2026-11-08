# sell-side-qa-log

Open reimplementation of Anthropic's **Sell-side Q&A log** artifact — buyer
questions during diligence — where **contradiction detection is the core**:
deterministic heuristics cross-examine every answer (numbers by canonical
unit and magnitude, terms by antonym pairs) and quote the evidence for each
flag. Answers carry data-room citations, the approve→send release gate is
code with an audit trail, and buyer isolation is a function.

## What it does

- Workflow state per item: answer history (`draft` / `sent` with dates) →
  canonical answer (latest sent), pending draft (newer than the sent answer),
  status `open → draft → sent → draft-pending`.
- **Citations on answers** — `citations: [{ docId, locator, quote }]` are
  structured source links that survive CSV/JSON/report export and feed the
  readiness score's provenance component.
- `detectContradictions(input)` — pairwise within each category (opt-in
  cross-category, keyword-anchored), across buyers:
  `number_conflict` (disjoint values in the same canonical unit;
  `$3.5 million` ≡ `$3,500,000`; bare counts need a shared keyword anchor)
  and `antonym_conflict` (rules-as-data pairs like `permitted`/`prohibited`,
  `yes`/`no`; quotes ≥3 words). Every conflicting unit and pair fires;
  pending drafts are compared against everything already sent in scope;
  same-item answers are never compared (revision ≠ contradiction). Every
  flag carries verbatim evidence quotes.
- **Release gate as code** — `transition(item, { type: "approve",
  approver, at })` records the approval audit trail; `transition(item,
  { type: "send" })` throws on an unapproved draft.
  `releaseBlockers(item, contradictions)` lists unapproved drafts and every
  contradiction involving the item.
- `buyerView(log, buyerId)` — buyer-safe projection: only that buyer's
  items appear, cross-buyer contradictions are redacted, summary and
  readiness recomputed; feeds `qaLogToCsv`/`qaLogToJson` directly.
- **SLA aging** — `receivedAt` + `settings.asOf` → `daysOpen` (date math,
  no clock) and SLA bands (default warn 3d / breach 5d); overdue count in
  summary and report.
- `readinessScore(input, contradictions)` — coverage (×0.4) + pipeline
  (×0.15) + consistency (×0.25) + provenance (cited sent answers, ×0.2);
  weights and bands are rules-as-data.
- Export **JSON** (version-control friendly) and **CSV** (whole log with
  citations, aging, flags).

## Run

```bash
node --test "core/*.test.js"   # 30 tests (node:test)
node examples/run.js           # builds the example log → output.json, qa-log.csv, report.md
```

Open `demo/index.html` for the interactive demo (readiness score,
contradiction cards with evidence, a live pre-send gate on Q-005's pending
draft, buyer filter with scoped CSV export).

## What's better than the closed counterpart

1. **Contradictions as a first-class output.** The closed artifact tracks
   answers; this core cross-examines them and quotes the evidence — before
   an inconsistent statement reaches a second buyer.
2. **Source links that survive export.** Citations are structured data on
   the answer, not product-internal links.
3. **Drafts checked pre-send.** A pending draft is compared against
   everything already sent while it is still editable.
4. **Release gate as code** — approve→send is a testable function with a
   named-approver audit trail; unapproved sends throw.
5. **Auditable readiness score** — formula, weights, and bands are
   rules-as-data, not a black box.
6. **Ethical wall as a function** — `buyerView` is a redacted projection
   you control; sharing between teams is not a vendor setting.

## Layout

- `spec.md` — IO contract, schemas, drafting prompt schema, determinism
- `core/core.js` — dependency-free ES module (browser + Node)
- `core/core.test.js` — node:test suite
- `examples/` — fictional worked example + runner + outputs
- `demo/index.html` — standalone demo using the shared design tokens

## Disclaimer
All example data fictional. Conflict flags are keyword/number heuristics for
attorney review, not legal conclusions. Not legal advice.
