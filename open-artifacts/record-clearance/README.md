# record-clearance

Record clearance / certificate-of-relief tracker. Client record JSON +
jurisdiction → relief types from **rules-as-data** (3 editable example US
states: CA, IL, NY), eligibility-prerequisites checklist (met / not met /
**unknown — never guessed**), filing-deadline date math (earliest and last
filing dates), status tracking for matters already filed, and referral
flags for counsel-dependent relief.

Open reimplementation of The Access Project "Record clearance" (Claude for
Legal A2J gallery). The original is a closed single-state screen; here every
relief type, prerequisite, and deadline is editable data with a cited rule
id on every checklist line.

## Run

```bash
node --test 'core/*.test.js'   # 17 tests
node examples/run.js           # regenerates examples/output.json + report.md
```

Open `demo/index.html` for the interactive demo (prefilled worked example:
2 fictional convictions × 3 CA relief types, one petition already filed).

## Layout

- `spec.md` — IO contract, deterministic/LLM split, prompt schema
- `core/core.js` — dependency-free ES module (browser + Node)
- `core/core.test.js` — node:test suite
- `examples/` — fictional client record → tracker outputs
- `demo/index.html` — standalone interactive demo (design tokens)

## Better than the closed counterpart

- Jurisdictions and relief types are plain data — portable beyond one state.
- Tri-state checklist: unknown facts become `data_needed`, never guesses.
- Earliest/last filing dates computed by inspectable anchor+years math.
- Filed/granted/denied statuses tracked instead of recomputed.
- Referral flags route counsel-dependent relief (certificates, pardons) to humans.

⚠️ Illustrative example rulesets and fictional data only. Not legal advice.
Verify with counsel or a legal aid clinic before filing.
