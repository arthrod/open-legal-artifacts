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
- Every populated cell must carry `answer` + `citation` + a `sourceUrl` linking
  the underlying law + parseable `verifiedDate`; a cell missing any of these is
  **unverified** and its content is not surfaced at all. The URL requirement is
  `policy.requireSourceUrl` (default `true`) — the counterpart's "links to the
  underlying law" is a render precondition here, not decoration.
- Optional `quotedText` (verbatim span from the source) enables a
  **figure-consistency check**: digits asserted in the answer that do not
  appear in the quote raise a warning-only flag (`figures not in quoted
  source: …`). The flag never hides the answer — it prompts re-checking.
- **Staleness flagging** — cells verified more than `policy.maxAgeDays`
  (default 180, rules-as-data) before `asOf` are flagged stale; the answer
  stays visible with a re-verification warning.
- **Coverage stats** (verified/stale/unverified/pct) at the top of every export,
  with per-jurisdiction and per-question breakdowns.
- **Input integrity** — `buildMatrix` returns `warnings[]`: duplicate cells
  (last one wins, but the drop is reported), orphan cells (unknown jurisdiction
  or question id, excluded but reported), and empty jurisdiction/question lists.
  Nothing is dropped silently.
- **Export CSV and Markdown**, with UNVERIFIED cells explicit in both and
  citations rendered as Markdown links to `sourceUrl`.
- **Re-verification worklist** — `toWorklist(matrix)` / `worklistToMarkdown(matrix)`
  turn stale + unverified cells into a prioritized queue (stale first).

## IO contract

```js
import { buildMatrix, toCsv, toMarkdown, toWorklist, worklistToMarkdown } from "./core/core.js";

const matrix = buildMatrix(survey, asOfIso);
// matrix.grid[jurisdictionIndex][questionIndex] =
//   { status: "verified"|"stale"|"unverified", reason, ageDays, answer?, citation?,
//     sourceUrl?, quotedText?, verifiedDate?, verifiedBy?, warnings?: string[] }
// matrix.warnings = string[]        // input-integrity warnings (duplicates, orphans, empty lists)
// matrix.coverage.byJurisdiction / byQuestion = { total, verified, stale, unverified }
toCsv(matrix); toMarkdown(matrix);
toWorklist(matrix); worklistToMarkdown(matrix);
```

- `survey`: `{ topic, jurisdictions: string[], questions: [{id, text}], cells: [...], policy?: { maxAgeDays, requireSourceUrl } }`
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
  Here the cell validator is the render path: no citation + URL + date →
  no answer.
- **Figure-consistency against the quoted source** — transcribed numbers are
  this artifact family's #1 hallucination vector; digits in an answer that the
  verbatim quote does not contain are flagged.
- **Verification dates + staleness policy** — law changes; a survey without
  dates goes quietly rotten. Coverage stats make the rot visible at a glance.
- **Human-verified-by field** — each cell records who verified it.
- **Deterministic exports** (CSV/MD) that keep UNVERIFIED explicit, so the
  gaps survive round-trips into memos and diligence trackers.

## Disclaimer

The re-verification window and question set are configurable rules-as-data
with sensible US defaults. All example data is fictional. Not legal advice.
