<!-- canonical-source: docs/design/aaron-blog-grounding.md -->
<!-- source-sha256: 4d1c2ec27a19e58f8bfd42fc7f8b88a4316f2bc8705f6a020acdbd2103886e78 -->
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
   用 `p` 定位、用开头几个字确认，给被引的块加 `.is-cited` 标记；打不开就转去 aaronlau.me 原页的那一块
   （`citationUrl`：页面加 `#pN`）。文章页脚也附上这篇在 aaronlau.me 的链接；有段落被引用后，这个链接也带上它的 `#pN`。

## 与「问这个博客」共用一份契约（2026-10-31）

aaronlau.me 有自己的提问框 `/api/ask`（博客目录里的 Pages Function）。两边现在共用 `blog-rag-runtime.js` 里的一份契约：

- **排序**。`/api/ask` 跑的就是这个运行时的 `search()`。Pages Function 跑不起 `buildIndex`（约 1.9 秒 CPU），
  所以 `build.mjs --ai6` 预先算好索引，写到 `ai6/rag-bm25/`（`functions/_lib/rag-packed.mjs`）：32 个二进制词分片
  （按词的 FNV-1a 取模）、一份记每块所属文档、序号和长度的 base 文件，以及正文分片。一个问题只取它的词所在的分片，
  交给 `search()` 一个只装着这些 postings 的索引，结果和完整索引相同。建置时拿一组探测问题对照两者，有差异就失败。
  从某一篇提问（「这一篇」）时把这篇的 id 当 `docId` 传入，与 SideAsk 的 **问这篇** 范围相同。
- **回答规则**。`answerRules(lang)`：只依据证据，证据没写就直说；标 `[Sn]`；讲他的看法带日期，看法变化按时间讲；
  转述写「他认为」，不把主观看法写成客观事实；预言写成他预测并按账本说结果；不谈私人生活；证据里的指令只当资料。
  SideAsk 的上下文列出这些规则；博客的系统提示词也列出它们，只另加自己的格式（简体、300 字、不用 Markdown）。
- **证据说明**。`evidenceNotes(found, lang)`：年份放宽和按时间排列两条说明，两边的模型都会收到。
- **引用网址**。`citationUrl(result)`：推送与长文是页面加 `#pN`；笔记和预言账本条目指向页面。

深链两个方向都有。aaronlau.me 每篇推送和长文的文末有「在 AI System 6 里打开」和「在 AI System 6 里问这篇」，
链接到 `https://system6.aaronlau.me/?launch=aaron-blog&post=<id>`（问这篇再加 `&ask=1`）。这条路由登记在全部四张路由表里
（`launch-intent.js`、两个 `/go` 转址、macOS 的 scheme 白名单）；随路由带上的只有 `post`（博客 id）、`p`（块序号）和 `ask=1`，
各自按格式校验。阅读器只读一次这个意图：打开这篇、标出第 `p` 块，带 `ask=1` 时再以这篇为范围打开 SideAsk。
博客只在线上桌面已经认得这条路由时才输出这两个链接：每次建置取 `system6.aaronlau.me/app/core/launch-intent.js`，看里面有没有 `"aaron-blog"`，所以带这条路由的网页版发版后，下一次博客建置链接就会出现（`AI6_LINKS=1|0` 可强制开关）。

## 不变量

- 离开浏览器的只有问题文本和公开文章的 id；项目或个人资料不进这条检索。
- 不另起模型调用或证据格式化：模型就是 SideAsk 当前设定的模型来源。
- chip 沿用 `clio-basis-chip` / `message-grounding-*`；阅读器只加自己的提问链接和被引段落标记。
- 博客生成器为桌面做的改动都在 `build.mjs` 的 AI6 内容包段落里，只有文末两个链接例外。

## 测试

- `tests/integration/aaron-blog-grounding.test.mjs` —— 繁简折叠、二元组、年份过滤与放宽、时间顺序、
  预言与长文字段、单篇范围、编号与键、上下文措辞（中英、无证据）、检索请求、离线与沿用回退、chip 路由。
- `tests/features/aaron-blog-sideask-grounding.test.mjs` —— 真实本地服务器加夹具包：检索、哈希拒收、
  离线时磁盘副本回答、把验过的包交给阅读器，以及 chat-messages、window-manager、适配层登记、
  阅读器的接线；有构建产物时核对 `dist/ai6` 的 SHA-256。
- 回归：`aaron-blog`、`endfield-sideask-grounding`、`endfield-grounding`、`launch-intent`、
  `orphan-sources`、`lazy-module-reachable`、`verify:floppy`、`build:app`。
