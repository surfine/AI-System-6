<!-- canonical-source: docs/city-simulator/README.md -->
<!-- source-sha256: 771bbd4acbb7cea06141cc6a81d2cf4c30e45bb0b368c71ed8198135156333cd -->

> 英文版为准 ・ 仅供人类参考

# 盆景城市 —— 原创城市模拟器

工作名：**Bonsai City / 盆景城市**（最终名称尚未批准）。

盆景城市是 AI System 6 内一款原创、MIT 洁净的等距城市建设模拟器。它共享
经典城建体验的长期形态——分层瓦片网格、海拔、分区和 RCI 需求反馈——但全部
从第一性原理编写。SimCity 2000、Maxis、EA、OpenSC2K、Micropolis 或 OpenTTD
的代码、美术、声音、文案、数据与 fixture 均不得进入本项目。

**灵感锚点：** SimCity 2000 的公开设计思路——分层瓦片网格、海拔与等距地形、
RCI 需求反馈、电网与增长里程碑。只借鉴公开思路；Maxis 或 EA 的任何内容都
不得进入代码、数据、美术、声音或文案。

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
- 内核现在带有版本化命令层（即时与未来定时排队命令，单调序号）、版本化
  事件流与 canonical 检查点序列化；确定性由
  `tests/features/bonsai-kernel.test.mjs` 钉死。
- Phase 2 增加可移植存档信封（`encodeSave`/`decodeSave`，SHA-256 完整性 +
  canonical JSON，纯迁移链）与内存城市仓库（`createCityRepository`，时钟可
  注入）；两者由 `tests/features/bonsai-save.test.mjs` 钉死。
- Phase 3 接通懒加载的 System 6 外壳：`bonsaiCity` creative-lab 窗口可从
  Applications 打开，以 20 Hz 循环推进核心并支持暂停/慢/中/快，指针输入
  通过命令作用到平面俯瞰预览画布，城市经共享写栅栏事务存入专属
  `bonsaiCities` IndexedDB store。由 `tests/features/bonsai-shell.test.mjs`
  钉死。
- Phase 4 用原创等距渲染器替换预览：2:1 菱形投影、海拔抬升、画家序绘制，
  相机平移/缩放为纯视图状态。指针输入经逆投影只产生命令。由
  `tests/features/bonsai-renderer.test.mjs` 钉死。
- Phase 5 是可玩垂直切片：新建城市、建造道路/分区/电力、以 20 Hz 运行并
  支持速度档、查询瓦片、经完整性信封保存/加载，以及城市列表。关闭窗口时
  自动保存。由 `tests/features/bonsai-slice.test.mjs` 钉死。
- Phase 6 落地受 SimCity 2000 启发的系统：警察/消防站及其随资金缩放的
  覆盖、会拖慢增长的交通与拥堵、土地价值、确定性经济周期，以及带市长
  评分的城市报告。由 `tests/features/bonsai-systems.test.mjs` 钉死。
- Phase 7 用 three.js 等距体素场景替换扁平等距菱形绘制：体素地形、水面、
  道路/电线/公园、随阶段缩放的 R/C/I 建筑、树木、电厂与服务设施、由 tick
  驱动的昼夜循环，以及由拥堵层派生的装饰性交通。渲染器消费纯
  `buildRenderSnapshot` 并懒加载打包后的 three.js vendor；原创 16x16
  Minecraft 风图集为 MIT 干净资产并带 provenance 记录。由
  `tests/features/bonsai-voxel.test.mjs` 与 `tests/features/bonsai-atlas.test.mjs`
  钉死。
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
