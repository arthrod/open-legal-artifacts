# intake-queue — specification

Open artifact: a new-matter intake queue with deterministic same-party
dedupe, conflict-check party matching against a relationship roster,
deadline/age urgency triage, guarded assign states, and CSV export.

## Design split: deterministic core vs. LLM

| Capability | Owner |
|---|---|
| Name normalization (case, punctuation, dotted abbreviations, corporate suffixes; initials kept; Unicode-aware — any-script letters/digits survive) | core (deterministic) |
| Similarity: token alignment over exact / nickname-abbrev table / initials rule / Jaro–Winkler typo pairs + containment bonus, in [0,1] | core (deterministic) |
| Dedupe: same client AND same opposing party ≥ threshold vs earlier submissions (first is primary) | core (deterministic) |
| Conflict check: either party vs roster entries (incl. `aliases[]`, former names) ≥ threshold, with role + score + alias flag | core (deterministic) |
| Urgency: overdue / urgent (≤14d) / deadline-soon (≤30d) / routine + aged-matter bump (>365d → limitations hint) | core (deterministic) |
| State machine: new → duplicate \| conflict-review \| urgent \| assignable → assigned | core (guarded) |
| Decision layer: accept / decline / escalate from any open state; actor + reason required; terminal | core (guarded, audited) |
| Audit trail: every process/assign/decide appends `{seq, at, actor, action, detail}`; failed actions append nothing | core (deterministic) |
| Letter drafts: engagement / declination templates generated from queue fields only; jurisdiction stays `[JURISDICTION]` placeholder | core (deterministic, not legal advice) |
| Calendar export: one VEVENT per valid deadline (RFC 5545, CRLF, escaped) | core (deterministic) |
| Ingest verification: extracted party names must appear verbatim (word-delimited) in the source text | core (deterministic) |
| Extracting party names from emails/forms into the submission shape | LLM (prompt below) |
| Resolving conflicts (ethical screens, waivers) | attorney / general counsel |

Thresholds (`dedupeThreshold` 0.85, `conflictThreshold` 0.8,
`criticalDays` 14, `soonDays` 30, `staleAgeDays` 365) are configurable
settings. Matches are advisory: conflict-review state means "a human
must look", never "conflict exists". Roster entries may carry
`aliases[]` (former/DBA names) matched as first-class candidates; on a
tie the primary roster name wins. Every accept/decline/escalate
decision is terminal and must name an actor and a reason — there is no
unexplained routing anywhere in the queue.

## Input contract (JSON)

```jsonc
{
  "asOf": "2026-11-07",
  "settings": { "dedupeThreshold": 0.85, "conflictThreshold": 0.8 },
  "roster": [ { "name": "…", "role": "client|adverse|other", "matter": "…", "aliases": ["…"] } ],
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
matter, matchedSide, score, aliasMatch?, matchedVia?}]`,
`urgency{level, reasons[]}`, `state`
(new/duplicate/conflict-review/urgent/assignable/assigned/accepted/
declined/escalated), `assignedTo`, `decision{action, by, reason,
at}|null`, `flags[]`. Plus `summary{total, byState, conflicts,
duplicates, urgent}` and `audit[{seq, at, actor, action, detail}]`.

Decision API: `decide(queue, id, accept|decline|escalate, by, reason)` —
guarded (open states only), actor + reason required, appends to the audit log.
Letter drafts: `renderLetter(queue, id, engagement|declination)` — every
line traceable to queue fields; `[JURISDICTION]` placeholders keep it
UPL-safe; templates, not legal advice.
Ingest verifier: `ingestSubmission(extracted, sourceText)` — rejects
extractions whose names are not verbatim in the source
(`unverified-extraction` flag) before they enter the queue.
Exports: `toCSV()`, `renderQueue()` (Markdown sorted by state then
urgency then id, with audit-log table — deterministic), `toICS()`
(one VEVENT per valid deadline).

## Prompt schema for the LLM part (extraction only)

```jsonc
// System: "Extract structured parties from this intake email. Copy names
// verbatim; never canonicalize, never infer the opposing party."
{ "client": { "name": "verbatim|null" },
  "opposing": { "name": "verbatim|null" },
  "matterType": "one phrase or null", "deadlineSeen": "ISO|null + source quote" }
```

Before a submission enters the queue, `ingestSubmission()` verifies the
extraction deterministically: each extracted name must appear in the
source text delimited by non-word characters (so a truncated
"Sable Insurance Co" inside "Sable Insurance Company" is caught).

## What's better than the closed counterpart

- Every match shows its math: normalized names, similarity score,
  threshold — auditable dedupe/conflict calls instead of vendor trust.
- Initials are preserved and only match same-letter first names (J. Iwata
  ≈ John Iwata; M. Iwata ≠ K. Iwata); roster aliases (former/DBA names)
  match first-class with an explicit `aliasMatch` flag.
- Decisions are records, not vibes: accept/decline/escalate is guarded,
  requires actor + reason, and lands in an append-only audit trail
  (who checked what, when) — the counterpart's LLM routing is opaque.
- Engagement/declination letters are deterministic drafts: every line
  traceable to a queue field, jurisdiction left as a placeholder — no
  hallucinated facts possible; the counterpart's letters are LLM-drafted.
- Deadlines export to any calendar (RFC 5545 ICS), not just the queue.
- LLM extraction is verified against the raw source before it is
  trusted — the verbatim-copy prompt rule is enforced by code.
- Deterministic ordering and CSV export make the queue reviewable and
  diffable; the closed item lives behind a product login.
- Runs anywhere, zero dependencies; roster is plain editable JSON.
