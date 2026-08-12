// Public deployment access gate. Local deployments pay no runtime cost beyond
// one small capabilities request; the Turnstile script is loaded only after a
// protected network action receives verification_required.

(function installPublicAccessGate() {
  "use strict";

  const nativeFetch = window.fetch.bind(window);
  let capabilitiesPromise = null;
  let turnstileScriptPromise = null;
  let verificationPromise = null;

  function requestUrl(input) {
    try {
      return new URL(
        input instanceof Request ? input.url : String(input),
        window.location.href
      );
    } catch {
      return null;
    }
  }

  function isSameOriginApi(input) {
    const url = requestUrl(input);
    return !!url && url.origin === window.location.origin && url.pathname.startsWith("/api/");
  }

  function isGateEndpoint(input) {
    const url = requestUrl(input);
    return url?.pathname === "/api/session/turnstile";
  }

  async function loadCapabilities() {
    if (!capabilitiesPromise) {
      capabilitiesPromise = nativeFetch("/api/capabilities", {
        headers: { "Accept": "application/json" },
        cache: "no-store",
      })
        .then(async (response) => {
          if (!response.ok) throw new Error(`Capabilities HTTP ${response.status}`);
          return response.json();
        })
        .catch(() => ({
          deployment_profile: "local",
          public_deployment: false,
          features: {},
          public_access: {},
        }))
        .then((capabilities) => {
          document.documentElement.dataset.deploymentProfile =
            capabilities.public_deployment ? "public" : "local";
          window.dispatchEvent(new CustomEvent("ai-system6:capabilities", {
            detail: capabilities,
          }));
          return capabilities;
        });
    }
    return capabilitiesPromise;
  }

  function loadTurnstileScript() {
    if (window.turnstile?.render) return Promise.resolve(window.turnstile);
    if (turnstileScriptPromise) return turnstileScriptPromise;
    turnstileScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.addEventListener("load", () => {
        if (window.turnstile?.render) resolve(window.turnstile);
        else reject(new Error("Turnstile did not initialize."));
      }, { once: true });
      script.addEventListener("error", () => {
        reject(new Error("Could not load the verification service."));
      }, { once: true });
      document.head.append(script);
    });
    return turnstileScriptPromise;
  }

  function tr(key) {
    return typeof t === "function" ? t(key) : key;
  }

  // The verification surface is a real AI System 6 finder-operation modal
  // (index.html #public-verification-modal), so Classic, Platinum and Liquid
  // Glass all render it through the system object grammar. The widget is the
  // only third-party part, and it is documented through the DOM API: the
  // sitekey arrives from /api/capabilities and is set only through the DOM
  // attribute API, never through markup strings.
  function getVerificationDialog() {
    return document.querySelector("#public-verification-modal");
  }

  async function hasValidSession() {
    try {
      const response = await nativeFetch("/api/session/status", {
        headers: { "Accept": "application/json" },
        cache: "no-store",
      });
      if (!response.ok) return false;
      const data = await response.json().catch(() => ({}));
      return data.verified === true;
    } catch {
      // A status probe must never block the first verification attempt; the
      // protected request path remains the authority on whether a session
      // exists, and the 401 retry loop is the fallback.
      return false;
    }
  }

  async function verifyPublicSession() {
    const capabilities = await loadCapabilities();
    if (!capabilities.public_deployment) return true;
    const sitekey = String(capabilities.public_access?.turnstile_site_key || "");
    const action = String(capabilities.public_access?.turnstile_action || "turnstile-spin-v2");
    if (!sitekey) throw new Error("Public verification is not configured.");
    if (await hasValidSession()) return true;

    const turnstile = await loadTurnstileScript();
    const dialog = getVerificationDialog();
    if (!dialog) throw new Error("Public verification UI is unavailable.");
    const slot = dialog.querySelector("#public-verification-slot");
    const status = dialog.querySelector("#public-verification-status");
    const cancelButton = dialog.querySelector("#public-verification-cancel");
    const retryButton = dialog.querySelector("#public-verification-retry");

    slot.replaceChildren();
    slot.className = "cf-turnstile";
    slot.setAttribute("data-sitekey", sitekey);
    slot.setAttribute("data-action", action);

    return new Promise((resolve, reject) => {
      let settled = false;
      let widgetId = null;
      const setStatus = (key) => {
        if (status) status.textContent = tr(key);
      };
      const finish = (error) => {
        if (settled) return;
        settled = true;
        dialog.onclose = null;
        try { if (dialog.open) dialog.close(); } catch {}
        if (typeof modalScrim !== "undefined") modalScrim.classList.add("is-hidden");
        if (error) reject(error);
        else resolve(true);
      };

      cancelButton?.addEventListener("click", () => finish(new Error("Verification cancelled.")), { once: true });
      retryButton?.addEventListener("click", () => {
        try { if (widgetId) turnstile.reset(widgetId); } catch {}
        setStatus("public_verify_waiting");
      });
      dialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        finish(new Error("Verification cancelled."));
      });
      dialog.onclose = () => {
        if (!settled) finish(new Error("Verification cancelled."));
      };

      try {
        if (typeof modalScrim !== "undefined") modalScrim.classList.remove("is-hidden");
        if (typeof playSystemSound === "function") playSystemSound("alert");
        if (dialog.open) dialog.close("cancel");
        setStatus("public_verify_waiting");
        dialog.showModal();
      } catch (error) {
        finish(error);
        return;
      }

      try {
        widgetId = turnstile.render(slot, {
          sitekey,
          action,
          theme: "light",
          callback: async (token) => {
            if (settled) return;
            setStatus("public_verify_confirming");
            try {
              const response = await nativeFetch("/api/session/turnstile", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token }),
                cache: "no-store",
              });
              const data = await response.json().catch(() => ({}));
              if (!response.ok || !data.verified) {
                throw new Error(data.error || "Verification failed.");
              }
              finish();
            } catch (error) {
              console.warn("Public verification failed", error);
              setStatus("public_verify_failed");
              try { if (widgetId) turnstile.reset(widgetId); } catch {}
            }
          },
          "error-callback": () => setStatus("public_verify_unavailable"),
          "expired-callback": () => setStatus("public_verify_expired"),
        });
      } catch (error) {
        console.warn("Public verification widget failed", error);
        setStatus("public_verify_unavailable");
      }
    });
  }

  async function ensurePublicSession() {
    if (!verificationPromise) {
      verificationPromise = verifyPublicSession().finally(() => {
        verificationPromise = null;
      });
    }
    return verificationPromise;
  }

  window.fetch = async function guardedFetch(input, init) {
    const firstInput = input instanceof Request ? input.clone() : input;
    const retryInput = input instanceof Request ? input.clone() : input;
    const response = await nativeFetch(firstInput, init);
    if (
      response.status !== 401
      || !isSameOriginApi(input)
      || isGateEndpoint(input)
    ) {
      return response;
    }
    const data = await response.clone().json().catch(() => ({}));
    if (data.code !== "verification_required") return response;
    await ensurePublicSession();
    return nativeFetch(retryInput, init);
  };

  window.AISystem6PublicAccess = {
    getCapabilities: loadCapabilities,
    ensureSession: ensurePublicSession,
    nativeFetch,
  };

  loadCapabilities();
})();
