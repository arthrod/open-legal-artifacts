# access-to-justice-front-door

Plain-language triage front door: describe a problem → deterministic
keyword/rule classification against an issue taxonomy → confidence-gated
referral to legal-aid categories, with human escalation when unsure.
Referral information only — never legal advice.

## Run

- Demo: open `demo/index.html` (standalone; prefilled with the fictional
  worked example).
- Tests: `node --test core/core.test.js demo/render.test.js` — 33 tests
  (core logic + demo rendering, incl. the stale-pick-after-edit guard).
- Example: `node examples/run.js` → regenerates `examples/output.json`,
  `triage.md` from `examples/input.json` (9 descriptions: 7 classified,
  2 escalated at build time).
- Paraphrase golden set: `examples/paraphrases.json` — 20 fictional
  descriptions (14 classified, 6 escalated on purpose) pinned by tests.

## How it works

1. Single-word keywords and aliases match on word boundaries (rent ≠
   present, ebt ≠ debt); phrases match verbatim; every hit adds its weight.
2. `aliases` per issue are synonym phrasings as data ("kicked out",
   "beats me", "cash assistance") — paraphrase coverage without an LLM.
3. Confidence = the top issue's share of total matched weight.
4. Gate at 0.4: below it the matter is escalated with a staff-review
   packet (full candidates + matched fragments) and a clarifying
   question; `triage(text, { pick })` resolves it deterministically.
   Zero matches escalate too — never guessed.
5. Close second issue (gap < 0.15) serves both referrals, flagged as
   possible multi-issue.
6. Urgency flag (emergency/urgent/routine) and plain-language dates
   (info-only, no deadline math) travel with every result.
7. Each referral carries approved, process-only guidance entries with
   a source link, copied verbatim from the editable taxonomy.
8. Output contains referral info only — enforced by tests, not just policy.

## Better than the closed counterpart

- Open, localizable taxonomy and referral map (clinic-editable data).
- Visible classification math (matched keywords + confidence share);
  escalates instead of bluffing when unsure.
- Advice-free by construction (schema has no advice fields) and by test.
- Zero dependencies, offline-capable in a browser tab.

Example descriptions are fictional; referral text is template data, not
an endorsement of any specific provider.
