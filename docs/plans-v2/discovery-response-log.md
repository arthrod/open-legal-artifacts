# Planner — run 7290de40 participant 6

Recon complete. Evidence tiers kept separate below; counterpart facts come from the fetched repo + local catalog (secondary sources), our facts from reading every file in the artifact.

## Improvement plan — discovery-response-log vs Anthropic's gallery original

**1) THEIR EDGE**
- Drafts responses *from the case file* (catalog §2.11 / S4 #7: "Drafts a response from the case file") — ours only formats user-supplied text.
- Every output is source-linked to case-file docs; our Bates cites are free text, never checked.
- Feeds from eDiscovery connectors — Everlaw, Aurora/Consilio, CourtListener (repo `litigation-legal` README, fetched 2026-11-07); we have no production-set input path.
- Guardrail machinery: `[CITE]/[VERIFY]/[SME VERIFY]` markers + explicit gates before anything is sent (repo README); we have no review/sign-off state.
- Interactive gallery board with worked example; our demo is minimal.

**2) OUR GAPS (top 5)**
1. No citation verification against any production manifest; README even promises "CSV-style exports" — core has none.
2. `reviseDraft` bug: ignores `config.objectionGrounds` and *silently drops* unknown ids, violating our own "throws on unknown" contract.
3. No attorney sign-off/release gate in the data model.
4. Deadline engine: `holidays` config documented but ignored (dead param); no FRCP 29(b) stipulated-extension records; ids from a module counter → output not call-order deterministic.
5. Privilege screen is substring-only — boilerplate ("without waiver of privilege") false-flags everything; `toMarkdown` omits M&C diffs, hiding our differentiator.

**3) IMPROVEMENTS (change / why beats / acceptance test / size / files)**
1. **Citation-manifest check** — `citations[]` per entry + `config.productionManifest` (Bates ranges); cites outside manifest → `citationFlags`. Beats: machine-checked provenance vs decorative links. Test: cite `VEST 9999` outside manifest → flagged. **M** — `core/core.js`, `core/core.test.js`, `examples/`.
2. **Fix `reviseDraft`** — accept config; throw on unknown grounds (failing test first). Test: `reviseDraft(e,{objectionIds:['nope']})` throws. **S** — `core/`.
3. **Release gate** — `reviewState: draft|in-review|approved` + `assertReleasable(log)` throwing on unapproved/privilege-unsafe. Beats: code-enforced vs prompt-enforced gate. Test: releasable only after approve+safe. **M** — `core/`.
4. **Stipulated extensions (FRCP 29(b))** — set-level `extensions[]`; `calculation[]` gains an audit line per stipulation; remove/implement dead `holidays` param. Test: +14d agreed → dueDate shifts + trace line. **M** — `core/`, spec.md.
5. **Deterministic ids** — derive from `requestNo`; drop `seq`. Test: two `buildLog` calls deep-equal. **S** — `core/`.
6. **Export parity** — implement `toCSV(log)`; add per-round diff table to `toMarkdown`. Test: CSV row count; round-1 diff line present. **S/M** — `core/`, `examples/run.js`.
7. **Privilege-screen context rules** — deterministic negation/waiver patterns don't flag; `config.privilegeMarkers` override. Test: waiver boilerplate → `privilegeSafe:true`. **M** — `core/`.

**4) VERIFIABLE-BETTER CLAIM + PROOF**
After 1–7, ours is the only version with machine-checkable guarantees: green `node --test core/` (target ≥26 tests), byte-identical rerun of `node examples/run.js` (diff proof), audited deadline trace incl. stipulations, code-enforced release gate, manifest-checked citations. Theirs has none mechanically — the artifact is gallery-only; no discovery-response agent exists in `anthropics/claude-for-legal` (full agent table checked on-run).

**5) RISKS**
- Their LLM drafting from case files can't be matched in an LLM-free core — positioning must be "verify + keep the record", not "draft".
- Manifest check is only as good as the supplied index; negation rules risk under-flagging (keep flag-on-uncertain default, documented).
- Counterpart facts rest on secondary sources + repo, not in-gallery inspection.
- `demo/index.html` references `tokens.css`/`../core/core.js` — confirm the Val Town deployer inlines both, else constraint "single self-contained file" is already violated.

**Tests:** no execution tool exists in this read-only planner environment, so I could not run `node --test core/` — that is a fact, not a pass. Static trace of all 14 existing tests against `core.js`: every assertion hand-verified (deadline math, diffs, screens, counts) → expected **PASS 14/14**. Inference, not a run: execute before building on it.

STATUS: DONE_WITH_CONCERNS