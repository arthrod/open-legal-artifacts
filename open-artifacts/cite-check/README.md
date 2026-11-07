# cite-check (open legal artifact)

Deterministic quote verification for legal documents: compares every quoted
passage in a brief/memo against its cited sources and classifies it as
**exact / normalized / fuzzy / not_found**, with a similarity score, a located
verbatim anchor (source + page/§/¶ + char offsets), and pinpoint citation
validation (`p. 12`, `pp. 12-13`, `at 123`, `§ 5.2`, `¶ 8`). Wrong page cites
and missing sources are flagged. See [spec.md](spec.md) for the full IO
contract and the LLM-part prompt schema. Fictional worked example in
[examples/](examples/) — 9 quotes from a fictional appeal yield 5 exact,
1 normalized, 1 fuzzy, 2 not_found and 2 pinpoint mismatches.

## Layout

- `core/` — dependency-free TypeScript, no LLM: `textutil.ts` (token-span
  matcher), `pinpoint.ts` (citation parser), `citecheck.ts` (engine + report),
  `citecheck.test.ts`.
- `examples/` — `input.json` (fictional brief + depo/MSA/declaration sources),
  `run.ts`, generated `output.json` + `report.md`.

## Run

```bash
npx tsx --test core/citecheck.test.ts   # 12 tests
npx tsx examples/run.ts                 # regenerates examples/output.json + report.md
```
