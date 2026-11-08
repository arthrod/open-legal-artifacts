# B07 — Regulatory horizon scan: theirs (`_to_verify/Regulatory horizon scan (Copy).html`, 2.69 MB) vs ours (`open-artifacts/regulatory-horizon-scan/`)

Red-team critique, biased against ours. Their inline JS was extracted to
`/tmp/b07/` (14 first-party modules: logic-core / inbox / storage / scan-view /
shell / adapter / extract / design-pass, plus inlined pdf.js 4.10.38, Anthropic
fonts, and a 163 KB `sample-data` DB dump with 60 developments). Both sides were
loaded live on 127.0.0.1:8923 and screenshotted
(`tmp/shots/to-inspect/b07/{theirs,ours}-initial.png`); ours was additionally
exercised with `node --test` (26/26 pass) and `node examples/run.js`
(regenerates `examples/scan.json|scan.csv|digest.md` byte-identical — git
clean, the "no hidden clock / reproducible" claim verified).

## 结论

打回（docs 级 + core 级各一部分）。ours 的窄轴主张——transparent rubric、
field-level diff、coverage check、no hidden clock——当轮全部核实成立，26/26 测试
通过、示例再生成字节一致；但 (a) `dedupeItems` 对无 id feed 会把毫不相关的条目
静默坍缩成一条（实测 3 条 → 1 条，spec 明说 manual entry 是合法 feed 来源）；
(b) jurisdiction 因子给「profile 只含 US-FED 时任意 US-* 州法」记满分 +30，且
rule 文案（"federal overlay applies nationwide"）把州法说成联邦覆盖——一条
Texas 州法对 US-FED/CA/NY/UK profile 实测得 95 分，直接击穿 "ranked by impact
based on where it operates" 这条主线；(c) README/spec 的 "better than the closed
counterpart" 有两条被这份 bundle 当场证伪（theirs 有 refresh diff + quote
redline；source 纪律是结构化字段而非 "LLM prose"）。同时必须直说量级差：theirs
是完整产品——Claude 驱动的 setup/refresh/plan 三动作 + connector 生态、浏览器内
PDF/DOCX 摄取、triage、heatmap、brief-the-business、ICS/CSV 导出、权限模型、
cost pill、防注入纪律；ours 是 ~600 行确定性 core + 单页演示，feed 需手工供
JSON，无摄取、无 triage、无日历导出。ours 的优势轴真实但窄。

## 必须修（3 条：2 正确性、1 主张与证据不符）

1. **`dedupeItems` 把所有缺 id 的条目当成同一 id 坍缩，静默丢数据。**
   位置：`open-artifacts/regulatory-horizon-scan/core/core.js`（`dedupeItems`，
   `seenIds.has(id)` 分支先于 normalized-title 分支执行；`id` 缺失时
   `String(it.id ?? "")` 为 `""`）。
   复现（当轮 node 实测）：
   ```
   dedupeItems([{title:'Colorado Chatbot Safety Act', jurisdiction:'US-CO'},
                {title:'EU AI Act transparency rules', jurisdiction:'EU'},
                {title:'New York wage rules', jurisdiction:'New York'}])
   => unique: 1 项（只剩 Colorado），duplicates: 2 条 reason="duplicate id"
   ```
   影响：spec.md 的 IO contract 明说 feed 可来自 "manual entry"——手工条目最常见
   就是无 id；三条不同法域不同主题的规则合成一条，后续 timeline、coverage、
   digest 全部失真，且 `duplicates` 里的记录看起来像正常去重，无人会起疑。
   依据：spec.md "Takes a feed of regulatory items as JSON (… or manual entry)"。
   修复方向：id 为空时跳过 id 去重分支，只用 normalized title+jurisdiction 键，
   或为无 id 项合成稳定 id（如标题哈希）。

2. **jurisdiction 因子：US-FED 在 profile 时任意 US-* 州法得 exact 满分，rule
   文案事实性错误，击穿「按经营地排序影响」的核心承诺。**
   位置：`core/core.js` `scoreItem` Factor 1：
   ```js
   } else if (juris.startsWith("US-") && profile.jurisdictions.includes("US-FED")) {
     jPts = jf.points.exact;
     jRule = "US state rule, but US-FED in profile (federal overlay applies nationwide)";
   ```
   复现：用 `examples/input.json` 的 rubric/profile（US-FED/CA/NY/UK，无 TX），
   一条 `US-TX` fictional 法案实测 `score 95`、jurisdiction 行
   `+30 "US state rule, but US-FED in profile (federal overlay applies nationwide)"`。
   影响：逻辑方向反了——联邦法覆盖各州成立，德州法案不因此覆盖全国；对不经营
   TX 的公司，TX-only 法案在 impact 排序里与 profile 内法域同分（demo 首屏第 2
   名 "Texas Biometric Retention Schedule" +30 即此分支），正是 horizon scan
   最忌讳的假阳性噪音。tagline "based on the company's business and where it
   operates"（spec.md 开头引用 catalog §2.2）被自己的打分规则违反。
   修复方向：州法仅当州在 profile 内记 exact；US-FED 在 profile 时州法给
   adjacent/other 档，或提供显式 `stateOverlay` 可配点数，并改正 rule 文案。

