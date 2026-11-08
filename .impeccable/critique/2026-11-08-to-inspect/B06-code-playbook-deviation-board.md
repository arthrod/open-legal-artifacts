# B06 — code inspection: Playbook deviation board

**Pair.** THEIRS: `_to_verify/Playbook deviation board (Copy).html` (single-file artifact export, 4,261,343 B; extracted scripts to `/tmp/b06/js/`). OURS: `open-artifacts/playbook-deviation-board/` (TS core + `core/core.js` port + `demo/`).
**Method.** Extracted their 25 script blocks; read our core line-by-line (`board.ts`, `textutil.ts`, `yaml.ts`, `redline.ts`, `diff.ts`, `drift.ts`, `core.js`, demo); ran our test suite (31/31 pass, `npx tsx --test core/*.test.ts`); regenerated examples and byte-diffed (`examples/run.ts` → identical); drove both sides in headless Chromium (Playwright) at `http://127.0.0.1:8923/`, incl. clicks and downloads; adversarial probes against our classifier via `core.js` (scripts at `/tmp/b06/probe*.mjs`).
**Screenshots.** `tmp/shots/to-inspect/playbook-deviation-board/`: `ours-initial`, `ours-full`, `ours-trace`, `theirs-initial`, `theirs-full`, `theirs-contract`, `theirs-cell`.

## 1. Conclusion

**Not shippable as-is against this counterpart: 3 must-fix findings in our core (all correctness-layer).** The deeper problem is scope: theirs is a working product — docx/pdf ingestion in-browser, Claude-graded 8×10 contract-topic matrix, human decisions, tracked-changes Word redline, db persistence — while ours is a deterministic library with a single frozen fictional example that a viewer cannot feed their own contract into. Our determinism, tests, evidence quoting, and cost profile are real and verified; but the avoid-rule detection hole (M1) means the core can miss verbatim deal-breaker language, which undercuts its entire "deterministic safety net" pitch. Fix M1–M3, then decide whether the demo stays a showcase or gains an ingestion path.

## 2. Must-fix

### M1 — Similarity-mode avoid rules miss deal-breaker language embedded in a longer clause (false negative on the most severe class)
- **Location.** `core/board.ts` `classifyClause()` avoid branch (whole-clause `similarity(clause.text, av.text)`); `core/textutil.ts` `similarity()` (whole-text Jaccard). Test gap: `core/board.test.ts:126` — the only similarity-mode avoid test uses an 18-word clause (sim ≈ 0.95).
- **Problem.** Jaccard over the whole clause means adding unrelated boilerplate dilutes the score below the threshold. Probe: avoid text `mode: similarity, threshold: 0.6` = *"Provider shall be liable for all consequential damages and lost profits of the customer without cap"*; clause containing that sentence **verbatim** plus ~50 words of services boilerplate → similarity ≈ 0.28 → classified `deviates` (beyond playbook), **not** `deal_breaker`.
- **Impact.** A counterparty buries uncapped-liability or similar deal-breaker wording anywhere inside a long clause and our board routes it as an ordinary deviation. The failure direction is the dangerous one (missed worst-case, not over-flagging). `contains`-mode rules are immune; every `similarity`-mode avoid rule in a real playbook is exposed.
- **Basis.** Live probe `/tmp/b06/probe2.mjs` (T1) against `core/core.js`; shipped example's own playbook uses a similarity-mode avoid (`consequential-damages carve-out`, threshold 0.6), so this is not a hypothetical mode.
- **Fix direction.** Score avoid rules by containment, e.g. `bestWindow(clause.text, av.text)` coverage/score (the machinery already exists in `scoreStandard`), or `max(whole-similarity, window-similarity) ≥ threshold`; add a long-clause regression test.

