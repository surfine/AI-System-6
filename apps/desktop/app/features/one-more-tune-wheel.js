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
// Two rules the design passes added, and both are refusals rather than
// additions: the focus highlight does not animate (an iPod's selection moves
// instantly, and keyboard-initiated state changes get no animation anywhere),
// and the wheel carries no sound — the desk is quiet; a haptic tick on the
// step and a firmer one on a commit are the only feedback the ring adds.
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

/** Shortest signed arc between two angles, in (-180, 180]. */
function oneMoreTuneWheelAngleDelta(from, to) {
  return (((to - from) % 360) + 540) % 360 - 180;
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
 * handlers (choice mode, the default):
 *   count        how many choices the wheel drives (the four keys)
 *   zoneAria(n)  accessible name for the zone that picks choice n
 *   selectLabel  the centre key's label
 *   onFocus(i)   the turn moved the highlight to choice i (focus wraps)
 *   onCommit(i)  a zone was tapped (i) or the centre pressed (focused i);
 *                the caller commits through the key it already has
 *   haptic(ms)   optional, fired on the same frame as the visual change
 *
 * handlers (scrub mode, mode: "scrub"):
 *   scrubBy(deltaSeconds)  the turn or a zone moved the playhead; the caller
 *                          clamps to its own cue window — the wheel never
 *                          learns where the edges are
 *   onScrubCommit()        the centre replays from the playhead
 *   zoneSeconds [s]        the four zones' direct jumps, clockwise from top
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
  const quad = document.createElement("div");
  quad.className = "omt-wheel-quad";
  quad.setAttribute("aria-hidden", "true");
  ring.appendChild(quad);
  const zones = [];
  for (let i = 0; i < count; i += 1) {
    const zone = document.createElement("button");
    zone.type = "button";
    zone.className = "omt-wheel-zone";
    zone.dataset.zone = String(i);
    zone.textContent = scrub ? zoneLabel(i) : String(i + 1);
    zone.setAttribute("aria-label", handlers.zoneAria(i));
    ring.appendChild(zone);
    zones.push(zone);
  }
  const centre = document.createElement("button");
  centre.type = "button";
  centre.className = "omt-wheel-select";
  centre.textContent = handlers.selectLabel || "";
  ring.appendChild(centre);
  host.appendChild(ring);

  let focus = -1;
  const reduced = typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function paintFocus(index) {
    focus = index;
    // Quadrants open clockwise from the top: zone i covers the 90° that
    // starts at -45° + i·90° in conic-gradient terms.
    const starts = [-45, 45, 135, 225];
    quad.style.background = index >= 0
      ? `conic-gradient(from ${starts[index % 4]}deg, var(--omt-wheel-quad) 0 90deg, transparent 90deg)`
      : "none";
    zones.forEach((zone, i) => zone.classList.toggle("is-on", i === focus));
  }

  let gesture = null;
  let dragging = false;
  let pointerId = null;
  let rect = null;

  ring.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return;
    if (dragging) return; // one finger at a time; a second never steals the turn
    dragging = true;
    pointerId = event.pointerId;
    rect = ring.getBoundingClientRect();
    // The radius is the ring's, read at gesture start; the state machine is
    // rebuilt with it so the math never guesses the geometry.
    gesture = createOneMoreTuneWheelGesture({ radius: rect.width / 2, reduced });
    try { ring.setPointerCapture(event.pointerId); } catch { /* older engines */ }
    event.preventDefault();
  });
  ring.addEventListener("pointermove", (event) => {
    if (!dragging || event.pointerId !== pointerId || !gesture) return;
    const x = event.clientX - rect.left - rect.width / 2;
    const y = event.clientY - rect.top - rect.height / 2;
    const step = gesture.sample(x, y, event.timeStamp);
    if (step) {
      if (scrub) {
        // The seek ladder rides the same tiers; a turn at any speed is seconds
        // of cue, and the caller owns the clamp.
        const tiers = reduced ? [1] : (handlers.tiers || ONE_MORE_TUNE_WHEEL_SEEK_TIERS);
        const seconds = step.steps * tiers[step.tier] * step.dir;
        handlers.scrubBy(seconds);
      } else {
        const rows = step.steps * (reduced ? 1 : (handlers.tiers || ONE_MORE_TUNE_WHEEL_TIERS)[step.tier]);
        for (let r = 0; r < rows; r += 1) {
          handlers.onFocus(((focus + step.dir) % count + count) % count);
        }
      }
      handlers.haptic?.(3);
    }
  });
  function endDrag(event) {
    if (!dragging || event.pointerId !== pointerId) return;
    dragging = false;
    pointerId = null;
    gesture = null;
  }
  ring.addEventListener("pointerup", endDrag);
  ring.addEventListener("pointercancel", endDrag);
  ring.addEventListener("lostpointercapture", endDrag);

  zones.forEach((zone, i) => {
    zone.addEventListener("click", () => {
      paintFocus(i);
      handlers.haptic?.(8);
      if (scrub) handlers.scrubBy(zoneSeconds[i]);
      else handlers.onCommit(i);
    });
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

  return { destroy() { host.textContent = ""; }, paintFocus };
}

window.AISystem6OneMoreTuneWheel = {
  createGesture: createOneMoreTuneWheelGesture,
  angleDelta: oneMoreTuneWheelAngleDelta,
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
  },
};
