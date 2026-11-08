# Regulatory horizon scan — worked example (as of 2026-11-07)

Company profile: **Northwind Robotics, Inc. (fictional)** · jurisdictions US-FED, US-CA, US-NY, UK · rubric `2026.11`

## Ranked scan (deduped feed)

| # | Rule | Juris | Topic | Type | Status | Effective | Comments close | Score | Band |
|---|---|---|---|---|---|---|---|---|---|
| 1 | CCPA Amendment: Children's Data Opt-In | US-CA | privacy | rule | final | 2027-01-01 | — | **95** | high |
| 2 | FCC AI Voice Disclosure in Outreach Calls | US-FED | ai | rule | final | 2027-02-15 | — | **85** | high |
| 3 | SEC ANPR: Artificial Intelligence Model Risk | US-FED | ai | ANPR | proposed | — | 2026-12-01 | **78** | medium (capped) |
| 4 | Texas Biometric Retention Schedule | US-TX | privacy | NPRM | proposed | 2027-04-01 | 2026-11-25 | **78** | high |
| 5 | NY Wage Transparency for Remote Roles | US-NY | employment | rule | effective | 2026-09-17 | — | **62** | medium |
| 6 | EU Umbrella Data Regulation 2026 | EU | other | rule | proposed | 2028-03-01 | — | **8** | low |

Deduped 1 duplicate entry: `ca-ccpa-amend-dup` → merged into `ca-ccpa-amend` (same normalized title + jurisdiction)

## Coverage check (Step 0)

- **[high]** jurisdiction UK — profile jurisdiction has zero feed items
- **[low]** topic security — related topic has zero feed items

## Score transparency (rubric breakdown for the top item)

- **jurisdiction** +30 — exact profile jurisdiction match _(US-CA)_
- **topic** +25 — core topic _(topic=privacy via "ccpa")_
- **proximity** +25 — effective in 55d (<= 90d threshold) _(2027-01-01 (+55d))_
- **commentWindow** +0 — no comment deadline _(none)_
- **status** +15 — status="final" _(final)_

## Timeline (upcoming milestones, then past and undated)

- 2026-11-25 · comment-deadline · score 78 · Texas Biometric Retention Schedule (US-TX)
- 2026-12-01 · comment-deadline · score 78 · SEC ANPR: Artificial Intelligence Model Risk (US-FED)
- 2027-01-01 · effective · score 95 · CCPA Amendment: Children's Data Opt-In (US-CA)
- 2027-02-15 · effective · score 85 · FCC AI Voice Disclosure in Outreach Calls (US-FED)
- 2027-04-01 · effective · score 78 · Texas Biometric Retention Schedule (US-TX)
- 2028-03-01 · effective · score 8 · EU Umbrella Data Regulation 2026 (EU)

_Past:_

- 2026-09-17 · effective · score 62 · NY Wage Transparency for Remote Roles (US-NY)

## Diff since previous snapshot

**Added:** ca-ccpa-amend-dup, tx-biometric-retention, us-sec-ai-anpr

**Removed:** none

**Changed:**
- `ca-ccpa-amend` status: `proposed` → `final`
- `ca-ccpa-amend` effectiveDate: `2027-06-30` → `2027-01-01`
- `ca-ccpa-amend` commentDeadline: `2026-09-30` → `null`
- `ca-ccpa-amend` summary: `Requires opt-in consent before processing minors' personal information; drafted under the CCPA (California Consumer Privacy Act, fictional amendment).` → `Requires opt-in consent before processing minors' personal information; finalized with an earlier effective date.`
- `us-fcc-ai-disclosure` status: `proposed` → `final`
- `us-fcc-ai-disclosure` effectiveDate: `null` → `2027-02-15`
- `us-fcc-ai-disclosure` commentDeadline: `2026-10-15` → `null`
- `us-fcc-ai-disclosure` summary: `Proposed disclosure banner for AI-generated voice in commercial outreach calls.` → `Disclosure banner for AI-generated voice in commercial outreach calls; final rule text published.`
- `ny-pay-transparency` status: `final` → `effective`
- `eu-umbrella-2026` status: `rumored` → `proposed`
- `eu-umbrella-2026` effectiveDate: `null` → `2028-03-01`
- `eu-umbrella-2026` provenance: `secondary` → `primary`
- `eu-umbrella-2026` publishedDate: `null` → `2026-10-28`
- `eu-umbrella-2026` summary: `Press-reported draft covering cross-border data flows; no official text published.` → `Official proposal published: cross-border data-flow licensing with a 15-month runway.`
- `eu-umbrella-2026` link: `null` → `https://example.eu/umbrella-2026`

## Rubric diff (2026.11 → 2026.11-r2)

- `version`: "2026.11" → "2026.11-r2"
- `factors.status.points.proposed`: 8 → 10

The full digest export (`digest.md`) carries the bottom line, coverage gaps, and a per-item breakdown — see `toMarkdown(scan)`.

_All data fictional. Not legal advice._
