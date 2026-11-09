// 文思泉涌 P4 · photographs in, a batch out as a roll.
//
// The writer drops pictures; the desk writes the bytes into the image directory
// and adds one frame each, taking the dimensions from the header and the month
// from EXIF. Then a batch is arranged into a stack and goes up as one roll.
//
// What this contract pins down: the numbers come from the bytes (not from the
// file name or the writer), a duplicate drop is one photograph, a frame lives
// in at most one stack, and a roll refuses frames the site builder would refuse.
// The fixtures are real format bytes — a PNG, a GIF, and a JPEG carrying a
// hand-built EXIF block — so the header reader is exercised, not mocked.

import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createRequire } from "node:module";

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("wensi-c4-photo-import");

const photos = require("../../apps/server/server/lib/blog-sites/photos.js");
const imageInfo = require("../../apps/server/server/lib/blog-sites/image-info.js");

// ---- fixtures: real bytes, so the header reader really runs ----

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PzWvWQAAAABJRU5ErkJggg==",
  "base64",
);

const GIF_2X3 = Buffer.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, // GIF89a
  0x02, 0x00, 0x03, 0x00, // 2 x 3, little-endian
  0x00, 0x00, 0x00, 0x3b,
]);

/**
 * A 48×32 JPEG whose APP1 carries DateTimeOriginal = 2024:01:13 19:07:57.
 * Built by hand so the test does not depend on a camera photograph being on
 * this machine.
 */
function jpegWithExif() {
  const tiff = Buffer.alloc(64);
  let at = 0;
  const u16 = (value) => { tiff.writeUInt16LE(value, at); at += 2; };
  const u32 = (value) => { tiff.writeUInt32LE(value, at); at += 4; };
  tiff.write("II", at, "ascii"); at += 2; // little-endian
  u16(42);
  u32(8); // IFD0 at 8
  u16(1); // one entry
  u16(0x8769); u16(4); u32(1); u32(26); // ExifIFD pointer → 26
  u32(0); // no next IFD
  u16(1); // ExifIFD: one entry
  u16(0x9003); u16(2); u32(20); u32(44); // DateTimeOriginal → 44
  u32(0);
  tiff.write("2024:01:13 19:07:57\0", 44, "latin1");

  const app1Length = 2 + 6 + tiff.length; // length field + "Exif\0\0" + TIFF
  const app1 = Buffer.alloc(4 + 6 + tiff.length);
  app1.writeUInt16BE(0xffe1, 0);
  app1.writeUInt16BE(app1Length, 2);
  app1.write("Exif\0\0", 4, "latin1");
  tiff.copy(app1, 10);

  // Start of frame: precision 8, height 32, width 48, three components.
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x20, 0x00, 0x30, 0x03,
    0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]);

  return Buffer.concat([Buffer.from([0xff, 0xd8]), app1, sof, Buffer.from([0xff, 0xd9])]);
}

const JPEG = jpegWithExif();

// The readers agree with the fixtures before anything writes to disk.
test.assert(JSON.stringify(imageInfo.imageInfo(PNG_1X1)) === JSON.stringify({ ok: true, format: "png", w: 1, h: 1 }), "a PNG's size comes from IHDR");
test.assert(imageInfo.imageInfo(GIF_2X3).w === 2 && imageInfo.imageInfo(GIF_2X3).h === 3, "a GIF's size comes from its screen descriptor");
test.assert(imageInfo.imageInfo(JPEG).w === 48 && imageInfo.imageInfo(JPEG).h === 32, "a JPEG's size comes from its frame header");
test.assert(imageInfo.takenMonth(JPEG) === "2024-01", "the month comes from EXIF DateTimeOriginal");
test.assert(imageInfo.takenMonth(PNG_1X1) === "", "a file with no EXIF claims no date");
test.assert(imageInfo.imageInfo(Buffer.from("not a picture")).ok === false, "unknown bytes are refused, not guessed");

// ---- a site on disk ----

const root = mkdtempSync(join(tmpdir(), "wensi-import-"));
const photosDir = join(root, "photos", "img");
mkdirSync(photosDir, { recursive: true });
const collectionFile = join(root, "photos", "photos.json");
writeFileSync(collectionFile, `${JSON.stringify({
  self: "",
  frames: {},
  stacks: [{ slug: "one", title: "一叠", meta: "", intro: "", ids: [] }],
  rolls: [],
}, null, 2)}\n`);

