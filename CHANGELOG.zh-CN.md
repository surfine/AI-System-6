<!-- canonical-source: CHANGELOG.md -->
<!-- source-sha256: 325bad03a04fea986164cf56c4e6b612f63d08ca0e37dd8adbc82e926bed61d1 -->

# AI System 6 中文更新日志

英文版为准。本文档仅供人类参考，不被任何脚本读取。

这份 changelog 不是逐条提交记录，而是一条面向用户的产品成长线。它从
2026-05-18 的第一版开始，按时间正序回看 AI System 6 在一个月里如何从
“能跑的 AI 写作桌面”变成一个更本地、更可信、更像真实写作环境的系统。

仓库目前只有两个历史 tag：`pre-refactor-baseline` 和 `src-pilot`。因此下文
按日期阶段和可确认版本组织，不虚构不存在的 release tag，也不把内部提交逐条
搬进公开文档。

## 公开测试版 1.0.44 — 2026-08-16

- 云模型路由收敛到一个策略模块：「自动」选项按任务解析——评审与 HKRR 走
  DeepSeek V4 Pro，其余走 V4 Flash——每个任务还会在答案预算之外为思维链
  预留空间。此前按答案单独设定的预算会让过长的思考链耗尽额度，并以
  `finish_reason: "length"` 返回空消息。
- Searcher 的流式联网回答此前在静默失败：地址固定迫使其走缓冲式 Node
  传输，读取完整响应后才 resolve、拿不到流。现在传输会保持上游打开直到
  首个增量，并配有对应的契约测试。
- Micropolis 为 Retina 提供确定性的 2× 地块与精灵图集，由上游 1× 素材经
  新的可复现高清管线生成；对外坐标仍保持在逻辑 16px 网格上。
- Theme Lab 变成数据驱动的外观工作台：对象出处、各时代素材层级、token
  归属，以及十六个优先对象的谱系都以数据声明，并通过真实运行时渲染器
  绘制。
- Bonsai City 的 MIT 洁净模拟核心作为无头基座落地（带种子的确定性网格
  规则，无 DOM 无定时器），为后续窗口承载做好准备。
- 刻录「项目光盘」时打开「完成回执」：一个 Get Info 形态的窗口，每一行都
  回读自已保存的记录——字数、以不同存稿文本计的草稿数、从第一次修订到
  刻录的天数、开头被替换过几次，以及初稿中有哪些行仍留在成稿里（对两份
  行列表求最长公共子序列）。没有存储来源的事实宁可略去，也不估算。
- 写作面接管粘贴。`app/core/paste-markdown.js` 在本地同步地把剪贴板的
  `text/html` 转成 Markdown，保住标题、列表、强调、链接与表格。标题下限
  是承重规则：只有「大纲」可以接收 `##`，其余位置片段整体下压，使其最浅
  的标题变成 `###`，避免一次粘贴把文章切成新章节。
- 菜单栏对五处实测缺陷负责：快捷键标签经由同一个写入器，在切换应用后不再
  消失；四个 Go To 行如实汇报可用性，不再黑着却拒绝；三个印着借来快捷键
  的行现在各自拥有自己的「打开」与「新建」条目。
- Application Registry 增加可选生命周期——`onSuspend`、`onResume`、
  `onDispose`——由 MultiFinder 在窗口层级翻转、`visibilitychange` 与
  `pagehide` 时驱动。七个应用实现了它：三个游戏停掉各自的真实循环，并先
  释放按住的 SDL 输入；「配色工作台」把渲染循环从渲染器上摘下；「玻璃封面」
  停掉动效预览。不注册任何回调的应用行为完全不变。
- 写作桌面附件的四处实测缺陷：SideAsk 的按钮行把「追问」保在第一行
  （47px → 20px）；「写作铃」不再把一分钟的*设置*下限套到*剩余*时间上；
  悬浮「口述」按钮不再与 `.da-origin` 重叠（1,446px² → 0）；「接住这个
  念头」与「按下不表」一起进入「你停在哪」，不再只认快捷键。
- Searcher 按惰性窗口契约移出启动盘，进入 `lazyRuntimePaths`，腾出
  17,227 字节启动余量。

## v1.0.32 - 2026-08-09

- 正式支持的外观面收窄为三套：System 6（Classic）、Platinum 与 Liquid
  Glass。Aqua、Snow Leopard 与 Yosemite 转为研究外观：recipe、参照与
  fixture 全部保留，但不再出现在普通产品 UI、Control Panel 或 Special
  菜单中，也绝不会从已保存设置加载。
- 已保存的实验外观安全迁移：`aqua` 与 `snow-leopard` 解析为 Classic，
  `yosemite` 解析为 Liquid Glass；正式 `applyTheme` 路径完全拒绝研究主题。
- Theme Lab 退出生产运行时：其样式不再进入启动 bundle，改为通过专门的
  验证命令使用的开发/验收工具，不再是产品窗口。
- 公开验证接入设计系统：Turnstile 流程改为三套外观通用的系统
  finder-operation modal，所有文案进入翻译；Use Website AI 会在标记就绪
  之前先完成会话验证，而不是等第一次 401 才弹出。
- 公开仓库自洽：快照携带 `docs/RELEASE-SMOKE.md` 与 HIG 文档，排除引用
  私有文件的测试，并且在推送前真实执行 `npm ci` → `build` → `test` →
  `verify:checkjs`/`verify:version`/`verify:public`。
- Continue 现在优先恢复真实 Working Session（项目、应用、文档、窗口、
  选区、滚动位置），失败时才回退到最近草稿、最近项目文档或 Project Hard
  Disk。
- README 展示两条成熟写作路径——Draft Desk 写短稿、Writing Studio 做长
  项目——并只承诺三套正式外观。

## v1.0.33 - 2026-08-09

- Draft Desk 接入标准命令体系：⌘S / Ctrl+S 通过持久化公开 Save API 立即
  落盘，⌘W 在关闭前先落盘 pending/Modified 工作、失败绝不静默关闭，⌘N
  通过公开 New API 开始新草稿；编辑命令（撤销/重做/全选/剪切/复制/粘贴）
  在输入框聚焦时保持浏览器原生行为。
- Working Session 统一提交层：高频变化经 scheduleWorkingSessionCommit
  防抖，项目切换、Continue、关闭窗口等关键边界经 flushWorkingSessionCommit
  在归属权变化前先落盘。
- 模型错误统一映射为本地化文案 + 可执行的恢复动作（重新连接 / 选择其他
  模型 / 重试 / 检查连接）；裸 HTTP 状态码与 fetch 内部细节只出现在控制台
  与 System Status 详情，不再进入普通 UI。
- 公开测试分层：`tests/features/public/` 为 File Floppy、ClioStage、CMF
  Studio、Dictation、Menu Bar、Streaming Output、Cover Glass、ClioTalk
  提供 public-safe 契约，`npm test` 末尾打印公开产品覆盖摘要。
- Warm resume：刷新或同会话重开不再等待完整启动动画（人为等待 ≤300ms），
  新会话与显式 Restart 保留完整 Happy Mac 仪式；数据加载、迁移与 Working
  Session 恢复一律不跳过。
- IME 安全：统一组合输入守卫覆盖 Draft Desk、ClioTalk、弹窗、Reader、
  Start Here 与全局快捷键路由。
- 可访问性收口：纯图标控件全部具备可访问名称，契约测试锁定三套正式外观
  的键盘焦点、disabled 与 selected 状态。

## v1.0.34 - 2026-08-09

- Draft Desk 的 New 永远不会丢稿：未保存草稿先以“保存并新建”（默认）写入
  项目硬盘，已保存草稿则更新其现有文档；保存失败时 New 中止，旧稿原样保留。
  新空白稿获得全新身份——不继承文档 ID、Versions、合成或保护范围。
