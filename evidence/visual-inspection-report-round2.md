# Visual Inspector — run f6778d9e participant 4

Evidence gathered and cross-checked. Here is the report.

---

# Dogfood Report: Open Legal Artifacts (arthur.law open-source catalog) — Visual Inspection, Round 2

| Field | Value |
|-------|-------|
| **Date** | 2026-11-07 |
| **App URL** | https://arthrod--4075ab70dae211f1929a1607ee4eb77e.web.val.run/ |
| **Session** | dogfood-visual-round2-20261107 |
| **Scope** | Landing + 5 artifact pages (Cite check, Eviction notice check board, Privilege log builder, Regulatory horizon scan, Limitations radar). Token conformance, render integrity, layout, type, contrast, overflow at 1280px. |
| **Method** | Static pixel review of 6 supplied PNGs (1280×2400, real Chrome UA, Cloudflare-clean). Every PNG was read and judged in-session; source HTML in the workspace used only to test root-cause hypotheses and to confirm intended copy — never as substitute evidence. No live browser, no clicks this round (declared below as a coverage gap). |
| **Verdict** | **FAIL** — design/token layer holds; the artifact "interactive demo" requirement fails on **5 of 5** pages. |

## Page-by-page verdict

| Page | Tokens | Layout/render | Required behavior | Verdict |
|------|--------|---------------|-------------------|---------|
| Landing (`/`) | Pass | Pass (one dead tile) | hero + yellow rule + counts + card groups present | **PASS WITH FIXES** |
| Cite check | Pass | **Empty sections** | demo prefilled + 9-quote worked example — **absent** | **FAIL** |
| Eviction notice check board | Partial (native widgets) | Empty card parts | prefilled worked example — **absent**, no attestation boxes | **FAIL** |
| Privilege log builder | Pass | Empty input | prefilled worked example — **absent** | **FAIL** |
| Regulatory horizon scan | Partial (H1 off-system) | Empty sections | label says "prefilled", input **empty** | **FAIL** |
| Limitations radar | Pass | Empty input | prefilled worked example — **absent** | **FAIL** |

## Design-token conformance audit

| Token / rule | Expected | Observed | Result |
|---|---|---|---|
| Background | `#fafaf8` | Warm off-white on all 6 pages, consistent | ✅ |
| Text | `#0a0a0a` | Near-black headings/body | ✅ |
| Secondary | `#6b6b6b` | Body copy reads mid-grey, consistent | ✅ |
| Accent `#ffd400`, structural only, never text | 2×56px rules + tile stripes | Rule under every H1; 4px stripe across each ORIGINALS tile row. **No yellow text anywhere.** One extra pattern found (see ISSUE-010) | ⚠️ 1 deviation |
| Hairlines `#e8e8e5` | 1px | Section rules, card borders, table headers present and hairline-thin | ✅ |
| Type: Manrope body + Departure Mono labels | Body/labels split | Landing and 4 of 5 artifact H1s in Manrope; labels in mono | ⚠️ 1 page off (ISSUE-008) |
| Radius 0 | No rounded corners anywhere | Zero radius on cards, tiles, buttons, inputs; only native browser widgets round nothing | ✅ |
| Max-width 1100px | 1100 | Catalog content ≈1021px (40px gutters), artifact content ≈1047px (~26px gutters) — both ≤1100, but the templates disagree (folded into ISSUE-005) | ⚠️ |
| Landing counts | `4 originals · 33 open artifacts · 5 external` | `4 ORIGINALS · 33 OPEN ARTIFACTS · 5 EXTERNAL` rendered under the hero | ✅ |
| Mojibake / raw HTML / unstyled fallback | None | None. Em dashes, `→`, `‹›`, `–` all render correctly; no stray markup | ✅ |
| Overflow at 1280 | None | No horizontal scrollbar, no clipped text, no pushed-off elements on any of the 6 captures | ✅ |

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 1 |
| Medium | 7 |
| Low | 3 |
| **Total** | **11** |

---

## Issues

### ISSUE-001: Every artifact demo loads with no prefilled example and no output — the demo layer is dead on all five inspected pages

