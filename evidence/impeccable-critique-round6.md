# Impeccable Critique — Open Legal Artifacts (landing catalog + artifact demos)

**Provenance:** dual-agent run (Assessment A: design review sub-agent · Assessment B: detector/browser sub-agent, isolated until synthesis). Target resolved to `app/src/pages/index.ts` + live surface `https://arthrod--4075ab70dae211f1929a1607ee4eb77e.web.val.run/`. Slug: `app-src-pages-index-ts`. Product context: PRODUCT.md + DESIGN.md written by `/impeccable init` this session. Prior input: `evidence/impeccable-audit-round5.md` (not ignored; this run supersedes where overlapping).

## Synthesis — the one-paragraph verdict

The catalog is a well-crafted instance of a recognizable editorial-technical aesthetic — AI-slop verdict "no" on the landing, heuristics 21/40 (acceptable, significant improvements needed). The system's failure mode is concentrated, not diffuse: **the index cannot be searched (33 tiles, zero filter/search — P1), verdict emphasis is inverted in the checking tools (passes shout, failures whisper — P1), and the demo layer still ships a second, weaker design language that violates the system's own floor rules (side stripes in source, 10px type, 1.37:1 focus, off-token status hexes — P1)**. The prompting course is flagged by both assessments as a register break and a funnel contradiction (dark CTA band, `CONTACT →`) — a shape decision, not a polish item. Detector evidence corroborates A independently: 50 findings across 5 targets, dominated by `design-system-font-size` (38×, the 10–11px mono-label inflation A scored as hierarchy collapse) plus `side-tab` warnings (2×) that survived the bundle-time stripe fix in source form.

## Assessment A — headline findings (design review)

- **AI-slop:** no on `/`; yes on `/course/` (generic AI course-landing template, loudest page in the set).
- **Heuristics:** 21/40. Lowest: Consistency 1/4 (four design languages ship). Highest: Match/Real-World 3/4, Aesthetic/Minimalist 3/4.
- **Cognitive load:** 7/8 checklist items fail. Worst: no search on a 33-tile index; client-intake step 3 = ~30 decisions in one scroll with duplicated controls (text input + chip row both storing the same value).
- **Emotional journey:** peaks = hero, originals row, cite-check's pinpoint catch ("p. 15 but located on 12"). Valleys = the 4,000px tile scan, the catalog→demo trust cliff ("the wrapper is better than the work"), and the funnel ending. **Disclaimer-as-reassurance is inverted:** the legal caveat is the quietest text on every page.
- **P1s:** (1) unsearchable index; (2) inverted verdict emphasis (exact = black filled, not_found = dashed whisper); (3) demo chrome below the system's own floor.
- **P2s:** client-intake review wall; prompting course off-brand/off-voice.

## Assessment B — headline findings (detector + browser)

- **Detector:** 50 findings / 5 targets — 38 `design-system-font-size` (10–11px below the 11px floor), 3 `design-system-color`, 6 warnings total incl. 2 `side-tab` on the deployed landing bundle, `em-dash-overuse` on 2 demo pages. Raw JSON: `tmp/shots/critique-detector-*.json`.
- **Browser/console:** live pages load and compute; console evidence archived at `tmp/shots/critique-console.log`.

## Convergent findings (both assessments, independent)

1. 10–11px mono label inflation (A: "five label levels"; B: 38 font-size findings) — the single most repeated defect.
2. Status color off-token / misused (A: green/red surface fills + yellow-as-status; B: design-system-color findings).
3. Demo layer diverges from catalog tokens (A: four design languages; B: warnings concentrated on demo bundles, none on the catalog source beyond advisories).

## Priority fix list (synthesized)

1. **[P1] Searchable index** — filter row (7–8 practice areas) + search field + group-by-reader-question; provenance demoted to glyph.
2. **[P1] Verdict emphasis inversion** — failures take the ink; passes go muted; one row-level tint for the actionable row. Applies to cite-check, limitations-radar, playbook deviation table.
3. **[P1] Demo chrome onto tokens** — kill source-level side-stripe classes (not just bundle-time), lift all type to ≥11px, one global `:focus-visible` rule in app/src, tokenize status colors.
4. **[P2] Client-intake step 3** — ≤4 blocks, "3 rewritten — review these" summary, chip-only enums, sticky action bar.
5. **[P2] Prompting course** — shape decision: bring into the catalog voice end-to-end (kill the dark CTA band and funnel ending) or move off-domain.
6. **[P3] Baseline drift** — tile link-row baselines on wrapped titles; empty 4th-original wide tile; duplicate rules under h1.

## Trend

First critique run for this slug. Prior audit rounds (visual rounds 2–5, evidence/) tracked: table readability (fixed R5), side-stripes (fixed at bundle, source-level fix still open), focus contrast (fixed at bundle, app/src still lacks :focus-visible).
