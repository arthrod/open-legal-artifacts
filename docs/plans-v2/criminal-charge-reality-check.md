# Planner — run 7290de40 participant 5

Recon complete. One notable find: the factor-matching logic in `applicableFactors` has a real cross-jurisdiction bug (`f.id.endsWith("F1")` catches PA-F1/OH-F1 diversion factors and mis-flags them on detention), unexposed because tests only cover NY factors. Also, no execution tool exists in this read-only session, so I hand-verified every one of the 13 tests against `core.js` (details below). Here is the deliverable:

---

**1) THEIR EDGE** (evidence: launch article fetched on-run; local catalog §3.10)
- "Public data on how those cases usually end" — real NY court data vs our `illustrative` fictional bands (article, §3.10).
- "Standard playbooks for release" — bail/release advocacy output class; we have none (article).
- Takes a raw NY Penal Law article/section charge directly — we require a pre-mapped `chargeClass` (§3.10 inputs).
- Practitioner grounding: built by Zealous/Scott Hechinger for public defenders (article quote).

**2) OUR GAPS (top 5)**
1. No release/bail playbook output.
2. `bandSource` is the string `"illustrative"` — not structured provenance (url/asOf/cohort/sample); spec's cited-data path is unverifiable.
3. Factor matching is label/id-string based and **buggy**: PA-F1/OH-F1 (diversion) are mis-flagged on `detained`; `diversionEligible` never flags them. No PA/OH factor tests.
4. Spec promises `uncertain[]` candidate multi-run ("shows both") — not implemented in core.
5. No plain-language client-facing output (catalog §3.10 explicitly recommends it).

**3) IMPROVEMENTS** (change / why beats theirs / acceptance test / size / files)
1. **Deterministic factor matching**: replace labels with explicit `when:{field,equals}` rules-as-data per factor. Beats theirs: closed prompt logic → testable data. AT: PA/OH `diversionEligible:true` flags PA-F1/OH-F1, never `detained`. S — `core/core.js`, `core/core.test.js`.
2. **Release playbooks module**: `releasePlaybooks` per ruleset — steps + motions with day offsets from arraignment (computed calendar dates), shown when `detained`. Beats theirs: their playbook has no published structure/dates. AT: `realityCheck(...detained:true).release` has dated steps; markdown section renders. M — core + renderReport.
3. **Structured provenance**: `bandSource:{kind,url?,asOf?,cohort?,sample?}`; report renders full citation or "illustrative — no empirical claim". Beats theirs: their methodology is unpublished. AT: validator test rejects malformed provenance; render shows asOf. S-M.
4. **Charge-code resolution**: fictional NY-code map (`resolveCharge("PL-165.45")` → class or ambiguous candidates) + `realityCheckMulti` running per candidate, both shown. Beats theirs: raw-charge input parity **plus** explicit uncertainty display. M.
5. **`renderPlainLanguage(report)`**: ≤200-word client summary, disclaimer first, deterministic readability guard (avg sentence/word length). AT: length + disclaimer-first + contains no undefined fields. S.
6. **Demo update**: candidate side-by-side + playbook + plain-language toggle, single self-contained file, arthur.law tokens. AT: manual browser check; no new deps. S-M — `demo/index.html`.

**4) VERIFIABLE-BETTER CLAIM**: After 1–5, ours beats theirs on every evidenced feature of theirs (sentencing range, outcome data w/ machine-checkable provenance vs unpublished, release playbook w/ computed dates) plus: 3 jurisdictions vs NY-only, unknown⇒unset errors, structural disclaimers, dependency-free deterministic core, explicit uncertainty multi-run, plain-language output — each pinned by a failing-test-first test. Proof: green suite (`node --test 'core/*.test.js'`, ~13→~24 tests) + diffed spec.md "BETTER" table mapped test-by-test.

**5) RISKS**: (a) Real cited court data needs maintainers — until then "beats theirs on data" is *provenance honesty*, not better statistics; say so. (b) Fictional charge codes must be unmistakably fictional (no real PL citations). (c) Plain-language heuristic ≠ validated readability. (d) Factor-id semantics change — keep ids stable, migrate `when` only.

**Tests**: could not execute — this session is read-only with no shell/execution tool (tool_search: no hits for shell/bash/sandbox). Static hand-trace of all 13 tests against `core.js`: every assertion verified passing (date math incl. 2026-11-02+330=2027-09-28, overrides, null-paths, PA/OH values, band sanity, markdown regexes). Executor must run the suite as step 0.

Status: DONE_WITH_CONCERNS (test run not executable here; outcome-data gap only partially closeable without data maintainers)