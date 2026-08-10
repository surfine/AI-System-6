<!-- canonical-source: docs/APPEARANCE-QA.md -->
<!-- source-sha256: 3a2710b8ce07e41de173b28f1c744c8e569501727ae35f41be35c55a539e2da8 -->

英文版为准。本文档仅供人类参考。

# 外观 QA 矩阵

AI System 6 正式支持的外观面为全部六套：

| 表面 | Classic / System 6 | Platinum | Aqua | Snow Leopard | Yosemite | Liquid Glass |
| --- | --- | --- | --- | --- | --- | --- |
| 启动 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Start Here | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Finder | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Applications | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Project Hard Disk | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| File Floppy | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Draft Desk | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Writing Studio | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| TeachText | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Review Desk | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| ClioTalk | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Control Panel | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 系统弹窗 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 菜单栏 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 手机布局 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

六套都是正式外观（注册表 `releaseReady: true`），在 Control Panel 的
Appearance 选择器与 Special 菜单中开放；没有任何一套被研究开关门控。四套
历史外观还须通过 `npm run verify:theme-lab:fidelity` 对已 pin 的 canonical
reference 校验。
`npm run verify:appearance-apps` 另行在六套外观下渲染 Finder、Page Setup、
TeachText、Scrapbook、Liquid Cover 与 Endfield Terminal，证明普通 App 与视觉
特殊 App 都收到同一套系统 title bar painter；这个传播检查不与像素回归或历史
fidelity 混为一谈。

每个表面的 QA 标准：无裁切、无不清晰文字、无错误对比度、无坏焦点、无错误
图标、无损坏的窗口边框。
