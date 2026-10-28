// Feature module: One More Tune — the Click Wheel.
//
// The round's four preset keys learn a second, older way to be pressed: a
// click wheel. The feel is not invented here — every number below was read
// out of Apple Music's own 404 easter-egg iPod (web-music-ipod.esm.js,
// 2026-10), the same source the redesign measured, so a hand that has turned
// that wheel already knows this one:
//
//   15° of arc is one row, and the remainder is kept, so a slow turn still
//     advances row by row instead of being eaten;
//   a reversal must spend 8° winning back before the direction flips, so a
//     trembling hand does not jiggle the selection;
//   a sample that moved less than a tenth of the radius is noise, dropped;
//   speed is smoothed (0.15 exponential), and only above 180°/s does it
//     climb a tier every 500ms — ×1/2/3/5/8/13/21/34 rows per step, capped
//     at 400°/s, forgotten after 250ms of stillness;
//   prefers-reduced-motion locks tier 0: the ladder is the vestibular risk,
//     the 1:1 tracking is not.
//
// Two rules the design passes added. The selection highlight does not animate
// (an iPod's selection moves instantly, and keyboard-initiated state changes
// get no animation anywhere), and the ring is ONE surface: the four numbers
// are carved marks on it, not buttons sitting on top of it. A press that never
// travelled is a cardinal press (1–4); a press that travelled is a turn. That
// distinction is the whole difference between a wheel and four round buttons,
// and a build that covered the ring with buttons could not be turned at all.
//
// The click is the device's other half: 14ms of 2.1kHz square, synthesized
// rather than shipped as a file, and it belongs to the gesture rather than to
// the desk — so it is on by default, one press away from off, and only ever
// fires for pointer turns, never for a keyboard press.
//
// The gesture math is a pure state machine (createOneMoreTuneWheelGesture)
// so the contract can turn synthetic samples through it; mount is the thin
// DOM wrapper around it and owns nothing but its own node.

window.AISystem6OneMoreTuneWheelLoaded = true;

const ONE_MORE_TUNE_WHEEL_STEP_DEG = 15;
const ONE_MORE_TUNE_WHEEL_HYSTERESIS_DEG = 8;
const ONE_MORE_TUNE_WHEEL_MOVE_RATIO = 0.1;
// The centre button's own footprint: inset 31% leaves a radius of 38% of the
// ring's, and a pointer that lands there belongs to the button, not the turn.
const ONE_MORE_TUNE_WHEEL_DEAD_RATIO = 0.38;
const ONE_MORE_TUNE_WHEEL_TIERS = Object.freeze([1, 2, 3, 5, 8, 13, 21, 34]);
// The seek ladder, for a scrub: the easter egg's own rows-per-click for
// dragging through a track, in seconds.
const ONE_MORE_TUNE_WHEEL_SEEK_TIERS = Object.freeze([5, 5, 5, 10, 10, 10, 20]);
const ONE_MORE_TUNE_WHEEL_TIER_MS = 500;
const ONE_MORE_TUNE_WHEEL_MIN_SPEED = 180;
const ONE_MORE_TUNE_WHEEL_CAP_SPEED = 400;
const ONE_MORE_TUNE_WHEEL_GAP_MS = 250;
const ONE_MORE_TUNE_WHEEL_SMOOTHING = 0.15;
// A press that never travelled is a cardinal press, not a turn: the device's
// ring answers both from one surface, and this is where the two are told
// apart. 8° of travel or 400ms of holding makes it a turn.
const ONE_MORE_TUNE_WHEEL_TAP_DEG = 8;
const ONE_MORE_TUNE_WHEEL_TAP_MS = 400;
// The clicker's own tick: bright, short, quiet.
const ONE_MORE_TUNE_WHEEL_CLICK_HZ = 2100;

/** Shortest signed arc between two angles, in (-180, 180]. */
function oneMoreTuneWheelAngleDelta(from, to) {
  return (((to - from) % 360) + 540) % 360 - 180;
}

/**
 * Which cardinal position a point on the ring lands on: 0 top, 1 right,
 * 2 bottom, 3 left — the order the four choices are printed in.
 *
 * Screen coordinates put +y downward, so 90° is the BOTTOM, not the top: an
 * angle-to-zone table written from the maths convention is rotated a quarter
 * turn, and a press on the top of the ring selects the fourth choice. This
 * function exists so the contract can hold all four directions down.
 */
