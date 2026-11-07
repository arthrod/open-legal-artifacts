---
name: Open Legal Artifacts
description: An open index of legal-AI artifacts — specimen-white surface, one highlighter accent, hairline lattice, zero radius.
colors:
  specimen-white: "#fafaf8"
  signage-black: "#0a0a0a"
  counter-grey: "#6b6b6b"
  hairline-grey: "#e8e8e5"
  hover-wash: "#f0f0ee"
  highlighter-yellow: "#ffd400"
  highlighter-yellow-deep: "#e6bf00"
  panel-white: "#ffffff"
  flag-tint: "#fffbe6"
  status-ok: "#15803d"
  status-warn: "#b45309"
  status-bad: "#b91c1c"
typography:
  display:
    fontFamily: "Manrope, system-ui, -apple-system, sans-serif"
    fontSize: "clamp(2.2rem, 6vw, 3.4rem)"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Manrope, system-ui, -apple-system, sans-serif"
    fontSize: "clamp(1.8rem, 4.5vw, 2.6rem)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  headline-demo:
    fontFamily: "Manrope, system-ui, -apple-system, sans-serif"
    fontSize: "clamp(26px, 4vw, 38px)"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Manrope, system-ui, -apple-system, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  positioning:
    fontFamily: "Manrope, system-ui, -apple-system, sans-serif"
    fontSize: "30px"
    fontWeight: 400
    lineHeight: 1.35
    letterSpacing: "-0.018em"
  lede:
    fontFamily: "Manrope, system-ui, -apple-system, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.65
  body:
    fontFamily: "Manrope, system-ui, -apple-system, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
  body-small:
    fontFamily: "Manrope, system-ui, -apple-system, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Departure Mono, JetBrains Mono, ui-monospace, monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.12em"
  nav:
    fontFamily: "Manrope, system-ui, -apple-system, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.06em"
  data:
    fontFamily: "Departure Mono, JetBrains Mono, ui-monospace, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0.04em"
  wordmark:
    fontFamily: "Departure Mono, JetBrains Mono, ui-monospace, monospace"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0.04em"
rounded:
  none: "0px"
spacing:
  hairline: "1px"
  lattice-gap: "1px"
  pad-x-desktop: "40px"
  pad-x-mobile: "24px"
  tile-pad: "1.4rem"
  section-gap: "96px"
  section-gap-mobile: "64px"
  hero-pad-top: "112px"
  container-max: "1100px"
  measure: "68ch"
components:
  tile:
    backgroundColor: "{colors.specimen-white}"
    textColor: "{colors.signage-black}"
    rounded: "{rounded.none}"
    padding: "1.4rem"
  tile-hover:
    backgroundColor: "{colors.hover-wash}"
    textColor: "{colors.signage-black}"
    rounded: "{rounded.none}"
    padding: "1.4rem"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.counter-grey}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "2px 8px"
  pill-status:
    backgroundColor: "transparent"
    textColor: "{colors.counter-grey}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "2px 8px"
  button-primary:
    backgroundColor: "{colors.signage-black}"
    textColor: "{colors.specimen-white}"
    typography: "{typography.nav}"
    rounded: "{rounded.none}"
    padding: "0.55rem 1.2rem"
  button-primary-hover:
    backgroundColor: "{colors.highlighter-yellow}"
    textColor: "{colors.signage-black}"
    rounded: "{rounded.none}"
    padding: "0.55rem 1.2rem"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.signage-black}"
    typography: "{typography.nav}"
    rounded: "{rounded.none}"
    padding: "0.55rem 1.2rem"
  field:
    backgroundColor: "{colors.panel-white}"
    textColor: "{colors.signage-black}"
    typography: "{typography.data}"
    rounded: "{rounded.none}"
    padding: "0.6rem 0.7rem"
  table-head:
    backgroundColor: "{colors.hover-wash}"
    textColor: "{colors.counter-grey}"
    typography: "{typography.label}"
    padding: "0.55rem 0.75rem"
  backlink-bar:
    backgroundColor: "{colors.signage-black}"
    textColor: "{colors.specimen-white}"
    typography: "{typography.label}"
    padding: "8px 20px"
