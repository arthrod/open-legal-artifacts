# Report D — Pair mapping, verdict ledger, and report index

Coordinator ledger for the 2026-11-08 `_to_verify` red-team exercise.
10 bundles × 2 critics (1 visual, 1 code) + 1 comparative synthesis + this
ledger = **22 reports**. Bias by design: visual critics were instructed to
be AGAINST ours and IN FAVOR of theirs; findings below inherit that bias —
deliberately, to expose every weakness.

## Pair mapping and verdicts

| # | Their bundle (`_to_verify/`) | Our artifact | Visual verdict | Code verdict |
|---|---|---|---|---|
| 01 | Ask legal (Copy).html | ask-legal | THEIRS 13:3 — full dual-role ops product; ours hides its engine (audit log wipes on reload, approvals exist only in prose) | theirs-only 14 / ours-only 8 / common 8 — ours wins auditability only |
| 02 | Cite check (Copy).html | cite-check | THEIRS — review workbench vs our static 2-button report; mobile table clips anchor+pinpoint | 3 must-fix correctness: inserted "not" passes `normalized`; exact anchor can hit non-verbatim duplicate; `Tr. 12:1` ok on unsegmented page |
| 03 | Harvey Intake (Copy).html | intake-benchmark | THEIRS — full product system; ours has deeper analytics behind a raw-JSON UI | 1 must-fix: unmeasured latency scores speed=100 |
| 04 | New client intake (Copy).html | intake-queue | THEIRS visually (app shell, ARIA); ours: 11px mono, zero ARIA | 3 must-fix: CJK names never match; typo/nickname recall 0.33 vs 0.9+; stale non-CRLF examples/intake.ics |
| 05 | Obligations Checker (Copy).html | obligations-checker | THEIRS decisively — firm-grade workflow vs JSON-textarea calculator | 2 must-fix: on-due-date satisfaction flags missed cycle (core.js:86); future-dated records flip overdue→satisfied |
| 06 | Playbook deviation board (Copy).html | playbook-deviation-board | THEIRS — matrix board, docx renderer+redlines, dark mode; ours leaks raw enums | 3 must-fix: similarity-mode avoid misses verbatim deal-breaker in long clauses; deal-breakers on escalation-less rules route to nobody; YAML mangles inline comments |
| 07 | Regulatory horizon scan (Copy).html | regulatory-horizon-scan | THEIRS 8.5/4.5 — 54-item cited corpus, timeline, reviewer workflow | dedupe collapses id-less entries (3→1); US-FED profile gives any state law +30; 2 README "better" claims falsified |
| 08 | Survey matrix (Copy) (Copy).html | jurisdiction-survey-matrix | THEIRS 9/3 — 255-cell cited survey vs our flat list + silent-crash bug | 2 must-fix security: unvalidated `sourceUrl` → `javascript:` links live; CSV formula injection |
| 09 | Tabular review (Copy).html | tabular-review | THEIRS — one-click citation→highlighted passage; ours' anchors dead-end at char offsets | 3 must-fix: "$1.5M"→1.5 silently answered; `no_such_document` dead path drops ghost cells; uncached verification 16s/20 cells |
| 10 | Term Sheet Benchmarking (Copy).html | venture-term-sheet-benchmark | THEIRS — real dated WSGR data, PDF ingestion, sign-off, dark mode | 2 confirmed bugs: garbled range detail text; booleans counted as numerics; no market data / no doc upload |

## Score

10/10 pairs: THEIRS wins today under the adversarial rubric. Our defensible
axes everywhere: determinism (byte-reproducible), real test suites, LLM-free
self-hostable cores, ICS/CSV/JSONL exports, audit trails, cost. Our shames:
must-fix correctness bugs in 7/10 cores, developer-grade UIs, tiny example
corpora, no document ingestion, no rich exports, no product workflows.

## Report index

- A01–A10 visual: `.impeccable/critique/2026-11-08-to-inspect/A<NN>-visual-<name>.md` (screenshots under workspace `tmp/shots/to-inspect/<name>/`)
- B01–B10 code: `.impeccable/critique/2026-11-08-to-inspect/B<NN>-code-<name>.md`
- C comparative synthesis: `.impeccable/critique/2026-11-08-to-inspect/C-comparative-synthesis.md`
- D this ledger: `.impeccable/critique/2026-11-08-to-inspect/D-ledger.md`
