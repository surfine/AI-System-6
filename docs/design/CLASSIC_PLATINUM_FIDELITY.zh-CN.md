<!-- canonical-source: docs/design/CLASSIC_PLATINUM_FIDELITY.md -->
<!-- source-sha256: 5a22bc42791610bc8b5205faa4f68556e128de98928a3f832a4d39a35f749846 -->

# Classic / Platinum 保真度合约

> 中文参考版。英文版为准；本文件仅供人类参考。英文源文件更新后，请同步刷新本文件并运行 `npm run verify:docs`。

本文件是 [`tooling/classic-platinum-fidelity-contract.json`](../../tooling/classic-platinum-fidelity-contract.json) 的文字说明，记录 Classic（System 6）与 Platinum（Mac OS 9）外观的视觉与交互合约。它是一份“现代产品”合约，不是历史博物馆规格。

## 权威顺序

证据冲突时按此顺序裁决：当前产品功能 / 用户任务 / 触屏与移动端 / 无障碍 → `CLAUDE.md` 与 `docs/design/` 下的设计文档 → 仓库现有主题架构、共享 DOM、状态模型、响应式合约 → 真实 System 6.0.8 / Mac OS 9 截图、原生资源与运行时行为 → Apple Mac OS 8 HIG 与测量记录 → 外部参考 → 主观品味。历史维度只是校准证据，不是每台设备上的硬性验收值。

## 产品不是博物馆

不得为了贴近历史而缩小触控目标、把手机变成缩小的桌面截图，或恢复过时的输入限制（精确拖拽、仅 hover、右键）。

## 图标资产冻结

保留 Classic 平滑单色 SVG 与已接受的 Platinum 图标族。不新增、重绘、替换或批量评审图标；不进入像素模式；不用 ImageGen。允许的图标改动仅限 CSS：尺寸、对齐、内边距、裁剪，以及 hover / 选中 / 非激活 / 禁用状态下的容器与 mask 行为。图标问题记为视觉债，除非是纯 CSS 布局或状态错误。

## 自适应三层尺寸

用“历史参考 / 精细指针 / 粗指针”三层语义，而不是一套固定像素。不得用 `transform: scale()` 整页缩放；用主题与输入方式 token，让菜单栏、标题栏、控件、图标槽、状态栏和间距按输入环境显式取值。保留当前可用的触控尺寸，只修明显失衡、视觉过重或浪费空间的地方。

## 视觉尺寸 / 命中尺寸 / 布局槽

标题栏按钮的视觉尺寸、可点击范围和布局槽可以用不同比例，但各自要有显式 token：`--*-visual-size`、`--*-hit-size`、`--*-layout-slot`、`--*-optical-offset-x/y`。粗指针下命中至少 44px，可见图形可以更小但必须清晰稳定；不得有隐藏的超大命中层压住相邻控件；`focus-visible` 画在真实控件边界上。

## 窗口 / 内容间距 token

`.window-pane` 不得写死统一内边距，改用语义 token（padding / gap / toolbar / status / reading / touch-safe）。系统工具与 Finder 保持紧凑，Desk Accessory 更紧凑但保留触控空间，Reader / TeachText / Markdown 预览用阅读边距，创意实验室跟随画布，移动端按容器宽度与安全区压缩。

## Classic 外壳语言

Classic 保持高 DPI 平滑单色 SVG，永不回退成低分辨率位图或像素模式：黑白灰为主；保留 System 6 的标题栏条纹、窗口边框、按钮描边、滚动轨道、选中反色；灰只用于抗锯齿、禁用态、阴影层级与现代内容区，但不用柔和渐变、玻璃、叠加或现代卡片；无模糊、背景滤镜、软阴影、发光描边、hover 抬升或装饰动画；拉丁文字保留 Chicago / Geneva 角色，中文做基线 / 行高 / 字重 / 垂直 padding 修正。目标是 System 6 的黑白结构与克制，不是字面 1-bit 渲染。

## Platinum 材质与倒角

一套灰度值 + 三套倒角配方跨所有 chrome 复用，应用不得自造 `#aaa/#888/#555` 栈；强调色与材质解耦，细节以英文原文为准。

## 其余章节

状态模型、标题栏 / 菜单 / 窗口 chrome、真实应用与 chrome 的区分、移动端与触控作为正式验收、Theme Lab 作为验收台，以及开放 / 争议项的完整规则与数值表，均以英文源文件为准。
