# criminal-charge-reality-check

Charge outcome expectations for defense teams. Charge facts JSON → typical
process timeline stages from **rules-as-data** (arraignment → discovery →
motions → trial day windows, defaults per jurisdiction and configurable),
likely-outcome bands per charge class with structured provenance
(`bandSource: {kind, url?, asOf?, cohort?, sample?}`), a
what-affects-the-range factors list matched to client facts via explicit
`when` rules, a release playbook with dated advocacy steps when the client
is detained, fictional charge-code resolution (`resolveCharge`) with an
uncertain-candidate multi-run (`realityCheckMulti`), and a plain-language
client summary (`renderPlainLanguage`).

**These bands are statistical heuristics from illustrative example data —
not a prediction of any case's outcome, and not legal advice.** The
disclaimer is structural: it ships in the output object of every report.

Open reimplementation of the Zealous "Criminal charge reality check"
(Claude for Legal A2J gallery; original is NY-only and closed).

## Run

```bash
node --test 'core/*.test.js'   # 26 tests
node examples/run.js           # regenerates examples/output.json + report.md
```

Open `demo/index.html` for the interactive demo: prefilled fictional
NY felony_class_D charge with trial-window overrides, an uncertain-degree
example that runs both candidate classes side-by-side, the release playbook
for detained clients, and a plain-language summary toggle. Charge codes in
the demo (XPL-9xx) are fictional — they cite no real statute.

## Layout

- `spec.md` — IO contract, deterministic/LLM split, prompt schema
- `core/core.js` — dependency-free ES module (browser + Node)
- `core/core.test.js` — node:test suite (26 tests)
- `examples/` — fictional charge → expectations outputs
- `demo/index.html` — standalone interactive demo (design tokens)

## Better than the closed counterpart

- Every outcome band carries a structured `bandSource` provenance object
  (validated by `validateBandSource`) — open deployments must cite dated
  court data (`kind: "cited"`, url + asOf required) instead of hiding
  methodology; illustrative bands render as "no empirical claim".
- Release playbook: dated steps + motions computed from the arraignment
  anchor when the client is detained (`test: release playbook …`).
- Explicit uncertainty: `realityCheckMulti` runs every uncertain
  charge-class candidate and shows both — never collapsed to one guess.
- Plain-language client summary (`renderPlainLanguage`) — disclaimer
  first, ≤200 words, no leaked unset fields.
- Unknown charge classes are explicitly unset, never mapped to a nearest class.
- Timeline day counts are editable data + per-run overrides (calibrate to
  the local court).
- Portable beyond NY (example rulesets: NY, PA, OH).
- Disclaimers are structural flags in the output, not prompt text.

⚠️ Illustrative example rulesets and fictional data only. Not legal advice.
