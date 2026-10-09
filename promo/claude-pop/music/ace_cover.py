"""Generate the song with ACE-Step 1.5 (MIT) on its Hugging Face Space GPU.

Default: text2music from music/hit_prompt.json ("You're Absolutely Right (Don't Fake It)", SONG2.md): the
caption, the section-tagged lyrics, bpm, keyscale, duration and the negative text all come from that file, so
nothing musical is hard-coded here. The negative text goes into the Space's LM negative-prompt slot (it only
bites with LM CFG above 1). The picture then follows the take through tools/retime.py and tools/warp.py; the
flat system voice ("Flagged.", "Delete.") is NOT in the lyrics and is added in post from the JSON's `overlay`.

    HF_TOKEN=... python3 -I music/ace_cover.py [--prompt music/hit_prompt.json] [--bpm 112] [--seed 42]
                                               [--model xl] [--mode text2music|cover] [--src build/guide.wav]
                                               [--strength 0.7] [--out build/ace/x.flac] [--dry-run]

--bpm overrides the JSON (candidate B in SONG2.md section 4 is 112). --prompt none falls back to the old
"Pen Pal" timeline lyrics from data/data.js with the old caption (cover mode over build/guide.wav keeps that
song's structure). --dry-run prints what would be sent and exits; nothing here has been run against the Space
from a machine without HF_TOKEN.

Needs gradio_client and a Hugging Face token (read access) in HF_TOKEN: anonymous ZeroGPU quota is shared
and usually spent. Each run writes the audio, the model's own lyric timestamps (LRC) and the settings beside it.
"""
import argparse, json, os, shutil, subprocess, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPACE = 'ACE-Step/Ace-Step-v1.5'
PROMPT = 'music/hit_prompt.json'
LEGACY_CAPTION = ("Bright, warm, catchy indie pop with a dance-pop chorus, 120 BPM, G major, lifting to A major for the last chorus. "
                  "Clear, sweet American female lead vocal, intimate and playful in the verses, soaring in the chorus; "
                  "gang vocals and handclaps on 'You do!'; glockenspiel and piano hooks, funky bass, four-on-the-floor "
                  "disco-house chorus, tight live drums, polished modern pop mix, the joyful feel of a 2000s iPod ad.")
LEGACY_NEGATIVE = 'NO USER INPUT'   # the Space's own default, i.e. no negative prompt
TAGS = {'boot': 'Intro', 'intro': 'Intro', 'verse1': 'Verse 1', 'pre1': 'Pre-Chorus', 'chorus1': 'Chorus',
        'post1': 'Post-Chorus', 'verse2': 'Verse 2', 'pre2': 'Pre-Chorus', 'chorus2': 'Chorus', 'post2': 'Post-Chorus',
        'bridge': 'Bridge', 'breakdown': 'Breakdown', 'chorus3': 'Final Chorus', 'outro': 'Outro', 'tail': 'Outro'}


def timeline():
    js = "const fs=require('fs');const o={};new Function('o',fs.readFileSync(process.argv[1],'utf8')" \
         ".replace(/\\bconst\\b|\\blet\\b/g,'var')+';o.L=LYRICS;o.S=SECTIONS;o.D=DUR')(o);console.log(JSON.stringify(o))"
    return json.loads(subprocess.run(['node', '-e', js, str(ROOT / 'data/data.js')], capture_output=True, text=True, check=True).stdout)


def lyrics_text(tl):
    """Section-tagged lyrics; doubled lines (harmony, gang, la-la under the chant) are sung once."""
    out, cur = [], None
    for l in tl['L']:
        if l['id'].endswith(('_h', '_gang')) or l['id'].startswith('o_la'):
            continue
        sec = next(s for s in reversed(tl['S']) if l['start'] >= s['start'] - 0.8)   # pickups belong to the next section
        tag = TAGS[sec['name']]
        if tag != cur:
            out.append(f'\n[{tag}]'); cur = tag
        out.append(l['text'])
    return '\n'.join(out).strip() + '\n'


