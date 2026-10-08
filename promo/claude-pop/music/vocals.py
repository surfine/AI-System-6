"""vocals.py: every voice in "Pen Pal", arranged from score.json and rendered with voice.py.

Tracks returned (full-length buffers at 48 kHz):
  lead        mono   amy singing (the silent-pen 'the' is kept apart in lead_the: it is sung dry)
  lead_dbl    stereo two extra amy takes in the choruses (other length scale, +/-8 cents, +/-8 ms)
  chant       mono   the robot list: amy flattened, formant 0.96, 8-bit crush in the 1988 sections
  chant_dbl   stereo lessac an octave down (-9 dB) under every chant line; the bridge years in octaves
  choir       stereo amy + jenny + lessac(-12) stacks: harmony and la-la (six takes in the final chorus)
  gang        stereo the twelve-copy shouted gang: echo, gang, call
  spoken      mono   lessac raw: k1 as a 1988 sample, o3 dry
  chops       mono   the boot take's 'pen' / 'pal' repitched and gated (8-bit in the intro)
"""
import math

import numpy as np

import voice as V
from dsp import (SR, add_at, bitcrush, bitcrush_curve, lp, n_of, pan, resample, rng, sweep_filter,
                 undb)

LEAD = dict(voice="amy", vib_depth=24.0, vib_rate=5.4, drift=5.0, scoop=-40.0, glide=0.06, glide_in=0.07)
CHANT = dict(voice="amy", flat=True, glide=0.0, glide_in=0.0, vib_depth=0.0, scoop=0.0, drift=0.0, fall=0.0,
             formant=0.96, kc=1.0, max_pre=0.12, edge=0.02, length_scale=1.0, coda_hold=0.0)
CHANT_DBL = dict(CHANT, voice="lessac", transpose=-12, formant=0.88)
CHOIR = [  # (style, timing offset s, pan, gain dB)
    (dict(voice="amy", vib_depth=14.0, vib_rate=5.0, detune=7.0, drift=4.0, scoop=-30.0, seed=11), 0.010, -0.5, 0.0),
    (dict(voice="jenny", vib_depth=14.0, vib_rate=5.2, detune=-8.0, drift=4.0, scoop=-30.0, seed=12), -0.009, 0.5, -1.0),
    (dict(voice="lessac", transpose=-12, formant=0.86, vib_depth=10.0, vib_rate=4.8, detune=4.0, drift=3.0,
          scoop=-20.0, seed=13), 0.004, 0.0, -2.5),
]
GANG = dict(shout=-60.0, dur_comp=0.9, vib_depth=0.0, scoop=0.0, drift=3.0, fall=0.0, glide=0.03, glide_in=0.0,
            max_pre=0.10, coda_hold=0.25)
GANG_SPREAD = 0.008          # +/- s between the twelve copies: tight enough that a 'd' stays one 'd'
CALL = dict(dur_comp=1.0)    # the verse shouts ("Flag it.", "(Keep it.)") keep their full length
CALL_COPIES = 6              # copies in a verse shout (the chorus gang has 12)
CALL_DETUNE = 6.0            # +/- cents per copy in a verse shout
CALL_FORMANT = (0.9, 1.08)   # formant range of the amy / jenny copies in a verse shout
FADE_GAG = True
KEEP_ROUGH = True
LOW_PEN = 64                 # "pen" written at E4 or lower is sung with a closed vowel, /pɪn/ (see low_pen)


def low_pen(word, notes, st):
    """Below E4 PSOLA's /ɛ/ before /n/ opens into /æ/: "hold the pen" was heard as "hold the pan" on the
    lead stem alone.  Sung there with /ɪ/ (the pin-pen vowel a singer closes to on a low note), Whisper
    hears "pen".  The hook's D5 "pen" and the call's F#4 "pen" keep /ɛ/."""
    if V.clean(word).lower() == "pen" and notes[0][0] <= LOW_PEN:
        st["phonemes"] = "pˈɪn"
    return st
CHOP = dict(voice="amy", flat=True, glide=0.0, glide_in=0.0, vib_depth=0.0, scoop=0.0, drift=0.0, fall=0.0,
            onset_on_beat=True, max_pre=0.03, kc=1.0, length_scale=1.35, coda_hold=0.35, edge=0.01, raw_onset=False)


