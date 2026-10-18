<!-- canonical-source: tooling/icon-generation/completion/CLIOWRITE-MASTERS-NEEDED.md -->
<!-- source-sha256: 2569eaf6acf26efa0c48d51e6ef564ee1f528f4cd7593a53821b269f68e8e5fa -->

> 英文版为准；本译文仅供人类参考。

> **目前的状态（2026-10-17）**：这 10 个路径上放的是**临时线稿占位**，由 `draw-cliowrite-placeholder.py` 用代码画出（Aaron 指示「先画一个临时的线稿图标」），不是 Image Gen 母版。它让 `completion-era-icons` 发布闸门先通过；这与本目录 README「不用代码绘制的图案替代」的规矩相反，是一次有意、临时的例外。Aaron 生成的正式母版到位后，直接覆盖同名文件，再跑下文的命令，并删除 `draw-cliowrite-placeholder.py`。

# ClioWrite 母版清單（Aaron 用 Image Gen 產出）

提示詞與程式碼都已備好，只缺這 10 張母版。照 mingwen 的規格：1254×1254 RGBA、真透明背景（不是白底或棋盤格）、主體約佔 86%（mingwen 的母版實測不透明範圍約 1094/1254）。每張要單獨生成，產出後放進下列路徑。

| 母版放這裡（`tooling/icon-generation/completion/` 之下） | 用哪份提示詞（`prompts/` 之下） |
| --- | --- |
| `masters/classic/clioWrite.png` | `classic/clioWrite.txt` |
| `masters/platinum/clioWrite.png` | `platinum/clioWrite.txt` |
| `masters/aqua/clioWrite.png` | `aqua/clioWrite.txt` |
| `masters/snow-leopard/clioWrite.png` | `snow-leopard/clioWrite.txt` |
| `masters/yosemite/clioWrite.png` | `yosemite/clioWrite.txt` |
| `masters/big-sur/clioWrite.png` | `big-sur/clioWrite.txt` |
| `masters/nextstep/clioWrite.png` | `nextstep/clioWrite.txt` |
| `masters/liquid-glass/clioWrite.png` | `liquid-glass/clioWrite.txt`（先生成這張） |
| `masters/liquid-glass/clioWrite-dark.png` | `liquid-glass/clioWrite-dark.txt`（以上一張為底做編輯） |
| `masters/liquid-glass/clioWrite-clear.png` | `liquid-glass/clioWrite-clear.txt`（以 default 那張為底做編輯） |

放好之後，整合者在 worktree 跑一次：

```
npm run build:completion-icons
```

它會產出各時代 16/32/64/128 等級的圖、寫入 `apps/desktop/assets/themes/completion-icon-extension.json`（雜湊由建置寫，不要手寫），並重建 System 7 家族。再跑 `npm run verify:changed -- --base HEAD`。
