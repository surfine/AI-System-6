<!-- canonical-source: docs/city-simulator/SAVE-FORMAT.md -->
<!-- source-sha256: abc6d1d269775eb891f6e22b481f66092b1c355b06b78027c849e4c4d6d7a78c -->

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
| `facilities` | 电力、供水、交通和公共服务设施 |
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

城市存档位于专用 `bonsaiCities` store，绝不复用 GPL Micropolis 的 `cities`
store。导入先验证格式、版本、结构和完整性，再分配新的城市 id；绝不覆盖现有
记录。v3 记录信封不需要提高 IndexedDB schema 版本。