class Vocals:
    def __init__(self, score):
        self.S = score
        self.spb = 60.0 / score["bpm"]
        self.dur = score["durationBeats"] * self.spb
        self.N = n_of(self.dur)
        sil = score["parts"]["silence"][0]
        self.sil = (sil[0] * self.spb, (sil[0] + sil[1]) * self.spb)
        self.eras = sorted((e["startBeat"] * self.spb, e["name"]) for e in score["parts"]["eras"])
        self.placements = []     # (track, job, gain_db, pan, fx)
        self.words_qa = []       # (line id, word, vowel time) for timing QA

    # --------------------------------------------------------------------------------------------
    def sec(self, b):
        return b * self.spb

    def era_at(self, t):
        name = self.eras[0][1]
        for s, n in self.eras:
            if s <= t + 1e-9:
                name = n
        return name

    def _stream(self, lines, fric_closure=False):
        """Words of several lines in time order, with each word's neighbours for legato context."""
        ws = []
        for L in lines:
            for w in L["words"]:
                if w.get("silent"):
                    continue
                ws.append((L, w))
        ws.sort(key=lambda lw: lw[1]["notes"][0][1])
        out = []
        for k, (L, w) in enumerate(ws):
            notes = [(n[0], round(self.sec(n[1]), 6), round(self.sec(n[2]), 6)) for n in w["notes"]]
            ctx = {}
            if k > 0:
                pw = ws[k - 1][1]
                pe = self.sec(pw["notes"][-1][1] + pw["notes"][-1][2])
                ctx["prev_midi"] = pw["notes"][-1][0]
                ctx["prev_gap"] = round(notes[0][1] - pe, 4)
                pph = V._strip_stress(V.phonemes_for("amy", V.clean(pw["w"])))
                if pph and pph[-1] in "ptkbdgɡfvszʃʒθðʤʧ" and ctx["prev_gap"] < 0.1:
                    ctx["prev_obstruent"] = True
            nxt = None
            for j in range(k + 1, len(ws)):
                nxt = ws[j][1]
                break
            # a silent word that follows ends the phrase
            nxt_silent = any(x.get("silent") and x["notes"][0][1] > w["notes"][-1][1] and
                             x["notes"][0][1] <= w["notes"][-1][1] + w["notes"][-1][2] + 1e-6 for x in L["words"])
            if nxt is not None and not nxt_silent:
                ns = self.sec(nxt["notes"][0][1])
                ctx["next_start"] = round(ns, 6)
                nph = V.phonemes_for("amy", V.clean(nxt["w"]))
                ctx["next_pre"] = round(V.onset_budget(nph), 4)
                if V.obstruent_onset(nph):
                    ctx["next_obstruent"] = True
                cl = V.closure_lead(nph, fric_closure and V.clean(nxt["w"]).lower() not in V.FUNCTION_WORDS)
                if cl is not None and ns - (notes[-1][1] + notes[-1][2]) < cl:
                    ctx["closure_at"] = round(ns - cl, 4)     # silent before the next word's burst
                ctx["phrase_end"] = bool(ns - (notes[-1][1] + notes[-1][2]) >= 0.25)
            else:
                ctx["phrase_end"] = True
            out.append((L, w, notes, ctx))
        return out

    @staticmethod
    def _split_oh(L):
        """The bridge's "Oh-five." is sung as two words, "Oh" and "five.", each on its own note: as one
        two-note word the f was a seam inside it and Whisper heard only "Oh"."""
        if not any(w["w"].startswith("Oh-") and len(w["notes"]) == 2 for w in L["words"]):
            return L
        ws = []
        for w in L["words"]:
            if w["w"].startswith("Oh-") and len(w["notes"]) == 2:
                ws.append({"w": "Oh", "notes": [w["notes"][0]]})
                ws.append({"w": w["w"][3:], "notes": [w["notes"][1]]})
            else:
                ws.append(w)
        return dict(L, words=ws)

    def _job(self, w, notes, ctx, style, shift=0.0, pitch_override=None):
        notes = [(m, round(s + shift, 6), d) for m, s, d in notes]
        j = dict(text=w["w"], notes=notes, nsyl=len(notes), ctx=ctx, style=dict(style))
        if pitch_override is not None:
            j["pitch_override"] = pitch_override
        return j

    # --------------------------------------------------------------------------------------------
    def arrange(self):
        S = self.S
        lines = S["lines"]
        lead = [L for L in lines if L["voice"] == "lead"]
        chant = [self._split_oh(L) for L in lines if L["voice"] == "chant"]
        choir = [L for L in lines if L["voice"] == "choir"]

        # ---- the lead
        for L, w, notes, ctx in self._stream(lead):
            st = dict(LEAD)
            fx = {}
            pov = None
            shift = 0.0
            lid = L["id"]
            if lid == "v2f_keep" and KEEP_ROUGH:     # the rough line: detuned and unquantised
                st["detune"] = 10.0 if w["w"].startswith("Keep") else -10.0
                shift = 0.02 if w["w"].startswith("Keep") else 0.008
            if FADE_GAG and lid.startswith("chorus") and lid.endswith("d") and w["w"].startswith("fade"):
                s, d = notes[0][1], notes[0][2]
                m = notes[0][0]
                pov = [[s - 0.3, m], [s + 0.3 * d, m], [s + d, m - 4], [s + d + 0.3, m - 4]]
                fx["fade"] = (s, s + d)
            if lid == "chorus3c" and w["w"] == "You":
                st["onset_on_beat"] = True            # nothing may sound inside the silence before 132.0
            if lid == "o2" and w["w"].startswith("voice"):
                f0 = self.sec(S["sections"][13]["startBeat"] + 13.5)
                fx["freeze"] = (f0, notes[0][1] + notes[0][2])
                notes = [(notes[0][0], notes[0][1], round(f0 - notes[0][1], 6))]   # sung to the freeze point
            if lid in ("k2", "k3"):
                st.update(vib_depth=14.0, scoop=-25.0)    # close and soft
            low_pen(w["w"], notes, st)
            track = "lead"
            if self.sil[0] - 1e-6 <= notes[0][1] < self.sil[1]:
                track = "lead_the"                    # sung alone, dry, inside the silence window
            lg = -2.0 if lid in ("k2", "k3") else 0.0          # the breakdown: close and soft
            self.placements.append((track, self._job(w, notes, ctx, st, shift, pov), lg, 0.0, fx))
            self.words_qa.append((lid, w["w"], notes[0][1] + shift))
            # the chorus doubles
            if lid.startswith("chorus") and "_" not in lid and track == "lead":
                for k, (ls_mul, det, sh, p) in enumerate(((1.12, 8.0, 0.008, -0.55), (0.92, -7.0, -0.006, 0.55))):
                    st2 = dict(st, detune=st.get("detune", 0.0) + det, vib_depth=12.0, seed=100 + k)
                    st2["length_scale"] = round(V.choose_ls(notes) * ls_mul, 3)
                    self.placements.append(("lead_dbl", self._job(w, notes, ctx, st2, shift + sh, pov), -1.0, p, dict(fx)))

        # ---- the chant (robot list) and its octave double
        for L, w, notes, ctx in self._stream(chant, fric_closure=True):   # the robot never voices an f
            st = dict(CHANT)
            lid = L["id"]
            if lid in ("pre1b", "pre2b"):            # the melt: the robot learns portamento
                st.update(glide=0.08, glide_in=0.08)
            t0 = notes[0][1]
            era = self.era_at(t0)
            fx = {}
            if era.startswith("1988") and lid not in ("pre1b",) and not lid.startswith("b"):
                fx["crush"] = True
            if lid == "pre2b" and w["w"].startswith("smooth"):
                fx["smooth"] = (notes[0][1], notes[0][1] + notes[0][2])
            self.placements.append(("chant", self._job(w, notes, ctx, st), 0.0, 0.0, fx))
            self.words_qa.append((lid, w["w"], t0))
            if lid.startswith("b"):    # the bridge years: stacked in octaves, panned
                self.placements.append(("chant_dbl", self._job(w, notes, ctx, dict(CHANT_DBL)), -7.0, -0.45, {}))
                self.placements.append(("chant_dbl", self._job(w, notes, ctx, dict(CHANT, voice="jenny", formant=1.0, seed=3)),
                                        -8.0, 0.45, {}))
            else:                      # every chant line: lessac an octave down, -9 dB
                self.placements.append(("chant_dbl", self._job(w, notes, ctx, dict(CHANT_DBL)), -9.0, 0.0, dict(fx)))

        # ---- the choir: harmony and la-la stacks; the gang: twelve shouted copies
        for L in choir:
            role = L.get("role")
            stream = self._stream([L])
            if role in ("harmony", "lala"):
                takes = list(CHOIR)
                if L["section"] == "chorus3" or L["id"].startswith("o_la"):
                    takes += [(dict(st, detune=-st["detune"] * 1.3, seed=st["seed"] + 20, length_scale=None), -off, p * 1.7, g - 2.0)
                              for st, off, p, g in CHOIR]
                for st, off, p, g in takes:
                    for _, w, notes, ctx in stream:
                        s2 = low_pen(w["w"], notes, dict(st))
                        if s2.get("length_scale") is None and "seed" in s2 and s2["seed"] > 20:
                            s2["length_scale"] = round(V.choose_ls(notes) * 1.15, 3)
                        self.placements.append(("choir", self._job(w, notes, ctx, s2, off), g, max(-1, min(1, p)), {}))
            else:   # echo, gang, call: twelve copies, wide
                r = rng("gang", L["id"])
                voices = ["amy", "jenny", "lessac"]
                lss = [0.95, 1.08, 1.2, 0.88]
                # the verse shouts ("Flag it.", "(Keep it.)") are six tighter copies: twelve detuned
                # copies of a two-word call smear into "Flyers"; the chorus gang keeps all twelve
                nc = CALL_COPIES if role == "call" else 12
                dt = CALL_DETUNE if role == "call" else 15.0
                fr = CALL_FORMANT if role == "call" else (0.9, 1.08)
                pans = np.linspace(-0.95, 0.95, nc)
                order = r.permutation(nc)
                for k in range(nc):
                    st = dict(GANG, voice=voices[k % 3], length_scale=None, seed=200 + k,
                              detune=float(r.uniform(-dt, dt)),
                              formant=float(r.uniform(*fr) if voices[k % 3] != "lessac" else r.uniform(0.84, 0.95)))
                    off = float(r.uniform(-1, 1)) * GANG_SPREAD
                    tilt = float(r.uniform(-3, 3))
                    for _, w, notes, ctx in stream:
                        s2 = dict(st, **(CALL if role == "call" else {}))
                        s2["length_scale"] = round(V.choose_ls(notes) * lss[(k // 3) % 4], 3)
                        g = 0.0 if role != "call" else -2.0     # the verse shouts sit under the chant
                        self.placements.append(("gang", self._job(w, notes, ctx, s2, off), g, float(pans[order[k]]),
                                                {"tilt": tilt}))

        # ---- the chops: the boot take's pen / pal, repitched and gated
        for m, b, d, word in S["parts"]["chops"]["events"]:
            s, dd = self.sec(b), self.sec(d)
            w = {"w": word}
            st = dict(CHOP, seed=int(b * 4))
            fx = {"gate": (s, s + dd)}
            if self.era_at(s).startswith("1988"):
                fx["crush"] = True
            self.placements.append(("chops", self._job(w, [(m, round(s, 6), round(dd, 6))], {"phrase_end": True}, st), 0.0, 0.0, fx))

    # --------------------------------------------------------------------------------------------
    def render(self, workers=4):
        self.arrange()
        jobs = [p[1] for p in self.placements]
        res = V.sing_pool(jobs, workers)
        N = self.N
        T = {
            "lead": np.zeros(N), "lead_the": np.zeros(N), "lead_dbl": np.zeros((N, 2)),
            "chant": np.zeros(N), "chant_dbl": np.zeros((N, 2)),
            "choir": np.zeros((N, 2)), "gang": np.zeros((N, 2)), "chops": np.zeros(N),
        }
        target = {"lead": -15.0, "lead_the": -15.0, "lead_dbl": -15.0, "chant": -15.0, "chant_dbl": -15.0,
                  "choir": -18.0, "gang": -20.0, "chops": -16.0}
        for (track, job, gain, p, fx), (a, t0) in zip(self.placements, res):
            a = np.asarray(a, dtype=float)
            if len(a) == 0:
                continue
            a = self._normalise(a, target[track] + gain, job["text"])
            a = self._word_fx(a, t0, fx, job)
            if track == "lead_the":
                self.the_span = (t0, t0 + len(a) / SR)
            buf = T[track]
            if buf.ndim == 2:
                add_at(buf, pan(a, p), t0)
            else:
                add_at(buf, a, t0)
        self._freeze(T["lead"])
        self._breaths(T["lead"])
        T["spoken"] = self._spoken()
        return T

    def _breaths(self, lead):
        """The singer breathes before each phrase (the robot chant never does): band-passed noise with
        two soft resonances, swelling over ~0.3 s and ending just before the first consonant."""
        from dsp import bp, eq, noise
        ws = []
        for track, job, g, p, fx in self.placements:
            if track == "lead":
                ws.append((job["notes"][0][1], job["notes"][-1][1] + job["notes"][-1][2], job))
        ws.sort(key=lambda w: w[0])
        prev_end = -9.0
        k = 0
        for s, e, job in ws:
            gap = s - prev_end
            prev_end = max(prev_end, e)
            if gap < 0.45:
                continue
            ob = V.onset_budget(V.phonemes_for("amy", V.clean(job["text"])))
            end = s - ob - 0.03
            dur = min(0.34, gap - 0.12)
            start = end - dur
            if dur < 0.15 or (start < self.sil[1] and end > self.sil[0] - 0.05):
                continue
            n = n_of(dur)
            x = bp(noise(n, ("breath", k)), 350, 7000, 2)
            x = eq(x, ("peak", 1150, 2.0, 8.0), ("peak", 2600, 2.0, 5.0), ("highshelf", 6000, 0.7, -4.0))
            u = np.linspace(0, 1, n)
            env = np.sin(np.pi * np.minimum(u / 0.75, 1) * 0.5) ** 1.5 * np.minimum(1, (1 - u) / 0.12)
            x = x * env
            x = x / (np.sqrt(np.mean(x ** 2)) + 1e-12) * undb(-41.0)
            add_at(lead, x, start)
            k += 1
        self.n_breaths = k

    def _normalise(self, a, target_db, text):
        """Level each word by the RMS of its loudest 60 ms; function words sit 1.5 dB lower."""
        w = max(1, n_of(0.06))
        e = np.sqrt(np.convolve(a * a, np.ones(w) / w, mode="same") + 1e-12)
        ref = np.max(e)
        g = undb(target_db) / max(ref, 1e-9)
        if V.clean(text).lower() in V.FUNCTION_WORDS:
            g *= undb(-1.5)
        return a * g

    def _word_fx(self, a, t0, fx, job):
        n = len(a)
        t = t0 + np.arange(n) / SR
        if fx.get("crush"):     # 1988: 8-bit, 11 kHz sample-and-hold, 60 % wet keeps the words
            a = bitcrush(a, 8, 11025, mix=0.6)
        if "fade" in fx:        # FADE: level fade + bit depth falling over the beat, then nothing
            s, e = fx["fade"]
            # the word is heard first ("or I fay-"): only the tail dissolves -- from 55 % of the beat the bits
            # fall from 16 to 5 and the level sinks 12 dB (the 'd' still lands), then half a beat of nothing
            x = np.clip((t - (s + 0.55 * (e - s))) / (0.45 * (e - s)), 0, 1)
            bits = 16 - 11 * x ** 1.3
            crushed = bitcrush_curve(a, bits)
            a = np.where(x <= 0, a, crushed) * (1 - 0.75 * x ** 1.2)
            a[t >= e + 0.06] = 0.0
        if "smooth" in fx:      # the low-pass closes over "smooth" (8 kHz -> 1.5 kHz across the beat)
            s, e = fx["smooth"]
            x = np.clip((t - s) / (e - s), 0, 1)
            fc = 8000 * (1500 / 8000) ** x
            a = sweep_filter(a, "lp", fc, 0.8)
        if "gate" in fx:        # chops: hard gate to the written length
            s, e = fx["gate"]
            g = np.clip((e - t) / 0.008, 0, 1) * np.clip((t - s + 0.002) / 0.002, 0, 1)
            a = a * g
        if "tilt" in fx:        # gang copies: each with its own formant tilt (a high shelf)
            from dsp import eq
            a = eq(a, ("highshelf", 2500, 0.7, fx["tilt"]))
        return a

    def _freeze(self, lead):
        """'voice.': the long A4 freezes into a two-cycle grain loop for its last half beat; the word is
        sung (glide and all) up to the freeze point, the loop holds its last two periods, then the 's'."""
        from dsp import hp
        for track, job, g, p, fx in self.placements:
            if "freeze" not in fx:
                continue
            s, e = fx["freeze"]
            m = job["notes"][0][0]
            per = SR / (440.0 * 2 ** ((m - 69) / 12))
            L = int(round(2 * per))
            # find where the 's' starts: the first moment after the vowel where the 4 kHz+ band comes
            # within 12 dB of the whole signal (the vowel is all low harmonics; the 's' is all hiss)
            a0, a1 = n_of(s - 0.25), n_of(s + 0.35)
            w = n_of(0.005)
            seg = lead[a0:a1]
            env_hi = np.sqrt(np.convolve(hp(seg, 4000, 4) ** 2, np.ones(w) / w, mode="same"))
            env_all = np.sqrt(np.convolve(seg ** 2, np.ones(w) / w, mode="same")) + 1e-9
            idx = np.where((env_hi > 0.25 * env_all) & (np.arange(len(seg)) > n_of(0.05)))[0]
            ts = a0 + (int(idx[0]) if len(idx) else n_of(0.25))
            ts -= n_of(0.012)          # loop two periods of the vowel, never of the 's' 
            grain = lead[ts - L:ts].copy()
            hold = n_of(e - s)
            tail = lead[ts:ts + n_of(0.3)].copy()
            reps = int(math.ceil(hold / L)) + 1
            loop = np.tile(grain, reps)[:hold]
            loop[-n_of(0.004):] *= np.linspace(1, 0.4, n_of(0.004))
            lead[ts:ts + hold + len(tail)] = 0.0
            lead[ts:ts + hold] = loop
            lead[ts + hold:ts + hold + len(tail)] = tail
            self.freeze_at = (ts / SR, (ts + hold) / SR)

    def _spoken(self):
        """lessac, raw Piper per sentence, aligned so each sentence's first vowel lands on its word.
        k1 is a 1988 sample (4 kHz, 8-bit); o3 is dry and flat."""
        out = np.zeros(self.N)
        for L in self.S["lines"]:
            if L["voice"] != "spoken":
                continue
            sents, cur = [], []
            for w in L["words"]:
                cur.append(w)
                if w["w"].endswith("."):
                    sents.append(cur)
                    cur = []
            if cur:
                sents.append(cur)
            for ws in sents:
                text = " ".join(w["w"] for w in ws)
                t_start = self.sec(ws[0]["notes"][0][1])
                t_end = self.sec(ws[-1]["notes"][-1][1] + ws[-1]["notes"][-1][2])
                slot = t_end - t_start
                ls = 1.0
                for _ in range(3):
                    a, sr = V.tts_sentence("lessac", text, ls)
                    a = V.trim(np.asarray(a, dtype=float), sr)
                    times, voiced, inten = V.analyse(a, sr)
                    vi = np.where(voiced)[0]
                    v0 = times[vi[0]] if len(vi) else 0.0
                    spoken_len = len(a) / sr - v0
                    ls = float(np.clip(round(ls * slot / max(spoken_len, 0.1), 2), 0.8, 1.5))
                a, sr = V.tts_sentence("lessac", text, ls)
                a = V.trim(np.asarray(a, dtype=float), sr)
                times, voiced, inten = V.analyse(a, sr)
                vi = np.where(voiced)[0]
                v0 = times[vi[0]] - 0.025 if len(vi) else 0.0
                y = resample(a, sr, SR)
                y = y / (np.max(np.abs(y)) + 1e-9) * undb(-6)
                if L["id"] == "k1":
                    y = lp(y, 4000, 4)
                    y = bitcrush(y, 8, 11025, mix=0.8)
                add_at(out, y, t_start - v0)
                self.words_qa.append((L["id"], text, t_start))
        return out
