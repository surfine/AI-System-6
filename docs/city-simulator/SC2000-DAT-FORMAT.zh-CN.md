# SC2000.DAT 容器 —— 研究记录

<!-- canonical-source: docs/city-simulator/SC2000-DAT-FORMAT.md -->
<!-- source-sha256: 7b7cf96775a70cb192aee3b17d93859e9751723f2048006996a4431fe62293ec -->

> 英文版为准 ・ 仅供人类参考

盆景城市参考景观的固定研究记录。本文件不是规范，除
`apps/desktop/app/features/bonsai-sc2000-reader.js` 中的独立措辞读取器外，
本文件中的任何内容都不是实现模板。

## 基线

- 经典（MS-DOS）SimCity 2000 的数据集中在一个容器 `SC2000.DAT` 中。紧凑的
  2 MB 包（SC2000_2Mb）也使用同一容器布局。
- 可归因的公开格式事实：
  - Krusher，《Taking Sim City 2000 into pieces》（2017），CC BY-SA：
    记录了 16 字节目录记录与文件类型集合。
  - C. Cawley，《Sim City 2000 SC2000.DAT unpacker》（QuickBMS 脚本）：
    独立确认目录计数推导与文件定界方式。
- Windows 95 版本使用不同的美术容器（`LARGE.DAT`）与主调色板/精灵表
  （`PAL_MSTR.BMP`）。两者都位于 Windows 95 光盘的
  `SC2K/DATA/LARGE.DAT` 与 `SC2K/BITMAPS/PAL_MSTR.BMP`，由下面的精灵文件
  事实覆盖。

## 容器事实

1. 无全局头。从字节 0 开始是 16 字节记录的目录。
2. 每条记录：
   - 字节 0–11：文件名，MS-DOS 8.3 约定，NUL 填充；
   - 字节 12–15：小端 uint32，指向该条目首字节的偏移。
3. 目录恰好占用 `firstOffset` 字节（首条记录的偏移等于目录长度，每条记录
   16 字节）。
4. 文件大小为当前偏移到下一条目偏移的间隔；最后一条目延伸到文件尾。名字可
   重复，指向同一区域。
5. 检视包中出现的成员类型：`*.RAW`（无头索引图像数据）、`*.DAT`（嵌套
   存档）、`*.HED`（逐图块索引）、`*.VOC`（声音）、`*.XMI`（音乐）与无扩展
   名的 `TXT*` 文本记录。

## 可采纳的内容

只有上述布局事实（以我们自己的措辞记录）与极小的独立读取器。任何成员文件
内容——调色板字节、图块字节、音频或文本——都不会被复制、变换或提交到本
仓库。读取器只用合成容器测试。

## Windows 95 精灵文件（`LARGE.DAT`、`SMALLMED.DAT`、`SPECIAL.DAT`）

2026-09-04 对照光盘副本核实的干净房间事实，与 OpenCity2k/SC2k-docs 精灵
规范（CC BY-SA 4.0）一致：

1. 文件为大端。字节 0 为 2 字节精灵计数；头部随后携带等量 10 字节记录：
   精灵 id（2B）、绝对块偏移（4B）、高度 px（2B）、宽度 px（2B）。头部长 =
   2 + 计数 × 10，首条记录偏移恰等于该长度。
2. 精灵数据是 2 字节（count, mode）对的序列。mode 1 开始新行；mode 2 结束
   精灵；mode 3 跳过 `count` 个透明像素；mode 4 写入 `count` 个调色板索引
   像素（奇数段带 1 字节填充）；mode 0 忽略。
3. 调色板索引寻址 `PAL_MSTR.BMP` 中的 16×16 颜色网格：高半字节选行、低半
   字节选列。
4. 验证：解析光盘 `LARGE.DAT`（681 180 字节）得 501 条记录，偏移严格递增；
   499 个精灵解码出非空行；最后一条恰在 EOF 结束。

独立读取器 `bonsai-large-dat-reader.js` 实现事实 1-2，只用合成文件测试。

## 边界

- 读取器与本记录留在 MIT-clean 的 Bonsai 路径中，因为它们不携带任何
  Maxis/EA 表达。
- `SC2000.DAT`、`LARGE.DAT`、`PAL_MSTR.BMP` 及其成员始终只是运行时参考
  材料；绝不提交或打包。
