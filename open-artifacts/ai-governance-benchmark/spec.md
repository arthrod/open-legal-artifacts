# ai-governance-benchmark — spec

Open counterpart of Goodwin's "AI governance benchmark" gallery artifact
(Claude for Legal partner gallery; catalog §3.2). Goodwin's moat is its
proprietary questionnaire; this version's rubric is entirely open data.

## What it does

Scores an organization's AI-governance assessment answers (JSON) against a
transparent, versioned rubric and returns:

- per-pillar maturity (inventory, risk management, vendor management,
  incident response, training) on a 0–3 scale with named maturity bands;
- a weighted overall score and band (weights are rules-as-data, editable);
- a gap list — every question at or below the gap threshold — each carrying
  the assessor's evidence, published-framework references, and a remediation
  stub;
- a Markdown benchmark report export.

## IO contract

```js
import { scoreAssessment, exportReportMd } from './core/core.js';

const result = scoreAssessment(assessment, config?);
// assessment: { org: object, answers: [{ questionId, level: 0|1|2|3, evidence?: string }] }
// config:     { pillarWeights?: {inventory: 0.2, ...} (must sum to 1),
//               gapThreshold?: number (default 1) }
const md = exportReportMd(result);
```

Errors (thrown, deterministic): unknown `questionId`; non-integer or
out-of-range `level`; pillar weights that do not sum to 1.

## Deterministic vs LLM-assisted

| Part | Owner |
|---|---|
| Question bank, pillar weights, framework refs, maturity bands | rules-as-data in `core/core.js` (versioned `RUBRIC_VERSION`) |
| Scoring, weighting, gap detection, band mapping, MD export | deterministic code |
| Collecting answers / drafting evidence prose | LLM-assisted (optional) |

### LLM prompt schema (optional answer-interview step)

```
Role: you are interviewing an in-house AI governance owner. For each question
below, ask follow-ups until you can rate the organization on this scale:
0 not done · 1 ad hoc/informal · 2 defined but partial · 3 defined, repeatable,
evidenced. NEVER choose the level yourself without a stated factual basis.
Return strict JSON: { "answers": [ { "questionId": "<id from the bank>",
"level": <0-3>, "evidence": "<<=280 chars, quote or paraphrase of what the
interviewee said, else empty>" } ] }. Questions: <QUESTION_BANK as JSON>.
```

The LLM never scores — the scale answer must trace to the human's statement;
`scoreAssessment` treats unanswered questions as 0 and flags them.

## What's better than the closed counterpart

1. **Transparent rubric** — every question, weight, band boundary, and
   framework mapping ships in the repo (Goodwin's questionnaire is closed).
2. **Framework-grounded gaps** — each gap cites NIST AI RMF / ISO/IEC 42001
   structures by name so a reviewer can verify, not just trust a score.
3. **Versioned** — `RUBRIC_VERSION` changes when the bank changes; scores are
   comparable across runs and orgs.
4. **Evidence-first** — gaps carry the assessor's evidence verbatim;
   unanswered ≠ guessed (scored 0 and flagged).
5. **No proprietary question clone** — original questions mapped to published
   frameworks, not Goodwin's wording.

## Legal accuracy notes

Framework references are structural mappings to published documents
(NIST AI RMF 1.0; ISO/IEC 42001:2023) — jurisdiction-agnostic guidance, not
legal advice. Sector-specific obligations (e.g., EU AI Act, NYC Local Law
144, Colorado AI Act) are deliberately **not** scored here; add them as new
rules-as-data questions rather than editing logic. Disclaimer included in
every report export.
