"""mix.py: channel strips, sends, sidechain, buses, stems and the master for "Pen Pal".

Signal flow
  track -> channel strip (EQ / dynamics / colour) -> pan -> sidechain pump (by section) -> sub-bus
  sub-bus -> calibrated to a loudness target (pyloudnorm, over the section where it matters)
  sub-bus -> sends: vocal plate (2.0 s), drum room, 1/8-dotted ping-pong delay (automated by section,
             with throws on phrase ends); returns are added into the sub-bus's own stem so that the
             eight stems sum to the pre-master mix
  stems   -> band duck + dither on FADE, the silence window (digital zero; only the dry "the" and
             the writer's keystroke are added back inside it)
  master  -> 30 Hz HPF (24 dB/oct), tone EQ, glue compressor, 2x-oversampled soft clip, 4x true-peak lookahead
             limiter at -1.2 dBTP; input gain iterated until -14.0 LUFS integrated; silence re-asserted.
"""
import math

import numpy as np
from scipy import signal

from dsp import (SR, CTRL, _ctrl_level, bitcrush, compressor, convolve, db, deesser, eq, exciter, hp, limiter, lp,
                 lufs, mono, n_of, onepole, oversample, pan, pingpong, plate_ir, pocket, room_ir, soft_clip, stereo,
                 tanh_sat, undb, width)

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
CHORUSES = ("chorus1", "chorus2", "chorus3")


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

    def sec_eq(self, x, sections, *bands, ramp=0.05):
        """EQ that applies only in the given sections (crossfaded at the boundaries)."""
        m = self.by_section({k: 1.0 for k in sections}, 0.0, ramp=ramp)
        y = eq(x, *bands)
        return x + (y - x) * (m if x.ndim == 1 else m[:, None])

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
               ("peak", 3600, 0.9, 2.5), ("highshelf", 9500, 0.7, 2.5))
        x = compressor(x, thr=-22.0, ratio=4.0, attack=0.004, release=0.08, knee=6.0, makeup=4.0)
        x = compressor(x, thr=-17.0, ratio=2.0, attack=0.02, release=0.25, knee=6.0, makeup=1.5)
        x = exciter(x, 3500, 3.0, 0.11, 7500)
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
        if not double:   # de-ess only the hottest consonants (the top 3 % of the 4.5 kHz+ band), at most 3 dB
            hl = db(_ctrl_level(hp(x, 4500, 4), "rms"))
            thr = float(np.percentile(hl[hl > hl.max() - 50], 97))
            x = deesser(x, 4500, thr=thr, ratio=4.0, max_cut=3.0)
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
        x = eq(x, ("peak", 420, 1.0, -3.5), ("peak", 3000, 0.8, 1.5))
        x = tanh_sat(x * 1.4, 1.3) / 1.4               # shouted: a little grit (not so much that 'do' frays)
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
        # the choruses: the lead and choir fundamentals (D4-D5) are the 400 Hz lump; thin it a little there
        lead = self.sec_eq(lead, CHORUSES, ("peak", 400, 1.2, -1.5))
        lead = self.calibrate(lead, -14.0, [(35.2, 52.0), (83.2, 100.0)], "lead")
        g_lead = self.report["calibration"]["lead"]["gain_db"]
        dbl = self.lead_chain(V["lead_dbl"], double=True)
        dbl = self.calibrate(dbl, -22.5, [(35.2, 52.0), (83.2, 100.0)], "lead_dbl")
        # the dry "the" inside the silence window: the lead's own normalisation, chain and level, no sends
        g_norm = float(np.max(np.abs(self.norm_active(V["lead"], -18.0)))) / max(float(np.max(np.abs(V["lead"]))), 1e-12)
        the = pan(self.lead_chain(V["lead_the"] * g_norm, norm=False), 0.0) * undb(g_lead) if np.any(V["lead_the"]) else np.zeros((N, 2))
        # plate and delay automation: space for the bare voice, the melt, the choruses and the end
        plate = sec({"boot": -8.0, "pre*": -13.0, "chorus*": -15.0, "bridge": -13.0, "breakdown": -10.0,
                     "outro": -10.5, "verse2": -18.0, "tail": -9.0}, -40.0, ramp=0.2)
        dly = sec({"boot": -16.0, "pre*": -22.0, "chorus*": -21.0, "bridge": -19.0, "breakdown": -15.0,
                   "outro": -14.0, "tail": -13.0}, -60.0, ramp=0.2)
        throws = np.zeros(N)
        for L in self.S["lines"]:
            if L["voice"] == "lead" and L["section"].startswith(("chorus", "pre", "bridge", "outro", "breakdown")):
                w = L["words"][-1]
                if w.get("silent"):
                    continue
                a = w["notes"][-1][1] * self.spb
                b = a + w["notes"][-1][2] * self.spb + 0.05
                throws[n_of(a):n_of(b)] = 8.0
        throws = onepole(throws, 0.03)
        send("lead", lead, plate=undb(plate), delay=undb(dly + throws))
        send("lead", dbl, plate=undb(plate - 3))
        stems["lead"] = lead + dbl
        stems["_lead_the"] = the

        # ---------------- chant (dry; a touch of room in the melt and the bridge)
        ch = pan(self.chant_chain(V["chant"]), 0.0)
        ch = self.calibrate(ch, -16.8, [(4.0, 28.0), (60.0, 76.0)], "chant")
        chd = self.chant_chain(V["chant_dbl"], double=True)
        chd = self.calibrate(chd, -24.5, [(4.0, 28.0), (60.0, 76.0)], "chant_dbl")
        cpl = sec({"pre*": -20.0, "bridge": -16.0, "outro": -22.0}, -60.0, ramp=0.2)
        send("chant", ch + chd, plate=undb(cpl), delay=undb(sec({"bridge": -22.0}, -60.0, ramp=0.2)))
        stems["chant"] = ch + chd

        # ---------------- choir (stacks) + gang (12 copies)
        cr = self.choir_chain(V["choir"])
        cr = self.sec_eq(cr, CHORUSES, ("peak", 400, 1.2, -1.5))
        cr = self.sec_eq(cr, ("post1", "post2"), ("highshelf", 5000, 0.7, 3.5))      # air for the la-la
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
        kick = pan(eq(mono(D["kick"]), ("hp", 35), ("hp", 35), ("peak", 3500, 1.0, 1.5)), 0.0)
        sn = eq(D["snare"], ("hp", 100), ("peak", 220, 1.0, 1.5), ("highshelf", 7000, 0.7, 1.5))
        hats = eq(D["hats"], ("hp", 600), ("peak", 6500, 0.9, 1.0), ("highshelf", 11000, 0.7, -3.0))
        cl = eq(D["claps"], ("hp", 300))
        cr_ = eq(D["crash"], ("hp", 450), ("highshelf", 9000, 0.7, -3.5))
        pc = eq(D["perc"], ("hp", 80))
        hats = hats * undb(self.by_section({"post*": 4.0}, 0.0, ramp=0.05))[:, None]   # brighter bounce
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
        bass = steppers + subs * undb(-3.0) + s808 * undb(-11.0) + ped * undb(-6.0)
        bass = compressor(bass, thr=-16.0, ratio=3.0, attack=0.01, release=0.1, knee=6.0, makeup=2.0)
        bass = self.pump(bass, {"chorus*": 6.0, "post*": 5.0, "intro": 3.0, "verse*": 3.0, "pre*": 3.0, "bridge": 3.0,
                                "outro": 3.0})
        bass = self._mono_lows(bass, 140)
        bass = eq(bass, ("peak", 220, 0.8, 2.5))                                     # body under the voices
        bass = self.sec_eq(bass, ("post1", "post2") + CHORUSES, ("peak", 63, 1.2, -1.5))   # less boom in the bounce
        # the breakdown is space: the G pedal and the soft drives 9 dB down and under 110 Hz, the E2 sub -4 dB
        bd = self.windows([(120.0, 126.0)], 1.0, ramp=0.03)
        bass = bass + (lp(bass, 110, 4) * undb(-9.0) - bass) * bd[:, None]
        bass = bass * undb(self.windows([(126.0, 128.0)], -4.0, ramp=0.03))[:, None]
        bass = self.calibrate(bass, -19.0, [(36.0, 52.0), (84.0, 100.0)], "bass")
        stems["bass"] = bass

        # ---------------- keys
        organ = eq(K["organ"], ("hp", 110), ("peak", 2500, 0.9, 2.0), ("peak", 400, 1.0, -2.0))
        organ = self.pump(organ, {"post*": 3.0, "verse*": 2.0, "intro": 2.0, "outro": 2.0})
        organ = self.sec_eq(organ, ("post1", "post2"), ("highshelf", 5000, 0.7, 3.5))
        # the bridge: the comp stabs step back under "Oh-five. Oh-nine." and the last two lines
        organ = organ * undb(self.windows([(110.0, 112.0), (116.0, 120.0)], -2.5, ramp=0.03))[:, None]
        organ = self.calibrate(organ, -19.5, [(4.0, 12.0), (60.0, 68.0)], "organ")
        piano = eq(K["piano"], ("hp", 160), ("peak", 3000, 1.0, 1.5))
        piano = self.pump(piano, {"chorus*": 3.5})
        piano = self.calibrate(piano, -24.0, [(36.0, 52.0)], "piano")
        felt = eq(K["felt"], ("hp", 90))
        felt = self.calibrate(felt, -23.0, [(122.0, 126.0)], "felt")
        strings = width(eq(K["strings"], ("hp", 150), ("highshelf", 8000, 0.7, 1.5)), 1.3)
        strings = self.pump(strings, {"pre*": 4.0})
        strings = self.calibrate(strings, -22.5, [(28.0, 34.5), (76.0, 82.5)], "strings")
        pad = width(eq(K["pad"], ("hp", 160)), 1.4)
        pad = self.pump(pad, {"chorus*": 9.0, "bridge": 4.0})
        pad = self.calibrate(pad, -26.0, [(36.0, 52.0)], "pad")
        boot = eq(K["boot"], ("hp", 38))
        boot = self.pump(boot, {"chorus3": 9.0})        # the reboot chord rings into chorus 3: it pumps with the pad
        boot = self.calibrate(boot, -17.5, [(0.0, 4.0)], "boot")
        keys = organ + piano + felt + strings + pad + boot
        keys = eq(keys, ("peak", 220, 0.8, 2.5))                                     # body under the voices
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
        beeps = beeps * undb(self.windows([(110.0, 112.0)], -2.5, ramp=0.02))[:, None]
        ris = width(eq(O["risers"], ("hp", 120)), 1.3)
        ris = self.calibrate(ris, -24.0, [(28.0, 34.75)], "risers")
        # the last two beats before each HAND stop -3 dB (the chorus must be the bigger moment); the spin-up -4
        ris = ris * undb(self.windows([(33.75, 34.75), (81.75, 82.75)], -3.0, ramp=0.05)
                         + self.windows([(126.0, 128.0)], -4.0, ramp=0.02))[:, None]
        sfx = O["sfx"] * undb(-7.0)
        chops = eq(V["chops"], ("hp", 220), ("peak", 3000, 1.0, 2.0))
        chops = compressor(self.norm_active(chops, -18.0), thr=-22.0, ratio=4.0, attack=0.002, release=0.05, makeup=3.0)
        chops = pan(chops, 0.0)
        chops = self.pump(chops, {"post*": 3.0})
        chops = self.sec_eq(chops, ("post1", "post2"), ("highshelf", 5000, 0.7, 3.5))
        chops = self.calibrate(chops, -21.0, [(4.0, 12.0), (56.0, 60.0)], "chops")
        other = brass + sax + bell + beeps + ris + sfx + chops
        # "You do! You do!": the stabs, the riser and the bell flourish step back 4 dB under the answer
        # (with them at full level the twelve-copy "do" reads as "yeah")
        other = other * undb(self.windows([(49.9, 52.0), (97.9, 100.0), (141.9, 144.0)], -4.0, ramp=0.02))[:, None]
        send("other", brass, plate=undb(-15.0))
        send("other", sax, plate=undb(-11.0), delay=undb(-14.0))
        send("other", bell, plate=undb(-11.0), delay=undb(-15.0))
        send("other", chops, delay=undb(sec({"post*": -16.0}, -60.0, ramp=0.1)))
        stems["other"] = other
        sfx_sil = O["sfx_sil"] * undb(-12.0)       # the writer's one keystroke: a dry click, under the "the"

        # ---------------- returns (into each stem)
        for stem, x in plate_in.items():
            ir = self._plate if stem in ("lead", "choir", "chant", "other") else self._plate_dark
            ret = convolve(x, ir)
            if stem == "lead":   # duck the plate under the dry lead so the words stay clear
                ret = compressor(ret, thr=-34.0, ratio=4.0, attack=0.01, release=0.3, knee=8.0,
                                 sidechain=stems["lead"])
            stems[stem] = stems[stem] + hp(ret, 180, 2)
        for stem, x in delay_in.items():
            d = pingpong(x, DOTTED_8TH, feedback=0.33, repeats=8, lp_hz=4500, hp_hz=350)
            if stem == "lead":   # the echoes bloom in the gaps, never on top of the next word
                d = compressor(d, thr=-36.0, ratio=6.0, attack=0.005, release=0.2, knee=6.0, sidechain=stems["lead"])
            stems[stem] = stems[stem] + d
        for stem, x in room_in.items():
            stems[stem] = stems[stem] + convolve(x, self._room)

        # ---------------- the vocal pocket: the band gives each sung or chanted word room in 300 Hz-5 kHz
        key = stereo(lead) + stereo(ch) + stereo(stems["spoken"])
        for k, dep in (("drums", 3.0), ("keys", 4.5), ("other", 4.5)):
            stems[k] = pocket(stems[k], key, 300.0, 5000.0, depth=dep)
        # the post-chorus drums and bass give way 1.5 dB (the solver below lifts the band back to its
        # target, so the bounce gets brighter rather than quieter); breakdown bars 2-3 (snaps) -2 dB
        pc = self.by_section({"post*": -1.5}, 0.0, ramp=0.05) + self.windows([(122.0, 126.0)], -2.0, ramp=0.03)
        for k in ("drums", "bass"):
            stems[k] = stems[k] * undb(pc)[:, None]

        # ---------------- section energy: verses sit back, the pre-chorus builds, the choruses lift
        en = self.energy_curve(stems)
        # the punchline "Keep it." (75.0 s): the band steps back for its beat
        en = en + self.windows([(74.95, 75.9)], -4.0, ramp=0.015)
        for k in ("drums", "bass", "keys", "other"):
            stems[k] = stems[k] * undb(en)[:, None]

        # ---------------- FADE: the band ducks 6 dB and dithers for a beat and a half
        dk = self.windows(self.ducks, 1.0, ramp=0.008)
        for k in ("drums", "bass", "keys", "other"):
            x = stems[k]
            crushed = bitcrush(x * 4.0, 7, 48000, dither=True, seed=k) / 4.0
            x = x * (1 - dk[:, None]) + (0.4 * x + 0.6 * crushed) * dk[:, None]
            stems[k] = x * (1 - dk * (1 - undb(-6.0)))[:, None]

        # ---------------- the silence window: digital zero, then the dry "the" and the keystroke
        a, b = n_of(self.sil[0]), n_of(self.sil[1])
        fo = n_of(0.008)
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

    # loudness of each section relative to chorus 1 (LU): the arrangement's dynamics
    # (relative to chorus 1 as it measures before solving: the choruses are lifted 1 LU over that)
    SECTION_TARGET = {"intro": -2.0, "verse1": -3.2, "pre1": -2.0, "chorus1": 1.0, "post1": -0.7, "verse2": -3.2,
                      "pre2": -2.0, "chorus2": 1.0, "post2": -0.7, "bridge": -2.0, "breakdown": -3.0,
                      "chorus3": 1.6, "outro": -1.5}

    def energy_curve(self, stems):
        """Band gain (dB) per section, solved from measurement: for each section, the gain on the band
        (drums, bass, keys, other) that brings the whole mix to its target loudness relative to the
        first chorus, with the voices left where they are.  Pre-choruses also get a 3 dB build."""
        band = stems["drums"] + stems["bass"] + stems["keys"] + stems["other"]
        vox = stems["lead"] + stems["chant"] + stems["choir"] + stems["spoken"]
        _, a1, b1 = next(x for x in self.secs if x[0] == "chorus1")
        ref = self.active_lufs(band + vox, a1, b1)
        c = np.zeros(self.N)
        solved = {}
        for name, a, b in self.secs:
            ia, ib = n_of(a), n_of(b)
            if name not in self.SECTION_TARGET:
                continue
            pb = 10 ** (self.active_lufs(band, a, b) / 10)
            pv = 10 ** (self.active_lufs(vox, a, b) / 10)
            pt = 10 ** ((ref + self.SECTION_TARGET[name]) / 10)
            g2 = (pt - pv) / max(pb, 1e-12) if pt > pv * 1.05 else 0.25
            gdb = float(np.clip(10 * np.log10(max(g2, 1e-6)), -9.0, 3.0))
            solved[name] = round(gdb, 2)
            if name.startswith("pre"):
                c[ia:ib] = gdb + np.linspace(-1.5, 1.5, ib - ia)          # the build
            else:
                c[ia:ib] = gdb
        self.report["section_energy_db"] = solved
        return onepole(c, 0.015)

    def _mono_lows(self, x, f):
        m = (x[:, 0] + x[:, 1]) * 0.5
        s = (x[:, 0] - x[:, 1]) * 0.5
        s = hp(s, f, 4)
        return np.stack([m + s, m - s], axis=1)

    # --------------------------------------------------------------------------------------------
    # master
    # --------------------------------------------------------------------------------------------
    # tonal target for the master (octave-band energy relative to the total, dB): a modern pop balance
    TONAL_TARGET = {31.5: -13.5, 63: -6.0, 125: -6.5, 250: -8.5, 500: -10.5, 1000: -12.5, 2000: -14.0, 4000: -15.5,
                    8000: -17.5, 16000: -24.5}

    @staticmethod
    def _bands(x):
        m = stereo(x).mean(axis=1)[:: 2]
        f, P = signal.welch(m, SR / 2, nperseg=8192)
        out = {}
        for c in Mixer.TONAL_TARGET:
            lo, hi = c / 2 ** 0.5, c * 2 ** 0.5
            sel = (f >= lo) & (f < hi)
            out[c] = float(np.sum(P[sel]) + 1e-20)
        if 16000 in out:   # above 12 kHz the half-rate estimate is blind: measure the top band at full rate
            mf = stereo(x).mean(axis=1)
            f2, P2 = signal.welch(mf, SR, nperseg=8192)
            sel = (f2 >= 16000 / 2 ** 0.5) & (f2 < 16000 * 2 ** 0.5)
            out[16000] = float(np.sum(P2[sel]) * 1.0 + 1e-20)
            # rescale the half-rate bands to the full-rate PSD scale
            sel1 = (f2 >= 1000 / 2 ** 0.5) & (f2 < 1000 * 2 ** 0.5)
            k = float(np.sum(P2[sel1])) / out[1000]
            for c in out:
                if c != 16000:
                    out[c] *= k
        tot = sum(out.values())
        return {c: 10 * np.log10(v / tot) for c, v in out.items()}

    def match_eq(self, mix):
        """Measure the mix's octave balance against TONAL_TARGET and return gentle peaking-EQ bands
        (60 % of the difference, clamped to +/-3 dB): the tonal-balance pass of the master."""
        tgt = self.TONAL_TARGET
        tp = sum(10 ** (v / 10) for v in tgt.values())
        tgt = {c: v - 10 * np.log10(tp) for c, v in tgt.items()}
        bands = []
        x = mix[:: 1]
        for it in range(2):
            meas = self._bands(eq(x, *bands) if bands else x)
            diff = {c: tgt[c] - meas[c] for c in tgt}
            mean = np.mean(list(diff.values()))
            for c, d in diff.items():
                if c < 40:
                    continue
                g = float(np.clip(0.6 * (d - mean), -3.0, 3.0)) if it == 0 else float(np.clip(0.4 * (d - mean), -1.5, 1.5))
                if 400 <= c <= 2000:      # the voice's formant region is never cut by more than 0.75 dB in all
                    g = max(g, -0.75 - sum(b[3] for b in bands if b[1] == c))
                if abs(g) >= 0.2:
                    bands.append(("highshelf", 12000, 0.7, g) if c == 16000 else ("peak", c, 1.4, g))
        self.report["match_eq"] = [(b[0], b[1], round(b[3], 2)) for b in bands]
        return bands

    def master_chain(self, mix, gain_db):
        x = mix * undb(gain_db)
        x = hp(x, 30, 4)
        if getattr(self, "_match", None):
            x = eq(x, *self._match)
        x = eq(x, ("peak", 3000, 0.8, 0.5), ("highshelf", 9500, 0.7, 0.3))
        x = compressor(x, thr=-8.0, ratio=1.5, attack=0.03, release=0.2, knee=8.0, mode="rms")
        # 2x-oversampled soft clip shaves only the top of the transients before the limiter
        up = oversample(x, 2)
        up = soft_clip(up, ceiling=undb(-0.2), knee=0.8)
        x = _decimate2(up)[: len(mix)]
        y, g = limiter(x, ceiling_db=-1.2, lookahead=0.004, release=0.07)
        return y, g

    def master(self, stems, keep_spans, target=-14.0):
        mix = sum(stems.values())
        self._match = self.match_eq(hp(mix[n_of(4.0):n_of(150.0)], 30, 4))
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
