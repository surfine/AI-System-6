<!-- canonical-source: docs/city-simulator/SAVE-FORMAT.md -->
<!-- source-sha256: 23e8852bd839951c981dae5dd55b34c2806087231d21abde36aebde644414fd2 -->

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

## 迁移策略

未来加载路径是纯函数链：

```text
parse → 尺寸/限额验证 →（Phase 2：完整性验证）→ clone
→ vN → vN+1 纯迁移函数 → 当前版本验证 → 重建派生层
```

规则：

- 迁移绝不修改输入；被拒绝的加载保留原文件可导出。
- 比运行版本更新的存档显式拒绝（绝不部分迁移、绝不覆盖）。
- `formatVersion`、`rulesetVersion`、`indexedDbVersion` 的升级彼此独立，
  各自需要对应契约/测试更新。

## 未来信封（Phase 2）

Phase 2 把 v1 载荷包进信封，增加：

```json
{
  "format": "bonsai-city",
  "formatVersion": 1,
  "engine": { "rulesetVersion": 1, "fixedTickHz": 20 },
  "simulation": { "seed": "...", "rng": { "algorithm": "mulberry32-v1", "state": [0] } },
  "integrity": { "algorithm": "SHA-256", "canonicalization": "sorted-json-v1", "digest": "..." }
}
```

规范化 = 键排序、数组保序、无空白，Node 与浏览器结果一致，检查点哈希可移植。

## 持久化边界（未决）

城市存档放 IndexedDB 的哪个位置尚未决定。它不得静默复用 GPL Micropolis 的
`cities` store——该 store 属于另一产品线，Bonsai 路径必须保持来源洁净。
选项是独立 store（属于“先问再改”的边界变更）或 project-scoped 城市记录；
决定留给后续阶段。
