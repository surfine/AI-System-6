// Browser entry for the miniature sample. One voxel world, two tiers:
//   sc2k — orthographic 2:1 isometric, three fixed face brightnesses, stepped
//          slopes, a 1-pixel dark outline, no depth of field: read at a glance.
//   mini — perspective miniature: smooth ground, soft sun and sky light,
//          ambient occlusion, tilt-shift blur, a glazed bonsai tray.
// Parameters arrive on window.__params; the result lands on window.__result.

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { MATERIALS, voxelShade, hash3 } from "./voxel.mjs";
import { buildWorld, terrainSpec, buildSpecimens } from "./scene.mjs";
import { BUILDINGS } from "./buildings.mjs";
import { Model } from "./voxel.mjs";

const params = Object.assign({ tier: "mini", subject: "district", width: 1600, height: 1000 }, window.__params || {});
const SC2K = params.tier === "sc2k";

const srgb = (r, g, b) => new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);

// ------------------------------------------------------------ voxel mesh

// Face brightness for the sc2k tier: top, the two faces the camera sees and
// their opposites (seen after a rotation).
const SC2K_FACE = { top: 1.0, pz: 0.84, nz: 0.84, px: 0.68, nx: 0.68 };

function voxelMesh(model) {
  const pos = [];
  const nor = [];
  const col = [];
  const { w, d, h, data } = model;
  const at = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= w || y >= d || z >= h ? 0 : data[x + w * (y + d * z)]);
  const c = new THREE.Color();
  const quad = (verts, n, color) => {
    const [a, b, cc, dd] = verts;
    for (const v of [a, b, cc, a, cc, dd]) {
      pos.push(v[0], v[1], v[2]);
      nor.push(n[0], n[1], n[2]);
      col.push(color.r, color.g, color.b);
    }
  };
  for (let z = 0; z < h; z += 1) {
    for (let y = 0; y < d; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const m = data[x + w * (y + d * z)];
        if (!m) continue;
        const [r, g, b] = MATERIALS[m].rgb;
        const shade = voxelShade(m, x, y, z);
        const base = srgb(Math.min(255, r * shade), Math.min(255, g * shade), Math.min(255, b * shade));
        // three.js axes: X = voxel x, Y = up (voxel z), Z = voxel y
        const X = x, Y = z, Z = y;
        const face = (key) => (SC2K ? c.copy(base).multiplyScalar(SC2K_FACE[key]) : c.copy(base));
        if (!at(x, y, z + 1)) quad([[X, Y + 1, Z], [X, Y + 1, Z + 1], [X + 1, Y + 1, Z + 1], [X + 1, Y + 1, Z]], [0, 1, 0], face("top"));
        if (!at(x, y + 1, z)) quad([[X, Y, Z + 1], [X + 1, Y, Z + 1], [X + 1, Y + 1, Z + 1], [X, Y + 1, Z + 1]], [0, 0, 1], face("pz"));
        if (!at(x, y - 1, z)) quad([[X + 1, Y, Z], [X, Y, Z], [X, Y + 1, Z], [X + 1, Y + 1, Z]], [0, 0, -1], face("nz"));
        if (!at(x + 1, y, z)) quad([[X + 1, Y, Z + 1], [X + 1, Y, Z], [X + 1, Y + 1, Z], [X + 1, Y + 1, Z + 1]], [1, 0, 0], face("px"));
        if (!at(x - 1, y, z)) quad([[X, Y, Z], [X, Y, Z + 1], [X, Y + 1, Z + 1], [X, Y + 1, Z]], [-1, 0, 0], face("nx"));
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return geometry;
}

// ------------------------------------------------------------ terrain

const GRASS = [138, 182, 88];
const GRASS_DRY = [168, 184, 96];
const SAND = [228, 208, 152];
const SOIL = [150, 108, 74];
const SOIL_DARK = [118, 84, 60];
const BED = [176, 160, 118];
const BED_DEEP = [92, 110, 108];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function smoothNoise(x, y, scale, seed) {
  const fx = x / scale, fy = y / scale;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  const tx = fx - ix, ty = fy - iy;
  const s = (t) => t * t * (3 - 2 * t);
  const v = (a, b) => hash3(a, b, seed);
  const top = v(ix, iy) + (v(ix + 1, iy) - v(ix, iy)) * s(tx);
  const bot = v(ix, iy + 1) + (v(ix + 1, iy + 1) - v(ix, iy + 1)) * s(tx);
  return top + (bot - top) * s(ty);
}

function groundColor(x, z, height, slope, waterZ) {
  const n = smoothNoise(x, z, 14, 3) * 0.6 + smoothNoise(x, z, 5, 9) * 0.4;
  let c = mix(GRASS, GRASS_DRY, Math.max(0, n - 0.35) * 1.2);
  if (height > 20) c = mix(c, GRASS_DRY, 0.35);
  if (slope > 0.9) c = mix(c, SOIL, Math.min(1, (slope - 0.9) * 1.5));
  const above = height - waterZ;
  if (above < 1.4) c = mix(c, SAND, Math.min(1, (1.4 - above) / 1.0));
  if (above < 0) c = mix(BED, BED_DEEP, Math.min(1, -above / 5));
  const j = 1 + (hash3(Math.floor(x), Math.floor(z), 71) - 0.5) * 0.06;
  return [c[0] * j, c[1] * j, c[2] * j];
}

function terrainGeometry(spec) {
  const { tilesX, tilesY, tile, corners } = spec;
  const waterZ = SC2K ? spec.waterZFlat : spec.waterZ;
  const W = tilesX * tile;
  const D = tilesY * tile;
  const pos = [];
  const col = [];
  const c = new THREE.Color();
  const push = (p, rgb) => {
    pos.push(p[0], p[1], p[2]);
    c.copy(srgb(rgb[0], rgb[1], rgb[2]));
    col.push(c.r, c.g, c.b);
  };
  if (SC2K) {
    // One planar-ish quad per tile, flat shaded like the original's slopes.
    const light = new THREE.Vector3(-0.35, 1, 0.55).normalize();
    for (let ty = 0; ty < tilesY; ty += 1) {
      for (let tx = 0; tx < tilesX; tx += 1) {
        const p = [
          [tx * tile, corners[ty][tx], ty * tile],
          [(tx + 1) * tile, corners[ty][tx + 1], ty * tile],
          [(tx + 1) * tile, corners[ty + 1][tx + 1], (ty + 1) * tile],
          [tx * tile, corners[ty + 1][tx], (ty + 1) * tile],
        ];
        for (const tri of [[0, 3, 2], [0, 2, 1]]) {
          const a = new THREE.Vector3(...p[tri[0]]);
          const b = new THREE.Vector3(...p[tri[1]]);
          const cc = new THREE.Vector3(...p[tri[2]]);
          const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(cc, a)).normalize();
          const flat = n.y > 0.999;
          const k = flat ? 1 : 0.72 + 0.45 * Math.max(0, n.dot(light));
          const mid = (a.y + b.y + cc.y) / 3;
          let rgb = mid < waterZ ? BED : (flat ? ((tx + ty) % 2 ? GRASS : mix(GRASS, GRASS_DRY, 0.25)) : mix(GRASS, SOIL, 0.25));
          rgb = rgb.map((v) => v * k);
          for (const i of tri) push(p[i], rgb);
        }
      }
    }
  } else {
    // Smooth ground: 4 samples per tile edge, corner heights blended with a
    // separable smoothing pass, a little noise away from flat pads.
    const R = 4;
    const nx = tilesX * R + 1;
    const nz = tilesY * R + 1;
    const hgt = new Float32Array(nx * nz);
    for (let j = 0; j < nz; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        const tx = Math.min(tilesX - 1, Math.floor(i / R));
        const ty = Math.min(tilesY - 1, Math.floor(j / R));
        const fx = i / R - tx;
        const fy = j / R - ty;
        const a = corners[ty][tx], b = corners[ty][tx + 1], cc = corners[ty + 1][tx], dd = corners[ty + 1][tx + 1];
        hgt[i + nx * j] = a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + cc * (1 - fx) * fy + dd * fx * fy;
      }
    }
    const pinned = (i, j) => {
      const tx = Math.min(tilesX - 1, Math.floor(i / R));
      const ty = Math.min(tilesY - 1, Math.floor(j / R));
      return ty <= 7 && !(tx <= 3 && ty <= 2);
    };
    for (let pass = 0; pass < 3; pass += 1) {
      const next = new Float32Array(hgt);
      for (let j = 1; j < nz - 1; j += 1) {
        for (let i = 1; i < nx - 1; i += 1) {
          if (pinned(i, j) && pinned(i - 1, j) && pinned(i + 1, j) && pinned(i, j - 1) && pinned(i, j + 1)) continue;
          const k = i + nx * j;
          next[k] = (hgt[k] * 4 + hgt[k - 1] + hgt[k + 1] + hgt[k - nx] + hgt[k + nx]) / 8;
        }
      }
      hgt.set(next);
    }
    for (let j = 0; j < nz; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        if (!pinned(i, j)) hgt[i + nx * j] += (smoothNoise(i, j, 3, 17) - 0.5) * 1.6;
      }
    }
    const P = (i, j) => [(i / R) * tile, hgt[i + nx * j], (j / R) * tile];
    for (let j = 0; j < nz - 1; j += 1) {
      for (let i = 0; i < nx - 1; i += 1) {
        const q = [P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)];
        const slope = Math.abs(q[0][1] - q[2][1]) / (tile / R) + Math.abs(q[1][1] - q[3][1]) / (tile / R);
        for (const tri of [[0, 3, 2], [0, 2, 1]]) for (const k of tri) push(q[k], groundColor(q[k][0], q[k][2], q[k][1], slope, waterZ));
      }
    }
  }
  // Skirts on the four sides down to the tray floor, banded like soil strata.
  const bottom = SC2K ? 0 : -2;
  const edge = (x0, z0, x1, z1, h0, h1) => {
    const steps = 3;
    const top0 = h0, top1 = h1;
    let prev0 = top0, prev1 = top1;
    for (let s = 1; s <= steps; s += 1) {
      const y0 = top0 + (bottom - top0) * (s / steps);
      const y1 = top1 + (bottom - top1) * (s / steps);
      const rgb = s === 1 ? SOIL : s === 2 ? SOIL_DARK : mix(SOIL_DARK, [90, 70, 56], 0.5);
      const k = SC2K ? (x0 === x1 ? 0.68 : 0.84) : 1;
      const shaded = rgb.map((v) => v * k);
      for (const p of [[x0, prev0, z0], [x0, y0, z0], [x1, y1, z1], [x0, prev0, z0], [x1, y1, z1], [x1, prev1, z1]]) push(p, shaded);
      prev0 = y0;
      prev1 = y1;
    }
  };
  for (let tx = 0; tx < tilesX; tx += 1) {
    edge(tx * tile, D, (tx + 1) * tile, D, Math.max(corners[tilesY][tx], waterZ), Math.max(corners[tilesY][tx + 1], waterZ));
    edge((tx + 1) * tile, 0, tx * tile, 0, corners[0][tx + 1], corners[0][tx]);
  }
  for (let ty = 0; ty < tilesY; ty += 1) {
    edge(W, (ty + 1) * tile, W, ty * tile, Math.max(corners[ty + 1][tilesX], corners[ty + 1][tilesX] < waterZ ? waterZ : 0), Math.max(corners[ty][tilesX], corners[ty][tilesX] < waterZ ? waterZ : 0));
    edge(0, ty * tile, 0, (ty + 1) * tile, corners[ty][0], corners[ty + 1][0]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function waterMesh(spec) {
  const { tilesX, tilesY, tile, water } = spec;
  const waterZ = SC2K ? spec.waterZFlat : spec.waterZ;
  const group = new THREE.Group();
  const shape = [];
  for (let ty = 0; ty < tilesY; ty += 1) for (let tx = 0; tx < tilesX; tx += 1) if (water[ty][tx]) shape.push([tx, ty]);
  const geo = new THREE.BufferGeometry();
  const pos = [];
  // Mini tier water reaches a little onto the bank so the shoreline is where
  // the smooth ground crosses the surface, not a tile edge.
  const grow = SC2K ? 0 : tile * 0.75;
  for (const [tx, ty] of shape) {
    const x0 = tx * tile, x1 = (tx + 1) * tile, z0 = ty * tile - (water[ty - 1]?.[tx] ? 0 : grow), z1 = (ty + 1) * tile;
    pos.push(x0, waterZ, z0, x0, waterZ, z1, x1, waterZ, z1, x0, waterZ, z0, x1, waterZ, z1, x1, waterZ, z0);
  }
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const material = SC2K
    ? new THREE.MeshBasicMaterial({ color: srgb(64, 150, 196) })
    : new THREE.MeshPhysicalMaterial({ color: srgb(62, 150, 190), transparent: true, opacity: 0.72, roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 });
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = !SC2K;
  group.add(mesh);
  return group;
}

// ------------------------------------------------------------ the tray

function roundedRect(w, d, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -d / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r);
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d);
  s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function bonsaiTray(W, D, rimTop) {
  const group = new THREE.Group();
  const wall = 5;
  const depth = 20;
  const glaze = new THREE.MeshPhysicalMaterial({ color: srgb(58, 96, 150), roughness: 0.22, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08 });
  const outer = roundedRect(W + wall * 2, D + wall * 2, 16);
  const hole = roundedRect(W + 0.4, D + 0.4, 3);
  outer.holes.push(hole);
  const ring = new THREE.ExtrudeGeometry(outer, { depth, bevelEnabled: true, bevelThickness: 1.6, bevelSize: 1.6, bevelSegments: 4, curveSegments: 16 });
  ring.rotateX(Math.PI / 2);
  const ringMesh = new THREE.Mesh(ring, glaze);
  ringMesh.position.set(W / 2, rimTop, D / 2);
  ringMesh.castShadow = true;
  ringMesh.receiveShadow = true;
  group.add(ringMesh);
  // floor and four feet
  const floor = new THREE.Mesh(new THREE.ExtrudeGeometry(roundedRect(W + wall * 2, D + wall * 2, 16), { depth: 3, bevelEnabled: false, curveSegments: 16 }).rotateX(Math.PI / 2), glaze);
  floor.position.set(W / 2, rimTop - depth + 3, D / 2);
  group.add(floor);
  const footMat = new THREE.MeshStandardMaterial({ color: srgb(40, 64, 104), roughness: 0.5 });
  for (const [fx, fz] of [[0.12, 0.12], [0.88, 0.12], [0.12, 0.88], [0.88, 0.88]]) {
    const foot = new THREE.Mesh(new THREE.BoxGeometry(18, 6, 12), footMat);
    foot.position.set(W * fx, rimTop - depth - 3, D * fz);
    foot.castShadow = true;
    group.add(foot);
  }
  // a moss collar where the soil meets the glaze
  const moss = new THREE.Mesh(new THREE.ExtrudeGeometry((() => { const o = roundedRect(W + 0.4, D + 0.4, 3); o.holes.push(roundedRect(W - 5, D - 5, 2)); return o; })(), { depth: 1.2, bevelEnabled: false }).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: srgb(104, 150, 74), roughness: 1 }));
  moss.position.set(W / 2, rimTop - 0.2, D / 2);
  moss.receiveShadow = true;
  group.add(moss);
  return group;
}

