<!-- canonical-source: docs/ICON-LINEAGE-AUDIT.md -->
<!-- source-sha256: 808fab8bef45c958d7359dfcaa7e38d76aed8db4a8e1cd5074c51085f004077a -->

英文版为准；本译文仅供人类参考。本文档提供完整中文终审记录。

# AI System 6 图标历史家谱终审

## 审计记录与结论

| 项目 | 值 |
| --- | --- |
| 代码基线 | `35eb63f814145d8e9719f0421ac34f48179c85f5`（2026-08-13 审计开始时的 `main`） |
| 目标时代 | Classic / System 6、Platinum / Mac OS 9.0、Aqua / Mac OS X 10.2 Jaguar、Mac OS X 10.6.8 Snow Leopard、OS X 10.10 Yosemite、macOS Tahoe 26 Liquid Glass |
| Runtime 清单 | 56 个 semantic id × 6 个外观 |
| 验收优先级 | 先审 16 个家谱核心；其余 40 个在逐项审完前仍属 P2 |
| 评分来源 | 对 runtime mapping、family ledger、builder、当前像素与本地历史 reference 的专家证据审查 |
| 盲审状态 | 可以生成匿名混排板，但尚无独立人类盲审者提交结果 |
| 总结论 | **FAIL / 仍有工作。** 本审计不会降低 4/4/4 门槛来宣称全家族完成。 |

基线已经覆盖全部 runtime，但「有资产」被混同成了「通过历史验收」。最严重的
问题是一条虚假的 Finder 家谱：Platinum 至 Liquid Glass 被画成不同材质的
compact Macintosh，而不是沿着各目标时代自己的 Finder 历史演进。同一批账本
还让 `accepted-generated` 看起来像历史验证，
同时多个现代 family 实际上只是一个生成 master 加一组确定性尺寸衍生物。

本审计关联的实现工作已关闭这条 P0 家谱，但没有把生成方法偷换成证据。Classic
Finder 继续采用由原生 anatomy 指导的平滑 Retina SVG。Platinum、Jaguar、Snow
Leopard、Yosemite 与 Liquid Glass Finder 现在分别采用已复核、以目标时代 reference
为依据的 ImageGen v2 重绘；runtime、紧凑尺寸、账本与审查板解析到同一批批准像素。
六个 Finder cell 全部为 `reference-validated`。六个 MultiFinder cell 全部是 C 级
来源：当前时代 Finder identity 加 multiplicity，状态为 `historically-reviewed`，并且
明确不宣称为 native replica。

同一套 final-overlay 纪律现在也关闭了 Review Desk 的五个现代 cell。Platinum 为
P-C；Jaguar、Snow Leopard、Yosemite 与 Liquid Glass 为 P-B。五项全部是
`historically-reviewed`，但不是 `reference-validated`，因为不宣称存在原生 Review
Desk 图标；其 blind-mix 状态仍为 `not-run`。32 与 16 px compact tier 是独立光学
重画，Liquid Glass 则由真正的 `backing`、`manuscript`、`correction` source 构成，
不是从烘焙 master 按颜色拆层。

Searcher 也采用同样诚实的 authoring/evidence 分轴。Platinum、Jaguar、Snow
Leopard 与 Yosemite 已晋升为 P-B、`historically-reviewed` 的 runtime
reinterpretation，并拥有独立光学 32/16 px artwork；它们不是 native replica，也不是
`reference-validated`，`blindMixStatus` 仍为 `not-run`。Liquid Glass Searcher 因
16 px hierarchy 没有通过晋升审查，继续使用原 broad runtime，历史状态保持
`pending`。

ClioTalk 另关闭两个 cell，但没有恢复被废弃的固定双气泡构图。Yosemite 是 P-B 的
free-form conversation sheet，并拥有独立光学 32/16 图稿。Liquid Glass 是 P-B 的
layered conversation panel，在 128/64/32/16 分别拥有独立的 `enclosure`、`panel`、
`conversation`、`provisional` source；每个 Default tier 都能由这些 source 精确重组。
两者均为 `historically-reviewed`、non-native、`blindMixStatus: not-run`；Platinum、
Jaguar、Snow Leopard 继续 pending。

这些闭环不代表 56 对象系统整体获批。其余 11 个优先核心保持既有分数与状态；
Searcher 在 Liquid Glass 仍未关闭，ClioTalk 在 Platinum/Jaguar/Snow Leopard 仍未
关闭，40 个较低优先对象也继续明确保持 open，直到逐项复核。

## 控制性决定

### 连续性是身份连续，不是构图冻结

长期契约应由以下字段表达：

- `semanticIdentity`：对象表达的产品或系统角色；
- `identityAnchors`：最多一到两个识别锚点；
- `historicalPrototype`：存在时，采用目标 OS 的真实对象；
- `genre`：system identity、application、utility、document、hardware、
  removable media 或 small UI symbol；
- `eraTranslation`：同一角色在该时代如何重画；
- `allowedChanges`：可改变 silhouette、container、perspective、material、
  palette、detail density、shadow 与小尺寸构造。

因此，`metaphorKey` 不再意味着整幅物理构图必须永久保留。当机械式横向相似度
与历史发生冲突时，真实目标 OS 原型优先。

### Classic smooth SVG 项目例外

产品负责人已明确选择平滑、可缩放的 Classic SVG，以保证 Retina runtime 的
清晰度。这是项目对仓库常规 native-pixel 指引作出的明确渲染例外；文档**不得**
把它描述为 bitmap exact replica 或 pixel exact replica。

该例外没有放宽 evidence 要求。存在 native evidence 时，平滑重画必须保留原生
对象的 anatomy：silhouette、部件关系、占位比例、不对称、negative space、
state/mask 语义与相对 optical scale。不能用一个通用的平滑符号替换已经观察到
的对象。32 与 16 SVG 可以为了光学可读性删减或移动细节，但两者都必须明显来自
同一个 native prototype。

