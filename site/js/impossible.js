// The Finder window of things a 1988 computer should not be able to do.
//
// Five of these can be proved offline, so the capture rig has photographs of
// them and they hang on the wall as pictures: the surprise is the whole point
// of this scene, and a surprise behind a double click is a surprise nobody
// sees. The rest need the live web, a model, or a file of your own, so they
// stay icons that open a card and send you to the running system.
//
// The list is deliberately not a feature inventory. It leads with the things
// that carry the product's judgment, in the words a stranger uses: the sheet
// that interviews you before you write, the map of your own research, and the
// desk that tells you your finished draft sounds like a machine.

import { iconImg } from "./eras.js?v=20260820a";
import { L } from "./copy.js?v=20260820a";

const doc = document;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const LIVE = "https://system6.aaronlau.me";

const ITEMS = [
  { icon: "searcher", label: L("Find Source Doors", "寻找来源入口"),
    line: L("Searcher finds titles, sites, and snippets to open and inspect in Reader.", "Searcher 找到标题、站点和摘要，再交给阅读器打开原文核对。") },
  { icon: "timeMachine", label: L("Read the Past", "阅读过去的网页"),
    line: L("Open an available archived capture after the live page has changed.", "实时网页变化以后，仍可打开实际存在的历史存档。") },
  { icon: "soundscape", label: L("Transcribe Audio", "转写录音"),
    line: L("An interview recording becomes text you can inspect and quote.", "访谈录音会变成可以检查和引用的文字。") },
  { icon: "importUtility", label: L("OCR Documents", "识别扫描文档"),
    line: L("Scanned paper becomes text you can inspect and search.", "扫描纸张会变成可以检查和搜索的文字。") },
  { icon: "questionSheet", label: L("Ask the Writer First", "先问写作者"),
    line: L("Before prose, keep the recipient, objections, first-hand details, and unresolved questions visible.", "正文之前，先让接收者、反对意见、亲历细节和尚未解决的问题留在明处。") },
  { icon: "docMap", label: L("Map a Source", "展开来源结构"),
    line: L("A long source becomes a map of sections, claims, and relations, with a path back to the original.", "一份长来源会展开成段落、论断和关系图，并保留回到原文的路径。") },
  { icon: "reviewDesk", label: L("Catch the Model Voice", "识别模型口吻"),
    line: L("Review Desk points out factual and structural risk, including where the writer's voice was flattened.", "审校台指出事实与结构风险，也指出写作者的声音在哪里被抹平。") },
  { icon: "clioChart", proofLabel: "Make Charts", label: L("Make Charts", "制作图表"),
    line: L("A sourced table becomes an editable visual projection.", "有来源的表格会变成仍可编辑的可视化投影。") },
  { icon: "clioStage", proofLabel: "Build Slides", label: L("Build Slides", "制作幻灯片"),
    line: L("Source Markdown can be converted into a Marp deck, then inspected as source, document, slides, or cues.", "来源 Markdown 可以转换为 Marp 演示稿，再从源码、文稿、幻灯片或提词视图检查。") },
  { icon: "cmfStudio", proofLabel: "Design in 3D", label: L("Design in 3D", "在三维中配色"),
    line: L("Recolor a supported 3D device and export the result for Quick Look or AR.", "为支持的三维设备重新配色，再导出到 Quick Look 或 AR。") },
  { icon: "liquidCover", proofLabel: "Render Glass", label: L("Render Glass", "渲染玻璃封面"),
    line: L("Compose text, shapes, and refractive material, then export a finished cover.", "组合文字、形状与折射材质，再导出完成的封面。") },
  { icon: "liquidCover", proofLabel: "Write Image Prompts", label: L("Write Image Prompts", "编写图像提示词"),
    line: L("One idea becomes a GPT-Image prompt and a compact universal prompt. It writes; it does not draw.", "一个想法会变成 GPT-Image 提示词与紧凑的通用提示词；它只写，不画。") },
];

// The wall reads loudest with the two colour captures on top: a 1-bit window
// full of colour is the thing people do a double take at.
const WALL = ["Design in 3D", "Render Glass", "Make Charts", "Build Slides", "Write Image Prompts"];

let proofs = null;
async function loadProofs() {
  if (proofs) return proofs;
  try {
    const res = await fetch("img/proofs/proofs.json?v=20260814i");
    const data = await res.json();
    proofs = Object.fromEntries(data.proofs.map((p) => [p.label, p]));
  } catch (e) {
    proofs = {};
  }
  return proofs;
}

