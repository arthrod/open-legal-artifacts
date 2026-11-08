# 规划师 — run f7c2f5cb participant 0

# Plan — critique-P1 "Searchable index" (Open Legal Artifacts catalog)

## 1. Goal and non-goals

**Goal.** Make the 33-tile Open reimplementations section searchable: a sticky toolbar (search + practice-area filters) above the grid, reader-question grouping at rest, provenance demoted from chip to glyph, filter/search state deep-linkable via hash, results count and empty state always present — all inside the existing token system.

**Non-goals.**
- No changes to the Originals (4 tiles) and External (5 rows) sections — byte-identical render.
- No multi-select filters, no sort controls, no fuzzy/typo-tolerant search (plain normalized substring AND-match).
- No backend, no localStorage — the hash is the only state store.
- No provenance *filter* — provenance is demoted to a glyph, not promoted to a control.
- No changes to detail pages, in-app demo routes, or the generator's originals/externals blocks.

## 2. Premises and assumptions (verified against workspace)

1. `app/src/data/artifacts.json` has 33 `open` entries; each has `name/title/tagline/category/anthropicCounterpart/status` (verified by reading the file in full, all 33 taglines included).
2. `app/tools/gen-catalog.mjs` derives `open` from `open-artifacts/*/meta.json`, fails loud (`process.exit(1)`) on unknown name/category — the derivation map should keep that discipline.
3. `app/src/router.ts` `currentPath()` does **not** split `?` — `#/?area=x` would 404 today; the router needs a 2-line change. `render()` calls `window.scrollTo(0, 0)` on every hashchange and `main.ts` re-renders the whole page on every hashchange — typing in the search box would scroll-jump unless handled (Step 5.4).
4. `app/src/styles.css` has no global `:focus-visible` rule (critique round-6 P1-3 corroborates); adding one is in scope here because the toolbar introduces keyboard-operable controls.
5. Sticky header uses `z-index: 10` with translucent fill; DESIGN.md's Z-Scale Rule allows a *new named* layer for the toolbar.
6. **Assumption (flag if wrong):** area slugs and question ids below are final after owner review — the mapping table is the only place a human might want to override (see §9).

## 3. Design decisions with rationale

**D1 — One taxonomy in the data, two derived fields.** `gen-catalog.mjs` gains a single derivation map (name → `practiceArea`, name → `readerQuestion`); `artifacts.json` gains both fields plus a `taxonomies` block (id, label, caption). Rationale: the map lives in one reviewable place; meta.json authors can't invent stray areas; the app never hardcodes labels. Both axes are per-artifact and independent (they genuinely cross: `renewal-calendar` is *Contracts* by data but *"I have a contract"* by question; `limitations-radar` is *Litigation* by data but deadline-flavored by question). Forcing one axis to nest in the other is what produces dumping grounds.

**D2 — Practice areas = filter axis; 8 areas; single-select + All.** Single-select because the areas *partition* the 33 (each artifact exactly one); multi-select over a partition yields near-empty intersections and a noisier hash. Default = All.

**D3 — Reader questions = at-rest grouping only; 4 groups.** The coexistence rule (the decision requirement (c) asks for): **grouping is a display mode, never a control.** At rest (no filter, no query) the grid renders under 4 question headings — that's reading order, zero decisions asked, and it stays ≤4 so no new option wall is created. The instant a filter or search is active, headings collapse to one flat grid + count line — the two axes are never rendered as competing choices at the same time. The filter row is the only decision surface, and grouping vanishes when it's in use. (4 groups, not 5: contract 5 / case-or-deadline 11 / documents 8 / run-a-practice 9 — the third group absorbs the research grid because its cells are cited quotes, like cite-check.)

