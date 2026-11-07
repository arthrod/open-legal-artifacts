# ask-legal

Open reimplementation of Anthropic's **Ask legal** artifact — *"answers
routine questions, routes the rest to a lawyer"* — with confidence gating,
escalation that never guesses, and a full audit log.

## What it does

- **Retrieval by topic tags** + term overlap over a local JSON knowledge base
  of approved guidance (deterministic, no embeddings required).
- **Per-answer confidence gating** — high / medium / low, each with written
  reasons: match evidence, threshold comparison, ambiguity between entries,
  guidance freshness.
- **Escalation on low confidence** — answer text is withheld, question routed
  via a rules-as-data routing table (topic → team).
- **Full audit log** — every question recorded append-only (JSONL export);
  `answerQuestion` cannot answer without logging.

## Run

```bash
node --test            # 11 tests (node:test)
node examples/run.js   # answers 5 fictional questions, writes answers.json + audit-log.jsonl + report.md
```

Open `demo/index.html` for the interactive demo (prefilled worked example).

## What's better than the closed counterpart

1. **Confidence with receipts.** Every answer shows its level *and* the
   reasons: which entry matched, which tags/terms hit, how freshness was
   computed. Thresholds are configurable rules-as-data, not hidden.
2. **Nothing guessed.** No match → no answer, escalation only. The example
   includes a stale-guidance downgrade (high → medium) and a hard escalation.
3. **Audit by construction.** The closed artifact offers "visibility for
   Legal" as a feature; here the log is structural and exportable.
4. **Org-owned guidance.** Plain JSON/Markdown knowledge base you control —
   air-gap friendly, no connector required.

## Layout

- `spec.md` — IO contract, LLM prompt schema (answer-polish only), gating rules
- `core/core.js` — dependency-free ES module (browser + Node)
- `core/core.test.js` — node:test suite
- `examples/` — fictional worked example + runner + outputs
- `demo/index.html` — standalone demo using the shared design tokens

## Disclaimer

All example data fictional. Guidance content must be authored and approved by
the organization's own legal team. Not legal advice.
