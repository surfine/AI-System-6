// Per-application menu declarations and renderer.
//
// The Apple menu and right-side status controls stay in index.html because
// they belong to the system. This file owns only the foreground application's
// menus, including the app-specific rows in Special.

const menuItem = (action, labelKey, shortcutId = "", extra = {}) => ({
  type: "item",
  action,
  labelKey,
  shortcutId,
  conditionId: action,
  ...extra,
});
const menuSeparator = Object.freeze({ type: "separator" });
const submenu = (labelKey, items, extra = {}) => ({ type: "submenu", labelKey, items, ...extra });
const menuSectionLabel = (labelKey, menuCondition = "") => ({ type: "section-label", labelKey, menuCondition });

const editBasics = [
  menuItem("undo", "undo", "undo"),
  menuSeparator,
  menuItem("cut", "cut", "cut"),
  menuItem("copy", "copy", "copy"),
  menuItem("paste", "paste", "paste"),
  menuItem("clear-edit", "clear"),
  menuItem("select-all", "select_all", "select-all"),
];

const selectionTools = [
  menuItem("selection-look-up", "look_up"),
  menuItem("selection-find-sources", "find_sources"),
  menuItem("selection-clip-file", "selection_clip_file"),
  menuItem("selection-translate", "translate_selection"),
  menuItem("make-docmap-selection", "docmap_from_selection"),
];

const writingTools = [
  menuItem("ai-describe-change", "make_a_change"),
  menuItem("ai-proofread", "proofread"),
  menuItem("ai-rewrite", "rewrite"),
  menuItem("ai-friendly", "make_friendly"),
  menuItem("ai-professional", "make_professional"),
  menuItem("ai-concise", "make_concise"),
  menuItem("ai-summary", "summarize"),
  menuItem("ai-key-points", "extract_key_points"),
  menuItem("ai-list", "make_list"),
  menuItem("ai-table", "make_table"),
];

const flatSelectionTools = [menuSectionLabel("selection_services"), ...selectionTools];
const editWithSelection = [...editBasics, menuSeparator, ...flatSelectionTools];
const editWithWriting = [
  ...editBasics,
  menuSeparator,
  submenu("writing_tools", writingTools),
  menuSeparator,
  ...flatSelectionTools,
];

const appearanceItems = [
  menuItem("set-theme-classic", "theme_classic", "", { themeId: "classic" }),
  menuItem("set-theme-platinum", "theme_platinum", "", { themeId: "platinum" }),
  menuItem("set-theme-liquid-glass", "theme_liquid_glass", "", { themeId: "liquid-glass" }),
  menuSeparator,
  menuItem("open-theme-lab", "theme_lab"),
];

const systemSpecialItems = [
  menuItem("tile-windows", "tile_windows"),
  menuSeparator,
  submenu("appearance", appearanceItems),
  menuItem("toggle-balloon-help", "show_balloon_help"),
  menuItem("reset-system", "reset_system"),
  menuSeparator,
  menuItem("restart-system", "restart"),
  menuItem("shut-down-system", "shut_down"),
];

const menu = (id, labelKey, items, extra = {}) => ({ id, labelKey, items, ...extra });
const specialMenu = (appItems = []) => menu("special", "menu_special", [
  ...appItems,
  ...(appItems.length ? [menuSeparator] : []),
  ...systemSpecialItems,
]);

