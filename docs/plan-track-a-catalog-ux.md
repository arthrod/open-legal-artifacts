# 规划师 — run 7297b763 participant 0

All sources read — evidence, router, index page, index-filter, main, val handler, build-site decorator, smoke suite, both headers. The three P1s are confirmed in source: `notFound()` in router.ts:70 is a bare `<h1>`, the val's final fallback (index.http.tsx:105) returns text with no content-type, `applyState({ area: state.area, q: input.value })` in index.ts:96 is the false-negative mechanism, and decorate() injects a single self-link bar. Plan follows.

---

# TRACK A plan — 404 page, search/filter interaction, off-catalog nav

## 1. Goal & non-goals

**Goal:** close the three P1 journeys — typo'd URL, search-with-inherited-filter, and one-click-off-the-catalog — on both surfaces (SPA + served val pages), in catalog voice, test-first.

**Non-goals (this track):**
- Font serving / favicon (dogfood #3, #11 — P2, tracked elsewhere; the new 404 deliberately uses system mono to avoid adding font requests).
- Humanizing rule ids (critique P1 #4), verdict-language unification, repetition tax, hero fold, deep-link confirmation scroll (dogfood #4), back-bar-only alignment as a standalone fix (folded into item 3), GH Pages mirror base-path correctness (existing limitation, not worsened).
- `currentQuery()` path-query drop (dogfood #4) — noted, out of scope.

## 2. Assumptions & inputs

- **Assumption A1:** Val Town supports relative imports between files inside `vt-val/` (standard for file-based vals). If false, fallback in 拍板 Q5.
- **Assumption A2:** `deploy/build-site.mjs` changes are sanctioned for item 3 (task text explicitly names `decorate()`), despite the nominal app/src + index.http.tsx ownership.
- **Assumption A3:** smoke.ts's plain-node TS import style (already used for index-filter.ts) extends to new pure modules with no DOM imports.
- **Verified facts:** the mechanism claims above are source-verified this run (file:line given). The deployed-val 404 behavior is from the dogfood report (evidence, trusted; trail `tmp/shots/dogfood/10-404.png`).

## 3. Per-item design

### Item 1 — Real 404, both surfaces

**Shared pure module (new): `app/src/lib/notfound.ts`** — DOM-free, smoke-testable:
- `attemptedSlug(path: string): string` — extract the likely artifact slug from a failed route: strip `/a/` prefix, `/open-artifacts/<x>/demo/(index.html)?` shape, leading `#`, trailing `.html`/slashes; `decodeURIComponent`; take last remaining non-empty segment; clamp to 60 chars; strip characters outside `[a-z0-9-]` (empty string allowed).
- `suggestArtifacts(slug: string, names: string[]): string[]` — deterministic ranking: exact substring either way → token overlap on `-`-split → longest common prefix; return top 3, most-relevant first; empty slug → first 3 of a passed-in default order.

**SPA hash 404 — change `notFound()` in `app/src/router.ts`:**
- Structure (catalog voice): eyebrow rule + `Arthur Souza Rodrigues · open source`, `<h1>Not found</h1>`, yellow rule, lede "No page at <code>…</code>.", **search box pre-filled with `attemptedSlug(path)`** (placeholder "Search artifacts…", Enter → `location.hash = serializeState({area:null, q})` — reuses index-filter, keeps hash canonical), **suggestions**: 3 links from `suggestArtifacts(slug, names)` → `#/a/<name>`, plus a plain "← Back to the catalog" backlink, **mono detail line** at bottom: `404 · <escaped attempted hash> · catalog v<33> artifacts` in mono 11px secondary.
- Escape the attempted path with the existing `esc` pattern; suggestions fall back to a static trio (cite-check, tabular-review, fact-chronology) when slug is empty.
- Names list comes from `../data/catalog.js` (open + originals) — router.ts gains one import; no page-module changes.

**Val HTTP 404 — `vt-val/index.http.tsx`:**
- New pure builder `notFoundHtml(p: string): string` (location per 拍板 Q5; default: new `vt-val/notfound.ts` so smoke can import it). Serves a small self-contained HTML page (~3 KB, inline styles, tokens: `#fafaf8/#0a0a0a/#6b6b6b/#e8e8e5/#ffd400`, Manrope/system-ui + mono labels, radius 0):
  - wordmark `open·legal·artifacts` → `/`; `<h1>Not found</h1>` + yellow rule; lede.
  - **Search affordance without JS:** `<a href="/#/?q=<encoded slug>">Search the catalog for “&lt;slug&gt;”</a>` (hash survives navigation; SPA parses `q`).
  - Static common-artifact suggestions (cite-check, tabular-review, deviation-board, fact-chronology) with one-line taglines — static by design: the val has the `ARTIFACTS` name list but not the catalog copy, and the search link is the real recovery path (asymmetry deliberate, stated).
  - **Mono detail line:** `GET <escaped path> · 404 · text/html`.
  - All interpolation through an HTML-escape helper (pure, in the same module).
- Wire-up: the `page()` catch, the `/course/` catch, and the final fallback all return `new Response(notFoundHtml(p), { status: 404, headers: { "content-type": "text/html; charset=utf-8" } })` — one helper `html404(p)` in the val. Side effect (positive): the `/fonts/*.woff2` 404s stop being bare text; no behavior change for browsers.

### Item 2 — Search/category interaction (decision made)

**Chosen: auto-clear the area filter on first keystroke**, with the deep-link escape kept in the empty state.

**Rationale (vs the other two options):** the failure mode is a *false negative on a known artifact* — only removing the silent AND-condition eliminates it at the source. "Visually bind the chip into the state line" leaves the false negative intact (it explains the miss instead of fixing it — the user already concluded the artifact doesn't exist). "Interstitial hint" adds a modal-ish interruption for a 33-item catalog and still doesn't fix `0 of 33`. Auto-clear is also *superset-safe*: scoping fans who type "renewal" after DEADLINES still see renewal-calendar plus any other matches, the chip visibly resets to All (state is legible, not silent), and re-scoping is one click away. Hash stays coherent: typing writes `#/?q=…` with no `area`.

**Precise semantics (new pure function in `app/src/lib/index-filter.ts`):**
- `nextStateOnSearch(prev: IndexState, q: string): IndexState` — if `q.trim()` is non-empty → `{ area: null, q: q.trim() }`; if empty (user deleted all text) → `{ area: prev.area, q: "" }` (deleting the query returns to the deliberately-clicked filter view, doesn't also nuke it).
- Explicit rule: filter clicks keep `q` (explicit action wins); only *typing* clears `area`.
- **Empty-state escape for deep links** (`#/?area=deadlines&q=zzz` still parseable): when `results.length === 0` and `filterOpen(open, {area:null, q:state.q}).length > 0`, the empty state gains a second action: "N matches in all categories → show them" → `location.hash = serializeState({area:null, q:state.q})`. Pure logic reuses `filterOpen`; no new helper needed beyond the count.

**Wiring — `app/src/pages/index.ts`:** the debounced input handler becomes `applyState(nextStateOnSearch(state, input.value), {kind:"search"})`; empty-state block gains the conditional second button. Nothing else changes — `serializeState`, chips, `aria-pressed`, focus-restore all keep working because state remains hash-single-source.

### Item 3 — Nav survives off-catalog

**Served demo pages — `deploy/build-site.mjs` `decorate()`:**
- Signature: `decorate(html)` → `decorate(html, info: { entry: string; repoUrl: string })`; the build loop already knows `entry` and which root (`open-artifacts/` vs `artifacts/`) it came from — derive `repoUrl` as `<GITHUB>/tree/main/<root>/<entry>`.
- Bar becomes a compact 3-item bar replacing the single back-link (guard string: check for both `ola-backlink` and the new `ola-navbar` marker to avoid double-injection):
  - Left: wordmark `open·legal·artifacts` (mono, 12px, letterspaced) → `/`.
  - Right, mono 11px uppercase, three items: **Catalog** → `/`; **Demo** → current-page marker (`<span aria-current="page">`, solid-underline/hairline-boxed, not a self-link — it orients, per the "Catalog / Demo / Repo" reading); **Repo ↗** → `repoUrl`, `rel="noopener" target="_blank"`.
  - Style stays inline (single-file pages, no shared CSS), but: mono stack `ui-monospace, "JetBrains Mono", monospace`; inner wrapper gets `max-width:1100px;margin:0 auto;padding:8px 20px` so the bar's links align with the 107px content grid and the footer (closes dogfood #5, one line while we're here); keeps `position:sticky;top:0;z-index:99;background:#0a0a0a` black-bar identity.
- **SPA — `app/src/pages/header.ts`:** `demoHeader()`'s single `← All artifacts` backlink row becomes the same 3-item pattern in SPA form: `← Catalog` (`#/`) · `Demo` (current, `aria-current="page"`) · `Repo ↗` (existing GitHub URL already in scope as `opts.repoName`). H1/lede/meta-grid unchanged.
- **SPA shell — `app/index.html`: no change** (the `.site-header` nav already renders on every hash route; that's the "SPA keeps its own nav" clause — stated explicitly so the executor doesn't touch it).

## 4. TDD acceptance — what gets tests first

All new pure-function checks go into `app/.smoke/smoke.ts` (existing pattern: plain node, `check()` assertions), **written and failing before wiring**:

**index-filter (`nextStateOnSearch`):**
1. typing with area active → `{area:null, q:"tabular"}` (area cleared).
2. deleting all text with area active → `{area:prev.area, q:""}` (filter survives).
3. round-trip: `serializeState(nextStateOnSearch({area:"deadlines"}, "tabular")) === "#/?q=tabular"` (hash coherence).
4. deep-link recovery: `filterOpen(open, {area:null, q:"tabular"}).length === 1` while `filterOpen(open, parseState("area=deadlines&q=tabular")).length === 0` (the exact dogfood scenario, now computable for the escape button).

**notfound (`attemptedSlug`, `suggestArtifacts`):**
5. `/a/cite-chek` → `cite-chek`; `/open-artifacts/tabular-revie/demo/index.html` → `tabular-revie`; `/nope` → `nope`; `#/?q=x` path-only → ``; url-encoded `%20` decoded and stripped-safe.
6. `suggestArtifacts("cite-chek", names)` ranks `cite-check` first; empty slug → default trio, deterministic order.
7. `notFoundHtml('/a/<script>')` (val module, per Q5 default): output contains `&lt;script&gt;`, `text/html`, `404`, and **no** raw `<script>` from user input (escape proof); contains `/#/?q=` search link with the encoded slug.

**Smoke suite should additionally assert (regression, existing checks stay green):** all 10 current index-filter checks, the parse fail-soft check, and `ALL PASS` exit 0.

**Non-smoke acceptance (observable, exact commands):**
- SPA (localhost): navigate `#/a/cite-chek` → search box prefilled `cite-chek`, 3 suggestions, mono detail line; Enter → `#/?q=cite-chek` with 1 result.
- Val local/build: `node deploy/build-site.mjs` then assert, e.g. `grep -c 'ola-navbar' vt-val/site/cite-check.html` ≥ 1, `aria-current="page"` present, repo URL matches `open-artifacts/cite-check`; landing page size still logged under 80 KB.
- Deployed: `curl -si <val>/a/cite-chek` → `HTTP/1.1 404`, `content-type: text/html`, body contains wordmark + `Search the catalog`; `curl -si <val>/zzz` same.
- Interaction: click DEADLINES chip → type `tabular` → count line reads `1 OF 33 · MATCHES "TABULAR"` (no area segment), All chip `aria-pressed="true"`, hash `#/?q=tabular`; visit `#/?area=deadlines&q=zzz` → empty state shows "N matches in all categories" button (N = `filterOpen` all-areas count for `zzz` = 0 → button absent; use `q=tabular` variant to see it appear).

## 5. Risks

| Risk | P×I | Mitigation |
|---|---|---|
| VT relative import of `vt-val/notfound.ts` fails (A1) | M×M | Fallback: inline `notFoundHtml` in index.http.tsx; lose smoke coverage of val HTML — replace with curl+grep assertions in verification. (拍板 Q5) |
| Auto-clear surprises scoped-search users | M×L | Chip visibly resets + result line drops the area segment (state legible); re-scope is one click; superset results never hide an artifact. |
| decorate() double-bar on pages already carrying `ola-backlink` | L×M | Guard checks both markers; build log prints decorated count. |
| 404 page triggers on binary requests (`/fonts/*.woff2`) returning HTML | confirmed, harmless | Browser ignores HTML body for font fetch; console message unchanged in kind. Note only. |
| Suggestion ranking surfaces silly matches for junk paths | M×L | Ranking falls back to default trio on empty/no-overlap slug (spec'd in check 6). |
| Bar `max-width` wrapper breaks on narrow viewports | L×L | `padding:8px 20px` stays outside the wrapper; same pattern as existing footer. |

## 6. Order, estimates, key path

Steps (≈ parallelizable across items; smoke.ts edits serialize):
1. Write failing smoke checks (items 1+2 pure fns). 0.5h/1h/2h
2. Implement `nextStateOnSearch` + wire index.ts (item 2). 0.5h/1h/2.5h — *pessimistic if focus-restore regression appears on chip-reset re-render*
3. Implement `app/src/lib/notfound.ts` + router 404 (item 1a). 1h/2h/4h
4. Implement `vt-val/notfound.ts` (or inline) + wire `html404` (item 1b). 1h/2h/3.5h
5. `decorate()` navbar + header.ts row (item 3). 1h/1.5h/3h
6. Build, deploy, run verification set below. 0.5h/1h/2h

**Key path:** 1 → 2 → 6 (search interaction is the trust-critical fix and lands earliest); 3, 4, 5 parallel after 1. **Mileaways:** M1 smoke `ALL PASS` (pure logic proven) → M2 localhost behaviors per §4 → M3 build output greps + curl 404 content-type/status → M4 deployed screenshots. **Deviation signal:** if M2 shows the chip-reset re-render loses input focus or caret (the property dogfood verified holds today), stop and re-plan the applyState focus path rather than patching around it.

## 7. Verification screenshots (1280×900, trail `tmp/shots/trackA/`)

1. `01-spa-404-typo.png` — `#/a/cite-chek`: prefilled search, suggestions, mono line.
2. `02-spa-404-unknown.png` — `#/nope`: default trio, no slug artifacts.
3. `03-spa-404-search-enter.png` — after Enter on 01: `#/?q=cite-chek`, 1 result.
4. `04-val-404-typo.png` + `curl -i` capture — `/a/cite-chek` served HTML 404.
5. `05-val-404-random.png` — `/zzz`.
6. `06-search-autoclear.png` — DEADLINES clicked, then `tabular` typed: `1 OF 33 · MATCHES "TABULAR"`, All chip pressed, hash visible.
7. `07-deeplink-escape.png` — `#/?area=deadlines&q=tabular` → empty state with "1 match in all categories" button.
8. `08-demo-navbar.png` — `/a/cite-check` top bar: wordmark + Catalog/Demo/Repo, grid-aligned at 107px.
9. `09-spa-demo-header.png` — `#/cite-check` breadcrumb row.
10. Console capture alongside 04/08: no new error kinds beyond the known font/favicon 404s.

## 8. Questions needing a human call (defaults chosen)

1. **Item 2 mechanism** — default: auto-clear on keystroke (rationale above). Alternatives rejected; say so if you want the bind-into-state-line instead.
2. **"Demo" item semantics in the bar** — default: non-link current-page marker. Alternative: link to the SPA details page `/#/a/<entry>`.
3. **Val 404 suggestions** — default: static 4 + search-link. Alternative: import the catalog name list into the val for dynamic suggestions (more sync surface).
4. **Fold bar grid-alignment into item 3** — default: yes (one line). Strict-scope alternative: visual parity only.
5. **`vt-val/notfound.ts` extraction** — default: separate file for TDD, fallback inline if A1 fails on deploy.