def load_prompt(path):
    """caption, lyrics, negative, bpm, keyscale, duration: from the JSON, or the legacy Pen Pal timeline."""
    if path.lower() == 'none':
        tl = timeline()
        return dict(caption=LEGACY_CAPTION, lyrics=lyrics_text(tl), negative=LEGACY_NEGATIVE, bpm=120, keyscale='G major',
                    duration=round(tl['D']), title='Pen Pal', source='data/data.js')
    p = json.loads((ROOT / path).read_text())
    for k in ('caption', 'lyrics', 'bpm', 'keyscale', 'duration'):
        if k not in p:
            sys.exit(f'{path}: missing "{k}"')
    bad = sorted({c for c in p['lyrics'] if ord(c) > 127 or c == '*'})
    if bad:
        sys.exit(f'{path}: lyrics contain tokens the model cannot sing, spell them out: {bad}')
    return dict(caption=p['caption'], lyrics=p['lyrics'], negative=p.get('negative') or LEGACY_NEGATIVE, bpm=int(p['bpm']),
                keyscale=p['keyscale'], duration=int(p['duration']), title=p.get('title', ''), source=path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--prompt', default=PROMPT, help='JSON with caption/lyrics/negative/bpm/keyscale/duration, or "none" for the Pen Pal timeline')
    ap.add_argument('--bpm', type=int, default=None, help='override the JSON bpm (candidate B: 112)')
    ap.add_argument('--src', default='build/guide.wav'); ap.add_argument('--strength', type=float, default=0.7)
    ap.add_argument('--seed', default='42'); ap.add_argument('--model', default='xl', choices=['xl', 'turbo'])
    ap.add_argument('--mode', default='text2music', choices=['cover', 'text2music']); ap.add_argument('--out', default=None)
    ap.add_argument('--dry-run', action='store_true', help='print the resolved prompt and exit')
    a = ap.parse_args()
    p = load_prompt(a.prompt)
    if a.bpm:
        p['bpm'] = a.bpm
    if a.dry_run:
        print(json.dumps({k: v for k, v in p.items() if k != 'lyrics'}, indent=1, ensure_ascii=False)); print(p['lyrics']); return
    token = os.environ.get('HF_TOKEN')
    if not token:
        sys.exit('HF_TOKEN is not set: add a read-only Hugging Face token to the environment (anonymous ZeroGPU quota is spent).')
    from gradio_client import Client, handle_file
    out = ROOT / (a.out or f"build/ace/{a.mode}-{p['bpm']}bpm-s{a.strength}-seed{a.seed}.flac"); out.parent.mkdir(parents=True, exist_ok=True)
    src = None
    if a.mode == 'cover':
        mp3 = out.with_suffix('.src.mp3')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(ROOT / a.src), '-ac', '2', '-ar', '44100', '-b:a', '192k', str(mp3)], check=True)
        src = handle_file(str(mp3))
    c = Client(SPACE, hf_token=token, verbose=False)
    t0 = time.time()
    r = c.predict(
        'acestep-v15-xl-turbo' if a.model == 'xl' else 'acestep-v15-turbo', 'custom', '', 'en',
        p['caption'], p['lyrics'], p['bpm'], p['keyscale'], '4', 'en',
        8, 7.0, False, a.seed,
        None, -1 if a.mode == 'cover' else p['duration'], 1,
        src, '', 0.0, -1, 'Fill the audio semantic mask based on the given conditions:',
        a.strength, a.mode,
        False, 0.0, 1.0, 3.0, 'ode', '', 'flac',
        0.85, True, 2.0, 0, 0.9, p['negative'], True, True, True, False, True, True, False, 0.5, 8, 'vocals', [], False,
        api_name='/generation_wrapper')
    if not r[0]:
        sys.exit(f'no audio: {r[10]}')
    shutil.copy(r[0], out)
    meta = {'space': SPACE, 'mode': a.mode, 'prompt': p['source'], 'title': p['title'], 'src': a.src if a.mode == 'cover' else None,
            'strength': a.strength, 'seed': a.seed, 'model': a.model, 'bpm': p['bpm'], 'keyscale': p['keyscale'], 'duration': p['duration'],
            'caption': p['caption'], 'negative': p['negative'], 'lyrics': p['lyrics'], 'status': r[10], 'details': r[9], 'lrc': r[28],
            'seconds': round(time.time() - t0)}
    out.with_suffix('.json').write_text(json.dumps(meta, indent=1, ensure_ascii=False))
    print(out, f"({meta['seconds']} s)")


if __name__ == '__main__':
    main()