---

# Design System: Open Legal Artifacts

## Overview

**Creative North Star: "The Specimen Table."**

This is the visual language of a museum specimen table or a well-kept exhibit list: a near-white field, hairline rules that carry the structure so nothing has to cast a shadow, and one highlighter yellow that marks, never speaks. Everything is squared to zero radius. Everything that is a label is set in a mono small-caps voice; everything that is a claim is set in Manrope at a reading weight. The page behaves like an index because it is one — 42 entries, each reduced to a name, a one-line claim, and the links that let you check it.

The density is the design. Roughly two thirds of the catalog surface is data, so the system's discipline is subtractive: one accent hue, two type families, one container width, one border treatment. Repetition is correct here — 33 tiles that share a rhythm are readable; 33 tiles with individual personality would be noise. The point of the craft is that the repetition is exact: the same 1px seam, the same accent top rule on the four originals, the same 11px label tracking on every counter.

What it explicitly rejects: the legal-tech SaaS surface (navy, serif, gradient hero, glass cards, logo walls), the awesome-list directory (emoji headings, badge walls), the AI-terminal costume (green on black, fake prompts), and the editorial-typographic reflex — display serif italic, three rule-separated columns, lowercase tracked metadata — which is the lane a "not SaaS" legal index slides into by default. The mono here is a caption voice, not a costume; the yellow is a structural marker, not a mood.

**Key Characteristics:**
- Zero radius anywhere (`--radius: 0`), enforced, no exceptions for buttons, inputs, pills or tables.
- Hairline lattice instead of cards-with-shadows: 1px `#e8e8e5` seams on a `#e8e8e5` backing produce the grid.
- One accent hue, used structurally — rules, top-edge stripes, selection, one hover state — never as body text and never as a focus ring.
- Two families only: Manrope for reading and claims, Departure Mono for labels, counters, IDs and data.
- 1100px container, 40px desktop inset, 24px mobile inset, 768px as a literal breakpoint.
- Prose measure capped at 65–68ch; tables allowed to run wider.
- Verified/unverified is a first-class visual state, rendered in text, not colour alone.

## Colors

A near-white specimen field, one ink, one hairline, one highlighter — plus three semantic text colours reserved for verdicts and nothing else.

### Primary
- **Signage Black** (`#0a0a0a`): all reading text, the wordmark, table body, the primary button fill on demo pages, the deployed back-bar. 18.9:1 on the specimen field. This is the ink; it is not "dark grey used for elegance".
- **Highlighter Yellow** (`#ffd400`): the accent. Appears as the 56×2 hero rule, the 4px top edge on the four originals' tiles, `::selection`, link underline on hover, focus-visible on a black surface, and the demo primary-button hover fill. `#ffd400` on `#fafaf8` is 1.37:1, which is exactly why it is structural only.
- **Highlighter Deep** (`#e6bf00`): the pressed/darker state for accent-filled controls. One use, no palette expansion.

### Neutral
- **Specimen White** (`#fafaf8`): page and tile background. Warm-shifted by two points, which is what keeps the hairline grid from reading as a spreadsheet.
- **Panel White** (`#ffffff`): a second, deliberately brighter surface for artefacts — inputs, tables, timeline entries, evidence blocks. Panels sit *on* the field; the field never sits on a panel.
- **Counter Grey** (`#6b6b6b`): secondary prose, ledes, captions, labels, table headers, counts. 5.1:1 on `#fafaf8`, 5.4:1 on `#ffffff` — AA for body text at every size. This is a text colour, not a decorative wash.
- **Hairline Grey** (`#e8e8e5`): every 1px rule, every seam in the lattice, every table divider, every divider under a section head. 1.05:1 against the field — it is a divider, never a control boundary.
- **Hover Wash** (`#f0f0ee`): tile and row hover, `code` and `pre` backgrounds, table header fill. One step only; no second hover tone.
- **Flag Tint** (`#fffbe6`): the tinted row behind a flagged table row in demo tables. The only tinted surface in the system and it may only appear *inside* a table row.