### 生成是 authoring method，不是 evidence

图像生成是高效且允许的 candidate 与 period-plausible original 制作方式。它可
以建立 `generated-draft`、`technically-clean` 等创作状态，但不能自行建立历史
状态。

历史状态必须另设一条轴：

| 轴 | 允许表达的含义 |
| --- | --- |
| Authoring | `generated-draft`、deterministic redraw、hand/vector redraw、derivative |
| Technical | alpha/bounds/size/manifest 检查通过或失败 |
| Historical | `pending`、`historically-reviewed`、`reference-validated` |
| Runtime | runtime 可达资产、仅 Theme Lab review 资产或 evidence-only reference |

`accepted-generated` 可以表示确定性构建接受的 source；绝不能自动扩展成
historically approved。

## 方法

1. 冻结代码基线，并列举 56 个 runtime id、manifest、family ledger、source
   archive、builder、Theme Lab mapping 与当前实际像素。
2. 交叉核对 README、family entry、manifest 与 runtime 真正选中的资产。如果
   后续 overlay 替换了像素，早先 ledger entry 不获得验收信用。
3. 按以下证据优先级审查：真实目标 OS resource/screenshot；同期 Apple 文档；
   可验证的同期实现；历史截图档案；现代 recreation；最后才是视觉推断。
4. 对 16 个核心横向检查 semantic continuity，纵向检查 era authenticity 与
   family harmony。
5. 把 32 与 16 当成 artwork 检查，而不是只检查文件名。即使技术上干净，
   derivative 仍必须诚实记录为 derivative。
6. Apple 历史像素只保留为本地 evidence。reference crop、提取资源与 Apple
   path 都不能进入可再分发 runtime。

## Provenance 分类

为了避免与下文 A/B/C 三项评分混淆，provenance 统一写成 **P-A**、**P-B**、
**P-C**。

- **P-A — native prototype reconstruction：**目标系统存在直接对应物，必须与
  该对象做 reference comparison。
- **P-B — period analog adaptation：**没有完全相同的产品，但存在很接近的
  同期应用或对象，可提供 grammar。
- **P-C — original period-plausible design：**没有可辩护的直接 analog；验收
  问题是它混入真实同期图标后是否仍像来自 2026。

| 核心 id | Classic | Platinum | Jaguar | Snow Leopard | Yosemite | Liquid Glass | 控制身份 / analog |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `finderApp` | P-A | P-A | P-A | P-A | P-A | P-A | 目标 OS 的 Finder/system identity |
| `multiFinderApp` | P-C | P-C | P-C | P-C | P-C | P-C | 当前时代 Finder identity + multiplicity；不声称有 native icon |
| `folder` | P-A | P-A | P-A | P-A | P-A | P-A | 目标 OS generic folder |
| `hardDisk` | P-A | P-A | P-A | P-A | P-A | P-A | 目标 OS mounted disk/volume |
| `trash` | P-A | P-A | P-A | P-A | P-A | P-A | 目标 OS empty Trash |
| `document` | P-A | P-A | P-A | P-A | P-A | P-A | 目标 OS generic document |
| `fileFloppy` | P-B | P-B | P-B | P-B | P-B | P-B | 对稳定产品隐喻作时代重画 |
| `projectDisk` | P-B | P-B | P-B | P-B | P-B | P-B | 带克制项目提示的 durable volume |
| `projectDisc` | P-B | P-B | P-B | P-B | P-B | P-B | 同期 optical/archive medium |
| `searcher` | P-B | P-B | P-B | P-B | P-B | P-B | search/discovery utility；magnifier anchor |
| `teachText` | P-B | P-B | P-B | P-B | P-B | P-B | 同期 text editor / writing document |
| `scrapbook` | P-A | P-B | P-B | P-B | P-B | P-B | 从 native Scrapbook 出发，后来转译为 selected-clipping album |
| `assistant` | P-C | P-B | P-B | P-B | P-B | P-B | conversation/correspondence analog；临时输出提示属于本产品 |
| `controlPanel` | P-A | P-A | P-A | P-A | P-A | P-A | Control Panel / System Preferences / Settings |
| `reviewDesk` | P-B | P-C | P-B | P-B | P-B | P-B | 由写作者控制的 marked-manuscript proofing/correction；不声称有 native icon |
| `docMap` | P-C | P-C | P-C | P-C | P-C | 以 branching map 表达 document structure |

## 分时代与家谱结论

### Finder 与 MultiFinder — P0 已关闭

基线 board 已清楚证明失败：五个 post-Classic 版本都延续 compact computer
chassis，而不是跟随目标 Finder prototype。这条连续性是项目自行发明的，并非
Finder 历史。

必要契约为：

- Classic：由 System `ICN# 3` anatomy 指导的 smooth SVG；不声称 pixel exact。
- Platinum：Mac OS 9 的 folder/system-identity 处理与 Finder face，而不是给
  System 6 compact computer 换色。
- Jaguar 与 Snow Leopard：各时代 front-on、two-field、smiling Finder face，
  各自拥有 divider、lighting、palette 与 material density。
- Yosemite：更明亮、更扁平的 10.10 split face，不把现代 squircle 变成全家族规则。
- Liquid Glass：blue identity enclosure + 独立 translucent face layer + ink
  feature + Tahoe 专属 material。
- MultiFinder：当前时代 Finder identity + multiplicity。没有直接 native icon
  evidence 时为 P-C；永久规定两台 beige 机器是不正确的。

Finder reference board 必须把当前 runtime 放在上排、真实本地 reference 放在
下排。reference pixels 只作为 evidence。

当前实现状态现已符合上述契约：