- 所有异步 Draft Desk AI 路径都绑定发起项目：Mingming、调整合成与 Develop
  只写回原项目；模型返回时若已切换项目则丢弃结果，绝不写入新项目。
- Draft Desk 模型错误统一接入 ModelUserErrors：状态栏只显示本地化文案与
  下一步，裸 HTTP 只留在控制台；恢复设置按路径路由（本地→本地 AI 设置，
  云端→云端设置）；全局 Retry 只重跑真正失败的 owner（Draft Desk 请求、
  调整合成或 ClioTalk 提交），并带过期项目/会话守卫。
- 两个 Web 实例不再互相覆盖：single-writer lease（BroadcastChannel +
  localStorage 兜底）让第二个窗口只读，其写入事务被拒绝并返回
  READ_ONLY_INSTANCE；可显式接管，旧窗口失去写权、取消 pending autosave，
  并提示刷新或以只读继续。
- 启动失败可恢复：Sad Mac 提供 Retry、不恢复窗口启动（只清除 Working
  Session）与极简 Recovery 面板（报告项目存储/项目数/工作会话/AI 配置，
  可导出项目备份、重置工作会话或重置 AI 连接）；boot 有重入守卫，此界面
  不提供破坏性重置。
- Warm resume 不再播放开机声（避免刷新后延迟补响）；显式 Restart 仍清除
  warm 标志并完整播放仪式。
- Draft Desk 帮助文案区分三种保存语义：⌘S 把工作稿保存在项目中、保存到
  项目硬盘会创建/更新可重新打开的文档、New 会先保留当前草稿。

## v1.0.35 - 2026-08-09

- single-writer lease 改为 fencing 而非信任内存：acquire 先写入再 read-back
  验证才成为 writer；heartbeat 只刷新仍属于本实例的 lease（绝不覆盖新
  owner）；release 只删除自己的 lease；每次写入事务都在写前经
  assertCanWrite 重新验证存储中的 owner。即使两个实例短暂都自认是 writer，
  写时也只可能有一个通过验证。
- Takeover 改为握手：请求方先让旧 writer flush Draft Desk、Working Session
  与桌面状态，收到 takeover-ready 才成为 writer；flush 失败则拒绝接管、
  旧稿保留；无响应会超时（绝不自动 force）；Force Take Over 仅限 stale
  owner 或用户显式确认风险。
- BFCache 与前台恢复时重新 reconcile lease：存储 owner 是自己→writer，
  无 owner→尝试 acquire，他人 fresh owner→只读，绝不自动接管。
- Startup Recovery 不再依赖桌面 runtime：新增 recovery-storage 层直接从
  IndexedDB 读取 projects/files/folders/scraps/trash/文档修订，列出真实
  可恢复项目，并无需挂载即可导出按项目的已验证备份。Retry、不恢复窗口启动
  与 Recovery 的重试启动都改为 location.reload() 进入全新 runtime。
- 只读在 UI 层诚实：body 标记 write mode，变更型表面（Draft Desk 正文与
  Save/New/Apply/Develop/Protect、TeachText 正文、Finder 重命名/删除/新建
  文件夹、项目新建/导入）被禁用；阅读、复制、分享、下载、导出备份仍可用。
- Retry 真正 async：同一时刻只有一个 retry（防双击）、await 回调、成功清
  owner、rejection 不会变成未处理 promise 错误。
- 研究外观（Aqua、Snow Leopard、Yosemite）保留 recipe、资产、canonical
  参照与 Theme Lab 支持，但只允许在开发环境通过 ?debugTheme= 预览；公开
  deployment 忽略该参数，始终回到已保存的正式外观。

## v1.0.36 - 2026-08-09

- Recovery 与正常导出共用同一个 Project Backup assembler：启动恢复面板导出
  的备份与正常 Project Hard Disk 备份 schema 完全一致。Recovery 从真实
  IndexedDB 源读取 Project CD 与 References，先 attach 再 verify，验证失败
  拒绝下载。
- Project Backup 走真实 validator 的 round-trip：复杂项目（嵌套文件夹、
  alias 文件、scraps、带 chunks 的 references、Project CD、trash、修订父链、
  Quick Draft 状态）导出、验证、remap 后所有 relation 仍指向存在对象——
  包括 Quick Draft 的 projectDocId（现会重映射到导入后的文档）。
- Takeover 按 instance id 定向到存储中的真正 writer，只读旁观者绝不应答。
  旧 writer 进入 handoff 模式：冻结新的用户编辑、让 pending 落盘完成，
  release 前复查存储 lease；flush 失败恢复 writer；flush 期间 lease 被抢则
  转只读。
- 研究预览默认拒绝：`?debugTheme=` 只在显式开发面（development capability
  或 loopback）生效；未解析的 deployment profile 绝不视为开发环境。
- 写入权限声明式化：变更型元素带 `data-requires-write`（UI 层冻结），
  action 路由在 handler 前拒绝变更型命令，IndexedDB 仍是最终 fence；
  Recovery 导出因只读事务而在只读实例中也可用。
- 提供可复现的 Developer ID / Hardened Runtime / notarize / staple 管线
  脚本与凭证契约。本环境没有签名身份，公证如实报告 NOT EXECUTED，beta
  在提供凭证前保留 ad-hoc 提示。

## 第一版 — 1.0.0 / 2026-05-18

AI System 6 最早并不是一个空壳演示。第一天，它已经有了现在仍然保留的
核心想法：把 AI 放进一个安静的 Macintosh 式桌面里，让写作沿着可见对象
一步步推进，而不是把所有内容都倒进一个聊天框。

- 核心写作路线已经成形：项目硬盘、文件软盘、Question Sheet、Outline、
  Section Drafts、TeachText、Review Desk 和项目光盘。
- 项目硬盘与 Reader 在第一天就开始承担“保存项目”和“阅读资料”的角色，
  写作不再只是一段临时对话。
- Writing Flow 被调成更安静、更顺序化的流程，让用户先整理问题、再搭结构、
  再进入段落和全文，而不是被一排 AI 按钮催着输出。
- 助手模型状态、TTFT/TPOT 性能指标、Intent Key 听写意图、多页便签本、
  显示简介、Print to AI、Clipboard Window、Export Disk、Import Utility、
  项目备份导出和更清楚的菜单结构，搭起了最早的 System 6 桌面词汇。

这一版的意义不是“功能已经很多”，而是产品方向已经很明确：AI 是帮手，写作
对象和保存动作必须可见，用户的材料不能悄悄消失在 prompt 里。

## 来源工作流 Alpha — 2026-05-19 至 2026-05-23

第二阶段的重点，是把“资料”从聊天框外部拉回桌面，让本地模型、Reader、
Scrapbook、DocMap 和 File Floppy 共同服务写作。

- 首次运行 API 设置、Windows 轻量默认值、Windows LM Studio 发现、直接
  loopback HTTP、模型发现与快速指标，让本地模型配置更接近普通用户能完成
  的路径。
- LM Studio 上下文加载、RAG 上下文预算、来源控制和富文档导入，让文件软盘
  从“临时文本框”变成真正的临时上下文对象。
- 支持材料快速扩展到富文档、PDF、图片 OCR、视频资料和 SRT 字幕。用户可以
  把更接近真实研究现场的资料塞进系统里，而不是只能粘贴纯文本。
- Study Studio、Scrapbook 写作动作、Reader 页面保存为来源、来源注册表、
  Memory Inspector 和 DocMap，让“我引用了什么、保存了什么、正在用什么”
  变得可见。
- Finder 文件管理、项目相册、写作导出、Reader 修复、本地模型性能优化和
  System 6 桌面细节，让项目从原型进入可用 alpha。

用户能感到的变化是：AI System 6 不再只是会回答，它开始能承载一个项目的
资料、草稿、摘录和地图。

