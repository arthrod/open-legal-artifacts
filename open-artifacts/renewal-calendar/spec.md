# renewal-calendar — open artifact spec

Open reimplementation of Anthropic's "Renewal calendar" artifact (catalog
§2.9): *"last day to give notice on each contract, from its terms."*

The catalog's critique (fynk S3): the closed artifact finds dates but does
not remind anyone, and **extraction errors on auto-renewal windows are
costly**. This core therefore treats date honesty as the product: every
derived date carries its normalization trail; ambiguity is flagged, not
papered over; unresolvable expressions never become calendar dates.

## What it does

1. **Date normalization with ambiguity flags** over a small, explicit grammar
   (rules-as-data, extendable):
   - `YYYY-MM-DD` → exact
   - `N days before/after <renewal date|effective date|quarter end>` → computed
   - `within N days of quarter end` → **ambiguous**: both readings computed,
     earlier (conservative) scheduled, `window-direction-and-quarter` flag with
     a confirm-with-lawyer note
   - bare `quarter end` → ambiguous (`quarter-selection` flag: nearest quarter
     end on/after as-of assumed)
   - anything else (e.g. `on mutual agreement`) → **unresolved** — listed for
     review, excluded from the calendar, never guessed
2. **Notice-deadline computation** from rules-as-data lead times:
   `{ defaultLeadTimeDays: 60, byClauseType: { "auto-renewal": 90, … } }`,
   clause-level `leadTimeDaysOverride` wins; provenance recorded
   (`rules.byClauseType[auto-renewal]` vs `clause override`).
3. **ICS export** (RFC 5545): one VEVENT per dated item at its notice
   deadline, 14-day VALARM, full provenance + ambiguity warnings in the
   DESCRIPTION, folded lines ≤ 75 octets. Unresolved items produce no event.

## IO contract

```js
import { normalizeDateExpression, buildCalendar, toICS } from "./core/core.js";

normalizeDateExpression("within 60 days of quarter end", { asOf, renewalDate?, effectiveDate? });
//   => { status: "exact"|"computed"|"ambiguous"|"unresolved", date, reason, candidates?, ambiguityFlag? }

const cal = buildCalendar({ asOf, contracts: [...clauses...] }, rules);
// cal.events[] (confirmed|ambiguous) sorted by noticeDeadline; cal.unresolved[]; cal.summary{}
toICS(cal);
```

Clause input: `{ type, date | dateExpression, quote?, leadTimeDaysOverride? }`
— structured clause JSON produced upstream (human or LLM extraction, schema
below). The core never reads raw contract prose.

## Deterministic vs LLM-assisted

| Layer | Who |
|---|---|
| Grammar parsing, ambiguity flags, lead-time math, ICS | **code** |
| Finding renewal/termination clauses in contract text and filling the clause JSON | optional LLM (extraction) |
| Lead-time policy | **org** (rules-as-data) |

### LLM prompt schema (extraction step, optional)

```json
{
  "task": "Extract renewal/notice/termination clause objects from the provided contract text.",
  "output_schema": {
    "type": "auto-renewal|evergreen|termination-for-convenience|notice|price-adjustment",
    "date": "YYYY-MM-DD when the clause states an explicit date, else null",
    "dateExpression": "verbatim temporal phrase when no explicit date (e.g. 'within 60 days of quarter end')",
    "quote": "verbatim clause text",
    "leadTimeDaysOverride": "number only when the clause states its own notice window, else null"
  },
  "rules": ["Copy temporal phrases verbatim into dateExpression — never interpret them.", "No invented dates."]
}
```

Interpretation of ambiguous phrases is deliberately left to the deterministic
grammar + human confirmation, not the model.

## What's better than the closed counterpart

- **Ambiguity is a first-class output.** "Within 60 days of quarter end" is
  not silently resolved — both readings are computed, the conservative one is
  scheduled, and the flag tells you what to confirm.
- **Unresolvable ≠ guessed.** Free-text temporal phrases land in a review
  list, not on the calendar.
- **Lead times as versioned data** with per-event provenance (which rule
  produced this deadline), plus clause-level overrides.
- **ICS export** — deadlines land in the calendar system people actually use,
  with alarms; the closed artifact "finds dates" but reminds no one.

## Disclaimer

Lead-time defaults are sensible US-flavored rules-as-data, not legal advice;
each contract's notice window is governed by its own text. All example data
fictional.
