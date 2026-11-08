# B02 — Cite check: theirs (`_to_verify/Cite check (Copy).html`) vs ours (`open-artifacts/cite-check/)

Red-team critique, biased against ours. All findings below were reproduced
empirically against the live TS core (`npx tsx` probes) and the `core.js` port
(same results both sides; parity test passes). Their inline JS was extracted to
`/tmp/b02/` (46 scripts; ~13.1k lines of first-party modules).

## 结论

打回。ours 的核心主张——"deterministic guards catch altered digits and silently
dropped tokens"、verbatim anchor、"never guesses"——有 3 条正确性漏洞当轮实测复现，
其中最严重的一条会让**插入否定词翻转语义的引文以 `normalized`（verbatim-verified
档）进入 LLM proposition 阶段**。同时必须直说：二者不在同一量级。theirs 是一个
13k 行的完整产品（Bluebook 引证解析 + id./supra 还原、T6 缩写表、108 行带置信度
与出处链接的规则目录、DOCX/PDF 摄取、CourtListener 核验、Word/CSV/MD 导出、持
久化、防注入的 Layer B prompts）；ours 是一个约 1.1k 行的 TS 库加一个静态单例演
示页，无文件上传、无摄取、无导出（除 MD/JSON 下载）。ours 唯一不可否认的优势是
它声明的窄轴：逐字匹配分类 + 可机检 anchor 的字节级可复现（33/33 测试含 TS↔JS
parity 通过）——但下面的 1 号洞恰好打穿这条主线。

## 必须修（3 条，均正确性层）

1. **静默插入完全无防护：插入 "not" 翻转语义的引文判 `normalized`，零提示，并按
   "verbatim-verified" 进入 LLM 阶段。**
   位置：`core/citecheck.ts:415-436`（normalized 分支的 notes 循环，
   `if (op.op !== 'delete') continue;` 只处理删除，插入 op 被跳过；number guard
   只覆盖数字 token）。
   复现（TS core，36-token 引文向源文插入 "not"）：
   `classification: normalized, similarity 0.971, notes: ["matches modulo
   case/punctuation/whitespace"], summary.checked = 1/1`。
   影响：`propositions.ts` 的 `buildPropositionPrompt` 只收 exact/normalized，
   `mergeVerdicts` 把这两档当 "verbatim-verified" 门控——一条翻转了含义的引文会
   被当作已逐字核验交给 LLM 判命题支持。对引文核验工具这是最不能错的错。
   修复方向：在 normalized 分支对称处理 insert/replace op——至少逐条注明插入的
   token；参照 number guard，插入实质词（或任何插入）时 cap 到 fuzzy。

2. **`exact` 判定的 anchor 可能指向一段并不逐字的文本。**
   位置：`core/citecheck.ts:406-408`（exact 分支直接采用 `bestWindow` 的窗口）+
   `core/textutil.ts:73`（并列分数取先出现的窗口；大小写/标点不同的同 token 窗口
   同样得 1 分）。
   复现：源文先出现小写重复句，后出现与引文逐字一致的句子 → 判 `exact`，但
   `anchor.verbatim` 以小写开头，`anchor.verbatim === quote` 为 false。
   影响：违反 spec 的输出契约（"Every located quote carries a verbatim
   anchor"）；报告中作为证据引用的 verbatim 块引文不含引文原文。法律文本中重复
   祛声样板句（大小写有差）并不罕见。
   修复方向：exact 分支用 `locateRaw` 的 indexOf 位置，或校验
   `anchor.verbatim === quote.trim()` 不成立时回退到逐字位置。

3. **`Tr. 12:1` 在未按行分段的页上返回 `ok`（"single line"），违反 spec 明文。**
   位置：`core/citecheck.ts:291-293`。
   对照要求：spec.md:94-95 "page:line pinpoints validate **only** against pages
   whose text is line-segmented"、spec.md:62 "unparseable … never guessed"。
   复现：page text 无 `\n`，pinpoint `Tr. 12:1` → `status: ok, detail: "quote is
   located on page 12 (single line)"`；同一页 `Tr. 12:4` → `unverifiable`（同一
   函数内自相矛盾）。
   影响：粘贴成单行的页文本（常见）会让"第 1 行"的页行引证得到正面背书，而引擎
   实际无法知道行号。
   修复方向：无 `\n` 一律 `unverifiable`（detail: page not line-segmented），
   不按行号开例外。

