# Planner — run 7290de40 participant 30

Recon complete. I've read our artifact in full (spec, core, tests, examples, demo, meta), confirmed via on-run fetch of github.com/anthropics/claude-for-legal that no term-sheet agent exists in their open repo (partner artifact), and verified WSGR's public prior art (Term Sheet Generator + ECVC knowledge bank/trend reports). Deliverable:

**1) THEIR EDGE** (evidence: catalog §3.5 compiled today; ecp.wsgr.com; repo fetch)
- Real market data: WSGR's private deal base + quarterly "Representative Venture Financing Terms" trend reports — ours ships example-only numbers.
- Distribution, not just in/out: their trend reports show how terms distribute by round/vintage.
- In-Claude artifact ingests the actual term-sheet document (upload/connectors), every output source-linked (launch-article shared model).
- Long-public Term Sheet Generator (2009→) + ECVC knowledge bank: definitions, FAQs, generation flow.

**2) OUR GAPS (top 5)**
- Binary inside/outside; no position-within-market, no investor/company favor direction.
- Typo'd enum ("participatng") scores outside_market — false off-market flag.
- `withGrid` replaces an entire round; a one-term override drops the rest.
- Boolean/structural flags (founder_vesting_restart) always `no_benchmark` — no flag kind.
- No per-term NVCA definitional link; MD-only export; rounds stop at series_b.

**3) IMPROVEMENTS** (change / why beats / acceptance / size / files)
1. Favor direction — add `favor:'investor'|'company'|'neutral'` to grid entries, emit on outside rows. Practitioner value WSGR leaves implicit; ours makes it data. Test: full_ratchet row carries favor=investor. **S** — core/core.js, core.test.js, demo/index.html, README.
2. Typo guard — enum value in no grid vocabulary anywhere → `unknown_value_type`, never a false off-market. Test: "participatng". **S** — core.
3. Distribution bands — optional p25/p50/p75 on range entries; detail states band ("above p75"). Their strongest feature on inspectable, dated, swappable data. Test: banded entry verdicts. **M** — core, examples.
4. Per-entry `withGrid` merge — override one term, keep the round. Test: seed dividends override retains seed anti_dilution. **S** — core.
5. `flag` kind for boolean terms → real verdicts. Test: founder_vesting_restart:true vs values:[false] → outside. **S** — core, examples/input.json.
6. TERM_CATALOG — per-term NVCA model-doc URL + one-line definition, rendered in exportMd/demo. Every row links to the public standard. Test: every grid term has a catalog entry with url. **M** — core, demo.
7. `exportCsv` + demo download button. Test: csv rows == terms.length. **S** — core, demo.

**4) VERIFIABLE-BETTER CLAIM**
Every verdict is reproducible from a visible, dated, swappable grid with favor + bands + typo guard + NVCA links; theirs rides an unauditable private deal base. Proof: `node --test "core/*.test.js"` green incl. new tests; examples regenerated; demo cites source+asOf per row.

**5) RISKS**
- Example numbers stay example-only — out-of-box numeric comparability intentionally limited vs real WSGR data.
- Their gallery description is secondary-sourced (S4, LinkedIn); edges inferred partly from WSGR public prior art, not the in-product artifact.
- Bands may read as real percentiles; must keep EXAMPLE labels.

**Tests:** NOT executed — no shell/exec tool exists in this session (tool_search: 0 hits across 5 queries). Static trace of all 10 tests in core/core.test.js against core.js: expected 10/10 pass (counts 8 inside/1 outside on the canonical sheet; no_benchmark, unknown-round, staleness, withGrid, source-dating, exportMd assertions all consistent); committed examples/benchmark.md matches input.json. This is verified-by-inspection, not execution.

DONE_WITH_CONCERNS