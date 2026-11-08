# entity-compliance-calendar — open artifact spec

Open reimplementation of Anthropic's "Entity compliance calendar" artifact
(catalog §2.20): *"Filing deadlines across every entity."*

The catalog's open-reimplementation note is blunt: deadline rules are
statutory and change, so **the real moat is the rule base, not the model**.
This core is built accordingly — obligations are versioned rules-as-data
with statutory cites, and every deadline is computed by code from
(entity formation anchor × obligation rule × recorded filings), never by a
model.

## What it does

- **Entities × obligations matrix** where each cell states its next due
  date, period, computation rule, and status:
  `delinquent | due-soon | scheduled | satisfied | unknown | n/a`.
  `unknown` means required entity data is missing (no formation or
  qualification date — the cell never guesses); `n/a` means the rule
  provably does not apply (wrong jurisdiction/type, inactive entity,
  impossible rule data), with the reason recorded.
- **Recurring scheduling**:
  - `annual` + `formationAnniversary` — anniversary of formation (Feb-29
    anchors roll to Feb-28 in non-leap years);
  - `annual|biennial` + `calendarFixed` (e.g. due 4/15) — fixed date;
    biennial honors formation-year parity; cycles before formation are
    skipped; impossible fixed dates (Feb 30) produce no date;
  - `event` — one-shot, N days after the anchor event (e.g. initial report
    90 days after formation), satisfied permanently by one filing.
- **Foreign qualifications** — `entity.qualifications:
  [{ jurisdiction, qualifiedOn }]`; an obligation whose jurisdiction is not
  the entity's formation state binds through a matching qualification, and
  all anchor math (anniversaries, parity, event offsets) uses `qualifiedOn`
  instead of `formedOn` (fictional simplified semantics).
- **Earliest-unfiled-period semantics** — a missed 2021 biennial statement
  surfaces as delinquent *since 2021*, not as "current year"; filings skip
  satisfied periods; gaps never disappear.
- **Rule provenance & staleness** — obligations carry `effectiveFrom` and
  `verifiedOn`; a cell whose rule was verified >365 days before `asOf` is
  flagged `ruleStale: true` (metadata only — the computed status never
  changes). Surfaced in the CSV columns and the ICS description.
- **Fees & good standing** — filings carry optional `fee`; the matrix
  reports `feeTotals` (recorded spend, total and per entity) and a
  `goodStanding` list per entity (`ok` / `stale` >365d / `unknown` from
  `entity.goodStandingConfirmedOn`); CSV rows and ICS descriptions carry
  both.
- **Filing-window report** — `report(matrix, windows = [30, 60, 90, 180])`
  buckets actionable cells into cumulative windows (overdue items always
  included).
- **Health audit** — `auditHealth({ asOf, entities })` flags
  `missing-formedOn`, `dormant-dissolution-candidate` (status `dormant` and
  dormant — `dormantSince ?? formedOn` — >5y), `good-standing-unknown` /
  `good-standing-stale` (skipped for dissolved entities), and
  `foreign-qualification-gap` (`entity.footprint` jurisdiction with no
  qualification). All fictional heuristics — [verify] with the registered
  agent before acting.
- **Agent-report ingestion** — `ingestAgentReport(entities, csv)` matches a
  fictional registered-agent CSV (`Report Date,Entity Name,Jurisdiction,
  Status,Good Standing`) by case/punctuation-insensitive name
  ("Acme Holdings LLC" ≡ "Acme Holdings, LLC"), jurisdiction-disambiguated,
  returning `{ matched, unmatched, notInReport }`;
  `applyFilingUpdates(entities, ingest, { confirm })` is a pure two-phase
  apply (dry-run proposals → confirmed new array; idempotent; never
  mutates input).
- **Delinquency flags** ranked by overdue days, plus due-soon window
  (default 45d, configurable).
- **Exports**: CSV (full matrix incl. statutory cites, provenance,
  standing, fees, skip reasons) and RFC 5545 ICS (VEVENT per actionable
  cell, `RRULE:FREQ=YEARLY[;INTERVAL=2]` for recurring obligations,
  30-day alarm, delinquency marker, staleness caveat).

