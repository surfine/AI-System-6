// The built-in roles (M8 slice 0.3 and roles slices 1-2): code constants, not
// stored data. A role is a name, a purpose, a one-paragraph instruction and a
// tool list picked from the closed desk tool list (agent-tool-registry.js).
// The tool table of a built-in role is never edited; the writer may only
// switch a role off (owner ruling V9).
//
// How a role works in a task: the main agent (ClioTalk) offers a `handoff`
// proposal {role, task}; the page, if the role is switched on, starts a
// sequential sub-turn with that role's brief. The dsh subagent mechanism is not
// used: this engine runs with no subagents (docs/AGENT-HARNESS.md), so a role
// is one more read-level turn of the same task. Its tool limit is the kinds of
// proposals it may offer (proposalKinds): the `propose.*` tools of its table
// that have an engine kind, plus `deliver` to hand its answer back. It changes
// no file of the writer's and has no `plan`, `question`, `skill` or `memory`.
//
// Plain script and CommonJS in one file, shared by the page and the server.
// Contract: tests/features/agent-roles.test.mjs

(function exposeAgentRoles(root, factory) {
  let registry = root && root.AISystem6AgentToolRegistry;
  if (!registry && typeof module === "object" && module.exports) registry = require("./agent-tool-registry.js");
  const api = factory(registry, root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AISystem6AgentRoles = api;
})(typeof globalThis !== "undefined" ? globalThis.window || null : null, (registry, root) => {
  const OFF_KEY = "ai-system-6-roles-off";

  function role(id, en, zh, purposeEn, purposeZh, instruction, tools, main = false) {
    return Object.freeze({ id, main, name: Object.freeze({ en, zh }), purpose: Object.freeze({ en: purposeEn, zh: purposeZh }), instruction, tools: Object.freeze(tools) });
  }

  const ROLES = Object.freeze([
    role("clio", "ClioTalk", "ClioTalk", "The main agent: hands out work, reads the dossier, offers plans, questions and the hand-over.", "主代理：派工、读卷宗、提议计划与提问、交付。",
      "You are the main agent.", ["dossier.read", "floppy.read", "propose.revision", "propose.new-document"], true),
    role("researcher", "Researcher", "研究员", "Finds sources, reads web pages and Reader, hands back clips with their origin.", "找资料、读网页和阅读器，交剪报与出处。",
      "You are the researcher. Find what the task asks for and hand back verbatim passages with where each came from. Never rewrite the writer's own text.", ["web", "reader.*", "sources.search", "propose.scrap"]),
    role("checker", "Checker", "核对员", "Checks numbers, dates, names and quotations; hands back errands and flags only.", "核对数字、日期、人名、引文，只交跑腿件和标记。",
      "You are the checker. Check numbers, dates, names and quotations against the dossier. Flag what does not match; never fix it yourself.", ["dossier.read", "chart.range", "propose.flag", "propose.revision"]),
    role("organizer", "Organizer", "整理员", "Turns recordings, chats and clips into verbatim clips and lists.", "把录音稿、聊天、剪报整理成原文剪报和清单。",
      "You are the organizer. Sort recordings, chats and clips into verbatim clips and lists. Other people's words stay theirs: quote them with who said them to whom.", ["talk.quote", "scrap.*", "propose.scrap", "propose.new-document"]),
    role("layout", "Layout", "排版员", "Format, tables, charts and slide layout; never the words.", "格式、表格、图表、投影片版面，不碰文字。",
      "You are the layout hand. Work on format, tables, charts and slide layout only; do not change any wording.", ["write.read", "chart.read", "stage.read", "propose.format", "propose.chart"]),
  ]);

  const byId = (id) => ROLES.find((entry) => entry.id === String(id)) || null;
  const targets = () => ROLES.filter((entry) => !entry.main);

  /** The kinds of proposal a role turn may offer: its `propose.*` kinds, and deliver. */
  function proposalKinds(id) {
    const entry = byId(id);
    if (!entry || entry.main) return [];
    const kinds = entry.tools.map((toolId) => registry.toolById(toolId)?.proposalKind).filter(Boolean);
    return [...new Set([...kinds, "deliver"])];
  }

  /** What a role turn's engine reads first. */
  function brief(id) {
    const entry = byId(id);
    if (!entry || entry.main) return "";
    return [
      `[AI System 6] For this turn you are a role the main agent handed a sub-task to: ${entry.name.en}.`,
      entry.instruction,
      `Your tools: ${entry.tools.join(", ")}. This turn is read-only: change no file. Offer only: ${proposalKinds(id).join(", ")}. Finish with a deliver proposal that says what you found, in plain sentences.`,
    ].join("\n");
  }

  // The writer's switches: a small preference, kept in localStorage.
  let memory = [];
  const storage = () => {
    try { return root?.localStorage || null; } catch { return null; }
  };
  function off() {
    const store = storage();
    if (!store) return memory;
    try {
      const raw = JSON.parse(store.getItem(OFF_KEY) || "[]");
      return Array.isArray(raw) ? raw.map(String) : [];
    } catch {
      return memory;
    }
  }
  const isEnabled = (id) => !off().includes(String(id));
  function setEnabled(id, enabled) {
    const next = off().filter((entry) => entry !== String(id));
    if (!enabled && byId(id) && !byId(id).main) next.push(String(id));
    memory = next;
    try { storage()?.setItem(OFF_KEY, JSON.stringify(next)); } catch { /* the switch holds for this session */ }
  }
  const enabledTargets = () => targets().filter((entry) => isEnabled(entry.id));

  return Object.freeze({ ROLES, byId, targets, enabledTargets, proposalKinds, brief, isEnabled, setEnabled });
});
