/* ClioWorks second draft (must-fix 2): N6's show, extracted so the Markdown
 * ClioStage (features/clio-stage.js) and the native pptx surface
 * (features/clio-stage-native.js) drive ONE layer instead of two copies.
 *
 * Presenting is a read-only projection of a whole deck: audience and presenter
 * are two faces of one overlay this module builds on the desk (no window
 * primitive), the page turns by direct switch wearing the deck's own arrival
 * fade, and the keyboard is →/Space forward, ← back, Esc and ⌘. out. With a
 * second screen (window.getScreenDetails) the audience's page is projected
 * full screen there; every way the API can be refused -- no API, no second
 * screen, a rejected permission -- degrades to the one screen silently.
 *
 * This file owns the machinery only. What a page IS stays with the surface:
 * create(source) is fed the surface's own reading of its deck --
 *
 *   count()           pages in the deck (0 = nothing to show)
 *   title()           the deck's name for the console head
 *   currentAt()       the page the writer is on when the show starts
 *   mount(host, at)   draw page `at` read-only into `host` (.clio-stage-page-host); truthy on success
 *   scale(host)       fit the mounted page to host's room
 *   notes(at, el)     put page `at`'s speaker notes into `el` (never the audience's)
 *   thumbTitle(at)    the page's one-line title ('' when untitled)
 *   openOverview(at)  leave the show and open the page overview on page `at`
 *   begin()           run before the layer goes up (the surface flushes its own state)
 *   finish(from)      run after the layer comes down (back where the writer left)
 *   status(key)       a translation key naming where the projection went
 *   holdWake/releaseWake   the desk's screen wake lock, per surface
 *   menuDirty()       refresh the desk's menu greying
 *   layerClass        extra class on the layer (the native surface scopes its page rules by it)
 *
 * The page overview is the same story: overview(container, source) builds the
 * light table -- every page as a thumbnail, a click back to that page, 放映
 * from a card, and reordering one named step in the surface's own model. */
