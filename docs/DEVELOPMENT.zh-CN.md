<!-- canonical-source: docs/DEVELOPMENT.md -->
<!-- source-sha256: 10913c71abbd3d2b07503b6a5aa0d17d76432bedc2f5dc590f73abd1035c6ece -->

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
| `npm run test:e2e:smoke` | 在 Chromium 与 WebKit 中运行启动、持久化及双窗口 smoke |
| `npm run verify:version` | 检查 package、构建、运行时与 Release 身份 |
| `npm run verify:checkjs` | 类型检查带注解的前端 JavaScript |
| `npm run verify:src` | 类型检查规范 Node 服务端 |
| `npm run verify:public-tree` | 验证命令、必需文件、资产预算、文档与 CI |
| `npm run verify:public` | `verify:public-tree` 的兼容别名 |
| `npm run test:e2e` | 运行扩展 Playwright 诊断 |

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

## Pull request 循环

1. 复现问题并定义拥有它的契约。
2. 完成最小且完整的源码改动。
3. 新增或更新功能契约。
4. 通过文档命令重建生成产物。
5. 先运行目标检查，再跑完整公开 CI 序列。
6. 在 pull request 说明风险、验证与视觉证据。

社区与审查要求见 [CONTRIBUTING.zh-CN.md](../CONTRIBUTING.zh-CN.md)。
