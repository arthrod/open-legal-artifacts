# access-to-justice-front-door — specification

Open artifact: a plain-language triage "front door" for legal-aid
intake. A deterministic keyword/rule matcher classifies a problem
description against an issue taxonomy, confidence-gates the result,
escalates to a human when confidence is low, and maps issues to
legal-aid referral categories.

**Scope guarantee: referral information only — no legal advice.** The
response object has no advice fields, and every user-facing sentence is
copied verbatim from the editable referral data. Tests enforce both.

## Design split: deterministic core vs. LLM

| Capability | Owner |
|---|---|
| Keyword/rule matching against taxonomy (word-boundary singles, verbatim phrases) | core (deterministic) |
| Alias/synonym layer (`aliases` per issue, e.g. "kicked out" → eviction) — dialect/paraphrase robustness without an LLM | core (deterministic) |
| Urgency flag (`emergency`/`urgent`/`routine`) from safety/time-pressure phrase lists | core (deterministic) |
| Plain-language date capture (`dates[]`, info-only — no year inference, no deadline math) | core (deterministic) |
| Confidence = winning issue's share of matched keyword weight | core (deterministic) |
| Confidence gate (default 0.4) → escalate to human, never guess | core (deterministic) |
| Clarifying question on low-confidence splits; `triage(text, { pick })` resolves deterministically | core (deterministic) |
| Multi-issue detection (top gap < 0.15 → serve both referrals) | core (deterministic) |
| Referral mapping + approved guidance entries (`guidance: [{ point, source }]`, process-only, one source link each) | rules-as-data (editable) |
| Escalation packet: full candidates (label + matched keywords) + matched fragments for staff review | core (deterministic) |
| Pre-normalizing spelling/dialect of the description | optional LLM pass (prompt below) |
| Reviewing escalations, final routing | human intake staff |

## Input / output contract

Input: `{ text: string, opts?: { taxonomy?, minConfidence?, multiIssueGap?, pick? } }`.
`pick` is the issue id chosen from a low-confidence result's
`clarifyingQuestion.options`; it resolves the split deterministically and
never introduces an issue the matcher did not surface.

Output (classified):
`{ status: 'classified', primaryIssue, primaryLabel, confidence,
multiIssue, matchedKeywords[], resolvedBy?, referrals[{issue,label,confidence,
legalAidCategory, serviceDescription, whereToGo, guidance[{point, source:
{name, url}}]}], otherCandidates[], urgency, dates[], disclaimer }`.

Output (escalated): `{ status: 'escalate', reason:
'no-keyword-match'|'low-confidence'|'invalid-pick', escalate, candidates[{issue,
label, confidence, matchedKeywords}], clarifyingQuestion?{question,
options[{id, label}]}, matchedFragments[], urgency, dates[], disclaimer }`.

`urgency` ∈ `emergency|urgent|routine` (phrase-list based);
`dates[]` holds raw date fragments (e.g. "March 3", "3/15") in text
order, info-only.

Refusal guarantees (tested):
- no match → escalate, no `primaryIssue` at all;
- below-gate → escalate, candidates listed but not served;
- a `pick` outside the matcher's candidates → escalate (`invalid-pick`), never classified;
- no `advice`-shaped fields anywhere in the response, guidance entries stay process-only;
- every served referral and guidance string exists verbatim in the taxonomy data.

## Prompt schema for the optional LLM pass

```jsonc
// System: "Normalize spelling and dialect ONLY. Do not classify, do not
// add facts, do not answer. Output the same meaning in standard English."
{ "normalized": "string", "changed": boolean }
```

The classifier always runs on the normalized text and stays deterministic.

## What's better than the closed counterpart

- The taxonomy, weights, gate, and referral map are open, editable data —
  a clinic can localize it without asking a vendor.
- Confidence-gated with visible math: users and staff see matched
  keywords and the confidence share; low confidence escalates instead of
  bluffing.
- Advice-free by construction and by test — the response schema has no
  place for advice to leak into.
- Zero dependencies, works offline in a browser tab (kiosk-friendly).
- Paraphrase robustness without an LLM: a 20-paraphrase golden set
  (`examples/paraphrases.json`) is machine-verified by the test suite —
  including 14 classified phrasings and 6 that still escalate on purpose.
