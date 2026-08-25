// 钟点稿 / Quick Draft — model requests and command dispatch.
//
// Draft generation and the named ClioTalk commands. Every AI write path is
// non-destructive: protected text travels as immutable sentinels and any
// sentinel violation fails the request without touching the body; a failed
// request leaves the negative, the current body, and any existing composite
// untouched, and Retry is always possible.

let pendingEli5Rewrite = null;

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
    _local_provider: /** @type {HTMLInputElement | null} */ (document.getElementById("local-provider"))?.value || "lm-studio",
    _local_endpoint: endpointInput?.value?.trim() || "",
  };
}

function nextActionNote(kind) {
  const zh = currentLanguage === "zh";
  const presetNote = window.AISystem6DraftDeskPresets?.lensNote?.(
    activeDraftDeskPreset(),
    kind,
    currentLanguage
  );
  if (presetNote) return presetNote;
  const notes = {
    spoken: zh ? "把当前正文改得更像当天录制的自然口播，减少书面总结感。" : "Make the current body more naturally spoken for same-day recording.",
    shorten: zh ? "在不改事实边界和个人判断的前提下缩短约 30%。" : "Shorten by about 30% without changing fact boundaries or personal judgment.",
    hook: zh ? "补一个现场感开头钩子，但不要制造无来源的事实。" : "Add a stronger opening hook without inventing unsourced facts.",
    closing: zh ? "补一个简短收束结尾，适合视频直接录完。" : "Add a brief closing that can end the recorded video cleanly.",
    boundary: zh ? "给正文补边界标注：哪些是亲测、哪些来自资料、哪些只是推测、哪些要后测。" : "Add boundary notes: first-hand, sourced, inferred, and needs follow-up testing.",
    counter: zh ? "加入一句反方观点或反例，并明确它和用户观点的关系。" : "Add one counterline or counter-example and clarify how it relates to the user's thesis.",
    hkrr: zh
      ? "用 HKRR 快速提亮首发稿，输出到 ClioTalk：Happiness=发现感/趣味/反直觉，Knowledge=信息增量/人话解释，Resonance=人的感受，Rhythm=节奏/呼吸/转场。给具体可采用建议，不直接改正文，不做长篇 HKRR 分析。"
      : "Use HKRR to lift this launch draft and output ClioTalk notes: Happiness=discovery/interest/counterintuition, Knowledge=plain information gain, Resonance=human feeling, Rhythm=breathing and transitions. Give concrete adoptable suggestions; do not rewrite the body or write a long HKRR analysis.",
    praise: zh
      ? "具体肯定作者已经做成的判断、心意和稿子里成立的地方，再给 3 个最轻量的下一步。不要重写正文，不要泛泛鸡汤，不要说教。"
      : "Specifically encourage the writer's judgment, care, and what already works, then give three light next steps without rewriting or lecturing.",
    "strategy-check": zh
      ? "只做内容 diff，不重写正文：检查当前稿是否接住出稿取舍、素材池、可拍画面和未测边界，并更新稿里怎么处理。"
      : "Content diff only; do not rewrite the body. Check whether the draft follows the editorial strategy, material pool, shootable moments, and untested boundaries, then update the strategy adoption table.",
  };
  return notes[kind] || "";
}

