# sell-side-qa-log — open artifact spec

Open reimplementation of Anthropic's "Sell-side Q&A log" artifact (catalog
§2.15): *"manage buyer questions during due diligence, draft and track
answers, and keep a clean log for disclosure."*

The closed artifact is a workflow tool. This core adds the pieces diligence
actually needs: **deterministic contradiction detection between answers** —
before an inconsistent statement reaches two different buyers — **source
links on every answer** (`citations`, the counterpart's signature feature,
as structured data that survives export), an **approve→send release gate as
code** with an audit trail, a **per-buyer projection function** (ethical
wall), **SLA aging** computed from dates rather than a clock, and a
**disclosure-readiness score** computed from the log itself, not from a vibe.

## What it does

1. **Q&A workflow state** — every item carries its answer history
   (`draft` / `sent` with dates); the core derives the canonical answer
   (latest `sent`), any pending draft (a draft newer than the canonical
   answer), and an item status: `open` → `draft` → `sent` → `draft-pending`
   (a new draft supersedes a sent answer and awaits re-send).
2. **Contradiction detection (deterministic heuristics, evidence quotes)** —
   pairwise, within a category (and optionally across categories), across
   items and buyers:
   - `number_conflict` — both answers state numbers in the same canonical
     unit and the value sets are disjoint → conflict. Numbers normalize to a
     canonical base, so `$3.5 million` and `$3,500,000` agree while
     `$2 million` vs `$3,500,000` conflicts (`usd`). Bare counts require a
     shared keyword anchor between evidence sentences. Every conflicting
     unit fires — not just the first. Evidence = the sentence containing
     each number.
   - `antonym_conflict` — one answer uses a term whose opposite appears in
     the other (`permitted`/`prohibited`, `material`/`immaterial`,
     `yes`/`no`, … rules-as-data pairs). Every matching pair fires. Evidence
     quotes are at least 3 words (a bare `"Yes."` falls back to the fuller
     sentence).
   - `settings.crossCategory` (default **off**) additionally compares items
     in different categories, but only when the two answers share a keyword
     — cross-category flags carry `crossCategory: true` and a
     `"catA × catB"` category label. Off by default to avoid false
     positives.
   - Pending drafts are compared against every canonical sent answer —
     catching inconsistencies *before* they are sent. Answers of the same
     item are never compared (revision is workflow, not contradiction).
   - Every conflict carries `evidence`: verbatim quotes + item ids. These
     are heuristics for attorney review, not legal conclusions.
3. **Citations + release gate** — answers may carry
   `citations: [{ docId, locator, quote }]` (data-room source links that
   survive CSV/JSON/report export). `transition(item, event)` is the
   approve→send gate as code: `{ type: "approve", approver, at }` records
   the approval audit trail (`approvedBy`/`approvedAt` on the draft);
   `{ type: "send" }` refuses to send an unapproved draft (throws) and
   returns a new item — the input is never mutated.
   `releaseBlockers(item, contradictions)` lists everything blocking
   release: an unapproved draft, plus every detected contradiction
   involving the item. Unapproved sends are impossible to miss because the
   gate is a function, not a convention.
4. **Disclosure-readiness score** — weighted, configurable (rules-as-data):
   coverage (sent answers, ×0.4) + pipeline (no open items, ×0.15) +
   consistency (no contradicted items, ×0.25) + provenance (sent answers
   carrying ≥1 citation, ×0.2). Bands: `< 60` not ready, `< 85` nearly
   ready, `≥ 85` ready.
5. **SLA aging** — each item may carry `receivedAt`; with
   `settings.asOf`, the core derives `daysOpen` (date math only — no wall
   clock, output stays byte-identical) and an SLA band per
   `settings.sla` (default warn 3d / breach 5d → `on-track` / `due-soon` /
   `overdue`). The summary and report carry the overdue count.
6. **Buyer wall as a function** — `buyerView(log, buyerId)` projects a
   built log to a single buyer: only that buyer's items appear and
   contradictions involving any other buyer's items are dropped entirely —
   cross-buyer evidence never leaves the wall. Summary and readiness are
   recomputed from the projected view; the result feeds `qaLogToCsv` /
   `qaLogToJson` directly.
