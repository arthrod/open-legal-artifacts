# playbook-deviation-board — specification

Open reimplementation of the Anthropic "Playbook deviation board" legal
artifact (catalog §2.6): classifies contract clauses against a company
playbook into **compliant / deviates / deal-breaker**, quoting the clause text
and the playbook tier that matched, and routing exceptions to an approver.

## Design split: deterministic core vs. LLM

| Capability | Owner |
|---|---|
| Playbook parsing (YAML subset or JSON) | core (`core/yaml.ts`) |
| Clause → rule assignment (explicit `ruleId`, else heading-vs-topic similarity) | core (deterministic) |
| Tier matching: preferred / fallbacks / avoid, with quoted span + tier | core (deterministic) |
| Numeric guard: a standard only matches if its numbers appear in the matched span | core (deterministic) |
| Approver routing (escalation thresholds) | core (deterministic) |
| Markdown board rendering | core (deterministic) |
| Extracting clauses + headings from a raw contract file | LLM (prompt below) |
| Judging legal acceptability of a beyond-playbook clause | human approver |

The catalog's warnings drive the design: playbook as *versioned structured
data* (YAML/JSON), tri-state classification ("different" ≠ "unacceptable"),
and deterministic routing.

## Playbook contract (YAML subset or the same shape as JSON)

```yaml
playbookId: PB-NDA-2026-v3
defaultApprover: Legal Operations
rules:
  - id: term                      # stable rule id
    topic: Term                   # matched against clause headings
    preferred:                    # the company standard
      label: "3-year fixed term"
      text: "This Agreement continues for three (3) years."
    fallbacks:                    # acceptable deviations, ordered by tier
      - tier: 1
        label: "Evergreen, 90-day exit"
        text: "…"
    avoid:                        # deal-breakers
      - id: perpetual-term
        mode: contains            # or: similarity
        text: "in perpetuity"
        threshold: 0.8            # similarity mode only
    escalation:                   # routing for this rule
      approver: General Counsel
      minFallbackTier: 2          # tier ≥ 2 (or any beyond-playbook match) → approver
```

YAML subset supported by the dependency-free parser: nested maps, `- ` lists
(scalars or dash-line mappings), quoted/plain scalars, numbers, `true/false`,
`null`, full-line comments, and inline `" #"` comments — a `#` outside quotes
at value start or after whitespace starts a comment, per YAML (a `#` glued to
a token like `PB#1` is part of the value). Comments are stripped before scalar
parsing, so comment text never leaks into a value. Anything the subset cannot
parse → parse error, never a guess.

## Input (`BoardInput`)

`{ playbook, contract: { name, side?, clauses: [{ id, heading?, text, ruleId? }] }, thresholds? }`
with defaults `preferred: 0.7`, `fallback: 0.7`, `topic: 0.3`. Optional
`playbook.side` / `contract.side` (`sales` | `purchasing`): when both are set
and differ, the output carries a `sideMismatch` warning and every row's
`reason` repeats it.

Portfolio variant: `buildPortfolio({ playbook, contracts: [...], thresholds? })`
classifies a contract set and adds a per-rule deviation-frequency `rollup`
(counts + `deviationRate = (deviates + dealBreakers) / clauses`).

## Output (`BoardOutput`)

`contractName`, `playbookId`, `sideMismatch`, `thresholds` (the resolved
values, as data), `summary`, and one row per clause:

- `classification`: `compliant` | `deviates` | `deal_breaker` | `unclassified`
- `matchedTier`: `'preferred'` | fallback tier number | `null` (beyond playbook)
- `matchedLabel`, `similarity`, `clauseQuote` (char-span + verbatim text of the
  matched clause fragment), full `clauseText`, `reason`, `routedTo`.
- `redline`: on `deviates` rows, a deterministic token diff back to the
  preferred standard (`{ label, removals, additions }`, char-anchored in the
  clause / preferred text); rendered as a ` ```diff ` block in `board.md`.

Decision order per clause: avoid rules first — a verbatim (whitespace-
and-case-insensitive) containment of the avoid text counts in **any** mode,
else similarity mode scores whole-clause similarity ≥ the avoid rule's
threshold — then preferred (similarity ≥ threshold, numbers must
match, and at least as strong as the best fallback), then the best-scoring
fallback tier whose numbers match, else beyond-playbook deviation. Numeric
mismatches ("3 years" vs "18 months") are reported in `reason` — a skeleton
match with different numbers is never compliant.

Routing: deal-breakers and tier ≥ `minFallbackTier` deviations and
beyond-playbook clauses → the rule's escalation approver; when a rule has no
`escalation`, its deal-breakers and beyond-playbook clauses fall back to
`defaultApprover` (with an explicit note in `reason`); lower-tier
deviations → `defaultApprover`; compliant → nobody; unclassified →
`defaultApprover`.

## Review-loop utilities (deterministic)

- `core/diff.ts` — `decide(board, decisions)` records a decision log bound to
  `boardHash(board)` (stable 32-bit hash of the exact `BoardOutput`; use it for
  quick change detection and keep the frozen board as the actual audit
  evidence); rejects unknown and duplicate clauseIds. `diffBoards(a, b)` diffs
  two runs of the same contract into `newRows` (only in `b`) / `droppedRows`
  (only in `a` — e.g. a deal-breaker clause deleted in draft v2) /
  `resolvedRows` (non-compliant → compliant) / `changedRows` (with the list of
  changed fields) / unchanged, with a summary count for each bucket.
- `core/drift.ts` — `detectDrift(entries, { threshold = 5, lookbackMonths = 12 })`
  consumes accepted-deviation entries `{ date, ruleId, direction, kind? }`
  (dates must be real `YYYY-MM-DD` calendar dates) and
  proposes per rule: **Flag** (threshold met and the window includes
  deal-breaker language), **Revise** (threshold met, single direction),
  **Clarify** (threshold met, split directions), or null (watch only).

## Prompt schema for the LLM part

The LLM never classifies. It only structures the inputs:

```jsonc
// Task: extract clauses from a contract
{ "clauses": [ { "id": "C1", "heading": "Term", "text": "…", "ruleId": "term" } ] }
// ruleId is optional; when omitted the core assigns by heading similarity.
```

## Determinism

Same playbook + contract → byte-identical `output.json` / `board.md`
(regenerated by `examples/run.ts`).

## Known limits

- Heading-based rule assignment is token similarity; contracts with unusual
  headings should carry explicit `ruleId`s (the LLM extraction prompt can set
  them from your playbook's rule list).
- `contains` avoid-rules are literal substring checks after lowercasing and
  whitespace collapse; regex avoid-rules are deliberately not supported.
- Number-word normalization is gated: a run of English number words
  (one–ninety-nine plus hundred/thousand scales) counts as a number only when
  immediately followed by its own digit restatement or a unit word (time,
  money, percent: "eighteen (18) months", "ninety days", "successive one-year
  terms"). Bare number words in prose — "no one party may…" — yield no numeric
  token and cannot flip the numeric guard. The drafting restatement
  "eighteen (18)" collapses to a single number, so "eighteen (18) months",
  "18 months", and "eighteen months" are equivalent.