### M2 — Deal-breakers on rules without `escalation` route to nobody
- **Location.** `core/board.ts` `classifyClause()` deal-breaker return: `routedTo: approverFor() === '__DEFAULT__' ? null : approverFor()`; contrast the beyond-playbook return (`rule.escalation?.approver ?? '__DEFAULT__'`) and the unclassified row (`defaultApprover`).
- **Problem.** When a rule has `avoid` entries but no `escalation` block, a `deal_breaker` row gets `routedTo: null` — no owner — while a milder beyond-playbook deviation on the same rule routes to `defaultApprover`.
- **Impact.** The most severe classification is the only one that can silently vanish from routing. A firm authoring a playbook without per-rule escalation (natural, given `defaultApprover` exists) gets unowned deal-breakers; `renderBoard` then prints no "Routed to" line at all.
- **Basis.** Probe `/tmp/b06/probe.mjs` C1: rule with avoid, no escalation → `C1 deal_breaker null`; C3 same rule beyond-playbook → `"Legal Ops"`. Shipped examples never surface it (both rules with avoid carry escalation).
- **Fix direction.** Fall back to `defaultApprover` for deal-breakers (one line), mirroring the beyond-playbook path; add a test.

### M3 — YAML parser silently mangles inline comments instead of erroring ("parse error, never a guess" is false)
- **Location.** `core/yaml.ts` `scalar()` / `KEY_RE`; same code in `core/core.js`.
- **Problem.** `label: "3-year fixed term" # note` parses to the value `"3-year fixed term" # note` — leading/trailing quote characters kept, comment text inside the value — with no error. Probe `/tmp/b06/probe4.mjs`: `a: "hello world" # a note` → `{"a":"\"hello world\" # a note"}`.
- **Impact.** The spec (`spec.md`, Playbook contract section) promises: *"Anything else → parse error, never a guess."* An author who annotates one line the way every mainstream YAML tool allows gets deterministically wrong labels/text flowing into the board with zero warning. Silent wrong data in a rules-as-data tool is worse than a crash.
- **Basis.** Live probe above; `scalar()` only strips quotes when the string both starts and ends with `"`, otherwise returns the raw remainder unchecked.
- **Fix direction.** After extracting the value, reject `#` following a closed quoted scalar (and any remainder that fails scalar parsing) with a line-numbered error, matching the documented contract.

## 3. Worth-considering

### W1 — Numeric guard fragments same-quantity formats (millions/GBP absent)
- **Location.** `core/textutil.ts` `UNITS`, `SCALES`, `numericTokens()`.
- **Problem.** Probes: `USD 1,000,000` → `["000","000","1"]`; `$1 million` → `["1"]`; `one hundred thousand pounds` → `[]`. "million"/"billion" are not scales; GBP/pounds not units. Three renderings of the same cap can never match each other.
- **Suggestion.** Commas-in-digits are at least self-consistent; extend scales (million/billion) and units (pound(s), GBP, million-adjacent handling), or canonicalize digit groups. Note the error direction today is over-flagging (false deviations), not false compliance — still noisy for real drafting.

### W2 — Section cross-references poison the numeric guard
- **Location.** `core/textutil.ts` `numericTokens()` (keeps `3.1`-style tokens verbatim by design).
- **Problem.** A preferred standard containing "per Section 3.1" demands `3.1` inside the matched span; a clause citing Section 3.2 is reported `standard requires [3, 3.1] but matched span has [3]` (probe: `/tmp/b06/probe.mjs`, second case).
- **Suggestion.** Exclude tokens that follow "section"/"clause"/"¶" from the numeric multiset, or only compare numbers adjacent to units.

### W3 — Beyond-playbook reasons reference a "matched span" the row never shows
- **Location.** `core/board.ts` beyond-playbook `numericNote`; shipped evidence `examples/output.json` row C7: *"standard requires [3] but matched span has []"* while `clauseQuote` is `null`.
- **Suggestion.** Either include the scoring window as the quote or reword ("no numbers found in the clause window"); auditors will hunt for a span that isn't there.

