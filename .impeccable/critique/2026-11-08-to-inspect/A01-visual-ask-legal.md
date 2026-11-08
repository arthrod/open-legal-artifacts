# A01 — VISUAL CRITIQUE: ask-legal (OURS) vs "Ask legal (Copy)" (THEIRS)

Date: 2026-11-08 · Method: puppeteer-core + system Chrome, 1280×900 and 390×844, full flows exercised on both sides, console + pageerror captured.
OURS: `http://127.0.0.1:8923/open-artifacts/ask-legal/demo/index.html` (8.2 KB + core module)
THEIRS: `http://127.0.0.1:8923/_to_verify/Ask%20legal%20%28Copy%29.html` (3.5 MB single-file artifact)
Screenshots: `tmp/shots/to-inspect/A01-ask-legal/` (27 files, `ours-*` / `theirs-*`)

---

## 1 FIRST IMPRESSION

**OURS** (`ours-desktop-initial.png`): a spec sheet, not a product. Single cream column, monospace type, one yellow rule, a text input, four example chips, one answer card, one 8-column table. It loads instantly and the prefilled worked example is a nice touch, but the page *reads like documentation about a Q&A engine*. Independent visual read: "closer to a spec sheet or README than a product landing page." Nothing on screen suggests a lawyer would run a team on this.

**THEIRS** (`theirs-desktop-home.png`): a finished product. Dark, near-black canvas, cream text, a serif "Desks" heading, a framed desk card ("Ask legal (sample) · Tollbrook Legal · 5 Oct 2026"), a calm "Sample data" banner, an empty-state card with real copy ("Legal has not opened this page yet — For anything that cannot wait, contact the legal team directly."). Visual read: "near-monochrome, high polish, no garish accents; banner communicates transparently." It looks shipped.

**Verdict:** theirs, decisively. First impression is not close.

## 2 VISUAL DESIGN

**Typography.** OURS: one monospace family at 5 sizes; hierarchy is carried almost entirely by size and uppercase tracking (`h2::before` hairline). Consistent but monotone — the answer, the reasons, and the audit table all speak in the same voice. THEIRS: system sans at 14px for UI with a serif display face for titles ("Desks"), tight small-caps eyebrows, tabular numerals in metrics; clear three-tier hierarchy (page → section → item) with distinct voices for guidance text vs. chrome.

**Color.** OURS: cream/ink + one yellow accent + one warn tint; severity is three badge styles (high/medium/low) and nothing else. No dark mode. THEIRS: disciplined near-monochrome dark palette with functional color reserved for state (risk, SLA lateness, approval states); renders dark in test and supports explicit light via `data-theme` (found `color-scheme` handling in source). Color means something on every screen of theirs.

**Density & polish.** OURS: airy to the point of emptiness — 1,139 px tall and still looks sparse; long stretches of undifferentiated text. THEIRS: dense but calm — queue rows carry category · requester · team · risk · assignee · SLA in one line each (`theirs-desktop-drawer-acted.png` queue behind) without visual noise. Chips, avatars (initials), icons, toasts, drawer with scrim: a component system. OURS has cards, a table, and buttons.

**Polish defects ours:** favicon 404 (console); `ours-mobile-escalate.png` shows a 1,795-px-tall page whose 8-column table scrolls sideways inside a wrapper — usable, but it feels like a printout folded into a phone.

## 3 INTERACTION & UX

Flows actually exercised, both sides.

**THEIRS — colleague ask flow** (`theirs-desktop-ask-typed.png` → `theirs-desktop-ask-result.png`): type question → optional team select → **Ask** ("Matches your words against Legal's published guidance" tooltip). Returns multiple published answers, each with attribution ("From Maren Okonjo-Hale, reviewed 5 Oct 2026"), an inline disclaimer, and a **"This answers it"** feedback button. Below: an adaptive intake form — "Legal usually asks for this. Answer what you can, or send without" — whose follow-up questions changed with the match (NDA match → "Who is the other party…? Whose NDA is it: ours or theirs? What will be shared…?"), plus category chips, urgency, attach-contract with an access-rules note ("only you and Legal can read the contract"), and Send to Legal.
- **No match** (`theirs-desktop-ask-nomatch.png`): "Legal hasn't published an answer to this" → same structured intake with a smarter generic first question ("What decision are you trying to make, and by when?").
- **Empty input**: toast "Say what you need first — A sentence or two is enough." (captured in `#toasts`).
- **Missing team** (mobile run): toast "Pick your team first — Guidance is matched to your team." (`theirs-mobile-ask-result.png`).
- **Sensitive topic** (`theirs-desktop-ask-sensitive.png`): "Ask Legal to contact me" → dedicated mode: "Talk to a lawyer about this. **Only this title is stored.** A lawyer will contact you after they next open the inbox." with "Send my words to Legal anyway" and Cancel. Privilege-aware intake is a genuinely lawyer-grade idea.
- **Legal role**: inbox filters (All 8 / New 5 / Waiting 1 / Due or late 6) all recompute; search "NDA" live-filters to 2 rows and surfaces closed items separately (`theirs-desktop-queue-search.png`); request drawer has prev/next triage ("1 of 8").

