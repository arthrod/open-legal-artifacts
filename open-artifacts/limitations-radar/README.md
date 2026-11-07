# limitations-radar

Statute-of-limitations deadline tracker (original idea — no closed
counterpart). Claims JSON in (claim type, jurisdiction, injury date,
discovery date, tolling events) → deadline computation from
**rules-as-data** (claim-type periods for 3 editable example US
jurisdictions incl. discovery-rule accrual + recognized statutory
tolling), saved-by margin vs the filing date, conflict flags when
discovery precedes injury, and **calendar alerts (ICS export)** with
30-day warnings. Unknown jurisdiction or claim type → flagged, never
guessed.

## Run

```bash
node --test 'core/*.test.js'   # 19 tests
node examples/run.js           # regenerates output.json + report.md + deadlines.ics
```

Open `demo/index.html` for the interactive demo (prefilled fictional
5-claim docket: timely filing, bankruptcy-stay tolling, a
discovery-precedes-injury conflict, ongoing minority tolling, and an
unknown jurisdiction).

## Layout

- `spec.md` — IO contract, rules-as-data model, prompt schema, rationale
- `core/core.js` — dependency-free ES module (browser + Node)
- `core/core.test.js` — node:test suite
- `examples/` — fictional claims → deadline outputs (JSON/MD/ICS)
- `demo/index.html` — standalone interactive demo (design tokens)

## Why open

Every deadline ships its computation chain (accrual, rule id, period,
tolling days) — high-stakes date math should be auditable, not buried in
a closed artifact. Jurisdiction rules are editable data; the ICS export
means deadlines actually reach a calendar. Fictional data throughout.

⚠️ Illustrative example rulesets; limitations law is full of exceptions.
Verify every deadline with counsel before relying on it.
