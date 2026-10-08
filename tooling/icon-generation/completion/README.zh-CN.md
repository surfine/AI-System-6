<!-- canonical-source: tooling/icon-generation/completion/README.md -->
<!-- source-sha256: 89e4448d63641138c1bdf4eebbe2d841508845e37b2b0f2831489cc51b05f1fc -->

> 英文版为准；本译文仅供人类参考。

# 补齐图标的原始图像

`masters/<era>/` 中的每张生产原图均由内置 Image Gen 工具单独生成。工具不提供模型版本信息，因此项目不标注版本号。`prompts/<era>/` 保存对应生成提示词；同一图标的 `-final` 或 `-opaque` 提示词取代初稿，生成资产清单记录最终选用的提示词和原图哈希。

运行 `npm run build:completion-icons` 生成各时代所需尺寸及衍生的 System 7 图标。构建要求所有原图存在，不会用代码绘制的图案替代。Classic 使用黑白一位转换，其余系列保留彩色位图。原始图像不进入 Web 发布载荷。

## Liquid Glass

2026-10-08 核对了 Apple [App icons HIG](https://developer.apple.com/design/human-interface-guidelines/app-icons/)（2026-06-08 修订）。补齐图标遵循简单实心形状、居中内容、清晰边缘，以及默认、深色、透明外观保持一致特征的指导。深色版本降低亮度，透明版本以克制的单色处理保留相同构图。

这些是用于浏览器历史外观的扁平静态图标，不是原生 Icon Composer 包。图像不预先烘焙玻璃边框、眩光、折射、光晕、斜面或图层间阴影。Apple 原生图标提供未遮罩的图层，由系统施加遮罩与动态效果，参见 [使用 Icon Composer 创建应用图标](https://developer.apple.com/documentation/xcode/creating-your-app-icon-using-icon-composer)。
