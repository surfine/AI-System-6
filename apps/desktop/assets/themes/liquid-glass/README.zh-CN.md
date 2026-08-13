<!-- canonical-source: apps/desktop/assets/themes/liquid-glass/README.md -->
<!-- source-sha256: c1d9993bcd61ef36910f3e5022ab2b11ff1903db66d7659397b050ff81ec35c5 -->
<!-- 英文版为准；本译文仅供人类参考。 -->

# Liquid Glass 图标家族

本目录发布完整的 56 对象 macOS Tahoe 26 家族。跨时代连续性来自
[icon-system-continuity.json](../icon-system-continuity.json) 中每个对象的
`semanticIdentity` 与一至两个 `identityAnchors`，而不是固定容器或物理隐喻。

该家族拥有已接受的透明 ImageGen 主图，但创作验收不等于历史验证。
`priorityCore16` 以外的 40 个 ID 在逐项复核前继续保持历史待审；逐对象来源与状态
记录于 [icon-provenance-matrix.json](../icon-provenance-matrix.json)。

## 实际运行时映射

运行时会按调用场景选择逐对象、逐 appearance PNG：mini／menu／control strip 与
Finder list 使用 16 px，普通系统图标场景使用 32 px，desktop／large／Retina 场景
使用 128 px；明确请求 64 px 的调用者与 Theme Lab 使用 64 px 层。其中 52 个对象的
存储尺寸与 Dark／Clear appearance 仍是烘焙 ImageGen source 的确定性派生件，但
runtime 不会在所有场景都缩小同一张 `128-default`。Finder、MultiFinder、Review
Desk、ClioTalk 是已复核的 direct optical 例外。Finder 拥有 `base`／`panel`／`ink`；
Review Desk 拥有 `backing`／`manuscript`／`correction`；ClioTalk 拥有
`enclosure`／`panel`／`conversation`／`provisional`。这份图层信用不扩展到
MultiFinder 或其余 52 个对象。

Theme Lab 显示 16 个优先对象。其 16 px 提示图会正确读取
`icons/<id>-16-default.png`。Finder 与 MultiFinder 在这里使用已接受的光学运行时
资产；Review Desk 与 ClioTalk 也使用已接受的 compact optical 图稿；其余对象仍是
派生审查资产。静态 PNG 也无法折射背后的实时桌面。

## Finder／MultiFinder — P0 已关闭

Finder 使用已批准的 ImageGen v2 Tahoe 蓝色外壳、独立半透明面孔／侧脸面板与墨迹。
其独立 `base`、`panel`、`ink` 源图层可重组出创作身份，历史状态为
`reference-validated`。MultiFinder 以当前 Tahoe Finder 身份加“多个”构成；它是
C 级来源、`historically-reviewed`，并不宣称为原生复刻。两者在 Default、Dark、
Clear 下都拥有直接构成的 128/64/32/16 光学运行时资产。

## ClioTalk — Tahoe cell 已关闭

ClioTalk 现在采用 P-B layered glass conversation panel。两个不同的 interlocutor mark
形成 conversation layer，provisional reply 是独立 source，而不是烘焙在 generic
messaging glyph 上的 dashed edge。`enclosure`、`panel`、`conversation`、`provisional`
canvas 在 128、64、32、16 px 分别创作，并在每个 tier 精确重组 Default runtime。
结果为 `historically-reviewed`，但不是 reference-validated 或 native；blind-mix 状态
仍为 `not-run`。

## 重建

执行完整家族构建链：

```sh
npm run build:era-icons -- --theme liquid-glass
```

该链先重建宽泛 ImageGen 家族，再把批准的 Finder 家谱覆盖层作为最终运行时步骤。
只运行 `build:liquid-glass-imagegen-icons` 是中间的宽泛家族构建，不是 Finder 家谱
终态。审核状态变化后，再生成来源矩阵与谱系审计。

历史 Tahoe 截图仅作证据；产品图标不发布 Apple 图稿、截图裁片或描摹的 Apple
路径。
