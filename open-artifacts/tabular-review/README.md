# tabular-review (open legal artifact)

Documents × questions review matrix with cell-level source anchors: a cell is
`answered` only when its quote verifiably locates in the document (exact /
normalized / fuzzy-with-flag, with char span + pinpoint); everything else
ships as `UNVERIFIED` with a machine reason (`not_answered`,
`missing_quote`, `quote_not_verified`, `no_such_document`) — never guessed.
Exports to RFC-4180 CSV and Markdown with anchors preserved. Full IO contract
and LLM prompt schema in [spec.md](spec.md).

Fictional worked example in [examples/](examples/): 3 fictional agreements ×
5 questions → 13 answered cells (each with a verified anchor) and 2 unverified
cells, including one deliberately hallucinated quote that the core rejects.

## Layout

- `core/` — dependency-free TypeScript, no LLM: `matrix.ts` (verifier,
  matrix builder, CSV/Markdown exporters), `textutil.ts` (token-span
  matcher), `matrix.test.ts`.
- `examples/` — `input.json`, `run.ts`, generated `output.json` +
  `matrix.csv` + `matrix.md`.

## Run

```bash
npx tsx --test core/matrix.test.ts   # 11 tests
npx tsx examples/run.ts              # regenerates examples/output.json, matrix.csv, matrix.md
```
