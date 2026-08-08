// 钟点稿 / Quick Draft — model requests and command dispatch.
//
// Draft generation and the named ClioTalk commands. Every AI write path is
// non-destructive: protected text travels as immutable sentinels and any
// sentinel violation fails the request without touching the body; a failed
// request leaves the negative, the current body, and any existing composite
// untouched, and Retry is always possible.

function quickDraftTaskKind(options = {}) {
  return String(options.taskKind || "").trim();
}

function isVentOutlineTask(options = {}) {
  return quickDraftTaskKind(options) === "collect-vent-outline";
}

function activeModelPayload() {
  if (typeof cloudConfig !== "undefined" && cloudConfig && cloudConfig.active && cloudConfig.provider && cloudCredentialReady()) {
    return {
      provider: "cloud",
      ...cloudCredentialTransportFields(),
      _cloud_base_url: cloudConfig.baseUrl,
      _cloud_model: cloudConfig.model || "",
    };
  }
  return {
    model: modelInput?.value?.trim() || "",
    _local_provider: document.getElementById("local-provider")?.value || "lm-studio",
    _local_endpoint: endpointInput?.value?.trim() || "",
  };
}

function nextActionNote(kind) {
  const zh = currentLanguage === "zh";
  const notes = {
    spoken: zh ? "把当前正文改得更像当天录制的自然口播，减少书面总结感。" : "Make the current body more naturally spoken for same-day recording.",
    shorten: zh ? "在不改事实边界和个人判断的前提下缩短约 30%。" : "Shorten by about 30% without changing fact boundaries or personal judgment.",
    hook: zh ? "补一个现场感开头钩子，但不要制造无来源的事实。" : "Add a stronger opening hook without inventing unsourced facts.",
    closing: zh ? "补一个简短收束结尾，适合视频直接录完。" : "Add a brief closing that can end the recorded video cleanly.",
    boundary: zh ? "给正文补边界标注：哪些是亲测、哪些来自资料、哪些只是推测、哪些要后测。" : "Add boundary notes: first-hand, sourced, inferred, and needs follow-up testing.",
    counter: zh ? "加入一句反方观点或反例，并明确它和用户观点的关系。" : "Add one counterline or counter-example and clarify how it relates to the user's thesis.",
    mingming: zh
      ? "代入铭铭视角做首发快审：检查当前稿是否能拍、能念、能成立。输出到 ClioTalk：前两句重点、视频感、可拍画面、废话密度、AI 嘴替痕迹，以及最轻量的修改建议。不要直接重写正文，务必保留用户原始判断和已写出的口气。"
      : "Run a Mingming-perspective launch-day pass. Output ClioTalk notes: whether it is shootable, speakable, and defensible; first-two-sentence focus, video feel, shootable moments, filler density, AI-mouthpiece residue, and light edits. Do not rewrite the body; preserve the user's judgment and voice.",
    luoluo: zh
      ? "用“若是落落会怎么接”的接收视角做快稿交付检查：输出到 ClioTalk。先给情绪价值，再守事实底线；指出哪里更容易接、哪里有压力、哪里需要更顺口。不要直接重写正文，不要输出私人关系建议或后台审校术语。"
      : "Use a 'how Luoluo would receive it' lens and output ClioTalk notes. Give emotional value first, then protect factual guardrails; note what is easy to receive, what creates pressure, and what should sound smoother. Do not rewrite the body or output private relationship advice.",
    hkrr: zh
      ? "用 HKRR 快速提亮首发稿，输出到 ClioTalk：Happiness=发现感/趣味/反直觉，Knowledge=信息增量/人话解释，Resonance=人的感受，Rhythm=节奏/呼吸/转场。给具体可采用建议，不直接改正文，不做长篇 HKRR 分析。"
      : "Use HKRR to lift this launch draft and output ClioTalk notes: Happiness=discovery/interest/counterintuition, Knowledge=plain information gain, Resonance=human feeling, Rhythm=breathing and transitions. Give concrete adoptable suggestions; do not rewrite the body or write a long HKRR analysis.",
    praise: zh
      ? "夸夸 Aaron，也夸落落，而且要真的让 Aaron 开心：落落是男生，只能用“他/他的”，禁止用“她/她的”。具体看见 Aaron 已经做成的判断、心意、给落落的认真交付，以及稿子里已经成立的地方；也要具体看见落落值得被这样认真对待的表达、审美、频道和观众感。再给 3 个最轻量的下一步。输出到 ClioTalk，不要重写正文，不要泛泛鸡汤，不要说教。"
      : "Encourage Aaron and Luoluo in a way that genuinely lifts Aaron: specifically notice Aaron's judgment, care, serious handoff to Luoluo, and what is already working in the draft; also notice why Luoluo is worth this serious care: expression, taste, channel, and audience sense. Then give 3 light next steps. Output to ClioTalk, do not rewrite the body, do not give generic pep talk, and do not lecture.",
    "strategy-check": zh
      ? "只做内容 diff，不重写正文：检查当前稿是否接住出稿取舍、素材池、可拍画面和未测边界，并更新稿里怎么处理。"
      : "Content diff only; do not rewrite the body. Check whether the draft follows the editorial strategy, material pool, shootable moments, and untested boundaries, then update the strategy adoption table.",
  };
  return notes[kind] || "";
}