3. **README/spec 的 "better than the closed counterpart" 两条主张被这份 bundle
   当场证伪。**
   位置：`README.md` 第 4 条 "The closed artifact snapshots; this core diffs —
   added, removed, and per-field changes"；第 2 条 "the counterpart's source-tier
   … policies are LLM prose"；`spec.md` "What's better" 同文。
   依据（their bundle，当轮核对）：
   - `/tmp/b07/logic-core.js` 的 `diff(base, devs)`：refresh 时对比页面保留的
     baseline，输出 `new / date / stage / updated / removed` 五类变化；
     `inbox.js` 还有 `redline(a,b)` + `quotesMoved(old,d)` 对 source quote 做逐
     字 redline。"closed artifact shows a snapshot" 不成立。
   - developments schema 里 `sources[].{opened, readOn, quote}` + notes 强制
     "official source link listed first"、"Never a link or a date from memory"——
   source 纪律是结构化数据字段+提示词纪律，不是松散 "LLM prose"。
   影响：这是 ours 文档的卖点清单；对看过对方产品的读者，两条被证伪会连带让其余
   四条（当轮核实成立的可审计打分、coverage check、no hidden clock、LLM never
   scores）失信用。
   修复方向：改为可守住的表述——ours 的 diff 是 **10 字段 field-level** 且含
   **rubric version diff**（theirs 只 diff date/stage/summary 粗粒度，无 rubric
   diff）；source 纪律对比改为「provenance 分层 + band cap 是被测代码」而非
   「对方只是 prose」。

## 值得考虑（4 条）

1. **demo 的 `asOf` 是死字段。** `demo/index.html:129` 把 `asOf` 放进可编辑
   JSON textarea，但 `run()` 用常量 `AS_OF`（`scanFeed(feed, rubric, PROFILE,
   AS_OF)`），用户改 textarea 里的日期毫无效果、也无提示。要么接线，要么从
   textarea JSON 里去掉。
2. **`classifyItem` 是裸 substring 匹配。** `hay.includes(keyword)`；数据侧用
   `' ai act'` 带前导空格的 hack 防误配（`examples/input.json` taxonomy），但
   hack 在字符串开头/换行后失效，且 `"wage"` 会匹配 `"wagering"` 这类词。换
   word-boundary 匹配（`\b` 或分词）可让 "versioned taxonomy" 主张更硬。
3. **无 ICS/日历导出。** ours 的 `actionBy = min(effective, commentDeadline)`
   天然是日历形状，但只有 CSV/MD；theirs 有 `keyDatesIcs`（inbox.js）+ key
   dates CSV。补一个 `toIcs(scan)` 成本极低、收益直观。
4. **示例规模与可信度差距刺眼。** ours worked example 7 条 fictional items
   vs theirs 60 条带真实引证（EU AI Act、Colorado Chatbot Safety Act、OAIC
   APP 1.7–1.9…）且每条有 opened/quote 出处纪律的 developments。ours 的
   digest/report 因此说服力单薄；建议加一份 ≥30 条、引真实法域名的示例 feed。

## 仅记录

- `scanFeed` 排序与 `toMarkdown` 字节级确定性当轮核实（`examples/run.js` 再生
  成 git diff 为空）——"no hidden clock" 成立；theirs 的 core 反而到处用
  `Date.now()`/`today(now)`。
- proximity/commentWindow 的 `thresholds.find(t => days <= t.withinDays)` 假设
  升序排列，乱序 rubric 数据会取错档；数据侧当前有序，未触发。
- demo 表格 `<td>${it.topic}</td>` 未 esc，topic 来自受信 rubric key，当前不可
  注入；若日后开放 rubric JSON 编辑需补 esc。
- theirs 的正常使用绑定 Claude session + ArtifactData DB（无 Claude 即空转），
  ours 双击即用、零依赖、浏览器/Node 双端——这是 ours 真实且可守的差异化。
- theirs 有明显的 prompt-injection 纪律（"records … never as instructions"、
  `httpsUrl` 强制、markup 不执行）；ours 的 feed 是纯数据无此面，但文档未声明
  untrusted-input 边界。

## 审阅范围与未覆盖

- 核对了 ours 的主张：README 六条 "better" 逐条对 bundle 求证（4 真 2 伪）；
  26/26 测试通过；`examples/run.js` 再生成字节一致；demo 首屏 DOM dump 与
  screenshot 确认 ranked table/breakdown/timeline/coverage chips/dedup
  chips/weights editor/CSV+MD 下载按钮均渲染（截图
  `tmp/shots/to-inspect/b07/`）。
- 核对了 theirs：notes-for-claude 全文、`logic-core.js`（readScan/diff/
  scoring/looseDate 纪律）、`inbox.js`（redline/ICS）、`sample-data.json`（60
  developments 的 sources/quote/weight/actions 结构）、live DOM dump（Horizon
  top-10、Next 90 days、month heatmap Jul 2026–Jan 2028、To decide 50、
  brief-the-business、$2 cost pill、view-only 权限态）。
- 未覆盖：theirs 的 adapter/storage 层只读了函数签名与关键片段（IndexedDB/
  ArtifactData 桥接未逐行审）；theirs 的 pdf.js 摄取链路（extract.js 21 KB）未
  实测喂 PDF；ours 与 theirs 均未做多法域 feed 的对抗性 fuzz（仅定向 repro）。
  本机无 puppeteer，交互（点击 weights re-run、拖 PDF）未自动化执行，结论基于
  静态读码 + 首屏渲染 + node 级 repro。