// Finder's File menu holds only verbs that make sense for *any* selected
// object. Two other kinds of verb used to live here and made it 32 rows long:
//
//   - kind-specific verbs (install a Skill, accept a suggestion, promote a
//     draft). System 6 has no contextual menus — the native home for "what
//     this particular object can do" is its Get Info window, which
//     openFileInfo() already branches by kind. They moved there.
//   - task lifecycle verbs. Those went to their own Task menu, which appears
//     only when the project actually contains a Task Config, because their
//     mutually exclusive grey/black pattern is what says which step a task is
//     on — and that reads as information only when they sit together.
const finderMenus = [
  menu("file", "menu_file", [
    menuItem("new-folder", "new_folder", "new-folder"),
    menuItem("open-menu-selection", "open", "open"),
    menuItem("close-active-window", "close", "close-window"),
    menuSeparator,
    menuItem("open-file-info", "get_info", "get-info"),
    menuItem("duplicate-selection", "duplicate", "duplicate"),
    menuItem("make-alias", "make_alias"),
    menuItem("rename-file", "rename"),
    menuItem("attach-selected-to-cliotalk", "attach_to_cliotalk"),
    menuSeparator,
    menuItem("move-file-trash", "move_to_trash", "move-to-trash"),
    menuItem("put-away", "put_away"),
    menuSeparator,
    menuItem("page-setup", "page_setup"),
    menuItem("print-directory", "print_directory"),
    menuSeparator,
    menuItem("eject-menu-selection", "eject", "eject"),
  ]),
  menu("edit", "menu_edit", editBasics),
  menu("view", "menu_view", [
    menuItem("view-small-icons", "view_by_small_icon", "", { viewMode: "small-icon" }),
    menuItem("view-icons", "view_by_icon", "", { viewMode: "icon" }),
    menuItem("view-by-name", "view_by_name", "", { viewMode: "name" }),
    menuItem("view-by-date", "view_by_date", "", { viewMode: "date" }),
    menuItem("view-by-size", "view_by_size", "", { viewMode: "size" }),
    menuItem("view-by-kind", "view_by_kind", "", { viewMode: "kind" }),
  ]),
  menu("task", "menu_task", [
    menuItem("run-task-config", "run_in_cliotalk"),
    menuItem("pause-task-config", "task_pause"),
    menuItem("resume-task-config", "task_resume"),
    menuItem("complete-task-config", "task_complete"),
    menuItem("cancel-task-config", "task_cancel"),
    menuSeparator,
    menuItem("create-task-checkpoint", "task_checkpoint_create"),
    menuItem("restore-task-checkpoint", "task_checkpoint_restore"),
  ], { menuCondition: "task-menu" }),
  specialMenu([
    menuItem("empty-trash", "empty_trash"),
    menuItem("erase-disk", "erase_disk"),
    menuItem("set-startup-project", "set_startup"),
  ]),
];

const teachTextMenus = [
  menu("file", "menu_file", [
    menuItem("new-document", "new_document", "new-document"),
    menuItem("open-text-document", "open", "open"),
    menuItem("close-active-window", "close", "close-window"),
    menuSeparator,
    menuItem("save-current", "save_current", "save"),
    menuItem("save-copy", "save_copy", "save-copy"),
    menuSeparator,
    submenu("menu_export", [
      menuItem("copy-active-markdown", "copy_markdown"),
      menuItem("download-active-markdown", "download_markdown"),
      menuItem("download-active-bilingual-markdown", "download_bilingual_md"),
      menuItem("export-teachtext-project-cd", "export_project_cd"),
    ]),
    menuSeparator,
    menuItem("open-document-versions", "versions_menu"),
    menuSeparator,
    menuItem("page-setup", "page_setup"),
    menuItem("print-current", "print"),
  ]),
  menu("edit", "menu_edit", editWithWriting),
  menu("writing", "menu_writing", [
    submenu("menu_go_to", [
      menuItem("open-question-sheet", "question_sheet"),
      menuItem("open-outline", "outline"),
      menuItem("open-section-drafts", "section_drafts"),
      menuItem("open-teachtext-manuscript", "teachtext_label"),
      menuItem("open-review-desk", "review_desk"),
    ]),
    menuItem("toggle-writing-preview", "preview"),
    menuItem("see-as-chart", "clio_chart_see_as_chart"),
    menuSeparator,
    submenu("question_sheet", [
      menuItem("insert-question-template", "insert_question_template"),
      menuItem("organize-question-sheet", "organize_question_sheet"),
      menuItem("generate-outline", "make_outline"),
      menuItem("advance-question-to-outline", "to_outline"),
    ], { surface: "questionSheet" }),
    submenu("outline", [
      menuItem("add-outline-section", "add_outline_section"),
      menuItem("mingming-outline", "mingming_outline"),
      menuItem("structure-outline", "structure_outline"),
      menuItem("expand-outline", "expand_weak_topic"),
      menuItem("advance-outline-to-drafts", "to_section_drafts"),
    ], { surface: "outline" }),
    submenu("section_drafts", [
      menuItem("previous-section-draft", "previous_section"),
      menuItem("next-section-draft", "next_section"),
      menuItem("draft-current-section", "draft_section"),
      menuItem("polish-draft", "polish_draft"),
      menuItem("suggest-draft", "suggest_draft"),
      menuItem("advance-drafts-to-review", "to_review"),
    ], { surface: "sectionDrafts" }),
    submenu("review_desk", [
      menuItem("previous-style-section", "previous_section"),
      menuItem("next-style-section", "next_section"),
      menuItem("review-style-section", "review_style_section"),
      menuItem("review-facts-section", "review_facts_section"),
      menuItem("review-facts-section-online", "review_facts_section_online"),
      menuItem("review-facts-online", "review_facts_online"),
      menuItem("review-hkrr-section", "review_hkrr_section"),
      menuItem("review-mingming-section", "review_mingming_section"),
      menuItem("review-mingming-handoff", "review_mingming_handoff"),
      menuItem("review-mingming-handoff-backstage", "review_mingming_handoff_backstage"),
      menuItem("review-export", "review_export"),
    ], { surface: "reviewDesk" }),
    menuSeparator,
    menuItem("open-image-manager", "image_manager"),
    menuItem("generate-marp-open-clio-stage", "generate_marp_open_clio_stage"),
  ]),
  specialMenu(),
];

