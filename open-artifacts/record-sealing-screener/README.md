# record-sealing-screener

Criminal-record sealing eligibility screener. Case facts JSON in
(disposition, conviction type, sentence-completed date, subsequent history)
→ per-case eligibility determination against **rules-as-data** for three
editable example US jurisdictions (DC, CA, TX), with disqualifier flags that
each cite the rule that produced them. The DC ruleset carries real
**D.C. Code § citations** (verified 2026-11-07, `[verify]`-tagged — the
numbers stay illustrative until a maintainer checks them against the current
statute). **Never guesses** — unknown data returns `insufficient_data` — and
every report ends at a hard **verify-with-counsel** gate.

Screens the whole record, not just one case: a pending sibling case gates
every other case, and sibling convictions feed the lookback window and
lifetime cap automatically (per-case overrides still win). A deterministic
`parseRapSheet(text)` turns a documented paste format into `cases[]` with
unrecognized lines surfaced as `unmappedLines` — never classified. Eligible
cases get **filing next steps** (steps, where to file, fee) and the report
ships a **next-recheck date** for needs-more-time cases.

Open reimplementation of the Rising for Justice "Record sealing screener"
(Claude for Legal A2J gallery); the original is D.C.-only and closed.

## Run

```bash
node --test 'core/*.test.js'   # 26 tests
node examples/run.js           # regenerates examples/output.json + report.md
```

Open `demo/index.html` in a browser for the interactive demo: JSON input mode
or **rap-sheet paste mode** (paste → parseRapSheet → screenRecord), prefilled
with the worked example.

## Layout

- `spec.md` — IO contract, deterministic/LLM split, rap-sheet paste format, DC statutory-citation policy
- `core/core.js` — dependency-free ES module (browser + Node)
- `core/core.test.js` — node:test suite (incl. golden-file reproducibility test)
- `examples/` — fictional 5-case record → output.json + report.md (byte-reproducible)
- `demo/index.html` — interactive demo: JSON + rap-sheet paste modes

## Better than the closed counterpart

- Every flag cites its rule and the statute to verify it against (auditable;
  DC paths cite D.C. Code § 16-803 / § 16-806 with `lastVerified`).
- Jurisdictions are editable data, not code — portable beyond D.C.
- Missing data is surfaced, never guessed; counsel gate is structural.
- Same input + ruleset version ⇒ identical output (reproducible, golden-file tested).
- Whole-record aware: pending siblings and sibling convictions gate the
  screen deterministically; offline rap-sheet paste intake; filing next
  steps + recheck calendar on every report.

⚠️ Illustrative example rulesets and fictional data only. The D.C. Code
§ citations mark where to verify — the numbers themselves are illustrative
until checked against the current statute. Not legal advice. Verify with
licensed counsel before filing.
