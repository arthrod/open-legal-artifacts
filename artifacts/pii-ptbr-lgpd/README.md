# PII detection, pt-BR / LGPD

Part of [open-legal-artifacts](../../README.md). Portuguese-language (pt-BR)
personally identifiable information (PII) detection tuned for Brazilian data
(LGPD context): two fine-tuned detectors, a benchmark dataset, and live demos on
Hugging Face.

The training/eval pipeline behind these models is not part of this snapshot —
this artifact ships as model cards, benchmark metrics, and usage guidance.
(Synthetic training data comes from
[amd_pii_generator](https://github.com/arthrod/amd_pii_generator) — link, don't
fork.)

## Models & demos

| What | Link |
|---|---|
| GLiNER fine-tune demo (pt-BR PII) | <https://huggingface.co/spaces/arthrod/gliner-ptbr-pii-demo> |
| OpenAI Privacy Filter fine-tune demo | <https://huggingface.co/spaces/arthrod/gliner-opf-ptbr-pii-demo> |
| Model: `arthrod/gliner-opf-ptbr-pii-v1` (OPF fine-tune) | <https://huggingface.co/arthrod/gliner-opf-ptbr-pii-v1> |
| Benchmark dataset: `arthrod/gliner-opf-ptbr-pii-bench-v1` | <https://huggingface.co/datasets/arthrod/gliner-opf-ptbr-pii-bench-v1> |

## Benchmark results

On the benchmark dataset (`gliner-opf-ptbr-pii-bench-v1`):

| Metric | GLiNER pt-BR fine-tune | OPF fine-tune (`gliner-opf-ptbr-pii-v1`) |
|---|---|---|
| Partial F1 (PII-bearing messages) | 0.888 | **0.897** |
| False positives across 2,419 no-PII messages | 8,666 | **64** |

Read: comparable recall-oriented quality on messages that do contain PII, but a
**~135× reduction in false positives** on clean messages. That asymmetry is the
point — for de-PII workflows, a noisy detector means endless manual review, and
a quiet one means leaks; the OPF fine-tune is the deployable end of that trade.

## De-PII usage guidance

1. **Detect, then let a human decide.** These models flag spans; they do not
   redact. Route flagged spans through a review step (the same
   confirm-before-save pattern used by [client-intake](../client-intake/README.md)
   and [contracts-playbook](../contracts-playbook/README.md)).
2. **Fail toward recall on inbound, precision on outbound.** Screening inbound
   client text: prefer the GLiNER fine-tune (fewer misses). Cleaning outbound
   text (de-PII before storage/model calls): prefer the OPF fine-tune (64 FPs
   on 2,419 clean messages ≈ review fatigue ≈ 2.6% of messages).
3. **LGPD is not only detection.** PII found still needs a lawful basis,
   retention policy, and deletion path (LGPD arts. 6–7, 15–18). Detection is
   the plumbing, not the compliance program.
4. **Test on your own data.** The benchmark is Brazilian-administrative text;
   your domain (contracts, e-discovery, chat) shifts the numbers. Re-run with
   `amd_pii_generator` synthetic data shaped like yours before trusting a
   threshold.

## Status

Models, dataset, and demos are live on Hugging Face (first-party). Training and
evaluation scripts are **not yet open-sourced** — tracked as a to-do for this
artifact; until then, treat this directory as the model-card entry point.
