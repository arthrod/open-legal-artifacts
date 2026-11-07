# ai-use-case-inventory

> Inventory of a firm's AI use cases with a transparent EU AI Act-ish
> rules-as-data risk rubric, gap flags, dashboard counts, and CSV export.
> Open counterpart to Anthropic's "AI use-case inventory" artifact.

**Fictional data only. Not legal advice.**

## What it does

- Each use case record (purpose, data sensitivity, human oversight,
  autonomy, controls) is **tiered** against an ordered keyword rubric
  (prohibited / high / limited / minimal) — first match wins, and every
  decision returns the rule id, the matched keyword, and an evidence note.
- **Gap flags** cross-check tier vs controls (high tier without human
  oversight = blocker; special-category data without privacy controls =
  major; autonomous action without eval logs = minor…).
- **Dashboard**: counts per tier, gap counts, blocker list, per-department
  split. **CSV export** for auditors.
- Rubric is **rules-as-data**: replace `DEFAULT_TIER_RULES` wholesale to
  match another framework; the engine (matching + cross-checks) is generic.

## IO contract

See [spec.md](spec.md). Minimal use:

```js
import { buildInventory, dashboard } from './core/core.js';
const inv = buildInventory(records);
console.log(inv.counts, inv.blockers, inv.csv);
```

## Deterministic vs LLM-assisted

**Deterministic:** tiering, gaps, counts, CSV, dashboard. **LLM-assisted
(optional, outside core):** enriching vague purpose text into rubric-ready
language, drafting mitigations. Prompt schema:

```json
{
  "task": "Rewrite the use-case purpose so it names the AI function precisely.",
  "record": { "name": "...", "purpose": "..." },
  "constraints": [
    "Do not invent capabilities, data types, or users not implied by the input.",
    "Preserve uncertainty as 'unclear: ...' rather than guessing."
  ],
  "output_schema": { "purpose": "string", "unclear": ["string"] }
}
```

The rewritten purpose is still tiered by the deterministic rubric — the LLM
never assigns the tier.

## What's better than the closed counterpart

- **Explainable tiers**: rule + matched keyword + evidence note for every
  record, versus an opaque first-pass risk level.
- **Your data, your rules**: JSON records and a swappable rubric; auditable
  diffs on every edit.
- **Gap severity levels** tied to specific missing controls, not a generic
  "open compliance items" list.
- Offline, zero-dependency, CSV in one call.

## Run / test

```
node --test core/        # 13 unit tests (node:test)
node examples/run.js     # regenerates examples/output.json + inventory.csv
open demo/index.html     # interactive inventory + dashboard
```