| Cell | Runtime 状态 | Historical 状态 |
| --- | --- | --- |
| Classic Finder | 保留 smooth Retina SVG | `reference-validated` — 已完成 |
| Classic MultiFinder | 平滑的当前时代 Finder identity 加 multiplicity | `historically-reviewed` — P-C；不声称 native replica |
| Platinum–Liquid Glass Finder | runtime 选择已批准、按目标时代重绘的 ImageGen v2 图稿 | `reference-validated` — 已完成 |
| Platinum–Liquid Glass MultiFinder | 已批准的当前时代 Finder identity 加 multiplicity | `historically-reviewed` — P-C；不声称 native replica |

被拒绝的第一代 candidate sheet 与程序化 overlay 只保留负面 authoring evidence
身份。批准的 v2 重绘只有在分别与目标时代 reference 比较、接受大尺寸与紧凑尺寸
复核，并经最终 runtime overlay 晋升后，才获得 runtime 与 historical credit。

Classic Finder 已按 Retina 例外完成。非 runtime 的 one-bit evidence
reconstruction 与 System `ICN# 3` 达到 `referenceDiffPixels = 0`。实际发布的
32 px smooth SVG 则另外对这份权威 evidence 测量：two-pixel tolerant F1 为
`0.9159`，bounding-box edge 最大差为 `2 px`。它遵守观察到的 ICN# anatomy，
没有凭空加入 smiling screen。这些指标验证的是贴近原生 anatomy 的平滑重画，
不会把 runtime SVG 偷换成 exact-pixel claim。

### Classic / System 6

基线已经把 family 描述为 smooth SVG，这与负责人最新 Retina 决定一致。失败点
不是「SVG 对 bitmap」，而是广泛生成/几何化输出可以覆盖 native-guided core
anatomy，却仍被描述得像历史上已经完整通过。

现在必须拆开两种 claim：

- native-evidence object：平滑 anatomy reconstruction，与资源/截图对比，绝不
  称为 exact pixels；
- product-only object：生成或 deterministic P-B/P-C candidate，其 period fit
  是另一个独立 review 结论。

Finder selection 继续使用 artwork + mask/inversion logic。不能为了让 56 个
silhouette 看起来一样大而规范化 native proportion。

Classic 已完成的 evidence/runtime 分层为：

- exact one-bit reconstruction：只作为 comparison authority，`diff = 0`；
- smooth 32/16 Retina SVG：runtime 表达，并拥有独立 optical size；
- native-guided runtime object：只有 anatomy comparison 通过后才记为
  `reference-validated`；
- product-only object：技术覆盖完成，但未另行审查时 historical status 仍为
  pending。

### Platinum / Mac OS 9

family 具备一些可信的 integer-grid ingredients，但「accepted ImageGen」不等于
全家族历史审查。风险信号包括 lavender 过量、uniform dark outline、过度规则的
geometry，以及落入「System 6 + gray」或 Windows 95 重 bevel 的 shallow volume。

控制性比较仍是 32/16 integer zoom：selective keyline、upper-left highlight、
lower-right structural shade、compact optical density 与独立可读的小尺寸 artwork。
批准的 Finder v2 重绘现在遵循 Mac OS 9 淡紫文件夹与左下 Finder 面孔面板原型。
Finder 与 MultiFinder 会针对 42、32、16 目标画布直接渲染，采用尺寸自有的边界与
对比度；它们不是宽泛家族旧有的 compact-computer 派生件。Review Desk 另行拥有
一枚 P-C Platinum 校对应用，以及独立光学重画的 32 与 16 px。Searcher 另行拥有
一枚 P-B hard-pixel search utility，以及独立光学 32/16 px 绘制。其余 11 个优先对象
与完整 generated family 仍需逐项 blind-mix 和 reference review。

### Jaguar / Mac OS X 10.2

56 个对象的 overlay 在技术上完整，但 genre 分化不足。核心像素审查发现强烈的
blue/cyan 收敛（按本审计 blue/cyan-family 量度约 94.6%），这提示 user app、
utility、document、hardware 与 removable media 被当作同一套 theme pack。

Jaguar Finder 现在采用已批准的低矮矩形 Aqua 分脸牌匾，并通过原生 10.2 prototype
比较。runtime dispatch 会为 mini／menu／control strip 与 Finder list 场景选择逐对象
16 px 资产，为普通场景选择 32 px，为 desktop／large／Retina 场景选择 128 px；
sprite 与 manifest 只作兼容／审查资产。Finder 与 MultiFinder 在三个 runtime tier
都拥有直接构成的光学资产；这两个 cell 不再继承宽泛家族的 compact-computer 构图或
派生尺寸声明。Review Desk 另行拥有一枚 P-B Jaguar copy-stand 应用，以及独立光学
重画的 32 与 16 px。Searcher 另行拥有 P-B jewel-cobalt lens 与 result-card
relationship，以及独立光学 32/16 px 绘制。其余 11 个优先对象仍需 genre-specific perspective、material
与紧凑尺寸审查。

### Snow Leopard / Mac OS X 10.6.8

基线 README 坦率说明 512/128/32/16 是一个 accepted master 的 deterministic
derivative；这种诚实是好的，但不是本任务要求的终态。512 derivative 不能证明
high-resolution material detail，16 derivative 也不能证明 compact legibility。

Finder 现在遵循成熟 10.6 分脸与弯曲黑色侧脸分界。runtime dispatch 采用同一场景
策略，为紧凑、普通、desktop／large／Retina 场景分别选择逐对象 16、32、128 px
资产；sprite 与 manifest 只作兼容／审查资产。Finder 与 MultiFinder 拥有直接构成
并完成光学复核的 512/128/32/16 资产。Review Desk 另行拥有一枚 P-B 专业校对板
应用；它的 32 与 16 px 图稿会删除 paper texture 与细小文本行，而不是模糊大尺寸
master。Searcher 另行拥有 P-B clear-lens 与 indexed-ledger relationship；其独立
光学 32/16 px 绘制会删除 texture 与细节。其余 core 在 texture、lens、pencil、dash、page layer 或 shadow 坍塌时，
仍需真正的多尺寸 review 或 optical artwork。在此之前，Snow Leopard 的其余部分
仍有「Jaguar 降饱和」而不是成熟 10.6 family 的风险。

