# Spec — ai-use-case-inventory

## Purpose
A firm-wide inventory of AI use cases with a first-pass risk tier per use,
gap flags, dashboard counts, and CSV export — the input artifact for AI
governance programs (EU AI Act-style obligations, NIST AI RMF mapping).

## Interface (core/core.js, dependency-free ES module)

| Export | Purpose |
|---|---|
| `DEFAULT_TIER_RULES` | Rubric as rules-as-data: ordered `{tier, id, label, anyOfKeywords, evidenceNote}`; first match wins |
| `tierUseCase(record, rules?)` | `{tier, basis{ruleId, matchedKeyword, evidenceNote}, gaps[], nistRmf}` |
| `buildInventory(records, rules?)` | Tiered items + counts + gap rollup + blockers + CSV + disclaimer |
| `toCSV(items)` / `dashboard(inventory)` | Exports and dashboard aggregates |
| `NIST_RMF_MAPPING` | Tier → NIST AI RMF govern/map/measure/manage note |

Record shape: `{id, name, purpose, dataSensitivity:
public|internal|confidential|personal|special-category, humanOversight:
none|notify|human-in-loop|human-decides, autonomy:
assist|draft-with-review|act-with-review|autonomous, department?,
existingControls?}`.

## Tiering logic (transparent, no proprietary score)

1. First matching keyword rule (top-down) sets the tier — prohibited → high
   → limited. The matched keyword and the rule's evidence note are returned
   as the basis, so every tier is explainable.
2. No rule matched → `minimal`; personal/special-category data bumps it to
   `limited` (transparency), again with an explicit basis.
3. Gap flags cross-check tier × controls:
   - prohibited practice → **blocker**
   - high tier without human-in-loop/human-decides → **blocker**
     (mandatory-oversight gap)
   - high tier with act-autonomy → **major** (verify logging/fallback)
   - transparency tier with no oversight owner → **major**
   - special-category data without privacy controls (DPA/GDPR/LGPD) → **major**
   - autonomous action without eval/red-team/monitoring → **minor**

EU AI Act-ish defaults; swap `DEFAULT_TIER_RULES` wholesale for another
framework (e.g., sector rubric) — the engine is generic keyword-rule
matching + structured cross-checks.

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
