<!-- canonical-source: platform/macos/tinyjs/README.md -->
<!-- source-sha256: eb3c9445bb18321af13b458040c9254b3919917c698be2450b5b7d5b50ed5a4a -->

> 英文版为准；本译文仅供人类参考，Agent 应读取英文入口。

# TinyJS macOS 壳

目标为 AI System 6 1.0.58 的完整 macOS 15+ / Apple Silicon 应用。项目数据和写作流程沿用桌面产品；保留原应用身份 `local.aisystem6.beta.shell`，由 WebKit 正常打开原存储。实施验收须证明旧项目读取、完整备份导出与恢复一致，不能仅靠身份相同宣称迁移成功；禁止直接覆盖旧 WKWebView 数据目录。独立导出／导入保留为恢复路径。

受控上游为 `vendor/tinyjs/baselines.json` 记录的 TinyJS v0.50.1。原始文件保持不变，`tooling/build-tinyjs-native.mjs` 在构建目录生成受控扩展：快捷键注册回执，以及既有 Time Machine 浏览器和下载管理器。复用 Vision helper；旧 Swift 主程序不编译、不随新包交付。

构建使用仓库固定的运行时，不读取用户的全局 TinyJS 安装：

```sh
AI_SYSTEM6_SOURCE_COMMIT="$(git rev-parse HEAD)" npm run build:app
node tooling/build-mac-server-payload.mjs
node tooling/build-tinyjs-shell-app.mjs --production --allow-adhoc --dmg
```

完整 `.app` 包含固定 Node、服务端、Web 资源、浏览器扩展、原生 helper 和产品身份。内嵌 Mach-O 从内向外签名，封包后才生成 ZIP、DMG、SHA-256 与 OTA 清单。正式发版应使用 `release:prepare` 的冻结源码和封存产物。

用户已批准 1.0.58 先公开提供 ad-hoc OTA，后补 Developer ID。此模式没有公证及同 Team-ID 绑定，首次下载须按 Gatekeeper 流程打开；不得宣称已公证。提供 Developer ID 与公证配置后，签名器走正式流程。后续正式发版默认要求正式凭据。

OTA 自动检查，由用户点击“安装并重启”。下载前保存工作并禁止新任务；模型、导入、导出及原生下载运行时延期。独立 Node worker 在应用之外验证 HTTPS、SHA-256、包签名、应用身份和平台，再替换应用。新桌面须回报启动身份和一致的持久数据指纹，之后才能清除旧包；未通过则恢复旧包。事务日志支持启动时恢复。

剪贴板默认关闭，用户主动开启后只在运行时监听；截屏 OCR、选区和剪贴板文字先作为候选编辑，归档需确认目标项目。文件只通过用户选择后的不透明标识读取，通知正文不含素材。新模型密钥由服务端存入钥匙串；旧密钥经用户确认、模型验证和钥匙串读回后才移除原值。

当前属于实施与验收中的源码。编译、合同测试和真实完整应用交互是不同证据；发布前还须完成旧数据迁移、OTA 往返及恢复、原生权限和完整封存发布门禁，不能凭上述构建命令推断全部验收完成。
