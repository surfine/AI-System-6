// System 6 scroll bars for framed document windows.
//
// The engine's own scroll bar buttons can't be placed the System 6 way — Chrome
// exposes ::-webkit-scrollbar-button but parks both arrows at one end, and the
// :start/:end/:single-button pseudo-classes don't match, so CSS can't move them.
// So a framed content area hides the native bars and gets these: one arrow box
// at each end, a dithered track between them, and a thumb whose travel stops at
// the arrows. The corner where the two bars meet stays empty — that cell is the
// grow box, which is the whole reason only that corner sizes a window.

const frameBarLineStep = 24;
const frameBarRepeatDelay = 300;
const frameBarRepeatInterval = 60;
const frameBarThumbMin = 16;

function createFrameArrow(direction) {
  const arrow = document.createElement("button");
  arrow.type = "button";
  arrow.className = `window-frame-arrow is-${direction}`;
  arrow.tabIndex = -1;
  arrow.setAttribute("aria-hidden", "true");
  return arrow;
}

function createFrameBar(axis) {
  const bar = document.createElement("div");
  bar.className = `window-frame-bar is-${axis}`;
  const track = document.createElement("div");
  track.className = "window-frame-track";
  const thumb = document.createElement("div");
  thumb.className = "window-frame-thumb";
  track.append(thumb);
  bar.append(createFrameArrow(axis === "vertical" ? "up" : "left"), track, createFrameArrow(axis === "vertical" ? "down" : "right"));
  return { bar, track, thumb };
}

// Pointer events are the primary path; some environments deliver only the
// legacy mouse event, so both are wired and deduped by timestamp.
function onFramePress(target, handler) {
  let lastPointerAt = -Infinity;
  target.addEventListener("pointerdown", (event) => {
    lastPointerAt = event.timeStamp;
    handler(event);
  });
  target.addEventListener("mousedown", (event) => {
    if (event.timeStamp - lastPointerAt < 500) return;
    handler(event);
  });
}

// Press-and-hold repeats, the way a System 6 arrow or track click does.
function repeatWhileHeld(target, event, step) {
  step();
  let timer = 0;
  const stop = () => {
    clearTimeout(timer);
    clearInterval(timer);
    target.removeEventListener("pointerup", stop);
    target.removeEventListener("pointercancel", stop);
    window.removeEventListener("pointerup", stop);
    window.removeEventListener("mouseup", stop);
  };
  timer = setTimeout(() => {
    timer = setInterval(step, frameBarRepeatInterval);
  }, frameBarRepeatDelay);
  target.addEventListener("pointerup", stop);
  target.addEventListener("pointercancel", stop);
  window.addEventListener("pointerup", stop);
  window.addEventListener("mouseup", stop);
  if (event.pointerId != null && target.setPointerCapture) {
    try {
      target.setPointerCapture(event.pointerId);
    } catch {}
  }
}

function isFrameScrollable(el) {
  const style = getComputedStyle(el);
  return /auto|scroll/.test(style.overflowY + style.overflowX);
}

// A split window's marked region can hold more than one surface — TeachText
// swaps an editor for a preview in the same box — so the bars follow whichever
// one is on screen rather than a fixed element.
function resolveFrameScroller(host) {
  if (isFrameScrollable(host)) return host;
  const visible = [...host.querySelectorAll("*")]
    .find((el) => el.offsetParent && isFrameScrollable(el));
  return visible || host;
}

