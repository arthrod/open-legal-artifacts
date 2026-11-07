# renewal-calendar

Open reimplementation of Anthropic's **Renewal calendar** — last day to give
notice on each contract — where date honesty is the product: ambiguous
expressions are flagged (and scheduled conservatively), unresolvable ones are
never guessed, and notice deadlines export to a real ICS calendar.

## What it does

- Normalizes structured clause-JSON date expressions through an explicit
  grammar: exact dates, `N days before/after <anchor>`, `within N days of
  quarter end` (ambiguous: both readings computed, earlier scheduled,
  flag + confirm note), bare `quarter end` (quarter-selection flag), anything
  else → unresolved (review list, no calendar entry).
- Computes notice deadlines from **rules-as-data lead times**
  (`byClauseType` + default + clause-level overrides), recording which rule
  produced each deadline.
- Exports **RFC 5545 ICS** — VEVENT per notice deadline, 14-day alarm,
  provenance + ambiguity warnings in the description, lines folded to spec.

## Run

```bash
node --test            # 12 tests (node:test)
node examples/run.js   # 4 fictional contracts → calendar.json, renewal-calendar.ics, report.md
```

Open `demo/index.html` for the interactive timeline demo.

## What's better than the closed counterpart

1. **Ambiguity flags, not silent guesses.** The example's "within 60 days of
   quarter end" produces both candidates, schedules the earlier, and says
   what a lawyer must confirm. Extraction errors on auto-renewal windows are
   the expensive failure mode — this surfaces them.
2. **Unresolvable expressions excluded from the calendar**, listed for human
   review instead.
3. **Rules-as-data lead times with provenance** — every deadline says whether
   it came from `rules.byClauseType[…]` or a clause override.
4. **ICS export with alarms** — the closed artifact finds dates but reminds
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
