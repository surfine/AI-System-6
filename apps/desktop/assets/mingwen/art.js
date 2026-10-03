(function (root) {
  'use strict';
  var PA = '#F2E8D5', PAH = '#FAF4E8', PAD = '#E4D5B7', LA = '#1F3A6B', CI = '#C23B22', GO = '#C9A24A', IN = '#1B1A1F', MI = '#9AA3AE';
  var IW = '#4A4E5A', IW2 = '#7D828C', GOH = '#E8C877', GOD = '#8E6E2A';
  var WW = '#FFF7E6', AM = '#F4C77A', G_ROSE = '#B8475A', G_COB = '#2D4E9E', G_EME = '#2E7D62', FMN = '#7C83C8';
  var MEA = '#8FAE6B', MEAS = '#5E7A4A', PEACH = '#F0B9A0', DROSE = '#C77E8A', MAGIC = '#D8F0F4', SEA = '#3E6E8C', SEAD = '#1F4058';
  var NIGHT = '#141B33', STAR = '#F3EEDC', FCORE = '#FFE3A3', FIRE = '#E8792B', EMBER = '#9E2B1C', FROST = '#C9D8E6';
  var MOON = '#EEF0F5', MHALO = '#CBD3E6', VELVET = '#1A2440', LACE = '#FBF8F2', SKYF = '#A9C9DD';
  var STEEL2 = '#4A505A', OXIDE = '#8C4A2F';
  var STM = '#C8407A', STC = '#35B2C8', STA = '#F2A33A', HAZE = '#2B2440', WOLF = '#E8EEF2', WOLFI = '#0F1014';
  var WOOD = '#7A5634', WOODD = '#5A4636', WOODK = '#3B2E26', TIMBER = '#6E5640', SKIN = '#F0E2CB', SKIN2 = '#E2CDAE', BRONZE = '#5E6B5A';
  var GLASS = [G_COB, G_ROSE, GOH, G_EME, FMN, WW];

  function rnd(seed) {
    var t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5; var r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  function n(v) { return Math.round(v * 10) / 10; }
  function rect(x, y, w, h, fill, extra) { return '<rect x="' + n(x) + '" y="' + n(y) + '" width="' + n(w) + '" height="' + n(h) + '" fill="' + fill + '"' + (extra || '') + '/>'; }
  function circ(x, y, r, fill, extra) { return '<circle cx="' + n(x) + '" cy="' + n(y) + '" r="' + n(r) + '" fill="' + fill + '"' + (extra || '') + '/>'; }
  function ell(x, y, rx, ry, fill, extra) { return '<ellipse cx="' + n(x) + '" cy="' + n(y) + '" rx="' + n(rx) + '" ry="' + n(ry) + '" fill="' + fill + '"' + (extra || '') + '/>'; }
  function path(d, fill, extra) { return '<path d="' + d + '" fill="' + fill + '"' + (extra || '') + '/>'; }
  function stroke(d, col, w, extra) { return '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="' + (w || 3) + '" stroke-linecap="round" stroke-linejoin="round"' + (extra || '') + '/>'; }
  function line(x1, y1, x2, y2, col, w, extra) { return '<line x1="' + n(x1) + '" y1="' + n(y1) + '" x2="' + n(x2) + '" y2="' + n(y2) + '" stroke="' + col + '" stroke-width="' + (w || 3) + '" stroke-linecap="round"' + (extra || '') + '/>'; }
  function poly(pts, fill, extra) { return '<polygon points="' + pts.map(function (p) { return n(p[0]) + ',' + n(p[1]); }).join(' ') + '" fill="' + fill + '"' + (extra || '') + '/>'; }
  function g(content, extra) { return '<g' + (extra || '') + '>' + content + '</g>'; }
  function op(o) { return ' opacity="' + o + '"'; }
  function ol(col, w) { return ' stroke="' + (col || IN) + '" stroke-width="' + (w || 3) + '" stroke-linejoin="round"'; }
  function cls(c) { return ' class="' + c + '"'; }
  var SERIF = "'Songti SC','Noto Serif CJK SC','Source Han Serif SC','Noto Serif SC','STSong',serif";
  var KAI = "'Kaiti SC','STKaiti','KaiTi','BiauKai','Songti SC',serif";
  function txt(x, y, s, size, fill, extra, font) {
    return '<text x="' + x + '" y="' + y + '" font-size="' + size + '" fill="' + fill + '" font-family="' + (font || SERIF) + '" font-weight="900" text-anchor="middle"' + (extra || '') + '>' + s + '</text>';
  }
  function kai(x, y, s, size, fill, extra) { return txt(x, y, s, size, fill, (extra || '') + ' style="font-weight:400"', KAI); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  var uid = 0;
  function nid(p) { uid += 1; return 'pt' + p + uid; }
  function dots(list) {
    return list.map(function (p) { var r = p[2]; return 'M' + n(p[0] - r) + ' ' + n(p[1]) + 'a' + n(r) + ' ' + n(r) + ' 0 1 0 ' + n(2 * r) + ' 0a' + n(r) + ' ' + n(r) + ' 0 1 0 ' + n(-2 * r) + ' 0'; }).join('');
  }
  function rects(list) { return list.map(function (r) { return 'M' + n(r[0]) + ' ' + n(r[1]) + 'h' + n(r[2]) + 'v' + n(r[3]) + 'h' + n(-r[2]) + 'Z'; }).join(''); }
  function lgrad(id, x1, y1, x2, y2, stops) {
    return '<linearGradient id="' + id + '" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '">' + stops.map(function (s) {
      return '<stop offset="' + s[0] + '" style="stop-color:' + s[1] + ';stop-opacity:' + (s[2] == null ? 1 : s[2]) + '"/>';
    }).join('') + '</linearGradient>';
  }
  function svgRoot(content, v, local, vb, klass) {
    return '<svg class="' + (klass || 'bg-svg') + ' v-' + (v || 'default') + '" viewBox="' + (vb || '0 0 1600 900') + '" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      (local ? '<defs>' + local + '</defs>' : '') + content + '</svg>';
  }

  function defs() {
    return '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>' +
      '<filter id="hairTex" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="1.1 .018" numOctaves="2" seed="4" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -3 1.55" result="m"/><feComposite in="m" in2="SourceAlpha" operator="in" result="st"/><feFlood flood-color="#120A10" flood-opacity=".42"/><feComposite in2="st" operator="in" result="dk"/>' +
      '<feTurbulence type="fractalNoise" baseFrequency="1.4 .03" numOctaves="1" seed="8" result="n2"/><feColorMatrix in="n2" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -4 1.25" result="m2"/><feComposite in="m2" in2="SourceAlpha" operator="in" result="st2"/><feFlood flood-color="#FFF4E6" flood-opacity=".22"/><feComposite in2="st2" operator="in" result="lt"/><feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="dk"/><feMergeNode in="lt"/></feMerge></filter>' +
      '<filter id="clothTex" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".012 .05" numOctaves="3" seed="12" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2 1.1" result="m"/><feComposite in="m" in2="SourceAlpha" operator="in" result="f"/><feFlood flood-color="#140C14" flood-opacity=".22"/><feComposite in2="f" operator="in" result="dk"/><feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="dk"/></feMerge></filter>' +
      '<filter id="ptLight" x="-10%" y="-5%" width="120%" height="110%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceAlpha" stdDeviation="9" result="b"/>' +
      '<feDiffuseLighting in="b" surfaceScale="5" diffuseConstant="1.18" lighting-color="#FFF8F0" result="d"><feDistantLight azimuth="225" elevation="58"/></feDiffuseLighting>' +
      '<feComposite in="d" in2="SourceAlpha" operator="in" result="dl"/><feBlend in="SourceGraphic" in2="dl" mode="multiply" result="m"/>' +
      '<feSpecularLighting in="b" surfaceScale="5" specularConstant=".75" specularExponent="16" lighting-color="#FFE2BE" result="s"><feDistantLight azimuth="20" elevation="18"/></feSpecularLighting>' +
      '<feComposite in="s" in2="SourceAlpha" operator="in" result="sr"/><feBlend in="m" in2="sr" mode="screen"/></filter>' +
      '<filter id="paintFx" x="-2%" y="-2%" width="104%" height="104%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".022" numOctaves="3" seed="5" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="5" result="d"/><feGaussianBlur in="d" stdDeviation=".9"/></filter>' +
      '<linearGradient id="paintLight" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF6E0" stop-opacity=".55"/><stop offset=".55" stop-color="#FFFFFF" stop-opacity="0"/><stop offset="1" stop-color="#1A2030" stop-opacity=".45"/></linearGradient>' +
      '<filter id="paintGrain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".75 .3" numOctaves="2" seed="9"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 .97  0 0 0 0 .92  0 0 0 -.9 1.05"/></filter>' +
      '<filter id="inkEdge" x="-5%" y="-10%" width="110%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".012 .05" numOctaves="2" seed="11"/><feDisplacementMap in="SourceGraphic" scale="14"/><feGaussianBlur stdDeviation="1.4"/></filter>' +
      '<filter id="ptWobS" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves="2" seed="3"/><feDisplacementMap in="SourceGraphic" scale="2.4"/></filter>' +
      '<filter id="ptSoftS" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>' +
      '<filter id="pix8" x="0" y="0" width="100%" height="100%"><feFlood x="3" y="3" width="2" height="2"/><feComposite width="8" height="8"/><feTile result="grid"/><feComposite in="SourceGraphic" in2="grid" operator="in"/><feMorphology operator="dilate" radius="4"/></filter>' +
      '<filter id="quant"><feComponentTransfer><feFuncR type="discrete" tableValues="0 .33 .66 1"/><feFuncG type="discrete" tableValues="0 .33 .66 1"/><feFuncB type="discrete" tableValues="0 .33 .66 1"/></feComponentTransfer></filter>' +
      '<filter id="boil" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence id="boilT" type="fractalNoise" baseFrequency=".02" numOctaves="1" seed="1"/><feDisplacementMap in="SourceGraphic" scale="6"/></filter>' +
      '<filter id="melt" x="-5%" y="-5%" width="110%" height="130%"><feTurbulence type="fractalNoise" baseFrequency=".01 .08" numOctaves="1" seed="4"/><feDisplacementMap in="SourceGraphic" scale="28" yChannelSelector="R"/></filter>' +
      '<radialGradient id="fireGlow"><stop offset="0" stop-color="' + FCORE + '" stop-opacity=".9"/><stop offset=".35" stop-color="' + FIRE + '" stop-opacity=".45"/><stop offset="1" stop-color="' + EMBER + '" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="amberGlow"><stop offset="0" stop-color="' + AM + '" stop-opacity=".85"/><stop offset=".4" stop-color="' + AM + '" stop-opacity=".35"/><stop offset="1" stop-color="' + AM + '" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="whiteGlow"><stop offset="0" stop-color="' + WW + '" stop-opacity=".8"/><stop offset="1" stop-color="' + WW + '" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="moonHalo"><stop offset=".45" stop-color="' + MHALO + '" stop-opacity=".55"/><stop offset="1" stop-color="' + MHALO + '" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="magicGlow"><stop offset="0" stop-color="' + MAGIC + '" stop-opacity=".9"/><stop offset="1" stop-color="' + MAGIC + '" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="towerGlow"><stop offset="0" stop-color="#F4F8FF" stop-opacity=".85"/><stop offset=".3" stop-color="#C9D9F2" stop-opacity=".35"/><stop offset="1" stop-color="#C9D9F2" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="towerFlash"><stop offset="0" stop-color="#FFFFFF" stop-opacity="1"/><stop offset=".25" stop-color="#E4EEFF" stop-opacity=".6"/><stop offset="1" stop-color="#E4EEFF" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="frostGlow"><stop offset="0" stop-color="' + WOLF + '" stop-opacity=".55"/><stop offset="1" stop-color="' + FROST + '" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="glassSheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
      '<linearGradient id="beamW" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + WW + '" stop-opacity=".45"/><stop offset="1" stop-color="' + WW + '" stop-opacity="0"/></linearGradient>' +
      '<linearGradient id="bladeG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9FB0BF"/><stop offset=".5" stop-color="' + WOLF + '"/><stop offset="1" stop-color="#6E7F8F"/></linearGradient>' +
      '<pattern id="hexP" width="52" height="90" patternUnits="userSpaceOnUse"><path d="M26 0 L52 15 L52 45 L26 60 L0 45 L0 15 Z M26 60 L26 90 M0 45 L0 75 M52 45 L52 75" fill="none" stroke="' + WOLF + '" stroke-width="1.6"/></pattern>' +
      '<pattern id="hexEdgeP" width="26" height="45" patternUnits="userSpaceOnUse"><path d="M13 0 L26 7.5 L26 22.5 L13 30 L0 22.5 L0 7.5 Z M13 30 L13 45 M0 22.5 L0 37.5 M26 22.5 L26 37.5" fill="none" stroke="#7F9DB8" stroke-width="1.3"/><path d="M13 1.6 L24.4 8.2" stroke="' + WW + '" stroke-width="1"/></pattern>' +
      '<pattern id="laceP" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="5" fill="none" stroke="' + LACE + '" stroke-width="1.2"/><circle cx="0" cy="0" r="2" fill="' + LACE + '"/><circle cx="24" cy="24" r="2" fill="' + LACE + '"/></pattern>' +
      '<pattern id="stoneP" width="64" height="34" patternUnits="userSpaceOnUse"><rect x="2" y="2" width="58" height="28" rx="7" fill="#CDBFA5" stroke="#B8A88A" stroke-width="2"/></pattern>' +
      '<pattern id="slabP" width="80" height="40" patternUnits="userSpaceOnUse"><rect x="2" y="2" width="76" height="36" rx="4" fill="' + STEEL2 + '" stroke="#3C424B" stroke-width="2"/></pattern>' +
      '<pattern id="stripeR" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="20" height="40" fill="' + CI + '"/><rect x="20" width="20" height="40" fill="' + PAH + '"/></pattern>' +
      '<pattern id="stripeB" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="20" height="40" fill="' + LA + '"/><rect x="20" width="20" height="40" fill="' + PAH + '"/></pattern>' +
      '</defs></svg>';
  }
  var tileCache = null;
  function paperTile() {
    if (tileCache != null) return tileCache;
    try {
      var c = document.createElement('canvas'); c.width = c.height = 256;
      var x = c.getContext('2d'), d = x.createImageData(256, 256), r = rnd(7);
      for (var i = 0; i < d.data.length; i += 4) { var v = 200 + r() * 55 | 0; d.data[i] = v; d.data[i + 1] = v - 6; d.data[i + 2] = v - 18; d.data[i + 3] = r() < 0.5 ? 18 : 0; }
      x.putImageData(d, 0, 0); tileCache = c.toDataURL();
    } catch (e) { tileCache = ''; }
    return tileCache;
  }

  function skyDefs(id) { return lgrad(id, 0, 0, 0, 1, [[0, 'var(--sky-top,#BFD8E6)'], [1, 'var(--sky-bot,#EAF0E8)']]); }
  function inkHills(y, seed, layers, col) { // 3.3 水墨远景：越远越淡
    var r = rnd(seed), s = '', ops = [0.18, 0.28, 0.4];
    for (var k = 0; k < (layers || 2); k++) {
      var d = 'M-40 ' + (y + 80), x = -40, yy = y + k * 22;
      while (x < 1680) { var w = 140 + r() * 220; d += ' Q' + n(x + w / 2) + ' ' + n(yy - 30 - r() * 110) + ' ' + n(x + w) + ' ' + n(yy + r() * 26); x += w; }
      d += ' L1680 ' + (yy + 160) + ' L-40 ' + (yy + 160) + ' Z';
      s += path(d, col || IW2, op(ops[k]));
    }
    return g(s, ' filter="url(#inkEdge)"');
  }
  function fogBand(y, h, o, c) { return rect(-80, y, 1760, h, c || PA, op(o) + cls('fx-drift')); }
  function gull(x, y, s, extra) { s = s || 1; return stroke('M' + n(x - 18 * s) + ' ' + n(y) + ' q' + n(9 * s) + ' ' + n(-10 * s) + ' ' + n(18 * s) + ' 0 q' + n(9 * s) + ' ' + n(-10 * s) + ' ' + n(18 * s) + ' 0', IN, 2.6 * s, extra); }
  function star4(x, y, r, fill, extra) { return path('M' + n(x) + ' ' + n(y - r) + 'L' + n(x + r * 0.22) + ' ' + n(y - r * 0.22) + 'L' + n(x + r) + ' ' + n(y) + 'L' + n(x + r * 0.22) + ' ' + n(y + r * 0.22) + 'L' + n(x) + ' ' + n(y + r) + 'L' + n(x - r * 0.22) + ' ' + n(y + r * 0.22) + 'L' + n(x - r) + ' ' + n(y) + 'L' + n(x - r * 0.22) + ' ' + n(y - r * 0.22) + 'Z', fill, extra); }
  function catenary(x1, y1, x2, y2, sag) { return 'M' + x1 + ' ' + y1 + ' Q' + n((x1 + x2) / 2) + ' ' + n(Math.max(y1, y2) + sag) + ' ' + x2 + ' ' + y2; }
  function onCat(x1, y1, x2, y2, sag, t) { var mx = (x1 + x2) / 2, my = Math.max(y1, y2) + sag; return [(1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * mx + t * t * x2, (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * my + t * t * y2]; }
  function bunting(x1, y1, x2, y2, sag, cnt, size, seed) { // 万国旗：朱砂、青金、泥金、草绿、彩窗玫瑰、纸色
    var cols = [CI, LA, GO, MEA, G_ROSE, PAH], r = rnd(seed || 3), s = stroke(catenary(x1, y1, x2, y2, sag), IN, 2, op(0.8)), fl = '';
    for (var i = 1; i < cnt; i++) {
      var p = onCat(x1, y1, x2, y2, sag, i / cnt), w = 26 * (size || 1), h = 38 * (size || 1);
      fl += '<g transform="translate(' + n(p[0]) + ' ' + n(p[1]) + ') rotate(' + n((r() - 0.5) * 10) + ')"><g class="fx-sway" style="animation-delay:-' + n(r() * 5) + 's">' + path('M' + n(-w / 2) + ' 0L' + n(w / 2) + ' 0L0 ' + n(h) + 'Z', cols[i % 6], ol(IN, 1.4)) + '</g></g>';
    }
    return s + fl;
  }
  function cablePole(x, y, h, s) {
    s = s || 1;
    var t = y - h, b = rect(x - 7 * s, t, 14 * s, h, WOODK), ins = [];
    [0, 30].forEach(function (dy) {
      b += rect(x - 46 * s, t + 18 * s + dy * s, 92 * s, 7 * s, WOODK);
      [-38, -6, 30].forEach(function (dx) { ins.push([x + dx * s + 4 * s, t + 14 * s + dy * s, 5 * s]); });
    });
    return b + path(dots(ins), GOD);
  }
  function cable(x1, y1, x2, y2, sag, lamps, lit) {
    var s = stroke(catenary(x1, y1, x2, y2, sag), IN, 2.5, op(0.85));
    for (var i = 1; i <= (lamps || 0); i++) {
      var p = onCat(x1, y1, x2, y2, sag, i / (lamps + 1));
      s += line(p[0], p[1], p[0], p[1] + 14, IN, 1.4) + rect(p[0] - 6, p[1] + 14, 12, 16, lit ? AM : '#D9D2C3', ol(IN, 1.4)) + (lit ? circ(p[0], p[1] + 22, 34, 'url(#amberGlow)') : '');
    }
    return s;
  }
  function shipSil(x, y, s, col, extra) {
    s = s || 1; col = col || IN;
    return '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ')"' + (extra || '') + '>' +
      path('M-70 0L70 0L52 22L-56 22Z', col) + line(-10, 0, -10, -120, col, 4) +
      path('M-10 -112Q24 -80 -6 -40L-10 -40Z', col, op(0.85)) + path('M-12 -110Q-50 -76 -14 -36Z', col, op(0.7)) + '</g>';
  }
  function sailTri(x, y, s, col) { return path('M' + x + ' ' + y + 'l' + n(-26 * s) + ' 0l' + n(26 * s) + ' ' + n(-56 * s) + 'Z M' + n(x - 34 * s) + ' ' + n(y + 2) + 'h' + n(50 * s) + 'l-6 6h' + n(-40 * s) + 'Z', col); }
  function landship(x, y, s, col) { // 地平线上的陆行舰：低矮长船体 + 三层阶梯上层建筑 + 一座细塔
    s = s || 1; col = col || IW2;
    var b = '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ')">';
    b += path('M0 0L20 -20L400 -20L420 0L404 14L16 14Z', col) + rect(70, -44, 210, 24, col) + rect(110, -64, 130, 20, col) + rect(150, -82, 60, 18, col) + rect(176, -128, 8, 46, col) + line(180, -128, 180, -146, col, 2);
    b += path(dots([[30, 16, 8], [70, 16, 8], [110, 16, 8], [150, 16, 8], [190, 16, 8], [230, 16, 8], [270, 16, 8], [310, 16, 8], [350, 16, 8], [390, 16, 8]]), col);
    return b + '</g>';
  }
  function lancetWin(x, y, w, h, seed) { // 尖拱彩窗（3.4）：菱形网格
    var r = rnd(seed), id = nid('lw'), cx = x + w / 2, ys = y + w * 0.87, yb = y + h;
    var d = 'M' + n(x) + ' ' + n(yb) + 'L' + n(x) + ' ' + n(ys) + 'A' + n(w) + ' ' + n(w) + ' 0 0 1 ' + n(cx) + ' ' + n(y) + 'A' + n(w) + ' ' + n(w) + ' 0 0 1 ' + n(x + w) + ' ' + n(ys) + 'L' + n(x + w) + ' ' + n(yb) + 'Z';
    var by = {}, cols = 3, rows = Math.round(h / (w / 3 * 1.3)), cw = w / cols, chh = h / rows;
    GLASS.forEach(function (c) { by[c] = []; });
    for (var i = -1; i <= rows; i++) for (var j = 0; j <= cols; j++) {
      var px = x + j * cw + (i % 2 ? cw / 2 : 0), py = y + i * chh;
      by[GLASS[Math.floor(r() * GLASS.length)]].push('M' + n(px) + ' ' + n(py - chh / 2) + 'L' + n(px + cw / 2) + ' ' + n(py) + 'L' + n(px) + ' ' + n(py + chh / 2) + 'L' + n(px - cw / 2) + ' ' + n(py) + 'Z');
    }
    var panes = '';
    GLASS.forEach(function (c) { if (by[c].length) panes += path(by[c].join(''), c, ol(IN, 2.6)); });
    return '<clipPath id="' + id + '"><path d="' + d + '"/></clipPath>' + path(d, PAD, ' stroke="#D4CBB8" stroke-width="18"') +
      g(panes + rect(x, y, w, h, 'url(#glassSheen)'), ' clip-path="url(#' + id + ')"') + path(d, 'none', ol(IN, 4));
  }
  function rose(cx, cy, R, seed) { // 圆花窗（3.4）：三圈、相邻不同色、铅条、玻璃反光；中心是原创徽记
    var r = rnd(seed), by = {}, s = '', rings = 3, petals = 12, last = '';
    GLASS.forEach(function (c) { by[c] = []; });
    for (var k = 0; k < rings; k++) {
      var r0 = R * (k + 0.35) / (rings + 0.35), r1 = R * (k + 1.35) / (rings + 0.35), cnt = petals * (k + 1);
      for (var i = 0; i < cnt; i++) {
        var a0 = i / cnt * Math.PI * 2, a1 = (i + 1) / cnt * Math.PI * 2, dl = (a1 - a0) * 0.12;
        var c = GLASS[Math.floor(r() * GLASS.length)]; if (c === last) c = GLASS[(GLASS.indexOf(c) + 1) % GLASS.length]; last = c;
        by[c].push('M' + n(cx + Math.cos(a0) * r0) + ' ' + n(cy + Math.sin(a0) * r0) + 'L' + n(cx + Math.cos(a0 + dl) * r1) + ' ' + n(cy + Math.sin(a0 + dl) * r1) +
          'A' + n(r1) + ' ' + n(r1) + ' 0 0 1 ' + n(cx + Math.cos(a1 - dl) * r1) + ' ' + n(cy + Math.sin(a1 - dl) * r1) + 'L' + n(cx + Math.cos(a1) * r0) + ' ' + n(cy + Math.sin(a1) * r0) + 'Z');
      }
    }
    s += circ(cx, cy, R + 22, PAD, ol('#BDAE8E', 14)) + circ(cx, cy, R, '#24304A');
    GLASS.forEach(function (c, i) { if (by[c].length) s += path(by[c].join(''), c, ol(IN, 5) + cls('rose-ring') + ' style="animation-delay:-' + n(i * 1.3) + 's"'); });
    s += circ(cx, cy, R, 'url(#glassSheen)');
    var rc = R * 0.3;
    s += circ(cx, cy, rc, PAH, ol(IN, 5)) + path('M' + cx + ' ' + n(cy - rc * 0.85) + 'L' + n(cx + rc * 0.14) + ' ' + cy + 'L' + cx + ' ' + n(cy + rc * 0.85) + 'L' + n(cx - rc * 0.14) + ' ' + cy + 'Z', CI) +
      '<g transform="rotate(-38 ' + cx + ' ' + cy + ')">' + path('M' + cx + ' ' + n(cy + rc * 0.8) + 'Q' + n(cx - rc * 0.32) + ' ' + n(cy - rc * 0.2) + ' ' + cx + ' ' + n(cy - rc * 0.85) + 'Q' + n(cx + rc * 0.2) + ' ' + n(cy - rc * 0.2) + ' ' + cx + ' ' + n(cy + rc * 0.8) + 'Z', GOD, ol(IN, 2)) + '</g>';
    return s + circ(cx, cy, R, 'none', ol(IN, 8));
  }
  function flame(x, y, s) { // 3.6：火芯、中焰、外焰 + 光晕
    s = s || 1;
    return circ(x, y - 10 * s, 120 * s, 'url(#fireGlow)', cls('fx-fire')) +
      g(path('M' + x + ' ' + n(y - 34 * s) + 'q' + n(12 * s) + ' ' + n(18 * s) + ' 0 ' + n(34 * s) + 'q' + n(-12 * s) + ' ' + n(-16 * s) + ' 0 ' + n(-34 * s) + 'Z', FIRE) +
        path('M' + x + ' ' + n(y - 24 * s) + 'q' + n(7 * s) + ' ' + n(12 * s) + ' 0 ' + n(22 * s) + 'q' + n(-7 * s) + ' ' + n(-10 * s) + ' 0 ' + n(-22 * s) + 'Z', '#FFC56A') +
        path('M' + x + ' ' + n(y - 14 * s) + 'q' + n(3 * s) + ' ' + n(6 * s) + ' 0 ' + n(12 * s) + 'q' + n(-3 * s) + ' ' + n(-6 * s) + ' 0 ' + n(-12 * s) + 'Z', FCORE), cls('fx-flame'));
  }
  function candle(x, y, s, lit) {
    s = s || 1;
    var b = ell(x, y, 30 * s, 8 * s, GOD, ol(IN, 2)) + rect(x - 5 * s, y - 20 * s, 10 * s, 20 * s, GO) + rect(x - 9 * s, y - 66 * s, 18 * s, 46 * s, PAH, ol(IN, 1.8)) +
      path('M' + n(x - 9 * s) + ' ' + n(y - 62 * s) + 'q4 10 0 18q6 -2 6 -18Z', PAD) + path('M' + n(x + 9 * s) + ' ' + n(y - 60 * s) + 'q-3 8 0 12Z', PAD);
    if (lit) b += flame(x, y - 66 * s, s);
    else b += stroke('M' + x + ' ' + n(y - 68 * s) + 'q8 -16 -2 -30q-8 -14 4 -28', IW2, 2, op(0.6) + cls('fx-steam'));
    return b;
  }
  function quillPen(x, y, ang, s, col) {
    s = s || 1;
    return '<g transform="translate(' + x + ' ' + y + ') rotate(' + ang + ') scale(' + s + ')">' +
      path('M0 0Q-16 -60 -6 -130Q14 -70 4 0Z', col || PAH, ol(IN, 2)) + stroke('M0 0L-2 -126', IW, 1.2) +
      stroke('M-4 -40l-9 -8M-4 -62l-10 -8M-3 -84l-8 -9M1 -46l8 -8M1 -70l8 -9', IW, 1.1) + path('M-2 0L2 0L0 14Z', GOD, ol(IN, 1)) + '</g>';
  }
  function books(x, y, count, seed, maxH, palette) { // 书脊：同色合并成一条 path
    var r = rnd(seed), cx = x, by = {}, bands = [], pal = palette || ['#7A5634', '#5B4E7A', '#3E6E8C', '#8C4A2F', '#C9A24A', '#4A4E5A'];
    pal.forEach(function (c) { by[c] = []; });
    for (var i = 0; i < count; i++) {
      var w = 8 + r() * 14, h = (maxH || 110) * (0.66 + r() * 0.34), c = pal[Math.floor(r() * pal.length)];
      by[c].push([cx, y - h, w, h]); bands.push([cx + 2, y - h + 10, w - 4, 2.4]); cx += w + 1.4;
    }
    var s = '';
    pal.forEach(function (c) { if (by[c].length) s += path(rects(by[c]), c, ol(IN, 1)); });
    return s + path(rects(bands), GOH, op(0.75));
  }
  function statueStall(x, y, s) { // 潮汐巷铜像：弯腰，一手扶着货摊的棚子，往外伸，好替人挡半张桌子的雨
    s = s || 1;
    return '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ')">' +
      rect(-34, 0, 68, 14, PAD, ol(IN, 2)) + rect(-28, 14, 56, 30, '#CFC4AC', ol(IN, 2)) +
      path('M-14 0L-18 -40Q-10 -66 10 -70L20 -62Q8 -50 8 -36L18 0Z', BRONZE, ol(IN, 2)) + circ(16, -74, 9, BRONZE, ol(IN, 2)) +
      path('M10 -60Q34 -62 52 -54L54 -48Q34 -54 14 -50Z', BRONZE, ol(IN, 2)) +
      rect(50, -58, 44, 6, '#8C7A5B', ol(IN, 1.6)) + rect(50, -52, 4, 52, WOODD) + rect(90, -52, 4, 52, WOODD) + rect(46, -22, 52, 6, WOODD) +
      stroke('M-16 -38Q-12 -60 8 -66', GOH, 1.6, op(0.8)) + '</g>';
  }
  function statueNest(x, y, s, flower) { // 灯塔丘铜像（全书统一）：一手托着鸟巢，一手掌心向上，伸向树下
    s = s || 1;
    return '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ')">' +
      rect(-60, 0, 120, 22, PAD, ol(IN, 2.4)) + rect(-48, 22, 96, 70, '#CFC4AC', ol(IN, 2.4)) + rect(-62, 90, 124, 16, PAD, ol(IN, 2.4)) +
      stroke('M-34 46h60M-34 60h40', IW2, 1.6, op(0.6)) +
      path('M-26 0L-30 -70Q-34 -122 -6 -150L14 -150Q38 -136 34 -100L30 -60L40 0Z', BRONZE, ol(IN, 2.6)) +
      path('M-30 -70Q-58 -40 -50 0L-26 0Z', BRONZE, ol(IN, 2.4)) + circ(4, -168, 18, BRONZE, ol(IN, 2.6)) +
      path('M20 -126Q44 -118 46 -100L38 -96Q30 -108 14 -112Z', BRONZE, ol(IN, 2.2)) + ell(46, -102, 18, 8, '#6F5B3A', ol(IN, 2)) + stroke('M30 -104q16 -6 32 0', '#8C7A5B', 1.6) + path(dots([[40, -108, 3], [48, -109, 3], [55, -107, 3]]), PAH) +
      path('M-20 -116Q-60 -90 -86 -56L-80 -50Q-52 -80 -14 -100Z', BRONZE, ol(IN, 2.2)) + path('M-88 -56q-10 0 -14 -6l6 -4q6 4 12 2Z', BRONZE, ol(IN, 1.8)) +
      (flower ? g(line(-96, -62, -102, -86, MEAS, 2) + path(dots([[-102, -90, 6]]), PAH, ol(GOH, 1.4)) + circ(-102, -90, 2.4, GOH), cls('keep-gold')) : '') +
      stroke('M-8 -148Q-30 -120 -28 -70', GOH, 2.4, op(0.75)) + stroke('M30 -96Q28 -60 36 -4', GOH, 1.6, op(0.5)) + '</g>';
  }
  function tree(x, y, s) {
    s = s || 1;
    return '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ')">' + path('M-6 0Q-10 -60 -2 -110Q2 -60 8 0Z', '#5A4636', ol(IN, 2)) +
      stroke('M-2 -70Q-30 -96 -50 -100M0 -90Q24 -112 44 -116', '#5A4636', 4) +
      g(path('M-80 -110Q-60 -160 -10 -170Q40 -186 70 -140Q96 -120 70 -96Q40 -84 -10 -96Q-50 -84 -80 -110Z', MEAS, ol(IN, 2)) +
        path('M-50 -130Q-20 -160 20 -152Q50 -150 54 -128Q20 -120 -50 -130Z', MEA, op(0.85)), cls('fx-sway')) + '</g>';
  }
  function lancetSmall(x, y, w, h) { return path('M' + x + ' ' + (y + h) + 'L' + x + ' ' + (y + w * 0.6) + 'Q' + (x + w / 2) + ' ' + (y - w * 0.4) + ' ' + (x + w) + ' ' + (y + w * 0.6) + 'L' + (x + w) + ' ' + (y + h) + 'Z', '#53627A', ol(IN, 2)) + line(x + w / 2, y + 4, x + w / 2, y + h, IN, 1.4); }
  function lighthouseTower(x, y, s, glow) { // 哥特大教堂式灯塔，已停用（灯室没有光），门上挂锁
    s = s || 1;
    return '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ')">' +
      path('M-120 0L-74 -130L-62 -130L-90 0Z', '#CFC6B4', ol(IN, 3)) + path('M120 0L74 -130L62 -130L90 0Z', '#CFC6B4', ol(IN, 3)) +
      path('M-76 0L-66 -210L66 -210L76 0Z', '#D9D2C3', ol(IN, 3.2)) + path('M-30 0L-30 -56A30 30 0 0 1 30 -56L30 0Z', WOODK, ol(IN, 3)) +
      rect(-6, -36, 12, 14, GOD, ol(IN, 1.4)) + path('M-4 -36a4 5 0 0 1 8 0', 'none', ol(IN, 1.6)) +
      path('M-56 -210L-46 -500L46 -500L56 -210Z', '#E3DDD0', ol(IN, 3.2)) + stroke('M-18 -210L-14 -500M18 -210L14 -500', '#C9C1B0', 2) +
      lancetSmall(-12, -460, 24, 80) + lancetSmall(-12, -350, 24, 80) + lancetSmall(-40, -190, 22, 90) + lancetSmall(18, -190, 22, 90) +
      rect(-62, -520, 124, 20, '#CFC6B4', ol(IN, 3)) +
      path('M-44 -600L-30 -620L30 -620L44 -600L44 -540L30 -520L-30 -520L-44 -540Z', glow ? '#FFE9A8' : '#5D6A78', ol(IN, 3)) + stroke('M-14 -620V-520M14 -620V-520M-44 -570H44', IN, 1.6, op(0.7)) +
      path('M-52 -620L0 -760L52 -620Z', LA, ol(IN, 3.2)) + line(0, -760, 0, -800, IN, 3) + star4(0, -810, 12, GOH) + '</g>';
  }
  function whiteCrown(o, sparkle) {
    var body = 'M640 470L720 400L760 372L800 380L838 340L872 352L900 300L922 322L944 310L1000 400L1060 470Z';
    var snow = 'M760 372L800 380L838 340L872 352L900 300L922 322L944 310L962 340L948 350L930 338L912 356L896 342L880 368L862 360L844 378L822 366L806 392L782 384L770 392Z';
    var s = g(path(body, '#6A7488') + path(body, 'none', ol('#55607A', 2)) + path(snow, MOON), op(o));
    if (sparkle) s += '<g transform="translate(900 300)"><g class="fx-diamond keep-gold">' + circ(0, 0, 70, 'url(#whiteGlow)') +
      [0, 1, 2, 3, 4, 5, 6, 7].map(function (i) { var L = i % 2 ? 80 : 220; return '<path transform="rotate(' + (i * 45) + ')" d="M0 -2L' + L + ' 0L0 2Z" fill="' + FCORE + '"/>'; }).join('') + circ(0, 0, 6, '#FFFFFF') + '</g></g>';
    return s;
  }
  function starsField(seed, count, y1, y2, milky) { // 3.7：多数暗、少数亮，8% 闪烁
    var r = rnd(seed), dim = [], bright = [], tw = '';
    for (var i = 0; i < count; i++) {
      var u = r(), rr = 0.6 + 1.2 * u * u * u, x = r() * 1600, y = y1 + r() * (y2 - y1);
      if (r() < 0.08) tw += circ(x, y, rr + 0.4, STAR, cls('fx-twinkle') + ' style="animation-delay:-' + n(r() * 6) + 's"');
      else (rr > 1.1 ? bright : dim).push([x, y, rr]);
    }
    return (milky ? path('M-100 380Q500 120 1700 -40L1700 120Q600 260 -100 520Z', '#3A4775', op(0.35)) : '') + path(dots(dim), STAR, op(0.55)) + path(dots(bright), STAR) + tw;
  }

  var TOWER_BGS = ['street_spring', 'fair_booth', 'cafe', 'ferry', 'lighthouse_hill', 'rain_street'];
  var TW_BODY = 0.84, TW_LV = 9; // 塔身（塔冠以下）占全高的比例；塔身分 9 节，越往上节越短
  function twLevel(H, i) { return H * TW_BODY * (1 - Math.pow(1 - Math.min(i, TW_LV) / TW_LV, 1.25)); }
  function twHalf(H, h) { var k = Math.max(0, Math.min(1, h / (H * TW_BODY))); return H * 0.032 + H * 0.118 * Math.pow(1 - k, 1.7); }
  function towerParts(x, y, H, t, o) {
    o = o || {};
    var st = Math.max(0, Math.min(5, Math.floor((t && t.s) || 0))), lit = st === 5 && !!(t && t.lit);
    var ink = o.ink || IW, lw = Math.max(0.7, H / 230), wood = o.wood || '#8C6A48', hz = o.hz != null ? o.hz : y + H * 0.05;
    var b = '', L = '', land = '', i, k, d = '', br = '', inner = '';
    var hc = H * TW_BODY, nb = [0, 2, 5, 9, 9, 9][st], top = twLevel(H, nb), lamp = null;
    function X(h, side, off) { return n(x + side * (twHalf(H, h) + (off || 0))); }
    function P(h, side, off) { return X(h, side, off) + ' ' + n(y - h); }
    if (o.land) land = path('M' + n(x - H * 0.85) + ' ' + n(hz) + 'Q' + n(x - H * 0.5) + ' ' + n(y + H * 0.004) + ' ' + n(x - H * 0.24) + ' ' + n(y) + 'L' + n(x + H * 0.3) + ' ' + n(y - H * 0.006) + 'Q' + n(x + H * 0.36) + ' ' + n(y + H * 0.01) + ' ' + n(x + H * 0.42) + ' ' + n(hz) + 'Z', o.land, op(o.landOp || 0.5));
    function scaffold(h0, h1) { // 木脚手架：顺着塔腿往外让一点，立杆 + 横杆 + 几道斜撑
      var off = H * 0.03, s2 = '';
      [-1, 1].forEach(function (sd) {
        s2 += 'M' + P(h0, sd, off) + 'L' + P(h1, sd, off);
        for (var hh = h0; hh <= h1 + 0.1; hh += Math.max(4, H * 0.045)) s2 += 'M' + P(hh, sd, off) + 'L' + n(x + sd * twHalf(H, hh) * 0.35) + ' ' + n(y - hh);
        s2 += 'M' + P(h0, sd, off) + 'L' + P(Math.min(h1, h0 + H * 0.09), sd, off * 0.2);
      });
      return stroke(s2, wood, lw * 0.6, op(0.85));
    }
    function crown(yb, seated) { // 塔冠：一只铁笼似的灯室，上面一顶小穹
      var w = H * 0.045, hh = H * 0.07, c = 'M' + n(x - w) + ' ' + n(yb) + 'H' + n(x + w);
      [-1, -0.33, 0.33, 1].forEach(function (f) { c += 'M' + n(x + f * w) + ' ' + n(yb) + 'L' + n(x + f * w * 0.78) + ' ' + n(yb - hh); });
      c += 'M' + n(x - w * 0.8) + ' ' + n(yb - hh) + 'H' + n(x + w * 0.8) + 'M' + n(x - w * 0.8) + ' ' + n(yb - hh) + 'Q' + n(x) + ' ' + n(yb - hh - H * 0.05) + ' ' + n(x + w * 0.8) + ' ' + n(yb - hh);
      if (seated) c += 'M' + n(x) + ' ' + n(yb - hh - H * 0.035) + 'V' + n(y - H); // 尖顶
      return stroke(c, ink, lw * 1.1);
    }
    if (st === 0) {
      b += stroke('M' + n(x - H * 0.18) + ' ' + n(y) + 'H' + n(x + H * 0.18), ink, lw * 1.2) + path(rects([[x - H * 0.17, y - H * 0.016, H * 0.04, H * 0.016], [x + H * 0.13, y - H * 0.016, H * 0.04, H * 0.016]]), ink, op(0.7));
      var stk = '';
      for (k = 0; k < 18; k++) { var a = k / 18 * Math.PI * 2, sx = x + Math.cos(a) * H * 0.21, sy = y + Math.sin(a) * H * 0.028; stk += 'M' + n(sx) + ' ' + n(sy) + 'v' + n(-H * (Math.sin(a) < 0 ? 0.028 : 0.04)); }
      b += stroke(stk, wood, lw * 1.1);
      b += stroke('M' + n(x - H * 0.06) + ' ' + n(y) + 'L' + n(x) + ' ' + n(y - H * 0.2) + 'L' + n(x + H * 0.06) + ' ' + n(y) + 'M' + n(x) + ' ' + n(y - H * 0.2) + 'V' + n(y - H * 0.07), wood, lw * 0.9) + rect(x - H * 0.012, y - H * 0.07, H * 0.024, H * 0.018, ink, op(0.7));
      b += line(x + H * 0.26, y, x + H * 0.26, y - H * 0.1, wood, lw * 0.9);
      lamp = [x + H * 0.26, y - H * 0.105, 0.07];
    } else {
      for (i = 0; i < nb; i++) {
        var h0 = twLevel(H, i), h1 = twLevel(H, i + 1);
        d += 'M' + P(h0, -1) + 'L' + P(h1, -1) + 'M' + P(h0, 1) + 'L' + P(h1, 1);
        br += 'M' + P(h0, -1) + 'L' + P(h1, 1) + 'M' + P(h0, 1) + 'L' + P(h1, -1) + 'M' + P(h1, -1) + 'L' + P(h1, 1);
        inner += 'M' + n(x - twHalf(H, h0) * 0.45) + ' ' + n(y - h0) + 'L' + n(x - twHalf(H, h1) * 0.45) + ' ' + n(y - h1) + 'M' + n(x + twHalf(H, h0) * 0.45) + ' ' + n(y - h0) + 'L' + n(x + twHalf(H, h1) * 0.45) + ' ' + n(y - h1);
      }
      b += stroke(inner, ink, lw * 0.5, op(0.45)) + stroke(br, ink, lw * 0.6, op(0.85)) + stroke(d, ink, lw * 1.5);
      b += path(rects([[x - twHalf(H, 0) - H * 0.012, y - H * 0.01, H * 0.03, H * 0.01], [x + twHalf(H, 0) - H * 0.018, y - H * 0.01, H * 0.03, H * 0.01]]), ink, op(0.8));
      if (nb >= 2) { var a1 = twLevel(H, 1); b += stroke('M' + n(x - twHalf(H, 0) * 0.8) + ' ' + n(y) + 'Q' + n(x) + ' ' + n(y - a1 * 2.1) + ' ' + n(x + twHalf(H, 0) * 0.8) + ' ' + n(y), ink, lw * 0.9); } // 塔脚的拱
      if (nb >= 5) { // 观景平台：比塔身宽出一点的横梁和一排栏杆
        var g4 = twLevel(H, 4), gw = twHalf(H, g4) + H * 0.026, rail = 'M' + n(x - gw) + ' ' + n(y - g4) + 'H' + n(x + gw);
        for (k = 0; k <= 8; k++) rail += 'M' + n(x - gw + k * gw / 4) + ' ' + n(y - g4) + 'v' + n(-H * 0.014);
        b += stroke(rail + 'M' + n(x - gw) + ' ' + n(y - g4 - H * 0.014) + 'H' + n(x + gw), ink, lw * 0.7);
      }
      if (st === 1) { b += scaffold(0, twLevel(H, 3)); }
      if (st === 2) { b += scaffold(twLevel(H, 3.6), twLevel(H, 6.2)); }
      if (st <= 2) { // 塔顶的扒杆：一根立杆、一根斜吊臂、一条吊绳
        var gt = y - top;
        b += stroke('M' + n(x + H * 0.01) + ' ' + n(gt) + 'V' + n(gt - H * 0.13) + 'L' + n(x - H * 0.09) + ' ' + n(gt - H * 0.07) + 'V' + n(gt - H * 0.02) + 'M' + n(x + H * 0.01) + ' ' + n(gt - H * 0.13) + 'L' + n(x + H * 0.05) + ' ' + n(gt), wood, lw * 0.8);
        lamp = [x + H * 0.01, gt - H * 0.135, 0.07];
      }
      if (st === 3 || st === 4) { // 塔吊：一根格构桅杆立在塔边；吊塔冠时吊臂伸过塔顶，封顶后转开
        var xm = x + H * 0.27, yt = y - H * 1.08, mast = 'M' + n(xm - H * 0.008) + ' ' + n(y) + 'V' + n(yt) + 'M' + n(xm + H * 0.008) + ' ' + n(y) + 'V' + n(yt), zz = '';
        for (k = 0; k < 18; k++) zz += (k ? 'L' : 'M') + n(xm + (k % 2 ? 1 : -1) * H * 0.008) + ' ' + n(y - k * H * 0.06);
        var jl = st === 3 ? H * 0.34 : H * 0.06, jr = st === 3 ? H * 0.12 : H * 0.32;
        mast += 'M' + n(xm - jl) + ' ' + n(yt) + 'H' + n(xm + jr) + 'M' + n(xm) + ' ' + n(yt - H * 0.06) + 'L' + n(xm - jl) + ' ' + n(yt) + 'M' + n(xm) + ' ' + n(yt - H * 0.06) + 'L' + n(xm + jr) + ' ' + n(yt);
        b += stroke(zz, ink, lw * 0.45, op(0.7)) + stroke(mast, ink, lw * 0.8) + rect(xm + jr - H * 0.04, yt, H * 0.035, H * 0.022, ink, op(0.75));
        if (st === 3) { // 塔冠悬在半空，离塔顶还差一点
          var yc = y - hc - H * 0.06;
          b += line(x, yt, x, yc - H * 0.11, ink, lw * 0.5) + stroke('M' + n(x) + ' ' + n(yc - H * 0.11) + 'L' + n(x - H * 0.03) + ' ' + n(yc - H * 0.07) + 'M' + n(x) + ' ' + n(yc - H * 0.11) + 'L' + n(x + H * 0.03) + ' ' + n(yc - H * 0.07), ink, lw * 0.5) + crown(yc, false);
          b += scaffold(twLevel(H, 7), hc + H * 0.02);
        } else { b += crown(y - hc, true) + scaffold(hc - H * 0.06, hc + H * 0.03); }
        lamp = st === 3 ? [xm, yt - H * 0.065, 0.07] : [x, y - H - H * 0.004, 0.07, 1];
      }
      if (st === 5) {
        var lc = y - hc - H * 0.035, rg = H * 0.075;
        b += crown(y - hc, true);
        if (!lit) b += circ(x, lc, rg, 'none', ol(ink, lw * 0.5) + op(0.4)) + circ(x, lc, rg, 'none', ' stroke="' + ink + '" stroke-width="' + n(H * 0.012) + '" stroke-dasharray="' + n(rg * 0.26) + ' ' + n(rg * 0.26) + '"' + op(0.25)) + circ(x, lc, H * 0.012, '#5D6A78', op(0.8));
        lamp = [x, lc, 0.13];
      }
    }
    if (o.night && st >= 1 && st <= 3) {
      var wy = y - (st === 3 ? hc : top), wx = [x - twHalf(H, top) * 0.6, x + twHalf(H, top) * 0.5, x - H * 0.01];
      L += '<g class="tw-weld">' + circ(wx[0], wy, Math.max(3, H * 0.02), 'url(#towerGlow)') + path(dots([[wx[0], wy, Math.max(0.9, H * 0.005)], [wx[0] + 2, wy - 1.5, 0.7]]), FCORE) + '</g>';
      L += '<g class="tw-weld" style="animation-delay:-1.1s">' + path(dots([[wx[1], wy + H * 0.02, Math.max(0.8, H * 0.004)]]), WW) + '</g>';
      L += stroke('M' + n(wx[0]) + ' ' + n(wy + 2) + 'v' + n(H * 0.03) + 'M' + n(wx[2]) + ' ' + n(wy + 4) + 'v' + n(H * 0.02), FCORE, 0.8, cls('tw-spark'));
    }
    if (lamp) {
      var lx = lamp[0], ly = lamp[1], fr = H * lamp[2], steady = '';
      if (st === 5 && lit) {
        var rg2 = H * 0.075, halo = '<g class="tw-halo">' + circ(lx, ly, rg2, 'none', ' stroke="#DCE8FF" stroke-width="' + n(H * 0.013) + '" stroke-dasharray="' + n(rg2 * 0.26) + ' ' + n(rg2 * 0.26) + '" opacity=".55"') +
          circ(lx, ly, rg2 * 0.72, 'none', ' stroke="#DCE8FF" stroke-width="' + n(lw * 0.5) + '" opacity=".6"') +
          stroke([0, 1, 2, 3, 4, 5].map(function (j) { var a = j * Math.PI / 3; return 'M' + n(lx + Math.cos(a) * rg2 * 0.3) + ' ' + n(ly + Math.sin(a) * rg2 * 0.3) + 'L' + n(lx + Math.cos(a) * rg2 * 0.7) + ' ' + n(ly + Math.sin(a) * rg2 * 0.7); }).join(''), '#DCE8FF', lw * 0.4, op(0.45)) + '</g>';
        steady = circ(lx, ly, H * (o.night ? 0.26 : 0.16), 'url(#towerGlow)', op(o.night ? 0.9 : 0.6) + cls('tw-pulse')) + halo + circ(lx, ly, Math.max(1.6, H * 0.016), '#F4F8FF');
      } else if (st < 5) {
        var red = lamp[3] ? '#D2493A' : '#E8A24A';
        steady = (o.night ? circ(lx, ly, Math.max(5, H * 0.045), 'url(#amberGlow)', op(0.55)) : '') + circ(lx, ly, Math.max(1.2, H * 0.008), red, op(0.95) + (lamp[3] ? cls('tw-blink') : ''));
      }
      L += '<g class="tw-lamp"><g class="tw-steady">' + steady + '</g>' + circ(lx, ly, fr, 'url(#towerFlash)', cls('tw-flash')) + '</g>';
    }
    if (o.bloom && L) L = '<g class="tw-on">' + L + '</g>';
    return { body: land + g(b, op(o.op == null ? 0.6 : o.op) + cls('tower')), lamp: L };
  }
  function towerOf(o) { return o && o.tower && typeof o.tower === 'object' ? o.tower : null; }

  var BG = {}, FX = {}, VARIANTS = {}, TOD = {};

  VARIANTS.street_spring = ['day', 'dusk']; TOD.street_spring = { day: 'tod-day', dusk: 'tod-dusk' };
  BG.street_spring = function (v, o) {
    var r = rnd(11), s = '', i, sky = nid('sky'), dusk = v === 'dusk', tw = towerOf(o) ? towerParts(676, 404, 196, o.tower, { ink: dusk ? '#3A3350' : IW, op: dusk ? 0.6 : 0.5, land: dusk ? '#55506A' : '#7D8A98', landOp: 0.55, hz: 412, night: dusk }) : null;
    var loc = skyDefs(sky) + lgrad(sky + 'w', 0, 0, 0, 1, [[0, WW, 0], [0.5, WW, 0.25], [1, WW, 0]]);
    s += rect(0, 0, 1600, 900, 'url(#' + sky + ')') + circ(1260, 210, 380, 'url(#whiteGlow)', op(dusk ? 0.3 : 0.6));
    s += inkHills(380, 21, 2);
    s += g(landship(840, 418, 0.95, IW2), op(0.4) + cls('fx-glide-slow'));
    s += rect(560, 410, 760, 60, '#8FA7B5') + line(600, 432, 1240, 432, PAH, 1.6, op(0.6) + cls('fx-twinkle')) + line(640, 452, 1200, 452, PAH, 1.2, op(0.5));
    if (tw) s += tw.body; // 誊塔：海那头的岬角上
    [700, 780, 1120].forEach(function (mx, k) { var h = 80 + k * 30; s += line(mx, 450, mx, 450 - h, IW, 3) + line(mx - 20, 450 - h * 0.7, mx + 20, 450 - h * 0.7, IW, 2); });
    s += poly([[0, 0], [620, 180], [620, 640], [0, 900]], PAD) + poly([[1600, 0], [1250, 200], [1250, 620], [1600, 900]], PAD);
    var tim = '', win = [];
    for (i = 0; i <= 4; i++) { var t = i / 4; tim += 'M' + n(t * 620) + ' ' + n(lerp(0, 180, t)) + 'L' + n(t * 620) + ' ' + n(lerp(900, 640, t)) + 'M' + n(1600 - t * 350) + ' ' + n(lerp(0, 200, t)) + 'L' + n(1600 - t * 350) + ' ' + n(lerp(900, 620, t)); }
    for (i = 0; i < 3; i++) { var yy = 260 + i * 140; tim += 'M0 ' + n(yy + 60) + 'L620 ' + n(300 + i * 110) + 'M1600 ' + n(yy + 40) + 'L1250 ' + n(300 + i * 100); }
    s += stroke(tim, TIMBER, 10);
    [[60, 240, 90, 100], [230, 300, 80, 90], [400, 340, 60, 80], [60, 470, 90, 100], [230, 490, 80, 90], [1300, 280, 70, 80], [1460, 240, 80, 90], [1300, 450, 70, 80]].forEach(function (w) { win.push(w); });
    s += path(rects(win), LA, ol(IN, 2)) + stroke(win.map(function (w) { return 'M' + (w[0] + w[2] / 2) + ' ' + w[1] + 'v' + w[3] + 'M' + w[0] + ' ' + (w[1] + w[3] / 2) + 'h' + w[2]; }).join(''), GOH, 2, op(0.7));
    s += path('M0 0L640 170L640 196L0 40Z', CI, op(0.85)) + path('M1600 0L1236 190L1236 214L1600 40Z', LA, op(0.9)); // 青瓦与红瓦混搭
    s += cablePole(1120, 640, 470) + cablePole(1380, 900, 760, 1.3);
    s += cable(1120, 186, 620, 210, 70, 2, dusk) + cable(1120, 216, 360, 140, 90, 2, dusk) + cable(1380, 170, 1120, 186, 40, 1, dusk) + cable(1380, 210, 470, 300, 110, 3, dusk);
    function flag(x, y, col, emb, dir) { // 行会燕尾旗：锚、羽毛笔、罗盘
      var w = 58, h = 150, bx = dir > 0 ? x + 8 : x - 8 - w, ec = dusk ? IW2 : GOH;
      var f = line(x, y - 8, x + dir * (w + 18), y - 8, IN, 4) + '<g class="fx-sway" style="animation-delay:-' + n(r() * 5) + 's">' +
        path('M' + bx + ' ' + y + 'h' + w + 'v' + h + 'l' + n(-w / 2) + ' -24l' + n(-w / 2) + ' 24Z', dusk ? IW : col, ol(IN, 2)) + rect(bx + 4, y + 4, w - 8, 5, GOH, op(dusk ? 0.3 : 0.9));
      var ex = bx + w / 2, ey = y + 56;
      if (emb === 'anchor') f += stroke('M' + ex + ' ' + (ey - 22) + 'v40M' + (ex - 16) + ' ' + (ey + 8) + 'q16 20 32 0M' + (ex - 9) + ' ' + (ey - 12) + 'h18', ec, 4) + circ(ex, ey - 26, 5, 'none', ol(ec, 3));
      else if (emb === 'quill') f += path('M' + (ex + 12) + ' ' + (ey - 26) + 'Q' + (ex - 16) + ' ' + (ey - 6) + ' ' + (ex - 10) + ' ' + (ey + 24) + 'Q' + (ex + 6) + ' ' + ey + ' ' + (ex + 12) + ' ' + (ey - 26) + 'Z', ec);
      else f += circ(ex, ey, 18, 'none', ol(ec, 3)) + path('M' + ex + ' ' + (ey - 16) + 'L' + (ex + 4) + ' ' + ey + 'L' + ex + ' ' + (ey + 16) + 'L' + (ex - 4) + ' ' + ey + 'Z', ec);
      return f + '</g>';
    }
    s += flag(120, 230, CI, 'anchor', 1) + flag(300, 280, LA, 'quill', 1) + flag(470, 320, GO, 'compass', 1) + flag(1330, 270, CI, 'anchor', -1) + flag(1480, 236, LA, 'quill', -1);
    var road = nid('road');
    s += '<clipPath id="' + road + '"><polygon points="0,900 620,640 1250,620 1600,900"/></clipPath>' + g(rect(0, 600, 1600, 300, 'url(#stoneP)'), ' clip-path="url(#' + road + ')"') +
      poly([[870, 900], [930, 630], [960, 630], [1080, 900]], 'url(#' + sky + 'w)');
    s += statueStall(760, 560, 1.05);
    s += fogBand(380, 70, 0.45) + fogBand(470, 50, 0.35) + fogBand(220, 80, 0.3);
    if (tw) s += tw.lamp;
    s += stroke('M-20 40Q120 60 200 130Q240 160 300 150M120 70Q140 30 190 20', '#5A4636', 6);
    var bl = [];
    [[200, 130], [250, 152], [300, 150], [160, 96], [190, 24], [140, 64], [96, 52], [226, 110]].forEach(function (p) { for (var k = 0; k < 5; k++) { var a = k / 5 * Math.PI * 2; bl.push([p[0] + Math.cos(a) * 7, p[1] + Math.sin(a) * 7, 5]); } });
    s += path(dots(bl), PAH, ol('#D9C9B0', 1)) + path(dots([[200, 130, 3], [250, 152, 3], [300, 150, 3], [160, 96, 3], [190, 24, 3], [140, 64, 3]]), GOH);
    return svgRoot(s, v, loc);
  };
  FX.street_spring = '<div class="fx fx-petals"></div><div class="fx fx-mist"></div>';

  VARIANTS.fair_booth = ['day', 'dusk', 'stage']; TOD.fair_booth = { day: 'tod-day', dusk: 'tod-dusk', stage: 'mode-stage' };
  BG.fair_booth = function (v, o) {
    var r = rnd(23), s = '', i, sky = nid('sky'), lit = v !== 'day', stage = v === 'stage';
    var tw = towerOf(o) ? towerParts(1112, 352, 176, o.tower, { ink: stage ? '#1B1830' : (lit ? '#3A3350' : IW), op: lit ? 0.62 : 0.5, land: stage ? '#1E2238' : (lit ? '#4E4A66' : '#6F8496'), landOp: 0.6, hz: 361, night: lit }) : null;
    s += rect(0, 0, 1600, 900, 'url(#' + sky + ')');
    s += rect(0, 360, 1600, 60, stage ? SEAD : SEA) + line(200, 380, 1400, 380, PAH, 1.4, op(0.4));
    if (tw) s += tw.body; // 誊塔：海平线上，帐篷之间的空当里
    s += sailTri(480, 360, 1, IW) + sailTri(1180, 362, 0.8, IW2);
    if (!stage) s += g(gull(700, 220, 1) + gull(760, 250, 0.7) + gull(1000, 200, 0.9), cls('fx-glide'));
    s += bunting(-20, 70, 1620, 80, 90, 26, 1, 3) + bunting(-20, 140, 1620, 120, 70, 22, 0.8, 5);
    function tent(x, w, pat, h) {
      var t = path('M' + x + ' ' + (300 - h) + 'L' + (x + w) + ' ' + (300 - h) + 'L' + (x + w + 30) + ' 300L' + (x - 30) + ' 300Z', 'url(#' + pat + ')', ol(IN, 2.4));
      var sc = 'M' + (x - 30) + ' 300', cnt = Math.round((w + 60) / 40);
      for (var k = 0; k < cnt; k++) sc += 'a' + n((w + 60) / cnt / 2) + ' 16 0 0 0 ' + n((w + 60) / cnt) + ' 0';
      return t + path(sc + 'L' + (x + w + 30) + ' 296L' + (x - 30) + ' 296Z', pat === 'stripeR' ? CI : LA, ol(IN, 2)) +
        rect(x - 24, 300, 8, 300, WOODD) + rect(x + w + 16, 300, 8, 300, WOODD) + poly([[x + w + 30, 300], [x + w + 70, 330], [x + w + 70, 600], [x + w + 30, 600]], LA, op(0.18));
    }
    s += tent(180, 260, 'stripeB', 70) + tent(600, 440, 'stripeR', 90) + tent(1180, 260, 'stripeB', 70);
    s += rect(560, 470, 540, 22, WOOD, ol(IN, 2.4)) + rect(570, 492, 520, 110, CI, ol(IN, 2)) + rect(570, 492, 520, 110, 'url(#stripeR)', op(0.25));
    for (i = 0; i < 4; i++) { var bx = 600 + i * 110, h = 2 + Math.floor(r() * 3), bl = []; for (var k = 0; k < h; k++) bl.push([bx + (r() - 0.5) * 8, 454 - k * 15, 86, 14]); s += path(rects(bl), [PAH, LA, '#7A5634', GOH][i], ol(IN, 1.4)); }
    s += '<g transform="translate(940 440) rotate(-6)">' + rect(0, 0, 110, 26, PAH, ol(IN, 2)) + ell(0, 13, 7, 13, PAD, ol(IN, 1.6)) + rect(48, -1, 12, 28, CI) + '</g>';
    s += ell(1040, 466, 22, 8, GOD, ol(IN, 1.6)) + ell(1040, 464, 16, 5, PAH);
    s += rect(780, 330, 110, 40, WOOD, ol(IN, 2)) + line(800, 300, 800, 330, IN, 2) + line(870, 300, 870, 330, IN, 2) + txt(835, 358, '《海图》', 22, PAH);
    [[650, 320], [1040, 320], [300, 250], [1300, 250]].forEach(function (p, k) {
      s += line(p[0], p[1] - 24, p[0], p[1], IN, 1.6) + (lit ? circ(p[0], p[1] + 26, 60, 'url(#amberGlow)') : '') + ell(p[0], p[1] + 24, 20, 24, k % 2 ? GO : CI, ol(IN, 1.6)) + rect(p[0] - 9, p[1], 18, 5, IN) + rect(p[0] - 8, p[1] + 46, 16, 5, IN) + (lit ? ell(p[0], p[1] + 24, 9, 14, FCORE, op(0.7)) : '');
    });
    s += rect(1220, 470, 200, 20, WOOD, ol(IN, 2)) + rect(1250, 380, 90, 92, '#C9A878', ol(IN, 2)) + path('M1250 380l12 -14h66l12 14Z', '#B8976A', ol(IN, 2));
    s += g(ell(1280, 410, 7, 5, IN) + ell(1308, 410, 7, 5, IN) + circ(1281, 409, 2, PAH) + circ(1309, 409, 2, PAH), cls('fx-blink'));
    s += rect(1262, 438, 60, 22, PAH, ol(IN, 1.2)) + kai(1292, 455, '店主在', 14, IN) + path('M1350 470Q1356 360 1384 350Q1404 360 1404 470Z', '#2E2C34', ol(IN, 2));
    s += path('M140 470L230 330L320 470Z', MEA, ol(IN, 2.4)) + path('M230 330L248 470L212 470Z', MEAS) + ell(230, 476, 46, 12, IN) + path('M190 476Q190 506 230 506Q270 506 270 476Z', IW, ol(IN, 2));
    s += stroke('M214 466q-10 -20 4 -36q12 -16 0 -34M244 466q-10 -18 4 -32', PAH, 3, op(0.8) + cls('fx-steam'));
    s += rect(150, 500, 160, 30, WOOD, ol(IN, 1.6)) + kai(230, 522, '热汤 · 一碗', 16, PAH);
    s += rect(620, 196, 360, 48, LA, ol(GO, 2.4)) + txt(800, 232, '星潮祭', 32, GOH, ' letter-spacing="12"');
    if (stage) { // 品红、青、琥珀三束锥形光穿过烟雾；吟游诗人弹长颈拨弦琴
      s += rect(0, 0, 1600, 900, HAZE, op(0.45));
      s += rect(1120, 470, 320, 40, WOOD, ol(IN, 2)) + rect(1120, 510, 320, 90, WOODD);
      [[1180, STM, 'a'], [1280, STC, 'b'], [1380, STA, 'c']].forEach(function (b) {
        s += path('M' + b[0] + ' 0L' + (b[0] - 90) + ' 480L' + (b[0] + 90) + ' 480Z', b[1], op(0.32) + cls('fx-spot fx-spot-' + b[2]) + ' style="transform-origin:' + b[0] + 'px 0px"');
      });
      s += g(ell(1240, 440, 180, 40, HAZE) + ell(1340, 420, 160, 36, HAZE) + ell(1290, 460, 200, 30, HAZE), op(0.3) + cls('fx-drift'));
      s += path('M1270 470L1274 410Q1262 380 1276 360Q1292 352 1300 368Q1310 392 1298 410L1304 470Z', IN) + circ(1286, 348, 12, IN) + stroke('M1262 420L1336 372', IN, 4) + ell(1262, 424, 18, 12, IN);
    }
    if (tw) s += tw.lamp;
    return svgRoot(s, v, skyDefs(sky));
  };

  VARIANTS.library = ['day', 'night']; TOD.library = { day: 'tod-day', night: 'tod-fire' };
  BG.library = function (v) {
    var r = rnd(37), s = '', i, night = v === 'night', beam = nid('beam');
    s += rect(0, 0, 1600, 900, '#D9CBB0') + path('M380 640L380 260Q800 -140 1220 260L1220 640', 'none', ' stroke="' + PAD + '" stroke-width="40"');
    s += rose(800, 120, 300, 3);
    if (!night) {
      s += '<clipPath id="' + beam + '"><path d="M640 300L720 300L560 560L440 560Z M760 300L840 300L860 560L740 560Z M880 300L960 300L1160 560L1040 560Z"/></clipPath>';
      s += g(rect(380, 300, 840, 260, 'url(#beamW)'), ' clip-path="url(#' + beam + ')" style="mix-blend-mode:screen"');
      var dust = []; for (i = 0; i < 30; i++) dust.push([440 + r() * 720, 320 + r() * 230, 1 + r() * 1.5]);
      s += g(g(path(dots(dust), WW), cls('fx-dust')), ' clip-path="url(#' + beam + ')"');
    }
    [[20, 340], [1240, 340]].forEach(function (sh, k) {
      s += rect(sh[0], 60, sh[1], 520, '#5A4636', ol(IN, 3));
      for (var row = 0; row < 4; row++) { var y = 180 + row * 120; s += rect(sh[0], y, sh[1], 10, WOODK) + books(sh[0] + 10, y, 24, 7 + row * 5 + k * 31, 100); }
    });
    s += rect(1262, 140, 126, 18, PAH, ol(IN, 1.2)) + kai(1325, 154, '勇者小事录 · 卷三', 11, IN);
    s += stroke('M1200 80L1290 600M1270 80L1360 600', WOODK, 7) + stroke('M1210 140h70M1222 210h70M1234 280h70M1246 350h70M1258 420h70M1270 490h70', WOODK, 5);
    s += poly([[300, 540], [1300, 540], [1400, 640], [200, 640]], WOOD, ol(IN, 3)) + line(210, 638, 1390, 638, GOH, 3, op(0.8)) + rect(200, 640, 1200, 260, '#6E4B33');
    s += path('M560 506L1000 500L1030 560L520 568Z', PAH, ol(IN, 2)) + stroke('M590 516h150M594 528h140M600 540h150M800 512h160M804 524h150M810 536h160', IW, 2, op(0.6)) + rect(590, 516, 14, 14, CI, op(0.85));
    s += stroke('M840 560L950 530M840 560L948 540', GOD, 3); // 镊子
    s += ell(470, 540, 40, 12, PAD, ol(IN, 2)) + path('M430 540Q430 576 470 576Q510 576 510 540Z', SEA, ol(IN, 2)) + line(478, 538, 510, 486, WOOD, 4); // 浆糊碗与小刷
    s += circ(1010, 560, 22, 'none', ol(GOD, 5)) + stroke('M996 552l14 -10', WW, 3, op(0.8)) + line(1026, 576, 1060, 592, WOODK, 6); // 放大镜
    s += '<g transform="translate(1080 470)">' + rect(0, 0, 160, 90, GOD, ' rx="14"' + ol(IN, 2.6)) + path(dots([[24, 38, 6], [44, 38, 6], [64, 38, 6], [84, 38, 6], [104, 38, 6], [124, 38, 6], [34, 56, 6], [54, 56, 6], [74, 56, 6], [94, 56, 6], [114, 56, 6], [44, 74, 6], [64, 74, 6], [84, 74, 6], [104, 74, 6]]), IN, ol(GOH, 1.4)) +
      rect(10, -10, 140, 14, GO, ol(IN, 2)) + path('M30 -10L34 -70L126 -70L130 -10Z', PAH, ol(IN, 1.6)) + stroke('M44 -58h60M44 -48h70M44 -38h40', IW, 1.4) + '</g>';
    s += path('M1250 548q20 -14 44 -6l4 14q-24 8 -48 2Z', PAH, ol(IN, 1.6)) + path('M1256 556q20 -8 44 -2', 'none', ol(IN, 1.2));
    s += path('M352 540L388 540L382 488L358 488Z', '#C9A878', ol(IN, 2)) + stroke('M370 488Q356 440 340 410M370 488Q372 430 376 396M370 488Q388 440 402 414M370 488Q360 456 352 440M370 488Q382 460 392 446', MEAS, 2.2);
    var fl = []; [[340, 410], [376, 396], [402, 414], [352, 440], [392, 446]].forEach(function (p) { for (var k = 0; k < 4; k++) fl.push([p[0] + Math.cos(k * 1.57) * 5, p[1] + Math.sin(k * 1.57) * 5, 4.5]); });
    s += path(dots(fl), FMN) + path(dots([[340, 410, 2], [376, 396, 2], [402, 414, 2], [352, 440, 2], [392, 446, 2]]), GOH);
    if (night) s += rect(0, 0, 1600, 900, NIGHT, op(0.55)) + circ(760, 480, 380, 'url(#amberGlow)', op(0.6) + cls('fx-fire-wide')) + candle(760, 534, 0.8, true);
    else s += g([[620, 590, CI], [720, 600, GOH], [820, 594, G_COB], [920, 598, G_ROSE], [1020, 592, G_EME], [800, 620, FMN]].map(function (p) { return ell(p[0], p[1], 60, 12, p[2], op(0.3)); }).join(''), ' style="mix-blend-mode:multiply"' + cls('fx-drift-slow'));
    return svgRoot(s, v);
  };

  VARIANTS.my_room_night = ['night', 'dawn']; TOD.my_room_night = { night: 'tod-fire', dawn: 'tod-dawn' };
  BG.my_room_night = function (v) {
    var s = '', dawn = v === 'dawn', sky = nid('sky'), wid = nid('win');
    s += rect(0, 0, 1600, 900, '#2B2C38') + circ(520, 470, 560, 'url(#amberGlow)', op(dawn ? 0.2 : 0.45) + cls('fx-fire-wide'));
    s += poly([[0, 0], [1600, 0], [1600, 420], [0, 40]], '#1E1F29') + stroke('M0 60L1600 440M0 0L1600 380', '#3B2E26', 18) + stroke('M500 0L520 160M1000 0L1020 260', '#3B2E26', 14);
    s += '<g transform="rotate(-3 470 260)">' + rect(380, 180, 170, 230, PAH, ol(IN, 1.6)) + stroke('M400 214h130M400 240h120M400 266h130M400 292h110M400 318h130M400 344h100', IW, 2, op(0.55)) + kai(465, 205, '榜', 18, IN) + kai(536, 380, '这次一定', 13, CI, ' writing-mode="tb"') + circ(465, 184, 4, GOD) + '</g>';
    s += g(path('M700 470Q690 330 740 280Q770 240 800 280Q840 330 830 470Z', IN, op(0.4)) + circ(770, 250, 34, IN, op(0.4)), cls('no-wolf'));
    s += g(path('M700 470Q690 330 740 290L760 220L790 250L830 200L816 268Q840 330 830 470Z', WOLFI, op(0.6)) + stroke('M700 300L640 230M840 300L900 240', WOLFI, 6, op(0.6)), cls('only-wolf'));
    var wx = 870, wy = 150, ww = 320, wh = 330;
    s += '<clipPath id="' + wid + '"><rect x="' + wx + '" y="' + wy + '" width="' + ww + '" height="' + wh + '"/></clipPath>';
    var out = rect(wx, wy, ww, wh, 'url(#' + sky + ')');
    if (!dawn) out += starsField(9, 40, wy, wy + 200, false) + circ(wx + 230, wy + 90, 150, 'url(#moonHalo)', op(0.4)) + circ(wx + 230, wy + 90, 54, MOON);
    else out += circ(wx + 200, wy + 250, 160, 'url(#whiteGlow)', op(0.6));
    out += rect(wx, wy + 250, ww, 80, dawn ? '#6C7FA0' : SEAD) + stroke('M' + (wx + 200) + ' ' + (wy + 262) + 'h40M' + (wx + 190) + ' ' + (wy + 276) + 'h60M' + (wx + 206) + ' ' + (wy + 292) + 'h30', dawn ? FCORE : MOON, 2.4, cls('fx-twinkle'));
    out += g(sailTri(wx + 90, wy + 256, 0.8, '#0B1222') + sailTri(wx + 150, wy + 254, 0.6, '#0B1222'), cls('fx-glide'));
    s += g(out, ' clip-path="url(#' + wid + ')"') + rect(wx, wy, ww, wh, 'none', ' stroke="#3B2E26" stroke-width="20"') + stroke('M' + (wx + ww / 2) + ' ' + wy + 'v' + wh + 'M' + wx + ' ' + (wy + wh / 2) + 'h' + ww, '#3B2E26', 9) +
      rect(wx + 4, wy + 4, ww - 8, wh - 8, 'none', ' stroke="' + MHALO + '" stroke-width="3"' + op(0.6)) + rect(wx - 24, wy + wh, ww + 48, 22, WOOD, ol(IN, 2));
    s += poly([[200, 500], [1000, 500], [1060, 560], [160, 560]], WOOD, ol(IN, 3)) + rect(160, 560, 900, 340, '#4A3626');
    s += path('M430 494L530 488L640 494L640 506L530 500L430 506Z', PAH, ol(IN, 1.6)) + stroke('M450 498h60M548 496h70', IW, 1.6);
    s += path('M700 498L696 466Q712 456 728 466L724 498Z', IN) + quillPen(714, 462, 20, 0.7) + rect(760, 484, 20, 16, CI, ol(IN, 1.4));
    s += books(240, 500, 9, 12, 70) + candle(520, 500, 1, !dawn);
    s += rect(1060, 440, 150, 120, WOOD, ol(IN, 2.6)) + rect(1056, 430, 158, 16, '#5A4636', ol(IN, 2)) + rect(1124, 480, 22, 18, GOD, ol(IN, 1.4));
    s += rect(1240, 470, 150, 110, '#C9A878', ol(IN, 2)) + path('M1240 470l20 -20h110l20 20Z', '#B8976A', ol(IN, 2)) + kai(1315, 530, '书 · 勿压', 20, IN);
    var loc = lgrad(sky, 0, 0, 0, 1, dawn ? [[0, '#1F2A4F'], [0.6, '#E7A08A'], [1, FCORE]] : [[0, NIGHT], [1, '#2B3A63']]);
    return svgRoot(s, v, loc);
  };

  VARIANTS.yuan_room = ['night', 'day']; TOD.yuan_room = { night: 'tod-night', day: 'tod-day' };
  BG.yuan_room = function (v) {
    var s = '', day = v === 'day', wid = nid('aw');
    s += rect(0, 0, 1600, 900, '#E9DDC4') + (day ? '' : rect(0, 0, 1600, 900, VELVET, op(0.35)));
    var wd = 'M240 700L240 330A230 230 0 0 1 700 330L700 700Z';
    var out = rect(240, 100, 460, 600, day ? SKYF : VELVET);
    if (!day) out += circ(470, 380, 330, 'url(#moonHalo)', cls('fx-breathe')) + circ(470, 380, 210, MOON) + path(dots([[420, 330, 34], [520, 420, 46], [500, 300, 18], [400, 440, 22]]), '#DDE2EC');
    else out += circ(560, 240, 200, 'url(#whiteGlow)') + inkHills(560, 6, 2);
    out += rect(240, 600, 460, 100, day ? SEA : SEAD) + shipSil(600, 640, 0.3, '#0B1222');
    s += '<clipPath id="' + wid + '"><path d="' + wd + '"/></clipPath>' + g(out, ' clip-path="url(#' + wid + ')"') +
      path(wd, 'none', ' stroke="' + WOOD + '" stroke-width="22"') + stroke('M470 100V700M240 460H700', WOOD, 8);
    if (!day) s += path('M286 700L286 340', 'none', ' stroke="' + MHALO + '" stroke-width="4"' + op(0.6));
    s += g(path('M200 90Q240 300 210 520Q230 600 200 700L300 700Q270 600 290 520Q300 300 300 90Z', 'url(#laceP)') + path('M200 700q25 14 50 0q25 14 50 0', 'none', ol(LACE, 2)), op(0.75) + cls('fx-sway-slow')) +
      g(path('M640 90Q640 300 660 520Q640 600 660 700L760 700Q730 600 750 520Q760 300 740 90Z', 'url(#laceP)'), op(0.75) + cls('fx-sway-slow'));
    [[780, 90, 220, 160], [1010, 130, 180, 130], [800, 270, 170, 130]].forEach(function (m, k) {
      var id = nid('mp'), cx1 = m[0] + m[2] * 0.3, cy1 = m[1] + m[3] * 0.4, cx2 = m[0] + m[2] * 0.72, cy2 = m[1] + m[3] * 0.65, rl = '';
      for (var q = 0; q < 16; q++) { var a = q / 16 * Math.PI * 2; rl += 'M' + n(cx1) + ' ' + n(cy1) + 'l' + n(Math.cos(a) * 300) + ' ' + n(Math.sin(a) * 300) + 'M' + n(cx2) + ' ' + n(cy2) + 'l' + n(Math.cos(a) * 300) + ' ' + n(Math.sin(a) * 300); }
      s += rect(m[0], m[1], m[2], m[3], PAH, ol(IN, 2)) + '<clipPath id="' + id + '"><rect x="' + m[0] + '" y="' + m[1] + '" width="' + m[2] + '" height="' + m[3] + '"/></clipPath>' +
        g(stroke(rl, k % 2 ? CI : LA, 1, op(0.5)) + path('M' + m[0] + ' ' + (m[1] + m[3] * 0.6) + 'q' + n(m[2] * 0.3) + ' -30 ' + n(m[2] * 0.5) + ' 10t' + n(m[2] * 0.5) + ' -20V' + (m[1] + m[3]) + 'H' + m[0] + 'Z', '#D9C79E', ol(IN, 1.4)), ' clip-path="url(#' + id + ')"') +
        circ(m[0] + 8, m[1] + 8, 5, CI) + circ(m[0] + m[2] - 8, m[1] + 8, 5, CI);
    });
    var gx = 1110;
    s += rect(gx - 4, 560, 8, 60, WOODD) + ell(gx, 620, 46, 8, WOODD);
    s += path('M' + (gx - 52) + ' 230Q' + gx + ' 210 ' + (gx + 52) + ' 230L' + (gx + 44) + ' 330Q' + gx + ' 346 ' + (gx - 44) + ' 330Z', MOON, ol(IN, 2.2));
    s += path('M' + (gx - 44) + ' 330Q' + gx + ' 346 ' + (gx + 44) + ' 330L' + (gx + 120) + ' 560Q' + gx + ' 590 ' + (gx - 120) + ' 560Z', MOON, ol(IN, 2.2)) +
      path('M' + (gx - 120) + ' 560Q' + gx + ' 590 ' + (gx + 120) + ' 560l0 10Q' + gx + ' 600 ' + (gx - 120) + ' 570Z', 'url(#laceP)', ol(MHALO, 1));
    s += path('M' + (gx + 52) + ' 232Q' + (gx + 88) + ' 260 ' + (gx + 92) + ' 340L' + (gx + 74) + ' 344Q' + (gx + 70) + ' 280 ' + (gx + 46) + ' 258Z', MOON, ol(IN, 2));
    s += stroke('M' + (gx - 52) + ' 234Q' + (gx - 88) + ' 262 ' + (gx - 92) + ' 340', CI, 2, ' stroke-dasharray="6 6"');
    s += path(dots([[gx - 20, 250, 3], [gx, 246, 3], [gx + 22, 252, 3], [gx - 34, 320, 3]]), GOH) + stroke('M' + (gx - 40) + ' 226Q' + (gx - 10) + ' 290 ' + (gx - 36) + ' 360', '#F3EBD8', 6) + stroke('M' + (gx - 40) + ' 226Q' + (gx - 10) + ' 290 ' + (gx - 36) + ' 360', IW, 1, ' stroke-dasharray="2 6"');
    if (!day) s += stroke('M' + (gx - 52) + ' 236L' + (gx - 120) + ' 560', MHALO, 4, op(0.7));
    s += poly([[160, 540], [1440, 540], [1500, 610], [100, 610]], WOOD, ol(IN, 3)) + rect(100, 610, 1400, 300, '#6E4B33');
    s += ell(800, 560, 70, 22, GOD, ol(IN, 2.4)) + ell(800, 556, 58, 17, PAH, ol(IN, 1.4)) + g(path('M800 556L846 548L800 552L754 564Z', CI, ol(IN, 1)), cls('fx-needle')) + circ(800, 556, 4, IN);
    s += stroke('M640 560L670 500L690 566', IN, 3.4) + circ(670, 498, 5, GOD, ol(IN, 1.2));
    s += '<g transform="translate(930 552) rotate(-14)">' + circ(0, 0, 9, 'none', ol(GOD, 3.4)) + circ(0, 20, 9, 'none', ol(GOD, 3.4)) + path('M8 2L66 16L8 12ZM8 18L66 8L8 24Z', MI, ol(IN, 1)) + '</g>';
    s += rect(420, 470, 90, 74, WOODD, ol(IN, 2)) + stroke('M432 470l-6 -70M450 470l2 -84M470 470l8 -64M490 470l14 -76', PAH, 9) + stroke('M432 470l-6 -70M450 470l2 -84M470 470l8 -64M490 470l14 -76', IN, 1, op(0.5));
    s += path('M560 540L620 528L680 540L620 548Z', PAH, ol(IN, 1.4)) + kai(620, 538, '纹章学 · 第一册', 9, IN);
    s += path('M560 694Q560 714 590 714Q620 714 620 694Z', PAH, ol(IN, 1.6)) + line(610, 688, 634, 674, GOD, 2);
    s += circ(1250, 520, 90, 'url(#amberGlow)', op(0.3)) + rect(1240, 500, 20, 34, GOD, ol(IN, 1.4));
    return svgRoot(s, v);
  };

  VARIANTS.cafe = ['day']; TOD.cafe = { day: 'tod-day' };
  BG.cafe = function (v, o) {
    var s = '', tw = towerOf(o) ? towerParts(1252, 414, 190, o.tower, { ink: IW, op: 0.5, land: '#7D8A98', landOp: 0.6, hz: 421 }) : null;
    s += rect(0, 0, 1600, 900, PAD) + rect(0, 540, 1600, 360, '#7A5634');
    [260, 700, 1140].forEach(function (x, k) {
      var w = 300, y = 120, h = 440, id = nid('arch');
      var d = 'M' + x + ' ' + (y + h) + 'L' + x + ' ' + (y + w / 2) + 'A' + (w / 2) + ' ' + (w / 2) + ' 0 0 1 ' + (x + w) + ' ' + (y + w / 2) + 'L' + (x + w) + ' ' + (y + h) + 'Z';
      var out = rect(x, y, w, h, SKYF) + rect(x, y + 300, w, 140, SEA) + line(x, y + 326, x + w, y + 326, PAH, 1.2, op(0.5));
      if (k === 2 && tw) out += tw.body + tw.lamp; // 誊塔：右边那扇窗外，海那头的岬角上
      out += stroke('M' + (x + 60) + ' ' + (y + 300) + 'v-120M' + (x + 40) + ' ' + (y + 220) + 'h40M' + (x + 210) + ' ' + (y + 300) + 'v-90M' + (x + 194) + ' ' + (y + 240) + 'h32', IW, 3);
      if (k === 1) out += cablePole(x + 230, y + 440, 420) + stroke(catenary(x - 20, y + 60, x + 230, y + 46, 50) + catenary(x - 20, y + 170, x + 230, y + 76, 60), IN, 2.5, op(0.85));
      out += g(gull(x + 120, y + 120, 0.9), cls('fx-glide'));
      s += '<clipPath id="' + id + '"><path d="' + d + '"/></clipPath>' + g(out, ' clip-path="url(#' + id + ')"') +
        path(d, 'none', ol(IN, 8)) + stroke('M' + (x + w / 2) + ' ' + y + 'V' + (y + h) + 'M' + x + ' ' + (y + 240) + 'H' + (x + w), IN, 5) + rect(x - 16, y + h, w + 32, 16, PAD, ol(IN, 2));
      s += path('M' + x + ' 900L' + (x + 160) + ' 600L' + (x + 460) + ' 600L' + (x + 300) + ' 900Z', WW, op(0.18) + ' style="mix-blend-mode:screen"' + cls('fx-drift-slow'));
    });
    s += rect(0, 540, 1600, 14, '#5A4636');
    function table(cx, cy) {
      var t = ell(cx, cy, 190, 40, WOOD, ol(IN, 2.6)) + rect(cx - 12, cy + 30, 24, 260, WOODK);
      t += ell(cx - 40, cy - 26, 44, 34, '#9CC2B0', ol(IN, 2.2)) + ell(cx - 40, cy - 58, 18, 6, '#9CC2B0', ol(IN, 1.8)) + circ(cx - 40, cy - 66, 5, '#9CC2B0', ol(IN, 1.4)) +
        path('M' + (cx - 82) + ' ' + (cy - 32) + 'Q' + (cx - 106) + ' ' + (cy - 46) + ' ' + (cx - 110) + ' ' + (cy - 64) + 'L' + (cx - 102) + ' ' + (cy - 66) + 'Q' + (cx - 96) + ' ' + (cy - 46) + ' ' + (cx - 78) + ' ' + (cy - 40) + 'Z', '#9CC2B0', ol(IN, 1.6)) +
        stroke('M' + (cx + 4) + ' ' + (cy - 44) + 'q22 4 14 28', '#9CC2B0', 6);
      [[cx + 50, cy - 14], [cx + 104, cy - 10]].forEach(function (c) { t += path('M' + (c[0] - 16) + ' ' + (c[1] - 20) + 'L' + (c[0] + 16) + ' ' + (c[1] - 20) + 'L' + (c[0] + 10) + ' ' + c[1] + 'L' + (c[0] - 10) + ' ' + c[1] + 'Z', '#E7EFE9', ol(IN, 1.6)) + path('M' + (c[0] - 14) + ' ' + (c[1] - 20) + 'q14 -14 28 0Z', '#9CC2B0', ol(IN, 1.4)); });
      t += ell(cx - 120, cy - 6, 30, 8, PAH, ol(IN, 1.4)) + path(dots([[cx - 128, cy - 10, 5], [cx - 114, cy - 9, 5]]), '#C99A5A');
      t += stroke('M' + (cx + 50) + ' ' + (cy - 38) + 'q-8 -16 4 -30q10 -14 -2 -28M' + (cx - 110) + ' ' + (cy - 70) + 'q-10 -20 4 -36', PAH, 2.6, op(0.75) + cls('fx-steam'));
      return t;
    }
    s += table(560, 540) + table(1080, 560) + circ(800, 300, 600, 'url(#whiteGlow)', op(0.15));
    return svgRoot(s, v);
  };

  VARIANTS.ferry = ['day', 'night']; TOD.ferry = { day: 'tod-day', night: 'tod-night' };
  BG.ferry = function (v, o) {
    var r = rnd(67), s = '', i, night = v === 'night', sky = nid('sky');
    var tw = towerOf(o) ? towerParts(320, 460, 214, o.tower, { ink: night ? '#0E1424' : IW2, op: night ? 0.8 : 0.55, land: night ? '#141C30' : '#8C979F', landOp: night ? 0.85 : 0.6, hz: 472, night: night }) : null;
    var loc = lgrad(sky, 0, 0, 0, 1, night ? [[0, '#1B2340'], [1, '#2E3A5A']] : [[0, '#B8C2C8'], [1, '#DDE1DE']]);
    s += rect(0, 0, 1600, 900, 'url(#' + sky + ')') + rect(0, 470, 1600, 430, night ? '#26344A' : '#5C7484');
    var wv = ''; for (i = 0; i < 14; i++) { var y = 490 + i * 28 + i * i; wv += 'M' + n(r() * 400) + ' ' + n(y) + 'q60 -6 120 0t120 0M' + n(700 + r() * 500) + ' ' + n(y + 8) + 'q50 -5 100 0t100 0'; }
    s += stroke(wv, FROST, 1.6, op(0.3));
    if (tw) s += tw.body; // 誊塔：左手边雾里的岬角
    s += g(shipSil(1320, 470, 0.6, night ? '#0E1424' : IW2) + circ(1314, 394, 8, AM, cls('fx-signal')) + circ(1314, 394, 30, 'url(#amberGlow)', cls('fx-signal')), op(0.75));
    s += fogBand(350, 90, night ? 0.25 : 0.6, night ? '#3A4A6A' : PA) + fogBand(430, 60, night ? 0.2 : 0.5, night ? '#3A4A6A' : '#DDE1DE');
    if (tw) s += tw.lamp;
    var deck = path('M-60 900L740 520L860 520L1660 900Z', '#6E5640', ol(IN, 3)), planks = '';
    for (i = -6; i <= 6; i++) planks += 'M800 520L' + (800 + i * 140) + ' 900';
    deck += stroke(planks, '#5A4636', 3) + stroke('M-60 900L740 520M1660 900L860 520', IN, 10) + stroke('M60 820L760 516M1540 820L840 516', WOODK, 5);
    deck += stroke('M800 70L180 820M800 70L1420 820M800 70L560 560M800 70L1040 560', IN, 1.8, op(0.6)) + circ(800, 600, 260, 'url(#amberGlow)', op(night ? 0.55 : 0.25));
    deck += g('<g transform="translate(850 520) scale(.62)">' + path('M-30 0L-24 -60Q-34 -110 -18 -128L18 -128Q32 -110 26 -60L34 0Z', '#2E2C34') + path('M-24 -60Q-50 -20 -40 0L-20 0Z', '#2E2C34') + circ(0, -144, 16, '#2E2C34') +
      '<g transform="rotate(-18)">' + rect(-10, -300, 16, 230, '#8C7A5B', ol('#2E2C34', 2)) + rect(-10, -248, 16, 6, CI) + '</g>' + line(22, -96, 46, -40, '#2E2C34', 6) + line(46, -40, 52, -10, '#C8CCD2', 3) + circ(52, -12, 4, WW, cls('fx-twinkle')) + '</g>', op(0.72));
    deck += rect(792, 60, 16, 470, WOOD, ol(IN, 2.4)) + stroke('M690 210H910', WOOD, 9);
    deck += line(800, 104, 800, 124, IN, 2.4) + rect(780, 124, 40, 6, IN) + rect(782, 130, 36, 46, '#FFE3A0', op(0.85) + ol(IN, 2.4)) + flame(800, 168, 0.5) + rect(778, 176, 44, 8, IN);
    s += g(deck, cls('fx-rock'));
    s += fogBand(580, 70, night ? 0.15 : 0.35) + fogBand(700, 90, night ? 0.12 : 0.3);
    return svgRoot(s, v, loc);
  };
  FX.ferry = '<div class="fx fx-mist"></div>';

  VARIANTS.bookshop = ['day', 'night']; TOD.bookshop = { day: 'tod-fire', night: 'tod-fire' };
  BG.bookshop = function (v) {
    var s = '', i, night = v === 'night';
    s += rect(0, 0, 1600, 900, '#6E4B33') + rect(0, 0, 1600, 70, WOODK);
    s += rect(380, 80, 840, 420, '#5A4636', ol(IN, 3));
    for (var row = 0; row < 3; row++) { var y = 200 + row * 130; s += rect(380, y, 840, 10, WOODK) + books(392, y, 50, 40 + row * 7, 104); }
    s += '<g transform="translate(1176 330)">' + path('M0 0Q-4 -40 14 -54Q32 -40 28 0Z', '#3B2E26', ol(IN, 1.6)) + path('M6 -2Q6 -32 14 -40Q22 -32 22 -2Z', '#C9A878') + path('M8 -44h14v5h-14Z', IN) + path('M20 -50l8 3l-8 3Z', GOH) + '</g>';
    s += path('M1260 640L1560 120L1600 120L1600 160L1320 640Z', '#5A4636', ol(IN, 2)) + stroke('M1280 600l40 0M1318 534l40 0M1356 468l40 0M1394 402l40 0M1432 336l40 0M1470 270l40 0M1508 204l40 0', WOODK, 6) + stroke('M1250 560L1540 60', IN, 5);
    s += rect(150, 160, 170, 130, WOOD, ol(IN, 2.4)) + '<g transform="rotate(-4 235 225)">' + rect(170, 176, 130, 92, PAH, ol(IN, 1.4)) + kai(235, 214, '流动医馆船', 17, IN) + kai(235, 240, '下月靠岸', 15, LA) + '</g>';
    s += stroke('M800 0V80', IN, 3) + ell(800, 120, 170, 26, 'none', ol(IN, 5));
    var wax = [];
    for (i = 0; i < 8; i++) { var a = i / 8 * Math.PI * 2, cx = 800 + Math.cos(a) * 170, cy = 120 + Math.sin(a) * 26; wax.push([cx - 5, cy - 26, 10, 26]); if (!night) s += g(flame(cx, cy - 26, 0.36), ' style="animation-delay:-' + n(i * 0.37) + 's"'); }
    s += path(rects(wax), PAH, ol(IN, 1.2));
    if (!night) s += circ(800, 160, 520, 'url(#amberGlow)', op(0.35));
    s += ell(860, 200, 5, 3, '#D9CBB0', cls('fx-moth'));
    s += poly([[120, 520], [920, 520], [980, 580], [60, 580]], WOOD, ol(IN, 3)) + rect(60, 580, 920, 320, '#5A3E2C', ol(IN, 3));
    s += path('M360 512L460 504L560 512L560 522L460 516L360 522Z', PAH, ol(IN, 1.6)) + stroke('M372 512h80M374 518h76', IW, 1.4);
    s += circ(640, 506, 12, 'none', ol(GOD, 3.4)) + stroke('M632 516v24h6M646 516v20h6', GOD, 3);
    s += rect(700, 494, 24, 24, CI, ol(IN, 1.4)) + txt(712, 512, '准', 15, PAH);
    s += candle(240, 518, 0.7, true);
    s += rect(1040, 470, 160, 110, '#9C7A52', ol(IN, 2.4)) + stroke('M1040 498h160M1040 550h160', '#6E5640', 4) + path('M1060 520q20 -16 40 0q-16 -6 -20 10q-4 -16 -20 -10Z', IN) + kai(1140, 536, '急件 · 当日达', 15, IN);
    s += stroke('M1000 70V100M1160 70V100', IN, 3) + rect(1000, 100, 160, 70, '#2E2A2A', ol(GOD, 2.4)) +
      stroke('M1050 112v44M1034 146q16 18 32 0M1042 120h16', GOH, 4) + rect(1100, 118, 10, 30, PAH) + path('M1105 104q6 8 0 14q-6 -6 0 -14Z', FCORE) + stroke('M1036 160L1126 112', GOD, 3) + kai(1080, 192, '锚与烛', 20, PAH);
    if (night) s += rect(0, 0, 1600, 900, NIGHT, op(0.45)) + circ(240, 470, 260, 'url(#amberGlow)', op(0.6));
    return svgRoot(s, v);
  };

  VARIANTS.hospital = ['day', 'ceiling']; TOD.hospital = { day: 'tod-day', ceiling: 'tod-day' };
  BG.hospital = function (v) {
    var s = '', i;
    if (v === 'ceiling') {
      s += rect(0, 0, 1600, 900, '#EDE6D8');
      var rib = ''; for (i = 0; i < 8; i++) { var a = i / 8 * Math.PI * 2; rib += 'M800 450L' + n(800 + Math.cos(a) * 1200) + ' ' + n(450 + Math.sin(a) * 1200); }
      s += stroke(rib, '#D4CBB8', 26) + circ(800, 450, 380, 'none', ol('#D4CBB8', 18)) + circ(800, 450, 200, 'none', ol('#D4CBB8', 12)) + circ(800, 450, 700, 'none', ol('#D4CBB8', 22));
      s += circ(800, 450, 60, '#D4CBB8', ol(IN, 2)) + circ(800, 450, 30, GOD, ol(IN, 2));
      return svgRoot(s, v);
    }
    s += rect(0, 0, 1600, 900, '#EDE6D8') + stroke('M0 70H1600M200 0Q800 140 1400 0', '#D4CBB8', 10);
    [140, 380, 620].forEach(function (x, k) { s += lancetWin(x, 80, 120, 400, 9 + k * 4); });
    s += poly([[380, 480], [740, 480], [1000, 620], [520, 620]], 'url(#beamW)', ' style="mix-blend-mode:screen"');
    s += rect(0, 560, 1600, 340, '#D9D0BE') + line(0, 560, 1600, 560, IN, 2, op(0.4));
    function bed(x, y, w, sc) {
      return '<g transform="translate(' + x + ' ' + y + ') scale(' + sc + ')">' + stroke('M0 -40V120M' + w + ' 0V120', IN, 6) + rect(0, 0, w, 50, '#FAF8F2', ol(IN, 2.4)) + path('M14 0Q30 -30 90 -24Q110 -10 100 6Z', '#FFFFFF', ol('#D7D2C8', 2)) + path('M110 4Q' + (w / 2) + ' -20 ' + (w - 10) + ' 4L' + (w - 10) + ' 50L110 50Z', '#F2EFE8', ol('#D7D2C8', 1.6)) + rect(0, 50, w, 16, '#D7D2C8') + '</g>';
    }
    s += bed(1180, 360, 260, 0.42) + bed(1040, 400, 300, 0.55) + bed(820, 470, 420, 0.8);
    s += g([[880, 470, G_ROSE], [960, 476, GOH], [1050, 470, G_COB], [1130, 476, G_EME]].map(function (p) { return ell(p[0], p[1], 50, 12, p[2], op(0.35)); }).join(''), ' style="mix-blend-mode:multiply"' + cls('fx-drift-slow'));
    s += rect(700, 460, 90, 80, WOOD, ol(IN, 2)) + path('M712 450Q712 470 734 470Q756 470 756 450Z', PAH, ol(IN, 1.6)) + line(718, 456, 750, 456, LA, 2) +
      stroke('M724 446q-8 -16 4 -28q10 -12 -2 -24M742 446q-6 -14 4 -24', PAH, 2.4, op(0.8) + cls('fx-steam')) +
      path('M762 412L782 412L786 448L758 448Z', AM, ol(IN, 1.8)) + path('M758 412L772 398L786 412Z', GOD, ol(IN, 1.4)) + circ(772, 430, 40, 'url(#amberGlow)', op(0.6));
    return svgRoot(s, v);
  };
  FX.hospital = '<div class="fx fx-fan"><svg viewBox="0 0 200 120" aria-hidden="true"><rect x="97" y="0" width="6" height="40" fill="' + IW + '"/><ellipse cx="100" cy="46" rx="16" ry="9" fill="' + GOD + '" stroke="' + IN + '" stroke-width="2"/><g transform="translate(100 52) scale(1 .28)"><g class="blades">' +
    [0, 90, 180, 270].map(function (a) { return '<path transform="rotate(' + a + ')" d="M6 -8 L92 -16 Q100 0 92 16 L6 8 Z" fill="' + GOD + '" stroke="' + IN + '" stroke-width="3"/>'; }).join('') + '</g></g><ellipse cx="100" cy="58" rx="9" ry="6" fill="' + GO + '" stroke="' + IN + '" stroke-width="1.6"/></svg></div>';
  FX['hospital|ceiling'] = '<div class="fx fx-fan fx-fan-big"><svg viewBox="-300 -300 600 600" aria-hidden="true"><g class="blades">' +
    [0, 90, 180, 270].map(function (a) { return '<path transform="rotate(' + a + ')" d="M30 -26 L260 -44 Q292 0 260 44 L30 26 Z" fill="' + GOD + '" stroke="' + IN + '" stroke-width="5"/>'; }).join('') + '</g><circle r="44" fill="' + GO + '" stroke="' + IN + '" stroke-width="4"/></svg></div>';

  VARIANTS.lighthouse_hill = ['day', 'dusk', 'night', 'dawn']; TOD.lighthouse_hill = { day: 'tod-day', dusk: 'tod-dusk', night: 'tod-fire', dawn: 'tod-dawn' };
  BG.lighthouse_hill = function (v, o) {
    o = o || {};
    var r = rnd(89), s = '', i, sky = nid('sky'), sea = nid('sea');
    var sx = o.title ? 960 : 560, lx = o.title ? 1070 : 1120, camp = !o.title && v !== 'day', night = v === 'night', dawn = v === 'dawn', dusk = v === 'dusk';
    var loc = (dawn ? lgrad(sky, 0, 0, 0, 1, [[0, '#1F2A4F'], [0.4, '#6C5B8A'], [0.75, '#E7A08A'], [1, FCORE]]) : skyDefs(sky)) +
      lgrad(sea, 0, 0, 0, 1, [[0, night ? '#1A2846' : (dawn ? '#8E8AA6' : '#4E7F9C')], [1, night ? '#0E1830' : SEAD]]);
    s += rect(0, 0, 1600, 900, 'url(#' + sky + ')');
    if (night) s += starsField(5, 200, 0, 440, true);
    if (v === 'day') s += g(ell(400, 140, 120, 26, '#FFFFFF') + ell(470, 126, 80, 22, '#FFFFFF') + ell(1220, 110, 100, 22, '#FFFFFF'), op(0.75) + cls('fx-drift'));
    if (dawn) s += circ(900, 300, 260, 'url(#whiteGlow)', op(0.8)) + whiteCrown(1, true);
    else if (v === 'day') s += whiteCrown(0.25, false);
    s += rect(0, 470, 1600, 430, 'url(#' + sea + ')');
    if (dawn) s += poly([[880, 470], [920, 470], [1080, 900], [720, 900]], FCORE, op(0.5) + cls('keep-gold'));
    if (night) s += stroke('M700 500h140M680 540h180M660 590h220', MOON, 2, op(0.35) + cls('fx-twinkle'));
    s += stroke('M100 500h300M1200 520h260M300 560h200', PAH, 1.4, op(0.35));
    var tw = !o.title && towerOf(o) ? towerParts(292, 452, 252, o.tower, { // x 从 206 挪到 292：4:3 屏只显示 viewBox 的 200–1400，原位置会被切掉一半
     
      ink: night ? '#0A0F1E' : (dawn ? '#2A2A48' : (dusk ? '#3A3350' : IW)), op: night ? 0.85 : (v === 'day' ? 0.5 : 0.62),
      land: night ? '#0E1528' : (dawn ? '#3F3F60' : (dusk ? '#4A4560' : '#6A7488')), landOp: night ? 0.85 : 0.55, hz: 471, night: night || dusk, bloom: !!(o.plain && o.bloom) }) : null;
    if (tw) s += tw.body; // 誊塔：灯塔丘对面的岬角
    s += path('M0 900L0 530Q300 490 560 492Q760 470 960 500Q1180 520 1280 600L1300 900Z', MEA, ol(IN, 2.4)) + path('M1280 600L1320 700L1300 900L1340 900L1360 700Z', '#8C7A5B', ol(IN, 2)) + stroke('M0 540Q300 504 560 506Q760 486 960 514Q1160 532 1270 610', MEAS, 6, op(0.6));
    var grass = ''; for (i = 0; i < 40; i++) { var gx = r() * 1260, gy = 520 + r() * 300; grass += 'M' + n(gx) + ' ' + n(gy) + 'l4 -16M' + n(gx + 5) + ' ' + n(gy) + 'l8 -12'; }
    s += g(stroke(grass, MEAS, 1.8), cls('fx-sway'));
    s += lighthouseTower(lx, 560, 0.62, false);
    if (dusk) s += stroke('M' + (lx - 32) + ' 560L' + (lx - 26) + ' 250M' + (sx - 12) + ' 500L' + (sx - 12) + ' 400', PEACH, 3, op(0.7));
    s += tree(sx - 140, 500, 0.9) + statueNest(sx, 430, 0.62, !!o.plain);
    var fW = [], fG = [], fB = [], all = [];
    for (i = 0; i < 70; i++) { var a = r() * Math.PI * 2, rr = Math.sqrt(r()), fx = sx + Math.cos(a) * 120 * rr, fy = 512 + Math.sin(a) * 18 * rr; all.push([fx, fy]); [fW, fG, fB][i % 3].push([fx, fy, 3.4]); }
    s += ell(sx, 512, 126, 22, MEAS, op(0.8));
    if (o.plain && o.bloom) { // 长庚的小魔法：以铜像为圆心，每 0.08 秒开一朵，并升起一个冷白光点
      all.sort(function (p, q) { return Math.hypot(p[0] - sx, (p[1] - 512) * 5) - Math.hypot(q[0] - sx, (q[1] - 512) * 5); });
      s += all.map(function (p, k) { return '<g class="fx-bloom" style="animation-delay:' + n(k * 0.08) + 's">' + circ(p[0], p[1], 3.4, [PAH, GOH, FMN][k % 3]) + circ(p[0], p[1], 6, 'url(#magicGlow)', cls('fx-magic')) + '</g>'; }).join('');
    } else s += path(dots(fW), PAH) + path(dots(fG), GOH) + path(dots(fB), FMN);
    if (night) s += rect(0, 0, 1600, 900, NIGHT, op(0.5));
    else if (dusk) s += rect(0, 0, 1600, 900, '#5B4E7A', op(0.16));
    if (camp) { // 三角油布斜棚、火塘、三脚架小铁锅、斜靠的长卷轴、插在地上的银枝
      s += path('M940 500L1060 430L1070 560L930 560Z', '#8C7A5B', ol(IN, 2.4)) + stroke('M944 500L1060 432', GOD, 2, ' stroke-dasharray="6 5"') + stroke('M930 560L944 498M1070 560L1060 430', WOODK, 4);
      s += stroke('M1074 560L1100 360', '#8C7A5B', 10) + stroke('M1090 560L1096 520', '#C8CCD2', 3);
      s += path(dots([[860, 560, 8], [880, 566, 9], [902, 568, 8], [922, 564, 8], [940, 558, 7], [870, 552, 6], [930, 550, 6], [900, 548, 6]]), IW2, ol(IN, 1.2)) + stroke('M872 556L928 540M876 540L926 558', WOODK, 6);
      s += stroke('M870 560L900 500L930 560', IN, 3) + path('M886 520Q886 540 900 540Q914 540 914 520Z', IN) + line(886, 520, 914, 520, GOH, 2);
      if (!dawn) s += flame(900, 552, night ? 1.1 : 0.8) + (night ? circ(900, 550, 420, 'url(#fireGlow)', op(0.6) + cls('fx-fire-wide')) + g(path(dots([[890, 480, 2], [910, 450, 1.6], [900, 420, 1.4], [884, 400, 1.2]]), FCORE), cls('fx-embers')) : '');
      else s += stroke('M900 548q10 -20 -4 -40q-12 -18 4 -36', IW2, 2.4, op(0.6) + cls('fx-steam'));
      if (night) s += path('M1060 560L1040 300L1100 290L1110 560Z', IN, op(0.25)) + path('M1080 420L1020 300L1140 300Z', IN, op(0.18)); // 墙上的大影子
    }
    if (tw) s += tw.lamp;
    s += g(gull(1340, 260, 1.1) + gull(1400, 290, 0.8), cls('fx-glide'));
    if (o.title) s += rect(0, 0, 1600, 900, NIGHT, op(0.15));
    return svgRoot(s, v, loc);
  };

  VARIANTS.rain_street = ['rain', 'side']; TOD.rain_street = { rain: 'wx-rain', side: 'wx-rain' };
  BG.rain_street = function (v, o) {
    var r = rnd(97), s = '', i, tw = towerOf(o) ? towerParts(664, 378, 74, o.tower, { ink: '#2E333D', op: 0.55 }) : null;
    s += rect(0, 0, 1600, 900, '#3A4458');
    s += poly([[560, 0], [1080, 0], [700, 380], [620, 380]], '#59606B');
    if (tw) s += tw.body + tw.lamp; // 誊塔：巷子尽头那一线天里，极小
    s += stroke(catenary(520, 40, 1120, 20, 60) + catenary(500, 120, 1100, 70, 50) + catenary(560, 210, 980, 150, 40), IN, 2.5, op(0.85));
    s += path(dots([[700, 96, 2.4], [860, 84, 2.4], [760, 160, 2], [900, 130, 2]]), FROST, cls('fx-drip'));
    s += poly([[0, 0], [620, 380], [620, 520], [0, 900]], STEEL2) + poly([[1600, 0], [700, 380], [700, 520], [1600, 900]], '#59606B');
    s += poly([[0, 700], [620, 500], [620, 520], [0, 900]], '#3C424B', op(0.7)) + poly([[1600, 700], [700, 500], [700, 520], [1600, 900]], '#474D57', op(0.7));
    var wl = [], wd = [];
    [[80, 240, 70, 90, 1], [260, 290, 56, 70, 0], [420, 330, 40, 54, 1], [1360, 220, 80, 100, 1], [1120, 280, 64, 80, 0], [930, 320, 48, 60, 1], [820, 350, 30, 40, 1]].forEach(function (w) { (w[4] ? wl : wd).push(w); });
    s += path(rects(wl), AM, op(0.85)) + path(rects(wd), '#2A2E36') + circ(110, 285, 120, 'url(#amberGlow)', op(0.5)) + circ(1400, 270, 140, 'url(#amberGlow)', op(0.45));
    s += '<g transform="translate(-380 0) rotate(-6 900 470)">' + path('M840 420L960 414L962 520Q930 530 842 524Z', '#D9CBB0', ol(IN, 1.4)) + kai(900, 446, '今夜 · 地下酒窖', 14, IN) + kai(900, 470, '四人乐团', 16, CI) + kai(900, 496, '雨天照常', 13, IN) + path('M942 516q16 -2 20 -18l0 22Z', '#BFAE90') + '</g>';
    s += path('M1010 560Q1004 470 1020 450Q1036 430 1054 450Q1068 470 1062 560Z', '#1E2028') + circ(1036, 432, 18, '#1E2028') + path('M1052 456L1088 438L1100 556L1064 566Z', '#2E2C34', ol(IN, 1.4)) + stroke('M960 420H1110', '#2E2C34', 12);
    s += stroke('M1180 900V230', IN, 9) + path('M1162 230L1198 230L1190 196L1170 196Z', AM, ol(IN, 2)) + circ(1180, 220, 160, 'url(#amberGlow)', cls('fx-flicker'));
    s += poly([[620, 520], [700, 520], [1600, 900], [0, 900]], 'url(#slabP)') + poly([[620, 520], [700, 520], [1600, 900], [0, 900]], '#1B1A1F', op(0.25));
    s += ell(1180, 700, 26, 160, AM, op(0.4) + ' filter="url(#ptSoftS)"') + ell(110, 700, 30, 120, AM, op(0.3) + ' filter="url(#ptSoftS)"');
    for (i = 0; i < 12; i++) s += ell(200 + r() * 1200, 600 + r() * 260, 14, 4, 'none', ol(FROST, 1.4) + cls('fx-ripple') + ' style="animation-delay:-' + n(r() * 1.2) + 's"');
    if (v === 'side') { // 一把朱砂、一把青金，伞骨 16 条；两伞相位不同地摆，每 9 秒轻碰一次
      var umb = function (x, y, w, col, ph) {
        var u = '<g class="fx-umb" style="transform-origin:' + x + 'px ' + (y + 150) + 'px;animation-delay:' + ph + 's">' + path('M' + (x - w) + ' ' + (y + 20) + 'Q' + x + ' ' + (y - w * 0.7) + ' ' + (x + w) + ' ' + (y + 20) + 'Q' + x + ' ' + (y + 4) + ' ' + (x - w) + ' ' + (y + 20) + 'Z', col, ol(IN, 2.4));
        var rb = ''; for (var k = 1; k < 16; k++) { var tt = k / 16; rb += 'M' + x + ' ' + n(y - w * 0.32) + 'L' + n(x - w + 2 * w * tt) + ' ' + n(y + 20 - Math.sin(tt * Math.PI) * 12); }
        u += stroke(rb, IN, 1, op(0.5)) + circ(x, y - w * 0.33, 5, GO) + line(x, y + 12, x, y + 150, IN, 3) + '</g>';
        return u + path('M' + (x - 24) + ' ' + (y + 30) + 'Q' + (x - 30) + ' ' + (y + 140) + ' ' + (x - 26) + ' ' + (y + 200) + 'L' + (x + 26) + ' ' + (y + 200) + 'Q' + (x + 30) + ' ' + (y + 140) + ' ' + (x + 24) + ' ' + (y + 30) + 'Z', '#14141A', op(0.9));
      };
      s += umb(720, 330, 110, CI, 0) + umb(920, 340, 104, LA, -4.5) + ell(820, 560, 200, 20, '#0E1018', op(0.4));
    }
    return svgRoot(s, v);
  };
  FX.rain_street = '<div class="fx fx-rain"></div><div class="fx fx-rain fx-rain2"></div>';

  VARIANTS.phone = ['default']; TOD.phone = { 'default': 'tod-fire' };
  BG.phone = function (v) {
    var r = rnd(101), s = '', i;
    s += rect(0, 0, 1600, 900, '#3B2A20');
    var grain = ''; for (i = 0; i < 8; i++) grain += 'M0 ' + n(i * 120 + r() * 30) + 'Q800 ' + n(i * 120 + 40 + r() * 40) + ' 1600 ' + n(i * 120 - 10 + r() * 30);
    s += stroke(grain, '#4A3627', 3) + stroke(grain, '#2E2018', 1, op(0.6)) + circ(800, 420, 640, 'url(#amberGlow)', op(0.45));
    s += '<g transform="translate(1290 640) rotate(-28)">' + rect(-8, -140, 16, 120, IN) + path('M-8 -20L8 -20L4 10L0 22L-4 10Z', GOD, ol(IN, 1.4)) + line(0, -8, 0, 18, IN, 1) + '</g>'; // 钢笔笔尖
    return svgRoot(s, v);
  };

  VARIANTS.black = ['default']; TOD.black = { 'default': 'tod-night' };
  BG.black = function (v) { return svgRoot(rect(0, 0, 1600, 900, '#0B0B0D'), v); };
  FX.black = '<div class="fx fx-spark"></div>';

  VARIANTS.paper = ['default']; TOD.paper = { 'default': 'tod-day' };
  BG.paper = function (v, o) {
    o = o || {};
    var s = rect(0, 0, 1600, 900, PA), gut = nid('gut');
    s += rect(0, 0, 80, 900, 'url(#' + gut + ')');
    s += rect(110, 60, 1430, 780, 'none', ol(GO, 1.5)) + rect(116, 66, 1418, 768, 'none', ol(GO, 0.8));
    [[116, 66, 1, 1], [1534, 66, -1, 1], [116, 834, 1, -1], [1534, 834, -1, -1]].forEach(function (c) {
      s += '<g transform="translate(' + c[0] + ' ' + c[1] + ') scale(' + c[2] + ' ' + c[3] + ')">' + stroke('M6 90Q6 6 90 6M18 60Q30 30 60 18M30 30q24 -10 40 -2q-10 12 -22 8M30 30q-10 24 -2 40q12 -10 8 -22', GO, 2) + circ(30, 30, 5, CI) + '</g>';
    });
    s += kai(1500, 812, '△', 14, GO);
    s += '<g transform="translate(34 470) rotate(-10)">' + stroke('M0 0L0 -60', MEAS, 1.6) + path(dots([[-5, -62, 4], [5, -62, 4], [0, -68, 4], [0, -56, 4]]), FMN, op(0.8)) + '</g>';
    s += rect(150, 100, 96, 96, 'none', ol(GO, 2)) + rect(156, 106, 84, 84, 'none', ol(GO, 0.8) + ' stroke-dasharray="3 4"');
    if (o.plain) s += txt(198, 176, '明', 72, CI, ' stroke="' + GO + '" stroke-width="2" paint-order="stroke"' + cls('keep-gold'));
    return svgRoot(g(s, cls('fx-breathe-paper')), v, lgrad(gut, 0, 0, 1, 0, [[0, PAD, 0.9], [1, PAD, 0]]));
  };

  var bgCache = {};
  function variantOf(id, v) { var L = VARIANTS[id] || ['default']; return L.indexOf(v) >= 0 ? v : L[0]; }
  var PAINT = typeof location !== "undefined" && /[?&]paint=1/.test(location.search);  // 只在烘焙手绘底片时打开（?paint=1）
  function paintify(svg) {
    if (!PAINT || svg.indexOf('<svg') !== 0) return svg;
    var open = svg.indexOf('>') + 1, close = svg.lastIndexOf('</svg>');
    var inner = svg.slice(open, close).replace(/stroke="#1B1A1F"/g, 'stroke="#1B1A1F" stroke-opacity=".13"');
    var defsEnd = inner.indexOf('</defs>'), head = '', body = inner;
    if (inner.indexOf('<defs>') === 0 && defsEnd > 0) { head = inner.slice(0, defsEnd + 7); body = inner.slice(defsEnd + 7); }
    return svg.slice(0, open) + head + '<g transform="translate(800 450) scale(1.012) translate(-800 -450)"><g filter="url(#paintFx)">' + body + '</g></g>' +
      '<rect width="1600" height="900" fill="url(#paintLight)" style="mix-blend-mode:soft-light"/>' +
      '<rect width="1600" height="900" filter="url(#paintGrain)" style="mix-blend-mode:multiply" opacity=".5"/></svg>';
  }
  function bg(id, opts) {
    opts = opts || {};
    if (!BG[id]) id = 'paper';
    var tw = TOWER_BGS.indexOf(id) >= 0 && !opts.title ? towerOf(opts) : null;
    if (!tw && opts.tower) { opts = Object.assign({}, opts); delete opts.tower; }
    var v = variantOf(id, opts.v), key = id + '|' + v + (opts.plain ? '|p' : '') + (opts.bloom ? '|b' : '') + (opts.title ? '|t' : '') + (tw ? '|w' + tw.s + (tw.lit ? 'L' : '') : '');
    if (!bgCache[key]) bgCache[key] = paintify(BG[id](v, opts)) + (FX[id + '|' + v] || FX[id] || '');
    return bgCache[key];
  }
  function bgVariants(id) { return (VARIANTS[id] || ['default']).slice(); }
  function tod(id, v) { var t = TOD[id] || {}; return t[variantOf(id, v)] || 'tod-day'; }
  function titleArt() { return BG.lighthouse_hill('dusk', { title: true }); }

  var CH = {
    me: { main: '#243A5E', label: '栖', prop: 'bookbox' },
    yuan: { main: '#B5372A', label: '鸢', prop: 'kite' },
    qiu: { main: '#3E434C', label: '秋', prop: 'type' },
    cheng: { main: '#5D7486', label: '澄', prop: 'cap' },
    yan: { main: '#2F4A3A', label: '砚', prop: 'pole' },
    man: { main: '#5E8FC2', label: '满', prop: 'papers' },
    ye: { main: '#2F2F38', label: '野', prop: 'lantern' },
    geng: { main: '#8C7A5B', label: '庚', prop: 'scroll' },
    zhe: { main: '#7A4E2E', label: '折', prop: 'bird' },
    mom: { main: '#2E4A6B', label: '琴', prop: 'bowl' },
    dad: { main: '#6B5E4E', label: '山', prop: 'lamp' },
    critic: { main: '#1B1A1F', label: '钟', prop: 'monocle' },
    wolf: { main: WOLFI, label: '狼', prop: 'blades' }
  };
  var SEAL_COLORS = { me: '#243A5E', yuan: '#B5372A', qiu: '#6F7884', cheng: '#5D7486', yan: '#2F4A3A', man: '#5E8FC2', ye: '#6B4C8A', geng: '#8C7A5B', zhe: '#7A4E2E', mom: '#2E4A6B', dad: '#6B5E4E', critic: '#2A2830', wolf: '#4A5868' };
  var HS = 'translate(200 364) scale(.8) translate(-200 -332)'; // 头部比例（成年人）
  var SHOULDERS = 'M70 600Q76 438 150 404L250 404Q324 438 330 600Z';

  var IRIS = { me: '#3D5A8A', yuan: '#8A5A3A', qiu: '#6F86A8', man: '#4F86C2', ye: '#6B4C8A', yan: '#3F6B55', geng: '#B08A3A', cheng: '#5D7486', zhe: '#7A4E2E', mom: '#5A4A3E', dad: '#4A4038', critic: '#3A3440' };
  var EYE_IRIS = '#3D5A8A';
  function eyes(f, o) {
    o = o || {};
    var L = '#2A1E22', ey = 240, lx = 171, rx = 229, by = (o.browDy || 0) - 7, ir = EYE_IRIS, gid = 'ir' + ir.slice(1);
    var s = '<linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1A1420"/><stop offset=".35" stop-color="' + ir + '"/><stop offset=".85" stop-color="' + ir + '" stop-opacity=".75"/><stop offset="1" stop-color="#F4F0E8"/></linearGradient>';
    function white(x, side) { var o2 = side < 0 ? -1 : 1; return 'M' + (x - 12 * o2) + ' ' + (ey + 1) + 'Q' + (x - 2 * o2) + ' ' + (ey - 11) + ' ' + (x + 12 * o2) + ' ' + (ey - 2) + 'Q' + (x + 3 * o2) + ' ' + (ey + 10) + ' ' + (x - 12 * o2) + ' ' + (ey + 1) + 'Z'; }
    function brow(x1, y1, x2, y2) { return stroke('M' + x1 + ' ' + (y1 + by) + 'Q' + ((x1 + x2) / 2) + ' ' + (Math.min(y1, y2) - 3 + by) + ' ' + x2 + ' ' + (y2 + by), L, 2.6, op(0.85)); }
    function open(x, side, k) {
      k = k || {}; var cid = 'ec' + (side < 0 ? 'L' : 'R') + (k.lid != null ? 'l' : '') + (k.small ? 's' : ''), d = white(x, side), dx = k.look || 0, o2 = side < 0 ? -1 : 1;
      var r = k.small ? [4.8, 6.2] : [6.4, 8.4];
      var e = '<clipPath id="' + cid + '"><path d="' + d + '"/></clipPath>' + path(d, '#FFFDF8');
      e += '<g clip-path="url(#' + cid + ')">' + ell(x + dx, ey + 1, r[0], r[1], 'url(#' + gid + ')') + ell(x + dx, ey + 2, r[0] * .42, r[1] * .5, '#120C14') +
        circ(x + dx - 2.4, ey - 3, k.small ? 1.6 : 2.4, '#FFFFFF') + circ(x + dx + 2.6, ey + 3.6, 1.1, '#FFFFFF', op(0.85)) +
        path('M' + (x - 14) + ' ' + (ey - 12) + 'H' + (x + 14) + 'V' + (ey - 5) + 'Q' + x + ' ' + (ey - 1) + ' ' + (x - 14) + ' ' + (ey - 5) + 'Z', '#2A1E22', op(0.22));
      if (k.lid != null) e += path('M' + (x - 15) + ' ' + (ey - 14) + 'H' + (x + 15) + 'V' + (k.lid + (k.slant || 0) * o2) + 'L' + (x - 15) + ' ' + (k.lid - (k.slant || 0) * o2) + 'Z', SKIN);
      e += '</g>';
      var top = k.lid != null ? 'M' + (x - 13 * o2) + ' ' + (k.lid - (k.slant || 0) * o2 + 1) + 'L' + (x + 12 * o2) + ' ' + (k.lid + (k.slant || 0) * o2) : 'M' + (x + 12 * o2) + ' ' + (ey - 2) + 'Q' + (x - 2 * o2) + ' ' + (ey - 12) + ' ' + (x - 13 * o2) + ' ' + (ey + 1);
      e += stroke(top, L, 3.6) + stroke('M' + (x - 12 * o2) + ' ' + (ey + 1) + 'l' + (-4 * o2) + ' -3', L, 2.2);
      e += stroke('M' + (x - 8 * o2) + ' ' + (ey + 7) + 'Q' + x + ' ' + (ey + 10) + ' ' + (x + 7 * o2) + ' ' + (ey + 6), L, 1.2, op(0.55));
      return '<g transform="translate(' + x + ' ' + ey + ') scale(1.42) translate(' + (-x) + ' ' + (-ey) + ')">' + e + '</g>';
    }
    function closed(x, side, up) { var o2 = side < 0 ? -1 : 1; return '<g transform="translate(' + x + ' ' + ey + ') scale(1.35) translate(' + (-x) + ' ' + (-ey) + ')">' + stroke('M' + (x - 12) + ' ' + (ey + (up ? 3 : 0)) + 'q12 ' + (up ? -12 : 8) + ' 24 0', L, 3.6) + stroke('M' + (x - 12 * o2) + ' ' + (ey + (up ? 3 : 0)) + 'l' + (-4 * o2) + ' ' + (up ? 1 : -2), L, 2) + '</g>'; }
    switch (f) {
      case 'smile': s += closed(lx, -1, true) + closed(rx, 1, true) + brow(lx - 12, ey - 20, lx + 10, ey - 23) + brow(rx - 10, ey - 23, rx + 12, ey - 20); break;
      case 'soft': s += closed(lx, -1, false) + closed(rx, 1, false) + brow(lx - 12, ey - 18, lx + 10, ey - 20) + brow(rx - 10, ey - 20, rx + 12, ey - 18); break;
      case 'curious': s += open(lx, -1, { look: 2 }) + open(rx, 1, { look: 2 }) + brow(lx - 12, ey - 22, lx + 10, ey - 21) + brow(rx - 10, ey - 27, rx + 12, ey - 32); break;
      case 'annoyed': s += open(lx, -1, { lid: ey - 3, look: 3 }) + open(rx, 1, { lid: ey - 3, look: 3 }) + brow(lx - 12, ey - 14, lx + 10, ey - 11) + brow(rx - 10, ey - 11, rx + 12, ey - 14); break;
      case 'angry': s += open(lx, -1, { lid: ey - 3, slant: -3 }) + open(rx, 1, { lid: ey - 3, slant: -3 }) + brow(lx - 14, ey - 22, lx + 10, ey - 11) + brow(rx - 10, ey - 11, rx + 14, ey - 22); break;
      case 'sad': s += open(lx, -1, { lid: ey - 4, slant: 3 }) + open(rx, 1, { lid: ey - 4, slant: 3 }) + brow(lx - 12, ey - 13, lx + 10, ey - 22) + brow(rx - 10, ey - 22, rx + 12, ey - 13); break;
      case 'tired': s += open(lx, -1, { lid: ey + 1 }) + open(rx, 1, { lid: ey + 1 }) + stroke('M' + (lx - 10) + ' ' + (ey + 12) + 'q10 5 20 0M' + (rx - 10) + ' ' + (ey + 12) + 'q10 5 20 0', LA, 1.8, op(0.55)) + brow(lx - 12, ey - 15, lx + 10, ey - 18) + brow(rx - 10, ey - 18, rx + 12, ey - 15); break;
      case 'surprised': s += open(lx, -1, { small: true }) + open(rx, 1, { small: true }) + brow(lx - 12, ey - 30, lx + 10, ey - 33) + brow(rx - 10, ey - 33, rx + 12, ey - 30); break;
      default: s += open(lx, -1) + open(rx, 1) + brow(lx - 12, ey - 20, lx + 10, ey - 21) + brow(rx - 10, ey - 21, rx + 12, ey - 20);
    }
    return s + stroke('M203 262q2 5 -2 7', '#B98E7A', 1.6, op(0.7)); // 鼻梁一笔
  }
  var MOUTH = { neutral: 'M190 288L210 288', smile: 'M186 284q14 14 28 0', soft: 'M190 286q10 6 20 0', curious: 'M204 288a4 4 0 1 0 0.1 0', annoyed: 'M188 290L214 285', angry: 'M184 292l10 -8l10 8l10 -8l10 8', sad: 'M188 292q12 -10 24 0', tired: 'M188 288q6 -4 12 0q6 4 12 0', surprised: 'M200 282a7 10 0 1 0 0.1 0' };
  function mouth(f) { return stroke(MOUTH[f] || MOUTH.neutral, '#5A2E2E', 2.6) + (f === 'smile' ? ell(156, 266, 11, 6, DROSE, op(0.4)) + ell(244, 266, 11, 6, DROSE, op(0.4)) : ''); }
  function earsN() { return ell(128, 244, 9, 15, SKIN, ol(IN, 2.2)) + ell(272, 244, 9, 15, SKIN, ol(IN, 2.2)); }
  function rimAndShade(d) { // 一层边缘光（受光侧，0.35）+ 一层阴影叠色，读光照情境变量
    return g(path(d, 'none', ' stroke-width="8" style="stroke:var(--rim,#FFF7E6)"'), ' clip-path="url(#rimR)" opacity=".35" style="mix-blend-mode:screen"') +
      g(path(d, 'var(--shade,#1F3A6B)'), ' clip-path="url(#shadeL)" style="opacity:var(--shade-a,.14);mix-blend-mode:multiply"');
  }
  function noLines(s) { return s.replace(/<line[^>]*\/>/g, ''); }
  function halfMask() {
    return path('M126 206Q146 224 170 216Q188 210 200 222Q212 210 230 216Q254 224 274 206Q272 240 254 258Q230 272 208 258L200 250L192 258Q170 272 146 258Q128 240 126 206Z', LACE, ol(GO, 2.6)) +
      stroke('M142 222Q170 208 200 232Q230 208 258 222', GOD, 1.2, op(0.8)) +
      path('M158 238Q174 226 190 238Q174 248 158 238ZM210 238Q226 226 242 238Q226 248 210 238Z', IN, op(0.88)) + circ(180, 236, 1.8, PAH) + circ(232, 236, 1.8, PAH) +
      stroke('M277 214Q293 250 281 286Q273 314 291 344', CI, 6) + stroke('M273 214Q285 252 271 290Q263 318 275 350', '#8E2A18', 4) + circ(274, 210, 6.5, CI, ol(IN, 1.4));
  }
  function magicTip(x, y) {
    var r = rnd(29), inner = [], outer = [];
    for (var i = 0; i < 12; i++) {
      var a = i / 12 * Math.PI * 2 + r() * 0.35, near = i % 2 === 0, rr = near ? 16 + r() * 10 : 30 + r() * 14;
      (near ? inner : outer).push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.82, 1.5 + r() * 1.8]);
    }
    var orbit = function (pts, extra) { return '<g class="pt-orbit' + extra + '" style="transform-origin:' + x + 'px ' + y + 'px">' + path(dots(pts), MAGIC, ' stroke="' + WW + '" stroke-width=".6"') + '</g>'; };
    return circ(x, y, 38, 'url(#magicGlow)', cls('pt-magic-glow')) + circ(x, y, 4, WW) + orbit(inner, '') + orbit(outer, ' rev');
  }


  var HAIR = {
    me:     { col: '#24222C', len: 'short', bang: 212, n: 7, skew: 6, tail: true },
    yuan:   { col: '#4A2C24', len: 'bob', bang: 206, n: 9, skew: 0 },
    qiu:    { col: '#2E3038', len: 'short', bang: 214, n: 8, skew: -4, messy: true },
    cheng:  { col: '#2A2420', len: 'short', bang: 200, n: 7, skew: 3 },
    yan:    { col: '#2A2420', len: 'short', bang: 204, n: 6, skew: 8 },
    man:    { col: '#6B4A33', len: 'short', bang: 214, n: 8, skew: -2, messy: true, ahoge: true },
    geng:   { col: '#3A3F47', len: 'long', bang: 210, n: 8, skew: 0 },
    zhe:    { col: '#1E1C22', len: 'short', bang: 206, n: 7, skew: -5, messy: true },
    mom:    { col: '#3E3534', len: 'short', bang: 196, n: 6, skew: 10 },
    dad:    { col: '#5A5654', len: 'short', bang: 186, n: 5, skew: 6 },
    critic: { col: '#141318', len: 'short', bang: 178, n: 4, skew: 14 }
  };
  function animeHair(h, seed) {
    var r = rnd(seed || 7), c = h.col, hi = '#FFF4E6', back = '', front = '', i;
    var bottom = h.len === 'long' ? 470 : (h.len === 'bob' ? 304 : 250);
    var tips = '', x0 = 116, x1 = 284, nt = h.len === 'short' ? 6 : 9;
    for (i = 0; i <= nt; i++) { var tx = x0 + (x1 - x0) * i / nt, ty = bottom + (i % 2 ? -18 : 0) + (r() - 0.5) * 10; tips += 'L' + n(tx) + ' ' + n(ty); }
    back = path('M118 220Q108 122 200 112Q292 122 282 220L284 ' + bottom + tips.replace(/^L[^L]*/, '').split('L').reverse().filter(Boolean).map(function (p, k) { return (k ? 'L' : 'L') + p; }).join('') + 'L116 ' + bottom + 'Z', c, ol(IN, 2));
    if (h.tail) back += path('M262 236Q300 262 292 318L276 300Q284 266 252 248Z', c, ol(IN, 1.8));
    front += path('M126 214Q122 132 200 122Q278 132 274 214L262 190Q236 156 200 154Q164 156 138 190Z', c, ol(IN, 2));
    var nb = h.n, L = 132, Rr = 268, w = (Rr - L) / nb, top = 150;
    front += path('M134 196Q200 172 266 196L264 160Q200 140 136 160Z', c);
    for (i = 0; i < nb; i++) {
      var a = L + i * w, b2 = a + w, mid = (a + b2) / 2, tipY = h.bang - 10 + (r() - 0.5) * 12 + (h.messy ? (i % 2 ? -10 : 6) : 0) - Math.abs(mid - 200) * 0.08;
      var sk = h.skew + (h.messy ? (r() - 0.5) * 12 : 0);
      front += path('M' + n(a - w * 0.45) + ' ' + top + 'Q' + n(a - w * 0.1 + sk * 0.3) + ' ' + n((top + tipY) / 2 + 4) + ' ' + n(mid + sk) + ' ' + n(tipY) + 'Q' + n(b2 + w * 0.1 + sk * 0.3) + ' ' + n((top + tipY) / 2 + 4) + ' ' + n(b2 + w * 0.45) + ' ' + top + 'Z', c, ' stroke="' + IN + '" stroke-width="1.1" stroke-opacity=".6"');
    }
    var sl = h.len === 'short' ? 262 : 292;
    front += path('M130 196Q124 236 134 ' + sl + 'Q140 236 146 204Z', c, ol(IN, 1.6)) + path('M270 196Q276 236 266 ' + sl + 'Q260 236 254 204Z', c, ol(IN, 1.6));
    front += stroke('M150 168Q200 150 250 168', hi, 5, op(0.3)) + stroke('M158 176Q200 162 242 176', hi, 2, op(0.22));
    if (h.ahoge) front += stroke('M204 124q6 -26 22 -22q-12 4 -14 20', c, 4);
    return { back: back, front: front };
  }
  var BODYFORM = '<path d="M112 452Q96 520 102 600M288 452Q304 520 298 600" fill="none" stroke="#1B1A1F" stroke-opacity=".35" stroke-width="2.2"/>' +
    '<path d="M112 452Q100 520 104 600L132 600Q122 520 128 462Z M288 452Q300 520 296 600L268 600Q278 520 272 462Z" fill="#140C14" fill-opacity=".16"/>' +
    '<path d="M160 410Q200 446 240 410L246 432Q200 470 154 432Z" fill="#140C14" fill-opacity=".12"/>';
  function dropFirstPath(str) { return (str || '').replace(/^<path[^>]*\/>/, ''); }
  function build(id, f, o) {
    o = o || {};
    var b = { tilt: f === 'curious' ? 'rotate(-5 200 300)' : (f === 'sad' ? 'translate(0 6)' : (f === 'tired' ? 'translate(0 8)' : '')) };
    EYE_IRIS = IRIS[id] || '#3D5A8A';
    var e = eyes(f), m = mouth(f), hair;
    switch (id) {
      case 'me': // ①左肩上方的书箱 ②立领长外套 ③耳后羽毛笔；叶形翠绿小胸针
        b.back = rect(250, 150, 100, 150, WOOD, ol(IN, 3)) + path('M240 152L360 152L350 132L250 132Z', '#5A4636', ol(IN, 2.4)) + rect(252, 200, 96, 8, GOD) + rect(286, 230, 26, 18, GOD, ol(IN, 1.4)) + (f === 'angry' ? rect(250, 150, 100, 150, IN, op(0.35)) : '');
        b.body = path(SHOULDERS, '#243A5E', ol(IN, 3.2)) + path('M170 398L200 470L230 398L224 380L176 380Z', PAH, ol(IN, 2.2)) + path('M176 380L174 404L200 470L178 410Z', '#1C2C4A') +
          stroke('M200 470V600', IN, 1.6) + stroke('M190 492h20M190 522h20M190 552h20', GOD, 3) + path(dots([[200, 492, 3.4], [200, 522, 3.4], [200, 552, 3.4]]), GOD) +
          stroke('M128 440L284 600', '#5A4636', 9) + (f === 'tired' ? stroke('M176 384L190 400', PAH, 3) : '') + rimAndShade(SHOULDERS);
        b.front = line(150, 520, 150, 556, '#B86A5A', 2) + rect(139, 556, 22, 22, CI, ol(IN, 2)) + txt(150, 573, '韩', 14, PAH) +
          '<g transform="translate(222 400) rotate(-30)">' + path('M0 -9Q7 0 0 9Q-7 0 0 -9Z', G_EME, ol(GOD, 2)) + line(0, -7, 0, 7, '#9FE0BE', 1) + '</g>';
        hair = IN;
        b.hairBack = path('M128 236Q118 130 200 120Q284 126 274 236L262 192Q232 160 200 162Q164 162 140 196Z', hair, ol(IN, 2.6)) + path('M260 196Q300 220 292 270L280 268Q282 230 256 214Z', hair, ol(IN, 2));
        b.hair = path('M136 196Q150 140 202 138Q252 140 266 196Q236 172 214 182L204 160L190 184Q160 176 136 196Z', hair, ol(IN, 2.2)) +
          stroke(f === 'sad' ? 'M176 180Q170 220 178 250M222 180Q228 222 220 252' : 'M176 182Q168 206 172 228M222 182Q230 206 226 228', hair, 3.4) + rect(196, 132, 34, 8, '#8C7A5B', ' transform="rotate(-12 213 136)"') +
          (f === 'tired' ? stroke('M210 140q10 -20 24 -18', hair, 3) : '');
        b.extra = f === 'curious' ? quillPen(300, 560, -30, 0.8) : (f === 'surprised' ? quillPen(292, 280, 18, 0.7) : quillPen(280, 234, 22, 0.66));
        if (f === 'smile' && !o.after) { b.e = eyes('neutral'); b.m = stroke('M188 286q12 6 24 -2', IN, 3.4); } // 真结局之前：嘴角上扬，眼睛不变
        else if (f === 'neutral') { b.e = e; b.m = stroke('M188 289h24', IN, 3.6); }
        else { b.e = e; b.m = m; }
        break;
      case 'yuan': // ①朱红斗篷（背后两个尖角，像一只风筝）②背上的海图卷筒 ③腰间裁布剪；软尺当发带
        b.back = '<g transform="rotate(-24 120 400)">' + rect(70, 250, 34, 260, PAH, ol(IN, 2.4)) + ell(87, 250, 17, 7, PAD, ol(IN, 2)) + rect(70, 300, 34, 10, LA) + '</g>';
        b.body = path(f === 'angry' ? 'M200 600L40 600L10 640L70 590L58 556Q70 470 140 404L260 404Q330 470 342 556L330 590L390 640L360 600Z' : 'M200 600L50 600L40 640L90 600L60 560Q70 470 140 404L260 404Q330 470 340 560L310 600L360 640L350 600Z', '#B5372A', ol(IN, 3.2)) +
          path('M164 404L236 404L230 600L170 600Z', LA, ol(IN, 2)) + path('M180 404L220 404L210 440L200 450L190 440Z', PAH, ol(IN, 1.6)) +
          path('M140 404Q200 440 260 404Q250 430 200 446Q150 430 140 404Z', '#8E2A18', ol(IN, 2.2)) + stroke('M112 560q20 10 40 0M248 560q20 10 40 0', GOH, 2) + rimAndShade(SHOULDERS);
        b.front = stroke('M180 404L200 466L220 404', GOD, 1.6) + circ(200, 478, 16, GO, ol(IN, 2)) + circ(200, 478, 11, PAH, ol(IN, 1.2)) + path('M200 469L203 478L200 487L197 478Z', CI) +
          (f === 'surprised' ? '<g transform="translate(300 420) rotate(-40)">' : '<g transform="translate(262 566) rotate(28)">') + circ(0, 0, 8, 'none', ol(GOD, 3.2)) + circ(16, 0, 8, 'none', ol(GOD, 3.2)) + path('M4 -7L13 -54L11 -7ZM13 -7L7 -54L16 -7Z', '#B9C2CC', ol(IN, 1.2)) + '</g>' +
          (f === 'curious' ? path('M222 330q10 -6 18 2l-4 14q-8 -4 -14 -6Z', SKIN, ol(IN, 2)) : '');
        hair = '#4A2C24';
        b.hairBack = path('M122 300Q106 132 200 120Q296 132 280 300L256 300L262 214L140 214L146 300Z', hair, ol(IN, 2.6));
        b.hair = path('M132 212Q138 140 202 136Q264 140 270 212Q232 176 200 190Q170 176 132 212Z', hair, ol(IN, 2.2)) +
          (f === 'tired' ? stroke('M268 250Q290 290 276 340', hair, 6) : stroke('M268 250Q282 280 274 316', hair, 6) + stroke('M268 252Q282 282 274 318', '#F3EBD8', 2.4, ' stroke-dasharray="3 3"'));
        if (f === 'neutral') { b.e = stroke('M163 238q11 -5 22 0M215 238q11 -5 22 0', IN, 3.6) + line(162, 216, 184, 214, IN, 3) + line(216, 214, 238, 216, IN, 3); b.m = stroke('M188 286q12 5 24 0', IN, 3.2); } // 礼仪脸
        else if (f === 'smile') { b.e = eyes('smile'); b.m = stroke('M184 286q14 12 32 -6', IN, 3.4) + path('M196 290h10v3h-10Z', PAH) + ell(156, 266, 11, 6, DROSE, op(0.45)) + ell(244, 266, 11, 6, DROSE, op(0.45)); } // 不对称的真笑
        else if (f === 'annoyed') { b.e = stroke('M163 238q11 -5 22 0M215 238q11 -5 22 0', IN, 3.6) + line(200, 206, 200, 222, IN, 2.4) + line(162, 214, 184, 218, IN, 3) + line(216, 218, 238, 214, IN, 3); b.m = stroke('M188 286q12 5 24 0', IN, 3.2); } // 笑着生气
        else if (f === 'soft') { b.e = stroke('M166 238q10 6 20 0M218 238q10 6 20 0', IN, 3.4) + circ(184, 238, 2.4, IN) + circ(236, 238, 2.4, IN); b.m = mouth('soft'); }
        else { b.e = e; b.m = m; }
        if (f === 'sad') b.faceShift = 'translate(-6 4)';
        if (o.mask) b.mask = halfMask(); // 第 2 章假面舞会
        break;
      case 'qiu': // ①高到下巴的长围巾（两条长尾）②胸前铅字盒 ③冰晶边线；记号是反字铅字「明」
        b.body = path(SHOULDERS, '#3E434C', ol(IN, 3.2)) + path('M232 420L262 420L270 590L240 590Z M140 420L170 420L162 570L134 570Z', '#D9DCDD', ol(IN, 2.2)) + rimAndShade(SHOULDERS);
        b.front = '<g transform="translate(0 ' + (f === 'tired' ? 40 : 0) + ') rotate(' + (f === 'curious' ? -14 : (f === 'tired' ? 6 : -4)) + ' 200 540)">' + rect(122, 512, 156, 60, WOODD, ol(IN, 2.6)) + stroke('M161 512v60M200 512v60M239 512v60M122 542h156', WOODK, 2) +
          path(rects([[130, 518, 6, 16], [140, 518, 6, 16], [208, 548, 6, 16], [248, 520, 6, 16], [258, 520, 6, 16]]), LA) + '</g>' +
          (f === 'surprised' ? rect(196, 470, 8, 18, LA, ol(IN, 1)) : '') + path('M134 520q10 -14 24 -8v18ZM266 520q-10 -14 -24 -8v18Z', SKIN, ol(IN, 2)) +
          '<g transform="translate(262 470) scale(-1 1)">' + rect(-10, -12, 20, 24, '#8E959E', ol(IN, 1.4)) + txt(0, 6, '明', 15, IN) + '</g>';
        hair = '#2E3038';
        b.hairBack = path('M130 260Q116 130 200 120Q286 130 272 260Z', hair, ol(IN, 2.6));
        b.hair = path('M134 214L146 160L160 176L176 140L196 168L212 132L226 166L246 142L254 176L268 160L272 214Q232 180 200 186Q164 182 134 214Z', hair, ol(IN, 2.2));
        var sy = f === 'annoyed' ? 252 : (f === 'soft' ? 290 : 276);
        b.scarf = path('M126 ' + sy + 'Q200 ' + (sy - 14) + ' 274 ' + sy + 'L282 350Q200 380 118 350Z', '#D9DCDD', ol(IN, 2.4)) + stroke('M136 ' + (sy + 22) + 'Q200 ' + (sy + 8) + ' 264 ' + (sy + 22) + 'M132 ' + (sy + 44) + 'Q200 ' + (sy + 30) + ' 268 ' + (sy + 44), '#BFC4C7', 2);
        b.e = f === 'neutral' ? stroke('M163 238h22M215 238h22', IN, 4) + path('M166 240a8 5 0 0 0 16 0Z', IN) + path('M218 240a8 5 0 0 0 16 0Z', IN) + line(162, 218, 184, 218, IN, 3) + line(216, 218, 238, 218, IN, 3) : e;
        b.m = f === 'soft' ? stroke('M206 284q8 4 14 0', IN, 3) : '';
        b.ice = path('M64 600Q72 436 148 400L182 362L130 296Q100 128 200 108Q300 128 270 296L218 362L252 400Q328 436 336 600', 'none', ' stroke="' + FROST + '" stroke-width="' + (f === 'angry' ? 5 : 3.4) + '" stroke-dasharray="' + (f === 'angry' ? '6 3' : '14 6 3 6') + '"' + cls('fx-ice' + (f === 'angry' ? ' fast' : '')) + op(0.95));
        if (f === 'sad') b.ice += path('M58 520l8 12l-4 10ZM330 470l10 6l-6 12Z', FROST, op(0.8) + cls('fx-fall'));
        break;
      case 'cheng': // ①高领短披肩的方折线 ②平顶帽（黄铜号牌「07」）③肩上的信鸽；公证簿夹着几条书签带
        b.body = path(SHOULDERS, PAH, ol(IN, 3)) + path('M100 470L120 410L176 392L176 360L224 360L224 392L280 410L300 470Q200 500 100 470Z', '#5D7486', ol(IN, 3)) + stroke('M176 362V392M224 362V392', '#4A5E6E', 3) + path(dots([[200, 430, 3.4], [200, 456, 3.4]]), GOD) + rimAndShade(SHOULDERS);
        b.front = (f === 'angry' ? rect(120, 500, 120, 30, '#3E5466', ol(IN, 2.4)) : rect(120, 480, 130, 90, '#3E5466', ol(IN, 2.4)) + rect(126, 486, 118, 78, PAH)) +
          path(rects([[246, 476, 4, 30], [234, 476, 4, 34], [228, 476, 4, 22]]), CI) + path(rects([[240, 476, 4, 26]]), LA) + rect(150, 586, 40, 14, '#B5372A', ol(IN, 1.4)) +
          (f === 'curious' ? path('M260 380q4 -40 20 -44q14 0 12 14v36Z', SKIN, ol(IN, 2.2)) : '') + (f === 'annoyed' ? line(212, 470, 228, 530, IN, 3) : '');
        b.extra = path(f === 'sad' ? 'M268 396q-6 -22 14 -26q20 2 22 18q-14 10 -36 8Z' : 'M262 396q-4 -28 18 -34q16 -4 22 8q4 18 -8 26Z', '#D9DCDD', ol(IN, 2)) + circ(286, 372, 2.4, IN) + path('M300 372l10 2l-10 4Z', GOD) +
          (f === 'surprised' ? path('M276 380q-30 -40 -50 -20q20 0 30 30Z M290 376q20 -44 46 -32q-22 4 -30 34Z', '#D9DCDD', ol(IN, 1.6)) : '');
        hair = '#2A2420';
        b.hairBack = path('M134 270Q124 140 200 130Q276 140 266 270L250 262L254 200L146 200L150 262Z', hair, ol(IN, 2.4));
        b.hair = path('M138 210Q150 160 196 158L200 176L204 158Q252 160 262 210Q230 190 200 192Q170 190 138 210Z', hair, ol(IN, 2.2));
        b.cap = '<g transform="' + (f === 'tired' ? 'rotate(-8 200 140)' : (f === 'soft' ? 'translate(0 -8)' : '')) + '">' + path('M128 168L136 128L264 128L272 168Z', '#3E5466', ol(IN, 2.6)) + path('M122 168L278 168L286 182L114 182Z', '#2E4050', ol(IN, 2)) + rect(184, 136, 32, 22, GOD, ol(IN, 1.4)) + txt(200, 153, '07', 15, IN, '', "'DIN Condensed','Arial Narrow',sans-serif") + '</g>';
        b.e = e; b.m = f === 'smile' ? stroke('M190 288q10 4 20 -2', IN, 3) : m;
        if (f === 'annoyed') b.m += path('M250 210q6 10 0 14q-6 -4 0 -14Z', '#BFD4E8', ol(IN, 1));
        break;
      case 'yan': // ①竖握的长柄引灯杆 ②深绿围裙 ③腰间成串的钥匙；「准」印
        b.back = '<g transform="' + (f === 'curious' ? 'rotate(10 96 600)' : (f === 'surprised' ? 'rotate(-14 96 600)' : (f === 'annoyed' ? 'translate(0 20)' : ''))) + '">' + rect(90, 40, 10, 560, WOODK, ol(IN, 1.4)) + path('M86 40L104 40L108 16L82 16Z', GOD, ol(IN, 1.6)) + stroke('M95 16q0 -14 12 -14', GOD, 3) + '</g>';
        b.body = path(SHOULDERS, PAH, ol(IN, 3)) + stroke('M150 404L176 404L200 438L224 404L250 404', IW, 2) + path('M140 440L260 440L276 600L124 600Z', '#2F4A3A', ol(IN, 3)) +
          stroke('M140 444L118 412M260 444L282 412', '#2F4A3A', 6) + rect(110, 470, 30, 26, '#E7D8B9', ol(IN, 1.6)) + rect(260, 470, 30, 26, '#E7D8B9', ol(IN, 1.6)) + rimAndShade(SHOULDERS);
        b.front = path('M96 520q16 -10 30 0l-2 20q-14 6 -26 -4Z', SKIN, ol(IN, 2)) +
          '<g transform="translate(0 ' + (f === 'tired' ? 20 : 0) + ')">' + circ(250, 500, 12, 'none', ol(GOD, 3.4)) + stroke('M244 510v28h6M256 510v22h6M262 506l10 22l5 -3', GOD, 3.2) + '</g>' +
          (f === 'sad' ? stroke('M210 500l6 14', CI, 1.6) : line(214, 498, 214, 512, CI, 1.6) + rect(204, 512, 20, 20, CI, ol(IN, 1.4)) + txt(214, 527, '准', 13, PAH)) +
          (f === 'angry' ? rect(280, 430, 26, 80, '#5A2E24', ol(IN, 2)) : '<g transform="rotate(10 300 470)">' + rect(282, 420, 30, 96, '#5A2E24', ol(IN, 2.2)) + '</g>');
        hair = '#2A2420';
        b.hairBack = path('M138 220Q132 134 200 128Q268 134 262 220Z', hair, ol(IN, 2.4));
        b.hair = path('M138 198Q146 140 204 138Q256 142 262 196Q240 168 204 172Q166 170 138 198Z', hair, ol(IN, 2.2)) + stroke('M150 186L250 160', '#4A403A', 1.4, op(0.6));
        b.e = f === 'neutral' ? noLines(eyes('neutral')) + line(162, 214, 184, 220, IN, 3.4) + line(216, 216, 238, 216, IN, 3.4) : (f === 'soft' ? noLines(eyes('neutral')) + line(164, 212, 186, 218, IN, 3.4) + line(214, 218, 236, 212, IN, 3.4) : e);
        b.m = f === 'smile' ? stroke('M190 288L206 288q6 -2 10 -8', IN, 3.2) : m;
        break;
      case 'man': // ①学院短披肩的半圆 ②一摞往外支纸的笔记 ③身后速度线；发夹上插一根白鸽羽
        b.back = stroke('M40 300q40 -20 70 10M30 360q46 -20 80 12M44 420q40 -16 66 10', MI, 4, op(0.7));
        b.body = path(SHOULDERS, PAH, ol(IN, 3)) + path('M96 470Q100 420 150 400L250 400Q300 420 304 470Q200 506 96 470Z', '#5E8FC2', ol(IN, 3)) + stroke('M98 468Q200 502 302 468', '#E9B04A', 4) +
          stroke('M150 404L250 560', '#8C6A40', 5) + rect(236, 540, 46, 40, '#8C6A40', ol(IN, 1.6)) + rimAndShade(SHOULDERS);
        if (f === 'surprised') b.front = [[110, 360, -20], [160, 330, 14], [240, 340, -8], [290, 380, 22], [190, 300, 4], [80, 430, 30]].map(function (p) { return '<g transform="translate(' + p[0] + ' ' + p[1] + ') rotate(' + p[2] + ')">' + rect(-26, -18, 52, 36, PAH, ol(IN, 1.4)) + stroke('M-18 -8h36M-18 2h30M-18 12h34', IW, 1.2) + '</g>'; }).join('');
        else {
          var sy2 = f === 'tired' ? 24 : 0, ps = [];
          for (var q = 0; q < 6; q++) ps.push([130 + (q % 2) * 6, 480 + q * 16 + sy2, 140, 14]);
          b.front = path(rects(ps), PAH, ol(IN, 1.4)) + rect(126, 470 + sy2, 150, 12, CI, ol(IN, 1.4)) + path('M262 486l20 -14l4 6l-20 14Z', PAH, ol(IN, 1.2)) +
            (f === 'tired' ? '<g transform="translate(300 420) rotate(24)">' + rect(-24, -16, 48, 32, PAH, ol(IN, 1.4)) + '</g>' : '') + path('M120 520q-14 30 10 46l20 -8ZM282 520q14 30 -10 46l-20 -8Z', SKIN, ol(IN, 2));
        }
        hair = '#6B4A33';
        b.hairBack = path('M130 240Q120 134 200 124Q282 132 272 240Z', hair, ol(IN, 2.4));
        b.hair = path('M132 212L144 160L158 178L172 142L192 170L208 132L224 168L242 142L252 178L266 160L272 212Q230 180 200 184Q160 182 132 212Z', hair, ol(IN, 2.2)) +
          stroke(f === 'sad' ? 'M206 132q10 10 18 24' : 'M206 132q-6 -26 14 -34', hair, 4) + path('M244 150l20 -6l2 8l-20 6Z', '#E9B04A', ol(IN, 1)) + path('M256 146q14 -24 28 -30q-6 18 -24 34Z', PAH, ol(IN, 1));
        b.e = e;
        b.m = f === 'neutral' ? path('M192 284q8 8 16 0Z', IN) : (f === 'annoyed' ? stroke('M190 288h20', IN, 3) + ell(160, 268, 12, 9, DROSE, op(0.4)) + ell(240, 268, 12, 9, DROSE, op(0.4)) : (f === 'smile' ? stroke('M184 282q16 18 32 0', IN, 3.4) + ell(156, 266, 14, 8, DROSE, op(0.5)) + ell(244, 266, 14, 8, DROSE, op(0.5)) : m));
        break;
      case 'ye': // ①向前伸的小提灯（自带暖光）②高领长外套，下摆外扩 ③压低的兜帽；全身唯一的紫是手套，不配绿
        var la = f === 'curious' ? 'translate(-30 -10)' : (f === 'soft' ? 'translate(40 -60)' : (f === 'annoyed' ? 'translate(-60 10)' : (f === 'surprised' ? 'rotate(8 90 440)' : '')));
        b.body = path('M54 600Q70 438 150 400L250 400Q330 438 346 600Z', '#2F2F38', ol(IN, 3.2)) + path('M168 384L170 420L200 446L230 420L232 384Z', '#26262E', ol(IN, 2)) + path(dots([[200, 470, 3.4], [200, 500, 3.4], [200, 530, 3.4]]), IN, ol('#55525E', 1)) +
          stroke('M120 440L282 556', '#5A3E2A', 8) + rimAndShade(SHOULDERS);
        b.front = ['#D29A3A', '#EDE7DA', '#D29A3A'].map(function (c, k) { var x = 150 + k * 22, y = 468 + k * 16; return '<g transform="rotate(-34 ' + x + ' ' + y + ')">' + rect(x - 5, y - 14, 10, 24, c, ol(IN, 1.4)) + rect(x - 3, y - 20, 6, 6, WOODK) + '</g>'; }).join('') +
          '<g transform="' + la + '">' + circ(92, 440, 90 * (f === 'angry' ? 0.6 : 1), 'url(#amberGlow)', op(0.9)) + line(104, 474, 98, 420, IN, 2) + path('M80 420L112 420L116 462L76 462Z', AM, ol(IN, 2.2)) + path('M76 420L96 402L116 420Z', IN) + rect(76, 462, 40, 6, IN) +
          path('M96 482Q104 456 128 458L138 496Q120 516 100 508Z', '#6B4C8A', ol(IN, 2.2)) + '</g>' + (f === 'tired' ? path('M250 560q10 -20 30 -14l6 16q-16 10 -32 6Z', '#6B4C8A', ol(IN, 1.8)) : '');
        b.hairBack = path('M116 300Q104 120 200 108Q296 120 284 300L262 330L138 330Z', '#2F2F38', ol(IN, 2.6));
        b.hair = path(f === 'sad' ? 'M124 248Q130 124 200 118Q270 124 276 248Q240 222 200 230Q160 222 124 248Z' : 'M124 218Q130 124 200 118Q270 124 276 218Q240 196 200 200Q160 196 124 218Z', '#2F2F38', ol(IN, 2.4)) + stroke('M150 206q50 -20 100 0', '#3A3A44', 2);
        b.e = f === 'sad' ? '' : (f === 'smile' ? eyes('soft') : e);
        b.m = f === 'neutral' ? stroke('M190 288l20 -2', IN, 3) : (f === 'smile' ? stroke('M188 286q12 8 24 0', IN, 3) : m);
        if (f === 'annoyed') b.shadeFace = true;
        break;
      case 'geng': // ①超长卷轴（斜伸出头顶）②向后斜、尖端略垂的长耳 ③银色枯枝；泥金眼睛；磨平纹样的旧铜扣
        b.back = f === 'tired' ? '<g transform="rotate(8 330 560)">' + rect(316, 120, 32, 470, PAD, ol(IN, 2.4)) + ell(332, 120, 16, 7, '#D4C3A0', ol(IN, 2)) + rect(316, 200, 32, 8, CI) + '</g>' :
          '<g transform="rotate(32 260 360)">' + rect(244, -260, 32, 700, PAD, ol(IN, 2.4)) + ell(260, -260, 16, 7, '#D4C3A0', ol(IN, 2)) + rect(244, -180, 32, 8, CI) + rect(244, 300, 32, 8, CI) + '</g>';
        b.body = (o.fire ? path(SHOULDERS, '#D9CBB0', ol(IN, 3)) : path('M200 600L48 600Q58 466 140 400L260 400Q342 466 352 600Z', '#8C7A5B', ol(IN, 3.2)) +
          path('M150 400Q200 432 250 400L240 440Q200 456 160 440Z', '#7A6A4E', ol(IN, 2.2)) + rect(96, 520, 34, 28, '#7A6A4E', ol(IN, 1.4)) + rect(262, 480, 28, 24, '#6E5640', ol(IN, 1.4)) + circ(200, 436, 8, '#9C7A52', ol(IN, 1.6))) +
          stroke('M120 420L270 600', '#7A6A4E', 6) + rimAndShade(SHOULDERS);
        b.front = stroke('M120 600L150 470M138 520l-22 -20M144 494l20 -22M150 470l-10 -24M150 470l12 -18', '#C8CCD2', 4) + path('M128 540q-14 4 -18 18l20 4Z', SKIN, ol(IN, 2)) +
          (o.magic ? magicTip(150, 452) : circ(150, 452, 3, WW, op(0.9)));
        var ang = f === 'curious' || f === 'surprised' ? -8 : (f === 'angry' ? 14 : 0);
        b.ears = '<g transform="rotate(' + ang + ' 132 236)">' + path('M134 232L58 196Q52 202 60 208L132 250Z', SKIN, ol(IN, 2.4)) + '</g><g transform="rotate(' + (-ang) + ' 268 236)">' + path('M266 232L342 196Q348 202 340 208L268 250Z', SKIN, ol(IN, 2.4)) + '</g>';
        hair = '#3A3F47';
        b.hairBack = path('M128 300Q110 128 200 116Q290 128 272 300L252 300L258 212L142 212L148 300Z', hair, ol(IN, 2.6)) + stroke('M200 330L200 380', hair, 10);
        b.hair = path('M134 222Q140 136 204 132Q264 138 268 214Q248 168 200 162Q164 170 150 188L146 222Z', hair, ol(IN, 2.2));
        b.e = (f === 'soft' ? eyes('soft') : eyes('neutral', { browDy: f === 'surprised' ? -4 : 0 })).replace(/fill="#1B1A1F"/g, 'fill="' + GOD + '"');
        b.m = f === 'smile' ? stroke('M190 288L208 288l4 -2', IN, 3) : stroke('M190 288L210 288', IN, 3); // 他的「大笑」只有 2px
        if (f === 'sad' || f === 'annoyed') b.faceShift = 'translate(-10 0)';
        break;
      case 'zhe': // ①额上推起的黄铜放大目镜（一长一短）②皮围裙与卷袖 ③肩上的机关鸟；本人没有义肢
        b.body = path(SHOULDERS, PAH, ol(IN, 3)) + path('M150 404Q200 430 250 404L256 420Q200 450 144 420Z', '#4F7F73', ol(IN, 2.2)) + path('M140 440L260 440L280 600L120 600Z', '#7A4E2E', ol(IN, 3)) +
          stroke('M140 444L118 412M260 444L282 412', '#7A4E2E', 5) + rect(108, 470, 32, 26, '#E7D8B9', ol(IN, 1.4)) + rect(260, 470, 32, 26, '#E7D8B9', ol(IN, 1.4)) +
          rect(150, 540, 70, 26, '#5A3A22', ol(IN, 1.6)) + stroke('M160 540v-14M174 540v-18M188 540v-12', '#8E959E', 3) + rimAndShade(SHOULDERS);
        b.front = path('M112 500q14 -8 28 0l-2 18q-12 4 -24 -2Z', SKIN, ol(IN, 2)) + stroke('M116 504h20M116 510h20', PAH, 2) + (f === 'annoyed' ? stroke('M140 504L176 160', '#8E959E', 4) : '');
        var wing = f === 'angry' || f === 'surprised';
        b.extra = '<g transform="translate(0 ' + (f === 'surprised' ? -30 : 0) + ')">' + path('M258 400q0 -26 22 -32q20 -2 24 16q2 20 -20 24Z', GOD, ol(IN, 2)) + circ(292, 376, 2.6, IN) + path(f === 'sad' ? 'M300 386l8 12l-10 2Z' : 'M300 368l14 2l-14 6Z', OXIDE) +
          (wing ? path('M266 384q-34 -40 -56 -22q24 2 34 30ZM284 378q14 -46 44 -38q-22 6 -26 36Z', '#C0874A', ol(IN, 1.6)) : path('M262 392q-14 -10 -6 -24q10 8 18 16Z', '#C0874A', ol(IN, 1.4))) + rect(276, 404, 4, 12, IN) + circ(270, 392, 4, 'none', ol(IN, 1.2)) + '</g>' +
          (f === 'soft' ? path('M256 420q10 -14 26 -10l4 12q-14 8 -30 6Z', SKIN, ol(IN, 1.8)) : '');
        b.hairBack = path('M136 220Q130 136 200 130Q270 136 264 220Z', IN, ol(IN, 2.4));
        b.hair = path('M140 196Q150 146 200 144Q250 146 260 196Q230 182 200 182Q170 182 140 196Z', IN, ol(IN, 2)) + stroke('M150 184h100', '#3A3841', 1.2, ' stroke-dasharray="2 3"');
        var gy = f === 'curious' ? 236 : 168;
        b.goggles = '<g transform="' + (f === 'tired' ? 'rotate(8 200 ' + gy + ')' : '') + '">' + stroke('M128 ' + gy + 'H272', '#5A3A22', 6) + rect(150, gy - 16, 36, 30, GOD, ' rx="6"' + ol(IN, 2)) + rect(214, gy - 16, 30, 26, GOD, ' rx="6"' + ol(IN, 2)) +
          circ(168, gy, 11, f === 'curious' ? PAH : '#9FB4BF', ol(IN, 1.6)) + circ(229, gy - 3, 9, f === 'curious' ? PAH : '#9FB4BF', ol(IN, 1.6)) + (f === 'curious' ? circ(168, gy, 6, IN) + circ(229, gy - 3, 5, IN) : '') + '</g>';
        b.e = f === 'curious' ? '' : e;
        b.m = f === 'smile' ? path('M182 282q18 22 36 0Z', IN) + path('M188 284h24v4h-24Z', PAH) : m;
        break;
      case 'mom': // ①胸前一碗面（三缕汽）②白围裙 ③低发髻与木簪；靛蓝碎花布衫、袖套、口袋里一双筷子
        var hosp = f === 'tired';
        b.body = (hosp ? path(SHOULDERS, '#DCE4EA', ol(IN, 3)) + path('M96 470Q110 420 156 404L176 600L96 600Z M304 470Q290 420 244 404L224 600L304 600Z', '#9C8A7A', ol(IN, 2.4)) :
          path(SHOULDERS, '#2E4A6B', ol(IN, 3)) + path(dots([[120, 470, 2], [150, 520, 2], [260, 470, 2], [280, 530, 2], [110, 560, 2], [300, 570, 2], [140, 440, 2], [270, 430, 2]]), PAH) +
          path('M146 430Q200 446 254 430L270 600L130 600Z', '#F4F1EA', ol(IN, 2.6)) + stroke('M146 432Q140 410 158 404M254 432Q260 410 242 404', '#F4F1EA', 5) + stroke('M236 520l-8 -40M242 520l-4 -40', WOOD, 3) +
          rect(100, 500, 40, 40, '#3E5A7B', ol(IN, 1.4)) + rect(260, 500, 40, 40, '#3E5A7B', ol(IN, 1.4))) + rimAndShade(SHOULDERS);
        if (!hosp) {
          var steam = f === 'sad' ? '' : stroke('M176 500q-12 -22 4 -40q14 -18 -2 -40M206 496q-10 -20 4 -36q12 -16 -2 -34M232 502q-8 -16 4 -30', PAH, 3.2, op(0.85) + cls('fx-steam'));
          b.front = '<g transform="' + (f === 'soft' ? 'translate(200 520) scale(1.12) translate(-200 -520)' : '') + '">' + path('M130 520Q200 600 270 520Z', PAH, ol(IN, 2.6)) + stroke('M140 536h120M150 552h100', LA, 2) + ell(200, 520, 70, 12, '#E8D4A0', ol(IN, 2)) + stroke('M170 516q10 -6 20 0q10 6 20 0M180 522q10 -6 22 0', GOD, 1.6) + steam + '</g>' +
            (f === 'annoyed' ? path('M290 470q20 10 16 40l-16 6Z', SKIN, ol(IN, 2)) : '') + (f === 'angry' ? stroke('M250 470L330 380M256 474L336 386', WOOD, 3) : '') +
            path('M112 530q-10 22 14 30l14 -18ZM288 530q10 22 -14 30l-14 -18Z', SKIN, ol(IN, 2));
        } else b.front = path('M150 530q50 -20 100 0q-10 16 -50 16q-40 0 -50 -16Z', SKIN, ol(IN, 2)); // 医馆版：没有碗，手还是捧着的姿势
        hair = '#3E3534';
        b.hairBack = path('M130 230Q124 128 200 120Q276 128 270 230Z', hair, ol(IN, 2.4)) + circ(200, 330, 30, hair, ol(IN, 2)) + line(170, 320, 236, 340, WOOD, 3);
        b.hair = path('M136 202Q150 144 200 140Q252 144 264 202Q234 170 200 172Q166 170 136 202Z', hair, ol(IN, 2.2)) + stroke('M160 170Q180 150 210 148', '#9A9496', 3);
        b.e = f === 'curious' ? stroke('M163 238h22M215 238h22', IN, 4) + line(162, 220, 184, 222, IN, 3) + line(216, 222, 238, 220, IN, 3) : (f === 'smile' ? eyes('smile') + stroke('M146 240l-8 -4M146 246l-8 2M254 240l8 -4M254 246l8 2', IN, 1.6) : (f === 'surprised' ? eyes('neutral', { browDy: -10 }) : e));
        b.m = f === 'smile' ? path('M182 280q18 22 36 0Z', IN) + path('M188 282h24v3h-24Z', PAH) : m;
        if (f === 'sad') b.faceShift = 'translate(0 8)';
        break;
      case 'dad': // ①微微前倾的宽肩 ②鼓鼓的工具袋 ③右手低提一盏亮着的灯；九张脸几乎一样
        b.body = path('M54 600Q60 430 146 396L254 396Q340 430 346 600Z', '#6B5E4E', ol(IN, 3.2)) + stroke('M170 396L200 450L230 396', '#5A4E40', 3) + rect(110, 520, 70, 60, '#5A4636', ol(IN, 2.4)) + stroke('M120 520v-16M140 520v-22M160 520v-14', '#8E959E', 3) +
          rect(240, 470, 24, 10, '#C9C1B0', ol(IN, 1)) + rimAndShade(SHOULDERS);
        b.front = '<g transform="translate(0 ' + (f === 'soft' ? -10 : (f === 'tired' ? 20 : 0)) + ')">' + circ(300, 540, 80, 'url(#amberGlow)') + line(300, 480, 300, 504, IN, 2) + path('M282 504L318 504L322 560L278 560Z', AM, ol(IN, 2.4)) + path('M278 504L300 486L322 504Z', GOD, ol(IN, 1.8)) + rect(276, 560, 48, 8, GOD, ol(IN, 1.4)) + path('M286 470q14 -6 28 0l-2 14q-12 4 -24 0Z', SKIN, ol(IN, 2)) + '</g>' +
          (f === 'curious' ? '' : (f === 'annoyed' ? circ(232, 472, 7, 'none', ol(IN, 1.4)) + circ(254, 472, 7, 'none', ol(IN, 1.4)) : stroke('M180 404q20 30 40 0', IN, 1.2) + circ(188, 430, 8, 'none', ol(IN, 1.4)) + circ(212, 430, 8, 'none', ol(IN, 1.4))));
        b.hairBack = path('M136 214Q130 132 200 126Q270 132 264 214Z', '#5A5654', ol(IN, 2.4));
        b.hair = path('M140 196Q152 146 200 144Q248 146 260 196Q230 176 200 176Q170 176 140 196Z', '#5A5654', ol(IN, 2.2)) + stroke('M140 196q-2 -20 6 -30M260 196q2 -20 -6 -30', '#B9B6B2', 4);
        var dd = f === 'angry' ? 2 : (f === 'surprised' ? -2 : 0);
        b.e = stroke('M163 238h22M215 238h22', IN, 4) + line(162, 218 + dd, 184, 218 + dd, IN, 3.4) + line(216, 218 + dd, 238, 218 + dd, IN, 3.4) + (f === 'smile' ? stroke('M240 242l8 4', IN, 1.6) : '') +
          (f === 'curious' ? circ(174, 238, 13, 'none', ol(IN, 1.8)) + circ(226, 238, 13, 'none', ol(IN, 1.8)) + line(187, 238, 213, 238, IN, 1.6) : '');
        b.m = stroke('M190 290h20', IN, 3.4) + stroke('M180 304q20 -8 40 0', '#8C8A88', 4);
        if (f === 'sad') b.faceShift = 'translate(10 0)';
        b.lean = 'translate(-6 0) rotate(-2 200 600)';
        break;
      default: // critic：单片眼镜、高领礼服、朱红领巾
        b.body = path(SHOULDERS, IN, ol('#000', 3.2)) + path('M160 404L200 520L240 404', '#2C2A30', ol('#000', 2)) + path('M182 400L218 400L212 440L200 470L188 440Z', CI, ol(IN, 2)) + rimAndShade(SHOULDERS);
        b.hairBack = path('M130 220Q124 124 206 118Q280 124 272 214Z', '#141318', ol(IN, 2.4));
        b.hair = path('M136 200Q140 138 210 134Q262 140 268 196Q240 160 196 170Q160 178 136 200Z', '#141318', ol(IN, 2.2));
        b.e = e + circ(226, 236, 18, FROST, ' fill-opacity=".25"' + ol(GO, 3.4)) + stroke('M244 240Q272 300 250 400', GO, 1.6);
        b.m = m;
    }
    if (HAIR[id]) { var hh = animeHair(HAIR[id], id.length * 7 + id.charCodeAt(0)); b.hairBack = hh.back + dropFirstPath(b.hairBack); b.hair = hh.front + dropFirstPath(b.hair); }
    return b;
  }

  function stickFig(id, f) { // 崩坏「简笔」：圆头、两点眼、一条身体线，加上这个角色的一个标志道具
    var s = '<g fill="none" stroke="' + IN + '" stroke-width="5" stroke-linecap="round"><circle cx="200" cy="250" r="60" fill="' + PAH + '"/><path d="M200 310V500M200 380L140 440M200 380L260 440M200 500L160 580M200 500L240 580"/></g>' +
      circ(180, 246, 5, IN) + circ(220, 246, 5, IN) + (f === 'smile' || f === 'soft' ? stroke('M184 272q16 12 32 0', IN, 4) : (f === 'sad' || f === 'tired' ? stroke('M184 280q16 -10 32 0', IN, 4) : stroke('M190 276h20', IN, 4)));
    switch (CH[id] && CH[id].prop) {
      case 'bookbox': s += rect(250, 180, 70, 90, WOOD, ol(IN, 4)) + quillPen(150, 200, -20, 0.6); break;
      case 'kite': s += path('M300 250L340 300L300 370L260 300Z', CI, ol(IN, 4)) + stroke('M300 370q20 30 0 60', IN, 3); break;
      case 'type': s += rect(150, 420, 100, 40, WOODD, ol(IN, 4)); break;
      case 'cap': s += path('M140 196L150 160L250 160L260 196Z', '#3E5466', ol(IN, 4)); break;
      case 'pole': s += line(120, 140, 120, 580, WOODK, 6) + circ(120, 132, 8, GOD); break;
      case 'papers': s += path(rects([[150, 410, 100, 14], [146, 426, 104, 14], [152, 442, 98, 14]]), PAH, ol(IN, 3)); break;
      case 'lantern': s += rect(116, 420, 30, 40, AM, ol(IN, 4)) + circ(131, 440, 50, 'url(#amberGlow)'); break;
      case 'scroll': s += line(60, 600, 360, 40, '#8C7A5B', 8); break;
      case 'bird': s += path('M240 200q0 -24 24 -28q18 0 20 16q0 16 -20 20Z', GOD, ol(IN, 3)); break;
      case 'bowl': s += path('M150 420Q200 480 250 420Z', PAH, ol(IN, 4)) + stroke('M180 410q-8 -16 4 -30M214 410q-8 -16 4 -30', IW2, 3, cls('fx-steam')); break;
      case 'lamp': s += rect(250, 430, 32, 40, AM, ol(IN, 4)) + circ(266, 450, 50, 'url(#amberGlow)'); break;
      case 'monocle': s += circ(220, 246, 14, 'none', ol(GO, 4)); break;
    }
    return s;
  }
  function boxFig(id) { // 崩坏「纸箱」：纸箱 + 两个眼洞；韩栖的箱子侧面露出书箱背带，顶上戳出一根羽毛笔
    var s = rect(110, 330, 180, 200, '#C9A878', ol(IN, 3)) + g(path('M110 330L90 300L200 286L190 330Z', '#B8976A', ol(IN, 2.4)), cls('box-lid')) + path('M290 330L312 302L206 290L210 330Z', '#B8976A', ol(IN, 2.4)) +
      stroke('M120 360L280 360', '#A88A60', 2) + g(ell(170, 420, 9, 7, IN) + ell(230, 420, 9, 7, IN) + circ(171, 419, 2.6, PAH) + circ(232, 419, 2.6, PAH), cls('fx-blink-fast'));
    if (id === 'me') s += stroke('M110 380L290 470', '#5A4636', 8) + quillPen(206, 296, 8, 0.8);
    else s += g(stickFig(id, 'neutral'), ' transform="translate(140 120) scale(.3)"');
    return s;
  }

  function wolfSvg(f, klass) {
    var st = (f === 'neutral' || f === 'smile') ? 'grin' : ((f === 'curious' || f === 'soft') ? 'whisper' : ((f === 'angry' || f === 'annoyed') ? 'snarl' : 'fade'));
    var headT = st === 'whisper' ? 'translate(-20 26) rotate(-10 230 190)' : '';
    var body = path('M140 600Q120 470 150 400Q170 330 220 300L260 300Q310 330 320 400Q336 470 316 600Z', WOLFI) +
      path('M150 410Q100 460 96 520L120 524Q130 474 170 440Z M300 410Q352 450 360 520L336 526Q326 472 290 442Z', WOLFI);
    var head = '<g transform="' + headT + '"><g transform="' + (st === 'snarl' ? 'rotate(28 250 120)' : '') + '">' + path('M226 150L236 76L262 140Z', WOLFI) + path('M262 140L284 84L290 154Z', WOLFI) + '</g>' +
      path('M210 300Q190 230 214 176Q240 140 286 150Q314 158 318 196L300 214L190 236L118 246Q104 238 118 226L196 200Z', WOLFI) +
      stroke('M118 246L196 230Q240 214 300 214', WOLF, 1.6, op(0.6)) + line(238, 176, 268, 172, WOLF, 3) + stroke('M252 150L254 202', WOLF, 2.4) +
      (st === 'grin' ? stroke('M130 244l8 -6l8 6l8 -6l8 6l8 -6l8 6l8 -6l8 6l8 -6l8 6', WOLF, 1.6) : '') +
      (st === 'snarl' ? stroke('M126 244l8 -8l8 8l8 -8l8 8l8 -8l8 8l8 -8l8 8', WOLF, 2) + stroke('M190 236q-10 10 -24 8', WOLF, 1.4) : '') + '</g>';
    function blade(x, y, ang) {
      return '<g transform="translate(' + x + ' ' + y + ') rotate(' + ang + ')">' + path('M0 0Q-14 -60 -4 -130L4 -140Q12 -64 6 0Z', 'url(#bladeG)', ol(WOLF, 1)) + stroke('M2 -6L0 -126', WOLFI, 1, op(0.6)) + rect(-6, 0, 14, 30, WOLFI, ol(WOLF, 1)) + '</g>';
    }
    var blades = st === 'snarl' ? blade(108, 520, 160) + blade(348, 520, -160) : blade(108, 520, 200) + blade(348, 520, 160);
    var rim = stroke('M316 600Q336 470 320 400Q310 330 260 300', WOLF, 2.4, op(0.7)) + stroke('M286 150Q314 158 318 196', WOLF, 2, op(0.7));
    var drips = path(dots([[170, 620, 6], [230, 640, 5], [290, 628, 6], [206, 666, 4]]), WOLFI, cls('fx-drip'));
    return '<svg class="' + (klass || 'portrait-svg') + ' wolf-' + st + '" viewBox="0 0 400 680" preserveAspectRatio="xMidYMax meet" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      circ(220, 380, 260, 'url(#frostGlow)', op(0.6)) + g(body + head + rim + blades + drips, cls('wolf-body')) + '</svg>';
  }

  function portrait(id, f, o) {
    o = o || {};
    if (['neutral', 'smile', 'soft', 'curious', 'annoyed', 'angry', 'sad', 'tired', 'surprised'].indexOf(f) < 0) f = 'neutral';
    if (id === 'wolf') return wolfSvg(f);
    if (!CH[id]) id = 'me';
    var vb = 'viewBox="0 0 400 600" preserveAspectRatio="xMidYMax meet" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"';
    if (o.alt === 'stick') return '<svg class="portrait-svg alt-stick" ' + vb + '><g filter="url(#ptWobS)">' + stickFig(id, f) + '</g></svg>';
    if (o.alt === 'box') return '<svg class="portrait-svg alt-box" ' + vb + '><g filter="url(#ptWobS)">' + boxFig(id) + '</g></svg>';
    var b = build(id, f, o), em = (b.e || '') + (b.m || '');
    if (o.realsmile) { // 摘下面具：礼仪脸（neutral）淡出、真笑（smile）淡入，中间两张脸叠在一起（CSS 800ms）
      var bn = build(id, 'neutral', o);
      f = 'smile'; b = build(id, 'smile', o);
      em = '<g class="pt-rs-from">' + (bn.e || '') + (bn.m || '') + '</g><g class="pt-rs-to">' + (b.e || '') + (b.m || '') + '</g>';
    }
    var head = (b.ears != null ? b.ears : earsN()) + path('M128 228Q127 158 200 150Q273 158 272 228Q272 276 248 304Q224 330 200 334Q176 330 152 304Q128 276 128 228Z', SKIN, ol(IN, 2.6)) + path('M134 200Q200 236 266 200L268 186Q200 214 132 186Z', '#7A4A40', op(0.16)) + path('M150 292Q176 326 200 330Q224 326 250 292Q240 318 200 336Q160 318 150 292Z', '#B07A68', op(0.18)) + '<g transform="' + (b.faceShift || '') + '">' + em + '</g>';
    var inner = (b.back || '') +
      '<g transform="' + b.tilt + '"><g transform="' + HS + '"><g filter="url(#hairTex)">' + (b.hairBack || '') + '</g></g></g>' +
      '<g transform="' + HS + '">' + path('M184 296Q186 360 180 424L220 424Q214 360 216 296Z', SKIN2, ol(IN, 2)) + path('M182 300Q200 330 218 300L217 332Q200 350 183 332Z', '#7A4A40', op(0.22)) + '</g>' + '<g filter="url(#clothTex)">' + (b.body || '') + (id === 'ye' || id === 'yuan' ? '' : BODYFORM) + '</g>' +
      '<g transform="' + b.tilt + '"><g transform="' + HS + '">' + head + (b.scarf || '') + '<g filter="url(#hairTex)">' + (b.hair || '') + '</g>' + (b.cap || '') + (b.goggles || '') + (b.mask ? '<g transform="' + (b.faceShift || '') + '">' + b.mask + '</g>' : '') + (b.shadeFace ? ell(200, 250, 76, 90, IN, op(0.35)) : '') + '</g></g>' +
      (b.front || '') + (b.extra || '') + (b.ice || '');
    if (b.lean) inner = '<g transform="' + b.lean + '">' + inner + '</g>';
    return '<svg class="portrait-svg p-' + id + ' f-' + f + '" ' + vb + '><defs><clipPath id="rimR"><rect x="200" y="0" width="200" height="600"/></clipPath><clipPath id="shadeL"><rect x="0" y="0" width="190" height="600"/></clipPath></defs><g filter="url(#ptLight)"><g filter="url(#ptWobS)">' + celLines(inner) + '</g></g></svg>';
  }
  function celLines(svg) { return svg.replace(/stroke="#1B1A1F"/g, 'stroke="#3B2626" stroke-opacity=".82"'); }
  function wolfShade(f) { return wolfSvg(f || 'neutral', 'wolf-svg'); }
  function shadowFigure(id) { return portrait(id, 'soft'); }
  function silhouette(seed) {
    var r = rnd(seed || 1);
    return '<svg viewBox="0 0 200 260" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + path('M30 260Q40 170 100 160Q160 170 170 260Z', IN, op(0.3)) + ell(100, 112, n(38 + r() * 8), 46, IN, op(0.3)) +
      circ(100, 120, 26, 'none', ol(GO, 2) + ' stroke-dasharray="3 5"') + txt(100, 132, '?', 34, GOD) + '</svg>';
  }
  function doodle() { // 社恐崩坏「混合媒材」：一张粗马克笔脸的纸片，用胶带贴上
    return '<svg class="doodle-svg" viewBox="0 0 160 160" aria-hidden="true">' + path('M10 18L150 8L146 150L14 146Z', PAH, ol(IN, 2)) + rect(54, 2, 52, 16, 'rgba(232,220,190,.8)', ' transform="rotate(-6 80 10)"') +
      stroke('M40 66q10 -14 22 0M98 66q10 -14 22 0', IN, 7) + stroke('M44 106q36 30 72 0', IN, 7) + stroke('M30 40l14 8M130 40l-14 8', IN, 5) + path(dots([[40, 88, 10], [120, 88, 10]]), DROSE, op(0.5)) + '</svg>';
  }
  function seal(label, color, size) {
    color = color || CI; size = size || 56;
    var r = rnd(label ? label.charCodeAt(0) : 3), d = 'M28 3';
    for (var i = 1; i <= 14; i++) { var a = i / 14 * Math.PI * 2 - Math.PI / 2, rr = 24 + r() * 3.6; d += 'L' + n(28 + Math.cos(a) * rr) + ' ' + n(28 + Math.sin(a) * rr); }
    return '<svg class="seal-svg" viewBox="0 0 56 56" width="' + size + '" height="' + size + '" aria-hidden="true">' +
      path(d + 'Z', color, ' stroke="rgba(0,0,0,.35)" stroke-width="1.4"') + circ(28, 28, 17, 'none', ' stroke="rgba(255,255,255,.28)" stroke-width="2"') +
      circ(28, 28, 15, 'rgba(0,0,0,.12)') + (label ? txt(28, 35.5, label, 20, 'rgba(255,240,220,.92)') : star4(28, 28, 10, 'rgba(255,240,220,.85)')) +
      stroke('M14 16q6 -6 14 -6', 'rgba(255,255,255,.35)', 2) + '</svg>';
  }
  function claw() {
    return '<svg class="claw-svg" viewBox="0 0 120 60" preserveAspectRatio="none" aria-hidden="true">' +
      stroke('M8 54Q40 30 70 4M30 58Q62 34 92 6M54 60Q84 36 114 10', WOLF, 5, op(0.95)) + stroke('M8 54Q40 30 70 4M30 58Q62 34 92 6M54 60Q84 36 114 10', '#8FB0CC', 1.4) + '</svg>';
  }
  function hexWall() { // 冰的质感（冷白），绝不做成橙色力场
    return '<svg class="hex-svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' + rect(0, 0, 1600, 900, 'url(#frostGlow)', op(0.6)) + rect(0, 0, 1600, 900, 'url(#hexP)', op(0.5)) + '</svg>';
  }
  function hexEdge() { // 「壁」的笺缘版：一层霜色 + 小冰晶格；只露四缘由 CSS 遮罩决定
    return '<svg class="hex-svg hex-edge-svg" viewBox="0 0 400 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' + rect(0, 0, 400, 600, FROST, op(0.6)) + rect(0, 0, 400, 600, 'url(#hexEdgeP)') + '</svg>';
  }

  var POSES = {
    yuan: { mask: { mask: true }, realsmile: { realsmile: true } },
    geng: { magic: { magic: true }, nocloak: { fire: true } } // 无斗篷版沿用露营夜的 fire 参数（内搭旧亚麻衫）
  };
  function oilclothChair(cx, top, v) {
    var rim = v === 'dawn' ? PEACH : AM, s = '';
    s += rect(cx - 72, top + 6, 14, 900 - top, WOODK, ol(IN, 2)) + rect(cx + 58, top + 6, 14, 900 - top, WOODK, ol(IN, 2)) + rect(cx - 62, top + 104, 124, 13, WOODK, ol(IN, 1.6)) + rect(cx - 62, top + 160, 124, 11, WOODK, ol(IN, 1.4));
    s += path('M' + (cx - 84) + ' ' + (top + 8) + 'Q' + cx + ' ' + (top - 8) + ' ' + (cx + 84) + ' ' + (top + 8) + 'L' + (cx + 84) + ' ' + (top + 28) + 'Q' + cx + ' ' + (top + 12) + ' ' + (cx - 84) + ' ' + (top + 28) + 'Z', '#4A3626', ol(IN, 2.2));
    var x0 = cx - 62, x1 = cx + 54, yb = top + 122;
    s += path('M' + x0 + ' ' + (top - 2) + 'L' + x1 + ' ' + (top - 6) + 'L' + x1 + ' ' + (top + 6) + 'L' + x0 + ' ' + (top + 10) + 'Z', '#6E5E44', ol(IN, 1.8));
    s += path('M' + x0 + ' ' + (top + 8) + 'L' + x1 + ' ' + (top + 4) + 'L' + (x1 + 4) + ' ' + (yb - 8) + 'L' + (x0 + 30) + ' ' + yb + 'L' + (x0 + 8) + ' ' + (yb - 26) + 'Z', '#8C7A5B', ol(IN, 2.2));
    s += path('M' + (x0 + 8) + ' ' + (yb - 26) + 'L' + (x0 + 30) + ' ' + yb + 'L' + (x0 + 34) + ' ' + (yb - 24) + 'Z', '#A8946E', ol(IN, 1.6)); // 翻起的角
    s += stroke('M' + (x0 + 2) + ' ' + (top + 46) + 'L' + (x1 + 1) + ' ' + (top + 42) + 'M' + (x0 + 5) + ' ' + (top + 82) + 'L' + (x1 + 3) + ' ' + (top + 78), '#5E5038', 2.4); // 叠痕
    s += stroke('M' + (x0 + 8) + ' ' + (top + 16) + 'L' + (x1 - 6) + ' ' + (top + 12) + 'L' + (x1 - 3) + ' ' + (yb - 15) + 'L' + (x0 + 40) + ' ' + (yb - 8), GOD, 1.6, ' stroke-dasharray="6 5"'); // 缝线
    s += stroke('M' + (x0 + 22) + ' ' + (top + 20) + 'L' + (x0 + 70) + ' ' + (top + 100), '#C9B48A', 6, op(0.3)); // 油布的蜡光
    s += stroke('M' + (x1 + 3) + ' ' + (yb - 10) + 'q10 20 2 38q-6 14 6 26', '#C9B48A', 2); // 系绳
    s += stroke('M' + x1 + ' ' + (top + 4) + 'L' + (x1 + 4) + ' ' + (yb - 8) + 'M' + (cx + 84) + ' ' + (top + 10) + 'L' + (cx + 84) + ' ' + (top + 26), rim, 3, op(0.55)); // 烛光在右侧
    return s;
  }
  var PROPS = {
    oilcloth: { my_room_night: function (v) { return oilclothChair(300, 418, v); } }
  };
  function props(list, bgId, v) {
    var s = '', seen = {};
    (Array.isArray(list) ? list : []).forEach(function (p) {
      if (typeof p !== 'string' || seen[p] || !PROPS.hasOwnProperty(p) || !PROPS[p][bgId]) return;
      seen[p] = 1; s += PROPS[p][bgId](variantOf(bgId, v));
    });
    return s ? '<svg class="prop-svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + s + '</svg>' : '';
  }
  var ART_CROP = { sunrise: ['lighthouse_hill', 'dawn', '560 160 900 600'] };
  function cardArt(art, v, crop) { // 风景卡：复用背景，按 crop 裁切（地平线大致落在卡片高度 58% 处）
    var a = ART_CROP[art], id = a ? a[0] : art, vv = a ? a[1] : v, cr = crop || (a ? a[2] : '350 150 900 600');
    if (!BG[id]) { id = 'lighthouse_hill'; vv = 'dawn'; cr = ART_CROP.sunrise[2]; }
    return bg(id, { v: vv }).replace(/<div class="fx[\s\S]*$/, '').replace('viewBox="0 0 1600 900"', 'viewBox="' + cr + '"').replace('class="bg-svg', 'class="card-svg');
  }

  function candleHud(v) { // 身心：蜡烛；≤3 时火焰变小、发蓝
    v = Math.max(0, Math.min(10, v | 0));
    var h = 6 + v * 3.6, top = 60 - h, low = v <= 3;
    return '<svg class="hud-candle' + (low ? ' low' : '') + '" viewBox="0 0 30 72" aria-hidden="true">' +
      circ(15, top - 6, low ? 8 : 12, 'url(#fireGlow)', ' class="halo"') + rect(9, top, 12, h, PAH, ol(IN, 1.4)) + path('M9 ' + n(top + 2) + 'q3 6 0 10Z', PAD) +
      (v > 0 ? g(path('M15 ' + n(top - 13) + 'q5 7 0 12q-5 -5 0 -12Z', low ? FROST : '#FFC56A') + path('M15 ' + n(top - 8) + 'q2 3 0 6q-2 -3 0 -6Z', low ? '#FFFFFF' : FCORE), ' class="flame"') : stroke('M15 ' + n(top - 2) + 'q4 -8 -2 -14', MI, 1.4)) +
      line(15, top, 15, top - 3, IN, 1.2) + ell(15, 61, 13, 4, GOD, ol(IN, 1.2)) + rect(11, 61, 8, 6, GO) + ell(15, 68, 10, 3, GOD, ol(IN, 1)) + '</svg>';
  }
  function bookmark(v) { // 自己的作品：书签，满格时顶端有一束泥金流苏
    v = Math.max(0, Math.min(10, v | 0));
    var h = 10 + v * 5;
    return '<svg class="hud-bookmark" viewBox="0 0 30 76" aria-hidden="true">' + rect(2, 2, 26, 7, LA, ol(IN, 1.2)) + rect(2, 2, 26, 3, GOD) +
      path('M10 9L20 9L20 ' + n(9 + h) + 'L15 ' + n(9 + h - 5) + 'L10 ' + n(9 + h) + 'Z', CI, ol(IN, 1)) + line(15, 9, 15, 9 + h - 7, GOH, 0.8) +
      (v >= 10 ? stroke('M15 ' + n(9 + h - 4) + 'v6M12 ' + n(9 + h + 2) + 'l3 8l3 -8', GOH, 1.6) : '') + '</svg>';
  }
  var STAR_POS = {};
  function starmap(v, id) { // 你以为的好感：小星图，最亮的那颗是当前值
    v = Math.max(0, Math.min(10, v | 0));
    if (!STAR_POS[id]) { var seed = 7, sid = String(id || 'x'); for (var c = 0; c < sid.length; c++) seed = seed * 31 + sid.charCodeAt(c); var r = rnd(seed), pts = []; for (var i = 0; i < 10; i++) pts.push([6 + i * 7.2, 5 + r() * 14]); STAR_POS[id] = pts; }
    var p = STAR_POS[id], s = '';
    for (var k = 1; k < v; k++) s += line(p[k - 1][0], p[k - 1][1], p[k][0], p[k][1], GO, 0.9, op(0.8));
    p.forEach(function (q, j) { s += j < v ? star4(q[0], q[1], j === v - 1 ? 4.6 : 3.2, j === v - 1 ? GOH : GO) + circ(q[0], q[1], 1, FCORE) : circ(q[0], q[1], 1.1, IW2, op(0.6)); });
    return '<svg class="hud-stars" viewBox="0 0 78 24" aria-hidden="true">' + s + '</svg>';
  }
  function barcode(id) { // 由角色 id 的哈希生成 24 根宽 1–4px 的竖条
    var seed = 5, sid = String(id); for (var c = 0; c < sid.length; c++) seed = seed * 33 + sid.charCodeAt(c);
    var r = rnd(seed), x = 0, bars = [];
    for (var i = 0; i < 24; i++) { var w = 1 + Math.floor(r() * 4); bars.push([x, 0, w, 20]); x += w + 1 + Math.floor(r() * 3); }
    return '<svg class="barcode" viewBox="0 0 ' + x + ' 20" preserveAspectRatio="none" aria-hidden="true">' + path(rects(bars), 'currentColor') + '</svg>';
  }

  var ICONS = {
    give: '<path d="M4 10h16v10H4z" fill="' + CI + '"/><path d="M3 7h18v4H3z" fill="' + GO + '"/><path d="M12 7v13" stroke="' + PA + '" stroke-width="2"/>',
    ask: '<path d="M4 4h16v12H11l-5 4v-4H4z" fill="' + PA + '" stroke="' + LA + '" stroke-width="1.8"/><path d="M8 9h8M8 12h5" stroke="' + LA + '" stroke-width="1.6"/>',
    relay: '<path d="M2 8c4-4 7 0 10-3" fill="none" stroke="' + LA + '" stroke-width="1.6"/><path d="M8 13l6-4 8 3-6 5z" fill="' + PA + '" stroke="' + IN + '" stroke-width="1.4"/><path d="M12 17c-1 2-4 3-7 2" fill="none" stroke="' + CI + '" stroke-width="1.6" stroke-dasharray="2 2"/>',
    'boundary-respect': '<path d="M4 20V9a8 8 0 0 1 16 0v11" fill="none" stroke="' + LA + '" stroke-width="2.2"/><path d="M9 20v-7a3 3 0 0 1 6 0v7" fill="' + GO + '"/>',
    'boundary-push': '<path d="M16 3v18" stroke="' + LA + '" stroke-width="2.4"/><path d="M2 12h14M11 7l6 5-6 5" fill="none" stroke="' + CI + '" stroke-width="2.6" stroke-linejoin="round"/>',
    meta: '<rect x="5" y="10" width="14" height="11" rx="2" fill="' + LA + '"/><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="' + GO + '" stroke-width="2.2"/><path d="M8 13l3 6M11 12l3 6M14 11l3 6" stroke="' + WOLF + '" stroke-width="1.3"/>',
    rest: '<path d="M15 3a8 8 0 1 0 6 12A7 7 0 0 1 15 3z" fill="' + LA + '"/><path d="M6 6l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" fill="' + GO + '"/>',
    own: '<path d="M8 3h8v18l-4-4-4 4z" fill="' + CI + '" stroke="' + IN + '" stroke-width="1.2"/>',
    energy: '<rect x="9" y="8" width="6" height="12" fill="' + PA + '" stroke="' + IN + '" stroke-width="1.2"/><path d="M12 2q3 3 0 5q-3-2 0-5z" fill="#FFC56A"/>',
    lamp: '<path d="M8 3h8v18l-4-4-4 4z" fill="' + CI + '" stroke="' + IN + '" stroke-width="1.2"/>',
    ledger: '<path d="M5 3h12l2 2v16H5z" fill="#5A2E24" stroke="' + IN + '" stroke-width="1.4"/><path d="M8 3v18" stroke="' + GO + '" stroke-width="1.2"/><path d="M10 8h6M10 11h6M10 14h4" stroke="' + GOH + '" stroke-width="1.4"/>',
    labor: '<path d="M5 21C7 13 13 6 20 3c-2 6-7 12-13 16z" fill="' + PA + '" stroke="' + IN + '" stroke-width="1.3"/><path d="M5 21l6-8" stroke="' + IN + '" stroke-width="1.2"/>',
    gift: '<path d="M4 10h16v10H4z" fill="' + CI + '"/><path d="M3 7h18v4H3z" fill="' + GO + '"/><path d="M12 7v13" stroke="' + PA + '" stroke-width="2"/>',
    money: '<circle cx="12" cy="12" r="8" fill="' + GO + '" stroke="' + GOD + '" stroke-width="1.6"/><path d="M7 15l3-6 2 3 2-2 3 5z" fill="' + PAH + '"/>',
    praise: '<path d="M12 3c3 4 6 6 9 6-2 4-5 9-9 12-4-3-7-8-9-12 3 0 6-2 9-6z" fill="' + GO + '" stroke="' + GOD + '" stroke-width="1.2"/>',
    time: '<path d="M7 3h10M7 21h10M8 3c0 6 8 6 8 9s-8 3-8 9M16 3c0 6-8 6-8 9s8 3 8 9" fill="none" stroke="' + LA + '" stroke-width="1.8"/><path d="M10 18h4l-2-3z" fill="' + GO + '"/>',
    j_quill: '<path d="M5 21C7 13 13 6 20 3c-2 6-7 12-13 16z" fill="' + PAH + '" stroke="' + IN + '" stroke-width="1.3"/>',
    j_compass: '<circle cx="12" cy="12" r="8" fill="none" stroke="' + IN + '" stroke-width="1.6"/><path d="M12 5l2 7-2 7-2-7z" fill="' + CI + '"/>',
    j_type: '<rect x="6" y="4" width="12" height="16" fill="#8E959E" stroke="' + IN + '" stroke-width="1.4"/><path d="M9 9h6M12 9v7" stroke="' + IN + '" stroke-width="1.6"/>',
    j_feather: '<path d="M18 3C10 5 6 12 6 21c4-4 10-8 12-18z" fill="' + PAH + '" stroke="' + IN + '" stroke-width="1.3"/>',
    j_lantern: '<path d="M8 8h8l1 10H7z" fill="' + AM + '" stroke="' + IN + '" stroke-width="1.4"/><path d="M8 8l4-4 4 4" fill="none" stroke="' + IN + '" stroke-width="1.4"/>',
    j_key: '<circle cx="8" cy="8" r="4" fill="none" stroke="' + GOD + '" stroke-width="2"/><path d="M11 11l8 8M16 16l2-2M18 18l2-2" stroke="' + GOD + '" stroke-width="2"/>',
    j_scroll: '<rect x="5" y="4" width="14" height="16" fill="' + PAD + '" stroke="' + IN + '" stroke-width="1.4"/><path d="M5 4a2 2 0 0 0 0 4M19 16a2 2 0 0 1 0 4" fill="none" stroke="' + IN + '" stroke-width="1.4"/>',
    j_gear: '<circle cx="12" cy="12" r="5" fill="none" stroke="' + GOD + '" stroke-width="2.4" stroke-dasharray="3 2"/><circle cx="12" cy="12" r="2" fill="' + GOD + '"/>',
    j_bowl: '<path d="M4 11h16a8 8 0 0 1-16 0z" fill="' + PAH + '" stroke="' + IN + '" stroke-width="1.4"/><path d="M9 8q-2-2 0-4M13 8q-2-2 0-4" stroke="' + IW2 + '" stroke-width="1.4" fill="none"/>',
    j_lamp: '<path d="M9 7h6l1 9H8z" fill="' + AM + '" stroke="' + IN + '" stroke-width="1.4"/><path d="M12 3v4M8 18h8" stroke="' + IN + '" stroke-width="1.6"/>',
    j_eye: '<circle cx="12" cy="12" r="6" fill="none" stroke="' + GO + '" stroke-width="2"/><path d="M17 16l3 5" stroke="' + GO + '" stroke-width="1.6"/>',
    j_shadow: '<path d="M6 21q-2-10 6-14l2-4 2 5q4 4 2 13z" fill="' + WOLFI + '"/><path d="M12 9v4" stroke="' + WOLF + '" stroke-width="1.2"/>'
  };
  function icon(name, klass) { return '<svg class="icon ' + (klass || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[name] || '') + '</svg>'; }

  root.PlainArt = {
    COLORS: { PARCH: PA, LAPIS: LA, CIN: CI, GOLD: GO, INK: IN, MIST: MI, WOLF: WOLF, WOLFI: WOLFI },
    CHAR_COLORS: (function () { var o = {}; for (var k in CH) o[k] = CH[k].main; return o; })(),
    SEAL_COLORS: SEAL_COLORS,
    CHAR_LABEL: (function () { var o = {}; for (var k in CH) o[k] = CH[k].label; return o; })(),
    defs: defs, paperTile: paperTile, bg: bg, bgVariants: bgVariants, tod: tod, portrait: portrait, wolfShade: wolfShade, shadowFigure: shadowFigure,
    titleArt: titleArt, silhouette: silhouette, seal: seal, claw: claw, hexWall: hexWall, hexEdge: hexEdge, doodle: doodle, cardArt: cardArt, barcode: barcode,
    TOWER_BGS: TOWER_BGS.slice(), POSES: POSES, props: props, PROPS: (function () { var o = {}; for (var k in PROPS) o[k] = Object.keys(PROPS[k]); return o; })(),
    candle: candleHud, bookmark: bookmark, starmap: starmap, icon: icon, BG_IDS: Object.keys(BG),
    fx: function (id, v) { return FX[id + '|' + variantOf(id, v)] || FX[id] || ''; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