### W4 — Demo is a frozen showcase: no ingestion, no review loop surface
- **Location.** `demo/index.html` (single `example.js` contract; buttons = 2 exports only).
- **Problem.** The README advertises portfolio, decision log, board diff, and drift detection — none reachable from the demo; a viewer cannot paste a contract or edit the playbook. Against their page (upload docx/pdf → graded matrix → decisions → Word redline), our demo concedes the entire interactive category.
- **Suggestion.** Minimum: textarea/file input for contract JSON + playbook YAML, run through the same core, render the board live; ideally expose decide/diffBoards on a second run of the same contract.

## 4. Record only

- README says "25 tests"; suite is now 31 (stale count, tests grew).
- `deal_breaker` rows hardcode `similarity: 1` regardless of actual match strength.
- Duplicate YAML keys silently last-wins (`a:1\na:2` → `{a:2}`).
- Drift lookback window boundary counts whole months, ignoring the day (documented as "whole months" in the code comment).
- `boardHash` is FNV-1a 32-bit — collision-prone; caveat honestly documented at `core/diff.ts`.
- Ours: only console error is the server's favicon 404 (not ours). Theirs: 4 resource 404s on load under this host (favicon etc.), no JS errors.

## 5. Comparison against THEIRS (verified, both sides driven in-browser)

**Theirs is far ahead as a product.** Verified in the live page and code:
- Contract×topic matrix (8 contracts × 10 positions) with per-cell marks (Standard/Fallback 1–2/Deviation/Missing/Needs review), sample data loads standalone, no JS errors (`their.html` scripts 03, 23).
- Real ingestion: pdf.js 4.10.38 + vendored/patched docx-preview + JSZip, text extracted in-browser ("Files never leave the page" for reading; grading text does go to Claude) (scripts 06/07/10/18–21).
- Grading queue (script 13) is production-grade: concurrency cap, call cap per run, rate-limit pause with human resume, prompt-too-large auto-halving (depth 3), reply validation with per-field length limits, no auto-retry loops.
- Model layer (script 11) validates everything Claude returns, flags "unclear" playbook positions (case-by-case/TBD regex), detects multi-read conflicts ("Parts of this contract point to different marks" — seen live on Draycombe Wex), keys decisions to fingerprints of the playbook wording, logs contract removals.
- Redline (script 12) writes tracked changes into the counterparty's Word XML run-by-run and *refuses and names* edits it cannot place safely — a real .docx deliverable, versus our markdown `- /+` token runs.
- Cost pill discloses ~$0.55/contract on Opus 5.5 (script 04 CONFIG).
- Escalation/approval model: named approver per position, fallback approvers, default-approver note — richer than our two-level routing.

**Where ours is genuinely better (evidence-backed):**
- Determinism is total: regenerated `examples/` byte-identical; their marks depend on Claude calls (their own UI models failure/retry of every part).
- Zero marginal cost, zero data egress; their grading sends contract text to Claude and discloses a per-contract spend.
- Test suite (31) and char-anchored quotes with decision traces; auditable without any model.
- `core.js` port verified line-equivalent to the TS core (same algorithms, no drift found).

**Honest verdict.** On evidence, their engineering quality is not "cheap artifact" — it is a mature workflow app with careful validation. Our differentiators (determinism, no LLM, cost) are real but currently rest on a core with a deal-breaker detection hole (M1) and a demo that cannot consume user input. Close M1–M3 before shipping; W4 decides how serious we are about competing on the demo axis rather than the library axis.

## 6. Scope & not verified

- **Verified:** our full core by reading + 31/31 tests + determinism regen diff; probes against `core/core.js` for M1–M3, W1–W2; both pages loaded/clicked/screenshotted in Chromium (theirs: matrix → contract screen; ours: traces + both export downloads firing).
- **Not verified:** their Claude grading path end-to-end (no `window.claude` outside the artifact host — expected degradation, not a defect); their db persistence; their docx redline output bytes (code read, not executed on a real file); our `diff.ts`/`drift.ts` exercised only via the TS tests, not probed adversarially beyond suite; no load/large-contract performance testing of `bestWindow` (O(source × window) — fine at clause scale, unmeasured at whole-document scale).
