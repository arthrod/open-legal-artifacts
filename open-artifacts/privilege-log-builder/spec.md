# privilege-log-builder — specification

**Original idea** (no Anthropic-gallery counterpart): a document set in,
a draft privilege log out. The core infers privilege types from document
**metadata only** (author/recipient roles, document type, anticipation
flag), assembles FRE 26(b)(5)-style log entries, groups near-duplicates,
flags incomplete entries, and exports a court-ready Markdown log + CSV.

## Design split: deterministic core vs. LLM

| Capability | Owner |
|---|---|
| Attorney-client inference (counsel↔client pattern, third-party break) | core (deterministic heuristics, rules-as-data) |
| Work-product inference (counsel author + anticipation flag / doc type) | core (deterministic heuristics) |
| FRE 26(b)(5)-style entry assembly + draft description from metadata | core (deterministic) |
| Near-duplicate detection (identical signature + same-author subject Jaccard ≥ threshold) | core (deterministic) |
| Incomplete-entry flags (missing date / role / recipients / type) | core (deterministic) |
| Markdown + CSV court-log export | core (deterministic) |
| Reading privilege in the document **content**; final privilege calls | attorney (out of core) |
| Extracting the metadata from emails/files | LLM or ETL (out of core) |

Every inferred entry carries `confidence: "metadata_heuristic"` — the tool
never asserts privilege on its own authority; that judgment stays with the
lawyer who reviewed the document.

## Input contract (`LogInput`, JSON)

```jsonc
{
  "matter": "Kestrel Bio Fuels v. Kestrel Dynamics, Inc. (fictional)",
  "documents": [
    { "id": "KV-0001", "date": "2026-02-03", "docType": "email",
      "author": { "name": "A. Moreno", "role": "attorney" },
      "recipients": [{ "name": "J. Vale", "role": "client" }],
      "subject": "Initial case assessment" },
    { "id": "KV-0007", "docType": "memo", "author": { "name": "A. Moreno", "role": "attorney" },
      "recipients": [], "anticipationOfLitigation": true, "subject": "Research memo: …" }
    // roles drive inference: attorney/paralegal, client/corporate_officer,
    // third_party/vendor/opposing_counsel/expert — editable in INFERENCE_RULES
  ]
}
```

## Output contract

Per entry (`buildEntry`): `logNumber, docId, date, docType, author,
authorRole, recipients, cc, subject, description` (drafted from metadata),
`privilegeType` (`attorney_client` | `work_product` | `both` |
`none_inferred`), `basis[]` (rule text behind each inference),
`confidence: "metadata_heuristic"`, `reviewFlags[]`
(`third_party_present`, `no_privilege_signal`, `incomplete_entry`,
`near_duplicate`), `status` (`draft` | `incomplete`).

Plus: `nearDuplicates[]` groups, `summary` counts, and the attorney-review
disclaimer on every log. `renderLog(log)` → Markdown table;
`toCSV(log)` → CSV with FRE-style columns.

## Inference heuristics (rules-as-data)

`INFERENCE_RULES` holds role lists (counsel side / client side / third
party), work-product document types, and the near-duplicate threshold —
plain editable data with a version string that ships in every log.

## Prompt schema for the LLM part

The LLM only extracts metadata from raw documents:

```jsonc
{ "documents": [ { "id": "KV-0001", "date": "2026-02-03", "docType": "email",
                   "author": { "name": "A. Moreno", "role": "attorney" },
                   "recipients": [ { "name": "J. Vale", "role": "client" } ],
                   "subject": "Initial case assessment",
                   "anticipationOfLitigation": true } ],
  "uncertain": [ { "docId": "KV-0014", "field": "role",
                   "candidates": ["third_party", "expert"],
                   "reason": "recipient is a consultant; engagement unknown" } ] }
```

Uncertain roles land in `uncertain`, and those documents get
`incomplete_entry`-style review flags rather than a guessed inference.

## Why an OPEN version (no closed counterpart exists)

No Claude-for-Legal artifact builds privilege logs from scratch; in the
catalog's own analysis (§2.11) a privilege log is a *dependency* of the
discovery-response artifact that the closed gallery leaves unsolved. An
open version matters here because:

1. **Auditability of inferences** — every privilege guess in e-discovery
   is a representation to the court; heuristics must be inspectable data
   with the reasoning echoed per entry.
2. **Never asserts privilege** — inference is tagged a heuristic and
   routed to attorney review; the failure mode of a closed tool quietly
   logging a non-privileged document is expensive (waiver) and the
   opposite error is sanctions bait.
3. **Near-duplicate grouping** cuts the review burden deterministically
   before any lawyer touches the set.
4. **Court-ready exports** (MD + CSV) from pure code, reproducible
   byte-for-byte.
