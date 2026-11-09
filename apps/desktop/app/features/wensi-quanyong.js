// 文思泉涌 — the blog writing studio.
//
// One window over every blog site: the left column is the article library
// (site, content-type groups, status filter, search), the middle is the
// writing surface, the right is the inspector generated from the site's own
// description. A site description (CONTRACTS v1) is the whole truth: the
// panels, the URL preview and the field rules are read from it, never
// hard-coded.
//
// The desk's server route (apps/server/routes/wensi-quanyong.js, lane C)
// serves the four P1 endpoints. When it cannot be reached — the route is not
// deployed yet, or the desk runs without the server — the studio falls back
// to an embedded `demo` site description with three readable sample
// articles, and the status bar says 演示 explicitly. The demo site has no
// publish channel at all.
//
// Nothing here lands in a new storage schema: the article state is derived
// from the site files (front-matter draft rules) and git, and the index
// cache lives in this module's memory for the session only.

(function installWensiQuanyong() {
  "use strict";
  if (window.AISystem6WensiQuanyongLoaded) return;

  const WINDOW_NAME = "wensiQuanyong";
  const API = "/api/wensi-quanyong";
  const AUTOSAVE_DELAY_MS = 2000;
  // Mirrors the server's per-file cap (photos.js): checked before the upload.
  const MAX_IMPORT_BYTES = 12 * 1024 * 1024;
  // Library filters, in the order the column shows them.
  const STATUS_FILTERS = ["all", "draft", "published", "dirty"];

  // App copy lives in this lazy module, not in the eager translation tables:
  // the boot budget carries only the admission label and description. The
  // two marker lines this block sits between are part of the
  // translations-parity contract — keep the block between them intact.
  const LOCAL_STRINGS = {
    en: {
      wensi_library_label: "Article library",
      wensi_sites_label: "Site",
      wensi_new_draft: "New draft",
      wensi_status_filter: "Status filter",
      wensi_filter_all: "All",
      wensi_category_all: "All categories",
      wensi_filter_draft: "Drafts",
      wensi_filter_published: "Published",
      wensi_filter_dirty: "Unsaved edits",
      wensi_search_placeholder: "Search titles, text or tags",
      wensi_search_label: "Search",
      wensi_untitled: "Untitled",
      wensi_dirty_hint: "Changed since the last push",
      wensi_status_draft: "Draft",
      wensi_status_published: "Published",
      wensi_status_unpublished: "Unpublished",
      wensi_editor_label: "Body",
      wensi_editor_placeholder: "Write here. The pause saves.",
      wensi_focus_mode: "Focus",
      wensi_focus_sentence: "Focus: sentence",
      wensi_focus_typewriter: "Focus: typewriter",
      wensi_focus_hint: "Sentence focus dims the rest and keeps the caret centered. Turn it off while revising, so a selection does not fight the centering.",
      wensi_matter_line: "{count} fields, edited in the panel",
      wensi_matter_form: "Form",
      wensi_matter_source: "Source",
      wensi_matter_source_note: "These are the fields that will be written. Edit them in the form.",
      wensi_stat_words: "{count} words",
      wensi_stat_local: "On this Mac",
      wensi_stat_unpushed: "Not pushed",
      wensi_empty_hint: "Pick an article on the left, or start a new draft.",
      wensi_load_failed: "Could not open this article",
      wensi_save_dirty: "Unsaved changes",
      wensi_save_saving: "Saving…",
      wensi_save_saved: "Saved",
      wensi_save_error: "Save failed — retries on the next pause",
      wensi_required_missing: "Required: ",
      wensi_type_group_failed: "This type could not be listed. Select the site again to retry.",
      wensi_folder_grant_required: "This site's folder is not shared with AI System 6 yet. Share it from the Chooser, then pick the site again.",
      wensi_inspector_idle: "Choose an article, or start a new draft.",
      wensi_inspector_modes_label: "Properties or checks",
      wensi_mode_fields: "Properties",
      wensi_mode_check: "Checks",
      wensi_check_run: "Check now",
      wensi_check_running: "Checking…",
      wensi_check_errors: "to fix",
      wensi_check_warns: "to read",
      wensi_check_notes: "notes",
      wensi_check_clean: "No findings. This draft reads clean to the site's checks.",
      wensi_check_tools_missing: "This site's check scripts are not shared with AI System 6 yet. Share that folder, then run again.",
      wensi_check_unavailable: "The checks did not run this time.",
      wensi_check_demo: "The demo site runs no site checks; a real site's checks appear here.",
      wensi_publish_title: "Publish",
      wensi_publish_demo: "The demo site has no publishing channel.",
      wensi_publish_blocked: "Red findings hold the publish. Fix them in the checks, then come back.",
      wensi_publish_need_check: "Run the checks first; publishing starts from them.",
      wensi_publish_plan: "Show the publish steps",
      wensi_publish_will_run: "Runs: ",
      wensi_publish_will_write: "Writes: ",
      wensi_publish_nothing: "no files (this type is edited where the site reads it)",
      wensi_publish_prepare: "Prepare and build",
      wensi_publish_prepared: "Written to the site and built.",
      wensi_publish_prepared_nochange: "The site was already current; built.",
      wensi_publish_deploy_confirm: "Confirm: deploy to the site",
      wensi_publish_deployed: "Deployed; the address answered with the new text.",
      wensi_publish_deploy_pending: "Deployed, but the address has not shown the new text yet.",
      wensi_mode_media: "Media",
      wensi_media_scan: "Scan images",
      wensi_media_scanning: "Scanning…",
      wensi_media_files: "images",
      wensi_media_missing_alt: "no alt",
      wensi_media_unused: "unused",
      wensi_media_no_alt: "no alt text",
      wensi_media_not_used: "nothing uses it",
      wensi_media_empty: "No images in the site's directory.",
      wensi_media_demo: "The demo site has no image directory.",
      wensi_media_grant: "The image directory is not shared with AI System 6 yet. Share it from the Chooser, then scan.",
      wensi_media_failed: "The scan did not run this time.",
      wensi_mode_photos: "Photos",
      wensi_photos_load: "Read the collection",
      wensi_photos_busy: "Reading…",
      wensi_photos_stacks: "stacks",
      wensi_photos_frames: "frames",
      wensi_photos_alt: "Alt text (required — for readers who cannot see the image)",
      wensi_photos_cap: "Caption (optional)",
      wensi_photos_save: "Save",
      wensi_photos_up: "Move up",
      wensi_photos_down: "Move down",
      wensi_photos_empty: "This site's photo collection has no stacks yet.",
      wensi_photos_demo: "The demo site has no photo collection.",
      wensi_photos_grant: "The photo collection is not shared with AI System 6 yet. Share it from the Chooser, then read again.",
      wensi_photos_failed: "The collection could not be read this time.",
      wensi_photos_rolls: "rolls",
      wensi_photos_in_roll: "roll",
      wensi_photos_drop: "Drop photographs here, or",
      wensi_photos_pick: "Choose files…",
      wensi_photos_pick_unavailable: "This desktop version has no file picker.",
      wensi_photos_drop_loose: "Loose first, arrange later",
      wensi_photos_into: "into",
      wensi_photos_loose: "Not in a stack yet",
      wensi_photos_select: "Pick for the next roll",
      wensi_photos_selected: "{n} frames picked",
      wensi_photos_move_to: "Move to another stack",
      wensi_photos_new_stack: "A new stack's name (English or pinyin becomes its URL)",
      wensi_photos_new_stack_go: "New stack",
      wensi_photos_roll_cap: "One sentence for this roll (optional)",
      wensi_photos_roll_keep: "Keep their stacks as they are",
      wensi_photos_roll_go: "Make it a roll",
      wensi_photos_importing: "Putting the photographs into the site…",
      wensi_photos_not_pictures: "That was not a photograph (jpg, png, gif and webp are read).",
      wensi_photos_too_large: "Too large (12 MiB each)",
      wensi_only_collections: "This site holds only collections (like 影像). Read and arrange them in the photos face on the right.",
      wensi_mode_upkeep: "Upkeep",
      wensi_mode_ledger: "Ledger",
      wensi_upkeep_demo: "The demo site has no routine.",
      wensi_upkeep_busy: "Working…",
      wensi_upkeep_load: "Read the routine",
      wensi_upkeep_sync: "Corpus sync",
      wensi_upkeep_sync_undeclared: "The site description does not declare a sync command.",
      wensi_upkeep_sync_running: "Running since {t}.",
      wensi_upkeep_sync_go: "Sync now",
      wensi_upkeep_sync_done: "Finished: {n} new corpus lines.",
      wensi_upkeep_stop: "Stop",
      wensi_upkeep_contacts: "Contacts",
      wensi_contacts_load: "Read the list",
      wensi_contacts_conversations: "conversations",
      wensi_contacts_senders: "people",
      wensi_contacts_sender_list: "People (default for groups)",
      wensi_contacts_group: "group",
      wensi_contacts_people: "people",
      wensi_contacts_save: "Save the list",
      wensi_longform_go: "Draft the longform",
      wensi_longform_tags: "tags",
      wensi_longform_related: "linked posts",
      wensi_longform_accept: "Write the longform",
      wensi_rescan_snapshot: "Snapshot first",
      wensi_rescan_rewrite: "Rewrite",
      wensi_rescan_compare: "before / after",
      wensi_rescan_apply: "Approve and write",
      wensi_rescan_written: "written",
      wensi_menu_need_article: "Choose an article, or start a new draft.",
      wensi_menu_refreshed: "The library was read again.",
      wensi_menu_sync_hint: "The sync runs from the button in Upkeep, so a long job is never started by a menu row.",
      wensi_upkeep_draft: "Draft this stretch",
      wensi_upkeep_plan: "Work out the plan",
      wensi_upkeep_days: "days",
      wensi_upkeep_missing: "no post yet",
      wensi_upkeep_models: "Models",
      wensi_upkeep_cap: "cap",
      wensi_upkeep_draft_go: "Draft",
      wensi_upkeep_drafting: "Drafting…",
      wensi_upkeep_draft_why: "One model turn through the channel the site declares; nothing is written until you save.",
      wensi_upkeep_channel: "Channel",
      wensi_draft_receipt: "Answered by",
      wensi_draft_accept: "Save as draft",
      wensi_upkeep_longform: "Longform from these posts",
      wensi_upkeep_longform_posts: "post filenames, separated by commas",
      wensi_upkeep_rescan: "Rescan a month",
      wensi_upkeep_rescan_go: "Build the packet",
      wensi_ledger_demo: "The demo site has no ledger.",
      wensi_ledger_busy: "Reading…",
      wensi_ledger_load: "Read the ledger",
      wensi_ledger_pending: "pending",
      wensi_ledger_hit: "hit",
      wensi_ledger_miss: "miss",
      wensi_ledger_errors: "{n} entries could not be read and are listed as errors, not dropped.",
      wensi_ledger_due: "due",
      wensi_ledger_settle: "Record",
      wensi_ledger_empty: "This site has no predictions yet.",
      wensi_mode_tags: "Tags",
      wensi_tags_hint: "Rename a tag, or fold it into an existing one. The old address keeps answering with a redirect.",
      wensi_tags_none: "This site's tag table has not been read yet.",
      wensi_tags_from: "Old tag",
      wensi_tags_to: "New tag",
      wensi_tags_plan: "See which articles change",
      wensi_tags_apply: "Rename in these articles",
      wensi_tags_apply_table: "Change the table only",
      wensi_tags_merge: " (merged into an existing tag)",
      wensi_tags_articles: "articles would change",
      wensi_tags_working: "Working…",
      wensi_tags_done: "Done",
      wensi_tags_applied_note: "Written to the articles and the tag table.",
      wensi_tags_need_both: "Fill in both the old and the new tag.",
      wensi_tags_plan_first: "Look at which articles change before writing.",
      wensi_view_modes_label: "Write, preview, or both",
      wensi_view_write: "Write",
      wensi_view_preview: "Preview",
      wensi_view_split: "Side by side",
      wensi_preview_title: "Preview of the published page",
      wensi_preview_note: "Same stylesheet and rendering rules as the live page.",
      wensi_preview_pending: "Rendering the preview…",
      wensi_preview_failed: "The preview could not be rendered this time.",
      wensi_preview_demo: "The demo site has no site stylesheet; this shows the desk's own typography.",
      wensi_items: "articles",
      wensi_demo_badge: "Demo",
      wensi_demo_hint: "The server is not reachable; this is the built-in demo site.",
      wensi_url_label: "Address",
      wensi_add_tag: "Add tag…",
      wensi_new_tag_hint: "New tag — not in the site's list yet",
      wensi_readonly_hint: "Managed by the site; edits are discarded on save",
      wensi_opaque_hint: "Held by the server; read-only here",
      wensi_storage_unsupported: "This content type is not manageable in the editor yet (the server declined it).",
      wensi_no_articles: "No articles here yet",
      wensi_public_read_only: "The public edition shows a demo library and cannot save, publish or sync.",
      wensi_publish_micropub_post: "Micropub POST",
      wensi_publish_token: "Micropub token",
      wensi_publish_token_save: "Save token",
      wensi_publish_token_hint: "The token goes to the Keychain; it is never written to the site description.",
      wensi_publish_token_delete: "Delete the Keychain token",
      wensi_publish_token_deleted: "The Keychain token was deleted.",
      wensi_suggest_ask: "Suggest fields",
      wensi_suggest_held: "Held until you write them into this draft.",
      wensi_suggest_accept: "Write these fields",
      wensi_send_review: "Send to Review Desk",
      wensi_menu_suggest: "Suggest Fields",
      wensi_menu_review: "Review Desk",
      wensi_publish_media_choose: "Choose an image…",
      wensi_publish_media_too_big: "That image is over 8 MB, so it was not uploaded.",
      wensi_publish_media_failed: "The image uploaded, but the site did not return an address.",
      wensi_publish_media_done: "The image is uploaded and its address is in the draft.",
      wensi_add_site_title: "Add a site",
      wensi_add_site_offline: "Adding a site needs the local server; the offline demo does not create sites.",
      wensi_add_site_id: "Site id (lowercase letters, digits, dashes)",
      wensi_add_site_label: "Display name",
      wensi_add_site_kind: "Starting point",
      wensi_add_site_hexo: "Hexo",
      wensi_add_site_micropub: "Micropub (also Micro.blog)",
      wensi_add_site_root: "Site root (absolute path)",
      wensi_add_site_url: "Site URL (optional)",
      wensi_add_site_endpoint: "Micropub endpoint",
      wensi_add_site_token: "Micropub token (Keychain only)",
      wensi_add_site_content_label: "Content type label",
      wensi_add_site_storage: "Storage directory",
      wensi_add_site_url_shape: "URL shape",
      wensi_add_site_tags: "Tag table (optional, relative to the root)",
      wensi_add_site_media: "Media directory (optional)",
      wensi_add_site_fields: "Custom fields (optional JSON array)",
      wensi_add_site_fields_invalid: "The custom fields are not valid JSON.",
      wensi_add_site_slug_property: "Slug property",
      wensi_add_site_add_type: "Add another content type",
      wensi_add_site_type_id: "Content type id",
      wensi_add_site_type_label: "Content type label",
      wensi_add_site_remove_type: "Remove this type",
      wensi_add_site_type_id_invalid: "A content type id is lowercase letters, digits and dashes, and it cannot repeat posts.",
      wensi_add_site_preview: "Preview",
      wensi_add_site_create: "Create site",
      wensi_add_site_close: "Close",
      wensi_add_site_created: "Site created.",
      wensi_add_site_token_saved: "Token saved to the Keychain.",
      wensi_add_site_token_failed: "The site was created, but the token was not saved:",
      wensi_add_site_grants: "Shared folders",
      wensi_add_site_next: "Next steps",
      wensi_add_site_validation: "The description does not validate yet:",
      wensi_draft_title: "New draft",
    },
    zh: {
      wensi_library_label: "文章库",
      wensi_sites_label: "站点",
      wensi_new_draft: "新稿",
      wensi_status_filter: "状态过滤",
      wensi_filter_all: "全部",
      wensi_category_all: "全部分类",
      wensi_filter_draft: "草稿",
      wensi_filter_published: "已发布",
      wensi_filter_dirty: "有改动",
      wensi_search_placeholder: "搜索标题、正文或标签",
      wensi_search_label: "搜索",
      wensi_untitled: "无题",
      wensi_dirty_hint: "有改动未推送",
      wensi_status_draft: "草稿",
      wensi_status_published: "已发布",
      wensi_status_unpublished: "未公开",
      wensi_editor_label: "正文",
      wensi_editor_placeholder: "在这里写。停顿一下就会自动保存。",
      wensi_focus_mode: "专注",
      wensi_focus_sentence: "专注：句子",
      wensi_focus_typewriter: "专注：打字机",
      wensi_focus_hint: "句子专注会把其余文字变淡，并把光标留在中间。改稿时关掉，免得选区和居中抢画面。",
      wensi_matter_line: "front-matter 有 {count} 项，在右边的属性里改",
      wensi_matter_form: "表单",
      wensi_matter_source: "源码",
      wensi_matter_source_note: "这是将写入文件的字段。要改，回到表单。",
      wensi_stat_words: "{count} 字",
      wensi_stat_local: "本机",
      wensi_stat_unpushed: "未推送",
      wensi_empty_hint: "从左边选一篇开始写，或者开一篇新稿。",
      wensi_load_failed: "打不开这篇文章",
      wensi_save_dirty: "有未保存改动",
      wensi_save_saving: "保存中…",
      wensi_save_saved: "已保存",
      wensi_save_error: "保存失败，下次停顿会重试",
      wensi_required_missing: "必填：",
      wensi_type_group_failed: "这一类暂时列不出来。重新选一次站点即可重试。",
      wensi_folder_grant_required: "这个站的文件夹还没共享给 AI System 6。先在「选择器」里共享它，然后重新选站点。",
      wensi_inspector_idle: "选一篇文章，或者开一篇新稿。",
      wensi_inspector_modes_label: "属性或检查",
      wensi_mode_fields: "属性",
      wensi_mode_check: "检查",
      wensi_check_run: "现在检查",
      wensi_check_running: "检查中…",
      wensi_check_errors: "项要改",
      wensi_check_warns: "项要看",
      wensi_check_notes: "条提示",
      wensi_check_clean: "没有查出问题。按站点的检查规则，这篇是干净的。",
      wensi_check_tools_missing: "站点的检查脚本目录还没共享给 AI System 6。共享后重跑。",
      wensi_check_unavailable: "这一次没能跑检查。",
      wensi_check_demo: "演示站点不跑站点检查；接上真站点后，检查结果出现在这里。",
      wensi_publish_title: "发布",
      wensi_publish_demo: "演示站点没有发布通道。",
      wensi_publish_blocked: "有红项挡着发布。先在检查里改掉，再回来。",
      wensi_publish_need_check: "先跑一次检查，发布从检查开始。",
      wensi_publish_plan: "看发布步骤",
      wensi_publish_will_run: "会跑：",
      wensi_publish_will_write: "会写：",
      wensi_publish_nothing: "不写文件（这个类型直接改在站点里）",
      wensi_publish_prepare: "准备并构建",
      wensi_publish_prepared: "已写入站点并构建完成。",
      wensi_publish_prepared_nochange: "站点已是最新，构建完成。",
      wensi_publish_deploy_confirm: "确认部署到线上",
      wensi_publish_deployed: "已部署，网址确认通过。",
      wensi_publish_deploy_pending: "已部署，网址还没出现新内容。",
      wensi_mode_media: "媒体",
      wensi_media_scan: "扫图片",
      wensi_media_scanning: "扫描中…",
      wensi_media_files: "张",
      wensi_media_missing_alt: "缺替代文字",
      wensi_media_unused: "没被用到",
      wensi_media_no_alt: "缺替代文字",
      wensi_media_not_used: "没被用到",
      wensi_media_empty: "站点的图片目录里没有图片。",
      wensi_media_demo: "演示站点没有图片目录。",
      wensi_media_grant: "图片目录还没共享给 AI System 6。在「选择器」里共享后再扫。",
      wensi_media_failed: "这一次没能扫描图片。",
      wensi_mode_photos: "影像",
      wensi_photos_load: "读影像集合",
      wensi_photos_busy: "读取中…",
      wensi_photos_stacks: "叠",
      wensi_photos_frames: "帧",
      wensi_photos_alt: "替代文字（必填，给看不见图的人）",
      wensi_photos_cap: "说明（可选）",
      wensi_photos_save: "存",
      wensi_photos_up: "上移",
      wensi_photos_down: "下移",
      wensi_photos_empty: "这个站点的影像集合里还没有叠。",
      wensi_photos_demo: "演示站点没有影像集合。",
      wensi_photos_grant: "影像集合还没共享给 AI System 6。在「选择器」里共享后再读。",
      wensi_photos_failed: "这一次没能读出影像集合。",
      wensi_photos_rolls: "卷",
      wensi_photos_in_roll: "卷",
      wensi_photos_drop: "把照片拖到这里，或",
      wensi_photos_pick: "选照片…",
      wensi_photos_pick_unavailable: "这个桌面版本没有文件选择器。",
      wensi_photos_drop_loose: "先进散页，回头再归叠",
      wensi_photos_into: "放进",
      wensi_photos_loose: "还没归叠",
      wensi_photos_select: "选进下一卷",
      wensi_photos_selected: "已选 {n} 帧",
      wensi_photos_move_to: "归到别的叠",
      wensi_photos_new_stack: "新的一叠叫什么（英文或拼音会变成网址）",
      wensi_photos_new_stack_go: "新建叠",
      wensi_photos_roll_cap: "这一卷的一句话（可选）",
      wensi_photos_roll_keep: "按现在的归叠",
      wensi_photos_roll_go: "编成一卷",
      wensi_photos_importing: "正在把照片放进站点…",
      wensi_photos_not_pictures: "拖进来的不是照片（认 jpg、png、gif、webp）。",
      wensi_photos_too_large: "超过 12 MiB，放不进来",
      wensi_only_collections: "这个站点只有集合类型（影像）。在右边的「影像」里读写与编排。",
      wensi_mode_upkeep: "维护",
      wensi_mode_ledger: "账本",
      wensi_upkeep_demo: "演示站点没有例行任务。",
      wensi_upkeep_busy: "处理中…",
      wensi_upkeep_load: "读维护状态",
      wensi_upkeep_sync: "语料同步",
      wensi_upkeep_sync_undeclared: "站点描述里没有登记同步命令。",
      wensi_upkeep_sync_running: "从 {t} 开始跑。",
      wensi_upkeep_sync_go: "现在同步",
      wensi_upkeep_sync_done: "已结束：语料新增 {n} 行。",
      wensi_upkeep_stop: "停止",
      wensi_upkeep_contacts: "联络人",
      wensi_contacts_load: "读名单",
      wensi_contacts_conversations: "个会话",
      wensi_contacts_senders: "个人",
      wensi_contacts_sender_list: "默认发言人（群用）",
      wensi_contacts_group: "群",
      wensi_contacts_people: "人",
      wensi_contacts_save: "保存名单",
      wensi_longform_go: "起草长文",
      wensi_longform_tags: "标签",
      wensi_longform_related: "互链日更",
      wensi_longform_accept: "写成长文",
      wensi_rescan_snapshot: "先做快照",
      wensi_rescan_rewrite: "改写",
      wensi_rescan_compare: "原文 / 改写",
      wensi_rescan_apply: "批准写入",
      wensi_rescan_written: "已写入",
      wensi_menu_need_article: "先选一篇稿子，或者新建一篇。",
      wensi_menu_refreshed: "文章库已重新读过。",
      wensi_menu_sync_hint: "同步在「维护」里由按钮启动，菜单不会直接开一个跑很久的任务。",
      wensi_upkeep_draft: "起草这一段",
      wensi_upkeep_plan: "算一下计划",
      wensi_upkeep_days: "天",
      wensi_upkeep_missing: "还没有稿",
      wensi_upkeep_models: "模型",
      wensi_upkeep_cap: "上限",
      wensi_upkeep_draft_go: "起草",
      wensi_upkeep_drafting: "起草中…",
      wensi_upkeep_draft_why: "按站点登记的通道跑一轮模型；不点「存成草稿」就不写文件。",
      wensi_upkeep_channel: "通道",
      wensi_draft_receipt: "回答的是",
      wensi_draft_accept: "存成草稿",
      wensi_upkeep_longform: "用这几篇写长文",
      wensi_upkeep_longform_posts: "日更文件名，用逗号分开",
      wensi_upkeep_rescan: "回扫一个月",
      wensi_upkeep_rescan_go: "生成核对包",
      wensi_ledger_demo: "演示站点没有账本。",
      wensi_ledger_busy: "读取中…",
      wensi_ledger_load: "读账本",
      wensi_ledger_pending: "待定",
      wensi_ledger_hit: "应验",
      wensi_ledger_miss: "落空",
      wensi_ledger_errors: "{n} 条读不出来，已列成错误，没有丢弃。",
      wensi_ledger_due: "到期",
      wensi_ledger_settle: "记账",
      wensi_ledger_empty: "这个站点还没有任何预测。",
      wensi_mode_tags: "标签",
      wensi_tags_hint: "把旧标签改成新名字，或并进已有标签。旧网址会自动补一条跳转。",
      wensi_tags_none: "这个站点的标签表还没读出来。",
      wensi_tags_from: "旧标签",
      wensi_tags_to: "新标签",
      wensi_tags_plan: "看会影响哪些稿子",
      wensi_tags_apply: "改这些稿子",
      wensi_tags_apply_table: "只改标签表",
      wensi_tags_merge: "（并入已有标签）",
      wensi_tags_articles: "篇投稿会改",
      wensi_tags_working: "处理中…",
      wensi_tags_done: "已改完",
      wensi_tags_applied_note: "已经写进稿件与标签表。",
      wensi_tags_need_both: "旧标签和新标签都要填。",
      wensi_tags_plan_first: "先看一眼会影响哪些稿子，再改。",
      wensi_view_modes_label: "写、预览或对照",
      wensi_view_write: "写",
      wensi_view_preview: "预览",
      wensi_view_split: "对照",
      wensi_preview_title: "预览：上线后的样子",
      wensi_preview_note: "和线上同一份样式与渲染规则。",
      wensi_preview_pending: "正在生成预览…",
      wensi_preview_failed: "这一次没能生成预览。",
      wensi_preview_demo: "演示站点没有可以套用的站点样式；这里显示的是桌面自己的排版。",
      wensi_items: "篇",
      wensi_demo_badge: "演示",
      wensi_demo_hint: "服务端暂时不可达，当前是内置演示站。",
      wensi_url_label: "网址",
      wensi_add_tag: "添加标签…",
      wensi_new_tag_hint: "新标签——站点清单里还没有它",
      wensi_readonly_hint: "由站点维护，保存时会丢弃改动",
      wensi_opaque_hint: "由服务端保管，这里只读",
      wensi_storage_unsupported: "这一类内容本期还不能在编辑器里管理（服务端已明确拒绝）。",
      wensi_no_articles: "这里还没有文章",
      wensi_public_read_only: "公开版只展示演示文章，不能保存、发布或同步。",
      wensi_publish_micropub_post: "Micropub 发布请求",
      wensi_publish_token: "Micropub token",
      wensi_publish_token_save: "存 token",
      wensi_publish_token_hint: "token 只进钥匙串，不写进站点描述。",
      wensi_publish_token_delete: "删除钥匙串里的 token",
      wensi_publish_token_deleted: "钥匙串里的 token 已删除。",
      wensi_suggest_ask: "建议字段",
      wensi_suggest_held: "先挂着。点过才写进这篇草稿。",
      wensi_suggest_accept: "写入这些字段",
      wensi_send_review: "送审阅台",
      wensi_menu_suggest: "建议字段",
      wensi_menu_review: "审阅台",
      wensi_publish_media_choose: "选择图片…",
      wensi_publish_media_too_big: "这张图片超过 8 MB，没有上传。",
      wensi_publish_media_failed: "图片已上传，但站点没有返回网址。",
      wensi_publish_media_done: "图片已上传，网址已写入正文。",
      wensi_add_site_title: "添加站点",
      wensi_add_site_offline: "添加站点需要本地服务端；离线演示不创建站点。",
      wensi_add_site_id: "站点 id（小写字母、数字、连字符）",
      wensi_add_site_label: "界面显示名",
      wensi_add_site_kind: "从哪种站点开始",
      wensi_add_site_hexo: "Hexo",
      wensi_add_site_micropub: "Micropub（含 Micro.blog）",
      wensi_add_site_root: "站点根目录（绝对路径）",
      wensi_add_site_url: "站点网址（可选）",
      wensi_add_site_endpoint: "Micropub 端点",
      wensi_add_site_token: "Micropub token（只进钥匙串）",
      wensi_add_site_content_label: "内容类型名称",
      wensi_add_site_storage: "存储目录",
      wensi_add_site_url_shape: "网址形状",
      wensi_add_site_tags: "标签表（可选，相对站点根）",
      wensi_add_site_media: "媒体目录（可选）",
      wensi_add_site_fields: "自定义字段（可选，JSON 数组）",
      wensi_add_site_fields_invalid: "自定义字段不是合法的 JSON。",
      wensi_add_site_slug_property: "slug 属性",
      wensi_add_site_add_type: "再加一个内容类型",
      wensi_add_site_type_id: "内容类型 id",
      wensi_add_site_type_label: "内容类型显示名",
      wensi_add_site_remove_type: "移除此类型",
      wensi_add_site_type_id_invalid: "内容类型 id 只能是小写字母、数字和连字符，而且不能和 posts 重复。",
      wensi_add_site_preview: "预览",
      wensi_add_site_create: "创建站点",
      wensi_add_site_close: "关闭",
      wensi_add_site_created: "站点已创建。",
      wensi_add_site_token_saved: "token 已存进钥匙串。",
      wensi_add_site_token_failed: "站点已创建，但 token 没存成：",
      wensi_add_site_grants: "目录授权",
      wensi_add_site_next: "下一步",
      wensi_add_site_validation: "站点描述还没通过校验：",
      wensi_draft_title: "新稿",
    },
  };
  const language = () => (typeof document !== "undefined" && String(document.documentElement?.lang || "").toLowerCase().startsWith("zh") ? "zh" : "en");

  const tr = (key, fallback) => {
    const local = LOCAL_STRINGS[language()]?.[key];
    if (local) return local;
    try {
      const value = typeof t === "function" ? t(key) : "";
      return value && value !== key ? value : fallback;
    } catch {
      return fallback;
    }
  };

  const trn = (key, fallback, vars) => tr(key, fallback).replace(/\{(\w+)\}/g, (_, name) => String(vars?.[name] ?? ""));

  const esc = (value) => String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const cloneJson = (value) => JSON.parse(JSON.stringify(value ?? null));

  // ---- Demo site (contract v1 shape; D8 groundwork) ------------------------
  // Readable sample posts, no lorem. The demo status rule mirrors aaronlau's
  // front-matter rule (held/review), so the studio exercises the same status
  // logic offline that the real sites use online.

  function demoSite() {
    return {
      schema: 1,
      id: "demo",
      label: "Demo",
      builtin: true,
      channel: { kind: "demo" },
      contentTypes: {
        daily: {
          label: "日更",
          storage: { kind: "file-per", dir: "/demo/posts", filename: "YYYY-MM-DD-slug.md" },
          fields: [
            { key: "title", type: "string", required: true, maxLength: 60 },
            { key: "date", type: "date", required: true, format: "YYYY-MM-DD" },
            { key: "slug", type: "slug", required: true },
            { key: "tags", type: "tags", optionsSource: "taxonomy.tags" },
            { key: "description", type: "string", maxLength: 80 },
            { key: "voice", type: "readonly" },
          ],
          url: { single: "/{year}/{month}/{day}/", multi: "/{year}/{month}/{day}/{slug}/", dedupe: "existing-and-redirects" },
          editor: "markdown",
          draftRule: { kind: "front-matter", keys: ["held", "review"] },
        },
        notes: {
          label: "笔记",
          storage: { kind: "file-per", dir: "/demo/notes", filename: "YYYY-MM-DD-slug.md" },
          fields: [
            { key: "title", type: "string", required: true, maxLength: 60 },
            { key: "date", type: "date", required: true, format: "YYYY-MM-DD" },
            { key: "slug", type: "slug", required: true },
            { key: "tags", type: "tags", optionsSource: "taxonomy.tags" },
            { key: "voice", type: "readonly" },
          ],
          url: { single: "/notes/{slug}/", multi: "/notes/{slug}/", dedupe: "existing-and-redirects" },
          editor: "markdown",
          draftRule: { kind: "front-matter", keys: ["held", "review"] },
        },
      },
      rulePackages: ["builtin-generic"],
      taxonomy: { tags: { source: "tags.json", renameRedirects: true }, categories: null, series: null },
      media: { dir: "/demo/photos", urlPrefix: "/photos/img/" },
      maintenance: ["drafting"],
    };
  }

  const DEMO_BODY_BACK_TO_LOCAL = [
    "把博客搬回本机的第一周，最大的感受不是速度，是安静。后台不再是一个陌生网站的管理面板，而是书桌上自己的一扇窗：文章就是文件夹里的 Markdown 文件，打开就能改，存盘就是发布的前半程。",
    "改动没有消失在数据库里。每一篇都躺在站点仓库里，git 记着谁在什么时候动了它；写错了一句，回退就是一个提交的事。属性面板是站点描述文件生成的——必填哪些、标签从哪来、网址怎么拼，全部写在一份 JSON 里，换一个站就换一份描述。",
    "这一周也定了几条规矩：草稿只写 front-matter 里的 held；改动没推之前，文章库会亮一个点；发布按钮在这套流程里最后才出现，先写、先存、先检查。",
  ].join("\n\n");

  const DEMO_BODY_SCHEDULED = [
    "静态站的定时发布，卡住的地方从来不是日历，而是重建。文章写好、日期设在未来，文件躺在仓库里——但站点不会自己醒来。Hexo 把 future 关掉，构建那天它才会出现；aaronlau.me 那边干脆没有定时重建，日期写未来就等于不发布。",
    "所以编辑器里「定时」这个字段要诚实：它能设定日期，不能承诺上线。承诺上线的是部署管道——每日构建，或者一次手动推送。把这两件事分开写进界面，比假装日历能魔法生效要老实得多。",
    "结论先记在这里：定时是一种约定，不是一种功能。约定要靠基础设施兑现。",
  ].join("\n\n");

  const DEMO_BODY_MEMO = [
    "给未来自己的三行备忘，写在便签上容易丢，写在这里刚刚好。",
    "一、改 slug 之前先想清楚网址：旧链接有人收藏，评论串挂在原路径上，改动要补 301。二、description 不超过八十个字，它是摘要不是开场白。三、新标签要想好再建，标签表一旦多起来，收拣的成本比建一个新站还高。",
    "就三行。多一行就不是备忘，是散文了。",
  ].join("\n\n");

  function createDemoStore(options = {}) {
    const readOnly = options.readOnly === true;
    const site = demoSite();
    const taxonomy = {
      tags: { canon: ["写作", "静态站", "本机优先", "网址规则"], alias: { "local-first": "本机优先" } },
      categories: [],
      series: [],
    };
    const articles = [
      {
        type: "daily",
        path: "/demo/posts/2026-11-05-back-to-local-first-week.md",
        filename: "2026-11-05-back-to-local-first-week.md",
        status: "published",
        date: "2026-11-05",
        title: "把博客搬回本机的第一周",
        slug: "back-to-local-first-week",
        tags: ["写作", "本机优先"],
        body: DEMO_BODY_BACK_TO_LOCAL,
        gitDirty: false,
        lastCommit: { hash: "a1b2c3d", date: "2026-11-05", subject: "发布：把博客搬回本机的第一周" },
      },
      {
        type: "daily",
        path: "/demo/posts/2026-11-07-why-scheduled-publishing-is-hard.md",
        filename: "2026-11-07-why-scheduled-publishing-is-hard.md",
        status: "draft",
        date: "2026-11-07",
        title: "定时发布为什么这么难",
        slug: "why-scheduled-publishing-is-hard",
        tags: ["静态站"],
        body: DEMO_BODY_SCHEDULED,
        gitDirty: false,
        lastCommit: null,
      },
      {
        type: "notes",
        path: "/demo/notes/2026-10-28-three-lines-to-future-me.md",
        filename: "2026-10-28-three-lines-to-future-me.md",
        status: "published",
        date: "2026-10-28",
        title: "写给未来自己的三行备忘",
        slug: "three-lines-to-future-me",
        tags: ["写作", "网址规则"],
        body: DEMO_BODY_MEMO,
        gitDirty: true,
        lastCommit: { hash: "e4f5a6b", date: "2026-10-28", subject: "发布：写给未来自己的三行备忘" },
      },
    ];
    // frontMatter is derived once so open/save round-trips like the server's.
    articles.forEach((article) => {
      article.frontMatter = {
        title: article.title,
        date: article.date,
        slug: article.slug,
        tags: [...(article.tags || [])],
        ...(article.type === "daily" ? { description: "", voice: "韩栖" } : { voice: "韩栖" }),
        ...(article.status === "draft" ? { held: true } : {}),
      };
    });

    function statusFromFrontMatter(typeId, frontMatter) {
      const keys = site.contentTypes[typeId]?.draftRule?.keys || [];
      return keys.some((key) => frontMatter?.[key]) ? "draft" : "published";
    }

    function listRow(article) {
      return {
        path: article.path,
        filename: article.filename,
        status: article.status,
        date: article.date,
        title: article.title,
        slug: article.slug,
        url: articleUrlPreview(site, article.type, article.frontMatter, [], article.path),
        updated: article.date,
        gitDirty: article.gitDirty,
        lastCommit: article.lastCommit ? cloneJson(article.lastCommit) : null,
        // The demo rows carry their content so front-end search covers the
        // body and tags without any sweep fetch.
        tags: [...(article.tags || [])],
        body: article.body,
        type: article.type,
      };
    }

    return {
      site,
      taxonomy: cloneJson(taxonomy),
      listArticles(typeId) {
        return articles.filter((article) => article.type === typeId).map(listRow);
      },
      loadArticle({ type, path }) {
        const article = articles.find((item) => item.type === type && item.path === path);
        if (!article) {
          const error = new Error(`demo article not found: ${path}`);
          error.code = "article_missing";
          throw error;
        }
        return cloneJson({
          type,
          path,
          filename: article.filename,
          status: article.status,
          frontMatter: article.frontMatter,
          body: article.body,
          url: articleUrlPreview(site, type, article.frontMatter, articles.filter((item) => item.path !== path), path),
          // The demo keeps voice server-side, like the route's opaque keys.
          opaqueKeys: ["voice"],
          git: { lastCommit: article.lastCommit, log: article.lastCommit ? [article.lastCommit] : [] },
        });
      },
      saveArticle({ type, path, frontMatter, body }) {
        // Public deployment: the demo articles stay readable, and nothing is
        // written even to memory. Name the refusal; a silent no-op looks like
        // a save that worked.
        if (readOnly) return { ok: false, code: "public_read_only", error: "公开版只展示演示文章，不能保存。" };
        const fields = site.contentTypes[type]?.fields || [];
        // Readonly and opaque keys belong to the site: the stored value wins,
        // and a contested change comes back as a warning, exactly like the
        // route's PUT.
        const merged = { ...frontMatter };
        fields.forEach((field) => {
          if (field.type === "readonly") delete merged[field.key];
        });
        delete merged.voice;
        const warnings = [];
        let article = articles.find((item) => item.type === type && item.path === path);
        if (!article) {
          const filename = newArticleFilename(site, type, merged);
          if (!filename) {
            const error = new Error("demo storage has no naming rule for this type");
            error.code = "storage_unsupported";
            throw error;
          }
          article = {
            type,
            path: `${site.contentTypes[type].storage.dir}/${filename}`,
            filename,
            status: "draft",
            date: String(merged.date || ""),
            title: String(merged.title || ""),
            slug: String(merged.slug || ""),
            tags: [],
            body: String(body || ""),
            gitDirty: true,
            lastCommit: null,
            frontMatter: {},
          };
          articles.push(article);
        }
        fields.forEach((field) => {
          if (field.type === "readonly" && frontMatter?.[field.key] != null && String(frontMatter[field.key]) !== String(article.frontMatter[field.key] ?? "")) {
            warnings.push(`${field.key} 以服务端现有值为准`);
          }
        });
        if (frontMatter?.voice != null && String(frontMatter.voice) !== String(article.frontMatter.voice ?? "")) {
          warnings.push(`voice 以服务端现有值为准`);
        }
        article.frontMatter = { ...merged, ...Object.fromEntries(Object.entries(article.frontMatter).filter(([key]) => key === "voice" || fields.find((field) => field.key === key)?.type === "readonly")) };
        article.body = String(body || "");
        article.title = String(article.frontMatter.title || "");
        article.date = String(article.frontMatter.date || "");
        article.slug = String(article.frontMatter.slug || "");
        article.tags = [...(Array.isArray(article.frontMatter.tags) ? article.frontMatter.tags : [])];
        article.status = statusFromFrontMatter(type, article.frontMatter);
        article.gitDirty = true;
        return cloneJson({ ok: true, path: article.path, warnings });
      },
    };
  }

  // The demo studio keeps one store per session; contracts build their own
  // fresh store through the public createDemoStore().
  const demoStore = createDemoStore();

  const demoClient = {
    listSites: async () => ({ sites: [cloneJson(demoStore.site)] }),
    listArticles: async (_siteId, typeId) => ({ type: typeId, articles: demoStore.listArticles(typeId) }),
    loadArticle: async (_siteId, query) => demoStore.loadArticle(query),
    saveArticle: async (_siteId, payload) => demoStore.saveArticle(payload),
    loadTaxonomy: async () => cloneJson(demoStore.taxonomy),
    // 演示站点没有发布通道，也没有站点的检查脚本：如实说没有，不假装干净。
    checkArticle: async () => ({ ok: false, code: "demo_only", findings: [], packages: [] }),
    previewArticle: async () => ({ ok: false, code: "demo_only", html: "" }),
    loadMedia: async () => ({ ok: false, code: "demo_only", files: [], summary: { files: 0, missingAlt: 0, unused: 0 } }),
    renameTag: async () => ({ ok: false, code: "demo_only", articles: [], counts: { articles: 0 } }),
    loadPhotos: async () => ({ ok: false, code: "demo_only", stacks: [], loose: [], rolls: [], summary: { stacks: 0, frames: 0 } }),
    updatePhotoFrame: async () => ({ ok: false, code: "demo_only" }),
    reorderPhotoStack: async () => ({ ok: false, code: "demo_only" }),
    previewCss: async () => "",
    publishPlan: async () => ({ ok: false, code: "demo_only", willRun: [], willWrite: [] }),
    publishPrepare: async () => ({ ok: false, code: "demo_only" }),
    publishDeploy: async () => ({ ok: false, code: "demo_only" }),
    listSiteTemplates: async () => ({ ok: false, code: "demo_only", templates: [] }),
    createSite: async () => ({ ok: false, code: "demo_only" }),
    saveMicropubToken: async () => ({ ok: false, code: "demo_only" }),
    micropubStatus: async () => ({ ok: false, code: "demo_only" }),
    async suggestFields(_siteId, payload) {
      const title = String(payload?.title || "");
      const words = title.toLowerCase().match(/[a-z0-9]+/g) || [];
      const slug = String(payload?.slug || "").trim() || words.join("-") || "draft";
      const cats = Array.isArray(payload?.cats) ? payload.cats : [];
      return {
        ok: true,
        held: true,
        suggestion: {
          slug,
          category: String(cats[0] || ""),
          series: String(payload?.series || ""),
          tags: Array.isArray(payload?.tags) ? payload.tags.map(String) : [],
          held: true,
        },
      };
    },
  };

  // Every mutating door in the demo client, blocked by name on a public page.
  // Reads stay: the demo articles are the public edition's content.
  const READ_ONLY_DEMO_METHODS = [
    "saveArticle", "renameTag", "updatePhotoFrame", "reorderPhotoStack",
    "importPhotos", "movePhotoFrame", "createPhotoStack", "createPhotoRoll",
    "routineSync", "draftAccept", "routineRescan", "saveContacts",
    "longformAccept", "rescanAction", "settlePrediction",
    "publishPlan", "publishPrepare", "publishDeploy", "createSite", "saveMicropubToken",
  ];
  const readOnlyDemoClient = (() => {
    const guarded = { ...demoClient };
    for (const name of READ_ONLY_DEMO_METHODS) {
      guarded[name] = async () => ({
        ok: false,
        code: "public_read_only",
        error: tr("wensi_public_read_only", "The public edition shows a demo library and cannot save, publish or sync."),
      });
    }
    return guarded;
  })();

  const remoteClient = {
    listSites: () => apiJson("/sites"),
    listArticles: (siteId, typeId) => apiJson(`/sites/${encodeURIComponent(siteId)}/articles?type=${encodeURIComponent(typeId)}`),
    loadArticle: (siteId, { type, path }) => apiJson(`/sites/${encodeURIComponent(siteId)}/article?type=${encodeURIComponent(type)}&path=${encodeURIComponent(path)}`),
    saveArticle: (siteId, payload) => apiJson(`/sites/${encodeURIComponent(siteId)}/article`, { method: "PUT", body: JSON.stringify(payload) }),
    loadTaxonomy: (siteId) => apiJson(`/sites/${encodeURIComponent(siteId)}/taxonomy`),
    checkArticle: (siteId, payload) => apiJson(`/sites/${encodeURIComponent(siteId)}/check`, { method: "POST", body: JSON.stringify(payload) }),
    loadMedia: (siteId) => apiJson(`/sites/${encodeURIComponent(siteId)}/media`),
    renameTag: (siteId, payload) => apiJson(`/sites/${encodeURIComponent(siteId)}/taxonomy/rename`, { method: "POST", body: JSON.stringify(payload) }),
    loadPhotos: (siteId) => apiJson(`/sites/${encodeURIComponent(siteId)}/photos`),
    updatePhotoFrame: (siteId, payload) => apiJson(`/sites/${encodeURIComponent(siteId)}/photos/update`, { method: "POST", body: JSON.stringify(payload) }),
    reorderPhotoStack: (siteId, payload) => apiJson(`/sites/${encodeURIComponent(siteId)}/photos/reorder`, { method: "POST", body: JSON.stringify(payload) }),
    importPhotos: (siteId, payload) => apiJson(`/sites/${encodeURIComponent(siteId)}/photos/import`, { method: "POST", body: JSON.stringify(payload) }),
    movePhotoFrame: (siteId, payload) => apiJson(`/sites/${encodeURIComponent(siteId)}/photos/move`, { method: "POST", body: JSON.stringify(payload) }),
    createPhotoStack: (siteId, payload) => apiJson(`/sites/${encodeURIComponent(siteId)}/photos/stack`, { method: "POST", body: JSON.stringify(payload) }),
    createPhotoRoll: (siteId, payload) => apiJson(`/sites/${encodeURIComponent(siteId)}/photos/roll`, { method: "POST", body: JSON.stringify(payload) }),
    // A frame's own bytes, for the grid. Same origin as the page, so this is a
    // plain URL rather than a fetch: the browser can cache and decode it.
    photoUrl: (siteId, file) => `${API}/sites/${encodeURIComponent(siteId)}/media/${encodeURIComponent(file)}`,
    loadRoutine: (siteId) => apiJson(`/sites/${encodeURIComponent(siteId)}/routine`),
    routineSync: (siteId, payload) => apiJson(`/sites/${encodeURIComponent(siteId)}/routine/sync`, { method: "POST", body: JSON.stringify(payload) }),
    routinePlan: (siteId, payload) => apiJson(`/sites/${encodeURIComponent(siteId)}/routine/plan`, { method: "POST", body: JSON.stringify(payload) }),
    draftRun: (siteId, payload) => apiJson(`/sites/${encodeURIComponent(siteId)}/draft/run`, { method: "POST", body: JSON.stringify(payload) }),
    draftAccept: (siteId, payload) => apiJson(`/sites/${encodeURIComponent(siteId)}/draft/accept`, { method: "POST", body: JSON.stringify(payload) }),
    routineRescan: (siteId, payload) => apiJson(`/sites/${encodeURIComponent(siteId)}/routine/rescan`, { method: "POST", body: JSON.stringify(payload) }),
    loadContacts: (siteId) => apiJson(`/sites/${encodeURIComponent(siteId)}/contacts`),
    saveContacts: (siteId, payload) => apiJson(`/sites/${encodeURIComponent(siteId)}/contacts`, { method: "POST", body: JSON.stringify(payload) }),
    longformRun: (siteId, payload) => apiJson(`/sites/${encodeURIComponent(siteId)}/longform`, { method: "POST", body: JSON.stringify({ ...payload, action: "run" }) }),
    longformAccept: (siteId, payload) => apiJson(`/sites/${encodeURIComponent(siteId)}/longform`, { method: "POST", body: JSON.stringify({ ...payload, action: "accept" }) }),
    rescanAction: (siteId, payload) => apiJson(`/sites/${encodeURIComponent(siteId)}/rescan`, { method: "POST", body: JSON.stringify(payload) }),
    loadPredictions: (siteId) => apiJson(`/sites/${encodeURIComponent(siteId)}/predictions`),
    settlePrediction: (siteId, payload) => apiJson(`/sites/${encodeURIComponent(siteId)}/predictions/settle`, { method: "POST", body: JSON.stringify(payload) }),
    previewArticle: (siteId, payload) => apiJson(`/sites/${encodeURIComponent(siteId)}/preview`, { method: "POST", body: JSON.stringify(payload) }),
    previewCss: async (siteId) => {
      const response = await fetch(`${API}/sites/${encodeURIComponent(siteId)}/preview.css`, { headers: { Accept: "text/css" } });
      return response.ok ? response.text() : "";
    },
    publishPlan: (siteId, payload) => apiJson(`/sites/${encodeURIComponent(siteId)}/publish`, { method: "POST", body: JSON.stringify({ ...payload, stage: "plan" }) }),
    publishPrepare: (siteId, payload) => apiJson(`/sites/${encodeURIComponent(siteId)}/publish`, { method: "POST", body: JSON.stringify({ ...payload, stage: "prepare" }) }),
    publishDeploy: (siteId, payload) => apiJson(`/sites/${encodeURIComponent(siteId)}/publish`, { method: "POST", body: JSON.stringify({ ...payload, stage: "deploy", confirm: "deploy" }) }),
    // 添加站点 (P7): the template list, the one write, and the token door.
    listSiteTemplates: () => apiJson("/sites/templates"),
    createSite: (payload) => apiJson("/sites", { method: "POST", body: JSON.stringify(payload) }),
    saveMicropubToken: (siteId, token) => apiJson(`/sites/${encodeURIComponent(siteId)}/micropub/token`, { method: "POST", body: JSON.stringify({ token }) }),
    deleteMicropubToken: (siteId) => apiJson(`/sites/${encodeURIComponent(siteId)}/micropub/token`, { method: "DELETE" }),
    uploadMicropubMedia: (siteId, file) => apiJson(`/sites/${encodeURIComponent(siteId)}/micropub/media`, { method: "POST", body: JSON.stringify(file) }),
    micropubStatus: (siteId) => apiJson(`/sites/${encodeURIComponent(siteId)}/micropub`),
    suggestFields: (siteId, payload) => apiJson(`/sites/${encodeURIComponent(siteId)}/suggest`, { method: "POST", body: JSON.stringify(payload || {}) }),
  };

  async function apiJson(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) },
      ...options,
    });
    if (!response.ok) {
      // Lane C's errors are { error, code }; the code drives the message, the
      // text goes to the note verbatim.
      let detail = `${response.status}`;
      let code = "";
      try {
        const body = await response.json();
        if (body?.error) detail = String(body.error);
        if (body?.code) code = String(body.code);
      } catch {
        // A non-JSON refusal (an old proxy, a 404 page) keeps the status text.
      }
      const error = new Error(`${API}${path}: ${detail}`);
      error.status = response.status;
      error.code = code;
      throw error;
    }
    return response.json();
  }

  // ---- Pure helpers (the contracts exercise these without a DOM) -----------

  function resolveSites(payload, options = {}) {
    // The public page never reads the remote list, even if a proxy answers it:
    // the route is absent by design, and the demo library is the only content.
    if (options.publicDeployment === true) return { sites: [demoSite()], demoMode: true, readOnly: true };
    const sites = (Array.isArray(payload?.sites) ? payload.sites : []).filter((site) =>
      site
      && typeof site.id === "string" && site.id
      && site.contentTypes && typeof site.contentTypes === "object"
      && Object.keys(site.contentTypes).length > 0
    );
    if (!sites.length) return { sites: [demoSite()], demoMode: true };
    return { sites, demoMode: false };
  }

  function articleCategory(row) {
    if (row?.category) return String(row.category);
    const list = row?.cats || row?.categories || row?.frontMatter?.cats || row?.frontMatter?.categories;
    return Array.isArray(list) && list.length ? String(list[0] || "") : "";
  }

  function filterArticles(articles, query, statusFilter = "all", categoryFilter = "") {
    const needle = String(query || "").trim().toLowerCase();
    const category = String(categoryFilter || "");
    return (articles || []).filter((row) => {
      if (category && articleCategory(row) !== category) return false;
      if (statusFilter === "draft" && !(row.status === "draft" || row.status === "unpublished")) return false;
      if (statusFilter === "published" && row.status !== "published") return false;
      if (statusFilter === "dirty" && row.gitDirty !== true) return false;
      if (!needle) return true;
      const haystack = [row.title, row.date, row.slug, ...(Array.isArray(row.tags) ? row.tags : [])]
        .map((value) => String(value || "").toLowerCase());
      if (typeof row.body === "string") haystack.push(row.body.toLowerCase());
      return haystack.some((value) => value.includes(needle));
    });
  }

  function requiredMissing(fields, frontMatter) {
    return (fields || [])
      .filter((field) => {
        if (field.required !== true) return false;
        const value = String(frontMatter?.[field.key] ?? "").trim();
        if (!value) return true;
        // 日期按站点声明的格式收：格式不对和空着一样上不了线。
        return field.type === "date" && (field.format || "YYYY-MM-DD") === "YYYY-MM-DD" && !/^\d{4}-\d{2}-\d{2}$/.test(value);
      })
      .map((field) => field.key);
  }

  // The URL rule decides single vs multi from the same-day count, exactly what
  // the description's `dedupe` intends for P1: one post that day collapses to
  // the slug-less address; two or more append the slug.
  function articleUrlPreview(site, typeId, frontMatter, articles = [], currentPath = "") {
    const url = site?.contentTypes?.[typeId]?.url;
    if (!url) return "";
    const date = String(frontMatter?.date || "");
    const slug = String(frontMatter?.slug || "");
    const sameDayOthers = (articles || []).some((row) => row.path !== currentPath && row.date === date);
    const pattern = sameDayOthers ? (url.multi || url.single) : (url.single || url.multi);
    return String(pattern)
      .replace("{year}", date.slice(0, 4))
      .replace("{month}", date.slice(5, 7))
      .replace("{day}", date.slice(8, 10))
      .replace("{slug}", slug);
  }

  // "file-per" and draft-dir filename rules: YYYY-MM-DD-slug.md is the
  // convention the built-in sites and the demo share. Tokens first, then the
  // bare word. Draft-dir types (appscope's source/_drafts) name files the
  // same way; the draft PATH itself is an opaque string the client passes
  // back verbatim.
  function freshDraftPath(site, typeId) {
    const rule = site?.contentTypes?.[typeId]?.draftRule;
    const stamp = Date.now().toString(36);
    if (rule?.kind === "draft-dir") return `drafts/untitled-${stamp}.md`;
    return newArticleFilename(site, typeId, { date: todayStamp(), slug: `untitled-${stamp}` });
  }

  function newArticleFilename(site, typeId, frontMatter) {
    const storage = site?.contentTypes?.[typeId]?.storage;
    if (!storage || (storage.kind !== "file-per" && storage.kind !== "draft-dir")) return "";
    const pattern = String(storage.filename || "YYYY-MM-DD-slug.md");
    const date = String(frontMatter?.date || todayStamp());
    const slug = String(frontMatter?.slug || "").trim() || "untitled";
    return pattern
      .replace("YYYY-MM-DD", date)
      .replace("slug", slug)
      .replace("YYYY", date.slice(0, 4))
      .replace("MM", date.slice(5, 7))
      .replace("DD", date.slice(8, 10));
  }

  // The auto-save scheduler: every pause of `delay` ms after the last touch
  // fires exactly one save. Contracts inject their own schedule/cancel so the
  // debounce runs under a fake clock.
  function createSaveScheduler({ delay = AUTOSAVE_DELAY_MS, save, schedule = (fn, ms) => setTimeout(fn, ms), cancel = (id) => clearTimeout(id) } = {}) {
    let timer = 0;
    let pending = false;
    function touch() {
      pending = true;
      if (timer) cancel(timer);
      timer = schedule(() => {
        timer = 0;
        pending = false;
        if (typeof save === "function") save();
      }, delay);
      return pending;
    }
    function flush() {
      if (timer) {
        cancel(timer);
        timer = 0;
      }
      pending = false;
      return typeof save === "function" ? save() : Promise.resolve();
    }
    function isPending() {
      return pending;
    }
    function dispose() {
      if (timer) cancel(timer);
      timer = 0;
      pending = false;
    }
    return { touch, flush, isPending, dispose };
  }

  function todayStamp() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  function clockStamp() {
    try {
      return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  }

  // ---- State ---------------------------------------------------------------

  const state = {
    sites: [],
    demoMode: false,
    // Public deployment: the demo library is shown read-only (D8). Local
    // offline demo stays editable in memory.
    readOnly: false,
    siteId: "",
    typeId: "",
    // typeId -> array of list rows (null = that type failed to list).
    articlesByType: new Map(),
    taxonomy: null,
    query: "",
    statusFilter: "all",
    categoryFilter: "",
    selected: null, // { type, path }
    draft: null,    // { type, path, frontMatter, body, url, isNew, git }
    dirty: false,
    saveState: "idle", // idle | dirty | saving | saved | error
    savedAt: "",
    saveError: "",
    saveWarning: "",
    booted: false,
    // 属性 / 检查 two faces of the right column. Checks are a run, not a view:
    // they belong to the draft they judged, so the result keeps that draft's
    // key and a stale run is never shown against another article.
    inspectorMode: "fields", // fields | check
    checkRun: null,          // { key, findings, summary, packages, error }
    checking: false,
    publish: null,           // { stage, plan, prepare, deploy, error, busy }
    // 写 / 预览 / 对照. The preview is the site's own renderer and stylesheet,
    // drawn in a frame so the site's CSS never reaches the desk's own surfaces.
    viewMode: "write",       // write | preview | split
    matterView: "form",     // form | source, on the properties face
    preview: null,           // { key, html, css, error, at }
    // The media library is site-wide, not article-wide: its own face, its own
    // run, kept per site so switching sites never shows one site's images.
    mediaRun: null,          // { siteId, files, summary, error, at }
    mediaBusy: false,
    // 标签: a rename is a plan first, then a confirm. The plan stays on screen
    // with the exact article list until the writer accepts it.
    renamePlan: null,        // { siteId, from, to, articles, merge, error, applied }
    renameBusy: false,
    photoRun: null,          // { siteId, media, stacks, loose, rolls, summary, error, at }
    photoBusy: false,
    // Which frames the writer has ticked for the next roll, and the one line
    // that says what the last import or roll did.
    photoSelection: [],
    photoNote: "",
    // Where a drop lands: "" means the frames arrive loose.
    photoDropStack: "",
    // 例行维护 (P5 skeleton): the sync run, the plans it can compute, and the
    // one line that says what the last action did.
    routineRun: null,        // { siteId, status, declared, corpus, run, note }
    routineBusy: false,
    routineNote: "",
    routinePlan: null,       // { kind, ...result }
    draftRun: null,          // { siteId, candidates, receipt, plan, ... }
    draftBusy: false,
    rescanRun: null,         // { siteId, month, files, output, note }
    // 联络人: which conversations and people feed the corpus.
    contactsRun: null,       // { siteId, qq, summary, note, file }
    contactsBusy: false,
    contactsNote: "",
    // 长文: one candidate, written into the longform folder only on its own click.
    longformRun: null,       // { siteId, candidate, receipt, note }
    longformBusy: false,
    // 回扫: the month's posts, one candidate at a time, and the rollback point.
    rescanRewrite: null,     // { siteId, file, before, after, findings, ... }
    rescanSnapshot: null,    // { kind, where, files, note }
    rescanBusy: false,
    rescanDirNote: "",
    // 预言账本: every prediction the site carries, and its verdicts.
    ledgerRun: null,         // { siteId, entries, summary, errors, note }
    ledgerBusy: false,
    ledgerNote: "",
  };
  let bootPromise = null;
  let openToken = 0;
  let sweepToken = 0;

  /**
   * Drop every carried-over result and note. Called when the site changes and
   * when a plan is recomputed: a candidate belongs to the inputs that produced
   * it, and a note belongs to the site it was about.
   */
  function resetCarriedResults() {
    state.draftRun = null;
    state.longformRun = null;
    state.rescanRewrite = null;
    state.rescanSnapshot = null;
    state.rescanDirNote = "";
    state.routineNote = "";
    state.routinePlan = null;
    state.contactsRun = null;
    state.contactsNote = "";
    state.photoNote = "";
    state.ledgerNote = "";
  }

  function currentSite() {
    return state.sites.find((site) => site.id === state.siteId) || null;
  }

  function currentType() {
    const site = currentSite();
    return site?.contentTypes?.[state.typeId] || null;
  }

  function client() {
    if (!state.demoMode) return remoteClient;
    return state.readOnly ? readOnlyDemoClient : demoClient;
  }

  function flattenedArticles() {
    const rows = [];
    state.articlesByType.forEach((list) => {
      if (!Array.isArray(list)) return;
      list.forEach((row) => rows.push(row));
    });
    return rows;
  }

  // ---- DOM -----------------------------------------------------------------

  function winEl() {
    if (typeof document === "undefined") return null;
    return document.querySelector(`[data-window="${WINDOW_NAME}"]`);
  }

  let dom = null;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function statusLabel(status) {
    if (status === "published") return tr("wensi_status_published", "Published");
    if (status === "unpublished") return tr("wensi_status_unpublished", "Unpublished");
    return tr("wensi_status_draft", "Draft");
  }

  function typeOptions() {
    const site = currentSite();
    if (!site) return [];
    // A json-collection type has no article list: it is one collection file with
    // its own face (影像). Listing it here as an empty group would be a lie, and
    // listing it as an error would be noise, so the article library leaves it
    // to that face.
    return Object.keys(site.contentTypes).filter((typeId) => site.contentTypes[typeId]?.storage?.kind !== "json-collection");
  }

  function optionsFor(field) {
    const source = String(field?.optionsSource || "");
    if (source === "taxonomy.tags") {
      const canon = state.taxonomy?.tags?.canon;
      return Array.isArray(canon) ? canon.map(String) : [];
    }
    return [];
  }

  function currentTags() {
    const tags = state.draft?.frontMatter?.tags;
    return Array.isArray(tags) ? tags.map(String) : [];
  }

  function setWindowTitle(title) {
    const heading = winEl()?.querySelector(".title-bar h2");
    if (heading) heading.textContent = title;
  }

  // The 专注 button rides lane A's focus-mode interface when it lands; until
  // then the desk's own writing-focus cycle answers, and the button hides when
  // neither exists (a bare textarea keeps its dignity).
  function focusModeTarget() {
    return dom?.textarea || null;
  }

  function focusModeAvailable() {
    const textarea = focusModeTarget();
    if (!textarea) return false;
    return typeof window.AISystem6WritingEditor?.cycleFocusMode === "function"
      || typeof window.AISystem6WritingFocus?.cycle === "function"
      || typeof window.mdeCycleFocusMode === "function";
  }

  function cycleFocusMode() {
    const textarea = focusModeTarget();
    if (!textarea) return false;
    const laneInterface = window.AISystem6WritingEditor?.cycleFocusMode || window.AISystem6WritingFocus?.cycle;
    let turned = false;
    if (typeof laneInterface === "function") {
      laneInterface(textarea);
      turned = true;
    } else if (typeof window.mdeCycleFocusMode === "function") {
      window.mdeCycleFocusMode(textarea);
      turned = true;
    }
    if (turned) paintFocusButton();
    return turned;
  }

  function currentFocusMode() {
    return focusModeTarget()?.closest(".mde-surface")?.dataset.mdeFocusMode || "off";
  }

  function paintFocusButton() {
    const button = dom?.focusButton;
    if (!button) return;
    const mode = currentFocusMode();
    button.textContent = mode === "sentence"
      ? tr("wensi_focus_sentence", "Focus: sentence")
      : mode === "typewriter"
        ? tr("wensi_focus_typewriter", "Focus: typewriter")
        : tr("wensi_focus_mode", "Focus");
    button.title = tr("wensi_focus_hint", "Sentence focus dims the rest and keeps the caret centered. Turn it off while revising, so a selection does not fight the centering.");
    button.setAttribute("aria-pressed", mode === "off" ? "false" : "true");
  }

  function frontMatterSourceText(frontMatter) {
    const lines = ["---"];
    Object.entries(frontMatter || {}).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        lines.push(`${key}:`);
        value.forEach((item) => lines.push(`  - ${item ?? ""}`));
      } else if (value && typeof value === "object") {
        lines.push(`${key}: ${JSON.stringify(value)}`);
      } else {
        lines.push(`${key}: ${value ?? ""}`);
      }
    });
    lines.push("---");
    return lines.join("\n");
  }

  function bodyCount(text) {
    if (typeof countTextWords === "function") return countTextWords(text);
    return String(text || "").replace(/\s+/g, "").length;
  }

  function installWindow() {
    const win = winEl();
    if (!win) return null;
    installMenus();
    if (win.dataset.wensiInstalled === "true") return win;
    win.dataset.wensiInstalled = "true";
    const pane = win.querySelector(".wensi-quanyong-pane");
    if (!pane) return win;
    pane.replaceChildren();

    const library = el("nav", "wensi-library");
    library.setAttribute("aria-label", tr("wensi_library_label", "Article library"));
    const libraryHead = el("div", "wensi-library-head");
    const siteMark = el("span", "wensi-site-mark", "—");
    siteMark.dataset.wensiSiteMark = "true";
    siteMark.setAttribute("aria-hidden", "true");
    const siteSelect = el("select", "wensi-site-select");
    siteSelect.dataset.wensiSites = "true";
    siteSelect.setAttribute("aria-label", tr("wensi_sites_label", "Site"));
    const siteCount = el("span", "wensi-site-count");
    siteCount.dataset.wensiSiteCount = "true";
    libraryHead.append(siteMark, siteSelect, siteCount);
    library.append(libraryHead);
    const search = el("input", "wensi-search");
    search.type = "search";
    search.dataset.wensiSearch = "true";
    search.placeholder = tr("wensi_search_placeholder", "Search titles, text or tags");
    search.setAttribute("aria-label", tr("wensi_search_label", "Search"));
    library.append(search);
    const newButton = el("button", "wensi-new-row", tr("wensi_new_draft", "New draft"));
    newButton.type = "button";
    newButton.dataset.wensiNew = "true";
    const newKey = el("span", "wensi-key", "⌘N");
    newKey.setAttribute("aria-hidden", "true");
    newButton.append(newKey);
    library.append(newButton);
    const filters = el("div", "wensi-filters");
    filters.setAttribute("role", "group");
    filters.setAttribute("aria-label", tr("wensi_status_filter", "Status filter"));
    STATUS_FILTERS.forEach((filter) => {
      const button = el("button", "wensi-filter");
      button.type = "button";
      button.dataset.wensiFilter = filter;
      button.setAttribute("aria-pressed", state.statusFilter === filter ? "true" : "false");
      const name = el("span", "wensi-filter-name", tr(`wensi_filter_${filter}`, filter));
      const count = el("span", "wensi-filter-count", "0");
      count.dataset.wensiFilterCount = filter;
      button.append(name, count);
      filters.append(button);
    });
    library.append(filters);
    const categories = el("div", "wensi-categories");
    categories.dataset.wensiCategories = "true";
    categories.setAttribute("role", "group");
    categories.setAttribute("aria-label", tr("wensi_category_all", "All categories"));
    library.append(categories);
    const list = el("div", "wensi-list");
    list.dataset.wensiList = "true";
    library.append(list);

    const writing = el("section", "wensi-writing");
    writing.dataset.empty = "true";
    const writingHead = el("header", "wensi-writing-head");
    // 写 / 预览 / 对照. A segment, not three toggles: exactly one is on.
    const viewModes = el("div", "wensi-view-modes");
    viewModes.dataset.wensiViewModes = "true";
    viewModes.setAttribute("role", "group");
    viewModes.setAttribute("aria-label", tr("wensi_view_modes_label", "Write, preview, or both"));
    for (const [mode, label] of [
      ["write", tr("wensi_view_write", "Write")],
      ["preview", tr("wensi_view_preview", "Preview")],
      ["split", tr("wensi_view_split", "Side by side")],
    ]) {
      const button = el("button", "", label);
      button.type = "button";
      button.dataset.wensiViewMode = mode;
      button.setAttribute("aria-pressed", mode === state.viewMode ? "true" : "false");
      viewModes.append(button);
    }
    writingHead.append(viewModes);
    const focusButton = el("button", "wensi-focus", tr("wensi_focus_mode", "Focus"));
    focusButton.type = "button";
    focusButton.dataset.wensiFocus = "true";
    focusButton.hidden = true;
    writingHead.append(focusButton);
    writing.append(writingHead);
    const matterLine = el("p", "wensi-matter-line");
    matterLine.dataset.wensiMatterLine = "true";
    matterLine.hidden = true;
    const editorHost = el("div", "wensi-editor-host");
    editorHost.append(matterLine);
    const textarea = el("textarea", "wensi-body");
    textarea.id = "wensi-body";
    textarea.spellcheck = false;
    textarea.dataset.wensiBody = "true";
    textarea.placeholder = tr("wensi_editor_placeholder", "Write here. The pause saves.");
    textarea.setAttribute("aria-label", tr("wensi_editor_label", "Body"));
    editorHost.append(textarea);
    writing.append(editorHost);
    const previewPane = el("section", "wensi-preview");
    previewPane.dataset.wensiPreview = "true";
    previewPane.hidden = true;
    const previewFrame = el("iframe", "wensi-preview-frame");
    previewFrame.dataset.wensiPreviewFrame = "true";
    // No scripts run in the preview. same-origin lets the editor scroll stay aligned with the page.
    previewFrame.setAttribute("sandbox", "allow-same-origin");
    previewFrame.setAttribute("title", tr("wensi_preview_title", "Preview of the published page"));
    const previewNote = el("p", "wensi-preview-note");
    previewNote.dataset.wensiPreviewNote = "true";
    previewPane.append(previewNote, previewFrame);
    writing.append(previewPane);
    const statusBar = el("footer", "wensi-statusbar");
    statusBar.dataset.wensiStatusbar = "true";
    const wordStat = el("span", "wensi-stat");
    wordStat.dataset.wensiWords = "true";
    const urlLabel = el("span", "wensi-article-url");
    urlLabel.dataset.wensiUrl = "true";
    urlLabel.title = tr("wensi_url_label", "Address");
    const saveStat = el("span", "wensi-stat wensi-stat-end");
    saveStat.dataset.wensiLocal = "true";
    statusBar.append(wordStat, urlLabel, saveStat);
    writing.append(statusBar);
    const emptyNote = el("div", "wensi-empty", tr("wensi_empty_hint", "Pick an article on the left, or start a new draft."));
    emptyNote.dataset.wensiEmpty = "true";
    writing.append(emptyNote);

    const inspector = el("aside", "wensi-inspector");
    const inspectorHead = el("header", "wensi-inspector-head");
    const typeLabel = el("h3", "wensi-type-label");
    typeLabel.dataset.wensiTypeLabel = "true";
    inspectorHead.append(typeLabel);
    const matterModes = el("div", "wensi-matter-modes");
    matterModes.dataset.wensiMatterModes = "true";
    matterModes.setAttribute("role", "group");
    matterModes.setAttribute("aria-label", tr("wensi_matter_form", "Form"));
    for (const [mode, label] of [
      ["form", tr("wensi_matter_form", "Form")],
      ["source", tr("wensi_matter_source", "Source")],
    ]) {
      const button = el("button", "", label);
      button.type = "button";
      button.dataset.wensiMatter = mode;
      button.setAttribute("aria-pressed", mode === "form" ? "true" : "false");
      matterModes.append(button);
    }
    const saveNote = el("span", "wensi-save-note");
    saveNote.dataset.wensiSaveNote = "true";
    inspectorHead.append(saveNote);
    inspectorHead.append(matterModes);
    inspector.append(inspectorHead);
    const inspectorModes = el("div", "wensi-inspector-modes");
    inspectorModes.dataset.wensiInspectorModes = "true";
    inspectorModes.hidden = true;
    inspectorModes.setAttribute("role", "group");
    inspectorModes.setAttribute("aria-label", tr("wensi_inspector_modes_label", "Properties or checks"));
    for (const [mode, label] of [
      ["fields", tr("wensi_mode_fields", "Properties")],
      ["check", tr("wensi_mode_check", "Checks")],
      ["media", tr("wensi_mode_media", "Media")],
      ["tags", tr("wensi_mode_tags", "Tags")],
      ["photos", tr("wensi_mode_photos", "Photos")],
      ["upkeep", tr("wensi_mode_upkeep", "Upkeep")],
      ["ledger", tr("wensi_mode_ledger", "Ledger")],
    ]) {
      const button = el("button", "", label);
      button.type = "button";
      button.dataset.wensiInspectorMode = mode;
      button.setAttribute("aria-pressed", mode === state.inspectorMode ? "true" : "false");
      inspectorModes.append(button);
    }
    inspector.append(inspectorModes);
    const fields = el("div", "wensi-fields");
    fields.dataset.wensiFields = "true";
    inspector.append(fields);
    const requiredHint = el("p", "wensi-required-hint");
    requiredHint.dataset.wensiRequired = "true";
    requiredHint.hidden = true;
    inspector.append(requiredHint);

    const shell = el("div", "wensi-shell");
    shell.append(library, writing, inspector);
    pane.append(shell);

    dom = { shell, library, siteSelect, siteMark, siteCount, filters, categories, search, list, writing, urlLabel, wordStat, saveStat, matterLine, focusButton, viewModes, matterModes, previewPane, previewFrame, previewNote, textarea, editorHost, emptyNote, inspector, inspectorModes, typeLabel, saveNote, fields, requiredHint };
    wireEvents(win);
    // Lane A's front-matter mirror rides the shared overlay; the option is
    // accepted even before that half lands (the current signature ignores it).
    if (typeof window.attachMarkdownHighlight === "function") {
      try {
        window.attachMarkdownHighlight(textarea, { frontMatter: true });
      } catch {
        // A refusing highlighter degrades to the plain textarea, never to a
        // broken window.
      }
    }
    renderAll();
    return win;
  }

  function wireEvents(win) {
    dom.siteSelect.addEventListener("change", (event) => {
      resetCarriedResults();
      void selectSite(event.target.value);
    });
    dom.filters.addEventListener("click", (event) => {
      const button = event.target.closest("[data-wensi-filter]");
      if (!button) return;
      state.statusFilter = button.dataset.wensiFilter;
      renderFilters();
      renderList();
    });
    dom.categories.addEventListener("click", (event) => {
      const button = event.target.closest("[data-wensi-category]");
      if (!button) return;
      state.categoryFilter = button.dataset.wensiCategory || "";
      renderCategories();
      renderList();
    });
    dom.search.addEventListener("input", (event) => {
      state.query = event.target.value;
      renderList();
      sweepBodies();
    });
    dom.list.addEventListener("click", (event) => {
      const row = event.target.closest("[data-wensi-path]");
      if (!row) return;
      void openArticle(row.dataset.wensiType, row.dataset.wensiPath);
    });
    libraryButton(win, "[data-wensi-new]").addEventListener("click", () => {
      void newDraft();
    });
    dom.viewModes.addEventListener("click", (event) => {
      const button = event.target.closest("[data-wensi-view-mode]");
      if (!button) return;
      setViewMode(button.dataset.wensiViewMode);
    });
    dom.matterModes.addEventListener("click", (event) => {
      const button = event.target.closest("[data-wensi-matter]");
      if (!button) return;
      state.matterView = button.dataset.wensiMatter === "source" ? "source" : "form";
      state.inspectorMode = "fields";
      renderInspector();
    });

    dom.inspectorModes.addEventListener("click", (event) => {
      const button = event.target.closest("[data-wensi-inspector-mode]");
      if (!button) return;
      showFace(button.dataset.wensiInspectorMode);
    });

    dom.fields.addEventListener("click", (event) => {
      if (event.target.closest("[data-wensi-check-run]")) { void runCheck(); return; }
      if (event.target.closest("[data-wensi-media-scan]")) { void scanMedia(); return; }
      if (event.target.closest("[data-wensi-photos-load]")) { void loadPhotos(); return; }
      if (event.target.closest("[data-wensi-photos-pick]")) { pickPhotoFiles(); return; }
      if (event.target.closest("[data-wensi-stack-create]")) { void createStackInline(event.target.closest("[data-wensi-stack-create]")); return; }
      if (event.target.closest("[data-wensi-roll-go]")) { void createRollFromSelection(event.target.closest("[data-wensi-roll-go]")); return; }
      if (event.target.closest("[data-wensi-routine-load]")) { void loadRoutine(); return; }
      if (event.target.closest("[data-wensi-routine-sync]")) { void runRoutineSync("start"); return; }
      if (event.target.closest("[data-wensi-routine-stop]")) { void runRoutineSync("stop"); return; }
      if (event.target.closest("[data-wensi-routine-draft]")) { void planRoutine("draft"); return; }
      if (event.target.closest("[data-wensi-routine-longform]")) { void planRoutine("longform"); return; }
      if (event.target.closest("[data-wensi-routine-rescan]")) { void planRoutine("rescan"); return; }
      if (event.target.closest("[data-wensi-draft-run]")) { void runDraftNow(); return; }
      if (event.target.closest("[data-wensi-draft-accept]")) { void acceptDraft(event.target.closest("[data-wensi-draft-accept]")); return; }
      if (event.target.closest("[data-wensi-rescan-run]")) { void runRescanNow(); return; }
      if (event.target.closest("[data-wensi-contacts-load]")) { void loadContactsNow(); return; }
      if (event.target.closest("[data-wensi-contacts-save]")) { void saveContactsNow(); return; }
      if (event.target.closest("[data-wensi-longform-run]")) { void runLongformNow(); return; }
      if (event.target.closest("[data-wensi-longform-accept]")) { void acceptLongformNow(); return; }
      if (event.target.closest("[data-wensi-rescan-snapshot]")) { void snapshotRescan(); return; }
      if (event.target.closest("[data-wensi-rescan-rewrite]")) { void rewriteOne(event.target.closest("[data-wensi-rescan-rewrite]")); return; }
      if (event.target.closest("[data-wensi-rescan-apply]")) { void applyRewriteNow(); return; }
      if (event.target.closest("[data-wensi-ledger-load]")) { void loadLedger(); return; }
      if (event.target.closest("[data-wensi-prediction-settle]")) { void settleFromButton(event.target.closest("[data-wensi-prediction-settle]")); return; }
      const tick = event.target.closest("[data-wensi-photo-select]");
      if (tick) {
        const id = tick.dataset.wensiPhotoSelect;
        state.photoSelection = tick.checked
          ? [...new Set([...state.photoSelection, id])]
          : state.photoSelection.filter((entry) => entry !== id);
        renderInspector();
        return;
      }
      if (event.target.closest("[data-wensi-frame-save]")) { void saveFrameWords(event.target.closest("[data-wensi-frame-save]")); return; }
      if (event.target.closest("[data-wensi-frame-move]")) { void moveFrame(event.target.closest("[data-wensi-frame-move]")); return; }
      if (event.target.closest("[data-wensi-rename-plan]")) { void runRename(false); return; }
      if (event.target.closest("[data-wensi-rename-apply]")) { void runRename(true); return; }
      if (event.target.closest("[data-wensi-publish-plan]")) { publishStep("plan"); return; }
      if (event.target.closest("[data-wensi-publish-prepare]")) { publishStep("prepare"); return; }
      if (event.target.closest("[data-wensi-publish-deploy]")) { publishStep("deploy"); return; }
      if (event.target.closest("[data-wensi-suggest]")) { void askFieldSuggestion(); return; }
      if (event.target.closest("[data-wensi-suggest-accept]")) { acceptFieldSuggestion(); return; }
      if (event.target.closest("[data-wensi-review]")) { void sendDraftToReviewDesk(); return; }
    });

    dom.focusButton.addEventListener("click", () => {
      cycleFocusMode();
    });
    dom.textarea.addEventListener("scroll", () => syncPreviewScroll());
    dom.textarea.addEventListener("input", (event) => {
      if (!state.draft) return;
      state.draft.body = event.target.value;
      if (dom.wordStat) {
        dom.wordStat.textContent = trn("wensi_stat_words", "{count} words", { count: bodyCount(event.target.value) });
      }
      markDirty();
      // In preview or split, the frame follows the same pause as the save.
      schedulePreview();
    });
    dom.fields.addEventListener("input", (event) => {
      const control = event.target.closest("[data-wensi-field]");
      // The tag composer edits the chip set, not a front-matter string.
      if (!control || !state.draft || control.closest("[data-wensi-tag-add]")) return;
      state.draft.frontMatter[control.dataset.wensiField] = control.value;
      markDirty();
      refreshRequired();
      if (["slug", "date"].includes(control.dataset.wensiField)) refreshUrlPreview();
    });
    // A frame's alt text stops being "missing" the moment the writer types one;
    // the wavy underline is feedback, not a verdict that waits for a save.
    dom.fields.addEventListener("input", (event) => {
      const alt = event.target.closest("[data-wensi-frame-alt]");
      if (!alt) return;
      alt.classList.toggle("is-required-missing", String(alt.value || "").trim() === "");
    });
    dom.fields.addEventListener("change", (event) => {
      // The photo grid's two selects are arrangements, not front-matter fields.
      const intoStack = event.target.closest("[data-wensi-frame-stack]");
      if (intoStack) { void moveFrameToStack(intoStack); return; }
      const dropStack = event.target.closest("[data-wensi-photo-drop-stack]");
      if (dropStack) { state.photoDropStack = String(dropStack.value || ""); return; }
      // date inputs fire change without a matching input on some engines.
      const control = event.target.closest("[data-wensi-field]");
      if (!control || !state.draft || control.closest("[data-wensi-tag-add]")) return;
      if (state.draft.frontMatter[control.dataset.wensiField] === control.value) return;
      state.draft.frontMatter[control.dataset.wensiField] = control.value;
      markDirty();
      refreshRequired();
      refreshUrlPreview();
    });
    dom.fields.addEventListener("click", (event) => {
      const chip = event.target.closest("[data-wensi-tag]");
      if (!chip || !state.draft) return;
      toggleTag(chip.dataset.wensiTagField, chip.dataset.wensiTag);
    });
    dom.fields.addEventListener("keydown", (event) => {
      const input = event.target.closest("[data-wensi-tag-add]");
      if (!input || event.key !== "Enter" || !state.draft) return;
      event.preventDefault();
      const value = String(input.value || "").trim();
      if (value) addTag(input.dataset.wensiTagField, value);
    });
  }

  function libraryButton(win, selector) {
    const button = dom?.library?.querySelector(selector) || win.querySelector(`.wensi-library ${selector}`);
    return button;
  }

  // ---- Rendering -----------------------------------------------------------

  function renderAll() {
    renderSiteSelect();
    renderSiteChrome();
    renderFilters();
    renderCategories();
    renderList();
    renderWriting();
    renderInspector();
    updateStatus();
  }

  function renderSiteSelect() {
    if (!dom?.siteSelect) return;
    dom.siteSelect.replaceChildren();
    state.sites.forEach((site) => {
      const option = el("option", "", site.label || site.id);
      option.value = site.id;
      dom.siteSelect.append(option);
    });
    dom.siteSelect.value = state.siteId;
  }

  function renderCategories() {
    if (!dom?.categories) return;
    const site = currentSite();
    const listed = Array.isArray(site?.taxonomy?.categories) ? site.taxonomy.categories : [];
    const known = state.categoryFilter && listed.some((category) => category.slug === state.categoryFilter);
    if (state.categoryFilter && !known) state.categoryFilter = "";
    dom.categories.hidden = listed.length === 0;
    dom.categories.replaceChildren();
    if (!listed.length) return;
    const rows = flattenedArticles();
    const choices = [{ slug: "", name: tr("wensi_category_all", "All categories") }, ...listed];
    choices.forEach((category) => {
      const button = el("button", "wensi-filter");
      button.type = "button";
      button.dataset.wensiCategory = category.slug || "";
      button.setAttribute("aria-pressed", (state.categoryFilter || "") === (category.slug || "") ? "true" : "false");
      const name = el("span", "wensi-filter-name", category.name || category.slug);
      const matched = category.slug
        ? rows.filter((row) => articleCategory(row) === category.slug).length
        : rows.length;
      const count = el("span", "wensi-filter-count", String(matched));
      button.append(name, count);
      dom.categories.append(button);
    });
  }

  function renderFilters() {
    if (!dom?.filters) return;
    const rows = flattenedArticles();
    dom.filters.querySelectorAll("[data-wensi-filter]").forEach((button) => {
      button.setAttribute("aria-pressed", button.dataset.wensiFilter === state.statusFilter ? "true" : "false");
      const count = button.querySelector("[data-wensi-filter-count]");
      if (count) count.textContent = String(filterArticles(rows, "", button.dataset.wensiFilter).length);
    });
  }

  function renderSiteChrome() {
    const site = currentSite();
    if (dom?.siteMark) {
      const label = String(site?.label || site?.id || "");
      const parts = label.split(/[^A-Za-z0-9\u4e00-\u9fff]+/).filter(Boolean);
      const mark = parts.length > 1
        ? parts.slice(0, 2).map((part) => part.slice(0, 1)).join("")
        : (parts[0] || "").slice(0, 2);
      dom.siteMark.textContent = (mark || "—").toUpperCase();
    }
    if (dom?.siteCount) {
      const count = flattenedArticles().length;
      dom.siteCount.textContent = site ? String(count) : "";
    }
  }

  function statusMark(row) {
    return `<span class="wensi-status is-${esc(row.status || "draft")}">${esc(statusLabel(row.status))}</span>${row.gitDirty ? `<span class="wensi-dirty" title="${esc(tr("wensi_dirty_hint", "Changed since the last push"))}">●</span>` : ""}`;
  }

  function articleRowHtml(row) {
    const selected = state.selected?.type === row.type && state.selected?.path === row.path;
    return `<button type="button" class="wensi-row${selected ? " is-selected" : ""}" data-wensi-type="${esc(row.type)}" data-wensi-path="${esc(row.path)}" aria-current="${selected ? "true" : "false"}">
      <span class="wensi-row-title">${esc(row.title || tr("wensi_untitled", "Untitled"))}</span>
      <span class="wensi-row-meta"><time>${esc(row.date || "")}</time>${statusMark(row)}</span>
    </button>`;
  }

  function renderList() {
    if (!dom?.list) return;
    const site = currentSite();
    if (!site) {
      dom.list.innerHTML = "";
      return;
    }
    const filtering = state.query.trim() || state.statusFilter !== "all" || Boolean(state.categoryFilter);
    const types = typeOptions();
    if (!types.length) {
      dom.list.innerHTML = `<p class="wensi-group-empty">${esc(tr("wensi_only_collections", "This site holds only collections (like 影像). Read and arrange them in the photos face on the right."))}</p>`;
      return;
    }
    const html = types.map((typeId) => {
      const type = site.contentTypes[typeId];
      const rows = state.articlesByType.get(typeId);
      if (rows && !Array.isArray(rows)) {
        // Say what actually happened, not "try again": the server's own text is
        // actionable, and a missing folder grant has one clear next step.
        const message = rows.code === "storage_unsupported"
          ? tr("wensi_storage_unsupported", "This content type is not manageable in the editor yet (the server declined it).")
          : rows.code === "folder_grant_required"
            ? tr("wensi_folder_grant_required", "This site's folder is not shared with AI System 6 yet. Share it from the Chooser, then pick the site again.")
            : rows.error
              ? String(rows.error)
              : tr("wensi_type_group_failed", "This type could not be listed.");
        return `<section class="wensi-group" data-wensi-group="${esc(typeId)}"><h3>${esc(type.label || typeId)}</h3><p class="wensi-group-error">${esc(message)}</p></section>`;
      }
      const visible = filterArticles(rows || [], state.query, state.statusFilter, state.categoryFilter);
      if (!visible.length && filtering) return "";
      const rowsHtml = visible.map(articleRowHtml).join("")
        || `<p class="wensi-group-empty">${esc(tr("wensi_no_articles", "No articles here yet"))}</p>`;
      return `<section class="wensi-group" data-wensi-group="${esc(typeId)}"><h3>${esc(type.label || typeId)}</h3>${rowsHtml}</section>`;
    }).join("");
    dom.list.innerHTML = html;
  }

  function renderWriting() {
    if (!dom?.writing) return;
    const draft = state.draft;
    dom.writing.dataset.empty = draft ? "false" : "true";
    dom.textarea.value = draft ? String(draft.body || "") : "";
    dom.focusButton.hidden = !focusModeAvailable();
    paintFocusButton();
    if (dom.matterLine) {
      const count = draft ? Object.keys(draft.frontMatter || {}).length : 0;
      dom.matterLine.hidden = !draft;
      dom.matterLine.textContent = draft ? trn("wensi_matter_line", "{count} fields, edited in the panel", { count }) : "";
    }
    if (dom.wordStat) {
      dom.wordStat.textContent = draft ? trn("wensi_stat_words", "{count} words", { count: bodyCount(draft.body) }) : "";
    }
    if (dom.saveStat) {
      const unpushed = Boolean(draft?.gitDirty || state.selected?.gitDirty);
      dom.saveStat.textContent = unpushed ? tr("wensi_stat_unpushed", "Not pushed") : "";
    }
    const title = draft ? String(draft.frontMatter?.title || draft.title || tr("wensi_untitled", "Untitled")) : tr("wensi_quanyong_label", "文思泉涌");
    setWindowTitle(title);
    renderViewMode();
    refreshUrlPreview();
  }

  /**
   * 写 / 预览 / 对照. The preview frame is the site's page: its own renderer
   * (the server route) and its own stylesheet, inside a sandboxed frame so the
   * site's CSS cannot touch the desk around it.
   */
  function setViewMode(mode) {
    state.viewMode = mode === "preview" || mode === "split" ? mode : "write";
    renderViewMode();
    syncMenuMarks();
    if (state.viewMode !== "write") void refreshPreview();
  }

  function renderViewMode() {
    if (!dom?.writing) return;
    const mode = state.viewMode;
    dom.writing.dataset.view = mode;
    if (dom.viewModes) {
      for (const button of dom.viewModes.querySelectorAll("[data-wensi-view-mode]")) {
        button.setAttribute("aria-pressed", button.dataset.wensiViewMode === mode ? "true" : "false");
      }
    }
    if (dom.previewPane) dom.previewPane.hidden = mode === "write";
    if (dom.editorHost) dom.editorHost.hidden = mode === "preview";
    paintPreview();
  }

  let previewTimer = 0;
  let previewToken = 0;
  function schedulePreview() {
    if (state.viewMode === "write") return;
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => { void refreshPreview(); }, 700);
  }

  async function refreshPreview() {
    const draft = state.draft;
    const site = currentSite();
    if (!draft || !site) return;
    const token = ++previewToken;
    const key = draftKey();
    try {
      const [html, css] = await Promise.all([
        client().previewArticle(site.id, { type: draft.type, body: draft.body || "", slug: draft.frontMatter?.slug || "" }),
        client().previewCss(site.id),
      ]);
      if (token !== previewToken) return;
      if (html?.ok === false) {
        state.preview = { key, html: "", css: "", error: html.code === "demo_only"
          ? tr("wensi_preview_demo", "演示站点没有可以套用的站点样式；这里显示的是桌面自己的排版。")
          : tr("wensi_preview_failed", "这一次没能生成预览。"), at: Date.now() };
      } else {
        state.preview = { key, html: String(html.html || ""), css: String(css || ""), error: "", at: Date.now() };
      }
    } catch (error) {
      if (token !== previewToken) return;
      state.preview = { key, html: "", css: "", error: String(error?.message || error), at: Date.now() };
    }
    paintPreview();
  }

  /**
   * The fallback page: paragraphs and headings from the draft, wrapped in the
   * desk's own reading typography. Deliberately plain — it is honest about not
   * being the site's rendering.
   */
  function deskFallbackDocument(body) {
    const esc = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const blocks = String(body).split(/\n{2,}/).map((block) => block.trim()).filter(Boolean).map((block) => {
      const heading = block.match(/^(#{1,6})\s+(.*)$/);
      if (heading) return `<h${Math.min(6, heading[1].length + 2)}>${esc(heading[2])}</h${Math.min(6, heading[1].length + 2)}>`;
      return `<p>${block.split("\n").map(esc).join("<br>")}</p>`;
    }).join("\n");
    return `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8">`
      + `<style>body{margin:0;padding:16px;font-family:inherit;font-size:var(--mde-font-size,15px);`
      + `line-height:1.7;color:CanvasText;background:Canvas}h3,h4,h5,h6{margin:1.2em 0 .4em}p{margin:0 0 .9em}</style>`
      + `</head><body>${blocks}</body></html>`;
  }

  function paintPreview() {
    if (!dom?.previewFrame) return;
    dom.previewFrame.onload = () => syncPreviewScroll();
    const run = state.preview && state.preview.key === draftKey() ? state.preview : null;
    if (dom.previewNote) {
      dom.previewNote.textContent = run?.error || (run ? tr("wensi_preview_note", "与线上同一份样式和渲染规则。") : tr("wensi_preview_pending", "正在生成预览…"));
      dom.previewNote.hidden = false;
    }
    if (!run || !run.html) {
      // No site renderer (the demo site, or a refused run) still shows the
      // writer their words, in the desk's own typography, with the note saying
      // which rendering this is. An empty frame would read as a failure.
      const body = String(state.draft?.body || "").trim();
      dom.previewFrame.srcdoc = body ? deskFallbackDocument(body) : "";
      return;
    }
    // The frame's document is the site's page shell in miniature: its stylesheet,
    // then the rendered body. No scripts, no desk styles.
    dom.previewFrame.srcdoc = `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8">`
      + `<meta name="viewport" content="width=device-width, initial-scale=1">`
      + `<style>${run.css}</style>`
      + `</head><body class="page-doc">${run.html}</body></html>`;
  }

  function syncPreviewScroll() {
    const area = dom?.textarea;
    const frame = dom?.previewFrame;
    if (!area || !frame || state.viewMode === "write") return;
    let doc = null;
    try {
      doc = frame.contentDocument;
    } catch {
      doc = null;
    }
    const scroller = doc?.scrollingElement || doc?.documentElement;
    if (!scroller) return;
    const maxIn = area.scrollHeight - area.clientHeight;
    const ratio = maxIn > 0 ? area.scrollTop / maxIn : 0;
    const maxOut = scroller.scrollHeight - scroller.clientHeight;
    if (maxOut > 0) scroller.scrollTop = ratio * Math.max(0, maxOut);
  }

  function refreshUrlPreview() {
    if (!dom?.urlLabel) return;
    const draft = state.draft;
    if (!draft) {
      dom.urlLabel.textContent = "";
      return;
    }
    dom.urlLabel.textContent = draft.url || articleUrlPreview(currentSite(), draft.type, draft.frontMatter, state.articlesByType.get(draft.type) || [], draft.path);
  }

  function fieldControl(field) {
    const value = state.draft?.frontMatter?.[field.key];
    // Opaque keys the server holds (voice, cid, archiveUrl) render read-only
    // even when the description spells them as a plain editable type.
    const opaque = state.draft?.opaqueKeys?.includes(field.key) === true;
    if (field.type === "readonly" || opaque) {
      const output = el("output", "wensi-readonly", String(value ?? "—"));
      output.dataset.wensiField = field.key;
      output.title = tr(opaque ? "wensi_opaque_hint" : "wensi_readonly_hint", "Managed by the site; edits are discarded on save");
      return output;
    }
    if (field.type === "tags") return tagsControl(field);
    if (field.type === "text") {
      const area = el("textarea", "wensi-field-textarea");
      area.rows = 2;
      area.value = String(value ?? "");
      area.dataset.wensiField = field.key;
      area.id = `wensi-field-${field.key}`;
      return area;
    }
    const input = el("input", `wensi-field-input is-${field.type}`);
    // 日期也是文本输入：原生的日期控件在哪个时代外观里都是现代浏览器的样子。
    input.type = "text";
    input.value = String(value ?? "");
    input.autocomplete = "off";
    if (field.maxLength) input.maxLength = Number(field.maxLength);
    input.dataset.wensiField = field.key;
    input.id = `wensi-field-${field.key}`;
    if (field.type === "date") {
      input.placeholder = String(field.format || "YYYY-MM-DD");
    }
    return input;
  }

  function tagsControl(field) {
    const wrap = el("div", "wensi-tags");
    const chips = el("div", "wensi-tag-chips");
    const canon = optionsFor(field);
    const selected = currentTags();
    const known = new Set(canon);
    const extra = selected.filter((tag) => !known.has(tag));
    canon.forEach((tag) => {
      const chip = el("button", "wensi-tag", `#${tag}`);
      chip.type = "button";
      chip.dataset.wensiTag = tag;
      chip.dataset.wensiTagField = field.key;
      chip.setAttribute("aria-pressed", selected.includes(tag) ? "true" : "false");
      chips.append(chip);
    });
    extra.forEach((tag) => {
      // A tag the taxonomy does not know yet: yellow until the site adopts it.
      const chip = el("button", "wensi-tag is-new", `#${tag}`);
      chip.type = "button";
      chip.dataset.wensiTag = tag;
      chip.dataset.wensiTagField = field.key;
      chip.setAttribute("aria-pressed", "true");
      chip.title = tr("wensi_new_tag_hint", "New tag — not in the site's list yet");
      chips.append(chip);
    });
    const input = el("input", "wensi-tag-add");
    input.type = "text";
    input.dataset.wensiTagAdd = "true";
    input.dataset.wensiTagField = field.key;
    input.placeholder = tr("wensi_add_tag", "Add tag…");
    wrap.append(chips, input);
    return wrap;
  }

  function fieldRow(field) {
    const row = el("div", `wensi-field wensi-field-${field.type}`);
    const label = el("label", "wensi-field-label", fieldLabel(field));
    if (field.type !== "tags" && field.type !== "readonly") label.setAttribute("for", `wensi-field-${field.key}`);
    row.append(label);
    const control = fieldControl(field);
    if (control) row.append(control);
    if (field.type === "slug") {
      const preview = el("span", "wensi-url-preview");
      preview.dataset.wensiUrlPreview = field.key;
      row.append(preview);
    }
    return row;
  }

  function fieldLabel(field) {
    if (typeof field.label === "string" && field.label) return field.label;
    return field.key;
  }

  const INSPECTOR_FACES = ["fields", "check", "media", "tags", "photos", "upkeep", "ledger"];

  /**
   * One way into each face. Entering a face that has nothing loaded asks for it
   * once; the panel's own button re-runs it. The menu bar and the mode buttons
   * both come through here, so the two can never disagree about what a face
   * means.
   * @param {string} wanted
   */
  function showFace(wanted) {
    const mode = INSPECTOR_FACES.includes(String(wanted)) ? String(wanted) : "fields";
    if (mode === state.inspectorMode) return;
    state.inspectorMode = mode;
    if (mode === "check" && state.draft && !(state.checkRun && state.checkRun.key === draftKey())) void runCheck();
    if (mode === "media" && !(state.mediaRun && state.mediaRun.siteId === state.siteId)) void scanMedia();
    if (mode === "photos" && !(state.photoRun && state.photoRun.siteId === state.siteId)) void loadPhotos();
    if (mode === "upkeep" && !(state.routineRun && state.routineRun.siteId === state.siteId)) void loadRoutine();
    if (mode === "ledger" && !(state.ledgerRun && state.ledgerRun.siteId === state.siteId)) void loadLedger();
    renderInspector();
    syncMenuMarks();
  }

  function paintMatterModes() {
    if (!dom?.matterModes) return;
    const onFields = state.inspectorMode === "fields" && Boolean(state.draft);
    dom.matterModes.hidden = !onFields;
    dom.matterModes.querySelectorAll("[data-wensi-matter]").forEach((button) => {
      button.setAttribute("aria-pressed", button.dataset.wensiMatter === state.matterView ? "true" : "false");
    });
  }

  function renderInspector() {
    if (!dom?.fields) return;
    const draft = state.draft;
    const type = draft ? currentSite()?.contentTypes?.[draft.type] : currentType();
    dom.typeLabel.textContent = type?.label || state.typeId || "—";
    refreshSaveNote();
    paintMatterModes();
    dom.fields.replaceChildren();
    renderInspectorModes();
    if (state.inspectorMode === "photos") {
      dom.fields.append(photosPanel());
      refreshRequired();
      return;
    }
    if (state.inspectorMode === "upkeep") {
      dom.fields.append(upkeepPanel());
      refreshRequired();
      return;
    }
    if (state.inspectorMode === "ledger") {
      dom.fields.append(ledgerPanel());
      refreshRequired();
      return;
    }
    if (state.inspectorMode === "tags") {
      dom.fields.append(tagPanel());
      refreshRequired();
      return;
    }
    if (state.inspectorMode === "media") {
      dom.fields.append(mediaPanel());
      refreshRequired();
      paintMatterModes();
      return;
    }
    paintMatterModes();
    if (state.inspectorMode === "fields" && state.matterView === "source" && draft) {
      const note = el("p", "wensi-matter-note", tr("wensi_matter_source_note", "These are the fields that will be written. Edit them in the form."));
      const source = el("pre", "wensi-matter-source");
      source.textContent = frontMatterSourceText(draft.frontMatter);
      dom.fields.append(note, source);
      refreshRequired();
      return;
    }
    // Nothing open means nothing to edit: an empty form would take typing that
    // has nowhere to go. The hint says what to do instead.
    if (!draft) {
      const idle = el("p", "wensi-group-empty");
      idle.textContent = tr("wensi_inspector_idle", "Choose an article, or start a new draft.");
      dom.fields.append(idle);
      refreshRequired();
      refreshFieldPreviews();
      return;
    }
    if (state.inspectorMode === "check") {
      dom.fields.append(checkPanel());
      refreshRequired();
      return;
    }
    const fields = type?.fields || [];
    fields.forEach((field) => dom.fields.append(fieldRow(field)));
    dom.fields.append(suggestionPanel());
    refreshRequired();
    refreshFieldPreviews();
  }

  // 属性 / 检查: the right column has two faces. The check face is a run against
  // the draft on screen — its findings stay with that draft's key, so switching
  // articles never shows one article's verdict over another's text.
  function draftKey(draft = state.draft) {
    if (!draft) return "";
    return `${draft.type}::${draft.path || "(new)"}::${draft.frontMatter?.slug || ""}`;
  }

  function renderInspectorModes() {
    if (!dom?.inspectorModes) return;
    // The faces are per site, and Media matters whether or not an article is
    // open, so the switch stays available as soon as a site is chosen.
    dom.inspectorModes.hidden = !state.siteId;
    for (const button of dom.inspectorModes.querySelectorAll("[data-wensi-inspector-mode]")) {
      button.setAttribute("aria-pressed", button.dataset.wensiInspectorMode === state.inspectorMode ? "true" : "false");
    }
  }

  /**
   * 影像: the photo collection. Each stack keeps its order; a frame's words
   * (alt, caption, city, taken, medium) are edited in place and written back to
   * the collection, which the site reads. Moving a frame up or down changes the
   * order the stack publishes in — that is the whole arrangement gesture.
   */
  function photosPanel() {
    const wrap = el("div", "wensi-photos");
    const run = state.photoRun && state.photoRun.siteId === state.siteId ? state.photoRun : null;
    const head = el("div", "wensi-check-head");
    const loadButton = el("button", "btn mini-btn", state.photoBusy ? tr("wensi_photos_busy", "Reading…") : tr("wensi_photos_load", "Read the collection"));
    loadButton.type = "button";
    loadButton.dataset.wensiPhotosLoad = "true";
    loadButton.disabled = state.photoBusy;
    head.append(loadButton);
    if (run?.summary && !run.error) {
      const tally = el("span", "wensi-check-tally");
      tally.textContent = `${run.summary.stacks} ${tr("wensi_photos_stacks", "stacks")} · ${run.summary.frames} ${tr("wensi_photos_frames", "frames")} · ${run.summary.rolls} ${tr("wensi_photos_rolls", "rolls")}`;
      head.append(tally);
    }
    wrap.append(head);
    if (state.photoNote) wrap.append(el("p", "wensi-photo-note", state.photoNote));
    if (run?.error) wrap.append(el("p", "wensi-group-error", run.error));

    // The drop target. Outside files land here instead of File Floppy because
    // this surface is declared to drag-drop.js; the 选照片 button is the same
    // path without a mouse drag.
    const drop = el("div", "wensi-photo-drop");
    drop.dataset.dropTarget = "wensi-photos";
    drop.dataset.wensiPhotoDrop = "true";
    const dropText = el("p", "wensi-photo-drop-text", tr("wensi_photos_drop", "把照片拖到这里，或"));
    const pick = el("button", "btn mini-btn", tr("wensi_photos_pick", "选照片…"));
    pick.type = "button";
    pick.dataset.wensiPhotosPick = "true";
    pick.disabled = state.photoBusy;
    dropText.append(" ", pick);
    drop.append(dropText);
    const dropStack = el("select", "wensi-field-input wensi-photo-drop-stack");
    dropStack.dataset.wensiPhotoDropStack = "true";
    dropStack.setAttribute("aria-label", tr("wensi_photos_into", "into"));
    dropStack.append(new Option(tr("wensi_photos_drop_loose", "先进散页，回头再归叠"), ""));
    for (const stack of run?.stacks || []) {
      dropStack.append(new Option(`${tr("wensi_photos_into", "放进")}「${stack.title || stack.slug}」`, stack.slug));
    }
    dropStack.value = state.photoDropStack;
    drop.append(dropStack);
    wrap.append(drop);

    const stacks = run?.stacks || [];
    const loose = run?.loose || [];
    const sections = [
      ...stacks.map((stack) => ({ slug: stack.slug, title: `${stack.title || stack.slug}${stack.meta ? ` · ${stack.meta}` : ""}`, frames: stack.frames })),
      // Loose frames are a real place: a batch lands there before it is
      // arranged, and the site's own "散页" stack is just one more stack.
      ...(loose.length ? [{ slug: "", title: tr("wensi_photos_loose", "还没归叠"), frames: loose }] : []),
    ];
    const stackChoices = [{ slug: "", title: tr("wensi_photos_loose", "还没归叠") }, ...stacks.map((stack) => ({ slug: stack.slug, title: stack.title || stack.slug }))];
    const knownIds = new Set(sections.flatMap((section) => section.frames.map((frame) => frame.id)));
    state.photoSelection = state.photoSelection.filter((id) => knownIds.has(id));

    for (const section of sections) {
      const box = el("section", "wensi-stack");
      const title = el("h4", "wensi-stack-title");
      title.textContent = section.title;
      box.append(title);
      section.frames.forEach((frame, index) => {
        const row = el("div", "wensi-frame");
        row.dataset.wensiFrame = frame.id;
        row.dataset.wensiFrameSlug = section.slug;
        row.dataset.wensiFrameIndex = String(index);
        const check = el("input", "wensi-frame-check");
        check.type = "checkbox";
        check.dataset.wensiPhotoSelect = frame.id;
        check.checked = state.photoSelection.includes(frame.id);
        check.title = tr("wensi_photos_select", "Pick for the next roll");
        check.setAttribute("aria-label", `${tr("wensi_photos_select", "Pick for the next roll")}: ${frame.file}`);
        row.append(check);
        const thumb = el("img", "wensi-frame-thumb");
        // The thumbnail is decorative here: the photograph's own words are the
        // input beside it, which is what a reader will hear.
        thumb.alt = "";
        thumb.loading = "lazy";
        if (run?.media?.dir && frame.file) thumb.src = client().photoUrl(state.siteId, frame.file);
        thumb.dataset.wensiFrameThumb = frame.file;
        row.append(thumb);
        const name = el("p", "wensi-frame-file");
        name.textContent = `${String(index + 1).padStart(2, "0")} · ${frame.file}${frame.w ? ` · ${frame.w}×${frame.h}` : ""}${frame.taken ? ` · ${frame.taken}` : ""}${frame.roll ? ` · ${tr("wensi_photos_in_roll", "卷")} ${frame.roll}` : ""}`;
        row.append(name);
        const alt = el("input", "wensi-field-input");
        alt.value = frame.alt;
        alt.placeholder = tr("wensi_photos_alt", "替代文字（必填，给看不见图的人）");
        alt.dataset.wensiFrameAlt = "true";
        if (!frame.alt) alt.classList.add("is-required-missing");
        const cap = el("input", "wensi-field-input");
        cap.value = frame.cap;
        cap.placeholder = tr("wensi_photos_cap", "说明（可选）");
        cap.dataset.wensiFrameCap = "true";
        row.append(alt, cap);
        const controls = el("div", "wensi-frame-controls");
        const save = el("button", "btn mini-btn", tr("wensi_photos_save", "Save"));
        save.type = "button";
        save.dataset.wensiFrameSave = frame.id;
        save.disabled = state.photoBusy;
        const moveTo = el("select", "wensi-field-input wensi-frame-stack");
        moveTo.dataset.wensiFrameStack = frame.id;
        moveTo.title = tr("wensi_photos_move_to", "Move to another stack");
        moveTo.setAttribute("aria-label", `${tr("wensi_photos_move_to", "Move to another stack")}: ${frame.file}`);
        for (const choice of stackChoices) moveTo.append(new Option(choice.title, choice.slug));
        moveTo.value = section.slug;
        moveTo.disabled = state.photoBusy;
        const up = el("button", "mini-btn", "↑");
        up.type = "button";
        up.dataset.wensiFrameMove = "up";
        up.title = tr("wensi_photos_up", "上移");
        up.disabled = state.photoBusy || index === 0 || !section.slug;
        const down = el("button", "mini-btn", "↓");
        down.type = "button";
        down.dataset.wensiFrameMove = "down";
        down.title = tr("wensi_photos_down", "下移");
        down.disabled = state.photoBusy || !section.slug || index === section.frames.length - 1;
        controls.append(moveTo, save, up, down);
        row.append(controls);
        box.append(row);
      });
      wrap.append(box);
    }

    // A new stack, right where the writer is arranging.
    const newStack = el("div", "wensi-photo-new-stack");
    const stackTitle = el("input", "wensi-field-input");
    stackTitle.placeholder = tr("wensi_photos_new_stack", "新的一叠叫什么（英文或拼音会变成网址）");
    stackTitle.dataset.wensiStackTitle = "true";
    const addStack = el("button", "btn mini-btn", tr("wensi_photos_new_stack_go", "新建叠"));
    addStack.type = "button";
    addStack.dataset.wensiStackCreate = "true";
    addStack.disabled = state.photoBusy;
    newStack.append(stackTitle, addStack);
    wrap.append(newStack);

    if (run && !run.error && !sections.length) {
      wrap.append(el("p", "wensi-group-empty", tr("wensi_photos_empty", "这个站点的影像集合里还没有叠。")));
    }

    // 卷: the record of when a batch went up.
    if (run?.rolls?.length) {
      const rolls = el("div", "wensi-photo-rolls");
      rolls.append(el("h4", "wensi-stack-title", tr("wensi_photos_rolls", "卷")));
      for (const roll of run.rolls) {
        const line = el("p", "wensi-photo-roll");
        line.textContent = `${tr("wensi_photos_in_roll", "卷")} ${roll.code} · ${roll.date} · ${roll.ids.length} ${tr("wensi_photos_frames", "帧")}${roll.cap ? ` · ${roll.cap}` : ""}`;
        rolls.append(line);
      }
      wrap.append(rolls);
    }
    if (state.photoSelection.length && run && !run.error) {
      const bar = el("div", "wensi-photo-rollbar");
      const count = el("p", "wensi-photo-roll-count", tr("wensi_photos_selected", "已选 {n} 帧").replace("{n}", String(state.photoSelection.length)));
      const date = el("input", "wensi-field-input");
      date.type = "date";
      date.value = todayIso();
      date.dataset.wensiRollDate = "true";
      const cap = el("input", "wensi-field-input");
      cap.placeholder = tr("wensi_photos_roll_cap", "这一卷的一句话（可选）");
      cap.dataset.wensiRollCap = "true";
      const into = el("select", "wensi-field-input");
      into.dataset.wensiRollStack = "true";
      into.append(new Option(tr("wensi_photos_roll_keep", "按现在的归叠"), ""));
      for (const stack of stacks) into.append(new Option(`${tr("wensi_photos_into", "放进")}「${stack.title || stack.slug}」`, stack.slug));
      const go = el("button", "btn mini-btn", tr("wensi_photos_roll_go", "编成一卷"));
      go.type = "button";
      go.dataset.wensiRollGo = "true";
      go.disabled = state.photoBusy;
      bar.append(count, date, cap, into, go);
      wrap.append(bar);
    }
    return wrap;
  }

  function todayIso() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  /**
   * The photo collection, as one value. Reading it is shared by the load button
   * and by every write (which re-reads rather than patching the view by hand:
   * an arrangement change moves frames between stacks, and guessing at the
   * result is how a grid drifts from its file).
   * @param {Record<string, any>} site
   */
  async function fetchPhotoRun(site) {
    try {
      const result = await client().loadPhotos(site.id);
      const reason = result?.ok === false
        ? (result.code === "demo_only"
          ? tr("wensi_photos_demo", "演示站点没有影像集合。")
          : result.code === "folder_grant_required"
            ? tr("wensi_photos_grant", "影像集合还没共享给 AI System 6。在「选择器」里共享后再读。")
            : (result.error || tr("wensi_photos_failed", "这一次没能读出影像集合。")))
        : "";
      return {
        siteId: site.id,
        media: result?.media || null,
        stacks: result?.stacks || [],
        loose: result?.loose || [],
        rolls: result?.rolls || [],
        summary: result?.summary || null,
        error: reason,
        at: Date.now(),
      };
    } catch (error) {
      return { siteId: site.id, media: null, stacks: [], loose: [], rolls: [], summary: null, error: String(error?.message || error), at: Date.now() };
    }
  }

  async function loadPhotos() {
    const site = currentSite();
    if (!site || state.photoBusy) return;
    state.photoBusy = true;
    state.photoNote = "";
    renderInspector();
    try {
      state.photoRun = await fetchPhotoRun(site);
    } finally {
      state.photoBusy = false;
      renderInspector();
    }
  }

  /**
   * Bring photographs in from the browser's File objects: the drop target and
   * the file picker both end here.
   * @param {FileList | File[] | null | undefined} fileList
   */
  async function importPhotoFiles(fileList) {
    const site = currentSite();
    const files = Array.from(fileList || []).filter((file) => String(file?.type || "").startsWith("image/") || /\.(jpe?g|png|gif|webp)$/i.test(String(file?.name || "")));
    if (!site) return;
    if (!files.length) {
      state.photoNote = tr("wensi_photos_not_pictures", "拖进来的不是照片（认 jpg、png、gif、webp）。");
      renderInspector();
      return;
    }
    state.photoBusy = true;
    state.photoNote = tr("wensi_photos_importing", "正在把照片放进站点…");
    renderInspector();
    try {
      const payload = [];
      const tooLarge = [];
      for (const file of files) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        // The route refuses a file over 12 MiB; refusing here saves the upload.
        if (bytes.length > MAX_IMPORT_BYTES) {
          tooLarge.push(file.name || "photo");
          continue;
        }
        payload.push({ name: file.name || "photo", data: bytesToBase64(bytes) });
      }
      // The route takes at most 12 files and 48 MiB of base64 per request, so a
      // big drop goes in batches and the receipts are added up. A batch that
      // fails reports what it did; the ones that landed stay landed.
      const notes = [];
      const skipped = [];
      for (const batch of batchPhotoPayload(payload)) {
        const result = await client().importPhotos(site.id, { files: batch, stack: state.photoDropStack });
        if (result?.note) notes.push(String(result.note));
        if (Array.isArray(result?.skipped)) skipped.push(...result.skipped);
      }
      state.photoNote = notes.join(" ");
      if (tooLarge.length) {
        state.photoNote += ` ${tr("wensi_photos_too_large", "Too large (12 MiB each)")}: ${tooLarge.join("、")}`;
      }
      if (skipped.length) {
        state.photoNote += ` ${skipped.map((entry) => `${entry.name || "?"}: ${entry.reason || "skipped"}`).join("；")}`;
      }
      state.photoRun = await fetchPhotoRun(site);
    } catch (error) {
      state.photoNote = String(error?.message || error);
      state.photoRun = await fetchPhotoRun(site);
    } finally {
      state.photoBusy = false;
      renderInspector();
    }
  }

  /**
   * The file picker is the drop target without a drag: the same files, the
   * same import.
   */
  function pickPhotoFiles() {
    if (typeof openTransientFilePicker !== "function") {
      state.photoNote = tr("wensi_photos_pick_unavailable", "这个桌面版本没有文件选择器。");
      renderInspector();
      return;
    }
    openTransientFilePicker({
      accept: "image/jpeg,image/png,image/gif,image/webp",
      multiple: true,
      onSelect: (files) => importPhotoFiles(files),
    });
  }

  /**
   * Split a drop into requests the route accepts: at most 12 files, and base64
   * under the body limit (4/3 of the raw bytes, so 36 MiB of base64 is safe).
   * @param {{ name: string, data: string }[]} payload
   */
  function batchPhotoPayload(payload) {
    const MAX_FILES = 12;
    const MAX_BASE64 = 36 * 1024 * 1024;
    const batches = [];
    let current = [];
    let bytes = 0;
    for (const entry of payload) {
      if (current.length && (current.length >= MAX_FILES || bytes + entry.data.length > MAX_BASE64)) {
        batches.push(current);
        current = [];
        bytes = 0;
      }
      current.push(entry);
      bytes += entry.data.length;
    }
    if (current.length) batches.push(current);
    return batches;
  }

  /**
   * @param {Uint8Array} bytes
   */
  function bytesToBase64(bytes) {
    let binary = "";
    const chunk = 0x8000;
    for (let start = 0; start < bytes.length; start += chunk) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(start, start + chunk)));
    }
    return btoa(binary);
  }

  /**
   * The same write as the ↑↓ buttons, expressed as "this frame belongs over
   * there" — the grid's real arrangement move.
   * @param {HTMLSelectElement} control
   */
  async function moveFrameToStack(control) {
    const site = currentSite();
    const id = control?.dataset?.wensiFrameStack;
    if (!site || !id || state.photoBusy) return;
    const to = String(control.value || "");
    state.photoBusy = true;
    renderInspector();
    try {
      const result = await client().movePhotoFrame(site.id, { id, to });
      state.photoNote = String(result?.note || "");
      state.photoRun = await fetchPhotoRun(site);
    } catch (error) {
      state.photoNote = String(error?.message || error);
      state.photoRun = await fetchPhotoRun(site);
    } finally {
      state.photoBusy = false;
      renderInspector();
    }
  }

  /**
   * @param {HTMLButtonElement} button
   */
  async function createStackInline(button) {
    const site = currentSite();
    const box = button?.closest(".wensi-photo-new-stack");
    const input = box?.querySelector("[data-wensi-stack-title]");
    if (!site || !input || state.photoBusy) return;
    const title = String(input.value || "").trim();
    if (!title) return;
    state.photoBusy = true;
    renderInspector();
    try {
      const result = await client().createPhotoStack(site.id, { title });
      state.photoNote = String(result?.note || "");
      state.photoRun = await fetchPhotoRun(site);
    } catch (error) {
      state.photoNote = String(error?.message || error);
    } finally {
      state.photoBusy = false;
      renderInspector();
    }
  }

  /**
   * The selected frames go up as one roll. The server refuses frames that
   * belong to no stack (the site's builder would), so naming a stack here is
   * how a loose batch becomes a roll in one step.
   * @param {HTMLButtonElement} button
   */
  async function createRollFromSelection(button) {
    const site = currentSite();
    const bar = button?.closest(".wensi-photo-rollbar");
    if (!site || !bar || state.photoBusy || !state.photoSelection.length) return;
    const payload = {
      ids: state.photoSelection.slice(),
      date: String(bar.querySelector("[data-wensi-roll-date]")?.value || ""),
      cap: String(bar.querySelector("[data-wensi-roll-cap]")?.value || ""),
      stack: String(bar.querySelector("[data-wensi-roll-stack]")?.value || ""),
    };
    state.photoBusy = true;
    renderInspector();
    try {
      const result = await client().createPhotoRoll(site.id, payload);
      state.photoNote = String(result?.note || "");
      state.photoSelection = [];
      state.photoRun = await fetchPhotoRun(site);
    } catch (error) {
      state.photoNote = String(error?.message || error);
    } finally {
      state.photoBusy = false;
      renderInspector();
    }
  }

  async function saveFrameWords(button) {
    const site = currentSite();
    const id = button?.dataset?.wensiFrameSave;
    const row = button?.closest("[data-wensi-frame]");
    if (!site || !id || !row) return;
    const patch = {
      alt: String(row.querySelector("[data-wensi-frame-alt]")?.value || ""),
      cap: String(row.querySelector("[data-wensi-frame-cap]")?.value || ""),
    };
    state.photoBusy = true;
    renderInspector();
    try {
      await client().updatePhotoFrame(site.id, { id, patch });
      if (state.photoRun && state.photoRun.siteId === site.id) {
        for (const stack of state.photoRun.stacks) {
          for (const frame of stack.frames) if (frame.id === id) Object.assign(frame, patch);
        }
      }
    } catch (error) {
      if (state.photoRun) state.photoRun.error = String(error?.message || error);
    } finally {
      state.photoBusy = false;
      renderInspector();
    }
  }

  async function moveFrame(button) {
    const site = currentSite();
    const row = button?.closest("[data-wensi-frame]");
    const direction = button?.dataset?.wensiFrameMove;
    if (!site || !row || !direction) return;
    const slug = row.dataset.wensiFrameSlug;
    const stack = (state.photoRun?.stacks || []).find((entry) => entry.slug === slug);
    if (!stack) return;
    const ids = stack.frames.map((frame) => frame.id);
    const index = ids.indexOf(row.dataset.wensiFrame);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    state.photoBusy = true;
    renderInspector();
    try {
      await client().reorderPhotoStack(site.id, { slug, ids });
      stack.frames = ids.map((id) => stack.frames.find((frame) => frame.id === id)).filter(Boolean);
    } catch (error) {
      if (state.photoRun) state.photoRun.error = String(error?.message || error);
    } finally {
      state.photoBusy = false;
      renderInspector();
    }
  }

  /**
   * 例行维护 (P5 skeleton): one place for the weekly routine's four steps. Each
   * step says what it would do, and each one that cannot run yet names exactly
   * what is missing — a disabled button with a reason, not a button that quietly
   * does nothing.
   */
  function upkeepPanel() {
    const wrap = el("div", "wensi-upkeep");
    const site = currentSite();
    if (state.demoMode) {
      wrap.append(el("p", "wensi-group-empty", tr("wensi_upkeep_demo", "The demo site has no routine.")));
      return wrap;
    }
    const run = state.routineRun && state.routineRun.siteId === state.siteId ? state.routineRun : null;
    const head = el("div", "wensi-check-head");
    const loadButton = el("button", "btn mini-btn", state.routineBusy ? tr("wensi_upkeep_busy", "Working…") : tr("wensi_upkeep_load", "Read the routine"));
    loadButton.type = "button";
    loadButton.dataset.wensiRoutineLoad = "true";
    loadButton.disabled = state.routineBusy;
    head.append(loadButton);
    wrap.append(head);
    if (state.routineNote) wrap.append(el("p", "wensi-photo-note", state.routineNote));
    if (!run) return wrap;
    if (run.error) wrap.append(el("p", "wensi-group-error", run.error));

    // 同步: the declared command, the corpus, and the run in flight.
    const sync = el("section", "wensi-stack");
    sync.append(el("h4", "wensi-stack-title", tr("wensi_upkeep_sync", "Corpus sync")));
    sync.append(el("p", "wensi-upkeep-line", run.note || ""));
    if (!run.declared) {
      sync.append(el("p", "wensi-upkeep-blocked", tr("wensi_upkeep_sync_undeclared", "The site description does not declare a sync command.")));
    } else if (run.run && run.run.status === "running") {
      sync.append(el("p", "wensi-upkeep-line", tr("wensi_upkeep_sync_running", "Running since {t}.").replace("{t}", String(run.run.startedAt || "").slice(11, 19))));
      const stop = el("button", "btn mini-btn", tr("wensi_upkeep_stop", "Stop"));
      stop.type = "button";
      stop.dataset.wensiRoutineStop = "true";
      stop.disabled = state.routineBusy;
      sync.append(stop);
    } else {
      const start = el("button", "btn mini-btn", tr("wensi_upkeep_sync_go", "Sync now"));
      start.type = "button";
      start.dataset.wensiRoutineSync = "true";
      start.disabled = state.routineBusy;
      sync.append(start);
    }
    if (run.run && run.run.status !== "running") {
      sync.append(el("p", "wensi-upkeep-line", tr("wensi_upkeep_sync_done", "Finished: {n} new corpus lines.").replace("{n}", String(run.run.newLines || 0))));
      if (run.run.lines?.length) {
        const log = el("pre", "wensi-upkeep-log");
        log.textContent = run.run.lines.slice(-8).join("\n");
        sync.append(log);
      }
    }
    wrap.append(sync);

    // 联络人: which conversations and people feed the corpus. The list lives in
    // contacts.json; the sync script reads it, so a toggle here is the whole
    // control surface.
    const people = el("section", "wensi-stack");
    people.append(el("h4", "wensi-stack-title", tr("wensi_upkeep_contacts", "Contacts")));
    const peopleHead = el("div", "wensi-check-head");
    const loadPeople = el("button", "btn mini-btn", state.contactsBusy
      ? tr("wensi_upkeep_busy", "Working…")
      : tr("wensi_contacts_load", "Read the list"));
    loadPeople.type = "button";
    loadPeople.dataset.wensiContactsLoad = "true";
    loadPeople.disabled = state.contactsBusy;
    peopleHead.append(loadPeople);
    if (state.contactsRun?.summary) {
      const tally = el("span", "wensi-check-tally");
      tally.textContent = `${state.contactsRun.summary.conversations} ${tr("wensi_contacts_conversations", "conversations")} · ${state.contactsRun.summary.senders} ${tr("wensi_contacts_senders", "people")}`;
      peopleHead.append(tally);
    }
    people.append(peopleHead);
    if (state.contactsNote) people.append(el("p", "wensi-photo-note", state.contactsNote));
    if (state.contactsRun?.note) people.append(el("p", "wensi-upkeep-line", state.contactsRun.note));
    const contactsRun = state.contactsRun?.siteId === state.siteId ? state.contactsRun : null;
    for (const entry of contactsRun?.qq?.conversations || []) {
      const row = el("label", "wensi-contact-row");
      const tick = el("input", "");
      tick.type = "checkbox";
      tick.checked = entry.enabled;
      tick.dataset.wensiContactConv = `${entry.id}|${entry.kind}`;
      const text = el("span", "wensi-contact-text");
      text.textContent = `${entry.prefix}${entry.kind === "group" ? ` · ${tr("wensi_contacts_group", "group")}` : ""}${entry.senders.length ? ` · ${entry.senders.length} ${tr("wensi_contacts_people", "people")}` : ""}${entry.note ? ` · ${entry.note}` : ""}`;
      row.append(tick, text);
      people.append(row);
    }
    if (contactsRun?.qq?.conversations?.length) {
      people.append(el("h4", "wensi-stack-title", tr("wensi_contacts_sender_list", "People (default for groups)")));
      for (const sender of contactsRun.qq.senders) {
        const row = el("label", "wensi-contact-row");
        const tick = el("input", "");
        tick.type = "checkbox";
        tick.checked = !contactsRun.qq.disabledSenders.includes(sender);
        tick.dataset.wensiContactSender = sender;
        const text = el("span", "wensi-contact-text");
        text.textContent = sender;
        row.append(tick, text);
        people.append(row);
      }
      const save = el("button", "btn mini-btn", tr("wensi_contacts_save", "Save the list"));
      save.type = "button";
      save.dataset.wensiContactsSave = "true";
      save.disabled = state.contactsBusy;
      people.append(save);
    }
    wrap.append(people);

    // 起草: the range, the models, the cap — and the channel that is not wired.
    const draft = el("section", "wensi-stack");
    draft.append(el("h4", "wensi-stack-title", tr("wensi_upkeep_draft", "Draft this stretch")));
    const range = el("div", "wensi-upkeep-row");
    const from = el("input", "wensi-field-input");
    from.type = "date";
    from.value = state.routinePlan?.kind === "draft" ? state.routinePlan.from : daysAgoIso(6);
    from.dataset.wensiDraftFrom = "true";
    const to = el("input", "wensi-field-input");
    to.type = "date";
    to.value = state.routinePlan?.kind === "draft" ? state.routinePlan.to : todayIso();
    to.dataset.wensiDraftTo = "true";
    const planButton = el("button", "btn mini-btn", tr("wensi_upkeep_plan", "Work out the plan"));
    planButton.type = "button";
    planButton.dataset.wensiRoutineDraft = "true";
    planButton.disabled = state.routineBusy;
    range.append(from, to, planButton);
    draft.append(range);
    if (state.routinePlan?.kind === "draft") {
      const plan = state.routinePlan;
      draft.append(el("p", "wensi-upkeep-line",
        `${plan.days} ${tr("wensi_upkeep_days", "days")} · ${tr("wensi_upkeep_missing", "no post yet")}: ${(plan.missing || []).join("、") || "—"}`));
      draft.append(el("p", "wensi-upkeep-line",
        `${tr("wensi_upkeep_models", "Models")}: ${plan.models?.pick || "—"} / ${plan.models?.write || "—"} · ${tr("wensi_upkeep_cap", "cap")} $${plan.maxSpendUsd || 0}`));
      for (const missing of plan.missingPrerequisites || []) draft.append(el("p", "wensi-upkeep-blocked", missing));
      const go = el("button", "btn mini-btn", state.draftBusy
        ? tr("wensi_upkeep_drafting", "Drafting…")
        : tr("wensi_upkeep_draft_go", "Draft"));
      go.type = "button";
      go.dataset.wensiDraftRun = "true";
      go.disabled = state.draftBusy || plan.ready !== true;
      go.title = plan.ready === true
        ? tr("wensi_upkeep_draft_why", "One model turn through the channel the site declares; nothing is written until you save.")
        : (plan.missingPrerequisites || []).join(" · ");
      draft.append(go);
      if (plan.channel) {
        draft.append(el("p", "wensi-upkeep-line", `${tr("wensi_upkeep_channel", "Channel")}: ${plan.channel}`));
      }
    }
    // The candidates, the receipt, and the one write (into the drafts folder).
    if (state.draftRun?.siteId === state.siteId) {
      const run = state.draftRun;
      draft.append(el("p", "wensi-upkeep-line", run.receipt
        ? `${tr("wensi_draft_receipt", "Answered by")} ${run.receipt.model || "—"} · ${run.receipt.inputTokens}/${run.receipt.outputTokens} tokens · ${run.receipt.note || ""}`
        : String(run.error || "")));
      for (const candidate of run.candidates || []) {
        const box = el("div", "wensi-draft-card");
        box.append(el("p", "wensi-draft-title", `${candidate.date} · ${candidate.title}${candidate.slug ? ` · /${candidate.slug}/` : ""}`));
        box.append(el("p", "wensi-draft-body", candidate.body));
        for (const finding of candidate.findings || []) {
          box.append(el("p", finding.severity === "error" ? "wensi-upkeep-blocked" : "wensi-upkeep-line",
            `${finding.severity === "error" ? "✕" : "!"} ${finding.message}`));
        }
        const save = el("button", "btn mini-btn", tr("wensi_draft_accept", "Save as draft"));
        save.type = "button";
        save.dataset.wensiDraftAccept = String((run.candidates || []).indexOf(candidate));
        save.disabled = state.draftBusy;
        box.append(save);
        draft.append(box);
      }
      if (run.acceptedNote) draft.append(el("p", "wensi-photo-note", run.acceptedNote));
    }
    wrap.append(draft);

    // 长文: chosen posts, verified to exist.
    const longform = el("section", "wensi-stack");
    longform.append(el("h4", "wensi-stack-title", tr("wensi_upkeep_longform", "Longform from these posts")));
    const postsInput = el("input", "wensi-field-input");
    postsInput.placeholder = tr("wensi_upkeep_longform_posts", "post filenames, separated by commas");
    postsInput.value = state.routinePlan?.kind === "longform" ? state.routinePlan.posts.join(", ") : "";
    postsInput.dataset.wensiLongformPosts = "true";
    const longformButton = el("button", "btn mini-btn", tr("wensi_upkeep_plan", "Work out the plan"));
    longformButton.type = "button";
    longformButton.dataset.wensiRoutineLongform = "true";
    longformButton.disabled = state.routineBusy;
    longform.append(postsInput, longformButton);
    if (state.routinePlan?.kind === "longform") {
      const plan = state.routinePlan;
      longform.append(el("p", "wensi-upkeep-line", plan.note || ""));
      for (const missing of plan.missingPrerequisites || []) longform.append(el("p", "wensi-upkeep-blocked", missing));
      const draftLong = el("button", "btn mini-btn", state.longformBusy
        ? tr("wensi_upkeep_drafting", "Drafting…")
        : tr("wensi_longform_go", "Draft the longform"));
      draftLong.type = "button";
      draftLong.dataset.wensiLongformRun = "true";
      draftLong.disabled = state.longformBusy || plan.ready !== true;
      draftLong.title = plan.ready === true ? "" : (plan.missingPrerequisites || []).join(" · ");
      longform.append(draftLong);
    }
    if (state.longformRun?.siteId === state.siteId) {
      const run = state.longformRun;
      const candidate = run.candidate;
      if (run.receipt) {
        longform.append(el("p", "wensi-upkeep-line",
          `${tr("wensi_draft_receipt", "Answered by")} ${run.receipt.model || "—"} · ${run.receipt.inputTokens}/${run.receipt.outputTokens} tokens · ${run.receipt.note || ""}`));
      }
      if (run.error) longform.append(el("p", "wensi-upkeep-blocked", run.error));
      if (candidate) {
        const card = el("div", "wensi-draft-card");
        card.append(el("p", "wensi-draft-title", `${candidate.title} · /long/${candidate.slug}/`));
        card.append(el("p", "wensi-upkeep-line", candidate.description));
        card.append(el("p", "wensi-upkeep-line", `${tr("wensi_longform_tags", "tags")}: ${candidate.tags.join("、")} · ${tr("wensi_longform_related", "linked posts")}: ${candidate.related.length}`));
        for (const warning of candidate.warnings || []) card.append(el("p", "wensi-upkeep-line", `! ${warning}`));
        for (const finding of candidate.findings || []) {
          card.append(el("p", finding.severity === "error" ? "wensi-upkeep-blocked" : "wensi-upkeep-line",
            `${finding.severity === "error" ? "✕" : "!"} ${finding.message}`));
        }
        const text = el("p", "wensi-draft-body", candidate.body.slice(0, 1_200));
        card.append(text);
        const save = el("button", "btn mini-btn", tr("wensi_longform_accept", "Write the longform"));
        save.type = "button";
        save.dataset.wensiLongformAccept = "true";
        save.disabled = state.longformBusy || candidate.blocked === true;
        card.append(save);
        longform.append(card);
      }
      if (run.acceptedNote) longform.append(el("p", "wensi-photo-note", run.acceptedNote));
    }
    wrap.append(longform);

    // 回扫: the month's posts and the packet command.
    const rescan = el("section", "wensi-stack");
    rescan.append(el("h4", "wensi-stack-title", tr("wensi_upkeep_rescan", "Rescan a month")));
    const month = el("input", "wensi-field-input");
    month.type = "month";
    month.value = state.routinePlan?.kind === "rescan" ? state.routinePlan.month : todayIso().slice(0, 7);
    month.dataset.wensiRescanMonth = "true";
    const rescanButton = el("button", "btn mini-btn", tr("wensi_upkeep_plan", "Work out the plan"));
    rescanButton.type = "button";
    rescanButton.dataset.wensiRoutineRescan = "true";
    rescanButton.disabled = state.routineBusy;
    rescan.append(month, rescanButton);
    if (state.routinePlan?.kind === "rescan") {
      const plan = state.routinePlan;
      rescan.append(el("p", "wensi-upkeep-line", plan.note || ""));
      for (const missing of plan.missingPrerequisites || []) rescan.append(el("p", "wensi-upkeep-blocked", missing));
      const build = el("button", "btn mini-btn", state.routineBusy
        ? tr("wensi_upkeep_busy", "Working…")
        : tr("wensi_upkeep_rescan_go", "Build the packet"));
      build.type = "button";
      build.dataset.wensiRescanRun = "true";
      build.disabled = state.routineBusy || plan.ready !== true;
      build.title = plan.ready === true ? "" : (plan.missingPrerequisites || []).join(" · ");
      rescan.append(build);

      const snap = el("button", "btn mini-btn", tr("wensi_rescan_snapshot", "Snapshot first"));
      snap.type = "button";
      snap.dataset.wensiRescanSnapshot = "true";
      snap.disabled = state.rescanBusy;
      rescan.append(snap);
      if (state.rescanSnapshot?.note) rescan.append(el("p", "wensi-upkeep-line", state.rescanSnapshot.note));

      for (const file of plan.posts || []) {
        const row = el("div", "wensi-rescan-row");
        row.append(el("p", "wensi-frame-file", file));
        const go = el("button", "btn mini-btn", state.rescanBusy
          ? tr("wensi_upkeep_busy", "Working…")
          : tr("wensi_rescan_rewrite", "Rewrite"));
        go.type = "button";
        go.dataset.wensiRescanRewrite = file;
        go.disabled = state.rescanBusy;
        row.append(go);
        rescan.append(row);
      }
    }
    if (state.rescanRewrite?.siteId === state.siteId) {
      const run = state.rescanRewrite;
      if (run.error) rescan.append(el("p", "wensi-upkeep-blocked", run.error));
      if (run.after) {
        rescan.append(el("p", "wensi-upkeep-line", `${run.file} — ${tr("wensi_rescan_compare", "before / after")}${run.applied ? ` · ${tr("wensi_rescan_written", "written")}` : ""}`));
        rescan.append(el("p", "wensi-draft-body", run.before));
        rescan.append(el("p", "wensi-draft-body", run.after));
        for (const finding of run.findings || []) {
          rescan.append(el("p", finding.severity === "error" ? "wensi-upkeep-blocked" : "wensi-upkeep-line",
            `${finding.severity === "error" ? "✕" : "!"} ${finding.message}`));
        }
        const apply = el("button", "btn mini-btn", tr("wensi_rescan_apply", "Approve and write"));
        apply.type = "button";
        apply.dataset.wensiRescanApply = "true";
        apply.disabled = state.rescanBusy || run.applied === true;
        rescan.append(apply);
      }
      if (state.rescanDirNote) rescan.append(el("p", "wensi-photo-note", state.rescanDirNote));
    }
    if (state.rescanRun?.siteId === state.siteId) {
      const run = state.rescanRun;
      rescan.append(el("p", "wensi-upkeep-line", String(run.note || run.error || "")));
      for (const file of run.files || []) {
        rescan.append(el("p", "wensi-upkeep-line", `${file.exists ? "✓" : "✕"} ${file.file}${file.exists ? ` · ${file.bytes} B` : ""}`));
      }
      if (run.output) {
        const log = el("pre", "wensi-upkeep-log");
        log.textContent = String(run.output).slice(-1_200);
        rescan.append(log);
      }
    }
    wrap.append(rescan);
    return wrap;
  }

  /**
   * One model turn. The plan's range is what gets asked for, so the writer sees
   * the days and the ceiling before the click; the receipt afterwards says which
   * model answered and what the ceiling was.
   */
  async function runDraftNow() {
    const site = currentSite();
    const plan = state.routinePlan?.kind === "draft" ? state.routinePlan : null;
    if (!site || !plan || state.draftBusy) return;
    state.draftBusy = true;
    state.draftRun = null;
    state.routineNote = "";
    renderInspector();
    try {
      const result = await client().draftRun(site.id, { from: plan.from, to: plan.to, type: "daily" });
      state.draftRun = { siteId: site.id, ...result };
      state.routineNote = String(result?.note || "");
    } catch (error) {
      state.draftRun = { siteId: site.id, candidates: [], receipt: null, error: String(error?.message || error) };
      state.routineNote = String(error?.message || error);
    } finally {
      state.draftBusy = false;
      renderInspector();
    }
  }

  /**
   * Saving one candidate is a file write, so it is its own click.
   * @param {HTMLButtonElement} button
   */
  async function acceptDraft(button) {
    const site = currentSite();
    const run = state.draftRun;
    const index = Number(button?.dataset?.wensiDraftAccept);
    if (!site || !run || state.draftBusy || !Number.isInteger(index)) return;
    const candidate = (run.candidates || [])[index];
    if (!candidate) return;
    state.draftBusy = true;
    renderInspector();
    try {
      const result = await client().draftAccept(site.id, {
        posts: [{ date: candidate.date, title: candidate.title, body: candidate.body }],
      });
      run.acceptedNote = String(result?.note || "");
    } catch (error) {
      run.acceptedNote = String(error?.message || error);
    } finally {
      state.draftBusy = false;
      renderInspector();
    }
  }

  /**
   * Build the month's packet. The script writes two files; the panel shows which
   * ones appeared, because "it ran" is not the same as "the packet is there".
   */
  async function runRescanNow() {
    const site = currentSite();
    const plan = state.routinePlan?.kind === "rescan" ? state.routinePlan : null;
    if (!site || !plan || state.routineBusy) return;
    state.routineBusy = true;
    state.rescanRun = null;
    renderInspector();
    try {
      const result = await client().routineRescan(site.id, { month: plan.month });
      state.rescanRun = { siteId: site.id, ...result };
    } catch (error) {
      state.rescanRun = { siteId: site.id, files: [], output: "", error: String(error?.message || error) };
    } finally {
      state.routineBusy = false;
      renderInspector();
    }
  }

  async function loadContactsNow() {
    const site = currentSite();
    if (!site || state.contactsBusy) return;
    state.contactsBusy = true;
    renderInspector();
    try {
      const result = await client().loadContacts(site.id);
      state.contactsRun = { siteId: site.id, ...result };
      state.contactsNote = "";
    } catch (error) {
      state.contactsRun = null;
      state.contactsNote = String(error?.message || error);
    } finally {
      state.contactsBusy = false;
      renderInspector();
    }
  }

  /**
   * Save every toggle as one plan. The panel sends the state the writer sees,
   * so a half-applied list is not a state this can leave behind.
   */
  async function saveContactsNow() {
    const site = currentSite();
    if (!site || state.contactsBusy || !dom?.fields) return;
    const conversations = [...dom.fields.querySelectorAll("[data-wensi-contact-conv]")].map((node) => {
      const [id, kind] = String(node.dataset.wensiContactConv || "").split("|");
      return { id, kind, enabled: node.checked };
    });
    const senders = [...dom.fields.querySelectorAll("[data-wensi-contact-sender]")].map((node) => ({
      id: String(node.dataset.wensiContactSender || ""),
      enabled: node.checked,
    }));
    state.contactsBusy = true;
    renderInspector();
    try {
      const result = await client().saveContacts(site.id, { conversations, senders });
      state.contactsNote = String(result?.note || "");
      const fresh = await client().loadContacts(site.id);
      state.contactsRun = { siteId: site.id, ...fresh };
    } catch (error) {
      state.contactsNote = String(error?.message || error);
    } finally {
      state.contactsBusy = false;
      renderInspector();
    }
  }

  async function runLongformNow() {
    const site = currentSite();
    const plan = state.routinePlan?.kind === "longform" ? state.routinePlan : null;
    if (!site || !plan || state.longformBusy) return;
    state.longformBusy = true;
    state.longformRun = null;
    renderInspector();
    try {
      const result = await client().longformRun(site.id, { posts: plan.posts });
      state.longformRun = { siteId: site.id, ...result };
    } catch (error) {
      state.longformRun = { siteId: site.id, candidate: null, receipt: null, error: String(error?.message || error) };
    } finally {
      state.longformBusy = false;
      renderInspector();
    }
  }

  async function acceptLongformNow() {
    const site = currentSite();
    const run = state.longformRun;
    const candidate = run?.candidate;
    if (!site || !candidate || state.longformBusy) return;
    state.longformBusy = true;
    renderInspector();
    try {
      const result = await client().longformAccept(site.id, { candidate, date: todayIso() });
      run.acceptedNote = String(result?.note || "");
    } catch (error) {
      run.acceptedNote = String(error?.message || error);
    } finally {
      state.longformBusy = false;
      renderInspector();
    }
  }

  async function snapshotRescan() {
    const site = currentSite();
    const plan = state.routinePlan?.kind === "rescan" ? state.routinePlan : null;
    if (!site || !plan || state.rescanBusy) return;
    state.rescanBusy = true;
    renderInspector();
    try {
      state.rescanSnapshot = await client().rescanAction(site.id, { action: "snapshot", month: plan.month });
    } catch (error) {
      state.rescanSnapshot = { note: String(error?.message || error) };
    } finally {
      state.rescanBusy = false;
      renderInspector();
    }
  }

  /** @param {HTMLButtonElement} button */
  async function rewriteOne(button) {
    const site = currentSite();
    const plan = state.routinePlan?.kind === "rescan" ? state.routinePlan : null;
    const file = String(button?.dataset?.wensiRescanRewrite || "");
    if (!site || !plan || !file || state.rescanBusy) return;
    state.rescanBusy = true;
    state.rescanRewrite = null;
    renderInspector();
    try {
      const result = await client().rescanAction(site.id, { action: "rewrite", month: plan.month, file });
      state.rescanRewrite = { siteId: site.id, ...result };
    } catch (error) {
      state.rescanRewrite = { siteId: site.id, file, error: String(error?.message || error) };
    } finally {
      state.rescanBusy = false;
      renderInspector();
    }
  }

  async function applyRewriteNow() {
    const site = currentSite();
    const plan = state.routinePlan?.kind === "rescan" ? state.routinePlan : null;
    const run = state.rescanRewrite;
    if (!site || !plan || !run?.after || state.rescanBusy) return;
    state.rescanBusy = true;
    renderInspector();
    try {
      const result = await client().rescanAction(site.id, { action: "apply", month: plan.month, file: run.file, body: run.after });
      state.rescanDirNote = String(result?.note || "");
      if (result?.snapshot?.note) state.rescanSnapshot = result.snapshot;
      run.applied = true;
    } catch (error) {
      state.rescanDirNote = String(error?.message || error);
    } finally {
      state.rescanBusy = false;
      renderInspector();
    }
  }

  function daysAgoIso(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  async function loadRoutine() {
    const site = currentSite();
    if (!site || state.routineBusy) return;
    state.routineBusy = true;
    renderInspector();
    try {
      const result = await client().loadRoutine(site.id);
      state.routineRun = { siteId: site.id, ...result, error: "" };
    } catch (error) {
      state.routineRun = { siteId: site.id, declared: false, note: "", error: String(error?.message || error) };
    } finally {
      state.routineBusy = false;
      renderInspector();
    }
  }

  /**
   * Start or stop the sync. A running sync is polled while it runs, so the log
   * and the corpus count move on screen instead of freezing at "started".
   * @param {"start" | "stop"} action
   */
  async function runRoutineSync(action) {
    const site = currentSite();
    if (!site || state.routineBusy) return;
    state.routineBusy = true;
    renderInspector();
    try {
      const result = await client().routineSync(site.id, { action });
      state.routineNote = String(result?.note || "");
      const fresh = await client().loadRoutine(site.id);
      state.routineRun = { siteId: site.id, ...fresh, error: "" };
      if (fresh?.run?.status === "running") pollRoutine(site.id);
    } catch (error) {
      state.routineNote = String(error?.message || error);
    } finally {
      state.routineBusy = false;
      renderInspector();
    }
  }

  let routinePoll = null;
  function pollRoutine(siteId) {
    if (routinePoll) clearTimeout(routinePoll);
    routinePoll = setTimeout(async () => {
      routinePoll = null;
      // A closed window has nothing to show: stop asking. The next sync action
      // re-arms the poll.
      const win = winEl();
      if (!win || win.classList.contains("is-hidden") || state.siteId !== siteId) return;
      try {
        const fresh = await client().loadRoutine(siteId);
        if (state.siteId !== siteId) return;
        state.routineRun = { siteId, ...fresh, error: "" };
        if (fresh?.run && fresh.run.status !== "running") {
          state.routineNote = tr("wensi_upkeep_sync_done", "Finished: {n} new corpus lines.").replace("{n}", String(fresh.run.newLines || 0));
        }
        renderInspector();
        if (fresh?.run?.status === "running") pollRoutine(siteId);
      } catch {
        // A poll that fails leaves the last known state on screen; the next
        // manual read will say what happened.
      }
    }, 2500);
  }

  /**
   * @param {"draft" | "longform" | "rescan"} kind
   */
  async function planRoutine(kind) {
    const site = currentSite();
    if (!site || state.routineBusy) return;
    const panel = dom?.fields;
    const body = { kind };
    if (kind === "draft") {
      body.from = String(panel?.querySelector("[data-wensi-draft-from]")?.value || "");
      body.to = String(panel?.querySelector("[data-wensi-draft-to]")?.value || "");
    } else if (kind === "longform") {
      body.posts = String(panel?.querySelector("[data-wensi-longform-posts]")?.value || "")
        .split(/[,，\s]+/).map((entry) => entry.trim()).filter(Boolean);
    } else {
      body.month = String(panel?.querySelector("[data-wensi-rescan-month]")?.value || "");
    }
    state.routineBusy = true;
    // New inputs: any candidate from the previous plan is about another range
    // or another month.
    state.draftRun = null;
    state.longformRun = null;
    state.rescanRewrite = null;
    state.rescanDirNote = "";
    renderInspector();
    try {
      const result = await client().routinePlan(site.id, body);
      state.routinePlan = { ...result, kind };
      state.routineNote = String(result?.note || "");
    } catch (error) {
      state.routinePlan = null;
      state.routineNote = String(error?.message || error);
    } finally {
      state.routineBusy = false;
      renderInspector();
    }
  }

  /**
   * 预言账本: the list, oldest undecided first, and the one write — the verdict.
   */
  function ledgerPanel() {
    const wrap = el("div", "wensi-ledger");
    if (state.demoMode) {
      wrap.append(el("p", "wensi-group-empty", tr("wensi_ledger_demo", "The demo site has no ledger.")));
      return wrap;
    }
    const run = state.ledgerRun && state.ledgerRun.siteId === state.siteId ? state.ledgerRun : null;
    const head = el("div", "wensi-check-head");
    const loadButton = el("button", "btn mini-btn", state.ledgerBusy ? tr("wensi_ledger_busy", "Reading…") : tr("wensi_ledger_load", "Read the ledger"));
    loadButton.type = "button";
    loadButton.dataset.wensiLedgerLoad = "true";
    loadButton.disabled = state.ledgerBusy;
    head.append(loadButton);
    if (run?.summary) {
      const tally = el("span", "wensi-check-tally");
      tally.textContent = `${tr("wensi_ledger_pending", "pending")} ${run.summary.pending} · ${tr("wensi_ledger_hit", "hit")} ${run.summary.hit} · ${tr("wensi_ledger_miss", "miss")} ${run.summary.miss}`;
      head.append(tally);
    }
    wrap.append(head);
    if (state.ledgerNote) wrap.append(el("p", "wensi-photo-note", state.ledgerNote));
    if (run?.error) wrap.append(el("p", "wensi-group-error", run.error));
    if (run?.errors?.length) {
      wrap.append(el("p", "wensi-upkeep-blocked", tr("wensi_ledger_errors", "{n} entries could not be read and are listed as errors, not dropped.").replace("{n}", String(run.errors.length))));
    }
    for (const entry of run?.entries || []) {
      const row = el("div", "wensi-ledger-row");
      const head2 = el("p", "wensi-ledger-claim");
      head2.textContent = entry.claim;
      const meta = el("p", "wensi-ledger-meta");
      meta.textContent = `${entry.date || entry.made} · ${entry.title || entry.file}${entry.due ? ` · ${tr("wensi_ledger_due", "due")} ${entry.due}` : ""}`;
      const controls = el("div", "wensi-frame-controls");
      const select = el("select", "wensi-field-input wensi-ledger-select");
      select.dataset.wensiPredictionStatus = `${entry.file}|${entry.index}`;
      select.setAttribute("aria-label", `${tr("wensi_ledger_settle", "Record")}: ${entry.claim.slice(0, 40)}`);
      for (const [value, label] of [["pending", tr("wensi_ledger_pending", "Pending")], ["hit", tr("wensi_ledger_hit", "Hit")], ["miss", tr("wensi_ledger_miss", "Miss")]]) {
        select.append(new Option(label, value, false, value === entry.status));
      }
      select.disabled = state.ledgerBusy;
      const settleButton = el("button", "btn mini-btn", tr("wensi_ledger_settle", "Record"));
      settleButton.type = "button";
      settleButton.dataset.wensiPredictionSettle = `${entry.file}|${entry.index}`;
      settleButton.disabled = state.ledgerBusy;
      controls.append(select, settleButton);
      row.append(head2, meta, controls);
      wrap.append(row);
    }
    if (run && !run.error && !(run.entries || []).length) {
      wrap.append(el("p", "wensi-group-empty", tr("wensi_ledger_empty", "This site has no predictions yet.")));
    }
    return wrap;
  }

  async function loadLedger() {
    const site = currentSite();
    if (!site || state.ledgerBusy) return;
    state.ledgerBusy = true;
    state.ledgerNote = "";
    renderInspector();
    try {
      const result = await client().loadPredictions(site.id);
      state.ledgerRun = { siteId: site.id, ...result, error: "" };
    } catch (error) {
      state.ledgerRun = { siteId: site.id, entries: [], summary: null, errors: [], error: String(error?.message || error) };
    } finally {
      state.ledgerBusy = false;
      renderInspector();
    }
  }

  /**
   * @param {HTMLButtonElement} button
   */
  async function settleFromButton(button) {
    const site = currentSite();
    const key = button?.dataset?.wensiPredictionSettle || "";
    if (!site || !key || state.ledgerBusy) return;
    const [file, index] = key.split("|");
    const select = dom?.fields?.querySelector(`[data-wensi-prediction-status="${CSS.escape(key)}"]`);
    const status = String(select?.value || "");
    state.ledgerBusy = true;
    renderInspector();
    try {
      const result = await client().settlePrediction(site.id, { file, index: Number(index), status });
      state.ledgerNote = String(result?.note || "");
      const fresh = await client().loadPredictions(site.id);
      state.ledgerRun = { siteId: site.id, ...fresh, error: "" };
    } catch (error) {
      state.ledgerNote = String(error?.message || error);
    } finally {
      state.ledgerBusy = false;
      renderInspector();
    }
  }

  /**
   * 标签: rename a tag or merge it into another. The plan comes first and lists
   * every article the rename would touch; the button that writes says how many
   * files it will change. Old tag addresses keep answering because the server
   * also records a redirect in the site's tag table.
   */
  function tagPanel() {
    const wrap = el("div", "wensi-tags-admin");
    const taxonomyData = state.taxonomy;
    const canon = Array.isArray(taxonomyData?.tags?.canon) ? taxonomyData.tags.canon : [];
    const plan = state.renamePlan && state.renamePlan.siteId === state.siteId ? state.renamePlan : null;

    const hint = el("p", "wensi-group-empty",
      canon.length
        ? tr("wensi_tags_hint", "把旧标签改成新名字，或并进已有标签。改完会补一条旧网址的跳转。")
        : tr("wensi_tags_none", "这个站点的标签表还没读出来。"));
    wrap.append(hint);

    const form = el("div", "wensi-rename-form");
    const fromInput = el("input", "wensi-field-input");
    fromInput.placeholder = tr("wensi_tags_from", "旧标签");
    fromInput.dataset.wensiRenameFrom = "true";
    const toInput = el("input", "wensi-field-input");
    toInput.placeholder = tr("wensi_tags_to", "新标签");
    toInput.dataset.wensiRenameTo = "true";
    toInput.setAttribute("list", "wensi-tag-canon");
    const list = el("datalist");
    list.id = "wensi-tag-canon";
    for (const name of canon) {
      const option = el("option");
      option.value = name;
      list.append(option);
    }
    form.append(fromInput, toInput, list);
    wrap.append(form);

    const actions = el("div", "wensi-check-head");
    const planButton = el("button", "btn mini-btn", state.renameBusy ? tr("wensi_tags_working", "Working…") : tr("wensi_tags_plan", "看会影响哪些稿子"));
    planButton.type = "button";
    planButton.dataset.wensiRenamePlan = "true";
    planButton.disabled = state.renameBusy;
    actions.append(planButton);
    if (plan?.applied) {
      const done = el("span", "wensi-check-tally");
      done.textContent = tr("wensi_tags_done", "已改完");
      actions.append(done);
    }
    wrap.append(actions);

    if (plan?.error) wrap.append(el("p", "wensi-group-error", plan.error));
    if (plan && !plan.error) {
      const line = el("p", plan.articles?.length ? "wensi-publish-line" : "wensi-publish-pending");
      line.textContent = plan.applied
        ? tr("wensi_tags_applied_note", "已经写进稿件与标签表。")
        : `${plan.from} → ${plan.to}${plan.merge ? tr("wensi_tags_merge", "（并入已有标签）") : ""}：${plan.articles?.length || 0} ${tr("wensi_tags_articles", "篇投稿会改")}`;
      wrap.append(line);
      if (plan.articles?.length) {
        const listNode = el("ul", "wensi-findings");
        for (const article of plan.articles.slice(0, 50)) {
          const row = el("li", "wensi-finding is-info");
          const mark = el("span", "wensi-finding-mark", "·");
          mark.setAttribute("aria-hidden", "true");
          const text = el("span", "wensi-finding-text", `${article.type}/${article.file}`);
          row.append(mark, text);
          listNode.append(row);
        }
        wrap.append(listNode);
      }
      if (!plan.applied) {
        const apply = el("button", "btn mini-btn", plan.articles?.length
          ? `${tr("wensi_tags_apply", "改这些稿子")}（${plan.articles.length}）`
          : tr("wensi_tags_apply_table", "只改标签表"));
        apply.type = "button";
        apply.dataset.wensiRenameApply = "true";
        apply.disabled = state.renameBusy;
        wrap.append(apply);
      }
    }
    return wrap;
  }

  /**
   * @param {boolean} confirm false plans, true writes.
   */
  async function runRename(confirm) {
    const site = currentSite();
    if (!site || state.renameBusy) return;
    const form = dom?.fields?.querySelector("[data-wensi-rename-from]")?.closest(".wensi-rename-form");
    const plan = state.renamePlan && state.renamePlan.siteId === state.siteId ? state.renamePlan : null;
    const from = String(form?.querySelector("[data-wensi-rename-from]")?.value || plan?.from || "").trim();
    const to = String(form?.querySelector("[data-wensi-rename-to]")?.value || plan?.to || "").trim();
    if (!from || !to) {
      state.renamePlan = { siteId: site.id, error: tr("wensi_tags_need_both", "旧标签和新标签都要填。") };
      renderInspector();
      return;
    }
    if (confirm && (!plan || plan.from !== from || plan.to !== to)) {
      state.renamePlan = { siteId: site.id, error: tr("wensi_tags_plan_first", "先看一眼会影响哪些稿子，再改。") };
      renderInspector();
      return;
    }
    state.renameBusy = true;
    renderInspector();
    try {
      const result = await client().renameTag(site.id, confirm ? { from, to, confirm: "rename" } : { from, to });
      state.renamePlan = {
        siteId: site.id,
        from,
        to,
        merge: !!result.merge,
        articles: result.articles || [],
        applied: confirm && result.dryRun === false,
        error: "",
      };
      if (confirm) {
        // Re-select the site: the tag table and the article list both changed,
        // and re-reading them is the same path a site switch already takes —
        // the picker then offers the new name, not the one just retired.
        await selectSite(site.id);
      }
    } catch (error) {
      state.renamePlan = { siteId: site.id, from, to, articles: [], error: String(error?.message || error) };
    } finally {
      state.renameBusy = false;
      renderInspector();
    }
  }

  /**
   * 媒体: the site's image directory and the two things a writer can act on —
   * an image with no alternative text, and an image nothing on the site uses.
   * The list is a reading aid, not an editor yet: opening one in the image view
   * belongs to the photo work, and pretending otherwise would be a promise the
   * panel cannot keep.
   */
  function mediaPanel() {
    const wrap = el("div", "wensi-media");
    const run = state.mediaRun && state.mediaRun.siteId === state.siteId ? state.mediaRun : null;
    const head = el("div", "wensi-check-head");
    const runButton = el("button", "btn mini-btn", state.mediaBusy ? tr("wensi_media_scanning", "Scanning…") : tr("wensi_media_scan", "Scan images"));
    runButton.type = "button";
    runButton.disabled = state.mediaBusy;
    runButton.dataset.wensiMediaScan = "true";
    head.append(runButton);
    // A count is only worth showing when a scan actually read the directory.
    if (run?.summary && !run.error) {
      const tally = el("span", "wensi-check-tally");
      tally.textContent = `${run.summary.files} ${tr("wensi_media_files", "images")} · ${run.summary.missingAlt} ${tr("wensi_media_missing_alt", "no alt")} · ${run.summary.unused} ${tr("wensi_media_unused", "unused")}`;
      head.append(tally);
    }
    wrap.append(head);
    if (run?.error) {
      wrap.append(el("p", "wensi-group-error", run.error));
    }
    if (run?.files?.length) {
      const list = el("ul", "wensi-findings");
      for (const entry of run.files) {
        const row = el("li", `wensi-finding ${entry.used ? "is-info" : "is-warn"}`);
        const mark = el("span", "wensi-finding-mark");
        mark.textContent = entry.missingAlt ? "✕" : entry.used ? "·" : "!";
        mark.setAttribute("aria-hidden", "true");
        const text = el("span", "wensi-finding-text");
        const flags = [];
        if (entry.missingAlt) flags.push(tr("wensi_media_no_alt", "缺替代文字"));
        if (!entry.used) flags.push(tr("wensi_media_not_used", "没被用到"));
        text.textContent = `${entry.file}${flags.length ? ` — ${flags.join("，")}` : ""}`;
        row.title = `${entry.url}${entry.usedBy?.length ? `
${entry.usedBy.join("、")}` : ""}`;
        row.append(mark, text);
        list.append(row);
      }
      wrap.append(list);
    } else if (run && !run.error) {
      wrap.append(el("p", "wensi-group-empty", tr("wensi_media_empty", "No images in the site's directory.")));
    }
    return wrap;
  }

  async function scanMedia() {
    const site = currentSite();
    if (!site || state.mediaBusy) return;
    state.mediaBusy = true;
    renderInspector();
    try {
      const result = await client().loadMedia(site.id);
      const reason = result?.ok === false
        ? (result.code === "demo_only"
          ? tr("wensi_media_demo", "演示站点没有图片目录。")
          : result.code === "folder_grant_required"
            ? tr("wensi_media_grant", "图片目录还没共享给 AI System 6。在「选择器」里共享后再扫。")
            : (result.error || tr("wensi_media_failed", "这一次没能扫描图片。")))
        : "";
      state.mediaRun = { siteId: site.id, files: result?.files || [], summary: result?.summary || null, error: reason, at: Date.now() };
    } catch (error) {
      state.mediaRun = { siteId: site.id, files: [], summary: null, error: String(error?.message || error), at: Date.now() };
    } finally {
      state.mediaBusy = false;
      renderInspector();
    }
  }

  function checkPanel() {
    const wrap = el("div", "wensi-check");
    const run = state.checkRun && state.checkRun.key === draftKey() ? state.checkRun : null;
    const head = el("div", "wensi-check-head");
    const runButton = el("button", "btn mini-btn", state.checking ? tr("wensi_check_running", "Checking…") : tr("wensi_check_run", "Check now"));
    runButton.type = "button";
    runButton.disabled = state.checking;
    runButton.dataset.wensiCheckRun = "true";
    head.append(runButton);
    if (run?.summary) {
      const tally = el("span", "wensi-check-tally");
      tally.textContent = `${run.summary.error} ${tr("wensi_check_errors", "to fix")} · ${run.summary.warn} ${tr("wensi_check_warns", "to read")} · ${run.summary.info} ${tr("wensi_check_notes", "notes")}`;
      head.append(tally);
    }
    wrap.append(head);
    if (run?.error) {
      const error = el("p", "wensi-group-error");
      error.textContent = run.error;
      wrap.append(error);
    }
    if (run?.packages?.length) {
      const ran = el("p", "wensi-check-packages");
      ran.textContent = run.packages
        .map((entry) => `${entry.label || entry.id}${entry.status === "ran" ? "" : ` (${entry.status})`}`)
        .join(" · ");
      wrap.append(ran);
    }
    if (run?.findings?.length) {
      const list = el("ul", "wensi-findings");
      for (const finding of run.findings) {
        const row = el("li", `wensi-finding is-${finding.severity || "info"}`);
        const mark = el("span", "wensi-finding-mark");
        mark.textContent = finding.severity === "error" ? "✕" : finding.severity === "warn" ? "!" : "·";
        mark.setAttribute("aria-hidden", "true");
        const text = el("span", "wensi-finding-text");
        text.textContent = finding.fixHint ? `${finding.message} ${finding.fixHint}` : finding.message;
        row.append(mark, text);
        row.title = `${finding.checkId || ""}${finding.excerpt ? ` — ${finding.excerpt}` : ""}`;
        list.append(row);
      }
      wrap.append(list);
    } else if (run && !run.error) {
      wrap.append(el("p", "wensi-group-empty", tr("wensi_check_clean", "No findings. This draft reads clean to the site's checks.")));
    }
    wrap.append(publishPanel(run));
    return wrap;
  }

  // 发布: three steps, each a click. Red findings close the door (D4); the
  // deploy step asks a second time, because it puts the article on the site.
  async function uploadChosenImage(input, status) {
    const picked = input.files && input.files[0];
    input.value = "";
    const site = currentSite();
    if (!picked || !state.draft || !site) return;
    if (picked.size > 8 * 1024 * 1024) {
      status.error = tr("wensi_publish_media_too_big", "That image is over 8 MB, so it was not uploaded.");
      renderInspector();
      return;
    }
    try {
      const dataBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const text = String(reader.result || "");
          const comma = text.indexOf(",");
          resolve(comma >= 0 ? text.slice(comma + 1) : text);
        };
        reader.onerror = () => reject(reader.error || new Error("read failed"));
        reader.readAsDataURL(picked);
      });
      const result = await client().uploadMicropubMedia(site.id, {
        filename: picked.name,
        contentType: picked.type || "application/octet-stream",
        dataBase64,
      });
      const url = String(result?.url || "");
      if (!url) throw new Error(tr("wensi_publish_media_failed", "The image uploaded, but the site did not return an address."));
      state.draft.body = `${state.draft.body || ""}\n\n![${picked.name}](${url})\n`;
      markDirty();
      renderWriting();
      menuStatus(tr("wensi_publish_media_done", "The image is uploaded and its address is in the draft."));
    } catch (error) {
      status.error = String(error?.message || error);
      renderInspector();
    }
  }

  function publishPanel(run) {
    const wrap = el("section", "wensi-publish");
    // Checks, not this file's `blockers`: a red finding in the check run holds
    // the publish. The plan's own blockers are read below.
    const redFindings = run?.summary?.error || 0;
    const status = state.publish || {};
    const title = el("h4", "wensi-publish-title", tr("wensi_publish_title", "Publish"));
    wrap.append(title);
    if (state.demoMode) {
      wrap.append(el("p", "wensi-group-empty", tr("wensi_publish_demo", "The demo site has no publishing channel.")));
      return wrap;
    }
    const button = (label, key, disabled) => {
      const node = el("button", "btn mini-btn", label);
      node.type = "button";
      node.dataset[key] = "true";
      node.disabled = Boolean(disabled) || Boolean(status.busy);
      return node;
    };
    const errors = [];
    const line = (text, cls = "wensi-publish-line") => {
      const node = el("p", cls);
      node.textContent = text;
      errors.push(node);
      wrap.append(node);
    };

    if (redFindings > 0) {
      line(tr("wensi_publish_blocked", "有要修的项挡着发布。先把检查里的红项改掉，再发。"), "wensi-publish-blocked");
      return wrap;
    }
    if (!run) {
      line(tr("wensi_publish_need_check", "先跑一次检查，再发。"));
      return wrap;
    }

    if (!status.plan) {
      wrap.append(button(tr("wensi_publish_plan", "看发布步骤"), "wensiPublishPlan"));
    } else {
      const plan = status.plan;
      const isMicropub = plan.channel === "micropub";
      const runLabel = (id) => (id === "micropub-post" ? tr("wensi_publish_micropub_post", "Micropub POST") : id);
      line(`${tr("wensi_publish_will_run", "会跑：")}${(plan.willRun || []).map(runLabel).join(" → ") || "—"}`);
      line(`${tr("wensi_publish_will_write", "会写：")}${(plan.willWrite || []).join("、") || tr("wensi_publish_nothing", "不写文件（这个类型直接改在站点里）")}`);
      // The site's build refuses a frame with no alternative text, and it
      // refuses the whole build — so the plan says so before anything runs.
      const planBlockers = Array.isArray(plan.blockers) ? plan.blockers : [];
      for (const blocker of planBlockers) line(String(blocker.message || blocker.code || ""), "wensi-publish-blocked");
      // Micropub's missing token is fixed here, once: the token field is the
      // only place the secret is typed, and it is cleared right after saving.
      if (isMicropub && !plan.tokenConfigured) {
        line(tr("wensi_publish_token_hint", "token 只进钥匙串，不写进站点描述。"));
        const row = el("div", "wensi-publish-token");
        const input = el("input", "wensi-wizard-input");
        input.type = "password";
        input.autocomplete = "off";
        input.placeholder = tr("wensi_publish_token", "Micropub token");
        const save = el("button", "btn mini-btn", tr("wensi_publish_token_save", "存 token"));
        save.type = "button";
        save.disabled = Boolean(status.busy);
        save.addEventListener("click", async () => {
          const value = String(input.value || "").trim();
          if (!value) return;
          save.disabled = true;
          try {
            await client().saveMicropubToken(currentSite().id, value);
            input.value = "";
            status.plan = null;
            status.prepare = null;
            status.deploy = null;
            status.error = "";
            await publishStep("plan");
            menuStatus(tr("wensi_add_site_token_saved", "token 已存进钥匙串。"));
          } catch (error) {
            status.error = String(error?.message || error);
            renderInspector();
          } finally {
            save.disabled = false;
          }
        });
        row.append(input, save);
        wrap.append(row);
      }
      if (isMicropub && plan.tokenConfigured) {
        const row = el("div", "wensi-publish-token");
        const remove = el("button", "btn mini-btn", tr("wensi_publish_token_delete", "Delete the Keychain token"));
        remove.type = "button";
        remove.disabled = Boolean(status.busy);
        remove.addEventListener("click", async () => {
          remove.disabled = true;
          try {
            await client().deleteMicropubToken(currentSite().id);
            status.plan = null;
            status.prepare = null;
            status.deploy = null;
            status.error = "";
            await publishStep("plan");
            menuStatus(tr("wensi_publish_token_deleted", "The Keychain token was deleted."));
          } catch (error) {
            status.error = String(error?.message || error);
            renderInspector();
          }
        });
        row.append(remove);
        if (plan.mediaEndpoint) {
          const file = el("input");
          file.type = "file";
          file.accept = "image/*";
          file.hidden = true;
          const choose = el("button", "btn mini-btn", tr("wensi_publish_media_choose", "Choose an image…"));
          choose.type = "button";
          choose.disabled = Boolean(status.busy);
          choose.addEventListener("click", () => file.click());
          file.addEventListener("change", () => { void uploadChosenImage(file, status); });
          row.append(choose, file);
        }
        wrap.append(row);
      }
      // Micropub has no local prepare/build: the saved article is the payload.
      if (!isMicropub && !status.prepare) {
        wrap.append(button(tr("wensi_publish_prepare", "准备并构建"), "wensiPublishPrepare", !plan.willRun?.length || planBlockers.length > 0));
      }
      if (!isMicropub && status.prepare) {
        line(status.prepare.changed ? tr("wensi_publish_prepared", "已写入站点并构建完成。") : tr("wensi_publish_prepared_nochange", "站点已是最新，构建完成。"), "wensi-publish-ok");
      }
      if ((isMicropub || status.prepare) && !status.deploy && planBlockers.length === 0) {
        wrap.append(button(tr("wensi_publish_deploy_confirm", "确认部署到线上"), "wensiPublishDeploy"));
      }
      if (status.deploy) {
        line(status.deploy.ok ? tr("wensi_publish_deployed", "已部署，网址确认通过。") : (status.deploy.note || tr("wensi_publish_deploy_pending", "已部署，网址还没确认。")), status.deploy.ok ? "wensi-publish-ok" : "wensi-publish-pending");
      }
    }
    if (status.error) {
      const node = el("p", "wensi-group-error");
      node.textContent = status.error;
      wrap.append(node);
    }
    return wrap;
  }

  // ---- Checks and publishing (P2/P3) ---------------------------------------

  /** The payload both stages of the gate read: the draft exactly as it stands. */
  function draftPayload() {
    const draft = state.draft;
    if (!draft) return null;
    return {
      type: draft.type,
      path: draft.path || "",
      filename: draft.path ? draft.path.split("/").pop() : newFileName(draft),
      frontMatter: draft.frontMatter || {},
      body: draft.body || "",
      url: draft.url || "",
    };
  }

  function newFileName(draft) {
    const slug = String(draft.frontMatter?.slug || "untitled");
    const date = String(draft.frontMatter?.date || todayStamp());
    return `${date}-${slug}.md`;
  }

  async function runCheck() {
    const payload = draftPayload();
    const site = currentSite();
    if (!payload || !site || state.checking) return;
    const key = draftKey();
    state.checking = true;
    state.checkRun = { key, findings: [], summary: null, packages: [], error: "" };
    renderInspector();
    try {
      // Save first: the checks judge what the site would receive, and an
      // unsaved edit is not what the writer is looking at.
      if (state.dirty) await flushSave();
      const result = await client().checkArticle(site.id, payload);
      if (result?.ok === false) {
        const reason = result.code === "demo_only"
          ? tr("wensi_check_demo", "演示站点不跑站点检查；接上真站点后，检查结果出现在这里。")
          : result.code === "tools_unavailable"
            ? tr("wensi_check_tools_missing", "站点的检查脚本目录还没共享给 AI System 6；共享后重跑。")
            : tr("wensi_check_unavailable", "这一次没能跑检查。");
        state.checkRun = { key, findings: [], summary: null, packages: result?.packages || [], error: reason };
      } else {
        state.checkRun = { key, findings: result.findings || [], summary: result.summary || { error: 0, warn: 0, info: 0 }, packages: result.packages || [], error: "" };
      }
    } catch (error) {
      state.checkRun = { key, findings: [], summary: null, packages: [], error: String(error?.message || error) };
    } finally {
      state.checking = false;
      renderInspector();
    }
  }

  /**
   * One publish step at a time. Plan and prepare are safe to repeat; deploy
   * only runs from its own button, and the client sends the confirm word.
   */
  async function publishStep(stage) {
    const payload = draftPayload();
    const site = currentSite();
    if (!payload || !site) return;
    const status = state.publish || (state.publish = {});
    if (status.busy) return;
    status.busy = true;
    status.error = "";
    renderInspector();
    try {
      if (stage === "plan") {
        status.plan = await client().publishPlan(site.id, payload);
        status.prepare = null;
        status.deploy = null;
      } else if (stage === "prepare") {
        const prepared = await client().publishPrepare(site.id, payload);
        status.prepare = prepared.prepared || prepared;
        if (prepared.build) status.build = prepared.build;
      } else if (stage === "deploy") {
        status.deploy = await client().publishDeploy(site.id, { ...payload, expectText: String(payload.frontMatter?.title || "").slice(0, 24) });
      }
    } catch (error) {
      status.error = String(error?.message || error);
    } finally {
      status.busy = false;
      renderInspector();
    }
  }

  function refreshFieldPreviews() {
    const draft = state.draft;
    const node = dom?.fields?.querySelector("[data-wensi-url-preview]");
    if (!node) return;
    node.textContent = draft
      ? articleUrlPreview(currentSite(), draft.type, draft.frontMatter, state.articlesByType.get(draft.type) || [], draft.path)
      : "";
  }

  function refreshUrlPreviewsAfterEdit() {
    refreshUrlPreview();
    refreshFieldPreviews();
  }

  function refreshRequired() {
    if (!dom?.fields || !dom.requiredHint) return;
    const draft = state.draft;
    const type = draft ? currentSite()?.contentTypes?.[draft.type] : null;
    const missing = type ? requiredMissing(type.fields, draft.frontMatter) : [];
    dom.requiredHint.textContent = missing.length ? `${tr("wensi_required_missing", "Required: ")}${missing.join(", ")}` : "";
    dom.requiredHint.hidden = !missing.length;
    dom.fields.querySelectorAll("input[data-wensi-field], textarea[data-wensi-field]").forEach((control) => {
      control.classList.toggle("is-required-missing", missing.includes(control.dataset.wensiField));
    });
  }

  function refreshSaveNote() {
    if (!dom?.saveNote) return;
    const map = {
      dirty: tr("wensi_save_dirty", "Unsaved changes"),
      saving: tr("wensi_save_saving", "Saving…"),
      saved: `${tr("wensi_save_saved", "Saved")} ${state.savedAt}${state.saveWarning ? ` · ${state.saveWarning}` : ""}`.trim(),
      error: state.saveError
        ? `${tr("wensi_save_error", "Save failed — retries on the next pause")} (${state.saveError})`
        : tr("wensi_save_error", "Save failed — retries on the next pause"),
    };
    dom.saveNote.textContent = map[state.saveState] || "";
  }

  function updateStatus() {
    const win = winEl();
    if (!win) return;
    const site = currentSite();
    const siteNode = win.querySelector("[data-wensi-site]");
    if (siteNode) {
      siteNode.textContent = site ? `${site.label || site.id}${state.demoMode ? ` · ${tr("wensi_demo_badge", "Demo")}` : ""}` : "";
      siteNode.title = state.demoMode ? tr("wensi_demo_hint", "The server is not reachable; this is the built-in demo site.") : "";
    }
    const contextNode = win.querySelector("[data-wensi-context]");
    if (contextNode) {
      const visible = filterArticles(flattenedArticles(), state.query, state.statusFilter, state.categoryFilter).length;
      contextNode.textContent = `${visible} ${tr("wensi_items", "articles")}`;
    }
    const saveNode = win.querySelector("[data-wensi-save-state]");
    if (saveNode) {
      saveNode.textContent = state.readOnly
        ? tr("wensi_public_read_only", "The public edition shows a demo library and cannot save, publish or sync.")
        : dom?.saveNote?.textContent || "";
    }
  }

  // ---- 添加站点 (P7) --------------------------------------------------------
  //
  // One dialog, one write. The common path asks four questions and uses the
  // Hexo template's defaults; the remaining values are the description's own
  // (storage dir, URL shape, tag table, media dir), so the wizard never invents
  // a field the server does not validate. The preview is the server's dry run:
  // validation, the grants each directory needs, and the exact next step.
  // Nothing is written until the dry run passed and the owner clicks again.

  // One extra content type, shaped the way validateSiteDescription already
  // accepts. The first type stays `posts` from the template; this builds the
  // ones the writer adds. The draft directory sits beside the storage
  // directory so two types do not share one draft folder.
  function wizardExtraContentType(row) {
    const id = String(row?.id || "").trim();
    const dir = String(row?.storage || "").trim().replace(/\/+$/, "");
    const parent = dir.replace(/\/[^/]+$/, "");
    return {
      id,
      type: {
        label: String(row?.label || "").trim() || id || "文章",
        storage: { kind: "file-per", dir, filename: "<slug>.md" },
        fields: [
          { key: "title", type: "string", required: true, maxLength: 80 },
          { key: "date", type: "date", required: true },
          { key: "slug", type: "slug", required: true },
          { key: "categories", type: "tags" },
          { key: "tags", type: "tags" },
        ],
        url: { single: String(row?.urlShape || "").trim() || "{slug}/", dedupe: "existing" },
        editor: "markdown",
        draftRule: {
          kind: "draft-dir",
          dir: parent ? `${parent}/_drafts-${id}` : "",
          note: "这个内容类型的草稿单独放一个目录，不和 posts 的 source/_drafts 混在一起。",
        },
      },
    };
  }

  function openAddSiteWizard() {
    const win = winEl();
    if (!win) return;
    closeAddSiteWizard();
    const backdrop = el("div", "wensi-wizard-backdrop");
    backdrop.dataset.wensiWizard = "true";
    const panel = el("section", "wensi-wizard");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "wensi-wizard-title");

    const head = el("header", "wensi-wizard-head");
    const title = el("h3", "wensi-wizard-title", tr("wensi_add_site_title", "Add a site"));
    title.id = "wensi-wizard-title";
    const close = el("button", "btn mini-btn", "×");
    close.type = "button";
    close.setAttribute("aria-label", tr("wensi_add_site_close", "Close"));
    close.addEventListener("click", closeAddSiteWizard);
    head.append(title, close);
    panel.append(head);

    if (state.demoMode || state.readOnly) {
      panel.append(el("p", "wensi-wizard-note", state.readOnly
        ? tr("wensi_public_read_only", "The public edition shows a demo library and cannot save, publish or sync.")
        : tr("wensi_add_site_offline", "Adding a site needs the local server; the offline demo does not create sites.")));
      backdrop.append(panel);
      win.append(backdrop);
      return;
    }

    const form = el("form", "wensi-wizard-form");
    const field = (labelText, control) => {
      const row = el("label", "wensi-wizard-field");
      const text = el("span", "wensi-wizard-label", labelText);
      row.append(text, control);
      return row;
    };
    const textInput = (name, value = "", type = "text") => {
      const node = el("input", "wensi-wizard-input");
      node.type = type;
      node.value = value;
      node.dataset.wizard = name;
      node.autocomplete = "off";
      return node;
    };
    const selectInput = (name, options) => {
      const node = el("select", "wensi-wizard-input");
      node.dataset.wizard = name;
      for (const [value, label] of options) {
        const option = el("option", "", label);
        option.value = value;
        node.append(option);
      }
      return node;
    };

    const idInput = textInput("id");
    const labelInput = textInput("label");
    const kindInput = selectInput("kind", [
      ["hexo", tr("wensi_add_site_hexo", "Hexo")],
      ["micropub", tr("wensi_add_site_micropub", "Micropub (also Micro.blog)")],
    ]);
    const rootInput = textInput("root");
    const urlInput = textInput("siteUrl");
    const endpointInput = textInput("endpoint");
    const slugInput = selectInput("slugProperty", [
      ["mp-slug", "mp-slug"],
      ["slug", "slug"],
    ]);
    const tokenInput = textInput("token", "", "password");
    const contentLabelInput = textInput("contentLabel", "文章");
    const storageInput = textInput("storage");
    const shapeInput = textInput("urlShape");
    const tagsInput = textInput("tags");
    const mediaInput = textInput("media");
    const fieldsInput = el("textarea", "wensi-wizard-input");
    fieldsInput.rows = 3;
    fieldsInput.placeholder = '[{"key": "subtitle", "type": "string"}]';
    fieldsInput.dataset.wizard = "fields";

    const endpointRow = field(tr("wensi_add_site_endpoint", "Micropub endpoint"), endpointInput);
    const slugRow = field(tr("wensi_add_site_slug_property", "Slug property"), slugInput);
    const tokenRow = field(tr("wensi_add_site_token", "Micropub token (Keychain only)"), tokenInput);
    const showMicropub = () => {
      const on = kindInput.value === "micropub";
      endpointRow.hidden = !on;
      slugRow.hidden = !on;
      tokenRow.hidden = !on;
    };
    kindInput.addEventListener("change", () => {
      const defaults = addSiteDefaults(kindInput.value, rootInput.value);
      storageInput.value = defaults.storage;
      shapeInput.value = defaults.urlShape;
      mediaInput.value = defaults.media;
      showMicropub();
      resetPreview();
    });
    rootInput.addEventListener("input", () => {
      const defaults = addSiteDefaults(kindInput.value, rootInput.value);
      if (!storageInput.value) storageInput.value = defaults.storage;
      if (!shapeInput.value) shapeInput.value = defaults.urlShape;
      if (!mediaInput.value) mediaInput.value = defaults.media;
      resetPreview();
    });
    showMicropub();

    const typesHost = el("div", "wensi-wizard-field");
    const addType = el("button", "btn mini-btn", tr("wensi_add_site_add_type", "Add another content type"));
    addType.type = "button";

    form.append(
      field(tr("wensi_add_site_id", "Site id (lowercase letters, digits, dashes)"), idInput),
      field(tr("wensi_add_site_label", "Display name"), labelInput),
      field(tr("wensi_add_site_kind", "Starting point"), kindInput),
      field(tr("wensi_add_site_root", "Site root (absolute path)"), rootInput),
      field(tr("wensi_add_site_url", "Site URL (optional)"), urlInput),
      endpointRow,
      slugRow,
      tokenRow,
      field(tr("wensi_add_site_content_label", "Content type label"), contentLabelInput),
      field(tr("wensi_add_site_storage", "Storage directory"), storageInput),
      field(tr("wensi_add_site_url_shape", "URL shape"), shapeInput),
      field(tr("wensi_add_site_tags", "Tag table (optional, relative to the root)"), tagsInput),
      field(tr("wensi_add_site_media", "Media directory (optional)"), mediaInput),
      field(tr("wensi_add_site_fields", "Custom fields (optional JSON array)"), fieldsInput),
      typesHost,
      addType
    );

    const result = el("div", "wensi-wizard-result");
    const actions = el("footer", "wensi-wizard-actions");
    const previewButton = el("button", "btn mini-btn", tr("wensi_add_site_preview", "Preview"));
    previewButton.type = "button";
    const createButton = el("button", "btn mini-btn", tr("wensi_add_site_create", "Create site"));
    createButton.type = "button";
    createButton.disabled = true;
    actions.append(previewButton, createButton);
    panel.append(form, result, actions);
    backdrop.append(panel);
    win.append(backdrop);

    let previewed = false;
    const resetPreview = () => {
      previewed = false;
      createButton.disabled = true;
    };
    form.addEventListener("input", resetPreview);
    addType.addEventListener("click", () => {
      const row = el("div", "wensi-wizard-field");
      row.dataset.wizardExtra = "true";
      const remove = el("button", "btn mini-btn", tr("wensi_add_site_remove_type", "Remove this type"));
      remove.type = "button";
      remove.addEventListener("click", () => {
        row.remove();
        resetPreview();
      });
      row.append(
        field(tr("wensi_add_site_type_id", "Content type id"), textInput("typeId")),
        field(tr("wensi_add_site_type_label", "Content type label"), textInput("typeLabel")),
        field(tr("wensi_add_site_storage", "Storage directory"), textInput("typeStorage")),
        field(tr("wensi_add_site_url_shape", "URL shape"), textInput("typeUrl", "{slug}/")),
        remove
      );
      typesHost.append(row);
      resetPreview();
    });
    // Enter in a field previews; it must never submit the form and reload the page.
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      previewButton.click();
    });

    const payloadFor = (dryRun) => {
      const root = rootInput.value.trim().replace(/\/+$/, "");
      const kind = kindInput.value;
      const overrides = {
        contentTypes: {
          posts: {
            label: contentLabelInput.value.trim() || "文章",
            storage: { dir: storageInput.value.trim() || addSiteDefaults(kind, root).storage, filename: "<slug>.md" },
            url: { single: shapeInput.value.trim() || addSiteDefaults(kind, root).urlShape, dedupe: "existing" },
          },
        },
        media: mediaInput.value.trim()
          ? { dir: mediaInput.value.trim(), urlPrefix: "/images/" }
          : null,
      };
      if (tagsInput.value.trim()) {
        overrides.taxonomy = { tags: { source: tagsInput.value.trim() } };
      }
      if (fieldsInput.value.trim()) {
        let fields;
        try {
          fields = JSON.parse(fieldsInput.value);
        } catch {
          throw new Error(tr("wensi_add_site_fields_invalid", "The custom fields are not valid JSON."));
        }
        overrides.contentTypes.posts.fields = fields;
      }
      for (const row of form.querySelectorAll("[data-wizard-extra]")) {
        const built = wizardExtraContentType({
          id: row.querySelector("[data-wizard='typeId']")?.value,
          label: row.querySelector("[data-wizard='typeLabel']")?.value,
          storage: row.querySelector("[data-wizard='typeStorage']")?.value,
          urlShape: row.querySelector("[data-wizard='typeUrl']")?.value,
        });
        if (!built.id) continue;
        if (!/^[a-z][a-z0-9-]*$/.test(built.id) || built.id === "posts" || overrides.contentTypes[built.id]) {
          throw new Error(tr("wensi_add_site_type_id_invalid", "A content type id is lowercase letters, digits and dashes, and it cannot repeat posts."));
        }
        overrides.contentTypes[built.id] = built.type;
      }
      if (kind === "micropub") {
        overrides.channel = {
          micropub: {
            endpoint: endpointInput.value.trim(),
            slugProperty: slugInput.value === "slug" ? "slug" : "mp-slug",
          },
        };
        overrides.contentTypes.posts.note = "Micropub 只负责发布；这里的目录是桌面读写用的本地工作目录，读/列/改都走它。";
      }
      return {
        template: "hexo",
        answers: {
          id: idInput.value.trim(),
          label: labelInput.value.trim(),
          root,
          siteUrl: urlInput.value.trim(),
        },
        overrides,
        dryRun,
      };
    };

    const showResult = (response, dryRun) => {
      result.replaceChildren();
      if (!response || response.ok === false) {
        result.append(el("p", "wensi-wizard-error", String(response?.error || tr("wensi_add_site_validation", "The description does not validate yet:"))));
        for (const problem of response?.errors || []) result.append(el("p", "wensi-wizard-error", String(problem)));
        return;
      }
      if (dryRun) {
        result.append(el("p", "wensi-wizard-ok", tr("wensi_add_site_preview", "Preview")));
      } else {
        result.append(el("p", "wensi-wizard-ok", tr("wensi_add_site_created", "Site created.")));
      }
      const grants = Array.isArray(response.grants) ? response.grants : [];
      if (grants.length) {
        result.append(el("h4", "wensi-wizard-subtitle", tr("wensi_add_site_grants", "Shared folders")));
        for (const grant of grants) {
          const mark = `${grant.read ? "read" : "—"}${grant.change ? " / change" : ""}`;
          result.append(el("p", "wensi-wizard-grant", `${grant.path} — ${mark}`));
        }
      }
      const next = Array.isArray(response.next) ? response.next : [];
      if (next.length) {
        result.append(el("h4", "wensi-wizard-subtitle", tr("wensi_add_site_next", "Next steps")));
        for (const step of next) result.append(el("p", "wensi-wizard-next", String(step)));
      }
      if (response.description) {
        const pre = el("pre", "wensi-wizard-json", JSON.stringify(response.description, null, 2));
        result.append(pre);
      }
    };

    previewButton.addEventListener("click", async () => {
      previewButton.disabled = true;
      result.replaceChildren(el("p", "wensi-wizard-note", tr("wensi_preview_pending", "Generating…")));
      try {
        const response = await client().createSite(payloadFor(true));
        showResult(response, true);
        previewed = response?.ok === true;
        createButton.disabled = !previewed;
      } catch (error) {
        result.replaceChildren(el("p", "wensi-wizard-error", String(error?.message || error)));
      } finally {
        previewButton.disabled = false;
      }
    });

    createButton.addEventListener("click", async () => {
      if (!previewed) return;
      createButton.disabled = true;
      try {
        const response = await client().createSite(payloadFor(false));
        showResult(response, false);
        if (response?.ok && kindInput.value === "micropub" && tokenInput.value.trim()) {
          try {
            await client().saveMicropubToken(response.id, tokenInput.value.trim());
            result.append(el("p", "wensi-wizard-ok", tr("wensi_add_site_token_saved", "Token saved to the Keychain.")));
          } catch (error) {
            result.append(el("p", "wensi-wizard-error",
              `${tr("wensi_add_site_token_failed", "The site was created, but the token was not saved:")} ${String(error?.message || error)}`));
          }
        }
        if (response?.ok) await refreshSitesAfterCreate(response.id);
      } catch (error) {
        result.replaceChildren(el("p", "wensi-wizard-error", String(error?.message || error)));
      } finally {
        createButton.disabled = false;
      }
    });
  }

  function addSiteDefaults(kind, root) {
    const base = String(root || "").trim().replace(/\/+$/, "");
    if (kind === "micropub") {
      return { storage: `${base}/posts`, urlShape: "{slug}/", media: "" };
    }
    return {
      storage: `${base}/source/_posts`,
      urlShape: "{year}/{month}/{day}/{slug}/",
      media: `${base}/source/images`,
    };
  }

  function closeAddSiteWizard() {
    const win = winEl();
    win?.querySelectorAll?.("[data-wensi-wizard]").forEach((node) => node.remove?.());
    win?.querySelector?.("[data-wensi-wizard]")?.remove?.();
  }

  async function refreshSitesAfterCreate(siteId) {
    try {
      const payload = await apiJson("/sites");
      const resolved = resolveSites(payload);
      state.sites = resolved.sites;
      state.demoMode = resolved.demoMode;
      state.readOnly = resolved.readOnly === true;
      if (state.sites.some((site) => site.id === siteId)) await selectSite(siteId);
      else renderAll();
    } catch {
      // The description is already on disk; the list can catch up on the next
      // refresh. The dialog has already shown the create receipt.
    }
  }

  // ---- Data flow -----------------------------------------------------------

  /**
   * A public deployment says so through the capabilities route, which is the
   * one public API. The local offline demo (server down) is not public and
   * stays editable; only the deployed public page locks the library.
   */
  function isPublicCapabilities(capabilities, datasetProfile) {
    if (capabilities && typeof capabilities === "object") {
      if (capabilities.deployment_profile) return capabilities.deployment_profile === "public";
      if (capabilities.public_deployment === true) return true;
    }
    return datasetProfile === "public";
  }

  async function detectPublicDeployment() {
    try {
      const capabilities = await window.AISystem6PublicAccess?.loadCapabilities?.();
      return isPublicCapabilities(capabilities, document.documentElement?.dataset?.deploymentProfile);
    } catch {
      // Fall through to the DOM flag the capabilities loader also writes.
    }
    return document.documentElement?.dataset?.deploymentProfile === "public";
  }

  /** The one place public mode changes what the window offers. */
  function applyReadOnly() {
    const win = winEl();
    if (!win) return;
    const reason = state.readOnly
      ? tr("wensi_public_read_only", "The public edition shows a demo library and cannot save, publish or sync.")
      : "";
    const newButton = win.querySelector("[data-wensi-new]");
    if (newButton) {
      newButton.disabled = state.readOnly;
      newButton.title = reason;
    }
    if (dom?.textarea) {
      dom.textarea.readOnly = state.readOnly;
      dom.textarea.title = reason;
    }
    if (state.readOnly && dom?.saveNote) dom.saveNote.textContent = reason;
    // Availability is evaluated by the desk when the bar updates; the flag
    // arrives after the window opened, so ask for that evaluation once.
    if (state.readOnly && typeof updateMenuState === "function") updateMenuState();
  }

  async function boot() {
    if (bootPromise) return bootPromise;
    bootPromise = (async () => {
      state.booted = true;
      const publicDeployment = await detectPublicDeployment();
      let payload = null;
      if (!publicDeployment) {
        try {
          payload = await apiJson("/sites");
        } catch {
          // The route is not there (or the desk has no server): demo it is.
          payload = null;
        }
      }
      const resolved = resolveSites(payload, { publicDeployment });
      state.sites = resolved.sites;
      state.demoMode = resolved.demoMode;
      state.readOnly = resolved.readOnly === true;
      applyReadOnly();
      const siteId = state.sites.some((site) => site.id === state.siteId) ? state.siteId : state.sites[0]?.id || "";
      if (siteId) await selectSite(siteId);
      else renderAll();
    })();
    return bootPromise;
  }

  async function selectSite(siteId) {
    if (!state.sites.some((site) => site.id === siteId)) return;
    if (state.dirty) await flushSave();
    state.siteId = siteId;
    state.articlesByType = new Map();
    state.taxonomy = null;
    state.selected = null;
    setDraft(null);
    const site = currentSite();
    state.typeId = typeOptions()[0] || "";
    renderAll();
    await Promise.all(typeOptions().map(async (typeId) => {
      try {
        const payload = await client().listArticles(siteId, typeId);
        state.articlesByType.set(typeId, (payload?.articles || []).map((row) => ({ ...row, type: typeId })));
      } catch (error) {
        // One type failing is a per-group error, not a demo fallback: the site
        // description is real, the listing just did not answer. The route's
        // code (storage_unsupported for photos in P1) picks the message.
        state.articlesByType.set(typeId, { failed: true, code: String(error?.code || "") });
      }
    }));
    try {
      state.taxonomy = await client().loadTaxonomy(siteId);
    } catch {
      state.taxonomy = { tags: { canon: [], alias: {} }, categories: [], series: [] };
    }
    renderAll();
  }

  async function openArticle(typeId, path) {
    if (!currentSite()?.contentTypes[typeId] || !path) return false;
    if (state.dirty) await flushSave();
    const token = ++openToken;
    state.selected = { type: typeId, path };
    state.typeId = typeId;
    renderList();
    updateStatus();
    try {
      const article = await client().loadArticle(state.siteId, { type: typeId, path });
      if (token !== openToken) return false;
      setDraft({
        type: typeId,
        path,
        frontMatter: article.frontMatter || {},
        body: String(article.body || ""),
        url: article.url || "",
        isNew: false,
        git: article.git || null,
        status: article.status || "",
        opaqueKeys: Array.isArray(article.opaqueKeys) ? article.opaqueKeys.map(String) : [],
      });
      return true;
    } catch {
      if (token !== openToken) return false;
      state.selected = null;
      setDraft(null);
      setWindowTitle(tr("wensi_load_failed", "Could not open this article"));
      return false;
    }
  }

  async function newDraft() {
    const site = currentSite();
    if (!site) return false;
    if (state.readOnly) {
      if (dom?.saveNote) dom.saveNote.textContent = tr("wensi_public_read_only", "The public edition shows a demo library and cannot save, publish or sync.");
      return false;
    }
    if (state.dirty) await flushSave();
    const typeId = site.contentTypes[state.typeId] && site.contentTypes[state.typeId].storage?.kind !== "json-collection"
      ? state.typeId
      : typeOptions()[0];
    if (!typeId) return false;
    const frontMatter = {};
    (site.contentTypes[typeId].fields || []).forEach((field) => {
      if (field.type === "date") frontMatter[field.key] = todayStamp();
      else if (field.type === "string" || field.type === "text" || field.type === "slug") frontMatter[field.key] = "";
    });
    const token = ++openToken;
    state.selected = null;
    state.typeId = typeId;
    setDraft({ type: typeId, path: freshDraftPath(site, typeId), frontMatter, body: "", url: "", isNew: true, git: null, status: "draft", opaqueKeys: [] });
    renderList();
    updateStatus();
    return true;
  }

  async function duplicateDraft() {
    const site = currentSite();
    const source = state.draft;
    if (!site || !source) return false;
    if (state.readOnly) {
      if (dom?.saveNote) dom.saveNote.textContent = tr("wensi_public_read_only", "The public edition shows a demo library and cannot save, publish or sync.");
      return false;
    }
    if (state.dirty) await flushSave();
    const frontMatter = { ...source.frontMatter, slug: "" };
    const token = ++openToken;
    state.selected = null;
    setDraft({
      type: source.type,
      path: freshDraftPath(site, source.type),
      frontMatter,
      body: source.body || "",
      url: "",
      isNew: true,
      git: null,
      status: "draft",
      opaqueKeys: source.opaqueKeys || [],
    });
    markDirty();
    renderList();
    updateStatus();
    if (dom?.textarea) dom.textarea.focus();
    return token === openToken;
  }

  // The publish intent's door: a manuscript handed over becomes a new draft
  // with the text carried in, ready for the inspector and the first save.
  async function openDraftFromText({ title = "", body = "" } = {}) {
    installWindow();
    if (typeof openWindow === "function") await openWindow(WINDOW_NAME);
    await boot();
    const site = currentSite();
    if (!site) return false;
    const opened = await newDraft();
    if (!opened || !state.draft) return false;
    const text = String(body || "");
    if (text) state.draft.body = text;
    const heading = String(title || "").trim();
    if (heading) state.draft.frontMatter.title = heading.slice(0, 60);
    renderWriting();
    renderInspector();
    // A handover carries real work: the next pause saves it like any edit.
    if (text || heading) markDirty();
    return true;
  }

  function setDraft(draft) {
    state.draft = draft;
    // A different article is a different verdict and a different publish run:
    // keeping either would show this article's panel over another's text.
    if (!draft || !state.checkRun || state.checkRun.key !== draftKey(draft)) state.publish = null;
    state.dirty = false;
    state.saveState = "idle";
    state.saveError = "";
    state.saveWarning = "";
    saveScheduler.dispose();
    renderWriting();
    renderInspector();
    updateStatus();
    setWindowTitle(draft ? (draft.frontMatter?.title || tr("wensi_draft_title", "New draft")) : tr("wensi_quanyong_label", "文思泉涌"));
  }

  // ---- Auto-save -----------------------------------------------------------

  const saveScheduler = createSaveScheduler({ delay: AUTOSAVE_DELAY_MS, save: () => saveDraft() });

  function markDirty() {
    if (!state.draft) return;
    state.dirty = true;
    state.saveState = "dirty";
    state.saveError = "";
    state.saveWarning = "";
    refreshSaveNote();
    updateStatus();
    saveScheduler.touch();
  }

  async function flushSave() {
    return saveScheduler.flush();
  }

  async function saveDraft() {
    const draft = state.draft;
    if (!draft || !state.dirty) return false;
    if (state.readOnly) {
      state.saveState = "error";
      state.saveError = tr("wensi_public_read_only", "The public edition shows a demo library and cannot save, publish or sync.");
      refreshSaveNote();
      return false;
    }
    state.saveState = "saving";
    refreshSaveNote();
    updateStatus();
    try {
      const payload = { type: draft.type, path: draft.path, frontMatter: cloneJson(draft.frontMatter), body: draft.body };
      const result = await client().saveArticle(state.siteId, payload);
      if (result?.path && result.path !== draft.path) draft.path = result.path;
      draft.url = result?.path ? articleUrlPreview(currentSite(), draft.type, draft.frontMatter, state.articlesByType.get(draft.type) || [], draft.path) : draft.url;
      draft.isNew = false;
      state.dirty = false;
      state.savedAt = clockStamp();
      state.saveState = "saved";
      state.saveError = "";
      // The PUT takes the COMPLETE front-matter (omitted keys are deleted
      // server-side) and the server reports the keys it kept for itself.
      state.saveWarning = Array.isArray(result?.warnings) && result.warnings.length ? result.warnings.join(" · ") : "";
      refreshSaveNote();
      updateStatus();
      refreshListRow(draft);
      return true;
    } catch (error) {
      state.saveState = "error";
      state.saveError = String(error?.message || error);
      refreshSaveNote();
      updateStatus();
      return false;
    }
  }

  // A saved draft's row must not go stale in the library: title, date, status
  // and the dirty mark all re-read from the draft.
  function refreshListRow(draft) {
    const rows = state.articlesByType.get(draft.type);
    if (!rows) {
      void selectSite(state.siteId);
      return;
    }
    let row = rows.find((item) => item.path === draft.path);
    if (!row) {
      row = { type: draft.type, path: draft.path, filename: newArticleFilename(currentSite(), draft.type, draft.frontMatter) };
      rows.push(row);
    }
    row.title = draft.frontMatter?.title || row.title;
    row.date = draft.frontMatter?.date || row.date;
    row.slug = draft.frontMatter?.slug || row.slug;
    row.category = articleCategory({ frontMatter: draft.frontMatter });
    row.tags = Array.isArray(draft.frontMatter?.tags) ? [...draft.frontMatter.tags] : row.tags;
    row.gitDirty = true;
    // The status rule is the site's: front-matter keys recompute (aaronlau's
    // held/review), draft-dir types keep the server's word (appscope drafts
    // stay drafts until they move out of the drafts directory).
    const rule = currentSite()?.contentTypes?.[draft.type]?.draftRule;
    if (rule?.kind === "front-matter") {
      row.status = (rule.keys || []).some((key) => draft.frontMatter?.[key]) ? "draft" : "published";
    } else {
      row.status = row.status || draft.status || "draft";
    }
    renderList();
  }

  // Front-end body search for server sites: the list payload carries no body,
  // so a query of two characters or more fetches the missing articles once,
  // sequentially, and re-renders as the cache fills. In-memory only.
  function sweepBodies() {
    if (state.demoMode) return;
    const needle = state.query.trim().toLowerCase();
    if (needle.length < 2) return;
    const token = ++sweepToken;
    const missing = flattenedArticles().filter((row) => typeof row.body !== "string");
    if (!missing.length) return;
    void (async () => {
      for (const row of missing) {
        if (token !== sweepToken) return;
        try {
          const article = await client().loadArticle(state.siteId, { type: row.type, path: row.path });
          if (token !== sweepToken) return;
          row.body = String(article.body || "");
          if (Array.isArray(article.frontMatter?.tags)) row.tags = article.frontMatter.tags.map(String);
        } catch {
          if (token !== sweepToken) return;
          row.body = "";
        }
        if (token === sweepToken) renderList();
      }
    })();
  }

  // ---- Tag editing ---------------------------------------------------------

  function toggleTag(fieldKey, tag) {
    const draft = state.draft;
    if (!draft) return;
    const current = Array.isArray(draft.frontMatter[fieldKey]) ? [...draft.frontMatter[fieldKey]] : [];
    const index = current.indexOf(tag);
    if (index >= 0) current.splice(index, 1);
    else current.push(tag);
    draft.frontMatter[fieldKey] = current;
    markDirty();
    renderInspector();
  }

  function addTag(fieldKey, value) {
    const draft = state.draft;
    const tag = String(value || "").trim();
    if (!draft || !tag) return;
    const current = Array.isArray(draft.frontMatter[fieldKey]) ? [...draft.frontMatter[fieldKey]] : [];
    if (!current.includes(tag)) current.push(tag);
    draft.frontMatter[fieldKey] = current;
    markDirty();
    renderInspector();
  }

  // ---- Menu bar ------------------------------------------------------------
  //
  // The bar carries verbs, not a table of contents: every row does one of three
  // things — acts on the draft on screen, changes what the window shows, or
  // opens the one section whose own button must stay the confirmation (a sync).
  // Rows that would only duplicate a button in the window are not here.
  //
  // The set loads with this module, so the desk pays nothing for it at boot.

  const MENU_ACTION_TABLE = {
    "wensi-new-draft": { labelKey: "new_document", shortcutId: "wensi-new", handler: () => newDraft() },
    "wensi-duplicate-draft": { labelKey: "wensi_menu_duplicate", handler: () => duplicateDraft() },
    "wensi-save": { labelKey: "save_current", shortcutId: "wensi-save", handler: () => flushSave() },
    "wensi-view-write": { labelKey: "wensi_menu_write", handler: () => setViewMode("write") },
    "wensi-view-preview": { labelKey: "wensi_menu_preview", handler: () => setViewMode("preview") },
    "wensi-view-split": { labelKey: "wensi_menu_split", handler: () => setViewMode("split") },
    "wensi-check": { labelKey: "wensi_menu_check", handler: () => checkCurrentArticle() },
    "wensi-publish": { labelKey: "wensi_menu_publish", handler: () => openPublishPanel() },
    "wensi-suggest": { labelKey: "wensi_menu_suggest", handler: () => askFieldSuggestion() },
    "wensi-review": { labelKey: "wensi_menu_review", handler: () => sendDraftToReviewDesk() },
    "wensi-refresh": { labelKey: "refresh", handler: () => refreshLibrary() },
    "wensi-sync": { labelKey: "wensi_menu_sync", handler: () => openUpkeep() },
    "wensi-add-site": { labelKey: "wensi_menu_add_site", handler: () => openAddSiteWizard() },
  };
  const MENU_ACTIONS = Object.freeze(MENU_ACTION_TABLE);

  function menuFaceAction(face) {
    return {
      labelKey: `wensi_menu_face_${face}`,
      handler: () => showFace(face),
    };
  }

  /**
   * The one definition of the bar. Returned (and handed to the desk) so a
   * contract can hold every row to a command that really exists.
   */
  function menuDefinition() {
    const M = window.AISystem6MenuInternals;
    if (!M) return [];
    const item = (action) => ({
      type: "item",
      action,
      labelKey: MENU_ACTIONS[action].labelKey,
      ...(MENU_ACTIONS[action].shortcutId ? { shortcutId: MENU_ACTIONS[action].shortcutId } : {}),
      conditionId: action,
      dataset: { wensiMenu: action },
    });
    const globalItem = (action, labelKey, shortcutId = "") => ({
      type: "item",
      action,
      labelKey,
      ...(shortcutId ? { shortcutId } : {}),
      conditionId: action,
    });
    const faceItem = (face) => ({
      type: "item",
      action: `wensi-face-${face}`,
      labelKey: `wensi_menu_face_${face}`,
      conditionId: `wensi-face-${face}`,
      dataset: { wensiMenu: `wensi-face-${face}` },
    });
    const faces = ["fields", "check", "media", "tags", "photos", "upkeep", "ledger"];
    return [
      M.menu("file", "menu_file", [
        item("wensi-new-draft"),
        item("wensi-duplicate-draft"),
        item("wensi-save"),
        M.menuSeparator,
        globalItem("close-active-window", "close", "close-window"),
      ]),
      M.menu("edit", "menu_edit", [
        globalItem("undo", "undo", "undo"),
        globalItem("redo", "redo", "redo"),
        M.menuSeparator,
        globalItem("cut", "cut", "cut"),
        globalItem("copy", "copy", "copy"),
        globalItem("paste", "paste", "paste"),
        globalItem("select-all", "select_all", "select-all"),
      ]),
      M.menu("view", "menu_view", [
        item("wensi-view-write"),
        item("wensi-view-preview"),
        item("wensi-view-split"),
        M.menuSeparator,
        M.submenu("wensi_menu_sidebar", faces.map(faceItem)),
      ]),
      M.menu("article", "wensi_menu_article", [
        item("wensi-check"),
        item("wensi-suggest"),
        item("wensi-publish"),
        item("wensi-review"),
      ]),
      M.menu("site", "wensi_menu_site", [
        item("wensi-refresh"),
        item("wensi-sync"),
        M.menuSeparator,
        item("wensi-add-site"),
      ]),
      M.windowMenu(),
    ];
  }

  function installMenus() {
    if (installedMenus) return;
    if (typeof window.AISystem6RegisterApplicationMenuSet !== "function") return;
    installedMenus = true;
    window.AISystem6RegisterApplicationMenuSet(WINDOW_NAME, menuDefinition());
    // Registering does not repaint a bar that is already drawn: the desk only
    // re-renders when the foreground application changes, and this module loads
    // *during* that change, before the bar knows it has a new set. Ask once,
    // after the reveal, so the bar belongs to the window that just opened.
    const repaint = () => {
      if (typeof window.renderAppMenuBar !== "function") return;
      if ((window.menuOwnerAppId || "") !== WINDOW_NAME && (window.activeAppId || "") !== WINDOW_NAME) return;
      window.renderAppMenuBar(WINDOW_NAME, { force: true });
      syncMenuMarks();
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(repaint);
    else setTimeout(repaint, 0);
    // Marks are drawn by the desk's own renderer; a menu re-render wipes them,
    // so they are painted again whenever the bar is about to open, and after
    // the state changes that a mark reports.
    document.addEventListener("pointerdown", (event) => {
      if (event.target?.closest?.(".menubar, .menu-bar")) syncMenuMarks();
    }, true);
  }
  let installedMenus = false;

  function registerMenuCommands() {
    const runtime = window.AISystem6Runtime;
    if (typeof runtime?.registerCommand !== "function") return;
    Object.entries(MENU_ACTION_TABLE).forEach(([action, definition]) => {
      runtime.registerCommand(action, {
        handler: async () => await definition.handler(),
        // The bar only shows while this window is front, and these verbs have
        // something to say in every state ("choose an article first" is said
        // on the status line, where the desk says it everywhere else) — except
        // 添加站点 on the public page, which has no server to write to. The
        // desk hides a row whose command is unavailable, so the entry is gone
        // rather than a button that can only refuse.
        isAvailable: () => action !== "wensi-add-site" || !state.readOnly,
      });
    });
    for (const face of INSPECTOR_FACES) {
      runtime.registerCommand(`wensi-face-${face}`, { handler: () => showFace(face), isAvailable: () => true });
    }
  }

  /**
   * The mark a mode row carries. The window shows the same state, so the two
   * can be compared at a glance.
   */
  function syncMenuMarks() {
    const marks = {
      "wensi-view-write": state.viewMode === "write",
      "wensi-view-preview": state.viewMode === "preview",
      "wensi-view-split": state.viewMode === "split",
    };
    for (const face of INSPECTOR_FACES) marks[`wensi-face-${face}`] = state.inspectorMode === face;
    for (const [action, on] of Object.entries(marks)) {
      document.querySelectorAll(`[data-wensi-menu="${action}"]`).forEach((row) => {
        row.classList.toggle("is-checked", on === true);
        if (row.hasAttribute("aria-pressed")) row.setAttribute("aria-pressed", on === true ? "true" : "false");
      });
    }
    // Two rows act on the article on screen; with no article there is nothing
    // to act on, and a greyed row says that better than a click that explains.
    const needDraft = !state.draft;
    for (const action of ["wensi-check", "wensi-suggest", "wensi-publish", "wensi-review", "wensi-duplicate-draft"]) {
      document.querySelectorAll(`[data-wensi-menu="${action}"]`).forEach((row) => {
        row.disabled = needDraft;
        row.classList.toggle("is-disabled", needDraft);
        if (needDraft) row.title = tr("wensi_menu_need_article", "Choose an article, or start a new draft.");
        else row.removeAttribute("title");
      });
    }
  }

  /** Say what is missing on the desk's status line, the way the desk does. */
  function menuStatus(text) {
    if (typeof setStatus === "function") setStatus(String(text || ""));
  }

  async function checkCurrentArticle() {
    if (!state.draft) {
      menuStatus(tr("wensi_menu_need_article", "Choose an article, or start a new draft."));
      return;
    }
    showFace("check");
    await runCheck();
  }

  /**
   * The publish panel lives under the checks, because red findings hold it.
   * This opens that exact place: run the checks, then let the panel speak.
   */
  function suggestionPanel() {
    const wrap = el("div", "wensi-suggest");
    const ask = el("button", "btn mini-btn", tr("wensi_suggest_ask", "Suggest fields"));
    ask.type = "button";
    ask.dataset.wensiSuggest = "true";
    const review = el("button", "btn mini-btn", tr("wensi_send_review", "Send to Review Desk"));
    review.type = "button";
    review.dataset.wensiReview = "true";
    wrap.append(ask, review);
    const held = state.fieldSuggestion && state.fieldSuggestion.key === draftKey()
      ? state.fieldSuggestion.suggestion
      : null;
    if (!held) return wrap;
    wrap.append(el("p", "wensi-suggest-note", tr("wensi_suggest_held", "Held until you write them into this draft.")));
    const tags = Array.isArray(held.tags) ? held.tags.join(", ") : "";
    wrap.append(el("p", "wensi-suggest-line", `${held.slug || ""} · ${held.category || "—"} · ${held.series || "—"} · ${tags}`));
    const accept = el("button", "btn mini-btn", tr("wensi_suggest_accept", "Write these fields"));
    accept.type = "button";
    accept.dataset.wensiSuggestAccept = "true";
    wrap.append(accept);
    return wrap;
  }

  async function askFieldSuggestion() {
    const draft = state.draft;
    if (!draft || !state.siteId) {
      menuStatus(tr("wensi_menu_need_article", "Choose an article, or start a new draft."));
      return;
    }
    const front = draft.frontMatter || {};
    const answer = await client().suggestFields(state.siteId, {
      title: front.title,
      slug: front.slug,
      cats: front.cats || front.categories,
      tags: front.tags,
      series: front.series,
      filename: draft.filename,
    });
    state.fieldSuggestion = { key: draftKey(), suggestion: answer?.suggestion || null };
    if (state.inspectorMode !== "fields") showFace("fields");
    else renderInspector();
  }

  function acceptFieldSuggestion() {
    const held = state.fieldSuggestion?.suggestion;
    const draft = state.draft;
    if (!held || !draft || state.fieldSuggestion.key !== draftKey()) return;
    const fields = currentSite()?.contentTypes?.[draft.type]?.fields || [];
    const keys = new Set(fields.map((field) => field.key));
    if (keys.has("slug") && held.slug) draft.frontMatter.slug = held.slug;
    if (keys.has("series")) draft.frontMatter.series = held.series || draft.frontMatter.series || "";
    const catField = fields.find((field) => field.type === "tags" && (field.key === "cats" || field.key === "categories"));
    if (catField && held.category) {
      const current = Array.isArray(draft.frontMatter[catField.key]) ? draft.frontMatter[catField.key] : [];
      draft.frontMatter[catField.key] = [held.category, ...current.filter((tag) => tag !== held.category)];
    }
    if (keys.has("tags") && Array.isArray(held.tags)) draft.frontMatter.tags = [...held.tags];
    state.fieldSuggestion = null;
    markDirty();
    renderInspector();
  }

  async function sendDraftToReviewDesk() {
    const draft = state.draft;
    if (!draft) {
      menuStatus(tr("wensi_menu_need_article", "Choose an article, or start a new draft."));
      return;
    }
    if (typeof openWindow === "function") await openWindow("reviewDesk");
    const input = typeof reviewDeskBodyInput !== "undefined"
      ? reviewDeskBodyInput
      : document.querySelector("#review-desk-body");
    if (!input) return;
    if (typeof setReviewDeskBodyLocked === "function") setReviewDeskBodyLocked(false);
    input.classList.remove("is-hidden");
    input.value = String(draft.body || "");
    input.scrollTop = 0;
    try { reviewDeskDirty = true; } catch { /* the desk owns the dirty bit when this script cannot see it */ }
    if (typeof updateReviewDeskStats === "function") updateReviewDeskStats();
  }

  async function openPublishPanel() {
    if (!state.draft) {
      menuStatus(tr("wensi_menu_need_article", "Choose an article, or start a new draft."));
      return;
    }
    showFace("check");
    if (!(state.checkRun && state.checkRun.key === draftKey())) await runCheck();
  }

  async function refreshLibrary() {
    if (state.dirty) await flushSave();
    resetCarriedResults();
    // boot() memoizes its first run; a refresh is a new run.
    bootPromise = null;
    await boot();
    menuStatus(tr("wensi_menu_refreshed", "The library was read again."));
  }

  function openUpkeep() {
    showFace("upkeep");
    menuStatus(tr("wensi_menu_sync_hint", "The sync runs from the button in Upkeep, so a long job is never started by a menu row."));
  }

  // ---- Wiring --------------------------------------------------------------

  async function open() {
    installWindow();
    if (typeof openWindow === "function") await openWindow(WINDOW_NAME);
    await boot();
    return true;
  }

  // Named in the admission table so a language switch redraws the strings this
  // lazy window owns instead of leaving the previous language on screen.
  function renderWensiQuanyongLanguage() {
    const win = winEl();
    if (!win) return;
    if (win.dataset.wensiInstalled === "true") delete win.dataset.wensiInstalled;
    installWindow();
    applyReadOnly();
    // The bar repaints on a language switch; the marks are painted by this
    // module, so they are painted again after it.
    syncMenuMarks();
  }

  window.renderWensiQuanyongLanguage = renderWensiQuanyongLanguage;
  // The desk's drag-drop delegate knows the drop target's NAME, not this
  // module; a surface that accepts outside files has to hand them to someone.
  // The module loads with the window, and the drop target exists only inside
  // it, so a drop with the window closed still goes to File Floppy as before.
  window.AISystem6WensiQuanyongPhotoDrop = (files) => importPhotoFiles(files);
  window.AISystem6WensiQuanyong = Object.freeze({
    attach: installWindow,
    open,
    openArticle,
    newDraft,
    openDraftFromText,
    flushSave,
    // Pure helpers the contracts exercise without a DOM.
    resolveSites,
    isPublicCapabilities,
    filterArticles,
    requiredMissing,
    articleUrlPreview,
    newArticleFilename,
    wizardExtraContentType,
    createSaveScheduler,
    batchPhotoPayload,
    menuDefinition,
    menuActions: () => Object.keys(MENU_ACTIONS),
    createDemoStore,
    demoSite,
    state: () => ({
      sites: state.sites.map(cloneJson),
      demoMode: state.demoMode,
      readOnly: state.readOnly,
      siteId: state.siteId,
      typeId: state.typeId,
      taxonomy: state.taxonomy ? cloneJson(state.taxonomy) : null,
      query: state.query,
      statusFilter: state.statusFilter,
      selected: state.selected ? { ...state.selected } : null,
      draft: state.draft ? cloneJson(state.draft) : null,
      dirty: state.dirty,
      saveState: state.saveState,
      savedAt: state.savedAt,
      saveWarning: state.saveWarning,
    }),
  });
  window.AISystem6Runtime?.registerApplication({
    id: "wensiQuanyong",
    windowName: WINDOW_NAME,
    mount: async () => { installWindow(); await boot(); return true; },
    restore: async () => { installWindow(); await boot(); return true; },
    commands: Object.fromEntries([
      ["open-wensi-quanyong", () => open()],
    ].map(([id, handler]) => [id, { handler, isAvailable: () => true }])),
  });
  registerMenuCommands();
  installMenus();
  window.AISystem6WensiQuanyongLoaded = true;
})();
