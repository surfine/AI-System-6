<!-- canonical-source: docs/design/shared-ai-grounding.md -->
<!-- source-sha256: 31ecb094557fae95125710b2ffca49e4e1f4c59e7701375c019d6f10f3a4d99e -->
<!-- 英文版为准，本文件仅供人类参考 -->

# 共享 AI 证据契约 —— 一份证据，多个界面

> 2026-09-04 · 剧情终端 × ClioTalk/SideAsk 联动实现说明。

## 原则

AI 能力全软件共享。剧情终端、ClioTalk、SideAsk 底层是同一种形态——检索证据、
按引用契约回答——差别只在 RAG 对象和各自界面特色。共享骨头（检索、模型运行时、
引用契约），保留每张脸。

## 公共契约：ClioTalk `grounding`

唯一公共引用契约是 ClioTalk 既有的 `grounding` 对象（由
`appendMessageGrounding` / `decorateClioTalkInlineCitations` 消费）：

```js
{
  sources: [
    { kind, label, key, index, citation: "[S1]", text, url, speaker, context }
  ],
  sourceCount
}
```

ClioTalk/SideAsk 回答里的引用使用 `[S1]…[Sn]`。剧情终端窗口保留自己的 `【n】`
方言与可展开证据卡——那是它的特色，不是第二套契约。适配层保证两套编号对应同一
结果顺序。

## 适配层：`app/core/endfield-grounding.js`

`window.AISystem6EndfieldGrounding`：

- `searchForSideAsk(query, { signal })`——调用共享服务端 `/api/endfield/search`；
  不调用模型。
- `buildFromResults(results)`——把检索结果一对一映射成 grounding 源。
- `toSideAskContext(query, results, { lang })`——SideAsk 提示上下文，带引用契约
  与“无证据”指示。
- `prepare(query, { signal })`——SideAsk 以终端为锚点发送消息前调用；保存本次
  问题的新证据；实时检索失败时回退到终端上一次问答缓存（标记 `fallback: true`）。

## 数据流

1. 终端单轮问答（自有 UI、`【n】` 证据卡）走共享 `/api/endfield/ask` 管线。
2. 用户点“Ask in SideAsk”，终端成为 SideAsk 锚点。
3. 每次 SideAsk 提问时，`submitUserTextCore` 先
   `ensureEndfieldGroundingLoaded()` 再 `prepare(userText)`，提示词上下文使用
   本次问题的新证据。
4. `formatSideAskAnchorContext` 按 `[S1]` 契约渲染证据；
   `captureClioTalkGroundingSafely` 把同一批源合并进回复，chips 可点。
5. 点击 `endfield` chip 聚焦终端并展开 `#endfield-evidence-N`（终端保留自己的
   证据渲染）；窗口不存在时回退到 contextPanel。

## 不变量

- 终端保持单轮；多轮记忆只存在于 SideAsk/ClioTalk。
- 客户端不再有第二套 Endfield 模型调用、证据格式化或提示词契约。
- ClioTalk 普通（未配对）对话不触发终末地检索；“全局切换检索源”是后续可选能力，
  默认关闭。
- 无新增 UI/CSS：chips 复用 `clio-basis-chip` / `message-grounding-*`；
  无新增端点。

## 测试

- `tests/integration/endfield-grounding.test.mjs`：编号、label、key、空结果、
  无证据措辞、request-service 使用、缓存回退。
- `tests/features/endfield-sideask-grounding.test.mjs`：真实本地服务检索 +
  适配映射 + SideAsk 上下文契约。
- 回归：`endfield-archive-meta`、`launch-intent`、`build:app`。

手工验收：终端问“捕梦网”→ Ask in SideAsk → 追问“那之后安德烈怎么了”→ 回答带
可点证据 chips，点击回到终端证据卡；“帝江号”等世界观问题命中同一共享语料。
