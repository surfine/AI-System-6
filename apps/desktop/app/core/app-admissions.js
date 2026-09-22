// Where a window is admitted, once.
//
// Admitting a window used to mean editing several files that each knew a
// different part of the same fact: the loader in config.js, the opener command
// in actions.js, a window record in window-registry.js, an availability entry
// in window-manager.js, an Applications row and its app_desc_* key in app.js, a
// MultiFinder name, and a repaint hook for the language switch. Four of those
// announced a missing entry only as a test failure, and one window (the
// demonstration disks) shipped while invisible to every instrument that walks
// the registry.
//
// This table is that declaration: one row per window, naming its owning
// application, the loader config.js already builds, and the opener command it
// answers to. config.js keeps the loader spec (it owns createLazyModuleLoader
// and the flag/path rules); this table owns who is admitted and where. The
// remaining surfaces — MultiFinder names, Applications entries, the repaint
// hooks — read from here next; the loader specs can move in afterwards.
//
// Contract: tests/features/app-admissions.test.mjs

window.AISystem6Admissions = (() => {
  // window -> { app, load, command? }. `load` is the ensure() config.js built;
  // a window with no command is opened by a desk accessory row, a menu of its
  // own, or another window's action.
  const WINDOWS = {
    alarmClock: { app: "accessories", load: ensureAlarmClockModule, command: "open-alarm-clock" },
    bonsaiCity: { app: "bonsaiCity", load: ensureBonsaiCityModule, command: "open-bonsai-city" , multiFinder: "Bonsai City" , applicationGroup: "games", appLabel: "bonsai_city_label", appIcon: "bonsaiCity", appDesc: "app_desc_bonsai_city" },
    bureaucracyMeme: { app: "bureaucracyMeme", load: ensureBureaucracyMemeModule, command: "open-bureaucracy-meme" , multiFinder: "Bureaucracy Meme" , applicationGroup: "extras", appLabel: "bureaucracy_meme_label", appIcon: "bureaucracyMeme", appIconClass: "tools-icon", appDesc: "app_desc_bureaucracy" },
    clioChart: { app: "clioChart", load: ensureClioChartModule, command: "open-clio-chart" , multiFinder: "ClioChart" , applicationGroup: "create", appLabel: "clio_chart_label", appIcon: "clioChart", appIconClass: "tools-icon", appDesc: "app_desc_clio_chart" },
    clioPaint: { app: "clioPaint", load: ensureClioPaintModule, command: "open-clio-paint" , multiFinder: "ClioPaint" , applicationGroup: "create", appLabel: "clio_paint_label", appIcon: "clioPaint", appIconClass: "tools-icon" },
    clioProject: { app: "clioProject", load: ensureClioProjectModule, command: "open-clio-project" , multiFinder: "ClioProject" , applicationGroup: "create", appLabel: "clio_project_label", appIcon: "clioProject", appIconClass: "tools-icon" },
    clioStage: { app: "clioStage", load: ensureClioStageModule, command: "open-clio-stage" , multiFinder: "ClioStage" , applicationGroup: "create", appLabel: "clio_stage_label", appIcon: "clioStage", appIconClass: "tools-icon", appDesc: "app_desc_clio_stage" },
    cmfStudio: { app: "cmfStudio", load: ensureCmfStudioModule, command: "open-cmf-studio" , multiFinder: "CMF Studio" , applicationGroup: "create", appLabel: "cmf_studio_label", appIcon: "cmfStudio", appIconClass: "tools-icon", appDesc: "app_desc_cmf_studio" },
    doom: { app: "doom", load: ensureDoomModule, command: "open-doom" , multiFinder: "DOOM" , applicationGroup: "games", appLabel: "doom_label", appIcon: "doom", appDesc: "app_desc_doom" },
    endfieldTerminal: { app: "endfield", load: ensureEndfieldTerminalModule, command: "open-endfield-terminal" , applicationGroup: "extras", appLabel: "endfield_terminal_label", appIcon: "endfieldTerminal", appIconClass: "tools-icon", appDesc: "app_desc_endfield" },
    findFile: { app: "accessories", load: ensureFindPathModule, command: "open-find-path" },
    findPath: { app: "searcher", load: ensureFindPathModule, command: "open-find-path", applicationGroup: "root", appLabel: "searcher_label", appIcon: "searcher", appIconClass: "tools-icon", appDesc: "app_desc_searcher" },
    imagePromptStudio: { app: "imagePromptStudio", load: ensureImagePromptStudioModule, command: "open-image-prompt-studio" , multiFinder: "Image Prompt Studio" , applicationGroup: "create", appLabel: "image_prompt_studio_label", appIcon: "imagePromptStudio", appDesc: "app_desc_image_prompt_studio" },
    lightroom: { app: "lightroom", load: ensureQuickDraftModule, command: "open-quick-draft", applicationGroup: "root", appLabel: "quick_draft_label", appIcon: "quickDraft", appIconClass: "teachtext-icon", appDesc: "app_desc_draft_desk" },
    liquidCover: { app: "liquidCover", load: ensureLiquidCoverModule, command: "open-liquid-cover" , multiFinder: "Cover Glass" , applicationGroup: "create", appLabel: "liquid_cover_label", appIcon: "liquidCover", appIconClass: "tools-icon", appDesc: "app_desc_cover_glass" },
    memoryCards: { app: "accessories", load: ensureMemoryCardsModule, command: "open-memory-cards" },
    micropolis: { app: "micropolis", load: ensureMicropolisModule, command: "open-micropolis" , multiFinder: "Micropolis" , applicationGroup: "games", appLabel: "micropolis_label", appIcon: "micropolis", appDesc: "app_desc_micropolis" },
    oneMoreTune: { app: "oneMoreTune", load: ensureOneMoreTuneModule, command: "open-one-more-tune" , multiFinder: "One More Tune" , applicationGroup: "extras", appLabel: "one_more_tune_label", appIcon: "oneMoreTune", appIconClass: "tools-icon", appDesc: "app_desc_one_more_tune", repaint: "renderOneMoreTune" },
    openttd: { app: "openttd", load: ensureOpenTTDModule, command: "open-openttd" , multiFinder: "OpenTTD" , applicationGroup: "games", appLabel: "openttd_label", appIcon: "openttd", appDesc: "app_desc_openttd" },
    projectDisks: { app: "finder", load: ensureSharedProjectDisksModule, command: "open-demo-disks", repaint: "renderDemoDisksPanel" },
    soundscape: { app: "soundscape", load: ensureSoundscapeModule, command: "open-soundscape" , multiFinder: "Soundscape" , applicationGroup: "create", appLabel: "soundscape_label", appIcon: "soundscape", appIconClass: "tools-icon", appDesc: "app_desc_soundscape" },
    themeLab: { app: "themeLab", load: ensureThemeLabModule, command: "open-theme-lab" , multiFinder: "Theme Lab" },
    timeMachine: { app: "timeMachine", load: ensureTimeMachineModule, command: "open-time-machine" , multiFinder: "Time Machine" , applicationGroup: "extras", appLabel: "time_machine_label", appIcon: "timeMachine", appIconClass: "tools-icon", appDesc: "app_desc_time_machine" },
    todo: { app: "accessories", load: ensureTodoDaModule, command: "open-todo-da" },
    translationPad: { app: "accessories", load: ensureTranslationPadModule, command: "open-translation-pad" },
  };

  function windowRecord(name) {
    return WINDOWS[String(name || "")] || null;
  }

  // An admitted window repaints itself on the language switch through the render
  // function its own module installs. The names live here so the list of who has
  // to repaint is declared beside the window rather than in a chain inside the
  // status module — and a window that forgets it fails a contract instead of
  // leaving the old language on screen.
  function repaintHooks() {
    return Object.values(WINDOWS).map((row) => row.repaint).filter(Boolean);
  }

  // Commands that open something already in the table under another name, or a
  // window whose loader is not an application of its own: one id, one loader,
  // no second registration to forget.
  const ALIASES = {
    "open-find-file": ensureFindPathModule,
    "open-dictionary": ensureDictionaryHelpModule,
    "open-system-help": ensureDictionaryHelpModule,
    "open-sideask-pad": ensureSideAskPadModule,
    "open-docmap": ensureDocMapModule,
  };

  // Every command the table admits: the windows' openers and the aliases that
  // share another window's loader. The availability map fills from this, so a
  // lazy command is answerable the moment its row exists. Built once at load,
  // because the map asks on every menu redraw.
  const COMMANDS = Object.freeze([...new Set([
    ...Object.values(WINDOWS).map((row) => row.command),
    ...Object.keys(ALIASES),
  ].filter(Boolean))]);

  // The MultiFinder list names an admitted application exactly once; the map in
  // multi-finder.js spreads this instead of keeping its own copy of the names.
  function multiFinderLabels() {
    const labels = {};
    Object.values(WINDOWS).forEach((row) => {
      if (row.multiFinder && !labels[row.app]) labels[row.app] = row.multiFinder;
    });
    return labels;
  }

  // The Applications folder lists an admitted window once: the row it draws is
  // built from the same line that opens it, so a window cannot be listed and
  // not openable, or openable and unlisted.
  function applicationItems(group) {
    return Object.values(WINDOWS)
      .filter((row) => row.applicationGroup === group)
      .map((row) => ({
        name: t(row.appLabel),
        iconId: row.appIcon,
        ...(row.appIconClass ? { icon: row.appIconClass } : {}),
        action: row.command,
        type: "application",
        kind: t("application"),
      }));
  }

  // Command -> app_desc_* key, for the Applications folder's description line.
  function appDescriptionKeys() {
    const keys = {};
    Object.values(WINDOWS).forEach((row) => {
      if (row.appDesc && row.command) keys[row.command] = row.appDesc;
    });
    return keys;
  }

  function openerEntries() {
    // Two windows can name the same command (Find File and Find Path are one
    // searcher), and registerLazyCommand throws on a duplicate id — the registry
    // is a registry, not a list. One entry per command, first window wins.
    const byCommand = new Map();
    Object.entries(WINDOWS).forEach(([windowName, row]) => {
      if (row.command && !byCommand.has(row.command)) {
        byCommand.set(row.command, { windowName, command: row.command, load: row.load });
      }
    });
    Object.entries(ALIASES).forEach(([command, load]) => {
      if (!byCommand.has(command)) byCommand.set(command, { windowName: "", command, load });
    });
    return [...byCommand.values()];
  }

  // Every opener is a lazy command: the first click runs the loader and the
  // module then registers the real handler (the pattern registerLazyCommand
  // documents). Called from actions.js, where the runtime exists.
  function registerOpeners() {
    openerEntries().forEach(({ command, load }) => {
      window.AISystem6Runtime?.registerLazyCommand?.(command, { ensure: load });
    });
  }

  return Object.freeze({
    applicationItems,
    appDescriptionKeys,
    repaintHooks,
    commands: COMMANDS,
    multiFinderLabels,
    registerOpeners,
    openerEntries,
    windowRecord,
    windows: () => Object.keys(WINDOWS),
  });
})();
