# pro-bono-case-board — specification

Open artifact: a pro bono / legal-aid case tracker with a guarded
intake → placement → closure workflow, deterministic volunteer-skill
matching, stale-case flags, and impact rollups.

## Design split: deterministic core vs. LLM

| Capability | Owner |
|---|---|
| Workflow states + transition validation (incl. no-close-without-outcome) | core (deterministic) |
| Volunteer matching: tag matching with 0–100 score, eligibility on required tags | core (deterministic) |
| Ranking (eligible first, score desc, id-asc tie-break) | core (deterministic, stable) |
| Stale flags (no activity > staleDays, open cases only) | core (deterministic) |
| Deadline severity (overdue court = critical, overdue/dues<7d = warn) + ICS export | core (deterministic) |
| Tolerant CSV intake parsing with per-row issues | core (deterministic) |
| Volunteer capacity rollup (open/hours/staleOwned vs maxOpenPerVolunteer) | core (deterministic) |
| Per-stage SLA aging + aging buckets | core (deterministic) |
| Board diff (added / removed / stage-changed / deadline-moved / closed) | core (deterministic) |
| Data-integrity flags (placed w/o volunteer, unknown volunteer, closed w/o outcome) | core (deterministic) |
| Impact rollups (hours, outcomes, placement counts) | core (deterministic) |
| Reading skills off a volunteer profile, drafting problem summaries | LLM / coordinator (prompt below) |
| Final placement decisions | human coordinator |

## Scoring rule (deterministic)

`score = 70 × (matched required / required) + 30 × (matched optional / optional)`
(rounded to 0.1). Any unmatched required tag ⇒ `eligible: false` with
`missingRequired` listed — candidates are surfaced but never silently
treated as fits. Cases without required tags score from optional only.
Ranking: eligible > score > volunteer id ascending.

## Input contract (JSON)

```jsonc
{
  "asOf": "2026-11-07",
  "settings": { "staleDays": 30, "matchLimit": 3, "maxOpenPerVolunteer": 5,
               "stageSla": { "intake": 7, "triage": 7, "ready": 14, "placed": 21, "active": 90, "closing": 21 } },
  "volunteers": [ { "id": "V-01", "name": "…", "skills": ["housing", "spanish"] } ],
  "cases": [ {
    "id": "PB-2026-010", "client": "…", "problem": "eviction defense",
    "state": "intake|triage|ready|placed|active|closing|closed|withdrawn",
    "openedDate": "ISO", "lastActivityDate": "ISO",
    "requiredSkills": ["housing"], "optionalSkills": ["spanish"],
    "volunteerId": "V-01|null", "hours": 8,
    "outcome": "favorable-settlement|represented|advice-only|unfavorable|null",
    "deadlines": [ { "label": "answer filing", "dueDate": "ISO", "kind": "court|administrative|internal" } ]
  } ]
}
```

`parseRows(text)` accepts the same fields as CSV columns (header row
required; skills cells use `;` or `|` separators) and returns
`{ cases: drafts, issues: [{row, id, issues[]}] }` — never throws.

SLA note: days in state are approximated by days since `openedDate`
(the contract carries no state-entry history); the approximation is
documented here and flagged as such nowhere else needed.

## Output contract (JSON)

Per case: `state`, `stale`, `staleFor`, `daysOpen`, `slaDays`,
`slaBreached`, `deadlines[]` (`{label, dueDate, kind, valid, daysTo,
overdue, severity}`), `flags[]`, `matches[]`
(`{volunteerId, score, eligible, missingRequired, matched}`).
Plus `impact { openCases, closedCases, withdrawnCases, placedCases,
totalHours, byOutcome, staleCases, flaggedCases, overdueDeadlines,
slaBreaches, aging, byVolunteer }`. Exports: CSV row per case,
Markdown board (impact + capacity + case table sorted by workflow
stage), ICS calendar (one all-day VEVENT per deadline, DTSTAMP pinned
to asOf), and `diffBoards(a, b)` change log
(`{added, removed, stageChanged, closed, deadlineMoved}`, sorted).

## Prompt schema for the LLM part (input prep only)

```jsonc
// System: "Normalize this intake note into case-board fields. Use only the
// skill tags from the provided taxonomy. Never invent a volunteer match."
{ "problem": "one-line summary", "requiredSkills": ["taxonomy tags"],
  "optionalSkills": ["taxonomy tags"], "confidence": 0.0,
  "unknownTerms": ["words you could not map to the taxonomy"] }
```

## What's better than the closed counterpart

- Matching is explainable and reproducible: the score, the matched tags,
  and the missing-required gaps are all visible; no opaque "best fit".
- Workflow guards are enforced in code (e.g., can't close without an
  outcome) instead of spreadsheet conventions.
- Stale detection and impact rollups are pure functions — funders get
  auditable numbers, not a dashboard you have to trust.
- Zero dependencies, self-hostable, CSV export; the closed gallery item
  is vendor-bound.