// Quick Draft is its own application. Its route relationship is deliberately
// one-way: the draft may enter Writing Studio, but Writing Studio never owns
// or advertises Quick Draft as one of its internal writing surfaces.
const quickDraftMenus = [
  menu("file", "menu_file", [
    menuItem("close-active-window", "close", "close-window"),
    menuSeparator,
    menuItem("quick-draft-save-project", "quick_draft_save_project_doc"),
    menuSeparator,
    menuItem("quick-draft-copy-markdown", "copy_markdown"),
    menuItem("quick-draft-send-teachtext", "quick_draft_send_teachtext"),
    menuItem("quick-draft-send-review", "quick_draft_send_review"),
  ]),
  menu("edit", "menu_edit", editWithWriting),
  menu("view", "menu_view", [
    menuItem("quick-draft-view-body", "quick_draft_display_body"),
    menuItem("quick-draft-view-grain", "quick_draft_grain"),
    menuItem("quick-draft-view-read", "quick_draft_composite"),
    menuSeparator,
    menuItem("quick-draft-toggle-materials", "quick_draft_hide_materials"),
    menuItem("quick-draft-toggle-adjustments", "quick_draft_hide_adjustments"),
  ]),
  menu("quickDraft", "quick_draft_label", [
    menuItem("quick-draft-compose", "quick_draft_start_writing"),
    menuItem("quick-draft-apply", "quick_draft_preview_adjustments"),
    menuItem("quick-draft-develop", "quick_draft_develop"),
    menuSeparator,
    menuItem("quick-draft-import-chat", "quick_draft_import_chat_records"),
    menuItem("quick-draft-vent-on", "quick_draft_vent_start"),
    menuItem("quick-draft-vent-off", "quick_draft_vent_stop"),
    menuItem("quick-draft-vent-summary", "quick_draft_vent_summarize"),
    menuSeparator,
    menuItem("quick-draft-talk-points", "quick_draft_chip_talk_points"),
    menuItem("quick-draft-mingming", "quick_draft_chip_mingming"),
    menuItem("quick-draft-luoluo", "quick_draft_chip_luoluo"),
    menuItem("quick-draft-hkrr", "quick_draft_chip_hkrr"),
    menuItem("quick-draft-praise", "quick_draft_chip_praise"),
    menuSeparator,
    menuItem("quick-draft-toggle-sideask", "quick_draft_show_sideask"),
    menuItem("quick-draft-open-writing-studio", "enter_writing_studio"),
  ], { menuCondition: "quick-draft-menu" }),
  specialMenu(),
];

