// QuickTime-style player chrome around the 50-second demo clip.
// Muted by default; nothing plays until asked.

export function initQuickTime() {
  const doc = document;
  const video = doc.getElementById("qt-video");
  const play = doc.getElementById("qt-play");
  const scrub = doc.getElementById("qt-scrub");
  const time = doc.getElementById("qt-time");
  const mute = doc.getElementById("qt-mute");
  const full = doc.getElementById("qt-full");
  if (!video) return;

  // The poster is a ~300 KB JPEG: fetch it only when the player approaches
  // the viewport, so the first screen stays light.
  const poster = video.getAttribute("data-poster");
  if (poster) {
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          video.poster = poster;
          io.disconnect();
        });
      }, { rootMargin: "600px" });
      io.observe(video);
    } else {
      video.poster = poster;
    }
  }

  const fmt = (s) => {
    if (!isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    return m + ":" + String(Math.floor(s % 60)).padStart(2, "0");
  };

  play.addEventListener("click", () => {
    if (video.paused) video.play(); else video.pause();
  });
  video.addEventListener("click", () => {
    if (video.paused) video.play(); else video.pause();
  });
  video.addEventListener("play", () => {
    play.innerHTML = "&#10073;&#10073;";
    play.setAttribute("aria-label", "Pause");
  });
  video.addEventListener("pause", () => {
    play.innerHTML = "&#9654;&#xFE0E;";
    play.setAttribute("aria-label", "Play");
  });
  video.addEventListener("timeupdate", () => {
    if (video.duration) scrub.value = Math.round((video.currentTime / video.duration) * 1000);
    time.textContent = fmt(video.currentTime);
  });
  scrub.addEventListener("input", () => {
    if (video.duration) video.currentTime = (scrub.value / 1000) * video.duration;
  });
  mute.addEventListener("click", () => {
    video.muted = !video.muted;
    mute.setAttribute("aria-pressed", String(video.muted));
    mute.setAttribute("aria-label", video.muted ? "Sound off" : "Sound on");
    mute.innerHTML = video.muted ? "&#128264;&#xFE0E;" : "&#128266;&#xFE0E;";
  });
  full.addEventListener("click", () => {
    const box = video.closest(".qt-body");
    if (doc.fullscreenElement) doc.exitFullscreen();
    else if (box.requestFullscreen) box.requestFullscreen();
    else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
  });
}
