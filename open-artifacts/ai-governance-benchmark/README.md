# ai-governance-benchmark

Open counterpart of Goodwin's closed "AI governance benchmark" (Claude for
Legal partner gallery). Scores an AI-governance assessment against a fully
transparent, versioned rubric: per-pillar maturity, weighted overall score,
evidence-backed gap list, Markdown report.

- **Deterministic core** — scoring, weighting, gaps, exports are pure
  dependency-free JS; no LLM needed to run it. The optional LLM step only
  interviews the user and never assigns levels itself (see `spec.md`).
- **Rules-as-data** — question bank, pillar weights, framework mappings, and
  maturity bands live in one versioned block in `core/core.js`; fork the data,
  not the logic.
- **Framework-grounded** — every gap cites NIST AI RMF / ISO/IEC 42001
  structures by name. Not legal advice; original questions, no clone of any
  firm's proprietary questionnaire.

## Run

```bash
node --test "core/*.test.js"     # 13 tests
node examples/run.js             # regenerates examples/output.json + report.md
```

Demo: open `demo/index.html` (standalone, styled with the shared design
tokens; prefilled with the fictional Northlake Logistics example).

## Better than the closed counterpart

Goodwin's moat is its questionnaire; ours ships the rubric, the weights, and
the framework citations in the open, so any org can run, audit, re-weight,
and compare — and unanswered questions are flagged, never guessed.

All names, sectors, and evidence in `examples/` are fictional.