**OURS** (`ours-desktop-*.png`): type → Ask/Enter → one answer card with confidence badge + reasons; three example chips demonstrate escalate-weak-match, escalate-no-match, provisional-stale. All of it works and is instant (deterministic core, no spinners needed). But:
- **Empty input is a silent no-op.** Verified: Ask with empty/whitespace input adds no row and renders nothing — zero feedback (`verify-ours.js`, isolated run).
- **Export audit log**: the download really fires (`ask-legal-audit.jsonl`, NDJSON, verified on disk) but the UI gives no confirmation, no toast, nothing.
- **No feedback loop**: no "this answered it", no thumbs, nothing. The loop ends at the answer.
- **Duplicate asks** log identical rows with no "you asked this 30s ago" hint (verified: same question 3× → 3 identical rows).

**Loading states:** neither needs them (both client-side); theirs still has aria-live on the result region, ours has no aria-live anywhere (source inspection).

## 4 INFORMATION DESIGN

**THEIRS.** Answer presentation: stacked guidance cards with attribution and per-card disclaimer — a colleague can act without reading a manual. Request triage: queue rows encode category/person/team/risk/route/SLA/status in a scannable line; the drawer (`theirs-desktop-drawer-request.png`) shows the **full attached contract text** and a clause-by-clause playbook deviation list — 13 findings captured, each severity-tagged (High/Medium/Low), each explaining the gap in plain language ("The vendor liability cap is three months' fees, against a required minimum of 12 months' fees."), each **cross-linked to the exact published guidance question** it violates, plus "Approve and send / Ask for more info." Guidance register (`theirs-desktop-guidance.png`): 130 entries segmented Published 126 / Drafts 2 / To review 13, with an approval card showing audience scoping (All staff / per-team / Lawyers only), provenance ("From Signature Authority Policy.pdf · Open in full"), Approved by / Review by, and "Approve and publish." Insights (`theirs-desktop-insights.png`): six ops metrics (Answered without a lawyer 14% of 28 asks; first-reply median 24 h; service level met 100%; median wait on the business 12.9 d), "The next guidance to write" (lawyer answers with no standing guidance behind them), review-cadence due dates with owners, **Copy digest** and **Export requests, CSV**.

**OURS.** One answer card (question, badge, answer text, source id, audit id, reasons list) and one audit table (id/ts/asked-by/question/matched/conf./escalated/route) with an NDJSON export. The table is genuinely good *as an audit artifact* — it is the only screen in either product that shows, per question: who asked, what matched, the confidence, and where it escalated. But it is one table. No filters, no segmentation, no triage, no metrics, no per-answer drill-down, and the escalation "ticket draft" is a sentence in a div — no copy button, no export, no queue.

## 5 TRUST SIGNALS FOR LAWYERS

**THEIRS.** Attribution with review dates on every answer; per-answer audience scoping; document provenance with "Legal's position, quoted from the document"; standing disclaimers ("General guidance from Legal, not advice on your specific situation." pinned in `#legal-note`); data-minimization promise in the sensitive flow; approval workflow ("Colleagues see only what you approve."); honest view-only framing ("View only", "Not sent: this desk is sample data"). The entire trust model of a legal department is represented.

**OURS.** The one thing theirs does *not* have: a per-question **append-only audit log** with audit ids, timestamps, asker, matched entries, confidence level, and escalation route — exportable as NDJSON. Plus the strongest stance in either product: "an optional LLM may only rephrase approved answers… never generate new legal content," and "low confidence escalates instead of guessing" is demonstrated live (three escalation paths exercised). But: the log **evaporates on reload** (verified: 7 rows → 1 after reload; only the prefilled example remains), which undercuts "append-only" as a claim — it is append-only *per page view*. No attribution, no review dates, no audience scoping, no approval step in the demo.

