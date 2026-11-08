# tabular-review (open legal artifact)

Documents × questions review matrix with cell-level source anchors: a cell is
`answered` only when its quote verifiably locates in the document (exact /
normalized / fuzzy-with-flag, with char span + pinpoint) **and** — on typed
questions — satisfies the question's machine-checked schema. Everything else
ships as `UNVERIFIED` with a machine reason (`not_answered`, `missing_quote`,
`quote_not_verified`, `no_such_document`, `no_such_question`,
`constraint_violation`, and the
three not-found states `not_present` / `unclear` / `needs_review`) — never
guessed. A deterministic consistency pass flags minority `classify` values in
a column as `outlier_value` (answer kept), `summary.columns[]` reports the
verification workload per question, and re-run diffs are first-class
(`diffMatrices`). Exports: RFC-4180 CSV (with an empty reviewer `Verified`
column), a per-cell sources audit CSV, and Markdown. Full IO contract and
LLM prompt schema in [spec.md](spec.md).

Typed question templates live in [templates/](templates/) — start with
`ma-diligence.json` (fictional M&A diligence set: duration / currency /
classify questions) or bring your own `Question[]`.

Fictional worked example in [examples/](examples/): 3 fictional agreements ×
5 questions → 13 answered cells (each with a verified anchor) and 2 unverified
cells, including one deliberately hallucinated quote that the core rejects.
`examples/diff.json` shows the re-run after that quote is corrected: exactly
one changed cell.

## Layout

- `core/` — dependency-free TypeScript, no LLM: `matrix.ts` (verifier,
  typed-schema enforcement, consistency pass, matrix builder, CSV / sources
  CSV / Markdown / diff exporters), `textutil.ts` (token-span matcher),
  `matrix.test.ts`; `core.js` is the generated browser/Node ES-module port
  (kept in sync by a parity test).
- `templates/` — typed question sets (`ma-diligence.json`).
- `examples/` — `input.json`, `run.ts`, generated `output.json` +
  `matrix.csv` + `matrix.md` + `diff.json`.
- `demo/` — single-file interactive demo (relative imports; template
  dropdown switches the same grid to the typed M&A diligence schema).

## Run

```bash
npx tsx --test core/*.test.ts   # 35 tests
npx tsx examples/run.ts         # regenerates examples/output.json, matrix.csv, matrix.md, diff.json
```

## Record note: csvEscape

An earlier wave-2 change log claimed a `csvEscape` "unclosed quote" bug fix.
That claim was inaccurate and is corrected here: `csvEscape`
(`core/matrix.ts`, mirrored in `core/core.js`) has doubled inner quotes and
wrapped fields containing commas/quotes/newlines per RFC-4180 since the
original commit — the wave-2 diff left its body byte-identical, and no fix
was needed or made. Behavior is pinned by the CSV export test block in
`core/matrix.test.ts`, including `csvEscape('say "hi"')` → `"say ""hi"""`.
