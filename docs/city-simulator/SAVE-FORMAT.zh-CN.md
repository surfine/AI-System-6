<!-- canonical-source: docs/city-simulator/SAVE-FORMAT.md -->
<!-- source-sha256: 135375dc4bdea5b8fd5e74eb7663b3e905f4924c272373dfa76e344d154f5dd9 -->

> 英文版为准 ・ 仅供人类参考

# 盆景城市存档格式

## 身份

- 存档格式：`bonsai-city`
- 当前格式版本：1
- 当前引擎存档版本：1
- 地图尺寸：64×64（v1 固定）

格式名与版本由模拟核心（`FORMAT` / `SAVE_VERSION`）和
`foundation-contract.json` 共同钉死。改动必须两者同一次提交。

## 版本分离

三个数字含义不同，绝不混用：

| 数字 | 含义 | 拥有者 |
| --- | --- | --- |
| `formatVersion` | 可移植存档结构 | 存档编解码 |
| `rulesetVersion`（未来） | 模拟语义 | 模拟核心 |
| `indexedDbVersion` | 浏览器物理 store 布局 | AI System 6 外壳 |

## v1 字段

`serialize()` 输出纯 JSON 兼容值：

| 字段 | 含义 |
| --- | --- |
| `format` / `version` | `bonsai-city` / 1 |
| `name` | 城市名（仅显示，不翻译） |
| `seed` | 初始整数种子 |
| `rngState` | 当前 32 位 PRNG 状态 |
| `tick` | 整数 tick 计数 |
| `funds`、`taxRate`、`speed` | 经济与节奏 |
| `milestone`、`wasBroke`、`brownout` | 状态标记 |
| `size` | 64 |
| `alt`、`water`、`tree`、`over`、`zone`、`stage`、`variant` | 持久瓦片层 |
| `plants` | 发电厂 `{ kind, x, y }` |

派生层（`powered`、`roadOk`、`plantAt`、人口、岗位、需求、容量）加载时重建，
绝不保存。

Phase 7 视图状态（相机、昼夜光照与装饰性交通位置）由 `tick` 派生或由外壳
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

## 信封（Phase 2 已实现）

`encodeSave` 把 v1 引擎载荷包进信封：

```json
{
  "format": "bonsai-city",
  "formatVersion": 1,
  "metadata": { "cityId": "…", "name": "…", "createdAt": "…", "updatedAt": "…" },
  "engine": { "rulesetVersion": 1, "fixedTickHz": 20 },
  "simulation": { "seed": "...", "rng": { "algorithm": "mulberry32-v1", "state": [0] } },
  "payload": { "format": "bonsai-city", "version": 1, "…": "v1 引擎存档" },
  "integrity": { "algorithm": "SHA-256", "canonicalization": "sorted-json-v1", "digest": "..." }
}
```

`decodeSave` 校验结构、对除 `integrity` 外的内容重算规范化 JSON 摘要，并拒绝
被篡改的存档。`migrateSave` 是纯迁移链；v1 恒等，更新的版本显式拒绝。
规范化 = 键排序、数组保序、无空白，Node 与浏览器结果一致，检查点哈希可移植。

内存版 `createCityRepository`（create/list/get/put/remove）持有实时状态，时钟
可注入；后续阶段可在同一契约后用 IndexedDB repository 替换。

## 持久化边界（未决）

城市存档放 IndexedDB 的哪个位置尚未决定。它不得静默复用 GPL Micropolis 的
`cities` store——该 store 属于另一产品线，Bonsai 路径必须保持来源洁净。
选项是独立 store（属于“先问再改”的边界变更）或 project-scoped 城市记录；
决定留给后续阶段。
