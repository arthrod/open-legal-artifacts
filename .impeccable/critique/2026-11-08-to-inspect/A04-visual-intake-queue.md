---
timestamp: 2026-11-08T02:20:00Z
slug: a04-visual-intake-queue
pair: OURS open-artifacts/intake-queue/demo/index.html vs THEIRS _to_verify/New client intake (Copy).html
method: Playwright captures (1440×900 + 390×844) + computed-style/contrast/geometry audit; see "Evidence & caveats"
---

# A04 — Visual critique: intake queue vs "New client intake (Copy)"

**Stance:** adversarial against OURS, charitable to THEIRS, per batch rules.

## Verdict (one paragraph)

THEIRS wins the visual and product-experience comparison decisively, and it isn't close at first paint: a full app shell — multi-queue home, six-stage pipeline board, list, an insights view with funnel metrics, an enquiry side-sheet with conflict workflow, a 255-name conflict index, ownership, CSV export, cost transparency — set in Anthropic Sans/Serif with a 12px type floor, 79–98 ARIA attributes and 30 focus rules, zero console errors. OURS answers with the one thing THEIRS structurally cannot: a deterministic, offline, auditable core (scored name-math conflicts, guarded decide/assign state machine, LLM-extraction ingest verifier, real letter/ICS outputs, 13KB vs 2.8MB) — but ships it in a demo body that still commits the system's own documented sins: 29 sub-12px mono elements, zero ARIA, placeholder-only unlabeled controls, and a 7-column table crushed to 54–141px columns on mobile. If the judging criterion is "which would a law firm rather open," THEIRS wins; if it is "which result can be trusted without a backend or an LLM's cooperation," only OURS has an answer. On the visual brief of this task, the point goes to THEIRS.

## OURS — findings (all measured this run)

URL: `http://127.0.0.1:8923/open-artifacts/intake-queue/demo/index.html` (12.7KB HTML; runs offline, zero console errors, auto-processes demo queue on load).

**P1 — mono-label inflation, again.** Computed-style census: 17× 11.2px and 12× 11px elements (chips `urgent`, card keys `Submissions`, table headers `Id`), 60 elements total in Departure Mono; smallest text at 5.33–5.4:1 contrast. This is the same defect class the R5 audit logged (`design-system-font-size`, 38×) — unresolved here. The 11px `urgent` chip carries decision-critical information in the smallest type on the page.

**P1 — accessibility floor is at zero.** `ariaAttrCount = 0` across the page. No `<label>` elements: the Decide/assign and Letter-draft controls are four bare selects/inputs whose only labels are placeholder strings ("actor / assignee (required, fictional, e.g. gc-lee)"). Placeholder-as-label fails once typed over; screen-reader users get nothing. THEIRS ships 79–98 ARIA attributes on the same audit. Focus styles do exist and verify live (2px outline on `#run`), so the floor failure is specifically labeling/semantics.

**P1 — the entry surface is a JSON textarea.** The primary input is a 240px-min-height raw JSON blob. Nothing about the first screen teaches the tool: no per-enquiry card, no stage pipeline, no visual answer to "what needs a human now?" — the answer exists (stateRank sort) but is expressed as table row order. Compare THEIRS: first paint is a six-column pipeline with counts, aging ("No reply, 22 days"), and per-card next action ("Review 1 hit", "Decide").

**P2 — mobile is token-compliant but unusable-dense.** At 390px the queue table renders 7 columns in 342px (measured column widths 54–141px); `tokens.css` makes tables horizontally scrollable at ≤480px, so no overflow — but "Harbor Bakehouse Company" in a 91px column is a word-per-line stack. Page height 3837px mobile / 2793px desktop: one scroll for queue + decisions + letters + ICS + audit + verifier.

**P2 — no persistence, no ownership, no metrics.** Every decision lives in page memory; refresh erases the audit log. No actor/owner concept beyond a free-text "by" field. No insights view of any kind (THEIRS: "Enquiries logged 16 · Became matters 40% · Median time to first response Under 1 h", source funnel, per-stage medians).

**What OURS genuinely holds (undeniable, verified live):**
- **Conflict math is visible per row**: roster name, role, matter, matched side, score, alias provenance (`via alias "BPS Solarworks"`). THEIRS shows "1 hit" chips; the reasoning lives behind clicks and in Claude's hands.
- **Guarded state machine, verified**: escalate without reason → `Rejected: decision "escalate" on INT-1041 requires a reason`; valid escalate appends audit row (`2 | 2026-11-07 | gc-lee | decide | escalate INT-1041: waiting on partner sign-off`). Rejected actions write no audit entry (spec + observed).
- **Ingest verifier caught a one-letter mutation live**: `Ridgeline Dental Group PLLC` → `REJECTED — client name ... not found verbatim in source text ... flagged "unverified-extraction"`. This is a page-enforced guard against LLM extraction drift; THEIRS's equivalent guarantees live in a 2.3MB prompt protocol (`notes-for-claude`) that the page cannot enforce.
- **Real outputs**: engagement/declination letters with `[JURISDICTION]`/`[verify]` placeholders rendered on demand; working `.ics` download per deadline. 13KB, no backend, no LLM, no network beyond optional Google Fonts.

## THEIRS — findings (charitable read, measured weaknesses kept)

URL: `http://127.0.0.1:8923/_to_verify/New%20client%20intake%20%28Copy%29.html` (2.8MB single file, Anthropic Sans/Serif inlined, boots to sample project in ~6s, zero console errors).

