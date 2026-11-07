### 1. “My landlord taped a notice to quit on my door and I'm three weeks behind on rent after my hours got cut.”

- Classified: **Eviction / loss of housing** (housing-eviction, confidence 1)
- Referral: `legal-aid-housing`

### 2. “There is black mold in the bathroom and no heat since October; the landlord ignores my repair requests.”

- Classified: **Repairs / unhealthy housing conditions** (housing-conditions, confidence 0.714)
- Referral: `legal-aid-housing`

### 3. “They denied my food stamps and said I have an overpayment I don't understand.”

- Classified: **Public benefits denied or cut off** (benefits-denial, confidence 1)
- Referral: `legal-aid-benefits`

### 4. “A debt collector is suing me over an old credit card and threatened wage garnishment.”

- Classified: **Debt collection / credit** (consumer-debt, confidence 1)
- Referral: `legal-aid-consumer`

### 5. “My partner hit me and I'm scared; I think I need a restraining order.”

- Classified: **Domestic violence / safety** (domestic-violence, confidence 1)
- Referral: `legal-aid-dv`

### 6. “I wasn't paid for six weeks of overtime at my last job.”

- Classified: **Wage theft / job problems** (employment-wage, confidence 1)
- Referral: `legal-aid-employment`

### 7. “I want to get my criminal record expunged so background checks stop killing my applications.”

- Classified: **Record sealing / expungement** (record-clearance, confidence 1)
- Referral: `legal-aid-record-clearance`

### 8. “My neighbor's tree fell into my yard and now the HOA is fining me over the fence.”

- **ESCALATED to human review** (no-keyword-match)

### 9. “The city reassessed my property taxes and I think the formula is wrong.”

- **ESCALATED to human review** (no-keyword-match)

---

# Triage — Eviction / loss of housing

Confidence: **1** (gate 0.4) · matched keywords: notice to quit, landlord, behind on rent

## Referral — Eviction / loss of housing

- Legal aid category: `legal-aid-housing` (confidence 1)
- Eviction defense and housing stability help through your local legal aid housing unit.
- Your nearest legal aid office or court self-help center; bring any court papers you received.

> This tool provides referral information only. It does not provide legal advice, does not evaluate the merits of any claim, and is not a substitute for a licensed attorney.

---

# Triage — Repairs / unhealthy housing conditions

Confidence: **0.714** (gate 0.4) · matched keywords: mold, no heat

## Referral — Repairs / unhealthy housing conditions

- Legal aid category: `legal-aid-housing` (confidence 0.714)
- Housing conditions enforcement help through your local legal aid housing unit.
- Your nearest legal aid office; bring photos, repair requests, and correspondence with the landlord.

> This tool provides referral information only. It does not provide legal advice, does not evaluate the merits of any claim, and is not a substitute for a licensed attorney.

---

# Triage — Public benefits denied or cut off

Confidence: **1** (gate 0.4) · matched keywords: food stamps, denied, overpayment

## Referral — Public benefits denied or cut off

- Legal aid category: `legal-aid-benefits` (confidence 1)
- Benefits appeals help (fair hearings) through your local legal aid public benefits unit.
- Your nearest legal aid office; bring the denial or overpayment notice and any deadlines listed on it.

> This tool provides referral information only. It does not provide legal advice, does not evaluate the merits of any claim, and is not a substitute for a licensed attorney.

---

# Triage — Debt collection / credit

Confidence: **1** (gate 0.4) · matched keywords: debt collector, wage garnishment

## Referral — Debt collection / credit

- Legal aid category: `legal-aid-consumer` (confidence 1)
- Consumer debt defense help through your local legal aid consumer unit.
- Your nearest legal aid office; bring the collection letters or lawsuit papers.

> This tool provides referral information only. It does not provide legal advice, does not evaluate the merits of any claim, and is not a substitute for a licensed attorney.

---

# Triage — Domestic violence / safety

Confidence: **1** (gate 0.4) · matched keywords: restraining order, hit me

## Referral — Domestic violence / safety

- Legal aid category: `legal-aid-dv` (confidence 1)
- Safety planning and protective-order help through a domestic violence advocacy program.
- A DV advocacy hotline or legal aid DV unit; if you are in immediate danger call emergency services first.

> This tool provides referral information only. It does not provide legal advice, does not evaluate the merits of any claim, and is not a substitute for a licensed attorney.

---

# Triage — Wage theft / job problems

Confidence: **1** (gate 0.4) · matched keywords: overtime

## Referral — Wage theft / job problems

- Legal aid category: `legal-aid-employment` (confidence 1)
- Wage claim and employment help through your local legal aid workers’ rights unit.
- Your nearest legal aid office; bring pay stubs, schedules, and any termination notice.

> This tool provides referral information only. It does not provide legal advice, does not evaluate the merits of any claim, and is not a substitute for a licensed attorney.

---

# Triage — Record sealing / expungement

Confidence: **1** (gate 0.4) · matched keywords: criminal record, background check

## Referral — Record sealing / expungement

- Legal aid category: `legal-aid-record-clearance` (confidence 1)
- Record sealing/expungement screening through a legal aid reentry clinic.
- Your nearest legal aid reentry clinic; bring your RAP sheet if you have one.

> This tool provides referral information only. It does not provide legal advice, does not evaluate the merits of any claim, and is not a substitute for a licensed attorney.

---

# Triage — ESCALATE (no-keyword-match)

We could not confidently classify this description. A staff member will review it and follow up — no automated categorization was applied.

> This tool provides referral information only. It does not provide legal advice, does not evaluate the merits of any claim, and is not a substitute for a licensed attorney.

---

# Triage — ESCALATE (no-keyword-match)

We could not confidently classify this description. A staff member will review it and follow up — no automated categorization was applied.

> This tool provides referral information only. It does not provide legal advice, does not evaluate the merits of any claim, and is not a substitute for a licensed attorney.
