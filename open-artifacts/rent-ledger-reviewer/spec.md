# rent-ledger-reviewer — specification

Open reimplementation of the Rising for Justice "Rent ledger reviewer"
legal-aid artifact (catalog §3.8): finds errors in a landlord's rent ledger
when preparing an eviction defense — illegal late fees, duplicate or missing
rent entries, disallowed charges, payment misapplication, overcharges.

## Design split: deterministic core vs. LLM

Everything in `core/` is pure arithmetic — the catalog explicitly calls for
this: "Recalculation is arithmetic — should be pure code."

| Capability | Owner |
|---|---|
| Running balance recomputation, entry by entry (two ledgers: as-charged vs lawful) | core (deterministic) |
| Late-fee validation: grace period trigger + cap (% of rent or flat), once-per-month | core (deterministic) |
| Rent-schedule completeness: missing / duplicate / above-schedule rent entries | core (deterministic) |
| Rent schedule vs annual-increase cap (`rent_increase_over_cap`) | core (deterministic, rules-as-data) |
| Interest recomputation (deposit credit / judgment charge) at ruleset rates | core (deterministic, rules-as-data) |
| Claimed-balance check: landlord's claimed due vs recomputed ledger (`claimed_balance_mismatch`) | core (deterministic) |
| Oldest-first payment allocation, underpayment shortfalls, misapplication flags | core (deterministic) |
| Disallowed and unknown charge types per jurisdiction (unknown is never assumed lawful) | core (deterministic, rules-as-data) |
| Dispute report (Markdown) + recomputed-ledger CSV export | core (deterministic) |
| Deterministic CSV/TSV table → entry contract (`parseLedgerTable`) | core (deterministic, LLM-free) |
| Structuring a scanned/free-form ledger into the input JSON | LLM or human (out of core) |
| What is actually owed | **counsel/court only** (gate on every report) |

## Input contract (`ReviewInput`, JSON)

```jsonc
{
  "jurisdiction": "DC",                 // ruleset id (DC | CA | MA examples)
  "asOf": "2026-04-30",
  "claimedBalance": 1870,               // optional: what the landlord/complaint says is owed
  "lease": {
    "monthlyRent": 1400, "leaseStart": "2026-01-01", "rentDueDay": 1,
    "rentSchedule": [                   // optional steps; falls back to monthlyRent
      { "from": "2026-01-01", "amount": 1400 }
    ]
  },
  "ledger": [
    { "id": 1, "date": "2026-01-01", "type": "rent",     "amount": 1400, "note": "January rent" },
    { "id": 2, "date": "2026-01-03", "type": "payment",  "amount": 1400 },
    { "id": 6, "date": "2026-02-05", "type": "late_fee", "amount": 70, "appliedTo": "2026-02" },
    { "id": 3, "date": "2026-01-15", "type": "misc_fee", "amount": 250 },
    { "id": 7, "date": "2026-06-30", "type": "interest", "amount": 60,
      "kind": "deposit", "principal": 1000, "days": 365, "ratePct": 6 }
    // type is open-ended; anything not rent/payment/late_fee/interest is checked
    // against the jurisdiction's allowable + disallowed lists; unlisted types
    // raise unknown_charge_type and are excluded from the lawful balance
  ]
}
```

Entry hardening — never silent: entries with unparseable dates, non-positive
amounts, missing/duplicate ids, missing types, or `interest` entries lacking
`kind`/`principal`/`days`/`ratePct` are excluded from the recomputation and
listed in `ignoredEntries[]` with a reason.

## Output contract

- `rows[]`: recomputed ledger — `{ entryId, date, type, amount, balanceAfter,
  lawfulBalanceAfter }` per entry, in date order (stable by id).
- `balance`: `{ ledgerFinal, lawfulFinal, overchargeTotal }` — the
  as-charged balance vs. the balance using only lawful charges; the delta is
  the identified overcharge (a negative lawful balance = tenant credit).
- `claimedBalance`: `{ claimed, recomputed, delta }` when the input carried
  one; a non-zero delta also raises a `claimed_balance_mismatch` dispute.
- `ignoredEntries[]`: `{ entry, reason }` for every input entry excluded from
  the recomputation — nothing is dropped silently.
- `disputes[]`: `{ issue, severity, month?, entryId?, amountInQuestion,
  ruleId, citation?, text }` — itemized, each line citing the rule that
  produced it (plus the rule's illustrative [verify]-tagged citation
  pointer where one exists). Issues: `late_fee_before_grace`,
  `late_fee_over_cap`, `late_fee_charged_twice`, `duplicate_rent_entry`,
  `missing_rent_entry`, `rent_overcharged`, `rent_increase_over_cap`,
  `interest_miscalculation`, `claimed_balance_mismatch`,
  `payment_misapplied`, `disallowed_charge_type`, `unknown_charge_type`.
- `underpayments[]`: per-month shortfalls after oldest-first allocation.
- `gate`: verify-with-counsel message (always present).
- `toCSV(review)` → recomputed-ledger CSV; `renderReport(review)` → Markdown;
  `parseLedgerTable(text)` → `{ entries, ignoredRows, errors }` from a pasted
  CSV/TSV table (subset: header required with `date,type,amount`; optional
  `id`/`entry_id`, `applied_to`, `note`, `kind`, `rate_pct`, `principal`,
  `days`; no embedded-delimiter quoting; ids auto-assigned 1..n when the id
  column is absent; rows that fail validation are listed, never dropped).

## Rules-as-data

`JURISDICTION_RULES` (3 example US jurisdictions: DC 5-day grace / 5%-of-rent
cap, CA flat-cap example, MA 30-day grace / 4% cap) — illustrative shapes
modeled on common tenant protections, editable as plain data. Each ruleset
also carries `depositInterestPct`, `judgmentInterestPct`, and
`annualIncreaseCapPct` (all illustrative, [verify]-tagged) plus a
`citations` map keyed by ruleId pointing at the statute family to verify —
illustrative pointers, never asserted as real law. Maintainers add
jurisdictions or correct numbers without touching engine code.

## Prompt schema for the LLM part

The LLM only structures a raw/scanned ledger into the input contract:

```jsonc
{ "jurisdiction": "DC", "asOf": "2026-04-30",
  "lease": { "monthlyRent": 1400, "leaseStart": "2026-01-01", "rentDueDay": 1 },
  "ledger": [ { "id": 1, "date": "2026-01-01", "type": "rent", "amount": 1400, "note": "…" } ],
  "uncertainEntries": [ { "rawText": "2/5 fee??", "reason": "amount illegible" } ] }
```

`uncertainEntries` are excluded from the recomputation and must be listed —
the engine never receives or guesses them silently.

## What's BETTER than the closed counterpart

1. **Published calculation engine** — the audit logic is inspectable code,
   not a closed artifact; every dispute line cites its rule.
2. **Portable by data** — per-jurisdiction rulesets (the original is D.C.-only).
3. **Two-ledger transparency** — as-charged vs. lawful balance makes the
   overcharge delta self-evident to a judge.
4. **Machine-readable exports** — CSV + JSON alongside the human report.
5. **Reproducible** — same input + ruleset version ⇒ byte-identical output.