**D4 — Hash route contract: `#/?area=<slug>&q=<term>` on path `/`.** Justification against the alternatives:
- Path-first (`#/?…` vs `#/filter/contracts`): keeps every existing route (`#/a/{name}`, `#/cite-check`…) untouched; query params are the standard encoding for optional, order-independent UI state; `URLSearchParams` does parse/serialize for free.
- State flows one way: hash → parse → render. Controls never mutate DOM state directly; they rewrite the hash and let `hashchange` re-render (single source of truth, deep links and back/forward stay coherent).
- All control changes use `history.replaceState` (no keystroke-per-history-entry spam; the URL is *state*, not history). Trade-off: back button doesn't step through filter changes — accepted, noted.
- `q` is `encodeURIComponent`-ed, trimmed, case-insensitive; `area` accepts exactly one valid slug; unknown/duplicate values fail soft → treated as All; hash is then re-normalized on next write.

**D5 — Provenance demoted to glyph + word.** The chip (bordered box) disappears; the tile-meta row reads `◇ anthropic-built` / `◇ partner-built` / `◆ original idea` in plain 11px mono counter-grey, with `title` and full text retained (never glyph-only — PRODUCT.md a11y bar). `◆` is already the established original-idea token (DESIGN.md Chips). Original-idea tiles keep the 4px accent top stripe; counterpart tiles keep the transparent stripe (height parity preserved).

