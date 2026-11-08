# pro-bono-case-board

Pro bono case tracker: guarded intake → placement → closure workflow,
deterministic volunteer-skill matching (tag matching with score),
stale-case flags, malpractice-aware deadline warnings + ICS export,
tolerant CSV intake parsing, per-stage SLA aging, volunteer-capacity
rollups, board diff (regen audit), impact rollups, CSV export.

## Run

- Demo: open `demo/index.html` (standalone, prefilled with the fictional
  worked example; demo dates are relative to today so warnings stay live).
- Tests: `node --test core/core.test.js` — 27 tests.
- Example: `node examples/run.js` → regenerates `examples/output.json`,
  `board.md`, `board.csv`, `board.ics` from `examples/input.json`, plus
  `board-diff.json` (diff against `examples/input-changed.json`).

## How it works

1. Workflow: intake → triage → ready → placed → active → closing →
   closed (+ withdrawn). Illegal transitions are rejected; closing
   requires an outcome; placed cases can fall back to ready.
2. Matching: `70 × required-tags matched + 30 × optional-tags matched`
   (0–100). Any unmatched required tag marks the candidate ineligible
   with the gaps listed. Ranking is deterministic with id tie-break.
3. Deadlines: cases carry `deadlines[]{label,dueDate,kind}`; the board
   computes `daysTo`, `overdue`, and malpractice-aware severity — an
   overdue **court** date is `critical`, anything overdue or due within
   7 d is `warn`. `toICS()` exports one all-day VEVENT per deadline
   (DTSTAMP pinned to `asOf`, byte-identical on reruns).
4. Tolerant intake: `parseRows(text)` turns pasted CSV rows into draft
   cases with per-row `issues[]` (bad date, unknown state, missing or
   duplicate id) — it never throws; flagged rows still build.
5. Capacity + SLA: `impact.byVolunteer{openCases,hours,staleOwned}`
   flags load above `maxOpenPerVolunteer` (default 5); per-stage
   `stageSla` budgets (e.g. intake 7 d) flag cases stuck in-state, with
   open-case aging buckets (0–7 / 8–30 / 31–90 / >90 d). Days in state
   are approximated by days since `openedDate` (no state history in the
   input contract).
6. Stale: open cases with no activity for > `staleDays` (default 30) are
   flagged, with the day count. Data-integrity issues (placed without
   volunteer, unknown volunteer, closed without outcome) are flagged too.
7. Board diff: `diffBoards(a, b)` lists added / removed cases,
   stage changes, newly closed cases, and moved deadlines — a
   deterministic change log for "what changed since the last run".
8. Impact rollups: open/closed/withdrawn/placed counts, overdue
   deadlines, SLA breaches, volunteer hours, outcome tally — pure
   functions, auditable by funders.

## Better than the closed counterpart

- Explainable matching (score + matched + missing tags), not a black-box
  "best volunteer".
- Deadline warnings are computed, not just displayed: severity rules are
  pinned by tests and exported as an auditable ICS calendar.
- Inspectable, LLM-free intake parsing: per-row issues you can read,
  instead of opaque doc ingestion.
- Capacity-grounded placement and stuck-in-stage SLA flags — load and
  aging are computed, not eyeballed.
- Workflow rules enforced in code, not spreadsheet discipline; board
  regen is auditable via a deterministic diff.
- Auditable impact numbers; zero dependencies; self-hostable; CSV + ICS
  export.

All volunteers, clients, and matters in examples are fictional.
