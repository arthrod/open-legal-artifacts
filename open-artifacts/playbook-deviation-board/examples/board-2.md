# Playbook deviation board — Evaluation agreement — Verdant Robotics / Halcyon Systems (draft v1, fictional)

Playbook: PB-NDA-2026-v3

Thresholds: preferred ≥ 0.70 · fallback ≥ 0.70 · topic ≥ 0.30

**4 clauses:** 1 compliant · 2 deviate · 0 deal-breaker · 1 unclassified

| Clause | Rule | Classification | Matched tier | Similarity | Routed to |
|---|---|---|---|---|---|
| E1 (Term) | term | deviates | 1 | 0.95 | Legal Operations |
| E2 (Limitation of Liability) | liability | compliant | preferred | 1.00 | — |
| E3 (Term) | term | deviates | — | 0.71 | General Counsel |
| E4 (Governing Law) | — | unclassified | — | 0.00 | Legal Operations |

### Per-rule deviation frequency

| Rule | Clauses | Compliant | Deviates | Deal-breakers | Unclassified | Deviation rate |
|---|---|---|---|---|---|---|
| term | 2 | 0 | 2 | 0 | 0 | 1.00 |
| liability | 1 | 1 | 0 | 0 | 0 | 0.00 |
| — | 1 | 0 | 0 | 0 | 1 | 0.00 |

## E1 — deviates (tier 1)

> This Agreement renews automatically for successive one-year terms unless either party gives ninety days prior written notice

matches fallback tier 1 (Evergreen, 90-day exit), not the preferred standard.

Suggested redline to the preferred standard (3-year fixed term):

```diff
- renews automatically
- successive one-year terms unless either party gives ninety days prior written notice
+ commences on the Effective Date and continues
+ three (3) years.
```
Routed to: **Legal Operations**.

## E3 — deviates

> 4.1 Term. This Agreement commences on the Effective Date and continues for eighteen months.

no playbook tier matched: clause is beyond the playbook (neither preferred nor any fallback). standard requires [3] but matched span has [].

Suggested redline to the preferred standard (3-year fixed term):

```diff
- eighteen months.
+ three (3) years.
```
Routed to: **General Counsel**.

## E4 — unclassified

> 12.1 Governing Law. This Agreement is governed by the laws of the State of New York.

no rule topic matches heading "Governing Law" (best similarity 0.00 < 0.3).
Routed to: **Legal Operations**.