const site = {
  schema: 1,
  id: "probe",
  label: "probe",
  channel: { root },
  media: { dir: photosDir, urlPrefix: "/photos/img/" },
  contentTypes: {
    photos: { label: "影像", storage: { kind: "json-collection", dir: join(root, "photos"), file: "photos.json" }, fields: [] },
  },
};

// ---- photographs in ----

const imported = photos.importFrames(site, {
  files: [
    { name: "beach.JPG", data: JPEG.toString("base64") },
    { name: "甲.png", data: PNG_1X1.toString("base64") },
  ],
  city: "珠海",
});
test.assert(imported.ok === true && imported.counts.imported === 2, "two photographs become two frames");
test.assert(imported.imported[0].file === "beach.jpg", "the extension follows the bytes, lower-case, not the file's own name");
test.assert(imported.imported[0].w === 48 && imported.imported[0].h === 32, "the frame carries the JPEG's own dimensions");
test.assert(imported.imported[0].taken === "2024-01", "the frame carries the EXIF month");
test.assert(imported.imported[0].stack === "", "no stack named means the frames start loose");
test.assert(imported.imported[1].taken === "", "a picture with no date does not get an invented one");
test.assert(/^photo-[a-z0-9-]+\d+\.png$/.test(imported.imported[1].file), "a name with no ASCII left gets one made, so the URL stays clean");
test.assert(readdirSync(photosDir).sort().join(",") === imported.imported.map((frame) => frame.file).sort().join(","), "the bytes landed in the image directory under those names");

const stored = JSON.parse(readFileSync(collectionFile, "utf8"));
const beach = imported.imported[0].id;
test.assert(stored.frames[beach].alt === "", "the alt text starts empty — writing it is the writer's job");
test.assert(stored.frames[beach].city === "珠海", "the batch's city is written to each frame");
test.assert(stored.frames[beach].file === "beach.jpg" && stored.frames[beach].w === 48, "the collection file describes the photograph");

// ---- dropping the same picture twice is one photograph ----

const again = photos.importFrames(site, { files: [{ name: "beach-copy.jpg", data: JPEG.toString("base64") }] });
test.assert(again.counts.imported === 0, "the same bytes do not become a second frame");
test.assert(again.skipped[0].reason === "already_in_collection" && again.skipped[0].id === beach, "the refusal names the frame that already describes it");
test.assert(readdirSync(photosDir).length === 2, "no copy of the file was written");
test.assert(Object.keys(JSON.parse(readFileSync(collectionFile, "utf8")).frames).length === 2, "the collection still has two frames");

// ---- what cannot be brought in says why ----

let code = "";
try { photos.importFrames(site, { files: [] }); } catch (error) { code = error.code; }
test.assert(code === "bad_request", "an empty drop is refused");
const mixed = photos.importFrames(site, {
  files: [
    { name: "notes.txt", data: Buffer.from("hello").toString("base64") },
    { name: "broken.jpg", data: "" },
  ],
});
test.assert(mixed.imported.length === 0 && mixed.skipped.length === 2, "nothing usable means nothing written, and both reasons reported");
test.assert(mixed.skipped[0].reason === "unknown_format", "a text file is refused as an unknown format");
test.assert(mixed.skipped[1].reason === "empty_file", "an empty file is refused by name");
const heic = Buffer.alloc(24);
heic.write("ftypheic", 4, "ascii");
test.assert(photos.importFrames(site, { files: [{ name: "IMG_0001.HEIC", data: heic.toString("base64") }] }).skipped[0].reason === "needs_conversion", "HEIC is refused as needing conversion, not as unreadable");

// ---- arranging: a frame lives in at most one stack ----

const gif = photos.importFrames(site, { files: [{ name: "dot.gif", data: GIF_2X3.toString("base64") }], stack: "one" });
const gifId = gif.imported[0].id;
test.assert(JSON.parse(readFileSync(collectionFile, "utf8")).stacks[0].ids.includes(gifId), "a batch dropped on a stack is arranged into it");

