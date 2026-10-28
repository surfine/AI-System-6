<!-- canonical-source: docs/design/aaron-blog-grounding.md -->
<!-- source-sha256: bcb09312c13def63411af211f2e78dddef2c7f0455a85bce5bb834258347aade -->
<!-- 英文版为准，本文件仅供人类参考 -->

# 潮汐信笺证据检索 —— 把博客当作 SideAsk 语料

> 2026-10-24 · 潮汐信笺（aaronlau.me 阅读器）× SideAsk 实现说明。
> 是 `shared-ai-grounding.md` 那份契约上的第二个锚点。

## 原则

博客和桌面是同一个人做的，所以语料不靠爬：博客生成器在阅读器内容包旁边直接发布
自己的切块索引，桌面只负责取包、验哈希、缓存和排序。引用契约、模型调用和 chip
样式沿用剧情终端那套；潮汐信笺加上的是语料本身、按时间排列的成长线，以及回到被
引段落的路。

## 语料：`ai6/rag.json`（博客端）

`internal/design-proposals/aaronlau-me/build.mjs --ai6` 只在 AI6 内容包段落里写出：

- `ai6/rag.json` —— `{ schema: 1, kind: "aaronlau-rag", chunking: "top-block-v1", docs, chunks }`。
  - `docs[]`：`id、k（post|long|note）、t（标题）、d（日期）、u（aaronlau.me 网址）、g（标签）、s（系列）、a（1 = App-scope）`。
  - `chunks[]`：`d（文档序号）、p（块序号）、h（小标题）、x（正文）`；预言账本每条预测单独成块，
    `k: "pred"`、`p: -1`，带 `pr: { id, made, status, label, due, resolved, confidence }`。
- 一块 = 渲染后文章的一个顶层块（段落、列表、引用、表格）。`p` 是它在
  `.aaron-blog-article-body` 里的子元素序号，chip 据此滚动过去。小标题不单独成块，
  记在后续块上；超过 700 字的块在句末切开，`p` 不变。
- `ai6/long.json` 与 `index.longs` —— 长文（`/long/`）进包，阅读器能打开。有 AI System 6
  演示磁盘的带 `diskUrl`；没有磁盘的带 `origin` 和 `source: "原载 App-scope"`。
- `manifest.json` 新增 `rag: { path, sha256, bytes, docs, chunks }`，内容包的
  `contentHash` 也覆盖 `long.json` 和 `rag.json`。

用 2026-10-24 的内容（含 `aaronlau-site` 分支的 49 篇长文）生成：2,621 篇、9,225 块、
420 条预言块，未压缩 3.30 MB。

## 排序：`app/shared/blog-rag-runtime.js`

一个纯 UMD 模块，服务端 `require`、浏览器在阅读器打开时加载，两条路排序完全一致：

- 查询与正文都经过逐字的 OpenCC t2s 字表，繁体提问也能命中简体语料。
- 中文连续段切成相邻二元组，英文与数字切成小写词；BM25（k1 1.2、b 0.75），每块都并入标题。
- 去掉提问的套话（怎么看、看法、变化、他……）；一块必须覆盖剩余查询权重的一定比例，
  只命中一部分的降权，一个共享二元组不算证据。
- 时间是一等公民：问题里的年份是过滤（`2013 年`），区间是边界（`2013 到 2016`）；
  那一年没有命中时用其他年份回答，并标 `yearRelaxed`。「他的看法怎么变」这类问题每年取最好的一块，
  按日期从早到晚返回（`order: "chronological"`）。
- 每篇最多三块；从某一篇发问时，这篇的块排在前面。

不用嵌入：桌面的嵌入路线取决于接了哪个模型，词法索引离线可用、不用下载。

## 服务端：`/api/aaron-blog/retrieve`

`apps/server/server/routes/aaron-blog.js`（和阅读器内容包同一道固定、免会话的门）：

- 先取 `manifest.json` 再取 `rag.json`，SHA-256 与 manifest 不符就拒收；
- 验过的副本留在内存和磁盘（`~/.ai-system6/aaron-blog/`，或 `AI_SYSTEM6_AARON_BLOG_CACHE_DIR`）；
  博客连不上时用这份副本回答，标 `pack.offline: true`；
