#!/usr/bin/env node
// Break a finished video into the evidence a person needs to study how it was made.
//
// This is the measuring half of 「拆视频」: everything here is deterministic
// and reads only the file. It finds hard cuts, takes one frame from the middle
// of every shot, lays the frames out on numbered contact sheets, and hangs each
// subtitle cue on the shot it is spoken over. Naming what a shot IS (close-up,
// hand-held, desk top) is judgment and is left to whoever looks at the sheets.
//
//   node tooling/video-breakdown.mjs <video.mp4> --out <dir> [--srt <file.srt>] [--threshold 0.3]
//
// Output in <dir>:
//   shots.json     every shot: index, in/out seconds, duration, the cues spoken over it
//   sheet-NN.jpg   contact sheets, 6×5 frames each, labelled with shot number and timecode
//   summary.json   duration, shot count, average/median shot length, speech rate,
//                  silent stretches, dark stretches (fades to black)
//
// Frames are taken from a 2 fps preview decode, so a shot shorter than half a
// second may borrow its neighbour's frame; the shot times themselves come from
// the full-rate scene pass.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const video = args[0];
const out = option("out");
if (!video || !out || !existsSync(video)) {
  console.error("usage: node tooling/video-breakdown.mjs <video> --out <dir> [--srt <file>] [--threshold 0.3]");
  process.exit(2);
}
const threshold = Number(option("threshold", "0.3"));
const minShot = 0.35;
const srtPath = option("srt", video.replace(/\.[^.]+$/, ".srt"));
const font = "/System/Library/Fonts/Hiragino Sans GB.ttc";

function run(bin, argv) {
  const result = spawnSync(bin, argv, { encoding: "utf8", maxBuffer: 1 << 28 });
  if (result.status !== 0) throw new Error(`${bin} failed: ${result.stderr.slice(-800)}`);
  return result;
}

function duration() {
  const text = run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", video]).stdout;
  return Number(text.split("\n")[0].replace(/,$/, ""));
}

// One decode does both jobs: scene scores for the cuts and a 2 fps preview for
// the frames. The scene pass runs at 15 fps (a cut lands within 1/15 s),
// which is a quarter of the work of a 60 fps master. Scaling happens on the GPU (scale_vt) before anything reaches the
// CPU, so a 4K60 file costs little more than a 1080p one; a hard cut survives
// downscaling, grain does not. Results are kept in <out>/.pass so a rerun (a
// new threshold, a new subtitle file) does not decode the video again.
function decodePass() {
  const pass = join(out, ".pass");
  const cached = join(pass, "cuts.json");
  if (existsSync(cached)) return { cuts: JSON.parse(readFileSync(cached, "utf8")), frames: pass };
  const owner = join(pass, "owner");
  if (existsSync(owner)) {
    // Another run is decoding this video; leave it alone rather than wipe its frames.
    const pid = Number(readFileSync(owner, "utf8"));
    try { process.kill(pid, 0); console.log(`busy: pid ${pid} is decoding ${video}`); process.exit(0); } catch {}
  }
  rmSync(pass, { recursive: true, force: true });
  mkdirSync(pass, { recursive: true });
  writeFileSync(owner, String(process.pid));
  const size = run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", video])
    .stdout.split("\n")[0].replace(/,$/, "").split(",").map(Number);
  const height = Math.round((384 * size[1]) / size[0] / 2) * 2;
  const { stderr } = run("ffmpeg", [
    "-hide_banner", "-hwaccel", "videotoolbox", "-hwaccel_output_format", "videotoolbox_vld", "-i", video, "-an",
    "-filter_complex", `[0:v]fps=15,scale_vt=w=384:h=${height},hwdownload,format=nv12,split=2[a][b];[a]select='gt(scene,${threshold})',showinfo[s];[b]fps=2[f]`,
    "-map", "[s]", "-f", "null", "-", "-map", "[f]", "-q:v", "4", join(pass, "f%05d.jpg"),
  ]);
  const cuts = [...stderr.matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1]));
  writeFileSync(cached, JSON.stringify(cuts));
  return { cuts, frames: pass };
}

