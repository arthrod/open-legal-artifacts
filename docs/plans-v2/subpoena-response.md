# Planner — run 7290de40 participant 28

Recon complete: our artifact, tests, example, and their full `subpoena-triage` SKILL.md all read; counterpart evidence verified on-run. Deliverable below (read-only session, inline as required).

---

**1) THEIR EDGE** — evidence: `litigation-legal/skills/subpoena-triage/SKILL.md` (fetched 2026-11-07 from anthropics/claude-for-legal, main@1657cb3) + catalog §3.4.
- **5 subpoena types with a hard grand-jury stop/escalation gate** (SKILL Steps 1, 9); we have no type concept.
- **5 dates tracked** — response, objection, production, motion-to-quash window, meet-and-confer — noting objection deadlines "often run from the EARLIER of the compliance date or a fixed number of days after service" (Step 7). We compute one deadline.
- **Source-tag discipline**: every cite tagged `[Westlaw]`/`[web search—verify]`/`[model knowledge—verify]`; "No silent supplement" policy (Step 0). We have no provenance.
- **Portfolio cross-check** — related-matter lookup, coordinated-issuance flag, handoffs to `/legal-hold`, `/matter-intake` (Steps 3, 9).
- **Objections framework** maps each ground to categories/custodians + strength (Step 5); PwC's gallery tool adds precedent-drafted first drafts (catalog S1/S4#10).

**2) OUR GAPS (top 5)**
1. Single deadline; no objection/production/quash/meet-confer dates, no earlier-of logic.
2. No classification or grand-jury/CID escalation gate.
3. Objections are a flat library — no per-category/custodian application, no strength rating.
4. No provenance tags on facts; no verify-first output section.
5. No portfolio/coordination view; no compliance-plan (production format, review protocol) export.

**3) IMPROVEMENTS** — all deterministic, no new deps, failing-test-first, confined to this dir:
1. **Multi-deadline engine** `computeAllDeadlines(facts)` → response/objection(earlier-of)/production/quash_window/meet_and_confer + `earliest_deadline` escalation. Beats: exact, tested court-day math vs. their LLM-recalled dates needing SME verify. Test: fixture dates → exact ISO deadlines incl. earlier-of. **M** — core/core.js, core.test.js, spec.md.
2. **`classifySubpoena(facts)`** → 5 types + grand_jury STOP warning. Beats: classification testable; escalation can't be prompt-forgotten. Test: "grand jury" caption → blocked. **S** — core.js, test.
3. **Objection application matrix**: each ground → {categories, custodians, strength} from scope heuristics (e.g. >2× threshold = strong). Beats: strength without LLM judgment. Test: 10.8-yr range → overbroad_time strong. **M** — core.js, test.
4. **Provenance trail**: fact fields carry source tags; export lists unverified items verify-first. Beats: structured/diffable vs. prose tags. Test: untagged field → warning. **S** — core.js, test, examples/input.json.
5. **`crossCheckPortfolio(facts, portfolio[])`**: caption/party match + coordinated-issuance flag. Test: same caption ×2 → flag. **S-M** — core.js, test.
6. **Compliance-plan export section**: production scope, custodians/systems, format, privilege-log fields. Test: checklist contains each. **S** — core.js, test, demo/index.html.
7. **ICS calendar export** of all deadlines (plain text, no deps). Beats: their "calendar these" is manual. Test: one VEVENT per deadline. **S** — core.js, test.

**4) VERIFIABLE-BETTER CLAIM**: every date, classification, strength, and flag ours emits is a pure function of the input JSON, proven by a green `node --test` suite (~20→40 tests) plus `examples/run.js` regen producing a byte-identical audit trail; theirs emits LLM prose in which every date and citation requires SME verification by design.

**5) RISKS**: earlier-of/quash windows vary by forum — keep as rules-as-data with jurisdiction warnings; keyword classification can misfire — allow explicit `type` override; all changes must stay inside this artifact dir (no app/deploy edits).

**TESTS: NOT RUN** — no execution tool exists in this session (tool_search: only 3 domain skills, no shell/runner). Static trace of all 20 tests against core.js checks out by hand (2026-11-02 +17d = 2026-11-19; 6 days remaining; reviewing = 40%) — expected PASS; executor must run `node --test "core/*.test.js"` as step 0.

Sources: [their SKILL.md](https://raw.githubusercontent.com/anthropics/claude-for-legal/main/litigation-legal/skills/subpoena-triage/SKILL.md), [repo README](https://github.com/anthropics/claude-for-legal), tmp/anthropic-legal-artifacts-catalog.md §3.4, and our artifact at tmp/open-legal-artifacts/open-artifacts/subpoena-response (spec.md, core/core.js, core/core.test.js, examples/).

DONE_WITH_CONCERNS