function renderWall(wall, items, proofsByLabel) {
  items.forEach((item) => {
    const proof = proofsByLabel[item.proofLabel || item.label];
    const card = doc.createElement("figure");
    card.className = "proof-card";
    const shot = doc.createElement("img");
    shot.className = "proof-shot";
    shot.src = "img/proofs/" + proof.file;
    shot.alt = L(item.label + ", captured from the running app: " + proof.caption, `${item.label} 的运行截图：${item.line}`);
    shot.loading = "lazy";
    shot.decoding = "async";
    const cap = doc.createElement("figcaption");
    cap.className = "proof-cap";
    cap.appendChild(iconImg(item.icon, 32));
    const label = doc.createElement("span");
    label.className = "proof-label";
    label.textContent = item.label;
    const line = doc.createElement("span");
    line.className = "proof-line";
    line.textContent = item.line;
    cap.append(label, line);
    card.append(shot, cap);
    wall.appendChild(card);
  });
}

export async function initImpossible(wall, body, statusBar) {
  const restingStatus = L("12 items          2 floppies          on demand", "12 个项目          2 张软盘          按需打开");
  let openWin = null;

  function closeCard() {
    if (openWin) { openWin.remove(); openWin = null; }
    statusBar.textContent = restingStatus;
  }
  statusBar.textContent = restingStatus;

  function openCard(item, fromBtn) {
    closeCard();
    const win = doc.createElement("section");
    win.className = "mini-window demo-window";
    win.setAttribute("role", "dialog");
    win.setAttribute("aria-label", item.label);
    win.innerHTML = `
      <header class="tbar mini-tbar">
        <button type="button" class="close-box mw-close" aria-label="${L("Close", "关闭")} ${item.label}"></button>
        <h3>${item.label}</h3>
      </header>
      <div class="mini-wbody">
        <div class="imp-proof" hidden></div>
        <p class="imp-line">${item.line}</p>
        <p class="btn-row imp-actions"><a class="btn btn-default" href="${LIVE}">${L("See It Running", "打开运行中的系统")}</a></p>
        <p class="mw-status imp-status">${L("Opens the real Live System in this browser.", "在当前浏览器中打开真实运行的系统。")}</p>
      </div>`;
    body.appendChild(win);
    if (!reducedMotion) win.classList.add("win-zoom");
    openWin = win;
    statusBar.textContent = item.label + L(". No mockup: boot it and try.", "。不是模型图：启动后即可试用。" );
    loadProofs().then((all) => {
      const proof = all[item.proofLabel || item.label];
      if (!proof || openWin !== win) return;
      const box = win.querySelector(".imp-proof");
      const img = doc.createElement("img");
      img.src = "img/proofs/" + proof.file;
      img.alt = L(item.label + ", captured from the running app: " + proof.caption, `${item.label} 的运行截图：${item.line}`);
      img.loading = "lazy";
      img.decoding = "async";
      box.appendChild(img);
      box.hidden = false;
      win.classList.add("has-proof");
      win.querySelector(".imp-status").textContent = L("Captured from the running app. Not a mockup.", "拍摄自运行中的应用，不是模型图。" );
    });
    const close = win.querySelector(".mw-close");
    close.addEventListener("click", () => { closeCard(); fromBtn.focus(); });
    win.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeCard(); fromBtn.focus(); } });
    close.focus();
  }

  // Whatever the rig could not photograph stays an icon. If proofs.json is
  // missing the wall is simply empty and all eight fall back to icons.
  const proofs = await loadProofs();
  const walled = WALL
    .map((label) => ITEMS.find((item) => (item.proofLabel || item.label) === label))
    .filter((item) => item && proofs[item.proofLabel || item.label]);
  const wallLabels = new Set(walled.map((item) => item.proofLabel || item.label));
  if (wall && walled.length) renderWall(wall, walled, proofs);

  if (walled.length) {
    const more = doc.createElement("p");
    more.className = "finder-more";
    more.textContent = L(
      `${ITEMS.length - walled.length} more need the live web, a model, or a file of your own. Double click one.`,
      `另有 ${ITEMS.length - walled.length} 项需要实时网页、模型或你自己的文件。双击即可查看。`,
    );
    body.before(more);
  }

  ITEMS.filter((item) => !wallLabels.has(item.proofLabel || item.label)).forEach((item) => {
    const btn = doc.createElement("button");
    btn.type = "button";
    btn.className = "desk-icon finder-item";
    btn.setAttribute("data-balloon", item.line);
    btn.appendChild(iconImg(item.icon, 32));
    const label = doc.createElement("span");
    label.className = "desk-icon-label";
    label.textContent = item.label;
    btn.appendChild(label);

    let lastTap = 0;
    btn.addEventListener("click", (e) => {
      const now = Date.now();
      const second = now - lastTap < 650 && btn.classList.contains("selected");
      lastTap = now;
      body.querySelectorAll(".finder-item.selected").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      statusBar.textContent = item.label;
      if (e.detail === 0 || second) openCard(item, btn);
    });
    btn.addEventListener("dblclick", () => openCard(item, btn));
    body.appendChild(btn);
  });

  doc.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && openWin) closeCard();
  });
}
