<!-- canonical-source: assets/themes/classic/README.md -->
<!-- source-sha256: 020b6fdf226a66b3a89b233a6ee1d160cd46ab69cb5506ee278f279604c065a9 -->

# Classic（System 6）主题资产

英文版为准。本文档仅供人类参考，不被任何脚本读取。

System 6 外观刻意几乎不持有栅格或矢量资产：其图标是在
`app/core/system-icons.js` 中定义的内联 1-bit SVG 路径，依据随项目提供的
System 6.0.8 磁盘映像资源分支进行无损编码（例如 Startup Device ICN# -4064、
Finder ICN# 129、Trash ICN# 130/134）。这样可以精确保留默认主题的像素网格、
1-bit 反色规则与字形尺寸关系，同时避免拉伸或重采样栅格文件。

本目录内容：

- `icons/reference/`：供代理复刻 Classic 对象时使用的原生系统检查裁片。
  这些文件是参考材料，不是产品运行时资产；产品实际发布的是
  `app/core/system-icons.js` 中的 SVG 编码。

版权边界：SVG 路径是对所观察 System 6 资源像素进行的无损 `currentColor`
编码（项目依据为研究而保存并获许可使用的模拟器磁盘映像，对历史系统图稿
进行的自有重建）。产品资产不再分发 Apple 字体二进制、栅格裁片或资源分支。
Classic Plus 变体及未来任何 Classic 时代的 painter 均遵循同一规则：编码
实测像素，绝不发布抽取的 Apple 文件。
