// Feature module: teachtext-writing.

// Loaded before app.js as a classic script; shares the AI System 6 global scope.



function clearChatToTrash() {
  const hadConversation = conversation.length > 0;
  window.AISystem6QuickDraft?.clearVentLog?.({ silent: true });
  if (typeof isQuickDraftClioTalkActive === "function" && isQuickDraftClioTalkActive()) {
    resetClioTalkRuntimeState?.({ clearPrompt: true });
    setStatus(t("chat_moved"));
    return;
  }
  if (conversation.length) {
    trashItems.unshift({
      projectId: activeProjectId,
      title: `Digest ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
      body: compressConversation(),
    });
  }

  conversation.length = 0;
  compressedConversationMemory = { text: "", sourceMessages: 0, updatedAt: "" };
  attachedClipIds.clear();
  renderAttachedClips();
  messagesEl.replaceChildren();
  setStatus(t("chat_moved"));
  renderTrash();
  saveDeskState();
  if (hadConversation) playSystemSound("trash");
}

function saveLastReply() {
  if (!lastAssistantText) {
    openWindow("scrapbook");
    scrapBodyInput.value = t("no_reply_saved");
    return;
  }

  createScrap(null, lastAssistantText);
}

function clipLastReplyToScrapbook() {
  if (!lastAssistantText) {
    setStatus(t("no_reply_clip"));
    return;
  }

  createScrap(
    null,
    [
      `> ${lastAssistantText}`,
      "",
      "Source: ClioTalk",
      `Saved: ${new Date().toLocaleString()}`,
    ].join("\n")
  );
}

function insertLastReplyIntoTeachText() {
  if (!lastAssistantText) {
    setStatus(t("no_reply_insert"));
    return;
  }

  insertIntoTeachText(lastAssistantText, {
    source: t("assistant"),
    title: t("assistant"),
  });
}
