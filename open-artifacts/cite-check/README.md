# cite-check (open legal artifact)

Deterministic quote verification for legal documents: compares every quoted
passage in a brief/memo against its cited sources and classifies it as
**exact / normalized / fuzzy / not_found**, with a similarity score, a located
verbatim anchor (source + page/§/¶ + char offsets), a machine-checkable token
diff, and pinpoint citation validation (`p. 12`, `pp. 12-13`, `at 123`, `§ 5.2`,
`¶ 8`, `Tr. 12:4-12:8`, `§§ 5-6`, `id. at 123`, `n. 12`). Wrong page cites and
missing sources are flagged. Deterministic guards catch altered digits (the
number guard caps them at fuzzy), silently dropped tokens (omission notes,
with explicit ellipses accepted), inserted words, and flipped negations
("not"/"never" inserted or dropped caps the class at fuzzy with a note) — a
meaning-flipping edit never passes as verbatim-verified. See [spec.md](spec.md) for the full IO
contract, the document-side extractor, and the LLM-part prompt schema /
proposition harness. Fictional worked example in [examples/](examples/) —
10 quotes from a fictional appeal yield 5 exact, 1 normalized, 2 fuzzy,
2 not_found and 2 pinpoint mismatches.

## Layout

- `core/` — dependency-free TypeScript, no LLM: `textutil.ts` (token-span
  matcher + number guard), `diff.ts` (LCS token diff), `pinpoint.ts` (citation
  parser), `extract.ts` (document-side quote/footnote extractor),
  `citecheck.ts` (engine + report), `propositions.ts` (LLM prompt-builder +
  verdict gate), `core.js` (plain-JS port for the demo, kept at parity by
  `parity.test.ts`), tests alongside.
- `examples/` — `input.json` (fictional brief + depo/MSA/declaration sources),
  `run.ts`, generated `output.json` + `report.md`.
- `demo/` — standalone HTML demo importing `../core/core.js`.

## Run

```bash
npx tsx --test core/*.test.ts    # 38 tests
npx tsx examples/run.ts          # regenerates examples/output.json + report.md
```
