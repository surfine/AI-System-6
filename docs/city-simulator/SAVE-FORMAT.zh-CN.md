<!-- canonical-source: docs/city-simulator/SAVE-FORMAT.md -->
<!-- source-sha256: b521d8fdfe9e75752d65e0ce60efa18f1156ca093d9918f4a4d90ed26392d4f9 -->

> 英文版为准 ・ 仅供人类参考

# 盆景城市存档格式

## 身份

- 存档格式：`bonsai-city`
- 当前格式版本：3
- 当前引擎存档版本：3
- 支持地图尺寸：64×64、96×96 与 128×128（SC2K 原生尺寸）

格式名与版本由模拟核心（`FORMAT` / `SAVE_VERSION`）和
`foundation-contract.json` 共同钉死。改动必须两者同一次提交。

## 版本分离

三个数字含义不同，绝不混用：

| 数字 | 含义 | 拥有者 |
| --- | --- | --- |
| `formatVersion` | 可移植存档结构 | 存档编解码 |
| `rulesetVersion` | 模拟语义 | 模拟核心 |
| `indexedDbVersion` | 浏览器物理 store 布局 | AI System 6 外壳 |

## v3 字段

`serialize()` 输出纯 JSON 兼容值：

| 字段 | 含义 |
| --- | --- |
| `format` / `version` | `bonsai-city` / 3 |
| `name` | 城市名（仅显示，不翻译） |
| `seed` | 初始整数种子 |
| `rngState` | 当前 32 位 PRNG 状态 |
| `tick` | 整数固定步长计数；每五个 tick 为一个游戏日；一个月 25 天、一年 300 天（SC2K 历法） |
| `yearFounded` | 建城年份，1900 / 1950 / 2000 / 2050 之一 |
| `funds`、`taxRate`、`funding`、`loan` | 经济与政策状态 |
| `milestone`、`wasBroke`、`brownout` | 状态标记 |
| `size`、`terrainPreset` | 64、96 或 128，以及确定性地形预设 |
| `terrain`、`alt`、`water`、`shore`、`slope`、`tree` | 耐久地形层；海拔范围 0..31 |
| `road`、`rail`、`wire`、`pipe`、`zone`、`density` | 独立网络与区域层；zone 值 4/5/6 为军事/机场/海港（模型层面，命令随交通里程碑到来） |
| `stage`、`buildingState`、`constructionTimer`、`variant` | 耐久发展与施工层 |
| `catalogId` | 显式的 XBLD 对齐地块 id；0 表示"由模拟状态派生"——让导入的 `.sc2` 建筑在模拟接管该地块前得以保留的载体 |
| `subway`、`waterLevel`、`salt`、`rotate`、`tunnel`、`waterKind` | v3 SC2K 模型层（地下、水位、盐度、占地旋转、地形隧道、水体分类） |
| `sc2Sidecar` | 导入 `.sc2` 城市的可选保留侧表（原始 MISC 字节与未建模段），或 `null` |
| `facilities` | 电力、供水、交通和公共服务设施；记录可自带 `w`/`h`（存档规则 3.1：煤电厂记录 SC2K 的 4×4 占地，没有该字段的记录是旧版 2×2 电厂并保持原尺寸） |
| `history` | 有界的 120 个月城市历史 |
| `nextCommandSequence` / `pendingCommands` | 确定性命令顺序 |

派生网络（`powered`、`watered`、道路连接、覆盖、交通）、多格
`buildingAt`/`buildings` 锚点、问题标记、人口、岗位、需求、视觉代理和渲染
缓存加载时重建，绝不保存。

视图状态（相机、当前覆盖层、检查器与昼夜光照）由 `tick` 派生或由外壳
持有，同样绝不序列化；无论上次以何种视角查看，重载城市都会重放相同的模拟。

## 迁移策略

加载路径是纯函数链（Phase 2 已实现）：

```text
parse → 结构验证 → 完整性验证 → clone
→ vN → vN+1 纯迁移函数 → 当前版本验证 → 重建派生层
```

规则：

