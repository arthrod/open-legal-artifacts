# renewal-calendar

Open reimplementation of Anthropic's **Renewal calendar** — last day to give
notice on each contract — where date honesty is the product: ambiguous
expressions are flagged (and scheduled conservatively), unresolvable ones are
never guessed, and notice deadlines export to a real ICS calendar.

## What it does

- Normalizes structured clause-JSON date expressions through an explicit
  grammar (rules-as-data, extendable): exact dates, `N days
  before/after/prior to <anchor>` (renewal date, effective date, expiration,
  quarter end, month end), `within N days of <any anchor>` (ambiguous: both
  readings computed, earlier scheduled, flag + confirm note), bare
  `quarter end` / `month end` (period-selection flag), anything else →
  unresolved (review list, no calendar entry, never guessed).
- Computes notice deadlines from **rules-as-data lead times**
  (`byClauseType` + default + clause-level overrides), recording which rule
  produced each deadline.
- Assigns every event an **urgency tier** (`overdue / 30d / 60d / 90d /
  180d / later`) from days-until-notice-deadline, plus an **escalation
  owner** from `rules.escalation[]` — both ride into the ICS CATEGORIES and
  SUMMARY prefix.
- Runs a **coverage audit**: contracts with no dated renewal/notice clause
  are listed in `cal.coverage` — quiet is not clean.
- Accepts optional **attorney confirmations** that pin an ambiguous
  candidate to a date; the event is promoted to confirmed with provenance.
  Pins that match no candidate are refused loudly, never applied.
- Projects **recurrence** (`renewalTermMonths` on auto-renewal/evergreen
  clauses): the next two renewal cycles with stable UIDs, deduped by
  contract + clause + date.
- Exports **RFC 5545 ICS** — VEVENT per notice deadline, 14-day alarm,
  urgency tier + escalation in CATEGORIES, provenance + ambiguity warnings
  in the description, lines folded to spec.

## Run

```bash
node --test            # 23 tests (node:test)
node examples/run.js   # 4 fictional contracts → calendar.json, renewal-calendar.ics, report.md
```

Open `demo/index.html` for the interactive timeline demo.

## What's better than the closed counterpart

1. **Ambiguity flags, not silent guesses.** The example's "within 60 days of
   quarter end" produces both candidates, schedules the earlier, and says
   what a lawyer must confirm. Extraction errors on auto-renewal windows are
   the expensive failure mode — this surfaces them.
2. **Unresolvable expressions excluded from the calendar**, listed for human
   review instead — and the coverage audit names contracts with no dated
   clause at all, so a quiet calendar is never mistaken for a clean one.
3. **Rules-as-data lead times with provenance** — every deadline says whether
   it came from `rules.byClauseType[…]` or a clause override.
4. **Deterministic urgency tiers + escalation owners** — overdue/30/60/90/180
   is computed, not prompt-tuned, and ships in the ICS alongside the event.
5. **Attorney confirmations as data** — pinning an ambiguous candidate is
   recorded, provenance-tracked, and refused when it matches nothing.
6. **Recurrence projection** — successive-term clauses yield the next two
   cycles, not a calendar that goes stale after cycle one.
7. **ICS export with alarms** — the closed artifact finds dates but reminds
   no one; this one lands in your calendar system.

## Layout

- `spec.md` — grammar, IO contract, extraction prompt schema
- `core/core.js` — dependency-free ES module (browser + Node)
- `core/core.test.js` — node:test suite
- `examples/` — fictional worked example + runner + outputs (incl. `.ics`)
- `demo/index.html` — standalone demo using the shared design tokens

## Disclaimer

All example data fictional. Lead-time defaults are configurable rules-as-data,
not legal advice — each contract's notice window is governed by its own text.
