<!-- canonical-source: docs/city-simulator/LEGAL-AND-PROVENANCE.md -->
<!-- source-sha256: d1ae68cfed4ae686c694a0e0739cb162884c79867b8d355c456ecfccd6b57763 -->

> 英文版为准 ・ 仅供人类参考

# 盆景城市 —— 许可与来源

本文件是原创 Bonsai City 路径的施工规则。它是保守的工程边界，不是法律意见。

## 一句话规则

Bonsai City 路径保持 MIT 洁净：只允许原创代码与原创资产，且从公开的、
不受版权保护的思路与第一性原理编写。

## 边界表

| 材料 | 允许 | 禁止 |
| --- | --- | --- |
| OpenSC2K（GPL v3） | 阅读、记录高层事实、引用固定 commit | 复制、移植、近似改写、提取测试/枚举/表/流程/结构 |
| micropolisJS（GPL v3 + 附加条款） | 作为独立懒加载 vendor 游戏载荷保留；把它的存档*数据形状*（JSON 字段名、tile 编号）当作格式事实来读，使盆景城市能召唤一座城、也能送一座城回去 | 对 Bonsai 路径的任何贡献——不要引擎代码、表或算法；"MICROPOLIS" 商标仅授权给该独立项目 |
| OpenTTD（GPL v2）、DOOM | 独立游戏载荷 | 对 Bonsai 路径的任何贡献 |
| 原始 MIT/ISC 上游 | 未来经单独审查后从原始上游使用，并保留许可 | 从这些上游的 GPL 改编版本反向移植 |
| SC2k-docs（CC BY-SA 4.0） | 注明出处引用；以独立措辞记录协议事实 | 直接搬运文字、表格、图示或提取数据 |
| Maxis / EA / SimCity 2000 | 依据公开事实与对合法拥有副本的观察，clean-room 重新实现游戏行为（规则、玩家可见数字、文件格式）；研究 Macintosh 版本并把*观察到的事实*——色值、布局比例、结构构图——用于我们自己的原创美术（所有者决定，2026-08-24；自 2026-09-28 起同一界线适用于 SimCity 3000、SimCity 4 与 SimCity（2013）） | 代码、sprite、tile、声音、文案、城市、scenario、作为资产的截图、品牌资产、转换数据、描摹美术、自动提取美术资产 |
| `.SC2` fixture | 由项目代码（导出器 / fixture 生成器）合成生成、带 provenance 的文件 | 提交、分发或引用 EA 原版来源的城市文件（NEWCITY、TESTCITY 等） |
| 用户自备 `.sc2`/`.scn` 文件（所有者或玩家自己的副本） | 通过本地文件选择器在运行时导入，全部在浏览器内处理（DOOM 本地 IWAD 模式） | 提交、打包、上传或再分发 |
| OpenStreetMap 数据（ODbL 1.0） | 为玩家自己的城市在运行时经服务器中转（`/api/bonsai/osm`）取得，由 `bonsai-osm-import.js` 映射；地图上、地图设置里、存档的 `provenance` 记录和每次导出提示都署名「© OpenStreetMap contributors」 | 提交、打包或分发 OSM 数据摘录；测试访问网络；从建在 OSM 地面上的城市里去掉署名 |
| Terrain Tiles（AWS 开放数据，Mapzen terrarium） | 运行时取得并按格采样为一个高程，署名其来源（USGS、NOAA 以及 tilezen/joerd 列出的各地机构） | 提交或分发瓦片 |
| AI System 6 MIT 代码 | 原创路径内的一切 | 为了保持 MIT 文件而吸收 GPL 代码 |
| 原创美术/声音/文案/数据 | 创作并登记 provenance manifest（作者、日期、工具、许可、来源）；匹配从参照观察到的色值是允许的 | 描摹原版轮廓、tile、声音或文案——形状与像素永远只属于我们自己 |

## 决定