**D6 — Sticky toolbar.** Sticky below the site header: `top: var(--header-h)`, solid `#fafaf8` fill + hairline bottom border (the translucent+blur surface is reserved for the header alone per DESIGN.md — controls must not show scroll-through text). `--header-h` maintained by a one-line ResizeObserver on `.site-header` (header height changes when nav wraps at ~768px); CSS fallback `3.4rem` desktop / measured on mobile. New named z-layer `--z-sticky-tools: 9` (under header's 10, documented per the Z-Scale Rule).

**D7 — Search matching.** Query split on whitespace; all terms must match (AND); each term matched case-insensitively against the concatenation of `title + tagline + name + anthropicCounterpart` (requirement g). Input debounced 150ms. Personas covered: GC types "tabular" → 1 tile; typing "harvey" surfaces `intake-benchmark` via its counterpart string — proof counterpart matching works for readers who only know gallery names.

**D8 — Filter/search scope.** Toolbar applies to the Open section only; Originals and External render exactly as today (requirement i). Tile order within any view stays catalog order (alphabetical by name); grouped view sorts by fixed question order then name.

**D9 — Active filter visual state.** Active button: black text + 2px accent bottom underline (the nav-hover vocabulary — accent-as-underline is an allowed structural spend) + `aria-pressed="true"`. Never accent fill. Focus ring `2px solid var(--text)` via a new global `:focus-visible` rule (also closes the round-6 P1-3 gap for the whole app).

## 4. Taxonomy + full mapping table (33/33, no "Other")

**Practice areas (filter row: `All` + 8):**

| # | Area (slug) | Filter label | Count | Artifacts |
|---|---|---|---|---|
| 1 | Contracts & transactions (`contracts`) | Contracts | 4 | obligations-checker, playbook-deviation-board, sell-side-qa-log, venture-term-sheet-benchmark |
| 2 | Deadlines & compliance dates (`deadlines`) | Deadlines | 3 | entity-compliance-calendar, limitations-radar, renewal-calendar |
| 3 | Litigation & discovery (`litigation`) | Litigation | 5 | discovery-response-log, docket-watch-wall, litigation-portfolio, matter-board, subpoena-response |
| 4 | Document review & evidence (`documents`) | Documents | 5 | cite-check, fact-chronology, patent-claim-comparison, privilege-log-builder, tabular-review |
| 5 | Access to justice (`a2j`) | Access to justice | 7 | criminal-charge-reality-check, eviction-notice-check-board, immigration-papers-reader, pro-bono-case-board, record-clearance, record-sealing-screener, rent-ledger-reviewer |
| 6 | Intake & triage (`intake`) | Intake | 3 | access-to-justice-front-door, intake-benchmark, intake-queue |
| 7 | Governance & operations (`governance`) | Governance | 4 | ai-governance-benchmark, ai-use-case-inventory, outside-counsel-spend, regulatory-horizon-scan |
| 8 | Research & guidance (`research`) | Research | 2 | ask-legal, jurisdiction-survey-matrix |

Assignment rule (state it in gen-catalog comments): **assign by the data the tool is organized around, not its engine** — renewal-calendar's data is contract notice *dates* → Deadlines; discovery-response-log's data is responses/objections → Litigation. Sum = 4+3+5+5+7+3+4+2 = **33** ✓. Smallest area (Research, 2) is thin but precise — both artifacts answer legal questions from cited sources; it is not a residue bucket.

**Reader questions (at-rest groups, fixed order):**

| Group (id) | Count | Artifacts |
|---|---|---|
| I have a contract (`contract`) | 5 | obligations-checker, playbook-deviation-board, renewal-calendar, sell-side-qa-log, venture-term-sheet-benchmark |
| I have a case or a deadline (`case-deadline`) | 11 | entity-compliance-calendar, limitations-radar, discovery-response-log, subpoena-response, docket-watch-wall, litigation-portfolio, matter-board, record-clearance, eviction-notice-check-board, criminal-charge-reality-check, record-sealing-screener |
| I have a pile of documents (`documents`) | 8 | cite-check, tabular-review, fact-chronology, privilege-log-builder, patent-claim-comparison, rent-ledger-reviewer, immigration-papers-reader, jurisdiction-survey-matrix |
| I run a practice or program (`practice`) | 9 | access-to-justice-front-door, intake-queue, intake-benchmark, pro-bono-case-board, ask-legal, ai-governance-benchmark, ai-use-case-inventory, regulatory-horizon-scan, outside-counsel-spend |

Sum = 5+11+8+9 = **33** ✓. Jordan lands in group 1 with zero interaction; the group-4 reader is the one who filters anyway.

## 5. Data-flow and code changes (dependency-ordered steps)

### Step 1 — gen-catalog.mjs: taxonomy maps (depends: nothing)
- Add `PRACTICE_AREA_BY_NAME` and `READER_QUESTION_BY_NAME` maps (exact tables above), plus `PRACTICE_AREAS`/`READER_QUESTIONS` definitions (id, label, filter label, caption).
- On scan: look up both maps per artifact; **exit(1) if a name is missing** (forces map upkeep when a new open-artifacts dir appears — same fail-loud style as the category check).
- Emit per-open-artifact `practiceArea` and `readerQuestion` (ids), plus a top-level `taxonomies: { practiceAreas, readerQuestions }`.
- Deliverable: regenerated `artifacts.json`; counts unchanged (4/33/5/2) + 33 mapped.
- Acceptance: `node tools/gen-catalog.mjs` prints counts; temp dummy meta.json → exit 1; sum of area counts = 33.
- Estimate: opt 30m / real 45m / pess 1.5h (if owner re-cuts the taxonomy — see §9).

### Step 2 — catalog.ts: types + exports (depends: 1)
- Extend `OpenEntry` with `practiceArea: string; readerQuestion: string`; extend `Catalog` with `taxonomies`. Re-export typed area/question defs.
- Acceptance: `npm run build` (or `tsc`) passes with no `any` leaks.

### Step 3 — router.ts: query-string split + scroll preservation (depends: none; parallel with 1–2)
- `currentPath()` → split hash on first `?`; return path only (routes unchanged); new `currentQuery(): URLSearchParams` export.
- `render()`: skip `window.scrollTo(0,0)` when the previous and new *path* are both `/` and only the query changed (prevents scroll-jump on search typing).
- Acceptance: `#/?area=contracts` renders index (not 404); `#/a/client-intake`-style routes untouched; typing doesn't move scroll.

### Step 4 — styles.css: toolbar, glyphs, states (depends: 2 conceptually; parallelizable)
- `.index-tools`: sticky (`top: var(--header-h, 3.4rem)`), solid `--bg`, hairline bottom, `z-index: var(--z-sticky-tools, 9)`; flex-wrap; search input = Panel White field, `--font-data` 13px, `--text` border ≥3:1 (Contrast Split Rule).
- `.filter-btn`: 11px mono uppercase toggle; active = `--text` color + 2px accent underline; `:focus-visible` ring.
- `.prov` meta (glyph + word), `.result-count` (11px mono counter-grey), `.empty-state` (sentence + secondary button).
- Global `:focus-visible { outline: 2px solid var(--text); outline-offset: 2px }` — never accent.
- Constraints honored: no font-size < 11px, radius 0, accent structural-only, no shadows.
- Acceptance: grep no `border-radius` ≠ 0, no `font-size` < 11px in the diff; header remains only translucent surface.

### Step 5 — index.ts: state, toolbar, grouped/flat render (depends: 1–4; critical path)
1. `parseState(query) → {area, q}` (validate area slug, trim q, fail-soft) and `serializeState({area,q}) → "#/" | "#/?area=…" | … "`.
2. Shared `tile(a)` builder (current tile minus chip; glyph meta instead; orphan-span grid CSS unaffected — each group renders its own `.cards` grid).
3. `toolbar(state, areas, onChange)` — `<section aria-label="Filter and search artifacts">`: search input (`type="search"`, visually-hidden label, debounce 150ms), `All` + 8 filter buttons (`aria-pressed`), all writes via `history.replaceState(serializeState(...))`.
4. Render logic: if `area || q` → flat grid + count line `N of 33 · <Area label> · matches "q"` (only the active parts); else → 4 question groups (h3 head + count + grid). Count line `aria-live="polite"`. Empty → sentence ("No matches for 'zzz' in Contracts.") + Clear button → `location.hash = "#/"`.
5. Originals/External blocks untouched.
- Acceptance: §7 checklist items 2–8, 13–15.
- Estimate: opt 1.5h / real 2.5–3h / pess 5h (mobile sticky + scroll edge cases).

### Step 6 — main.ts sanity pass (depends: 3, 5)
- Confirm hashchange → render round-trip, replaceState does *not* fire hashchange (so controls call the update path explicitly — implement one `applyState()` used by both control handlers and initial render).
- Acceptance: reload on `#/?area=litigation&q=subpoena` restores identical view.

### Step 7 — Verification pass (depends: all)
- Build + persona runs (Jordan: scroll-at-rest → contract group; Alex: paste deep link; GC: `#/?q=tabular`), keyboard-only pass, 1100/768/390px visual pass, DOM-diff Originals/External vs pre-change snapshot.
- Estimate: opt 45m / real 1h / pess 2h.

**Suggested parallelization:** 1→2 serial; 3 and 4 parallel to 1–2; 5 after all; 6–7 after 5.

## 6. Hash-route contract (normative)

```
#/                          default: grouped by reader question
#/?area=<slug>              one practice area, flat grid      (slug ∈ the 8 ids)
#/?q=<term>                 search, flat grid                 (term URI-encoded, trimmed)
#/?area=<slug>&q=<term>     AND of both
```
- Params order-independent; parser ignores unknown params and unknown/empty values (fail-soft to All); duplicate `area` → last wins; never any other params (provenance/status deliberately excluded).
- Writers use `history.replaceState(null, "", "#"…")`; the canonical URL for sharing is exactly what the address bar shows after any control interaction.

## 7. Acceptance criteria (testable)

1. Every one of the 33 open artifacts carries exactly one `practiceArea` and one `readerQuestion`; sums: areas = 33, questions = 33; generator exits 1 on an unmapped new artifact.
2. Filter row renders `All` + 8 buttons; clicking Deadlines → URL `#/?area=deadlines`, grid shows exactly 3 tiles; reload restores; All returns to grouped view.
3. Search `tabular` → 1 tile; `harvey` → intake-benchmark (counterpart match); `playbook` → playbook-deviation-board (title/tagline) and NOT the Originals contracts-playbook (scope).
4. `#/?area=contracts&q=renewal` → 1 tile (renewal-calendar).
5. `q=zzz` → empty-state sentence + working Clear → `#/`.
6. Count line visible in every filtered/searched state, `aria-live="polite"` announces changes; at rest each group shows its count (5/11/8/9).
7. At rest the Open section shows 4 h3 question groups in the fixed order, tiles in catalog order within groups.
8. Sticky: scrolled to tile 25, the toolbar remains pinned directly under the header, fully opaque, at 1100px and 390px.
9. No `.chip` element remains in the Open section; provenance renders as glyph + word with accessible name (axe: no new violations vs baseline); `◆`/stripe retained on the 2 original-ideas.
10. Keyboard: Tab order search → All → areas; every control shows a 2px `--text` `:focus-visible` ring; Enter/Space activates buttons; no keyboard trap.
11. New CSS contains no font-size < 11px, no border-radius ≠ 0, no accent as text/fill/focus; active filter state is underline-only.
12. Originals and External sections render identically to pre-change (DOM snapshot diff empty).
13. `#/?area=bogus` and `#/` both render the default grouped view without errors.
14. Typing in search never scrolls the page; navigating `#/a/x` → back → catalog restores grouped view at top (intentional reset on path change).
15. `npm run build` clean; console free of errors on all tested states.

## 8. Risks (probability × impact → mitigation)

| Risk | P×I | Mitigation |
|---|---|---|
| Owner disagrees with specific area/question assignments | Med × Med | Mapping is one table in one file (Step 1); changing a cell is a 1-line edit + regenerate — isolated from app code. |
| Sticky/header overlap when nav wraps (mobile) breaks toolbar | Med × High | ResizeObserver-maintained `--header-h`; explicit 390px test in Step 7; CSS fallback prevents total failure. |
| replaceState/hashchange re-render loop or missed update | Med × Med | Single `applyState()` entry point (Step 6); replaceState never fires hashchange by design. |
| Group 4 ("I run a practice", 9 tiles) hides A2J/governance tools from scrollers | Low × Med | Sticky toolbar makes any area one click away from anywhere; group counts visible at each heading; captions name the areas. |
| Full-page re-render per keystroke loses input focus | Med × High | Re-render replaces the page including the input — restore focus + caret to the search field in `applyState()` when `q` triggered the render; covered by AC 10/keyboard pass. |
| New artifact added later without mapping silently breaks build | Low × Low | Generator exits 1 (AC 1) — fail loud, by design. |

## 9. Milestones and questions for the owner

**Critical path:** Step 1 → 2 → 5 → 6 → 7. **Milestones (each verifiable):** M1 data — regenerated artifacts.json, 33/33 mapped, generator fail-loud (AC 1); M2 routing — `#/?area&q` round-trips incl. reload (AC 2, 13); M3 UI — grouped default + filter + search + empty state (AC 3–7); M4 a11y/visual — keyboard, sticky, tokens, section parity (AC 8–12); M5 sign-off — full checklist green. Deviation signal: if M2 reveals the router change is more invasive than 2 lines, or M3's focus-restore proves flaky, stop and re-plan the state architecture (consider fine-grained DOM patching instead of full re-render) rather than patching locally.

**Needs a human decision (defaults chosen, proceed unless overridden):**
1. **Taxonomy tables (§4)** — default: exactly as mapped above; single place to override any cell.
2. **Filter interaction** — default single-select + All; alternative: multi-select (larger hash, emptier intersections).
3. **History semantics** — default replaceState (no back-stepping through filters); alternative: push on filter clicks, replace on keystrokes.
4. **"Access to justice" button label** — default full words (wraps on mobile); alternative "A2J" with full aria-label.

Total estimate: optimistic 0.5 day / realistic 1 day / pessimistic 2 days (triggered by mobile-sticky + focus-restore edge cases).