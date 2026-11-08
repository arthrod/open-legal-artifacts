# Planner — run 7290de40 participant 22

Recon complete. Counterpart evidence: launch article (The Access Project quote + gallery description), local catalog §3.9/S4 #31, and the anthropics/claude-for-legal repo tree (no record-clearance code exists there — the artifact is product-internal). One caveat up front: this read-only session exposes **no shell/exec tool** (tool_search returned none), so I verified the suite statically (17 `test()` blocks present, matching README's claim) but could not execute it — flagged in risks. Deliverable:

**1) THEIR EDGE** (LA = launch article; CAT = catalog §3.9/S4#31; GH = repo tree)
- Full-flow promise: "screen for eligibility, **obtain the record**, understand how state law applies, and **find local filing guidance**" (LA, N. Cregan) — intake-to-filing; ours stops at eligibility + dates.
- Coverage: "Full check for California, general guidance elsewhere" (CAT S4 #31) — every state gets an answer; ours: 3 states, else hard error.
- Filing guidance: forms/courts/local process (LA+CAT); ours has none.
- Document-native: runs in Claude over the actual rap sheet with connectors (LA); ours requires pre-structured JSON.
- "Each answer or output has a link to its source" (LA, gallery-wide); ours emits opaque ruleIds, no cite/URL.
- GH: repo contains no record-clearance counterpart code — above is the full observable spec; nothing invented.

**2) OUR GAPS (top 5)**
1. No filing guidance (forms, court, fees, local steps) — their core promise.
2. Coverage cliff: unknown jurisdiction → bare error; no guidance tier.
3. Intake is paper-only: spec's prompt schema has no executable validator; nothing enforces `uncertain`→unknown.
4. Client-level-only facts: `probationStatus`/`finesPaid` can't differ per conviction → wrong calls on mixed records.
5. ruleIds cite nothing: no statute citation/URL per relief type.

**3) IMPROVEMENTS** (dependency order: core data → engine → demo/examples)
1. **Filing-guidance-as-data**: `filing:{steps,forms,feeWaiverNote}` per relief type, surfaced in items/report/demo. Beats: their guidance is closed; ours editable, rule-linked. Test: ready_to_file item carries `filing.forms`; `renderReport` matches `/fee waiver/`. **S** — core/core.js, core.test.js, examples/, demo/.
2. **Two-tier coverage**: registry gains guidance-tier states (generic screen + mandatory referral) — `jurisdiction:"TX"` returns a guidance report, never a bare error. Beats: same all-states promise, inspectable data. Test: `trackClearance({jurisdiction:"TX"})` → no errors, gate present. **M** — core.
3. **Per-conviction facts**: conviction-level `probationStatus`/`finesPaid` override client-level. Beats: correct on mixed records (both theirs and ours-today miss this). Test: 2 convictions, differing probation → different statuses. **S-M** — core.
4. **`validateIntake(llmJson)`**: implements the spec's LLM schema — `uncertain[]` fields dropped + logged as issues, normalized ClearanceInput. Beats: tested, published LLM boundary (theirs unpublished). Test: uncertain `finesPaid` → undefined + `issues[0]`. **M** — core.
5. **Authority links**: `authority:{cite,url}` per relief type, rendered in checklist/report/demo. Beats: matches gallery's "link to source" but verifiable and editable. Test: `item.authority.url` present; md match. **S** — core, demo.
6. **Demo jurisdiction switcher** incl. a guidance-tier state, side-by-side. Test: manual visual. **S** — demo/index.html.
7. **Intake example**: `examples/intake.json` → validateIntake → trackClearance in run.js. Test: run.js regenerates deterministic output incl. intake path. **S** — examples/.

**4) VERIFIABLE-BETTER CLAIM**
Ours is the only *published, testable* clearance engine: tri-state never-guess checklists, leap/clamp-tested deadline math, tracked filings, editable multi-state rules + filing guidance + authority links — pinned by node:test; theirs is closed, product-internal, no tests. **Proof:** `node --test core/*.test.js` green (target ≥25 tests, all new behaviors failing-test-first); `node examples/run.js` output byte-matches examples/report.md; guidance tier visible in demo.

**5) RISKS**
- **Tests not executed this run** (no exec tool in read-only session); static: 17 tests present = README claim; implementer's Step 0 runs the suite (expected pass — no code changed).
- Their internals unobservable beyond LA + CAT; claims restricted to those sources.
- Real statute cites risk accuracy drift — keep illustrative unless independently verified (fictional-data rule).
- Scope held to the artifact dir; tokens.css/fonts inlining is the repo deployer convention (verified in deploy/build-site.mjs) — leave as-is.

DONE_WITH_CONCERNS