"""Regenerate "Pen Pal" with ACE-Step 1.5 (MIT) on its Hugging Face Space GPU, in cover mode.

Cover mode keeps the source's structure and tempo and re-sings and re-plays it, so the video's timeline in
data/data.js still fits; tools/retime.py measures and corrects any drift afterwards.

    HF_TOKEN=... python3 -I music/ace_cover.py [--src build/guide.wav] [--strength 0.7] [--seed 42] [--model xl]
                                               [--mode cover|text2music] [--out build/ace/cover.flac]

Needs gradio_client and a Hugging Face token (read access) in HF_TOKEN: anonymous ZeroGPU quota is shared
and usually spent. Each run writes the audio, the model's own lyric timestamps (LRC) and the settings beside it.
"""
import argparse, json, os, shutil, subprocess, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPACE = 'ACE-Step/Ace-Step-v1.5'
CAPTION = ("Bright, warm, catchy indie pop with a dance-pop chorus, 120 BPM, G major, lifting to A major for the last chorus. "
           "Clear, sweet American female lead vocal, intimate and playful in the verses, soaring in the chorus; "
           "gang vocals and handclaps on 'You do!'; glockenspiel and piano hooks, funky bass, four-on-the-floor "
           "disco-house chorus, tight live drums, polished modern pop mix, the joyful feel of a 2000s iPod ad.")
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default='build/guide.wav'); ap.add_argument('--strength', type=float, default=0.7)
    ap.add_argument('--seed', default='42'); ap.add_argument('--model', default='xl', choices=['xl', 'turbo'])
    ap.add_argument('--mode', default='cover', choices=['cover', 'text2music']); ap.add_argument('--out', default=None)
    a = ap.parse_args()
    token = os.environ.get('HF_TOKEN')
    if not token:
        sys.exit('HF_TOKEN is not set: add a read-only Hugging Face token to the environment (anonymous ZeroGPU quota is spent).')
    from gradio_client import Client, handle_file
    tl = timeline(); lyrics = lyrics_text(tl)
    out = ROOT / (a.out or f'build/ace/{a.mode}-s{a.strength}-seed{a.seed}.flac'); out.parent.mkdir(parents=True, exist_ok=True)
    src = None
    if a.mode == 'cover':
        mp3 = out.with_suffix('.src.mp3')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(ROOT / a.src), '-ac', '2', '-ar', '44100', '-b:a', '192k', str(mp3)], check=True)
        src = handle_file(str(mp3))
    c = Client(SPACE, hf_token=token, verbose=False)
    t0 = time.time()
    r = c.predict(
        'acestep-v15-xl-turbo' if a.model == 'xl' else 'acestep-v15-turbo', 'custom', '', 'en',
        CAPTION, lyrics, 120, 'G major', '4', 'en',
        8, 7.0, False, a.seed,
        None, -1 if a.mode == 'cover' else round(tl['D']), 1,
        src, '', 0.0, -1, 'Fill the audio semantic mask based on the given conditions:',
        a.strength, a.mode,
        False, 0.0, 1.0, 3.0, 'ode', '', 'flac',
        0.85, True, 2.0, 0, 0.9, 'NO USER INPUT', True, True, True, False, True, True, False, 0.5, 8, 'vocals', [], False,
        api_name='/generation_wrapper')
    if not r[0]:
        sys.exit(f'no audio: {r[10]}')
    shutil.copy(r[0], out)
    meta = {'space': SPACE, 'mode': a.mode, 'src': a.src, 'strength': a.strength, 'seed': a.seed, 'model': a.model,
            'caption': CAPTION, 'lyrics': lyrics, 'status': r[10], 'details': r[9], 'lrc': r[28], 'seconds': round(time.time() - t0)}
    out.with_suffix('.json').write_text(json.dumps(meta, indent=1, ensure_ascii=False))
    print(out, f"({meta['seconds']} s)")


if __name__ == '__main__':
    main()
