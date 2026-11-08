# ask-legal — open artifact spec

Open reimplementation of Anthropic's "Ask legal" artifact (catalog §2.3):
*"Answers routine questions, routes the rest to a lawyer."*

## What it does

Self-service front door for the business over a **local JSON knowledge base**
of approved guidance. Deterministically:

1. **Retrieve** — tag hits (×3) + question-title term overlap (×2) + answer
   term overlap, stopword-filtered. Tokens compare **plural-folded**
   ("vendors" ≡ "vendor") and queries expand across a **rules-as-data synonym
   map**; tag substring matching requires both sides ≥ 4 chars ("tips" cannot
   hit tag "ip"). Zero-overlap questions retrieve nothing.
2. **KB validation before serving** — `validateKb(kb)` flags entries missing an
   approver, answer text, unique id, or a parseable `updated` date;
   `answerQuestion` **refuses an invalid KB outright** — unapproved guidance is
   never served.
3. **Confidence gating** — high / medium / low, each decision carrying
   machine-readable **reasons**: score vs thresholds, ambiguity between
   runner-up entries, guidance freshness (anchored to caller-supplied `asOf`),
   and jurisdiction fit.
4. **Jurisdiction gating** — a mismatch between the asker's `jurisdiction`
   option and the matched entry's jurisdiction downgrades confidence one tier
   with a written receipt ("guidance covers US but question is under EU").
5. **Provisional labeling** — medium answers carry `provisional: true` and a
   label ("Provisional guidance — confirm with Legal."); low escalates with
   the answer text withheld (never guessed).
6. **Escalation with a drafted ask** — low confidence routes via a
   rules-as-data routing table; `escalationTicket(result, log)` drafts a
   deterministic intake ticket (route, question, asker, matched ids, reasons,
   closest KB entry) for the lawyer.
7. **Audit log** — every question asked is recorded append-only with asker,
   matched KB ids, confidence level, and escalation route; per-team routing
   SLAs (`{ team, slaDays }`) let `overdueEscalations(log, routing, asOf)`
   flag breaches.
8. **Correction loop** — `applyCorrection(kb, log, { auditId, answer, … })`
   records a lawyer's answer to an escalated question as a NEW
   `pending-approval` KB entry linked to the audit entry; it is unretrievable
   until `approveEntry` stamps an approver — lawyer feedback updates the
   guidance base, nothing self-serves.

## IO contract

```js
import { answerQuestion, createAuditLog, exportAuditLog, saveAudit, loadAudit, validateKb,
         escalationTicket, applyCorrection, approveEntry, overdueEscalations } from "./core/core.js";

validateKb(kb);            // [] — serve; non-empty — refuse (answerQuestion throws)
const log = createAuditLog();
const result = answerQuestion(kb, question, { asOf, askedBy, thresholds, routing, jurisdiction }, log);
// => { answered, answer, sourceId, confidence: { level, reasons[] }, escalate, route, auditId,
//      provisional, label, suggestedEntry }
const ticket = escalationTicket(result, log);   // deterministic draft for the lawyer
const { entry } = applyCorrection(kb, log, { auditId: result.auditId, answer, tags, updated });
approveEntry(kb, entry.id, "Approver (fictional)");  // pending → approved, now retrievable
overdueEscalations(log, routing, asOf);              // SLA breaches, no hidden clocks
exportAuditLog(log);                                 // JSON-lines string for persistence
const reloaded = loadAudit(saveAudit(log));           // durable round-trip: reload continues the log (and AUD numbering)
```

`loadAudit`/`saveAudit` are the persistence pair: `saveAudit(log)` validates
(unique non-empty `auditId`s, objects only) and emits the same JSONL bytes as
`exportAuditLog`; `loadAudit(jsonl)` parses it back with line-numbered refusal
of malformed or duplicate-id input — never silently repaired. Handing the
reloaded array back to `answerQuestion` appends after the last existing entry.

- `kb`: `[{ id, question, answer, tags: string[], jurisdiction, updated, approvedBy }]`
- `thresholds` (rules-as-data, US-flavored defaults): `{ high: 9, medium: 5, freshnessDays: 365 }`
- `routing` (rules-as-data): `{ [tag]: team | { team, slaDays }, default: "legal-intake" }`
- `jurisdiction` (optional): asker's jurisdiction — mismatch downgrades one tier
- `asOf`: caller-supplied ISO anchor — no hidden clocks, reproducible runs.
- KB entries with `status: "pending-approval"` are never retrieved or served
  and are exempt from validation (expected lifecycle state).

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
- **Org-owned guidance base with a correction loop** — lawyer answers to
  escalations re-enter the guidance base through explicit pending → approved
  states; the closed artifact's guidance is vendor-curated with no org-side
  correction path. Plain JSON (or Markdown + frontmatter the org controls);
  no vendor lock-in, works air-gapped.
- **Unapproved guidance cannot be served, by construction** — the KB is
  validated on every question; missing approver or staleness dates refuse the
  run rather than degrade silently.
- **Escalations arrive as drafted tickets, not team names** — deterministic
  intake drafts (asker, question, matched evidence, reasons, closest entry)
  plus per-team SLA breach tracking on the audit log.

## Privilege & deployment note

Keep deployment inside the org's controlled environment (see the Heppner
privilege discussion in the catalog S7): the audit log and guidance base
should sit with Legal, not a third party.