### Tertiary
- **Status Green** (`#15803d`), **Status Amber** (`#b45309`), **Status Red** (`#b91c1c`): verdict text only — `ok`, `warn`, `bad` pills and the conflict border on a timeline entry. These are the only saturated hues besides the accent, they never fill a surface, and they never appear as a background. Measured on the field: 5.0:1, 4.6:1, 6.2:1.

### Named Rules
**The Structural Yellow Rule.** The accent marks structure and selection, never meaning and never text. No yellow body copy, no yellow heading, no yellow focus ring, no yellow background block larger than a rule or a chip. If a reader could mistake the yellow for a status, it is wrong.

**The Contrast Split Rule.** *Text* contrast is solved by the token set and must stay ≥4.5:1 (secondary grey does at 5.1:1). *Affordance* contrast is not solved: a 1px hairline is 1.05:1 and cannot identify an input. Any element whose edge is the only cue that it is a control uses `--text` at ≥3:1, not `--border`.

**The Two Whites Rule.** `#ffffff` is for panels that hold artefacts (fields, tables, evidence, timeline entries). `#fafaf8` is the field and every catalogue surface. Reversing the two flattens the page into one rectangle.

## Typography

**Display Font:** Manrope (with system-ui, -apple-system, sans-serif) — weights 400/500/600/700 in use.
**Body Font:** the same Manrope, 400 for prose and 600 for titles.
**Label/Mono Font:** Departure Mono, self-hosted (`fonts/DepartureMono-Regular.woff2|woff|otf`), falling back to JetBrains Mono, then `ui-monospace`.

**Character:** a humanist-geometric sans doing all the reading, and a bitmap-adjacent mono doing all the captioning. The pairing is not decorative contrast — it is a functional split between *claims* (Manrope, sentence case, tight but not cramped at −0.015 to −0.025em) and *inventory* (Departure Mono, uppercase, tracked 0.04–0.14em). The mono is the voice of the specimen label: short, factual, always countable.

### Hierarchy
- **Display** (700, `clamp(2.2rem, 6vw, 3.4rem)`, 1.08, −0.025em): the single catalog `h1` — "Open Legal Artifacts" — and nothing else.
- **Headline** (700, `clamp(1.8rem, 4.5vw, 2.6rem)`, 1.15, −0.02em): detail and demo page titles. Demos use the tighter `clamp(26px, 4vw, 38px)` variant so a tool page opens on its instrument, not its title.
- **Title** (600, 22px, 1.25, −0.015em): tile titles. The only place a link is allowed to be this large.
- **Positioning** (400, 30px, 1.35, −0.018em): the standalone positioning paragraph, when a surface needs one line at speaking volume.
- **Lede** (400, 17px, 1.65): the paragraph directly under a page title, in Counter Grey, capped at 65ch.
- **Body** (400, 16px, 1.6): reading text. Cap prose at 65–68ch; tables are exempt.
- **Body Small** (400, 14px, 1.55): tile descriptions, table cells, meta boxes, blurbs.
- **Label** (Departure Mono 400, 11px, tracking 0.12em, uppercase): counts, section titles, tile meta, chips, table headers, footer lines.
- **Data** (Departure Mono 400, 13px, tracking 0.04em): identifiers, JSON, field values, dates, quotes inside evidence blocks.
- **Wordmark** (Departure Mono 15px, 0.04em): `open·legal·artifacts`, with the two medians in Counter Grey.

### Named Rules
**The Two-Register Label Rule.** There are exactly two label registers: a *name* (uppercase mono, 11px, ≥0.08em) and a *count* (uppercase mono, 11px, Counter Grey, right-aligned). A third tracked-caps level is a bug. The catalog currently runs five — eyebrow, section title, section meta, tile meta, link row — and collapsing them is the highest-value typographic fix available.

