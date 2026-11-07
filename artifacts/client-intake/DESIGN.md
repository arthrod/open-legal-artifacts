# Design tokens

The interface adopts the design language in the ZIP's `Elicitation Lab - Demo.html`,
`colors_and_type.css`, and `demos/shared.css`. The intake and lab share a visual
language while preserving their separate workflows.

| Token | Value / use |
| --- | --- |
| Paper | `#FAFAF8` page background |
| Ink | `#0A0A0A` text, primary action, structural borders |
| Surface | `#FFFFFF` form panels |
| Muted | `#6B6B6B` secondary text |
| Faint | `#E8E8E5` dividers |
| Mark | `#FFD400` highlights, hover accents, focus offset |
| Body / display | Libre Franklin, with a system sans fallback |
| Labels / navigation | Roboto Mono, with a system monospace fallback |
| Borders and shape | 1px ink or faint border; square corners |
| Layout | 1180px maximum page width; 760px maximum form width |
| Gutters | `clamp(20px, 5vw, 56px)` |
| Headline | `clamp(30px, 4.4vw, 50px)` and tight tracking |

Canonical fonts load from Google Fonts with local system fallbacks; Val Town serves
text-only project assets. The real intake form, model requests, review, and
submission behavior are independent of the presentational design.
