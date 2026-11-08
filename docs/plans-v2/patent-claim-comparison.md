# Planner — run 7290de40 participant 19

Recon complete. No execution tool exists in this read-only session, so tests are statically traced, not run — flagged below. Deliverable:

**1) THEIR EDGE** (evidence: `litigation-legal/skills/claim-chart/SKILL.md`, fetched 2026-11-07; catalog §2.12)
- Patent **and civil** modes; infringement/invalidity/review sub-modes; matter integration with conflicts gate
- Legal-depth parsing: §112(f) means-plus-function, Markush/Jepson, preamble-limiting (Catalina), open/closed/semi-open transitional scope, Markman/Festo/Nautilus flags
- Rich taxonomy: literal / construction-dependent / doe / anticipation / obviousness-combination / partial / not-found / needs-evidence; dependent-claim + DOE rows "execute, don't gesture"
- Outputs: markdown + CSV with `_sources` companion + Excel/Sheets, spreadsheet formula-injection neutralization, work-product header

**2) OUR GAPS (top 5)**
1. No claim-vs-reference mode — we only diff claim set A vs B; spec's LLM prompt schema unimplemented
2. No construction-risk flags (means-for, "configured to", "substantially/about" — all deterministically detectable, absent)
3. "consisting essentially of" collapsed to "consisting"; scope unused; preamble-limiting unflagged
4. Number-based pairing breaks on renumbering (2→3 with identical text = removed+added, false no-teaching)
5. Markdown only: no CSV/_sources export, no injection neutralization, demo has no export

**3) IMPROVEMENTS** (change / why beats theirs / acceptance test / size / files)
1. `mapLimitationsToReference(claim, refText)` — verbatim-quote span search, states verbatim|partial|notFound / machine-checkable spans vs their LLM-written pin-cites / test: each span slices to exact quote; no quote → notFound / S / core/core.js+core.test.js
2. `flagConstructionRisks(claim)` — regex means-for, configured/adapted/operable-to, substantially/about/approx, with spans / deterministic always-on parity with their construction check / test: fictional claim → 4 flagged spans / S / same
3. Three-way `transitional` + scope note in chart / theirs documents it, ours tests it / test: parses all three phrases / S / same
4. Renumber-robust pairing: only-in-A + only-in-B with ≥exactAt limitation match → relation `renumbered` / theirs never diffs claim sets / test: A=1,2; B=1,3(≡2) → renumbered, not removed+added / M / same
5. `toCSV(result)` + `_sources` companion, apostrophe-prefix cells starting =+-@/tab/CR / their safety feature, done deterministically / test: "=cmd()"→"'=cmd()" / S / core + demo/index.html button
6. `buildClaimReferenceMatrix(claims, refs[])` — coverage → claim×reference table flagging anticipation-candidate vs combination / deterministic analog of their anticipation taxonomy / test: one fictional ref covering L1–L4 → anticipation-candidate; joint-only → combination / M / core + examples

**4) VERIFIABLE-BETTER CLAIM + PROOF**
Every chart row is machine-verifiable (span round-trip into source text) and byte-deterministic, with tests pinning both; theirs is LLM prose no test verifies. Proof: `node --test core/` green incl. new span-round-trip, determinism, injection tests; `node examples/run.js` → byte-identical output.json.
**Tests: could NOT execute — this session has no shell/run tool (tool_search returned none).** Static trace of all 12 tests in core.test.js against core.js: no failures expected (parser/comparator match every assertion). UNVERIFIED BY EXECUTION — run `node --test core/` first.

**5) RISKS**
- Their construction/DOE depth is LLM judgment; matching it fully breaks the LLM-free core (we flag risk, never construe)
- Renumber heuristic needs a conservative threshold or it converts real amendments into false `renumbered`
- Injection neutralization must not corrupt verbatim quotes (test both)
- Reference mapper is lexical, not semantic — position as first-pass with honest notFound rows, never "support"

DONE_WITH_CONCERNS