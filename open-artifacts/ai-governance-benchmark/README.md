# ai-governance-benchmark

Open counterpart of Goodwin's closed "AI governance benchmark" (Claude for
Legal partner gallery). Scores an AI-governance assessment against a fully
transparent, versioned rubric: per-pillar maturity, weighted overall score,
evidence-backed gap list, Markdown report.

- **Deterministic core** — scoring, weighting, gaps, ranked actions,
  fictional-cohort percentiles, re-run diffs, and MD/CSV exports are pure
  dependency-free JS; no LLM needed to run it. The optional LLM step only
  interviews the user and never assigns levels itself (see `spec.md`).
- **Rules-as-data** — question bank, pillar weights (incl. named sector
  presets), framework mappings (NIST AI RMF, ISO/IEC 42001, and illustrative
  EU AI Act arts. 5–15 refs tagged `[verify]`), high-risk flags, and maturity
  bands live in one versioned block in `core/core.js`; fork the data, not the
  logic.
- **Framework-grounded** — every gap cites published structures by name, and
  `result.actions[]` ranks what to address first (pillar weight × (3 − level)
  × high-risk ×1.5, ties in bank order). Not legal advice; original
  questions, no clone of any firm's proprietary questionnaire.

## Run

```bash
node --test "core/*.test.js"     # 25 tests
node examples/run.js             # regenerates examples/output.json + report.md
```

Demo: open `demo/index.html` — a guided interview (0–3 buttons + evidence per
question) that builds the assessment JSON, then scores it: ranked next
actions, fictional-cohort percentiles, re-run diff, MD + CSV export. Standalone
in-repo via relative imports (`tokens.css`, `../core/core.js`) which
`deploy/build-site.mjs` inlines at build time; prefilled with the fictional
Northlake Logistics example.

## Better than the closed counterpart

Goodwin's moat is its questionnaire; ours ships the rubric, the weights, and
the framework citations in the open, so any org can run, audit, re-weight
(`SECTOR_PRESETS`), benchmark (`compare()` against a clearly-labeled
fictional cohort), re-assess (`diffAssessments()`), and act (`actions[]`)
— and unanswered questions are flagged, never guessed.

All names, sectors, evidence, and cohort percentiles in `examples/` are
fictional/illustrative.
