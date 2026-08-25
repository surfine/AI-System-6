<!-- canonical-source: docs/city-simulator/OPENSC2K-RESEARCH.md -->
<!-- source-sha256: b69798116a2d52572a8d97f92e39a4a39cddb1da30319f41a92bac3a21552f0a -->

> 英文版为准 ・ 仅供人类参考

# OpenSC2K 研究记录

为原创城市模拟器固定的研究记录。目的：了解参考景观与边界所在。本文件不是
规格，里面也没有任何可作为实现模板的内容。

## 基线

- OpenSC2K 仓库：`nicholas-ochoa/OpenSC2K`
  - 固定 HEAD：`efb769bf01fb7ac56a97dd0f259a662fec36f260`（2019-09-22）
  - 许可：GPL v3（LICENSE 文件）；README 写 "v3 or later"；package.json 写
    `GPL-3.0`——按强 copyleft 处理。
  - 当前历史只有 11 个 commit；2019 年重写过历史，来源追溯能力弱。
- SC2k 公开格式资料：`OpenCity2k/SC2k-docs`
  - 固定 HEAD：`1062334f8cc63b2bd297bb8ebffaefadc6b5b4f8`（2025-04-26）
  - 许可：CC BY-SA 4.0（不是 MIT）
  - 自评：`.sc2` 规范"大体完整"；模拟规格只是零散笔记，不可实施。

## OpenSC2K 已有什么（仅研究原型）

- Phaser/WebGL 场景、相机、viewport、输入桥接。
- 固定 128×128 城市；`.SC2` chunk/RLE 导入与分层查看原型。
- 直接修改 cell 的道路工具；无成本、验证、撤销或命令日志。
- 被注释的 ZIP + `data.json` 导出草案；无导入、版本或迁移。
- 模拟循环是空壳；多个 global/micro 模块为空或被注释；没有测试、CI 或
  确定性种子/命令/事件层。

## 不适合采用的部分

- 架构把模拟耦合到渲染场景；actor 拥有 sprite；tick 来自渲染定时器；工具
  直接改 cell。
- `world.js` 加载原版 `LARGE.DAT` 与 `PAL_MSTR.BMP`——我们不使用原版资源。
- palette、tile/sprite 映射、解析流程是 GPL 实现且贴近原版数据；都不许进入
  Bonsai 路径。
- 其 fixture（`NEWCITY.SC2`、`TESTCITY.SC2`）与截图的分发权不明；一律不可用。

## 可采纳的只有抽象问题清单

例如"导入适配器与内部模型分离""地图分层便于调试""viewport 需要 culling"。
不是 OpenSC2K 的类型名、函数结构、常量或文件组织。

## 规则

- 禁止把 OpenSC2K 代码复制、移植或 AI 近似改写进 MIT 路径。
- 禁止提交 EA 原版来源的 `.SC2` 文件或任何原版游戏派生数据。
- 公开格式事实注明出处、独立措辞记录；不复制 CC BY-SA 笔记的逐字文本。
- **`.SC2` 兼容自 2026-08-23 起获得授权**（所有者指示；许可审查记录在
  [LEGAL-AND-PROVENANCE.md](LEGAL-AND-PROVENANCE.md)）。它就是本文件预留的
  clean-room 导入/导出器：依据 SC2k-docs 的事实、以独立措辞并注明出处实现
  （规范固定在上文 `1062334f8cc63b2bd297bb8ebffaefadc6b5b4f8`）；实现过程
  不查阅 OpenSC2K 的解析代码；fixture 全部由项目代码在测试时合成生成。

本文件是工程风险记录，不是法律意见。
