# Record clearance tracker — California (example ruleset)

As of **2026-11-07** · ruleset CA v2026-11-example

## Dismissal petition (record clearance) — Forgery (fictional) (V1) · READY_TO_FILE

- [x] Probation completed or terminated — probationStatus = completed `CA-CR1`
- [x] All fines, fees, and restitution paid — finesPaid = true `CA-CR1`
- [x] No pending criminal cases — pendingCases = false `CA-CR1`
- [x] Offense not excluded from relief — category/class not in exclusion list `CA-CR1`
- Earliest filing: **2020-08-21**
- Forms: Dismissal petition (illustrative form name — verify locally) · Declaration in support (illustrative)
  1. Obtain a certified copy of the rap sheet (illustrative step — verify locally).
  2. Complete the dismissal petition for each conviction and attach disposition documents.
  3. File at the court of conviction and serve the prosecuting attorney.
  4. Comply with any local notice-to-probation requirement before the hearing.
- Fee waiver: A fee-waiver application is available from the clerk on request (illustrative — verify locally).
- Authority: Cal. Penal Code § 1203.4 (dismissal) — illustrative [verify] — https://selfhelp.courts.ca.gov/record-clearance

## Dismissal petition (record clearance) — Shoplifting (fictional) (V2) · FILED

- [x] Probation completed or terminated — probationStatus = completed `CA-CR1`
- [x] All fines, fees, and restitution paid — finesPaid = true `CA-CR1`
- [x] No pending criminal cases — pendingCases = false `CA-CR1`
- [x] Offense not excluded from relief — category/class not in exclusion list `CA-CR1`
- Earliest filing: **2017-06-30**
- Forms: Dismissal petition (illustrative form name — verify locally) · Declaration in support (illustrative)
  1. Obtain a certified copy of the rap sheet (illustrative step — verify locally).
  2. Complete the dismissal petition for each conviction and attach disposition documents.
  3. File at the court of conviction and serve the prosecuting attorney.
  4. Comply with any local notice-to-probation requirement before the hearing.
- Fee waiver: A fee-waiver application is available from the clerk on request (illustrative — verify locally).
- Authority: Cal. Penal Code § 1203.4 (dismissal) — illustrative [verify] — https://selfhelp.courts.ca.gov/record-clearance
- Filed 2026-09-15 — status: **filed**

## Certificate of Rehabilitation — Forgery (fictional) (V1) · WAITING

- [x] Probation completed — probationStatus = completed `CA-CR2`
- [x] All court-ordered payments satisfied — finesPaid = true `CA-CR2`
- [x] No pending cases — pendingCases = false `CA-CR2`
- [x] Offense not categorically excluded — category/class not in exclusion list `CA-CR2`
- [ ] 7 years since completion of sentence — 7 years from 2020-08-21; satisfied 2027-08-21 `CA-CR2`
- Earliest filing: **2027-08-21**
- Forms: Certificate of Rehabilitation petition (illustrative — verify locally) · Live-scan receipt (illustrative)
  1. Obtain a certified rap sheet and live-scan fingerprinting receipt (illustrative).
  2. Assemble the rehabilitation declaration and supporting letters.
  3. File the petition in the county of residence and serve as the court directs.
  4. Attend the hearing with counsel or the legal aid clinic.
- Fee waiver: A fee-waiver request may accompany the petition (illustrative — verify locally).
- Authority: Cal. Penal Code § 4852.17 (certificate of rehabilitation) — illustrative [verify] — https://selfhelp.courts.ca.gov/record-clearance
- Referral: Certificate filings require live-scan and court appearance — refer to counsel or legal aid clinic.

## Certificate of Rehabilitation — Shoplifting (fictional) (V2) · READY_TO_FILE

- [x] Probation completed — probationStatus = completed `CA-CR2`
- [x] All court-ordered payments satisfied — finesPaid = true `CA-CR2`
- [x] No pending cases — pendingCases = false `CA-CR2`
- [x] Offense not categorically excluded — category/class not in exclusion list `CA-CR2`
- [x] 7 years since completion of sentence — 7 years from 2017-02-10; satisfied 2024-02-10 `CA-CR2`
- Earliest filing: **2024-02-10**
- Forms: Certificate of Rehabilitation petition (illustrative — verify locally) · Live-scan receipt (illustrative)
  1. Obtain a certified rap sheet and live-scan fingerprinting receipt (illustrative).
  2. Assemble the rehabilitation declaration and supporting letters.
  3. File the petition in the county of residence and serve as the court directs.
  4. Attend the hearing with counsel or the legal aid clinic.
- Fee waiver: A fee-waiver request may accompany the petition (illustrative — verify locally).
- Authority: Cal. Penal Code § 4852.17 (certificate of rehabilitation) — illustrative [verify] — https://selfhelp.courts.ca.gov/record-clearance
- Referral: Certificate filings require live-scan and court appearance — refer to counsel or legal aid clinic.

## Governor's pardon (application) — Forgery (fictional) (V1) · WAITING

- [x] No pending cases — pendingCases = false `CA-CR3`
- [ ] 10 years since sentence completion — 10 years from 2020-08-21; satisfied 2030-08-21 `CA-CR3`
- [x] Certified rap sheet obtained for the application — rapSheetObtained = true `CA-CR3`
- Earliest filing: **2030-08-21**
- Forms: Governor's pardon application (illustrative — verify locally) · Letters of support (illustrative)
  1. Obtain the certified rap sheet and court records for every conviction (illustrative).
  2. Prepare the application narrative and letters of support.
  3. Submit through the governor's office portal or by mail (illustrative).
  4. Coordinate with counsel before submission.
- Fee waiver: No filing fee is charged for pardon applications in this example ruleset (illustrative — verify).
- Authority: Cal. Const. art. V § 8 (governor's pardon) — illustrative [verify] — https://www.gov.ca.gov/
- Referral: Pardon applications route through the governor's office — refer to counsel.

## Governor's pardon (application) — Shoplifting (fictional) (V2) · WAITING

- [x] No pending cases — pendingCases = false `CA-CR3`
- [ ] 10 years since sentence completion — 10 years from 2017-02-10; satisfied 2027-02-10 `CA-CR3`
- [x] Certified rap sheet obtained for the application — rapSheetObtained = true `CA-CR3`
- Earliest filing: **2027-02-10**
- Forms: Governor's pardon application (illustrative — verify locally) · Letters of support (illustrative)
  1. Obtain the certified rap sheet and court records for every conviction (illustrative).
  2. Prepare the application narrative and letters of support.
  3. Submit through the governor's office portal or by mail (illustrative).
  4. Coordinate with counsel before submission.
- Fee waiver: No filing fee is charged for pardon applications in this example ruleset (illustrative — verify).
- Authority: Cal. Const. art. V § 8 (governor's pardon) — illustrative [verify] — https://www.gov.ca.gov/
- Referral: Pardon applications route through the governor's office — refer to counsel.

## Referral flags (4)
- CA-cert-rehab for V1: Certificate filings require live-scan and court appearance — refer to counsel or legal aid clinic.
- CA-cert-rehab for V2: Certificate filings require live-scan and court appearance — refer to counsel or legal aid clinic.
- CA-governor-pardon for V1: Pardon applications route through the governor's office — refer to counsel.
- CA-governor-pardon for V2: Pardon applications route through the governor's office — refer to counsel.

---
> ⚠️ Example rulesets only. Prerequisites marked unknown need court records before any determination; verify everything with counsel or a legal aid clinic before filing.
