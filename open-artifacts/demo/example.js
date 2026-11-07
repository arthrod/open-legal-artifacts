/** Example data for the standalone demo — same as examples/input.json (fictional). */
export default {
  "documents": [
    {
      "id": "cory-msa",
      "name": "MSA — Corydon Analytics (signed Mar. 2025, fictional)",
      "text": "2. Term. This Agreement commences on the Effective Date and continues for three (3) years. 3. Termination. Either party may terminate for convenience upon ninety (90) days prior written notice. 8. Liability. Each party's aggregate liability shall not exceed the fees paid in the twelve (12) months preceding the claim. 11. Assignment. Neither party may assign this Agreement without the other's prior written consent. 14. Governing Law. This Agreement is governed by the laws of England and Wales."
    },
    {
      "id": "lightway-nda",
      "name": "NDA — Lightway Optics (draft v4, fictional)",
      "text": "1. Term. This Agreement continues for two (2) years from the Effective Date. 4. Termination. Either party may terminate this Agreement for convenience upon thirty (30) days written notice. 7. Liability. Disclosing party's total liability is limited to $50,000. 9. Assignment. Receiving party may not assign this Agreement. 12. Governing Law. This Agreement is governed by the laws of the State of New York."
    },
    {
      "id": "harbor-saas",
      "name": "SaaS Order Form — Harbor Freight Data Co. (counter-signed, fictional)",
      "text": "Subscription Term: twelve (12) months, auto-renewing unless cancelled sixty (60) days before each renewal date. Cancellation: either party may cancel for convenience with sixty (60) days notice. Liability: provider's liability is capped at fees paid in the preceding three (3) months. Assignment: permitted to a successor in a merger. Governing law: California."
    }
  ],
  "questions": [
    { "id": "Q1", "question": "What is the term / subscription length?" },
    { "id": "Q2", "question": "What notice is required to terminate for convenience?" },
    { "id": "Q3", "question": "What is the liability cap?" },
    { "id": "Q4", "question": "Is assignment permitted?" },
    { "id": "Q5", "question": "What law governs the agreement?" }
  ],
  "cells": [
    { "documentId": "cory-msa", "questionId": "Q1", "answer": "3 years from the Effective Date", "quote": "This Agreement commences on the Effective Date and continues for three (3) years.", "pinpoint": "§ 2" },
    { "documentId": "cory-msa", "questionId": "Q2", "answer": "90 days prior written notice", "quote": "Either party may terminate for convenience upon ninety (90) days prior written notice.", "pinpoint": "§ 3" },
    { "documentId": "cory-msa", "questionId": "Q3", "answer": "Fees paid in the preceding 12 months", "quote": "Each party's aggregate liability shall not exceed the fees paid in the twelve (12) months preceding the claim.", "pinpoint": "§ 8" },
    { "documentId": "cory-msa", "questionId": "Q4", "answer": "No — consent required", "quote": "Neither party may assign this Agreement without the other's prior written consent.", "pinpoint": "§ 11" },
    { "documentId": "cory-msa", "questionId": "Q5", "answer": "England and Wales", "quote": "This Agreement is governed by the laws of England and Wales.", "pinpoint": "§ 14" },

    { "documentId": "lightway-nda", "questionId": "Q1", "answer": "2 years from the Effective Date", "quote": "This Agreement continues for two (2) years from the Effective Date.", "pinpoint": "§ 1" },
    { "documentId": "lightway-nda", "questionId": "Q2", "answer": "30 days written notice", "quote": "Either party may terminate this Agreement for convenience upon thirty (30) days written notice.", "pinpoint": "§ 4" },
    { "documentId": "lightway-nda", "questionId": "Q3", "answer": "$50,000 total", "quote": "Disclosing party's total liability is limited to $50,000.", "pinpoint": "§ 7" },
    { "documentId": "lightway-nda", "questionId": "Q4", "answer": "No (receiving party may not assign)", "quote": "Receiving party may not assign this Agreement.", "pinpoint": "§ 9" },
    { "documentId": "lightway-nda", "questionId": "Q5", "answer": "New York", "quote": "This Agreement is governed by the laws of the State of New York.", "pinpoint": "§ 12" },

    { "documentId": "harbor-saas", "questionId": "Q1", "answer": "12 months, auto-renewing", "quote": "Subscription Term: twelve (12) months, auto-renewing unless cancelled sixty (60) days before each renewal date." },
    { "documentId": "harbor-saas", "questionId": "Q2", "answer": "60 days notice", "quote": "either party may cancel for convenience with sixty (60) days notice" },
    { "documentId": "harbor-saas", "questionId": "Q3", "answer": null },
    { "documentId": "harbor-saas", "questionId": "Q4", "answer": "Yes, to a merger successor", "quote": "Assignment: permitted to a successor in a merger." },
    { "documentId": "harbor-saas", "questionId": "Q5", "answer": "California", "quote": "Governing law: the laws of the State of California, including its conflict-of-laws rules." }
  ]
};