// ------------------------------------------------------------ post effects

const TiltShift = (horizontal) => ({
  uniforms: {
    tDiffuse: { value: null },
    texel: { value: new THREE.Vector2(1 / params.width, 1 / params.height) },
    focus: { value: 0.5 },
    band: { value: 0.13 },
    ramp: { value: 0.3 },
    maxBlur: { value: 3.2 },
    dir: { value: horizontal ? new THREE.Vector2(1, 0) : new THREE.Vector2(0, 1) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 texel; uniform float focus; uniform float band; uniform float ramp; uniform float maxBlur; uniform vec2 dir;
    varying vec2 vUv;
    void main(){
      float d = abs(vUv.y - focus);
      float amt = smoothstep(band, band + ramp, d) * maxBlur;
      vec4 sum = vec4(0.0); float wsum = 0.0;
      for (int i = -6; i <= 6; i++) {
        float fi = float(i);
        float w = exp(-fi * fi / 18.0);
        sum += texture2D(tDiffuse, vUv + dir * texel * fi * amt) * w;
        wsum += w;
      }
      gl_FragColor = sum / wsum;
    }`,
});

const Grade = {
  uniforms: { tDiffuse: { value: null }, vignette: { value: params.vignette === false ? 0.0 : 1.0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float vignette; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, 1.12);
      c.rgb = c.rgb * vec3(1.03, 1.0, 0.96) + vec3(0.015, 0.012, 0.0);
      float v = smoothstep(0.95, 0.35, distance(vUv, vec2(0.5, 0.52)));
      c.rgb *= mix(mix(1.0, 0.82, vignette), 1.0, v);
      gl_FragColor = c;
    }`,
};

const Outline = {
  uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, texel: { value: new THREE.Vector2(1 / params.width, 1 / params.height) }, threshold: { value: 0.004 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform sampler2D tDepth; uniform vec2 texel; uniform float threshold; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float d = texture2D(tDepth, vUv).x;
      float far = 0.0;
      far = max(far, texture2D(tDepth, vUv + vec2(texel.x, 0.0)).x - d);
      far = max(far, texture2D(tDepth, vUv - vec2(texel.x, 0.0)).x - d);
      far = max(far, texture2D(tDepth, vUv + vec2(0.0, texel.y)).x - d);
      far = max(far, texture2D(tDepth, vUv - vec2(0.0, texel.y)).x - d);
      if (far > threshold && d < 1.0) c.rgb *= 0.52;
      c.rgb = mix(c.rgb * 12.92, 1.055 * pow(c.rgb, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c.rgb));
      gl_FragColor = c;
    }`,
};

// ------------------------------------------------------------ main

async function main() {
  const canvas = document.createElement("canvas");
  canvas.width = params.width;
  canvas.height = params.height;
  document.body.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !SC2K, preserveDrawingBuffer: true, alpha: false });
  renderer.setPixelRatio(1);
  renderer.setSize(params.width, params.height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  if (!SC2K) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
  }
  const scene = new THREE.Scene();
  scene.background = SC2K ? srgb(24, 28, 36) : srgb(236, 230, 218);

  let W, D, labels = [], spec = null, world;
  if (params.subject === "building") {
    // One building on its own lot, framed at a fixed scale so a sheet of them
    // compares sizes honestly: the camera always looks at the same height.
    const def = BUILDINGS.find((b) => b.id === params.building);
    const model = def.make(params.variant || 0).rotated(params.turn || 0);
    const pad = 4;
    world = new Model(model.w + pad * 2, model.d + pad * 2, model.h + 2);
    world.box(0, 0, 0, world.w, world.d, 1, "grass");
    world.stamp(model, pad, pad, 1);
    W = world.w;
    D = world.d;
  } else if (params.subject === "specimens") {
    const s = buildSpecimens();
    world = s.world;
    labels = s.labels;
    W = world.w;
    D = world.d;
  } else {
    world = buildWorld();
    spec = terrainSpec();
    W = spec.tilesX * spec.tile;
    D = spec.tilesY * spec.tile;
  }

  const voxMat = SC2K ? new THREE.MeshBasicMaterial({ vertexColors: true }) : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
  const vox = new THREE.Mesh(voxelMesh(world), voxMat);
  vox.castShadow = true;
  vox.receiveShadow = true;
  scene.add(vox);

  if (spec) {
    const ground = new THREE.Mesh(terrainGeometry(spec), SC2K ? new THREE.MeshBasicMaterial({ vertexColors: true }) : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    ground.receiveShadow = true;
    scene.add(ground);
    scene.add(waterMesh(spec));
    if (!SC2K) {
      scene.add(bonsaiTray(W, D, spec.corners[4][6] + 2.2));
      const table = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ color: srgb(226, 214, 196), roughness: 0.95 }));
      table.rotation.x = -Math.PI / 2;
      table.position.y = spec.corners[4][6] + 2.2 - 20 - 6;
      table.receiveShadow = true;
      scene.add(table);
    }
  }

  const center = new THREE.Vector3(W / 2, params.subject === "building" ? (params.centerY ?? 44) : (SC2K ? 20 : 10), D / 2);
  let camera;
  if (SC2K) {
    const pxPerUnit = 64 / (32 / Math.SQRT2) * (params.zoom || 1);
    const fw = params.width / pxPerUnit;
    const fh = params.height / pxPerUnit;
    camera = new THREE.OrthographicCamera(-fw / 2, fw / 2, fh / 2, -fh / 2, 1, 2000);
    const el = Math.PI / 6;
    const dir = new THREE.Vector3(Math.cos(el) / Math.SQRT2, Math.sin(el), Math.cos(el) / Math.SQRT2);
    camera.position.copy(center).addScaledVector(dir, 800);
    camera.lookAt(center);
  } else {
    camera = new THREE.PerspectiveCamera(params.fov || 17, params.width / params.height, 10, 6000);
    const el = THREE.MathUtils.degToRad(params.elevation || 36);
    const az = THREE.MathUtils.degToRad(params.azimuth ?? 45);
    const dist = params.distance || (Math.max(W, D) * 3.35);
    const dir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    camera.position.copy(center).addScaledVector(dir, dist);
    camera.lookAt(center);
    const hemi = new THREE.HemisphereLight(srgb(214, 232, 255), srgb(206, 190, 160), 0.95);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(srgb(255, 238, 212), 3.4);
    sun.position.copy(center).add(new THREE.Vector3(330, 360, 60));
    sun.target.position.copy(center);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    const ext = Math.max(W, D) * 0.95;
    Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 10, far: 1600 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.35;
    sun.shadow.radius = 3;
    scene.add(sun, sun.target);
  }

  if (SC2K) {
    const depthTex = new THREE.DepthTexture(params.width, params.height);
    const target = new THREE.WebGLRenderTarget(params.width, params.height, { depthTexture: depthTex, depthBuffer: true, type: THREE.HalfFloatType });
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: target.texture }, tDepth: { value: depthTex }, texel: { value: new THREE.Vector2(1 / params.width, 1 / params.height) }, threshold: { value: 3 / 2000 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: Outline.fragmentShader,
    }));
    const post = new THREE.Scene();
    post.add(quad);
    renderer.render(post, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));
  } else {
    const composer = new EffectComposer(renderer);
    composer.setPixelRatio(1);
    composer.setSize(params.width, params.height);
    composer.addPass(new RenderPass(scene, camera));
    const gtao = new GTAOPass(scene, camera, params.width, params.height);
    gtao.updateGtaoMaterial({ radius: 6, distanceExponent: 1.4, thickness: 2, scale: 1.2, samples: 16 });
    gtao.blendIntensity = 0.85;
    composer.addPass(gtao);
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(params.width, params.height), 0.18, 0.5, 0.92));
    composer.addPass(new OutputPass());
    if (params.tiltShift !== false) {
      for (let i = 0; i < 2; i += 1) {
        composer.addPass(new ShaderPass(TiltShift(true)));
        composer.addPass(new ShaderPass(TiltShift(false)));
      }
    }
    composer.addPass(new ShaderPass(Grade));
    composer.render();
  }

  const projected = labels.map((l) => {
    const v = new THREE.Vector3(l.x, 0, l.y + 4).project(camera);
    return { ...l, sx: (v.x + 1) / 2 * params.width, sy: (1 - v.y) / 2 * params.height };
  });
  window.__result = { ok: true, labels: projected, faces: vox.geometry.attributes.position.count / 6, png: canvas.toDataURL("image/png") };
}

main().catch((error) => { window.__result = { ok: false, error: String(error && error.stack || error) }; });