// A conversation is a file on a disk, so its verbs live in File. "Save
// conversation" is gone: the transcript is written to its .talk file as it
// goes, and the info bar says where — a Save row beside an autosaving file
// only teaches the user to doubt that it saved.
const clioTalkMenus = [
  menu("file", "menu_file", [
    menuItem("start-new-clio-chat", "new_conversation", "new-document"),
    submenu("recent_conversations", [{ type: "recent-chats" }]),
    menuItem("close-active-window", "close", "close-window"),
    menuSeparator,
    menuItem("rename-active-chat", "rename_conversation"),
    menuItem("reveal-active-chat-file", "reveal_in_project_disk"),
    // Only a temporary conversation has anything to save — an ordinary one is
    // already on disk. Gated rather than removed so the capability survives.
    menuItem("save-conversation", "save_as_conversation_file"),
    menuSeparator,
    submenu("menu_export", [
      menuItem("copy-current-chat-markdown", "copy_markdown"),
      menuItem("download-current-chat-markdown", "download_markdown"),
    ]),
  ]),
  menu("edit", "menu_edit", [
    ...editWithSelection,
    menuSeparator,
    menuItem("find-in-cliotalk", "find_in_conversation"),
    menuItem("find-next-in-cliotalk", "find_next"),
  ]),
  menu("conversation", "menu_conversation", [
    menuItem("open-clio-attachment-picker", "compose_attach_project_file"),
    menuItem("clear-attached-clips", "clear_context"),
    menuSeparator,
    menuItem("start-temporary-clio-chat", "temporary_conversation"),
    menuSeparator,
    menuItem("remember-chat-as-project-memory", "remember_project_memory"),
  ]),
  specialMenu(),
];

const readerMenus = [
  menu("file", "menu_file", [
    menuItem("reader-open-source", "open_source", "open"),
    menuItem("close-active-window", "close", "close-window"),
  ]),
  menu("edit", "menu_edit", [
    menuItem("copy", "copy", "copy"), menuItem("select-all", "select_all", "select-all"),
    menuSeparator, ...flatSelectionTools,
  ]),
  menu("source", "menu_source", [
    menuItem("reader-clip", "clip"),
    menuItem("reader-clip-translate", "clip_translate"),
    menuItem("reader-send-manuscript", "send_to_manuscript"),
    menuItem("reader-make-docmap", "make_docmap"),
    menuItem("reader-docmap-source", "docmap_from_source"),
    menuItem("reader-open-clio-stage", "open_in_clio_stage"),
    menuItem("focus-reader-question", "ask"),
  ]),
  specialMenu(),
];

const timeMachineMenus = [
  menu("file", "menu_file", [
    menuItem("time-machine-new-tab", "new_tab"),
    menuItem("time-machine-close-tab", "close_tab"),
    menuItem("close-active-window", "close", "close-window"),
  ]),
  menu("edit", "menu_edit", [
    menuItem("copy", "copy", "copy"), menuItem("select-all", "select_all", "select-all"),
    menuSeparator, ...flatSelectionTools,
    menuSeparator,
    menuItem("time-machine-clip", "clip"),
    menuItem("time-machine-clip-translate", "clip_translate"),
    menuItem("time-machine-send-manuscript", "send_to_manuscript"),
    menuItem("time-machine-docmap", "make_docmap"),
    menuItem("time-machine-docmap-source", "docmap_from_source"),
    menuItem("time-machine-ask", "ask"),
  ]),
  menu("navigate", "menu_navigate", [
    menuItem("time-machine-back", "back"),
    menuItem("time-machine-forward", "forward"),
    menuItem("time-machine-stop", "stop"),
    menuItem("time-machine-refresh", "refresh"),
    menuItem("time-machine-switch-source", "time_machine_switch_source"),
    menuSeparator,
    menuItem("time-machine-toggle", "time_machine"),
    menuItem("time-machine-web-view", "web_view"),
    menuItem("time-machine-reader-view", "reading_view"),
    menuSeparator,
    menuItem("time-machine-preserve-wayback", "time_machine_preserve_wayback"),
    menuItem("time-machine-preserve-archive-is", "time_machine_preserve_archive_is"),
  ]),
  specialMenu(),
];

