// Mechanical HIG checks — the machine-checkable half of a "does this look
// broken" review. Five classes, chosen because a person catches them at a
// glance but no existing gate looks for them:
//
//   overflow     a control's content exceeds its own box and the excess is
//                clipped (no scroll affordance, no ellipsis) — a heading that
//                splits its leading, a label that runs past its button.
//   collapsed-window  a window's own content area is left far smaller than
//                the content it holds -- not a normal "long document, please
//                scroll" case, but a window pinned to roughly its title-bar
//                height with real content hidden behind the fold. This is
//                what "overflow" alone cannot see: a legitimate scroller
//                absorbs the mismatch instead of visibly clipping, so the
//                symptom is a window that LOOKS closed, not text that looks
//                cut off. Real case: a WindowShade-collapsed source window's
//                frame leaking into a freshly opened Finder page (see
//                window-manager.js replaceVisibleFinderLocation).
//   overlap      two siblings in a row/row-like container occupy the same
//                pixels when neither is meant to float over the other — a
//                stepper drawn outside its control, a badge printed on top of
//                its own label.
//   contrast     a disabled control's text against its own background falls
//                under the floor this repo has already accepted elsewhere
//                (measured 3.3-5.5 across the accepted disabled specimens;
//                floor here is 3.0 to keep the gate from flagging accepted
//                cases while still catching real regressions).
//   invisibility a foreground colour that resolves to the same colour as its
//                background (or literal alpha-0 ink on visible text) — the
//                busy-button-prints-two-labels class of bug.
//
// This module exports one function, browserSideChecks(), that returns a
// string of JavaScript to run with page.evaluate(). It has no Node-side
// dependencies so both the exploratory sweep and the fast verify gate share
// exactly one implementation.

