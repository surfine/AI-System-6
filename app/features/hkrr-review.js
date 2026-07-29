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
  const prompt = `${resolveWritingRoutePrompt("writing-route.review-hkrr")}

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