| Field | Value |
|-------|-------|
| **Severity** | high |
| **Category** | functional |
| **URL** | base URL + one of: Cite check / Eviction notice check board / Privilege log builder / Regulatory horizon scan / Limitations radar |
| **Repro Video** | N/A — static captures this round (no live browser); see "Gaps" |

**Description**

The product promise on every artifact page is a *working, prefilled deterministic demo*. On all five pages the static chrome renders and every JS-populated region is empty:

| Page | What should be there | What is there |
|---|---|---|
| Cite check | Summary counts, 9-quote results table | `SUMMARY` heading → nothing → two buttons; `EVIDENCE — LOCATED QUOTES & FLAGS` → nothing |
| Eviction | Prefilled jurisdiction/method/type/dates, attestation checklist, verdict board | All selects and dates blank, checklist labels present but **no boxes**, `CHECK BOARD` → nothing |
| Privilege log | Prefilled document-set JSON, draft log | Empty textarea; `DRAFT PRIVILEGE LOG` → "Press 'Build draft log'." |
| Regulatory | Prefilled feed JSON, ranked table, timeline, diff | Empty textarea; table = **header row only**; timeline empty; diff empty |
| Limitations | Prefilled claims JSON, deadlines table | Empty textarea; `DEADLINES` → "Press 'Run radar'." |

This is a load-time failure, not a styling one: the containers exist with correct tokens and zero content, which is the signature of a client script that never ran (all five pages build their demo from a `<script type="module">` import of a `data:text/javascript;base64` module and self-click their run button at the end of the module).

**Root cause — hypothesis, explicitly not verified this round:** module never executes (blocked/failed `data:` ESM import, most likely a host CSP, or a parse error). Confirming it needs the browser console, which this round did not have.

**Repro steps**

1. Open the landing page (catalog). — ![Landing](tmp/shots/landing.png)
2. Open the *Cite check* artifact. **Observe:** `SUMMARY` region is empty above the export buttons; `EVIDENCE — LOCATED QUOTES & FLAGS` is a heading over blank space. — ![Cite check](tmp/shots/cite-check.png)
3. Open *Eviction notice check board*. **Observe:** every field blank, no attestation checkboxes, `CHECK BOARD` empty. — ![Eviction](tmp/shots/eviction.png)
4. Open *Regulatory horizon scan*. **Observe:** feed textarea empty, `RANKED SCAN` table has a header and no rows, timeline/diff empty. — ![Regulatory](tmp/shots/regulatory.png)
5. Open *Privilege log builder* and *Limitations radar*. **Observe:** empty JSON textareas, "Press 'Build draft log'." / "Press 'Run radar'." as the only feedback. — ![Privilege](tmp/shots/privilege.png) · ![Limitations](tmp/shots/limitations.png)

---

### ISSUE-002: Enabled "Export" buttons on Cite check and Regulatory with nothing to export

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | ux |
| **URL** | Cite check, Regulatory horizon scan |
| **Repro Video** | N/A (static) |

**Description**

Cite check shows a solid black primary button `Export report.md` and a ghost `Export output.json` directly under an empty `SUMMARY`; Regulatory shows `Export CSV` next to `Run scan`. Both pages present export actions as ready while no result exists anywhere on screen. A user's first action on the page is the one most likely to fail silently or hand back an empty file. The primary (black) treatment actively asserts "there is a report here".

*Click behavior was not exercised this round* — the finding is the enabled-with-no-data state, which is visible in pixels.

**Repro steps**

1. Open *Cite check*. **Observe:** `SUMMARY` heading, blank space, then `Export report.md` / `Export output.json`. — ![Cite check](tmp/shots/cite-check.png)
2. Open *Regulatory horizon scan*. **Observe:** `Export CSV` enabled beside an empty ranked table. — ![Regulatory](tmp/shots/regulatory.png)

---

### ISSUE-003: Regulatory page claims "PREFILLED WORKED EXAMPLE" over an empty input

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | content |
| **URL** | Regulatory horizon scan |
| **Repro Video** | N/A (static) |

**Description**

The section heading reads `FEED INPUT (JSON — PREFILLED WORKED EXAMPLE)` (mono, uppercase, deliberate). The textarea beneath it is completely empty. The page contradicts itself in the space of 40 pixels, and it is the only artifact page that makes the prefilled promise in its own copy — so the promise is both unkept and self-indicting. Same contradiction applies to the footer claim that a scanned example exists.

