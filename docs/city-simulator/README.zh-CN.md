<!-- canonical-source: docs/city-simulator/README.md -->
<!-- source-sha256: acb71cc438616476c75bf420d0fceeeb290b8e3f1086ce7944193bf69a784886 -->

> 英文版为准 ・ 仅供人类参考

# 盆景城市 —— 原创城市模拟器

正式产品名：**Bonsai City / 盆景城市**。

盆景城市是 AI System 6 内一款原创、MIT 洁净的等距城市建设模拟器。它共享
经典城建体验的长期形态——分层瓦片网格、海拔、分区和 RCI 需求反馈——但全部
从第一性原理编写。SimCity 2000、Maxis、EA、OpenSC2K、Micropolis 或 OpenTTD
的代码、美术、声音、文案、数据与 fixture 均不得进入本项目。

**灵感锚点：** SimCity 2000 的公开设计思路——分层瓦片网格、海拔与等距地形、
RCI 需求反馈、电网与增长里程碑。只借鉴公开思路；Maxis 或 EA 的任何内容都
不得进入代码、数据、美术、声音或文案。

## 当前视觉管线（2026-09-11）

视觉重制保持 Canvas 2D 为默认视图，可切换懒加载 three.js 3D；WebGL 不可用
时回退 Canvas。两者共享 `createAssetBlocks` / `blockFaces` 建筑定义，包括
双坡顶、四坡顶及低面数阔叶和针叶树冠。四方向 2D 精灵通过同一几何的确定性
CPU 正交栅格化离线生成；模拟与存档格式不变。

审核过的原创材质板由订阅内置 `image_gen.imagegen` 工具生成。接口不暴露精确
模型版本，因此不声称使用了所请求的 GPT Image 2.5。保存的原稿与提示词进入
离线构建，生成 48 张颜色纹理及独立玻璃/发光遮罩；道路标线、窗格与季节颜色
保留语义配方。半像素 UV 内缩及关闭跨纹理 mipmap 防止图集串色，独立水面纹理
仍保留 mipmap。原稿校验值与逐项材质映射使构建结果可审查、可复现。

这里记录实现事实，不代表浏览器验收已通过。本次重制不改变模拟规则或存档，
也不包含部署。

## Phase 0 范围（历史）

Phase 0 只建立基础与施工规则：

- 三层架构边界；
- 确定性、tick、种子、命令与事件契约；
- 版本化存档契约与迁移策略；
- AI System 6 外壳决策（窗口角色、状态栏、响应式、懒加载、生命周期）；
- 许可与来源规则；
- 机器可读基础契约、scoped AGENTS、本文档集、实施状态文件与可执行基础测试。

Phase 0 不实现玩法、地图渲染、窗口、持久化 store 或依赖。

## 实现里程碑

以下记录早期阶段交付。当前渲染与资产决策以上文为准；已被取代的尺寸和
创作方法只作为历史保留。

- 无头模拟核心已存在：
  `apps/desktop/app/features/bonsai-city-sim.js`（64/96/128 网格、带种子地形预设、
  独立网络与区域层、施工、公用事业、服务、人口/需求/财政、整数 tick 与 v3
  `serialize`/`deserialize`）。它已接入懒加载的 Applications → Games 窗口，
  并随 1.0.50 策展式公开测试版快照发布。
- 核心种子策略已由契约强制：外壳必须提供整数种子；核心绝不回退到
  `Math.random()`。
- 内核现在带有版本化命令层（即时与未来定时排队命令，单调序号）、版本化
  事件流与 canonical 检查点序列化；确定性由
  `tests/features/bonsai-kernel.test.mjs` 钉死。
- Phase 2 增加可移植存档信封（`encodeSave`/`decodeSave`，SHA-256 完整性 +
  canonical JSON，纯迁移链）与内存城市仓库（`createCityRepository`，时钟可
  注入）；两者由 `tests/features/bonsai-save.test.mjs` 钉死。
- Phase 3 接通懒加载的 System 6 外壳：`bonsaiCity` creative-lab 窗口可从
  Applications 打开，以 20 Hz 循环推进核心并支持暂停/慢/正常/快，指针输入
  只产生预览与命令，城市经共享写栅栏事务存入专属
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
- 历史上，Phase 8 用唯一正式 Canvas 2D 渲染器替换未通过验收的体素展示层：48x24
  等距地块、四个 90° 视角、六个合成层、可见对角线裁剪、16x16 静态分块
  缓存，以及确定性的原创图集。渲染器消费纯 `buildRenderSnapshot`；指针、
  键盘与触控仍然只产生命令。由 `tests/features/bonsai-renderer.test.mjs`、
  `tests/features/bonsai-atlas.test.mjs` 与真实浏览器
  `verify:bonsai-acceptance` 门禁钉死。
