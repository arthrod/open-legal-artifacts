# Visual Inspector — run aab1079c participant 1

**Method / evidence base.** Assessment A (design review), second run. Pixels read: all six `tmp/shots/wave7/*` and the `tmp/shots/dogfood/` trail (01–11, 1280×900). Source read to verify every claim I make below: `app/src/pages/index.ts`, `header.ts`, `styles.css`, `app/src/data/*`, `vt-val/index.http.tsx`, `vt-val/site/cite-check.html`, `vt-val/site/limitations-radar.html`, `artifacts/client-intake/demo/index.html`, `vt-val/course/{index.html,css/*,js/app.js}`, `DESIGN.md`. Prior run (`evidence/impeccable-critique-round6.md`) used only to know what is closed; no detector output consulted.

**Course capture caveat, stated up front:** `wave7/course.png` still shows the dark CTA band + `CONTACT →` that round 6 asked to kill; `wave7/course-lesson1.png` and `dogfood/09-course-lesson.png` do not, and the repo (`vt-val/course/js/app.js`) has no CTA and does have the "whole course" proof list. I scored the re-skin as **closed** on the two later captures, and treat `course.png` as a stale capture — an evidence-hygiene note, not a finding.

---

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Result counts, empty state, hash state, "Checked 8 of 10 … never reported as confirmed" are strong. But no page anywhere marks its own nav item (`styles.css:183-200` defines only `:hover`; `header.ts` has no `aria-current`), and the 404 reports nothing at all. |
| 2 | Match System / Real World | 2 | Machine enums printed as user-facing status: `NOT_FOUND`, `deadline_passed_unfiled`, `data_needed`, `filed_timely`; internal process words in a client-facing rail (`4 · confirm gate`, `5 · firm record`). |
| 3 | User Control and Freedom | 2 | Exits are good where they exist (clear-filters, reset-to-draft per field, two-step confirm, "nothing is saved until you confirm"). The 404 has no exit at all — `vt-val/index.http.tsx:112` returns a bare text body. |
| 4 | Consistency and Standards | 1 | Unchanged, and now measurably so: three chrome systems for one product (light 5-item nav / black sticky back-bar / course wordmark+progress+A-A+), plus a fourth surface with no chrome at all, and the same verdict printed as `NOT_FOUND` in the table and `not found` in the summary directly above it. |
| 5 | Error Prevention | 2 | Determinism ("never guessed") is real prevention. But a mistyped URL yields a dead document, and the free-text `mm/dd/yyyy` field in an already-"Urgent" intake has no constraint or hint. |
| 6 | Recognition Rather Than Recall | 3 | The search field names exactly what it indexes ("title, tagline, counterpart"), filters are visible, groups are labelled, focus returns with the caret preserved (`index.ts:34-49`). Docked for unlabelled group counts (`5`, `11`, `4`) and for having to carry "2 pinpoint issues" from the summary down a table that only tints one of them. |
| 7 | Flexibility and Efficiency | 2 | Deep-linkable state (`#/?area=…&q=…`), exports (md/json/ics/csv), keyboard focus restore. No keyboard shortcut to reach search, no sort, no bulk, no saved view. |
| 8 | Aesthetic and Minimalist Design | 3 | One accent, zero radius, hairline lattice, no shadow/gradient/glass — genuinely restrained. Wasted by repetition: the caveat "proposition support is an LLM/human judgment — not evaluated by this core" is printed under all ten evidence cards, and the re-skinned course lists all ten lessons twice. |
| 9 | Error Recovery | 3 | Best-in-class within the tools: "Pinpoint p. 15 → mismatch: pinpoint says p. 15 but the quote is located on 12"; "Flag: unknown jurisdiction ZZ — no ruleset loaded"; "best candidate similarity 0.26 below threshold 0.7". None of it suggests a next step, and none of it exists on the 404. |
| 10 | Help and Documentation | 1 | No tooltip, legend, glossary or keyboard help anywhere. `pinpoint`, `accrual`, `tolling`, `rules-as-data`, `char offsets` are never defined. The course is the closest thing to help and is presented as a card, not as help. |
| **Total** | | **22/40** | **Acceptable — significant improvements still needed** (prior run: 21/40) |