const fresh = photos.createStack(site, { title: "Characters", meta: "速写" });
test.assert(fresh.ok === true && fresh.stack.slug === "characters", "a new stack gets an ASCII slug from its title");
let moved = photos.moveFrame(site, { id: gifId, to: "characters" });
test.assert(moved.ok === true && moved.stack === "characters", "a frame moves to another stack");
const afterMove = JSON.parse(readFileSync(collectionFile, "utf8"));
test.assert(!afterMove.stacks.find((stack) => stack.slug === "one").ids.includes(gifId), "the old stack no longer lists it");
test.assert(afterMove.stacks.find((stack) => stack.slug === "characters").ids.includes(gifId), "the new stack lists it once");

moved = photos.moveFrame(site, { id: beach, to: "" });
test.assert(moved.stack === "", "moving to no stack means the frame is loose");
const afterLoose = JSON.parse(readFileSync(collectionFile, "utf8"));
test.assert(afterLoose.stacks.every((stack) => !stack.ids.includes(beach)), "no stack lists a loose frame");

try { photos.createStack(site, { title: "人物" }); } catch (error) { code = error.code; }
test.assert(code === "bad_slug", "a stack title that slugifies to nothing is refused with the rule named");
try { photos.createStack(site, { title: "Characters" }); } catch (error) { code = error.code; }
test.assert(code === "stack_exists", "a duplicate stack is refused");
try { photos.moveFrame(site, { id: beach, to: "nope" }); } catch (error) { code = error.code; }
test.assert(code === "stack_missing", "moving into an unknown stack is a named refusal");

// ---- a batch goes up as one roll ----

try { photos.createRoll(site, { ids: [beach, gifId], date: "2026-11-09" }); } catch (error) { code = error.code; }
test.assert(code === "frame_not_in_stack", "a roll refuses a frame the site's builder would refuse");

const rolled = photos.createRoll(site, { ids: [beach, gifId], date: "2026-11-09", cap: "雨天", stack: "characters" });
test.assert(rolled.ok === true && rolled.roll.no === 1 && rolled.roll.code === "001", "the first roll is 001");
test.assert(rolled.roll.date === "2026-11-09" && rolled.roll.cap === "雨天", "the roll keeps its date and caption");
test.assert(JSON.stringify(rolled.roll.ids) === JSON.stringify([beach, gifId]), "the roll keeps the order the batch was given");
test.assert(rolled.movedFrom.length === 0, "nothing came from an earlier roll");
const afterRoll = JSON.parse(readFileSync(collectionFile, "utf8"));
test.assert(afterRoll.stacks.find((stack) => stack.slug === "characters").ids.includes(beach), "naming a stack arranges the loose frame into it, in the same write");
test.assert(afterRoll.rolls.length === 1 && afterRoll.rolls[0].no === 1, "the collection file carries the roll");

const second = photos.createRoll(site, { ids: [gifId], date: "2026-11-10" });
test.assert(second.roll.no === 2, "the next roll counts up from the highest");
test.assert(second.movedFrom[0].id === gifId && second.movedFrom[0].from === "001", "re-rolling a frame says which roll it leaves");

try { photos.createRoll(site, { ids: [], date: "2026-11-10" }); } catch (error) { code = error.code; }
test.assert(code === "bad_request", "a roll with no frames is refused");
try { photos.createRoll(site, { ids: ["nope"], date: "2026-11-10" }); } catch (error) { code = error.code; }
test.assert(code === "frame_missing", "a roll naming an unknown frame is refused");
try { photos.createRoll(site, { ids: [beach], date: "11/09/2026" }); } catch (error) { code = error.code; }
test.assert(code === "bad_date", "a date that is not YYYY-MM-DD is refused");

// ---- the view follows, and the file stays readable ----

const view = photos.photoView(site);
test.assert(view.summary.frames === 3 && view.summary.rolls === 2, "reading again shows what the writer arranged");
test.assert(view.rolls[1].code === "002", "the view reports zero-padded roll codes");
test.assert(view.stacks.find((stack) => stack.slug === "characters").frames.every((frame) => frame.roll), "each frame says which roll it went up in");

const noMedia = { ...site, media: {} };
try { photos.importFrames(noMedia, { files: [{ name: "a.png", data: PNG_1X1.toString("base64") }] }); } catch (error) { code = error.code; }
test.assert(code === "media_not_configured", "a site with no image directory says so");

rmSync(root, { recursive: true, force: true });
test.finish();