## 云模型、打包与支线项目 — 2026-05-24 至 2026-05-26

接下来，系统开始从“本地模型优先”扩展成“本地与云模型并存”，同时补齐打包
和支线实验。

- 云模型支持加入到 LM Studio 旁边：provider 状态检查、云端模型列表、云端
  chat、云端 embeddings、上下文窗口显示、密码输入样式和本地文本修复兜底
  陆续落地。
- ClioTalk 的窗口行为、模型选择 popover 和上下文显示被修好，使用云模型时
  不再像临时外挂。
- 打包资产开始追上真实功能：导入、OCR、PDF、MarkItDown、生成 bundle 和
  运行时资源都被纳入发布考虑。
- Endfield Terminal 被集成进主项目，同时保留独立 archive prototype 与共享
  服务端路由。

这一阶段让 AI System 6 从个人开发预览向“可分发、可配置、可扩展”的桌面
应用靠近。

## 服务端重构与发布门禁 — 2026-05-27 至 2026-05-29

5 月 27 日是工程结构的一次大换骨。用户未必会直接看见目录变化，但会受益于
更清楚的边界、更稳的导入、更严格的发布检查。

- 项目文档被合并到 `CLAUDE.md`，成为人和 agent 共同遵守的单一事实来源；
  `CLAUDE.zh-CN.md` 作为中文参考镜像保留。
- 服务端从根目录 `server.js` 迁移到 `apps/server/server.js`，拆出 route table、
  shared libraries、focused route handlers 和 importers。
- `/api/version`、云模型、本地模型、导入、Reader、Searcher、Endfield、
  静态文件服务与 import-text parity 被陆续迁移到新的 `apps/server/` 结构。
- `verify:release` 开始包含 src typecheck；CSS、design、data、docs、
  smoke、floppy budget 和 packaging 也被纳入更严格的发布验证。
- prompt 本地化、Reader 字幕翻译和包装行为继续被修补。

这一阶段的关键进步，是把“能跑”变成“更不容易漂”。它也为后面快速加入
Cover Glass、CMF Studio、本地视觉和音频导入打下了结构基础。

## 来源写作成熟期 — 2026-05-30 至 2026-05-31

到 5 月底，AI System 6 开始更像一个能陪用户完成真实写作周期的工具，而不
只是一个功能集合。

- 应用版本与构建戳推进到 `1.0.2` / `20260530.0`。
- Reader tabs 对齐 TDI 式标签系统，并加入响应式模式，阅读窗口更适合长时间
  使用。
- 保存过的 references 能在项目硬盘中看见，并重新从 Reader 打开，项目里的
  资料变得更耐久。
- Source citations、TeachText focus modes、Memory Cards 图标重绘和
  Section Draft 布局 polish，让“从资料到草稿再到审阅”的路线更顺。
- TeachText 与 Writing Flow 的连接更稳，段落草稿、全文和 Review Desk 不再
  像几个孤立窗口。

用户能感到的变化是：项目不是一次性会话了。资料能留下，引用能回来，草稿能
继续。

## 创意实验室与引导重写 — 2026-06-03 至 2026-06-11

6 月上旬，AI System 6 在不打断主写作路线的前提下，开始长出更有创造力的
“召唤式工具”。

- Liquid Cover 作为懒加载工具加入，后来更名为 Cover Glass。它不是写作路线
  的新关卡，而是需要时打开的封面制作工具。
- CMF Studio 加入，成为设备颜色、材料和表面处理的工作台，并带有服务端
  USDZ preview / export 支持。
- 帮助和 onboarding 被重写：先解释第一条写作路线，再解释工具箱，避免用户
  一进来就被功能清单淹没。
- DocMap 增加两侧平衡布局和更强的 Print Map to PDF，让文档地图可以离开
  浏览器，变成能打印、能交付、能带走的对象。
- Writing Flow 与 TeachText 的布局和 focus 继续被打磨，Question Sheet、
  Outline、Section Drafts、Manuscript、Review Desk 之间的关系更清楚。

这一阶段让产品从“写作系统”往“完整创作桌面”扩展，但仍然守住一个原则：
主线写作路线保持安静，创意工具按需出现。

## 信任层与本地模型基础 — 1.0.10 / 2026-06-13

截至 `20260613.1`，AI System 6 的变化已经不仅是功能变多，而是信任层、
模型层、来源层和创意工具一起变厚了。

- Cover Glass 已经从 Liquid Glass shader 实验成长为完整封面工具：文字层、
  形状层、可读的 solid title、iOS 27 与 9to5Mac 预设、按背景自适应的阴影
  和 tint、背景生成支持、高清导出，以及 WebGL 不可用时的可见兜底。
- Humanizer guardrail 与 System Integrity guardrail 进入写作栈：模型要保留
  写作者的粗糙、犹豫和个人细节，避免通用 AI 腔；来源对象只被当成资料，
  不能被当成指令；没有 UI 状态或工具结果证明时，不能声称已经保存、摘录、
  插入、导出、联网、检索、索引、记住或事实核查。
- Writing Tools prompt registry 让 Proofread、Rewrite、Summary、Key Points、
  Tables 和 Describe Change 更像系统级文本服务：直接改文本时只返回文本，
  总结时不冒充回答，改写时保留事实、数字、日期、姓名、引用和用户声音。
- Context Gist 把项目上下文压缩成分层摘要卡：先给粗粒度 gist，只有匹配
  问题时才展开细节；遇到 fact-check、来源审阅和高风险重建任务，会退回原始
  excerpt，避免压缩损失关键证据。
- Dictation Pad 现在能按目标写作表面整理听写：给 Question Sheet 的听写会
  保留真实问题、收件人、反对意见和使用细节；给 TeachText、Scrapbook 或
  Note Pad 的听写会遵守不同边界，不把口述强行改成 AI 成文。
- File Floppy 支持音频录音导入：可以接 Whisper、whisper.cpp、MLX 等本地
  STT 命令，也能在 macOS 上使用 Speech fallback；转录结果带时间戳，并可用
  本地 Qwen 做保守格式修复。
- 本地模型支持扩展到现代 Qwen 与 Gemma 4 名称、任务感知采样、no-thinking
  payload、本地视觉请求、图片 OCR 和写作上下文图片阅读。
- Review Desk 新增更细的交付审阅路径，例如“若是落落会怎么接”和后台审校：
  外发短卡保持短、可复制、低压力；后台审校保留事实护栏和不可删内容，避免把
  私人合作判断混进交付文字。

用户能感到的变化是：AI System 6 不只是“更会写”，而是更懂哪些东西不能乱写、
哪些来源不能乱信、哪些动作不能乱宣称，以及什么时候应该让用户自己的语言留下来。

## System.css 对齐与主题收口 — 2026-06-16

这一轮把 Classic 复古外观更严格地对齐到仓库里的 `system.css` 参考，同时让
Liquid Glass 继续作为独立材质存在，而不是被复古修正误伤。

- Classic 的滚动条、标题栏、关闭/缩放按钮、checkbox、radio button 和 select
  menu 更直接地使用 `system.css-reference` 里的资产与几何比例。
- 标题栏收敛到与 app 图标一致的五条条纹比例，标题居中，System 6 控制按钮按
  同一比例缩放。
- 控制面板和相关表单控件继续走 System 6 select harness；select 保留圆角，
  radio 使用 12px 位图外圈和中心点，checkbox 使用方形位图风格，同时这些决定
  不外溢到 Liquid Glass。
- Liquid Glass 保留自己的材质语言：窗口 chrome、菜单 chip 和表单控件继续使用
  glass tokens；云端模型和项目切换这两个菜单栏按钮从完整胶囊收回为更紧凑的
  圆角矩形。