(function (root) {
  'use strict';
  if (root.AISystem6ClioStageShow) return;

  const tr = (key, ...args) => (typeof root.t === "function" ? root.t(key, ...args) : key);

  function create(source, state) {
    // Not a second window: with a second screen the audience's page is
    // projected there automatically, and without one the console is the whole
    // stage and nothing throws. The layer is one overlay this module builds.
    const show = state || {
      active: false,
      layout: "audience",     // "audience" | "presenter"
      index: 0,
      fromIndex: 0,
      startedAt: 0,
      timerId: 0,
      fullscreen: false,      // this layer asked for the full screen and got it
      projected: false,       // a second screen is showing the audience's page
      root: null,
      onFullscreenChange: null,
      onResize: null,
    };

    const pages = () => Math.max(0, Number(source.count()) || 0);
    const atPage = (at) => Math.max(0, Math.min(pages() - 1, Number(at) || 0));

    function showProjector() {
      return show.root?.querySelector(".clio-stage-show-projector") || null;
    }

    function showButton(labelKey, run, { pressed, titleKey } = {}) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "clio-stage-show-button";
      button.textContent = tr(labelKey);
      if (pressed !== undefined) button.setAttribute("aria-pressed", pressed ? "true" : "false");
      if (titleKey) {
        button.title = tr(titleKey);
        button.setAttribute("aria-label", tr(titleKey));
      }
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        run();
      });
      return button;
    }

    // One control row, both faces: every button a touch point of at least 44px,
    // because a show is driven standing up, with a finger.
    function showControls(count) {
      const row = document.createElement("div");
      row.className = "clio-stage-show-controls";
      row.setAttribute("role", "toolbar");
      row.setAttribute("aria-label", tr("clio_stage_present"));
      const counter = document.createElement("span");
      counter.className = "clio-stage-show-counter";
      counter.textContent = tr("clio_stage_show_page", show.index + 1, count);
      row.append(
        showButton("previous_slide", () => showStep(-1), { titleKey: "previous_slide" }),
        counter,
        showButton("next_slide", () => showStep(1), { titleKey: "next_slide" }),
      );
      if (show.layout === "presenter") {
        row.append(showButton("clio_stage_presenter_view", () => showSetLayout("audience"), { pressed: true }));
        row.append(showButton("clio_stage_overview", () => openOverviewFromConsole()));
      } else {
        row.append(showButton("clio_stage_presenter_view", () => showSetLayout("presenter"), { pressed: false }));
      }
      row.append(showButton("clio_stage_present_exit", () => end(), { titleKey: "clio_stage_present_exit" }));
      return row;
    }

    function showPageRoom(className) {
      const room = document.createElement("div");
      room.className = className;
      const host = document.createElement("div");
      host.className = "clio-stage-page-host";
      // The page entering is the only transition the deck knows: the arrival fade
      // the rail and the streaming stage already use, untouched.
      host.classList.add("is-arriving");
      room.append(host);
      return { room, host };
    }

    function showRender() {
      const rootEl = show.root;
      const face = rootEl?.querySelector(".clio-stage-show-face");
      if (!show.active || !rootEl || !face || pages() < 1) return;
      const count = pages();
      show.index = atPage(show.index);
      const index = show.index;
      face.className = `clio-stage-show-face${show.layout === "presenter" ? " clio-stage-show-face-presenter" : ""}`;
      face.replaceChildren();
      const mount = (host, at) => source.mount(host, at);
      if (show.layout === "presenter") {
        const head = document.createElement("div");
        head.className = "clio-stage-show-head";
        const title = document.createElement("b");
        title.textContent = `${tr("clio_stage_presenter_view")} · ${source.title?.() || tr("clio_stage_label")}`;
        const clock = document.createElement("span");
        clock.className = "clio-stage-show-timer";
        head.append(title, clock);
        const consoleEl = document.createElement("div");
        consoleEl.className = "clio-stage-show-console";
        const current = showPageRoom("clio-stage-show-current");
        const side = document.createElement("aside");
        side.className = "clio-stage-show-side";
        const nextLabel = document.createElement("span");
        nextLabel.textContent = tr("next_slide");
        const nextIndex = index + 1;
        const nextBlock = document.createElement("div");
        nextBlock.className = "clio-stage-show-next";
        if (nextIndex < count) {
          const nextRoom = showPageRoom("clio-stage-show-next-room");
          nextBlock.append(nextRoom.room);
          const nextCaption = document.createElement("div");
          nextCaption.className = "clio-stage-show-next-caption";
          nextCaption.textContent = tr("clio_stage_thumb_label", nextIndex + 1, source.thumbTitle?.(nextIndex) || tr("untitled"));
          nextBlock.append(nextCaption);
          mount(nextRoom.host, nextIndex);
        } else {
          const endCard = document.createElement("span");
          endCard.className = "clio-stage-show-end";
          endCard.textContent = tr("end_of_deck");
          nextBlock.append(endCard);
        }
        const notesLabel = document.createElement("span");
        notesLabel.textContent = tr("clio_stage_notes");
        const notes = document.createElement("div");
        notes.className = "clio-stage-show-notes";
        notes.setAttribute("aria-label", tr("clio_stage_notes"));
        const notesBody = document.createElement("div");
        notesBody.className = "clio-stage-show-notes-body";
        source.notes?.(index, notesBody);
        notes.append(notesBody);
        side.append(nextLabel, nextBlock, notesLabel, notes);
        consoleEl.append(current.room, side);
        face.append(head, consoleEl, showControls(count));
        mount(current.host, index);
        source.scale(current.host);
        const nextHost = face.querySelector(".clio-stage-show-next-room .clio-stage-page-host");
        if (nextHost) source.scale(nextHost);
        updateShowTimer();
      } else {
        const audience = document.createElement("div");
        audience.className = "clio-stage-show-audience";
        // A click anywhere on the stage advances, the way a show has always gone.
        audience.addEventListener("click", () => showStep(1));
        const page = showPageRoom("clio-stage-show-page");
        audience.append(page.room);
        face.append(audience, showControls(count));
        mount(page.host, index);
        source.scale(page.host);
      }
      // The projector keeps its own copy of the page the audience is on.
      const projector = showProjector();
      const projectorHost = projector?.querySelector(".clio-stage-page-host");
      if (show.projected && projectorHost) {
        mount(projectorHost, index);
        source.scale(projectorHost);
      }
      rootEl.focus?.();
    }

    function updateShowTimer() {
      if (!show.active || !show.startedAt) return;
      const node = show.root?.querySelector(".clio-stage-show-timer");
      if (!node) return;
      const elapsed = Math.max(0, Date.now() - show.startedAt);
      const minutes = String(Math.floor(elapsed / 60000)).padStart(2, "0");
      const seconds = String(Math.floor((elapsed % 60000) / 1000)).padStart(2, "0");
      node.textContent = `${minutes}:${seconds}`;
    }

    function showStep(delta) {
      if (!show.active || pages() < 1) return false;
      const next = atPage(show.index + (Number(delta) || 0));
      if (next === show.index) return false;
      show.index = next;
      showRender();
      return true;
    }

    // The keyboard a show answers: → and Space forward, ← back, Esc and ⌘. (the
    // desk's own "terminate an operation", the key the page view closes with) out.
    // The stops keep the desk's global keys from hearing what the layer handled.
    function showKeydown(event) {
      if (!show.active || event.isComposing) return;
      const forward = ["ArrowRight", " ", "Spacebar", "PageDown"].includes(event.key);
      const back = ["ArrowLeft", "PageUp"].includes(event.key);
      const stop = event.key === "." && (event.metaKey || event.ctrlKey) && !event.altKey;
      if (!forward && !back && event.key !== "Escape" && !stop) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape" || stop) {
        end();
        return;
      }
      showStep(forward ? 1 : -1);
    }

    function showBuild() {
      const rootEl = document.createElement("div");
      rootEl.className = `clio-stage-show${source.layerClass ? ` ${source.layerClass}` : ""}`;
      rootEl.setAttribute("role", "application");
      rootEl.setAttribute("aria-label", tr("clio_stage_present"));
      rootEl.tabIndex = 0;
      const face = document.createElement("div");
      face.className = "clio-stage-show-face";
      const projector = document.createElement("div");
      projector.className = "clio-stage-show-projector";
      projector.hidden = true;
      const projectorHost = document.createElement("div");
      projectorHost.className = "clio-stage-page-host";
      projector.append(projectorHost);
      rootEl.append(face, projector);
      rootEl.addEventListener("keydown", showKeydown);
      return rootEl;
    }

    // The second screen, asked for the way the Window Management API defines: the
    // permission prompt is the browser's, and any refusal, missing API or missing
    // second screen answers null -- the caller stays on one screen, silently.
    async function showSecondScreen() {
      if (typeof window.getScreenDetails !== "function") return null;
      const details = await window.getScreenDetails();
      const screens = Array.from(details?.screens || []);
      return screens.find((screen) => screen && screen !== details.currentScreen) || null;
    }

    async function showProject() {
      const projector = showProjector();
      if (!show.active || !projector || show.projected) return false;
      if (typeof projector.requestFullscreen !== "function") return false;
      try {
        const screen = await showSecondScreen();
        if (!screen) return false;
        projector.hidden = false;
        const host = projector.querySelector(".clio-stage-page-host");
        source.mount(host, show.index);
        source.scale(host);
        await projector.requestFullscreen({ navigationUI: "hide", screen });
        show.projected = true;
        // The room the page scales against only exists once the second screen has
        // actually taken the element: until then the projector was measured
        // against this screen. Mount it again at the screen that now holds it,
        // so the first page fits the projector, not the laptop.
        source.mount(host, show.index);
        source.scale(host);
        source.status?.("clio_stage_show_projected");
        return true;
      } catch (error) {
        projector.hidden = true;
        source.status?.("clio_stage_show_projection_unavailable");
        return false;
      }
    }

    async function showStopProjection() {
      const projector = showProjector();
      if (!show.projected) return;
      show.projected = false;
      if (projector) projector.hidden = true;
      if (projector && document.fullscreenElement === projector && typeof document.exitFullscreen === "function") {
        try { await document.exitFullscreen(); } catch (error) { /* already leaving */ }
      }
    }

    async function showSetLayout(layout) {
      if (!show.active) return false;
      const next = layout === "presenter" ? "presenter" : "audience";
      if (next === show.layout) return true;
      show.layout = next;
      // Leaving this layer's own full screen on purpose: the flag comes down first
      // so the fullscreenchange that follows is not read as the show ending.
      show.fullscreen = false;
      if (typeof document.exitFullscreen === "function" && document.fullscreenElement) {
        try { await document.exitFullscreen(); } catch (error) { /* already leaving */ }
      }
      if (next === "presenter") {
        await showProject();
      } else {
        await showStopProjection();
        try {
          await show.root?.requestFullscreen?.({ navigationUI: "hide" });
          show.fullscreen = document.fullscreenElement === show.root;
        } catch (error) { /* the layer already covers the desk */ }
      }
      showRender();
      return true;
    }

    // Esc leaving full screen is the browser's exit, so the layer listens for the
    // element coming back: the audience show ends; a projection merely falls back
    // to the one screen, because the presenter is still standing there.
    function showFullscreenChange() {
      if (!show.active) return;
      const fullscreen = document.fullscreenElement || null;
      const projector = showProjector();
      if (fullscreen === projector) {
        // The second screen has just taken the element: its room is the one the
        // page must fit now, whatever this screen measured a moment before.
        const host = projector?.querySelector(".clio-stage-page-host");
        if (host) source.scale(host);
        return;
      }
      if (fullscreen === show.root) return;
      if (show.projected && projector) {
        show.projected = false;
        show.fullscreen = false;
        projector.hidden = true;
        return;
      }
      if (show.fullscreen) end();
    }

    function showRescale() {
      if (!show.active || !show.root) return;
      show.root.querySelectorAll(".clio-stage-page-host").forEach((host) => source.scale(host));
    }

    async function start({ index } = {}) {
      const count = pages();
      if (count < 1 || show.active) return false;
      // What the writer was typing reaches its file before the room goes dark.
      source.begin?.();
      show.active = true;
      show.layout = "audience";
      show.fromIndex = atPage(source.currentAt?.() ?? 0);
      show.index = index === undefined ? show.fromIndex : atPage(index);
      show.projected = false;
      show.fullscreen = false;
      show.startedAt = Date.now();
      show.root = showBuild();
      document.body.append(show.root);
      show.onFullscreenChange = showFullscreenChange;
      document.addEventListener("fullscreenchange", show.onFullscreenChange);
      show.onResize = showRescale;
      window.addEventListener("resize", show.onResize);
      window.clearInterval(show.timerId);
      show.timerId = window.setInterval(updateShowTimer, 1000);
      showRender();
      // The room goes dark on the one screen; a second screen is only asked for
      // once the presenter console is switched on. Full screen itself is optional:
      // without it the layer still covers the desk.
      try {
        await show.root.requestFullscreen?.({ navigationUI: "hide" });
        show.fullscreen = document.fullscreenElement === show.root;
      } catch (error) {
        show.fullscreen = false;
      }
      show.root.focus?.();
      source.holdWake?.();
      source.menuDirty?.();
      return true;
    }

    function end() {
      if (!show.active) return false;
      const projector = showProjector();
      const owned = [show.root, projector].includes(document.fullscreenElement);
      show.active = false;
      show.projected = false;
      show.fullscreen = false;
      window.clearInterval(show.timerId);
      show.timerId = 0;
      document.removeEventListener("fullscreenchange", show.onFullscreenChange);
      window.removeEventListener("resize", show.onResize);
      show.root?.remove();
      show.root = null;
      if (owned && document.fullscreenElement && typeof document.exitFullscreen === "function") {
        try { document.exitFullscreen(); } catch (error) { /* already leaving */ }
      }
      // Back where the writer left it: the surface puts its own view back on.
      source.finish?.(show.fromIndex);
      source.releaseWake?.();
      source.menuDirty?.();
      return true;
    }

    // The overview is outside the show (the surface's own view of the deck), so
    // the console's button leaves the show first and lands on the page it was on.
    function openOverviewFromConsole() {
      if (!show.active) return false;
      const at = show.index;
      end();
      source.openOverview?.(at);
      return true;
    }

    return Object.freeze({
      state: show,
      isPresenting: () => show.active,
      start,
      end,
      step: showStep,
      setLayout: showSetLayout,
      render: showRender,
      rescale: showRescale,
      keydown: showKeydown,
      openOverview: openOverviewFromConsole,
    });
  }

  /* --- the page overview: the deck as a light table --------------------------- */
  // Every page at once, at its printed size scaled into a thumbnail; a click
  // goes back to that page, the 放映 button starts the show on it, and reordering
  // goes through the surface's own one named step (source.move), so one Undo
  // takes a drag back. Thumbs render as they come into view; without an
  // IntersectionObserver they all render at once.
  //
  // source, beside create()'s mount/scale/thumbTitle/count:
  //   currentAt()       the page to mark (or -1 for none)
  //   aspect()          the page's css aspect-ratio, e.g. "16 / 9"
  //   layoutLabel(at)   an optional layout caption ('' when the deck has none)
  //   open(at)          a click on the card: back to that page
  //   presentFrom(at)   the card's 放映 button: the show starts on that page
  //   move(from, to)    the deck model's own one-step move
  //   editable()        whether this deck's pages may be reordered at all
  function overview(container, source) {
    const doc = container.ownerDocument || document;
    const grid = doc.createElement("ol");
    grid.className = "clio-stage-overview-grid";
    grid.setAttribute("aria-label", tr("clio_stage_overview_label"));
    let observer = null;
    let dragFrom = -1;
    let items = [];

    function overviewThumb(host, at) {
      if (!host.isConnected || host.dataset.clioStageThumbMounted === "true") return;
      host.dataset.clioStageThumbMounted = "true";
      if (source.mount(host, at)) source.scale(host);
    }

    function markCurrent(at) {
      items.forEach((item, index) => {
        item.classList.toggle("is-current", index === at);
        const card = item.querySelector(".clio-stage-overview-card");
        if (!card) return;
        if (index === at) card.setAttribute("aria-current", "true");
        else card.removeAttribute("aria-current");
      });
    }

    function build() {
      observer?.disconnect?.();
      observer = null;
      grid.replaceChildren();
      items = [];
      const count = Math.max(0, Number(source.count()) || 0);
      const editable = !!source.editable?.();
      const pending = [];
      for (let index = 0; index < count; index += 1) {
        const title = String(source.title(index) || "");
        const item = doc.createElement("li");
        item.className = "clio-stage-overview-item";
        const card = doc.createElement("button");
        card.type = "button";
        card.className = "clio-stage-overview-card";
        card.setAttribute("aria-label", tr("clio_stage_thumb_label", index + 1, title || tr("untitled")));
        const caption = doc.createElement("span");
        caption.className = "clio-stage-overview-caption";
        const number = doc.createElement("span");
        number.className = "clio-stage-overview-number";
        number.textContent = String(index + 1);
        const name = doc.createElement("span");
        name.className = "clio-stage-overview-title";
        name.textContent = title || tr("untitled");
        caption.append(number, name);
        const layout = source.layoutLabel ? String(source.layoutLabel(index) || "") : "";
        if (layout) {
          const kind = doc.createElement("span");
          kind.className = "clio-stage-overview-layout";
          kind.textContent = layout;
          caption.append(kind);
        }
        const room = doc.createElement("div");
        room.className = "clio-stage-overview-room";
        room.style.aspectRatio = String(source.aspect?.() || "16 / 9");
        const host = doc.createElement("div");
        host.className = "clio-stage-page-host";
        host.dataset.clioStageThumb = String(index);
        room.append(host);
        card.append(caption, room);
        // Click: back to that page.
        card.addEventListener("click", () => source.open(index));
        // Reorder: the deck model's own one-step move, for a keyboard.
        if (editable) {
          card.addEventListener("keydown", (event) => {
            if (!event.altKey || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
            event.preventDefault();
            const to = index + (["ArrowUp", "ArrowLeft"].includes(event.key) ? -1 : 1);
            if (to >= 0 && to < count) source.move(index, to);
          });
          item.draggable = true;
          item.addEventListener("dragstart", (event) => {
            dragFrom = index;
            event.dataTransfer?.setData("text/plain", String(index));
            if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
          });
          item.addEventListener("dragend", () => {
            dragFrom = -1;
            grid.querySelectorAll(".is-drop-before, .is-drop-after").forEach((node) => node.classList.remove("is-drop-before", "is-drop-after"));
          });
          item.addEventListener("dragover", (event) => {
            if (dragFrom < 0) return;
            event.preventDefault();
            const box = item.getBoundingClientRect();
            const after = (event.clientX - box.left) + (event.clientY - box.top) > (box.width + box.height) / 2;
            item.classList.toggle("is-drop-after", after);
            item.classList.toggle("is-drop-before", !after);
          });
          item.addEventListener("dragleave", () => item.classList.remove("is-drop-before", "is-drop-after"));
          item.addEventListener("drop", (event) => {
            if (dragFrom < 0) return;
            event.preventDefault();
            const from = dragFrom;
            const after = item.classList.contains("is-drop-after");
            dragFrom = -1;
            let to = index + (after ? 1 : 0);
            if (from < to) to -= 1;
            if (to !== from) source.move(from, to);
            else item.classList.remove("is-drop-before", "is-drop-after");
          });
        }
        // The show, from this page.
        const present = doc.createElement("button");
        present.type = "button";
        present.className = "clio-stage-overview-present";
        present.textContent = tr("clio_stage_overview_present");
        present.setAttribute("aria-label", tr("clio_stage_overview_present_from", index + 1, title || tr("untitled")));
        present.addEventListener("click", (event) => {
          event.stopPropagation();
          source.presentFrom(index);
        });
        item.append(card, present);
        grid.append(item);
        items.push(item);
        pending.push([host, index]);
      }
      if (!grid.isConnected) container.append(grid);
      markCurrent(Number.isInteger(Number(source.currentAt?.())) ? Number(source.currentAt()) : -1);
      // The pages render as they scroll into view; an engine without the observer
      // (or a test) gets them all at once.
      if (typeof IntersectionObserver === "function") {
        observer = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            observer.unobserve(entry.target);
            overviewThumb(entry.target, Number(entry.target.dataset.clioStageThumb) || 0);
          });
        }, { root: container, rootMargin: "240px" });
        pending.forEach(([host]) => observer.observe(host));
      } else {
        pending.forEach(([host, at]) => overviewThumb(host, at));
      }
    }

    build();
    return {
      root: grid,
      refresh: build,
      mark: markCurrent,
      stop: () => { observer?.disconnect?.(); observer = null; },
    };
  }

  root.AISystem6ClioStageShow = Object.freeze({ create, overview });
})(typeof window !== "undefined" ? window : globalThis);
