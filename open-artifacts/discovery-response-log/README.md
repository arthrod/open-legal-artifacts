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
- screens every draft with a **privilege-safe flag** so a draft mentioning
  privilege/work-product or withholding on privilege is never silently
  released — withholding entries are routed to a privilege-log workflow,
- versions drafts **per meet-and-confer round** with deterministic
  field-level diffs (old → new), so concessions are auditable,
- computes the **response deadline**: 30 days after service by default
  (FRCP 33(b)(2)/34(b)(2)), day of service excluded (FRCP 6(a)(1)), plus 3
  added days for mail service (FRCP 6(d)); every number is configurable.

## IO contract

```
buildLog({
  servedDate: "2026-03-10",            // ISO date the set was served
  serviceMethod: "mail",               // electronic|personal|mail|leave-of-court|other
  requests: [{
    requestNo, type, text,             // 'RFP 7', 'rfp', request text
    responseText?, objectionIds?,      // draft answer, grounds from the library
    privilegeBasis?                    // set when withholding on privilege
  }]
}[, config]) ->
{
  deadline: { dueDate, responseDays, extensionDays, serviceMethod, ruleBasis, calculation[] },
  entries:  [{ id, requestNo, type, status, objections[], privilegeSafe, safetyFlags[],
               versions: [{ round, label, fields, changes[] }] }],
  counts, disclaimer
}

reviseDraft(entry, patch, label)  // appends next meet-and-confer version + diff
calculateDeadline({servedDate, serviceMethod}[, config]) -> deadline
deadlineStatus(dueDate, asOf)     // ok | due-soon | overdue (+ days remaining)
assessPrivilegeSafety(text)       // { privilegeSafe, flags[] }
toMarkdown(log)                   // meet-and-confer table
```

## Deterministic vs LLM-assisted

**Deterministic (this core):** deadline math, objection-ground validation and
citation attachment, privilege-safety screening, version/diff bookkeeping,
counts, markdown/CSV-style exports. Same input → same output, testable.

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
  (30d period, mail +3d, day-of-service exclusion) instead of a bare date.
- **Privilege-safe flag** on every draft before release, with routing to the
  privilege log for withholding responses.
- **Meet-and-confer versioning** with field-level diffs — every narrowed
  objection has a paper trail.
- **Runs anywhere**: dependency-free ES module, browser + Node, offline.

## Run / test

```
node --test core/        # unit tests (node:test)
node examples/run.js     # regenerate examples/output.json + examples/log.md
open demo/index.html     # interactive demo (file:// works; no server needed)
```

## Legal accuracy

US federal defaults (FRCP 26, 33, 34, 6) are configurable via
`config.responseDays` and `config.serviceExtensions`. State rules differ
(e.g., some states give 5-day mail extensions or different response periods);
override rather than trust. Not legal advice.
