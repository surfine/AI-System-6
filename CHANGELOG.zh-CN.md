<!-- canonical-source: CHANGELOG.md -->
<!-- source-sha256: 71efbba97638da623d2ffe72f9bf45503d81b2356415a662820d5b0da0e7114f -->

# AI System 6 中文更新日志

英文版为准。本文档仅供人类参考，不被任何脚本读取。

这份 changelog 不是逐条提交记录，而是一条面向用户的产品成长线。它从
2026-05-18 的第一版开始，按时间正序回看 AI System 6 在一个月里如何从
“能跑的 AI 写作桌面”变成一个更本地、更可信、更像真实写作环境的系统。

仓库目前只有两个历史 tag：`pre-refactor-baseline` 和 `src-pilot`。因此下文
按日期阶段和可确认版本组织，不虚构不存在的 release tag。当前工作区显示的
版本为 `1.0.10`，构建号为 `20260613.1`。

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
- 服务端从根目录 `server.js` 迁移到 `src/server.js`，拆出 route table、
  shared libraries、focused route handlers 和 importers。
- `/api/version`、云模型、本地模型、导入、Reader、Searcher、Endfield、
  静态文件服务与 import-text parity 被陆续迁移到新的 `src/` 结构。
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

## 当前开发版 — 1.0.10 / 2026-06-13

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