- 桌面层级收回到具名 `--z-*` token：Classic 滚动条、命令浮层、听写入口、modal、
  启动/关机、演示遮罩和系统菜单不再靠任意大数互相压制。
- 收尾时继续修正 Apple 菜单 popover 的人为截断；启动、关机和系统 modal 状态下
  会隐藏上下文“听写”按钮；Liquid Glass 右侧桌面图标列也被压紧，标准桌面高度下
  废纸篓不会再被挤出视口。
- 控制面板现在使用 token 化最大高度，并为 Classic 设置内容区提供局部滚动 lane；
  这减少了内容被窗口硬截断的观感，同时不会把复古滚动条处理泄漏到 Liquid Glass。
- CSS 改动仍然只落在 source files，并继续通过 CSS budget、floppy budget、
  smoke 和 macOS app bundle 门禁。

## 首个公开测试版 1.0.10 — 2026-07-29

第一款可下载的 Apple silicon 测试版，产品第一次可以被真正安装运行。

- 本地优先的写作路线：项目硬盘、文件软盘、Question Sheet、大纲、分节草稿、
  TeachText、审校桌面和项目光盘，都是可见的桌面对象。
- 自带模型：LM Studio、Ollama 或任意 OpenAI 兼容服务；项目与密钥留在本机。
- 写作之外的创意实验室：Cover Glass、CMF Studio、DocMap、Soundscape 与时光机。
- Humanizer 与 System Integrity 护栏从首个公开版本就位。

## 公开测试版 1.0.11 — 2026-08-04

- 来源窗口共用一条提问栏；ClioTalk 围绕更清楚的发送/停止控件重做。
- 时光机：完整快照优先于预览、报告独立成窗、快照就地命名、DocMap 回到问题旁。
- 窗口控件家族统一，System 6 细节收口：图标描边、隐藏按钮、品牌命名、
  Finder 图标视图。
- Soundscape 播放器按 System 6 控件语法重建；测试版打包与线上部署加固。

## 公开测试版 1.0.12 — 2026-08-04

这一版没有继续堆按钮，而是让桌面更安静、对象之间的关系更清楚，同时补强适合
直接操作的部分。

- Finder 导航、菜单、图标、系统对话框、窗口共用控件和响应式布局在 Classic
  与 Liquid Glass 两种主题下进一步收口。
- Soundscape 从播放器扩展为音乐工作区：支持本地音频、更清楚的队列控制、重复
  与随机模式、项目关联、保存此刻，以及把声音转成颜色的通感视图。
- ClioTalk 与写作路线移除了一批重复命令。文件、来源、上下文、技能、检查点和
  运行记录仍然可见，但不再要求每个表面都摆出所有动作。
- 公开源码、网站和 Apple silicon Mac 测试版共用更严格的版本、隐私、资产与发布
  检查。

版本 `1.0.12`，构建号 `20260804.2`。

## 公开测试版 1.0.13 — 2026-08-05

- 梗图字幕与 Endfield 提问支持自带密钥或共享额度，统一云端 preflight + 模型
  白名单。
- 时光机地址栏接受裸域名、网页视图不再被线上主机拦下；DocMap 适应窗口避让
  SideAsk 并自动重新适应。
- Finder 箭头统一居中；梗图生成器浮层/缩放/窄屏模板修复；ClioStage 滚动条
  不再压住标题栏。
- 气泡帮助在悬停设备上默认可发现，可持久关闭。

## 公开测试版 1.0.14 — 2026-08-05

- CMF Studio USDZ 导出与预览登上公开 VPS。
- 触屏标题栏拖动不再触发页面下拉（iPad/iPhone）。
- Safari 本机入口改为复制地址 + 粘贴提示。
- 液态玻璃置灰“现代字体”；开始使用新增“观看宣传片”；字幕翻译与论文草稿
  进入公开云端路线。

## 公开测试版 1.0.15 — 2026-08-05

- 气泡帮助覆盖扩大（文件软盘、项目光盘、Question Sheet、审校桌面、提问栏、
  云端状态点、DocMap 布局切换）。
- 不可用按钮会解释原因（梗图下载、Reader 转 ClioStage、DocMap 保存）。

## 公开测试版 1.0.16 — 2026-08-05

- DeepSeek 联网搜索：Searcher 带引用实时回答、审校台主张核查、Reader 查找
  相关来源、ClioTalk 逐条联网开关。
- 字幕翻译切换到结构化输出端点；思考强度按任务类型自动决定。
- 共享云端额度先预占、再按真实 token 用量结算。

## 公开测试版 1.0.17 — 2026-08-06

- Control Strip 雏形（可选、默认关闭）。
- Finder 对象：替身、摘录文件、信纸垫、液滴与文件标签，接进菜单、显示简介
  和选择服务。
- DocMap 拆成即时入口 + 懒加载地图模块；创作台联网开关只在高级设置打开后
  出现；Searcher 承载 DeepSeek 引用；系统提示词编辑器移入启动磁盘 > AI 提示词。

## 公开测试版 1.0.18 — 2026-08-06

- DocMap 桌面图标等懒加载就绪后再打开，不再出现空壳窗口。
- 文件标签只由显示简介或 Claim Check 建议写入；文件夹标签不级联。
- 指向 Scrapbook 与项目引用的替身可解析打开。
- 摘录文件拖回落点插入文本；禁止直接引用与只读表面规则生效。

## 公开测试版 1.0.19 — 2026-08-07

- 启动更轻：Markdown 渲染器、提示词文件与两份字典移出启动包；懒加载超时并
  优雅降级。
- 默认语言跟随宿主系统；英文环境的写作提示词改为英文优先。
- 移动端与触屏打磨：更干净的手机工作区、双击提示、Finder 液滴归入
  “Drop Tools”。
- 大型级联清理后 Classic 与 Liquid Glass 外观收敛一致。

## 公开测试版 1.0.20 — 2026-08-07

- CMF Studio：iPhone 17e 与 MacBook Neo 的屏幕保留壁纸，不再渲染成白板；
  真黑饰条不再被当作可改色表面；Touch ID 采用按键帽漆面。
- MacBook Neo 的 USDZ 模型更轻——只打包实际引用的贴图（约 12.6 MB 降到
  5.2–6.7 MB）。

## 公开测试版 1.0.21 — 2026-08-07

- 文案全面修润：帮助气泡、系统帮助与对话框说人话；技术术语保留并加括号
  注解；长句拆分；中文风格统一。
- 气泡帮助扩展、可访问名称本地化，并新增校验防止中英文案漂移。
- Safari 本机入口端到端修复。
- Classic 与 Liquid Glass 的图标、记忆条、声景表面与显示简介材质 token 化。

## 公开测试版 1.0.22 — 2026-08-07

- Control Strip 成为完整系统组件，拥有自己的模块注册表、持久化与桌面集成。

## 公开测试版 1.0.23 — 2026-08-08

- UI 批次：WindowShade、Control Strip、词典、字体与云端状态修复；Soundscape
  通过 gamdl 桥获得可选的 Apple Music 链接下载。
- 桌面维护去重为单一 plan 路径，修复变为带类型且保守，修复前快照先落盘；
  发布身份拆分为 version / build / sourceCommit，运行时计算 snapshotCommit
  与 generatedAt；沉淀可迁移经验文档。

## 公开测试版 1.0.24 — 2026-08-08

- Compression Grain 与 Quick Draft 调整层（mingming / luoluo / hkrr）落地，
  伴随语料扩容与检索/状态核心重构。

## 公开测试版 1.0.25 — 2026-08-08

- Compression Grain 细化、Finder Draft 打磨与测试扩充。
- 文档 revision 变为耐久（等待写入、失败回滚）；备份携带 revision 历史
  （v3 schema）；store commit 获得失败语义；修复 WebKit 把中止超时误判为
  用户取消、导致桌面一直 Busy 的缺陷。

