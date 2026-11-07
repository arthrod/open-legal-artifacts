# immigration-papers-reader

Open counterpart of Mobile Pathways' immigration papers reader (Claude for
Legal partner gallery). Case-type facts JSON in; deterministic first read
out:

- required-documents checklist per case type (rules-as-data: family-based,
  employment-based, affirmative asylum, naturalization);
- per-document status with exact date math — missing / present /
  expiring_soon (≤180d default) / expired;
- readiness score (expired counts against you; optional docs never count);
- key dates with days-until, urgent (≤14d) and already-passed warnings —
  loud in both directions;
- **referral flag** when complexity exceeds tool scope (criminal history,
  prior removal order, missed hearing, prior denial, detention, unlawful
  presence, removal defense) — refer, don't squeeze.

## Run

```bash
node --test "core/*.test.js"     # 16 tests
node examples/run.js             # regenerates output.json + checklist.md
```

Demo: `demo/index.html` (standalone, shared design tokens, prefilled with
the fictional Ferreira-Lindqvist employment-based case: 100% document
readiness yet referred for a prior denial).

## Better than the closed counterpart

The safety-critical parts — checklists, date math, referral — are auditable,
versioned data instead of a black box; the optional LLM capture step is
instructed to never guess a date and to surface uncertainty; and the
dependency-free core self-hosts for nonprofit budgets. Not legal advice.
