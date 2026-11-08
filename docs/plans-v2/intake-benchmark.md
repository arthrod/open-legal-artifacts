# Planner — run 7290de40 participant 12

All evidence is in. Key findings before the deliverable: the reference repo's intake counterpart is `legal-clinic/skills/client-intake` (fetched in full this run), the Harvey gallery artifact itself is an ask-legal front door per catalog §3.3, and the demo's `tokens.css`/`../core` links are a repo-wide convention inlined by `deploy/build-site.mjs` — not a self-containment gap. One caveat: this session has **no execution tool** (tool_search lists only 3 domain-rule skills), so tests could not be run; I hand-traced all 14 assertions against `core.js` instead.

**ARTIFACT intake-benchmark — improvement plan (counterpart: Harvey Intake, gallery §3.3 + repo `legal-clinic/client-intake`)**

**1) THEIR EDGE (evidence: catalog §3.3; client-intake SKILL.md + legal-clinic README fetched 2026-11-07)**
- Operational: Harvey Intake *runs* intake — answers routine Qs from Legal's guidance, routes rest to a lawyer, reply returns in Claude; visibility dashboard for Legal.
- Domain-loaded: `/client-intake` ships practice-area question templates (immigration/housing/family/consumer) + cross-area issue spotting.
- Risk surfacing: conflict flags, triage (Urgent→out-of-scope), mandatory deadline handoff (SOL/hearings → `/deadlines`).
- Ethics guardrails: confidence markers, provenance-tagged cites, privilege labels, supervision routing.
- Feedback loop: deadlines ledger, comms log, review queue integrate intake into daily ops.

**2) OUR GAPS (top 5)**
1. Capture friction: flow JSON hand-authored; capture-step output unvalidated.
2. Empty canon: no starter field sets — zero out-of-box legal value vs their templates.
3. Rigor: no rank-stability under weight perturbation; silent renormalization hides apples-vs-oranges when flows have different missing dimensions.
4. Measures process, not legal risk: no deadline/SOL/conflict-field coverage dimension.
5. One-shot: no re-run drift diff (their dashboarding analog).

**3) IMPROVEMENTS** (change / why beats theirs / acceptance / size / files)
1. **Canon library**: `core/canons.js` — 4 practice-area field sets, each field tagged `risk_class` (deadline|conflict|core). Theirs is prompt prose; ours is versioned, machine-usable rules-as-data. Test: `getCanon('housing')` returns tagged fields; `benchmark()` accepts. **S**. core/canons.js, core.test.js, spec.md, demo picker.
2. **Risk dimensions**: split completeness by risk_class → `deadline_capture`, `conflict_check` (null if canon untagged). Scores *any* flow — incl. Harvey's — on SOL/deadline capture; theirs asserts it, never measures. Test: unasked deadline field → score<100, listed in `missing_critical`. **M**. core.js, tests, spec.
3. **Sensitivity**: `rankStability(input, {jitter:0.25})` — deterministic weight-perturbation grid, flip-%, robust/fragile badge. No counterpart has error bars. Test: clear winner→0 flips; near-tie→>0; identical output on rerun. **M**. core.js, tests, demo badge.
4. **Fair mode**: `config.fairMode` recomputes composites on the intersection of available dimensions + comparability warning. Test: one flow w/o retention → intersection used, warning shown. **S**. core.js, tests.
5. **Capture QA**: `validateCapture(json)` on the documented prompt schema — missing purpose, latency >7d outliers, abandonment bounds → warnings. Makes the optional LLM step auditable as spec promises. Test: outlier flagged. **S**. core.js, tests.
6. **Drift diff**: `compare(resultA, resultB)` → per-flow per-dimension deltas + rank-change flags; second fixture in examples. Vendor-neutral version of Legal's dashboard. Test: changed abandonment → retention delta + rank flip flagged. **M**. core.js, tests, examples/.

**4) VERIFIABLE-BETTER CLAIM + PROOF**
"Ours is the only side that can score Harvey's own intake flow on an explicit rubric, with rank-stability analysis and fair-mode comparison." Proof: `node --test` green with suite growing 14→~24 (failing-test-first per repo rules); determinism test (byte-identical reruns); counterpart repo read this run contains no scoring mechanism (SKILL.md is interview instructions only).

**5) RISKS**
- We still cannot *run* an intake — their core workflow edge; items 1–2 add legal substance, not operations.
- Weight arbitrariness is the weakest attack → mitigated by 3.
- Keep output shape additive (old keys unchanged) or demo/examples break.
- **Tests NOT executed** — no shell/test tool in this session (verified). Static trace: all 14 assertions match core math (75/50/83.33/90, throws, MD/CSV rows ✓); implementer must run `node --test "core/*.test.js"` first.
- Harvey gallery details rest on catalog/S1 (secondary); repo evidence is primary and was fetched this run.

Status: DONE_WITH_CONCERNS