**The 11px Floor.** No uppercase tracked mono below 11px, and no tracking above 0.12em below 14px. 10px labels survive a screenshot and fail a laptop at 125% zoom.

**The Tracking Floor Rule.** Display tracking bottoms out at −0.025em; nothing in this system goes past −0.04em. Positive tracking at ≥26px (the deploy-time `letter-spacing: .01em !important` on `h1`) reads loose against everything else and is forbidden.

## Elevation

This system is flat. There is not one `box-shadow` in it, and there should not be: depth is carried by three devices — the 1px hairline lattice (tiles separated by 1px seams over a `#e8e8e5` backing), the two-white split (panels brighter than the field), and the 4px accent top edge that marks a tile as an original. Nothing floats; nothing lifts on hover. Hover changes fill (`#fafaf8` → `#f0f0ee`) in 150ms and nothing else.

There is exactly one translucent surface: the sticky site header — `rgba(250, 250, 248, 0.94)` with `backdrop-filter: blur(6px)`. It exists so text scrolling underneath stays legible, not for glass effect, and it is the only place blur is permitted in the system.

The deployed build adds a black back-bar (`#0a0a0a` fill, 11px uppercase mono, sticky at top, `z-index: 99`) above every artifact page. It is the strongest element on a demo page, and it earns it: it is the only way back into the catalog. It belongs in the system, not in a build script.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest and flat in state. If a design needs a shadow to explain hierarchy, the hierarchy is wrong — add a hairline, a section head, or a change of white.

**The Z-Scale Rule.** Semantic z-index only: header `10`, back-bar `99`, and no fourth value. Arbitrary `999`/`9999` values are prohibited; if a new layer needs a number, it gets a name.

## Components

Every component below exists in `app/src/styles.css` (catalog + in-app demos) or in the standalone demo stylesheets. Where the two disagree, the rule below states which one is correct.

### Buttons
- **Shape:** square (0 radius, `--radius`). No exceptions.
- **Primary:** one per view. Signage Black fill, Specimen White text, 13px Manrope 600, uppercase, tracking 0.06em, padding `0.55rem 1.2rem`. The accent fill currently shipping on catalog demo buttons (`button { background: var(--accent) }`) is the older vocabulary and is wrong: yellow is structural, and a yellow primary contradicts the token comment it inherits.
- **Hover:** fill to `#ffd400` with black text (150ms), or `#e6bf00` if the button is already accent-filled. No lift, no shadow, no scale.
- **Secondary:** transparent fill, 1px `--text` border, black text. Used for `Download CSV` and other non-destructive alternates. Two buttons maximum per action row; both are text labels, never icons alone.
- **Focus:** `outline: 2px solid var(--text)` with `outline-offset: 2px`. Never the accent — `#ffd400` on `#fafaf8` is 1.37:1.

### Chips (category)
- **Style:** transparent fill, 1px hairline border, Counter Grey text, 11px uppercase mono, tracking 0.12em, padding `2px 8px`.
- **Original variant:** border colour and text switch to `--text`, and the label is prefixed with `◆`. That is the entire visual difference between an original idea and a counterpart — one ink step, not a new colour.

### Status pills (verdicts)
- **Style:** same metrics as chips; the *text* carries the state (`exact`, `normalized`, `fuzzy`, `not_found`, `unverified`, `conflict`).
- **State encoding:** semantic colour in the text only — `ok` `#15803d`, `warn` `#b45309`, `bad` `#b91c1c`, `muted` Counter Grey. Never a filled background, except the one historical exception on demo verdict pills (`exact` black fill / `fuzzy` accent fill / `not_found` dashed border), which is allowed *inside a demo verdict table* because it encodes a three-state machine, and nowhere else.
- **Rule:** the pill text is always the machine's own vocabulary, unformatted — `not_found`, not "Not found!". The underscore is the point.

