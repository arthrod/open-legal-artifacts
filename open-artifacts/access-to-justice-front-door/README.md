# access-to-justice-front-door

Plain-language triage front door: describe a problem → deterministic
keyword/rule classification against an issue taxonomy → confidence-gated
referral to legal-aid categories, with human escalation when unsure.
Referral information only — never legal advice.

## Run

- Demo: open `demo/index.html` (standalone; prefilled with the fictional
  worked example).
- Tests: `node --test core/core.test.js` — 16 tests.
- Example: `node examples/run.js` → regenerates `examples/output.json`,
  `triage.md` from `examples/input.json` (9 descriptions: 7 classified,
  2 escalated at build time).

## How it works

1. Single-word keywords match on word boundaries (rent ≠ present);
   phrases match verbatim; every hit adds its weight.
2. Confidence = the top issue's share of total matched weight.
3. Gate at 0.4: below it (or with zero matches) the matter is
   escalated to human review with candidates listed — never guessed.
4. Close second issue (gap < 0.15) serves both referrals, flagged as
   possible multi-issue.
5. Output contains referral info only, copied verbatim from the
   editable taxonomy — enforced by tests, not just policy.

## Better than the closed counterpart

- Open, localizable taxonomy and referral map (clinic-editable data).
- Visible classification math (matched keywords + confidence share);
  escalates instead of bluffing when unsure.
- Advice-free by construction (schema has no advice fields) and by test.
- Zero dependencies, offline-capable in a browser tab.

Example descriptions are fictional; referral text is template data, not
an endorsement of any specific provider.
