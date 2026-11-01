// The desk tool list: one closed, code-constant registry of every tool a role,
// a skill or an unattended run may ever name (M8 slice 0, section 0.3).
//
// Two levels only: "read" (looks at the desk, changes nothing) and "propose"
// (hands the writer a candidate that waits for a decision). There is no write
// level, no shell, no execution and no new network capability, and none can be
// added by data: a role or a skill picks ids from this list, and anything else
// fails validation. Nothing here touches storage.
//
// The list is aligned with the desk-tools bridge the server relays to the page
// (apps/server/server/agent/desk-tools.js, answered by ENGINE_DESK_TOOLS in
// features/guest-tools.js). An entry the bridge does not implement is listed
// but unavailable, and the picker shows it as not selectable. `bridge` names
// the bridge tools an entry stands on; `proposalKind` names the engine's own
// proposal kind where one exists (docs/AGENT-HARNESS.md "Proposals"), as a
// fact for the later slices, not as availability.
//
// Plain script and CommonJS in one file, so the page and the server's
// validators import the same list. Contract: tests/features/agent-tool-registry.test.mjs

(function exposeAgentToolRegistry(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AISystem6AgentToolRegistry = api;
})(typeof globalThis !== "undefined" ? globalThis.window || null : null, () => {
  const LEVELS = Object.freeze(["read", "propose"]);

  function tool(id, en, zh, level, extra = {}) {
    return Object.freeze({
      id,
      label: Object.freeze({ en, zh }),
      level,
      bridge: Object.freeze(extra.bridge || []),
      proposalKind: extra.proposalKind || "",
    });
  }

  const TOOLS = Object.freeze([
    // Reads. The ones with a bridge tool are the six the engine can call today.
    tool("web", "Search and fetch the web", "搜索与抓取网页", "read"),
    tool("reader.*", "Read in Reader", "在阅读器中阅读", "read"),
    tool("sources.search", "Search project sources", "检索项目资料", "read", { bridge: ["search_project_sources"] }),
    tool("talk.quote", "Quote ClioTalk verbatim", "原文引用 ClioTalk 对话", "read"),
    tool("scrap.*", "Read Scrapbook clips", "读取剪贴簿剪报", "read", { bridge: ["list_scrapbook_clips"] }),
    tool("dossier.read", "Read the project dossier", "读取项目卷宗", "read", { bridge: ["list_project_objects", "read_project_object"] }),
    tool("floppy.read", "Read File Floppy items", "读取文件软盘条目", "read", { bridge: ["read_file_floppy_item"] }),
    tool("dictionary.list", "List dictionary terms", "列出词典条目", "read", { bridge: ["list_dictionary_terms"] }),
    tool("chart.range", "Read a chart range", "读取图表范围", "read"),
    tool("write.read", "Read the writing windows", "读取写作窗口", "read"),
    tool("chart.read", "Read ClioChart", "读取 ClioChart", "read"),
    tool("stage.read", "Read ClioStage", "读取 ClioStage", "read"),
    // Proposals. The bridge is read-only, so none is available through it yet.
    tool("propose.scrap", "Propose a clip", "提议一条剪报", "propose", { proposalKind: "scrap" }),
    tool("propose.flag", "Propose a flag", "提议一个标记", "propose", { proposalKind: "flag" }),
    tool("propose.new-document", "Propose a new document", "提议一份新文档", "propose", { proposalKind: "new-document" }),
    tool("propose.revision", "Propose an errand revision", "提议跑腿修订", "propose"),
    tool("propose.format", "Propose a formatting candidate", "提议格式类候选", "propose"),
    tool("propose.chart", "Propose a new chart", "提议新图表", "propose"),
  ]);

  const byId = new Map(TOOLS.map((entry) => [entry.id, entry]));

  /** Every bridge tool name some entry stands on. */
  const BRIDGE_TOOL_NAMES = Object.freeze([...new Set(TOOLS.flatMap((entry) => entry.bridge))]);

  const toolById = (id) => byId.get(String(id)) || null;
  const isKnownToolId = (id) => byId.has(String(id));
  const isAvailable = (id) => (byId.get(String(id))?.bridge.length || 0) > 0;
  const availableToolIds = () => TOOLS.filter((entry) => entry.bridge.length > 0).map((entry) => entry.id);

  /**
   * Check the ids a role or a skill names against the list. Unknown ids are
   * refused; known but unavailable ones are reported apart so a picker can
   * show them as not selectable without losing them.
   */
  function validateToolIds(ids) {
    const list = Array.isArray(ids) ? ids : [];
    const unknown = [];
    const unavailable = [];
    for (const id of list) {
      if (!isKnownToolId(id)) unknown.push(String(id));
      else if (!isAvailable(id)) unavailable.push(String(id));
    }
    return Object.freeze({ ok: unknown.length === 0, unknown, unavailable });
  }

  return Object.freeze({
    LEVELS,
    TOOLS,
    BRIDGE_TOOL_NAMES,
    toolById,
    isKnownToolId,
    isAvailable,
    availableToolIds,
    validateToolIds,
  });
});
