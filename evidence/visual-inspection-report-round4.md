# Visual Inspector — run abe014ad participant 3

I have what I need: all four captures read twice where they carry load, the deployed pages' served text, and source corroboration for the three claims that pixel reading alone couldn't settle. Report below.

---

# Dogfood Report: Open Legal Artifacts — Visual Inspection, Round 4 (four new originals)

| Field | Value |
|-------|-------|
| **Date** | 2026-11-07 |
| **App URL** | https://arthrod--4075ab70dae211f1929a1607ee4eb77e.web.val.run |
| **Session** | dogfood-visual-round4-20261107 |
| **Scope** | 4 supplied captures (1280×2400, real UA, Cloudflare-clean, read at 1067×2000 = 0.83×): `/a/client-intake`, `/a/contracts-playbook`, `/a/pii-ptbr-lgpd`, `/a/prompting-for-attorneys` (→ `/course/`). Requirement coverage, token/render audit, cross-page consistency. |
| **Evidence** | `tmp/shots/client-intake.png`, `contracts-playbook.png`, `pii.png`, `prompting.png` — each read at full frame this session (pii and contracts re-read on their dense regions). Served HTML (`fetch_content` on all four URLs + `/`) and workspace source in `tmp/open-legal-artifacts/vt-val/site/` and `prompting-for-attorneys/` used **only** to corroborate readings the 0.83× downscale made ambiguous — three hypotheses were killed that way (§5). |
| **Not done** | No live browser, no clicks, no console, no scroll behaviour this round (static captures only). Declared as gaps, never as findings. |
| **Verdict** | **PASS WITH FIXES** |

## 1. Page-by-page

| Page | Requirement coverage (pixels) | Tokens / render | Findings | Verdict |
|---|---|---|---|---|
| `/a/client-intake` | **Partial.** Firm summary ✓ (matter summary, 2-row conflict-party table, 2 urgency flags, next steps); sim label ✓; prefilled ✓. **Matter-area picker ✗, proposed questions + suggested answers ✗, review/edit ✗ — none on screen.** | bg/fg/hairline/radius/mono all ✓ · no mojibake · no overflow · **~58% of the frame is empty background** | 001, 010, 011 | **PASS WITH FIXES** |
| `/a/contracts-playbook` | ✓ all: fictional mutual NDA pasted, 12-clause split, 12-row deviation table with preferred/fallback-tier-1/avoid/uncovered, quote statuses exact/normalized/fuzzy, RYG counters, evidence cards with char anchors. Export buttons exist (§3 note: below frame) | tokens ✓ · radius 0 ✓ · hairlines ✓ · no fallback serif | 003, 007, 008, 009, 010 | **PASS WITH FIXES** |
| `/a/pii-ptbr-lgpd` | ✓ all: pt-BR text, yellow structural spans, 12-entity table (type/value/offset/rule/conf), LGPD category summary (8+1+1+1+1 = 12 entities, reconciles), redaction preview, rules-based-demo label, 2 HF Space links. Benchmark panel exists but sits below the frame | tokens ✓ · PT-BR diacritics clean (ção, ê, º) · no mojibake | 002, 006, 012, 014 | **PASS WITH FIXES** |
| `/a/prompting-for-attorneys` → `/course/` | ✓ hero, 10 lessons (durations sum 57 = "57 min total"), progress UI 00/10, footer disclaimer; **✗ no "← Open Legal Artifacts" bar and no link back to the catalog** | Libre Franklin + Roboto Mono render from jsdelivr (no serif fallback) ✓ · #FAFAF8/#0A0A0A/#6B6B6B/#E8E8E5/radius 0 ✓ | 004, 015 | **PASS WITH FIXES** |

Cross-page: no blank or cloned renders, no unstyled fallback, no layout break at 1280, no horizontal overflow on any of the four.

## 2. Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 0 |
| Medium | 6 |
| Low | 9 |
| **Total** | **15** |

---

## 3. Issues

