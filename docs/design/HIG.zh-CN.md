<!-- canonical-source: docs/design/HIG.md -->
<!-- source-sha256: fae031f677bebb925e7f969c44896e82376e5dda1ec6f2a358b6037bc3c742d3 -->

# AI System 6 人机界面指南

> 中文参考版。英文版为准；本文件仅供人类参考。

本文是 AI System 6 的规范性界面与排版规格，把[架构](../ARCHITECTURE.zh-CN.md)
中的产品边界和 [DESIGN.md](DESIGN.md) 中的视觉原则，转化成开发新应用时可以重复使用的决定。

这些规则会在可行处由
[`scripts/interface-guidelines-contract.mjs`](../../scripts/interface-guidelines-contract.mjs)
和 `tests/features/interface-guidelines.test.mjs` 执行。新的 `data-window`
只有在注册表中声明对象角色和窗口骨架之后，才算完成。

## 权威顺序与证据

当不同来源互相冲突时，按以下顺序处理：

1. [架构](../ARCHITECTURE.zh-CN.md)中的产品语义与写作路线。
2. `DESIGN.md` 中的 AI System 6 设计合约。
3. 对于历史对象，真实 System 6 或对应年代 Classic Mac OS 的资源与运行观察。
4. 本 HIG 与已有共享 primitive（基础组件）。
5. 现代平台对可读性、适配性、无障碍和材质的指导。

现代 Apple HIG 是次级证据，不是视觉权威。可吸收的约束包括：减少字体种类、在文字变化时维持层级、渐进披露、适配窗口、不只靠颜色传达状态、支持键盘，以及克制使用材质。它不能授权我们用通用 AppKit、移动端或网页控件替换 System 6 的形态。

复刻经典对象时，必须记录系统版本、资源或运行来源、原生边界和状态序列。如果找不到原生证据，就把结果标明为 AI System 6 的诠释，而不是复制品。

## 产品姿态

AI System 6 是本地优先的写作桌面。界面把来源、草稿、选区、已保存文件、审校回执和导出结果变成可见对象，而不是把 AI 能力堆成仪表板功能清单。

第一次成功路线有固定优先级：在 Draft Desk 开始一份文稿，手写或生成正文，持久保存，然后下载或分享。
新控件必须让这条路线更容易、让已保存作品更安全，或让恢复继续更清楚；否则不进入当前 Beta。

默认设计刻度维持如下：

| 刻度 | 默认值 | 结果 |
| --- | ---: | --- |
| 设计变化度 | 3 / 10 | 新应用必须复用已有对象角色和窗口骨架。 |
| 动效强度 | 2 / 10 | 动效只说明状态或归属关系。 |
| 视觉密度 | 7 / 10 | 系统 chrome 紧凑；阅读和写作内容获得留白。 |

## 对象角色

每个窗口在设计 HTML 或 CSS 之前，必须准确声明一个角色。

| 角色 | 用途 | 默认骨架 |
| --- | --- | --- |
| 写作路线 | Question Sheet、Outline、Section Drafts、TeachText、Review Desk、Project CD | 显示文稿状态的完整应用窗口 |
| Finder | Project Hard Disk、File Floppy、Applications、Trash、对象文件夹 | 以对象动词为中心的 Finder 网格或列表 |
| Reader | 来源阅读、提取、摘录、存档网页阅读 | 带来源和摘录回执的阅读面 |
| Desk Accessory | Control Panel、Dictionary、Dictation、Translation Pad、Note Pad、小型系统工具 | 靠近所辅助工作的紧凑工具 |
| Utility | Searcher、DocMap、System Help、上下文和转换工具 | 按需召出的专项应用窗口 |
| Modal | 确认、导入/导出决定、必要设置 | 一个简短的阻塞式决定 |
| Status | 模型、系统、通知或操作回执 | 回执本身就是界面，不再增加第二条状态栏 |
| Creative Lab | Cover Glass、CMF Studio、ClioStage、媒体实验 | 在共享窗口与控件语义内呈现更有表现力的内容 |

角色决定窗口骨架、信息密度和自适应行为。Desk Accessory 不能因为视口变窄就扩张成完整应用页面；Utility 必须保持为写作路线的次要工具。

## 标准应用骨架

新的文稿应用和 Utility 使用以下顺序：

```text
标题栏：应用身份
状态栏：前导回执 | 文稿上下文 | 尾随命令
可选 TDI：宽窗口使用垂直栏，受限窗口使用状态栏中的紧凑文稿栈
主工作面：唯一主要的阅读、写作或操作区域
可选局部操作／Ask bar：归属于工作面，并保留底部安全间距
grow box：只有窗口确实可调整尺寸时才出现
```

