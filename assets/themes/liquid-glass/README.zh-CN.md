# Liquid Glass 图标家族

本目录收录 AI System 6 里 54 个语义对象的原创 Liquid Glass 外观。`scripts/build-era-icons.mjs` 会分别生成 128、64、32、16 像素版本；运行时使用 32 像素 SVG，Theme Lab 同时展示经过单独删减的 16 像素提示图。

制作遵循苹果当前指南的四条原则：先确定简单、易记的对象隐喻；控制清晰的图层数量；让反光、半透明、折射提示和阴影属于图标自身的图层；在每一种显示尺寸下检查。只有真正属于应用画布的对象才可以使用受限容器；文件夹、文稿、磁盘、工具与媒体继续保留各自轮廓。主题样式不会在整套图标背后追加统一的玻璃圆角方块。

参考账本与验收标准见 `../era-icon-reference.json`。运行时映射见 `liquid-glass-icon-manifest.json`，完整尺寸账本见 `liquid-glass-icon-family.json`。

官方设计依据：

- https://developer.apple.com/icon-composer/
- https://developer.apple.com/design/human-interface-guidelines/app-icons/
- https://developer.apple.com/videos/play/wwdc2025/361/
- https://developer.apple.com/design/human-interface-guidelines/materials

交付图形全部为原创 SVG 构造。Apple 截图与设计资源只作证据，不在本目录中嵌入、裁切、描摹或再分发。
