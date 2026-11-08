# obligations-checker — specification

Open artifact: a contract obligations extractor/checker. Obligations
JSON (party, verb, deadline, condition, recurrence) goes in; a register
with per-obligation compliance status tracking and breach-risk flags
(due date passed with no satisfaction record) comes out. CSV, iCalendar,
and diff exports.

## Design split: deterministic core vs. LLM

| Capability | Owner |
|---|---|
| Status machine: satisfied / pending / due-soon (≤14d) / overdue / conditional / unscheduled | core (deterministic) |
| Breach-risk flags: due date passed with no satisfaction record (with day count) | core (deterministic) |
| Late-satisfaction detection (satisfied after due date → satisfied + "N days late" flag) | core (deterministic) |
| Latest-satisfaction-record-wins (by satisfiedOn, order-independent) | core (deterministic) |
| Recurrence: per-cycle due dates (monthly/quarterly/annual), month-end + leap clamps, missed-cycle counts | core (deterministic) |
| Register diff: status transitions, added/removed ids, newly appearing flags | core (deterministic) |
| Per-party rollup: open / overdue / exposure (Σ overdue payment amounts) | core (deterministic) |
| Conditional obligations without calendar dates → tracked as `conditional` with the trigger text | core (deterministic) |
| Extracting obligations JSON (party, verb, deadline, condition, quote) from contract text | LLM (prompt below) |
| Whether a breach matters (waiver, cure, materiality) | attorney |

Never guesses: invalid dates (including invalid recurrence cadence or
anchor) → `unscheduled` with an "unverified, never guessed" flag;
satisfaction records for unknown ids are ignored (no phantom
obligations); satisfaction records dated after `asOf` are excluded
from the status machine and flagged `future_dated` — the register is
a function of facts known as of `asOf`, so a date typo can never turn
overdue into satisfied.

## Input contract (JSON)

```jsonc
{
  "asOf": "2026-11-07",
  "settings": { "dueSoonDays": 14 },
  "obligations": [ {
    "id": "OBL-1", "clause": "§ 4.1", "party": "Customer",
    "owner": "Finance (Customer)",          // optional responsible team/person
    "verb": "pay", "text": "pay the milestone fee of $48,000",
    "dueDate": "2026-10-30",        // ISO or null
    "condition": "…trigger text…",  // for event-triggered duties
    "recurrence": { "cadence": "quarterly", "anchor": "2026-03-31" }, // for recurring duties
    "amount": 48000,
    "sourceQuote": "verbatim sentence from the contract" } ],
  "satisfaction": [ {
    "obligationId": "OBL-1", "satisfiedOn": "ISO",
    "evidence": "doc/email reference", "note": "…" } ]
}
```

`dueDate`, `condition`, and `recurrence` are mutually exclusive in
practice; recurrence takes precedence in the status machine.

### Recurrence semantics (deterministic)

- Cycle due dates = anchor + k·cadence months, day clamped to the
  target month's last day (Jan 31 monthly → Feb 28; Feb 29 annual →
  Feb 28 in non-leap years).
- Each cycle is its own duty. The latest satisfaction record covers
  the cycle whose window contains `satisfiedOn` — the window of a
  cycle due D is (previous due date, D], so a record dated exactly D
  discharges that cycle on time (never the next one); every other
  unmet cycle counts as a miss.
- Misses > 0 → `overdue` + breach-risk flag listing the missed dates;
  otherwise the next cycle date drives due-soon/pending/satisfied.

## Output contract (JSON)

Per obligation: `status`, `breachRisk`, `flags[]`, `satisfaction
{satisfiedOn, evidence, note} | null`, plus carried clause/party/owner/
verb/text/dueDate/condition/amount/sourceQuote and, for recurring
duties, `recurrence`, `nextDue`, `cyclesMissed`. `summary { total,
byStatus, breachRisk, satisfied, satisfiedLate, open, flagged,
unscheduledOrConditional, byParty }` where `byParty[party] =
{ open, overdue, exposure }`.

Exports: `toCSV()` (every field, one row per obligation),
`renderRegister()` (Markdown, worst-first, with a Sources section
quoting the contract per obligation), `toICS()` (one VEVENT + VALARM
per open dated obligation, RFC 5545 escaping, recurring duties at
their next cycle date), `diffRegisters(a, b)` + `renderDiff()` (per-id
status transitions, added/removed, new flags).

## Prompt schema for the LLM part (extraction only)

```jsonc
// System: "Extract every obligation from the contract text. Copy party
// names, deadlines, and the source sentence verbatim; normalize ONLY to
// the shape below. If a deadline is event-triggered, put the trigger in
// `condition` and leave dueDate null. If a duty recurs, set
// `recurrence` from the contract's stated cadence and first due date.
// Never compute a date yourself. Ids must be STABLE across
// re-extractions of the same contract (derive them from the clause
// citation, e.g. OBL-4-1 for § 4.1) so registers can be diffed."
{ "obligations": [ {
    "id": "stable clause-derived id", "clause": "verbatim cite",
    "party": "obligor name as written", "owner": "named owner|null",
    "verb": "deliver|pay|notify|return|maintain|renew|other",
    "text": "one-sentence obligation", "dueDate": "ISO|null",
    "condition": "verbatim trigger|null",
    "recurrence": "{cadence,anchor}|null", "amount": "number|null",
    "sourceQuote": "verbatim sentence from the contract" } ] }
```

## What's better than the closed counterpart

The closed counterpart is the partner-built "Obligations Checker" by
Foley & Lardner in the Claude for Legal gallery (per the launch
article; no obligations-specific skill is published in the open
reference repo). Ours:

- The register is reproducible: statuses are pure functions of
  (obligations, satisfaction records, asOf) — auditable, diffable in
  git, testable (30 unit tests).
- Breach risk is a visible rule with day counts and evidence links, not
  a summary you have to trust.
- Event-triggered obligations are first-class (`conditional`) instead of
  being dropped or force-dated; unparseable dates are flagged, never
  guessed.
- The quote-level audit trail is carried as data (JSON row, CSV column,
  Markdown Sources section), not a link to re-read.
- Recurring duties compute per-cycle due dates and missed-cycle counts
  (month-end/leap clamps pinned by tests) and export to any calendar
  via ICS — a static list can't.
- Per-party exposure rollups (Σ overdue payment amounts) give the
  pre-closing both-parties view deterministically.
- Zero dependencies, runs in the browser and Node.
