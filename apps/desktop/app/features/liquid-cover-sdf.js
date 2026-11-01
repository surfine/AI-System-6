// Cover Glass distance fields: the text or shape mask becomes the signed
// distance field the glass shader reads. Loaded twice: as a lazy page module
// (window.AISystem6LiquidCoverSDF) and, from the same file, as the worker that
// takes rebuilds off the main thread while a slider or handle is dragged.
// The page and the worker therefore run the same arithmetic, so a field built
// in the worker is bitwise the field the page would have built.

(function (root) {
  "use strict";

  const INF = 1e20;

  // ------------------------------------------------------------------
  // Text -> exact signed distance field (Felzenszwalb EDT, tiny-sdf core)
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
  // A light separable box blur on the distance field. The Felzenszwalb EDT on a
  // pixel raster yields a faceted field (nearest-edge-pixel Voronoi cells); those
  // facets become a ribbed edge when zoomed. Smoothing the field removes them and
  // gives the soft, rounded glass edge — radius scales with resolution so the
  // amount of rounding looks the same at preview and at a 6000px export.
  // `radiusHeight` is the full canvas height when `f` is a crop of it.
  function smoothSDF(f, w, h, radiusHeight) {
    const r = Math.max(1, Math.round(1.5 * ((radiusHeight || h) / 1000)));
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

  // A draft field covers only the mask's bounding box plus `margin`; the rest
  // of the canvas is a far constant. Inside the box it is bitwise the full
  // field, because every mask pixel and the nearest background to it lie
  // inside the box. It is for drag previews only: shadow spread and merge
  // distance read the field further out than any fixed margin.
  const FAR = 1e4;
  function maskBox(alpha, width, height, margin) {
    let x0 = width, y0 = height, x1 = -1, y1 = -1;
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        if (alpha[row + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
    }
    if (x1 < 0) return null;
    x0 = Math.max(0, x0 - margin); y0 = Math.max(0, y0 - margin);
    x1 = Math.min(width - 1, x1 + margin); y1 = Math.min(height - 1, y1 + margin);
    return { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
  }

  // One rebuild: mask in, smoothed field (flipped for GL) and the thickest
  // stroke's half-width out. `unit` multiplies every distance, so a half-size
  // draft still reports distances in full-canvas pixels.
  function buildField(alpha, width, height, options) {
    const opts = options || {};
    const unit = opts.unit || 1;
    const box = opts.margin >= 0 ? maskBox(alpha, width, height, opts.margin) : { x: 0, y: 0, width, height };
    let sdf;
    if (!box) {
      sdf = new Float32Array(width * height).fill(FAR);
    } else if (box.width === width && box.height === height) {
      sdf = alphaToSignedDistance(alpha, width, height, true);
      smoothSDF(sdf, width, height);
    } else {
      const crop = new Uint8Array(box.width * box.height);
      for (let y = 0; y < box.height; y++) {
        const from = (box.y + y) * width + box.x;
        crop.set(alpha.subarray(from, from + box.width), y * box.width);
      }
      const part = alphaToSignedDistance(crop, box.width, box.height, true);
      smoothSDF(part, box.width, box.height, height);
      sdf = new Float32Array(width * height).fill(FAR);
      // flipped rows: crop row r is canvas row (height - 1 - (box.y + box.height - 1 - r))
      const top = height - box.y - box.height;
      for (let r = 0; r < box.height; r++) sdf.set(part.subarray(r * box.width, (r + 1) * box.width), (top + r) * width + box.x);
    }
    let mn = 0;
    for (let k = 0; k < sdf.length; k++) { if (sdf[k] < mn) mn = sdf[k]; }
    if (unit !== 1) for (let k = 0; k < sdf.length; k++) sdf[k] *= unit;
    return { sdf, strokeHalfPx: -mn * unit };
  }

  root.AISystem6LiquidCoverSDF = Object.freeze({ alphaToSignedDistance, smoothSDF, maskBox, buildField, FAR });

  // As a worker (WorkerGlobalScope exists only there): one job per message,
  // the mask transferred in and the field transferred back.
  if (typeof root.WorkerGlobalScope !== "undefined") {
    root.onmessage = (event) => {
      const job = event.data;
      const out = buildField(new Uint8Array(job.alpha), job.width, job.height, job);
      root.postMessage({ id: job.id, width: job.width, height: job.height, sdf: out.sdf, strokeHalfPx: out.strokeHalfPx }, [out.sdf.buffer]);
    };
  }
})(typeof window !== "undefined" ? window : globalThis);
