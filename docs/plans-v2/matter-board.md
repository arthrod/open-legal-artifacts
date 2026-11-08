# Planner — run 7290de40 participant 16

Recon complete; no execution tool exists in this session (searched three ways — zero tool hits), so the test suite gets a static review plus an honest "not run" report. Here is the improvement plan.

**1) THEIR EDGE** (verified this run: launch article + repo SKILL.mds + local catalog)
- Ingests messy sources — "engagement letters, emails, or spreadsheets" (article); ours requires pre-shaped JSON.
- 60+ connectors (Filevine, Ironclad…) → board stays fresh from a system of record; ours is manual snapshot paste.
- `portfolio-status` skill ships anomaly rules: stale >30d, conflicts pending/bypassed, high-risk w/o outside counsel, missing fields, risk/materiality rollups (SKILL.md read).
- `matter-intake` skill: conflicts gate (`not-run` = STOP; bypass permanently recorded) + persistent `_log.yaml`/`matter.md`/`history.md` record.
- In-product sharing with ethical walls; every output source-linked (article).

**2) OUR GAPS (top 5)**
1. No anomaly layer — no staleness, missing-field, or conflicts checks; only overdue/due-soon.
2. No ingestion path — even a plain CSV spreadsheet (their headline input) can't enter without LLM/manual shaping.
3. `demo/index.html` links external `tokens.css` + `fonts/` — violates the "single self-contained file" hard constraint.
4. No risk/conflicts/materiality dimensions; severity is per-field only.
5. No deadline export/reminders (ICS), despite freshness being our pitch.

**3) IMPROVEMENTS**
1. **Anomaly checks** (S) — `stale` (no `updatedAt` within N days of `asOf`, default 30, rules-as-data), `missing-field` (required field null), `closed-with-deadline`. Beats theirs: their rules live in prompt prose; ours are data + tested. Test: fixture snapshot → expected anomaly list. Files: `core/core.js`, `core/core.test.js`, `spec.md`.
2. **CSV→snapshot ingest** (M) — dependency-free RFC4180 subset (quotes, embedded commas, header row); matches their headline input with zero LLM. Test: parse example CSV ≡ hand-written snapshot. Files: `core/core.js`, `core/core.test.js`.
3. **ICS export of flagged deadlines** (S) — `flaggedToIcs(board)` → VEVENT per overdue/due-soon, all-day DATE values (no tz math). They "find dates, don't remind" (catalog S3). Test: output contains SUMMARY/DTSTART per flag. Files: `core/core.js`.
4. **risk + conflicts fields with rollups/filters** (M) — board gains `counts.risk` and `conflictsOpen` counts; `buildBoard` filter opts (`owner`, `risk`). Parity with Portfolio Status, deterministic where theirs is LLM-rolled. Tests per count/filter.
5. **Self-contain the demo** (S) — inline tokens.css, font stack fallback; acceptance: `grep 'href=\|src=' demo/index.html` → 0 external refs. File: `demo/index.html`.
6. **Interactive demo** (M) — paste snapshot JSON + `asOf` → live board/diff client-side via same `core.js`; acceptance: opens from `file://`, renders board + changelog + exports.

**4) VERIFIABLE-BETTER CLAIM**
Theirs renders a board that silently rots ("ages from day one" — catalog S3); ours makes change the auditable object: deterministic field-level diff with timestamp provenance, severity/anomaly rules-as-data, and open JSON/CSV/ICS exports — reproducible, no lock-in, no connectors required. Proof: `node --test` green incl. all new failing-test-first tests; `diffToJson(prev,curr)` byte-stable across runs; demo works offline from `file://`.

**5) RISKS**
- **Tests NOT RUN** — this session exposes no shell/execution tool (tool_search: 0 hits for shell/val-town/execution). Static review: 11 tests are internally consistent with `core.js` (fixtures re-derived by hand: M-101 3 field changes, critical=1, flags days 1/5/11/14, M-104/M-105 add/remove). Run `node --test` before any merge.
- CSV edge cases must be test-first, not parser-improvised.
- Demo inlining must preserve arthur.law tokens exactly (bg #fafaf8, ink #0a0a0a, accent #ffd400, Manrope + Departure Mono, radius 0).
- Dead code in `buildBoard` (stages `slice()` push loop is unreachable) — harmless; remove during improvement 4.

DONE_WITH_CONCERNS