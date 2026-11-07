# Visual Inspector — run f6778d9e participant 5

I've read all six captures and cross-checked four readings against the workspace source. Writing the round-3 report now.

---

# Dogfood Report: Open Legal Artifacts — Visual Inspection, Round 3 (verification pass)

| Field | Value |
|-------|-------|
| **Date** | 2026-11-07 |
| **App URL** | https://arthrod--4075ab70dae211f1929a1607ee4eb77e.web.val.run/ |
| **Session** | dogfood-visual-round3-20261107 |
| **Scope** | 6 supplied captures (1280×2400, real UA, Cloudflare-clean): landing + Cite check, Eviction notice check board, Privilege log builder, Regulatory horizon scan, Limitations radar. Re-verification of the round-2 fix set + full token/render audit. |
| **Evidence** | `tmp/shots/{landing,cite-check,eviction,privilege,limitations,regulatory}.png` — all six read and judged at full frame this session. Source in `tmp/open-legal-artifacts/vt-val/site/` and `open-artifacts/*/demo/` used **only** to corroborate readings that the 1280→1067 downscale made ambiguous (three hypotheses were killed this way, below). |
| **Not done** | No live browser, no clicks, no console this round (static captures only). Declared as gaps, never as findings. |
| **Verdict** | **PASS WITH FIXES** |

## 1. Round-2 fix claims — verified against pixels

| Claim | Status | Pixel basis |
|---|---|---|
| Demos were empty; data: module imports fixed | **HOLDS, 3 of 5** | Cite check, Eviction, Regulatory render full computed output (see §2). Privilege and Limitations do **not** render output on load — R3-01. |
| Inputs prefilled with worked-example data | **HOLDS, 5 of 5** | Eviction fields populated (CA / post-and-mail / pay-or-quit / 10-01-2026 / 10-03-2026 / 3); three JSON textareas populated; Cite check is data-driven by design (no input control). |
| Sticky black "← Open Legal Artifacts" back bar | **HOLDS, 5 of 5** | Present at top of all five artifact captures; CSS confirms `position:sticky;top:0;z-index:99`, #0a0a0a on #fafaf8. |
| Missing "Not legal advice" disclaimers injected | **HOLDS where visible, 4 of 5** | Eviction, Privilege, Limitations, Regulatory all end with a disclaimer line. Cite check's footer is **below the 2400px frame** now that content renders — not visible, not claimable from pixels (source has it). |
| Landing orphan grey grid cells fixed | **HOLDS** | ORIGINALS row 2 is now one full-width *Pil pt-BR / LGPD* tile with stripe, meta and links. No bare panel remains. ISSUE-007 closed. |
| Regulatory H1 moved to Manrope | **HOLDS (face only)** | H1 is proportional Manrope 700 — but 26px vs 32–44px elsewhere, and its yellow rule sits **above** the H1 while the other four put it below. The look still doesn't match: R3-03. |

## 2. Page-by-page verdict

