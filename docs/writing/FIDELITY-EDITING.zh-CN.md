<!-- canonical-source: docs/writing/FIDELITY-EDITING.md -->
<!-- source-sha256: d34375b455272331cdbd5c52d5e72e659a3e5c847120b8f129f49c0da859619a -->

英文版为准。本文档仅供人类参考，不被运行时读取。

# 保真编辑与台湾语言适配

AI System 6 把表达修改视为作者控制下的修订。客户端、服务器及 Pages 的共享护栏保护条件、否定范围、来源归属、比较对象、判断强度和完成状态。普通生成保持仅诊断，本次不增加自动重写轮次。

Humanizer 和“按要求修改”默认采用必要的最小表达修改。作者未要求调整结构时，保留标题、段落次序及独立信息；无法确定等义改法就保留原句。正常文字、有用重复和准确技术术语可以不改。表达修改不替作者撤回观点或核实事实；模糊归属仍须保留，实质证据问题交给现有审阅入口。

语言按明确任务要求、原文语言、当前默认语言依次决定。仅在“按要求修改”中明确指定台湾读者或台湾用语时，正文采用繁体及台湾常用表达；只要求繁体时仅转换字形，不改地域词汇。引文、访谈／聊天／录音原话、专名、代码、链接、数字、科学术语及标题 ID 受到保护，不做全局词表替换。

“只标问题”进入 ClioTalk，返回原文位置与建议，不提供替换全文或写回预览。直接改稿仍只返回正文，并沿用作者采用步骤；ClioTalk 不声称修改了原稿。写回前检查请求的取消信号、项目、编辑器文字及 TeachText 标签身份，采用对话框之后再次检查。迟到的 ClioTalk 结果不能加入另一项目的对话。

稳定 ID 沿用 `writing-route.humanizer` 和 `writing-tools.describe-change`。系统 Markdown 通过既有构建生成记录，项目停用优先于项目覆盖，项目覆盖优先于系统提示词。已有覆盖文件不自动升级，有效提示词哈希与回执继续保留。不新增菜单、公共 API、任务类型、设置或存储字段。

## 方法来源与本地取舍

- [shuorenhua](https://github.com/MrGeDiao/shuorenhua/tree/e7c2b8670bd3e1988bfec199e861cebd87fc5e9c)，固定提交 `e7c2b8670bd3e1988bfec199e861cebd87fc5e9c`：吸收保守范围与语义保真。上游允许整理转述原话的做法不适用于本项目，逐字保护优先。[MIT 许可](shuorenhua-LICENSE.txt)，Copyright (c) 2026 MrGeDiao。
- [speak-human-tw](https://github.com/Raymondhou0917/speak-human-tw/tree/1f7a870a70a3d53e3b8fa8dae66e1345e5b022a6)，版本 1.4.0，固定提交 `1f7a870a70a3d53e3b8fa8dae66e1345e5b022a6`：吸收按上下文处理台湾用语及受保护内容。舍弃句式／标点配额、自评分门槛、重复确认和虚构个人经历。[MIT 许可](speak-human-tw-LICENSE.txt)，Copyright (c) 2026 Raymond Hou（雷蒙三十）。

方法已重写进既有共享契约和任务提示词，不把上游整套技能塞进请求。

## 验证与回退

`tests/features/writing-fidelity.test.mjs` 执行生产解析器、三条提示词组装路径、请求包装与采用流程，覆盖语言、结果去向、覆盖／停用、有效哈希、项目／标签／文字变化、取消及迟到的 ClioTalk 回答。Humanizer 与 Pages 一致性检查覆盖共享护栏和普通生成不重写。

运行 `node tooling/eval-writing-fidelity.mjs`，脱敏前后请求保存在 `internal/evidence/writing-fidelity-20261007/requests.json`。本次已通过产品 `/api/chat` 链路使用当前配置的 `qwen3.5-4b-mlx`，温度 `0.35`、最大输出 `650`；临时使用 16K 上下文后已恢复原来的 8K。主代理逐项审阅保存在 `semantic-review.json`：14 个完整 after 案例的受保护片段与标题次序均通过；针对有用专名重复、仅繁体字形转换和只标问题输出的复测也已修正并通过。before 输出保留了对应失败，作为对照证据。这批冻结样本支持这些行为判断，不代表整体质量提升。机器检查和模型自评分不能证明效果，不切换供应商。

原始字节与 SHA-256 位于独立的 `.statem/writing-fidelity-20261007/baseline/` 和 `baseline.json`。回退前检查后续改动，只撤销本任务差异，不恢复整个工作区，也不覆盖用户项目提示词。本任务不发布或部署。
