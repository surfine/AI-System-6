<!-- canonical-source: docs/city-simulator/ISOCITY-RESEARCH.md -->
<!-- source-sha256: 63c3c21bb4e66646a1791bdc7b15a8aab1cb9ebfac75a46842228cfe4a26099f -->

> 英文版为准 ・ 仅供人类参考

# IsoCity 研究笔记

原创城市模拟器参考格局的钉死研究记录。本文件不是规范，其中任何内容都不是
实现模板。它记录 MIT 许可的 IsoCity 项目展示了什么，以及 Bonsai 路径的边界
在哪里。

## 基线

- 仓库：`amilich/isometric-city`（IsoCity）
  - 许可：MIT（© 2025 amilich）
  - 技术栈：纯 Canvas 2D 等距城市建造器（无 WebGL，本项目中也不引入 Next.js）
  - 展示的思路：画家序深度排序、分层 canvas 精灵、逐瓦片 RCI 分区与成长、
    一套经济系统、车辆/行人交通，以及多个已保存城市。

## 可采用（仅公开思路，独立措辞）

- 模拟模型与绘制分离；渲染器消费只读快照，而不是拥有可变城市单元。
- 按深度对可绘制对象排序，让更高的精灵遮挡其后方的瓦片。
- 将分区表示为随阶段缩放的建筑、道路作为独立层，使成长与交通一眼可读。
- 把交通当作由模拟拥堵数据派生的可见 agent/装饰，而不是第二份事实源。

## 不采用

- 不复制或移植 IsoCity 的确切代码、文件结构与标识符。Bonsai 偏好自己的
  第一性原理实现，也不引入 Next.js。
- 不从 IsoCity 导入任何资产；体素图集为原创。

## 规则

- MIT 许可允许研究并独立重新实现，但 Bonsai 路径保持原创且 MIT 干净。
  引用思路，不复制代码。
- 已记录决定落到 `foundation-contract.json` 与作用域 `AGENTS.md`；实现文件中
  不保留 IsoCity 事实的私有副本。
