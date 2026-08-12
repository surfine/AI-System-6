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
