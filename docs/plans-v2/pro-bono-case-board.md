# Planner — run 7290de40 participant 21

All evidence gathered. No write or execution tools exist in this session, so the deliverable is inline as instructed, and the test run is reported honestly as not runnable here.

# Improvement plan — pro-bono-case-board vs "Pro bono case tracker" (Claude for Legal gallery)

Evidence keys: S1 = launch article (fetched, claude.com/resources/articles/introducing-artifacts-for-legal-work); S2 = github.com/anthropics/claude-for-legal (fetched); S4 = gallery enumeration via local catalog `tmp/anthropic-legal-artifacts-catalog.md` §2.20 (secondary).

**1) THEIR EDGE**
- Due dates are a first-class column: "Each case by stage, owner, due date" (S4 #25); we have **zero** deadline handling.
- Doc ingestion: board built from emails/letters/spreadsheets — "Claude completes the first pass" (S1); we require hand-perfect JSON.
- Malpractice-aware deadline warnings + supervisor review exist in their reference repo (S2 `legal-clinic`: Clinic Deadline Tracker, Supervisor Review Queue).
- Every output source-linked; 60+ connectors; org sharing (S1).
- In-product interactive editing; we're read-only board.

**2) OUR GAPS (top 5)**
1. No deadlines/due dates — their middle column.
2. No tolerant ingestion: one bad field kills `buildBoard`; no per-row issues.
3. No volunteer capacity view (load/hours/stale-owned) to ground placement.
4. Staleness only; no per-stage SLA/aging (case stuck in `intake` 10d looks "fresh").
5. No board diff/regen audit ("what changed since last run"); no calendar export.

**3) IMPROVEMENTS** (change / why beats theirs / acceptance / size / files)
1. **Deadlines + malpractice-aware severity**: cases get `deadlines[]{label,dueDate,kind}`; compute `daysTo`, `overdue`, severity (overdue `court` = critical; <7d = warn); `toICS()` export. Theirs displays dates; ours computes auditable warnings + ICS. Test: due-in-3d → warn; overdue court date → critical + `impact.overdueDeadlines`; ICS has one VEVENT/deadline. **S** — core/core.js, core.test.js, demo.
2. **Tolerant intake parsing** `parseRows(text)`: CSV/pasted rows → draft cases + per-row `issues[]` (bad date, unknown state, dup id), never throws. Their LLM ingest is opaque; ours is inspectable, LLM-free. Test: messy CSV → flagged row, board still builds. **M** — core.js, core.test.js.
3. **Volunteer capacity rollup**: `impact.byVolunteer{openCases,hours,staleOwned}`; flag >`maxOpen` (default 5). Theirs shows owner only; ours grounds placement in load. Test: 6 open → "at capacity". **S** — core.js, core.test.js.
4. **Stage SLA aging**: `settings.stageSla{intake:7,…}` → "in state N d > SLA" flag + aging buckets. Catches stuck-intake that stale-check misses. Test: intake 10d → flagged. **S** — core.js, core.test.js.
5. **Board diff** `diffBoards(a,b)`: added / stage-changed / deadline-moved / closed; deterministic. Makes the documented freshness failure (boards "age from day one") visible as a change log. Test: fixture pair → exact diff; run twice → identical. **M** — core.js, core.test.js, examples.
6. **Demo upgrade**: deadline column w/ severity + capacity panel; stays one self-contained file. Test: grep demo → no external `src=`/`href="http`. **M** — demo/index.html.
7. **Examples expand**: input gains deadlines + a "changed" variant; run.js regenerates outputs incl. board-diff. **S** — examples/*.

**4) VERIFIABLE-BETTER CLAIM**: Every warning we emit (deadline severity, capacity, SLA, match score, stale) is a deterministic pure function pinned by tests and reproducible by anyone, with auditable exports (JSON/CSV/MD/ICS + regen diff), zero dependencies; theirs is an in-product artifact with unpublished logic, Claude+connector-bound, exporting nothing auditable. Proof: green `node --test core/*.test.js` incl. new tests; `package.json` shows 0 deps; demo single-file grep; diff-determinism test.

**5) RISKS**: counterpart facts partly secondary (S4 one-liner; gallery internals unverifiable without product access) — we target the documented surface; their prose-doc ingestion can't be matched LLM-free (parser covers structured paste, not free text); ICS edge cases (keep all-day UTC dates only); all changes confined to the artifact dir; growing suite must stay fast/deterministic.

**Tests: NOT RUN (environment)** — no shell/execution tool is registered in this session (tool_search found none; val-town tools absent), so `node --test core/core.test.js` could not execute. Static verification only: test imports all resolve to existing `core.js` exports; 17 tests present; 0 npm deps; demo has no external references. Implementer must run the suite first and confirm 17/17 before starting.

**DONE_WITH_CONCERNS**