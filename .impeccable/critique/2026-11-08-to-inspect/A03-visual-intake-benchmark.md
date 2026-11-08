# A03 — Visual critique: intake-benchmark (OURS) vs Harvey Intake (THEIRS)

**Pair:** OURS `/open-artifacts/intake-benchmark/demo/index.html` · THEIRS `/_to_verify/Harvey%20Intake%20%28Copy%29.html` (server `http://127.0.0.1:8923/`, verified 200/200)
**Date:** 2026-11-08 · **Stance:** adversarial against OURS, charitable to THEIRS
**Shots:** `tmp/shots/to-inspect/intake-benchmark/` (workspace root) — manifest + provenance caveats in §Evidence.

---

## Verdict (one paragraph)

THEIRS wins this pair decisively on product craft, and it isn't close: a complete two-theme design system (light + verified-dark tokens), safe-area insets, reduced-motion support, skeleton and fresh-row states, status pills with soft tints, grouped/collapsible request table with tabular-nums and ellipsis discipline, a working request→detail→reply round trip, and microcopy that carries a real product voice ("Saved as an example. REQ-7700 stays in this browser."). OURS is an honest analyst instrument — deterministic rubric scoring, rank-stability perturbation, risk-classified field canons — with genuinely more computational substance than THEIRS attempts, but its demo chrome is developer-grade: a 460px raw-JSON textarea as the front door, 11–12px mono everything, one button and one buried select as the entire interaction surface, and a vacuous "Missing canon fields: none" section on first load. If a partner saw these side by side, THEIRS looks like a product and OURS looks like a REPL with a title bar.

**Genre caveat (fact, not excuse):** the two artifacts solve different problems — THEIRS is an intake *requester experience*; OURS benchmarks *intake flows against each other*. The pairing is by name only. Craft is compared directly below anyway, as instructed.

## Scorecard (evidence-based; V = verified at DOM/render level, S = source-inspection only)

| Dimension | OURS | THEIRS | Winner |
|---|---|---|---|
| First impression / landing | mono-dense, h1 20px, one yellow rule (V) | serif 36px title, black top bar, 4 realistic requests (V) | **THEIRS** |
| Typography system | Departure Mono 11–14px + Manrope; floor-legal but unrelentingly gray (V: th 11px, csv 11px, rank 12px) | 14px system sans + Iowan/Palatino display; 12px labels stay legible (S) | **THEIRS** |
| Color / status semantics | ink + one yellow rule; ok/bad text colors used twice (V) | wait/done/warn pill pairs, soft tints, 4.51–4.88:1 contrast (computed) | **THEIRS** |
| Layout & hierarchy | 2-col grid works; right column = stack of mono section labels (V) | shell/list/detail/dialog composition, 280px facts aside (V) | **THEIRS** |
| Interaction depth | 1 button, 1 select (V) | dialog + validation gate + submit + collapse groups + detail + reply (V) | **THEIRS** |
| State coverage | default / error / canon / mobile (V); no loading (n/a), no dark | default / dialog / typed+enabled / submitted / detail / mobile / dark / skeleton / reduced-motion (V+S) | **THEIRS** |
| Analytical substance | 9-row rubric, rank stability 12/12, canon risk classes, CSV (V) | none attempted — it's an experience, not an analysis | **OURS** |
| Determinism / trust core | LLM-free, errors handled, no console errors (V) | deterministic local logic + MCP plumbing (S) | **tie** |
| Accessibility | focus 2px solid (V), aria-live on output (S) | focus-visible, sr-only, role=alert, reduced-motion (S); fg3 hint 3.39:1 is sub-AA | **THEIRS** (narrow) |

## OURS — findings (brutal, per stance)

- **[P1] Raw JSON is the front door.** The primary input is a 460px-tight `textarea#input` of JSON (V). For an artifact badged "partner-built counterpart," the entry surface says "engineers only." No form affordance, no schema hints, no field picker. THE closing argument of this demo is a wall of curly braces.
- **[P1] Vacuous first-load section.** Default (custom) scenario renders "Missing canon fields" with "none / none" (V) and `deadline_capture`/`conflict_check` rows as "—" (V) — the page's most prominent analytical sections look broken until the user discovers the canon `<select>` — which is tucked inside a 12px label next to "Runs JSON (editable)" (V: label text `canon: custom (as written)…`). The biggest state change on the page is triggered by a control styled as a footnote.
- **[P1] Visual floor is legal, not good.** th 11px, CSV 11px, rank/sec lines 12px Departure Mono (V). The system's own 11px floor is met exactly — no margin — and in side-by-side with THEIRS' 14px body it reads as stingy. Page total: 1192px tall, one viewport and a bit; the whole artifact visually fits in a footnote of THEIRS' presence.
- **[P2] CSV "export" is a readonly textarea.** No download, no copy button — the crudest export affordance short of none (V: `<textarea class="csv" readonly>`).
- **[P2] Error path is accurate but dev-facing.** Bad JSON yields the raw `JSON.parse` message ("Unexpected token 'o', \"not json\" is not valid JSON" — V). No line number, no schema diff, no recovery affordance; `validate()` exists in core but the demo doesn't pre-check with it.
- **[P2] Table has no hover/zebra/affordance; nulls render as bare "—".** `retention 82 vs —` (V) is unexplained — no tooltip for "abandonment not measured for the human flow."
- **[P3] Whole-page color budget = one 56×2px yellow rule.** Consistent with the site system, yes — but as a *demo* this is the least visual object in the catalog.
- **Credits where undeniable (V):** scoring table computes live and correctly (completeness 100/100, speed 100/1.01 — the human mail-out step at 86400s tanking it is legible); rank-stability badge "robust, 12/12 perturbed weightings" is a genuinely novel trust feature; canon swap is deep (housing canon: 8 missing fields + 3 missing *critical* deadline/conflict fields enumerated per flow — V); error path doesn't crash; focus outline present (V); zero console errors besides a shared favicon 404 (V).

