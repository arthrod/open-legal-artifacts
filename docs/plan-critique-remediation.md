# 规划师 — run dc77f578 participant 0

# Execution Plan — Round-6 Critique Remediation (open-legal-artifacts)

## 1. 目标与非目标

**目标**: Fix the five critique findings (P1-A verdict emphasis, P1-B demo chrome onto tokens, P2-A client-intake step 3, P2-B prompting course shape, P3 baseline drift) at **source level**, then retire the bundle-time patches in `deploy/build-site.mjs`, with per-wave headless-Chrome screenshot verification ("keep seeing it").

**非目标 (this batch does NOT do)**:
- Searchable-index work beyond what already shipped (the critique's P1-1 — already in `app/src` as `.index-tools`; only its 10px residue falls into P1-B).
- The round-5 P1 PII entity-table fix (already tracked separately; only its side-stripe/typography falls into the P1-B sweep).
- Measure regulation (`--measure: 68ch`), hero 88ch, textarea clipping, deviation-row-9 tag stacking, em-dash detector warnings — separate polish pass, out of scope here.
- Content invention anywhere (no new copy beyond the small P2-A summary UI and P2-B ending).

## 2. 前提与假设

Verified in source this session (evidence tier: **verified** unless marked):

1. **P1-A is real in all three tools.** `cite-check` `.pill.exact{background:var(--text)}` / `.pill.not_found{dashed, transparent}` / `.pill.fuzzy{accent fill}`; `contracts-playbook` `.pill.preferred` black fill, `.pill.avoid` #c62828 fill, `.q.exact` black fill, plus RYG counts with `#2e7d32`/`#c62828`/accent **surface fills**; `limitations-radar` `.badge.deadline_upcoming` accent fill (yellow-as-status), `filed_late`/`deadline_passed_unfiled`/`data_needed` share one black badge, and claim *cards* carry no status differentiation.
2. **The bundle regex does not catch the most common stripe.** Sources write `border-left: var(--rule-yellow-h) solid var(--accent)` (cite-check/contracts `.ev`, limitations `.conflict`/`.gate`); the build script only rewrites literal `2-4px` — these stripes ship to production. Verified in `deploy/build-site.mjs` `decorate()`.
3. **`app/src/styles.css` already has** the global `:focus-visible` (ink ring) and `--ok/--warn/--bad` tokens — shipped with the search toolbar; the critique text predates this. **Still open in that file**: `.tile-meta/.chip/.pill/th/.demo label/.meta-box h3` at 10px, `textarea:focus` accent ring, accent-filled `button`, and a 2px accent `border-left` on `.note`.
4. **Demo `tokens.css` (36 copies) lacks `--ok/--warn/--bad`** and any `:focus-visible`; every demo imports it, so it is the correct carrier for both.
5. **Client-intake step 3** renders one card per question (10 for landlord_tenant) with **both** a text input and a chip row for `choice` fields (`contact_method`, `urgency`), no rewrite summary, actions at card bottom. Verified in `artifacts/client-intake/demo/index.html` `renderReview()` + `core.js` `FIELD_META`.
6. **The course ships in two places**: `artifacts/prompting-for-attorneys/` (self-hosted Libre Franklin/Roboto Mono, canonical per its README) and `vt-val/course/` (same families via Google Fonts CDN — the val is text-only). The `.cta` dark band + `https://arthur.law` "Contact →" funnel live in `js/app.js` `home()`. The vt-val copy has the `← Open Legal Artifacts` back-bar; the artifacts copy does not.
7. **P3 duplicate-rule locus**: the mono-h1 demo family (`pii-ptbr-lgpd`, `ai-governance-benchmark`, `immigration-papers-reader`, `intake-benchmark`, and any other file matching `header { border-bottom: var(--hairline) }`) stacks the accent `.rule` **and** a header hairline under the h1.
8. **Assumption (unverified)**: `vt-val/course/` is manually synced from `artifacts/prompting-for-attorneys/` (no sync script found in `deploy/`). Executor must confirm direction before editing.
9. **Assumption**: 33 open-artifact demos + 3 artifact demos = 36 sources; `design/tokens.css` is the canonical token file mirrored into each demo dir.
10. Deploy pipeline: `node deploy/build-site.mjs` → `vt-val/site/*.html` → Val Town + GH Pages mirror. Deployed pages can trail source; every wave verifies against a **fresh local build**, not the stale live URL.

## 3. The Emphasis System (decided once, consumed by P1-A)

**The verdict-ink rule** — failures take the ink, passes whisper, one tinted row:

| State | Pill treatment | Tokens |
|---|---|---|
| **bad / actionable failure** (`not_found`, `mismatch`, `filed_late`, `deadline_passed_unfiled`, `avoid`) | **Solid ink pill**: `background: var(--text); color: var(--bg); border-color: var(--text)` | ink |
| **warn** (`fuzzy`, `deadline_upcoming`, `fallback`, `data_needed`) | `border: 1.5px solid var(--warn); color: var(--warn); background: transparent` | `--warn` as border+text |
| **pass** (`exact`, `normalized`, `filed_timely`, `preferred`) | Muted outline: `border: var(--hairline); color: var(--ok)` | `--ok` text only |
| **actionable row** (the ONE status-surface spend) | Full-width `background: var(--flag-tint)` (#fffbe6, already sanctioned by DESIGN.md "Flag Tint") on the row/card the user must act on | tint |

Rationale: DESIGN.md bans status fills ("never fill a surface… except the flag tint inside a table row") and bans yellow-as-status; ink is the system's existing loudest device (primary button, back-bar), so failure-by-ink adds no new vocabulary. `--ok/--warn/--bad` = `#15803d/#b45309/#b91c1c` (DESIGN.md values, already in `app/src/styles.css`), **text/border only**.

Flag-row semantics change (JS, not just CSS): cite-check currently flags every non-`exact` row — retarget to `not_found || pinpoint.mismatch` (normalized is a pass). Contracts-playbook keeps `avoid || quote.not_found`. Limitations tints the claim card whose status ∈ {`filed_late`, `deadline_passed_unfiled`} or that carries conflicts/flags.

## 4. 步骤清单 (waves; per-item mini-plans embedded)

### Wave 0 — Baseline capture (all items)
- **做什么**: Build fresh (`node deploy/build-site.mjs`), headless-Chrome capture at 1280×2400: landing, cite-check, contracts-playbook, limitations-radar, client-intake, course home + one lesson, plus 6 stratified demo pages. Save to `tmp/shots/wave0/`.
- **交付物**: Baseline set + a reusable capture script (URL list → PNGs).
- **依赖**: none. **验收**: 12+ PNGs exist; the three defects are visible in them (emphasis inversion, stripes, wide 4th tile).
- **估算**: 乐观 1h / 现实 2h / 悲观 4h (capture tooling missing).

### Wave 1 — Token layer (P1-B foundation)
1. **做什么**: Edit `design/tokens.css` (canonical): add `--ok/--warn/--bad/--flag-tint` to `:root`, add one global block: `:focus-visible { outline: 2px solid var(--text); outline-offset: 2px; }` and `textarea:focus, input:focus, select:focus { outline: 2px solid var(--text); outline-offset: 2px; border-color: var(--text); }`. Propagate to **all 36** `*/demo/tokens.css` copies (identical insertion after the `--hover` line; mechanical — see sweep greps in Wave 3).
2. **交付物**: Patched token files; zero behavioral change yet.
3. **依赖**: Wave 0 (nothing depends on it, but baseline first). **验收**: `grep -c -- "--ok:" open-artifacts/*/demo/tokens.css artifacts/*/demo/tokens.css` = 36×1; a demo page tabbing through links shows an ink ring (screenshot).
4. **风险**: The extra ~300B nudges pages near the 78KB font-strip threshold → note oversized count before/after (`build-site.mjs` logs it). **估算**: 0.5d realistic.

### Wave 2 — The three verdict tools (P1-A, merged with those files' P1-B items)
Same editor touches CSS+JS in each file once — no double-pass over the same file.

**2a. `open-artifacts/cite-check/demo/index.html`**
- Pills per the emphasis system (`.pill.exact/.normalized` → pass outline; `.fuzzy` → warn; `.not_found`, `.mismatch` → ink fill).
- JS: flag condition → `r.classification === "not_found" || r.pinpoint?.status === "mismatch"`.
- `.pill` 10px → 11px; `.counts span` 10px → 11px; `th` 10.5px → 11px.
- `.ev` side-stripe → full hairline border (drop `border-left: var(--rule-yellow-h) solid var(--accent)`), optionally the 6px accent gutter square already used elsewhere.
- Dead media query `@media (min-width: var(--bp-mobile))` → literal `768px`.
- **验收** (screenshot): `not_found`/`mismatch` rows read loudest (ink pill + #fffbe6 row); `exact`/`normalized` pills quiet outline; no yellow pill anywhere; only flagged rows tinted; tab-ring ink. **估算**: 乐观 1h / 现实 2h / 悲观 3h.

**2b. `artifacts/contracts-playbook/demo/index.html`**
- `.pill.preferred` → pass outline; `.pill.fallback` → warn; `.pill.avoid` → ink fill (kills the #c62828 white-text fill); `.q.exact/.q.fuzzy/.q.not_found` same mapping; `.pill.uncovered` stays dashed muted (unverified is first-class, not a failure).
- RYG counts `.g/.y/.r`: delete surface fills; numbers in `--ok/--warn/--bad` text, labels muted (one rule: `.counts .g b { color: var(--ok) }` etc.).
- Same font/stripe/media fixes as 2a. `.pill`/`.counts span`/`th` → 11px.
- **验收**: Screenshot of section 2 + 3: no green/red/yellow filled cells remain; `avoid` rows carry ink + tint; RYG strip is text-colored numbers only. **估算**: 1h / 2h / 3h.

**2c. `open-artifacts/limitations-radar/demo/index.html`**
- Badges: `filed_timely` → pass outline (`--ok` text); `deadline_upcoming` → warn (kills accent fill); `filed_late`/`deadline_passed_unfiled` → ink fill; `data_needed` → warn (default; see decisions).
- JS: add `expired` class to `.claim` card when status ∈ fail set or flags/conflicts exist → `background: var(--flag-tint)` (the one tint spend); keep the 4px accent **top** rule (sanctioned) on untinted cards.
- `.conflict`/`.gate` side-stripes → plain hairline box; kicker `OPEN·LEGAL·ARTIFACT` → `…ARTIFACTS`; `.err` `#8a1f1f` → `var(--bad)`; dead media queries → 768px (two occurrences).
- **验收**: Screenshot after auto-run: expired/flagged claim cards visibly tinted with ink badges; timely cards quiet; no accent badge, no accent left-stripe. **估算**: 1h / 2h / 4h (card-tint logic touches render loop).

### Wave 3 — Mechanical sweep, remaining demo sources (P1-B) — parallelizable with Wave 2, no file overlap
- **做什么**: For every `open-artifacts/*/demo/index.html` + `artifacts/{pii-ptbr-lgpd}/demo/index.html` **except** the three Wave-2 files and client-intake (Wave 5):
  1. Kill `>1px` colored `border-left` (accent **and** status-hued `#a00` — e.g. `immigration-papers-reader .referral/.warn`, `subpoena-response .warn`): replace with full hairline border (optionally gutter square). Keep neutral `2px solid var(--border)` quote/timeline rails (sanctioned). Known hits: `.banner/.cat/.disclaimer/.gap/.dep/.warn/tr.composite td:first-child/.ev`-family.
  2. Lift every `font-size` < 11px to 11px (px and rem; `0.68rem`≈10.9 → 11px). Keep tracking ≤ 0.12em.
  3. Replace `@media (…-width: var(--bp-mobile))` with literal `768px`.
  4. Tokenize status hexes: `#2e7d32/#c62828/#a00/#8a1f1f` → `var(--ok)/var(--bad)/var(--bad)/var(--bad)` as text/border only.
  5. Normalize `h1` to the DESIGN demo scale `clamp(26px, 4vw, 38px); letter-spacing: -0.02em` (kills the need for the bundle `!important` h1 override).
  6. Duplicate-rule fix (P3, lives here — same files): in the `header { border-bottom: var(--hairline) }` family, **keep the accent `.rule`, delete the header border-bottom** (the accent rule is the signature shared by the other ~28 demos; the hairline is the duplicate).
- **Mechanical sweep strategy (proof of completeness, file-by-file)** — run before (expected hits) and after (must be zero):
  - `grep -rnE "border-left:\s*([2-9]px|var\(--rule-yellow-h\))\s+solid\s+var\(--accent\)" open-artifacts artifacts --include=index.html`
  - `grep -rnE "border-left:\s*[2-9]px\s+solid\s+(#a00|#c62828|var\(--bad\))" …`
  - `grep -rnE "font-size:\s*(([0-9]|10)(\.[0-9]+)?px|0\.[0-6][0-9]*rem)" open-artifacts/*/demo artifacts/*/demo app/src` (treat `0.68rem` as a hit)
  - `grep -rn "var(--bp-mobile)" …` inside `@media`
  - `grep -rnE "#2e7d32|#c62828|#a00|#8a1f1f" …`
  - `grep -rn "OPEN·LEGAL·ARTIFACT\b" -P "(?<!S)"` or simply grep the singular string.
  Each file's after-state pasted into the wave's evidence note — that is the completeness proof.
- **交付物**: 32 patched demo sources + before/after grep logs. **依赖**: Wave 1 (tokens). **验收**: all greps zero; spot screenshots (6 stratified pages incl. one mono-h1 page showing single rule under h1); rebuilt bundles show no `!important` needed.
- **风险**: Volume (32 files, ~6 patterns each) — mitigate with a temporary codemod or per-pattern multi-file edit; every diff reviewed by eye before commit. **估算**: 乐观 1d / 现实 1.5–2d / 悲观 3d.

### Wave 4 — `app/src` (P1-B residue + P3) 
- **Files**: `app/src/styles.css`, `app/src/pages/index.ts`.
- **做什么**:
  1. 10px → 11px: `.tile-meta`, `.chip`, `.pill`, `th`, `.demo label`, `.meta-box h3`.
  2. `textarea:focus, select:focus` accent ring → `var(--text)`; `button` accent fill → Signage Black primary with accent hover (per DESIGN.md button-primary); `.note` 2px accent `border-left` → hairline box or top rule.
  3. **P3 tile baselines**: reproduce first with a forced 2-line title (screenshot). Current CSS already has `.tile-desc{flex:1}`, which should bottom-align `.tile-links`; if live pixels disagree, the deployed build trails source → fix is rebuild; if source genuinely fails, add `.tile-links { margin-top: auto }` and drop `flex:1` from desc.
  4. **P3 4th-original tile**: give the originals `.cards` its own `grid-template-columns: repeat(2, 1fr)` (2×2, ~530px tiles; default option — see decisions) and delete the orphan-span interplay for that grid only.
  5. Confirm the global `:focus-visible` block stays (already present).
- **验收**: `npm run build` clean; screenshot of originals section shows 2×2 equal-density tiles; 3-tile row with wrapped title has link rows on one baseline; computed styles show ≥11px labels, ink focus, black primary. **依赖**: none of Wave 2/3 (parallel-safe). **估算**: 0.5d / 1d / 1.5d.

### Wave 5 — Client-intake step 3 (P2-A + its P1-B items in one pass)
- **File**: `artifacts/client-intake/demo/index.html` (CSS + `renderReview()`), no `core.js` schema change.
- **做什么**:
  1. **≤4 blocks**: group `p.questions` by field id into fixed blocks — *Identity* (`full_name`, `contact_method`, `contact_detail`), *Matter* (`opposing_parties`, `other_parties`*, `jurisdiction`, `documents`), *Dates & urgency* (`key_dates`, `urgency`), *Outcome* (`desired_outcome`, `budget`, `matter_detail`) (*when the area omits `other_parties` the block just renders fewer fields). Block head = one 11px mono label + count.
  2. **Chip-only enums**: for `type: "choice"`, render the chip row as the *only* control — delete the text input for those questions. Precedence stated in code comment + help text: the chip is the single writer; free-text entry exists only for `text`/`date` questions. (If a draft value ever matches no chip — impossible with current data — fall back to showing the draft as a disabled chip.)
  3. **Rewrite summary**: at the top of step 3, one line `3 rewritten — review these` (count = `val !== q.draft`), each rewritten label rendered as an in-page anchor (`href="#q-<id>"`, `scroll-margin-top` on the `.q`). Zero state: `All drafts accepted`. Same summary line repeated on step 4's confirm gate.
  4. **Sticky action bar**: `.actions { position: sticky; bottom: 0; background: var(--bg); border-top: var(--hairline); padding: 12px 0; z-index: var(--z-actions, 9) }` (named layer, per Z-Scale Rule).
  5. Same-file P1-B: `.banner` side-stripe → hairline box; `.tag` 10.5px → 11px, `th` `0.68rem` → 11px; `.tag.edited` accent fill → **ink fill** (attention takes ink, matching the emphasis system); dead media query → 768px.
- **验收**: Screenshot at review step (auto-boots there): exactly 4 block heads; `contact_method`/`urgency` show chips only (no text input); summary line present with working anchor jump (verify via a second screenshot at target scroll); scrolled-to-bottom screenshot shows the action bar pinned. Interact: click a chip → tag flips `rewritten`, summary count increments. **依赖**: Wave 1 (tokens). Parallel with Waves 2–4. **风险**: the boot-time worked example must render the summary with its 5 rewrites — cover with the auto-boot screenshot. **估算**: 乐观 0.5d / 现实 1d / 悲观 2d.

### Wave 6 — Prompting course (P2-B — decision taken, see §7)
**Decision: option (a) — bring into catalog voice end-to-end.** Rationale: DESIGN.md's Don't-list already rules out a second design language ("must come back to Manrope + Departure Mono and carry `← Open Legal Artifacts`"), and PRODUCT.md principle 4 ("nothing is behind a door… it never sells, because the demo does the selling") makes the dark CTA band + `arthur.law` funnel ending a product contradiction, not a variant. Option (b) would preserve a register break on an AI-slop-flagged page ("yes on /course/" in Assessment A).

- **Files**: `artifacts/prompting-for-attorneys/` (canonical: `css/fonts.css`, `css/tokens.css`, `css/base.css`, `css/header.css`, `css/home.css`, `css/footer.css`, `js/app.js`, `index.html`) **and** `vt-val/course/` (same set; CDN fonts) — change together, one commit per copy, diffed for parity.
- **做什么**:
  1. Type system: `--ff` → `"Manrope", system-ui…`; `--mono` → `"Departure Mono", "JetBrains Mono", ui-monospace…`. Canonical copy: self-host via existing repo `fonts/DepartureMono-Regular.*` + Manrope (bundle or CDN). VT copy: Google-Fonts Manrope + JetBrains Mono fallback (val is text-only; Departure Mono not on Google Fonts — parity via stack, same as size-capped demo bundles).
  2. Kill the funnel: remove the `.cta` section and `Contact →` in `app.js` `home()`. Replace the "After the course" block with a **proof ending**: the completion state (`10 / 10 complete`) plus two catalog links — `Run the tools →` (`/`) and `Read the source ↗` (repo) — no contact, no dark band. Dark footer → field-colored hairline footer (keep the attorney-advertising line, which PRODUCT.md requires).
  3. Kill remaining dark chrome: `.cta`/`.ondark`/dark footer styles deleted from `home.css`/`footer.css`; 44px display → catalog headline scale; keep the lesson-row pattern untouched (both reviews call it the best component in the delivery).
  4. Add the `← Open Legal Artifacts` back-bar to the artifacts copy (VT copy has it; tokenize its inline `ui-monospace` style while there).
  5. Executor reads `css/home.css`/`base.css` fully before editing — remaining hex/type decisions live there.
- **验收**: Side-by-side screenshots (course home + lesson 1) show Manrope/Departure Mono texture, no dark band, no external contact link, proof-ending links resolve; `grep -rn "arthur.law" artifacts/prompting-for-attorneys vt-val/course` returns only provenance/footer mentions if the §7 footer-link option is chosen (else zero); both copies diff-identical in DOM structure. **依赖**: Wave 1 optional (course has own tokens). Parallel with 2–5. **估算**: 乐观 1d / 现实 1.5d / 悲观 3d (dark-chrome CSS is spread across 10 files).

### Wave 7 — Retire bundle-time patches, rebuild, final verification
- **做什么**: In `deploy/build-site.mjs` `decorate()`, **remove** (each now guaranteed at source):
  1. Both side-stripe regexes (`var(--accent)` and `#ffd400` literal forms).
  2. The `@media var(--bp-mobile)` → `768px` rewrite.
  3. The `OPEN·LEGAL·ARTIFACT` singular rewrite.
  4. The entire injected `polish` `<style>`: `:focus-visible` rules, `textarea:focus` rule, `.primary` background fix, and the `h1{…!important}` normalization.
  **Keep**: back-link bar injection, disclaimer footer injection, the auto-run script, the oversized-font strip. Then full rebuild + deploy + Wave-0 capture set re-run (`tmp/shots/wave7/`) + re-run the round-6 detector (target: `side-tab` warnings 0, `design-system-font-size` findings 0 on the five targets).
- **验收**: `grep -n "border-left\|bp-mobile\|ARTIFACT(?!S)\|!important" deploy/build-site.mjs` clean; rebuilt pages byte-diff vs pre-cleanup build shows **no visual delta** in screenshots (the proof that source fixes fully supersede the patches); live URL (after deploy) matches local build.
- **依赖**: ALL prior waves. **需先确认**: the deploy itself (production push) — irreversible-ish; get owner go-ahead. **估算**: 0.5d / 0.5d / 1d.

## 5. 关键路径与里程碑

**关键路径**: Wave 0 → Wave 1 → Wave 3 (32-file sweep) → Wave 7 — the sweep is the longest single chain member; Waves 2/4/5/6 hang off Wave 1 (or nothing) in parallel and must all land before Wave 7.

| 里程碑 | 可验证检查点 | 偏离信号 |
|---|---|---|
| M1: Tokens live | 36/36 demo tokens.css contain `--ok/--warn/--bad` + `:focus-visible` (grep count = 36) | Any demo page still shows accent focus ring after tokens import |
| M2: Verdict tools re-inked | Screenshots: ink = failure, outline = pass, one tinted row, zero yellow pills (3 pages) | A pass state still reads louder than a failure in side-by-side crop |
| M3: Sweep complete | All six sweep greps return **zero** across `open-artifacts/`, `artifacts/`, `app/src`; logs archived | Any single surviving hit — the sweep is pass/fail, not percentage |
| M4: Catalog + intake + course | 2×2 originals grid, aligned link baselines, 4-block intake with chip-only enums + sticky bar + summary, course in Manrope with proof-ending (screenshots per page) | Intake block count >4 or a duplicate control visible; any arthur.law CTA remains |
| M5: Bundle patches retired | build-site.mjs grep clean AND pre/post-cleanup screenshots pixel-equivalent | Visual delta after removing patches = a source fix is incomplete → back to the owning wave, do not re-add the patch |

**总估算**： 乐观 ~4.5d / 现实 ~7d / 悲观 ~12d (serial; parallel execution compresses wall-clock to ~5d realistic). Basis: file counts verified above (36 demo sources, ~6 edit patterns each) and analogy with rounds 3–5 (bundle-only fixes took hours; source-level across 36 files is the multiplier).

## 6. 风险登记 (only plan-bending ones)

| 风险 | 等级 | 触发时计划怎么变 |
|---|---|---|
| 78KB VT cap: Wave-1 CSS + inline fixes push oversized count up | 中 | Accept the existing font-strip fallback (JetBrains Mono); do not re-inline fonts per page — never re-add bundle-time CSS |
| Deployed site trails source (observed: 64ch rule) | 中 | All acceptance runs against fresh local build; live-URL check only at M5 |
| Course copies drift during Wave 6 (manual sync assumption wrong) | 中 | Executor diffs the two trees first; if a sync script exists, run it; if not, edit both and record the pairing in the commit message |
| Sweeping h1 normalization changes mono-h1 pages' character (ask-legal/matter-board/etc. use mono h1 deliberately) | 低–中 | The DESIGN demo scale is the rule; if a page's mono-h1 is load-bearing, flag it in the wave note and keep ≥26px mono **only** with an explicit note — decision, not default |
| Removing the h1 `!important` override reveals per-page h1 drift the sweep missed | 中 | M5's pixel-diff catches it; fix at source in the offending file, never restore the override |

## 7. 需要拍板的问题 (defaults given; executor proceeds on default if no answer)

1. **P2-B shape** — default: **(a) full catalog voice** (per DESIGN.md's existing ruling). Sub-decision: keep a *quiet footer provenance link* to arthur.law (default: **yes, text link in footer only, no CTA styling**) or remove every link (PRODUCT.md permits provenance, bans funnels).
2. **P3 4th-original tile** — default: **2×2 grid**. Alternative: enrich the 4th tile with live-status meta (rejected as default: invents density the data doesn't have).
3. **`data_needed` badge tier** — default: **warn** (needs input ≠ failure). Alternative: muted dashed (treat unknown as first-class quiet state).
4. **Neutral 2px `var(--border)` quote rails** (cite-check/contracts `.ev blockquote`, renewal-calendar `.tl`) — default: **keep** (sanctioned timeline/quote rail, not a colored accent). Alternative: reduce to 1px.
5. **Deploy cadence** — default: local verification per wave, single production deploy at M5 (needs owner confirmation — the only irreversible step in this plan).