# Planner — run 7290de40 participant 25

Recon complete — I have on-run evidence from their repo/cookbook and the launch article, plus a full read of our core/tests/example outputs. One caveat before the deliverable: this session exposes no shell/exec tool (tool_search returned nothing), so I could not execute the suite; test status below is static.

---

**1) THEIR EDGE** (evidence fetched 2026-11-07 from github.com/anthropics/claude-for-legal)
- **Operational loop:** scheduled weekly sweep of a live CLM (Ironclad MCP), Slack handoff routing (`managed-agent-cookbooks/renewal-watcher` README); ours is one-shot batch JSON.
- **Tiered urgency + escalation:** deadline-calculator tiers overdue/30/60/90/180 days + escalation matrix routing to approvers ("Tune the lookahead windows", "Adjust the escalation matrix").
- **Playbook cross-reference:** flags renewal-time playbook deviations (agents table: "flag playbook deviations").
- **Failure honesty:** "Quiet weeks are not clean weeks" + CLM metadata-drift warning — they name the coverage failure mode we don't detect.
- **Zero-upload reach:** Ivo-backed gallery artifact, "tracks every notice date across their portfolio… no manual uploads" (launch article, Ivo quote).

**2) OUR GAPS (top 5)**
1. No urgency tiers: examples/report.md has noticeDeadline 2026-07-04 < asOf 2026-11-07 still emitted as a plain event.
2. No coverage audit: a contract with no dated renewal/notice clause yields zero output silently.
3. No confirmation state: "confirm with lawyer" is prose; nothing pins a candidate as data.
4. No recurrence: "successive one-year terms" → single event; calendar stale after cycle 1.
5. Narrow grammar (3 anchors; "within N days of" quarter-only) + 2 tautological asserts (`|| true` in core.test.js buildCalendar & ICS-CRLF tests).

**3) IMPROVEMENTS** (change / why beats theirs / acceptance test / size / files)
1. **Urgency tiers:** daysUntil=noticeDeadline−asOf → overdue|≤30|≤60|≤90|≤180|later; ICS CATEGORIES+SUMMARY prefix. Deterministic+tested vs their prompt-tuned tiers. Test: 2026-07-04 vs asOf 2026-11-07 → "overdue". **S** core/core.js, core/core.test.js.
2. **Coverage audit:** `cal.coverage[]` lists contracts lacking any dated renewal/notice clause + report section — makes "quiet ≠ clean" structural; theirs only warns in a README. Test: contract with only "on mutual agreement" appears in coverage. **S** core.js, core.test.js, examples/run.js.
3. **Confirmation state:** optional `confirmations` arg pins {contractId, clauseType→date}; pinned ambiguous → confirmed w/ provenance. Operationalizes the attorney-verify step theirs leaves to prose. Test: pinned "within 60 days" candidate → confirmed. **M** core.js, core.test.js, demo.
4. **Recurrence:** `renewalTermMonths` on auto-renewal/evergreen → project next 2 cycles, stable UIDs, dedupe by id+clauseType+date. Beats their single-window scan. Test: 2027-04-01/12mo → 2027+2028 events. **M** core.js, core.test.js, examples.
5. **Grammar v2:** month-end anchor, "within N days of <any anchor>", "N days prior to expiration"; patterns as data table, each with an ambiguity policy. Test per pattern. **M** core.js, core.test.js, spec.md.
6. **Escalation rules-as-data:** `rules.escalation[]{maxDaysOut, owner}` → event.escalation + ICS CATEGORIES. Test: 25-day deadline → owner set. **S-M** core.js, core.test.js.
7. **Test hygiene:** replace both `|| true` vacuous asserts with real ones (incl. CRLF-only ICS). Acceptance: grep finds no `|| true`. **XS** core.test.js.

**4) VERIFIABLE-BETTER CLAIM**
With 1–3+7: ours is the only side whose deadline math, urgency tiers, coverage failures, and attorney confirmations are deterministic, test-covered (node:test), and exported as ICS with alarms — theirs computes deadlines inside an LLM worker, ships no tests, and needs wiring to remind anyone. Proof: green `node --test` incl. new tier/coverage/confirmation tests; reproducible `node examples/run.js` outputs; side-by-side vs the cookbook's own "cookbook, not product / not guaranteed" caveats.

**5) RISKS**
- Tests NOT run: no exec tool in this read-only session; suite last documented 12/12 (README); static read found the 2 vacuous asserts — run before building.
- Recurrence may double-count clauses that already list future dates (mitigate via dedupe key).
- Escalation owners are config, not routing — no notification integration in scope.
- Grammar growth risks false confidence: every new pattern needs a flag policy + failing-test-first.

Status: DONE_WITH_CONCERNS