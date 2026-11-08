# record-clearance

Record clearance / certificate-of-relief tracker. Client record JSON +
jurisdiction → relief types from **rules-as-data** (full-tier example US
states: CA, IL, NY — plus a **guidance tier** for TX: generic screen with a
mandatory referral, never a bare error), eligibility-prerequisites checklist
(met / not met / **unknown — never guessed**), filing-deadline date math
(earliest and last filing dates), **filing guidance as data** (steps, forms,
fee-waiver note) with an **authority link** (`[verify]`-tagged cite + URL) on
every relief type, per-conviction fact overrides (probation/fines can differ
by conviction), an LLM **intake boundary** (`validateIntake`: `uncertain`
fields dropped + logged, ids assigned), status tracking for matters already
filed, and referral flags for counsel-dependent relief.

Open reimplementation of The Access Project "Record clearance" (Claude for
Legal A2J gallery). The original is a closed single-state screen; here every
relief type, prerequisite, and deadline is editable data with a cited rule
id on every checklist line.

## Run

```bash
node --test 'core/*.test.js'   # 27 tests
node examples/run.js           # regenerates examples/output.json + report.md
                                # and examples/intake-output.json + intake-report.md
```

Open `demo/index.html` for the interactive demo: jurisdiction switcher
(CA / IL / NY full rulesets + TX guidance tier, side-by-side input/output),
prefilled worked example with 2 fictional convictions × 3 CA relief types,
one petition already filed.

## Layout

- `spec.md` — IO contract, deterministic/LLM split, prompt schema
- `core/core.js` — dependency-free ES module (browser + Node)
- `core/core.test.js` — node:test suite
- `examples/` — fictional client record → tracker outputs; `intake.json` is
  the LLM-shaped worked example for the `validateIntake` pipeline
- `demo/index.html` — standalone interactive demo (design tokens)

## Better than the closed counterpart

- Jurisdictions and relief types are plain data — portable beyond one state,
  with a guidance tier so every jurisdiction gets an answer, not an error.
- Tri-state checklist: unknown facts become `data_needed`, never guesses.
- Earliest/last filing dates computed by inspectable anchor+years math.
- Filing guidance (steps/forms/fee-waiver) and authority links live in the
  same editable data — inspectable and replaceable, unlike closed guidance.
- `validateIntake` publishes and tests the LLM boundary the spec defines.
- Filed/granted/denied statuses tracked instead of recomputed.
- Referral flags route counsel-dependent relief (certificates, pardons) to humans.

⚠️ Illustrative example rulesets and fictional data only. Not legal advice.
Verify with counsel or a legal aid clinic before filing.
