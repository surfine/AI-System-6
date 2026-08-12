// Long-form sample content for guided flows. Keep UI behavior in app.js.
window.AISystem6Content = (() => {
  const rebuildSampleArticles = Object.freeze({
    zh: `# AI System 6：一台为 AI 写作而生的小 Macintosh

AI System 6 不是一个聊天网页，也不是给旧电脑套一层复古皮肤。它的目标更具体：把本地大语言模型变成一张安静的写作桌面。用户不是把所有问题都丢进一个无限聊天框，而是在一个项目硬盘里收集资料、摘录句子、整理问题、生成大纲、逐段起草、核查事实，最后把手稿交给 TeachText，并导出刻录到 Project CD。

这套设计的核心是降低写作摩擦。很多人用 AI 写作时，最难的不是让模型生成文字，而是不知道该给模型什么、该保留什么、该相信什么。AI System 6 把这些模糊动作拆成可见物件：Reader 用来读网页，Scrapbook 只保存真正值得留下的摘录，Question Sheet 保留用户自己的问题和反对意见，Outline 把材料变成可修改的结构，Section Drafts 只按一个段落主题起草，Claim Check 把需要来源的句子重新暴露出来。

这种桌面隐喻来自 Macintosh System 6。System 6 的魅力不在于功能多，而在于每个东西都有位置：文件在文件夹里，临时内容在剪贴板里，废弃物进废纸篓，工具用完就关掉。AI System 6 借用这种秩序来约束 AI：模型可以帮忙总结、拆解、改写、翻译，但它不能自动吞掉用户的上下文，也不能悄悄把临时回答写进硬盘。

项目硬盘是可信边界。一个项目就是一块硬盘，里面有文档、摘录、参考资料、草稿、Project CD 里的导出文件和废纸篓。切换项目时，用户应该感觉自己换了一块硬盘，而不是进入了一个看不见边界的云端工作区。这样做的好处很朴素：资料不会串，引用更容易追，模型知道自己正在服务哪一篇文章。

还原写作对象是给新用户的入口。用户可以拿一篇成品文章，让 AI System 6 把它还原成问题单、大纲、段落功能、事实队列和风格笔记。它不是为了抄文章，而是让用户看见一篇文章背后的写作动作：先提出什么问题，如何展开材料，哪里需要证据，哪些句子只是风格，哪些结构可以迁移到自己的题目里。

最终，AI System 6 想帮助的是那种真正要写东西的人：他们需要资料，但不想被资料淹没；需要 AI，但不想被 AI 代替；需要结构，但不想进入复杂的知识管理系统。它像一台小 Macintosh：开机，挂载项目硬盘，打开 Reader，剪几段到 Scrapbook，写下自己的问题，然后一步一步把混乱变成手稿。`,

    en: `# AI System 6: A Small Macintosh For AI Writing

AI System 6 is not a chat web page, and it is not a retro skin placed over a modern AI app. Its purpose is more specific: it turns a local language model into a quiet writing desktop. The user does not throw every thought into one endless chat box. Instead, one Project Hard Disk holds sources, selected clips, questions, outlines, section drafts, claim checks, the TeachText manuscript, and exported Markdown.

The central promise is lower writing friction. When people use AI for writing, the hard part is often not generating text. The hard part is knowing what to give the model, what to keep, what to trust, and where the user's own judgment should remain visible. AI System 6 breaks those vague actions into visible desk objects: Reader is for reading sources, Scrapbook keeps only selected evidence, Question Sheet preserves the user's own questions and objections, Outline turns material into editable structure, Section Drafts works one topic at a time, and Claim Check brings unsupported claims back into view.

The desktop metaphor comes from Macintosh System 6. Its charm was not that it had every possible feature. Its charm was that every thing had a place: files lived in folders, temporary text lived on the Clipboard, discarded work went to Trash, and small tools could be opened and closed without taking over the desk. AI System 6 uses that discipline to constrain AI. The model can summarize, rebuild, translate, draft, and check, but it should not silently absorb context or write temporary replies to the hard disk.

Project Hard Disk is the trust boundary. A project is a hard disk containing documents, clips, references, drafts, exported CD contents, and trash. Switching projects should feel like mounting a different hard disk, not entering a vague cloud workspace. The benefit is practical: sources do not leak across tasks, citations are easier to trace, and the local model knows which piece of writing it is helping with.

Rebuild Writing Objects is the entrance for new users. A user can bring in a finished article, and AI System 6 can rebuild it as a Question Sheet, Outline, section roles, claim queue, and style notes. The goal is not to copy the article. The goal is to reveal the writing moves behind it: what question came first, how evidence was arranged, where sources are needed, which sentences are style, and which structures can be reused for the user's own topic.

In the end, AI System 6 is for people who actually need to write. They need sources without drowning in them. They need AI without being replaced by it. They need structure without falling into a heavy knowledge-management system. It should feel like a small Macintosh: start up, mount a Project Hard Disk, open Reader, clip a few passages to Scrapbook, write down your own questions, and turn a messy beginning into a manuscript step by step.`,
  });

  return {
    rebuildSampleArticles,
  };
})();
