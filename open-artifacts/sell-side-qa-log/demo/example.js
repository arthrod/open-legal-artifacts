/** Example data for the standalone demo — same as examples/input.json (fictional). */
export default {
  deal: { name: "Project Copperfield — sale of Kestrel Data Systems, Inc. (fictional)" },
  buyers: [
    { id: "B1", name: "Oryx Growth Partners" },
    { id: "B2", name: "Lantern Harbor Capital" },
    { id: "B3", name: "Fairwind Industrials" },
  ],
  items: [
    {
      id: "Q-001", buyerId: "B1", category: "litigation",
      question: "Are there any pending lawsuits against the target?",
      answers: [
        { text: "Yes. There are 3 pending lawsuits, all employment-related.", status: "draft", at: "2026-10-01" },
        { text: "Yes. There are 3 pending lawsuits: two employment matters and one commercial dispute.", status: "sent", at: "2026-10-03" },
      ],
    },
    {
      id: "Q-002", buyerId: "B2", category: "litigation",
      question: "Does the target have any active litigation exposure?",
      answers: [
        { text: "No. All 2 lawsuits from 2024 were settled and dismissed; there are no pending lawsuits against the target.", status: "sent", at: "2026-10-05" },
      ],
    },
    {
      id: "Q-003", buyerId: "B1", category: "customers",
      question: "How many customers does the target have?",
      answers: [
        { text: "The target serves 1,200 active customers across 14 locations.", status: "sent", at: "2026-10-04" },
      ],
    },
    {
      id: "Q-004", buyerId: "B3", category: "customers",
      question: "What is the customer base?",
      answers: [
        { text: "Approximately 950 active customers as of the latest quarter.", status: "sent", at: "2026-10-06" },
      ],
    },
    {
      id: "Q-005", buyerId: "B2", category: "financials",
      question: "What was 2025 revenue growth?",
      answers: [
        { text: "Revenue grew 12% in 2025.", status: "sent", at: "2026-10-02" },
        { text: "Revenue grew 12% in 2025, but EBITDA declined 4% year over year.", status: "draft", at: "2026-10-20" },
      ],
    },
    {
      id: "Q-006", buyerId: "B1", category: "financials",
      question: "How did profitability trend in 2025?",
      answers: [
        { text: "EBITDA increased 4% year over year in 2025.", status: "sent", at: "2026-10-08" },
      ],
    },
    {
      id: "Q-007", buyerId: "B2", category: "ip",
      question: "Is the IP exclusively licensed?",
      answers: [],
    },
    {
      id: "Q-008", buyerId: "B3", category: "ip",
      question: "Are any licenses exclusive?",
      answers: [
        { text: "The core patent portfolio is licensed exclusively to Meridian Manufacturing.", status: "sent", at: "2026-10-09" },
        { text: "The core patent portfolio is licensed exclusively to Meridian Manufacturing; two trademarks are non-exclusive.", status: "draft", at: "2026-10-22" },
      ],
    },
  ],
};
