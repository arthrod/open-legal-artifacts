/** Example data for the standalone demo — same as examples/input.json (fictional). */
export default {
  meta: {
    company: "Verdant Robotics, Inc. (fictional)",
    firmNames: { HPL: "Hale & Prior LLP", MVL: "Merrick Vaughan LLP" },
    matterNames: { "M-210": "Project Kite — FDA response", "M-211": "Atlas IP enforcement", "M-212": "Dune merger — HSR filing", "M-213": "Northwind wage-and-hour audit" },
  },
  settings: { rateToleranceUsd: 0, writeOffFlagPct: 10, rateCreepPct: 10, hoursSpikeFactor: 2 },
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
  guidelines: [
    { id: "BG-01", type: "block_billing", minPhrases: 2, maxWords: 40 },
    { id: "DE-01", type: "disallowed_expense", category: "meals", capUsd: 75 },
    { id: "HD-01", type: "max_hours_per_day", maxHours: 10 },
    { id: "SR-01", type: "staffing_ratio", minRatio: 1.5 },
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
    { id: "L-012", matterId: "M-213", firmId: "HPL", period: "2026-07", date: "2026-07-07", timekeeper: "K. Kwan", level: "associate", hours: 3.0, rate: 395, narrative: "Onboarding documentation review for the audit." },
    { id: "L-013", matterId: "M-213", firmId: "HPL", period: "2026-08", date: "2026-08-05", timekeeper: "K. Kwan", level: "associate", hours: 3.5, rate: 445, narrative: "Wage-and-hour policy revisions." },
    { id: "L-014", matterId: "M-213", firmId: "HPL", period: "2026-08", date: "2026-08-19", timekeeper: "D. Lindqvist", level: "paralegal", hours: 3.0, rate: 185, narrative: "Custodian interview scheduling." },
    { id: "L-015", matterId: "M-213", firmId: "HPL", period: "2026-09", date: "2026-09-15", timekeeper: "D. Lindqvist", level: "paralegal", hours: 6.0, rate: 185, narrative: "Custodian interviews and document log." },
    { id: "L-016", matterId: "M-213", firmId: "HPL", period: "2026-09", date: "2026-09-15", timekeeper: "D. Lindqvist", level: "paralegal", hours: 5.5, rate: 185, narrative: "Interview summaries and exhibit index." },
    { id: "L-017", matterId: "M-213", firmId: "HPL", period: "2026-09", date: "2026-09-16", type: "disbursement", category: "meals", amount: 214.75, narrative: "Team dinner during interview week." },
  ],
};