## 公开测试版 1.0.26 — 2026-08-08

- 耐久与移动端补全：Project CD 烧录契约全面 async（显式 source 选项、
  droplet 与下载语义拆分）；StateStore 回滚在真实浏览器生效；版本历史无法
  完整读取时备份 fail closed；revision 恢复校验持久化并在保存失败时回滚。
- 本地 `verify:ship` 门禁生成 `dist/verification-report.json`，作为发布条件
  （托管 GitHub Actions 可用性属于账户问题）。浏览器失败矩阵覆盖耐久链路。
- iPhone / WebKit 可走完整写作路线，并新增黑箱移动端用户旅程。

## 公开测试版 1.0.27 — 2026-08-08

- 钟点稿完成版：窗口变成一个写作应用，三种状态（开始 / 写稿 / 调整）；
  统一 workspace schema 并带旧数据迁移；调整层做成产品（开关 + 强度 +
  范围 + 一句话说明）；受保护文字改用不可变 sentinel；痕迹视图提供
  原文/当前/差异；单对象画布会持久化自己的变换；有版本和明确的交付动作
  （保存到项目硬盘、送往 TeachText、送往 Review Desk、导出 Markdown）。
- 非破坏性契约：每一层只读底片；AI 通道永远不能直接覆盖正文；模型破坏
  受保护文字时整次合成失败，而不是猜着位置塞回去；Develop 会先保存版本
  并征求确认。
- Project Hard Disk v2 备份重新可用（validate → 校验完整性 → remap →
  import → 导出 v3），并用手写的真实 v2 fixture 证明文件夹 / 文件 / 替身 /
  Scrapbook / references / Project CD 关系全部保留。
- 发版门禁快速且确定：`verify:ship` 只跑 build、feature tests、version
  consistency、checkJs、src typecheck、data、docs、CSS、design、public
  tree、runtime syntax、smoke、release assets、floppy budget——没有
  Playwright、没有浏览器下载、没有 WebKit。E2E 是可选诊断，永不阻塞发版。

## 公开测试版 1.0.28 — 2026-08-09

- Quick Draft Closure 将 working update 与 awaited durable commit 分离；debounce 保存捕获原项目；exact-stack Composite Preview 持久化；交付失败不再显示成功。
- Workspace schema v3 将旧 `quick-draft-dump` 迁入有上限的文档 Versions，并防御性地把 Versions 排除在模型素材之外。
- 空 mask 明确表示全文；新调整层栈默认关闭；四层开启只调用一次模型；重复保护文本使用按 occurrence 唯一且无正则状态污染的 sentinel。
- Send to TeachText 打开已保存的 Project Document，不再改变主写作流程。公开 snapshot 只承诺 `verify:public`；`verify:ship` 保持为维护者私有源树门禁。
- StateStore commit 回调做静态审计：UI 临时状态（选中、激活、焦点、toast）
  只能在 commit 成功之后变化，并修复了两处既有违规。

## 公开测试版 1.0.29 — 2026-08-09

- 钟点稿从 Writing Studio 所属窗口调整为独立的 Draft Desk 应用。
- 旧 Finder Draft 与独立 canvas 归并为一个耐久工作区，统一容纳材料、
  正文、调整层、版本、状态回执与 Body / Grain / Read 视图。
- 钟点稿新增明确 SideAsk 与“先保存、再单向交给 Writing Studio”的路径；
  桌面、Applications、MultiFinder、菜单、手机壳、会话恢复与原生对齐契约同步更新。

## 公开测试版 1.0.30 — 2026-08-09

- Platinum 成为 System 6 与 Liquid Glass 之外的第三套正式外观。启动前注册表、
  可持久保存的控制面板选择器与“特别”菜单共同管理外观状态，不改变应用结构
  或写作语义。
- Platinum 以 Mac OS 8 证据为基础，为共享窗口、控件、字段、菜单、滚动面、
  字体与选中状态提供统一材质。Theme Lab 保留为三主题验收面；Aqua、Snow
  Leopard 与 Yosemite 实验不进入本次发布。
- 宣传片与 4K 剪辑收紧节奏，CMF Studio 改为多设备蒙太奇，并加入可复用的
  哔哩哔哩封面渲染脚本。

## 公开测试版 1.0.31 — 2026-08-09

- Aqua 成为 System 6、Platinum、Liquid Glass 之外的第四套正式外观：Jaguar
  时代控件几何、当前应用菜单、三栏打开对话框、附着式工作表与 Finder 工具栏，
  均以时代 HIG 与固定原始参照为证据。
- 外观注册表加入显式 recipe 血缘（Platinum ← Classic、Snow Leopard ← Aqua、
  Yosemite ← Liquid Glass），每个时代只保留自己的差异；上线门控让 Snow
  Leopard 与 Yosemite 不进入对外界面，同时保留 recipe 供后续完善。
- Theme Lab 升级为多时代验收面，提供时代精准样本与 SHA-256 固定的原始参照
  （Mac OS 9 Platinum 菜单、Jaguar Aqua 三栏浏览器、工作表、滚动条与选项状态）。
- Draft Desk 加固收尾：引导式“写一篇短稿”只需一个设置页面，Continue 回到
  上一篇草稿，模型缺失或配置损坏不再挡住桌面，Markdown 可从手机分享，
  应用可添加到主屏幕。
- Draft Desk 耐久性契约扩展：恢复提示、选区与滚动位置持久化，以及引导、
  边界、交接、工作会话等更完整的可执行测试套件。

## 系统化收口：应用服务 · 运行记录 · 助手活动 · 30 秒演示 — 2026-08-10

- 应用服务：一个对象路由注册表统一决定“哪个应用处理这个对象/意图”。Finder
  打开、文件 → 打开、钟点稿送出、审校/DocMap 菜单与 Droplet 都收敛到同一套
  dispatch 契约；坏替身、跨项目对象与无处理者的情况都显式失败，不再静默回退。
- 运行记录：既有的 ClioTalk run-record 工件扩展为项目级统一记录系统
  （schemaVersion 2），覆盖 AI 与产出工件的操作；记录检查点接受/编辑/拒绝、
  Get Info 的“产生自”溯源、System Status 的最近运行，以及“重复本次运行”。
- 助手活动：单一状态源（offline / idle / reading / working / waiting /
  ready / error）只由真实模型与运行事件派生，带停滞看门狗、项目切换重置、
  取消与置于最前；System Status 通过语义 data-* hooks 暴露。
- 30 秒演示：种子化、确定性的短演示（Start Here 与应用文件夹入口）展示一份
  2026 年的来源变成摘录、再变成项目硬盘里的文稿——无需模型、无需网络，
  退出时恢复原桌面。
- 实战 Live Demo 保持原样；Theme/Appearance 文件未改动。

## 公开测试版 1.0.37 — 2026-08-10

- 应用服务：一个对象路由注册表统一决定“哪个应用处理这个对象/意图”；Finder
  打开、文件 → 打开、钟点稿送出、审校/DocMap 菜单与 Droplet 都收敛到同一套
  dispatch 契约，失败显式呈现。
- 运行记录：ClioTalk run-record 扩展为项目级统一记录系统，覆盖 AI 与产出
  工件的操作；记录检查点接受/编辑/拒绝、Get Info 溯源、System Status 最近
  运行，以及“重复本次运行”。
- 助手活动：单一状态源（offline / idle / reading / working / waiting /
  ready / error）只由真实事件派生，System Status 展示并支持取消与置于最前。
- 六套外观全部发布（System 6、Platinum、Aqua、Snow Leopard、Yosemite、
  Liquid Glass）；研究开关移除，Theme Lab 移入系统文件夹。
