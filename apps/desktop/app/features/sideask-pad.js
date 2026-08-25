// SideAsk pad — the Apple menu's door onto SideAsk.
//
// SideAsk was already here, as a mode: ClioTalk paired to TeachText or Quick
// Draft for one temporary conversation about that one window. It could only be
// entered from those two windows' own buttons, so a question you had while
// reading a source, or standing on the desktop, had nowhere to go.
//
// The menu bar belongs to the whole desk. So the pad pairs with whatever is in
// front, names it, and reads it; with nothing pairable in front it still takes
// the question, plainly, rather than pretending to a context it does not have.
// The reply lives here and is saved nowhere. One control hands the exchange to
// the full paired split that has always existed.

const sideAskPairable = new Set(["teachText", "quickDraft", "reader", "sectionDrafts", "outline", "questionSheet", "scrapbook", "imagePromptStudio"]);
let sideAskSubject = null;
let sideAskExchange = null;
let sideAskBusy = false;
let sideAskParts = null;
let sideAskOpenQuestion = "";
// The pad used to call the model directly, which meant it was the one place on
// the desk where a run could not be stopped, read nothing, and skipped the
// system-integrity prompt stack every other surface carries.
let sideAskAbort = null;

// A Desk Accessory was never resident: it arrived when you opened it. This one
// keeps that habit and builds itself, which is also why its markup is not sitting
// in index.html on every boot for a window most sessions never summon.
function buildSideAskPad() {
  if (!window.AISystem6ApplicationShell) return null;
  const win = window.AISystem6ApplicationShell.createWindow({
    windowName: "sideAskPad",
    windowClass: "sideask-pad-window",
    labelledBy: "sideask-pad-title",
    titleKey: "sideask",
    title: "SideAsk",
    resizable: false,
    shade: false,
    statusClass: "compact-status-bar",
    statusHtml: `
      <span class="status-bar-leading" id="sideask-pad-status" data-i18n="ready"></span>
      <!-- The right slot of a details bar is a real control here, the same
           shape the Review Desk and Writing Flow use. It used to print this
           label while an identical button sat in the row below, which cost the
           row the width that truncated its neighbours. -->
      <button class="btn details-bar-button status-bar-trailing" type="button" id="sideask-pad-promote" data-action="sideask-pad-promote" data-i18n="sideask_pad_promote"></button>`,
    paneClass: "sideask-pad-pane",
    paneHtml: `
      <textarea id="sideask-pad-question" rows="2" data-i18n-placeholder="sideask_pad_placeholder"></textarea>
      <div class="sideask-pad-answer" id="sideask-pad-answer" hidden>
        <p class="sideask-pad-temporary" data-i18n="sideask_pad_temporary"></p>
        <!-- message-content is what appendMessageGrounding looks for, so the
             pad shows what it read using ClioTalk's own basis strip rather than
             a second one that would drift from it. -->
        <div class="sideask-pad-reply message-content" id="sideask-pad-reply"></div>
      </div>
      <!-- [verbs] gap [Ask], the shape the other accessories use: packed flush
           right, the four buttons wrapped and Ask fell to a second line. -->
      <div class="button-row is-one-line">
        <button class="btn" type="button" id="sideask-pad-clear" data-action="sideask-pad-clear" data-i18n="clear"></button>
        <button class="btn" type="button" id="sideask-pad-interview" data-action="sideask-pad-interview" data-i18n="sideask_pad_interview" hidden></button>
        <span class="spacer"></span>
        <button class="btn default" type="button" id="sideask-pad-ask" data-action="sideask-pad-ask" data-i18n="ask"></button>
      </div>
    `,
  });
  const origin = document.createElement("div");
  origin.className = "da-origin";
  origin.id = "sideask-pad-origin";
  origin.hidden = true;
  origin.innerHTML = '<span id="sideask-pad-subject"></span>';
  win.insertBefore(origin, win.applicationPane);
  // The field drives its own buttons, and Enter asks.
  const field = win.querySelector("#sideask-pad-question");
  field.addEventListener("input", syncSideAskPad);
  field.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    askSideAskPad();
  });
  applyLanguage();
  return win;
}

// Every part lives inside the one window, so the window finds them once. The
// alternative is eight globals declared in three files, where forgetting the
// third takes the whole boot down and leaves every feature test green.
function sideAskPad() {
  if (sideAskParts?.root.isConnected) return sideAskParts;
  const root = document.querySelector('[data-window="sideAskPad"]') || buildSideAskPad();
  if (!root) return null;
  const part = (id) => root.querySelector(`#sideask-pad-${id}`);
  sideAskParts = {
    root,
    subject: part("subject"),
    origin: part("origin"),
    status: part("status"),
    question: part("question"),
    answer: part("answer"),
    reply: part("reply"),
    ask: part("ask"),
    clear: part("clear"),
    promote: part("promote"),
    interview: part("interview"),
  };
  return sideAskParts;
}

