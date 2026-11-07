# subpoena-response

Open counterpart of PwC's Subpoena Response Tool (Claude for Legal partner
gallery). A subpoena-facts JSON goes in; a deterministic tracker comes out:

- deadline math — 14-day FRCP-style default, calendar **or** court-day
  counting (weekends + holidays), mail-service extension, days remaining,
  overdue/critical escalation;
- responsive scope as structured fields (date range, custodians, data types)
  with overbreadth flags mapped to suggested objections;
- privilege/log workflow (`not_started → … → final`) with forward-only
  transitions and progress %;
- objection-grounds library (10 stable ids, jurisdiction-dependent,
  rules-as-data) and a Markdown checklist export.

## Run

```bash
node --test "core/*.test.js"     # 18 tests
node examples/run.js             # regenerates output.json + checklist.md
```

Demo: `demo/index.html` (standalone, shared design tokens, prefilled with
the fictional Drummond v. Halvorsen Freight matter).

## Better than the closed counterpart

Every deadline, flag, and state change is a reproducible function of the
input — no opaque precedent corpus. Forum rules (day counts, extensions,
holidays, objection grounds) are editable data, not hidden logic, and the
optional LLM step is barred from computing dates or selecting objections.
Checklists only — never legal conclusions or filed work product. Not legal
advice.
