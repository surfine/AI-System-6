// Feature module: Liquid Cover / 玻璃封面 — turn any text into Apple-style
// Liquid Glass, composited between a background image and a foreground subject,
// and export a PNG cover (16:9 / 4:3 / 3:4 for B站 / 抖音).
//
// Lazy-loaded as a classic script (see config.js ensureLiquidCoverModule).
// Self-contained WebGL2 renderer ported from the liquid-glass-text prototype:
//   text -> Canvas2D coverage mask -> exact signed distance field (R32F) ->
//   glass optics (Snell refraction, dispersion, Fresnel, glare) sampling the
//   SDF instead of an analytic shape. Up to 4 text/shape layers (per-layer
//   glass/solid style, tint + thickness via min-union with argmin);
//   movable/scalable foreground subject.

window.AISystem6LiquidCoverLoaded = true;

(function () {
  "use strict";

  const MAX_LAYERS = 4;
  const INF = 1e20;

  // ------------------------------------------------------------------
  // 1) Text -> exact signed distance field (Felzenszwalb EDT, tiny-sdf core)
  // ------------------------------------------------------------------
  function edt1d(grid, offset, stride, length, f, v, z) {
    v[0] = 0; z[0] = -INF; z[1] = INF; f[0] = grid[offset];
    for (let q = 1, k = 0; q < length; q++) {
      f[q] = grid[offset + q * stride];
      const q2 = q * q;
      let s;
      do { const r = v[k]; s = (f[q] - f[r] + q2 - r * r) / (q - r) / 2; } while (s <= z[k] && --k > -1);
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    for (let q = 0, k = 0; q < length; q++) {
      while (z[k + 1] < q) k++;
      const r = v[k];
      grid[offset + q * stride] = f[r] + (q - r) * (q - r);
    }
  }
  function edt(data, width, height, f, v, z) {
    for (let x = 0; x < width; x++) edt1d(data, x, width, height, f, v, z);
    for (let y = 0; y < height; y++) edt1d(data, y * width, 1, width, f, v, z);
  }
  function alphaToSignedDistance(alpha, width, height, flipY) {
    const size = width * height;
    const gridOuter = new Float64Array(size);
    const gridInner = new Float64Array(size);
    for (let i = 0; i < size; i++) {
      const a = alpha[i] / 255;
      if (a === 1) { gridOuter[i] = 0; gridInner[i] = INF; }
      else if (a === 0) { gridOuter[i] = INF; gridInner[i] = 0; }
      else { const d = Math.max(0, 0.5 - a); gridOuter[i] = d * d; const e = Math.max(0, a - 0.5); gridInner[i] = e * e; }
    }
    const max = Math.max(width, height);
    const f = new Float64Array(max);
    const v = new Int32Array(max);
    const z = new Float64Array(max + 1);
    edt(gridOuter, width, height, f, v, z);
    edt(gridInner, width, height, f, v, z);
    const out = new Float32Array(size);
    let mostInterior = 0; // most-negative SDF value = -(stroke half-width), in px
    for (let y = 0; y < height; y++) {
      const srcRow = y * width;
      const dstRow = (flipY ? height - 1 - y : y) * width;
      for (let x = 0; x < width; x++) {
        const v = Math.sqrt(gridOuter[srcRow + x]) - Math.sqrt(gridInner[srcRow + x]);
        out[dstRow + x] = v;
        if (v < mostInterior) mostInterior = v;
      }
    }
    // The thickest stroke's half-width (px). Used to keep glass thickness relative
    // to the actual letterform so a fixed slider value never overflows a thin
    // stroke (the #1 "thickness 翻车"). Stashed on the array for the caller.
    out.maxInteriorPx = -mostInterior;
    return out;
  }
  function rasterizeText(opts) {
    const canvas = document.createElement("canvas");
    canvas.width = opts.width; canvas.height = opts.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.clearRect(0, 0, opts.width, opts.height);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = (opts.fontWeight || 700) + " " + opts.fontSize + "px " + (opts.fontFamily || "sans-serif");
    if ("letterSpacing" in ctx) ctx.letterSpacing = (opts.letterSpacing || 0) + "px";
    const lines = String(opts.text).split("\n");
    const lh = opts.fontSize * (opts.lineHeight || 1.1);
    const startY = -(lh * lines.length) / 2 + lh / 2;
    ctx.save();
    ctx.translate(opts.width / 2, opts.height / 2);
    ctx.rotate(((opts.rotationDeg || 0) * Math.PI) / 180);
    lines.forEach((line, i) => ctx.fillText(line, 0, startY + i * lh));
    ctx.restore();
    const img = ctx.getImageData(0, 0, opts.width, opts.height);
    const alpha = new Uint8Array(opts.width * opts.height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = img.data[i * 4 + 3];
    return { alpha, width: opts.width, height: opts.height };
  }
  // Any image becomes glass: the alpha channel is the shape mask, fed into the
  // same EDT -> SDF -> shader pipeline as text. Flat images with no usable
  // alpha (a JPEG logo on white paper) fall back to a luminance mask, so a
  // dark-on-light logo works without preparation.
  // Built-in shapes are drawn as vector paths at the target resolution on every
  // rebuild — no bitmap rescale, so the mask edge stays crisp at any export size.
  // "squircle" is the Apple-icon superellipse (|x|^n + |y|^n = 1, n = 5), the
  // same family liquid-glass-studio uses for its demo shapes.
  function traceBuiltinShape(ctx, kind, h) {
    ctx.beginPath();
    if (kind === "circle") {
      ctx.arc(0, 0, h / 2, 0, Math.PI * 2);
    } else if (kind === "capsule") {
      const w = h * 1.9;
      ctx.roundRect(-w / 2, -h / 2, w, h, h / 2);
    } else { // squircle
      const n = 5, a = h / 2, SEG = 180;
      for (let i = 0; i <= SEG; i++) {
        const t = (i / SEG) * Math.PI * 2;
        const ct = Math.cos(t), st = Math.sin(t);
        const x = Math.sign(ct) * Math.pow(Math.abs(ct), 2 / n) * a;
        const y = Math.sign(st) * Math.pow(Math.abs(st), 2 / n) * a;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
  }
  function rasterizeShape(opts) {
    const c = document.createElement("canvas");
    c.width = opts.width; c.height = opts.height;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.save();
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate(((opts.rotationDeg || 0) * Math.PI) / 180);
    if (opts.kind) {
      ctx.fillStyle = "#fff";
      traceBuiltinShape(ctx, opts.kind, opts.sizePx);
      ctx.fill();
    } else {
      const iw = opts.image.naturalWidth || opts.image.width || 1;
      const ih = opts.image.naturalHeight || opts.image.height || 1;
      const s = opts.sizePx / Math.max(1, ih);
      ctx.drawImage(opts.image, (-iw * s) / 2, (-ih * s) / 2, iw * s, ih * s);
    }
    ctx.restore();
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const alpha = new Uint8Array(c.width * c.height);
    let minDrawnAlpha = 255;
    for (let i = 0; i < alpha.length; i++) {
      const a = img.data[i * 4 + 3];
      alpha[i] = a;
      if (a > 0 && a < minDrawnAlpha) minDrawnAlpha = a;
    }
    if (!opts.kind && minDrawnAlpha >= 250) {
      // opaque rectangle — no alpha information; dark pixels are the shape,
      // with a soft luminance ramp so the EDT still sees an anti-aliased edge
      // (built-in shapes never take this path: their alpha IS the mask)
      for (let i = 0; i < alpha.length; i++) {
        if (alpha[i] === 0) continue;
        const lum = 0.2126 * img.data[i * 4] + 0.7152 * img.data[i * 4 + 1] + 0.0722 * img.data[i * 4 + 2];
        alpha[i] = lum <= 140 ? 255 : lum >= 200 ? 0 : Math.round(((200 - lum) / 60) * 255);
      }
    }
    return { alpha, width: c.width, height: c.height };
  }
  function gaussianWeights(radius) {
    const sigma = Math.max(radius / 3, 0.0001);
    const w = []; let sum = 0;
    for (let i = 0; i <= radius; i++) { const val = Math.exp((-0.5 * (i * i)) / (sigma * sigma)); w.push(val); sum += i === 0 ? val : val * 2; }
    return w.map((x) => x / sum);
  }

  // ------------------------------------------------------------------
  // 2) WebGL2 multi-pass renderer
  // ------------------------------------------------------------------
  const VERT = "#version 300 es\nin vec2 a_position;\nout vec2 v_uv;\nvoid main(){ v_uv = a_position*0.5+0.5; gl_Position=vec4(a_position,0.0,1.0); }";

  const UNION_SD = "\nuniform sampler2D u_sdf[4];\nuniform vec2 u_sdfOffset[4];\nuniform float u_sdfScale[4];\nuniform int u_layerCount;\nvec2 layerUv0(vec2 uv){ float s=max(u_sdfScale[0],0.001); vec2 c=vec2(0.5)+u_sdfOffset[0]; return (uv-c)/s+vec2(0.5); }\nvec2 layerUv1(vec2 uv){ float s=max(u_sdfScale[1],0.001); vec2 c=vec2(0.5)+u_sdfOffset[1]; return (uv-c)/s+vec2(0.5); }\nvec2 layerUv2(vec2 uv){ float s=max(u_sdfScale[2],0.001); vec2 c=vec2(0.5)+u_sdfOffset[2]; return (uv-c)/s+vec2(0.5); }\nvec2 layerUv3(vec2 uv){ float s=max(u_sdfScale[3],0.001); vec2 c=vec2(0.5)+u_sdfOffset[3]; return (uv-c)/s+vec2(0.5); }\nfloat layerSD0(vec2 uv){ return texture(u_sdf[0], layerUv0(uv)).r*max(u_sdfScale[0],0.001); }\nfloat layerSD1(vec2 uv){ return texture(u_sdf[1], layerUv1(uv)).r*max(u_sdfScale[1],0.001); }\nfloat layerSD2(vec2 uv){ return texture(u_sdf[2], layerUv2(uv)).r*max(u_sdfScale[2],0.001); }\nfloat layerSD3(vec2 uv){ return texture(u_sdf[3], layerUv3(uv)).r*max(u_sdfScale[3],0.001); }\nfloat unionSDIdx(vec2 uv, out int idx){\n  float d = layerSD0(uv); idx = 0;\n  if (u_layerCount > 1) { float v = layerSD1(uv); if (v < d) { d = v; idx = 1; } }\n  if (u_layerCount > 2) { float v = layerSD2(uv); if (v < d) { d = v; idx = 2; } }\n  if (u_layerCount > 3) { float v = layerSD3(uv); if (v < d) { d = v; idx = 3; } }\n  return d;\n}\nfloat unionSD(vec2 uv){ int i; return unionSDIdx(uv, i); }";

  const BG_FRAG = "#version 300 es\nprecision highp float;\nin vec2 v_uv;\nout vec4 fragColor;\nuniform sampler2D u_image;\nuniform vec2 u_resolution;\nuniform float u_dpr;\nuniform float u_imageAspect;\nuniform float u_shadowExpand;\nuniform float u_shadowFactor;\nuniform vec2 u_shadowOffset;\nuniform float u_bgZoom;\nuniform vec2 u_bgPan;\n" + UNION_SD + "\nvec2 cover(vec2 uv, float ca, float ta){ if (ca>ta){ float s=ta/ca; uv.y=uv.y*s+0.5-0.5*s; } else { float s=ca/ta; uv.x=uv.x*s+0.5-0.5*s; } return uv; }\nvoid main(){\n  vec2 uv = cover(v_uv, u_resolution.x/u_resolution.y, u_imageAspect);\n  uv = (uv - 0.5) / max(u_bgZoom, 0.001) + 0.5 + u_bgPan;\n  vec3 col = texture(u_image, uv).rgb;\n  vec2 off = u_shadowOffset * u_dpr / u_resolution;\n  float sd = unionSD(v_uv - off) / u_dpr;\n  float shadow = exp(-1.0/u_shadowExpand * abs(sd)) * 0.6 * u_shadowFactor;\n  col -= vec3(shadow);\n  fragColor = vec4(col, 1.0);\n}";

  const BLUR_FRAG = "#version 300 es\nprecision highp float;\n#define MAX_R 96\nin vec2 v_uv;\nout vec4 fragColor;\nuniform sampler2D u_tex;\nuniform vec2 u_resolution;\nuniform vec2 u_dir;\nuniform int u_radius;\nuniform float u_weights[MAX_R + 1];\nvoid main(){\n  vec2 texel = 1.0/u_resolution;\n  vec4 c = texture(u_tex, v_uv) * u_weights[0];\n  for (int i=1;i<=MAX_R;i++){ if (i>u_radius) break; vec2 o = u_dir*texel*float(i); c += texture(u_tex, v_uv+o)*u_weights[i]; c += texture(u_tex, v_uv-o)*u_weights[i]; }\n  fragColor = c;\n}";

  const MAIN_FRAG = "#version 300 es\nprecision highp float;\n#define PI 3.14159265359\nconst float N_R=0.98; const float N_G=1.0; const float N_B=1.02;\nin vec2 v_uv;\nout vec4 fragColor;\nuniform sampler2D u_bg;\nuniform sampler2D u_blurredBg;\nuniform vec2 u_resolution;\nuniform float u_dpr;\nuniform float u_baseDpr;\nuniform float u_lensMag;\nuniform float u_refThickness[4];\nuniform float u_refFactor;\nuniform float u_refDispersion;\nuniform float u_refFresnelRange;\nuniform float u_refFresnelHardness;\nuniform float u_refFresnelFactor;\nuniform float u_glareRange;\nuniform float u_glareHardness;\nuniform float u_glareFactor;\nuniform float u_glareConvergence;\nuniform float u_glareOppositeFactor;\nuniform float u_glareAngle;\nuniform float u_bodyFactor;\nuniform float u_rimFactor;\nuniform float u_rimWidth;\nuniform float u_bevelFactor;\nuniform float u_saturationFactor;\nuniform vec4 u_tint[4];\nuniform int u_layerMode[4];\nuniform int u_blurEdge;\nuniform sampler2D u_fg;\nuniform float u_fgAspect;\nuniform int u_hasFg;\nuniform vec2 u_fgPos;\nuniform float u_fgScale;\nuniform int u_liquidOverlayMode;\nuniform float u_liquidOverlayAmount;\nuniform float u_liquidOverlayPhase;\nuniform vec3 u_liquidOverlayTint;\n" + UNION_SD + "\n"
    + "const vec3 D65=vec3(0.95045592705,1.0,1.08905775076);\n"
    + "const mat3 RGB2XYZ=mat3(0.4124,0.3576,0.1805,0.2126,0.7152,0.0722,0.0193,0.1192,0.9505);\n"
    + "const mat3 XYZ2RGB=mat3(3.2406255,-1.537208,-0.4986286,-0.9689307,1.8757561,0.0415175,0.0557101,-0.2040211,1.0569959);\n"
    + "float unc(float a){ return a>0.04045?pow((a+0.055)/1.055,2.4):a/12.92; }\n"
    + "float cmp(float a){ return a<=0.0031308?12.92*a:1.055*pow(a,0.41666666666)-0.055; }\n"
    + "vec3 s2rgb(vec3 c){ return vec3(unc(c.x),unc(c.y),unc(c.z)); }\n"
    + "vec3 rgb2s(vec3 c){ return vec3(cmp(c.x),cmp(c.y),cmp(c.z)); }\n"
    + "vec3 s2xyz(vec3 c){ return s2rgb(c)*RGB2XYZ; }\n"
    + "vec3 xyz2s(vec3 c){ return rgb2s(c*XYZ2RGB); }\n"
    + "float f1(float x){ return x>0.00885645167?pow(x,0.333333333):7.78703703704*x+0.13793103448; }\n"
    + "vec3 xyz2lab(vec3 xyz){ vec3 s=xyz/D65; s=vec3(f1(s.x),f1(s.y),f1(s.z)); return vec3(116.0*s.y-16.0,500.0*(s.x-s.y),200.0*(s.y-s.z)); }\n"
    + "float f2(float x){ return x>0.206897?x*x*x:0.12841854934*(x-0.137931034); }\n"
    + "vec3 lab2xyz(vec3 l){ float w=(l.x+16.0)/116.0; return D65*vec3(f2(w+l.y/500.0),f2(w),f2(w-l.z/200.0)); }\n"
    + "vec3 s2lch(vec3 c){ vec3 lab=xyz2lab(s2xyz(c)); return vec3(lab.x,sqrt(dot(lab.yz,lab.yz)),atan(lab.z,lab.y)*57.2957795131); }\n"
    + "vec3 lch2s(vec3 lch){ vec3 lab=vec3(lch.x,lch.y*cos(lch.z*0.01745329251),lch.y*sin(lch.z*0.01745329251)); return xyz2s(lab2xyz(lab)); }\n"
    // Sobel (3x3) gradient over the linear-filtered SDF. The wider, weighted
    // stencil low-passes the normal direction so the angle-sensitive glare no
    // longer rings (the ribbed/corrugated edge). Normalized to keep |grad|~2 in
    // smooth regions so nlen still saturates to 1 and only drops at the skeleton.
    + "vec2 getGrad(vec2 uv){ vec2 t=1.5/u_resolution; float tl=unionSD(uv+vec2(-t.x,t.y)); float tc=unionSD(uv+vec2(0.0,t.y)); float tr=unionSD(uv+vec2(t.x,t.y)); float ml=unionSD(uv+vec2(-t.x,0.0)); float mr=unionSD(uv+vec2(t.x,0.0)); float bl=unionSD(uv+vec2(-t.x,-t.y)); float bc=unionSD(uv+vec2(0.0,-t.y)); float br=unionSD(uv+vec2(t.x,-t.y)); float gx=(tr+2.0*mr+br)-(tl+2.0*ml+bl); float gy=(tl+2.0*tc+tr)-(bl+2.0*bc+br); return vec2(gx,gy)*0.16667; }\n"
    + "float a2(vec2 v){ float a=atan(v.y,v.x); if(a<0.0)a+=2.0*PI; return a; }\n"
    + "vec4 disp(vec2 base, float mr, vec2 off, float fa){ vec4 p=vec4(1.0); float ar=texture(u_bg,base+off*(1.0-(N_R-1.0)*fa)).r; float ag=texture(u_bg,base+off*(1.0-(N_G-1.0)*fa)).g; float ab=texture(u_bg,base+off*(1.0-(N_B-1.0)*fa)).b; float br=texture(u_blurredBg,base+off*(1.0-(N_R-1.0)*fa)).r; float bg=texture(u_blurredBg,base+off*(1.0-(N_G-1.0)*fa)).g; float bb=texture(u_blurredBg,base+off*(1.0-(N_B-1.0)*fa)).b; p.r=mix(ar,br,mr); p.g=mix(ag,bg,mr); p.b=mix(ab,bb,mr); return p; }\n"
    + "float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }\n"
    + "vec2 hash22(vec2 p){ return fract(sin(vec2(dot(p, vec2(269.5, 183.3)), dot(p, vec2(113.5, 271.9)))) * 43758.5453123); }\n"
    + "vec4 glassDrop(vec4 base, vec2 center, vec2 radii, float alpha, vec3 tint, float refractScale){\n"
    + "  vec2 aspect = vec2(u_resolution.x/u_resolution.y, 1.0); vec2 d = (v_uv - center) * aspect; vec2 q = d / max(radii, vec2(0.0001)); float dist = length(q);\n"
    + "  float mask = (1.0 - smoothstep(0.985, 1.045, dist)) * alpha; if (mask <= 0.0001) return base;\n"
    + "  vec2 n = dist > 0.00001 ? normalize(d) : vec2(0.0, 1.0); vec2 uvOff = n * min(radii.x, radii.y) * refractScale / aspect;\n"
    + "  vec3 refr = texture(u_bg, clamp(v_uv - uvOff * 1.18, vec2(0.0), vec2(1.0))).rgb;\n"
    + "  vec3 blur = texture(u_blurredBg, clamp(v_uv + uvOff * 0.42, vec2(0.0), vec2(1.0))).rgb;\n"
    + "  float rim = smoothstep(0.66, 1.0, dist) * mask; float edge = (1.0 - smoothstep(0.94, 1.035, abs(dist - 0.985))) * mask;\n"
    + "  float shade = smoothstep(-0.25, 0.92, dot(n, normalize(vec2(0.42, -0.90)))) * mask;\n"
    + "  vec2 hi = (v_uv - (center + vec2(-radii.x * 0.24 / aspect.x, radii.y * 0.32))) * aspect / max(radii * 0.24, vec2(0.0001));\n"
    + "  float spec = pow(1.0 - smoothstep(0.0, 1.0, length(hi)), 1.7) * mask;\n"
    + "  vec3 col = mix(blur, refr, 0.70); col = mix(col, tint, 0.07); col *= 1.0 - shade * 0.34; col = mix(col, vec3(1.0), clamp(edge * 0.92 + rim * 0.30 + spec, 0.0, 1.0));\n"
    + "  return vec4(mix(base.rgb, col, clamp(mask * 0.94, 0.0, 1.0)), 1.0);\n"
    + "}\n"
    + "vec4 glassBead(vec4 base, vec2 center, float radius, float alpha, vec3 tint){ return glassDrop(base, center, vec2(radius), alpha, tint, 0.90); }\n"
    + "vec4 glassBubble(vec4 base, vec2 center, float radius, float alpha, vec3 tint){\n"
    + "  vec2 aspect = vec2(u_resolution.x/u_resolution.y, 1.0); vec2 d = (v_uv - center) * aspect; float angle = atan(d.y, d.x); float wobble = 1.0 + 0.020 * sin(angle * 3.0 + center.x * 31.0) + 0.016 * sin(angle * 7.0 + center.y * 47.0); float dist = length(d / max(radius, 0.0001)) * wobble;\n"
    + "  float body = (1.0 - smoothstep(0.985, 1.045, dist)) * alpha; if (body <= 0.0001) return base;\n"
    + "  vec2 n = dist > 0.00001 ? normalize(d) : vec2(0.0, 1.0); vec3 refr = texture(u_bg, clamp(v_uv - n * radius * 1.05 / aspect, vec2(0.0), vec2(1.0))).rgb;\n"
    + "  vec3 blur = texture(u_blurredBg, clamp(v_uv + n * radius * 0.25 / aspect, vec2(0.0), vec2(1.0))).rgb;\n"
    + "  float rim = smoothstep(0.72, 1.0, dist) * body; float hard = (1.0 - smoothstep(0.0, 0.050, abs(dist - 0.98))) * body;\n"
    + "  float cavity = (1.0 - smoothstep(0.0, 0.58, dist)) * body; float shade = smoothstep(-0.25, 0.85, dot(n, normalize(vec2(0.50, -0.86)))) * body;\n"
    + "  vec2 hiA = (v_uv - (center + vec2(-radius * 0.25 / aspect.x, radius * 0.36))) * aspect / max(radius * 0.20, 0.0001);\n"
    + "  vec2 hiB = (v_uv - (center + vec2(radius * 0.28 / aspect.x, -radius * 0.26))) * aspect / max(radius * 0.13, 0.0001);\n"
    + "  float spec = (pow(1.0 - smoothstep(0.0, 1.0, length(hiA)), 1.4) + pow(1.0 - smoothstep(0.0, 1.0, length(hiB)), 1.6) * 0.50) * body;\n"
    + "  vec3 col = mix(blur, refr, 0.72); col = mix(col, tint, body * 0.05); col *= 1.0 - shade * 0.36 - cavity * 0.12; col = mix(col, vec3(1.0), clamp(hard * 0.86 + rim * 0.28 + spec, 0.0, 1.0));\n"
    + "  return vec4(mix(base.rgb, col, clamp(body * 0.96, 0.0, 1.0)), 1.0);\n"
    + "}\n"
    + "vec4 stagedBackground(vec4 rawBg){\n"
    + "  if (u_liquidOverlayMode == 3) { vec3 blur = texture(u_blurredBg, v_uv).rgb; vec2 p = v_uv - 0.5; float vignette = smoothstep(0.18, 0.82, length(p * vec2(1.25, 1.0))); float top = smoothstep(0.36, 1.0, v_uv.y); vec3 warmA = vec3(1.0, 0.42, 0.18) * pow(max(0.0, 1.0 - length((v_uv - vec2(0.76, 0.76)) * vec2(2.0, 1.7))), 5.0); vec3 warmB = vec3(1.0, 0.68, 0.48) * pow(max(0.0, 1.0 - length((v_uv - vec2(0.45, 0.44)) * vec2(2.4, 2.0))), 6.0); float bokeh = pow(max(0.0, 1.0 - length((v_uv - vec2(0.84, 0.58)) * vec2(11.0, 11.0))), 2.5) + pow(max(0.0, 1.0 - length((v_uv - vec2(0.18, 0.72)) * vec2(13.0, 13.0))), 2.0); vec3 col = mix(blur, rawBg.rgb, 0.10); col *= 0.19 - 0.07 * vignette; col += warmA * 0.22 + warmB * 0.10 + vec3(1.0, 0.60, 0.30) * bokeh * 0.10 + vec3(0.025, 0.022, 0.020) * top; return vec4(col, 1.0); }\n"
    + "  if (u_liquidOverlayMode == 2) { vec3 blur = texture(u_blurredBg, v_uv).rgb; float band = smoothstep(0.14, 0.36, v_uv.y) * (1.0 - smoothstep(0.74, 0.96, v_uv.y)); float vignette = smoothstep(0.24, 0.95, length((v_uv - 0.5) * vec2(1.2, 1.0))); vec3 surfaceTint = vec3(1.0, 0.72, 0.78); vec3 col = mix(rawBg.rgb, blur, 0.30 * band); col = mix(col, surfaceTint, 0.13 * band); col *= 1.0 - band * 0.22 - vignette * 0.12; return vec4(col, 1.0); }\n"
    + "  return rawBg;\n"
    + "}\n"
    + "vec4 extrudedGlyph(vec4 base, float sd, float amount, int style){\n"
    + "  float sdCss = sd / u_dpr; float front = 1.0 - smoothstep(-0.7, 1.5, sdCss); vec4 outc = base;\n"
    + "  vec2 dir = (style == 2 ? vec2(-0.018, 0.030) : (style == 3 ? vec2(-0.014, 0.026) : vec2(-0.010, 0.020))) * amount;\n"
    + "  float side = 0.0; float sideRim = 0.0; float sideCore = 0.0;\n"
    + "  for (int i = 1; i <= 24; i++) { float f = float(i) / 24.0; float s = unionSD(v_uv + dir * f) / u_dpr; float wall = (1.0 - smoothstep(1.5, 18.0, abs(s))) * (1.0 - front * 0.92); float rim = (1.0 - smoothstep(0.0, 2.4, abs(s))) * (1.0 - front * 0.82); float fade = 1.0 - f * 0.34; side = max(side, wall * fade); sideCore = max(sideCore, wall * f); sideRim = max(sideRim, rim * (1.0 - f * 0.10)); }\n"
    + "  vec2 G = getGrad(v_uv); float glen = length(G); vec2 N = glen > 1e-5 ? G / glen : vec2(0.0, 1.0); float nlen = clamp(glen * 0.5, 0.0, 1.0);\n"
    + "  vec3 cleanBg = texture(u_bg, v_uv).rgb; outc.rgb = mix(outc.rgb, cleanBg, front * amount * (style == 2 ? 0.84 : 0.72));\n"
    + "  vec3 sideRefr = texture(u_bg, clamp(v_uv + dir * 0.68 - N * 0.017 * amount, vec2(0.0), vec2(1.0))).rgb;\n"
    + "  vec3 sideBlur = texture(u_blurredBg, clamp(v_uv + dir * 0.30, vec2(0.0), vec2(1.0))).rgb;\n"
    + "  vec3 sideTint = style == 2 ? vec3(1.0, 0.62, 0.72) : (style == 3 ? vec3(1.0, 0.48, 0.26) : vec3(0.58, 0.78, 1.0));\n"
    + "  vec3 sideCol = mix(sideBlur, sideRefr, 0.70); sideCol = mix(sideCol, sideTint, style == 2 ? 0.18 : 0.12); sideCol *= 0.46 + sideCore * 0.42;\n"
    + "  outc.rgb = mix(outc.rgb, sideCol, side * amount * (style == 2 ? 0.34 : 0.30));\n"
    + "  outc.rgb = mix(outc.rgb, vec3(1.0), sideRim * amount * (style == 2 ? 0.28 : 0.34));\n"
    + "  float edge = 1.0 - smoothstep(0.0, 2.1, abs(sdCss)); float shoulder = 1.0 - smoothstep(2.0, 8.5, abs(sdCss)); float inner = front * smoothstep(2.0, 26.0, -sdCss);\n"
    + "  vec3 faceRefr = texture(u_bg, clamp(v_uv - N * 0.023 * amount + dir * 0.08, vec2(0.0), vec2(1.0))).rgb;\n"
    + "  vec3 faceBlur = texture(u_blurredBg, clamp(v_uv + dir * 0.10, vec2(0.0), vec2(1.0))).rgb;\n"
    + "  float topLight = pow(clamp(dot(N, normalize(vec2(-0.24, 0.97))), 0.0, 1.0), 1.15) * front * nlen;\n"
    + "  float bandA = pow(max(0.0, sin((v_uv.x * 7.6 - v_uv.y * 2.8) * PI + 0.9)), 18.0);\n"
    + "  float bandB = pow(max(0.0, sin((v_uv.x * -5.4 + v_uv.y * 5.8) * PI + 2.2)), 16.0);\n"
    + "  float bandC = pow(max(0.0, sin((v_uv.x * 14.0 + v_uv.y * 1.8) * PI + 0.2)), 26.0);\n"
    + "  vec3 envA = style == 2 ? vec3(1.0, 0.66, 0.74) : (style == 3 ? vec3(1.0, 0.52, 0.30) : vec3(0.62, 0.82, 1.0));\n"
    + "  vec3 envB = style == 3 ? vec3(0.16, 0.26, 0.48) : vec3(0.14, 0.22, 0.30);\n"
    + "  vec3 faceCol = mix(faceBlur, faceRefr, 0.60); faceCol *= style == 3 ? 0.54 : (style == 2 ? 0.66 : 0.76); faceCol = mix(faceCol, envA, bandA * inner * 0.48); faceCol = mix(faceCol, envB, bandB * inner * 0.56);\n"
    + "  outc.rgb = mix(outc.rgb, faceCol, inner * amount * (style == 2 ? 0.58 : 0.66));\n"
    + "  outc.rgb *= 1.0 - inner * amount * (style == 3 ? 0.36 : 0.24) * (1.0 - edge * 0.48);\n"
    + "  float tube = (1.0 - smoothstep(0.0, 2.6, abs((-sdCss) - 8.0))) * inner + (1.0 - smoothstep(0.0, 3.4, abs((-sdCss) - 18.0))) * inner * 0.45;\n"
    + "  float spec = edge * (0.32 + topLight * 0.34) + shoulder * topLight * 0.13 + tube * 0.18 + bandC * inner * 0.16;\n"
    + "  outc.rgb = mix(outc.rgb, vec3(1.0), clamp(spec * amount, 0.0, style == 2 ? 0.78 : 0.86));\n"
    + "  if (style == 2 || style == 3) { float refl = 0.0; float reflRim = 0.0; for (int i = 0; i < 10; i++) { float f = float(i) / 9.0; float s = unionSD(v_uv + vec2(0.0, 0.046 + f * 0.066)) / u_dpr; float shifted = 1.0 - smoothstep(-0.5, 3.8, s); float fade = (1.0 - f) * (1.0 - front * 0.96); refl = max(refl, shifted * fade); reflRim = max(reflRim, (1.0 - smoothstep(0.0, 4.8, abs(s))) * fade); } vec3 reflCol = style == 2 ? vec3(0.86, 0.58, 0.66) : vec3(0.42, 0.62, 0.86); outc.rgb = mix(outc.rgb, reflCol, refl * amount * (style == 2 ? 0.18 : 0.14)); outc.rgb = mix(outc.rgb, vec3(1.0), reflRim * amount * (style == 2 ? 0.16 : 0.20)); }\n"
    + "  return outc;\n"
    + "}\n"
    + "vec4 liquidOverlay(vec4 base, float sd){\n"
    + "  float amount = clamp(u_liquidOverlayAmount, 0.0, 1.0); if (u_liquidOverlayMode == 0 || amount <= 0.001) return base;\n"
    + "  float sdCss = sd / u_dpr; float depth = max(-sdCss, 0.0); float edge = 1.0 - smoothstep(0.0, 5.0, abs(sdCss)); float nearGlyph = 1.0 - smoothstep(12.0, 120.0, abs(sdCss)); float inside = 1.0 - smoothstep(-2.0, 8.0, sdCss); vec4 outc = extrudedGlyph(base, sd, amount, u_liquidOverlayMode);\n"
    + "  if (u_liquidOverlayMode == 1) {\n"
    + "    float tubeA = (1.0 - smoothstep(0.0, 3.4, abs(depth - 7.0))) * inside; float tubeB = (1.0 - smoothstep(0.0, 7.0, abs(depth - 21.0))) * inside;\n"
    + "    float wetBody = nearGlyph * amount; outc.rgb = mix(outc.rgb, u_liquidOverlayTint, wetBody * 0.025); outc.rgb *= 1.0 - inside * amount * 0.10; outc.rgb = mix(outc.rgb, vec3(1.0), clamp(edge * 0.13 + tubeA * 0.16 + tubeB * 0.06, 0.0, 1.0) * amount);\n"
    + "    for (int i = 0; i < 6; i++) { vec2 r = hash22(vec2(float(i), 4.7)); vec2 c = vec2(0.13 + r.x * 0.74, 0.17 + r.y * 0.64 + u_liquidOverlayPhase * (0.050 + r.x * 0.035)); float inFrame = 1.0 - smoothstep(0.91, 0.98, c.y); float close = 1.0 - smoothstep(14.0, 76.0, abs(unionSD(c) / u_dpr)); float fall = smoothstep(0.0, 0.22, u_liquidOverlayPhase + r.y * 0.20); outc = glassDrop(outc, c, vec2(0.005 + r.x * 0.006, 0.020 + r.y * 0.038), amount * close * fall * inFrame * 0.95, u_liquidOverlayTint, 1.05); }\n"
    + "    for (int i = 0; i < 7; i++) { vec2 r = hash22(vec2(float(i), 17.4)); vec2 c = vec2(0.16 + r.x * 0.68, 0.24 + r.y * 0.52 + u_liquidOverlayPhase * (0.025 + r.x * 0.018)); float inFrame = 1.0 - smoothstep(0.90, 0.98, c.y); float close = 1.0 - smoothstep(16.0, 86.0, abs(unionSD(c) / u_dpr)); outc = glassBead(outc, c, 0.008 + r.y * 0.014, amount * close * inFrame * 0.85, u_liquidOverlayTint); }\n"
    + "  } else if (u_liquidOverlayMode == 2) {\n"
    + "    float floorShadow = (1.0 - smoothstep(8.0, 54.0, abs(unionSD(v_uv + vec2(0.0, 0.034)) / u_dpr))) * (1.0 - inside * 0.72);\n"
    + "    float sideExtrude = (1.0 - smoothstep(5.0, 30.0, abs(unionSD(v_uv + vec2(-0.014, 0.020)) / u_dpr))) * (1.0 - inside * 0.45);\n"
    + "    float contactGlow = (1.0 - smoothstep(4.0, 16.0, abs(unionSD(v_uv + vec2(0.0, 0.010)) / u_dpr))) * (1.0 - inside * 0.20);\n"
    + "    outc.rgb *= 1.0 - floorShadow * amount * 0.34; outc.rgb = mix(outc.rgb, vec3(0.80, 0.48, 0.56), sideExtrude * amount * 0.14);\n"
    + "    outc.rgb = mix(outc.rgb, vec3(1.0, 0.92, 0.95), clamp(edge * 0.12 + contactGlow * 0.05, 0.0, 1.0) * amount);\n"
    + "  } else if (u_liquidOverlayMode == 3) {\n"
    + "    float title = max(edge, inside * 0.36); outc.rgb *= 1.0 - amount * (0.34 - title * 0.12); outc.rgb = mix(outc.rgb, vec3(1.0), clamp(edge * 0.12 + inside * 0.006, 0.0, 1.0) * amount);\n"
    + "    for (int i = 0; i < 12; i++) { vec2 r = hash22(vec2(float(i), 13.3)); float lane = float(i % 3); vec2 c = vec2(0.07 + r.x * 0.86, 0.18 + lane * 0.22 + r.y * 0.13 + u_liquidOverlayPhase * (0.020 + r.x * 0.020)); float inFrame = (1.0 - smoothstep(0.86, 0.98, c.y)) * smoothstep(0.04, 0.12, c.y); float big = i < 5 ? 1.0 : 0.0; float radius = mix(0.012 + r.y * 0.018, 0.040 + r.y * 0.036, big); float awayFromCenter = smoothstep(18.0, 84.0, abs(unionSD(c) / u_dpr)); float alpha = amount * inFrame * mix(0.80, 0.62, big) * (0.72 + 0.28 * awayFromCenter); outc = glassBubble(outc, c, radius, alpha, u_liquidOverlayTint); }\n"
    + "    float flare = pow(max(0.0, sin(v_uv.x * 10.0 - u_liquidOverlayPhase * 3.0)), 22.0) * nearGlyph * amount; outc.rgb = mix(outc.rgb, vec3(1.0, 0.78, 0.55), flare * 0.16);\n"
    + "  }\n"
    + "  return outc;\n"
    + "}\n"
    // Faithful port of liquid-glass-studio STEP9 (the same code MB Liquid Glass is
    // built on). The earlier invented edge treatments (a metallic inner sheen, a
    // global veil, a luminance-driven boost) are gone — they are exactly what
    // made it read like a metal sticker. The baseline edge is physical Fresnel
    // (LCH lightness lift) + glare; the 9to5Mac preset can add a controlled SDF
    // milky body and rim while regular recipes keep those controls at zero.
    + "void main(){\n"
    + "  int layer; float sd = unionSDIdx(v_uv, layer);\n"
    + "  vec4 bg = stagedBackground(texture(u_bg, v_uv));\n"
    + "  float aa = 1.0;\n"
    + "  vec4 tint = u_tint[layer]; float thick = u_refThickness[layer];\n"
    + "  vec4 result;\n"
    + "  if (sd > aa) { result = bg; } else if (u_layerMode[layer] == 1) {\n"
    + "    float mask = 1.0 - smoothstep(-aa, aa, sd);\n"
    + "    result = vec4(mix(bg.rgb, tint.rgb, mask), 1.0);\n"
    + "  } else {\n"
    + "    float sdCss = sd/u_dpr; float depth = -sdCss;\n"
    + "    vec2 G = getGrad(v_uv); float glen = length(G); vec2 N = glen>1e-5 ? G/glen : vec2(0.0); float nlen = clamp(glen*0.5, 0.0, 1.0);\n"
    + "    float xr = clamp(1.0 - depth/thick, 0.0, 1.0);\n"
    + "    float thetaI = asin(clamp(pow(xr,2.0),0.0,1.0));\n"  /* STEP9 exponent: refraction concentrates at the edge, clear centre */
    + "    float thetaT = asin(clamp(sin(thetaI)/u_refFactor,-1.0,1.0));\n"
    + "    float edgeFactor = -tan(thetaT-thetaI);\n"
    + "    if (depth >= thick) edgeFactor = 0.0;\n"
    + "    vec2 aspect = vec2(u_resolution.y/u_resolution.x, 1.0);\n"
    // Convex-lens magnification: sample the background pulled toward the stroke's
    // centreline (-N), zero at the rim and growing into the body (smoothstep),
    // killed at the skeleton by nlen. This is the real thick-glass lens that flat
    // STEP9 refraction lacks — it enlarges the background seen through the glyph.
    + "    float magProfile = nlen * smoothstep(0.0, max(thick,1.0)*0.6, depth);\n"
    + "    vec2 base = v_uv - N * magProfile * u_lensMag * u_baseDpr * aspect;\n"  /* lens magnification baked into the sample coord — NOT spectrally split */
    + "    vec4 col;\n"
    + "    if (edgeFactor <= 0.0) { col = texture(u_blurredBg, base); col = mix(col, vec4(tint.rgb,1.0), tint.a*0.8); }\n"
    + "    else {\n"
    + "      float edgeH = depth/thick;\n"
    + "      vec2 off = -N*edgeFactor*0.05*u_baseDpr*aspect;\n"  /* only the thin edge bend gets the spectral split */
    + "      float mr = (u_blurEdge>0)?1.0:edgeH;\n"
    + "      vec4 refr = disp(base, mr, off, u_refDispersion);\n"
    + "      col = mix(refr, vec4(tint.rgb,1.0), tint.a*0.8);\n"
    + "      float fres = clamp(pow(1.0 + sdCss/1500.0*pow(500.0/u_refFresnelRange,2.0) + u_refFresnelHardness, 5.0), 0.0, 1.0);\n"
    + "      vec3 fLCH = s2lch(mix(vec3(1.0), tint.rgb, tint.a*0.5)); fLCH.x = clamp(fLCH.x + 20.0*fres*u_refFresnelFactor, 0.0, 100.0);\n"
    + "      col = mix(col, vec4(lch2s(fLCH),1.0), fres*u_refFresnelFactor*0.7*nlen);\n"
    + "      float gGeo = clamp(pow(1.0 + sdCss/1500.0*pow(500.0/u_glareRange,2.0) + u_glareHardness, 5.0), 0.0, 1.0);\n"
    + "      float ga = (a2(N) - PI/4.0 + u_glareAngle)*2.0;\n"
    + "      int far = ((ga>PI*1.5 && ga<PI*3.5)||(ga<-PI*0.5))?1:0;\n"
    + "      float gaf = (0.5+sin(ga)*0.5)*(far==1?1.2*u_glareOppositeFactor:1.2)*u_glareFactor;\n"
    + "      gaf = clamp(pow(gaf, 0.3+u_glareConvergence*1.5), 0.0, 1.0);\n"  /* studio exponent band 0.3-1.8: low convergence stays a soft wide band instead of blowing out */
    + "      vec3 gLCH = s2lch(mix(refr.rgb, tint.rgb, tint.a*0.5)); gLCH.x = clamp(gLCH.x + 150.0*gaf*gGeo, 0.0, 120.0); gLCH.y = gLCH.y + 30.0*gaf*gGeo;\n"
    + "      col = mix(col, vec4(lch2s(gLCH),1.0), gaf*gGeo*nlen);\n"
    + "    }\n"
    + "    float luma = dot(col.rgb, vec3(0.2126, 0.7152, 0.0722));\n"
    /* saturationFactor is Apple's Glass Saturation: 1.0 = unchanged, <1 desaturates
       (the high-grey glass look), >1 boosts (mix extrapolates past the colour).
       Only the lower bound is clamped so the value can go above 100%. */
    + "    col.rgb = max(mix(vec3(luma), col.rgb, max(u_saturationFactor, 0.0)), 0.0);\n"
    + "    float body = smoothstep(0.5, max(2.0, min(thick*0.22, 8.0)), depth) * u_bodyFactor;\n"
    + "    col = mix(col, vec4(1.0), clamp(body, 0.0, 0.78));\n"
    + "    float rim = (1.0 - smoothstep(0.0, max(u_rimWidth,0.5), abs(sdCss))) * u_rimFactor * nlen;\n"
    + "    col = mix(col, vec4(1.0), clamp(rim, 0.0, 1.0));\n"
    // iOS 27 bilateral bevel — read off Apple's design-resource shadow stack:
    // paired X/Y hairlines (X±1.2/Y±1, blur 0), soft X±20 side light, and a
    // Y±40 glow wash with big negative spread. NOT an angular streak. Zero in
    // all regular recipes.
    + "    if (u_bevelFactor > 0.0) {\n"
    + "      float hair = 1.0 - smoothstep(0.0, 1.35, abs(sdCss));\n"
    + "      float topW = clamp(N.y, 0.0, 1.0); float botW = clamp(-N.y, 0.0, 1.0); float sideW = abs(N.x);\n"
    + "      float bevel = hair * (topW + 0.70*botW + 0.45*sideW) * nlen;\n"
    + "      float edgeGlow = (1.0 - smoothstep(0.0, max(10.0, thick*0.42), depth)) * sideW * nlen * 0.26;\n"
    /* the Y±40 glow fills the glyph interior. It is screen-space, not normal-only:
       at the glyph skeleton the SDF gradient vanishes, so a normal-weighted wash
       cannot reach the interior the way the official effect does. */
    + "      float interior = smoothstep(1.0, max(10.0, thick*0.50), depth);\n"
    + "      float topWash = clamp((v_uv.y - 0.30) * 1.25, 0.0, 1.0) * 0.24;\n"
    + "      float botWash = clamp((0.20 - v_uv.y) * 1.25, 0.0, 1.0) * 0.10;\n"
    + "      float wash = interior * (topWash + botWash);\n"
    + "      col = mix(col, vec4(1.0), clamp((bevel + edgeGlow + wash) * u_bevelFactor, 0.0, 1.0));\n"
    + "    }\n"
    + "    result = mix(col, bg, smoothstep(-aa, aa, sd));\n"
    + "  }\n"
    + "  if (u_hasFg == 1) {\n"
    + "    float A = u_resolution.x/u_resolution.y; float sh = u_fgScale; float sw = u_fgScale*u_fgAspect/A;\n"
    + "    vec2 fuv = (v_uv - u_fgPos)/vec2(sw,sh) + 0.5;\n"
    + "    if (all(greaterThanEqual(fuv,vec2(0.0))) && all(lessThanEqual(fuv,vec2(1.0)))) { vec4 fg = texture(u_fg, fuv); result = vec4(mix(result.rgb, fg.rgb, fg.a), 1.0); }\n"
    + "  }\n"
    + "  result = liquidOverlay(result, sd);\n"
    + "  fragColor = result;\n"
    + "}";

  const REF_FRAG = "#version 300 es\nprecision highp float;\n#define PI 3.14159265359\nin vec2 v_uv;\nout vec4 fragColor;\nuniform sampler2D u_bg;\nuniform sampler2D u_blurredBg;\nuniform sampler2D u_fg;\nuniform vec2 u_resolution;\nuniform float u_dpr;\nuniform int u_hasFg;\nuniform vec2 u_fgPos;\nuniform float u_fgScale;\nuniform float u_fgAspect;\nuniform int u_liquidOverlayMode;\nuniform float u_liquidOverlayAmount;\nuniform float u_liquidOverlayPhase;\nuniform vec3 u_liquidOverlayTint;\n" + UNION_SD + "\n"
    + "vec2 getGrad(vec2 uv){ vec2 t=1.45/u_resolution; float l=unionSD(uv-vec2(t.x,0.0)); float r=unionSD(uv+vec2(t.x,0.0)); float b=unionSD(uv-vec2(0.0,t.y)); float a=unionSD(uv+vec2(0.0,t.y)); return vec2(r-l,a-b)*0.5; }\n"
    + "vec2 hash22(vec2 p){ return fract(sin(vec2(dot(p, vec2(269.5,183.3)), dot(p, vec2(113.5,271.9)))) * 43758.5453123); }\n"
    + "vec3 refStage(vec2 uv){ vec3 raw=texture(u_bg,uv).rgb; vec3 blur=texture(u_blurredBg,uv).rgb; if(u_liquidOverlayMode==3){ vec2 p=uv-0.5; float vign=smoothstep(0.22,0.86,length(p*vec2(1.25,1.0))); vec3 warm=vec3(1.0,0.38,0.13)*pow(max(0.0,1.0-length((uv-vec2(0.76,0.70))*vec2(2.0,1.7))),4.5); vec3 lamp=vec3(1.0,0.62,0.38)*pow(max(0.0,1.0-length((uv-vec2(0.45,0.45))*vec2(2.6,2.1))),5.8); vec3 c=mix(blur,raw,0.08); c*=0.18-0.075*vign; c+=warm*0.22+lamp*0.12; return c; } if(u_liquidOverlayMode==2){ float band=smoothstep(0.16,0.42,uv.y)*(1.0-smoothstep(0.76,0.98,uv.y)); vec3 c=mix(raw,blur,0.34*band); c=mix(c,vec3(1.0,0.74,0.79),0.12*band); c*=1.0-0.18*band; return c; } return raw; }\n"
    + "vec4 refDrop(vec4 base, vec2 center, vec2 radii, float alpha, vec3 tint){ vec2 aspect=vec2(u_resolution.x/u_resolution.y,1.0); vec2 d=(v_uv-center)*aspect; vec2 q=d/max(radii,vec2(0.0001)); float dist=length(q); float mask=(1.0-smoothstep(0.985,1.045,dist))*alpha; if(mask<=0.0001)return base; vec2 n=dist>0.00001?normalize(d):vec2(0.0,1.0); vec3 refr=refStage(clamp(v_uv-n*min(radii.x,radii.y)*1.08/aspect,vec2(0.0),vec2(1.0))); vec3 blur=texture(u_blurredBg,clamp(v_uv+n*min(radii.x,radii.y)*0.32/aspect,vec2(0.0),vec2(1.0))).rgb; float hard=(1.0-smoothstep(0.0,0.052,abs(dist-0.985)))*mask; float rim=smoothstep(0.70,1.0,dist)*mask; vec2 hi=(v_uv-(center+vec2(-radii.x*0.25/aspect.x,radii.y*0.34)))*aspect/max(radii*0.24,vec2(0.0001)); float spec=pow(1.0-smoothstep(0.0,1.0,length(hi)),1.5)*mask; vec3 col=mix(blur,refr,0.72); col=mix(col,tint,0.055); col*=1.0-smoothstep(-0.20,0.86,dot(n,normalize(vec2(0.42,-0.90))))*mask*0.30; col=mix(col,vec3(1.0),clamp(hard*0.92+rim*0.32+spec,0.0,1.0)); return vec4(mix(base.rgb,col,clamp(mask*0.96,0.0,1.0)),1.0); }\n"
    + "vec4 refBubble(vec4 base, vec2 center, float radius, float alpha, vec3 tint){ vec2 aspect=vec2(u_resolution.x/u_resolution.y,1.0); vec2 d=(v_uv-center)*aspect; float angle=atan(d.y,d.x); float dist=length(d/max(radius,0.0001))*(1.0+0.026*sin(angle*3.0+center.x*31.0)+0.018*sin(angle*7.0+center.y*47.0)); float mask=(1.0-smoothstep(0.985,1.045,dist))*alpha; if(mask<=0.0001)return base; vec2 n=dist>0.00001?normalize(d):vec2(0.0,1.0); vec3 refr=refStage(clamp(v_uv-n*radius*1.06/aspect,vec2(0.0),vec2(1.0))); vec3 blur=texture(u_blurredBg,clamp(v_uv+n*radius*0.25/aspect,vec2(0.0),vec2(1.0))).rgb; float hard=(1.0-smoothstep(0.0,0.046,abs(dist-0.98)))*mask; float rim=smoothstep(0.70,1.0,dist)*mask; float cup=(1.0-smoothstep(0.0,0.62,dist))*mask; vec2 hiA=(v_uv-(center+vec2(-radius*0.24/aspect.x,radius*0.36)))*aspect/max(radius*0.19,0.0001); vec2 hiB=(v_uv-(center+vec2(radius*0.29/aspect.x,-radius*0.25)))*aspect/max(radius*0.13,0.0001); float spec=(pow(1.0-smoothstep(0.0,1.0,length(hiA)),1.35)+0.55*pow(1.0-smoothstep(0.0,1.0,length(hiB)),1.6))*mask; vec3 col=mix(blur,refr,0.74); col=mix(col,tint,0.045); col*=1.0-cup*0.12-smoothstep(-0.22,0.86,dot(n,normalize(vec2(0.50,-0.86))))*mask*0.32; col=mix(col,vec3(1.0),clamp(hard*0.90+rim*0.28+spec,0.0,1.0)); return vec4(mix(base.rgb,col,clamp(mask*0.96,0.0,1.0)),1.0); }\n"
    + "vec4 refGlyph(vec4 base, float sd){ float amount=clamp(u_liquidOverlayAmount,0.0,1.0); int style=u_liquidOverlayMode; float sdCss=sd/u_dpr; float front=1.0-smoothstep(-0.8,1.25,sdCss); float depth=max(-sdCss,0.0); vec2 G=getGrad(v_uv); float glen=length(G); vec2 N=glen>0.00001?G/glen:vec2(0.0,1.0); float nlen=clamp(glen*0.58,0.0,1.0); vec2 dir=(style==2?vec2(-0.020,0.034):(style==3?vec2(-0.015,0.028):vec2(-0.010,0.021)))*amount; float side=0.0; float sideRim=0.0; for(int i=1;i<=28;i++){ float f=float(i)/28.0; float s=unionSD(v_uv+dir*f)/u_dpr; float wall=(1.0-smoothstep(1.2,16.0,abs(s)))*(1.0-front*0.92); float rim=(1.0-smoothstep(0.0,2.2,abs(s)))*(1.0-front*0.80); side=max(side,wall*(1.0-f*0.28)); sideRim=max(sideRim,rim*(1.0-f*0.08)); } vec3 tint=style==1?vec3(0.66,0.86,1.0):(style==2?vec3(1.0,0.64,0.74):vec3(1.0,0.52,0.30)); vec3 darkTint=style==3?vec3(0.07,0.13,0.22):(style==2?vec3(0.42,0.28,0.34):vec3(0.08,0.18,0.26)); vec3 sideRefr=refStage(clamp(v_uv+dir*0.62-N*0.014*amount,vec2(0.0),vec2(1.0))); vec3 sideCol=mix(texture(u_blurredBg,clamp(v_uv+dir*0.22,vec2(0.0),vec2(1.0))).rgb,sideRefr,0.68); sideCol=mix(sideCol,tint,style==2?0.15:0.10); sideCol*=0.42+0.28*side; vec4 outc=base; outc.rgb=mix(outc.rgb,sideCol,side*amount*0.44); outc.rgb=mix(outc.rgb,vec3(1.0),sideRim*amount*0.46); float inner=front*smoothstep(1.2,24.0,depth); float edge=1.0-smoothstep(0.0,2.2,abs(sdCss)); float shoulder=1.0-smoothstep(2.0,8.0,abs(sdCss)); vec3 refr=refStage(clamp(v_uv-N*(0.022+0.010*amount)+dir*0.08,vec2(0.0),vec2(1.0))); vec3 blur=texture(u_blurredBg,clamp(v_uv+dir*0.08,vec2(0.0),vec2(1.0))).rgb; float bandA=pow(max(0.0,sin((v_uv.x*7.5-v_uv.y*2.6)*PI+0.7)),16.0); float bandB=pow(max(0.0,sin((v_uv.x*-5.2+v_uv.y*5.6)*PI+2.1)),14.0); float bandC=pow(max(0.0,sin((v_uv.x*14.0+v_uv.y*1.8)*PI+0.1)),24.0); float top=pow(clamp(dot(N,normalize(vec2(-0.22,0.98))),0.0,1.0),1.05)*nlen; vec3 face=mix(blur,refr,style==2?0.64:0.70); face=mix(face,tint,bandA*inner*(style==3?0.34:0.26)); face=mix(face,darkTint,bandB*inner*(style==3?0.54:0.42)); face*=style==3?0.62:(style==2?0.74:0.82); outc.rgb=mix(outc.rgb,face,front*amount*(style==2?0.78:0.82)); outc.rgb*=1.0-inner*amount*(style==3?0.28:0.16); float tube=(1.0-smoothstep(0.0,2.7,abs(depth-7.5)))*inner+(1.0-smoothstep(0.0,3.8,abs(depth-18.0)))*inner*0.48; float spec=edge*(0.70+top*0.35)+shoulder*top*0.18+tube*0.22+bandC*inner*0.15; outc.rgb=mix(outc.rgb,vec3(1.0),clamp(spec*amount,0.0,0.90)); if(style==2||style==3){ float refl=0.0; float reflRim=0.0; for(int i=0;i<12;i++){ float f=float(i)/11.0; float s=unionSD(v_uv+vec2(0.0,0.042+f*0.078))/u_dpr; float m=(1.0-smoothstep(-0.6,3.4,s))*(1.0-f)*(1.0-front*0.96); refl=max(refl,m); reflRim=max(reflRim,(1.0-smoothstep(0.0,4.6,abs(s)))*(1.0-f)); } vec3 rc=style==2?vec3(0.92,0.58,0.68):vec3(0.28,0.48,0.78); outc.rgb=mix(outc.rgb,rc,refl*amount*0.18); outc.rgb=mix(outc.rgb,vec3(1.0),reflRim*amount*0.14); } return outc; }\n"
    + "void main(){ float sd=unionSD(v_uv); vec4 result=vec4(refStage(v_uv),1.0); if(u_hasFg==1){ float A=u_resolution.x/u_resolution.y; float sh=u_fgScale; float sw=u_fgScale*u_fgAspect/A; vec2 fuv=(v_uv-u_fgPos)/vec2(sw,sh)+0.5; if(all(greaterThanEqual(fuv,vec2(0.0)))&&all(lessThanEqual(fuv,vec2(1.0)))){ vec4 fg=texture(u_fg,fuv); result=vec4(mix(result.rgb,fg.rgb,fg.a),1.0); } } result=refGlyph(result,sd); if(u_liquidOverlayMode==1){ for(int i=0;i<7;i++){ vec2 r=hash22(vec2(float(i),4.7)); vec2 c=vec2(0.14+r.x*0.72,0.16+r.y*0.58+u_liquidOverlayPhase*(0.045+r.x*0.034)); float close=1.0-smoothstep(16.0,76.0,abs(unionSD(c)/u_dpr)); result=refDrop(result,c,vec2(0.005+r.x*0.006,0.020+r.y*0.040),u_liquidOverlayAmount*close*0.92,u_liquidOverlayTint); } } else if(u_liquidOverlayMode==3){ for(int i=0;i<14;i++){ vec2 r=hash22(vec2(float(i),13.3)); float big=i<5?1.0:0.0; float lane=float(i%3); vec2 c=vec2(0.06+r.x*0.88,0.14+lane*0.24+r.y*0.12+u_liquidOverlayPhase*(0.018+r.x*0.018)); float radius=mix(0.012+r.y*0.018,0.038+r.y*0.040,big); result=refBubble(result,c,radius,u_liquidOverlayAmount*mix(0.74,0.58,big),u_liquidOverlayTint); } } fragColor=result; }";

  const REF_FRAG_POLISHED = REF_FRAG
    .replace("sideCol*=0.42+0.28*side; vec4 outc=base; outc.rgb=mix(outc.rgb,sideCol,side*amount*0.44); outc.rgb=mix(outc.rgb,vec3(1.0),sideRim*amount*0.46);", "sideCol*=0.28+0.18*side; vec4 outc=base; outc.rgb=mix(outc.rgb,sideCol,side*amount*(style==3?0.20:0.16)); outc.rgb=mix(outc.rgb,vec3(1.0),sideRim*amount*0.26);")
    .replace("outc.rgb=mix(outc.rgb,face,front*amount*(style==2?0.78:0.82)); outc.rgb*=1.0-inner*amount*(style==3?0.28:0.16);", "float glassAlpha=front*amount*(style==3?0.46:(style==2?0.38:0.42)); outc.rgb=mix(outc.rgb,face,glassAlpha); outc.rgb*=1.0-inner*amount*(style==3?0.34:0.20);")
    .replace("float spec=edge*(0.70+top*0.35)+shoulder*top*0.18+tube*0.22+bandC*inner*0.15; outc.rgb=mix(outc.rgb,vec3(1.0),clamp(spec*amount,0.0,0.90));", "float spec=edge*(0.52+top*0.30)+shoulder*top*0.14+tube*0.18+bandC*inner*0.12; outc.rgb=mix(outc.rgb,vec3(1.0),clamp(spec*amount,0.0,0.76));")
    .replace("outc.rgb=mix(outc.rgb,rc,refl*amount*0.18); outc.rgb=mix(outc.rgb,vec3(1.0),reflRim*amount*0.14);", "outc.rgb=mix(outc.rgb,rc,refl*amount*0.08); outc.rgb=mix(outc.rgb,vec3(1.0),reflRim*amount*0.06);")
    .replace("sideCol*=0.28+0.18*side; vec4 outc=base; outc.rgb=mix(outc.rgb,sideCol,side*amount*(style==3?0.20:0.16)); outc.rgb=mix(outc.rgb,vec3(1.0),sideRim*amount*0.26);", "sideCol*=0.22+0.12*side; vec4 outc=base; outc.rgb=mix(outc.rgb,sideCol,side*amount*(style==3?0.075:0.055)); outc.rgb=mix(outc.rgb,vec3(1.0),sideRim*amount*0.14);")
    .replace("float glassAlpha=front*amount*(style==3?0.46:(style==2?0.38:0.42)); outc.rgb=mix(outc.rgb,face,glassAlpha); outc.rgb*=1.0-inner*amount*(style==3?0.34:0.20);", "float shell=edge*0.46+shoulder*0.14+inner*0.18; float glassAlpha=clamp(shell*amount*(style==3?0.78:(style==2?0.62:0.66)),0.0,0.72); outc.rgb=mix(outc.rgb,face,glassAlpha); outc.rgb*=1.0-inner*amount*(style==3?0.30:0.16);")
    .replace("float spec=edge*(0.52+top*0.30)+shoulder*top*0.14+tube*0.18+bandC*inner*0.12; outc.rgb=mix(outc.rgb,vec3(1.0),clamp(spec*amount,0.0,0.76));", "float spec=edge*(0.78+top*0.30)+shoulder*top*0.12+tube*0.28+bandC*inner*0.10; outc.rgb=mix(outc.rgb,vec3(1.0),clamp(spec*amount,0.0,0.88));");

  const REF_FRAG_RAY = "#version 300 es\nprecision highp float;\n#define PI 3.14159265359\nin vec2 v_uv;\nout vec4 fragColor;\nuniform sampler2D u_bg;\nuniform sampler2D u_blurredBg;\nuniform sampler2D u_fg;\nuniform vec2 u_resolution;\nuniform float u_dpr;\nuniform float u_refThickness[4];\nuniform int u_hasFg;\nuniform vec2 u_fgPos;\nuniform float u_fgScale;\nuniform float u_fgAspect;\nuniform int u_liquidOverlayMode;\nuniform float u_liquidOverlayAmount;\nuniform float u_liquidOverlayPhase;\nuniform vec3 u_liquidOverlayTint;\n" + UNION_SD + "\n"
    + "float sat(float x){return clamp(x,0.0,1.0);} vec2 sat2(vec2 v){return clamp(v,vec2(0.0),vec2(1.0));}\n"
    + "vec2 hash22(vec2 p){return fract(sin(vec2(dot(p,vec2(269.5,183.3)),dot(p,vec2(113.5,271.9))))*43758.5453123);}\n"
    + "vec2 grad(vec2 uv){vec2 t=1.35/u_resolution; float l=unionSD(uv-vec2(t.x,0.0)); float r=unionSD(uv+vec2(t.x,0.0)); float b=unionSD(uv-vec2(0.0,t.y)); float a=unionSD(uv+vec2(0.0,t.y)); return vec2(r-l,a-b)*0.5;}\n"
    + "float refThick(int i){if(i==0)return u_refThickness[0]; if(i==1)return u_refThickness[1]; if(i==2)return u_refThickness[2]; return u_refThickness[3];}\n"
    + "float tubeHeightAt(vec2 uv,float radius){float d=max(-unionSD(uv)/u_dpr,0.0); float p=sat(d/max(radius,0.001)); return sqrt(max(0.0,1.0-(1.0-p)*(1.0-p)));}\n"
    + "vec3 meshNormal(vec2 uv,float radius){vec2 t=1.35/u_resolution; float hx=tubeHeightAt(uv+vec2(t.x,0.0),radius)-tubeHeightAt(uv-vec2(t.x,0.0),radius); float hy=tubeHeightAt(uv+vec2(0.0,t.y),radius)-tubeHeightAt(uv-vec2(0.0,t.y),radius); return normalize(vec3(-hx*radius*0.055,-hy*radius*0.055,1.0));}\n"
    + "vec3 stage(vec2 uv){vec3 raw=texture(u_bg,sat2(uv)).rgb; vec3 blur=texture(u_blurredBg,sat2(uv)).rgb; if(u_liquidOverlayMode==3){vec2 p=uv-0.5; float vign=smoothstep(0.20,0.86,length(p*vec2(1.24,1.0))); vec3 c=mix(blur,raw,0.08); c*=0.17-0.075*vign; c+=vec3(1.0,0.38,0.14)*pow(max(0.0,1.0-length((uv-vec2(0.76,0.66))*vec2(2.1,1.75))),4.4)*0.22; c+=vec3(1.0,0.66,0.45)*pow(max(0.0,1.0-length((uv-vec2(0.46,0.45))*vec2(2.7,2.2))),5.8)*0.11; return c;} if(u_liquidOverlayMode==2){float band=smoothstep(0.12,0.40,uv.y)*(1.0-smoothstep(0.78,0.98,uv.y)); vec3 c=mix(raw,blur,0.38*band); c=mix(c,vec3(1.0,0.72,0.80),0.10*band); c*=1.0-0.17*band; return c;} return raw;}\n"
    + "vec4 drop(vec4 base, vec2 c, vec2 r, float a, vec3 tint){vec2 asp=vec2(u_resolution.x/u_resolution.y,1.0); vec2 d=(v_uv-c)*asp; float q=length(d/max(r,vec2(0.0001))); float m=(1.0-smoothstep(0.985,1.045,q))*a; if(m<=0.0001)return base; vec2 n=q>0.00001?normalize(d):vec2(0.0,1.0); vec3 refr=stage(v_uv-n*min(r.x,r.y)*1.18/asp); vec3 blur=texture(u_blurredBg,sat2(v_uv+n*min(r.x,r.y)*0.24/asp)).rgb; float rim=smoothstep(0.72,1.0,q)*m; float hard=(1.0-smoothstep(0.0,0.050,abs(q-0.985)))*m; vec2 hp=(v_uv-(c+vec2(-r.x*0.24/asp.x,r.y*0.34)))*asp/max(r*0.23,vec2(0.0001)); float spec=pow(1.0-smoothstep(0.0,1.0,length(hp)),1.45)*m; vec3 col=mix(blur,refr,0.74); col=mix(col,tint,0.05); col*=1.0-smoothstep(-0.2,0.86,dot(n,normalize(vec2(0.45,-0.90))))*m*0.32; col=mix(col,vec3(1.0),sat(hard*0.92+rim*0.28+spec)); return vec4(mix(base.rgb,col,sat(m*0.96)),1.0);}\n"
    + "vec4 bubble(vec4 base, vec2 c, float r, float a, vec3 tint){vec2 asp=vec2(u_resolution.x/u_resolution.y,1.0); vec2 d=(v_uv-c)*asp; float ang=atan(d.y,d.x); float q=length(d/max(r,0.0001))*(1.0+0.025*sin(ang*3.0+c.x*31.0)+0.018*sin(ang*7.0+c.y*47.0)); float m=(1.0-smoothstep(0.985,1.045,q))*a; if(m<=0.0001)return base; vec2 n=q>0.00001?normalize(d):vec2(0.0,1.0); vec3 refr=stage(v_uv-n*r*1.10/asp); vec3 blur=texture(u_blurredBg,sat2(v_uv+n*r*0.22/asp)).rgb; float hard=(1.0-smoothstep(0.0,0.046,abs(q-0.98)))*m; float rim=smoothstep(0.70,1.0,q)*m; float cup=(1.0-smoothstep(0.0,0.60,q))*m; vec2 h1=(v_uv-(c+vec2(-r*0.24/asp.x,r*0.36)))*asp/max(r*0.19,0.0001); vec2 h2=(v_uv-(c+vec2(r*0.30/asp.x,-r*0.25)))*asp/max(r*0.13,0.0001); float spec=(pow(1.0-smoothstep(0.0,1.0,length(h1)),1.35)+0.55*pow(1.0-smoothstep(0.0,1.0,length(h2)),1.6))*m; vec3 col=mix(blur,refr,0.74); col=mix(col,tint,0.04); col*=1.0-cup*0.12-smoothstep(-0.22,0.86,dot(n,normalize(vec2(0.50,-0.86))))*m*0.30; col=mix(col,vec3(1.0),sat(hard*0.90+rim*0.28+spec)); return vec4(mix(base.rgb,col,sat(m*0.96)),1.0);}\n"
    + "vec4 glassGlyph(vec4 base,float sd,int layer){float amt=sat(u_liquidOverlayAmount); int style=u_liquidOverlayMode; float s=sd/u_dpr; float depth=max(-s,0.0); float radius=max(refThick(layer),3.0); float tubePos=sat(depth/radius); float tubeHeight=sqrt(max(0.0,1.0-(1.0-tubePos)*(1.0-tubePos))); vec3 N3=meshNormal(v_uv,radius); vec3 R3=reflect(vec3(0.0,0.0,-1.0),N3); float sideShade=sat((1.0-N3.z)*2.2); float contactOcclusion=sat((1.0-tubeHeight)*0.72+sideShade*0.48); vec3 meshEnv=stage(v_uv+R3.xy*(style==3?0.18:0.12)); float inside=1.0-smoothstep(-0.7,1.1,s); vec2 G=grad(v_uv); float gl=length(G); vec2 N=gl>0.00001?G/gl:vec2(0.0,1.0); float nlen=sat(gl*0.62); vec2 dir=(style==2?vec2(-0.014,0.024):(style==3?vec2(-0.010,0.018):vec2(-0.010,0.020)))*amt; float edge=1.0-smoothstep(0.0,1.75,abs(s)); float shoulder=1.0-smoothstep(1.0,8.5,abs(s)); float tube1=(1.0-smoothstep(0.0,radius*0.16,abs(depth-radius*0.34)))*inside; float tube2=(1.0-smoothstep(0.0,radius*0.24,abs(depth-radius*0.82)))*inside*0.42; float core=inside*smoothstep(0.08,0.58,tubePos); float body=inside*(0.28+0.72*tubeHeight)*(1.0-edge*0.24); float shell=sat(edge*0.76+shoulder*0.12+tube1*0.16+tube2*0.10+tubeHeight*inside*(style==3?0.76:(style==2?0.68:0.46))); vec3 refr=stage(v_uv-N*(0.022+0.018*amt*tubeHeight)+dir*0.05); vec3 blur=texture(u_blurredBg,sat2(v_uv+dir*0.05)).rgb; vec3 tint=style==1?vec3(0.62,0.84,1.0):(style==2?vec3(1.0,0.62,0.72):vec3(1.0,0.55,0.34)); vec3 dark=style==3?vec3(0.04,0.08,0.16):(style==2?vec3(0.42,0.25,0.32):vec3(0.06,0.14,0.24)); vec3 bodyTint=style==3?vec3(0.16,0.25,0.50):(style==2?vec3(1.0,0.70,0.82):vec3(0.70,0.90,1.0)); float envA=pow(max(0.0,sin((v_uv.x*7.4-v_uv.y*2.4)*PI+0.8)),16.0); float envB=pow(max(0.0,sin((v_uv.x*-5.0+v_uv.y*5.5)*PI+2.1)),14.0); float envC=pow(max(0.0,sin((v_uv.x*10.5+v_uv.y*3.2)*PI+1.35)),18.0); vec3 face=mix(mix(blur,refr,style==3?0.64:0.60),meshEnv,(0.22+sideShade*0.32)*inside); vec3 volume=mix(bodyTint,tint,style==3?0.18:0.22)+(style==3?vec3(0.025,0.035,0.060):vec3(0.10,0.12,0.16)); face=mix(face,volume,(core*0.54+body*0.46)*inside*(style==3?0.50:0.52)); face=mix(face,tint,(envA*0.48+envC*0.34+core*0.08)*inside*(style==3?0.18:0.20)); face=mix(face,dark,(envB+contactOcclusion*0.55)*inside*(style==3?0.24:0.18)); face*=style==3?1.04:(style==2?1.06:0.98); vec4 outc=base; outc.rgb=mix(outc.rgb,face,shell*amt*(style==3?0.92:0.88)); outc.rgb=mix(outc.rgb,volume,(core*0.42+body*0.44)*amt*(style==3?0.26:0.32)); outc.rgb*=1.0-inside*amt*(style==3?0.012:0.012); float side=0.0; for(int i=1;i<=18;i++){float f=float(i)/18.0; float ss=unionSD(v_uv+dir*f)/u_dpr; side=max(side,(1.0-smoothstep(0.0,2.4,abs(ss)))*(1.0-inside*0.96)*(1.0-f*0.42));} outc.rgb=mix(outc.rgb,stage(v_uv+dir*0.45-N*0.008),side*amt*(style==3?0.018:0.040)); outc.rgb*=1.0-contactOcclusion*inside*amt*(style==3?0.16:0.08); float top=pow(sat(dot(N,normalize(vec2(-0.24,0.97)))),1.1)*nlen; float meshRim=pow(sat(1.0-N3.z),1.6)*inside; float band=pow(max(0.0,sin((v_uv.x*13.5+v_uv.y*1.7)*PI+0.2)),24.0); float spec=edge*((style==3?0.88:0.68)+top*0.36)+meshRim*(style==3?0.42:0.30)+tubeHeight*top*inside*0.18+tube1*0.08+tube2*0.05+band*inside*0.07+side*0.02; outc.rgb=mix(outc.rgb,vec3(1.0),sat(spec*amt)); if(style==2||style==3){float refl=0.0; float rr=0.0; for(int i=0;i<10;i++){float f=float(i)/9.0; float ss=unionSD(v_uv+vec2(0.0,0.035+f*0.058))/u_dpr; float fade=(1.0-f)*(1.0-inside*0.96); refl=max(refl,(1.0-smoothstep(-0.4,2.8,ss))*fade); rr=max(rr,(1.0-smoothstep(0.0,3.5,abs(ss)))*fade);} vec3 rc=style==2?vec3(0.82,0.50,0.60):vec3(0.16,0.28,0.56); outc.rgb=mix(outc.rgb,rc,refl*amt*(style==3?0.010:0.050)); outc.rgb=mix(outc.rgb,vec3(1.0),rr*amt*(style==3?0.008:0.040));} return outc;}\n"
    + "void main(){int layer=0; float sd=unionSDIdx(v_uv,layer); vec4 result=vec4(stage(v_uv),1.0); if(u_hasFg==1){float A=u_resolution.x/u_resolution.y; float sh=u_fgScale; float sw=u_fgScale*u_fgAspect/A; vec2 fuv=(v_uv-u_fgPos)/vec2(sw,sh)+0.5; if(all(greaterThanEqual(fuv,vec2(0.0)))&&all(lessThanEqual(fuv,vec2(1.0)))){vec4 fg=texture(u_fg,fuv); result=vec4(mix(result.rgb,fg.rgb,fg.a),1.0);}} result=glassGlyph(result,sd,layer); if(u_liquidOverlayMode==1){for(int i=0;i<7;i++){vec2 r=hash22(vec2(float(i),4.7)); vec2 c=vec2(0.14+r.x*0.72,0.16+r.y*0.58+u_liquidOverlayPhase*(0.045+r.x*0.034)); float close=1.0-smoothstep(16.0,76.0,abs(unionSD(c)/u_dpr)); result=drop(result,c,vec2(0.005+r.x*0.006,0.020+r.y*0.040),u_liquidOverlayAmount*close*0.92,u_liquidOverlayTint);}} else if(u_liquidOverlayMode==3){for(int i=0;i<14;i++){vec2 r=hash22(vec2(float(i),13.3)); float big=i<5?1.0:0.0; float lane=float(i%3); vec2 c=vec2(0.06+r.x*0.88,0.14+lane*0.24+r.y*0.12+u_liquidOverlayPhase*(0.018+r.x*0.018)); float rad=mix(0.012+r.y*0.018,0.038+r.y*0.040,big); result=bubble(result,c,rad,u_liquidOverlayAmount*mix(0.74,0.58,big),u_liquidOverlayTint);}} fragColor=result;}";

  const REF_FRAG_RAY_MESH = REF_FRAG_RAY
    .replace("float refThick(int i){if(i==0)return u_refThickness[0]; if(i==1)return u_refThickness[1]; if(i==2)return u_refThickness[2]; return u_refThickness[3];}\n", "float refThick(int i){if(i==0)return u_refThickness[0]; if(i==1)return u_refThickness[1]; if(i==2)return u_refThickness[2]; return u_refThickness[3];}\nvec2 surfaceProjectUv(vec2 uv){if(u_liquidOverlayMode!=2)return uv; vec2 p=uv-vec2(0.5); float surfaceArc=p.x*p.x*0.105; float lean=p.y*0.105; float squeeze=1.16+sat(p.y+0.38)*0.13; p.x=(p.x+lean)*(1.0-p.y*0.09); p.y=p.y*squeeze+0.020*p.x+surfaceArc; return p+vec2(0.5,0.32);}\nfloat refSDIdx(vec2 uv,out int idx){return unionSDIdx(surfaceProjectUv(uv),idx);} float refSD(vec2 uv){int i; return refSDIdx(uv,i);} vec2 refGrad(vec2 uv){vec2 t=1.35/u_resolution; float l=refSD(uv-vec2(t.x,0.0)); float r=refSD(uv+vec2(t.x,0.0)); float b=refSD(uv-vec2(0.0,t.y)); float a=refSD(uv+vec2(0.0,t.y)); return vec2(r-l,a-b)*0.5;}\n")
    .replace("float tubeHeightAt(vec2 uv,float radius){float d=max(-unionSD(uv)/u_dpr,0.0);", "float tubeHeightAt(vec2 uv,float radius){float d=max(-refSD(uv)/u_dpr,0.0);")
    .replace("return normalize(vec3(-hx*radius*0.055,-hy*radius*0.055,1.0));", "return normalize(vec3(-hx*radius*0.24,-hy*radius*0.24,1.0));")
    .replace("float inside=1.0-smoothstep(-0.7,1.1,s); vec2 G=grad(v_uv);", "float inside=1.0-smoothstep(-0.7,1.1,s); float surfaceSideWall=0.0; float surfaceContact=0.0; if(style==2){for(int j=1;j<=18;j++){float jf=float(j)/18.0; float sw=refSD(v_uv+vec2(-0.007,0.013)*jf)/u_dpr; surfaceSideWall=max(surfaceSideWall,(1.0-smoothstep(0.0,3.2,abs(sw)))*(1.0-inside*0.84)*(1.0-jf*0.24)); float sc=refSD(v_uv+vec2(0.010,-0.020)*jf)/u_dpr; surfaceContact=max(surfaceContact,(1.0-smoothstep(-2.0,7.5,sc))*(1.0-inside*0.92)*(1.0-jf*0.36));} contactOcclusion=sat(contactOcclusion+surfaceSideWall*0.60+surfaceContact*0.38);} vec2 G=refGrad(v_uv);")
    .replace("vec3 face=mix(mix(blur,refr,style==3?0.64:0.60),meshEnv,(0.22+sideShade*0.32)*inside);", "vec3 rayA=stage(sat2(v_uv+N3.xy*(0.055+0.055*tubeHeight)+dir*0.07)); vec3 rayB=stage(sat2(v_uv-N3.xy*(0.040+0.050*tubeHeight)-dir*0.03)); vec3 rayC=stage(sat2(v_uv+R3.xy*(style==3?0.24:0.18)-N*0.010)); float fresnelShell=pow(sat(1.0-N3.z),0.55); float chromeBand=pow(max(0.0,sin((R3.x*8.0+R3.y*5.5+v_uv.x*4.0-v_uv.y*3.0)*PI+0.35)),10.0)*inside; float darkBand=pow(max(0.0,sin((R3.x*-6.0+R3.y*7.5+v_uv.y*5.2)*PI+1.8)),8.0)*inside; vec3 face=mix(mix(rayB,rayA,0.56),rayC,0.28+fresnelShell*0.34);")
    .replace("face=mix(face,dark,(envB+contactOcclusion*0.55)*inside*(style==3?0.24:0.18)); face*=style==3?1.04:(style==2?1.06:0.98);", "face=mix(face,dark,(envB+contactOcclusion*0.55+darkBand*0.70)*inside*(style==3?0.28:0.20)); face=mix(face,style==3?vec3(0.11,0.23,0.50):tint,chromeBand*(style==3?0.42:0.28)); face=mix(face,vec3(1.0),chromeBand*(style==3?0.16:0.10)+fresnelShell*edge*0.18); face*=style==3?1.08:(style==2?0.96:0.98);")
    .replace("outc.rgb=mix(outc.rgb,face,shell*amt*(style==3?0.92:0.88));", "outc.rgb=mix(outc.rgb,face,shell*amt*(style==3?0.92:(style==2?0.66:0.84)));")
    .replace("outc.rgb=mix(outc.rgb,volume,(core*0.42+body*0.44)*amt*(style==3?0.26:0.32));", "outc.rgb=mix(outc.rgb,volume,(core*0.56+body*0.60)*amt*(style==3?0.46:(style==2?0.22:0.32)));")
    .replace("float spec=edge*((style==3?0.88:0.68)+top*0.36)+meshRim*(style==3?0.42:0.30)+tubeHeight*top*inside*0.18+tube1*0.08+tube2*0.05+band*inside*0.07+side*0.02; outc.rgb=mix(outc.rgb,vec3(1.0),sat(spec*amt));", "float spec=edge*((style==3?0.74:0.52)+top*0.28)+meshRim*(style==3?0.72:0.48)+tubeHeight*top*inside*0.20+tube1*0.06+tube2*0.04+band*inside*0.05+side*0.02; float bead=pow(tubeHeight,3.0)*inside*(0.12+0.18*chromeBand); outc.rgb=mix(outc.rgb,vec3(1.0),sat((spec+bead)*amt));")
    .replace("outc.rgb*=1.0-contactOcclusion*inside*amt*(style==3?0.16:0.08); float top=", "outc.rgb*=1.0-contactOcclusion*inside*amt*(style==3?0.16:(style==2?0.12:0.08)); outc.rgb=mix(outc.rgb,dark,surfaceSideWall*amt*0.34); outc.rgb*=1.0-surfaceContact*amt*0.18; outc.rgb=mix(outc.rgb,vec3(1.0),surfaceSideWall*edge*amt*0.18); float top=")
    .replace("int layer=0; float sd=unionSDIdx(v_uv,layer);", "int layer=0; float sd=refSDIdx(v_uv,layer);")
    .replace("unionSD(v_uv+dir*f)", "refSD(v_uv+dir*f)")
    .replace("unionSD(v_uv+vec2(0.0,0.035+f*0.058))", "refSD(v_uv+vec2(0.0,0.035+f*0.058))")
    .replace("unionSD(c)", "refSD(c)");

  function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error("LiquidCover shader: " + gl.getShaderInfoLog(sh));
    return sh;
  }
  function program(gl, v, f) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, v));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, f));
    gl.bindAttribLocation(p, 0, "a_position");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("LiquidCover link: " + gl.getProgramInfoLog(p));
    return p;
  }
  // HDR (RGBA16F) intermediate buffers when available — matches the official
  // liquid-glass-studio and removes banding in the blur / LCH glare. Falls back
  // to 8-bit if EXT_color_buffer_float is missing.
  function makeFBO(gl, w, h, hdr) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (hdr) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (hdr && gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      // float attachment not renderable here — fall back to 8-bit
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fbo, tex };
  }

  function Renderer(canvas) {
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true, premultipliedAlpha: false });
    if (!gl) throw new Error("WebGL2 not supported");
    this.gl = gl; this.canvas = canvas;
    this.hdr = !!gl.getExtension("EXT_color_buffer_float"); // HDR float intermediate buffers
    this.sdfLinear = !!gl.getExtension("OES_texture_float_linear"); // smooth SDF sampling (no ribbed edges)
    this.progBg = program(gl, VERT, BG_FRAG);
    this.progBlur = program(gl, VERT, BLUR_FRAG);
    this.progMain = program(gl, VERT, MAIN_FRAG);
    this.progRef = program(gl, VERT, REF_FRAG_RAY_MESH);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.fboA = null; this.fboB = null; this.fboC = null;
    this.bgTex = null; this.bgAspect = 1;
    this.bgVideo = null; this.bgVideoFrameReady = false; this.bgVideoUploadError = false;
    this.fgTex = null; this.fgAspect = 1;
    this.sdfTexs = new Array(MAX_LAYERS).fill(null);
    this.w = 0; this.h = 0;
  }
  Renderer.prototype._ensureFBOs = function (w, h) {
    if (this.w === w && this.h === h && this.fboA) return;
    const gl = this.gl;
    [this.fboA, this.fboB, this.fboC].forEach((f) => { if (f) { gl.deleteFramebuffer(f.fbo); gl.deleteTexture(f.tex); } });
    this.fboA = makeFBO(gl, w, h, this.hdr); this.fboB = makeFBO(gl, w, h, this.hdr); this.fboC = makeFBO(gl, w, h, this.hdr);
    this.w = w; this.h = h;
  };
  Renderer.prototype.setBackground = function (image) {
    const gl = this.gl;
    if (this.bgTex) gl.deleteTexture(this.bgTex);
    this.bgVideo = null;
    this.bgVideoFrameReady = false;
    this.bgVideoUploadError = false;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.bgTex = tex;
    this.bgAspect = (image.naturalWidth || image.width) / (image.naturalHeight || image.height);
  };
  Renderer.prototype.setBackgroundVideo = function (video) {
    const gl = this.gl;
    if (this.bgTex) gl.deleteTexture(this.bgTex);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([232, 238, 243, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.bgTex = tex;
    this.bgVideo = video;
    this.bgVideoFrameReady = false;
    this.bgVideoUploadError = false;
    this.bgAspect = (video.videoWidth || video.width || 1) / (video.videoHeight || video.height || 1);
    this.updateBackgroundVideoFrame();
  };
  Renderer.prototype.updateBackgroundVideoFrame = function () {
    const gl = this.gl;
    const video = this.bgVideo;
    const minReady = (typeof HTMLMediaElement !== "undefined" && HTMLMediaElement.HAVE_CURRENT_DATA) || 2;
    if (!video || !this.bgTex || video.readyState < minReady || !video.videoWidth || !video.videoHeight) return false;
    gl.bindTexture(gl.TEXTURE_2D, this.bgTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    try {
      if (this.bgVideoFrameReady) {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video);
      } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
        this.bgVideoFrameReady = true;
      }
      this.bgAspect = video.videoWidth / video.videoHeight;
      this.bgVideoUploadError = false;
      return true;
    } catch (e) {
      // A video frame can be temporarily unavailable during seek/play transitions.
      this.bgVideoUploadError = true;
      return false;
    } finally {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    }
  };
  Renderer.prototype.setForeground = function (image) {
    const gl = this.gl;
    if (this.fgTex) { gl.deleteTexture(this.fgTex); this.fgTex = null; }
    if (!image) return;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.fgTex = tex;
    this.fgAspect = (image.naturalWidth || image.width) / (image.naturalHeight || image.height);
  };
  Renderer.prototype.setLayerSDF = function (i, sdf, w, h) {
    const gl = this.gl;
    if (this.sdfTexs[i]) gl.deleteTexture(this.sdfTexs[i]);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, w, h, 0, gl.RED, gl.FLOAT, sdf);
    // Linear filtering makes the distance field continuous between texels, so the
    // surface normal rotates smoothly along a curved edge instead of snapping to a
    // few angles (the ribbed/corrugated edge artifact). Falls back to NEAREST only
    // where float-linear is unsupported.
    const sdfFilter = this.sdfLinear ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, sdfFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, sdfFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.sdfTexs[i] = tex;
  };
  Renderer.prototype.removeLayer = function (i) {
    const gl = this.gl;
    if (this.sdfTexs[i]) gl.deleteTexture(this.sdfTexs[i]);
    this.sdfTexs.splice(i, 1); this.sdfTexs.push(null);
  };
  Renderer.prototype._u = function (p, n) { return this.gl.getUniformLocation(p, n); };
  Renderer.prototype._bindLayers = function (p, count, base) {
    const gl = this.gl; const fb = this.sdfTexs[0]; const units = [];
    for (let i = 0; i < MAX_LAYERS; i++) { gl.activeTexture(gl.TEXTURE0 + base + i); gl.bindTexture(gl.TEXTURE_2D, this.sdfTexs[i] || fb); units.push(base + i); }
    gl.uniform1iv(this._u(p, "u_sdf"), units);
    gl.uniform1i(this._u(p, "u_layerCount"), count);
  };
  Renderer.prototype.render = function (params) {
    const gl = this.gl;
    const w = this.canvas.width, h = this.canvas.height, dpr = params.dpr || 1;
    this._ensureFBOs(w, h);
    if (!this.bgTex || !this.sdfTexs[0]) return;
    this.updateBackgroundVideoFrame();
    const count = Math.max(1, Math.min(MAX_LAYERS, params.layerCount || 1));
    const offsets = new Float32Array(MAX_LAYERS * 2);
    const scales = new Float32Array(MAX_LAYERS).fill(1);
    const tints = new Float32Array(MAX_LAYERS * 4);
    const thick = new Float32Array(MAX_LAYERS).fill(20);
    const layerModes = new Int32Array(MAX_LAYERS);
    for (let i = 0; i < count; i++) {
      offsets[i * 2] = params.offsets[i][0]; offsets[i * 2 + 1] = params.offsets[i][1];
      scales[i] = params.layerScales && params.layerScales[i] ? params.layerScales[i] : 1;
      const t = params.tints[i]; tints[i * 4] = t[0]; tints[i * 4 + 1] = t[1]; tints[i * 4 + 2] = t[2]; tints[i * 4 + 3] = t[3];
      thick[i] = params.thicknesses[i];
      layerModes[i] = params.layerModes && params.layerModes[i] ? 1 : 0;
    }
    gl.bindVertexArray(this.vao);
    gl.viewport(0, 0, w, h);

    gl.useProgram(this.progBg);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboA.fbo);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.bgTex);
    gl.uniform1i(this._u(this.progBg, "u_image"), 0);
    this._bindLayers(this.progBg, count, 1);
    gl.uniform2fv(this._u(this.progBg, "u_sdfOffset"), offsets);
    gl.uniform1fv(this._u(this.progBg, "u_sdfScale"), scales);
    gl.uniform2f(this._u(this.progBg, "u_resolution"), w, h);
    gl.uniform1f(this._u(this.progBg, "u_dpr"), dpr);
    gl.uniform1f(this._u(this.progBg, "u_imageAspect"), this.bgAspect);
    gl.uniform1f(this._u(this.progBg, "u_bgZoom"), params.bgZoom || 1);
    gl.uniform2f(this._u(this.progBg, "u_bgPan"), (params.bgPan && params.bgPan[0]) || 0, (params.bgPan && params.bgPan[1]) || 0);
    gl.uniform1f(this._u(this.progBg, "u_shadowExpand"), params.shadowExpand);
    gl.uniform1f(this._u(this.progBg, "u_shadowFactor"), params.shadowFactor);
    gl.uniform2f(this._u(this.progBg, "u_shadowOffset"), params.shadowOffset[0], params.shadowOffset[1]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    const weights = params.blurWeights, radius = weights.length - 1;
    const self = this;
    const drawBlur = function (srcTex, dstFbo, dir) {
      gl.useProgram(self.progBlur);
      gl.bindFramebuffer(gl.FRAMEBUFFER, dstFbo);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, srcTex);
      gl.uniform1i(self._u(self.progBlur, "u_tex"), 0);
      gl.uniform2f(self._u(self.progBlur, "u_resolution"), w, h);
      gl.uniform2f(self._u(self.progBlur, "u_dir"), dir[0], dir[1]);
      gl.uniform1i(self._u(self.progBlur, "u_radius"), radius);
      gl.uniform1fv(self._u(self.progBlur, "u_weights"), weights);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    drawBlur(this.fboA.tex, this.fboB.fbo, [0, 1]);
    drawBlur(this.fboB.tex, this.fboC.fbo, [1, 0]);

    if (params.reference3DMode) {
      gl.useProgram(this.progRef);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this._bindLayers(this.progRef, count, 0);
      gl.uniform2fv(this._u(this.progRef, "u_sdfOffset"), offsets);
      gl.uniform1fv(this._u(this.progRef, "u_sdfScale"), scales);
      gl.uniform1fv(this._u(this.progRef, "u_refThickness"), thick);
      gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, this.fboA.tex);
      gl.uniform1i(this._u(this.progRef, "u_bg"), 4);
      gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, this.fboC.tex);
      gl.uniform1i(this._u(this.progRef, "u_blurredBg"), 5);
      gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, this.fgTex || this.bgTex);
      gl.uniform1i(this._u(this.progRef, "u_fg"), 6);
      gl.uniform2f(this._u(this.progRef, "u_resolution"), w, h);
      gl.uniform1f(this._u(this.progRef, "u_dpr"), dpr);
      gl.uniform1i(this._u(this.progRef, "u_hasFg"), this.fgTex ? 1 : 0);
      gl.uniform2f(this._u(this.progRef, "u_fgPos"), params.fgPos[0], params.fgPos[1]);
      gl.uniform1f(this._u(this.progRef, "u_fgScale"), params.fgScale);
      gl.uniform1f(this._u(this.progRef, "u_fgAspect"), this.fgAspect);
      gl.uniform1i(this._u(this.progRef, "u_liquidOverlayMode"), params.liquidOverlayMode || 0);
      gl.uniform1f(this._u(this.progRef, "u_liquidOverlayAmount"), params.liquidOverlayAmount || 0);
      gl.uniform1f(this._u(this.progRef, "u_liquidOverlayPhase"), params.liquidOverlayPhase || 0);
      const refTint = params.liquidOverlayTint || [1, 1, 1];
      gl.uniform3f(this._u(this.progRef, "u_liquidOverlayTint"), refTint[0], refTint[1], refTint[2]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      return;
    }

    gl.useProgram(this.progMain);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this._bindLayers(this.progMain, count, 0);
    gl.uniform2fv(this._u(this.progMain, "u_sdfOffset"), offsets);
    gl.uniform1fv(this._u(this.progMain, "u_sdfScale"), scales);
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, this.fboA.tex);
    gl.uniform1i(this._u(this.progMain, "u_bg"), 4);
    gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, this.fboC.tex);
    gl.uniform1i(this._u(this.progMain, "u_blurredBg"), 5);
    gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, this.fgTex || this.bgTex);
    gl.uniform1i(this._u(this.progMain, "u_fg"), 6);
    gl.uniform1f(this._u(this.progMain, "u_fgAspect"), this.fgAspect);
    gl.uniform1i(this._u(this.progMain, "u_hasFg"), this.fgTex ? 1 : 0);
    gl.uniform2f(this._u(this.progMain, "u_fgPos"), params.fgPos[0], params.fgPos[1]);
    gl.uniform1f(this._u(this.progMain, "u_fgScale"), params.fgScale);
    gl.uniform2f(this._u(this.progMain, "u_resolution"), w, h);
    gl.uniform1f(this._u(this.progMain, "u_dpr"), dpr);
    gl.uniform1f(this._u(this.progMain, "u_baseDpr"), params.baseDpr || dpr);
    gl.uniform1f(this._u(this.progMain, "u_lensMag"), params.lensMag || 0);
    gl.uniform1fv(this._u(this.progMain, "u_refThickness"), thick);
    gl.uniform1f(this._u(this.progMain, "u_refFactor"), params.refFactor);
    gl.uniform1f(this._u(this.progMain, "u_refDispersion"), params.refDispersion);
    gl.uniform1f(this._u(this.progMain, "u_refFresnelRange"), params.refFresnelRange);
    gl.uniform1f(this._u(this.progMain, "u_refFresnelHardness"), params.refFresnelHardness);
    gl.uniform1f(this._u(this.progMain, "u_refFresnelFactor"), params.refFresnelFactor);
    gl.uniform1f(this._u(this.progMain, "u_glareRange"), params.glareRange);
    gl.uniform1f(this._u(this.progMain, "u_glareHardness"), params.glareHardness);
    gl.uniform1f(this._u(this.progMain, "u_glareFactor"), params.glareFactor);
    gl.uniform1f(this._u(this.progMain, "u_glareConvergence"), params.glareConvergence);
    gl.uniform1f(this._u(this.progMain, "u_glareOppositeFactor"), params.glareOppositeFactor);
    gl.uniform1f(this._u(this.progMain, "u_glareAngle"), params.glareAngle);
    gl.uniform1f(this._u(this.progMain, "u_bodyFactor"), params.bodyFactor || 0);
    gl.uniform1f(this._u(this.progMain, "u_rimFactor"), params.rimFactor || 0);
    gl.uniform1f(this._u(this.progMain, "u_rimWidth"), params.rimWidth || 1);
    gl.uniform1f(this._u(this.progMain, "u_bevelFactor"), params.bevelFactor || 0);
    gl.uniform1f(this._u(this.progMain, "u_saturationFactor"), params.saturationFactor == null ? 1 : params.saturationFactor);
    gl.uniform1i(this._u(this.progMain, "u_liquidOverlayMode"), params.liquidOverlayMode || 0);
    gl.uniform1f(this._u(this.progMain, "u_liquidOverlayAmount"), params.liquidOverlayAmount || 0);
    gl.uniform1f(this._u(this.progMain, "u_liquidOverlayPhase"), params.liquidOverlayPhase || 0);
    const overlayTint = params.liquidOverlayTint || [1, 1, 1];
    gl.uniform3f(this._u(this.progMain, "u_liquidOverlayTint"), overlayTint[0], overlayTint[1], overlayTint[2]);
    gl.uniform4fv(this._u(this.progMain, "u_tint"), tints);
    gl.uniform1iv(this._u(this.progMain, "u_layerMode"), layerModes);
    gl.uniform1i(this._u(this.progMain, "u_blurEdge"), params.blurEdge ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  };

  // ------------------------------------------------------------------
  // 3) App state + UI wiring
  // ------------------------------------------------------------------
  // Design-space dimensions per aspect (the coordinate space for font size,
  // position, thickness). The exported PNG is rendered at a SCALE of these, up to
  // the source photo's native resolution — so a 6000×4000 import exports sharp.
  // 3:2 is sized 1500×1000 so an exact 4× lands on 6000×4000.
  const ASPECTS = { "16:9": [1280, 720], "3:2": [1500, 1000], "4:3": [1280, 960], "3:4": [1080, 1440] };
  const DPR = 2;
  // Multiplier applied to the whole render for high-resolution export. 1 during
  // preview; raised on export so font/SDF/blur/thickness all scale together and
  // the look is identical, just at full pixel resolution.
  let renderScale = 1;
  function currentDPR() { return DPR * renderScale; }
  const FONT_DEFAULT = 'Inter, "PingFang SC", system-ui, sans-serif';

  let renderer = null;
  let inited = false;
  let EXPORT_W = 1280, EXPORT_H = 720;
  const layers = [];
  let sel = 0;
  const fg = { x: 0.5, y: 0.5, scale: 1.0 };
  const glassFx = { bodyFactor: 0, rimFactor: 0, rimWidth: 1, bevelFactor: 0, saturationFactor: 100 };
  let dragFgMode = false;
  let activeBg = 0;
  let rafPending = false;
  let canvas = null;
  let lastBgSource = null; // Image or canvas of the current background (for vision)
  let lastStillBgSource = null;
  let activePresetKey = "clear";
  let motionVideo = null;
  let motionVideoUrl = "";
  let motionFrameId = 0;
  let motionPreviewStart = 0;
  let motionPreviewActive = false;
  let motionPreviewLastRender = 0;
  let motionExporting = false;
  let motionExportProgress = 0;
  const MOTION_PREVIEW_FPS = 30;

  const $ = (id) => document.getElementById(id);
  function isSolidLayer(L) { return L && L.renderMode === "solid"; }
  function layerColor(L) { return isSolidLayer(L) ? (L.solidColor || "#ffffff") : L.tintColor; }

  function makeLayer(over) {
    // The tool is CALLED Cover Glass: a fresh layer must show glass, or the
    // first open shows no glass anywhere. Solid (the 9to5Mac/B站 readable
    // title) is one checkbox away and is what the ninefive guard protects.
    return Object.assign({
      text: "Liquid\nGlass", font: FONT_DEFAULT, shape: null, shapeKind: null,
      fontSize: 170, fontWeight: 800, letterSpacing: 0, rotation: 0,
      cx: 0.5, cy: 0.5, renderMode: "glass", solidColor: "#ffffff",
      refThickness: 20, tintColor: "#ffffff", tintAlpha: 0,
    }, over || {});
  }

  // Quiet flat gradient shown only until the first photo decodes (or if one is
  // missing) so the canvas is never blank. Not a fake "photo" — the old
  // procedural scenes looked cheap and were removed.
  function neutralBg() {
    const c = document.createElement("canvas"); c.width = 1280; c.height = 720;
    const x = c.getContext("2d");
    const g = x.createLinearGradient(0, 0, 0, 720);
    g.addColorStop(0, "#e8edf3"); g.addColorStop(1, "#cfd8e3");
    x.fillStyle = g; x.fillRect(0, 0, 1280, 720);
    return c;
  }
  // Built-in backgrounds are fixed, high-quality photos served from disk
  // (assets/liquid-cover/bg-N.jpg).
  const BG_URLS = [
    "/assets/liquid-cover/bg-1.jpg",
    "/assets/liquid-cover/bg-2.jpg",
    "/assets/liquid-cover/bg-3.jpg",
    "/assets/liquid-cover/bg-4.jpg",
    "/assets/liquid-cover/bg-5.jpg",
    "/assets/liquid-cover/bg-6.jpg",
  ];
  let currentBgUrl = null;
  function setBgFromUrl(url) {
    clearMotionVideo(false);
    currentBgUrl = url;
    const img = new Image();
    img.onload = () => { if (currentBgUrl === url) { setBg(img); } };
    img.onerror = () => { if (currentBgUrl === url && (!renderer || !renderer.bgTex)) { setBg(neutralBg()); } };
    img.src = url;
  }

  // The recipe table is the SINGLE SOURCE OF TRUTH for "what good glass looks
  // like". Every numeric optic lives here, hand-tuned and verified against the
  // fixed shader — never invented by a model. The preset buttons apply these
  // directly; the AI path only *chooses* one by key (plus a tint + light) and
  // the code does the numeric mapping. `desc` is plain language the model can
  // actually reason about, and it is also what the prompt catalog is built from.
  // Optics are pinned to the MB / liquid-glass-studio base, plus our convex-lens
  // magnification (`lens`) which is what makes thick glass actually magnify the
  // background like the reference — flat STEP9 refraction alone can't. IOR stays
  // in the clean 1.4–1.6 band (2.0 caused the old metal/rainbow look).
  const PRESETS = [
    // "clear" is the official liquid-glass-studio demo-shape material, read off
    // the studio's own panel: invisible water-clear body, bright refractive edges
    // with prismatic dispersion, no tint, no frost (blur 1), no magnification.
    { key: "clear", mixValue: 0, desc: "water-clear official glass — fully transparent body showing the background 1:1, bright crisp refractive edges with a prismatic sparkle; subtle and premium",
      p: { refFactor: 1.4, lens: 0, dispersion: 7, fresnelRange: 30, fresnelFactor: 20, glareRange: 30, glareFactor: 90, glareConvergence: 50, glareAngle: -45, blurEdge: true, blurRadius: 1, shadowFactor: 8, shadowExpand: 18, thickness: 20, tintColor: "#ffffff", tintAlpha: 0, bodyFactor: 0, rimFactor: 0, rimWidth: 1, bevelFactor: 0, saturationFactor: 100 } },
    // "frosted" is crystal glass: thinner than "thick", clearer than "milky",
    // with a bright rim and low frost so it reads as sparkling, not opaque.
    { key: "frosted", mixValue: 55, desc: "crystal frosted glass — clear body, bright rim, light frost; limpid and luminous rather than milky",
      p: { refFactor: 1.48, lens: 8, dispersion: 3, fresnelRange: 26, fresnelFactor: 96, glareRange: 34, glareFactor: 110, glareConvergence: 52, glareAngle: -50, blurEdge: true, blurRadius: 10, shadowFactor: 14, shadowExpand: 16, thickness: 48, tintColor: "#ffffff", tintAlpha: 8, bodyFactor: 0, rimFactor: 20, rimWidth: 1.6, bevelFactor: 0, saturationFactor: 100 } },
    // "milky" is the soft-white material: real white body, lower sparkle, more
    // blur, and less background colour than the clear/crystal family.
    { key: "milky", mixValue: 75, desc: "solid milky frosted glass — a soft opaque-feeling white block with the background gently glowing through; calm and substantial",
      p: { refFactor: 1.45, lens: 4, dispersion: 1, fresnelRange: 38, fresnelFactor: 52, glareRange: 48, glareFactor: 35, glareConvergence: 45, glareAngle: -50, blurEdge: true, blurRadius: 36, shadowFactor: 24, shadowExpand: 24, thickness: 72, tintColor: "#ffffff", tintAlpha: 52, bodyFactor: 38, rimFactor: 12, rimWidth: 3, bevelFactor: 0, saturationFactor: 80 } },
    // "thinfrost" is the quiet veil: low thickness, no lens, modest white veil.
    // It should be useful when the title must stay understated.
    { key: "thinfrost", mixValue: 30, desc: "thin veiled glass — a flat light pane with a soft white veil and gentle frost, like the Apple lock-screen clock; quiet and elegant",
      p: { refFactor: 1.38, lens: 0, dispersion: 6, fresnelRange: 30, fresnelFactor: 58, glareRange: 36, glareFactor: 55, glareConvergence: 58, glareAngle: -50, blurEdge: false, blurRadius: 12, shadowFactor: 10, shadowExpand: 16, thickness: 18, tintColor: "#ffffff", tintAlpha: 18, bodyFactor: 0, rimFactor: 0, rimWidth: 1, bevelFactor: 0, saturationFactor: 90 } },
    // "thick" is the physical chunk: highest magnification, heavy thickness,
    // and stronger rim weight, but less white milk than "milky".
    { key: "thick", mixValue: 85, desc: "heavy chunky glass with strong magnification and bold bright edges — dramatic, poster-like",
      p: { refFactor: 1.58, lens: 22, dispersion: 1.2, fresnelRange: 22, fresnelFactor: 88, glareRange: 30, glareFactor: 70, glareConvergence: 62, glareAngle: -50, blurEdge: false, blurRadius: 8, shadowFactor: 30, shadowExpand: 20, thickness: 96, tintColor: "#ffffff", tintAlpha: 12, bodyFactor: 4, rimFactor: 28, rimWidth: 2.4, bevelFactor: 0, saturationFactor: 105 } },
    // "tinted" exists for colour systems: the visible difference is the colour
    // cast itself, not merely more blur or more thickness.
    { key: "tinted", mixValue: 100, desc: "thick glass carrying a gentle colour cast — when the title should hold a brand or mood colour",
      p: { refFactor: 1.48, lens: 6, dispersion: 2, fresnelRange: 30, fresnelFactor: 70, glareRange: 36, glareFactor: 62, glareConvergence: 52, glareAngle: -50, blurEdge: false, blurRadius: 12, shadowFactor: 18, shadowExpand: 18, thickness: 54, tintColor: "#5ac8fa", tintAlpha: 52, bodyFactor: 8, rimFactor: 10, rimWidth: 1.8, bevelFactor: 0, saturationFactor: 120 } },
    { key: "ninefive", mixValue: 75, desc: "9to5Mac hero logo glass — oversized logo or number rendered as a milky translucent glass object, crisp white bevel rim, soft editorial shadow, with product/subject optionally placed in front",
      p: { refFactor: 1.5, lens: 5, dispersion: 1.2, fresnelRange: 24, fresnelFactor: 88, glareRange: 34, glareFactor: 48, glareConvergence: 58, glareAngle: -50, blurEdge: true, blurRadius: 24, shadowFactor: 28, shadowExpand: 20, thickness: 86, tintColor: "#ffffff", tintAlpha: 30, bodyFactor: 52, rimFactor: 110, rimWidth: 4.6, bevelFactor: 0, saturationFactor: 96, layerMode: "glass" } },
    // "ios27" transcribes Apple's macOS 27 Sketch UI Kit / Materials page:
    // Regular - Small - Tinted uses 6px Gaussian blur, 1.25px bilateral X
    // hairlines, Y±40 glow, X±20 side light, and a 0/8/15 4% shadow. We keep
    // the renderer's official Distortion 30 / Saturation 40 values for the
    // custom Glass term, but the frost/shadow now come from the visible Sketch
    // resource instead of the earlier large-control guess.
    { key: "ios27", mixValue: 0, desc: "iOS 27 official glass — the neutral Apple UI Kit material (shared across iOS/macOS 27): a near-clear body with paired side/top/bottom hairlines, a soft top light wash, and a barely-there 4% floating shadow",
      p: { refFactor: 1.45, lens: 30, dispersion: 0, fresnelRange: 26, fresnelFactor: 34, glareRange: 34, glareFactor: 10, glareConvergence: 62, glareAngle: -50, blurEdge: true, blurRadius: 6, shadowFactor: 4, shadowExpand: 15, thickness: 90, tintColor: "#ffffff", tintAlpha: 8, bodyFactor: 4, rimFactor: 10, rimWidth: 1.25, bevelFactor: 90, saturationFactor: 40, layerMode: "glass" } },
  ];
  const RECIPE_KEYS = PRESETS.map((r) => r.key);
  function recipeByKey(k) { return PRESETS.find((r) => r.key === String(k).toLowerCase()) || null; }
  function recipeLabel(k) { return (typeof t === "function" && t("liquid_cover_preset_" + k)) || k; }
  // The Glass Mix slider is the clear→tinted MATERIAL continuum only. Editorial
  // presets (ios27, ninefive) carry bevel/layerMode/saturation and are NOT
  // points on this axis — dragging through them would silently flip those on.
  const MATERIAL_STOPS = [
    { value: 0, key: "clear" },
    { value: 30, key: "thinfrost" },
    { value: 55, key: "frosted" },
    { value: 75, key: "milky" },
    { value: 100, key: "tinted" },
  ];
  const MATERIAL_NUMERIC_FIELDS = [
    "refFactor", "lens", "dispersion", "fresnelRange", "fresnelFactor",
    "glareRange", "glareFactor", "glareConvergence", "glareAngle",
    "blurRadius", "shadowFactor", "shadowExpand", "thickness", "tintAlpha", "bodyFactor", "rimFactor", "rimWidth", "bevelFactor", "saturationFactor",
  ];
  function lerp(a, b, x) { return a + (b - a) * x; }
  function mixHex(a, b, x) {
    const ar = hexToRgb(a), br = hexToRgb(b);
    const c = ar.map((v, i) => Math.round(lerp(v, br[i], x) * 255));
    return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
  }
  function materialStopForKey(k) {
    return MATERIAL_STOPS.find((s) => s.key === k) || null;
  }
  function presetMixValue(k) {
    const stop = materialStopForKey(k);
    if (stop) return stop.value;
    const recipe = recipeByKey(k);
    return recipe && recipe.mixValue != null ? recipe.mixValue : null;
  }
  function materialRecipeAt(value) {
    const v = clampNum(value, 0, 100, 55);
    let lo = MATERIAL_STOPS[0], hi = MATERIAL_STOPS[MATERIAL_STOPS.length - 1];
    for (let i = 0; i < MATERIAL_STOPS.length - 1; i++) {
      if (v >= MATERIAL_STOPS[i].value && v <= MATERIAL_STOPS[i + 1].value) {
        lo = MATERIAL_STOPS[i]; hi = MATERIAL_STOPS[i + 1]; break;
      }
    }
    const a = recipeByKey(lo.key), b = recipeByKey(hi.key);
    const x = hi.value === lo.value ? 0 : (v - lo.value) / (hi.value - lo.value);
    const p = {};
    MATERIAL_NUMERIC_FIELDS.forEach((field) => { p[field] = lerp(a.p[field], b.p[field], x); });
    p.blurEdge = x < 0.5 ? a.p.blurEdge : b.p.blurEdge;
    p.tintColor = mixHex(a.p.tintColor, b.p.tintColor, x);
    return p;
  }
  function setMaterialMixValue(value) {
    const el = $("lc-material-mix");
    if (el) el.value = clampNum(value, 0, 100, 55);
  }
  function materialKeyAtExactValue(value) {
    const v = clampNum(value, 0, 100, 55);
    const hit = MATERIAL_STOPS.find((s) => Math.abs(s.value - v) < 0.001);
    return hit ? hit.key : "";
  }
  function syncMaterialMixToRecipe(k) {
    const value = presetMixValue(k);
    if (value != null) setMaterialMixValue(value);
  }
  function applyMaterialMix(value) {
    setMaterialMixValue(value);
    applyPreset(materialRecipeAt(value));
    setActivePreset(materialKeyAtExactValue(value));
  }

  // --- the model→physics mapping. The model only ever speaks in these closed
  // vocabularies; the numbers all live on this side of the boundary. ---
  const TINT_STRENGTH = { none: 0, subtle: 12, medium: 24, strong: 38 };
  // Light direction (where the brightest light comes from) → glare streak angle.
  const LIGHT_ANGLE = { top: 90, "top-left": 135, left: 180, "bottom-left": -135, bottom: -90, "bottom-right": -45, right: 0, "top-right": 45 };
  function adjCtl(id, d, min, max) { const x = $(id); if (x) x.value = clampNum(+x.value + d, min, max, +x.value); }
  function adjLayerField(f, d, min, max) { layers.forEach((L) => { L[f] = clampNum((+L[f] || 0) + d, min, max, +L[f] || 0); }); }
  // Bounded modifier vocabulary: each word maps to a deterministic delta. This is
  // how the model nudges a recipe without ever touching a raw number.
  const MODIFIER_FX = {
    brighter: () => { adjCtl("lc-glare-factor", 15, 0, 120); adjCtl("lc-fresnel-factor", 8, 0, 100); },
    softer: () => { adjCtl("lc-glare-factor", -15, 0, 120); adjCtl("lc-blur-radius", 8, 0, 80); },
    thinner: () => { adjLayerField("refThickness", -10, 0, 100); },
    thicker: () => { adjLayerField("refThickness", 12, 0, 100); },
    "more-frosted": () => { const be = $("lc-blur-edge"); if (be) be.checked = true; adjCtl("lc-blur-radius", 16, 0, 80); },
    clearer: () => { adjCtl("lc-blur-radius", -12, 0, 80); adjLayerField("tintAlpha", -10, 0, 100); },
    "more-color": () => { adjLayerField("tintAlpha", 16, 0, 100); },
    "more-dispersion": () => { adjCtl("lc-dispersion", 6, 0, 50); },
  };
  // Background-adaptive geometry. The vision model only judges how BUSY the photo
  // is (a real, groundable image property); the code decides what that means for
  // the glass: a busy photo wants thinner + more frosted glass so the title stays
  // readable; a clean photo can carry slightly thicker, clearer glass.
  // The 9to5Mac milky body adapts with the photo (guarded: regular recipes
  // keep bodyFactor 0 and are untouched). Reference covers show the pattern:
  // dark / busy backdrops get MORE milk so the logo separates; bright clean
  // ones go clearer and let the background hue flood the glass.
  function adjBody(d) { if (glassFx.bodyFactor > 0) glassFx.bodyFactor = clampNum(glassFx.bodyFactor + d, 10, 80, glassFx.bodyFactor); }
  const BUSYNESS_FX = {
    busy: () => { adjLayerField("refThickness", -8, 0, 100); const be = $("lc-blur-edge"); if (be) be.checked = true; adjCtl("lc-blur-radius", 12, 0, 80); adjLayerField("tintAlpha", 8, 0, 100); adjBody(8); },
    moderate: () => { /* leave the recipe as-is */ },
    clean: () => { adjLayerField("refThickness", 6, 0, 100); adjCtl("lc-blur-radius", -6, 0, 80); adjBody(-8); },
  };
  // Background-adaptive shadow. The vision model judges the backdrop's TONE
  // (another groundable image property); the code decides what that means for
  // the contact shadow: on a dark photo a shadow can't ground anything — it only
  // stains the image, so it nearly vanishes; on a bright photo the shadow is what
  // makes the glass float (the Apple reference look), so it keeps its strength
  // but spreads softer. Mid tones keep the recipe values.
  const BACKDROP_FX = {
    // proportional, not a fixed delta: "nearly zero" must hold for heavy
    // recipes too (thick 30 → 9), not just clear (8 → 2)
    dark: () => { const x = $("lc-shadow-factor"); if (x) x.value = Math.round(+x.value * 0.3); adjCtl("lc-shadow-expand", -6, 2, 100); adjBody(10); },
    mid: () => { /* leave the recipe as-is */ },
    light: () => { adjCtl("lc-shadow-expand", 6, 2, 100); adjBody(-8); },
  };
  // Small local models drift off the enum; map close synonyms instead of
  // silently dropping the judgment.
  const BACKDROP_ALIAS = { bright: "light", white: "light", pale: "light", medium: "mid", middle: "mid", neutral: "mid", black: "dark", deep: "dark", night: "dark" };
  function applyBackdrop(name) {
    let k = String(name).toLowerCase();
    if (!BACKDROP_FX[k]) k = BACKDROP_ALIAS[k] || k;
    const fn = BACKDROP_FX[k];
    if (fn) { fn(); return k; }
    return null;
  }
  function applyRecipeByName(k) { const r = recipeByKey(k); if (r) { syncMaterialMixToRecipe(r.key); applyPreset(r.p); setActivePreset(r.key); } return r; }
  function applyTintStrength(s) { const a = TINT_STRENGTH[String(s).toLowerCase()]; if (a == null) return false; layers.forEach((L) => { L.tintAlpha = a; }); return true; }
  // The vision tint is a COLOR-harmony call, not a material change: "none"
  // keeps the recipe's own veil (a thick recipe's 30% white IS its body — the
  // model declining a colour must not strip it), and a colorless recipe
  // (clear, tintAlpha 0) never takes more than a subtle tint, so 通透 stays 通透.
  // Returns the strength actually applied (possibly capped), so the status
  // line reports what happened — never the model's uncapped wish.
  function applyVisionTint(spec, recipe) {
    let strength = String(spec.tintStrength || "").toLowerCase();
    if (!validHex(spec.tintColor) || TINT_STRENGTH[strength] == null || strength === "none") return null;
    if (recipe && recipe.p.tintAlpha === 0 && TINT_STRENGTH[strength] > TINT_STRENGTH.subtle) strength = "subtle";
    layers.forEach((L) => { L.tintColor = spec.tintColor; });
    applyTintStrength(strength);
    return strength;
  }
  function lightToAngle(name) { const a = LIGHT_ANGLE[String(name).toLowerCase()]; return a == null ? null : a; }
  function applyModifiers(list) { if (!Array.isArray(list)) return []; const done = []; list.slice(0, 3).forEach((m) => { const fn = MODIFIER_FX[String(m).toLowerCase()]; if (fn) { fn(); done.push(m); } }); return done; }
  function applyBusyness(name) { const fn = BUSYNESS_FX[String(name).toLowerCase()]; if (fn) { fn(); return String(name).toLowerCase(); } return null; }
  function setSlider(id, v, min, max) { if (v == null) return; const x = $(id); if (x) x.value = clampNum(v, min, max, +x.value); }
  function applyPreset(p) {
    if (p.bodyFactor != null) glassFx.bodyFactor = p.bodyFactor;
    if (p.rimFactor != null) glassFx.rimFactor = p.rimFactor;
    if (p.rimWidth != null) glassFx.rimWidth = p.rimWidth;
    if (p.bevelFactor != null) glassFx.bevelFactor = p.bevelFactor;
    if (p.saturationFactor != null) glassFx.saturationFactor = p.saturationFactor;
    setSlider("lc-ref-factor", p.refFactor, 1, 4);
    setSlider("lc-lens", p.lens, 0, 30);
    setSlider("lc-dispersion", p.dispersion, 0, 50);
    setSlider("lc-fresnel-range", p.fresnelRange, 1, 100);
    setSlider("lc-fresnel-factor", p.fresnelFactor, 0, 100);
    setSlider("lc-glare-angle", p.glareAngle, -180, 180);
    setSlider("lc-glare-range", p.glareRange, 1, 100);
    setSlider("lc-glare-factor", p.glareFactor, 0, 120);
    setSlider("lc-glare-convergence", p.glareConvergence, 0, 100);
    setSlider("lc-blur-radius", p.blurRadius, 0, 80);
    setSlider("lc-shadow-factor", p.shadowFactor, 0, 100);
    setSlider("lc-shadow-expand", p.shadowExpand, 2, 100);
    if (typeof p.blurEdge === "boolean") { const be = $("lc-blur-edge"); if (be) be.checked = p.blurEdge; }
    layers.forEach((L) => {
      // layerMode only retargets shape/logo layers. Text layers keep their
      // solid/glass choice: in the 9to5Mac grammar the title is ALWAYS the
      // readable solid layer — a material preset must never strip that.
      if ((p.layerMode === "glass" || p.layerMode === "solid") && (L.shape || L.shapeKind)) L.renderMode = p.layerMode;
      if (p.thickness != null) L.refThickness = p.thickness;
      if (p.tintColor) L.tintColor = p.tintColor;
      if (p.tintAlpha != null) L.tintAlpha = p.tintAlpha;
    });
    loadLayerIntoPanel(); syncValueLabels(); renderNow(); scheduleRender();
  }
  function buildPresetRow() {
    const row = $("lc-preset-row");
    if (!row) return;
    row.innerHTML = "";
    PRESETS.forEach((pr) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "btn";
      b.dataset.presetKey = pr.key;
      b.setAttribute("aria-pressed", "false");
      b.textContent = (typeof t === "function" && t("liquid_cover_preset_" + pr.key)) || pr.key;
      b.addEventListener("click", () => onPresetClick(pr));
      row.appendChild(b);
    });
    syncPresetButtons();
  }
  function syncPresetButtons() {
    document.querySelectorAll("#liquid-cover-app [data-preset-key]").forEach((button) => {
      const active = button.dataset.presetKey === activePresetKey;
      button.classList.toggle("default", active);
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }
  function setActivePreset(key) {
    activePresetKey = key || "";
    syncPresetButtons();
  }

  // Click a preset: apply the verified recipe deterministically. Background-aware
  // adaptation belongs to the bottom mood/config bar, otherwise the button label
  // stops matching the final rendered result.
  function onPresetClick(pr) {
    syncMaterialMixToRecipe(pr.key);
    applyPreset(pr.p);
    setActivePreset(pr.key);
    aiStatusText("");
  }

  // A short, human-readable account of what the model decided — so the result is
  // explainable, never "magic". e.g. "通透 · 微染 #88c0ff · 光：左上".
  function describeChoice(c) {
    const parts = [recipeLabel(c.recipe)];
    if (validHex(c.tintColor) && c.tintStrength && String(c.tintStrength).toLowerCase() !== "none") {
      const tw = (typeof t === "function" && t("liquid_cover_tint_" + String(c.tintStrength).toLowerCase())) || c.tintStrength;
      parts.push(tw + " " + c.tintColor);
    }
    if (c.light && LIGHT_ANGLE[String(c.light).toLowerCase()] != null) {
      const lw = (typeof t === "function" && t("liquid_cover_light_" + String(c.light).toLowerCase())) || c.light;
      const ll = (typeof t === "function" && t("liquid_cover_light_label")) || "light";
      parts.push(ll + ": " + lw);
    }
    if (c.busyness && BUSYNESS_FX[String(c.busyness).toLowerCase()]) {
      const bw = (typeof t === "function" && t("liquid_cover_busy_" + String(c.busyness).toLowerCase())) || c.busyness;
      parts.push(bw);
    }
    if (c.backdrop && BACKDROP_FX[String(c.backdrop).toLowerCase()]) {
      const dw = (typeof t === "function" && t("liquid_cover_backdrop_" + String(c.backdrop).toLowerCase())) || c.backdrop;
      parts.push(dw);
    }
    if (Array.isArray(c.modifiers) && c.modifiers.length) parts.push(c.modifiers.join(", "));
    return parts.join(" · ");
  }

  // Preview supersampling: rasterize the text SDF and render at 2x the design
  // dims, displayed at the design aspect — the browser's downsample is the AA.
  // The studio's analytic superellipse SDF is smooth at any density; our
  // rasterized text SDF (EDT over a glyph raster) is not, so sampling density
  // is what kills the jagged edge and the noisy glare band.
  const PREVIEW_SS = 2;
  let DESIGN_W = 1280, DESIGN_H = 720;
  function applyAspect(w, h) {
    DESIGN_W = w; DESIGN_H = h;
    renderScale = PREVIEW_SS;
    EXPORT_W = w * PREVIEW_SS; EXPORT_H = h * PREVIEW_SS;
    canvas.width = EXPORT_W; canvas.height = EXPORT_H;
    canvas.style.aspectRatio = w + " / " + h;
    updateExportDimNote();
  }
  function sourceWidth(src) { return src ? (src.videoWidth || src.naturalWidth || src.width || 0) : 0; }
  function sourceHeight(src) { return src ? (src.videoHeight || src.naturalHeight || src.height || 0) : 0; }
  function setBg(src) {
    lastBgSource = src;
    lastStillBgSource = src;
    if (renderer) { renderer.setBackground(src); scheduleRender(); }
    updateExportDimNote();
  }
  function motionDurationSeconds() {
    const el = $("lc-motion-duration");
    return clampNum(el ? +el.value : 2, 1, 6, 2);
  }
  function motionPresetKey() {
    const el = $("lc-motion-preset");
    return el ? el.value : "none";
  }
  function motionProgress() {
    if (motionExporting) return motionExportProgress;
    if (!motionPreviewActive) return 1;
    const duration = motionDurationSeconds() * 1000;
    if (!duration) return 0;
    if (!motionPreviewStart) return 0;
    return clampNum((performance.now() - motionPreviewStart) / duration, 0, 1, 0);
  }
  function stopMotionPreview(renderFinal) {
    if (motionFrameId) {
      cancelAnimationFrame(motionFrameId);
      motionFrameId = 0;
    }
    motionPreviewActive = false;
    motionPreviewStart = 0;
    motionPreviewLastRender = 0;
    if (motionVideo) {
      try { motionVideo.pause(); } catch (e) { /* noop */ }
    }
    if (renderFinal) renderNow();
  }
  function scheduleMotionPreview() {
    if (motionFrameId) {
      cancelAnimationFrame(motionFrameId);
      motionFrameId = 0;
    }
    if (motionExporting || !motionPreviewActive) return;
    const frameMs = 1000 / MOTION_PREVIEW_FPS;
    const tick = (now) => {
      const win = document.querySelector(".liquid-cover-window");
      if (win && win.classList.contains("is-hidden")) {
        motionFrameId = 0;
        stopMotionPreview(false);
        return;
      }
      const progress = motionProgress();
      if (!motionPreviewLastRender || now - motionPreviewLastRender >= frameMs || progress >= 1) {
        motionPreviewLastRender = now;
        renderNow();
      }
      if (progress >= 1) {
        motionFrameId = 0;
        stopMotionPreview(false);
        renderNow();
        aiStatusText(tr("liquid_cover_ai_motion_preview_done", "Preview complete."));
        return;
      }
      motionFrameId = requestAnimationFrame(tick);
    };
    motionFrameId = requestAnimationFrame(tick);
  }
  async function previewMotionOnce() {
    if (!renderer) return;
    stopMotionPreview(false);
    const duration = motionDurationSeconds();
    if (motionVideo) {
      await seekMotionVideo(0);
      motionVideo.loop = false;
      motionVideo.muted = true;
      motionVideo.playbackRate = (motionVideo.duration && isFinite(motionVideo.duration))
        ? clampNum(motionVideo.duration / duration, 0.25, 4, 1)
        : 1;
      await motionVideo.play().catch(() => {});
    }
    motionPreviewActive = true;
    motionPreviewStart = performance.now();
    motionPreviewLastRender = 0;
    aiStatusText(tr("liquid_cover_ai_motion_previewing", "Previewing animation…"));
    scheduleMotionPreview();
  }
  function clearMotionVideo(restoreStill) {
    stopMotionPreview(false);
    if (motionVideo) {
      try { motionVideo.pause(); } catch (e) { /* noop */ }
    }
    if (motionVideoUrl) URL.revokeObjectURL(motionVideoUrl);
    motionVideo = null;
    motionVideoUrl = "";
    const clear = $("lc-motion-clear");
    if (clear) clear.hidden = true;
    const name = $("lc-motion-name");
    if (name) {
      name.setAttribute("data-i18n", "no_files_selected");
      name.textContent = tr("no_files_selected", "No files selected");
    }
    if (restoreStill !== false) setBg(lastStillBgSource || neutralBg());
  }
  function setMotionVideoFile(file) {
    clearMotionVideo(false);
    const video = document.createElement("video");
    motionVideoUrl = URL.createObjectURL(file);
    motionVideo = video;
    video.preload = "auto";
    video.loop = false;
    video.muted = true;
    video.playsInline = true;
    const name = $("lc-motion-name");
    if (name) {
      name.removeAttribute("data-i18n");
      name.textContent = file.name || "Motion video";
    }
    const clear = $("lc-motion-clear");
    if (clear) clear.hidden = false;
    aiStatusText(tr("liquid_cover_ai_motion_loading", "Loading motion video…"));
    let firstFramePainted = false;
    const paintVideoFrame = () => {
      if (motionVideo !== video || !renderer || renderer.bgVideo !== video) return false;
      const painted = renderer.updateBackgroundVideoFrame();
      if (painted) {
        renderNow();
        if (!firstFramePainted) {
          firstFramePainted = true;
          aiStatusText(tr("liquid_cover_ai_motion_loaded", "Motion video loaded."));
        }
      }
      return painted;
    };
    const requestFirstFrame = () => {
      if (typeof video.requestVideoFrameCallback !== "function") return;
      video.requestVideoFrameCallback(() => {
        paintVideoFrame();
      });
    };
    video.addEventListener("loadedmetadata", () => {
      if (motionVideo !== video || !renderer) return;
      lastBgSource = video;
      renderer.setBackgroundVideo(video);
      updateExportDimNote();
      const dur = $("lc-motion-duration");
      if (dur && isFinite(video.duration) && video.duration > 0) {
        dur.value = clampNum(video.duration, 1, 6, 2).toFixed(1);
        syncValueLabels();
      }
      paintVideoFrame();
      requestFirstFrame();
    });
    video.addEventListener("loadeddata", () => {
      paintVideoFrame();
      requestFirstFrame();
    });
    video.addEventListener("canplay", paintVideoFrame);
    video.addEventListener("playing", () => {
      paintVideoFrame();
      requestFirstFrame();
    });
    video.addEventListener("error", () => aiStatus("motion_load_error", "Motion video could not be loaded."));
    video.src = motionVideoUrl;
    video.load();
  }

  // --- production export: render at the SOURCE photo's full resolution ---
  // Design dims define layout; export multiplies them up to the imported photo's
  // native long edge (so a 6000×4000 import exports 6000×4000), clamped to the
  // GPU's max texture size. Never downscales below the preview.
  function exportTargetDims() {
    const a = ASPECTS[activeAspectKey()] || [DESIGN_W, DESIGN_H];
    const baseW = a[0], baseH = a[1], baseLong = Math.max(baseW, baseH);
    const sel = $("lc-export-res");
    const mode = sel ? sel.value : "source";
    let scale;
    if (mode === "source") {
      const nw = sourceWidth(lastBgSource);
      const nh = sourceHeight(lastBgSource);
      const nativeLong = Math.max(nw, nh);
      scale = nativeLong ? nativeLong / baseLong : 4;
    } else {
      scale = +mode || 1;
    }
    scale = Math.max(1, scale);
    const maxTex = (renderer && renderer.gl && renderer.gl.getParameter(renderer.gl.MAX_TEXTURE_SIZE)) || 4096;
    if (baseLong * scale > maxTex) scale = maxTex / baseLong;
    return { scale, w: Math.round(baseW * scale), h: Math.round(baseH * scale) };
  }
  function updateExportDimNote() {
    const el = $("lc-export-dim"); if (!el) return;
    const d = exportTargetDims();
    el.textContent = (typeof t === "function" && t("liquid_cover_export_dim_prefix") || "PNG") + " " + d.w + " × " + d.h + " px";
  }
  function exportPng() {
    if (!renderer) return;
    const d = exportTargetDims();
    const restore = () => {
      applyAspect(DESIGN_W, DESIGN_H);
      rebuildAllSDF(); renderNow();
    };
    try {
      aiStatusText(tr("liquid_cover_ai_exporting", "Rendering") + " " + d.w + "×" + d.h + "…");
      // Export supersampling: render 2x the target and downsample once at the
      // end. The PNG ships at exactly d.w × d.h — never below the promise — but
      // every output pixel averages 4 rendered samples, so glyph edges and the
      // glare band stay clean at any size. Skipped when 2x would exceed the GPU.
      const maxTex = (renderer.gl && renderer.gl.getParameter(renderer.gl.MAX_TEXTURE_SIZE)) || 4096;
      const ss = (d.w * 2 <= maxTex && d.h * 2 <= maxTex) ? 2 : 1;
      renderScale = d.scale * ss;
      EXPORT_W = d.w * ss; EXPORT_H = d.h * ss;
      canvas.width = EXPORT_W; canvas.height = EXPORT_H;
      rebuildAllSDF();
      renderer.render(readParams());
      let blobSource = canvas;
      if (ss > 1) {
        const down = document.createElement("canvas");
        down.width = d.w; down.height = d.h;
        const ctx = down.getContext("2d");
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(canvas, 0, 0, d.w, d.h);
        blobSource = down;
      }
      blobSource.toBlob((blob) => {
        if (blob) {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "liquid-glass-" + d.w + "x" + d.h + ".png";
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 1000);
          aiStatusText(tr("liquid_cover_ai_exported", "Exported") + " " + d.w + "×" + d.h + " PNG");
        } else {
          aiStatus("error", "Export failed");
        }
        restore();
      }, "image/png");
    } catch (e) {
      restore();
      aiStatus("error", "Export failed (resolution too high for this GPU)");
    }
  }

  function pickVideoMime() {
    if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return "";
    const candidates = [
      'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
      "video/mp4",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ];
    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
  }
  function seekMotionVideo(time) {
    if (!motionVideo) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        motionVideo.removeEventListener("seeked", done);
        resolve();
      };
      motionVideo.addEventListener("seeked", done, { once: true });
      try {
        motionVideo.currentTime = Math.max(0, Math.min(time, motionVideo.duration || time || 0));
      } catch (e) {
        motionVideo.removeEventListener("seeked", done);
        resolve();
      }
      setTimeout(done, 600);
    });
  }
  function downloadBlob(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  async function exportVideo() {
    if (!renderer) return;
    if (typeof MediaRecorder === "undefined" || !canvas.captureStream) {
      aiStatus("motion_unsupported", "Video export is not supported in this browser.");
      return;
    }
    const mimeType = pickVideoMime();
    const duration = motionDurationSeconds();
    const fps = 30;
    const prevMuted = motionVideo ? motionVideo.muted : true;
    const prevPlaybackRate = motionVideo ? motionVideo.playbackRate : 1;
    const prevExportW = EXPORT_W, prevExportH = EXPORT_H, prevScale = renderScale;
    stopMotionPreview();
    motionExporting = true;
    motionExportProgress = 0;
    try {
      renderScale = 1;
      EXPORT_W = DESIGN_W;
      EXPORT_H = DESIGN_H;
      canvas.width = EXPORT_W;
      canvas.height = EXPORT_H;
      rebuildAllSDF();
      if (motionVideo) {
        await seekMotionVideo(0);
        motionVideo.loop = false;
        motionVideo.playbackRate = (motionVideo.duration && isFinite(motionVideo.duration))
          ? clampNum(motionVideo.duration / duration, 0.25, 4, 1)
          : 1;
        motionVideo.muted = !$("lc-motion-audio")?.checked;
        await motionVideo.play().catch(() => {});
      }
      const stream = canvas.captureStream(fps);
      const sourceStream = motionVideo && $("lc-motion-audio")?.checked && typeof motionVideo.captureStream === "function"
        ? motionVideo.captureStream()
        : null;
      if (sourceStream) {
        sourceStream.getAudioTracks().forEach((track) => stream.addTrack(track));
      }
      const chunks = [];
      const recorder = new MediaRecorder(stream, Object.assign(
        { videoBitsPerSecond: 9000000 },
        mimeType ? { mimeType } : {},
      ));
      const stopped = new Promise((resolve) => {
        recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
        recorder.onstop = resolve;
      });
      aiStatusText(tr("liquid_cover_ai_motion_exporting", "Recording video…"));
      recorder.start(200);
      const started = performance.now();
      await new Promise((resolve) => {
        const tick = (now) => {
          motionExportProgress = clampNum((now - started) / (duration * 1000), 0, 1, 0);
          renderNow();
          if (motionExportProgress < 1) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
      });
      recorder.stop();
      await stopped;
      stream.getTracks().forEach((track) => track.stop());
      const outType = mimeType || (chunks[0] && chunks[0].type) || "video/webm";
      const blob = new Blob(chunks, { type: outType });
      const ext = /mp4/i.test(outType) ? "mp4" : "webm";
      downloadBlob(blob, "liquid-glass-intro-" + DESIGN_W + "x" + DESIGN_H + "." + ext);
      aiStatusText(tr("liquid_cover_ai_motion_exported", "Video exported."));
    } catch (e) {
      aiStatus("motion_error", "Video export failed.");
    } finally {
      if (motionVideo) {
        motionVideo.muted = prevMuted;
        motionVideo.loop = false;
        motionVideo.playbackRate = prevPlaybackRate;
        try { motionVideo.pause(); } catch (e) { /* noop */ }
      }
      motionExporting = false;
      motionExportProgress = 0;
      renderScale = prevScale;
      EXPORT_W = prevExportW;
      EXPORT_H = prevExportH;
      canvas.width = EXPORT_W;
      canvas.height = EXPORT_H;
      rebuildAllSDF();
      renderNow();
    }
  }

  // Downscale the current background to a compact JPEG data URL so a
  // vision-capable model can read it (complementary tint / light direction).
  function currentBgDataUrl(maxEdge) {
    if (!lastBgSource) return null;
    const w = sourceWidth(lastBgSource);
    const h = sourceHeight(lastBgSource);
    if (!w || !h) return null;
    const scale = Math.min(1, maxEdge / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(h * scale));
    const c = document.createElement("canvas");
    c.width = cw; c.height = ch;
    const ctx = c.getContext("2d");
    ctx.drawImage(lastBgSource, 0, 0, cw, ch);
    try { return c.toDataURL("image/jpeg", 0.85); } catch (e) { return null; }
  }

  // A light separable box blur on the distance field. The Felzenszwalb EDT on a
  // pixel raster yields a faceted field (nearest-edge-pixel Voronoi cells); those
  // facets become a ribbed edge when zoomed. Smoothing the field removes them and
  // gives the soft, rounded glass edge — radius scales with resolution so the
  // amount of rounding looks the same at preview and at a 6000px export.
  function smoothSDF(f, w, h) {
    const r = Math.max(1, Math.round(1.5 * (h / 1000)));
    const norm = 1 / (2 * r + 1);
    const tmp = new Float32Array(f.length);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let k = -r; k <= r; k++) { let xx = x + k; if (xx < 0) xx = 0; else if (xx >= w) xx = w - 1; s += f[row + xx]; }
        tmp[row + x] = s * norm;
      }
    }
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        let s = 0;
        for (let k = -r; k <= r; k++) { let yy = y + k; if (yy < 0) yy = 0; else if (yy >= h) yy = h - 1; s += tmp[yy * w + x]; }
        f[y * w + x] = s * norm;
      }
    }
    return f;
  }
  function rebuildLayerSDF(i) {
    if (!renderer) return;
    const L = layers[i];
    const r = (L.shape || L.shapeKind)
      ? rasterizeShape({ image: L.shape, kind: L.shapeKind, width: EXPORT_W, height: EXPORT_H, sizePx: L.fontSize * 2 * renderScale, rotationDeg: L.rotation })
      : rasterizeText({ text: L.text || " ", width: EXPORT_W, height: EXPORT_H, fontFamily: L.font, fontWeight: L.fontWeight, fontSize: L.fontSize * renderScale, letterSpacing: L.letterSpacing * renderScale, rotationDeg: L.rotation });
    const sdf = alphaToSignedDistance(r.alpha, r.width, r.height, true);
    smoothSDF(sdf, r.width, r.height); // remove EDT facets → smooth, rounded glass edge
    let mn = 0; for (let k = 0; k < sdf.length; k++) { if (sdf[k] < mn) mn = sdf[k]; }
    L._strokeHalfPx = -mn; // measured letterform thickness (from the smoothed field), in export px
    renderer.setLayerSDF(i, sdf, r.width, r.height);
  }
  function rebuildAllSDF() { layers.forEach((_, i) => rebuildLayerSDF(i)); }

  function hexToRgb(hex) { const n = parseInt(hex.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }

  // Thickness is the most fragile control: the refraction band grows inward from
  // every edge, so a fixed value that exceeds a stroke's half-width collapses the
  // clear centre and makes the two edges fight. We keep the user's number as
  // intent but never RENDER more than ~92% of the measured letterform half-width,
  // so thin fonts and big export sizes can't blow it out.
  function effectiveThickness(L) {
    // Thickness is a PROPORTION of the letterform, not absolute pixels. The slider
    // is "% of the stroke half-width", so the same value gives the same glass on a
    // 100px or a 360px title, on a 1280 or a 6000px canvas — it no longer has to be
    // re-tuned per photo / per size. A fixed pixel thickness ignored font size and
    // the title's scale within the frame, which is exactly why it felt wrong.
    const halfCss = L._strokeHalfPx ? L._strokeHalfPx / currentDPR() : 0;
    const frac = clampNum(L.refThickness, 0, 100, 60) / 100;
    if (!halfCss) return Math.max(2, frac * 18); // pre-measure fallback
    return halfCss * Math.min(frac, 0.96); // never fully fill the stroke (keep a clear centre)
  }
  // Frost in resolution-independent terms: the slider is "frost at 1080p"; the
  // pixel kernel scales with the actual export height (and is hard-capped at the
  // shader's MAX_R) so the same value looks identical at 1080p and 4K.
  function scaledBlurRadius() {
    const raw = +$("lc-blur-radius").value || 0;
    if (raw <= 0) return 0;
    return Math.max(0, Math.min(96, Math.round(raw * (EXPORT_H / 1080))));
  }
  function readParams() {
    return {
      dpr: currentDPR(),
      baseDpr: DPR, // refraction offset uses this so it doesn't grow with export scale
      lensMag: (+($("lc-lens") && $("lc-lens").value) || 0) / 1000, // slider 0..30 → 0..0.03 UV pull
      layerCount: layers.length,
      offsets: layers.map((L) => [L.cx - 0.5, L.cy - 0.5]),
      layerScales: layers.map(() => 1),
      layerModes: layers.map((L) => isSolidLayer(L) ? 1 : 0),
      tints: layers.map((L) => { const c = hexToRgb(layerColor(L)); return [c[0], c[1], c[2], L.tintAlpha / 100]; }),
      thicknesses: layers.map((L) => effectiveThickness(L)),
      fgPos: [fg.x, fg.y], fgScale: fg.scale,
      refFactor: +$("lc-ref-factor").value,
      refDispersion: +$("lc-dispersion").value,
      refFresnelRange: +$("lc-fresnel-range").value,
      refFresnelHardness: 0.2,
      refFresnelFactor: +$("lc-fresnel-factor").value / 100,
      glareRange: +$("lc-glare-range").value,
      glareHardness: 0.2,
      glareFactor: +$("lc-glare-factor").value / 100,
      glareConvergence: +$("lc-glare-convergence").value / 100,
      glareOppositeFactor: 0.8,
      glareAngle: (+$("lc-glare-angle").value * Math.PI) / 180,
      bodyFactor: glassFx.bodyFactor / 100,
      rimFactor: glassFx.rimFactor / 100,
      rimWidth: glassFx.rimWidth,
      bevelFactor: glassFx.bevelFactor / 100,
      saturationFactor: glassFx.saturationFactor / 100,
      blurEdge: $("lc-blur-edge").checked,
      blurWeights: gaussianWeights(scaledBlurRadius()),
      shadowExpand: +$("lc-shadow-expand").value,
      shadowFactor: +$("lc-shadow-factor").value / 100,
      shadowOffset: [0, -10],
      bgZoom: 1,
      bgPan: [0, 0],
      liquidOverlayMode: 0,
      liquidOverlayAmount: 0,
      liquidOverlayPhase: 0,
      liquidOverlayTint: [1, 1, 1],
      reference3DMode: false,
    };
  }

  function easeOutCubic(x) { return 1 - Math.pow(1 - clampNum(x, 0, 1, 0), 3); }
  function readParamsAt(progress) {
    const p = readParams();
    const preset = motionPresetKey();
    if (preset === "none") return p;
    const t = clampNum(progress, 0, 1, 0);
    const reveal = easeOutCubic(t);
    const pulse = Math.sin(t * Math.PI);
    if (preset === "condense") {
      p.thicknesses = p.thicknesses.map((v) => v * (0.08 + 0.92 * reveal));
      p.refFresnelFactor *= reveal;
      p.glareFactor *= reveal;
      p.bodyFactor *= reveal;
      p.rimFactor *= reveal;
      p.lensMag *= reveal;
      p.shadowFactor *= reveal;
      p.blurWeights = gaussianWeights(Math.min(96, Math.round(scaledBlurRadius() * (1.9 - 0.9 * reveal))));
    } else if (preset === "push") {
      const z = 0.5 - Math.cos(t * Math.PI) * 0.5;
      p.bgZoom = 1 + 0.045 * z;
      p.bgPan = [-0.012 * z, 0.006 * z];
      p.lensMag *= 0.55 + 0.45 * reveal;
      p.glareAngle += (12 * Math.sin(t * Math.PI * 2)) * Math.PI / 180;
    } else if (preset === "watertext") {
      p.reference3DMode = true;
      p.liquidOverlayMode = 1;
      p.liquidOverlayAmount = reveal;
      p.liquidOverlayPhase = t;
      p.liquidOverlayTint = [0.92, 0.98, 1.0];
      p.thicknesses = p.thicknesses.map((v) => v * (0.35 + 0.75 * reveal));
      p.layerScales = p.layerScales.map((v) => v * 0.84);
      p.refDispersion *= 1.15 + 0.55 * pulse;
      p.refFresnelFactor = Math.max(p.refFresnelFactor * (0.08 + 0.12 * reveal), 0.05 * reveal);
      p.glareFactor = Math.max(p.glareFactor * (0.10 + 0.16 * pulse), 0.06 * pulse);
      p.rimFactor = Math.max(p.rimFactor * 0.08, 0.025 * reveal);
      p.bodyFactor = 0;
      p.lensMag = Math.max(p.lensMag, 0.020 * reveal);
      p.blurWeights = gaussianWeights(Math.max(4, Math.min(16, Math.round(scaledBlurRadius() * 0.8))));
    } else if (preset === "surface") {
      const settle = easeOutCubic(t);
      p.reference3DMode = true;
      p.liquidOverlayMode = 2;
      p.liquidOverlayAmount = settle;
      p.liquidOverlayPhase = t;
      p.liquidOverlayTint = [1.0, 0.94, 0.96];
      p.thicknesses = p.thicknesses.map((v) => v * (0.6 + 0.35 * settle));
      p.layerScales = p.layerScales.map((v) => v * 0.86);
      p.refFresnelFactor = Math.max(p.refFresnelFactor * (0.08 + 0.10 * settle), 0.04 * settle);
      p.glareFactor = Math.max(p.glareFactor * (0.08 + 0.12 * pulse), 0.04 + 0.05 * pulse);
      p.rimFactor = Math.max(p.rimFactor * 0.08, 0.025 * settle);
      p.bodyFactor = 0;
      p.shadowFactor = Math.max(p.shadowFactor * 0.70, 0.18 * settle);
      p.lensMag = Math.max(p.lensMag, 0.016 * settle);
      p.blurWeights = gaussianWeights(Math.max(18, Math.min(42, Math.round(scaledBlurRadius() * 1.3))));
      p.bgZoom = 1.34 + 0.10 * (1 - settle);
      p.bgPan = [0.0, -0.018 * settle];
    } else if (preset === "bubbletitle") {
      p.reference3DMode = true;
      p.liquidOverlayMode = 3;
      p.liquidOverlayAmount = reveal;
      p.liquidOverlayPhase = t;
      p.liquidOverlayTint = [1.0, 0.88, 0.92];
      p.thicknesses = p.thicknesses.map((v) => v * (0.2 + 0.95 * reveal));
      p.layerScales = p.layerScales.map((v) => v * 0.74);
      p.refDispersion *= 1.2 + 0.9 * pulse;
      p.lensMag = Math.max(p.lensMag * (0.4 + 0.5 * reveal), 0.022 * reveal);
      p.refFresnelFactor = Math.max(p.refFresnelFactor * (0.06 + 0.12 * reveal), 0.05 * reveal);
      p.glareFactor = Math.max(p.glareFactor * (0.08 + 0.16 * pulse), 0.05 * pulse);
      p.rimFactor = Math.max(p.rimFactor * 0.06, 0.025 * reveal);
      p.bodyFactor = 0;
      p.shadowFactor *= 0.35 + 0.55 * reveal;
      p.blurWeights = gaussianWeights(Math.max(30, Math.min(58, Math.round(scaledBlurRadius() * 1.8))));
      p.bgZoom = 1.28 + 0.08 * pulse;
      p.bgPan = [0.0, -0.035 * reveal];
    }
    return p;
  }

  function renderNow() { if (renderer) renderer.render(readParamsAt(motionProgress())); }

  function scheduleRender() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => { rafPending = false; renderNow(); });
  }

  // Theme CSS draws each range as a filled track (Classic uses black-white
  // System 6 chrome; Liquid Glass uses system-blue). CSS can't compute
  // "percent of range filled", so we feed it as the --lc-fill custom property.
  function updateSliderFill(el) {
    const min = el.min === "" ? 0 : +el.min;
    const max = el.max === "" ? 100 : +el.max;
    const pct = max > min ? ((+el.value - min) / (max - min)) * 100 : 0;
    el.style.setProperty("--lc-fill", clampNum(pct, 0, 100, 0) + "%");
  }
  function syncValueLabels() {
    document.querySelectorAll("#liquid-cover-app input[type=range]").forEach((el) => {
      const v = $(el.id + "-v"); if (v) v.textContent = el.value;
      updateSliderFill(el);
    });
  }

  function loadLayerIntoPanel() {
    const L = layers[sel];
    $("lc-text").value = L.text;
    $("lc-font").value = L.font;
    $("lc-font-size").value = L.fontSize;
    $("lc-font-weight").value = L.fontWeight;
    $("lc-letter-spacing").value = L.letterSpacing;
    $("lc-rotation").value = L.rotation;
    $("lc-thickness").value = L.refThickness;
    $("lc-layer-solid").checked = isSolidLayer(L);
    $("lc-thickness").disabled = isSolidLayer(L);
    $("lc-tint-color").value = layerColor(L);
    $("lc-tint-alpha").value = L.tintAlpha;
    $("lc-tint-alpha").disabled = isSolidLayer(L);
    // keep the custom System 6 dropdown's visible label in sync with the value
    if (typeof refreshSystemSelectControls === "function") refreshSystemSelectControls();
    syncValueLabels();
  }

  function renderLayerList() {
    const list = $("lc-layer-list");
    list.innerHTML = "";
    layers.forEach((L, i) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "lc-layer-item" + (i === sel ? " is-active" : "");
      item.textContent = (L.text.split("\n")[0] || "Text").slice(0, 18) || "Text";
      item.addEventListener("click", () => { sel = i; loadLayerIntoPanel(); renderLayerList(); });
      list.appendChild(item);
    });
    $("lc-del-layer").disabled = layers.length <= 1;
    $("lc-add-layer").disabled = layers.length >= MAX_LAYERS;
    ["lc-add-shape", "lc-shape-circle", "lc-shape-squircle", "lc-shape-capsule"].forEach((id) => {
      const b = $(id); if (b) b.disabled = layers.length >= MAX_LAYERS;
    });
  }

  function buildBgRow() {
    const row = $("lc-bg-row"); row.innerHTML = "";
    BG_URLS.forEach((url, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "lc-bg-item" + (i === activeBg ? " is-active" : "");
      b.style.backgroundImage = "url(" + url + ")";
      // hide the swatch if that photo isn't present on disk
      const probe = new Image();
      probe.onerror = () => { b.style.display = "none"; };
      probe.src = url;
      b.addEventListener("click", () => {
        activeBg = i;
        Array.prototype.forEach.call(row.children, (x, j) => x.classList.toggle("is-active", j === i));
        setBgFromUrl(url);
      });
      row.appendChild(b);
    });
  }

  function loadImageFile(file, cb) { const img = new Image(); img.onload = () => cb(img); img.src = URL.createObjectURL(file); }

  function pointerToUV(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: 1 - (e.clientY - r.top) / r.height };
  }

  // ---- AI auto-style (reuses the app's local/cloud model plumbing) ----
  // t() echoes the key back when a string is missing, so a truthy result is not
  // proof of a real translation — compare against the key to fall back correctly.
  function tr(key, fallback) {
    const v = typeof t === "function" ? t(key) : null;
    return v && v !== key ? v : (fallback || "");
  }
  function aiStatus(key, fallback) {
    const el = $("lc-ai-status");
    if (!el) return;
    el.textContent = tr("liquid_cover_ai_" + key, fallback);
  }
  // For dynamic, already-localized messages (the explainable AI choice, export
  // dimensions) — bypass the key table and show the text verbatim.
  function aiStatusText(text) {
    const el = $("lc-ai-status");
    if (el) el.textContent = text || "";
  }
  function clampNum(v, min, max, def) {
    const n = Number(v);
    if (!isFinite(n)) return def;
    return Math.min(max, Math.max(min, n));
  }
  function validHex(s) { return typeof s === "string" && /^#[0-9a-fA-F]{6}$/.test(s) ? s : null; }
  function parseJsonLoose(text) {
    if (!text) return null;
    let s = String(text).replace(/```json/gi, "```").replace(/```/g, "").trim();
    const a = s.indexOf("{"), b = s.lastIndexOf("}");
    if (a < 0 || b <= a) return null;
    try { return JSON.parse(s.slice(a, b + 1)); } catch (e) { return null; }
  }

  function activeAspectKey() {
    const b = document.querySelector("#liquid-cover-app .lc-aspect button.is-active");
    return (b && b.dataset.k) || "16:9";
  }

  // Ask the model for a BACKGROUND text-to-image prompt (title is overlaid in
  // glass later). Returns the prompt string; throws Error with .code on failure.
  async function requestBgPromptText() {
    if (typeof fetchModelPayload !== "function") { const e = new Error("no model"); e.code = "unavailable"; throw e; }
    const brief = aiBrief();
    if (!brief) { const e = new Error("empty"); e.code = "empty"; throw e; }
    const aspect = activeAspectKey();
    const imgUrl = aiVisionOn() ? currentBgDataUrl(640) : null;
    // GPT Image 2 prompting style: ONE natural-language paragraph (not comma
    // tag-soup), no separate negative prompt — exclusions go in a Constraints
    // clause. Lead with purpose, then subject, composition (with deliberate
    // negative space for the overlaid title), lighting/color, medium, aspect.
    const sys = "You are a prompt engineer for OpenAI's GPT Image (GPT Image 2). Write ONE natural-language image prompt as a short, rich paragraph — flowing prose, not comma-separated tag soup, and NO separate 'Negative:' line (GPT Image has no negative-prompt parameter; put exclusions in a 'Constraints:' clause). Output ONLY the prompt.";
    const titleText = layers.map((l) => l.text.replace(/\n/g, " ")).join(" / ");
    const ask = "Write a prompt for a BACKGROUND image of a video-cover / title card. A glass title is overlaid later, so the composition MUST keep generous, clean, low-contrast NEGATIVE SPACE where the title sits, pushing richer detail toward the edges."
      + "\nPurpose & subject: derive an evocative background scene from this brief — " + brief + "."
      + "\nTitle that will sit on top (describe the scene around it, do NOT render the title): " + titleText + "."
      + "\nWrite ~4–6 sentences covering, in flowing prose: the scene/subject with concrete visible detail; composition (framing such as wide shot / top-down, where the negative space is, and foreground / mid-ground / background layers); lighting direction and mood"
      + (imgUrl
          ? "; take cues from the attached current background and propose a refined, complementary scene, choosing a color palette that contrasts cleanly with the title text"
          : "; and a specific color palette")
      + "; medium and visual style; and the aspect ratio " + aspect + "."
      + "\nEnd with a 'Constraints:' sentence forbidding any text, letters, words, numbers, logos, watermarks, or UI, and keeping the title area uncluttered."
      + " Be specific with camera and composition terms, but do not dump keywords.";
    const userMessage = imgUrl
      ? { role: "user", content: [{ type: "text", text: ask }, { type: "image_url", image_url: { url: imgUrl } }] }
      : { role: "user", content: ask };
    const response = await fetchModelPayload({
      model: typeof getLocalModelRequestName === "function" ? getLocalModelRequestName() : undefined,
      messages: [{ role: "system", content: sys }, userMessage],
      temperature: 0.8,
      ai_system6_task_kind: "chat",
    }, typeof getLongTaskSignal === "function" ? getLongTaskSignal() : undefined);
    const data = await readChatJson(response);
    const content = ((data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "").trim();
    if (!content) { const e = new Error("empty response"); e.code = "parse"; throw e; }
    return content;
  }

  function showBgPrompt(text) {
    const out = $("lc-t2i-out");
    out.value = text;
    out.hidden = false;
    $("lc-t2i-copy").hidden = false;
  }

  async function writeBgPrompt() {
    aiStatus("thinking", "Thinking…");
    $("lc-t2i-go").disabled = true;
    try {
      showBgPrompt(await requestBgPromptText());
      aiStatus("t2i_done", "Prompt ready — copy it");
    } catch (e) {
      aiStatus(e.code || "error", "Model request failed");
    } finally {
      $("lc-t2i-go").disabled = false;
    }
  }

  // ---- GPT Image (OpenAI-compatible) background generation, via server proxy ----
  const IMG_CFG_KEY = "aiSystem6.liquidCover.imageGen";
  function loadImgCfgIntoPanel() {
    let cfg = {};
    try { cfg = JSON.parse(localStorage.getItem(IMG_CFG_KEY) || "{}") || {}; } catch (e) { cfg = {}; }
    if (cfg.baseUrl) $("lc-img-base").value = cfg.baseUrl;
    if (cfg.apiKey) $("lc-img-key").value = cfg.apiKey;
    if (cfg.model) $("lc-img-model").value = cfg.model;
  }
  function saveImgCfg() {
    try {
      localStorage.setItem(IMG_CFG_KEY, JSON.stringify({
        baseUrl: $("lc-img-base").value.trim(),
        apiKey: $("lc-img-key").value,
        model: $("lc-img-model").value.trim(),
      }));
    } catch (e) { /* noop */ }
  }
  function imageCfg() {
    return {
      baseUrl: $("lc-img-base").value.trim() || "https://api.openai.com/v1",
      apiKey: $("lc-img-key").value.trim(),
      model: $("lc-img-model").value.trim() || "gpt-image-1",
    };
  }
  function aspectToImageSize() {
    return activeAspectKey() === "3:4" ? "1024x1536" : "1536x1024";
  }

  async function generateBg() {
    const cfg = imageCfg();
    if (!cfg.apiKey) { aiStatus("img_need_key", "Add an image API key first"); return; }
    $("lc-img-go").disabled = true;
    try {
      let prompt = ($("lc-t2i-out").value || "").trim();
      if (!prompt) {
        aiStatus("thinking", "Thinking…");
        prompt = await requestBgPromptText();
        showBgPrompt(prompt);
      }
      aiStatus("img_generating", "Generating image…");
      const resp = await fetch("/api/image/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, size: aspectToImageSize(), model: cfg.model, apiKey: cfg.apiKey, baseUrl: cfg.baseUrl }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data && (data.detail || data.error) || ("HTTP " + resp.status));
      const src = data.b64 ? ("data:image/png;base64," + data.b64) : data.url;
      if (!src) throw new Error("no image");
      await new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => {
          clearMotionVideo(false);
          activeBg = -1;
          Array.prototype.forEach.call($("lc-bg-row").children, (x) => x.classList.remove("is-active"));
          setBg(img);
          res();
        };
        img.onerror = () => rej(new Error("image load failed"));
        if (data.url && !data.b64) img.crossOrigin = "anonymous";
        img.src = src;
      });
      aiStatus("img_done", "Background generated");
    } catch (e) {
      aiStatus((e && e.code) || "img_error", "Image generation failed");
    } finally {
      $("lc-img-go").disabled = false;
    }
  }

  async function copyBgPrompt() {
    const out = $("lc-t2i-out");
    if (!out || !out.value) return;
    try {
      await navigator.clipboard.writeText(out.value);
    } catch (e) {
      out.removeAttribute("readonly");
      out.select();
      try { document.execCommand("copy"); } catch (e2) { /* noop */ }
      out.setAttribute("readonly", "");
    }
    aiStatus("t2i_copied", "Copied");
  }

  // The bottom ask bar is the primary control: the user only describes a mood,
  // and the model configures (nearly) every parameter at once — optionally
  // reading the current background image.
  function aiBrief() {
    return (($("lc-ask-input").value || "").trim()) || layers.map((l) => l.text.replace(/\n/g, " ")).join(" / ");
  }
  function aiVisionOn() {
    return !!($("lc-ask-vision") && $("lc-ask-vision").checked);
  }

  // Deterministic keyword adjustments — no model, instant, predictable. Relative
  // words ("通透一点 / 更厚 / 加点色散 / 阴影少一些") nudge the actual sliders
  // so the common case never depends on an LLM (and never "feels magic").
  // Returns null when no keyword matched (the caller falls through to the model);
  // otherwise returns a list of localized "label before → after" strings so the
  // status line reports exactly what changed — never a vague "adjusted".
  function applyNudges(brief) {
    const s = String(brief).toLowerCase();
    if (/9to5mac|9to5|ninefive|九五|logo glass|hero glass|徽标玻璃|玻璃徽标/.test(s)) {
      const r = applyRecipeByName("ninefive");
      return r ? [recipeLabel(r.key)] : null;
    }
    let mag = 1;
    if (/一点|一些|些许|稍|略|slightly|a bit|a little/.test(s)) mag = 0.5;
    if (/更|再|很|非常|强烈|大幅|more |very |much /.test(s)) mag = 1.8;
    // Reduction words flip the keyword's built-in direction, so "阴影少一些"
    // means LESS shadow even though the 阴影 entry's base delta is positive.
    // "低" must not match inside 低调 (its own keyword below); bare 淡/小 are
    // too ambiguous (淡蓝色 = a light-blue tint, not "less"), so only their
    // unambiguous compounds count.
    const flip = /少|减|降|低(?!调)|弱|去掉|取消|不要|别|淡一|淡些|变淡|调淡|小一|小些|变小|调小|less|weaker|lower|reduce|remove|fewer|decrease/.test(s) ? -1 : 1;
    let hit = false;
    const changes = [];
    const fmt = (n) => Math.round(n * 100) / 100;
    const labelOf = (id) => {
      const el = $(id);
      const box = el && el.closest ? el.closest("label") : null;
      const span = box ? box.querySelector("span") : null;
      return (span && span.textContent.trim()) || id;
    };
    const report = (id, before, after) => { if (after !== before) changes.push(labelOf(id) + " " + fmt(before) + " → " + fmt(after)); };
    const cur = (id) => +$(id).value;
    const adj = (id, d, min, max) => { const x = $(id); if (x) { const before = cur(id); x.value = clampNum(before + d * mag * flip, min, max, before); hit = true; report(id, before, cur(id)); } };
    const adjLayer = (f, d, min, max, labelId) => {
      let before = null;
      layers.forEach((L, i) => { const b = +L[f] || 0; L[f] = clampNum(b + d * mag * flip, min, max, b); if (i === sel) before = b; });
      hit = true;
      if (before != null) report(labelId, before, +layers[sel][f]);
    };
    if (/通透|透明|清澈|clear|transparent/.test(s)) { adjLayer("tintAlpha", -15, 0, 100, "lc-tint-alpha"); adj("lc-blur-radius", -8, 0, 80); adj("lc-fresnel-factor", -6, 0, 100); }
    if (/磨砂|朦胧|雾|frost/.test(s)) { adj("lc-blur-radius", 12, 0, 80); const be = $("lc-blur-edge"); if (be && flip > 0) { be.checked = true; } hit = true; }
    if (/清晰|锐|sharp|crisp/.test(s)) { adj("lc-blur-radius", -10, 0, 80); }
    if (/厚|thick/.test(s)) { adjLayer("refThickness", 14, 1, 80, "lc-thickness"); }
    if (/薄|thin/.test(s)) { adjLayer("refThickness", -12, 1, 80, "lc-thickness"); }
    if (/亮|高光|发光|闪|bright|glow|shiny/.test(s)) { adj("lc-glare-factor", 18, 0, 120); adj("lc-fresnel-factor", 10, 0, 100); }
    if (/暗|柔|低调|dark|soft|subtle|dim/.test(s)) { adj("lc-glare-factor", -18, 0, 120); adj("lc-fresnel-factor", -8, 0, 100); }
    if (/眩光|glare/.test(s)) { adj("lc-glare-factor", 16, 0, 120); }
    if (/色散|彩虹|虹彩|dispersion|rainbow|chromatic/.test(s)) { adj("lc-dispersion", 8, 0, 50); }
    if (/染色|着色|彩色|tint/.test(s)) { adjLayer("tintAlpha", 18, 0, 100, "lc-tint-alpha"); }
    if (/阴影|shadow/.test(s)) { adj("lc-shadow-factor", 12, 0, 100); }
    if (/折射|弯曲|放大|refract|warp|magnif/.test(s)) { adj("lc-ref-factor", 0.2, 1, 4); }
    if (hit) { loadLayerIntoPanel(); syncValueLabels(); renderNow(); scheduleRender(); }
    return hit ? changes : null;
  }

  async function aiSuggestStyle() {
    const brief = aiBrief();
    if (!brief) { aiStatus("empty", "Describe the cover first"); return; }
    // Try deterministic adjustments first — instant and predictable, no model.
    const nudged = applyNudges(brief);
    if (nudged) {
      aiStatusText(nudged.length ? nudged.join(" · ") : tr("liquid_cover_ai_nudge_limit", "Already at the limit — values unchanged."));
      return;
    }
    if (typeof fetchModelPayload !== "function") { aiStatus("unavailable", "No model available"); return; }
    aiStatus("thinking", "Thinking…");
    $("lc-ask-go").disabled = true;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    try {
      const imgUrl = aiVisionOn() ? currentBgDataUrl(640) : null;
      // The model is an ART DIRECTOR, not a shader. It never emits optics — it
      // picks ONE named material from the catalog and makes color/light calls a
      // person could make. The numbers are owned by the recipe table on our side.
      const sys = "You are an art director choosing a Liquid Glass treatment for a title cover. You do NOT set numeric optics — you pick one named glass material from a catalog and make tasteful colour and light choices. Reply with ONLY one minified JSON object, no markdown, no commentary.";
      const catalog = "Glass materials (choose exactly one as \"recipe\"):\n"
        + PRESETS.map((r) => "- " + r.key + ": " + r.desc).join("\n");
      const decide = 'Return exactly: {"recipe":"' + RECIPE_KEYS.join("|") + '",'
        + '"tintColor":"#rrggbb","tintStrength":"none|subtle|medium|strong",'
        + '"light":"top|top-left|left|bottom-left|bottom|bottom-right|right|top-right",'
        + '"modifiers":[]}. '
        + 'modifiers is 0-2 of: "brighter","softer","thinner","thicker","more-frosted","clearer","more-color","more-dispersion". '
        + 'Choose the recipe that best fits the mood. Use tintStrength "none" unless a colour clearly serves the mood. Do not add fields.';
      const visionNote = imgUrl
        ? "\nThe attached image is the background. Pick a tintColor that complements it with good contrast where the title sits, and set \"light\" to the direction the brightest light comes from in the image. Also add two fields: \"busyness\":\"clean|moderate|busy\" = how visually busy/detailed the area behind the title is (busy = lots of texture/contrast), and \"backdrop\":\"light|mid|dark\" = the overall tone of the area behind the title."
        : "\nNo background image is attached; infer \"light\" and any tint from the mood alone.";
      const user = "Mood / brief: " + brief + "\nTitle text (do not change it): " + layers.map((l) => l.text).join(" / ") + "\n\n" + catalog + "\n\n" + decide + visionNote;
      const userMessage = imgUrl
        ? { role: "user", content: [{ type: "text", text: user }, { type: "image_url", image_url: { url: imgUrl } }] }
        : { role: "user", content: user };
      const response = await fetchModelPayload({
        model: typeof getLocalModelRequestName === "function" ? getLocalModelRequestName() : undefined,
        messages: [{ role: "system", content: sys }, userMessage],
        temperature: 0.4,
        ai_system6_task_kind: "chat",
      }, ctrl.signal);
      const data = await readChatJson(response);
      const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      const spec = parseJsonLoose(content);
      if (!spec || !spec.recipe) { aiStatus("parse", "Model returned no usable choice"); return; }
      // Map the model's semantic choice → physics, all on our side.
      if (!applyRecipeByName(spec.recipe)) applyRecipeByName("clear");
      const tintApplied = applyVisionTint(spec, recipeByKey(spec.recipe) || recipeByKey("clear"));
      const ang = lightToAngle(spec.light);
      if (ang != null) setSlider("lc-glare-angle", ang, -180, 180);
      const applied = applyModifiers(spec.modifiers);
      const busy = imgUrl ? applyBusyness(spec.busyness) : null; // background-adaptive thickness/frost
      const tone = imgUrl ? applyBackdrop(spec.backdrop) : null; // background-adaptive shadow
      loadLayerIntoPanel(); syncValueLabels(); renderNow(); scheduleRender();
      aiStatusText(describeChoice({ recipe: recipeByKey(spec.recipe) ? spec.recipe : "clear", tintColor: spec.tintColor, tintStrength: tintApplied || "none", light: spec.light, busyness: busy, backdrop: tone, modifiers: applied }));
    } catch (e) {
      aiStatus(ctrl.signal.aborted ? "timeout" : "error", "Model request failed");
    } finally {
      clearTimeout(timer);
      $("lc-ask-go").disabled = false;
    }
  }

  function setInspectorPanel(name) {
    const target = String(name || "layers");
    document.querySelectorAll("#liquid-cover-app [data-lc-inspector-tab]").forEach((button) => {
      const active = button.dataset.lcInspectorTab === target;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    document.querySelectorAll("#liquid-cover-app [data-lc-inspector-panel]").forEach((panel) => {
      const active = panel.dataset.lcInspectorPanel === target;
      panel.classList.toggle("is-active", active);
      panel.hidden = !active;
    });
    if (typeof refreshSystemSelectControls === "function") refreshSystemSelectControls();
  }

  function wireInspectorTabs() {
    document.querySelectorAll("#liquid-cover-app [data-lc-inspector-tab]").forEach((button) => {
      button.addEventListener("click", () => setInspectorPanel(button.dataset.lcInspectorTab));
    });
    setInspectorPanel("layers");
  }

  function wireFineTuneGroups() {
    const fineTune = document.querySelector("#liquid-cover-app .lc-finetune");
    if (!fineTune) return;
    fineTune.addEventListener("toggle", () => {
      if (!fineTune.open) return;
      document.querySelectorAll("#liquid-cover-app .lc-tune-group").forEach((group) => {
        group.open = true;
      });
    });
  }

  function wire() {
    wireInspectorTabs();
    wireFineTuneGroups();

    // keep the blue track fill in sync while any slider is dragged
    const app = $("liquid-cover-app");
    if (app) app.addEventListener("input", (e) => {
      const t = e.target;
      if (t && t.matches && t.matches('input[type="range"]')) updateSliderFill(t);
    });

    // aspect buttons
    document.querySelectorAll("#liquid-cover-app .lc-aspect button").forEach((b) => {
      b.addEventListener("click", () => {
        const a = ASPECTS[b.dataset.k]; if (!a) return;
        applyAspect(a[0], a[1]);
        document.querySelectorAll("#liquid-cover-app .lc-aspect button").forEach((x) => x.classList.toggle("is-active", x === b));
        rebuildAllSDF();
        scheduleRender(); // background is cover-fit in the shader, no reload needed on aspect change
      });
    });

    // per-layer text geometry → rebuild that layer's SDF
    ["lc-text", "lc-font", "lc-font-size", "lc-font-weight", "lc-letter-spacing", "lc-rotation"].forEach((id) => {
      $(id).addEventListener("input", () => {
        const L = layers[sel];
        if (id === "lc-text") L.text = $("lc-text").value;
        else if (id === "lc-font") L.font = $("lc-font").value;
        else L[{ "lc-font-size": "fontSize", "lc-font-weight": "fontWeight", "lc-letter-spacing": "letterSpacing", "lc-rotation": "rotation" }[id]] = +$(id).value;
        syncValueLabels();
        rebuildLayerSDF(sel);
        if (id === "lc-text") renderLayerList();
        scheduleRender();
      });
      // <select> also fires "change"
      $(id).addEventListener("change", () => { if (id === "lc-font") { layers[sel].font = $("lc-font").value; rebuildLayerSDF(sel); scheduleRender(); } });
    });

    // per-layer optics → re-render only
    [["lc-thickness", "refThickness"], ["lc-tint-color", "tintColor"], ["lc-tint-alpha", "tintAlpha"]].forEach((pair) => {
      $(pair[0]).addEventListener("input", () => {
        const L = layers[sel];
        setActivePreset("");
        if (pair[0] === "lc-tint-color") {
          L[isSolidLayer(L) ? "solidColor" : "tintColor"] = $(pair[0]).value;
        } else {
          L[pair[1]] = +$(pair[0]).value;
        }
        syncValueLabels(); scheduleRender();
      });
    });
    $("lc-layer-solid").addEventListener("change", () => {
      const L = layers[sel];
      L.renderMode = $("lc-layer-solid").checked ? "solid" : "glass";
      setActivePreset("");
      loadLayerIntoPanel();
      scheduleRender();
    });

    // global glass / shadow
    ["lc-ref-factor", "lc-lens", "lc-dispersion", "lc-blur-edge", "lc-fresnel-range", "lc-fresnel-factor", "lc-glare-factor", "lc-glare-range", "lc-glare-convergence", "lc-glare-angle", "lc-blur-radius", "lc-shadow-factor", "lc-shadow-expand"].forEach((id) => {
      $(id).addEventListener("input", () => { setActivePreset(""); syncValueLabels(); scheduleRender(); });
    });
    $("lc-material-mix").addEventListener("input", () => {
      applyMaterialMix(+$("lc-material-mix").value);
    });

    // layers add/remove
    $("lc-add-layer").addEventListener("click", () => {
      if (layers.length >= MAX_LAYERS) return;
      layers.push(makeLayer({ text: "Text", cx: 0.5, cy: Math.max(0.15, 0.5 - layers.length * 0.18) }));
      sel = layers.length - 1;
      rebuildLayerSDF(sel); loadLayerIntoPanel(); renderLayerList(); scheduleRender();
    });
    $("lc-del-layer").addEventListener("click", () => {
      if (layers.length <= 1) return;
      layers.splice(sel, 1); if (renderer) renderer.removeLayer(sel);
      sel = Math.min(sel, layers.length - 1);
      rebuildAllSDF(); loadLayerIntoPanel(); renderLayerList(); scheduleRender();
    });
    // built-in preset shapes (circle / squircle / capsule) — one click, no upload
    const addBuiltinShape = (kind, labelKey, fallback) => {
      if (layers.length >= MAX_LAYERS) return;
      layers.push(makeLayer({
        shapeKind: kind,
        renderMode: "glass",
        text: tr(labelKey, fallback),
        cx: 0.5, cy: Math.max(0.15, 0.5 - (layers.length - 1) * 0.18),
      }));
      sel = layers.length - 1;
      rebuildLayerSDF(sel); loadLayerIntoPanel(); renderLayerList(); scheduleRender();
    };
    $("lc-shape-circle").addEventListener("click", () => addBuiltinShape("circle", "liquid_cover_shape_circle", "Circle"));
    $("lc-shape-squircle").addEventListener("click", () => addBuiltinShape("squircle", "liquid_cover_shape_squircle", "Rounded Rect"));
    $("lc-shape-capsule").addEventListener("click", () => addBuiltinShape("capsule", "liquid_cover_shape_capsule", "Capsule"));
    // shape layers: any uploaded image becomes a glass shape via the same SDF path
    $("lc-add-shape").addEventListener("click", () => {
      if (layers.length >= MAX_LAYERS) return;
      $("lc-shape-file").click();
    });
    $("lc-shape-file").addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!f) return;
      loadImageFile(f, (img) => {
        if (layers.length >= MAX_LAYERS) return;
        layers.push(makeLayer({
          shape: img,
          renderMode: "glass",
          text: (f.name || "Shape").replace(/\.[^.]+$/, ""),
          cx: 0.5, cy: Math.max(0.15, 0.5 - (layers.length - 1) * 0.18),
        }));
        sel = layers.length - 1;
        rebuildLayerSDF(sel); loadLayerIntoPanel(); renderLayerList(); scheduleRender();
      });
    });

    // background upload
    $("lc-bg-choose").addEventListener("click", () => $("lc-bg-input").click());
    $("lc-bg-input").addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      const bgName = $("lc-bg-name"); bgName.removeAttribute("data-i18n"); bgName.textContent = f.name;
      clearMotionVideo(false);
      loadImageFile(f, (img) => { activeBg = -1; Array.prototype.forEach.call($("lc-bg-row").children, (x) => x.classList.remove("is-active")); setBg(img); });
    });

    // motion video background / animation export
    $("lc-motion-choose").addEventListener("click", () => $("lc-motion-input").click());
    $("lc-motion-input").addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!f) return;
      setMotionVideoFile(f);
    });
    $("lc-motion-clear").addEventListener("click", () => clearMotionVideo(true));
    $("lc-motion-preset").addEventListener("change", () => {
      stopMotionPreview(false);
      scheduleRender();
    });
    $("lc-motion-duration").addEventListener("input", () => {
      syncValueLabels();
      stopMotionPreview(false);
      scheduleRender();
    });
    $("lc-motion-preview").addEventListener("click", previewMotionOnce);
    $("lc-motion-export").addEventListener("click", exportVideo);

    // foreground upload / scale / drag mode / clear
    $("lc-fg-choose").addEventListener("click", () => $("lc-fg-input").click());
    $("lc-fg-input").addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      const fgName = $("lc-fg-name"); fgName.removeAttribute("data-i18n"); fgName.textContent = f.name;
      loadImageFile(f, (img) => { if (!renderer) return; renderer.setForeground(img); $("lc-fg-clear").hidden = false; scheduleRender(); });
    });
    $("lc-fg-clear").addEventListener("click", () => {
      if (renderer) renderer.setForeground(null); $("lc-fg-clear").hidden = true;
      const fgName = $("lc-fg-name"); fgName.setAttribute("data-i18n", "no_files_selected"); fgName.textContent = tr("no_files_selected", "No files selected"); scheduleRender();
    });
    $("lc-fg-scale").addEventListener("input", () => { fg.scale = +$("lc-fg-scale").value / 100; syncValueLabels(); scheduleRender(); });
    $("lc-fg-drag").addEventListener("change", () => { dragFgMode = $("lc-fg-drag").checked; });

    // Bottom ask bar: describe a mood → AI configures every parameter
    $("lc-ask-form").addEventListener("submit", (e) => { e.preventDefault(); aiSuggestStyle(); });

    // AI write text-to-image prompt for the background
    $("lc-t2i-go").addEventListener("click", writeBgPrompt);
    $("lc-t2i-copy").addEventListener("click", copyBgPrompt);

    // GPT Image background generation + persisted endpoint config
    $("lc-img-go").addEventListener("click", generateBg);
    ["lc-img-base", "lc-img-key", "lc-img-model"].forEach((id) => {
      $(id).addEventListener("input", saveImgCfg);
    });

    // drag positioning
    let drag = null;
    canvas.addEventListener("pointerdown", (e) => {
      const p = pointerToUV(e);
      const obj = dragFgMode ? { gx: "x", gy: "y", t: fg } : { gx: "cx", gy: "cy", t: layers[sel] };
      drag = { start: p, x0: obj.t[obj.gx], y0: obj.t[obj.gy], obj };
      canvas.setPointerCapture(e.pointerId);
      canvas.classList.add("is-grabbing");
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const p = pointerToUV(e); const o = drag.obj;
      o.t[o.gx] = Math.min(1.5, Math.max(-0.5, drag.x0 + (p.x - drag.start.x)));
      o.t[o.gy] = Math.min(1.5, Math.max(-0.5, drag.y0 + (p.y - drag.start.y)));
      scheduleRender();
    });
    const endDrag = (e) => { drag = null; canvas.classList.remove("is-grabbing"); try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* noop */ } };
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);

    // export at full source resolution
    $("lc-export").addEventListener("click", exportPng);
    const resSel = $("lc-export-res");
    if (resSel) resSel.addEventListener("change", updateExportDimNote);
  }

  // Renderer creation can fail (WebGL2 context refused — e.g. too many GPU-heavy
  // tabs, GPU reset). It must never take the UI down with it: the controls are
  // built first, the failure is shown visibly, and reopening the window retries.
  function initRenderer() {
    try {
      renderer = new Renderer(canvas);
      return true;
    } catch (e) {
      renderer = null;
      aiStatus("webgl", "WebGL unavailable — close other GPU-heavy tabs, then reopen this window.");
      return false;
    }
  }
  function startRendering() {
    if (!initRenderer()) return;
    aiStatusText("");            // clear a stale WebGL warning from a failed earlier attempt
    setBg(neutralBg());          // neutral until the first photo decodes (avoids a blank first frame)
    setBgFromUrl(BG_URLS[0]);    // then the real built-in photo
    rebuildAllSDF();
    renderNow();        // paint the first frame immediately (don't wait for rAF)
    scheduleRender();
  }
  function init() {
    canvas = $("lc-canvas");
    layers.length = 0; layers.push(makeLayer());
    sel = 0;
    applyAspect(DESIGN_W, DESIGN_H);
    // mark the default aspect button active
    document.querySelectorAll("#liquid-cover-app .lc-aspect button").forEach((b) => b.classList.toggle("is-active", b.dataset.k === "16:9"));
    // UI first — these must exist even if WebGL is unavailable right now
    wire();
    loadImgCfgIntoPanel();
    buildBgRow();
    buildPresetRow();
    renderLayerList();
    loadLayerIntoPanel();
    applyMaterialMix(0); // open water-clear (the Apple Liquid Glass reference), not frosted
    startRendering();
  }

  async function open(options = {}) {
    if (!inited) { init(); inited = true; }
    else if (!renderer) { startRendering(); } // WebGL failed last time — retry now
    else { renderNow(); scheduleRender(); }
    if (typeof openWindow === "function") await openWindow("liquidCover", { ...options, skipLiquidCoverEntrypoint: true });
    if (motionVideo) renderNow();
  }

  window.AISystem6LiquidCover = { open };
})();