- 主题验收收口：修复 Aqua/Snow Leopard/Yosemite 将听写、翻译板与重建流程
  文本域压扁成 22 px 字段行的问题（时代字段配方不再覆盖应用自有 textarea
  最小高度）；修复 Yosemite 蓝色默认按钮悬停变白（现为 10.10 悬停蓝
  #619fe8，已对照引用 GTK 源验证）；并将 README / README.zh-CN 同步为六套
  正式外观。
- 30 秒种子化演示展示来源如何变成项目硬盘里的文件，无需模型与网络。

## 公开测试版 1.0.38 — 2026-08-12

- 六套 56 对象图标家族全部完成，fallback 图稿归零：System 6、Platinum、
  Aqua、Snow Leopard、Yosemite 与 Liquid Glass 现在在同一组语义对象 id
  后拥有各时代独立的构造。
- Finder、MultiFinder 与 ClioTalk 已跨六个时代重绘；共享身份保持不变，
  各时代的材质、透视、像素密度、光线与小尺寸光学提示分别重建。
- Liquid Glass 从 56 份独立 Image Gen 母版重建为每个对象四个原生尺寸、
  三种外观；Classic 与 Platinum 保留审定的 32/16 px 家族，三个 OS X
  时代保留各自的原生多尺寸位图家族。
- Aqua、Snow Leopard 与 Yosemite 已接受 Image Gen 图稿的可重建性缺口
  已关闭：490 份以哈希固定的审定来源进入受版本控制的来源边界，干净克隆
  不再依赖被忽略的草稿候选即可重建。
- 为完成后的六时代系统增加失败关闭的家族、来源归档、连续性、运行时分发、
  可区分性、原生画布与发布资源门禁。

## 公开测试版 1.0.39 — 2026-08-12

- 将完整 System 6 家族重建为手工定义的 32/16 px SVG：留存至今的经典对象
  以真实 System 6 资源为依据，新增应用对象沿用相同的一位图语法；选中态蒙版
  直接嵌入图稿，在 Retina 屏上清晰缩放而不被抹成泛化矢量图标。
- 增加独立的 42 px Platinum 桌面尺寸与光学一致性测试；Finder 现在分发
  时代原生画布，不再拉伸其他尺寸。
- 清除 Aqua、Snow Leopard 与 Yosemite 审定家族中的色键洋红残留，同时
  保护有意使用的紫色像素、透明边缘，以及各时代独有的阴影与材质配方。
- 扩充 Theme Lab 证据与失败关闭门禁，覆盖经典依据、运行时载荷、原生尺寸、
  跨时代可区分性、选中态蒙版，以及 Classic/Liquid 视觉快照。
- 修正 Aqua 的 Jaguar 当前应用程序菜单：粗体标题现在跟随真实菜单所有者
  （启动时为 Finder），不再硬编码产品名。真实应用浏览器门禁现在会主动
  切换所有者，并在六套外观中拦截这一语义回归。
- 补齐打包版主题资源缺口：Aqua、Snow Leopard、Yosemite 与 Liquid Glass
  现在携带家族清单声明的全部 PNG 尺寸/外观；Aqua/Snow Leopard 运行时
  sprite 与 Platinum 桌面纹理也会随包提供。macOS 打包门禁会从最终 pkg
  二进制逐一提供 1,291 份 UI 引用主题 PNG，并在签名前与审定来源逐字节比对。

## 公开测试版 1.0.40 — 2026-08-13

- 端到端修复 ClioTalk 输入区：输入与粘贴事件会立即重新同步发送按钮；网站
  AI 摘要则会在成功、失败及重置路径后离开连接中状态。两项公开版实机问题
  以及 Enter、发送按钮路径均新增定点回归。
- 浏览器本地 LM Studio 推理全面迁移到当前 REST API：无工具对话使用原生
  `/api/v1/chat`，项目工具流程使用有状态的 `/v1/responses`，并通过已保存
  的 response ID 续接而不重放已结算历史。旧兼容服务仍保留一次有界回退；
  response 链缺失、过期或长期静默时会明确失败，同时保留草稿并释放 Busy。
- 首次启动改为三页“开始使用”流程，明确提供网站 AI、自备密钥与本地模型
  三种选择，并连接官网、源代码仓库、视频指南及 iOS 主屏幕安装说明，全程
  不要求账号。
- 把提纲与审校界面移回应用启动边界之后才加载，恢复两张软盘启动预算。
  打包后启动载荷为 2,931,185 / 2,949,120 字节，余量 17,935 字节；门禁现会
  发布这份实测结果，供官网与文档共同读取。
- 完成六套外观的移动端/HIG 巡检，覆盖窄窗几何、滚动所有权、选中与默认按钮
  反馈、键盘操作、菜单，以及可读的状态与帮助文案。
- 补齐 Finder、MultiFinder、Searcher、Review Desk 与 ClioTalk 跨六时代的
  审计优先图标谱系；审定来源、原生光学尺寸、运行时分发与 Theme Lab 来源
  记录现在会共同失败关闭。
- 全面加固网站 AI 传输：凭据范围跟随规范化端点，DNS 结果经检查后固定到
  实际外连套接字，私有目标被阻断，暂存凭据有有效期与数量上限；共享云端
  预留能在并发进程下精确结算流式与多次调用用量，且不会重复结算或跨日污染。
- 在多窗口租约之下增加持久化 IndexedDB 写入栅栏；窗口接管完成后，失去
  所有权的标签页无法再以旧 epoch 提交。Chromium 与 WebKit 端到端测试覆盖
  双页面并发、延迟释放、只读控件与重新回到前台后的核对。
- 将 CMF 渲染与 USDZ 工作移出 HTTP 主线程，进入有界工作线程队列，并加入
  每会话隔离、取消、超时、结果大小限制及崩溃恢复；渲染期间健康检查仍能响应。
- 围绕具体产品证据重做官网时代叙事与证据墙，同时保持网站检查与公开部署
  边界完整。

## 公开测试版 1.0.41 — 2026-08-13

- 修复 Retina 屏幕上现代时代位图图标模糊的问题：素材档位现在由图标真实
  显示尺寸与浏览器设备像素倍率共同决定，不再让旧的紧凑尺寸 class 错误接管
  素材尺寸。
- 同一分发契约覆盖 Aqua、Snow Leopard、Yosemite 与 Liquid Glass 下的
  静态/动态 Finder 窗口、桌面对象、列表行、文件软盘、项目硬盘、Documents
  与 ClioTalk 欢迎界面。
- 新增失败关闭的真实应用门禁，以 2× 密度渲染六套外观；任何现代位图若小于
  可见界面实际所需像素都会阻止发布，并专门锁住此次 VPS 暴露的 Finder 内
  `mini` 旧标记优先级冲突。

## 公开测试版 1.0.42 — 2026-08-14

- DOOM 落位为第三个、也是最后一个游戏栏位：官方 Chocolate Doom 3.1.1
  引擎编译为 WebAssembly，在同源 iframe 中运行，配本机专用的 WAD 选择器、
  明确的「开始」手势、IDBFS 存档，以及触屏与手柄共用的菜单感知输入桥。
- 手机与平板获得独立的竖屏、横屏触控布局，移动、转向、开火可多指并发；
  隐藏、切后台或转屏会清零输入并暂停引擎与声音。
- 手机／平板方向契约升格为产品不变量，写入 CLAUDE.md、DESIGN.md，并在
  HIG 中形成设备 × 方向 × 输入的验收矩阵。
- GPL 引擎随对应源码归档、补丁、许可证和可复现构建配方一同交付；任何
  游戏数据都不进入仓库或发布物。

## 公开测试版 1.0.43 — 2026-08-14

- 退役了已停止维护的 vercel/pkg 打包环节——它只能面向已 EOL 的 Node 18。
  macOS 应用现在内嵌一棵仓库形状的 server payload，带打包机自己的当前 Node
  运行时（强制 24 或更新），以及按 lockfile 精确安装的生产依赖树。
