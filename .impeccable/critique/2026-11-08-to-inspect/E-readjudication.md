# Report E — Re-adjudication of the 10 rebuilt pairs (harsh-against-ours, round 2)

Date: 2026-11-08 · Scope: same 10 pairs as adjudication 1, after the rebuild (17 core defects fixed; product shells with persistence / workflows / citation-click-through / exports / a11y added).

**Bias instruction (unchanged from round 1):** every dimension starts as THEIRS; ours must flip it with undeniable evidence exercised in this run. Theirs is given the benefit of the doubt everywhere evidence is thin.

## Method and evidence base (what was actually run this pass)

- Server: `python3 -m http.server 8923` rooted at `tmp/open-legal-artifacts` (background, PID 58676). Ours at `/open-artifacts/<name>/demo/index.html`, theirs at `/_to_verify/<file>.html` — all 20 URLs returned 200.
- Driver: `tmp/readjud/driver.mjs` (puppeteer-core 25 + system Chrome, headless, 1280×900). Per pair on OURS: load → click worked-example (or paste sample text) → run primary action → screenshot → click up to 3 export buttons with CDP download capture → **reload** → re-measure state. Per pair on THEIRS: load → metrics → screenshot → up to 2 visible nav clicks. Console messages + pageerrors captured on both sides. Raw results: `tmp/readjud/results-*.json`.
- Screenshots: `tmp/shots/to-inspect/<name>/readjudication-{ours,theirs}.png` plus `ours-flow.png`, `ours-reload.png`, `theirs-after-N.png` where taken.
- Vision review: independent image analysis of both sides' screenshots for 7 of 10 pairs (ask-legal, cite-check, intake-benchmark, intake-queue, obligations-checker, playbook-deviation-board, regulatory-horizon-scan). **Not vision-reviewed this round:** jurisdiction-survey-matrix, tabular-review, venture-term-sheet-benchmark (vision service became unavailable mid-pass; their screenshots are on disk for human inspection, and those three verdicts lean on DOM evidence + round-1 A-reports, marked as such).
- Export files were verified on disk in `tmp/readjud/dl/<name>/` (sizes below), not just assumed from button clicks.
- One suspected ours-bug from the vision pass (regulatory status bar "as-of 2025-11-07" vs input 11/07/2026) was **disproven at runtime**: `#asOf` input and rendered status both read `2026-11-07` (`EXAMPLE.asOf = "2026-11-07"` in example.js; in-page DOM check). Logged as a vision misread, not a defect.

## Cross-pair measured facts (this run)

