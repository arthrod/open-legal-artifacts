/** Example data for the standalone demo — same as examples/input.json (fictional). */
export default {
  meta: {
    company: "Verdant Robotics, Inc. (fictional)",
    firmNames: { HPL: "Hale & Prior LLP", MVL: "Merrick Vaughan LLP" },
    matterNames: { "M-210": "Project Kite — FDA response", "M-211": "Atlas IP enforcement", "M-212": "Dune merger — HSR filing" },
  },
  settings: { rateToleranceUsd: 0, writeOffFlagPct: 10 },
  rateCards: [
    { firmId: "HPL", effectiveFrom: "2026-07-01", effectiveTo: "2026-12-31", rates: { partner: 850, associate: 445, paralegal: 185 } },
    { firmId: "HPL", matterId: "M-211", effectiveFrom: "2026-07-01", rates: { partner: 900, associate: 470, paralegal: 195 } },
    { firmId: "MVL", effectiveFrom: "2026-09-01", rates: { partner: 775, associate: 410 } },
  ],
  budgets: [
    { matterId: "M-210", firmId: "HPL", approved: 8000 },
    { matterId: "M-211", approved: 50000 },
    { matterId: "M-212", firmId: "MVL", period: "2026-10", approved: 30000 },
  ],
  ledger: [
    { id: "L-001", matterId: "M-210", firmId: "HPL", period: "2026-09", date: "2026-09-03", timekeeper: "A. Reyes", level: "partner", hours: 4.0, rate: 850, narrative: "Draft response to FDA 483 letter; call with regulatory team." },
    { id: "L-002", matterId: "M-210", firmId: "HPL", period: "2026-09", date: "2026-09-04", timekeeper: "J. Osei", level: "associate", hours: 6.5, rate: 445, narrative: "Research predicate device classifications; memo." },
    { id: "L-003", matterId: "M-210", firmId: "HPL", period: "2026-09", date: "2026-09-10", timekeeper: "A. Reyes", level: "partner", hours: 2.0, rate: 925, narrative: "Client call and strategy regarding response timing." },
    { id: "L-004", matterId: "M-211", firmId: "HPL", period: "2026-08", date: "2026-08-12", timekeeper: "S. Ito", level: "partner", hours: 3.0, rate: 825, narrative: "Cease-and-desist letter review; counterparty research." },
    { id: "L-005", matterId: "M-211", firmId: "HPL", period: "2026-09", date: "2026-09-15", timekeeper: "S. Ito", level: "partner", hours: 5.0, rate: 950, narrative: "TTAB opposition drafting and revision." },
    { id: "L-006", matterId: "M-212", firmId: "MVL", period: "2026-08", date: "2026-08-20", timekeeper: "P. Dorn", level: "partner", hours: 2.5, rate: 775, narrative: "HSR pre-filing analysis of acquisition size-of-transaction." },
    { id: "L-007", matterId: "M-212", firmId: "MVL", period: "2026-10", date: "2026-10-02", timekeeper: "P. Dorn", level: "counsel", hours: 1.5, rate: 600, narrative: "Second request scoping call with agency staff." },
    { id: "L-008", matterId: "M-212", firmId: "MVL", period: "2026-10", date: "2026-10-05", type: "fee", billing: "flat", amount: 25000, narrative: "Fixed fee: HSR filing package, forms and certifications." },
    { id: "L-009", matterId: "M-210", firmId: "HPL", period: "2026-09", date: "2026-09-28", type: "disbursement", amount: 1840.25, narrative: "Regulatory printing and courier charges." },
    { id: "L-010", matterId: "M-211", firmId: "HPL", period: "2026-09", date: "2026-09-30", timekeeper: "S. Ito", level: "partner", hours: 8.0, rate: 900, narrative: "Opposition brief finalization; senior-partner review; partial write-off agreed with billing partner.", writeOff: 1800 },
    { id: "L-011", matterId: "M-210", firmId: "HPL", period: "2026-10", date: "2026-10-06", timekeeper: "J. Osei", level: "associate", hours: 4.0, rate: 445, narrative: "Supplemental responses to agency questions.", writeOff: 89 },
  ],
};
