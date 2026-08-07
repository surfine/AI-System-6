// Feature module: British Bureaucracy Meme Generator.

// Loaded on demand as a classic script; shares the AI System 6 global scope.



(function () {
  "use strict";

  const toneOptions = [
    ["senior_civil_servant", "bureaucracy_meme_tone_senior", "bureaucracy_meme_tone_senior_hint"],
    ["confused_minister", "bureaucracy_meme_tone_minister", "bureaucracy_meme_tone_minister_hint"],
    ["literal_assistant", "bureaucracy_meme_tone_assistant", "bureaucracy_meme_tone_assistant_hint"],
    ["mixed", "bureaucracy_meme_tone_mixed", "bureaucracy_meme_tone_mixed_hint"],
  ];

  const templateNameKeys = {
    "cabinet-office-standoff": "bureaucracy_meme_template_cabinet",
    "television-interview": "bureaucracy_meme_template_interview",
    "committee-files": "bureaucracy_meme_template_committee",
  };

  const sourceTypeKeys = {
    original: "bureaucracy_meme_source_original",
    "user-upload": "bureaucracy_meme_source_user_upload",
  };

  const archetypeLabelKeys = {
    senior_civil_servant: "bureaucracy_meme_tone_senior",
    confused_minister: "bureaucracy_meme_tone_minister",
    literal_assistant: "bureaucracy_meme_tone_assistant",
    mixed: "bureaucracy_meme_tone_mixed",
  };

  const fallbackTemplates = [
    {
      id: "cabinet-office-standoff",
      name: "Cabinet Office Standoff",
      imageUrl: "/assets/bureaucracy/cabinet-office-standoff.svg",
      sourceType: "original",
      defaultCaptionBox: { x: 0.1, y: 0.78, width: 0.8, height: 0.16 },
    },
  ];

  const state = {
    templates: fallbackTemplates,
    selectedTemplateId: fallbackTemplates[0].id,
    uploadedImageSrc: "",
    uploadedImageName: "",
    tone: "mixed",
    captions: [],
    selectedCaptionId: "",
    generatedUrl: "",
    loading: false,
    captionLanguage: "bilingual",
    generationRequestId: 0,
    previewRequestId: 0,
    initialized: false,
  };

  const els = {};

  function byId(id) {
    return document.getElementById(id);
  }

  function template() {
    return state.templates.find((item) => item.id === state.selectedTemplateId) || state.templates[0] || fallbackTemplates[0];
  }

  function imageSrc() {
    return state.uploadedImageSrc || template().imageUrl;
  }

  function captionBox() {
    return template().defaultCaptionBox || { x: 0.1, y: 0.78, width: 0.8, height: 0.16 };
  }

  function setError(message) {
    if (els.error) els.error.textContent = message || "";
  }

  function setProviderNote(message) {
    if (els.providerNote) els.providerNote.textContent = message || t("bureaucracy_meme_preview_note");
  }

  function localizedTemplateName(item) {
    const key = templateNameKeys[item?.id || ""];
    return key ? t(key) : String(item?.name || "");
  }

  function localizedSourceType(value) {
    const raw = String(value || "original").trim();
    const key = sourceTypeKeys[raw];
    return key ? t(key) : raw;
  }

  function localizedArchetype(value) {
    const raw = String(value || "").trim();
    const key = archetypeLabelKeys[raw];
    return key ? t(key) : raw.replace(/_/g, " ");
  }

  async function loadTemplates() {
    try {
      const response = await fetch("/data/bureaucracy-templates.json", { cache: "no-store" });
      if (!response.ok) throw new Error("Template request failed");
      const data = await response.json();
      if (Array.isArray(data) && data.length) {
        state.templates = data;
        state.selectedTemplateId = data[0].id;
      }
    } catch (error) {
      state.templates = fallbackTemplates;
      state.selectedTemplateId = fallbackTemplates[0].id;
    }
  }

  function renderTemplateList() {
    if (!els.templateList) return;
    els.templateList.innerHTML = state.templates.map((item, index) => {
      const active = item.id === state.selectedTemplateId && !state.uploadedImageSrc ? " is-active" : "";
      return [
        `<button class="bureaucracy-template${active}" type="button" data-template-id="${escapeHtml(item.id)}" aria-pressed="${active ? "true" : "false"}" tabindex="${active || index === 0 ? "0" : "-1"}">`,
        `<img src="${escapeHtml(item.imageUrl)}" alt="" />`,
        `<span><b>${escapeHtml(localizedTemplateName(item))}</b><small>${escapeHtml(localizedSourceType(item.sourceType))}</small></span>`,
        `</button>`,
      ].join("");
    }).join("");
    if (els.uploadButton) {
      els.uploadButton.textContent = state.uploadedImageSrc ? t("bureaucracy_meme_remove_upload") : t("bureaucracy_meme_upload");
      els.uploadButton.classList.toggle("bureaucracy-remove-mode", !!state.uploadedImageSrc);
    }
    if (els.uploadStatus) {
      els.uploadStatus.textContent = state.uploadedImageSrc
        ? t("bureaucracy_meme_upload_status_file", state.uploadedImageName || t("untitled"))
        : t("bureaucracy_meme_upload_status_empty");
    }
  }

  function renderToneList() {
    if (!els.toneList) return;
    els.toneList.innerHTML = toneOptions.map(([value, labelKey, hintKey], index) => {
      const active = value === state.tone ? " is-active" : "";
      return [
        `<button class="bureaucracy-tone${active}" type="button" data-tone="${value}" aria-pressed="${active ? "true" : "false"}" tabindex="${active || index === 0 ? "0" : "-1"}">`,
        `<b>${escapeHtml(t(labelKey))}</b>`,
        `<small>${escapeHtml(t(hintKey))}</small>`,
        `</button>`,
      ].join("");
    }).join("");
  }

  function renderCandidates() {
    if (!els.candidates) return;
    if (state.loading) {
      els.candidates.innerHTML = `<p class="bureaucracy-empty">${escapeHtml(t("bureaucracy_meme_loading"))}</p>`;
      return;
    }
    if (!state.captions.length) {
      els.candidates.innerHTML = `<p class="bureaucracy-empty">${escapeHtml(t("bureaucracy_meme_candidates_empty"))}</p>`;
      return;
    }
    els.candidates.innerHTML = state.captions.map((caption, index) => {
      const active = caption.id === state.selectedCaptionId ? " is-active" : "";
      return [
        `<button class="bureaucracy-candidate${active}" type="button" data-caption-id="${escapeHtml(caption.id)}" aria-pressed="${active ? "true" : "false"}" tabindex="${active || (!state.selectedCaptionId && index === 0) ? "0" : "-1"}">`,
        `<b>${escapeHtml(caption.zh)}</b>`,
        `<span>${escapeHtml(caption.en)}</span>`,
        `<small>${escapeHtml(localizedArchetype(caption.archetype || caption.tone))}</small>`,
        `</button>`,
      ].join("");
    }).join("");
  }

  function syncButtons() {
    if (els.generateButton) {
      const restingLabel = state.captions.length ? t("bureaucracy_meme_more") : t("bureaucracy_meme_generate");
      if (!state.loading) els.generateButton.textContent = restingLabel;
      if (typeof setControlLoading === "function") {
        if (state.loading && els.generateButton.dataset.loading !== "true") {
          setControlLoading(els.generateButton, true, t("bureaucracy_meme_generating"));
        } else if (!state.loading && els.generateButton.dataset.loading === "true") {
          setControlLoading(els.generateButton, false);
          els.generateButton.textContent = restingLabel;
        }
      } else {
        els.generateButton.disabled = state.loading;
        els.generateButton.toggleAttribute("aria-busy", state.loading);
      }
    }
    if (els.downloadLink) {
      const enabled = !!state.generatedUrl;
      els.downloadLink.disabled = !enabled || state.loading;
    }
    els.candidates?.setAttribute("aria-busy", String(state.loading));
    renderLanguageControls();
  }

  function currentEditedCaption() {
    const zh = els.captionZh?.value.trim() || "";
    const en = els.captionEn?.value.trim() || "";
    if (!zh && !en) return null;
    return { id: state.selectedCaptionId || "manual", zh, en };
  }

  function syncCaptionEditor(caption) {
    if (els.captionZh) els.captionZh.value = caption?.zh || "";
    if (els.captionEn) els.captionEn.value = caption?.en || "";
  }

  function renderLanguageControls() {
    els.language?.querySelectorAll("[data-caption-language]").forEach((button, index) => {
      const selected = button.dataset.captionLanguage === state.captionLanguage;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
      button.tabIndex = selected || (!state.captionLanguage && index === 0) ? 0 : -1;
    });
  }

  function currentBureaucracyModelRoute() {
    const cloudReady = typeof cloudConfig !== "undefined"
      && cloudConfig
      && cloudConfig.active
      && cloudConfig.provider
      && cloudCredentialReady()
      && cloudConfig.model;

    if (cloudReady) {
      return {
        cloud: {
          active: true,
          provider: cloudConfig.provider,
          credentialId: cloudConfig.credentialId || "",
          apiKey: isPublicCloudCredentialMode() ? cloudRuntimeApiKey : "",
          baseUrl: cloudConfig.baseUrl || "https://api.deepseek.com",
          model: cloudConfig.model,
        },
      };
    }

    return {
      local: {
        provider: document.getElementById("local-provider")?.value || "lm-studio",
        endpoint: typeof endpointInput !== "undefined" ? endpointInput?.value?.trim() || "" : "",
        model: typeof modelInput !== "undefined" ? modelInput?.value?.trim() || "" : "",
        ...(typeof currentContextRouteConfig === "function" ? currentContextRouteConfig() : {}),
      },
    };
  }

  function currentBureaucracyModelLabel() {
    if (typeof cloudConfig !== "undefined" && cloudConfig?.active && cloudConfig?.model) {
      return cloudConfig.model;
    }
    if (typeof getLocalModelDisplayName === "function") return getLocalModelDisplayName();
    if (typeof modelInput !== "undefined" && modelInput?.value?.trim()) return modelInput.value.trim();
    return t("bureaucracy_meme_local_model");
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Image failed to load"));
      img.src = src;
    });
  }

  // Downscale the current meme image to a compact JPEG data URL so a
  // vision-capable model can read it without a huge upload.
  async function imageToDownscaledDataUrl(src, maxEdge) {
    const img = await loadImage(src);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error("bad image");
    const scale = Math.min(1, maxEdge / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, 0, 0, cw, ch);
    return canvas.toDataURL("image/jpeg", 0.85);
  }

  function wrapChinese(ctx, text, maxWidth) {
    const lines = [];
    let current = "";
    Array.from(String(text || "")).forEach((char) => {
      const next = current + char;
      if (current && ctx.measureText(next).width > maxWidth) {
        lines.push(current);
        current = char;
      } else {
        current = next;
      }
    });
    if (current) lines.push(current);
    return lines;
  }

  function wrapEnglish(ctx, text, maxWidth) {
    const words = String(text || "").split(/\s+/).filter(Boolean);
    const lines = [];
    let current = "";
    words.forEach((word) => {
      const next = current ? `${current} ${word}` : word;
      if (current && ctx.measureText(next).width > maxWidth) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    });
    if (current) lines.push(current);
    return lines;
  }

  async function drawPreview(caption) {
    if (!els.canvas) return;
    const requestId = ++state.previewRequestId;
    const canvas = els.canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = await loadImage(imageSrc());
    if (requestId !== state.previewRequestId) return;
    const targetWidth = Math.max(900, img.naturalWidth || img.width || 1200);
    const ratio = (img.naturalHeight || img.height || 900) / Math.max(1, img.naturalWidth || img.width || 1200);
    canvas.width = targetWidth;
    canvas.height = Math.round(targetWidth * ratio);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    if (!caption) {
      state.generatedUrl = "";
      syncButtons();
      return;
    }

    const box = captionBox();
    const boxX = box.x * canvas.width;
    const boxY = box.y * canvas.height;
    const boxW = box.width * canvas.width;
    const boxH = box.height * canvas.height;
    const pad = Math.max(18, canvas.width * 0.02);
    const maxTextWidth = boxW - pad * 2;
    let zhSize = Math.round(canvas.width * 0.038);
    let enSize = Math.round(zhSize * 0.58);
    let zhLines = [];
    let enLines = [];
    let lineHeight = 0;

    const zhText = state.captionLanguage === "en" ? "" : caption.zh;
    const enText = state.captionLanguage === "zh" ? "" : caption.en;
    for (let tries = 0; tries < 8; tries += 1) {
      ctx.font = `700 ${zhSize}px Arial, "PingFang SC", "Microsoft YaHei", sans-serif`;
      zhLines = wrapChinese(ctx, zhText, maxTextWidth);
      ctx.font = `700 ${enSize}px Arial, Helvetica, sans-serif`;
      enLines = wrapEnglish(ctx, enText, maxTextWidth);
      lineHeight = zhSize * 1.18;
      const totalHeight = zhLines.length * lineHeight + enLines.length * enSize * 1.25 + canvas.height * 0.012;
      if (totalHeight <= boxH || zhSize < canvas.width * 0.028) break;
      zhSize -= 2;
      enSize = Math.round(zhSize * 0.58);
    }

    const zhLineHeight = zhSize * 1.18;
    const enLineHeight = enSize * 1.25;
    const totalHeight = zhLines.length * zhLineHeight + enLines.length * enLineHeight + canvas.height * 0.012;
    // The first baseline offset belongs to the block that actually comes
    // first: Chinese-only and bilingual captions start at zhSize, but an
    // English-only caption must start at enSize or the whole block sits a
    // Chinese line-height too low — and a wrapping English line escapes the
    // caption box entirely.
    const firstBaseline = zhLines.length ? zhSize : enSize;
    let y = boxY + Math.max(0, (boxH - totalHeight) / 2) + firstBaseline;

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.lineJoin = "round";
    ctx.shadowColor = "rgba(0,0,0,0.7)";
    ctx.shadowBlur = Math.max(2, canvas.width * 0.0025);
    ctx.shadowOffsetY = Math.max(1, canvas.width * 0.0015);

    ctx.font = `700 ${zhSize}px Arial, "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.lineWidth = Math.max(3, Math.round(zhSize * 0.12));
    zhLines.forEach((line) => {
      ctx.strokeStyle = "rgba(0,0,0,0.9)";
      ctx.fillStyle = "rgba(248,246,236,0.98)";
      ctx.strokeText(line, boxX + boxW / 2, y);
      ctx.fillText(line, boxX + boxW / 2, y);
      y += zhLineHeight;
    });

    // The gap between the two blocks only exists when both are present; an
    // English-only caption would otherwise start with an extra gap above it.
    if (zhLines.length && enLines.length) y += canvas.height * 0.008;
    ctx.font = `700 ${enSize}px Arial, Helvetica, sans-serif`;
    ctx.lineWidth = Math.max(2, Math.round(enSize * 0.12));
    enLines.forEach((line) => {
      ctx.strokeStyle = "rgba(0,0,0,0.88)";
      ctx.fillStyle = "rgba(248,246,236,0.96)";
      ctx.strokeText(line, boxX + boxW / 2, y);
      ctx.fillText(line, boxX + boxW / 2, y);
      y += enLineHeight;
    });

    state.generatedUrl = canvas.toDataURL("image/png");
    canvas.setAttribute("aria-label", t("bureaucracy_meme_canvas_caption", [zhText, enText].filter(Boolean).join(" / ")));
    syncButtons();
  }

  async function generateCaptions() {
    if (state.loading) return;
    const topic = els.topicInput?.value.trim() || "";
    if (!topic) {
      setError(t("bureaucracy_meme_empty"));
      return;
    }
    const requestId = ++state.generationRequestId;
    state.loading = true;
    setError("");
    setProviderNote(t("bureaucracy_meme_calling_model", currentBureaucracyModelLabel()));
    syncButtons();
    renderCandidates();

    let imageDataUrl = "";
    if (els.vision?.checked) {
      try {
        imageDataUrl = await imageToDownscaledDataUrl(imageSrc(), 768);
        setProviderNote(t("bureaucracy_meme_vision_reading"));
      } catch (err) {
        imageDataUrl = "";
      }
    }

    try {
      let data;
      const cloudActive = typeof cloudConfig !== "undefined" && cloudConfig?.active && cloudCredentialReady();
      if (cloudActive) {
        const response = await fetch("/api/bureaucracy/captions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic,
            tone: state.tone,
            templateId: template().id,
            modelRoute: currentBureaucracyModelRoute(),
            imageDataUrl,
            requireLlm: true,
          }),
        });
        data = await response.json();
        if (!response.ok) throw new Error(data?.detail || data?.error || `HTTP ${response.status}`);
      } else {
        const result = await sendLocalModelTask({
          payload: {
            model: getLocalModelRequestName(),
            messages: window.AISystem6ModelTaskRuntime.buildBureaucracyMessages({
              topic,
              tone: state.tone,
              mood: template().mood,
              imageDataUrl,
            }),
            temperature: 0.55,
            max_tokens: 1200,
            stream: false,
            ai_system6_task_kind: "bureaucracy_meme_caption",
          },
          taskKind: "bureaucracy_meme_caption",
          streamPreference: "json",
        });
        const parsed = window.AISystem6LocalLMStudio.parseJsonText(result.text);
        const captions = (Array.isArray(parsed?.captions) ? parsed.captions : [])
          .filter((item) => item && String(item.zh || "").trim() && String(item.en || "").trim())
          .slice(0, 6)
          .map((item, index) => ({
            id: `llm-${index + 1}`,
            zh: String(item.zh).trim(),
            en: String(item.en).trim(),
            archetype: String(item.archetype || "senior_civil_servant"),
            tone: String(item.tone || state.tone),
          }));
        if (captions.length !== 6) throw new Error("Model returned too few usable captions.");
        data = { provider: "llm", captions };
      }
      if (data.provider !== "llm") {
        throw new Error("llm_caption_unavailable");
      }
      if (requestId !== state.generationRequestId) return;
      state.captions = Array.isArray(data.captions) ? data.captions : [];
      if (!state.captions.length) throw new Error("No captions returned");
      setProviderNote(t("bureaucracy_meme_generated_with_model", currentBureaucracyModelLabel()));
      state.selectedCaptionId = state.captions[0].id;
      syncCaptionEditor(state.captions[0]);
      await drawPreview(currentEditedCaption());
    } catch (error) {
      if (requestId !== state.generationRequestId) return;
      setError(t("bureaucracy_meme_model_required"));
      setProviderNote(t("bureaucracy_meme_llm_failed"));
    } finally {
      if (requestId !== state.generationRequestId) return;
      state.loading = false;
      syncButtons();
      renderCandidates();
    }
  }

  function bindEvents() {
    els.templateList?.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-template-id]");
      if (!button) return;
      state.selectedTemplateId = button.dataset.templateId || state.selectedTemplateId;
      state.uploadedImageSrc = "";
      state.uploadedImageName = "";
      renderTemplateList();
      await drawPreview(currentEditedCaption());
    });

    els.toneList?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-tone]");
      if (!button) return;
      state.tone = button.dataset.tone || "mixed";
      renderToneList();
    });

    els.candidates?.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-caption-id]");
      if (!button) return;
      state.selectedCaptionId = button.dataset.captionId || "";
      renderCandidates();
      const caption = state.captions.find((item) => item.id === state.selectedCaptionId);
      syncCaptionEditor(caption);
      await drawPreview(currentEditedCaption());
      setProviderNote(t("bureaucracy_meme_caption_applied"));
    });

    els.uploadButton?.addEventListener("click", async () => {
      if (state.uploadedImageSrc) {
        state.uploadedImageSrc = "";
        state.uploadedImageName = "";
        if (els.uploadInput) els.uploadInput.value = "";
        renderTemplateList();
        await drawPreview(currentEditedCaption());
        return;
      }
      els.uploadInput?.click();
    });

    els.uploadInput?.addEventListener("change", async () => {
      const file = els.uploadInput.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        setError(t("bureaucracy_meme_choose_image"));
        return;
      }
      const reader = new FileReader();
      reader.onload = async () => {
        state.uploadedImageSrc = String(reader.result || "");
        state.uploadedImageName = file.name;
        renderTemplateList();
        setError("");
        await drawPreview(currentEditedCaption());
      };
      reader.onerror = () => setError(t("bureaucracy_meme_upload_failed"));
      reader.readAsDataURL(file);
    });

    els.generateButton?.addEventListener("click", generateCaptions);
    els.topicInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.isComposing) {
        event.preventDefault();
        generateCaptions();
      }
    });
    els.downloadLink?.addEventListener("click", () => {
      if (!state.generatedUrl) return;
      const link = document.createElement("a");
      link.href = state.generatedUrl;
      link.download = "bureaucracy-meme.png";
      link.click();
    });
    els.language?.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-caption-language]");
      if (!button) return;
      state.captionLanguage = button.dataset.captionLanguage || "bilingual";
      renderLanguageControls();
      await drawPreview(currentEditedCaption());
    });
    [els.captionZh, els.captionEn].forEach((field) => {
      field?.addEventListener("input", () => {
        state.selectedCaptionId = "";
        renderCandidates();
        drawPreview(currentEditedCaption());
      });
    });
    bindRovingButtons(els.templateList, "[data-template-id]", "horizontal");
    bindRovingButtons(els.toneList, "[data-tone]", "horizontal");
    bindRovingButtons(els.candidates, "[data-caption-id]", "vertical");
    bindRovingButtons(els.language, "[data-caption-language]", "horizontal");
  }

  function bindRovingButtons(container, selector, orientation) {
    container?.addEventListener("keydown", (event) => {
      const buttons = [...container.querySelectorAll(selector)].filter((button) => !button.disabled);
      const currentIndex = buttons.indexOf(document.activeElement);
      if (currentIndex < 0) return;
      const previousKey = orientation === "vertical" ? "ArrowUp" : "ArrowLeft";
      const nextKey = orientation === "vertical" ? "ArrowDown" : "ArrowRight";
      if (![previousKey, nextKey, "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      let nextIndex = currentIndex;
      if (event.key === previousKey) nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
      if (event.key === nextKey) nextIndex = (currentIndex + 1) % buttons.length;
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = buttons.length - 1;
      buttons[nextIndex]?.focus();
      buttons[nextIndex]?.click();
    });
  }

  async function init() {
    if (state.initialized) return;
    Object.assign(els, {
      templateList: byId("bureaucracy-template-list"),
      toneList: byId("bureaucracy-tone-list"),
      candidates: byId("bureaucracy-candidates"),
      topicInput: byId("bureaucracy-topic-input"),
      vision: byId("bureaucracy-vision"),
      generateButton: byId("bureaucracy-generate-button"),
      uploadButton: byId("bureaucracy-upload-button"),
      uploadInput: byId("bureaucracy-upload-input"),
      uploadStatus: byId("bureaucracy-upload-status"),
      canvas: byId("bureaucracy-preview-canvas"),
      error: byId("bureaucracy-error"),
      providerNote: byId("bureaucracy-provider-note"),
      downloadLink: byId("bureaucracy-download-link"),
      captionZh: byId("bureaucracy-caption-zh"),
      captionEn: byId("bureaucracy-caption-en"),
      language: byId("bureaucracy-language"),
    });
    await loadTemplates();
    renderTemplateList();
    renderToneList();
    renderCandidates();
    renderLanguageControls();
    bindEvents();
    state.initialized = true;
  }

  function rerenderLocalizedText() {
    if (!state.initialized) return;
    renderTemplateList();
    renderToneList();
    renderCandidates();
    syncButtons();
    if (!els.providerNote?.textContent?.trim()) setProviderNote("");
  }

  window.renderBureaucracyMemeGenerator = async function () {
    await init();
    syncButtons();
    try {
      await drawPreview(currentEditedCaption());
    } catch (error) {
      setError(t("bureaucracy_meme_image_failed"));
    }
  };
  window.refreshBureaucracyMemeLanguage = rerenderLocalizedText;
  window.AISystem6BureaucracyMeme = Object.freeze({
    async runMenuCommand(command) {
      await init();
      if (command === "upload") return els.uploadInput?.click();
      if (command === "download") {
        if (!state.generatedUrl) return;
        const link = document.createElement("a");
        link.href = state.generatedUrl;
        link.download = "bureaucracy-meme.png";
        link.click();
        return;
      }
      if (command === "focus-topic") return els.topicInput?.focus();
      if (command === "generate") return generateCaptions();
    },
  });
})();
