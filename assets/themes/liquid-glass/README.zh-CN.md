<!-- canonical-source: assets/themes/liquid-glass/README.md -->
<!-- source-sha256: 0ac06566232605eb21a554bf3c8c9ef96e0afb34e1a9d766615227d4f6034c18 -->
<!-- 英文版为准；本译文仅供人类参考。 -->

# Liquid Glass 图标家族

本目录包含 AI System 6 完整的 56 项 macOS Tahoe 26 外观。每个语义对象都有一次
独立生成的透明 Image Gen 主图；发布图标不包含 Apple 资源、截图裁切或描摹路径。

## 运行时与尺寸政策

每个对象经审核的运行时来源是 `128-default` PNG。运行界面由浏览器将它缩小到 CSS
显示尺寸。64、32、16 px 文件以及 Dark、Clear 外观，都是从同一主图确定性生成的
Theme Lab 审查派生件。它们可用来检查缩放和材质表现，但不是分别创作的小尺寸图稿，
也不会进入应用打包清单。

这是当前家族刻意选择的诚实方案：不再把机械缩小误称为原生构图。未来若真正创作紧
凑尺寸家族，必须同时替换此政策与像素级门禁，不能只改构建器注释。

## 材质与容器

应用类对象可以使用系统圆角方形容器。Finder 对象、媒介、文件夹、文档、硬件、废
纸篓与 Control Strip 保持自由轮廓。全家族不套用“渐变方块 + 白色 glyph”模板。
视觉语言是薄而通透的玻璃、克制高光、蓝银折射边缘，以及在运行时缩小 128 px 审核
来源后仍能辨认的简洁前景层。

## 连续性

全部 56 项都保持 [icon-system-continuity.json](../icon-system-continuity.json)
记录的跨时代含义。DocMap 尤其必须是一张文档页，其标题线长成主干与分支；它不是
地理地图，也不是没有页面的现代节点图。Finder 仍是微笑的紧凑 Macintosh，ClioTalk
仍是实线用户气泡与虚线临时回复。

## 文件与重建

- `icons/src/liquid-glass-imagegen-prompts.json` — 每个语义对象一次独立提示、来源和
  尺寸政策。
- `liquid-glass-icon-family.json` — 每项来源、尺寸、字节指标与语义测量。
- `liquid-glass-icon-manifest.json` — 128 px Default 运行时映射。
- `scripts/build-liquid-glass-imagegen-icons.mjs` — 从已接受透明主图生成确定性派生件、
  manifest 与证据板。

运行 `npm run build:liquid-glass-imagegen-icons` 可重建此家族。Theme Lab 保留
64/32/16 与 Dark/Clear 派生件，用于浅色、深色、照片和高频背景的比较。应用包只
发布 56 个运行时可达的 `*-128-default.png` 文件。

## 证据与限制

Tahoe 26 本地研究证据位于 git 忽略的 `drafts/liquid-glass-reference/`。静态 PNG
无法折射真实桌面，因此审查会改在代表性背景上检查可读性。Toolbar 与 sidebar 符号
仍属于独立家族。

每项都使用 [icon-grid.mjs](../../../scripts/lib/icon-grid.mjs) 的共享网格。摆放保持
一致且对象比例不变；本家族不修改共享网格目标。
