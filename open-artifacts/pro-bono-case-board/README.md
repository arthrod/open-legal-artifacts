# pro-bono-case-board

Pro bono case tracker: guarded intake → placement → closure workflow,
deterministic volunteer-skill matching (tag matching with score),
stale-case flags, impact rollups, CSV export.

## Run

- Demo: open `demo/index.html` (standalone, prefilled with the fictional
  worked example).
- Tests: `node --test core/core.test.js` — 17 tests.
- Example: `node examples/run.js` → regenerates `examples/output.json`,
  `board.md`, `board.csv` from `examples/input.json`.

## How it works

1. Workflow: intake → triage → ready → placed → active → closing →
   closed (+ withdrawn). Illegal transitions are rejected; closing
   requires an outcome; placed cases can fall back to ready.
2. Matching: `70 × required-tags matched + 30 × optional-tags matched`
   (0–100). Any unmatched required tag marks the candidate ineligible
   with the gaps listed. Ranking is deterministic with id tie-break.
3. Stale: open cases with no activity for > `staleDays` (default 30) are
   flagged, with the day count. Data-integrity issues (placed without
   volunteer, unknown volunteer, closed without outcome) are flagged too.
4. Impact rollups: open/closed/withdrawn/placed counts, volunteer hours,
   outcome tally — pure functions, auditable by funders.

## Better than the closed counterpart

- Explainable matching (score + matched + missing tags), not a black-box
  "best volunteer".
- Workflow rules enforced in code, not spreadsheet discipline.
- Auditable impact numbers; zero dependencies; self-hostable; CSV export.

All volunteers, clients, and matters in examples are fictional.
