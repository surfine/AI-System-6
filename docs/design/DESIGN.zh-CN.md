<!-- canonical-source: docs/design/DESIGN.md -->
<!-- source-sha256: 25d5d63a803b29a72ae772ae0e291fa1dd0970b677c109a4d96cf1992abd6036 -->

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
- 八套 Appearance 使用同一套语义 DOM 和状态模型。各时代只改变材质与视觉几何，不改变
  对象含义。

控件语义是承重规则：

- 标题栏 Zoom box 在窗口的当前尺寸/位置与标准尺寸/位置之间切换。
- 右下角 grow box 用于手动改变可调整窗口的尺寸。
- WindowShade 是后来的 Classic Mac OS 行为，只把窗口收成标题栏，并保留为独立的双击动作；
  Zoom 绝不能退化成 WindowShade。
- 完整应用和文档窗口可以提供 Zoom 与 grow。固定系统窗口和 Desk Accessory 通常不提供，
  除非原生证据或明确的产品合约另有说明。

渐进式发现应分工，而不是堆成一套教程：

- 真正的首次使用如果没有可恢复的 Working Session，ClioTalk 会打开，只显示一句简短问候
  和少量可选对话起点。它们是提示，不是永久模式。写作者可以忽略它们、直接输入任何内容，
  或跳过介绍；完成第一次普通交流后即视为完成。以后空白 Chat 使用 ClioTalk 的普通欢迎。
  OOBE 绝不能变成 wizard，也不能先展示 provider 字段、项目设置或功能清单。
- Clio 只在当前任务真正走到某个对象时才介绍它。它可以提供既有应用动作，打开项目硬盘、
  Scrapbook、问题单、TeachText、审校台或 AI 设置；但不能把这些应用重做进对话，也不能把
  模型输出当成已保存作品。「开始使用」和「重播介绍」都回到同一段简短 ClioTalk 入口；
  确定性的 30 秒导览仍可按需使用，但不属于启动步骤。
- MultiFinder 通过启动环境被发现：在用户作出选择的位置简短解释 Finder 与 MultiFinder，
  只有启用 MultiFinder 后，才教学真实出现的菜单栏应用切换器。
- System Help 继续作为可浏览、可版本控制的产品对象与动作目录。ClioTalk 复用这份本地知识
  回答任务中的产品问题；除非用户明确要求，否则产品帮助不调用网络搜索。System Help 不是
  第二套 onboarding 流程。
