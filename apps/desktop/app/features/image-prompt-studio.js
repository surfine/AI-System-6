// Image Prompt Studio: turn a one-line idea (or a reference image) into a
// ready-to-paste image-generation prompt in two styles. No image backend — the
// text model writes the prompt, and the user pastes it into GPT-Image or a
// compatible generator.
(() => {
  "use strict";

  const HISTORY_KEY = "aiSystem6.imagePromptStudio.history";
  const MAX_HISTORY = 20;
  const COPIED_LABEL_MS = 1500;
  const ASPECTS = ["16:9", "4:3", "1:1", "3:4", "9:16"];
  // The six lines the runtime asks the model for, in the order it asks.
  const UNIVERSAL_FIELDS = ["Subject", "Style", "Lighting", "Composition", "Negative", "Aspect ratio"];
  let referenceDataUrl = "";
  let referenceName = "";
  let wiredWindow = null;
  let activeRequest = null;

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

  function radios(name) {
    return [...document.querySelectorAll(`[data-window="imagePromptStudio"] input[name="${name}"]`)];
  }

  function selectedValue(name, fallback) {
    return radios(name).find((input) => input.checked)?.value || fallback;
  }

  function selectValue(name, value) {
    const input = radios(name).find((candidate) => candidate.value === value);
    if (input) input.checked = true;
    syncPlate();
  }

  function canUseReferenceImage() {
    // The cloud reads reference images now: fetchModelPayload sends any payload
    // that carries an image to the DeepSeek vision model, whatever the picker
    // shows. Only a local model with no vision blocks the path.
    return currentModelSupportsImageInputs();
  }

  // The well is the only place the attachment exists on screen: before it, a
  // picked image left one status line behind and no way to take it back, and a
  // text-only model explained itself in a title tooltip that touch never shows.
  function syncReferenceWell() {
    const well = $("ips-well");
    if (!well) return;
    const available = canUseReferenceImage();
    const attached = available && Boolean(referenceDataUrl);
    const thumb = $("ips-well-thumb");
    const text = $("ips-well-text");
    const choose = $("ips-ref");
    const remove = $("ips-ref-remove");
    well.classList.toggle("is-unavailable", !available);
    well.classList.toggle("is-attached", attached);
    if (thumb) {
      thumb.hidden = !attached;
      if (attached) thumb.src = referenceDataUrl;
      else thumb.removeAttribute("src");
    }
    if (text) {
      // The file name is not a translation, so the key comes off while it shows;
      // otherwise the next language sweep would write the hint back over it.
      if (attached) {
        delete text.dataset.i18n;
        text.textContent = referenceName;
      } else {
        const key = available ? "ips_ref_drop" : "ips_ref_unavailable_cloud";
        text.dataset.i18n = key;
        text.textContent = tr(key, available ? "Drop an image here, or" : "Reference images need a vision model.");
      }
    }
    well.dataset.dropLabel = tr("ips_ref_drop_here", "Drop to attach");
    if (choose) {
      choose.disabled = !available;
      choose.hidden = attached;
    }
    if (remove) remove.hidden = !attached;
    syncPlate();
  }

  function updateReferenceImageAvailability() {
    if (!canUseReferenceImage() && referenceDataUrl) {
      clearReference();
      setStatus("ips_ref_unavailable_cloud", "Reference images need a vision model.");
    }
    syncReferenceWell();
  }

  function clearReference() {
    referenceDataUrl = "";
    referenceName = "";
    syncReferenceWell();
  }

  async function attachReference(files) {
    const entry = clioVisionImageFilesFromList(files)[0];
    if (!entry || entry.file.size > CLIO_IMAGE_MAX_SOURCE_BYTES) {
      clearReference();
      setStatus("ips_ref_error", "Could not read that image.");
      return;
    }
    try {
      const prepared = await prepareClioImageInline(entry.file, { detail: "low" });
      referenceDataUrl = prepared.inlineDataUrl;
      referenceName = String(entry.file.name || "");
      syncReferenceWell();
      setStatus("ips_ref_ready", "Reference image attached.");
    } catch {
      clearReference();
      setStatus("ips_ref_error", "Could not read that image.");
    }
  }

  // The plate is the frame the prompt is headed for: the chosen shape, where
  // the overlay title sits, whether a reference rides along. It holds a dot
  // pattern and never a picture, because this window never makes one.
  function syncPlate() {
    const plate = $("ips-plate");
    if (!plate) return;
    const aspect = selectedValue("ips-aspect", "16:9");
    plate.dataset.ratio = aspect;
    const title = ($("ips-title")?.value || "").trim();
    const slot = $("ips-plate-title");
    if (slot) {
      slot.textContent = title;
      slot.hidden = !title;
    }
    const chip = $("ips-plate-ref");
    if (chip) chip.hidden = !referenceDataUrl;
    const note = $("ips-plate-note");
    if (note) {
      const style = selectedValue("ips-style", "default");
      const parts = [aspect, tr(`ips_style_${style}`, style)];
      if (referenceDataUrl) parts.push(tr("ips_plate_with_ref", "with reference"));
      note.textContent = parts.join(" · ");
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

  function historyTime(at) {
    const date = new Date(Number(at) || 0);
    if (!Number.isFinite(date.getTime()) || !at) return "";
    const locale = typeof currentLanguage === "string" && currentLanguage === "zh" ? "zh-CN" : "en-US";
    const today = new Date().toDateString() === date.toDateString();
    try {
      return new Intl.DateTimeFormat(locale, today ? { hour: "2-digit", minute: "2-digit" } : { month: "short", day: "numeric" }).format(date);
    } catch {
      return "";
    }
  }

  // An entry written before the prompts were kept carries only the idea and
  // the aspect; bringing it back fills in what it has and leaves the prompts
  // alone rather than blanking them.
  function restoreHistory(item) {
    const idea = $("ips-idea");
    if (idea) idea.value = String(item.idea || "");
    const title = $("ips-title");
    if (title && typeof item.title === "string") title.value = item.title;
    if (ASPECTS.includes(item.aspect)) selectValue("ips-aspect", item.aspect);
    if (item.style === "default" || item.style === "photographic") selectValue("ips-style", item.style);
    if (item.gptImage || item.universal) {
      setOutputs(item.gptImage, item.universal);
      setStatus("ips_history_restored", "Brought back that idea and its two prompts.");
    } else {
      setStatus("ips_history_restored_idea", "Brought back that idea. It was saved before prompts were kept, so write it again.");
    }
    syncPlate();
  }

  function renderHistory() {
    const list = $("ips-history");
    if (!list) return;
    const items = readHistory();
    const count = $("ips-history-count");
    if (count) count.textContent = items.length ? `(${items.length})` : "";
    list.replaceChildren();
    if (!items.length) {
      const empty = document.createElement("li");
      empty.className = "ips-history-empty";
      // The key as well as the text: this row is built once and then only
      // re-read, so without the attribute applyLanguage cannot reach it and a
      // Chinese session kept an English "No saved prompts yet." under three
      // Chinese headings.
      empty.dataset.i18n = "ips_history_empty";
      empty.textContent = tr("ips_history_empty", "No saved prompts yet.");
      list.append(empty);
      return;
    }
    items.forEach((item) => {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ips-history-item";
      button.title = String(item.idea || "");
      const glyph = document.createElement("span");
      glyph.className = "ips-aspect-glyph";
      glyph.dataset.ratio = ASPECTS.includes(item.aspect) ? item.aspect : "16:9";
      glyph.setAttribute("aria-hidden", "true");
      const idea = document.createElement("span");
      idea.className = "ips-history-idea";
      idea.textContent = String(item.idea || "").slice(0, 120) || "…";
      const when = document.createElement("span");
      when.className = "ips-history-time";
      when.textContent = historyTime(item.at);
      button.append(glyph, idea, when);
      button.addEventListener("click", () => restoreHistory(item));
      li.append(button);
      list.append(li);
    });
  }

  // `Subject: …` lines become a two-column list; anything the model wrote
  // outside those six lines is kept as a plain row rather than dropped, since
  // the copy button hands over the raw text either way.
  function renderUniversal(value) {
    const view = $("ips-universal-view");
    if (!view) return;
    view.replaceChildren();
    String(value || "").split("\n").map((line) => line.trim()).filter(Boolean).forEach((line) => {
      const match = line.match(/^([A-Za-z ]+):\s*(.*)$/);
      const known = match && UNIVERSAL_FIELDS.some((field) => field.toLowerCase() === match[1].trim().toLowerCase());
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      if (known) {
        dt.textContent = match[1].trim();
        dd.textContent = match[2];
      } else {
        dd.textContent = line;
        dd.className = "is-loose";
      }
      view.append(dt, dd);
    });
  }

  function setOutputs(gptImage, universal) {
    const gpt = $("ips-gpt-out");
    if (gpt) gpt.value = String(gptImage || "");
    const raw = $("ips-universal-out");
    if (raw) raw.value = String(universal || "");
    renderUniversal(universal);
    syncOutputState();
  }

  // Until a prompt exists the group shows the plate and one line saying so.
  // Two empty boxes that look exactly like the fields beside them do not read
  // as "here is what you got back" - they read as more form.
  function syncOutputState() {
    const group = document.querySelector('[data-window="imagePromptStudio"] .ips-outputs-group');
    if (!group) return;
    const values = { gpt: ($("ips-gpt-out")?.value || "").trim(), universal: ($("ips-universal-out")?.value || "").trim() };
    group.classList.toggle("is-filled", Boolean(values.gpt || values.universal));
    const gptBlock = $("ips-gpt-block");
    if (gptBlock) gptBlock.hidden = !values.gpt;
    const universalBlock = $("ips-universal-block");
    if (universalBlock) universalBlock.hidden = !values.universal;
  }

  function setBusy(busy) {
    const go = $("ips-go");
    if (go) go.disabled = busy;
    const cancel = $("ips-cancel");
    if (cancel) cancel.hidden = !busy;
    const group = document.querySelector('[data-window="imagePromptStudio"] .ips-outputs-group');
    group?.classList.toggle("is-busy", busy);
  }

  function cancelGenerate() {
    activeRequest?.abort();
  }

  async function generate() {
    if (activeRequest) return;
    const idea = ($("ips-idea").value || "").trim();
    if (!idea) {
      setStatus("ips_empty", "Describe an idea first.");
      $("ips-idea")?.focus();
      return;
    }
    if (typeof fetchModelPayload !== "function" || !window.AISystem6ImagePromptRuntime) {
      setStatus("ips_unavailable", "No model available.");
      return;
    }

    const aspect = selectedValue("ips-aspect", "16:9");
    const style = selectedValue("ips-style", "default");
    const title = ($("ips-title").value || "").trim();
    const messages = window.AISystem6ImagePromptRuntime.buildImagePromptMessages({ idea, title, aspect, style });
    const user = messages.find((message) => message.role === "user");
    if (user && referenceDataUrl) {
      if (!canUseReferenceImage()) {
        clearReference();
        setStatus("ips_ref_unavailable_cloud", "Reference images need a vision model.");
      } else {
        user.content = [
          { type: "text", text: user.content },
          { type: "image_url", image_url: { url: referenceDataUrl, detail: "low" } },
        ];
      }
    }

    // A request of its own, not the shared long-task controller: nothing in
    // this window starts a long task, so getLongTaskSignal() had been handing
    // the model call an undefined signal and Cancel had nothing to stop.
    const request = new AbortController();
    activeRequest = request;
    setStatus("ips_generating", "Writing prompt…");
    setBusy(true);
    try {
      const modelResult = await sendLocalModelTask({
        payload: {
          model: typeof getLocalModelRequestName === "function" ? getLocalModelRequestName() : undefined,
          messages,
          temperature: 0.7,
          max_tokens: 1800,
          stream: false,
          ai_system6_task_kind: "image-prompt",
        },
        signal: request.signal,
        taskKind: "image-prompt",
        streamPreference: "json",
      });
      const content = String(modelResult?.text || "").trim();
      // "lmstudio_bad_response: ..." is the codebase's shared shape for "the
      // model answered but not usefully" - explainStatusError/friendlyErrorDetail
      // already turn that code into a localized, actionable note in the catch
      // below, in whichever language the UI is running.
      if (!content) throw new Error("lmstudio_bad_response: model returned an empty response");
      const parsedResult = window.AISystem6ImagePromptRuntime.parseImagePromptResult(content);
      if (!parsedResult.gptImage && !parsedResult.universal) {
        throw new Error("lmstudio_bad_response: could not parse the generated prompt");
      }
      setOutputs(parsedResult.gptImage, parsedResult.universal);
      saveHistory({
        idea,
        title,
        aspect,
        style,
        gptImage: parsedResult.gptImage,
        universal: parsedResult.universal,
        at: Date.now(),
      });
      renderHistory();
      setStatus("ips_done", "Prompt ready — copy it.");
    } catch (error) {
      // A failed or cancelled run leaves the previous prompts where they were:
      // they are only replaced by a run that succeeded.
      if (request.signal.aborted || error?.name === "AbortError") {
        setStatus("ips_cancelled", "Stopped. The previous prompts are unchanged.");
      } else {
        console.error("Image Prompt Studio: prompt writing failed", error);
        const detail = typeof friendlyErrorDetail === "function" ? friendlyErrorDetail(error) : "";
        const el = $("ips-status");
        if (el) el.textContent = [tr("ips_error", "Prompt writing failed."), detail].filter(Boolean).join(" ");
      }
    } finally {
      activeRequest = null;
      setBusy(false);
    }
  }

  // The confirmation lands on the button the eye is already on, and the status
  // bar says it too for anyone listening rather than looking.
  async function copy(button, id) {
    const value = ($(id)?.value || "").trim();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setStatus("ips_copied", "Copied.");
      clearTimeout(button.copiedTimer);
      button.textContent = tr("ips_copied_button", "Copied");
      button.copiedTimer = setTimeout(() => {
        button.textContent = tr("ips_copy", "Copy");
      }, COPIED_LABEL_MS);
    } catch {
      setStatus("ips_copy_failed", "Copy failed.");
    }
  }

  function wireReferenceImage() {
    $("ips-ref")?.addEventListener("click", () => openTransientFilePicker({
      accept: CLIO_IMAGE_ACCEPT,
      onSelect: attachReference,
    }));
    $("ips-ref-remove")?.addEventListener("click", () => {
      clearReference();
      setStatus("ips_ref_removed", "Reference image removed.");
    });
    const well = $("ips-well");
    if (!well) return;
    const hasFiles = (event) => [...(event.dataTransfer?.types || [])].includes("Files");
    well.addEventListener("dragover", (event) => {
      if (!hasFiles(event) || !canUseReferenceImage()) return;
      event.preventDefault();
      well.classList.add("is-dragging");
    });
    well.addEventListener("dragleave", () => well.classList.remove("is-dragging"));
    well.addEventListener("drop", (event) => {
      well.classList.remove("is-dragging");
      if (!hasFiles(event) || !canUseReferenceImage()) return;
      event.preventDefault();
      attachReference(event.dataTransfer.files);
    });
  }

  function aspectOptionsHtml() {
    return ASPECTS.map((ratio, index) => [
      '<label class="ips-aspect">',
      `<input type="radio" name="ips-aspect" value="${ratio}"${index === 0 ? " checked" : ""}>`,
      `<span class="ips-aspect-glyph" data-ratio="${ratio}" aria-hidden="true"></span>`,
      `<span class="ips-aspect-label">${ratio}</span>`,
      "</label>",
    ].join("")).join("");
  }

  function buildStudioWindow() {
    const existing = document.querySelector('[data-window="imagePromptStudio"]');
    if (existing) return existing;
    return window.AISystem6ApplicationShell.createWindow({
      windowName: "imagePromptStudio",
      windowClass: "image-prompt-studio-window",
      labelledBy: "image-prompt-studio-title",
      titleKey: "image_prompt_studio_title",
      title: "Image Prompt Studio",
      statusClass: "ips-status-bar",
      statusHtml: '<span id="ips-status" role="status" aria-live="polite" data-i18n="ips_ready">Ready.</span>',
      paneClass: "ips-pane",
      paneHtml: [
      // Two halves in the order the writer uses them: the brief on the left,
      // what comes back on the right, one rule between. Position says which
      // half is which, so neither needs a framed box to say it; the legends
      // stay for screen readers and the language sweep.
      '<div class="ips-body">',
      '<section class="ips-brief ips-group" aria-labelledby="ips-legend-input">',
      '<h2 class="ips-legend" id="ips-legend-input" data-i18n="ips_group_input">What you want</h2>',
      '<label class="ips-control"><span class="ips-label" data-i18n="ips_idea">Idea</span><textarea id="ips-idea" rows="5" data-i18n-placeholder="ips_idea_hint" data-balloon-help="balloon_ips_idea" placeholder="e.g. calm tech blue, cinematic..."></textarea></label>',
      '<label class="ips-control"><span class="ips-label" data-i18n="ips_title">Title / overlay text (optional)</span><input type="text" id="ips-title" data-balloon-help="balloon_ips_title"></label>',
      // The choice shows its shape: each ratio is drawn, and the native radio
      // group underneath gives arrow keys and one tab stop for free.
      '<fieldset class="ips-choice" data-balloon-help="balloon_ips_aspect"><legend class="ips-label" data-i18n="ips_aspect">Aspect ratio</legend>',
      `<div class="ips-aspects">${aspectOptionsHtml()}</div>`,
      '</fieldset>',
      '<fieldset class="ips-choice" data-balloon-help="balloon_ips_style"><legend class="ips-label" data-i18n="ips_style">Style</legend>',
      '<div class="ips-radios">',
      '<label class="ips-radio"><input type="radio" name="ips-style" value="default" checked><span data-i18n="ips_style_default">Default</span></label>',
      '<label class="ips-radio"><input type="radio" name="ips-style" value="photographic"><span data-i18n="ips_style_photographic">Photographic</span></label>',
      '</div>',
      '</fieldset>',
      '<div class="ips-control"><span class="ips-label" data-i18n="ips_ref_label">Reference image</span>',
      '<div class="ips-well drop-target" id="ips-well" data-balloon-help="balloon_ips_ref" data-drop-label="Drop to attach">',
      '<img class="ips-well-thumb" id="ips-well-thumb" alt="" hidden>',
      '<span class="ips-well-text" id="ips-well-text" data-i18n="ips_ref_drop">Drop an image here, or</span>',
      '<button class="btn" type="button" id="ips-ref" data-i18n="ips_ref_choose">Choose…</button>',
      '<button class="btn" type="button" id="ips-ref-remove" data-i18n="ips_ref_remove" hidden>Remove</button>',
      '</div>',
      '</div>',
      // The verb ends the half it acts on, right-aligned with the default
      // button last. SideAsk opens another window rather than producing a
      // prompt, so it sits at the far left of the same row.
      '<div class="button-row ips-actions">',
      '<button class="btn" type="button" id="ips-sideask" data-i18n="ips_sideask">Ask SideAsk</button>',
      '<span class="spacer"></span>',
      '<button class="btn" type="button" id="ips-cancel" data-i18n="ips_cancel" hidden>Cancel</button>',
      '<button class="btn default" type="button" id="ips-go" data-i18n="ips_generate" data-balloon-help="balloon_ips_generate">Write Prompt</button>',
      '</div>',
      '</section>',
      '<section class="ips-proof ips-group ips-outputs-group" aria-labelledby="ips-legend-output">',
      '<h2 class="ips-legend" id="ips-legend-output" data-i18n="ips_group_output">The prompts</h2>',
      '<figure class="ips-plate-wrap">',
      '<div class="ips-plate" id="ips-plate" data-ratio="16:9" aria-hidden="true"><span class="ips-plate-title" id="ips-plate-title" hidden></span><span class="ips-plate-ref" id="ips-plate-ref" data-i18n="ips_ref_label" hidden>Reference image</span></div>',
      '<figcaption class="ips-plate-note" id="ips-plate-note">16:9</figcaption>',
      '</figure>',
      '<p class="ips-empty" data-i18n="ips_output_empty">Write an idea and press Write Prompt; the two prompts appear here.</p>',
      '<p class="ips-busy-note" data-i18n="ips_generating">Writing prompt…</p>',
      '<div class="ips-outputs">',
      '<div class="ips-output" id="ips-gpt-block">',
      '<div class="ips-output-head"><span class="ips-label" id="ips-gpt-label" data-i18n="ips_gpt_label">GPT-Image</span><span class="ips-output-kind" data-i18n="ips_gpt_kind">one paragraph</span><button class="btn" type="button" id="ips-copy-gpt" data-i18n="ips_copy" data-balloon-help="balloon_ips_copy">Copy</button></div>',
      '<textarea id="ips-gpt-out" rows="6" readonly aria-labelledby="ips-gpt-label" data-balloon-help="balloon_ips_gpt_out"></textarea>',
      '</div>',
      '<div class="ips-output" id="ips-universal-block">',
      '<div class="ips-output-head"><span class="ips-label" id="ips-universal-label" data-i18n="ips_universal_label">Universal</span><span class="ips-output-kind" data-i18n="ips_universal_kind">by line</span><button class="btn" type="button" id="ips-copy-universal" data-i18n="ips_copy" data-balloon-help="balloon_ips_copy">Copy</button></div>',
      '<dl class="ips-universal-view" id="ips-universal-view" aria-labelledby="ips-universal-label" data-balloon-help="balloon_ips_universal_out"></dl>',
      // The raw text stays in a field: the copy button and SideAsk's context
      // both read it as a value, and the list above is only its display.
      '<textarea id="ips-universal-out" hidden readonly></textarea>',
      '</div>',
      '</div>',
      '</section>',
      '</div>',
      '<details class="ips-history-group" data-balloon-help="balloon_ips_history">',
      '<summary><span data-i18n="ips_history">Written before</span> <span id="ips-history-count"></span></summary>',
      '<ul id="ips-history" class="ips-history"></ul>',
      '</details>',
      ].join(""),
    });
  }

  function render() {
    const win = buildStudioWindow();
    if (wiredWindow === win) {
      updateReferenceImageAvailability();
      return;
    }
    wiredWindow = win;
    $("ips-go")?.addEventListener("click", generate);
    $("ips-cancel")?.addEventListener("click", cancelGenerate);
    $("ips-sideask")?.addEventListener("click", openSideAsk);
    const copyGpt = $("ips-copy-gpt");
    copyGpt?.addEventListener("click", () => copy(copyGpt, "ips-gpt-out"));
    const copyUniversal = $("ips-copy-universal");
    copyUniversal?.addEventListener("click", () => copy(copyUniversal, "ips-universal-out"));
    $("ips-title")?.addEventListener("input", syncPlate);
    win.querySelectorAll('input[name="ips-aspect"], input[name="ips-style"]').forEach((input) => {
      input.addEventListener("change", syncPlate);
    });
    // Command-Return writes from either field, the way a default button answers
    // Return in a dialog; a plain Return in the idea still starts a new line.
    win.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && win.contains(event.target)) {
        event.preventDefault();
        generate();
      } else if (event.key === "." && event.metaKey && activeRequest) {
        event.preventDefault();
        cancelGenerate();
      }
    });
    wireReferenceImage();
    renderHistory();
    syncOutputState();
    updateReferenceImageAvailability();
    // The window is built here, after boot's applyLanguage() has already run,
    // so its data-i18n attributes were never resolved and a Chinese session got
    // fourteen English labels whose Chinese values existed the whole time.
    // sideask-pad.js does the same thing at the end of its own render.
    if (typeof applyLanguage === "function") applyLanguage();
    syncPlate();
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
        // lane-errors: this used to say "No model available." (ips_unavailable)
        // regardless of the real reason arrangeWindowAssistantSplit declined -
        // a claim that was often false. ips_sideask_failed names what actually
        // happened (SideAsk did not open) instead of guessing why.
        setStatus("ips_sideask_failed", "SideAsk could not open. Try again, or open ClioTalk from Applications instead.");
      }
    } catch (error) {
      console.error("Image Prompt Studio: SideAsk open failed", error);
      setStatus("ips_sideask_failed", "SideAsk could not open. Try again, or open ClioTalk from Applications instead.");
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
