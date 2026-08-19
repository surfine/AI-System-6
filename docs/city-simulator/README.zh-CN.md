<!-- canonical-source: docs/city-simulator/README.md -->
<!-- source-sha256: 61b07cf4b4dad606a07bd612ed65907762e99838b7d44524a0b11af586b44ebd -->

> 英文版为准 ・ 仅供人类参考

# 盆景城市 —— 原创城市模拟器

工作名：**Bonsai City / 盆景城市**（最终名称尚未批准）。

盆景城市是 AI System 6 内一款原创、MIT 洁净的等距城市建设模拟器。它共享
经典城建体验的长期形态——分层瓦片网格、海拔、分区和 RCI 需求反馈——但全部
从第一性原理编写。SimCity 2000、Maxis、EA、OpenSC2K、Micropolis 或 OpenTTD
的代码、美术、声音、文案、数据与 fixture 均不得进入本项目。

## Phase 0 范围

Phase 0 只建立基础与施工规则：

- 三层架构边界；
- 确定性、tick、种子、命令与事件契约；
- 版本化存档契约与迁移策略；
- AI System 6 外壳决策（窗口角色、状态栏、响应式、懒加载、生命周期）；
- 许可与来源规则；
- 机器可读基础契约、scoped AGENTS、本文档集、实施状态文件与可执行基础测试。

Phase 0 不实现玩法、地图渲染、窗口、持久化 store 或依赖。

## 当前状态

- 无头模拟核心已存在：
  `apps/desktop/app/features/bonsai-city-sim.js`（64×64 网格、带种子地形、
  分区、道路/电网/公园、发电厂、人口与需求、资金、整数 tick、
  `serialize`/`deserialize`）。
- 核心已提交，但从公开快照延后发布，且未接入任何窗口或菜单。
- 核心种子策略已由契约强制：外壳必须提供整数种子；核心绝不回退到
  `Math.random()`。
- GPL 游戏（Micropolis、OpenTTD、DOOM）是独立已上线产品，与 Bonsai 路径
  不共享代码。

## 文档地图

- [ARCHITECTURE.md](ARCHITECTURE.zh-CN.md)——层、确定性、命令/事件接口、
  外壳与生命周期契约。
- [SAVE-FORMAT.md](SAVE-FORMAT.zh-CN.md)——版本化存档格式与未来完整性/迁移链。
- [LEGAL-AND-PROVENANCE.md](LEGAL-AND-PROVENANCE.zh-CN.md)——MIT 边界、
  GPL 隔离与资产来源规则。
- [OPENSC2K-RESEARCH.md](OPENSC2K-RESEARCH.zh-CN.md)——固定研究记录与
  可采纳/不可采纳边界。
- [AGENTS.md](AGENTS.md)——面向 agent 的范围化工作规则。
- `foundation-contract.json`——由
  `tests/features/city-simulator-foundation.test.mjs` 强制执行的 Phase 0
  机器契约。
- CITY-SIMULATOR-IMPLEMENTATION-STATUS.md
  ——实施状态与未决决定。

## 验证

```sh
npm run verify:quick -- --feature city-simulator-foundation --docs --no-build
npm run verify:feature -- city-simulator-foundation
npm run verify:docs
```

仓库级发布门禁见 [DEVELOPMENT.md](../DEVELOPMENT.zh-CN.md)。
