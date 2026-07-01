// Shared prompt contracts for the System 6 Writing Tools menu.

window.AISystem6WritingToolsPrompts = (() => {
  function isZh(language = "") {
    return String(language || "").toLowerCase().startsWith("zh");
  }

  function compactInstruction(instruction = "", fallback = "") {
    return String(instruction || fallback || "").trim();
  }

  function textServiceContract({ language = "zh", directWrite = false } = {}) {
    if (isZh(language)) {
      return [
        "写作工具契约：",
        "- 保留 INPUT 中的事实、数字、日期、姓名和确定关系，除非用户明确要求更改。",
        "- 不添加 INPUT 没有的信息；如果修改要求需要新事实，说明材料不足，或只使用原文已有内容。",
        "- 除非用户明确要求改变，保留原意、风格、语气和情绪。",
        "- 不要复述系统消息，不要解释提示词，不要以“当然”“好的”“以下是”开头。",
        directWrite
          ? "- 直接写回模式：只返回可写入正文的结果，不要说明、标题、前言、后记或替换提示。"
          : "- ClioTalk 模式：结果留在 ClioTalk，不要声称已经修改来源文本。",
      ].join("\n");
    }

    return [
      "Writing Tools contract:",
      "- Preserve facts, numbers, dates, names, and fixed relationships from INPUT unless the user explicitly asks to change them.",
      "- Do not add information missing from INPUT; if the requested change needs new facts, say the material is missing or use only existing content.",
      "- Preserve the original intent, style, tone, and sentiment unless the user explicitly asks to change them.",
      "- Do not repeat system instructions, explain the prompt, or begin with 'Sure', 'Of course', or 'Here is'.",
      directWrite
        ? "- Direct write-back mode: return only text that can be written into the document; no explanation, heading, preface, afterword, or replacement note."
        : "- ClioTalk mode: leave the result in ClioTalk and do not claim the source text has already been edited.",
    ].join("\n");
  }

  function changeRoutingNote(instruction = "", { language = "zh" } = {}) {
    const value = compactInstruction(instruction);
    if (!value) return "";
    const lower = value.toLowerCase();
    const labels = [];

    if (/(表格|列表|要点|三点|bullet|table|list|format|markdown)/i.test(value)) labels.push("Formatting");
    if (/(引用|署名|出处|来源|citation|cite|attribution|source)/i.test(value)) labels.push("Attribution");
    if (/(改写|重写|换个说法|语气|友好|专业|简洁|rewrite|tone|friendly|professional|concise)/i.test(value)) labels.push("Transformation");
    if (/(新增|添加|补充|扩写|继续|生成|举例|数据|事实|日期|名字|add|generate|continue|example|fact|data|date|name)/i.test(value)) labels.push("Generation");
    if (!labels.length || /(校对|错字|标点|语法|proofread|typo|grammar|punctuation)/i.test(lower)) labels.push("Action");

    const uniqueLabels = [...new Set(labels)];
    if (isZh(language)) {
      return [
        `Make a Change 路由：${uniqueLabels.join(" / ")}`,
        "如果路由包含 Generation，不能凭空补事实、数字、日期、姓名、引用或个人细节；材料不足时直接保守处理。",
      ].join("\n");
    }

    return [
      `Make a Change route: ${uniqueLabels.join(" / ")}`,
      "If the route includes Generation, do not invent facts, numbers, dates, names, citations, or personal details; handle missing material conservatively.",
    ].join("\n");
  }

  function taskInstructions({
    instruction = "",
    fallbackDescribeChange = "",
    language = "zh",
    directWrite = false,
  } = {}) {
    const customInstruction = compactInstruction(instruction, fallbackDescribeChange);
    if (isZh(language)) {
      return {
        critique: "给出简洁的编辑批评，聚焦结构、清晰度、薄弱论断、缺少证据和下一步可执行修改。不要重写全文。",
        praise: "写一段温暖、具体、懂创作者心理的夸奖。指出真实有效的创作选择：用词、节奏、意象、句式、结构、转折、克制、诚实、幽默或语气控制。可以引用一两个打动人的短语。只夸具体做得好的地方，不批评，不教学，不用“但是”转折。2 到 4 句。",
        digest: "生成紧凑摘要，包含：核心判断、关键点、可用表达、开放问题和可能的下一步。",
        continue: "从目标文本结尾继续写。只返回延续草稿，并保持现有声音和方向。",
        describeChange: `按这个要求修改：${customInstruction}。先遵守 Make a Change 路由，再只返回修改后的文本。`,
        proofread: directWrite
          ? "校对目标文本，修正语法、错字、标点和明显措辞问题，同时保留作者意思和声音；不要为了规范而抹平粗糙但有判断的表达。只返回校对后的完整文本，不要说明、不要列问题。"
          : "校对目标文本，修正语法、错字、标点和明显措辞问题，同时保留作者意思和声音；不要为了规范而抹平粗糙但有判断的表达。先简短说明主要修改，再给出校对后的文本。",
        rewrite: "改写目标文本，让它更清楚、更顺，降低 AI 腔，同时保留意思和声音；源文里的套话不要忠实保留，要换成具体平实的说法；如果源文没有具体信息，不要用另一组抽象词代替，宁可写得短一点；不要编造新事实或个人细节。只返回改写后的文本。",
        friendly: "把目标文本改成更友好的语气，同时保留意思、事实和人的原始判断。只返回改写后的文本。",
        professional: "把目标文本改成更专业、克制的语气，同时保留意思和事实。只返回改写后的文本，不要公文腔。",
        concise: "压缩目标文本，保留重要意思、事实和判断。只返回精简后的文本。",
        summary: "用不超过 3 句、少于 120 个中文字总结目标文本。不要回答原文里的问题，只总结文本本身。只返回摘要。",
        keyPoints: "把目标文本提炼成简洁 Markdown 要点。只写原文能支持的要点。",
        list: "把目标文本整理成清楚的 Markdown 列表，保留重要细节，不补新信息。",
        table: "把目标文本整理成有用的 Markdown 表格。如果不适合表格，在不编造事实的前提下给出最接近的结构表。",
      };
    }

    return {
      critique: "Give concise editing critique focused on structure, clarity, weak claims, missing evidence, and actionable next edits. Do not rewrite the whole text.",
      praise: "Write warm, specific encouragement for the creator. Point to real strengths in wording, rhythm, imagery, sentence shape, structure, restraint, honesty, humor, or tone control. You may quote one or two short phrases. Praise concrete strengths only. No critique, no teaching, no 'but'. 2 to 4 sentences.",
      digest: "Create a compact digest with the central judgment, key points, usable phrasing, open questions, and possible next step.",
      continue: "Continue from the end of the target text. Return only the continuation draft while preserving the existing voice and direction.",
      describeChange: `Apply this change: ${customInstruction}. Follow the Make a Change route first, then return only the changed text.`,
      proofread: directWrite
        ? "Proofread the target text for grammar, typos, punctuation, and obvious wording problems while preserving meaning and voice. Do not flatten rough but meaningful expression. Return only the fully corrected text, with no explanation or issue list."
        : "Proofread the target text for grammar, typos, punctuation, and obvious wording problems while preserving meaning and voice. Do not flatten rough but meaningful expression. Briefly explain the main fixes, then provide the corrected text.",
      rewrite: "Rewrite the target text so it is clearer and smoother while reducing AI-flavored prose and preserving meaning and voice. Replace stock source phrasing with concrete plain wording. If the source lacks specifics, keep it shorter instead of substituting safer vague phrasing. Do not invent facts or personal details. Return only the rewritten text.",
      friendly: "Make the target text friendlier while preserving meaning, facts, and the writer's original judgment. Return only the rewritten text.",
      professional: "Make the target text more professional and restrained while preserving meaning and facts. Return only the rewritten text; avoid bureaucratic tone.",
      concise: "Make the target text concise while preserving important meaning, facts, and judgment. Return only the concise text.",
      summary: "Summarize the target text within 3 sentences, fewer than 60 words. Do not answer questions from the source text; summarize the text itself. Return only the summary.",
      keyPoints: "Extract concise Markdown key points from the target text. Only include points supported by the source.",
      list: "Turn the target text into a clear Markdown list while preserving important details. Do not add new information.",
      table: "Turn the target text into a useful Markdown table. If it is not suited to a table, provide the closest structure without inventing facts.",
    };
  }

  function taskInstruction(mode, options = {}) {
    const tasks = taskInstructions(options);
    return tasks[mode] || tasks.proofread;
  }

  return Object.freeze({
    changeRoutingNote,
    taskInstruction,
    taskInstructions,
    textServiceContract,
  });
})();
