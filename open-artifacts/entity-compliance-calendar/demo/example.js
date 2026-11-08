export default {
  "asOf": "2026-11-07",
  "company": "Northwind Robotics group (fictional)",
  "soonDays": 45,
  "entities": [
    {
      "id": "E-1",
      "name": "Northwind Robotics, Inc.",
      "jurisdiction": "US-DE",
      "type": "corp",
      "formedOn": "2020-03-15",
      "status": "active",
      "goodStandingConfirmedOn": "2026-10-15",
      "qualifications": [
        {
          "jurisdiction": "US-CA",
          "qualifiedOn": "2022-08-01"
        }
      ],
      "footprint": [
        "US-CA"
      ]
    },
    {
      "id": "E-2",
      "name": "Northwind Robotics California, Inc.",
      "jurisdiction": "US-CA",
      "type": "corp",
      "formedOn": "2021-06-01",
      "status": "active",
      "goodStandingConfirmedOn": "2024-11-01"
    },
    {
      "id": "E-3",
      "name": "Northwind Robotics NY LLC",
      "jurisdiction": "US-NY",
      "type": "llc",
      "formedOn": "2019-07-01",
      "status": "active",
      "goodStandingConfirmedOn": "2026-08-01"
    },
    {
      "id": "E-4",
      "name": "Northwind Robotics Texas LLC",
      "jurisdiction": "US-TX",
      "type": "llc",
      "formedOn": "2026-06-01",
      "status": "active",
      "footprint": [
        "US-WA"
      ]
    },
    {
      "id": "E-5",
      "name": "Gale Force Labs, Inc. (dormant sub)",
      "jurisdiction": "US-DE",
      "type": "corp",
      "formedOn": "2018-09-10",
      "status": "dissolved"
    },
    {
      "id": "E-6",
      "name": "Petrel Systems, Inc.",
      "jurisdiction": "US-DE",
      "type": "corp",
      "formedOn": "2018-03-01",
      "status": "dormant",
      "dormantSince": "2019-04-01",
      "goodStandingConfirmedOn": "2026-06-01"
    },
    {
      "id": "E-7",
      "name": "Kestrel Labs LLC",
      "jurisdiction": "US-CA",
      "type": "llc",
      "formedOn": null,
      "status": "active",
      "goodStandingConfirmedOn": "2026-10-01"
    }
  ],
  "obligations": [
    {
      "id": "de-franchise",
      "name": "DE franchise tax",
      "jurisdiction": "US-DE",
      "entityTypes": [
        "corp"
      ],
      "recurring": "annual",
      "anchor": "formationAnniversary",
      "statuteCite": "fictional 8 Del. C. § 391-analog",
      "effectiveFrom": "2020-01-01",
      "verifiedOn": "2025-06-01"
    },
    {
      "id": "ca-sos-biennial",
      "name": "CA statement of information",
      "jurisdiction": "US-CA",
      "entityTypes": [
        "corp",
        "llc"
      ],
      "recurring": "biennial",
      "anchor": "formationAnniversary",
      "statuteCite": "fictional Cal. Corp. Code § 6210-analog",
      "effectiveFrom": "2021-01-01",
      "verifiedOn": "2026-09-15"
    },
    {
      "id": "ny-annual-report",
      "name": "NY biennial statement",
      "jurisdiction": "US-NY",
      "entityTypes": [
        "corp",
        "llc"
      ],
      "recurring": "biennial",
      "anchor": "calendarFixed",
      "dueMonth": 4,
      "dueDay": 15,
      "statuteCite": "fictional NY LLC Law § 301-analog",
      "effectiveFrom": "2019-01-01",
      "verifiedOn": "2026-08-20"
    },
    {
      "id": "tx-initial-report",
      "name": "TX initial information report",
      "jurisdiction": "US-TX",
      "entityTypes": [
        "corp",
        "llc"
      ],
      "recurring": "event",
      "anchor": "formation",
      "dueWithinDays": 90,
      "statuteCite": "fictional Tex. Bus. Orgs. Code § 5.257-analog",
      "effectiveFrom": "2024-01-01",
      "verifiedOn": "2026-10-01"
    },
    {
      "id": "de-registered-agent",
      "name": "DE registered agent renewal",
      "jurisdiction": "US-DE",
      "entityTypes": [
        "corp",
        "llc"
      ],
      "recurring": "annual",
      "anchor": "calendarFixed",
      "dueMonth": 6,
      "dueDay": 1,
      "statuteCite": "fictional 8 Del. C. § 132-analog",
      "effectiveFrom": "2020-01-01",
      "verifiedOn": "2026-07-10"
    }
  ],
  "filings": [
    {
      "entityId": "E-1",
      "obligationId": "de-franchise",
      "period": 2020,
      "filedOn": "2020-03-10",
      "fee": 400
    },
    {
      "entityId": "E-1",
      "obligationId": "de-franchise",
      "period": 2021,
      "filedOn": "2021-03-08",
      "fee": 400
    },
    {
      "entityId": "E-1",
      "obligationId": "de-franchise",
      "period": 2022,
      "filedOn": "2022-03-12",
      "fee": 400
    },
    {
      "entityId": "E-1",
      "obligationId": "de-franchise",
      "period": 2023,
      "filedOn": "2023-03-09",
      "fee": 400
    },
    {
      "entityId": "E-1",
      "obligationId": "de-franchise",
      "period": 2024,
      "filedOn": "2024-03-11",
      "fee": 400
    },
    {
      "entityId": "E-1",
      "obligationId": "de-franchise",
      "period": 2025,
      "filedOn": "2025-03-10",
      "fee": 400
    },
    {
      "entityId": "E-1",
      "obligationId": "de-franchise",
      "period": 2026,
      "filedOn": "2026-03-09",
      "fee": 400
    },
    {
      "entityId": "E-1",
      "obligationId": "de-registered-agent",
      "period": 2020,
      "filedOn": "2020-05-30",
      "fee": 120
    },
    {
      "entityId": "E-1",
      "obligationId": "de-registered-agent",
      "period": 2021,
      "filedOn": "2021-05-27",
      "fee": 120
    },
    {
      "entityId": "E-1",
      "obligationId": "de-registered-agent",
      "period": 2022,
      "filedOn": "2022-06-01",
      "fee": 120
    },
    {
      "entityId": "E-1",
      "obligationId": "de-registered-agent",
      "period": 2023,
      "filedOn": "2023-05-25",
      "fee": 120
    },
    {
      "entityId": "E-1",
      "obligationId": "de-registered-agent",
      "period": 2024,
      "filedOn": "2024-05-30",
      "fee": 120
    },
    {
      "entityId": "E-1",
      "obligationId": "de-registered-agent",
      "period": 2025,
      "filedOn": "2025-05-29",
      "fee": 120
    },
    {
      "entityId": "E-1",
      "obligationId": "de-registered-agent",
      "period": 2026,
      "filedOn": "2026-05-28",
      "fee": 120
    },
    {
      "entityId": "E-1",
      "obligationId": "ca-sos-biennial",
      "period": 2022,
      "filedOn": "2022-08-05",
      "fee": 20
    },
    {
      "entityId": "E-1",
      "obligationId": "ca-sos-biennial",
      "period": 2024,
      "filedOn": "2024-08-02",
      "fee": 20
    },
    {
      "entityId": "E-2",
      "obligationId": "ca-sos-biennial",
      "period": 2021,
      "filedOn": "2021-06-15",
      "fee": 20
    },
    {
      "entityId": "E-2",
      "obligationId": "ca-sos-biennial",
      "period": 2023,
      "filedOn": "2023-06-20",
      "fee": 20
    },
    {
      "entityId": "E-3",
      "obligationId": "ny-annual-report",
      "period": 2019,
      "filedOn": "2019-07-30",
      "fee": 9
    },
    {
      "entityId": "E-4",
      "obligationId": "tx-initial-report",
      "period": "once",
      "filedOn": "2026-07-15",
      "fee": 30
    }
  ]
};