## 6 FLAWS IN OURS (every finding verified unless noted)

1. **Toy knowledge base.** 5 entries for fictional "Meridian Software Co." The lede even advertises the smallness ("5 approved guidance entries"). A lawyer evaluating this sees a stub. — `ours-desktop-initial.png`
2. **The demo hides its own best machinery.** Core exports `approveEntry`, `applyCorrection`, `overdueEscalations` (verified via module import), and the answer card *talks about* the correction loop ("A correction can re-enter the KB as pending-approval") — but there is no UI for any of it. The approval workflow exists only as prose inside an escalation card. — source inspection + `ours-desktop-escalate-weakmatch.png`
3. **Audit log does not persist.** Reload wipes every question (verified 7→1). "Append-only" is true only within a page lifetime; the NDJSON export is the only escape hatch and is manual. — `verify` run, `ours-desktop-gibberish.png` → reload
4. **Silent empty-input no-op.** Ask with empty box: nothing happens, nothing is said (verified in isolation; no DOM change, no row). Fails the most basic feedback test. — `verify-ours.js`
5. **Export has zero feedback.** File downloads (verified) but no confirmation, toast, or state change — a user cannot tell whether anything happened.
6. **No answer feedback loop.** Nothing like theirs' "This answers it"; no way to close the loop or feed guidance gaps back.
7. **Single-answer presentation.** One matched entry per ask; no ranked multi-match, no "related guidance" chips, no per-answer provenance or review date.
8. **Escalation output is inert prose.** "Ticket draft for the lawyer — closest entry KB-004…" is a sentence, not an artifact: no copy, no export, no queue, no assignee.
9. **8-column audit table at 390 px.** Horizontal scroll wrapper prevents overflow (verified 0 px page overflow) but the table is an orphan on mobile; page balloons to 1,795 px. — `ours-mobile-escalate.png`
10. **Console error on load.** `favicon.ico` 404. — both viewports
11. **No ARIA live regions, no focus management** on the answer region (source inspection — not run with a screen reader).
12. **Duplicate questions pile up undeduped** with no "asked before" hint (verified 3 identical rows).
13. **Self-sabotaging framing.** The lede defines ours as "Open reimplementation of Anthropic's closed artifact" — it positions itself as a copy in the first paragraph.
14. **One visual register.** Severity exists only as three badge variants; no color system for risk/SLA/state; no dark mode.

## 7 STRENGTHS OF THEIRS (charitable read, with evidence)

1. **A complete, coherent product loop.** Ask → guidance match → structured intake → legal inbox → playbook review → guidance publication → insights. Every stage was reached by actually clicking (screenshots 2–3, 4 §4).
2. **Guidance answers behave like legal publications.** Author, review date, audience scope, quoted position from a named source document, disclaimer, feedback button (§4).
3. **The drawer is a lawyer's workbench.** Full contract text plus 13 clause-level deviations, severity-tagged, cross-linked to the governing guidance question, with approve/request-info actions and keyboard-style prev/next triage (`theirs-desktop-drawer-request.png`).
4. **Privilege-aware intake.** The sensitive flow stores only a title and promises lawyer-initiated contact — exactly the behavior employment/dispute questions require (`theirs-desktop-ask-sensitive.png`).
5. **Feedback discipline.** Toasts for every validation failure (empty input, missing team), banners for view-only/sample-data mode, empty states with useful copy on the home screen.
6. **SLA consciousness everywhere.** "18 hours late", "Due in 8 hours", Due-or-late=6 filter — the product thinks in deadlines the way legal teams do.
7. **Insights that manage the guidance asset**: % answered without a lawyer, guidance gaps derived from lawyer answers, 30-day review cadence with owners and due dates, CSV export and digest copy (`theirs-desktop-insights.png`).
8. **Honest about being a demo** — "View only", "Sample data", "Not sent" notices are prominent rather than hidden.
9. **Mobile handled**: 0 px overflow, working drawer, legible rows, toasts (`theirs-mobile-desk.png`, `theirs-mobile-drawer.png`).
10. **Zero page errors** in a 3.5 MB bundle (the three Anthropic-font 404s are an artifact of extraction, and the serif fallback still renders intentionally).