**Why only +1.** Two real gains (search/filter/deep-link → Recognition; honest coverage language → Status) were offset by two things this run put on the record for the first time: the 404 (caps Control) and the enum-vocabulary leak (drops Match from 3 to 2). Consistency did not move at all. The work happened; the score didn't, and the reason is that the fixes were local and the *seams between surfaces* were never touched.

---

## Cognitive Load

**6 of 8 fail** (prior: 7/8).

| Item | Verdict | Evidence |
|---|---|---|
| Single focus | **Fail** | The primary task ("find the artifact for my problem") is a 40px search box that sits *below* the hero and the four originals cards — two full screens of portfolio pitch before the control that does the job. |
| Chunking ≤4 | **Fail** | Groups themselves are now clean (intake: 3/3/2/2 ✓). Decision points are not: 9 chips (ALL + 8 areas) in one row, 6 stat boxes in cite-check's summary, 3–5 equal-weight links per tile. |
| Grouping | **Pass — flipped** | The hairline lattice + reader-question heads + intake block heads now group by proximity *and* label. This is the item the last pass actually fixed. |
| Visual hierarchy | **Pass** (weak) | Detail pages read top-down cleanly. The landing still opens on a brand statement rather than the index, and eight chrome roles share one size (11px mono: `group-title`, `group-count`, `tile-meta`, `chip`, `prov`, `filter-btn`, `result-count`, `backlink`), so hierarchy has almost no *depth*. |
| One thing at a time | **Fail** | Intake step 3 is still 12 fields in one scroll, each carrying its own accept/rewrite decision + a reset link + a status tag. Chunked, not sequenced. |
| Minimal choices ≤4 | **Fail** | 9 filter chips; 5 links on the PII tile (`INTERACTIVE DEMO (RULES-BASED) · HF DEMO · OFF · GLINER · REPO`) against 3 on its neighbours, none marked primary. |
| Working memory | **Fail** | The intake's "N rewritten — review these:" line renders five question *labels* as mid-dot-separated links on one line (`client-intake/demo/index.html:341-342`) — that's a memory bridge dressed as a summary. In cite-check you carry "2 pinpoint issues" from the top to a table that only marks the first adverse row. |
| Progressive disclosure | **Fail** | Nothing collapses. The full JSON is exposed at rest in limitations radar, all ten evidence cards are always expanded, all 33 tiles always render. |

---

## AI Slop Verdict

**Fails the second-order test; passes the first.** Nobody looking at this would say "generic AI landing page" — there is no cream hero, no gradient text, no glass card, no three-up icon grid, no "01/02/03" scaffolding, no `border-radius: 32px`. What it *is* is the 2025–26 **specimen/editorial-mono** house style, and it is exactly the answer you'd guess if you asked "developer-facing legal-artifact catalog that isn't SaaS-cream and isn't terminal-dark": near-white `#fafaf8`, hairline `#e8e8e5` lattice, Departure Mono micro-labels, one highlighter yellow, zero radius, `/ SECTION` kickers. That's the reflex one tier deeper, and the design system document confesses it — `DESIGN.md` defines the whole identity in one line ("specimen-white surface, one highlighter accent, hairline lattice, zero radius") and `cite-check.html:24` annotates the accent `/* highlighter yellow — structural, never textual */`, which is the sound of a system guarding against a default it chose anyway.

