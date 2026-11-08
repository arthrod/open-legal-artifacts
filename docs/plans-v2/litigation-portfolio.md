# Planner — run 7290de40 participant 15

Recon complete — I have their full `portfolio-status` SKILL.md (fetched from the public repo this run), our complete artifact, and I verified our committed example outputs are current. Deliverable inline:

---

**1) THEIR EDGE** (verified: `litigation-legal/skills/portfolio-status/SKILL.md`, github.com/anthropics/claude-for-legal)
- **8 named anomaly checks**: overdue next_deadline, stale >30d, conflicts unresolved + override, high/critical risk w/o outside counsel, stale reserve (>60d), hold gap, missing fields
- **Deadline horizons** 14 / 15–30 / 31–60 days, overdue flagged separately
- **Filters**: `--all / --risk / --stale / --type / --owner`; risk table collapses low tiers
- **Materiality taxonomy** (reserved/disclosed/monitored/none) with midpoint exposure totals; catalog S4: "tracks reserves, traced to source"
- **Scannability**: "3-minute read" rollup, next-steps decision tree

**2) OUR GAPS (top 5)**
1. Flag engine shallow — 3 flags vs their 8; no staleness concept at all (no `lastUpdated`)
2. No next-deadline horizon buckets; overdue only a per-matter flag
3. No filter layer (closed/stale/band/counsel)
4. No materiality/reserve taxonomy, no midpoint totals; `exposureBasis` exists in prompt schema but core drops it (no source-tracing)
5. Dashboard has no anomalies section, no stage distribution, no "look first" ordering

**3) IMPROVEMENTS** (all: failing-test-first, no new core deps, demo stays one file, fictional data; confined to artifact dir)
1. `detectAnomalies(matter, asOf, cfg)` — port all 8 checks as pure fns with ids+severity; per-matter `anomalies[]` + summary counts. Beats theirs: deterministic + unit-tested vs LLM-interpreted prompt rules. Test: fixture fires each check id. **M**. `core/core.js`, `core/core.test.js`, `spec.md`
2. `lastUpdated` staleness + stale-reserve (`staleDays` 30, reserve 60, configurable). Test: 45d-old → stale flag. **S**. core, `examples/input.json`
3. Deadline horizons 14/15–30/31–60 in summary + dashboard. Test: +5d/+20d/+45d bucket right. **S**. core
4. `applyFilters(portfolio, {includeClosed, stale, band, claimType, counsel})` = their CLI flags as a pure fn, wired into demo UI. Test: closed excluded by default. **M**. core, `demo/index.html`
5. Exposure provenance: carry `exposureBasis`/`sourceDoc` through core→output/CSV/dashboard. Beats their "traced to source": traceability lives in the data contract and exports, not prose. Test: CSV contains basis. **S**. core, spec
6. Materiality taxonomy + "rough midpoint" rollups. Test: rollup math on 2 matters. **M**. core
7. Dashboard ⚠️ anomalies section, severity-sorted, deterministic "look first" line + stage table. Test: `renderDashboard` matches section/order. **S**. core, demo

**4) VERIFIABLE-BETTER CLAIM**: we implement every SKILL.md feature as tested deterministic code **and** keep what theirs lacks — cited rules-as-data SOL computation (their skill computes no SOL dates), CSV export, reproducible git-diffable output, 0-dependency browser demo. **Proof**: suite grows 17→~30 green; README feature-matrix mapping each of their 8 checks → our test name; regenerated golden `examples/output.json`.

**5) RISKS**: risk/materiality semantics are firm-calibrated in their setup — ship ours as configurable data, defaults flagged "verify"; input-contract bloat — all new fields optional + flagged when absent; demo single-file constraint while adding filter/anomaly UI; fictional `lastUpdated` dates can drift vs `asOf` (validate both).

**TESTS**: cannot run — no shell/execution tool exists in this session (searched tool registry twice, zero hits). Static evidence instead: 17 tests in `core.test.js`, every expectation matches current `core.js` behavior; `examples/output.json` regenerated at today's `asOf` (2026-11-07) is fully consistent with core (e.g. LIT-2026-021 → 2026-11-20, critical, 13d ✓). Last green run: unverified.

Status: DONE_WITH_CONCERNS