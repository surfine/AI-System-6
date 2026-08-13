// SPDX-License-Identifier: GPL-2.0-only

(function installDoomTouchControls(global) {
  "use strict";

  var FRAME_FIELDS = Object.freeze([
    "move",
    "strafe",
    "turn",
    "fire",
    "use",
    "run",
    "map",
    "menu",
    "weaponDelta",
  ]);
  var HOLD_ACTIONS = Object.freeze(["fire", "use", "run"]);
  var MAX_PULSE_BACKLOG = 8;

  function finiteNumber(value, fallback) {
    var number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clampUnit(value) {
    return Math.max(-1, Math.min(1, finiteNumber(value, 0)));
  }

  function roundAxis(value) {
    var rounded = Math.round(clampUnit(value) * 1000) / 1000;
    return Object.is(rounded, -0) ? 0 : rounded;
  }

  function normalizeStick(deltaX, deltaY, radius, deadZone) {
    var safeRadius = Math.max(1, finiteNumber(radius, 1));
    var zone = Math.max(0, Math.min(0.95, finiteNumber(deadZone, 0.12)));
    var rawX = finiteNumber(deltaX, 0) / safeRadius;
    var rawY = finiteNumber(deltaY, 0) / safeRadius;
    var magnitude = Math.sqrt((rawX * rawX) + (rawY * rawY));
    if (magnitude <= zone) return Object.freeze({ x: 0, y: 0 });

    var limitedMagnitude = Math.min(1, magnitude);
    var scaledMagnitude = (limitedMagnitude - zone) / (1 - zone);
    var directionX = rawX / magnitude;
    var directionY = rawY / magnitude;
    return Object.freeze({
      x: roundAxis(directionX * scaledMagnitude),
      y: roundAxis(directionY * scaledMagnitude),
    });
  }

  function normalizeTurn(deltaX, span, deadZone) {
    var halfSpan = Math.max(1, finiteNumber(span, 1) / 2);
    var zone = Math.max(0, Math.min(0.95, finiteNumber(deadZone, 0.08)));
    var raw = clampUnit(finiteNumber(deltaX, 0) / halfSpan);
    var magnitude = Math.abs(raw);
    if (magnitude <= zone) return 0;
    return roundAxis(Math.sign(raw) * ((magnitude - zone) / (1 - zone)));
  }

  function directionForVector(x, y) {
    var horizontal = clampUnit(x);
    var vertical = clampUnit(y);
    if (Math.max(Math.abs(horizontal), Math.abs(vertical)) < 0.18) return "idle";
    var angle = Math.atan2(vertical, horizontal) * 180 / Math.PI;
    if (angle >= -22.5 && angle < 22.5) return "e";
    if (angle >= 22.5 && angle < 67.5) return "se";
    if (angle >= 67.5 && angle < 112.5) return "s";
    if (angle >= 112.5 && angle < 157.5) return "sw";
    if (angle >= 157.5 || angle < -157.5) return "w";
    if (angle >= -157.5 && angle < -112.5) return "nw";
    if (angle >= -112.5 && angle < -67.5) return "n";
    return "ne";
  }

  function normalizeViewport(viewport, fallbackWidth, fallbackHeight) {
    var width = Math.max(1, Math.round(finiteNumber(
      viewport && viewport.cssWidth,
      finiteNumber(fallbackWidth, 1)
    )));
    var height = Math.max(1, Math.round(finiteNumber(
      viewport && viewport.cssHeight,
      finiteNumber(fallbackHeight, 1)
    )));
    return Object.freeze({
      cssWidth: width,
      cssHeight: height,
      orientation: height >= width ? "portrait" : "landscape",
      size: Math.min(width, height) < 430 ? "compact" : "regular",
    });
  }

  function emptyPulseState() {
    return Object.freeze({ mapCount: 0, menuCount: 0, weaponQueue: Object.freeze([]) });
  }

  function normalizePulseState(pulses) {
    var queue = Array.isArray(pulses && pulses.weaponQueue)
      ? pulses.weaponQueue.map(function (value) { return Math.sign(finiteNumber(value, 0)); }).filter(Boolean)
      : [];
    return Object.freeze({
      mapCount: Math.max(0, Math.floor(finiteNumber(pulses && pulses.mapCount, 0))),
      menuCount: Math.max(0, Math.floor(finiteNumber(pulses && pulses.menuCount, 0))),
      weaponQueue: Object.freeze(queue.slice(0, MAX_PULSE_BACKLOG)),
    });
  }

  function frameFromState(continuous, pulses) {
    var pulseState = normalizePulseState(pulses);
    return Object.freeze({
      move: roundAxis(continuous && continuous.move),
      strafe: roundAxis(continuous && continuous.strafe),
      turn: roundAxis(continuous && continuous.turn),
      fire: Boolean(continuous && continuous.fire),
      use: Boolean(continuous && continuous.use),
      run: Boolean(continuous && continuous.run),
      map: pulseState.mapCount > 0,
      menu: pulseState.menuCount > 0,
      weaponDelta: pulseState.weaponQueue.length ? pulseState.weaponQueue[0] : 0,
    });
  }

  function consumeFrame(continuous, pulses) {
    var pulseState = normalizePulseState(pulses);
    return Object.freeze({
      frame: frameFromState(continuous, pulseState),
      pulses: Object.freeze({
        mapCount: Math.max(0, pulseState.mapCount - 1),
        menuCount: Math.max(0, pulseState.menuCount - 1),
        weaponQueue: Object.freeze(pulseState.weaponQueue.slice(1)),
      }),
    });
  }

  function zeroFrame() {
    return frameFromState(null, emptyPulseState());
  }

  var pure = Object.freeze({
    clampUnit: clampUnit,
    normalizeStick: normalizeStick,
    normalizeTurn: normalizeTurn,
    directionForVector: directionForVector,
    normalizeViewport: normalizeViewport,
    frameFromState: frameFromState,
    consumeFrame: consumeFrame,
    zeroFrame: zeroFrame,
  });

  function attach(options) {
    var settings = options || {};
    var root = settings.root;
    if (!root || root.nodeType !== 1 || typeof root.appendChild !== "function") {
      throw new TypeError("AISystem6DoomTouchControls.attach requires an element root");
    }

    var doc = root.ownerDocument;
    var view = doc.defaultView || global;
    var onFrame = typeof settings.onFrame === "function" ? settings.onFrame : function () {};
    var onRelease = typeof settings.onRelease === "function" ? settings.onRelease : function () {};
    var destroyed = false;
    var enabled = true;
    var listeners = [];
    var pointerOwners = new Map();
    var analogOwners = { move: null, turn: null };
    var heldPointers = { fire: new Set(), use: new Set(), run: new Set() };
    var keyboardHeld = { fire: false, use: false, run: false };
    var continuous = {
      move: 0,
      strafe: 0,
      turn: 0,
      fire: false,
      use: false,
      run: false,
    };
    var pulses = emptyPulseState();
    var viewportState = normalizeViewport(null, view.innerWidth, view.innerHeight);
    var rootHadHostClass = root.classList.contains("doom-touch-controls-host");

    var labels = /^zh\b/i.test(doc.documentElement.lang || "") ? {
      controls: "DOOM 触控控制",
      move: "移动与横移",
      turn: "转向",
      fire: "开火",
      use: "使用",
      run: "奔跑",
      map: "地图",
      menu: "菜单",
      previousWeapon: "上一件武器",
      nextWeapon: "下一件武器",
    } : {
      controls: "DOOM touch controls",
      move: "Move and strafe",
      turn: "Turn",
      fire: "Fire",
      use: "Use",
      run: "Run",
      map: "Map",
      menu: "Menu",
      previousWeapon: "Previous weapon",
      nextWeapon: "Next weapon",
    };

    var controls = doc.createElement("section");
    controls.className = "doom-touch-controls";
    controls.setAttribute("aria-label", labels.controls);
    controls.dataset.orientation = viewportState.orientation;
    controls.dataset.size = viewportState.size;
    controls.innerHTML = [
      '<div class="doom-touch-controls__layout">',
      '  <div class="doom-touch-controls__tools">',
      '    <button class="doom-touch-button doom-touch-button--tool" type="button" data-doom-pulse="menu" aria-label="' + labels.menu + '"><span aria-hidden="true">≡</span><small>MENU</small></button>',
      '    <button class="doom-touch-button doom-touch-button--tool" type="button" data-doom-pulse="map" aria-label="' + labels.map + '"><span aria-hidden="true">▦</span><small>MAP</small></button>',
      '  </div>',
      '  <div class="doom-touch-pad" data-doom-analog="move" data-direction="idle" role="slider" aria-label="' + labels.move + '" aria-valuemin="-1" aria-valuemax="1" aria-valuenow="0">',
      '    <span class="doom-touch-pad__cross" aria-hidden="true">+<\/span>',
      '    <span class="doom-touch-pad__knob" aria-hidden="true"><\/span>',
      '  <\/div>',
      '  <div class="doom-touch-turn" data-doom-analog="turn" data-direction="idle" role="slider" aria-label="' + labels.turn + '" aria-valuemin="-1" aria-valuemax="1" aria-valuenow="0">',
      '    <span aria-hidden="true">←<\/span><small>TURN<\/small><span aria-hidden="true">→<\/span>',
      '  <\/div>',
      '  <div class="doom-touch-actions">',
      '    <div class="doom-touch-actions__primary">',
      '      <button class="doom-touch-button doom-touch-button--fire" type="button" data-doom-hold="fire" aria-label="' + labels.fire + '"><span aria-hidden="true">●</span><small>FIRE</small></button>',
      '      <button class="doom-touch-button" type="button" data-doom-hold="use" aria-label="' + labels.use + '"><span aria-hidden="true">!</span><small>USE</small></button>',
      '      <button class="doom-touch-button" type="button" data-doom-hold="run" aria-label="' + labels.run + '"><span aria-hidden="true">»</span><small>RUN</small></button>',
      '    <\/div>',
      '    <div class="doom-touch-actions__weapons" aria-label="Weapons">',
      '      <button class="doom-touch-button doom-touch-button--weapon" type="button" data-doom-pulse="weapon-prev" aria-label="' + labels.previousWeapon + '"><span aria-hidden="true">W−</span></button>',
      '      <button class="doom-touch-button doom-touch-button--weapon" type="button" data-doom-pulse="weapon-next" aria-label="' + labels.nextWeapon + '"><span aria-hidden="true">W+</span></button>',
      '    <\/div>',
      '  <\/div>',
      '<\/div>',
    ].join("");

    var movePad = controls.querySelector('[data-doom-analog="move"]');
    var turnZone = controls.querySelector('[data-doom-analog="turn"]');
    root.classList.add("doom-touch-controls-host");
    root.appendChild(controls);

    function listen(target, type, handler, optionsForListener) {
      target.addEventListener(type, handler, optionsForListener);
      listeners.push(function () { target.removeEventListener(type, handler, optionsForListener); });
    }

    function reportError(error) {
      if (view.console && typeof view.console.error === "function") {
        view.console.error("DOOM touch controls callback failed", error);
      }
    }

    function notifyFrame() {
      if (destroyed) return;
      // This is a non-consuming preview. The engine consumer calls snapshot()
      // from this callback (or its regular input tick); snapshot() is the sole
      // pulse consumer, so Map/Menu/weapon taps cannot repeat accidentally.
      try {
        onFrame(frameFromState(continuous, pulses));
      } catch (error) {
        reportError(error);
      }
    }

    function syncHoldAction(action) {
      continuous[action] = heldPointers[action].size > 0 || keyboardHeld[action];
      var button = controls.querySelector('[data-doom-hold="' + action + '"]');
      if (continuous[action]) button.dataset.pressed = "true";
      else delete button.dataset.pressed;
    }

    function queuePulse(action) {
      var current = normalizePulseState(pulses);
      if (action === "map") {
        pulses = Object.freeze({
          mapCount: Math.min(MAX_PULSE_BACKLOG, current.mapCount + 1),
          menuCount: current.menuCount,
          weaponQueue: current.weaponQueue,
        });
      } else if (action === "menu") {
        pulses = Object.freeze({
          mapCount: current.mapCount,
          menuCount: Math.min(MAX_PULSE_BACKLOG, current.menuCount + 1),
          weaponQueue: current.weaponQueue,
        });
      } else {
        var delta = action === "weapon-next" ? 1 : -1;
        pulses = Object.freeze({
          mapCount: current.mapCount,
          menuCount: current.menuCount,
          weaponQueue: Object.freeze(current.weaponQueue.concat(delta).slice(-MAX_PULSE_BACKLOG)),
        });
      }
      notifyFrame();
    }

    function targetControl(eventTarget) {
      if (!eventTarget || typeof eventTarget.closest !== "function") return null;
      var target = eventTarget.closest("[data-doom-analog], [data-doom-hold], [data-doom-pulse]");
      return target && controls.contains(target) ? target : null;
    }

    function updateMove(owner, event) {
      var rect = owner.target.getBoundingClientRect();
      var radius = Math.max(1, (Math.min(rect.width, rect.height) / 2) - 10);
      var vector = normalizeStick(
        event.clientX - (rect.left + (rect.width / 2)),
        event.clientY - (rect.top + (rect.height / 2)),
        radius,
        0.12
      );
      continuous.strafe = vector.x;
      continuous.move = roundAxis(-vector.y);
      owner.target.dataset.direction = directionForVector(vector.x, vector.y);
      owner.target.setAttribute("aria-valuenow", String(Math.max(Math.abs(vector.x), Math.abs(vector.y))));
      notifyFrame();
    }

    function updateTurn(owner, event) {
      var rect = owner.target.getBoundingClientRect();
      continuous.turn = normalizeTurn(event.clientX - owner.startX, rect.width, 0.08);
      owner.target.dataset.direction = continuous.turn < -0.08 ? "left" : continuous.turn > 0.08 ? "right" : "idle";
      owner.target.setAttribute("aria-valuenow", String(continuous.turn));
      notifyFrame();
    }

    function onPointerDown(event) {
      if (!enabled || destroyed || pointerOwners.has(event.pointerId)) return;
      var target = targetControl(event.target);
      if (!target) return;
      event.preventDefault();
      if (typeof target.setPointerCapture === "function") {
        try { target.setPointerCapture(event.pointerId); } catch (error) { /* Capture is best effort. */ }
      }

      var analog = target.dataset.doomAnalog;
      var hold = target.dataset.doomHold;
      var pulse = target.dataset.doomPulse;
      if (analog) {
        if (analogOwners[analog] !== null) return;
        var owner = { kind: "analog", action: analog, target: target, startX: event.clientX };
        analogOwners[analog] = event.pointerId;
        pointerOwners.set(event.pointerId, owner);
        target.dataset.active = "true";
        if (analog === "move") updateMove(owner, event);
        else updateTurn(owner, event);
      } else if (hold) {
        pointerOwners.set(event.pointerId, { kind: "hold", action: hold, target: target });
        heldPointers[hold].add(event.pointerId);
        syncHoldAction(hold);
        notifyFrame();
      } else if (pulse) {
        pointerOwners.set(event.pointerId, { kind: "pulse", action: pulse, target: target });
        target.dataset.pressed = "true";
        queuePulse(pulse);
      }
    }

    function onPointerMove(event) {
      var owner = pointerOwners.get(event.pointerId);
      if (!owner || owner.kind !== "analog") return;
      event.preventDefault();
      if (owner.action === "move") updateMove(owner, event);
      else updateTurn(owner, event);
    }

    function finishPointer(pointerId) {
      var owner = pointerOwners.get(pointerId);
      if (!owner) return false;
      pointerOwners.delete(pointerId);
      if (owner.kind === "analog") {
        analogOwners[owner.action] = null;
        delete owner.target.dataset.active;
        owner.target.dataset.direction = "idle";
        owner.target.setAttribute("aria-valuenow", "0");
        if (owner.action === "move") {
          continuous.move = 0;
          continuous.strafe = 0;
        } else {
          continuous.turn = 0;
        }
      } else if (owner.kind === "hold") {
        heldPointers[owner.action].delete(pointerId);
        syncHoldAction(owner.action);
      } else {
        delete owner.target.dataset.pressed;
      }
      notifyFrame();
      return true;
    }

    function onPointerEnd(event) {
      if (!pointerOwners.has(event.pointerId)) return;
      event.preventDefault();
      finishPointer(event.pointerId);
    }

    function release(reason) {
      if (destroyed && reason !== "destroy") return zeroFrame();
      pointerOwners.clear();
      analogOwners.move = null;
      analogOwners.turn = null;
      HOLD_ACTIONS.forEach(function (action) {
        heldPointers[action].clear();
        keyboardHeld[action] = false;
      });
      continuous = { move: 0, strafe: 0, turn: 0, fire: false, use: false, run: false };
      pulses = emptyPulseState();
      controls.querySelectorAll("[data-active], [data-pressed]").forEach(function (element) {
        delete element.dataset.active;
        delete element.dataset.pressed;
      });
      movePad.dataset.direction = "idle";
      movePad.setAttribute("aria-valuenow", "0");
      turnZone.dataset.direction = "idle";
      turnZone.setAttribute("aria-valuenow", "0");
      var frame = zeroFrame();
      try { onRelease(reason || "manual", frame); } catch (error) { reportError(error); }
      return frame;
    }

    function onPointerCancel(event) {
      if (!pointerOwners.has(event.pointerId)) return;
      event.preventDefault();
      release("pointercancel");
    }

    function onLostPointerCapture(event) {
      if (pointerOwners.has(event.pointerId)) release("lostpointercapture");
    }

    function onKeyDown(event) {
      var target = targetControl(event.target);
      if (!target || !target.dataset.doomHold || (event.key !== " " && event.key !== "Enter")) return;
      event.preventDefault();
      if (event.repeat) return;
      keyboardHeld[target.dataset.doomHold] = true;
      syncHoldAction(target.dataset.doomHold);
      notifyFrame();
    }

    function onKeyUp(event) {
      var target = targetControl(event.target);
      if (!target || !target.dataset.doomHold || (event.key !== " " && event.key !== "Enter")) return;
      event.preventDefault();
      keyboardHeld[target.dataset.doomHold] = false;
      syncHoldAction(target.dataset.doomHold);
      notifyFrame();
    }

    function onClick(event) {
      var target = targetControl(event.target);
      // Pointer activation is already queued at pointerdown. A detail-zero
      // click is keyboard or assistive activation and needs its own pulse.
      if (!target || !target.dataset.doomPulse || event.detail !== 0) return;
      event.preventDefault();
      queuePulse(target.dataset.doomPulse);
    }

    function preventNativeGesture(event) {
      if (targetControl(event.target)) event.preventDefault();
    }

    function setEnabled(nextEnabled) {
      var next = Boolean(nextEnabled);
      if (destroyed || next === enabled) return enabled;
      if (!next) release("disabled");
      enabled = next;
      controls.hidden = !enabled;
      controls.setAttribute("aria-hidden", enabled ? "false" : "true");
      return enabled;
    }

    function snapshot() {
      if (destroyed || !enabled) return zeroFrame();
      var result = consumeFrame(continuous, pulses);
      pulses = result.pulses;
      return result.frame;
    }

    function updateViewport(viewport) {
      if (destroyed) return viewportState;
      var next = normalizeViewport(viewport, view.innerWidth, view.innerHeight);
      var changed = next.cssWidth !== viewportState.cssWidth
        || next.cssHeight !== viewportState.cssHeight
        || next.orientation !== viewportState.orientation;
      if (changed && pointerOwners.size) release("viewport-change");
      viewportState = next;
      controls.dataset.orientation = next.orientation;
      controls.dataset.size = next.size;
      return viewportState;
    }

    function destroy() {
      if (destroyed) return;
      release("destroy");
      destroyed = true;
      listeners.splice(0).forEach(function (remove) { remove(); });
      controls.remove();
      if (!rootHadHostClass) root.classList.remove("doom-touch-controls-host");
    }

    listen(controls, "pointerdown", onPointerDown, { passive: false });
    listen(controls, "pointermove", onPointerMove, { passive: false });
    listen(controls, "pointerup", onPointerEnd, { passive: false });
    listen(controls, "pointercancel", onPointerCancel, { passive: false });
    listen(controls, "lostpointercapture", onLostPointerCapture);
    listen(controls, "keydown", onKeyDown);
    listen(controls, "keyup", onKeyUp);
    listen(controls, "click", onClick);
    listen(controls, "contextmenu", preventNativeGesture);
    listen(controls, "dragstart", preventNativeGesture);
    listen(view, "blur", function () { if (enabled) release("blur"); });
    listen(doc, "visibilitychange", function () { if (doc.hidden && enabled) release("document-hidden"); });
    listen(view, "resize", function () { updateViewport(null); });
    listen(view, "orientationchange", function () {
      release("orientationchange");
      updateViewport(null);
    });

    controls.setAttribute("aria-hidden", "false");

    return Object.freeze({
      setEnabled: setEnabled,
      release: release,
      destroy: destroy,
      updateViewport: updateViewport,
      snapshot: snapshot,
      element: controls,
    });
  }

  global.AISystem6DoomTouchControls = Object.freeze({
    frameVersion: 2,
    frameFields: FRAME_FIELDS,
    attach: attach,
    pure: pure,
  });
})(window);
