# Planner — run 7290de40 participant 20

Recon complete — their side is verified from the launch article and the Apache-2.0 repo (fetched on-run); our artifact read in full. Deliverable:

**1) THEIR EDGE** (evidence: launch article, fetched today; anthropics/claude-for-legal repo, fetched today)
- Works on contract **sets** with playbooks via connectors (Ironclad/Ivo) — no manual structuring. Ours needs pre-extracted clauses.
- **Feedback loop**: deviation-log.yaml → `playbook-monitor` agent: ≥5 same-direction deviations/12mo → Revise/Clarify/Flag proposal (verified in repo agent file).
- **Actionable escalation**: `escalation-flagger` drafts the approver ask; DocuSign routes envelopes in approver order.
- **Redline output**: vendor-agreement-review = "deviation-by-deviation memo with specific redline language".
- **Sales-vs-purchasing polarity**, learned by cold-start, applied per review.

**2) OUR GAPS (top 5)**
1. One contract/run; no portfolio rollup.
2. Routing is a label — no decision log, re-run diff, or drift detection.
3. No side/polarity concept.
4. No suggested-fix (redline) text per deviation.
5. demo/index.html **not self-contained** (external tokens.css, example.js, fonts/) — breaches constraint + Val Town inlining. (Minor: "three" vs "3" unnormalized.)

**3) IMPROVEMENTS** (all deterministic, no new deps, failing-test-first)
1. **Decision log + board diff** — `decide(board, decisions)`, `diffBoards(a,b)`→new/resolved/changed rows. Beats: their amendment tracing is LLM prose; ours byte-deterministic. Test: C2 tier 1→2 ⇒ `changed`. M. new `core/diff.ts` + `core/board.test.ts`.
2. **Drift detector** — `detectDrift(log,{threshold:5,lookbackMonths:12})`→per-rule Revise/Clarify/Flag w/ counts + direction check. Beats: their agent's rule as auditable code. Test: 6 same-direction⇒Revise; split⇒Clarify. M. new `core/drift.ts`.
3. **Portfolio batch** — input `contracts[]`; per-rule deviation-frequency rollup table in board.md. Test: 2 contracts ⇒ summed rollup. M. `core/board.ts`+renderBoard.
4. **Side/polarity** — `playbook.side: sales|purchasing`, mismatch ⇒ explicit row reason. Test: mismatched side flagged. S. `core/board.ts`.
5. **Deterministic redline** — token-diff matched span vs preferred text ⇒ `−/+` lines + `row.redline`. Beats: traceable to quoted span, not LLM-drafted. Test: deviates row renders both. S-M. new `core/redline.ts`.
6. **Number-word normalization** — finite map (one–ninety-nine, hundred/thousand): "eighteen (18) months"≡"18 months". Test: word-form span now numeric-matches. S. `core/textutil.ts`.
7. **Self-contain demo + decision trace** — inline css/js/fonts; per-row panel showing thresholds/scores/rule chain. Test: zero external refs, works offline. S-M. `demo/index.html`.

**4) VERIFIABLE-BETTER CLAIM**
Post-plan, ours does everything their board does — classify vs standard terms, flag deviations, route exceptions — with quoted char-spans, numeric guard, thresholds-as-data, **plus** decision log, re-run diff, drift detection, portfolio rollup, traceable redlines: each of their LLM features becomes a deterministic function with a test. Same inputs ⇒ byte-identical outputs; theirs cannot promise that. **Proof:** green `npx tsx --test core/*.test.ts`; run `examples/run.ts` twice ⇒ identical SHA256 of output.json/board.md; offline single-file demo.

**5) RISKS**
- Gallery artifact internals are product-internal; "their edge" rests on the official article + repo agents (mapping inferred, not literal).
- Similarity matching stays brittle for off-playbook headings (known limit; ruleId escape hatch).
- `core/core.js` JS port must be updated alongside every core change or demo drifts from core.
- Drift/diff semantics risk overfitting to our own example — keep data fictional, add second example contract.

**TESTS: NOT RUN** — this session exposes no shell/exec tool (tool_search for shell/bash/sandbox/val-town: zero hits), so `npx tsx --test core/*.test.ts` could not be executed. Static read: the 12 tests in `core/board.test.ts` are coherent with board.ts/yaml.ts/textutil.ts; first executor step must be a baseline run.

DONE_WITH_CONCERNS