function oneMoreTuneWheelCardinal(x, y) {
  const deg = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  if (deg >= 45 && deg < 135) return 2;   // down
  if (deg >= 135 && deg < 225) return 3;  // left
  if (deg >= 225 && deg < 315) return 0;  // up
  return 1;                               // right
}

/**
 * The turn, as data. Feed it pointer samples in element-relative coordinates
 * (0,0 = ring centre) with their timeStamp; it answers with what the turn
 * did: { steps, dir, tier, speed, remainder } when a step completed, null
 * when the sample was noise, dead zone, or a reversal still paying off.
 */
function createOneMoreTuneWheelGesture(options) {
  const o = options || {};
  const stepDegrees = o.stepDegrees || ONE_MORE_TUNE_WHEEL_STEP_DEG;
  const hysteresisDeg = o.hysteresisDeg ?? ONE_MORE_TUNE_WHEEL_HYSTERESIS_DEG;
  const moveRatio = o.moveRatio ?? ONE_MORE_TUNE_WHEEL_MOVE_RATIO;
  const deadRatio = o.deadRatio ?? ONE_MORE_TUNE_WHEEL_DEAD_RATIO;
  const tiers = o.tiers || ONE_MORE_TUNE_WHEEL_TIERS;
  const tierMs = o.tierMs ?? ONE_MORE_TUNE_WHEEL_TIER_MS;
  const minSpeed = o.minSpeed ?? ONE_MORE_TUNE_WHEEL_MIN_SPEED;
  const capSpeed = o.capSpeed ?? ONE_MORE_TUNE_WHEEL_CAP_SPEED;
  const gapMs = o.gapMs ?? ONE_MORE_TUNE_WHEEL_GAP_MS;
  const smoothing = o.smoothing ?? ONE_MORE_TUNE_WHEEL_SMOOTHING;
  const radius = o.radius || 100;
  const reduced = o.reduced === true;

  let dir = 0;
  let revert = 0;
  let acc = 0;
  let speed = 0;
  let tierStartedAt = null;
  let lastAngle = null;
  let lastX = 0;
  let lastY = 0;
  let lastTime = 0;

  function reset() {
    dir = 0; revert = 0; acc = 0; speed = 0; tierStartedAt = null;
    lastAngle = null; lastTime = 0;
  }

  function sample(x, y, time) {
    if (Math.hypot(x, y) < radius * deadRatio) return null;
    if (lastAngle !== null && Math.hypot(x - lastX, y - lastY) < radius * moveRatio) return null;
    const angle = Math.atan2(y, x) * 180 / Math.PI;
    let result = null;
    if (lastAngle !== null) {
      const delta = oneMoreTuneWheelAngleDelta(lastAngle, angle);
      if (delta !== 0) {
        const sign = delta > 0 ? 1 : -1;
        if (dir !== 0 && sign !== dir) {
          revert += Math.abs(delta);
          if (revert < hysteresisDeg) {
            lastAngle = angle; lastX = x; lastY = y;
            return null;
          }
          dir = sign; revert = 0; acc = 0; speed = 0; tierStartedAt = null;
        } else {
          dir = sign; revert = 0;
        }
        acc += Math.abs(delta);
        const dt = time - lastTime;
        const instant = dt > 0 ? Math.min(Math.abs(delta) / dt * 1000, capSpeed) : capSpeed;
        if (speed === 0 || instant < minSpeed || dt > gapMs) {
          speed = instant; tierStartedAt = null;
        } else {
          speed += smoothing * (instant - speed);
        }
        let tier = 0;
        if (!reduced && speed >= minSpeed) {
          if (tierStartedAt === null) tierStartedAt = time;
          tier = Math.min(tiers.length - 1, Math.floor((time - tierStartedAt) / tierMs));
        }
        const steps = Math.floor(acc / stepDegrees);
        acc -= steps * stepDegrees;
        if (steps > 0) {
          result = { steps, dir, tier, speed: Math.round(speed), remainder: acc };
        }
      }
    }
    lastAngle = angle; lastX = x; lastY = y; lastTime = time;
    return result;
  }

  return { sample, reset };
}