### Tiles (catalog cards)
- **Corner Style:** square.
- **Background:** Specimen White at rest, Hover Wash on hover (150ms).
- **Border:** no border of its own — the tile is defined by the 1px lattice gap around it. Originals additionally carry `border-top: 4px solid var(--accent)`; counterparts carry a transparent 4px top so both keep the same height.
- **Internal Padding:** `1.4rem 1.4rem 1.2rem`, vertical rhythm `0.55rem` between meta row, title, description and link row.
- **Grid:** `repeat(auto-fill, minmax(310px, 1fr))` inside a 1100px container, 1px gap, `#e8e8e5` backing, 1px outer border. A trailing orphan tile spans the remaining columns (`:last-child:nth-child(3n+1)` → full width) so the grid never shows an empty grey cell.
- **Content shape:** meta row (category chip left, status right) → 22px title that is the only link → 14px description → mono link row (`Demo ↗` `Repo ↗` `Details →`). Three links maximum; the order never changes between tiles.

### Section heads and counts
- **Style:** hairline rule on top (`border-top: var(--hairline)`, `padding-top: 0.9rem`), 11px uppercase mono title on the left with a leading `/`, right-aligned count in Counter Grey. The count is data from the catalog, not a decoration: if it says 33, 33 tiles follow.
- **Sub-line:** 14px Counter Grey sentence under the head, capped at 68ch.

### Tables
- **Style:** Panel White surface inside a 1px hairline wrap with `overflow-x: auto`; `border-collapse: collapse`; 13px body cells; `0.55rem 0.75rem` cell padding; hairline row dividers; no vertical rules; no zebra striping.
- **Header:** Hover Wash fill, 11px uppercase mono in Counter Grey — the header row is a label, not a heading.
- **Unverified cells:** italic, Counter Grey, literal text `unverified`. Never a dash, never blank, never a guess.
- **Flagged rows:** `#fffbe6` row tint; the flag must also be stated in text in the row itself.
- **Minimum width:** `min-width: 560px` inside the scroll wrap, so a 5-column table never collapses its own payload into `NOME_COM / PLETO`.

### Demo chrome (the tool panel)
- **Shell:** a `<section class="demo">` on the page, 1px hairline border, no fill change from the field, `1.4rem` padding, 1.5rem top margin. A 17px/600 `h2` names the demo, a 13px Counter Grey sub-line states the fiction ("mock data, computed in your browser") and a suggested exercise.
- **Fields:** 10–11px uppercase mono labels above the control (never placeholder-only), `textarea`/`select` in Panel White, 0.78rem mono, `resize: vertical`, padding `0.6rem 0.7rem`. **The boundary must not be the 1px hairline alone** — a control edge needs `--text` at ≥3:1 or an inset Panel-White fill against a tinted rest of the panel.
- **Focus:** `outline: 2px solid var(--text); outline-offset: 2px` (the current `outline: 2px solid var(--accent)` is 1.37:1 and must be replaced).
- **Actions row:** flex, 0.6rem gap, wrapping; primary first, secondary second.
- **Result region:** separated by a hairline top border, 1rem padding-top; verdict pills first, then prose, then `<pre>` for the closest matching span. Empty state is a sentence, never a spinner.
- **Errors:** a `bad` pill plus the machine's message verbatim (`expected a JSON array of entries`). Errors are rendered in the result region, in place — no alert dialogs, no toasts.

### Timeline
- **Rail:** 2px `--border` vertical rule; each entry an `li` on Panel White with a 1px hairline and a 0.5rem square accent node; conflicting entries switch the border to `#fca5a5` and repeat the conflict in text (`conflicts with: …`).

