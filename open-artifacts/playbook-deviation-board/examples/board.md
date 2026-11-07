# Playbook deviation board — Mutual NDA — Verdant Robotics / Northwind AI Labs (draft v2, fictional)

Playbook: PB-NDA-2026-v3

**8 clauses:** 1 compliant · 4 deviate · 2 deal-breaker · 1 unclassified

| Clause | Rule | Classification | Matched tier | Similarity | Routed to |
|---|---|---|---|---|---|
| C1 (Term) | term | compliant | preferred | 1.00 | — |
| C2 (Term) | term | deviates | 1 | 1.00 | Legal Operations |
| C3 (Term) | term | deviates | 2 | 1.00 | General Counsel |
| C4 (Term) | term | deal_breaker | — | 1.00 | General Counsel |
| C5 (Limitation of Liability) | liability | deal_breaker | — | 1.00 | General Counsel |
| C6 (Limitation of Liability) | liability | deviates | 1 | 1.00 | Legal Operations |
| C7 (Term) | term | deviates | — | 0.71 | General Counsel |
| C8 (Governing Law) | — | unclassified | — | 0.00 | Legal Operations |

## C2 — deviates (tier 1)

> This Agreement renews automatically for successive one-year terms unless either party gives ninety (90) days prior written notice

matches fallback tier 1 (Evergreen, 90-day exit), not the preferred standard.
Routed to: **Legal Operations**.

## C3 — deviates (tier 2)

> This Agreement renews automatically for successive one-year terms unless either party gives thirty (30) days prior written notice

matches fallback tier 2 (Evergreen, 30-day exit), not the preferred standard.
Routed to: **General Counsel**.

## C4 — deal_breaker

> 3.1 Term. This Agreement commences on the Effective Date and continues in perpetuity unless terminated by mutual written agreement.

matches avoid rule "perpetual-term": contains "in perpetuity".
Routed to: **General Counsel**.

## C5 — deal_breaker

> 8.1 Liability. Each party's aggregate liability arising out of this Agreement shall not exceed the fees paid or payable in the twelve (12) months preceding the claim, excluding breaches of Section 4 (Confidentiality), for which the receiving party accepts unlimited liability.

matches avoid rule "uncapped-liability": contains "unlimited liability".
Routed to: **General Counsel**.

## C6 — deviates (tier 1)

> Each party's aggregate liability arising out of this Agreement shall not exceed the total fees paid under this Agreement

matches fallback tier 1 (Mutual cap at total contract value), not the preferred standard.
Routed to: **Legal Operations**.

## C7 — deviates

> 3.1 Term. This Agreement commences on the Effective Date and continues for eighteen (18) months.

no playbook tier matched: clause is beyond the playbook (neither preferred nor any fallback). standard requires [3] but matched span has [].
Routed to: **General Counsel**.

## C8 — unclassified

> 11.1 Governing Law. This Agreement is governed by the laws of the State of Delaware, without regard to conflict-of-laws principles.

no rule topic matches heading "Governing Law" (best similarity 0.00 < 0.3).
Routed to: **Legal Operations**.
