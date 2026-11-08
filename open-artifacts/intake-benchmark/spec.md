# intake-benchmark — spec

Open counterpart of Harvey Intake (Claude for Legal partner gallery;
catalog §3.3 / §2.8). Where the closed artifact *is* an intake flow, this
artifact *benchmarks* intake flows — any two of them, including a purely
human process, on the same explicit rubric.

## What it does

Takes scripted intake runs (JSON: steps, fields asked, per-step latency,
fallback behavior, measured abandonment) plus a scenario canon of required
fields, and scores each flow on transparent dimensions:

| Dimension | Formula (0–100) |
|---|---|
| completeness | distinct canon fields asked ÷ canon size |
| non_redundancy | 1 − (duplicate field asks ÷ total field asks) |
| fallback_quality | steps with a stated fallback ÷ total steps (null if no steps) |
| speed | min(1, latency_target ÷ total measured latency) × 100 — **null (blank) if no step is measured**; partially measured flows are scored on their measured steps only, with a coverage warning |
| retention | (1 − abandonment_rate) × 100 (null if unmeasured) |
| deadline_capture | deadline-class canon fields asked ÷ deadline-class fields (null if canon untagged) |
| conflict_check | conflict-class canon fields asked ÷ conflict-class fields (null if canon untagged) |

Composite = weighted mean over **available** dimensions (weights
renormalize), so a human process without abandonment telemetry still ranks.
The risk dimensions are reported (and drive `missing_critical`) but stay
outside the composite weights by default — they measure legal exposure, not
vendor quality. Outputs a ranked side-by-side comparison table (MD) + CSV.
Field names are normalized (case/spacing/hyphens) before matching, so "Date
of Birth" in a paper script matches `date_of_birth` in the canon.

## Canon library

Four starter practice-area canons ship in the box — `housing`,
`immigration`, `family`, `consumer` — each field tagged
`risk_class: 'core' | 'deadline' | 'conflict'` (`core/canons.js`, data in
`core/core.js`). Use one with `scenario: { canon: 'housing' }` (canon wins
over `required_fields`, with a warning) or pass any tagged field list of
your own as `required_fields`. Deadline fields drive a clock (notice,
hearing, filing, limitations); conflict fields feed the conflicts check.
Unasked deadline/conflict fields score below 100 and are listed per flow in
`metrics.missing_critical`. The shipped canons are ILLUSTRATIVE defaults,
not verified law — [verify] against local rules before relying on them.

## IO contract

```js
import { benchmark, exportCsv, exportMd, rankStability, validateCapture, compare } from './core/core.js';
const result = benchmark({
  scenario: { name: '...', canon: 'housing' /* or */,
              required_fields: ['full_name', ...] /* or [{name, risk_class}] */ },
  flows: [{ id, name, kind: 'software'|'human'|'hybrid',
            steps: [{ id, purpose, fields: [...], latency_seconds, fallback }],
            abandonment_rate: 0.18 | null }],
  config: { latencyTargetSeconds: 900, weights: { completeness: 0.3, ... }, fairMode: true },
});
exportCsv(result); exportMd(result);
rankStability(input, { jitter: 0.25, runs: 12 });  // ranking robustness
validateCapture(capturedJson);                    // audit the LLM capture step
compare(resultAfter, resultBefore);               // re-run drift diff
```

Errors (thrown): zero flows; unknown weight keys; unknown canon id; unknown
risk_class tag; abandonment_rate outside 0–1. Warnings (not errors): flow
with no steps; steps lacking latency_seconds (speed goes blank or is scored
on measured steps only, never zero-filled); canon overriding
required_fields.

## Rank stability

Rubric weights are a choice; a ranking that dies when they wobble is not a
finding. `rankStability(input, {jitter = 0.25, runs = 12})` re-scores the
same flows over a deterministic grid — one run per dimension with that
dimension dropped (weight 0), then fixed-seed ±jitter weight mixes — and
reports `flips` (runs whose #1 flow differs from baseline), `flip_rate`,
and a `verdict`: `robust` (0 flips) or `fragile` (any flip). Deterministic:
same input, byte-identical output on rerun.

## Fair mode

Renormalizing over *each flow's* available dimensions quietly compares
apples to oranges when one flow has telemetry the other lacks. With
`config.fairMode: true`, composites are recomputed on the **intersection**
of dimensions every flow has, and a warning names what was excluded — so a
measured abandonment rate can't win a flow points against an unmeasured
rival.

## Drift diff

`compare(after, before)` diffs two benchmark() runs of the same flows:
per-flow composite and per-dimension deltas (after − before) plus
`rank: {from, to, changed}` flags. Dimensions missing on either side are
omitted, never guessed. See `examples/input-v2.json` → `examples/drift.md`.

## Deterministic vs LLM-assisted

| Part | Owner |
|---|---|
| Rubric weights, latency target, dimension formulas | deterministic / rules-as-data |
| Scoring, normalization, ranking, CSV/MD export | deterministic code |
| Turning a recorded intake session (transcript, screen recording, paper script) into the flow JSON | LLM-assisted (optional capture step) |
| Auditing that capture output before it enters the rubric | deterministic: `validateCapture()` |

### LLM prompt schema (optional capture step)

```
You are converting a recorded intake session into structured JSON. Extract
ONLY what is observable; never invent fields, latencies, or fallbacks.
Schema: { "flows": [{ "id", "name", "kind", "steps": [{ "id", "purpose",
"fields": ["snake_case field the step asks"], "latency_seconds": <number,
omit if not measurable>, "fallback": "<what happens if this step fails, or
null>" }] }] }. A step a human performs on paper is kind "human". If a value
is not observable, omit the key — do not guess a number.
```

Before scoring, run the capture through `validateCapture(json)`. It returns
`{valid, errors, warnings}`: structural errors (no flows/steps/ids) and
warnings for data smells — steps missing a `purpose`, a single-step
`latency_seconds` beyond 7 days (likely elapsed wait time, e.g. mail, not
step latency), and `abandonment_rate` outside 0–1.

## What's better than the closed counterpart

1. **Vendor-neutral by construction** — Harvey can't benchmark itself against
   your legacy phone-and-paper process; this rubric treats both as first-class
   flows.
2. **Every score is a formula** — no proprietary black-box "intake quality";
   the table states exactly what completeness and redundancy mean.
3. **Honest about missing data** — unmeasured abandonment or latency is a
   blank, not a zero, and composites renormalize instead of silently
   penalizing; fair mode makes cross-flow comparison explicit rather than
   implicit. A flow that omits latency data never wins the speed axis.
4. **Auditable capture step** — the LLM (if used) only transcribes observable
   behavior into JSON; scoring stays deterministic and reproducible, and
   `validateCapture()` checks the transcription against the schema.
5. **Measures legal risk, not just process polish** — canon fields tagged
   deadline/conflict are scored separately (`deadline_capture`,
   `conflict_check`, `missing_critical`), so a flow that never asks about
   the court date can't hide behind a slick UI. The closed counterpart
   asserts intake quality; this rubric measures it — on any vendor's flow,
   including a purely human one.
6. **Error bars on the verdict** — `rankStability()` and the drift diff
   (`compare()`) show when a ranking is robust and when it is an artifact
   of the weights; the closed counterpart offers no equivalent.

## Legal accuracy notes

The canon of required fields is scenario data you own — conflicts checks,
statute-of-limitations triggers, and malpractice-insurance requirements vary
by jurisdiction and practice; none are asserted here. Fictional firm and
tool names throughout; not legal advice.
