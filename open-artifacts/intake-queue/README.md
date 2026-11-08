# intake-queue

New-matter intake queue: same-party dedupe, conflict-check party
matching against a roster (with former-name aliases), deadline/age
urgency triage, guarded assign states, an audited accept/decline/
escalate decision layer, deterministic engagement/declination letter
drafts, ICS calendar export, and LLM-extraction verification. All
matching is deterministic name math with visible scores.

## Run

- Demo: open `demo/index.html` (standalone, prefilled with the fictional
  worked example — decide/assign, letters, ICS export, audit log, ingest
  verifier all live).
- Tests: `node --test core/core.test.js` — 36 tests.
- Example: `node examples/run.js` → regenerates `examples/output.json`,
  `queue.md`, `queue.csv`, `letters.md`, `intake.ics` from
  `examples/input.json`.

## How it works

1. Names are normalized (case, punctuation, dotted abbreviations like
   L.L.C., corporate suffixes; initials kept; Unicode-aware — any-script
   letters/digits survive, so exact CJK/Cyrillic/Arabic names match).
   Similarity = best-first token alignment scored on exact matches, a
   compact nickname/abbreviation table, an initials rule (J. Iwata ≈
   John Iwata), and Jaro–Winkler typo tolerance, plus a containment
   bonus — recall-biased so conflicts land in front of a human.
2. Dedupe: a submission whose client AND opposing party both match an
   earlier submission ≥ 0.85 becomes a duplicate of the first.
3. Conflicts: either party matching any roster entry — including its
   `aliases[]` (former/DBA names, flagged `aliasMatch` with the alias
   shown) — ≥ 0.8 routes to conflict-review with the roster role,
   matter, side, and score shown.
4. Urgency: overdue (deadline passed) / urgent (≤14d) / deadline-soon
   (≤30d) / routine; matters older than a year get a limitations hint.
5. States: new → duplicate | conflict-review | urgent | assignable →
   assigned (assignment requires an assignee). On top, a guarded
   decision layer: `decide(queue, id, accept|decline|escalate, by,
   reason)` — terminal, actor + reason required.
6. Every process/assign/decide appends to `queue.audit`
   (`{seq, at, actor, action, detail}`); failed actions append nothing.
7. Letters: `renderLetter()` drafts engagement/declination letters from
   queue fields only — conflict scores cited, jurisdiction left as
   `[JURISDICTION]` placeholder, never legal advice.
8. Exports: CSV, Markdown (with audit-log table), and ICS
   (`toICS()`, one VEVENT per valid deadline).
9. Ingest: `ingestSubmission(extracted, sourceText)` verifies LLM
   extractions — names must appear verbatim in the source or the
   submission is flagged `unverified-extraction`.

## Better than the closed counterpart

- Auditable matching: every dedupe/conflict call shows normalized names,
  score, and threshold — no black-box "possible duplicate".
- Decisions are records, not vibes: accept/decline/escalate requires an
  actor and reason, lands in an append-only audit log, and every letter
  line traces to a queue field — no LLM hallucination possible.
- Conservative by design for people (initials preserved), configurable
  thresholds for teams.
- Deterministic queue ordering; CSV/Markdown/ICS export for review
  meetings and calendars; zero dependencies, self-hostable.

All parties and matters in examples are fictional.