/**
 * Put a wheel on the host element and wire it to the room.
 *
 * One surface, like the device: the ring itself is the pointer target. Turning
 * it walks the rows; a press that never travelled (under 8°, under 400ms) is a
 * tap at the cardinal position it landed on; the centre key commits. The four
 * numbers are carved marks, not buttons — a real iPod's ring is one capacitive
 * surface with printing on it, and covering that surface with four buttons is
 * what made the previous build impossible to turn.
 *
 * handlers (choice mode, the default):
 *   count        how many choices the wheel drives (the four keys)
 *   ringAria     accessible name for the whole ring (a slider)
 *   zoneAria(n)  accessible name for the nth cardinal position (for the
 *                aria-valuetext of the slider, and for the caption)
 *   labelFor(n)  optional; the slider's aria-valuetext names the choice
 *   selectLabel  the centre key's label
 *   caption      one line under the wheel saying what turning/pressing does
 *   clickerOn()  whether the click sounds (host owns the preference)
 *   onToggleClicker(next)  the ♪ button was pressed
 *   onFocus(i)   the turn moved the selection to choice i (wraps)
 *   onTapZone(i) a press at cardinal position i (no travel); falls back to onCommit
 *   onCommit(i)  the centre was pressed on the focused choice
 *   haptic(ms)   optional, same frame as the visual change
 *
 * handlers (scrub mode, mode: "scrub"):
 *   scrubBy(deltaSeconds)  the turn or a cardinal press moved the playhead; the
 *                          caller clamps to its own cue window
 *   onScrubCommit()        the centre replays from the playhead
 *   zoneSeconds [s]        the four cardinal presses' jumps, clockwise from top
 */
