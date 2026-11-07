# Record clearance tracker — California (example ruleset)

As of **2026-11-07** · ruleset CA v2026-11-example

## Dismissal petition (record clearance) — Forgery (fictional) (V1) · READY_TO_FILE

- [x] Probation completed or terminated — probationStatus = completed `CA-CR1`
- [x] All fines, fees, and restitution paid — finesPaid = true `CA-CR1`
- [x] No pending criminal cases — pendingCases = false `CA-CR1`
- [x] Offense not excluded from relief — category/class not in exclusion list `CA-CR1`
- Earliest filing: **2020-08-21**

## Dismissal petition (record clearance) — Shoplifting (fictional) (V2) · FILED

- [x] Probation completed or terminated — probationStatus = completed `CA-CR1`
- [x] All fines, fees, and restitution paid — finesPaid = true `CA-CR1`
- [x] No pending criminal cases — pendingCases = false `CA-CR1`
- [x] Offense not excluded from relief — category/class not in exclusion list `CA-CR1`
- Earliest filing: **2017-06-30**
- Filed 2026-09-15 — status: **filed**

## Certificate of Rehabilitation — Forgery (fictional) (V1) · WAITING

- [x] Probation completed — probationStatus = completed `CA-CR2`
- [x] All court-ordered payments satisfied — finesPaid = true `CA-CR2`
- [x] No pending cases — pendingCases = false `CA-CR2`
- [x] Offense not categorically excluded — category/class not in exclusion list `CA-CR2`
- [ ] 7 years since completion of sentence — 7 years from 2020-08-21; satisfied 2027-08-21 `CA-CR2`
- Earliest filing: **2027-08-21**
- Referral: Certificate filings require live-scan and court appearance — refer to counsel or legal aid clinic.

## Certificate of Rehabilitation — Shoplifting (fictional) (V2) · READY_TO_FILE

- [x] Probation completed — probationStatus = completed `CA-CR2`
- [x] All court-ordered payments satisfied — finesPaid = true `CA-CR2`
- [x] No pending cases — pendingCases = false `CA-CR2`
- [x] Offense not categorically excluded — category/class not in exclusion list `CA-CR2`
- [x] 7 years since completion of sentence — 7 years from 2017-02-10; satisfied 2024-02-10 `CA-CR2`
- Earliest filing: **2024-02-10**
- Referral: Certificate filings require live-scan and court appearance — refer to counsel or legal aid clinic.

## Governor's pardon (application) — Forgery (fictional) (V1) · WAITING

- [x] No pending cases — pendingCases = false `CA-CR3`
- [ ] 10 years since sentence completion — 10 years from 2020-08-21; satisfied 2030-08-21 `CA-CR3`
- [x] Certified rap sheet obtained for the application — rapSheetObtained = true `CA-CR3`
- Earliest filing: **2030-08-21**
- Referral: Pardon applications route through the governor's office — refer to counsel.

## Governor's pardon (application) — Shoplifting (fictional) (V2) · WAITING

- [x] No pending cases — pendingCases = false `CA-CR3`
- [ ] 10 years since sentence completion — 10 years from 2017-02-10; satisfied 2027-02-10 `CA-CR3`
- [x] Certified rap sheet obtained for the application — rapSheetObtained = true `CA-CR3`
- Earliest filing: **2027-02-10**
- Referral: Pardon applications route through the governor's office — refer to counsel.

## Referral flags (4)
- CA-cert-rehab for V1: Certificate filings require live-scan and court appearance — refer to counsel or legal aid clinic.
- CA-cert-rehab for V2: Certificate filings require live-scan and court appearance — refer to counsel or legal aid clinic.
- CA-governor-pardon for V1: Pardon applications route through the governor's office — refer to counsel.
- CA-governor-pardon for V2: Pardon applications route through the governor's office — refer to counsel.

---
> ⚠️ Example rulesets only. Prerequisites marked unknown need court records before any determination; verify everything with counsel or a legal aid clinic before filing.
