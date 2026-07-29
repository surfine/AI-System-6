// Early compatibility shims for the macOS 11.2.3 WebKit used by the DTK build.

(function installLegacyBrowserCompatibility(root) {
  if (!Array.prototype.at) {
    Object.defineProperty(Array.prototype, "at", {
      value: function at(index) {
        const offset = Number(index) || 0;
        const position = offset < 0 ? this.length + offset : offset;
        return this[position];
      },
      configurable: true,
      writable: true,
    });
  }

  if (!root.crypto) root.crypto = {};
  if (!root.crypto.randomUUID) {
    root.crypto.randomUUID = function randomUUID() {
      const bytes = new Uint8Array(16);
      if (root.crypto.getRandomValues) root.crypto.getRandomValues(bytes);
      else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
      bytes[6] = (bytes[6] & 15) | 64;
      bytes[8] = (bytes[8] & 63) | 128;
      return Array.prototype.map.call(bytes, function (byte, index) {
        const hex = byte.toString(16).padStart(2, "0");
        return [4, 6, 8, 10].indexOf(index) >= 0 ? `-${hex}` : hex;
      }).join("");
    };
  }

  if (!root.structuredClone) {
    root.structuredClone = function structuredClone(value) {
      if (value === null || typeof value !== "object") return value;
      if (value instanceof Date) return new Date(value.getTime());
      if (Array.isArray(value)) return value.map(root.structuredClone);
      const clone = {};
      Object.keys(value).forEach(function (key) {
        clone[key] = root.structuredClone(value[key]);
      });
      return clone;
    };
  }

  if (root.Element && root.Element.prototype && !root.Element.prototype.replaceChildren && root.document) {
    Object.defineProperty(root.Element.prototype, "replaceChildren", {
      value: function replaceChildren() {
        const parent = this;
        const children = Array.prototype.slice.call(arguments);
        while (parent.firstChild) parent.removeChild(parent.firstChild);
        children.forEach(function (child) {
          const node = child && typeof child.nodeType === "number"
            ? child
            : root.document.createTextNode(String(child));
          parent.appendChild(node);
        });
      },
      configurable: true,
      writable: true,
    });
  }

  // Safari 14 (the WebKit shipped with macOS 11.2.3) has no dialog element.
  // Without this, every dialog renders as normal page content and a Cancel
  // button submits its form, reloading the desktop instead of closing it.
  const hasNativeDialog = typeof root.HTMLDialogElement !== "undefined"
    && typeof root.HTMLDialogElement.prototype.showModal === "function";
  const legacyWebKit = !hasNativeDialog;
  root.AISystem6LegacyWebKit = legacyWebKit;
  if (legacyWebKit && root.document) {
    const documentElement = root.document.documentElement;
    const toggleClass = function toggleClass(node, name, enabled) {
      if (!node || !node.classList) return;
      if (typeof node.classList.toggle === "function") node.classList.toggle(name, !!enabled);
      else if (enabled && typeof node.classList.add === "function") node.classList.add(name);
      else if (!enabled && typeof node.classList.remove === "function") node.classList.remove(name);
    };
    const addClass = function addClass(node, name) {
      if (node && node.classList && typeof node.classList.add === "function") node.classList.add(name);
    };
    addClass(documentElement, "is-legacy-webkit");

    const scheduleFrame = typeof root.requestAnimationFrame === "function"
      ? root.requestAnimationFrame.bind(root)
      : function scheduleFrame(callback) { return root.setTimeout ? root.setTimeout(callback, 0) : callback(); };
    let legacyLayoutQueued = false;
    let legacyAspectObserver = null;
    const legacyAspectTargets = new WeakSet();

    const setLegacyAspect = function setLegacyAspect(node, ratio) {
      if (!node || !node.getBoundingClientRect) return;
      const width = node.getBoundingClientRect().width;
      if (!width) return;
      node.style.setProperty("--legacy-aspect-height", `${Math.round(width / ratio)}px`);
      addClass(node, `is-legacy-aspect-${String(ratio).replace(".", "-")}`);
      if (legacyAspectObserver && !legacyAspectTargets.has(node)) {
        legacyAspectTargets.add(node);
        legacyAspectObserver.observe(node);
      }
    };
    const syncAspectRatios = function syncAspectRatios() {
      if (!root.document.querySelectorAll) return;
      root.document.querySelectorAll(".bureaucracy-template img").forEach(function (node) { setLegacyAspect(node, 4 / 3); });
      root.document.querySelectorAll(".image-manager-item img").forEach(function (node) {
        const list = node.closest ? node.closest(".image-manager-list") : null;
        if (!list || !list.classList || !list.classList.contains("is-list-view")) {
          setLegacyAspect(node, list && list.classList.contains("is-small-icons") ? 1 : 4 / 3);
        }
      });
      root.document.querySelectorAll(".lc-bg-item").forEach(function (node) { setLegacyAspect(node, 16 / 10); });
    };

    const syncContainerFallbacks = function syncContainerFallbacks() {
      if (!root.document.querySelectorAll) return;
      root.document.querySelectorAll(".window").forEach(function (windowNode) {
        if (!windowNode.getBoundingClientRect) return;
        const rect = windowNode.getBoundingClientRect();
        const width = rect.width || 0;
        const height = rect.height || 0;
        toggleClass(windowNode, "is-legacy-under-760", width > 0 && width < 760);
        toggleClass(windowNode, "is-legacy-over-760", width >= 760);
        toggleClass(windowNode, "is-legacy-under-720", width > 0 && width < 720);
        toggleClass(windowNode, "is-legacy-under-620", width > 0 && width < 620);
        toggleClass(windowNode, "is-legacy-under-520", width > 0 && width < 520);
        toggleClass(windowNode, "is-legacy-under-430", width > 0 && width < 430);
        toggleClass(windowNode, "is-legacy-short-560", height > 0 && height < 560);
      });
      const spine = root.document.querySelector ? root.document.querySelector(".writing-spine-panel") : null;
      if (spine && spine.getBoundingClientRect) toggleClass(spine, "is-legacy-under-230", spine.getBoundingClientRect().width < 230);
    };

    const syncHasFallbacks = function syncHasFallbacks() {
      const document = root.document;
      if (!document.querySelectorAll) return;
      const body = document.body;
      toggleClass(documentElement, "is-legacy-liquid-glass", !!(body && body.classList && body.classList.contains("use-liquid-glass")));
      document.querySelectorAll(".details-bar").forEach(function (node) {
        toggleClass(node, "is-legacy-has-view-controls", !!node.querySelector(".view-controls"));
      });
      document.querySelectorAll(".tdi-rail").forEach(function (node) {
        toggleClass(node, "is-legacy-has-hidden-tabs", !!node.querySelector(".tdi-tabs.is-hidden"));
      });
      document.querySelectorAll(".project-finder-pathbar").forEach(function (node) {
        const up = node.querySelector("#project-disk-up:not([hidden])");
        const path = node.querySelector("#project-disk-path");
        toggleClass(node, "is-legacy-has-project-up", !!up);
        toggleClass(node, "is-legacy-project-path-hidden", !!(path && path.classList && path.classList.contains("visually-hidden")));
      });
      document.querySelectorAll(".startup-open-option").forEach(function (node) {
        toggleClass(node, "is-legacy-disabled-option", !!node.querySelector("input:disabled"));
      });
      document.querySelectorAll(".trash-list").forEach(function (node) {
        toggleClass(node, "is-legacy-empty", !!node.querySelector(".trash-empty-state"));
      });
      document.querySelectorAll(".window").forEach(function (node) {
        toggleClass(node, "is-legacy-has-grow-box", !!node.querySelector(":scope > .grow-box"));
      });
      document.querySelectorAll(".backup-preview").forEach(function (node) {
        toggleClass(node, "is-legacy-has-empty-folder-note", !!node.querySelector(":scope > .empty-folder-note"));
      });
      document.querySelectorAll("#liquid-cover-app .lc-button-row").forEach(function (node) {
        toggleClass(node, "is-legacy-has-add-layer", !!node.querySelector("#lc-add-layer"));
        toggleClass(node, "is-legacy-has-shape-circle", !!node.querySelector("#lc-shape-circle"));
      });
      document.querySelectorAll(".lc-row").forEach(function (node) {
        toggleClass(node, "is-legacy-has-tint-alpha", !!node.querySelector("#lc-tint-alpha"));
        toggleClass(node, "is-legacy-has-font", !!node.querySelector("#lc-font"));
        toggleClass(node, "is-legacy-has-layer-solid", !!node.querySelector("#lc-layer-solid"));
        toggleClass(node, "is-legacy-has-tint-color", !!node.querySelector("#lc-tint-color"));
      });
      document.querySelectorAll(".lc-inspector-panel").forEach(function (node) {
        toggleClass(node, "is-legacy-finetune-open", !!node.querySelector(".lc-finetune[open]"));
      });
    };

    const syncLegacyLayout = function syncLegacyLayout() {
      legacyLayoutQueued = false;
      syncHasFallbacks();
      syncContainerFallbacks();
      syncAspectRatios();
    };
    const queueLegacyLayout = function queueLegacyLayout() {
      if (legacyLayoutQueued) return;
      legacyLayoutQueued = true;
      scheduleFrame(syncLegacyLayout);
    };

    // Keep keyboard focus visually equivalent to :focus-visible without
    // turning a pointer click into a persistent focus ring.
    documentElement.addEventListener && documentElement.addEventListener("keydown", function (event) {
      if (["Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].indexOf(event.key) >= 0) {
        addClass(documentElement, "is-legacy-keyboard-nav");
      }
    }, true);
    documentElement.addEventListener && documentElement.addEventListener("pointerdown", function () {
      toggleClass(documentElement, "is-legacy-keyboard-nav", false);
    }, true);

    if (typeof root.ResizeObserver === "function") {
      legacyAspectObserver = new root.ResizeObserver(function () { queueLegacyLayout(); });
      root.document.querySelectorAll(".window, .writing-spine-panel").forEach(function (node) {
        legacyAspectObserver.observe(node);
      });
    } else if (root.addEventListener) {
      root.addEventListener("resize", queueLegacyLayout);
    }
    if (typeof root.MutationObserver === "function" && root.document.body) {
      new root.MutationObserver(queueLegacyLayout).observe(root.document.body, {
        attributes: true,
        attributeFilter: ["class", "hidden", "disabled", "open"],
        childList: true,
        subtree: true,
      });
    }
    queueLegacyLayout();

    const createCloseEvent = function createCloseEvent() {
      const event = root.document.createEvent("Event");
      event.initEvent("close", false, false);
      return event;
    };

    root.document.querySelectorAll("dialog").forEach(function (dialog) {
      if (dialog.dataset.legacyDialogFallback === "true") return;
      dialog.dataset.legacyDialogFallback = "true";
      dialog.hidden = true;
      dialog.removeAttribute("open");

      try {
        Object.defineProperty(dialog, "open", {
          configurable: true,
          get: function getOpen() {
            return this.hasAttribute("open");
          },
          set: function setOpen(value) {
            this.hidden = !value;
            if (value) this.setAttribute("open", "");
            else this.removeAttribute("open");
          },
        });
      } catch (error) {
        // Older WebKit lets the attribute remain the source of truth.
      }

      if (!("returnValue" in dialog)) dialog.returnValue = "";

      dialog.showModal = function showModal() {
        this.returnValue = "";
        this.hidden = false;
        this.setAttribute("open", "");
        this.setAttribute("role", "dialog");
        this.setAttribute("aria-modal", "true");
      };

      dialog.close = function close(returnValue) {
        if (returnValue !== undefined) this.returnValue = String(returnValue);
        if (this.hidden && !this.hasAttribute("open")) return;
        this.hidden = true;
        this.removeAttribute("open");
        this.removeAttribute("aria-modal");
        this.dispatchEvent(createCloseEvent());
      };

      const form = dialog.querySelector("form[method='dialog']");
      if (!form) return;

      const closeDialog = function closeDialog(submitter) {
        dialog.close(submitter && submitter.value ? submitter.value : "");
      };

      form.addEventListener("click", function (event) {
        const submitter = event.target.closest("button");
        if (!submitter || submitter.form !== form) return;
        event.preventDefault();
        closeDialog(submitter);
      });

      form.addEventListener("submit", function (event) {
        event.preventDefault();
        const submitter = event.submitter || root.document.activeElement || form.querySelector("button.default, button[type='submit']");
        closeDialog(submitter);
      });
    });
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