### ISSUE-001: Client intake opens at the confirm gate — the guided flow is not on screen, and half the page is empty

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | ux / content |
| **URL** | /a/client-intake |
| **Repro Video** | N/A (static) |

**Description.** The page promises "proposed questions with suggested answers… review" but first paint is step **4 · Confirm**. No matter-area picker, no proposals, no review list. Content ends ~y1386 of 2400 at 1280 px — **~58% of the capture is empty background**, the same "half-empty page" silhouette rounds 2–3 treated as a failure signature. Steps 1–3 do exist but only backwards: `← Back to review` → `← Back` → `← Back` (`show()` toggles hidden sections; `loadWorkedExample()` drives the state to the end). Compounding it, the 5-segment rail is **inert** — `renderRail()` emits plain `<div>`s with no click handler — so it looks like wizard navigation and does nothing. A visitor sees the end of a flow they never took, with one forward button ("Submit this intake →") whose label is a two-click confirm.

**Evidence.** `tmp/shots/client-intake.png` — h1/lede/sim label, 5-step rail with step 4 underlined in accent, then step-4 panel only, blank to frame bottom.

**Fix.** Open on step 1 with the worked example pre-filled *and* auto-advance once to step 2 (so the "suggested answers" screen — the product's actual differentiator) or show steps 1–4 stacked with the rail as anchors. Make the rail clickable either way.

### ISSUE-002: PII entity table breaks identifiers mid-token — the CPF, RG, CNPJ and e-mail columns are unreadable

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | visual |
| **URL** | /a/pii-ptbr-lgpd |
| **Repro Video** | N/A (static) |

**Description.** A five-column table is rendered inside a 1fr half-column with auto layout, so VALOR gets ~100 px and REGRA ~85 px while CONF (~35 px) and OFFSET (~55 px) are near-empty. Consequences in the pixels: `529.982.24 / 7-25` (CPF split inside the number), `31.582.984 / -7` (RG split before its check digit), `45.723.174 / /0001-10` (CNPJ split at the slash), `fernanda.r / iberorexa / mple.com` (e-mail across three lines), `Rua / Harmonia / 772, apto / 42` (address across four). The tallest cell is 4 lines; `sensitive-saude- / gazetteer` wraps to 3. Root cause is `td.v { max-width:220px; overflow-wrap:anywhere }` with no fixed layout — a lawyer copying the visible CPF copies a wrong CPF, on the page whose entire deliverable is character-exact values.

**Evidence.** `tmp/shots/pii.png`, "ENTIDADES (OFFSETS EM CARACTERES)" table, ~y672–1180.

### ISSUE-003: Contracts — AVOID and FALLBACK-TIER-1 are the same yellow pill

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | visual |
| **URL** | /a/contracts-playbook |
| **Repro Video** | N/A (static) |

**Description.** The classification column is the page's core output. Rendered: `PREFERRED` = solid black, `UNCOVERED` = dashed grey outline, `FALLBACK-TIER-1` = yellow, `AVOID` = **the same yellow**, differentiated only by a 2 px black ring (`.pill.avoid` adds `box-shadow: 0 0 0 2px`). At 10 px type the ring reads as an artifact, so the one classification that should stop a signing — AVOID, row 5 — is visually the twin of the fallback it is meant to be distinguished from. This is the round-3 R3-02 failure class (exact vs not_found sharing a pill) recurring on a second page; note `q.not_found` *was* fixed there (dashed), so the fix pattern already exists in the file.

**Evidence.** `tmp/shots/contracts-playbook.png`, deviation table rows 4 vs 5 (~y1068 / y1094).

### ISSUE-004: The course page has no route back to the artifacts catalog

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | ux / functional |
| **URL** | /a/prompting-for-attorneys (serves /course/) |
| **Repro Video** | N/A (static) |

**Description.** The other three pages carry the sticky black `← Open Legal Artifacts` bar; this one does not (different site chrome: wordmark → `arthur.law`, A−/A/A+, Contact). Nothing in the frame links back to the 4-originals catalog — footer carries only the copyright line and the attorney-advertising notice. A visitor who arrives from `/a/prompting-for-attorneys` (the catalog's own link target) is stranded in a second property with browser-back as the only exit. The brief asked for the bar on all four pages, so this is also a spec miss, not just taste.

**Evidence.** `tmp/shots/prompting.png` — header (y0–60) and footer (y1880–2000) contain no artifacts link.

### ISSUE-005: Header template still diverges across the three artifact pages — and the fix is a shipped `!important` patch

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | visual |
| **URL** | all three artifact pages |
| **Repro Video** | N/A (static) |

**Description.** Three header compositions: **contracts** = mono uppercase kicker `OPEN-LEGAL-ARTIFACTS · DETERMINISTIC CORE`, H1 **38 px**, 56×2 accent rule, lede; **pii** = sentence-case kicker in the *body* face (`Open legal artifacts · pii-ptbr-lgpd`), H1 **26 px**; **client-intake** = no kicker at all, H1 26 px. Cause is visible in the served HTML: both client-intake and pii end with an injected `<style>h1{font-family:var(--font-body,'Manrope')!important;font-size:26px!important;…}</style>` appended *after* `</footer>` — a hotfix that overwrote pii's intended `h1{font-family:mono;font-size:20px}` and client-intake's `2rem`, leaving contracts' `clamp(26px,4vw,38px)` untouched. So "Playbook from agreement" reads as a section heading next to "Client intake", and the kicker line changes face and case between pages. Round-3 R3-03, still open.

**Evidence.** `tmp/shots/contracts-playbook.png` (y57–180) vs `pii.png` (y50–150) vs `client-intake.png` (y70–170).

### ISSUE-006: PII page cites LGPD alíneas that the statute does not have — and mis-numbers saúde

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | content |
| **URL** | /a/pii-ptbr-lgpd |
| **Repro Video** | N/A (static) |

**Description.** The category cards read `Art. 5º, II, "f" · Dados sensíveis — saúde`, `Art. 5º, II, "b" · … religiosa`, `Art. 5º, II, "a" · … origem racial ou étnica`. Art. 5º, II has **no alíneas** — it is one inciso with a prose list. Quoted from Planalto: *"II - dado pessoal sensível: dado pessoal sobre origem racial ou étnica, convicção religiosa, opinião política, filiação a sindicato ou a organização de caráter religioso, filosófico ou político, dado referente à saúde ou à vida sexual, dado genético ou biométrico, quando vinculado a uma pessoa natural"*. Two problems: the letters are invented citation granularity (a reader cannot look them up), and even read as a prose index they don't hold — origem = 1st, convicção religiosa = 2nd, **saúde = 5th ("e")**, not "f". The substance (these are the Art. 5º, II categories) is right; the citations are not. On a page aimed at Brazilian lawyers this is the one error the audience is guaranteed to catch. (The `— · 1 entidade` card for CNPJ, correctly excluding legal persons, is a good touch and shows the author can be precise.)

**Evidence.** `tmp/shots/pii.png`, "CATEGORIAS LGPD PRESENTES" (~y1350–1745); statute text fetched this run from `planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm`.

### ISSUE-007: Contracts "RYG risk summary" has no red and no green

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Category** | visual |
| **URL** | /a/contracts-playbook |
| **Repro Video** | N/A (static) |

**Description.** The panel is labelled RYG but encodes: GREEN 3 = plain white cell, YELLOW 4 = full accent fill (the loudest object on the page), RED 1 = **solid black**. So the highest-risk count renders as a neutral heavy block and the caution count shouts. Nothing is red. Counting still works, but the panel cannot be scanned — the only thing the three colours were for. Secondary defect in the same block: a second `.counts` row (8 quotes checked / 5 exact / 1 normalized / 1 fuzzy / 1 not found / 2 unverified) sits with no sub-label under "2 · RYG risk summary", so quote-verification stats read as part of clause risk.

**Evidence.** `tmp/shots/contracts-playbook.png`, ~y780–915. Source confirms `.counts .r{background:var(--text)}`, `.counts .g{background:#fff}`.

### ISSUE-008: The pasted agreement is clipped mid-clause with no scroll affordance

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Category** | visual / ux |
| **URL** | /a/contracts-playbook |
| **Repro Video** | N/A (static) |

**Description.** The agreement box (`pre.draft`, `max-height:520px; overflow:auto`) cuts off inside clause 5 — "…If a Party is compelled by law to disclose Confidential Information…" is sheared horizontally at the container edge, mid-word. macOS overlay scrollbars are invisible at rest, so nothing tells the reader the text continues; it reads as a truncated paste on the one screen that must prove the full fictional NDA was pasted. Add a bottom fade/label ("520 of 1,240 px — scroll") or size the box to the content.

**Evidence.** `tmp/shots/contracts-playbook.png`, y205–540.

### ISSUE-009: Deviation table gives ~400 px to POSITION and ~62 px to QUOTE

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Category** | visual |
| **URL** | /a/contracts-playbook |
| **Repro Video** | N/A (static) |

**Description.** Column widths are wildly unbalanced: POSITION runs long prose sentences across ~400 px while QUOTE gets ~62 px, so two-word cells wrap to three lines (`no / playbook rule matched this clause — left uncovered. never guessed` is fine in 3 lines; `preferred / forum` in row 8 is not) and the `NORMALIZED` / `EXACT` pills sit flush against the table's right border with zero breathing room. Wrapping in the widest prose column is normal; starving the 10 px status pills is not.

**Evidence.** `tmp/shots/contracts-playbook.png`, table y985–1415.

### ISSUE-010: Accent `#ffd400` is again doing status duty, in four idioms

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Category** | visual |
| **URL** | client-intake, contracts-playbook |
| **Repro Video** | N/A (static) |

**Description.** The token comment says "structural, never textual". Rendered this round: (a) client-intake urgency rows — the raw rule id is a **yellow chip** encoding "urgent"; (b) contracts — 4 px yellow left bar on *every* evidence card (a status-looking mark on a non-status element); (c) contracts — yellow fills FALLBACK-TIER-1, AVOID and FUZZY, i.e. one hue for three different meanings (see ISSUE-003); (d) contracts — the sim badge `<span class="sim accent">` is a yellow box **mid-sentence**, uppercase inside a lowercase sentence, so the lede breaks visually at "…stays uncovered — never guessed. [DETERMINISTIC SIMULATION OF THE LIVE APP] — no LLM…". The same label is a quiet bordered box on client-intake and pii, so the identical required disclosure is styled three ways. Round-3 R3-05 continues.

**Evidence.** `tmp/shots/client-intake.png` (y710–805), `contracts-playbook.png` (y270–290, y1487–2000).

### ISSUE-011: Firm-facing urgency table shows internal rule ids

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Category** | content |
| **URL** | /a/client-intake |
| **Repro Video** | N/A (static) |

**Description.** The RULE column reads `deadline-within-30-days` and `court-date-mentioned` — snake_case identifiers in a table labelled "Matter summary (firm-facing)". Every other string on the page is written for a human ("deadline 2026-11-18 is 11 days away (within 30)"). Map to display labels ("Deadline within 30 days", "Court date mentioned") and keep the id for the tooltip/export.

**Evidence.** `tmp/shots/client-intake.png`, y712–805.

### ISSUE-012: PII page's kicker exposes the artifact slug

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Category** | content |
| **URL** | /a/pii-ptbr-lgpd |
| **Repro Video** | N/A (static) |

**Description.** Kicker reads `Open legal artifacts · pii-ptbr-lgpd`. The repo key should never be the user-visible line; compare contracts' `OPEN-LEGAL-ARTIFACTS · DETERMINISTIC CORE`. Fold into ISSUE-005's shared header, but the slug itself is a content decision, not a layout one.

**Evidence.** `tmp/shots/pii.png`, y55–68.

### ISSUE-013: Catalog names and page names still disagree on all four originals

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Category** | content |
| **URL** | `/` → the four pages |
| **Repro Video** | N/A (static) |

**Description.** Catalog (`/`, live text this run): `Client Intake`, `Contracts Playbook`, `Prompting for Attorneys`, `PII pt-BR / LGPD`. Page H1s: `Client intake`, `Playbook from agreement`, `Prompting for attorneys — ten techniques that change the answer.`, `PII detection, pt-BR / LGPD`. Casing drift on two, outright different names on two (`Contracts Playbook` → `Playbook from agreement`; `PII pt-BR / LGPD` → `PII detection, pt-BR / LGPD`). Round-3 R3-09, unchanged and now across the new set.

**Evidence.** `tmp/shots/contracts-playbook.png` (y80–100) and `pii.png` (y95–130) vs live `/` text.

### ISSUE-014: PII two-column layout leaves ~1,300 px of dead space down the left

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Category** | visual |
| **URL** | /a/pii-ptbr-lgpd |
| **Repro Video** | N/A (static) |

**Description.** `main{grid-template-columns:1fr 1fr}` with a short left column (380 px textarea + toggle + button + note, ending ~y700) against a right column that runs past the frame. From y700 to 2000 the left half is empty paper — at 1280 that is a visible L-shaped void through the entity table, category cards and redaction preview. Either narrow the left column to a sticky input rail or let the table and cards span the full width below the fold.

**Evidence.** `tmp/shots/pii.png`, x97–518 below y700.

### ISSUE-015: The progress meter reads as ten tofu boxes

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Category** | visual / ux |
| **URL** | /course/ |
| **Repro Video** | N/A (static) |

**Description.** Top right, immediately before the A/A+ controls: ten identical empty 10 px squares with no legend, no fill and no label. At 0/10 they are indistinguishable from missing-glyph placeholders — I read them as tofu on first pass. (DOM has `aria-label="Progress"`, so screen readers are fine; it is the visual affordance that fails.) Fill the first cell with a marker, add a hairline track, or print "0/10" beside them.

**Evidence.** `tmp/shots/prompting.png`, y20–36.

---

## 4. What passed (positive signals, not "no news")

- **Auto-render, all four.** Client-intake's worked example, contracts' 12-row deviation table + 8 evidence cards, pii's highlight/table/categories/redaction, and the static course home all render content on load — no "Press …" empty states anywhere. Round-3 R3-01 does not recur.
- **Arithmetic reconciles.** Contracts: 12 clauses = 3 green + 4 yellow + 1 red + 4 uncovered. Client-intake: `2026-11-07 → 2026-11-18` = "11 days away (within 30)" ✓. Course: 5+6+5+6+7+5+6+6+6+5 = 57 = "57 MIN TOTAL" ✓. PII: 12 entities in the table = 8+1+1+1+1 in the category cards ✓.
- **Fonts, the round-4 question.** `/course/` renders headings and body in **Libre Franklin** and labels/durations in **Roboto Mono** — no serif fallback, no faux-bold, no mixed faces. The `@font-face` rules are woff2 from jsdelivr pinned to commit `77cebdf`; they loaded on this run. Artifact pages render Manrope + Departure Mono, also loaded.
- **Tokens.** `#fafaf8` bg, `#0a0a0a` ink, `#6b6b6b` secondary, `#e8e8e5` hairlines, radius 0 on every card/chip/pill/button/input, max-width 1100 — across all four. Course page shares the same five values.
- **Rendering hygiene.** No mojibake (PT-BR `ção / ê / õ / º` all correct), no lorem, no raw markup, no broken images, no overlap, no horizontal overflow at 1280, sticky bar present and legible on 3 of 4.
- **Honesty labels.** `deterministic simulation…` on three pages; pii adds "rules-based demo; the fine-tuned GLiNER/OPF models run on HF Spaces", two live HF Space links, a benchmark section headed "modelos reais, não esta demo", and "Esta página não roda os modelos". That is the most honest labelling in the set.

## 5. Below-frame / source-only, and hypotheses killed

**Reported, not counted (outside the 2400 px frame — source-verified, no pixels):**
- pii benchmark numbers use en-US separators inside a pt-BR page: `0.888 / 0.897`, `2,419 mensagens`, `8,666` false positives (`pii-ptbr-lgpd.html:197–199`). PT-BR would be `0,888 / 0,897`, `2.419`, `8.666`; as written, "2,419 mensagens" reads as two-point-four. Worth fixing with the same pass as ISSUE-006.
- contracts sections 4-tail (5 more evidence cards, playbook draft, both export buttons, disclaimer) and pii's benchmark + redaction tail were never in frame — existence confirmed in DOM, appearance not judged.

**Hypotheses killed this round (so they are not re-reported):**
- *"Contracts says 5 EXACT but the table shows 6 EXACT pills."* I count six (rows 2,3,4,7,9,10). The counter block reconciles only if `UNVERIFIED 2` = fuzzy + not_found (5+1+1+1). At 0.83× a 10 px pill is ~8 px, so this is **either my misread or a real off-by-one** — flagged for a 1:1 check, deliberately not counted.
- *"Lesson 10's number is clipped in its box."* `.row .num` is a 64 px column, 14 px mono, two digits — fits. Downscale artifact.
- *"pii lost its yellow rule under the H1."* The markup has `div.rule` (56×2 px); at this scale it is sub-2 px. Not assertable either way, so not reported.
- *"The pii table is clipped at the right edge."* It stops at the wrap column, not the viewport. The defect is mid-token breaking (ISSUE-002), not clipping.

## 6. Verdict

**PASS WITH FIXES.** All four pages render, prefill, auto-run, hold the token system, and tell the truth about being simulations — the round-3 blocker class (empty output, missing disclaimer, dead end) does not recur anywhere. What is left is six mediums, none architectural: **ISSUE-001** is the one to fix before anyone sees this set (a demo of a guided flow that opens on its last screen with the rail inert and half the page empty), **ISSUE-002** and **ISSUE-003** are the two "the table can't be read at a glance" defects on the pages whose entire value is a table, and **ISSUE-006** is the only one a domain reader will call wrong rather than rough. ISSUE-004/005 are the consistency debt that keeps regenerating every round — a shared header partial and one nav component would close 004, 005 and 012 together. ISSUE-001, 002, 003 and 007 are each a CSS or markup edit, not a redesign.

**Gaps.** Static captures only: no console/network signal, no clicks — the two-step submit, the back-chain, both export buttons, `Reanalisar`, the HF links and every lesson page are unexercised; sticky behaviour under scroll unverified. Client-intake steps 1–3 were never rendered, so their design is unjudged. All mobile widths and the `/` landing (round-3 capture only, predates these four) are outside this round. Reads are at 0.83× of the 1280 capture, so sub-2 px features and 8 px pills carry reading risk — the one place it matters is flagged in §5 rather than asserted.

---

Status:  DONE_WITH_CONCERNS
Session: dogfood-visual-round4-20261107
Report:  returned inline above (parent to save as `dogfood-report-visual-round4-20261107.md`; nothing written to disk per instruction)
Counts:  C/0 · H/0 · M/6 · L/9
Top findings: Client intake opens on step 4 — matter picker, proposed questions and review are absent from first paint, the 5-step rail is inert, and ~58% of the frame is empty (001); pii's entity table breaks CPF/RG/CNPJ/e-mail mid-token (002); contracts renders AVOID and FALLBACK-TIER-1 as the same yellow pill (003); the course page has no way back to the artifacts catalog and no black bar (004); header templates still diverge 26 vs 38 px with a shipped `!important` patch as the cause (005); pii cites LGPD "Art. 5º, II, f" alíneas that the statute does not contain (006).
Gaps:   no live browser — clicks, exports, console and scroll unverified; pii benchmark + redaction tail and contracts' export/draft sections sit below the 2400 px frame (existence source-verified, appearance not judged); steps 1–3 of client-intake unrendered; no mobile widths.