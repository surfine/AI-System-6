// "Chat is an app" scene: a ClioTalk window surrounded by working app icons,
// and a giant modern chat bubble the visitor can put where it belongs.

import { iconImg } from "./eras.js?v=20260813a";
import { APPS } from "./desktop.js?v=20260813a";
import { flashBalloon } from "./balloon.js?v=20260813a";

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

export function initChatScene(stage) {
  const doc = document;
  stage.innerHTML = `
    <div class="chat-window mini-window" style="position:relative">
      <header class="tbar mini-tbar"><span class="close-box" aria-hidden="true"></span><h3>ClioTalk</h3></header>
      <div class="mini-wbody">
        <div class="mw-chatlog">
          <p class="mw-q">Tighten paragraph two?</p>
          <p class="mw-a">Two options on your desk. Keep either, or neither.</p>
        </div>
        <p class="mw-status">One app. Not the computer.</p>
      </div>
    </div>
    <div class="chat-apps chat-apps-left"></div>
    <div class="chat-apps chat-apps-right"></div>
    <div class="chat-bubble-slot">
      <div class="chat-bubble" id="chat-bubble" tabindex="0" role="button"
           aria-label="A modern chat bubble that owns the whole screen. Drag it to the Trash, or press Enter to put it away.">
        <span class="chat-bubble-dot"></span><span class="chat-bubble-dot"></span><span class="chat-bubble-dot"></span>
        <span class="chat-bubble-text">the entire computer is now a text field</span>
      </div>
      <button type="button" class="chat-putaway" id="chat-putaway">Put Away (move to Trash)</button>
    </div>
    <button type="button" class="chat-trash desk-icon" id="chat-trash" data-balloon="Deletion, made honest.">
      <span class="chat-trash-img"></span>
      <span class="desk-icon-label">Trash</span>
    </button>`;

  const left = stage.querySelector(".chat-apps-left");
  const right = stage.querySelector(".chat-apps-right");
  ["searcher", "reader", "scrapbook", "docMap", "teachText", "reviewDesk", "clioStage", "cmfStudio"].forEach((id, i) => {
    const fig = doc.createElement("figure");
    fig.className = "chat-app";
    fig.style.setProperty("--i", i);
    if (APPS[id].balloon) fig.setAttribute("data-balloon", APPS[id].balloon);
    fig.appendChild(iconImg(APPS[id].icon, 32));
    const cap = doc.createElement("figcaption");
    cap.textContent = APPS[id].title;
    fig.appendChild(cap);
    (i < 4 ? left : right).appendChild(fig);
  });

  // Reveal icons one by one as the scene scrolls in.
  if ("IntersectionObserver" in window && !reducedMotion) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        stage.classList.add("chat-in");
        io.disconnect();
      });
    }, { threshold: 0.35 });
    io.observe(stage);
  } else {
    stage.classList.add("chat-in");
  }

  /* Bubble → Trash. Pointer drag moves the bubble live; the visible
     Put Away button and Enter/Space give the same result without a mouse. */
  const bubble = stage.querySelector("#chat-bubble");
  const trashBtn = stage.querySelector("#chat-trash");
  const trashImg = trashBtn.querySelector(".chat-trash-img");
  trashImg.appendChild(iconImg("trash", 32));

  let done = false;
  function binIt() {
    if (done) return;
    done = true;
    bubble.classList.add("chat-bubble-binned");
    trashImg.querySelector("img").setAttribute("data-icon", "trashFull");
    trashImg.querySelector("img").src = trashImg.querySelector("img").src.replace("/trash.", "/trashFull.");
    stage.classList.add("chat-binned");
    stage.querySelector("#chat-putaway").disabled = true;
    flashBalloon(trashBtn, "Chat still works — as an app.", 2600);
    const note = doc.getElementById("chat-note");
    if (note) note.textContent = "Chat still works. It just doesn't own the desk anymore.";
    setTimeout(() => bubble.remove(), reducedMotion ? 0 : 700);
  }

  bubble.addEventListener("pointerdown", (e) => {
    if (done || e.button !== 0) return;
    e.preventDefault();
    bubble.setPointerCapture(e.pointerId);
    bubble.classList.add("dragging");
    const startX = e.clientX, startY = e.clientY;
    const move = (ev) => {
      bubble.style.transform = `translate(${ev.clientX - startX}px, ${ev.clientY - startY}px) scale(0.9)`;
      const t = trashBtn.getBoundingClientRect();
      const over = ev.clientX > t.left - 12 && ev.clientX < t.right + 12 && ev.clientY > t.top - 12 && ev.clientY < t.bottom + 12;
      trashBtn.classList.toggle("selected", over);
    };
    const up = (ev) => {
      bubble.removeEventListener("pointermove", move);
      bubble.removeEventListener("pointerup", up);
      bubble.removeEventListener("pointercancel", up);
      bubble.classList.remove("dragging");
      if (trashBtn.classList.contains("selected") && ev.type === "pointerup") {
        trashBtn.classList.remove("selected");
        binIt();
      } else {
        bubble.style.transform = "";
        trashBtn.classList.remove("selected");
      }
    };
    bubble.addEventListener("pointermove", move);
    bubble.addEventListener("pointerup", up);
    bubble.addEventListener("pointercancel", up);
  });
  bubble.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); binIt(); }
  });
  stage.querySelector("#chat-putaway").addEventListener("click", binIt);
}
