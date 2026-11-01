<!-- canonical-source: apps/desktop/assets/themes/aqua/README.md -->
<!-- source-sha256: 814e95612a47aff2df782571bf35b27fbfea4bc0bb876aea1be311d71be88fdf -->
<!-- 英文版为准；本译文仅供人类参考。 -->

# Jaguar Aqua 图标家族

本目录发布完整的 56 对象 Mac OS X 10.2 Jaguar 家族。跨时代契约是
[icon-system-continuity.json](../icon-system-continuity.json) 中每个对象的
`semanticIdentity` 与一至两个 `identityAnchors`，而不是固定的 `metaphorKey`、
容器、轮廓或材质配方。

运行时覆盖完整不等于历史复核完整。`accepted-generated` 只描述创作与技术验收。
`priorityCore16` 以外的 40 个 ID 在逐项复核前继续保持历史待审；逐对象、逐时代的
来源与状态记录于
[icon-provenance-matrix.json](../icon-provenance-matrix.json)。

## 实际运行时映射

运行时会按调用场景直接选择逐对象 PNG：mini／menu／control strip 与 Finder list
使用 16 px，普通系统图标场景使用 32 px，desktop／large／Retina 场景使用 128 px。
`aqua-sprite.png` 与 `aqua-icon-manifest.json` 只保留为兼容与审查资产，并非唯一
runtime source。仓库中的 32 与 16 px 文件通常是确定性派生件，除非对象账本另有
说明；Finder 与 MultiFinder 在两个紧凑尺寸都拥有直接构成的光学运行时资产。

Theme Lab 以 128、32、16 px 显示 16 个优先对象，让派生失败保持可见。它不会把
派生件或已接受生成稿提升为历史验收结果。

## Finder／MultiFinder — P0 已关闭

Finder 使用已批准的 ImageGen v2 低矮矩形 Jaguar 分脸牌匾，历史状态为
`reference-validated`。MultiFinder 以当前 Jaguar Finder 身份加“多个”构成；它是
C 级来源、`historically-reviewed`，并不宣称为原生复刻。运行时按场景选择两者直接
构成的 16、32 或 128 px 光学资产；它们不是旧的紧凑 Macintosh 派生件。

## 重建

执行：

```sh
npm run build:era-icons -- --theme aqua
```

该链重建宽泛层与实测层，恢复已接受生成家族，应用批准的 Finder 家谱覆盖层，刷新
兼容 sprite 与 manifest，最后重新生成审查板。只运行 core 是中间诊断，不是最终
运行时家族。

历史 Apple 图稿与截图仅作证据，不会作为产品运行时资产打包。