- [Balloon Help](https://en.wikipedia.org/wiki/Balloon_help) 是能感知状态的帮助模式：
  在支持悬停的设备上默认开启，让新用户先遇见它；用户可自行关闭且选择会被记住。
  它用一两句可执行的文案回答「这是什么？」和「为什么现在不能用？」；
  不能变成自动 OOBE 导览，也不能取代面向任务的 System Help。
- Balloon Help 只面向陌生图标、系统对象和禁用原因，不重复可见按钮文字。指针悬停或键盘
  聚焦可以显示它；触控则先显式进入帮助模式，再点击对象查看。
- 气球站在哪里也是它说的话的一部分，按这个顺序：尾巴指向它解释的对象；不盖住这个对象；
  不盖住这个对象按下去会打开的东西——包括还没有拉下来的菜单；不盖住它的同类邻居——
  同一列的下一个图标、同一行的下一个菜单标题；做到以上几条之后，才是尽量近。面板在它
  底下开合时它会重新落位；地方不够时它先变窄，而不是先走远。

一句话：**System 6 是语法，Classic Mac OS 是词汇库。**

## 设计旋钮

本产品的默认设计设置：

| 旋钮 | 数值 | 含义 |
| --- | --- | --- |
| 设计变化度 | 3 / 10 | 可预测的 System 6 对象语法。不要任意做表现型布局。 |
| 动效强度 | 2 / 10 | 只做状态反馈。不要装饰性编舞。 |
| 视觉密度 | 7 / 10 | 稠密、可扫读的工具表面。留白主要给写作和阅读。 |

例外必须写进 feature contract。`Cover Glass` 玻璃封面（文件名 `liquid-cover.js`）、`CMF Studio`、`ClioStage` 和媒体创作工具可以有更宽的视觉范围，但仍要复用同一套窗口、控件、状态和主题合约。

## 共享控件：把预防放在视觉评审之前

新功能复用已有窗口、按钮、输入框、下拉框和面板原语。功能 CSS 负责排列，
共享原语负责控件绘制，外观块负责材质参数。同类问题在真正的归属层修复，
核对对应主题，并覆盖初始化后才插入的控件。

| 不变量 | 实现纪律 |
| --- | --- |
| 一个可见指示符和标签 | 下拉箭头只由原生选择器、控件背景或外层伪元素之一绘制。自绘接管后的原生控件在禁用状态下也必须不可见。状态变化只改填充颜色时用 `background-color`，避免 `background` 简写清掉指示图。共享箭头资源周围保持透明。 |
| 主题字体 | 控件和选项使用 `--ui-font`、`--system-control-size` 及共享字重角色。正文和编辑字体只用于相应内容表面。用中英文检查原生和自绘两条路径，功能不得另造一套控件字体或字重。 |
| 主题形状 | 按钮和有框表面使用语义圆角参数。Liquid Glass 保持非零圆角和同心嵌套，历史外观的几何由各自主题拥有。像素美术、分隔线和圆形控件保留各自语义，不能豁免整个窗口来掩盖失败控件。 |
| 状态连续性 | 默认、悬停、键盘聚焦和禁用状态保持同一套标签与指示符归属。打开、选择和动态挂载遵循共享下拉控件的生命周期。 |

`verify:css`（包括带 `--css-file` 的 `verify:quick`）自动运行
`node tooling/verify-liquid-shapes.mjs --primitives`。这个轻量浏览器夹具直接加载
生产源样式（含延迟样式）、主题注册表和真实下拉控件函数，检查六种外观、控件字体、
箭头唯一性与透明底、原生控件隐藏，以及 Liquid Glass 控件和面板的圆角。
不需要应用服务或构建；报告分别存入 `dist/verification/liquid-shapes/`。
失败会阻断 CSS 门禁。`visual-primitives` 功能测试会故意放回已知错误，证明检查能发现它们。

引入新原语，或现有夹具未覆盖的功能控件上下文时，补充对应夹具。
复用未改动的共享原语，不新增截图矩阵。新布局、溢出、业务交互和移动端行为仍需
各自的定向证据；夹具通过不代表所有应用画面都正确。大范围 Liquid Glass 几何改动
使用已有的完整 `--url` 窗口审计；需要对照运行中的构建时用 `--url ... --select-only`。

## 八套 Appearance，一套对象语法

System 6、Platinum、Aqua、Snow Leopard、Yosemite、Big Sur、Liquid Glass 和 NeXTSTEP 是同一桌面
语言的材质皮肤。它们共享对象名称、DOM 结构、任务流程、文案、状态模型、键盘行为和功能合约。

维护谱系刻意分为四条：

- Classic → Platinum
- Aqua → Snow Leopard
- Liquid Glass → Yosemite / Big Sur
- NeXTSTEP（独立材质适配；专用图标押后，暂用 Classic）

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

### Liquid Glass 圆角体系

Liquid Glass 的可见界面表面全部采用圆角：按钮（含选中、禁用和焦点状态）、输入框、
标签、列表高亮、卡片、菜单、弹窗和窗口外框。后加载的应用样式也使用同一套形状
token，不得重新引入直角控件或带框面板的直角。画作、文档字形、画布像素和不可见
的布局盒不添加装饰性裁切。

`70-liquid-glass.css` 中的圆角梯度为：微型细节 4px、紧凑控件 8px、常规控件与内层
表面 12px、面板 16px、窗口 24px；胶囊和圆形分别使用独立 token。这些是本产品的
校准值，并非 Apple 规定的尺寸。组件 token 映射到这套梯度，共享的直角默认值留在
`00-foundation.css`，使其他外观保留原有几何。小复选框使用 4px 圆角，以保持与单选
圆钮的形状区别。

嵌套表面在实际使用圆角的元素上，以父圆角减去内边距计算，并保留 4px 下限。
密集桌面控件用紧凑圆角矩形，突出操作用胶囊形；焦点环沿用控件轮廓。
内容框的圆角不会在正文后面额外添加玻璃或模糊。

构建并启动应用后，运行
`node tooling/verify-liquid-shapes.mjs --url http://127.0.0.1:4173`，检查注册窗口、
后加载样式、菜单与弹窗、控件状态、原生及自定义下拉箭头，以及手机横竖屏控件。

依据 Apple [HIG 的层级、和谐与一致性原则](https://developer.apple.com/design/human-interface-guidelines/)、
[Get to know the new design system](https://developer.apple.com/videos/play/wwdc2025/356/)
中的固定圆角、胶囊与同心嵌套形状，以及
[Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/) 对控件层与内容层的区分。

### Appearance 证据账本

历史主题必须有可评审的来源链。参考代码用来确定几何与状态覆盖，不提供可直接移植的
selector、DOM 或可再分发美术资源。

| 主题目标 | 首要实现证据 | 次要证据 | 最终校准 |
| --- | --- | --- | --- |
| Platinum — Mac OS 9 | MIT 许可的 [`classic-stylesheets` Mac OS 9 recipe（固定于 `9ebd2d8`）](https://github.com/nielssp/classic-stylesheets/tree/9ebd2d84664095345097a71e1a137f985d03d4f2/themes/macos9)：window、button、input、tab、list、menu、16px scrollbar 的几何与状态 SVG | Apple [Mac OS 8 HIG](https://dev.os9.ca/techpubs/mac/pdf/HIGOS8Guidelines.pdf) 提供 19px 标题栏、20×58px 标准按钮、22px edit field、dialog 间距与控件语义；[Classicy](https://github.com/robbiebyrd/classicy/tree/ca8c0ae294b5a289aa5a69cc223c152b55672d35) 和 [platinum.css](https://github.com/mat-sz/platinum.css/tree/d3f345731f886c7dc767be5877f10db14f11ead4) 只交叉检查缺失几何 | 用 [GUIdebook Mac OS 9 图库](https://guidebookgallery.org/screenshots/macos90) 中真实 Finder、Appearance、Open dialog、menu、SimpleText 与 alert 截图校准 |
| Aqua — Mac OS X 10.2 Jaguar | [Quaqua 9.1 nested package](https://www.randelshofer.ch/quaqua/files/quaqua-9.1.nested.zip) 中的 `Quaqua15JaguarLookAndFeel.java`、`jaguar/` 资源、共享 push/default/field/choice/popup/scrollbar 资源，以及 [Jaguar wrap-tab 合约](https://www.randelshofer.ch/quaqua/guide/jtabbedpane.html) | Apple 存档的 [Aqua HIG](https://developer.apple.com/library/archive/documentation/UserExperience/Conceptual/OSXHIGuidelines/) 只提供控件角色与交互语义，不作为 Jaguar 像素值 | [512 Pixels Jaguar 图库](https://512pixels.net/projects/aqua-screenshot-library/mac-os-x-10-2-jaguar/) 中真实 10.2 的 Finder、System Preferences、打开/存储面板、Mail 与对话框 |
| Snow Leopard — Mac OS X 10.6 | Quaqua 9.1 中的 `Quaqua16SnowLeopardLookAndFeel.java`、Snow 资源、active/inactive 标题栏和工具栏、source-list 状态与尺寸变体；[Quaqua changelog](https://www.randelshofer.ch/quaqua/changes.html) 记录 Snow LAF 从 6.0 开始提供 | 同时代 Chromium 的 [`platform-mac-snowleopard` Inspector CSS](https://chromium.googlesource.com/chromium/reference_builds/chrome_linux/+/f108f78bd628aceeb5d44dcaaac401a2a2e97a9d/resources/inspector/inspector.css) 提供 Web toolbar、search field、status bar 和 compact custom scrollbar 证据 | [512 Pixels Snow Leopard 图库](https://512pixels.net/projects/aqua-screenshot-library/mac-os-x-10-6-snow-leopard/) 中真实 10.6 的 Finder、System Preferences、打开/存储面板、Mail 与对话框 |
| Yosemite — OS X 10.10 | [Yosemite-gtk-theme `03b6f721`](https://github.com/vinceliuice/Yosemite-gtk-theme/tree/03b6f721)：checkbox/radio/titlebutton 资产几何与 `gtk-light.css` 控件值，以及同时代纯 CSS 窗口研究提供的 shell 层级 | Apple 存档的 [OS X HIG](https://developer.apple.com/library/archive/documentation/UserExperience/Conceptual/OSXHIGuidelines/) 提供控件角色；维护者自己的 10.10 截图校准 Finder、系统偏好设置与 Apple 菜单的 translucency（2026-09-18 核实：原来引用的 512 Pixels Aqua 图库止于 10.7 Lion，其「10.10」页面是死链，已删除） | 真实 10.10 的 Finder、System Preferences、打开/存储面板、菜单、工具栏、侧栏、控件与滚动条，已 pin 在维护者 fidelity baseline 中 |

发生冲突时按以下权威顺序处理：目标系统的原生截图优先；Quaqua 补足几何、可重复状态和
regular/small/mini 的关系；同期 Web CSS 只约束相同的 Web 自有表面。因此 Chromium Inspector
的 11px 灰色滚动条只能作为 compact Web 变体；Snow Leopard 的系统滚动条仍采用 Quaqua 和
原生打开面板共同显示的 15px 蓝色 Aqua 控件。外部 selector、组件 DOM 和 Apple 所有的美术
资源不得进入仓库。

Yosemite 只是维护血缘上的 Liquid-Glass 家族后代：它拥有
`body[data-theme="yosemite"]` 下独立的 10.10 painter，绝不能被实现为
"Liquid Glass 减去玻璃覆盖"（见 [THEME-FAMILY-CONTRACT.md](THEME-FAMILY-CONTRACT.md)）。

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

**这些原语已经承载全部六个纪元。** 用它们搭出来的应用，不写一行主题 CSS 就继承
了每一个纪元——这正是上面那份清单是规则而不是建议的原因：

| 原语 | 承载什么 |
| --- | --- |
| `.window`、`.title-bar`、`.details-bar`、`.window-pane` | 窗口框、它的控件、状态条 |
| `.btn`、`.mini-btn`、`.button-row` | 每一个按压控件及其状态 |
| `.field-row`、`.control-field`、`.select-wrap` | 选择控件、文本字段、System 6 甄选架 |
| `.system-tabs`、`.system-tab`、`.system-tab-panel` | 标签条与它打开的面板 |
| `.view-controls`、`.view-btn` | 视图切换 |
| `.menu-popover`、`.balloon-help`、`.finder-operation-modal` | 菜单、临时说明面、模态框 |
| `.finder-item`、`.sys-icon` | 对象与它们的图标 |

反过来就是 Theme Lab 执行的规则：**不在**这份清单上的控件没有纪元行头可继承，
为一个标本造一个，等于为六个纪元的装修买单而没有任何用户界面因此受益。Theme Lab
只展示这些原语；`verify:css` 用 `themeLabReplicaMentions` 棘轮锁住它对外观表的开销。

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

修改 UI 表面前，确定对象角色、复用原语、参数归属和受影响状态。
新增或修改控件都要遵守上面的共享控件不变量。新原语说明必要性并补充夹具；
普通复用不要求填写固定问卷或报告。证据按行为选择：局部控件修正不重跑
六时代应用或手机／平板矩阵，布局变化仍检查相应主题和方向下的受影响表面。

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

沿用现有定向开发命令，检查本次负责的 CSS 和行为：

```sh
npm run verify:quick -- --feature <affected-contract> --css-file apps/desktop/styles/<owned-file>.css
```

每个负责的样式文件各带一个 `--css-file`，其中的 CSS 检查已自动包含基于源文件的
共享控件浏览器验证。没有对应行为合约时省略 `--feature`；只有应用源文件已构建，
或本次只改文档／工具时，才用 `--no-build`。纯文档改动运行 `npm run verify:docs`
和 `git diff --check`。

布局或材质改动，按 CSS 技能的定向截图命令，在本批改动前后各检查一次受影响表面。
只因行为变化、已复现失败或未决疑点扩大覆盖，未变化的证据继续复用。
大范围外观改动及发布／打包沿用 `CLAUDE.md` 定义的完整门禁；不因每次视觉小修
自动跑 Theme Lab、全局视觉差异、smoke 和发布套件。确需对照时，仍可使用
`npm run visual:eval` 和 `npm run visual:diff -- <snapshot-file>` 诊断。

可选设计反模式扫描：

```sh
node external/impeccable/skill/scripts/detect.mjs --json apps/desktop/index.html apps/desktop/app apps/desktop/styles
```

第三方和生成文件的 findings 是信号，不是自动 blocker。当本地产品规则更具体时，以本地规则为准。

`npm run verify:design` 是本地 blocker。计数在 `tooling/design-budget.json` 中，只有在明确说明理由时才允许上调。

## 迁移优先级

1. 行为变化时修复所属原语或参数；只有存在层叠证据才迁移主题重复规则，不因位置相邻顺手改动。
2. 从现有 primitives 中长出一套小型 System 6 component kit。
3. 为任何新增的重复窗口或控件模式添加 visual snapshot 覆盖。
4. 把稳定几何移入 tokens 或 classes，减少 JS inline layout decisions。
5. 为上面的禁止默认做法添加项目专属 detector rules。

目标不是更多装饰。目标是每个 agent 在动用 taste 之前，先使用同一套对象语法。
