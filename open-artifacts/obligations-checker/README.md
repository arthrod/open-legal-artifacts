# obligations-checker

Contract obligations register: obligations JSON (party, verb, deadline,
condition, recurrence) in → per-obligation compliance status out, with
breach-risk flags when due dates or cycles pass without satisfaction
records. Quote-level source citations, party exposure rollups, register
diffs, iCalendar alerts, CSV export.

## Run

- Demo: open `demo/index.html` (prefilled with the fictional worked
  example; imports `tokens.css` + `../core/core.js`, which the site
  build inlines for the deployed single-file page).
- Tests: `node --test core/core.test.js` — 35 tests.
- Example: `node examples/run.js` → regenerates `examples/output.json`,
  `register.md`, `register.csv`, `register.ics`, and `diff.md` from
  `examples/input.json` (8 obligations: 2 breach risk — one a recurring
  duty with 2 missed quarters, 1 late satisfaction, 2 conditional).

## How it works

1. Obligations carry party, owner, verb, text, clause, dueDate (or a
   `condition` trigger, or a `recurrence` {cadence, anchor}), optional
   amount, and a verbatim `sourceQuote` from the contract. Extract them
   yourself or with the documented LLM prompt (extraction only — never
   date math; ids must be stable across re-extractions so registers can
   be diffed).
2. Satisfaction records mark obligations met (latest by date wins);
   satisfying after the due date is flagged with the day count. For
   recurring duties, the latest record covers at most the most recent
   past cycle — every earlier unmet cycle counts as a miss (month-end
   and leap-day anchors are clamped deterministically).
3. Status: satisfied / pending / due-soon (≤14d, configurable) /
   overdue (past due or missed cycles, no record → breach-risk flag) /
   conditional (event-triggered) / unscheduled (no date, no condition —
   flagged, never guessed).
4. Register renders worst-first with a Sources section quoting the
   contract per obligation; CSV carries every field; `toICS()` exports
   one VEVENT + reminder per open dated obligation; `diffRegisters()`
   compares two registers (as-of dates or amendments) — transitions,
   added/removed, new flags; `summary.byParty` rolls up open/overdue/
   exposure (Σ overdue payment amounts) for the both-parties view.

## Better than the closed counterpart

The closed counterpart is the partner-built "Obligations Checker" by
Foley & Lardner in Anthropic's Claude for Legal artifacts gallery
([launch article](https://claude.com/resources/articles/introducing-artifacts-for-legal-work);
[reference repo](https://github.com/anthropics/claude-for-legal) — no
obligations-specific skill is published there). Per those public
sources it ingests raw agreements via Claude + connectors, lists
obligations in the contract's own words, and links outputs to sources.

Ours, verifiably:

- Reproducible and auditable: statuses are pure functions of
  (obligations, satisfaction, asOf) — 35 green `node:test` tests,
  deterministic at any as-of date, diffable in git.
- The quote-level audit trail is data, not prose: every row carries the
  verbatim `sourceQuote` through JSON, CSV, and the Markdown Sources
  section.
- Recurrence is computed (per-cycle due dates, missed-cycle counts,
  month-end/leap clamps pinned by tests) — a static list can't send
  those reminders; `toICS()` puts them on any calendar.
- Per-party exposure (Σ overdue payment amounts) gives the pre-closing
  both-parties view in one deterministic pass.

Contracts and parties in examples are fictional. Statuses track
compliance evidence, not legal conclusions (waiver/cure/materiality
are attorney calls).
