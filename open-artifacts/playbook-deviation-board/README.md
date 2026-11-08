# playbook-deviation-board (open legal artifact)

Classifies contract clauses against a versioned company playbook
(YAML-subset or JSON) into **compliant / deviates / deal-breaker /
unclassified**, quoting the clause span that matched, naming the fallback
tier, and routing approvals (tier ≥ escalation threshold or deal-breakers go
to the named approver). Numeric guard with number-word normalization:
"eighteen months" ≡ "18 months", and "3 years" never passes as "18 months".
Every deviation carries a deterministic redline (−/+ token diff) back to the
preferred standard. Full IO contract and LLM prompt schema in [spec.md](spec.md).

Beyond single-contract boards, the core supports the full review loop,
deterministically (no LLM anywhere in it):

- **Portfolio batch** — `buildPortfolio({ playbook, contracts[] })` rolls up
  per-rule deviation frequencies across a contract set (`portfolio.md`).
- **Side/polarity** — `playbook.side` vs `contract.side` mismatch is flagged
  on the board and in every row reason.
- **Decision log** — `decide(board, decisions)` freezes approvals against a
  hash of the exact board they were made on (`core/diff.ts`).
- **Board diff** — `diffBoards(a, b)` splits a re-run into new / resolved /
  changed / unchanged rows.
- **Drift detector** — `detectDrift(log, { threshold, lookbackMonths })`
  proposes per rule Revise / Clarify / Flag from accepted-deviation history
  (`core/drift.ts`).

Fictional worked examples in [examples/](examples/): Verdant Robotics' NDA
playbook vs. two drafts — 8 clauses (1 compliant, 4 deviations, 2
deal-breakers, 1 unclassified) and 4 clauses (word-form "ninety days" matches
the 90-day-exit fallback tier), plus a cross-contract `portfolio.md`.

## Layout

- `core/` — dependency-free TypeScript, no LLM: `yaml.ts` (strict YAML
  subset), `textutil.ts` (token-span matcher + number-word normalization),
  `board.ts` (classifier + router + redlines + rollup + portfolio +
  renderer), `redline.ts`, `diff.ts` (decision log + board diff), `drift.ts`,
  `board.test.ts`. `core.js` is the browser/Node plain-JS port used by the
  demo.
- `examples/` — `playbook.yaml`, `contract.json`, `contract-2.json`, `run.ts`,
  generated `output.json` + `board.md`, `output-2.json` + `board-2.md`,
  `portfolio.md`.
- `demo/` — standalone HTML demo (relative imports; inlined at build time by
  `deploy/build-site.mjs`).

## Run

```bash
npx tsx --test core/*.test.ts  # 25 tests
npx tsx examples/run.ts        # regenerates examples/output*.json, board*.md, portfolio.md
```
