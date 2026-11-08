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
| `calculateDeadline({servedDate, serviceMethod, extensions?}, config?)` | Deadline + full `calculation[]` audit trace, incl. FRCP 29(b) stipulated extensions (`extensions: [{days, basis?, agreedDate?}]`, audited line by line) |
| `deadlineStatus(dueDate, asOf)` | `ok` / `due-soon` / `overdue` + days remaining |
| `assessPrivilegeSafety(text, config?)` | `{privilegeSafe, flags[]}` screen; deterministic negation/waiver contexts don't flag; `config.privilegeMarkers` overrides the marker list |
| `checkCitations(citations, manifest)` | Bates cites vs `config.productionManifest` ranges; outside/unparseable → flags |
| `draftResponse(request, config?)` | v1 draft entry (validates objection ids; throws on unknown) |
| `reviseDraft(entry, patch, label?, config?)` | Appends next meet-and-confer version with field diffs; validates against config, throws on unknown grounds |
| `buildLog(params, config?)` | Deadline + entries + counts + disclaimer; rejects duplicate request numbers |
| `setReviewState(entry, state)` | `draft` → `in-review` → `approved`; rejects invalid states |
| `assertReleasable(log)` | Release gate: throws listing every unapproved or privilege-unsafe entry; returns `true` when releasable |
| `toMarkdown(log)` | Markdown log table + per-round meet-and-confer diff table |
| `toCSV(log)` | CSV export (header + one row per entry, RFC 4180-style quoting) |
| `addDays`, `diffDays` | UTC-safe date helpers |

`config = { responseDays?, serviceExtensions?, objectionGrounds?, productionManifest?, privilegeMarkers? }` — every
jurisdiction-dependent default is overridable rules-as-data. `productionManifest` is
`[{prefix, start, end}]` Bates ranges actually produced; screening is opt-in (no manifest → no flags).

## Data model

```
DraftEntry = {
  id,                              // deterministic: derived from requestNo ("dr-rfp-7")
  requestNo, type: 'interrogatory'|'rfp'|'rfa', requestText, responseText,
  citations: string[],             // Bates cites relied on by the answer
  citationFlags: string[],         // cites outside the production manifest / unparseable
  objections: [{id,label,authority,description}],
  privilegeBasis: string|null,
  status: 'response-only'|'objection-and-response'|'withheld-logged',
  reviewState: 'draft'|'in-review'|'approved',
  privilegeSafe: boolean, safetyFlags: string[],
  versions: [{ round, label, fields:{responseText,objectionIds,privilegeBasis,citations},
               changes: string[] }]   // deterministic old→new diffs
}
```

Release gate: `assertReleasable(log)` throws unless every entry is `approved`
and privilege-safe. Approving a `withheld-logged` entry attests it appears on
the privilege log (FRCP 26(b)(5)); a draft whose text trips the screen blocks
release even when approved.

## Deterministic vs LLM-assisted

- Deterministic: everything in the export table above — deadline math
  (incl. stipulated extensions), ground validation/citation, manifest-checked
  Bates cites, privilege screening, review/release gate, diffs, exports.
  Property: same input JSON → byte-identical output JSON, including ids.
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
5. Machine-checked citation provenance: cites are verified against a supplied
   production manifest, not linked decoratively.
6. Code-enforced release gate: nothing ships unapproved or privilege-unsafe.
7. Zero dependencies, offline, self-hostable; tests included.

## Non-goals
No e-filing, no service of the responses themselves, no privilege-log
generation (separate artifact), no state-law lookups (override data instead).

## Legal disclaimers
FRCP defaults only; verify against governing state/local rules. Fictional
example data. Not legal advice.