使用现有基础组件：

- `.window`、`.title-bar`、`.window-pane`；
- `.details-bar.app-status-bar`；
- `.status-bar-leading`、`.status-bar-context`、`.status-bar-trailing`；
- `.tdi-shell`、`.tdi-rail`、`.tdi-stack-host`；
- `.btn`、`.mini-btn`、`.button-row`；
- 有限选项使用 `.select-wrap`。

只有当注册表说明上述角色都不能表达任务时，才允许增加新的窗口骨架类。

### 标题栏

- 标题栏识别应用，不识别当前文稿。
- 切换标签页或来源时，显示名称保持稳定。
- 有必要时，把完整文稿名称放进 `title` 属性。
- 简短文稿身份放进状态栏 context 或 TDI 文稿栈。
- 不要在标题栏与状态栏重复同一个文稿标题。
- Zoom、grow、close 与 WindowShade 必须维持不同语义。

### 三槽状态栏

共享状态栏是包含三个语义槽位的网格：

| 槽位 | 负责内容 | 示例 |
| --- | --- | --- |
| Leading | 可量化状态或实时回执 | `16 nodes`、`Saved`、`Reading mode`、字数 |
| Context | 当前对象、来源、文稿栈或有限工作流状态 | 当前文稿、网址、TDI 栈、Draft/Review 选择器 |
| Trailing | 一个命令组或一个路线操作 | `Commands…`、`View Manuscript`、`Open Flow` |

规则：

- 状态文字只报告已经确认的状态，不报告愿望。
- 模型调用、保存、导入、OCR、搜索、摘录、删除或导出，都必须有可见的进行中与终态回执。
- 作用于整份文稿的命令放在 trailing 槽。
- 局部编辑控件留在它所影响的内容旁边。
- 专用状态栏必须在界面注册表中给出基于角色的理由；它不是新应用的默认选择。

#### 状态布局声明

每个窗口契约都要在编写 App 专用 CSS 以前选择一种布局：

| 布局 | 用途 |
| --- | --- |
| `three-slot` | 包含 leading、context 与 trailing 的标准应用状态栏 |
| `compact` | 小型工具或 Desk Accessory 使用的单端／双端回执栏 |
| `finder` | Finder 的计数、视图、位置或选中状态 chrome |
| `multi-row` | 来源依据或其他不可截断回执需要第二行 |
| `multi-receipt` | 多个相互独立的实时回执必须同时可见 |
| `task-specific` | 无法映射到标准栏的分页或 Creative Lab 控件 |
| `navigation` | 导航栏有意同时承担状态与当前对象身份 |
| `receipt` | 整个状态窗口本身就是回执 |
| `none` | 窗口没有常驻状态 chrome |

只有 `three-slot` 属于标准应用状态模型。其他布局都必须在
`windowInterfaceRegistry` 中给出基于角色的理由并选择获准参考样板。
紧凑状态栏使用 `.compact-status-bar` 与共享 leading／trailing 语义类，
不能复制三槽网格。

自适应优先级：

1. 保留正在进行操作的回执。
2. 保留足够的文稿身份，避免对错误对象执行操作。
3. 让主要命令始终可达。
4. context 先省略，不让状态栏换成第二行。
5. 增加第二行以前，先把次要命令收进 `Commands…`。

### TDI 文稿模型

只有一个应用拥有多个同级文稿时才使用 TDI。不能用它表示工作流步骤、设置分类或互不相关的工具。

- 标题栏保持为应用名称。
- 当前文稿出现在状态栏 context。
- 宽窗口可以显示共享垂直标签栏。
- 受限窗口以紧凑文稿栈菜单替换垂直栏。
- 永远不要增加常驻的第二条横向标签栏。
- 只有一个标签页时，显示被动身份，不伪装成可展开菜单。
- 关闭、排序、dirty 状态、键盘焦点与选中状态使用共享 TDI 行为。
- 断点可以改变 TDI 几何，不能改变文稿模型。

### 底部控件与 Ask bar

- 底部控件归属于拥有它的工作面，不属于视口边缘。
- 保留已有 safe area 与 resize affordance 的净空。
- 添加、搜索、联网与发送控件使用一条视觉居中的操作行。
- 加号、联网、发送和 resize 控件都不能贴住窗口边缘。
- 紧凑按钮维持紧凑标签。范围信息放进状态栏、Commands、Balloon Help 或无障碍说明，不通过加宽按钮表达。
- 类 macOS 的宽布局中，不能把唯一关键操作只放在窗口底部；菜单或命令路径必须提供同等入口。

