"""mix.py: channel strips, sends, sidechain, buses, stems and the master for "Pen Pal".

Signal flow
  track -> channel strip (EQ / dynamics / colour) -> pan -> sidechain pump (by section) -> sub-bus
  sub-bus -> calibrated to a loudness target (pyloudnorm, over the section where it matters)
  sub-bus -> sends: vocal plate (2.0 s), drum room, 1/8-dotted ping-pong delay (automated by section,
             with throws on phrase ends); returns are added into the sub-bus's own stem so that the
             eight stems sum to the pre-master mix
  stems   -> band duck + dither on FADE, the silence window (digital zero; only the dry "the" and
             the writer's keystroke are added back inside it)
  master  -> 25 Hz HPF, tone EQ, glue compressor, 2x-oversampled soft clip, 4x true-peak lookahead
             limiter at -1 dBTP; input gain iterated until -9.0 LUFS integrated; silence re-asserted.
"""
import math

import numpy as np
from scipy import signal

from dsp import (SR, bitcrush, compressor, convolve, db, deesser, eq, exciter, hp, limiter, lp, lufs, mono,
                 n_of, onepole, oversample, pan, pingpong, plate_ir, rng, room_ir, soft_clip, stereo, tanh_sat,
                 true_peak, undb, width)

_HB = None


def _decimate2(x):
    """2x decimation with a 63-tap Kaiser half-band low-pass."""
    global _HB
    if _HB is None:
        _HB = signal.firwin(63, 0.5, window=("kaiser", 8.0))
    D = 31
    y = np.stack([signal.lfilter(_HB, [1.0], np.concatenate([np.ascontiguousarray(x[:, c]), np.zeros(D)]))[D:]
                  for c in range(x.shape[1])], axis=1)
    return y[0::2]

DOTTED_8TH = 0.375   # at 120 bpm


