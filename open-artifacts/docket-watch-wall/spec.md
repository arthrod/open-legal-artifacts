# Spec — docket-watch-wall

## Purpose
A per-watcher wall of new docket entries: filter a JSON feed of docket
entries by judge / party / practice-area watchers, diff against a persisted
seen-store so only *new* entries surface, and attach escalation flags
(sanctions, default, show-cause …) as rules-as-data.

**NO live API.** The CourtListener RECAP integration is a spec'd future hook,
implemented as a pure normalizer seam (`fromRecapPayload`) — no network code
in this core, ever.

## Interface (core/core.js, dependency-free ES module)

| Export | Purpose |
|---|---|
| `DEFAULT_ESCALATION_RULES` | Rules-as-data: `{id, label, pattern, level: urgent\|important}` (case-insensitive regexes) |
| `escalate(entry, rules?)` | Applied rules for one entry, with the matched text (every rule is linted first) |
| `processFeed(entries, watchers, seenStore?, options?)` | `{wall, escalatedNew, deadlinesNew, nextSeenStore, stats}` — `options`: `{escalationRules?, asOf?, horizonDays?}` |
| `stampSeenStore(store, isoTs)` | Caller clocks the snapshot (keeps core deterministic) |
| `fromRecapPayload(recap)` | Pure RECAP → internal-entry normalizer (future hook seam) |
| `normalizeParties(parties)` | Party-shape normalizer used by `fromRecapPayload`: accepts a `;`/`,` delimited string, an array of `string\|{name}`, or anything else (→ `[]`); always returns `string[]` |
| `toMarkdown(result)` | Wall rendering for email/commit digest — renders *stored* escalations, no re-derivation |
| `DEADLINE_RULES` + `extractDeadlines(entry, {asOf}?)` | Candidate deadlines from entry text: `{date, label, basis, confidence, needsVerification}` |
| `pruneSeenStore(store, {keep, maxIds})` | Cap the seen-store; `keep` (current feed ids) always survive |
| `lintRule(rule)` / `SafeRuleError` | Heuristic ReDoS screen every pattern must pass before compilation |
| `toDeadlineFeed(result)` | Deterministic iCal export of extracted deadlines (VEVENT + `X-NEEDS-VERIFICATION`)

Entry shape: `{id, date, description, case: {name, judge, parties[],
practiceArea, court}}`. Watcher shape: `{id, name, judge?, party?,
practiceArea?}` — judge/party match case-insensitively as substrings;
practiceArea matches exactly (your taxonomy, your rules).

Seen-store shape: `{ids: string[], updatedAt, count}` — persist anywhere
(file, localStorage, KV store). Diffing is by entry `id`. Long-running
stores grow without bound; `pruneSeenStore(store, {keep, maxIds})` caps them
— `keep` (the current feed's ids) always survive, remaining capacity fills
from the tail of the sorted id list. Default cap: 500.

## Deadline extraction (heuristic — always `[verify]`)

`extractDeadlines(entry, {asOf})` maps deadline phrases in the entry
description to candidate dates via `DEADLINE_RULES` (rules-as-data, each
pattern captures a day count):

- **Anchor recipe**: `asOf` (caller-supplied, `YYYY-MM-DD`) wins; otherwise
  the entry's own filing date is the anchor; if neither parses there is no
  anchor and the result is `[]` — the core never reads a clock, so a wrong
  `asOf` skews the math. Pass it explicitly in scheduled runs.
- **Never a silent default**: a rule match yields
  `{date, label, basis, confidence, needsVerification: true}`; no match
  yields `[]` — nothing is invented.
- **Confidence**: rule tier is `medium` (explicit day count in the order
text); a blank court drops it to `low`. Any non-empty court keeps the
rule tier — the core keeps no court-name registry, so it cannot judge a
court "unknown" (jurisdiction tables are out of scope). Every deadline is
`needsVerification` regardless of confidence.
- **Jurisdiction tables are out of scope**: these phrases are simplified
  fiction, not any court's actual rules. Statutory text in examples is
  illustrative and `[verify]`-tagged. Verify against the real docket.
- **Horizon**: in `processFeed`, each deadline gets `withinHorizon: true`
  when it falls within the watcher's `deadlineHorizonDays` (default 14,
  `options.horizonDays` as fallback) — a deterministic daily-cadence
  trigger.

`toDeadlineFeed(result)` exports them as iCal: all-day `VEVENT`s with
`X-NEEDS-VERIFICATION:TRUE`, deduped across watchers, `DTSTAMP` pinned to
the filing date so replays are byte-identical. All-day dates only; lines
are not RFC-folded at 75 octets. Note: `stats.deadlines` counts
per-watcher occurrences, so one deadline visible to two watchers counts
twice; `toDeadlineFeed` is the deduped view.

## Untrusted-text hardening

Docket descriptions are filer-supplied untrusted text. Every pattern
(escalation and deadline rules alike) passes `lintRule` before it is
compiled: max 200 chars, valid regex, no nested quantifiers (`(a+)+`), no
alternation inside a quantified group (`(a|b)+`), max 4 alternation
branches. Violations throw `SafeRuleError` (fail closed). This is a
heuristic screen, not a proof — keep patterns small and specific.

## Deterministic vs LLM-assisted

- **Deterministic (core):** filtering, diffing, escalation matching,
  stats, rendering, RECAP normalization. No clock reads inside the core
  (`updatedAt` is stamped by the caller).
- **LLM-assisted (optional, outside core):** summarizing a dense minute
  entry into one line, clustering related entries across cases, drafting the
  client alert email.

### LLM prompt schema (entry summarization, when wired)

```json
{
  "task": "Summarize this docket entry in <=15 words for an associate's morning wall.",
  "entry": { "date": "2026-04-02", "description": "...", "case": "..." },
  "constraints": [
    "Do not add actors, dates, or motions not present in the description.",
    "Preserve the entry type (motion/order/notice/minute entry).",
    "If the description is already terse, return it unchanged."
  ],
  "output_schema": { "summary": "string", "unchanged": "boolean" }
}
```

## CourtListener RECAP — spec'd future hook (not implemented)

The intended ingestion path, documented so an implementer can add it without
touching core logic:

1. A scheduler (cron / Val Town / GitHub Action) hits
   `https://www.courtlistener.com/api/rest/v3/search/` or the RECAP docket
   endpoint with the courts/cases of interest, carrying an API token.
2. Each response row is passed through `fromRecapPayload()` (already
   implemented, pure) to get the internal entry shape.
3. `processFeed(entries, watchers, seenStore)` does the rest — the seen-store
   persists between runs as a JSON file or KV value.
4. Escalations route to email/Slack per your notifier; the core stays offline
   and testable.

Free Law Project's CourtListener/RECAP is the open backbone — no Anthropic or
PACER lock-in required.

## Better than the closed counterpart

1. **No data lock-in**: watchers, rules, and seen-store are plain JSON you
   own; the wall is exportable markdown.
2. **Auditable escalation rules** as data — add "arbitration" watches by
   editing JSON, not a prompt.
3. **Deterministic diffing** with a caller-stamped clock: tests and replays
   are exact.
4. **Runs offline** in-browser or Node; the RECAP hook is a pure seam, not a
   hidden network call.

## Disclaimers
Fictional feed data. Docket descriptions alone do not establish deadlines —
verify against the actual docket. Not legal advice.
