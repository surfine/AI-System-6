<!-- canonical-source: CONTRIBUTING.md -->
<!-- source-sha256: df6feff22327ac823cdddadef61efc08d4d7a1281ff8ee4f44775d15502f382a -->

> 英文版为准 ・ 仅供人类参考

# 参与 AI System 6

感谢你帮助我们构建一台让 AI 工作始终可见的电脑。AI System 6 重视聚焦的改动、
历史证据、可执行契约，以及在压力下依然安静的界面。

## 开始改动前

1. 搜索已有 issue 与 pull request。
2. 在实时桌面上复现行为。
3. 报告 bug 时，记录外观、浏览器或 Mac 版本、准确路径，以及预期与实际结果。
4. 新功能或重大交互请先开 issue，再投入大型实现。

安全问题请遵循 [SECURITY.zh-CN.md](SECURITY.zh-CN.md)，不要进入公开 issue。

## 本地设置

使用 Node.js 20 或更新版本。

```bash
git clone https://github.com/surfine/AI-System-6.git
cd AI-System-6
npm ci
npm start
```

应用位于 [http://localhost:4173](http://localhost:4173)。没有 AI 提供商也能运行；
模型相关改动可稍后通过「控制面板」测试。

## 仓库地图

| 路径 | 职责 |
| --- | --- |
| `apps/desktop/` | 完整浏览器产品：入口、应用、样式、数据与资产 |
| `apps/server/` | 无状态 Node.js 服务与提供商适配器 |
| `site/` | 可独立部署的产品官网 |
| `platform/` | macOS 原生实现、WebView 壳与 Web 发布契约 |
| `tooling/` | 确定性构建、验证与发布工具 |
| `tests/` | 可执行的产品与架构契约 |
| `docs/` | 公开架构、开发与设计证据 |
| `internal/` | 维护者证据、实验、归档与 vendored 源 |

改变边界前请阅读[架构](docs/ARCHITECTURE.zh-CN.md)，命令约定见
[开发指南](docs/DEVELOPMENT.zh-CN.md)。

## 改动纪律

- 每个 pull request 聚焦一个产品契约。
- 行为改变时新增或更新可执行功能测试。
- 通过文档中的命令重建浏览器产物，不手改生成 bundle。
- 保持本地优先，不把提供商凭证写进项目、对话、备份或导出。
- 未经接受的架构提案，不引入前端框架或应用数据库。
- 英文文档是规范源，同一改动中更新 `.zh-CN.md` 参考镜像。

## 视觉与图标改动

AI System 6 从证据出发，而不是从怀旧印象出发。绘制经典对象前，必须核对原始
System 6 资源或观察到的行为。不要把已知 1-bit 图形平滑成泛化矢量，不要统一本来
不同的 glyph 尺寸，也不要意外混合时代。

视觉改动应附 System 6 与 Liquid Glass 的前后截图，并解释由哪个层负责，而不是只
补局部症状。先读[设计契约](docs/design/DESIGN.zh-CN.md)与
[人机界面指南](docs/design/HIG.zh-CN.md)。

## 提交 pull request 前验证

```bash
npm run build
npm test
npm run verify:version
npm run verify:checkjs
npm run verify:public
```

迭代时运行最小相关检查，提交前再跑完整公开验证面。CI 使用 Node.js 20 执行同一序列。

## Pull request 清单

- 描述问题，以及为什么选中的边界应负责它。
- 若有 issue，请链接。
- 列出执行过的验证。
- UI 改动附上视觉证据。
- 明确用户可见、存储、安全或兼容性影响。
- 保持生成文件与文档同步。

贡献即表示你同意按项目 [MIT 许可证](LICENSE)授权，并遵循
[行为准则](CODE_OF_CONDUCT.zh-CN.md)。
