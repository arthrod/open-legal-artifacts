# subpoena-response — spec

Open counterpart of PwC's "Subpoena Response Tool" (Claude for Legal partner
gallery; catalog §3.4). Where the closed tool drafts responses from a firm's
precedent corpus, this artifact is the open tracker underneath: deadline
math, structured scope analysis, privilege/log workflow, and an objection
grounds library — all rules-as-data.

## What it does

Input a subpoena-facts JSON; get, deterministically:

- **Deadline math** — served date + configurable day count (FRCP-style
  14-day default), calendar or court-day counting (weekends + listed
  holidays skipped), service-method extension (mail +3 default), days
  remaining, and overdue/critical escalation flags.
- **Responsive-scope analysis** — date range, custodians, data types as
  structured fields; overbreadth flags from configurable thresholds
  (default: >5 years, >8 custodians, personal-device/message requests) each
  mapped to a suggested objection ground.
- **Privilege/log workflow** — ordered states `not_started → collecting →
  reviewing → log_drafted → qc → final` with progress %; forward-only
  (skipping allowed but warned; backward blocked).
- **Objection grounds library** — 10 stable-id grounds with description and
  typical-support pointers, explicitly jurisdiction-dependent.
- **Checklist export** — Markdown checklist with every element above.

## IO contract

```js
import { trackResponse, exportChecklistMd, computeDeadline } from './core/core.js';
const result = trackResponse(facts);   // see examples/input.json for the shape
const md = exportChecklistMd(result);
```

Errors (thrown): non-ISO or inverted dates; unknown objection ids; unknown
privilege states; invalid day_type. Warnings (not errors): skipped workflow
states, scope overbreadth, ≤3 days to deadline, deadline passed.

## Deterministic vs LLM-assisted

| Part | Owner |
|---|---|
| Deadline defaults, thresholds, objection library, workflow states | rules-as-data in `core/core.js` |
| Date math, scope structuring, flags, workflow gating, exports | deterministic code |
| Reading a served subpoena PDF into the facts JSON | LLM-assisted (optional capture step) |

### LLM prompt schema (optional capture step)

```
You are extracting structured facts from a subpoena document. Extract ONLY
what the document states; never compute deadlines or suggest objections.
Schema: { "subpoena": { "served_date": "<ISO, from certificate of service>",
"service_method": "personal"|"mail"|"email"|null, "caption": "..." },
"responsive_scope": { "date_range": {"start","end"}|null, "custodians":
[{"name","role"}], "data_types": [{"type","systems","notes"}] }, "objections_selected": [] }.
If a field is not stated in the document, use null — do not infer.
```

Deadline computation and objection selection stay in code; the LLM never
does either (it cannot be trusted with date math that waives rights).

## What's better than the closed counterpart

1. **Audit trail by construction** — every flag, deadline, and state change
   is a reproducible function of the input JSON; nothing depends on a
   precedent corpus you can't see.
2. **Forum-portable** — day counts, extensions, holidays, and thresholds are
   rules-as-data; the closed tool's logic is invisible.
3. **Safety-critical honesty** — overdue deadlines escalate loudly; court-day
   math is exact and unit-tested; the LLM is barred from computing anything.
4. **Objection grounds as data** — add your forum's grounds without touching
   logic; every ground carries a typical-support pointer, not boilerplate.

## Legal accuracy notes

The 14-day default, mail extension, and objection grounds are FRCP-style US
defaults, explicitly marked jurisdiction-dependent — state forums, local
rules, and non-US regimes differ. This tracker produces checklists and
flags, never legal conclusions or filed work product. Not legal advice.
