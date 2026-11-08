# eviction-notice-check-board

Check an eviction notice's facts against jurisdiction rules-as-data.
Per-requirement PASS / FAIL / UNVERIFIED board with the rule cited on
every row — and a hard never-guesses guarantee for anything not
positively attested.

## Run

- Demo: open `demo/index.html` (standalone; prefilled with fictional
  worked example E-1031; batch mode + MD/CSV/JSON export buttons).
- Tests: `node --test core/core.test.js` (37 tests) and
  `node --test core/extract.test.js` (7 tests) — 44 total.
- Example: `node examples/run.js` → regenerates `examples/output.json`,
  `board.md`, `board.csv` from `examples/input.json`.

## How it works

1. Rules-as-data: ten editable example US jurisdictions (CA, TX, NY, WA,
   OH, FL, GA, AZ, IL, OR) plus a fictional city overlay showing the
   `extends` mechanism (city content rows append to the state's). Fork the
   JSON to correct or extend.
2. You attest facts from the notice: stated period, contents present/
   absent with optional verbatim quotes, service method, optional
   service/filing dates. A paste-the-notice extractor (`core/extract.js`)
   drafts attestations deterministically — every draft carries its
   verbatim quote, nothing inferred — and a human confirms them.
3. The core checks each requirement deterministically; unknown
   jurisdictions/notice types and unattested facts stay UNVERIFIED —
   tests pin this behavior. Contents attested `{present: true}` without
   a verbatim quote also stay UNVERIFIED (evidence must be auditable).
4. Deadline engine: with a service date, the board reports the earliest
   lawful filing date and notice-period expiration, skipping weekends
   and listed holiday dates where the rule requires it (holiday dates
   are editable data).
5. Provenance: every board is stamped with the ruleset `version`, `asOf`
   date, and a stable content hash of the rules it used.
6. Clinic checklists: a JSON checklist merges as extra cited rows with
   the same never-guess semantics.
7. Verdict: any FAIL → fail; else any UNVERIFIED → unverified; else pass.

## Better than the closed counterpart

- Auditable: every check row shows the exact rule and citation used.
- Never guesses — unattested facts can't silently become green checks.
- Open, editable jurisdiction rules (clinic-correctable), zero
  dependencies, CSV/Markdown export, runs fully client-side.

All names and matters in examples are fictional. The rulesets are
example defaults — not legal advice; verify all cited rules against
current local law (state, city, and lease terms all matter).
