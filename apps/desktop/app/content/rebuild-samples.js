// Long-form sample content for Rebuild Writing Objects.
//
// The canonical article lives in the evergreen corpus shared by Help and the
// demos. Getters let the corpus arrive through a lazy loader before the user
// presses Use Sample Article without copying the article into this module.

window.AISystem6Content = (() => {
  const fallback = Object.freeze({
    zh: `# 当聊天框装不下一篇文章

用 AI 写文章时，最累的常常不是写，而是搬：把回答搬去编辑器，把来源搬回聊天，再从几份冲突的正文里找出现在这一版。资料、指令、废稿和稿件被压成同一种东西——一条消息。

AI System 6 把聊天放回一款应用的位置。项目硬盘保存长期状态，文件软盘承接临时材料，问题单留下真实问题和接收者，大纲决定顺序，章节草稿一次只处理一节，TeachText 拥有正文，审校台检查风险，项目光盘保存交付物。

模型写出一段文字，不等于它已经进入稿件。屏幕上出现过，和电脑已经保存，是两件不同的事。保存、摘录、插入和导出都需要明确动作；没有界面状态或项目记录作证，系统不声称动作已经发生。

这台 Macintosh 住在浏览器里。IndexedDB 保存项目，小型 Node.js 服务只连接模型、网页读取、OCR 和转写。没有模型时，桌面仍能打开文件、整理材料、编辑文字和导出成品。

作者也不只是出题人和验收员。亲眼看到的细节、说话的停顿、还没有完全想明白的判断，本来就是文章的一部分。AI 可以工作，人仍然决定什么值得留下，以及什么时候把临时结果正式保存。`,
    en: `# When a Chat Box Cannot Hold an Article

The tiring part of AI writing is often not writing but carrying: moving a reply to an editor, bringing a source back to chat, and finding the current manuscript among conflicting versions. Research, instructions, abandoned drafts, and finished prose collapse into one thing — a message.

AI System 6 puts chat back in its place as one application. Project Hard Disk keeps durable state. File Floppy carries temporary material. Question Sheet keeps the real question and recipient. Outline decides the order. Section Drafts handle one section at a time. TeachText owns the manuscript. Review Desk checks risk. Project CD keeps the handoff.

Text produced by a model has not thereby entered the manuscript. Appearing on screen and being saved by the computer are different events. Save, clip, insert, and export are explicit actions; without UI state or a project record, the system does not claim they happened.

This Macintosh lives in the browser. IndexedDB keeps the project while a small Node.js service only connects models, web reading, OCR, and transcription. Without a model, the desktop can still open files, organize material, edit prose, and export work.

The writer is not merely the person who supplies a task and approves the output. What they witnessed, where they pause, and what they have not fully settled are part of the article. AI may work; the human still decides what deserves to remain and when temporary material becomes saved work.`,
  });

  const rebuildSampleArticles = {};
  ["zh", "en"].forEach((language) => {
    Object.defineProperty(rebuildSampleArticles, language, {
      enumerable: true,
      get() {
        return window.AISystem6EvergreenDemoCorpus?.artifacts?.article?.[language] || fallback[language];
      },
    });
  });

  return Object.freeze({
    rebuildSampleArticles: Object.freeze(rebuildSampleArticles),
  });
})();
