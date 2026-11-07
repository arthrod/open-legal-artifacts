# fact-chronology (open legal artifact)

Builds a dated fact chronology from structured fact entries: sorted timeline
(day/month/year precision), a source anchor (document + verbatim quote +
pinpoint) on every entry, conflict flags where sources disagree
(`date_mismatch`, `divergent_accounts` — potential conflicts for attorney
review), and gap detection between dated entries. Unparseable dates like
"Spring 2024" are surfaced, never guessed. Full IO contract and LLM
extraction prompt in [spec.md](spec.md).

Fictional worked example in [examples/](examples/): *Delgado v. Summit Ridge
Hospitality* — 10 facts from 5 documents → 8 dated, 2 conflicts (a
warning-that-never-happened impeachment flag and a termination-date
discrepancy), 1 gap (1,734 days), 2 undated entries.

## Layout

- `core/` — dependency-free TypeScript, no LLM: `chronology.ts` (engine +
  renderer), `textutil.ts` (token similarity), `chronology.test.ts`.
- `examples/` — `input.json`, `run.ts`, generated `output.json` +
  `chronology.md`.

## Run

```bash
npx tsx --test core/chronology.test.ts   # 11 tests
npx tsx examples/run.ts                  # regenerates examples/output.json + chronology.md
```
