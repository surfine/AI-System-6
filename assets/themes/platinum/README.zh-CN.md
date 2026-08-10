# Platinum 图标家族

本目录保存循序扩展的 Mac OS 9 Platinum 图标系统。第一批通过验收的是 12 个 Finder 核心对象：Finder、文件夹、硬盘、废纸篓、通用文稿、通用应用程序、软盘、CD、控制面板、System、Scrapbook 与 Clipboard。每个对象都有独立构成的 32×32 和 16×16 PNG；16px 不是 32px 的缩小版。

原有 54 项 SVG 家族暂时只作为尚未复核对象的后备。`platinum-icon-family.json` 会标记已通过的新核心对象；它不代表所有旧后备图标都已经达到新的历史真实性验收线。

构造只使用紧凑的物理桌面隐喻、选择性的深色结构线、受限的 Mac OS 9 色域、左上 1px 高光和右下结构阴影。CSS 只负责位置与选中状态，不提供复古滤镜或整套统一阴影。

`icons/src/platinum-core-icons.json` 固定参考板、测量规则、来源版本与版权边界；`icons/platinum-core-icon-family.json` 记录每个合格对象的原型、原生文件、边界、颜色数量和 SHA-256。`scripts/build-platinum-core-icons.mjs` 是核心批次的确定性来源；完整的 `scripts/build-era-icons.mjs` 会在最后再次执行它，避免全量重建时退回旧核心图。

执行 `npm run build:platinum-core-icons` 可重建核心批次。请在 Theme Lab 中检查 32px/16px 的普通与选中状态、三种 Finder 背景，以及 100%/200%/400% 最近邻放大。生成的验收板是：

- `drafts/era-icons/platinum-core-reference-board.png`
- `drafts/era-icons/platinum-core-contact-sheet.png`
- `drafts/era-icons/platinum-core-comparison-board.png`

证据也汇总在 `../era-icon-reference.json`。历史截图与 Apple 资源只用于研究；任何运行时图标都不使用截图裁切、提取的 Apple bitmap、描摹路径或嵌入的历史资源。
