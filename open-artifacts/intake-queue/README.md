# intake-queue

New-matter intake queue: same-party dedupe, conflict-check party
matching against a roster, deadline/age urgency triage, guarded assign
states, CSV export. All matching is deterministic name math with visible
scores.

## Run

- Demo: open `demo/index.html` (standalone, prefilled with the fictional
  worked example).
- Tests: `node --test core/core.test.js` — 18 tests.
- Example: `node examples/run.js` → regenerates `examples/output.json`,
  `queue.md`, `queue.csv` from `examples/input.json`.

## How it works

1. Names are normalized (case, punctuation, dotted abbreviations like
   L.L.C., corporate suffixes; initials kept). Similarity = token
   Jaccard + containment bonus.
2. Dedupe: a submission whose client AND opposing party both match an
   earlier submission ≥ 0.85 becomes a duplicate of the first.
3. Conflicts: either party matching any roster entry ≥ 0.8 routes to
   conflict-review with the roster role, matter, side, and score shown.
4. Urgency: overdue (deadline passed) / urgent (≤14d) / deadline-soon
   (≤30d) / routine; matters older than a year get a limitations hint.
5. States: new → duplicate | conflict-review | urgent | assignable →
   assigned (assignment requires an assignee). CSV + Markdown export.

## Better than the closed counterpart

- Auditable matching: every dedupe/conflict call shows normalized names,
  score, and threshold — no black-box "possible duplicate".
- Conservative by design for people (initials preserved), configurable
  thresholds for teams.
- Deterministic queue ordering; CSV export for review meetings;
  zero dependencies, self-hostable.

All parties and matters in examples are fictional.
