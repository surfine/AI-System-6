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

  async function changeLocalCredential(action, payload = {}) {
    if (isPublicCloudCredentialMode()) return null;
    const response = await fetch("/api/cloud/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    if (!response.ok) throw new Error(serviceErrorDetail(response.status, await response.text()));
    return response.json();
  }

  async function stageCloudCredentialIfNeeded() {
    const apiKey = cloudApiKeyEl.value.trim() || cloudRuntimeApiKey;
    if (isPublicCloudCredentialMode()) {
      if (apiKey) setCloudRuntimeApiKey(apiKey);
      return { credentialId: "", staged: false };
    }
    if (!apiKey) {
      return { credentialId: cloudConfig?.credentialId || "", staged: false };
    }
    const baseUrl = PROVIDER_BASE_URLS[cloudConfig?.provider] || DEEPSEEK_BASE_URL;
    const data = await changeLocalCredential("stage", {
      provider: cloudConfig?.provider || "deepseek",
      base_url: baseUrl,
      api_key: apiKey,
    });
    if (!cloudConfig) cloudConfig = {};
    cloudConfig.credentialId = String(data?.credential_id || "");
    cloudConfig.credentialPersistence = String(data?.persistence || "service-session");
    setCloudRuntimeApiKey("");
    cloudApiKeyEl.value = "";
    saveCloudConfig();
    return { credentialId: cloudConfig.credentialId, staged: true };
  }

  async function persistVerifiedCloudCredential() {
    if (isPublicCloudCredentialMode() || !cloudConfig?.credentialId) return;
    const data = await changeLocalCredential("persist", {
      credential_id: cloudConfig.credentialId,
    });
    cloudConfig.credentialPersistence = String(data?.persistence || "service-session");
    saveCloudConfig();
  }

  async function discardStagedCloudCredential(credentialId) {
    if (isPublicCloudCredentialMode() || !credentialId) return;
    try {
      await changeLocalCredential("discard", { credential_id: credentialId });
    } catch {}
  }

  async function verifyRestoredCloudCredential() {
    if (isPublicCloudCredentialMode() || !cloudConfig?.credentialId) return;
    try {
      const data = await changeLocalCredential("available", {
        credential_id: cloudConfig.credentialId,
        provider: cloudConfig.provider || "deepseek",
      });
      if (data?.available) return;
      cloudConfig.credentialId = "";
      cloudConfig.credentialPersistence = "";
      cloudConfig.active = false;
      saveCloudConfig();
      applyCloudActiveState();
      updateCheckButtonState();
    } catch {
      // A temporarily unavailable local service must not erase a valid
      // Keychain reference. The next status check will surface the failure.
    }
  }

  async function fetchBalanceOnly() {
    if (!cloudConfig || !cloudConfig.provider || !cloudCredentialReady()) return null;
    try {
      const baseUrl = PROVIDER_BASE_URLS[cloudConfig.provider] || DEEPSEEK_BASE_URL;
      const res = await fetch("/api/cloud/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...cloudCredentialTransportFields("status"),
          provider: cloudConfig.provider,
          base_url: baseUrl,
        }),
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
    if (!cloudConfig || !cloudConfig.provider || !cloudCredentialReady()) return;
    const baseUrl = PROVIDER_BASE_URLS[cloudConfig.provider] || DEEPSEEK_BASE_URL;
    cloudStatusEl.hidden = false;
    cloudStatusDot.className = "cloud-status-dot";
    cloudStatusText.textContent = typeof t === "function" ? t("cloud_checking") : "Checking...";
    cloudBalanceEl.textContent = "";
    try {
      const response = await fetch("/api/cloud/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...cloudCredentialTransportFields("status"),
          provider: cloudConfig.provider,
          base_url: baseUrl,
        }),
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
    const active = !!(cloudConfig && cloudConfig.active && cloudConfig.provider && cloudCredentialReady());
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
      const hasConfig = cloudConfig && cloudConfig.provider && cloudCredentialReady();
      if (hasConfig) {
        if (typeof refreshCloudUsageDisplay === "function") refreshCloudUsageDisplay();
      } else {
        if (typeof refreshCloudUsageDisplay === "function") refreshCloudUsageDisplay();
      }
      cloudStatusHint.textContent = typeof t === "function"
        ? t("cloud_status_hint")
        : "The key is kept for this tab session only; project files and exports never include it.";
    }
    if (typeof renderCloudModelPopover === "function") renderCloudModelPopover();
  }

  function toggleCloud() {
    if (!cloudConfig || !cloudConfig.provider || !cloudCredentialReady()) return;
    cloudConfig.active = !cloudConfig.active;
    if (cloudConfig.active) {
      cloudConfig.baseUrl = PROVIDER_BASE_URLS[cloudConfig.provider] || DEEPSEEK_BASE_URL;
    }
    saveCloudConfig();
    applyCloudActiveState();
  }

  function cloudPopoverElement(tag, className = "", text = "") {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = String(text);
    return element;
  }

  function cloudPopoverButton(action, mark, label, sublabel = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = action;
    const markElement = cloudPopoverElement("span", "cl-mrk", mark);
    const textElement = cloudPopoverElement("span", "cl-txt", label);
    if (sublabel) {
      textElement.append(cloudPopoverElement("small", "cl-subtxt", sublabel));
    }
    button.append(markElement, textElement);
    return button;
  }

  function cloudPopoverRow(label, value, supplementary = "") {
    const row = cloudPopoverElement("div", "cl-row");
    const labelElement = cloudPopoverElement("span", "", `${label}:`);
    const valueElement = cloudPopoverElement("b", "", value);
    if (supplementary) {
      const detail = cloudPopoverElement("small", "", supplementary);
      detail.style.opacity = ".65";
      valueElement.append(" ", detail);
    }
    row.append(labelElement, valueElement);
    return row;
  }

  function cloudPopoverStaticRow(mark, label, sublabel = "") {
    const row = cloudPopoverElement("div", "cl-static-row");
    const markElement = cloudPopoverElement("span", "cl-mrk", mark);
    const textElement = cloudPopoverElement("span", "cl-txt", label);
    if (sublabel) {
      textElement.append(cloudPopoverElement("small", "cl-subtxt", sublabel));
    }
    row.append(markElement, textElement);
    return row;
  }

  function wireCloudPopoverButtons(popover) {
    popover.querySelectorAll("button").forEach(function (button) {
      button.addEventListener("click", function (event) {
        event.stopPropagation();
        if (typeof closeMenus === "function") closeMenus();
        const action = button.dataset.action;
        if (action === "toggle-cloud" && !cloudConfig?.active) {
          toggleCloud();
        } else if (action === "toggle-local" && cloudConfig?.active) {
          toggleCloud();
        } else if (action === "refresh-balance") {
          checkCloudStatus();
        } else if (action === "open-model-settings" || action === "open-cloud-settings") {
          if (typeof openWindow === "function") {
            openWindow("control");
            if (action === "open-cloud-settings") {
              const keyElement = document.querySelector("#cloud-api-key");
              if (keyElement) {
                keyElement.focus();
                keyElement.select();
              }
            }
          }
        }
      });
    });
  }

  window.renderCloudModelPopover = function () {
    const popover = document.querySelector("#cloud-model-popover");
    if (!popover) return;
    if (!cloudConfig) {
      const disconnectedText = typeof t === "function" ? t("model_not_connected") : "Model not connected";
      popover.replaceChildren(
        cloudPopoverElement("div", "cl-hdr", disconnectedText),
        cloudPopoverButton(
          "open-model-settings",
          "",
          typeof t === "function" ? t("control_panel") : "Control Panel"
        )
      );
      wireCloudPopoverButtons(popover);
      return;
    }

    const latestText = typeof cloudUsageText === "function" ? cloudUsageText(latestCloudUsage) : "-";
    const sessionText = typeof cloudUsageText === "function" ? cloudUsageText(sessionCloudUsage) : "-";
    const balText = typeof cloudBalanceText === "function" ? cloudBalanceText(cloudConfig) : "-";
    let balanceSpentText = "";
    if (cloudConfig.balance && balText !== "-") {
      const cur = cloudConfig.balance.currency || "CNY";
      if (cloudBalanceAtActivation !== null) {
        const spent = cloudBalanceAtActivation - Number(cloudConfig.balance.total);
        if (spent > 0.000001) balanceSpentText = `(-${cur}${spent.toFixed(4)})`;
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
    const divider = () => document.createElement("hr");
    const nodes = cloudConfig.active
      ? [
          cloudPopoverElement("div", "cl-hdr", t("cloud_model")),
          cloudPopoverElement("div", "cl-model-name", cloudRouteText),
          cloudPopoverRow(t("context_length"), contextText),
          cloudPopoverRow(t("cl_lat"), latestText),
          cloudPopoverRow(t("cl_ses"), sessionText),
          cloudPopoverRow(t("cl_bal"), balText, balanceSpentText),
          cloudPopoverElement(
            "div",
            "cl-est-note",
            typeof t === "function"
              ? t("cl_est_note")
              : "Costs estimated from published prices. See provider dashboard for actual billing."
          ),
          divider(),
          cloudPopoverButton("toggle-cloud", activeText, cloudModeText, cloudRouteText),
          cloudPopoverButton("toggle-local", localText, localModeText, localModelText),
          divider(),
          cloudPopoverButton("refresh-balance", "", t("cl_act_ref")),
          cloudPopoverButton("open-cloud-settings", "", t("cl_act_set")),
        ]
      : [
          cloudPopoverStaticRow(localText, localModeText, localSummary),
          cloudPopoverRow(t("context_length"), contextText),
          cloudPopoverRow(t("model_state"), localStateText),
          divider(),
          cloudPopoverButton(
            "toggle-cloud",
            activeText,
            typeof t === "function" ? t("cl_act_cld") : cloudModeText
          ),
        ];

    popover.replaceChildren(...nodes);
    wireCloudPopoverButtons(popover);
  };

  function updateCheckButtonState() {
    const hasKey = !!cloudApiKeyEl.value.trim() || cloudCredentialReady();
    const hasProvider = !!cloudProviderEl.value;
    cloudCheckBtn.disabled = !(hasKey && hasProvider);
  }

  // Provider change
  cloudProviderEl.addEventListener("change", async function () {
    const provider = cloudProviderEl.value;
    if (!provider) {
      const credentialId = cloudConfig?.credentialId || "";
      cloudConfig = null;
      saveCloudConfig();
      setCloudRuntimeApiKey("");
      if (credentialId && !isPublicCloudCredentialMode()) {
        changeLocalCredential("delete", { credential_id: credentialId }).catch(function () {});
      }
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
    setCloudRuntimeApiKey(cloudApiKeyEl.value.trim());
    cloudConfig.active = false;
    saveCloudConfig();
    updateCheckButtonState();
    cloudStatusEl.hidden = true;
    applyCloudActiveState();
  });

  // Check status button
  cloudCheckBtn.addEventListener("click", async function () {
    setControlLoading(cloudCheckBtn, true, typeof t === "function" ? t("cloud_checking") : "Checking…");
    let stagedCredentialId = "";
    try {
      const staged = await stageCloudCredentialIfNeeded();
      stagedCredentialId = staged.staged ? staged.credentialId : "";
      await checkCloudStatus();
      if (cloudStatusDot.classList.contains("is-connected")) {
        await persistVerifiedCloudCredential();
        cloudConfig.active = true;
        cloudConfig.baseUrl = PROVIDER_BASE_URLS[cloudConfig.provider] || DEEPSEEK_BASE_URL;
        saveCloudConfig();
        applyCloudActiveState();
      } else {
        await discardStagedCloudCredential(stagedCredentialId);
        if (stagedCredentialId && cloudConfig?.credentialId === stagedCredentialId) {
          cloudConfig.credentialId = "";
          cloudConfig.credentialPersistence = "";
        }
        cloudConfig.active = false;
        saveCloudConfig();
        applyCloudActiveState();
      }
    } catch (error) {
      await discardStagedCloudCredential(stagedCredentialId);
      if (stagedCredentialId && cloudConfig?.credentialId === stagedCredentialId) {
        cloudConfig.credentialId = "";
        cloudConfig.credentialPersistence = "";
      }
      if (cloudConfig) cloudConfig.active = false;
      saveCloudConfig();
      cloudStatusEl.hidden = false;
      cloudStatusDot.className = "cloud-status-dot is-error";
      cloudStatusText.textContent = String(error?.message || error || (typeof t === "function" ? t("cloud_error") : "Error"));
      applyCloudActiveState();
    } finally {
      setControlLoading(cloudCheckBtn, false);
      updateCheckButtonState();
    }
  });

  // Restore saved config
  loadCloudConfig();
  if (cloudConfig && cloudConfig.provider) {
    cloudProviderEl.value = cloudConfig.provider;
    cloudApiKeyEl.value = "";
    populateCloudModelDropdown(BUILTIN_PROVIDER_MODELS[cloudConfig.provider] || []);
    fetchCloudModels().then(function (models) {
      if (models.length) populateCloudModelDropdown(models);
      if (cloudConfig.model) setCloudModelControlValue(cloudConfig.model);
      window.syncCloudModelControls();
    });
    applyCloudActiveState();
    if (cloudRuntimeApiKey && !isPublicCloudCredentialMode()) {
      stageCloudCredentialIfNeeded()
        .then(updateCheckButtonState)
        .catch(function () {
          cloudApiKeyEl.value = "";
          setCloudRuntimeApiKey("");
          updateCheckButtonState();
        });
    } else {
      verifyRestoredCloudCredential();
    }
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