- 迁移绝不修改输入；被拒绝的加载保留原文件可导出。
- 比运行版本更新的存档显式拒绝（绝不部分迁移、绝不覆盖）。
- `formatVersion`、`rulesetVersion`、`indexedDbVersion` 的升级彼此独立，
  各自需要对应契约/测试更新。
- 存档规则 3.1（设施占地）是 v3 内部的增量规则：`deserialize` 保留记录自带的
  `w`/`h`，`footprintOf` 对没有该字段的记录回答旧版尺寸，因此信封版本不变，
  旧城市逐字节照常加载。troubled 示例的检查点重新钉死，因为其配方现在建的
  是 4×4 电厂。

## 信封

`encodeSave` 把 v3 引擎载荷包进信封：

```json
{
  "format": "bonsai-city",
  "formatVersion": 3,
  "metadata": { "cityId": "…", "name": "…", "createdAt": "…", "updatedAt": "…" },
  "engine": { "rulesetVersion": 3, "fixedTickHz": 20, "ticksPerDay": 5, "daysPerMonth": 25 },
  "simulation": { "seed": "...", "rng": { "algorithm": "mulberry32-v1", "state": [0] } },
  "payload": { "format": "bonsai-city", "version": 3, "…": "v3 引擎存档" },
  "integrity": { "algorithm": "SHA-256", "canonicalization": "sorted-json-v1", "digest": "..." }
}
```

`decodeSave` 校验结构、对除 `integrity` 外的内容重算规范化 JSON 摘要，并拒绝
被篡改的存档。`migrateSave` 是纯迁移链；v1 的固定 64×64 状态映射到 v2 独立
层，并把 `tick` 转为 `tick * 5`；v2 以零值补齐 SC2K 模型层（`waterKind` 从
`water` 派生），建城年份默认 1900。更新的版本显式拒绝。
规范化 = 键排序、数组保序、无空白，Node 与浏览器结果一致，检查点哈希可移植。

内存版 `createCityRepository`（create/list/get/put/remove）保留为测试适配器。
外壳通过共享写入围栏，把 v3 信封持久化到既有专用 `bonsaiCities` IndexedDB
store。
规范化序列化、完整性计算和大型导入解析优先使用专用存档 Worker。超时/错误
路径有界地回退到同一直接 codec；Worker 与回退输出逐字节一致。

## 持久化边界

城市存档位于专用 `bonsaiCities` store，盆景城市的状态绝不复用 GPL Micropolis
的 `cities` store。导入先验证格式、版本、结构和完整性，再分配新的城市 id；绝
不覆盖现有记录。v3 记录信封不需要提高 IndexedDB schema 版本。

这条边界只有一处有意的、只有一个模块宽的穿越：盆景城市召唤 Micropolis 的城市，
也能把一座城送回去；两个方向都有损，并且都报告损失。出站的一半
`bonsai-micropolis-export.js`（MIT）以纯 JSON 数字向 `cities` store 写入一条记录
——这是数据格式，不是代码——并盖上
`provenance: { from: "bonsai-city", cityId, exportedAt }`，绝不把盆景城市的信封
写进那里。见下文「与 Micropolis 的互通」。

## 与 Micropolis 的互通

两个方向都是两种建模不同事物的格式之间的转换；谁也不是谁的容器。每次转换都返回
一份 `warnings` 代码清单（`code` 或 `code:count`），外壳在玩家继续之前把它们全部
显示出来。契约是 `tests/features/city-save-import.test.mjs`（入站）和
`tests/features/bonsai-micropolis-roundtrip.test.mjs`（出站与往返）；两者都在测试
时运行 vendored 引擎来构建夹具。

### 入站 —— `bonsai-micropolis-codec.js`

