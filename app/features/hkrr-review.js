async function runHkrrReview(options = {}) {
  if (!ensureTeachTextReviewState({ promoteSavedFinal: true })) return;
  const fullBody = teachTextBodyInput.value.trim();
  const section = currentReviewDeskSectionBlock(fullBody);
  const body = section?.text?.trim() || "";
  if (!body) return setStatus(t("teachtext_empty"));
  const taskKey = "hkrr-review-section";
  const runningLabel = currentLanguage === "zh" ? `正在用 HKRR 审视章节：${section.title}...` : `Reviewing section with HKRR: ${section.title}...`;
  if (!beginLongTask(taskKey, runningLabel)) return;
  openReviewDesk("hkrr");
  setClaimCheckWaiting(runningLabel);
  const prompt = `你是 AI System 6 的中文内容审校顾问。请用 HKRR 审视当前章节，只把全文作为语境。
HKRR：Happiness=发现感/趣味/反直觉；Knowledge=信息增量/知识密度/人话解释；Resonance=共鸣/人的感受/情绪落点；Rhythm=节奏/呼吸/停顿/转场/回收。
请判断这一节是否好看、有料、有共鸣、读得下去。不要事实核查，不要来源引用，不要重写全文，不要打分，不要排名，不要追求爆款。
返回 Markdown。只输出一张表，字段为：位置 / HKRR / 观察 / 影响 / 方向。
“位置”列不要重复章节标题；每行都要写一个唯一的局部锚点，用 4-10 个字概括本条观察对应的句群或写作动作，例如“硬件升级”“重量对比”“双面夹细节”“第三方键盘”“结尾保留点”。
“方向”列不要再重复位置、段落、开头、结尾、前后文等定位信息，只写创作动作、改法和可直接采用的示例句。
每条方向都要是创作层面的可执行建议，例如补一个反直觉切入、增加具体画面、把知识点消化成一句人话、补一个情绪落点、增加停顿或短句断行。
如果方向需要多行短句示例，可以在同一个表格单元格里使用 <br> 换行；不要把 <br> 包进反引号。
最多 6 条。如果整体已经成立，也要指出最值得保留的 HKRR 优点。使用自然简体中文，不要泛泛教学。输出前静默检查格式，不要写出检查过程。

当前章节：
${body}

全文语境：
${fullBody}`;
  try {
    const response = await fetchModelPayload({ model: getLocalModelRequestName(), messages: withMarkdownModelMessages([{ role: "user", content: prompt }]), temperature: 0.2, max_tokens: 2600, ai_system6_task_kind: "hkrr" }, getLongTaskSignal());
    const data = await readChatJson(response);
    renderClaimCheckDraft(stripRebuildMarkdownFence(data?.choices?.[0]?.message?.content || ""));
    setStatus(currentLanguage === "zh" ? "HKRR 审视完成。" : "HKRR review ready.");
  } catch (error) {
    if (!isAbortError(error)) claimResultsEl.innerHTML = `<div class="empty-folder-note">${escapeHtml(error.message)}</div>`;
  } finally {
    endLongTask(taskKey);
  }
}

async function saveHkrrReview() {
  const markdown = claimResultsEl?.innerText.trim() || "";
  if (!markdown) return setStatus("No HKRR Review to save.");
  const result = await showSystemModal(`Save Review report?\n\n${clipContextContent(markdown, 1000)}`, "confirm");
  if (result !== "yes") return;
  const item = addProjectCdItem(markdown, `HKRR Review - ${teachTextNameInput.value || t("review_desk")}`);
  if (item) openWindow("projectCd");
}