### Yosemite / OS X 10.10

基线没有声称所有对象必须使用 squircle，但 generated family 仍明显收敛到
blue/cyan（同一量度约 85.3%）。主要污染项是 later-macOS container、
SF-Symbol-like uniform stroke、当代 AI gradient、excessive symmetry 与
object-specific silhouette 丢失。

批准的 10.10 Finder 重绘现在采用更低、更宽的蓝／浅色分脸构造，并避开后来
family-wide squircle 规则。Finder 为 `reference-validated`；Finder 与 MultiFinder
拥有直接构成的 128/64/32/16 光学资产。runtime 在紧凑系统场景选择 16 px、普通
场景选择 32 px、desktop／large／Retina 场景选择 128 px；manifest 只是兼容／审查
metadata，而非单一 runtime source。Review Desk 另行拥有一枚 P-B free-form
manuscript stack：coral bracket 在 16 px 保留，cyan caret 则有意删除。family
Searcher 另行拥有一枚 P-B free-form shallow cyan lens 与一张 result slip，并有
独立光学 32/16 px 绘制。family
其余部分仍在审查中：「干净的现代 flat SVG」不等于「2014 年的 Mac app」。

### Liquid Glass / macOS Tahoe 26

基线以每个对象一张 baked `128-default` raster 创作，64/32/16 与 Dark/Clear 文件
是 deterministic derivatives。最终 runtime dispatch 则选择已经存储的逐对象、逐
appearance tier：紧凑系统场景 16 px、普通场景 32 px、desktop／large／Retina 场景
128 px，明确请求时使用 64 px；它不再让所有界面缩小同一张 128-default。让 ImageGen
直接在一张平图中画出 glass、refraction、specular 与 shadow，是有效的 draft prompt，
但不能建立 layered source architecture。

Finder 现在采用已批准的 Tahoe 蓝色外壳与独立半透明面孔／侧脸构造。其源架构记录
独立 `base`、`panel`、`ink` 图层，按该顺序重组，而且不会把烘焙玻璃 master 当成
图层源。Finder 为 `reference-validated`；Finder 与 C 级 MultiFinder 构图在
Default、Dark、Clear 下都拥有直接构成的 128/64/32/16 光学资产。这关闭了两个 P0
cell，但不会假装其余 family 已经成为完整 layered system。下节单独说明的 Review
Desk 与 ClioTalk 是另外两个拥有独立绘制 semantic layer 的对象；其余 52 个对象不获得这种
信用。Searcher 属于这 52 项：其 16 px hierarchy 未通过晋升，因此保留原 broad
runtime 与 `pending` 历史状态。后来 Apple 文档与 Tahoe 26 final screenshot 冲突时，
以 Tahoe 26 实机为准。

### Review Desk — 五个现代 cell 已晋升

本轮之前，这一行实际上被锁在过于干净的 compound proofing shorthand 上，其中
page-plus-lens 关系还可能与 Searcher 混淆。compact export 会保留大尺寸 source 的
paragraph line、paper texture 或 subpixel cue，而没有真正决定 16 px 校对应用需要
哪些信息。

最终版本只保留两个稳定锚点：marked manuscript，以及可见的 inspection/correction
action。五个已晋升 runtime cell 按时代重新解释这两个锚点：

- Platinum：P-C，crisp proofreader clipboard/application；
- Jaguar：P-B，early-Aqua desk-like copy stand 与 marked sheet；
- Snow Leopard：P-B，成熟的专业 proofing board；
- Yosemite：P-B，带 coral correction bracket 的 free-form shallow manuscript，
  不使用 squircle 或 SF-symbol 构造；
- Liquid Glass：P-B，layered manuscript/correction object；其 `backing`、
  `manuscript`、`correction` canvas 会在 128、64、32、16 px 分别独立绘制，并逐像素
  精确重组 Default runtime。

每个现代 cell 都拥有该时代专属的 32 与 16 px optical redraw，而不是机械缩图。五项
都是 runtime asset，状态为 `historically-reviewed`；没有一项是
`reference-validated`、native replica 或 exact-pixel claim。`blindMixStatus` 仍为
`not-run`，因此这些保守专家视觉 PASS 不能冒充独立 blind result。先前已经 PASS 的
Classic Review Desk 保持不变。

### Searcher — 四个现代 cell 已晋升，Liquid Glass pending

稳定身份是透过 magnifying lens 表达 search/discovery，并展示一个可见的 search
relationship；镜片后固定一张 page 不是永久物理隐喻。Platinum 采用 hard-pixel
search utility，Jaguar 采用 jewel-cobalt lens 与 result card，Snow Leopard 采用
clear lens 与 indexed ledger，Yosemite 采用 free-form shallow lens 与单张 result
slip。四者都有独立光学 32/16 px artwork，来源为 P-B，状态为
`historically-reviewed`、non-native，且 `blindMixStatus: not-run`。

Liquid Glass 不获得晋升信用。生成 master 在大尺寸能说明 result hierarchy，但真实
16 px 审查时 hierarchy 坍塌。因此，它继续留在 broad runtime family，并保持
`historicalReviewStatus: pending`，直到 compact 重画与可审计 semantic layer 同时通过。

### ClioTalk

产品语义很强：user/model duality，以及模型输出仍为 provisional 的可见提示。
但 exact two-balloon composition 本身不是永久 anchor。

基线六时代 board 连续过头，已经形成时代错位。Jaguar 与 Snow Leopard 仍像后来
的 messaging app logo；16 px 时它们的 dashed provisional edge 会变成噪声或直接
消失。Platinum 也仍需要同期 conversation/correspondence treatment。

