<!-- 中文参考版：英文版为准，本文件仅供人类参考。哈希由 npm run docs:sync-hashes 维护。 -->

# 统一规范（2026-10-10）—— 执行状态与接手文档（中文参考）

<!-- canonical-source: docs/clioworks/unified-spec/STAGE-HANDOFF.md -->
<!-- source-sha256: 7d02c12d6775d335746c200f3bba632b9d1072827466fd600dfd13bb89b26b19 -->

规格来源：`AI-System-6-Unified-Spec-and-Design-2026-10-10.zip`
（SPEC.zh-CN.md，基线 `478d6c49`，交付边界见其 §0）。
本文件是执行者接手点：已完成/未完成/怎么继续。设计审批 pending_review。

## 已完成（全部在 main，提交 f1e18817c）
### 阶段 0 — 参考合同落地
- `apps/desktop/app/vendor/unified-spec/contracts.mjs`：规格自带 15 组纯规则
- `tests/features/unified-spec-contracts.test.mjs`：32 断言全过。
### 阶段 1 — W03 显示票据 + W01 mount 失败门（window-manager.js）
- **W03**：`windowPresentationEpoch` + `takeWindowPresentationTicket()`；
- **W01**：`mountWindowApplication` 现在返回 runtime 判定；mount **运行且
- 证据（internal/evidence/drafts/unified-spec-20261010/）：
  - `w03-late-focus.json`（4/4）：慢挂载的 docMap 在后开的 calculator
  - `w01-mount-failure.json`（7/7）：真实注册的 throwing mount——
