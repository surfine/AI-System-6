<!-- canonical-source: docs/design/system-dialogs.md -->
<!-- source-sha256: d26fc71a3b610e2c654d8bd78360d5e2226384b16d2c7c76019aca4eff83660e -->
<!-- 英文版为准，本文件仅供人类参考 -->

# 系统弹窗 —— 桌面什么时候可以提问

> 主人决定，2026-09-19：只为“你确定点了刚才那个东西吗”而存在的弹窗不应该
> 存在。桌面自己判断，真正要保住的是作者自己的稿子。

这是应用里所有阻塞式界面的一次清点——`showSystemModal` 调用、桌面自己的
`<dialog>` 窗口，以及写入租约的弹窗。每一个要么**移除**（桌面直接执行，改用不
阻塞的方式说明），要么**保留**，并写明它凭什么还能让作者停下来。

## 规则

只有满足以下一条，弹窗才留得住：

1. **收集桌面编不出来的输入**——名字、路径、地址、必须由作者敲进去的字面值。
2. **保护作品**——未保存的修改、即将被覆盖或删除的文档、没有撤销的刻录或抹除。
3. **确认不可逆的动作**——废纸篓不算；删除、抹掉、重置、丢弃才算。
4. **把真正的选择摆在作者面前**——把材料送去云端模型、读取远程网页、把笔交给一个
   存不下东西的窗口。

其余都是通知或回执。它们改走状态行（`setStatus`）或通知列表
（`pushSystemNotification`）：作者想看的时候看得到，永远不必回答。

## 1. 已移除

| 位置 | 它原本问什么 | 现在由什么代替 |
| --- | --- | --- |
| `apps/desktop/app.js` — `runStandaloneLaunchIntent` | “打开该应用需要从写作视图切换到桌面。是否继续？” | 链接是访问者自己点的：会话移过去，写作路由的每个窗口和文档都留着，桌面记录里仍是 `writing`，状态行说明在哪里打开了 |
| `apps/desktop/app/core/actions.js` — 四个 `open-system-file-*` 命令 | “这个系统文件由 AI System 6 使用……” | 状态行 |
| `apps/desktop/app/core/actions.js` — `open-droplet` | “拖放工具：双击不会打开窗口” | 通知 |
| `apps/desktop/app/core/window-manager.js` — `showAboutMultiFinder` | MultiFinder 说明文字 | 通知 |
| `apps/desktop/app/core/window-manager.js` — `shutDownSystem` | “关闭 AI System 6？” | 关机是作者自己的命令，离开时桌面会自己保存；关机画面会如实说明哪次保存失败了 |
| `apps/desktop/app/core/desktop-runtime.js` — `resetSystemStorage` 失败 | “重置失败。请关闭其他标签页，然后重试。” | 失败通知 |
| `apps/desktop/app/features/desktop-tools.js` — `completeWritingBell` | “工作铃响了。” | 状态行，加上铃自己的落点通知（带回到那句话的按钮）；下一个时段立刻开始计时 |
| `apps/desktop/app/features/desktop-tools.js` — `movePuzzleTile` | “N 步完成了。” | 状态行（拼图本来就有状态行） |
| `apps/desktop/app/features/clio-stage.js` — `ensureSlidesMarkdownValidForExport` | “……未通过校验” | 状态行加失败通知 |
| `apps/desktop/app/features/slides-export.js` — Marp 与 AI 幻灯片导出 | “……生成失败 / 未通过校验” | 状态行加失败通知 |
| `apps/desktop/app/core/local-model-connection.js` — `openSafariHttpLocalEntry` | “请把地址粘贴到刚打开的标签页。” | 通知，切到另一个标签页时它还在 |
| `apps/desktop/app/features/outline-claim.js` — `organizeQuestionSheet` 失败 | “整理问题失败：……” | 状态行加失败通知 |
| `apps/desktop/app/features/bonsai-city.js` — `reportMicropolisImport` | “导入完成，附以下说明：……” | 通知 |
| `apps/desktop/app/features/writing-demo.js` — 预检失败与演示失败 | “演示准备失败，未进入正式录屏流程：……” | 失败通知 |
| `apps/desktop/app/core/persistence-status.js` — `reportWritingRouteModelFailure` | 先问“要现在打开控制面板接一个模型吗？”，再弹一条失败 | 一条失败通知，按钮直接打开控制面板 |
| `apps/desktop/app/features/export-import.js` — `noteProjectCdExportReviewState` | “……尚未记录 Review Desk 完成状态。仍要继续吗？” | 通知；导出是作者自己的命令，审阅没走完不损失任何作品 |
| `apps/desktop/app/features/mcp-servers.js` — 移除服务器 | “移除服务器「……」？” | 状态行；已经放上文件软盘的材料保留，重新添加就是同一张表单 |
| `apps/desktop/app/features/scrapbook.js` — 忘记 | “将这个记忆项目移到废纸篓？” | 状态行；项目在废纸篓里仍可恢复 |
| `apps/desktop/app/features/scrapbook.js` — 废纸篓双击 | “还原：……？” | 双击本身就是答复；还原不会丢任何东西 |
| `apps/desktop/app/features/documents-chat.js` — `createProjectMemoryDraft` | “确认将这份草稿保存为项目长期记忆？” | 状态行；上面两个输入框已经完整展示并允许编辑要保存的内容 |
| `apps/desktop/app/features/documents-chat.js` — `createSkillDraftFromSelectedRetrospective` | “根据「……」制作 Skill 草稿？” | 状态行；草稿不安装也不启用任何东西 |
| `apps/desktop/app/features/hkrr-review.js` — `saveHkrrReview` | “把这份 HKRR 提亮审阅保存到项目光盘？”并附预览 | 状态行；屏幕上这份审阅就是要保存的内容 |
| `apps/desktop/app/core/web-app-shell.js` — 新版本可用 | “AI System 6 有新版本了。现在重新启动来使用它？” | 不再重启。等待中的新版本只在屏幕上的页面本身就是这个版本时接管（通常如此：导航时已经取到了新页面），不重新载入；旧页面不动，下次打开时自然换成新版本。原先保留它的理由——重启会丢掉打开的内容——已不成立 |