- pdfjs-dist 从 4.8 升级到 6.2，并在每种部署里都从应用自有 URL 提供其
  JBIG2、JPEG 2000 与 ICC 的 wasm 解码器，让图像密集的 PDF 在浏览器、
  打包应用和 Web 发布中都保持完整解码质量。
- https-proxy-agent 升级到 9，服务端类型检查改用 NodeNext 解析——这是纯
  exports-map 包所要求的。
- 把 `three` 移入 devDependencies，打包 payload 裁掉 sourcemap 与 PDF.js
  viewer，并把受支持的 Node 窗口提升到 24–26。
- DOOM 与 OpenTTD 两款 WebAssembly 游戏用各自的可复现构建脚本在
  emscripten 6.0.6 上重建，并都做了浏览器内实测。Micropolis 走 JS
  vendoring，不受影响。
- 为每份样式表声明了一个 CSS 级联层，并在 bundle 中钉住层序。目前还没有
  规则被包裹，运行时级联保持不变；这是退役「文件顺序即级联」的脚手架，
  `verify:css` 现在会阻止某个文件打开不属于它的层。

## 公开测试版 1.0.46 — 2026-08-16

- ClioTalk 带工具流式。工具循环过去强制走完整 JSON，写作时只能安静等待，
  「停止」也无从保留；现在流式工具调用按分片组装：只出现一次的名字不会重复，
  参数 JSON 跨帧拼回原样，并行调用按序号合并，快照不会二次追加，截断的参数
  直接报错而不是瞎猜。有人看着文字到来时每一轮都流式，后续轮次接着写而不是
  抹掉前面的字，停止后保留写作者已经读到的全部内容。底层还修好了 JSON 回退
  路径：流读取器曾在判断 content-type 之前就用 getReader() 锁住响应体，导致
  忽略 stream:true 的提供商永远答不出来。
- 整个 iPad 家族都过了一遍：标准版、Air、Pro、mini 各代代表尺寸、横竖屏、
  iPadOS Split View 与 Slide Over 分屏，1348 项全绿。窗口钳制现在读取
  --keyboard-inset，持有焦点的窗口会像手机外壳一样抬到屏幕键盘上方，键盘
  收起后恢复原位置；钳制写 max-height 时也用回了正确的 kebab-case 属性名。
- 手机横屏下「完稿回执」依然完整可读：恢复路径在回执长到真实高度后重新钳制，
  矮视口里面板滚动而不是裁掉一行事实。
- 启动载荷按两张软盘预算重新测量为 2,948,416 字节。

## 公开测试版 1.0.47 - 2026-08-17

- 图片提示词工作室（Image Prompt Studio）是新的创作实验室：一句简短想法（加上
  一张可选参考图）变成两条可直接粘贴的提示词——一条自然语言 GPT-Image 段落和一条
  紧凑的通用提示词。它是纯提示词写作工具、没有图像后端，所以绝不会静默丢掉参考图；
  在云端文本模型上它会明说，而不是假装。
- CMF Studio 走完 3D 全流程：每个视图预设都在浏览器里渲染成 PNG，源 USDZ 可本地
  预览与重新着色，fflate 把重新着色后的结果导出为 USDZ 用于 AR。云端图片不可用时
  背景渲染优雅降级，高分辨率视图以 2x 离屏渲染。
- Classic 与 Platinum 做了一轮真正的保真度：0 模糊倒角、token 级 chrome，以及
  Classic/Platinum 保真度合约，把最老的两套外观对齐到原生参照，并刷新了 Theme Lab
  基线与指纹。
- 时代时间线之后新增的四个对象——图片提示词工作室、Micropolis、OpenTTD 和 DOOM——
  现在都有了自己可辨识的 Classic 线稿图标（带选中遮罩），控制面板里还有一个开关可
  以把线稿图标应用到所有外观。退役的 inline Liquid Glass 图标字典被移除，其导出/
  测试引用一并对齐。
- 帮助与写作流程帮助文案重新梳理：气球帮助避开下一个可点击目标，窗口管理器的
  lazy-attach 路径也修好了。
- 官网与 README 从运行中的应用重新拍摄并重排：每个时代框架与功能截图都重新采集
  （包括填好内容的图片提示词工作室截图），README 修掉两处失效图片链接、加上目录、
  结构更清晰，营销页的对比度与字号达到可读性标准，各时代的中文字体栈也纠正了。
- Cloudflare Pages 上线共享云额度 Worker、共享额度之外的 BYOK 云 key、路由对等，
  以及让公开快照可独立验证的部署/发布工具。
- 运行时迁移到应用注册表：命令、渲染任务、生命周期与状态存储，外加一条服务边界
  合约，把直接访问服务挡在功能模块之外。

## 一个月里真正变大的东西

- 从一次性 AI 写作原型，变成一个有项目硬盘、临时文件软盘、可见来源、审阅
  桌面、导出路径和创意实验室的本地优先写作环境。
- 从“把资料塞进 prompt”变成“来源是桌面对象”：Reader、Scrapbook、DocMap、
  File Floppy、Project Hard Disk 和 Context Panel 都在帮助用户看见材料如何
  进入写作。
- 从“模型能生成”变成“模型有边界”：task kind、prompt registry、context
  budgeting、Humanizer、System Integrity、Writing Tools contract、本地模型
  调参和 feature tests 共同约束模型不要代替用户说话。
- 从“复古风 UI”变成“System 6 是产品约束”：命名对象、主动保存、安静窗口、
  懒加载工具、两张 1.44 MB floppy 的启动预算、CSS/design/docs/data/release
  gates 都在阻止功能蔓延和视觉漂移。

如果只用一句话概括这一个月：AI System 6 从一个会写的界面，长成了一个会
保护写作者、保护来源、保护交付边界的创作桌面。

## Public Beta 1.0.48 - 2026-08-17

历史保真度，以及 Liquid Glass 向 Golden Gate 的重校。

Aqua 达到 16/16，Snow Leopard 达到 17/17。Aqua 的四处都是真实画笔缺陷：禁用的
列表行丢了图标、滚动条槽由多个盒子拼成而不是一条连续轮廓、行分隔线不完整，以及
Finder 工具栏在窗口边框上又画了一圈自己的框、视图模式图标完全不显示、并把
「Search」当作占位文字放在药丸里——而 10.2 的工具栏是把标签放在药丸下方。

Yosemite 新固定了四张原生 10.10 截图。此前有六个 specimen 比对的裁剪里根本没有
它们声称要测的控件——当时固定的三张来源里没有任何推按钮、文本框、对话框、非活动
窗口或选中列表行。一个错误的参照还造出了一个错误的 token：源列表选中色取自一张
没有任何选中项的截图里、文件夹图标的标签页。

Liquid Glass 向 macOS 27 Golden Gate 靠拢：同心圆角阶梯让嵌套对象不再重复窗口
自身的曲率；窗口顶部由三条分段 chrome 合成一条连续区域；背景窗口只让 chrome 变
静而不淡化文档；按压响应在 reduced motion 下去掉位移。

过程中浮出两个长期存在的绘制缺陷：所有外观声明的菜单栏边框色**从未生效过**——
一条共享的表面规则把它们全刷成了墨色；弹出按钮的箭头井以内边距盒为基准定位，
于是离边框差一个像素，看起来像一颗独立的药丸。Snow Leopard 的交通灯按原生 10.6
截图实测的红色重新校深。

## Public Beta 1.0.49 - 2026-08-19

控制面板与 Theme Lab 的修正，三处都是同一类故障：控件在，但做不了它该做的事。

Liquid Glass 的着色滑块从来没有推动过外框。`body.use-liquid-glass` 自己声明了
`--liquid-tint-level`，遮住了滑块写在根元素上的值，于是所有 CSS 表面都取中间的
0.5，只有 WebGL 叠层跟着控件走。该声明已删除；每个读取方本来就在自己的 `var()`
回退里带着默认值。

