# record-sealing-screener

Criminal-record sealing eligibility screener. Case facts JSON in
(disposition, conviction type, sentence-completed date, subsequent history)
→ per-case eligibility determination against **rules-as-data** for three
editable example US jurisdictions (DC, CA, TX), with disqualifier flags that
each cite the rule that produced them. **Never guesses** — unknown data
returns `insufficient_data` — and every report ends at a hard
**verify-with-counsel** gate.

Open reimplementation of the Rising for Justice "Record sealing screener"
(Claude for Legal A2J gallery); the original is D.C.-only and closed.

## Run

```bash
node --test 'core/*.test.js'   # 16 tests
node examples/run.js           # regenerates examples/output.json + report.md
```

Open `demo/index.html` in a browser for the interactive demo (prefilled with
the worked example).

## Layout

- `spec.md` — IO contract, deterministic/LLM split, prompt schema
- `core/core.js` — dependency-free ES module (browser + Node)
- `core/core.test.js` — node:test suite
- `examples/` — fictional 5-case record → output.json + report.md
- `demo/index.html` — standalone interactive demo (design tokens)

## Better than the closed counterpart

- Every flag cites its rule; the full rule chain is in the output (auditable).
- Jurisdictions are editable data, not code — portable beyond D.C.
- Missing data is surfaced, never guessed; counsel gate is structural.
- Same input + ruleset version ⇒ identical output (reproducible).

⚠️ Illustrative example rulesets and fictional data only. Not legal advice.
Verify with licensed counsel before filing.