## 2. 保留：它们保护作品

| 位置 | 为什么留下 |
| --- | --- |
| `apps/desktop/app/core/window-manager.js` — `closeWindow`、`quitApp`、`prepareFinderModeForApp`；`apps/desktop/app/features/teachtext-accessories.js` — `closeTeachTextDocumentTab`；`apps/desktop/app/core/workspace-profile.js` — `exitWritingStudio` | TeachText 有未保存修改：保存 / 不保存 / 取消是作者的选择，回车默认落在取消 |
| `apps/desktop/app/core/window-manager.js` — `restartSystem` 保存失败 | 桌面写不进状态，这时重载等于丢掉它 |
| `apps/desktop/app/core/desktop-runtime.js` — 清空废纸篓、抹掉项目硬盘、重置系统 | 永久移除，没有撤销 |
| `apps/desktop/app/features/micropolis.js` — 删除城市，以及三个新建城市命令 | “当前城市未保存的进度会丢失” |
| `apps/desktop/app/features/bonsai-city.js` — 删除城市、发送到 Micropolis、导入 Micropolis 记录 | 两个方向都有损失，报告会写明改了什么 |
| `apps/desktop/app/features/clio-paint.js` — 新建画布 | “未保存的内容会丢失” |
| `apps/desktop/app/features/soundscape.js` — 删除已保存的片段 | 从作者的收藏里移除条目 |
| `apps/desktop/app/features/project-disk.js` — `moveProjectReferencesToTrash` | 删掉被引用的来源，会让既有草稿里的 `[Sn]` 变成孤儿引用 |
| `apps/desktop/app/core/chat-messages.js` — 丢弃回复；`apps/desktop/app/features/documents-chat.js` — 丢弃临时会话 | 丢弃无法完全相同地再生成的对话内容 |
| `apps/desktop/app/features/documents-chat.js` — `restoreSelectedTaskCheckpoint` | 会替换任务文件当前的引用 |
| `apps/desktop/app/features/find-change.js` — 全部修改 | 一条命令改写文档里所有匹配处 |
| `apps/desktop/app/features/quick-draft-handoff.js` — `openBlank` | 开始新草稿前，先问要不要保存手里这篇 |
| `apps/desktop/app/features/outline-claim.js`、`apps/desktop/app/features/writing-flow.js`、`apps/desktop/app/features/docmap.js`、`apps/desktop/app/features/translation.js`、`apps/desktop/app/features/quick-draft-ai.js`、`apps/desktop/app/features/quick-draft-composition.js` | AI 输出即将进入作者自己的正文：覆盖大纲、替换大纲、整理问题单、追加建议、套用章节草稿、定稿标签、翻译改写、展开调节层。预览正是让它成为选择而不是意外的东西 |
| `apps/desktop/app/core/write-lease.js` — `requestForceTakeoverWithConfirm` | 从另一个可能存不下东西的窗口强行拿走写入权 |