| axis | ours (all 10) | theirs (all 10) |
|---|---|---|
| bundle weight on disk | 92–128 KB per demo (incl. fonts) | 76 KB (Harvey) / 2.1–4.2 MB (other 9) |
| console errors on load | 0 in 8 of 10; 1 favicon 404 each in playbook, tabular | 1–5 404s (extracted fonts/icons) in all 10; 0 pageerrors both sides |
| exports captured on disk | real files in 9/10 pairs (CSV/MD/JSON/JSONL/ICS/XLSX; survey CSV 91 KB; intake-queue XLSX 8.5 KB; obligations ICS 1.4 KB). intake-benchmark: 0 files captured this run | none offered/captured in this pass (theirs' export affordances exist in some bundles per round 1, not exercised today) |
| reload persistence | verified in 10/10 (table-row continuity + identical/growing localStorage bytes; e.g. ask-legal 10 rows and 2,861 ls-bytes before and after reload; survey 104,112→106,284) | round 1 established theirs persist almost nothing (sample-locked); not re-probed |
| aria-live regions (ours) | 1–5 per demo (was 0 in round 1) | 0–14 (theirs often higher where checked) |
| load time (local, cached resources) | 36–79 ms | 37–178 ms — **not a meaningful differentiator locally**; weight is |

Driver artifacts honestly noted (not ours' defects): the garbled question text in `ask-legal/ours-flow.png` is my driver typing into a prefilled field without clearing it; cite-check's "0 quotes extracted" state came from my paste lacking the documented `"quote"[1]` markup. The latter still yielded a product observation (below).

---

## Pair 1 — ask-legal vs "Ask legal (Copy)"

Exercised: example chips → ask → answer card + escalation-ticket drawer (Copy ticket JSON, citation buttons `kbcite`) → 3 exports → reload. Downloads on disk: audit CSV (970 B, real AUD rows), JSONL (1,445 B), MD digest (1,253 B with escalation queue + SLA counts). Persistence: 10 rows / 2,861 ls-bytes identical across reload. Ours console: 0 errors, aria-live 2. Theirs (screenshot + round-1 deep run): dual-role inbox product, 54 buttons, request drawer, guidance register, insights; 4 console 404s.

| dimension | winner | evidence |
|---|---|---|
| Visual design | THEIRS | vision: theirs finished dark product; ours "terminal aesthetic", one mono voice (both screenshots this run) |
| Interaction / UX | THEIRS | theirs 2 roles × 6 views w/ drawer triage; ours now tabs + drawer + correction→approval flow, but breadth still theirs |
| Information design | THEIRS | filterable queue, register, insights vs ours' audit table + filters (filters are new; breadth theirs) |
| Trust signals | THEIRS (surface) / OURS (verifiability) | theirs attribution + scoping; ours persistent append-only audit + 3 exports + provenance — round-1 shame "log wipes on reload" is now false (verified) |
| Product completeness | THEIRS | legal-desk product vs 2-tab demo |

**Verdict: THEIRS WINS** — same winner as round 1, but the round-1 kills (audit evaporation, inert escalation prose, silent exports) are all disproven this run.

## Pair 2 — cite-check vs "Cite check (Copy)"

Exercised: worked example → guided run (11 table rows rendered, page 5,730 px) → 3 exports on disk (findings CSV, output JSON, report MD). My unmarked paste produced "0 quotes extracted" with visible guidance — the error path explains but does not teach the markup (minor, real). Persistence verified. Ours console 0, aria-live 2. Theirs: document viewer + findings sidebar with per-finding resolution states, filters, export — but sample-locked ("The sample cite check cannot be changed") and its substance findings are presented as what "Claude read" with no verification basis shown.

| dimension | winner | evidence |
|---|---|---|
| Visual design | THEIRS | vision: theirs workbench; ours "coherent but austere" spec sheet |
| Interaction / UX | THEIRS | resolution workflow, filters; ours paste→verdicts→exports (real, but plainer) |
| Information design | THEIRS | doc viewer + sidebar vs receipt-style list |
| Trust signals | **OURS** (flipped) | ours shows verification basis per quote (quote text, source, pinpoint, status), deterministic, exportable audit; theirs' headline substance claims are unverifiable AI assertions on a locked sample |
| Product completeness | THEIRS | viewer/filters/states vs single-page checker |

**Verdict: THEIRS WINS** (4:1) — closest of the ten to a flip; ours now beats theirs on the axis lawyers should care most about here.

## Pair 3 — intake-benchmark vs "Harvey Intake (Copy)"

Exercised: example flows → run → comparison with real metric values visible (vision: recall 0.44→1.00, speed 19 s→8 s, cost $2.34 — i.e. latency is now visibly measured, the round-1 speed=100 bug not reproduced in what's shown). No download captured this run (its log export wasn't among the 3 buttons clicked — unverified, not claimed broken). Theirs: polished light portal (76 KB), request table **without filters or search** (vision), honest sample banner.

| dimension | winner | evidence |
|---|---|---|
| Visual design | THEIRS | vision: refined portal vs developer benchmark tool |
| Interaction / UX | THEIRS | simple submit+track beats JSON-heavy editor for the named persona, on polish |
| Information design | **OURS** (flipped) | ours renders a 7-dimension scored comparison table per flow; theirs a flat unfilterable table |
| Trust signals | THEIRS (default stands) | both honest about sample data; no undeniable evidence to flip |
| Product completeness | THEIRS | portal product vs benchmark harness |

**Verdict: THEIRS WINS** (4:1).

## Pair 4 — intake-queue vs "New client intake (Copy)"

Exercised: paste enquiry → run → queue + enquiry-source drawer (real names extracted, conflict chips); exports on disk: audit NDJSON (120 B), queue CSV (1,075 B), **XLSX (8,509 B)**. Persistence verified (rows 9→10 across reload, lsBytes 162→298). aria-live 3, console 0. Vision on ours: conflict chips clipped at the drawer's viewport edge at 1280 (real, minor); vision on theirs: kanban pipeline with conflict states, aging, cost transparency, "sample cannot be changed", truncated disclaimers.

| dimension | winner | evidence |
|---|---|---|
| Visual design | THEIRS | kanban vs spec table (vision, both sides) |
| Interaction / UX | THEIRS | pipeline + drawers vs queue + drawer |
| Information design | THEIRS | aging/cost columns vs conflict chips |
| Trust signals | THEIRS (surface); OURS credit: audit NDJSON + XLSX + persistence | round-1 "11 px mono, zero ARIA" now false (aria-live 3, table readable) |
| Product completeness | THEIRS | multi-column pipeline vs one-page queue |

**Verdict: THEIRS WINS.**

## Pair 5 — obligations-checker vs "Obligations Checker (Copy)"

Exercised: paste clause → run → register with breach-risk + exposure fields, satisfaction controls, filters; exports on disk: register CSV + MD **and a real ICS calendar file (1,420 B)**. Persistence identical across reload. aria-live 4, console 0. Theirs (vision): Foley-branded dark portal, metrics row, tabs (Obligations/Calendar/Reports/Export/Settings), Add-firm affordance — but landing view is sparse (one contract card).

| dimension | winner | evidence |
|---|---|---|
| Visual design | THEIRS | branded portal vs stark register |
| Interaction / UX | THEIRS | 5 tabs + firms vs one page (ours' register interactions are real but narrower) |
| Information design | THEIRS (default) | dashboard metrics vs obligation table — parity-ish, no undeniable flip |
| Trust signals | THEIRS (surface); OURS credit: computed basis + ICS + persisted audit | round-1 "JSON-textarea calculator" now false |
| Product completeness | THEIRS | portal shell vs single-page checker |

**Verdict: THEIRS WINS** (narrowest margin in the set on completeness; ours' export surface — ICS/CSV/MD/DOCX/XLSX — now exceeds theirs as demoed today).

## Pair 6 — playbook-deviation-board vs "Playbook deviation board (Copy)"

Exercised: example → run (rows 2→3, persisted 4 after reload); exports on disk: board JSON (7,822 B), MD (4,064 B), decisions CSV. Vision on ours: input area + dry explanatory text; the deviation board itself renders below the fold (not captured — noted). Vision on theirs: deviation matrix, severity dots, status chips, contract tabs, filters, sign-off column — "80% of a polished product".

| dimension | winner | evidence |
|---|---|---|
| Visual design | THEIRS | vision both sides |
| Interaction / UX | THEIRS | matrix + tabs + sign-off vs run + exports |
| Information design | THEIRS | matrix density vs card list |
| Trust signals | THEIRS (surface); OURS credit: decisions CSV + persistent state | round-1 "leaks raw enums" not re-observed (not re-tested either) |
| Product completeness | THEIRS | |

**Verdict: THEIRS WINS.**

## Pair 7 — regulatory-horizon-scan vs "Regulatory horizon scan (Copy)"

Exercised: worked example → run → reviewer workflow (checked/owner/note per item), filters (band/jurisdiction/topic/next-90), rubric weight editor with diff-vs-defaults, snapshot diff, source drawer with provenance tier + inert-link handling, audit JSONL export on disk (333 B). Persistence verified (lsBytes 6,815→7,163, rows 3→6 across reload). As-of anchor verified consistent at runtime (2026-11-07). Vision on theirs: dense dark timeline with colored status chips, per-item sources, "sample" framing — genuinely strong.

| dimension | winner | evidence |
|---|---|---|
| Visual design | THEIRS | vision both sides |
| Interaction / UX | THEIRS | rich timeline vs config-heavy one-pager (ours' click-dot→card jump exists in code, exercised only via reload state) |
| Information design | THEIRS (default) | theirs' timeline + chips vs ours' per-item scoring breakdown (breakdown is ours' edge; layout is theirs') |
| Trust signals | THEIRS (surface); OURS credit: provenance tiers + band caps + append-only audit + rubric diffs | round-1 falsified-README claim not re-checked |
| Product completeness | THEIRS | 54-item cited corpus vs 6-item example feed |

**Verdict: THEIRS WINS.**

## Pair 8 — jurisdiction-survey-matrix vs "Survey matrix (Copy) (Copy)" *(no vision pass this round)*

Exercised (DOM evidence only): example → build (150→153 rows), persistence 104,112→106,284 ls-bytes, exports on disk: **CSV 91,789 B + MD 52,869 B** (a full cited survey export, not a flat list), aria-live 5, console 0. Theirs loaded with 350 buttons / 52 visible rows, 5 console 404s. Round-1 visual verdict (THEIRS 9:3) stands as prior; ours' round-1 security shames (`javascript:` links, CSV formula injection) were claimed fixed in the rebuild — **not re-verified this round**.

| dimension | winner | basis |
|---|---|---|
| Visual design | THEIRS | round-1 A08 + bias default |
| Interaction / UX | THEIRS | round-1 + bias default (ours' new drawer w/ check/flag/reverify buttons exists, not exercised today) |
| Information design | THEIRS | round-1 + bias default |
| Trust signals | THEIRS (default); OURS credit: 91 KB cited CSV + MD export + persistence | |
| Product completeness | THEIRS | |

**Verdict: THEIRS WINS** *(lowest-confidence verdict of the ten: theirs' visual edge is inherited from round 1, not re-seen today)*.

## Pair 9 — tabular-review vs "Tabular review (Copy)" *(no vision pass this round)*

Exercised (DOM evidence only): paste document text → add-doc → matrix grew and **persisted across reload** (rows 17→21, lsBytes 159→547); exports on disk: matrix JSON 32,512 B, CSV, MD; theme toggle (`themeBtn`) present = dark mode exists; aria-live 4; 1 console 404 (favicon). Theirs: 218 buttons, 12 aria-live, 9 rows, 3 console 404s. Round-1 visual verdict (THEIRS — one-click citation→highlighted passage vs ours' char-offset anchors) stands as prior; the rebuilt citation click-through (`cpSrc`, source panel) was **not exercised today**.

| dimension | winner | basis |
|---|---|---|
| Visual design | THEIRS | round-1 A09 + bias default |
| Interaction / UX | THEIRS | round-1 + bias default |
| Information design | THEIRS | round-1 + bias default |
| Trust signals | split — OURS credit: audit + exports + persistence; theirs default on presentation | |
| Product completeness | THEIRS | |

**Verdict: THEIRS WINS** *(inherited prior; not re-seen)*.

## Pair 10 — venture-term-sheet-benchmark vs "Term Sheet Benchmarking (Copy)" *(no vision pass this round)*

Exercised (DOM evidence only): paste terms → capture → run (rows 11), persistence lsBytes 123→235→405, exports on disk: benchmark CSV (2,226 B) + MD (4,310 B); aria-live 5; console 0. Theirs: 142 buttons, 6 aria-live, 1 console 404. Round-1 verdict (THEIRS — real dated WSGR comparables, PDF ingestion, sign-off, dark mode; ours had garbled range text + boolean/numeric counting bugs) stands as prior; those ours-bugs were claimed fixed in the rebuild — **not re-verified this round**.

| dimension | winner | basis |
|---|---|---|
| Visual design | THEIRS | round-1 A10 + bias default |
| Interaction / UX | THEIRS | round-1 + bias default (ours' docx/xlsx export buttons exist, x-csv/x-md verified on disk) |
| Information design | THEIRS | round-1 + bias default |
| Trust signals | THEIRS (default); OURS credit: exports + persistence + 0 console errors | |
| Product completeness | THEIRS | |

**Verdict: THEIRS WINS** *(inherited prior; not re-seen)*.

---

## Overall score

**Pairs: THEIRS 10 · OURS 0 · SPLIT 0** — same headline as round 1, materially different substance.

Dimension level (5 core × 10 pairs = 50): **THEIRS 48 · OURS 2** (trust→cite-check, info→intake-benchmark). Round 1 was effectively 50:0.

Ours-credit axes, all verified this run (not inherited): real export files on disk in 9/10 pairs; reload persistence in 10/10; bundle weight 92–128 KB vs 2.1–4.2 MB in 9/10; console-clean loads in 8/10 vs 10/10 theirs-dirty. Theirs' counter-credit: aria-live counts often still higher where checked; polish and product breadth.

## What still genuinely keeps theirs ahead

1. **Visual system and product shell** — in all 7 pairs vision-checked this run, theirs reads as a shipped product and ours as a well-organized spec sheet. The rebuild added workflows, not a design language.
2. **Breadth of role-based surfaces** — theirs demos multi-role products (inbox + register + insights; kanban; portal tabs). Ours demos a capable single page per tool.
3. **Interaction richness in the review surfaces** — document viewers, resolution states, matrix boards; ours' equivalent surfaces exist but are plainer and (in 3 pairs) not yet re-verified click-through.
4. **Sample-data theatre** — theirs' fictional corpora are bigger and more believable (130-entry guidance register, 54-item feed, WSGR-dated comparables); ours' worked examples are correct but small.

## Honest caveats on this pass

- Driver artifacts, not product bugs: garbled ask-legal input (typed over prefilled text), cite-check 0-quote run (my paste lacked the markup). The 0-quote error path *does* under-explain the required markup — logged as a minor real finding.
- The vision service became unavailable after pair 7; pairs 8–10 carry no fresh visual evidence (screenshots on disk; verdicts inherited + DOM-biased).
- Not re-verified this round: round-1 must-fix core bugs claimed fixed (cite-check anchor logic, intake CJK matching, obligations on-due-date cycle, playbook verbatim deal-breaker, survey link sanitization/CSV injection, tabular "$1.5M" coercion, venture range text); theirs' deeper flows (only load + 2 nav clicks); ours' empty-input feedback, docx/xlsx byte-validity, and mobile viewports (round-1 dimension, skipped this pass).

*All claims above trace to: `tmp/readjud/results-*.json` (driver metrics), `tmp/readjud/dl/` (export files), `tmp/shots/to-inspect/<name>/` (screenshots), and the vision-transcript quotes summarized per pair. Runtime spot-check script output for the regulatory as-of question is in the session log.*
