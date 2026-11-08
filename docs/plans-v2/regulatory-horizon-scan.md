# Planner — run 7290de40 participant 24

Recon complete (our artifact read in full; counterpart studied via the fetched `anthropics/claude-for-legal` repo + local catalog §2.2). Note: I could not run tests — no exec tool exists in this session (searched shell/bash/sandbox/runner: none).

**REGULATORY HORIZOR SCAN — improvement plan**

**1) THEIR EDGE** (evidence: fetched repo `regulatory-legal` plugin + `reg-feed-watcher` SKILL.md, 2026-11-07; gallery artifact itself is closed, described via local catalog §2.2 — secondary)
- Live multi-tier feeds: Federal Register API + regulator RSS + paid MCP/CourtListener; ours takes hand-built JSON.
- Provenance discipline: every item source-tagged; `[web search — verify]`/`[secondary source]` items downgraded until traced to primary.
- Rulemaking-stage nuance: NPRM/ANPR/RFI branches — ANPR/RFI never "always material"; comment deadlines auto-logged to a tracker.
- Coverage check (Step 0): watchlist vs a curated source catalog; gaps surfaced in digest.
- Ops loop: scheduled weekly/daily monitor, digest file output, handoffs to policy-diff/gap/comment trackers.

**2) OUR GAPS (top 5)**
1. No `commentDeadline`/`itemType` — blind to comment windows and ANPR/RFI pre-rule nuance.
2. No provenance tiers — `source` is a bare string; nothing flags secondary/unverified items.
3. First-wins dedupe discards richer duplicate fields (theirs prefers the richest source).
4. No coverage-gap check between profile and feed.
5. No digest/"bottom line" export; timeline drops undated items; demo isn't literally self-contained (links tokens.css/example.js).

**3) IMPROVEMENTS** (all: failing-test-first, no new deps, this dir only)
1. Add `itemType` + `commentDeadline`; new "commentWindow" score factor + deadline milestones in timeline. Beats theirs: their prose policy becomes tested deterministic code. Test: open comment deadline ≤30d earns points; ANPR/RFI capped below "high". **S** — core.js, core.test.js, spec.md, examples/input.json.
2. Provenance field (primary|secondary|manual|unknown); non-primary caps band at "medium" + "trace to primary" note. Deterministic downgrade vs their LLM discretion. Test: score-95 secondary item → band "medium" + flag. **S**.
3. Merge-dedupe: duplicates merge fields, richest wins (non-null dates/link), `mergedFrom` recorded. Test: kept item w/o link + dup with link → merged has both. **S**.
4. `coverageGaps(feed, profile)`: profile jurisdictions/topics with zero feed items listed w/ severity — deterministic Step 0. Test: EU in profile, no EU items → gap reported. **M**.
5. `toMarkdown(scan)`: digest with "Bottom line" (N action items, earliest action date), tiers, per-item breakdown. Test: exact snapshot on example. **M**.
6. Timeline completeness: `actionBy = min(effectiveDate, commentDeadline)`; undated/past items kept in sections, not dropped. Test: undated item present. **S**.
7. Demo: rubric-weight editing, diff tab, coverage-gap chips; inline tokens/example → truly single file. Acceptance: opens via file:// with zero sibling fetches. **M** — demo/index.html.

**4) VERIFIABLE-BETTER CLAIM**
Every materiality/provenance/deadline rule theirs states as LLM prose becomes deterministic, versioned, diffable code with a per-point audit trail and reproducible `asOf`. Proof: `node --test core/` green incl. ≥10 new tests; `node examples/run.js` byte-identical re-run; CSV/MD exports show `factor:points (reason)` per score.

**5) RISKS**
- Repo analogs are proxy evidence for the closed gallery artifact (marked as such).
- No network in core by design — "live feeds" gap narrows via schema only, not closed.
- Verify whether the deployer already inlines demo siblings before refactor; update README's "12 tests" count.

**Tests:** NOT RUN — no execution tool available; static trace of core.test.js vs core.js is consistent (e.g., 95 = 30+25+25+15 traced), but that is inference, not verification.

Status: DONE_WITH_CONCERNS