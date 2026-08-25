<!-- canonical-source: docs/city-simulator/ARCHITECTURE.md -->
<!-- source-sha256: 10dac20e19964a18f1b8d83aed237c05adb36a72afaf594c4679c453ee65b5e0 -->

> 英文版为准 ・ 仅供人类参考

# 盆景城市架构

## 三层边界

```text
AI System 6 外壳  —— 生命周期、窗口、状态栏、i18n、持久化适配器
        │ 拥有节奏与种子生成
        ▼
渲染 + 输入  —— 只消费快照/事件；只发出命令
        │ 不持有模拟状态
        ▼
模拟核心  —— 规则、tick、PRNG、命令、事件、存档编解码
```

### 模拟核心

核心拥有唯一权威城市状态，且无头：不依赖 DOM、canvas、`window`、
IndexedDB、翻译表、墙钟、定时器或 `Math.random()`。它以经典脚本安装
`window.AISystem6BonsaiSim`，暴露 `createCity`、`advanceTicks`、
`applyTool`、`tileInfo`、`ensureDerived`、`dateOf`、`drainNotices`、
`serialize`、`deserialize`。

### 渲染与输入

纯投影模块为 `bonsai-renderer.js`，正式视觉由
`bonsai-renderer-canvas.js` 拥有。纯模块保留 48x24 的 2:1 投影、逆向拾取、
四个 90° 变换、可见对角线范围和确定性多格画家序，作为可在 VM 中测试的
视图数学。Canvas 渲染器消费 `buildRenderSnapshot`，绘制六个同尺寸层：地形；
交通/公用事业/区域；建筑/树；代理/效果；选择/预览/错误；昼夜光照。静态内容
使用 16x16 离屏分块缓存。渲染器只读快照——指针、键盘、触摸只产生预览或
命令，绝不直接改状态。相机与光照不进城市存档；绘制绝不推进规则。

### AI System 6 外壳

外壳负责窗口、MultiFinder 身份、菜单、状态栏、i18n、懒加载、生命周期、
Working Session 与持久化适配器。它用 `crypto.getRandomValues` 生成种子并
控制 tick 节奏。

## 确定性契约

- **tick 模型。** 核心只推进整数 tick（`advanceTicks(state, count)`）；每五个
  tick 为一个游戏日，外壳按逻辑 20 Hz 节奏调度。速度档缩放每帧 tick 数，
  绝不按墙钟补算。
- **种子。** 外壳在 `createCity` 时提供整数种子。缺失或非整数种子抛出
  `bonsai-required-seed`；核心绝不自行产生随机性。
- **PRNG。** `mulberry32-v1`，32 位状态，随存档序列化。只使用整数运算
  （`Math.imul`、位运算）与定义良好的 IEEE-754 数学，因此在 Node 与浏览器
  中确定一致。
- **稳定遍历。** 每条规则按固定顺序遍历数组；对象键遍历不影响结果。
- **检查点。** Phase 1 提供 canonical 序列化（`canonicalStringify`）与内核级
  检查点：对规范化 JSON 取 SHA-256。相同种子、规则版本与命令序列在 Node 与
  浏览器必须产生相同哈希。Phase 2 把该摘要包进取档信封的完整性记录。

## 命令

```json
{ "schemaVersion": 1, "type": "road", "payload": { "x": 5, "y": 8 }, "targetTick": 120, "clientCommandId": "c-1" }
```

Schema v2 增加原子的 `build-path`、`zone-area`、`place-facility`、
`terraform-area`、`demolish-area` 与 `set-policy` 事务。纯
`previewCommand` 与会改状态的 `submitCommand` 共用验证器，因此拖拽预览不会
在边界、地形、占用、连通或费用上与提交结果分叉。接受命令只分配一个
sequence 与一个 transaction id；拒绝命令二者都不占、不收费，检查点不变。
未来命令仍按 `(targetTick, sequence)` 排序。

## 事件

```json
{ "schemaVersion": 2, "tick": 120, "sequence": 41, "type": "milestone", "payload": { "threshold": 250 } }
```

Schema v2 事件是已提交的领域事实：不携带 DOM 引用、翻译字符串或墙钟
时间。外壳用 `drainEvents` 取出；它们由模拟派生且从不持久化。UI 在渲染时
本地化。

## 存档格式

见 [SAVE-FORMAT.md](SAVE-FORMAT.zh-CN.md)。格式/规则集 v2 保存 64/96
地图几何与全部耐久独立层；派生网络、覆盖、计数、代理和渲染缓存加载时重建。
纯 v1→v2 迁移把旧日 tick 乘以五，以保留日期。

## 外壳契约

已注册窗口契约：

| 决定 | 值 |
| --- | --- |
| 对象角色 | `creative-lab` |
| 路由 | summoned |
| 文档模型 | SDI |
| 状态模型 | `specialized` |
| 状态布局 | `task-specific` |
| 响应式模型 | `immersive` |
| 工作区 | shared（不属于 Writing Studio） |
| 启动 | 仅 Applications → Games |

状态优先级：(1) 保存/加载/迁移/失败的确认回执；(2) 城市身份与 dirty 状态；
(3) 模拟时间、速度与次要指标。窄屏把次要命令折入 `Commands…`；进行中的
回执绝不消失。

### 生命周期

```text
load → attach（幂等）→ activate/resume
     → suspend(reason) → beforeClose → close/quit
```

- 只有窗口可见、未 app-hidden、未折叠、文档可见且用户按下 Play 时才推进 tick。
- 暂停绝不按墙钟补算遗漏 tick。
- `close/quit` 停止 timer/RAF、释放输入捕获；dirty 时执行 Save/Discard/Cancel。
  只有 IndexedDB transaction 确认后才显示 `Saved`。
- Working Session 只保存窗口框架、相机、选择、面板状态与最近城市 id，绝不
  保存城市本体。恢复时先验证/迁移存档并保持暂停。

### i18n

动态 UI 保存语义键而非翻译字符串。英文与简中键同一变更提交；语言切换调用
已加载模块的幂等 render。高频模拟指标绝不反复触发 `aria-live`。

## Phase 0 不包含

不注册窗口、不加入 runtime/style manifest 项、不改 IndexedDB schema、不加
npm 依赖、不加运行时资产、不加 `.SC2` fixture、不在原创路径加入游戏代码。
基础测试强制执行以上边界。
