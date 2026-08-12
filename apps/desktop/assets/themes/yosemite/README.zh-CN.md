<!-- canonical-source: assets/themes/yosemite/README.md -->
<!-- source-sha256: 4ad8ceb358107e4f6d919ed0c810e53bf4172c47bd575a8f5e73a9f259d423f2 -->
<!-- 英文版为准；本译文仅供人类参考。 -->

# Yosemite 图标家族

本目录包含 AI System 6 完整的 56 项 OS X 10.10 外观。每个语义对象都保持
[icon-system-continuity.json](../icon-system-continuity.json) 记录的跨时代
`metaphorKey`，干净色块、浅景深与自由轮廓则遵循 Yosemite 参考世界。

## 运行时与尺寸政策

运行时 manifest 将全部对象映射到 32 px PNG。仓库保留的 128、64 与 16 px 文件，
是从已接受主图确定性生成的 Theme Lab 审查派生件。它们用于检查缩放与材质表现，但
不是分别创作的小尺寸图稿。应用包会携带所有声明的审查尺寸，Theme Lab 因此不会回退
到缺失资源或旧图稿。

用户可见的 56 项现在全部属于已接受生成式家族。早期实测核心只保留为确定性重建层；
已接受覆盖始终最后执行，最终家族会拒绝 `accepted-core` 或 fallback 像素残留。

这是当前家族刻意选择的诚实政策：机械缩小是审查证据，不是原生紧凑构图。未来若真
正创作独立小尺寸家族，必须同时替换此政策及其像素门禁，不能只给派生件改名。

## 连续性

全部 56 项保持记录的跨时代含义。DocMap 仍是一张文档页，其标题线长成主干与分支；
ClioTalk 仍是实线用户气泡与虚线临时回复。系统对象使用本时代原型，不用其他外观加
滤镜代替。

## 文件与重建

- `yosemite-icon-manifest.json` — 完整 56 项、32 px 运行时映射。
- `yosemite-icon-family.json` — 每项来源、尺寸、指标与审核状态；家族已完整，无
  fallback。
- `icons/imagegen-source/` — 确定性覆盖重建所用的已接受生成式源文件。
- `tooling/build-yosemite-core-icons.mjs` 与
  `tooling/build-accepted-generated-era-icons.mjs` — 重建历史实测层，再重新应用全部 56 项
  已接受生成式图稿，不改变语义 ID。

Theme Lab 直接从工作树读取 128/64/32/16。应用包发布所有声明的 Theme Lab 尺寸，
但不包含仅供开发溯源的 `imagegen-source`。128 px PNG 直接用于 Retina 桌面显示，
32 px manifest 则保持稳定的语义顺序与兼容性。本地 10.10 研究证据与早期反面稿继续
被 git 忽略且仅作证据；截图裁切、提取 bitmap 或描摹路径不会作为运行时图标发布。

## 网格

每个对象都位于共享 [icon-grid.mjs](../../../../../tooling/lib/icon-grid.mjs) 网格上。缩放
保持等比，保留对象比例与视觉补偿；管线把每项摆放记录在家族 JSON 中，本家族不改动
共享网格。
