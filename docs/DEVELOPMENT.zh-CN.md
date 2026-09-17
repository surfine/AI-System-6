<!-- canonical-source: docs/DEVELOPMENT.md -->
<!-- source-sha256: 9bbcb15ae2bd44967a2fae031f78e5459cefbc8d7e8fa36e8cddbca8331b0f76 -->

> 英文版为准 ・ 仅供人类参考

# 开发指南

本文描述受支持的公开源码工作流。产品与交互规则见
[架构](ARCHITECTURE.zh-CN.md)和[设计契约](design/DESIGN.zh-CN.md)。

## 环境要求

- Node.js 24 或更新版本
- 与 Node.js 配套的 npm
- 现代 Chromium、Firefox 或 Safari 浏览器
- 可选：用于本地模型测试的 LM Studio 或 Ollama

## 设置

```bash
git clone https://github.com/surfine/AI-System-6.git
cd AI-System-6
npm ci
npm start
```

打开 [http://localhost:4173](http://localhost:4173)。`npm start` 会在启动服务前重建
浏览器 bundle。

## 支持命令

| 命令 | 契约 |
| --- | --- |
| `npm start` | 构建并在 4173 端口提供桌面 |
| `npm run build` | 生成确定性的浏览器 bundle |
| `npm test` | 可执行功能契约的兼容别名 |
| `npm run lint` | 检查本轮加固的服务端与集成测试边界 |
| `npm run verify:contracts` | 运行源码与架构契约 |
| `npm run test:unit` | 运行加固边界的重点行为测试 |
| `npm run test:integration` | 使用本地假上游运行路由集成测试 |
| `npm run test:static-smoke` | 从静态文件服务在 Chromium 与 WebKit 中启动桌面（启动、持久化、双窗口） |
| `npm run verify:version` | 检查 package、构建、运行时与 Release 身份 |
| `npm run verify:checkjs` | 类型检查带注解的前端 JavaScript |
| `npm run verify:src` | 类型检查规范 Node 服务端 |
| `npm run verify:public-tree` | 验证命令、必需文件、资产预算、文档与 CI |
| `npm run verify:public` | `verify:public-tree` 的兼容别名 |
| `node tooling/preview-translation-pad.mjs` | 在真实浏览器里预览单个组件：出厂的 Translation Pad、出厂的标记，以及按需返回的翻译 | 秒级 |

同一个运行器有多个名字：`npm test`、`npm run verify:contracts` 与 `npm run verify:features` 都执行
`tooling/verify-features.mjs`，`verify:feature` 是它针对单个名字的形式；同时跑两个等于把同一批契约跑两遍，
选一个即可。`verify:public` 是 `verify:public-tree` 的别名。

CI 会按锁文件安装依赖、执行 lint 与构建，运行契约、重点单测和使用假上游的集成测试，
再检查版本、checkJs、服务端类型、文档和公开文件树，并在独立的 Chromium 与 WebKit job
中执行 smoke。维护者源树还会在临时目录生成干净公开快照，并在其中真实执行 `npm ci`、
`npm run build` 与 `npm test`。

## 编辑浏览器运行时

源码位于 `apps/desktop/app/` 与 `apps/desktop/app.js` 入口。浏览器读取生成的
`apps/desktop/app.bundle.js`，所以修改
浏览器源码后必须重建。不要手改生成 bundle。

功能模块应位于拥有它的应用或共享服务之后。跨多个应用的修复通常属于
`apps/desktop/app/core/`；局部工作流应留在 `apps/desktop/app/features/`。

## 编辑样式或外观

样式按职责拆分在 `apps/desktop/styles/`。改视觉表面前，应找出基础规则、响应式规则、外观覆盖与
参与最终结果的内联布局。验证 System 6 与 Liquid Glass，并在 pull request 附上前后
证据。

经典 UI 与图标从原始资源或观察到的模拟器行为出发。保留 1-bit 像素图与刻意不同的
家族尺寸。现代 SVG 适合现代外观家族，不应用来取代已知经典图形。

## 测试

`tests/features/` 中的功能测试是轻量、可执行的契约。若 bug 暴露了缺失不变量，或功能
建立了新边界，就应增加测试。优先测试可观察结构或行为，而不是实现文字。

Chromium 与 WebKit smoke 是发布条件。更广泛的 Playwright 测试仍为诊断，任何浏览器探针
都不能取代确定性产品契约。

## 资产与生成文件

运行时图标家族、字体、OCR 载荷与模型资产位于 `apps/desktop/assets/`。公开仓库包含产品真正加载
的文件；重复的 accepted-source 图片档案与内部 proof board 留在维护者源码中，公开
命令不依赖它们。

不要把重型资产加入启动路径。新的懒加载载荷必须有明确消费者与验证路径。

## 文档

英文 Markdown 是规范源。每份规范文件都有 `.zh-CN.md` 参考镜像，头部记录来源路径
与 SHA-256。规范文本改变时，应在同一贡献中更新镜像及其哈希。

README 聚焦产品价值与第一次成功运行。持久技术细节放在本文或
[架构](ARCHITECTURE.zh-CN.md)。

## 编写一个应用

应用只注册一次、自己拥有内容区域，并且在真正被销毁时把资源还回去。它对接的接口
刻意保持很少；下面的例子就是 ClioPaint 与译文板实际使用的那套。

- **注册**：`AISystem6Runtime.registerApplication({ id, windowName, mount, restore, commands })`。
  注册是全有或全无：缺少 id、`mount` 不是函数、命令没有 handler，都会在写入注册表
  之前被拒绝，因此不会留下半个应用。懒命令（`registerLazyCommand`）可以把自己的
  id 交给真正的命令一次。并发调用 `mountApplication(id)` 会共享同一次初始化，并且
  只有初始化完成后才收到成功。
- **让一个入口负责打开对象**：`AISystem6ApplicationRegistry.openProjectObject(id, intent)`
  会在动作真正执行的位置重新解析 id；`applicationObjectAvailability(id, intent, appId?)`
  则是菜单、工具栏与快捷键在绘制时可以问的廉价、无副作用判断。一秒钟前画出的行
  可能指向另一个窗口刚删掉的文件，所以这两个问题由同一个解析器回答，动作执行前
  再复核一次。
- **命令带着自己的原因**：注册时提供 `{ handler, isAvailable, unavailableReason }`。
  `AISystem6Runtime.commandAvailability(id, payload)` 返回 `{ available, reason }`，
  `dispatchCommand` 在不可用时也返回同一个原因，而不是空的拒绝。handler 返回
  `{ ok: false }` 属于业务失败，绝不上报成成功。
- **窗口与生命周期**：隐藏或 WindowShade 会保留状态；`dispose` 只用于真正的销毁。
  `AISystem6InstanceResources.create(name)` 收集监听器（`listen`）、计时器（`timeout`）
  与其他清理；它的 `dispose()` 只执行一次，某个清理抛错不会影响其余清理，下一次
  挂载会得到全新的登记表。注册渲染任务时带上所属窗口——
  `registerRenderTask(name, handler, { windowName })`——这样隐藏窗口会保留待刷新
  标记，等重新显示时再绘制。
- **读状态，不复制状态**：`AISystem6StateStores.watch(store, select, { immediate, isEqual })`
  只观察某个 store 的一个切片，把选出的值连同产生它的那次变更交给监听者，并返回
  store 自己的取消订阅函数。不要保留第二份可写的项目数据，也不要为了让控件保持
  刷新而在每次输入事件里写盘。
- **答案会迟到**：带上开始工作时就确定的对象身份（项目 id、对象 id、运行 id），
  应用之前再复核一次。图片换了、译文板已经翻页、或者作者换了项目，答案就不显示；
  运行回执仍然把它记录下来。
- **写入者要说明自己改了什么**：改动了桌面已经持有的记录之后，调用
  `markDeskDirty(kind, id)`（删除用 `markDeskDeleted`）。保存计划只搬运写入者
  报备过的记录，其余记录才逐个比对指纹；在受信集合上保持沉默的写入者，下一次保存
  就会丢掉这次编辑。

  `chatFiles`、`chatFolders`、`scraps`、`trash`、`imageAttachments` 已在受信列表上：
  只有当 `tests/e2e/scan-shadow.spec.mjs` 的对照证明该集合的写入者都会报备，并且同一轮
  结尾那次"故意不报备的编辑"仍然被抓到，集合才会加入。`projects` 不在列表上——大纲提炼、
  DocMap、词典和 Finder 标签仍在原地写这条记录——所以它保持全量扫描，未报备的编辑在那里
  依然会被抓住。仪器把两种情况分开命名：受信集合上的漏报是回归，其余地方的漏报是迁移清单
  （`notYetMigrated`）。

### 两个试点的维护成本

下表是在这两个真实应用上量出来的，方便下一个人区分"回归"和"四舍五入"。计数来自
源文件；字节是首次打开真正请求的量。

| | ClioPaint | Translation Pad |
| --- | --- | --- |
| 跨应用 DOM 查询（`document.querySelector` / `getElementById`） | 17 → 5 | 0 |
| 剩下那 5 处在找什么 | 自己窗口的根节点，以及"哪个窗口在最前" | 不适用 |
| 生命周期：监听器、计时器与清理 | `AISystem6InstanceResources.create("clioPaint")`，`dispose()`，诊断用 `resourceCount()` | 相同，`create("translationPad")` |
| 首次打开：脚本 | 50,711 B | 11,524 B |
| 首次打开：样式 | 3,009 B | 无 |
| 首次打开：本机开发服务器上的网络耗时 | 脚本约 20 ms、样式约 20 ms | 约 4 ms |

给任一试点加一个动作只动一个文件：命令声明在该应用自己的
`registerApplication({ commands })` 里，可用性来自菜单绘制时用的同一个解析器。
改关闭行为则是"应用自己的内容一个文件"，外加"如果改的是框架默认关闭行为，才动
`window-manager.js`"——这正是这套框架要守住的分工。

启动侧不受应用工作影响：桌面发布的是 `app.bundle.js`（1,959,019 B）与
`styles.bundle.css`（728,131 B），整个 core 的 Floppy 预算为 2,954,112 B。
开发用仪器不进入这份载荷——例如保存计划影子对照就以懒加载文件发布，由使用它的
检查自己加载（`app/core/persistence-scan-shadow.js`）。

### 兼容别名

为仍在读它们的消费者保留。每条都写明消费者与退出条件。（`AISystem6Runtime.c`
与 `AISystem6Runtime.lazyCommands` 原本列在这里；现在所有消费者都改读
`listCommands`、`listLazyCommands`、`forEachCommand`、`getCommand` 或
`getLazyCommand`，注册表本身不再对外交出。）

这份清单现在是空的。只有仍被读取的别名才配占一行：写清消费者，以及什么条件下可以删；
别名删掉时，这一行也跟着删。`setMirroredEditorValue` 是最后一条——应用里没有任何调用点，
按名字抽取它的外部审查脚本也已不再使用，而它旁边那条保证（镜像消息永不覆盖本地未保存的编辑）
由记录馈送路径持有。

## Pull request 循环

1. 复现问题并定义拥有它的契约。
2. 完成最小且完整的源码改动。
3. 新增或更新功能契约。
4. 通过文档命令重建生成产物。
5. 针对改动运行目标检查（`npm run verify:quick -- --file <path>`）。完整公开 CI 序列在 CI 与发版前运行，
   不是每次目标检查之后都要跑一遍。
6. 在 pull request 说明风险、验证与视觉证据。

社区与审查要求见 [CONTRIBUTING.zh-CN.md](../CONTRIBUTING.zh-CN.md)。
