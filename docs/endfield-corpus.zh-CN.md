<!-- canonical-source: docs/endfield-corpus.md -->
<!-- source-sha256: 0a0029250c4e6a4191b8925d6c6820e3247ef9418916a7d1d27798ab7f8aba4c -->

> 英文版为准；本译文仅供人类参考。

# 终末地语料维护

2026-10-08 的更新面向公开 Warfarin v1.5 语料，上游索引标注最后更新日期为 2026-09-24。运行时读取 `apps/desktop/data/warfarin-*` 下的五份聚合 JSON；各条目历史导出文件不是运行时输入。

[官方丹青渡研发通讯](https://www.taptap.cn/moment/856662494825941594)公布新版本于 2026-10-15 开启。前瞻不能当作已上线的剧情证据。预备记录见 endfield-danqingdu-preparation.json，不会自动启用新版本，也不会将预告混入剧情回答。

## 安全更新

每次更新使用新的暂存目录。分别运行 `scrape-warfarin-missions.mjs`、`scrape-warfarin-operator.mjs --all`、`scrape-warfarin-tutorials.mjs --all`、`scrape-warfarin-lore.mjs --all`、`scrape-warfarin-documents.mjs --all`，以 `--out <暂存目录>/<类别>` 指定输出。类别目录依次为 `missions`、`operators`、`tutorials`、`lore`、`documents`。

任务抓取器兼容中英文标题，并按场景卡片内的每个角色回合识别说话人。对话和无线电均进入运行时 transcript，无线电行带有 `channel: "radio"`。`--cache-dir <新缓存目录>` 可保存原始 HTML，供检查及重新解析。更新上游时必须使用新缓存；旧缓存代表离线快照，不能证明数据仍然最新。

生成候选，不直接覆盖生产语料：

```sh
node tooling/prepare-endfield-refresh.mjs \
  --previous apps/desktop/data \
  --staging /path/to/stage \
  --out /path/to/new-candidate
```

输出目录必须不存在，且不与输入目录重叠。五类数据全部通过数量、唯一 ID、来源、采集日期和有效正文检查后，才写入输出。上游缺失、正文变空或正文缩短超过一半的记录会保留旧正文、版本和采集时间，包括官方 Skland 补充。替换前应查看保留清单；保留旧记录不代表刚刚核实过其上游内容。

`refresh-receipt.json` 保存新增、更新、保留的 ID，以及旧文件、抓取文件和候选文件的 SHA256。数据集的 `scrapedAt` 保持为最旧记录的采集日期，`refreshedAt` 记录本次刷新日期。逐条版本优先于数据集版本，避免未来更新把旧证据改标成新版本。非任务抓取器目前不输出全站页脚版本；准备工具明确记录来自同一 Warfarin 任务索引的版本回退，未知版本则拒绝处理。

复制五份候选聚合文件前，保存旧文件原始字节和哈希。检查新增内容，抽查对白、无线电、说话人归属和保留的官方记录。运行 `endfield-mission-scraper`、`endfield-refresh`、`endfield-version-stamps` 三项测试及现有 Endfield 契约，再通过真实 HTTP 服务验证空搜索元数据、新增内容和保留内容。随交付保存回执。

丹青渡上线后，先核对实际公开版本与上游版本，再审核新章节 ID 和剧透进度映射，最后开放章节选项。不要把所有旧行都改标为预告版本，也不要根据预定日期推测数字版本号。
