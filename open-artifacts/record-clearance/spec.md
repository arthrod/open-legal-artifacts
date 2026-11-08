# record-clearance — specification

Open reimplementation of The Access Project "Record clearance" legal-aid
artifact (catalog §3.9): works out whether a client's record can be cleared
under their state's rules — eligibility screen per conviction, filing
guidance, and tracking. Multi-jurisdiction by design: relief types are
rules-as-data.

## Design split: deterministic core vs. LLM

| Capability | Owner |
|---|---|
| Prerequisites checklist per relief type (met / not_met / unknown) | core (deterministic) |
| Filing-deadline date math (earliest date, optional filing-window close) | core (deterministic) |
| Status tracking (`filed` / `granted` / `denied` recorded filings override recomputation) | core (deterministic) |
| Referral flags for counsel-dependent relief | core (deterministic, from rules) |
| Filing guidance (steps, forms, fee-waiver note) + authority link per relief type | rules-as-data (deterministic) |
| Normalizing LLM intake — `uncertain` fields dropped + logged, ids assigned (`validateIntake`) | core (deterministic) |
| Relief types + prerequisites per jurisdiction | rules-as-data (full tier: CA, IL, NY · guidance tier: TX) |
| Reading a rap sheet into the client-record JSON | LLM or human (out of core) |
| Filing decisions | **counsel/legal-aid only** (gate on every report) |

The engine never guesses: a missing client fact or conviction date makes the
prerequisite `unknown` and the item `data_needed`, never an eligibility call.
Conviction-level `probationStatus` / `finesPaid` override the client-level
values, so mixed records (one conviction revoked, another completed) get
correct per-conviction calls.

Jurisdictions without loaded relief rules can be registered as a **guidance
tier**: `trackClearance` returns a normal report (`coverageTier: "guidance"`,
a `guidanceNote`, generic screen items with mandatory referrals) instead of
a bare unknown-jurisdiction error.

## Input contract (`ClearanceInput`, JSON)

```jsonc
{
  "jurisdiction": "CA",
  "asOf": "2026-11-07",
  "client": {
    "probationStatus": "completed",   // completed | terminated | revoked | … (null => unknown)
    "finesPaid": true,
    "pendingCases": false,
    "rapSheetObtained": true
  },
  "convictions": [
    { "id": "V1", "offense": "Forgery (fictional)", "offenseCategory": "fraud",
      "offenseClass": "felony_class_W", "dispositionDate": "2018-05-04",
      "sentenceCompletedDate": "2020-08-21", "probationTerminatedDate": "2020-08-21" }
  ],
  "filings": [   // status tracking: recorded filings are echoed, not recomputed
    { "reliefTypeId": "CA-dismissal-petition", "convictionId": "V1",
      "date": "2026-09-15", "status": "filed" }   // filed | granted | denied
  ]
}
```

## Output contract

One item per conviction × relief type:

- `checklist[]`: `{ id, label, ruleId, status: met|not_met|unknown, detail,
  date? }` — every line carries the rule id that produced it.
- `earliestFilingDate` / `lastFilingDate`: anchor + years date math
  (month-end clamping, leap-safe); `null` + `anchorMissing` handling when the
  anchor date is absent.
- `status`: `ready_to_file` · `waiting` (a waiting-period prerequisite is
  merely not yet elapsed — future date surfaced) · `blocked` (hard
  prerequisite failed) · `data_needed` (unknown prerequisites) · `filed` /
  `granted` / `denied` (from the recorded filing).
- `referral`: counsel-dependent relief flag (e.g. certificates requiring
  live-scan, pardon applications).
- `filingGuidance`: `{ steps[], forms[], feeWaiverNote }` from the rule
  (illustrative — verify locally).
- `authority`: `{ cite, url }` — `[verify]`-tagged illustrative citation plus
  a source URL for every relief type.
- `gate`: verify-with-counsel message on every report.

## Prerequisite kinds the engine understands

`probationCompleted` · `finesPaid` · `noPendingCases` · `rapSheetObtained` ·
`offenseNotIn { categories, classes }` · `convictionCountMax { max }` ·
`waitingPeriod { years, anchor }` — where `anchor` is any conviction date
field. Adding a new prerequisite kind is a small, testable engine change;
adding relief types or jurisdictions is data only.

## Prompt schema for the LLM part

The LLM only structures a rap sheet into the input contract:

```jsonc
{ "client": { "probationStatus": "completed", "finesPaid": true, "pendingCases": false, "rapSheetObtained": true },
  "convictions": [ { "id": "V1", "offense": "…", "offenseCategory": "fraud",
                     "sentenceCompletedDate": "2020-08-21" } ],
  "uncertain": [ { "field": "finesPaid", "reason": "rap sheet shows balance, amount unclear" } ] }
```

Fields in `uncertain` must be omitted from the record — `core.validateIntake`
implements this contract: it normalizes the LLM payload to a ClearanceInput
(unknown keys stripped, missing conviction ids assigned), drops each
`uncertain` field from the client and every conviction, and returns the drops
as issues; the engine then converts the gaps to `unknown` checklist rows
rather than letting the model guess. Worked example:
`examples/intake.json` → `examples/intake-output.json` / `intake-report.md`.

## What's BETTER than the closed counterpart

1. **Rules are data** — per-state maintainers add relief types without
   touching code (the Code for America "Clear My Record" model).
2. **Tri-state checklists** — unknown is a first-class status; the closed
   artifact gives no such guarantee.
3. **Deadline math is inspectable** — earliest/last filing dates derive from
   anchor + years shown next to each rule id.
4. **Status tracking** — filings already made are tracked, not re-derived.
5. **Referral flags** — counsel-dependent relief routes to humans by rule.
