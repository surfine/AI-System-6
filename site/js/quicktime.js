// QuickTime-style window for the real 50-second film (Bilibili BV1ht3m6UEDb).
// Nothing third-party loads until the visitor presses play: the poster is a
// local image, and the click swaps in the Bilibili embed.

const EMBED =
  "https://player.bilibili.com/player.html?bvid=BV1ht3m6UEDb&autoplay=1&high_quality=1&danmaku=0";

export function initQuickTime() {
  const poster = document.getElementById("qt-poster");
  const body = document.getElementById("qt-body");
  if (!poster || !body) return;

  poster.addEventListener("click", (e) => {
    e.preventDefault();
    const frame = document.createElement("iframe");
    frame.src = EMBED;
    frame.className = "qt-frame";
    frame.setAttribute("title", "AI System 6 — 50-second film (Bilibili)");
    frame.setAttribute("allow", "autoplay; fullscreen");
    frame.setAttribute("scrolling", "no");
    body.replaceChild(frame, poster);
    frame.focus();
  });
}