### Navigation and footer
- **Header:** sticky, hairline bottom border, translucent field fill with 6px blur, wordmark left (mono 15px, medians in Counter Grey), nav right — 13px Manrope 500, uppercase, 0.06em, Counter Grey, 2px accent underline that wipes in from the left on hover (150ms). On mobile it stacks: wordmark row, then nav, 24px inset.
- **Footer:** hairline top border, two 11px uppercase mono lines — licence/repo/domain left, positioning line right — stacked and left-aligned below 768px.
- **Back link:** `← Catalog` / `← All artifacts` in 11px uppercase mono at the top of every detail and demo page, always before the eyebrow. In the deployed build this becomes the black sticky back-bar.

## Do's and Don'ts

### Do:
- **Do** keep radius at exactly `0` everywhere: tiles, chips, pills, inputs, tables, buttons, timeline entries.
- **Do** build separation from 1px hairlines, a 1px lattice gap over `#e8e8e5`, and the two-white split — never from shadows.
- **Do** spend the accent as a rule (56×2), a top edge (4px), a selection fill, or an underline — and keep it under roughly 5% of any screen.
- **Do** render state in text: `unverified`, `not_found`, `no conflicts`, `conflicts with: …`. The pill carries the machine's own word, underscore and all.
- **Do** cap prose at 65–68ch and let tables run to the container edge inside their own scroll wrap.
- **Do** use literal breakpoint values (`@media (max-width: 768px)`); `var()` inside a media feature silently never matches.
- **Do** keep exactly two label registers (name, count) and never drop uppercase mono below 11px.
- **Do** give controls a ≥3:1 edge and a `:focus-visible` ring in `--text`. The hairline is a divider, not a boundary.
- **Do** say what a demo is not: "mock data, computed in your browser", "fictional parties", "not legal advice" — on the page, in the demo chrome.

### Don't:
- **Don't** use `border-left` or `border-right` greater than 1px as a coloured accent on any card, callout, evidence block or table cell. This is an absolute ban and it is currently shipping in the standalone demo stylesheets (`.ev`, `.cat`, `.banner`, `.disclaimer`, `.gap`, `.dep`, `.warn`, `td:first-child`); the deploy script's regex replacement of it is a symptom, not a fix. Replace with a full hairline plus a 6px accent square in the gutter, or a 2px *top* rule.
- **Don't** use the accent as a focus ring, text colour, or large background fill. `#ffd400` on `#fafaf8` is 1.37:1 — it marks structure, it does not signal state.
- **Don't** introduce gradient text, gradients as backgrounds, glassmorphic cards, decorative grid/stripe backgrounds, sketchy SVG illustration, or `border-radius` above 0. None of these are in the system and none are "close enough".
- **Don't** patch styles at bundle time. The deploy script currently injects `!important` overrides (`h1{font-size:26px!important}`, `:focus-visible{outline:2px solid var(--text)!important}`, `.primary{background:var(--text)!important}`) and rewrites `ui-monospace`. If the fix matters, it belongs in the stylesheet; if it doesn't, it belongs nowhere.
- **Don't** set display type tighter than −0.04em or looser than 0 at ≥26px. The old positive-tracking `h1` override reads as broken next to everything else.
- **Don't** ship a second design language. The prompting course's Libre Franklin + Roboto Mono, its dark CTA band and its missing back-link are a register break, not a variant: it must come back to Manrope + Departure Mono and carry `← Open Legal Artifacts`.
- **Don't** mix the demo and catalog inset (24px vs 40px) or the demo and catalog title scale inside one viewport width.
- **Don't** make it look like legal-tech SaaS marketing — navy and serif, "trusted by the world's largest…" logo walls, purple-gradient heroes, tilted dashboard screenshots floating over gradients.
- **Don't** make it an awesome-list: emoji section headings, badge walls, star counts, "awesome" tone, unverified link dumps.
- **Don't** do AI-terminal cosplay — green on black, fake shell prompts, ASCII banners, blinking cursors — and don't drift into the editorial-typographic reflex (display serif italic, three rule-separated columns, lowercase tracked metadata). The mono is a caption voice; the page is a specimen table.
- **Don't** fill a gap to make a table look finished, or present an inference as a verified cell. A blank that should say `unverified` is the one defect this system exists to prevent.
