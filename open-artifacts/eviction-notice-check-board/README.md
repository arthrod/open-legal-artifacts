# eviction-notice-check-board

Check an eviction notice's facts against jurisdiction rules-as-data.
Per-requirement PASS / FAIL / UNVERIFIED board with the rule cited on
every row — and a hard never-guesses guarantee for anything not
positively attested.

## Run

- Demo: open `demo/index.html` (standalone; prefilled with fictional
  worked example E-1031).
- Tests: `node --test core/core.test.js` — 18 tests.
- Example: `node examples/run.js` → regenerates `examples/output.json`,
  `board.md`, `board.csv` from `examples/input.json`.

## How it works

1. Rules-as-data: five editable example US jurisdictions (CA, TX, NY,
   WA, OH) with notice periods, required contents, authorized service
   methods, and a citation per rule. Fork the JSON to correct or extend.
2. You attest facts from the notice: stated period, contents present/
   absent, service method, optional service/filing dates.
3. The core checks each requirement deterministically; unknown
   jurisdictions/notice types and unattested facts stay UNVERIFIED —
   tests pin this behavior.
4. Verdict: any FAIL → fail; else any UNVERIFIED → unverified; else pass.

## Better than the closed counterpart

- Auditable: every check row shows the exact rule and citation used.
- Never guesses — unattested facts can't silently become green checks.
- Open, editable jurisdiction rules (clinic-correctable), zero
  dependencies, CSV/Markdown export, runs fully client-side.

All names and matters in examples are fictional. The rulesets are
example defaults — not legal advice; verify all cited rules against
current local law (state, city, and lease terms all matter).
