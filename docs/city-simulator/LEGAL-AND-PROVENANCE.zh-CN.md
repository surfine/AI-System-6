<!-- canonical-source: docs/city-simulator/LEGAL-AND-PROVENANCE.md -->
<!-- source-sha256: 1a1dacd3dbbd87f5718c5847cd57c180e91fc3c322837f9206ba70789d933a93 -->

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
| micropolisJS（GPL v3 + 附加条款） | 作为独立懒加载 vendor 游戏载荷保留 | 对 Bonsai 路径的任何贡献；"MICROPOLIS" 商标仅授权给该独立项目 |
| OpenTTD（GPL v2）、DOOM | 独立游戏载荷 | 对 Bonsai 路径的任何贡献 |
| 原始 MIT/ISC 上游 | 未来经单独审查后从原始上游使用，并保留许可 | 从这些上游的 GPL 改编版本反向移植 |
| SC2k-docs（CC BY-SA 4.0） | 注明出处引用；以独立措辞记录协议事实 | 直接搬运文字、表格、图示或提取数据 |
| Maxis / EA / SimCity 2000 | 仅说明边界 | 代码、sprite、调色板、声音、文案、城市、scenario、截图、品牌资产、转换数据、描摹美术 |
| `.SC2` fixture（NEWCITY、TESTCITY 等） | 无 | 提交、引用或分发 |
| AI System 6 MIT 代码 | 原创路径内的一切 | 为了保持 MIT 文件而吸收 GPL 代码 |
| 原创美术/声音/文案/数据 | 创作并登记 provenance manifest（作者、日期、工具、许可、来源） | 描摹原版轮廓、调色板、tile、声音或文案 |

## 实际护栏

- Bonsai 模拟核心无头且自包含；绝不 `import` 或拼接 GPL vendor 引擎。
- 若某个需求看起来需要 OpenSC2K 或原版游戏资源，请从第一性原理重新推导，
  而不是伸手拿禁用来源。
- 公开格式事实可以用独立措辞记录（见
  [OPENSC2K-RESEARCH.md](OPENSC2K-RESEARCH.zh-CN.md)）；禁止逐字提取。
- 任何新增运行时资产在合并前都需要 provenance 条目。
- 体素纹理图集登记于 `assets/bonsai/provenance.json`（作者、日期、工具、
  MIT 许可、`source: original`）；构建工具 `tooling/build-bonsai-atlas.mjs`
  从手工编写的 16x16 网格重新生成它，绝不读取外部美术来源。

## 命名

- "Bonsai City / 盆景城市" 是当前工作名，尚未批准。
- 原创产品不得使用 "SimCity"、"OpenSC2K"、"Micropolis" 或 Maxis/EA 名称。
  "MICROPOLIS" 是 Micropolis GmbH 的注册商标，仅属于独立的 GPL 游戏线。

## 执行

`tests/features/city-simulator-foundation.test.mjs` 扫描原创路径中的
`Math.random`、对独立 GPL 游戏引擎的引用、`.SC2` fixture 以及未批准的注册
或 schema 变更。scoped AGENTS 文件使这些规则成为任何 agent 的常设指令。