| Page | Inputs prefilled | Output computed | Back bar | Tokens | Verdict |
|---|---|---|---|---|---|
| Landing `/` | n/a | n/a (counts line `4 ORIGINALS · 33 OPEN ARTIFACTS · 5 EXTERNAL` present) | n/a (own header + 5-item nav) | ✅ except accent-as-status (R3-05) | **PASS** (1 low: R3-05) |
| Cite check | data-driven ✓ (worked example named in lede) | **✓ full** — 9 cards (9 / 5 exact / 1 normalized / 1 fuzzy / 2 not found / 2 pinpoint), 9-row table, 9 evidence cards with anchors + char offsets, verdicts reconcile with the cards | ✓ | ✅ minus pill semantics (R3-02), accent border on all 9 cards (R3-05) | **PASS WITH FIXES** |
| Eviction notice check board | ✓ all fields; only optional *tenancy length* blank | **✓ full** — `VERDICT: FAIL — pass 7 · fail 2 · unverified 0`, 9-row board, 7+2 = 9 reconciles, dates internally consistent (`only 2 days elapsed (2026-10-01 → 2026-10-03)`) | ✓ | ✅ except callout bar (R3-06), duplicate disclaimer (R3-08) | **PASS WITH FIXES** |
| Privilege log builder | ✓ JSON prefilled (matter *Kestrel Bio Fuels v. Kestrel Dynamics*) | **✗ none** — `DRAFT PRIVILEGE LOG / Press "Build draft log".` | ✓ | ✅ | **FAIL on affordance** (R3-01) |
| Regulatory horizon scan | ✓ JSON prefilled (`asOf 2026-11-07`, CCP Amendment first item) | **partial** — RANKED SCAN 5 rows (95/78/62/60/8 with bands), timeline 5 dated entries (2026-09-17 → 2028-03-01); **DIFF VIEW empty** (R3-04) | ✓ | ✅ except header anatomy (R3-03), accent bands + `#b9a800` (R3-05) | **PASS WITH FIXES** |
| Limitations radar | ✓ JSON prefilled (`asOf 2026-11-07`, CLM-101/102) | **✗ none** — `DEADLINES / Press "Run radar".` | ✓ | ✅ | **FAIL on affordance** (R3-01) |

Token conformance across the six: bg `#fafaf8` ✅ · text `#0a0a0a` ✅ · secondary `#6b6b6b` ✅ · hairlines `#e8e8e5` 1px ✅ · radius 0 on every card/chip/button/input ✅ · Manrope body + Departure Mono labels ✅ · max-width ≤1100 ✅ · no horizontal overflow, no clipped text, no mojibake, no raw markup, no lorem, no unstyled fallback ✅ · accent `#ffd400` **not** structural-only ⚠️ (R3-05).

## 3. Summary

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 4 |
| Low | 5 |
| **Total** | **9** |

---

## 4. Remaining issues

### R3-01: Two of five demos still open with an unfilled output region — "Press …" is the first thing a visitor reads
**medium · functional/ux** · Privilege log builder, Limitations radar · evidence `tmp/shots/privilege.png`, `tmp/shots/limitations.png`

Privilege shows `Press "Build draft log".` and Limitations `Press "Run radar".` under their output headings on load; their inputs *are* prefilled. The other three pages auto-run and open on computed results (`$("run").click()` at the end of the module; absent in these two — corroborated in `open-legal-artifacts/privilege-log-builder/demo/index.html` and `limitations-radar/demo/index.html`). Result: 2 of 5 artifact pages still reproduce the round-2 "empty output" silhouette, and the set is internally inconsistent — a user learns on page 3 that demos open pre-run, then meets two that don't. One click recovers it, so this is a fix, not a blocker: **auto-run both, keep the button for re-runs.**

### R3-02: Cite check — "EXACT" and "NOT_FOUND" verdict pills are visually identical
**medium · visual** · Cite check · evidence `tmp/shots/cite-check.png` (verdict column; Q1/Q5–Q8 vs Q4/Q9)

In the 9-row verdict column, `EXACT` and `NOT_FOUND` render as the same solid black pill with reversed text; `NORMALIZED` is outlined and `FUZZY` is yellow. The two most opposite outcomes in the product — verified verbatim vs. quote not in the record — are indistinguishable at a glance, so the table cannot be scanned for failures; the only failure colour present is *fuzzy*, which is the milder finding. Give `not_found` its own treatment (outlined + rule-weight border, or the fail red already in the token set) rather than sharing `.pill.exact`.

### R3-03: The five artifact pages still don't share one header template — H1 jumps 26 → 32 → 38 → 44px
**medium · visual** · Regulatory horizon scan (worst), Eviction, all five · evidence `regulatory.png` vs `cite-check.png` / `privilege.png` / `limitations.png` / `eviction.png`

