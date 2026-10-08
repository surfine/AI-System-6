"""band.py: everything that is not a voice, arranged from score.json.

Drum hits come from export_timing.drum_hits(), the same expansion that writes EVENTS in data.js,
so the audio and the picture share every kick, snare, clap and keystroke to the sample.
"""
import numpy as np

import kit
import synth
from dsp import (SR, add_at, bitcrush, eq, hp, lp, mtof, n_of, pan, rng, sine, sweep_filter, undb)
from export_timing import drum_hits

# era -> (bits, sample-and-hold rate, wet) for the Floppy Organ: crushed in 1988, clean by Liquid Glass
ERA_CRUSH = {
    "1988": (8, 11025, 0.85), "1991": (9, 16000, 0.7), "1995": (9, 16000, 0.6), "1998": (10, 22050, 0.6),
    "1999": (10, 22050, 0.55), "2002": (12, 32000, 0.45), "2005": (12, 32000, 0.35), "2009": (14, 48000, 0.2),
    "2011": (16, 48000, 0.0), "2014": (16, 48000, 0.0), "2020": (16, 48000, 0.0), "2026": (16, 48000, 0.0),
}


class Band:
    def __init__(self, score):
        self.S = score
        self.P = score["parts"]
        self.spb = 60.0 / score["bpm"]
        self.dur = score["durationBeats"] * self.spb
        self.N = n_of(self.dur)
        self.secs = sorted(score["sections"], key=lambda s: s["startBeat"])
        self.events = {}   # name -> [seconds]: what was actually rendered, for the timing QA

    def sec(self, b):
        return b * self.spb

    def section(self, b):
        for s in self.secs:
            if s["startBeat"] <= b + 1e-9 < s["startBeat"] + s["beats"]:
                return s["name"]
        return self.secs[-1]["name"]

    def log(self, name, t):
        self.events.setdefault(name, []).append(t)

    def place(self, buf, x, t, gain=1.0, p=None, name=None):
        if p is not None and x.ndim == 1:
            x = pan(x, p)
        add_at(buf, x, t, gain)
        if name:
            self.log(name, t)

    # --------------------------------------------------------------------------------------------
    def drums(self):
        N = self.N
        T = {k: np.zeros((N, 2)) for k in ("kick", "snare", "hats", "claps", "perc", "crash")}
        rows = drum_hits(self.S)
        hum = rng("humanise")
        cache = {}

        def hit(key, fn):
            if key not in cache:
                cache[key] = fn()
            return cache[key]

        # kick: floppy eject; the house kick in the four-on-the-floor sections
        for b in rows.get("kick", []):
            s = self.section(b)
            style = "house" if s.startswith(("chorus", "post")) else "eject"
            pos = b % 1
            vel = 1.0 if pos == 0 else 0.88
            if s.startswith("post") and pos not in (0,):
                vel = 0.9
            y = hit(("k", style, b % 7), lambda: kit.kick(style, 1.0, seed=int(b % 7)))
            self.place(T["kick"], y, self.sec(b), vel, 0.0, "kick")
        # snare: window close; ghost: window shade
        for b in rows.get("snare", []):
            s = self.section(b)
            off = b - next(x["startBeat"] for x in self.secs if x["name"] == s)
            vel = 1.0
            if s.startswith("pre") and off >= 8:         # the build: 8ths then 16ths, crescendo
                vel = 0.45 + 0.55 * min(1, (off - 8) / 5.25)
            if s == "bridge" and off >= 24:
                vel = 0.75 if (b % 1) else 0.95
            y = hit(("s", int(b * 4) % 5), lambda: kit.snare(1.0, seed=int(b * 4) % 5))
            self.place(T["snare"], y, self.sec(b), vel, 0.0, "snare")
        for b in rows.get("ghostSnare", []):
            y = hit(("g", int(b * 4) % 3), lambda: kit.snare(1.0, seed=10 + int(b * 4) % 3, ghost=True))
            self.place(T["snare"], y * 1.6, self.sec(b), 1.0, 0.1, "ghost")
        # hats: keystrokes (closed) and the space bar (open); accents and a little humanising
        for kind in ("hat", "openHat"):
            for b in rows.get(kind, []):
                s = self.section(b)
                q = round((b % 1) * 4) % 4
                vel = {0: 0.78, 1: 0.5, 2: 0.95, 3: 0.55}[q]
                if s.startswith(("chorus",)) and kind == "hat":
                    vel *= 0.85
                if kind == "openHat":
                    vel = 0.8
                vel *= undb(hum.uniform(-1.5, 1.5))
                dt = hum.uniform(-0.0012, 0.0012)
                seed = int(b * 8) % 6
                y = hit((kind, seed), lambda: kit.keystroke_hat(1.0, seed=seed, open_=(kind == "openHat")))
                p = 0.25 if kind == "hat" else 0.15
                self.place(T["hats"], y, self.sec(b) + dt - kit.KEY_PRE, vel, p)
                self.log("hat", self.sec(b))
        # claps: mouse-click stacks (12 pointers in the final chorus and on the gang's 'Flag it.')
        claps = list(rows.get("clap", []))
        for b in claps:
            s = self.section(b)
            copies = 12 if s in ("chorus3", "verse2") else 3
            y = hit(("c", copies, int(b * 2) % 4), lambda: kit.clap(copies, seed=int(b * 2) % 4, spread=0.9 if copies == 12 else 0.3))
            vel = 0.95 if s != "breakdown" else 0.7
            self.place(T["claps"], y, self.sec(b), vel, None, "clap")
        # the gang's "YOU DO!": a clap stack on each "You"
        for L in self.S["lines"]:
            if L.get("role") == "gang":
                for w in L["words"]:
                    if w["w"] == "You":
                        b = w["notes"][0][1]
                        copies = 12
                        y = hit(("cy", int(b) % 3), lambda: kit.clap(copies, seed=40 + int(b) % 3, spread=1.0))
                        self.place(T["claps"], y, self.sec(b), 1.0, None, "clapYou")
        for f in self.P["drums"]["fills"]:
            b = f["startBeat"]
            if f["name"] == "keepIt":      # big clap + rimshot on the sung "Keep it."
                self.place(T["claps"], kit.clap(12, seed=77, spread=1.0), self.sec(b), 1.0, None, "clap")
                self.place(T["snare"], kit.rimshot(), self.sec(b), 0.8, 0.0, "rim")
            elif f["name"] == "stumble":   # snare + floor tom 16ths, a 16th late, the first with a flam
                for k in range(3):
                    t = self.sec(b + 0.25 * k)
                    if k == 0:
                        self.place(T["snare"], kit.snare(1.0, seed=3), t - 0.018, 0.35, -0.2)
                    self.place(T["snare"], kit.snare(1.0, seed=k), t, 0.9, 0.0, "snareFill")
                    self.place(T["perc"], kit.floor_tom(), t, 0.95, -0.35, "tom")
            elif f["name"] == "snareRoll":  # 32nds into the drop
                n = int(f["beats"] * 8)
                for k in range(n):
                    self.place(T["snare"], kit.snare(1.0, seed=k % 5), self.sec(b + k / 8), 0.25 + 0.65 * k / max(1, n - 1), 0.0)
            elif f["name"] == "bridgeRoll":
                for k in range(16):        # a 32nd roll over the last bar, rising
                    self.place(T["snare"], kit.snare(1.0, seed=k % 5), self.sec(b + 2 + k / 8), 0.3 + 0.6 * k / 15, 0.0)
        for b in rows.get("cowbell", []):
            self.place(T["perc"], kit.cowbell(), self.sec(b), 0.55, 0.3, "cowbell")
        for i, b in enumerate(rows.get("tambourine", [])):
            y = hit(("t", i % 4), lambda: kit.tambourine(1.0, seed=i % 4))
            self.place(T["perc"], y, self.sec(b), 0.55 if (b % 0.5) else 0.8, 0.45, "tambourine")
        for b in rows.get("snap", []):
            self.place(T["perc"], kit.snap(1.0, seed=int(b)), self.sec(b), 0.9, -0.3, "snap")
        # crashes: the Trash; choked on the HAND hits
        for i, b in enumerate(self.P["drums"]["crashes"]):
            self.place(T["crash"], hit(("cr", i % 3), lambda: kit.crash(2.4, seed=i % 3)), self.sec(b), 1.0, None, "crash")
        for i, b in enumerate(self.P["drums"]["chokedCrashes"]):
            self.place(T["crash"], kit.crash(0.3, seed=5 + i, choke=0.2), self.sec(b), 1.0, None, "chokedCrash")
        return T

    # --------------------------------------------------------------------------------------------
    def risers(self):
        out = np.zeros((self.N, 2))
        for a, b, name in self.P["drums"]["risers"]:
            t0, t1 = self.sec(a), self.sec(b)
            d = t1 - t0
            key_root = 57 if a >= 256 else 55
            low = name.lower()
            if low.startswith("reversecymbal"):
                y = kit.reverse_cymbal(d, seed=int(a)) * 0.8
            elif low == "spinup":
                y = kit.spin_up(d) * 0.7
            elif low == "bridgeroll":
                y = kit.riser(d, root_midi=50, seed=int(a)) * 0.6
            else:
                y = kit.riser(d, root_midi=key_root - 12, seed=int(a)) * (0.85 if d > 3 else 0.75)
            add_at(out, y, t0)
            self.log("riser", (t0, t1))
        return out

    # --------------------------------------------------------------------------------------------
    def bass(self):
        P = self.P
        N = self.N
        out = {}
        for drive, seed in (("A", 1), ("B", 2)):
            ev = P["bass"]["drives"][drive]
            hard = [(m, self.sec(b), self.sec(d)) for m, b, d in ev if self.section(b) != "breakdown"]
            soft = [(m, self.sec(b), self.sec(d)) for m, b, d in ev if self.section(b) == "breakdown"]
            st, sub = synth.floppy_voice(hard, self.dur, seed=seed)
            st2, sub2 = synth.floppy_voice(soft, self.dur, seed=seed + 10, soft=True)
            out["floppy" + drive] = st + 0.25 * st2
            out["sub" + drive] = sub + sub2 * 1.2
            for m, b, d in ev:
                self.log("floppy" + drive, self.sec(b))
        subs = [(m, self.sec(b), self.sec(d)) for m, b, d in P["sub"]["events"]]
        out["808"] = synth.sub808(subs, self.dur)
        for m, b, d in P["sub"]["events"]:
            self.log("sub", self.sec(b))
        # the breakdown's G pedal: a sine, bar 1 only
        ped = np.zeros(N)
        for c in self.S["chords"]:
            if c["symbol"] == "G(pedal)":
                t0, d = self.sec(c["startBeat"]), self.sec(c["beats"])
                L = n_of(d + 0.4)
                tt = np.arange(L) / SR
                env = np.minimum(1, tt / 0.15) * np.where(tt > d, np.exp(-(tt - d) / 0.12), 1)
                y = (np.sin(2 * np.pi * mtof(43) * tt) + 0.5 * np.sin(2 * np.pi * mtof(55) * tt)) * env
                add_at(ped, y * 0.5, t0)
        out["pedal"] = ped
        return out

    # --------------------------------------------------------------------------------------------
    def _era_crush(self, x):
        """Crush the organ by era (8-bit 11 kHz in 1988 -> clean in Liquid Glass), 10 ms crossfades."""
        eras = sorted((self.sec(e["startBeat"]), e["name"]) for e in self.P["eras"])
        y = np.zeros_like(x)
        w = np.zeros(len(x))
        for i, (t0, name) in enumerate(eras):
            t1 = eras[i + 1][0] if i + 1 < len(eras) else self.dur
            if t1 <= t0:
                continue
            bits, rate, wet = ERA_CRUSH[name[:4]]
            a, b = n_of(t0), min(len(x), n_of(t1))
            pad = n_of(0.01)
            a0, b0 = max(0, a - pad), min(len(x), b + pad)
            seg = x[a0:b0]
            if wet > 0:
                seg = bitcrush(seg, bits, rate, mix=wet)
            env = np.ones(b0 - a0)
            if a0 < a:
                env[: a - a0] = np.linspace(0, 1, a - a0)
            if b0 > b:
                env[b - a0:] = np.linspace(1, 0, b0 - b)
            y[a0:b0] += seg * env[:, None]
            w[a0:b0] += env
        return y / np.maximum(w, 1e-9)[:, None]

    def keys(self):
        P = self.P
        S = self.S
        N = self.N
        dur = self.dur
        out = {}
        # ---- the Floppy Organ: GM percussive organ + the 25 % pulse; flourishes; verse 2's octave-down organ
        riff = [tuple(e) for e in P["riff"]["events"]] + [tuple(e) for e in P["riff"]["flourish"]]
        v2 = next(s for s in self.secs if s["name"] == "verse2")
        low = [(m - 12, b, d) for m, b, d in P["riff"]["events"] if v2["startBeat"] <= b < v2["startBeat"] + v2["beats"]]
        org_notes = [(m, b, d * 0.9, 100) for m, b, d in riff] + [(m, b, d * 0.9, 80) for m, b, d in low]
        gm = synth.fluid(org_notes, 17, dur, tag="organ")
        pl = synth.pulse_organ([(m, self.sec(b), self.sec(d)) for m, b, d in riff + low], dur)
        organ = gm * 1.6 + pan(pl, 0.25) * 0.55
        for m, b, d in riff:
            self.log("riff", self.sec(b))
        # the bridge comp: organ chord stabs on the kick rhythm
        comp = [(n, c["startBeat"], 0.4, 92) for c in P["keys"]["bridgeComp"] for n in c["notes"]]
        organ += synth.fluid(comp, 16, dur, tag="comp") * 0.9
        out["organ"] = self._era_crush(organ)
        # ---- piano: chorus offbeat 8ths; breakdown felt piano; outro bar 3
        pn = []
        felt = []
        r = rng("piano")
        for c in S["chords"]:
            s = self.section(c["startBeat"])
            up = [n + 12 if max(c["notes"][1:]) <= 64 else n for n in c["notes"][1:]]
            if s.startswith("chorus"):
                k = 0.5
                while k < c["beats"]:
                    for n in up:
                        pn.append((n, c["startBeat"] + k, 0.32, int(74 + r.integers(-6, 7))))
                    k += 1.0
            elif s == "breakdown" and c["symbol"] in ("C", "Am7"):
                for n in up:
                    felt.append((n, c["startBeat"], 1.9, 46))
                    felt.append((n, c["startBeat"] + 2.5, 1.4, 38))
                felt.append((c["notes"][0] + 12, c["startBeat"], 3.8, 40))
            elif s == "outro" and c["symbol"] in ("Dmaj9", "E7sus4"):
                for n in up:
                    pn.append((n, c["startBeat"], 1.8, 64))
                    pn.append((n, c["startBeat"] + 1.0, 0.9, 52))
                pn.append((c["notes"][0] + 12, c["startBeat"], 1.9, 60))
        out["piano"] = synth.fluid(pn, 1, dur, tag="piano") * 1.5
        out["felt"] = lp(synth.fluid(felt, 0, dur, tag="felt"), 2600, 2) * 2.2
        # ---- strings under the pre-choruses (rising, cut at the HAND hit)
        st = []
        cc = []
        for pre in ("pre1", "pre2"):
            ps = next(s for s in self.secs if s["name"] == pre)["startBeat"]
            for c in S["chords"]:
                if ps <= c["startBeat"] < ps + 16:
                    end = min(c["startBeat"] + c["beats"], ps + 14)
                    if end <= c["startBeat"]:
                        continue
                    for n in c["notes"][1:]:
                        st.append((n + 12, c["startBeat"], end - c["startBeat"], 92))
                    st.append((c["notes"][0], c["startBeat"], end - c["startBeat"], 80))
            for k in range(28):
                cc.append((ps + k * 0.5, 11, int(60 + 67 * k / 27)))
            cc.append((ps + 14, 11, 60))
        out["strings"] = synth.fluid(st, 48, dur, cc=cc, tag="strings") * 1.5
        # ---- pads: soft saw pad under the choruses, the swept pad in bridge bars 7-8, the E7sus4 pad
        chords = []
        for c in S["chords"]:
            s = self.section(c["startBeat"])
            if s.startswith("chorus"):
                g = 1.0 if s != "chorus3" else 1.25
                chords.append(([n + 12 if n < 55 else n for n in c["notes"][1:]], self.sec(c["startBeat"]), self.sec(c["beats"]), g))
        pad = synth.saw_pad(chords, dur, cutoff=2600, detune=0.14, voices=5, attack=0.12, release=0.3)
        br = next(s for s in self.secs if s["name"] == "bridge")["startBeat"]
        sw_ch = [([n + 12 if n < 55 else n for n in c["notes"][1:]], self.sec(c["startBeat"] - (br + 24)), self.sec(c["beats"]), 1.0)
                 for c in S["chords"] if br + 24 <= c["startBeat"] < br + 32]
        swlen = self.sec(8) + 0.6
        tt = np.arange(n_of(swlen)) / SR
        sweep = 300 * (7000 / 300) ** np.clip(tt / self.sec(8), 0, 1)
        swpad = synth.saw_pad(sw_ch, swlen, voices=5, attack=0.2, release=0.25, sweep=sweep)
        add_at(pad, swpad * 1.3, self.sec(br + 24))
        bd = next(s for s in self.secs if s["name"] == "breakdown")["startBeat"]
        es = [c for c in S["chords"] if c["startBeat"] == bd + 12][0]
        e7 = synth.saw_pad([(es["notes"][1:], 0.0, self.sec(4), 1.0)], self.sec(4) + 0.6, cutoff=1600, attack=0.4, release=0.15)
        e7[-n_of(0.62):] *= 0  # it stops dead into the reboot
        add_at(pad, e7 * 1.2, self.sec(bd + 12))
        out["pad"] = pad
        # ---- the boot chord, the reboot chord, the outro chord (played by the Return key)
        bc = np.zeros((N, 2))
        for key, ob, bell, sd in (("bootChord", 4.0, 4, 1), ("rebootChord", 0.5, 4, 2), ("outroChord", 1.0, 4, 3)):
            ch = P[key]
            d = self.sec(ch["beats"])
            y = synth.boot_chord(ch["notes"], d, open_beats=ob, bell_notes=bell, seed=sd)
            add_at(bc, y, self.sec(ch["startBeat"]))
            self.log("bootChord", self.sec(ch["startBeat"]))
        out["boot"] = bc
        return out

    # --------------------------------------------------------------------------------------------
    def other(self):
        P = self.P
        N = self.N
        dur = self.dur
        out = {}
        # brass stabs (the boot chord as brass): GM brass section + a saw brass layer with a filter blip
        seen = set()
        notes = []
        synth_layer = np.zeros((N, 2))
        for stb in P["stabs"]["brass"]:
            key = (stb["startBeat"], tuple(stb["notes"]))
            if key in seen:
                continue
            seen.add(key)
            for n in stb["notes"]:
                nn = n + 12 if n < 52 else n
                notes.append((nn, stb["startBeat"], stb["beats"] * 0.85, 112))
            t0 = self.sec(stb["startBeat"])
            L = self.sec(stb["beats"]) + 0.15
            tt = np.arange(n_of(L)) / SR
            fc = 900 + 5000 * np.exp(-tt / 0.06)
            y = synth.saw_pad([([n + 12 if n < 52 else n for n in stb["notes"]], 0.0, self.sec(stb["beats"]) * 0.8, 1.0)],
                              L, voices=3, attack=0.004, release=0.06, sweep=fc)
            add_at(synth_layer, y * 1.4, t0)
            self.log("stab", t0)
        out["brass"] = synth.fluid(notes, 61, dur, tag="brass") * 1.4 + synth_layer
        sax = [(n, s["startBeat"], s["beats"], 110) for s in P["stabs"]["sax"] for n in s["notes"]]
        out["sax"] = synth.fluid(sax, 66, dur, tag="sax") * 1.6
        # the Writing Bell
        bell = np.zeros((N, 2))
        for k, (m, b, d) in enumerate(P["bells"]):
            y = synth.fm_bell(m, dur=1.4 if d >= 0.5 else 0.9, seed=k)
            add_at(bell, pan(y, 0.25 if k % 2 else -0.25), self.sec(b), 0.5)
            self.log("bell", self.sec(b))
        out["bell"] = bell
        # the bridge beeps (one per year, climbing) and the typed-verb blips
        bp_ = np.zeros((N, 2))
        for m, b, d in P["beeps"]:
            add_at(bp_, pan(synth.beep(m, self.sec(d)), 0.0), self.sec(b), 0.32)
            self.log("beep", self.sec(b))
        for b in P["sfx"]["blips"]:
            add_at(bp_, pan(synth.blip(1568.0), 0.2), self.sec(b), 0.12)
        out["beeps"] = bp_
        out["risers"] = self.risers()
        # foley: the writer's keystrokes, the Save click, the floppy clunks, the record's crackle
        sfx = np.zeros((N, 2))
        sil = np.zeros((N, 2))     # the one sound allowed inside the silence window
        s0, s1 = [(self.sec(a), self.sec(a + d)) for a, d, _ in P["silence"]][0]
        ks = P["sfx"]["keystrokes"]
        for i, b in enumerate(ks):
            big = i == len(ks) - 1 and b > 280
            dst = sil if s0 <= self.sec(b) < s1 else sfx
            add_at(dst, pan(kit.keystroke(big=big, seed=i), 0.0), self.sec(b), 0.9 if not big else 1.0)
            self.log("keystroke", self.sec(b))
        for b in P["sfx"]["clicks"]:
            add_at(sfx, pan(kit.save_click(), 0.1), self.sec(b), 0.8)
            self.log("click", self.sec(b))
        for i, b in enumerate(P["sfx"]["floppyClunks"]):
            add_at(sfx, pan(kit.floppy_clunk(seed=i), -0.2 + 0.4 * i), self.sec(b), 0.8)
        p1 = next(s for s in self.secs if s["name"] == "post1")["startBeat"]
        vb = kit.vinyl_bed(self.sec(8) + 0.2)
        vb[-n_of(0.2):] *= np.linspace(1, 0, n_of(0.2))[:, None]
        add_at(sfx, vb, self.sec(p1), 0.5)
        out["sfx"] = sfx
        out["sfx_sil"] = sil
        return out
