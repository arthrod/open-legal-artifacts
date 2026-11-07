# AutoClaw Round 3 Entry Package — Contracts Playbook with Quote Verification

**What this is:** the entry package for the AutoClaw "Built with AutoClaw" competition, Round 3 (Nov 5–20 2026, UTC+8), Legal Practice featured track. Audience: the competition judges and anyone clicking through from the X post.

**Scope & premises:** the entry is one X post showing a legal task done with AutoClaw desktop (Legal Assistant). The demo is contracts playbook generation with quote verification. This package contains the post drafts, the evidence index, and this README. Publishing the post is the entrant's action, not part of this package.

**Version:** 2026-11-07, v1 — initial package for plan step S3.

## 1. The task

A lawyer (Arthur) receives a mutual NDA and needs the negotiating positions nailed down before review calls. He pastes the agreement into the AutoClaw-powered playbook tool and gets an ACC-style playbook draft:

- **Preferred position** per clause (term and survival, use and disclosure, compelled disclosure).
- **Ordered fallbacks** — what to concede, in what order.
- **Deal-breakers (avoid / no-go)** and escalation triggers.
- **Sample language** for each position.
- Red/yellow/green risk rating per rule.

The deliverable is the exported draft playbook — Markdown and DOCX — not a chat transcript. See `../artifacts/contracts-playbook/fixtures/sample.md` (repo path: `artifacts/contracts-playbook/fixtures/sample.md`) for the sample mutual-NDA playbook that the demo library serves.

## 2. How sources were checked

Three mechanisms, all visible in the demo:

1. **Quote verification per position.** Every playbook position carries a `source_quote` drawn from the instrument, and the engine verifies each quote against the pasted agreement text. Each position reports a status: `exact` (verbatim match), `normalized` (matches after whitespace/punctuation normalization), `fuzzy` (near match — review advised), or `not_found` (no match — the position is unverified and must be read by the lawyer). A position that cannot be grounded is shown as such, never silently trusted. Note: verification runs server-side against the (optionally redacted) text; placeholders appear on both sides, so redaction does not break matching.

2. **Fail-closed demo mode.** The public demo library serves one stored sample record from the val's SQLite database — it does not list or write other visitors' records. Stored-playbook read routes return 503 when the admin token is unset: access fails closed rather than falling open. Confirmed in the dogfood session (see evidence index, item E1).

3. **Confirm-before-save.** Extraction produces a *draft*; nothing reaches the database until the user reviews the positions and confirms. The exported sample carries the footer "Draft generated with AI assistance — review before relying on it."

The public sample record was written as a demo record, not produced by a live model call during the dogfood session; the live generation path (intent → elicit → extract → review → confirm) is what the tool runs on real input. Both facts are stated so judges aren't misled about what the screenshots show.

## 3. Deliverable pointers

| Item | Where |
|---|---|
| Sample playbook (Markdown) | `artifacts/contracts-playbook/fixtures/sample.md` |
| Sample playbook (DOCX) | `artifacts/contracts-playbook/fixtures/sample.docx` |
| Live demo | https://arthrod--cdf728ae-d937-11f1-a239-1607ee4eb77e.web.val.run/ |
| Repository | https://github.com/arthrod/open-legal-artifacts |
| Author site | https://arthur.law |
| Project page | https://arthur.law/projects/playbook/ |

## 4. What to attach to the post

- Screenshot: the playbook detail page showing the three positions with green/yellow badges and preferred/fallback/avoid/sample language (`dogfood-output/playbook-sample/screenshots/sample-detail-full.png`, local; re-capture from the live demo if a fresh shot with verification statuses is available).
- Optional: a cropped excerpt of the exported Markdown.

## 5. Publishing checklist (entrant's action)

1. Publish between **Nov 5 and Nov 20, 2026 (UTC+8)** — outside the window, the entry does not count.
2. Follow the official rules and the official post format (hashtags per the official examples, e.g. `#AutoClaw #GLMLegal`).
3. Pick one draft from `x-post.md`; adjust wording, then publish from the entrant's own X account.
4. Attach the screenshot(s) from §4 before posting.
5. Keep the repo and demo URLs live through judging.

Drafts are in `x-post.md`; the supporting evidence and what each item proves is in `evidence-index.md`.
