// Model Control Panel: pick a provider, the light goes Ready. Nothing is
// stored and nothing connects — the point is that the model is a setting.

import { iconImg } from "./eras.js?v=20260813a";

const PROVIDERS = [
  { id: "lmstudio", icon: "localModel", name: "LM Studio", note: "local" },
  { id: "ollama", icon: "endfieldTerminal", name: "Ollama", note: "local" },
  { id: "deepseek", icon: "cloudModel", name: "DeepSeek", note: "cloud" },
  { id: "custom", icon: "chooser", name: "Custom…", note: "OpenAI-compatible" },
];

export function initControlPanel(stage) {
  const doc = document;
  stage.innerHTML = `
    <div class="cp-window mini-window" style="position:relative">
      <header class="tbar mini-tbar">
        <span class="close-box" aria-hidden="true"></span><h3>Control Panel</h3>
      </header>
      <div class="mini-wbody">
        <div class="cp-head-row">
          <span class="cp-head-icon"></span>
          <p class="cp-lede">The desktop does not belong to a model vendor. Point it anywhere.</p>
        </div>
        <div class="cp-grid" role="radiogroup" aria-label="Model provider"></div>
        <div class="cp-status-row">
          <span class="cp-light" id="cp-light" aria-hidden="true"></span>
          <span class="cp-status" id="cp-status" role="status">Not Connected</span>
          <span class="cp-spacer"></span>
          <button type="button" class="btn cp-info" id="cp-getinfo">Get Info&hellip;</button>
        </div>
      </div>
    </div>
    <div class="mini-window cp-getinfo-window" id="cp-getinfo-window" hidden>
      <header class="tbar mini-tbar">
        <button type="button" class="close-box mw-close" aria-label="Close Get Info"></button><h3>Model Info</h3>
      </header>
      <div class="mini-wbody cp-getinfo-body">
        <p><strong>Kind:</strong> setting, not identity.</p>
        <p>AI System 6 talks to LM Studio and Ollama on your own machine, or to DeepSeek and
        any OpenAI-compatible endpoint in the cloud. Credentials stay outside project files,
        chats, backups, and exports. Local embeddings follow the active provider automatically.
        No model is required to explore the desktop.</p>
      </div>
    </div>`;

  stage.querySelector(".cp-head-icon").appendChild(iconImg("controlPanel", 32));
  const grid = stage.querySelector(".cp-grid");
  const light = stage.querySelector("#cp-light");
  const status = stage.querySelector("#cp-status");

  PROVIDERS.forEach((p, i) => {
    const btn = doc.createElement("button");
    btn.type = "button";
    btn.className = "cp-provider";
    btn.setAttribute("role", "radio");
    btn.setAttribute("aria-checked", "false");
    btn.dataset.provider = p.id;
    btn.appendChild(iconImg(p.icon, 32));
    const name = doc.createElement("span");
    name.className = "cp-name";
    name.textContent = p.name;
    const note = doc.createElement("span");
    note.className = "cp-note";
    note.textContent = p.note;
    btn.appendChild(name);
    btn.appendChild(note);
    btn.addEventListener("click", () => {
      grid.querySelectorAll(".cp-provider").forEach((b) => {
        b.classList.remove("selected");
        b.setAttribute("aria-checked", "false");
      });
      btn.classList.add("selected");
      btn.setAttribute("aria-checked", "true");
      light.classList.remove("cp-light-ready");
      status.textContent = "Connecting…";
      clearTimeout(initControlPanel._t);
      initControlPanel._t = setTimeout(() => {
        light.classList.add("cp-light-ready");
        status.textContent = "Ready — " + p.name;
      }, 550);
    });
    grid.appendChild(btn);
  });

  const infoWin = stage.querySelector("#cp-getinfo-window");
  stage.querySelector("#cp-getinfo").addEventListener("click", () => {
    infoWin.hidden = false;
    infoWin.querySelector(".mw-close").focus();
  });
  infoWin.querySelector(".mw-close").addEventListener("click", () => {
    infoWin.hidden = true;
    stage.querySelector("#cp-getinfo").focus();
  });
  infoWin.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { infoWin.hidden = true; stage.querySelector("#cp-getinfo").focus(); }
  });
}
