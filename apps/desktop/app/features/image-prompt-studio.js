// Image Prompt Studio: turn a one-line idea (or a reference image) into a
// ready-to-paste image-generation prompt in two styles. No image backend — the
// text model writes the prompt, and the user pastes it into GPT-Image or a
// compatible generator.
(() => {
  "use strict";

  const HISTORY_KEY = "aiSystem6.imagePromptStudio.history";
  const MAX_HISTORY = 20;
  let referenceDataUrl = "";
  let wiredWindow = null;

  function $(id) {
    return document.getElementById(id);
  }

  function tr(key, fallback) {
    return typeof t === "function" ? t(key) : fallback;
  }

  function setStatus(key, fallback) {
    const el = $("ips-status");
    if (el) el.textContent = tr(key, fallback);
  }

  function canUseReferenceImage() {
    // DeepSeek cloud is text-only today. A reference image would be silently
    // dropped by the provider, so the studio must not offer that path as if it
    // worked.
    if (typeof cloudConfig !== "undefined" && cloudConfig?.active) return false;
    if (typeof window.AISystem6LocalLMStudio?.models === "function") {
      const modelName = typeof getLocalModelRequestName === "function" ? getLocalModelRequestName() : "";
      const current = window.AISystem6LocalLMStudio.models()
        .find((model) => model.id === modelName || model.name === modelName);
      if (current && current.vision === false) return false;
    }
    return true;
  }

  function updateReferenceImageAvailability() {
    const button = $("ips-ref");
    if (!button) return;
    const available = canUseReferenceImage();
    button.disabled = !available;
    button.title = available ? "" : tr("ips_ref_unavailable_cloud", "Reference images need a local vision model.");
    if (!available) {
      referenceDataUrl = "";
      setStatus("ips_ref_unavailable_cloud", "Reference images need a local vision model.");
    }
  }

  function readHistory() {
    try {
      const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.slice(0, MAX_HISTORY) : [];
    } catch {
      return [];
    }
  }

  function saveHistory(entry) {
    const next = [entry, ...readHistory()].slice(0, MAX_HISTORY);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch { /* noop */ }
  }

  function renderHistory() {
    const list = $("ips-history");
    if (!list) return;
    const items = readHistory();
    list.replaceChildren();
    if (!items.length) {
      const empty = document.createElement("li");
      empty.className = "ips-history-empty";
      empty.textContent = tr("ips_history_empty", "No saved prompts yet.");
      list.append(empty);
      return;
    }
    items.forEach((item) => {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ips-history-item";
      button.textContent = String(item.idea || "").slice(0, 80) || "…";
      button.title = String(item.idea || "");
      button.addEventListener("click", () => {
        const idea = $("ips-idea");
        if (idea) idea.value = String(item.idea || "");
      });
      li.append(button);
      list.append(li);
    });
  }

  function setOutput(id, value) {
    const el = $(id);
    if (el) el.value = String(value || "");
  }

  async function generate() {
    const idea = ($("ips-idea").value || "").trim();
    if (!idea) {
      setStatus("ips_empty", "Describe an idea first.");
      return;
    }
    if (typeof fetchModelPayload !== "function" || !window.AISystem6ImagePromptRuntime) {
      setStatus("ips_unavailable", "No model available.");
      return;
    }

    const messages = window.AISystem6ImagePromptRuntime.buildImagePromptMessages({
      idea,
      title: ($("ips-title").value || "").trim(),
      aspect: $("ips-aspect").value || "16:9",
      style: $("ips-style").value || "default",
    });
    const user = messages.find((message) => message.role === "user");
    if (user && referenceDataUrl) {
      if (!canUseReferenceImage()) {
        referenceDataUrl = "";
        setStatus("ips_ref_unavailable_cloud", "Reference images need a local vision model.");
      } else {
        user.content = [
          { type: "text", text: user.content },
          { type: "image_url", image_url: { url: referenceDataUrl } },
        ];
      }
    }

    setStatus("ips_generating", "Writing prompt…");
    const button = $("ips-go");
    if (button) button.disabled = true;
    try {
      const response = await fetchModelPayload({
        model: typeof getLocalModelRequestName === "function" ? getLocalModelRequestName() : undefined,
        messages,
        temperature: 0.7,
        ai_system6_task_kind: "chat",
      }, typeof getLongTaskSignal === "function" ? getLongTaskSignal() : undefined);
      const data = await response.json().catch(() => ({}));
      const content = ((data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "").trim();
      if (!content) throw new Error("empty");
      const result = window.AISystem6ImagePromptRuntime.parseImagePromptResult(content);
      if (!result.gptImage && !result.universal) throw new Error("parse");
      setOutput("ips-gpt-out", result.gptImage);
      setOutput("ips-universal-out", result.universal);
      saveHistory({ idea, aspect: $("ips-aspect").value || "16:9", at: Date.now() });
      renderHistory();
      setStatus("ips_done", "Prompt ready — copy it.");
    } catch (error) {
      setStatus("ips_error", "Prompt writing failed.");
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function copy(id) {
    const value = ($(id)?.value || "").trim();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setStatus("ips_copied", "Copied.");
    } catch {
      setStatus("ips_copy_failed", "Copy failed.");
    }
  }

  function wireReferenceImage() {
    const button = $("ips-ref");
    const input = $("ips-ref-file");
    if (!button || !input) return;
    button.addEventListener("click", () => input.click());
    input.addEventListener("change", () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        referenceDataUrl = String(reader.result || "");
        setStatus("ips_ref_ready", "Reference image attached.");
      };
      reader.onerror = () => {
        referenceDataUrl = "";
        setStatus("ips_ref_error", "Could not read that image.");
      };
      reader.readAsDataURL(file);
      input.value = "";
    });
  }

  function buildStudioWindow() {
    const existing = document.querySelector('[data-window="imagePromptStudio"]');
    if (existing) return existing;
    const win = document.createElement("section");
    win.className = "window image-prompt-studio-window is-hidden";
    win.dataset.window = "imagePromptStudio";
    win.setAttribute("aria-labelledby", "image-prompt-studio-title");
    win.innerHTML = [
      '<div class="title-bar">',
      '<button class="close-box" aria-label="Close" data-i18n-aria-label="close"></button>',
      '<h2 id="image-prompt-studio-title" data-i18n="image_prompt_studio_title">Image Prompt Studio</h2>',
      '<button class="resize-box" aria-label="Zoom" data-i18n-aria-label="zoom"></button>',
      '<button class="shade-box" aria-label="Collapse" data-i18n-aria-label="collapse"></button>',
      '</div>',
      '<div class="details-bar ips-status-bar"><span id="ips-status" role="status" aria-live="polite" data-i18n="ips_ready">Ready.</span></div>',
      '<div class="window-pane ips-pane">',
      '<label class="ips-control"><span data-i18n="ips_idea">Idea</span><textarea id="ips-idea" rows="4" data-i18n-placeholder="ips_idea_hint" data-balloon-help="balloon_ips_idea" placeholder="e.g. calm tech blue, cinematic…"></textarea></label>',
      '<label class="ips-control"><span data-i18n="ips_title">Title / overlay text (optional)</span><input type="text" id="ips-title" data-balloon-help="balloon_ips_title"></label>',
      '<div class="ips-row">',
      '<label class="ips-control"><span data-i18n="ips_aspect">Aspect ratio</span><span class="select-wrap"><select id="ips-aspect" data-balloon-help="balloon_ips_aspect"><option value="16:9">16:9</option><option value="4:3">4:3</option><option value="3:4">3:4</option><option value="1:1">1:1</option></select></span></label>',
      '<label class="ips-control"><span data-i18n="ips_style">Style</span><span class="select-wrap"><select id="ips-style" data-balloon-help="balloon_ips_style"><option value="default" data-i18n="ips_style_default">Default</option><option value="photographic" data-i18n="ips_style_photographic">Photographic</option></select></span></label>',
      '</div>',
      '<div class="ips-actions"><button class="btn default" type="button" id="ips-go" data-i18n="ips_generate" data-balloon-help="balloon_ips_generate">Write Prompt</button><button class="btn" type="button" id="ips-ref" data-i18n="ips_ref" data-balloon-help="balloon_ips_ref">Attach reference image</button><input type="file" id="ips-ref-file" accept="image/*" hidden></div>',
      '<div class="ips-actions ips-sideask-actions"><button class="btn" type="button" id="ips-sideask" data-i18n="ips_sideask">Ask SideAsk</button></div>',
      '<div class="ips-outputs">',
      '<label class="ips-control"><span data-i18n="ips_gpt_label">GPT-Image</span><textarea id="ips-gpt-out" rows="5" readonly data-balloon-help="balloon_ips_gpt_out"></textarea><button class="btn" type="button" id="ips-copy-gpt" data-i18n="ips_copy" data-balloon-help="balloon_ips_copy">Copy</button></label>',
      '<label class="ips-control"><span data-i18n="ips_universal_label">Universal</span><textarea id="ips-universal-out" rows="6" readonly data-balloon-help="balloon_ips_universal_out"></textarea><button class="btn" type="button" id="ips-copy-universal" data-i18n="ips_copy" data-balloon-help="balloon_ips_copy">Copy</button></label>',
      '</div>',
      '<div class="ips-history-pane" data-balloon-help="balloon_ips_history"><span data-i18n="ips_history">History</span><ul id="ips-history" class="ips-history"></ul></div>',
      '</div>',
    ].join("");
    document.querySelector(".desktop")?.append(win);
    return win;
  }

  function render() {
    const win = buildStudioWindow();
    if (wiredWindow === win) return;
    wiredWindow = win;
    const go = $("ips-go");
    if (go) {
      go.addEventListener("click", generate);
    }
    $("ips-sideask")?.addEventListener("click", openSideAsk);
    $("ips-copy-gpt")?.addEventListener("click", () => copy("ips-gpt-out"));
    $("ips-copy-universal")?.addEventListener("click", () => copy("ips-universal-out"));
    wireReferenceImage();
    renderHistory();
    updateReferenceImageAvailability();
  }

  async function openSideAsk() {
    if (typeof arrangeWindowAssistantSplit !== "function") {
      setStatus("ips_unavailable", "SideAsk is unavailable.");
      return;
    }
    setStatus("ips_sideask_opening", "Opening SideAsk…");
    try {
      const paired = await arrangeWindowAssistantSplit("imagePromptStudio");
      if (!paired) {
        setStatus("ips_unavailable", "SideAsk could not open.");
      }
    } catch (error) {
      setStatus("ips_error", "SideAsk could not open.");
    }
  }

  window.AISystem6ImagePromptStudio = Object.freeze({ render });

  window.AISystem6Runtime?.registerApplication({
    id: "imagePromptStudio",
    windowName: "imagePromptStudio",
    mount: render,
    restore: render,
    commands: {
      "open-image-prompt-studio": {
        handler: () => openWindow("imagePromptStudio"),
        isAvailable: () => true,
      },
    },
  });
  window.AISystem6ImagePromptStudioLoaded = true;
})();
