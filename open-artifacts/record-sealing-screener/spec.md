# record-sealing-screener — specification

Open reimplementation of the Rising for Justice "Record sealing screener"
legal-aid artifact (catalog §3.7): screens a criminal record against
jurisdiction sealing rules and reports per-case eligibility with the motions
a client may be able to file.

## Design split: deterministic core vs. LLM

| Capability | Owner |
|---|---|
| Waiting-period date math (anchor + years, calendar-accurate, leap-year safe) | core (deterministic) |
| Disqualifier matching (offense category/class, conviction caps, lookback, fines) | core (deterministic) |
| Rule citation behind every determination (`ruleId` echoed on every flag) | core (deterministic) |
| Jurisdiction rulesets as editable data | rules-as-data (3 example US jurisdictions) |
| Reading a rap sheet / docket into the case-facts JSON | LLM or human (out of core) |
| Final eligibility call | **counsel only** (hard gate on every report) |

The engine NEVER guesses: unknown dispositions, missing dates, or unknown
jurisdictions return `insufficient_data` listing exactly what is missing.

## Input contract (`SealingInput`, JSON)

```jsonc
{
  "jurisdiction": "DC",              // must match a ruleset id (DC | CA | TX examples)
  "asOf": "2026-11-07",              // screening date, no hidden clocks
  "cases": [
    {
      "id": "C1",
      "caseNumber": "2021-CF-000123",
      "offense": "Possession (fictional)",
      "offenseCategory": "drug_possession",       // matched against rules
      "offenseClass": "misdemeanor",              // matched against rules
      "disposition": "conviction",  // conviction | acquittal | dismissed | nolle_prosequi | deferred_adjudication | unknown
      "offenseDate": "2015-04-02",
      "dispositionDate": "2015-09-10",
      "sentenceCompletedDate": "2016-03-01",      // starts the conviction waiting period
      "finePaid": true,
      "subsequentConvictions": [ { "date": "2023-05-01", "offenseCategory": "theft" } ],
      "pendingCase": false
    }
  ]
}
```

## Output contract

One result per case:

- `determination`: `potentially_eligible` | `needs_more_time` | `ineligible` |
  `insufficient_data`
- `eligibleOnDate`: earliest date the path opens (when computable)
- `disqualifiers[]`: `{ code, description, ruleId }` — every blocking flag
  cites the rule that produced it
- `missingData[]`: what the engine refused to guess
- `basis[]`: the rule chain behind the determination (audit trail)
- `motion`: the motion/petition name on the matched path
- `gate`: `{ required: true, message }` — verify-with-counsel, on every report

`renderReport(report)` produces the deterministic Markdown version.

## Rules-as-data

`JURISDICTION_RULES` in `core/core.js` holds three example US jurisdictions
(DC, CA, TX), each with: per-disposition paths (waiting period, anchor,
caps, disqualifying categories/classes, motion name) and a
subsequent-conviction lookback rule — all carrying `ruleId`s and a
`version`. Adding a jurisdiction = adding a data object, not code.
Rules are **illustrative**, modeled on common scheme shapes, not legal advice.

## Prompt schema for the LLM part

The LLM only structures a record into the input contract above:

```jsonc
{ "cases": [ { "id": "C1", "offense": "…", "offenseCategory": "drug_possession",
               "offenseClass": "misdemeanor", "disposition": "conviction",
               "offenseDate": "2015-04-02", "dispositionDate": "2015-09-10",
               "sentenceCompletedDate": "2016-03-01", "finePaid": true,
               "subsequentConvictions": [], "pendingCase": false } ],
  "unmappedFields": ["condition-of-release notes could not be classified"] }
```

Unmapped or uncertain fields must be omitted (not guessed) — the engine
turns omissions into `insufficient_data` flags.

## What's BETTER than the closed counterpart

1. **Auditability** — every determination ships its rule chain; the closed
   artifact's reasoning is not inspectable.
2. **Portable by data** — any jurisdiction can be added as a plain data file
   by legal-aid maintainers; the original is D.C.-only.
3. **Never guesses** — missing data is a first-class output, not a
   silent assumption.
4. **Counsel gate is structural** — code, not a prompt instruction.
5. **Reproducible** — same input + ruleset version ⇒ byte-identical output.