Yosemite 现在采用 P-B free-form transcript sheet，包含两个不同的 interlocutor mark
与一个独立、由 model 拥有的 provisional tab；32 与 16 px 是光学重画。Liquid Glass
现在采用 P-B glass conversation panel，在 128/64/32/16 分别拥有独立的
`enclosure`、`panel`、`conversation`、`provisional` source，并输出 Default、Dark、
Clear。两个 cell 都是 `historically-reviewed`，但都不宣称 native prototype、exact
replica、reference validation 或已完成 blind mix。Platinum/Jaguar/Snow Leopard
继续 FAIL 与 pending。

### Toolbar 与 sidebar 边界

ledger 声称 application、toolbar 与 sidebar/source-list art 是三个独立 family。
本审计尚未证明每个 runtime call site 都遵守该边界。浏览器能缩小 large app
icon，不代表它自动成为合格 compact toolbar art。

## 16 核心评分矩阵

每个 cell 按 **A/B/C = Semantic Continuity / Era Authenticity / Family
Harmony** 评分，范围均为 0～5。三项都至少为 4 才是 `PASS`。这些是保守的
专家 evidence-review 分数，不是人类 blind study 结果。分数也不会改变资产的
provenance 或 historical status；reference validation 必须另行记录。

尤其需要明确：4/4/4 的视觉 `PASS` 可以与 ledger 的
`historicalReviewStatus: pending` 同时存在。score 记录本轮可复现的专家视觉判断；
status 记录 evidence、reference comparison 与 blind-mix 闭环是否真的完成。

| 核心对象 | System 6 | Platinum | Jaguar | Snow Leopard | Yosemite | Liquid Glass |
| --- | --- | --- | --- | --- | --- | --- |
| Finder | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/5/4 PASS | 5/5/4 PASS | 5/4/4 PASS |
| MultiFinder | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS |
| Folder | 5/5/5 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS |
| Hard Disk | 5/5/5 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS |
| Trash | 5/5/5 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS |
| Document | 5/5/5 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS |
| File Floppy | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS |
| Project Hard Disk（`projectDisk`） | 5/4/4 PASS | 5/3/3 FAIL | 5/3/3 FAIL | 5/3/3 FAIL | 5/3/3 FAIL | 5/3/3 FAIL |
| Project CD（`projectDisc`） | 4/3/3 FAIL | 4/4/4 PASS | 4/4/4 PASS | 4/4/4 PASS | 4/4/4 PASS | 4/4/4 PASS |
| Searcher | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/3/3 FAIL |
| TeachText | 5/4/4 PASS | 5/4/4 PASS | 5/3/3 FAIL | 5/3/3 FAIL | 5/3/3 FAIL | 5/3/3 FAIL |
| Scrapbook | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS |
| ClioTalk（`assistant`） | 5/4/4 PASS | 5/3/3 FAIL | 5/2/3 FAIL | 5/2/3 FAIL | 5/4/4 PASS | 5/4/4 PASS |
| Control / Settings | 5/4/4 PASS | 5/4/4 PASS | 5/3/3 FAIL | 5/3/3 FAIL | 5/3/3 FAIL | 5/3/3 FAIL |
| Review Desk | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS | 5/4/4 PASS |
| DocMap | 5/4/4 PASS | 5/3/3 FAIL | 5/3/3 FAIL | 5/3/3 FAIL | 5/3/3 FAIL | 5/3/3 FAIL |

结果：**96 个核心时代 cell 中，73 个通过专家审查，23 个失败。**Finder、
MultiFinder、Folder、Hard Disk、Trash、Document、File Floppy、Scrapbook 与
Review Desk 现在都能在六个年代越过门槛。分数恰好增加 22 个 cell：原先失败的
五个 post-Classic Finder cell、原先失败的全部六个 MultiFinder cell、已晋升的五个
现代 Review Desk cell、Platinum 至 Yosemite 的四个 Searcher cell，以及 Yosemite 与
Liquid Glass 的两个 ClioTalk cell。其余 11 个优先对象没有分数变化。总结论仍是
FAIL：Liquid Glass Searcher 与下列失败项尚未关闭。

## 哪些地方暴露它是现代重画

当前核心中最强的 2026 痕迹为：

| 对象 / family | 暴露点 | 必要修正 |
| --- | --- | --- |
| Platinum/Jaguar/Snow 的 ClioTalk | 当代 app-logo 气泡或 generic correspondence；16 px dashed cue 坍塌 | 采用同期 communication/correspondence grammar，并光学重画 provisional cue |
| Liquid Glass Searcher | 大尺寸 result hierarchy 在 16 px 缩减后不可读 | 晋升前先创作真正 compact hierarchy 与可审计 Liquid Glass layer |
| Project Hard Disk | label/container 的构图过度稳定 | 从每时代 volume prototype 出发，只添加一个克制 project cue |
| DocMap | 完美 branch/node geometry 像现代 diagram icon | 保留 document-structure identity，但使用时代原生的不规则度与密度 |
| Jaguar family | object genre 共享 cyan/gloss/perspective | 恢复各 genre 的 object、material 与 perspective 规则 |
| Yosemite family | 现代 uniformity、later container 或 symbol-like stroke | 恢复 10.10 free-form silhouette 与浅层 object-owned depth |
| Finder、Review Desk、ClioTalk 以外的 Liquid Glass family | glass 烘焙进 flat master | 逐对象扩展可审计 semantic-layer 纪律；不得把这三个对象的状态泛化到其余 52 个图标 |

## 小尺寸 artwork 状态

