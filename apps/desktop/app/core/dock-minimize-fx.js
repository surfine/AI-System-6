// 3D Dock minimize / restore — Genie（神奇）、Scale（縮放）、Suck（吸入）.
//
// Lazy module. Loads a slim three.js vendor only when a Mac OS X Dock era
// actually puts a window away. Reduced motion and missing WebGL fall back to
// the plain CSS ghost in window-minimize.js. NeXTSTEP never calls this.
//
// The window itself is put away immediately (document identity stays intact);
// this module only paints a short overlay of a captured frame.
(() => {
  if (window.AISystem6DockMinimizeFxLoaded) return;

  const VENDOR_URL = "/app/vendor/dock-minimize-fx.js?v=three-0.185.1-dock-fx-r1";
  const STORAGE_KEY = "ai-system-6-minimize-fx";
  const EFFECTS = Object.freeze(["genie", "scale", "suck"]);
  const DURATION_MS = Object.freeze({ genie: 620, scale: 420, suck: 520 });

  let threePromise = null;
  let running = null;

  function reducedMotion() {
    try {
      return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
    } catch (error) {
      return false;
    }
  }

  function currentThemeId() {
    try {
      return window.AISystem6Theme?.getCurrentTheme?.() || "";
    } catch (error) {
      return "";
    }
  }

  // Prefer an explicit choice; otherwise Genie for OS X Dock eras (the Mac
  // default since Jaguar). Scale is the quieter modern fallback.
  function resolveEffect(requested) {
    const raw = String(requested || localStorage.getItem(STORAGE_KEY) || "").toLowerCase();
    if (EFFECTS.includes(raw)) return raw;
    const theme = currentThemeId();
    if (theme === "big-sur" || theme === "liquid-glass") return "scale";
    if (theme === "yosemite") return "genie";
    return "genie";
  }

  function loadThree() {
    if (!threePromise) {
      threePromise = import(VENDOR_URL).catch((error) => {
        threePromise = null;
        throw error;
      });
    }
    return threePromise;
  }

  function dockTargetRect(win) {
    const key = win?.dataset?.window;
    const cell = key
      ? document.querySelector(`.desk-dock-items [data-miniwindow="${CSS.escape(key)}"]`)
      : null;
    const trash = document.querySelector(".desk-dock [data-dock-key='trash']");
    const host = cell || trash || document.querySelector(".desk-dock");
    return host?.getBoundingClientRect?.() || null;
  }

  // Schematic stand-in (chrome + title + content rules). Callers that already
  // hold a DOM foreignObject capture (window-minimize) should pass it through;
  // this path remains the sync fallback for warp / restore measure.
  function captureWindowBitmap(win) {
    const rect = win.getBoundingClientRect();
    const width = Math.max(32, Math.round(rect.width));
    const height = Math.max(24, Math.round(rect.height));
    const maxEdge = 720;
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    const cw = Math.max(32, Math.round(width * scale));
    const ch = Math.max(24, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const winStyle = getComputedStyle(win);
    const radius = Math.min(12, Number.parseFloat(winStyle.borderTopLeftRadius) || 6) * scale;
    const theme = document.body?.dataset?.theme || "";
    const isTigerMetal = theme === "tiger" && win.dataset?.app === "finder";
    const isSystem7 = theme === "system-7";
    const isClassic = theme === "classic";
    const isPlatinum = theme === "platinum";
    const isNextstep = theme === "nextstep";
    const isDrawingBoard = theme === "drawing-board";
    const isAqua = theme === "aqua";
    const isSnowLeopard = theme === "snow-leopard";
    const isLion = theme === "lion";
    const isYosemite = theme === "yosemite";
    const isBigSur = theme === "big-sur";
    const isLiquidGlass = theme === "liquid-glass";
    const isClassicChrome = isClassic || isPlatinum || isSystem7;
    // Schematic only — true DOM capture lives in window-minimize
    // (captureDomWindowBitmap). This approximates metal / paper / title.
    if (isTigerMetal) {
      const metal = ctx.createLinearGradient(0, 0, cw, 0);
      metal.addColorStop(0, "#a8adb4");
      metal.addColorStop(0.5, "#d5d7dd");
      metal.addColorStop(1, "#acb0b8");
      ctx.fillStyle = metal;
    } else if (isNextstep) {
      ctx.fillStyle = "#aaaaaa";
    } else if (isDrawingBoard) {
      ctx.fillStyle = "#cec7bd";
    } else if (isPlatinum) {
      ctx.fillStyle = "#dddddd";
    } else {
      ctx.fillStyle = winStyle.backgroundColor || "#f2f2f2";
    }
    roundRect(ctx, 0, 0, cw, ch, radius);
    ctx.fill();
    if (isTigerMetal) {
      for (let y = 0; y < ch; y += 3 * scale) {
        ctx.fillStyle = "rgba(255,255,255,0.12)";
        ctx.fillRect(0, y, cw, 1 * scale);
        ctx.fillStyle = "rgba(0,0,0,0.06)";
        ctx.fillRect(0, y + 1 * scale, cw, 1 * scale);
      }
    }

    const bar = win.querySelector(".title-bar");
    const barH = Math.max(10, Math.round((bar?.getBoundingClientRect?.().height || 22) * scale));
    if (bar) {
      const barStyle = getComputedStyle(bar);
      if (isClassic) {
        // Era paint only — System 6 white bar + black lines (≠ System 7 lavender).
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, cw, barH);
        for (let y = 3 * scale; y < barH - 2 * scale; y += 2 * scale) {
          ctx.fillStyle = "#000000";
          ctx.fillRect(0, y, cw, Math.max(1, 1 * scale));
        }
      } else if (isPlatinum) {
        // Era paint only — Mac OS 9 platinum pinstripe (matches menubar #dddddd).
        ctx.fillStyle = "#dddddd";
        ctx.fillRect(0, 0, cw, barH);
        for (let y = 1 * scale; y < barH - 1 * scale; y += 2 * scale) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, y, cw, Math.max(1, 1 * scale));
          ctx.fillStyle = "#999999";
          ctx.fillRect(0, y + Math.max(1, 1 * scale), cw, Math.max(1, 1 * scale));
        }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, cw, Math.max(1, 1 * scale));
        ctx.fillStyle = "#666666";
        ctx.fillRect(0, barH - Math.max(1, 1 * scale), cw, Math.max(1, 1 * scale));
      } else if (isSystem7) {
        ctx.fillStyle = "#eeeeee";
        ctx.fillRect(0, 0, cw, barH);
        for (let y = 4 * scale; y < barH - 3 * scale; y += 2 * scale) {
          ctx.fillStyle = "#777777";
          ctx.fillRect(0, y, cw, Math.max(1, 1 * scale));
        }
        ctx.fillStyle = "#ccccff";
        ctx.fillRect(0, 0, cw, Math.max(1, 1 * scale));
        ctx.fillRect(0, 0, Math.max(1, 1 * scale), barH);
        ctx.fillStyle = "#9999cc";
        ctx.fillRect(0, barH - Math.max(1, 1 * scale), cw, Math.max(1, 1 * scale));
      } else if (isDrawingBoard) {
        ctx.fillStyle = "#c0b6aa";
        ctx.fillRect(0, 0, cw, barH);
        for (let y = 1 * scale; y < barH - 2 * scale; y += 2 * scale) {
          ctx.fillStyle = "#f4efe7";
          ctx.fillRect(0, y, cw, Math.max(1, 1 * scale));
          ctx.fillStyle = "#75685a";
          ctx.fillRect(0, y + Math.max(1, 1 * scale), cw, Math.max(1, 1 * scale));
        }
        ctx.fillStyle = "#958671";
        ctx.fillRect(0, barH - Math.max(1, 1 * scale), cw, Math.max(1, 1 * scale));
      } else if (isAqua) {
        // Era paint only — Aqua 4px pinstripe (matches 67-aqua-appearance menubar).
        const stripe = ["#fafafa", "#ffffff", "#fafafa", "#e9e9e9"];
        for (let y = 0; y < barH; y += 1) {
          ctx.fillStyle = stripe[Math.floor(y / Math.max(1, scale)) % 4];
          ctx.fillRect(0, y, cw, 1);
        }
      } else if (isSnowLeopard) {
        // Era paint only — opaque 10.6 metal ramp (matches menubar; no frost).
        const g = ctx.createLinearGradient(0, 0, 0, barH);
        g.addColorStop(0, "#f6f6f6");
        g.addColorStop(1, "#d4d4d4");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, cw, barH);
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.fillRect(0, 0, cw, Math.max(1, 1 * scale));
      } else if (isLion) {
        // Era paint only — 10.7 light frost stand-in (matches menubar; < Yosemite).
        const g = ctx.createLinearGradient(0, 0, 0, barH);
        g.addColorStop(0, "#f0f0f0");
        g.addColorStop(1, "#d8d8d8");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, cw, barH);
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.fillRect(0, 0, cw, Math.max(1, 1 * scale));
      } else if (isYosemite) {
        // Era paint only — cool dense frost stand-in (translucent CSS ≠ canvas).
        const g = ctx.createLinearGradient(0, 0, 0, barH);
        g.addColorStop(0, "#f7f7f9");
        g.addColorStop(1, "#e8e8ec");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, cw, barH);
      } else if (isBigSur) {
        // Era paint only — warm open frost stand-in.
        const g = ctx.createLinearGradient(0, 0, 0, barH);
        g.addColorStop(0, "#fdf6f0");
        g.addColorStop(1, "#f0e4da");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, cw, barH);
      } else if (isLiquidGlass) {
        // Era paint only — brighter glass stack stand-in (still not html2canvas).
        const g = ctx.createLinearGradient(0, 0, 0, barH);
        g.addColorStop(0, "#ffffff");
        g.addColorStop(0.45, "#f4f6f8");
        g.addColorStop(1, "#e8ebef");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, cw, barH);
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.fillRect(0, 0, cw, Math.max(1, 2 * scale));
      } else if (!isTigerMetal) {
        if (isNextstep) {
          ctx.fillStyle = "#aaaaaa";
          ctx.fillRect(0, 0, cw, barH);
          ctx.fillStyle = "#000000";
          ctx.fillRect(0, barH - 1, cw, 1);
        } else {
          const grad = barStyle.backgroundImage;
          if (grad && grad !== "none") {
            try {
              // Approximate the active title bar as a vertical silver ramp when a
              // complex multi-layer background cannot be painted into 2D.
              const g = ctx.createLinearGradient(0, 0, 0, barH);
              g.addColorStop(0, "#f6f6f6");
              g.addColorStop(1, "#c8c8c8");
              ctx.fillStyle = g;
            } catch (error) {
              ctx.fillStyle = barStyle.backgroundColor || "#d0d0d0";
            }
          } else {
            ctx.fillStyle = barStyle.backgroundColor || "#d0d0d0";
          }
          ctx.fillRect(0, 0, cw, barH);
          ctx.fillStyle = "rgba(0,0,0,0.22)";
          ctx.fillRect(0, barH - 1, cw, 1);
        }
      }

      if (isClassicChrome) {
        // Classic / System 7 / Platinum: square close box — never Aqua traffic lights.
        const box = 6 * scale;
        const by = barH / 2 - box / 2;
        if (isSystem7) {
          ctx.fillStyle = "#aaaaaa";
          ctx.fillRect(3 * scale, by, box, box);
          ctx.strokeStyle = "#333366";
          ctx.strokeRect(3 * scale + 0.5, by + 0.5, box - 1, box - 1);
        } else if (isPlatinum) {
          ctx.fillStyle = "#cccccc";
          ctx.fillRect(3 * scale, by, box, box);
          ctx.strokeStyle = "#000000";
          ctx.strokeRect(3 * scale + 0.5, by + 0.5, box - 1, box - 1);
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(3 * scale + 1, by + 1, box - 3, 1);
        } else {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(3 * scale, by, box, box);
          ctx.strokeStyle = "#000000";
          ctx.strokeRect(3 * scale + 0.5, by + 0.5, box - 1, box - 1);
        }
      } else if (!isNextstep) {
        const lamps = bar.querySelectorAll(".close-box, .minimize-box, .resize-box, .zoom-lamp");
        let lx = 6 * scale;
        const lampR = Math.max(2, 5 * scale);
        // Tahoe's yellow is flat #fac800; earlier eras keep the classic amber.
        const yellow = theme === "liquid-glass" ? "#fac800" : "#febc2e";
        const colours = ["#ff5f57", yellow, "#28c840"];
        Array.from(lamps).slice(0, 3).forEach((node, index) => {
          ctx.beginPath();
          ctx.fillStyle = colours[index] || "#c8c8c8";
          ctx.arc(lx + lampR, barH / 2, lampR, 0, Math.PI * 2);
          ctx.fill();
          lx += lampR * 2 + 4 * scale;
        });
      }

      const title = bar.querySelector("h1, h2")?.textContent?.trim() || "";
      if (title) {
        ctx.fillStyle = barStyle.color || (isNextstep || isClassicChrome ? "#000" : "#222");
        ctx.font = `600 ${Math.max(8, 11 * scale)}px ${barStyle.fontFamily || "sans-serif"}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(title.slice(0, 42), cw / 2, barH / 2, cw - 24 * scale);
      }
    }

    const bodyTop = barH + 2;
    const pane = win.querySelector(".window-pane, .window-body, .window-content, .finder-surface, .theme-lab-finder-surface");
    const paneStyle = pane ? getComputedStyle(pane) : null;
    ctx.fillStyle = paneStyle?.backgroundColor && paneStyle.backgroundColor !== "rgba(0, 0, 0, 0)"
      ? paneStyle.backgroundColor
      : "#ffffff";
    ctx.fillRect(2 * scale, bodyTop, cw - 4 * scale, ch - bodyTop - 2 * scale);
    // Source-list rail + grey rules from the first text lines.
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    ctx.fillRect(2 * scale, bodyTop, 10 * scale, ch - bodyTop - 2 * scale);
    const field = win.querySelector("textarea, [contenteditable='true']");
    const source = field
      ? (typeof field.value === "string" ? field.value : field.textContent)
      : (pane || win).textContent;
    const lines = String(source || "").split(/\n+/).map((line) => line.trim()).filter(Boolean).slice(0, 12);
    ctx.fillStyle = "rgba(0,0,0,0.38)";
    lines.forEach((line, index) => {
      const y = bodyTop + 8 * scale + index * 7 * scale;
      if (y > ch - 6 * scale) return;
      const w = Math.max(18 * scale, Math.min(cw - 20 * scale, line.length * 3.2 * scale));
      ctx.fillRect(14 * scale, y, w, 2.2 * scale);
    });

    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    ctx.lineWidth = Math.max(1, scale);
    roundRect(ctx, 0.5, 0.5, cw - 1, ch - 1, radius);
    ctx.stroke();
    return { canvas, cssWidth: width, cssHeight: height, left: rect.left, top: rect.top };
  }

  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  const VERTEX = /* glsl */ `
    varying vec2 vUv;
    uniform float uProgress;
    uniform float uMode; // 0 genie, 1 scale, 2 suck
    uniform vec2 uFromMin;
    uniform vec2 uFromMax;
    uniform vec2 uTo;
    uniform vec2 uResolution;

    float ease(float t) {
      return t * t * (3.0 - 2.0 * t);
    }

    void main() {
      vUv = uv;
      float t = clamp(uProgress, 0.0, 1.0);
      float e = ease(t);
      vec2 fromCenter = (uFromMin + uFromMax) * 0.5;
      vec2 fromSize = max(uFromMax - uFromMin, vec2(1.0));
      // Local plane is -0.5..0.5 in both axes; map to the from-rect in clip-ish px.
      vec2 local = position.xy; // -0.5..0.5
      vec2 pixel = fromCenter + local * fromSize;
      float z = 0.0;

      if (uMode < 0.5) {
        // Genie / 神奇效果: top stays wider longer; foot cinches to the Dock.
        float foot = smoothstep(0.0, 1.0, 1.0 - uv.y);
        float pinch = mix(1.0, 0.04 + 0.2 * uv.y, e);
        float wave = sin(uv.y * 18.0 + e * 9.0) * 10.0 * foot * e * (1.0 - e);
        pixel.x = mix(fromCenter.x, uTo.x, e * (0.35 + 0.65 * foot))
          + (local.x * fromSize.x) * pinch + wave;
        pixel.y = mix(pixel.y, uTo.y, e * e);
        z = sin(uv.x * 3.14159) * (1.0 - uv.y) * e * 36.0;
      } else if (uMode < 1.5) {
        // Scale / 縮放: shrink toward the Dock centre with a slight Z pop.
        pixel = mix(pixel, uTo, e);
        float s = mix(1.0, 0.06, e);
        pixel = uTo + (pixel - uTo) * s;
        z = (1.0 - e) * e * 48.0;
      } else {
        // Suck / 吸入: spiral in while collapsing.
        float ang = e * 5.5;
        float c = cos(ang);
        float s = sin(ang);
        vec2 rel = (pixel - fromCenter) * mix(1.0, 0.05, e);
        rel = vec2(rel.x * c - rel.y * s, rel.x * s + rel.y * c);
        pixel = mix(fromCenter + rel, uTo, e);
        z = (0.5 - abs(uv.x - 0.5)) * e * 40.0;
      }

      vec2 clip = vec2(
        (pixel.x / uResolution.x) * 2.0 - 1.0,
        1.0 - (pixel.y / uResolution.y) * 2.0
      );
      gl_Position = vec4(clip, -z / 1000.0, 1.0);
    }
  `;

  const FRAGMENT = /* glsl */ `
    varying vec2 vUv;
    uniform sampler2D uMap;
    uniform float uProgress;
    uniform float uOpacity;

    void main() {
      vec4 color = texture2D(uMap, vUv);
      float fade = 1.0 - smoothstep(0.82, 1.0, uProgress);
      color.a *= uOpacity * fade;
      if (color.a < 0.01) discard;
      gl_FragColor = color;
    }
  `;

  function effectMode(name) {
    if (name === "scale") return 1;
    if (name === "suck") return 2;
    return 0;
  }

  async function playWarp({ fromCapture, toRect, effect, reverse = false }) {
    if (!fromCapture || !toRect || reducedMotion()) return false;
    const THREE = await loadThree();
    if (running) {
      try { running.abort(); } catch (error) { /* prior overlay */ }
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, premultipliedAlpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(vw, vh, false);
    renderer.setClearColor(0x000000, 0);
    const canvas = renderer.domElement;
    canvas.className = "minimize-fx-canvas";
    canvas.setAttribute("aria-hidden", "true");
    Object.assign(canvas.style, {
      position: "fixed",
      inset: "0",
      width: "100vw",
      height: "100vh",
      pointerEvents: "none",
      zIndex: "9450",
    });
    document.body.append(canvas);

    const texture = new THREE.CanvasTexture(fromCapture.canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;

    const uniforms = {
      uMap: { value: texture },
      uProgress: { value: reverse ? 1 : 0 },
      uOpacity: { value: 1 },
      uMode: { value: effectMode(effect) },
      uFromMin: { value: new THREE.Vector2(fromCapture.left, fromCapture.top) },
      uFromMax: {
        value: new THREE.Vector2(
          fromCapture.left + fromCapture.cssWidth,
          fromCapture.top + fromCapture.cssHeight,
        ),
      },
      uTo: { value: new THREE.Vector2(toRect.left + toRect.width / 2, toRect.top + toRect.height / 2) },
      uResolution: { value: new THREE.Vector2(vw, vh) },
    };

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 48, 36), material);
    const scene = new THREE.Scene();
    scene.add(mesh);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 1;

    const duration = DURATION_MS[effect] || 560;
    const started = performance.now();
    let aborted = false;
    const handle = {
      abort() {
        aborted = true;
        cleanup();
      },
    };
    running = handle;

    function cleanup() {
      cancelAnimationFrame(frameId);
      material.dispose();
      mesh.geometry.dispose();
      texture.dispose();
      renderer.dispose();
      canvas.remove();
      if (running === handle) running = null;
    }

    let frameId = 0;
    return await new Promise((resolve) => {
      const tick = (now) => {
        if (aborted) {
          resolve(false);
          return;
        }
        const raw = Math.min(1, (now - started) / duration);
        const progress = reverse ? 1 - raw : raw;
        uniforms.uProgress.value = progress;
        renderer.render(scene, camera);
        if (raw < 1) {
          frameId = requestAnimationFrame(tick);
        } else {
          cleanup();
          resolve(true);
        }
      };
      frameId = requestAnimationFrame(tick);
    });
  }

  function waitFrames(count = 2) {
    return new Promise((resolve) => {
      let left = count;
      const step = () => {
        left -= 1;
        if (left <= 0) resolve();
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  async function flyToDock(win, preparedCapture = null) {
    if (reducedMotion()) return false;
    if (!document.querySelector(".desk-dock")) return false;
    // Prefer a capture taken before `is-minimized` hid the window.
    const capture = preparedCapture || captureWindowBitmap(win);
    if (!capture) return false;
    // Give the Dock a couple of frames to paint the miniwindow cell, then
    // suck toward that tile; fall back to Trash / the shelf.
    await waitFrames(2);
    const key = win?.dataset?.window;
    const cell = key
      ? document.querySelector(`.desk-dock-items [data-miniwindow="${CSS.escape(key)}"]`)
      : null;
    const trash = document.querySelector(".desk-dock [data-dock-key='trash']");
    const to = cell?.getBoundingClientRect?.()
      || trash?.getBoundingClientRect?.()
      || document.querySelector(".desk-dock")?.getBoundingClientRect?.();
    if (!to) return false;
    const effect = resolveEffect();
    try {
      return await playWarp({ fromCapture: capture, toRect: to, effect, reverse: false });
    } catch (error) {
      return false;
    }
  }

  function savedWindowRect(win) {
    const left = Number(win?.dataset?.minimizeFxLeft);
    const top = Number(win?.dataset?.minimizeFxTop);
    const width = Number(win?.dataset?.minimizeFxWidth);
    const height = Number(win?.dataset?.minimizeFxHeight);
    if ([left, top, width, height].every((n) => Number.isFinite(n) && n > 0)) {
      return { left, top, width, height };
    }
    return null;
  }

  function paintFromSavedRect(win) {
    const saved = savedWindowRect(win);
    const w = Math.max(32, Math.round(saved?.width || Math.min(640, window.innerWidth * 0.55)));
    const h = Math.max(24, Math.round(saved?.height || Math.min(420, window.innerHeight * 0.55)));
    const left = saved?.left ?? (window.innerWidth - w) / 2;
    const top = saved?.top ?? (window.innerHeight - h) / 2;
    // Temporarily apply the saved box so the painter has real proportions
    // even while the window is display:none.
    const prev = {
      display: win.style.display,
      visibility: win.style.visibility,
      left: inlineStyleValue(win, "left"),
      top: inlineStyleValue(win, "top"),
      width: inlineStyleValue(win, "width"),
      height: inlineStyleValue(win, "height"),
      position: win.style.position,
      zIndex: win.style.zIndex,
    };
    win.classList.add("is-minimize-fx-measure");
    Object.assign(win.style, {
      display: "flex",
      visibility: "hidden",
      position: "fixed",
      left: `${left}px`,
      top: `${top}px`,
      width: `${w}px`,
      height: `${h}px`,
      zIndex: "-1",
    });
    const painted = captureWindowBitmap(win);
    win.classList.remove("is-minimize-fx-measure");
    Object.assign(win.style, prev);
    if (!painted) return null;
    return { canvas: painted.canvas, cssWidth: w, cssHeight: h, left, top };
  }

  async function flyFromDock(win) {
    if (reducedMotion()) return false;
    const toCapture = paintFromSavedRect(win);
    if (!toCapture?.canvas) return false;
    const from = dockTargetRect(win) || document.querySelector(".desk-dock")?.getBoundingClientRect?.();
    if (!from) return false;
    const effect = resolveEffect();
    try {
      return await playWarp({
        fromCapture: toCapture,
        toRect: from,
        effect,
        reverse: true,
      });
    } catch (error) {
      return false;
    }
  }

  function setEffect(name) {
    if (!EFFECTS.includes(name)) return false;
    localStorage.setItem(STORAGE_KEY, name);
    return true;
  }

  function getEffect() {
    return resolveEffect();
  }

  window.AISystem6DockMinimizeFx = Object.freeze({
    flyToDock,
    flyFromDock,
    captureWindowBitmap,
    setEffect,
    getEffect,
    effects: EFFECTS,
  });
  window.AISystem6DockMinimizeFxLoaded = true;
})();
