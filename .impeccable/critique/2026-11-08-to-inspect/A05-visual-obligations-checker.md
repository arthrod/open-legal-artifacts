# A05 — Visual critique: Obligations checker

- **OURS**: `/open-artifacts/obligations-checker/demo/index.html` (demo + `core/core.js`, 311 lines)
- **THEIRS**: `/_to_verify/Obligations%20Checker%20%28Copy%29.html` — 2,155,113-byte single-file export; Foley & Lardner–branded app; inlined pdf.js 4.10.38 (~1.85 MB of the payload); seeded read-only sample contract ("Northwind Cloud services agreement", 9 pre-extracted obligations) via a `c4lSample` adapter.
- **Method**: headless Chrome (CDP), 8 full-page screenshots at 1440×1000 and 390×900, deviceScaleFactor 2, both sides live over `http://127.0.0.1:8923/`. Driver and cases are kept for reruns: `tmp/shots/to-inspect/obligations-checker/_driver.py`, `_cases.json`.
- **Stance**: adversarial against OURS, charitable to THEIRS.

## Verdict

**THEIRS wins, decisively.** Theirs is a credible law-firm product — multi-contract workspace, AI extraction from Word/PDF/pasted text (pdf.js + scanned-PDF reading up to 60 pages), key-date confirmation with cascade to derived deadlines, contract counting rules (first day, weekends, holidays), timeline + sortable table, mark-done tracking with history, notice drafting, professional disclaimer and Foley brand fidelity. OURS is a well-crafted deterministic register *calculator* wrapped in a developer-only JSON textarea: gorgeous, honest, tested — and unusable by the attorney it is named for. OURS keeps exactly three undeniable wins: a deterministic core with passing tests, `.ics` calendar export, and per-party monetary exposure rollup.

## Side-by-side findings

### 1. First run & shell
- OURS (`ours-default.png`): editorial page — Manrope headline, 56px highlighter-yellow rule, lede, mono-labeled JSON textarea, black "Build register" button. Auto-builds on load, so a register is visible immediately (good). Reads as a designer's spec artifact, not a working tool.
- THEIRS (`theirs-default.png`): app bar with brand + "Foley & Lardner" firm mark, blue `#0066ba` "Add contract" primary, contracts list with the Northwind sample, collapsible "How it works" in six plain-language steps, footer with a proper legal disclaimer ("Prepared with Claude… not legal advice… no attorney-client relationship"). Zero-radius `--r:0px` throughout matches the firm's aesthetic; CSS comments say colors were *measured from foley.com*.
- **Against OURS**: no onboarding, no disclaimer, no firm framing — for a legal-market artifact the missing disclaimer alone is disqualifying professionalism-wise.

### 2. Input model / workflow depth — the decisive gap
- OURS: the *entire* input UX is a raw JSON textarea. The user must hand-author ids, clauses, verbs, recurrence anchors, and a separate `satisfaction` array. Marking an obligation done means editing JSON and rebuilding. No file upload, no paste-contract, no persistence, no history, single register per page.
- THEIRS: upload Word/PDF/text or paste; Claude extracts every obligation, deadline, notice period, payment, renewal, termination right and survival term with clause quotes; key dates (Effective Date, term end) shown with derivations and cascade when corrected; counting rules default sensibly and are editable; obligations can be marked done with per-change history ("who made it"); notices drafted from the notice clause, with last-day-to-send per delivery method.
- For an artifact named *Obligations checker*, deadline computation **is** the product. OURS compares ISO date strings (`core.js` `buildRegister`); it has no business-day, holiday, first-day-counting, or notice-lead-time logic at all. That work is pushed onto the user.

### 3. Data model & information density (credit where undeniable)
- OURS register (from the live run, `asOf` 2026-11-08): OBL-1 overdue + breach-risk chip, OBL-6 satisfied with evidence and "(1 late)" rollup, OBL-8 recurring quarterly showing `2026-12-31 (+2 missed)` with computed exposure; by-party cards give Customer `2 / 1 / $54,000`. This monetary-exposure and missed-cycles math is real and visible; THEIRS' sample surfaces deadlines but no exposure rollup.
- THEIRS sample (`theirs-contract.png`, `theirs-table.png`): 9 obligations with clause quotes, key-dates panel with derivations, Timeline view + sortable Table view with color-coded left borders (bad/warn) and dimmed done rows, checkbox completion.
- **Against OURS**: one status-sorted table, no timeline visualization, no sorting, no grouping.

