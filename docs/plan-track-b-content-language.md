# 规划师 — run 7297b763 participant 1

# TRACK B Plan — Humanize keys, unify verdicts, kill the repetition tax

## 1. Goal & non-goals

**Goal.** In the seven sampled demos (`open-artifacts/{limitations-radar, cite-check, fact-chronology, playbook-deviation-board, tabular-review, renewal-calendar, matter-board}/demo/index.html`), no machine key reaches the visible page as text; equivalent checking-states print one shared vocabulary; boilerplate caveats print once per section. All changes are render-time only — cores keep emitting ids and every existing core test stays green.

**Non-goals.**
- No changes to any `core/core.js` output shape, id, or export (md/csv/ics/json exports keep ids deliberately — they are audit artifacts; `output.json` is asserted by tests).
- Not in scope: client-intake rail (`4 · confirm gate`), the app-SPA demo pages (`app/src/pages/*.ts` — they print raw `${f.classification}` too), the course double list, the landing promo duplication, the 404, nav unification, fonts (other tracks). Same module adopts there later; listed in §9.
- No new visual language: labels reuse existing pill/badge styles and the current ink palette.

## 2. Preconditions & assumptions (verified unless marked)

- Demos deploy via `tmp/open-legal-artifacts/deploy/build-site.mjs`: each `demo/index.html` → `vt-val/site/<name>.html` with module imports data-URI-inlined; pages near the 78 KB warn threshold must stay small (cite-check already inlines its core verbatim for this reason — comment in `cite-check/demo/index.html`).
- House pattern for shared code exists: `open-artifacts/_shared/` canonical pure-ESM modules, ≤20 KB, vendored into artifact `core/` with byte-parity tests (`_shared/README.md`). Tests run `node --test` (e.g. `limitations-radar/core/core.test.js` line 1).
- The seven demos' render code is inline in each `demo/index.html` module script; playbook board already has a local `HL`/`DEC` humanized map — the exemplar to generalize.
- Enum inventories below were read out of the cores this run (paths cited per table). fact-chronology `provenance`: `document | user | unverified` (`core.js:115`).
- **Assumption to confirm at kickoff:** no hidden consumers grep demo HTML for raw id text (e.g. e2e tests). I found none in `open-artifacts/`; the catalog links to demos by URL only.

## 3. Item 4 — Humanize database keys

### Design: one canonical engine + per-demo tables, applied at render

New canonical module **`open-artifacts/_shared/display-labels.js`** (~2 KB, pure ESM, zero imports):

- `humanizeKey(id)` — generic fallback: split `[-_]+`, lowercase-join, capitalize first word. `deadline-within-30-days` → "Deadline within 30 days"; `not_found` → "Not found".
- `makeLabelFn(table)` → `label(key)` returning `{ label, detail }`. Resolution order: table override → `humanizeKey` fallback. Never throws; unknown key still returns a humanized string (so a user-defined YAML rule id can never crash a page).
- `LEXICON` + `mapToCanonical(tool, state)` (item 6) and `collapseBoilerplate(notes, matchers)` (item 7) live in the same module so demos vendor **one** file.

Each demo vendors the engine into `core/display-labels.js` per the README protocol (byte-parity test included) and defines **its own domain table as a local const next to its render code** — presentation data, not core data. Render rule: every place a status/rule id is currently interpolated becomes `label(id).label` (escaped), with the raw id kept machine-accessible: `data-key="${esc(id)}"` on the pill/badge element. CSS class hooks keep using the raw id unchanged (`.badge.deadline_upcoming` etc. already do).

### Exact label sets (the full inventory found in the sampled cores)

**limitations-radar** (`core.js:76–119, 194–245`; demo lines 99–110):

| Key | Display label |
|---|---|
| `filed_timely` | Filed on time |
| `filed_late` | Filed late — past the deadline |
| `deadline_upcoming` | Deadline ahead — not yet filed |
| `deadline_passed_unfiled` | Past deadline — never filed |
| `data_needed` | Cannot compute — missing data |
| conflict `discovery_precedes_injury` | Discovery date precedes injury date |
| claimType `personal_injury` / `breach_of_contract_oral` / `breach_of_contract_written` / `fraud` / `property_damage` | Personal injury / Breach of contract (oral) / Breach of contract (written) / Fraud / Property damage |
| ruleIds `{CA,NY,TX}-SOL-{PI,CO,CW,F,PD}` | "CA · personal injury · limitations period" style (jurisdiction + claim family; keep the code in `title=""`/`data-key` — the full human sentence already sits in `basis[].text`) |
| tolling `{CA,NY,TX}-TOL-{1..4}`, `MARGIN` | Use the rule's existing `note` field verbatim where shown; `MARGIN` → "Filing margin" |

