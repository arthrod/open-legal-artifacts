# immigration-papers-reader — spec

Open counterpart of Mobile Pathways' "immigration papers reader" (Claude for
Legal partner gallery; catalog §3.6). The closed tool reads paperwork and
summarizes; this artifact keeps the safety-critical parts — extraction,
checklists, date math, readiness, referral — deterministic and auditable.

## What it does

Input paperwork text and/or case-type facts JSON; get, deterministically:

- **Notice parsing** (`parseNotice`): per-form rules-as-data templates
  (I-797C receipt/action, Notice to Appear, EAD I-766 card, I-693 medical
  report, ASC biometrics appointment — checked most-specific-first since
  biometrics notices are themselves I-797Cs) turn notice text into a facts
  fragment: documents, typed key dates, referral complexity, and an
  extraction log naming the template rule behind every value. Unreadable
  dates or unmatched text land in `uncertain` — never guessed.
- **Required-documents checklist** per case type from rules-as-data
  (US-context defaults: family-based, employment-based, affirmative asylum,
  naturalization, TPS, U-visa; removal defense is deliberately out of
  scope);
- **Per-document status** with exact date math — `missing` / `present` /
  `expiring_soon` (default ≤180 days, configurable) / `expired`
  (past-or-today expiry) / `uncertain` (flagged by capture; excluded from
  the ready count, surfaced with a warning);
- **Readiness score** = valid required documents ÷ required total (expired
  and uncertain count against; optional documents never count);
  `readiness.has_uncertain` reports capture honesty at a glance;
- **Key-date taxonomy** — each date is `hearing | filing_deadline | expiry |
  other` (plain ISO strings still accepted, typed `other`). Per-type loud
  copy (a hearing warns about in-absentia orders), sorted by days-until,
  and a `next_action` entry for the soonest upcoming date. A `hearing` date
  that already passed auto-triggers the missed-hearing referral;
- **Referral flag** when complexity exceeds tool scope (criminal history,
  prior removal order, missed hearing, prior denial, detention, unlawful
  presence, removal proceedings — e.g. a parsed Notice to Appear — or an
  out-of-scope case type) — the tool refers instead of squeezing the case
  through;
- **Plain-language summary** lines + bilingual Markdown checklist export
  (`exportChecklistMd(r, { lang: 'en' | 'es' })`; the Spanish rendering is
  an unofficial translation, marked as such in its footer).

Determinism contract: `facts.today` is required — the core never reads the
clock, so the same paperwork yields a byte-identical first read on every
run.

## IO contract

```js
import { parseNotice, readCase, exportChecklistMd } from './core/core.js';
const parsed = parseNotice(noticeText);            // deterministic extraction
const result = readCase({
  case_type: 'employment_based', today: '2026-11-07',
  documents: { i693_medical: { present: true, expiry_date: '2027-01-30' }, ... },
  complexity: ['prior_denial'],
  key_dates: { 'I-485 interview': { date: '2026-11-18', type: 'other' } },
  uncertain: parsed.facts.uncertain,               // capture honesty carried through
  ...parsed.facts,                                 // merge parsed documents/key_dates
});
exportChecklistMd(result, { lang: 'es' });         // 'en' by default
```

Errors (thrown): unknown case type; missing or malformed `today` (the clock
is never read); malformed dates (expiry_date, key_dates values); unknown
key-date type; non-array `facts.uncertain`; unknown export lang. Warnings
(not errors): unmapped complexity factors, urgent/passed dates, uncertain
documents and capture notes, out-of-scope scoring notice.

## Deterministic vs LLM-assisted

| Part | Owner |
|---|---|
| Notice templates, checklist templates, referral factors, key-date taxonomy, expiring-soon window, export strings | rules-as-data in `core/core.js` |
| Date math, parsing, readiness, referral logic, summary, exports | deterministic code |
| Scanned images / OCR of real forms, and form types without a template | outside the core — parseNotice returns `uncertain`, and an LLM (optional) can help transcribe, but its output must re-enter through the same JSON and uncertainty rules |

### LLM prompt schema (optional capture step)

```
You extract facts from immigration documents into strict JSON. Extract ONLY
what the document states. Dates must be ISO YYYY-MM-DD. If a date or status
is unreadable, use null and add it to "uncertain" — never guess a date; a
guessed hearing date is worse than a missing one. Schema:
{ "case_type": "family_based"|"employment_based"|"asylum_affirmative"|
"naturalization"|"tps"|"u_visa"|"removal_defense"|null,
  "documents": { "<doc_id>": { "present": true, "expiry_date": "YYYY-MM-DD"|null,
  "uncertain": false } },
  "key_dates": { "<label>": "YYYY-MM-DD"|{ "date": "YYYY-MM-DD",
  "type": "hearing"|"filing_deadline"|"expiry"|"other" } },
  "uncertain": ["..."] }.
Document ids: <ids from the checklist templates>.
```

The LLM never computes readiness or decides referrals; unreadable items are
surfaced as `uncertain`, not smoothed over. For the five templated notice
types, prefer `parseNotice` — it is deterministic and auditable.

## What's better than the closed counterpart

1. **Referral over reach** — complexity factors (including a parsed Notice
   to Appear and any already-passed hearing date) and removal defense route
   to an accredited attorney/representative instead of producing a confident
   checklist that hides risk.
2. **Auditable extraction** — every parsed value names its template rule;
   templates are versioned data you can inspect and localize.
3. **Capture honesty** — unreadable values are marked `uncertain` and carry
   through to readiness scoring (uncertain never counts as ready); the
   extraction prompt's prime directive is "never guess a date".
4. **Byte-identical determinism** — no clock reads; same fictional
   paperwork in, identical first read out, every run (two-run diff is part
   of the example regeneration check).
5. **Self-hostable** — dependency-free core fits nonprofit, low-cost
   deployment (the Mobile Pathways use case) without any vendor.

## Legal accuracy notes

Checklist templates and notice templates are US-context defaults and change
with USCIS/EOIR practice — they are explicitly configurable rules-as-data,
not authority; TPS/U-visa labels are tagged `[verify]` for the same reason.
MM/DD/YYYY parsing assumes the US notice convention. Every output carries a
not-legal-advice disclaimer; the Spanish export is labeled an unofficial
translation. Fictional applicant data throughout.
