<!-- canonical-source: apps/desktop/assets/themes/snow-leopard/README.md -->
<!-- source-sha256: 5479bf95773829c8694628fdf62865760d3f39c98e086548f47e05bc7f921599 -->
<!-- 英文版为准；本译文仅供人类参考。 -->

# Snow Leopard 图标家族

本目录发布完整的 56 对象 Mac OS X 10.6.8 家族。连续性由
[icon-system-continuity.json](../icon-system-continuity.json) 中每个对象的
`semanticIdentity` 与一至两个 `identityAnchors` 定义，而不是固定物理隐喻或复用的
Aqua 构图。

运行时完整与 `accepted-generated` 创作状态都不等于历史验证。
`priorityCore16` 以外的 40 个 ID 在逐项复核前继续保持历史待审；逐时代来源与审核
状态记录于 [icon-provenance-matrix.json](../icon-provenance-matrix.json)。

## 实际运行时映射

运行时会按调用场景直接选择逐对象 PNG：mini／menu／control strip 与 Finder list
使用 16 px，普通系统图标场景使用 32 px，desktop／large／Retina 场景使用 128 px。
`snow-leopard-sprite.png` 与 `snow-leopard-icon-manifest.json` 只保留为兼容与审查
资产，并非唯一 runtime source。512 px 文件继续作为大尺寸审查资产；其他紧凑尺寸
通常是同一主图的确定性派生件，除非对象账本另有说明。Finder 与 MultiFinder 在
512/128/32/16 都拥有直接构成的光学资产。

Theme Lab 显示 16 个优先对象与这些派生尺寸，让失败保持可检查。显示在实验室里不
等于通过历史验收。

## Finder／MultiFinder — P0 已关闭

Finder 使用已批准的 ImageGen v2 成熟 10.6 分脸与弯曲黑色侧脸分界，并为
`reference-validated`。MultiFinder 以当前 Snow Leopard Finder 身份加“多个”构成；
它是 C 级来源、`historically-reviewed`，并不宣称为原生复刻。运行时按场景选择
两者直接构成的 16、32 或 128 px 光学资产；512 px 层继续用于大比例审查。它们都
不是旧的紧凑 Macintosh 派生件。

## 重建

执行：

```sh
npm run build:era-icons -- --theme snow-leopard
```

该链重建宽泛层与实测层，恢复已接受生成家族，应用批准的 Finder 家谱覆盖层，刷新
兼容 sprite 与 manifest，并重新生成审查板。只运行 core 仍是中间诊断。

本地 10.6 资源与截图仅作证据。导出的 iconset 也必须先与真实 10.6.8 截图核对，
才能支撑时代声明。