// The front window as the system sees it. Not document.activeElement, which
// follows the caret and would name the pad's own field.
function sideAskFrontSubject() {
  const open = [...document.querySelectorAll(".window:not(.is-hidden)")]
    .filter((win) => win.dataset.window && win.dataset.window !== "sideAskPad");
  const front = open.find((win) => win.classList.contains("is-active")) || open[open.length - 1];
  if (!front || !sideAskPairable.has(front.dataset.window)) return null;
  if (front.dataset.window === "imagePromptStudio") {
    const idea = front.querySelector("#ips-idea")?.value?.trim() || "";
    const gptImage = front.querySelector("#ips-gpt-out")?.value?.trim() || "";
    const universal = front.querySelector("#ips-universal-out")?.value?.trim() || "";
    const title = front.querySelector("#ips-title")?.value?.trim() || "";
    const text = [
      idea ? `Idea / brief:\n${idea}` : "",
      title ? `Title / overlay text:\n${title}` : "",
      gptImage ? `GPT-Image prompt:\n${gptImage}` : "",
      universal ? `Universal prompt:\n${universal}` : "",
    ].filter(Boolean).join("\n\n");
    return {
      name: front.dataset.window,
      title: front.querySelector(".title-bar h2")?.textContent?.trim() || front.dataset.window,
      text,
    };
  }
  const field = front.querySelector("textarea, [contenteditable='true']");
  return {
    name: front.dataset.window,
    title: front.querySelector(".title-bar h2")?.textContent?.trim() || front.dataset.window,
    text: String(field?.value ?? field?.textContent ?? "").trim(),
  };
}

function syncSideAskPad() {
  const pad = sideAskPad();
  if (!pad) return;
  sideAskSubject = sideAskFrontSubject();
  // What the pad is attached to now sits in the shared origin row, the same
  // row a Note Pad slip uses to say where it came from. The status bar keeps
  // the two slots every accessory shares: state on the left, and on the right
  // the one place this exchange can go.
  pad.origin.hidden = !sideAskSubject;
  pad.subject.textContent = sideAskSubject ? t("sideask_paired_with", sideAskSubject.title) : "";
  const asked = pad.question.value.trim();
  // Same gesture as ClioTalk's composer: the button that started the run is the
  // button that stops it, in place. A pad this small has no room for a second
  // control, and a run you cannot stop is the thing that broke here before.
  pad.ask.dataset.i18n = sideAskBusy ? "stop" : "ask";
  pad.ask.textContent = t(sideAskBusy ? "stop" : "ask");
  pad.ask.disabled = sideAskBusy ? !sideAskAbort : !asked;
  pad.clear.disabled = sideAskBusy || !(asked || sideAskExchange);
  // Promotion carries a real exchange across. With nothing asked yet there is
  // nothing to carry, and an empty split would just be another window.
  pad.promote.disabled = sideAskBusy || !sideAskExchange;
  // The interview only makes sense against the surface that collects material.
  const onSheet = sideAskSubject?.name === "questionSheet";
  pad.interview.hidden = !onSheet;
  pad.interview.disabled = sideAskBusy;
  pad.interview.textContent = t(sideAskOpenQuestion ? "sideask_pad_interview_next" : "sideask_pad_interview");
}

function sideAskPadStatus(key) {
  const pad = sideAskPad();
  if (pad) pad.status.textContent = t(key);
}

function showSideAskReply(text) {
  const pad = sideAskPad();
  if (!pad) return;
  pad.reply.textContent = text;
  pad.answer.hidden = !text;
  // The basis belongs to the answer it was captured for, so it leaves with it.
  if (!text) pad.answer.querySelector(".message-grounding-strip")?.remove();
}

async function openSideAskPad() {
  if (typeof ensureApplicationShell === "function") await ensureApplicationShell().catch(() => {});
  sideAskPad();
  openWindow("sideAskPad");
  syncSideAskPad();
  sideAskPad()?.question.focus({ preventScroll: true });
}

function clearSideAskPad() {
  const pad = sideAskPad();
  if (pad) pad.question.value = "";
  sideAskExchange = null;
  showSideAskReply("");
  sideAskPadStatus("ready");
  syncSideAskPad();
}