Manrope is fixed, but composition isn't. Regulatory: lowercase mono wordmark `open·legal·artifacts.exe`, then the 56px yellow rule, **then** a 26px H1. The other four: eyebrow line (or nothing on Eviction), H1, then the rule **below** it. H1 sizes across the set measure 26 / 32 / 38 / 44 / 44px, so "Regulatory horizon scan" reads as a sub-heading next to "Privilege log builder". Eviction additionally carries no eyebrow at all. One shared header partial would close this and the residual gutter drift (artifact text starts ~13px left of the landing hero's text edge — R3-07).

### R3-04: Regulatory — "DIFF VIEW" is an empty section with no empty state
**medium · ux** · Regulatory horizon scan · evidence `tmp/shots/regulatory.png` (heading ~y1207, disclaimer ~y1232)

`DIFF VIEW — RULE CHANGES SINCE PREVIOUS SNAPSHOT` renders with zero content directly above the disclaimer, on a page whose lede promises "when a rule changes between snapshots, you see the field-by-field diff". The section is populated only by the far-away `Diff vs previous snapshot` button, and nothing links the two, so the empty band reads as a rendering failure — exactly the signature the round-2 verdict was based on. Either render the default diff on load, or print `No changes vs the bundled previous snapshot` / `Press "Diff vs previous snapshot"` inside it.

### R3-05: Accent `#ffd400` has become a semantic status colour, plus two off-token yellows
**low · visual** · Cite check, Eviction, Regulatory · evidence `cite-check.png` (yellow FUZZY pill, `#fffbe6` tinted flagged rows, 4px yellow left border on all 9 evidence cards), `eviction.png` (yellow verdict banner), `regulatory.png` (yellow band bars + yellow dup chip)

The stated rule is "accent structural only, two sanctioned patterns". Rendered now: yellow fills a 460px verdict banner, tints non-exact rows (`#fffbe6`, not in the token set), draws a 4px bar down the side of *every* evidence card, and encodes score band in the scan table — including a second, undocumented yellow `#b9a800` for medium. Yellow therefore means "attention/flag" in three different idioms and "structure" in two others. Either sanction it as a status colour (document the scale, drop `#b9a800` and `#fffbe6` for tokenised values) or pull it back to stripes and rules.

### R3-06: Eviction callout bar — round-2 ISSUE-010, unchanged
**low · visual** · Eviction notice check board · evidence `tmp/shots/eviction.png` (left edge of the note under the lede)

The pale 3px bar at the left of the "five bundled jurisdiction rulesets" note is still there (`.disclaimer { border-left: 3px solid var(--accent) }`). It is the same accent-as-callout pattern as R3-05 and reads as a washed-out highlighter at 1:1. Remove it — the note already sits in its own block — or promote it to the sanctioned 4px stripe.

### R3-07: Landing text and artifact content still sit on different left edges
**low · visual** · Landing vs all five artifact pages · evidence `landing.png` (hero text x≈107/1067) vs `cite-check.png` / `eviction.png` (content x≈92–95/1067)

≈13px at 1280 between the landing hero's text edge and artifact page content (and between the landing hero and its own section card edge). Round 2 measured the same drift as ~1021 vs ~1047px content width; the nav fix didn't touch it. One container token closes it.

### R3-08: Eviction carries two disclaimers in two different wordings
**low · content** · Eviction notice check board · evidence `tmp/shots/eviction.png` (note under lede, and footer at ~y1378)

The page states the "editable example data … verify every cited rule … Not legal advice" warning above the fold in one wording and again in the footer in another. Both are correct, the duplication just reads as template debris on the one page that has both a page-level note and the injected footer.

### R3-09: Product names still cased differently in catalog and page title (round-2 ISSUE-011, unchanged)
**low · content** · landing → Cite check / Eviction notice check board · evidence `landing.png` (cards read `Cite Check`, `Eviction Notice Check Board`) vs `cite-check.png` / `eviction.png` (H1 `Cite check`, `Eviction notice check board`)

## 5. Prior-finding re-check (002–011)