| 时代 | 32/16 状态 | 审计结果 |
| --- | --- | --- |
| Classic | 分离的 smooth SVG 是已选目标；两个尺寸都保留 native-evidence anatomy | Finder 与 C 级 MultiFinder PASS；product-only glyph 仍需逐项审查 |
| Platinum | Finder/MultiFinder 针对 42/32/16 直接构成；Review Desk 与 Searcher 拥有最终 42/32/16 资产与独立光学 32/16 重画 | Finder/MultiFinder/Review Desk/Searcher optical tier PASS；全家族验证 pending |
| Jaguar | Finder/MultiFinder 针对 128/32/16 直接构成；Review Desk 与 Searcher 拥有 128 大尺寸 tier 与独立光学 32/16 重画；runtime dispatch 对紧凑、普通、desktop/large/Retina 分别使用 16、32、128 | Finder/MultiFinder/Review Desk/Searcher PASS；其他 compact tier 继续审查 |
| Snow Leopard | Finder/MultiFinder 针对 512/128/32/16 直接构成；Review Desk 与 Searcher 拥有 512/128 大尺寸 tier 与删除 texture 的光学 32/16 重画；runtime dispatch 按场景使用 16/32/128 | Finder/MultiFinder/Review Desk/Searcher PASS；其余 core 的大尺寸 richness 与 compact optical work 仍 open |
| Yosemite | Finder/MultiFinder 针对 128/64/32/16 直接构成；Review Desk、Searcher、ClioTalk 拥有独立光学 32/16 重画；runtime dispatch 按场景使用 16/32/128 | Finder/MultiFinder/Review Desk/Searcher/ClioTalk PASS；其他 compact tier 继续审查 |
| Liquid Glass | Finder/MultiFinder 在各种 appearance 下针对 128/64/32/16 直接构成；Review Desk 与 ClioTalk 在四个 tier 分别独立绘制 semantic source，并验证 Default 精确重组；runtime dispatch 按场景使用 16/32/128，明确请求时使用 64 | Finder/MultiFinder/Review Desk/ClioTalk PASS；其余 52 个图标仍没有独立审计的 semantic-layer source |

最明显的 ClioTalk compact 失败仍是 Jaguar/Snow Leopard 的 dashed provisional reply。其他高风险 cue
包括 Liquid Glass Searcher 的 result hierarchy、DocMap branch、writing instrument
以及 Project Hard Disk label。

## Era-native blind-mix review

板面协议把八个当前 runtime asset 与八个 evidence-only real reference 混合，做
deterministic shuffle，隐藏名称与 provenance，再询问 reviewer 哪些最像后来补画。
这是有效 review setup；但在独立 reviewer 看到 key 之前提交选择，才算 blind result。

本审计冻结时尚无独立审查结果。下面仅是**非盲专家风险预测**，明确记录以免以后
被误写成 blind findings：

| 时代 | 最可能被挑出的后来补画 | 原因 |
| --- | --- | --- |
| Classic | 复杂 product-only compound | smooth regularity 与统一 proportion 可能偏离 native System anatomy |
| Platinum | Finder/MultiFinder/Review Desk/Searcher 以外的生成 product utility | uniform lavender/keyline 与过度完美 geometry |
| Jaguar | TeachText、ClioTalk、DocMap | cyan 收敛、共享 gloss、genre 分化弱 |
| Snow Leopard | 其余 compound product icon | derivative size 与 object-specific material richness 不足 |
| Yosemite | DocMap 与其他未复核 product utility | later-macOS symbol/container cue 与 uniform graphic cleanliness |
| Liquid Glass | 批准 Finder、Review Desk、ClioTalk 家谱以外的 baked core | 平面绘制的 glass，而不是可审计 semantic layer + appearance rendering |

下一步必须由至少一位没有制作 board 的 reviewer，在取得 provenance key 之前提交
匿名 sample number 与 confidence。在此之前，blind-mix gate 为 **NOT RUN**。

## Intentional anachronism

`fileFloppy` 是 16 核心中唯一批准的 intentional anachronism：

```json
{
  "id": "fileFloppy",
  "intentionalAnachronism": true,
  "reason": "File Floppy is a stable product-level metaphor for temporary context."
}
```

在后期年代，它必须像该时代有意重新画的一枚 floppy，而不能暗示 floppy 仍是系统
标准 removable medium。Project CD 没有取得同样的 blanket exception；其 medium
必须在目标年代可信，或明确记录为 archive/export choice。

## 修改前后与 review 产物

以下 board 中所有 Apple/reference pixels 都是 evidence-only。只有从
`apps/desktop/assets/themes/<era>/icons/` 重新解析并生成的 runtime row 才能称为
current。