### 4. Hidden features / dead UI
- OURS `core.js` exports `toCSV`, `renderRegister`, `diffRegisters`, `renderDiff` — register drift between dates is a genuinely lawyer-valuable capability — yet the demo exposes **only** the `.ics` button. `toCSV` is assigned to `window.__csv` with no button (demo/index.html, run handler). The artifact's best ideas are invisible to anyone who doesn't read source.

### 5. Error & edge states
- OURS (`ours-error.png`): invalid JSON → red-tinted mono error box with the raw parser message ("Expected property name or '}' in JSON at position 2…"). Honest and styled, but no schema hint, no line pointer, no recovery affordance.
- THEIRS: labeled read-only states in the sample db (`noDb` / `mayEdit` / `mayNotEdit` strings), banner + scrim + sheet + toast components exist in the shell. Not exhaustively exercised (see *Not verified*).

### 6. Mobile
- OURS (`ours-mobile.png`, 390px): the 6-column 13px table collapses into a horizontal-scroll slab (tokens.css `@media (max-width:480px)` overflow rule) — technically scrollable, practically punishing. Everything else stacks fine.
- THEIRS (`theirs-mobile.png`): responsive app layout, appbar and cards adapt; no obvious breakage.

### 7. Craft, typography, load
- OURS: high craft — Departure Mono (self-hosted) + Manrope, hairlines, highlighter accent, hover states, focus-visible outlines. But the tokens file literally opens with "Arthur Rodrigues — **Personal Site** Design Tokens": a personal brand wearing a legal tool. Also a Google Fonts `@import` (network dependency) inside an otherwise self-hosted demo.
- THEIRS: system Helvetica stack (no webfont cost), consistent soft grays, status colors with tint pairs, real elevation (scrim + shadow on sheet). Restrained and firm-credible. Cost: 2.1 MB single file, ~1.85 MB of it pdf.js — but that buys in-browser PDF + scanned-page reading.

## Where OURS is genuinely better (all verified this session)
1. **Determinism & tests**: `node --test core/core.test.js` → 30 pass / 0 fail (ran it). Same input → same register, no LLM in the loop. THEIRS' extraction is Claude-dependent and nondeterministic by construction; the shipped sample is pre-extracted.
2. **`.ics` export**: one VEVENT + reminder per open dated obligation. No calendar export visible anywhere in THEIRS.
3. **Exposure math**: per-party open/overdue/$-exposure cards; missed recurrence cycles counted. Absent in THEIRS.
4. **Weight**: ~9 KB demo + 311-line core vs 2.1 MB. Instant first paint.

## Where OURS loses hardest (ranked)
1. JSON textarea as the only input — unusable by the target user.
2. No deadline *computation* (counting rules, notice periods, business days) in a deadline product.
3. No persistence, no mark-done, no history, no multi-contract.
4. Best core features (diff, CSV, markdown render) not surfaced in the demo.
5. No legal disclaimer / firm framing; personal-site token inheritance.
6. Mobile table; no timeline view; no sorting.

## Scores (adversarial scale)

| Dimension | OURS | THEIRS |
|---|---|---|
| First-run credibility & shell | 5 | 9 |
| Input / workflow depth | 2 | 9 |
| Domain logic (dates, notices) | 3 | 9 |
| Information design (register itself) | 7 | 8 |
| Determinism / trust | 9 | 6 |
| Visual craft | 8 | 8 |
| Mobile | 5 | 8 |
| Engineering weight | 9 | 5 |
| Legal-market professionalism | 3 | 9 |

## Shot index — `tmp/shots/to-inspect/obligations-checker/`
`ours-default.png` · `ours-error.png` · `ours-mobile.png` · `theirs-default.png` · `theirs-contract.png` · `theirs-table.png` · `theirs-ask.png` · `theirs-mobile.png`

## Not verified / limits
- THEIRS' AI features (extraction from a real upload, Ask answers, notice drafting) need a live Claude environment; the exported copy runs the read-only sample adapter. Judged from shell, seeded data, and code inspection only.
- Keyboard/a11y audit, THEIRS' add-contract flow with a real DOCX/PDF upload, and OURS' `.ics` output correctness in a calendar client were not exercised.
- OURS core tests were run (30/0); THEIRS has no runnable test surface in the export.
