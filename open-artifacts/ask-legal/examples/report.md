# ask-legal — worked example (2026-11-07, Meridian Software Co. (fictional))

## Q: Which NDA template do I use for a new analytics vendor?

- asked by `j.moreau@example.test` · audit `AUD-00001`
- confidence: **high**
  - best match "Which NDA template should I use for a prospective vendor?" scored 17 (tags: nda, vendor; terms: nda, template, use, vendor)
  - score 17 ≥ high threshold 9
  - guidance verified 53d ago (within 365d window)
- answer (source `kb-001`): Use the Mutual NDA (Form L-102) for all prospective vendors; do not sign the vendor's own paper. Exceptions (shorter term, no residuals clause) route to Commercial Legal.

## Q: Can I expense client entertainment over $500 for the Halberd dinner?

- asked by `s.okafor@example.test` · audit `AUD-00002`
- confidence: **high**
  - best match "Can I expense client entertainment over $500?" scored 15 (tags: expenses; terms: expense, client, entertainment, over, 500)
  - score 15 ≥ high threshold 9
  - guidance verified 158d ago (within 365d window)
- answer (source `kb-003`): Entertainment above $500 requires pre-approval from Finance and the responsible partner, logged in the matter file before the event, not after.

## Q: How long do we retain website visitor data under the privacy policy?

- asked by `j.moreau@example.test` · audit `AUD-00003`
- confidence: **medium**
  - best match "How long do we retain website visitor data?" scored 18 (tags: privacy, data-retention; terms: long, retain, website, visitor, data, privacy, policy)
  - score 18 ≥ high threshold 9
  - guidance is 981d old (> 365d freshness window) — downgraded one tier
- answer (source `kb-005`) — **provisional**: Provisional guidance — confirm with Legal.: 26 months per the 2024 retention schedule, then anonymize or delete (Privacy Policy §9).

## Q: Do we need a license to launch a satellite for the marketing team?

- asked by `t.nguyen@example.test` · audit `AUD-00004`
- confidence: **low**
  - no knowledge-base entry matched any question term or tag
- **escalated to `legal-intake`** — no answer returned, nothing guessed

## Q: A reporter is asking about the outage — what do I say about the data privacy incident?

- asked by `s.okafor@example.test` · audit `AUD-00005`
- confidence: **high**
  - best match "How do I report a suspected data privacy incident?" scored 14 (tags: privacy, incident; terms: data, privacy, incident)
  - score 14 ≥ high threshold 9
  - guidance verified 8d ago (within 365d window)
- answer (source `kb-004`): Email security-incidents@example.test within 1 hour of discovery and do not discuss externally. Privacy Counsel decides on regulator notification under the incident runbook.

## Escalation tickets — deterministic drafts for the lawyer

Each escalation carries a ready-to-send intake ticket: route, question, asker, matched ids, reasons, and the closest KB entry (if any) to start from.

### → `legal-intake`

- question: Do we need a license to launch a satellite for the marketing team?
- asker: `t.nguyen@example.test`
- matched KB entries: none (zero overlap)
- why escalated:
  - no knowledge-base entry matched any question term or tag
- no KB entry came close — guidance gap for Legal to fill

## Audit log (every question, append-only)

```jsonl
{"auditId":"AUD-00001","ts":"2026-11-07","askedBy":"j.moreau@example.test","question":"Which NDA template do I use for a new analytics vendor?","matched":["kb-001","kb-002"],"confidenceLevel":"high","escalated":false,"route":null}
{"auditId":"AUD-00002","ts":"2026-11-07","askedBy":"s.okafor@example.test","question":"Can I expense client entertainment over $500 for the Halberd dinner?","matched":["kb-003"],"confidenceLevel":"high","escalated":false,"route":null}
{"auditId":"AUD-00003","ts":"2026-11-07","askedBy":"j.moreau@example.test","question":"How long do we retain website visitor data under the privacy policy?","matched":["kb-005","kb-004"],"confidenceLevel":"medium","escalated":false,"route":null}
{"auditId":"AUD-00004","ts":"2026-11-07","askedBy":"t.nguyen@example.test","question":"Do we need a license to launch a satellite for the marketing team?","matched":[],"confidenceLevel":"low","escalated":true,"route":"legal-intake"}
{"auditId":"AUD-00005","ts":"2026-11-07","askedBy":"s.okafor@example.test","question":"A reporter is asking about the outage — what do I say about the data privacy incident?","matched":["kb-004","kb-005"],"confidenceLevel":"high","escalated":false,"route":null}
```

_All data fictional. Guidance must be approved by the organization's legal team before use. Not legal advice._