| 产物 | 用途 | 文档冻结时状态 |
| --- | --- | --- |
| `internal/evidence/drafts/finder-multifinder-era-redraw/finder-multifinder-six-era-review-board.png` | 基线 Finder/MultiFinder 失败对比 | 已存在；evidence-only diagnostic，不是获准的 before state |
| `internal/evidence/drafts/clio-talk-era-redraw/clio-talk-six-era-review-board.png` | 六时代 ClioTalk continuity 检查 | 已存在；证明构图锁得过紧与 compact 风险 |
| `internal/evidence/drafts/era-icons/icon-continuity-board.png` | 旧版 full-family continuity board | 已存在；evidence-only before state |
| `internal/evidence/drafts/icon-lineage-audit/imagegen-finder-lineage-candidates.png` | 被拒绝的第一代 candidate sheet | 已存在；只是负面 authoring evidence，不是 historical evidence 或 runtime proof |
| `internal/evidence/drafts/icon-lineage-audit/imagegen-candidates-v2/` | 按对象保存的已批准与被拒绝 v2 authoring-candidate workspace | 已存在；candidate acceptance 与 historical status 保持分离 |
| `internal/evidence/drafts/icon-lineage-audit/imagegen-candidates-v2/review-desk/` | 五份 Review Desk master、精确 prompt/provenance，以及 large/true-16 light/dark candidate board | 已存在；Platinum P-C 与现代 P-B authoring direction，不声称 native artwork |
| `internal/evidence/drafts/icon-lineage-audit/imagegen-candidates-v2/searcher/searcher-v2-runtime-optical-board.png` | 已晋升的 Platinum/Jaguar/Snow Leopard/Yosemite Searcher true 32/16 runtime tier | 已存在；四个 P-B reinterpretation 通过 compact review，Liquid Glass 仍排除在外 |
| `apps/desktop/assets/themes/liquid-glass/icons/src/priority-lineage-layers/reviewDesk-<size>-<layer>.png` | Review Desk 在 128/64/32/16 的 `backing`/`manuscript`/`correction` source architecture | 已存在；十二份 source 均独立绘制，Default 精确重组由测试把关 |
| `internal/evidence/drafts/icon-lineage-audit/imagegen-candidates-v2/cliotalk/clio-talk-v3-small-size-review.png` | ImageGen v3 ClioTalk candidate 与 compact 比较 | 已存在；Yosemite/Liquid 通过 authoring review，Jaguar/Snow 仍为 rejected evidence |
| `apps/desktop/assets/themes/liquid-glass/icons/src/priority-lineage-layers/assistant-<size>-<layer>.png` | ClioTalk 在 128/64/32/16 的 `enclosure`/`panel`/`conversation`/`provisional` architecture | 已存在；十六份 source 均独立绘制，Default 精确重组由测试把关 |
| `tooling/build-approved-priority-lineage.mjs`；`tests/features/approved-priority-lineage.test.mjs` | 最终 Review Desk、已准入 Searcher 与 ClioTalk runtime ownership、provenance 重建，以及 hash/compact/distinction/layer 检查 | 已存在；focused feature verification 通过 |
| `internal/evidence/drafts/icon-lineage-audit/finder-lineage-approved-runtime-vs-evidence.png` | 批准的现代 Finder/MultiFinder runtime、目标时代 evidence 与 optical tier | 已存在；当前 P0 acceptance board |
| `internal/evidence/drafts/icon-lineage-audit/cross-era-current-runtime.png` | 16 core × 6 当前 runtime family | 已存在；从最终 runtime mapping 重建 |
| `internal/evidence/drafts/icon-lineage-audit/family-<era>-current-runtime.png` | 六张 16-core era family board | 已存在；六张都解析最终 runtime pixels |
| `internal/evidence/drafts/icon-lineage-audit/finder-lineage-current-runtime-vs-evidence-only.png` | 当前 Finder 与本地 real reference 对照 | 已存在；展示修正后的六时代 identity 序列 |
| `internal/evidence/drafts/icon-lineage-audit/blind-mix-<era>-evidence-only.png` | 匿名 8+8 混排协议 | 已存在；不暗示已有人类审查结果 |
| `internal/evidence/drafts/icon-lineage-audit/before-after-full-current-runtime.png` | 基线 core row 对当前 runtime | 已存在；在批准 Finder、Review Desk、四时代 Searcher 与两时代 ClioTalk runtime 变化后重建，不升级其他 core |
| `internal/evidence/drafts/icon-lineage-audit/before-after-finder-current-runtime.png` | Finder diagnostic comparison | 已存在；当前 runtime after state 加 evidence-only comparison |

由于 git ignored 的研究文件不会自动出现在每个 linked worktree，board builder
把维护者原始工作区中已有的 historical-evidence cache 作为受控的**只读 fallback**。
它只在本 worktree 写入 review board；任何 fallback reference file 都不会复制到
icon 目录、manifest、package 或 runtime asset。

关键 before/after 不只发生在像素，也发生在定义上：

| Before | After / 必要状态 |
| --- | --- |
| 六时代锁定同一 physical metaphor | 只锁一到两个 identity anchor；目标 OS prototype 可以改变构图 |
| post-Classic Finder 是 compact Mac | 各时代现在遵循自己的 Finder prototype；Tahoe 拥有独立 `base`、`panel`、`ink` source |
| Review Desk 是一个 page-plus-lens compound，细节靠机械缩小 | marked manuscript + correction action 按时代重新解释；独立光学 32/16 重画，Tahoe 拥有 `backing`/`manuscript`/`correction` source |
| Searcher 是同一 page-plus-lens 构图换 material | Platinum 至 Yosemite 采用不同的时代 genre 与光学 32/16 绘制；Liquid Glass 保持 pending，不继承完成信用 |
| ClioTalk 是同一 solid/dashed 双气泡 logo | Yosemite 使用 free-form transcript sheet；Tahoe 使用 layered conversation panel；Platinum/Jaguar/Snow 保持 pending，不继承完成信用 |
| Classic smoothing 可以覆盖 native anatomy | Retina SVG 继续平滑，但 native-evidence anatomy 控制重画 |
| `accepted-generated` 听起来像 historical | authoring、technical、historical、runtime 四条轴独立 |
| compact tier 只是 export preset | 只有真正 direct optical size 才获得对应信用 |
| Liquid Glass material 烘焙到唯一 master | Finder、Review Desk、ClioTalk 已拥有独立审计的 semantic-layer source；只有这些逐项转换对象获得 layered-source 信用 |

## 文档 / runtime 一致性

最终每条 ledger entry 必须无需推断即可回答：

1. 资产如何创作？
2. 有没有直接 historical prototype？若无，最近 analog 是什么？
3. 使用了哪个 source 或 local reference？
4. 哪些尺寸是 independent artwork，哪些只是 derivative？
5. 是否真的执行了 blind-mix review？
6. 是否做了 reference comparison，还是只有 technical check？
7. 它是 runtime selected、review-only 还是 evidence-only？

基线存在以下漂移：

- continuity ledger 把 Finder 与 ClioTalk 的构图锁得过紧；
- `era-icon-reference.json` 描述 reviewed core，但后续 generated overlay 可以替换
  那些像素；
- Aqua、Snow Leopard、Yosemite README 坦率写明尺寸为 derivative，但其他
  ledger 文案可能听起来像 native-size acceptance；
- Platinum 与 ImageGen run ledger 混淆 accepted source art 与历史完成；
- Liquid Glass core ledger 描述 layer model，但完整 runtime family 仍选择 baked
  generated master。