- 图集家族新增夜间变体集（M5-2c）：每一座生长建筑、设施与目录特殊建筑
  都获得一帧调暗并亮起窗户的夜间图，Canvas 渲染器的昼夜门禁在黄昏换用
  这些帧，并把记录的窗位坐标在夜景层上画成亮窗——SimCity 2000 的夜间
  签名，完全由原创项目配方生成。
- 历史上，体素后端获得首版原创微体素纹理图集（M5-2d）：512px 2 的幂贴图集，内含
  40 张程序化 64px 贴图，懒加载，最近邻放大 + mipmap 适配 Retina 与
  移动端。道路、铁路、水管、电线、高速、桥梁与隧道按方向画连续的
  条带，建筑获得分区墙面、按变体屋顶细节与设施专属表面。
- 体素世界以 SimCity 2000 为榜样举一反三（M5-2e）：三种树木形态
  （阔叶、针叶、幼树）、坡顶小屋与退台高楼、定制地标造型（穹顶、
  市政塔楼、体育场分层、起重机、码头）、沿海沙滩、动态波光水面、
  连续道路路缘与两色车辆。
- 水体与灾害签名（M5-2f）：水遇高地即渲染瀑布，两个后端都按快照
  时钟动画；活动中的龙卷风与怪兽灾害有可见的漏斗与怪兽。
- 特殊分区地面视觉（M5-2g）：军事、机场与海港分区渲染为营地、跑道与
  码头地面——Canvas 跑道带连续标记——不再是隐形草地。

### 瓦片尺度

两个后端当前使用 64×32 像素菱形、10 像素高度步长和 0.7 默认缩放。
这些源码常数取代了早期 48×24 / 8 像素 / 0.82 基线及“等待调整”提案。
投影、指针数学、图集输出与验收必须使用当前值；下面的历史阶段记录不覆盖
这些当前事实。

- Canvas 2D 视图获得 SC2000 式 2.5D 深度（M5-2h）：受光屋顶檐口、
  立面层线、正门、双色树冠加投影、更丰富的地形（噪点、草叶、水面
  反光、海岸泡沫），以及每座建筑与地标下的柔和地面投影。
- 地形深度、水面生命与分区认领（M5-2i）：地面落差处有悬崖阴影带
  （两个后端）、Canvas 夜景层有按快照时钟闪烁的动画水面、R/C/I
  分区带细斜纹。
- 禅意纯净的日式 Minecraft 意境（M5-2j）：沉静的苔绿/墨蓝/纸白调色板、
  收敛的地形与水面细节、夜晚一轮淡月与稀疏纸灯、层层收窄的宝塔地标、
  按海拔着色的 SC2000 minimap、随 tick 摇摆的施工吊车。
- 码头与栈桥的水边鸟居、公园纹理里的枯山水一角、雪线以上的雪山（M5-2k）
  ——OpenTTD 基准按原理达成（干净的地形、每面一处安静细节），绝不复制
  其 GPL 素材。
- 2D 路径连续达到 3D 对等（M5-2l）：高速、匝道与跨水桥梁用方向感知的
  掩码帧转弯并在格界连续，道路隧道带深色覆盖与门框——OpenTTD 那套做法，
  落在我们自己的原创配方上。
- 枫叶点缀与 2D 电线杆（M5-2m）：约五分之一树木是红枫（两个后端），
  wire 帧带电线杆与横担。
- 港口签名与水面月影（M5-2n）：机场跑道稀疏的控制塔、海港码头的吊机，
  夜晚水面带极淡月影。
- 2D 道路路缘与季节枫叶（M5-2o）：图集街道带安静的路缘边线；秋季两个
  后端的枫树比例升到约一半树冠。
- 四季（M5-2p）：春樱、夏绿、秋枫、冬雪——两个后端都由快照日历纯
  驱动轮转。
- 冬季地面覆雪（M5-2q）：第四季整个低地覆雪（两个后端），春天又
  化开成苔绿。
- 季节水面（M5-2r）：冬季湖泊结冰成淡冰蓝、春季微亮，两个后端与
  minimap 一致。
- 有温度的 UX 收尾（M5-2u）：有引导性的双语文案、淡出的首次引导、
  作用域限定的主题 token CSS。
- 春天樱花瓣飘落（M5-2s）；高速与匝道现在是真家伙：双幅行车道与
  宽到窄的楔形引道，两个后端一致（M5-2t）。
