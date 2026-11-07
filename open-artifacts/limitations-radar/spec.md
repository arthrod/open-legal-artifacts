# limitations-radar — specification

**Original idea** (no Anthropic-gallery counterpart): a statute-of-
limitations deadline tracker with the computation engine published. Claims
JSON in → deadlines computed from rules-as-data (claim-type periods per
example jurisdictions, discovery-rule accrual, recognized statutory
tolling), saved-by margins vs filing dates, conflict flags, and
calendar-alert ICS export.

## Design split: deterministic core vs. LLM

| Capability | Owner |
|---|---|
| Accrual selection (injury vs discovery rule, per claim type) | core (deterministic, rules-as-data) |
| Deadline = accrual + period + tolling days (calendar-accurate, leap-safe) | core (deterministic) |
| Tolling recognition per jurisdiction (event types + pause effect; unrecognized types flagged, no effect) | core (deterministic, rules-as-data) |
| Saved-by margin vs filing date; days-remaining vs asOf | core (deterministic) |
| Conflict flags (discovery precedes injury; invalid tolling spans) | core (deterministic) |
| ICS calendar export (VEVENT per deadline + 30-day VALARM, RFC 5545 folding, deterministic UIDs) | core (deterministic) |
| Extracting claim facts from intake documents | LLM or human (out of core) |
| Accrual disputes, exceptions, final calls | **counsel only** (gate on every report) |

Never guesses: unknown jurisdiction, unknown claim type, missing accrual
dates, or invalid tolling spans yield `data_needed`/flags — not deadlines.

## Input contract (JSON)

```jsonc
{
  "asOf": "2026-11-07",                       // radar date; no hidden clocks
  "claims": [
    {
      "id": "CLM-101",
      "claimType": "personal_injury",          // must exist in the ruleset
      "jurisdiction": "CA",                    // ruleset id (CA | NY | TX examples)
      "injuryDate": "2025-03-10",
      "discoveryDate": "2025-04-02",           // optional; drives discovery-rule accrual
      "tollingEvents": [
        { "type": "bankruptcy_stay",           // recognized types per jurisdiction
          "startDate": "2022-09-01",
          "endDate": "2023-05-01" }            // or "stillOngoing": true (runs to asOf)
      ],
      "filingDate": "2027-03-15"               // optional; enables saved-by margin
    }
  ]
}
```

## Output contract

Per claim: `status` (`filed_timely` | `filed_late` | `deadline_upcoming` |
`deadline_passed_unfiled` | `data_needed`), `accrualDate`, `deadline`,
`tollDays` + `tollingApplied[]` (each with rule id and note), `savedByDays`
(+ = filed before the deadline with days to spare; − = days past),
`daysRemainingAsOf`, `conflicts[]` (`discovery_precedes_injury` — both
dates retained, choice shown), `flags[]` (unknown jurisdiction/claim type,
unrecognized or invalid tolling), `basis[]` (the computation chain with
rule ids), `gate` (verify-with-counsel).

`toICS(report)` → RFC 5545 calendar: one VEVENT per computed deadline
(deterministic UID `<claim>-sol-<deadline>@limitations-radar`, DTSTAMP
anchored to `asOf`, `[OVERDUE]` prefix on expired deadlines), each with a
30-day TRIGGER VALARM. `renderReport` → Markdown.

## Rules-as-data

`JURISDICTION_RULES` (3 example US states: CA, NY, TX): per-claim-type
period + accrual mode with rule ids, and per-jurisdiction recognized
tolling types with their effect (`pause`) — illustrative shapes, editable
as plain data; every computation echoes the rule id it used.

## Prompt schema for the LLM part

The LLM only extracts claim facts from intake material:

```jsonc
{ "claims": [ { "id": "CLM-1", "claimType": "personal_injury", "jurisdiction": "CA",
                "injuryDate": "2025-03-10", "discoveryDate": "2025-04-02",
                "tollingEvents": [] } ],
  "uncertain": [ { "claimId": "CLM-1", "field": "claimType",
                   "candidates": ["fraud", "breach_of_contract_written"],
                   "reason": "pleading not yet characterized" } ] }
```

Uncertain claims run per candidate (the core is cheap and deterministic);
they are never collapsed into one guess.

## Why an OPEN version

The Claude-for-Legal gallery tracks contract renewal dates (§2.9) but has
no limitations-deadline tracker — the single most common intake question
legal aid receives ("is it too late?"). Deadline math is exactly the kind
of high-stakes arithmetic that must be inspectable: here every deadline
ships its computation chain (accrual date, rule id, period, tolling days),
jurisdiction rules are data that maintainers correct without touching
code, and the calendar export means the artifact actually reminds someone
— the failure mode fynk identified in renewal calendars.
