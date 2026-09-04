<!-- canonical-source: docs/city-simulator/LEGAL-AND-PROVENANCE.md -->
<!-- source-sha256: bd228945186a002248f566ef2f2e0efd16d4313f0b367f28b29e690f27d1cff9 -->

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
| Maxis / EA / SimCity 2000 | 依据公开事实与对合法拥有副本的观察，clean-room 重新实现游戏行为（规则、玩家可见数字、文件格式）；研究 Macintosh 版本并把*观察到的事实*——色值、布局比例、结构构图——用于我们自己的原创美术（所有者决定，2026-08-24） | 代码、sprite、tile、声音、文案、城市、scenario、作为资产的截图、品牌资产、转换数据、描摹美术、自动提取美术资产 |
| `.SC2` fixture | 由项目代码（导出器 / fixture 生成器）合成生成、带 provenance 的文件 | 提交、分发或引用 EA 原版来源的城市文件（NEWCITY、TESTCITY 等） |
| 用户自备 `.sc2`/`.scn` 文件（所有者或玩家自己的副本） | 通过本地文件选择器在运行时导入，全部在浏览器内处理（DOOM 本地 IWAD 模式） | 提交、打包、上传或再分发 |
| AI System 6 MIT 代码 | 原创路径内的一切 | 为了保持 MIT 文件而吸收 GPL 代码 |
| 原创美术/声音/文案/数据 | 创作并登记 provenance manifest（作者、日期、工具、许可、来源）；匹配从参照观察到的色值是允许的 | 描摹原版轮廓、tile、声音或文案——形状与像素永远只属于我们自己 |

## 决定

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

- **2026-08-24 —— 视觉保真参照获得授权（所有者指示）。** 所有者把
  Macintosh 版 SimCity 2000 设为 Bonsai City 原创美术的视觉保真参照，并
  移动了调色板这条线：从合法拥有的副本上观察或采样的色值，以及布局/
  比例/构图的测量，属于*事实*，可以指导或进入我们的原创美术。本决定的
  许可审查：单个色值与测量数据不构成可版权的表达；构成表达的——
  sprite、tile、像素画、描摹轮廓、作为资产发布的截图、声音、文案、品牌
  资产、转换数据——仍全面禁止，每件成品仍是我们自己手工制作并登记
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
- 四方向 Canvas 精灵图集登记于 `assets/bonsai/provenance.json`（作者、日期、
  工具、MIT 许可、`source: original`）；`tooling/build-bonsai-atlas.mjs` 从项目
  手工编写的 JSON 描述重新生成它们，绝不读取外部美术来源。生成 PNG 是输出，
  不是美术创作源。

## 命名

- "Bonsai City / 盆景城市" 是已经批准的正式产品名。
- 原创产品不得使用 "SimCity"、"OpenSC2K"、"Micropolis" 或 Maxis/EA 名称。
  "MICROPOLIS" 是 Micropolis GmbH 的注册商标，仅属于独立的 GPL 游戏线。

## 执行

`tests/features/city-simulator-foundation.test.mjs` 扫描原创路径中的
`Math.random`、对独立 GPL 游戏引擎的引用、EA 原版来源的 `.SC2` fixture 以及
未批准的注册或 schema 变更。scoped AGENTS 文件使这些规则成为任何 agent 的
常设指令。