**cite-check** (inlined core, classification ladder + `checkPinpoint`):

| Key | Display label |
|---|---|
| `exact` | Verbatim |
| `normalized` | Near-verbatim (case/punctuation) |
| `fuzzy` | Substantial overlap — not verbatim |
| `not_found` | Not in the record |
| pinpoint `ok` | Pinpoint confirmed |
| pinpoint `mismatch` | Pinpoint mismatch |
| pinpoint `unverifiable` | Pinpoint not checkable |
| pinpoint `unparseable` | Pinpoint format not recognized |

**fact-chronology** (`core.js`): `verified → Quote located`, `approximate → Quote approximate`, `unfound → Quote not found`; precision `day/month/year → exact day / month only / year only` (currently raw `${d.precision}` in the demo's `entry()`); conflict kinds `date_mismatch → sources disagree on the date`, `divergent_accounts → divergent accounts`; provenance `document/user/unverified → from documents / user-supplied / unverified`. Significance 🔴🟡⚪ stays (already human-shaped).

**tabular-review** (`core.js:300–384`): status `answered → Answered — anchored`, `unverified → Unverified`; reasons: `not_answered → no answer supplied`, `missing_quote → no supporting quote`, `quote_not_verified → quote does not locate in the document`, `constraint_violation → answer fails the question's schema`, `no_such_document → references an unknown document`, `no_such_question → references an unknown question`, `unclear → clause unclear — needs human reading`, `needs_review → flagged for review`, `not_present → not found in the document`; flag `outlier_value → outlier — differs from the column`. The "machine reasons" gate block keeps ids in `<code>` beside labels (that block is addressed to engineers by design).

**playbook-deviation-board**: keep `HL`/`DEC` values (already humanized) but move them into the shared-table form; **rule ids** (user-defined YAML like `term`, `liability`) render as the rule's `topic` field ("Term", "Limitation of Liability") with the id in `data-key` — no fixed table possible for user data, so: `topic ?? humanizeKey(ruleId)`.

**renewal-calendar** (`core.js:96–266, 350–440`): `confirmed → Confirmed — exact date`, `ambiguous → Ambiguous — flagged, conservative reading`, `unresolved → Unresolved — needs review`, `computed → Computed from the clause`; urgency tiers `overdue → Overdue`, `30d/60d/90d/180d/later → due within 30/60/90/180 days / later`; ambiguity types `quarter-selection → quarter-end assumed`, `month-selection → month-end assumed`, `window-direction → direction unstated — earlier date used`, `window-direction-and-quarter/-month` → the combined sentence; `leadTimeSource` (`rules.byClauseType[x]`, `rules.defaultLeadTimeDays`, clause override) → "lead time from rules (auto-renewal: 90d)" phrasing with the raw source in `data-key`.

**matter-board** (`core.js:40–50, 151–171, 222–223`): severity `critical → Critical — deadline moved`, `major → Major`, `minor → Minor`; flags `overdue → Overdue`, `due-soon → Due soon`; anomaly `closed-with-deadline → closed matter still carries a deadline`; stages are user data — `humanizeKey` fallback only. **Drive-by bug fix:** the changelog renders `<span class="sev ${c.sev}">` but the field is `c.severity`, so `.sev.critical/.major` CSS never applies — fix to `${c.severity}` in the same edit.

### Files + changes (item 4)

1. **Add** `open-artifacts/_shared/display-labels.js` + `display-labels.test.js` (§6 TDD).
2. **Add** `deploy/check-display-labels.mjs` — post-build guard: for each of the 7 built `vt-val/site/<name>.html`, strip `<code>…</code>` spans and tags, then assert the forbidden-id regex (`deadline_passed_unfiled|not_found|data_needed|filed_late|deal_breaker|unverifiedReason ids|outlier_value|due-soon|…` — the full inventory above) does not match visible text. Exit 1 on violation. (`<code>` is exempt: legends and the machine-reasons gate intentionally keep keys, now always inside `<code>`.)
3. **Edit each of the 7** `demo/index.html` scripts: vendor engine import (`../core/display-labels.js`, itself vendored from `_shared`), add the local `L` table, wrap every raw interpolation (`${esc(c.status)}`, `${esc(c.classification)}`, `${esc(c.ruleId)}`, `${esc(d.precision)}`, `${esc(c.kind)}`, `${esc(c.unverifiedReason)}`, `${esc(c.severity)}`, `${e.urgency.tier}`, …) with `L(key)` + `data-key`. CSS untouched (classes already key off ids).

## 4. Item 6 — Unify verdict vocabulary

### Lexicon (canonical five)

`VERIFIED` · `SUPPORTED` · `UNVERIFIED` · `NOT FOUND` · `CONFLICT` — exported as `LEXICON` from `display-labels.js`, resolved by `mapToCanonical(tool, state)`:

| Tool state | Canonical | Subtitle (per-tool nuance, rendered as the pill's small sub-line) |
|---|---|---|
| cite-check `exact` / `normalized` | VERIFIED | verbatim / near-verbatim — case/punctuation only |
| cite-check `fuzzy` | SUPPORTED | substantial overlap, not verbatim — review |
| cite-check `not_found` | NOT FOUND | no located anchor |
| cite-check pinpoint `mismatch` | CONFLICT | cited page ≠ located page |
| fact-chronology `verified` | VERIFIED | quote located |
| fact-chronology `approximate` | SUPPORTED | near-match only |
| fact-chronology `unfound` | NOT FOUND | quote does not locate |
| fact-chronology conflict kinds | CONFLICT | date_mismatch / divergent_accounts label |
| tabular-review `answered` + exact/normalized | VERIFIED | anchor + classification |
| tabular-review `answered` + fuzzy | SUPPORTED | quote fuzzy — review |
| tabular-review `unverified` (all reasons) | UNVERIFIED | reason label from item 4 |
| playbook `compliant` | VERIFIED | matches preferred standard |
| playbook `deviates` | SUPPORTED | fallback tier / beyond playbook |
| playbook `deal_breaker` | CONFLICT | triggers an avoid rule |
| playbook `unclassified` | UNVERIFIED | no rule assigned |
| limitations `data_needed`, renewal `unresolved` | UNVERIFIED | missing data / needs review |

Deadline *states* (limitations `filed_timely/deadline_upcoming/…`, renewal `confirmed/ambiguous`, matter-board flags) are not verification verdicts and keep their item-4 labels — forcing them into the five would lie. They adopt the **ink contract** instead (below).

### Ink contract + how each demo adopts without breaking core tests

One shared severity-of-ink mapping, defined once as class names in each demo's existing `<style>` (copied verbatim, ~6 lines): `v-verified` (green outline), `v-supported` (amber outline), `v-unverified` (neutral dashed), `v-notfound` (black solid pill), `v-conflict` (black pill + `--flag-tint` row tint). This resolves critique2-P2's "dangerous error is the quiet one": CONFLICT now outranks NOT FOUND in ink everywhere.

- **cite-check demo**: pill renders canonical + subtitle; **tint every adverse row** (replace the `adverse && !firstFlagDone` single-tint at the table renderer with tint on all `mismatch`/`not_found` rows, CONFLICT rows first in ink order); add the "N issues · jump to first" anchor line the critique asked for; fix the summary/table vocabulary split ("not found" text vs `NOT_FOUND` pill disappears because both now read NOT FOUND with different case by CSS).
- **fact-chronology, tabular-review, playbook demos**: pills/badges swap to canonical+subtitle via `mapToCanonical`; existing amber/black styling comes along through the ink classes.
- Core tests: untouched — lexicon resolution lives only in demo render code; `renderReport`/`toCSV`/`toICS` keep emitting ids, and their tests (e.g. `limitations-radar/core/core.test.js:31` asserting `deadline_passed_unfiled`) stay green.
- Legend line added under each summary (once, per item 7's rule): "Verdicts mean the same thing in every artifact — VERIFIED (checked, matched) · SUPPORTED (located, needs review) · UNVERIFIED (not checkable) · NOT FOUND (absent from the record) · CONFLICT (sources disagree)."

## 5. Item 7 — Repetition tax

**Rule (pick one — chosen: drop, not footnote):** a boilerplate sentence renders **once per section, at the section head, with the count**; subsequent per-item occurrences are **dropped** at render. Rationale: a footnote marker per card re-clutters what the dedup removes, and the count preserves the guarantee ("applies to N of 10 quotes") that the per-card repetition was providing.

Pure helper `collapseBoilerplate(notes[], matchers[])` → `{ kept[], collapsed: {matcher → count} }`.

Applications:
- **cite-check** (the 8× offender): core appends `"proposition support is an LLM/human judgment — not evaluated by this core"` to every located quote with a proposition (core keeps doing so — tests assert it). Demo's workbench queue filters it from per-card notes via the helper and renders once above the queue: "Proposition support for N quotes is an LLM/human judgment — not evaluated by this core." Same treatment for the repeated `"requires human review"` tail only when the card carries no more-specific guard note (number/negation/insert notes stay — they are data).
- **limitations-radar**: the gate box prints once already — no change; per-claim `basis` lines stay (data-bearing).
- **fact-chronology / tabular-review / matter-board**: audit note is that repeated identical `unverifiedReason` sentences in tabular-review's "Why unverified" block collapse to "no answer supplied — ×12" grouped counts (helper reused with a group mode); others audited at implementation, only identical-sentence repeats touched.

## 6. Steps, dependencies, TDD acceptance

1. **Write `_shared/display-labels.js` + `display-labels.test.js`** (TDD: tests first).
   - Deliverable: canonical module + suite. Depends on: nothing.
   - Acceptance (`cd open-artifacts/_shared && node --test`): `humanizeKey` covers snake/kebab/mixed/numeric (`deadline-within-30-days`, `not_found`, `due-soon`, `30d`, `{CA}-SOL-PI`), is idempotent, never throws on empty/unicode; `makeLabelFn` override-beats-fallback, unknown key → humanized, key preserved; **exhaustive inventory test** — every key in §3–§4 tables maps to a non-empty label that ≠ the raw key (this test is the label inventory, so adding an enum without a label fails CI); `mapToCanonical` covers every state of all five tools, unknown → `null` (caller falls back to `label()`); `collapseBoilerplate` keeps first, drops repeats, counts, empty-safe.
   - Estimate: optimistic 2 h · realistic 3 h · pessimistic 5 h (pessimistic if the exhaustive inventory uncovers enums missed in sampling — mitigated by the inventory test failing loudly, not silently).
2. **Vendor into the 7 demos' `core/`** (README protocol: copy + provenance header + byte-parity test in each `core/core.test.js` run).
   - Acceptance: `node --test` green in each of the 7 artifact dirs; `wc -c` confirms vendored file ≤ 20 KB.
   - Parallelizable per demo. Estimate: 30 min each (×7 ≈ 3.5 h realistic; 1 h each pessimistic if a demo's import graph surprises — cite-check's verbatim-inlined core means its vendored copy is imported directly by the page script; verify data-URI inlining keeps the page under the 78 KB warn line in step 4).
3. **Adopt per demo** (order: cite-check → tabular-review → limitations-radar → fact-chronology → playbook → renewal-calendar → matter-board; cite-check first because it carries items 4+6+7 plus dogfood finding 8).
   - Each demo: local `L` table + `L()` wraps + `data-key` + canonical pills + ink classes + dedup at the noted blocks; cite-check also: all-adverse-rows tint, "N issues · jump to first", anchor cells `page 12 · chars 198–295` (dogfood #8), matter-board also: `c.sev → c.severity` bug fix.
   - Acceptance per demo: manual run of the worked example shows zero underscore/hyphen-enum text outside `<code>`/`data-key`; all pre-existing demo behavior otherwise identical; core tests untouched and green.
   - Estimate: cite-check 3 h (realistic) / 5 h (pessimistic — largest demo); others 1–1.5 h each / 2.5 h.
4. **Build + guard**: run `node deploy/build-site.mjs`, then `node deploy/check-display-labels.mjs` (written in step 1's PR or its own; smallest as part of step 1).
   - Acceptance: build reports no new oversized pages; guard exits 0 on all 7 pages; guard exits 1 when deliberately fed a page with a raw id in text position (self-test flag `--selftest`).
   - Estimate: 1–2 h.
5. **Screenshot verification pass** (see §8) + report file `evidence/trackb-labels-verification.md` (parent persists).
   - Estimate: 1 h.

Steps 2's seven vendoring tasks are parallel; step 3 per demo depends only on that demo's step 2. Step 4 depends on all of step 3.

## 7. Critical path & milestones

**Critical path:** module+tests → cite-check adoption → build+guard → screenshots (≈ 3 + 3 + 2 + 1 = 9 h realistic).

- **M1 — Engine green:** `_shared` `node --test` passes including the exhaustive inventory test. Deviation signal: inventory test reveals enums beyond §3's tables → stop, extend tables (frame step), never let the fallback silently cover a new enum.
- **M2 — One demo fully converted (cite-check):** worked example shows canonical verdicts, all-adverse tints, caveat once, `chars` units; its core tests still green. Deviation signal: page size crosses the 78 KB warn line → switch cite-check's vendored import to a pasted table (engine stays canonical+tested in `_shared`).
- **M3 — All seven converted:** guard passes on the built site. Deviation signal: guard's `<code>` exemption hides a real leak → tighten to a per-page allowlist of code spans.
- **M4 — Verification evidence filed:** screenshots + report persisted.

## 8. Verification screenshots (1280×900, `tmp/shots/trackb/`)

1. `01-citecheck-verdicts.png` — summary + table: canonical pills, every adverse row tinted, "N issues · jump to first" line.
2. `02-citecheck-caveat-once.png` — workbench queue head with the single caveat line; queue cards free of repeated boilerplate.
3. `03-citecheck-anchor-units.png` — anchor column reading `page 12 · chars 198–295`.
4. `04-limitations-statuses.png` — worked example showing "Past deadline — never filed", "Cannot compute — missing data", basis chips with rule labels.
5. `05-tabular-unverified.png` — matrix cells "UNVERIFIED — no answer supplied" style + grouped "Why unverified" counts block.
6. `06-chronology-conflicts.png` — conflict cards with human kind labels, precision labels in the date rail.
7. `07-playbook-rule-topics.png` — board columns + drawer showing rule topic instead of bare id.
8. `08-renewal-ambiguity.png` — timeline with tier labels and ambiguity-flag sentences.
9. `09-matterboard-severity.png` — changelog severity pills (now actually styled — bug fix visible).
10. `10-cross-tool-verdicts.png` — one side-by-side composite (or two frames) of cite-check / chronology / tabular pills proving the same five labels + ink order across tools.

## 9. Risks

| Risk | P×I | Mitigation |
|---|---|---|
| Page-size cap: vendored import pushes cite-check or tabular-review over 78 KB | Med × High | Table stays local (≈0.5 KB), engine ≤2 KB; fallback: paste table, keep canonical engine tested in `_shared` (switch condition = M2 deviation signal) |
| New enums appear in cores later and silently render via `humanizeKey` fallback | Med × Med | Exhaustive inventory test enumerates known keys; unknown key returns humanized **plus** `data-key` — and the guard script can flag `data-key` values lacking table entries in a `--strict` mode |
| Legend `<code>` exemption in the guard masks real leaks | Low × Med | M3 deviation signal; per-page allowlist fallback |
| Canonical labels confuse returning users of the old vocabulary (NOT_FOUND etc.) | Low × Med | Old label always present as the pill subtitle; legend line defines the five once per page |
| Dual shells drift: `app/src/pages/cite-check.ts` (in-app variant) keeps raw enums — same defect, second copy | High × Med | Out of this track's scope by assignment; recorded here as the first fast-follow (module is already vendorable into the SPA) along with client-intake's `confirm gate` rail |

## 10. Decisions needed (defaults given — proceed on default if silent)

1. **Export files (md/csv) keep raw ids** (default: yes — they are audit artifacts asserted by core tests; only HTML demos humanize). Alternative: humanize md/csv too via a render flag — would touch cores, against the brief.
2. **Dropped repeats, not footnoted** (default: drop + count at section head — §5).
3. **Deadline states stay out of the five-label lexicon** (default: yes, ink contract only — §4).
4. **Client-intake rail + app-SPA pages in this pass?** Default: no (brief scoped the seven demos); say the word to add ~2 h.