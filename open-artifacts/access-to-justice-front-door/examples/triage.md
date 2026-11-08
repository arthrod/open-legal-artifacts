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

urgency: routine

## Referral — Eviction / loss of housing

- Legal aid category: `legal-aid-housing` (confidence 1)
- Eviction defense and housing stability help through your local legal aid housing unit.
- Your nearest legal aid office or court self-help center; bring any court papers you received.
- Guidance: Bring every notice, summons, or letter you have received to your first appointment; deadlines printed on court papers are time-sensitive. (source: LawHelp.org — legal aid finder <https://www.lawhelp.org>)
- Guidance: Court self-help centers can explain what each paper means at no cost; intake staff can point you to the nearest one. (source: LawHelp.org — legal aid finder <https://www.lawhelp.org>)

> This tool provides referral information only. It does not provide legal advice, does not evaluate the merits of any claim, and is not a substitute for a licensed attorney.

---

# Triage — Repairs / unhealthy housing conditions

Confidence: **0.714** (gate 0.4) · matched keywords: mold, no heat

urgency: routine

## Referral — Repairs / unhealthy housing conditions

- Legal aid category: `legal-aid-housing` (confidence 0.714)
- Housing conditions enforcement help through your local legal aid housing unit.
- Your nearest legal aid office; bring photos, repair requests, and correspondence with the landlord.
- Guidance: Take photos of the problem and keep copies of repair requests; bring both to your appointment. (source: LawHelp.org — legal aid finder <https://www.lawhelp.org>)
- Guidance: Many localities have a housing code enforcement office that inspects on request; intake staff can identify yours. (source: U.S. HUD — housing resources <https://www.hud.gov>)

> This tool provides referral information only. It does not provide legal advice, does not evaluate the merits of any claim, and is not a substitute for a licensed attorney.

---

# Triage — Public benefits denied or cut off

Confidence: **1** (gate 0.4) · matched keywords: food stamps, denied, overpayment

urgency: routine

## Referral — Public benefits denied or cut off

- Legal aid category: `legal-aid-benefits` (confidence 1)
- Benefits appeals help (fair hearings) through your local legal aid public benefits unit.
- Your nearest legal aid office; bring the denial or overpayment notice and any deadlines listed on it.
- Guidance: Appeal deadlines are printed on the denial or overpayment notice; bring the notice to intake staff right away. (source: USA.gov — benefits page <https://www.usa.gov/benefits>)
- Guidance: A fair hearing can often be requested by phone or mail; the notice itself explains how. (source: USA.gov — benefits page <https://www.usa.gov/benefits>)

> This tool provides referral information only. It does not provide legal advice, does not evaluate the merits of any claim, and is not a substitute for a licensed attorney.

---

# Triage — Debt collection / credit

Confidence: **1** (gate 0.4) · matched keywords: debt collector, wage garnishment, garnishment

urgency: routine

## Referral — Debt collection / credit

- Legal aid category: `legal-aid-consumer` (confidence 1)
- Consumer debt defense help through your local legal aid consumer unit.
- Your nearest legal aid office; bring the collection letters or lawsuit papers.
- Guidance: Bring all collection letters, voicemails, and court papers to your appointment. (source: Consumer Financial Protection Bureau <https://www.consumerfinance.gov>)
- Guidance: Summons papers include a response deadline; bring them to intake staff the same week they arrive. (source: Consumer Financial Protection Bureau <https://www.consumerfinance.gov>)

> This tool provides referral information only. It does not provide legal advice, does not evaluate the merits of any claim, and is not a substitute for a licensed attorney.

---

# Triage — Domestic violence / safety

Confidence: **1** (gate 0.4) · matched keywords: restraining order, hit me

urgency: emergency

## Referral — Domestic violence / safety

- Legal aid category: `legal-aid-dv` (confidence 1)
- Safety planning and protective-order help through a domestic violence advocacy program.
- A DV advocacy hotline or legal aid DV unit; if you are in immediate danger call emergency services first.
- Guidance: If you are in immediate danger, call emergency services before anything else. (source: National Domestic Violence Hotline <https://www.thehotline.org>)
- Guidance: Safety planning with a trained advocate is free and confidential; advocates also help with protective-order paperwork. (source: National Domestic Violence Hotline <https://www.thehotline.org>)

> This tool provides referral information only. It does not provide legal advice, does not evaluate the merits of any claim, and is not a substitute for a licensed attorney.

---

# Triage — Wage theft / job problems

Confidence: **1** (gate 0.4) · matched keywords: overtime

urgency: routine

## Referral — Wage theft / job problems

- Legal aid category: `legal-aid-employment` (confidence 1)
- Wage claim and employment help through your local legal aid workers’ rights unit.
- Your nearest legal aid office; bring pay stubs, schedules, and any termination notice.
- Guidance: Bring pay stubs, schedules, and any messages about hours or pay. (source: LawHelp.org — legal aid finder <https://www.lawhelp.org>)
- Guidance: Wage claims are handled by a state or federal labor agency; intake staff can identify the right office for your situation. (source: U.S. DOL Wage and Hour Division <https://www.dol.gov/agencies/whd>)

> This tool provides referral information only. It does not provide legal advice, does not evaluate the merits of any claim, and is not a substitute for a licensed attorney.

---

# Triage — Record sealing / expungement

Confidence: **1** (gate 0.4) · matched keywords: criminal record, background check

urgency: routine

## Referral — Record sealing / expungement

- Legal aid category: `legal-aid-record-clearance` (confidence 1)
- Record sealing/expungement screening through a legal aid reentry clinic.
- Your nearest legal aid reentry clinic; bring your RAP sheet if you have one.
- Guidance: Bring your RAP sheet if you have one; if not, intake staff can explain how to request a copy. (source: LawHelp.org — legal aid finder <https://www.lawhelp.org>)
- Guidance: Eligibility for sealing depends on the case outcome and the state; a screener goes through it with you. (source: LawHelp.org — legal aid finder <https://www.lawhelp.org>)

> This tool provides referral information only. It does not provide legal advice, does not evaluate the merits of any claim, and is not a substitute for a licensed attorney.

---

# Triage — ESCALATE (no-keyword-match)

We could not confidently classify this description. A staff member will review it and follow up — no automated categorization was applied.

urgency: routine

> This tool provides referral information only. It does not provide legal advice, does not evaluate the merits of any claim, and is not a substitute for a licensed attorney.

---

# Triage — ESCALATE (no-keyword-match)

We could not confidently classify this description. A staff member will review it and follow up — no automated categorization was applied.

urgency: routine

> This tool provides referral information only. It does not provide legal advice, does not evaluate the merits of any claim, and is not a substitute for a licensed attorney.