const docMapMenus = [
  menu("file", "menu_file", [
    menuItem("close-active-window", "close", "close-window"),
    menuSeparator,
    menuItem("docmap-save", "save"),
    menuItem("docmap-print-pdf", "print_pdf"),
  ]),
  menu("edit", "menu_edit", [menuItem("copy", "copy", "copy")]),
  menu("map", "menu_map", [
    menuItem("docmap-send-question", "to_question_sheet"),
    menuItem("docmap-insert-outline", "insert_outline"),
    menuItem("docmap-hkrr", "review_hkrr_section"),
    menuItem("focus-docmap-question", "ask"),
    menuSeparator,
    submenu("menu_layout", [
      menuItem("docmap-layout-tree", "docmap_layout_tree"),
      menuItem("docmap-layout-radial", "docmap_layout_radial"),
      menuItem("docmap-layout-fishbone", "docmap_layout_fishbone"),
    ]),
    menuItem("docmap-fit-view", "fit_view"),
    menuItem("docmap-zoom-out", "zoom_out"),
    menuItem("docmap-zoom-in", "zoom_in"),
  ]),
  specialMenu(),
];

const scrapbookMenus = [
  menu("file", "menu_file", [
    menuItem("new-note", "new_scrap"),
    menuItem("close-active-window", "close", "close-window"),
    menuSeparator,
    menuItem("scrapbook-export-bilingual", "download_bilingual_md"),
  ]),
  menu("edit", "menu_edit", [
    menuItem("copy", "copy", "copy"), menuItem("select-all", "select_all", "select-all"),
    menuSeparator, ...flatSelectionTools,
  ]),
  menu("scrap", "menu_scrap", [
    menuItem("scrapbook-open-source", "open_source"),
    menuItem("scrapbook-toggle-translation", "show_translation"),
    menuItem("scrapbook-insert", "insert"),
    menuItem("scrapbook-attach", "attach_to_assistant"),
    menuItem("scrapbook-send-question", "to_question_sheet"),
    menuItem("scrapbook-outline", "make_outline"),
    menuItem("make-docmap", "make_docmap"),
    menuItem("make-docmap-source", "docmap_from_source"),
    menuItem("focus-scrapbook-question", "ask"),
    menuSeparator,
    menuItem("scrapbook-delete", "delete"),
  ]),
  specialMenu(),
];

const searcherMenus = [
  menu("file", "menu_file", [menuItem("close-active-window", "close", "close-window")]),
  menu("edit", "menu_edit", editWithSelection),
  menu("search", "menu_search", [
    menuItem("focus-search-query", "search"),
    menuItem("synthesize-search-results", "synthesize"),
    submenu("menu_selected_result", [
      menuItem("open-selected-in-reader", "open_in_reader"),
      menuItem("clip-selected-find-path", "clip"),
      menuItem("copy-search-result-markdown", "copy_markdown"),
      menuItem("insert-search-result", "insert"),
    ]),
  ]),
  specialMenu(),
];

const clioStageMenus = [
  menu("file", "menu_file", [
    menuItem("clio-stage-import", "import"),
    menuItem("close-active-window", "close", "close-window"),
  ]),
  menu("edit", "menu_edit", editWithSelection),
  menu("presentation", "menu_presentation", [
    menuItem("clio-stage-previous", "previous_slide"),
    menuItem("clio-stage-next", "next_slide"),
    submenu("menu_view", [
      menuItem("clio-stage-source", "source_view"),
      menuItem("clio-stage-document", "document_view"),
      menuItem("clio-stage-slide", "slide_view"),
      menuItem("clio-stage-cue", "cue_view"),
    ]),
    menuItem("focus-clio-stage-question", "ask"),
  ]),
  specialMenu(),
];

