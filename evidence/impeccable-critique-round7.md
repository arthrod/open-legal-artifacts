# Impeccable Critique — Run 2 (post-remediation)

**Provenance:** dual-agent (A: design review · B: detector/browser), isolated until synthesis; dogfood run in parallel. Slug: app-src-pages-index-ts (trend vs 2026-11-07T23-59-07Z snapshot).

## Trend
- Detector: 50 → 30 findings (warnings 6 → 1 side-tab + 3 new em-dash advisories).
- Heuristics: 21/40 → 22/40. The searchable index moved Visibility-of-status and the empty state "is a proper state" (assessed as genuinely good).
- Browser: 0 page errors; 2×404 named — DepartureMono-Regular.woff2 at /fonts/ and /course/fonts/ (VT cannot serve binary; landing bundle keeps the url()).
- Dogfood: 0 blockers, 2 majors, 7 minors, 3 nice.

## Convergent next-pass priorities (synthesized)
1. [P1] 404 page is a bare text string (dogfood MAJOR + critique P1) — design a real 404 in catalog voice.
2. [P1] Search silently inherits the active category → false negatives on real artifacts (dogfood MAJOR) — clear or surface the filter when typing.
3. [P1] One click off the catalog and nav dies (critique P1 + round-4 finding) — demo pages orphan the user.
4. [P1] Interface prints database keys (deadline-within-30-days etc. — critique P1, chronic since round 4) — humanize rule ids at render.
5. [P2] Brand mono never renders on VT (three mechanisms: landing url() 404, course font stripped, demos font-stripped over cap) — decide: CDN mono fallback everywhere or inline under cap.
6. [P2] Three verdict languages disagree; the dangerous error is the quiet one (critique P2).
7. [P2] Repetition tax — evidence blocks repeat one sentence 8× (chronic since round 4).
8. Minors: deep-link confirmation, back-bar grid alignment, dual cite-check shells, course progress ticks, pinpoint anchor ambiguity, hero fold, Back-exits-site.