- 顺带修复：`playSystemSound("error")` 请求的声音类型此前未定义——
### 过程中发现并避开的坑（接手者必读）
## 验证状态（阶段 1 收尾时）
- verify:features：474 项全过（含新增 unified-spec-contracts）。
- verify:quick / css / floppy 全过。
- W01/W03 浏览器证据 11/11，截图与 JSON 在证据目录。
- 提交 f1e18817c 已推送 private/main。
## 未完成（按规格 §12 顺序）
| P1-W02 | 打开意图独立（同窗口名不同文件不合并；liquid-cover 拆 mount:open） | **合同已锁定（阶段 2，提交 9265ae18d）**：`tests/features/window-open-reentrancy.test.mjs` 7 断言锁定现有行为——重入不死锁、共享一次初始化、mounting 中第二个 open 等待不提前 ready；真实浏览器双开 Cover Glass 证据 3/3。**当前实现已满足 W02 验收**；规格的「拆 build/reveal」是改进项，重构前此测试必须保持绿 | 先跑 `node tests/features/window-open-reentrancy.test.mjs` 确认基线，再动 `windowsBeingOpened` |
| P1-W04 | 启动进度绑定真实任务 | **完成（阶段 3，提交 12d777b95）**：desktop-runtime 桥接 AISystem6BootProgress 流（boot.js 已有的步骤回报），进度=已落定步数函数；无固定百分比、无纯等待；冷启动保留 430ms 品牌停留、暖恢复 80ms 闪现；屏在 boot 结束时结束 | 合同测试 boot-warm-resume / workspace-profile 已更新到新形状并正向断言无 84% |
| P1-W05 | 每应用生命周期通道 | **完成（阶段 3，提交 12d777b95）**：registerApplicationLifecycle 每记录挂 vendored createLifecycleLane；suspend/resume 中途翻转收敛（hook 落定后重读最新 desired）；跨应用互不阻塞；throwing hook 可恢复；dispose 全终；reason 传递到落定 hook；惰性加载+行为保持升级 | `tests/features/app-lifecycle-lanes.test.mjs`（真实 registry+真实合同，6 断言） |
| P2-W06 | 多任务不依赖 Dock | **决定已落地（提交 58f2e9bed）**：新桌面默认 MultiFinder；已保存的显式 finder 选择双向保留（旧恢复路径会把它静默升级——已修）；设置入口不变；Dock 只改呈现。合同 `multitask-default`（6 断言）。剩余：宽窄屏×横竖屏×Dock 开关的对象状态/保存行为矩阵（W06 验收的测试半边） |
| P2-W07 | 控件/文件路线/iframe 边界 | **完成（提交 d656b31aa）**：拖窗与 grow box 一致——blur 加入 pointerup/pointercancel/lostpointercapture 的登记与清理，失焦中途的拖拽不再留下点线幽灵。合同 `window-iframe-boundary-w07`（14 断言）：经 AST 走查，全部 6 处 window 级 message 监听（doom/openttd/soundscape/time-machine/cmf-studio）先核验 event.source 或 event.origin 再动作（无 98.js 式同源假设）；层带令牌把普通窗口钳在 system menu（40000）与 system modal（40110）之下的 8990；阅读/桌面路线复用 verify:walk，不另建复本车道。控件状态令牌/禁用理由沿用既有 appearance 与 condition-token 合同 | 拖拽清理在 wireup.js 的 wireTitleBarChrome；监听白名单由合同走查看护，新增监听器需带 source/origin 门 |
| P2-W08 | 首屏与发布说明 | **完成（提交 4b889b964）**：三个本地门（verify-features / verify-quick / verify-floppy-budget）输出均带「commit + desk 版本」戳（头部与通过摘要各一次）——development-feedback 合同曾当场抓住把戳放成兄弟库 import 的做法（它把两个门拷进 scratch 树单独运行），改为门内自带。新访客无模型首访由真实注册表合同固定（`first-visit-no-model-w08`，13 断言）：首次访客文案先于模型门、中英文案不提连接模型、open-teachtext / reader-clip-translate / scrapbook-clip-picture / clip-teachtext-selection / clip-last-reply 五个基础工具无模型可调用、TeachText 是访客桌面的在册窗口。欢迎流程、示范盘、本地 CI 立场与 TeachText 退役规则按规格保持不变（规格禁止重建它们）| 发布走既有 RELEASE 流程（1.0.58 已演练）；每检查的提交/浏览器版本戳由 `tooling/lib/check-stamp.mjs` 记录规则、两个可拷贝门内联实现 |
| P3-C01 | 确定性丢失停止 | **完成（提交 fa76e5c03）**：slice(-6) 移除（全历史进预算）；uniqueMessages 按 ID 去重；chat 路径不再跑破坏性 fitting——放不下即 CHAT_PAYLOAD_TOO_LARGE 阻断、输入附件保留；压缩从不 splice 原史。合同 `chat-history-integrity`（12 断言）。**C02 已完成（见下）**；**C03–C08 均已完成（见下各行）——P3 压缩重做全部落地**|
| P3-C02 | 发送视图与原始记录分开 | **完成（提交 613955fc2）**：压缩记录 v1（throughMessageId/firstKeptMessageId/coveredHash/prefixVersion/contextEpoch/providerScope/model/project/chat）；buildPayload 只组装——候选未提交，发送编排在选择 payload 后 CAS 提交（边界 id+覆盖哈希核验），失败/取消不推进覆盖；legacy 记录标 legacy-unverified、边界锚点仍在才可重建；摘要走 USER 角色信封（historical_context_data，绝不为 system）。惰性模块 chat-compaction.js，eager 只留薄委托（floppy 余 835 字节）。合同 `compaction-record`（14 断言）|
| P3-C05 | 摘要内容与权限 | **完成（提交 e33320588）**：validatePins 对原始消息核验 pin 文本（模型不能自证覆盖）；validateSummary 结构校验（工具请求/不完整/空/超长/错误覆盖各具名拒绝）；记录携带 coveredMessageIds/openQuestionIds/acceptedDecisions（保留 WHO——助手建议绝不写成用户决定）与 sourceVersions；uniqueTurns 导出共享去重策略。合同 `chat-compaction-c05`（10 断言）|
| P3-C06 | 缓存由适配器负责 | **完成（提交 379a6349a）**：cache-policy.mjs（vendored，纯策略）——deepseek 自动缓存（wire 上无指令、fork 允许、hit/miss 从 usage 记录）；anthropic 断点保留（5m 历史+可选 1h system，前缀不重写、不 fork）；openai 未配置不发未知字段；lm-studio/subscription-cli 不做云端声明；未知供应商全关。cacheOutcome 从 vendored normalizeUsage 记录 hit/write/none/unknown。合同 `chat-cache-policy`（12 断言）；呈现见 C08 行 | cacheOutcome 随运行回执落账（提交 b1b4e8528 起） |
| P3-C07 | 原生链压缩后重建 | **完成（提交 411a6f9c2）**：clioTalkPreviousNativeResponseId 在压缩已提交且覆盖推进到当前发送轮（sourceMessages ≥ 该轮索引）时拒绝旧原生响应 id——链从新视图重建，不再延续压缩前的 full-history 前缀；未提交（legacy）记录不设门；门不放宽 provider/endpoint/model 匹配。合同 `chat-native-chain-c07`（5 断言，真实 host 访问器）；提交 CAS 侧见 `chat-compaction-c07` | 门在 `clioTalkPreviousNativeResponseId`（chat-messages.js），提交侧在 chat-compaction.js |
| P3-C08 | 界面详情 | **完成（提交 d210fbd0b）**：运行回执新增 usage 判定行——原生计数带 vendored cache 结论（hit/write/none/unknown），无原生计数显式标 estimated；未验证缓存写 unknown、未报告费用不出现；旧回执显示 —。上下文面板新增默认折叠的「本次运行」详情块（压缩推进到哪条、原文自何处逐字保留、缓存来源与 token 估算），仅在有内容可折叠时渲染；超限状态明示「原始上下文未替换」并可重试。cache-policy 经 cache-policy-install.js 惰性安装（与 contracts-install 同模式）；呈现逻辑全在惰性 chat-run-details.js，eager 只留薄委托（约 1.2KB）。floppy 预算 +1.5KB（惰性回收已尽，理由记录在 runtime-manifest 常量旁，循阶段 9 先例）。合同 `chat-run-details-c08`（约 35 断言，真实惰性模块 + 真实 vendored contracts/cache-policy）| 回执行在 formatRunReceiptBody；折叠块由惰性 renderInto 绘制在 #context-panel-list 顶部 |
| P4 | R01–R05/S01–S02 阅读主路线 | **完成（提交 0f33336a3）**：vendored 阅读合同（resolvePassage / validateCitations）接上唯一的生产消费方——惰性 reading-bridge：Reader 页面按快照解析（revision=页面自身 hash，重取内容变化即诚实地 stale）；选区在任何工具点击**之前**锚成 PassageRef（前缀/后缀先行捕获，重复句按出现位置 pin）；「留在这里」直接挂在 scrap 记录本身（readingScrap 字段，Reader 批注抽屉/Scrapbook/Finder 是同一对象同一 id 的视图，部分保存绝不冒充已采用）；线程引用对照允许段落核验。不建并行 store、不建复本车道：既有 clip/ask 路线就是阅读路线，本阶段只加规格 DTO 要求的锚定与解析层。合同 `reading-bridge-p4`（16 断言，真实桥 + 真实 vendored contracts）：found/ambiguous/lost/stale 各自钉在 vendored 判定上（含空 quote 直接拒收）、缀合消歧、revision 诚实性、JSON 往返后身份不变、引用越界具名 | R02–R05 的交互细节（页边卡片排布、返回栈、问题查找）沿用既有 ask-bar/selection-services；后续如需扩展，入口是 reading-bridge.js 的 passageRefFromSelection / resolveRef / attachToScrap |
| P5 | C02–C08 压缩重做 | **完成**（见 P3-C02…C08 各行）| 惰性 chat-compaction.js + vendored contracts；合同 compaction-record / chat-compaction-c05 / chat-compaction-c07 / chat-native-chain-c07 / chat-cache-policy / chat-run-details-c08 |
| P6/P7 | R06–R08/S03–S06、M01–M04 | **进行中**。S03 **完成（提交 74771ce21）**：Scrapbook 允许 `noteKind: open-question` 的剪藏——quote 取自剪藏自己的保存文字（绝非模型代笔）、gap 是读者自己的问题；状态 open/partly-answered/resolved/withdrawn **只由用户接受改变**，模型候选一律惰性（acceptedAt 为空），历史保留不覆盖，撤回保留问题与原话；相似问题建议是有界、局部、可关闭的扫描（不恢复全局 suggestion hub），内容指纹防往返复制自荐。惰性 open-questions.js + 剪藏列表徽章 + 编辑器菜单项（eager 残留 +1.3KB，理由记录在 runtime-manifest）。合同 `open-questions-s03`（23 断言）。S04 **完成（提交 83934777c）**：惰性 reading-relations——关系候选两端为真实锚定 PassageRef、类型限规格五种、理由必填；用户采纳是 accepted 的唯一门，撤回保留候选；DocMap 经 edgesForDocMap 复用既有 ## Relations 形状（最具体 key 匹配、无外来图），共同上游按 reason 归并 lineage（大小写不敏感，同源多文只算一个独立支持）。合同 `reading-relations-s04`（17 断言）。R06 **完成（提交 fd8afb9af）**：惰性 reading-layers——原文/贴句译文/易懂说明三字段不混合，句级 ID 对齐（中英句末符均切分），复制默认读者显式选中的层、直接引文只认 original 层（其余层拒引并给理由）；目标语言保留简/繁/英；深度显式三档（brief/standard/deep）可单次请求覆写但不改设置不建画像；前提三态诚实（cited 必须带句 ID、explained 自认是桌面解释、assumption 标需核对）；比喻带对应关系与失效处。合同 `reading-layers-r06`（25 断言）。R07 **完成（提交 dd2a85f91）**：惰性 reading-compare——比较先列四facet差异（对象/日期/定义/条件），解释必须写明依据哪些差异；一面沉默的 facet 诚实记 null 不猜；**没有依据不裁定矛盾**——无同对象证据时返回待解问题而非判决；「凭什么/怎样推翻」生成证据路径（独立来源核验 + 反例观察问题），锚定支持引文。合同 `reading-compare-r07`（18 断言）。R08 **完成（提交 eedce4e56）**：惰性 reading-boundary——已读上限（block 序号/媒体时间/显式不限）由读者设置，非法值拒收；过滤在检索前经 vendored selectReadableBlocks（唯一权威）执行，请求校验再查一遍——越界锚点拒答并说明（不从已载入未授权后文找答案）；范围声明明说「不约束模型预训练」；重读展示读者自己的开放问题与理解变化（撤回不重现、quiz/score 恒 null）。合同 `reading-boundary-r08`（21 断言）。S05 **完成（提交 fb6b36725）**：惰性 source-versions——批注记住 basedOnRevision，revision 不匹配即 stale（引文查找只管同版本丢失）；噪声剥离逐句进行+模板句整句剔除（广告换网络 ≠ 语义变化，返回 no-semantic-change 不通知；strip 的 /g 正则按次新建——lastIndex 泄漏会静默跳过下一段的匹配）；死锚保留原话+标记，重锚需读者确认；检查默认读者发起，自动检查必须有带频率的显式 opt-in。合同 `source-versions-s05`（19 断言）。S06 **完成（提交 ea4803a36）**：惰性 reading-package——manifest 映射桌面自身 ID（逐源 distribution 决定：own-work/authorized-full 带全文，excerpt-only/unknown 走摘录+链接且不自动升级）+ manifest 确定性完整性哈希；导入五查（路径穿越/超限含声明尺寸/未知 schema/危险 URL 仅放行 http(s)/跨 ID 空间重复 ID）；接收者批注落新 owner/layer ID 且上游层只读不覆写；明说不是 DOCX 无损承诺。合同 `reading-package-s06`（24 断言）。P6 阅读线（S01–S06、R01–R08）全部落地。M01–M04 **完成（提交 283f2cc50）**：惰性 media-reading——M01 区域锚声明模型实际所见图（legend/axis 上下文、裸矩形自报 contextSufficient:false、OCR 不确定字符保留 [2|3] 候选、越界框拒收）；M02 提问冻结时间范围不随播放头漂移、字幕/画面/声轨证据各自只主张所见（字幕不见画面）；M03 朗读会话按段落句界推进、提问在原位暂停、仅读者本人恢复到暂停位；M04 四个有限模板、算式由桌面确定性计算并具名公式、换算率只认桌面核过的表（缺率拒算不发明）、模板不适退回文字。合同 `media-reading-m0104`（26 断言）。**统一规范全部阶段（P1–P7：W01–W08、C01–C08、R01–R08、S01–S06、M01–M04）至此全部落地。** 媒体与朗读 | S04 入口：reading-bridge 的 PassageRef 两端 + DocMap 既有 Relations 段（不建另一套图谱真相）|
## 给下一位执行者的话
- 窗口管理器的三个检查点是**最小侵入**实现：没有改任何模块的 mount 签名，
- 跑浏览器证据用 `node internal/evidence/drafts/unified-spec-20261010/capture-*.mjs`
- 全量特性车道是回归的最终裁判：`node tooling/verify-features.mjs`。
- **VM 测试的两条铁律**：`window.AISystem6Runtime` 冻结（stub 无效）；VM 的