async function askSideAskPad() {
  // Busy means the one button is now Stop, so the same command aborts.
  if (sideAskBusy) {
    sideAskAbort?.abort();
    return;
  }
  const question = sideAskPad()?.question.value.trim();
  if (!question) return;
  if (typeof runWritingTask !== "function") return sideAskPadStatus("model_not_connected");

  // The paired window's own text is the context, capped so that a long
  // manuscript cannot quietly become the whole request.
  const excerpt = sideAskSubject?.text.slice(0, 4000) || "";
  const messages = [{
    role: "system",
    content: excerpt
      ? "Answer the question about the accompanying text. Be brief and concrete. Preserve the user's language."
      : "Answer briefly and concretely. Preserve the user's language.",
  }];
  if (excerpt) messages.push({ role: "user", content: `${sideAskSubject.title}:\n\n${excerpt}` });
  messages.push({ role: "user", content: question });

  sideAskAbort = new AbortController();
  sideAskBusy = true;
  syncSideAskPad();
  sideAskPadStatus("sideask_pad_asking");

  try {
    // Handing the payload over rather than a bare prompt keeps the pad's own
    // small shape — one system line and the paired excerpt — while the run
    // itself goes through the writing agent, which is what carries the reading
    // tools, the abort signal, the activity state and the guardrail prompts.
    const reply = String(await runWritingTask({
      taskKind: "sideask",
      userInput: question,
      signal: sideAskAbort.signal,
      payload: {
        model: getLocalModelRequestName(),
        messages,
        temperature: 0.4,
        max_tokens: 512,
        ai_system6_task_kind: "sideask",
      },
      onToolActivity: (calls) => sideAskPadToolStatus(calls),
    }) || "").trim();
    if (!reply) throw new Error("empty reply");
    sideAskExchange = { question, reply };
    showSideAskReply(reply);
    showSideAskBasis();
    sideAskPadStatus("ready");
  } catch (error) {
    sideAskExchange = null;
    showSideAskReply("");
    sideAskPadStatus(error?.name === "AbortError" ? "ready" : "sideask_pad_failed");
  } finally {
    sideAskAbort = null;
    sideAskBusy = false;
    syncSideAskPad();
  }
}

// The trailing status cell used to read "Ready" for the pad's whole life. While
// a run is reading, it says which object is being read — and goes quiet again
// when the answer lands, because the basis line below carries it from then on.
function sideAskPadToolStatus(calls = []) {
  const pad = sideAskPad();
  if (!pad) return;
  const labels = calls
    .map((call) => clioTalkToolActivityKeys[String(call?.name || "")])
    .filter(Boolean)
    .map((key) => t(key));
  if (labels.length) pad.status.textContent = t("clio_tool_activity_line", [...new Set(labels)]);
}

// What the answer stood on, drawn by ClioTalk's own basis strip so the pad and
// the full conversation cannot say the same thing two different ways.
function showSideAskBasis() {
  const pad = sideAskPad();
  if (!pad || typeof captureClioTalkGroundingSafely !== "function") return;
  const grounding = captureClioTalkGroundingSafely({ taskKind: "sideask" });
  if (grounding) appendMessageGrounding(pad.answer, grounding);
}

