/** Example data for the standalone demo — same as examples/input.json (fictional). */
export default {
  deal: { name: "Project Copperfield — sale of Kestrel Data Systems, Inc. (fictional)" },
  buyers: [
    { id: "B1", name: "Oryx Growth Partners" },
    { id: "B2", name: "Lantern Harbor Capital" },
    { id: "B3", name: "Fairwind Industrials" },
  ],
  settings: { asOf: "2026-10-23", sla: { warnDays: 3, breachDays: 5 } },
  items: [
    {
      id: "Q-001", buyerId: "B1", category: "litigation", receivedAt: "2026-09-28",
      question: "Are there any pending lawsuits against the target?",
      answers: [
        { text: "Yes. There are 3 pending lawsuits, all employment-related.", status: "draft", at: "2026-10-01" },
        { text: "Yes. There are 3 pending lawsuits: two employment matters and one commercial dispute.", status: "sent", at: "2026-10-03",
          citations: [{ docId: "DR-014", locator: "§2.1", quote: "Three actions pending: two employment, one commercial." }] },
      ],
    },
    {
      id: "Q-002", buyerId: "B2", category: "litigation", receivedAt: "2026-10-10",
      question: "Does the target have any active litigation exposure?",
      answers: [
        { text: "No. All 2 lawsuits from 2024 were settled and dismissed; there are no pending lawsuits against the target.", status: "sent", at: "2026-10-05",
          citations: [{ docId: "DR-014", locator: "§2.2", quote: "All 2024 matters settled and dismissed with prejudice." }] },
      ],
    },
    {
      id: "Q-003", buyerId: "B1", category: "customers", receivedAt: "2026-10-16",
      question: "How many customers does the target have?",
      answers: [
        { text: "The target serves 1,200 active customers across 14 locations.", status: "sent", at: "2026-10-04" },
      ],
    },
    {
      id: "Q-004", buyerId: "B3", category: "customers", receivedAt: "2026-10-19",
      question: "What is the customer base?",
      answers: [
        { text: "Approximately 950 active customers as of the latest quarter.", status: "sent", at: "2026-10-06" },
      ],
    },
    {
      id: "Q-005", buyerId: "B2", category: "financials", receivedAt: "2026-10-02",
      question: "What was 2025 revenue growth?",
      answers: [
        { text: "Revenue grew 12% in 2025.", status: "sent", at: "2026-10-02",
          citations: [{ docId: "DR-002", locator: "p. 7", quote: "FY2025 revenue growth of 12 percent." }] },
        { text: "Revenue grew 12% in 2025, but EBITDA declined 4% year over year.", status: "draft", at: "2026-10-20" },
      ],
    },
    {
      id: "Q-006", buyerId: "B1", category: "financials", receivedAt: "2026-10-18",
      question: "How did profitability trend in 2025?",
      answers: [
        { text: "EBITDA increased 4% year over year in 2025.", status: "sent", at: "2026-10-08",
          citations: [{ docId: "DR-002", locator: "p. 9", quote: "EBITDA increased 4 percent year over year in FY2025." }] },
      ],
    },
    {
      id: "Q-007", buyerId: "B2", category: "ip", receivedAt: "2026-10-20",
      question: "Is the IP exclusively licensed?",
      answers: [],
    },
    {
      id: "Q-008", buyerId: "B3", category: "ip", receivedAt: "2026-10-22",
      question: "Are any licenses exclusive?",
      answers: [
        { text: "The core patent portfolio is licensed exclusively to Meridian Manufacturing.", status: "sent", at: "2026-10-09",
          citations: [{ docId: "DR-021", locator: "Exhibit C", quote: "Core patent portfolio licensed exclusively to Meridian Manufacturing." }] },
        { text: "The core patent portfolio is licensed exclusively to Meridian Manufacturing; two trademarks are non-exclusive.", status: "draft", at: "2026-10-22" },
      ],
    },
  ],
};