**Strengths (conceded):**
- **Product surface OURS cannot match**: queues index; six-stage board (New 2 / Conflicts 3 / Decision 2 / Letter 3 / Signed 1 / Opened 2 / Declined 3 with "2 with no letter" warning); list view; insights with funnel + medians + source breakdown; enquiry side-sheet ("Who and what · 3 names", first contact, "Came from", "Still to find out", activity log); conflict index ("Checks search 255 names"); ownership select; CSV export; settings; "About $0.40 an enquiry" cost chip — a transparency gesture OURS has no equivalent of.
- **Domain depth is real**: ~245-name conflict index, realistic UK high-street-firm copy (practice-area criteria, £10k threshold, legal-aid routing, partner sign-off rules), full lifecycle including non-engagement letters and referral decisions with reasons. Sample data tells a coherent 14 Sep–17 Oct story.
- **Craft floor above ours**: 12px minimum type (vs our 11px), 79–98 ARIA attrs, 30 `:focus` rules vs our 2, 87 interactive elements on the detail view, app-shell that fits 935px with internal scroll (no 3800px scroll), responsive at 390px with no overflow.
- **Governance stance in the protocol**: "Never write conflict, checks, marks, screening, decision… a person runs the check, marks every hit and decides" — the LLM is structurally forbidden from deciding conflicts. Right instinct, honestly stated in-page.

**Measured weaknesses (kept, because facts are facts):**
- **Four WCAG AA failures at 12px**: cost pill "About $0.40 an enquiry" 2.48:1; "Drop it here, with your engagement letters." 2.48:1; footer disclaimer "Prepared with Claude; this is not legal advice…" 3.41:1; "14 Sep" 3.5:1 (plus placeholders at 3.59:1). Our smallest text measures 5.33:1+ — on contrast, OURS is strictly better.
- Two sub-24px touch targets (17px and 22px height buttons: index-line, cost pill).
- **Sample queue is read-only**: "This queue cannot be changed." The Conflict index view is unreachable from the sample (menu suggestions exist; clicks don't navigate there — three attempts, incl. direct DOM clicks). The advertised workflow (add enquiry from documents, screening, letters) requires the Claude/ArtifactData backend and cannot execute in a static browser; in this environment the CRUD surface is inert chrome.
- 2.8MB payload, boot skeleton, and first-paint dependency on JS state restore (first load briefly shows "app is-booting" skeleton marks).
- Letterhead is Anthropic's own fonts: it reads as a Claude demo of a firm tool, not the firm's tool. (Charitable read: it's a Claude artifact; that's the medium.)

## Scorecard (biased judging: OURS must prove)

| Dimension | OURS | THEIRS | Point |
|---|---|---|---|
| First-paint / information scent | JSON blob + dense table | pipeline board, aging, next actions | THEIRS |
| Type system | 29 elements <12px mono | 12px floor, coherent 12→22 scale | THEIRS |
| Accessibility semantics | 0 ARIA, no labels | 79–98 ARIA, labeled controls | THEIRS |
| Text contrast (WCAG) | min 5.1:1 | 4 failures 2.48–3.5:1 | **OURS** |
| Workflow / state depth | guarded decide/assign, audit | full matter lifecycle + insights | THEIRS |
| Trust / verifiability | page-enforced math + guards | prompt-protocol trust, read-only sample | **OURS** |
| Autonomy | 13KB, offline, deterministic | 2.8MB, backend- and LLM-dependent | **OURS** |
| Mobile | scrollable but 54px columns | app-shell, no overflow | THEIRS |

**4–4 on raw count, but the brief is visual: on the weighted visual axes THEIRS takes 5 of 8, and the axes it loses (contrast, autonomy, trust) are ones a demo viewer feels last.**

## Priority fixes for OURS (from this critique)

1. **[P1] Kill the 11/11.2px mono** in this demo — chips and card/table keys to ≥12px; this is the repo's own most-repeated finding.
2. **[P1] Label the controls** — real `<label>`s for d-id/d-action/d-by/d-reason and letter selects; add `aria-live` to the three error boxes and caption/scope to both tables.
3. **[P1] A "needs a human now" surface above the JSON** — a compact stage summary (counts + oldest waiting) derived from the existing stateRank sort; the data already exists.
4. **[P2] Mobile table** — collapse to 3 columns (Id / State / Parties) at ≤480px instead of scrolling 7.
5. **[P2] Persistence + ownership** — `localStorage` queue state; actor select instead of free text. Insights counts are already computable from audit + items.

## Evidence & caveats

- Shots (workspace `tmp/shots/to-inspect/intake-queue/`): `ours-initial/letter/guard/ingest/mobile.png`, `theirs-home/board/enquiry/insights/list/mobile/queues-home.png`. Note: a concurrent process also wrote `theirs-sample-*.png`, `theirs-home2.png` and overwrote `ours-initial.png` at 02:02 into the same directory; those files are not mine and I do not vouch for them.
- All numeric claims come from a Playwright computed-style census (font sizes, families, WCAG contrast of text vs nearest opaque ancestor, ARIA counts, focus/hover rule counts, geometry at 1440 and 390) run this session against both URLs; interaction claims (guard rejection, audit append, ingest rejection, letter/ICS render, insights/list/enquiry views) were each driven live and their outputs captured in this log.
- **Not verified:** pixel-level aesthetics (no vision analysis was available this run — screenshots are attached for human review); THEIRS's Conflict index view (unreachable in sample); THEIRS's live LLM workflow (needs Claude/ArtifactData backend); OURS cross-browser behavior beyond Chromium.
