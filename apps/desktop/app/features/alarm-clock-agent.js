// Alarm Clock · Agent: what Clio does while nobody is watching (M8 slice 2).
//
// The Alarm Clock window gets a fourth button. It opens a panel on the same
// window: the list of agent schedules (what, when, last result), the
// New Schedule form, 启用/停用, 现在跑. The schedules live on the server
// (schedules.js: unattended runs are read-only, offline unless the writer
// ticks the box, capped, results are candidates only, a missed run is asked
// about once and never replayed). This file is only their face.
//
// Also here, because they need no window: the poll that says "finished" in
// the Notification Center, the page's call after a real manuscript save
// (POST /:id/trigger), and the 无人值守 task cards ClioTalk's strip shows.
//
// Lazy: loaded by ensureAlarmClockAgentModule (alarm-clock.js asks for it
// once the engine host answers). Pure helpers sit on `.model` for the contract.

window.AISystem6AlarmClockAgent = (() => {
  "use strict";

  const ACTIVE = ["starting", "running", "stopping"];
  const SEEN_KEY = "ai-system6-alarm-agent-seen";
  const ASKED_KEY = "ai-system6-alarm-agent-asked";
  const SAVE_DEBOUNCE_MS = 90_000;
  const POLL_MS = 20_000;

  // The time choices are a closed set; each names the trigger it stands for.
  const WHEN = {
    "daily-9": { kind: "time", weekday: null, hour: 9, minute: 0 },
    "daily-21": { kind: "time", weekday: null, hour: 21, minute: 0 },
    "mon-9": { kind: "time", weekday: 1, hour: 9, minute: 0 },
    "fri-17": { kind: "time", weekday: 5, hour: 17, minute: 0 },
    archive: { kind: "archive" },
    folder: { kind: "folder" },
    startup: { kind: "startup" },
  };
  const WHEN_ORDER = Object.keys(WHEN);
  // A standing intent reacts to an event or checks daily; "startup" is not one.
  const STANDING_OK = new Set(["daily-9", "daily-21", "archive", "folder"]);

  const LOCAL_STRINGS = {
    en: {
      alarm_clock_agent: "Agent",
      alarm_agent_title: "Clio while you are away",
      alarm_agent_col_what: "What",
      alarm_agent_col_when: "When",
      alarm_agent_col_last: "Last",
      alarm_agent_empty: "Nothing scheduled. Tell Clio what to do on its own: New Schedule.",
      alarm_agent_unavailable: "The engine host is not running, so schedules are not available here.",
      alarm_agent_new: "New Schedule…",
      alarm_agent_enable: "Turn On",
      alarm_agent_disable: "Turn Off",
      alarm_agent_run_now: "Run Now",
      alarm_agent_remove: "Remove",
      alarm_agent_standing_mark: "Watching",
      alarm_agent_off: "off",
      alarm_agent_never: "—",
      alarm_agent_running: "working…",
      alarm_agent_no_proposals: "nothing to show",
      alarm_agent_proposals: (n) => `${n} proposal${n === 1 ? "" : "s"}`,
      alarm_agent_withdrawn: "withdrawn",
      alarm_agent_skipped: (code) => `skipped: ${code}`,
      alarm_agent_form_what: "What should it do? (your own words; every run follows exactly this)",
      alarm_agent_form_when: "When",
      alarm_agent_form_folder: "Folder (read only)",
      alarm_agent_form_no_folder: "Share a folder in Chooser first.",
      alarm_agent_form_network: "Allow the internet for this schedule",
      alarm_agent_form_standing: "Keep watching this project",
      alarm_agent_form_standing_hint: (name) => `Only “${name}”. Proposals nobody opens are withdrawn after 72 hours.`,
      alarm_agent_form_rules: "Unattended and read only. No internet unless you tick the box. Every run starts fresh, without your earlier conversation. At most 60,000 tokens and 20 minutes a run, 2 runs a day. Results are only proposals; they wait until you open them.",
      alarm_agent_form_create: "Create",
      alarm_agent_form_cancel: "Cancel",
      alarm_agent_when_daily_9: "Every day 9:00",
      alarm_agent_when_daily_21: "Every day 21:00",
      alarm_agent_when_mon_9: "Every Monday 9:00",
      alarm_agent_when_fri_17: "Every Friday 17:00",
      alarm_agent_when_archive: "After the manuscript is saved",
      alarm_agent_when_folder: "When the folder gets a new file",
      alarm_agent_when_startup: "Once after startup",
      alarm_agent_weekday: (d) => ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d],
      alarm_agent_every_day: (time) => `Every day ${time}`,
      alarm_agent_every_weekday: (day, time) => `Every ${day} ${time}`,
      alarm_agent_missed: (day, title) => `${day}’s “${title}” did not run. Run it now?`,
      alarm_agent_missed_run: "Run Now",
      alarm_agent_missed_skip: "Skip",
      alarm_agent_done: (title, n) => (n > 0
        ? `Alarm Clock: “${title}” finished; ${n} proposal${n === 1 ? " is" : "s are"} waiting for you in ClioTalk.`
        : `Alarm Clock: “${title}” finished; it had nothing to propose.`),
      alarm_agent_missed_note: (title) => `Alarm Clock: “${title}” did not run last time. Run it now?`,
      alarm_agent_failed: (title) => `Alarm Clock: “${title}” stopped before it finished.`,
      alarm_agent_created: "Schedule created.",
      alarm_agent_card_label: "Unattended",
      alarm_agent_card_words: "Your words",
      alarm_agent_card_stop: "Stop",
      alarm_agent_card_review: "Review proposals",
      alarm_agent_card_working: "Working…",
      alarm_agent_card_stopped: "Stopped before it finished.",
      alarm_agent_card_error: "Ended with an error.",
      alarm_agent_card_done: (n) => (n > 0 ? `Finished: ${n} proposal${n === 1 ? "" : "s"} waiting.` : "Finished: nothing to propose."),
    },
    zh: {
      alarm_clock_agent: "代理",
      alarm_agent_title: "你不在时 Clio 做的事",
      alarm_agent_col_what: "事情",
      alarm_agent_col_when: "什么时候",
      alarm_agent_col_last: "上次",
      alarm_agent_empty: "还没有排程。告诉 Clio 它可以自己做什么：新排程。",
      alarm_agent_unavailable: "引擎主机没有运行，这里不能用排程。",
      alarm_agent_new: "新排程…",
      alarm_agent_enable: "启用",
      alarm_agent_disable: "停用",
      alarm_agent_run_now: "现在跑",
      alarm_agent_remove: "移除",
      alarm_agent_standing_mark: "盯着",
      alarm_agent_off: "已停用",
      alarm_agent_never: "—",
      alarm_agent_running: "正在做…",
      alarm_agent_no_proposals: "没有候选",
      alarm_agent_proposals: (n) => `${n} 条候选`,
      alarm_agent_withdrawn: "已收回",
      alarm_agent_skipped: (code) => `已跳过：${code}`,
      alarm_agent_form_what: "要它做什么？（你自己的话，每次都照这句跑）",
      alarm_agent_form_when: "什么时候",
      alarm_agent_form_folder: "文件夹（只读）",
      alarm_agent_form_no_folder: "请先在 Chooser 里共享一个文件夹。",
      alarm_agent_form_network: "这个排程可以上网",
      alarm_agent_form_standing: "帮我盯着这个项目",
      alarm_agent_form_standing_hint: (name) => `只管「${name}」。没人打开的候选 72 小时后自动收回。`,
      alarm_agent_form_rules: "无人值守，只读。不上网，除非你打勾。每次从头开始，不带你之前的对话。每次最多 6 万 token、20 分钟，每天最多 2 次。结果只是候选，等你打开才送达。",
      alarm_agent_form_create: "创建",
      alarm_agent_form_cancel: "取消",
      alarm_agent_when_daily_9: "每天 9:00",
      alarm_agent_when_daily_21: "每天 21:00",
      alarm_agent_when_mon_9: "每周一 9:00",
      alarm_agent_when_fri_17: "每周五 17:00",
      alarm_agent_when_archive: "手稿存档后",
      alarm_agent_when_folder: "文件夹有新文件",
      alarm_agent_when_startup: "开机后跑一次",
      alarm_agent_weekday: (d) => ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][d],
      alarm_agent_every_day: (time) => `每天 ${time}`,
      alarm_agent_every_weekday: (day, time) => `每${day} ${time}`,
      alarm_agent_missed: (day, title) => `${day}的「${title}」没跑，现在跑吗？`,
      alarm_agent_missed_run: "现在跑",
      alarm_agent_missed_skip: "跳过",
      alarm_agent_done: (title, n) => (n > 0
        ? `闹钟：「${title}」做完了，有 ${n} 条候选在 ClioTalk 等你看。`
        : `闹钟：「${title}」做完了，这次没有候选。`),
      alarm_agent_missed_note: (title) => `闹钟：「${title}」上次没跑，现在跑吗？`,
      alarm_agent_failed: (title) => `闹钟：「${title}」没做完就停了。`,
      alarm_agent_created: "排程已创建。",
      alarm_agent_card_label: "无人值守",
      alarm_agent_card_words: "你的原话",
      alarm_agent_card_stop: "停止",
      alarm_agent_card_review: "查看候选",
      alarm_agent_card_working: "正在做…",
      alarm_agent_card_stopped: "没做完就停了。",
      alarm_agent_card_error: "出错结束。",
      alarm_agent_card_done: (n) => (n > 0 ? `做完了：有 ${n} 条候选等你看。` : "做完了：没有候选。"),
    },
  };
  Object.assign((window.AISystem6TranslationsEn ||= {}), LOCAL_STRINGS.en);
  Object.assign((window.AISystem6TranslationsZh ||= {}), LOCAL_STRINGS.zh);

  // ---- Pure helpers -----------------------------------------------------------

  const pad = (n) => String(n).padStart(2, "0");

  /** The trigger the writer's time choice stands for (a copy). */
  function triggerFor(choice) {
    return { ...(WHEN[choice] || WHEN["daily-9"]) };
  }

  /** The body for POST /api/agent/schedules. Level and caps are the server's. */
  function scheduleBody(form) {
    const trigger = triggerFor(form.when);
    const standing = form.standing === true && STANDING_OK.has(form.when);
    return {
      prompt: String(form.prompt || ""),
      trigger,
      folderIds: [String(form.folderId || "")],
      network: form.network === true,
      standing,
      projectId: standing || trigger.kind === "archive" ? String(form.projectId || "") : "",
    };
  }

  /** "Every Monday 9:00", "After the manuscript is saved", … */
  function whenLabel(trigger) {
    if (trigger.kind === "archive") return t("alarm_agent_when_archive");
    if (trigger.kind === "folder") return t("alarm_agent_when_folder");
    if (trigger.kind === "startup") return t("alarm_agent_when_startup");
    const time = `${trigger.hour}:${pad(trigger.minute)}`;
    return trigger.weekday === null
      ? t("alarm_agent_every_day", time)
      : t("alarm_agent_every_weekday", t("alarm_agent_weekday", trigger.weekday), time);
  }

  function readSet(key) {
    try { return new Set(JSON.parse(localStorage.getItem(key) || "[]")); } catch { return new Set(); }
  }
  function writeSet(key, set) {
    try { localStorage.setItem(key, JSON.stringify([...set].slice(-200))); } catch {}
  }

  /**
   * The schedules whose missed fire point has not been answered. Each missed
   * point is asked about once: answering, either way, writes it down.
   */
  function missedQuestions(schedules, asked = readSet(ASKED_KEY)) {
    return schedules
      .filter((schedule) => schedule.enabled && schedule.missedAt && !asked.has(`${schedule.id}@${schedule.missedAt}`))
      .map((schedule) => ({
        schedule,
        key: `${schedule.id}@${schedule.missedAt}`,
        text: t("alarm_agent_missed", t("alarm_agent_weekday", new Date(schedule.missedAt).getDay()), schedule.title),
      }));
  }

  /** Runs that ended and have not been announced yet, with the notice text. */
  function finishedNotices(runs, schedules, seen) {
    const byId = new Map(schedules.map((schedule) => [schedule.id, schedule]));
    return runs
      .filter((run) => run.unattended && !ACTIVE.includes(run.state) && !seen.has(run.runId))
      .map((run) => {
        const title = byId.get(run.scheduleId)?.title || String(run.prompt || "").split("\n")[0].slice(0, 60);
        const n = Number(run.pendingProposals) || 0;
        return { runId: run.runId, text: run.state === "error" ? t("alarm_agent_failed", title) : t("alarm_agent_done", title, n) };
      });
  }

  /** What the "last" column says about a schedule. */
  function lastLabel(schedule, run) {
    if (!run) return schedule.lastSkipCode ? t("alarm_agent_skipped", schedule.lastSkipCode) : t("alarm_agent_never");
    if (ACTIVE.includes(run.state)) return t("alarm_agent_running");
    if (run.pendingProposals > 0) return t("alarm_agent_proposals", run.pendingProposals);
    return run.withdrawnProposals > 0 ? t("alarm_agent_withdrawn") : t("alarm_agent_no_proposals");
  }

  // ---- Server ------------------------------------------------------------------

  function adoptFragmentToken() {
    let token = "";
    try {
      const found = /(?:^|[#&])ais6-agent-token=([a-f0-9]{64})(?:&|$)/.exec(String(location.hash || ""));
      if (found) {
        token = found[1];
        history.replaceState(null, "", location.pathname + location.search);
        sessionStorage.setItem("ai-system6-agent-token", token);
      } else {
        token = String(sessionStorage.getItem("ai-system6-agent-token") || "");
      }
    } catch {}
    if (/^[a-f0-9]{64}$/.test(token)) window.AISystem6AgentToken = token;
  }

  async function api(path, body, method = body === undefined ? "GET" : "POST") {
    const headers = body === undefined ? {} : { "Content-Type": "application/json" };
    if (!window.AISystem6AgentToken) adoptFragmentToken();
    if (window.AISystem6AgentToken) headers["X-AI-System6-Agent-Token"] = window.AISystem6AgentToken;
    if (typeof currentLanguage === "string" && currentLanguage) headers["X-AI-System6-Language"] = currentLanguage;
    const response = await window.AISystem6Capabilities.requestService("agent.harness", {
      path,
      init: { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(payload.error || `HTTP ${response.status}`), { code: payload.code || "" });
    return payload;
  }

  // ---- State and refresh --------------------------------------------------------

  const state = { schedules: [], runs: [], folders: [], selected: "", view: "list", reachable: true, cards: new Set(), timer: null, saveTimer: null, form: null };

  async function refresh() {
    try {
      const [s, r] = await Promise.all([api("/api/agent/schedules"), api("/api/agent/runs")]);
      state.schedules = s.schedules || [];
      state.runs = r.runs || [];
      state.reachable = true;
    } catch {
      state.reachable = false;
    }
    return state.reachable;
  }

  const runOf = (schedule) => state.runs.find((run) => run.runId === schedule.lastRunId);

  function notifyFinished() {
    const first = !localStorage.getItem(SEEN_KEY);
    const seen = readSet(SEEN_KEY);
    const fresh = finishedNotices(state.runs, state.schedules, seen);
    // The first look ever only learns what already exists.
    if (!first) {
      for (const notice of fresh) {
        if (typeof pushSystemNotification === "function") {
          pushSystemNotification(notice.text, { windowName: "assistant", actionLabelKey: "open" });
        }
      }
    }
    for (const notice of fresh) seen.add(notice.runId);
    if (first || fresh.length) writeSet(SEEN_KEY, seen);
    // A missed fire point is mentioned once in the Notification Center too.
    const asked = readSet(ASKED_KEY);
    for (const question of missedQuestions(state.schedules, asked)) {
      const noted = `note:${question.key}`;
      if (asked.has(noted)) continue;
      asked.add(noted);
      if (typeof pushSystemNotification === "function") {
        pushSystemNotification(t("alarm_agent_missed_note", question.schedule.title), { windowName: "alarmClock", actionLabelKey: "open" });
      }
    }
    writeSet(ASKED_KEY, asked);
  }

  async function poll() {
    if (!(await refresh())) return stop();
    notifyFinished();
    renderPanel();
    renderCards();
    const busy = state.runs.some((run) => run.unattended && ACTIVE.includes(run.state));
    clearTimeout(state.timer);
    state.timer = setTimeout(poll, busy ? POLL_MS : POLL_MS * 3);
  }

  function start() {
    if (state.timer) return;
    state.timer = setTimeout(poll, 0);
  }

  function stop() {
    clearTimeout(state.timer);
    state.timer = null;
  }

  // ---- The page's call after a real manuscript save --------------------------------

  /**
   * The writer saved the manuscript of `projectId`. Every enabled archive
   * schedule for that project is triggered, a minute and a half after the
   * last save so a burst of saves is one run. The server's caps decide the rest.
   */
  function manuscriptSaved(projectId) {
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(async () => {
      try {
        const { schedules = [] } = await api("/api/agent/schedules");
        for (const schedule of schedules) {
          if (schedule.enabled && schedule.trigger.kind === "archive" && schedule.projectId === projectId) {
            await api(`/api/agent/schedules/${encodeURIComponent(schedule.id)}/trigger`, { projectId }).catch(() => {});
          }
        }
        start();
      } catch {}
    }, state.debounceMs ?? SAVE_DEBOUNCE_MS);
  }

  // ---- The panel in the Alarm Clock window ---------------------------------------------

  function el(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function panelHost() {
    return document.querySelector("#alarm-clock-agent");
  }

  function currentProject() {
    const project = typeof getActiveProject === "function" ? getActiveProject() : null;
    return { id: project?.id || (typeof activeProjectId === "string" ? activeProjectId : ""), name: project?.name || project?.title || "" };
  }

  function renderPanel() {
    const host = panelHost();
    if (!host || host.hidden) return;
    host.replaceChildren(state.view === "form" ? formView() : listView());
  }

  function listView() {
    const root = el("div", "alarm-agent");
    if (!state.reachable) {
      root.append(el("p", "alarm-agent-note", t("alarm_agent_unavailable")));
      return root;
    }
    for (const question of missedQuestions(state.schedules)) {
      const box = el("div", "alarm-agent-missed");
      box.append(el("span", "", question.text));
      const run = el("button", "btn mini-btn", t("alarm_agent_missed_run"));
      const skip = el("button", "btn mini-btn", t("alarm_agent_missed_skip"));
      run.type = skip.type = "button";
      run.addEventListener("click", () => answerMissed(question, true));
      skip.addEventListener("click", () => answerMissed(question, false));
      box.append(run, skip);
      root.append(box);
    }
    if (!state.schedules.length) {
      root.append(el("p", "alarm-agent-note", t("alarm_agent_empty")));
    } else {
      const table = el("table", "alarm-agent-table");
      const head = el("tr");
      for (const key of ["alarm_agent_col_what", "alarm_agent_col_when", "alarm_agent_col_last"]) head.append(el("th", "", t(key)));
      table.append(head);
      for (const schedule of state.schedules) {
        const row = el("tr", `alarm-agent-row${schedule.id === state.selected ? " is-selected" : ""}${schedule.enabled ? "" : " is-off"}`);
        row.dataset.scheduleId = schedule.id;
        const what = el("td", "alarm-agent-what");
        if (schedule.standing) what.append(el("span", "alarm-agent-mark", t("alarm_agent_standing_mark")));
        what.append(document.createTextNode(schedule.title));
        what.title = schedule.prompt;
        row.append(what, el("td", "", schedule.enabled ? whenLabel(schedule.trigger) : t("alarm_agent_off")), el("td", "", lastLabel(schedule, runOf(schedule))));
        row.addEventListener("click", () => { state.selected = schedule.id; renderPanel(); });
        table.append(row);
      }
      const list = el("div", "alarm-agent-list");
      list.append(table);
      root.append(list);
    }
    const buttons = el("div", "alarm-agent-buttons");
    const add = (label, handler, disabled = false) => {
      const button = el("button", "btn mini-btn", label);
      button.type = "button";
      button.disabled = disabled;
      button.addEventListener("click", handler);
      buttons.append(button);
      return button;
    };
    const chosen = state.schedules.find((schedule) => schedule.id === state.selected);
    add(t("alarm_agent_new"), openForm);
    add(chosen && !chosen.enabled ? t("alarm_agent_enable") : t("alarm_agent_disable"), () => setEnabled(chosen), !chosen);
    add(t("alarm_agent_run_now"), () => runNow(chosen), !chosen || !chosen.enabled);
    add(t("alarm_agent_remove"), () => remove(chosen), !chosen);
    root.append(buttons);
    return root;
  }

  async function openForm() {
    try { state.folders = ((await api("/api/agent/folders")).folders || []).filter((folder) => folder.available); } catch { state.folders = []; }
    state.view = "form";
    state.form = { prompt: "", when: "daily-9", folderId: state.folders[0]?.id || "", network: false, standing: false };
    renderPanel();
  }

  function formView() {
    const form = state.form;
    const project = currentProject();
    const root = el("form", "alarm-agent alarm-agent-form");
    root.addEventListener("submit", (event) => event.preventDefault());
    const label = (text) => { const l = el("label", "alarm-agent-field"); l.append(el("span", "", text)); return l; };
    const words = label(t("alarm_agent_form_what"));
    const area = el("textarea", "alarm-agent-words");
    area.rows = 3;
    area.value = form.prompt;
    area.addEventListener("input", () => { form.prompt = area.value; create.disabled = !canCreate(); });
    words.append(area);
    const select = (name, entries, value, onChange) => {
      const wrap = el("div", "select-wrap");
      const node = el("select");
      node.setAttribute("aria-label", name);
      for (const [v, text] of entries) {
        const option = el("option", "", text);
        option.value = v;
        option.selected = v === value;
        node.append(option);
      }
      node.addEventListener("change", () => onChange(node.value));
      wrap.append(node);
      return wrap;
    };
    const when = label(t("alarm_agent_form_when"));
    when.append(select(t("alarm_agent_form_when"), WHEN_ORDER.map((key) => [key, t(`alarm_agent_when_${key.replace("-", "_")}`)]), form.when, (v) => { form.when = v; renderPanel(); }));
    const folder = label(t("alarm_agent_form_folder"));
    if (state.folders.length) folder.append(select(t("alarm_agent_form_folder"), state.folders.map((f) => [f.id, f.name]), form.folderId, (v) => { form.folderId = v; }));
    else folder.append(el("span", "alarm-agent-note", t("alarm_agent_form_no_folder")));
    const check = (text, key, disabled = false) => {
      const l = el("label", "alarm-agent-check");
      const box = el("input");
      box.type = "checkbox";
      box.checked = form[key] === true;
      box.disabled = disabled;
      box.addEventListener("change", () => { form[key] = box.checked; });
      l.append(box, el("span", "", text));
      return l;
    };
    root.append(words, when, folder);
    const needsProject = form.when === "archive";
    const canStand = STANDING_OK.has(form.when) && Boolean(project.id);
    root.append(check(t("alarm_agent_form_network"), "network"));
    if (canStand) {
      root.append(check(t("alarm_agent_form_standing"), "standing"));
      root.append(el("p", "alarm-agent-hint", t("alarm_agent_form_standing_hint", project.name || project.id)));
    }
    root.append(el("p", "alarm-agent-rules", t("alarm_agent_form_rules")));
    const canCreate = () => form.prompt.trim() && form.folderId && (!needsProject || project.id);
    const buttons = el("div", "alarm-agent-buttons");
    const cancel = el("button", "btn mini-btn", t("alarm_agent_form_cancel"));
    const create = el("button", "btn mini-btn default", t("alarm_agent_form_create"));
    cancel.type = create.type = "button";
    create.disabled = !canCreate();
    cancel.addEventListener("click", () => { state.view = "list"; renderPanel(); });
    create.addEventListener("click", submitForm);
    buttons.append(cancel, create);
    root.append(buttons);
    return root;
  }

  /** POST the form as a schedule; the server owns level, caps and the folder grant. */
  async function createSchedule(form) {
    const { schedule } = await api("/api/agent/schedules", scheduleBody(form));
    state.selected = schedule.id;
    state.view = "list";
    return schedule;
  }

  async function submitForm() {
    try {
      await createSchedule({ ...state.form, projectId: currentProject().id });
      if (typeof setStatus === "function") setStatus(t("alarm_agent_created"));
    } catch (error) {
      if (typeof setStatus === "function") setStatus(String(error.message || error.code));
      return;
    }
    await refresh();
    renderPanel();
  }

  async function setEnabled(schedule) {
    if (!schedule) return;
    await api(`/api/agent/schedules/${encodeURIComponent(schedule.id)}`, { enabled: !schedule.enabled }).catch((error) => { if (typeof setStatus === "function") setStatus(String(error.message)); });
    await refresh();
    renderPanel();
  }

  async function runNow(schedule) {
    if (!schedule) return;
    await api(`/api/agent/schedules/${encodeURIComponent(schedule.id)}/run`, {}).catch((error) => { if (typeof setStatus === "function") setStatus(String(error.message)); });
    start();
    await refresh();
    renderPanel();
  }

  async function remove(schedule) {
    if (!schedule) return;
    await api(`/api/agent/schedules/${encodeURIComponent(schedule.id)}`, undefined, "DELETE").catch(() => {});
    state.selected = "";
    await refresh();
    renderPanel();
  }

  async function answerMissed(question, run) {
    const asked = readSet(ASKED_KEY);
    asked.add(question.key);
    writeSet(ASKED_KEY, asked);
    if (run) await runNow(question.schedule);
    await refresh();
    renderPanel();
    renderCards();
  }

  /** Called by alarm-clock.js when the Agent button is pressed or released. */
  async function show(visible) {
    const host = panelHost();
    if (!host) return;
    host.hidden = !visible;
    if (!visible) return;
    state.view = "list";
    await refresh();
    renderPanel();
    start();
  }

  // ---- ClioTalk: 无人值守 task cards ------------------------------------------------------

  /** ClioTalk's strip hands its container here; the cards redraw on every poll. */
  function fillCards(container) {
    state.cards.add(container);
    renderCards();
    start();
  }

  function cardFor(run, schedule) {
    const card = el("div", "alarm-agent-card");
    const head = el("div", "alarm-agent-card-head");
    head.append(el("b", "alarm-agent-card-label", t("alarm_agent_card_label")), el("span", "", new Date(run.createdAt).toLocaleString()));
    if (schedule?.standing) head.append(el("span", "alarm-agent-mark", t("alarm_agent_standing_mark")));
    const words = el("p", "alarm-agent-card-words");
    words.append(el("b", "", `${t("alarm_agent_card_words")}: `), document.createTextNode(String(run.prompt || "")));
    const n = Number(run.pendingProposals) || 0;
    const active = ACTIVE.includes(run.state);
    const result = el("p", "alarm-agent-card-result", active ? t("alarm_agent_card_working")
      : run.state === "error" ? t("alarm_agent_card_error")
      : run.state === "stopped" && !n ? t("alarm_agent_card_stopped") : t("alarm_agent_card_done", n));
    card.append(head, words, result);
    const buttons = el("div", "alarm-agent-buttons");
    if (active) {
      const stopButton = el("button", "btn mini-btn", t("alarm_agent_card_stop"));
      stopButton.type = "button";
      stopButton.addEventListener("click", async () => {
        await api(`/api/agent/runs/${encodeURIComponent(run.runId)}/stop`, {}).catch(() => {});
        await refresh();
        renderCards();
      });
      buttons.append(stopButton);
    } else if (n > 0) {
      const review = el("button", "btn mini-btn", t("alarm_agent_card_review"));
      review.type = "button";
      review.addEventListener("click", () => window.AISystem6ClioTalkAgent?.openPutBack?.(run.runId));
      buttons.append(review);
    }
    if (buttons.children.length) card.append(buttons);
    return card;
  }

  function renderCards() {
    for (const container of [...state.cards]) {
      if (!container.isConnected) { state.cards.delete(container); continue; }
      container.replaceChildren();
      const byId = new Map(state.schedules.map((schedule) => [schedule.id, schedule]));
      for (const question of missedQuestions(state.schedules)) {
        const box = el("div", "alarm-agent-card alarm-agent-missed");
        box.append(el("b", "alarm-agent-card-label", t("alarm_agent_card_label")), el("p", "", question.text));
        const run = el("button", "btn mini-btn", t("alarm_agent_missed_run"));
        const skip = el("button", "btn mini-btn", t("alarm_agent_missed_skip"));
        run.type = skip.type = "button";
        run.addEventListener("click", () => answerMissed(question, true));
        skip.addEventListener("click", () => answerMissed(question, false));
        box.append(run, skip);
        container.append(box);
      }
      for (const run of state.runs.filter((entry) => entry.unattended).slice(0, 5)) container.append(cardFor(run, byId.get(run.scheduleId)));
    }
  }

  // The button was built before these strings existed; it names itself now.
  document.querySelectorAll('[data-alarm-clock-mode="agent"] .visually-hidden').forEach((label) => { label.textContent = t("alarm_clock_agent"); });

  return {
    show,
    start,
    stop,
    refresh,
    manuscriptSaved,
    fillCards,
    createSchedule,
    answerMissed,
    state,
    model: { triggerFor, scheduleBody, whenLabel, missedQuestions, finishedNotices, lastLabel, WHEN_ORDER, STANDING_OK },
  };
})();