**Repro steps**

1. Open *Regulatory horizon scan*. **Observe:** label at ~1/6 page height, empty textarea directly below. — ![Regulatory](tmp/shots/regulatory.png)

---

### ISSUE-004: Eviction demo has no attestation checkboxes and no usable default state

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | functional |
| **URL** | Eviction notice check board |
| **Repro Video** | N/A (static) |

**Description**

The `NOTICE FACTS` card shows the instruction "Required contents — attest what you see on the notice (leave unverified if unsure)" with **no checkbox list** underneath — only the sentence, then the `Check notice` button. The three `Jurisdiction` / `Service method` / `Notice type` selects render as empty boxes with a chevron and no placeholder option, so they read as unloaded rather than empty-by-choice. Two of the six fields are native `type=date` blanks showing `mm/dd/yyyy`. Even ignoring ISSUE-001, a first-time user has no worked example to inspect and no way to tell what a valid notice looks like.

**Repro steps**

1. Open *Eviction notice check board*. **Observe:** instruction line above `Check notice` with no boxes; three blank selects; two blank date fields. — ![Eviction](tmp/shots/eviction.png)

---

### ISSUE-005: Artifact pages are dead ends — no site nav, no breadcrumb, no back link

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | ux |
| **URL** | all five artifact pages |
| **Repro Video** | N/A (static) |

**Description**

The catalog carries a sticky header with a mono wordmark and a five-item nav (`CATALOG  CITE CHECK  DEVIATION BOARD  CHRONOLOGY  TABULAR REVIEW`). None of the five artifact pages carries that header, and none shows a breadcrumb, back link, or footer navigation. What sits at the top instead is small mono metadata (`OPEN·LEGAL·ARTIFACTS  ·  DETERMINISTIC CORE`, `OPEN LEGAL ARTIFACT · ORIGINAL IDEA · DETERMINISTIC CORE`, `open·legal·artifacts.exe`, or nothing at all), which reads as a label, not a control. The only way back is the browser's back button — for a catalog whose entire value is browsing 33+ artifacts, that is a navigation dead end.

Secondary evidence of the same template drift: catalog content sits in 40px gutters (≈1021px), artifact content in ≈26px gutters (≈1047px), so the left edge shifts ~13px between landing and every artifact page.

**Repro steps**

1. Open the catalog. **Observe:** header bar with wordmark + 5 nav items. — ![Landing](tmp/shots/landing.png)
2. Open any artifact. **Observe:** no header, no nav, no back affordance; content starts higher and wider. — ![Cite check](tmp/shots/cite-check.png) · ![Privilege](tmp/shots/privilege.png) · ![Eviction](tmp/shots/eviction.png)

---

### ISSUE-006: Legal disclaimer footer missing on three of five artifact pages

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | content |
| **URL** | Eviction notice check board, Privilege log builder, Limitations radar |
| **Repro Video** | N/A (static) |

**Description**

Cite check and Regulatory close with the grey disclaimer ("Deterministic core … All example data fictional. Not legal advice. anthropic counterpart: …"). Eviction, Privilege log builder and Limitations radar end with nothing — no disclaimer, no footer at all within the full 2400px capture. On a site whose products output eviction verdicts, privilege logs and limitations deadlines, presenting three pages without the "not legal advice / fictional data" line is a consistency and liability gap, not cosmetics.

**Repro steps**

1. Open *Cite check*. **Observe:** disclaimer paragraph closing the page. — ![Cite check](tmp/shots/cite-check.png)
2. Open *Limitations radar*. **Observe:** page ends at "Press 'Run radar'." — no footer. — ![Limitations](tmp/shots/limitations.png)
3. Same for *Privilege log builder*. — ![Privilege](tmp/shots/privilege.png)

---

### ISSUE-007: Landing — an unlabeled grey tile sits inside the ORIGINALS grid

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | visual |
| **URL** | / (landing) |
| **Repro Video** | N/A (static) |

**Description**

