# Planner — run 7290de40 participant 29

Recon complete — no execution tool exists in this session (only three domain-rule skills), so the test suite can't be run live; I have in-repo recorded evidence instead. Counterpart source, our core, tests, spec, demo, and README are all read. Here is the deliverable.

---

**1) THEIR EDGE** — evidence: `corporate-legal/skills/tabular-review/SKILL.md`, anthropics/claude-for-legal (fetched today, raw.githubusercontent.com)
- Typed column system (`verbatim/classify/date/duration/currency/number/free`) + reusable `.review-schema.yaml`, `--template ma-diligence`, re-runs.
- Three explicit not-found states (`not_present/unclear/needs_review`) vs our single `not_answered`.
- Normalization pass: cross-doc classify outliers, format consistency, implausible values (99-yr term), >10% column flags.
- Rich audit surface: values CSV + `_sources.csv`, xlsx/Sheets with hidden source columns, state colors, reviewer `Verified` column, per-column verification-workload summary.
- Sample-run-first (3–5 docs) before fan-out; whole-document reads.

**2) OUR GAPS (top 5)**
1. Free-text questions only — no typed/classify schema, no templates.
2. `not_answered` collapses not_present/unclear/needs_review — loses the distinction deal teams act on.
3. No per-column summary or cross-document consistency checks.
4. README claims "re-run diffing" + "question templates you own"; core implements neither (honesty gap vs their working `--schema`).
5. One-file CSV/MD export only — no sources companion, no reviewer sign-off column; pinpoint carried unvalidated.

**3) IMPROVEMENTS**
- **I1 Typed questions** — optional `type`+`options`+bounds on Question; core enforces classify/date/duration/currency deterministically → new reason `constraint_violation`. Beats theirs: their types are prompt advice, ours are machine-checked. Test: classify value ∉ options → unverified(constraint_violation). **M** · core/matrix.ts, matrix.test.ts, spec.md.
- **I2 Not-found states** — cells may carry `notFound: not_present|unclear|needs_review`; maps to unverified with that reason. Test: `notFound:'unclear'` → reason `unclear`. **S** · core/matrix.ts.
- **I3 Per-column summary** — `summary.columns[]` = verification workload per question. Test: 2×3 fixture → Q3 col = 1 not_present, 1 answered. **S** · core/matrix.ts.
- **I4 Consistency pass** — deterministic cross-doc checks: minority classify values (count ≤ max(1,10% of column)) flagged `outlier_value` (answer kept); duration/currency outside schema bounds flagged. Beats theirs: enforced, not prompted. Test: 1-of-5 unique classify value → flagged. **M** · core/matrix.ts.
- **I5 Re-run diff** — `diffMatrices(prev,next)` → per-cell {added,removed,status/classification changed}; example emits `diff.json`. Delivers the README claim theirs lacks entirely. Test: change 1 answer → exactly 1 changed cell. **M** · core/matrix.ts, examples/run.ts.
- **I6 Audit exports** — `toSourcesCSV` (doc,question,verbatim,span,pinpoint,classification) + empty `Verified` column in main CSV. Test: sources rows == cells; header has Verified. **S** · core/matrix.ts.
- **I7 Templates** — `templates/ma-diligence.json` (typed fictional questions) + demo dropdown. Test: template parses as Question[]. **S** · templates/, demo/index.html.

**4) VERIFIABLE-BETTER CLAIM** — we verify 100% of quotes against source text (exact/normalized/fuzzy + char span) in an LLM-free, dependency-free core; theirs re-reads a 10% sample with an LLM. Proof: `npx tsx --test core/*.test.ts` — the `quote_not_verified` test is a hallucinated quote theirs can miss; I1–I6 then convert their prompt-only disciplines (types, states, normalization, workload) into tested machine behavior.

**5) RISKS** — backward compat (new fields must keep old inputs byte-identical; pin with a golden-output test); fuzzy matcher cost on 200-doc runs (keep consistency pass O(cells)); demo must stay single-file with arthur.law tokens; all changes confined to this artifact dir; failing-test-first per repo constraint.

**Tests:** not executable in this read-only session (no shell/process tool; tool_search confirms none). Recorded in-repo evidence [evidence/test-run.log](tmp/open-legal-artifacts/evidence/test-run.log) (2026-11-07): tabular-review tsx — 11 tests, 11 pass, 0 fail; current suite on disk is those 11 tests, unchanged since.

DONE_WITH_CONCERNS