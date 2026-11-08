# Keyboard/a11y sweep v4 — 2026-11-08 (post beat-the-gallery upgrade)

**Method:** puppeteer-core + system Chrome (headless), live HTTP (:8923).
Per demo: Tab cycling (~25 presses), computed-style focus-ring check
(`outline`/`box-shadow` on `:focus-visible` match) for buttons and
inputs/textareas/selects, trap detection, focus-visibility, reachability
of interactive elements; one focused-state screenshot per demo
(`tmp/shots/visual-v4/<name>/04-focus.png`). Script: `/tmp/kbd-sweep/kbd.cj`…`kbd.cjs`
(session scratch); full report in run receipts.

**Coverage:** all 33 demos (incl. the 2 original-idea artifacts).
**Result: 33/33 PASS** — visible focus rings everywhere (this is the
fleet-wide payoff of the `tokens.css` truncation repair), no keyboard
traps, no invisible-when-focused elements, Tab cycles wrap normally.
Suspicious "unreached" readings were re-verified per-demo by sequential
Tab tracing and confirmed to be key-dedup artifacts.

**Non-blocking finding (follow-up backlog):** ~22/33 demos have some
interactive controls without accessible names (icon-ish buttons, unlabeled
selects). Sample-level check only.

**Not verified:** Space-key activation (Enter-covered surface), pixel-level
reading of the focus screenshots.