// The Question Sheet is the one stop that exists to collect messy human
// material before any prose. Filling it meant facing a blank page and a single
// hint, so the writer did the remembering, the organising and the typing — and
// a sparse sheet is exactly what turns an assistant into a mouthpiece later.
//
// Paired with the sheet, SideAsk turns around: ClioTalk asks, one question at
// a time, reading everything answered so far. The answer goes into the sheet
// verbatim — roughness, hesitation and all, because that is the part only the
// writer has. Press again and the exchange lands in the sheet and the next
// question arrives. Stop whenever: the sheet is a document the writer owns.
async function interviewQuestionSheet() {
  const pad = sideAskPad();
  if (!pad || sideAskBusy) return;
  if (typeof runWritingTask !== "function") return sideAskPadStatus("model_not_connected");
  syncSideAskPad();
  if (sideAskSubject?.name !== "questionSheet") return;

  const answer = pad.question.value.trim();
  if (sideAskOpenQuestion && answer) {
    appendToQuestionSheet(sideAskOpenQuestion, answer);
    pad.question.value = "";
    sideAskOpenQuestion = "";
  }

  sideAskAbort = new AbortController();
  sideAskBusy = true;
  syncSideAskPad();
  sideAskPadStatus("sideask_pad_asking");
  try {
    // The interviewer asks one question and reads only the sheet in front of
    // it, so the reading tools stay switched off here — a run that wandered off
    // to search sources mid-interview would be answering its own question
    // instead of asking the writer one. It still goes through the agent for the
    // abort signal, the activity state and the guardrail prompts.
    const question = String(await runWritingTask({
      taskKind: "sideask",
      userInput: sideAskSubject.text.slice(0, 6000),
      signal: sideAskAbort.signal,
      disableAgentTools: true,
      payload: {
        model: getLocalModelRequestName(),
        messages: [
          { role: "system", content: sideAskInterviewerBrief() },
          { role: "user", content: `${t("question_sheet")}:\n\n${sideAskSubject.text.slice(0, 6000) || "(empty)"}` },
        ],
        temperature: 0.7,
        max_tokens: 160,
        ai_system6_task_kind: "sideask",
      },
    }) || "").trim();
    if (!question) throw new Error("no question");
    sideAskOpenQuestion = question;
    showSideAskReply(question);
    sideAskPadStatus("ready");
    pad.question.focus({ preventScroll: true });
  } catch (error) {
    sideAskPadStatus(error?.name === "AbortError" ? "ready" : "sideask_pad_failed");
  } finally {
    sideAskAbort = null;
    sideAskBusy = false;
    syncSideAskPad();
  }
}

// The brief names the things this product says a Question Sheet must hold —
// and one rule does most of the work: ask only what you cannot answer yourself.
//
// A model that asks what it could have guessed is quizzing the writer. A model
// that asks what only this person, in this situation, actually knows is
// consulting them, and a writer who is consulted for what they know is a
// writer who can see that the piece needs them. Praise would be the cheap
// substitute for that, which is why it is forbidden here rather than added.
function sideAskInterviewerBrief() {
  return [
    "You are interviewing the writer to fill a Question Sheet before they draft.",
    "Ask exactly ONE short, concrete question and nothing else — no preamble, no summary, no list.",
    "Only ask what you could not answer yourself: what this writer saw, heard, decided or regretted;",
    "who really receives this and what they will do with it; the specific incident, number, or sentence",
    "someone actually said; where the pressure is; what makes the handoff awkward; what they disagree with.",
    "Never ask them to summarise what you could summarise, and never ask for a definition you already hold.",
    "Read what they have already answered and go after what is still missing.",
    "Never suggest wording, never draft, never praise, never evaluate their answer. Preserve the writer's language.",
  ].join(" ");
}

// Material lands in the sheet the writer owns, as plain Markdown they can edit
// or delete like anything else they typed.
function appendToQuestionSheet(question, answer) {
  const body = document.querySelector("#question-sheet-body");
  if (!body) return;
  const entry = `\n\n**${question.replace(/\s+/g, " ").trim()}**\n\n${answer}`;
  body.value = `${body.value.trimEnd()}${entry}`.trimStart();
  body.dispatchEvent(new Event("input", { bubbles: true }));
}

// A handoff, not a second conversation: the exchange goes to ClioTalk and the
// pad closes, so the desk keeps one place to look.
async function promoteSideAskPad() {
  if (!sideAskExchange) return;
  const carried = `${sideAskExchange.question}\n\n---\n\n${sideAskExchange.reply}`;
  await closeWindow("sideAskPad", true);
  if (sideAskSubject?.name === "teachText" && typeof toggleSideAsk === "function") await toggleSideAsk();
  else openWindow("assistant");
  const prompt = document.getElementById("prompt");
  if (prompt) {
    prompt.value = carried;
    prompt.focus({ preventScroll: true });
  }
  setStatus(t("sideask_pad_promoted"));
}

window.AISystem6Runtime?.registerApplication({id:"sideAskPad",windowName:"sideAskPad",mount:async()=>{if(typeof ensureApplicationShell==="function")await ensureApplicationShell().catch(()=>{});return sideAskPad();},restore:async()=>{if(typeof ensureApplicationShell==="function")await ensureApplicationShell().catch(()=>{});return sideAskPad();},commands:{"open-sideask-pad":{handler:()=>openSideAskPad(),isAvailable:()=>!0},"sideask-pad-ask":{handler:()=>askSideAskPad(),isAvailable:()=>!0},"sideask-pad-clear":{handler:()=>clearSideAskPad(),isAvailable:()=>!0},"sideask-pad-promote":{handler:()=>promoteSideAskPad(),isAvailable:()=>!0},"sideask-pad-interview":{handler:()=>interviewQuestionSheet(),isAvailable:()=>!0}}});