function mountOneMoreTuneWheel(host, handlers) {
  if (!host || typeof document === "undefined") return null;
  const scrub = handlers.mode === "scrub";
  const zoneSeconds = handlers.zoneSeconds || [-5, 5, 15, -15];
  const zoneLabel = (i) => {
    const s = zoneSeconds[i];
    return (s > 0 ? "+" : "−") + Math.abs(s) + "s";
  };
  const count = Math.max(1, Math.min(4, handlers.count || 4));

  const ring = document.createElement("div");
  ring.className = "omt-wheel-ring";
  // The ring is the control: a slider whose value is the selected row. The
  // rows themselves stay real buttons, so a screen reader has both doors.
  ring.setAttribute("role", "slider");
  ring.setAttribute("tabindex", "0");
  ring.setAttribute("aria-valuemin", "1");
  ring.setAttribute("aria-valuemax", String(count));
  ring.setAttribute("aria-label", handlers.ringAria || "");
  if (handlers.ringAriaKey) ring.setAttribute("data-i18n-aria-label", handlers.ringAriaKey);

  // The seams first and the paddle over them: the paddle is opaque, so the
  // division lines show only in the band they mean — the ring a press lands
  // on — instead of drawing a cross over the wheel's face.
  const seams = document.createElement("div");
  seams.className = "omt-wheel-seams";
  seams.setAttribute("aria-hidden", "true");
  ring.appendChild(seams);

  // The paddle: the plastic disc inside the ring, drawn by the sheet. It is
  // the turning surface's face, never a separate hit area.
  const pad = document.createElement("div");
  pad.className = "omt-wheel-pad";
  pad.setAttribute("aria-hidden", "true");
  ring.appendChild(pad);

  for (let i = 0; i < count; i += 1) {
    const label = document.createElement("span");
    label.className = "omt-wheel-label";
    label.dataset.zone = String(i);
    label.textContent = scrub ? zoneLabel(i) : String(i + 1);
    label.setAttribute("aria-hidden", "true");
    ring.appendChild(label);
  }

  const centre = document.createElement("button");
  centre.type = "button";
  centre.className = "omt-wheel-select";
  centre.textContent = handlers.selectLabel || "";
  ring.appendChild(centre);
  host.appendChild(ring);

  // The mapping, said once under the wheel instead of guessed beside it, and
  // the one switch a quiet desk wants: the click, off by a press, remembered.
  if (handlers.caption) {
    const cap = document.createElement("p");
    cap.className = "omt-wheel-cap";
    const text = document.createElement("span");
    text.textContent = handlers.caption;
    cap.appendChild(text);
    if (handlers.onToggleClicker) {
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "omt-wheel-clicker";
      toggle.textContent = "♪";
      toggle.setAttribute("aria-pressed", handlers.clickerOn?.() ? "true" : "false");
      toggle.setAttribute("aria-label", handlers.clickerLabel || "Click sound");
      toggle.addEventListener("click", () => {
        const next = !handlers.clickerOn?.();
        toggle.setAttribute("aria-pressed", next ? "true" : "false");
        handlers.onToggleClicker(next);
      });
      cap.appendChild(toggle);
    }
    host.appendChild(cap);
  }

  let focus = -1;
  const reduced = typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // --- The click -------------------------------------------------------
  //
  // Synthesized, not a file: the wheel's own clicker is a short bright tick,
  // and a 14ms square at 2.1kHz is what it sounds like. The context is built
  // lazily inside a real gesture, so no page ever opens one on load.
  let clicker = null;
  function click() {
    if (!handlers.clickerOn?.()) return;
    try {
      if (clicker === null) {
        const Ctor = window.AudioContext || window.webkitAudioContext;
        clicker = Ctor ? new Ctor() : false;
      }
      if (!clicker) return;
      if (clicker.state === "suspended") clicker.resume?.().catch?.(() => {});
      const osc = clicker.createOscillator();
      const gain = clicker.createGain();
      osc.type = "square";
      osc.frequency.value = ONE_MORE_TUNE_WHEEL_CLICK_HZ;
      gain.gain.setValueAtTime(0.05, clicker.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, clicker.currentTime + 0.014);
      osc.connect(gain).connect(clicker.destination);
      osc.start();
      osc.stop(clicker.currentTime + 0.016);
    } catch {
      // A refused context costs the sound, never the turn.
    }
  }

  function paintFocus(index) {
    focus = ((index % count) + count) % count;
    // The selection lives on the screen (the row inverts); the ring only
    // brightens the carved number it points at — an iPod's ring has no
    // highlight, and a second one here would compete with the row.
    ring.querySelectorAll(".omt-wheel-label").forEach((label, i) => {
      label.classList.toggle("is-on", i === focus);
    });
    if (focus >= 0) {
      ring.setAttribute("aria-valuenow", String(focus + 1));
      const name = handlers.labelFor?.(focus) || handlers.zoneAria?.(focus) || "";
      if (name) ring.setAttribute("aria-valuetext", `${focus + 1}, ${name}`);
      // The screen is the feedback: the host inverts the row this names.
      handlers.onFocus?.(focus);
    }
  }

  // --- The turn, and the press -----------------------------------------
  let gesture = null;
  let dragging = false;
  let pointerId = null;
  let rect = null;
  let travel = 0;
  let startedAt = 0;
  let startX = 0;
  let startY = 0;

  function local(event) {
    return {
      x: event.clientX - rect.left - rect.width / 2,
      y: event.clientY - rect.top - rect.height / 2,
    };
  }

  function cardinalAt(point) {
    return oneMoreTuneWheelCardinal(point.x, point.y);
  }

  ring.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return; // the centre key owns its press
    if (dragging) return; // one finger at a time; a second never steals the turn
    dragging = true;
    pointerId = event.pointerId;
    rect = ring.getBoundingClientRect();
    startX = event.clientX;
    startY = event.clientY;
    startedAt = event.timeStamp;
    travel = 0;
    // The radius is the ring's, read at gesture start; the state machine is
    // rebuilt with it so the math never guesses the geometry.
    gesture = createOneMoreTuneWheelGesture({ radius: rect.width / 2, reduced });
    try { ring.setPointerCapture(event.pointerId); } catch { /* older engines */ }
    event.preventDefault();
  });

  ring.addEventListener("pointermove", (event) => {
    if (!dragging || event.pointerId !== pointerId || !gesture) return;
    travel = Math.max(travel, Math.hypot(event.clientX - startX, event.clientY - startY));
    const step = gesture.sample(local(event).x, local(event).y, event.timeStamp);
    if (!step) return;
    if (scrub) {
      // The seek ladder rides the same tiers; the caller owns the clamp. The
      // tier is clamped to the ladder it indexes — the gesture's ladder has
      // eight stops and the seek's has seven, and the eighth used to read
      // past the end as NaN.
      const tiers = reduced ? [1] : (handlers.tiers || ONE_MORE_TUNE_WHEEL_SEEK_TIERS);
      const tier = Math.min(step.tier, tiers.length - 1);
      handlers.scrubBy(step.steps * tiers[tier] * step.dir);
    } else {
      const tiers = handlers.tiers || ONE_MORE_TUNE_WHEEL_TIERS;
      const tier = Math.min(step.tier, tiers.length - 1);
      const rows = step.steps * (reduced ? 1 : tiers[tier]);
      for (let r = 0; r < rows; r += 1) {
        paintFocus(focus < 0 ? 0 : focus + step.dir);
        click();
      }
    }
    handlers.haptic?.(3);
  });

  function endDrag(event) {
    if (!dragging || event.pointerId !== pointerId) return;
    const wasTap = travel <= ONE_MORE_TUNE_WHEEL_TAP_DEG
      && event.timeStamp - startedAt <= ONE_MORE_TUNE_WHEEL_TAP_MS;
    dragging = false;
    pointerId = null;
    gesture = null;
    if (!wasTap) return;
    // A press that never travelled is a cardinal press: the ring at 1–4.
    const zone = cardinalAt({ x: event.clientX - (rect.left + rect.width / 2), y: event.clientY - (rect.top + rect.height / 2) });
    handlers.haptic?.(8);
    if (scrub) {
      handlers.scrubBy(zoneSeconds[zone]);
      return;
    }
    if (handlers.onTapZone) handlers.onTapZone(zone);
    else handlers.onCommit(zone);
  }
  ring.addEventListener("pointerup", endDrag);
  ring.addEventListener("pointercancel", (event) => {
    if (!dragging || event.pointerId !== pointerId) return;
    dragging = false;
    pointerId = null;
    gesture = null;
  });
  ring.addEventListener("lostpointercapture", (event) => {
    if (!dragging || event.pointerId !== pointerId) return;
    dragging = false;
    pointerId = null;
    gesture = null;
  });

  // --- Keyboard ---------------------------------------------------------
  //
  // A wheel is a slider; a slider answers the arrows. Turning is one row a
  // press, Home/End go to the ends, Enter commits. The number keys 1–4 are
  // the app's own and stay untouched above this.
  ring.addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const forward = event.key === "ArrowDown" || event.key === "ArrowRight";
    const backward = event.key === "ArrowUp" || event.key === "ArrowLeft";
    if (scrub) {
      if (forward || backward) {
        event.preventDefault();
        click();
        handlers.scrubBy(forward ? 5 : -5);
        handlers.haptic?.(3);
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handlers.onScrubCommit();
      }
      return;
    }
    if (forward || backward) {
      event.preventDefault();
      paintFocus(focus < 0 ? 0 : focus + (forward ? 1 : -1));
      click();
      handlers.haptic?.(3);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      paintFocus(event.key === "Home" ? 0 : count - 1);
      click();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      if (focus < 0) return;
      event.preventDefault();
      handlers.haptic?.(8);
      handlers.onCommit(focus);
    }
  });

  centre.addEventListener("click", () => {
    if (scrub) {
      handlers.haptic?.(8);
      handlers.onScrubCommit();
      return;
    }
    if (focus < 0) return;
    handlers.haptic?.(8);
    handlers.onCommit(focus);
  });

  // A repaint of the face rebuilds this ring; the caller carries the selection
  // across so a turn is never undone by an unrelated status update.
  if (Number.isInteger(handlers.initialFocus) && handlers.initialFocus >= 0 && handlers.initialFocus < count) {
    paintFocus(handlers.initialFocus);
  }

  return { destroy() { host.textContent = ""; }, paintFocus };
}

