<!-- canonical-source: docs/city-simulator/ARCHITECTURE.md -->
<!-- source-sha256: 1bf78b6549650cc044eabb76e3dd39517215ada385095ad8bef001a45aea81e0 -->

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

Phase 4 实现为纯投影模块 `bonsai-renderer.js`，Phase 7 再由
`bonsai-renderer-voxel.js` 完成视觉替换。纯模块保留 2:1 等距投影、其逆
投影与确定性画家序，作为可在 VM 中测试的视图数学。体素渲染器消费纯
`buildRenderSnapshot`，懒加载打包后的 three.js vendor，绘制正交等距场景
（体素地形、水面、道路/电线/公园、按阶段缩放的分区建筑、树木、电厂、服务
设施、昼夜、装饰性交通）。渲染器只读快照——指针、键盘、触摸都通过
`submitCommand` 产生命令，绝不直接改状态。相机与光照是视图状态，绝不入档；
循环只绘图，不推进规则。

### AI System 6 外壳

外壳负责窗口、MultiFinder 身份、菜单、状态栏、i18n、懒加载、生命周期、
Working Session 与持久化适配器。它用 `crypto.getRandomValues` 生成种子并
控制 tick 节奏。

## 确定性契约

- **tick 模型。** 核心只推进整数 tick（`advanceTicks(state, count)`）；外壳按
  逻辑 20 Hz 节奏调度。速度档缩放每帧 tick 数，绝不按墙钟补算。
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

Phase 1 已实现。核心给每个被接受命令（即时或排队）分配单调递增 `sequence`；
被拒绝命令不消耗序号、绝不改变状态。未来定时命令进入
`(targetTick, sequence)` 有序队列，并恰好在其目标 tick 应用。外壳绝不直接
改状态——只提交命令。

## 事件

```json
{ "schemaVersion": 1, "tick": 120, "sequence": 41, "type": "milestone", "payload": { "threshold": 250 } }
```

Phase 1 已实现。事件是已提交的领域事实：不携带 DOM 引用、翻译字符串或墙钟
时间。外壳用 `drainEvents` 取出；它们由模拟派生且从不持久化。UI 在渲染时
本地化。

## 存档格式

见 [SAVE-FORMAT.md](SAVE-FORMAT.zh-CN.md)。只保存持久层；派生层
（`powered`、`roadOk`、`plantAt`、计数）加载时重建。

## 外壳契约

未来窗口契约（尚未注册）：

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
