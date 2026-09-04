// Bonsai City .sc2 codec / 盆景城市 .sc2 编解码器.
// Clean-room implementation from public format facts (OpenCity2k/SC2k-docs,
// CC BY-SA 4.0, pinned in docs/city-simulator/OPENSC2K-RESEARCH.md; facts
// recorded here in the project's own words, with attribution). No OpenSC2K
// code was consulted. Headless and deterministic: no DOM, no timers, no wall
// clock, no randomness. The decoder emits a v3 engine payload (the
// serialize() shape); the caller runs it through AISystem6BonsaiSim.deserialize.
window.AISystem6BonsaiSc2CodecLoaded = true;

(function initBonsaiSc2Codec() {
  "use strict";

  const SC2_SIZE = 128;
  const SC2_TILES = SC2_SIZE * SC2_SIZE;
  const TICKS_PER_DAY = 5;

  // Decoded (uncompressed) segment byte lengths for a city file.
  const SEGMENT_SIZES = Object.freeze({
    CNAM: 32, MISC: 4800, ALTM: 32768, XTER: 16384, XBLD: 16384, XZON: 16384,
    XUND: 16384, XTXT: 16384, XLAB: 6400, XMIC: 1200, XTHG: 480, XBIT: 16384,
    XTRF: 4096, XPLT: 4096, XVAL: 4096, XCRM: 4096,
    XPLC: 1024, XFIR: 1024, XPOP: 1024, XROG: 1024, XGRP: 3328,
  });
  // These segments are stored raw; every other city segment is RLE packed.
  const UNCOMPRESSED = Object.freeze(["CNAM", "ALTM", "TEXT", "SCEN", "PICT", "TMPL"]);
  const REQUIRED = Object.freeze(["MISC", "ALTM", "XTER", "XBLD", "XZON", "XUND", "XBIT"]);

  // XBLD id ranges, grouped by what our network layers can already carry.
  const inRange = (value, low, high) => value >= low && value <= high;
  const isTreeId = (id) => inRange(id, 0x06, 0x0c);
  const isParkId = (id) => id === 0x0d;
  const isWireId = (id) => inRange(id, 0x0e, 0x1c) || id === 0x43 || id === 0x44 || id === 0x47 || id === 0x48 || id === 0x4f || id === 0x50 || id === 0x5c;
  // Highway crossovers keep the network they cross: 0x4b/0x4c carry a road,
  // 0x4d/0x4e a rail, 0x4f/0x50 a power line underneath the deck.
  const isRoadId = (id) => inRange(id, 0x1d, 0x2b) || inRange(id, 0x3f, 0x46) || id === 0x4b || id === 0x4c
    || inRange(id, 0x51, 0x59);
  const isRailId = (id) => inRange(id, 0x2c, 0x3e) || id === 0x45 || id === 0x46 || id === 0x47 || id === 0x48
    || id === 0x4d || id === 0x4e || id === 0x5a || id === 0x5b || inRange(id, 0x6c, 0x6f);
  const isHighwayId = (id) => inRange(id, 0x49, 0x50) || inRange(id, 0x61, 0x69) || id === 0x6a || id === 0x6b;
  const isOnrampId = (id) => inRange(id, 0x5d, 0x60);
  const isGrowableId = (id) => inRange(id, 0x70, 0xc5);
  const CONSTRUCTION_IDS = Object.freeze([0x88, 0x89, 0xa6, 0xa7, 0xa8, 0xa9, 0xc2, 0xc3]);
  const ABANDONED_IDS = Object.freeze([0x8a, 0x8b, 0xaa, 0xab, 0xac, 0xad, 0xc4, 0xc5]);
  const stageOfGrowableId = (id) => (inRange(id, 0x70, 0x8b) ? 1 : inRange(id, 0x8c, 0xad) ? 2 : 3);

  // Facility mapping: every plant id lands on its real kind (M3). Buildings
  // without a working equivalent survive through catalogId and the sidecar
  // until their milestone lands.
  const FACILITY_BY_ID = Object.freeze({
    0xc6: "hydro", 0xc7: "hydro", 0xc8: "wind", 0xc9: "gas", 0xca: "oil",
    0xcb: "nuclear", 0xcc: "solar", 0xcd: "microwave", 0xce: "fusion", 0xcf: "coal",
    0xd1: "clinic", 0xd2: "police", 0xd3: "fire", 0xd6: "school",
    0xdc: "pump", 0xeb: "water-tower", 0xf4: "treatment", 0xfa: "desal",
  });
  const FACILITY_FOOTPRINT = Object.freeze({
    coal: 2, hydro: 1, oil: 4, gas: 4, nuclear: 4, wind: 1, solar: 4, microwave: 4, fusion: 4,
    pump: 1, "water-tower": 1, treatment: 1, desal: 2, police: 1, fire: 1, school: 1, clinic: 1,
  });

  // Zone nibble (XZON low nibble) -> our zone/density pair.
  const ZONE_BY_NIBBLE = Object.freeze([
    null, { zone: 1, density: 1 }, { zone: 1, density: 2 }, { zone: 2, density: 1 }, { zone: 2, density: 2 },
    { zone: 3, density: 1 }, { zone: 3, density: 2 }, { zone: 4, density: 1 }, { zone: 5, density: 1 }, { zone: 6, density: 1 },
  ]);

  function fail(code) { throw new Error(`bonsai-sc2-invalid: ${code}`); }

  function toBytes(input) {
    if (input instanceof Uint8Array) return input;
    if (input && input.buffer instanceof ArrayBuffer) return new Uint8Array(input.buffer, input.byteOffset || 0, input.byteLength);
    if (input instanceof ArrayBuffer) return new Uint8Array(input);
    if (Array.isArray(input)) return Uint8Array.from(input);
    fail("input");
    return null;
  }

  // --- RLE ------------------------------------------------------------------
  // Packets: a control byte 1..127 is followed by that many literal bytes; a
  // control byte 129..255 repeats the next byte (control - 127) times. 0 and
  // 128 are unused. Packetization is encoder-discretionary, so equality is
  // defined on decoded bytes; our encoder is canonical and deterministic.
  function rleDecode(bytes, expectedLength) {
    const out = [];
    let at = 0;
    while (at < bytes.length) {
      const control = bytes[at]; at += 1;
      if (control >= 1 && control <= 127) {
        if (at + control > bytes.length) fail("rle-literal-bounds");
        for (let n = 0; n < control; n += 1) out.push(bytes[at + n]);
        at += control;
      } else if (control >= 129) {
        if (at >= bytes.length) fail("rle-repeat-bounds");
        const value = bytes[at]; at += 1;
        for (let n = 0; n < control - 127; n += 1) out.push(value);
      } else {
        fail("rle-control");
      }
      if (expectedLength && out.length > expectedLength) fail("rle-overflow");
    }
    if (expectedLength && out.length !== expectedLength) fail("rle-length");
    return Uint8Array.from(out);
  }
  function rleEncode(bytes) {
    const out = [];
    let at = 0;
    while (at < bytes.length) {
      // Measure the run at the cursor; runs of three or more pay for a
      // repeat packet, shorter stretches accumulate into literal packets.
      let run = 1;
      while (at + run < bytes.length && bytes[at + run] === bytes[at] && run < 128) run += 1;
      if (run >= 3) { out.push(127 + run, bytes[at]); at += run; continue; }
      let end = at;
      let literal = 0;
      while (end < bytes.length && literal < 127) {
        let ahead = 1;
        while (end + ahead < bytes.length && bytes[end + ahead] === bytes[end] && ahead < 3) ahead += 1;
        if (ahead >= 3) break;
        end += 1; literal += 1;
      }
      out.push(literal);
      for (let n = at; n < end; n += 1) out.push(bytes[n]);
      at = end;
    }
    return Uint8Array.from(out);
  }

  // --- base64 (deterministic, environment-free) -----------------------------
  const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  function bytesToBase64(bytes) {
    let out = "";
    for (let at = 0; at < bytes.length; at += 3) {
      const a = bytes[at]; const b = at + 1 < bytes.length ? bytes[at + 1] : 0; const c = at + 2 < bytes.length ? bytes[at + 2] : 0;
      out += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)]
        + (at + 1 < bytes.length ? B64[((b & 15) << 2) | (c >> 6)] : "=")
        + (at + 2 < bytes.length ? B64[c & 63] : "=");
    }
    return out;
  }
  function base64ToBytes(text) {
    if (typeof text !== "string" || /[^A-Za-z0-9+/=]/.test(text)) fail("base64");
    const clean = text.replace(/=+$/, "");
    const out = [];
    let buffer = 0; let bits = 0;
    for (const ch of clean) {
      buffer = (buffer << 6) | B64.indexOf(ch); bits += 6;
      if (bits >= 8) { bits -= 8; out.push((buffer >> bits) & 0xff); }
    }
    return Uint8Array.from(out);
  }

  // --- IFF container --------------------------------------------------------
  function readU32(bytes, at) { return ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0; }
  function readI32(bytes, at) { return (bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]; }
  function readAscii(bytes, at, length) { let out = ""; for (let n = 0; n < length; n += 1) out += String.fromCharCode(bytes[at + n]); return out; }

  function parseIff(bytes) {
    if (bytes.length < 12) fail("header-short");
    if (readAscii(bytes, 0, 4) !== "FORM") fail("header-form");
    const declared = readU32(bytes, 4);
    if (declared !== bytes.length - 8) fail("header-length");
    if (readAscii(bytes, 8, 4) !== "SCDH") fail("header-scdh");
    const chunks = [];
    let at = 12;
    while (at < bytes.length) {
      if (at + 8 > bytes.length) fail("chunk-header");
      const id = readAscii(bytes, at, 4);
      if (!/^[\x20-\x7f]{4}$/.test(id)) fail("chunk-id");
      const size = readU32(bytes, at + 4);
      if (at + 8 + size > bytes.length) fail("chunk-bounds");
      chunks.push({ id, bytes: bytes.slice(at + 8, at + 8 + size) });
      at += 8 + size;
    }
    return chunks;
  }

  // decodeSc2: container -> decompressed segments plus structural warnings.
  function decodeSc2(input) {
    const bytes = toBytes(input);
    const chunks = parseIff(bytes);
    const segments = {};
    const order = [];
    const warnings = [];
    for (const chunk of chunks) {
      const raw = UNCOMPRESSED.includes(chunk.id) ? chunk.bytes : rleDecode(chunk.bytes, SEGMENT_SIZES[chunk.id] || 0);
      if (SEGMENT_SIZES[chunk.id] && raw.length !== SEGMENT_SIZES[chunk.id]) fail(`segment-size-${chunk.id}`);
      if (!SEGMENT_SIZES[chunk.id] && !UNCOMPRESSED.includes(chunk.id)) warnings.push(`unknown-segment:${chunk.id}`);
      if (segments[chunk.id]) warnings.push(`duplicate-segment:${chunk.id}`);
      segments[chunk.id] = raw;
      order.push(chunk.id);
    }
    for (const id of REQUIRED) if (!segments[id]) fail(`missing-${id}`);
    let name = "";
    const cnam = segments.CNAM;
    if (cnam && cnam.length >= 2) {
      const length = Math.min(cnam[0], 31);
      for (let n = 1; n <= length; n += 1) {
        const code = cnam[n];
        if (!code) break;
        if (code >= 0x20 && code <= 0x7e) name += String.fromCharCode(code); else break;
      }
    }
    return { segments, order, name: name.trim(), warnings, isScenario: !!segments.SCEN };
  }

  // MISC scalar readers (byte offsets into the 4800-byte segment).
  const MISC = Object.freeze({
    mode: 0x0004, rotation: 0x0008, yearFounded: 0x000c, cityAgeDays: 0x0010, money: 0x0014,
    bondCount: 0x0018, difficulty: 0x001c, rewardTier: 0x0020,
    workforceLifeExpectancy: 0x0048, workforceEducationQuotient: 0x004c,
    residentialTaxCurrent: 0x077c + 4, commercialTaxCurrent: 0x07e8 + 4, industrialTaxCurrent: 0x0854 + 4,
    policeFundingCurrent: 0x0998 + 4, fireFundingCurrent: 0x0a04 + 4,
    healthFundingCurrent: 0x0a70 + 4, schoolFundingCurrent: 0x0adc + 4, collegeFundingCurrent: 0x0b48 + 4,
    roadFundingCurrent: 0x0bb4 + 4, highwayFundingCurrent: 0x0c20 + 4, bridgeFundingCurrent: 0x0c8c + 4,
    railFundingCurrent: 0x0cf8 + 4, subwayFundingCurrent: 0x0d64 + 4, tunnelFundingCurrent: 0x0dd0 + 4,
    ordinanceFlags: 0x0fa0, speed: 0x0fec, paperDelivery: 0x1004, viewX: 0x1018, viewY: 0x101c,
  });
  function readMisc(segment, name) { return readI32(segment, MISC[name]); }
  const clampInt = (value, low, high, fallback) => (Number.isInteger(value) && value >= low && value <= high ? value : fallback);

  // buildCityPayload: decoded segments -> v3 engine payload for deserialize.
  function buildCityPayload(decoded) {
    const { segments } = decoded;
    const warnings = decoded.warnings.slice();
    const count = SC2_TILES;
    const zeros = () => new Array(count).fill(0);
    const layers = {
      terrain: zeros(), alt: zeros(), water: zeros(), shore: zeros(), slope: zeros(), tree: zeros(),
      road: zeros(), rail: zeros(), wire: zeros(), pipe: zeros(), park: zeros(),
      zone: zeros(), density: zeros(), stage: zeros(), buildingState: zeros(), constructionTimer: zeros(), variant: zeros(),
      catalogId: zeros(), subway: zeros(), waterLevel: zeros(), salt: zeros(), rotate: zeros(), tunnel: zeros(), waterKind: zeros(),
      highway: zeros(), onramp: zeros(),
    };
    const altm = segments.ALTM; const xter = segments.XTER; const xbld = segments.XBLD;
    const xzon = segments.XZON; const xund = segments.XUND; const xbit = segments.XBIT;

    for (let i = 0; i < count; i += 1) {
      const packed = (altm[i * 2] << 8) | altm[i * 2 + 1];
      layers.alt[i] = (packed >> 11) & 0x1f;
      layers.waterLevel[i] = (packed >> 6) & 0x1f;
      layers.tunnel[i] = packed & 0x3f;

      const ter = xter[i];
      if (inRange(ter, 0x10, 0x1d) || inRange(ter, 0x30, 0x3d)) { layers.water[i] = 1; layers.waterKind[i] = 1; }
      else if (ter === 0x3e) { layers.water[i] = 1; layers.waterKind[i] = 2; }
      else if (ter === 0x40 || ter === 0x41) { layers.water[i] = 1; layers.waterKind[i] = 3; }
      else if (inRange(ter, 0x42, 0x45)) { layers.water[i] = 1; layers.waterKind[i] = 4; }
      layers.terrain[i] = layers.water[i] ? 0 : 1 + ((i % SC2_SIZE) + Math.floor(i / SC2_SIZE)) % 3;

      const flags = xbit[i];
      layers.rotate[i] = (flags >> 6) & 1;
      layers.salt[i] = (flags >> 7) & 1;

      const under = xund[i];
      if (inRange(under, 0x10, 0x1e) || under === 0x1f || under === 0x20) layers.pipe[i] = 1;
      if (inRange(under, 0x01, 0x0f) || under === 0x1f || under === 0x20 || under === 0x22 || under === 0x23) layers.subway[i] = under;

      const zoneInfo = ZONE_BY_NIBBLE[xzon[i] & 0x0f] || null;
      if (zoneInfo) { layers.zone[i] = zoneInfo.zone; layers.density[i] = zoneInfo.density; }

      const id = xbld[i];
      layers.catalogId[i] = id;
      if (isTreeId(id)) layers.tree[i] = 1;
      if (isParkId(id)) layers.park[i] = 1;
      if (isRoadId(id)) layers.road[i] = 1;
      if (isRailId(id)) layers.rail[i] = 1;
      if (isWireId(id)) layers.wire[i] = 1;
      if (isHighwayId(id)) layers.highway[i] = 1;
      if (isOnrampId(id)) layers.onramp[i] = 1;
      if (isGrowableId(id) && layers.zone[i] >= 1 && layers.zone[i] <= 3) {
        const stage = stageOfGrowableId(id);
        layers.variant[i] = id & 3;
        if (CONSTRUCTION_IDS.includes(id)) { layers.buildingState[i] = 2; layers.stage[i] = 0; }
        else if (ABANDONED_IDS.includes(id)) { layers.buildingState[i] = 5; layers.stage[i] = stage; }
        else { layers.buildingState[i] = 3; layers.stage[i] = stage; }
      }
    }

    // Facilities: walk each mapped id's tiles; the top-left tile of every
    // contiguous run opens one facility (XZON corner bits mark footprints,
    // but the top-left scan is enough because our footprints are smaller).
    const facilities = [];
    const claimed = new Uint8Array(count);
    for (let y = 0; y < SC2_SIZE; y += 1) for (let x = 0; x < SC2_SIZE; x += 1) {
      const i = y * SC2_SIZE + x;
      const kind = FACILITY_BY_ID[xbld[i]];
      if (!kind || claimed[i]) continue;
      const side = FACILITY_FOOTPRINT[kind];
      if (x + side > SC2_SIZE || y + side > SC2_SIZE) continue;
      let free = true;
      for (let dy = 0; dy < side && free; dy += 1) for (let dx = 0; dx < side; dx += 1) {
        const ti = (y + dy) * SC2_SIZE + (x + dx);
        // Hydro plants legitimately stand on waterfall (water) tiles.
        if (claimed[ti] || (layers.water[ti] && kind !== "hydro")) { free = false; break; }
      }
      if (!free) continue;
      for (let dy = 0; dy < side; dy += 1) for (let dx = 0; dx < side; dx += 1) claimed[(y + dy) * SC2_SIZE + (x + dx)] = 1;
      facilities.push({ kind, x, y });
    }

    const misc = segments.MISC;
    const funds = readMisc(misc, "money");
    const yearFounded = clampInt(readMisc(misc, "yearFounded"), 1000, 2999, 1900);
    const ageDays = Math.max(0, readMisc(misc, "cityAgeDays"));
    const taxRates = {
      r: clampInt(readMisc(misc, "residentialTaxCurrent"), 0, 20, 7),
      c: clampInt(readMisc(misc, "commercialTaxCurrent"), 0, 20, 7),
      i: clampInt(readMisc(misc, "industrialTaxCurrent"), 0, 20, 7),
    };
    const taxRate = Math.round((taxRates.r + taxRates.c + taxRates.i) / 3);
    const fundingOf = (name) => clampInt(readMisc(misc, name), 0, 100, 100);

    // XGRP: sixteen graph series of 52 samples each (12 monthly, 20
    // half-yearly, 20 five-yearly, in that stored order [verify-during-impl
    // against a real save; the sidecar keeps the raw bytes either way]).
    const GRAPH_ORDER = ["citySize", "residents", "commerce", "industry", "traffic", "pollution", "value", "crime",
      "powerPercent", "waterPercent", "health", "education", "unemployment", "gnp", "nationalPopulation", "fedRate"];
    let graphs = null;
    if (segments.XGRP && segments.XGRP.length === 3328) {
      graphs = { monthly: {}, halfYearly: {}, fiveYearly: {} };
      for (let series = 0; series < GRAPH_ORDER.length; series += 1) {
        const base = series * 52 * 4;
        const readRun = (start, count) => Array.from({ length: count }, (_, n) => readI32(segments.XGRP, base + (start + n) * 4));
        graphs.monthly[GRAPH_ORDER[series]] = readRun(0, 12);
        graphs.halfYearly[GRAPH_ORDER[series]] = readRun(12, 20);
        graphs.fiveYearly[GRAPH_ORDER[series]] = readRun(32, 20);
      }
    }

    // XMIC: 150 records of 8 bytes — a building-type byte, one single-byte
    // figure, then three 16-bit figures. Raw values ride along; slots with
    // a recognized building type get their kind so the query can label the
    // headline figure. Positions are not stored in the record.
    let microsims = null;
    if (segments.XMIC && segments.XMIC.length === 1200) {
      microsims = [];
      for (let slot = 0; slot < 150; slot += 1) {
        const at = slot * 8;
        const typeByte = segments.XMIC[at];
        if (!typeByte) continue;
        const raw = [segments.XMIC[at + 1],
          (segments.XMIC[at + 2] << 8) | segments.XMIC[at + 3],
          (segments.XMIC[at + 4] << 8) | segments.XMIC[at + 5],
          (segments.XMIC[at + 6] << 8) | segments.XMIC[at + 7]];
        microsims.push({ slot, kind: FACILITY_BY_ID[typeByte] || "", stat: "", x: -1, y: -1, value: raw[1], raw });
      }
    }

    // XTHG: 40 records of 12 bytes; record 0 is a header. The four civil
    // kinds come alive as moving things (raw bytes preserved); every other
    // record kind stays in the sidecar only.
    let things = null;
    if (segments.XTHG && segments.XTHG.length === 480) {
      things = [];
      for (let slot = 1; slot < 40 && things.length < 39; slot += 1) {
        const at = slot * 12;
        const kind = { 1: "airplane", 2: "helicopter", 3: "ship", 9: "sailboat" }[segments.XTHG[at]];
        if (!kind) continue;
        things.push({
          kind, dir: segments.XTHG[at + 1] & 3,
          x: Math.min(SC2_SIZE - 1, segments.XTHG[at + 3]), y: Math.min(SC2_SIZE - 1, segments.XTHG[at + 4]),
          z: segments.XTHG[at + 5],
          raw: Array.from(segments.XTHG.slice(at, at + 12)),
        });
      }
    }

    const sidecarChunks = {};
    for (const id of decoded.order) sidecarChunks[id] = bytesToBase64(segments[id]);

    const payload = {
      format: "bonsai-city", version: 3, rulesetVersion: 3,
      name: decoded.name, seed: 0, rngState: 0, size: SC2_SIZE, terrainPreset: "balanced",
      yearFounded, tick: ageDays * TICKS_PER_DAY,
      funds: Number.isInteger(funds) ? funds : 0, taxRate, taxRates,
      eq: clampInt(readMisc(misc, "workforceEducationQuotient"), 0, 150, 60),
      le: clampInt(readMisc(misc, "workforceLifeExpectancy"), 20, 90, 60),
      ...(graphs ? { graphs } : {}),
      ...(microsims ? { microsims } : {}),
      ...(things ? { things } : {}),
      rewardTier: clampInt(readMisc(misc, "rewardTier"), 0, 6, 0),
      paperDelivery: readMisc(misc, "paperDelivery") !== 0,
      // SCEN: win conditions become a structured scenario record; the
      // original file's TEXT descriptions are never rendered (they stay in
      // the sidecar) — the shell shows only the goal numbers.
      ...(segments.SCEN && segments.SCEN.length >= 52 ? (() => {
        const scen = segments.SCEN;
        const readU16 = (at) => (scen[at] << 8) | scen[at + 1];
        const readS32 = (at) => (scen[at] << 24) | (scen[at + 1] << 16) | (scen[at + 2] << 8) | scen[at + 3];
        const DISASTER_BY_ID = { 1: "fire", 2: "flood", 6: "earthquake", 7: "tornado", 8: "monster" };
        const goals = {};
        if (readS32(0x0a) > 0) goals.population = readS32(0x0a);
        if (readS32(0x1a) > 0) goals.funds = readS32(0x1a);
        if (readS32(0x1e) > 0) goals.landValue = Math.min(255, readS32(0x1e));
        if (readS32(0x22) > 0) goals.pollutionMax = Math.min(255, readS32(0x22));
        if (readS32(0x26) > 0) goals.crimeMax = Math.min(255, readS32(0x26));
        if (readS32(0x2a) > 0) goals.trafficMax = readS32(0x2a);
        const kind = DISASTER_BY_ID[readU16(0x04)];
        return { scenario: { id: "", months: Math.max(1, readU16(0x08)), elapsedMonths: 0, status: "active", goals,
          disaster: kind ? { kind, delayMonths: 1, fired: false, x: scen[0x06], y: scen[0x07] } : null } };
      })() : {}),
      milestone: 0, wasBroke: false, brownout: false, waterShortage: false,
      spawnCenter: { x: clampInt(readMisc(misc, "viewX"), 0, 127, 64), y: clampInt(readMisc(misc, "viewY"), 0, 127, 64) },
      facilities,
      funding: {
        roads: fundingOf("roadFundingCurrent"), highways: fundingOf("highwayFundingCurrent"), bridges: fundingOf("bridgeFundingCurrent"),
        rail: fundingOf("railFundingCurrent"), subway: fundingOf("subwayFundingCurrent"), tunnels: fundingOf("tunnelFundingCurrent"),
        police: fundingOf("policeFundingCurrent"), fire: fundingOf("fireFundingCurrent"), health: fundingOf("healthFundingCurrent"),
        schools: fundingOf("schoolFundingCurrent"), colleges: fundingOf("collegeFundingCurrent"),
      },
      history: [], nextCommandSequence: 1, pendingCommands: [],
      ...layers,
      sc2Sidecar: { version: 1, orientation: "row-major-v1", chunkOrder: decoded.order.slice(), chunks: sidecarChunks },
    };
    return { payload, name: decoded.name, warnings, isScenario: decoded.isScenario };
  }

  function importSc2(input) {
    const decoded = decodeSc2(input);
    if (decoded.isScenario) decoded.warnings.push("scenario-goals-not-loaded");
    return buildCityPayload(decoded);
  }

  // --- Export ----------------------------------------------------------------
  // A native city synthesizes every segment; an imported city starts from
  // its sidecar bytes and overwrites only what the model owns. Losslessness
  // is defined on decoded segments; our encoder is canonical, so our own
  // output is byte-stable.
  const CHUNK_ORDER = Object.freeze(["CNAM", "MISC", "ALTM", "XTER", "XBLD", "XZON", "XUND", "XTXT", "XLAB", "XMIC", "XTHG", "XBIT",
    "XTRF", "XPLT", "XVAL", "XCRM", "XPLC", "XFIR", "XPOP", "XROG", "XGRP"]);
  const FACILITY_EXPORT_ID = Object.freeze({
    coal: 0xcf, hydro: 0xc6, wind: 0xc8, gas: 0xc9, oil: 0xca, nuclear: 0xcb, solar: 0xcc, microwave: 0xcd, fusion: 0xce,
    police: 0xd2, fire: 0xd3, school: 0xd6, clinic: 0xd1, station: 0xed, "subway-station": 0xe9, bus: 0xec,
    pump: 0xdc, "water-tower": 0xeb, treatment: 0xf4, desal: 0xfa,
    "mayors-house": 0xf3, "city-hall": 0xd0, statue: 0xdb, dome: 0xff, arco: 0xfb,
  });
  const FACILITY_EXPORT_SIZE = Object.freeze({
    coal: 2, hydro: 1, wind: 1, gas: 4, oil: 4, nuclear: 4, solar: 4, microwave: 4, fusion: 4,
    police: 1, fire: 1, school: 1, clinic: 1, station: 2, "subway-station": 1, bus: 1,
    pump: 1, "water-tower": 1, treatment: 1, desal: 2,
    "mayors-house": 2, "city-hall": 3, statue: 1, dome: 3, arco: 3,
  });
  const ZONE_EXPORT_NIBBLE = Object.freeze([0, 0, 0, 0, 7, 8, 9]); // ports/military; R/C/I handled with density
  function writeI32(bytes, at, value) {
    bytes[at] = (value >>> 24) & 0xff; bytes[at + 1] = (value >>> 16) & 0xff; bytes[at + 2] = (value >>> 8) & 0xff; bytes[at + 3] = value & 0xff;
  }

  // The payload's map embedded into a 128-square sea apron when smaller.
  function embedded(payload) {
    const size = payload.size;
    const offset = Math.floor((SC2_SIZE - size) / 2);
    const layer = (name) => payload[name] || [];
    const tileAt = (name, x, y, fallback) => {
      const sx = x - offset; const sy = y - offset;
      if (sx < 0 || sy < 0 || sx >= size || sy >= size) return fallback;
      const value = layer(name)[sy * size + sx];
      return value == null ? fallback : value;
    };
    return { offset, size, tileAt };
  }

  // Highway pieces: two straights, four corners, and the four-way; the tee
  // junctions our two-wide ribbon cannot refine land on the four-way, and
  // ends land on the nearest straight (a recorded canonical approximation).
  function highwayPiece(mask) {
    switch (mask) {
      case 5: case 1: case 4: return 0x4a;      // T-B straight
      case 6: return 0x65; case 12: return 0x66; // BR, BL corners
      case 9: return 0x67; case 3: return 0x68;  // TL, TR corners
      case 7: case 11: case 13: case 14: case 15: return 0x69; // junctions
      default: return 0x49;                     // L-R straight
    }
  }
  // Onramp ids encode which side the highway sits and which side the road
  // sits; the unrotated family is canonical for our exporter.
  function onrampPiece(view, x, y) {
    const highwayTop = view.tileAt("highway", x, y - 1, 0);
    const roadLeft = view.tileAt("road", x - 1, y, 0);
    return highwayTop ? (roadLeft ? 0x5d : 0x5e) : (roadLeft ? 0x5f : 0x60);
  }
  function networkMaskAt(view, name, x, y) {
    let mask = 0;
    if (view.tileAt(name, x, y - 1, 0)) mask |= 1; // top
    if (view.tileAt(name, x + 1, y, 0)) mask |= 2; // right
    if (view.tileAt(name, x, y + 1, 0)) mask |= 4; // bottom
    if (view.tileAt(name, x - 1, y, 0)) mask |= 8; // left
    return mask;
  }
  // Straight, corner, tee, and cross piece offsets shared by the power,
  // road, and rail id families (each family's first id is the L-R straight).
  function pieceOffset(mask) {
    switch (mask) {
      case 0: case 10: return 0;      // L-R
      case 5: return 1;               // T-B
      case 2: case 8: return 0; case 1: case 4: return 1;
      case 6: return 6;               // BR corner
      case 12: return 7;              // BL
      case 9: return 8;               // TL
      case 3: return 9;               // TR
      case 7: return 10;              // RTB tee
      case 14: return 11;             // LBR
      case 13: return 12;             // TLB
      case 11: return 13;             // LTR
      case 15: return 14;             // cross
      default: return 0;
    }
  }

  function buildSegmentsFromPayload(payload) {
    const view = embedded(payload);
    const segments = {};
    const altm = new Uint8Array(32768);
    const xter = new Uint8Array(16384);
    const xbld = new Uint8Array(16384);
    const xzon = new Uint8Array(16384);
    const xund = new Uint8Array(16384);
    const xbit = new Uint8Array(16384);
    const facilityTiles = new Map();
    for (const facility of payload.facilities || []) {
      const id = FACILITY_EXPORT_ID[facility.kind];
      if (!id) continue;
      const side = FACILITY_EXPORT_SIZE[facility.kind] || 1;
      for (let dy = 0; dy < side; dy += 1) for (let dx = 0; dx < side; dx += 1) {
        facilityTiles.set(`${facility.x + dx + view.offset}:${facility.y + dy + view.offset}`, { id, corner: (dx === 0 ? 8 : 0) | (dy === 0 ? 4 : 0) | 0 });
      }
    }
    for (let y = 0; y < SC2_SIZE; y += 1) for (let x = 0; x < SC2_SIZE; x += 1) {
      const i = y * SC2_SIZE + x;
      const water = view.tileAt("water", x, y, 1);
      const alt = view.tileAt("alt", x, y, 0) & 0x1f;
      const waterLevel = view.tileAt("waterLevel", x, y, water ? 1 : 0) & 0x1f;
      const tunnel = view.tileAt("tunnel", x, y, 0) & 0x3f;
      const packed = (alt << 11) | (waterLevel << 6) | tunnel;
      altm[i * 2] = (packed >> 8) & 0xff; altm[i * 2 + 1] = packed & 0xff;

      const waterKind = view.tileAt("waterKind", x, y, water ? 1 : 0);
      if (!water) xter[i] = 0x00;
      else if (waterKind === 2) xter[i] = 0x3e;
      else if (waterKind === 3) xter[i] = view.tileAt("water", x - 1, y, 1) && view.tileAt("water", x + 1, y, 1) ? 0x40 : 0x41;
      else if (waterKind === 4) xter[i] = 0x42;
      else xter[i] = 0x30;

      const zone = view.tileAt("zone", x, y, 0);
      const density = view.tileAt("density", x, y, 0);
      let nibble = 0;
      if (zone >= 1 && zone <= 3) nibble = (zone - 1) * 2 + (density === 2 ? 2 : 1);
      else if (zone >= 4) nibble = ZONE_EXPORT_NIBBLE[zone] || 0;
      xzon[i] = nibble;

      const road = view.tileAt("road", x, y, 0); const rail = view.tileAt("rail", x, y, 0); const wire = view.tileAt("wire", x, y, 0);
      const explicit = view.tileAt("catalogId", x, y, 0);
      const facilityTile = facilityTiles.get(`${x}:${y}`);
      const stage = view.tileAt("stage", x, y, 0);
      const buildingState = view.tileAt("buildingState", x, y, 0);
      const variant = view.tileAt("variant", x, y, 0);
      const highwayTile = view.tileAt("highway", x, y, 0);
      const onrampTile = view.tileAt("onramp", x, y, 0);
      const highwayTB = (networkMaskAt(view, "highway", x, y) & 5) !== 0;
      if (facilityTile) { xbld[i] = facilityTile.id; xzon[i] |= 0xf0; }
      else if (explicit) xbld[i] = explicit;
      else if (onrampTile) xbld[i] = onrampPiece(view, x, y);
      else if (highwayTile && road) xbld[i] = highwayTB ? 0x4c : 0x4b;
      else if (highwayTile && rail) xbld[i] = highwayTB ? 0x4e : 0x4d;
      else if (highwayTile && wire) xbld[i] = highwayTB ? 0x50 : 0x4f;
      else if (highwayTile) xbld[i] = water ? 0x6b : highwayPiece(networkMaskAt(view, "highway", x, y));
      else if (road && rail) xbld[i] = 0x45;
      else if (road && wire) xbld[i] = 0x43;
      else if (rail && wire) xbld[i] = 0x47;
      else if (road) xbld[i] = water ? 0x53 : 0x1d + pieceOffset(networkMaskAt(view, "road", x, y));
      else if (rail) xbld[i] = water ? 0x5b : 0x2c + pieceOffset(networkMaskAt(view, "rail", x, y));
      else if (wire) xbld[i] = water ? 0x5c : 0x0e + pieceOffset(networkMaskAt(view, "wire", x, y));
      else if (view.tileAt("park", x, y, 0)) { xbld[i] = 0x0d; xzon[i] |= 0xf0; }
      else if (view.tileAt("tree", x, y, 0)) xbld[i] = 0x06 + (variant % 7);
      else if (zone >= 1 && zone <= 3 && (stage > 0 || buildingState > 0)) {
        const family = zone - 1; // R, C, I
        const sizeClass = Math.max(1, Math.min(3, stage || 1));
        if (buildingState === 2 || buildingState === 1) xbld[i] = [0x88, 0xa6, 0xc2][sizeClass - 1];
        else if (buildingState === 5) xbld[i] = [0x8a, 0xaa, 0xc4][sizeClass - 1];
        else if (sizeClass === 1) xbld[i] = [0x70, 0x7c, 0x84][family] + (variant % [12, 8, 4][family]);
        else if (sizeClass === 2) xbld[i] = [0x8c, 0x94, 0x9e][family] + (variant % [8, 10, 8][family]);
        else xbld[i] = [0xae, 0xb2, 0xbc][family] + (variant % [4, 10, 6][family]);
        xzon[i] |= 0xf0;
      }

      const pipe = view.tileAt("pipe", x, y, 0);
      const subway = view.tileAt("subway", x, y, 0);
      if (pipe && subway) xund[i] = subway === 0x1f || subway === 0x20 ? subway : 0x1f;
      else if (subway) xund[i] = subway >= 2 ? subway : 0x01 + pieceOffset(networkMaskAt(view, "subway", x, y));
      else if (pipe) xund[i] = 0x10 + pieceOffset(networkMaskAt(view, "pipe", x, y));

      let bits = 0;
      if (zone || facilityTile) bits |= 0x01 | 0x04;
      if (view.tileAt("rotate", x, y, 0)) bits |= 0x40;
      if (view.tileAt("salt", x, y, water ? 1 : 0) && water) bits |= 0x80;
      if (water) bits |= 0x20;
      xbit[i] = bits;
    }
    segments.ALTM = altm; segments.XTER = xter; segments.XBLD = xbld; segments.XZON = xzon; segments.XUND = xund; segments.XBIT = xbit;

    // Quarter and sixteenth grids: block maxima over the model's layers.
    const quarter = (name, scale) => {
      const out = new Uint8Array(4096);
      for (let qy = 0; qy < 64; qy += 1) for (let qx = 0; qx < 64; qx += 1) {
        let top = 0;
        for (let dy = 0; dy < 2; dy += 1) for (let dx = 0; dx < 2; dx += 1) {
          top = Math.max(top, view.tileAt(name, qx * 2 + dx, qy * 2 + dy, 0));
        }
        out[qy * 64 + qx] = Math.min(255, Math.floor(top * scale));
      }
      return out;
    };
    const sixteenth = (name) => {
      const out = new Uint8Array(1024);
      for (let sy = 0; sy < 32; sy += 1) for (let sx = 0; sx < 32; sx += 1) {
        let top = 0;
        for (let dy = 0; dy < 4; dy += 1) for (let dx = 0; dx < 4; dx += 1) {
          top = Math.max(top, view.tileAt(name, sx * 4 + dx, sy * 4 + dy, 0));
        }
        out[sy * 32 + sx] = top ? 255 : 0;
      }
      return out;
    };
    segments.XTRF = quarter("traffic", 0.25);
    segments.XPLT = quarter("pollution", 1);
    segments.XVAL = quarter("landValue", 1);
    segments.XCRM = quarter("crime", 1);
    segments.XPLC = sixteenth("policeCovered");
    segments.XFIR = sixteenth("fireCovered");
    const xpop = new Uint8Array(1024);
    for (let sy = 0; sy < 32; sy += 1) for (let sx = 0; sx < 32; sx += 1) {
      let sum = 0;
      for (let dy = 0; dy < 4; dy += 1) for (let dx = 0; dx < 4; dx += 1) {
        const zone = view.tileAt("zone", sx * 4 + dx, sy * 4 + dy, 0);
        if (zone === 1) sum += view.tileAt("stage", sx * 4 + dx, sy * 4 + dy, 0) * (view.tileAt("density", sx * 4 + dx, sy * 4 + dy, 0) === 2 ? 2 : 1);
      }
      xpop[sy * 32 + sx] = Math.min(255, sum * 8);
    }
    segments.XPOP = xpop;
    segments.XROG = new Uint8Array(1024).fill(0x7f);

    // XGRP: sixteen series, 12 + 20 + 20 samples, right-aligned.
    const xgrp = new Uint8Array(3328);
    const GRAPH_ORDER = ["citySize", "residents", "commerce", "industry", "traffic", "pollution", "value", "crime",
      "powerPercent", "waterPercent", "health", "education", "unemployment", "gnp", "nationalPopulation", "fedRate"];
    const graphs = payload.graphs || {};
    GRAPH_ORDER.forEach((series, index) => {
      const base = index * 52 * 4;
      const place = (list, start, cap) => {
        const values = Array.isArray(list) ? list.slice(-cap) : [];
        values.forEach((value, n) => writeI32(xgrp, base + (start + cap - values.length + n) * 4, Math.trunc(value) | 0));
      };
      place(graphs.monthly && graphs.monthly[series], 0, 12);
      place(graphs.halfYearly && graphs.halfYearly[series], 12, 20);
      place(graphs.fiveYearly && graphs.fiveYearly[series], 32, 20);
    });
    segments.XGRP = xgrp;

    // XMIC from the facility ledger; XTXT/XLAB/XTHG stay empty for native
    // cities until their models land.
    const xmic = new Uint8Array(1200);
    (payload.microsims || []).slice(0, 150).forEach((record, slot) => {
      const at = slot * 8;
      const typeByte = FACILITY_EXPORT_ID[record.kind] || 0;
      if (!typeByte) return;
      const raw = Array.isArray(record.raw) ? record.raw : [Math.min(255, record.value || 0), record.value || 0, 0, 0];
      xmic[at] = typeByte; xmic[at + 1] = raw[0] & 0xff;
      xmic[at + 2] = (raw[1] >> 8) & 0xff; xmic[at + 3] = raw[1] & 0xff;
      xmic[at + 4] = (raw[2] >> 8) & 0xff; xmic[at + 5] = raw[2] & 0xff;
      xmic[at + 6] = (raw[3] >> 8) & 0xff; xmic[at + 7] = raw[3] & 0xff;
    });
    segments.XMIC = xmic;
    segments.XTXT = new Uint8Array(16384);
    segments.XLAB = new Uint8Array(6400);
    // XTHG from the live things: record 0 stays a zero header, imported
    // records re-emit their raw bytes with the moved position written over,
    // and native things carry id, rotation, position, and height only.
    const xthg = new Uint8Array(480);
    (Array.isArray(payload.things) ? payload.things : []).slice(0, 39).forEach((thing, index) => {
      const id = { airplane: 1, helicopter: 2, ship: 3, sailboat: 9 }[thing.kind] || 0;
      if (!id) return;
      const at = (index + 1) * 12;
      if (Array.isArray(thing.raw) && thing.raw.length === 12) for (let b = 0; b < 12; b += 1) xthg[at + b] = thing.raw[b] & 255;
      xthg[at] = id;
      xthg[at + 1] = (thing.dir || 0) & 3;
      xthg[at + 3] = Math.max(0, Math.min(SC2_SIZE - 1, (thing.x || 0) + view.offset));
      xthg[at + 4] = Math.max(0, Math.min(SC2_SIZE - 1, (thing.y || 0) + view.offset));
      xthg[at + 5] = Math.max(0, Math.min(255, thing.z || 0));
    });
    segments.XTHG = xthg;
    return segments;
  }

  function patchMisc(misc, payload) {
    writeI32(misc, 0x0000, 0x0122);
    writeI32(misc, MISC.mode, 1);
    writeI32(misc, MISC.yearFounded, payload.yearFounded || 1900);
    writeI32(misc, MISC.cityAgeDays, Math.floor((payload.tick || 0) / TICKS_PER_DAY));
    writeI32(misc, MISC.money, payload.funds | 0);
    writeI32(misc, MISC.bondCount, (payload.bonds || []).length);
    writeI32(misc, MISC.rewardTier, payload.rewardTier || 0);
    writeI32(misc, MISC.workforceLifeExpectancy, payload.le || 60);
    writeI32(misc, MISC.workforceEducationQuotient, payload.eq || 60);
    const rates = payload.taxRates || { r: 7, c: 7, i: 7 };
    writeI32(misc, MISC.residentialTaxCurrent, rates.r); writeI32(misc, MISC.commercialTaxCurrent, rates.c); writeI32(misc, MISC.industrialTaxCurrent, rates.i);
    const funding = payload.funding || {};
    writeI32(misc, MISC.policeFundingCurrent, funding.police ?? 100); writeI32(misc, MISC.fireFundingCurrent, funding.fire ?? 100);
    writeI32(misc, MISC.healthFundingCurrent, funding.health ?? 100); writeI32(misc, MISC.schoolFundingCurrent, funding.schools ?? 100);
    writeI32(misc, MISC.collegeFundingCurrent, funding.colleges ?? 100); writeI32(misc, MISC.roadFundingCurrent, funding.roads ?? 100);
    writeI32(misc, MISC.highwayFundingCurrent, funding.highways ?? 100); writeI32(misc, MISC.bridgeFundingCurrent, funding.bridges ?? 100);
    writeI32(misc, MISC.railFundingCurrent, funding.rail ?? 100); writeI32(misc, MISC.subwayFundingCurrent, funding.subway ?? 100);
    writeI32(misc, MISC.tunnelFundingCurrent, funding.tunnels ?? 100);
    writeI32(misc, MISC.paperDelivery, payload.paperDelivery === false ? 0 : 1);
    writeI32(misc, MISC.speed, 3);
    return misc;
  }

  function exportSc2(payload) {
    if (!payload || payload.format !== "bonsai-city" || (payload.version !== 3 && payload.version !== 4)) fail("export-payload");
    const sidecar = payload.sc2Sidecar && payload.sc2Sidecar.chunks ? payload.sc2Sidecar : null;
    const modeled = buildSegmentsFromPayload(payload);
    const segments = {};
    const order = sidecar && Array.isArray(sidecar.chunkOrder) && sidecar.chunkOrder.length ? sidecar.chunkOrder.slice() : ["CNAM", ...CHUNK_ORDER.slice(1)];
    for (const id of order) {
      if (sidecar && sidecar.chunks[id] && !modeled[id]) segments[id] = base64ToBytes(sidecar.chunks[id]);
      else if (modeled[id]) segments[id] = modeled[id];
    }
    for (const id of CHUNK_ORDER) if (!segments[id] && (modeled[id] || id === "MISC" || id === "CNAM")) {
      if (modeled[id]) segments[id] = modeled[id];
      if (!order.includes(id)) order.push(id);
    }
    // Sidecar cities keep their unmodeled text/things/labels verbatim.
    if (sidecar) for (const id of ["XTXT", "XLAB", "XTHG"]) if (sidecar.chunks[id]) segments[id] = base64ToBytes(sidecar.chunks[id]);
    const misc = sidecar && sidecar.chunks.MISC ? base64ToBytes(sidecar.chunks.MISC) : new Uint8Array(4800);
    segments.MISC = patchMisc(misc.length === 4800 ? misc : new Uint8Array(4800), payload);
    if (!order.includes("MISC")) order.unshift("MISC");
    const cnam = new Uint8Array(32);
    const name = String(payload.name || "").replace(/[^\x20-\x7e]/g, "").slice(0, 23);
    cnam[0] = 0x1f;
    for (let n = 0; n < name.length; n += 1) cnam[n + 1] = name.charCodeAt(n);
    segments.CNAM = cnam;
    if (!order.includes("CNAM")) order.unshift("CNAM");
    const entries = order.filter((id) => segments[id]).map((id) => ({ id, bytes: segments[id] }));
    return buildSc2File(entries);
  }

  // Fixture support: the tests build synthetic files with the same encoder.
  function buildSc2File(segmentEntries) {
    const parts = [];
    let total = 4;
    for (const { id, bytes } of segmentEntries) {
      const body = UNCOMPRESSED.includes(id) ? bytes : rleEncode(bytes);
      const header = new Uint8Array(8);
      for (let n = 0; n < 4; n += 1) header[n] = id.charCodeAt(n);
      header[4] = (body.length >>> 24) & 0xff; header[5] = (body.length >>> 16) & 0xff;
      header[6] = (body.length >>> 8) & 0xff; header[7] = body.length & 0xff;
      parts.push(header, body);
      total += 8 + body.length;
    }
    const out = new Uint8Array(8 + total);
    out.set([0x46, 0x4f, 0x52, 0x4d]);
    out[4] = (total >>> 24) & 0xff; out[5] = (total >>> 16) & 0xff; out[6] = (total >>> 8) & 0xff; out[7] = total & 0xff;
    out.set([0x53, 0x43, 0x44, 0x48], 8);
    let at = 12;
    for (const part of parts) { out.set(part, at); at += part.length; }
    return out;
  }

  window.AISystem6BonsaiSc2Codec = Object.freeze({
    SC2_SIZE, SEGMENT_SIZES, UNCOMPRESSED, REQUIRED, MISC_OFFSETS: MISC, CHUNK_ORDER, FACILITY_EXPORT_ID,
    rleDecode, rleEncode, bytesToBase64, base64ToBytes, parseIff, decodeSc2, buildCityPayload, importSc2, buildSc2File, exportSc2,
  });
})();
