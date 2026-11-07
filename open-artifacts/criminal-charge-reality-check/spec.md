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
| What-affects-the-range factors matched against client facts | core (deterministic) |
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
  `trial_conviction`, `acquittal` with a `bandSource` field. Example data is
  marked `illustrative`; maintainers point it at published court statistics
  and record the source and date there.
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

When the class is uncertain, the pipeline runs the core once per candidate
and shows both — it never collapses uncertainty into one guess.

## What's BETTER than the closed counterpart

1. **Provenance field on every band** — `bandSource` makes "where did this
   number come from" machine-checkable; the closed artifact's data
   methodology is unpublished.
2. **Unknown ⇒ unset** — charge classes missing from the ruleset are
   surfaced as errors, never silently mapped to a nearest class.
3. **Configurable timelines** — stage day counts are data + per-run
   overrides, so defenders calibrate to their local court's actual pace.
4. **Structural disclaimers** — heuristics/prediction/legal-advice flags in
   the output object, not a prompt instruction that can drift.
5. **Portable beyond NY** by editing rules-as-data.
