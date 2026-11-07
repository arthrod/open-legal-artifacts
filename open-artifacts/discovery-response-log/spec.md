# Spec — discovery-response-log

## Purpose
Maintain a request/response log for a set of written discovery: one entry per
interrogatory / RFP / RFA, each with a draft response, objections, privilege
safety flag, per-round (meet-and-confer) version history, and the response
deadline computed from service date and method.

## Interface (core/core.js, dependency-free ES module)

| Export | Purpose |
|---|---|
| `DEFAULT_OBJECTION_GROUNDS` | Objection-ground library (rules-as-data, FRCP defaults + authorities) |
| `DEFAULT_SERVICE_EXTENSIONS` | FRCP 6(d)-style added-time defaults per service method |
| `calculateDeadline({servedDate, serviceMethod}, config?)` | Deadline + full `calculation[]` audit trace |
| `deadlineStatus(dueDate, asOf)` | `ok` / `due-soon` / `overdue` + days remaining |
| `assessPrivilegeSafety(text)` | `{privilegeSafe, flags[]}` screen |
| `draftResponse(request, config?)` | v1 draft entry (validates objection ids; throws on unknown) |
| `reviseDraft(entry, patch, label?)` | Appends next meet-and-confer version with field diffs |
| `buildLog(params, config?)` | Deadline + entries + counts + disclaimer |
| `toMarkdown(log)` | Markdown log table for correspondence |
| `addDays`, `diffDays` | UTC-safe date helpers |

`config = { responseDays?, serviceExtensions?, objectionGrounds? }` — every
jurisdiction-dependent default is overridable rules-as-data.

## Data model

```
DraftEntry = {
  id, requestNo, type: 'interrogatory'|'rfp'|'rfa', requestText, responseText,
  objections: [{id,label,authority,description}],
  privilegeBasis: string|null,
  status: 'response-only'|'objection-and-response'|'withheld-logged',
  privilegeSafe: boolean, safetyFlags: string[],
  versions: [{ round, label, fields:{responseText,objectionIds,privilegeBasis},
               changes: string[] }]   // deterministic old→new diffs
}
```

## Deterministic vs LLM-assisted

- Deterministic: everything in the export table above — deadline math,
  ground validation/citation, privilege screening, diffs, exports.
  Property: same input JSON → byte-identical output JSON.
- LLM-assisted (optional, outside core): drafting `responseText` from case
  files, selecting applicable grounds, summarizing M&C positions. Prompt
  schema in README.md; core validates LLM output (unknown grounds rejected,
  privilege screen re-run) rather than trusting it.

## Better than the closed counterpart

1. Objections as auditable rules-as-data with authorities, not prompt-hidden.
2. Deadline computation with an itemized addend trace and configurable
   jurisdiction offsets.
3. Privilege-safe gate on every draft; withholdings routed to privilege log.
4. Meet-and-confer rounds produce immutable version diffs.
5. Zero dependencies, offline, self-hostable; tests included.

## Non-goals
No e-filing, no service of the responses themselves, no privilege-log
generation (separate artifact), no state-law lookups (override data instead).

## Legal disclaimers
FRCP defaults only; verify against governing state/local rules. Fictional
example data. Not legal advice.
