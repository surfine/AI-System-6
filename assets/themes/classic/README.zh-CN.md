<!-- canonical-source: assets/themes/classic/README.md -->
<!-- source-sha256: 936129b483e3adca60933fad71d732270b044e8e061f9e31d16e8c22b5a39ed3 -->

# Classic（System 6）主题资产

英文版为准。本文档仅供人类参考，不被任何脚本读取。

System 6 外观在 `icons/` 下持有完整的 56 对象**平滑 SVG 图标族**。凡原系统
存在直接对应对象，均以真实 System 6.0.8 资源确定轮廓、比例与选中行为
（例如 Startup Device、Finder 磁盘、文件夹、文档、应用程序与废纸篓）。
产品专属对象沿用同一套克制的黑白图形语法，并保持已锁定的产品隐喻。
运行时图稿采用平滑几何重新绘制，而非保留原始位图阶梯，因此在 Retina
屏幕上依然清晰。

每个对象均有独立微调的 32 px、16 px SVG 图稿，以及平滑的黑色选中遮罩。
Finder 选中时显示该遮罩并把同一份图稿反白，不切换到另一张“选中图标”。

本目录内容：

- `icons/<id>-32.svg` 与 `icons/<id>-16.svg`：适配 Retina 的运行时图稿。
- `icons/<id>-mask-32.svg` 与 `icons/<id>-mask-16.svg`：平滑的 Finder
  选中轮廓。
- `icons/reference/`：供复刻 Classic 对象时使用的原生系统检查裁片；
  这些文件不是运行时资产。
- `icons/classic-icon-family.json`：完整图标族的来源、隐喻、尺寸与清晰度账本。

版权边界：运行时 SVG 是项目依据保存用于研究的 System 6 映像观察结果所做的
自有几何重建。原生栅格裁片、资源分支与 Apple 字体二进制仅作为证据保留，
不会作为产品运行时资产分发。
