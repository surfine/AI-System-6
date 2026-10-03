(function (root) {
  'use strict';
  var ctx = null, master = null, musicBus = null, sfxBus = null, verb = null, wetGain = null;
  var degradeIn = null, degradeLP = null, degradeWS = null; // 降级链只建一次
  var motifBus = null, motifSend = null, mv = null;          // 明文主题：独立总线（不被 ducking 压低），当前这一遍
  var MUSIC_GAIN = 0.5, AMB_GAIN = 0.5 * 0.25;
  var ambientBus = null, ambId = null, amb = null, vis = false;
  var current = null, currentId = 'none', wanted = 'none';
  var volume = 0.35, muted = false, lastTick = 0;

  function ok() { return !!ctx; }
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    try {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain(); master.connect(ctx.destination);
      degradeLP = ctx.createBiquadFilter();
      degradeLP.type = 'lowpass'; degradeLP.frequency.value = 20000;
      degradeWS = ctx.createWaveShaper();
      degradeWS.curve = makeStepCurve(8); degradeWS.oversample = '2x';
      var crush = ctx.createGain(); crush.gain.value = 16; // 音乐很轻，先放大再量化，台阶才听得出来
      var post = ctx.createGain(); post.gain.value = 0;   // 位压支路增益，0 = 旁路
      var dry = ctx.createGain(); dry.gain.value = 1;
      musicBus = ctx.createGain(); musicBus.gain.value = MUSIC_GAIN;
      motifBus = ctx.createGain(); motifBus.gain.value = 1;
      ambientBus = ctx.createGain(); ambientBus.gain.value = AMB_GAIN; // 约音乐 1/4
      musicBus.connect(degradeLP); motifBus.connect(degradeLP);
      degradeLP.connect(dry); dry.connect(master);
      degradeLP.connect(crush); crush.connect(degradeWS); degradeWS.connect(post); post.connect(master);
      degradeIn = { post: post, dry: dry };
      sfxBus = ctx.createGain(); sfxBus.gain.value = 0.6; sfxBus.connect(master);
      ambientBus.connect(master);
      buildVerb(); // 只建一次混响
      applyVolume();
      play(wanted, true);
      if (ambId) startAmbient(true);
      listenVisibility();
      return true;
    } catch (e) { ctx = null; return false; }
  }
  function makeStepCurve(n) {
    var c = new Float32Array(256);
    for (var i = 0; i < 256; i++) {
      var x = (i / 255) * 2 - 1;
      c[i] = n > 1 ? Math.round(x * n) / n : x;
    }
    return c;
  }
  function setDegrade(on) {
    if (!ctx || !degradeIn || !degradeLP) return;
    try {
      var t = ctx.currentTime;
      degradeLP.frequency.setTargetAtTime(on ? 900 : 20000, t, 0.25);
      degradeIn.post.gain.setTargetAtTime(on ? 0.55 / 16 : 0, t, 0.25);
    } catch (e) {}
  }
  function applyVolume() {
    if (!master) return;
    var v = muted ? 0 : volume * volume * 0.6; // 感知音量曲线，整体偏低
    master.gain.setTargetAtTime(v, ctx.currentTime, 0.08);
  }
  function setVolume(v) { volume = Math.max(0, Math.min(1, v)); applyVolume(); }
  function setMuted(m) { muted = !!m; applyVolume(); }

  function buildVerb() {
    var dry = ctx.createGain(); dry.gain.value = 1; dry.connect(master);
    var wet = ctx.createGain(); wet.gain.value = 0.25; wet.connect(master); wetGain = wet;
    var conv = ctx.createConvolver();
    var len = Math.floor(ctx.sampleRate * 1.8);
    var ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var c = 0; c < 2; c++) {
      var d = ir.getChannelData(c);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    conv.buffer = ir; musicBus.connect(conv); conv.connect(wet);
    motifSend = ctx.createGain(); motifSend.gain.value = 0.5; motifBus.connect(motifSend); motifSend.connect(conv);
    ambientBus.connect(dry); ambientBus.connect(conv);
    verb = conv;
  }
  var pbuf = null;
  function pinkBuffer() { // 近似粉噪，做火焰/布/人群底噪
    var len = ctx.sampleRate * 2, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    var b0 = 0;
    for (var i = 0; i < len; i++) { var w = Math.random() * 2 - 1; b0 = 0.98 * b0 + 0.02 * w; d[i] = b0 * 3.5; }
    return b;
  }
  function noiseBuffer() {
    var len = ctx.sampleRate * 2, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  var nbuf = null;
  function now() { return ctx.currentTime; }
  function stopLater(nodes, when) {
    setTimeout(function () { try { nodes.forEach(function (n) { n.stop(); }); } catch (e) {} }, Math.max(0, (when - now()) * 1000 + 150));
  }
  function rampDown(g, t, end) {
    g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), t);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
  }

  function pluck(dest, freq, gain, t) {
    t = t || now();
    var dur = 0.6 + Math.random() * 0.6;
    var o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = freq;
    lp.type = 'lowpass'; lp.Q.value = 1.2;
    lp.frequency.setValueAtTime(Math.min(6000, freq * 10), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(200, freq * 1.4), t + 0.28);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.006);
    rampDown(g, t + 0.006, t + dur);
    o.connect(lp); lp.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function harp(dest, freq, gain, t) {
    t = t || now();
    var dur = 2.5 + Math.random() * 1.0;
    var parts = [[1, 1], [2, 0.22], [3, 0.09]];
    var nodes = [], g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.005);
    rampDown(g, t + 0.005, t + dur);
    g.connect(dest);
    parts.forEach(function (p) {
      var o = ctx.createOscillator(), pg = ctx.createGain();
      o.type = 'sine'; o.frequency.value = freq * p[0]; pg.gain.value = p[1];
      o.connect(pg); pg.connect(g); o.start(t); o.stop(t + dur + 0.05);
      nodes.push(o);
    });
    stopLater(nodes, t + dur + 0.05);
  }

  function guqin(dest, freq, gain, t, slide) {
    t = t || now();
    var dur = 3.0 + Math.random();
    var o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'triangle'; lp.type = 'lowpass'; lp.frequency.value = 1200; lp.Q.value = 0.8;
    if (slide && slide !== 1) {
      o.frequency.setValueAtTime(freq * slide, t);
      o.frequency.linearRampToValueAtTime(freq, t + 0.25);
    } else { o.frequency.value = freq; }
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    rampDown(g, t + 0.01, t + dur);
    o.connect(lp); lp.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
    stopLater([o], t + dur + 0.05);
    if (Math.random() < 0.35) { // 泛音
      var h = ctx.createOscillator(), hg = ctx.createGain();
      h.type = 'sine'; h.frequency.value = freq * 2;
      hg.gain.setValueAtTime(0, t);
      hg.gain.linearRampToValueAtTime(gain * 0.25, t + 0.02);
      rampDown(hg, t + 0.02, t + dur * 0.75);
      h.connect(hg); hg.connect(dest); h.start(t); h.stop(t + dur + 0.05);
      stopLater([h], t + dur + 0.05);
    }
  }

  function drone(dest, freq, gain) {
    var t = now();
    var a = ctx.createOscillator(), b = ctx.createOscillator();
    a.type = 'sawtooth'; b.type = 'sawtooth';
    a.frequency.value = freq; b.frequency.value = freq * 1.004;
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq * 3; bp.Q.value = 1.5;
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 1.2);
    a.connect(bp); b.connect(bp); bp.connect(lp); lp.connect(g); g.connect(dest);
    a.start(t); b.start(t);
    return function () {
      try {
        g.gain.setTargetAtTime(0, now(), 0.4);
        setTimeout(function () { try { a.stop(); b.stop(); g.disconnect(); } catch (e) {} }, 2000);
      } catch (e) {}
    };
  }

  function chanter(dest, freq, gain, t, dur) {
    t = t || now();
    var o = ctx.createOscillator(), bp = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = Math.random() < 0.5 ? 'sawtooth' : 'square';
    o.frequency.value = freq;
    bp.type = 'bandpass'; bp.frequency.value = freq * 2; bp.Q.value = 1.2;
    lp.type = 'lowpass'; lp.frequency.value = 2000;
    var lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 5; lg.gain.value = freq * 0.003;
    lfo.connect(lg); lg.connect(o.frequency);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.06);
    g.gain.setValueAtTime(gain, t + Math.max(0.06, dur - 0.15));
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(bp); bp.connect(lp); lp.connect(g); g.connect(dest);
    o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
    stopLater([o, lfo], t + dur + 0.05);
  }

  function pad(out, freqs, gain) {
    var nodes = freqs.map(function (f) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f; g.gain.value = gain;
      o.connect(g); g.connect(out); o.start();
      return { o: o, g: g };
    });
    return function () { nodes.forEach(function (n) { try { n.o.stop(); n.g.disconnect(); } catch (e) {} }); };
  }
  var RND = function (a) { return a[Math.floor(Math.random() * a.length)]; };
  function every(ms, fn) { return setInterval(function () { try { fn(); } catch (e) {} }, ms); }
  function sched(out, bpm, perBeat, phraseBeats) {
    var spb = 60 / bpm, i = 0;
    if (perBeat) try { perBeat(0, now(), spb); } catch (e) {}
    var tv = every(spb * 1000, function () {
      i = (i + 1) % (phraseBeats || 1e9);
      perBeat(i, now() + 0.02, spb);
    });
    return { stop: function () { clearInterval(tv); } };
  }
  var DGONG = [293.7, 329.6, 369.9, 440, 493.9, 587.3]; // D 宫五声
  var AYU = [220, 261.6, 293.7, 329.6, 392]; // A 羽
  var DOR = [146.8, 164.8, 174.6, 196, 220, 246.9, 293.7]; // D 多利亚
  var LYD = [146.8, 164.8, 185, 196, 220, 246.9, 277.2, 293.7]; // D 吕底亚
  var DMIN5 = [220, 233.1, 261.6, 293.7, 349.2]; // D 小调五声
  var FRAG = [[62, 66, 64, 69], [71, 69, 66, 64], [62, 64, 66, 69], [69, 71, 69, 66]];
  function mf(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function flute(dest, freq, gain, t, dur) {
    t = t || now(); dur = dur || 0.8;
    var o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = freq;
    lp.type = 'lowpass'; lp.frequency.value = 2600;
    var lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 5.5; lg.gain.value = freq * 0.006;
    lfo.connect(lg); lg.connect(o.frequency);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.05);
    g.gain.setValueAtTime(gain, t + Math.max(0.05, dur - 0.12));
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(lp); lp.connect(g); g.connect(dest);
    o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
    stopLater([o, lfo], t + dur + 0.05);
  }
  function egtr(dest, freq, gain, t, dur) {
    t = t || now(); dur = dur || 0.4;
    var o = ctx.createOscillator(), ws = ctx.createWaveShaper(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = freq;
    ws.curve = makeStepCurve(24); ws.oversample = '2x';
    lp.type = 'lowpass'; lp.frequency.value = Math.min(4500, freq * 6); lp.Q.value = 1.0;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    rampDown(g, t + 0.008, t + dur);
    o.connect(ws); ws.connect(lp); lp.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function kick(dest, t, gain) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.26);
  }
  function hihat(dest, t, gain) {
    nbuf = nbuf || noiseBuffer();
    var s = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = nbuf; s.loop = true;
    hp.type = 'highpass'; hp.frequency.value = 7000;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    s.connect(hp); hp.connect(g); g.connect(dest);
    s.start(t, Math.random() * 1.5, 0.06);
    setTimeout(function () { try { s.stop(); } catch (e) {} }, 250);
  }
  function chip(dest, freq, gain, t, dur) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'square'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.005);
    g.gain.setValueAtTime(gain, t + dur * 0.6);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.02);
  }
  function musicBox(dest, freq, gain, t) {
    var dur = 1.0 + Math.random() * 0.6;
    var o = ctx.createOscillator(), h = ctx.createOscillator(), g = ctx.createGain(), hg = ctx.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    h.type = 'sine'; h.frequency.value = freq * 2; hg.gain.value = 0.15;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); h.connect(hg); hg.connect(g); g.connect(dest);
    o.start(t); h.start(t); o.stop(t + dur + 0.05); h.stop(t + dur + 0.05);
    stopLater([o, h], t + dur + 0.05);
  }
  function noiseHit(dest, t, dur, gain, type, freq, q) {
    try {
      nbuf = nbuf || noiseBuffer();
      var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = nbuf; s.loop = true;
      f.type = type || 'bandpass'; f.frequency.value = freq || 1000; f.Q.value = q || 1;
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(dest);
      s.start(t, Math.random() * 1.5, dur + 0.05);
      var ms = (t - now() + dur) * 1000 + 200;
      setTimeout(function () { try { s.stop(); } catch (e) {} }, Math.max(50, ms));
    } catch (e) {}
  }
  function noiseBed(dest, gain, filters) {
    nbuf = nbuf || noiseBuffer();
    var s = ctx.createBufferSource(); s.buffer = nbuf; s.loop = true;
    var node = s, g = ctx.createGain(); g.gain.value = gain;
    filters.forEach(function (f) {
      var b = ctx.createBiquadFilter(); b.type = f[0]; b.frequency.value = f[1];
      if (f[2]) b.Q.value = f[2];
      node.connect(b); node = b;
    });
    node.connect(g); g.connect(dest); s.start();
    return function () {
      try { g.gain.setTargetAtTime(0, now(), 0.3); } catch (e) {}
      setTimeout(function () { try { s.stop(); g.disconnect(); } catch (e) {} }, 1200);
    };
  }
  function crackle(dest, gain) {
    try {
      pbuf = pbuf || pinkBuffer();
      var s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = pbuf; s.loop = true;
      bp.type = 'bandpass'; bp.frequency.value = 1200; bp.Q.value = 0.9;
      var t = now(), d = 0.005 + Math.random() * 0.015;
      g.gain.setValueAtTime((gain || 0.05) * (0.5 + Math.random()), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      s.connect(bp); bp.connect(g); g.connect(dest);
      s.start(t, Math.random(), d + 0.03);
      setTimeout(function () { try { s.stop(); } catch (e) {} }, (d + 0.1) * 1000 + 150);
    } catch (e) {}
  }
  function chanterSwell(dest, freq, gain, t, dur) {
    var o = ctx.createOscillator(), bp = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = freq;
    bp.type = 'bandpass'; bp.frequency.value = freq * 2; bp.Q.value = 1.2;
    lp.type = 'lowpass'; lp.frequency.value = 2000;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + dur * 0.5);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(bp); bp.connect(lp); lp.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
    stopLater([o], t + dur + 0.05);
  }

  var TRACKS = {
    calm: function (out) {
      var stopPad = pad(out, [146.8, 220], 0.018);
      var CH = [293.7, 369.9, 440, 587.3];
      var s = sched(out, 76, function (i, t) {
        if (Math.random() < 0.2) return; // 留白
        pluck(out, RND(DGONG), 0.035 + Math.random() * 0.015, t);
        if (i % 16 === 0) { // 每 4 小节一次竖琴和弦
          for (var k = 0; k < CH.length; k++) harp(out, CH[k], 0.03, t + k * 0.05);
        }
      }, 16);
      return function () { s.stop(); stopPad(); };
    },
    night: function (out) {
      var stopDrone = drone(out, 110, 0.014);
      var s = sched(out, 52, function (i, t) {
        if (Math.random() < 0.3) return;
        var f = RND(AYU);
        harp(out, f, 0.028, t);
        if (Math.random() < 0.55) {
          var sl = Math.random() < 0.5 ? (Math.random() < 0.5 ? 0.94 : 1.06) : null;
          guqin(out, f * (Math.random() < 0.4 ? 2 : 1), 0.035, t + 0.7, sl);
        }
      }, 3);
      var t2 = every(3200, function () { // 稀疏补充一层古琴
        if (Math.random() < 0.5) guqin(out, RND(AYU) * 2, 0.025, now(), Math.random() < 0.5 ? 0.96 : null);
      });
      return function () { s.stop(); clearInterval(t2); stopDrone(); };
    },
    tense: function (out) {
      var trem = ctx.createGain(); trem.gain.value = 1; trem.connect(out);
      var stopDrone = drone(trem, 73.4, 0.016);
      var lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 0.7; lg.gain.value = 0.35;
      lfo.connect(lg); lg.connect(trem.gain); lfo.start();
      var OST = [146.8, 146.8, 196, 146.8, 155.6, 155.6, 220, 196];
      var e = 0;
      var s = sched(out, 120, function (bi, t, spb) {
        var eighth = e++;
        pluck(out, OST[eighth % OST.length], (eighth % 4 === 0) ? 0.05 : 0.028, t);
        if (eighth % 2 === 1) pluck(out, OST[eighth % OST.length] * 2, 0.02, t + spb / 2);
        if (bi % 32 === 0) chanterSwell(out, Math.random() < 0.5 ? 293.7 : 220, 0.03, t, spb * 16);
        if (bi % 32 === 16) { // D + G# 三全音
          pluck(out, 146.8, 0.045, t); pluck(out, 207.7, 0.04, t + 0.12);
        }
      }, 32);
      return function () {
        s.stop();
        try { lfo.stop(); lg.disconnect(); } catch (e2) {}
        stopDrone();
      };
    },
    rain: function (out) {
      var stopBed = noiseBed(out, 0.2, [['lowpass', 1400], ['highpass', 300]]);
      var stopDrone = drone(out, 73.4, 0.012);
      var H = [523.3, 587.3, 659.3, 784, 880, 1046.5];
      var t = every(4000, function () {
        var f = RND(H);
        if (Math.random() < 0.5) guqin(out, f * 0.5, 0.03, now(), null);
        else harp(out, f, 0.025, now());
      });
      return function () { clearInterval(t); stopBed(); stopDrone(); };
    },
    warm: function (out) {
      var stopPad = pad(out, [146.8, 220], 0.014);
      var PHRASE = [293.7, 369.9, 440, 0, 493.9, 440, 369.9, 0, 329.6, 293.7, 0, 0, 440, 587.3, 493.9, 440];
      var s = sched(out, 84, function (i, t) {
        if (i < 16) { // 前 4 小节旋律
          var f = PHRASE[i];
          if (f) chanter(out, f, 0.028, t, 0.55);
        } else if (i % 2 === 0) { // 后 4 小节转拨弦伴奏
          pluck(out, RND(DGONG), 0.03, t);
        }
        if (i % 8 === 0) harp(out, 293.7, 0.022, t + 0.2);
      }, 32);
      return function () { s.stop(); stopPad(); };
    },
    camp: function (out) {
      var SPB = 60 / 96;
      var s = sched(out, 96, function (i, t, spb) {
        var e = i % 6;
        if (e === 0) { // 每拍一次三连扫弦，三个拨弦相隔 12ms 级别
          var g = ctx.createGain(); g.gain.value = 0.5; g.connect(out);
          var base = DOR[(i / 6) % 4];
          pluck(g, base, 0.032, t);
          pluck(g, base * (5 / 4), 0.024, t + 0.012);
          pluck(g, base * 1.5, 0.028, t + 0.024);
          setTimeout(function () { try { g.disconnect(); } catch (e2) {} }, 3000);
        }
        if (e === 2 && i % 8 === 4 && Math.random() < 0.7) { // 稀疏木笛乐句
          var n1 = RND(DOR) * 2;
          flute(out, n1, 0.026, t, 0.5);
          flute(out, RND(DOR) * 2, 0.024, t + spb * 0.9, 0.5);
          if (Math.random() < 0.5) flute(out, n1, 0.022, t + spb * 1.8, 0.7);
        }
      }, 6);
      var fire = every(330, function () { // 平均约每秒 3 次噼啪
        if (Math.random() < 0.55) crackle(out, 0.05);
        if (Math.random() < 0.4) crackle(out, 0.035);
      });
      return function () { s.stop(); clearInterval(fire); };
    },
    dawn: function (out) {
      var idx = 0, start = now(), TOT = 20; // 约 20s 爬升一轮
      var t = every(420, function () {
        if (now() - start > TOT) { start = now(); idx = 0; }
        harp(out, LYD[idx % LYD.length], 0.022, now());
        idx++;
      });
      var t2 = every(16000, function () { // 明文主题的前半句：只爬到属音，不落地
        for (var i = 0; i < FRAG[0].length; i++) harp(out, mf(FRAG[0][i] + 12), 0.026, now() + i * 0.5);
      });
      var t3 = every(9000, function () { chanter(out, RND(LYD) * 2, 0.022, now(), 3.5); });
      return function () { clearInterval(t); clearInterval(t2); clearInterval(t3); };
    },
    stage: function (out) {
      var R1 = [DMIN5[0], DMIN5[2], DMIN5[1], DMIN5[4], DMIN5[0], DMIN5[3], DMIN5[2], DMIN5[1]];
      var s = sched(out, 128, function (i, t, spb) {
        var eighth = i % 8;
        egtr(out, R1[eighth] * 0.5, 0.05, t, spb * 0.45);
        if (eighth % 2 === 1) egtr(out, R1[eighth], 0.035, t, spb * 0.35);
        if (i % 2 === 0) kick(out, t, 0.22); // 拍 1、3
        hihat(out, t + spb * 0.5, 0.03);
      }, 16);
      return function () { s.stop(); };
    },
    collapse: function (out) {
      var seq = [DGONG[0], DGONG[2], DGONG[1], DGONG[3], DGONG[2], DGONG[4], DGONG[3], DGONG[5]];
      var s = sched(out, 160, function (i, t, spb) {
        chip(out, seq[i % seq.length] * 0.5, 0.03, t, spb * 0.45);
      }, 16);
      return function () { s.stop(); };
    },
    letter: function (out) {
      var s = sched(out, 66, function (i, t, spb) {
        var v = FRAG[Math.floor(i / 16) % FRAG.length];
        var p = i % 16;
        if (p < v.length * 2 && p % 2 === 0) {
          var f = mf(v[Math.floor(p / 2)] + 12); // 上八度
          musicBox(out, f, 0.05, t);
          if (Math.random() < 0.3) musicBox(out, f * 2, 0.02, t + spb);
        }
      }, 48);
      return function () { s.stop(); };
    }
  };

  var AMBS = {
    street_spring: function (g) {
      var t1 = every(6000 + Math.random() * 6000, function () {
        var n = 2 + (Math.random() < 0.5 ? 0 : 1);
        for (var i = 0; i < n; i++) gull(g, now() + i * 0.28);
      });
      var t2 = every(12000, function () {
        if (Math.random() < 0.6) sines(g, now(), [[1046, 0.012], [2093, 0.006]], 1.0);
      });
      return [t1, t2];
    },
    fair_booth: function (g, variant) {
      nbuf = nbuf || noiseBuffer();
      var s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), mg = ctx.createGain();
      var wob = ctx.createOscillator(), wg = ctx.createGain();
      s.buffer = nbuf; s.loop = true;
      bp.type = 'bandpass'; bp.frequency.value = 600; bp.Q.value = 0.6;
      mg.gain.value = 0.09; wob.frequency.value = 0.13; wg.gain.value = 0.03;
      wob.connect(wg); wg.connect(mg.gain);
      s.connect(bp); bp.connect(mg); mg.connect(g); s.start(); wob.start();
      var stops = [function () {
        try { s.stop(); wob.stop(); mg.disconnect(); wg.disconnect(); } catch (e) {}
      }];
      if (variant === 'stage') return stops; // 舞台上不加额外
      var t1 = every(8000, function () { gull(g, now()); });
      stops.push(function () { clearInterval(t1); });
      return stops;
    },
    library: function (g) {
      var t1 = every(15000, function () { if (Math.random() < 0.7) sfxTo(g, 'page'); });
      var t2 = every(10000, function () { if (Math.random() < 0.4) noiseHit(g, now(), 0.15, 0.02, 'highpass', 4000, 1); });
      return [t1, t2];
    },
    my_room_night: function (g) {
      nbuf = nbuf || noiseBuffer();
      var s = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), wg = ctx.createGain(), g8 = ctx.createGain();
      s.buffer = nbuf; s.loop = true;
      lp.type = 'lowpass'; lp.frequency.value = 420;
      wg.gain.value = 0.03; g8.gain.value = 0.04;
      var sw = ctx.createOscillator(), sgd = ctx.createGain();
      sw.frequency.value = 1 / 8; sgd.gain.value = 0.03;
      sw.connect(sgd); sgd.connect(g8.gain); sw.start();
      s.connect(lp); lp.connect(wg); wg.connect(g8); g8.connect(g); s.start();
      var t1 = every(700, function () { if (Math.random() < 0.5) crackle(g, 0.03); });
      return [function () {
        clearInterval(t1);
        try { s.stop(); sw.stop(); g8.disconnect(); wg.disconnect(); sgd.disconnect(); } catch (e) {}
      }];
    },
    yuan_room: function (g) {
      var t1 = every(8000 + Math.random() * 7000, function () {
        if (Math.random() < 0.5) noiseHit(g, now(), 0.05, 0.05, 'bandpass', 2600, 3);
        else noiseHit(g, now(), 0.02, 0.04, 'bandpass', 4000, 6);
      });
      return [t1];
    },
    cafe: function (g) {
      var t1 = every(5000 + Math.random() * 5000, function () {
        var f = 1800 + Math.random() * 1800;
        sines(g, now(), [[f, 0.02], [f * 1.5, 0.01]], 0.3);
      });
      return [t1];
    },
    ferry: function (g) {
      var stopWater = noiseBed(g, 0.06, [['lowpass', 700]]);
      var t1 = every(4000, function () {
        noiseHit(g, now(), 0.6, 0.05, 'bandpass', 320 + Math.random() * 200, 8);
      });
      var t2 = every(20000, function () { foghorn(g, now()); });
      return [stopWater, function () { clearInterval(t1); clearInterval(t2); }];
    },
    bookshop: function (g) {
      var t1 = every(400, function () { if (Math.random() < 0.5) crackle(g, 0.035); });
      var t2 = every(14000, function () {
        if (Math.random() < 0.6) sines(g, now(), [[1500, 0.015], [2100, 0.012], [2600, 0.01]], 0.25);
      });
      return [t1, t2];
    },
    hospital: function (g, variant) {
      if (variant === 'ceiling') {
        var o = ctx.createOscillator(), gg = ctx.createGain();
        o.type = 'sine'; o.frequency.value = 60; gg.gain.value = 0.02;
        o.connect(gg); gg.connect(g); o.start();
        return [function () { try { o.stop(); gg.disconnect(); } catch (e) {} }];
      }
      var t1 = every(15000, function () { if (Math.random() < 0.7) sines(g, now(), [[1200, 0.03], [2880, 0.012]], 1.0); });
      return [t1];
    },
    lighthouse_hill: function (g, variant) {
      nbuf = nbuf || noiseBuffer();
      var s = ctx.createBufferSource(), bpf = ctx.createBiquadFilter(), wg = ctx.createGain();
      s.buffer = nbuf; s.loop = true;
      bpf.type = 'bandpass'; bpf.frequency.value = 500; bpf.Q.value = 0.5;
      wg.gain.value = variant === 'dawn' ? 0.03 : 0.06;
      s.connect(bpf); bpf.connect(wg); wg.connect(g); s.start();
      var dr = ctx.createOscillator(), dg = ctx.createGain();
      dr.frequency.value = 0.05; dg.gain.value = 180;
      dr.connect(dg); dg.connect(bpf.frequency); dr.start();
      var stops = [function () {
        try { s.stop(); dr.stop(); wg.disconnect(); dg.disconnect(); } catch (e) {}
      }];
      if (variant === 'dawn') { // 渐渐放到极低
        try { wg.gain.setTargetAtTime(0.008, now(), 6); } catch (e) {}
      }
      if (variant === 'night') {
        var t1 = every(600, function () { if (Math.random() < 0.3) crackle(g, 0.025); });
        var t2 = every(2500, function () { if (Math.random() < 0.5) insect(g, now()); });
        stops.push(function () { clearInterval(t1); clearInterval(t2); });
      }
      return stops;
    },
    rain_street: function (g) {
      var stopRain = noiseBed(g, 0.09, [['lowpass', 1600], ['highpass', 300]]);
      var t1 = every(1200, function () {
        if (Math.random() < 0.6) sines(g, now(), [[2400 + Math.random() * 1600, 0.012]], 0.15);
      });
      return [stopRain, function () { clearInterval(t1); }];
    },
    phone: function (g) {
      var t1 = every(6000 + Math.random() * 4000, function () { noiseHit(g, now(), 0.35, 0.03, 'highpass', 3000, 1); });
      return [t1];
    },
    black: function () { return []; },
    paper: function () { return []; }
  };
  function gull(dest, t) {
    for (var i = 0; i < 2; i++) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      var t0 = t + i * 0.12;
      o.type = 'sine';
      o.frequency.setValueAtTime(1500, t0);
      o.frequency.exponentialRampToValueAtTime(700, t0 + 0.22);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.022, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
      o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + 0.3);
      stopLater([o], t0 + 0.3);
    }
  }
  function sines(dest, t, parts, dur) {
    parts.forEach(function (p) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = p[0];
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(p[1], t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
      stopLater([o], t + dur + 0.05);
    });
  }
  function foghorn(dest, t) {
    var o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = 110;
    lp.type = 'lowpass'; lp.frequency.value = 400;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.045, t + 0.5);
    g.gain.setValueAtTime(0.045, t + 2.3);
    g.gain.linearRampToValueAtTime(0.0001, t + 3.0);
    o.connect(lp); lp.connect(g); g.connect(dest); o.start(t); o.stop(t + 3.05);
    stopLater([o], t + 3.05);
  }
  function insect(dest, t) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 4000 + Math.random() * 1500;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.006, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.08);
    stopLater([o], t + 0.08);
  }
  function sfxTo(dest, name) {
    try {
      nbuf = nbuf || noiseBuffer();
      var t = now();
      if (name === 'page') {
        var s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
        s.buffer = nbuf; s.loop = true;
        bp.type = 'bandpass'; bp.Q.value = 1.1;
        bp.frequency.setValueAtTime(1000, t);
        bp.frequency.exponentialRampToValueAtTime(4000, t + 0.12);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.03, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
        s.connect(bp); bp.connect(g); g.connect(dest);
        s.start(t, Math.random() * 1.5, 0.16);
        setTimeout(function () { try { s.stop(); } catch (e) {} }, 400);
      }
    } catch (e) {}
  }
  function startAmbient(fast) {
    stopAmbient();
    try {
      var g = ctx.createGain();
      g.gain.value = fast ? 1 : 0;
      g.connect(ambientBus);
      var fns = AMBS[ambId];
      if (!fns) { g.disconnect(); return; }
      var h = fns(g, ambVariant);
      amb = { g: g, handles: h || [] };
      if (!fast) g.gain.setTargetAtTime(1, ctx.currentTime, 1.2);
    } catch (e) { amb = null; }
  }
  function stopAmbient() {
    if (!amb) { ambId = null; return; }
    var old = amb; amb = null;
    try {
      old.handles.forEach(function (h) {
        if (typeof h === 'function') h();
        else { clearInterval(h); clearTimeout(h); }
      });
      old.g.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
      setTimeout(function () { try { old.g.disconnect(); } catch (e) {} }, 2000);
    } catch (e) {}
    ambId = null;
  }
  var ambVariant = null;
  function ambient(bgId, variant) {
    ambVariant = variant || null;
    var next = AMBS[bgId] ? bgId : null;
    if (!ctx) { ambId = next; return; }
    if (next === ambId && amb) return;
    ambId = next;
    if (!next) { stopAmbient(); return; }
    startAmbient(false);
  }

  function stinger(name) {
    if (!ctx || muted) return;
    if (name !== 'box') return;
    try {
      var SPB = 60 / 160, seq = [DGONG[0], DGONG[2], DGONG[1], DGONG[3], DGONG[2], DGONG[4], DGONG[3], DGONG[5]];
      var t0 = now() + 0.05;
      var n = Math.round(2 / SPB); // 2 秒
      for (var i = 0; i < n; i++) chip(musicBus, seq[i % seq.length] * 0.5, 0.06, t0 + i * SPB, SPB * 0.5);
    } catch (e) {}
  }

  function listenVisibility() {
    if (vis) return;
    if (typeof document === 'undefined' || !document.addEventListener) return;
    vis = true;
    document.addEventListener('visibilitychange', function () {
      try {
        if (!ctx) return;
        if (document.hidden) ctx.suspend();
        else ctx.resume();
      } catch (e) {}
    });
  }
  function play(id, force) {
    wanted = TRACKS[id] ? id : 'none';
    if (!ctx) return;
    if (!force && wanted === currentId) return;
    try {
      if (current) {
        var old = current;
        old.g.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
        setTimeout(function () { try { old.stop(); old.g.disconnect(); } catch (e) {} }, 2500);
        current = null;
      }
      currentId = wanted;
      if (wanted === 'none') return;
      var g = ctx.createGain(); g.gain.value = 0; g.connect(musicBus);
      var stop = TRACKS[wanted](g);
      g.gain.setTargetAtTime(1, ctx.currentTime, 0.8);
      current = { g: g, stop: stop };
    } catch (e) { /* 忽略 */ }
  }

  function tick() {
    if (!ctx || muted) return;
    var now = ctx.currentTime;
    if (now - lastTick < 0.045) return;
    lastTick = now;
    try {
      nbuf = nbuf || noiseBuffer();
      var s = ctx.createBufferSource(); s.buffer = nbuf; s.loop = true;
      var dur = 0.035 + Math.random() * 0.035; // 35~70ms
      var f0 = 3200 + Math.random() * 900;
      var f1 = Math.random() < 0.5 ? 1800 : 3800;
      var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 3;
      bp.frequency.setValueAtTime(f0, now); bp.frequency.linearRampToValueAtTime(f1, now + dur);
      var hpf = ctx.createBiquadFilter(); hpf.type = 'highpass'; hpf.frequency.value = 1200;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.04 + Math.random() * 0.04, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      s.connect(bp); bp.connect(hpf); hpf.connect(g); g.connect(sfxBus);
      s.start(now, Math.random() * 1.5, dur + 0.02);
      var tStop = now + dur + 0.05;
      setTimeout(function () { try { s.stop(); } catch (e) {} }, (tStop - ctx.currentTime) * 1000 + 150);
    } catch (e) {}
  }

  function sfx(name) {
    if (!ctx || muted) return;
    try { SFX[name] && SFX[name](now()); } catch (e) {}
  }
  var SFX = {
    'don': function (t) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = 55;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.9, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.65);
      noiseHit(sfxBus, t, 0.01, 0.2, 'lowpass', 500, 1);
    },
    'type': function (t) { noiseHit(sfxBus, t, 0.015, 0.12, 'bandpass', 3000 * (0.9 + Math.random() * 0.2), 4); },
    'ding': function (t) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = 2400;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.45);
    },
    'stamp': function (t) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(90, t);
      o.frequency.exponentialRampToValueAtTime(70, t + 0.1);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.15);
      noiseHit(sfxBus, t + 0.02, 0.04, 0.18, 'highpass', 1500, 1);
    },
    'pen': function (t) {
      pbuf = pbuf || pinkBuffer();
      var dur = 0.3 + Math.random() * 0.5;
      var s = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = pbuf; s.loop = true;
      hp.type = 'highpass'; hp.frequency.value = 4000;
      g.gain.setValueAtTime(0.0001, t);
      for (var k = 0; k < 6; k++) {
        g.gain.linearRampToValueAtTime(0.02 + Math.random() * 0.03, t + (dur * k) / 6);
      }
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      s.connect(hp); hp.connect(g); g.connect(sfxBus);
      s.start(t, Math.random() * 1.5, dur + 0.05);
      setTimeout(function () { try { s.stop(); } catch (e) {} }, dur * 1000 + 300);
    },
    'page': function (t) {
      nbuf = nbuf || noiseBuffer();
      var s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = nbuf; s.loop = true;
      bp.type = 'bandpass'; bp.Q.value = 1.1;
      bp.frequency.setValueAtTime(1000, t);
      bp.frequency.exponentialRampToValueAtTime(4000, t + 0.12);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.08, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      s.connect(bp); bp.connect(g); g.connect(sfxBus);
      s.start(t, Math.random() * 1.5, 0.16);
      setTimeout(function () { try { s.stop(); } catch (e) {} }, 400);
    },
    'bell': function (t) {
      var parts = [[880, 0.14], [2112, 0.06]];
      var nodes = [];
      parts.forEach(function (p) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = p[0];
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(p[1], t + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
        o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 1.25);
        nodes.push(o);
      });
      stopLater(nodes, t + 1.25);
    },
    'wolf': function (t) {
      noiseHit(sfxBus, t, 0.03, 0.14, 'bandpass', 5000, 3);
      noiseHit(sfxBus, t + 0.06, 0.03, 0.12, 'bandpass', 5200, 3);
    },
    'pigeon': function (t) {
      nbuf = nbuf || noiseBuffer();
      var s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      var lfo = ctx.createOscillator(), lg = ctx.createGain();
      s.buffer = nbuf; s.loop = true;
      bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.5;
      g.gain.value = 0.05;
      lfo.type = 'sine'; lfo.frequency.value = 12; lg.gain.value = 0.04;
      lfo.connect(lg); lg.connect(g.gain);
      var env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.linearRampToValueAtTime(1, t + 0.02);
      env.gain.setValueAtTime(1, t + 0.25);
      env.gain.linearRampToValueAtTime(0.0001, t + 0.3);
      s.connect(bp); bp.connect(g); g.connect(env); env.connect(sfxBus);
      s.start(t, Math.random() * 1.5, 0.36); lfo.start(t);
      var ms = 600;
      setTimeout(function () { try { s.stop(); lfo.stop(); } catch (e) {} }, ms);
    }
  };
  function thud() { sfx('don'); }
  function applause(sec) {
    if (!ctx || muted) return;
    try {
      nbuf = nbuf || noiseBuffer();
      var t0 = ctx.currentTime, n = Math.round((sec || 2) * 22);
      for (var i = 0; i < n; i++) {
        var t = t0 + Math.random() * (sec || 2), s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
        var env = Math.sin(Math.min(1, (t - t0) / (sec || 2)) * Math.PI);
        s.buffer = nbuf; bp.type = 'bandpass'; bp.frequency.value = 900 + Math.random() * 1600; bp.Q.value = 1.4;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.02 + 0.05 * env, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
        s.connect(bp); bp.connect(g); g.connect(sfxBus); s.start(t, Math.random() * 1.5, 0.06);
      }
    } catch (e) {}
  }

  var THEME = [62, 66, 64, 69, 71, 69, 66, 64];
  var THEME_BEATS = [1, 1, 1, 3, 1.5, 0.5, 1, 3];
  var THEME_BAR = [0, 0, 0, 1, 2, 2, 2, 3];
  var THEME_CHORDS = [[38, 50, 54, 57], [47, 50, 54, 57], [43, 50, 55, 59], [45, 52, 57, 64]];
  var RES_CHORD = [38, 50, 54, 57, 62];
  var DUCK_MUSIC = 0.3, DUCK_AMB = 0.5, MOTIF_SEND = 0.5;
  var MOTIF_BPM = { musicbox: 96, piano: 80, fiddle: 104, whistle: 100, celesta: 88, harp: 78, choir: 64, strings: 70, violin: 60, glitch: 92, full: 72 };
  var cur = null; // 正在搭建的这一遍：{vg, nodes}

  function themeLine(bpm, opt) {
    var spb = 60 / bpm, t = 0, notes = [], bars = [], i, k, d, last = THEME.length - 1;
    for (i = 0; i <= last; i++) {
      k = opt.rit ? 1 + Math.pow(i / last, 1.6) * 1.7 : 1;               // 发条将尽：一音比一音慢
      if (opt.rubato && THEME_BEATS[i] >= 3) k *= 1.15;                   // 独奏：长音多留一口气
      d = THEME_BEATS[i] * spb * k;
      if (i === last && opt.resolve) d = 1.5 * spb;                       // E 只停一拍半，随即落回 D
      if (i === last && opt.cut && !opt.resolve) d = 0.34;                // E 刚响起就被掐断
      if (i === 0 || THEME_BAR[i] !== THEME_BAR[i - 1]) bars.push({ t: t, c: THEME_CHORDS[THEME_BAR[i]] });
      notes.push({ m: THEME[i], t: t, d: d, i: i, det: opt.rit && i >= 5 ? -(i - 4) * 9 : 0 }); // 最后几音微微往下塌
      t += d;
    }
    if (opt.resolve) {
      d = 5 * spb;
      bars.push({ t: t, c: RES_CHORD, res: true });
      notes.push({ m: 62, t: t, d: d, i: last + 1, res: true });
      t += d;
    }
    for (i = 0; i < bars.length; i++) bars[i].d = (i + 1 < bars.length ? bars[i + 1].t : t) - bars[i].t;
    return { notes: notes, bars: bars, end: t, spb: spb };
  }

  function reg(n) { if (cur) cur.nodes.push(n); return n; }
  function mkGain(v) { var g = ctx.createGain(); g.gain.value = v == null ? 1 : v; return g; }
  function mkFilt(type, f, q, gain) { var b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; if (gain != null) b.gain.value = gain; return b; }
  function mkOsc(type, f, t0, t1) { var o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(t0); o.stop(t1); return reg(o); }
  function under(f) { return f < ctx.sampleRate * 0.45; }                // 超过奈奎斯特附近的泛音不画
  function perc(g, t, peak, att, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + att);
    g.gain.exponentialRampToValueAtTime(0.0001, t + att + dec);
  }
  function glide(p, v, t, tc) {
    try {
      if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t);
      else { p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); }
      p.setTargetAtTime(v, t, tc);
    } catch (e) {}
  }
  function duck(t, until) {
    glide(musicBus.gain, MUSIC_GAIN * DUCK_MUSIC, t, 0.25);
    glide(ambientBus.gain, AMB_GAIN * DUCK_AMB, t, 0.35);
    if (until != null && until > t) {
      musicBus.gain.setTargetAtTime(MUSIC_GAIN, until, 0.9);
      ambientBus.gain.setTargetAtTime(AMB_GAIN, until, 1.1);
    }
  }
  function unduck(t) { glide(musicBus.gain, MUSIC_GAIN, t, 0.6); glide(ambientBus.gain, AMB_GAIN, t, 0.8); }

  function tine(dest, f, peak, t, dec, det) {
    [[1, 1, 1], [2, 0.08, 0.45], [6.27, 0.1, 0.16], [17.55, 0.035, 0.05]].forEach(function (p) {
      if (!under(f * p[0])) return;
      var o = mkOsc('sine', f * p[0], t, t + dec * p[2] + 0.06), g = mkGain(0);
      if (det) o.detune.value = det;
      perc(g, t, peak * p[1], 0.002, dec * p[2]); o.connect(g); g.connect(dest);
    });
    noiseHit(dest, t, 0.006, peak * 0.35, 'highpass', 6000, 0.7);
  }
  function celNote(dest, f, peak, t, dec, det) {
    [[1, 1, 1], [2, 0.05, 0.5], [4, 0.16, 0.22], [9.8, 0.04, 0.07]].forEach(function (p) {
      if (!under(f * p[0])) return;
      var o = mkOsc('sine', f * p[0], t, t + dec * p[2] + 0.06), g = mkGain(0);
      if (det) o.detune.value = det;
      perc(g, t, peak * p[1], 0.003, dec * p[2]); o.connect(g); g.connect(dest);
    });
  }
  var pianoWave = null;
  function pianoNote(dest, f, peak, t, dec, det) {
    if (!pianoWave) {
      var re = new Float32Array(12), im = new Float32Array(12);
      for (var k = 1; k < 12; k++) im[k] = Math.pow(k, -1.5) * (k === 7 ? 0.35 : 1);
      pianoWave = ctx.createPeriodicWave(re, im);
    }
    var lp = mkFilt('lowpass', Math.min(9000, f * 9), 0.5), g = mkGain(0);
    lp.frequency.setValueAtTime(Math.min(9000, f * 9), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(320, f * 2.2), t + Math.min(1.4, dec * 0.5));
    [0, 2.5].forEach(function (c, j) {
      var o = mkOsc('sine', f, t, t + dec + 0.06), og = mkGain(j ? 0.45 : 1);
      o.setPeriodicWave(pianoWave); o.detune.value = c + (det || 0);
      o.connect(og); og.connect(lp);
    });
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(peak * 0.38, t + 0.28);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    lp.connect(g); g.connect(dest);
    noiseHit(dest, t, 0.012, peak * 0.25, 'lowpass', 2400, 0.7);          // 槌子碰弦
  }
  var ksCache = {};
  function ksBuf(m) {
    if (ksCache[m]) return ksCache[m];
    var sr = ctx.sampleRate, f = mf(m), N = Math.max(2, Math.round(sr / f - 0.5));
    var t60 = Math.max(1.6, Math.min(4.6, 3.8 - (m - 60) * 0.06)), len = Math.floor(sr * Math.min(3.4, t60 * 0.85));
    var fb = Math.pow(10, -3 / (t60 * f)), line = new Float32Array(N), b = ctx.createBuffer(1, len, sr), d = b.getChannelData(0);
    var i, p = 0, prev = 0, mean = 0, fade = Math.floor(sr * 0.06);
    for (i = 0; i < N; i++) { prev = prev * 0.55 + (Math.random() * 2 - 1) * 0.45; line[i] = prev; mean += prev; }
    mean /= N; for (i = 0; i < N; i++) line[i] -= mean;
    for (i = 0; i < len; i++) { var q = p + 1 === N ? 0 : p + 1, v = line[p]; d[i] = v; line[p] = fb * 0.5 * (v + line[q]); p = q; }
    for (i = 0; i < fade; i++) d[len - 1 - i] *= i / fade;
    return (ksCache[m] = { b: b, rate: f * (N + 0.5) / sr });
  }
  function harpKS(dest, m, peak, t, det) {
    var k = ksBuf(m), s = ctx.createBufferSource(), g = mkGain(peak);
    s.buffer = k.b; s.playbackRate.value = k.rate * (det ? Math.pow(2, det / 1200) : 1);
    s.connect(g); g.connect(dest); s.start(t); reg(s);
  }
  function legato(dest, type, seq, t0, o) {
    var oct = o.oct || 0, lastN = seq[seq.length - 1], tA = t0 + seq[0].t, tZ = t0 + lastN.t + lastN.d + (o.rel || 0.4);
    var g = mkGain(0), vib = o.vib || [5, 0, 0], lfo = mkOsc('sine', vib[0], tA, tZ + 0.1), lg = mkGain(0);
    lfo.connect(lg);
    (o.dets || [0]).forEach(function (dc) {
      var v = mkOsc(type, mf(seq[0].m + oct), tA, tZ + 0.1);
      v.detune.value = dc; lg.connect(v.detune);
      seq.forEach(function (nt, i) {
        var f = mf(nt.m + oct), a = t0 + nt.t;
        if (o.cuts && o.cuts.indexOf(i) >= 0) { v.frequency.setValueAtTime(f * 1.19, a); v.frequency.setValueAtTime(f, a + 0.035); } // 锡口笛的「切音」装饰
        else if (i === 0) v.frequency.setValueAtTime(f, a);
        else { v.frequency.setValueAtTime(mf(seq[i - 1].m + oct), a); v.frequency.exponentialRampToValueAtTime(f, a + (o.glide || 0.03)); }
      });
      v.connect(g);
    });
    seq.forEach(function (nt, i) {
      var a = t0 + nt.t, e = a + nt.d, pk = (o.peak || 0.05) * (nt.v || 1), att = Math.max(0.02, Math.min(o.att || 0.05, nt.d * 0.5));
      if (i) g.gain.linearRampToValueAtTime(pk * (o.dip == null ? 0.45 : o.dip), a + 0.012); // 换弓 / 换气：轻轻一凹，不咔哒
      else g.gain.setValueAtTime(0.0001, a);
      if (o.swell && nt.d > 1) { g.gain.linearRampToValueAtTime(pk * 0.8, a + att); g.gain.linearRampToValueAtTime(pk * 1.1, a + nt.d * 0.45); }
      else g.gain.linearRampToValueAtTime(pk, a + att);
      g.gain.linearRampToValueAtTime(pk * 0.8, Math.max(a + att + 0.01, e - 0.03));
      lg.gain.setValueAtTime(0, a);
      if (nt.d > vib[2] + 0.15) { lg.gain.setValueAtTime(0, a + vib[2]); lg.gain.linearRampToValueAtTime(vib[1], Math.min(e, a + vib[2] + 0.4)); }
    });
    g.gain.linearRampToValueAtTime(0.0001, tZ);
    g.connect(dest);
    return g;
  }
  function formants(dest, fs, gains, q) {
    var input = mkGain(1);
    fs.forEach(function (f, i) { var b = mkFilt('bandpass', f, q), g = mkGain(gains[i]); input.connect(b); b.connect(g); g.connect(dest); });
    return input;
  }
  function chordSeq(tl, k) { return tl.bars.map(function (b) { return { m: b.c[Math.min(k, b.c.length - 1)], t: b.t, d: b.d }; }); }
  function stringPad(dest, tl, t0, peak, oct) {
    var lp = mkFilt('lowpass', 1500, 0.5); lp.connect(dest);
    [1, 2, 3].forEach(function (k) { legato(lp, 'sawtooth', chordSeq(tl, k), t0, { oct: oct || 0, dets: [-6, 5], glide: 0.25, att: 0.6, dip: 0.85, rel: 1.6, peak: peak, vib: [4.6, 6, 0.6] }); });
    var bass = mkFilt('lowpass', 420, 0.6); bass.connect(dest);
    legato(bass, 'sawtooth', chordSeq(tl, 0), t0, { oct: oct || 0, dets: [0], glide: 0.2, att: 0.5, dip: 0.8, rel: 1.8, peak: peak * 1.3 });
  }
  function choirPad(dest, tl, t0, peak) {
    var oo = formants(dest, [330, 760, 2400], [1, 0.45, 0.12], 5);
    [1, 2, 3].forEach(function (k) { legato(oo, 'sawtooth', chordSeq(tl, k), t0, { dets: [-9, 8], glide: 0.2, att: 0.7, dip: 0.85, rel: 2, peak: peak, vib: [5.2, 8, 0.4] }); });
  }
  function rollChord(dest, chord, oct, peak, t, gap) { chord.forEach(function (m, j) { harpKS(dest, m + oct, peak * (j ? 0.8 : 1), t + j * gap); }); }
  function gearClank(dest, t, k) {
    k = k || 1;
    for (var i = 0; i < 7; i++) noiseHit(dest, t + i * 0.022, 0.005, 0.11 * k * (1 - i * 0.09), 'bandpass', 3400 + i * 140, 4);
    [[1, 0.045], [2.76, 0.03], [5.4, 0.016]].forEach(function (p) {
      var o = mkOsc('sine', 740 * p[0], t, t + 0.5), g = mkGain(0);
      perc(g, t, p[1] * k, 0.002, 0.42); o.connect(g); g.connect(dest);
    });
    var th = mkOsc('sine', 95, t, t + 0.2), tg = mkGain(0);
    th.frequency.setValueAtTime(95, t); th.frequency.exponentialRampToValueAtTime(55, t + 0.12);
    perc(tg, t, 0.16 * k, 0.003, 0.14); th.connect(tg); tg.connect(dest);
  }
  function gearTick(dest, t, acc) {
    noiseHit(dest, t, 0.006, acc ? 0.09 : 0.05, 'bandpass', acc ? 2200 : 2900, 5);
    var o = mkOsc('sine', acc ? 1450 : 1900, t, t + 0.05), g = mkGain(0);
    perc(g, t, acc ? 0.02 : 0.012, 0.001, 0.03); o.connect(g); g.connect(dest);
  }
  function gearGrind(dest, t, dur) {
    nbuf = nbuf || noiseBuffer();
    var s = ctx.createBufferSource(), bp = mkFilt('bandpass', 2200, 3), g = mkGain(0), teeth = mkOsc('square', 28, t, t + dur + 0.05), tgn = mkGain(0.5), am = mkGain(0.5);
    s.buffer = nbuf; s.loop = true;
    bp.frequency.setValueAtTime(2200, t); bp.frequency.exponentialRampToValueAtTime(380, t + dur);
    teeth.connect(tgn); tgn.connect(am.gain);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.09, t + 0.08); g.gain.setValueAtTime(0.09, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bp); bp.connect(am); am.connect(g); g.connect(dest);
    s.start(t, Math.random(), dur + 0.1); reg(s);
    gearClank(dest, t + dur, 0.8);
  }

  var VOICES = {
    musicbox: function (dest, tl, t0) {
      tl.notes.forEach(function (nt) { tine(dest, mf(nt.m + 24), 0.07 * (nt.res ? 1.1 : 1), t0 + nt.t, nt.d > 1.5 ? 2.4 : 1.6, nt.det); });
      tl.bars.forEach(function (b) { tine(dest, mf(b.c[0] + 24), 0.03, t0 + b.t + 0.01, 1.4); if (b.res) tine(dest, mf(b.c[2] + 24), 0.025, t0 + b.t + 0.18, 1.8); });
      return { tail: 2 };
    },
    piano: function (dest, tl, t0) {
      tl.notes.forEach(function (nt) { pianoNote(dest, mf(nt.m + 12), 0.075, t0 + nt.t, Math.max(1.6, Math.min(4.5, nt.d + 1.2)), nt.det); });
      tl.bars.forEach(function (b) {
        b.c.forEach(function (m, j) { pianoNote(dest, mf(m), j ? 0.026 : 0.034, t0 + b.t + j * tl.spb * 0.5, b.res ? 6 : 2.6); });
      });
      return { tail: 2.6 };
    },
    fiddle: function (dest, tl, t0) {
      var lp = mkFilt('lowpass', 5200, 0.5), bp = mkFilt('bandpass', 1700, 0.75); bp.connect(lp); lp.connect(dest);
      legato(bp, 'sawtooth', tl.notes, t0, { oct: 12, dets: [0, 4], glide: 0.035, att: 0.04, dip: 0.4, rel: 0.35, peak: 0.06, vib: [5.8, 16, 0.22] });
      var dr = mkFilt('bandpass', 900, 0.8); dr.connect(lp);
      var span = [{ m: 62, t: 0, d: tl.end }];
      legato(dr, 'sawtooth', span, t0, { dets: [0], att: 0.5, rel: 0.6, peak: 0.016 });
      legato(dr, 'sawtooth', span, t0, { oct: 7, dets: [3], att: 0.5, rel: 0.6, peak: 0.01 });
      return { tail: 0.9 };
    },
    whistle: function (dest, tl, t0) {
      var tone = legato(dest, 'sine', tl.notes, t0, { oct: 12, dets: [0], glide: 0.02, att: 0.025, dip: 0.3, rel: 0.25, peak: 0.056, vib: [5.5, 10, 0.4], cuts: [2, 4, 7] });
      nbuf = nbuf || noiseBuffer();
      var s = ctx.createBufferSource(), bp = mkFilt('bandpass', mf(tl.notes[0].m + 12), 7), hs = mkFilt('highpass', 5500, 0.5), bg = mkGain(0), hg = mkGain(0);
      var tA = t0 + tl.notes[0].t, tZ = t0 + tl.end + 0.3;
      s.buffer = nbuf; s.loop = true; s.start(tA, 0); s.stop(tZ + 0.1); reg(s);
      tl.notes.forEach(function (nt, i) {
        var a = t0 + nt.t, f = mf(nt.m + 12);
        bp.frequency.setValueAtTime(f, a);
        bg.gain.setValueAtTime(i ? 0.03 : 0.0001, a); bg.gain.linearRampToValueAtTime(0.06, a + 0.02); bg.gain.linearRampToValueAtTime(0.02, a + Math.min(0.25, nt.d));
        hg.gain.setValueAtTime(0.004, a); hg.gain.linearRampToValueAtTime(0.012, a + 0.015); hg.gain.linearRampToValueAtTime(0.003, a + Math.min(0.2, nt.d));
      });
      bg.gain.linearRampToValueAtTime(0.0001, tZ); hg.gain.linearRampToValueAtTime(0.0001, tZ);
      s.connect(bp); bp.connect(bg); bg.connect(dest); s.connect(hs); hs.connect(hg); hg.connect(dest);
      void tone;
      return { tail: 0.6 };
    },
    celesta: function (dest, tl, t0) {
      tl.notes.forEach(function (nt) { celNote(dest, mf(nt.m + 24), 0.07, t0 + nt.t, nt.d > 1.5 ? 2.2 : 1.5, nt.det); });
      tl.bars.forEach(function (b) { celNote(dest, mf(b.c[1] + 24), 0.022, t0 + b.t, 1.6); celNote(dest, mf(b.c[3] + 12), 0.02, t0 + b.t + 0.03, 1.6); });
      return { tail: 2 };
    },
    harp: function (dest, tl, t0) {
      tl.bars.forEach(function (b) { rollChord(dest, b.c, 12, 0.085, t0 + b.t, 0.075); });
      tl.notes.forEach(function (nt) { harpKS(dest, nt.m + 12, 0.21, t0 + nt.t + 0.02, nt.det); });
      return { tail: 3 };
    },
    choir: function (dest, tl, t0) {
      var ah = formants(dest, [780, 1150, 2800], [1, 0.55, 0.16], 6);
      legato(ah, 'sawtooth', tl.notes, t0, { dets: [-10, 0, 9], glide: 0.09, att: 0.28, dip: 0.6, rel: 1.4, peak: 0.07, vib: [5.2, 12, 0.35], swell: true });
      choirPad(dest, tl, t0, 0.045);
      return { tail: 2.2 };
    },
    strings: function (dest, tl, t0) {
      var lp = mkFilt('lowpass', 3200, 0.6), pk = mkFilt('peaking', 1300, 1, 3); pk.connect(lp); lp.connect(dest);
      legato(pk, 'sawtooth', tl.notes, t0, { oct: 12, dets: [-8, 0, 7], glide: 0.06, att: 0.22, dip: 0.6, rel: 1.4, peak: 0.032, vib: [5.4, 12, 0.3], swell: true });
      stringPad(dest, tl, t0, 0.018);
      return { tail: 2 };
    },
    violin: function (dest, tl, t0) {
      var hp = mkFilt('highpass', 190, 0.6), b1 = mkFilt('peaking', 300, 1, 5), b2 = mkFilt('peaking', 2700, 1.2, 6), lp = mkFilt('lowpass', 6500, 0.5);
      hp.connect(b1); b1.connect(b2); b2.connect(lp); lp.connect(dest);
      legato(hp, 'sawtooth', tl.notes, t0, { oct: 12, dets: [0, 3], glide: 0.09, att: 0.16, dip: 0.55, rel: 1.6, peak: 0.032, vib: [6, 18, 0.38], swell: true });
      return { tail: 2 };
    },
    glitch: function (dest, tl, t0) {
      var n = tl.notes, B = t0 + n[3].t + 0.42 * tl.spb, T = 0.18, k;
      for (k = 0; k < 3; k++) celNote(dest, mf(n[k].m + 12), 0.065, t0 + n[k].t, 1.5);
      celNote(dest, mf(n[3].m + 12), 0.065, t0 + n[3].t, 0.42 * tl.spb + 0.08);
      gearClank(dest, B, 1);
      for (k = 1; k <= 20; k++) gearTick(dest, B + k * T, k % 4 === 0);
      [[4, 3, -35, 0.055], [5, 5, -60, 0.05], [5, 5.5, -75, 0.04], [5, 6, -45, 0.05], [6, 7, -110, 0.048], [7, 10, -150, 0.05]].forEach(function (p) {
        var f = mf(THEME[p[0]] + 12), t = B + p[1] * T;
        celNote(dest, f, p[3], t, p[0] === 7 ? 1.4 : 0.55, p[2]);
        if (p[0] === 7) celNote(dest, f, 0.03, t, 1.4, p[2] + 38);        // 最后那个 E 两根簧对不齐，嗡嗡地拍
      });
      gearGrind(dest, B + 12 * T, 0.55);
      return { end: B + 12 * T + 0.6 - t0, tail: 0.8, hits: [B] };
    },
    full: function (dest, tl, t0) {
      stringPad(dest, tl, t0, 0.014);
      choirPad(dest, tl, t0, 0.026);
      tl.notes.forEach(function (nt) {
        pianoNote(dest, mf(nt.m + 12), 0.06, t0 + nt.t, Math.max(1.8, Math.min(6, nt.d + 1.4)));
        celNote(dest, mf(nt.m + 24), 0.016, t0 + nt.t + 0.01, 1.4);
      });
      tl.bars.forEach(function (b) {
        rollChord(dest, b.c, 12, 0.05, t0 + b.t, b.res ? 0.11 : 0.07);
        if (b.res) { harpKS(dest, 86, 0.06, t0 + b.t + 0.7); celNote(dest, mf(86), 0.03, t0 + b.t + 0.9, 3); }
      });
      return { tail: 3.2 };
    }
  };

  function motif(name, opt) {
    if (!ctx || muted || !VOICES[name]) return null;
    opt = opt || {};
    try {
      stopMotif(true);
      var tl = themeLine(MOTIF_BPM[name], { resolve: !!opt.resolve && name !== 'glitch', rit: !!opt.rit, cut: !!opt.cut, rubato: name === 'violin' });
      var t0 = now() + 0.08, vg = mkGain(1);
      vg.connect(motifBus);
      cur = { vg: vg, nodes: [] };
      var r = VOICES[name](vg, tl, t0) || {};
      var end = t0 + (r.end != null ? r.end : tl.end) + (r.tail != null ? r.tail : 1.6);
      if (opt.cut && name !== 'glitch') { // 戛然而止：最后那个 E 刚响起就掐掉，连混响的尾巴一起
        var tc = t0 + tl.end;
        vg.gain.setValueAtTime(1, tc); vg.gain.linearRampToValueAtTime(0, tc + 0.012);
        glide(motifSend.gain, MOTIF_SEND, now(), 0.01);
        motifSend.gain.setValueAtTime(MOTIF_SEND, tc); motifSend.gain.linearRampToValueAtTime(0, tc + 0.012);
        motifSend.gain.setValueAtTime(MOTIF_SEND, tc + 2.2);
        end = tc + 0.05;
      }
      duck(now(), end - 0.5);
      var me = cur; cur = null; me.end = end; mv = me;
      me.timer = setTimeout(function () { if (mv === me) mv = null; try { vg.disconnect(); } catch (e) {} }, Math.max(0, end - now()) * 1000 + 2500);
      return { name: name, dur: end - now(), hits: (r.hits || []).map(function (h) { return Math.max(0, h - now()); }) };
    } catch (e) { cur = null; return null; }
  }
  function stopMotif(keepDuck) {
    if (!ctx || !mv) return;
    var m = mv; mv = null;
    try {
      var t = now();
      clearTimeout(m.timer);
      glide(m.vg.gain, 0, t, 0.06);
      m.nodes.forEach(function (n) { try { n.stop(t + 0.4); } catch (e) {} });
      setTimeout(function () { try { m.vg.disconnect(); } catch (e) {} }, 700);
      glide(motifSend.gain, MOTIF_SEND, t + 0.3, 0.05);
      if (keepDuck !== true) unduck(t);
    } catch (e) {}
  }
  function motifPlaying() { return !!(mv && ctx && now() < mv.end); }
  var meterNode = null, meterBuf = null;
  function meter() {
    if (!ctx) return null;
    if (!meterNode) { meterNode = ctx.createAnalyser(); meterNode.fftSize = 2048; meterBuf = new Float32Array(meterNode.fftSize); master.connect(meterNode); }
    meterNode.getFloatTimeDomainData(meterBuf);
    var s = 0, pk = 0;
    for (var i = 0; i < meterBuf.length; i++) { var v = meterBuf[i]; s += v * v; if (Math.abs(v) > pk) pk = Math.abs(v); }
    return { rms: Math.sqrt(s / meterBuf.length), peak: pk, gain: master.gain.value, music: musicBus.gain.value, amb: ambientBus.gain.value };
  }

  root.PlainAudio = { init: init, ok: ok, play: play, tick: tick, thud: thud, applause: applause, sfx: sfx, ambient: ambient, setDegrade: setDegrade, stinger: stinger, setVolume: setVolume, setMuted: setMuted,
    motif: motif, stopMotif: stopMotif, motifPlaying: motifPlaying, meter: meter, MOTIFS: Object.keys(VOICES) };
})(typeof globalThis !== 'undefined' ? globalThis : this);
