# Visual sweep v4 — 2026-11-07/08 (post beat-the-gallery upgrade)

**Method:** puppeteer-core 25.x + system Chrome (headless), live HTTP
(python http.server :8923, repo root). Per demo: load shot → click every
visible control / fill paste-boxes with sample content → interacted shot →
390×844 mobile shot + `document.scrollWidth` measurement; console errors,
pageerrors and failed requests captured throughout. Scripts + raw JSON:
`/tmp/vis-sweep/` (session scratch); screenshots: `tmp/shots/visual-v4/<name>/`.

**Coverage:** all 31 non-original open artifacts. Result: 31/31 loaded and
rendered; 0 pageerrors, 0 failed app requests, 0 undefined/NaN/[object Object]
in body text. Load-time console entries were `favicon.ico` 404s only
(artifact of the static server, not the demos).

**Findings fixed in this round:**

1. `demo/tokens.css` truncated at `.t-eyebrow {` (unclosed at EOF) in the
   canonical `design/tokens.css` and all 36 demo copies — focus rules were
   nested inside the eyebrow selector, so no focus rings anywhere, eyebrow
   unstyled. Repaired canonically and propagated (33 open + 3 originals).
   Found by static audit of the (tool-blocked) pixel-inspector agents —
   verified before acting.
2. Mobile 390px horizontal overflow in 8 demos (ai-use-case-inventory,
   discovery-response-log, intake-queue, obligations-checker,
   patent-claim-comparison, pro-bono-case-board, renewal-calendar,
   venture-term-sheet-benchmark). Fleet fix in `tokens.css` (scrollable
   tables ≤480px, `max-width:100%` media/textarea) + 3 local fixes
   (venture `min-width:0`, renewal `.tier` wrap). Re-measured: all ≤390.
3. regulatory-horizon-scan demo: pageerror on "Apply weights & re-run"
   (`readWeights` — `thresholds[NaN]` from a string dataset index). Fixed
   (numeric index), click path re-verified clean, 0 pageerrors after.

**Not verified:** keyboard-only/a11y paths, deep multi-step flows beyond
single clicks, content of downloaded exports, tablet/desktop breakpoints
beyond 1280/390.
