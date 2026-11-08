# criminal-charge-reality-check — specification

Open reimplementation of the Zealous "Criminal charge reality check"
legal-aid artifact (catalog §3.10): takes a criminal charge and shows
defense teams the typical process, sentencing range, how comparable cases
usually end, and what moves the range — with strong, structural disclaimers.

## Design split: deterministic core vs. LLM

| Capability | Owner |
|---|---|
| Timeline stages (arraignment → discovery → motions → trial) with min/typical/max day offsets → calendar windows | core (deterministic, rules-as-data) |
| Configurable stage day counts (per-jurisdiction defaults + per-run `stageOverrides`) | rules-as-data |
| Sentencing-range and outcome-band lookup per charge class | core (deterministic; unknown class ⇒ explicitly unset) |
| What-affects-the-range factors matched against client facts | core (deterministic `when` rules-as-data — never id/label strings) |
| Release playbook (steps + motions, day offsets from arraignment → calendar dates) | core (deterministic; per-ruleset `releasePlaybook` data) |
| Fictional charge-code resolution (`resolveCharge`) and uncertain-candidate multi-run (`realityCheckMulti`) | core (deterministic; real-looking codes never guessed) |
| Plain-language client summary (`renderPlainLanguage`) with readability guard | core (deterministic) |
| Band provenance validation (`validateBandSource`) | core (illustrative bands cannot claim a data source; cited bands need url + asOf) |
| Strong disclaimers (heuristics ≠ prediction ≠ legal advice) | core (structural, on every report) |
| Mapping a real charge to a charge class + client facts | LLM or human (out of core) |
| Maintaining real outcome statistics with cited methodology | data maintainers (the open analytics problem below) |

## Input contract (`ChargeInput`, JSON)

```jsonc
{
  "jurisdiction": "NY",                       // ruleset id (NY | PA | OH examples)
  "charge": "Criminal possession … (fictional)",
  "chargeClass": "felony_class_D",            // must exist in the ruleset — never guessed
  "filedOn": "2026-11-02",
  "client": {                                  // all optional; drive factor flags
    "priorConvictions": 1,
    "detained": true,
    "counselAtArraignment": true,
    "evidenceIssues": false,
    "diversionEligible": false
  },
  "stageOverrides": { "trial": { "min": 240, "typical": 330, "max": 420 } }
}
```

## Output contract

- `timeline[]`: per stage `{ stage, dayOffset: {min, typical, max},
  window: {min, typical, max} }` — day offsets from filing converted to
  calendar dates.
- `sentencingRange`: `{ minMonths, maxMonths, ruleId }` from the ruleset.
- `outcomeBands`: per-class bands for `dismissal`, `plea_conviction`,
  `trial_conviction`, `acquittal` with a structured `bandSource` object:
  `{kind:"illustrative"}` (fictional example data — rendered as
  "illustrative — no empirical claim") or `{kind:"cited", url, asOf,
  cohort?, sample?}` for published court statistics. `validateBandSource`
  enforces the shape; `formatBandSource` renders it.
- `release`: when `client.detained === true`, the ruleset's release
  playbook with every step's calendar date computed from the arraignment
  typical date (`anchoredOn`, `anchorBasis`); null otherwise.
- `factors[]`: what-affects-the-range list with `applies` + `basis` derived
  deterministically from client facts.
- `errors[]`: unknown jurisdiction, unparseable filing date, or a charge
  class missing from the ruleset — left **unset rather than guessed**.
- `disclaimer`: structural object — `statisticalHeuristics: true`,
  `prediction: false`, `legalAdvice: false`, full text on every report and
  rendered at the top and bottom of the Markdown.

## Rules-as-data

`JURISDICTION_RULES` (3 example US states: NY, PA, OH): stage day offsets,
sentencing ranges with rule ids, outcome bands, factor list. All numbers are
illustrative defaults. The catalog is explicit that outcome data is where
bias lurks: an open deployment must replace bands with cited, dated open
data (court statistics publications) and publish sample + cohort
definitions — `bandSource` exists to make that provenance machine-readable.

## Prompt schema for the LLM part

The LLM only maps a raw charge description into the input contract:

```jsonc
{ "jurisdiction": "NY", "chargeClass": "felony_class_D",
  "charge": "Criminal possession of stolen property, 4th degree",
  "filedOn": "2026-11-02",
  "client": { "priorConvictions": 1, "detained": true },
  "uncertain": [ { "field": "chargeClass", "candidates": ["felony_class_D", "felony_class_E"],
                   "reason": "degree depends on value of property" } ] }
```

When the class is uncertain, `realityCheckMulti(input)` (in the core) runs
once per candidate and returns both reports — it never collapses
uncertainty into one guess. `resolveCharge("XPL-910.45")` maps fictional
charge codes (made-up "XPL-" prefix, 9xx articles that exist in no real
penal law) to a class or to `ambiguous` candidates; real-looking codes
such as "PL-165.45" come back `unknown`.

## Plain-language output

`renderPlainLanguage(report)` renders a client-facing summary: disclaimer
in the first sentence, ≤200 words, short deterministic sentences, and no
leaked unset fields. It is a readability aid, not a validated readability
instrument.

## What's BETTER than the closed counterpart

1. **Provenance object on every band** — `bandSource` makes "where did
   this number come from" machine-checkable and validated
   (`validateBandSource`); the closed artifact's data methodology is
   unpublished. *(test: "bandSource is structured provenance; every
   ruleset band validates", "validateBandSource rejects malformed
   provenance")*
2. **Unknown ⇒ unset** — charge classes missing from the ruleset are
   surfaced as errors, never silently mapped to a nearest class.
   *(test: "charge class unknown to ruleset => explicitly unset…",*
   *"realityCheckMulti…")*
3. **Configurable timelines** — stage day counts are data + per-run
   overrides, so defenders calibrate to their local court's actual pace.
   *(test: "timeline: stage day counts configurable via overrides")*
4. **Structural disclaimers** — heuristics/prediction/legal-advice flags in
   the output object, not a prompt instruction that can drift. *(test:
   "disclaimer is structural on every report, including errors")*
5. **Portable beyond NY** by editing rules-as-data. *(test:
   "jurisdiction portability: PA and OH produce their own timelines and
   bands")*
6. **Deterministic factor matching** — factors fire only on explicit
   `when` rules-as-data, so a diversion factor is never mis-flagged as
   detention across jurisdictions (closed prompt logic can't be tested).
   *(test: "factors: PA-F1/OH-F1 are diversion factors — never flagged by
   detention")*
7. **Release playbook with computed dates** — dated advocacy steps +
   motions from the arraignment anchor when the client is detained; the
   counterpart's playbook has no published structure or dates. *(test:
   "release playbook: dated steps computed from arraignment when client
   detained")*
8. **Explicit uncertainty multi-run** — an uncertain charge class runs
   every candidate and shows both, instead of one silent guess.
   *(test: "realityCheckMulti: runs once per uncertain candidate and shows
   both")*
9. **Plain-language client output** — a deterministic, disclaimer-first
   ≤200-word summary; the catalog recommends client-facing output and the
   counterpart publishes none. *(test: "renderPlainLanguage: <=200 words,
   disclaimer first…")*
