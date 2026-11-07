# jurisdiction-survey-matrix — open artifact spec

Open reimplementation of Anthropic's "Jurisdiction survey matrix" artifact
(catalog §2.4): *"compares a legal topic, such as data breach notice rules,
across states or countries in one table, with links to the underlying law."*

The catalog flags this artifact family as the **highest hallucination risk of
the set** — per-jurisdiction statutory lookup is exactly where a generative
system invents plausible citations. This core is built around the opposite
contract: **cite-before-claim; unverifiable cells render as UNVERIFIED rather
than guessed.**

## What it does

- Builds a **jurisdictions × legal-questions matrix** from a survey input
  (JSON: topic, jurisdiction list, question list, researched cells).
- Every populated cell must carry `answer` + `citation` + parseable
  `verifiedDate`; a cell missing any of these is **unverified** and its
  content is not surfaced at all.
- **Staleness flagging** — cells verified more than `policy.maxAgeDays`
  (default 180, rules-as-data) before `asOf` are flagged stale; the answer
  stays visible with a re-verification warning.
- **Coverage stats** (verified/stale/unverified/pct) at the top of every export.
- **Export CSV and Markdown**, with UNVERIFIED cells explicit in both.

## IO contract

```js
import { buildMatrix, toCsv, toMarkdown } from "./core/core.js";

const matrix = buildMatrix(survey, asOfIso);
// matrix.grid[jurisdictionIndex][questionIndex] =
//   { status: "verified"|"stale"|"unverified", reason, ageDays, answer?, citation?, verifiedDate?, verifiedBy? }
toCsv(matrix); toMarkdown(matrix);
```

- `survey`: `{ topic, jurisdictions: string[], questions: [{id, text}], cells: [...], policy?: { maxAgeDays } }`
- cells are keyed `jurisdiction` × `question(id)` (case-insensitive).
- `asOf`: ISO anchor — no hidden clocks.

## Deterministic vs LLM-assisted

| Layer | Who |
|---|---|
| Matrix assembly, validation, staleness, coverage, export | **code** |
| Drafting cell research (finding the statute + quote) | optional LLM — but its output enters the matrix as **unverified** until a human records citation + verification date |
| Deciding when a cell is trustworthy | **human lawyer** (verifiedBy) |

### LLM prompt schema (research-draft step, optional)

```json
{
  "task": "Research draft for one matrix cell. Output is UNVERIFIED until reviewed.",
  "inputs": { "jurisdiction": "US-TX", "question": "Deadline to notify individuals after a breach?" },
  "output_schema": { "answer": "…", "citation": "statute/reg cite + pinpoint", "quotedText": "verbatim span from the source", "sourceUrl": "…" },
  "rules": [
    "Quote verbatim text from an authoritative source; never paraphrase into a citation.",
    "If you cannot locate an authoritative source, return { \"answer\": \"\", \"citation\": \"\" } — silence is correct output.",
    "Never estimate dates, thresholds, or penalties."
  ]
}
```

## What's better than the closed counterpart

- **Unverified ≠ guessed, structurally.** The closed artifact links cells to
  sources, but nothing forces the link to exist before the claim renders.
  Here the cell validator is the render path: no citation + date → no answer.
- **Verification dates + staleness policy** — law changes; a survey without
  dates goes quietly rotten. Coverage stats make the rot visible at a glance.
- **Human-verified-by field** — each cell records who verified it.
- **Deterministic exports** (CSV/MD) that keep UNVERIFIED explicit, so the
  gaps survive round-trips into memos and diligence trackers.

## Disclaimer

The re-verification window and question set are configurable rules-as-data
with sensible US defaults. All example data is fictional. Not legal advice.
