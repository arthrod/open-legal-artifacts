# record-sealing-screener — specification

Open reimplementation of the Rising for Justice "Record sealing screener"
legal-aid artifact (catalog §3.7): screens a criminal record against
jurisdiction sealing rules and reports per-case eligibility with the motions
a client may be able to file.

## Design split: deterministic core vs. LLM

| Capability | Owner |
|---|---|
| Waiting-period date math (anchor + years, calendar-accurate, leap-year safe) | core (deterministic) |
| Disqualifier matching (offense category/class, conviction caps, lookback, fines) | core (deterministic) |
| Cross-case logic (pending sibling gates, lookback/cap from sibling convictions) | core (deterministic) |
| Rule citation behind every determination (`ruleId` + statute, echoed on every flag) | core (deterministic) |
| Jurisdiction rulesets as editable data | rules-as-data (3 example US jurisdictions; DC statute-cited) |
| Rap-sheet paste → case-facts JSON (`parseRapSheet`, documented format, never guesses) | core (deterministic) |
| Reading arbitrary real rap-sheet formats into the documented paste format | LLM or human (out of core) |
| Final eligibility call | **counsel only** (hard gate on every report) |

The engine NEVER guesses: unknown dispositions, missing dates, or unknown
jurisdictions return `insufficient_data` listing exactly what is missing.

## Whole-record screening (cross-case logic)

`screenRecord` derives record-level context from the sibling `cases[]`
before screening each case (deterministic cross-case logic an LLM can
silently miss):

- **Pending gate** — if ANY case on the record is flagged `pendingCase: true`,
  every case that does not explicitly set `pendingCase` itself gets a
  `pending_case` disqualifier citing the sibling case id(s). An explicit
  `pendingCase: false` on a case overrides the record-level gate (per-case
  override kept).
- **Lookback & lifetime cap from siblings** — when a case carries NO explicit
  `subsequentConvictions` array, sibling cases with `disposition:
  "conviction"` are derived as subsequent convictions (date =
  `dispositionDate ?? sentenceCompletedDate`, tagged with `sourceCaseId`)
  and feed both the lookback window and the lifetime conviction cap. An
  explicit `subsequentConvictions` array — even empty — overrides the
  derivation (the attorney already documented the history).

## Rap-sheet paste format (input for `parseRapSheet`)

`parseRapSheet(text)` parses a documented, fictional line format — no LLM,
  no guessing. Grammar (line-based, case-sensitive keys):

```text
JURISDICTION: DC                       # two-letter ruleset id, required for screening
CASE C-1001 (2021-CF-0001)             # case header: id + optional (caseNumber); starts a case
OFFENSE: Possession of a controlled substance (fictional)
CATEGORY: drug_possession              # single token, matched against rules
CLASS: misdemeanor                     # single token, matched against rules
DISPOSITION: conviction | acquittal | dismissed | nolle_prosequi | deferred_adjudication | unknown
OFFENSE DATE: 2015-04-02               # YYYY-MM-DD, calendar-validated
DISPOSITION DATE: 2015-09-10
SENTENCE COMPLETED: 2016-03-01
FINE PAID: yes | no
PENDING: yes | no
```

Any line that is not part of this grammar — unknown keys, bad dates, unknown
disposition values, prose notes, anything before the first `CASE` header that
isn't `JURISDICTION` — lands in `unmappedLines: [{ line, text }]` verbatim.
Fields are omitted, never guessed; the engine turns omissions into
`insufficient_data` flags. The parser has no clock: the caller supplies `asOf`.

## Statutory citations on the DC ruleset ([verify] policy)

The DC ruleset carries a `citation` block per rule pointing at the real
D.C. Code chapter (verified 2026-11-07 against `code.dccouncil.gov`):
`statute`, `detail`, `effectiveDate`, `lastVerified`, `source`. Key anchors:

- Sealing by motion (incl. the 5-year misdemeanor / 8-year felony
  conviction waiting periods measured from completion of sentence, and the
  non-conviction path): **D.C. Code § 16-806**
- Expungement by motion on actual innocence (may be filed at any time; an
  acquittal alone does not presume relief): **D.C. Code § 16-803**

The citation tells a maintainer exactly which statute to check — it never
claims the illustrative numbers ARE the statute. Every DC cite renders with a
`[verify]` tag in reports; example data stays fictional.

