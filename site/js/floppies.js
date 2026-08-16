// Two floppies.
//
// The whole desktop is a boot payload you could carry on two 1.44 MB disks.
// The model you point it at is not. The joke only lands if you can see both
// piles, so we count the disks out in the product's own File Floppy icon and
// let the second pile run off the edge of the page.

import { iconImg } from "./eras.js?v=20260814i";

const FLOPPY_BYTES = 1_474_560;       // one 1.44 MB disk
// The payload is not a constant anybody types here: verify:floppy measures it
// on every build and writes the receipt, so this page cannot quote a number
// the gate never saw.
const RECEIPT = "data/floppy-budget.json";
const MODEL_BYTES = 4_000_000_000;    // a small 7B model, 4-bit, the friendly end

// It used to be 2.004 disks: two, and a rounding error you had to apologize
// for. Making the writing-route AI module lazy took it under the line, so the
// number is now the whole claim. It fits, with a corner of the second disk
// still empty. Show the disks it takes to carry, not the disks it fills.
const modelDisks = Math.round(MODEL_BYTES / FLOPPY_BYTES);
const SHOWN = 240;                    // enough to overflow; the rest is a number

export async function initFloppies(wall) {
  if (!wall) return;
  let DESKTOP_BYTES = 2 * FLOPPY_BYTES;
  try {
    const receipt = await (await fetch(RECEIPT + "?v=20260814i")).json();
    if (Number.isFinite(receipt?.bytes)) DESKTOP_BYTES = receipt.bytes;
  } catch (e) {
    // Without the receipt the section still reads: two disks is the claim.
  }
  const desktopDisks = DESKTOP_BYTES / FLOPPY_BYTES;
  wall.innerHTML = "";

  const mine = document.createElement("div");
  mine.className = "floppy-side floppy-side-mine";
  const mineDisks = document.createElement("div");
  mineDisks.className = "floppy-pile";
  for (let i = 0; i < Math.ceil(desktopDisks); i++) mineDisks.appendChild(iconImg("fileFloppy", 32));
  const mineLabel = document.createElement("p");
  mineLabel.className = "floppy-label-line";
  // Two disks is the fact anybody can feel. The exact byte count is a receipt,
  // so it waits in the tooltip for the one visitor in a hundred who wants it.
  mineLabel.innerHTML = `<strong>${Math.ceil(desktopDisks)}</strong> the whole desktop`;
  mineLabel.title = `${DESKTOP_BYTES.toLocaleString("en-US")} bytes, checked by a build gate on every release.`;
  mine.appendChild(mineDisks);
  mine.appendChild(mineLabel);

  const theirs = document.createElement("div");
  theirs.className = "floppy-side floppy-side-theirs";
  const theirDisks = document.createElement("div");
  theirDisks.className = "floppy-pile floppy-pile-wall";
  theirDisks.setAttribute("aria-hidden", "true");
  for (let i = 0; i < SHOWN; i++) theirDisks.appendChild(iconImg("fileFloppy", 32));
  const theirLabel = document.createElement("p");
  theirLabel.className = "floppy-label-line";
  theirLabel.innerHTML = `<strong>${modelDisks.toLocaleString("en-US")}</strong> one small model`;
  theirs.appendChild(theirDisks);
  theirs.appendChild(theirLabel);

  wall.appendChild(mine);
  wall.appendChild(theirs);

  const note = document.createElement("p");
  note.className = "scene-fine";
  note.textContent = "Bring your own gigabytes. The desktop stays on two disks.";
  wall.appendChild(note);
}