class Mixer:
    def __init__(self, score, kick_times):
        self.S = score
        self.spb = 60.0 / score["bpm"]
        self.dur = score["durationBeats"] * self.spb
        self.N = n_of(self.dur)
        self.secs = [(s["name"], s["startBeat"] * self.spb, (s["startBeat"] + s["beats"]) * self.spb)
                     for s in sorted(score["sections"], key=lambda s: s["startBeat"])]
        sil = score["parts"]["silence"][0]
        self.sil = (sil[0] * self.spb, (sil[0] + sil[1]) * self.spb)
        self.kicks = sorted(kick_times)
        self.ducks = [(a * self.spb, (a + d) * self.spb) for a, d in score["parts"]["drums"]["ducks"]]
        self._plate = plate_ir(2.4, predelay=0.028, bright=1.0, seed=3)
        self._plate_dark = plate_ir(2.0, predelay=0.02, bright=0.7, seed=4)
        self._room = room_ir(0.5, seed=8)
        self.report = {}

    # --------------------------------------------------------------------------------------------
    # automation helpers
    # --------------------------------------------------------------------------------------------
    def by_section(self, values, default=0.0, ramp=0.03):
        """Per-sample curve: values {section name or prefix: value}, smoothed by `ramp` seconds."""
        c = np.full(self.N, float(default))
        for name, a, b in self.secs:
            v = None
            if name in values:
                v = values[name]
            else:
                for k, val in values.items():
                    if k.endswith("*") and name.startswith(k[:-1]):
                        v = val
            if v is not None:
                c[n_of(a):n_of(b)] = v
        return onepole(c, ramp) if ramp else c

    def windows(self, spans, value, default=0.0, ramp=0.01):
        c = np.full(self.N, float(default))
        for a, b in spans:
            c[n_of(a):n_of(b)] = value
        return onepole(c, ramp) if ramp else c

    def pump_env(self, release=0.17, hold=0.006):
        """0..1 envelope: 1 on each kick (2 ms pre-ramp), held 6 ms, then a squared release."""
        env = np.zeros(self.N)
        L = n_of(release)
        H = n_of(hold)
        pre = n_of(0.002)
        shape = np.concatenate([np.linspace(0, 1, pre, endpoint=False), np.ones(H), (1 - np.linspace(0, 1, L)) ** 2])
        for t in self.kicks:
            i0 = n_of(t) - pre
            a, b = max(0, i0), min(self.N, i0 + len(shape))
            if b > a:
                env[a:b] = np.maximum(env[a:b], shape[a - i0:b - i0])
        return env

    def pump(self, x, depth_db_by_section, release=0.17):
        """Sidechain duck to the kick: depth (dB) per section."""
        d = self.by_section(depth_db_by_section, 0.0, ramp=0.05)
        g = 1.0 - (1.0 - undb(-d)) * self.pump_env(release)
        return x * (g if x.ndim == 1 else g[:, None])

    @staticmethod
    def active_lufs(x, a=None, b=None):
        seg = stereo(x[n_of(a):n_of(b)] if a is not None else x)
        try:
            v = lufs(seg)
        except Exception:
            v = -70.0
        return v if np.isfinite(v) else -70.0

    def calibrate(self, x, target, spans, name):
        """Scale a bus so its loudness over `spans` (concatenated) hits `target` LUFS."""
        segs = [stereo(x[n_of(a):n_of(b)]) for a, b in spans]
        cat = np.concatenate(segs, axis=0)
        cur = self.active_lufs(cat)
        g = undb(target - cur) if cur > -69 else 1.0
        self.report.setdefault("calibration", {})[name] = {"measured": round(cur, 2), "target": target,
                                                           "gain_db": round(float(db(g)), 2)}
        return x * g

    # --------------------------------------------------------------------------------------------
    # channel strips
    # --------------------------------------------------------------------------------------------
    @staticmethod
    def norm_active(x, target=-18.0):
        m = mono(x)
        w = n_of(0.05)
        e = np.sqrt(np.convolve(m[::4] ** 2, np.ones(w // 4) / (w // 4), mode="same") + 1e-12)
        act = e > undb(-45) * e.max()
        r = math.sqrt(np.mean(e[act] ** 2)) if act.any() else 1.0
        return x * undb(target) / max(r, 1e-9)

    def lead_chain(self, x, double=False, norm=True):
        if norm:
            x = self.norm_active(x, -18.0)
        x = hp(x, 95, 4)
        x = deesser(x, 6500, thr=-30.0, ratio=5.0, max_cut=9.0)
        x = eq(x, ("peak", 170, 0.9, 1.0), ("peak", 320, 1.1, -3.5), ("peak", 1000, 1.0, -1.0),
               ("peak", 3600, 0.9, 3.5), ("highshelf", 9500, 0.7, 2.5))
        x = compressor(x, thr=-22.0, ratio=4.0, attack=0.004, release=0.08, knee=6.0, makeup=4.0)
        x = compressor(x, thr=-17.0, ratio=2.0, attack=0.02, release=0.25, knee=6.0, makeup=1.5)
        x = exciter(x, 3500, 3.0, 0.08, 7500)
        x = tanh_sat(x * 1.2, 1.1) / 1.2
        if double:
            x = lp(x, 8500, 2)
            x = compressor(x, thr=-20.0, ratio=6.0, attack=0.002, release=0.06)
        return x

    def chant_chain(self, x, double=False):
        x = self.norm_active(x, -18.0)
        x = hp(x, 70 if double else 110, 4)
        x = eq(x, ("peak", 260, 1.0, -3.0), ("peak", 1200, 0.8, 1.5), ("peak", 2800, 0.9, 2.5),
               ("highshelf", 9000, 0.7, 1.0 if not double else -6.0))
        x = compressor(x, thr=-24.0, ratio=6.0, attack=0.002, release=0.06, knee=4.0, makeup=5.0)
        x = tanh_sat(x * 1.3, 1.3) / 1.3
        return x

    def choir_chain(self, x):
        x = self.norm_active(x, -18.0)
        x = hp(x, 160, 4)
        x = eq(x, ("peak", 380, 1.0, -3.0), ("peak", 4000, 0.9, 2.0), ("highshelf", 10000, 0.7, 2.5))
        x = compressor(x, thr=-22.0, ratio=3.0, attack=0.008, release=0.12, makeup=3.0)
        x = exciter(x, 3500, 3.0, 0.05, 7500)
        return width(x, 1.25)

    def gang_chain(self, x):
        x = self.norm_active(x, -18.0)
        x = hp(x, 150, 4)
        x = eq(x, ("peak", 420, 1.0, -3.5), ("peak", 3000, 0.8, 3.0), ("highshelf", 8000, 0.7, 2.0))
        x = tanh_sat(x * 2.0, 1.6) / 2.0               # shouted: a little grit
        x = compressor(x, thr=-24.0, ratio=6.0, attack=0.003, release=0.08, makeup=5.0)
        return width(x, 1.35)

    # --------------------------------------------------------------------------------------------
    def process(self, V, B, D, K, O):
        """V vocals, B bass, D drums, K keys, O other -> dict of stereo stems (pre-master)."""
        N = self.N
        sec = self.by_section
        stems = {}
        plate_in = {}
        delay_in = {}
        room_in = {}

        def send(stem, x, plate=None, delay=None, room=None):
            for store, g in ((plate_in, plate), (delay_in, delay), (room_in, room)):
                if g is None:
                    continue
                gg = g if np.isscalar(g) else g
                y = stereo(x) * (gg if np.isscalar(gg) else gg[:, None])
                store[stem] = store.get(stem, 0) + y

        # ---------------- lead
        lead = self.lead_chain(V["lead"])
        lead = pan(lead, 0.0)
        lead = self.calibrate(lead, -17.0, [(35.2, 52.0), (83.2, 100.0)], "lead")
        g_lead = self.report["calibration"]["lead"]["gain_db"]
        dbl = self.lead_chain(V["lead_dbl"], double=True)
        dbl = self.calibrate(dbl, -25.5, [(35.2, 52.0), (83.2, 100.0)], "lead_dbl")
        # the dry "the" inside the silence window: the lead's own normalisation, chain and level, no sends
        g_norm = float(np.max(np.abs(self.norm_active(V["lead"], -18.0)))) / max(float(np.max(np.abs(V["lead"]))), 1e-12)
        the = pan(self.lead_chain(V["lead_the"] * g_norm, norm=False), 0.0) * undb(g_lead) if np.any(V["lead_the"]) else np.zeros((N, 2))
        # plate and delay automation: space for the bare voice, the melt, the choruses and the end
        plate = sec({"boot": -7.0, "pre*": -12.0, "chorus*": -13.0, "bridge": -12.0, "breakdown": -9.0,
                     "outro": -9.5, "verse2": -18.0, "tail": -9.0}, -40.0, ramp=0.2)
        dly = sec({"boot": -15.0, "pre*": -20.0, "chorus*": -18.0, "bridge": -17.0, "breakdown": -14.0,
                   "outro": -13.0, "tail": -13.0}, -60.0, ramp=0.2)
        throws = np.zeros(N)
        for L in self.S["lines"]:
            if L["voice"] == "lead" and L["section"].startswith(("chorus", "pre", "bridge", "outro", "breakdown")):
                w = L["words"][-1]
                if w.get("silent"):
                    continue
                a = w["notes"][-1][1] * self.spb
                b = a + w["notes"][-1][2] * self.spb + 0.05
                throws[n_of(a):n_of(b)] = 7.0
        throws = onepole(throws, 0.03)
        send("lead", lead, plate=undb(plate), delay=undb(dly + throws))
        send("lead", dbl, plate=undb(plate - 3))
        stems["lead"] = lead + dbl
        stems["_lead_the"] = the

        # ---------------- chant (dry; a touch of room in the melt and the bridge)
        ch = pan(self.chant_chain(V["chant"]), 0.0)
        ch = self.calibrate(ch, -17.0, [(4.0, 28.0), (60.0, 76.0)], "chant")
        chd = self.chant_chain(V["chant_dbl"], double=True)
        chd = self.calibrate(chd, -25.0, [(4.0, 28.0), (60.0, 76.0)], "chant_dbl")
        cpl = sec({"pre*": -20.0, "bridge": -16.0, "outro": -22.0}, -60.0, ramp=0.2)
        send("chant", ch + chd, plate=undb(cpl), delay=undb(sec({"bridge": -22.0}, -60.0, ramp=0.2)))
        stems["chant"] = ch + chd

        # ---------------- choir (stacks) + gang (12 copies)
        cr = self.choir_chain(V["choir"])
        cr = self.calibrate(cr, -18.5, [(52.0, 60.0), (100.0, 104.0)], "choir")
        cr = self.pump(cr, {"chorus*": 2.0, "post*": 2.5})
        send("choir", cr, plate=undb(-9.0), delay=undb(-22.0))
        gg = self.gang_chain(V["gang"])
        you = [(50.0, 52.0), (98.0, 100.0), (142.0, 144.0)]
        lead_you = self.active_lufs(np.concatenate([stereo(lead[n_of(a):n_of(b)]) for a, b in you]))
        gg = self.calibrate(gg, lead_you + 3.0, you, "gang")
        send("choir", gg, plate=undb(-15.0), room=undb(-12.0))
        stems["choir"] = cr + gg

        # ---------------- spoken: k1 the 1988 sample, o3 dry
        sp = V["spoken"]
        sp = hp(sp, 80, 2)
        sp = compressor(self.norm_active(sp, -18.0), thr=-22.0, ratio=3.0, attack=0.005, release=0.1, makeup=3.0)
        sp = pan(sp, 0.0)
        k1 = self.windows([(119.5, 123.0)], 1.0, ramp=0)
        sp_k1 = self.calibrate(sp * k1[:, None], -19.0, [(120.0, 122.2)], "spoken_k1")
        sp_o3 = self.calibrate(sp * (1 - k1)[:, None], -17.5, [(150.9, 152.9)], "spoken_o3")
        stems["spoken"] = sp_k1 + sp_o3
        send("spoken", sp_k1, delay=undb(-20.0))

        # ---------------- drums
        kick = pan(eq(mono(D["kick"]), ("hp", 28), ("peak", 3500, 1.0, 1.5)), 0.0)
        sn = eq(D["snare"], ("hp", 100), ("peak", 220, 1.0, 1.5), ("highshelf", 7000, 0.7, 1.5))
        hats = eq(D["hats"], ("hp", 600), ("peak", 6500, 0.9, 1.0), ("highshelf", 11000, 0.7, -3.0))
        cl = eq(D["claps"], ("hp", 300))
        cr_ = eq(D["crash"], ("hp", 450), ("highshelf", 9000, 0.7, -3.5))
        pc = eq(D["perc"], ("hp", 80))
        drums = kick * undb(-0.5) + sn * undb(-2.5) + hats * undb(-15.0) + cl * undb(-4.5) + cr_ * undb(-13.0) + pc * undb(-10.0)
        drums = compressor(drums, thr=-12.0, ratio=2.5, attack=0.008, release=0.12, knee=6.0)
        drums = drums * 0.78 + 0.22 * tanh_sat(drums * 2.0, 1.5) / 2.0
        drums = self.calibrate(drums, -16.0, [(36.0, 52.0), (84.0, 100.0)], "drums")
        gd = undb(self.report["calibration"]["drums"]["gain_db"])
        sn_send = sec({"chorus*": -16.0, "pre*": -18.0, "post*": -18.0, "outro": -18.0}, -24.0, ramp=0.1)
        send("drums", (sn * undb(-3.0) + cl * undb(-5.0)) * gd, plate=undb(sn_send))
        send("drums", (sn * undb(-3.0) + cl * undb(-5.0) + pc * undb(-9.0)) * gd, room=undb(-10.0))
        stems["drums"] = drums

        # ---------------- bass: the two floppies (hard L/R), the clean sub, the 808 (all lows mono)
        fa = hp(B["floppyA"], 130, 2)
        fb = hp(B["floppyB"], 160, 2)
        steppers = pan(fa, -0.9) * undb(-4.0) + pan(fb, 0.9) * undb(-6.5)
        subs = pan(lp(B["subA"], 220, 2), 0.0) + pan(lp(B["subB"], 220, 2), 0.0) * undb(-10.0)
        s808 = lp(B["808"], 260, 2)
        s808 = self.pump(pan(s808, 0.0), {"chorus*": 12.0, "bridge": 10.0}, release=0.09)
        ped = pan(B["pedal"], 0.0)
        bass = steppers + subs * undb(-3.0) + s808 * undb(-4.0) + ped * undb(-6.0)
        bass = compressor(bass, thr=-16.0, ratio=3.0, attack=0.01, release=0.1, knee=6.0, makeup=2.0)
        bass = self.pump(bass, {"chorus*": 6.0, "post*": 5.0, "intro": 3.0, "verse*": 3.0, "pre*": 3.0, "bridge": 3.0,
                                "outro": 3.0})
        bass = self._mono_lows(bass, 140)
        bass = self.calibrate(bass, -19.0, [(36.0, 52.0), (84.0, 100.0)], "bass")
        stems["bass"] = bass

        # ---------------- keys
        organ = eq(K["organ"], ("hp", 110), ("peak", 2500, 0.9, 2.0), ("peak", 400, 1.0, -2.0))
        organ = self.pump(organ, {"post*": 3.0, "verse*": 2.0, "intro": 2.0, "outro": 2.0})
        organ = self.calibrate(organ, -19.5, [(4.0, 12.0), (60.0, 68.0)], "organ")
        piano = eq(K["piano"], ("hp", 160), ("peak", 3000, 1.0, 1.5))
        piano = self.pump(piano, {"chorus*": 3.5})
        piano = self.calibrate(piano, -24.0, [(36.0, 52.0)], "piano")
        felt = eq(K["felt"], ("hp", 90))
        felt = self.calibrate(felt, -21.0, [(122.0, 126.0)], "felt")
        strings = width(eq(K["strings"], ("hp", 150), ("highshelf", 8000, 0.7, 1.5)), 1.3)
        strings = self.pump(strings, {"pre*": 4.0})
        strings = self.calibrate(strings, -22.5, [(28.0, 34.5), (76.0, 82.5)], "strings")
        pad = width(eq(K["pad"], ("hp", 160)), 1.4)
        pad = self.pump(pad, {"chorus*": 9.0, "bridge": 4.0})
        pad = self.calibrate(pad, -26.0, [(36.0, 52.0)], "pad")
        boot = eq(K["boot"], ("hp", 38))
        boot = self.calibrate(boot, -17.5, [(0.0, 4.0)], "boot")
        keys = organ + piano + felt + strings + pad + boot
        opl = sec({"intro": -60.0, "verse1": -60.0}, -20.0, ramp=0.3)
        send("keys", organ, plate=undb(opl))
        send("keys", piano * undb(-1) + strings + pad + boot + felt * undb(3), plate=undb(-13.0))
        stems["keys"] = keys

        # ---------------- other: stabs, sax, the Writing Bell, beeps, risers, foley, chops
        brass = eq(O["brass"], ("hp", 140), ("peak", 2200, 0.9, 2.0))
        brass = self.calibrate(brass, -22.5, [(36.0, 52.0), (84.0, 100.0)], "brass")
        sax = eq(O["sax"], ("hp", 120))
        sax = self.calibrate(sax, -21.0, [(42.5, 43.5), (90.5, 91.5), (134.5, 135.5)], "sax")
        bell = eq(O["bell"], ("hp", 400))
        bell = self.calibrate(bell, -24.0, [(36.0, 52.0), (144.0, 148.0)], "bell")
        beeps = eq(O["beeps"], ("hp", 200))
        beeps = self.calibrate(beeps, -25.0, [(104.0, 116.0)], "beeps")
        ris = width(eq(O["risers"], ("hp", 120)), 1.3)
        ris = self.calibrate(ris, -24.0, [(28.0, 34.75)], "risers")
        sfx = O["sfx"] * undb(-7.0)
        chops = eq(V["chops"], ("hp", 220), ("peak", 3000, 1.0, 2.0))
        chops = compressor(self.norm_active(chops, -18.0), thr=-22.0, ratio=4.0, attack=0.002, release=0.05, makeup=3.0)
        chops = pan(chops, 0.0)
        chops = self.pump(chops, {"post*": 3.0})
        chops = self.calibrate(chops, -21.0, [(4.0, 12.0), (56.0, 60.0)], "chops")
        other = brass + sax + bell + beeps + ris + sfx + chops
        send("other", brass, plate=undb(-15.0))
        send("other", sax, plate=undb(-11.0), delay=undb(-14.0))
        send("other", bell, plate=undb(-11.0), delay=undb(-15.0))
        send("other", chops, delay=undb(sec({"post*": -16.0}, -60.0, ramp=0.1)))
        stems["other"] = other
        sfx_sil = O["sfx_sil"] * undb(-7.0)

        # ---------------- returns (into each stem)
        for stem, x in plate_in.items():
            ir = self._plate if stem in ("lead", "choir", "chant", "other") else self._plate_dark
            ret = convolve(x, ir)
            if stem == "lead":   # duck the plate under the dry lead so the words stay clear
                ret = compressor(ret, thr=-30.0, ratio=3.0, attack=0.01, release=0.25,
                                 sidechain=stems["lead"])
            stems[stem] = stems[stem] + hp(ret, 180, 2)
        for stem, x in delay_in.items():
            d = pingpong(x, DOTTED_8TH, feedback=0.33, repeats=8, lp_hz=4500, hp_hz=350)
            stems[stem] = stems[stem] + d
        for stem, x in room_in.items():
            stems[stem] = stems[stem] + convolve(x, self._room)

        # ---------------- section energy: verses sit back, the pre-chorus builds, the choruses lift
        en = self.energy_curve()
        for k in ("drums", "bass", "keys", "other", "choir"):
            stems[k] = stems[k] * undb(en if k != "choir" else 0.5 * en)[:, None]

        # ---------------- FADE: the band ducks 6 dB and dithers for a beat and a half
        dk = self.windows(self.ducks, 1.0, ramp=0.008)
        rgen = rng("dither")
        for k in ("drums", "bass", "keys", "other"):
            x = stems[k]
            crushed = bitcrush(x * 4.0, 7, 48000, dither=True, seed=k) / 4.0
            x = x * (1 - dk[:, None]) + (0.4 * x + 0.6 * crushed) * dk[:, None]
            stems[k] = x * (1 - dk * (1 - undb(-6.0)))[:, None]

        # ---------------- the silence window: digital zero, then the dry "the" and the keystroke
        a, b = n_of(self.sil[0]), n_of(self.sil[1])
        fo = n_of(0.004)
        for k in list(stems.keys()):
            if k.startswith("_"):
                continue
            x = stems[k]
            x[a - fo:a] *= np.linspace(1, 0, fo)[:, None]
            x[a:b] = 0.0
        stems["lead"] = stems["lead"] + the
        stems["other"] = stems["other"] + sfx_sil
        del stems["_lead_the"]
        self.report["levels"] = {k: round(self.active_lufs(v), 2) for k, v in stems.items()}
        return stems

    def energy_curve(self):
        """Band gain (dB) per section: the arrangement's dynamics, so the chorus is the loudest thing."""
        flat = {"boot": 0.0, "intro": -1.0, "verse1": -3.0, "chorus1": 0.0, "post1": -0.5, "verse2": -3.0,
                "chorus2": 0.0, "post2": -0.5, "bridge": -1.5, "breakdown": -1.5, "chorus3": 0.5, "outro": -1.0,
                "tail": 0.0}
        c = np.zeros(self.N)
        for name, a, b in self.secs:
            ia, ib = n_of(a), n_of(b)
            if name.startswith("pre"):
                c[ia:ib] = np.linspace(-3.0, -0.5, ib - ia)          # the build
            else:
                c[ia:ib] = flat.get(name, 0.0)
            if name == "verse1":
                c[n_of(a + 8.0):ib] = -2.0                           # bars 5-8: the riff returns
        return onepole(c, 0.02)

    def _mono_lows(self, x, f):
        m = (x[:, 0] + x[:, 1]) * 0.5
        s = (x[:, 0] - x[:, 1]) * 0.5
        s = hp(s, f, 4)
        return np.stack([m + s, m - s], axis=1)

    # --------------------------------------------------------------------------------------------
    # master
    # --------------------------------------------------------------------------------------------
    def master_chain(self, mix, gain_db):
        x = mix * undb(gain_db)
        x = hp(x, 25, 2)
        x = eq(x, ("lowshelf", 70, 0.7, -1.0), ("peak", 280, 0.8, -1.0), ("peak", 520, 1.0, -1.0),
               ("peak", 3000, 0.8, 1.5), ("highshelf", 9500, 0.7, 0.5))
        x = compressor(x, thr=-10.0, ratio=2.0, attack=0.03, release=0.16, knee=8.0, mode="rms")
        # 2x-oversampled soft clip shaves the transients a few dB before the limiter
        up = oversample(x, 2)
        up = soft_clip(up, ceiling=undb(-0.6), knee=0.55)
        x = _decimate2(up)[: len(mix)]
        y, g = limiter(x, ceiling_db=-1.2, lookahead=0.004, release=0.07)
        return y, g

    def master(self, stems, keep_spans, target=-9.0):
        mix = sum(stems.values())
        gain = target - self.active_lufs(mix) + 1.0
        hist = []
        for it in range(8):
            y, g = self.master_chain(mix, gain)
            L = lufs(y)
            hist.append((round(gain, 2), round(L, 2)))
            if abs(L - target) < 0.05:
                break
            if len(hist) >= 2 and abs(hist[-1][1] - hist[-2][1]) > 1e-3:
                slope = (hist[-1][1] - hist[-2][1]) / (hist[-1][0] - hist[-2][0])
                slope = min(max(slope, 0.3), 1.0)
            else:
                slope = 0.8
            gain += (target - L) / slope
        # the silence window again (the master's filters must not leak into it)
        a, b = n_of(self.sil[0]), n_of(self.sil[1])
        mask = np.zeros(b - a)
        for s0, s1 in keep_spans:          # the dry "the" and the keystroke, each with a 3 ms fade out
            i0, i1 = max(a, n_of(s0)) - a, min(b, n_of(s1)) - a
            if i1 > i0:
                mask[i0:i1] = 1.0
                f = min(n_of(0.003), i1 - i0)
                mask[i1 - f:i1] = np.minimum(mask[i1 - f:i1], np.linspace(1, 0, f))
        y[a:b] *= mask[:, None]
        # the tail: the boot chord rings out and lands on exact zero at DUR
        fo = n_of(0.35)
        y[-fo:] *= np.linspace(1, 0, fo)[:, None] ** 2
        self.report["master"] = {"gain_db": round(gain, 2), "iterations": hist,
                                 "limiter_max_gr_db": round(float(-db(np.min(g))), 2),
                                 "limiter_mean_gr_db_chorus": round(float(-db(np.mean(g[n_of(36):n_of(52)]))), 2)}
        return y, gain
