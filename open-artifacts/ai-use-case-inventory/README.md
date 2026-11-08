# ai-use-case-inventory

> Inventory of a firm's AI use cases with a transparent EU AI Act-ish
> rules-as-data risk rubric, gap flags, dashboard counts, and CSV export.
> Open counterpart to Anthropic's "AI use-case inventory" artifact.

**Fictional data only. Not legal advice.**

## What it does

- Each use case record (purpose, data sensitivity, human oversight,
  autonomy, controls, **role, lifecycle status/owner/next review, EU nexus**)
  is **tiered** against an ordered keyword rubric — first match wins, and
  every decision returns the rule id, the matched keyword, and an evidence
  note.
- **Six tiers**: prohibited / high / limited / minimal for specific uses,
  plus **gpai / gpai_systemic** for model-side entries via
  `trainingComputeFlops` (systemic-risk presumption ≥1e25 FLOPs,
  Art. 51-style [verify]).
- **Role-aware obligations**: `assessRole()` maps each record to a
  supply-chain role (provider / deployer / importer / distributor /
  authorised-representative / manufacturer) and flags the Art. 25-style
  **dual-role shift** when a deployer substantially modifies a system —
  the record then carries both the deployer and the provider `×tier`
  obligation notes;
  `OBLIGATION_NOTES[role][tier]` returns a cited, `[verify]`-tagged
  obligation list for every combination.
- **Negation-safe matching**: prohibited rules carry `noneOfKeywords`
  (detect / flag / block / moderate, word-boundary matched) — “detects dark
  patterns” tiers minimal, not prohibited, with `needsHumanReview` and a loud
  gap; a policing verb alone, with no prohibited-practice keyword hit, never
  flags. Never classify silently.
- **EU-nexus gate**: `euNexus:false` keeps the informational tier but marks
  the entry `outOfScope` with a note.
- **Lifecycle register + review clock**: `reviewDue(inv, asOfISO)` lists
  reviews due within 30 days and entries stale over a year; CSV and the
  dashboard carry status / owner / next review / needs-review / out-of-scope.
- **Gap flags** cross-check tier vs controls (high tier without human
  oversight = blocker; special-category data without privacy controls =
  major; autonomous action without eval logs = minor…).
- **Dashboard**: counts per tier, gap counts, blocker list, per-department /
  role / status splits, tier/status/nexus **filters**. **CSV export** for
  auditors.
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
- **Role + obligations as data**: 6 supply-chain roles, dual-role detection,
  and a cited `[verify]`-tagged obligation note per role×tier — auditable
  diffs, not obligations that only ever live in a conversation.
- **Model-side tiers**: GPAI / systemic-risk compute track with the 1e25
  FLOPs presumption cited in the basis.
- **Living register**: status / owner / next-review fields plus a
  deterministic review clock (≤30d due, >1y stale) and tier/status/nexus
  filters.
- **Scoping before tiering**: EU-nexus gate marks out-of-scope entries
  instead of tiering unconditionally.
- **Negation-safe, never silent**: detect/flag-style purposes don't trigger
  prohibited tiers; they raise `needsHumanReview` instead.
- **Your data, your rules**: JSON records and a swappable rubric; auditable
  diffs on every edit.
- **Gap severity levels** tied to specific missing controls, not a generic
  "open compliance items" list.
- Offline, zero-dependency, CSV in one call. (The counterpart's interactive
  add-interview stays conversational; here the core is deterministic — the
  LLM prompt schema below only enriches input text.)

## Run / test

```
node --test core/core.test.js   # 29 unit tests (node:test)
node examples/run.js           # regenerates examples/output.json + inventory.csv
open demo/index.html           # interactive inventory + dashboard + review clock
```
