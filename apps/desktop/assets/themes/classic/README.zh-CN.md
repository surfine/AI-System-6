<!-- canonical-source: apps/desktop/assets/themes/classic/README.md -->
<!-- source-sha256: 6c99d09f575fbaacf39af8b616fac76b9a7289a523bc01bcf05132543bdb9e88 -->
<!-- 英文版为准；本译文仅供人类参考。 -->

# Classic（System 6）图标家族

本目录发布完整的 56 对象 Classic 运行时家族。稳定契约是
[icon-system-continuity.json](../icon-system-continuity.json) 中每个对象的
`semanticIdentity`，以及一至两个 `identityAnchors`。旧的 `metaphorKey` 仅是
已弃用的迁移提示；它不能把同一个物理对象或构图锁死到六种外观。

家族完整只表示每个运行时 ID 都能解析到图稿与选中遮罩，不表示所有图标都已通过
历史复核。生成完成、技术合格或创作验收都不是历史证据。`priorityCore16` 以外的
40 个 ID 在逐项复核前继续保持历史待审；优先对象在各时代的更强状态记录于
[icon-provenance-matrix.json](../icon-provenance-matrix.json)。

## 平滑 Retina 项目例外

Classic 有意为今天的 Retina 屏幕采用平滑黑白 SVG 作为运行时图稿。这是项目方向对
字面位图渲染的例外，不是改画通用矢量解剖的许可。凡 System 6.0.8 存在原生资源，
原生一位证据仍决定轮廓、占用边界、相对比例、非对称、内部标志与选中行为；平滑只
改变边缘表达。

因此构建保留两个明确分开的层次：

- `icons/classic-core-icon-family.json` 与原生参考板记录精确的一位证据层；它是比较
  权威，不是运行时图稿。
- `icons/<id>-32.svg` 与 `icons/<id>-16.svg` 是分别进行光学校正的平滑运行时图稿；
  对应的 `-mask-` 文件负责 Finder 反白。

只有明确的叠加图或差分结果才能支持“精确复刻”声明，否则应如实标为“参考引导的
重建”。产品专属对象可以用生成模型候选稿加快构图，但最终 SVG 仍须接受同时代证据
与历史复核。

## Finder 来源

Classic Finder 已完成为平滑、参考引导的运行时重建：原生证据决定解剖，SVG 则明确
不是逐像素相同的复刻。MultiFinder 有原生功能证据，却没有原生图标资源，所以其图稿
仍是 C 级来源的时代可信转译，以当前 Finder 身份加“多个”表达，并且绝不宣称为原生
复刻。Finder 为 `reference-validated`；MultiFinder 为
`historically-reviewed`。

## 运行时与构建顺序

紧凑场景选择已创作的 16 px SVG，其余场景选择 32 px SVG。选中时显示独立遮罩并把
同一图稿反白，不存在选中位图。

执行：

```sh
npm run build:classic-icons
```

该命令先运行 `tooling/build-classic-core-icons.mjs` 重建证据层，再由
`tooling/build-classic-family-icons.mjs` 写入平滑运行时家族。资产与审核状态稳定后，
再运行 `npm run build:icon-provenance-matrix` 与
`npm run build:icon-lineage-audit`。

历史栅格裁片、资源分支、截图与 Apple 字体仅作证据，不作为产品运行时资产分发。
