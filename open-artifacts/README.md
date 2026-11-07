# open-legal-artifacts (phase 1)

Open, LLM-free-core reimplementations of four Anthropic "Claude for Legal"
artifacts (plan step S7; specs from `tmp/anthropic-legal-artifacts-catalog.md`
§2.1, §2.5, §2.6, §2.10). Each artifact directory contains:

- `spec.md` — IO contract + prompt schema for the LLM part
- `core/` — deterministic, dependency-free TypeScript (runs without an LLM),
  with `node:test` suites executed via `npx tsx --test`
- `examples/` — realistic fictional worked example: input + `run.ts` +
  generated outputs (JSON + Markdown/CSV)
- `README.md`

| Artifact | What the core does deterministically | Tests |
|---|---|---|
| [cite-check](cite-check/) | exact/normalized/fuzzy/not_found quote classification, similarity + verbatim anchor, `p./§/¶/at` pinpoint parsing + validation, report | 12 |
| [playbook-deviation-board](playbook-deviation-board/) | compliant/deviates/deal-breaker/unclassified with matched fallback tier, quoted clause span, YAML-subset or JSON playbooks, approver routing, numeric guard | 12 |
| [fact-chronology](fact-chronology/) | dated timeline with per-fact source anchors, conflict flags (date_mismatch, divergent_accounts), gap detection, unparseable dates surfaced not guessed | 11 |
| [tabular-review](tabular-review/) | documents × questions matrix, cell anchors verified against document text, UNVERIFIED cells never guessed, CSV + Markdown export | 11 |

Shared design: the LLM only extracts/structures inputs (its prompt schemas are
in each spec); matching, anchoring, classification, routing, and exporting are
pure code and byte-for-byte reproducible.

## Run everything

```bash
for a in cite-check playbook-deviation-board fact-chronology tabular-review; do
  (cd $a && npx tsx --test core/*.test.ts && npx tsx examples/run.ts)
done
```

46 tests total (12+12+11+11), all green at build time (npx tsx 4.23.x, node
v24). Fictional legal data throughout — no real parties, matters, or quotes.
