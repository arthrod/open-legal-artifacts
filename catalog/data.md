# Catalog: data & datasets

Data assets related to this repo's artifacts. Each already has a better home —
**link, don't fork**.

## live-contracts

SEC EX-10 exhibits converted to Markdown: a search site, a 4-tool MCP server,
and a Hugging Face Parquet dataset. 15,360 exhibits as of 2026-10-02. Rust
producer on Cloudflare Workers/D1.

- Code: <https://github.com/jandira-tech/live-contracts>
- Site: <https://live-contracts.arthur.law/>
- Dataset: <https://huggingface.co/datasets/arthrod/sec-ex10-exhibits>

## amd_pii_generator

Synthetic realistic pt-BR PII generator for privacy testing — the data source
behind the PII work in [`artifacts/pii-ptbr-lgpd/`](../artifacts/pii-ptbr-lgpd/README.md).

- Code: <https://github.com/arthrod/amd_pii_generator>

## Hugging Face datasets & models (first-party)

- `arthrod/gliner-opf-ptbr-pii-bench-v1` — pt-BR PII detection benchmark
  dataset: <https://huggingface.co/datasets/arthrod/gliner-opf-ptbr-pii-bench-v1>
- `arthrod/gliner-opf-ptbr-pii-v1` — fine-tuned model:
  <https://huggingface.co/arthrod/gliner-opf-ptbr-pii-v1>
- Demos: [gliner-ptbr-pii-demo](https://huggingface.co/spaces/arthrod/gliner-ptbr-pii-demo) ·
  [gliner-opf-ptbr-pii-demo](https://huggingface.co/spaces/arthrod/gliner-opf-ptbr-pii-demo)

Model cards, metrics, and de-PII usage guidance live in
[`artifacts/pii-ptbr-lgpd/README.md`](../artifacts/pii-ptbr-lgpd/README.md).
