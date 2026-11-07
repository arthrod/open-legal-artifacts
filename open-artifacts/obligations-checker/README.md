# obligations-checker

Contract obligations register: obligations JSON (party, verb, deadline,
condition) in → per-obligation compliance status out, with breach-risk
flags when due dates pass without satisfaction records. CSV export.

## Run

- Demo: open `demo/index.html` (standalone, prefilled with the fictional
  worked example).
- Tests: `node --test core/core.test.js` — 16 tests.
- Example: `node examples/run.js` → regenerates `examples/output.json`,
  `register.md`, `register.csv` from `examples/input.json` (7
  obligations: 1 breach risk, 1 late satisfaction, 2 conditional).

## How it works

1. Obligations carry party, verb, text, clause, dueDate (or a
   `condition` trigger), optional amount. Extract them yourself or with
   the documented LLM prompt (extraction only — never date math).
2. Satisfaction records mark obligations met (latest by date wins);
   satisfying after the due date is flagged with the day count.
3. Status: satisfied / pending / due-soon (≤14d, configurable) /
   overdue (past due, no record → breach-risk flag) / conditional
   (event-triggered) / unscheduled (no date, no condition — flagged,
   never guessed).
4. Register renders worst-first; CSV exports the full register.

## Better than the closed counterpart

- Reproducible and auditable: statuses are pure functions, tested; the
  same register can be rebuilt and diffed at any as-of date.
- Breach risk is an explicit rule (day counts + evidence links), not
  model commentary.
- Event-triggered obligations stay visible instead of being dropped or
  force-dated.

Contracts and parties in examples are fictional. Statuses track
compliance evidence, not legal conclusions (waiver/cure/materiality
are attorney calls).
