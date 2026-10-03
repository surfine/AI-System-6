(function () {
  'use strict';
  var R = window.PlainRules, A = window.PlainArt, AU = window.PlainAudio;
  var STORY = window.STORY;
  var QS = location.search;
  var DEBUG = /[?&]debug=1\b/.test(QS);
  var NUM = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一'];
  var TAG_LABEL = { give: '付出', ask: '直说', relay: '传话', 'boundary-respect': '尊重', 'boundary-push': '加码', meta: '元知识', rest: '休息', own: '自己的事' };
  var LEDGER_LABEL = { labor: '劳动', gift: '礼物', money: '钱', praise: '夸奖', time: '时间' };
  var ACC_LABEL = { 'in': '收下', back: '退回', hang: '挂账（没有表态）' };
  var HELP_HTML = '<div class="helpbox"><b>如果你感到撑不住</b>，请联系身边的人、当地的紧急服务或心理援助热线。<br>中国大陆心理援助热线：<b>12356</b>；紧急情况：<b>120 / 110</b>。<br>累了就停下来。这不是失败。</div>';
  var TODS = ['tod-day', 'tod-dawn', 'tod-dusk', 'tod-night', 'tod-fire', 'wx-rain', 'mode-stage'];
  var VFX = ['blur', 'box', 'melt', 'doodle'];
  var SFX = ['stamp', 'pen', 'bell', 'don'];
  var POSE_ONCE = { realsmile: 'smile' }; // 一次性的过渡态：只在写它的那一行播放，之后停在这张脸

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    app: $('app'), stage: $('stage'), bg: $('bg'), chars: $('chars'), dialog: $('dialog'), name: $('namebox'), text: $('text'),
    choices: $('choices'), hud: $('hud'), rhud: $('replayhud'), chaptag: $('chaptag'), title: $('title'),
    phone: $('phone'), phoneName: $('phoneName'), phoneBody: $('phoneBody'), phoneDeco: $('phoneDeco'), phoneTraces: $('phoneTraces'), collage: $('collage'),
    msgpop: $('msgpop'), sys: $('sysline'), quick: $('quickbar'), overlay: $('overlay'), modal: $('modal'),
    toast: $('toast'), debug: $('debug'), wolf: $('wolfShade'), wall: $('wall')
  };
  function reduced() { return el.app.classList.contains('reduce'); }
  function sealColor(id) { return (A.SEAL_COLORS && A.SEAL_COLORS[id]) || A.CHAR_COLORS[id] || '#C23B22'; }
  var slots = el.chars.querySelectorAll('.slot');

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function nameOf(id) { return R.SHORT[id] || id; }
  function sfx(n) { if (AU.sfx) AU.sfx(n); }

  var Store = {
    ok: true, warned: false, PFX: 'plaintext:',
    probe: function () { try { localStorage.setItem(this.PFX + 't', '1'); localStorage.removeItem(this.PFX + 't'); } catch (e) { this.fail(); } },
    get: function (k, def) {
      try { var v = localStorage.getItem(this.PFX + k); return v == null ? def : JSON.parse(v); } catch (e) { this.fail(); return def; }
    },
    set: function (k, v) {
      if (!this.ok) return false;
      try { localStorage.setItem(this.PFX + k, JSON.stringify(v)); return true; } catch (e) { this.fail(); return false; }
    },
    fail: function () {
      this.ok = false;
      if (!this.warned) { this.warned = true; setTimeout(function () { toast('本地存储不可用：可以照常游玩，但存档和解锁不会被保存。', 5200); }, 300); }
    }
  };
  Store.probe();
  var GLOBAL = Store.get('global', null) || {};
  ['cards', 'endings', 'reached', 'letters', 'echoes', 'bestTrust', 'flagsSeen', 'dossierSeen'].forEach(function (k) { GLOBAL[k] = GLOBAL[k] || {}; });
  var SET = Object.assign({ textSpeed: 6, autoSpeed: 5, volume: 35, muted: false, showTags: false }, Store.get('settings', {}) || {});
  var READ = Store.get('read', {}) || {};
  var readTimer = null;
  function saveGlobal() { Store.set('global', GLOBAL); }
  function saveSettings() { Store.set('settings', SET); }
  function markRead(k) { if (READ[k]) return; READ[k] = 1; clearTimeout(readTimer); readTimer = setTimeout(function () { Store.set('read', READ); }, 800); }
  function noteRun(s) {
    if (!s || s.flags.hidden_run) return;
    R.NPCS.forEach(function (id) { if (s.trust[id] != null) GLOBAL.bestTrust[id] = Math.max(GLOBAL.bestTrust[id] || 0, s.trust[id]); });
    Object.keys(s.flags).forEach(function (f) { GLOBAL.flagsSeen[f] = 1; });
  }

  var FILES = ['ch01', 'ch02', 'ch03', 'ch04', 'ch05', 'ch06', 'ch07', 'ch08', 'ch09', 'ch10', 'endings', 'hidden'];
  var LOAD = { ok: [], missing: [], broken: [] };
  var loadingFile = null;
  window.addEventListener('error', function (ev) {
    if (loadingFile && ev.filename && ev.filename.indexOf(loadingFile) >= 0) { LOAD.broken.push(loadingFile + '：' + ev.message); }
    else if (DEBUG) toast('脚本错误：' + ev.message, 4000);
  });
  function loadScripts(list, done) {
    var i = 0;
    (function next() {
      if (i >= list.length) return done();
      var f = list[i++], s = document.createElement('script');
      loadingFile = f;
      s.src = f + (DEBUG ? '?t=' + Date.now() : '');
      s.onload = function () { LOAD.ok.push(f); loadingFile = null; next(); };
      s.onerror = function () { LOAD.missing.push(f); loadingFile = null; next(); };
      document.body.appendChild(s);
    })();
  }

  var G = {
    st: null, chapter: null, scene: null, sceneId: null,
    seq: null,               // {kind:'scene'|'replay'|'ending', lines, idx, key, onDone}
    view: { bg: 'paper', bgv: null, music: 'none', show: [], faces: {}, poses: {} },
    backlog: [], waiting: null, typing: false, typeTimer: null, autoTimer: null,
    auto: false, skip: false, full: '', shown: 0, curChoices: [], relevant: [], inGame: false, phoneRun: [], endRes: null,
    holdUntil: 0, holdTimer: null, vfxTimers: [], lastCard: null, cardLock: 0, keyTimer: null, keyShownFor: null,
    poseOnce: {},                       // 只管当前这一行的过渡态（真笑）
    deco: { still: false, props: [] },  // 当前场景的 still / props（从场景定义取，不进存档）
    tower: null, towerDbg: null,        // 誊塔 {s: 0–5, lit}：进场景 / 回放 / 结局时按剧本或章号算好；调试面板可以临时改写
    motifTimers: [], flashTimer: null, titleMotif: false
  };
  function ensureState(s) { s.regrets = s.regrets || []; s.seized = s.seized || []; s.respect = s.respect || {}; return s; }
  function freshState() { return ensureState(R.newState()); }

  function bgOpts(id, v) {
    var f = (G.st && G.st.flags) || {}, plain = !!f.ending_plain, tw = towerNow(id);
    return { v: v, plain: plain && (id === 'lighthouse_hill' || id === 'paper'), bloom: plain && id === 'lighthouse_hill', tower: tw };
  }
  function towerFor(ch, sid, sc) {
    var t = sc && sc.tower;
    if (typeof t === 'number' && isFinite(t) && t >= 0 && t <= 5) { t = Math.floor(t); return { s: t, lit: t === 5 }; }
    var no = (ch && ch.no) || 0, s = R.towerAuto ? R.towerAuto(no) : 5;
    return { s: s, lit: s === 5 && (no > 9 || (no === 9 && ch9Night(ch, sid))) };
  }
  function ch9Night(ch, sid) {
    if (!sid || !ch || !ch.scenes) return true;
    var ids = Object.keys(ch.scenes), at = ids.indexOf(sid);
    for (var i = 0; i < ids.length && i <= at; i++) if (ch.scenes[ids[i]] && ch.scenes[ids[i]].bgv === 'night') return true;
    return false;
  }
  function towerNow(id) {
    if (!A.TOWER_BGS || A.TOWER_BGS.indexOf(id) < 0) return null;
    return G.towerDbg || G.tower || null;
  }
  function propsHtml(id, v) { return G.deco.props.length && A.props ? A.props(G.deco.props, id, v) : ''; }
  var PAINTED = { my_room_night: ['night', 'dawn'], library: ['day', 'night'], bookshop: ['day', 'night'], yuan_room: ['night', 'day'], hospital: ['day', 'ceiling'],
    street_spring: ['day', 'dusk'], fair_booth: ['day', 'dusk', 'stage'], cafe: ['day'], ferry: ['day', 'night'], rain_street: ['rain', 'side'], lighthouse_hill: ['day', 'dusk', 'night', 'dawn'] };
  function paintedSrc(id, o) {
    if (id === 'lighthouse_hill' && o.plain) return 'img/hill_plain.jpg';
    var vs = PAINTED[id]; if (!vs || vs.indexOf(o.v) < 0) return '';
    if (A.TOWER_BGS.indexOf(id) < 0) return 'img/bg/' + id + '_' + o.v + '.jpg';
    var t = o.tower, s = t ? Math.max(0, Math.min(5, Math.round(t.s || 0))) : 0;
    return 'img/bg/' + id + '_' + o.v + '_' + s + (s === 5 && t && t.lit ? 'L' : '') + '.jpg';
  }
  function paintedBg(id, o) { return !!paintedSrc(id, o); }
  function bgHtml(id, o) {
    if (paintedBg(id, o)) return '<div class="bg-painted' + (id === 'lighthouse_hill' && o.plain ? ' push' : '') + '"><img src="' + paintedSrc(id, o) + '" alt="" decoding="async"></div>' + (A.fx ? A.fx(id, o.v) : '');
    return A.bg(id, o);
  }
  function bgKey(id, v, o, pr) { return id + '|' + v + (o.plain ? '|p' : '') + (o.tower ? '|w' + o.tower.s + (o.tower.lit ? 'L' : '') : '') + (pr ? '|' + G.deco.props.join(',') : ''); }
  function setBg(id, fade, v) {
    id = R.BGS.indexOf(id) >= 0 ? id : (id ? 'paper' : G.view.bg || 'paper');
    var vars = A.bgVariants(id); v = vars.indexOf(v) >= 0 ? v : vars[0];
    var o = bgOpts(id, v), pr = propsHtml(id, v), key = bgKey(id, v, o, pr);
    G.view.bg = id; G.view.bgv = v;
    TODS.forEach(function (c) { el.stage.classList.remove(c); });
    el.stage.classList.add(A.tod(id, v));
    if (el.bg.dataset.id === key) return false;
    var first = !el.bg.dataset.id;
    el.bg.dataset.id = key;
    el.app.dataset.bg = id;
    if (fade && !first && !reduced()) {
      var layer = document.createElement('div');
      layer.className = 'bgl incoming'; layer.innerHTML = bgHtml(id, o) + pr;
      el.bg.appendChild(layer);
      void layer.offsetWidth; layer.classList.add('in');
      setTimeout(function () {
        var all = el.bg.querySelectorAll('.bgl');
        for (var i = 0; i < all.length - 1; i++) if (all[i] !== layer) all[i].remove();
        layer.classList.remove('incoming', 'in');
      }, 760);
    } else el.bg.innerHTML = '<div class="bgl">' + bgHtml(id, o) + pr + '</div>';
    if (AU.ambient) AU.ambient(id, v);
    var wasPhone = el.app.classList.contains('phone-bg');
    el.app.classList.toggle('phone-bg', id === 'phone');
    el.phone.hidden = id !== 'phone';
    if (id === 'phone' && !wasPhone) { el.phoneBody.innerHTML = ''; G.phoneRun = []; G.lastCard = null; drawTraces(); }
    if (id === 'hospital' && v === 'ceiling' && G.inGame) holdFor(3); // 仰望吊扇：强制停 3 秒
    return true;
  }
  function redrawBg() {
    var id = G.view.bg, v = G.view.bgv;
    if (!id || !el.bg.dataset.id) return;
    var o = bgOpts(id, v), pr = propsHtml(id, v), key = bgKey(id, v, o, pr);
    if (el.bg.dataset.id === key) return;
    el.bg.dataset.id = key;
    el.bg.innerHTML = '<div class="bgl">' + bgHtml(id, o) + pr + '</div>';
  }
  function applyDeco(sc) {
    var list = sc && Array.isArray(sc.props) ? sc.props : [], known = A.PROPS || {}, props = [];
    list.forEach(function (p) { if (typeof p === 'string' && known.hasOwnProperty(p) && props.indexOf(p) < 0) props.push(p); });
    G.deco = { still: !!(sc && sc.still === true), props: props };
    el.app.classList.toggle('still', G.deco.still);
  }
  function clearDeco() {
    var had = G.deco.props.length;
    applyDeco(null);
    if (had) redrawBg();
  }
  function setMusic(m) {
    if (m == null) return;
    G.view.music = R.MUSIC.indexOf(m) >= 0 ? m : 'none';
    AU.play(G.view.music);
  }
  var GLITCH_AT = [2.1];
  function playMotif(name, opt) {
    if (!R.MOTIFS || R.MOTIFS.indexOf(name) < 0) return null;
    G.motifTimers.forEach(clearTimeout); G.motifTimers = [];
    var info = null;
    try { info = AU.motif ? AU.motif(name, opt || {}) : null; } catch (e) { info = null; }
    if (name === 'glitch') {
      var hits = info && info.hits && info.hits.length ? info.hits : GLITCH_AT;
      G.motifTimers.push(setTimeout(towerFlash, Math.max(0, hits[0]) * 1000));
    }
    return info;
  }
  function stopMotif() {
    G.motifTimers.forEach(clearTimeout); G.motifTimers = [];
    if (AU.stopMotif) AU.stopMotif();
  }
  function towerFlash() {
    el.app.classList.remove('tower-glitch'); void el.app.offsetWidth;
    el.app.classList.add('tower-glitch');
    clearTimeout(G.flashTimer); G.flashTimer = setTimeout(function () { el.app.classList.remove('tower-glitch'); }, 950);
  }
  function lowLevel() {
    var s = G.st;
    if (!s || !G.inGame || G.replay || s.flags.hidden_run) return 0;
    return s.energy <= 2 ? 2 : (s.energy <= 3 ? 1 : 0);
  }
  function applyPose(p) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return;
    var has = Object.prototype.hasOwnProperty;
    Object.keys(p).forEach(function (id) {
      var spec = A.POSES && has.call(A.POSES, id) ? A.POSES[id] : null, v = p[id];
      if (!spec) return;
      if (v == null || v === '' || v === 'none' || (Array.isArray(v) && !v.length)) { delete G.view.poses[id]; return; }
      var keep = [], once = [];
      (Array.isArray(v) ? v : [v]).forEach(function (n) {
        if (typeof n !== 'string' || !has.call(spec, n)) return;
        var to = POSE_ONCE[n] ? once : keep;
        if (to.indexOf(n) < 0) to.push(n);
      });
      if (!keep.length && !once.length) return;
      if (keep.length) G.view.poses[id] = keep; else delete G.view.poses[id];
      if (once.length) { G.poseOnce[id] = once; G.view.faces[id] = POSE_ONCE[once[0]]; }
    });
  }
  function poseNames(id) { return ((G.view.poses && G.view.poses[id]) || []).concat(G.poseOnce[id] || []); }
  function poseOpts(id, names) {
    var spec = (A.POSES && A.POSES[id]) || {}, o = {};
    names.forEach(function (n) { var p = spec[n]; if (p) for (var k in p) o[k] = p[k]; });
    return o;
  }
  function resetPoses() { G.view.poses = {}; G.poseOnce = {}; }

  function renderChars(speaker) {
    var show = G.view.show.slice(0, 2), stick = lowLevel() === 2, after = !!(G.st && G.st.flags.ending_plain);
    for (var i = 0; i < 2; i++) {
      var s = slots[i], id = show[i];
      if (!id) { s.classList.remove('on'); s.dataset.k = ''; s.innerHTML = ''; continue; }
      var alt = stick && id !== 'wolf' ? 'stick' : null, pn = alt ? [] : poseNames(id);
      var face = G.view.faces[id] || 'neutral', k = id + ':' + face + (stick ? ':s' : '') + (after ? ':a' : '') + (pn.length ? ':' + pn.join('+') : '');
      if (s.dataset.k !== k && !s.classList.contains('vfx-lock')) {
        var entering = !s.dataset.k || s.dataset.k.split(':')[0] !== id, po = poseOpts(id, pn);
        po.alt = alt; po.after = after;
        s.innerHTML = A.portrait(id, face, po); s.dataset.k = k;
        if (entering) { s.classList.remove('enter'); void s.offsetWidth; s.classList.add('enter'); }
      }
      s.classList.add('on');
      s.classList.toggle('dim', !!speaker && show.length > 1 && speaker !== id);
    }
  }

  function computeRelevant(scene) {
    var set = [];
    function add(id) { if (R.NPCS.indexOf(id) >= 0 && set.indexOf(id) < 0) set.push(id); }
    (scene && scene.lines || []).forEach(function (l) { var sp = R.parseSpeaker(l[0]); if (sp.kind === 'char' || sp.kind === 'msg') add(sp.id); var o = R.lineOpts(l); (o.show || []).forEach(add); });
    (scene && scene.choices || []).forEach(function (c) { var fx = c.fx || {}; Object.keys(fx.perceived || {}).forEach(add); });
    return set;
  }
  var lastLow = -1;
  function applyLow() {
    var lv = lowLevel();
    el.app.classList.toggle('low1', lv >= 1);
    el.app.classList.toggle('low2', lv === 2);
    if (lv !== lastLow) { lastLow = lv; if (AU.setDegrade) AU.setDegrade(lv === 2 || el.app.classList.contains('vfx-blur')); renderChars(); }
  }
  function updateHud() {
    applyLow();
    if (!G.st || G.st.flags.hidden_run || !G.inGame) { el.hud.hidden = true; el.chaptag.hidden = true; updateDebug(); return; }
    var s = G.st, list = [];
    G.view.show.forEach(function (id) { if (R.NPCS.indexOf(id) >= 0 && list.indexOf(id) < 0) list.push(id); });
    G.relevant.forEach(function (id) { if (list.indexOf(id) < 0) list.push(id); });
    list = list.slice(0, 3);
    var h = '<div class="grp margin-l">' +
      '<span class="stat' + (s.energy <= 3 ? ' low' : '') + '" title="身心 ' + s.energy + '/10">身心<b>' + s.energy + '</b></span>' +
      '<span class="stat" title="夜航笔记 ' + s.own + '/10">夜航<b>' + s.own + '</b></span></div>';
    h += '<div class="grp right margin-r"><div class="aff"><button class="aff-btn" data-u="aff" aria-expanded="false">好感</button><div class="aff-panel" hidden>';
    if (list.length) list.forEach(function (id) { h += '<div class="row" title="' + esc(nameOf(id)) + '：你以为 ' + s.perceived[id] + '/10"><span class="nm">' + esc(nameOf(id)) + '</span><b class="val">' + s.perceived[id] + '</b></div>'; });
    else h += '<div class="row"><span class="nm">—</span></div>';
    h += '</div></div></div>';
    el.hud.innerHTML = h;
    el.hud.hidden = !!G.replay;
    updateChapterTag();
    updateDebug();
  }
  function updateChapterTag() {
    var ch = G.chapter, show = !!(ch && G.inGame && !G.replay && ch.title);
    el.chaptag.hidden = !show;
    if (!show) { el.chaptag.textContent = ''; return; }
    el.chaptag.textContent = (ch.id === 'hidden' ? '隐藏章' : '第' + (NUM[ch.no] || ch.no) + '章') + ' · ' + ch.title;
  }

  function chapterByNo(no) { return no === 11 ? STORY.chapters.hidden : STORY.byNo[no]; }

  function newGame() {
    G.st = freshState();
    G.backlog = [];
    goChapter(1);
  }

  function enterGameUI() {
    G.inGame = true;
    if (!el.title.hidden) { clearTimeout(G.titleTimer); stopMotif(); } // 从标题进游戏：标题的八音盒收掉，别压在章节标题卡上
    el.title.hidden = true; el.overlay.hidden = true;
    el.quick.hidden = false;
    el.app.classList.remove('end-night', 'letter-mode');
    stopAuto(); stopSkip();
  }

  function goChapter(no, fromSnapshot) {
    enterGameUI();
    var ch = chapterByNo(no);
    if (!ch) {
      if (G.st && no <= 10) { G.st.chapter = no; autosave({ phase: 'chapter', chapterId: 'ch' + (no < 10 ? '0' : '') + no, chapterNo: no, chapterTitle: '', sceneId: null, idx: -1, snippet: '本章尚未完成' }); }
      return showMissing(no);
    }
    ensureState(G.st);
    G.chapter = ch; G.st.chapter = no;
    G.replay = false; el.app.classList.remove('replay'); el.rhud.hidden = true;
    G.view.show = []; G.view.faces = {}; resetPoses(); renderChars();
    if (!fromSnapshot && ch.id !== 'hidden') {
      GLOBAL.reached[ch.id] = { no: no, title: ch.title, st: R.clone(G.st), t: Date.now() };
      noteRun(G.st); saveGlobal();
    }
    autosave({ phase: 'chapter', chapterId: ch.id });
    clearStageText();
    setMusic('none');
    chapterCard(ch, function () { enterScene(ch.start); });
  }

  function clearStageText() {
    el.dialog.hidden = true; el.choices.hidden = true; el.sys.hidden = true; el.msgpop.hidden = true; el.msgpop.innerHTML = '';
    resetWall(); el.app.classList.remove('wolf-on'); endKeyMoment();
    clearVfx(); clearDeco();
  }

  function enterScene(id) {
    var f = STORY.findScene(id);
    if (!f) return errorCard('找不到场景「' + id + '」。剧本可能还没写完。');
    G.chapter = f.chapter; G.scene = f.scene; G.sceneId = id;
    if (f.chapter.no != null) G.st.chapter = f.chapter.no;
    resetPoses(); applyDeco(f.scene); // 立绘特殊态不跨场景；still / props 由场景决定
    G.tower = towerFor(f.chapter, id, f.scene);
    setBg(f.scene.bg || G.view.bg, true, f.scene.bgv);
    setMusic(f.scene.music || 'none');
    G.relevant = computeRelevant(f.scene);
    G.phoneRun = []; el.msgpop.hidden = true; el.msgpop.innerHTML = '';
    if (G.view.bg === 'phone') { el.phoneBody.innerHTML = ''; G.lastCard = null; setPhonePeer(phoneCounterpart(f.scene.lines)); drawTraces(); }
    G.seq = { kind: 'scene', lines: f.scene.lines || [], idx: -1, key: id, fx: true };
    autosave();
    updateChapterTag();
    updateHud();
    advance();
  }

  function playSeq(kind, lines, key, onDone, fx) {
    G.seq = { kind: kind, lines: lines || [], idx: -1, key: key, onDone: onDone, fx: !!fx };
    G.phoneRun = []; el.msgpop.hidden = true; resetPoses();
    advance();
  }

  function held() { return G.holdUntil && Date.now() < G.holdUntil; }
  function holdFor(sec) {
    sec = Math.max(0, Math.min(15, Number(sec) || 0)); if (!sec) return;
    G.holdUntil = Date.now() + sec * 1000; el.dialog.classList.add('holding');
    clearTimeout(G.holdTimer);
    G.holdTimer = setTimeout(function () { G.holdUntil = 0; el.dialog.classList.remove('holding'); if ((G.auto || G.skip) && G.waiting === 'line') lineDone(true, 300); }, sec * 1000);
  }

  var KEY_HOLD_SEC = 3;
  function watchDialogHeight() {
    if (!el.dialog || !el.app) return;
    var set = function (v) { if (v > 0) el.app.style.setProperty('--ui-dialog-height', Math.round(v) + 'px'); };
    set(el.dialog.getBoundingClientRect().height);
    if (typeof ResizeObserver !== 'function') return;
    var ro = new ResizeObserver(function () { set(el.dialog.getBoundingClientRect().height); });
    ro.observe(el.dialog);
  }
  var BROOCH_SVG = '<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="20" r="17" fill="none" stroke="#C9A24A" stroke-width="1.2" opacity=".7"/>' +
    '<path d="M20 6C29.5 12.5 30.5 25 20 34C9.5 25 10.5 12.5 20 6Z" fill="var(--glass-emerald, #2E7D62)" stroke="#C9A24A" stroke-width="1"/>' +
    '<path d="M20 9.5V31M20 16.5l5-4M20 21.5l-5-4M20 26l5-4" fill="none" stroke="#BFE8D3" stroke-width=".9" stroke-linecap="round"/></svg>';
  function isKeyMoment() { return !!G.keyHold; }
  function endKeyMoment() {
    clearTimeout(G.keyTimer); G.keyHold = false;
    el.app.classList.remove('key-moment'); if (el.choices) el.choices.classList.remove('key-hold');
  }
  function userAdvance() { if (held() && !G.typing) return; advance(); }

  function advance() {
    if (G.typing) return finishTyping();
    var q = G.seq; if (!q) return;
    clearTimeout(G.autoTimer);
    var i = q.idx + 1;
    while (i < q.lines.length && !R.lineVisible(G.st, q.lines[i])) i++;
    if (i >= q.lines.length) { q.idx = q.lines.length; return seqEnd(); }
    q.idx = i;
    if (q.fx) R.enterLine(G.st, q.lines[i], G.chapter && G.chapter.no);
    showLine(q.lines[i], q.key + '#' + i);
  }

  function showLine(line, key) {
    var sp = R.parseSpeaker(line[0]), text = String(line[1] == null ? '' : line[1]), o = R.lineOpts(line);
    if (Array.isArray(o.show)) G.view.show = o.show.filter(function (x) { return R.CHARS.indexOf(x) >= 0; }).slice(0, 2);
    if (o.face && (sp.kind === 'char' || sp.kind === 'msg')) G.view.faces[sp.id] = o.face;
    G.poseOnce = {}; if (o.pose) applyPose(o.pose);
    clearVfx();
    if (o.bg || o.bgv) { setBg(o.bg || G.view.bg, true, o.bgv); if (G.view.bg === 'phone') setPhonePeer(phoneCounterpart(G.seq && G.seq.lines)); }
    var wallMode = o.wall === true ? 'full' : (o.wall === 'edge' ? 'edge' : '');
    resetWall();
    var isWolf = sp.id === 'wolf';
    if (isWolf) {
      var wf = G.view.faces.wolf || 'neutral';
      el.wolf.innerHTML = A.wolfShade(wf);
      if (!el.app.classList.contains('wolf-on') && (wf === 'neutral' || wf === 'smile')) sfx('wolf');
    }
    el.app.classList.toggle('wolf-on', isWolf);
    el.app.classList.toggle('letter-mode', G.view.music === 'letter' && G.view.bg === 'paper' && sp.kind !== 'msg' && sp.kind !== 'sys');
    renderChars(sp.kind === 'char' ? sp.id : null);
    if (o.sfx && SFX.indexOf(o.sfx) >= 0) sfx(o.sfx);
    var wasRead = !!READ[key];
    markRead(key);
    if (o.motif && !(G.skip && wasRead)) playMotif(o.motif, { resolve: o.motif_resolve === true });
    el.choices.hidden = true;
    el.sys.hidden = true;
    if (sp.kind !== 'msg') { el.msgpop.hidden = true; el.msgpop.innerHTML = ''; G.phoneRun = []; }
    G.waiting = 'line';
    G.lastHold = +o.hold || 0;
    if (o.hold && !(G.skip && wasRead)) holdFor(o.hold);

    if (sp.kind === 'msg') {
      G.backlog.push({ k: 'msg', who: sp.id, t: text });
      var self = G.st && G.st.flags.hidden_run ? 'yuan' : 'me', mine = sp.id === self;
      el.dialog.hidden = true;
      if (G.view.bg === 'phone') {
        if (!mine) setPhonePeer(R.NAMES[sp.id] || sp.id, sp.id);
        addBubble(el.phoneBody, sp.id, text, o.card, mine);
        flowThread(mine);
        el.phoneBody.scrollTop = el.phoneBody.scrollHeight;
      } else {
        G.phoneRun.push(bubble(sp.id, text, o.card)); if (G.phoneRun.length > 4) G.phoneRun.shift();
        el.msgpop.innerHTML = G.phoneRun.join(''); el.msgpop.hidden = false;
      }
      AU.tick();
      lineDone(wasRead, 600 + text.length * 40 + (o.card ? 1800 : 0));
    } else if (sp.kind === 'sys') {
      G.backlog.push({ k: 'sys', t: text });
      el.dialog.hidden = true;
      el.sys.hidden = false;
      typeText(text, wasRead, el.sys, true);
    } else {
      G.backlog.push({ k: sp.kind, who: sp.id, t: text });
      el.dialog.hidden = false;
      var meSpeak = sp.id === (G.st && G.st.flags.hidden_run ? 'yuan' : 'me');
      el.dialog.className = 'dialog ' + sp.kind + (isWolf ? ' wolf' : '') + (meSpeak ? ' me-speak' : '');
      if (sp.kind === 'char') el.name.innerHTML = esc(nameOf(sp.id)) + '<span class="nseal">' + A.seal(A.CHAR_LABEL[sp.id] || '', sealColor(sp.id), 26) + '</span>';
      else el.name.innerHTML = '';
      el.text.classList.toggle('whisper', !!o.whisper);
      if (sp.kind === 'think' && !/^[（(]/.test(text)) text = '（' + text + '）';
      typeText(text, wasRead, el.text, false);
    }
    if (wallMode) showWall(wallMode);
    if (o.vfx && VFX.indexOf(o.vfx) >= 0) runVfx(o.vfx, sp);
    if (G.backlog.length > 300) G.backlog.splice(0, G.backlog.length - 300);
    updateHud();
  }

  function resetWall() {
    el.wall.classList.remove('on', 'edge');
    el.phone.classList.remove('frost-on');
    el.msgpop.classList.remove('frost-on');
    var nf = el.msgpop.querySelector('.note-frost'); if (nf) nf.remove();
  }
  function showWall(mode) {
    if (mode === 'full') return el.wall.classList.add('on');
    if (!el.phone.hidden) return el.phone.classList.add('frost-on');
    if (!el.msgpop.hidden) {
      el.msgpop.insertAdjacentHTML('afterbegin', '<div class="note-frost" aria-hidden="true">' + A.hexEdge() + '</div>');
      return el.msgpop.classList.add('frost-on');
    }
    el.wall.classList.add('on', 'edge');
  }

  function phoneCounterpart(lines) {
    var self = G.st && G.st.flags.hidden_run ? 'yuan' : 'me';
    for (var i = 0; i < (lines || []).length; i++) { var sp = R.parseSpeaker(lines[i][0]); if (sp.kind === 'msg' && sp.id !== self) return sp.id; }
    return '';
  }
  function setPhonePeer(idOrName, id) {
    var pid = id || (R.NAMES[idOrName] ? idOrName : '');
    el.phoneName.textContent = pid ? (R.NAMES[pid] || pid) : (idOrName || '');
    var rs = el.phoneDeco && el.phoneDeco.querySelector('.rseal');
    if (rs) rs.innerHTML = pid ? A.seal(A.CHAR_LABEL[pid] || '', sealColor(pid), 30) : '';
  }
  function flowThread(mine) {
    if (!el.phoneDeco || reduced()) return;
    el.phoneDeco.classList.remove('flow-r', 'flow-l'); void el.phoneDeco.offsetWidth;
    el.phoneDeco.classList.add(mine ? 'flow-r' : 'flow-l');
  }
  function drawTraces() {
    if (!el.phoneTraces) return;
    var leak = G.st ? G.st.leak : 0, n = Math.min(60, leak * 3), src = G.backlog.map(function (b) { return b.t || ''; }).join('').replace(/[\s，。、「」！？…—（）]/g, '') || '明文传讯笺转抄', h = '';
    for (var i = 0; i < n; i++) {
      var c = src.charAt(Math.floor(Math.random() * src.length)), o = (0.08 + Math.min(0.12, leak * 0.008)).toFixed(2);
      h += '<span style="left:' + (Math.random() * 92).toFixed(1) + '%;top:' + (Math.random() * 90).toFixed(1) + '%;opacity:' + o + ';transform:rotate(' + ((Math.random() - 0.5) * 30).toFixed(0) + 'deg)">' + esc(c) + '</span>';
    }
    el.phoneTraces.innerHTML = h;
  }
  function cardHtml(id, card, text) {
    if (!card || typeof card !== 'object') return '';
    var art = card.art || card.bg || 'sunrise', v = card.v, crop = card.crop, title = card.title || text || '';
    var kigo = card.kigo || (G.chapter && G.chapter.subtitle) || '';
    return '<div class="lcard"><div class="frame">' + A.cardArt(art, v, crop) + '</div><div class="cap"><span class="kigo">' + esc(kigo) + '</span><span class="t">' + esc(title) + '</span>' + A.seal(A.CHAR_LABEL[id] || '', sealColor(id), 22) + '</div></div>';
  }
  function bubble(id, text, card) {
    var self = G.st && G.st.flags.hidden_run ? 'yuan' : 'me', mine = id === self;
    var c = cardHtml(id, card, text);
    return '<div class="bubble ' + (mine ? 'mine' : 'them') + (c ? ' has-card' : '') + '"><span class="who">' + esc(mine ? '我' : nameOf(id)) + '</span>' + c + (c && card.title ? '<span class="ink">' + esc(text) + '</span>' : (c ? '' : '<span class="ink">' + esc(text) + '</span>')) + '</div>';
  }
  function addBubble(box, id, text, card, mine) {
    box.insertAdjacentHTML('beforeend', bubble(id, text, card));
    var b = box.lastElementChild;
    if (card && typeof card === 'object') {
      var lc = G.lastCard;
      if (lc && lc.mine !== mine && lc.el.parentNode === box && lc.el.nextElementSibling === b) {
        var pair = document.createElement('div'); pair.className = 'card-pair';
        box.insertBefore(pair, lc.el); pair.appendChild(lc.el); pair.appendChild(b);
        pair.insertAdjacentHTML('beforeend', '<div class="joint"><svg viewBox="0 0 100 6" preserveAspectRatio="none"><path d="M0 3H100"/></svg></div>');
        G.lastCard = null;
      } else G.lastCard = { el: b, mine: mine };
    } else G.lastCard = null;
  }

  function typeText(text, wasRead, target, sys) {
    clearInterval(G.typeTimer);
    G.full = text; G.shown = 0; G.typeTarget = target; G.typeSys = !!sys;
    var instant = SET.textSpeed >= 10 || (G.skip && wasRead) || reduced();
    el.dialog.classList.remove('done');
    if (instant) return finishTyping(wasRead);
    G.typing = true; G.typedRead = wasRead;
    target.textContent = '';
    var cps = sys ? 26 : 10 + SET.textSpeed * 9, step = 1, iv = 1000 / cps;
    if (iv < 16) { step = Math.ceil(16 / iv); iv = 16; }
    G.typeTimer = setInterval(function () {
      var from = G.shown;
      G.shown = Math.min(G.full.length, G.shown + step);
      var chunk = G.full.slice(from, G.shown);
      if (sys) { target.textContent = G.full.slice(0, G.shown); target.insertAdjacentHTML('beforeend', '<span class="caret"></span>'); if (chunk.trim()) sfx('type'); }
      else { target.insertAdjacentHTML('beforeend', '<span class="seep">' + esc(chunk) + '</span>'); if (G.shown % 2 === 0) AU.tick(); }
      if (G.shown >= G.full.length) finishTyping(wasRead);
    }, iv);
  }
  function finishTyping(wasRead) {
    clearInterval(G.typeTimer);
    if (wasRead === undefined) wasRead = G.typedRead;
    var wasTyping = G.typing;
    G.typing = false;
    var t = G.typeTarget || el.text;
    if (!G.typeSys && el.app.classList.contains('letter-mode') && /^[—\s]*韩栖$/.test(G.full.trim())) t.innerHTML = '<span class="sign">' + esc(G.full) + '</span>'; // 终章信的落款：第一次用自己的字
    else t.textContent = G.full;
    if (G.typeSys) { if (wasTyping || !wasRead) sfx('ding'); lineDone(wasRead, 1400); return; }
    el.dialog.classList.add('done');
    lineDone(wasRead, 900 + G.full.length * 55);
  }
  function lineDone(wasRead, autoMs) {
    clearTimeout(G.autoTimer);
    if (G.skip) {
      if (wasRead || DEBUG_SKIP_ALL) { G.autoTimer = setTimeout(function () { if (!held()) advance(); }, 45); return; }
      stopSkip(); toast('遇到未读文本，快进已停止。', 1600);
    }
    if (G.auto) {
      var k = 1.6 - SET.autoSpeed * 0.13;
      G.autoTimer = setTimeout(function () { if (G.auto && G.waiting === 'line' && !modalOpen() && !held()) advance(); }, Math.max(500, autoMs * k));
    }
  }
  var DEBUG_SKIP_ALL = false;

  function clearVfx() {
    G.vfxTimers.forEach(clearTimeout); G.vfxTimers = [];
    var had = el.app.classList.contains('vfx-blur') || el.app.classList.contains('vfx-box');
    el.app.classList.remove('vfx-blur', 'vfx-box');
    if (el.collage) el.collage.innerHTML = '';
    for (var i = 0; i < slots.length; i++) {
      var s = slots[i]; s.classList.remove('melt', 'box-open');
      var d = s.querySelector('.doodle'); if (d) d.remove();
      if (s.classList.contains('vfx-lock')) { s.classList.remove('vfx-lock'); s.dataset.k = ''; }
    }
    if (had) { if (AU.setDegrade) AU.setDegrade(lowLevel() === 2); renderChars(); }
  }
  function vfxSlot(prefer) {
    var show = G.view.show, idx = show.indexOf(prefer);
    if (idx < 0) idx = show.indexOf(G.st && G.st.flags.hidden_run ? 'yuan' : 'me');
    if (idx < 0) idx = show.length ? 0 : -1;
    return idx < 0 ? null : slots[idx];
  }
  function later(fn, ms) { G.vfxTimers.push(setTimeout(fn, ms)); }
  function runVfx(kind, sp) {
    if (kind === 'blur') { el.app.classList.add('vfx-blur'); if (AU.setDegrade) AU.setDegrade(true); return; }
    var who = sp.kind === 'char' ? sp.id : 'me';
    if (kind === 'melt') { var ms = vfxSlot(who); if (ms) { ms.classList.add('melt'); later(function () { ms.classList.remove('melt'); }, 900); } return; }
    if (kind === 'doodle') { var ds = vfxSlot(who); if (ds) { ds.insertAdjacentHTML('beforeend', '<div class="doodle">' + A.doodle() + '</div>'); later(function () { var d = ds.querySelector('.doodle'); if (d) d.remove(); }, 2600); } return; }
    if (kind === 'box') {
      var me = G.st && G.st.flags.hidden_run ? 'yuan' : 'me', slot = vfxSlot(me), temp = false;
      if (!slot) { slot = slots[0]; temp = true; slot.classList.add('on'); }
      slot.classList.add('vfx-lock');
      if (reduced()) { slot.innerHTML = A.portrait(me, 'neutral', { alt: 'box' }); return; } // 减少动态效果：只显示静态纸箱
      el.app.classList.add('vfx-box');
      buildCollage();
      if (AU.stinger) AU.stinger('box');
      later(function () { slot.innerHTML = A.portrait(me, 'neutral', { alt: 'box' }); }, 400);
      later(function () { slot.classList.add('box-open'); }, 2600);
      later(function () { slot.innerHTML = A.portrait(me, 'smile', { alt: 'stick' }); }, 3000);
      later(function () { sfx('page'); el.app.classList.remove('vfx-box'); el.collage.innerHTML = ''; slot.classList.remove('vfx-lock', 'box-open'); slot.dataset.k = ''; if (temp) slot.classList.remove('on'); renderChars(); }, 3500);
    }
  }
  function buildCollage() {
    if (!el.collage) return;
    var src = A.bg(G.view.bg, bgOpts(G.view.bg, G.view.bgv)).replace(/<div class="fx[\s\S]*$/, '');
    var cuts = [[0, 0, 38, 0, 30, 44, 0, 52], [38, 0, 70, 0, 62, 40, 30, 44], [70, 0, 100, 0, 100, 48, 62, 40], [0, 52, 30, 44, 34, 100, 0, 100], [30, 44, 62, 40, 66, 100, 34, 100], [62, 40, 100, 48, 100, 100, 66, 100]];
    var h = '';
    cuts.forEach(function (c, i) {
      var pts = []; for (var k = 0; k < c.length; k += 2) pts.push(c[k] + '% ' + c[k + 1] + '%');
      var dx = (Math.random() - 0.5) * 20, dy = (Math.random() - 0.5) * 20, rot = (Math.random() - 0.5) * 2;
      h += '<div class="piece" style="clip-path:polygon(' + pts.join(',') + ');transform:translate(' + dx.toFixed(0) + 'px,' + dy.toFixed(0) + 'px) rotate(' + rot.toFixed(2) + 'deg)">' + src + '</div>';
    });
    [[20, 30, -12], [58, 18, 9], [40, 64, 15]].forEach(function (t) { h += '<i class="tape" style="left:' + t[0] + '%;top:' + t[1] + '%;transform:rotate(' + t[2] + 'deg)"></i>'; });
    el.collage.innerHTML = h;
  }

  function seqEnd() {
    var q = G.seq;
    if (q.kind !== 'scene') { G.seq = null; return q.onDone && q.onDone(); }
    var sc = G.scene;
    if (sc.choices && sc.choices.length) return showChoices();
    route(R.resolveNext(G.st, sc.next));
  }

  function route(target) {
    if (target === '@ending') return startEnding();
    if (target == null || target === '@end' || target === '@title') return endChapter();
    enterScene(target);
  }

  function showChoices() {
    var vis = R.visibleChoices(G.st, G.scene);
    if (!vis.length) { if (DEBUG) toast('没有可见选项，按 next 继续'); return route(R.resolveNext(G.st, G.scene.next)); }
    stopSkip();
    var isKey = sceneIsKeyMoment(vis);
    renderChoices(vis, isKey);
    if (isKey) {
      var sec = (G.lastHold || 0) >= 2 ? 1 : KEY_HOLD_SEC;
      G.keyHold = true; el.app.classList.add('key-moment'); el.choices.classList.add('key-hold');
      if (G.keyShownFor !== G.sceneId) { G.keyShownFor = G.sceneId; sfx('wolf'); }
      clearTimeout(G.keyTimer);
      G.keyTimer = setTimeout(function () {
        G.keyHold = false; el.choices.classList.remove('key-hold');
        var f = el.choices.querySelector('.choice'); if (f && !('ontouchstart' in window)) f.focus({ preventScroll: true });
      }, sec * 1000);
    }
  }
  function sceneIsKeyMoment(vis) {
    var byId = (R.REGRETS || {});
    return vis.some(function (c) {
      if (c.key === true) return true;
      if (c.regret && typeof c.regret === 'object' && c.regret.key === true) return true;
      if (c.seize && typeof c.seize === 'object' && c.seize.key === true) return true;
      var rid = c.regret && typeof c.regret === 'object' ? c.regret.id : c.regret;
      return !!(rid && byId[rid] && byId[rid].key === true);
    });
  }
  function renderChoices(vis, isKey) {
    G.curChoices = vis; G.waiting = 'choice';
    var me = G.st && G.st.flags.hidden_run ? 'yuan' : 'me', h = isKey ? '<div class="keyhint"><span class="key-brooch" aria-hidden="true">' + BROOCH_SVG + '</span>关键抉择</div>' : '';
    vis.forEach(function (c, i) {
      var tempt = R.isTempting(G.st, c), tag = c.tag;
      var text = String(c.text || '').replace(/^🔒\s*/, '');
      h += '<button class="choice' + (tag === 'meta' ? ' meta' : '') + (tempt ? ' tempt' : '') + '" data-i="' + i + '">' +
        (tag === 'meta' ? '<span class="claw">' + A.claw() + '</span>' : '') +
        '<span class="num">' + (i + 1) + '</span><span class="ctext">' + esc(text) +
        (tag === 'meta' ? '<span class="hint">元知识：你在别人的回放里看到过这件事。</span>' : '') +
        (tempt ? '<span class="hint">好累……要不找人帮忙问问？</span>' : '') + '</span>' +
        (SET.showTags && tag && TAG_LABEL[tag] ? '<span class="ctag">' + A.icon(tag) + '<span class="lbl">' + TAG_LABEL[tag] + '</span></span>' : '') +
        '<span class="sealslot"><span class="ghost">' + A.seal(A.CHAR_LABEL[me], '#C23B22', 40) + '</span></span></button>';
    });
    el.choices.innerHTML = h; el.choices.hidden = false;
    autosave();
    var first = el.choices.querySelector('.choice'); if (!isKey && first && !('ontouchstart' in window)) first.focus({ preventScroll: true });
  }
  function choose(i) {
    var c = G.curChoices[i]; if (!c || G.waiting !== 'choice') return;
    if (isKeyMoment()) return; // 关键抉择的三秒还没走完，先不接选择
    G.waiting = null;
    var go = function () {
      el.choices.hidden = true; el.choices.classList.remove('stamping'); endKeyMoment();
      G.backlog.push({ k: 'choice', t: String(c.text || '').replace(/^🔒\s*/, '') });
      recordLetters(c);
      if (c.tag === 'boundary-respect') noteRespect(c);
      R.applyChoice(G.st, c, G.chapter && G.chapter.no);
      updateHud();
      route(R.resolveNext(G.st, c.next));
    };
    var btn = el.choices.querySelector('.choice[data-i="' + i + '"]');
    sfx('stamp');
    if (!btn || reduced()) return go();
    var me = G.st && G.st.flags.hidden_run ? 'yuan' : 'me';
    btn.querySelector('.sealslot').insertAdjacentHTML('beforeend', '<span class="stamp">' + A.seal(A.CHAR_LABEL[me], c.tag === 'meta' ? '#5E7286' : '#C23B22', 40) + '</span>');
    el.choices.classList.add('stamping'); btn.classList.add('stamped');
    setTimeout(go, 420);
  }
  function noteRespect(c) {
    var ids = Object.keys((c.fx && c.fx.trust) || {}).filter(function (k) { return c.fx.trust[k] > 0; });
    if (!ids.length && G.relevant[0]) ids = [G.relevant[0]];
    ensureState(G.st);
    ids.forEach(function (id) { G.st.respect[id] = (G.st.respect[id] || 0) + 1; });
  }

  function recordLetters(c) {
    ensureState(G.st);
    var no = G.chapter ? G.chapter.no : 0, dirty = false;
    if (c.regret && typeof c.regret === 'object' && c.regret.letter) {
      var r = c.regret;
      if (!G.st.regrets.some(function (x) { return x.id === r.id; })) G.st.regrets.push({ id: r.id || ('R?' + no), ch: no, to: r.to || '', letter: String(r.letter), key: !!r.key, prism: r.prism ? String(r.prism) : '' });
      if (!G.st.flags.hidden_run) { GLOBAL.letters[r.id || ('R?' + no)] = { to: r.to || '', letter: String(r.letter), ch: no, key: !!r.key, prism: r.prism ? String(r.prism) : '' }; dirty = true; }
    }
    if (c.seize && typeof c.seize === 'object') {
      var z = c.seize;
      if (!G.st.seized.some(function (x) { return x.id === z.id; })) G.st.seized.push({ id: z.id || ('R?' + no), ch: no, echo: String(z.echo || ''), key: !!z.key });
      if (!G.st.flags.hidden_run && z.id) { GLOBAL.echoes[z.id] = { echo: String(z.echo || ''), ch: no }; dirty = true; }
    }
    if (dirty) saveGlobal();
  }
  function letterBody(t) { return String(t == null ? '' : t).replace(/^\s*致[^：:\n]{1,8}[：:]\s*/, ''); }
  function toLabel(to) { return to ? '致 ' + (R.SHORT[to] || R.NAMES[to] || to) : '致 ——'; }
  function regretMeta(id) { return (R.REGRETS || {})[id] || null; }
  function isKeyLetter(r) { var m = regretMeta(r && r.id); return !!(r && r.key) || !!(m && m.key); }
  function letterHtml(r, showMeta, prism) {
    var key = isKeyLetter(r);
    return '<div class="uletter' + (key ? ' key' : '') + '"><div class="to">' + esc(toLabel(r.to)) + '</div><div class="body">' + esc(letterBody(r.letter)) + '</div>' +
      (key && prism ? '<div class="prism-note">' + esc(prism) + '</div>' : '') +
      (showMeta ? '<div class="meta">第' + (NUM[r.ch] || r.ch) + '章 · ' + esc(r.id || '') + '</div>' : '') + '</div>';
  }
  function prismOpen() {
    var no = G.chapter ? G.chapter.no : 0;
    if (no >= 9) return true;
    return !!(G.st && G.st.flags && G.st.flags.prism_arrived);
  }
  function prismFor(r) {
    var m = regretMeta(r && r.id), t = (r && r.prism) || (m && m.prism) || '';
    if (t && !GLOBAL.prismSeen) { GLOBAL.prismSeen = 1; saveGlobal(); } // 见过一次对岸的字，档案馆里的关键信也能翻到背面
    return t;
  }
  function regretPage(ch, next) {
    var s = G.st, no = ch.no;
    var rs = (s.regrets || []).filter(function (r) { return r.ch === no; }), zs = (s.seized || []).filter(function (z) { return z.ch === no; });
    if (!rs.length && !zs.length) return next();
    clearStageText(); setMusic('letter'); playMotif('musicbox', { rit: true }); // 八音盒，越走越慢
    var h = '<div class="regret-page"><h2>这一章，没有寄出的信</h2>' + rs.map(function (r) { return letterHtml(r, false, prismOpen() ? prismFor(r) : ''); }).join('') +
      (rs.length ? '' : '<p class="sum">这一章，你把想说的都寄出去了。</p>') +
      (zs.length ? '<div class="sent"><b>你寄出了：</b><br>' + zs.map(function (z) { return esc(z.echo); }).join('<br>') + '</div>' : '') +
      '<div class="actions"><button class="btn" data-go>合上</button></div></div>';
    overlayCard(h, 'letters', next);
  }
  function regretRoll(next) {
    var s = G.st || {}, rs = s.regrets || [], zs = s.seized || [];
    if (!rs.length && !zs.length) return next();
    setMusic('letter'); playMotif('musicbox', { rit: true });
    var h = '<div class="regret-page"><h2>遗憾册 · 全卷</h2><p class="sum">你一共有 ' + rs.length + ' 封信没有寄出，寄出了 ' + zs.length + ' 封。</p>' +
      rs.map(function (r) { return letterHtml(r, true, prismOpen() ? prismFor(r) : ''); }).join('') + '<p class="last">有些遗憾，就只是遗憾。</p><div class="actions"><button class="btn" data-go>合上</button></div></div>';
    overlayCard(h, 'letters', next);
  }
  function allRegretSlots() { // 全作所有 regret 选项（档案馆用来画「封着的信封」）
    var out = {};
    Object.keys(STORY.chapters).forEach(function (cid) {
      var ch = STORY.chapters[cid], sc = ch.scenes || {};
      Object.keys(sc).forEach(function (sid) { (sc[sid].choices || []).forEach(function (c) { if (c.regret && c.regret.id && !out[c.regret.id]) out[c.regret.id] = { id: c.regret.id, ch: ch.no, to: c.regret.to, key: !!c.regret.key, prism: c.regret.prism || '' }; }); });
    });
    return Object.keys(out).sort(function (a, b) { return (parseInt(a.replace(/\D/g, ''), 10) || 0) - (parseInt(b.replace(/\D/g, ''), 10) || 0); }).map(function (k) { return out[k]; });
  }

  function endChapter() {
    var ch = G.chapter;
    if (!ch) return backToTitle();
    if (ch.no === 10) { if (DEBUG) toast('第十章没有以 @ending 结束，按结局处理'); return startEnding(); }
    G.waiting = null;
    playReplay(ch, R.replayFor(ch), function () {
      var revealed = R.finishReplay(G.st, ch);
      regretPage(ch, function () {
        var card = unlockCard(ch);
        unlockPopup(card, revealed, function () {
          if (ch.id === 'hidden') {
            if (Object.keys(GLOBAL.endings).length >= 3) return congrats(backToTitle);
            return backToTitle();
          }
          goChapter(ch.no + 1);
        });
      });
    });
  }

  function playReplay(ch, rp, done) {
    if (!rp || !rp.lines) return done();
    clearStageText(); G.view.show = []; G.view.faces = {}; resetPoses(); renderChars();
    G.replay = true; el.app.classList.add('replay'); el.hud.hidden = true; el.chaptag.hidden = true; el.quick.hidden = false; applyLow();
    var pov = rp.pov;
    G.tower = towerFor(ch, null, rp);
    setBg(rp.bg || 'black', false, rp.bgv); setMusic(rp.music || 'night');
    G.relevant = pov ? [pov] : [];
    renderReplayHud(rp);
    overlayCard('<div class="card"><div class="k">他人视角 · 回放</div><h2>' + esc(rp.title || '另一半') + '</h2><p>' +
      (pov ? esc(R.NAMES[pov] || pov) + '那边，同一段时间。' : '同一段时间，另一边。') + '</p><div class="actions"><button class="btn primary" data-go>看下去</button></div></div>', 'dark', function () {
      playSeq('replay', rp.lines, 'rp:' + ch.id + (G.endRes ? ':' + G.endRes.id : ''), function () {
        var entries = G.st.ledger.filter(function (e) { return e.ch === ch.no; });
        var fin = function () { G.replay = false; el.app.classList.remove('replay'); el.rhud.hidden = true; applyLow(); done(); };
        if (!entries.length) return fin();
        clearStageText();
        overlayCard('<div class="card"><div class="k">本章账簿 · 真实状态</div><h2>你没看到的那一栏</h2>' + ledgerList(entries, true) +
          '<p class="loadinfo">' + debtLine() + '</p><div class="actions"><button class="btn primary" data-go>合上账簿</button></div></div>', 'dark', fin);
      }, false);
    });
  }
  function renderReplayHud(rp) {
    var pov = rp.pov, s = G.st, h = '<span class="tag">重抄卷 · ' + esc(pov ? (R.NAMES[pov] || pov) + '那边' : '另一边') + '</span><div class="stats">', i;
    if (pov && s.trust[pov] != null) {
      var tb = '';
      for (i = 0; i < 10; i++) tb += '<i class="' + (i < s.trust[pov] ? 'on' : '') + '"></i>';
      h += '<div class="srow"><span>真实信任</span><span class="tbar">' + tb + '</span><b>' + s.trust[pov] + '/10</b></div>';
    }
    var drops = '';
    for (i = 0; i < 20; i++) drops += '<i class="' + (i < s.leak ? 'on' + (i >= 11 ? ' hot' : '') : '') + '"></i>';
    h += '<div class="srow"><span>外流墨痕</span><span class="drops">' + drops + '</span><b>' + s.leak + '</b></div></div>';
    el.rhud.innerHTML = h; el.rhud.hidden = false;
  }
  function debtLine() { return '未结算（挂账 + 退回）：' + R.debt(G.st) + ' 笔'; }
  function ledgerList(entries, reveal) {
    if (!entries.length) return '<p>（还没有记录。）</p>';
    return '<ul class="ledger-list"><li class="lhead"><span class="c-ch">章</span><span class="c-it">款目</span><span class="c-to">付与</span><span class="st">结算</span></li>' + entries.map(function (e) {
      return '<li><span class="c-ch">' + (NUM[e.ch] || e.ch) + '</span><span class="c-it">' + A.icon(e.type) + (LEDGER_LABEL[e.type] || e.type) + (e.note ? '<small>' + esc(e.note) + '</small>' : '') + '</span><span class="c-to">' + esc(nameOf(e.to)) + '</span>' +
        (reveal ? '<span class="st ' + e.accepted + '"><em>' + ACC_LABEL[e.accepted] + '</em></span>' : '<span class="st q"><em>？</em></span>') + '</li>';
    }).join('') + '</ul>';
  }

  function unlockCard(ch) {
    var a = ch.archive; if (!a) return null;
    var id = a.id || ('card_' + ch.id);
    var isNew = !GLOBAL.cards[id];
    GLOBAL.cards[id] = { title: a.title, text: a.text, ch: ch.id, no: ch.no };
    saveGlobal();
    return { title: a.title, isNew: isNew };
  }
  function unlockPopup(card, revealed, next) {
    var h = '<div class="card"><div class="k">档案馆</div>';
    h += card ? '<h2>档案卡「' + esc(card.title) + '」</h2><p>' + (card.isNew ? '新档案卡已解锁。' : '这张卡你已经有了。') + '可以在标题画面的「档案馆」里重读。</p>' : '<h2>回放结束</h2>';
    if (revealed && revealed.length) h += '<p>🔒 你记住了 ' + revealed.length + ' 件不该知道的事。之后，有些选项会利用它们。</p>';
    h += '<div class="actions"><button class="btn primary" data-go>继续</button></div></div>';
    overlayCard(h, 'dim', next);
  }

  function startEnding() {
    G.waiting = null; stopSkip();
    var res = R.judgeEnding(G.st);
    R.markEnding(G.st, res);
    G.endRes = res;
    var E = STORY.endingsData || {};
    var data = E[res.id];
    var queue = [];
    G.tower = towerFor(STORY.byNo[10] || { no: 10 }, null, null); // 结局时誊塔全面运转、亮着灯
    if (data && data.lines) queue.push({ lines: data.lines, key: 'end:' + res.id });
    res.epilogues.forEach(function (e) { var d = E['epi_' + e]; if (d && d.lines) queue.push({ lines: d.lines, key: 'epi:' + e }); });
    clearStageText();
    var ch10 = STORY.byNo[10];
    (function nextPart() {
      var p = queue.shift();
      if (p) return playSeq('ending', p.lines, p.key, nextPart, true);
      playReplay(ch10 || {}, ch10 ? R.replayFor(ch10, res.id) : null, function () {
        if (ch10) { R.finishReplay(G.st, ch10); unlockCard(ch10); }
        endingCard(res, data);
      });
    })();
  }
  function endingCard(res, data) {
    var meta = R.endingMeta(res.id), s = G.st;
    var title = (data && data.title) || meta.name;
    var arch = (data && data.archive) || {};
    var isNew = !GLOBAL.endings[res.id];
    GLOBAL.endings[res.id] = { title: title, text: arch.text || '', t: Date.now() };
    if (R.unlocksHidden(res.id)) GLOBAL.hidden = true;
    GLOBAL.lastRun = { ending: res.id, trust: R.clone(s.trust), perceived: R.clone(s.perceived), leak: s.leak, push: s.push, own: s.own, energy: s.energy, debt: R.debt(s), seed: s.seed, bridge: s.bridge, flags: R.clone(s.flags), respect: R.clone(s.respect || {}) };
    GLOBAL.runs = (GLOBAL.runs || 0) + 1;
    noteRun(s); saveGlobal();
    Store.set('save:auto', null);
    el.app.classList.toggle('end-night', res.id === 'night');
    if (((data && data.kind) || meta.kind) === 'bad') { setMusic('none'); playMotif('musicbox', { cut: true }); } // 坏结局：主题停在二级音上，戛然而止
    var h = '<div class="card ending-card"><span class="kind">' + esc(R.KIND_LABEL[(data && data.kind) || meta.kind] || '') + '</span><h2 style="margin-top:12px">' + esc(title) + '</h2>';
    if (!data) h += '<p>（这个结局的文本尚未完成。）</p>';
    if (arch.text) h += '<p>' + esc(arch.text) + '</p>';
    if (res.epilogues.length) h += '<p class="loadinfo">附加尾声：' + res.epilogues.map(function (e) { return R.endingMeta(e).name; }).join('、') + '</p>';
    if (res.id === 'night') h += HELP_HTML;
    h += '<p class="loadinfo">' + (isNew ? '已收入结局画廊。' : '画廊里已经有这个结局。') + (R.unlocksHidden(res.id) && STORY.chapters.hidden ? ' 隐藏章「对岸」已解锁。' : (R.unlocksHidden(res.id) ? ' 隐藏章「对岸」已解锁（文本尚未完成）。' : '')) + '</p>';
    h += '<div class="actions"><button class="btn primary" data-go>合上这一卷</button><button class="btn" data-archive>打开档案馆</button></div></div>';
    G.inGame = false; applyLow();
    overlayCard(h, res.id === 'night' ? 'dim' : '', function () { regretRoll(backToTitle); }, function (o) {
      var b = o.querySelector('[data-archive]'); if (b) b.onclick = function (ev) { ev.stopPropagation(); regretRoll(function () { backToTitle(); openArchive(); }); };
    });
  }

  function startHidden() {
    if (!STORY.chapters.hidden) return toast('隐藏章「对岸」尚未完成。');
    G.st = freshState(); G.st.flags.hidden_run = true; G.backlog = [];
    goChapter(11);
  }

  var overlayNext = null;
  function overlayCard(html, cls, next, mount) {
    el.overlay.className = 'overlay' + (cls ? ' ' + cls : '');
    el.overlay.innerHTML = html; el.overlay.hidden = false; el.overlay.scrollTop = 0;
    G.waiting = 'card';
    overlayNext = function () { el.overlay.hidden = true; el.overlay.innerHTML = ''; overlayNext = null; G.waiting = null; next && next(); };
    var go = el.overlay.querySelector('[data-go]');
    if (go) { go.onclick = function (ev) { ev.stopPropagation(); overlayNext && overlayNext(); }; setTimeout(function () { go.focus({ preventScroll: true }); }, 50); }
    if (mount) mount(el.overlay);
  }
  el.overlay.addEventListener('click', function (ev) {
    if (Date.now() < G.cardLock) return;
    if (ev.target.closest('.card, .regret-page')) return; // 卡片内部点按钮才继续
    if (el.overlay.querySelector('[data-go]') && !el.overlay.querySelector('.titlecard')) return;
    overlayNext && overlayNext();
  });

  function chapterCard(ch, next) {
    var hidden = ch.id === 'hidden', no = '第' + (NUM[ch.no] || ch.no) + '话', t = String(ch.title || '');
    var name = t.split('').map(function (c) { return '<span>' + esc(c) + '</span>'; }).join('');
    var h = '<div class="titlecard' + (hidden ? ' white' : '') + '"><div class="kigo">' + esc(ch.subtitle || '') + '</div><div class="no">' + esc(no) + '</div>' +
      '<div class="name' + (t.length > 3 ? ' long' : '') + '">' + name + '</div><div class="seal">' + esc(NUM[ch.no] || ch.no) + '</div><div class="tap">点击继续</div></div>';
    var done = false, finish = function () {
      if (done) return; done = true; clearTimeout(timer);
      el.overlay.className = 'overlay ' + (hidden ? 'ink-white' : 'ink'); el.overlay.innerHTML = ''; el.overlay.hidden = false;
      setTimeout(function () { el.overlay.hidden = true; G.waiting = null; next(); }, reduced() ? 0 : 120);
    };
    overlayCard(h, hidden ? 'ink-white' : 'ink', finish);
    G.cardLock = Date.now() + 600;
    sfx('don');
    var timer = setTimeout(function () { if (overlayNext) overlayNext(); }, 1800);
  }
  function showMissing(no) {
    var label = no === 11 ? '隐藏章' : '第' + (NUM[no] || no) + '章';
    G.inGame = false;
    overlayCard('<div class="card"><div class="k">' + label + '</div><h2>本章尚未完成</h2><p>作者还在写这一章。你的进度已经自动保存，章节写好后可以从「继续」接着玩。</p>' +
      '<div class="actions"><button class="btn primary" data-go>回到标题</button>' + (DEBUG && no < 10 ? '<button class="btn" data-skipch>（调试）跳到下一章</button>' : '') + '</div></div>', 'dim', backToTitle, function (o) {
      var b = o.querySelector('[data-skipch]'); if (b) b.onclick = function (ev) { ev.stopPropagation(); el.overlay.hidden = true; G.inGame = true; goChapter(no + 1); };
    });
  }
  function errorCard(msg) {
    G.inGame = false;
    overlayCard('<div class="card"><div class="k">出错了</div><h2>这里断了一页</h2><p>' + esc(msg) + '</p><div class="actions"><button class="btn primary" data-go>回到标题</button></div></div>', 'dim', backToTitle);
  }

  function snapshot(extra) {
    var d = {
      v: 1, t: Date.now(), st: R.clone(G.st), view: R.clone(G.view), backlog: G.backlog.slice(-40),
      chapterId: G.chapter && G.chapter.id, chapterTitle: G.chapter && G.chapter.title, chapterNo: G.chapter && G.chapter.no,
      phase: 'scene', sceneId: G.sceneId, idx: G.seq && G.seq.kind === 'scene' ? G.seq.idx : -1,
      snippet: ''
    };
    var last = G.backlog[G.backlog.length - 1]; if (last) d.snippet = ((last.k === 'char' || last.k === 'msg') && last.who ? nameOf(last.who) + '：' : '') + last.t;
    if (extra) for (var k in extra) d[k] = extra[k];
    return d;
  }
  function autosave(extra) { if (G.st) Store.set('save:auto', snapshot(extra)); }
  function canSaveNow() { return G.inGame && !G.replay && G.seq && G.seq.kind === 'scene' && G.waiting !== 'card'; }
  function saveSlot(n) {
    if (!canSaveNow()) return toast('回放、结局和过场卡片中不能手动存档。');
    var ok = Store.set('save:' + n, snapshot());
    toast(ok ? '已存到存档 ' + n + '。' : '存储不可用，没能存档。');
  }
  function loadData(d) {
    if (!d || !d.st) return toast('这个存档是空的。');
    closeModal(true);
    G.st = ensureState(d.st); G.view = d.view || { bg: 'paper', music: 'none', show: [], faces: {} }; G.backlog = d.backlog || []; G.endRes = null;
    G.view.faces = G.view.faces || {}; G.view.poses = G.view.poses || {}; G.poseOnce = {}; // 旧存档没有 poses
    G.replay = false; el.app.classList.remove('replay'); el.rhud.hidden = true;
    enterGameUI();
    var ch = STORY.chapters[d.chapterId];
    if (!ch) return showMissing(d.chapterNo || 1);
    G.chapter = ch;
    if (d.phase === 'chapter') return goChapter(ch.id === 'hidden' ? 11 : ch.no, true);
    var f = STORY.findScene(d.sceneId);
    if (!f) return errorCard('存档里的场景「' + d.sceneId + '」已经不存在了。');
    G.scene = f.scene; G.sceneId = d.sceneId; G.chapter = f.chapter;
    clearStageText(); applyDeco(f.scene);
    G.tower = towerFor(f.chapter, d.sceneId, f.scene);
    var bg = G.view.bg; el.bg.dataset.id = ''; setBg(bg, false, G.view.bgv); setMusic(G.view.music || f.scene.music);
    renderChars();
    G.relevant = computeRelevant(f.scene);
    var lines = f.scene.lines || [];
    G.seq = { kind: 'scene', lines: lines, idx: d.idx, key: d.sceneId, fx: true };
    if (G.view.bg === 'phone') { // 重建传讯笺
      el.phoneBody.innerHTML = ''; G.lastCard = null; setPhonePeer(phoneCounterpart(lines));
      var self = G.st.flags.hidden_run ? 'yuan' : 'me';
      for (var i = 0; i < Math.min(d.idx, lines.length); i++) { var sp = R.parseSpeaker(lines[i][0]); if (sp.kind === 'msg' && R.lineVisible(G.st, lines[i])) addBubble(el.phoneBody, sp.id, lines[i][1], R.lineOpts(lines[i]).card, sp.id === self); }
    }
    updateHud();
    if (d.idx < 0) return advance();
    if (d.idx >= lines.length) return seqEnd();
    showLine(lines[d.idx], d.sceneId + '#' + d.idx);
  }
  function latestSave() {
    var best = null;
    ['auto', 1, 2, 3].forEach(function (k) { var d = Store.get('save:' + k, null); if (d && d.st && (!best || d.t > best.t)) best = d; });
    return best;
  }

  var modalStack = [];
  function modalOpen() { return !el.modal.hidden; }
  function openModal(title, body, opt) {
    opt = opt || {};
    modalStack.push({ title: title, body: body, opt: opt });
    renderModal();
  }
  function renderModal() {
    var m = modalStack[modalStack.length - 1];
    if (!m) { el.modal.hidden = true; el.modal.innerHTML = ''; return; }
    clearTimeout(G.autoTimer);
    var body = typeof m.body === 'function' ? m.body() : m.body;
    el.modal.innerHTML = '<div class="panel' + (m.opt.wide ? ' wide' : '') + '"><div class="panel-head"><h3>' + esc(m.title) + '</h3><button class="x" data-close aria-label="关闭">×</button></div><div class="panel-body">' + body + '</div></div>';
    el.modal.hidden = false;
    if (m.opt.mount) m.opt.mount(el.modal);
    var x = el.modal.querySelector('[data-close]'); x && x.focus({ preventScroll: true });
  }
  function closeModal(all) {
    if (all) modalStack = []; else modalStack.pop();
    renderModal();
    if (!modalOpen() && G.auto && G.waiting === 'line') lineDone(true, 800);
  }
  function rerender() { renderModal(); }
  el.modal.addEventListener('click', function (ev) {
    if (ev.target === el.modal || ev.target.closest('[data-close]')) return closeModal();
    var a = ev.target.closest('[data-act]'); if (!a) return;
    var act = a.dataset.act, arg = a.dataset.arg;
    if (ACTIONS[act]) ACTIONS[act](arg, a);
  });

  var ACTIONS = {
    resume: function () { closeModal(true); },
    save: function () { openSaveLoad('save'); },
    load: function () { openSaveLoad('load'); },
    log: function () { openBacklog(); },
    ledger: function () { openLedger(); },
    settings: function () { openSettings(); },
    help: function () { openModal('求助信息', HELP_HTML + '<p>本作不包含自伤内容。如果游戏里的某些情节让你不舒服，可以随时停下，或调低文字速度慢慢读。</p>'); },
    title: function () { closeModal(true); backToTitle(); },
    saveSlot: function (n) { saveSlot(n); rerender(); },
    loadSlot: function (n) { loadData(Store.get('save:' + n, null)); },
    tab: function (k) { ARCH_TAB = k; rerender(); },
    chapter: function (id) {
      var r = GLOBAL.reached[id]; if (!r) return;
      closeModal(true);
      G.st = ensureState(R.clone(r.st)); G.backlog = []; G.endRes = null;
      goChapter(r.no, true);
    }
  };

  function openMenu() {
    if (!G.inGame) return;
    openModal('暂停', '<div class="menu">' +
      '<button class="btn" data-act="resume">继续游戏</button>' +
      '<button class="btn" data-act="save"' + (canSaveNow() ? '' : ' disabled') + '>存档' + (canSaveNow() ? '' : '<small>回放中不可用</small>') + '</button>' +
      '<button class="btn" data-act="load">读档</button>' +
      '<button class="btn" data-act="log">回看日志</button>' +
      '<button class="btn" data-act="ledger">账簿</button>' +
      '<button class="btn" data-act="settings">设置</button>' +
      '<button class="btn" data-act="title">回到标题</button></div>');
  }

  function slotLabel(d) {
    if (!d || !d.st) return '<b>空</b><span>—</span>';
    var dt = new Date(d.t), pad = function (x) { return (x < 10 ? '0' : '') + x; };
    var when = (dt.getMonth() + 1) + '/' + dt.getDate() + ' ' + pad(dt.getHours()) + ':' + pad(dt.getMinutes());
    var ch = d.chapterId === 'hidden' ? '隐藏章' : '第' + (NUM[d.chapterNo] || d.chapterNo) + '章';
    return '<b>' + ch + ' ' + esc(d.chapterTitle || '') + '</b><span>' + when + ' · ' + esc(d.snippet || '') + '</span>';
  }
  function openSaveLoad(mode) {
    openModal(mode === 'save' ? '存档' : '读档', function () {
      var h = '<div class="slots">';
      if (!Store.ok) h += '<p>本地存储不可用，存档功能暂时无法使用。</p>';
      var keys = mode === 'save' ? [1, 2, 3] : ['auto', 1, 2, 3];
      keys.forEach(function (k) {
        var d = Store.get('save:' + k, null);
        var dis = mode === 'load' ? !(d && d.st) : !canSaveNow();
        h += '<button class="slot-btn" data-act="' + (mode === 'save' ? 'saveSlot' : 'loadSlot') + '" data-arg="' + k + '"' + (dis ? ' disabled' : '') + '><span class="no">' + (k === 'auto' ? '自动' : '存档 ' + k) + '</span><span class="info">' + slotLabel(d) + '</span></button>';
      });
      return h + '</div>';
    });
  }

  function openBacklog() {
    var list = G.backlog.slice(-120);
    var h = '<div class="backlog-list">' + (list.length ? '' : '<p>还没有内容。</p>');
    list.forEach(function (b) {
      if (b.k === 'choice') h += '<div class="bl choice">▸ 你选择了：' + esc(b.t) + '</div>';
      else if (b.k === 'msg') h += '<div class="bl"><span class="who">' + esc(b.who === 'me' ? '我' : nameOf(b.who)) + ' · 传讯笺</span>' + esc(b.t) + '</div>';
      else if (b.k === 'char') h += '<div class="bl"><span class="who">' + esc(nameOf(b.who)) + '</span>' + esc(b.t) + '</div>';
      else h += '<div class="bl narr">' + esc(b.t) + '</div>';
    });
    openModal('回看日志', h + '</div>', { mount: function (m) { var b = m.querySelector('.panel-body'); b.scrollTop = b.scrollHeight; } });
  }

  function openLedger() {
    if (!G.st) return;
    openModal('行会账簿', '<p>你记下的每一笔付出。至于对方收下了还是退回了——你并不知道。</p>' + ledgerList(G.st.ledger, false) +
      '<p class="loadinfo">共 ' + G.st.ledger.length + ' 笔。真实状态只会在他人视角的回放里出现。</p>');
  }

  function openSettings() {
    openModal('设置', function () {
      function row(k, label, min, max) { return '<label class="set-row"><span>' + label + '</span><input type="range" min="' + min + '" max="' + max + '" value="' + SET[k] + '" data-set="' + k + '"><output>' + fmt(k, SET[k]) + '</output></label>'; }
      return row('textSpeed', '文字速度', 1, 10) + row('autoSpeed', '自动播放速度', 1, 10) + row('volume', '音量', 0, 100) +
        '<label class="set-row"><span>静音</span><input type="checkbox" data-set="muted"' + (SET.muted ? ' checked' : '') + '><span></span></label>' +
        '<label class="set-row"><span>显示选项类型（剧透）</span><input type="checkbox" data-set="showTags"' + (SET.showTags ? ' checked' : '') + '><span></span></label>' +
        '<p class="loadinfo">音乐、环境声和音效都由程序实时生成，默认音量较低。系统开启「减少动态效果」时，本作会关闭动画。</p>' +
        '<div class="actions" style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" data-act="help">求助信息</button></div>';
    }, {
      mount: function (m) {
        m.querySelectorAll('[data-set]').forEach(function (inp) {
          inp.addEventListener('input', function () {
            var k = inp.dataset.set;
            SET[k] = inp.type === 'checkbox' ? inp.checked : Number(inp.value);
            var o = inp.parentNode.querySelector('output'); if (o) o.textContent = fmt(k, SET[k]);
            applySettings(); saveSettings();
          });
        });
      }
    });
  }
  function fmt(k, v) { if (k === 'textSpeed' && v >= 10) return '瞬间'; return k === 'volume' ? v + '%' : String(v); }
  function applySettings() { AU.setVolume(SET.volume / 100); AU.setMuted(SET.muted); }

  var DOSSIER = [
    { id: 'me', code: 'DB-QI', rare: 6, icon: 'j_quill', name: '代笔', born: '东方 · 县学', height: '待考', job: '书记官 · 代笔人',
      bio: '落第后东渡澜港，头一年住在「锚与烛」。白天在王立书库修复古卷，夜里在白鸢邮笺社替人写信，按字计酬。自己写一本没人读的旅志《夜航笔记》。',
      f: ['领口别着一枚叶形的翠绿小胸针，是落第那年一位老师送的。「绿的，还没熟。」他说不清它的意思，只是一直戴着。', '口头禅是「不能逃」。替别人把话说好，是他最熟练的手艺；自己的话，他一次也没送出去过。', '书箱底层压着一册翻烂的策论，扉页写着「这次一定」。'],
      promo: [['own_published', '第九章 · 把书稿发在自己的频道'], ['crunch', '某一夜 · 通宵赶工'], ['ending_lamp', '结局 · 自己的灯'], ['ending_plain', '终章 · 第一封自己的信']] },
    { id: 'yuan', code: 'DB-YU', rare: 6, icon: 'j_compass', name: '海图', born: '澜港 · 潮汐巷', height: '待考', job: '海图师 · 手装绘本作者',
      bio: '望月礼仪学院宫廷礼服与纹章科肄业。在潮汐巷开小工坊，画旧物、港口与传说；手装的《海图》小册读者不多，都很忠实。',
      f: ['举止挑不出错，嘴很硬。「礼仪是给别人的体面，不是给自己的枷锁。」', '只想安安静静地画画、吃饱饭。最怕自己的话被拿去别处议论，也怕欠人情。「草稿不见客。」', '工坊墙上挂着一件月白色的礼服，没有完成。那是她退学时没交的毕业作品。'],
      promo: [['paid', '第一章 · 按字计酬，收下稿费'], ['refused_pay', '第一章 · 不收稿费'], ['cover_respected', '第二章 · 封面她自己画'], ['lh_respected', '第三章 · 不再推她去灯塔席'], ['lh_pushed', '第三章 · 推她去灯塔席'], ['proof', '第四章 · 封印典籍'], ['told_bet', '第五章 · 说出赌约'], ['hid_bet', '第五章 · 瞒下赌约'], ['named_submit', '第六章 · 以她的名义递信'], ['broke_pact', '第八章 · 私下打破契约'], ['returned_gifts', '第八章 · 礼物连同蜡封退回'], ['ending_plain', '终章 · 一页明文'], ['ending_side', '终章 · 并肩']] },
    { id: 'qiu', code: 'DB-QU', rare: 5, icon: 'j_type', name: '此人', born: '北方某城', height: '待考', job: '铸字匠',
      bio: '为北方一座城的书坊铸铅字。与韩栖是多年笔友，只通过传讯笺往来，从未见面。',
      f: ['自称「此人」。比喻多半和铸字、和冰有关。「字与字之间要留铅空。」', '想靠近，又怕被刺伤，所以留一层冰。说的话只说给一个人听；被转抄一次，冰就厚一层。', '为《夜航笔记》铸了一整套活字，独缺一个「信」字。'],
      promo: [['told_qiu', '第一章 · 事无巨细地讲给此人听'], ['qiu_heeded', '第二章 · 听了此人的提醒'], ['qiu_argued', '第二章 · 和此人争了一句'], ['ch7_used_qiu', '第七章 · 借了此人的名义'], ['qiu_gone', '第七章 · 断联'], ['qiu_back', '旧窗口 · 回来了']] },
    { id: 'cheng', code: 'DB-CH', rare: 4, icon: 'j_feather', name: '公证', born: '北方', height: '待考', job: '信鸽站见习公证人',
      bio: '信鸽站的见习公证人，知秋最好的朋友。凡事先问授权；公证簿里夹着四五条颜色不同的书签带。',
      f: ['「你来这里，是要我做门，还是做路？」', '只给韩栖「一条信息」的额度，说完直话会补一句致歉。', '渡口那一面，TA 是真心想见的。帽子上的黄铜号牌是「07」。'],
      promo: [['ending_window', '旧窗口 · 笺又亮了']] },
    { id: 'yan', code: 'DB-YA', rare: 4, icon: 'j_key', name: '调停', born: '澜港', height: '待考', job: '「灯匠会」创办人',
      bio: '二十岁。旅店「锚与烛」是他姑母的产业，他在阁楼开了灯匠会，街巷上空那些挂灯的缆绳都归他们管。也是港口行会的调停人。',
      f: ['说话先给结论，再编号。腰上的钥匙串比账簿还重。', '收到一只极贵的八音盒，他先问：「你的钱够不够用？」', '腰带上那枚方印的印面只有一个字：准。'],
      promo: [['broke_pact', '第八章 · 契约被打破'], ['final_told_yan', '终章 · 先告诉罗砚']], always: '第八章 · 契约 · 三方蜡封', alwaysAt: 'ch08' },
    { id: 'man', code: 'DB-MA', rare: 4, icon: 'j_feather', name: '信鸽', born: '澜港', height: '待考', job: '学院研究生',
      bio: '学院在读，最早的《海图》读者之一，后来成了韩栖的朋友。口头禅是「我来帮你问问」。',
      f: ['跑得很快，总抱着一摞笔记。句尾带「嘛」「捏」。', '想被当成一个人，而不只是一只传话的信鸽。最怕被两边同时怀疑。', '请他给合唱队写过一首船歌，署名是「词：夜航」。'],
      promo: [['asked_man', '第三章 · 托小满去打听'], ['ending_window', '旧窗口']] },
    { id: 'ye', code: 'DB-YE', rare: 4, icon: 'j_lantern', name: '夜灯', born: '澜港', height: '待考', job: '夜班药剂师',
      bio: '在炼金药铺值夜班。许鸢的另一位仰慕者，爱送精致的东西。',
      f: ['戴一双紫色手套，提一盏小灯。感叹号很多，最爱说「真诚」。', '以为自己是盟友，后来发现自己是情报来源。', '药铺的账上，夜班从来不记加班。TA 说，灯总得有人守。'],
      promo: [['ye_ally', '第六章 · 结成「同盟」'], ['ye_distance', '第六章 · 保持距离'], ['ye_source', '第六章 · 成了情报来源'], ['ye_released', '第六章 · 放 TA 走']] },
    { id: 'geng', code: 'DB-GE', rare: 5, icon: 'j_scroll', name: '史官', born: '不明', height: '待考', job: '编年史官',
      bio: '精灵。年轻时随银枝勇者远行，如今在各城之间游走写编年史，与韩栖是多年笔友。',
      f: ['收集没用的小魔法，比如让茶永远温在七分。「十年？那不就是前几天的事吗。」', '只能变出见过的花。没见过的，变不出来。', '他知道勇者真正被记住的是什么：不是伟业，是小事。'],
      promo: [['ending_window', '旧窗口']] },
    { id: 'zhe', code: 'DB-ZH', rare: 3, icon: 'j_gear', name: '机关', born: '东港', height: '待考', job: '机关匠人',
      bio: '东港的义肢与机关匠人。本人没有义肢，那是他们做给别人的东西。肩上停着一只发条鸟。',
      f: ['额头上推着一副黄铜放大目镜，一长一短。', '和许鸢联手做成了一件机关海图。「没有那次牵线，就不会有这个企划。」', '手指上缠着几圈细布条，是做细活磨的。'],
      promo: [] },
    { id: 'mom', code: 'DB-MO', rare: 6, rareNote: '限定 · 不复刻', icon: 'j_bowl', name: '一碗', born: '东方', height: '待考', job: '面铺老板',
      bio: '随儿子从东方迁来，在澜港开了一间小面铺，招牌叫「一碗」。',
      f: ['唠叨吃饭和熬夜。说不出「我爱你」，只会问「吃了没有」。', '在厨房等一个不回笺的人。面凉了，再热；又凉了。', '抽屉里每年一封没寄出的信，几乎每封都只写一句。'],
      promo: [['brushed_mom', '第五章 · 敷衍了来笺'], ['promised_home', '第五章 · 答应回家'], ['stayed_with_mom', '第九章 · 手术那晚陪床'], ['ending_breakfast', '早饭']] },
    { id: 'dad', code: 'DB-DA', rare: 1, rareNote: '每次都在', icon: 'j_lamp', name: '修灯', born: '东方', height: '待考', job: '钟表与灯具修理匠',
      bio: '修钟表和灯具，话极少。修好的灯挂在面铺门口。',
      f: ['只会塞钱、修东西。', '有一只怀表停在放榜那天申时，分针卡在 25 与 26 之间。', '九张脸几乎一样。仔细看，每一张都不一样。'],
      promo: [['stayed_with_mom', '第九章 · 手术那晚'], ['ending_breakfast', '早饭']] },
    { id: 'critic', code: 'DB-ZG', rare: 3, icon: 'j_eye', name: '单片镜', born: '澜港', height: '待考', job: '沙龙评论家',
      bio: '澜港沙龙的常客，以刻薄闻名。', f: ['单片眼镜从不摘下。', '赌约签在羊皮纸上，他从不食言——包括道歉。', '他年轻时写过一本没人读的诗集。'], promo: [['refused_bet', '第五章 · 没有打赌']], noTrust: true },
    { id: 'wolf', code: 'DB-00', rare: 0, icon: 'j_shadow', name: '影', born: '不明', height: '不明', job: '韩栖内心的影子',
      bio: '不是真实存在的人。只在韩栖想加码、想把人拉回来、熬夜到失控时出现。',
      f: ['左眼一道竖疤，两只手各倒握一把短刀，笑声尖而短。', '「你逃不掉的，我们是同一种人。」', '那两把刀其实是两支笔：削尖的羽毛笔，和东方印章的柄。'], promo: [], noTrust: true }
  ];
  var LEVELS = [4, 6, 8];
  function dossierLevel(d) {
    if (d.noTrust) return Object.keys(GLOBAL.endings).length ? 3 : (Object.keys(GLOBAL.reached).length ? 1 : 0);
    if (d.id === 'me') { var n = Object.keys(GLOBAL.reached).length; return n >= 9 ? 3 : (n >= 5 ? 2 : (n ? 1 : 0)); }
    var t = GLOBAL.bestTrust[d.id] || 0;
    if (G.st && G.st.trust && G.st.trust[d.id] != null) t = Math.max(t, G.st.trust[d.id]);
    return LEVELS.filter(function (x) { return t >= x; }).length;
  }
  function dossierTab() {
    if (!Object.keys(GLOBAL.reached).length) return '<p>开始游戏后，这里会按档案匣的格式收录每一个人。</p>';
    var L = GLOBAL.lastRun || {};
    return '<div class="dossiers">' + DOSSIER.map(function (d) {
      var name = R.NAMES[d.id] || d.id, lv = dossierLevel(d), seen = GLOBAL.dossierSeen[d.id] || 0;
      var stars = d.rare ? new Array(d.rare + 1).join('★') : '—';
      var sec = function (i) {
        var label = '档案资料' + ['一', '二', '三'][i];
        if (lv > i) return '<h5>' + label + (seen <= i ? '<span class="unlocked">已启封</span>' : '') + '</h5><p>' + esc(d.f[i]) + '</p>' + (seen <= i ? shards() : '');
        return '<h5>' + label + '</h5><div class="sealed"><i></i>封存' + (d.noTrust || d.id === 'me' ? '' : ' · 真实信任达到 ' + LEVELS[i] + ' 时开启') + '</div>';
      };
      var flags = GLOBAL.flagsSeen || {}, recs = d.promo.filter(function (p) { return flags[p[0]]; }).map(function (p) { return p[1]; });
      if (d.always && GLOBAL.reached[d.alwaysAt]) recs.unshift(d.always);
      if (!d.noTrust && d.id !== 'me' && L.trust && L.trust[d.id] != null) recs.push('上一局：真实信任 ' + (R.INIT_TRUST[d.id] != null ? R.INIT_TRUST[d.id] + ' → ' : '') + L.trust[d.id] + '（你以为 ' + L.perceived[d.id] + '）');
      var resp = Math.min(6, (L.respect && L.respect[d.id]) || 0), pot = '';
      for (var k = 0; k < 6; k++) pot += '<i class="' + (k < resp ? 'on' : '') + '"></i>';
      GLOBAL.dossierSeen[d.id] = Math.max(seen, lv);
      return '<article class="dossier"><div class="lp"><div class="code">' + esc(d.code) + '</div>' + A.barcode(d.id) +
        '<div class="rare">' + stars + (d.rareNote ? '<small>' + esc(d.rareNote) + '</small>' : '') + '</div>' +
        '<div class="por">' + (lv ? A.portrait(d.id, 'neutral') : A.silhouette(d.code.length * 7)) + '</div><div class="stripe"></div></div>' +
        '<div class="rp"><div class="hdr"><h4>' + esc(name) + '</h4>' + A.icon(d.icon) + '</div>' +
        '<h5>基础档案</h5><dl><dt>代号</dt><dd>' + esc(d.name) + '</dd><dt>本名</dt><dd>' + esc(name) + '</dd><dt>职业</dt><dd>' + esc(d.job) + '</dd><dt>籍贯</dt><dd>' + esc(d.born) + '</dd><dt>身高</dt><dd>' + esc(d.height) + '</dd></dl>' +
        '<h5>客观履历</h5><p>' + esc(d.bio) + '</p>' + sec(0) + sec(1) + sec(2) +
        '<h5>晋升记录</h5>' + (recs.length ? '<ul class="promo">' + recs.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '<p class="sealed"><i></i>还没有记录</p>') +
        (d.noTrust ? '' : '<h5>潜能</h5><div class="pot" title="上一局在这个人身上尊重边界的次数">' + pot + '</div>') + '</div></article>';
    }).join('') + '</div>';
  }
  function shards() { var h = ''; for (var i = 0; i < 6; i++) { var a = i / 6 * Math.PI * 2; h += '<i class="shard" style="right:20px;top:40px;--dx:' + (Math.cos(a) * 40).toFixed(0) + 'px;--dy:' + (Math.sin(a) * 40).toFixed(0) + 'px"></i>'; } return h; }

  function regretTab() {
    var slots = allRegretSlots(), got = GLOBAL.letters || {};
    if (!slots.length && !Object.keys(got).length) return '<p>还没有发现过没有寄出的信。</p>';
    var ids = slots.length ? slots : Object.keys(got).map(function (k) { return { id: k, ch: got[k].ch, to: got[k].to }; });
    var n = ids.filter(function (s) { return got[s.id]; }).length;
    return '<p class="loadinfo">跨周目收集：' + n + ' / ' + ids.length + '。有些信，要走过「当年那条路」才写得出来。</p><div class="env-grid">' + ids.map(function (s) {
      var g = got[s.id];
      var key = !!(s.key || (g && g.key)), pz = (g && g.prism) || s.prism || '';
      if (g) return '<div class="env' + (key ? ' key' : '') + '"><div class="to">' + esc(toLabel(g.to)) + '</div>' + esc(letterBody(g.letter)) +
        (key && pz && GLOBAL.prismSeen ? '<div class="prism-note">' + esc(pz) + '</div>' : '') +
        '<div class="meta">第' + (NUM[g.ch] || g.ch) + '章 · ' + esc(s.id) + (key ? ' · ★' : '') + (GLOBAL.echoes[s.id] ? ' · 也寄出过一次' : '') + '</div></div>';
      return '<div class="env sealed' + (key ? ' key' : '') + '"><div class="hint">第' + (NUM[s.ch] || s.ch) + '章 · ' + (key ? '一封很重的信' : '一封封着的信') + '</div></div>';
    }).join('') + '</div>';
  }

  var ARCH_TAB = 'cards';
  function openArchive() {
    openModal('档案馆 · 编年史', function () {
      var h = '<div class="tabs">' + [['cards', '档案卡'], ['people', '人物档案'], ['letters', '遗憾册'], ['endings', '结局画廊'], ['truth', '真实信任'], ['tips', '二周目提示']].map(function (t) {
        return '<button data-act="tab" data-arg="' + t[0] + '" class="' + (ARCH_TAB === t[0] ? 'on' : '') + '">' + t[1] + '</button>';
      }).join('') + '</div>';
      if (ARCH_TAB === 'cards') {
        h += '<div class="cards-grid">';
        for (var no = 1; no <= 11; no++) {
          var ch = chapterByNo(no), id = ch && ch.archive && ch.archive.id || (no === 11 ? 'card_hidden' : 'card_ch' + (no < 10 ? '0' : '') + no);
          var c = GLOBAL.cards[id];
          var label = no === 11 ? '隐藏章' : '第' + NUM[no] + '章';
          if (c) h += '<div class="acard"><div class="meta">' + label + '</div><h4>' + esc(c.title) + '</h4>' + esc(c.text) + '</div>';
          else h += '<div class="acard locked">' + A.silhouette(no * 7) + '<div class="meta">' + label + '</div>' + (no === 11 ? '达成真结局后，去对岸看看。' : '看完这一章的回放后解锁。') + '</div>';
        }
        h += '</div>';
      } else if (ARCH_TAB === 'people') {
        h += dossierTab(); saveGlobal();
      } else if (ARCH_TAB === 'letters') {
        h += regretTab();
      } else if (ARCH_TAB === 'endings') {
        h += '<div class="cards-grid">';
        R.ENDINGS.forEach(function (e, i) {
          var g = GLOBAL.endings[e.id];
          if (g) h += '<div class="acard"><div class="meta">' + esc(R.KIND_LABEL[e.kind]) + '</div><h4>' + esc(g.title || e.name) + '</h4>' + esc(g.text || '') + '</div>';
          else h += '<div class="acard locked">' + A.silhouette(i * 13 + 5) + '<div class="meta">' + esc(R.KIND_LABEL[e.kind]) + ' · ？？</div>' + esc(e.hint) + '</div>';
        });
        h += '</div><p class="loadinfo">已收集 ' + Object.keys(GLOBAL.endings).length + ' / ' + R.ENDINGS.length + '</p>';
      } else if (ARCH_TAB === 'truth') {
        var L = GLOBAL.lastRun;
        if (!L) h += '<p>完成一次结局后，这里会显示那一局里「你以为的好感」和「真实信任」的对照。</p>';
        else {
          h += '<p>上一局结局：<b>' + esc(R.endingMeta(L.ending).name) + '</b>。外流值 ' + L.leak + '，越界 ' + L.push + ' 次，未结算 ' + L.debt + ' 笔，传话 ' + (L.bridge || 0) + ' 次，心意种子 ' + L.seed + '。</p>';
          h += '<table class="compare"><tr><th>人</th><th>你以为的好感</th><th>真实信任</th></tr>';
          R.NPCS.forEach(function (id) {
            if (L.perceived[id] == null) return;
            h += '<tr><td>' + esc(R.NAMES[id]) + '</td><td><span class="bar p" style="width:' + L.perceived[id] * 9 + 'px"></span> ' + L.perceived[id] + '</td><td><span class="bar c" style="width:' + L.trust[id] * 9 + 'px"></span> ' + L.trust[id] + '</td></tr>';
          });
          h += '</table>';
        }
      } else {
        h += '<p>· 每章结束时的回放会让你知道一些本不该知道的事。下一次，它们会变成带 🔒 的选项——用不用，由你。</p>' +
          '<p>· 「直接问」永远在那里，也永远不会被锁住。</p>' +
          '<p>· 「你以为的好感」和「真实信任」是两个数。只有一个会显示在屏幕上。</p>' +
          '<p>· 很累的时候，「找人帮忙问问」会显得格外顺手。</p>' +
          '<p>· 账簿上的问号，第八章前后会被一次算清。</p>' +
          '<p>· 有一个答案每局都不一样，而且只能当面问出来。</p>' +
          '<p>· 遗憾册里封着的信，要走过另一条路才写得出来。</p>' +
          (Object.keys(GLOBAL.endings).length >= 3 ? '<p>· 结局会叠加：朋友、家人、自己的灯，满足条件时会在主结局之后多亮一会儿。</p>' : '');
      }
      return h;
    }, { wide: true });
  }

  function openChapterSelect() {
    openModal('章节选择', function () {
      var ids = Object.keys(GLOBAL.reached).sort(function (a, b) { return GLOBAL.reached[a].no - GLOBAL.reached[b].no; });
      if (!ids.length) return '<p>还没有到达过任何章节。开始游戏后，到过的章节会出现在这里。</p>';
      return '<p class="loadinfo">从章节开头重新进入，数值沿用你最近一次到达该章时的状态。</p><div class="chap-list">' + ids.map(function (id) {
        var r = GLOBAL.reached[id], exists = !!STORY.chapters[id];
        return '<button class="slot-btn" data-act="chapter" data-arg="' + id + '"' + (exists ? '' : ' disabled') + '><span class="no">第' + NUM[r.no] + '章</span><span class="info"><b>' + esc(r.title) + '</b><span>' + (exists ? '' : '本章尚未完成') + '</span></span></button>';
      }).join('') + '</div>';
    });
  }

  function openAbout() {
    openModal('关于', '<p><b>《明文 Plaintext》</b>是一部网页视觉小说。</p>' +
      '<p><b>本作纯属虚构。</b>澜港、王立书库、星潮祭和所有人物都是虚构的；如与现实中的人物、地点或事件相似，纯属巧合。</p>' +
      '<p>全部美术为程序绘制的「泥金写本 × 水墨 × 彩窗」风格（羊皮纸、青金石蓝、朱砂红、泥金），音乐用拨弦、竖琴、风笛与古琴的音色由浏览器实时合成。</p>' +
      '<p>本作涉及过劳、人际冲突、控制与越界行为；不包含自伤内容。</p>' +
      '<h4 class="about-h">致谢</h4>' +
      '<p>立绘：本机以 Animagine XL 4.0（CreativeML Open RAIL++-M 许可）生成，部分角色参考 OpenAI 图像生成定稿后重绘；去背景：rembg isnet-anime。背景与音乐：程序绘制与 WebAudio 合成。本作为原创同人化改编，人物与地名均为化名。</p>' +
      '<p class="loadinfo">快捷键：空格 / 回车 推进，数字键 选择，Esc 菜单，A 自动，S 快进，L 日志。<br>已加载：' + esc(LOAD.ok.join('、') || '无') + (LOAD.missing.length ? '<br>尚未完成：' + esc(LOAD.missing.join('、')) : '') + '</p>');
  }

  var CONGRATS = [
    ['me', '恭喜你。'], ['man', '恭喜你嘛！……这次是我自己想说的捏。'], ['ye', '恭喜你！真诚地！'],
    ['yan', '（远洋来笺）结论：恭喜你。——新大陆学院'], ['qiu', '此人在很远的地方，也恭喜你。'],
    ['cheng', '恭喜你。这一句没走任何程序，是我自己要说的。'], ['zhe', '恭喜。那张机关海图，署名还是你在前。'],
    ['geng', '恭喜。不是前几天的事，是今天的。'], ['mom', '恭喜你。吃饭了没有？'], ['dad', '嗯。恭喜。'], ['critic', '……勉强，恭喜你。']
  ];
  function congratsList() {
    var src = STORY.congratsData, out = [];
    if (Array.isArray(src)) src.forEach(function (c) {
      var id = Array.isArray(c) ? c[0] : (c && typeof c === 'object' ? (c.id || c.who) : null), t = Array.isArray(c) ? c[1] : (c && typeof c === 'object' ? c.text : null);
      if (typeof id !== 'string' || R.CHARS.indexOf(id) < 0 || id === 'wolf' || id === 'yuan') return;
      if (typeof t !== 'string' || !t.trim()) return;
      out.push([id, t]);
    });
    return out.length ? out.slice(0, 16) : CONGRATS;
  }
  function congrats(done) {
    clearStageText(); G.view.show = []; renderChars(); el.hud.hidden = true; el.chaptag.hidden = true; el.quick.hidden = true;
    setBg('paper'); setMusic('warm');
    var LIST = congratsList(), half = Math.ceil(LIST.length / 2), row = '';
    LIST.forEach(function (c, i) {
      if (i === half) row += '<span class="gap"></span>';
      row += '<div class="cg-fig" data-i="' + i + '">' + A.portrait(c[0], 'smile', { alt: 'stick' }) + '</div>';
    });
    overlayCard('<div class="congrats"><div class="cg-line" aria-live="polite"><span class="cg-who"></span><span class="cg-text"></span></div>' +
      '<div class="cg-center">' + A.portrait('yuan', 'soft') + '</div><div class="cg-row">' + row + '</div><div class="tap">点击继续</div></div>', 'cg', function () {});
    var o = el.overlay, step = -1, timer = null, figs = o.querySelectorAll('.cg-fig');
    var who = o.querySelector('.cg-who'), text = o.querySelector('.cg-text'), center = o.querySelector('.cg-center');
    function show(i) {
      clearTimeout(timer); step = i;
      if (i < LIST.length) {
        var c = LIST[i];
        figs[i].classList.add('on'); for (var k = 0; k < figs.length; k++) figs[k].classList.toggle('speak', k === i);
        who.textContent = R.NAMES[c[0]]; text.textContent = '「' + c[1] + '」';
        if (AU.applause) AU.applause(1.2);
      } else if (i === LIST.length) {
        for (var j = 0; j < figs.length; j++) figs[j].classList.remove('speak');
        center.innerHTML = A.portrait('yuan', 'smile');
        who.textContent = R.NAMES.yuan; text.textContent = '「谢谢。」';
        if (AU.applause) AU.applause(2.4);
      } else if (i === LIST.length + 1) {
        o.querySelector('.congrats').classList.add('out');
        who.textContent = ''; text.textContent = '对岸 · 完'; text.classList.add('sys');
      } else { overlayNext = null; el.overlay.hidden = true; el.overlay.innerHTML = ''; G.waiting = null; return done(); }
      timer = setTimeout(function () { show(step + 1); }, i >= LIST.length ? 3400 : 2600);
    }
    overlayNext = function () { show(step + 1); };
    show(0);
  }

  function backToTitle() {
    clearTimeout(G.autoTimer); clearInterval(G.typeTimer); stopAuto(); stopSkip();
    G.inGame = false; G.seq = null; G.waiting = null; G.replay = false; G.endRes = null; G.holdUntil = 0;
    endKeyMoment(); G.keyShownFor = null; // 关键抉择没走完就离开时，把胸针和白狼收回去
    el.app.classList.remove('replay', 'letter-mode', 'low1', 'low2'); lastLow = -1; if (AU.setDegrade) AU.setDegrade(false);
    el.rhud.hidden = true; el.hud.hidden = true; el.quick.hidden = true; el.chaptag.hidden = true;
    el.overlay.hidden = true; clearStageText(); el.phone.hidden = true;
    G.view = { bg: 'paper', bgv: null, music: 'none', show: [], faces: {}, poses: {} }; G.poseOnce = {}; renderChars(); setBg('paper'); setMusic('calm');
    if (AU.ambient) AU.ambient(null);
    stopMotif(); G.tower = null; titleMotif();
    var hasSave = !!latestSave();
    var hasHidden = GLOBAL.hidden;
    var missing = LOAD.missing, reached = Object.keys(GLOBAL.reached).length;
    el.title.innerHTML = '<div class="title-bg" aria-hidden="true"></div><div class="title-scrim" aria-hidden="true"></div>' +
      '<div class="title-word"><h1 class="logo">明文</h1><div class="logo-en">Plaintext</div><div class="logo-sub">代笔人与海图师</div></div>' +
      '<nav class="menu" aria-label="主菜单">' +
      '<button data-t="start">开始</button>' +
      '<button data-t="continue"' + (hasSave ? '' : ' disabled') + '>继续</button>' +
      '<button data-t="load">读档</button>' +
      '<button data-t="chapters">章节选择' + (reached ? '<small>' + reached + '</small>' : '') + '</button>' +
      '<button data-t="archive">档案馆<small>' + (Object.keys(GLOBAL.cards).length + Object.keys(GLOBAL.endings).length) + '</small></button>' +
      (hasHidden ? '<button class="secret" data-t="hidden">隐藏章 · 对岸</button>' : '') +
      '<button data-t="settings">设置</button>' +
      '<button data-t="about">关于</button>' +
      '</nav>' +
      '<div class="title-note">本作涉及过劳、人际冲突与越界行为，不含自伤内容。撑不住的时候，「设置 → 求助信息」里有可以联系的地方。' +
      (missing.length && LOAD.ok.length ? '<br>部分章节尚未完成：' + esc(missing.join('、')) : '') +
      (!LOAD.ok.length ? '<br>剧本文件都还没有就位，开始后会提示「本章尚未完成」。' : '') +
      '</div>';
    el.title.hidden = false;
    updateDebug();
  }
  function titleMotif() {
    clearTimeout(G.titleTimer);
    if (!AU.ok || !AU.ok()) { G.titleMotif = true; return; }
    G.titleMotif = false;
    G.titleTimer = setTimeout(function () { if (!el.title.hidden && !G.inGame) playMotif('musicbox'); }, 1200);
  }
  el.title.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-t]'); if (!b || b.disabled) return;
    var t = b.dataset.t;
    if (t === 'start') newGame();
    else if (t === 'continue') loadData(latestSave());
    else if (t === 'load') openSaveLoad('load');
    else if (t === 'chapters') openChapterSelect();
    else if (t === 'archive') openArchive();
    else if (t === 'hidden') startHidden();
    else if (t === 'settings') openSettings();
    else if (t === 'about') openAbout();
  });

  function setQuick() {
    var a = el.quick.querySelector('[data-q=auto]'), s = el.quick.querySelector('[data-q=skip]');
    a.classList.toggle('on', G.auto); a.setAttribute('aria-pressed', G.auto ? 'true' : 'false');
    s.classList.toggle('on', G.skip); s.setAttribute('aria-pressed', G.skip ? 'true' : 'false');
  }
  function toggleAuto() { G.auto = !G.auto; if (G.auto) { G.skip = false; if (G.waiting === 'line' && !G.typing) lineDone(true, 600); } else clearTimeout(G.autoTimer); setQuick(); }
  function stopAuto() { G.auto = false; clearTimeout(G.autoTimer); setQuick(); }
  function toggleSkip() {
    G.skip = !G.skip; if (G.skip) G.auto = false; setQuick();
    if (G.skip && G.waiting === 'line') {
      var q = G.seq, k = q && q.idx >= 0 && q.idx < q.lines.length ? q.key + '#' + q.idx : null;
      if (k && READ[k]) { if (G.typing) finishTyping(true); else if (!held()) advance(); }
      else { stopSkip(); toast('只能快进已读过的文本。', 1600); }
    }
  }
  function stopSkip() { G.skip = false; setQuick(); }

  el.quick.addEventListener('click', function (ev) {
    ev.stopPropagation();
    var b = ev.target.closest('[data-q],[data-u]'); if (!b) return;
    if (b.dataset.u) return toggleAff(b);
    quick(b.dataset.q);
  });
  el.hud.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-q],[data-u]'); if (!b) return;
    ev.stopPropagation();
    if (b.dataset.u) return toggleAff(b);
    quick(b.dataset.q);
  });
  function toggleAff(btn) {
    var p = btn.parentNode.querySelector('.aff-panel'); if (!p) return;
    var open = p.hidden;
    p.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.classList.toggle('on', open);
  }
  function quick(q) {
    if (q === 'log') openBacklog();
    else if (q === 'auto') toggleAuto();
    else if (q === 'skip') toggleSkip();
    else if (q === 'ledger') openLedger();
    else if (q === 'menu') openMenu();
  }

  var audioStarted = false;
  function firstGesture() {
    if (audioStarted) return; audioStarted = true;
    AU.init(); applySettings();
    if (AU.ambient && G.inGame) AU.ambient(G.view.bg, G.view.bgv);
    if (G.titleMotif && !el.title.hidden) titleMotif();
  }
  document.addEventListener('pointerdown', firstGesture, { capture: true });
  document.addEventListener('keydown', firstGesture, { capture: true });

  el.stage.addEventListener('click', function (ev) {
    if (!G.inGame || modalOpen()) return;
    var c = ev.target.closest('.choice');
    if (c) return choose(Number(c.dataset.i));
    if (ev.target.closest('.quickbar, .hud, .choices')) return;
    if (G.waiting === 'line') { if (G.skip) stopSkip(); userAdvance(); }
  });

  document.addEventListener('keydown', function (ev) {
    var k = ev.key;
    if (modalOpen()) { if (k === 'Escape') { ev.preventDefault(); closeModal(); } return; }
    if (!el.overlay.hidden && overlayNext) {
      if (k === ' ' || k === 'Enter') {
        var focusBtn = document.activeElement && document.activeElement.closest && document.activeElement.closest('.overlay button:not([data-go])');
        if (focusBtn) return;
        ev.preventDefault(); if (Date.now() >= G.cardLock) overlayNext();
      }
      return;
    }
    if (!G.inGame) return;
    if (k === 'Escape') { ev.preventDefault(); return openMenu(); }
    if (G.waiting === 'choice' && /^[1-9]$/.test(k)) { ev.preventDefault(); return choose(Number(k) - 1); }
    if ((k === ' ' || k === 'Enter') && G.waiting === 'line') {
      if (document.activeElement && document.activeElement.tagName === 'BUTTON' && k === 'Enter') return;
      ev.preventDefault(); if (G.skip) stopSkip(); return userAdvance();
    }
    if (G.waiting === 'choice' && isKeyMoment() && (k === ' ' || k === 'Enter')) { ev.preventDefault(); return; } // 关键三秒内不接受推进
    if (k === 'a' || k === 'A') toggleAuto();
    else if (k === 's' || k === 'S') toggleSkip();
    else if (k === 'l' || k === 'L') openBacklog();
  });

  var toastTimer = null;
  function toast(msg, ms) {
    el.toast.textContent = msg; el.toast.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.toast.hidden = true; }, ms || 2200);
  }

  var dbgMin = false;
  function updateDebug() {
    // The overlay is opt-in from the desk Debug menu. HUD refresh must not
    // uncover it again after the player hid it, and debug verbs in that menu
    // must not plaster a panel over the title art.
    if (el.debug.hidden) return;
    var s = G.st;
    var h = '<div><b>DEBUG</b> <button data-d="min">' + (dbgMin ? '展开' : '收起') + '</button></div><div class="dbody">';
    h += '<div>跳章：<select data-d="jump"><option value="">—</option>';
    for (var no = 1; no <= 11; no++) h += '<option value="' + no + '"' + (chapterByNo(no) ? '' : ' disabled') + '>' + (no === 11 ? '隐藏章' : '第' + no + '章') + '</option>';
    h += '</select> <button data-d="new">新状态</button></div>';
    h += '<div>背景：<select data-d="bgsel"><option value="">—</option>' + R.BGS.map(function (b) { return '<option value="' + b + '">' + b + '</option>'; }).join('') + '</select> <button data-d="bgv">变体↻</button></div>';
    h += '<div><button data-d="endch">结束本章</button><button data-d="ending">判定结局</button><button data-d="skipall">' + (DEBUG_SKIP_ALL ? '快进全部:开' : '快进全部:关') + '</button></div>';
    h += '<div><button data-d="e-">energy−</button><button data-d="e+">energy+</button><button data-d="l+">leak+</button><button data-d="p+">push+</button><button data-d="o+">own+</button><button data-d="seed">seed↔</button></div>';
    h += '<div>vfx：<button data-d="v-blur">blur</button><button data-d="v-box">box</button><button data-d="v-melt">melt</button><button data-d="v-doodle">doodle</button><button data-d="card">风景卡</button><button data-d="hold">hold3</button><button data-d="key">关键页</button></div>';
    h += '<div><button data-d="regret">遗憾册</button><button data-d="congrats">恭喜你</button><button data-d="wolfline">白狼</button><button data-d="wall">壁</button><button data-d="walledge">壁·笺缘</button></div>';
    h += '<div>pose：<button data-d="p-mask">面具</button><button data-d="p-realsmile">真笑</button><button data-d="p-magic">魔法</button><button data-d="p-nocloak">无斗篷</button><button data-d="p-none">撤掉</button></div>';
    h += '<div>场景：<button data-d="still">' + (G.deco.still ? '静止:开' : '静止:关') + '</button><button data-d="oilcloth">' + (G.deco.props.indexOf('oilcloth') >= 0 ? '油布:开' : '油布:关') + '</button></div>';
    var tw = G.towerDbg || G.tower;
    h += '<div>誊塔：' + ['auto', '0', '1', '2', '3', '4', '5', '5L'].map(function (k) { return '<button data-d="tw-' + k + '"' + ((k === 'auto' ? !G.towerDbg : G.towerDbg && (G.towerDbg.s + (G.towerDbg.lit ? 'L' : '')) === k) ? ' class="on"' : '') + '>' + (k === 'auto' ? '剧本' : (k === '5L' ? '5亮' : k)) + '</button>'; }).join('') + ' <span>' + (tw ? tw.s + (tw.lit ? ' 亮' : '') : '—') + '</span></div>';
    h += '<div>主题：' + (R.MOTIFS || []).map(function (m) { return '<button data-d="mo-' + m + '">' + m + '</button>'; }).join('') + '<button data-d="mo-resolve">full+解决</button><button data-d="mo-rit">遗憾·渐慢</button><button data-d="mo-cut">坏结局·断</button><button data-d="mo-stop">停</button></div>';
    if (s) {
      h += '<div>chapter ' + s.chapter + ' · scene ' + esc(G.sceneId || '') + ' #' + (G.seq ? G.seq.idx : '') + ' · bg ' + esc(G.view.bg) + '|' + esc(G.view.bgv || '') + '</div>';
      h += '<div>tower ' + (G.tower ? G.tower.s + (G.tower.lit ? 'L' : '') : '—') + (G.towerDbg ? '（调试 ' + G.towerDbg.s + (G.towerDbg.lit ? 'L' : '') + '）' : '') + ' · still ' + (G.deco.still ? 1 : 0) + ' · props ' + esc(G.deco.props.join(',') || '—') + ' · pose ' + esc(Object.keys(G.view.poses || {}).map(function (id) { return id + ':' + G.view.poses[id].join('+'); }).join(' ') || '—') + '</div>';
      h += '<div>energy ' + s.energy + ' · own ' + s.own + ' · leak ' + s.leak + ' · push ' + s.push + ' · bridge ' + s.bridge + ' · debt ' + R.debt(s) + ' · seed ' + s.seed + '</div>';
      h += '<div>trust ' + R.NPCS.map(function (id) { return id + ':' + s.trust[id]; }).join(' ') + '</div>';
      h += '<div>perceived ' + R.NPCS.map(function (id) { return id + ':' + s.perceived[id]; }).join(' ') + '</div>';
      h += '<div>ledger ' + s.ledger.map(function (e) { return e.ch + ':' + e.type + '>' + e.to + '=' + e.accepted; }).join(', ') + '</div>';
      h += '<div>regrets ' + (s.regrets || []).map(function (r) { return r.id; }).join(',') + ' · seized ' + (s.seized || []).map(function (r) { return r.id; }).join(',') + '</div>';
      h += '<div class="flags">flags ' + Object.keys(s.flags).join(', ') + '</div>';
      h += '<div>预测结局：' + R.judgeEnding(s).id + ' +' + R.judgeEnding(s).epilogues.join('/') + '</div>';
    }
    h += '<div>已加载：' + LOAD.ok.join(',') + '</div>' + (LOAD.missing.length ? '<div>缺失：' + LOAD.missing.join(',') + '</div>' : '') + (LOAD.broken.length ? '<div style="color:#c00">出错：' + esc(LOAD.broken.join(' | ')) + '</div>' : '');
    el.debug.innerHTML = h + '</div>';
    el.debug.classList.toggle('min', dbgMin);
    el.debug.hidden = false;
  }
  var debugBound = false;
  function bindDebugUi() {
    if (debugBound) return;
    debugBound = true;
    el.debug.addEventListener('click', function (ev) {
      ev.stopPropagation();
      var b = ev.target.closest('[data-d]'); if (!b || b.tagName === 'SELECT') return;
      var d = b.dataset.d, s = G.st;
      if (d === 'min') dbgMin = !dbgMin;
      else if (d === 'new') { G.st = freshState(); }
      else if (d === 'skipall') DEBUG_SKIP_ALL = !DEBUG_SKIP_ALL;
      else if (d === 'endch') { if (G.inGame && G.chapter) { el.overlay.hidden = true; endChapter(); } }
      else if (d === 'ending') { if (!G.st) G.st = freshState(); G.inGame = true; enterGameUI(); startEnding(); }
      else if (d === 'congrats') { closeModal(true); el.title.hidden = true; G.inGame = false; congrats(backToTitle); }
      else if (d === 'bgv') { var vs = A.bgVariants(G.view.bg), i = vs.indexOf(G.view.bgv); setBg(G.view.bg, true, vs[(i + 1) % vs.length]); }
      else if (d.indexOf('v-') === 0) { runVfx(d.slice(2), { kind: 'char', id: G.view.show[0] || 'me' }); }
      else if (d === 'hold') holdFor(3);
      else if (d === 'key') {
        if (!G.st) G.st = freshState();
        G.inGame = true; if (!G.chapter) G.chapter = { no: 1 };
        G.sceneId = 'dbg#key'; G.keyShownFor = null;
        G.scene = { lines: [], choices: [
          { text: '（调试）关键页 · 当年那条路', key: true, regret: { id: '__KEY__', letter: '（调试用的关键页正文。）' }, next: null },
          { text: '（调试）没走的那条路', next: null }
        ] };
        showChoices();
      }
      else if (d === 'card') { if (!G.st) G.st = freshState(); G.inGame = true; enterGameUI(); setBg('phone'); showLine(['msg:dad', '嗯。'], 'dbg#c1'); showLine(['msg:me', '日出。', { card: { title: '灯塔丘的日出', art: 'sunrise' } }], 'dbg#c2'); showLine(['msg:dad', '你妈说：好看。', { card: { art: 'yuan_room', v: 'night', crop: '200 80 900 600' } }], 'dbg#c3'); }
      else if (d === 'regret') { if (!G.st) G.st = freshState(); ensureState(G.st); recordLetters({ regret: { id: 'R00', to: 'yuan', letter: '那天在摊位前，我想说的其实只有一句：画你喜欢的就好。可我说了很多别的。' } }); recordLetters({ seize: { id: 'R01', echo: '你把那句话说了出口。她点了点头，没有再说什么。' } }); G.st.regrets.forEach(function (r) { r.ch = G.chapter ? G.chapter.no : 1; }); G.st.seized.forEach(function (r) { r.ch = G.chapter ? G.chapter.no : 1; }); regretPage(G.chapter || { no: 1 }, function () { regretRoll(function () { el.overlay.hidden = true; }); }); }
      else if (d === 'wolfline') { G.inGame = true; G.view.faces.wolf = 'neutral'; showLine(['wolf', '再推一把。她会回来的。'], 'dbg#w'); }
      else if (d === 'wall') { showLine(['qiu', '此人不是你的缰绳。', { wall: true, show: ['qiu'], face: 'annoyed' }], 'dbg#q'); }
      else if (d === 'walledge') { showLine(['msg:qiu', '（笺尾钤着一枚小印：勿流。）', { wall: 'edge' }], 'dbg#qe'); }
      else if (d.indexOf('p-') === 0) {
        var pz = d.slice(2), who = pz === 'magic' || pz === 'nocloak' ? 'geng' : 'yuan', pose = {};
        if (pz === 'none') showLine(['narr', '（撤掉许鸢和长庚的特殊态）', { pose: { yuan: null, geng: null } }], 'dbg#pn');
        else { pose[who] = pz; showLine([who, pz === 'realsmile' ? '谢谢。' : '……', { show: [who], face: pz === 'realsmile' ? 'neutral' : undefined, pose: pose }], 'dbg#p' + pz); }
      }
      else if (d === 'still') { G.deco.still = !G.deco.still; el.app.classList.toggle('still', G.deco.still); }
      else if (d.indexOf('tw-') === 0) {
        var tk = d.slice(3);
        G.towerDbg = tk === 'auto' ? null : { s: parseInt(tk, 10), lit: tk === '5L' };
        if (A.TOWER_BGS.indexOf(G.view.bg) < 0 && G.towerDbg) setBg('lighthouse_hill', true, 'night'); else redrawBg();
      }
      else if (d.indexOf('mo-') === 0) {
        var mk = d.slice(3);
        if (mk === 'stop') stopMotif();
        else if (mk === 'resolve') playMotif('full', { resolve: true });
        else if (mk === 'rit') playMotif('musicbox', { rit: true });
        else if (mk === 'cut') playMotif('musicbox', { cut: true });
        else playMotif(mk);
      }
      else if (d === 'oilcloth') {
        var pi = G.deco.props.indexOf('oilcloth');
        if (pi >= 0) G.deco.props.splice(pi, 1); else { G.deco.props.push('oilcloth'); if (!A.props(['oilcloth'], G.view.bg, G.view.bgv)) setBg('my_room_night', false); }
        redrawBg();
      }
      else if (s) {
        var fx = { 'e-': { energy: -1 }, 'e+': { energy: 1 }, 'l+': { leak: 1 }, 'p+': { push: 1 }, 'o+': { own: 1 } }[d];
        if (fx) R.applyFx(s, fx); if (d === 'seed') s.seed = 1 - s.seed;
      }
      updateHud();
    });
    el.debug.addEventListener('change', function (ev) {
      var t = ev.target;
      if (t.dataset.d === 'bgsel' && t.value) { setBg(t.value, true); return; }
      if (t.dataset.d !== 'jump' || !t.value) return;
      var no = Number(t.value);
      closeModal(true);
      if (no === 11) return startHidden();
      if (!G.st || G.st.flags.hidden_run) G.st = freshState();
      G.backlog = []; G.endRes = null;
      goChapter(no);
    });
    window.PT = { G: G, R: R, STORY: STORY, GLOBAL: GLOBAL, LOAD: LOAD, goChapter: goChapter, startEnding: startEnding, enterScene: enterScene, setBg: setBg, congrats: congrats,
      showLine: function (l) { showLine(l, 'dbg#' + Date.now()); }, testChoices: function (list) { G.scene = { lines: [], choices: list }; showChoices(); }, runVfx: runVfx, regretPage: regretPage, regretRoll: regretRoll, openArchive: openArchive,
      playMotif: playMotif, stopMotif: stopMotif, towerFlash: towerFlash, towerFor: towerFor, endingCard: endingCard, AU: AU };
  }
  if (DEBUG) {
    bindDebugUi();
    el.debug.hidden = false;
  }

  function deskCommand(command, arg) {
    if (command === 'overlay') {
      bindDebugUi();
      if (el.debug.hidden) { el.debug.hidden = false; updateDebug(); }
      else el.debug.hidden = true;
      return true;
    }
    if (command === 'start') { newGame(); return true; }
    if (command === 'continue') { var save = latestSave(); if (!save) return false; loadData(save); return true; }
    if (command === 'load') { openSaveLoad('load'); return true; }
    if (command === 'save') { if (!G.inGame) return false; openSaveLoad('save'); return true; }
    if (command === 'chapters') { openChapterSelect(); return true; }
    if (command === 'archive') { openArchive(); return true; }
    if (command === 'log') { if (!G.inGame) return false; openBacklog(); return true; }
    if (command === 'ledger') { if (!G.inGame) return false; openLedger(); return true; }
    if (command === 'hidden') { if (!GLOBAL.hidden) return false; startHidden(); return true; }
    if (command === 'pause') { if (!G.inGame) return false; openMenu(); return true; }
    if (command === 'title') { closeModal(true); backToTitle(); return true; }
    if (command === 'settings') { openSettings(); return true; }
    if (command === 'help') { ACTIONS.help(); return true; }
    if (command === 'about') { openAbout(); return true; }
    if (command === 'new-state') { G.st = freshState(); updateDebug(); return true; }
    if (command === 'end-chapter') {
      if (!(G.inGame && G.chapter)) return false;
      el.overlay.hidden = true; endChapter(); return true;
    }
    if (command === 'ending') { if (!G.st) G.st = freshState(); G.inGame = true; enterGameUI(); startEnding(); return true; }
    if (command === 'skip-all') { DEBUG_SKIP_ALL = !DEBUG_SKIP_ALL; if (!el.debug.hidden) updateDebug(); toast(DEBUG_SKIP_ALL ? '快进全部:开' : '快进全部:关', 1400); return true; }
    if (command === 'jump') {
      var no = Number(arg);
      closeModal(true);
      if (no === 11) { startHidden(); return true; }
      if (!G.st || G.st.flags.hidden_run) G.st = freshState();
      G.backlog = []; G.endRes = null;
      goChapter(no);
      return true;
    }
    return false;
  }

  window.MingwenDesk = {
    snapshot: function () {
      return {
        ready: true,
        inGame: !!G.inGame,
        hidden: !!GLOBAL.hidden,
        hasSave: !!latestSave(),
        debug: !!DEBUG,
        overlay: !!(el.debug && !el.debug.hidden),
        skipAll: !!DEBUG_SKIP_ALL,
      };
    },
    command: deskCommand,
  };
  window.addEventListener('message', function (ev) {
    if (ev.source !== window.parent) return;
    if (ev.origin && ev.origin !== location.origin) return;
    var data = ev.data;
    if (!data || data.type !== 'mingwen-command') return;
    deskCommand(data.command, data.arg);
  });

  function boot() {
    document.body.insertAdjacentHTML('afterbegin', A.defs());
    var tile = A.paperTile(); if (tile) document.documentElement.style.setProperty('--paper-tile', 'url(' + tile + ')');
    el.app.style.fontFamily = getComputedStyle(document.documentElement).getPropertyValue('--ui-sans') || ''; // 界面一律黑体（旧样式把 app 设成楷体）
    el.wolf.innerHTML = A.wolfShade();
    el.wall.innerHTML = A.hexWall();
    var frost = document.createElement('div'); // 右笺四缘的冰晶格（wall:'edge'），平时透明
    frost.className = 'phone-frost'; frost.setAttribute('aria-hidden', 'true'); frost.innerHTML = A.hexEdge();
    el.phone.insertBefore(frost, el.phoneBody);
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) el.app.classList.add('reduce');
    watchDialogHeight(); // 快捷栏按对话框的真实高度定位（见上面 watchDialogHeight 的说明）
    setBg('paper');
    var files = FILES.map(function (f) { return 'story/' + f + '.js'; });
    loadScripts(files, function () {
      LOAD.ok = LOAD.ok.map(function (f) { return f.replace(/^story\/|\.js$/g, ''); });
      LOAD.missing = LOAD.missing.map(function (f) { return f.replace(/^story\/|\.js$/g, ''); });
      backToTitle();
    });
  }
  boot();
})();
