<!-- canonical-source: docs/MAC-NOTARIZATION.md -->
<!-- source-sha256: 80a0f5f7e56c6001924ed53235058a77444aaf037c5858c7826bcbaa49ac6a0b -->

英文版为准。本文档仅供人类参考。

# Mac 公证管线

AI System 6 的 macOS beta 目前是 **ad-hoc 签名**：用户需要 Control-click →
Open，干净机器上 Gatekeeper 不会直接放行。Web 分发（URL、添加到主屏幕、
独立模式、分享、持久存储）仍是主要产品面；公证是打包里程碑，不是发布
blocker。

本文档是凭证契约与 Developer ID 签名、Hardened Runtime、公证、staple 的
可复现管线。这一切都不进入发布门禁：本机确定性门禁
（`npm run verify:ship`）才是发布依据，缺少证书绝不能阻塞 Web 发布。

## 范围

- 仅 Apple silicon、macOS 13+。
- 本里程碑不做自动更新、Sparkle、App Store / sandbox 迁移，也不做 Intel
  支持。

## 凭证输入契约

在签名机器环境中设置以下变量，绝不提交值：

| 变量 | 用途 | 示例 |
| --- | --- | --- |
| `AI_SYSTEM6_DEVELOPER_ID` | 签名 | `Developer ID Application: Aaron Lau (TEAMID1234)` |
| `AI_SYSTEM6_TEAM_ID` | 公证 | `TEAMID1234` |
| `AI_SYSTEM6_NOTARY_KEY_ID` | 公证（API key） | `ABCDEFGHIJ` |
| `AI_SYSTEM6_NOTARY_ISSUER` | 公证（API key） | `69a6de7f-...` |
| `AI_SYSTEM6_NOTARY_KEY` | 公证（API key） | `.p8` 路径或内容 |
| `AI_SYSTEM6_NOTARY_APPLE_ID` | 公证（Apple ID） | `dev@example.com` |
| `AI_SYSTEM6_NOTARY_APP_PASSWORD` | 公证（Apple ID） | 应用专用密码 |

优先使用 App Store Connect API key 而非 Apple ID + 应用专用密码：它不随
账户密码轮换，也能无头用于 CI。

## 运行

```sh
# 用 Hardened Runtime 签名并验证（凭证缺失时脚本会明确输出
# NOT EXECUTED）：
node scripts/sign-mac-app.mjs --app "dist/AI System 6.app"

# 完整管线：签名 -> codesign verify -> notarize -> staple -> spctl：
AI_SYSTEM6_DEVELOPER_ID="Developer ID Application: ..." \
AI_SYSTEM6_TEAM_ID="..." \
AI_SYSTEM6_NOTARY_KEY_ID="..." AI_SYSTEM6_NOTARY_ISSUER="..." \
AI_SYSTEM6_NOTARY_KEY="/path/to/AuthKey_XXXX.p8" \
node scripts/sign-mac-app.mjs --app "dist/AI System 6.app"
```

任何验证失败脚本都会以非零退出；凭证缺失时打印 `NOT EXECUTED: ...`——
它绝不会把未签名或未公证的包说成已公证。

## 手动验证

```sh
codesign --verify --deep --strict --verbose=2 "dist/AI System 6.app"
spctl --assess --type execute --verbose=4 "dist/AI System 6.app"
xcrun stapler validate "dist/AI System 6.app"
```

公证完成后，在干净的 macOS 13+ Apple silicon 机器上双击启动即可，无需
Control-click。在那之前，发布说明保留 ad-hoc 提示。
