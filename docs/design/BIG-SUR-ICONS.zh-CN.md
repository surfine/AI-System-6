<!-- canonical-source: docs/design/BIG-SUR-ICONS.md -->
<!-- source-sha256: 0b8247871633ad4c29b929d1db5720ab0bbf0fca656f01ba031e1ba5354c51fe -->

英文版为准。本文档仅供人类参考。

# Big Sur 图标交付

Big Sur 已拥有独立的 59 个对象：原有 56 个语义 ID 加上 ClioPaint、ClioProject、One More Tune。四档 16／32／64／128 px 共 236 张透明 sRGB PNG。三款新增应用也完成 Classic、Platinum、Aqua、Snow Leopard、Yosemite、Liquid Glass 和 NeXTSTEP 版本；NeXTSTEP 的其余 56 个对象仍明确回退 Classic。

## 史实与设计边界

依据 [2020 年应用图标 HIG 存档](https://web.archive.org/web/20201223123443/https://developer.apple.com/design/human-interface-guidelines/macos/icons-and-images/app-icon) 和 [同期文档图标 HIG](https://web.archive.org/web/20201223162058/https://developer.apple.com/design/human-interface-guidelines/macos/icons-and-images/document-icons/)，应用与可启动工具使用圆角矩形主体、正面视角、协调投影和材质；工具允许伸出。文件夹保留页签，文档保留折角，硬件和废纸篓保留对象轮廓。软盘、项目介质属于明确的产品适配。

原始参照及校验值 与 史实对照图 仅作为制作证据，不随运行时发布。Big Sur 同一默认图标适配浅深背景；不把后来的 Liquid Glass 遮罩、透明和着色规则写成 2020 年规范。

[全部 59 个对象的规格](../../tooling/icon-generation/big-sur-specs.json) 与 逐项来源及审核记录 区分原生对象重绘、同期类比改编、原创设计。Finder、文件夹、通用文档、系统偏好设置已对照明确参照；这些仍是参考重绘，不宣称像素级复刻。不能证明的原生对应或历史保真状态保留 pending。三款新增应用在各时代均为原创适配，没有虚构历史原生版本。

## 制作与交付

内置图像工具逐枚制作材质母稿，提示词、修订和原件保存在制作资料目录。16／32 px 使用独立光学构图，简化细节、增强识别特征；64／128 px 从材质母稿按比例输出，不统一裁切伸出的工具。生成结果本身不是历史证据。[运行时台账](../../apps/desktop/assets/themes/big-sur/big-sur-icon-family.json) 记录文件、哈希与审核状态；[跨时代来源矩阵](../../apps/desktop/assets/themes/icon-provenance-matrix.json) 覆盖 472 格，其中 416 个独立映射、56 个明确回退。

- Big Sur 全套对照图、16／32 px 浅深底实际尺寸、三款应用八时代对照图。
- 资源检查报告：236 张全部可解码，尺寸、sRGB、透明通道、台账哈希正确，空满废纸篓及云模型在线离线在每档均可区分。
- 浏览器报告：59 个对象在八时代、1×／2×下切换，每个对象只有一个可见绘制组；刷新恢复 Big Sur 深色，离线重载可读取已缓存的全部 236 张图片。
- 官网 22 枚对应图标、网页资源清单和 macOS 打包清单已接入；母稿和参照不打入运行时，启动体积继续受既有预算和 512 字节预留约束。

构建与复验命令见英文版。本地预览：`http://127.0.0.1:4187/?appearance=big-sur`。