The ORIGINALS group is a 3-column tile grid: row 1 holds Client Intake / Contracts Playbook / Prompting for Attorneys, each with a 4px yellow top stripe, mono `ORIGINAL` + repo slug header, title, body and mono links. Row 2 holds Pil pt-BR / LGPD in column 1, and columns 2–3 are a single flat light-grey block (`#f0f0ee`-family, the hover token) with **no stripe, no label, no content**. It reads as a card that failed to render, and it is the single largest area of the fold that a visitor will try to parse. Either label it (`4 ORIGINALS — more in the repo`) or let the grid end after the real tiles.

**Repro steps**

1. Open the landing page, look at the ORIGINALS group's second row. **Observe:** bare grey panel right of *Pil pt-BR / LGPD*. — ![Landing](tmp/shots/landing.png)

---

### ISSUE-008: Regulatory H1 is set in the mono label face while every other H1 is Manrope

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | visual |
| **URL** | Regulatory horizon scan |
| **Repro Video** | N/A (static) |

**Description**

`Regulatory horizon scan` renders in the mono face at a lighter weight and notably narrower measure than `Cite check`, `Eviction notice check board`, `Privilege log builder` and `Limitations radar`, all of which use the Manrope display setting used by the catalog hero. The page therefore looks like a different site section, and an H1 in the label face breaks the stated type system (Manrope body + Departure Mono labels). Adjacent tells on the same page: the H1 sits directly under a lowercase mono `open·legal·artifacts.exe` line, and body lines are set to a smaller secondary size than the identical lede on other pages.

**Repro steps**

1. Open *Regulatory horizon scan*. **Observe:** mono H1. — ![Regulatory](tmp/shots/regulatory.png)
2. Compare *Privilege log builder* / *Limitations radar*. **Observe:** Manrope H1, heavier, larger. — ![Privilege](tmp/shots/privilege.png) · ![Limitations](tmp/shots/limitations.png)

---

### ISSUE-009: Native browser widgets inside token-styled demos (textarea resize grip, date pickers, select chrome)

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Category** | visual |
| **URL** | Regulatory horizon scan, Privilege log builder, Limitations radar, Eviction notice check board |
| **Repro Video** | N/A (static) |

**Description**

Three JSON textareas carry the draggable resize grip in the bottom-right corner; the eviction date fields show `mm/dd/yyyy` in the system UI font with the native calendar glyph pinned right; the selects show the default chevron with no token styling. Inside an otherwise strictly flat, hairline, zero-radius system these read as unfinished chrome. Choose `resize: vertical`/`none` and a styled select/date affordance, or accept them explicitly as a design decision.

**Repro steps**

1. Open *Limitations radar*. **Observe:** resize grip at the textarea's bottom-right corner. — ![Limitations](tmp/shots/limitations.png)
2. Open *Eviction notice check board*. **Observe:** `mm/dd/yyyy` in system font + calendar icons; blank chevron selects. — ![Eviction](tmp/shots/eviction.png)

---

### ISSUE-010: Accent yellow used as a callout side-bar (a third accent pattern)

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Category** | visual |
| **URL** | Eviction notice check board |
| **Repro Video** | N/A (static) |

**Description**

The jurisdiction note ("The five bundled jurisdiction rulesets are editable example data…") is marked by a pale yellow vertical bar at its left edge. The token set sanctions exactly two accent patterns — the 2×56px rule and the tile stripe. A third pattern dilutes both; it also renders at low opacity, so it reads as a washed-out highlighter rather than a deliberate structural mark. Remove the bar (the note already sits in its own inset block) or promote it to a full tile stripe for consistency.

**Repro steps**

1. Open *Eviction notice check board*. **Observe:** thin pale-yellow bar at the left of the note block under the lede. — ![Eviction](tmp/shots/eviction.png)

---

### ISSUE-011: Product names are cased differently in the catalog and on the page

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Category** | content |
| **URL** | landing → Cite check, Eviction notice check board |
| **Repro Video** | N/A (static) |

**Description**

The catalog writes `Cite Check` and `Eviction Notice Check Board` (title case, and the only styling used for 33 cards); the pages themselves write `Cite check` and `Eviction notice check board` (sentence case). One entry point per artifact is fine as long as the name matches — users searching or cross-referencing the catalog will not find the string they saw. Also inconsistent between the two: `Privilege log builder` / `Limitations radar` agree with their cards, so the drift is partial rather than a house style.

