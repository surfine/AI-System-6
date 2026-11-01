<!-- canonical-source: apps/desktop/app/vendor/micropolis/NOTICE.md -->
<!-- source-sha256: cf0f6c280e4dddb9fff473441dac3980912caef23c714c6773e53d932eca9499 -->

# Micropolis 引擎第三方声明

> 中文参考版。英文版为准；本文件仅供人类参考。

- 上游项目：https://github.com/graememcc/micropolisJS
- 固定提交：f13a1624d111d235e804bd80f48ba7c9f66a8e0f
- 构建：`npm run build:micropolis-vendor`（esbuild IIFE、未压缩、仅包含引擎模块）
- 入口：`tooling/vendor/micropolis-engine-entry.mjs`
- 已排除的上游模块（界面、文字、存储）：game、splashScreen、splashCanvas、
  infoBar、inputStatus、notification、rci、queryTool、text、storage、monsterTV、
  所有 `*Window.js`，以及 data-URI 图块集。
- 高清适配（AI System 6）：`tooling/vendor/micropolis-hd-patch.mjs` 在打包时
  修补 TileSet 与 GameCanvas，使整数倍高清图集渲染到按倍率放大的背衬画布；
  逻辑 16px 图块与全部对外坐标接口保持不变。本目录内的 @2x 图集由
  `npm run build:micropolis-hd` 从上游 1x 原图确定性生成（详见该脚本头部）。
- 缺陷修复（AI System 6）：上游 simulation.js 第 9 相位人口普查以未声明的
  裸标识符 `budget` 调用 `take10Census`，首次普查即抛出 ReferenceError 并使
  调用方的动画循环静默停止；打包时修补为 `this.budget`。
- 可播种随机源（AI System 6）：random.ts 经可替换的随机源取数
  （`Random.setRandomSource`），地形与剧本地图可由种子复现；传 null
  恢复 Math.random。
- 音效转发（AI System 6）：spriteManager.js 把精灵的音效提示（爆炸、鸣笛、
  怪兽、拥堵）转发给管理器的监听者，外壳的合成音效才听得到。
- 缺陷修复（AI System 6）：traffic.js 仍在调用 position.ts 已经取消的复制
  构造 `new Position(另一个位置)`，并从一个任何作用域都没有的 `pos` 起步；
  行驶位置从来就不是真实坐标，于是任何城市都找不到一条通勤路线，交通密度图
  永远为空。打包时改为按坐标复制，并从 `drivePos` 起步。
- 缺陷修复（AI System 6）：blockMapUtils.js 的 crimeScan 读取 BlockMap 的
  `mapWidth`／`mapHeight`，而 BlockMap 提供的是 `gameMapWidth`／
  `gameMapHeight`；循环边界为 undefined，扫描从未执行，任何城市的
  `census.crimeAverage` 都是 0。打包时修正字段名。
- 许可：GNU GPL v3 及附加条款——详见本目录内 LICENSE 与 COPYING。
- 名称／用语「MICROPOLIS」是 Micropolis GmbH 的注册商标；商标所有者出于善意，
  许可 Micropolis 项目使用。
- AI System 6 外壳代码（`app/features/micropolis.js`）及全部界面文字均为
  AI System 6 原创，不衍生自上游 `text.js`。
