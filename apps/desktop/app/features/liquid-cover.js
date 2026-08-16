// Feature module: Liquid Cover / 玻璃封面 — turn any text into Apple-style
// Liquid Glass, composited between a background image and a foreground subject,
// and export a PNG cover (16:9 / 4:3 / 3:4 for B站 / 抖音).
//
// Lazy-loaded as a classic script (see config.js ensureLiquidCoverModule).
// Self-contained WebGL2 renderer ported from the liquid-glass-text prototype:
//   text -> Canvas2D coverage mask -> exact signed distance field (R32F) ->
//   glass optics (Snell refraction, dispersion, Fresnel, glare) sampling the
//   SDF instead of an analytic shape. Up to 8 text/shape layers (per-layer
//   glass/solid style, tint + thickness via min-union with argmin);
//   movable/scalable foreground subject.

window.AISystem6LiquidCoverLoaded = true;

(function () {
  "use strict";

  const MAX_LAYERS = 8;
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

  const LAYER_SHADER_CASES = Array.from({ length: MAX_LAYERS - 1 }, (_, index) => {
    const i = index + 1;
    return "  if (idx == " + i + ") return texture(u_sdf[" + i + "], uv - u_sdfOffset[" + i + "]).r;";
  }).join("\n");
  const LAYER_SHADER_UNION = Array.from({ length: MAX_LAYERS - 1 }, (_, index) => {
    const i = index + 1;
    return "  if (u_layerCount > " + i + ") { float v = layerSD(uv, " + i + "); if (v < d) { d = v; idx = " + i + "; } }";
  }).join("\n");
  const LAYER_SHADER_STACK = Array.from({ length: MAX_LAYERS - 1 }, (_, index) => {
    const i = index + 1;
    return "  if (u_layerCount > " + i + ") { float v = layerSD(uv, " + i + "); if (v <= 1.0) { d = v; idx = " + i + "; } }";
  }).join("\n");
  const UNION_SD = "\nuniform sampler2D u_sdf[" + MAX_LAYERS + "];\nuniform vec2 u_sdfOffset[" + MAX_LAYERS + "];\nuniform int u_layerCount;\nfloat layerSD(vec2 uv, int idx){\n"
    + LAYER_SHADER_CASES
    + "\n  return texture(u_sdf[0], uv - u_sdfOffset[0]).r;\n}\nfloat unionSDIdx(vec2 uv, out int idx){\n  float d = layerSD(uv, 0); idx = 0;\n"
    + LAYER_SHADER_UNION
    + "\n  return d;\n}\nfloat stackSDIdx(vec2 uv, out int idx){\n  float d = unionSDIdx(uv, idx);\n"
    + LAYER_SHADER_STACK
    + "\n  return d;\n}\nfloat unionSD(vec2 uv){ int i; return unionSDIdx(uv, i); }";

  const BG_FRAG = "#version 300 es\nprecision highp float;\nin vec2 v_uv;\nout vec4 fragColor;\nuniform sampler2D u_image;\nuniform vec2 u_resolution;\nuniform float u_dpr;\nuniform float u_imageAspect;\nuniform float u_shadowExpand;\nuniform float u_shadowFactor;\nuniform vec2 u_shadowOffset;\nuniform float u_bgZoom;\nuniform vec2 u_bgPan;\n" + UNION_SD + "\nvec2 cover(vec2 uv, float ca, float ta){ if (ca>ta){ float s=ta/ca; uv.y=uv.y*s+0.5-0.5*s; } else { float s=ca/ta; uv.x=uv.x*s+0.5-0.5*s; } return uv; }\nvoid main(){\n  vec2 uv = cover(v_uv, u_resolution.x/u_resolution.y, u_imageAspect);\n  uv = (uv - 0.5) / max(u_bgZoom, 0.001) + 0.5 + u_bgPan;\n  vec3 col = texture(u_image, uv).rgb;\n  vec2 off = u_shadowOffset * u_dpr / u_resolution;\n  float sd = unionSD(v_uv - off) / u_dpr;\n  float shadow = exp(-1.0/u_shadowExpand * abs(sd)) * 0.6 * u_shadowFactor;\n  col -= vec3(shadow);\n  fragColor = vec4(col, 1.0);\n}";

  const BLUR_FRAG = "#version 300 es\nprecision highp float;\n#define MAX_R 96\nin vec2 v_uv;\nout vec4 fragColor;\nuniform sampler2D u_tex;\nuniform vec2 u_resolution;\nuniform vec2 u_dir;\nuniform int u_radius;\nuniform float u_weights[MAX_R + 1];\nvoid main(){\n  vec2 texel = 1.0/u_resolution;\n  vec4 c = texture(u_tex, v_uv) * u_weights[0];\n  for (int i=1;i<=MAX_R;i++){ if (i>u_radius) break; vec2 o = u_dir*texel*float(i); c += texture(u_tex, v_uv+o)*u_weights[i]; c += texture(u_tex, v_uv-o)*u_weights[i]; }\n  fragColor = c;\n}";

  const MAIN_FRAG = "#version 300 es\nprecision highp float;\n#define PI 3.14159265359\nconst float N_R=0.98; const float N_G=1.0; const float N_B=1.02;\nin vec2 v_uv;\nout vec4 fragColor;\nuniform sampler2D u_bg;\nuniform sampler2D u_blurredBg;\nuniform vec2 u_resolution;\nuniform float u_dpr;\nuniform float u_baseDpr;\nuniform float u_lensMag;\nuniform float u_refThickness[" + MAX_LAYERS + "];\nuniform float u_refFactor;\nuniform float u_refDispersion;\nuniform float u_refFresnelRange;\nuniform float u_refFresnelHardness;\nuniform float u_refFresnelFactor;\nuniform float u_glareRange;\nuniform float u_glareHardness;\nuniform float u_glareFactor;\nuniform float u_glareConvergence;\nuniform float u_glareOppositeFactor;\nuniform float u_glareAngle;\nuniform float u_bodyFactor;\nuniform float u_rimFactor;\nuniform float u_rimWidth;\nuniform float u_bevelFactor;\nuniform float u_saturationFactor;\nuniform vec4 u_tint[" + MAX_LAYERS + "];\nuniform int u_layerMode[" + MAX_LAYERS + "];\nuniform int u_blurEdge;\nuniform sampler2D u_fg;\nuniform float u_fgAspect;\nuniform int u_hasFg;\nuniform vec2 u_fgPos;\nuniform float u_fgScale;\n" + UNION_SD + "\n"
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
    + "vec2 getGrad(vec2 uv, int layer){ vec2 t=1.5/u_resolution; float tl=layerSD(uv+vec2(-t.x,t.y),layer); float tc=layerSD(uv+vec2(0.0,t.y),layer); float tr=layerSD(uv+vec2(t.x,t.y),layer); float ml=layerSD(uv+vec2(-t.x,0.0),layer); float mr=layerSD(uv+vec2(t.x,0.0),layer); float bl=layerSD(uv+vec2(-t.x,-t.y),layer); float bc=layerSD(uv+vec2(0.0,-t.y),layer); float br=layerSD(uv+vec2(t.x,-t.y),layer); float gx=(tr+2.0*mr+br)-(tl+2.0*ml+bl); float gy=(tl+2.0*tc+tr)-(bl+2.0*bc+br); return vec2(gx,gy)*0.16667; }\n"
    + "float a2(vec2 v){ float a=atan(v.y,v.x); if(a<0.0)a+=2.0*PI; return a; }\n"
    + "vec4 disp(vec2 base, float mr, vec2 off, float fa){ vec4 p=vec4(1.0); float ar=texture(u_bg,base+off*(1.0-(N_R-1.0)*fa)).r; float ag=texture(u_bg,base+off*(1.0-(N_G-1.0)*fa)).g; float ab=texture(u_bg,base+off*(1.0-(N_B-1.0)*fa)).b; float br=texture(u_blurredBg,base+off*(1.0-(N_R-1.0)*fa)).r; float bg=texture(u_blurredBg,base+off*(1.0-(N_G-1.0)*fa)).g; float bb=texture(u_blurredBg,base+off*(1.0-(N_B-1.0)*fa)).b; p.r=mix(ar,br,mr); p.g=mix(ag,bg,mr); p.b=mix(ab,bb,mr); return p; }\n"
    // Faithful port of liquid-glass-studio STEP9 (the same code MB Liquid Glass is
    // built on). The earlier invented edge treatments (a metallic inner sheen, a
    // global veil, a luminance-driven boost) are gone — they are exactly what
    // made it read like a metal sticker. The baseline edge is physical Fresnel
    // (LCH lightness lift) + glare; the 9to5Mac preset can add a controlled SDF
    // milky body and rim while regular recipes keep those controls at zero.
    + "void main(){\n"
    + "  int layer; float sd = stackSDIdx(v_uv, layer);\n"
    + "  vec4 bg = texture(u_bg, v_uv);\n"
    + "  float aa = 1.0;\n"
    + "  vec4 tint = u_tint[layer]; float thick = u_refThickness[layer];\n"
    + "  vec4 result;\n"
    + "  if (sd > aa) { result = bg; } else if (u_layerMode[layer] == 1) {\n"
    + "    float mask = 1.0 - smoothstep(-aa, aa, sd);\n"
    + "    result = vec4(mix(bg.rgb, tint.rgb, mask), 1.0);\n"
    + "  } else {\n"
    + "    float sdCss = sd/u_dpr; float depth = -sdCss;\n"
    + "    vec2 G = getGrad(v_uv, layer); float glen = length(G); vec2 N = glen>1e-5 ? G/glen : vec2(0.0); float nlen = clamp(glen*0.5, 0.0, 1.0);\n"
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

    + "  fragColor = result;\n"
    + "}";

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
    const tints = new Float32Array(MAX_LAYERS * 4);
    const thick = new Float32Array(MAX_LAYERS).fill(20);
    const layerModes = new Int32Array(MAX_LAYERS);
    for (let i = 0; i < count; i++) {
      offsets[i * 2] = params.offsets[i][0]; offsets[i * 2 + 1] = params.offsets[i][1];
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

    gl.useProgram(this.progMain);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this._bindLayers(this.progMain, count, 0);
    gl.uniform2fv(this._u(this.progMain, "u_sdfOffset"), offsets);
    const bgUnit = MAX_LAYERS;
    const blurUnit = MAX_LAYERS + 1;
    const fgUnit = MAX_LAYERS + 2;
    gl.activeTexture(gl.TEXTURE0 + bgUnit); gl.bindTexture(gl.TEXTURE_2D, this.fboA.tex);
    gl.uniform1i(this._u(this.progMain, "u_bg"), bgUnit);
    gl.activeTexture(gl.TEXTURE0 + blurUnit); gl.bindTexture(gl.TEXTURE_2D, this.fboC.tex);
    gl.uniform1i(this._u(this.progMain, "u_blurredBg"), blurUnit);
    gl.activeTexture(gl.TEXTURE0 + fgUnit); gl.bindTexture(gl.TEXTURE_2D, this.fgTex || this.bgTex);
    gl.uniform1i(this._u(this.progMain, "u_fg"), fgUnit);
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
  const FONT_DEFAULT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", system-ui, sans-serif';

  let renderer = null;
  let inited = false;
  let EXPORT_W = 1280, EXPORT_H = 720;
  const layers = [];
  let sel = 0;
  const selectedLayerIds = new Set();
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
  let nextLayerId = 1;
  let layerDragState = null;
  let suppressLayerClick = false;
  const undoStack = [];
  const redoStack = [];
  let pendingHistory = null;
  let historyRestoring = false;
  const HISTORY_LIMIT = 50;
  const MOTION_PREVIEW_FPS = 30;

  const $ = (id) => document.getElementById(id);
  function isSolidLayer(L) { return L && L.renderMode === "solid"; }
  function layerColor(L) { return isSolidLayer(L) ? (L.solidColor || "#ffffff") : L.tintColor; }
  function setBusy(control, busy, label) {
    if (typeof setControlLoading === "function") {
      setControlLoading(control, busy, label);
      return;
    }
    if (!control) return;
    control.disabled = !!busy;
    control.toggleAttribute("aria-busy", !!busy);
  }

  const MAX_FONT_FILE_BYTES = 20 * 1024 * 1024;
  let fontProbeCanvas = null;
  function systemFontAvailable(family) {
    if (!family) return true;
    fontProbeCanvas ||= document.createElement("canvas");
    const ctx = fontProbeCanvas.getContext("2d");
    if (!ctx) return true;
    const sample = "mmmmmmmmmmWWWWWiiiil";
    return ["monospace", "serif", "sans-serif"].some((fallback) => {
      ctx.font = "72px " + fallback;
      const baseWidth = ctx.measureText(sample).width;
      const safeFamily = String(family).replace(/["\\]/g, "");
      ctx.font = '72px "' + safeFamily + '", ' + fallback;
      return Math.abs(ctx.measureText(sample).width - baseWidth) > 0.1;
    });
  }

  function prepareFontOptions() {
    const select = $("lc-font");
    if (!select) return;
    select.querySelectorAll("option[data-font-family]").forEach((option) => {
      const available = systemFontAvailable(option.dataset.fontFamily);
      option.dataset.fontAvailable = available ? "true" : "false";
      option.dataset.baseLabel ||= option.textContent;
      option.textContent = option.dataset.baseLabel + (available ? "" : " · " + tr("liquid_cover_font_not_installed_short", "Not installed"));
    });
    select.querySelectorAll("option[data-font-system], option[data-font-bundled]").forEach((option) => {
      option.dataset.fontAvailable = "true";
    });
    if (typeof refreshSystemSelectControls === "function") refreshSystemSelectControls();
  }

  function applyFontSelection() {
    const select = $("lc-font");
    const L = layers[sel];
    if (!select || !L) return false;
    const option = select.options[select.selectedIndex];
    if (option?.dataset.fontAvailable === "false") {
      select.value = L.font;
      setFontStatus(
        "liquid_cover_font_not_installed",
        "This font is not installed. Install it from Apple Fonts or import a font file."
      );
      if (typeof refreshSystemSelectControls === "function") refreshSystemSelectControls();
      return false;
    }
    L.font = select.value;
    setFontStatus("liquid_cover_font_active", "Using {0}.", option?.dataset.baseLabel || option?.textContent || "");
    return true;
  }

  function fontFamilyFromFileName(name) {
    return String(name || "")
      .replace(/\.(?:ttf|otf|woff2?|ttc)$/i, "")
      .replace(/[_]+/g, " ")
      .replace(/["'\\<>;{}]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
  }

  function importedFontStack(family) {
    return '"' + String(family).replace(/["\\]/g, "") + '", ' + FONT_DEFAULT;
  }

  function setFontStatus(key, fallback, ...args) {
    const status = $("lc-font-status");
    if (!status) return;
    status.removeAttribute("data-i18n");
    status.textContent = tr(key, fallback, ...args);
  }

  async function importFontFile(file) {
    const button = $("lc-font-import");
    const input = $("lc-font-file");
    const targetLayer = layers[sel];
    if (!file || !targetLayer) return;
    if (!/\.(?:ttf|otf|woff2?)$/i.test(file.name || "") || typeof FontFace !== "function") {
      setFontStatus("liquid_cover_font_import_error", "This font file could not be used.");
      if (input) input.value = "";
      return;
    }
    if (file.size > MAX_FONT_FILE_BYTES) {
      setFontStatus("liquid_cover_font_import_large", "Choose a font file smaller than 20 MB.");
      if (input) input.value = "";
      return;
    }
    const family = fontFamilyFromFileName(file.name) || "Imported Font";
    setBusy(button, true, tr("liquid_cover_font_importing", "Loading font…"));
    setFontStatus("liquid_cover_font_importing", "Loading font…");
    try {
      const face = new FontFace(family, await file.arrayBuffer());
      await face.load();
      document.fonts.add(face);
      const stack = importedFontStack(family);
      const select = $("lc-font");
      let option = [...select.options].find((item) => item.value === stack);
      if (!option) {
        option = document.createElement("option");
        option.value = stack;
        option.textContent = family;
        option.dataset.importedFont = "true";
        select.appendChild(option);
      }
      const targetIndex = layers.indexOf(targetLayer);
      if (targetIndex >= 0) {
        targetLayer.font = stack;
        selectOnly(targetIndex);
        select.value = stack;
        rebuildLayerSDF(targetIndex);
        loadLayerIntoPanel();
        scheduleRender();
      }
      setFontStatus("liquid_cover_font_imported", family + " imported and applied.", family);
    } catch (error) {
      setFontStatus("liquid_cover_font_import_error", "This font file could not be used.");
    } finally {
      setBusy(button, false);
      if (input) input.value = "";
    }
  }

  function wireFontControls() {
    const button = $("lc-font-import");
    const input = $("lc-font-file");
    prepareFontOptions();
    document.fonts?.load('72px "Smiley Sans"').then(() => {
      if (layers.some((L) => String(L.font).includes("Smiley Sans"))) {
        rebuildAllSDF();
        scheduleRender();
      }
    }).catch(() => {});
    if (!button || !input) return;
    button.addEventListener("click", () => input.click());
    input.addEventListener("change", () => importFontFile(input.files?.[0]));
  }

  function makeLayer(over) {
    // The tool is CALLED Cover Glass: a fresh layer must show glass, or the
    // first open shows no glass anywhere. Solid (the 9to5Mac/B站 readable
    // title) is one checkbox away and is what the ninefive guard protects.
    return Object.assign({
      id: "lc-layer-" + nextLayerId++, parentId: null,
      name: "", text: "Liquid\nGlass", font: FONT_DEFAULT, shape: null, shapeKind: null,
      fontSize: 170, fontWeight: 800, letterSpacing: 0, rotation: 0,
      cx: 0.5, cy: 0.5, renderMode: "glass", solidColor: "#ffffff",
      refThickness: 20, tintColor: "#ffffff", tintAlpha: 0,
      hidden: false, locked: false,
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
  function recipeSummary(k) { return tr("liquid_cover_preset_" + k + "_summary", ""); }
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
      const label = recipeLabel(pr.key);
      const summary = recipeSummary(pr.key);
      b.setAttribute("aria-label", summary ? label + " — " + summary : label);
      const preview = document.createElement("span");
      preview.className = "lc-preset-preview";
      preview.setAttribute("aria-hidden", "true");
      const sample = document.createElement("span");
      sample.className = "lc-preset-sample";
      sample.textContent = pr.key === "ninefive" ? "9" : pr.key === "ios27" ? "27" : "Aa";
      preview.appendChild(sample);
      const copy = document.createElement("span");
      copy.className = "lc-preset-copy";
      const name = document.createElement("strong");
      name.textContent = label;
      const detail = document.createElement("span");
      detail.textContent = summary;
      copy.appendChild(name);
      copy.appendChild(detail);
      b.appendChild(preview);
      b.appendChild(copy);
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
    runHistoryAction("liquid_cover_style_action", "Change style", () => {
      syncMaterialMixToRecipe(pr.key);
      applyPreset(pr.p);
      setActivePreset(pr.key);
      aiStatusText("");
    });
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
    syncWorkbenchReadout();
  }

  function selectedLayersInStack() {
    return layers.filter((L) => selectedLayerIds.has(L.id));
  }

  function ensureSelection() {
    selectedLayerIds.forEach((id) => {
      if (!layers.some((L) => L.id === id)) selectedLayerIds.delete(id);
    });
    if (!layers[sel]) sel = Math.max(0, layers.length - 1);
    if (layers[sel] && !selectedLayerIds.size) selectedLayerIds.add(layers[sel].id);
    if (layers[sel] && !selectedLayerIds.has(layers[sel].id)) {
      const selected = selectedLayersInStack();
      sel = selected.length ? layers.indexOf(selected[selected.length - 1]) : sel;
    }
  }

  function selectOnly(index) {
    if (!layers[index]) return;
    sel = index;
    selectedLayerIds.clear();
    selectedLayerIds.add(layers[index].id);
  }

  function toggleLayerSelection(index) {
    const L = layers[index];
    if (!L) return;
    if (selectedLayerIds.has(L.id) && selectedLayerIds.size > 1) {
      selectedLayerIds.delete(L.id);
      if (sel === index) {
        const selected = selectedLayersInStack();
        sel = layers.indexOf(selected[selected.length - 1]);
      }
      return;
    }
    selectedLayerIds.add(L.id);
    sel = index;
  }

  function selectAllLayers() {
    layers.forEach((L) => selectedLayerIds.add(L.id));
    if (layers.length) sel = layers.length - 1;
  }

  const HISTORY_CONTROL_IDS = [
    "lc-ref-factor", "lc-lens", "lc-dispersion", "lc-blur-edge",
    "lc-fresnel-range", "lc-fresnel-factor", "lc-glare-factor",
    "lc-glare-range", "lc-glare-convergence", "lc-glare-angle",
    "lc-blur-radius", "lc-shadow-factor", "lc-shadow-expand",
    "lc-material-mix", "lc-motion-preset", "lc-motion-duration",
    "lc-motion-audio", "lc-fg-scale",
  ];

  function cloneLayerForHistory(L) {
    const copy = { ...L };
    if (L._localBounds) copy._localBounds = { ...L._localBounds };
    return copy;
  }

  function historyControlValues() {
    const values = {};
    HISTORY_CONTROL_IDS.forEach((id) => {
      const el = $(id);
      if (!el) return;
      values[id] = el.type === "checkbox" ? !!el.checked : el.value;
    });
    return values;
  }

  function captureHistoryState() {
    return {
      layers: layers.map(cloneLayerForHistory),
      selectedIds: [...selectedLayerIds],
      selectedId: layers[sel]?.id || null,
      fg: { ...fg },
      glassFx: { ...glassFx },
      controls: historyControlValues(),
      aspect: activeAspectKey(),
      activePresetKey,
      activeBg,
      currentBgUrl,
    };
  }

  function historySignature() {
    return JSON.stringify({
      layers: layers.map((L) => ({
        id: L.id, parentId: L.parentId, name: L.name, text: L.text,
        font: L.font, fontSize: L.fontSize, fontWeight: L.fontWeight,
        letterSpacing: L.letterSpacing, rotation: L.rotation,
        cx: L.cx, cy: L.cy, renderMode: L.renderMode,
        solidColor: L.solidColor, refThickness: L.refThickness,
        tintColor: L.tintColor, tintAlpha: L.tintAlpha,
        shapeKind: L.shapeKind, hasShape: !!L.shape,
        hidden: !!L.hidden, locked: !!L.locked,
      })),
      fg, glassFx, controls: historyControlValues(),
      aspect: activeAspectKey(), activePresetKey, activeBg, currentBgUrl,
    });
  }

  function updateHistoryButtons() {
    const undo = $("lc-undo");
    const redo = $("lc-redo");
    if (undo) undo.disabled = !undoStack.length;
    if (redo) redo.disabled = !redoStack.length;
  }

  function beginHistory(labelKey, fallback) {
    if (historyRestoring || pendingHistory) return;
    pendingHistory = {
      labelKey,
      fallback,
      state: captureHistoryState(),
      signature: historySignature(),
    };
  }

  function cancelHistory() {
    pendingHistory = null;
  }

  function commitHistory() {
    if (!pendingHistory || historyRestoring) return;
    const entry = pendingHistory;
    pendingHistory = null;
    if (entry.signature === historySignature()) return;
    undoStack.push(entry);
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack.length = 0;
    updateHistoryButtons();
  }

  function runHistoryAction(labelKey, fallback, action) {
    beginHistory(labelKey, fallback);
    action();
    commitHistory();
  }

  function restoreHistoryState(state) {
    historyRestoring = true;
    pendingHistory = null;
    layers.length = 0;
    state.layers.forEach((L) => layers.push(cloneLayerForHistory(L)));
    selectedLayerIds.clear();
    state.selectedIds.forEach((id) => {
      if (layers.some((L) => L.id === id)) selectedLayerIds.add(id);
    });
    sel = Math.max(0, layers.findIndex((L) => L.id === state.selectedId));
    if (!selectedLayerIds.size && layers[sel]) selectedLayerIds.add(layers[sel].id);
    Object.assign(fg, state.fg);
    Object.assign(glassFx, state.glassFx);
    Object.entries(state.controls || {}).forEach(([id, value]) => {
      const el = $(id);
      if (!el) return;
      if (el.type === "checkbox") el.checked = !!value;
      else el.value = value;
    });
    const aspect = ASPECTS[state.aspect] || ASPECTS["16:9"];
    applyAspect(aspect[0], aspect[1]);
    document.querySelectorAll(".liquid-cover-window .lc-aspect button").forEach((button) => {
      const active = button.dataset.k === state.aspect;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    activePresetKey = state.activePresetKey || "";
    activeBg = Number.isInteger(state.activeBg) ? state.activeBg : activeBg;
    if (state.currentBgUrl && state.currentBgUrl !== currentBgUrl) setBgFromUrl(state.currentBgUrl);
    nextLayerId = layers.reduce((max, L) => {
      const value = Number(String(L.id || "").replace(/^lc-layer-/, ""));
      return Number.isFinite(value) ? Math.max(max, value + 1) : max;
    }, nextLayerId);
    rebuildAllSDF();
    renderLayerList();
    loadLayerIntoPanel();
    setInspectorPanel(isShapeLayer(layers[sel]) ? "glass" : "layers");
    syncValueLabels();
    setActivePreset(activePresetKey);
    scheduleRender();
    historyRestoring = false;
  }

  function undoEditor() {
    const entry = undoStack.pop();
    if (!entry) return;
    redoStack.push({
      labelKey: entry.labelKey,
      fallback: entry.fallback,
      state: captureHistoryState(),
      signature: historySignature(),
    });
    restoreHistoryState(entry.state);
    aiStatusText(tr("liquid_cover_undo_status", "Change undone.", tr(entry.labelKey, entry.fallback)));
    updateHistoryButtons();
  }

  function redoEditor() {
    const entry = redoStack.pop();
    if (!entry) return;
    undoStack.push({
      labelKey: entry.labelKey,
      fallback: entry.fallback,
      state: captureHistoryState(),
      signature: historySignature(),
    });
    restoreHistoryState(entry.state);
    aiStatusText(tr("liquid_cover_redo_status", "Change redone.", tr(entry.labelKey, entry.fallback)));
    updateHistoryButtons();
  }

  function syncWorkbenchReadout() {
    const aspect = activeAspectKey();
    const layer = layers[sel];
    const selectionCount = selectedLayersInStack().length;
    const layerName = selectionCount > 1
      ? tr("liquid_cover_layers_selected", "{0} layers selected", selectionCount)
      : (layer ? (layer.name || (layer.text || "Layer").split("\n")[0] || "Layer").slice(0, 32) : "Layer");
    const format = $("lc-stage-format");
    if (format) format.textContent = aspect + " · " + DESIGN_W + " × " + DESIGN_H;
    const selection = $("lc-stage-selection");
    if (selection) selection.textContent = layerName;
    const help = $("lc-selection-help");
    if (help) {
      help.removeAttribute("data-i18n");
      help.textContent = selectionCount > 1
        ? tr("liquid_cover_selection_count_help", "{0} layers selected · drag together · align to selection", selectionCount)
        : tr("liquid_cover_selection_help", "Shift-click or drag a box to select multiple layers. Drag layers to reorder.");
    }
    const meta = $("lc-status-meta");
    if (meta) meta.textContent = aspect + " · " + layers.length + "/" + MAX_LAYERS;
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
    $("lc-motion-preview")?.setAttribute("aria-pressed", "false");
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
    $("lc-motion-preview")?.setAttribute("aria-pressed", "true");
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
    const exportButton = $("lc-export");
    const restore = () => {
      applyAspect(DESIGN_W, DESIGN_H);
      rebuildAllSDF(); renderNow();
      setBusy(exportButton, false);
    };
    setBusy(exportButton, true, tr("liquid_cover_ai_exporting", "Rendering…"));
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
          downloadBlob(blob, "liquid-glass-" + d.w + "x" + d.h + ".png");
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
  // Stills and motion covers leave through the shared artifact exit.
  function downloadBlob(blob, name) {
    return window.AISystem6WebPlatform.saveArtifact({ blob, fileName: name, mimeType: blob?.type || "" });
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
    const exportButton = $("lc-motion-export");
    stopMotionPreview();
    motionExporting = true;
    motionExportProgress = 0;
    setBusy(exportButton, true, tr("liquid_cover_ai_motion_exporting", "Recording video…"));
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
      setBusy(exportButton, false);
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
  function measureAlphaBounds(alpha, width, height) {
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (alpha[y * width + x] < 8) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < minX || maxY < minY) {
      return { left: -0.05, right: 0.05, bottom: -0.05, top: 0.05 };
    }
    return {
      left: minX / width - 0.5,
      right: (maxX + 1) / width - 0.5,
      bottom: 0.5 - (maxY + 1) / height,
      top: 0.5 - minY / height,
    };
  }
  function rebuildLayerSDF(i) {
    if (!renderer) return;
    const L = layers[i];
    const r = (L.shape || L.shapeKind)
      ? rasterizeShape({ image: L.shape, kind: L.shapeKind, width: EXPORT_W, height: EXPORT_H, sizePx: L.fontSize * 2 * renderScale, rotationDeg: L.rotation })
      : rasterizeText({ text: L.text || " ", width: EXPORT_W, height: EXPORT_H, fontFamily: L.font, fontWeight: L.fontWeight, fontSize: L.fontSize * renderScale, letterSpacing: L.letterSpacing * renderScale, rotationDeg: L.rotation });
    L._localBounds = measureAlphaBounds(r.alpha, r.width, r.height);
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
      offsets: layers.map((L) => L.hidden ? [10, 10] : [L.cx - 0.5, L.cy - 0.5]),
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
    };
  }

  function easeOutCubic(x) { return 1 - Math.pow(1 - clampNum(x, 0, 1, 0), 3); }
  function readParamsAt(progress) {
    const p = readParams();
    const preset = motionPresetKey();
    if (preset === "none") return p;
    const t = clampNum(progress, 0, 1, 0);
    const reveal = easeOutCubic(t);
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
    }
    return p;
  }

  function renderNow() { if (renderer) renderer.render(readParamsAt(motionProgress())); }

  function scheduleRender() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      renderNow();
      updateSelectionOverlay();
    });
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
    $("lc-thickness").disabled = isSolidLayer(L) || L.locked;
    $("lc-tint-color").value = layerColor(L);
    $("lc-tint-alpha").value = L.tintAlpha;
    $("lc-tint-alpha").disabled = isSolidLayer(L) || L.locked;
    [
      "lc-text", "lc-font", "lc-font-size", "lc-font-weight", "lc-letter-spacing",
      "lc-rotation", "lc-layer-solid", "lc-tint-color",
    ].forEach((id) => { $(id).disabled = !!L.locked; });
    // keep the custom System 6 dropdown's visible label in sync with the value
    if (typeof refreshSystemSelectControls === "function") refreshSystemSelectControls();
    syncValueLabels();
    syncWorkbenchReadout();
  }

  function isShapeLayer(L) {
    return !!(L && (L.shape || L.shapeKind));
  }

  function worldBounds(L, cx, cy) {
    const b = L?._localBounds || { left: -0.08, right: 0.08, bottom: -0.08, top: 0.08 };
    const x = cx == null ? L.cx : cx;
    const y = cy == null ? L.cy : cy;
    return {
      left: x + b.left,
      right: x + b.right,
      bottom: y + b.bottom,
      top: y + b.top,
    };
  }

  function linkedChildren(L) {
    if (!L || !isShapeLayer(L)) return [];
    return layers.filter((item) => item.parentId === L.id);
  }

  function linkedFamily(L) {
    if (!L) return [];
    const parent = L.parentId ? layers.find((item) => item.id === L.parentId) : L;
    if (!parent) return [L];
    return [parent, ...linkedChildren(parent)];
  }

  function uniqueLayers(items) {
    return [...new Set(items.filter(Boolean))];
  }

  function selectedPositionRoots() {
    const selected = selectedLayersInStack();
    return selected.filter((L) => !L.hidden && !L.locked && (!L.parentId || !selectedLayerIds.has(L.parentId)));
  }

  function selectedPositionMembers() {
    return uniqueLayers(selectedPositionRoots().flatMap((L) => [L, ...linkedChildren(L).filter((child) => !child.hidden)]));
  }

  function selectedReorderUnit(seed) {
    const selected = selectedLayerIds.has(seed?.id) ? selectedLayersInStack() : [seed];
    return uniqueLayers(selected.flatMap((L) => linkedFamily(L))).sort((a, b) => layers.indexOf(a) - layers.indexOf(b));
  }

  function boundsUnion(items) {
    if (!items.length) return null;
    return items.reduce((acc, item) => {
      const b = item.left == null ? worldBounds(item) : item;
      if (!acc) return { ...b };
      acc.left = Math.min(acc.left, b.left);
      acc.right = Math.max(acc.right, b.right);
      acc.bottom = Math.min(acc.bottom, b.bottom);
      acc.top = Math.max(acc.top, b.top);
      return acc;
    }, null);
  }

  function unitBoundsForLayer(L) {
    return boundsUnion([L, ...linkedChildren(L).filter((child) => !child.hidden)]);
  }

  function updateSelectionOverlay() {
    const box = $("lc-selection-box");
    if (!box || !canvas) return;
    const selected = selectedPositionMembers();
    const bounds = boundsUnion(selected);
    if (!bounds || !selected.length) {
      box.classList.remove("is-visible", "has-single-transform");
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const shellRect = box.parentElement.getBoundingClientRect();
    const left = rect.left - shellRect.left + bounds.left * rect.width;
    const top = rect.top - shellRect.top + (1 - bounds.top) * rect.height;
    box.style.setProperty("--lc-selection-left", left + "px");
    box.style.setProperty("--lc-selection-top", top + "px");
    box.style.setProperty("--lc-selection-width", Math.max(1, (bounds.right - bounds.left) * rect.width) + "px");
    box.style.setProperty("--lc-selection-height", Math.max(1, (bounds.top - bounds.bottom) * rect.height) + "px");
    box.classList.add("is-visible");
    box.classList.toggle("has-single-transform", selectedPositionRoots().length === 1);
  }

  function setLayerPosition(L, x, y, moveChildren) {
    if (!L) return;
    const nx = clampNum(x, -0.5, 1.5, L.cx);
    const ny = clampNum(y, -0.5, 1.5, L.cy);
    const dx = nx - L.cx;
    const dy = ny - L.cy;
    L.cx = nx;
    L.cy = ny;
    if (moveChildren && (dx || dy)) {
      linkedChildren(L).forEach((child) => {
        child.cx = clampNum(child.cx + dx, -0.5, 1.5, child.cx);
        child.cy = clampNum(child.cy + dy, -0.5, 1.5, child.cy);
      });
    }
  }

  function selectedMoveUnit() {
    return selectedReorderUnit(layers[sel]);
  }

  function canMoveSelected(direction) {
    const unit = selectedMoveUnit();
    const indices = unit.map((L) => layers.indexOf(L));
    if (direction === "up") return Math.max(...indices) < layers.length - 1;
    return Math.min(...indices) > 0;
  }

  function moveSelectedLayer(where) {
    const selected = layers[sel];
    if (!selected || selected.locked || layers.length < 2) return;
    const unit = selectedMoveUnit();
    const indices = unit.map((L) => layers.indexOf(L)).sort((a, b) => a - b);
    if (where === "up" && Math.max(...indices) >= layers.length - 1) return;
    if (where === "down" && Math.min(...indices) <= 0) return;
    beginHistory("liquid_cover_reorder_action", "Reorder layers");
    const first = Math.min(...indices);
    const rest = layers.filter((L) => !unit.includes(L));
    let insertAt = first;
    if (where === "top") insertAt = rest.length;
    if (where === "bottom") insertAt = 0;
    if (where === "up") insertAt = Math.min(rest.length, first + 1);
    if (where === "down") insertAt = Math.max(0, first - 1);
    layers.length = 0;
    rest.slice(0, insertAt).forEach((L) => layers.push(L));
    unit.forEach((L) => layers.push(L));
    rest.slice(insertAt).forEach((L) => layers.push(L));
    sel = layers.indexOf(selected);
    rebuildAllSDF();
    renderLayerList();
    loadLayerIntoPanel();
    scheduleRender();
    commitHistory();
  }

  function alignSelectedToArtboard(where) {
    const roots = selectedPositionRoots();
    if (!roots.length) return;
    beginHistory("liquid_cover_align_action", "Align layers");
    const multi = roots.length > 1;
    const selectionBounds = boundsUnion(roots.map(unitBoundsForLayer));
    roots.forEach((L) => {
      const b = unitBoundsForLayer(L);
      let dx = 0, dy = 0;
      if (where === "left") dx = (multi ? selectionBounds.left : 0) - b.left;
      if (where === "center") dx = (multi ? (selectionBounds.left + selectionBounds.right) / 2 : 0.5) - (b.left + b.right) / 2;
      if (where === "right") dx = (multi ? selectionBounds.right : 1) - b.right;
      if (where === "top") dy = (multi ? selectionBounds.top : 1) - b.top;
      if (where === "middle") dy = (multi ? (selectionBounds.bottom + selectionBounds.top) / 2 : 0.5) - (b.bottom + b.top) / 2;
      if (where === "bottom") dy = (multi ? selectionBounds.bottom : 0) - b.bottom;
      setLayerPosition(L, L.cx + dx, L.cy + dy, true);
    });
    syncWorkbenchReadout();
    updateSelectionOverlay();
    scheduleRender();
    commitHistory();
  }

  function addTextInsideSelectedShape() {
    const shape = layers[sel];
    if (!isShapeLayer(shape) || layers.length >= MAX_LAYERS) return;
    beginHistory("liquid_cover_add_action", "Add layer");
    const textLayer = makeLayer({
      parentId: shape.id,
      text: tr("liquid_cover_inside_text_default", "Text"),
      fontSize: clampNum(shape.fontSize * 0.42, 48, 150, 72),
      cx: shape.cx,
      cy: shape.cy,
      renderMode: "solid",
      solidColor: "#ffffff",
      refThickness: shape.refThickness,
    });
    layers.splice(sel + 1, 0, textLayer);
    selectOnly(layers.indexOf(textLayer));
    rebuildAllSDF();
    loadLayerIntoPanel();
    renderLayerList();
    setInspectorPanel("layers");
    scheduleRender();
    commitHistory();
  }

  function removeSelectedLayer() {
    const removed = selectedLayersInStack().filter((L) => !L.locked);
    if (!removed.length || layers.length - removed.length < 1) return;
    beginHistory("liquid_cover_delete_action", "Delete layer");
    const removedIds = new Set(removed.map((L) => L.id));
    const remaining = layers.filter((L) => !removedIds.has(L.id));
    remaining.forEach((L) => {
      if (removedIds.has(L.parentId)) L.parentId = null;
    });
    layers.length = 0;
    remaining.forEach((L) => layers.push(L));
    selectedLayerIds.clear();
    sel = Math.min(sel, layers.length - 1);
    selectedLayerIds.add(layers[sel].id);
    rebuildAllSDF();
    loadLayerIntoPanel();
    renderLayerList();
    setInspectorPanel(isShapeLayer(layers[sel]) ? "glass" : "layers");
    scheduleRender();
    commitHistory();
  }

  function clearLayerDropIndicators(clearDragging) {
    document.querySelectorAll("#lc-layer-list .lc-layer-item").forEach((item) => {
      item.classList.remove("is-drop-before", "is-drop-after");
      if (clearDragging) {
        item.classList.remove("is-dragging");
        item.setAttribute("aria-grabbed", "false");
      }
    });
  }

  function reorderLayerUnit(unitIds, targetId, edge) {
    const moving = layers.filter((L) => unitIds.has(L.id));
    if (!moving.length || unitIds.has(targetId)) return;
    const rest = layers.filter((L) => !unitIds.has(L.id));
    const targetIndex = rest.findIndex((L) => L.id === targetId);
    if (targetIndex < 0) return;
    const insertAt = targetIndex + (edge === "above" ? 1 : 0);
    layers.length = 0;
    rest.slice(0, insertAt).forEach((L) => layers.push(L));
    moving.forEach((L) => layers.push(L));
    rest.slice(insertAt).forEach((L) => layers.push(L));
    sel = layers.findIndex((L) => selectedLayerIds.has(L.id));
    if (sel < 0) sel = layers.indexOf(moving[moving.length - 1]);
    rebuildAllSDF();
    renderLayerList();
    loadLayerIntoPanel();
    scheduleRender();
  }

  function layerDisplayName(L) {
    const fallback = isShapeLayer(L)
      ? tr("liquid_cover_layer_shape", "Shape")
      : tr("liquid_cover_layer_text", "Text");
    return (L.name || (L.text || "").split("\n")[0] || fallback).slice(0, 40);
  }

  function duplicateSelectedLayers() {
    if (layers.length >= MAX_LAYERS) return;
    const source = selectedReorderUnit(layers[sel]);
    const capacity = MAX_LAYERS - layers.length;
    const copiesFrom = source.length <= capacity ? source : [layers[sel]];
    if (!copiesFrom.length) return;
    beginHistory("liquid_cover_duplicate_action", "Duplicate layer");
    const idMap = new Map();
    const copies = copiesFrom.map((L) => {
      const sourceCopy = cloneLayerForHistory(L);
      delete sourceCopy.id;
      const copy = makeLayer({
        ...sourceCopy,
        name: L.name,
        cx: clampNum(L.cx + 16 / DESIGN_W, -0.5, 1.5, L.cx),
        cy: clampNum(L.cy - 16 / DESIGN_H, -0.5, 1.5, L.cy),
        hidden: false,
        locked: false,
      });
      idMap.set(L.id, copy.id);
      return copy;
    });
    copies.forEach((copy, index) => {
      const originalParent = copiesFrom[index].parentId;
      copy.parentId = idMap.get(originalParent) || null;
    });
    copies.forEach((copy) => layers.push(copy));
    selectedLayerIds.clear();
    copies.forEach((copy) => selectedLayerIds.add(copy.id));
    sel = layers.indexOf(copies[copies.length - 1]);
    rebuildAllSDF();
    renderLayerList();
    loadLayerIntoPanel();
    setInspectorPanel(isShapeLayer(layers[sel]) ? "glass" : "layers");
    scheduleRender();
    commitHistory();
  }

  function toggleLayerHidden(L) {
    if (!L) return;
    runHistoryAction("liquid_cover_edit_action", "Edit layer", () => {
      L.hidden = !L.hidden;
      renderLayerList();
      scheduleRender();
    });
  }

  function toggleLayerLocked(L) {
    if (!L) return;
    runHistoryAction("liquid_cover_edit_action", "Edit layer", () => {
      L.locked = !L.locked;
      renderLayerList();
      loadLayerIntoPanel();
      scheduleRender();
    });
  }

  function beginLayerRename(L, row, item) {
    if (!L || L.locked || row.querySelector(".lc-layer-name-input")) return;
    const name = item.querySelector(".lc-layer-name");
    if (!name) return;
    beginHistory("liquid_cover_rename_action", "Rename layer");
    const input = document.createElement("input");
    input.className = "lc-layer-name-input";
    input.type = "text";
    input.maxLength = 40;
    input.value = L.name || layerDisplayName(L);
    input.setAttribute("aria-label", tr("liquid_cover_layer_name", "Layer name"));
    name.replaceWith(input);
    input.focus();
    input.select();
    let finished = false;
    const finish = (save) => {
      if (finished) return;
      finished = true;
      if (save) {
        L.name = input.value.trim().slice(0, 40);
        commitHistory();
      } else {
        cancelHistory();
      }
      renderLayerList();
      loadLayerIntoPanel();
    };
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !eventIsTextComposition(event)) { event.preventDefault(); finish(true); }
      if (event.key === "Escape") { event.preventDefault(); finish(false); }
    });
    input.addEventListener("blur", () => finish(true));
  }

  function layerStateGlyph(kind, active) {
    const icon = document.createElement("span");
    icon.className = "lc-control-icon";
    icon.setAttribute("aria-hidden", "true");
    if (kind === "visibility") {
      icon.innerHTML = '<svg viewBox="0 0 20 20" focusable="false"><path d="M2.4 10s2.8-5 7.6-5 7.6 5 7.6 5-2.8 5-7.6 5-7.6-5-7.6-5Z"></path>'
        + (active ? '<path d="m3.8 3.8 12.4 12.4"></path>' : '<circle cx="10" cy="10" r="2.25"></circle>')
        + "</svg>";
    } else {
      const shackle = active
        ? '<path d="M6.4 9V6.9a3.6 3.6 0 0 1 7.2 0V9"></path>'
        : '<path d="M7.3 9V7.1a3.5 3.5 0 0 1 6.8-1.2"></path>';
      icon.innerHTML = '<svg viewBox="0 0 20 20" focusable="false">' + shackle
        + '<rect x="4.4" y="8.7" width="11.2" height="8" rx="1.8"></rect><path d="M10 12v1.8"></path></svg>';
    }
    return icon;
  }

  function renderLayerList() {
    const list = $("lc-layer-list");
    list.innerHTML = "";
    ensureSelection();
    for (let i = layers.length - 1; i >= 0; i--) {
      const L = layers[i];
      const row = document.createElement("div");
      row.className = "lc-layer-row" + (L.hidden ? " has-hidden-layer" : "") + (L.locked ? " has-locked-layer" : "");
      const item = document.createElement("button");
      item.type = "button";
      const active = selectedLayerIds.has(L.id);
      item.className = "lc-layer-item" + (active ? " is-active" : "") + (i === sel ? " is-primary" : "");
      item.dataset.layerId = L.id;
      item.dataset.reorderable = "true";
      item.title = tr("liquid_cover_layer_drag_hint", "Drag to reorder · Shift-click to multi-select");
      const type = document.createElement("span");
      type.className = "lc-layer-type";
      type.textContent = isShapeLayer(L) ? tr("liquid_cover_layer_shape", "Shape") : tr("liquid_cover_layer_text", "Text");
      const name = document.createElement("span");
      name.className = "lc-layer-name";
      name.textContent = layerDisplayName(L);
      item.appendChild(type);
      item.appendChild(name);
      if (L.parentId) item.dataset.embedded = "true";
      item.setAttribute("aria-pressed", active ? "true" : "false");
      item.setAttribute("aria-grabbed", "false");
      item.addEventListener("click", (event) => {
        if (suppressLayerClick) return;
        if (!event.shiftKey && event.detail >= 2) {
          beginLayerRename(L, row, item);
          return;
        }
        const alreadyOnlySelected = selectedLayerIds.size === 1 && selectedLayerIds.has(L.id);
        if (!event.shiftKey && alreadyOnlySelected) {
          loadLayerIntoPanel();
          setInspectorPanel(isShapeLayer(L) ? "glass" : "layers");
          return;
        }
        if (event.shiftKey) toggleLayerSelection(layers.indexOf(L));
        else selectOnly(layers.indexOf(L));
        loadLayerIntoPanel();
        renderLayerList();
        setInspectorPanel(isShapeLayer(L) ? "glass" : "layers");
      });
      item.addEventListener("dblclick", () => beginLayerRename(L, row, item));
      item.addEventListener("keydown", (event) => {
        if (event.key === "F2") {
          event.preventDefault();
          beginLayerRename(L, row, item);
        }
      });
      item.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || L.locked) return;
        if (!event.shiftKey && !selectedLayerIds.has(L.id)) selectOnly(layers.indexOf(L));
        layerDragState = {
          seed: L,
          startX: event.clientX,
          startY: event.clientY,
          dragging: false,
          unitIds: null,
          targetId: null,
          edge: null,
        };
      });
      const visibility = document.createElement("button");
      visibility.type = "button";
      visibility.className = "btn lc-layer-state" + (L.hidden ? " is-active" : "");
      visibility.appendChild(layerStateGlyph("visibility", L.hidden));
      visibility.setAttribute("aria-label", tr(L.hidden ? "liquid_cover_show_layer" : "liquid_cover_hide_layer", L.hidden ? "Show layer" : "Hide layer"));
      visibility.setAttribute("aria-pressed", L.hidden ? "true" : "false");
      visibility.title = visibility.getAttribute("aria-label");
      visibility.addEventListener("click", () => toggleLayerHidden(L));
      const lock = document.createElement("button");
      lock.type = "button";
      lock.className = "btn lc-layer-state" + (L.locked ? " is-active" : "");
      lock.appendChild(layerStateGlyph("lock", L.locked));
      lock.setAttribute("aria-label", tr(L.locked ? "liquid_cover_unlock_layer" : "liquid_cover_lock_layer", L.locked ? "Unlock layer" : "Lock layer"));
      lock.setAttribute("aria-pressed", L.locked ? "true" : "false");
      lock.title = lock.getAttribute("aria-label");
      lock.addEventListener("click", () => toggleLayerLocked(L));
      row.appendChild(item);
      row.appendChild(visibility);
      row.appendChild(lock);
      list.appendChild(row);
    }
    list.onpointermove = (event) => {
      if (!layerDragState) return;
      const distance = Math.hypot(event.clientX - layerDragState.startX, event.clientY - layerDragState.startY);
      if (!layerDragState.dragging && distance < 5) return;
      event.preventDefault();
      if (!layerDragState.dragging) {
        layerDragState.dragging = true;
        beginHistory("liquid_cover_reorder_action", "Reorder layers");
        layerDragState.unitIds = new Set(selectedReorderUnit(layerDragState.seed).map((entry) => entry.id));
        const source = list.querySelector('[data-layer-id="' + layerDragState.seed.id + '"]');
        source?.classList.add("is-dragging");
        source?.setAttribute("aria-grabbed", "true");
      }
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".lc-layer-item");
      clearLayerDropIndicators();
      if (!target || !list.contains(target) || layerDragState.unitIds.has(target.dataset.layerId)) {
        layerDragState.targetId = null;
        return;
      }
      const rect = target.getBoundingClientRect();
      const edge = event.clientY < rect.top + rect.height / 2 ? "above" : "below";
      target.classList.add(edge === "above" ? "is-drop-before" : "is-drop-after");
      layerDragState.targetId = target.dataset.layerId;
      layerDragState.edge = edge;
    };
    list.onpointerup = () => {
      if (!layerDragState) return;
      const state = layerDragState;
      layerDragState = null;
      if (state.dragging && state.targetId) {
        suppressLayerClick = true;
        reorderLayerUnit(state.unitIds, state.targetId, state.edge);
        commitHistory();
        setTimeout(() => { suppressLayerClick = false; }, 0);
      } else if (state.dragging) cancelHistory();
      clearLayerDropIndicators(true);
    };
    list.onpointercancel = () => {
      layerDragState = null;
      cancelHistory();
      clearLayerDropIndicators(true);
    };
    const removable = selectedLayersInStack().filter((L) => !L.locked).length;
    $("lc-del-layer").disabled = !removable || layers.length - removable < 1;
    $("lc-duplicate-layer").disabled = layers.length >= MAX_LAYERS;
    $("lc-add-layer").disabled = layers.length >= MAX_LAYERS;
    ["lc-add-shape", "lc-shape-circle", "lc-shape-squircle", "lc-shape-capsule"].forEach((id) => {
      const b = $(id); if (b) b.disabled = layers.length >= MAX_LAYERS;
    });
    $("lc-add-inside-text").disabled = !isShapeLayer(layers[sel]) || layers.length >= MAX_LAYERS;
    const primaryLocked = !!layers[sel]?.locked;
    $("lc-layer-bottom").disabled = primaryLocked || !canMoveSelected("down");
    $("lc-layer-down").disabled = primaryLocked || !canMoveSelected("down");
    $("lc-layer-up").disabled = primaryLocked || !canMoveSelected("up");
    $("lc-layer-top").disabled = primaryLocked || !canMoveSelected("up");
    syncWorkbenchReadout();
    updateSelectionOverlay();
  }

  function addBuiltinShape(kind, labelKey, fallback) {
    if (layers.length >= MAX_LAYERS) return;
    beginHistory("liquid_cover_add_action", "Add layer");
    layers.push(makeLayer({
      shapeKind: kind,
      renderMode: "glass",
      text: tr(labelKey, fallback),
      cx: 0.5,
      cy: Math.max(0.15, 0.5 - (layers.length - 1) * 0.18),
    }));
    selectOnly(layers.length - 1);
    rebuildLayerSDF(sel);
    loadLayerIntoPanel();
    renderLayerList();
    setInspectorPanel("glass");
    scheduleRender();
    commitHistory();
  }

  function buildBgRow() {
    const row = $("lc-bg-row"); row.innerHTML = "";
    BG_URLS.forEach((url, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "lc-bg-item" + (i === activeBg ? " is-active" : "");
      b.style.backgroundImage = "url(" + url + ")";
      b.setAttribute("aria-label", tr("liquid_cover_background", "Background") + " " + (i + 1));
      b.setAttribute("aria-pressed", i === activeBg ? "true" : "false");
      // hide the swatch if that photo isn't present on disk
      const probe = new Image();
      probe.onerror = () => { b.style.display = "none"; };
      probe.src = url;
      b.addEventListener("click", () => {
        activeBg = i;
        Array.prototype.forEach.call(row.children, (x, j) => {
          const active = j === i;
          x.classList.toggle("is-active", active);
          x.setAttribute("aria-pressed", active ? "true" : "false");
        });
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

  function layerAtPoint(point) {
    for (let i = layers.length - 1; i >= 0; i--) {
      if (layers[i].hidden || layers[i].locked) continue;
      const b = worldBounds(layers[i]);
      if (point.x >= b.left && point.x <= b.right && point.y >= b.bottom && point.y <= b.top) return i;
    }
    return -1;
  }

  function alignmentCandidates(excluded) {
    const excludedSet = excluded instanceof Set ? excluded : new Set(excluded ? [excluded] : []);
    const x = [0, 0.5, 1];
    const y = [0, 0.5, 1];
    layers.forEach((L) => {
      if (L.hidden || excludedSet.has(L) || excludedSet.has(layers.find((item) => item.id === L.parentId))) return;
      const b = worldBounds(L);
      x.push(b.left, (b.left + b.right) / 2, b.right);
      y.push(b.bottom, (b.bottom + b.top) / 2, b.top);
    });
    return { x, y };
  }

  function nearestSnap(anchors, candidates, threshold) {
    let best = null;
    anchors.forEach((anchor) => {
      candidates.forEach((target) => {
        const delta = target - anchor;
        const distance = Math.abs(delta);
        if (distance <= threshold && (!best || distance < best.distance)) {
          best = { delta, target, distance };
        }
      });
    });
    return best;
  }

  function snapBoundsDelta(bounds, rawDx, rawDy, rect, excluded, disableSnap) {
    if (disableSnap) return { dx: rawDx, dy: rawDy, guideX: null, guideY: null };
    const moved = {
      left: bounds.left + rawDx,
      right: bounds.right + rawDx,
      bottom: bounds.bottom + rawDy,
      top: bounds.top + rawDy,
    };
    const candidates = alignmentCandidates(excluded);
    const snapX = nearestSnap([moved.left, (moved.left + moved.right) / 2, moved.right], candidates.x, 6 / Math.max(1, rect.width));
    const snapY = nearestSnap([moved.bottom, (moved.bottom + moved.top) / 2, moved.top], candidates.y, 6 / Math.max(1, rect.height));
    return {
      dx: rawDx + (snapX ? snapX.delta : 0),
      dy: rawDy + (snapY ? snapY.delta : 0),
      guideX: snapX ? snapX.target : null,
      guideY: snapY ? snapY.target : null,
    };
  }

  function snapLayerPosition(L, rawX, rawY, rect, disableSnap) {
    const snapped = snapBoundsDelta(worldBounds(L), rawX - L.cx, rawY - L.cy, rect, new Set([L]), disableSnap);
    return {
      x: L.cx + snapped.dx,
      y: L.cy + snapped.dy,
      guideX: snapped.guideX,
      guideY: snapped.guideY,
    };
  }

  function marqueeBounds(start, end) {
    return {
      left: Math.min(start.x, end.x),
      right: Math.max(start.x, end.x),
      bottom: Math.min(start.y, end.y),
      top: Math.max(start.y, end.y),
    };
  }

  function boundsIntersect(a, b) {
    return a.left <= b.right && a.right >= b.left && a.bottom <= b.top && a.top >= b.bottom;
  }

  function showSelectionMarquee(bounds) {
    const marquee = $("lc-selection-marquee");
    if (!marquee || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const shellRect = marquee.parentElement.getBoundingClientRect();
    marquee.style.setProperty("--lc-marquee-left", (rect.left - shellRect.left + bounds.left * rect.width) + "px");
    marquee.style.setProperty("--lc-marquee-top", (rect.top - shellRect.top + (1 - bounds.top) * rect.height) + "px");
    marquee.style.setProperty("--lc-marquee-width", ((bounds.right - bounds.left) * rect.width) + "px");
    marquee.style.setProperty("--lc-marquee-height", ((bounds.top - bounds.bottom) * rect.height) + "px");
    marquee.classList.add("is-visible");
  }

  function clearSelectionMarquee() {
    $("lc-selection-marquee")?.classList.remove("is-visible");
  }

  function showAlignmentGuides(guideX, guideY) {
    const guides = $("lc-alignment-guides");
    if (!guides || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const shellRect = guides.getBoundingClientRect();
    guides.classList.toggle("has-x", guideX != null);
    guides.classList.toggle("has-y", guideY != null);
    if (guideX != null) guides.style.setProperty("--lc-guide-x", (rect.left - shellRect.left + guideX * rect.width) + "px");
    if (guideY != null) guides.style.setProperty("--lc-guide-y", (rect.top - shellRect.top + (1 - guideY) * rect.height) + "px");
  }

  function clearAlignmentGuides() {
    const guides = $("lc-alignment-guides");
    if (!guides) return;
    guides.classList.remove("has-x", "has-y");
  }

  // ---- AI auto-style (reuses the app's local/cloud model plumbing) ----
  // t() echoes the key back when a string is missing, so a truthy result is not
  // proof of a real translation — compare against the key to fall back correctly.
  function tr(key, fallback, ...args) {
    const v = typeof t === "function" ? t(key, ...args) : null;
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

  function coverPromptBody(id) {
    const projectId = typeof activeProjectId === "undefined" ? null : activeProjectId;
    const resolved = window.AISystem6PromptFilesRuntime?.resolvePromptFile?.(id, projectId, "en");
    const record = window.AISystem6PromptFiles?.find?.((item) => item.id === id);
    const body = resolved?.status === "ready" ? resolved.body : record?.en;
    if (!body) throw new Error(`Liquid Cover prompt file unavailable: ${id}`);
    if (resolved?.status === "ready") window.AISystem6PromptFilesRuntime?.recordPromptRun?.(projectId, id, resolved);
    return body;
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
    const sys = coverPromptBody("other-apps.liquid-cover-background");
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
    const button = $("lc-t2i-go");
    setBusy(button, true, tr("liquid_cover_ai_thinking", "Thinking…"));
    try {
      showBgPrompt(await requestBgPromptText());
      aiStatus("t2i_done", "Prompt ready — copy it");
    } catch (e) {
      aiStatus(e.code || "error", "Model request failed");
    } finally {
      setBusy(button, false);
    }
  }

  // ---- GPT Image (OpenAI-compatible) background generation, via server proxy ----
  const IMG_CFG_KEY = "aiSystem6.liquidCover.imageGen";
  const IMG_KEY_SESSION_KEY = "aiSystem6.liquidCover.imageGen.apiKey";
  function loadImgCfgIntoPanel() {
    let cfg = {};
    try { cfg = JSON.parse(localStorage.getItem(IMG_CFG_KEY) || "{}") || {}; } catch (e) { cfg = {}; }
    if (cfg.baseUrl) $("lc-img-base").value = cfg.baseUrl;
    if (cfg.model) $("lc-img-model").value = cfg.model;
    let apiKey = "";
    try {
      apiKey = sessionStorage.getItem(IMG_KEY_SESSION_KEY) || "";
      if (!apiKey && cfg.apiKey) {
        apiKey = String(cfg.apiKey);
        sessionStorage.setItem(IMG_KEY_SESSION_KEY, apiKey);
      }
      if (Object.prototype.hasOwnProperty.call(cfg, "apiKey")) {
        delete cfg.apiKey;
        localStorage.setItem(IMG_CFG_KEY, JSON.stringify(cfg));
      }
    } catch (e) {
      apiKey = String(cfg.apiKey || "");
    }
    $("lc-img-key").value = apiKey;
  }
  function saveImgCfg() {
    try {
      localStorage.setItem(IMG_CFG_KEY, JSON.stringify({
        baseUrl: $("lc-img-base").value.trim(),
        model: $("lc-img-model").value.trim(),
      }));
    } catch (e) { /* noop */ }
    try {
      const apiKey = $("lc-img-key").value.trim();
      if (apiKey) sessionStorage.setItem(IMG_KEY_SESSION_KEY, apiKey);
      else sessionStorage.removeItem(IMG_KEY_SESSION_KEY);
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
    const button = $("lc-img-go");
    setBusy(button, true, tr("liquid_cover_ai_img_generating", "Generating image…"));
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
          Array.prototype.forEach.call($("lc-bg-row").children, (x) => {
            x.classList.remove("is-active");
            x.setAttribute("aria-pressed", "false");
          });
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
      setBusy(button, false);
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
    beginHistory("liquid_cover_style_action", "Change style");
    const nudged = applyNudges(brief);
    if (nudged) {
      commitHistory();
      aiStatusText(nudged.length ? nudged.join(" · ") : tr("liquid_cover_ai_nudge_limit", "Already at the limit — values unchanged."));
      return;
    }
    cancelHistory();
    if (typeof fetchModelPayload !== "function") { aiStatus("unavailable", "No model available"); return; }
    aiStatus("thinking", "Thinking…");
    const button = $("lc-ask-go");
    setBusy(button, true, tr("liquid_cover_ai_thinking", "Thinking…"));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    try {
      const imgUrl = aiVisionOn() ? currentBgDataUrl(640) : null;
      // The model is an ART DIRECTOR, not a shader. It never emits optics — it
      // picks ONE named material from the catalog and makes color/light calls a
      // person could make. The numbers are owned by the recipe table on our side.
      const sys = coverPromptBody("other-apps.liquid-cover-style");
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
      beginHistory("liquid_cover_style_action", "Change style");
      if (!applyRecipeByName(spec.recipe)) applyRecipeByName("clear");
      const tintApplied = applyVisionTint(spec, recipeByKey(spec.recipe) || recipeByKey("clear"));
      const ang = lightToAngle(spec.light);
      if (ang != null) setSlider("lc-glare-angle", ang, -180, 180);
      const applied = applyModifiers(spec.modifiers);
      const busy = imgUrl ? applyBusyness(spec.busyness) : null; // background-adaptive thickness/frost
      const tone = imgUrl ? applyBackdrop(spec.backdrop) : null; // background-adaptive shadow
      loadLayerIntoPanel(); syncValueLabels(); renderNow(); scheduleRender();
      commitHistory();
      aiStatusText(describeChoice({ recipe: recipeByKey(spec.recipe) ? spec.recipe : "clear", tintColor: spec.tintColor, tintStrength: tintApplied || "none", light: spec.light, busyness: busy, backdrop: tone, modifiers: applied }));
    } catch (e) {
      cancelHistory();
      aiStatus(ctrl.signal.aborted ? "timeout" : "error", "Model request failed");
    } finally {
      clearTimeout(timer);
      setBusy(button, false);
    }
  }

  function setInspectorPanel(name) {
    const target = String(name || "layers");
    const inspectorCopy = {
      layers: ["liquid_cover_type_properties", "Type properties", "liquid_cover_type_hint", "Select a layer, then change only what matters to it."],
      media: ["liquid_cover_background_properties", "Background", "liquid_cover_background_hint", "Use a built-in scene or bring in your own image."],
      glass: ["liquid_cover_glass_properties", "Glass material", "liquid_cover_glass_hint", "Start with a proven look; open fine-tune only when you need it."],
      export: ["liquid_cover_export_properties", "Export", "liquid_cover_export_hint", "Choose the output once the composition is ready."],
    };
    document.querySelectorAll(".liquid-cover-window [data-lc-inspector-tab]").forEach((button) => {
      const active = button.dataset.lcInspectorTab === target;
      button.classList.toggle("is-active", active);
      if (button.getAttribute("role") === "tab") {
        button.setAttribute("aria-selected", active ? "true" : "false");
      } else {
        button.setAttribute("aria-pressed", active ? "true" : "false");
      }
    });
    document.querySelectorAll("#liquid-cover-app [data-lc-inspector-panel]").forEach((panel) => {
      const active = panel.dataset.lcInspectorPanel === target;
      panel.classList.toggle("is-active", active);
      panel.hidden = !active;
    });
    const copy = inspectorCopy[target] || inspectorCopy.layers;
    const title = $("lc-inspector-title");
    const hint = $("lc-inspector-hint");
    if (title) {
      title.dataset.i18n = copy[0];
      title.textContent = tr(copy[0], copy[1]);
    }
    if (hint) {
      hint.dataset.i18n = copy[2];
      hint.textContent = tr(copy[2], copy[3]);
    }
    if (typeof refreshSystemSelectControls === "function") refreshSystemSelectControls();
    if (typeof syncRovingTabStops === "function") {
      const tablist = document.querySelector(".liquid-cover-window .lc-toolbar-modes");
      if (tablist) syncRovingTabStops(tablist);
    }
  }

  function wireInspectorTabs() {
    document.querySelectorAll(".liquid-cover-window [data-lc-inspector-tab]").forEach((button) => {
      button.addEventListener("click", () => setInspectorPanel(button.dataset.lcInspectorTab));
    });
    setInspectorPanel("layers");
  }

  function wireStageExpand() {
    const btn = $("lc-stage-expand");
    const win = document.querySelector(".liquid-cover-window");
    if (!btn || !win) return;
    btn.addEventListener("click", () => {
      const focused = win.classList.toggle("is-stage-focused");
      btn.setAttribute("aria-pressed", focused ? "true" : "false");
    });
  }

  function wrapDegrees(value) {
    let result = value % 360;
    if (result > 180) result -= 360;
    if (result < -180) result += 360;
    return result;
  }

  function wireTransformHandles() {
    const scaleHandle = $("lc-transform-scale");
    const rotateHandle = $("lc-transform-rotate");
    if (!scaleHandle || !rotateHandle || !canvas) return;

    const startTransform = (event, kind) => {
      if (event.button !== 0) return;
      const root = selectedPositionRoots()[0];
      if (!root || selectedPositionRoots().length !== 1) return;
      event.preventDefault();
      event.stopPropagation();
      const members = uniqueLayers([root, ...linkedChildren(root).filter((child) => !child.hidden && !child.locked)]);
      const rect = canvas.getBoundingClientRect();
      const center = {
        x: rect.left + root.cx * rect.width,
        y: rect.top + (1 - root.cy) * rect.height,
      };
      const startDx = event.clientX - center.x;
      const startDy = event.clientY - center.y;
      const state = {
        kind,
        root,
        members,
        center,
        startX: event.clientX,
        startY: event.clientY,
        startDistance: Math.max(8, Math.hypot(startDx, startDy)),
        startAngle: Math.atan2(startDy, startDx),
        moved: false,
        originals: members.map((L) => ({
          L,
          fontSize: L.fontSize,
          rotation: L.rotation,
          cx: L.cx,
          cy: L.cy,
        })),
      };
      beginHistory("liquid_cover_transform_action", "Transform layer");
      const handle = event.currentTarget;
      handle.setPointerCapture(event.pointerId);

      const move = (moveEvent) => {
        if (!state.moved && Math.hypot(moveEvent.clientX - state.startX, moveEvent.clientY - state.startY) < 2) return;
        state.moved = true;
        const dx = moveEvent.clientX - state.center.x;
        const dy = moveEvent.clientY - state.center.y;
        if (state.kind === "scale") {
          const ratio = clampNum(Math.hypot(dx, dy) / state.startDistance, 0.2, 5, 1);
          state.originals.forEach((origin) => {
            origin.L.fontSize = clampNum(origin.fontSize * ratio, 20, 600, origin.fontSize);
            if (origin.L !== state.root) {
              origin.L.cx = state.root.cx + (origin.cx - state.root.cx) * ratio;
              origin.L.cy = state.root.cy + (origin.cy - state.root.cy) * ratio;
            }
          });
        } else {
          const delta = Math.atan2(dy, dx) - state.startAngle;
          const cosine = Math.cos(-delta);
          const sine = Math.sin(-delta);
          state.originals.forEach((origin) => {
            origin.L.rotation = wrapDegrees(origin.rotation + delta * 180 / Math.PI);
            if (origin.L !== state.root) {
              const ox = origin.cx - state.root.cx;
              const oy = origin.cy - state.root.cy;
              origin.L.cx = state.root.cx + ox * cosine - oy * sine;
              origin.L.cy = state.root.cy + ox * sine + oy * cosine;
            }
          });
        }
        rebuildAllSDF();
        loadLayerIntoPanel();
        updateSelectionOverlay();
        scheduleRender();
      };
      const end = (endEvent) => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", end);
        handle.removeEventListener("pointercancel", cancel);
        try { handle.releasePointerCapture(endEvent.pointerId); } catch (error) { /* noop */ }
        if (state.moved) commitHistory();
        else cancelHistory();
      };
      const cancel = (cancelEvent) => {
        state.originals.forEach((origin) => {
          origin.L.fontSize = origin.fontSize;
          origin.L.rotation = origin.rotation;
          origin.L.cx = origin.cx;
          origin.L.cy = origin.cy;
        });
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", end);
        handle.removeEventListener("pointercancel", cancel);
        try { handle.releasePointerCapture(cancelEvent.pointerId); } catch (error) { /* noop */ }
        cancelHistory();
        rebuildAllSDF();
        loadLayerIntoPanel();
        scheduleRender();
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", end);
      handle.addEventListener("pointercancel", cancel);
    };

    scaleHandle.addEventListener("pointerdown", (event) => startTransform(event, "scale"));
    rotateHandle.addEventListener("pointerdown", (event) => startTransform(event, "rotate"));
  }

  function wireHistoryControls() {
    const ids = [
      "lc-text", "lc-font", "lc-font-size", "lc-font-weight", "lc-letter-spacing", "lc-rotation",
      "lc-thickness", "lc-tint-color", "lc-tint-alpha", "lc-layer-solid",
      ...HISTORY_CONTROL_IDS,
    ];
    ids.forEach((id) => {
      const control = $(id);
      if (!control) return;
      const begin = () => beginHistory("liquid_cover_edit_action", "Edit layer");
      control.addEventListener("pointerdown", begin);
      control.addEventListener("focusin", begin);
      control.addEventListener("change", commitHistory);
      control.addEventListener("blur", commitHistory);
      if (control.matches('input[type="range"]')) {
        control.addEventListener("pointerup", commitHistory);
        control.addEventListener("pointercancel", cancelHistory);
      }
    });
  }

  function wireStageKeyboard() {
    if (!canvas) return;
    canvas.addEventListener("keydown", (event) => {
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redoEditor();
        else undoEditor();
        return;
      }
      if (command && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redoEditor();
        return;
      }
      if (command && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateSelectedLayers();
        return;
      }
      if (command && event.key.toLowerCase() === "a") {
        event.preventDefault();
        selectAllLayers();
        renderLayerList();
        loadLayerIntoPanel();
        return;
      }
      if (command && (event.key === "[" || event.key === "]")) {
        event.preventDefault();
        const forward = event.key === "]";
        moveSelectedLayer(event.shiftKey ? (forward ? "top" : "bottom") : (forward ? "up" : "down"));
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        selectOnly(sel);
        renderLayerList();
        return;
      }
      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        removeSelectedLayer();
        return;
      }
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      const stepPx = event.shiftKey ? 10 : 1;
      const dx = (event.key === "ArrowLeft" ? -stepPx : event.key === "ArrowRight" ? stepPx : 0) / DESIGN_W;
      const dy = (event.key === "ArrowDown" ? -stepPx : event.key === "ArrowUp" ? stepPx : 0) / DESIGN_H;
      beginHistory("liquid_cover_move_action", "Move layer");
      if (dragFgMode) {
        fg.x = clampNum(fg.x + dx, -0.5, 1.5, 0.5);
        fg.y = clampNum(fg.y + dy, -0.5, 1.5, 0.5);
      } else {
        selectedPositionRoots().forEach((L) => setLayerPosition(L, L.cx + dx, L.cy + dy, true));
      }
      syncWorkbenchReadout();
      updateSelectionOverlay();
      scheduleRender();
      commitHistory();
    });
  }

  function wireHistoryKeyboard() {
    document.addEventListener("keydown", (event) => {
      if (event.target === canvas || !event.target.closest?.(".liquid-cover-window")) return;
      const command = event.metaKey || event.ctrlKey;
      if (!command) return;
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) redoEditor();
        else undoEditor();
      } else if (key === "y") {
        event.preventDefault();
        redoEditor();
      } else if (key === "d" && !event.target.matches("input, textarea, select")) {
        event.preventDefault();
        duplicateSelectedLayers();
      }
    });
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
    wireStageExpand();
    wireStageKeyboard();
    wireHistoryKeyboard();
    wireTransformHandles();
    wireFineTuneGroups();
    wireFontControls();
    wireHistoryControls();
    $("lc-undo").addEventListener("click", undoEditor);
    $("lc-redo").addEventListener("click", redoEditor);

    // keep the blue track fill in sync while any slider is dragged
    const app = $("liquid-cover-app");
    if (app) app.addEventListener("input", (e) => {
      const t = e.target;
      if (t && t.matches && t.matches('input[type="range"]')) updateSliderFill(t);
    });

    // aspect buttons
    document.querySelectorAll(".liquid-cover-window .lc-aspect button").forEach((b) => {
      b.addEventListener("click", () => {
        const a = ASPECTS[b.dataset.k]; if (!a) return;
        runHistoryAction("liquid_cover_edit_action", "Edit layer", () => {
          applyAspect(a[0], a[1]);
          document.querySelectorAll(".liquid-cover-window .lc-aspect button").forEach((x) => {
            const active = x === b;
            x.classList.toggle("is-active", active);
            x.setAttribute("aria-pressed", active ? "true" : "false");
          });
          syncWorkbenchReadout();
          rebuildAllSDF();
          scheduleRender(); // background is cover-fit in the shader, no reload needed on aspect change
        });
      });
    });

    // per-layer text geometry → rebuild that layer's SDF
    ["lc-text", "lc-font", "lc-font-size", "lc-font-weight", "lc-letter-spacing", "lc-rotation"].forEach((id) => {
      $(id).addEventListener("input", () => {
        const L = layers[sel];
        if (id === "lc-text") L.text = $("lc-text").value;
        else if (id === "lc-font") {
          if (!applyFontSelection()) return;
        }
        else L[{ "lc-font-size": "fontSize", "lc-font-weight": "fontWeight", "lc-letter-spacing": "letterSpacing", "lc-rotation": "rotation" }[id]] = +$(id).value;
        syncValueLabels();
        rebuildLayerSDF(sel);
        if (id === "lc-text") renderLayerList();
        scheduleRender();
      });
      // <select> also fires "change"
      $(id).addEventListener("change", () => {
        if (id === "lc-font" && applyFontSelection()) {
          rebuildLayerSDF(sel);
          scheduleRender();
        }
      });
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

    [
      ["lc-layer-bottom", "bottom"],
      ["lc-layer-down", "down"],
      ["lc-layer-up", "up"],
      ["lc-layer-top", "top"],
    ].forEach(([id, where]) => $(id).addEventListener("click", () => moveSelectedLayer(where)));
    [
      ["lc-align-left", "left"],
      ["lc-align-center", "center"],
      ["lc-align-right", "right"],
      ["lc-align-top", "top"],
      ["lc-align-middle", "middle"],
      ["lc-align-bottom", "bottom"],
    ].forEach(([id, where]) => $(id).addEventListener("click", () => alignSelectedToArtboard(where)));
    $("lc-add-inside-text").addEventListener("click", addTextInsideSelectedShape);
    $("lc-duplicate-layer").addEventListener("click", duplicateSelectedLayers);

    // layers add/remove
    $("lc-add-layer").addEventListener("click", () => {
      if (layers.length >= MAX_LAYERS) return;
      beginHistory("liquid_cover_add_action", "Add layer");
      layers.push(makeLayer({ text: "Text", cx: 0.5, cy: Math.max(0.15, 0.5 - layers.length * 0.18) }));
      selectOnly(layers.length - 1);
      rebuildLayerSDF(sel); loadLayerIntoPanel(); renderLayerList(); setInspectorPanel("layers"); scheduleRender();
      commitHistory();
    });
    $("lc-del-layer").addEventListener("click", removeSelectedLayer);
    // built-in preset shapes (circle / squircle / capsule) — one click, no upload
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
        beginHistory("liquid_cover_add_action", "Add layer");
        layers.push(makeLayer({
          shape: img,
          renderMode: "glass",
          text: (f.name || "Shape").replace(/\.[^.]+$/, ""),
          cx: 0.5, cy: Math.max(0.15, 0.5 - (layers.length - 1) * 0.18),
        }));
        selectOnly(layers.length - 1);
        rebuildLayerSDF(sel); loadLayerIntoPanel(); renderLayerList(); setInspectorPanel("glass"); scheduleRender();
        commitHistory();
      });
    });

    // background upload
    $("lc-bg-choose").addEventListener("click", () => $("lc-bg-input").click());
    $("lc-bg-input").addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      const bgName = $("lc-bg-name"); bgName.removeAttribute("data-i18n"); bgName.textContent = f.name;
      clearMotionVideo(false);
      loadImageFile(f, (img) => {
        activeBg = -1;
        Array.prototype.forEach.call($("lc-bg-row").children, (x) => {
          x.classList.remove("is-active");
          x.setAttribute("aria-pressed", "false");
        });
        setBg(img);
      });
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
      canvas.focus({ preventScroll: true });
      if (dragFgMode) {
        beginHistory("liquid_cover_move_action", "Move layer");
        drag = { kind: "foreground", start: p, x0: fg.x, y0: fg.y };
      } else {
        const hit = layerAtPoint(p);
        if (hit < 0) {
          drag = {
            kind: "marquee",
            start: p,
            additive: e.shiftKey,
            baseIds: new Set(selectedLayerIds),
            moved: false,
          };
          showSelectionMarquee(marqueeBounds(p, p));
        } else {
          if (e.shiftKey) toggleLayerSelection(hit);
          else if (!selectedLayerIds.has(layers[hit].id)) selectOnly(hit);
          renderLayerList();
          loadLayerIntoPanel();
          setInspectorPanel(isShapeLayer(layers[sel]) ? "glass" : "layers");
          if (!selectedLayerIds.has(layers[hit].id)) return;
          const roots = selectedPositionRoots();
          const members = selectedPositionMembers();
          beginHistory("liquid_cover_move_action", "Move layer");
          drag = {
            kind: "layers",
            start: p,
            roots,
            originals: roots.map((L) => ({ L, x: L.cx, y: L.cy })),
            bounds: boundsUnion(members),
            excluded: new Set(members),
          };
        }
      }
      canvas.setPointerCapture(e.pointerId);
      if (drag.kind !== "marquee") {
        canvas.classList.add("is-grabbing");
        canvas.dataset.dragging = "true";
      }
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const p = pointerToUV(e);
      const rawDx = p.x - drag.start.x;
      const rawDy = p.y - drag.start.y;
      if (drag.kind === "marquee") {
        const bounds = marqueeBounds(drag.start, p);
        drag.moved ||= Math.abs(rawDx * DESIGN_W) > 3 || Math.abs(rawDy * DESIGN_H) > 3;
        showSelectionMarquee(bounds);
        if (drag.moved) {
          const hitIds = layers.filter((L) => boundsIntersect(bounds, worldBounds(L))).map((L) => L.id);
          const next = drag.additive ? new Set(drag.baseIds) : new Set();
          hitIds.forEach((id) => next.add(id));
          if (next.size) {
            selectedLayerIds.clear();
            next.forEach((id) => selectedLayerIds.add(id));
            for (let i = layers.length - 1; i >= 0; i--) {
              if (selectedLayerIds.has(layers[i].id)) {
                sel = i;
                break;
              }
            }
            renderLayerList();
            loadLayerIntoPanel();
          }
        }
        return;
      }
      if (drag.kind === "foreground") {
        fg.x = clampNum(drag.x0 + rawDx, -0.5, 1.5, fg.x);
        fg.y = clampNum(drag.y0 + rawDy, -0.5, 1.5, fg.y);
        clearAlignmentGuides();
      } else {
        const snapped = snapBoundsDelta(drag.bounds, rawDx, rawDy, canvas.getBoundingClientRect(), drag.excluded, e.altKey);
        drag.originals.forEach((origin) => {
          setLayerPosition(origin.L, origin.x + snapped.dx, origin.y + snapped.dy, true);
        });
        showAlignmentGuides(snapped.guideX, snapped.guideY);
      }
      syncWorkbenchReadout();
      updateSelectionOverlay();
      scheduleRender();
    });
    const endDrag = (e) => {
      const movedObject = drag && drag.kind !== "marquee";
      if (drag?.kind === "marquee") clearSelectionMarquee();
      drag = null;
      clearAlignmentGuides();
      canvas.classList.remove("is-grabbing");
      delete canvas.dataset.dragging;
      try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* noop */ }
      if (movedObject) commitHistory();
    };
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
    selectOnly(0);
    applyAspect(DESIGN_W, DESIGN_H);
    // mark the default aspect button active
    document.querySelectorAll(".liquid-cover-window .lc-aspect button").forEach((b) => {
      const active = b.dataset.k === "16:9";
      b.classList.toggle("is-active", active);
      b.setAttribute("aria-pressed", active ? "true" : "false");
    });
    // UI first — these must exist even if WebGL is unavailable right now
    wire();
    loadImgCfgIntoPanel();
    buildBgRow();
    buildPresetRow();
    renderLayerList();
    loadLayerIntoPanel();
    applyMaterialMix(0); // open water-clear (the Apple Liquid Glass reference), not frosted
    updateHistoryButtons();
    startRendering();
  }

  async function open(options = {}) {
    if (!inited) { init(); inited = true; }
    else if (!renderer) { startRendering(); } // WebGL failed last time — retry now
    else { renderNow(); scheduleRender(); }
    if (typeof openWindow === "function") await openWindow("liquidCover", { ...options, skipLiquidCoverEntrypoint: true });
    if (motionVideo) renderNow();
  }

  function runMenuCommand(command) {
    if (!inited) { init(); inited = true; }
    const commands = {
      "choose-background": () => $("lc-bg-input")?.click(),
      "choose-video": () => $("lc-motion-input")?.click(),
      "choose-subject": () => $("lc-fg-input")?.click(),
      "export-png": exportPng,
      "export-video": exportVideo,
      "undo": undoEditor,
      "redo": redoEditor,
      "add-layer": () => {
        if (layers.length >= MAX_LAYERS) return;
        beginHistory("liquid_cover_add_action", "Add layer");
        layers.push(makeLayer({ text: "Text", cx: 0.5, cy: Math.max(0.15, 0.5 - layers.length * 0.18) }));
        selectOnly(layers.length - 1);
        rebuildLayerSDF(sel);
        renderLayerList();
        loadLayerIntoPanel();
        setInspectorPanel("layers");
        scheduleRender();
        commitHistory();
      },
      "duplicate-layer": duplicateSelectedLayers,
      "delete-layer": removeSelectedLayer,
      "text-in-shape": addTextInsideSelectedShape,
      "layer-up": () => moveSelectedLayer("up"),
      "layer-down": () => moveSelectedLayer("down"),
      "layer-top": () => moveSelectedLayer("top"),
      "layer-bottom": () => moveSelectedLayer("bottom"),
      "align-left": () => alignSelectedToArtboard("left"),
      "align-center": () => alignSelectedToArtboard("center"),
      "align-right": () => alignSelectedToArtboard("right"),
      "align-top": () => alignSelectedToArtboard("top"),
      "align-middle": () => alignSelectedToArtboard("middle"),
      "align-bottom": () => alignSelectedToArtboard("bottom"),
      "shape-circle": () => addBuiltinShape("circle", "liquid_cover_shape_circle", "Circle"),
      "shape-squircle": () => addBuiltinShape("squircle", "liquid_cover_shape_squircle", "Rounded Rect"),
      "shape-capsule": () => addBuiltinShape("capsule", "liquid_cover_shape_capsule", "Capsule"),
      "toggle-focus": () => {
        const win = typeof getWindow === "function"
          ? getWindow("liquidCover")
          : document.querySelector('.window[data-window="liquidCover"]');
        const focused = win?.classList.toggle("is-stage-focused");
        $("lc-stage-expand")?.setAttribute("aria-pressed", focused ? "true" : "false");
      },
      "preview-motion": previewMotionOnce,
      "ai-compose": aiSuggestStyle,
    };
    return commands[command]?.();
  }

  // Cover Glass paints on demand, so the continuing cost is the motion preview
  // loop and the video feeding it — both stop on suspend, matching what the
  // preview already did when its own window was hidden. An export in progress
  // is never interrupted: motionExporting keeps its frames running to the end.
  window.AISystem6ApplicationRegistry?.registerApplicationLifecycle?.("liquidCover", {
    onSuspend: () => {
      if (motionExporting) return;
      if (motionPreviewActive) stopMotionPreview(false);
      if (motionVideo) {
        try { motionVideo.pause(); } catch (e) { /* a detached element is fine */ }
      }
    },
    onResume: () => {
      // Deliberately not restarting the preview: a 2–6 second animation the
      // user pressed play on does not silently re-run behind their back.
      if (renderer) renderNow();
    },
    onDispose: () => {
      if (motionPreviewActive) stopMotionPreview(false);
      if (motionVideo) {
        try { motionVideo.pause(); } catch (e) { /* a detached element is fine */ }
      }
      if (renderer) {
        renderer.gl?.getExtension("WEBGL_lose_context")?.loseContext();
        renderer = null;
      }
    },
  });

  window.AISystem6LiquidCover = { open, runMenuCommand };
})();