## 值得考虑（4 条）

1. **fuzzy 档丢失数字守卫提示，违反 spec 承诺 "and is noted"（spec.md:75，
   citecheck.ts:440）。** 复现：`90→120` 的长引文 similarity 0.941 → fuzzy，notes
   只有通用 "substantial overlap" 一句，无 `quote "120" vs source "90"`。分类虽未
   放错，但编辑拿不到"数字被改"这一最关键的线索。建议数字守卫在 fuzzy 分支也跑
   一遍并注明。
2. **删除翻转词同样只注不降档。** 复现：删 "not" 后仍判 `normalized`（notes 有
   `omits "not" without an ellipsis`）。与 number guard 的 cap 逻辑不对称——
   "not" 的危害不小于改数字。考虑对否定词/情态词的删除也 cap 或显著标注。
3. **性能：窗口扫描为 O(sizes × 源token × 窗口) 且每窗重建 multiset、score=1 不
   早退。** 实测单条引文：30 页 163ms / 60 页 276ms / 120 页 548ms（线性）；外推
   300 页×50 行的整本笔录（约 24 万 token）单条 ≈5s，40 条引文 >180s（当轮探针
   即超时被杀）。作为浏览器内库会冻结标签页数分钟。滚动计数 + 命中 1.0 早退即可
   降一个量级。
4. **范围与 catalog 优先级不符 + 与 theirs 的产品差距要如实承认。** catalog/
   anthropic.md:33-34 写的是 "deterministic core (quote diff, **citation parsing
   via eyecite**)"，而 spec.md 明说 reporter-aware 解析 out of scope；extract.ts
   的脚注语法极窄（`“…”[1]` + 行首 `[1] Source, pinpoint`）。theirs 同名工件已实
   现自研引证解析（id./supra/short-form 还原、Bluebook T6、108 行带来源与置信度
   的规则目录、21st/22nd 版本差异）、DOCX(XML)/PDF 摄取与恢复、CourtListener 实
   时核验、Word/CSV/MD 导出、db 持久化、Claude Layer B（untrusted-fence + 字段
   白名单校验）。ours 演示页无上传、无持久化、无导出（仅 MD/JSON 下载）——是"库
   +样例"，不是可用工具。

## 仅记录

- 多 segment 窗口跨段时 `segmentAt` 只按首段标注（citecheck.ts:135-141）。
- omission 提示 cap 30 token，多句尾部删除只报下界（spec 已声明）。
- `at 123-24` 不解析 → 如实报 unparseable，可接受。
- demo XSS：动态内容全部过 `esc()`，静态样例，无注入面。
- 测试 33/33 通过（含 TS↔core.js parity on fixtures）；determinism 声明与
  examples/run.ts 结构一致（未重跑生成对比）。
- theirs 截图（兄弟任务已存 `tmp/shots/to-inspect/cite-check/theirs-*`）显示完整
  多屏应用：上传、findings、sources、export 菜单、"How this was checked"。

## 审阅范围与未覆盖

- 核对的主张：分类阶梯与两个 deterministic guard（实测打穿 2 处）、verbatim
  anchor 契约（打穿）、pinpoint 语法与验证（打穿 1 处）、extractor 语法（读代码，
  未压测畸形输入）、TS↔JS parity（跑测试）、demo 渲染（headless DOM 断言：
  "Checked 8 of 10" 与 README 一致）、性能（实测三档 + 大输入超时）。
- 标准来源：spec.md / README.md 的明文契约 + catalog/anthropic.md 的优先级描述；
  二者按"文档与方案"重心核对主张↔证据。
- 未覆盖：theirs 的 Layer B 端到端（需要 Claude 会话与真实文件，页面仅静态加
  载）；theirs 的 CourtListener 请求未实际发出核验（无网到该域的必要许可）；
  ours examples 的字节级再生成未跑（`npx tsx examples/run.ts` 留给父 agent 复
  跑）。ours 截图存 `tmp/shots/to-inspect/cite-check/ours-default.png`。
