/** Example data for the standalone demo — same as examples/input.json (fictional). */
const EXAMPLE = {
  "caseName": "Delgado v. Summit Ridge Hospitality, LLC (No. 25-cv-0442, fictional)",
  "version": 2,
  "posture": "A",
  "theory": {
    "name": "Retaliatory termination after wage-complaint activity (fictional theory)",
    "keyTerms": ["terminated", "employment", "written warning", "final wages", "vacation pay"]
  },
  "settings": {
    "maxGapDays": 90,
    "accountSimilarityThreshold": 0.35,
    "mergeThreshold": 0.4
  },
  "documents": [
    {
      "id": "compl",
      "name": "Complaint (filed Feb. 6, 2025)",
      "text": "1. Plaintiff files this Complaint on February 6, 2025. ... 7. Plaintiff was hired as a floor manager on March 3, 2020. ... 14. On January 9, 2025, Mr. Reyes told Ms. Delgado she was terminated, effective at the end of her shift. ... 19. Defendant issued final wages on January 15, 2025, but did not include accrued vacation pay."
    },
    {
      "id": "answer",
      "name": "Answer and Affirmative Defenses",
      "text": "2. Defendant admits Plaintiff was hired as a floor manager on March 3, 2020."
    },
    {
      "id": "delgado-decl",
      "name": "Declaration of M. Delgado (Feb. 3, 2025)",
      "text": "6. The policy on the wall was the same one from 2021 the whole time I worked there. 11. No one ever gave me a written or verbal warning in almost five years."
    },
    {
      "id": "reyes-depo",
      "name": "Deposition of L. Reyes (Oct. 14, 2025) — privilege disputed",
      "priv": "flag",
      "text": "Q. When did the cash-handling policy change? A. We updated the handbook section in spring of 2024. Q. Did Ms. Delgado ever receive discipline? A. I gave her a written reprimand about the cash drawer on the first of December."
    },
    {
      "id": "term-letter",
      "name": "Termination letter (Jan. 10, 2025)",
      "text": "This letter confirms the termination of your employment, effective January 10, 2025."
    }
  ],
  "facts": [
    {
      "id": "F1",
      "date": "2020-03-03",
      "topic": "hire",
      "text": "Delgado was hired as a floor manager at the Summit Ridge lodge.",
      "source": { "docId": "compl", "quote": "Plaintiff was hired as a floor manager on March 3, 2020.", "pinpoint": "¶ 7" }
    },
    {
      "id": "F2",
      "date": "2020-03-03",
      "topic": "hire",
      "text": "Delgado was hired as a floor manager and completed onboarding that week.",
      "source": { "docId": "answer", "quote": "Defendant admits Plaintiff was hired as a floor manager on March 3, 2020.", "pinpoint": "¶ 2" }
    },
    {
      "id": "F3",
      "date": "2024-12-01",
      "topic": "warning",
      "text": "Reyes gave Delgado a written warning about cash-handling procedures.",
      "source": { "docId": "reyes-depo", "quote": "I gave her a written warning about the cash drawer on December first.", "pinpoint": "p. 44" }
    },
    {
      "id": "F4",
      "date": "2024-12-01",
      "topic": "warning",
      "text": "Delgado never received any written or verbal warning during her employment.",
      "source": { "docId": "delgado-decl", "quote": "No one ever gave me a written or verbal warning in almost five years.", "pinpoint": "¶ 11" }
    },
    {
      "id": "F5",
      "date": "2025-01-09",
      "topic": "termination",
      "text": "Reyes told Delgado her employment was terminated at the end of the shift.",
      "source": { "docId": "compl", "quote": "On January 9, 2025, Mr. Reyes told Ms. Delgado she was terminated, effective at the end of her shift.", "pinpoint": "¶ 14" }
    },
    {
      "id": "F6",
      "date": "2025-01-10",
      "topic": "termination",
      "text": "Delgado's employment was terminated by letter dated January 10, 2025.",
      "source": { "docId": "term-letter", "quote": "This letter confirms the termination of your employment, effective January 10, 2025.", "pinpoint": "p. 1" }
    },
    {
      "id": "F7",
      "date": "2025-01",
      "topic": "final-wages",
      "text": "Summit Ridge paid Delgado's final wages by check on January 15, 2025, omitting accrued vacation pay.",
      "source": { "docId": "compl", "quote": "Defendant issued final wages on January 15, 2025, but did not include accrued vacation pay.", "pinpoint": "¶ 19" }
    },
    {
      "id": "F8",
      "date": "2025-02-06",
      "text": "Delgado filed this action alleging wrongful termination and unpaid wages.",
      "source": { "docId": "compl", "quote": "Plaintiff files this Complaint on February 6, 2025.", "pinpoint": "¶ 1" }
    },
    {
      "id": "F9",
      "dateLabel": "at all relevant times",
      "text": "The cash-handling policy posted in the back office was never updated after 2021.",
      "source": { "docId": "delgado-decl", "quote": "The policy on the wall was the same one from 2021 the whole time I worked there.", "pinpoint": "¶ 6" }
    },
    {
      "id": "F10",
      "date": "Spring 2024",
      "topic": "policy-update",
      "text": "Summit Ridge rolled out a new cash-handling policy to all locations.",
      "source": { "docId": "reyes-depo", "quote": "We rolled the new cash policy out to all franchise locations across the state in spring of 2024.", "pinpoint": "p. 51" }
    }
  ]
};

/** Prior timeline version (v1), derived exactly as examples/run.ts derives it:
 *  before the final amendment — F4 was narrower, F8 did not exist yet,
 *  F11 (schedules) was later dropped. Used for the version-diff demo. */
const EXAMPLE_V1 = {
  ...EXAMPLE,
  version: 1,
  facts: EXAMPLE.facts
    .filter((f) => f.id !== "F8")
    .map((f) => (f.id === "F4" ? { ...f, text: "Delgado never received any written warning during her employment." } : f))
    .concat([
      {
        id: "F11",
        date: "2024-06-15",
        text: "Summit Ridge posted weekly shift schedules in the break room.",
        source: { docId: "answer", quote: "Shift schedules were posted weekly in the break room.", pinpoint: "¶ 4" },
      },
    ]),
};

export { EXAMPLE, EXAMPLE_V1 };
export default EXAMPLE;
