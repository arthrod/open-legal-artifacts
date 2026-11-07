# obligations-checker — specification

Open artifact: a contract obligations extractor/checker. Obligations
JSON (party, verb, deadline, condition) goes in; a register with
per-obligation compliance status tracking and breach-risk flags (due
date passed with no satisfaction record) comes out. CSV export.

## Design split: deterministic core vs. LLM

| Capability | Owner |
|---|---|
| Status machine: satisfied / pending / due-soon (≤14d) / overdue / conditional / unscheduled | core (deterministic) |
| Breach-risk flags: due date passed with no satisfaction record (with day count) | core (deterministic) |
| Late-satisfaction detection (satisfied after due date → satisfied + "N days late" flag) | core (deterministic) |
| Latest-satisfaction-record-wins (by satisfiedOn, order-independent) | core (deterministic) |
| Conditional obligations without calendar dates → tracked as `conditional` with the trigger text | core (deterministic) |
| Extracting obligations JSON (party, verb, deadline, condition) from contract text | LLM (prompt below) |
| Whether a breach matters (waiver, cure, materiality) | attorney |

Never guesses: invalid dates → `unscheduled` with an "unverified, never
guessed" flag; satisfaction records for unknown ids are ignored (no
phantom obligations).

## Input contract (JSON)

```jsonc
{
  "asOf": "2026-11-07",
  "settings": { "dueSoonDays": 14 },
  "obligations": [ {
    "id": "OBL-1", "clause": "§ 4.1", "party": "Customer", "verb": "pay",
    "text": "pay the milestone fee of $48,000",
    "dueDate": "2026-10-30",        // ISO or null
    "condition": "…trigger text…",  // for event-triggered duties
    "amount": 48000 } ],
  "satisfaction": [ {
    "obligationId": "OBL-1", "satisfiedOn": "ISO",
    "evidence": "doc/email reference", "note": "…" } ]
}
```

## Output contract (JSON)

Per obligation: `status`, `breachRisk`, `flags[]`, `satisfaction
{satisfiedOn, evidence, note} | null`, plus carried clause/party/verb/
text/dueDate/condition/amount. `summary { total, byStatus, breachRisk,
satisfied, satisfiedLate, open, flagged, unscheduledOrConditional }`.
Exports: `toCSV()` (register row per obligation), `renderRegister()`
(Markdown, worst-first).

## Prompt schema for the LLM part (extraction only)

```jsonc
// System: "Extract every obligation from the contract text. Copy party
// names and deadlines verbatim; normalize ONLY to the shape below. If a
// deadline is event-triggered, put the trigger in `condition` and leave
// dueDate null. Never compute a date yourself."
{ "obligations": [ {
    "id": "stable id", "clause": "verbatim cite",
    "party": "obligor name as written", "verb": "deliver|pay|notify|return|maintain|renew|other",
    "text": "one-sentence obligation", "dueDate": "ISO|null",
    "condition": "verbatim trigger|null", "amount": "number|null",
    "sourceQuote": "verbatim sentence from the contract" } ] }
```

## What's better than the closed counterpart

- The register is reproducible: statuses are pure functions of
  (obligations, satisfaction records, asOf) — auditable, diffable in git,
  testable (16 unit tests).
- Breach risk is a visible rule with day counts and evidence links, not
  a summary you have to trust.
- Event-triggered obligations are first-class (`conditional`) instead of
  being dropped or force-dated; unparseable dates are flagged, never guessed.
- CSV export, zero dependencies, runs in the browser and Node.