- `GET /api/aaron-blog/rag` 把同一份验过的字节交给阅读器；
- `AI_SYSTEM6_AARON_BLOG_PACK_DIR` 可指向本地 `dist/ai6`，新索引部署前就能试。

它不爬站，也不调用模型。

## 适配层：`app/core/aaron-blog-grounding.js`

`window.AISystem6AaronBlogGrounding`，接口形状与剧情终端的适配层相同：

- `searchForSideAsk(query, { signal })` —— 调检索路由，不调模型。
- `searchLocally(query)` —— 离线：对潮汐信笺存在 IndexedDB（`ais6-aaron-blog`，键 `rag`，
  manifest 的 `rag.sha256` 变了才刷新）里的包排序。
- `buildFromResults(results)` —— 一对一映射成证据来源：`kind: "aaronBlog"`、`[S1]…[Sn]`、
  `postId`、`para`、`quote`、`url`、`date`。
- `toSideAskContext(query, results, options)` / `anchorContext(lang)` —— 提示词段落：引用契约、
  每个论断带日期、成长线指示、年份放宽说明，以及无证据指示（直说博客没写过，不替作者作答）。
- `prepare(query)` —— 先服务端，再离线包，最后沿用上一问的证据（`fallback: true`）。
- `setScope({ type: "post", id, title, date } | { type: "blog" })`、`reveal(source)`。

它把自己登记进 SideAsk 的锚点表：`window.AISystem6SideAskAnchors.aaronBlog = { prepare, grounding, context, label, reveal }`。
`chat-messages.js` 只通过一个辅助函数 `anchorHook()` 读这张表，`window-manager.js` 从这里取配对标签，
以后再加检索型锚点不必再花启动字节。运行时和适配层不进任何启动清单：`app/features/aaron-blog.js`
在阅读器挂载时用 `ensureLazySystemModule` 加载两者（与剧情终端证据核心一样，登记在
`tests/features/orphan-sources.test.mjs`）。

## 数据流

1. 潮汐信笺同步：manifest → index →（后台）`rag` 存进 IndexedDB。
2. 用户点 **在 SideAsk 中问**（状态栏：整个博客；选了一段文字时问这篇）或 **问这篇**（文章头：这篇）。
   选中的段落成为问题的开头。
3. 锚点是 `aaronBlog` 时，每次 SideAsk 提问，`submitUserTextCore` 调用 `anchorHook()?.prepare(userText, signal)`。
4. `formatSideAskAnchorContext` 加入锚点的 `context()`；`captureClioTalkGroundingSnapshot`
   合并同一批来源，chip 照常渲染，每个 `[Sn]` 都可点（博客来源最多 24 条）。
5. 点 chip 调用 `reveal(source)`：打开潮汐信笺（窗口不在就建），打开那篇推送或长文，
   用 `p` 定位、用开头几个字确认，给被引的块加 `.is-cited` 标记；打不开就转去 aaronlau.me 原页。
   文章页脚也附上这篇在 aaronlau.me 的链接。

## 不变量

- 离开浏览器的只有问题文本和公开文章的 id；项目或个人资料不进这条检索。
- 不另起模型调用或证据格式化：模型就是 SideAsk 当前设定的模型来源。
- chip 沿用 `clio-basis-chip` / `message-grounding-*`；阅读器只加自己的提问链接和被引段落标记。
- 博客生成器的改动只在 `build.mjs` 的 AI6 内容包段落里。

## 测试

- `tests/integration/aaron-blog-grounding.test.mjs` —— 繁简折叠、二元组、年份过滤与放宽、时间顺序、
  预言与长文字段、单篇范围、编号与键、上下文措辞（中英、无证据）、检索请求、离线与沿用回退、chip 路由。
- `tests/features/aaron-blog-sideask-grounding.test.mjs` —— 真实本地服务器加夹具包：检索、哈希拒收、
  离线时磁盘副本回答、把验过的包交给阅读器，以及 chat-messages、window-manager、适配层登记、
  阅读器的接线；有构建产物时核对 `dist/ai6` 的 SHA-256。
- 回归：`aaron-blog`、`endfield-sideask-grounding`、`endfield-grounding`、`launch-intent`、
  `orphan-sources`、`lazy-module-reachable`、`verify:floppy`、`build:app`。
