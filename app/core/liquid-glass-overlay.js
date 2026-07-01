// Core runtime module: liquid-glass-overlay.
(() => {
  const OVERLAY_ID = "liquid-glass-overlay";
  const FRAME_MS = 1000 / 30;
  const MAX_WINDOWS = 12;
  const MOTION_DECAY = 0.82;
  const MOTION_BLEND = 0.3;
  const MAX_MOTION_SHIFT = 10;
  const MOTION_EPSILON = 0.04;

  const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

  const FRAGMENT_SHADER = `#version 300 es
precision highp float;

#define MAX_WINDOWS 12
#define PI 3.14159265359

uniform vec2 u_resolution;
uniform float u_time;
uniform int u_count;
uniform vec4 u_rects[MAX_WINDOWS];
uniform float u_radii[MAX_WINDOWS];
uniform vec2 u_motion[MAX_WINDOWS];
uniform float u_active[MAX_WINDOWS];
uniform float u_strength[MAX_WINDOWS];
uniform float u_dpr;

out vec4 fragColor;

float roundedRectSdf(vec2 p, vec2 center, vec2 size, float radius) {
  vec2 q = abs(p - center) - size + vec2(radius);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

float rectSdfAt(int index, vec2 p) {
  vec4 rect = u_rects[index];
  return roundedRectSdf(p, rect.xy + rect.zw * 0.5, rect.zw * 0.5, u_radii[index]);
}

vec2 rectNormal(int index, vec2 p) {
  float eps = 1.5;
  float dx = rectSdfAt(index, p + vec2(eps, 0.0)) - rectSdfAt(index, p - vec2(eps, 0.0));
  float dy = rectSdfAt(index, p + vec2(0.0, eps)) - rectSdfAt(index, p - vec2(0.0, eps));
  vec2 n = vec2(dx, dy);
  float l = length(n);
  return l > 0.0001 ? n / l : vec2(0.0, -1.0);
}

vec3 spectralEdge(vec2 n, vec2 motion, float edge, float isActive) {
  vec2 m = length(motion) > 0.001 ? normalize(motion) : vec2(0.707, -0.707);
  float facing = 0.5 + 0.5 * dot(n, m);
  vec3 blue = vec3(0.78, 0.90, 1.0);
  vec3 amber = vec3(0.96, 0.98, 1.0);
  vec3 white = vec3(1.0);
  vec3 chroma = mix(blue, amber, facing);
  return mix(white, chroma, 0.16 + 0.08 * isActive) * edge;
}

float radial(vec2 uv, vec2 center, float radius) {
  return 1.0 - smoothstep(0.0, radius, distance(uv, center));
}

vec3 desktopBg(vec2 p) {
  vec2 uv = p / u_resolution;
  vec3 baseA = vec3(0.913, 0.933, 0.949);
  vec3 baseB = vec3(0.796, 0.831, 0.859);
  vec3 baseC = vec3(0.91, 0.925, 0.94);
  float diagonal = clamp((uv.x + uv.y) * 0.55, 0.0, 1.0);
  vec3 color = mix(baseA, baseB, smoothstep(0.18, 0.62, diagonal));
  color = mix(color, baseC, smoothstep(0.56, 1.0, diagonal) * 0.72);

  color += vec3(0.66, 0.76, 0.82) * radial(uv, vec2(0.18, 0.14), 0.31) * 0.09;
  color += vec3(0.90, 0.94, 1.0) * radial(uv, vec2(0.90, 0.10), 0.34) * 0.07;

  vec2 grid = abs(fract((p / u_dpr) / 22.0) - 0.5);
  float line = 1.0 - smoothstep(0.0, 0.035, min(grid.x, grid.y));
  color = mix(color, vec3(1.0), line * 0.19);
  return clamp(color, 0.0, 1.0);
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y);
  vec4 outColor = vec4(0.0);

  for (int i = 0; i < MAX_WINDOWS; i++) {
    if (i >= u_count) break;
    vec4 rect = u_rects[i];
    vec2 center = rect.xy + rect.zw * 0.5;
    float d = rectSdfAt(i, p);
    float isActive = u_active[i];
    float strength = u_strength[i];
    vec2 motion = u_motion[i];
    float motionPower = clamp(length(motion) / 10.0, 0.0, 1.0);
    float innerDepth = mix(48.0, 98.0, strength);

    if (d < 18.0 && d > -innerDepth) {
      vec2 n = rectNormal(i, p);
      float edge = 1.0 - smoothstep(0.0, 30.0, abs(d));
      float inner = smoothstep(-innerDepth, -6.0, d) * (1.0 - smoothstep(-12.0, 2.0, d));
      float fresnel = pow(edge, 1.35) * (0.46 + 0.3 * isActive);
      float angle = atan(n.y, n.x) + u_time * 0.0008 + motion.x * 0.05 - motion.y * 0.035;
      float glare = pow(max(0.0, 0.5 + 0.5 * sin(angle * 2.0 - PI * 0.35)), 4.0);
      glare *= edge * (0.25 + 0.42 * isActive + 0.34 * motionPower);

      vec2 pulled = p - center - motion * 3.4;
      float causticBand = sin((pulled.x * 0.018 + pulled.y * 0.012) + u_time * 0.0016);
      float caustic = smoothstep(0.24, 1.0, causticBand) * inner * (0.08 + 0.1 * motionPower);

      float refDepth = clamp((-d) / max(1.0, u_radii[i] * 0.75), 0.0, 1.0);
      float refEdge = smoothstep(20.0, 0.0, abs(d)) * (1.0 - smoothstep(0.62, 1.0, refDepth));
      vec2 refractOffset = -n * (10.0 + 22.0 * refEdge + 10.0 * motionPower) * strength * u_dpr + motion * (0.75 + 1.2 * refEdge);
      vec3 baseBg = desktopBg(p);
      vec3 refractedBg = desktopBg(p + refractOffset);
      vec3 refraction = mix(baseBg, refractedBg, 0.86);

      vec3 color = mix(refraction, spectralEdge(n, motion, edge, isActive), 0.26);
      color += vec3(1.0) * fresnel * 0.72;
      color += vec3(0.96, 0.98, 0.98) * glare * 0.5;
      color += mix(vec3(0.74, 0.86, 0.96), vec3(0.9, 0.94, 1.0), 0.5 + 0.5 * sin(angle)) * caustic * 0.38;

      float refractionAlpha = refEdge * (0.22 + 0.09 * isActive + 0.09 * motionPower);
      float alpha = (refractionAlpha + edge * (0.08 + 0.06 * isActive + 0.06 * motionPower) + glare * 0.12 + caustic * 0.42) * strength;
      alpha = clamp(alpha, 0.0, 0.36);
      outColor = mix(outColor, vec4(color, alpha), alpha);
    }
  }

  fragColor = outColor;
}`;

  let canvas = null;
  let ctx = null;
  let glState = null;
  let rafId = 0;
  let lastFrame = 0;
  let resizeObserver = null;
  let mutationObserver = null;
  let enabled = false;
  let needsFrame = true;
  let renderer = "2d";
  let dpr = 1;
  const motionState = new WeakMap();

  function makeCanvas() {
    const nextCanvas = document.createElement("canvas");
    nextCanvas.id = OVERLAY_ID;
    nextCanvas.setAttribute("aria-hidden", "true");
    nextCanvas.hidden = true;
    nextCanvas.style.zIndex = getComputedStyle(document.documentElement).getPropertyValue("--z-liquid-glass-overlay").trim() || "8992";
    document.body.append(nextCanvas);
    return nextCanvas;
  }

  function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Could not create liquid glass shader.");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader) || "Unknown liquid glass shader compile failure.";
      gl.deleteShader(shader);
      throw new Error(message);
    }
    return shader;
  }

  function createProgram(gl) {
    const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram();
    if (!program) throw new Error("Could not create liquid glass program.");
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(program) || "Unknown liquid glass program link failure.";
      gl.deleteProgram(program);
      throw new Error(message);
    }
    return program;
  }

  function initWebGl() {
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: true,
      depth: false,
      premultipliedAlpha: true,
      stencil: false,
    });
    if (!gl) return null;

    const program = createProgram(gl);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    const position = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    return {
      gl,
      program,
      buffer,
      uniforms: {
        resolution: gl.getUniformLocation(program, "u_resolution"),
        time: gl.getUniformLocation(program, "u_time"),
        count: gl.getUniformLocation(program, "u_count"),
        rects: gl.getUniformLocation(program, "u_rects[0]"),
        radii: gl.getUniformLocation(program, "u_radii[0]"),
        motion: gl.getUniformLocation(program, "u_motion[0]"),
        active: gl.getUniformLocation(program, "u_active[0]"),
        strength: gl.getUniformLocation(program, "u_strength[0]"),
        dpr: gl.getUniformLocation(program, "u_dpr"),
      },
    };
  }

  function ensureCanvas() {
    if (canvas) return canvas;
    canvas = makeCanvas();
    try {
      glState = initWebGl();
      renderer = glState ? "webgl" : "2d";
    } catch (error) {
      console.warn("Liquid Glass WebGL overlay unavailable; falling back to 2D canvas.", error);
      canvas.remove();
      canvas = makeCanvas();
      glState = null;
      renderer = "2d";
    }
    if (renderer === "2d") {
      ctx = canvas.getContext("2d", { alpha: true });
    }
    return canvas;
  }

  function resizeCanvas() {
    if (!canvas) return;
    dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    const width = Math.max(1, Math.round(window.innerWidth * dpr));
    const height = Math.max(1, Math.round(window.innerHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      canvas.style.setProperty("--liquid-glass-overlay-dpr", String(dpr));
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (glState) glState.gl.viewport(0, 0, width, height);
    }
    needsFrame = true;
  }

  function visibleGlassWindows() {
    return [...document.querySelectorAll(".window, .system-modal, .startup-settings-modal, .finder-operation-modal")]
      .filter((node) => {
        if (!(node instanceof HTMLElement)) return false;
        if (node.classList.contains("is-hidden") || node.classList.contains("is-app-hidden")) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 24 && rect.height > 24 && rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
      })
      .sort((a, b) => {
        const az = Number.parseInt(getComputedStyle(a).zIndex, 10) || 0;
        const bz = Number.parseInt(getComputedStyle(b).zIndex, 10) || 0;
        return az - bz;
      })
      .slice(-MAX_WINDOWS);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function sampleMotion(node, rect, time) {
    const previous = motionState.get(node);
    if (!previous) {
      const motion = { x: 0, y: 0 };
      motionState.set(node, { left: rect.left, top: rect.top, time, motion });
      return motion;
    }

    const dt = Math.max(16, time - previous.time);
    const targetX = clamp(((rect.left - previous.left) / dt) * 16, -MAX_MOTION_SHIFT, MAX_MOTION_SHIFT);
    const targetY = clamp(((rect.top - previous.top) / dt) * 16, -MAX_MOTION_SHIFT, MAX_MOTION_SHIFT);
    let nextX = previous.motion.x * MOTION_DECAY + targetX * MOTION_BLEND;
    let nextY = previous.motion.y * MOTION_DECAY + targetY * MOTION_BLEND;

    if (Math.abs(targetX) < MOTION_EPSILON) nextX *= MOTION_DECAY;
    if (Math.abs(targetY) < MOTION_EPSILON) nextY *= MOTION_DECAY;
    if (Math.abs(nextX) < MOTION_EPSILON) nextX = 0;
    if (Math.abs(nextY) < MOTION_EPSILON) nextY = 0;

    const motion = {
      x: clamp(nextX, -MAX_MOTION_SHIFT, MAX_MOTION_SHIFT),
      y: clamp(nextY, -MAX_MOTION_SHIFT, MAX_MOTION_SHIFT),
    };
    motionState.set(node, { left: rect.left, top: rect.top, time, motion });
    return motion;
  }

  function glassStrength(node, rect) {
    if (node.matches(".system-modal, .startup-settings-modal, .finder-operation-modal")) return 0.72;
    const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
    const areaRatio = (rect.width * rect.height) / viewportArea;
    if (areaRatio > 0.28) return 0.3;
    if (areaRatio > 0.16) return 0.4;
    if (areaRatio > 0.08) return 0.52;
    return 0.66;
  }

  function windowFrame(node, time) {
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    const radius = Number.parseFloat(style.borderTopLeftRadius) || 18;
    const active = node.classList.contains("is-active") || node.matches(".system-modal, .startup-settings-modal, .finder-operation-modal");
    const motion = sampleMotion(node, rect, time);
    const strength = glassStrength(node, rect);
    return { node, rect, radius, active, motion, strength };
  }

  function renderWebGl(frames, time) {
    const { gl, program, uniforms } = glState;
    const rects = new Float32Array(MAX_WINDOWS * 4);
    const radii = new Float32Array(MAX_WINDOWS);
    const motion = new Float32Array(MAX_WINDOWS * 2);
    const active = new Float32Array(MAX_WINDOWS);
    const strength = new Float32Array(MAX_WINDOWS);
    let moving = false;

    frames.forEach((frame, index) => {
      const offset = index * 4;
      rects[offset] = frame.rect.left * dpr;
      rects[offset + 1] = frame.rect.top * dpr;
      rects[offset + 2] = frame.rect.width * dpr;
      rects[offset + 3] = frame.rect.height * dpr;
      radii[index] = frame.radius * dpr;
      motion[index * 2] = frame.motion.x * dpr;
      motion[index * 2 + 1] = frame.motion.y * dpr;
      active[index] = frame.active ? 1 : 0;
      strength[index] = frame.strength;
      moving = moving || Math.hypot(frame.motion.x, frame.motion.y) > MOTION_EPSILON;
    });

    gl.useProgram(program);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
    gl.uniform1f(uniforms.time, time);
    gl.uniform1i(uniforms.count, frames.length);
    gl.uniform4fv(uniforms.rects, rects);
    gl.uniform1fv(uniforms.radii, radii);
    gl.uniform2fv(uniforms.motion, motion);
    gl.uniform1fv(uniforms.active, active);
    gl.uniform1fv(uniforms.strength, strength);
    gl.uniform1f(uniforms.dpr, dpr);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return moving;
  }

  function roundRectPath(rect, radius) {
    const r = Math.max(8, Math.min(radius || 18, rect.width / 2, rect.height / 2));
    ctx.beginPath();
    ctx.moveTo(rect.left + r, rect.top);
    ctx.lineTo(rect.right - r, rect.top);
    ctx.quadraticCurveTo(rect.right, rect.top, rect.right, rect.top + r);
    ctx.lineTo(rect.right, rect.bottom - r);
    ctx.quadraticCurveTo(rect.right, rect.bottom, rect.right - r, rect.bottom);
    ctx.lineTo(rect.left + r, rect.bottom);
    ctx.quadraticCurveTo(rect.left, rect.bottom, rect.left, rect.bottom - r);
    ctx.lineTo(rect.left, rect.top + r);
    ctx.quadraticCurveTo(rect.left, rect.top, rect.left + r, rect.top);
    ctx.closePath();
  }

  function drawWindow2d(frame) {
    const { rect, radius, active, motion, strength } = frame;
    const alpha = (active ? 1 : 0.56) * strength;
    const motionPower = Math.min(1, Math.hypot(motion.x, motion.y) / MAX_MOTION_SHIFT);
    const shiftX = motion.x * 1.6;
    const shiftY = motion.y * 1.6;

    ctx.save();
    roundRectPath(rect, radius);
    ctx.clip();

    const diagonal = ctx.createLinearGradient(rect.left, rect.top, rect.right, rect.bottom);
    diagonal.addColorStop(0, `rgba(255, 255, 255, ${0.28 * alpha})`);
    diagonal.addColorStop(0.34, "rgba(255, 255, 255, 0)");
    diagonal.addColorStop(0.64, "rgba(255, 255, 255, 0)");
    diagonal.addColorStop(1, `rgba(16, 17, 20, ${0.1 * alpha})`);
    ctx.fillStyle = diagonal;
    ctx.fillRect(rect.left, rect.top, rect.width, rect.height);

    const caustic = ctx.createRadialGradient(
      rect.left + rect.width * 0.2 + shiftX * 2,
      rect.top + rect.height * 0.16 + shiftY,
      0,
      rect.left + rect.width * 0.24 + shiftX * 2,
      rect.top + rect.height * 0.18 + shiftY,
      Math.max(rect.width, rect.height) * 0.7,
    );
    caustic.addColorStop(0, `rgba(255, 255, 255, ${0.18 * alpha + 0.16 * motionPower})`);
    caustic.addColorStop(0.34, `rgba(220, 234, 244, ${0.05 * alpha + 0.06 * motionPower})`);
    caustic.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = caustic;
    ctx.fillRect(rect.left, rect.top, rect.width, rect.height);

    const chroma = ctx.createLinearGradient(rect.left - shiftX, rect.top - shiftY, rect.right + shiftX, rect.top + shiftY);
    chroma.addColorStop(0, `rgba(229, 236, 242, ${0.1 * alpha + 0.08 * motionPower})`);
    chroma.addColorStop(0.5, "rgba(255, 255, 255, 0)");
    chroma.addColorStop(1, `rgba(238, 242, 246, ${0.08 * alpha + 0.06 * motionPower})`);
    ctx.strokeStyle = chroma;
    ctx.lineWidth = active ? 2 + motionPower : 1;
    roundRectPath({
      left: rect.left + 1.5,
      top: rect.top + 1.5,
      right: rect.right - 1.5,
      bottom: rect.bottom - 1.5,
      width: rect.width - 3,
      height: rect.height - 3,
    }, Math.max(8, radius - 1.5));
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.shadowColor = `rgba(255, 255, 255, ${0.38 * alpha})`;
    ctx.shadowBlur = active ? 9 : 5;
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.32 * alpha})`;
    ctx.lineWidth = 1;
    roundRectPath({
      left: rect.left + 0.5,
      top: rect.top + 0.5,
      right: rect.right - 0.5,
      bottom: rect.bottom - 0.5,
      width: rect.width - 1,
      height: rect.height - 1,
    }, Math.max(8, radius - 0.5));
    ctx.stroke();
    ctx.restore();
    return motionPower > MOTION_EPSILON;
  }

  function drawMenuBar2d() {
    const menuBar = document.querySelector(".menu-bar");
    if (!(menuBar instanceof HTMLElement) || menuBar.offsetParent === null) return;
    const rect = menuBar.getBoundingClientRect();
    const glow = ctx.createLinearGradient(rect.left, rect.top, rect.right, rect.top);
    glow.addColorStop(0, "rgba(229, 236, 242, 0.1)");
    glow.addColorStop(0.45, "rgba(255, 255, 255, 0.12)");
    glow.addColorStop(1, "rgba(238, 242, 246, 0.1)");
    ctx.fillStyle = glow;
    ctx.fillRect(rect.left, rect.bottom - 1, rect.width, 1);
  }

  function render2d(frames) {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    drawMenuBar2d();
    let moving = false;
    frames.forEach((frame) => {
      moving = drawWindow2d(frame) || moving;
    });
    return moving;
  }

  function render(time = 0) {
    if (!enabled || !canvas) return;
    rafId = window.requestAnimationFrame(render);
    if (!needsFrame && time - lastFrame < FRAME_MS) return;
    lastFrame = time;
    needsFrame = false;
    resizeCanvas();
    const frames = visibleGlassWindows().map((node) => windowFrame(node, time));
    const moving = renderer === "webgl" && glState ? renderWebGl(frames, time) : render2d(frames);
    if (moving) needsFrame = true;
  }

  function requestFrame() {
    needsFrame = true;
  }

  function observe() {
    if (!resizeObserver) {
      resizeObserver = new ResizeObserver(requestFrame);
    }
    visibleGlassWindows().forEach((node) => resizeObserver.observe(node));

    if (!mutationObserver) {
      mutationObserver = new MutationObserver(requestFrame);
      mutationObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ["class", "style"],
        childList: true,
        subtree: true,
      });
    }
    window.addEventListener("resize", requestFrame);
    window.addEventListener("scroll", requestFrame, true);
  }

  function disconnect() {
    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
    mutationObserver = null;
    window.removeEventListener("resize", requestFrame);
    window.removeEventListener("scroll", requestFrame, true);
  }

  function clearCanvas() {
    if (glState) {
      glState.gl.clearColor(0, 0, 0, 0);
      glState.gl.clear(glState.gl.COLOR_BUFFER_BIT);
    } else {
      ctx?.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
  }

  function setEnabled(nextEnabled) {
    ensureCanvas();
    enabled = !!nextEnabled && document.body.classList.contains("use-liquid-glass");
    canvas.hidden = !enabled;
    if (enabled) {
      resizeCanvas();
      observe();
      if (!rafId) rafId = window.requestAnimationFrame(render);
      requestFrame();
    } else {
      disconnect();
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
      clearCanvas();
    }
  }

  window.AISystem6LiquidGlassOverlay = {
    refresh: requestFrame,
    setEnabled,
  };
})();