export function browserSideChecks() {
  return `(() => {
    const findings = [];
    const round = (n) => Math.round(n * 10) / 10;

    function isVisible(el) {
      if (!(el instanceof Element)) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return false;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") return false;
      if (Number(cs.opacity) === 0) return false;
      return true;
    }

    function describe(el) {
      const id = el.id ? "#" + el.id : "";
      const cls = el.className && typeof el.className === "string"
        ? "." + el.className.trim().split(/\\s+/).slice(0, 3).join(".")
        : "";
      const win = el.closest && el.closest(".window[data-window]");
      const winName = win ? win.dataset.window : "";
      return { tag: el.tagName.toLowerCase(), id, cls, window: winName, text: (el.textContent || "").trim().slice(0, 60) };
    }

    // ---- overflow: clipped content with no scroll affordance -------------
    const SCROLL_OWNERS = new Set(["window-frame-scroller", "textarea", "pre", "code"]);
    function isDeliberateScroller(el) {
      if (el.tagName === "TEXTAREA" || el.tagName === "PRE" || el.tagName === "CODE") return true;
      for (const c of el.classList || []) if (SCROLL_OWNERS.has(c)) return true;
      const cs = getComputedStyle(el);
      return cs.overflowY === "auto" || cs.overflowY === "scroll" || cs.overflowX === "auto" || cs.overflowX === "scroll";
    }
    const overflowCandidates = document.querySelectorAll(
      "h1, h2, h3, .title-bar h2, label, .btn, button, .field-row, .details-bar span, .finder-item span, .menu-item, .select-wrap, .mini-btn"
    );
    function isExemptFromOverflowCheck(el) {
      // A visually-hidden accessibility label is deliberately clipped to
      // 1x1px; that IS the feature, not an overflow bug.
      if (el.closest(".visually-hidden, .sr-only")) return true;
      // The System 6 select harness wraps a real native <select> under a
      // custom visible label; the native control sizes to its longest OPTION
      // text (irrelevant to what's on screen) while the wrapper clips it on
      // purpose to show only the custom label.
      if (el.closest(".select-wrap")) return true;
      // A closed <details> (the "Commands..." menu popover and friends) does
      // not paint its content; some engines still report a laid-out rect for
      // it while display:none is pending, which would flag a hidden menu's
      // longest label as if it were on screen.
      const details = el.closest("details");
      if (details && !details.open) return true;
      return false;
    }
    overflowCandidates.forEach((el) => {
      if (!isVisible(el) || isDeliberateScroller(el) || isExemptFromOverflowCheck(el)) return;
      const cs = getComputedStyle(el);
      if (cs.textOverflow === "ellipsis" && cs.overflow === "hidden") return; // intentional truncation
      // A few px of slack is sub-pixel font/glyph-metric noise, not a defect
      // a person would notice: a decorative icon-only button's pseudo-element
      // running 3px past its box, or a short label sitting a few px inside a
      // fixed-width column with visible overflow and no neighbour to crowd.
      // Real cases measured 13-46px (a clipped filename, an unbroken word);
      // this floor is picked well below that and well above rendering noise.
      const OVERFLOW_FLOOR = 8;
      const dx = el.scrollWidth - el.clientWidth;
      const dy = el.scrollHeight - el.clientHeight;
      if (dx > OVERFLOW_FLOOR && cs.overflowX !== "auto" && cs.overflowX !== "scroll") {
        findings.push({ type: "overflow", axis: "x", overflowPx: round(dx), ...describe(el) });
      }
      if (dy > OVERFLOW_FLOOR && cs.overflowY !== "auto" && cs.overflowY !== "scroll") {
        findings.push({ type: "overflow", axis: "y", overflowPx: round(dy), ...describe(el) });
      }
    });

    // ---- collapsed-window: a window pinned far smaller than its content ---
    document.querySelectorAll(".window[data-window]").forEach((win) => {
      if (!isVisible(win)) return;
      const winRect = win.getBoundingClientRect();
      const titleBar = win.querySelector(":scope > .title-bar");
      const titleBarHeight = titleBar ? titleBar.getBoundingClientRect().height : 0;
      const scroller = win.querySelector(".window-frame-scroller, .window-pane");
      if (!scroller) return;
      const contentHeight = scroller.scrollHeight;
      // A window barely taller than its own title bar, holding content that
      // wants several times more room, is the collapsed-window shape -- not a
      // long document that's fine to scroll (that has plenty of window body
      // to scroll WITHIN), but a body that was never given room at all.
      const bodyHeight = winRect.height - titleBarHeight;
      if (bodyHeight > 0 && bodyHeight < 40 && contentHeight > bodyHeight * 3 && contentHeight > 60) {
        findings.push({
          type: "collapsed-window", windowHeight: round(winRect.height),
          bodyHeight: round(bodyHeight), contentHeight: round(contentHeight),
          ...describe(win),
        });
      }
    });

    // ---- overlap: siblings in a row-like container sharing pixels --------
    const ROW_SELECTORS = [
      ".button-row", ".title-bar", ".details-bar", ".menu-bar", ".view-controls",
      ".field-row", ".finder-item", ".system-tabs",
    ];
    function rectsOverlap(a, b, tolerance = 1) {
      const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      return ix > tolerance && iy > tolerance;
    }
    ROW_SELECTORS.forEach((sel) => {
      document.querySelectorAll(sel).forEach((row) => {
        if (!isVisible(row)) return;
        const kids = Array.from(row.children).filter((k) => isVisible(k) && getComputedStyle(k).position !== "absolute");
        for (let i = 0; i < kids.length; i += 1) {
          for (let j = i + 1; j < kids.length; j += 1) {
            const ra = kids[i].getBoundingClientRect();
            const rb = kids[j].getBoundingClientRect();
            if (rectsOverlap(ra, rb)) {
              findings.push({
                type: "overlap", container: sel,
                a: describe(kids[i]), b: describe(kids[j]),
                overlapPx: { x: round(Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left)), y: round(Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top)) },
              });
            }
          }
        }
      });
    });

    // ---- contrast: disabled-state legibility ------------------------------
    function parseColor(str) {
      const m = str.match(/rgba?\\(([^)]+)\\)/);
      if (!m) return null;
      const parts = m[1].split(",").map((s) => parseFloat(s.trim()));
      return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
    }
    function relLum({ r, g, b }) {
      const chan = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
      return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
    }
    // Returns null when the true background can't be read statically (a
    // gradient/pattern, or backdrop-filter glass) rather than guessing: an
    // element with a fully transparent backgroundColor can still be visually
    // opaque via backgroundImage, and walking past it lands on whatever is
    // further up -- once, that was the desktop wallpaper two ancestors behind
    // an opaque white window, scoring a real ~4:1 label as 1.1:1. Skipping the
    // indeterminate case is safer than a confident wrong answer; screenshots
    // are what actually judge material the DOM can't describe.
    function effectiveBg(el) {
      let cur = el;
      while (cur) {
        const cs = getComputedStyle(cur);
        if (cs.backgroundImage && cs.backgroundImage !== "none") return null;
        if (cs.backdropFilter && cs.backdropFilter !== "none") return null;
        const c = parseColor(cs.backgroundColor);
        if (c && c.a > 0.01) {
          if (c.a < 0.98) return null; // translucent: composites with whatever is behind it
          return c;
        }
        cur = cur.parentElement;
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    }
    function contrastRatio(fg, bg) {
      const L1 = relLum(fg) + 0.05;
      const L2 = relLum(bg) + 0.05;
      return L1 > L2 ? L1 / L2 : L2 / L1;
    }
    const CONTRAST_FLOOR = 3.0;
    document.querySelectorAll(":disabled, [disabled], .is-disabled, .disabled").forEach((el) => {
      if (!isVisible(el)) return;
      const text = (el.textContent || "").trim();
      if (!text) return;
      const cs = getComputedStyle(el);
      const fg = parseColor(cs.color);
      if (!fg || fg.a < 0.05) return; // invisibility check owns literal alpha-0 ink
      const bg = effectiveBg(el);
      if (!bg) return; // indeterminate (gradient/glass) background: needs an eye, not a formula
      const ratio = contrastRatio(fg, bg);
      if (ratio < CONTRAST_FLOOR) {
        findings.push({ type: "contrast", ratio: round(ratio), floor: CONTRAST_FLOOR, ...describe(el) });
      }
    });

    // ---- invisibility: foreground resolves to its own background ---------
    const textNodeHosts = document.querySelectorAll("button, .btn, label, span, h1, h2, h3, p, li, a, div");
    textNodeHosts.forEach((el) => {
      if (!isVisible(el)) return;
      const hasOwnText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!hasOwnText) return;
      const cs = getComputedStyle(el);
      const fg = parseColor(cs.color);
      if (!fg) return;
      if (fg.a < 0.05) {
        findings.push({ type: "invisibility", reason: "alpha-zero ink", ...describe(el) });
        return;
      }
      const bg = effectiveBg(el);
      if (!bg) return; // indeterminate (gradient/glass) background: needs an eye, not a formula
      if (Math.abs(fg.r - bg.r) <= 1 && Math.abs(fg.g - bg.g) <= 1 && Math.abs(fg.b - bg.b) <= 1) {
        findings.push({ type: "invisibility", reason: "fg equals effective bg", fg, bg, ...describe(el) });
      }
    });

    return findings;
  })()`;
}
