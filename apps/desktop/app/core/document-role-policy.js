// Central document role capabilities. Keep UI affordance checks here before adding role-specific ifs.

const documentRolePolicies = {
  reader: {
    source_view: ["copy", "clip", "discuss", "makeDocMap", "sendCopyToManuscript"],
    export_preview: ["copy", "clip", "discuss", "makeDocMap", "sendCopyToManuscript"],
  },
  timeMachine: {
    web_navigation: ["browse", "copy", "clip", "discuss", "makeDocMap", "sendCopyToManuscript"],
  },
  teachText: {
    manuscript: ["edit", "save", "writingFlow", "review", "projectCdExport", "slidesExport", "makeDocMap", "clip"],
    scratch_file: ["edit", "save", "saveCopy", "makeDocMap", "clip"],
  },
  docMap: {
    docmap: ["ask", "export", "saveDocMap", "sendNodeToWritingFlow", "replaceOutline", "revealSource"],
  },
};

function getDocumentRolePolicy(app, role) {
  return documentRolePolicies[app]?.[role] || [];
}

function documentRoleAllows(app, role, action) {
  return getDocumentRolePolicy(app, role).includes(action);
}

function activeTeachTextAllows(action) {
  const role = typeof teachTextDocumentRole === "string" ? teachTextDocumentRole : getActiveDocumentTab("teachText")?.role;
  return documentRoleAllows("teachText", role, action);
}

// TeachText's storyboard rows (「生成分镜图」, and 「精修这一镜…」 inside a
// storyboard) are an affordance of the document in hand, so they are asked for
// here - this module is already loaded at boot - the first time a TeachText
// Commands menu opens. The rows themselves live in the lazy storyboard module,
// which inserts them and settles whether they can run.
if (typeof document !== "undefined" && typeof ensureStoryboardAsciiModule === "function") {
  document.addEventListener("toggle", (event) => {
    const details = event.target;
    if (!details?.open || !details.matches?.('[data-window="teachText"] .teachtext-command-menu')) return;
    ensureStoryboardAsciiModule()
      .then(() => window.AISystem6StoryboardAscii?.syncTeachTextCommandRows?.(details))
      .catch((error) => console.warn("AI System 6: the storyboard commands failed to load.", error));
  }, true);
}

globalThis.AISystem6DocumentRolePolicy = Object.freeze({
  getDocumentRolePolicy,
  documentRoleAllows,
  activeTeachTextAllows,
});