7. **CSV export** — the whole log (status, current answer, citations,
   aging, contradiction flags) with anchors preserved; plus stable JSON.

## IO contract

```js
import { buildQaLog, qaLogToCsv, qaLogToJson, buyerView,
         transition, releaseBlockers, itemAging } from "./core/core.js";

const log = buildQaLog(input);
//   => { deal, summary, aging, items[], contradictions[], readiness }
qaLogToCsv(log); qaLogToJson(log);
const view = buyerView(log, "B1");          // buyer-safe projection
const next = transition(item, { type: "approve", approver, at });
const sent = transition(next, { type: "send" }); // throws if unapproved
releaseBlockers(item, contradictions);       // [{ code, detail }]
itemAging(item, settings);                   // { daysOpen, sla }
```

- item: `{ id, buyerId, category, question, receivedAt?, answers: [{
  text, status: "draft"|"sent", at: "YYYY-MM-DD", citations?: [{ docId,
  locator, quote }], approvedBy?, approvedAt? }] }`
- settings (rules-as-data, overridable): `{ antonymPairs?, units?,
  crossCategory?, asOf?, sla?: { warnDays, breachDays },
  weights?: { coverage, pipeline, consistency, provenance }, bands? }`.

No timestamps, no randomness, no network: same input → byte-identical
output. Empty logs, duplicate ids, and malformed items are handled
deterministically (covered by tests).

## Deterministic vs LLM-assisted

| Layer | Who |
|---|---|
| Workflow state, release gate, contradiction heuristics, aging, readiness score, exports | **code** |
| Drafting answers from the data room | optional LLM (drafting, human-approved) |
| Deciding whether a flagged conflict is a true inconsistency | **attorney** (core quotes evidence) |
| Approving a draft for release | **named approver** (recorded via `transition`) |
| Antonym vocabulary, unit list, SLA bands, score weights | **deal team** (rules-as-data) |

### LLM prompt schema (drafting step, optional)

```json
{
  "task": "Draft an answer to the buyer question from the provided data-room excerpts.",
  "output_schema": { "text": "…", "status": "draft", "citations": [{ "docId": "…", "locator": "…", "quote": "…" }] },
  "rules": ["Every number must come from an excerpt — never computed or recalled.", "Every fact must carry a citation into the data room; the readiness score counts them.", "If the excerpts do not answer the question, say so; do not speculate.", "The draft is sent only after human approval (status stays 'draft' until transition(item, { type: 'send' }))."]
}
```

## What's better than the closed counterpart

- **Contradiction detection as a first-class deterministic output.** The
  closed artifact tracks answers; this core cross-examines them — numbers
  by canonical unit/magnitude, terms by antonym pairs — and quotes the
  evidence for every flag. The counterpart has none.
- **Source links that survive export.** The closed artifact links every
  output to its source inside its product; here citations are structured
  data on the answer (`docId`/`locator`/`quote`) that flow through CSV,
  JSON, and the report — and feed the readiness score's provenance
  component.
- **Drafts checked before sending.** A pending draft is compared against
  everything already sent while it is still editable.
- **Release gate as code.** Status management "to release" is an
  opaque workflow in the counterpart; here approve→send is a testable
  function with a named-approver audit trail, and release blockers
  (unapproved, contradicted) are computed, not remembered.
- **Readiness score you can audit** — the formula, weights, and bands are
  rules-as-data, not a proprietary black box.
- **Ethical wall as a function.** `buyerView(log, buyerId)` is a buyer-safe
  projection with cross-buyer evidence redacted — sharing between teams is
  a projection you control, not a vendor setting.
- **Aging, not just status.** `daysOpen` and SLA bands come from dates in
  the log; the overdue count is deterministic output.

## Disclaimer
Conflict heuristics are conservative keyword/number checks with US-deal
defaults; they flag for human review and never decide disclosure. All
example data fictional. Not legal advice.