async function requestQuickDraft(stage = "brief", options = {}) {
  const targetFormat = normalizeScenario(refs.format?.value || FIRST_DAY_FORMAT);
  const launchDayMode = isLaunchDayFormat(targetFormat);
  const ventOutlineTask = isVentOutlineTask(options);
  const firstDay = firstDaySnapshot();
  const thesis = launchDayMode ? firstDayThesisText(firstDay) : String(refs.thesis?.value || refs.say?.value || "").trim();
  const currentBody = String(refs.draft?.value || "").trim();
  const intake = intakeSnapshot();
  const hasIntakeMaterial = intake.ventLog.length || intake.chatMaterials.length || intake.outlineSeed.trim();
  const hasMaterialPaneInput = Boolean(String(refs.sources?.value || "").trim());
  const taskKind = quickDraftTaskKind(options);
  if (launchDayMode && ventOutlineTask && !hasIntakeMaterial && !hasMaterialPaneInput) {
    setQuickDraftStatus(t("quick_draft_vent_missing"));
    return false;
  }
  const hasFirstDaySeed = currentBody
    || firstDaySeedValues(firstDay).some((value) => String(value || "").trim())
    || hasIntakeMaterial
    || hasMaterialPaneInput;
  if (launchDayMode && !ventOutlineTask && !hasFirstDaySeed) {
    setQuickDraftStatus(t("quick_draft_missing_first_day"));
    refs.draft?.focus();
    return false;
  }
  if (!launchDayMode && !thesis && !currentBody) {
    setQuickDraftStatus(t("quick_draft_missing_thesis"));
    if (refs.tools) refs.tools.open = true;
    refs.say?.focus();
    return false;
  }
  if (!quickDraftModelAvailable()) {
    setQuickDraftStatus(t("quick_draft_connect_ai"));
    return false;
  }

  if (requestController) requestController.abort();
  requestController = new AbortController();
  const initialCommit = await commitQuickDraft({});
  if (!initialCommit.ok) {
    requestController = null;
    setQuickDraftStatus(t("quick_draft_save_failed"));
    return false;
  }
  setBusy(true);
  setQuickDraftStatus(ventOutlineTask
    ? t("quick_draft_collecting_vent")
    : stage === "draft"
    ? t(launchDayMode ? "quick_draft_writing_first_day" : "quick_draft_writing")
    : taskKind === "praise"
    ? t("quick_draft_praising")
    : t("quick_draft_checking"));

  try {
    const sourceRecords = sourceRecordsFromForm();
    const taskPrefix = taskKind ? `[taskKind:${taskKind}] ` : "";
    const routeFormat = effectiveRouteFormat(targetFormat);
    const targetDuration = normalizeDuration(refs.duration?.value, targetFormat);
    const existingHumanAnchor = humanAnchorSnapshot();
    const humanAnchor = existingHumanAnchor || currentBody;
    const protectedRanges = protectedRangesSnapshot();
    const protectedTools = window.AISystem6ProtectedRanges;
    const sentinelized = protectedTools.protectTextWithSentinels(currentBody, protectedRanges);
    const payload = {
      ...activeModelPayload(),
      stage,
      language: currentLanguage,
      taskKind,
      thesis: launchDayMode ? (currentBody || thesis) : (thesis || currentBody),
      currentBody: sentinelized.protectedText,
      authorDraft: sentinelized.protectedText,
      humanAnchor,
      protectedRanges,
      protectedSentinels: sentinelized.sentinels.map((entry) => entry.token),
      adjustmentLayers: adjustmentLayersSnapshot(),
      targetFormat: routeFormat,
      displayFormat: targetFormat,
      launchDaySubtype: launchDayMode ? launchDaySubtype(targetFormat) : "",
      targetDuration,
      targetWordCount: targetDuration.endsWith("w") ? Number(targetDuration.replace(/\D/g, "")) || 0 : 0,
      styleLens: launchDayMode ? "luoluo-spoken" : "",
      title: meaningfulFirstDayTitle(firstDay.title),
      subject: firstDay.subject,
      handsOnNotes: firstDay.handsOnNotes,
      officialMaterials: firstDay.officialMaterials,
      unavailableNotes: firstDay.unavailableNotes,
      audienceConcerns: firstDay.audienceConcerns,
      firstImpression: firstDay.firstImpression,
      tone: refs.tone?.value || "",
      mustInclude: refs.mustInclude?.value || "",
      mustAvoid: refs.mustAvoid?.value || "",
      pastedSources: String(refs.sources?.value || "").trim(),
      userNotes: `${taskPrefix}${options.userNotes || ""}`.trim(),
      intake,
      ventLog: intake.ventLog,
      chatMaterials: intake.chatMaterials,
      outlineSeed: intake.outlineSeed,
      strategyReport: strategySnapshot(),
      sources: sourceRecords,
    };

    let data;
    if (typeof cloudConfig !== "undefined" && cloudConfig?.active && cloudCredentialReady()) {
      const response = await fetch("/api/draft/thesis", {
        method: "POST",
        signal: requestController.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || data.error || response.statusText);
    } else {
      const result = await sendLocalModelTask({
        payload: {
          model: payload.model || getLocalModelRequestName(),
          messages: window.AISystem6ModelTaskRuntime.buildQuickDraftMessages(payload),
          temperature: 0.35,
          max_tokens: 5200,
          stream: false,
          ai_system6_task_kind: taskKind || "quick-draft",
        },
        signal: requestController.signal,
        taskKind: taskKind || "quick-draft",
        streamPreference: "json",
      });
      data = window.AISystem6LocalLMStudio.parseJsonText(result.text);
      if (!data || typeof data !== "object") throw new Error("Quick Draft model returned invalid JSON.");
    }

    const annotations = {
      firsthand: String(data.brief?.support || ""),
      official: String(data.brief?.counter || ""),
      uncertainty: String(data.brief?.uncertainty || ""),
      followup: String(data.risks || ""),
    };
    const responseIntake = data.intake && typeof data.intake === "object" ? data.intake : {};
    const responseStrategyReport = normalizeStrategy(data.strategyReport);
    const strategyReport = hasStrategyReportValue(responseStrategyReport)
      ? responseStrategyReport
      : strategySnapshot();
    const nextIntake = ventOutlineTask
      ? normalizeIntake({
        ...intake,
        stanceCandidates: Array.isArray(responseIntake.stanceCandidates)
          ? responseIntake.stanceCandidates
          : intake.stanceCandidates,
        outlineSeed: String(responseIntake.outlineSeed || data.brief?.outline || intake.outlineSeed || ""),
      })
      : intake;
    const patch = {
      stage: data.stage || stage,
      brief: {
        ...emptyBrief,
        ...(data.brief && typeof data.brief === "object" ? data.brief : {}),
      },
      risks: String(data.risks || ""),
      sourceMap: Array.isArray(data.sourceMap) ? data.sourceMap : [],
      raw: String(data.raw || ""),
      workspace: {
        intake: {
          ...nextIntake,
          annotations: normalizeAnnotations({}, { brief: data.brief, risks: data.risks }),
        },
        strategy: strategyReport,
        materials: Array.isArray(data.sourceMap) ? data.sourceMap : [],
      },
    };
    if (stage === "draft" && data.draft) {
      if (looksLikePlaceholderDraft(data.draft)) {
        setQuickDraftStatus(t("quick_draft_placeholder_draft_rejected"));
        patch.workspace.intake = {
          ...patch.workspace.intake,
          annotations: {
            ...annotations,
            followup: annotations.followup || t("quick_draft_placeholder_draft_rejected"),
          },
        };
        await commitQuickDraft(patch);
        renderQuickDraft(activeProjectQuickDraft({ create: false })?.record);
        return false;
      }
      const previousBody = String(refs.draft?.value || "").trim();
      const rawNext = String(data.draft || "").trim();
      const verification = protectedTools.verifyProtectedSentinels(rawNext, sentinelized.sentinels);
      if (!verification.valid) {
        await commitQuickDraft({});
        setQuickDraftStatus(t("quick_draft_protect_failed", verification.errors[0] || ""));
        return false;
      }
      const finalBody = protectedTools.restoreProtectedSentinels(rawNext, sentinelized.sentinels);
      if (previousBody && !hasMeaningfulDraftChange(previousBody, finalBody)) {
        await commitQuickDraft(patch);
        setQuickDraftStatus(t("quick_draft_no_revision"));
        return false;
      }
      if (previousBody) {
        const version = normalizeQuickDraftVersion({
          id: stableId("version"),
          body: previousBody,
          title: slot.record.workspace.title,
          createdAt: new Date().toISOString(),
          reason: "before-ai",
          source: "quick-draft",
        });
        patch.workspace.versions = [...slot.record.workspace.versions, version].slice(-100);
      }
      if (!hasRecordedNegative()) {
        patch.workspace.composition = {
          ...(activeProjectQuickDraft({ create: false })?.record.workspace.composition || {}),
          negative: previousBody,
          negativeUpdatedAt: new Date().toISOString(),
        };
      }
      refs.draft.value = finalBody;
      patch.draft = refs.draft.value;
      patch.workspace.body = refs.draft.value;
      if (slot.record.workspace.titleMode !== "manual") patch.workspace.title = titleFromBody(refs.draft.value);
    }
    if (stage === "draft" && !patch.workspace.body) {
      await commitQuickDraft(patch);
      setQuickDraftStatus(t("quick_draft_parse_failed"));
      return false;
    }
    if (stage !== "draft") {
      const appended = await appendCommandResultToClioTalk(data, taskKind);
      if (!appended) {
        await commitQuickDraft(patch);
        setQuickDraftStatus(t("quick_draft_command_empty"));
        return false;
      }
    }
    const previousBody = slot.record.workspace.body;
    const committed = await commitQuickDraft(patch);
    if (!committed.ok) {
      if (refs.draft) refs.draft.value = previousBody;
      setQuickDraftStatus(t("quick_draft_save_failed"));
      return false;
    }
    renderQuickDraft(committed.record);
    setQuickDraftStatus(t("quick_draft_done"));
    return true;
  } catch (error) {
    if (error?.name !== "AbortError") {
      setQuickDraftStatus(t("quick_draft_failed", quickDraftFailureMessage(error)));
    }
    return false;
  } finally {
    requestController = null;
    setBusy(false);
  }
}

function buildQuickDraftMingmingPrompt({ firstDay, sources, targetFormat, targetDuration, currentBody, humanAnchor, sentinels = [] }) {
  const sourceContext = formatQuickDraftSourcesForMingming(sources);
  const formatText = formatLabel(targetFormat);
  const lengthText = durationLabel(targetDuration, targetFormat);
  const strategy = strategySnapshot();
  const intake = intakeSnapshot();
  const targetConstraint = targetDuration.endsWith("w")
    ? `- 目标是 ${formatText}，约 ${targetDuration.replace(/\D/g, "")} 字；必须像 B 站动态，不要写成视频分镜或长口播。`
    : `- 目标是 ${formatText}，${lengthText}；必须能当天直接录，不要写成文章、报告或发布会流水账。`;
  const questionSheet = [
    `对象/标题：${meaningfulFirstDayTitle(firstDay.title) || firstDay.subject || titleFromBody(currentBody)}`,
    `稿件类型：${formatText}`,
    `目标长度：${lengthText}`,
    firstDay.firstImpression ? `作者第一判断：${firstDay.firstImpression}` : "",
    refs.tone?.value ? `口气要求：${refs.tone.value}` : "",
    refs.mustInclude?.value ? `必须保留：${refs.mustInclude.value}` : "",
    refs.mustAvoid?.value ? `必须避开：${refs.mustAvoid.value}` : "",
  ].filter(Boolean).join("\n");
  const projectContext = [
    targetConstraint,
    "- 这是钟点稿主写作入口：目标是尽快得到一版可发布/可录的正文，不要输出研究流程、建议卡、交接清单或多版本。",
    "- 事实只来自素材区、聊天记录、树洞、当前正文和已挂载材料；不确定的技术机制、地区可用性、Beta 限制必须标成待核或干脆不写。",
    "- 发布会速记要做结构转换：发布会顺序 -> 可展示内容 -> 观众关心点 -> 还没法展示/没亲测的边界 -> 发布会快速过 -> 个人感受 -> 口播稿。",
    "- 落落是男生；涉及落落时只能用“他/他的”，禁止用“她/她的”。",
    "- 钟点稿正文区不分章节：第一行可以用一个 Markdown H1 标题，正文不要输出 ## 二级标题、表格、项目符号或后台标签，只写自然段口播。",
    currentBody ? "- 本次是基于当前正文的迭代打磨：至少改善开头钩子、视频顺序、口播节奏或素材取舍；不能只返回旧正文。" : "",
    humanAnchor ? "- 人的原稿锚点优先：保留用户原始判断、犹豫、吐槽和已经写出的口气；不能只沿着上一版 AI 稿自我复制。" : "",
    (adjustmentLayerState("mingming")?.enabled
      ? adjustmentStrengthPromptLine(adjustmentLayerState("mingming").strength, currentLanguage === "zh")
      : ""),
    strategy.editorial ? `出稿取舍：\n${strategy.editorial}` : "",
    strategy.materialLedger ? `素材处理：\n${strategy.materialLedger}` : "",
    strategy.adoptionTable ? `稿里怎么处理：\n${strategy.adoptionTable}` : "",
    intake.outlineSeed ? `已有可讲点/骨架：\n${intake.outlineSeed}` : "",
  ].filter(Boolean).join("\n\n");
  const outline = [
    currentBody ? `当前正文：\n${currentBody}` : "",
    humanAnchor && humanAnchor !== currentBody ? `人的原稿锚点：\n${humanAnchor}` : "",
    sentinels.length ? protectedSentinelBlock(sentinels, currentLanguage === "zh") : "",
    sourceContext ? `素材池：\n${sourceContext}` : "",
  ].filter(Boolean).join("\n\n");
  return `${buildMingmingRewritePrompt({
    questionSheet,
    readerClipContext: sourceContext || "No Quick Draft material pasted yet.",
    projectContext,
    outline: outline || "请根据上面的素材池直接生成一版钟点稿正文。",
  })}

钟点稿追加约束（优先级高于上面的通用大纲输出格式）：
${projectContext}`;
}

async function requestMingmingQuickDraft() {
  collectRefs();
  const slot = activeProjectQuickDraft();
  if (!slot) {
    setQuickDraftStatus(t("quick_draft_no_project"));
    return false;
  }
  const targetFormat = normalizeScenario(refs.format?.value || FIRST_DAY_FORMAT);
  const launchDayMode = isLaunchDayFormat(targetFormat);
  const firstDay = firstDaySnapshot();
  const currentBody = String(refs.draft?.value || "").trim();
  const intake = intakeSnapshot();
  const hasIntakeMaterial = intake.ventLog.length || intake.chatMaterials.length || intake.outlineSeed.trim();
  const hasMaterialPaneInput = String(refs.sources?.value || "").trim();
  const hasFirstDaySeed = currentBody
    || firstDaySeedValues(firstDay).some((value) => String(value || "").trim())
    || hasIntakeMaterial
    || hasMaterialPaneInput;
  if (!launchDayMode || !hasFirstDaySeed) {
    setQuickDraftStatus(t("quick_draft_missing_first_day"));
    refs.sources?.focus();
    return false;
  }
  if (!quickDraftModelAvailable()) {
    setQuickDraftStatus(t("quick_draft_connect_ai"));
    return false;
  }

  if (requestController) requestController.abort();
  requestController = new AbortController();
  const initialCommit = await commitQuickDraft({});
  if (!initialCommit.ok) {
    requestController = null;
    setQuickDraftStatus(t("quick_draft_save_failed"));
    return false;
  }
  setBusy(true);
  setQuickDraftStatus(t("quick_draft_writing_first_day"));

  try {
    const sourceRecords = sourceRecordsFromForm();
    const targetDuration = normalizeDuration(refs.duration?.value, targetFormat);
    const previousBody = currentBody;
    const humanAnchor = humanAnchorSnapshot() || previousBody;
    const protectedRanges = protectedRangesSnapshot(slot.record);
    const protectedTools = window.AISystem6ProtectedRanges;
    const sentinelized = protectedTools.protectTextWithSentinels(previousBody, protectedRanges);
    const prompt = buildQuickDraftMingmingPrompt({
      firstDay,
      sources: sourceRecords,
      targetFormat,
      targetDuration,
      currentBody: sentinelized.protectedText,
      humanAnchor,
      sentinels: sentinelized.sentinels,
    });
    const response = await fetchModelPayload({
      model: typeof getLocalModelRequestName === "function" ? getLocalModelRequestName() : (modelInput?.value?.trim() || ""),
      messages: withMarkdownModelMessages([{ role: "user", content: prompt }]),
      temperature: 0.45,
      max_tokens: 5200,
      ai_system6_task_kind: "mingming_rewrite",
      stream: false,
    }, requestController.signal);
    if (!response.ok) {
      throw new Error(serviceErrorDetail(response.status, await response.text()));
    }
    const result = await response.json().catch(() => ({}));
    const raw = String(result?.choices?.[0]?.message?.content || "").trim();
    const cleaned = cleanMingmingQuickDraftBody(raw);
    const verification = protectedTools.verifyProtectedSentinels(cleaned, sentinelized.sentinels);
    if (!verification.valid) {
      setQuickDraftStatus(t("quick_draft_protect_failed", verification.errors[0] || ""));
      return false;
    }
    const finalBody = protectedTools.restoreProtectedSentinels(cleaned, sentinelized.sentinels);
    if (!finalBody) {
      setQuickDraftStatus(t("quick_draft_parse_failed"));
      return false;
    }
    if (looksLikePlaceholderDraft(finalBody)) {
      setQuickDraftStatus(t("quick_draft_placeholder_draft_rejected"));
      return false;
    }
    if (previousBody && !hasMeaningfulDraftChange(previousBody, finalBody)) {
      setQuickDraftStatus(t("quick_draft_no_revision"));
      return false;
    }

    const patch = {
      stage: "draft",
      raw,
      sourceMap: sourceRecords.map((source) => ({ id: source.id, label: source.label })),
      workspace: {
        body: finalBody,
        ...(slot.record.workspace.titleMode === "manual" ? {} : { title: titleFromBody(finalBody) }),
        materials: sourceRecords.map((source) => ({ id: source.id, label: source.label })),
      },
    };
    if (previousBody) {
      const version = normalizeQuickDraftVersion({
        id: stableId("version"),
        body: previousBody,
        title: slot.record.workspace.title,
        createdAt: new Date().toISOString(),
        reason: "before-ai",
        source: "quick-draft",
      });
      patch.workspace.versions = [...slot.record.workspace.versions, version].slice(-100);
    }
    if (!hasRecordedNegative()) {
      patch.workspace.composition = {
        ...slot.record.workspace.composition,
        negative: previousBody,
        negativeUpdatedAt: new Date().toISOString(),
      };
    }
    refs.draft.value = finalBody;
    const committed = await commitQuickDraft(patch);
    if (!committed.ok) {
      refs.draft.value = previousBody;
      setQuickDraftStatus(t("quick_draft_save_failed"));
      return false;
    }
    renderQuickDraft(committed.record);
    setQuickDraftStatus(t("quick_draft_done"));
    return true;
  } catch (error) {
    if (error?.name !== "AbortError") setQuickDraftStatus(t("quick_draft_failed", quickDraftFailureMessage(error)));
    return false;
  } finally {
    requestController = null;
    setBusy(false);
  }
}

function quickDraftCommandLabel(taskKind = "") {
  const zh = currentLanguage === "zh";
  const labels = {
    "collect-vent-outline": zh ? "提炼可讲点" : "Talk Points",
    "vent-on": zh ? "进入树洞" : "Start Vent Mode",
    "vent-off": zh ? "结束树洞" : "End Vent Mode",
    "vent-summary": zh ? "汇总树洞" : "Summarize Vents",
    draft: zh ? "出稿" : "Draft",
    "generate-first-body": zh ? "出稿" : "Draft",
    praise: zh ? "夸夸我" : "Encourage Me",
    mingming: zh ? "铭铭快审" : "Mingming Pass",
    luoluo: zh ? "落落接收" : "Luoluo Receive",
    hkrr: zh ? "HKRR 提亮" : "HKRR Lift",
    boundary: zh ? "补边界" : "Boundary Notes",
    "strategy-check": zh ? "出稿检查" : "Draft Check",
  };
  return labels[taskKind] || (zh ? "命令结果" : "Command Result");
}

function commandResultMarkdown(data = {}, taskKind = "") {
  const pieces = [];
  const strategy = normalizeStrategy(data.strategyReport);
  const brief = data.brief && typeof data.brief === "object" ? data.brief : {};
  const push = (heading, value) => {
    const text = String(value || "").trim();
    if (!text) return;
    pieces.push(`### ${heading}\n${text}`);
  };
  if (taskKind === "praise") {
    push(currentLanguage === "zh" ? "已经很好的地方" : "What Is Already Working", strategy.editorial || brief.support);
    push(currentLanguage === "zh" ? "轻量下一步" : "Light Next Steps", strategy.adoptionTable || brief.outline || data.risks);
    if (!pieces.length && data.raw) {
      push(currentLanguage === "zh" ? "夸夸" : "Encouragement", data.raw);
    }
    return pieces.join("\n\n").trim();
  }
  push(t("quick_draft_editorial_strategy"), strategy.editorial);
  push(t("quick_draft_material_ledger"), strategy.materialLedger);
  push(t("quick_draft_adoption_table"), strategy.adoptionTable);
  push(t("quick_draft_talk_points"), brief.outline || brief.support);
  push(t("quick_draft_boundary_title"), [brief.counter, brief.uncertainty, data.risks].filter(Boolean).join("\n\n"));
  if (!pieces.length && data.raw) {
    push(currentLanguage === "zh" ? "模型原文" : "Model Output", data.raw);
  }
  return pieces.join("\n\n").trim();
}

async function ensureQuickDraftClioTalk() {
  if (typeof arrangeWindowAssistantSplit === "function" && !isMultiFinderMode()) {
    await arrangeWindowAssistantSplit("quickDraft");
    return true;
  }
  if (typeof openWindow === "function") {
    await openWindow("assistant");
    return true;
  }
  return false;
}

async function appendCommandResultToClioTalk(data = {}, taskKind = "") {
  const body = commandResultMarkdown(data, taskKind);
  if (!body) return false;
  const stamp = new Date().toLocaleTimeString(currentLanguage === "zh" ? "zh-CN" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const block = `## ${quickDraftCommandLabel(taskKind)} · ${stamp}\n\n${body}`;
  await ensureQuickDraftClioTalk();
  if (typeof addMessage === "function") {
    addMessage("assistant", block);
    return true;
  }
  return false;
}

function collectVentOutline() {
  if (refs.format) refs.format.value = FIRST_DAY_FORMAT;
  syncQuickDraftTemplateUi();
  return requestQuickDraft("brief", {
    taskKind: "collect-vent-outline",
    userNotes: currentLanguage === "zh"
      ? "只整理树洞吐槽和聊天截图素材，产出 5 个可讲点和出稿骨架。不要写正文，不要替用户确定最终第一感受。"
      : "Organize only vent notes and chat screenshot material into 5 talk-point candidates and a draft path. Do not draft and do not decide the user's final first impression.",
  });
}

function runNextAction(kind) {
  const materialOnlyKinds = new Set(["strategy-check", "mingming", "luoluo", "hkrr", "boundary"]);
  return requestQuickDraft(materialOnlyKinds.has(kind) ? "brief" : "draft", {
    taskKind: kind,
    userNotes: nextActionNote(kind),
  });
}

async function runClioTalkAction(kind = "", options = {}) {
  const action = String(kind || "").trim();
  if (options.announceUser) {
    const announce = () => {
      if (typeof addMessage === "function") {
        addMessage("user", `${currentLanguage === "zh" ? "钟点稿命令" : "Quick Draft command"}：${quickDraftCommandLabel(action === "organize" ? "collect-vent-outline" : action)}`);
      }
    };
    if (action === "mingming" || action === "luoluo" || action === "hkrr") {
      announce();
    } else {
      ensureQuickDraftClioTalk().then(announce).catch(() => {});
    }
  }
  if (action === "vent-on" || action === "vent-off") {
    const result = setVentMode(action === "vent-on");
    if (result && typeof addMessage === "function") {
      addMessage("assistant", t(result.active ? "quick_draft_vent_mode_on" : "quick_draft_vent_mode_off", result.count));
    }
    return result;
  }
  if (action === "organize") return collectVentOutline();
  if (action === "vent-summary") return collectVentOutline();
  if (action === "draft") return requestMingmingQuickDraft();
  if (action === "mingming" || action === "luoluo" || action === "hkrr") return runAdjustmentCommand(action);
  if (action === "praise") return requestQuickDraft("brief", {
    taskKind: "praise",
    userNotes: nextActionNote("praise"),
  });
  if (action === "shorten") return runNextAction("shorten");
  if (action === "hook") return runNextAction("hook");
  if (action === "boundary") return runNextAction("boundary");
  return false;
}

async function askClioTalk() {
  const committed = await commitQuickDraft({});
  if (!committed.ok) return false;
  if (typeof arrangeWindowAssistantSplit === "function") {
    await arrangeWindowAssistantSplit("quickDraft");
    setQuickDraftStatus(t("quick_draft_sideask_done"));
  } else {
    await openWindow("assistant");
  }
  return true;
}

function startWritingNow() {
  if (!quickDraftModelAvailable()) {
    setQuickDraftStatus(t("quick_draft_connect_ai"));
    return false;
  }
  return requestMingmingQuickDraft();
}

window.AISystem6QuickDraftAI = Object.freeze({
  askClioTalk,
  collectVentOutline,
  requestMingmingQuickDraft,
  requestQuickDraft,
  runClioTalkAction,
  runNextAction,
  startWritingNow,
});
