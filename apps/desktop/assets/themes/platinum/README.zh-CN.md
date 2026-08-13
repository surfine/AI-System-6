<!-- canonical-source: apps/desktop/assets/themes/platinum/README.md -->
<!-- source-sha256: f1ed9806f4ac18b08bae59d329a701c2b5ecbd1f853733f99ebf9738e9b653d6 -->
<!-- 英文版为准；本译文仅供人类参考。 -->

# Platinum 图标家族

本目录发布完整的 56 对象 Mac OS 9 时代 Platinum 运行时家族。跨时代连续性由
[icon-system-continuity.json](../icon-system-continuity.json) 中的
`semanticIdentity` 与一至两个 `identityAnchors` 定义，而不是固定物理隐喻。
`metaphorKey` 仅保留为已弃用的迁移提示。

运行时完整与历史验证是两件事。`accepted-imagegen` 只表示生成图稿通过创作管线，
不表示结果与 Mac OS 9 相符。`priorityCore16` 以外的 40 个 ID 在逐项复核前继续保持
历史待审。逐对象来源与审核状态记录于
[icon-provenance-matrix.json](../icon-provenance-matrix.json)。

## 实际运行时映射

正式家族是 `icons/` 下已接受的 ImageGen PNG，并在最后应用已批准的 Finder 家谱
覆盖层。
`platinum-icon-manifest.json` 保留稳定的 32 px 兼容映射；内联系统图标运行时则按场景
选择 `icons/<id>-16.png`（紧凑）、`-32.png`（常规）与 `-42.png`（桌面）。这些文件
通常是已接受高分辨率重绘的不同缩减件，除非对象账本另有说明。Finder 与
MultiFinder 是已复核的例外：批准构建器会为每个目标画布直接渲染，并采用该尺寸
自己的边界与对比度。

兼容 SVG 继续保证旧路径可解析。Theme Lab 显示 16 个优先对象与同一组 PNG 审查
尺寸，但出现在 Theme Lab 并不代表通过验收。

## Finder／MultiFinder — P0 已关闭

Finder 使用已批准的 ImageGen v2 Mac OS 9 淡紫文件夹与左下 Finder 面孔面板，并为
`reference-validated`。MultiFinder 叠放两个当前时代 Finder 身份来表达“多个”；它是
C 级来源、`historically-reviewed`，并不宣称为原生复刻。两者的 42/32/16 资产都是
从批准源稿直接构成的光学运行时图稿，不是旧的紧凑 Macintosh 派生件。

## 重建

执行完整主题链：

```sh
npm run build:platinum-icons
```

该链重建宽泛家族与实测核心，恢复已接受的 Platinum ImageGen 家族，再把批准的
Finder 家谱覆盖层作为最终运行时步骤，并重新生成审查板。只运行 core 是中间诊断，
不是最终运行时家族。审核状态变化后，再生成来源矩阵与谱系审计。

历史截图与 Apple 资源仅作证据；运行时不发布提取的 Apple 位图。
