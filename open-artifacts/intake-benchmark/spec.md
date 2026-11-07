# intake-benchmark — spec

Open counterpart of Harvey Intake (Claude for Legal partner gallery;
catalog §3.3 / §2.8). Where the closed artifact *is* an intake flow, this
artifact *benchmarks* intake flows — any two of them, including a purely
human process, on the same explicit rubric.

## What it does

Takes scripted intake runs (JSON: steps, fields asked, per-step latency,
fallback behavior, measured abandonment) plus a scenario canon of required
fields, and scores each flow on five transparent dimensions:

| Dimension | Formula (0–100) |
|---|---|
| completeness | distinct canon fields asked ÷ canon size |
| non_redundancy | 1 − (duplicate field asks ÷ total field asks) |
| fallback_quality | steps with a stated fallback ÷ total steps (null if no steps) |
| speed | min(1, latency_target ÷ total latency) × 100 |
| retention | (1 − abandonment_rate) × 100 (null if unmeasured) |

Composite = weighted mean over **available** dimensions (weights
renormalize), so a human process without abandonment telemetry still ranks.
Outputs a ranked side-by-side comparison table (MD) + CSV. Field names are
normalized (case/spacing/hyphens) before matching, so "Date of Birth" in a
paper script matches `date_of_birth` in the canon.

## IO contract

```js
import { benchmark, exportCsv, exportMd } from './core/core.js';
const result = benchmark({
  scenario: { name: '...', required_fields: ['full_name', ...] },
  flows: [{ id, name, kind: 'software'|'human'|'hybrid',
            steps: [{ id, purpose, fields: [...], latency_seconds, fallback }],
            abandonment_rate: 0.18 | null }],
  config: { latencyTargetSeconds: 900, weights: { completeness: 0.3, ... } },
});
exportCsv(result); exportMd(result);
```

Errors (thrown): zero flows; unknown weight keys; abandonment_rate outside
0–1. Warnings (not errors): flow with no steps; steps without latency.

## Deterministic vs LLM-assisted

| Part | Owner |
|---|---|
| Rubric weights, latency target, dimension formulas | deterministic / rules-as-data |
| Scoring, normalization, ranking, CSV/MD export | deterministic code |
| Turning a recorded intake session (transcript, screen recording, paper script) into the flow JSON | LLM-assisted (optional capture step) |

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

## What's better than the closed counterpart

1. **Vendor-neutral by construction** — Harvey can't benchmark itself against
   your legacy phone-and-paper process; this rubric treats both as first-class
   flows.
2. **Every score is a formula** — no proprietary black-box "intake quality";
   the table states exactly what completeness and redundancy mean.
3. **Honest about missing data** — unmeasured abandonment is a blank, not a
   zero, and composites renormalize instead of silently penalizing.
4. **Auditable capture step** — the LLM (if used) only transcribes observable
   behavior into JSON; scoring stays deterministic and reproducible.

## Legal accuracy notes

The canon of required fields is scenario data you own — conflicts checks,
statute-of-limitations triggers, and malpractice-insurance requirements vary
by jurisdiction and practice; none are asserted here. Fictional firm and
tool names throughout; not legal advice.