## Input contract (`SealingInput`, JSON)

```jsonc
{
  "jurisdiction": "DC",              // must match a ruleset id (DC | CA | TX examples)
  "asOf": "2026-11-07",              // screening date, no hidden clocks
  "cases": [
    {
      "id": "C1",
      "caseNumber": "2021-CF-000123",
      "offense": "Possession (fictional)",
      "offenseCategory": "drug_possession",       // matched against rules
      "offenseClass": "misdemeanor",              // matched against rules
      "disposition": "conviction",  // conviction | acquittal | dismissed | nolle_prosequi | deferred_adjudication | unknown
      "offenseDate": "2015-04-02",
      "dispositionDate": "2015-09-10",
      "sentenceCompletedDate": "2016-03-01",      // starts the conviction waiting period
      "finePaid": true,
      "subsequentConvictions": [ { "date": "2023-05-01", "offenseCategory": "theft" } ],
      "pendingCase": false
    }
  ]
}
```

## Output contract

One result per case:

- `determination`: `potentially_eligible` | `needs_more_time` | `ineligible` |
  `insufficient_data`
- `eligibleOnDate`: earliest date the path opens (when computable)
- `disqualifiers[]`: `{ code, description, ruleId, statute? }` — every blocking
  flag cites the rule that produced it, plus the statute when the rule has a
  citation block
- `missingData[]`: what the engine refused to guess
- `basis[]`: the rule chain behind the determination (audit trail, with
  statute cites where present)
- `motion`: the motion/petition name on the matched path
- `statute` / `filingSteps[]` / `whereToFile` / `fee`: on `potentially_eligible`
  results — the filing chain beyond the motion name
- `gate`: `{ required: true, message }` — verify-with-counsel, on every report
- `nextReviewDate` (report-level): the earliest `eligibleOnDate` among
  `needs_more_time` cases — a recheck calendar for follow-up

`renderReport(report)` produces the deterministic Markdown version.

## Rules-as-data

`JURISDICTION_RULES` in `core/core.js` holds three example US jurisdictions
(DC, CA, TX), each with: per-disposition paths (waiting period, anchor,
caps, disqualifying categories/classes, motion name, filing steps, where to
file, fee) and a subsequent-conviction lookback rule — all carrying `ruleId`s
and a `version`. The DC ruleset additionally carries `citation` blocks with
real D.C. Code § references, `effectiveDate`, `lastVerified`, and `source`
(see the [verify] policy above). Adding a jurisdiction = adding a data
object, not code. Rules are **illustrative**, modeled on common scheme
shapes, not legal advice — verify every number against the current statute
before relying on it.

## Prompt schema for the LLM part

The LLM only structures a record into the input contract above:

```jsonc
{ "cases": [ { "id": "C1", "offense": "…", "offenseCategory": "drug_possession",
               "offenseClass": "misdemeanor", "disposition": "conviction",
               "offenseDate": "2015-04-02", "dispositionDate": "2015-09-10",
               "sentenceCompletedDate": "2016-03-01", "finePaid": true,
               "subsequentConvictions": [], "pendingCase": false } ],
  "unmappedFields": ["condition-of-release notes could not be classified"] }
```

Unmapped or uncertain fields must be omitted (not guessed) — the engine
turns omissions into `insufficient_data` flags.

## What's BETTER than the closed counterpart

1. **Auditability** — every determination ships its rule chain AND the statute
   to verify it against (DC ruleset cites D.C. Code § 16-803/§ 16-806 with
   `lastVerified`); the closed artifact's reasoning is not inspectable.
2. **Portable by data** — any jurisdiction can be added as a plain data file
   by legal-aid maintainers; the original is D.C.-only.
3. **Never guesses** — missing data is a first-class output, not a silent
   assumption; the rap-sheet parser punts unrecognized lines to
   `unmappedLines` instead of classifying them.
4. **Counsel gate is structural** — code, not a prompt instruction.
5. **Reproducible** — same input + ruleset version ⇒ byte-identical output
   (enforced by a golden-file test against `examples/`).
6. **Whole-record aware** — a pending sibling case or sibling conviction
   gates the screen deterministically; no manual duplication per case.
