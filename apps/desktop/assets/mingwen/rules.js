(function (root) {
  'use strict';

  var CHARS = ['me', 'yuan', 'qiu', 'man', 'ye', 'yan', 'geng', 'mom', 'dad', 'critic', 'wolf', 'cheng', 'zhe'];
  var NPCS = ['yuan', 'qiu', 'man', 'ye', 'yan', 'geng', 'mom', 'dad', 'cheng'];
  var SHADOWS = ['wolf'];
  var SPECIAL_SPEAKERS = ['narr', 'think', 'sys'];
  var FACES = ['neutral', 'smile', 'soft', 'curious', 'annoyed', 'angry', 'sad', 'tired', 'surprised'];
  var BGS = ['street_spring', 'fair_booth', 'library', 'my_room_night', 'yuan_room', 'cafe', 'ferry',
    'bookshop', 'hospital', 'lighthouse_hill', 'rain_street', 'phone', 'black', 'paper'];
  var MUSIC = ['calm', 'night', 'tense', 'rain', 'warm', 'camp', 'dawn', 'stage', 'collapse', 'letter', 'none'];
  var TAGS = ['give', 'ask', 'relay', 'boundary-respect', 'boundary-push', 'meta', 'rest', 'own'];
  var LEDGER_TYPES = ['labor', 'gift', 'money', 'praise', 'time'];
  var LEDGER_STATES = ['in', 'back', 'hang'];
  var FINAL_FLAGS = ['final_plain', 'final_cipher', 'final_relay', 'final_ambush'];
  var MOTIFS = ['musicbox', 'piano', 'fiddle', 'whistle', 'celesta', 'harp', 'choir', 'glitch', 'strings', 'violin', 'full'];
  var TOWER_BY_CHAPTER = [0, 0, 1, 1, 2, 3, 4, 4, 5];
  function towerAuto(no) { no = Math.floor(Number(no) || 0); return no >= 8 ? 5 : (no <= 0 ? 0 : TOWER_BY_CHAPTER[no]); }

  var NAMES = {
    me: '韩栖', yuan: '许鸢', qiu: '白知秋', man: '陶小满', ye: '程野', yan: '罗砚',
    geng: '纪长庚', mom: '方素琴', dad: '韩立山', critic: '钟先生', wolf: '白狼', cheng: '易澄', zhe: '林折'
  };
  var SHORT = {
    me: '韩栖', yuan: '许鸢', qiu: '知秋', man: '小满', ye: '程野', yan: '罗砚',
    geng: '长庚', mom: '妈妈', dad: '爸爸', critic: '钟先生', wolf: '白狼', cheng: '易澄', zhe: '林折'
  };

  var INIT_TRUST = { yuan: 3, qiu: 6, man: 4, ye: 3, yan: 5, geng: 7, mom: 8, dad: 8, cheng: 5 };
  var INIT_PERCEIVED = 3;

  var RANGE = {
    perceived: [0, 10], trust: [0, 10], leak: [0, 20], energy: [0, 10],
    own: [0, 10], push: [0, 999], bridge: [0, 999]
  };
  var SCALARS = ['energy', 'leak', 'push', 'own', 'bridge'];

  var ENDINGS = [
    { id: 'night', name: '长夜', kind: 'bad', hint: '熬夜、通宵、替她赶工，一样不落；带着见底的身心走进终章。' },
    { id: 'echo', name: '回声', kind: 'bad', hint: '能托人问就托人问，截图能转就转。说出去的话，会自己找回来。' },
    { id: 'blank', name: '白纸', kind: 'bad', hint: '调解之后「顺路」去看她、不署名寄东西、私发书稿——终章也不告诉罗砚。' },
    { id: 'return', name: '退件', kind: 'bad', hint: '不收稿费，一直送、一直替她做；终章再附上一份礼物或补偿。' },
    { id: 'side', name: '并肩', kind: 'love', hint: '尊重每一个「不」，也写完自己的书；终章明文亲交，再直接问她。答案每局不同。' },
    { id: 'plain', name: '明文', kind: 'true', hint: '收下稿费，尊重边界，少托人传话；终章一页纸，亲手交给她：不加密，不转交。' },
    { id: 'window', name: '旧窗口', kind: 'friend', hint: '陪长庚上山，约小满吃饭而不是托小满办事。真结局没有发生时，老朋友还在。' },
    { id: 'breakfast', name: '早饭', kind: 'family', hint: '接妈的电话，答应回家，手术那晚陪床，早点睡。真结局没有发生时，厨房的灯会亮。' },
    { id: 'lamp', name: '自己的灯', kind: 'self', hint: '写自己的《夜航笔记》，把书稿发在自己的频道。没有更亮的结局时，这盏灯是你的。' },
    { id: 'drift', name: '潮退', kind: 'normal', hint: '不越界，也不太投入；终章交出一道谜题，而不是一页明文。' }
  ];
  var EPILOGUES = ['window', 'breakfast', 'lamp'];
  var KIND_LABEL = { bad: '坏结局', love: '恋爱结局', romance: '恋爱结局', 'true': '真结局', friend: '友情结局', family: '亲情结局', self: '自我结局', normal: '普通结局' };

  function clamp(v, lo, hi) { v = Number(v) || 0; return v < lo ? lo : (v > hi ? hi : v); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function asArray(x) { return x == null ? [] : (Array.isArray(x) ? x : [x]); }

  function parseSpeaker(sp) {
    sp = String(sp || '');
    if (sp.indexOf('msg:') === 0) return { kind: 'msg', id: sp.slice(4) };
    if (SPECIAL_SPEAKERS.indexOf(sp) >= 0) return { kind: sp, id: sp };
    return { kind: 'char', id: sp };
  }
  function lineOpts(line) { return (line && line[2] && typeof line[2] === 'object') ? line[2] : {}; }

  function newState(rng) {
    rng = rng || Math.random;
    var s = {
      v: 1,
      perceived: {}, trust: {},
      leak: 0, energy: 7, push: 0, own: 1, bridge: 0,
      ledger: [], flags: {},
      seed: rng() < 0.5 ? 0 : 1,
      chapter: 0
    };
    NPCS.forEach(function (id) { s.perceived[id] = INIT_PERCEIVED; s.trust[id] = INIT_TRUST[id]; });
    return s;
  }

  function getVar(s, path) {
    if (path === 'debt') return debt(s);
    if (path === 'seed') return s.seed;
    var p = String(path).split('.');
    if (p.length === 2) {
      var g = s[p[0]];
      if (g && typeof g === 'object') return g[p[1]] == null ? 0 : g[p[1]];
      return 0;
    }
    var v = s[path];
    return typeof v === 'number' ? v : 0;
  }

  function checkCond(s, c) {
    if (!c) return true;
    if (Array.isArray(c)) { for (var i = 0; i < c.length; i++) if (!checkCond(s, c[i])) return false; return true; }
    var k;
    if (c.flag != null) { var fl = asArray(c.flag); for (k = 0; k < fl.length; k++) if (!s.flags[fl[k]]) return false; }
    if (c.notFlag != null) { var nf = asArray(c.notFlag); for (k = 0; k < nf.length; k++) if (s.flags[nf[k]]) return false; }
    if (c.min) for (k in c.min) if (getVar(s, k) < c.min[k]) return false;
    if (c.max) for (k in c.max) if (getVar(s, k) > c.max[k]) return false;
    if (c.seed != null && s.seed !== c.seed) return false;
    if (c.any) { // 扩展：任一子条件成立
      var ok = false; asArray(c.any).forEach(function (sub) { if (checkCond(s, sub)) ok = true; });
      if (!ok) return false;
    }
    return true;
  }

  function addScalar(s, key, d) {
    var r = RANGE[key];
    s[key] = clamp((s[key] || 0) + Number(d || 0), r[0], r[1]);
  }

  function addLedger(s, e, chapterNo) {
    if (!e || typeof e !== 'object') return;
    var acc = e.accepted;
    if (LEDGER_STATES.indexOf(acc) < 0) {
      acc = (e.type === 'labor' && s.flags.paid) ? 'in' : 'hang';
    }
    s.ledger.push({
      type: LEDGER_TYPES.indexOf(e.type) >= 0 ? e.type : 'labor',
      to: e.to || 'yuan',
      accepted: acc,
      ch: e.ch != null ? e.ch : (chapterNo != null ? chapterNo : s.chapter),
      note: e.note || ''
    });
  }

  function settleLedger(s, st) {
    asArray(st).forEach(function (o) {
      if (!o) return;
      var from = o.from ? asArray(o.from) : null;
      var as = LEDGER_STATES.indexOf(o.as) >= 0 ? o.as : 'back';
      s.ledger.forEach(function (e) {
        if (o.to && e.to !== o.to) return;
        if (o.type && e.type !== o.type) return;
        if (from && from.indexOf(e.accepted) < 0) return;
        e.accepted = as;
      });
    });
  }

  function applyFx(s, fx, chapterNo) {
    if (!fx) return s;
    var k;
    for (k in fx) {
      var v = fx[k];
      if (SCALARS.indexOf(k) >= 0) addScalar(s, k, v);
      else if (k === 'trust' || k === 'perceived') {
        for (var id in v) {
          if (!(id in s[k])) continue;
          s[k][id] = clamp(s[k][id] + Number(v[id] || 0), RANGE[k][0], RANGE[k][1]);
        }
      } else if (k === 'ledger') asArray(v).forEach(function (e) { addLedger(s, e, chapterNo); });
      else if (k === 'settle') settleLedger(s, v);
    }
    return s;
  }

  function applyFlags(s, flags) {
    if (!flags) return s;
    asArray(flags.set).forEach(function (f) { s.flags[f] = true; });
    asArray(flags.unset).forEach(function (f) { delete s.flags[f]; });
    return s;
  }

  function tagFx(tag) {
    if (tag === 'relay') return { leak: 1, bridge: 1 };
    if (tag === 'meta') return { push: 1, leak: 1 };
    if (tag === 'boundary-push') return { push: 1 };
    return null;
  }

  function lineVisible(s, line) { return checkCond(s, lineOpts(line).if); }

  function enterLine(s, line, chapterNo) {
    var o = lineOpts(line);
    if (o.fx) applyFx(s, o.fx, chapterNo);
    if (o.flags) applyFlags(s, o.flags);
    return s;
  }

  function choiceVisible(s, ch) {
    if (!ch) return false;
    if (ch.metaFlag && !s.flags[ch.metaFlag]) return false;
    return checkCond(s, ch.if);
  }
  function visibleChoices(s, scene) {
    return (scene && scene.choices || []).filter(function (c) { return choiceVisible(s, c); });
  }
  function isTempting(s, ch) { return !!ch && ch.tag === 'relay' && s.energy <= 2; }

  function applyChoice(s, ch, chapterNo) {
    applyFx(s, tagFx(ch.tag), chapterNo);
    applyFx(s, ch.fx, chapterNo);
    applyFlags(s, ch.flags);
    return s;
  }

  function resolveNext(s, next) {
    if (Array.isArray(next)) {
      for (var i = 0; i < next.length; i++) {
        var b = next[i];
        if (b && checkCond(s, b.if)) return b.to == null ? null : b.to;
      }
      return null;
    }
    return next == null ? null : next;
  }

  function finishReplay(s, chapter) {
    var rp = chapter && chapter.replay;
    var out = [];
    if (!rp) return out;
    asArray(rp.reveals).forEach(function (f) {
      if (!s.flags[f]) out.push(f);
      s.flags[f] = true;
    });
    s.flags['replay_' + chapter.id] = true;
    return out;
  }

  function replayFor(chapter, endingId) {
    var rp = chapter && chapter.replay;
    if (!rp) return null;
    if (endingId && rp.byEnding && rp.byEnding[endingId]) {
      var o = {}, k;
      for (k in rp) if (k !== 'byEnding') o[k] = rp[k];
      for (k in rp.byEnding[endingId]) o[k] = rp.byEnding[endingId][k];
      return o;
    }
    return rp;
  }

  function debt(s) {
    return s.ledger.filter(function (e) { return e.accepted === 'hang' || e.accepted === 'back'; }).length;
  }

  var ENDING_TESTS = {
    night: function (s) { return s.energy <= 2; },
    echo: function (s) { return s.leak >= 9; },
    blank: function (s) { return !!s.flags.broke_pact && !s.flags.final_told_yan; },
    'return': function (s) { return !s.flags.paid && debt(s) >= 7 && !!s.flags.final_gift; },
    side: function (s) {
      return !!s.flags.final_plain && !!s.flags.final_asked && s.seed === 1 &&
        s.trust.yuan >= 8 && s.push <= 3 && s.leak <= 4 && s.own >= 6;
    },
    plain: function (s) { return !!s.flags.final_plain && s.trust.yuan >= 6 && s.push <= 3 && s.leak <= 6; },
    window: function (s) { return s.trust.geng >= 8 && s.trust.man >= 6; },
    breakfast: function (s) { return s.trust.mom >= 10 && s.energy >= 5; },
    lamp: function (s) { return s.own >= 7; },
    drift: function () { return true; }
  };

  function judgeEnding(s) {
    var id = 'drift';
    for (var i = 0; i < ENDINGS.length; i++) {
      if (ENDING_TESTS[ENDINGS[i].id](s)) { id = ENDINGS[i].id; break; }
    }
    var epis = EPILOGUES.filter(function (e) { return e !== id && ENDING_TESTS[e](s); });
    return {
      id: id,
      epilogues: epis,
      qiuBack: !s.flags.qiu_gone && s.trust.qiu >= 6,
      debt: debt(s)
    };
  }
  function markEnding(s, res) {
    s.flags['ending_' + res.id] = true;
    res.epilogues.forEach(function (e) { s.flags['epi_' + e] = true; });
    if (res.qiuBack) s.flags.qiu_back = true;
    return s;
  }
  function unlocksHidden(endingId) { return endingId === 'plain' || endingId === 'side'; }
  function endingMeta(id) { for (var i = 0; i < ENDINGS.length; i++) if (ENDINGS[i].id === id) return ENDINGS[i]; return null; }

  function createStory() {
    var st = {
      chapters: {},        // id -> chapter
      byNo: {},            // no -> chapter
      endingsData: null,
      errors: [],
      chapter: function (def) {
        if (!def || !def.id) { st.errors.push('chapter() 缺少 id'); return; }
        st.chapters[def.id] = def;
        if (def.no != null) st.byNo[def.no] = def;
      },
      endings: function (def) { st.endingsData = def || {}; },
      congratsData: null,
      congrats: function (list) { st.congratsData = Array.isArray(list) ? list.slice() : null; },
      findScene: function (sceneId) {
        for (var id in st.chapters) {
          var sc = st.chapters[id].scenes;
          if (sc && sc[sceneId]) return { chapter: st.chapters[id], scene: sc[sceneId] };
        }
        return null;
      }
    };
    return st;
  }

  var R = {
    CHARS: CHARS, NPCS: NPCS, SHADOWS: SHADOWS, SPECIAL_SPEAKERS: SPECIAL_SPEAKERS, FACES: FACES, BGS: BGS, MUSIC: MUSIC,
    TAGS: TAGS, LEDGER_TYPES: LEDGER_TYPES, LEDGER_STATES: LEDGER_STATES, FINAL_FLAGS: FINAL_FLAGS,
    MOTIFS: MOTIFS, towerAuto: towerAuto,
    NAMES: NAMES, SHORT: SHORT, INIT_TRUST: INIT_TRUST, RANGE: RANGE,
    ENDINGS: ENDINGS, EPILOGUES: EPILOGUES, KIND_LABEL: KIND_LABEL,
    clamp: clamp, clone: clone, asArray: asArray, parseSpeaker: parseSpeaker, lineOpts: lineOpts,
    newState: newState, getVar: getVar, checkCond: checkCond,
    applyFx: applyFx, applyFlags: applyFlags, tagFx: tagFx,
    lineVisible: lineVisible, enterLine: enterLine,
    choiceVisible: choiceVisible, visibleChoices: visibleChoices, isTempting: isTempting, applyChoice: applyChoice,
    resolveNext: resolveNext, finishReplay: finishReplay, replayFor: replayFor,
    debt: debt, endingTests: ENDING_TESTS, judgeEnding: judgeEnding, markEnding: markEnding,
    unlocksHidden: unlocksHidden, endingMeta: endingMeta,
    createStory: createStory
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = R;
  root.PlainRules = R;
})(typeof globalThis !== 'undefined' ? globalThis : this);
