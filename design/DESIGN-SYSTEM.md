# Arthur Souza Rodrigues — Design System

A complete design system for the **personal consulting + portfolio brand of Arthur Souza Rodrigues** — a corporate lawyer and builder working at the seam of law, product, data, and AI. The brand has to read **tech-savvy and precise without intimidating its audience, which is attorneys**: senior, credible, restrained, a little bit "engineer who happens to practice law."

This folder contains the brand's typographic foundations, color system, component CSS, self-hosted fonts, sixteen component cards, a faithful **Website UI kit**, and the projects built on the system. Use it to generate on-brand pages, mocks, decks, and prototypes.

---

## Sources

Everything here was reverse-engineered from the production site build the user provided. If you have access, study these to go deeper:

- **GitHub repo:** [`arthrod/1-arthur-astro`](https://github.com/arthrod/1-arthur-astro) — three standalone HTML pages (Law Landing v2, Projects, Project Detail). These are self-contained bundles (compressed assets inline). The readable source — markup, the full `:root` token block, the component CSS, and the Tweaks panel — was extracted into `_source/` in this project (`template.html`, `*.body.txt`, `*.style.txt`).
- **Codebase path:** `1-arthur-astro/` (mounted locally) — same three files.
- **Live properties referenced in the copy:** cicero.im (flagship product "Cicero"), legalbenchmarks.ai, medium.com/@SyntheticLawyer, huggingface.co/arthrod, github.com/arthrod.
- **The system that preceded this one:** the Arthur Rodrigues Personal Design System (Manrope + Departure Mono, "refined minimal"). Its pages became the production build above; its tokens are not this system's. What it still has to teach is carried in the section *Ideas carried from the personal-site system*.

> The original build ships a live **Tweaks** panel (accent color, display/mono/wordmark fonts, weights, density, conversion toggles). The *canonical* defaults documented here are the `:root` values; the Tweaks UI lets a viewer explore alternates. Explore the repo above to rebuild designs with higher fidelity.

---

## What this brand is

One person, one voice, several surfaces of a **single product: the marketing/portfolio website.** It presents:

1. **Consulting** — fractional general counsel, legal-AI advisory, legal-systems implementation.
2. **A working portfolio** — legal-AI products (Cicero), privacy/PII models, benchmarks, datasets, open-source tooling, and essays ("The Synthetic Lawyer").

The design language is **editorial-meets-engineering**: warm paper, one near-black ink, hairline rules, monospace labels in `UPPERCASE`, sans-serif headlines set **bold**, and exactly one accent — a **highlighter yellow** used as a literal marker swipe, never as a button fill at rest. No rounded corners. No soft shadows. The whole thing feels like a beautifully typeset legal memo that knows how to code.

**Cicero stays separate.** Cicero is the flagship *project* on these pages, and it appears as evidence of capability, at the same weight as the other built things, linking offsite to cicero.im. Its own identity (Oswald, Spectral, the scarlet `hsl(358 95% 31%)`) never crosses into this system, and this system's paper-and-yellow never dresses Cicero. IBM Plex Mono sits in the Tweaks panel's mono list and is also Cicero's mono; prefer Roboto Mono or Departure Mono wherever the two brands could sit side by side.

---

## Information architecture

The production site is one landing page with anchored sections, a Projects page, a Project Detail page per project, and a Contact page.

| Surface | Sections, in order | Components |
|---|---|---|
| **Landing** | Hero (eyebrow, H1 with one mark, lede, CTA row, availability pill, proof strip, social chips) · `/ HIGHLIGHTS` (feature row + 3-up work grid) · `/ CONSULTING` (numbered offer triad) · `/ ABOUT` (portrait + facts) · `/ CONTACT` (dark band) · Footer | Header, Mark, Button, Availability, TextLink, SecLabel, Card, Offer, Eyebrow, Placeholder, Footer |
| **Projects** | Page head · Featured bento (hero 2×2 + two wide) · All projects grid with pagination | Card, Pager, Badge |
| **Project detail** | Back link · eyebrow · display H1 · action buttons · 16:9 hero · prose with sticky facts aside · prev/next cards | Eyebrow, Button, Placeholder, Aside, Card |
| **Contact** | Head · contact facts · form beside a booking calendar · sent and booked states | FormField, Button, Badge |

Nav links: Highlights, Consulting, About, Projects, Contact; below 760px only the wordmark and Contact stay. Two scrolls at most for the landing above the Contact band. The personal-site system planned Studio and Writing pages this site does not have yet; see the Ideas section.

---

## CONTENT FUNDAMENTALS

How the brand writes. Match this voice in any generated copy.

**Voice & stance.** First person singular for the practice ("**I** am a corporate lawyer and builder"), shifting to first person plural for the call-to-action ("Reach **us** out", "Let's get rid of…"). Confident, plain, senior. It explains hard things simply; it never hypes. The reader is an intelligent professional, addressed as a peer ("**you**" / "teams whose problems…").

**Tone.** Calm, exact, faintly dry. Sentences are declarative and well-built. Value is framed as *removing mechanical cost around judgment* — "so the expensive hour is spent deciding, not assembling." It sells competence, not adjectives. Verbs do the work; adjective restraint is the house style. No exclamation points.

**Casing.**
- Headlines & body: **sentence case** ("Legal counsel for teams whose problems now touch product, data, AI…").
- Labels, eyebrows, nav, buttons, tags, meta: **UPPERCASE**, monospace, letter-spaced (`/ CONSULTING`, `FLAGSHIP · LEGAL AI · 2024–PRESENT`, `OPEN PROJECT →`).
- Section labels are prefixed with a slash: `/ HIGHLIGHTS`, `/ ABOUT`, `/ FIELD NOTES`.
- Numbered items use zero-padded mono badges: `01`, `02`, `03`.
- The copyright year is set in Roman numerals: `© MMXXVI`, borrowed from print mastheads.
- Title Case only for proper nouns and project names, never for headings. Practice areas are nouns ("Fractional General Counsel"), never verbs ("Helping you with…").

**Punctuation & symbols.** The **middle dot `·`** is the workhorse separator (`Carta · Forge Global · Teachable`; `New York · São Paulo`; `Legal AI · product`). Em-dashes carry asides. The right arrow **`→`** terminates every action ("Contact →", "Open project →", "Visit →"). Real diacritics are respected (Português, São Paulo, O'Melveny).

**Vocabulary.** Precise legal-tech nouns: *fractional general counsel, governance, privacy, LGPD, redlines, issue lists, matter context, playbooks, redaction, verification, reproducibility, confidentiality.* It names real companies and real tools — credibility through specificity, never vague "industry leaders."

**Emoji:** none. Ever. The accent square ■ and the arrow → are the only "icons."

**Examples to emulate:**
- Hero: *"Legal counsel for teams whose problems now touch product, data, AI, and operations."*
- Lede: *"I help companies, legal teams, and firms handle the work that falls between legal advice and execution."*
- CTA headline: *"Let's get rid of that problem nobody wants to solve."*
- A project, described: *"turns messy inputs — email threads, third-party paper, playbooks, quick requests — into redlines, issue lists, memos, and matter context."*
- Studio framing line, from the personal-site system: *"Things I've made because I wanted to make them."*
- The required legal footer: *"**Attorney advertising.** This website is for general informational purposes and does not create an attorney-client relationship…"* — keep this disclaimer on anything public-facing.

**Off-voice, never:** "Welcome to my portfolio! 🚀" · "Let's transform your business with AI." · "I help founders unlock their potential." · testimonial sections (none exist; use a representative-work paragraph) · spiritual, lifestyle, travel or hobby content on the public site.

---

## VISUAL FOUNDATIONS

**The five-value palette.** The entire system is built from `--bg #FAFAF8` (warm off-white paper), `--ink #0A0A0A` (single near-black — text, borders, dark surfaces), `--muted #6B6B6B` (secondary text, AA on paper), `--faint #E8E8E5` (every hairline and divider), and one accent. White `#FFFFFF` (`--surface`) appears only as a *slightly raised* card surface against the paper. **No other hues, ever.** No gradients of any direction or colour.

**Contrast math.** `#FFD400` on `#FAFAF8` is 1.4:1: the accent fails as text on paper and never carries meaning as a shape alone. `#0A0A0A` on `#FFD400` is 13.8:1: ink-on-yellow marks, badges and chips are legible. `#6B6B6B` on paper is 5.1:1 (AA) and 4.3:1 on `--faint` (fails: never muted text on a faint fill). Every token's note in `tokens.json` carries its ratios.

**The accent is a highlighter, not a button color.** `--mark #FFD400` is used as a **background fill behind text** — a marker swipe (`background-size:100% 0.78em; background-position:0 62%`, clipped with `box-decoration-break:clone` so it survives line wraps). Ink *on* the accent (`--mark-text`) is chosen by luminance, so swapping the accent stays legible. Alternates (one at a time): Michigan Blue `#00274C`, Signal Orange `#FF5C00`, Field Green `#1F8A5B`, Cobalt `#2A6FDB`. Green `#1F8A5B` doubles as the "available" status pulse.

| The accent is permitted as | The accent is forbidden as |
|---|---|
| The marker swipe behind one phrase per heading (`.ds-mark`) | Text on paper or on `--surface` (1.4:1) |
| Number badges `01`, tags, the `→` arrow chip (`.ds-num`, `.ds-tag`, `.ds-arr`) | A resting button fill on paper (buttons fill with it only on hover; on the dark Contact band the primary button is the one exception) |
| The `■` square before section labels and as the prose list marker | A section or page background fill |
| The 2px underline under the current nav link | A card hover fill (cards lift and cast the hard shadow instead) |
| The hover fill of buttons, chips, pager buttons, calendar slots | A gradient, a glow, a blurred shadow, a border colour on a resting control |
| The hard offset shadow on card hover (`--lift`) | A decorative stripe along a card's edge |
| The link underline that wipes in on hover (`.ds-link`) | More than one mark in a heading, or a mark on body copy |
| Arrows and the email link on `--ink` surfaces (`--mark-on-dark`) | A second accent on the same page |

**Type.** Body & display: **Libre Franklin** (self-hosted variable, 100–900). Headlines run **bold (weight 700)** at large fluid sizes (`clamp(34–60px)`) with tight tracking (`−0.025em`) — assertive but precise, the weight doing the work. Labels/eyebrows/nav/code/wordmark: **Roboto Mono** (set at weight 600; falls back to **Departure Mono** → Space Mono), `UPPERCASE`, `+0.05–0.1em` tracking. Optional faces shipped for the Tweaks system: Manrope, Space Grotesk, Newsreader (serif), plus mono alternates (Departure Mono, Space Mono, IBM Plex Mono, Fira Code, DM Mono). Base body is 17px, line-height ~1.6, `letter-spacing:-0.01em`. The floor is `fs-micro` (10.5px); nothing on a page is set smaller. The styles are `fs-display` … `fs-micro` in `tokens.json`; the fluid sizes are `--fs-*` in `components/bundle.css`.

**Spacing & layout.** Centered column, `--page-max 1180px`, fluid gutter `--px clamp(20–56px)`. Sections pad `clamp(54–96px)` vertically, multiplied by a single **`--space-scale`** density token (Compact 0.74 / Comfortable 1 / Spacious 1.28) that scales the whole rhythm at once — the canonical default is **Compact (0.74)**. Header `--header-h 68px`; cards `--card-gap 14px` apart; nav links `--nav-gap 28px`. Grids: 3-up offers, 2-up notes, and a **4-column bento** for projects (hero spans 2×2, wide spans 2×1, single 1×1), collapsing to 2 at 920px and 1 at 560px.

**Backgrounds.** Flat warm paper — **no gradients, no photography as background, no texture** except one motif: **45° hairline hatch** (`--hatch`: `repeating-linear-gradient(45deg, --faint 0 1px, transparent 1px 13px)` over paper) that fills every *image placeholder* and empty state until real media is dropped in. Dark sections (Contact, Footer) are solid `--ink`.

**Borders.** One structural border — **`1px solid --ink`** (`--border-ink`) — wraps every card, panel, button outline, input and the project aside. Dividers and inner hairlines use `1px solid --faint` (`--border-faint`). Grid "gaps" are often a 1px `--faint` background showing through (`gap:1px` over a faint bed). **Corner radius is `0` everywhere** (`--radius`). The system is square; the one circle is the 8px availability dot.

**Shadows.** Effectively none at rest. The single shadow in the system is a **hard offset block in the accent on hover** — `--lift: 7px 7px 0 var(--mark)` (`--lift-sm`, 6px, for nav and prev/next cards) paired with `transform: translateY(-3px)`. It reads like a sticker peeling up, not a drop shadow. No blur-based elevation anywhere. Focused inputs borrow the idea at `3px 3px 0`.

**Animation.** Restrained. Entrance: a staggered **rise** (`opacity 0 → 1`, `translateY(14px) → 0`, `cubic-bezier(.2,.7,.2,1)`, ~.7s, `.05s` delay steps `d1–d5`), gated behind `prefers-reduced-motion`, with the visible end-state as the base style so content shows even if the animation never runs. The only looping motion is the green **availability pulse** (expanding ring, 2.4s). Link underlines *grow* in (`background-size 0% → 100%`, `.25s`). Buttons lift `−2px`. Everything eases at `.18s` (`--t-fast`) or `.25s` (`--t-mid`). No scroll-triggered reveals, no parallax, no float or bounce.

**Hover / press states.**

| Element | Rest | Hover | Current / selected | Disabled |
|---|---|---|---|---|
| Primary button | `ink` fill, `bg` text, `mark-on-dark` arrow | fills `mark`, text `mark-text`, rises 2px | — | 35% opacity, no rise |
| Ghost button | transparent, `ink` border + text | fills `mark`, border `mark`, rises 2px | — | 35% opacity |
| Card, prev/next card | `surface`, `ink` border | rises 3px, `--lift` | — | — |
| Text link (`.go`, `.ds-link`) | `ink`, no underline | `mark` underline wipes 0 → 100% | — | — |
| Link chip (socials, aside) | `ink` border, arrow chip | fills `mark`; arrow chip inverts to `ink` on `mark` | — | — |
| Nav link | `muted` | `ink` | `ink` + 2px `mark` underline | — |
| Pager button, calendar slot | `surface`, `ink` border | fills `mark` | `ink` fill, `bg` text | 35% opacity |
| Footer social chip | `on-dark-muted`, `on-dark-chip` border | border + text `mark-on-dark` | — | — |
| Input | `surface`, `ink` border | — | focus: `3px 3px 0 mark` | — |
| Work item (3-up grid) | `bg` | `surface` | — | — |

No distinct press or active shrink — interaction reads through colour and lift. Focus is a 2px `ink` ring at `--focus-offset` (3px) on links and buttons.

**Transparency & blur.** Used in exactly one place: the **sticky header** is `color-mix(in srgb, --bg 88%, transparent)` with `backdrop-filter: saturate(140%) blur(10px)` — a frosted paper bar. The accent marker band is fully opaque. No glassmorphism elsewhere.

**Imagery vibe (when real photos arrive).** Briefs in the source call for **warm monochrome** crops — a 4:5 headshot ("warm monochrome reads best"), 16:11 product screenshots, a 16:9 hero. Keep imagery warm-neutral and quiet so it sits inside the paper-and-ink world rather than fighting it. No stock photography, no hero banner images.

**Cards, summarized.** White (`--surface`) fill, `1px solid --ink` border, **0 radius, no shadow at rest**, hard yellow offset shadow + `−3px` lift on hover. Media area on top (or left, for wide cards) separated by a `1px --ink` rule, mono `tag` → 600-weight `h3` → optional body → mono `OPEN PROJECT →` with a yellow arrow chip pinned to the bottom.

**Reading mode.** Long-form course pages (Prompting for Attorneys) raise the floor: secondary text in `--muted-strong #4A4A47` (8.6:1), body 18px with a viewer toggle to 20px, no label under 12px, body copy in full `ink`. Use it for anything a reader studies rather than scans.

---

## ICONOGRAPHY

**This brand is deliberately icon-free.** There is no icon font, no SVG icon set, no PNG icons, and no emoji anywhere in the source. That absence *is* the style — it keeps the system purely typographic and lawyer-legible. When you build with this system, resist adding an icon library; reach for the type and the accent instead. No icon-only links anywhere.

The few "icon-like" marks in use, all drawn from type or CSS:

| Mark | Character / method | Role |
|---|---|---|
| Right arrow | `→` (U+2192) | Terminates every action — buttons, links, "open project", aside links. Often wrapped in a yellow chip (`--mark` bg, `--mark-text` arrow). |
| Section square | a `--sq` (9×9px) `--mark` `<span>` | Bullet before slashed section labels (`■ / CONSULTING`); also the list-marker before `.p-prose li`. |
| Middle dot | `·` (U+00B7) | Separator in meta, eyebrows, credits. |
| Status pulse | a green `border-radius:50%` dot with animated ring | "Available for new engagements" badge. |
| Hatch | `--hatch` | Fills image placeholders and empty states. |
| Social | text abbreviations `HF` / `LI` / `GH` in bordered mono chips | Footer "icons" are literally two-letter labels — never brand glyphs. |

**Logos / wordmark.** There is no logomark image — **the wordmark is pure type**: `ARTHUR.SOUZA.RODRIGUES` set in Roboto Mono 700, joined by faint (35% ink) periods, a DNS/file-path cadence. A compact `A.S.R` lockup works on dark. No raster or vector logo asset exists to copy; reproduce the wordmark with the font. (See the Wordmark card.) The one project mark in the system, the Jubarte whale of the DOCX tooling (`assets/Logos/jubarte.svg`), is a multi-colour illustration, not a brand logo: it appears only on that project's pages, at low opacity.

**If you must add an icon** for a UI the source never covered: choose a thin, monoline, geometric set (e.g. **Lucide** at ~1.5px stroke) so it matches the hairline borders — and flag it to the user as an addition, since it departs from the icon-free original.

---

## ANTI-PATTERNS

- Inter, Roboto (the sans; Roboto *Mono* is the project mono), Geist, or a system-default sans for body or display
- Cicero's tokens: Oswald, Spectral, IBM Plex Mono beside Cicero material, scarlet `hsl(358 95% 31%)`
- Any hue outside `#FAFAF8`, `#0A0A0A`, the defined greys, `#FFFFFF` and the one active accent; semantic red/green/blue for states
- Gradients of any direction or colour; blurred or soft drop shadows (the hard `--lift` block on hover is the only shadow)
- Border-radius above `0`; pill buttons; buttons filled with the accent at rest
- Stock icon sets (Lucide, Heroicons, Feather) as decoration; icon fonts; icon-only links; emoji
- A coloured left-border stripe on cards; filler stats; "trusted by" logo walls
- Hero banner images, stock photography, abstract textures, parallax, scroll-triggered reveals
- Testimonial sections; founder-tweet, BigLaw-brochure or creator-economy voice; "book a call" copy
- The highlighter on body copy, two marks in one heading, muted text on a faint fill, anything under 10.5px
