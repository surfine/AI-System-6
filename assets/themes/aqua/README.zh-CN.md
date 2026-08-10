# Jaguar Aqua 图标家族

首批通过审核的 Aqua 核心共有十二项：Finder、文件夹、硬盘、废纸篓、通用文档、通用应用、System Preferences、Searcher、TeachText、ClioTalk、Scrapbook 与 Project Hard Disk。每项都有原创的 128×128、32×32、16×16 PNG；小尺寸是独立构图，不是缩小主图。

其余 42 个语义 ID 仍使用上一版确定性 SVG，明确标记为待审核 fallback。运行时 32px sprite 会把已通过的 PNG 核心和这些 fallback 混合起来，同时保持语义 ID 与图集位置稳定。

`icons/src/aqua-core-icons.json` 固定二十项 Jaguar 参考板、材质与透视规则、版权边界及十二个原型；`icons/aqua-core-icon-family.json` 记录输出度量与哈希。`scripts/build-aqua-core-icons.mjs` 是已审核核心的确定性源文件，`scripts/build-era-icons.mjs` 在重建 fallback 后会重新应用它。

历史 Apple 图稿与截图只作研究证据，不会作为产品资源打包。