## 排版系统

AI System 6 使用语义排版角色，不使用 feature 自己发明的字体栈。

| 角色 | Token | 用途 |
| --- | --- | --- |
| Chrome | `--ui-font` | 菜单、控件、标签、状态栏 |
| 窗口身份 | `--title-font` | 应用标题栏和具名系统对象 |
| 阅读 | `--text-font` | 来源正文、说明文字、一般长文阅读 |
| 回执 | `--mono-font` | 日期、路径、计数、技术状态、紧凑元数据 |
| 编辑 | `--editor-font` | 可编辑的 Manuscript 与草稿文字 |
| 现代预览 | `--preview-font` | 渲染后的文稿预览和获准使用现代字体的内容面 |
| 编辑字号 | `--mde-font-size` | Manuscript／编辑器字形大小 |
| 编辑行长 | `--editor-measure` | Manuscript 的可读行长 |

规则：

- Feature CSS 必须使用这些角色，不能声明新的字体栈。
- Chrome 从共享基础组件继承字号；feature 不能通过改变标题栏、状态栏或普通按钮字号来制造层级。
- 在增加新字号以前，先在内容内使用语义标题、字重、间距和行长建立层级。
- 半透明或图案表面避免轻字重。
- Reader、TeachText、预览和帮助内容都要维持可读行长。
- 次要文稿身份可以省略，但完整值必须能从 title、Balloon Help 或文稿栈菜单获得。实时错误与破坏性后果不能省略。
- 中文和英文必须分别测试。不能用先渲染的语言计算双语布局。
- Liquid Glass 可以通过现有主题 token 更换 painter，但不能形成另一套信息层级。

## 间距与对齐

AI System 6 使用两个间距带，而不是一个万能网格：

- **Chrome 间距**紧凑、机械，使用共享组件 token 和一像素结构，让菜单、标题栏、状态行、控件与 TDI 像同一个桌面系统。
- **内容间距**更从容。阅读和写作面可以拥有较大的专属 gutter 与段落节奏，但不能把周围 chrome 一起放大。

标准几何 token 包括：

- `--system-control-line`、`--control-radius`、`--system-menu-height`；
- `--details-bar-bg`、`--details-bar-border`、`--details-bar-optical-rise`；
- `--writing-window-gutter`、`--mde-page-padding-x`、`--mde-page-padding-y`；
- `--tdi-rail-width` 和组件专属 `--tdi-*` 系列；
- `--z-local-chrome`、`--z-local-overlay`、`--z-local-popover`。

规则：

- 增加数值以前，先使用组件拥有的 token。
- 重复几何只能进入 `styles/00-foundation.css`。
- 主题值进入已有主题块；token 能表达材质时，不新增 selector twin。
- 二维窗口骨架使用 Grid，一维操作行使用 Flexbox，相邻项目间距使用 `gap`。
- 不对称字形和材质可以做视觉居中，但 Classic 与 Liquid Glass 必须维持同一逻辑网格。
- 不能靠加宽所有控件解决截断。先决定哪个项目伸展、收缩、省略、进入菜单或变成紧凑版本。

## 控件与状态

每个交互控件按以下优先级解析状态：

```text
disabled > loading > selected/open > pressed/dragging
         > focus-visible > hover-preview > default
```

这个顺序决定权威，不表示互相排斥。选中与键盘焦点可以同时可见；hover 不能覆盖选中，也不能暗示已经完成。

必要行为：

- default、loading、selected 和 open 之间几何稳定。
- 键盘焦点至少和指针 hover 一样清楚。
- 只有图标的控件提供 `aria-label`；可见标签保持紧凑时，以状态相关无障碍说明补足范围。
- Loading 禁止重复触发，但保留原标签所占宽度。
- Disabled 原因不明显时，由 Balloon Help 解释。
- Error 说明失败的操作和下一步。
- 破坏性操作在视觉和语义上保持独立。
- 有限选项使用 System 6 select harness，并支持键盘导航、typeahead、Escape 和选中状态播报。

## 自适应行为

响应式布局保存任务和对象身份，不能把所有窗口变成相同的移动页面。

每个注册表项目声明一种模型：

- `adaptive`：完整应用／Finder 几何逐步压缩；
- `compact-da`：Desk Accessory 保持为居中的紧凑列；
- `immersive`：Creative Lab 可以为作品分配更多空间，但保留共享 chrome 与退出路径。

每个新应用必须为窗口各区说明紧凑行为：

