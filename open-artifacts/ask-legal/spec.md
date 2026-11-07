# ask-legal — open artifact spec

Open reimplementation of Anthropic's "Ask legal" artifact (catalog §2.3):
*"Answers routine questions, routes the rest to a lawyer."*

## What it does

Self-service front door for the business over a **local JSON knowledge base**
of approved guidance. Deterministically:

1. **Retrieve** — tag hits (×3) + question-title term overlap (×2) + answer
   term overlap, stopword-filtered. Zero-overlap questions retrieve nothing.
2. **Confidence gating** — high / medium / low, each decision carrying
   machine-readable **reasons**: score vs thresholds, ambiguity between
   runner-up entries, guidance freshness (anchored to caller-supplied `asOf`).
3. **Escalation** — low confidence escalates; the answer text is withheld
   (never guessed) and the question routes via a rules-as-data routing table.
4. **Audit log** — every question asked is recorded append-only with asker,
   matched KB ids, confidence level, and escalation route.

## IO contract

```js
import { answerQuestion, createAuditLog, exportAuditLog } from "./core/core.js";

const log = createAuditLog();
const result = answerQuestion(kb, question, { asOf, askedBy, thresholds, routing }, log);
// => { answered, answer, sourceId, confidence: { level, reasons[] }, escalate, route, auditId }
exportAuditLog(log); // JSON-lines string for persistence
```

- `kb`: `[{ id, question, answer, tags: string[], jurisdiction, updated, approvedBy }]`
- `thresholds` (rules-as-data, US-flavored defaults): `{ high: 9, medium: 5, freshnessDays: 365 }`
- `routing` (rules-as-data): `{ [tag]: team, default: "legal-intake" }`
- `asOf`: caller-supplied ISO anchor — no hidden clocks, reproducible runs.

## Deterministic vs LLM-assisted

| Layer | Who | Why |
|---|---|---|
| Retrieval, gating, escalation, routing, audit | **code** | auditable, reproducible, privilege-safe |
| Rephrasing a retrieved answer for the asker | optional LLM | surface only — see prompt schema |
| Writing/approving KB guidance | **lawyers** | the KB is the moat, humans own it |

### LLM prompt schema (answer-polish step, optional)

```json
{
  "task": "Restate the approved guidance below for the asker. Do not add legal content.",
  "inputs": { "approved_answer": "...", "source_id": "kb-001" },
  "rules": [
    "Every sentence must paraphrase the approved answer; no new obligations, deadlines, or exceptions.",
    "Append the source id verbatim.",
    "If the confidence level is 'medium', prefix 'Provisional guidance — confirm with Legal.'",
    "If escalate is true, output only the escalation notice. Never improvise an answer."
  ]
}
```

## What's better than the closed counterpart

- **Confidence gating with written reasons** — the closed artifact's
  answer/route decision is opaque; here each decision lists its evidence
  (matched tags/terms, thresholds, freshness math) and thresholds are
  configurable data.
- **Nothing is guessed** — no match or low confidence returns *no* answer
  text, only an escalation; the demo shows a stale-guidance downgrade and a
  hard escalation.
- **Full audit log by construction** — `answerQuestion` cannot answer without
  logging; the log is append-only JSONL, exportable as evidence of what the
  business was told and when.
- **Org-owned guidance base** — plain JSON (or Markdown + frontmatter the
  org controls); no vendor lock-in, works air-gapped.

## Privilege & deployment note

Keep deployment inside the org's controlled environment (see the Heppner
privilege discussion in the catalog S7): the audit log and guidance base
should sit with Legal, not a third party.
