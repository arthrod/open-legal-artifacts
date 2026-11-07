# entity-compliance-calendar — open artifact spec

Open reimplementation of Anthropic's "Entity compliance calendar" artifact
(catalog §2.20): *"Filing deadlines across every entity."*

The catalog's open-reimplementation note is blunt: deadline rules are
statutory and change, so **the real moat is the rule base, not the model**.
This core is built accordingly — obligations are versioned rules-as-data
with statutory cites, and every deadline is computed by code from
(entity formation anchor × obligation rule × recorded filings), never by a
model.

## What it does

- **Entities × obligations matrix** where each cell states its next due
  date, period, computation rule, and status:
  `delinquent | due-soon | scheduled | satisfied | n/a`.
- **Recurring scheduling**:
  - `annual` + `formationAnniversary` — anniversary of formation (Feb-29
    anchors roll to Feb-28 in non-leap years);
  - `annual|biennial` + `calendarFixed` (e.g. due 4/15) — fixed date;
    biennial honors formation-year parity; cycles before formation are
    skipped; impossible fixed dates (Feb 30) produce no date;
  - `event` — one-shot, N days after the anchor event (e.g. initial report
    90 days after formation), satisfied permanently by one filing.
- **Earliest-unfiled-period semantics** — a missed 2021 biennial statement
  surfaces as delinquent *since 2021*, not as "current year"; filings skip
  satisfied periods; gaps never disappear.
- **Delinquency flags** ranked by overdue days, plus due-soon window
  (default 45d, configurable).
- **Exports**: CSV (full matrix incl. statutory cites and skip reasons) and
  RFC 5545 ICS (VEVENT per actionable cell, `RRULE:FREQ=YEARLY[;INTERVAL=2]`
  for recurring obligations, 30-day alarm, delinquency marker).

## IO contract

```js
import { nextDue, buildMatrix, toCsv, toICS } from "./core/core.js";

nextDue(obligation, entity, filings, asOfIso);
//   => { applies, skipReason?, dueOn, period, status, ruleNote }
const matrix = buildMatrix({ asOf, entities, obligations, filings, soonDays? });
toCsv(matrix); toICS(matrix);
```

- `entities`: `[{ id, name, jurisdiction, type, formedOn, status }]`
- `obligations` (rules-as-data): `[{ id, name, jurisdiction, entityTypes?, recurring, anchor, dueMonth?, dueDay?, dueWithinDays?, statuteCite }]`
- `filings`: `[{ entityId, obligationId, period: number|"once", filedOn }]`
- `asOf` caller-supplied; no hidden clocks.

## Deterministic vs LLM-assisted

| Layer | Who |
|---|---|
| Cycle math, parity, delinquency, exports | **code** |
| Maintaining the obligation rule base per jurisdiction (the actual moat) | **humans** (legal ops / paralegals), versioned data |
| Structuring raw Secretary-of-State records into entity JSON | optional LLM (extraction only) |

### LLM prompt schema (extraction step, optional)

```json
{
  "task": "Structure the provided Secretary-of-State / formation records into entity objects.",
  "output_schema": { "id": "…", "name": "legal name verbatim", "jurisdiction": "US-XX", "type": "corp|llc|nonprofit", "formedOn": "YYYY-MM-DD", "status": "active|dissolved" },
  "rules": ["Copy names and dates verbatim; never infer a formation date.", "Unreadable date → null, never guessed."]
}
```

The obligation rule base is never LLM-maintained: rules enter as reviewed
data with statutory cites.

## What's better than the closed counterpart

- **The rule base is inspectable data with cites** — every cell can say
  which statute (fictional here) imposes it and which rule computed the
  date; Anthropic's tracker keeps that logic inside the product.
- **Earliest-unfiled-period delinquency** — gaps surface at their true age
  (the worked example flags a biennial statement 2032 days overdue), not
  rolled into "this year's task".
- **Recurrence in the export** — ICS events carry `RRULE` so the calendar
  system keeps scheduling future cycles; CSV carries cites for the audit
  trail.
- **Honest edge handling** — impossible fixed dates, missing formation
  dates, dissolved entities, and off-type obligations all resolve to `n/a`
  with reasons instead of fabricated deadlines.

## Disclaimer

Obligation rules are jurisdiction-dependent and change; the bundled rules
are fictional US-flavored examples. Maintain the rule base with effective
dates before operational use. Not legal advice.