只有 final build order、manifest、family entry、README 文案与 current-runtime
board 的像素全部一致，审计才称得上一致。被拒绝的第一代 Finder/MultiFinder
overlay 不获得任何状态信用；只有最终 runtime overlay 选择的批准 v2 重绘，才能在
board 与 ledger 中作为 accepted pixels 出现。Review Desk、四个已准入 Searcher
cell 与两个已准入 ClioTalk cell 通过独立 priority-lineage overlay 遵循同一 final-owner 规则；其宽泛 generated
archive 继续作为 archive provenance 保留，而不声称拥有最终 runtime pixels。

## 历史 reference 与版权边界

| 时代 | 本地控制证据 | 外部引用 |
| --- | --- | --- |
| Classic | `.claude/skills/system6-ui-review/assets/System 6.0.8 - System Startup.img`；`internal/evidence/drafts/era-icons/classic-core-reference-board.png`；System resource ledger/build input | [Infinite Mac source repository](https://github.com/mihaip/infinite-mac)；bundled image SHA-256 `d1129d50e08064124ecba7423544f753650ceb2b064a3e447f86ef5ce3d6fba2` |
| Platinum | `internal/evidence/drafts/theme-lab-fidelity-cache/platinum/`；`internal/evidence/drafts/era-icons/platinum-core-reference-board.png` | [GUIdebook Mac OS 9.0](https://guidebookgallery.org/screenshots/macos90)；[Inside Macintosh Finder icon-family plate](https://dev.os9.ca/techpubs/mac/Toolbox/graphics/FI-SL-01.jpg) |
| Jaguar | `internal/evidence/drafts/theme-lab-fidelity-cache/aqua/guidebook-desktop-full.png`；`.../aqua/icons/` | [GUIdebook Mac OS X 10.2](https://guidebookgallery.org/screenshots/macosx102)；[512 Pixels Jaguar library](https://512pixels.net/projects/aqua-screenshot-library/mac-os-x-10-2-jaguar/) |
| Snow Leopard | `internal/evidence/drafts/snow-leopard-icon-reference/captures/`；`.../iconsets/FinderIcon.iconset/icon_128x128.png` | [Snow Leopard-era icon HIG mirror](https://leopard-adc.pepas.com/documentation/UserExperience/Conceptual/AppleHIGuidelines/XHIGIcons/XHIGIcons.html)；[512 Pixels Snow Leopard library](https://512pixels.net/projects/aqua-screenshot-library/mac-os-x-10-6-snow-leopard/) |
| Yosemite | `internal/evidence/drafts/yosemite-icon-reference/web/`；`internal/evidence/drafts/theme-lab-fidelity-cache/yosemite/` | [512 Pixels Yosemite library](https://512pixels.net/projects/aqua-screenshot-library/os-x-10-10-yosemite/) |
| Liquid Glass | `internal/evidence/drafts/liquid-glass-reference/captures/512pixels/`；`.../captures/macworld-21-icons/`；本地 WWDC transcript cache | [Apple app-icon guidance](https://developer.apple.com/design/human-interface-guidelines/app-icons/)；[Apple Icon Composer](https://developer.apple.com/icon-composer/) |

历史 screenshot、提取资源与 Apple artwork 只用于本地 review evidence。runtime
asset 是项目独立 redraw/adaptation，不是再分发的 reference pixels。

## 明确未通过与剩余工作

以下项目**尚未通过**：

1. 96 个核心时代 cell 中有 23 个低于 4/4/4。
2. Project Hard Disk、Classic Project CD、Liquid Glass Searcher、Platinum 之后的 TeachText、
   Platinum/Jaguar/Snow Leopard 的 ClioTalk、现代 Control/Settings 与 DocMap 需要时代专属
   redraw/review。
3. Platinum/Jaguar/Snow Leopard ClioTalk 的 16 px provisional cue 不能可靠辨认。
4. Finder/MultiFinder/Review Desk、已准入 Searcher cell 与已准入 ClioTalk cell 以外，Jaguar、Snow Leopard、Yosemite 与
   Liquid Glass 多数 compact tier 仍是 derivative，而不是通过验收的 optical artwork。
5. Finder/MultiFinder/Review Desk、已准入 Searcher 与 ClioTalk 以外，Snow Leopard 的 512 tier 尚未证明自己是
   更丰富的 master。
6. Liquid Glass 还不是完整的 56-object layered system。Finder 拥有获准的
   `base`/`panel`/`ink` source；Review Desk 在四个 optical tier 拥有获准的
   `backing`/`manuscript`/`correction` source；ClioTalk 在四个 tier 拥有获准的
   `enclosure`/`panel`/`conversation`/`provisional` source；MultiFinder 是获准的
   C 级构图，其余 52 个对象不获得 independently audited layered-source 信用。
7. Platinum 全套 generated family 尚未完成 object-by-object historical comparison。
8. 尚无 independent human blind-mix result。
9. application、toolbar、sidebar/source-list 分离 family 的 runtime 使用尚未全部追踪。
10. 其余 40 个 semantic object 有 runtime coverage，但仍有 **240 项 pending lineage
    review**（40 objects × 6 eras），不能继承核心对象的 score 或 status。
11. 重建后的 cross-era 与 era-family board 覆盖优先 16 项。完整 56-object
    era-board review 与每枚被修改 icon 的 before/after ledger 尚未完成；不能把
    核心 board 冒充成这项更广的交付。

下一步工作顺序固定为 semantic identity → prototype/analog → genre → silhouette
→ perspective → optical bounds → material → lighting → palette → shadow → detail
density → compact hinting。前面的决定尚未正确时，不进行 micro-pixel 或色彩微调。

只有两个问题都能无保留回答「像」，审计才真正关闭：每一列是否真的属于那个 Mac
时代；每一行是否像同一个产品在四十年间被自然地反复重画。
