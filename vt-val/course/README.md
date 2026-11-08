# Prompting for Attorneys

Part of [open-legal-artifacts](/README.md). A ten-lesson interactive course
on prompting techniques for lawyers. Static site, no build step, no dependencies.

## Run it

Open `index.html` in a browser, or serve the folder with any static server
(`python3 -m http.server`). Routing is hash-based (`#/persona`, `#/context`,
...), so it also works from `file://`.

## Layout

```
index.html              HTML shell only (no inline CSS or JS)
css/
  fonts.css             @font-face for Libre Franklin + Roboto Mono
  tokens.css            design tokens (palette, type scale, spacing, motion)
  base.css              contrast overrides, reset, body, .mono, .sq, .wrap
  header.css            sticky header, progress pips, text-size toggle
  home.css              hero, lesson list, CTA band, buttons
  lesson-layout.css     lesson grid, sticky rail, article head, situation box
  compare.css           weak vs strong panes, numbered highlights and notes
  lesson-sections.css   why, quiz, try-it, further reading, prev/next nav
  footer.css            footer
  motion.css            entrance animation, loading blink
  responsive.css        mobile bar and the max-width: 900px rules
js/
  lessons.js            all lesson content (window.LESSONS)
  app.js                router, rendering, quiz, progress, try-it
fonts/                  woff2 files + licenses
```

Stylesheet order in `index.html` is the original cascade order. Keep it: later
files override earlier ones, and `responsive.css` must stay last.
`lessons.js` must load before `app.js`.

## Editing lessons

Each lesson in `js/lessons.js` has: `slug`, `short`, `title`, `minutes`, `one`,
`situation`, `weak`, `strong`, `notes`, `why`, `check`, `resource` (and
optionally `aside`). In `strong`, wrap highlighted text as `[[text|n]]`, where
`n` is the 1-based index into `notes`.

## Dependencies & behavior notes

- **"Run" button (Try-it boxes):** calls `window.claude.complete(...)`, which
  only exists inside Claude's artifact host. Outside that host the button is
  disabled and the page falls back to a **Copy** button. The course is fully
  usable without it.
- **Contact link:** the home-page CTA points to
  [arthur.law](https://arthur.law) (originally a relative link to a design-system
  file that was never part of this bundle — fixed here). Prefer
  `mailto:contact@arthur.law` if you rebrand the CTA as email.
- Progress and text size are stored in `localStorage`
  (`asr-prompting-progress`, `asr-prompting-size`).
- Fonts are the Latin subsets from `@fontsource-variable` 5.3.0 (Libre Franklin,
  Roboto Mono), not the byte-identical files from the design system. Same
  families, same variable weight axes.
