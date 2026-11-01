// Field Notes: reading progress, and the real 1988 Mac in chapter 2.
//
// The machine is Infinite Mac's own embed, created only when the reader
// presses Boot and removed on Shut Down or when the page is left, so reading
// the essay costs nothing until someone asks for the old computer.

const doc = document;
const zh = doc.documentElement.lang.toLowerCase().startsWith("zh");
const t = (zhText, enText) => (zh ? zhText : enText);

/* ---------- Reading progress: the essay, not the sources ---------- */
(() => {
  const bar = doc.getElementById("fn-progress");
  const article = doc.querySelector(".fn-article");
  if (!bar || !article) return;
  let frame = 0;
  const update = () => {
    frame = 0;
    const r = article.getBoundingClientRect();
    const total = r.height - innerHeight;
    const read = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 0;
    bar.style.transform = `scaleX(${read.toFixed(4)})`;
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  addEventListener("scroll", schedule, { passive: true });
  addEventListener("resize", schedule);
  update();
})();

/* ---------- The machine ---------- */
(() => {
  const screen = doc.getElementById("lab-screen");
  const idle = doc.getElementById("lab-idle");
  const boot = doc.getElementById("lab-boot");
  const stop = doc.getElementById("lab-stop");
  const light = doc.getElementById("lab-light");
  const status = doc.getElementById("lab-status");
  if (!screen || !boot) return;

  let iframe = null;
  let timer = 0;
  let loaded = false;

  function shutDown(say) {
    clearTimeout(timer);
    iframe?.remove();
    iframe = null;
    loaded = false;
    idle.hidden = false;
    stop.hidden = true;
    light.classList.remove("is-on");
    if (say) status.textContent = t("已关机，可以再开一次。", "Shut down. You can boot it again.");
  }

  boot.addEventListener("click", () => {
    if (iframe) return;
    const url = new URL("https://infinitemac.org/embed");
    url.searchParams.set("disk", "System 6.0");
    url.searchParams.set("auto_pause", "true");
    url.searchParams.set("library", "false");
    url.searchParams.set("screenSize", "640x480");
    iframe = doc.createElement("iframe");
    iframe.src = url.href;
    iframe.title = t("可以操作的 System 6.0", "An interactive System 6.0");
    iframe.allow = "cross-origin-isolated";
    screen.appendChild(iframe);
    idle.hidden = true;
    stop.hidden = false;
    light.classList.add("is-on");
    status.textContent = t("正在开机，大约二十秒。", "Booting, about twenty seconds.");
    timer = setTimeout(() => {
      status.textContent = loaded
        ? t("已经在运行。还没看到桌面的话再等一会儿，或者在独立页面打开。", "It is running. If the desktop is not there yet, give it a moment, or open it on its own page.")
        : t("旧 Mac 还没有回应。可以关机重试，或者在独立页面打开。", "The old Mac has not answered yet. Shut down and try again, or open it on its own page.");
    }, 45000);
  });

  stop.addEventListener("click", () => {
    shutDown(true);
    boot.focus({ preventScroll: true });
  });

  addEventListener("message", (e) => {
    if (e.origin !== "https://infinitemac.org" || e.source !== iframe?.contentWindow) return;
    if (e.data?.type !== "emulator_loaded") return;
    loaded = true;
    status.textContent = t("开机了。桌面出来后，照着左边的步骤试试。", "It is up. Once the desktop appears, follow the steps alongside.");
  });

  // Infinite Mac's auto_pause already stops the machine off screen and in a
  // background tab; leaving the page releases it entirely.
  addEventListener("pagehide", () => shutDown(false));
})();