function installFrameBar(win, selector, axis) {
  const vertical = axis === "vertical";
  const { bar, track, thumb } = createFrameBar(axis);
  win.append(bar);

  // Looked up every sync, not held: TeachText's shell, Reader's article and the
  // Scrapbook editor are rebuilt in place, so a held reference goes stale.
  let host = win.querySelector(selector);
  let scroller = host || win;

  const metrics = () => (vertical
    ? { offset: scroller.scrollTop, view: scroller.clientHeight, total: scroller.scrollHeight }
    : { offset: scroller.scrollLeft, view: scroller.clientWidth, total: scroller.scrollWidth });

  const scrollBy = (delta) => {
    if (vertical) scroller.scrollTop += delta;
    else scroller.scrollLeft += delta;
  };

  // Coalesced: every write below can itself trigger the observers watching this
  // window, so a synchronous re-entrant sync would never settle.
  let frame = 0;
  function sync() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      measure();
    });
  }

  function measure() {
    const next = win.querySelector(selector);
    if (!next) {
      bar.classList.add("is-empty");
      return;
    }
    if (next !== host) {
      host = next;
      markFrameReserve(host, win);
    }
    const nextScroller = resolveFrameScroller(host);
    if (nextScroller !== scroller) {
      scroller?.classList.remove("is-frame-scroll-surface");
      scroller = nextScroller;
    }
    // Whatever is actually scrolling hands its bar over to the frame.
    scroller.classList.add("is-frame-scroll-surface");
    // The vertical lane starts on the seam below the strip above it — not at
    // the content's own top edge, which any inner padding would push down and
    // leave a broken T-junction. The horizontal lane spans the whole width of
    // the frame. Both end at the corner cell they share.
    bar.style.setProperty("--frame-bar-start", vertical ? `${frameBarTop(win, host)}px` : "0px");
    const { offset, view, total } = metrics();
    const scrollable = total - view > 1;
    bar.classList.toggle("is-empty", !scrollable);
    if (!scrollable) return;
    const trackLength = vertical ? track.clientHeight : track.clientWidth;
    const size = Math.max(frameBarThumbMin, Math.round((view / total) * trackLength));
    const travel = Math.max(0, trackLength - size);
    const position = Math.round((offset / (total - view)) * travel);
    thumb.style.setProperty("--frame-thumb-size", `${size}px`);
    thumb.style.setProperty("--frame-thumb-position", `${position}px`);
  }

  onFramePress(bar.querySelector(".is-up, .is-left"), (event) => {
    event.preventDefault();
    repeatWhileHeld(event.currentTarget, event, () => scrollBy(-frameBarLineStep));
  });

  onFramePress(bar.querySelector(".is-down, .is-right"), (event) => {
    event.preventDefault();
    repeatWhileHeld(event.currentTarget, event, () => scrollBy(frameBarLineStep));
  });

  onFramePress(track, (event) => {
    if (event.target === thumb) return;
    event.preventDefault();
    const thumbRect = thumb.getBoundingClientRect();
    const forward = vertical ? event.clientY > thumbRect.bottom : event.clientX > thumbRect.right;
    const page = () => {
      const { view } = metrics();
      scrollBy(forward ? view * 0.9 : -view * 0.9);
    };
    repeatWhileHeld(track, event, page);
  });

  onFramePress(thumb, (event) => {
    event.preventDefault();
    event.stopPropagation();
    const startPointer = vertical ? event.clientY : event.clientX;
    const { offset: startOffset, view, total } = metrics();
    const trackLength = vertical ? track.clientHeight : track.clientWidth;
    const size = vertical ? thumb.offsetHeight : thumb.offsetWidth;
    const travel = Math.max(1, trackLength - size);
    const drag = (moveEvent) => {
      const moved = (vertical ? moveEvent.clientY : moveEvent.clientX) - startPointer;
      const next = startOffset + (moved / travel) * (total - view);
      if (vertical) scroller.scrollTop = next;
      else scroller.scrollLeft = next;
    };
    const stop = () => {
      window.removeEventListener("pointermove", drag);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("mousemove", drag);
      window.removeEventListener("mouseup", stop);
    };
    window.addEventListener("pointermove", drag);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("mousemove", drag);
    window.addEventListener("mouseup", stop);
  });

  win.addEventListener("scroll", sync, { passive: true, capture: true });
  new ResizeObserver(sync).observe(win);
  markFrameReserve(host || win, win);
  // Finder grids re-render their items in place, split windows swap which
  // surface is showing, and some rebuild the surface itself: watch for all three.
  new MutationObserver(sync).observe(win, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden"] });
  measure();
  return sync;
}

function frameContentRegion(win, host) {
  return [...win.children]
    .filter((el) => !el.matches(".grow-box, .window-frame-bar"))
    .find((el) => el === host || el.contains(host)) || host;
}

// Where the vertical lane begins: the bottom edge of the title or details strip
// above the content, so the lane's line joins that strip's line instead of
// starting somewhere inside the content's padding.
function frameBarTop(win, host) {
  const strips = [...win.children].filter((el) => !el.matches(".grow-box, .window-frame-bar"));
  const region = frameContentRegion(win, host);
  const above = strips[strips.indexOf(region) - 1];
  return Math.round(above ? above.offsetTop + above.offsetHeight : region.offsetTop);
}

// The lanes belong to the window, not to one scroller: everything from the
// content area down has to leave room for them, or a composer or action row
// below the content would run under the vertical lane.
function markFrameReserve(scroller, win) {
  const content = [...win.children]
    .filter((el) => !el.matches(".title-bar, .details-bar, .grow-box, .window-frame-bar"));
  const host = content.find((el) => el === scroller || el.contains(scroller));
  if (!host) return;

  // The content region that holds the scroller, and everything below it — a
  // composer, an ask row, an action row — all stop at the lane.
  content.slice(content.indexOf(host)).forEach((el) => el.classList.add("is-frame-margin"));
  content[content.length - 1].classList.add("is-frame-tail");
}

// Surfaces the app rebuilds at runtime cannot carry the class in index.html —
// the rebuild would drop it — so their frame region is named here instead.
const frameHostSelectors = {
  teachText: ".teachtext-editor-container",
  reader: "#reader-content",
  scrapbook: "#scrap-form",
  systemHelp: "#system-help-detail",
  reviewDesk: ".review-desk-results",
};

function installWindowFrameBars() {
  // The bars are always built, in every theme: Liquid Glass and phones hide
  // them by token, and a theme switched at runtime must not need a reload to
  // get them back.
  const allSyncs = [];
  document.querySelectorAll(".window").forEach((win) => {
    if (win.dataset.frameBars === "true") return;
    const selector = frameHostSelectors[win.dataset.window] || ".window-frame-scroller";
    if (!win.querySelector(selector)) return;
    win.dataset.frameBars = "true";
    const syncs = ["vertical", "horizontal"]
      .map((axis) => installFrameBar(win, selector, axis))
      .filter(Boolean);
    allSyncs.push(...syncs);
  });

  // Switching themes changes the lane width and whether the bars show at all.
  new MutationObserver(() => allSyncs.forEach((sync) => sync()))
    .observe(document.body, { attributes: true, attributeFilter: ["class"] });
}
