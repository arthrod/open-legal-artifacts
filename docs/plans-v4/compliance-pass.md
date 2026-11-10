# Design-system compliance plan (Planner, run a9d4840d/0) — against design/DESIGN-SYSTEM.md

**AUDIT FACTS (verified by grep)**
- ✅ Demo buttons already ink-at-rest → mark-on-hover (spec-correct pattern, ~15 demos).
- ❌ **P0 yellow-at-rest**: persistent accent fill on toggles — obligations-checker:27 & fact-chronology:51 `button[aria-pressed="true"]{background:var(--accent)}`. Fix: selected = ink fill/bg text (spec "current/selected"; jurisdiction-survey-matrix `.chip[aria-pressed=true]` is already the correct model).
- ❌ **P0 stripes**: ai-governance-benchmark:47, jurisdiction-survey-matrix `.attention`, playbook-deviation-board:68 (accent left-border); landing styles.css:546 `.fulltool-card` (accent left), :346 `.tile-striped` (accent top). Fix: full 1px ink structural border + mono status chip inside + lift hover; encode category via tag, not edge color. Faint/status-token stripes (obligations-checker:40, renewal-calendar:35) = keep — data-encoding.
- ❌ **P0 muted-on-tint**: entity-compliance-calendar:35 (flag-tint + `--text-secondary`). Sweep-required (unverified, inherited colors): ai-use-case-inventory:24 `.bar b`, docket-watch-wall:36 `.pill b`, immigration-papers-reader:29 `.st.present`. Fix: `--muted-strong` or full ink. flag-tint+`--warn/--bad` = exempt (ruling 1). Also fact-chronology:37 off-palette `rgba(234,209,130,.25)` → `--flag-tint`.
- ❌ **P1 hover table**: no 2px button rise; cards/tiles bg-swap only, no `--lift`+translateY(-3px) (landing `.tile:hover`); criminal-charge-reality-check:23 ghost hover fills flag-tint → mark.
- ❌ **P1 focus**: offset 2px → 3px (tokens.css + landing styles.css:103); inputs: **decide: BOTH** — keep 2px ink `:focus-visible` outline (a11y tests pin it) + add `box-shadow:3px 3px 0 var(--mark)`.
- **P1 reading mode**: add `--muted-strong:#4A4A47` (absent) to canonical tokens; requires re-syncing all 35 demo copies (byte-identity test) + tabular-review prefix merge.
- **P2 hatch**: `--hatch` token absent; apply to empty-filter panels only (cite-check "No quotations match", ≤5 visible spots).
- **P2 arrows/small print**: landing detail links have →; sweep demos' primary buttons + middle dots; nav hover should be ink (accent underline = current only); footer keeps not-legal-advice, `© MMXXVI`.

**PUSHBACK (Arthur's call)**: the 56×2px `.rule` yellow bar under H1 (all 36 demos + landing `.rule-yellow`) is technically off the accent-permitted table, but I recommend KEEPING it — one per page, it *is* the heading's mark, and converting means touching 36 headings for zero legibility gain. If you want strict, swap for `.ds-mark` on one heading phrase. Default in plan: keep + guard-test allowlist.

**GUARD-TEST EXTENSIONS** (tests/design-tokens.test.mjs): (a) no `background:var(--accent|--mark)` outside `:hover/:focus`/.ds-mark/allowlisted `.rule`; (b) zero `border-(left|top):Npx solid var(--accent)` in demos+landing; (c) muted/text-secondary never fills faint/flag-tint/surface in same rule; (d) `--muted-strong:#4A4A47` + `--hatch` present, copies byte-identical (existing check auto-covers); (e) `outline-offset:3px` + input `3px 3px 0` shadow.

**WORKSTREAMS**
- **WS-B first (landing+tokens+guard)**: canonical tokens edits, sync 35 copies, tabular merge, landing fixes, guard tests. Accept: `node --test tests/design-tokens.test.mjs` green incl. new checks; `grep -rnE "border-(left|top): ?[0-9]px solid var\(--accent\)" open-artifacts app/src` → 0; browser check (Chrome, per rules).
- **WS-A after (demos fleet, parallelizable)**: P0 toggles+stripes+tint fixes, P1 hover/lift/focus/muted-strong per demo. Accept: `grep -rn 'aria-pressed="true"] { background: var(--accent)' open-artifacts` → 0; grep (c)-pattern → 0; full suite 1070/0 green; last task waits CI ≤10min.

Out of scope: client-intake/contracts-playbook/vt-val legacy dirs (separate pass if wanted).

DONE