Two scaffolds recur at ban-level frequency: a **tiny uppercase tracked mono eyebrow above every section** (`/ ORIGINALS — ARTHUR'S PROJECTS`, `/ OPEN REIMPLEMENTATIONS`, `/ EXTERNAL CATALOG`, `/ LESSONS`, `/ AFTER THE COURSE`, `SUMMARY`, `EVIDENCE — LOCATED QUOTES & FLAGS`), and the **zero-padded number** (`01`–`10` in the course's `.num`). Each is defensible alone; the uniform reflex across every surface is the tell.

Execution is the redeeming half: alignment, hairlines, and the accent's discipline are better than most hand-built sites. This is *crafted* slop, not careless slop — which is why it reads as "a designer's house style" rather than "a model's output", and why the next pass should attack the *seams* (below), not the aesthetic.

---

## What's Working

1. **The search is honest and the empty state is a proper state.** `04-empty-state.png`: `0 OF 33 · DEADLINES · MATCHES “ZZZZ”`, then "No matches for 'zzzz' in Deadlines." plus exactly one escape. Counts update on filter, state lives in the hash, focus and caret survive the re-render (`index.ts:37-49`). This is the fix that moved the score, and it moved the right heuristic.
2. **Cite-check's coverage language is the best copy in the product.** "Checked 8 of 10 quotes — 2 could not be checked and are never reported as 'confirmed'; 2 pinpoint issues." A tool that reports the boundary of its own competence is the most credible thing a legal-AI artifact can do, and this one does it in one sentence.
3. **The disclaimer-as-reassurance inversion is fixed.** In `limitations.png` the caveat — "Deadlines computed from illustrative example rulesets; limitations law is full of exceptions and accrual disputes. Verify every deadline with counsel before relying on it." — now sits directly under the deadlines, at the point of stakes, inside a bordered block. Round 6 scored this as "the quietest text on every page". It no longer is. "saved by 18 days" / "expired 656 days ago" also speaks in the unit a lawyer actually feels.

---

## Priority Issues for the Next Pass

### [P1] The 404 is a bare text string — the catalog's largest surface is undesigned

**What.** `vt-val/index.http.tsx:112`: `return new Response("Open Legal Artifacts — not found", { status: 404 })`. `dogfood/10-404.png` shows the result: browser-default serif, one sentence, top-left, 900px of nothing, no wordmark, no nav, no search, no link home.
**Why it matters.** This is a link-distribution product — 33 outbound tile links, five external artifacts, an open-source repo, LLM crawlers citing paths. Mistyped, truncated, or stale URLs are not an edge case here; they're a normal traffic pattern. The single moment a visitor is most likely to be an ally (someone following a shared link) is the moment the design system stops existing. Emotionally it reads "abandoned project" — the exact opposite of everything the catalog is working to prove.
**Fix.** Real HTML 404 inside the shell: header + nav, the search field pre-filled with the bad path's last segment, the three closest catalog titles as a "did you mean" list (the index is already in memory client-side), and `← Catalog`. One component, reused.
**Suggested command:** `$impeccable harden`

### [P1] One click off the catalog and the navigation dies

**What.** The 5-item nav exists only in the app shell. Every promoted destination replaces it: cite-check/limitations/client-intake use a hardcoded black sticky bar (`cite-check.html:194`, inline `#0a0a0a`, not a token); the course uses a fourth header (wordmark + 10-segment progress + A/A+). No surface anywhere marks the current item — `styles.css:183-200` defines `nav a::after` only for `:hover`, and `header.ts` emits no `aria-current`.
**Why it matters.** The nav promises one app with five rooms. The reality is one catalog plus four standalone documents in three visual languages, and the moment a user takes the catalog's primary action ("INTERACTIVE DEMO ↗") the map is taken away — you cannot go from Cite check to Chronology without returning to `/`. This is why Consistency is still 1/4 after a pass that explicitly targeted demo chrome: the chrome got tokenized *inside each page*, not unified *across* pages.
**Fix.** One shell component (nav + backlink + current-item state) rendered on all five surfaces, including the course; `aria-current="page"` on the active item; the black bar becomes a token (`--text`) or dies. Then decide the IA honestly: if these four are demos, they are not the nav.
**Suggested command:** `$impeccable layout`

### [P1] The interface prints its database keys

**What.** `cite-check.html:266` interpolates `${r.classification}` raw → the table shows `NOT_FOUND` while the summary eight lines above shows `not found` (`:246`). `limitations-radar.html:257` interpolates `${c.status}` raw → `filed_timely`, `deadline_upcoming`, `deadline_passed_unfiled`, `data_needed`. The intake rail hardcodes `4 · confirm gate` and `5 · firm record` (`client-intake/demo/index.html:228-229`). Meanwhile the intake *does* have human labels — "draft accepted" / "rewritten" — so the system already knows how to do this.
**Why it matters.** The product's entire claim is "never guessed, deterministic, auditable". A status that reads like a column name tells the reader they're looking at a debug build, and it breaks the one thing legal users must be able to do instantly: rank severity. It's also the cheapest high-yield fix on this list — a label map per enum, ~30 lines, and the perceived quality of three pages jumps.
**Fix.** One `STATUS_LABEL` map per enum, rendered everywhere; nothing underscored reaches the DOM as text. Use the promise-shaped phrasing you already own: `not_found` → "not in the record", `data_needed` → "no rules for ZZ", `deadline_passed_unfiled` → "past deadline, not filed". Keep the key in a `data-` attribute.
**Suggested command:** `$impeccable clarify`

### [P2] The three verdict languages disagree — and the dangerous error is the quiet one

**What.** Cite-check tints **only the first** adverse row (`cite-check.html:262-264`: `adverse && !firstFlagDone`). Limitations tints **every** hard failure and leaves soft flags as amber outline badges (`:255-256`). Same product, two contradictory rules, neither stated to the reader. Meanwhile `NOT_FOUND` (black pill + tint + black `UNVERIFIABLE` pill) shouts, while `MISMATCH` — a real quote cited to the wrong page — gets a black pill and no tint.
**Why it matters.** A quote that exists but is cited to the wrong page is the more serious defect for a lawyer (it's a misrepresentation risk, not a gap), yet the design ranks it below "not found". And because only one row is tinted, the untinted `MISMATCH` rows silently read as "fine" — the table teaches a false negative.
**Fix.** One rule, stated once: every adverse row tinted, ink ordered by consequence (`mismatch` ≥ `not_found`), and a line above the table — "2 issues · jump to first" — so the number at the top has a destination. If you keep the single tint, label it ("start here") instead of leaving it unexplained.
**Suggested command:** `$impeccable polish`

### [P2] The repetition tax: the rigour becomes a wall

**What.** All ten evidence cards end with the same sentence — "proposition support is an LLM/human judgment — not evaluated by this core" — and most repeat "Pinpoint p. 12 → ok: quote is located on 12". The re-skinned course renders the same ten lessons twice on one page: the interactive list at `/ LESSONS` and again as `/ THE WHOLE COURSE` (~400px of duplicate rows, `course-lesson1.png`). The landing puts the same four artifacts in a promo grid *and* in the grouped index.
**Why it matters.** Repetition is precisely how a page that means to feel rigorous comes to feel padded. The reader's eye learns to skip the block that contains the actual finding, because nine times out of ten it contains boilerplate.
**Fix.** Hoist the caveat once to the section head; collapse per-quote rationale behind the row in question; give the course one list (progress rail) and let the second become a real artifact — a completion record — or delete it. Same for the originals block: it and the index's `/ ORIGINALS` group are the same content, twice.
**Suggested command:** `$impeccable distill`

---

## Emotional Journey

**Peaks.** (1) The search working on the first try, with a count that updates and an empty state that respects you — a small, real relief. (2) Cite-check's pinpoint catch: "pinpoint says p. 15 but the quote is located on 12." Twelve words that make a lawyer feel supervised rather than replaced — the product's highest point and it is buried in card 5 of 10. (3) Limitations radar's day-counts ("saved by 18 days", "expired 656 days ago") — the only place the product speaks in human consequence instead of schema.

**Valleys.** (1) The first five seconds: a 45-word sentence with two em-dash asides and three undefined terms *before* the reader learns what the site is for. (2) The trust cliff: an immaculate wrapper around 33 one-line taglines and three outbound links — the presentation outclasses the evidence, and nothing on a tile answers "who verified this?" (3) **New:** the 404 — the floor falling out. (4) The re-skinned course now ends on "Run the tools → / Read the source ↗" instead of a `CONTACT` pitch, which is a genuine improvement — but its second lesson list makes you scroll past the same ten titles to get there.

The arc currently peaks at the *demo* and dips at the *door*. Fixing the 404 and the nav seam is, emotionally, the difference between "an impressive person's site" and "a product".

---

## Persona Red Flags

**Alex (power user).** No keyboard path to search (no `/` or `⌘K`); no sort, no density control, no saved filter despite deep-linkable state that would make it trivial. From any demo, "back to catalog" is one full page-load away — no quick switcher between the four checking tools, which is exactly the loop a power user works in.

**Jordan (first-timer).** The hero's third word is "deterministic cores". The intake rail's step 4 says `confirm gate` and step 5 says `firm record` — neither is a thing a client believes they are doing. The tile link row offers three to five identical-looking exits with no recommendation, so the first decision on the page is a guess. In cite-check, `NOT_FOUND` reads as an error code unless you already know the vocabulary.

**Riley (stress tester).** Refresh mid-intake: state is in-page only, so the review work is gone (the two-step confirm protects the *record*, not the *draft*). A truncated shared link lands on the bare 404 with no recovery. Paste 1,000 claims into the JSON box and the column becomes an unmarked scroll region with no count of what's visible.

---

## Minor Observations

- The anchor column drops its unit: table renders `page 12 198–295` (`cite-check.html:258`) while the card below renders `chars 198–295` (`:275`). Reads as a page range, in the one column the artifact exists for.
- The status palette was forked, not tokenized: `DESIGN.md` declares `#15803d/#b45309/#b91c1c` and `flag-tint #fffbe6`; shipped cite-check carries `--ok:#1b6b2f --warn:#8a6d00 --bad:#b3261e --flag-tint:#f2e9d0`. A fix that looks done and isn't.
- `data_needed` and `deadline_upcoming` share `--warn` (`limitations-radar.html:184-185`) — "we can't compute this" and "you have time but be careful" are the same colour.
- `4px solid var(--accent)` is the tile's provenance mark ("this one is Arthur's") *and* every claim card's decoration (`limitations-radar.html:180`) — so the accent that means "original work" on the catalog means "nothing to report" one click later, then flips to black for failure.
- Course hero: `.h1{max-width:16ch}` at `clamp(35.2px, 6vw, 54.4px)` gives a four-line display headline in a ~600px column with ~600px of empty viewport to its right (`09-course-lesson.png`). The re-skin is on-brand; the composition isn't.
- Group counts (`5`, `11`, `4`) still carry no unit — of 33? of this group?
- Nine chips at one decision point when four reader-question groups already exist as the better axis.

---

## Questions to Consider

1. If the four nav items are demos, why are they the *nav*? What if the top-level navigation were the four reader questions — "I have a contract", "I have a case or a deadline" — the axis you already built, then demoted to a display mode that vanishes the moment you filter?
2. Which number is the product's number: 4, 33, 5, or 0? Four different counts are on screen simultaneously and not one of them is framed as the claim. What would this page look like if it committed to one?
3. If "never guessed" is the promise, why does the interface speak in guess-shaped vocabulary (`NOT_FOUND`, `data_needed`) instead of promise-shaped vocabulary ("not in the record", "no rules for ZZ")?
4. What if the hero were the cite-check mismatch — the single most convincing twelve words you own — instead of a paragraph describing it? The artifact is stronger than its own marketing.
5. Does a tile need three exits, or one proof? What would a catalog look like where every card carries a live pass/fail the reader can run in ten seconds, instead of three links out?
6. What happens at the thirty-fourth artifact? If the answer is "another tile", the template is the ceiling — what is the second reading mode that isn't "more tiles"?

---

Status: DONE_WITH_CONCERNS
Session: assessment-A (design review, second critique — no sub-agent isolation available in this context; Assessment A only, by assignment)
Report: inline above (answer text only, as requested); no file written
Counts: P1/3 · P2/2 · minors/7
Top findings: bare-text 404 with no exit; one click off the catalog kills the nav and no surface marks its own location; raw enum keys printed as user-facing status; three verdict-emphasis rules that disagree and under-rank pinpoint mismatch; repetition tax (10× caveat, duplicated lesson list)
Gaps: no live browser this run — responsive behaviour, hover/focus rendering, console, and keyboard traversal are judged from source and the existing captures, not re-observed; `wave7/course.png` contradicts the other two course captures (scored the CTA removal as closed on `course-lesson1.png` + `dogfood/09` + source, but I cannot say which build is deployed); cite-check appears in two implementations (`app/src/pages/cite-check.ts` and `vt-val/site/cite-check.html`) with different ledes, counts, and chrome — I reviewed the standalone one the captures show and did not audit the in-app variant.