- **2026-09-29 —— 从 OpenStreetMap 导入真实地点（所有者指示，2026-09-28）。**
  所有者选定：底图加可选导入现有建筑（导入的建筑成为已长成的地块）、每格
  16 米、用 AWS Terrain Tiles 导入真实高程。许可审查：OSM 数据采用开放数据库
  许可 ODbL 1.0。映射它的盆景代码仍是 MIT；*数据*从不提交或分发——服务器中转
  只为提出请求的玩家取数，导入器的 contract 在测试时自行合成 fixture。建在 OSM
  地面上的城市是衍生数据库：它在每次存档中都带着 `provenance`（来源、署名
  「© OpenStreetMap contributors」、许可「ODbL-1.0」、高程署名、地点、范围、取数
  时间）；这座城在屏幕上时地图显示署名；JSON、`.sc2` 与 `.cty` 导出都提示玩家署名
  随文件同行，送往 Micropolis 的城市在其来源戳里带着署名。玩家公开分享这样的城市，
  就是在 ODbL 下分享 OSM 衍生数据。Terrain Tiles 要求署名其数据来源，地图设置和
  来源记录都已写明。中转在 User-Agent 中写明本应用、缓存答复、同一时间只发一个
  Overpass 查询、对未命中缓存的查询设每日上限，并遵守 Nominatim 每秒一次的规则；
  在公网部署上它位于 Turnstile 会话和 reader 池之后，因为公共 Overpass 实例不希望
  被大规模用作公开网站的后端（运维可把 `BONSAI_OVERPASS_URLS` 指向自己的实例）。

- **2026-09-11 —— 原创生成材质重制获得授权（所有者指示）。** 允许把订阅内置
  `image_gen.imagegen` 工具生成的原创图稿保存为创作输入。接口不暴露精确模型
  版本；请求的是 GPT Image 2.5，但不声称型号已经核实。来源记录保留原始图像、
  提示词、工具标识、型号未知状态及 SHA-256。确定性离线构建把图稿与项目原创
  语义配方、共享几何结合，输出四方向精灵、48 张颜色纹理及独立材质遮罩。
  普通构建不依赖联网生图。这补充早期手工创作流程；对复制、描摹或提取游戏
  表达的所有既有禁令仍有效。

- **2026-09-03 —— 双向存档互通获得授权（所有者指示）。** 所有者选择盆景城市与
  独立的 Micropolis 游戏之间做双向有损转换，每次转换都显示「丢了什么」的清单。
  本决定的许可审查：存档是数据格式，不是代码。`bonsai-micropolis-codec.js`
  （入站）和 `bonsai-micropolis-export.js`（出站）是 MIT 模块，按 Micropolis 外壳
  存储的形状读写纯 JSON 数字；它们使用的经典 tile 编号和标志位是公开格式事实，
  由测试观察 vendored 引擎自身的输出来确认，不复制、不移植任何引擎代码、查找表
  或算法。出站模块向 GPL 游戏的 `cities` IndexedDB store 写入一条记录，带
  `provenance: { from: "bonsai-city", cityId, exportedAt }`；没有 GPL 文本进入
  MIT 路径，foundation 扫描仍是门禁。`.cty` 容器（`micropolis-cty-codec.js`）
  依据公开的经典城市文件布局 clean-room 编写；绝不提交、打包或引用任何 EA 来源
  的 `.cty` 文件——用户文件只在运行时加载。

- **2026-09-28 —— SimCity 3000、SimCity 4 与 SimCity（2013）加入视觉参照
  （所有者指示）。** 所有者把 2026-08-24 的参照从 Macintosh 版 SimCity 2000
  扩展到三款后来的城市建造游戏，服务于新的微缩方向：逐栋设计的体素建筑，
  以移轴景深完成画面，另有第二档混合画面（实时地形、烘焙建筑）。界线不变：
  观察到的色值与布局/比例/构图测量属于事实；这些游戏的 sprite、模型、贴图、
  描摹轮廓、作为资产发布的截图、声音、文案、品牌资产与转换数据仍全部禁止，
  每件成品仍是我们自己的原创并登记 provenance。运行时读取自装副本依旧不在
  授权之内。