const clioChartMenus = [
  menu("file", "menu_file", [
    submenu("clio_chart_new_from_template", [
      menuItem("clio-chart-new-cpu-gpu", "clio_chart_template_cpu_gpu"),
      menuItem("clio-chart-new-gaming", "clio_chart_template_gaming"),
      menuItem("clio-chart-new-battery-power", "clio_chart_template_battery"),
      menuItem("clio-chart-new-noise-heat", "clio_chart_template_noise_heat"),
      menuItem("clio-chart-new-display", "clio_chart_template_display"),
      menuItem("clio-chart-new-rating", "clio_chart_template_rating"),
      menuItem("clio-chart-new-blank", "clio_chart_template_blank"),
    ]),
    menuItem("clio-chart-import", "import"),
    menuItem("clio-chart-save-template", "clio_chart_save_template"),
    menuItem("clio-chart-hand-back", "clio_chart_hand_back"),
    menuItem("close-active-window", "close", "close-window"),
  ]),
  menu("edit", "menu_edit", editWithSelection),
  menu("chart", "menu_chart", [
    menuItem("clio-chart-bars", "clio_chart_bars", "clio-chart-view-1"),
    menuItem("clio-chart-matrix", "clio_chart_matrix", "clio-chart-view-2"),
    menuItem("clio-chart-trace", "clio_chart_trace", "clio-chart-view-3"),
    menuItem("clio-chart-grid", "clio_chart_grid", "clio-chart-view-4"),
    menuItem("clio-chart-score", "clio_chart_score", "clio-chart-view-5"),
    menuItem("clio-chart-source", "source_view"),
    menuSeparator,
    menuItem("clio-chart-presentation", "clio_chart_presentation"),
    menuItem("clio-chart-send-stage", "clio_chart_send_stage"),
    menuItem("clio-chart-reverse-sort", "clio_chart_reverse_sort", "clio-chart-reverse"),
    menuItem("clio-chart-lower-better", "clio_chart_lower_better"),
    submenu("clio_chart_ask", [
      menuItem("clio-chart-read", "clio_chart_read"),
      menuItem("clio-chart-outliers", "clio_chart_outliers"),
      menuItem("clio-chart-gaps", "clio_chart_gaps"),
      menuItem("clio-chart-write-up", "clio_chart_write_up"),
    ]),
  ]),
  specialMenu(),
];

const liquidCoverMenus = [
  menu("file", "menu_file", [
    menuItem("cover-choose-background", "liquid_cover_choose_background"),
    menuItem("cover-choose-video", "liquid_cover_choose_motion"),
    menuItem("cover-choose-subject", "liquid_cover_choose_foreground"),
    menuSeparator,
    menuItem("cover-export-png", "liquid_cover_export_png"),
    menuItem("cover-export-video", "liquid_cover_export_video"),
    menuItem("close-active-window", "close", "close-window"),
  ]),
  menu("edit", "menu_edit", editBasics),
  menu("cover", "menu_cover", [
    menuItem("cover-add-layer", "liquid_cover_add_layer"),
    menuItem("cover-delete-layer", "delete"),
    submenu("menu_add_shape", [
      menuItem("cover-shape-circle", "liquid_cover_shape_circle"),
      menuItem("cover-shape-squircle", "liquid_cover_shape_squircle"),
      menuItem("cover-shape-capsule", "liquid_cover_shape_capsule"),
    ]),
    menuItem("cover-toggle-focus", "focus"),
    menuItem("cover-preview-motion", "preview"),
    menuItem("cover-ai-compose", "liquid_cover_ai_compose"),
  ]),
  specialMenu(),
];

