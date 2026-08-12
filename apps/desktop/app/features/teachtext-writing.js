// Feature module: teachtext-writing.

// Loaded before app.js as a classic script; shares the AI System 6 global scope.



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