- **2026-08-24 —— 视觉保真参照获得授权（所有者指示）。** 所有者把
  Macintosh 版 SimCity 2000 设为 Bonsai City 原创美术的视觉保真参照，并
  移动了调色板这条线：从合法拥有的副本上观察或采样的色值，以及布局/
  比例/构图的测量，属于*事实*，可以指导或进入我们的原创美术。本决定的
  许可审查：单个色值与测量数据不构成可版权的表达；构成表达的——
  sprite、tile、像素画、描摹轮廓、作为资产发布的截图、声音、文案、品牌
  资产、转换数据——仍全面禁止，每件成品仍是我们自己的原创（该阶段为手工制作）并登记
  provenance 的作品。运行时读取玩家自装副本（DOOM 本地 IWAD 模式用于
  美术）**不在**本决定之内，需要另行修订。

- **2026-08-23 —— SC2000 对等计划获得授权（所有者指示）。** 所有者要求
  Bonsai City 达到 SimCity 2000 的玩法对等、双向 `.sc2` 存档兼容，并加入
  three.js 体素渲染后端。本决定的许可审查：游戏机制不受版权保护，可以重新
  实现；`.sc2` 容器格式依据 SC2k-docs 的事实 clean-room 实现（CC BY-SA 4.0
  —— 事实以独立措辞记录并注明出处；该许可覆盖的是文档的表达方式，我们不
  复制它）；OpenSC2K（GPL v3）仍仅限研究，其解析代码不在实现中查阅；EA 的
  表达（代码、美术、声音、文本、城市文件）仍然全面禁止。`three` 早已是项目
  devDependency（CMF Studio 在用）；再打一个懒加载 ESM 子集不新增依赖。

## 实际护栏

- Bonsai 模拟核心无头且自包含；绝不 `import` 或拼接 GPL vendor 引擎。
- 若某个需求看起来需要 OpenSC2K 或原版游戏资源，请从第一性原理重新推导，
  而不是伸手拿禁用来源。
- 公开格式事实可以用独立措辞记录（见
  [OPENSC2K-RESEARCH.md](OPENSC2K-RESEARCH.zh-CN.md)）；禁止逐字提取。
- `.sc2` 编解码器（`bonsai-sc2-codec.js`）只依据 SC2k-docs 的事实编写，
  出处记录在 OPENSC2K-RESEARCH.md。它的测试在测试时生成全部 fixture；
  任何城市文件二进制都不会进入仓库。
- 任何新增运行时资产在合并前都需要 provenance 条目。
- OpenStreetMap 与高程数据只在运行时经 `apps/server/server/bonsai-osm.js` 进入；
  `tests/features/bonsai-osm-import.test.mjs` 保证导入器离线、确定，并检查署名随城同行。
- 四方向 Canvas 精灵图集登记于 `assets/bonsai/provenance.json`（作者、日期、
  工具、MIT 许可、`source: original`）；`tooling/build-bonsai-atlas.mjs` 从项目
  原创 JSON 描述、共享几何与登记过的原创生成材质图稿重新生成它们。
  渲染图集 PNG 是构建输出；保存的生成材质板是有独立来源记录的创作输入。
  两个生成器均不读取或提取外部游戏美术。

## 命名

- "Bonsai City / 盆景城市" 是已经批准的正式产品名。
- 原创产品不得使用 "SimCity"、"OpenSC2K"、"Micropolis" 或 Maxis/EA 名称。
  "MICROPOLIS" 是 Micropolis GmbH 的注册商标，仅属于独立的 GPL 游戏线。

## 执行

`tests/features/city-simulator-foundation.test.mjs` 扫描原创路径中的
`Math.random`、对独立 GPL 游戏引擎的引用、EA 原版来源的 `.SC2` fixture 以及
未批准的注册或 schema 变更。scoped AGENTS 文件使这些规则成为任何 agent 的
常设指令。
