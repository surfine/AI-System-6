<!-- canonical-source: docs/design/DESIGN.md -->
<!-- source-sha256: 8d84ef3f6a7571e2fc19a46fdef50e18187049bea3ada286a09203101e8f1b7a -->

# AI System 6 设计合约

> 中文参考版。英文版为准；本文件仅供人类参考。英文源文件更新后，请同步刷新本文件并运行 `npm run verify:docs`。

`CLAUDE.md` 仍是顶层事实来源。本文件是 UI、CSS、视觉评审和 agent 生成界面的设计操作合约。修改窗口、控件、主题、布局、图标、动效或用户可见视觉文案前，先读这里。

本合约把 `external/taste-skill` 和 `external/impeccable` 中有用的部分改造成适合本产品的规则。不要把它们默认的落地页或品牌站审美直接搬进 AI System 6。

规范性的应用骨架、排版角色、状态栏槽位、TDI 适配、响应式优先级与新应用检查表，见
[HIG.md](HIG.md)。其中的机器可读窗口注册表会和 feature contract 一起接受门禁；它不会建立第二套组件库。

## 产品语域

AI System 6 是产品 UI，不是营销页面。设计服务于正在阅读来源、整理证据、起草、保存、审校和导出的写作者。熟悉感是优点。只有在能澄清对象身份或反馈时，才允许意外感。

增加可见能力前，先回答三项完成度问题：它是否让第一份成品更容易完成、让已有作品更安全，
或让下一次会话更容易继续？三个答案都是否的变更属于功能清单，不属于产品完成度，不进入当前 Beta。

Macintosh System 6 桌面隐喻是约束，不是装饰：

- 可见对象优先于抽象 AI 控件。
- 一条写作路线优先于功能清单。
- AI 输出在用户保存、摘录、插入或导出前都是临时的。
- TeachText 是 Manuscript 写作面。ClioTalk 是对话面。
- Reader 摘录来源材料。Scrapbook 保存用户主动挑选的材料。
- File Floppy 是临时上下文。Project Hard Disk 是持久项目状态。

## 历史词汇：System 6 是基线，Classic Mac OS 是词汇库

System 6 是本产品的视觉与对象语法基线，不是历史截止日期。整个 Classic Mac OS 谱系都是
可用的词汇库。MultiFinder、Balloon Help、WindowShade、Apple Guide 以及其他后来的
Classic Mac OS 思想，只要能改善产品，就可以被引进、消化和改造。年代是需要记录的证据，
不是拒绝有用设计的理由。

引进历史元素必须同时满足以下条件：

- 先检查原生资源或对应年代的真实运行行为，并记录证据来自哪个系统版本；不能把后来的功能
  说成 System 6 的原生行为。
- 保留原始角色和状态转换。外观相近或位于同一块窗口边框上的控件，并不因此可以互换。
- 针对网页、指针、键盘、触控、窄屏和无障碍重新消化，而不是复刻过时的输入限制。
- 默认体验保持安静。后续系统功能应按需出现，或在真正相关时出现，不能堆成功能清单。
- 六套 Appearance 使用同一套语义 DOM 和状态模型。各时代只改变材质与视觉几何，不改变
  对象含义。

控件语义是承重规则：

- 标题栏 Zoom box 在窗口的当前尺寸/位置与标准尺寸/位置之间切换。
- 右下角 grow box 用于手动改变可调整窗口的尺寸。
- WindowShade 是后来的 Classic Mac OS 行为，只把窗口收成标题栏，并保留为独立的双击动作；
  Zoom 绝不能退化成 WindowShade。
- 完整应用和文档窗口可以提供 Zoom 与 grow。固定系统窗口和 Desk Accessory 通常不提供，
  除非原生证据或明确的产品合约另有说明。

渐进式发现应分工，而不是堆成一套教程：

- OOBE 保持为单一、可关闭的系统欢迎窗口。它只指向苹果菜单和「特别」菜单，让 AI 设置保持
  可选，绝不变成设置向导。
- MultiFinder 通过启动环境被发现：在用户作出选择的位置简短解释 Finder 与 MultiFinder，
  只有启用 MultiFinder 后，才教学真实出现的菜单栏应用切换器。
