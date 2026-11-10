# Design migration plan — prompting-for-attorneys system (Planner, run 2fdfcfb8/0)

**Blunt pushback first (pfa regressions I will NOT adopt verbatim):** (1) `--fs-micro:10.5px` violates your 12px floor — v3 pins `--fs-label/--fs-micro` to 12px (base.css override baked in); (2) pfa defines **no `:focus-visible` styles** — old focus block is ported verbatim into v3, non-negotiable; (3) `--on-dark-dim:#6B6B6B` on ink is ~2.5:1 (fails AA) — token ships but no demo adopts on-dark body text; (4) `--fs-body:18px` global bump risks dense-table reflow — adopted, but the visual gate can demote demos to 17px individually.

---

# pfa Design Migration Plan — open-legal-artifacts

**Goal:** All 36 demos + landing inherit the prompting-for-attorneys DNA via canonical `design/tokens.css` v3 + legacy alias layer; zero renames, single-file demos intact, tests green.

**Architecture:** v3 = pfa tokens verbatim (colors/type/spacing/motion, `.ds-*`) + base.css a11y overrides (12px floors, `--fs-body:18px`) + kept status tokens + kept `.t-*` utilities restyled + ported `:focus-visible` + LEGACY ALIAS layer: `--text→var(--ink)`, `--text-secondary→var(--muted)`, `--accent→var(--mark)`, `--border→var(--faint)`, `--hover→var(--surface)`, `--hairline→1px solid var(--faint)`, `--font-body→Libre Franklin stack`, `--font-mono→var(--mono)` (pfa stack verbatim, incl. dead Departure fallback name), `--max-width→var(--page-max)` (1100→1180, flag), `--t-base:.2s ease` (kept, not aliased to `--t-mid`). Old layout constants (`--pad-x-*`, `--section-gap`, `--bp-mobile`…) kept verbatim — structural, not brand; build `decorate()` depends on `--pad-x-desktop`.

**Aliasing verdict: SUFFICIENT for fonts/colors.** Verified: zero Manrope/Departure literals in demo HTML or non-tokens CSS — fonts enter only via each copy's `@font-face`. Local edits needed only for: h1/h2 weight polish where `--font-mono` display sizes now render *real* 700 (Roboto Mono variable) instead of faux-bold Departure — enumerate in visual pass, expect <6 demos; not blocking.

**Fonts (W2):** `libre-franklin.woff2` + `roboto-mono.woff2` + both LICENSE txts → `design/fonts/` + all 36 `demo/fonts/`; delete Manrope/Departure files (sanctioned replace, not a rename). Self-hosted `@font-face` in v3 (`fonts/…` relative).

**Modified copies (~10, W4):** no blind overwrite. Scripted 3-way: diff copy vs old canonical → classify: added tokens/local features (keep, in marked `/* LOCAL */` block), value overrides incl. **tabular-review dark mode** (rebase overrides onto NEW names — `--bg/--ink/--muted/--faint/--surface` — so `.ds-*` classes follow too), font/status tweaks (drop, superseded). Audit script (Task 0) emits the manifest; "~10" is the user's figure — the manifest is ground truth.

**Landing (W5, minimal):** app/styles.css @font-face swap (dual-path srcs), `--font-body/--font-mono` stacks; build-site.mjs: strip regexes → `Libre Franklin`/`Roboto Mono`, CDN link → `family=Libre+Franklin:wght@100..900&family=Roboto+Mono:wght@400..700`. Type-scale: only map obvious h1/h2 to `--fs-display/--fs-h2`; shell layout untouched.

**Deploy:** policy unchanged — demo pages strip ALL @font-face; VT fallback = `system-ui…` / `ui-monospace…` (fonts never data-URI'd; MIME map excludes them). Landing keeps CDN-load strategy with new families.

**Acceptance (failing-first), node:test `tests/design-tokens.test.mjs`:** (a) every demo tokens.css: contains `Libre Franklin` + `Roboto Mono` @font-face, zero `/Manrope|Departure/` across demo CSS+HTML; (b) alias block present & resolves (each old name defined as `var(--new)`); (c) copies ≡ canonical modulo `/* LOCAL */` blocks; (d) floors: no `--fs-*` <12px; `:focus-visible` present; status tokens present; (e) build: the 5 slimmed pages ≤79.5KB (`node deploy/build-site.mjs` output sizes). **Visual:** before/after screenshots (Chrome ext, real browser) on: 1 pristine demo, tabular-review (dark), client-intake, 1 dense-table demo, landing — check h1 face/weight, `.ds-mark` lift hover, selection yellow, focus ring tab-through.

**Workstreams (stacked PRs, one layer each):** T0 audit+manifest (0.25d) → T1 v3 + failing lint test (0.5d) → T2 fonts distribution (0.25d) → T3 pristine sync, ~26 demos, scripted (0.25d) ∥ T4 modified merges, manual (1d) → T5 landing+build (0.5d) → T6 visual gate + polish (0.5d). ≈3 days. Other-corpus reviewer per layer; measurer = the test file + build sizes.

**Risks:** byte drift on 5 slimmed pages (v3 ~+1.5KB; minify fallback exists; T1 measures); dark copies (rebase rule above); wordmark face change Departure→Roboto Mono (brand-visible — shown in T6 screenshots for sign-off); 1100→1180 reflow; real-vs-faux bold h1s.

**Not covered:** per-demo redesign beyond alias inheritance; pfa site itself; Newsreader serif adoption.

---

Arthur — note the one thing I did **not** find: your "~10 locally-modified tokens.css" — only tabular-review self-identifies as dark-mode; the rest need the Task 0 diff manifest to enumerate (I couldn't run a 36-file diff read-only). Everything else above is verified from the repo. Design decisions above are mine as your planner; say the word and this goes to the implementer dispatch.

DONE