## 3. 保留：输入，或桌面不该替作者做的决定

| 位置 | 为什么留下 |
| --- | --- |
| `apps/desktop/app/core/modal.js` — `showInputDialog` 与桌面的表单窗口（`startup-settings-modal`、`new-project-disk-modal`、`app-input-modal`、`public-verification-modal`、`erase-disk-modal` 预览） | 它们收集桌面编不出来的名字、路径、口令与设置 |
| `apps/desktop/app/core/external-drop.js` | “读取这个网址的正文，还是保留它的文字？”——两种结果不同，其中一种会去取远程页面 |
| `apps/desktop/app/features/clio-paint.js` 与 `apps/desktop/app/features/teachtext-accessories.js` — 云端读取确认 | 作者自己的材料要离开本机 |
| `apps/desktop/app/core/desktop-runtime.js` — `setStartupEnvironmentPreference` | 要重启才能换启动环境 |
| `apps/desktop/app/features/documents-chat.js` — `configureSkillAutoCall`、`confirmSuggestedProjectSkill` | 授予某个 Skill 对项目的常驻权限 |
| `apps/desktop/app/features/guest-tools.js` — 换桌面名字、采用访客审阅、执行访客意图 | 换名字会让作者已发出的所有邀请失效；采用会写入审阅记录并把回执标记为已接受；执行等于作者自己发起 |
| `apps/desktop/app/features/writing-demo.js` — 片尾卡 | 演示结束时给出的两条路，不是在要许可 |
| `apps/desktop/index.html` — `guest-approval-modal`、`boot-recovery-modal`、`document-versions-modal`、`clio-use-result-modal` | 外部 agent 申请执行工具、启动失败后的恢复选择、版本列表、AI 结果的用法——每一项的结果都不同 |

## 4. 属于接管流程，不是弹窗设计

直达链接接管还牵着写入租约：就地导航到链接的窗口在 `pagehide` 时把笔交还
（`apps/desktop/app/core/write-lease.js` — `releaseWriteLease({ unload: true })`），
新窗口因此直接接管桌面，不必等一个已经离开的窗口回话。剩下那个租约弹窗保留：
只有当另一个窗口还在、而且它的落盘失败时才出现，那是作者必须自己拿主意的一种
情况。

## 5. 验证

- `tests/features/launch-intent.test.mjs` —— 接管流程不开任何弹窗，桌面记录里仍
  是作者自己选的画像。
- `tests/features/workspace-profile.test.mjs` —— 接管访问期间，桌面记录保存作者
  自己的画像。
- `tests/features/takeover-handshake.test.mjs`、`tests/features/single-writer-race.test.mjs`
  —— 离开的窗口不必问，仍在那里的窗口沉默时照样要被拦住。
- `tests/features/failure-copy-honesty.test.mjs` —— 模型离线时由通知提供控制面板
  入口，不再出现弹窗。
- `tests/e2e/probe-launch-takeover.spec.mjs` —— 真浏览器：分享链接打开它命名的
  应用，不开弹窗，下次启动回到作者自己的视图。
- `tests/e2e/probe-quiet-dialogs.spec.mjs` —— 真浏览器：响完的写作铃、审阅未走完
  的导出、关机、系统文件、拖放工具都不再开弹窗，各自的替代信息都落到状态行或
  通知列表。
- `tests/features/dialog-default-safety.test.mjs` —— 剩下每个
  `danger: true` 确认仍配对 `defaultAction: "cancel"`。
