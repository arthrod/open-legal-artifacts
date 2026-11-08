# Product

## Register

brand

## Platform

web

## Users

Two readers, one surface. The first arrives from a link — a lawyer, a legal engineer, a founder or GC, another builder — usually mid-task on a laptop, with a question already formed: *is there an open version of this Claude-for-Legal artifact, and does it actually work?* They are evaluating, not shopping. The second reader is the one who will run the code: an innovation lead or engineer who wants the spec, the deterministic core, and the tests before trusting a demo, and who may open a PR.

The first reader is the audience the copy is written for; the second is the audience the structure is built for. Neither is a customer in the transactional sense — there is no account to create, no price, no lead form. Where the site speaks about Arthur's practice it speaks to a reader's judgment about whether this work is credible, not to their calendar.

## Product Purpose

An open index of legal-AI artifacts, and a public answer to a closed gallery. Anthropic's Claude for Legal gallery holds 32 artifacts; this repo commits to an open counterpart for every one of them, plus Arthur's own production artifacts and the adjacent benchmarks and datasets that already have a better home elsewhere (linked, not forked).

Success is narrow and checkable: a visitor who came looking for one artifact leaves having understood the thesis — openness is the quality claim, not the licence footnote — and has opened at least one running demo or one line of source. The index is the product; there is nothing to sign up for afterwards.

## Positioning

The only place where a closed commercial legal-AI gallery is answered item by item, in public, in code: 42 entries, each with a runnable demo, a spec, a deterministic core wherever determinism is possible, and an MIT licence. A working index of counterparts, not a manifesto about them.

## Operating Context

The surface is a static Vite app under `app/` (hash router, no backend, no accounts, no analytics), built and deployed as one multi-file Val Town val (`vt-val/`, canonical) with a GitHub Pages mirror. The 4 originals and 33 open artifacts also ship as standalone single-file HTML demos in `open-artifacts/*/demo/` and `artifacts/*/demo/`, inlined at build time so each page is self-contained, offline-capable, and openable straight from the repo.

The repo is deliberately two registers. The catalog at `/` is brand: the page itself is the thing being judged. The demo and detail pages are product: a reader is inside a task, driving a table or a timeline, and the chrome must get out of the way. When a task touches one surface, that surface's register governs; this file carries `brand` because the catalog is the entry point and the reputational surface.

## Conversion & proof

- **Primary CTA:** open a live demo (or the in-app demo on `/cite-check`, `/deviation-board`, `/chronology`, `/tabular-review`). Secondary fallback: read the source — *Repo ↗* — or the spec.
- **The line a visitor should remember after ten seconds:** "every legal AI artifact, open and better."
- **Belief ladder** — what a visitor must accept, in order, before clicking a demo:
  1. Someone here actually builds and ships legal tooling, not slideware.
  2. Every entry is open: source, spec, tests, licence.
  3. The open version is not a stub — deterministic cores replace LLM guessing where law permits.
  4. It runs in this browser right now, with no key, no account, no upload.
  5. Therefore this is the reference index for open legal artifacts, and worth bookmarking.
- **Proof on hand:** four production originals with live Val Town URLs and public source; 33 open artifacts, each with a `spec.md`, a dependency-free TypeScript core, tests, and recorded sample outputs; 890 green test assertions (775 `node:test` + 115 tsx) recorded in `evidence/test-run.log`; four inspection rounds and browser verification in `evidence/`; MIT `LICENSE` for the whole repo; benchmark claims (live-contracts, neurotic_docx_bench, editors_trial) linked to their published reports rather than asserted. There are no testimonials, press mentions, client logos, or usage metrics — none exist, and none may be invented.

## Brand Personality

Exacting, unfussy, self-auditing. The voice is a printer's caption under a displayed object: it names what the thing is, says what it does not do, and stops. It writes `not_found` out loud rather than softening it, prefers a verified quote and a character offset to an adjective, and treats "unverified" as a respectable outcome. It is confident because it publishes its own failures — the four rounds of self-inspection are in the repo — and it never sells, because the demo does the selling.

Emotional goal: the quiet authority of a specimen table or a legal exhibit list. Not delight, not urgency, not warmth.

## Anti-references

- **Legal-tech SaaS marketing.** Navy-and-serif "premium firm" brochure, "trusted by the world's largest…" logo walls, purple-gradient hero, glassmorphic cards, a tilted dashboard screenshot floating over an abstract gradient.
- **The closed-gallery posture being answered.** Gated demos, screenshot-only proof, "request access", feature grids with no way to run anything.
- **Awesome-list directory sites.** Emoji section headings, badge walls, "awesome" tone, unverified star counts, link dumps with no state.
- **The editorial-typographic reflex.** Display serif italic + three rule-separated columns + lowercase tracked metadata + monochromatic restraint — the lane any "not SaaS" legal index falls into by default. The brand is printerly, not magazine-shaped; it must not drift into magazine affectation.
- **AI-terminal cosplay.** Green-on-black monospace, fake shell prompts, ASCII art, blinking cursors, "sudo"-jokes. The mono here is a caption voice, not a costume.
- **Law-firm brochure.** Counsel bios, "our values", stock handshake photography, mission statements.

## Design Principles

1. **The artifact is the argument.** Every claim on the page resolves in one click to a running demo or a line of source. A claim with no artifact behind it is deleted, not softened.
2. **Show the deterministic step.** The proof of "code beats guessing" is a rendered verdict pill, a character offset, a conflict flag, an UNVERIFIED cell — the code's output shown, not described.
3. **Unverified is a first-class answer.** Where the system does not know, it says so in the same visual register as where it does. Never fill a gap to make a table look complete.
4. **Nothing is behind a door.** No account, no upload, no key, no tracking, no "book a call" between the reader and the artifact. MIT is the business model.
5. **The index is honest at scale.** Counts, statuses and categories are data drawn from the repo, and they must reconcile with what actually exists — 4 originals, 33 open artifacts, 5 external, each link resolving or honestly marked.

## Accessibility & Inclusion

Working bar: WCAG 2.1 AA. This is a decision taken for the project in the absence of a stated requirement — the audiences are document-heavy professionals, many reading at 125–150% zoom on laptops, and the site's own claim is auditability.

Considerations that follow from the content: tables are the primary instrument, so header cells must be programmatically associated and every table readable without horizontal scroll at 390px; long mono identifiers must never be the only carrier of meaning; and "unverified" must be conveyed in text, not by colour alone.

Language and professional boundary: the UI is English, with genuine pt-BR content in the PII/LGPD artifact (not an English page under a Portuguese URL). Every demo carries a "not legal advice / fictional data" line; that boundary is copy, not decoration.

Known gaps to close, recorded rather than accepted: focus indication on app demo pages is accent-on-near-white (≈1.4:1, below the 3:1 floor for component state), input boundaries sit at ≈1.2:1 because they rely on the decorative hairline, and metadata bottoms out at 10px. See `evidence/impeccable-audit-round5.md` (P1-3, P2-7, P3-1).