| 区域 | 允许的紧凑行为 |
| --- | --- |
| 标题栏 | 保留应用名称；只有最后才省略 |
| 状态 leading | 保留实时回执；必要时缩写稳定计数 |
| 状态 context | 省略或使用 TDI 文稿栈菜单 |
| 状态 trailing | 次要操作收进 `Commands…` |
| TDI 垂直栏 | 由紧凑文稿栈替换；永不增加横向第二行 |
| 分栏 | 收成一个任务，并提供明确返回路径 |
| 底部控件 | 作为归属明确的一组换行，或把次要控件移入 Commands |

必须测试宽桌面、受限可调整窗口、窄触控视口、英文和中文。测试真正发生问题的容器宽度，不能只测试浏览器 viewport。

## Classic 与 Liquid Glass

Classic 与 Liquid Glass 是同一对象语法上的两个 painter。

主题间共享：

- 语义 DOM 与源码顺序；
- 对象名称、任务顺序和保存状态含义；
- 控件结构、键盘行为和响应式决定；
- 标题／状态／TDI 的所有权；
- 无障碍标签和实时回执。

主题负责：

- fill、tint、translucency、rim、border、radius 与 shadow token；
- 同一个语义图标 id 的主题专属绘制；
- 不改变任务几何的小幅视觉补偿。

Liquid Glass 是 chrome 材质，不是内容装饰。不能为了展示主题而在长文阅读后面放 blur 或 clear glass。一个对象只有一个主要玻璃表面；嵌套控件使用相对 tint 或 rim，不叠加 blur。降低透明度时必须维持同一层级。

## 无障碍与输入

- 每个操作都能通过键盘到达，并有可见焦点状态。
- 不只靠颜色、透明度、声音或动画传达信息。
- 保留 System 6 的可见目标尺寸；需要时通过间距和归属明确的不可见 hit region 改善操作，但不改变可见字形。
- 遵守 `prefers-reduced-motion`；去除位移和缩放，保留即时状态反馈。
- 时间型媒体按 feature 需要提供字幕、双语字幕或 transcript。
- 实时回执使用适当 status/live region，不反复播报稳定 chrome。
- Hover 和精细手势必须有触控替代方式。
- Balloon Help 回答「这是什么？」或「为什么不可用？」；不能重复可见标签。

## 界面文案

- 使用对象明确的动词：`Save draft`、`Clip selection`、`Export PDF`。
- 紧凑按钮维持紧凑标签；说明移到状态、帮助或命令菜单。
- 空状态说明缺少哪个对象以及下一步。
- 错误说明失败操作和恢复路径。
- 操作确认以前，不能声称已经保存、摘录、索引、搜索、检查或导出。
- 保留 `CLAUDE.md` 中的产品名称与中文命名规则。
- 在标题栏、状态槽、菜单行、按钮、空状态和受限工作面中测试中英文文案。

## 参考界面

先使用以下 specimen（样本）集合：

| 界面 | 证明内容 |
| --- | --- |
| Finder／Project Hard Disk | Finder 对象语法与核心路线入口 |
| TeachText | 写作窗口、编辑行长、TDI、保存状态 |
| Reader | 来源身份、摘录回执、TDI、Commands |
| DocMap | 按需 Utility、等待／错误回执、TDI |
| Control Panel | 紧凑 Desk Accessory 行为 |
| CMF Studio 或 ClioStage | 共享 chrome 内的 Creative Lab 例外 |

某一个 specimen 上的例外，不会自动变成新的全局规则。

## 新应用检查表

实施前：

1. 把 `data-window` 名称与合同加入 `windowInterfaceRegistry`。
2. 声明对象角色、core/summoned/system 路线、shell、SDI/TDI 模型、状态栏模型和响应式模型。
3. 指出最接近的参考界面。
4. 列出会复用的基础组件与 token。
5. 说明 Classic 与 Liquid Glass 有什么不同。
6. 定义 default、focus、selected、disabled、loading、empty 与 error 状态。
7. 固定宽度以前，先定义中英文紧凑行为。
8. 复刻经典对象时记录原生证据。

交付前：

1. 构建应用并运行命名 feature contract。
2. 运行 interface-guidelines contract。
3. CSS 工作遵守 `css-no-pingpong`，并对准确界面取得 Classic 与 Liquid Glass 的修改前后证据。
4. 验证键盘、指针、触控替代、Reduced Motion 和可见操作回执。
5. 在两种语言下验证一个宽布局、一个受限布局和一个窄布局。
6. 确认没有新增 `!important`、任意 `z-index`、布局 inline style、全局 scrollbar 规则或主题专属结构分叉。

目标不是让所有应用长得完全一样，而是让每个应用属于同一个桌面，以同样方式表达状态，并在适配时保持自己的对象身份。
