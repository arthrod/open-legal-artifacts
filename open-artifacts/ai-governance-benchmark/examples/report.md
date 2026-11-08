# AI Governance Benchmark — Northlake Logistics (fictional)

Rubric version: 1.1.0 · Overall maturity: **Ad hoc** (0.87 / 3.00)

## Pillar maturity

| Pillar | Weight | Score | Maturity |
|---|---|---|---|
| AI Inventory | 20% | 1.00 | Ad hoc |
| Risk Management | 25% | 0.33 | Absent |
| Vendor Management | 20% | 1.50 | Developing |
| Incident Response | 20% | 0.33 | Absent |
| Training & Culture | 15% | 1.50 | Developing |

## Gap list (scored ≤ gap threshold, with evidence)

- **inv-2** (inventory, level 1) — Is each inventory entry assigned a business owner accountable for the system?
  - Evidence: “Owners noted for 4 of 9 tools; rest unmapped.”
  - Framework refs: NIST AI RMF GOVERN-2; ISO/IEC 42001 cl. 5.3 (roles)
  - EU AI Act (illustrative, [verify]): EU AI Act art. 12 (record-keeping) [verify]
  - Remediation: Add an owner field to the registry; no orphan systems.
- **inv-3** (inventory, level 0) — Are data flows into and out of each AI system documented (inputs, outputs, retention)?
  - Evidence: “No data-flow documentation exists for any tool.”
  - Framework refs: NIST AI RMF GOVERN-1; ISO/IEC 42001 cl. 8.1
  - EU AI Act (illustrative, [verify]): EU AI Act art. 10 (data governance) [verify]; EU AI Act art. 12 (logging) [verify]
  - Remediation: Attach a one-page data-flow note per system.
- **risk-1** (risk_mgmt, level 1) — Is a documented AI risk assessment completed before a new AI system goes live?
  - Evidence: “Informal security review for the pricing model only, by email thread 2026-03.”
  - Framework refs: NIST AI RMF GOVERN-3 / MAP; ISO/IEC 42001 cl. 6.1 (risk)
  - EU AI Act (illustrative, [verify]): EU AI Act art. 9 (risk management system) [verify]
  - Remediation: Adopt a pre-deployment risk template with sign-off.
- **risk-2** (risk_mgmt, level 0) — Are risks re-assessed on a set schedule or upon material change, not just at launch?
  - Evidence: “No re-assessment after the March launch.”
  - Framework refs: NIST AI RMF MEASURE-1; ISO/IEC 42001 cl. 9.2 (internal audit)
  - EU AI Act (illustrative, [verify]): EU AI Act art. 9 (risk management system) [verify]
  - Remediation: Add quarterly or change-triggered re-assessment.
- **risk-3** (risk_mgmt, level 0) — Does the company restrict or review high-risk uses (hiring, credit, biometrics, minors)?
  - Evidence: “AI screening of driver applicants in pilot — no heightened review.”
  - Framework refs: NIST AI RMF GOVERN-3; ISO/IEC 42001 cl. 8.2
  - EU AI Act (illustrative, [verify]): EU AI Act art. 5 (prohibited practices) [verify]; EU AI Act art. 6 (classification rules) [verify]
  - Remediation: Define a high-risk use list with mandatory review.
- **ven-2** (vendor_mgmt, level 1) — Do vendor contracts address AI-specific terms (training on your data, output IP, indemnity)?
  - Evidence: “One DPA mentions no-training-on-our-data; others silent.”
  - Framework refs: NIST AI RMF GOVERN-4
  - EU AI Act (illustrative, [verify]): EU AI Act art. 10 (data governance) [verify]
  - Remediation: Adopt AI clause checklist for renewals and new deals.
- **ir-1** (incident_response, level 0) — Is there a defined process for reporting AI incidents (errors, bias, harms, leaks)?
  - Evidence: “No AI-specific incident path; general IT helpdesk only.”
  - Framework refs: NIST AI RMF GOVERN-5 / MEASURE-3; ISO/IEC 42001 cl. 8.3
  - EU AI Act (illustrative, [verify]): EU AI Act art. 12 (logs enabling incident detection) [verify]
  - Remediation: Extend the security IR plan with an AI intake path.
- **ir-2** (incident_response, level 0) — Are AI incidents triaged with severity levels and a named responder?
  - Evidence: “No severity levels defined for AI issues.”
  - Framework refs: NIST AI RMF MEASURE-3
  - EU AI Act (illustrative, [verify]): EU AI Act art. 9 (risk management; severity handling) [verify]
  - Remediation: Define severity rubric and on-call owner.
- **ir-3** (incident_response, level 1) — Are post-incident reviews fed back into policy or system changes?
  - Evidence: “After the misrouting outage (2026-05) fixes were made but nothing written down.”
  - Framework refs: NIST AI RMF MANAGE-4 / GOVERN-5; ISO/IEC 42001 cl. 10.2
  - EU AI Act (illustrative, [verify]): EU AI Act art. 9 (risk management; corrective actions) [verify]
  - Remediation: Add a lessons-learned step with tracked actions.
- **trn-1** (training, level 1) — Do employees receive training on approved vs. prohibited AI use for their role?
  - Evidence: “One all-hands slide deck on ChatGPT policy from 2025; no role-based content.”
  - Framework refs: NIST AI RMF GOVERN-2; ISO/IEC 42001 cl. 7.2 (competence)
  - EU AI Act (illustrative, [verify]): EU AI Act art. 14 (human oversight; competence) [verify]
  - Remediation: Ship a role-based AI use training module.

## Next actions (ranked)

_Priority = pillar weight × (3 − level) × (high-risk question ×1.5). Ties keep question-bank order. Address the top of this list first._

1. **risk-3** (priority 1.125 · high-risk ×1.5) — Define a high-risk use list with mandatory review.
2. **risk-2** (priority 0.750) — Add quarterly or change-triggered re-assessment.
3. **inv-3** (priority 0.600) — Attach a one-page data-flow note per system.
4. **ir-1** (priority 0.600) — Extend the security IR plan with an AI intake path.
5. **ir-2** (priority 0.600) — Define severity rubric and on-call owner.
6. **risk-1** (priority 0.500) — Adopt a pre-deployment risk template with sign-off.
7. **inv-2** (priority 0.400) — Add an owner field to the registry; no orphan systems.
8. **ven-2** (priority 0.400) — Adopt AI clause checklist for renewals and new deals.
9. **ir-3** (priority 0.400) — Add a lessons-learned step with tracked actions.
10. **trn-1** (priority 0.300) — Ship a role-based AI use training module.

## Fictional-cohort comparison (illustrative)

Percentile within a fictional reference cohort (illustrative, not market data) — not real market data.

| Pillar | Score | Percentile |
|---|---|---|
| AI Inventory | 1.00 | p40 |
| Risk Management | 0.33 | p4 |
| Vendor Management | 1.50 | p45 |
| Incident Response | 0.33 | p6 |
| Training & Culture | 1.50 | p48 |
| Overall | 0.87 | p5 |

Regime coverage: NIST AI RMF 1.0 · ISO/IEC 42001:2023 · EU AI Act arts. 5–15 (illustrative mapping — [verify] each ref against the official text; not legal advice).

---

_Deterministic output of the open ai-governance-benchmark rubric. Framework references point at published structures (NIST AI RMF 1.0, ISO/IEC 42001:2023, EU AI Act arts. 5–15) for verification; this tool is not legal advice and is not affiliated with any firm._
