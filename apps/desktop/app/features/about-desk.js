// Feature module: about-desk — "About AI System 6" as an ordinary window.
//
// Lazy on purpose: About used to be a system modal whose markup rode every
// boot. It is now a window like the others, built here the first time it is
// asked for, with two faces:
//
// - "First time here": the front door of a first launch. Three equal doors,
//   not steps — pick a Mac, write one line, watch the film. Any door finishes
//   the introduction and clears "Show this window at startup".
// - The book: five chapters on the Control Panel's own tablist. The first is
//   an instrument (where your words live, what AI did in this project, what
//   you adopted, which model is current); the other four are generated from
//   the official site (app/content/about-chapters.js, written by
//   site/build-about-chapters.mjs and checked by tooling/verify-site.mjs).
//
// Nothing here writes on its own: the instrument reads run receipts and the
// settings record; a door writes only what the writer did (an appearance, a
// Note Pad slip). The film and the star count are the only network requests,
// and both happen only while this window is open: the film after play is
// pressed, the count when the window opens. Neither is retried or stored.
//
// Contract: tests/features/about-desk.test.mjs

(function installAboutDesk() {
  if (window.AISystem6AboutLoaded) return;

  const filmId = "BV1gYph6hEE6";
  const filmEmbed = `https://player.bilibili.com/player.html?bvid=${filmId}&autoplay=1&high_quality=1&danmaku=0`;
  const filmPage = `https://www.bilibili.com/video/${filmId}/`;
  const authorSpace = "https://space.bilibili.com/544081956";
  const repository = "https://github.com/surfine/AI-System-6";
  const releasesPage = `${repository}/releases`;
  const projectSite = "https://aisystem6.aaronlau.me";
  const starApi = "https://api.github.com/repos/surfine/AI-System-6";
  const chapterIds = ["overview", "desk", "eras", "afterHours", "model"];
  const chapterKeys = {
    overview: "about_chapter_overview",
    desk: "about_chapter_desk",
    eras: "about_chapter_eras",
    afterHours: "about_chapter_after_hours",
    model: "about_chapter_model",
  };

  let face = "overview";
  let filmOpen = false;
  let starCount = null;
  let starRequest = null;
  let appearanceBefore = "";
  let shownAtStartup = false;
  let doorResult = null;
  let keptLine = "";

  function el(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function button(labelKey, { className = "btn", action = "", onClick = null, label = "" } = {}) {
    const node = el("button", className, label || (labelKey ? t(labelKey) : ""));
    node.type = "button";
    if (action) node.dataset.action = action;
    if (onClick) node.addEventListener("click", onClick);
    return node;
  }

  // Everything that leaves the desk goes through here, and says so: the
  // writer's own browser is where a Star or a follow belongs, signed in as
  // themselves, not a frame inside this window.
  function openOutside(url) {
    window.open(url, "_blank", "noopener");
  }

  function aboutWindow() {
    return document.querySelector('[data-window="about"]');
  }

  function installAboutWindow() {
    if (aboutWindow()) return;
    window.AISystem6ApplicationShell.createWindow({
      windowName: "about",
      windowClass: "about-window",
      labelledBy: "about-title",
      titleKey: "about_menu",
      title: "About AI System 6",
      shade: true,
      paneClass: "about-pane",
      paneHtml: `
        <section class="about-first" data-about-face="first" hidden></section>
        <section class="about-book" data-about-face="book">
          <div class="system-tabs control-chooser about-chapters" role="tablist" aria-label="About" data-i18n-aria-label="about_chapters"></div>
          <div class="about-chapter" id="about-chapter" role="tabpanel"></div>
        </section>`,
    });
    const win = aboutWindow();
    const tabs = win.querySelector(".about-chapters");
    chapterIds.forEach((id) => {
      const tab = el("button", "system-tab");
      tab.type = "button";
      tab.setAttribute("role", "tab");
      tab.id = `about-tab-${id}`;
      tab.dataset.aboutChapter = id;
      tab.setAttribute("aria-controls", "about-chapter");
      const label = el("span", "control-chooser-label");
      label.dataset.i18n = chapterKeys[id];
      label.textContent = t(chapterKeys[id]);
      tab.append(label);
      tab.addEventListener("click", () => showChapter(id));
      tabs.append(tab);
    });
    tabs.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      const step = ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1;
      const index = (chapterIds.indexOf(face) + step + chapterIds.length) % chapterIds.length;
      showChapter(chapterIds[index]);
      win.querySelector(`#about-tab-${chapterIds[index]}`)?.focus();
    });
  }

  // ---- The film ------------------------------------------------------------
  //
  // The player is mounted only after play is pressed, and torn down whenever
  // the card is folded, the chapter changes or the window closes, so a closed
  // About never keeps sound playing or a third-party frame alive.

  function filmCard({ credits = true } = {}) {
    const card = el("div", "about-film");
    card.dataset.aboutFilm = "";
    if (filmOpen) {
      card.classList.add("is-playing");
      const frame = el("iframe", "about-film-frame");
      frame.src = filmEmbed;
      frame.title = t("about_film_frame_title");
      frame.setAttribute("allow", "autoplay; fullscreen");
      frame.setAttribute("allowfullscreen", "");
      frame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
      frame.setAttribute("playsinline", "");
      frame.setAttribute("scrolling", "no");
      card.append(frame);
      const row = el("div", "button-row about-film-row");
      row.append(button("about_film_fold", { className: "btn mini-btn", onClick: () => foldFilm() }));
      card.append(row);
    } else {
      const poster = button("", { className: "about-film-poster", onClick: () => playFilm() });
      poster.setAttribute("aria-label", t("about_film_play"));
      poster.append(el("span", "about-film-play", "▶"));
      const caption = el("span", "about-film-caption");
      caption.append(el("strong", "", t("about_film_play")), el("span", "", t("about_film_meta")));
      poster.append(caption);
      card.append(poster);
    }
    if (credits) card.append(creditsRow({ expanded: filmOpen }));
    return card;
  }

  function playFilm() {
    filmOpen = true;
    aboutWindow()?.classList.add("is-film-open");
    if (face === "first") finishDoor("film");
    render();
  }

  function foldFilm() {
    if (!filmOpen) return;
    filmOpen = false;
    aboutWindow()?.classList.remove("is-film-open");
    render();
  }

  // ---- Credits ---------------------------------------------------------------

  function creditsRow({ expanded = false } = {}) {
    const row = el("div", expanded ? "about-credits is-expanded" : "about-credits");
    if (expanded) row.append(el("p", "about-credits-line", t("about_credits_line")));
    const star = button("", { className: "btn mini-btn about-star", onClick: () => openOutside(repository) });
    star.append(el("span", "about-star-glyph", "★"), document.createTextNode(` ${t("about_credits_star")}`));
    if (Number.isFinite(starCount)) star.append(el("span", "about-star-count", ` · ${starCount.toLocaleString()}`));
    const triple = button("about_credits_triple", { className: "btn mini-btn", onClick: () => openOutside(filmPage) });
    const follow = button("about_credits_follow", { className: "btn mini-btn", onClick: () => openOutside(authorSpace) });
    const buttons = el("div", "button-row about-credits-buttons");
    buttons.append(star, triple, follow);
    row.append(buttons, el("p", "about-fine", t("about_credits_outside")));
    return row;
  }

  // One request per opening, with no retry and no cache: a count that could
  // not be read is simply not shown, and the buttons work either way.
  function fetchStarCount() {
    if (starRequest) return starRequest;
    starRequest = fetch(starApi, { headers: { Accept: "application/vnd.github+json" } })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        const count = Number(payload?.stargazers_count);
        starCount = Number.isFinite(count) ? count : null;
      })
      .catch(() => { starCount = null; })
      .finally(() => { if (aboutWindow() && !aboutWindow().classList.contains("is-hidden")) render(); });
    return starRequest;
  }

  // ---- Places to go --------------------------------------------------------
  //
  // The project site and the release page open in Time Machine when it can run
  // the page (a live engine and a mounted project, since tabs belong to a
  // project); otherwise the writer's browser opens them, and the status line
  // says which happened.

  async function openInTimeMachine(url) {
    const project = typeof getActiveProject === "function" ? getActiveProject() : null;
    let live = false;
    if (project) {
      try {
        await ensureTimeMachineEngineModule();
        const engine = await window.AISystem6TimeMachineEngines?.detect?.();
        live = !!engine && engine.kind !== "snapshot";
      } catch {
        live = false;
      }
    }
    if (!live) {
      openOutside(url);
      setStatus(t(project ? "about_opened_outside_snapshot" : "about_opened_outside_no_project"));
      return "outside";
    }
    await ensureTimeMachineModule();
    openTimeMachineWindow();
    await timeMachineNavigate(url);
    return "time-machine";
  }

  function projectSiteUrl() {
    return currentLanguage === "zh" ? `${projectSite}/zh-CN` : projectSite;
  }

  // ---- The instrument --------------------------------------------------------

  function versionText() {
    const info = { ...(typeof getAppBuildInfo === "function" ? getAppBuildInfo() : {}), ...(typeof appVersionInfo === "object" && appVersionInfo ? appVersionInfo : {}) };
    return {
      version: String(info.version || ""),
      build: String(info.build || ""),
      commit: String(info.sourceCommit || info.commit || "").slice(0, 12),
    };
  }

  function copyVersion() {
    const { version, build, commit } = versionText();
    const line = [`AI System 6 ${version}`, build && `Build ${build}`, commit && `commit ${commit}`, navigator.userAgent]
      .filter(Boolean).join(" · ");
    const done = () => setStatus(t("about_version_copied"));
    if (typeof copyTextToClipboard === "function") {
      Promise.resolve(copyTextToClipboard(line)).then(done).catch(() => setStatus(line));
    } else {
      navigator.clipboard?.writeText?.(line).then(done).catch(() => setStatus(line));
    }
  }

  function receiptCounts() {
    const receipts = window.AISystem6RunReceipts?.queryReceipts?.({ limit: 100000 }) || [];
    const adopted = receipts.filter((file) => window.AISystem6RunReceipts.isAdopted(file.runReceipt || {})).length;
    return { runs: receipts.length, adopted, left: receipts.length - adopted };
  }

  function modelLine() {
    const cloudReady = typeof cloudConfig !== "undefined" && cloudConfig?.active && cloudConfig.provider
      && typeof cloudCredentialReady === "function" && cloudCredentialReady();
    if (cloudReady) return t("about_model_cloud", cloudConfig.model || cloudConfig.provider);
    if (typeof localModelState !== "undefined" && (localModelState.ready || localModelState.loaded)) {
      return t("about_model_local", typeof getLocalModelDisplayName === "function" ? getLocalModelDisplayName() : "LM Studio");
    }
    const context = window.AISystem6ProductContext?.snapshot?.();
    if (context?.provider?.route === "website" && context.quota?.state !== "exhausted") {
      return Number.isFinite(context.quota?.remainingSessionRequests)
        ? t("about_model_shared_left", context.quota.remainingSessionRequests)
        : t("about_model_shared");
    }
    if (context?.quota?.state === "exhausted") return t("about_model_shared_spent");
    return t("about_model_none");
  }

  function meterRow(labelKey, value, onOpen) {
    const row = el("div", "about-meter-row");
    row.append(el("dt", "", t(labelKey)));
    const dd = el("dd");
    if (onOpen) {
      const link = button("", { className: "about-meter-link", label: value, onClick: onOpen });
      dd.append(link);
    } else {
      dd.textContent = value;
    }
    row.append(dd);
    return row;
  }

  function renderOverview(host) {
    const { version, build } = versionText();
    const desktopProfile = typeof workspaceProfile !== "undefined" && workspaceProfile === workspaceProfileDesktop;

    const identity = el("header", "about-identity");
    identity.append(el("span", "about-mark", "6"));
    const words = el("div", "about-identity-words");
    words.append(el("h3", "about-name", "AI System 6"));
    const tagline = el("p", "about-tagline", t(desktopProfile ? "about_finder_body" : "about_body"));
    tagline.dataset.i18n = desktopProfile ? "about_finder_body" : "about_body";
    words.append(tagline);
    const versionRow = el("p", "about-version");
    versionRow.append(el("span", "", [version, build && `Build ${build}`].filter(Boolean).join(" · ")));
    versionRow.append(button("about_copy_version", { className: "btn mini-btn", onClick: copyVersion }));
    words.append(versionRow);
    identity.append(words);
    host.append(identity);

    const meter = el("dl", "about-meter");
    const shell = !!window.tiny?.api;
    meter.append(meterRow("about_meter_words", t(shell ? "about_meter_words_mac" : "about_meter_words_web"), () => handleAction("open-read-me")));
    const files = (typeof chatFiles !== "undefined" ? chatFiles : [])
      .filter((file) => file?.artifactKind !== window.AISystem6RunReceipts?.artifactKind).length;
    const disks = typeof projects !== "undefined" ? projects.length : 0;
    meter.append(meterRow("about_meter_projects", t("about_meter_projects_value", disks, files), () => openWindow("disk")));
    const project = typeof getActiveProject === "function" ? getActiveProject() : null;
    if (project) {
      const { runs, adopted, left } = receiptCounts();
      const openRecords = runs && typeof ensureRunReceiptsFolder === "function" && typeof openProjectFinderFolder === "function"
        ? () => { const folder = ensureRunReceiptsFolder(); if (folder) { openWindow("projects"); openProjectFinderFolder(folder.id); } }
        : null;
      meter.append(meterRow("", t("about_meter_ai_value", runs, adopted, left), openRecords));
      meter.lastChild.firstChild.textContent = t("about_meter_ai", project.name || "");
    } else {
      meter.append(meterRow("about_meter_ai_none", t("about_meter_ai_no_project")));
    }
    meter.append(meterRow("about_meter_model", modelLine()));
    host.append(meter);
    host.append(el("p", "about-fine", t("about_meter_note")));

    host.append(filmCard());

    const places = el("div", "about-places");
    const site = button("about_place_site", { className: "btn", onClick: () => openInTimeMachine(projectSiteUrl()) });
    const notes = button("about_place_notes", { className: "btn", onClick: () => openInTimeMachine(releasesPage) });
    const source = button("about_place_source", { className: "btn", onClick: () => openOutside(repository) });
    places.append(site, notes, source);
    host.append(places);
    host.append(releaseNotesList());
    host.append(el("p", "about-fine", t("about_license_line")));
  }

  // D1: this version's notes, at most eight, generated from the curated
  // release notes (tooling/build-release-notes-content.mjs).
  function releaseNotesList() {
    const notes = window.AISystem6ReleaseNotes;
    const wrap = el("details", "about-notes");
    const items = (notes?.[currentLanguage === "zh" ? "zh" : "en"] || notes?.en || []).slice(0, 8);
    if (!items.length) return el("span");
    wrap.append(el("summary", "", t("about_notes_summary", notes.version || "")));
    const list = el("ul", "about-notes-list");
    items.forEach((line) => list.append(el("li", "", line)));
    wrap.append(list);
    return wrap;
  }

  // ---- Generated chapters ----------------------------------------------------

  function chapterBlocks(id) {
    const content = window.AISystem6AboutChapters?.chapters?.[id];
    return content?.[currentLanguage === "zh" ? "zh" : "en"] || content?.en || [];
  }

  function commandState(action) {
    const registry = typeof getApplicationCommandRegistry === "function" ? getApplicationCommandRegistry() : null;
    const entry = registry?.get?.(action);
    // A lazily admitted application (a game, a lab) registers its command when
    // its module first loads; handleAction loads it, so it is available here.
    const lazy = !entry && !!window.AISystem6Runtime?.getLazyCommand?.(action);
    const available = lazy || (!!entry && entry.isAvailable?.() !== false);
    const reason = available || typeof actionUnavailableReasonKey !== "function" ? "" : actionUnavailableReasonKey(action);
    return { available, reason };
  }

  function openButton(action) {
    const node = button("about_open", { className: "btn mini-btn", action });
    const { available, reason } = commandState(action);
    if (!available) {
      node.disabled = true;
      node.dataset.balloonHelpDisabled = reason || "balloon_disabled_menu_context";
      node.title = t(node.dataset.balloonHelpDisabled);
    }
    return node;
  }

  // Blocks keep the site's order: a run of items shares one list, and a
  // heading or lead between them starts the next.
  function renderBlocks(host, id) {
    let list = null;
    chapterBlocks(id).forEach((block) => {
      if (block.kind === "head") { list = null; host.append(el("h3", "about-chapter-head", block.text)); }
      else if (block.kind === "lead") { list = null; host.append(el("p", "about-chapter-lead", block.text)); }
      else if (block.kind === "item") {
        if (!list) { list = el("div", "about-items"); host.append(list); }
        const item = el("div", "about-item");
        const words = el("div", "about-item-words");
        words.append(el("b", "", block.title));
        if (block.body) words.append(el("p", "", block.body));
        item.append(words);
        if (block.open) item.append(openButton(block.open));
        list.append(item);
      }
    });
  }

  // The route's eight stops under the site's "Eight places you can see": each
  // opens the real window; a stop the current profile does not offer is grey
  // and says why.
  const routeStopActions = [
    ["project_disk", "open-project-disk"],
    ["file_floppy", "open-text-disk"],
    ["question_sheet", "open-question-sheet"],
    ["outline", "open-outline"],
    ["section_drafts", "open-section-drafts"],
    ["teachtext", "open-teachtext"],
    ["review_desk", "open-review-desk"],
    ["project_cd", "open-project-cd"],
  ];

  function routeStops() {
    const item = el("div", "about-item about-route");
    const words = el("div", "about-item-words");
    words.append(el("b", "", t("about_route_title")));
    const row = el("div", "button-row about-route-stops");
    routeStopActions.forEach(([labelKey, action]) => {
      const stop = openButton(action);
      stop.textContent = t(labelKey);
      row.append(stop);
    });
    words.append(row);
    item.append(words);
    return [item];
  }

  // The 30-second tour is optional and needs the desk's own files; a page
  // served from an offline cache cannot fetch them, so it says so instead of
  // doing nothing.
  function tourRow() {
    const item = el("div", "about-item about-tour");
    const words = el("div", "about-item-words");
    words.append(el("b", "", t("about_tour")), el("p", "", t("about_tour_body")));
    item.append(words);
    const play = button("about_open", { className: "btn mini-btn", onClick: () => {
      if (navigator.onLine === false) {
        setStatus(t("about_tour_offline"));
        play.title = t("about_tour_offline");
        return;
      }
      handleAction("play-teaser-demo");
    } });
    item.append(play);
    return item;
  }

  function appearanceGrid({ onPick } = {}) {
    const theme = window.AISystem6Theme;
    const current = theme?.getCurrentTheme?.()?.id || theme?.getCurrentTheme?.() || "";
    const grid = el("div", "about-eras");
    (theme?.getReleaseReadyThemes?.() || []).forEach((entry) => {
      const cell = el("button", entry.id === current ? "about-era is-current" : "about-era");
      cell.type = "button";
      cell.dataset.aboutAppearance = entry.id;
      cell.setAttribute("aria-pressed", entry.id === current ? "true" : "false");
      cell.append(el("span", "about-era-name", t(entry.labelKey) || entry.label), el("span", "about-era-year", String(entry.year || "")));
      cell.addEventListener("click", () => pickAppearance(entry.id, onPick));
      grid.append(cell);
    });
    return grid;
  }

  // The same path as the Control Panel and the Appearance menu: switch and
  // keep. "Switch back" remembers the appearance from before the first pick.
  async function pickAppearance(id, onPick) {
    const theme = window.AISystem6Theme;
    if (!theme?.applyTheme) return;
    const before = theme.getCurrentTheme?.()?.id || theme.getCurrentTheme?.() || "";
    if (!appearanceBefore && before !== id) appearanceBefore = before;
    await theme.applyTheme(id);
    onPick?.(id);
    render();
  }

  function currentAppearanceLabel() {
    const theme = window.AISystem6Theme;
    const current = theme?.getCurrentTheme?.();
    const entry = typeof current === "object" ? current : theme?.getTheme?.(current);
    return entry ? { name: t(entry.labelKey) || entry.label, year: entry.year } : { name: "", year: "" };
  }

  function renderEras(host) {
    renderBlocks(host, "eras");
    host.append(appearanceGrid());
    const now = currentAppearanceLabel();
    const row = el("div", "about-era-now");
    row.append(el("span", "", t("about_eras_now", now.name, now.year)));
    if (appearanceBefore) {
      const back = window.AISystem6Theme?.getTheme?.(appearanceBefore);
      row.append(button("", {
        className: "btn mini-btn",
        label: t("about_eras_back", back ? (t(back.labelKey) || back.label) : appearanceBefore),
        onClick: async () => {
          const target = appearanceBefore;
          appearanceBefore = "";
          await window.AISystem6Theme.applyTheme(target);
          render();
        },
      }));
    }
    host.append(row);
  }

  function renderChapter(id, host) {
    host.replaceChildren();
    if (id === "overview") renderOverview(host);
    else if (id === "eras") renderEras(host);
    else {
      renderBlocks(host, id);
      if (id === "desk") {
        const list = el("div", "about-items");
        list.append(...routeStops(), tourRow());
        host.append(list);
      }
    }
  }

  function showChapter(id) {
    if (!chapterIds.includes(id)) id = "overview";
    if (face !== id && filmOpen) {
      filmOpen = false;
      aboutWindow()?.classList.remove("is-film-open");
    }
    face = id;
    render();
  }

  // ---- First time here ---------------------------------------------------------

  function modelCanAsk() {
    if (typeof clioTalkModelReady === "function" && clioTalkModelReady()) return { ok: true };
    const context = window.AISystem6ProductContext?.snapshot?.();
    if (context?.provider?.route === "website" && context.quota?.state !== "exhausted") return { ok: true };
    if (context?.quota?.state === "exhausted") return { ok: false, reason: "about_door_ask_spent" };
    return { ok: false, reason: "about_door_ask_no_model" };
  }

  function landLineOnNotePad(text) {
    if (typeof syncCurrentNotePadPage === "function") syncCurrentNotePadPage();
    const slip = typeof currentNotePadSlip === "function" ? currentNotePadSlip() : null;
    if (slip && !slip.text.trim()) {
      slip.text = text;
    } else {
      notePadPages.splice(notePadPageIndex + 1, 0, { text, from: null });
      notePadPageIndex += 1;
    }
    if (typeof renderNotePadPage === "function") renderNotePadPage();
    saveDeskState();
  }

  async function lineToQuickDraft() {
    await ensureQuickDraftModule();
    await window.AISystem6QuickDraft.open();
    // The line joins whatever is already on the paper; nothing is replaced.
    const runtime = window.AISystem6QuickDraftRuntime;
    const body = String(runtime?.refs?.draft?.value
      || runtime?.activeProjectQuickDraft?.({ create: false })?.record?.workspace?.body || "");
    if (body.includes(keptLine)) return;
    const next = body.trim() ? `${body}\n\n${keptLine}` : keptLine;
    if (!runtime?.saveQuickDraft?.({ workspace: { body: next } })) return;
    if (runtime.refs?.draft) runtime.refs.draft.value = next;
    window.AISystem6QuickDraft.render?.();
  }

  // Clio only asks: the composer is filled, never sent.
  async function lineToClio() {
    await openWindow("assistant");
    if (!promptInput) return;
    promptInput.value = t("about_door_ask_prompt", keptLine);
    promptInput.dispatchEvent(new Event("input", { bubbles: true }));
    promptInput.focus();
  }

  async function finishDoor(door) {
    doorResult = door;
    if (typeof completeClioOnboarding === "function") await completeClioOnboarding(`about-${door}`);
    if (aboutStartup.show !== false) {
      aboutStartup = { ...aboutStartup, show: false };
      saveDeskState();
    }
  }

  function door(id, titleKey, bodyKey) {
    const node = el("section", "about-door");
    node.dataset.aboutDoor = id;
    node.append(el("h4", "about-door-title", t(titleKey)), el("p", "about-door-body", t(bodyKey)));
    return node;
  }

  function renderDoorResult(host) {
    const card = el("div", "about-door-result");
    card.setAttribute("role", "status");
    if (doorResult === "mac") {
      const now = currentAppearanceLabel();
      card.append(el("p", "about-result-head", t("about_result_mac", now.year, now.name)), el("p", "", t("about_result_mac_body")));
      const row = el("div", "button-row");
      row.append(button("about_result_mac_again", { onClick: () => { doorResult = null; render(); } }),
        button("ok", { className: "btn default", onClick: () => closeWindow("about") }));
      card.append(row);
    } else if (doorResult === "line") {
      card.append(el("p", "about-result-head", t("about_result_line")), el("p", "", t("about_result_line_body")));
      const row = el("div", "button-row about-result-actions");
      row.append(button("about_result_line_open", { onClick: () => openWindow("notePad") }),
        button("about_result_line_draft", { onClick: () => lineToQuickDraft() }));
      const ask = button("about_result_line_ask", { onClick: () => lineToClio() });
      const can = modelCanAsk();
      if (!can.ok) {
        ask.disabled = true;
        ask.dataset.balloonHelpDisabled = can.reason;
        row.append(ask, el("p", "about-fine", t(can.reason)));
      } else {
        row.append(ask);
      }
      card.append(row);
    }
    host.append(card);
  }

  function renderFirst(host) {
    host.replaceChildren();
    const identity = el("header", "about-identity");
    identity.append(el("span", "about-mark", "6"));
    const words = el("div", "about-identity-words");
    words.append(el("h3", "about-name", "AI System 6"), el("p", "about-tagline", t("about_first_tagline")));
    identity.append(words);
    host.append(identity);

    if (doorResult === "mac" || doorResult === "line") {
      renderDoorResult(host);
    } else {
      const doors = el("div", "about-doors");
      const mac = door("mac", "about_door_mac", "about_door_mac_body");
      mac.append(appearanceGrid({ onPick: () => finishDoor("mac") }));
      const line = door("line", "about_door_line", "about_door_line_body");
      const field = el("textarea", "about-line");
      field.rows = 3;
      field.maxLength = 2000;
      field.placeholder = t("about_door_line_placeholder");
      field.setAttribute("aria-label", t("about_door_line"));
      field.dataset.dictation = "off";
      const keep = button("about_door_line_keep", { className: "btn default" });
      keep.disabled = true;
      field.addEventListener("input", () => { keep.disabled = !field.value.trim(); });
      keep.addEventListener("click", async () => {
        const text = field.value.trim();
        if (!text) return;
        keptLine = text;
        landLineOnNotePad(text);
        await finishDoor("line");
        render();
      });
      line.append(field, keep);
      const film = door("film", "about_door_film", "about_door_film_body");
      film.append(filmCard({ credits: false }));
      doors.append(mac, line, film);
      host.append(doors);
      if (filmOpen) host.append(creditsRow({ expanded: true }));
    }

    const footer = el("footer", "about-first-footer");
    const label = el("label", "about-startup");
    const box = el("input");
    box.type = "checkbox";
    box.checked = aboutStartup.show === true || (aboutStartup.show === null && !clioOnboardingCompleted);
    box.addEventListener("change", () => {
      aboutStartup = { ...aboutStartup, show: box.checked };
      saveDeskState();
    });
    label.append(box, document.createTextNode(` ${t("about_show_at_startup")}`));
    footer.append(label, button("about_book", { className: "btn", onClick: () => showChapter("overview") }),
      button("about_look_around", { className: "btn", onClick: () => closeWindow("about") }));
    host.append(footer);
  }

  // ---- Render --------------------------------------------------------------

  function render() {
    const win = aboutWindow();
    if (!win) return;
    const first = win.querySelector('[data-about-face="first"]');
    const book = win.querySelector('[data-about-face="book"]');
    const title = win.querySelector("#about-title");
    const desktopProfile = typeof workspaceProfile !== "undefined" && workspaceProfile === workspaceProfileDesktop;
    const titleKey = face !== "first" && desktopProfile ? "about_finder" : "about_menu";
    if (title) {
      // The menu row's ellipsis promises a window; the window's own title
      // does not repeat it.
      title.removeAttribute("data-i18n");
      title.textContent = String(t(titleKey)).replace(/…$/, "");
    }
    win.classList.toggle("is-first-face", face === "first");
    first.hidden = face !== "first";
    book.hidden = face === "first";
    if (face === "first") {
      renderFirst(first);
      return;
    }
    win.querySelectorAll("[data-about-chapter]").forEach((tab) => {
      const active = tab.dataset.aboutChapter === face;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
      tab.tabIndex = active ? 0 : -1;
    });
    const panel = win.querySelector("#about-chapter");
    panel.setAttribute("aria-labelledby", `about-tab-${face}`);
    renderChapter(face, panel);
  }

  async function open({ face: nextFace = "", play = false, startup = false } = {}) {
    installAboutWindow();
    const requested = nextFace || (face === "first" ? "overview" : face);
    if (requested !== "first" && !chapterIds.includes(requested)) face = "overview";
    else face = requested;
    if (face === "first") doorResult = null;
    if (startup) {
      shownAtStartup = true;
      aboutStartup = { ...aboutStartup, shows: aboutStartup.shows + 1 };
      saveDeskState();
    }
    starRequest = null;
    fetchStarCount();
    render();
    await openWindow("about");
    // The first face is the only thing on a new desk; it stands in the middle.
    if (face === "first" && typeof placeCenteredSystemWindow === "function") placeCenteredSystemWindow(aboutWindow());
    if (play) playFilm();
    return true;
  }

  // closeWindow("about") calls this before the window hides.
  async function closing() {
    if (filmOpen) {
      filmOpen = false;
      aboutWindow()?.classList.remove("is-film-open");
      aboutWindow()?.querySelectorAll(".about-film-frame").forEach((frame) => frame.remove());
    }
    // A second startup showing closed without a door is the last one.
    if (face === "first" && shownAtStartup && !clioOnboardingCompleted && aboutStartup.shows >= 2 && aboutStartup.show === null) {
      await completeClioOnboarding("seen-twice");
    }
    shownAtStartup = false;
  }

  installAboutWindow();

  window.AISystem6About = Object.freeze({
    open,
    render,
    closing,
    playFilm: () => open({ face: "overview", play: true }),
    openProjectSite: () => openInTimeMachine(projectSiteUrl()),
    openReleaseNotes: () => openInTimeMachine(releasesPage),
  });
  window.AISystem6AboutLoaded = true;
})();
