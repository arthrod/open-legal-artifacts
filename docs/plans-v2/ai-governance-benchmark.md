# Planner — run 7290de40 participant 1

Recon complete. The demo violates the single-file constraint (imports `../core/core.js` + `tokens.css`) — a concrete finding. No execution tool exists in this session (shell/bash/val-town searches all empty), so tests are statically traced instead of run. Deliverable:

**AI-GOVERNANCE-BENCHMARK — IMPROVEMENT PLAN** (read-only; nothing built)

**1) THEIR EDGE (Goodwin, with evidence)**
- Practitioner-validated: "the same questions our AI practice uses with clients" — Betancourt quote, launch article (fetched 2026-11-07). Ours is framework-derived, practice-unvalidated.
- Prioritized next actions: "know which areas to address first" (article); catalog S4#22: "12 questions, 4 areas… prioritized next actions." Our gap list is bank-ordered, unranked.
- Claude-native delivery: conversational, shareable in-gallery, connector-tailorable (article). Ours: paste-JSON textarea.
- Lower friction: 12 questions vs our 13 + per-answer evidence.
- Note: Goodwin's artifact is NOT in github.com/anthropics/claude-for-legal (repo = Anthropic's own plugins; README fetched). Evidence = launch article + local catalog only.

**2) OUR GAPS (top 5)**
1. No "address first" ranking — their headline output.
2. No baseline to benchmark against despite the name.
3. One-shot: no re-assessment diff despite versioned rubric.
4. demo/index.html not self-contained (imports `../core/core.js`, links `tokens.css` — violates single-file constraint); no question-by-question UI.
5. MD-only export; regime scope stops at NIST/ISO (catalog suggests EU AI Act art. 5–15).

**3) IMPROVEMENTS** (change / why beats / acceptance / size / files)
- **a. Ranked action plan**: priority = pillarWeight×(3−level)×(highRisk?1.5:1), data-driven `highRisk`; `result.actions[]` + "## Next actions" in MD/demo. Transparent reproducible ranking vs opaque pick. Test: allAt(0) → strictly descending, ties in bank order. M. core/core.js, core.test.js.
- **b. Fictional cohort baseline**: rules-as-data percentiles per pillar; `compare()` → percentile per pillar. A score alone isn't a benchmark. Test: fixture score → declared percentile. M. core/*.
- **c. `diffAssessments(prev,curr)`**: per-question/pillar deltas, improved/regressed flags; demo re-run compare. Theirs is one-shot. Test: one +1 answer → flagged delta. M. core/*.
- **d. Self-contained demo + guided interview**: inline core+tokens (single file), 0–3 buttons + evidence per question building the JSON. Runs offline, no Claude needed. Test: `grep -c "import\|<link" demo/index.html` = 0. M. demo/index.html.
- **e. `exportGapsCsv`**: RFC4180 quoting, tracker-importable. Test: comma in evidence round-trips. S. core/*.
- **f. Regime mapping**: optional `euAiActRefs` (art. 5–15) per question as data; report flags regime coverage. Multi-regime vs US-practice scope. Test: every question has ≥1 regime ref. M. core/*.
- **g. Sector weight presets** (named rules-as-data profiles). Test: preset weights sum to 1. S. core/*.

**4) VERIFIABLE-BETTER CLAIM + PROOF**
Ours = open rules-as-data rubric, reproducible offline, framework-cited, versioned, evidence-first; theirs = closed questionnaire, Claude-required, unreproducible. Proof: (i) `node --test core/` green incl. new failing-test-first tests; (ii) demo loads with network blocked; (iii) `node examples/run.js` twice → byte-identical outputs; (iv) every question/weight/citation readable in core.js.

**5) RISKS**
- NIST/ISO/EU-AI-Act clause refs must be hand-verified against published texts; not legal advice.
- Baseline percentiles could read as real market data — label "fictional cohort" everywhere.
- Never clone Goodwin's 12 questions/wording (proprietary).
- Confirm deployer's inlining expectations before rewriting demo imports.
- Goodwin's internals rest on secondary sources; re-verify if they publish the artifact openly.

**TESTS: NOT RUN** — this session exposes no shell/exec tool (tool_search for shell/bash/val-town returned none). Static trace: all 13 tests in core.test.js map 1:1 to implemented core.js behavior; examples/report.md matches hand-computed output (overall 0.87 ✓, 9 gaps ✓, weighted math verified by hand).

DONE_WITH_CONCERNS