function silences() {
  const { stderr } = run("ffmpeg", ["-hide_banner", "-i", video, "-vn", "-af", "silencedetect=n=-40dB:d=1.2", "-f", "null", "-"]);
  const starts = [...stderr.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...stderr.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  return starts.map((start, i) => ({ start, end: ends[i] ?? null }));
}

function parseSrt(file) {
  if (!existsSync(file)) return [];
  const stamp = (s) => {
    const [h, m, rest] = s.trim().split(":");
    return Number(h) * 3600 + Number(m) * 60 + Number(rest.replace(",", "."));
  };
  return readFileSync(file, "utf8").replace(/\r/g, "").split(/\n\n+/).map((block) => {
    const lines = block.trim().split("\n");
    const timing = lines.find((line) => line.includes("-->"));
    if (!timing) return null;
    const [a, b] = timing.split("-->");
    const text = lines.slice(lines.indexOf(timing) + 1).join(" ").trim();
    return text ? { start: stamp(a), end: stamp(b), text } : null;
  }).filter(Boolean);
}

mkdirSync(out, { recursive: true });
const total = duration();
const pass = decodePass();
// Fades to black do not register as cuts, yet they are where a film ends and
// its post-credits part begins. Read the mean brightness of the 2 fps frames
// (no second decode) and treat each flat black stretch's edges as boundaries;
// a frame counts as black when under 1% of it is lit, which lets a platform
// watermark through but not keynote footage or a page shown on black.
const dark = spawnSync("python3", ["-c", `
import json, os, sys
from PIL import Image
d = sys.argv[1]
names = sorted(n for n in os.listdir(d) if n.startswith("f") and n.endswith(".jpg"))
def lit(name):
    hist = Image.open(os.path.join(d, name)).convert("L").histogram()
    return sum(hist[40:]) / sum(hist)
print(json.dumps([lit(n) < 0.01 for n in names]))
`, pass.frames], { encoding: "utf8", maxBuffer: 1 << 24 });
const darkFrames = dark.status === 0 ? JSON.parse(dark.stdout) : [];
const blacks = [];
darkFrames.forEach((isDark, i) => {
  const t = i / 2;
  const last = blacks[blacks.length - 1];
  if (isDark && last && last.end === t) last.end = t + 0.5;
  else if (isDark) blacks.push({ start: t, end: t + 0.5 });
});
// A single dark preview frame is a dip through black between two shots: one
// boundary. A longer stretch is a black card of its own: both edges. Either
// way a black edge next to a detected cut adds nothing.
const blackEdges = blacks.flatMap((b) => (b.end - b.start <= 0.5 ? [b.start + 0.25] : [b.start, b.end]))
  .filter((t) => !pass.cuts.some((cut) => Math.abs(cut - t) < 0.6));
const candidates = [...pass.cuts, ...blackEdges].filter((t) => t > 0 && t < total).sort((a, b) => a - b);
const boundaries = [0];
for (const t of candidates) if (t - boundaries[boundaries.length - 1] >= minShot) boundaries.push(t);
if (total - boundaries[boundaries.length - 1] < minShot) boundaries.pop();
boundaries.push(total);

const cues = parseSrt(srtPath);
const shots = boundaries.slice(0, -1).map((start, i) => {
  const end = boundaries[i + 1];
  const spoken = cues.filter((cue) => cue.start < end && cue.end > start).map((cue) => cue.text);
  return { index: i + 1, start: +start.toFixed(2), end: +end.toFixed(2), duration: +(end - start).toFixed(2), cues: spoken };
});

// Pick the preview frame nearest each shot's middle and tile them, 6×5 per
// sheet, labelled "shot  m:ss.s  seconds". Homebrew's ffmpeg is built without
// drawtext, so the tiling is a few lines of Pillow instead.
const available = readdirSync(pass.frames).filter((name) => /^f\d+\.jpg$/.test(name)).length;
const picks = shots.map((shot) => {
  const frame = Math.min(available, Math.max(1, Math.round(shot.start + shot.end) + 1));
  const label = `${shot.index}  ${Math.floor(shot.start / 60)}:${(shot.start % 60).toFixed(1).padStart(4, "0")}  ${shot.duration.toFixed(1)}s`;
  return [join(pass.frames, `f${String(frame).padStart(5, "0")}.jpg`), label];
});
for (const old of readdirSync(out).filter((name) => /^sheet-\d+\.jpg$/.test(name))) rmSync(join(out, old));
const tile = spawnSync("python3", ["-c", `
import json, sys
from PIL import Image, ImageDraw, ImageFont
picks, out, font = json.load(sys.stdin), sys.argv[1], ImageFont.truetype(sys.argv[2], 18)
w, h = Image.open(picks[0][0]).size
cw, ch, cols, rows = w + 4, h + 30, 6, 5
for page in range(0, len(picks), cols * rows):
    sheet = Image.new("RGB", (cols * cw + 4, rows * ch + 4), "white")
    draw = ImageDraw.Draw(sheet)
    for i, (path, label) in enumerate(picks[page:page + cols * rows]):
        x, y = 4 + (i % cols) * cw, 4 + (i // cols) * ch
        sheet.paste(Image.open(path).resize((w, h)), (x, y))
        draw.text((x + 2, y + h + 4), label, fill="black", font=font)
    sheet.save(f"{out}/sheet-{page // (cols * rows) + 1:02d}.jpg", quality=82)
`, out, font], { input: JSON.stringify(picks), encoding: "utf8" });
if (tile.status !== 0) throw new Error(`contact sheet failed: ${tile.stderr.slice(-800)}`);

const lengths = shots.map((shot) => shot.duration).sort((a, b) => a - b);
const spokenChars = cues.reduce((sum, cue) => sum + cue.text.replace(/\s/g, "").length, 0);
const spokenSeconds = cues.reduce((sum, cue) => sum + (cue.end - cue.start), 0);
const summary = {
  video,
  duration: +total.toFixed(2),
  shots: shots.length,
  averageShot: +(total / shots.length).toFixed(2),
  medianShot: lengths[Math.floor(lengths.length / 2)],
  cues: cues.length,
  blacks,
  charsPerSpokenSecond: spokenSeconds ? +(spokenChars / spokenSeconds).toFixed(2) : null,
  silences: silences(),
};
writeFileSync(join(out, "shots.json"), JSON.stringify(shots, null, 1));
writeFileSync(join(out, "summary.json"), JSON.stringify(summary, null, 1));
console.log(`${shots.length} shots, avg ${summary.averageShot}s, ${cues.length} cues → ${out}`);
