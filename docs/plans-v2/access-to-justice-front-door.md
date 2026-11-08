# Planner — run 7290de40 participant 0

All evidence is in — the decisive finding: our `demo/index.html` links external `tokens.css` and imports `../core/core.js`, so it isn't self-contained (the deployed Val Town copy inlines it; the repo copy breaks the contract and fails on `file://`). Here is the deliverable.

---

**TESTS:** No shell tool exists in this session, so I could not execute them. Latest recorded run — [evidence/test-run.log](tmp/open-legal-artifacts/evidence/test-run.log) (2026-11-07T20:10Z, node v24.20.0): **access-to-justice-front-door: 16 pass / 0 fail**; matches the 16 tests I count in core.test.js.

**1) THEIR EDGE** (counterpart "Access to justice intake triage/front door")
- Serves approved guidance per issue **with source links on every output** — catalog §2.21 + official article (fetched on-run): "every answer or output has a link to its source."
- **Conversational intake summary**: takes conversations, returns guidance + escalation to staff + intake summary (catalog §2.21, S4 secondary).
- **Native dialect/paraphrase robustness** (LLM): our "kicked out of my apartment" escalates today — no keyword hits.
- Ecosystem: 60+ connectors, sharing/ethical walls (official article, fetched).
- Note: github.com/anthropics/claude-for-legal (fetched on-run) has **no exact counterpart**; nearest is `legal-clinic:client-intake` (issue spotting + conflict flags).

**2) OUR GAPS**
1. Vocabulary brittleness — no synonyms/stems; common phrasings escalate.
2. `demo/index.html` **not self-contained**: external `tokens.css` link + `import '../core/core.js'` (breaks standalone/`file://`; violates repo contract).
3. No intake summary — no urgency flag, no date/deadline capture, no staff handoff record.
4. Only referral strings — no per-issue approved-guidance entries with sources.
5. Escalation is a dead end — candidates listed, no deterministic disambiguation path.

**3) IMPROVEMENTS**
1. **Synonym/alias layer as data** (`aliases` per issue, e.g. "kicked out/thrown out"→eviction) / deterministic robustness where they need an LLM / test: 5 paraphrases that escalate today classify / **S** / core.js, core.test.js.
2. **Self-contain the demo**: inline tokens.css + triage source, drop module import / offline kiosk use / test: `grep 'tokens.css'` and `import '` → 0 hits; renders w/o network / **S** / demo/index.html.
3. **Urgency flag + date extraction**: safety keywords → `urgency: emergency|urgent|routine`; regex dates → `dates[]` (info-only) / matches their intake summary, LLM-free / test: DV text → emergency; "court date March 3" captured / **M** / core.js, tests, demo.
4. **Clarifying-question disambiguation**: low-confidence escalate returns `clarifyingQuestion` + option ids; `triage(text,{pick})` resolves / interactive like theirs, still deterministic / test: split case classifies on pick / **M** / core.js, tests.
5. **Approved guidance as data**: taxonomy `guidance:[{point,source}]` served verbatim per referral / open, clinic-editable vs vendor-locked / test: extend verbatim-from-data test / **M** / core.js, tests, spec.md.
6. **Escalation packet**: escalate payload/render includes matched fragments + full candidates for staff review (feeds intake-queue artifact) / test: render contains reason+candidates / **S** / core.js, tests.

**4) VERIFIABLE-BETTER CLAIM** — Ours is a zero-dependency, offline, deterministic triage whose advice-free guarantee, escalation-not-guessing, and (post-fix) paraphrase coverage are machine-verified by `node --test` plus a 20-paraphrase golden set in examples/ — impossible for theirs to prove with model-generated output.

**5) RISKS** — Counterpart details rest on secondary sources (S4; official article doesn't describe it individually), so parity claims may be imprecise; synonym growth risks cross-matches (seal/wages) → add negative tests; guidance entries must stay referral/process-only (UPL) → extend advice-free tests; test counts come from today's logged run, not a fresh execution.

STATUS: DONE_WITH_CONCERNS