async function requestQuickDraft(stage = "brief", options = {}) {
  const slot = activeProjectQuickDraft();
  if (!slot) {
    setQuickDraftStatus(t("quick_draft_no_project"));
    return false;
  }
  const requestProjectId = slot.project.id;
  const requestRecord = normalizeQuickDraftRecord({
    ...slot.record,
    workspace: {
      ...slot.record.workspace,
      ...workspaceSnapshot(slot.record),
    },
  });
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
  window.AISystem6ModelUserErrors?.registerRetryable?.({
    owner: "quickDraft",
    projectId: requestProjectId,
    callback: () => requestQuickDraft(stage, options),
  });

  if (requestController) requestController.abort();
  requestController = new AbortController();
  const initialCommit = await commitQuickDraftForProject(requestProjectId, {}, { captureForm: true });
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
    const protectedRanges = modelProtectedRanges();
    const protectedTools = window.AISystem6ProtectedRanges;
    const sentinelized = protectedTools.protectTextWithSentinels(currentBody, protectedRanges);
    const setup = quickDraftSetupSnapshot();
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
      tone: setup.tone || "",
      mustInclude: setup.mustInclude || "",
      mustAvoid: setup.mustAvoid || "",
      explanationLens: setup.explanationLens || window.AISystem6ExplanationLens?.blankExplanationLens?.(),
      pastedSources: String(refs.sources?.value || "").trim(),
      userNotes: `${taskPrefix}${options.userNotes || ""}`.trim(),
      intake,
      ventLog: intake.ventLog,
      // Pictures are materialized here, at the edge. The record keeps only an
      // id into the shared store; a model request has to carry the bytes.
      chatMaterials: quickDraftMaterialsForModel(intake.chatMaterials),
      outlineSeed: intake.outlineSeed,
      strategyReport: strategySnapshot(),
      sources: sourceRecords,
    };

    let data;
    if (typeof cloudConfig !== "undefined" && cloudConfig?.active && cloudCredentialReady()) {
      const response = await window.AISystem6Capabilities.requestService("quickDraft.thesis", {
        init: {
          method: "POST",
          signal: requestController.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      });
      data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || data.error || response.statusText);
    } else {
      const result = await sendLocalModelTask({
        payload: {
          model: payload.model || getLocalModelRequestName(),
          // Same pictures the cloud path sends, attached in the browser because
          // this prompt is built here.
          messages: attachImagesToModelMessages(
            window.AISystem6ModelTaskRuntime.buildQuickDraftMessages(payload),
            payload.chatMaterials
          ),
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

    // The response belongs to the project that launched it. If the writer
    // switches projects while the model is running, discard the result before
    // touching the shared Draft Desk DOM or any durable project record.
    if (activeProjectId !== requestProjectId) return false;

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
    const normalizedDraft = String(data.draft ?? data.raw ?? "").trim();
    /** @type {any} */
    const patch = {
      stage: data.stage || stage,
      brief: {
        ...emptyBrief,
        ...(data.brief && typeof data.brief === "object" ? data.brief : {}),
      },
      risks: String(data.risks || ""),
      sourceMap: Array.isArray(data.sourceMap) ? data.sourceMap : [],
      workspace: {
        intake: {
          ...nextIntake,
          annotations: normalizeAnnotations({}, { brief: data.brief, risks: data.risks }),
        },
        strategy: strategyReport,
        materials: Array.isArray(data.sourceMap) ? data.sourceMap : [],
      },
    };
    if (stage === "draft" && normalizedDraft) {
      if (looksLikePlaceholderDraft(normalizedDraft)) {
        setQuickDraftStatus(t("quick_draft_placeholder_draft_rejected"));
        patch.workspace.intake = {
          ...patch.workspace.intake,
          annotations: {
            ...annotations,
            followup: annotations.followup || t("quick_draft_placeholder_draft_rejected"),
          },
        };
        await commitQuickDraftForProject(requestProjectId, patch, { captureForm: false });
        renderQuickDraft(projectQuickDraft(requestProjectId, { create: false })?.record);
        return false;
      }
      const previousBody = String(requestRecord.workspace.body || currentBody).trim();
      const rawNext = normalizedDraft;
      const verification = protectedTools.verifyProtectedSentinels(rawNext, sentinelized.sentinels);
      if (!verification.valid) {
        await commitQuickDraftForProject(requestProjectId, {}, { captureForm: false });
        setQuickDraftStatus(t("quick_draft_protect_failed", verification.errors[0] || ""));
        return false;
      }
      const finalBody = protectedTools.restoreProtectedSentinels(rawNext, sentinelized.sentinels);
      if (previousBody && !hasMeaningfulDraftChange(previousBody, finalBody)) {
        await commitQuickDraftForProject(requestProjectId, patch, { captureForm: false });
        setQuickDraftStatus(t("quick_draft_no_revision"));
        return false;
      }
      if (previousBody) {
        const version = normalizeQuickDraftVersion({
          id: stableId("version"),
          body: previousBody,
          title: requestRecord.workspace.title,
          createdAt: new Date().toISOString(),
          reason: "before-ai",
          source: "quick-draft",
        });
        patch.workspace.versions = [...darkroomOf(requestRecord, requestProjectId).versions, version].slice(-100);
      }
      // One composition patch: the negative is stamped once, and every pass
      // records the body it handed back so later writer edits are not charged
      // to it.
      const deliveredAt = new Date().toISOString();
      patch.workspace.composition = {
        ...darkroomOf(requestRecord, requestProjectId),
        ...(hasRecordedNegative() ? {} : { negative: previousBody, negativeUpdatedAt: deliveredAt }),
        modelDelivered: finalBody,
        modelDeliveredAt: deliveredAt,
      };
      refs.draft.value = finalBody;
      patch.draft = refs.draft.value;
      patch.workspace.body = refs.draft.value;
      if (requestRecord.workspace.titleMode !== "manual") patch.workspace.title = titleFromBody(refs.draft.value);
    }
    if (stage === "draft" && !patch.workspace.body) {
      await commitQuickDraftForProject(requestProjectId, patch, { captureForm: false });
      setQuickDraftStatus(t("quick_draft_parse_failed"));
      return false;
    }
    if (stage !== "draft") {
      const appended = await appendCommandResultToClioTalk(data, taskKind);
      if (!appended) {
        await commitQuickDraftForProject(requestProjectId, patch, { captureForm: false });
        setQuickDraftStatus(t("quick_draft_command_empty"));
        return false;
      }
    }
    const previousBody = requestRecord.workspace.body;
    const committed = await commitQuickDraftForProject(requestProjectId, patch, { captureForm: false });
    if (!committed.ok) {
      if (refs.draft) refs.draft.value = previousBody;
      setQuickDraftStatus(t("quick_draft_save_failed"));
      return false;
    }
    renderQuickDraft(committed.record);
    setQuickDraftStatus(t("quick_draft_done"));
    window.AISystem6ModelUserErrors?.clearRetryable?.("quickDraft");
    return true;
  } catch (error) {
    if (error?.name !== "AbortError") {
      presentQuickDraftModelFailure(error);
    }
    return false;
  } finally {
    requestController = null;
    setBusy(false);
  }
}

function buildQuickDraftMingmingPrompt({
  firstDay,
  sources,
  targetFormat,
  targetDuration,
  currentBody,
  humanAnchor,
  sentinels = [],
  explanationLens = null,
}) {
  const sourceContext = formatQuickDraftSourcesForMingming(sources);
  const formatText = formatLabel(targetFormat);
  const lengthText = durationLabel(targetDuration, targetFormat);
  const strategy = strategySnapshot();
  const intake = intakeSnapshot();
  const setup = quickDraftSetupSnapshot();
  const eli5Enabled = !!(explanationLens && explanationLens.enabled === true);
  const eli5Body = eli5Enabled
    ? window.AISystem6PromptFilesRuntime?.resolvePromptFile?.("lenses.eli5-explainer", null, currentLanguage)?.body
    : "";
  const eli5Block = eli5Body
    ? [
        "ELI5 解释规则（styleLens: luoluo-spoken，两者叠加，不要覆盖口吻）：",
        eli5Body,
        `观众基础：${explanationLens.baselineKnowledge || "secondary-school"}`,
        explanationLens.mustKeepTerms?.length ? `必须保留的术语：${explanationLens.mustKeepTerms.join("、")}` : "",
      ].filter(Boolean).join("\n\n")
    : "";
  const preset = activeDraftDeskPreset(targetFormat);
  const presetConstraints = preset?.promptConstraints?.[currentLanguage === "zh" ? "zh" : "en"] || [];
  const targetConstraint = targetDuration.endsWith("w")
    ? `- 目标是 ${formatText}，约 ${targetDuration.replace(/\D/g, "")} 字；必须像 B 站动态，不要写成视频分镜或长口播。`
    : `- 目标是 ${formatText}，${lengthText}；必须能当天直接录，不要写成文章、报告或发布会流水账。`;
  const questionSheet = [
    `对象/标题：${meaningfulFirstDayTitle(firstDay.title) || firstDay.subject || titleFromBody(currentBody)}`,
    `稿件类型：${formatText}`,
    `目标长度：${lengthText}`,
    firstDay.firstImpression ? `作者第一判断：${firstDay.firstImpression}` : "",
    setup.tone ? `口气要求：${setup.tone}` : "",
    setup.mustInclude ? `必须保留：${setup.mustInclude}` : "",
    setup.mustAvoid ? `必须避开：${setup.mustAvoid}` : "",
  ].filter(Boolean).join("\n");
  const projectContext = [
    targetConstraint,
    "- 这是钟点稿主写作入口：目标是尽快得到一版可发布/可录的正文，不要输出研究流程、建议卡、交接清单或多版本。",
    "- 事实只来自素材区、聊天记录、树洞、当前正文和已挂载材料；不确定的技术机制、地区可用性、Beta 限制必须标成待核或干脆不写。",
    "- 发布会速记要做结构转换：发布会顺序 -> 可展示内容 -> 观众关心点 -> 还没法展示/没亲测的边界 -> 发布会快速过 -> 个人感受 -> 口播稿。",
    ...presetConstraints,
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

${eli5Block ? `ELI5 追加规则：\n${eli5Block}` : ""}
钟点稿追加约束（优先级高于上面的通用大纲输出格式）：
${projectContext}`;
}

async function requestMingmingQuickDraft() {
  await ensureMingmingLensModule();
  collectRefs();
  const slot = activeProjectQuickDraft();
  if (!slot) {
    setQuickDraftStatus(t("quick_draft_no_project"));
    return false;
  }
  const task = createQuickDraftAsyncTask({ create: false });
  if (!task) {
    setQuickDraftStatus(t("quick_draft_no_project"));
    return false;
  }
  window.AISystem6ModelUserErrors?.registerRetryable?.({
    owner: "quickDraft",
    projectId: task.projectId,
    callback: () => requestMingmingQuickDraft(),
  });
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
  const initialCommit = await task.commit({}, { captureForm: true });
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
    const explanationLens = quickDraftSetupSnapshot(slot.record).explanationLens;
    const protectedRanges = modelProtectedRanges(slot.record);
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
      explanationLens,
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
    if (!task.stillOwnsActiveProject()) {
      // The writer switched projects while the model ran. The result belongs
      // to the old project; discard it instead of writing through Project B.
      return false;
    }

    const currentRecord = task.currentRecord();
    /** @type {any} */
    const patch = {
      stage: "draft",
      raw,
      sourceMap: sourceRecords.map((source) => ({ id: source.id, label: source.label })),
      workspace: {
        body: finalBody,
        ...(currentRecord.workspace.titleMode === "manual" ? {} : { title: titleFromBody(finalBody) }),
        materials: sourceRecords.map((source) => ({ id: source.id, label: source.label })),
      },
    };
    if (previousBody) {
      const version = normalizeQuickDraftVersion({
        id: stableId("version"),
        body: previousBody,
        title: currentRecord.workspace.title,
        createdAt: new Date().toISOString(),
        reason: "before-ai",
        source: "quick-draft",
      });
      patch.workspace.versions = [...darkroomOf(currentRecord).versions, version].slice(-100);
    }
    if (!hasRecordedNegative()) {
      patch.workspace.composition = {
        ...darkroomOf(currentRecord),
        negative: previousBody,
        negativeUpdatedAt: new Date().toISOString(),
      };
    }
    refs.draft.value = finalBody;
    const committed = await task.commit(patch, { captureForm: false });
    if (!committed.ok) {
      refs.draft.value = previousBody;
      setQuickDraftStatus(t("quick_draft_save_failed"));
      return false;
    }
    renderQuickDraft(committed.record);
    setQuickDraftStatus(t("quick_draft_done"));
    window.AISystem6ModelUserErrors?.clearRetryable?.("quickDraft");
    return true;
  } catch (error) {
    if (error?.name !== "AbortError") presentQuickDraftModelFailure(error);
    return false;
  } finally {
    requestController = null;
    setBusy(false);
  }
}

function quickDraftCommandLabel(taskKind = "") {
  const zh = currentLanguage === "zh";
  const presetLabel = window.AISystem6DraftDeskPresets?.commandLabel?.(
    activeDraftDeskPreset(),
    taskKind,
    currentLanguage
  );
  if (presetLabel) return presetLabel;
  const labels = {
    "collect-vent-outline": zh ? "提炼可讲点" : "Talk Points",
    "vent-on": zh ? "进入树洞" : "Start Vent Mode",
    "vent-off": zh ? "结束树洞" : "End Vent Mode",
    "vent-summary": zh ? "汇总树洞" : "Summarize Vents",
    draft: zh ? "出稿" : "Draft",
    "generate-first-body": zh ? "出稿" : "Draft",
    praise: zh ? "夸夸我" : "Encourage Me",
    mingming: zh ? "首发快审" : "Launch Pass",
    luoluo: zh ? "接收检查" : "Receive Check",
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
    const result = await setVentMode(action === "vent-on");
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
  const saved = await flushPendingQuickDraftCommit();
  if (!saved) return false;
  if (typeof arrangeWindowAssistantSplit === "function") {
    const paired = await arrangeWindowAssistantSplit("quickDraft");
    if (!paired) return false;
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

function quickDraftEli5PromptBody(id = "lenses.eli5-explainer") {
  return window.AISystem6PromptFilesRuntime?.resolvePromptFile?.(id, null, currentLanguage)?.body || "";
}

function showQuickDraftEli5Candidate(body = "") {
  const container = refs.draft?.closest(".teachtext-editor-container");
  if (!container || !refs.preview || !refs.draft) return;
  refs.preview.innerHTML = `<div class="quick-draft-reading">${quickDraftMarkdownHtml(String(body || ""))}</div>`;
  container.classList.add("is-previewing");
  refs.preview.classList.remove("is-hidden");
  refs.draft.classList.add("is-hidden");
  const candidateRow = document.querySelector("[data-quick-draft-eli5-candidate]");
  if (candidateRow) candidateRow.hidden = false;
}

function hideQuickDraftEli5Candidate() {
  const container = refs.draft?.closest(".teachtext-editor-container");
  if (container && refs.preview && refs.draft) {
    container.classList.remove("is-previewing", "is-graining");
    refs.preview.classList.add("is-hidden");
    refs.preview.classList.remove("quick-draft-grain-pane");
    refs.draft.classList.remove("is-hidden");
  }
  const candidateRow = document.querySelector("[data-quick-draft-eli5-candidate]");
  if (candidateRow) candidateRow.hidden = true;
  pendingEli5Rewrite = null;
}

async function requestEli5Rewrite() {
  collectRefs();
  const slot = activeProjectQuickDraft();
  if (!slot) {
    setQuickDraftStatus(t("quick_draft_no_project"));
    return false;
  }
  const task = createQuickDraftAsyncTask({ create: false });
  if (!task) {
    setQuickDraftStatus(t("quick_draft_no_project"));
    return false;
  }
  const projectId = task.projectId;
  window.AISystem6ModelUserErrors?.registerRetryable?.({
    owner: "quickDraft-eli5-rewrite",
    projectId,
    callback: () => requestEli5Rewrite(),
  });
  const currentBody = String(refs.draft?.value || "").trim();
  if (!currentBody) {
    setQuickDraftStatus(t("quick_draft_needs_body"));
    refs.draft?.focus();
    return false;
  }
  if (!quickDraftModelAvailable()) {
    setQuickDraftStatus(t("quick_draft_connect_ai"));
    return false;
  }

  const explanationLens = quickDraftSetupSnapshot(slot.record).explanationLens;
  const eli5Body = quickDraftEli5PromptBody("lenses.eli5-explainer");
  if (!eli5Body) {
    setQuickDraftStatus(t("quick_draft_eli5_unavailable"));
    return false;
  }
  if (requestController) requestController.abort();
  requestController = new AbortController();
  setBusy(true);
  setQuickDraftStatus(t("quick_draft_eli5_rewriting"));
  try {
    const protectedRanges = modelProtectedRanges(slot.record);
    const protectedTools = window.AISystem6ProtectedRanges;
    const sentinelized = protectedTools.protectTextWithSentinels(currentBody, protectedRanges);
    const baseline = explanationLens?.baselineKnowledge || "secondary-school";
    const terms = explanationLens?.mustKeepTerms?.length ? explanationLens.mustKeepTerms.join("、") : "";
    const userContent = [
      currentLanguage === "zh" ? "当前正文：" : "Current body:",
      sentinelized.protectedText,
      sentinelized.sentinels.length ? protectedSentinelBlock(sentinelized.sentinels, currentLanguage === "zh") : "",
      `${currentLanguage === "zh" ? "观众基础" : "Audience baseline"}：${baseline}`,
      terms ? `${currentLanguage === "zh" ? "必须保留的术语" : "Terms to keep"}：${terms}` : "",
    ].filter(Boolean).join("\n\n");
    const response = await fetchModelPayload({
      model: typeof getLocalModelRequestName === "function" ? getLocalModelRequestName() : (modelInput?.value?.trim() || ""),
      messages: withMarkdownModelMessages([
        { role: "system", content: eli5Body },
        { role: "user", content: userContent },
      ]),
      temperature: 0.35,
      max_tokens: 5200,
      ai_system6_task_kind: "writing.eli5-rewrite",
      stream: false,
    }, requestController.signal);
    if (!response.ok) throw new Error(serviceErrorDetail(response.status, await response.text()));
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
    if (!task.stillOwnsActiveProject()) return false;
    pendingEli5Rewrite = { projectId, body: finalBody };
    showQuickDraftEli5Candidate(finalBody);
    setQuickDraftStatus(t("quick_draft_eli5_candidate_ready"));
    window.AISystem6ModelUserErrors?.clearRetryable?.("quickDraft-eli5-rewrite");
    return true;
  } catch (error) {
    if (error?.name !== "AbortError") presentQuickDraftModelFailure(error);
    return false;
  } finally {
    requestController = null;
    setBusy(false);
  }
}

async function applyQuickDraftEli5Rewrite() {
  const slot = activeProjectQuickDraft();
  const candidate = pendingEli5Rewrite;
  if (!slot || !candidate || candidate.projectId !== activeProjectId) {
    pendingEli5Rewrite = null;
    hideQuickDraftEli5Candidate();
    setQuickDraftStatus(t("quick_draft_eli5_candidate_gone"));
    return false;
  }
  const task = createQuickDraftAsyncTask({ create: false });
  if (!task || !task.stillOwnsActiveProject()) {
    pendingEli5Rewrite = null;
    return false;
  }
  const confirmed = await showSystemModal(t("quick_draft_eli5_apply_confirm"), "confirm");
  if (confirmed !== "yes") {
    setQuickDraftStatus(t("quick_draft_eli5_cancelled"));
    return false;
  }
  if (!task.stillOwnsActiveProject()) return false;
  const previousBody = String(refs.draft?.value || slot.record.workspace.body || "").trim();
  const currentRecord = task.currentRecord();
  /** @type {any} */
  const patch = { stage: "draft", workspace: { body: candidate.body } };
  if (previousBody) {
    const version = normalizeQuickDraftVersion({
      id: stableId("version"),
      body: previousBody,
      title: currentRecord.workspace.title,
      createdAt: new Date().toISOString(),
      reason: "before-eli5-rewrite",
      source: "quick-draft",
    });
    patch.workspace.versions = [...darkroomOf(currentRecord).versions, version].slice(-100);
  }
  if (!hasRecordedNegative()) {
    patch.workspace.composition = {
      ...darkroomOf(currentRecord),
      negative: previousBody,
      negativeUpdatedAt: new Date().toISOString(),
    };
  }
  if (currentRecord.workspace.titleMode !== "manual") {
    patch.workspace.title = titleFromBody(candidate.body);
  }
  refs.draft.value = candidate.body;
  pendingEli5Rewrite = null;
  const committed = await task.commit(patch, { captureForm: false });
  if (!committed.ok) {
    refs.draft.value = previousBody;
    setQuickDraftStatus(t("quick_draft_save_failed"));
    return false;
  }
  hideQuickDraftEli5Candidate();
  renderQuickDraft(committed.record);
  setQuickDraftStatus(t("quick_draft_eli5_applied"));
  return true;
}

async function cancelQuickDraftEli5Rewrite() {
  pendingEli5Rewrite = null;
  hideQuickDraftEli5Candidate();
  setQuickDraftStatus(t("quick_draft_eli5_cancelled"));
  return true;
}

async function requestEli5Review() {
  collectRefs();
  const slot = activeProjectQuickDraft();
  if (!slot) {
    setQuickDraftStatus(t("quick_draft_no_project"));
    return false;
  }
  const projectId = slot.project.id;
  window.AISystem6ModelUserErrors?.registerRetryable?.({
    owner: "quickDraft-eli5-review",
    projectId,
    callback: () => requestEli5Review(),
  });
  const currentBody = String(refs.draft?.value || "").trim();
  if (!currentBody) {
    setQuickDraftStatus(t("quick_draft_needs_body"));
    refs.draft?.focus();
    return false;
  }
  if (!quickDraftModelAvailable()) {
    setQuickDraftStatus(t("quick_draft_connect_ai"));
    return false;
  }
  const reviewBody = quickDraftEli5PromptBody("lenses.eli5-review");
  if (!reviewBody) {
    setQuickDraftStatus(t("quick_draft_eli5_unavailable"));
    return false;
  }
  if (requestController) requestController.abort();
  requestController = new AbortController();
  setBusy(true);
  setQuickDraftStatus(t("quick_draft_eli5_reviewing"));
  try {
    const response = await fetchModelPayload({
      model: typeof getLocalModelRequestName === "function" ? getLocalModelRequestName() : (modelInput?.value?.trim() || ""),
      messages: [
        { role: "system", content: reviewBody },
        { role: "user", content: currentBody },
      ],
      temperature: 0.2,
      max_tokens: 2600,
      ai_system6_task_kind: "writing.eli5-review",
      stream: false,
    }, requestController.signal);
    if (!response.ok) throw new Error(serviceErrorDetail(response.status, await response.text()));
    const result = await response.json().catch(() => ({}));
    const raw = String(result?.choices?.[0]?.message?.content || "").trim();
    const data = window.AISystem6ModelTaskRuntime.parseJsonText(raw);
    if (!data || typeof data !== "object") {
      throw new Error(t("eli5_review_did_not_return_parseable"));
    }
    if (activeProjectId !== projectId) return false;
    // Findings return to the draft as anchored rows, not as a ClioTalk report.
    const findings = Array.isArray(data.findings)
      ? data.findings.filter((finding) => finding && typeof finding === "object")
      : [];
    const shown = window.AISystem6QuickDraftListen?.setQuickDraftFindings?.(findings, data.keep);
    if (typeof shown !== "number") {
      setQuickDraftStatus(t("quick_draft_command_empty"));
      return false;
    }
    setQuickDraftStatus(findings.length ? t("quick_draft_done") : t("quick_draft_eli5_review_none"));
    window.AISystem6ModelUserErrors?.clearRetryable?.("quickDraft-eli5-review");
    return true;
  } catch (error) {
    if (error?.name !== "AbortError") presentQuickDraftModelFailure(error);
    return false;
  } finally {
    requestController = null;
    setBusy(false);
  }
}

window.AISystem6QuickDraftAI = Object.freeze({
  askClioTalk,
  applyQuickDraftEli5Rewrite,
  cancelQuickDraftEli5Rewrite,
  collectVentOutline,
  requestEli5Review,
  requestEli5Rewrite,
  requestMingmingQuickDraft,
  requestQuickDraft,
  runClioTalkAction,
  runNextAction,
  startWritingNow,
});