const cmfStudioMenus = [
  menu("file", "menu_file", [
    menuItem("cmf-save-recipe", "save"),
    menuItem("cmf-export-usdz", "cmf_export_usdz"),
    menuItem("close-active-window", "close", "close-window"),
  ]),
  menu("recipe", "menu_recipe", [
    menuItem("cmf-shuffle", "cmf_shuffle"),
    menuItem("cmf-reset", "reset"),
    menuItem("cmf-reset-view", "cmf_reset_view"),
  ]),
  menu("view", "menu_view", [
    menuItem("cmf-view-front", "cmf_view_front"),
    menuItem("cmf-view-back", "cmf_view_back"),
    menuItem("cmf-view-side", "cmf_view_side"),
  ]),
  specialMenu(),
];

const soundscapeMenus = [
  menu("file", "menu_file", [
    menuItem("soundscape-choose-local", "soundscape_choose_local"),
    menuItem("soundscape-gamdl-download", "soundscape_gamdl_download"),
    menuItem("soundscape-save-moment", "soundscape_save_moment"),
    menuItem("close-active-window", "close", "close-window"),
  ]),
  menu("soundscape", "menu_soundscape", [
    menuItem("soundscape-toggle-play", "soundscape_play_pause"),
    menuItem("soundscape-previous", "soundscape_previous_track"),
    menuItem("soundscape-next", "soundscape_next_track"),
    submenu("soundscape_shuffle", [
      menuItem("soundscape-shuffle-on", "soundscape_shuffle_mode_on", "", { shuffleMode: "on" }),
      menuItem("soundscape-shuffle-off", "soundscape_shuffle_mode_off", "", { shuffleMode: "off" }),
      menuSeparator,
      menuItem("soundscape-shuffle-songs", "soundscape_shuffle_kind_songs", "", { shuffleKind: "songs" }),
      menuItem("soundscape-shuffle-albums", "soundscape_shuffle_kind_albums", "", { shuffleKind: "albums" }),
      menuItem("soundscape-shuffle-groupings", "soundscape_shuffle_kind_groupings", "", { shuffleKind: "groupings" }),
    ]),
    submenu("soundscape_repeat", [
      menuItem("soundscape-repeat-off", "soundscape_repeat_mode_off", "", { repeatMode: "off" }),
      menuItem("soundscape-repeat-all", "soundscape_repeat_mode_all", "", { repeatMode: "all" }),
      menuItem("soundscape-repeat-one", "soundscape_repeat_mode_one", "", { repeatMode: "one" }),
    ]),
    menuItem("soundscape-reset-style", "soundscape_reset_style"),
    menuItem("soundscape-link-project", "soundscape_add_project"),
  ]),
  specialMenu(),
];

const endfieldMenus = [
  menu("file", "menu_file", [menuItem("close-active-window", "close", "close-window")]),
  menu("edit", "menu_edit", editBasics),
  menu("session", "menu_session", [
    menuItem("endfield-new-session", "new_session"),
    menuItem("endfield-run-query", "search"),
  ]),
  specialMenu(),
];

const bureaucracyMemeMenus = [
  menu("file", "menu_file", [
    menuItem("meme-upload", "bureaucracy_meme_upload"),
    menuItem("meme-download", "bureaucracy_meme_download"),
    menuItem("close-active-window", "close", "close-window"),
  ]),
  menu("edit", "menu_edit", editBasics),
  menu("meme", "menu_meme", [
    menuItem("meme-focus-topic", "bureaucracy_meme_topic"),
    menuItem("meme-generate", "bureaucracy_meme_generate"),
  ]),
  specialMenu(),
];

const minimalMenus = [specialMenu()];

const applicationMenuSets = Object.freeze({
  finder: finderMenus,
  quickDraft: quickDraftMenus,
  teachText: teachTextMenus,
  clioTalk: clioTalkMenus,
  reader: readerMenus,
  timeMachine: timeMachineMenus,
  docMap: docMapMenus,
  scrapbook: scrapbookMenus,
  searcher: searcherMenus,
  clioStage: clioStageMenus,
  clioChart: clioChartMenus,
  liquidCover: liquidCoverMenus,
  cmfStudio: cmfStudioMenus,
  soundscape: soundscapeMenus,
  endfield: endfieldMenus,
  bureaucracyMeme: bureaucracyMemeMenus,
});