Known limitations (noted, not scored): all data is sample data; writes do not persist (only `legal-front-door:last-desk` in localStorage; verified via reload + storage keys); insight numbers are static.

## 8 SCORECARD

| dimension | theirs | ours | why |
|---|---|---|---|
| First impression | **W** | | Shipped product vs. spec sheet (§1) |
| Typography & hierarchy | **W** | | Three-tier system w/ serif display vs. one mono voice |
| Color & theming | **W** | | Functional state color + dark mode vs. 1 accent, light-only |
| Layout & density | **W** | | Information-dense calm vs. airy sparseness |
| Interaction depth | **W** | | 2 roles × 6 views, drawer triage vs. input+table |
| Feedback & error/empty states | **W** | | Toasts, banners, empty states vs. silent no-ops |
| Guidance matching (as demoed) | **W** | | 130 team-scoped entries, multi-answer, feedback vs. 5 entries, single answer |
| Triage & workflow (inbox/approvals) | **W** | | Full queue+approval workflow vs. none exposed |
| Information design (answers/tables/filters) | **W** | | Filterable queue, register, metrics vs. one static table |
| Trust surface for lawyers | **W** | | Attribution, scoping, provenance, disclaimers vs. disclaimer text only |
| **Audit trail per question** | | **W** | The one undeniably-ours win: append-only in-session log w/ confidence + route + NDJSON export; theirs has request CSV but no per-ask confidence audit |
| "No guessing" escalation stance | | **W** | Live-demonstrated refusal-to-answer with ticket draft; theirs never shows a low-confidence refusal |
| Load weight & speed | | **W** | 8 KB, instant, zero deps vs. 3.5 MB, ~3 s boot (both measured) |
| Persistence | **W** | | Neither persists meaningfully, but theirs keeps last-desk + admits it; ours silently wipes the log it calls append-only |
| Mobile | **W** | | Both 0 px overflow; theirs adapts components, ours scrolls a wide table |
| Console health | **W** | | 1 vs 5 404s is ours' edge, but favicon 404 shared and neither has page errors — tie defaults theirs |

**Score: theirs 13, ours 3.**

## 9 WHAT OURS MUST DO TO WIN

Prioritized, concrete:

1. **Ship the core you already have** (highest leverage, lowest cost). `approveEntry`, `applyCorrection`, `overdueEscalations` exist in core.js — build the Legal view around them: pending-approvals list, approve/reject, correction → pending-approval re-entry, overdue review flags. Today the demo's best story is dead code.
2. **Grow the KB to a believable register** (50+ entries): owners, review-due dates, source documents, team scoping. Show staleness as a register state, not one canned example.
3. **Rebuild the answer card to legal-publication standard:** author + reviewed date + source doc per answer, inline disclaimer, ranked multi-match, and a "this answered it" control that writes to the log.
4. **Give escalations a body.** Ticket draft → copyable/exportable artifact with suggested assignee and route, surfaced in a Legal-side queue. Then ours' escalation path beats theirs' intake form on verifiability (it already logs; make it visible).
5. **Fix the feedback failures:** toast on empty input, toast/confirmation on export, aria-live on the answer region, dedupe warning on repeated questions. One afternoon of work.
6. **Persist the audit log** (localStorage append-only across sessions) with "export since date" — this converts the log from a demo prop into the product's differentiator and makes the "append-only" claim literally true.
7. **Kill the apologetic lede.** Lead with the guarantee ("low confidence escalates, LLM never generates legal content, every question audited"), not with "reimplementation of Anthropic's closed artifact."
8. **Visual system pass:** severity/SLA color scale, two-typeface hierarchy, dark mode; on mobile, collapse the audit table to stacked cards and keep the ask bar sticky.

Ours wins today only on: the per-question audit artifact, the demonstrated refusal-to-guess stance, and weight/speed. Everything else they ship and we narrate.

---
*Verification notes: all "verified" items were executed via puppeteer-core against the live pages on 2026-11-08 (scripts + raw logs in `tmp/critique-a01-scratch/`, workspace root). Visual characterizations of theirs' dark theme and our spec-sheet quality come from independent image analysis of the screenshots; DOM/CSS facts come from in-page evaluation; items marked "source inspection" were read from code, not executed.*
