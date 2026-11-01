// ClioTalk shell (M2 slices 1-5): the three regions of the Clio main interface
// (docs: internal/design-proposals/2026-10-30-clio-main-ui). Lazy: loaded by
// ensureClioTalkShellModule when the ClioTalk window opens, so none of this
// rides the boot floppy, nor do its words: they are LOCAL_STRINGS below,
// merged into the language tables when the module loads.
//
// What it does, and nothing else:
//   1. wraps the window's existing stage and composer in .clio-shell with a
//      sidebar (新对话, 搜索, 项目, ClioWork, ClioCode, 最近) beside them;
//   2. moves the window's details bar (chat file, Agent, Connect AI) into the
//      top of the conversation column, so nothing sits over the sidebar;
//   3. adds a greeting that the empty state shows above the composer, and,
//      with no model connected, one line under the composer that says so
//      beside the existing Connect AI action;
//   4. puts the existing model menu (renderCloudModelPopover) in the composer;
//   5. adds the output panel on the right: 打开 on a reply shows it there
//      (预览 / 原文), and its three buttons are the reply's own verbs: the
//      Use Reply dialog with that destination picked, and Discard with its
//      confirmation. While it is open the sidebar narrows to a rail. ⌘\
//      shows and hides it;
//   6. shows a task (Work.dc.html) in the conversation: its plan, its
//      questions and its asks for permission are cards in the thread, and
//      the same right-hand panel shows its progress (steps, what it made,
//      what it may touch, tokens). While it runs, Send is Stop and Esc
//      stops it; while a card waits on the writer, what the writer sends
//      from the composer is the answer. The module draws only the snapshots
//      handed to AISystem6ClioTalkShell.tasks.apply() and passes the
//      writer's answers to the transport given to tasks.connect(); it
//      stores nothing;
//   7. on a phone held upright (Phone.dc.html) shows one layer at a time: the
//      sidebar as the list page, or the conversation under a 44px head (back,
//      its name, progress). A task's state rides in a strip above the
//      composer, and the panel is a bottom sheet that a tap on the strip
//      opens and a swipe down (or a flick) puts away. Held sideways, or on
//      a tablet, the window keeps the three columns.
//   8. ClioWork, the document studio, is the main column's other page (the
//      sidebar's ClioWork row): the project's Office documents, a composer
//      that hands Clio a job over the ticked ones through the agent's task
//      layer, the job in hand, and each document opened in its own app
//      beside this window. On the phone it is a layer of its own.
// Chat behaviour is otherwise untouched: Send, Stop, attachments, the + menu
// and the web toggle are the elements that were already there, moved into
// the new frame.
// The skins are Liquid Glass (data-skin="glass"; Yosemite and Big Sur wear it
// too and bring their own colours through the --cl-*-era hooks) and Classic
// (data-skin="classic"), kept in step with the appearance below, in
// styles/99-cliotalk-shell.css; in any other appearance the wrapper is
// display: contents and the sidebar, greeting and note are hidden.
(function (root) {
  "use strict";
  if (root.AISystem6ClioTalkShell) return;

  // The shell's words ride with it, not with the boot's language tables.
  // installStrings() merges them into both tables when the module loads, and
  // again once the desk's language is ready: a table that arrives later
  // keeps what was merged before it (ensureLanguageFor), but a module
  // loaded mid-boot is not left to depend on that.
  const LOCAL_STRINGS = {
    en: {
      clio_shell_nav: "Clio navigation",
      clio_shell_new: "New Chat",
      clio_shell_conversations: "Conversations",
      clio_shell_search: "Search",
      clio_shell_search_placeholder: "Search conversations",
      clio_work_lead: "Give Clio a job on your Office documents. What it changes comes back as tracked revisions, and you accept them one by one in the app.",
      clio_work_count: (count, project) => `${count} ${count === 1 ? "document" : "documents"} in ${project}`,
      clio_work_docs: "Documents",
      clio_work_pick: (name) => `Lend ${name} to Clio`,
      clio_work_open: "Open",
      clio_work_open_in: (app) => `Open in ${app}`,
      clio_work_lent: "Lent to Clio",
      clio_work_revisions: (count) => `${count} ${count === 1 ? "revision" : "revisions"} to review`,
      clio_work_today: (time) => `Today ${time}`,
      clio_work_prompt: "What should Clio do with these documents?",
      clio_work_none_picked: "Tick up to three documents to lend Clio.",
      clio_work_limit: (count) => `Clio borrows ${count} documents at most.`,
      clio_work_picked: "Lent to Clio",
      clio_work_unpick: (name) => `Take back ${name}`,
      clio_work_start: "Give to Clio",
      clio_work_note: "Clio works on copies. Nothing changes in a file until you accept it there.",
      clio_work_suggest_merge: "Merge these into one report",
      clio_work_suggest_formulas: "Check the formulas in this sheet",
      clio_work_suggest_deck: "Turn this draft into a 10-slide deck",
      clio_work_suggest_facts: "Check the numbers and dates",
      clio_work_empty_title: "No Office documents yet",
      clio_work_empty_body: "Make a ClioWrite, ClioChart or ClioStage document, or import a .docx, .xlsx or .pptx onto the Project Hard Disk.",
      clio_work_new: "New Document\u2026",
      clio_work_no_project_title: "Open a project first",
      clio_work_no_project_body: "ClioWork works on the Office documents of the open project.",
      clio_work_job: "Current job",
      clio_work_job_back: "Back to the conversation",
      clio_work_job_docs: (names) => `Lent: ${names}`,
      clio_shell_later_code: "ClioCode arrives in a later release.",
      clio_shell_recent: "Recent",
      clio_shell_no_recent: "No conversations yet",
      clio_shell_no_match: "No matching conversation",
      clio_shell_greeting: "What are we writing today?",
      clio_shell_model: "Model",
      clio_shell_model_needed: "No model is connected yet. Connect one in Control Panel.",
      clio_shell_quota_spent: "The website AI has spent today\u2019s shared budget. Try again tomorrow, or connect your own model in Control Panel.",
      clio_shell_candidate: "Candidate",
      clio_shell_source: "Source",
      clio_shell_close_panel: "Close panel",
      clio_shell_save_disk: "Save to Disk",
      clio_shell_add_sheet: "Add to Question Sheet",
      clio_shell_discard: "Discard",
      clio_shell_toggle_panel: "Show or Hide Output Panel",
      clio_task_plan: "Plan",
      clio_task_approve: "Go Ahead",
      clio_task_revise: "Change Plan…",
      clio_task_read_only: "The first round only reads. Nothing changes until you click “Go Ahead.”",
      clio_task_planning: "Clio is drafting a plan; this round only reads.",
      clio_task_stopped_note: "The task stopped.",
      clio_task_done: "Done",
      clio_task_failed_note: "The task didn’t finish.",
      clio_task_question: "Clio’s question",
      clio_task_answer: (count) => (count === 2 ? "Use These Two" : count === 3 ? "Use These Three" : count === 4 ? "Use These Four" : count > 4 ? "Use These" : "Use This"),
      clio_task_write_own: "I’ll Write It",
      clio_task_you_wrote: (text) => `You wrote: “${text}”`,
      clio_task_permission: "Clio asks permission",
      clio_task_permit_once: "Allow Once",
      clio_task_permit_task: "Allow for This Task",
      clio_task_permit_deny: "Don’t Allow",
      clio_task_progress: "Progress",
      clio_task_outputs: "Made",
      clio_task_no_outputs: "Nothing yet. What the task makes appears here; click to preview.",
      clio_task_uses: "Uses",
      clio_task_level_read: "Read only",
      clio_task_level_propose: "Can propose",
      clio_task_level_change: "Can change",
      clio_task_web: "Web",
      clio_task_web_on: "On",
      clio_task_web_off: "Off",
      clio_task_tokens: (count) => `${count} tokens`,
      clio_task_cost: (amount) => `About ¥${amount}`,
      clio_task_state_planning: "Drafting a plan",
      clio_task_state_awaiting_plan: "Waiting for you to review the plan",
      clio_task_state_working: (step, total) => (total ? `Step ${step} of ${total}` : "Working"),
      clio_task_state_awaiting_answer: (step, total) => (total ? `Waiting for your answer (step ${step} of ${total})` : "Waiting for your answer"),
      clio_task_state_awaiting_permission: "Waiting for your permission",
      clio_task_state_delivered: "Handed to you",
      clio_task_state_stopped: "Stopped",
      clio_task_state_failed: "Didn’t finish",
      clio_task_state_settled: "Put away",
      balloon_clio_stop_task: "Stops this task. What it already made stays. Esc or ⌘. does the same. To add something instead, type it and press Return: it is sent when this turn ends.",
      clio_task_queue_running: "Queued \u2014 sent when this turn ends",
      clio_task_queue_held: "Queued \u2014 goes along when you approve or answer",
      clio_task_queue_remove: "Remove",
      clio_task_queue_remove_label: (text) => `Remove \u201c${text}\u201d from the queue`,
      clio_task_queue_dropped: (count) => `${count} queued ${count === 1 ? "message was" : "messages were"} not sent: the task ended first.`,
      clio_task_queue_dropped_start: (count) => `${count} queued ${count === 1 ? "message was" : "messages were"} not sent: the next turn could not start.`,
      clio_task_interrupted_note: "The task was interrupted when this Mac or the server restarted. What it already made is kept.",
      clio_task_continue: "Continue",
      clio_task_continue_words: "Continue where you left off.",
      clio_task_ledger: "Ledger",
      clio_task_ledger_facts: "Established",
      clio_task_ledger_done: "Done",
      clio_task_ledger_next: "Next",
      clio_task_ledger_stuck: "Its own words: stuck",
      clio_task_ledger_looping: "Its own words: going in circles",
      clio_task_turns: "Turns",
      clio_task_turn_n: (n) => `Turn ${n}`,
      clio_task_fork: "Fork",
      clio_task_fork_label: (n) => `Fork a new task from turn ${n}`,
      clio_review_open: "Open in ClioWrite",
      clio_review_take: "Take",
      clio_review_return: "Send Back",
      clio_review_revisions: "Revisions",
      clio_review_errand_basis: (name) => `Errand, from ${name}`,
      clio_review_errand_reason: (reason) => `Errand: ${reason}`,
      clio_review_voice_title: (n) => `Rewrites paragraph ${n}`,
      clio_review_voice_note: "Wording: it changes your own sentence. Take it one at a time; once taken it is marked “AI words.”",
      clio_review_insert: (text) => `Adds “${text}”`,
      clio_review_remove: (text) => `Removes “${text}”`,
      clio_review_count: (total, errands, voice) => `${total} ${total === 1 ? "revision" : "revisions"}: ${errands} ${errands === 1 ? "errand" : "errands"}, ${voice} wording`,
      clio_review_done: "Nothing left to decide.",
      clio_review_waiting: "The revisions arrive when ClioWrite opens this file.",
      clio_task_claimed: "It says it handed over",
      clio_task_measured: "Actually changed",
      clio_task_measured_doc: (name, count) => `${count} ${count === 1 ? "revision" : "revisions"} in ${name}`,
      clio_task_measured_files: (count) => `${count} ${count === 1 ? "file" : "files"} in the shared folder`,
      clio_task_measured_new: (count) => `${count} new ${count === 1 ? "document" : "documents"} as candidates`,
      clio_task_measured_none: "Nothing changed",
      clio_task_mismatch: "These don\u2019t match",
      clio_task_lend: "Lent",
      clio_task_lend_pick: "Lend Documents\u2026",
      clio_task_lend_count: (count) => `${count} ${count === 1 ? "document" : "documents"}`,
      clio_task_lend_title: "Documents Lent to the Agent",
      clio_task_lend_note: "The agent sees only a plain-text copy of each document. What it changes comes back as revisions for you to decide one by one.",
      clio_task_lend_nothing: "This project has no Word, Excel or PowerPoint files yet.",
      clio_task_lend_limit: (count) => `A task takes at most ${count} documents, plus one shared folder.`,
      clio_task_needs_mount: "Choose a shared folder or lend a document first.",
    },
    zh: {
      clio_shell_nav: "Clio 导航",
      clio_shell_new: "新对话",
      clio_shell_conversations: "对话列表",
      clio_shell_search: "搜索",
      clio_shell_search_placeholder: "搜索对话",
      clio_work_lead: "把 Office 文件交给 Clio 做事。它的改动会以修订回到原文件，由你在应用里一处一处收下。",
      clio_work_count: (count, project) => `「${project}」里的 ${count} 份文件`,
      clio_work_docs: "文件",
      clio_work_pick: (name) => `把「${name}」借给 Clio`,
      clio_work_open: "打开",
      clio_work_open_in: (app) => `在 ${app} 打开`,
      clio_work_lent: "借给 Clio 中",
      clio_work_revisions: (count) => `${count} 处修订等你看`,
      clio_work_today: (time) => `今天 ${time}`,
      clio_work_prompt: "要 Clio 对这些文件做什么？",
      clio_work_none_picked: "勾选最多三份文件借给 Clio。",
      clio_work_limit: (count) => `一次最多借 ${count} 份。`,
      clio_work_picked: "借给 Clio",
      clio_work_unpick: (name) => `收回「${name}」`,
      clio_work_start: "交给 Clio",
      clio_work_note: "Clio 在副本上做事。你在文件里收下之前，原文一个字也不会变。",
      clio_work_suggest_merge: "把这几份合成一份报告",
      clio_work_suggest_formulas: "核对这张表的公式",
      clio_work_suggest_deck: "把这份稿子做成 10 页演示",
      clio_work_suggest_facts: "核对文中的数字和日期",
      clio_work_empty_title: "这个项目还没有 Office 文件",
      clio_work_empty_body: "新建一份 ClioWrite、ClioChart 或 ClioStage 文件，或把 .docx、.xlsx、.pptx 导入项目硬盘。",
      clio_work_new: "新建文件\u2026",
      clio_work_no_project_title: "先打开一个项目",
      clio_work_no_project_body: "ClioWork 处理的是当前项目里的 Office 文件。",
      clio_work_job: "正在做的事",
      clio_work_job_back: "回到对话",
      clio_work_job_docs: (names) => `借出：${names}`,
      clio_shell_later_code: "ClioCode 会在之后的版本加入。",
      clio_shell_recent: "最近",
      clio_shell_no_recent: "还没有对话",
      clio_shell_no_match: "没有匹配的对话",
      clio_shell_greeting: "今天写什么？",
      clio_shell_model: "模型",
      clio_shell_model_needed: "还没有连接模型。请到控制面板连接一个。",
      clio_shell_quota_spent: "网站 AI 今天的共享额度用完了。明天再用，或在控制面板连接你自己的模型。",
      clio_shell_candidate: "候选",
      clio_shell_source: "原文",
      clio_shell_close_panel: "关闭面板",
      clio_shell_save_disk: "放到项目硬盘",
      clio_shell_add_sheet: "记到问题单",
      clio_shell_discard: "丢弃",
      clio_shell_toggle_panel: "显示或隐藏产出面板",
      clio_task_plan: "计划",
      clio_task_approve: "照这个做",
      clio_task_revise: "改计划…",
      clio_task_read_only: "第一轮只读。你点「照这个做」才开始动手。",
      clio_task_planning: "Clio 在拟计划，这一轮只读。",
      clio_task_stopped_note: "任务停了。",
      clio_task_done: "收好",
      clio_task_failed_note: "任务没做完。",
      clio_task_question: "Clio 的问题",
      clio_task_answer: (count) => (count === 2 ? "就这两个" : count === 3 ? "就这三个" : count === 4 ? "就这四个" : count > 4 ? "就这些" : "就这个"),
      clio_task_write_own: "我自己写",
      clio_task_you_wrote: (text) => `你写的：「${text}」`,
      clio_task_permission: "Clio 请你允许",
      clio_task_permit_once: "允许一次",
      clio_task_permit_task: "本任务允许",
      clio_task_permit_deny: "不允许",
      clio_task_progress: "进度",
      clio_task_outputs: "产出",
      clio_task_no_outputs: "还没有。做好的东西会出现在这里，点开就能预览。",
      clio_task_uses: "用到的",
      clio_task_level_read: "只读",
      clio_task_level_propose: "可提议",
      clio_task_level_change: "可改",
      clio_task_web: "网页",
      clio_task_web_on: "开",
      clio_task_web_off: "关",
      clio_task_tokens: (count) => `${count} token`,
      clio_task_cost: (amount) => `约 ¥${amount}`,
      clio_task_state_planning: "在拟计划",
      clio_task_state_awaiting_plan: "等你看计划",
      clio_task_state_working: (step, total) => (total ? `第 ${step} 步，共 ${total} 步` : "在做"),
      clio_task_state_awaiting_answer: (step, total) => (total ? `等你回答（第 ${step} 步，共 ${total} 步）` : "等你回答"),
      clio_task_state_awaiting_permission: "等你允许",
      clio_task_state_delivered: "交给你了",
      clio_task_state_stopped: "停了",
      clio_task_state_failed: "没做完",
      clio_task_state_settled: "收好了",
      balloon_clio_stop_task: "停下这个任务，已经做好的会留着。Esc 或 ⌘. 一样可以停。想补充的话，写好按回车：这一轮结束后会发出去。",
      clio_task_queue_running: "已排队，这一轮结束后发出",
      clio_task_queue_held: "已排队，你确认或回答时一并发出",
      clio_task_queue_remove: "移除",
      clio_task_queue_remove_label: (text) => `把「${text}」移出排队`,
      clio_task_queue_dropped: (count) => `排队的 ${count} 条补充没有发出：任务先结束了。`,
      clio_task_queue_dropped_start: (count) => `排队的 ${count} 条补充没有发出：下一轮没能开始。`,
      clio_task_interrupted_note: "这台 Mac 或服务重启时，任务被打断了。它已经做出的东西都留着。",
      clio_task_continue: "继续",
      clio_task_continue_words: "接着刚才停下的地方继续。",
      clio_task_ledger: "账本",
      clio_task_ledger_facts: "已确认",
      clio_task_ledger_done: "已做",
      clio_task_ledger_next: "下一步",
      clio_task_ledger_stuck: "它自己说：卡住了",
      clio_task_ledger_looping: "它自己说：在原地打转",
      clio_task_turns: "各轮",
      clio_task_turn_n: (n) => `第 ${n} 轮`,
      clio_task_fork: "分叉",
      clio_task_fork_label: (n) => `从第 ${n} 轮分出一个新任务`,
      clio_review_open: "在 ClioWrite 打开",
      clio_review_take: "收下",
      clio_review_return: "退回",
      clio_review_revisions: "修订",
      clio_review_errand_basis: (name) => `跑腿件，依据${/^[\x21-\x7e]/.test(name) ? " " : ""}${name}`,
      clio_review_errand_reason: (reason) => `跑腿件，${reason}`,
      clio_review_voice_title: (n) => `改写第 ${n} 段`,
      clio_review_voice_note: "动字件，改的是你的句子；只能一条条收，收下会标「AI 字」。",
      clio_review_insert: (text) => `加上「${text}」`,
      clio_review_remove: (text) => `删去「${text}」`,
      clio_review_count: (total, errands, voice) => `${total} 条修订：${errands} 条跑腿，${voice} 条动字`,
      clio_review_done: "没有等你决定的修订了。",
      clio_review_waiting: "在 ClioWrite 打开这份文件，修订才会送达。",
      clio_task_claimed: "它说交了",
      clio_task_measured: "实际改了",
      clio_task_measured_doc: (name, count) => `${name} 里 ${count} 处`,
      clio_task_measured_files: (count) => `共享文件夹里 ${count} 个文件`,
      clio_task_measured_new: (count) => `${count} 份新文件候选`,
      clio_task_measured_none: "没有改动",
      clio_task_mismatch: "两边对不上",
      clio_task_lend: "借出",
      clio_task_lend_pick: "借出文件…",
      clio_task_lend_count: (count) => `${count} 份文件`,
      clio_task_lend_title: "借给代理的文件",
      clio_task_lend_note: "代理只看到每份文件的纯文本副本。它改的地方会以修订送回，由你一条条决定。",
      clio_task_lend_nothing: "这个项目里还没有 Word、Excel 或 PowerPoint 文件。",
      clio_task_lend_limit: (count) => `一个任务最多借出 ${count} 份文件，另加一个共享文件夹。`,
      clio_task_needs_mount: "先选一个共享文件夹，或借出一份文件。",
    },
  };
  const language = (code) => (root[code === "zh" ? "AISystem6TranslationsZh" : "AISystem6TranslationsEn"] ||= {});
  function installStrings() {
    Object.assign(language("en"), LOCAL_STRINGS.en);
    Object.assign(language("zh"), LOCAL_STRINGS.zh);
  }

  const tr = (key, ...args) => (typeof t === "function" ? t(key, ...args) : key);
  const icon = (paths) => `<svg class="cl-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" focusable="false">${paths}</svg>`;
  const ICONS = {
    plus: '<path d="M8 3v10M3 8h10"/>',
    search: '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/>',
    project: '<rect x="2.5" y="3" width="11" height="10" rx="2"/><path d="M2.5 6.5h11"/>',
    work: '<path d="M3 3h6l4 4v6H3z"/><path d="M9 3v4h4"/>',
    code: '<path d="M6 4 2.5 8 6 12M10 4l3.5 4-3.5 4"/>',
    folder: '<path d="M2.5 4.5h4l1.5 1.5h5.5v6.5h-11z"/>',
    close: '<path d="M4 4l8 8M12 4l-8 8"/>',
    back: '<path d="M10 3.5 5.5 8l4.5 4.5"/>',
    list: '<path d="M3 4.5h10M3 8h10M3 11.5h6"/>',
    up: '<path d="M4 10l4-4 4 4"/>',
  };
  const RECENT_LIMIT = 40;
  // The panel's open and close, and a card's arrival, in ms; the sheet's
  // keyframes run as long.
  const PANEL_IN_MS = 180;
  const PANEL_OUT_MS = 180;
  const CARD_IN_MS = 200;
  // The phone's sheet rises in 400ms and drops in 280ms; let go of it moving
  // down faster than this (px per ms) and it goes, however far it was pulled.
  const SHEET_IN_MS = 400;
  const SHEET_OUT_MS = 280;
  const SHEET_FLICK = 0.5;
  // A phone held upright, as the desk's own phone shell reads it
  // (window-manager.js: phoneViewportQuery, portrait).
  const PHONE_QUERY = "(max-width: 860px) and (orientation: portrait)";
  // A task in one of these has nothing left to run.
  const TASK_ENDED = new Set(["delivered", "stopped", "failed", "settled"]);
  const TASK_LEVELS = new Set(["read", "propose", "change"]);

  let win = null;
  let shell = null;
  let main = null;
  let listEl = null;
  let searchBox = null;
  let searchInput = null;
  let searchRow = null;
  let modelButton = null;
  let modelLabel = null;
  let note = null;
  let noteText = null;
  let lastRecentKey = "";
  let railRows = [];
  let workRow = null;
  let threadTitle = null;
  let threadProgress = null;
  let strip = null;
  let stripText = null;
  let panel = null;
  let panelName = null;
  let panelStatus = null;
  let panelBody = null;
  let panelFoot = null;
  let panelTabs = [];
  let panelTabsEl = null;
  let panelBack = null;
  let panelItem = null;
  let panelView = "preview";
  let panelBodyKey = "";
  let panelTimer = 0;
  // What the panel shows: a reply ("reply"), a document a task made
  // ("output"), the task's progress ("progress") or a ClioWrite document
  // with ClioTalk's revisions in it ("document").
  let panelMode = "reply";
  let panelOutput = null;
  let panelDoc = null;
  let panelDocKey = "";
  let panelDocFailure = "";
  let docBatch = null;
  // docId → { source, card }: the documents handed over in this
  // conversation, each with its file card in the thread.
  const docCards = new Map();
  let progressPane = null;
  let progressSteps = null;
  let progressStepsSec = null;
  let progressOutputs = null;
  let progressUses = null;
  let progressUsesSec = null;
  let progressAsksSec = null;
  let progressAsksKey = "";
  const taskAsksShown = new Set();
  let progressFoot = null;
  let progressLedgerSec = null;
  let progressTurnsSec = null;
  let progressLedgerKey = "";
  let progressTurnsKey = "";
  let taskContinueBtn = null;
  let progressTokens = null;
  let progressCost = null;
  let progressKey = "";
  let task = null;
  let taskSnapshot = null;
  let taskTransport = null;
  let taskView = null;
  let taskDone = null;
  let taskStatus = null;
  let taskDropped = "";
  let taskAutoOpened = "";
  let taskStopMode = false;
  let taskQueueEl = null;
  let taskQueueHead = null;
  let taskQueueList = null;
  let taskQueueNote = null;
  // queue entry id → its row (kept, so a poll never rebuilds a button mid-click)
  const taskQueueRows = new Map();
  const taskCards = new Map();
  // Proposal id → "pending" while the transport has the answer, "done" once
  // it took it (or there is none): the card keeps its buttons dimmed until
  // the next snapshot says what became of it.
  const taskSent = new Map();

  function node(tag, className, attrs = {}) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    Object.entries(attrs).forEach(([name, value]) => el.setAttribute(name, value));
    return el;
  }

  function sideRow(iconName, labelKey, { action = "", key = "", later = "", rail = false } = {}) {
    const row = node("button", "cl-side-row", { type: "button" });
    if (action) row.dataset.action = action;
    if (rail) {
      // Stays, as its icon alone, on the rail the sidebar narrows to while
      // the output panel is open; the label names it there.
      row.classList.add("cl-rail");
      row.dataset.i18nAriaLabel = labelKey;
      row.setAttribute("aria-label", tr(labelKey));
      railRows.push(row);
    }
    row.insertAdjacentHTML("beforeend", icon(ICONS[iconName]));
    const label = node("span");
    label.dataset.i18n = labelKey;
    label.textContent = tr(labelKey);
    row.append(label);
    if (key) {
      const hint = node("span", "cl-key");
      hint.textContent = key;
      row.append(hint);
    }
    if (later) {
      // ClioWork and ClioCode arrive in a later release. A control that
      // opens nothing says so rather than pretending: it is disabled and
      // its Balloon Help names the reason.
      row.disabled = true;
      row.dataset.i18nTitle = later;
      row.title = tr(later);
      row.dataset.balloonHelpDisabled = later;
    }
    return row;
  }

  function buildSidebar() {
    const side = node("nav", "clio-sidebar");
    side.dataset.i18nAriaLabel = "clio_shell_nav";
    side.setAttribute("aria-label", tr("clio_shell_nav"));

    const fresh = sideRow("plus", "clio_shell_new", { action: "start-new-clio-chat", key: "⌘N", rail: true });
    // On the phone the new conversation is the page that comes next.
    fresh.addEventListener("click", (event) => setPage("chat", { focus: event.detail === 0 }));
    side.append(fresh);
    searchRow = sideRow("search", "clio_shell_search", { key: "⌘K", rail: true });
    searchRow.setAttribute("aria-expanded", "false");
    searchRow.addEventListener("click", () => toggleSearch());
    side.append(searchRow);

    searchBox = node("div", "cl-search");
    searchBox.hidden = true;
    searchInput = node("input", "", { type: "search", autocomplete: "off", spellcheck: "false" });
    searchInput.dataset.i18nPlaceholder = "clio_shell_search_placeholder";
    searchInput.dataset.i18nAriaLabel = "clio_shell_search_placeholder";
    searchInput.placeholder = tr("clio_shell_search_placeholder");
    searchInput.setAttribute("aria-label", tr("clio_shell_search_placeholder"));
    searchInput.addEventListener("input", () => renderRecent());
    searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        toggleSearch(false);
      }
    });
    searchBox.append(searchInput);
    side.append(searchBox);

    side.append(sideRow("project", "projects", { action: "open-project-disks" }));
    const work = sideRow("work", "clio_shell_work");
    work.addEventListener("click", (event) => setPage("work", { focus: event.detail === 0 }));
    workRow = work;
    const code = sideRow("code", "clio_shell_code", { action: "open-clio-code" });
    // Product names, not translations.
    work.querySelector("span").removeAttribute("data-i18n");
    code.querySelector("span").removeAttribute("data-i18n");
    work.querySelector("span").textContent = "ClioWork";
    code.querySelector("span").textContent = "ClioCode";
    // Code is not written on a phone; its list leaves ClioCode out.
    code.classList.add("cl-code");
    side.append(work, code);

    const label = node("div", "cl-side-label");
    label.dataset.i18n = "clio_shell_recent";
    label.textContent = tr("clio_shell_recent");
    side.append(label);
    listEl = node("div", "cl-recent-list");
    side.append(listEl);
    side.addEventListener("pointerenter", () => renderRecent());
    side.addEventListener("focusin", () => renderRecent());
    return side;
  }

  function toggleSearch(force) {
    const open = typeof force === "boolean" ? force : searchBox.hidden;
    // The phone's list always carries the field; Search takes the writer there.
    if (open && isPhone()) setLayer("list");
    searchBox.hidden = !open && !isPhone();
    searchRow.setAttribute("aria-expanded", String(open));
    // The search field needs the full sidebar, so it widens the rail.
    syncRail();
    if (open) {
      searchInput.focus();
      searchInput.select();
    } else {
      searchInput.value = "";
      renderRecent();
    }
  }

  // The recent list is the existing chat sessions, nothing new stored. No
  // blue dot yet: chat files carry no "candidates waiting" field today, and
  // the dot only ever says something true once they do.
  function renderRecent() {
    if (!listEl) return;
    syncThreadHead();
    const files = typeof getRecentChatFiles === "function" ? getRecentChatFiles(RECENT_LIMIT) : [];
    const query = (searchInput?.value || "").trim().toLowerCase();
    const shown = query ? files.filter((file) => String(file.name || "").toLowerCase().includes(query)) : files;
    const activeId = typeof activeChatFileId !== "undefined" ? activeChatFileId : "";
    const key = [query, activeId, ...shown.map((file) => `${file.id}:${file.name}`)].join("|");
    if (key === lastRecentKey) return;
    lastRecentKey = key;
    if (!shown.length) {
      const empty = node("div", "cl-recent-empty");
      const emptyKey = query ? "clio_shell_no_match" : "clio_shell_no_recent";
      empty.dataset.i18n = emptyKey;
      empty.textContent = tr(emptyKey);
      listEl.replaceChildren(empty);
      return;
    }
    listEl.replaceChildren(...shown.map((file) => {
      const row = node("button", "cl-recent", { type: "button", title: String(file.name || "") });
      row.dataset.chatFileId = file.id;
      if (file.id === activeId) {
        row.classList.add("is-sel");
        row.setAttribute("aria-current", "true");
      }
      const name = node("span", "cl-recent-name");
      name.textContent = String(file.name || "");
      row.append(name);
      row.addEventListener("click", (event) => {
        continueConversation(file.id);
        setPage("chat", { focus: event.detail === 0 });
      });
      return row;
    }));
  }

  // Continue a session in ClioTalk itself. "open-chat-file" opens the
  // read-only transcript window; openChatFile() is what loads a Chat into
  // this window, so the sidebar selects the file and asks for that.
  async function continueConversation(fileId) {
    if (typeof openChatFile !== "function") return;
    if (typeof activeAbortController !== "undefined" && activeAbortController) {
      if (typeof setStatus === "function") setStatus(tr("task_already_running", (typeof localModelState !== "undefined" && localModelState?.task) || tr("working_locally")));
      return;
    }
    if (typeof activeChatFileId !== "undefined" && activeChatFileId === fileId) return;
    selectedChatFileId = fileId;
    await openChatFile();
    renderRecent();
  }

  function buildModelMenu(form) {
    const row = form.querySelector(".composer-action-row");
    const send = row?.querySelector("#send");
    if (!row || !send) return;
    const menu = node("div", "menu clio-model-menu");
    modelButton = node("button", "clio-model-button", { type: "button", "aria-haspopup": "menu" });
    modelLabel = node("span", "clio-model-name");
    modelButton.append(modelLabel);
    modelButton.insertAdjacentHTML("beforeend", '<svg class="cl-chev-down" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" focusable="false"><path d="M2 4l3 3 3-3"/></svg>');
    const popover = node("div", "menu-popover cloud-model-popover clio-model-popover", { role: "menu" });
    menu.append(modelButton, popover);
    // The document-level handler for ".menu > button" opens and closes the
    // menu; this only fills the panel first, with the menu bar's own content.
    modelButton.addEventListener("click", () => {
      if (typeof renderCloudModelPopover === "function") renderCloudModelPopover(popover);
    });
    row.insertBefore(menu, send);
    syncModel();
  }

  function syncModel() {
    if (!modelLabel) return;
    const source = document.getElementById("cloud-model-label");
    const indicator = document.getElementById("cloud-model-indicator");
    const name = (!source || indicator?.classList.contains("is-hidden"))
      ? tr("model_not_connected")
      : String(source.textContent || "").trim() || tr("model_not_connected");
    modelLabel.textContent = name;
    modelButton.title = `${tr("clio_shell_model")}: ${name}`;
    modelButton.setAttribute("aria-label", modelButton.title);
  }

  // With no model the empty page is the greeting, the composer and this one
  // line: what is missing, and the existing Connect AI action. The window's
  // own Connect AI button (in the details bar) says when a model is missing;
  // it is hidden while one is ready or still being looked for.
  function buildNote() {
    note = node("p", "clio-empty-note");
    noteText = node("span");
    const connect = node("button", "btn clio-empty-connect", { type: "button" });
    connect.dataset.action = "open-clio-model-settings";
    connect.dataset.i18n = "clio_connect_ai";
    connect.textContent = tr("clio_connect_ai");
    note.append(noteText, connect);
    return note;
  }

  function syncEmpty() {
    const messages = document.getElementById("messages");
    if (!main || !messages) return;
    const empty = [...messages.children].every((child) => child.classList.contains("clio-welcome"));
    const connect = document.getElementById("clio-connect-ai");
    const needsModel = empty && !!connect && !connect.hidden;
    main.classList.toggle("is-empty", empty);
    main.classList.toggle("needs-model", needsModel);
    if (!noteText) return;
    // The website's shared AI can be spent for the day; then that, not a
    // missing model, is the honest reason Send waits.
    const spent = window.AISystem6ClioProvider?.snapshot?.()?.quota?.state === "exhausted";
    const key = spent ? "clio_shell_quota_spent" : "clio_shell_model_needed";
    if (noteText.dataset.i18n !== key) {
      noteText.dataset.i18n = key;
      noteText.textContent = tr(key);
    }
  }

  // The Aqua family wears the glass layout with its own material tokens
  // (styles/67-*-appearance.css set --cl-era-*); the other eras are not here.
  const GLASS_SKIN_ERAS = new Set(["aqua", "tiger", "snow-leopard", "lion", "yosemite", "big-sur"]);

  // The skin follows the appearance: Liquid Glass and Classic have one. In
  // Classic the model menu is the desk's own pop-up button, whose arrow is
  // the only one (the sheet hides the Liquid Glass chevron there). Without a
  // skin there is no panel to show.
  // The 1-bit-family appearances wear the Classic skin: the sheet reads
  // --paper, --ink and the fonts, which each of them sets for itself.
  const CLASSIC_SKIN_THEMES = new Set(["classic", "system-7", "platinum", "drawing-board", "nextstep"]);
  const skinFor = (theme) => (theme === "liquid-glass" || GLASS_SKIN_ERAS.has(theme) ? "glass" : CLASSIC_SKIN_THEMES.has(theme) ? "classic" : "");
  function syncSkin() {
    const skin = skinFor(document.body.dataset.theme);
    if (skin) shell.dataset.skin = skin;
    else delete shell.dataset.skin;
    const classic = skin === "classic";
    modelButton?.classList.toggle("system-select-button", classic);
    modelLabel?.classList.toggle("system-select-label", classic);
    if (!skin) closePanel(false);
  }

  // ⌘K and Search… in the menu: open the sessions search while this window
  // owns the menu bar and its sidebar is on screen (on the phone, one layer
  // away). It shows at once; keyboard actions never animate.
  function canSearch() {
    const side = win?.querySelector(".clio-sidebar");
    return frontWindow() === win && !!side && (isPhone() ? !!shell.dataset.skin : getComputedStyle(side).display !== "none");
  }

  // Phone ---------------------------------------------------------------------
  //
  // Phone.dc.html: upright, the window shows one layer at a time, the list
  // (the sidebar as a page) or the conversation, and the panel is a bottom
  // sheet over a dimmed conversation. The shell is .is-phone and its
  // data-layer names the layer; the stylesheet does the rest. Sideways, or on
  // a tablet, nothing here applies and the window keeps its three columns.

  const isPhone = () => !!shell?.classList.contains("is-phone");

  function syncPhone(query) {
    const phone = !!query?.matches;
    if (phone === isPhone()) return;
    shell.classList.toggle("is-phone", phone);
    shell.dataset.layer ||= "thread";
    // The list carries its search field on the phone; on the desk, Search
    // shows it.
    searchBox.hidden = !phone && searchRow.getAttribute("aria-expanded") !== "true";
    panel.classList.remove("is-dragging");
    panel.style.removeProperty("--cl-sheet-drag");
    syncRail();
  }

  // The sheet belongs to the conversation, so the list closes it. A layer
  // reached from the keyboard takes the focus; a tap leaves it, so the
  // phone's keyboard does not rise uninvited.
  function setLayer(layer, { focus = false } = {}) {
    if (!shell || !isPhone()) return;
    if (layer === "list") closePanel(false);
    shell.dataset.layer = layer;
    if (!focus) return;
    const target = layer === "list" ? listEl.querySelector(".is-sel") || searchInput : document.getElementById("prompt");
    target?.focus({ preventScroll: true });
  }

  // The conversation's head: back to the list, the conversation's name, and
  // the task's progress while there is a task.
  function buildThreadHead() {
    const head = node("div", "cl-thread-head");
    const back = node("button", "btn cl-thread-back", { type: "button" });
    back.dataset.i18nAriaLabel = "clio_shell_conversations";
    back.setAttribute("aria-label", tr("clio_shell_conversations"));
    back.insertAdjacentHTML("beforeend", icon(ICONS.back));
    back.addEventListener("click", (event) => setLayer("list", { focus: event.detail === 0 }));
    threadTitle = node("span", "cl-thread-title");
    threadProgress = node("button", "btn cl-thread-progress", { type: "button" });
    threadProgress.hidden = true;
    threadProgress.dataset.i18nAriaLabel = "clio_task_progress";
    threadProgress.setAttribute("aria-label", tr("clio_task_progress"));
    threadProgress.insertAdjacentHTML("beforeend", icon(ICONS.list));
    threadProgress.addEventListener("click", (event) => showProgress({ animate: true, focus: event.detail === 0 }));
    head.append(back, threadTitle, threadProgress);
    syncThreadHead();
    return head;
  }

  // The name is the chat file's; an unsaved conversation is a new chat.
  function syncThreadHead() {
    if (!threadTitle) return;
    const file = typeof getActiveConversationFile === "function" ? getActiveConversationFile() : null;
    const name = String(file?.name || "").trim();
    if (name) setText(threadTitle, name);
    else say(threadTitle, "clio_shell_new");
    threadTitle.title = name;
  }

  // The strip above the composer: what the task is doing, in one line. A tap,
  // or a swipe up, opens the progress sheet.
  function buildStrip() {
    strip = node("button", "cl-strip", { type: "button" });
    strip.hidden = true;
    stripText = node("span", "cl-strip-text");
    strip.append(node("span", "cl-box", { "aria-hidden": "true" }), stripText);
    strip.insertAdjacentHTML("beforeend", icon(ICONS.up));
    strip.addEventListener("click", (event) => showProgress({ animate: true, focus: event.detail === 0 }));
    let startY = null;
    strip.addEventListener("pointerdown", (event) => { startY = event.clientY; });
    strip.addEventListener("pointerup", (event) => {
      if (startY !== null && event.clientY - startY < -16) showProgress({ animate: true });
      startY = null;
    });
    return strip;
  }

  function syncStrip() {
    if (!strip) return;
    threadProgress.hidden = !task;
    strip.hidden = !task;
    if (!task) return;
    const state = taskStateLabel(taskSteps(), taskProposals());
    say(stripText, ...(state || ["clio_task_progress"]));
    strip.dataset.status = TASK_ENDED.has(task.state) ? "done" : "now";
  }

  // The sheet follows a finger on its handle or its head. Let go past half
  // its height, or with a flick down, and it goes; short of that it settles
  // back. The head's buttons stay buttons.
  function dragSheet(event) {
    if (!isPhone() || !panelOpen() || event.button > 0 || event.target?.closest?.("button")
      || !event.target?.closest?.(".cl-sheet-handle, .cl-panel-head")) return;
    const startY = event.clientY;
    let last = { y: startY, time: event.timeStamp };
    let velocity = 0;
    let distance = 0;
    panel.classList.add("is-dragging");
    panel.setPointerCapture?.(event.pointerId);
    const move = (next) => {
      distance = Math.max(0, next.clientY - startY);
      const elapsed = next.timeStamp - last.time;
      if (elapsed > 0) velocity = (next.clientY - last.y) / elapsed;
      last = { y: next.clientY, time: next.timeStamp };
      panel.style.setProperty("--cl-sheet-drag", `${distance}px`);
    };
    const end = (next) => {
      panel.removeEventListener("pointermove", move);
      panel.removeEventListener("pointerup", end);
      panel.removeEventListener("pointercancel", end);
      panel.classList.remove("is-dragging");
      // A finger that stopped before it let go is not a flick.
      const flick = next.timeStamp - last.time < 100 && velocity > SHEET_FLICK;
      const height = panel.getBoundingClientRect?.().height || 0;
      if (next.type === "pointerup" && distance > 8 && (flick || distance > height / 2)) closePanel(true);
      else panel.style.removeProperty("--cl-sheet-drag");
    };
    panel.addEventListener("pointermove", move);
    panel.addEventListener("pointerup", end);
    panel.addEventListener("pointercancel", end);
  }

  // Output panel ------------------------------------------------------------
  //
  // What it shows is a reply already in the transcript: its text, rendered as
  // the transcript renders it (预览) or as written (原文). Nothing is copied
  // or stored; the panel reads the reply's article and its conversation record
  // each time the transcript changes, and closes when the reply is gone.

  function textButton(className, labelKey, onClick) {
    const button = node("button", className, { type: "button" });
    button.dataset.i18n = labelKey;
    button.textContent = tr(labelKey);
    button.addEventListener("click", onClick);
    return button;
  }

  function buildPanel() {
    panel = node("aside", "clio-panel");
    panel.hidden = true;
    const head = node("div", "cl-panel-head");
    // While a task is on, a reply or a document in the panel is one step
    // away from the task's progress.
    panelBack = node("button", "btn cl-panel-back", { type: "button" });
    panelBack.hidden = true;
    panelBack.insertAdjacentHTML("beforeend", icon(ICONS.back));
    const backLabel = node("span");
    backLabel.dataset.i18n = "clio_task_progress";
    backLabel.textContent = tr("clio_task_progress");
    panelBack.append(backLabel);
    panelBack.addEventListener("click", (event) => showProgress({ focus: event.detail === 0 }));
    panelName = node("span", "cl-panel-name");
    panelStatus = node("span", "cl-panel-status");
    panelTabsEl = node("div", "cl-tabs");
    panelTabs = [["preview", "preview"], ["source", "clio_shell_source"]].map(([view, labelKey]) => {
      const tab = textButton("btn cl-tab", labelKey, () => showView(view));
      tab.dataset.view = view;
      return tab;
    });
    panelTabsEl.append(...panelTabs);
    const close = node("button", "btn cl-panel-close", { type: "button" });
    close.dataset.i18nAriaLabel = "clio_shell_close_panel";
    close.setAttribute("aria-label", tr("clio_shell_close_panel"));
    close.insertAdjacentHTML("beforeend", icon(ICONS.close));
    close.addEventListener("click", () => closePanel(true));
    // 收下跑腿件（N）: a document's errands, all at once (document mode only).
    docBatch = node("button", "btn cl-doc-batch", { type: "button" });
    docBatch.hidden = true;
    docBatch.addEventListener("click", takeErrands);
    head.append(panelBack, panelName, panelStatus, panelTabsEl, docBatch, close);
    panelBody = node("div", "cl-panel-body", { tabindex: "0" });
    panelFoot = node("div", "cl-panel-foot");
    panelFoot.append(
      textButton("btn default", "clio_shell_save_disk", () => useReply("project-document")),
      textButton("btn", "clio_shell_add_sheet", () => useReply("question-sheet")),
      textButton("btn cl-panel-discard", "clio_shell_discard", discardReply),
    );
    // The handle is the phone sheet's: a mark to take hold of, not a control.
    const handle = node("div", "cl-sheet-handle", { "aria-hidden": "true" });
    panel.append(handle, head, panelBody, panelFoot, buildProgress());
    panel.addEventListener("pointerdown", dragSheet);
    // Esc inside the panel closes it, at once, as every keyboard action does.
    panel.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      closePanel(false);
    });
    return panel;
  }

  const panelOpen = () => !!panel && !panel.hidden && !panel.classList.contains("is-closing");

  function panelRecord(item) {
    const id = item?.dataset.messageId;
    const list = typeof conversation !== "undefined" && Array.isArray(conversation) ? conversation : [];
    return (id && list.find((entry) => entry.id === id)) || null;
  }

  // The name is the reply's first line of text, without its Markdown marks.
  function outputName(content) {
    const line = String(content || "").split("\n")
      .map((text) => text.replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)*/, "").trim())
      .find((text) => text && !/^(?:```|~~~|\|?\s*:?-{3,})/.test(text)) || "";
    const name = typeof stripMarkdownInlineSyntax === "function" ? stripMarkdownInlineSyntax(line) : line;
    return name || tr("clio_preview_empty");
  }

  function latestReply() {
    const replies = document.querySelectorAll("#messages .message.assistant[data-message-id]:not(.pending)");
    return replies[replies.length - 1] || null;
  }

  // What the panel's two views read: the reply's text, or the document a
  // task made. A document that is not Markdown (a table's CSV, say) has
  // only its text to show, in both views.
  function panelContent() {
    if (panelMode === "output") {
      const payload = panelOutput?.payload || {};
      const content = String(payload.content ?? "");
      const doc = !payload.format || /^(?:md|markdown|txt|text)$/i.test(String(payload.format));
      return { id: panelOutput?.id, content, markdown: doc ? content : null };
    }
    const content = String(panelItem?.dataset.rawContent || "");
    return { id: panelItem?.dataset.messageId, content, markdown: panelRecord(panelItem)?.displayContent || content };
  }

  function showView(view) {
    panelView = view;
    panelTabs.forEach((tab) => tab.setAttribute("aria-pressed", String(tab.dataset.view === view)));
    const { id, content, markdown } = panelContent();
    const key = [panelMode, view, id, content].join("|");
    if (key === panelBodyKey) return;
    panelBodyKey = key;
    let pane = null;
    if (view === "source" || markdown === null) {
      pane = node("pre", "cl-panel-source");
      pane.textContent = content;
    } else {
      pane = node("div", "cl-panel-doc");
      if (typeof markdownToSystemHtml === "function") pane.innerHTML = markdownToSystemHtml(markdown);
      else pane.textContent = markdown;
    }
    panelBody.replaceChildren(pane);
    panelBody.scrollTop = 0;
  }

  function setPanelName(text, labelKey = "") {
    if (labelKey) {
      panelName.dataset.i18n = labelKey;
      panel.dataset.i18nAriaLabel = labelKey;
    } else {
      delete panelName.dataset.i18n;
      delete panel.dataset.i18nAriaLabel;
    }
    if (panelName.textContent !== text) panelName.textContent = text;
    panelName.title = labelKey ? "" : text;
    panel.setAttribute("aria-label", text);
  }

  function syncPanel() {
    panel.classList.toggle("is-progress", panelMode === "progress");
    panel.classList.toggle("is-doc", panelMode === "document");
    panelBack.hidden = !task || panelMode === "progress";
    panelTabsEl.hidden = panelMode === "progress" || panelMode === "document";
    progressFoot.hidden = true;
    if (panelMode !== "document") docBatch.hidden = true;
    if (panelMode === "progress") return syncProgress();
    if (panelMode === "document") return syncDocument();
    if (panelMode === "output") return syncOutput();
    syncReply();
  }

  // The status word is the reply's own: 候选 until it is used, then the
  // receipt the transcript prints. A used reply has nothing left to decide,
  // so the footer goes, as Use Reply and Discard do in the transcript.
  function syncReply() {
    const record = panelRecord(panelItem);
    const kept = panelItem.dataset.replyState === "kept";
    setPanelName(outputName(panelItem.dataset.rawContent));
    if (kept && typeof clioTalkReplyReceiptLabel === "function") {
      delete panelStatus.dataset.i18n;
      panelStatus.textContent = clioTalkReplyReceiptLabel(record);
    } else {
      say(panelStatus, "clio_shell_candidate");
    }
    panelFoot.hidden = kept;
    // As in the transcript, Use needs the reply's record.
    [...panelFoot.children].slice(0, 2).forEach((button) => { button.disabled = !record; });
    showView(panelView);
  }

  // A document the task made is a candidate until the writer takes it; the
  // task's own delivery decides where it goes, so the panel offers no verbs.
  function syncOutput() {
    const payload = panelOutput.payload || {};
    setPanelName(String(payload.name || panelOutput.title || ""));
    say(panelStatus, "clio_shell_candidate");
    panelFoot.hidden = true;
    showView(panelView);
  }

  function revealPanel({ animate = false, focus = false } = {}) {
    clearTimeout(panelTimer);
    const opening = !panelOpen();
    // Fluid eras: a click moves the panel with transitions from wherever it
    // is now, so showing it again mid-close turns it around without a jump.
    const fluid = animate && !isPhone() && typeof fluidMotion === "function" && fluidMotion();
    panel.classList.remove("is-opening", "is-dragging");
    panel.style.removeProperty("--cl-sheet-drag");
    if (fluid) {
      if (panel.hidden) {
        panel.classList.add("is-closing");
        panel.hidden = false;
        void panel.offsetWidth;
      }
      panel.classList.add("is-fluid");
      panel.classList.remove("is-closing");
      panelTimer = setTimeout(() => panel.classList.remove("is-fluid"), PANEL_IN_MS);
    } else {
      panel.classList.remove("is-closing", "is-fluid");
    }
    panel.hidden = false;
    shell.classList.add("has-panel");
    // On the phone the sheet lies over the conversation, never the list.
    if (isPhone()) shell.dataset.layer = "thread";
    syncRail();
    if (opening && animate && !fluid && isPhone()) {
      panel.classList.add("is-opening");
      panelTimer = setTimeout(() => panel.classList.remove("is-opening"), isPhone() ? SHEET_IN_MS : PANEL_IN_MS);
    }
    if (focus) panelBody.focus({ preventScroll: true });
  }

  function openPanel(item, options) {
    if (!item?.isConnected || !shell?.dataset.skin) return;
    panelMode = "reply";
    panelItem = item;
    syncPanel();
    revealPanel(options);
  }

  function openOutput(proposal, options) {
    if (!proposal || !shell?.dataset.skin) return;
    panelMode = "output";
    panelOutput = proposal;
    syncPanel();
    revealPanel(options);
  }

  function showProgress(options) {
    if (!task || !shell?.dataset.skin) return;
    panelMode = "progress";
    panelBodyKey = "";
    syncPanel();
    revealPanel(options);
  }

  function closePanel(animate) {
    if (!panelOpen()) return;
    clearTimeout(panelTimer);
    // Focus inside the panel goes back to what opened it, or to the field.
    if (panel.contains(document.activeElement)) {
      const opener = panelMode === "reply" && panelItem?.isConnected ? panelItem.querySelector(".clio-open-output")
        : panelMode === "document" && docCards.get(panelDoc?.docId)?.card.isConnected ? docCards.get(panelDoc.docId).main : null;
      (opener || document.getElementById("prompt"))?.focus({ preventScroll: true });
    }
    const finish = () => {
      panel.hidden = true;
      panel.classList.remove("is-closing", "is-opening", "is-fluid", "is-dragging");
      panel.style.removeProperty("--cl-sheet-drag");
      shell.classList.remove("has-panel");
      syncRail();
    };
    panel.classList.remove("is-opening");
    if (!animate) return finish();
    if (!isPhone() && typeof fluidMotion === "function" && fluidMotion()) {
      panel.classList.add("is-fluid", "is-closing");
      panelTimer = setTimeout(finish, PANEL_OUT_MS);
      return;
    }
    if (!isPhone()) return finish();
    panel.classList.add("is-closing");
    // Classic and reduced motion draw no exit, so there is nothing to wait for.
    if (getComputedStyle(panel).animationName === "none") return finish();
    panelTimer = setTimeout(finish, isPhone() ? SHEET_OUT_MS : PANEL_OUT_MS);
  }

  // ⌘\: hide the panel, or show the task's progress while there is a task,
  // else the reply it last showed (else the latest). A keyboard action, so
  // it never animates.
  function togglePanel() {
    if (panelOpen()) return closePanel(false);
    if (task) return showProgress();
    openPanel(panelItem?.isConnected ? panelItem : latestReply());
  }

  function frontWindow() {
    return typeof resolveMenuContextWindow === "function" ? resolveMenuContextWindow() : document.querySelector(".window.is-active");
  }

  function canTogglePanel() {
    return frontWindow() === win && !!shell?.dataset.skin && (panelOpen() || !!task || !!latestReply());
  }

  // The output panel (440px) narrows the sidebar to a rail; the progress
  // panel is narrower and leaves it whole, as Work.dc.html draws it. The
  // phone has no rail: its panel is a sheet.
  function syncRail() {
    const rail = !isPhone() && panelOpen() && panelMode !== "progress" && !!searchBox?.hidden;
    shell?.classList.toggle("is-rail", rail);
    railRows.forEach((row) => {
      if (rail) {
        row.dataset.i18nTitle = row.dataset.i18nAriaLabel;
        row.title = row.getAttribute("aria-label");
      } else {
        delete row.dataset.i18nTitle;
        row.removeAttribute("title");
      }
    });
  }

  // 放到项目硬盘 and 记到问题单 are the Use Reply dialog with that destination
  // already picked: the dialog still shows the write and waits for the click.
  async function useReply(targetId) {
    const item = panelItem;
    const record = panelRecord(item);
    if (!record || typeof chooseClioTalkUseResult !== "function") return;
    const content = String(item.dataset.rawContent || "");
    const dialog = document.getElementById("clio-use-result-modal");
    const pick = dialog ? new MutationObserver(() => {
      if (!dialog.open) return;
      pick.disconnect();
      const target = dialog.querySelector(`input[name="clio-use-result-target"][value="${targetId}"]`);
      if (target && !target.disabled && !target.checked) target.click();
    }) : null;
    pick?.observe(dialog, { attributes: true, attributeFilter: ["open"] });
    try {
      const choice = await chooseClioTalkUseResult(content, record);
      if (choice && typeof applyClioTalkUseResult === "function") await applyClioTalkUseResult(content, record, choice);
    } finally {
      pick?.disconnect();
    }
  }

  // 不要 is the transcript's Discard: the same removal, the same Undo.
  async function discardReply() {
    const item = panelItem;
    const id = item?.dataset.messageId;
    if (!id || typeof discardClioTalkReply !== "function") return;
    discardClioTalkReply(id, item);
  }

  // Each finished reply gets 打开 beside its status word. The transcript
  // rebuilds a reply's action row whenever its state changes, so this runs
  // after every change to the transcript, once per frame.
  function decorateReplies() {
    const messages = document.getElementById("messages");
    messages?.querySelectorAll(".message.assistant[data-message-id]:not(.pending) > .message-actions").forEach((actions) => {
      if (actions.querySelector(".clio-open-output")) return;
      const open = textButton("btn mini-btn clio-open-output", "open", (event) => {
        openPanel(actions.parentElement, { animate: true, focus: event.detail === 0 });
      });
      const disposition = actions.querySelector(":scope > .message-disposition");
      if (disposition) disposition.after(open);
      else actions.prepend(open);
    });
    if (!panelOpen() || panelMode !== "reply") return;
    if (!panelItem.isConnected) {
      // Redrawn under the same id (a refreshed transcript): follow it.
      const id = panelItem.dataset.messageId;
      const again = id ? messages?.querySelector(`.message.assistant[data-message-id="${CSS.escape(id)}"]`) : null;
      if (!again) return closePanel(false);
      panelItem = again;
    }
    syncPanel();
  }

  // Tasks -------------------------------------------------------------------
  //
  // A task is work Clio does in steps, with the writer's go-ahead
  // (Work.dc.html). Whatever runs it hands this module snapshots: the task
  // API's answer ({ task, turns }, the proposals in turns[].result), plus
  // the run's plan entries as `progress` ([{ content, status: pending |
  // in_progress | completed }]). The view is the last snapshot and nothing
  // else. The writer's answers go to the transport given to tasks.connect():
  //   approvePlan(task, plan)            照这个做
  //   revisePlan(task, plan, { text })   what the writer sends after 改计划…
  //   answer(task, question, { picked } | { text })
  //   permit(task, permission, "once" | "task" | "deny")
  //   stop(task)
  // An answered proposal comes back with `answer` set: { picked } or
  // { text } for a question, the choice for a permission.

  // Writes a label. One without arguments keeps its data-i18n, so a language
  // switch relabels it; one with arguments is redrawn by renderTask().
  function say(el, key, ...args) {
    if (args.length) delete el.dataset.i18n;
    else el.dataset.i18n = key;
    const text = tr(key, ...args);
    if (el.textContent !== text) el.textContent = text;
  }

  // Text that is the task's own (a title, a step, an option): never a key.
  function setText(el, text) {
    delete el.dataset.i18n;
    if (el.textContent !== text) el.textContent = text;
  }

  const taskRunning = () => !!task && (task.state === "planning" || task.state === "working");
  const replyRunning = () => typeof activeAbortController !== "undefined" && !!activeAbortController;

  function taskProposals() {
    const turns = Array.isArray(taskSnapshot?.turns) ? taskSnapshot.turns : [];
    return turns.flatMap((turn) => (Array.isArray(turn?.result?.proposals) ? turn.result.proposals : []))
      .filter((proposal) => proposal?.id && proposal.payload && typeof proposal.payload === "object");
  }

  // What the thread draws, in the order it happened: each turn's proposals,
  // after the writer's own words for a turn they started with a follow-up
  // (turn 1's words are the message that started the task; a turn that
  // answered a card shows on the card, `reply`).
  function taskItems() {
    const turns = Array.isArray(taskSnapshot?.turns) ? taskSnapshot.turns : [];
    const proposals = new Set(taskProposals());
    return turns.flatMap((turn) => {
      const own = (Array.isArray(turn?.result?.proposals) ? turn.result.proposals : []).filter((proposal) => proposals.has(proposal));
      const said = Number(turn?.n) > 1 && !turn.reply && typeof turn.prompt === "string" && turn.prompt.trim();
      // Queued follow-ups reach the engine marked; the thread shows the writer's words only.
      return said ? [{ id: `prompt:${turn.id}`, kind: "prompt", payload: { text: turn.prompt.replace(/\[Follow-up \d+ of \d+: [^\]\n]*\]\n/g, "") } }, ...own] : own;
    });
  }

  // A card waits on the writer only while it is the latest of its kind,
  // unanswered, and the task is in the state that asks for it.
  function proposalLive(proposal, proposals) {
    if (!task || proposal.answer) return false;
    if (proposals.filter((entry) => entry.kind === proposal.kind).pop() !== proposal) return false;
    if (proposal.kind === "plan") return task.state === "awaiting_plan";
    if (proposal.kind === "question") return task.state === "awaiting_answer";
    if (proposal.kind === "permission") return !TASK_ENDED.has(task.state);
    return false;
  }

  // The steps are the run's own plan entries; before the run has any, the
  // steps of the latest plan.
  function taskSteps() {
    const entries = Array.isArray(taskSnapshot?.progress)
      ? taskSnapshot.progress
      : taskProposals().filter((proposal) => proposal.kind === "plan").pop()?.payload.steps;
    return (Array.isArray(entries) ? entries : []).map((entry) => ({
      text: String((typeof entry === "string" ? entry : entry?.content ?? entry?.text) || ""),
      status: entry?.status === "completed" || entry?.status === "in_progress" ? entry.status : "pending",
    }));
  }

  // The step under way: the one in progress, else the first not done.
  function currentStep(steps) {
    const now = steps.findIndex((step) => step.status === "in_progress");
    return now >= 0 ? now : steps.findIndex((step) => step.status !== "completed");
  }

  const TASK_STATE_LABELS = {
    planning: "clio_task_state_planning",
    awaiting_plan: "clio_task_state_awaiting_plan",
    delivered: "clio_task_state_delivered",
    stopped: "clio_task_state_stopped",
    failed: "clio_task_state_failed",
    settled: "clio_task_state_settled",
  };

  // The progress head's line: what the task is doing. A state this module
  // does not know says nothing rather than guessing.
  function taskStateLabel(steps, proposals) {
    const index = currentStep(steps);
    const step = index >= 0 ? index + 1 : steps.length;
    if (task.state === "working") {
      return proposals.some((proposal) => proposal.kind === "permission" && proposalLive(proposal, proposals))
        ? ["clio_task_state_awaiting_permission"]
        : ["clio_task_state_working", step, steps.length];
    }
    if (task.state === "awaiting_answer") return ["clio_task_state_awaiting_answer", step, steps.length];
    return TASK_STATE_LABELS[task.state] ? [TASK_STATE_LABELS[task.state]] : null;
  }

  function focusPrompt() {
    document.getElementById("prompt")?.focus();
  }

  // An answer is sent once: the card dims its buttons until the next
  // snapshot says what became of it, or gives them back if the call fails.
  function sendAnswer(proposal, method, detail, onFail) {
    if (!task || taskSent.has(proposal.id)) return;
    const call = taskTransport?.[method];
    const current = task;
    taskSent.set(proposal.id, typeof call === "function" ? "pending" : "done");
    renderTask();
    if (typeof call !== "function") return;
    new Promise((resolve) => resolve(call.call(taskTransport, current, proposal, detail))).then(
      () => { if (taskSent.get(proposal.id) === "pending") taskSent.set(proposal.id, "done"); },
      () => {
        taskSent.delete(proposal.id);
        onFail?.();
        renderTask();
      },
    );
  }

  // ClioCode wears these same cards (code.js, through parts.cards): its
  // record brings its own send / sent / focus, and its own choices and note.
  // Without them a card answers this window's task.
  const cardSend = (record, method, detail) => (record.send ? record.send(method, detail) : sendAnswer(record.proposal, method, detail));
  const cardSent = (record) => (record.sent ? record.sent() : taskSent.has(record.proposal.id));
  const cardFocus = (record) => (record.focus ? record.focus() : focusPrompt());

  // The plan stops at 照这个做. Until then the run only reads, and the card
  // says so; 改计划… hands the writer the composer.
  function planCard(record) {
    const card = node("section", "cl-card is-plan");
    const title = node("div", "cl-card-title");
    const body = node("p", "cl-card-body");
    const steps = node("ol", "cl-plan-steps");
    const actions = node("div", "cl-actions");
    const approve = textButton("btn default", "clio_task_approve", () => cardSend(record, "approvePlan"));
    const revise = textButton("btn", "clio_task_revise", () => cardFocus(record));
    actions.append(approve, revise);
    const note = node("p", "cl-card-note");
    say(note, record.noteKey || "clio_task_read_only");
    card.append(title, body, steps, actions, note);
    let stepsKey = "";
    record.el = card;
    record.sync = () => {
      const { proposal, live } = record;
      if (proposal.title) setText(title, String(proposal.title));
      else say(title, "clio_task_plan");
      setText(body, String(proposal.reason || ""));
      body.hidden = !proposal.reason;
      const list = (Array.isArray(proposal.payload.steps) ? proposal.payload.steps : [])
        .map((step) => String((typeof step === "string" ? step : step?.text) || ""));
      if (list.join("\n") !== stepsKey) {
        stepsKey = list.join("\n");
        steps.replaceChildren(...list.map((text) => {
          const item = node("li");
          item.textContent = text;
          return item;
        }));
      }
      actions.hidden = !live;
      note.hidden = !live;
      approve.disabled = cardSent(record);
      revise.disabled = approve.disabled;
    };
  }

  // A question offers at most four answers; 我自己写 is always the last
  // button and hands the writer the composer. The confirm button counts
  // what is picked.
  function questionCard(record) {
    const { proposal } = record;
    const card = node("section", "cl-card is-question", { role: "group" });
    card.dataset.i18nAriaLabel = "clio_task_question";
    card.setAttribute("aria-label", tr("clio_task_question"));
    const title = node("div", "cl-card-title");
    const body = node("p", "cl-card-body");
    const options = node("div", "cl-options");
    const suggested = Array.isArray(proposal.payload.suggested) ? proposal.payload.suggested : [];
    const inputs = (Array.isArray(proposal.payload.options) ? proposal.payload.options : []).map((option, index) => {
      const label = node("label", "cl-option");
      const input = node("input", "", { type: proposal.payload.multiple ? "checkbox" : "radio", name: `cl-ask-${proposal.id}` });
      input.checked = suggested.includes(index);
      const text = node("span");
      text.textContent = String((typeof option === "string" ? option : option?.text ?? option?.label) || "");
      label.append(input, text);
      options.append(label);
      return input;
    });
    const answer = node("p", "cl-card-answer");
    const actions = node("div", "cl-actions");
    const confirm = node("button", "btn default", { type: "button" });
    confirm.addEventListener("click", () => {
      const picked = inputs.flatMap((input, index) => (input.checked ? [index] : []));
      if (picked.length) sendAnswer(record.proposal, "answer", { picked });
    });
    const write = textButton("btn", "clio_task_write_own", focusPrompt);
    actions.append(confirm, write);
    card.append(title, body, options, answer, actions);
    options.addEventListener("change", () => record.sync());
    record.el = card;
    record.sync = () => {
      const { live } = record;
      const current = record.proposal;
      const sent = taskSent.has(current.id);
      const text = String(current.payload.text || "");
      setText(title, String(current.title || text));
      setText(body, text);
      body.hidden = !text || text === current.title;
      const picked = Array.isArray(current.answer?.picked) ? current.answer.picked : null;
      inputs.forEach((input, index) => {
        if (picked) input.checked = picked.includes(index);
        input.disabled = !live || sent;
      });
      const count = inputs.filter((input) => input.checked).length;
      say(confirm, "clio_task_answer", count);
      confirm.disabled = sent || !count;
      write.disabled = sent;
      actions.hidden = !live;
      const own = typeof current.answer?.text === "string" ? current.answer.text : "";
      answer.hidden = !own;
      if (own) say(answer, "clio_task_you_wrote", own);
      card.classList.toggle("is-ask", live);
    };
  }

  // Before the task reaches past what its mounts allow (the web, a change),
  // it asks. 这次可以 is the default; 不行 is quiet.
  function permissionCard(record) {
    const card = node("section", "cl-card is-permission", { role: "group" });
    card.dataset.i18nAriaLabel = "clio_task_permission";
    card.setAttribute("aria-label", tr("clio_task_permission"));
    const title = node("div", "cl-card-title");
    const body = node("p", "cl-card-body");
    const answer = node("p", "cl-card-answer");
    const actions = node("div", "cl-actions");
    // The first choice is the default button; Deny is quiet.
    const choices = record.choices || { once: "clio_task_permit_once", task: "clio_task_permit_task", deny: "clio_task_permit_deny" };
    const buttons = Object.entries(choices).map(([choice, labelKey], index) => {
      const className = index === 0 ? "btn default" : choice === "deny" ? "btn cl-quiet" : "btn";
      return textButton(className, labelKey, () => cardSend(record, "permit", choice));
    });
    actions.append(...buttons);
    card.append(title, body, answer, actions);
    record.el = card;
    record.sync = () => {
      const { proposal, live } = record;
      const text = String(proposal.payload.text || "");
      setText(title, String(proposal.title || text));
      setText(body, text);
      body.hidden = !text || text === proposal.title;
      buttons.forEach((button) => { button.disabled = cardSent(record); });
      actions.hidden = !live;
      const choice = choices[proposal.answer];
      answer.hidden = !choice;
      if (choice) say(answer, choice);
      card.classList.toggle("is-ask", live);
    };
  }

  // 它说交了／实际改了 (Review.dc.html). The left side is what the engine
  // says, as text. The right side is what the desk measured in the record of
  // the turn that handed over: the files its run changed in the shared folder
  // (the server's count), the new documents it offered, and the revisions the
  // desk found by diffing each lent document (snapshot.documents, from the
  // task layer). No model words reach the right side. They disagree when the
  // summary names a count (3 处, 2 changes) and the desk measured none of
  // the counts it names, nor their total.
  const CLAIM_COUNT = /(\d+|[一二两三四五六七八九十]{1,3})\s*(?:处|条|个|份|项|places?\b|changes?\b|edits?\b|revisions?\b|files?\b|documents?\b|fixes\b)/gi;
  const CN_DIGITS = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  function claimedCount(word) {
    if (/^\d+$/.test(word)) return Number(word);
    const [head, ten, tail] = /^([一二两三四五六七八九]?)(十?)([一二三四五六七八九]?)$/.exec(word) || [];
    if (head === undefined) return NaN;
    if (!ten) return tail ? NaN : CN_DIGITS[head] ?? NaN;
    return (head ? CN_DIGITS[head] : 1) * 10 + (tail ? CN_DIGITS[tail] : 0);
  }

  function reconcile(proposal) {
    const turns = Array.isArray(taskSnapshot?.turns) ? taskSnapshot.turns : [];
    const turn = turns.find((entry) => (entry?.result?.proposals || []).includes(proposal)) || null;
    const proposals = Array.isArray(turn?.result?.proposals) ? turn.result.proposals : [];
    const files = Math.max(0, Number(turn?.result?.changes?.count) || 0);
    const made = proposals.filter((entry) => entry?.kind === "new-document").length;
    const docs = (Array.isArray(taskSnapshot?.documents) ? taskSnapshot.documents : [])
      .filter((doc) => doc && (doc.turn == null || turn?.n == null || doc.turn === turn.n) && Number(doc.revisions) > 0);
    const parts = docs.map((doc) => ["clio_task_measured_doc", String(doc.name || doc.docId || ""), Number(doc.revisions)]);
    if (files) parts.push(["clio_task_measured_files", files]);
    if (made) parts.push(["clio_task_measured_new", made]);
    const counts = parts.map((part) => part[part.length - 1]);
    const total = counts.reduce((sum, count) => sum + count, 0);
    const claimed = [...String(proposal.payload.summary || "").matchAll(CLAIM_COUNT)].map((match) => claimedCount(match[1])).filter(Number.isFinite);
    const mismatch = claimed.length > 0 && !claimed.some((count) => count === total || counts.includes(count));
    return { parts, mismatch };
  }

  // What the task says when it hands its work over, beside what the desk
  // measured: the summary is the left column, as text.
  function summaryItem(record) {
    const el = node("div", "cl-deliver");
    const grid = node("div", "cl-reckon", { role: "group" });
    const claimedCell = node("div", "cl-reckon-cell");
    const claimedHead = node("span", "cl-reckon-head");
    const claimedText = node("span", "cl-reckon-text cl-reckon-claim");
    claimedCell.append(claimedHead, claimedText);
    const measuredCell = node("div", "cl-reckon-cell is-measured");
    const measuredHead = node("span", "cl-reckon-head");
    const measuredList = node("span", "cl-reckon-text");
    measuredCell.append(measuredHead, measuredList);
    const flag = node("p", "cl-reckon-flag", { role: "status" });
    grid.append(claimedCell, measuredCell);
    el.append(grid, flag);
    say(claimedHead, "clio_task_claimed");
    say(measuredHead, "clio_task_measured");
    let partsKey = "";
    record.el = el;
    record.sync = () => {
      setText(claimedText, String(record.proposal.payload.summary || ""));
      const { parts, mismatch } = reconcile(record.proposal);
      const key = JSON.stringify([parts, document.documentElement.lang]);
      if (key !== partsKey) {
        partsKey = key;
        const lines = parts.length ? parts : [["clio_task_measured_none"]];
        measuredList.replaceChildren(...lines.map((part) => {
          const line = node("span", "cl-reckon-line");
          say(line, ...part);
          return line;
        }));
      }
      grid.classList.toggle("is-mismatch", mismatch);
      grid.setAttribute("aria-label", `${tr("clio_task_claimed")} / ${tr("clio_task_measured")}`);
      flag.hidden = !mismatch;
      if (mismatch) say(flag, "clio_task_mismatch");
    };
  }

  // A follow-up the writer sent while the task was between turns: their
  // words, in the thread where the turn they started begins.
  function promptItem(record) {
    const el = node("p", "cl-task-prompt");
    record.el = el;
    record.sync = () => setText(el, String(record.proposal.payload.text || ""));
  }

  const TASK_ITEMS = { plan: planCard, question: questionCard, permission: permissionCard, deliver: summaryItem, prompt: promptItem };
  const TASK_LINES = { planning: "clio_task_planning", stopped: "clio_task_stopped_note", failed: "clio_task_failed_note" };

  // The thread: the task's cards in the order they came, each built once and
  // brought up to date in place, then one line for the states no card
  // speaks for.
  function renderTask() {
    const messages = document.getElementById("messages");
    if (!task || !messages) return;
    if (!taskView) {
      taskView = node("div", "clio-task", { role: "group" });
      taskStatus = node("p", "cl-task-status");
      taskContinueBtn = node("button", "btn mini-btn cl-task-continue", { type: "button" });
      taskContinueBtn.hidden = true;
      taskContinueBtn.addEventListener("click", () => {
        if (!task || typeof taskTransport?.resume !== "function") return;
        const current = task;
        taskContinueBtn.disabled = true;
        new Promise((resolve) => resolve(taskTransport.resume(current))).catch(() => {}).then(() => { taskContinueBtn.disabled = false; });
      });
      taskView.append(taskStatus);
    }
    const title = String(task.title || "");
    if (taskView.getAttribute("aria-label") !== title) taskView.setAttribute("aria-label", title);
    if (!taskView.isConnected) messages.append(taskView);
    // Beside the thread, not in it: the thread holds cards and its status line.
    if (taskContinueBtn.previousSibling !== taskView) taskView.after(taskContinueBtn);
    main?.classList.add("has-task");
    const proposals = taskProposals();
    const shown = new Set();
    taskItems().forEach((proposal) => {
      const build = TASK_ITEMS[proposal.kind];
      if (!build) return;
      shown.add(proposal.id);
      let record = taskCards.get(proposal.id);
      if (record && record.proposal.kind !== proposal.kind) {
        record.el.remove();
        taskCards.delete(proposal.id);
        record = undefined;
      }
      if (!record) {
        record = { proposal };
        build(record);
        taskCards.set(proposal.id, record);
        record.el.classList.add("is-arriving");
        setTimeout(() => record.el.classList.remove("is-arriving"), CARD_IN_MS);
        taskView.insertBefore(record.el, taskStatus);
      }
      record.proposal = proposal;
      record.live = proposalLive(proposal, proposals);
      record.sync();
    });
    taskCards.forEach((record, id) => {
      if (shown.has(id)) return;
      record.el.remove();
      taskCards.delete(id);
    });
    // 收好 / Done: settles the task; that is when the skill and memory gate runs.
    taskDone.textContent = tr("clio_task_done");
    taskDone.hidden = task.state !== "delivered" || typeof taskTransport?.settle !== "function";
    const interrupted = task.state === "stopped" && task.interrupted === true;
    const line = interrupted ? "clio_task_interrupted_note" : TASK_LINES[task.state];
    taskStatus.hidden = !line;
    if (line) say(taskStatus, line);
    taskContinueBtn.hidden = !interrupted;
    if (interrupted) say(taskContinueBtn, "clio_task_continue");
    syncTaskQueue();
    syncTaskComposer();
    syncStrip();
    if (panelMode === "output" && panelOutput) {
      panelOutput = proposals.find((proposal) => proposal.id === panelOutput.id) || panelOutput;
    }
    if (panelOpen()) syncPanel();
  }

  // Follow-ups the writer typed while a turn ran: queued on the server, shown
  // under the running turn with a Remove button each. They go out when the
  // turn ends (or, at a plan or a question, with the writer's answer); if the
  // task ends first the note says they were not sent.
  function syncTaskQueue() {
    if (!taskView) return;
    const queued = Array.isArray(task?.queue) ? task.queue : [];
    const waiting = ["planning", "working", "awaiting_plan", "awaiting_answer"].includes(String(task?.state));
    const shown = waiting ? queued : [];
    const dropped = !queued.length && Number(task?.queueDropped?.count) > 0 ? task.queueDropped : null;
    // Nothing queued and nothing to say: the element is not in the thread.
    if (!shown.length && !dropped) {
      taskQueueEl?.remove();
      taskQueueRows.clear();
      taskQueueList?.replaceChildren();
      return;
    }
    if (!taskQueueEl) {
      taskQueueEl = node("div", "cl-task-queue");
      taskQueueHead = node("p", "cl-task-queue-h");
      taskQueueList = node("ul", "cl-task-queue-list");
      taskQueueNote = node("p", "cl-task-queue-note");
      taskQueueEl.append(taskQueueHead, taskQueueList, taskQueueNote);
    }
    if (taskQueueEl.parentNode !== taskView || taskQueueEl.nextSibling !== taskStatus) taskView.insertBefore(taskQueueEl, taskStatus);
    taskQueueEl.hidden = false;
    taskQueueHead.hidden = !shown.length;
    taskQueueList.hidden = !shown.length;
    taskQueueNote.hidden = !dropped;
    if (shown.length) say(taskQueueHead, taskRunning() ? "clio_task_queue_running" : "clio_task_queue_held");
    if (dropped) say(taskQueueNote, dropped.reason === "start_failed" ? "clio_task_queue_dropped_start" : "clio_task_queue_dropped", Number(dropped.count));
    const ids = new Set(shown.map((entry) => entry.id));
    taskQueueRows.forEach((row, id) => {
      if (ids.has(id)) return;
      row.remove();
      taskQueueRows.delete(id);
    });
    shown.forEach((entry, index) => {
      let row = taskQueueRows.get(entry.id);
      if (!row) {
        row = node("li", "cl-task-queue-item");
        const text = node("span", "cl-task-queue-text");
        const remove = node("button", "btn mini-btn cl-task-queue-remove", { type: "button" });
        remove.dataset.i18n = "clio_task_queue_remove";
        remove.textContent = tr("clio_task_queue_remove");
        remove.addEventListener("click", () => removeQueued(entry.id, remove));
        row.append(text, remove);
        taskQueueRows.set(entry.id, row);
      }
      const text = row.firstChild;
      setText(text, entry.text);
      const remove = row.lastChild;
      remove.setAttribute("aria-label", tr("clio_task_queue_remove_label", entry.text));
      if (taskQueueList.children[index] !== row) taskQueueList.insertBefore(row, taskQueueList.children[index] || null);
    });
  }

  function removeQueued(queueId, button) {
    if (!task || typeof taskTransport?.unqueue !== "function") return;
    const current = task;
    button.disabled = true;
    new Promise((resolve) => resolve(taskTransport.unqueue(current, queueId))).catch(() => {}).then(() => { button.disabled = false; });
  }

  // While a turn runs, Return queues what the writer typed instead of doing
  // nothing: the composer stays usable. The transport sends it to the task.
  function queueFromKeyboard(event) {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing || event.defaultPrevented) return;
    if (!taskRunning() || replyRunning() || typeof taskTransport?.queue !== "function") return;
    const prompt = event.currentTarget;
    const text = String(prompt?.value || "").trim();
    if (!text) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    prompt.value = "";
    if (typeof syncClioTalkSendButton === "function") syncClioTalkSendButton();
    const current = task;
    new Promise((resolve) => resolve(taskTransport.queue(current, text))).catch(() => {
      if (!prompt.value) prompt.value = text;
    });
  }

  // While the task runs, Send is Stop: the same button, as a reply's run
  // makes it. It goes back to Send only if no reply is running either.
  function syncTaskComposer() {
    const running = taskRunning();
    if (running === taskStopMode || typeof setComposerSubmitMode !== "function") return;
    taskStopMode = running;
    if (running) {
      setComposerSubmitMode(true);
      const send = document.getElementById("send");
      if (send) send.dataset.balloonHelp = "balloon_clio_stop_task";
    } else if (!replyRunning()) {
      setComposerSubmitMode(false);
    }
  }

  // Stop, Esc and ⌘. end a running task. The transport does it; with none,
  // the view says stopped at once.
  function stopTask() {
    if (!taskRunning()) return false;
    if (typeof taskTransport?.stop === "function") {
      const current = task;
      new Promise((resolve) => resolve(taskTransport.stop(current))).catch(() => {});
    } else {
      applyTask({ ...taskSnapshot, task: { ...task, state: "stopped" } });
    }
    return true;
  }

  // A reply's own run keeps its Stop; the button stops the task otherwise.
  function stopFromSend(event) {
    if (!taskRunning() || replyRunning() || !event.target?.closest?.("#send")) return;
    event.preventDefault();
    event.stopPropagation();
    stopTask();
  }

  // Esc gets out of the nearest thing first: a menu, a dialog, the panel,
  // the search field. With none of them, it is the running task. ⌘. stops
  // it from anywhere, as it stops a reply.
  function stopFromKeyboard(event) {
    // The phone's sheet covers the conversation, so Esc puts it away first,
    // wherever the focus is (a tap leaves it outside), and at once.
    if (event.key === "Escape" && !event.defaultPrevented && isPhone() && panelOpen() && frontWindow() === win
      && !document.querySelector(".menu.is-open, dialog[open], .modal-scrim:not(.is-hidden), #compose-tools-menu:not(.is-hidden)")) {
      event.preventDefault();
      closePanel(false);
      return;
    }
    if (!taskRunning() || replyRunning() || event.defaultPrevented) return;
    const period = event.key === "." && (event.metaKey || event.ctrlKey) && !event.altKey;
    if (event.key !== "Escape" && !period) return;
    if (event.key === "Escape" && (frontWindow() !== win || event.target?.closest?.(".clio-panel, .cl-search")
      || document.querySelector(".menu.is-open, dialog[open], .modal-scrim:not(.is-hidden), #compose-tools-menu:not(.is-hidden)"))) return;
    event.preventDefault();
    stopTask();
  }

  // While a plan or a question waits, what the writer sends from the
  // composer is the answer (after 改计划… or 我自己写), not a new message.
  // Only a connected task takes it; without a transport the words go to the
  // conversation as before rather than nowhere.
  function sendTypedAnswer(event) {
    if (!task || !taskTransport) return;
    const prompt = document.getElementById("prompt");
    const text = String(prompt?.value || "").trim();
    const proposals = taskProposals();
    const target = proposals.find((proposal) => (proposal.kind === "plan" || proposal.kind === "question")
      && proposalLive(proposal, proposals) && !taskSent.has(proposal.id));
    const method = target?.kind === "plan" ? "revisePlan" : "answer";
    if (!text || !target || typeof taskTransport[method] !== "function") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    prompt.value = "";
    if (typeof syncClioTalkSendButton === "function") syncClioTalkSendButton();
    sendAnswer(target, method, { text }, () => { if (!prompt.value) prompt.value = text; });
  }

  // Progress: the task's steps (done, under way, to come), what it made (a
  // row opens it in this panel), what it may touch and at what level, and
  // its tokens and estimated cost.
  function buildProgress() {
    progressPane = node("div", "cl-progress");
    progressSteps = node("ol", "cl-checklist");
    progressStepsSec = node("section", "cl-progress-sec");
    progressStepsSec.append(progressSteps);
    const outputsSec = node("section", "cl-progress-sec");
    progressOutputs = node("div", "cl-progress-list");
    outputsSec.append(progressHeading("clio_task_outputs"), progressOutputs);
    progressUsesSec = node("section", "cl-progress-sec");
    progressUses = node("div", "cl-progress-list");
    progressUsesSec.append(progressHeading("clio_task_uses"), progressUses);
    // Last, so the steps, Made and Uses sections keep their places.
    progressAsksSec = node("section", "cl-progress-sec");
    progressAsksSec.hidden = true;
    // The engine's own ledger, and one row per turn with Fork; both after
    // the sections above so those keep their places.
    progressLedgerSec = node("section", "cl-progress-sec");
    progressLedgerSec.hidden = true;
    progressTurnsSec = node("section", "cl-progress-sec");
    progressTurnsSec.hidden = true;
    // 收好 / Done, once the task has handed over: it settles the task (and runs the skill and memory gate).
    taskDone = node("button", "btn mini-btn cl-task-done", { type: "button" });
    taskDone.addEventListener("click", () => { void Promise.resolve(taskTransport?.settle?.(task)).catch(() => {}); });
    progressPane.append(progressStepsSec, outputsSec, progressUsesSec, progressAsksSec, progressLedgerSec, progressTurnsSec, taskDone);
    progressFoot = node("div", "cl-progress-foot");
    progressFoot.hidden = true;
    progressTokens = node("span");
    progressCost = node("span");
    progressFoot.append(progressTokens, progressCost);
    return progressFoot;
  }

  function progressHeading(labelKey) {
    const heading = node("h3", "cl-progress-h");
    say(heading, labelKey);
    return heading;
  }

  // Clio asks before an outside server's tool that is not read-only runs.
  // What the server called the tool is data: it is drawn, never obeyed.
  function syncConnectorAsks() {
    const asks = Array.isArray(taskSnapshot?.asks) ? taskSnapshot.asks : [];
    const key = JSON.stringify(asks);
    progressAsksSec.hidden = !asks.length;
    if (key === progressAsksKey) return;
    progressAsksKey = key;
    progressAsksSec.replaceChildren(...asks.map((ask) => {
      const box = node("div", "cl-progress-list");
      const title = node("b");
      say(title, "agent_connector_ask", ask.title, ask.connector);
      box.append(title);
      if (ask.args) {
        // Whole and scrollable, never one ellipsised line: a padded field
        // must not hide the ones that matter.
        const args = node("pre", "cl-progress-args");
        setText(args, ask.args);
        box.append(args);
      }
      if (ask.argsTruncated) {
        const cut = node("p", "hint");
        say(cut, "agent_connector_args_cut");
        box.append(cut);
      }
      if (ask.status === "pending" || ask.status === "failed") {
        const row = node("div", "button-row");
        [[true, "agent_connector_allow"], [false, "agent_connector_deny"]].forEach(([allow, labelKey]) => {
          const button = node("button", "btn mini-btn", { type: "button" });
          say(button, labelKey);
          button.addEventListener("click", () => {
            Promise.resolve(taskTransport?.answerConnector?.(ask.askId, allow)).catch(() => {});
          });
          row.append(button);
        });
        box.append(row);
        if (ask.status === "failed") {
          const note = node("p", "cl-progress-empty");
          say(note, "agent_connector_failed");
          box.append(note);
        }
      } else {
        const note = node("p", "cl-progress-empty");
        say(note, `agent_connector_${ask.status}`);
        box.append(note);
      }
      return box;
    }));
  }

  // The latest ledger the engine kept: its account of itself, drawn as such.
  function syncLedger() {
    const ledger = task.ledger;
    progressLedgerSec.hidden = !ledger;
    const key = JSON.stringify([ledger, document.documentElement.lang]);
    if (!ledger || key === progressLedgerKey) return;
    progressLedgerKey = key;
    const rows = [["clio_task_ledger_facts", ledger.facts], ["clio_task_ledger_done", ledger.done], ["clio_task_ledger_next", ledger.next]]
      .filter(([, list]) => Array.isArray(list) && list.length)
      .map(([labelKey, list]) => {
        const row = node("div", "cl-progress-row");
        const label = node("span", "cl-progress-name");
        say(label, labelKey);
        const value = node("span", "cl-progress-value");
        setText(value, list.join("；"));
        row.append(label, value);
        return row;
      });
    for (const [flag, labelKey] of [[ledger.stuck, "clio_task_ledger_stuck"], [ledger.looping, "clio_task_ledger_looping"]]) {
      if (!flag) continue;
      const note = node("p", "cl-progress-empty");
      say(note, labelKey);
      rows.push(note);
    }
    progressLedgerSec.replaceChildren(progressHeading("clio_task_ledger"), ...rows);
  }

  // One row per turn that has ended, each with Fork: a new task from what
  // that turn found. Words typed in the box become the fork's first message.
  function syncTurns() {
    const turns = (Array.isArray(taskSnapshot?.turns) ? taskSnapshot.turns : [])
      .filter((turn) => !turn.rewound && turn.snapshot && ["done", "stopped", "error"].includes(String(turn.state)));
    progressTurnsSec.hidden = !turns.length;
    const key = JSON.stringify([turns.map((turn) => [turn.n, turn.prompt]), document.documentElement.lang]);
    if (!turns.length || key === progressTurnsKey) return;
    progressTurnsKey = key;
    progressTurnsSec.replaceChildren(progressHeading("clio_task_turns"), ...turns.map((turn) => {
      const row = node("div", "cl-progress-row");
      const label = node("span", "cl-progress-name");
      setText(label, `${tr("clio_task_turn_n", turn.n)} · ${String(turn.prompt || "").split(/\r?\n/)[0].slice(0, 60)}`);
      const fork = node("button", "btn mini-btn cl-task-fork", { type: "button" });
      say(fork, "clio_task_fork");
      fork.setAttribute("aria-label", tr("clio_task_fork_label", turn.n));
      fork.addEventListener("click", () => {
        if (!task || typeof taskTransport?.fork !== "function") return;
        const input = document.getElementById("prompt");
        const text = String(input?.value || "").trim();
        fork.disabled = true;
        new Promise((resolve) => resolve(taskTransport.fork(task, turn.n, text))).then(() => { if (text && input) input.value = ""; }).catch(() => {}).then(() => { fork.disabled = false; });
      });
      row.append(label, fork);
      return row;
    }));
  }

  function syncProgress() {
    if (!task) return;
    const proposals = taskProposals();
    const steps = taskSteps();
    setPanelName(tr("clio_task_progress"), "clio_task_progress");
    const state = taskStateLabel(steps, proposals);
    if (state) say(panelStatus, ...state);
    else setText(panelStatus, "");
    panelFoot.hidden = true;
    if (progressPane.parentNode !== panelBody) {
      panelBody.replaceChildren(progressPane);
      panelBody.scrollTop = 0;
    }

    syncConnectorAsks();

    // A plan not yet approved has no step under way, nor has a finished task.
    const ongoing = task.state === "working" || task.state === "awaiting_answer";
    const now = ongoing ? currentStep(steps) : -1;
    progressStepsSec.hidden = !steps.length;
    const items = [...progressSteps.children];
    items.slice(steps.length).forEach((item) => item.remove());
    steps.forEach((step, index) => {
      let item = items[index];
      if (!item) {
        item = node("li", "cl-check");
        item.append(node("span", "cl-box", { "aria-hidden": "true" }), node("span", "cl-check-text"));
        progressSteps.append(item);
      }
      const status = step.status === "completed" ? "done" : index === now ? "now" : "next";
      if (item.dataset.status !== status) item.dataset.status = status;
      if (status === "now") item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
      setText(item.lastChild, step.text);
    });

    const outputs = proposals.filter((proposal) => proposal.kind === "new-document");
    const mounts = Array.isArray(task.mounts) ? task.mounts : [];
    const key = JSON.stringify([
      outputs.map((proposal) => [proposal.id, proposal.payload.name, proposal.title, proposal.payload.format]),
      mounts.map((mount) => [mount?.name, mount?.id, mount?.level]),
      task.web,
    ]);
    if (key !== progressKey) {
      progressKey = key;
      if (outputs.length) {
        progressOutputs.replaceChildren(...outputs.map((proposal) => {
          const row = node("button", "cl-progress-row cl-output", { type: "button" });
          const name = node("span", "cl-progress-name");
          name.textContent = String(proposal.payload.name || proposal.title || "");
          const format = node("span", "cl-progress-value");
          format.textContent = String(proposal.payload.format || "").toUpperCase();
          row.append(name, format);
          row.addEventListener("click", (event) => {
            openOutput(taskProposals().find((entry) => entry.id === proposal.id), { focus: event.detail === 0 });
          });
          return row;
        }));
      } else {
        const empty = node("p", "cl-progress-empty");
        say(empty, "clio_task_no_outputs");
        progressOutputs.replaceChildren(empty);
      }
      const rows = mounts.map((mount) => [String(mount?.name || mount?.id || ""), TASK_LEVELS.has(mount?.level) ? `clio_task_level_${mount.level}` : ""]);
      if (typeof task.web === "boolean") rows.push(["", task.web ? "clio_task_web_on" : "clio_task_web_off", "clio_task_web"]);
      progressUsesSec.hidden = !rows.length;
      progressUses.replaceChildren(...rows.map(([name, valueKey, nameKey]) => {
        const row = node("div", "cl-progress-row");
        const label = node("span", "cl-progress-name");
        if (nameKey) say(label, nameKey);
        else label.textContent = name;
        row.append(label);
        if (valueKey) {
          const value = node("span", "cl-progress-value");
          say(value, valueKey);
          row.append(value);
        }
        return row;
      }));
    }

    syncLedger();
    syncTurns();

    const usage = task.usage || {};
    const tokens = usage.tokens == null ? NaN : Number(usage.tokens);
    const cost = usage.costEstimate == null ? NaN : Number(usage.costEstimate);
    if (Number.isFinite(tokens)) say(progressTokens, "clio_task_tokens", typeof formatTokenCount === "function" ? formatTokenCount(tokens) : String(tokens));
    else setText(progressTokens, "");
    if (Number.isFinite(cost)) say(progressCost, "clio_task_cost", cost.toFixed(2));
    else setText(progressCost, "");
    progressFoot.hidden = !Number.isFinite(tokens) && !Number.isFinite(cost);
  }

  // Document ------------------------------------------------------------------
  //
  // Review.dc.html: the panel (620px) is the ClioWrite document ClioTalk
  // revised, its revisions drawn in the text (struck out, underlined) and one
  // card per revision beside it. An errand card (跑腿件) takes with 收下 by
  // default; a voice card (动字件, the writer's own sentence) sends back with
  // 退回 by default and is never in a batch. 收下跑腿件（N） in the head takes
  // the errands together. Nothing here writes: reading goes through
  // ClioWorksQuireReview.revisions and the delivery's report, and every
  // decision through the 修订 list's own road (AISystem6ClioWriteReview.take),
  // which also hands an accepted voice range to the 「AI 字」 ledger. A
  // ClioWrite window showing the same file settles after each decision.

  const quireReview = () => (typeof root.ClioWorksQuireReview?.revisions === "function" ? root.ClioWorksQuireReview : null);
  const deliveryApi = () => (typeof root.AISystem6ClioWriteAgentDelivery?.reportFor === "function" ? root.AISystem6ClioWriteAgentDelivery : null);
  const reviewApi = () => (typeof root.AISystem6ClioWriteReview?.take === "function" ? root.AISystem6ClioWriteReview : null);

  function docSource(source) {
    const docId = String(source?.docId || "");
    if (!docId) return null;
    return {
      docId,
      name: String(source.name || source.mountedName || docId),
      adapter: source.adapter || null,
      sourceNames: Array.isArray(source.sourceNames) ? source.sourceNames.map(String) : [],
      mountedName: String(source.mountedName || ""),
      item: source.item || null,
      open: typeof source.open === "function" ? source.open : null,
    };
  }

  // The adapter the file is read through: the one handed over, else the one
  // ClioWrite has mounted for it.
  const docAdapter = (source) => source.adapter || deliveryApi()?.adapterFor?.(source.docId) || null;

  // What the panel draws: the paragraphs, every revision in them, and
  // ClioTalk's revisions grouped into cards, one per paragraph it changed
  // (one candidate is one paragraph), in reading order.
  function docView(source) {
    const adapter = docAdapter(source);
    const quire = quireReview();
    const agent = deliveryApi();
    if (!adapter || !quire || !agent || typeof adapter.paragraphs !== "function") return { adapter: null, paragraphs: [], records: [], cards: [] };
    let records = [];
    let paragraphs = [];
    let report = null;
    try {
      records = quire.revisions(adapter) || [];
      paragraphs = adapter.paragraphs() || [];
      report = agent.reportFor(adapter);
    } catch (error) {
      console.warn("ClioTalk document:", error);
    }
    const groups = new Map();
    if (report) {
      records.forEach((record) => {
        if (record.author !== report.author) return;
        const id = String(record.paragraphId);
        if (!groups.has(id)) groups.set(id, []);
        groups.get(id).push(record);
      });
    }
    let ordinal = 0;
    const ordinals = new Map();
    const texts = new Map();
    paragraphs.forEach((p) => {
      if (String(p.text || "").trim() && !p.headingLevel) ordinal += 1;
      ordinals.set(String(p.id), ordinal);
      texts.set(String(p.id), String(p.text || ""));
    });
    const cards = [...groups].map(([paragraphId, rows]) => {
      const metas = rows.map((record) => agent.metaForRecord(adapter, record));
      // A row the delivery cannot name is the writer's until shown otherwise.
      const errand = metas.every((meta) => meta?.class === "errand");
      return { paragraphId, records: rows, kind: errand ? "errand" : "voice", meta: metas.find(Boolean) || null, ordinal: ordinals.get(paragraphId) || 1, text: texts.get(paragraphId) || "" };
    });
    return { adapter, paragraphs, records, cards };
  }

  // The words an errand changed, as each side reads: the paragraph without
  // the insertions (before) and without the deletions (after), from the first
  // change to the last, widened to the whole number or word the diff split
  // ("1,240", not "240").
  const WORDY = /[0-9A-Za-z.,%]/;
  function changedSide(text, rows, drop) {
    let out = "";
    let start = -1;
    let end = -1;
    let at = 0;
    rows.filter((record) => record.type === "ins" || record.type === "del").sort((x, y) => x.from - y.from).forEach((record) => {
      if (record.from < at) return;
      out += text.slice(at, record.from);
      if (record.type !== drop) {
        if (start < 0) start = out.length;
        out += text.slice(record.from, record.to);
        end = out.length;
      } else if (start < 0) {
        start = out.length;
        end = out.length;
      } else {
        end = Math.max(end, out.length);
      }
      at = record.to;
    });
    out += text.slice(at);
    if (start < 0) return "";
    while (start > 0 && WORDY.test(out[start - 1])) start -= 1;
    while (end < out.length && WORDY.test(out[end])) end += 1;
    return out.slice(start, end).trim();
  }

  function cardTitle(card) {
    if (card.kind === "voice") return tr("clio_review_voice_title", card.ordinal);
    const removed = changedSide(card.text, card.records, "ins");
    const added = changedSide(card.text, card.records, "del");
    if (removed && added) return `${removed} → ${added}`;
    return added ? tr("clio_review_insert", added) : tr("clio_review_remove", removed);
  }

  function cardNote(card, source) {
    if (card.kind === "voice") return tr("clio_review_voice_note");
    const basis = card.meta?.basis;
    const name = basis ? source.sourceNames[Number(basis.source) - 1] : "";
    if (name) return tr("clio_review_errand_basis", name);
    const reason = card.meta?.reason;
    return tr("clio_review_errand_reason", reason?.key ? tr(reason.key, ...(reason.args || [])) : tr("clio_write_agent_reason_errand"));
  }

  // One paragraph with its revisions in it: deleted words struck, inserted
  // words underlined, as ClioWrite draws them.
  function docParagraph(p, rows) {
    const el = node(p.headingLevel ? "h3" : "p", p.headingLevel ? "cl-doc-h" : "cl-doc-p");
    el.dataset.pid = String(p.id);
    const text = String(p.text || "");
    let at = 0;
    rows.filter((record) => (record.type === "ins" || record.type === "del") && record.to > record.from)
      .sort((x, y) => x.from - y.from)
      .forEach((record) => {
        if (record.from < at) return;
        if (record.from > at) el.append(text.slice(at, record.from));
        const mark = node(record.type);
        mark.textContent = text.slice(record.from, record.to);
        el.append(mark);
        at = record.to;
      });
    if (at < text.length) el.append(text.slice(at));
    return el;
  }

  function revisionCard(card, source) {
    const voice = card.kind === "voice";
    const el = node("section", `cl-rev-card${voice ? " is-voice" : ""}`, { role: "group" });
    el.dataset.pid = card.paragraphId;
    el.dataset.kind = card.kind;
    const title = node("div", "cl-rev-title");
    title.textContent = cardTitle(card);
    el.setAttribute("aria-label", title.textContent);
    const note = node("p", "cl-rev-note");
    note.textContent = cardNote(card, source);
    const actions = node("div", "cl-actions");
    // Both cards read 收下 then 退回; the default is the one the class
    // presumes: 收下 for an errand, 退回 for the writer's own words.
    const take = textButton(`btn cl-rev-take${voice ? "" : " default"}`, "clio_review_take", () => decide(card.records, true, "Accept Revision"));
    const back = textButton(`btn cl-rev-return${voice ? " default" : ""}`, "clio_review_return", () => decide(card.records, false, "Reject Revision"));
    actions.append(take, back);
    el.append(title, note, actions);
    // A click on the card (not its buttons) brings its paragraph into view.
    el.addEventListener("click", (event) => {
      if (event.target.closest?.("button")) return;
      panelBody.querySelector(`.cl-doc-text [data-pid="${CSS.escape(card.paragraphId)}"]`)?.scrollIntoView?.({ block: "nearest" });
    });
    return el;
  }

  function openButton(source) {
    const button = textButton("btn cl-doc-open", "clio_review_open", (event) => {
      event.stopPropagation();
      openInClioWrite(source);
    });
    button.disabled = !source.open && !clioWorksHost() && typeof root.ensureClioWorksLedgerModule !== "function";
    return button;
  }

  // 在 ClioWrite 打开: the real editor, through the desk's own document road
  // (the native host, loaded on first use).
  const clioWorksHost = () => (typeof root.AISystem6ClioWorks?.openNativeDocument === "function" ? root.AISystem6ClioWorks : null);
  async function openInClioWrite(source) {
    if (source.open) return source.open();
    if (!clioWorksHost() && typeof root.ensureClioWorksLedgerModule === "function") await root.ensureClioWorksLedgerModule();
    const host = clioWorksHost();
    return host ? host.openNativeDocument(source.item || { mountedName: source.mountedName || source.name }, { intent: "edit" }) : null;
  }

  function syncDocument() {
    const source = panelDoc;
    setPanelName(source.name);
    setText(panelStatus, "ClioWrite");
    panelFoot.hidden = true;
    const view = docView(source);
    const errands = view.cards.filter((card) => card.kind === "errand");
    docBatch.hidden = !errands.length;
    if (errands.length) say(docBatch, "clio_write_agent_batch_button", errands.length);
    const key = JSON.stringify([
      source.docId,
      panelDocFailure,
      view.paragraphs.map((p) => [p.id, p.text, p.headingLevel || 0]),
      view.records.map((record) => [record.type, record.paragraphId, record.from, record.to, record.author]),
      view.cards.map((card) => card.kind),
      document.documentElement.lang,
    ]);
    if (key === panelDocKey && panelBody.firstChild?.classList?.contains("cl-doc")) return;
    panelDocKey = key;
    // Focus inside the cards survives the redraw on the card in its place.
    const focusAt = [...panelBody.querySelectorAll(".cl-rev-card")].findIndex((el) => el.contains(document.activeElement));
    const pane = node("div", "cl-doc");
    const cardsEl = node("div", "cl-doc-cards", { role: "list" });
    cardsEl.setAttribute("aria-label", tr("clio_review_revisions"));
    if (!view.adapter) {
      const waiting = node("p", "cl-doc-note");
      say(waiting, "clio_review_waiting");
      cardsEl.append(waiting, openButton(source));
      pane.append(cardsEl);
    } else {
      const byParagraph = new Map();
      view.records.forEach((record) => {
        const id = String(record.paragraphId);
        if (!byParagraph.has(id)) byParagraph.set(id, []);
        byParagraph.get(id).push(record);
      });
      const textEl = node("div", "cl-doc-text");
      textEl.append(...view.paragraphs.map((p) => docParagraph(p, byParagraph.get(String(p.id)) || [])));
      if (panelDocFailure) {
        const alert = node("p", "cl-doc-note", { role: "alert" });
        alert.textContent = panelDocFailure;
        cardsEl.append(alert);
      }
      cardsEl.append(...view.cards.map((card) => {
        const el = revisionCard(card, source);
        el.setAttribute("role", "listitem");
        return el;
      }));
      if (!view.cards.length) {
        const done = node("p", "cl-doc-note");
        say(done, "clio_review_done");
        cardsEl.append(done);
      }
      cardsEl.append(openButton(source));
      pane.append(textEl, cardsEl);
    }
    panelBody.replaceChildren(pane);
    if (focusAt >= 0) {
      const cards = panelBody.querySelectorAll(".cl-rev-card");
      const next = cards[Math.min(focusAt, cards.length - 1)];
      (next?.querySelector(".btn.default") || panelBody).focus({ preventScroll: true });
    }
  }

  // Every decision is one named step on the document's history, through the
  // 修订 list's road; the file card and a ClioWrite window on the same file
  // follow.
  function decide(records, accept, label) {
    const source = panelDoc;
    const adapter = source && docAdapter(source);
    const api = reviewApi();
    if (!adapter || !api || !records.length) return;
    const failure = api.take(adapter, records, accept, label);
    panelDocFailure = failure;
    if (!failure) {
      try { root.AISystem6ClioWrite?.settleExternalEdit?.(adapter); } catch (error) { console.warn("ClioTalk document:", error); }
      try { root.AISystem6ClioWriteReview?.refresh?.(); } catch (error) { /* the list redraws when it next opens */ }
    }
    syncDocument();
    syncDocCard(source.docId);
  }

  // 收下跑腿件: the errand records the 修订 list's own filter names, and only
  // those in an errand card; never a voice row.
  function takeErrands() {
    const source = panelDoc;
    const adapter = source && docAdapter(source);
    const api = reviewApi();
    if (!adapter || !api) return;
    const errandIn = new Set(docView(source).cards.filter((card) => card.kind === "errand").map((card) => card.paragraphId));
    const records = (api.errandRecords(adapter) || []).filter((record) => errandIn.has(String(record.paragraphId)));
    decide(records, true, "收下跑腿件");
  }

  // The file card in the conversation (Review.dc.html): its kind, its name,
  // what is waiting in it; a click opens it in the panel, and 在 ClioWrite
  // 打开 opens the editor.
  function deliverDocument(input) {
    const source = docSource(input);
    const messages = document.getElementById("messages");
    if (!source || !messages) return null;
    let entry = docCards.get(source.docId);
    if (!entry) {
      const card = node("div", "cl-file", { role: "group" });
      const main = node("button", "cl-file-main", { type: "button" });
      const tile = node("span", "cl-file-tile", { "aria-hidden": "true" });
      tile.textContent = "DOCX";
      const text = node("span", "cl-file-text");
      const name = node("b", "cl-file-name");
      const sub = node("span", "cl-file-sub");
      text.append(name, sub);
      main.append(tile, text);
      main.addEventListener("click", (event) => showDocument(docCards.get(source.docId)?.source, { animate: event.detail !== 0, focus: event.detail === 0 }));
      card.append(main);
      entry = { source, card, name, sub, main };
      docCards.set(source.docId, entry);
    }
    entry.source = source;
    entry.card.querySelector(".cl-doc-open")?.remove();
    entry.card.append(openButton(source));
    if (!entry.card.isConnected) {
      if (taskView?.isConnected) taskView.insertBefore(entry.card, taskStatus);
      else messages.append(entry.card);
    }
    syncDocCard(source.docId);
    if (panelOpen() && panelMode === "document" && panelDoc?.docId === source.docId) {
      panelDoc = source;
      syncDocument();
    }
    return entry.card;
  }

  function syncDocCard(docId) {
    const entry = docCards.get(docId);
    if (!entry) return;
    setText(entry.name, entry.source.name);
    entry.card.setAttribute("aria-label", entry.source.name);
    const view = docView(entry.source);
    const errands = view.cards.filter((card) => card.kind === "errand").length;
    if (!view.adapter) say(entry.sub, "clio_review_waiting");
    else if (!view.cards.length) say(entry.sub, "clio_review_done");
    else say(entry.sub, "clio_review_count", view.cards.length, errands, view.cards.length - errands);
  }

  // The panel in document mode. The review engine rides ClioWrite's lazy
  // loader; a desk that has not loaded it yet loads it, then draws again.
  function showDocument(input, options) {
    const source = typeof input === "string" ? docCards.get(input)?.source : docSource(input);
    if (!source || !shell?.dataset.skin) return;
    if (docCards.has(source.docId)) docCards.get(source.docId).source = source;
    panelMode = "document";
    if (panelDoc?.docId !== source.docId) panelDocFailure = "";
    panelDoc = source;
    panelDocKey = "";
    syncPanel();
    revealPanel(options);
    if (!reviewApi() && typeof root.AISystem6EnsureClioWriteReviewModule === "function") {
      Promise.resolve(root.AISystem6EnsureClioWriteReviewModule()).then(() => {
        if (panelMode === "document" && panelDoc === source && panelOpen()) syncDocument();
        syncDocCard(source.docId);
      }, (error) => console.warn("ClioTalk document:", error));
    }
  }

  // ClioWork -----------------------------------------------------------------
  //
  // The document studio, a page of this window (rulings U2, M7): the open
  // project's Office documents, newest first, each with its kind, its app,
  // when it last changed and what Clio is doing with it; a composer that
  // gives Clio a job over the ticked ones; and the job in hand. A job is a
  // task of the existing task layer (cliotalk-agent.js): the ticked files
  // are lent as projections under .ais6-documents/, its plan, questions and
  // progress are the conversation's cards and panel, and its revisions come
  // back to ClioWrite, ClioChart or ClioStage as tracked changes the writer
  // accepts one by one there. Opening a document opens its own app, beside
  // this window, and the revision cards in the panel when Clio left some.
  // The page stores nothing: the files are the desk's (chatFiles), the
  // ticks live as long as the window.

  // As many as a task mounts besides its one folder (TASK_MAX_LENT).
  const WORK_MAX_LENT = 3;
  const WORK_APPS = { docx: "ClioWrite", xlsx: "ClioChart", pptx: "ClioStage" };
  const workPicked = new Set();
  let work = null;
  let workCount = null;
  let workJob = null;
  let workList = null;
  let workPicks = null;
  let workPrompt = null;
  let workSuggest = null;
  let workStart = null;
  let workLimit = null;
  let workError = null;
  let workListKey = "";
  let workBusy = false;
  // The conversation ClioWork was opened over: its file and its length.
  let workFrom = "";
  const workThread = () => `${typeof activeChatFileId !== "undefined" ? activeChatFileId : ""}|${typeof conversation !== "undefined" && Array.isArray(conversation) ? conversation.length : 0}`;

  const workProject = () => (typeof getActiveProject === "function" ? getActiveProject() : null);

  // The project's Office documents, last changed first.
  function workFiles() {
    const project = workProject();
    const files = typeof chatFiles !== "undefined" && Array.isArray(chatFiles) ? chatFiles : [];
    if (!project) return [];
    return files.filter((item) => item?.type === "office" && item.projectId === project.id && WORK_APPS[String(item.format)])
      .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
  }

  function workFileName(item) {
    const base = String(item.name || item.id);
    const format = String(item.format);
    return base.toLowerCase().endsWith(`.${format}`) ? base : `${base}.${format}`;
  }

  function workWhen(value) {
    const date = new Date(value || 0);
    if (!value || Number.isNaN(date.getTime())) return "";
    const lang = document.documentElement.lang || "en";
    const time = date.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" });
    if (date.toDateString() === new Date().toDateString()) return tr("clio_work_today", time);
    return date.toLocaleDateString(lang, { month: "short", day: "numeric" });
  }

  function workSize(bytes) {
    const n = Number(bytes) || 0;
    if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(n / 1024))} KB`;
  }

  // What Clio is doing with a document: lent to the job under way, or the
  // revisions it left there (the panel's own count once the file is open,
  // else what the task measured when it handed over).
  function workState(item) {
    const id = String(item.id);
    const entry = docCards.get(id);
    if (entry) {
      const view = docView(entry.source);
      if (view.adapter) return view.cards.length ? tr("clio_work_revisions", view.cards.length) : "";
    }
    const measured = (taskSnapshot?.documents || []).filter((doc) => String(doc.docId) === id).pop();
    if (measured?.revisions) return tr("clio_work_revisions", measured.revisions);
    if (task && !TASK_ENDED.has(task.state) && (task.mounts || []).some((mount) => String(mount.id) === id)) return tr("clio_work_lent");
    return "";
  }

  function buildWork() {
    work = node("section", "clio-work");
    work.setAttribute("aria-label", "ClioWork");
    const head = node("header", "cw-head");
    const back = node("button", "btn cw-back", { type: "button" });
    back.dataset.i18nAriaLabel = "clio_shell_conversations";
    back.setAttribute("aria-label", tr("clio_shell_conversations"));
    back.insertAdjacentHTML("beforeend", icon(ICONS.back));
    back.addEventListener("click", (event) => setLayer("list", { focus: event.detail === 0 }));
    const titles = node("div", "cw-titles");
    const title = node("h2", "cw-title");
    title.textContent = "ClioWork";
    workCount = node("span", "cw-count");
    titles.append(title, workCount);
    const fresh = textButton("btn cw-new", "clio_work_new", () => {});
    fresh.dataset.action = "new-office-document";
    head.append(back, titles, fresh);

    const lead = node("p", "cw-lead");
    lead.dataset.i18n = "clio_work_lead";
    lead.textContent = tr("clio_work_lead");
    workJob = node("div", "cw-job", { role: "group" });
    workJob.hidden = true;
    workList = node("div", "cw-list", { role: "list" });
    workList.dataset.i18nAriaLabel = "clio_work_docs";
    workList.setAttribute("aria-label", tr("clio_work_docs"));
    const scroll = node("div", "cw-scroll");
    scroll.append(lead, workJob, workList);

    const composer = node("form", "cw-composer");
    composer.addEventListener("submit", (event) => {
      event.preventDefault();
      startWork();
    });
    workPicks = node("div", "cw-picks", { "aria-live": "polite" });
    workPrompt = node("textarea", "cw-prompt", { rows: "2" });
    workPrompt.dataset.i18nPlaceholder = "clio_work_prompt";
    workPrompt.dataset.i18nAriaLabel = "clio_work_prompt";
    workPrompt.placeholder = tr("clio_work_prompt");
    workPrompt.setAttribute("aria-label", tr("clio_work_prompt"));
    workPrompt.addEventListener("input", syncWorkStart);
    workPrompt.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      startWork();
    });
    workSuggest = node("div", "cw-suggest");
    const foot = node("div", "cw-foot");
    const noteEl = node("span", "cw-note");
    noteEl.dataset.i18n = "clio_work_note";
    noteEl.textContent = tr("clio_work_note");
    workStart = node("button", "btn default cw-start", { type: "submit" });
    workStart.dataset.i18n = "clio_work_start";
    workStart.textContent = tr("clio_work_start");
    foot.append(noteEl, workStart);
    // Why the last 交给 Clio did not start, in the agent's own words.
    workError = node("p", "cw-error", { role: "alert" });
    workError.hidden = true;
    composer.append(workPicks, workPrompt, workSuggest, workError, foot);
    work.append(head, scroll, composer);
    // Coming back to the page (or to the window) is when a file saved,
    // imported or deleted elsewhere is worth catching up on.
    work.addEventListener("pointerenter", () => renderWork());
    return work;
  }

  function setPage(next, { focus = false } = {}) {
    if (!shell) return;
    shell.dataset.page = next;
    if (next === "work") {
      workFrom = workThread();
      workRow?.setAttribute("aria-current", "page");
      renderWork();
    } else {
      workRow?.removeAttribute("aria-current");
    }
    if (isPhone()) setLayer(next === "work" ? "work" : "thread", { focus: focus && next !== "work" });
    if (focus && next === "work") (workList.querySelector("input:not(:disabled)") || workPrompt).focus({ preventScroll: true });
  }

  function renderWork() {
    if (!work || shell.dataset.page !== "work") return;
    const project = workProject();
    const files = workFiles();
    const present = new Set(files.map((item) => String(item.id)));
    [...workPicked].forEach((id) => { if (!present.has(id)) workPicked.delete(id); });
    if (project) say(workCount, "clio_work_count", files.length, String(project.name || ""));
    else setText(workCount, "");
    syncWorkJob();
    const key = JSON.stringify([project?.id, document.documentElement.lang, [...workPicked],
      files.map((item) => [item.id, item.name, item.updatedAt, item.byteLength, workState(item)])]);
    if (key !== workListKey) {
      workListKey = key;
      if (!project) workList.replaceChildren(workEmpty("clio_work_no_project_title", "clio_work_no_project_body", "projects", "open-project-disks"));
      else if (!files.length) workList.replaceChildren(workEmpty("clio_work_empty_title", "clio_work_empty_body", "clio_work_new", "new-office-document"));
      else workList.replaceChildren(...files.map(workRowFor));
    }
    work.classList.toggle("is-empty", !files.length);
    syncWorkPicks(files);
  }

  function workEmpty(titleKey, bodyKey, buttonKey, action) {
    const box = node("div", "cw-empty");
    const title = node("b", "cw-empty-title");
    say(title, titleKey);
    const body = node("p", "cw-empty-body");
    say(body, bodyKey);
    const button = textButton("btn", buttonKey, () => {});
    button.dataset.action = action;
    box.append(title, body, button);
    return box;
  }

  function workRowFor(item) {
    const id = String(item.id);
    const name = workFileName(item);
    const format = String(item.format);
    const row = node("div", "cw-doc", { role: "listitem" });
    row.dataset.fileId = id;
    row.classList.toggle("is-picked", workPicked.has(id));
    const pick = node("label", "cw-doc-main");
    const box = node("input", "cw-pick", { type: "checkbox" });
    box.checked = workPicked.has(id);
    box.setAttribute("aria-label", tr("clio_work_pick", name));
    box.addEventListener("change", () => {
      if (box.checked && workPicked.size < WORK_MAX_LENT) workPicked.add(id);
      else workPicked.delete(id);
      box.checked = workPicked.has(id);
      row.classList.toggle("is-picked", box.checked);
      syncWorkPicks(workFiles());
    });
    const tile = node("span", "cl-file-tile cw-tile", { "aria-hidden": "true" });
    tile.dataset.format = format;
    tile.textContent = format.toUpperCase();
    const text = node("span", "cw-doc-text");
    const title = node("span", "cw-doc-name");
    title.textContent = name;
    title.title = name;
    const sub = node("span", "cw-doc-sub");
    sub.textContent = [WORK_APPS[format], workWhen(item.updatedAt || item.createdAt), workSize(item.byteLength)].filter(Boolean).join("　");
    text.append(title, sub);
    pick.append(box, tile, text);
    const stateWords = workState(item);
    const stateEl = node("span", "cw-doc-state");
    stateEl.textContent = stateWords;
    stateEl.hidden = !stateWords;
    const open = node("button", "btn cw-doc-open", { type: "button" });
    open.textContent = tr("clio_work_open");
    open.title = tr("clio_work_open_in", WORK_APPS[format]);
    open.setAttribute("aria-label", `${tr("clio_work_open_in", WORK_APPS[format])}: ${name}`);
    open.addEventListener("click", () => openWorkDocument(item));
    row.append(pick, stateEl, open);
    return row;
  }

  // The ticked files above the field (each one a chip that takes it back),
  // the limit once it is reached, the suggestions that fit what is ticked.
  function syncWorkPicks(files) {
    const picked = files.filter((item) => workPicked.has(String(item.id)));
    const full = workPicked.size >= WORK_MAX_LENT;
    workList.querySelectorAll(".cw-pick").forEach((box) => { box.disabled = full && !box.checked; });
    syncWorkStart();
    // Redrawn only when they change: a press must land on the button it
    // started on, though the window raising itself redraws the page.
    const key = JSON.stringify([document.documentElement.lang, picked.map((item) => [item.id, item.name, item.format])]);
    if (key === workPicks.dataset.key) return;
    workPicks.dataset.key = key;
    if (!picked.length) {
      const hint = node("span", "cw-picks-hint");
      say(hint, "clio_work_none_picked");
      workPicks.replaceChildren(hint);
    } else {
      const label = node("span", "cw-picks-label");
      say(label, "clio_work_picked");
      workPicks.replaceChildren(label, ...picked.map((item) => {
        const name = workFileName(item);
        const chip = node("button", "cw-chip", { type: "button" });
        chip.setAttribute("aria-label", tr("clio_work_unpick", name));
        chip.title = tr("clio_work_unpick", name);
        const tile = node("span", "cw-chip-kind", { "aria-hidden": "true" });
        tile.textContent = String(item.format).toUpperCase();
        const words = node("span", "cw-chip-name");
        words.textContent = name;
        chip.append(tile, words);
        chip.insertAdjacentHTML("beforeend", icon(ICONS.close));
        chip.addEventListener("click", () => {
          workPicked.delete(String(item.id));
          workListKey = "";
          renderWork();
        });
        return chip;
      }));
      if (full) {
        workLimit ||= node("span", "cw-limit");
        say(workLimit, "clio_work_limit", WORK_MAX_LENT);
        workPicks.append(workLimit);
      }
    }
    const formats = new Set(picked.map((item) => String(item.format)));
    const keys = [];
    if (picked.length > 1) keys.push("clio_work_suggest_merge");
    if (formats.has("xlsx")) keys.push("clio_work_suggest_formulas");
    if (formats.has("docx")) keys.push("clio_work_suggest_deck");
    keys.push("clio_work_suggest_facts");
    if (!picked.length) keys.splice(0, keys.length, "clio_work_suggest_merge", "clio_work_suggest_formulas", "clio_work_suggest_deck");
    workSuggest.replaceChildren(...keys.slice(0, 3).map((key) => textButton("btn cw-suggestion", key, () => {
      workPrompt.value = tr(key);
      syncWorkStart();
      workPrompt.focus({ preventScroll: true });
    })));
  }

  function syncWorkStart() {
    workStart.disabled = workBusy || !workPicked.size || !workPrompt.value.trim();
  }

  // The job in hand, as one card: its name, what it is doing, what it
  // borrowed; a press goes back to the conversation and its progress.
  function syncWorkJob() {
    workJob.hidden = !task;
    if (!task) return;
    const state = taskStateLabel(taskSteps(), taskProposals());
    const names = (task.mounts || []).filter((mount) => mount.kind !== "folder").map((mount) => String(mount.name || "")).filter(Boolean);
    const key = JSON.stringify([task.id, task.title, state, names, document.documentElement.lang]);
    if (workJob.dataset.key === key) return;
    workJob.dataset.key = key;
    const label = node("span", "cw-job-label");
    say(label, "clio_work_job");
    const title = node("b", "cw-job-title");
    title.textContent = String(task.title || taskSnapshot?.turns?.[0]?.prompt || "");
    const line = node("span", "cw-job-state");
    if (state) say(line, ...state);
    const docs = node("span", "cw-job-docs");
    if (names.length) docs.textContent = tr("clio_work_job_docs", names.join("、"));
    const back = textButton("btn cw-job-back", "clio_work_job_back", (event) => {
      setPage("chat", { focus: event.detail === 0 });
      showProgress({ animate: event.detail !== 0 });
    });
    const text = node("div", "cw-job-text");
    text.append(label, title, line, docs);
    workJob.setAttribute("aria-label", title.textContent);
    workJob.replaceChildren(text, back);
  }

  // 交给 Clio: a new task in a new conversation, over the ticked files. The
  // agent module does the lending and the starting; the page shows the
  // conversation, where the plan arrives.
  async function startWork() {
    const prompt = workPrompt.value.trim();
    const ids = [...workPicked];
    if (workBusy || !prompt || !ids.length) return;
    workBusy = true;
    workError.hidden = true;
    syncWorkStart();
    try {
      if (typeof ensureClioTalkAgentModule === "function") await ensureClioTalkAgentModule();
      const agent = root.AISystem6ClioTalkAgent;
      // 代理 first: where it cannot open, the page says so and keeps the job.
      await agent.activate();
      if (!agent.isActive()) {
        say(workError, "agent_unavailable");
        workError.hidden = false;
        return;
      }
      const started = typeof conversation !== "undefined" && Array.isArray(conversation) && conversation.length;
      if (started && typeof startNewClioTalkConversation === "function" && !(await startNewClioTalkConversation())) return;
      setPage("chat");
      await agent.work({ prompt, fileIds: ids });
      workPrompt.value = "";
      workPicked.clear();
      workListKey = "";
    } finally {
      workBusy = false;
      syncWorkStart();
    }
  }

  // Opening a document is its own app, through the desk's document road,
  // laid beside this window; with Clio's revisions waiting in it, the panel
  // shows them too.
  async function openWorkDocument(item) {
    const id = String(item.id);
    const entry = docCards.get(id);
    await openInClioWrite(entry?.source || { item, name: workFileName(item) });
    const opened = frontWindow();
    if (!isPhone() && opened && opened !== win && typeof tileWindows === "function") await tileWindows([win, opened]);
    if (entry && !isPhone()) showDocument(entry.source, { animate: true });
  }

  function applyTask(snapshot) {
    const next = snapshot?.task;
    if (!next?.id) {
      taskDropped = "";
      clearTask();
      return;
    }
    if (String(next.id) === taskDropped) return;
    if (task && String(task.id) !== String(next.id)) clearTask();
    taskSnapshot = { task: next, turns: Array.isArray(snapshot.turns) ? snapshot.turns : [], progress: snapshot.progress, asks: Array.isArray(snapshot.asks) ? snapshot.asks : [], documents: Array.isArray(snapshot.documents) ? snapshot.documents : [] };
    task = next;
    taskSent.forEach((state, id) => { if (state === "done") taskSent.delete(id); });
    renderTask();
    renderWork();
    // The progress panel shows itself once, when the task starts its work,
    // and only into an empty place: a reply open there stays. The phone has
    // no empty place (its sheet would cover the conversation); the strip
    // says the work has started.
    if (task.state === "working" && taskAutoOpened !== String(task.id)) {
      taskAutoOpened = String(task.id);
      if (!panelOpen() && !isPhone()) showProgress({ animate: true });
    }
    // A new connector question opens the progress panel the same way, since
    // the task waits on the writer's answer there.
    const waiting = taskSnapshot.asks.filter((ask) => ask.status === "pending" && !taskAsksShown.has(ask.askId));
    waiting.forEach((ask) => taskAsksShown.add(ask.askId));
    if (waiting.length && !panelOpen() && !isPhone()) showProgress({ animate: true });
  }

  // A refusal from the task layer (two tasks already working, a lent
  // document the server would not take, a turn sent too early), in the
  // words it was handed: one line in the thread, under the task when there
  // is one. Empty text takes it away.
  let taskNoticeEl = null;
  function noticeTask(text) {
    const words = String(text || "").trim();
    if (!words) {
      taskNoticeEl?.remove();
      return;
    }
    const messages = document.getElementById("messages");
    if (!messages) return;
    if (!taskNoticeEl) taskNoticeEl = node("p", "cl-task-error", { role: "alert" });
    setText(taskNoticeEl, words);
    if (taskView?.isConnected) taskView.insertBefore(taskNoticeEl, taskStatus);
    else if (taskNoticeEl.parentNode !== messages || taskNoticeEl !== messages.lastElementChild) messages.append(taskNoticeEl);
  }

  function clearTask() {
    task = null;
    taskSnapshot = null;
    taskSent.clear();
    taskCards.clear();
    taskView?.remove();
    taskView = null;
    taskContinueBtn?.remove();
    taskQueueEl = null;
    taskQueueRows.clear();
    progressKey = "";
    progressLedgerKey = "";
    progressTurnsKey = "";
    main?.classList.remove("has-task");
    syncStrip();
    renderWork();
    // A document stays: it is the writer's file, not the task's.
    if (panelMode === "output" || panelMode === "progress") {
      closePanel(false);
      panelMode = "reply";
      panelOutput = null;
    } else if (panelOpen()) {
      syncPanel();
    }
    syncTaskComposer();
  }

  // The transcript owns the thread: when it is cleared (a new chat, another
  // chat file opened) the task's view goes with it, and later snapshots of
  // that task are not drawn into the next conversation.
  function dropTask() {
    taskDropped = String(task?.id || "");
    clearTask();
  }

  function registerToggle() {
    if (typeof keyboardShortcutRegistry !== "undefined" && Array.isArray(keyboardShortcutRegistry)
      && !keyboardShortcutRegistry.some((entry) => entry.id === "clio-toggle-panel")) {
      keyboardShortcutRegistry.push({ id: "clio-toggle-panel", key: "\\", action: "clio-toggle-panel", display: "⌘\\", labelKey: "clio_shell_toggle_panel", scope: ["clioTalk"] });
    }
    try {
      root.AISystem6Runtime?.registerCommand?.("clio-toggle-panel", { handler: togglePanel, isAvailable: canTogglePanel });
    } catch (error) { /* registered by an earlier load */ }
  }

  function build() {
    win = document.querySelector('[data-window="assistant"]');
    if (!win || win.querySelector(":scope > .clio-shell")) return false;
    const stage = win.querySelector(":scope > .messages-stage");
    const form = win.querySelector(":scope > #chat-form");
    if (!stage || !form) return false;

    installStrings();
    shell = node("div", "clio-shell");
    main = node("div", "clio-main");
    const greeting = node("h2", "clio-greeting");
    greeting.dataset.i18n = "clio_shell_greeting";
    greeting.textContent = tr("clio_shell_greeting");
    // The details bar keeps its order (first, above the transcript), so
    // appearances without a skin lay the window out exactly as before.
    const details = win.querySelector(":scope > .assistant-details-bar");
    win.insertBefore(shell, details || stage);
    // The scrim dims the conversation under the phone's sheet; a tap on it
    // puts the sheet away. It and the panel come last, so they lie on top.
    const scrim = node("div", "cl-scrim", { "aria-hidden": "true" });
    scrim.addEventListener("click", () => closePanel(true));
    shell.dataset.page = "chat";
    shell.append(buildSidebar(), main, buildWork(), scrim, buildPanel());
    main.append(buildThreadHead());
    if (details) main.append(details);
    main.append(greeting, stage, buildStrip(), form, buildNote());

    // The Shift+Enter hint leaves the composer row (the boards carry none);
    // it stays on the field as a tooltip.
    const prompt = form.querySelector("#prompt");
    if (prompt && !prompt.title) {
      prompt.dataset.i18nTitle = "clio_composer_key_hint";
      prompt.title = tr("clio_composer_key_hint");
    }
    buildModelMenu(form);
    syncSkin();
    new MutationObserver(syncSkin).observe(document.body, { attributes: true, attributeFilter: ["data-theme"] });
    const phoneQuery = typeof matchMedia === "function" ? matchMedia(PHONE_QUERY) : null;
    syncPhone(phoneQuery);
    phoneQuery?.addEventListener?.("change", syncPhone);
    renderRecent();
    syncEmpty();
    decorateReplies();
    registerToggle();

    form.addEventListener("click", stopFromSend, true);
    form.addEventListener("submit", sendTypedAnswer, true);
    document.getElementById("prompt")?.addEventListener("keydown", queueFromKeyboard, true);
    document.addEventListener("keydown", stopFromKeyboard, true);
    // A task's labels with counts in them are drawn, not keyed; a language
    // switch redraws them, and so does the desk's language arriving when the
    // module was loaded before it. The shell's own words go back into the
    // tables first, in case a table replaced them since. (Keyed labels are
    // relabelled by the desk itself.)
    const relabel = () => {
      installStrings();
      if (task) renderTask();
      docCards.forEach((entry, docId) => syncDocCard(docId));
      if (panelOpen() && panelMode === "document") syncDocument();
      workListKey = "";
      renderWork();
    };
    new MutationObserver(relabel).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    if (typeof whenLanguageReady === "function") whenLanguageReady().then(relabel);

    const messages = document.getElementById("messages");
    if (messages) {
      new MutationObserver(() => {
        // Another conversation, or a new message in this one, brings the
        // conversation forward.
        if (shell.dataset.page === "work" && workThread() !== workFrom) setPage("chat");
        if (taskView && !taskView.isConnected) dropTask();
        docCards.forEach((entry, docId) => { if (!entry.card.isConnected) docCards.delete(docId); });
        syncEmpty();
        renderRecent();
      }).observe(messages, { childList: true });
      let frame = 0;
      new MutationObserver(() => {
        if (!frame) frame = requestAnimationFrame(() => { frame = 0; decorateReplies(); });
      }).observe(messages, { childList: true, subtree: true });
    }
    const label = document.getElementById("cloud-model-label");
    if (label) new MutationObserver(syncModel).observe(label, { childList: true, characterData: true, subtree: true });
    const indicator = document.getElementById("cloud-model-indicator");
    if (indicator) new MutationObserver(syncModel).observe(indicator, { attributes: true, attributeFilter: ["class"] });
    const connect = document.getElementById("clio-connect-ai");
    if (connect) new MutationObserver(syncEmpty).observe(connect, { attributes: true, attributeFilter: ["hidden"] });
    // Raising the window is the moment a rename or delete made elsewhere is
    // worth catching up on.
    new MutationObserver(() => {
      if (!win.classList.contains("is-active")) return;
      renderRecent();
      renderWork();
    })
      .observe(win, { attributes: true, attributeFilter: ["class"] });
    return true;
  }

  build();
  root.AISystem6ClioTalkShell = Object.freeze({
    refresh: () => { renderRecent(); syncModel(); syncEmpty(); },
    canSearch,
    search: () => { if (canSearch()) toggleSearch(true); },
    canTogglePanel,
    togglePanel: () => { if (canTogglePanel()) togglePanel(); },
    tasks: Object.freeze({
      apply: applyTask,
      connect: (transport) => { taskTransport = transport && typeof transport === "object" ? transport : null; },
      current: () => taskSnapshot,
      notice: noticeTask,
    }),
    // A ClioWrite document ClioTalk revised: deliver() puts its file card in
    // the conversation, show() opens it in the panel. The task layer (M3)
    // calls them; until then a dev or test page hands them fixture data.
    // ClioWork, the document studio page: show() brings it up, page() says
    // which page the main column shows ("chat" or "work").
    work: Object.freeze({
      show: () => setPage("work"),
      page: () => shell?.dataset.page || "",
    }),
    documents: Object.freeze({
      deliver: deliverDocument,
      show: (source, options) => showDocument(source, options),
      current: () => (panelOpen() && panelMode === "document" ? panelDoc?.docId || null : null),
    }),
    // The shell's parts for another window built on it (ClioCode, code.js):
    // the skin an appearance wears, the sidebar's icons, and the task
    // cards. A card takes a record { proposal, live } plus the hooks named
    // above planCard; call record.sync() after changing either.
    parts: Object.freeze({
      skinFor,
      icon: (name) => icon(ICONS[name] || ""),
      cards: Object.freeze({
        plan: (record) => { planCard(record); record.sync(); return record.el; },
        permission: (record) => { permissionCard(record); record.sync(); return record.el; },
      }),
    }),
  });
})(window);