function menuSetIdForApp(appId = "finder") {
  if (appId === "writingStudio") return "teachText";
  return applicationMenuSets[appId] ? appId : "system";
}

function menuSetForApp(appId = "finder") {
  return applicationMenuSets[menuSetIdForApp(appId)] || minimalMenus;
}

function renderApplicationMenuItem(item) {
  if (item.type === "separator") return document.createElement("hr");
  if (item.type === "section-label") {
    const label = document.createElement("div");
    label.className = "menu-section-label";
    label.dataset.i18n = item.labelKey;
    label.textContent = typeof t === "function" ? t(item.labelKey) : item.labelKey;
    return label;
  }
  if (item.type === "recent-chats") {
    const fragment = document.createDocumentFragment();
    const recent = typeof getRecentChatFiles === "function" ? getRecentChatFiles(6) : [];
    if (!recent.length) {
      const empty = document.createElement("div");
      empty.className = "menu-section-label";
      empty.textContent = typeof t === "function" ? t("no_recent_conversations") : "No recent conversations";
      fragment.append(empty);
      return fragment;
    }
    recent.forEach((file) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.action = `open-chat-file:${file.id}`;
      button.textContent = file.name;
      fragment.append(button);
    });
    return fragment;
  }
  if (item.type === "submenu") {
    const wrapper = document.createElement("div");
    wrapper.className = "menu-submenu menu-item-with-sub";
    if (item.surface) wrapper.dataset.menuSurface = item.surface;
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "menu-submenu-trigger";
    trigger.dataset.i18n = item.labelKey;
    trigger.textContent = typeof t === "function" ? t(item.labelKey) : item.labelKey;
    const popover = document.createElement("div");
    popover.className = "menu-submenu-popover menu-sub-popover";
    item.items.forEach((child) => popover.append(renderApplicationMenuItem(child)));
    wrapper.append(trigger, popover);
    return wrapper;
  }
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.action = item.action;
  button.dataset.i18n = item.labelKey;
  if (item.themeId) button.dataset.themeChoice = item.themeId;
  if (item.shortcutId) button.dataset.shortcutId = item.shortcutId;
  if (item.viewMode) button.dataset.viewMode = item.viewMode;
  if (item.repeatMode) button.dataset.repeatMode = item.repeatMode;
  if (item.shuffleMode) button.dataset.shuffleMode = item.shuffleMode;
  if (item.shuffleKind) button.dataset.shuffleKind = item.shuffleKind;
  button.textContent = typeof t === "function" ? t(item.labelKey) : item.labelKey;
  return button;
}

let renderedApplicationMenuSetId = "";

function renderAppMenuBar(appId = activeAppId || "finder", { force = false } = {}) {
  const slot = document.querySelector("#app-menu-slot");
  if (!slot) return;
  const setId = menuSetIdForApp(appId);
  if (!force && renderedApplicationMenuSetId === setId) return;

  const fragment = document.createDocumentFragment();
  menuSetForApp(appId).forEach((definition) => {
    const menuElement = document.createElement("div");
    menuElement.className = "menu";
    menuElement.dataset.menuId = definition.id;
    menuElement.dataset.appMenu = "";
    if (definition.menuCondition) menuElement.dataset.menuCondition = definition.menuCondition;

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.dataset.i18n = definition.labelKey;
    trigger.textContent = typeof t === "function" ? t(definition.labelKey) : definition.labelKey;

    const popover = document.createElement("div");
    popover.className = "menu-popover";
    definition.items.forEach((item) => popover.append(renderApplicationMenuItem(item)));
    menuElement.append(trigger, popover);
    fragment.append(menuElement);
  });

  document.querySelectorAll(".menu-bar > [data-app-menu]").forEach((element) => element.remove());
  slot.before(fragment);
  renderedApplicationMenuSetId = setId;
  if (typeof syncKeyboardShortcutLabels === "function") syncKeyboardShortcutLabels();
  if (typeof invalidateMenuActionCache === "function") invalidateMenuActionCache();
}
