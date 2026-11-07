# Regulatory horizon scan — worked example (as of 2026-11-07)

Company profile: **Northwind Robotics, Inc. (fictional)** · jurisdictions US-FED, US-CA, US-NY · rubric `2026.11`

## Ranked scan (deduped feed)

| # | Rule | Juris | Topic | Status | Effective | Score | Band |
|---|---|---|---|---|---|---|---|
| 1 | CCPA Amendment: Children's Data Opt-In | US-CA | privacy | final | 2027-01-01 | **95** | high |
| 2 | Texas Biometric Retention Schedule | US-TX | privacy | proposed | 2027-04-01 | **78** | high |
| 3 | NY Wage Transparency for Remote Roles | US-NY | employment | effective | 2026-09-17 | **62** | medium |
| 4 | FCC AI Voice Disclosure in Outreach Calls | US-FED | other | final | 2027-02-15 | **60** | medium |
| 5 | EU Umbrella Data Regulation 2026 | EU | other | proposed | 2028-03-01 | **8** | low |

Deduped 1 duplicate entry: `ca-ccpa-amend-dup` → kept `ca-ccpa-amend` (same normalized title + jurisdiction)

## Score transparency (rubric breakdown for the top item)

- **jurisdiction** +30 — exact profile jurisdiction match _(US-CA)_
- **topic** +25 — core topic _(topic=privacy via "ccpa")_
- **proximity** +25 — effective in 55d (<= 90d threshold) _(2027-01-01 (+55d))_
- **status** +15 — status="final" _(final)_

## Timeline (by effective date)

- 2026-09-17 · score 62 · NY Wage Transparency for Remote Roles (US-NY)
- 2027-01-01 · score 95 · CCPA Amendment: Children's Data Opt-In (US-CA)
- 2027-02-15 · score 60 · FCC AI Voice Disclosure in Outreach Calls (US-FED)
- 2027-04-01 · score 78 · Texas Biometric Retention Schedule (US-TX)
- 2028-03-01 · score 8 · EU Umbrella Data Regulation 2026 (EU)

## Diff since previous snapshot

**Added:** ca-ccpa-amend-dup, tx-biometric-retention

**Removed:** none

**Changed:**
- `ca-ccpa-amend` status: `proposed` → `final`
- `ca-ccpa-amend` effectiveDate: `2027-06-30` → `2027-01-01`
- `ca-ccpa-amend` summary: `Requires opt-in consent before processing minors' personal information; drafted under the CCPA (California Consumer Privacy Act, fictional amendment).` → `Requires opt-in consent before processing minors' personal information; finalized with an earlier effective date.`
- `us-fcc-ai-disclosure` status: `proposed` → `final`
- `us-fcc-ai-disclosure` effectiveDate: `null` → `2027-02-15`
- `us-fcc-ai-disclosure` summary: `Proposed disclosure banner for AI-generated voice in commercial outreach calls.` → `Disclosure banner for AI-generated voice in commercial outreach calls; final rule text published.`
- `ny-pay-transparency` status: `final` → `effective`
- `eu-umbrella-2026` status: `rumored` → `proposed`
- `eu-umbrella-2026` effectiveDate: `null` → `2028-03-01`
- `eu-umbrella-2026` publishedDate: `null` → `2026-10-28`
- `eu-umbrella-2026` summary: `Press-reported draft covering cross-border data flows; no official text published.` → `Official proposal published: cross-border data-flow licensing with a 15-month runway.`
- `eu-umbrella-2026` link: `null` → `https://example.eu/umbrella-2026`

## Rubric diff (2026.11 → 2026.11-r2)

- `version`: "2026.11" → "2026.11-r2"
- `factors.status.points.proposed`: 8 → 10

_All data fictional. Not legal advice._
