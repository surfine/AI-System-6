// Feature module: One More Take / 再来一条 — the props master's Apple-history quiz.
//
// One More Tune's sibling. Each day is one set of ten takes; a take is either a
// dressed set where the player circles the prop that should not exist yet
// ("scene"), or a board of pairs to match ("pair"). Every object is drawn as a
// props-department elevation: centimetres from published dimensions, one
// camera scale per take, ink lines, and colour only where colour is the clue.
//
// Rules the code holds, and the contract checks:
//   - A take never prints its answer: no model name, year or tagline in the
//     scene markup or its accessible names until the reveal.
//   - A missing date is unknown, never zero (`Number(null) === 0` is the trap).
//   - A prop closer to the scene date than its date precision is not fair game.
//   - A home or office keeps old things: only "too early" is a goof there.
//     "Off sale" is a goof only in an Apple shop window.
//   - The year is 360 set-days (60 sets × 6 rounds) plus 5 anniversaries;
//     a leap year adds 29 February as a sixth special day, so the 360 never shift.
//
// Specs: internal/plans/ONE-MORE-TAKE-GAME-SPEC.zh-CN.md, ONE-MORE-TAKE-60-SETS.zh-CN.md
// Contract: tests/features/one-more-take.test.mjs
window.AISystem6OneMoreTakeLoaded = true;

