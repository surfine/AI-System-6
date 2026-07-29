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

  function createVerificationDialog() {
    const dialog = document.createElement("dialog");
    dialog.setAttribute("aria-labelledby", "public-verification-title");
    dialog.style.cssText = [
      "border:1px solid #4b4b4b",
      "border-radius:10px",
      "padding:0",
      "max-width:390px",
      "width:calc(100% - 32px)",
      "background:#f4f1e8",
      "color:#171717",
      "box-shadow:0 20px 70px rgba(0,0,0,.28)",
    ].join(";");
    dialog.innerHTML = [
      '<div style="padding:22px 22px 18px">',
      '<h2 id="public-verification-title" style="font:700 18px/1.3 system-ui;margin:0 0 9px">Verify public access</h2>',
      '<p style="font:14px/1.5 system-ui;margin:0 0 16px">AI, Reader and Search need a one-time verification for this browsing session.</p>',
      '<div data-turnstile-slot style="min-height:65px"></div>',
      '<p data-turnstile-status role="status" style="font:13px/1.4 system-ui;margin:12px 0 0;color:#555">Waiting for verification…</p>',
      '<div style="display:flex;justify-content:flex-end;margin-top:14px">',
      '<button type="button" data-cancel style="font:14px system-ui;padding:6px 12px">Cancel</button>',
      "</div>",
      "</div>",
    ].join("");
    document.body.append(dialog);
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    return dialog;
  }

  async function verifyPublicSession() {
    const capabilities = await loadCapabilities();
    if (!capabilities.public_deployment) return true;
    const sitekey = String(capabilities.public_access?.turnstile_site_key || "");
    const action = String(capabilities.public_access?.turnstile_action || "turnstile-spin-v2");
    if (!sitekey) throw new Error("Public verification is not configured.");

    const turnstile = await loadTurnstileScript();
    const dialog = createVerificationDialog();
    const slot = dialog.querySelector("[data-turnstile-slot]");
    const status = dialog.querySelector("[data-turnstile-status]");
    // The script is loaded with render=explicit, so these attributes document
    // the widget rather than trigger auto-rendering. Set through the DOM API:
    // the sitekey arrives from /api/capabilities and never touches innerHTML.
    slot.className = "cf-turnstile";
    slot.setAttribute("data-sitekey", sitekey);
    slot.setAttribute("data-action", action);

    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        try { dialog.close(); } catch {}
        dialog.remove();
        if (error) reject(error);
        else resolve(true);
      };

      dialog.querySelector("[data-cancel]")?.addEventListener("click", () => {
        finish(new Error("Verification cancelled."));
      });
      dialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        finish(new Error("Verification cancelled."));
      });

      turnstile.render(slot, {
        sitekey,
        action,
        theme: "light",
        callback: async (token) => {
          if (status) status.textContent = "Confirming verification…";
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
            if (status) status.textContent = error.message || "Verification failed. Please try again.";
            try { turnstile.reset(); } catch {}
          }
        },
        "error-callback": () => {
          if (status) status.textContent = "Verification service unavailable. Please retry.";
        },
        "expired-callback": () => {
          if (status) status.textContent = "Verification expired. Please retry.";
        },
      });
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
