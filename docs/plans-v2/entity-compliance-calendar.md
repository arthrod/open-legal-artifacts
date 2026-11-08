# Planner — run 7290de40 participant 8

Recon complete. No execution tool exists in this read-only session (tool_search returned none for shell/sandbox), so tests could not be run — I'll report that plainly. Here is the deliverable:

---

**ENTITY COMPLIANCE CALENDAR — IMPROVEMENT PLAN** (counterpart: `Entity Compliance Tracker`, corporate-legal plugin, anthropics/claude-for-legal SKILL.md fetched on-run 2026-11-07)

**1) THEIR EDGE**
- **Real ruleset content**: DE corp (Mar 1 report+franchise, 8 Del. C. §§501–502) vs DE LLC/LP (flat $300, Jun 1, §18-1107(d)/§17-1109), indexed by entity type — ours is all fictional.
- **Full lifecycle**: `--init/--report(30/60/90/180d)/--update(manual | CT-Corp-report-upload | --sweep)/--audit/--export` — ours is a one-shot snapshot.
- **Ingestion**: registered-agent (CT Corp/NRAI) report reading with fuzzy entity-name matching and matched/unmatched diff.
- **Audit beyond deadlines**: dormant→dissolution candidates (>5y), good-standing staleness (>12mo), foreign-qualification gaps, fees, agent-managed entities.

**2) OUR GAPS (top 5)**
1. No rule provenance/versioning — no `effectiveFrom/verifiedOn`; staleness invisible (theirs at least dates its build).
2. No foreign-qualification model — obligations bind only to formation jurisdiction.
3. No persisted lifecycle/`unknown` state; `n/a` conflates skip with "confirm with agent".
4. No ingestion path or entity-name matching.
5. No good-standing/fee/registered-agent data, no health audit.

**3) IMPROVEMENTS** (all failing-test-first; no new deps; single-file demo; fictional data)
1. **Rule staleness** — obligations gain `effectiveFrom/verifiedOn`; cells flag `ruleStale` when verified >365d before asOf; surfaced in CSV/ICS. Beats theirs: caveat becomes a computed, tested signal. Test: 400d-old rule → `ruleStale:true`, status unchanged. **S** — core/core.{js,test.js}, examples/input.json, spec.md.
2. **Foreign qualifications** — `entity.qualifications[]`; obligations may bind to a qualification jurisdiction with `qualifiedOn` as anchor. Beats theirs: computes real foreign-filing deadlines vs a prose flag. Test: CA SOI due on qualification anniversary. **M** — core.
3. **auditHealth()** — dormant>5y, missing formedOn, good-standing stale/unknown, footprint-vs-qualified gaps. Deterministic analog of their Mode 4. Test: each flag fires once. **M/L** — core + demo section.
4. **ingestAgentReport()** — fictional agent-report CSV → case/punctuation-insensitive name match → `{matched, unmatched, notInReport}` + `applyFilingUpdates(confirm)`. Auditable where theirs is LLM-read. Test: "Acme Holdings LLC"≡"Acme Holdings, LLC". **M** — core.
5. **`unknown` status + sweepReport()** — missing-data cells split from `n/a`. Matches their 4-state model in code. Test: no formation date → `unknown`. **S**.
6. **Fees + good standing** — `filings.fee`, `entity.goodStandingConfirmedOn`; matrix gains fee totals + standing list; exports carry them. **S/M**.
7. **report(matrix, windows[])** — 30/60/90/180 buckets in generator + demo filter. **S**.

**4) VERIFIABLE-BETTER CLAIM**
Ours computes every deadline deterministically with rule provenance, staleness flags, foreign-qualification math, and recurrence-bearing ICS export; theirs computes inside an LLM from an undated reference table and exports CSV only. Proof: extended node:test suite (~10 new tests above) + reproducible fixtures (existing 2,032d-overdue biennial case) — re-run to green.

**5) RISKS**
- Fictional-data constraint keeps the "maintained ruleset" moat aspirational — ship schema + contributor guide instead of real cites.
- Qualification-anchor semantics are subtle (real CA rule differs); keep fictional analog simple.
- Ingestion CSV format is invented (CT-Corp-analog).
- **Tests NOT run this session** — no execution tool in this read-only environment; baseline `node --test` (13 tests, expected green per today-dated examples outputs) must be Wave 0 of execution.

Status: DONE_WITH_CONCERNS (concern: tests unverifiable without an execution tool; counterpart evidence is from the public repo skill, not the in-product gallery artifact).