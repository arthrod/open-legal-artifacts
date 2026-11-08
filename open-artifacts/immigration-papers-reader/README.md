# immigration-papers-reader

Open counterpart of Mobile Pathways' immigration papers reader (Claude for
Legal partner gallery). Paperwork text and/or case-type facts JSON in;
deterministic first read out:

- **notice parsing** — `parseNotice(text)` turns pasted (fictional) paperwork
  into facts JSON via per-form rules-as-data templates (I-797C, NTA, EAD
  I-766, I-693, ASC biometrics); every extracted value is traceable to a
  named template rule, and unreadable values land in `uncertain` — never
  guessed;
- required-documents checklist per case type (rules-as-data: family-based,
  employment-based, affirmative asylum, naturalization, TPS, U-visa);
- per-document status with exact date math — missing / present /
  expiring_soon (≤180d default) / expired / **uncertain** (capture honesty:
  uncertain docs are excluded from the ready count and warn);
- readiness score (expired and uncertain count against you; optional docs
  never count);
- **key-date taxonomy** — `hearing | filing_deadline | expiry | other`, each
  with loud per-type copy (a hearing date warns about in-absentia orders),
  sorted by days-until, plus a `next_action` line; a hearing date that has
  already passed auto-triggers the missed-hearing referral;
- **referral flag** when complexity exceeds tool scope (criminal history,
  prior removal order, missed hearing, prior denial, detention, unlawful
  presence, removal proceedings, removal defense) — refer, don't squeeze;
- **bilingual export** — `exportChecklistMd(r, { lang: 'en' | 'es' })`
  (Spanish is an unofficial translation);
- fully deterministic: `facts.today` is required — the core never reads the
  clock, so the same input gives byte-identical output every run.

## Run

```bash
node --test "core/*.test.js"     # 34 tests
node examples/run.js             # regenerates output.json + checklist.md
```

Demo: `demo/index.html` (standalone, shared design tokens, prefilled with
the fictional Ferreira-Lindqvist employment-based case: 100% document
readiness yet referred for a prior denial; paste the fictional biometrics
notice to see `parseNotice` merge typed facts into the case).

## Better than the closed counterpart

The safety-critical parts — extraction rules, checklists, date math,
referral — are auditable, versioned data instead of a black box: every
extracted value names its template rule, uncertainty is marked rather than
smoothed over, and the dependency-free core self-hosts for nonprofit
budgets. Not legal advice.