一条 Micropolis `cities` 记录（或其裸 `saveData`）变成 v3 payload。经典的 120×100
地图居中嵌入 128 方格；围裙是咸水。道路、铁路和电线按 tile 家族带过来，含交叉；
桥落地为水面加其上的网络。九格分区块落地为逐格分区，阶段与密度从家族读出，而精确
的经典家族（或独栋房）以 `1 + level` 搭在 `variant` 层上，使该块能原样送回。运转
中的电厂与服务设施在经典左上角变成活的设施；体育场、教堂与放射性地面落地为目录
tile。代码：`ruins-cleared:N`、`tiles-without-equivalent:N`、`terrain-flat`、
`population-recomputed`、`ratings-not-carried`、`demand-reset`、
`sc2k-only-systems-absent`。

### 出站 —— `bonsai-micropolis-export.js`

`exportMicropolis(payload, options)` 返回 `{ saveData, name, warnings,
population, details }`。选项：`name`、`cityId`、`exportedAt`（调用方的时钟——模块
自己从不读时钟）、`powered`（活的供电层，只用作 POWERBIT 提示）、`population`，以及
移动裁剪窗的 `window: { x, y }`。

- **裁剪。** 128 方格地图裁成以 `spawnCenter` 为中心的 120×100 窗口
  （`cropWindowFor` 返回该矩形供预览）；64 与 96 方格地图居中嵌入，围裙是开阔水
  面。窗外的内容计入 `map-cropped:N`。
- **tile。** 水面与树林按邻接掩码取经典边缘形状；道路、铁路、电线按连通性取形状，
  交叉按哪条网络走哪个方向决定，水上的网络成为桥。分区按行序从左上角重新组成 3×3
  家族（港口 4×4，机场 6×6）；组不进块的分区格计入 `zone-tiles-unblocked:N`。煤电、
  核电、消防、警察与诊所在同一左上角变成经典家族；其他每种设施计入
  `facilities-without-equivalent:N`，种类在 `details.facilityKinds` 里。
- **标志位。** 块中心带 ZONEBIT；BULLBIT、BURNBIT、CONDBIT 按经典扫描留下的状态；
  POWERBIT 来自提示；ANIMBIT 只在喷泉上（引擎在首次扫描时重新给电厂加动画）。
- **标量。** `_cityTime = round(tick × 4 / 125)`、`totalFunds`、`cityTax`、三个拨款
  刻度；普查、评价与需求阀从引擎新城默认值开始；`_gameLevel` 0、`_speed` 1、
  `autoBudget` 关。
- **其他代码。** `altitude-flattened`、`wires-dropped-at-crossings:N`、
  `layer-dropped-{pipe,subway,highway,onramp,tunnel,water-level}:N`、
  `records-dropped-{bonds,ordinances,microsims,things}:N`、`history-dropped`、
  `progress-not-carried`、`population-recomputed`。完整清单是 `WARNING_CODES`；契约
  把每个发出的代码约束在其中。

### 往返事实（玩过 8000 tick 的引擎城市，由契约测量）

Micropolis → 盆景 → Micropolis 保留：每个 tile 家族；道路（形状；车流帧剥去）、铁
路、电线、住宅、商业、工业、煤电、警察的每个 tile id；每格的
ZONEBIT/CONDBIT/BURNBIT；资金、税率、时钟与拨款刻度。只按家族保留：水（一部分岸边
格的边缘帧不同）、树林（边缘帧）、空地（裸地上的推土位）。由引擎重算：POWERBIT、
ANIMBIT、车流、扫描尚未触及的分区格上的 BULLBIT、普查、评分、阀与历史。盆景 →
Micropolis → 盆景：裁剪窗内道路、铁路、电线、水、树各层相等，凡能组成经典块的分区
逐格相等。

### 经典城市文件 —— `micropolis-cty-codec.js`

`encodeCty(saveData)` / `decodeCty(bytes)` 在 Micropolis JSON 存档与 27,120 字节的
经典文件（六张 240 值历史表、一张 120 值杂项表、然后 120 列各 100 个大端 tile 值）
之间转换。文件放不下的 JSON 字段（预算效果、上次支出、城市中心）以引擎默认值回来，
并在解码警告里点名。与其他程序写出的文件互通刻意不做验证：不提交任何来源的城市
文件，契约的夹具都由引擎构建。
