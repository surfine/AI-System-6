// Balloon Help. Off by default; the Help menu toggles it. Long-press shows a
// balloon on touch even when the toggle is off — touch has no hover to spend.

const doc = document;
let balloonsOn = false;
let balloon = null;
let hideTimer = null;

function ensureBalloon() {
  if (balloon) return balloon;
  balloon = doc.createElement("div");
  balloon.className = "balloon";
  balloon.setAttribute("role", "status");
  balloon.hidden = true;
  doc.body.appendChild(balloon);
  return balloon;
}

export function showBalloon(target, text) {
  const b = ensureBalloon();
  b.textContent = text;
  b.hidden = false;
  const r = target.getBoundingClientRect();
  b.style.left = "0px";
  b.style.top = "0px";
  const bw = b.offsetWidth;
  const margin = 8;
  let x = r.left + r.width / 2 - 18;
  let y = r.bottom + 10;
  x = Math.max(margin, Math.min(x, doc.documentElement.clientWidth - bw - margin));
  if (y + b.offsetHeight > doc.documentElement.clientHeight - margin) {
    y = r.top - b.offsetHeight - 10;
    b.classList.add("balloon-above");
  } else {
    b.classList.remove("balloon-above");
  }
  b.style.left = x + window.scrollX + "px";
  b.style.top = y + window.scrollY + "px";
}

export function hideBalloon() {
  if (balloon) balloon.hidden = true;
}

export function flashBalloon(target, text, ms) {
  showBalloon(target, text);
  clearTimeout(hideTimer);
  hideTimer = setTimeout(hideBalloon, ms || 2200);
}

export function balloonsEnabled() {
  return balloonsOn;
}

export function setBalloons(on) {
  balloonsOn = on;
  if (!on) hideBalloon();
}

export function initBalloons() {
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (fine) {
    doc.addEventListener("mouseover", (e) => {
      if (!balloonsOn) return;
      const t = e.target.closest("[data-balloon]");
      if (t) showBalloon(t, t.getAttribute("data-balloon"));
    });
    doc.addEventListener("mouseout", (e) => {
      if (e.target.closest("[data-balloon]")) hideBalloon();
    });
  }
  // Long-press on touch: show the balloon, and swallow the click that follows.
  let pressTimer = null;
  let pressed = null;
  doc.addEventListener("touchstart", (e) => {
    const t = e.target.closest("[data-balloon]");
    if (!t) return;
    pressTimer = setTimeout(() => {
      pressed = t;
      showBalloon(t, t.getAttribute("data-balloon"));
    }, 480);
  }, { passive: true });
  const cancel = () => { clearTimeout(pressTimer); setTimeout(() => { pressed = null; }, 350); hideBalloonSoon(); };
  function hideBalloonSoon() { setTimeout(hideBalloon, 1600); }
  doc.addEventListener("touchend", cancel, { passive: true });
  doc.addEventListener("touchcancel", cancel, { passive: true });
  doc.addEventListener("click", (e) => {
    if (pressed && pressed.contains(e.target)) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  // Keyboard: focusing an element with a balloon reads it via the status role.
  doc.addEventListener("focusin", (e) => {
    if (!balloonsOn) return;
    const t = e.target.closest("[data-balloon]");
    if (t) showBalloon(t, t.getAttribute("data-balloon"));
    else hideBalloon();
  });
}
