let lastHkrrReviewReceiptId = "";

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
    const response = await fetchModelPayload({ model: getLocalModelRequestName(), messages: attachImagesToModelMessages(withMarkdownModelMessages([{ role: "user", content: prompt }]), teachTextFiguresReferencedIn(fullBody)), temperature: 0.2, max_tokens: 2600, ai_system6_task_kind: "hkrr" }, getLongTaskSignal());
    const data = await readChatJson(response);
    const reportText = stripRebuildMarkdownFence(data?.choices?.[0]?.message?.content || "");
    renderClaimCheckDraft(reportText);
    setStatus(t("hkrr_review_ready"));
    // The report is on screen the moment it renders, but nowhere durable
    // unless the writer separately clicks Save Review (saveHkrrReview); a
    // receipt makes it recoverable even if that click never happens.
    if (reportText) {
      const recorded = await window.AISystem6RunReceipts?.recordModelAnswer?.({
        projectId: activeProjectId,
        sourceAppId: "reviewDesk",
        intent: "hkrr-review",
        provider: (typeof cloudConfig !== "undefined" && cloudConfig?.active && cloudConfig.provider && typeof cloudCredentialReady === "function" && cloudCredentialReady()) ? "cloud" : "local",
        model: typeof getLocalModelRequestName === "function" ? getLocalModelRequestName() : "",
        answerText: reportText,
      });
      if (recorded?.receiptId) {
        lastHkrrReviewReceiptId = recorded.receiptId;
        window.AISystem6RunReceipts?.recordUserAction?.(recorded.receiptId, { action: "accept" });
      }
    }
  } catch (error) {
    if (!isAbortError(error)) {
      console.error("HKRR review failed", error);
      const message = friendlyErrorDetail(error);
      claimResultsEl.innerHTML = `<div class="empty-folder-note">${escapeHtml(message)}</div>`;
      setStatus(message);
    }
  } finally {
    endLongTask(taskKey);
  }
}

async function saveHkrrReview() {
  const markdown = claimResultsEl?.innerText.trim() || "";
  if (!markdown) return setStatus(t("hkrr_review_none_to_save"));
  const result = await showSystemModal(t("hkrr_review_save_confirm", clipContextContent(markdown, 1000)), "confirm");
  if (result !== "yes") return;
  const item = await addProjectCdItem(markdown, `HKRR Review - ${teachTextNameInput.value || t("review_desk")}`, {
    sourceDocumentId: activeTextFileId || "",
    sourceKind: "markdown",
  });
  if (item) {
    openWindow("projectCd");
    if (lastHkrrReviewReceiptId) {
      window.AISystem6RunReceipts?.finishReceipt?.(lastHkrrReviewReceiptId, {
        status: "completed",
        outputObjectIds: [item.id],
        destination: "projectCd",
      });
    }
  }
}

// Finder Label suggestions: the Review Desk / Claim Check is the one producer
// that may suggest a user label (counter / verify) — it reads the whole
// manuscript and emits structured risk. It writes finderLabelSuggestion only;
// finderLabel itself is written solely by the user in Get Info, so a
// suggestion can never silently color a file. Suggestions are overwritten by
// the next Claim Check; ignoring one costs nothing.
function suggestFinderLabelForClaimCheck(results = [], reportText = "", fileId = "") {
  if (!fileId) return;
  const file = chatFiles.find((item) => item.id === fileId && isInActiveProject(item));
  if (!file) return;
  const verdicts = (Array.isArray(results) ? results : []).map((entry) => String(entry.verdict || "")).filter(Boolean);
  const text = String(reportText || "");
  const mentions = (markers) => markers.some((marker) => marker && text.includes(marker));
  const contradiction = verdicts.includes(t("claim_verdict_contradiction"))
    || mentions([t("claim_verdict_contradiction"), "Possible Contradiction", "可能矛盾"]);
  const insufficient = verdicts.includes(t("claim_verdict_insufficient"))
    || mentions([t("claim_verdict_insufficient"), "Evidence Insufficient", "证据不足"])
    || verdicts.includes(t("claim_verdict_manual"))
    || mentions([t("claim_verdict_manual"), "Needs Manual Review", "需人工核实"]);
  let suggestion = null;
  if (contradiction) {
    suggestion = { id: "counter", reason: t("finder_label_suggestion_reason_contradiction") };
  } else if (insufficient) {
    suggestion = { id: "verify", reason: t("finder_label_suggestion_reason_insufficient") };
  }
  if (!suggestion) return;
  file.finderLabelSuggestion = {
    id: suggestion.id,
    reason: suggestion.reason,
    by: "claim-check",
    at: new Date().toISOString(),
  };
  file.updatedAt = new Date().toISOString();
  saveDeskState();
  renderDocuments();
  renderProjectDisks();
}
