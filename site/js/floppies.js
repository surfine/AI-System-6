// Two floppies boot a Macintosh. Scroll-triggered, CSS does the motion;
// with reduced motion the finished state shows immediately.

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

export function initFloppies(stage) {
  stage.innerHTML = `
    <div class="floppy-mac">
      <div class="floppy-screen"><span class="floppy-screen-msg">Welcome to AI&nbsp;System&nbsp;6.</span></div>
      <div class="floppy-slot"></div>
      <div class="floppy-chin"></div>
    </div>
    <div class="floppy-disk floppy-disk-1"><span class="floppy-label">DISK 1 · 1.44 MB</span><span class="floppy-shutter"></span></div>
    <div class="floppy-disk floppy-disk-2"><span class="floppy-label">DISK 2 · 1.44 MB</span><span class="floppy-shutter"></span></div>`;

  if (reducedMotion || !("IntersectionObserver" in window)) {
    stage.classList.add("floppy-booted");
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      stage.classList.add("floppy-run");
      io.disconnect();
    });
  }, { threshold: 0.5 });
  io.observe(stage);
}
