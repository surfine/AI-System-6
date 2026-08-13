<!-- canonical-source: apps/desktop/assets/themes/yosemite/README.md -->
<!-- source-sha256: b313f3dab13308cb998bc9979883a0286d614a76a71e09de3d1724621f42f75c -->
<!-- 英文版为准；本译文仅供人类参考。 -->

# Yosemite 图标家族

本目录发布完整的 56 对象 OS X 10.10 家族。稳定的跨时代含义由
[icon-system-continuity.json](../icon-system-continuity.json) 中的
`semanticIdentity` 与一至两个 `identityAnchors` 定义。已弃用的 `metaphorKey`
不能用来把一个物理对象贯穿所有时代。

运行时覆盖完整与历史验证是两件事。宽泛家族的 `accepted-generated` 状态只是创作
决定。`priorityCore16` 以外的 40 个 ID 在逐项复核前继续保持历史待审；对象与时代
状态记录于 [icon-provenance-matrix.json](../icon-provenance-matrix.json)。

## 实际运行时映射

运行时会按调用场景直接选择逐对象 PNG：mini／menu／control strip 与 Finder list
使用 16 px，普通系统图标场景使用 32 px，desktop／large／Retina 场景使用 128 px。
`yosemite-icon-manifest.json` 只保留为兼容与审查 mapping，并非唯一 runtime source。
仓库中的 64、32、16 px 文件通常是确定性派生件，除非对象账本另有说明；Finder 与
MultiFinder 在所有列出的尺寸都拥有直接构成的光学运行时资产；Review Desk、
Searcher、ClioTalk 拥有通过复核的 priority-lineage replacement 与独立 compact 图稿。

Theme Lab 显示 16 个优先对象与派生尺寸，用于暴露小尺寸失败；它不授予历史批准。

## Finder／MultiFinder — P0 已关闭

Finder 使用已批准的 ImageGen v2 低矮、较宽的 Yosemite 蓝／浅色分脸，并为
`reference-validated`。MultiFinder 以当前 Yosemite Finder 身份加“多个”构成；
它是 C 级来源、`historically-reviewed`，并不宣称为原生复刻。两者的
128/64/32/16 资产都是直接构成的光学运行时图稿，不是旧的紧凑 Macintosh 派生件。

## ClioTalk — Yosemite cell 已关闭

ClioTalk 现在采用 P-B free-form transcript sheet，包含两个不同的 interlocutor mark
与独立 provisional-reply tab。32 与 16 px 是光学重画，不是 generated master 的缩小。
它是 `historically-reviewed`，但不是 `reference-validated` 或 native replica；blind-mix
状态仍为 `not-run`。Platinum、Jaguar、Snow Leopard ClioTalk 继续 pending，本结果不
升级这些年代。

## 重建

执行：

```sh
npm run build:era-icons -- --theme yosemite
```

该链重建宽泛层与实测层，恢复已接受生成家族，把批准的 Finder 家谱覆盖层应用到每个
runtime tier，并重新生成兼容 manifest 与审查板。只运行 core 是中间诊断。

历史 10.10 截图与 Apple 图稿仅作证据。Theme Lab 必须在真实显示尺寸检查每个
派生件。
