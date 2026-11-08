# Planner — run 7290de40 participant 23

All evidence is in. The counterpart is closed (0 "sealing" hits in the public repo), so "their edge" rests on the launch article, RfJ's own site, and the local catalog; our side I verified by reading every file. One delivery note: no shell tool exists in this session, so tests were verified against the recorded run log, not a live execution.

---

**1) THEIR EDGE** (counterpart closed: `anthropics/claude-for-legal` code-search "sealing" = 0 files; evidence = launch article + risingforjustice.org + local catalog)
- Reads the actual record — attorney brings client docs, "Claude completes the first pass" (article). We demand hand-built JSON.
- "Based on D.C. law" (article; RfJ site) — real statutory logic; our DC numbers are invented and cite nothing.
- Gallery UX: "Each answer or output has a link to its source"; shareable, connector-fed (article).
- Built inside RfJ's real sealing program; outputs motions to file (catalog S4 #29).

**2) OUR GAPS (top 5)**
1. No statutory cites/effective dates; our README row 29 promises "statutory cites" — currently false.
2. No ingestion path: prompt schema only; nothing parses rap-sheet text; no paste-in demo.
3. Engine silos each case: a pending sibling case gates nothing; subsequent convictions manually duplicated per case; lifetime cap counts per-case only.
4. demo/index.html links `./tokens.css` + `fonts/` → violates single-self-contained-file contract (verified).
5. Motion name only — no filing steps/where/fee; no recheck calendar for needs_more_time.

**3) IMPROVEMENTS** (change / why beats theirs / acceptance / S-M-L / files)
1. **Statutory-cited DC ruleset** — real D.C. Code §16-8xx scheme w/ statute string, effectiveDate, lastVerified per rule (implementer verifies cites; examples stay fictional) / their law is black-box, ours inspectable / test: every DC path matches `/D\.C\. Code §/`; cite renders in report / **M** / core.js, core.test.js, spec.md, README.
2. **Whole-record engine** — derive lookback convictions + pending gates from sibling `cases[]` (per-case override kept) / deterministic cross-case logic an LLM can silently miss / test: 3-case record — pending sibling flags all; sibling conviction feeds lookback+cap / **M** / core.js, core.test.js.
3. **`parseRapSheet(text)`** — deterministic parser for a documented fictional rap-sheet format → cases[] + unmappedLines (never guesses) / intake with no LLM; uncertainty explicit / test: fixture → 3 cases + 2 unmappedLines / **S-M** / core.js, core.test.js, spec.md.
4. **Self-contained demo + paste mode** — inline tokens/fonts; textarea → parseRapSheet → screenRecord / theirs runs only in Claude; ours is one portable file / grep: no local href/src; pasted text screens / **S** / demo/index.html.
5. **Filing next steps** — filingSteps[], whereToFile, fee in rules-as-data, rendered per eligible case / actionable chain beyond motion name (S4 #29) / test: report contains steps / **S-M** / core.js, core.test.js.
6. **Golden-file reproducibility test** — assert screenRecord(input.json)+renderReport ≡ examples/output.json+report.md byte-for-byte / proves reproducibility theirs can't claim / node --test green after run.js regen / **S** / core.test.js, examples/run.js.
7. **Recheck calendar** — report.nextReviewDate = min eligibleOnDate among needs_more_time, sorted follow-up list / follow-up calendar vs one-shot / test: two NMT cases → earlier date / **S** / core.js, core.test.js.

**4) VERIFIABLE-BETTER CLAIM**: theirs is closed (0 public-repo hits), D.C.-only, LLM-decided, untestable; after 1–7 ours runs equivalent D.C. logic as inspectable, statutorily-cited, versioned data — deterministic, ~30 green tests, byte-reproducible, cross-record-aware, offline ingestion, portable single-file demo. Proof: suite (statutory-cite, cross-case, golden-file tests) + report rendering "D.C. Code §…" per flag.

**5) RISKS**: mis-encoded statute is malpractice-adjacent → keep counsel gate, lastVerified, "verify against current statute" in README; parser overfits fictional format → publish format contract; font inlining bloats demo; changes confined to artifact dir.

**TESTS**: no shell tool in this read-only session — could not execute live. Recorded run `tmp/open-legal-artifacts/evidence/test-run.log` (2026-11-07T20:10:25Z, node v24.20.0): record-sealing-screener **pass=16 fail=0** (matches the 16 tests in core.test.js).

Status: DONE_WITH_CONCERNS