- 模拟/存档契约升级到 v2：64/96 地图、独立的地形/交通/电力/供水/区域/
  建筑层、带纯预览的原子路径与区域命令、每游戏日五个 tick、密度与施工
  状态、供水和公共服务系统、政策/历史/贷款状态，以及纯 v1→v2 迁移。
  既有 `bonsaiCities` 记录仍留在专用 store；IndexedDB schema 不变。
- 两份固定配方（`starter-town` 与 `troubled-mid-size`）通过真实模拟和存档
  codec 重放原创 v2 命令日志。最终检查点被钉死，示例不能漂成静态布景。
- GPL 游戏（Micropolis、OpenTTD、DOOM）是独立已上线产品，与 Bonsai 路径
  不共享代码。
- Phase 9 开启 **SC2000 对等计划**（所有者指示，2026-08-23）：Bonsai City
  将成长为完整对等 SimCity 2000 玩法的游戏，带双向 `.sc2` 存档兼容
  （clean-room 编解码器，依据注明出处的公开格式事实；fixture 仅限合成）、
  懒加载 three.js 体素渲染后端（Canvas 2D 保留为 WebGL 不可用时的回退；
  两者只读同一渲染快照）、由项目配方生成的原创 Minecraft 风格微体素美术，
  以及原创合成音乐与音效。EA 的表达（代码、美术、声音、文本、城市文件）
  仍然全面禁止；见 [LEGAL-AND-PROVENANCE.md](LEGAL-AND-PROVENANCE.zh-CN.md)。
- 补完计划 B 车道（2026-09-03/04），朝所有者定下的「OpenTTD 完成度」验收推进：
  - 无死角：`tests/features/bonsai-no-dead-ends.test.mjs` 在应用测试壳里启动
    外壳，经真实的建城表单建一座城，逐一执行每个菜单命令（每个都必须改变
    DOM、外壳状态或城市检查点），经工具栏点击路径武装每个工具，检查核心能
    理解每个工具命令，并要求每个可达的 `bonsai_*` 键在两种语言里都存在。
    自动预算上线：默认关闭，每年一月停表并打开预算面板；开启后沿用上一年的
    预算线继续。从菜单选择的灾害现在会在状态行报告。
  - 两小时不卡壳：`npm run verify:bonsai-playthrough` 在无头核心上运行一个
    确定性的脚本市长（路网格、按需求分区、电厂与水厂、服务与交通、债券、
    法令、每十年一次灾害、奖励），遇到停滞、奖励未放置、报纸故事缺失或
    连续十二个月赤字即拒绝。它第一次运行就发现核心在振荡（一座 6 000 人的
    有服务城市两个月内跌到 16 人）；现在供给过剩必须持续三个结算月，正常
    运转的建筑才会衰退。市长在游戏年 1909 达到 50 000 人，在 128 格地图上
    稳定在约 68 000 人。它是一个安静的发布门禁。
  - SC2K 对等：煤电厂占 4×4（存档规则 3.1，旧电厂保持 2×2，查询气球会
    说明），`sc2DerivedGrids` 读出 64×64 / 32×32 网格，EQ/LE 法令挂钩确认
    已生效，[SC2-COMPAT.md](SC2-COMPAT.zh-CN.md) 带上所有者的认证运行表。
  - OpenTTD 级别的集成：状态栏多一行「N 秒前已保存」，pagehide 刷写经应用
    注册表确认，窗口已在移动端全屏与沉浸集合里，每个模拟事件各有一个合成
    音效。

## 文档地图

- [ARCHITECTURE.md](ARCHITECTURE.zh-CN.md)——层、确定性、命令/事件接口、
  外壳与生命周期契约。
- [SAVE-FORMAT.md](SAVE-FORMAT.zh-CN.md)——版本化存档格式与未来完整性/迁移链。
- [LEGAL-AND-PROVENANCE.md](LEGAL-AND-PROVENANCE.zh-CN.md)——MIT 边界、
  GPL 隔离与资产来源规则。
- [OPENSC2K-RESEARCH.md](OPENSC2K-RESEARCH.zh-CN.md)——固定研究记录与
  可采纳/不可采纳边界。
- [SC2-COMPAT.md](SC2-COMPAT.zh-CN.md)——`.sc2` 导入/导出状态、已知近似、
  fixture 政策与所有者手工验证流程。
- [SC2K-SYSTEMS-STUDY.md](SC2K-SYSTEMS-STUDY.zh-CN.md)——按公开存档规范
  整理的系统层面干净房间学习：SC2K 作为系统做了什么、Bonsai 有什么、缺口
  有哪些（天气、地下交叉、军事基地、巨型建筑家族）。
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
npm run verify:bonsai-playthrough   # 脚本市长的两小时试玩（安静发布门禁）
```

仓库级发布门禁见 [DEVELOPMENT.md](../DEVELOPMENT.zh-CN.md)。
