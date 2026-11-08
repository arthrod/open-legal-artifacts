# discovery-response-log

> Request-by-request discovery response log: draft responses, objection
> grounds as rules-as-data, privilege-safe screening, meet-and-confer
> versioning, and deadline math with service-method offsets.
> Open counterpart to Anthropic's "Discovery response log" artifact.

**Fictional data only. Not legal advice.**

## What it does

For each discovery request (interrogatory / RFP / RFA) in a set:

- drafts a structured response entry (substantive text + objections + status),
- grounds every objection in a configurable **objection-ground library**
  (FRCP defaults with cites; override per jurisdiction as rules-as-data),
- checks every Bates **citation against a production manifest** — cites
  outside the produced ranges (or unparseable) are flagged, so provenance is
  machine-checked, not decorative,
- screens every draft with a **privilege-safe flag** so a draft mentioning
  privilege/work-product or withholding on privilege is never silently
  released — withholding entries are routed to a privilege-log workflow;
  deterministic negation/waiver boilerplate ("without waiver of privilege",
  "not privileged") does not false-flag (flag-on-uncertain otherwise),
- enforces a **release gate**: every entry carries
  `reviewState: draft → in-review → approved`, and `assertReleasable(log)`
  throws on any unapproved or privilege-unsafe entry before anything ships,
- versions drafts **per meet-and-confer round** with deterministic
  field-level diffs (old → new), so concessions are auditable,
- computes the **response deadline**: 30 days after service by default
  (FRCP 33(b)(2)/34(b)(2)), day of service excluded (FRCP 6(a)(1)), plus 3
  added days for mail service (FRCP 6(d)); **FRCP 29(b) stipulated
  extensions** extend the deadline with one audit line per stipulation;
  every number is configurable.

## IO contract

```
buildLog({
  servedDate: "2026-03-10",            // ISO date the set was served
  serviceMethod: "mail",               // electronic|personal|mail|leave-of-court|other
  extensions: [{ days: 14, basis: "...", agreedDate: "2026-03-24" }],  // FRCP 29(b) stipulations
  requests: [{
    requestNo, type, text,             // 'RFP 7', 'rfp', request text
    responseText?, objectionIds?,      // draft answer, grounds from the library
    citations?,                        // Bates cites relied on, e.g. "VEST 0001-3120"
    privilegeBasis?                    // set when withholding on privilege
  }]
}[, config]) ->
{
  deadline: { dueDate, responseDays, extensionDays, stipulatedDays, serviceMethod,
              ruleBasis, calculation[] },
  entries:  [{ id, requestNo, type, status, reviewState, citations[], citationFlags[],
               objections[], privilegeSafe, safetyFlags[],
               versions: [{ round, label, fields, changes[] }] }],
  counts, disclaimer
}

config = {
  responseDays?, serviceExtensions?, objectionGrounds?,
  productionManifest?: [{ prefix: "VEST", start: 1, end: 5000 }],
  privilegeMarkers?: ["..."]          // replaces the default screen markers
}

reviseDraft(entry, patch, label?, config?)  // appends next M&C version + diff (throws on unknown grounds)
setReviewState(entry, 'approved')     // draft | in-review | approved
assertReleasable(log)                 // throws listing blockers; true when releasable
calculateDeadline({servedDate, serviceMethod, extensions?}[, config]) -> deadline
deadlineStatus(dueDate, asOf)         // ok | due-soon | overdue (+ days remaining)
assessPrivilegeSafety(text, config?)  // { privilegeSafe, flags[] } — negation-aware
checkCitations(citations, manifest)   // { citations, citationFlags }
toMarkdown(log)                       // table + per-round M&C diff table
toCSV(log)                            // CSV export (header + one row per entry)
```

## Deterministic vs LLM-assisted

**Deterministic (this core):** deadline math (incl. stipulated extensions),
objection-ground validation and citation attachment, manifest-checked Bates
cites, privilege-safety screening, review/release gating, version/diff
bookkeeping, counts, markdown and CSV exports. Same input → same output
(byte-identical, including ids), testable.

**LLM-assisted (outside this core, optional):** drafting the substantive
`responseText` from a case file, classifying which grounds apply to a request,
summarizing meet-and-confer positions.

### LLM prompt schema (for the drafting step, when you choose to wire one)

```json
{
  "task": "Draft a discovery response for the request below from the case-file excerpts.",
  "request": { "requestNo": "RFP 7", "type": "rfp", "text": "..." },
  "case_file_excerpts": [{ "bates": "VEST 0001-3120", "summary": "..." }],
  "constraints": [
    "Never describe content of privileged material; mark privilegeBasis instead.",
    "Cite Bates ranges for every production statement.",
    "If the excerpt does not support a statement, output supported:false for it."
  ],
  "output_schema": {
    "responseText": "string",
    "citations": ["string"],
    "objectionIds": ["ground-id from the library"],
    "unsupported_claims": ["string"]
  }
}
```

The core then validates `objectionIds` against the library and screens
`responseText` — LLM output is never trusted, only checked.

## What's better than the closed counterpart

- **Rules-as-data objections**: grounds ship as data with authorities you can
  swap per jurisdiction; nothing is baked into a prompt.
- **Deadline math you can audit**: the `calculation[]` trace shows every addend
  (30d period, mail +3d, day-of-service exclusion, each FRCP 29(b) stipulation)
  instead of a bare date.
- **Manifest-checked citations**: every Bates cite is verified against the
  supplied production index; out-of-range or malformed cites are flagged
  before release.
- **Privilege-safe flag** on every draft before release, with routing to the
  privilege log for withholding responses; waiver boilerplate doesn't
  false-flag (unknown phrasings still flag — flag-on-uncertain).
- **Code-enforced release gate**: `assertReleasable` throws unless every
  entry is attorney-approved and privilege-safe — a gate in the data model,
  not in a prompt.
- **Meet-and-confer versioning** with field-level diffs — every narrowed
  objection has a paper trail, surfaced in the markdown export.
- **Deterministic ids and outputs**: ids derive from the request number;
  identical input rebuilds byte-identical JSON/CSV.
- **Runs anywhere**: dependency-free ES module, browser + Node, offline.

## Run / test

```
node --test core/core.test.js   # unit tests (node:test; 30 tests)
node examples/run.js            # regenerate examples/output.json + log.md + log.csv
open demo/index.html            # interactive demo (file:// works; no server needed)
```

## Legal accuracy

US federal defaults (FRCP 26, 33, 34, 6) are configurable via
`config.responseDays` and `config.serviceExtensions`. State rules differ
(e.g., some states give 5-day mail extensions or different response periods);
override rather than trust. Not legal advice.
