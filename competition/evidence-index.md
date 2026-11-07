# Evidence Index — AutoClaw Round 3 Entry

**What this is:** an indexed list of the evidence behind each claim in the entry post and README, and what each item proves. Paths are workspace-relative; repo paths (under `tmp/open-legal-artifacts/`) map to the GitHub repo root.

**Version:** 2026-11-07, v1.

## E1. Dogfood session report

- **Path (local):** `dogfood-output/playbook-sample/report.md` · **Date:** 2026-11-06
- **Proves:** the full click path works end to end with zero defects — intent screen, sample library, playbook detail, downloads, duplicate-without-save, counterparty-review entry, mobile 390px, wordmark link, portfolio page.
- **Key checks recorded:** downloads saved local files with no API request; `GET /api/playbooks` without a token returned 503 ("read access is not configured") — the fail-closed claim; duplicate & edit issued no POST and added no public row; the banner discloses the sample is a stored demo record, not a live model call.

## E2. Playbook detail screenshot

- **Path:** `dogfood-output/playbook-sample/screenshots/sample-detail-full.png` (also `sample-detail-rules.png`, `sample-detail.png`)
- **Proves:** the deliverable exists in the UI — playbook #1, three positions (Term and survival GREEN, Use and disclosure GREEN, Compelled disclosure YELLOW) with preferred, ordered fallback, avoid, and sample language on the page. This is the recommended post attachment.

## E3. Exported deliverable (fixture files)

- **Repo path:** `artifacts/contracts-playbook/fixtures/sample.md` and `sample.docx`
- **Proves:** the export is a real, usable document: three ACC-style rules with fallbacks, deal-breakers, escalation triggers, sample language, and the AI-draft disclaimer footer. The .docx matches the Markdown content (dogfood report, step 4).

## E4. Download / copy screenshots

- **Path:** `dogfood-output/playbook-sample/screenshots/after-copy.png`
- **Proves:** "Copy markdown" works (button shows "COPIED ✓"); downloads are generated locally without an API request.

## E5. Confirm-before-save / no accidental writes

- **Paths:** `after-duplicate.png`, `library-after-duplicate.png`
- **Proves:** duplicate & edit opens the review step without a POST; the library shows the same single sample card afterward — no phantom records.

## E6. Counterparty review entry + cancel

- **Paths:** `review-entry.png`, `after-review-cancel.png`
- **Proves:** the counterparty-draft review path exists, parses in the browser, and cancels cleanly.

## E7. Fail-closed demo mode

- **Paths:** `initial.png` (SQLite demo-record banner), `library.png` (single SAMPLE card)
- **Proves:** the public library serves exactly one stored sample and discloses that it is a demo record; combined with the 503 in E1, access fails closed when the admin token is unset.

## E8. Mobile, wordmark, portfolio

- **Paths:** `mobile-sample.png`, `mobile-library.png`, `wordmark-arthur.png`, `portfolio-playbook.png`, `from-portfolio.png`
- **Prove:** 390px layout does not overflow; the wordmark links to arthur.law; the portfolio page links to the live demo. Supports the arthur.law link in the post/repo.

## E9. Not-a-bug record

- **Paths:** `library-open-immediate.png`, `library-settled.png`, `issue-001-result.png`, `videos/issue-001-repro.webm` (local `dogfood-output/playbook-sample/`)
- **Proves:** the brief "Checking library availability…" flash resolves in under a second — documented so nobody mistakes it for a stuck library if it appears during a live demo.

## E10. Quote verification outputs — **to attach before publishing**

- **Status:** pending. The verification statuses (`exact` / `normalized` / `fuzzy` / `not_found`) are specified in the demo design (plan step S3 brief) and the engine runs server-side against the pasted text (see `artifacts/contracts-playbook/frontend/index.tsx`, comment at the redaction/verification boundary). No captured verification output is in this workspace yet.
- **To do:** run one live generation, export the playbook with verification statuses, and attach that export (or a screenshot of a rule showing its `source_quote` + status) as E10 before publishing the post. If Draft B is chosen, this attachment is effectively required.
