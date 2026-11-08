# docket-watch-wall

> A wall of new docket entries per watcher — judge / party / practice-area
> filters, seen-store diffing, escalation flags — offline and deterministic.
> Open counterpart to Anthropic's "Docket watch wall" artifact.

**Fictional data only. Not legal advice.**

## What it does

- Filters a JSON feed of docket entries through **watchers** (judge,
  party, practice-area — substring/exact, case rules as data).
- Diffs against a persisted **seen-store** so each review shows only what is
  new; the store is plain JSON you own (file/localStorage/KV).
- Applies **escalation rules** (sanctions, default, show cause, injunction,
  hearing, trial, contempt…) as rules-as-data with `urgent`/`important`
  levels; fully overridable — and the override now flows end-to-end through
  `processFeed` → `toMarkdown`.
- Extracts **candidate deadlines** from entry text (`"response due within
  14 days"`) as rules-as-data: `{date, basis, confidence,
  needsVerification}` — blank court drops to low confidence, no
  match invents nothing. Each gets a `withinHorizon` flag against the
  watcher's `deadlineHorizonDays` (default 14) and exports to **iCal**
  (`toDeadlineFeed`, every VEVENT carries `X-NEEDS-VERIFICATION:TRUE`).
- **Regex-lints every rule** before compiling it over untrusted filer text
  (`lintRule` / `SafeRuleError`: nested quantifiers, deep alternation,
  oversize patterns — fail closed).
- Keeps the seen-store bounded with `pruneSeenStore(store, {keep, maxIds})`.
- Renders the wall to markdown for digests.
- **No live API**: CourtListener RECAP ingestion is a spec'd future hook —
  a pure normalizer seam (`fromRecapPayload`) is implemented; fetching is
  deliberately not. See [spec.md](spec.md) for the wiring recipe.

## IO contract

```
processFeed(entries, watchers, seenStore, {escalationRules?, asOf?, horizonDays?}) ->
{
  wall: [{ watcher, newEntries: [...] }],          // per-watcher new items
  escalatedNew: [{ watcherId, entry, escalations }],
  deadlinesNew: [{ watcherId, entry, deadlines: [{date, label, basis,
                 confidence, needsVerification, withinHorizon}] }],
  nextSeenStore: { ids: [...], updatedAt: null, count },  // caller stamps clock
  stats: { entriesInFeed, watchers, newEntries, escalated, deadlines }
}

extractDeadlines(entry, {asOf}) -> [{date, label, basis, confidence, needsVerification}]
toDeadlineFeed(result) -> iCal text (VEVENT + X-NEEDS-VERIFICATION:TRUE)
lintRule(rule) -> true | throws SafeRuleError
pruneSeenStore(store, {keep, maxIds}) -> { ids, updatedAt, count }
```

## Deterministic vs LLM-assisted

**Deterministic:** filtering, diffing, escalation, rendering, RECAP
normalization. No clock reads in the core. **LLM-assisted (optional,
outside core):** one-line summaries of dense minute entries, cross-case
clustering, alert drafting — prompt schema in [spec.md](spec.md).

## What's better than the closed counterpart

- Watchers, rules, and the seen-store are **your JSON** — exportable,
  diffable, no platform lock-in.
- Escalation rules are **auditable data**, not a hidden prompt — and every
  pattern is linted before touching untrusted filer text.
- **Deterministic deadline mapping** with the same safety semantics as the
  closed counterpart (confidence + needs-verification, never a silent
  default) — but pinned by tests and replay-identical, plus a
  calendar-ingestible iCal export.
- **Offline core** with the open-data path (CourtListener RECAP) documented
  as an explicit integration seam instead of a captive connector.

## Run / test

```
node --test core/        # 17 unit tests (node:test)
node examples/run.js     # regenerates examples/wall.md + output.json + deadlines.ics
open demo/index.html     # paste a feed, see the wall, export the deadline feed
```