**Repro steps**

1. Landing, OPEN REIMPLEMENTATIONS card row 2–4: `Cite Check`, `Eviction Notice Check Board`. — ![Landing](tmp/shots/landing.png)
2. Open Cite check: H1 `Cite check`. — ![Cite check](tmp/shots/cite-check.png)

---

## Observed but not captured / unverified

Kept out of the issue ledger on purpose — these are hypotheses without pixel proof, or things this round's evidence cannot settle.

1. **Small mono labels may be below contrast minimum.** The eyebrows, card meta (`ORIGINAL / CLIENT-INTAKE`), table headers and `DETAILS →` links render as ~10–11px uppercase grey that *appears* lighter than the `#6b6b6b` body text (roughly `#8a8a8a` in the downscaled captures). If the real value is `#6b6b6b`, contrast is ≈5.0:1 and passes AA; if it truly is lighter, it fails. The captures were resized for reading, so anti-aliasing inflates apparent lightness — a colour-picker on the full-resolution PNGs decides it. **Not reported as a defect.**
2. **Button/click behavior untested.** No live browser this round, so ISSUE-002's exports, `Run scan`, `Run radar`, `Check notice`, `Build draft log`, the catalog nav links, and `DETAILS →` destinations were not exercised. Any statement about "the button does nothing" would be inference.
3. **Root cause of ISSUE-001 unconfirmed.** Console/CSP evidence is missing. The `data:text/javascript;base64` self-clicking module pattern is identical on all five pages, which fits a single shared failure.
4. **Third card group on landing not verified.** The brief requires three groups (originals / open artifacts / external). The 1280×2400 capture shows ORIGINALS and OPEN REIMPLEMENTATIONS (33 artifacts · 2 original ideas) and cuts a fourth tile row mid-title; the `5 EXTERNAL` group and the footer lie below the capture. Present or absent — not asserted.
5. **No responsive evidence.** Only 1280px wide was captured, so the 768px breakpoint in the stylesheet is untested; no claim made about mobile.
6. **Deployed copy vs workspace copy.** Root-cause reading used `tmp/open-legal-artifacts/vt-val/site/*.html`; the val.run deployment is assumed to match the pixels (it does for the visible text), but no byte comparison was made.

## What held up (so it is not lost in the defect list)

Landing page: hero hierarchy is strong, the 56px yellow rule under the H1 is exactly right, the counts line `4 ORIGINALS · 33 OPEN ARTIFACTS · 5 EXTERNAL` is present and correctly deprioritised, the two visible card groups use a clean 3-column grid with real yellow stripes, zero rounded corners on every element, no overflow, no mojibake, no placeholder text, no raw markup. Artifact pages keep the token discipline (bg, hairlines, mono labels, square buttons, no yellow text) even where their content is missing. The design system is not the problem; the demo layer is.

## Overall verdict

**FAIL.** The token system and the catalog surface pass cleanly, but the one requirement that defines every artifact page — a tokens-styled interactive demo prefilled with a worked example — fails on **5 of 5** pages inspected, and three of those pages additionally lose their legal disclaimer. One issue is high, and it is a single shared root cause: fix the demo bootstrap once and ISSUE-001 through ISSUE-004 largely collapse together. Then ISSUE-005/006/007 are the credibility fixes (navigation, disclaimers, dead tile), and ISSUE-008–011 are polish.

---

Status:  DONE_WITH_CONCERNS
Session: dogfood-visual-round2-20261107
Report:  returned inline above (parent to save as `dogfood-report-visual-round2-20261107.md`)
Counts:  C/0 · H/1 · M/7 · L/3
Top findings: 5/5 artifact demos load with no prefilled example and no output (empty containers, header-only tables); Regulatory advertises "prefilled worked example" over an empty textarea; three pages drop the not-legal-advice footer; artifact pages have no nav/back path.
Gaps:   static PNGs only — no clicks, no console/CSP capture (root cause of ISSUE-001 is a labelled hypothesis); contrast of 10px mono labels not measured; landing's third group + footer and all mobile widths are below/beyond the captures.