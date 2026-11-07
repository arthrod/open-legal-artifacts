# intake-queue — specification

Open artifact: a new-matter intake queue with deterministic same-party
dedupe, conflict-check party matching against a relationship roster,
deadline/age urgency triage, guarded assign states, and CSV export.

## Design split: deterministic core vs. LLM

| Capability | Owner |
|---|---|
| Name normalization (case, punctuation, dotted abbreviations, corporate suffixes; initials kept) | core (deterministic) |
| Similarity: token Jaccard + containment bonus, in [0,1] | core (deterministic) |
| Dedupe: same client AND same opposing party ≥ threshold vs earlier submissions (first is primary) | core (deterministic) |
| Conflict check: either party vs roster entries ≥ threshold, with role + score | core (deterministic) |
| Urgency: overdue / urgent (≤14d) / deadline-soon (≤30d) / routine + aged-matter bump (>365d → limitations hint) | core (deterministic) |
| State machine: new → duplicate \| conflict-review \| urgent \| assignable → assigned | core (guarded) |
| Extracting party names from emails/forms into the submission shape | LLM (prompt below) |
| Resolving conflicts (ethical screens, waivers) | attorney / general counsel |

Thresholds (`dedupeThreshold` 0.85, `conflictThreshold` 0.8,
`criticalDays` 14, `soonDays` 30, `staleAgeDays` 365) are configurable
settings. Matches are advisory: conflict-review state means "a human
must look", never "conflict exists".

## Input contract (JSON)

```jsonc
{
  "asOf": "2026-11-07",
  "settings": { "dedupeThreshold": 0.85, "conflictThreshold": 0.8 },
  "roster": [ { "name": "…", "role": "client|adverse|other", "matter": "…" } ],
  "submissions": [ {
    "id": "INT-1041", "submittedAt": "ISO",
    "client": { "name": "…" }, "opposing": { "name": "…" },
    "matterType": "…", "description": "…",
    "deadline": "ISO|null",       // court date, response due, SOL
    "occurredOn": "ISO|null"      // age-of-matter triage
  } ]
}
```

## Output contract (JSON)

Per submission: `duplicateOf|null`, `conflicts[{rosterName, role,
matter, matchedSide, score}]`, `urgency{level, reasons[]}`, `state`
(new/duplicate/conflict-review/urgent/assignable/assigned), `assignedTo`,
`flags[]`. Plus `summary{total, byState, conflicts, duplicates, urgent}`.
Exports: `toCSV()`, `renderQueue()` (Markdown sorted by state then
urgency then id — deterministic).

## Prompt schema for the LLM part (extraction only)

```jsonc
// System: "Extract structured parties from this intake email. Copy names
// verbatim; never canonicalize, never infer the opposing party."
{ "client": { "name": "verbatim|null" },
  "opposing": { "name": "verbatim|null" },
  "matterType": "one phrase or null", "deadlineSeen": "ISO|null + source quote" }
```

## What's better than the closed counterpart

- Every match shows its math: normalized names, similarity score,
  threshold — auditable dedupe/conflict calls instead of vendor trust.
- Initials are preserved (M. Iwata ≠ K. Iwata) so person matching stays
  conservative where it matters.
- Deterministic ordering and CSV export make the queue reviewable and
  diffable; the closed item lives behind a product login.
- Runs anywhere, zero dependencies; roster is plain editable JSON.
