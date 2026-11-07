# immigration-papers-reader — spec

Open counterpart of Mobile Pathways' "immigration papers reader" (Claude for
Legal partner gallery; catalog §3.6). The closed tool reads paperwork and
summarizes; this artifact keeps the safety-critical parts — checklists,
date math, readiness, referral — deterministic and auditable.

## What it does

Input case-type facts JSON; get, deterministically:

- **Required-documents checklist** per case type from rules-as-data
  (US-context defaults: family-based, employment-based, affirmative
  asylum, naturalization; removal defense is deliberately out of scope);
- **Per-document status** with exact date math — `missing` / `present` /
  `expiring_soon` (default ≤180 days, configurable) / `expired`
  (past-or-today expiry);
- **Readiness score** = valid required documents ÷ required total (expired
  counts against; optional documents never count);
- **Key-date surfacing** with days-until, urgent (≤14 days) and
  already-passed warnings — a missed hearing date is the failure mode this
  exists to prevent, so it is loud, never buried;
- **Referral flag** when complexity exceeds tool scope (criminal history,
  prior removal order, missed hearing, prior denial, detention, unlawful
  presence, or an out-of-scope case type) — the tool refers instead of
  squeezing the case through;
- **Plain-language summary** lines + Markdown checklist export.

## IO contract

```js
import { readCase, exportChecklistMd } from './core/core.js';
const result = readCase({
  case_type: 'employment_based', today: '2026-11-07',
  documents: { i693_medical: { present: true, expiry_date: '2027-01-30' }, ... },
  complexity: ['prior_denial'],
  key_dates: { 'I-485 interview': '2026-11-18' },
});
exportChecklistMd(result);
```

Errors (thrown): unknown case type; malformed dates (today, expiry_date,
key_dates values). Warnings (not errors): unmapped complexity factors,
urgent/passed dates, out-of-scope scoring notice.

## Deterministic vs LLM-assisted

| Part | Owner |
|---|---|
| Checklist templates, referral factors, expiring-soon window | rules-as-data in `core/core.js` |
| Date math, readiness, referral logic, summary, exports | deterministic code |
| Reading scanned forms/notices (I-797s, hearing notices) into the facts JSON | LLM-assisted (optional capture step) |

### LLM prompt schema (optional capture step)

```
You extract facts from immigration documents into strict JSON. Extract ONLY
what the document states. Dates must be ISO YYYY-MM-DD. If a date or status
is unreadable, use null and add it to "uncertain" — never guess a date; a
guessed hearing date is worse than a missing one. Schema:
{ "case_type": "family_based"|"employment_based"|"asylum_affirmative"|
"naturalization"|"removal_defense"|null,
  "documents": { "<doc_id>": { "present": true, "expiry_date": "YYYY-MM-DD"|null } },
  "key_dates": { "<label>": "YYYY-MM-DD" }, "uncertain": ["..."] }.
Document ids: <ids from the checklist templates>.
```

The LLM never computes readiness or decides referrals; unreadable items are
surfaced as `uncertain`, not smoothed over.

## What's better than the closed counterpart

1. **Referral over reach** — complexity factors and removal defense route to
   an accredited attorney/representative instead of producing a confident
   checklist that hides risk.
2. **Auditable date math** — expiry windows, urgency thresholds, and
   checklist templates are versioned data you can inspect and localize;
   key dates warn in both directions (upcoming and already passed).
3. **Capture honesty** — the extraction prompt's prime directive is "never
   guess a date"; uncertainty is a first-class output.
4. **Self-hostable** — dependency-free core fits nonprofit, low-cost
   deployment (the Mobile Pathways use case) without any vendor.

## Legal accuracy notes

Checklist templates are US-context defaults and change with USCIS/EOIR
practice — they are explicitly configurable rules-as-data, not authority.
Every output carries a not-legal-advice disclaimer. Fictional applicant
data throughout.
