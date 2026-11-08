# Planner — run 7290de40 participant 9

Recon complete. Counterpart evidence gathered on-run: the eviction checker exists only as a gallery item (S4 one-liner: "Checks a notice against your checklist, flags failures" + the gallery-wide model from the launch article); the Apache-2.0 repo has **no** eviction-checker agent/skill (verified via repo agent table + legal-clinic skills listing — closest is `/draft` eviction answers). I did not invent features beyond that. Deliverable:

**1) THEIR EDGE** (evidence: launch article S1; Uwais Iqbal 32-artifact enumeration S4; repo README/legal-clinic README S2, all fetched this run)
- Document-first: upload the notice; Claude does the first pass (S1 gallery model). Ours: hand-attest every field.
- Every output links to its source (S1). Ours: attestations carry zero provenance.
- "Your checklist" (S4) — runs on the clinic's own checklist out of the box.
- Ecosystem: 60+ connectors, sharing/ethical walls (S1); citation tiering via CourtListener/Descrybe (S2).
- Mature guardrail vocabulary: [VERIFY]/[UNCERTAIN]/[FACT NEEDED] markers + supervision gates (S2 legal-clinic).

**2) OUR GAPS (top 5)**
1. No document-intake path; spec's extraction schema is unimplemented.
2. Attestations unauditable — no quote/attester/date per fact.
3. Dead rule data: `excludeWeekendsHolidays` never read; no deadline computation; no ruleset versioning/asOf.
4. Coverage: 5 states, 7 notice types, no city overlays, no language-requirement rows.
5. Demo isn't self-contained as authored (links `tokens.css`, imports `../core/core.js`); no batch mode or export buttons in demo.

**3) IMPROVEMENTS** (change / why beats / acceptance test / size / files)
1. Evidence-backed attestations: contents accept `{present, quote}`; rows echo the quote. Beats their source-link with user-verifiable verbatim text. Test: row contains quote; absent quote → unverified. **S** `core/core.js`, `core.test.js`.
2. Deadline engine: compute earliest-lawful-filing + expiration from serviceDate, weekend/holiday exclusion implemented (holiday dates as data). Theirs has no published computation at all. Test: served Fri, 3-day excl-weekend → pass only from Wed. **M** core.
3. Ruleset provenance: `asOf`, `version`, ruleset hash stamped into board output. Theirs: invisible rules. Test: hash present & stable. **S** core.
4. Clinic-checklist import: user checklist JSON merges as extra cited rows, same never-guess semantics — matches "your checklist" with auditable data. Test: custom row renders + cites. **M** core.
5. Paste-the-notice intake bridge: deterministic regex/gazetteer extractor drafting attestations (all fields nullable), human confirms — their upload UX, LLM-free. Test: fictional notice text → draft JSON, nothing inferred. **L** `core/extract.js` + tests.
6. Data breadth: +5 states + city-overlay example (fictional overlay, real states stay example-marked). Test: jurisdiction count, known-type listing. **M** core data.
7. Demo: inline core+tokens (single file per contract), batch board, MD/CSV export buttons. Test: no external `href/src` in demo; exports byte-match `renderBoard/toCSV`. **S** `demo/index.html`.

**4) VERIFIABLE-BETTER CLAIM** — after 1–4+6: ours emits a fully-cited, versioned, never-guesses board from inspectable rules-as-data, offline, zero deps — every property pinned by failing-test-first (`node --test core/*.test.js`, 18→~35 tests). Proof = green suite + git diff of new tests; their rules/checklist logic is unpublished (repo verified silent on it).

**5) RISKS** — rules staleness (keep "verify locally" marks); holiday/counting variance by state; extractor regex brittleness; demo size growth vs single-file; counterpart detail limited to S4 one-liner — comparison claims stay at gallery-model level.

**Tests: NOT RUN** — this session has no shell/exec tool (tool_search: zero hits for exec/terminal/shell); I verified statically: 18 `test()` blocks in core.test.js match README's "18 tests". Last known state green per README; unverified this run.

DONE_WITH_CONCERNS