- [Balloon Help](https://en.wikipedia.org/wiki/Balloon_help) 是能感知状态的帮助模式：
  在支持悬停的设备上默认开启，让新用户先遇见它；用户可自行关闭且选择会被记住。
  它用一两句可执行的文案回答「这是什么？」和「为什么现在不能用？」；
  不能变成自动 OOBE 导览，也不能取代面向任务的 System Help。
- Balloon Help 只面向陌生图标、系统对象和禁用原因，不重复可见按钮文字。指针悬停或键盘
  聚焦可以显示它；触控则先显式进入帮助模式，再点击对象查看。

一句话：**System 6 是语法，Classic Mac OS 是词汇库。**

## 设计旋钮

本产品的默认设计设置：

| 旋钮 | 数值 | 含义 |
| --- | --- | --- |
| 设计变化度 | 3 / 10 | 可预测的 System 6 对象语法。不要任意做表现型布局。 |
| 动效强度 | 2 / 10 | 只做状态反馈。不要装饰性编舞。 |
| 视觉密度 | 7 / 10 | 稠密、可扫读的工具表面。留白主要给写作和阅读。 |

例外必须写进 feature contract。`Cover Glass` 玻璃封面（文件名 `liquid-cover.js`）、`CMF Studio`、`ClioStage` 和媒体创作工具可以有更宽的视觉范围，但仍要复用同一套窗口、控件、状态和主题合约。

## 六套 Appearance，一套对象语法

System 6、Platinum、Aqua、Snow Leopard、Yosemite 和 Liquid Glass 是同一桌面
语言的材质皮肤。它们共享对象名称、DOM 结构、任务流程、文案、状态模型、键盘行为和功能合约。

维护谱系刻意分为三条：

- Classic → Platinum
- Aqua → Snow Leopard
- Liquid Glass → Yosemite

`recipeBase` 指定比较与编写时的基底，不会激活第二个主题 class。每个子主题拥有可评审的
显式差异，因此 Aqua 的糖果材质不会泄漏到 Snow Leopard，Liquid Glass 的折射也不会泄漏到
Yosemite。`family` 只用于确实共享的内部 primitive。

主题可以改变：

- 材质：位图纸面、实体 chrome、半透明玻璃、模糊、边缘高光。
- 边框和阴影 token。
- 圆角 token。
- 同一语义图标 id 下的图标渲染。
- 材质需要的小幅视觉间距修正。

主题不得在没有文档说明的情况下改变：

- 用户任务顺序。
- 存在哪些控件。
- 对象名称或动作动词。
- 保存状态语义。
- 窗口所有权边界。
- 阅读、写作、摘录、保存或导出规则。

Appearance 工作应优先走 token：

1. 在 `apps/desktop/styles/00-foundation.css` 添加默认 token。
2. 历史主题参数表差异写进 `apps/desktop/styles/65-appearance-themes.css`；Liquid Glass 的值写进
   `apps/desktop/styles/70-liquid-glass.css`。
3. 子主题以注册表中的 `recipeBase` 为比较对象，只覆盖真正不同的 semantic value 或小型结构 recipe。
4. 共享基础 selector 消费 token。
5. 避免应用专属主题 selector 和新增 Liquid Glass twin。

如果 Liquid Glass twin 在结构上确实必要，写一条短注释说明为什么 token 不能承载这个差异。

### Appearance 证据账本

历史主题必须有可评审的来源链。参考代码用来确定几何与状态覆盖，不提供可直接移植的
selector、DOM 或可再分发美术资源。

| 主题目标 | 首要实现证据 | 次要证据 | 最终校准 |
| --- | --- | --- | --- |
| Platinum — Mac OS 9 | MIT 许可的 [`classic-stylesheets` Mac OS 9 recipe（固定于 `9ebd2d8`）](https://github.com/nielssp/classic-stylesheets/tree/9ebd2d84664095345097a71e1a137f985d03d4f2/themes/macos9)：window、button、input、tab、list、menu、16px scrollbar 的几何与状态 SVG | Apple [Mac OS 8 HIG](https://dev.os9.ca/techpubs/mac/pdf/HIGOS8Guidelines.pdf) 提供 19px 标题栏、20×58px 标准按钮、22px edit field、dialog 间距与控件语义；[Classicy](https://github.com/robbiebyrd/classicy/tree/ca8c0ae294b5a289aa5a69cc223c152b55672d35) 和 [platinum.css](https://github.com/mat-sz/platinum.css/tree/d3f345731f886c7dc767be5877f10db14f11ead4) 只交叉检查缺失几何 | 用 [GUIdebook Mac OS 9 图库](https://guidebookgallery.org/screenshots/macos90) 中真实 Finder、Appearance、Open dialog、menu、SimpleText 与 alert 截图校准 |
| Aqua — Mac OS X 10.2 Jaguar | [Quaqua 9.1 nested package](https://www.randelshofer.ch/quaqua/files/quaqua-9.1.nested.zip) 中的 `Quaqua15JaguarLookAndFeel.java`、`jaguar/` 资源、共享 push/default/field/choice/popup/scrollbar 资源，以及 [Jaguar wrap-tab 合约](https://www.randelshofer.ch/quaqua/guide/jtabbedpane.html) | Apple 存档的 [Aqua HIG](https://developer.apple.com/library/archive/documentation/UserExperience/Conceptual/OSXHIGuidelines/) 只提供控件角色与交互语义，不作为 Jaguar 像素值 | [512 Pixels Jaguar 图库](https://512pixels.net/projects/aqua-screenshot-library/mac-os-x-10-2-jaguar/) 中真实 10.2 的 Finder、System Preferences、打开/存储面板、Mail 与对话框 |
| Snow Leopard — Mac OS X 10.6 | Quaqua 9.1 中的 `Quaqua16SnowLeopardLookAndFeel.java`、Snow 资源、active/inactive 标题栏和工具栏、source-list 状态与尺寸变体；[Quaqua changelog](https://www.randelshofer.ch/quaqua/changes.html) 记录 Snow LAF 从 6.0 开始提供 | 同时代 Chromium 的 [`platform-mac-snowleopard` Inspector CSS](https://chromium.googlesource.com/chromium/reference_builds/chrome_linux/+/f108f78bd628aceeb5d44dcaaac401a2a2e97a9d/resources/inspector/inspector.css) 提供 Web toolbar、search field、status bar 和 compact custom scrollbar 证据 | [512 Pixels Snow Leopard 图库](https://512pixels.net/projects/aqua-screenshot-library/mac-os-x-10-6-snow-leopard/) 中真实 10.6 的 Finder、System Preferences、打开/存储面板、Mail 与对话框 |
| Yosemite — OS X 10.10 | [Yosemite-gtk-theme `03b6f721`](https://github.com/vinceliuice/Yosemite-gtk-theme/tree/03b6f721)：checkbox/radio/titlebutton 资产几何与 `gtk-light.css` 控件值，以及同时代纯 CSS 窗口研究提供的 shell 层级 | Apple 存档的 [OS X HIG](https://developer.apple.com/library/archive/documentation/UserExperience/Conceptual/OSXHIGuidelines/) 提供控件角色；[512 Pixels OS X 10.10 图库](https://512pixels.net/projects/aqua-screenshot-library/mac-os-x-10-10-yosemite/)（Retina 2x）校准 Finder、系统偏好设置与 Apple 菜单的 translucency | 真实 10.10 的 Finder、System Preferences、打开/存储面板、菜单、工具栏、侧栏、控件与滚动条，已 pin 在维护者 fidelity baseline 中 |

发生冲突时按以下权威顺序处理：目标系统的原生截图优先；Quaqua 补足几何、可重复状态和
regular/small/mini 的关系；同期 Web CSS 只约束相同的 Web 自有表面。因此 Chromium Inspector
的 11px 灰色滚动条只能作为 compact Web 变体；Snow Leopard 的系统滚动条仍采用 Quaqua 和
原生打开面板共同显示的 15px 蓝色 Aqua 控件。外部 selector、组件 DOM 和 Apple 所有的美术
资源不得进入仓库。

Yosemite 只是维护血缘上的 Liquid-Glass 家族后代：它拥有
`body[data-theme="yosemite"]` 下独立的 10.10 painter，绝不能被实现为
"Liquid Glass 减去玻璃覆盖"（见 `docs/THEME-FAMILY-CONTRACT.md`）。

Platinum 字体有明确许可边界：Charcoal 与 Charcoal CY 只作为本机系统字体名；跨平台时使用
固定在 [`2de32f2` 的 OFL Asap Variable](https://github.com/Omnibus-Type/Asap/tree/2de32f20d7a0d48d4084adcf4bd6ac8115cf2f1a)
测量兜底，最后才使用已安装的 Geneva。不能仅为了让截图显示规范字体名，就随项目分发从
Apple 系统提取的字体或许可证不明的仿制字体。Theme Lab 显示“Charcoal”代表历史目标，
不等于项目已捆绑 Apple 字体二进制。

## 对象词汇表

agent 发明 UI 前必须先选择一个对象角色：

| 角色 | 用途 | 默认形状 |
| --- | --- | --- |
| 写作路线窗口 | Question Sheet、Outline、Section Drafts、TeachText、Review Desk、Project CD | 使用 `.window`、`.title-bar`、`.window-pane` 的完整应用窗口 |
| Finder 表面 | Project Hard Disk、Applications、Trash、文件夹 | 图标网格或列表，对象优先的动作 |
| Reader 表面 | 来源阅读、提取、摘录 | 阅读 pane 加摘录控件 |
| 侧边 Desk Accessory | Dictation Pad、Translation Pad、小型助手 | 靠近被支持工作的紧凑 DA 或 sidecar |
| 工具窗口 | Searcher、DocMap、ClioStage、System Help | 使用共享 chrome 的任务窗口 |
| Modal | 破坏性确认、导入导出操作、必要设置 | 短、阻塞、只处理一个决定 |
| 状态表面 | 模型状态、保存状态、OCR/search/import 进度 | 绑定真实操作的可见反馈 |
| 创作实验室 | 玻璃封面（Cover Glass）、CMF Studio、媒体工具、独立实验 | 可以更有表现力，但仍受控件和状态约束 |

添加 class 前优先使用现有 primitive：

- `.window`、`.title-bar`、`.window-pane`
- `.btn`、`.mini-btn`、`.button-row`
- 有限下拉必须使用自定义 System 6 select harness
- Finder items 和 list rows 表示对象
- 共享 empty、loading、error、selected、hover、focus、active、disabled 状态
- 通过 `apps/desktop/app/core/system-icons.js` 使用现有 system icon id

不要因为某个形状看起来现代就新增组件。只有现有对象角色无法表达任务时，才添加新形状。

## 布局和几何

窗口和 panel 几何必须 token 化。重复出现的新值应放进 `apps/desktop/styles/00-foundation.css`，不要散落在多个 selector 中。

使用：

- 产品 UI 控件使用固定 rem 或 px scale。
- 二维 pane 使用 CSS Grid。
- 一维行和按钮组使用 Flexbox。
- sibling 间距使用 `gap`。
- 重复几何使用组件级 token。

避免：

- 落地页 hero 结构。
- feature card rows。
- 嵌套 card。
- 任意 `z-index` 值。
- 新的 layout `!important`。
- JS 为布局决策新增 inline style。
- 在 `top`、`left`、`width`、`height`、`padding` 或 `margin` 上做布局动画。

稠密工具表面应使用 pane、row、divider 和对象列表。Card 只用于重复条目、modal 和确实需要框定的工具。

层级使用 `apps/desktop/styles/00-foundation.css` 中具名的 `--z-*` 词汇。全局层级顺序为窗口、
置顶窗口、系统 modal、启动/关机、演示遮罩，最后是系统菜单。窗口内部控件、
滚动条、select menu 和命令 popover 必须使用窗口 stacking context 内的本地
`--z-local-*` token；不要为了修一个内部遮挡问题，把它直接跳到全局菜单或演示层。

## 材质规则

Classic theme：

- 黑、白、shade 和 desktop gray 承载界面。
- 默认锐角。
- 边框和 inset 应像 System 6 控件。
- bitmap / System 风格图标语言优先于装饰插画。

Liquid Glass theme：

- Glass 是同一对象的材质，不是通用 glassmorphism 许可。
- surface、rim、highlight、tint、shadow 和 radius 使用现有 glass tokens。
- 半透明仍必须可读。文字对比度必须成立。
- 优先 token swap，而不是 selector 复制。
- 当表面会变得不可读时，提供 reduced-transparency 或 solid-fill 行为。
- hover 预览、相对表面、控件连续性、动效家族和逐控件验收条件，遵循
  [LIQUID-GLASS-CONTROLS.zh-CN.md](LIQUID-GLASS-CONTROLS.zh-CN.md)。

Platinum 由 Classic 派生：

- 保留 Classic 的密度与对象语法。
- 增加中性灰层次、紧凑 bevel、活动标题栏条纹和 Mac OS 8/9 控件，不能变成 Windows 95 chrome。

Aqua 是第二个 recipe 根：

- 使用 Jaguar 早期 pinstripe、塑料厚度、蓝色 focus、糖果 default control 和实体窗口。

Snow Leopard 由 Aqua 派生：

- 保留 Aqua 的控件骨架，同时收敛糖果高光。
- 使用统一银灰 chrome、更紧凑密度、成熟 sidebar 与更安静的阴影。

Yosemite 由 Liquid Glass 派生：

- 保留现代窗口结构，但压成薄、冷、紧凑的 10.10 平面与克制 vibrancy。
- 不继承 Liquid Glass 的折射、大圆角或卡片式纵深。

所有 Appearance 共同遵守：

- 每个对象 id 只有一个图标家族。
- 控件使用同一套状态词汇。
- 英文和中文文本都必须放得下。
- 除非操作确实发生，视觉状态不得暗示保存、记忆、联网、索引、检查或导出。

## 交互和动效

产品动效是反馈：

- 交互组件必须有 hover、focus、active、selected、disabled、loading、empty 和 error 状态。
- 大多数 transition 应在 150 到 250 ms。
- 默认只动画 transform 和 opacity。
- 遵守 `prefers-reduced-motion`。
- 普通产品窗口不做页面加载编舞。
- 除非能表达 live state，不做常驻循环动效。

添加动画库前，先使用项目原生模式。

共享状态契约、行为内核、外观职责与原生边界遵循[架构](../ARCHITECTURE.zh-CN.md)。
分阶段迁移保留在维护者计划中，不构成第二套公开设计权威。

## 文案规则

UI 文案应该直接，并且绑定对象：

- 动作使用 verb plus object：`Save draft`、`Delete project`、`Export PNG`。
- Link 文本离开上下文也要能理解。
- 错误消息说明失败内容和下一步可能动作。
- 空状态说明用户如何创建或添加缺失对象。
- 避免通用 AI 产品腔，例如 `elevate`、`seamless`、`next-generation`、`unleash`、`game-changer`，以及含糊的 `AI-powered` 宣称。

中文 UI 必须保留 `CLAUDE.md` 中的命名规则。`Scrapbook` 和 `TeachText` 不翻译。

## Agent 预检

修改 UI 表面前，在工作记录或 PR 中回答：

1. 这是哪种产品对象角色？
2. 它属于核心写作路线，还是被召唤的工具？
3. 复用了哪些现有 primitives？
4. 哪些 tokens 定义它的几何、材质和状态？
5. 它相对注册表 `recipeBase` 改变了什么？
6. 存在哪些状态：default、hover、focus、active、selected、disabled、loading、empty、error？
7. 哪个验证覆盖了六时代 Theme Lab，以及至少一个窄屏 Classic/Liquid viewport？

如果答案是“新模式”，先说明理由，再编辑 CSS。

## 禁止的默认做法

除非 feature contract 明确需要，否则拒绝这些模式：

- 居中营销 hero。
- 三个等宽 feature cards。
- card 或 row 上的粗侧边强调条。
- 渐变文字。
- 装饰性 glass cards。
- 通用 dashboard card grid。
- 嵌套 cards。
- 有限值下拉使用原生 dropdown，而不是 System 6 select harness。
- 新增 `!important`。
- 新增任意 `z-index`。
- JS 新增布局 inline styles。
- 手绘感装饰 SVG 场景。
- 虚假的精确数字。
- 占位名字、假 logo 或 lorem ipsum。
- 因为看起来厉害而添加动效，而不是因为状态发生了变化。

## 评审闸门

视觉工作运行：

```sh
npm run build:app
npm run verify:css
npm run verify:design
npm run verify:theme-lab
npm run smoke:release
```

主题敏感 CSS 工作还要运行：

```sh
npm run audit:liquid-twins
npm run visual:eval
```

把 `npm run visual:eval` 的输出配合 `CLAUDE.md` 中的浏览器快照流程使用，然后运行 `npm run visual:diff -- <snapshot-file>`。

可选设计反模式扫描：

```sh
node external/impeccable/skill/tooling/detect.mjs --json index.html app styles
```

第三方和生成文件的 findings 是信号，不是自动 blocker。当本地产品规则更具体时，以本地规则为准。

`npm run verify:design` 是本地 blocker。计数在 `tooling/design-budget.json` 中，只有在明确说明理由时才允许上调。

## 迁移优先级

1. 触碰附近 selector 时，把 easy Liquid Glass twins 迁成 token swap。
2. 从现有 primitives 中长出一套小型 System 6 component kit。
3. 为任何新增的重复窗口或控件模式添加 visual snapshot 覆盖。
4. 把稳定几何移入 tokens 或 classes，减少 JS inline layout decisions。
5. 为上面的禁止默认做法添加项目专属 detector rules。

目标不是更多装饰。目标是每个 agent 在动用 taste 之前，先使用同一套对象语法。