## IO contract

```js
import { nextDue, buildMatrix, report, auditHealth, ingestAgentReport, applyFilingUpdates, toCsv, toICS } from "./core/core.js";

nextDue(obligation, entity, filings, asOfIso);
//   => { applies, skipReason?, dueOn, period, status, ruleNote, ruleStale }
const matrix = buildMatrix({ asOf, entities, obligations, filings, soonDays? });
//   => { grid, delinquent, counts, feeTotals, goodStanding, … }
report(matrix, windows = [30, 60, 90, 180]); // cumulative filing windows
auditHealth({ asOf, entities });            // deterministic health flags
const ingest = ingestAgentReport(entities, agentCsv); // matched/unmatched/notInReport
applyFilingUpdates(entities, ingest, { confirm: true }); // pure two-phase apply
toCsv(matrix); toICS(matrix);
```

- `entities`: `[{ id, name, jurisdiction, type, formedOn, status?,
  goodStandingConfirmedOn?, qualifications?: [{ jurisdiction, qualifiedOn }],
  footprint?: string[], dormantSince? }]`
- `obligations` (rules-as-data): `[{ id, name, jurisdiction, entityTypes?,
  recurring, anchor, dueMonth?, dueDay?, dueWithinDays?, statuteCite?,
  effectiveFrom?, verifiedOn? }]`
- `filings`: `[{ entityId, obligationId, period: number|"once", filedOn, fee? }]`
- agent-report CSV (fictional format): header
  `Report Date,Entity Name,Jurisdiction,Status,Good Standing`; standing
  `Yes|No`.
- `asOf` caller-supplied; no hidden clocks.

## Deterministic vs LLM-assisted

| Layer | Who |
|---|---|
| Cycle math, parity, delinquency, exports | **code** |
| Maintaining the obligation rule base per jurisdiction (the actual moat) | **humans** (legal ops / paralegals), versioned data |
| Structuring raw Secretary-of-State records into entity JSON | optional LLM (extraction only) |

### LLM prompt schema (extraction step, optional)

```json
{
  "task": "Structure the provided Secretary-of-State / formation records into entity objects.",
  "output_schema": { "id": "…", "name": "legal name verbatim", "jurisdiction": "US-XX", "type": "corp|llc|nonprofit", "formedOn": "YYYY-MM-DD", "status": "active|dissolved" },
  "rules": ["Copy names and dates verbatim; never infer a formation date.", "Unreadable date → null, never guessed."]
}
```

The obligation rule base is never LLM-maintained: rules enter as reviewed
data with statutory cites.

## What's better than the closed counterpart

- **The rule base is inspectable data with cites** — every cell can say
  which statute (fictional here) imposes it and which rule computed the
  date; Anthropic's tracker keeps that logic inside the product.
- **Computed rule staleness** — rules carry `effectiveFrom`/`verifiedOn`
  and cells flag `ruleStale` when the verification is >365d old; the
  counterpart's caveat becomes a tested, per-cell signal.
- **Foreign-qualification math** — obligations bind through
  `qualifications[].qualifiedOn`, so foreign filing deadlines are
  computed, not prose-flagged.
- **Earliest-unfiled-period delinquency** — gaps surface at their true age
  (the worked example flags a biennial statement 2032 days overdue), not
  rolled into "this year's task".
- **Deterministic health audit + auditable ingestion** — dormant
  candidates, stale good standing, and qualification gaps are computed
  flags; agent reports match by normalized name with a matched/unmatched
  diff and a confirm-gated apply, where the counterpart relies on an LLM
  reading the report.
- **Recurrence in the export** — ICS events carry `RRULE` so the calendar
  system keeps scheduling future cycles; CSV carries cites for the audit
  trail.
- **Honest edge handling** — impossible fixed dates, dissolved entities,
  and off-type obligations resolve to `n/a` with reasons; missing anchor
  data resolves to `unknown`; neither ever fabricates a deadline.

## Disclaimer

Obligation rules are jurisdiction-dependent and change; the bundled rules
are fictional US-flavored examples. Maintain the rule base with effective
dates before operational use. Not legal advice.