window.AISystem6OneMoreTuneWheel = {
  createGesture: createOneMoreTuneWheelGesture,
  angleDelta: oneMoreTuneWheelAngleDelta,
  cardinal: oneMoreTuneWheelCardinal,
  mount: mountOneMoreTuneWheel,
  constants: {
    stepDegrees: ONE_MORE_TUNE_WHEEL_STEP_DEG,
    hysteresisDeg: ONE_MORE_TUNE_WHEEL_HYSTERESIS_DEG,
    moveRatio: ONE_MORE_TUNE_WHEEL_MOVE_RATIO,
    deadRatio: ONE_MORE_TUNE_WHEEL_DEAD_RATIO,
    tiers: ONE_MORE_TUNE_WHEEL_TIERS,
    seekTiers: ONE_MORE_TUNE_WHEEL_SEEK_TIERS,
    tierMs: ONE_MORE_TUNE_WHEEL_TIER_MS,
    minSpeed: ONE_MORE_TUNE_WHEEL_MIN_SPEED,
    capSpeed: ONE_MORE_TUNE_WHEEL_CAP_SPEED,
    gapMs: ONE_MORE_TUNE_WHEEL_GAP_MS,
    smoothing: ONE_MORE_TUNE_WHEEL_SMOOTHING,
    tapDegrees: ONE_MORE_TUNE_WHEEL_TAP_DEG,
    tapMs: ONE_MORE_TUNE_WHEEL_TAP_MS,
    clickHz: ONE_MORE_TUNE_WHEEL_CLICK_HZ,
  },
};
