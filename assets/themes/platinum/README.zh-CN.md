<!-- canonical-source: assets/themes/platinum/README.md -->
<!-- source-sha256: 583f971d9fca3b37d8e21765751573cfcbc09f0388ce2ccfdaa231ea11df9578 -->

# Platinum Theme Lab 绘制资产

英文版为准。本文档仅供人类参考，不被任何脚本读取。

这些小型 SVG painter 是 AI System 6 的原创资产。它们的调色板、像素网格和
对象比例依据 `DESIGN.md` 所列的 Mac OS 9 Finder、打开对话框和警告框截图
校准，并非 Apple resource fork 图稿的复制品。

这些 painter 有意仅用于 Theme Lab 取证界面。应用图标继续保留现有语义 ID
和共享 DOM。

## Fixture 取证与授权边界

选中 checkbox 的 overlay 以 canonical
`checkbox-checked-reference.png` tile 的原生 1× 像素为测量依据。12×12
painter 以离散矩形记录 9×8 checkmark 像素段和两个浅色角点修复；其中不含
任何 raster payload 或截图裁片。

选中 tab 的左右 painter 以 canonical `selected-tab-reference.png` tile
的原生 1× 像素为测量依据。每个 14×24 SVG 只用整数矩形重建固定 bevel
边缘。中心标签与来源像素没有被嵌入、裁切、描摹或再分发；左切片中与标签
相接的三个像素被有意排除，并恢复为测得的内部填充。可拉伸中心应使用五段
纵向填充：第 0 行 `#ddd`、第 1 行 `#000`、第 2 行 `#ccc`、第 3 行
`#fff`，以及第 4–23 行 `#eee`。选中 tab 与活动 panel 直接连通，因此
底部没有横向边线。

32px Calculator painter 依据 GUIdebook Mac OS 9 图库中原生尺寸的
Calculator 警告框校准。参考图在 32px 图标槽中占据 21×32 像素。该文件
保留此比例、显示区与按键层级，以及 Platinum 灰／淡紫调色板，同时把外壳
和按键网格重绘为 AI System 6 自有资产。

13 个 Apple menu painter 依据图库中宽 199px 的 menu capture 测量。
它们保留各行的语义轮廓、16px 密度、硬像素网格和该时代的有限调色板；
这些是原创的简化 painter，并非 Apple resource-fork bitmap 的逐像素转录。
五个 Open list 文件有意共享一个 painter，因为原生尺寸的 Open panel
参考图中五行明显使用相同的应用列表轮廓。

本地测量来源保存在已忽略的 `drafts/` 下，绝不会作为产品资产再分发：

- `drafts/theme-lab-fidelity/platinum/tiles/checkbox-checked-reference.png`
- `drafts/theme-lab-fidelity/platinum/tiles/selected-tab-reference.png`
- `drafts/theme-lab-fidelity-cache/platinum/guidebook-about-application-macos90.png`
- `drafts/theme-lab-fidelity/platinum/tiles/apple-menu-reference.png`
- `drafts/theme-lab-fidelity-cache/platinum/guidebook-openfile-macos90.png`

公开参考页：<https://guidebookgallery.org/screenshots/macos90>

此目录中的所有 SVG 都是项目自有的测量重绘。它们只使用透明 vector
rectangle，不含 embedded image、data URI、traced path、抽取的 Apple
resource 或再分发的 Apple 字体。
