export default {
  "asOf": "2026-11-07",
  "profile": {
    "company": "Northwind Robotics, Inc. (fictional)",
    "jurisdictions": ["US-FED", "US-CA", "US-NY"],
    "coreTopics": ["privacy", "ai"],
    "relatedTopics": ["employment"]
  },
  "rubric": {
    "version": "2026.11",
    "maxScore": 100,
    "factors": [
      { "id": "jurisdiction", "label": "Operating jurisdiction", "points": { "exact": 30, "adjacent": 15, "other": 0 } },
      { "id": "topic", "label": "Topic relevance", "points": { "core": 25, "related": 12, "other": 0 } },
      { "id": "proximity", "label": "Time to effective date", "points": { "other": 0 },
        "thresholds": [
          { "withinDays": 90, "points": 25 },
          { "withinDays": 180, "points": 15 },
          { "withinDays": 365, "points": 8 }
        ] },
      { "id": "status", "label": "Rulemaking status", "points": { "effective": 20, "final": 15, "proposed": 8, "rumored": 0, "other": 0 } }
    ],
    "topicTaxonomy": {
      "privacy": ["privacy", "data protection", "ccpa", "gdpr", "data broker", "biometric"],
      "ai": ["artificial intelligence", " ai act", "automated decision", "generative ai", "foundation model"],
      "employment": ["employment", "workplace", "wage", "pay transparency"],
      "security": ["cybersecurity", "breach notification", "incident reporting"]
    }
  },
  "previousFeed": [
    {
      "id": "ca-ccpa-amend",
      "title": "CCPA Amendment: Children's Data Opt-In",
      "jurisdiction": "California",
      "status": "proposed",
      "effectiveDate": "2027-06-30",
      "publishedDate": "2026-08-12",
      "summary": "Requires opt-in consent before processing minors' personal information; drafted under the CCPA (California Consumer Privacy Act, fictional amendment).",
      "source": "CA Privacy Agency tracker",
      "link": "https://example.gov/ca-ccpa-amend"
    },
    {
      "id": "us-fcc-ai-disclosure",
      "title": "FCC AI Voice Disclosure in Outreach Calls",
      "jurisdiction": "US-FED",
      "status": "proposed",
      "effectiveDate": null,
      "publishedDate": "2026-09-02",
      "summary": "Proposed disclosure banner for AI-generated voice in commercial outreach calls.",
      "source": "Federal-register-like feed (fictional)",
      "link": "https://example.gov/fcc-ai-voice"
    },
    {
      "id": "ny-pay-transparency",
      "title": "NY Wage Transparency for Remote Roles",
      "jurisdiction": "New York",
      "status": "final",
      "effectiveDate": "2026-09-17",
      "publishedDate": "2026-03-03",
      "summary": "Salary ranges must be posted for remote roles performed from New York.",
      "source": "NY DOL bulletin (fictional)",
      "link": "https://example.gov/ny-pay-transparency"
    },
    {
      "id": "eu-umbrella-2026",
      "title": "EU Umbrella Data Regulation 2026",
      "jurisdiction": "EU",
      "status": "rumored",
      "effectiveDate": null,
      "publishedDate": null,
      "summary": "Press-reported draft covering cross-border data flows; no official text published.",
      "source": "Trade press",
      "link": null
    }
  ],
  "currentFeed": [
    {
      "id": "ca-ccpa-amend",
      "title": "CCPA Amendment: Children's Data Opt-In",
      "jurisdiction": "California",
      "status": "final",
      "effectiveDate": "2027-01-01",
      "publishedDate": "2026-08-12",
      "summary": "Requires opt-in consent before processing minors' personal information; finalized with an earlier effective date.",
      "source": "CA Privacy Agency tracker",
      "link": "https://example.gov/ca-ccpa-amend"
    },
    {
      "id": "ca-ccpa-amend-dup",
      "title": "CCPA amendment: childrens data opt in",
      "jurisdiction": "CA",
      "status": "final",
      "effectiveDate": "2027-01-01",
      "publishedDate": null,
      "summary": "Same rule, surfaced by a second aggregator feed.",
      "source": "Aggregator B",
      "link": "https://example.org/b/ca-ccpa"
    },
    {
      "id": "us-fcc-ai-disclosure",
      "title": "FCC AI Voice Disclosure in Outreach Calls",
      "jurisdiction": "US-FED",
      "status": "final",
      "effectiveDate": "2027-02-15",
      "publishedDate": "2026-09-02",
      "summary": "Disclosure banner for AI-generated voice in commercial outreach calls; final rule text published.",
      "source": "Federal-register-like feed (fictional)",
      "link": "https://example.gov/fcc-ai-voice"
    },
    {
      "id": "ny-pay-transparency",
      "jurisdiction": "New York",
      "title": "NY Wage Transparency for Remote Roles",
      "status": "effective",
      "effectiveDate": "2026-09-17",
      "publishedDate": "2026-03-03",
      "summary": "Salary ranges must be posted for remote roles performed from New York.",
      "source": "NY DOL bulletin (fictional)",
      "link": "https://example.gov/ny-pay-transparency"
    },
    {
      "id": "eu-umbrella-2026",
      "title": "EU Umbrella Data Regulation 2026",
      "jurisdiction": "EU",
      "status": "proposed",
      "effectiveDate": "2028-03-01",
      "publishedDate": "2026-10-28",
      "summary": "Official proposal published: cross-border data-flow licensing with a 15-month runway.",
      "source": "EUR-Lex-like feed (fictional)",
      "link": "https://example.eu/umbrella-2026"
    },
    {
      "id": "tx-biometric-retention",
      "title": "Texas Biometric Retention Schedule",
      "jurisdiction": "Texas",
      "status": "proposed",
      "effectiveDate": "2027-04-01",
      "publishedDate": "2026-10-30",
      "summary": "Proposed 12-month retention cap for biometric identifiers used in workplace access systems.",
      "source": "Texas register feed (fictional)",
      "link": "https://example.gov/tx-biometric"
    }
  ]
}

