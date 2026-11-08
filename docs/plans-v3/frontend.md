# Frontend plan — win-the-comparison (Planner 1 of 2, run a3df9bf2/21)

# FRONTEND PLAN — win-the-comparison, user-facing layer

**GOAL:** Turn 10 deterministic cores from spec-sheet REPLs into lawyer-grade product shells — workflows over already-shipped core fns, persistent audit, click-through anchors, rich exports, real-scale corpora, token-driven a11y/dark — without breaking LLM-free/dependency-free cores or the ≤80KB single-file demo constraint.

## P0

**WS-F0 · Fleet foundations (M, wave 1).** Fix tokens.css once, propagate to 33: 12px floor (kill 11px mono), token-driven dark mode (`[data-theme]` + `prefers-color-scheme`), drop the Google-Fonts `@import` (site-level self-host; offline degrades to system stack — ends the fonts.gstatic phone-home that contradicts "no data leaves"). Demo kit (~4KB, copied per-demo — duplication by design so the single-file inliner still works): `toast()`, `ariaLive()`, `download()`, `persistLog(key,row)/restore()` (localStorage JSONL, append-only), `tableCards()` (<480px table→stacked cards), `exportMenu()`. Inline data-URI favicon (kills the fleet-wide 404). Fleet lint (node, dep-free, headless census): fails any demo with font-size<12px, remote font import, unlabeled interactive controls, or file >80KB. **Accept:** lint green on 10 pair demos; ask-legal audit survives reload 7→7.

**WS-F1 · Persistence UX (S).** JSONL log + decisions persisted; visible log panel with filters and "export since date"; intake-queue decide/assign, obligations mark-done, review states rehydrate on reload. **Accept:** reload restores state byte-identical; NDJSON export == panel contents.

**WS-F2 · Surface shipped cores (M).** ask-legal: Legal view — pending-approvals queue over `applyCorrection`→`approveEntry` (approve/reject), `overdueEscalations` flags, escalation tickets become copyable queue artifacts; kill the "reimplementation of Anthropic's…" lede, lead with the guarantees. obligations-checker: mark-done + history, buttons for `toCSV`/`renderRegister`/`diffRegisters`, as-of compare. intake-queue: "needs a human now" strip from the existing stateRank sort; labeled controls + actor select. **Accept:** DOM test clicks approve→entry serves; diff renders; strip counts match table.

**WS-F3 · Kill the JSON front door (S).** Guided form per artifact (fields/selects/chips + prose paste-box), JSON demoted to an "Advanced" tab; empty-input toast; export confirmations; JSON errors mapped to "line N: …" via core `validate()`. All 10.

**WS-F4 · Hygiene UX (S).** Render `sourceUrl` only when valid (else inert text — pairs with backend validation), `esc()` sweep, MD/CSV as downloads not readonly textareas.

## P1

**WS-F5 · Citation→passage click-through (M)** — cite-check, tabular-review, playbook, horizon-scan: document drawer renders seeded source text; anchor click opens, scrolls, and highlights the exact span; copy-quote button. Consumes backend `locate()` (cached — also fixes the 16s/20-cell cost). **Accept:** click anchor highlights the span; drawer usable at 390px.

**WS-F6 · Rich-export UX (M)** — Word memo, XLSX, tracked-changes redline (playbook suggested-redlines; memos for jsm/horizon/tabular/vtsb) over backend dep-free writers; dated filenames, deterministic bytes; F0 `exportMenu` + confirmations.

**WS-F7 · Fleet polish (M)** — aria-live on results/filters, real `<label>`s, `th[scope]`, board scroll affordance (A06), enum humanization + one spelling per concept (`deal_breaker`→"Deal-breaker"; fix DEVIATE/deviates/deal_breaker mix), sticky first columns, a10 distribution bars (min/p50/max with value marker), visually demoted "example verdict" state (outline chip, never filled tint), "1x" when min=max.

**WS-F8 · Corpus presentation (L)** — jsm: true matrix grid (jurisdiction rows × question cols, sticky headers, needs-review/flagged filters, arrow-key nav, quick-jump strip) at ≥40×5; horizon-scan: lane timeline with Today marker, citation column (source/provenance already in the feed, dropped at render), filter chips, 30+ items; tabular-review ≥20 docs; vtsb multi-sheet rounds with per-term A/B/C compare; playbook 8 contracts × 10 positions; ask-legal KB ≥50 entries with owners/review-due. **Accept:** 51×5 renders in one screen-height grid; keyboard nav opens cells.

## P2

**WS-F9 (M)** per-row accept/negotiate/flag + persisted decision log (playbook/jsm/tabular/vtsb), search/sort, insights strips computed only from persisted state (counts, aging — no invented metrics). **WS-F10 (S)** "This answered it" writes a log row; copy-digest buttons.

## APIs needed from backend planner
1. `writeDocx(doc)→Uint8Array`, `writeXlsx(sheets)→Uint8Array`, `redlineDocx(base,edits)→Uint8Array` — pure JS, fixed dates, deterministic bytes
2. `extractText(File)→{text,pages[]}` (DOCX/PDF/txt, LLM-free)
3. `locate(text,anchor)→{start,end,page}|null`, cached
4. S1/S2-corrected cores, signatures unchanged
5. `validate(input)→{errors:[{path,msg,line?}]}` on every core
6. corpus data files in existing core schemas, fictional + [verify]-tagged real cites

**Waves:** F0 → F1–F4 parallel (no backend deps) → F5/F6 after APIs 1–3; F7 rides any wave; F8 after API 6 + F0; F9/F10 last.

**Fleet generalization (→33):** F0 kit+lint, F1 persistence, F3 forms, F4 hygiene, F7 polish are copy-patterns for all 33; corpus template + matrix/timeline/register components map directly (limitations-radar→timeline, matter-board→board, renewal-calendar→register+ICS).

**NON-goals:** no real partner/market data shipped (fictional + [verify] only); no server, multi-user, or sync; no LLM or runtime deps in demos; no full DOCX layout renderer (passage viewer is approximate and labeled so); no core rewrites (backend owns S1–S3); OCR out of scope.

**Pushback:** (a) A10's fix "ship a real dated grid (or partner data)" is wrong as stated — under the fictional-data+[verify] constraint and licensing reality, the honest fix is the demoted "example verdict" state + a documented grid-swap path; chasing WSGR numbers would import their unverifiable-provenance weakness. (b) A09's "verification is not a differentiator" is cope: their `checkedSources` is LLM-mediated and was source-read, never executed; ours is page-enforced — keep the claim and earn it with F5's viewer.

DONE