## THEIRS — findings (charitable read, weaknesses still listed)

- **Credits (V unless noted):** full submit round trip in-browser — dialog opens, submit disabled until text, on submit a new row appears at top with "Open" status, `fresh` highlight animation class, and a toast "Saved as an example. REQ-7700 stays in this browser. View request." (V). Request list ships 4 realistic example requests with statuses (Submitted / In progress) under grouped, collapsible Open/Completed headers (V: row titles; S: collapse). Detail view: 36px/32px serif title, Details aside (Status / Assignee / Created on / Last activity / Request ID), 2-entry Activity feed with avatars, reply box (V). Table cells use tabular-nums + ellipsis; mobile ≤720px drops two columns instead of squashing (S). Linkify renders URLs as labeled chips ("Google Doc", domain-based) and `displayTitle` strips pasted URLs out of titles (S). Dark mode: full token set incl. status tints; verified at DOM level (computed body bg `rgb(20, 20, 18)` under emulated dark) — see caveat below.
- **[P3] Hint/placeholder gray `#8F8B85` on white = 3.39:1** (computed) — below AA for the 12px hints/placeholders it's used on. Minor and confined to de-emphasized text.
- **[P3] Examples are static and clearly canned** — four requests, two timeline entries each; the demo's realism peaks in the first ninety seconds. But that is the genre working as intended.
- **Not penalized:** live Harvey MCP connection can't run here; the artifact degrades gracefully by design ("Example mode: this request stays in your browser." — V), which is itself a credit.

## Evidence & verification log (what actually ran)

1. Both URLs served 200 via curl. Repo `tmp/open-legal-artifacts`; nothing inside `open-artifacts/`, `artifacts/`, `app/`, `deploy/` modified. Scripts and console log live at workspace `tmp/a03-*.mjs`, `tmp/a03-console.log`.
2. Screenshots captured via raw CDP (Chrome for Testing headless, `Page.captureScreenshot`), full-page clip, 1440×900 @2x desktop + 390×844 mobile: `ours-default`, `ours-canon-housing`, `ours-error`, `ours-mobile`, `theirs-default`, `theirs-new-request`, `theirs-filled`, `theirs-submitted`, `theirs-detail`, `theirs-mobile`.
3. DOM probes (CDP `Runtime.evaluate`): our table rows/dimension values, rank lines, badge verdict, computed font sizes, focus outline, canon-swap sections and missing-field lists, JSON-error text; their row titles, submit round trip (5 rows after submit, fresh class, toast text), detail-page structure, dark computed bg. All values quoted in this report come from these probes or from the two files' source.
4. Console across both sides: one line — favicon 404 (shared server). No JS errors on either side.
5. Contrast ratios computed (WCAG): listed inline above.

### Provenance caveats — read before publishing shots

- **Concurrent writer observed:** at 02:04 and 02:16 a process other than my scripts wrote/rewrote files in the shots dir (`theirs-list.png` appeared, 1280px-wide, not mine; `ours-default.png` was replaced twice). Final on-disk `ours-default.png` matches my original capture's byte size, but provenance of any single PNG is not guaranteed. A sibling capture run (likely a parallel A03 or parent verification) shares this directory. Re-shoot from the manifest before external use if provenance matters.
- **`theirs-dark.png` deleted deliberately:** three capture attempts (incl. plain viewport mode, with body computed bg confirmed dark immediately before and after) each produced a PNG byte-identical (MD5) to the light capture — a capture-surface anomaly I could not resolve in this runtime. Dark mode is therefore claimed at **DOM-verified level only**, not pixel level.
- **Pixel-level review limitation:** no vision service was callable in this runtime; "visual" claims above are grounded in (a) full CSS/HTML source of both files and (b) DOM-level computed-style/geometric probes, with PNGs archived for human review. Where a claim is source-only it is marked (S).

## Unverified / out of scope

- THE hers live-MCP path (needs a real Harvey connector) — untested, by environment.
- OURS `core.js` unit tests ("890/0" upstream claim) — not run here (out of scope for visual critique).
- THEIRS keyboard-only navigation flow, screen-reader output — source suggests support (`:focus-visible`, sr-only, role=alert) but not exercised.
- Screen-recording-level motion review (fresh-row animation timing) — still-frame evidence only.
