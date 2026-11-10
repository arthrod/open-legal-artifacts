# Inspector — run a9d4840d participant 7

All evidence is in. Every path shipped by the build is a `*/demo/index.html` page — the `artifacts/*/frontend` CSS with 10–11px type is legacy source outside the shipping path, so no automatic block. The VT build output committed in `vt-val/site` was generated at `07:28:40Z`, four seconds before the logged bundle receipt, and contains every fix.

# Final compliance-closure inspection — Inspector ruling

**Scope of this pass:** the four closure items from my BLOCKED—PARTIAL ruling (archived at [.impeccable/critique/compliance-inspection-1.md](tmp/open-legal-artifacts/.impeccable/critique/compliance-inspection-1.md)). Method: bytes only (no exec, per brief); I re-derived each guard invariant myself rather than trusting the 14/14 summary line.

## Claim 1 — badge 10px → 12px (limitations-radar)

| Axis | Ruling | Evidence |
| --- | --- | --- |
| 1. Actually completed? | RETRACTED (complete) | `.badge small { font-size: 12px }` at [limitations-radar/demo/index.html:31](tmp/open-legal-artifacts/open-artifacts/limitations-radar/demo/index.html) and the deployed copy [vt-val/site/limitations-radar.html:294](tmp/open-legal-artifacts/vt-val/site/limitations-radar.html) |
| 2. Only partial? | FULL | both source and deploy-source copies fixed; my fleet-wide regex `font-size: (?:\d|1[01](\.d+)?)px` over all open-artifacts demos → **0 matches** |
| 3. Intent achieved? | ACHIEVED | spec floor ("nothing smaller than fs-micro", DESIGN-SYSTEM.md:103) no longer violated anywhere in the demo fleet |

## Claim 2 — `--hatch` token implemented + applied

| Axis | Ruling | Evidence |
| --- | --- | --- |
| 1. Actually completed? | RETRACTED (complete) | `--hatch` at [design/tokens.css:83](tmp/open-legal-artifacts/design/tokens.css), in all 33 open-artifacts demo copies + 3 artifacts demo copies (incl. tabular-review, the merged one) + inlined in vt-val/site pages; applied: `.empty { … background: var(--hatch) }` at [playbook-deviation-board/demo/index.html:64](tmp/open-legal-artifacts/open-artifacts/playbook-deviation-board/demo/index.html) and [vt-val/site/playbook-deviation-board.html:327](tmp/open-legal-artifacts/vt-val/site/playbook-deviation-board.html) |
| 2. Only partial? | FULL | token + ≥1 real application + on-record ruling in log (test-run.log:98: other demos' empty states are text panels, hatch-behind-text ruled out for legibility) — matches what I demanded |
| 3. Intent achieved? | ACHIEVED | plan-P2 promise no longer silently dropped; the ruling is recorded, not hidden |

## Claim 3 — guard 14 checks incl. raw font floor + muted-on-faint pairing

| Axis | Ruling | Evidence |
| --- | --- | --- |
| 1. Actually completed? | RETRACTED (complete) | exactly 14 `test()` blocks in [tests/design-tokens.test.mjs](tmp/open-legal-artifacts/tests/design-tokens.test.mjs):179/193/214 are the three new ones, and all three are substantive sweeps (real `matchAll` over every demo html/css), not stubs |
| 2. Only partial? | FULL | the 3 caught residuals are really fixed: [entity-compliance .pill.na](tmp/open-legal-artifacts/open-artifacts/entity-compliance-calendar/demo/index.html) now `--muted-strong` on `--hover`; tabular `th[scope="col"]` now `--muted-strong`; my independent muted-on-faint regex over all demos → **0 matches** |
| 3. Intent achieved? | ACHIEVED | the guard is no longer blind to raw CSS — my own byte-level re-run of both invariants (the thing the guard asserts) passes clean, which is stronger evidence than the logged summary line |

## Claim 4 — fresh bundle receipt + suites + deploy

| Axis | Ruling | Evidence |
| --- | --- | --- |
| 1. Actually completed? | RETRACTED (complete) | [evidence/test-run.log:97–100](tmp/open-legal-artifacts/evidence/test-run.log): closure entry 2026-11-10T07:28:44Z, "JS 809 pass / 0 fail + guard 14/14", "Bundle sizes >80,000 bytes: 0 (max: 78090)". vt-val/site/index.html embedded `generatedAt: 2026-11-10T07:28:40.779Z` — the committed deploy source is the fresh build. Reflog: `1d4f7f6` (closure) → `f649dcb` (HEAD, archive-only), matches claim |
| 2. Only partial? | FULL (with one caveat) | all committed evidence fresh and internally consistent |
| 3. Intent achieved? | ACHIEVED (caveat below) | the stale-receipt disagreement is dead: receipt is post-fix and the deploy source carries every fix |

**Evidence-tier caveat (what I could NOT verify this run):** `fetch_content` was hard-down (4 attempts, both hosts → `fetch_content_unavailable`), so the "live 200s post-fa5d825" assertion is unverified by me, and `fa5d825` appears in no committed receipt. Mitigating byte evidence: the gh-pages/VT build inputs committed at `vt-val/site` (generated 07:28:40Z) contain all four fixes. I do not hold DONE hostage to a tool outage the brief itself de-prioritized ("bytes + evidence primary"), but the next deploy-affecting change should re-log live 200s with the deployed SHA.

**Out-of-scope observations (suggestions, not blocks):** `artifacts/*/frontend` legacy marketing CSS (client-intake `design.css:5` has a literal 10px; prompting-for-attorneys `css/` has 11px labels) sits below the spec floors — but the site build ships only `*/demo/index.html` pages, so none of it is in a shipping path. Worth sweeping if those frontends ever deploy. Attorney-advertising deviation remains labeled as such — unchanged from my prior ruling.

---

## Final verdict: **DONE OVER OBJECTION**

- **Axis 1 (actually completed):** disagreement retracted — all four items verified in bytes at source and in the committed deploy build; commit chain `1d4f7f6`+`f649dcb` confirmed via `.git/logs/HEAD` and `refs/heads/main`.
- **Axis 2 (partial):** disagreement retracted — scope re-derived and exhausted: independent fleet-wide regex sweeps for sub-12px type and muted-on-faint pairings both return zero; the only sub-floor CSS found is outside the shipping path.
- **Axis 3 (intent):** disagreement retracted — the design-system compliance pass now holds byte-verifiably, the guard enforces the invariants that previously escaped it, and every dropped-spec decision (`--hatch` application breadth) carries an on-record ruling rather than a silent omission.