| Prior | Subject | Round-3 status |
|---|---|---|
| ISSUE-001 | All demos empty | **Closed on 3 of 5** (Cite check, Eviction, Regulatory) · **reduced to R3-01** on Privilege + Limitations (input now prefilled; output needs one click) |
| ISSUE-002 | Enabled exports with nothing to export | **Closed** — Cite check has a full report behind `Export report.md`, Regulatory has a populated scan behind `Export CSV` (auto-run sets `lastScan`) |
| ISSUE-003 | "PREFILLED WORKED EXAMPLE" over empty textarea | **Closed** — textarea shows the worked feed (`asOf`, `currentFeed[0]`, …) and the claim is now true |
| ISSUE-004 | No attestation inputs, blank selects | **Closed** — 4 attestation rows (`present`/`absent` selects + requirement + rule), all selects and both dates filled |
| ISSUE-005 | No nav / dead end | **Closed** — sticky back bar on 5 of 5 (residual layering only: R3-07) |
| ISSUE-006 | Missing disclaimers on 3 pages | **Closed on Eviction, Privilege, Limitations** (visible); Cite check footer now below the capture frame — unverifiable in pixels this round |
| ISSUE-007 | Landing orphan grey tile | **Closed** — full-width trailing tile, striped and labelled |
| ISSUE-008 | Regulatory H1 in mono | **Font closed; scale/composition open** → R3-03 |
| ISSUE-009 | Native date/select chrome, textarea grips | **Accepted as known** — grips on 3 textareas, `10/01/2026` + calendar glyphs, native chevrons all still present |
| ISSUE-010 | Yellow callout side-bar | **Open, unchanged** → R3-06 |
| ISSUE-011 | Name casing | **Open, unchanged** → R3-09 |

## 6. Hypotheses killed this round (so they don't get re-reported)

- **"`rulset` typo in the eviction board."** Looks like it at 1067px; source says `Notice type recognized under this ruleset`. My reading artifact. Not a defect.
- **"Summary table shows ✓ for the two pinpoint mismatches (Q5/Q7)."** The pinpoint pill renders the word `ok` / `mismatch` / `unverifiable`; `mismatch` is yellow. Consistent with the cards and the `2 PINPOINT ISSUES` count. Not a defect.
- **"Dedup chip arithmetic is wrong (12 items → 5 ranked)."** The chips are `droppedId → keptId` pairs, not counts. Not a defect.

---

## 7. Verdict

**PASS WITH FIXES.** The round-2 blocker is gone: the demo layer is alive, tokens hold, every artifact page has a way home, and the two pages that previously lied about their content (Regulatory) or lost their disclaimer (Eviction, Privilege, Limitations) are now honest. What remains is not architectural — it's the last of the template drift (R3-03), two pages that need the same auto-run the other three already have (R3-01), one card that an empty section still makes look broken (R3-04), and one semantic colour bug that hides failures in the flagship table (R3-02). R3-01 plus R3-04 are ~10 lines of shared bootstrap; R3-03 is the only structural fix.

**Gaps:** static captures only — no clicks (exports, `Run scan`, `Diff vs previous snapshot`, back bar navigation, `breakdown` disclosure all unexercised), no console/CSP signal, no live re-render. Cite check's footer, the landing's third group (`5 EXTERNAL`) and all mobile widths fall outside the 2400px captures. Two deploy-vs-workspace questions (Regulatory lede size, artifact gutters) sit within capture-resolution error and are not asserted.

---

Status:  DONE_WITH_CONCERNS
Session: dogfood-visual-round3-20261107
Report:  returned inline above (parent to save as `dogfood-report-visual-round3-20261107.md`)
Counts:  C/0 · H/0 · M/4 · L/5
Top findings: Privilege + Limitations still open on `Press "Build draft log" / "Run radar"` with no computed output while the other three demos auto-run; Cite check renders NOT_FOUND and EXACT as the same black pill, so failures can't be scanned; artifact headers still diverge (H1 26/32/38/44px, Regulatory's yellow rule above its H1); Regulatory's DIFF VIEW is an empty section with no empty state.
Gaps:   no live browser this round — clicks, exports, console and the sticky behaviour under scroll unverified; Cite check footer, landing `5 EXTERNAL` group and all mobile widths are outside the captures.