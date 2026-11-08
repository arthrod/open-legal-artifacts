# Code Review — run a3df9bf2 participant 46

No write tool exists in this read-only environment, so per the brief's "Inline ≤1600 chars" the verdict is delivered here in full.

**REVIEW — 10 demo rewrites, .zwork/diffs-v2 → tree (all files read; sizes estimated — no shell/wc available here)**

1) **Size ≤75KB (html+core+tokens): NOT VERIFIED EXACTLY, likely FAIL on most.** Exact line counts + width histograms give estimates: cite-check ~94KB, regulatory-horizon-scan ~95KB, playbook ~92KB, ask-legal ~80KB, tabular ~79KB, intake-queue ~78KB, intake-benchmark/jsm ~76KB over/borderline; obligations ~64KB, venture ~66KB under. Important — run `wc -c` to confirm; `deploy/vt-deploy.mjs:167` already warns >75KB.
2) **XSS: clean in 9/10.** esc() incl. `&quot;` at every sink, CSS.escape for selectors, escape-before-<mark>, safeUrl-gated links. FIX-REQUIRED venture only: `esc()` (index.html:164, textContent trick) omits `"` yet feeds double-quoted attrs (`value="${esc(...)}"` ~400–419 override editor, :197/:207 options) — attribute breakout from user override/JSON values; the ad-hoc `.replace(/"/g,'&quot;')` at ov-vals proves the gap. Fix: add `"`→`&quot;`.
3) **Persistence: SHIP all 10.** Vendored persist.js: probe+try/catch, JSON.parse→null guard, degrade→memory; logs have export and/or clear; display caps (rhs 200, tabular 60, venture 40). Nit: cite-check:201 / tabular:293 run core at boot on restored state unguarded (corrupt store = bricked page); obligations:514 rebuild-catch leaves reg null → filter click crashes.
4) **A11y: SHIP all 10.** aria-live everywhere, labeled inputs, aria-pressed, dialog+focus mgmt (ask-legal, playbook, jsm w/ focus trap + arrow-key grid), 12px floor holds (0.85rem=13.6px OK).
5) **Imports/network: SHIP.** Only ../core/core.js + pre-existing example.js/templates.js (templates.js is context, not added, cores-ts.patch:3198); zero fetch/XHR; fonts self-hosted woff2/woff/otf; data: icons.
6) **Signatures: SHIP.** All import names match exports; arities spot-checked incl. answerQuestion/applyCorrection/approveEntry, assign/decide/renderLetter/toICS, compare(after,before), buildMatrix(survey,asOf), toCSV(input,out), scanFeed(items,rubric,profile,asOf), benchmarkTermSheet(input,grid).

**Verdict:** ask-legal, intake-benchmark, intake-queue, obligations-checker, playbook, regulatory-horizon-scan, jurisdiction-survey-matrix, tabular-review: SHIP code, FIX-REQUIRED only on budget (verify wc -c). cite-check: same + Nit boot guard. venture: FIX-REQUIRED (esc quotes) + budget likely OK. Overall: request-changes (venture XSS gap + probable budget blowout on ≥4 artifacts).

DONE_WITH_CONCERNS