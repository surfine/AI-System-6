// Cloud model integration — DeepSeek is the first-class cloud provider.
// The server routes stay OpenAI-compatible internally, but product QA does
// not promise other paid cloud vendors.

(function () {
  "use strict";

  const cloudProviderEl = document.querySelector("#cloud-provider");
  const cloudApiKeyEl = document.querySelector("#cloud-api-key");
  const cloudModelEl = document.querySelector("#cloud-model");
  const cloudModelSelectEl = document.querySelector("#cloud-model-select");
  const manualModelFieldsEl = document.querySelector("#manual-model-fields");
  const cloudCheckBtn = document.querySelector("#cloud-check-status");
  const cloudStatusEl = document.querySelector("#cloud-status");
  const cloudStatusDot = document.querySelector("#cloud-status-indicator");
  const cloudStatusText = document.querySelector("#cloud-status-text");
  const cloudBalanceEl = document.querySelector("#cloud-balance");
  const cloudStatusHint = document.querySelector("#cloud-status-hint");
  const cloudIndicatorEl = document.querySelector("#cloud-model-indicator");
  const DEEPSEEK_BASE_URL = "https:" + String.fromCharCode(47, 47) + "api.deepseek.com";

  const PROVIDER_BASE_URLS = {
    deepseek: DEEPSEEK_BASE_URL,
  };
  const BUILTIN_PROVIDER_MODELS = {
    deepseek: [
      { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", context_length: 1000000 },
      { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", context_length: 1000000 },
    ],
  };

  let cloudModels = [];
  let cloudBalanceAtActivation = null;

  function isManualModelMode() {
    return !!manualModelFieldsEl?.checked || cloudConfig?.modelInputMode === "manual";
  }

  function setCloudModelControlValue(value) {
    const nextValue = String(value || "");
    if (cloudModelEl) cloudModelEl.value = nextValue;
    if (cloudModelSelectEl) {
      if (nextValue && ![...cloudModelSelectEl.options].some((option) => option.value === nextValue)) {
        const option = document.createElement("option");
        option.value = nextValue;
        option.textContent = nextValue;
        cloudModelSelectEl.append(option);
      }
      cloudModelSelectEl.value = nextValue;
    }
  }

  function selectedCloudModelValue() {
    return isManualModelMode()
      ? (cloudModelEl?.value || "").trim()
      : (cloudModelSelectEl?.value || "").trim();
  }

  window.syncCloudModelControls = function () {
    const manual = isManualModelMode();
    const hasProvider = !!cloudProviderEl.value;
    if (manualModelFieldsEl && cloudConfig?.modelInputMode === "manual") {
      manualModelFieldsEl.checked = true;
    }
    if (cloudModelSelectEl) {
      cloudModelSelectEl.hidden = manual;
      cloudModelSelectEl.disabled = manual || !hasProvider;
    }
    if (cloudModelEl) {
      cloudModelEl.hidden = !manual;
      cloudModelEl.disabled = !manual || !hasProvider;
    }
    setCloudModelControlValue(cloudConfig?.model || "");
    if (typeof refreshSystemSelectControls === "function") refreshSystemSelectControls();
  };

  async function fetchBalanceOnly() {
    if (!cloudConfig || !cloudConfig.provider || !cloudConfig.apiKey) return null;
    try {
      const baseUrl = PROVIDER_BASE_URLS[cloudConfig.provider] || DEEPSEEK_BASE_URL;
      const res = await fetch("/api/cloud/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: cloudConfig.apiKey, base_url: baseUrl }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.connected && data.balance) {
        cloudConfig.balance = data.balance;
        if (typeof renderCloudModelPopover === "function") renderCloudModelPopover();
        if (typeof renderCloudStatePanel === "function") renderCloudStatePanel();
        return data.balance;
      }
    } catch (e) {}
    return null;
  }

  window.fetchCloudBalanceSilent = function () { return fetchBalanceOnly(); };

  async function fetchCloudModels() {
    try {
      const response = await fetch("/api/cloud/models");
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data.models) ? data.models : [];
    } catch (e) { return []; }
  }

  function syncCloudModelContextLength() {
    if (!cloudConfig || !cloudConfig.model) return;
    const knownMap = typeof CLOUD_MODEL_CONTEXT_LENGTHS !== "undefined" ? CLOUD_MODEL_CONTEXT_LENGTHS : {};
    cloudConfig.modelContextLength = knownMap[cloudConfig.model] || 0;
  }

  async function checkCloudStatus() {
    if (!cloudConfig || !cloudConfig.provider || !cloudConfig.apiKey) return;
    const baseUrl = PROVIDER_BASE_URLS[cloudConfig.provider] || DEEPSEEK_BASE_URL;
    cloudStatusEl.hidden = false;
    cloudStatusDot.className = "cloud-status-dot";
    cloudStatusText.textContent = typeof t === "function" ? t("cloud_checking") : "Checking...";
    cloudBalanceEl.textContent = "";
    try {
      const response = await fetch("/api/cloud/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: cloudConfig.apiKey, base_url: baseUrl }),
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const data = await response.json();
      if (data.connected) {
        cloudStatusDot.classList.add("is-connected");
        cloudStatusText.textContent = typeof t === "function" ? t("cloud_connected") : "Connected";
        if (data.balance) {
          cloudBalanceEl.textContent = data.balance.currency + " " + Number(data.balance.total).toFixed(2);
        }
      } else {
        cloudStatusDot.classList.add("is-error");
        const errorMsg = data.model_error || (typeof t === "function" ? t("cloud_disconnected") : "Disconnected");
        cloudStatusText.textContent = errorMsg;
      }
    } catch (err) {
      cloudStatusDot.classList.add("is-error");
      cloudStatusText.textContent = err.message || (typeof t === "function" ? t("cloud_error") : "Error");
    }
  }

  function populateCloudModelDropdown(models) {
    cloudModels = Array.isArray(models) ? models : [];
    cloudModelSelectEl?.replaceChildren();
    cloudModels.forEach(function (m) {
      const option = document.createElement("option");
      option.value = m.id;
      option.textContent = m.name || m.id;
      cloudModelSelectEl?.append(option);
    });
    if (!cloudConfig) cloudConfig = {};
    if (!cloudConfig.model && cloudModels.length) {
      cloudConfig.model = cloudModels[0].id;
      saveCloudConfig();
    }
    setCloudModelControlValue(cloudConfig.model);
    window.syncCloudModelControls();
  }

  function applyCloudActiveState() {
    const active = !!(cloudConfig && cloudConfig.active && cloudConfig.provider && cloudConfig.apiKey);
    document.body.classList.toggle("is-cloud-active", active);
    const labelEl = document.querySelector("#cloud-model-label");
    if (active) {
      syncCloudModelContextLength();
      if (typeof refreshCloudUsageDisplay === "function") refreshCloudUsageDisplay();
      cloudStatusHint.textContent = typeof t === "function" ? t("cloud_active_hint") : "Cloud model active.";
      fetchBalanceOnly().then(function (bal) {
        if (bal && cloudBalanceAtActivation === null) cloudBalanceAtActivation = bal.total;
      });
      if (typeof updateContextMaxForCurrentModel === "function") updateContextMaxForCurrentModel();
      if (typeof updateLocalModelState === "function") {
        updateLocalModelState({ ready: true });
      }
    } else {
      if (typeof updateContextMaxForCurrentModel === "function") updateContextMaxForCurrentModel();
      if (typeof refreshLocalModelReadiness === "function") {
        refreshLocalModelReadiness().finally(function () {
          if (typeof refreshCloudUsageDisplay === "function") refreshCloudUsageDisplay();
          if (typeof renderCloudModelPopover === "function") renderCloudModelPopover();
          if (typeof renderCloudStatePanel === "function") renderCloudStatePanel();
        });
      }
      const hasConfig = cloudConfig && cloudConfig.provider && cloudConfig.apiKey;
      if (hasConfig) {
        if (typeof refreshCloudUsageDisplay === "function") refreshCloudUsageDisplay();
      } else {
        cloudIndicatorEl.classList.add("is-hidden");
      }
      cloudStatusHint.textContent = typeof t === "function" ? t("cloud_status_hint") : "Enter API key and check connectivity.";
    }
    if (typeof renderCloudModelPopover === "function") renderCloudModelPopover();
  }

  function toggleCloud() {
    if (!cloudConfig || !cloudConfig.provider || !cloudConfig.apiKey) return;
    cloudConfig.active = !cloudConfig.active;
    if (cloudConfig.active) {
      cloudConfig.baseUrl = PROVIDER_BASE_URLS[cloudConfig.provider] || DEEPSEEK_BASE_URL;
    }
    saveCloudConfig();
    applyCloudActiveState();
  }

  window.renderCloudModelPopover = function () {
    const popover = document.querySelector("#cloud-model-popover");
    if (!popover || !cloudConfig) return;

    const latestText = typeof cloudUsageText === "function" ? cloudUsageText(latestCloudUsage) : "-";
    const sessionText = typeof cloudUsageText === "function" ? cloudUsageText(sessionCloudUsage) : "-";
    const balText = typeof cloudBalanceText === "function" ? cloudBalanceText(cloudConfig) : "-";
    let balSpent = "";
    if (cloudConfig.balance && balText !== "-") {
      const cur = cloudConfig.balance.currency || "CNY";
      if (cloudBalanceAtActivation !== null) {
        const spent = cloudBalanceAtActivation - Number(cloudConfig.balance.total);
        if (spent > 0.000001) balSpent = ' <small style="opacity:.65">(-' + cur + spent.toFixed(4) + ')</small>';
      }
    }

    const activeText = cloudConfig.active ? "✓" : "";
    const localText = !cloudConfig.active ? "✓" : "";
    const cloudModeText = currentLanguage === "zh" ? "DeepSeek（云端）" : "DeepSeek (Cloud)";
    const cloudRouteText = typeof cloudModelRouteLabel === "function" ? cloudModelRouteLabel(cloudConfig) : cloudModeText;
    const localModeText = currentLanguage === "zh" ? "LM Studio（本地）" : "LM Studio (Local)";
    const localModelText = (document.querySelector("#model")?.value || "").trim();
    const localProviderEl = document.getElementById("local-provider");
    const localProviderText = localProviderEl ? localProviderEl.options[localProviderEl.selectedIndex]?.text : "";
    const localSummary = localModelText || localProviderText || (typeof t === "function" ? t("local_lm_studio") : "LM Studio");
    const contextText = typeof currentContextWindowText === "function" ? currentContextWindowText(cloudConfig) : (document.querySelector("#context-length")?.value || "-");
    const localStateText = typeof modelStateCurrentStep === "function" ? modelStateCurrentStep() : "-";
    const estNote = '<div class="cl-est-note">' + (typeof t === "function" ? t("cl_est_note") : "Costs estimated from published prices. See provider dashboard for actual billing.") + '</div>';

    const lines = cloudConfig.active ? [
      '<div class="cl-hdr">' + t("cloud_model") + '</div>',
      '<div class="cl-model-name">' + cloudRouteText + '</div>',
      '<div class="cl-row"><span>' + t("context_length") + ':</span><b>' + contextText + '</b></div>',
      '<div class="cl-row"><span>' + t("cl_lat") + ':</span><b>' + latestText + '</b></div>',
      '<div class="cl-row"><span>' + t("cl_ses") + ':</span><b>' + sessionText + '</b></div>',
      '<div class="cl-row"><span>' + t("cl_bal") + ':</span><b>' + balText + balSpent + '</b></div>',
      estNote,
      '<hr />',
      '<button type="button" data-action="toggle-cloud"><span class="cl-mrk">' + activeText + '</span><span class="cl-txt">' + cloudModeText + '<small class="cl-subtxt">' + cloudRouteText + '</small></span></button>',
      '<button type="button" data-action="toggle-local"><span class="cl-mrk">' + localText + '</span><span class="cl-txt">' + localModeText + (localModelText ? '<small class="cl-subtxt">' + localModelText + '</small>' : '') + '</span></button>',
      '<hr />',
      '<button type="button" data-action="refresh-balance"><span class="cl-mrk"></span><span class="cl-txt">' + t("cl_act_ref") + '</span></button>',
      '<button type="button" data-action="open-cloud-settings"><span class="cl-mrk"></span><span class="cl-txt">' + t("cl_act_set") + '</span></button>'
    ] : [
      '<div class="cl-static-row"><span class="cl-mrk">' + localText + '</span><span class="cl-txt">' + localModeText + (localSummary ? '<small class="cl-subtxt">' + localSummary + '</small>' : '') + '</span></div>',
      '<div class="cl-row"><span>' + t("context_length") + ':</span><b>' + contextText + '</b></div>',
      '<div class="cl-row"><span>' + t("model_state") + ':</span><b>' + localStateText + '</b></div>',
      '<hr />',
      '<button type="button" data-action="toggle-cloud"><span class="cl-mrk">' + activeText + '</span><span class="cl-txt">' + (typeof t === "function" ? t("cl_act_cld") : cloudModeText) + '</span></button>'
    ];

    popover.innerHTML = lines.join("");

    popover.querySelectorAll("button").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (typeof closeMenus === "function") closeMenus();
        const act = btn.dataset.action;
        if (act === "toggle-cloud" && !cloudConfig.active) {
          toggleCloud();
        } else if (act === "toggle-local" && cloudConfig.active) {
          toggleCloud();
        } else if (act === "refresh-balance") {
          checkCloudStatus();
        } else if (act === "open-cloud-settings") {
          if (typeof openWindow === "function") {
            openWindow("control");
            const keyEl = document.querySelector("#cloud-api-key");
            if (keyEl) { keyEl.focus(); keyEl.select(); }
          }
        }
      });
    });
  };

  function updateCheckButtonState() {
    const hasKey = !!cloudApiKeyEl.value.trim();
    const hasProvider = !!cloudProviderEl.value;
    cloudCheckBtn.disabled = !(hasKey && hasProvider);
  }

  // Provider change
  cloudProviderEl.addEventListener("change", async function () {
    const provider = cloudProviderEl.value;
    if (!provider) {
      cloudConfig = null;
      saveCloudConfig();
      cloudModelSelectEl?.replaceChildren();
      cloudModelEl.value = "";
      window.syncCloudModelControls();
      cloudApiKeyEl.value = "";
      cloudStatusEl.hidden = true;
      updateCheckButtonState();
      applyCloudActiveState();
      return;
    }
    if (!cloudConfig) cloudConfig = {};
    cloudConfig.provider = provider;
    cloudConfig.active = false;
    saveCloudConfig();
    updateCheckButtonState();
    cloudStatusEl.hidden = true;
    populateCloudModelDropdown(BUILTIN_PROVIDER_MODELS[provider] || []);
    const models = await fetchCloudModels();
    if (models.length) populateCloudModelDropdown(models);
    if (cloudConfig.model) setCloudModelControlValue(cloudConfig.model);
    window.syncCloudModelControls();
  });

  // Model change
  function handleCloudModelChanged() {
    if (!cloudConfig) cloudConfig = {};
    cloudConfig.model = selectedCloudModelValue();
    cloudConfig.active = false;
    syncCloudModelContextLength();
    saveCloudConfig();
    cloudStatusEl.hidden = true;
    applyCloudActiveState();
    window.syncCloudModelControls();
  }
  cloudModelSelectEl?.addEventListener("change", handleCloudModelChanged);
  cloudModelEl.addEventListener("input", handleCloudModelChanged);
  cloudModelEl.addEventListener("change", handleCloudModelChanged);
  manualModelFieldsEl?.addEventListener("change", function () {
    if (!cloudConfig) cloudConfig = {};
    cloudConfig.modelInputMode = manualModelFieldsEl.checked ? "manual" : "select";
    cloudConfig.model = selectedCloudModelValue() || cloudConfig.model || "";
    cloudConfig.active = false;
    syncCloudModelContextLength();
    saveCloudConfig();
    cloudStatusEl.hidden = true;
    window.syncCloudModelControls();
    if (typeof syncLocalModelControls === "function") syncLocalModelControls();
    applyCloudActiveState();
  });

  // API key change
  cloudApiKeyEl.addEventListener("input", function () {
    if (!cloudConfig) cloudConfig = {};
    cloudConfig.apiKey = cloudApiKeyEl.value.trim();
    cloudConfig.active = false;
    saveCloudConfig();
    updateCheckButtonState();
    cloudStatusEl.hidden = true;
    applyCloudActiveState();
  });

  // Check status button
  cloudCheckBtn.addEventListener("click", async function () {
    cloudCheckBtn.disabled = true;
    try {
      await checkCloudStatus();
      if (cloudStatusDot.classList.contains("is-connected")) {
        cloudConfig.active = true;
        cloudConfig.baseUrl = PROVIDER_BASE_URLS[cloudConfig.provider] || DEEPSEEK_BASE_URL;
        saveCloudConfig();
        applyCloudActiveState();
      } else {
        cloudConfig.active = false;
        saveCloudConfig();
        applyCloudActiveState();
      }
    } finally {
      updateCheckButtonState();
    }
  });

  // Restore saved config
  loadCloudConfig();
  if (cloudConfig && cloudConfig.provider) {
    cloudProviderEl.value = cloudConfig.provider;
    cloudApiKeyEl.value = cloudConfig.apiKey || "";
    populateCloudModelDropdown(BUILTIN_PROVIDER_MODELS[cloudConfig.provider] || []);
    fetchCloudModels().then(function (models) {
      if (models.length) populateCloudModelDropdown(models);
      if (cloudConfig.model) setCloudModelControlValue(cloudConfig.model);
      window.syncCloudModelControls();
    });
    applyCloudActiveState();
  } else {
    window.syncCloudModelControls();
  }
  updateCheckButtonState();
})();

// Update boot screen
(function () {
  const bootEl = document.querySelector("#boot-local-model");
  if (bootEl && cloudConfig && cloudConfig.active && cloudConfig.model) {
    bootEl.textContent = (typeof t === "function" ? t("boot_model_pending") : "LLM") + ": " + cloudConfig.model;
  }
})();

// Reset usage button
(function () {
  const section = document.querySelector(".control-cloud-section");
  if (!section) return;
  const btn = document.createElement("button");
  btn.className = "btn control-wide-button";
  btn.type = "button";
  btn.textContent = typeof t === "function" ? t("cloud_reset_usage") : "Reset Usage";
  btn.style.marginTop = "4px";
  btn.addEventListener("click", function () {
    localStorage.removeItem("ai-system6-cloud-usage");
    if (typeof refreshCloudUsageDisplay === "function") refreshCloudUsageDisplay();
  });
  section.appendChild(btn);
})();
