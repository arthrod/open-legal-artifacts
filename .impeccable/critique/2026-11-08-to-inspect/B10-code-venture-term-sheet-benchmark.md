# B10 — venture-term-sheet-benchmark vs "Term Sheet Benchmarking (Copy).html"

**Verdict: theirs wins, decisively.** Their single-file bundle is a full agentic benchmarking workspace (document ingestion with inlined pdf.js/DOCX readers, Claude-extracted readings verified word-for-word against document text, real dated WSGR Q1–Q3 2026 market figures across priced equity + SAFE + note instruments and 4 stages, share-based outlier placement with favor lean, decisions/approvers workflow, Word/Excel export, persistent per-round database). Ours is a thin but honest deterministic JSON-in/verdict-out comparator with 10 priced-equity terms, invented EXAMPLE numerics, and two confirmed correctness bugs. Our only real edges — deterministic LLM-free verdicts, typo guard, visible editable grid — do not close the gap.

Extraction: theirs at /tmp/b10/ (scripts split: data.js, bench.js, model.js, market.js, app.js); ours read in place. Both sides verified served (HTTP 200) at 127.0.0.1:8923. No browser capability in this session, so no screenshots (see §未覆盖).

## 必须修 (3)

1. **Range verdict detail text is garbled everywhere a unit exists** — `core/core.js` compareTerm range branch (both inside and outside paths): detail template `` `${v} ${entry.unit ?? ''}within …` `` produces "1.5 xis above the 1–1 xrange." (verified by run). Ships in the demo table, `exportMd`, `exportCsv`, and the committed `examples/output.json` line 8 ("detail": "1.5 xis above the 1–1 xrange."). Impact: every numeric verdict is user-visibly malformed — the artifact's core output sentence is broken text. Fix: add separators around the unit or drop it from prose.

2. **Booleans are scored as numbers against range entries** — `core/core.js` compareTerm: `Number(true) === 1` is finite, so `liquidation_preference_multiple: true` returns `inside_market` "1 xwithin…" (verified by run). A mis-typed JSON boolean silently passes as a 1x multiple instead of `unknown_value_type`. Same class as the typo guard the core advertises, but unguarded on the numeric side. Fix: reject `typeof value === 'boolean'` in the range branch.

3. **The "open counterpart" has no market data and no document path — it loses on its own thesis** — README/spec.md attack WSGR's "private deal base you can't inspect," but their bundle actually ships dated market figures (`data.js` CONFIG.benchmarks: WSGR "Venture deal terms, Q1–Q3 2026", source `provided: true`, read 2026-10-23; stage medians for pre-money/raise/cap; per-choice shares for 12+ structural terms), while ours ships zero real numbers (every range is `SRC_EXAMPLE`, "not market data") and zero ingestion (spec §"LLM-assisted (optional capture step)" ships as prose only — not even the extraction prompt exists in the demo). Coverage: theirs 28 positions across priced equity (E01–E15) + SAFE (S01–S04) + note (N01–N09), stages seed→series-c+; ours 10 priced-equity terms, pre_seed→series_b. Impact: on any real comparison a user gets real dated benchmarks + PDF/DOCX upload from theirs, and "replace all numbers yourself" from ours. Fix direction: bundle at least one dated, sourced public survey (e.g. published VC terms reports) as a second grid via `withGrid()`, extend terms to SAFE/note vocabulary, and ship the capture prompt as a demo affordance.

## 值得考虑 (4)

1. **Binary in/out vs share-based placement** — theirs places a choice by "seen in X% of financings" with outlier rule `<20% share AND favors a side" (bench.js `place()`, commonAt=20, factor=2); figures get ratio-to-median ("0.45x the median of $80M"). Ours says only inside/outside a min–max range. Even with example data, emitting a distance (ratio, band) would make verdicts informative; our p25/p50/p75 bands exist but only for 3 range entries and only inside-range.
2. **Round coverage stops at series_b** — `DEFAULT_GRID` has no series_c; their benchmark set covers series-c and later. A series_c sheet falls to the "No benchmark grid for round" warning.
3. **No-op ternary in exportCsv** — `core/core.js` exportCsv row: `typeof t.value === 'boolean' || typeof t.value === 'number' ? t.value : t.value` — both branches identical; dead code that reads like an unfinished escaping decision. Also `benchmark` renders a 1–1 range as "1–1 x".
4. **Demo has no paste-a-term-sheet affordance** — textarea JSON only; theirs accepts .txt/.md/.csv/.json/.log/.eml/.html/.docx/.pdf drag-in with per-file failure reporting. Even without LLM reading, a paste-text panel that pre-fills the JSON would narrow the usability gap.

## 仅记录

- Theirs' quote-verification design (every Claude reading looked up word-for-word in the extracted text; a person's value always wins; facts nobody found stay empty) is the anti-hallucination pattern our optional LLM step should copy if built.
- Theirs' benchmark honesty labels (illustrative vs sourced vs `provided: true`, checker script `check-data.mjs` refuses in-between states) match the sourcing discipline our grid labels aspire to.
- Our NVCA model-docs link verified live (nvca.org/model-legal-docs exists, "industry-embraced model documents for venture capital financings").
- Our 20 core tests pass (node --test, fail 0); examples regenerate deterministically.

## 审阅范围与未覆盖

- 核对主张：README/spec 的每条能力主张对照 `core/core.js` + `demo/index.html` + 实跑（20 tests + 6 条边案 probe）；their 侧以解包源码 + sample DB（32 文档节点）逐模块读，未运行其页面 JS（无浏览器）。
- 未覆盖：两侧均未做真实浏览器渲染/DOM/交互验证（本会话无 browser 工具，截图未产出）；their 的 Claude-chat 回路无法在本环境复现（需 Claude viewer 宿主）；nvca.org 直接 fetch 被拒，URL 经搜索结果间接核实。
- 标准按 B01：逐主张证据核对 + 正确性/安全/性能/可维护/风格分层；本报告按"偏袒对方"的红队立场撰写。