(function initOneMoreTakeFeature() {
  "use strict";

  const DECK_URL = "/data/one-more-take-deck.json";
  const STORAGE_KEY = "ai-system-6-one-more-take-v1";
  const FILM_SECONDS = 90;
  const WRONG_FILM_COST = 10;
  const MAX_TAKES = 3;
  const MUTATORS = ["standard", "monochrome", "rewind", "intern", "rush", "night"];
  const MONTH_MARGIN = 2;

  // ---------- language and text ----------
  const lang = () => (typeof currentLanguage === "string" && currentLanguage === "en" ? "en" : "zh");
  const L = (value) => (value && typeof value === "object" ? (value[lang()] ?? value.zh ?? "") : String(value ?? ""));
  const tr = (key, ...args) => (typeof t === "function" ? t(key, ...args) : key);
  const esc = (text) => String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // ---------- months: unknown stays unknown ----------
  function ym(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}$/.test(value)) return null;
    const [year, month] = value.split("-").map(Number);
    if (year < 1976 || month < 1 || month > 12) return null;
    return year * 12 + (month - 1);
  }
  const fmt = (n) => `${Math.floor(n / 12)}.${String(n % 12 + 1).padStart(2, "0")}`;
  const fmtLong = (n) => tr("one_more_take_month", Math.floor(n / 12), n % 12 + 1);
  const gapText = (n) => tr("one_more_take_gap", Math.floor(n / 12), n % 12);

  // A take is fair when every prop has a date and none sits within the margin
  // of the scene, so no answer hangs on a month the sources cannot settle.
  function takeIsFair(shot, looks) {
    if (shot.kind !== "scene") return true;
    const scene = ym(shot.date);
    if (scene === null) return false;
    return shot.props.every((p) => {
      const look = looks[p.look];
      const start = ym(look?.start);
      if (start === null) return false;
      if (Math.abs(start - scene) < MONTH_MARGIN) return false;
      if (shot.onSale) { const end = ym(look.end); if (end === null || Math.abs(end - scene) < MONTH_MARGIN) return false; }
      return true;
    });
  }
  // What the take's ruling should be, from the dates alone.
  function goofs(shot, looks) {
    const scene = ym(shot.date);
    return shot.props.filter((p) => {
      const look = looks[p.look];
      const start = ym(look.start);
      if (start > scene) return true;
      if (shot.onSale) { const end = ym(look.end); return end !== null && end < scene; }
      return false;
    }).map((p) => p.look);
  }

  // ---------- the year: 6 rounds × 60 set-days + 5 anniversaries ----------
  function nthWeekday(year, month, weekday, nth) {
    const first = new Date(year, month - 1, 1).getDay();
    return 1 + ((weekday - first + 7) % 7) + (nth - 1) * 7;
  }
  function anniversaryOn(date, deck) {
    const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
    return (deck?.anniversaries || []).find((a) => a.month === m && (a.day ? a.day === d : nthWeekday(y, m, a.weekday, a.nth) === d)) || null;
  }
  function dayPlan(date, deck) {
    const anniversary = anniversaryOn(date, deck);
    if (anniversary) return { anniversary, round: null, setNumber: null, mutator: "standard" };
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    let index = 0;
    for (const cursor = new Date(date.getFullYear(), 0, 1); cursor < target; cursor.setDate(cursor.getDate() + 1)) {
      if (!anniversaryOn(cursor, deck)) index += 1;
    }
    const round = Math.floor(index / 60) % 6;
    return { anniversary: null, round: round + 1, setNumber: (index % 60) + 1, mutator: MUTATORS[round] };
  }
  const todayKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  // ---------- storage: a convenience, never required ----------
  function readStore() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {}; } catch { return {}; }
  }
  function writeStore(next) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* private window: play on without saving */ }
  }

  // ---------- the record both games share (One More Tune reads it too) ----------
  // One key in the desk's keyval store; each game writes only its own fields.
  const LINK_KEY = "oneMoreLink";
  const FIRST_DEVICES = ["Apple II", "Macintosh", "PowerBook", "iMac", "iBook", "iPod", "iPhone", "iPad", "MacBook", "Apple Watch"];
  async function updateLink(patch) {
    if (typeof openAppDb !== "function" || typeof idbRequest !== "function") return false;
    try {
      const db = await openAppDb();
      const name = typeof keyvalStoreName === "string" ? keyvalStoreName : "keyval";
      const store = db.transaction(name, "readwrite").objectStore(name);
      const current = await idbRequest(store.get(LINK_KEY));
      await idbRequest(store.put({ ...(current && typeof current === "object" ? current : {}), ...patch, updatedAt: new Date().toISOString() }, LINK_KEY));
      db.close();
      return true;
    } catch { return false; }
  }

  // ---------- drawing: centimetres, origin at the foot of the object ----------
  const PAPER = "#fbfaf7";
  const TAPE = (x, y, w, h, r = -5) => `<rect class="solid" x="${x}" y="${y}" width="${w}" height="${h}" transform="rotate(${r} ${x + w / 2} ${y + h / 2})"/>`;
  const GROUND = (rx, cy = 0.2) => `<path d="M${-rx} ${cy} q${rx * 0.5} 0.25 ${rx} 0 t${rx} 0" fill="none"/>`;
  const macWindow = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${PAPER}"/><rect x="${x}" y="${y}" width="${w}" height="${h * 0.13}" fill="${PAPER}"/>`;
  const glass = (x, y, w, h) => `<rect class="glass" x="${x}" y="${y}" width="${w}" height="${h}" fill="#f1f3f4"/><line class="hair" x1="${x + w * 0.78}" y1="${y + h * 0.1}" x2="${x + w * 0.62}" y2="${y + h * 0.34}"/><line class="hair" x1="${x + w * 0.88}" y1="${y + h * 0.1}" x2="${x + w * 0.72}" y2="${y + h * 0.34}"/>`;

  const PAINT = {
    // iMac G3: Rev A–D 38.6 W × 40.1 H; slot-loading 38.1 × 38.1. 15-inch CRT.
    imacG3(o = {}) {
      const W = o.w || 38.6, H = o.h || 40.1, sx = W / 38.6, sy = H / 40.1;
      const fill = o.pattern ? `url(#take-${o.pattern})` : o.hex;
      const shell = "M-14 -40.1 Q0 -41 14 -40.1 Q18.6 -39.5 19 -34 Q19.6 -18 19.3 -8 Q19 -1 15 0 L-15 0 Q-19 -1 -19.3 -8 Q-19.6 -18 -19 -34 Q-18.6 -39.5 -14 -40.1 Z";
      return { box: [-19.6 * sx, -42.4 * sy, 39.2 * sx, 43 * sy], svg: `${GROUND(18 * sx)}
        <g transform="scale(${sx} ${sy})">
          <path d="M-7.5 -40.2 Q0 -43 7.5 -40.2" fill="none"/>
          <path class="sil tint" d="${shell}" fill="${fill}"/>
          <rect x="-15.8" y="-38.7" width="31.6" height="25.8" rx="2.6" fill="${PAPER}"/>
          <rect x="-14.2" y="-37.5" width="28.4" height="22.5" rx="1.9" fill="${PAPER}"/>
          ${glass(-13.5, -36.8, 27, 20.4)}${macWindow(-8.5, -34.2, 13.5, 9.4)}
          ${TAPE(-0.9, -11.9, 1.8, 1.3, 3)}
          ${o.slot ? `<rect class="solid" x="-6.5" y="-9.2" width="13" height="0.5" rx="0.25"/>` : `<line x1="-9" y1="-8.7" x2="9" y2="-8.7"/>`}
          ${[-1, 1].map((sd) => Array.from({ length: 16 }, (_, k) => `<circle class="fine" cx="${sd * (11.6 + (k % 4) * 0.9)}" cy="${-7.6 + Math.floor(k / 4) * 0.9}" r="0.22"/>`).join("")).join("")}
        </g>` };
    },
    // iMac G4 15-inch: panel 38.4 W with its acrylic surround; dome base 26.96 cm.
    imacG4() {
      return { box: [-19.4, -47, 38.8, 47.6], svg: `${GROUND(14)}
        <rect x="-0.75" y="-30" width="1.5" height="20" rx="0.7" fill="${PAPER}"/>
        <path class="sil" d="M-13.48 0 A13.48 10.7 0 0 1 13.48 0 Z" fill="${PAPER}"/>
        <line x1="-8" y1="-4.4" x2="8" y2="-4.4"/>${TAPE(-0.8, -7.4, 1.6, 1.2, 3)}
        <rect class="sil" x="-19.2" y="-46.5" width="38.4" height="30.5" rx="1.6" fill="${PAPER}"/>
        <rect x="-18.2" y="-45.5" width="36.4" height="28.5" rx="1.1" fill="${PAPER}"/>
        ${glass(-15.2, -43.6, 30.4, 22.8)}${macWindow(-9, -41, 15, 10.5)}` };
    },
    // iBook clamshell, open: 34.3 W, 4.6 thick; 12.1-inch 800×600 = 24.6 × 18.4 cm.
    ibookClam(o = {}) {
      return { box: [-17.5, -30.8, 35, 31.4], svg: `${GROUND(17)}
        <rect class="sil tint" x="-16.2" y="-30.4" width="32.4" height="26" rx="3.4" fill="${o.hex}"/>
        <rect x="-14.6" y="-28.9" width="29.2" height="23" rx="2" fill="${PAPER}"/>
        ${glass(-12.3, -27.6, 24.6, 18.4)}${macWindow(-7, -25.4, 12.5, 8.6)}
        ${TAPE(-1.5, -8.7, 3, 0.9, 0)}
        <path d="M-15.6 -5.6 L15.6 -5.6 L17.15 -4.6 L-17.15 -4.6 Z" fill="${PAPER}"/>
        <path class="sil tint" d="M-17.15 -4.6 L17.15 -4.6 Q17.5 -1 15 0 L-15 0 Q-17.5 -1 -17.15 -4.6 Z" fill="${o.hex}"/>
        <rect x="-13" y="-3.2" width="26" height="1.2" rx="0.6" fill="${PAPER}"/>` };
    },
    // iBook (Dual USB) look: 28.4 W × 3.4 H; 12.1-inch 1024×768.
    ibookWhite() {
      return { box: [-14.5, -25.4, 29, 25.8], svg: `${GROUND(14.5)}
        <rect class="sil" x="-13.6" y="-25.2" width="27.2" height="21.4" rx="1.1" fill="${PAPER}"/>
        ${glass(-12.3, -23.6, 24.6, 18.4)}${macWindow(-7.5, -21.6, 13, 9)}
        <path d="M-13.5 -4.4 L13.5 -4.4 L14.2 -3.4 L-14.2 -3.4 Z" fill="${PAPER}"/>
        <rect class="sil" x="-14.2" y="-3.4" width="28.4" height="3.4" rx="0.9" fill="${PAPER}"/>` };
    },
    // MacBook 13-inch (2006): 32.5 W × 2.75 H; 13.3-inch 1280×800; iSight above the screen.
    macbookWhite() {
      return { box: [-16.6, -24.4, 33.2, 24.8], svg: `${GROUND(17)}
        <rect class="sil" x="-16.25" y="-24.2" width="32.5" height="20.8" rx="0.6" fill="${PAPER}"/>
        ${glass(-14.3, -22.3, 28.6, 17.9)}${macWindow(-9, -20.2, 15.5, 10)}
        <circle class="solid" cx="0" cy="-23.25" r="0.22"/>
        <path d="M-15.6 -4.2 L15.6 -4.2 L16.25 -2.75 L-16.25 -2.75 Z" fill="${PAPER}"/>
        <rect class="sil" x="-16.25" y="-2.75" width="32.5" height="2.75" rx="0.5" fill="${PAPER}"/>` };
    },
    // A notebook from its own numbers: width, lid height, base thickness, screen size.
    laptop(o = {}) {
      const w = o.w || 30, lid = o.lid || 22, base = o.base || 3, sw = o.sw || w * 0.8, sh = o.sh || lid * 0.75;
      const half = w / 2, lidTop = -(base + lid), screenX = -sw / 2, screenY = lidTop + (lid - sh) * (o.thin ? 0.42 : 0.5);
      const body = o.body ? ` class="sil tint" fill="${o.body}"` : ` class="sil" fill="${PAPER}"`;
      return { box: [-half - 0.5, lidTop - 0.4, w + 1, -lidTop + 0.8], svg: `${GROUND(half)}
        <rect${body} x="${-half}" y="${lidTop}" width="${w}" height="${lid}" rx="${o.curve ? 2.2 : 0.8}"/>
        <rect x="${screenX - 0.6}" y="${screenY - 0.6}" width="${sw + 1.2}" height="${sh + 1.2}" rx="0.4" fill="${PAPER}"/>
        ${glass(screenX, screenY, sw, sh)}${macWindow(screenX + sw * 0.18, screenY + sh * 0.12, sw * 0.5, sh * 0.5)}
        <path d="M${-half + 0.6} ${-base - 1} L${half - 0.6} ${-base - 1} L${half} ${-base} L${-half} ${-base} Z" fill="${PAPER}"/>
        ${o.trackball ? `<circle cx="0" cy="${-base - 0.5}" r="0.9" fill="${PAPER}"/>` : ""}
        <rect${body} x="${-half}" y="${-base}" width="${w}" height="${base}" rx="${o.curve ? 1.4 : 0.6}"/>
        ${TAPE(-0.9, -base * 0.65, 1.8, Math.min(1.1, base * 0.4), 0)}` };
    },
  };
  function paintLook(look) {
    const painter = PAINT[look?.art];
    return painter ? painter(look.artOptions || {}) : { box: [-5, -10, 10, 10], svg: `<rect class="sil" x="-5" y="-10" width="10" height="10" fill="${PAPER}"/>` };
  }

  const DESK = {
    mug: (o) => `${GROUND(4.6)}<rect class="sil" x="-4" y="-9.5" width="8" height="9.5" rx="0.6" fill="${PAPER}"/><path d="M4 -7.6 q3.2 .3 2.9 3 q-.3 2.4 -2.9 2.4" fill="none"/>`,
    lamp: () => `<ellipse cx="0" cy="0" rx="7.5" ry="1.1" fill="${PAPER}"/><path d="M0 -0.6 L-5 -26 L3 -40" fill="none"/><path class="sil" d="M-3.5 -41 L10 -46.5 L13 -40 L-0.5 -34.5 Z" fill="${PAPER}"/>`,
    papers: () => [0, 1, 2, 3].map((i) => `<rect x="${-15 + i * 0.4}" y="${-1.1 - i}" width="30" height="1" fill="${PAPER}"/>`).join(""),
    card: () => `<g transform="rotate(-4)"><rect x="-6" y="-4.5" width="12" height="4.5" fill="${PAPER}"/>${[1, 2, 3].map((y, i) => `<line class="hair" x1="-5" y1="${-4.5 + y}" x2="${3 - i * 2}" y2="${-4.5 + y}"/>`).join("")}</g>`,
  };
  const WALL = {
    pinboard: ({ x, y, w, h }) => `<rect class="sil" x="${x}" y="${y}" width="${w}" height="${h}" fill="${PAPER}"/><rect x="${x + 6}" y="${y + 6}" width="${w - 12}" height="${h - 12}" fill="${PAPER}"/>${[[0.08, 0.12, 4], [0.36, 0.2, -6], [0.66, 0.1, 3], [0.14, 0.58, -3], [0.52, 0.56, 5]].map(([a, b, r]) => { const px = x + w * a, py = y + h * b; return `<rect x="${px}" y="${py}" width="${w * 0.24}" height="${h * 0.3}" fill="${PAPER}" transform="rotate(${r} ${px + w * 0.12} ${py + h * 0.15})"/><circle class="solid" cx="${px + w * 0.12}" cy="${py + 5}" r="2.5"/>`; }).join("")}`,
  };
  const LOCATIONS = {
    study: { win: [60, 60, 200, 170, "night"] },
    dorm: { win: [50, 40, 200, 170, "night"] },
    office: { win: [690, 40, 220, 170, "day"] },
    cafe: { win: [690, 36, 230, 170, "day"] },
    lounge: { win: [40, 30, 880, 150, "day"] },
    store: { glass: true },
  };
  const DEFS = `<defs><pattern id="take-flower" width="4.6" height="4.6" patternUnits="userSpaceOnUse"><rect width="4.6" height="4.6" fill="#ff93c7"/>${[0, 72, 144, 216, 288].map((a) => `<circle cx="${1.3 + Math.cos(a * Math.PI / 180) * 0.6}" cy="${1.3 + Math.sin(a * Math.PI / 180) * 0.6}" r="0.48" fill="#fff6b0"/>`).join("")}<circle cx="1.3" cy="1.3" r="0.36" fill="#f0559a"/>${[0, 72, 144, 216, 288].map((a) => `<circle cx="${3.6 + Math.cos(a * Math.PI / 180) * 0.52}" cy="${3.5 + Math.sin(a * Math.PI / 180) * 0.52}" r="0.42" fill="#a6dcff"/>`).join("")}</pattern></defs>`;

  function windowFrame([x, y, w, h, sky]) {
    const pane = (px, py) => `<line class="hair" x1="${px + w * 0.36}" y1="${py + h * 0.08}" x2="${px + w * 0.26}" y2="${py + h * 0.26}"/><line class="hair" x1="${px + w * 0.43}" y1="${py + h * 0.08}" x2="${px + w * 0.33}" y2="${py + h * 0.26}"/>`;
    return `<rect class="sil" x="${x - 8}" y="${y - 8}" width="${w + 16}" height="${h + 16}" fill="${PAPER}"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${PAPER}"/>
      <path d="M${x + w / 2} ${y}V${y + h}M${x} ${y + h / 2}H${x + w}" fill="none"/><path class="sil" d="M${x - 18} ${y + h + 8}H${x + w + 18}" fill="none"/>${pane(x + w / 2, y)}
      ${sky === "night" ? `<path d="M${x + w * 0.3} ${y + h * 0.14} a14 14 0 1 0 14 22 a11 11 0 1 1 -14 -22 Z" fill="${PAPER}"/>` : ""}`;
  }
  function placed(prop, shot, looks) {
    const scale = shot.k * (prop.s || 1);
    const art = paintLook(looks[prop.look]);
    const [bx, by, bw, bh] = art.box;
    return { art, scale, box: [prop.x + bx * scale, prop.y + by * scale, bw * scale, bh * scale] };
  }
  // On a phone held upright the wide set leaves the props small, so the camera
  // moves in: the crop is the props' own area, padded, at 4:3. It never cuts a
  // prop; a set too wide to crop keeps the full 16:9 frame.
  function cropFor(shot, looks, aspect) {
    const full = [0, 0, 960, 540];
    if (!aspect || shot.kind !== "scene") return full;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    shot.props.forEach((p) => { const [x, y, w, h] = placed(p, shot, looks).box; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h); });
    const pad = 40; x0 -= pad; y0 -= pad; x1 += pad; y1 = Math.max(y1, shot.deskY + 16) + pad;
    let w = x1 - x0, h = y1 - y0;
    if (w / h > aspect) h = w / aspect; else w = h * aspect;
    if (w > 960 || h > 540) return full;
    const x = Math.min(Math.max((x0 + x1) / 2 - w / 2, 0), 960 - w), y = Math.min(Math.max((y0 + y1) / 2 - h / 2, 0), 540 - h);
    return [x, y, w, h];
  }
  // The set as markup. Props carry only their index: nothing names them.
  function sceneMarkup(shot, looks, { interactive = true, frameWidth = 960, monochrome = false, crop = [0, 0, 960, 540] } = {}) {
    const loc = LOCATIONS[shot.loc] || {};
    const k = shot.k, dy = shot.deskY;
    let out = `${DEFS}<rect width="960" height="540" fill="${PAPER}"/><g class="one-more-take-art${monochrome ? " is-monochrome" : ""}">`;
    if (loc.win) out += windowFrame(loc.win);
    (shot.wall || []).forEach((w) => { if (WALL[w.d]) out += WALL[w.d](w); });
    out += `<line class="ground" x1="0" y1="${dy}" x2="960" y2="${dy}"/><line x1="0" y1="${dy + 14}" x2="960" y2="${dy + 14}"/>`;
    if (loc.glass) out += [0, 1].map((i) => `<line class="hair" x1="${820 + i * 22}" y1="30" x2="${780 + i * 22}" y2="110"/>`).join("");
    (shot.decor || []).forEach((d) => { if (DESK[d.d]) out += `<g transform="translate(${d.x} ${d.y}) scale(${k})">${DESK[d.d](d)}</g>`; });
    const minHit = Math.min(110, 40 * crop[2] / Math.max(frameWidth, 1));
    shot.props.forEach((prop, i) => {
      const { art, scale } = placed(prop, shot, looks);
      let [bx, by, bw, bh] = art.box;
      const min = minHit / scale;
      if (bw < min) { bx -= (min - bw) / 2; bw = min; }
      if (bh < min) { by -= (min - bh) / 2; bh = min; }
      const attrs = interactive ? ` class="one-more-take-prop" data-take-prop="${i}" tabindex="0" role="button" aria-label="${esc(tr("one_more_take_prop", i + 1))}"` : "";
      out += `<g${attrs} transform="translate(${prop.x} ${prop.y}) scale(${scale})">${art.svg}${interactive ? `<rect class="hit" x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="${8 / scale}"/>` : ""}</g>`;
    });
    out += "</g>";
    if (interactive) {
      const [cx, cy, cw, ch] = crop;
      const bar = 10 * k, bx = cx + cw / 2 - bar / 2, by = cy + ch - 16;
      out += `<rect class="one-more-take-edge" x="${cx + 0.5}" y="${cy + 0.5}" width="${cw - 1}" height="${ch - 1}"/>`;
      out += `<g class="one-more-take-scalebar" aria-hidden="true"><path d="M${bx} ${by - 4}V${by}H${bx + bar}V${by - 4}"/><text x="${bx + bar / 2}" y="${by - 7}" text-anchor="middle">10 cm</text></g>`;
      out += `<g data-take-rings>${shot.props.map((prop, i) => { const [x, y, w, h] = placed(prop, shot, looks).box; return `<ellipse class="one-more-take-ring" pathLength="1" data-take-ring="${i}" cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2 + 14}" ry="${h / 2 + 12}" transform="rotate(${i % 2 ? 3 : -4} ${x + w / 2} ${y + h / 2})"/>`; }).join("")}</g><g data-take-tags></g>`;
    }
    return out;
  }
  // A single look on its own, for the pair board.
  function lookThumb(look) {
    const { box, svg } = paintLook(look);
    const [bx, by, bw, bh] = box;
    return `<svg class="one-more-take-thumb" viewBox="${bx - 1} ${by - 1} ${bw + 2} ${bh + 2}" aria-hidden="true"><g class="one-more-take-art">${svg}</g></svg>`;
  }

  // ---------- the time ruler ----------
  function rulerMarkup(shot, looks, width) {
    const S = ym(shot.date);
    const rows = shot.props.map((p) => ({ id: p.look, look: looks[p.look], s: ym(looks[p.look]?.start), e: ym(looks[p.look]?.end) }))
      .filter((r) => r.s !== null).sort((a, b) => a.s - b.s);
    let lo = Math.min(S, ...rows.map((r) => r.s)), hi = Math.max(S, ...rows.map((r) => r.s));
    if (shot.onSale) hi = Math.max(hi, ...rows.map((r) => r.e ?? r.s));
    const span = Math.max(hi - lo, 18); lo -= Math.round(span * 0.08) + 2; hi += Math.round(span * 0.1) + 3;
    const W = Math.round(Math.max(260, width || 600)), L0 = 4, R0 = W - 4, X = (m) => L0 + (m - lo) / (hi - lo) * (R0 - L0);
    const top = 18, rowH = 22, H = top + rows.length * rowH + 14;
    const years = (hi - lo) / 12, step = [1, 2, 5, 10].find((s) => years / s <= Math.max(4, Math.floor(W / 80))) || 10;
    let ticks = "";
    for (let y = Math.ceil(lo / 12); y * 12 <= hi; y += 1) { if (y % step) continue; const x = X(y * 12); ticks += `<line class="tick" x1="${x}" y1="${top - 4}" x2="${x}" y2="${H - 13}"/><text class="year" x="${x}" y="${H - 2}" text-anchor="middle">${y}</text>`; }
    const xs = X(S + 0.5), clean = shot.verdict === "clean";
    const textW = (s) => [...s].reduce((a, c) => a + (c.charCodeAt(0) > 0x2e80 ? 11 : 6.2), 0);
    let body = "";
    rows.forEach((r, i) => {
      const y = top + i * rowH, bad = r.id === shot.wrong;
      const x1 = X(r.s), x2 = shot.onSale && r.e !== null ? X(r.e + 1) : R0;
      let label = `${L(r.look.short)} ${fmt(r.s)}`, dim = "";
      if (bad && shot.verdict === "early") { label += ` · ${tr("one_more_take_early_by", gapText(r.s - S))}`; dim = `<line class="dim" x1="${xs}" y1="${y + 14.5}" x2="${x1}" y2="${y + 14.5}"/>`; }
      if (bad && shot.verdict === "offsale") { label += ` · ${tr("one_more_take_off_sale_for", gapText(S - r.e))}`; dim = `<line class="dim" x1="${X(r.e + 1)}" y1="${y + 14.5}" x2="${xs}" y2="${y + 14.5}"/>`; }
      const anchor = x1 + textW(label) > R0 ? "end" : "start";
      body += `<text class="name${bad ? " bad" : ""}" x="${anchor === "end" ? R0 : x1}" y="${y + 9}" text-anchor="${anchor}">${esc(label)}</text><rect class="bar${bad ? " bad" : ""}" style="--i:${i}" x="${x1}" y="${y + 12}" width="${Math.max(x2 - x1, 3)}" height="5" rx="2.5"/>${dim}`;
    });
    return `<svg class="one-more-take-ruler" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMinYMin meet" role="img" aria-label="${esc(tr("one_more_take_ruler_label", fmt(S)))}">
      ${ticks}<line class="axis" x1="${L0}" y1="${H - 13}" x2="${R0}" y2="${H - 13}"/>${body}
      <line class="scene${clean ? " clean" : ""}" x1="${xs}" y1="${top - 4}" x2="${xs}" y2="${H - 13}"/>
      <text class="scene-label${clean ? " clean" : ""}" x="${Math.min(Math.max(xs, 44), W - 44)}" y="10" text-anchor="middle">${esc(tr("one_more_take_this_scene", fmt(S)))}</text></svg>`;
  }

  // ---------- state ----------
  let deck = null;
  let deckPromise = null;
  let game = null; // { set, i, take, sel, cleared, results, phase, film, streak, pairs, locked }
  let filmTimer = null;

  function loadDeck() {
    if (deck) return Promise.resolve(deck);
    if (!deckPromise) {
      deckPromise = fetch(DECK_URL, { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error(`deck ${r.status}`); return r.json(); })
        .then((data) => { deck = data; return data; })
        .catch((error) => { deckPromise = null; throw error; });
    }
    return deckPromise;
  }
  const setByNumber = (n) => deck?.sets.find((s) => s.number === n) || null;

  // ---------- window ----------
  function installWindow() {
    if (typeof document === "undefined" || document.querySelector('[data-window="oneMoreTake"]')) return;
    window.AISystem6ApplicationShell.createWindow({
      windowName: "oneMoreTake",
      windowClass: "one-more-take-window",
      labelledBy: "one-more-take-title",
      titleKey: "one_more_take_label",
      title: tr("one_more_take_label"),
      paneClass: "one-more-take-pane",
      paneHtml: `<div class="one-more-take-stage" data-take-stage>
        <div class="one-more-take-frame" data-take-frame>
          <svg class="one-more-take-scene" data-take-scene viewBox="0 0 960 540" preserveAspectRatio="xMidYMid meet" role="img"></svg>
          <div class="one-more-take-board" data-take-board hidden></div>
        </div>
        <section class="one-more-take-panel" data-take-panel aria-live="polite"></section>
        <section class="one-more-take-cover" data-take-cover hidden></section>
      </div>`,
    });
  }
  const root = () => document.querySelector('[data-window="oneMoreTake"]');
  const part = (name) => root()?.querySelector(`[data-take-${name}]`);

  // ---------- the cover: today's set ----------
  function renderCover() {
    stopFilm();
    game = null;
    const plan = dayPlan(new Date(), deck);
    const today = plan.setNumber ? setByNumber(plan.setNumber) : null;
    const built = deck.sets.map((s) => s.number);
    part("frame").hidden = true; part("panel").hidden = true;
    const cover = part("cover"); cover.hidden = false;
    const headline = plan.anniversary ? L(plan.anniversary.title) : tr("one_more_take_day_line", plan.round, plan.setNumber, tr(`one_more_take_mutator_${plan.mutator}`));
    const card = (set) => `<button class="btn${set === today ? " default" : ""}" type="button" data-take-start="${set.number}">${esc(tr("one_more_take_set_line", set.number, L(set.title)))}</button>`;
    cover.innerHTML = html`<p class="one-more-take-kicker">${headline}</p>
      ${html.raw(today ? html`<h2>${L(today.title)}</h2><p class="one-more-take-dare">${L(today.challenge)}</p>
        <p class="one-more-take-rules">${html.raw(tr("one_more_take_rules", today.difficulty))}</p>
        <div class="one-more-take-cover-actions">${html.raw(card(today))}</div>`
      : html`<h2>${html.raw(tr("one_more_take_not_ready"))}</h2><p class="one-more-take-dare">${html.raw(tr("one_more_take_not_ready_body"))}</p>`)}
      <p class="one-more-take-rules">${html.raw(tr("one_more_take_also_playable"))}</p>
      <div class="one-more-take-cover-actions">${html.raw(deck.sets.filter((s) => s !== today).map(card).join(""))}</div>
      <p class="one-more-take-note">${html.raw(tr("one_more_take_built_count", built.length))}</p>`;
    cover.querySelectorAll("[data-take-start]").forEach((b) => b.addEventListener("click", () => startSet(Number(b.dataset.takeStart))));
  }

  function startSet(number) {
    const set = setByNumber(number);
    if (!set) return;
    game = { set, i: 0, take: 1, sel: null, cleared: [], results: [], phase: "rolling", film: FILM_SECONDS, streak: 0, points: 0, pairs: {}, locked: {} };
    part("cover").hidden = true; part("frame").hidden = false; part("panel").hidden = false;
    renderTake();
  }

  // ---------- film: the day's clock ----------
  function startFilm() {
    stopFilm();
    filmTimer = setInterval(() => {
      if (!game || game.phase !== "rolling") return;
      game.film = Math.max(0, game.film - 0.25);
      const meter = part("panel")?.querySelector("[data-take-film]");
      if (meter) meter.textContent = tr("one_more_take_film", Math.ceil(game.film));
    }, 250);
  }
  function stopFilm() { if (filmTimer) clearInterval(filmTimer); filmTimer = null; }

  // ---------- one take ----------
  const shotNow = () => game.set.shots[game.i];

  function rollPanel(shot) {
    const head = shot.kind === "scene"
      ? `${fmtLong(ym(shot.date))} · ${L(shot.place)} · ${L(shot.tod)}`
      : L(shot.prompt);
    const note = shot.kind === "scene" ? tr(shot.onSale ? "one_more_take_rule_on_sale" : "one_more_take_rule_home") : tr("one_more_take_rule_pair");
    const actions = shot.kind === "scene"
      ? `<button class="btn one-more-take-cut" type="button" data-take-call="cut" disabled>${esc(tr("one_more_take_cut"))}</button><button class="btn" type="button" data-take-call="print">${esc(tr("one_more_take_print"))}</button>`
      : `<button class="btn one-more-take-cut" type="button" data-take-call="submit" disabled>${esc(tr("one_more_take_submit"))}</button><button class="btn" type="button" data-take-call="reset">${esc(tr("one_more_take_clear"))}</button>`;
    return `<div class="one-more-take-roll">
      <div class="one-more-take-sceneline"><b>${esc(head)}</b><span class="one-more-take-meta">${esc(tr("one_more_take_meta", game.i + 1, game.set.shots.length, game.take))} · <span data-take-film>${esc(tr("one_more_take_film", Math.ceil(game.film)))}</span></span></div>
      <p class="one-more-take-note">${esc(note)}</p>
      <p class="one-more-take-hint" data-take-hint>${esc(tr(shot.kind === "scene" ? "one_more_take_hint_scene" : "one_more_take_hint_pair"))}</p>
      <div class="one-more-take-actions">${actions}</div></div>`;
  }

  function renderTake() {
    const shot = shotNow();
    game.phase = "rolling"; game.sel = null;
    const frame = part("frame");
    frame.dataset.kind = shot.kind;
    frame.classList.remove("is-frozen");
    part("panel").innerHTML = rollPanel(shot);
    part("panel").querySelectorAll("[data-take-call]").forEach((b) => b.addEventListener("click", () => call(b.dataset.takeCall)));
    if (shot.kind === "scene") {
      part("board").hidden = true;
      part("scene").style.display = "";
      drawScene();
    } else {
      frame.style.removeProperty("--take-aspect");
      part("scene").style.display = "none";
      renderBoard(shot);
    }
    entering(frame); entering(part("panel"));
    startFilm();
  }

  // Draws the set at the frame's current shape, and again whenever that shape
  // changes (rotation, a resized window), keeping the take's state.
  let drawnCrop = "";
  function drawScene() {
    const shot = shotNow(), frame = part("frame"), pane = root().querySelector(".one-more-take-pane");
    const upright = pane && pane.clientWidth / Math.max(pane.clientHeight, 1) < 0.8;
    // The tallest frame that still holds every prop: square, then 5:4, then 4:3.
    let crop = [0, 0, 960, 540];
    if (upright) for (const aspect of [1, 5 / 4, 4 / 3]) { const c = cropFor(shot, deck.looks, aspect); if (c[2] !== 960 || c[3] !== 540) { crop = c; break; } }
    drawnCrop = crop.join(",");
    frame.style.setProperty("--take-aspect", String(crop[2] / crop[3]));
    const svg = part("scene");
    svg.setAttribute("viewBox", crop.join(" "));
    svg.setAttribute("aria-label", tr("one_more_take_scene_label"));
    svg.innerHTML = sceneMarkup(shot, deck.looks, { frameWidth: frame.clientWidth || 960, crop });
    game.cleared.forEach((i) => markCleared(i, false));
    svg.querySelectorAll("[data-take-prop]").forEach((g) => {
      const i = Number(g.dataset.takeProp);
      const act = () => { if (game.phase !== "rolling" || game.cleared.includes(i)) return; game.sel = game.sel === i ? null : i; syncSelection(); };
      // Feedback lands with the finger, not when it lifts.
      g.addEventListener("pointerdown", (e) => { if (e.button === 0) act(); });
      g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); act(); } });
    });
    syncSelection();
    if (game.phase === "reveal") {
      const wrongIndex = shot.props.findIndex((p) => p.look === shot.wrong);
      if (wrongIndex >= 0) svg.querySelector(`[data-take-ring="${wrongIndex}"]`)?.classList.add("is-on");
    }
  }
  function entering(el) {
    if (!el) return;
    el.classList.remove("one-more-take-entering"); void el.offsetWidth; el.classList.add("one-more-take-entering");
  }
  // One short tick on the ruling, two on a retake. Phones without the
  // Vibration API (iPhone's browsers) simply stay silent.
  const buzz = (pattern) => { try { navigator.vibrate?.(pattern); } catch { /* not allowed here */ } };

  function syncSelection() {
    part("scene").querySelectorAll("[data-take-ring]").forEach((r) => r.classList.toggle("is-on", Number(r.dataset.takeRing) === game.sel));
    part("scene").querySelectorAll("[data-take-prop]").forEach((g) => g.setAttribute("aria-pressed", String(Number(g.dataset.takeProp) === game.sel)));
    const cut = part("panel").querySelector('[data-take-call="cut"]');
    if (cut) cut.disabled = game.sel === null || game.phase !== "rolling";
  }

  function markCleared(i, flash = true) {
    const shot = shotNow();
    const [x, y, w] = placed(shot.props[i], shot, deck.looks).box;
    const label = tr("one_more_take_already", fmt(ym(deck.looks[shot.props[i].look].start)));
    const tw = [...label].length * 13 + 16, tx = Math.min(Math.max(x + w / 2 - tw / 2, 8), 952 - tw), ty = Math.max(y - 38, 8);
    part("scene").querySelector("[data-take-tags]")?.insertAdjacentHTML("beforeend", `<g class="one-more-take-tag"><rect x="${tx}" y="${ty}" width="${tw}" height="28" rx="4"/><text x="${tx + 8}" y="${ty + 19}">${esc(label)}</text></g>`);
    const ring = part("scene").querySelector(`[data-take-ring="${i}"]`);
    if (flash && ring) { ring.classList.add("is-wrong"); setTimeout(() => ring.classList.remove("is-wrong"), 900); }
    part("scene").querySelector(`[data-take-prop="${i}"]`)?.setAttribute("aria-disabled", "true");
  }

  // ---------- pairs ----------
  function renderBoard(shot) {
    const board = part("board");
    board.hidden = false;
    const leftItem = (item, n) => {
      const look = item.look ? deck.looks[item.look] : null;
      const face = look ? lookThumb(look) : item.swatch ? `<span class="one-more-take-swatch" style="background:#${esc(item.swatch)}" aria-hidden="true"></span>` : `<span class="one-more-take-quote">${esc(L(item.text))}</span>`;
      const label = look || item.swatch ? tr("one_more_take_item", n + 1) : L(item.text);
      return `<button type="button" class="one-more-take-left" data-take-left="${esc(item.id)}" aria-label="${esc(label)}"><span class="one-more-take-badge">${n + 1}</span>${face}</button>`;
    };
    const rightItem = (item) => `<button type="button" class="one-more-take-right" data-take-right="${esc(item.id)}"><span class="one-more-take-badge" data-take-badge></span><span>${esc(L(item.text))}</span></button>`;
    board.innerHTML = html`<div class="one-more-take-col">${html.raw(shot.left.map(leftItem).join(""))}</div><div class="one-more-take-col">${html.raw(shot.right.map(rightItem).join(""))}</div>`;
    board.querySelectorAll("[data-take-left]").forEach((b) => b.addEventListener("pointerdown", () => {
      if (game.phase !== "rolling" || game.locked[b.dataset.takeLeft]) return;
      game.sel = game.sel === b.dataset.takeLeft ? null : b.dataset.takeLeft; syncBoard();
    }));
    board.querySelectorAll("[data-take-right]").forEach((b) => b.addEventListener("pointerdown", () => {
      if (game.phase !== "rolling") return;
      const right = b.dataset.takeRight;
      const owner = Object.keys(game.pairs).find((l) => game.pairs[l] === right);
      if (owner && game.locked[owner]) return;
      if (game.sel === null) { if (owner) delete game.pairs[owner]; syncBoard(); return; }
      if (owner) delete game.pairs[owner];
      game.pairs[game.sel] = right; game.sel = null; syncBoard();
      entering(b.querySelector("[data-take-badge]"));
    }));
    syncBoard();
  }
  function syncBoard() {
    const shot = shotNow(); const board = part("board");
    const order = shot.left.map((l) => l.id);
    board.querySelectorAll("[data-take-left]").forEach((b) => {
      const id = b.dataset.takeLeft;
      b.classList.toggle("is-selected", game.sel === id);
      b.classList.toggle("is-paired", Boolean(game.pairs[id]));
      b.classList.toggle("is-locked", Boolean(game.locked[id]));
    });
    board.querySelectorAll("[data-take-right]").forEach((b) => {
      const owner = Object.keys(game.pairs).find((l) => game.pairs[l] === b.dataset.takeRight);
      b.querySelector("[data-take-badge]").textContent = owner ? String(order.indexOf(owner) + 1) : "";
      b.classList.toggle("is-paired", Boolean(owner));
      b.classList.toggle("is-locked", Boolean(owner && game.locked[owner]));
    });
    const submit = part("panel").querySelector('[data-take-call="submit"]');
    if (submit) submit.disabled = order.some((id) => !game.pairs[id]) || game.phase !== "rolling";
  }

  // ---------- judging ----------
  function hint(text, warn) {
    const el = part("panel").querySelector("[data-take-hint]");
    if (el) { el.textContent = text; el.classList.toggle("is-warn", Boolean(warn)); }
  }
  function miss(message) {
    buzz([12, 60, 12]);
    game.film = Math.max(0, game.film - WRONG_FILM_COST);
    if (game.take >= MAX_TAKES) return reveal(true);
    game.take += 1;
    const meta = part("panel").querySelector(".one-more-take-meta");
    if (meta) meta.innerHTML = html`${html.raw(tr("one_more_take_meta", game.i + 1, game.set.shots.length, game.take))} · <span data-take-film>${html.raw(tr("one_more_take_film", Math.ceil(game.film)))}</span>`;
    hint(`${tr("one_more_take_again")} ${message}`, true);
  }
  function call(kind) {
    if (!game || game.phase !== "rolling") return;
    const shot = shotNow();
    if (kind === "reset") { Object.keys(game.pairs).forEach((l) => { if (!game.locked[l]) delete game.pairs[l]; }); game.sel = null; syncBoard(); return; }
    if (kind === "submit") {
      const wrong = shot.left.filter((l) => game.pairs[l.id] !== shot.answer[l.id]);
      if (!wrong.length) return reveal(false);
      shot.left.forEach((l) => { if (game.pairs[l.id] === shot.answer[l.id]) game.locked[l.id] = true; else delete game.pairs[l.id]; });
      syncBoard();
      return miss(tr("one_more_take_pairs_right", shot.left.length - wrong.length, shot.left.length));
    }
    const wrongIndex = shot.props.findIndex((p) => p.look === shot.wrong);
    const right = kind === "cut" ? wrongIndex >= 0 && game.sel === wrongIndex : wrongIndex < 0;
    if (right) return reveal(false);
    if (kind === "cut") {
      const i = game.sel; game.cleared.push(i); game.sel = null; markCleared(i); syncSelection();
      return miss(tr("one_more_take_not_this", fmtLong(ym(deck.looks[shot.props[i].look].start))));
    }
    return miss(tr("one_more_take_found_one"));
  }

  function shotPoints(take, saved) {
    if (saved) return 0;
    return [0, 100, 60, 30][take] || 0;
  }
  function reveal(saved) {
    game.phase = "reveal";
    if (!saved) buzz(14);
    const oneTake = !saved && game.take === 1;
    game.streak = oneTake ? game.streak + 1 : 0;
    const multiplier = game.streak >= 5 ? 3 : game.streak >= 3 ? 2 : 1;
    game.points += shotPoints(game.take, saved) * multiplier;
    game.results[game.i] = { take: game.take, saved, multiplier };
    showRuling();
  }
  // The ruling panel only draws; scoring happened once in reveal(), so a
  // language switch can redraw it without counting the take twice.
  function showRuling() {
    const shot = shotNow();
    const { take, saved, multiplier } = game.results[game.i];
    const oneTake = !saved && take === 1;
    part("frame").classList.add("is-frozen");
    const title = saved ? tr("one_more_take_saved") : oneTake ? tr("one_more_take_one_take") : tr("one_more_take_nth_take", take);
    const kindKey = shot.kind === "pair" ? "one_more_take_kind_pair" : `one_more_take_kind_${shot.verdict}`;
    const panel = part("panel");
    panel.innerHTML = html`<div class="one-more-take-ruling">
      <div class="one-more-take-head"><p class="one-more-take-verdict"><span>${title}</span>${html.raw(multiplier > 1 ? html`<span class="one-more-take-streak">×${multiplier}</span>` : "")}<span class="one-more-take-kind${shot.verdict === "clean" ? " is-clean" : ""}">${html.raw(tr(kindKey))}</span></p>
        <button class="btn one-more-take-next" type="button" data-take-next>${html.raw(tr(game.i === game.set.shots.length - 1 ? "one_more_take_wrap" : "one_more_take_next"))}</button></div>
      <p class="one-more-take-caption">${L(shot.caption)}</p>
      <div class="one-more-take-ruler-slot" data-take-ruler></div></div>`;
    panel.querySelector("[data-take-next]").addEventListener("click", next);
    entering(panel);
    if (shot.kind === "scene") {
      const wrongIndex = shot.props.findIndex((p) => p.look === shot.wrong);
      if (wrongIndex >= 0) part("scene").querySelector(`[data-take-ring="${wrongIndex}"]`)?.classList.add("is-on");
      const slot = panel.querySelector("[data-take-ruler]");
      slot.innerHTML = rulerMarkup(shot, deck.looks, slot.clientWidth || panel.clientWidth);
    } else {
      game.pairs = { ...shot.answer };
      shot.left.forEach((l) => { game.locked[l.id] = true; });
      syncBoard();
    }
    panel.querySelector("[data-take-next]").focus({ preventScroll: true });
  }

  function next() {
    if (game.i >= game.set.shots.length - 1) return wrapUp();
    game = { ...game, i: game.i + 1, take: 1, sel: null, cleared: [], pairs: {}, locked: {} };
    renderTake();
  }

  // ---------- the end of the day ----------
  function tierFor(set, ones) { return (set.tiers || []).find((tier) => ones >= tier.min) || null; }
  function shareText(set, results, film, points) {
    const marks = results.map((r) => (r.saved ? "×" : r.take === 1 ? "■" : String(r.take))).join("");
    return tr("one_more_take_share", set.number, L(set.title), marks, Math.ceil(film), points);
  }
  function wrapUp() {
    stopFilm();
    const set = game.set;
    const ones = game.results.filter((r) => !r.saved && r.take === 1).length;
    const filmBonus = Math.ceil(game.film) * 10;
    const total = game.points + filmBonus;
    const tier = tierFor(set, ones);
    const store = readStore();
    const best = store.sets?.[set.id]?.best || 0;
    writeStore({ ...store, sets: { ...(store.sets || {}), [set.id]: { best: Math.max(best, total), plays: (store.sets?.[set.id]?.plays || 0) + 1, last: todayKey() } } });
    part("frame").hidden = true; part("panel").hidden = true;
    const cover = part("cover"); cover.hidden = false;
    const strip = set.shots.map((shot, i) => {
      const r = game.results[i];
      const mark = r.saved ? tr("one_more_take_saved_short") : r.take === 1 ? tr("one_more_take_one_take") : tr("one_more_take_takes", r.take);
      const face = shot.kind === "scene" ? `<svg viewBox="0 0 960 540" aria-hidden="true">${sceneMarkup(shot, deck.looks, { interactive: false })}</svg>` : `<div class="one-more-take-strip-pair">${esc(L(shot.prompt))}</div>`;
      return `<figure>${face}<figcaption><span>${i + 1}</span><span class="${r.saved ? "is-saved" : r.take === 1 ? "is-one" : ""}">${esc(mark)}</span></figcaption></figure>`;
    }).join("");
    const credits = set.credits ? `<p class="one-more-take-credits" data-take-credits></p>` : "";
    cover.innerHTML = html`<p class="one-more-take-kicker">${html.raw(tr("one_more_take_wrapped", set.number, L(set.title)))}</p>
      <h2>${tier ? L(tier) : ""}</h2>
      <p class="one-more-take-score"><b>${total}</b> ${html.raw(tr("one_more_take_points_line", ones, set.shots.length, Math.ceil(game.film)))}</p>
      <div class="one-more-take-strip">${html.raw(strip)}</div>${html.raw(credits)}
      <div class="one-more-take-cover-actions">
        <button class="btn default" type="button" data-take-copy>${html.raw(tr("one_more_take_copy_share"))}</button>
        <button class="btn" type="button" data-take-home>${html.raw(tr("one_more_take_back_to_today"))}</button>
        <button class="btn" type="button" data-take-tune>${html.raw(tr("one_more_take_to_tune"))}</button>
      </div><p class="one-more-take-note" data-take-copied></p>${html.raw(store.askedFirstDevice ? "" : html`
      <div class="one-more-take-first" data-take-first><p class="one-more-take-dare">${html.raw(tr("one_more_take_first_device_q"))}</p>
        <div class="one-more-take-chips">${html.raw(FIRST_DEVICES.map((d) => html`<button class="btn" type="button" data-take-device="${d}">${d}</button>`))}<button class="btn" type="button" data-take-device="">${html.raw(tr("one_more_take_first_device_skip"))}</button></div></div>`)}`;
    const text = shareText(set, game.results, game.film, total);
    cover.querySelector("[data-take-copy]").addEventListener("click", () => {
      const done = (ok) => { cover.querySelector("[data-take-copied]").textContent = ok ? tr("one_more_take_copied") : text; };
      navigator.clipboard?.writeText(text).then(() => done(true), () => done(false)) ?? done(false);
    });
    cover.querySelector("[data-take-home]").addEventListener("click", renderCover);
    cover.querySelectorAll("[data-take-device]").forEach((b) => b.addEventListener("click", async () => {
      const device = b.dataset.takeDevice;
      const saved = device ? await updateLink({ firstDevice: device }) : false;
      if (!device || saved) writeStore({ ...readStore(), askedFirstDevice: true });
      const block = cover.querySelector("[data-take-first]");
      if (block) block.innerHTML = html`<p class="one-more-take-note">${device ? html.raw(tr(saved ? "one_more_take_first_device_saved" : "one_more_take_first_device_unsaved", device)) : html.raw(tr("one_more_take_first_device_skipped"))}</p>`;
    }));
    cover.querySelector("[data-take-tune]").addEventListener("click", () => { if (typeof handleAction === "function") handleAction("open-one-more-tune"); });
    game.phase = "wrap";
    if (set.credits) fillCredits(cover.querySelector("[data-take-credits]"), set.credits);
  }

  // The end-credits song comes from One More Tune's own deck and obeys its
  // gate: it plays only when that deck has cleared the card and pinned a store
  // preview. Until then the line names the song and points across.
  async function fillCredits(line, cardId) {
    if (!line) return;
    let card = null;
    try {
      const omt = await fetch("/data/one-more-tune-deck.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null));
      card = omt?.cards?.find((c) => c.id === cardId) || null;
    } catch { card = null; }
    if (!card?.song) { line.remove(); return; }
    const name = tr("one_more_take_credits_song", card.song, card.artist || "", card.product || "", card.year || "");
    const playable = card.enabled === true && card.questionSound?.provider === "preview" && /^https:\/\//.test(card.questionSound.url || "");
    line.innerHTML = playable
      ? `${esc(name)} <button class="btn" type="button" data-take-credits-play>${esc(tr("one_more_take_credits_play"))}</button>`
      : `${esc(name)} ${esc(tr("one_more_take_credits_waiting"))}`;
    line.querySelector("[data-take-credits-play]")?.addEventListener("click", (event) => {
      const audio = new Audio(card.questionSound.url);
      audio.play().catch(() => { event.target.textContent = tr("one_more_take_credits_failed"); });
      event.target.disabled = true;
    });
  }

  // ---------- lifecycle ----------
  async function attach() {
    installWindow();
    const cover = part("cover");
    try { await loadDeck(); } catch {
      if (cover) { part("frame").hidden = true; part("panel").hidden = true; cover.hidden = false; cover.innerHTML = html`<p class="one-more-take-dare">${html.raw(tr("one_more_take_deck_failed"))}</p>`; }
      return;
    }
    if (!game || game.phase === "wrap") renderCover();
  }
  function render() {
    if (!root() || !deck) return;
    if (!game || game.phase === "wrap") renderCover(); else if (game.phase === "rolling") renderTake(); else showRuling();
  }

  installWindow();
  if (typeof ResizeObserver === "function" && root()) {
    let lastWidth = 0;
    new ResizeObserver(() => {
      const pane = root()?.querySelector(".one-more-take-pane");
      if (!pane || !game || game.phase === "wrap" || shotNow()?.kind !== "scene") return;
      if (Math.abs(pane.clientWidth - lastWidth) < 8) return;
      lastWidth = pane.clientWidth;
      drawScene();
    }).observe(root().querySelector(".one-more-take-pane"));
  }
  window.AISystem6ApplicationRegistry?.registerApplicationLifecycle?.("oneMoreTake", {
    onSuspend: () => stopFilm(),
    onResume: () => { if (game?.phase === "rolling") startFilm(); },
    onDispose: () => { stopFilm(); game = null; },
  });
  window.renderOneMoreTake = render;
  window.AISystem6OneMoreTake = Object.freeze({
    attach,
    loadDeck,
    // Pure helpers, exposed for the contract.
    rules: Object.freeze({ ym, takeIsFair, goofs, dayPlan, anniversaryOn, shareText, sceneMarkup, cropFor, placed }),
  });
  window.AISystem6Runtime?.registerApplication({ id: "oneMoreTake", windowName: "oneMoreTake", mount: attach, restore: attach, commands: { "open-one-more-take": { handler: () => openWindow("oneMoreTake"), isAvailable: () => true } } });
})();
