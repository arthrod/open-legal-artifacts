# Spec — ai-use-case-inventory

## Purpose
A firm-wide inventory of AI use cases with a first-pass risk tier per use,
gap flags, dashboard counts, and CSV export — the input artifact for AI
governance programs (EU AI Act-style obligations, NIST AI RMF mapping).

## Interface (core/core.js, dependency-free ES module)

| Export | Purpose |
|---|---|
| `DEFAULT_TIER_RULES` | Rubric as rules-as-data: ordered `{tier, id, label, anyOfKeywords, noneOfKeywords?, evidenceNote}`; first match wins |
| `tierUseCase(record, rules?)` | `{tier, basis, gaps[], nistRmf, role, dualRoleFlag, roleNote, obligations, outOfScope, scopeNote, needsHumanReview}` |
| `buildInventory(records, rules?)` | Tiered items + counts (6 tiers) + gap rollup + blockers + CSV + disclaimer |
| `toCSV(items)` / `dashboard(inventory)` | CSV export (role/status/nextReview/needsReview/outOfScope columns) and dashboard aggregates (incl. byRole/byStatus) |
| `assessRole(record)` | Role + dual-role flag (deployer + `substantialModification` ⇒ provider duties too, Art. 25-style [verify]) |
| `reviewDue(inventory, asOfISO)` | Lifecycle clock: nextReview due ≤30d (incl. overdue) + stale >1y |
| `filterInventory(inventory, {tier?, status?, nexus?, needsReview?})` | Tier / lifecycle-status / EU-nexus filters |
| `OBLIGATION_NOTES` / `ROLES` / `TIERS` / `GPAI_SYSTEMIC_FLOPS` | Cited role×tier obligations (each `[verify]`-tagged), enums, 1e25 FLOPs systemic-risk presumption |
| `NIST_RMF_MAPPING` | Tier → NIST AI RMF govern/map/measure/manage note |

Record shape: `{id, name, purpose, dataSensitivity:
public|internal|confidential|personal|special-category, humanOversight:
none|notify|human-in-loop|human-decides, autonomy:
assist|draft-with-review|act-with-review|autonomous, department?,
existingControls?, role? (default deployer), substantialModification?,
trainingComputeFlops?, status?: planned|pilot|production|retired, owner?,
nextReview? (ISO date), euNexus?}`.

## Tiering logic (transparent, no proprietary score)

Tiers: `prohibited > gpai_systemic > gpai > high > limited > minimal`.

1. Keyword rules run top-down, first hit wins. Each prohibited rule carries
   a **negation guard** (`noneOfKeywords: detect/flag/block/moderate`,
   word-boundary matched): if the text also names a policing verb *and the
   rule’s prohibited keyword matched*, the rule is skipped — “detects dark
   patterns” stays minimal — and `needsHumanReview` is set with a major gap.
   A policing verb alone (no prohibited keyword) never flags; never classify
   silently.
2. No rule matched + `trainingComputeFlops` ⇒ `gpai` (or `gpai_systemic` at
   ≥1e25 FLOPs, Art. 51-style presumption [verify]); the basis cites the
   threshold. Specific-use keyword rules take precedence over the compute
   track.
3. Still no rule → `minimal`; personal/special-category data bumps it to
   `limited` (transparency), again with an explicit basis.
4. `euNexus:false` ⇒ tier is still computed for information, but
   `outOfScope:true` + note (the Act does not apply as registered).
5. Gap flags cross-check tier × controls:
   - prohibited practice → **blocker**
   - negation guard fired → **major** (confirm intent with owner)
   - dual-role shift (deployer + substantial modification) → **major**
   - high tier without human-in-loop/human-decides → **blocker**
     (mandatory-oversight gap)
   - high tier with act-autonomy → **major** (verify logging/fallback)
   - transparency tier with no oversight owner → **major**
   - special-category data without privacy controls (DPA/GDPR/LGPD) → **major**
   - autonomous action without eval/red-team/monitoring → **minor**
   - out-of-EU-scope tiering relied on for EU purposes → **minor** [verify]
6. Lifecycle: `reviewDue(inventory, asOfISO)` lists entries due ≤30d
   (overdue included) and stale >1y; `filterInventory` slices by tier,
   status, or nexus.

EU AI Act-ish defaults; swap `DEFAULT_TIER_RULES` wholesale for another
framework (e.g., sector rubric) — the engine is generic keyword-rule
matching + structured cross-checks.

## Obligations (cited data, illustrative)

`OBLIGATION_NOTES[role][tier]` maps all 6 supply-chain roles (provider,
deployer, importer, distributor, authorised-representative, manufacturer)
× 6 tiers to “-style” obligation lists, each tagged `[verify]` — e.g.
deployer×high cites an Art. 26-style oversight list. These are illustrative
defaults for diffing, not legal advice.

## Deterministic vs LLM-assisted

- **Deterministic:** tiering, gap checks, counts, CSV, dashboard.
- **LLM-assisted (optional, outside core):** enriching a vague `purpose`
  field into rubric-ready language, drafting mitigation plans for gaps.
  Prompt schema in README.

## Better than the closed counterpart

1. **Transparent rubric** — every tier decision cites the rule, the matched
   keyword, and an evidence note; nothing is a proprietary score.
2. **Structured, versioned data** — records and rubric are JSON you own;
   re-running after a rubric edit is a diff, not a re-consultation.
3. **Gap flags are cross-checks**, not vibes: tier × oversight × autonomy ×
   data sensitivity, each with severity and remediation hint.
4. CSV export for auditors; NIST AI RMF mapping included per tier.

## Disclaimers
Not a compliance determination; EU AI Act interpretations vary and the
rubric is configurable. Fictional data. Not legal advice.
