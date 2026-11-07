/** Example data for the standalone demo — examples/playbook.yaml (verbatim) + examples/contract.json (fictional).
 * The demo parses the YAML with the core's own dependency-free parser. */
export const playbookYaml = `# Verdant Robotics mutual NDA playbook (fictional company) — v3
# YAML subset: nested maps, "- " lists, quoted scalars, numbers, true/false.

playbookId: PB-NDA-2026-v3
name: Mutual NDA playbook
defaultApprover: Legal Operations

rules:
  - id: term
    topic: Term
    preferred:
      label: "3-year fixed term"
      text: "This Agreement commences on the Effective Date and continues for three (3) years."
    fallbacks:
      - tier: 1
        label: "Evergreen, 90-day exit"
        text: "This Agreement renews automatically for successive one-year terms unless either party gives ninety (90) days prior written notice."
      - tier: 2
        label: "Evergreen, 30-day exit"
        text: "This Agreement renews automatically for successive one-year terms unless either party gives thirty (30) days prior written notice."
    avoid:
      - id: perpetual-term
        mode: contains
        text: "in perpetuity"
    escalation:
      approver: General Counsel
      minFallbackTier: 2

  - id: liability
    topic: Limitation of Liability
    preferred:
      label: "Mutual cap at 12 months of fees"
      text: "Each party's aggregate liability arising out of this Agreement shall not exceed the fees paid or payable in the twelve (12) months preceding the claim."
    fallbacks:
      - tier: 1
        label: "Mutual cap at total contract value"
        text: "Each party's aggregate liability arising out of this Agreement shall not exceed the total fees paid under this Agreement."
    avoid:
      - id: uncapped-liability
        mode: contains
        text: "unlimited liability"
      - id: consequential-damages carve-out
        mode: similarity
        text: "Provider shall be liable for all consequential damages and lost profits of the customer without cap"
        threshold: 0.6
    escalation:
      approver: General Counsel
      minFallbackTier: 2
`;

export const contract = {
  name: "Mutual NDA — Verdant Robotics / Northwind AI Labs (draft v2, fictional)",
  clauses: [
    { id: "C1", heading: "Term", text: "3.1 Term. This Agreement commences on the Effective Date and continues for three (3) years. Neither party may assign this Agreement without the other's prior written consent." },
    { id: "C2", heading: "Term", text: "3.1 Term. This Agreement renews automatically for successive one-year terms unless either party gives ninety (90) days prior written notice of non-renewal." },
    { id: "C3", heading: "Term", text: "3.1 Term. This Agreement renews automatically for successive one-year terms unless either party gives thirty (30) days prior written notice of non-renewal." },
    { id: "C4", heading: "Term", text: "3.1 Term. This Agreement commences on the Effective Date and continues in perpetuity unless terminated by mutual written agreement." },
    { id: "C5", heading: "Limitation of Liability", text: "8.1 Liability. Each party's aggregate liability arising out of this Agreement shall not exceed the fees paid or payable in the twelve (12) months preceding the claim, excluding breaches of Section 4 (Confidentiality), for which the receiving party accepts unlimited liability." },
    { id: "C6", heading: "Limitation of Liability", text: "8.1 Liability. Each party's aggregate liability arising out of this Agreement shall not exceed the total fees paid under this Agreement." },
    { id: "C7", heading: "Term", text: "3.1 Term. This Agreement commences on the Effective Date and continues for eighteen (18) months." },
    { id: "C8", heading: "Governing Law", text: "11.1 Governing Law. This Agreement is governed by the laws of the State of Delaware, without regard to conflict-of-laws principles." },
  ],
};
