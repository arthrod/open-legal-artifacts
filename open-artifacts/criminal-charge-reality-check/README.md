# criminal-charge-reality-check

Charge outcome expectations for defense teams. Charge facts JSON → typical
process timeline stages from **rules-as-data** (arraignment → discovery →
motions → trial day windows, defaults per jurisdiction and configurable),
likely-outcome bands per charge class with a provenance field, and a
what-affects-the-range factors list matched to client facts.

**These bands are statistical heuristics from illustrative example data —
not a prediction of any case's outcome, and not legal advice.** The
disclaimer is structural: it ships in the output object of every report.

Open reimplementation of the Zealous "Criminal charge reality check"
(Claude for Legal A2J gallery; original is NY-only and closed).

## Run

```bash
node --test 'core/*.test.js'   # 13 tests
node examples/run.js           # regenerates examples/output.json + report.md
```

Open `demo/index.html` for the interactive demo (prefilled fictional
NY felony_class_D charge with trial-window overrides).

## Layout

- `spec.md` — IO contract, deterministic/LLM split, prompt schema
- `core/core.js` — dependency-free ES module (browser + Node)
- `core/core.test.js` — node:test suite
- `examples/` — fictional charge → expectations outputs
- `demo/index.html` — standalone interactive demo (design tokens)

## Better than the closed counterpart

- Every outcome band carries a `bandSource` provenance field — open
  deployments must cite dated court data instead of hiding methodology.
- Unknown charge classes are explicitly unset, never mapped to a nearest class.
- Timeline day counts are editable data + per-run overrides (calibrate to
  the local court).
- Portable beyond NY (example rulesets: NY, PA, OH).
- Disclaimers are structural flags in the output, not prompt text.

⚠️ Illustrative example rulesets and fictional data only. Not legal advice.