同一个滑块在六套外观里都出现。`.settings label` 设了 `display: block`，压过浏览器
的 `[hidden]` 规则，于是运行时设置的属性形同虚设——继 Finder 项和 CMF 控件之后，
这是同一个陷阱的第三次。作用域守卫规则已补上。运行时那一侧则错在另一个方向：它只
凭 `themechange` 事件判断可见性，而启动、设置恢复和启动意图三条路径应用外观时都不
发这个事件，因此判断移进了每条路径都会经过的 `applyTheme`。

Classic 的控制面板用整格填墨来标记当前分区。那是现代侧边栏行的高亮方式，而且它吞掉
了本该被反白的 1-bit 图形：图标遮罩是黑的，选中的图标于是只剩一圈空心轮廓。现在
Classic 按 Finder 选中图标的方式选中——格子保持纸面，图标露出遮罩并反白，名字带上
高亮方块——悬停不再绘制任何东西，因为 System 6 没有悬停态。其余五套外观对新 token
传中性值，外观不变。

Theme Lab 的时代时间轴在竖屏下无法使用：一条来自旧版六按钮时代切换器的三列规则，把
滑轨挤进面板三分之一宽，年份标签堆在旁边。滑轨在任何宽度下都恢复为一列，刻度轴也取
了与滑块行程相同的半个圆钮内缩，于是圆钮正好落在它选中的年份刻度上。


## Public Beta 1.0.50 - 2026-08-23

一次收敛版本。并行跑了一整天的八条工作线合回一处，而合并过程暴露出来的东西，和各条
工作线做出来的东西一样属于这一版。

「文字亮室」成了自己的应用，不再是 Quick Draft 抽屉里的一格。底片、调整层栈、写作者
的锁和版本链，从 Quick Draft 的工作区里搬出来，成为一份按文档归属的记录——同一份稿子
无论从哪个面进来，都能被冲洗。边界只有一句话：Quick Draft 负责写，文字亮室负责看。
Finder 模式是单任务的，所以想让颗粒和句子并排出现，那是 MultiFinder 的排布——真正的
第二个应用要付第二个窗口的代价，这个代价是知情之后选的。

那份记录现在会跟着磁盘走。它原本存在 keyval 里，不在项目硬盘备份携带的七个集合之中，
于是导出项目再还原，底片、层栈、锁和版本链会一声不响地全部丢失。备份格式升到 v5，把
它带上；指向备份里并不存在的文档的记录会被拒绝，而不是还原成一份无所归属的暗房。项目
光盘不变，因为光盘是成稿的只读交付，不是还原路径。

每个项目在桌面上都是一张磁盘。挂载的那张是实心的，其余是变淡的、已弹出的；双击一张
已弹出的磁盘会以只读方式打开它，把它拖进废纸篓是归档而不是丢弃——抹掉磁盘仍然是那扇
销毁的门。挂载的磁盘写的是项目自己的名字，不再是那个通用名。

Hold That Thought 作为一个桌面附件到位：它是为打断准备的暂停，把窗口和光标原样还给
写作者，而不是留一张"回头再写"的条子。

一张照片成了写作路线读得懂的材料。问题单照片、文件软盘导入、审校台图注核对、Scrapbook
图片剪贴、Quick Draft 产品照、以及从图片生成 DocMap，全部落到同一层共享实现上。
Scrapbook 的剪贴现在可以是一张完全没有文字的图片，窗口会直接说明 Searcher 找不到它；
模型对图片的解读是一份提案，写作者"留下"之后才会保存。

线上主机不再把自己的缓存扔掉。它给两个 bundle 发的是 `no-cache, no-store,
must-revalidate`，于是边缘直接绕过，每次访问都要重下约 430 KB。这条规则现在按当初那次
事故真正需要的方式拆开：带构建戳的成功响应拿长期缓存，无版本 URL 拿一天，404 明确
no-store。

四张低频样式表——ClioChart、Time Machine、Endfield Terminal 和官僚 meme——现在跟着各自
的窗口走，不再占启动盘。正是这一笔，让上面所有东西还装得进两张软盘。

外观样式表的几何声明从 848 条降到 719 条，并配了一道只许降不许升的棘轮。由外观携带的
布局，正是让验证矩阵相乘的东西，所以给它排水不是收拾屋子。

Bonsai City 有六个真实缺陷：城市不是在生长而是在振荡，区域拖拽无法使用，道路、电线和
铁轨画成了互不相连的柱头，路口是一坨轴对齐的团块。六个全部修好。

有两处失败值得记下来，因为闸门看不见它们。一个写成裸标识符的动作处理器，指向只有懒
模块加载后才存在的函数，在构建命令表时抛错，把所有菜单命令和所有 data-action 按钮一起
拖成哑的——而 240 条可执行契约加一道全绿的发版闸门一声不吭，因为没有任何静态断言会执行
那条路径。它现在有了一道闸门，靠解析名字而不是匹配形状。另一处是 Mac 载荷从来不知道那
四张改成懒加载的样式表，本来会带着四个没有样式的窗口发出去，而本地不会有任何东西抗议。


同一个版本号下又落了两天的工作，其中最重的一条，是导出格式一直在静默携带的缺陷。

**项目盘现在带着自己的图片走。**导出一张盘、在别处导入，问题单的照片全没了，
Scrapbook 摘录指向不再存在的图，正文里每一张插图退回成
裸的图片标记，指向一个盘上已经没有的 `aisystem6-image:` id。每一种都不出声。备份格式升到第 6 版，
原图和预览都带。最难的一处在格式里没有先例：**正文是从散文内部用 id 引用图片的**，
而备份里其它所有指针都是重映射器能遍历的字段。只重映射图片 id 却不改写这些引用，
会让盘上每一张插图断链——那比不重映射更糟。

**写作者读过的图片可以被搜到了。**画片簿一直在存模型对图片的读取结果，
而整个仓库没有任何地方读回它——一处写入，零个读者。这些读数现在和文档、摘录
一起进入检索索引，一张照片可以凭它说了什么被找到。

**云端可以读导入的图片。**OCR 增加了一级云端引擎，位于三个本地引擎之下、
沿用原有开关；并且当读图的是云端时，应用会明说，而不是让写作者猜自己的图去了哪里。

**十九条菜单命令可以再次执行。**三个月前的一次菜单迁移把菜单栏搬进了独立模块，
路上丢掉了 88 个带标签的控件；其中十九个有处理器、有翻译、有快捷键，却没有任何
入口能碰到它们。它们已恢复，五个比处理器活得更久的名字被删除，新增的门禁会**解析**
命令名，而不是只匹配它的形状。

**文字亮室 在整条起草路线上都能进**，不再只能从正文进；桌面图标也有了自己的
Classic 线稿。画片簿、钟点稿和 DocMap 现在用同一种方式保存一张图片。

Writer Mode 失去了它的菜单开关。从干净桌面进入一次仍然有效——但在会话中途来回切，
每次安排出的桌面都不一样，其中一次关掉了写作者正在写的那篇手稿。一个会关掉写作者
作品的控件，比没有这个控件更糟，所以它被删掉，而不是带着不确定发出去。模式本身、
以及它安排的一切，都保留。

更小的修复：废纸篓不再被甩进独占一列的位置；主题实验室可以调整大小；两个人的名字
用回了他们自己的字，而不是同音字；以及那些游戏——它们一直在往 web 主机发布，
帧却被拦着——现在真的能跑了。

启动载荷再次下降，约 140 KB：又有七扇窗口自己搭建标记，不再把它带在启动文档里。
搬运过程中有三处标记静默丢失，每一处都是靠清点元素抓到的，读 diff 一个也没发现。
