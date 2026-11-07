# sell-side-qa-log — open artifact spec

Open reimplementation of Anthropic's "Sell-side Q&A log" artifact (catalog
§2.15): *"manage buyer questions during due diligence, draft and track
answers, and keep a clean log for disclosure."*

The closed artifact is a workflow tool. This core adds the piece diligence
actually needs: **deterministic contradiction detection between answers** —
before a inconsistent statement reaches two different buyers — plus a
disclosure-readiness score computed from the log itself, not from a vibe.

## What it does

1. **Q&A workflow state** — every item carries its answer history
   (`draft` / `sent` with dates); the core derives the canonical answer
   (latest `sent`), any pending draft (a draft newer than the canonical
   answer), and an item status: `open` → `draft` → `sent` → `draft-pending`
   (a new draft supersedes a sent answer and awaits re-send).
2. **Contradiction detection (deterministic heuristics, evidence quotes)** —
   pairwise, within a category, across items and buyers:
   - `number_conflict` — both answers state numbers in the same unit
     (`%`, `$`, `million`, `days`, … or bare counts anchored to a shared
     keyword) and the value sets are disjoint → conflict. Evidence = the
     sentence containing each number.
   - `antonym_conflict` — one answer uses a term whose opposite appears in
     the other (`permitted`/`prohibited`, `material`/`immaterial`,
     `yes`/`no`, … rules-as-data pairs). Evidence = the matched sentences.
   - Pending drafts are compared against every canonical sent answer in the
     category — catching inconsistencies *before* they are sent.
   - Every conflict carries `evidence`: verbatim quotes + item ids. These are
   heuristics for attorney review, not legal conclusions.
3. **Disclosure-readiness score** — weighted, configurable (rules-as-data):
   coverage (sent answers, 0.5) + pipeline (no open items, 0.2) +
   consistency (no contradicted items, 0.3). Bands: `< 60` not ready,
   `< 85` nearly ready, `≥ 85` ready.
4. **CSV export** — the whole log (status, current answer, contradiction
   flags) with anchors preserved; plus stable JSON.

## IO contract

```js
import { buildQaLog, qaLogToCsv, qaLogToJson } from "./core/core.js";

const log = buildQaLog(input);
//   => { deal, summary, items[], contradictions[], readiness }
qaLogToCsv(log); qaLogToJson(log);
```

- item: `{ id, buyerId, category, question, answers: [{ text, status:
  "draft"|"sent", at: "YYYY-MM-DD" }] }`
- settings (rules-as-data, overridable): `{ antonymPairs?, units?,
  readinessWeights?, readinessBands? }`.

No timestamps, no randomness, no network: same input → byte-identical output.

## Deterministic vs LLM-assisted

| Layer | Who |
|---|---|
| Workflow state, contradiction heuristics, readiness score, exports | **code** |
| Drafting answers from the data room | optional LLM (drafting, human-approved) |
| Deciding whether a flagged conflict is a true inconsistency | **attorney** (core quotes evidence) |
| Antonym vocabulary, unit list, score weights | **deal team** (rules-as-data) |

### LLM prompt schema (drafting step, optional)

```json
{
  "task": "Draft an answer to the buyer question from the provided data-room excerpts.",
  "output_schema": { "text": "…", "status": "draft", "citations": ["document id + pinpoint per fact"] },
  "rules": ["Every number must come from an excerpt — never computed or recalled.", "If the excerpts do not answer the question, say so; do not speculate.", "The draft is sent only after human approval (status stays 'draft')."]
}
```

## What's better than the closed counterpart

- **Contradiction detection as a first-class deterministic output.** The
  closed artifact tracks answers; this core cross-examines them — numbers by
  unit, terms by antonym pairs — and quotes the evidence for every flag.
- **Drafts checked before sending.** A pending draft is compared against
  everything already sent in its category, so an inconsistency is caught
  while it is still editable.
- **Readiness score you can audit** — the formula, weights, and bands are
  rules-as-data, not a proprietary black box.
- **Buyer-isolated by construction** — the log is plain JSON you host; export
  per-buyer views by filtering `buyerId` (no vendor access control needed).

## Disclaimer

Conflict heuristics are conservative keyword/number checks with US-deal
defaults; they flag for human review and never decide disclosure. All example
data fictional. Not legal advice.
