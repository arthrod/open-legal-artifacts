# eviction-notice-check-board — specification

Open artifact: checks an eviction notice's facts against jurisdiction
rules-as-data (5 example US jurisdictions, editable JSON) and outputs a
per-requirement PASS / FAIL / UNVERIFIED board — every row cites the rule
it was checked against. The checker NEVER guesses.

## Design split: deterministic core vs. LLM

| Capability | Owner |
|---|---|
| Period check (stated days vs required; long-tenancy tiers) | core (deterministic) |
| Elapsed-days check (service → filing) when dates supplied | core (deterministic) |
| Required-contents check (attested true/false; absent = unverified) | core (deterministic) |
| Service-method check against authorized list | core (deterministic) |
| Verdict aggregation (any fail → FAIL; any unverified → UNVERIFIED) | core (deterministic) |
| Jurisdiction notice rules (periods, contents, service methods, cites) | **rules-as-data** (editable JSON) |
| Reading the notice document and attesting the facts | reviewer / LLM extraction (prompt below) |
| Legal conclusions (waiver, curable defects, local ordinances) | attorney |

Never-guesses guarantees (enforced in tests):
- unattested content → UNVERIFIED, never assumed present;
- missing period → UNVERIFIED, never inferred from dates alone;
- unknown jurisdiction → refuses to approximate from another ruleset;
- unknown notice type → UNVERIFIED with the known types listed.

## Input contract (JSON)

```jsonc
{
  "jurisdiction": "california-example",     // key into rulesets
  "noticeType": "pay-or-quit",
  "statedPeriodDays": 3,                    // as written on the notice
  "tenancyYears": 0.5,                      // optional, for tiered rules
  "serviceDate": "2026-10-01",              // optional ISO
  "filedDate": "2026-10-03",                // optional ISO
  "serviceMethod": "post-and-mail",
  "contents": { "amount-due": true, "payment-methods": false }
  // content keys absent from this map are UNVERIFIED
}
```

## Output contract (JSON)

`{ jurisdiction, noticeType, checks[], summary, disclaimer }` where each
check is `{ id, requirement, status: pass|fail|unverified, detail,
ruleCite }`. `summary.verdict` is `fail` if any check failed, else
`unverified` if any check is unverified, else `pass`. Exports:
`renderBoard()` (Markdown, worst-first), `toCSV()`.

## Rules-as-data shape

```jsonc
"<jurisdiction-key>": {
  "name": "…",
  "noticeTypes": {
    "<type-key>": {
      "minDays": 3,
      "longTenancyMinDays": 60, "longTenancyYears": 1,   // optional tier
      "contents": [ { "id": "…", "label": "…", "cite": "…" } ],
      "service": { "methods": ["personal", "…"], "cite": "…" },
      "cite": "top-level citation for the period rule"
    }
  }
}
```

Bundled examples (all marked verify-locally): California (CCP §§ 1161–1162
examples), Texas (Prop. Code § 24.005), New York (RPAPL § 733),
Washington (RCW 59.18/59.12), Ohio (ORC 1923.04).

## Prompt schema for the LLM part (fact extraction only)

```jsonc
// System: "Read the eviction notice. Extract only what the document states.
// Never infer presence of a requirement; mark unknown as null."
{ "noticeType": "string|null", "statedPeriodDays": "number|null",
  "amountDueStated": "boolean|null", "paymentInstructions": "boolean|null",
  "serviceMethodDescription": "verbatim quote|null",
  "datesOnNotice": [ { "label": "string", "date": "ISO|null" } ] }
```

A human maps the extraction onto the attestation input; the verdict is
always computed by the deterministic core.

## What's better than the closed counterpart

- Every cell names its rule — the board is auditable line by line, not a
  model's assurance.
- UNVERIFIED is a first-class outcome: the tool never converts "I don't
  know" into a green check, and tests enforce that.
- Jurisdiction rules are editable JSON a tenant clinic or firm can fork
  and correct; the closed tool's rules are invisible.
- Deterministic, dependency-free, runs in the browser and Node; CSV/MD
  export for filing or mail-merge.
