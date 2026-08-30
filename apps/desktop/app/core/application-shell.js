// Shared dynamic application shell.
//
// Static windows keep their inspectable markup in index.html. Applications
// that arrive lazily use this helper so their System window anatomy cannot
// drift into a private title bar, status strip, or pane implementation. The
// helper owns shell structure only; feature modules still own their content.

(function installApplicationShell(global) {
  "use strict";

  function classNames(...values) {
    return values.flatMap((value) => String(value || "").split(/\s+/)).filter(Boolean).join(" ");
  }

  function button(className, labelKey, fallback) {
    const control = document.createElement("button");
    control.type = "button";
    control.className = className;
    control.setAttribute("aria-label", fallback);
    control.dataset.i18nAriaLabel = labelKey;
    return control;
  }

  // The System window title bar: Close at the leading edge, the title, then
  // Zoom and WindowShade at the trailing edge. Every appearance dresses these
  // three controls -- Aqua and Yosemite make the same buttons into lamps
  // through --traffic-light-* tokens and still keep Close left and Zoom right.
  //
  // It is separate from createWindow because a title bar has a second reader:
  // Theme Lab shows one as a specimen. A specimen that copied this markup would
  // be a second birthplace for it, free to drift from the shipping anatomy --
  // which is what the Lab's hand-drawn three-lamp title bar had already done.
  // Callers that are not opening a window pass no windowName, get no window
  // element, and are therefore invisible to the window manager.
  function createTitleBar(options = {}) {
    const labelledBy = String(options.labelledBy || "").trim();
    const titleBar = document.createElement("div");
    titleBar.className = "title-bar";
    titleBar.append(button("close-box", "close", "Close"));

    const heading = document.createElement(options.titleTag === "h1" ? "h1" : "h2");
    if (labelledBy) heading.id = labelledBy;
    if (options.titleKey) heading.dataset.i18n = String(options.titleKey);
    heading.textContent = String(options.title || options.windowName || "");
    titleBar.append(heading);

    if (options.resizable !== false) titleBar.append(button("resize-box", "zoom", "Zoom"));
    if (options.shade !== false) titleBar.append(button("shade-box", "collapse", "Collapse"));
    return titleBar;
  }

  function createWindow(options = {}) {
    const windowName = String(options.windowName || "").trim();
    const labelledBy = String(options.labelledBy || "").trim();
    if (!windowName || !labelledBy) throw new TypeError("Dynamic application windows require windowName and labelledBy.");

    const existing = [...document.querySelectorAll("[data-window]")]
      .find((candidate) => candidate.dataset.window === windowName);
    if (existing) {
      if (!existing.applicationTitleBar) existing.applicationTitleBar = existing.querySelector?.(":scope > .title-bar") || null;
      if (!existing.applicationStatusBar) existing.applicationStatusBar = existing.querySelector?.(":scope > .details-bar") || null;
      if (!existing.applicationPane) existing.applicationPane = existing.querySelector?.(":scope > .window-pane") || null;
      return existing;
    }

    const win = document.createElement("section");
    win.className = classNames("window", options.windowClass, "is-hidden");
    win.dataset.window = windowName;
    win.setAttribute("aria-labelledby", labelledBy);

    const titleBar = createTitleBar(options);
    win.append(titleBar);

    let statusBar = null;
    if (options.statusClass || options.statusHtml) {
      statusBar = document.createElement("div");
      statusBar.className = classNames("details-bar", options.statusClass);
      statusBar.innerHTML = String(options.statusHtml || "");
      win.append(statusBar);
    }

    // Markup that belongs between the title bar and the pane and is not a status
    // bar -- a mode tablist, a tool strip. Inserted unwrapped, so the window owns
    // its own element rather than inheriting a details-bar it did not ask for.
    if (options.beforePaneHtml) {
      const slot = document.createElement("div");
      slot.innerHTML = String(options.beforePaneHtml);
      while (slot.firstChild) win.append(slot.firstChild);
    }

    const pane = document.createElement("div");
    pane.className = classNames("window-pane", options.paneClass);
    pane.innerHTML = String(options.paneHtml || "");
    win.append(pane);

    (options.host || document.querySelector(".desktop"))?.append(win);

    // A window built after boot missed the boot language sweep, so in Chinese it
    // would open showing the English text baked into its template. The literals
    // in these templates are pre-i18n defaults, exactly as they were while the
    // markup lived in index.html; this is the sweep that markup got for free.
    global.AISystem6TranslateWithin?.(win);

    // The frame bars are the other boot-time pass a late window misses. The
    // sweep skips windows that already carry bars, so calling it here does the
    // new window only. Without it, a window built by its module loses the
    // scroll lanes and the frame margin the same window had in index.html.
    global.installWindowFrameBars?.();
    return Object.assign(win, { applicationTitleBar: titleBar, applicationStatusBar: statusBar, applicationPane: pane });
  }

  global.AISystem6ApplicationShell = Object.freeze({ createWindow, createTitleBar });
})(window);
