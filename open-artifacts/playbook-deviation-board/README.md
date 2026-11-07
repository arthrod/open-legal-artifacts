# playbook-deviation-board (open legal artifact)

Classifies contract clauses against a versioned company playbook
(YAML-subset or JSON) into **compliant / deviates / deal-breaker /
unclassified**, quoting the clause span that matched, naming the fallback
tier, and routing approvals (tier ≥ escalation threshold or deal-breakers go
to the named approver). Numeric guard: "3 years" never passes as "18 months".
Full IO contract and LLM prompt schema in [spec.md](spec.md).

Fictional worked example in [examples/](examples/): Verdant Robotics' NDA
playbook vs. a draft NDA — 8 clauses → 1 compliant, 4 deviations (2 routed to
the General Counsel), 2 deal-breakers, 1 unclassified.

## Layout

- `core/` — dependency-free TypeScript, no LLM: `yaml.ts` (strict YAML
  subset), `textutil.ts` (token-span matcher), `board.ts` (classifier +
  router + renderer), `board.test.ts`.
- `examples/` — `playbook.yaml`, `contract.json`, `run.ts`, generated
  `output.json` + `board.md`.

## Run

```bash
npx tsx --test core/board.test.ts   # 12 tests
npx tsx examples/run.ts             # regenerates examples/output.json + board.md
```
