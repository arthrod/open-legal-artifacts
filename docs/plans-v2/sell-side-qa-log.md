# Planner — run 7290de40 participant 27

Recon complete. Their counterpart is verifiable only via the launch article's shared model + a one-line gallery description (catalog §2.15, medium confidence); our artifact is not thin (16 tests, full core/demo/example, outputs consistent with my hand-trace). Deliverable:

---

**1) THEIR EDGE** (verified: fetched claude.com article + anthropics/claude-for-legal on-run; their artifact is gallery-only, not in the repo)
- Drafts answers from data-room docs via 60+ connectors (article; catalog §2.15) — ours defers drafting to an optional prompt schema.
- "Every answer or output has a link to its source" (article) — our answers carry no citation field.
- Native sharing with ethical walls between teams (article) — ours is a demo filter, not core API.
- Interactive status management "to release" inside Claude (S4 #18, secondary) — ours derives state, enforces nothing.
- Evidence limit: counterpart described in one line; Medium confidence (catalog). Don't invent more.

**2) OUR GAPS (top 5)**
1. No provenance: answers lack citations — their signature feature.
2. No approve→release gate or audit trail (unapproved send impossible to detect).
3. Buyer isolation is UI-only; no core `buyerView()`/scoped export.
4. Detection blind spots: category-siloed; `$`/`usd`, `million`/`bn`/`$3,500,000` magnitudes unnormalized; one conflict per pair (`break`); antonym evidence degenerates to `"Yes."`.
5. No aging/SLA (`receivedAt`, days open); no determinism/robustness tests (empty input, ties, dup ids).

**3) IMPROVEMENTS** (change / why it beats theirs / acceptance / S-M-L / files)
1. **Citations on answers** — `answers[].citations:[{docId,locator,quote}]`; readiness gains `provenance` component (rules-as-data); shown in CSV/JSON/report/demo. Source-links that survive export as structured data, not UI-only. Test: cited-answer ratio + score math. **S** — core.js, core.test.js, spec.md, examples/, demo.
2. **Release gate as code** — `transition(item,event)` (approve→send; approver+date recorded) + `releaseBlockers(item,contradictions)`. Their opaque workflow becomes a testable audit trail. Test: send w/o approve → error; contradicted id listed as blocker. **M** — core.
3. **Detection v2** — unit/magnitude normalization to a canonical base; `settings.crossCategory` (default off, keyword-anchored); drop per-pair `break`; antonym quote ≥3 words (fall back to fuller sentence). They have zero contradiction detection — widen the moat. Test: `$3.5 million` vs `$3,500,000` agrees; cross-category flag when enabled. **M** — core.
4. **`buyerView(log,buyerId)`** + scoped CSV: buyer-safe projection, cross-buyer evidence redacted. Ethical wall as a function. Test: only that buyer's items/questions appear. **S** — core.
5. **Aging/SLA** — `receivedAt` + `asOf` → `daysOpen`, SLA bands, overdue count in summary/report. Status plus time, deterministically (no clock). Test: 10 days vs 5-day SLA → overdue. **S** — core, examples.
6. **Robustness/determinism tests** — byte-identical rerun, `buildQaLog({})`, malformed/duplicate items. Test: named cases green. **S** — core.test.js.
7. **Demo pre-send gate** — editable pending-draft textarea running `detectContradictions` live; Send disabled until blockers clear; stays one file. Their LLM-mediated flow shown as pure code. Check: manual demo interaction. **M** — demo/index.html.

**4) VERIFIABLE-BETTER CLAIM**: ours covers every documented counterpart behavior (track-to-release, drafting schema, source links via #1) and adds what theirs lacks — deterministic contradiction detection with verbatim evidence, auditable readiness formula, release gate as code, buyer-wall function, SLA aging — pinned by ~30 failing-test-first node:test cases (16 today). Proof: `node --test "core/*.test.js"` green; regenerated examples/output.json diffed; their feature set cited to the article + catalog §2.15.

**5) RISKS**: (a) counterpart = one-line secondary source; "better" claims stay scoped to documented features; (b) readiness-formula change (provenance) breaks examples/output.json — regenerate + spec bump; (c) `transition()` alters the IO contract — sync spec/demo/examples; (d) cross-category detection may add false positives — default off; (e) **tests NOT run**: no execution tool exists in this read-only session — static trace of all 16 tests against core.js is consistent (incl. hand-computed readiness 69/nearly-ready matching report.md); implementer must run the suite first and treat any mismatch as a stop.

**DONE_WITH_CONCERNS** — concern: test pass/fail unverified without execution tooling (static review: 16/16 consistent); counterpart evidence is secondary-source-thin.