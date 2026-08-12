// Lazy feature module: Alarm Clock desk accessory.

let alarmClockMode = "date";
let alarmClockExpanded = true;
let alarmClockEnabled = false;
let alarmClockAlarmTime = "09:00:00";
let alarmClockLastTriggered = "";
let alarmClockRinging = false;
let alarmClockEditSegment = "hour";
let alarmClockTimer = null;
let alarmClockInitialized = false;

const alarmClockEditSegments = ["hour", "minute", "second", "meridiem"];

function alarmClockPad(value) {
  return String(value).padStart(2, "0");
}

function formatAlarmClockTime(date = new Date()) {
  const hours = date.getHours();
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${alarmClockPad(date.getMinutes())}:${alarmClockPad(date.getSeconds())} ${hours >= 12 ? "PM" : "AM"}`;
}

function formatAlarmClockDate(date = new Date()) {
  return `${date.getMonth() + 1}/${date.getDate()}/${String(date.getFullYear()).slice(-2)}`;
}

function formatAlarmClockAlarm(value = alarmClockAlarmTime) {
  const [hours = 0, minutes = 0, seconds = 0] = String(value).split(":").map(Number);
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${alarmClockPad(minutes)}:${alarmClockPad(seconds)} ${hours >= 12 ? "PM" : "AM"}`;
}

function parseAlarmClockAlarm(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return "";
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] || 0);
  const meridiem = String(match[4] || "").toUpperCase();
  if (minutes > 59 || seconds > 59) return "";
  if (meridiem) {
    if (hours < 1 || hours > 12) return "";
    hours = (hours % 12) + (meridiem === "PM" ? 12 : 0);
  } else if (hours > 23) {
    return "";
  }
  return `${alarmClockPad(hours)}:${alarmClockPad(minutes)}:${alarmClockPad(seconds)}`;
}

function alarmClockSegmentRanges(value) {
  const text = String(value || "");
  const firstColon = text.indexOf(":");
  const secondColon = text.indexOf(":", firstColon + 1);
  const meridiemStart = text.lastIndexOf(" ") + 1;
  if (firstColon < 1 || secondColon < firstColon || meridiemStart <= secondColon) return null;
  return {
    hour: [0, firstColon],
    minute: [firstColon + 1, secondColon],
    second: [secondColon + 1, meridiemStart - 1],
    meridiem: [meridiemStart, text.length],
  };
}

function selectAlarmClockSegment(input, segment = alarmClockEditSegment) {
  if (!input || input.readOnly) return;
  const ranges = alarmClockSegmentRanges(input.value);
  const range = ranges?.[segment];
  if (!range) return;
  alarmClockEditSegment = segment;
  input.setSelectionRange(range[0], range[1]);
}

function alarmClockSegmentAtPosition(input, position) {
  const ranges = alarmClockSegmentRanges(input?.value);
  if (!ranges) return alarmClockEditSegment;
  return alarmClockEditSegments.find((segment) => position <= ranges[segment][1]) || "meridiem";
}

function moveAlarmClockSegment(input, direction) {
  const currentIndex = alarmClockEditSegments.indexOf(alarmClockEditSegment);
  const nextIndex = Math.max(0, Math.min(alarmClockEditSegments.length - 1, currentIndex + direction));
  selectAlarmClockSegment(input, alarmClockEditSegments[nextIndex]);
}

function alarmClockElements() {
  return {
    win: document.querySelector('[data-window="alarmClock"]'),
    currentTime: document.querySelector("#alarm-clock-current-time"),
    expanded: document.querySelector("#alarm-clock-expanded"),
    lever: document.querySelector("#alarm-clock-lever"),
    readout: document.querySelector(".alarm-clock-readout"),
    toggle: document.querySelector("#alarm-clock-toggle"),
    value: document.querySelector("#alarm-clock-value"),
    steppers: document.querySelector("#alarm-clock-steppers"),
    modes: document.querySelector("#alarm-clock-modes"),
  };
}

function syncAlarmClockRingingState(now = new Date()) {
  document.body.classList.toggle("alarm-clock-ringing", alarmClockRinging);
}

function renderAlarmClock(now = new Date()) {
  const elements = alarmClockElements();
  if (!elements.win) return;

  if (elements.currentTime) elements.currentTime.textContent = formatAlarmClockTime(now);
  elements.win.classList.toggle("is-compact", !alarmClockExpanded);
  elements.win.classList.toggle("is-ringing", alarmClockRinging);
  if (elements.expanded) elements.expanded.hidden = !alarmClockExpanded;
  if (elements.lever) {
    elements.lever.setAttribute("aria-expanded", String(alarmClockExpanded));
    elements.lever.setAttribute(
      "aria-label",
      t(alarmClockExpanded ? "alarm_clock_compact" : "alarm_clock_expand"),
    );
  }

  const alarmMode = alarmClockMode === "alarm";
  elements.readout?.classList.toggle("is-alarm-mode", alarmMode);
  if (elements.toggle) {
    elements.toggle.disabled = !alarmMode;
    elements.toggle.classList.toggle("is-available", alarmMode);
    elements.toggle.classList.toggle("is-on", alarmClockEnabled);
    elements.toggle.setAttribute("aria-pressed", String(alarmClockEnabled));
    elements.toggle.setAttribute("aria-label", t(alarmClockEnabled ? "alarm_clock_disable" : "alarm_clock_enable"));
  }
  if (elements.steppers) {
    elements.steppers.classList.toggle("is-available", alarmMode);
    elements.steppers.querySelectorAll("button").forEach((button) => {
      button.disabled = !alarmMode;
    });
  }
  if (elements.value && document.activeElement !== elements.value) {
    elements.value.readOnly = !alarmMode;
    elements.value.value = alarmMode
      ? formatAlarmClockAlarm()
      : (alarmClockMode === "date" ? formatAlarmClockDate(now) : formatAlarmClockTime(now));
    elements.value.setAttribute("aria-label", t(
      alarmMode ? "alarm_clock_alarm_time" : (alarmClockMode === "date" ? "alarm_clock_date" : "alarm_clock_time"),
    ));
  }
  elements.modes?.querySelectorAll("[data-alarm-clock-mode]").forEach((button) => {
    const selected = button.dataset.alarmClockMode === alarmClockMode;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
  syncAlarmClockRingingState(now);
}

function setAlarmClockMode(mode) {
  if (!["time", "date", "alarm"].includes(mode)) return;
  if (mode === "alarm" && alarmClockRinging) alarmClockRinging = false;
  alarmClockMode = mode;
  renderAlarmClock();
  saveDeskState();
}

function toggleAlarmClockExpanded() {
  alarmClockExpanded = !alarmClockExpanded;
  renderAlarmClock();
  saveDeskState();
}

function toggleAlarmClockEnabled() {
  if (alarmClockMode !== "alarm") return;
  alarmClockEnabled = !alarmClockEnabled;
  if (!alarmClockEnabled) alarmClockRinging = false;
  const message = t(alarmClockEnabled ? "alarm_clock_enabled" : "alarm_clock_disabled", formatAlarmClockAlarm());
  setStatus(message);
  playSystemSound("click");
  renderAlarmClock();
  saveDeskState();
}

function commitAlarmClockValue() {
  const input = document.querySelector("#alarm-clock-value");
  if (!input || alarmClockMode !== "alarm") return;
  const parsed = parseAlarmClockAlarm(input.value);
  if (!parsed) {
    setStatus(t("alarm_clock_invalid"));
    playSystemSound("alert");
    renderAlarmClock();
    return;
  }
  alarmClockAlarmTime = parsed;
  alarmClockLastTriggered = "";
  setStatus(t("alarm_clock_set", formatAlarmClockAlarm()));
  renderAlarmClock();
  saveDeskState();
}

function adjustAlarmClock(amount) {
  if (alarmClockMode !== "alarm") return;
  const [hours, currentMinutes, seconds] = alarmClockAlarmTime.split(":").map(Number);
  const date = new Date(2000, 0, 1, hours, currentMinutes, seconds);
  if (alarmClockEditSegment === "hour") date.setHours(date.getHours() + amount);
  if (alarmClockEditSegment === "minute") date.setMinutes(date.getMinutes() + amount);
  if (alarmClockEditSegment === "second") date.setSeconds(date.getSeconds() + amount);
  if (alarmClockEditSegment === "meridiem") date.setHours(date.getHours() + (amount * 12));
  alarmClockAlarmTime = `${alarmClockPad(date.getHours())}:${alarmClockPad(date.getMinutes())}:${alarmClockPad(date.getSeconds())}`;
  alarmClockLastTriggered = "";
  const input = document.querySelector("#alarm-clock-value");
  if (input) input.value = formatAlarmClockAlarm();
  playSystemSound("click");
  renderAlarmClock();
  if (document.activeElement === input) selectAlarmClockSegment(input);
  saveDeskState();
}

function checkAlarmClock(now = new Date()) {
  renderAlarmClock(now);
  if (!alarmClockEnabled) return;
  const current = `${alarmClockPad(now.getHours())}:${alarmClockPad(now.getMinutes())}:${alarmClockPad(now.getSeconds())}`;
  if (current !== alarmClockAlarmTime) return;
  const triggerKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}-${current}`;
  if (triggerKey === alarmClockLastTriggered) return;
  alarmClockLastTriggered = triggerKey;
  alarmClockRinging = true;
  const message = t("alarm_clock_rang", formatAlarmClockAlarm());
  setStatus(message);
  playSystemSound("alert");
  renderAlarmClock(now);
  saveDeskState();
}

function getAlarmClockState() {
  return {
    mode: alarmClockMode,
    expanded: alarmClockExpanded,
    enabled: alarmClockEnabled,
    alarmTime: alarmClockAlarmTime,
    lastTriggered: alarmClockLastTriggered,
  };
}

function restoreAlarmClockState(state = {}) {
  alarmClockMode = ["time", "date", "alarm"].includes(state.mode) ? state.mode : "date";
  alarmClockExpanded = state.expanded !== false;
  alarmClockEnabled = state.enabled === true;
  alarmClockAlarmTime = parseAlarmClockAlarm(state.alarmTime) || "09:00:00";
  alarmClockLastTriggered = String(state.lastTriggered || "");
  alarmClockRinging = false;
  renderAlarmClock();
}

function initializeAlarmClock() {
  if (alarmClockInitialized) return;
  const elements = alarmClockElements();
  if (!elements.win) return;
  alarmClockInitialized = true;

  elements.lever?.addEventListener("click", toggleAlarmClockExpanded);
  elements.win.querySelector(".alarm-clock-title-bar")?.addEventListener("dblclick", (event) => {
    if (event.target.closest("button")) return;
    toggleAlarmClockExpanded();
  });
  elements.toggle?.addEventListener("click", toggleAlarmClockEnabled);
  elements.modes?.addEventListener("click", (event) => {
    const mode = event.target.closest("[data-alarm-clock-mode]")?.dataset.alarmClockMode;
    if (mode) setAlarmClockMode(mode);
  });
  elements.steppers?.addEventListener("click", (event) => {
    const amount = Number(event.target.closest("[data-alarm-clock-adjust]")?.dataset.alarmClockAdjust || 0);
    if (amount) adjustAlarmClock(amount);
  });
  elements.steppers?.addEventListener("mousedown", (event) => {
    if (event.target.closest("[data-alarm-clock-adjust]")) event.preventDefault();
  });
  elements.value?.addEventListener("blur", commitAlarmClockValue);
  elements.value?.addEventListener("focus", () => {
    selectAlarmClockSegment(elements.value);
  });
  elements.value?.addEventListener("click", () => {
    const position = elements.value.selectionStart ?? 0;
    selectAlarmClockSegment(elements.value, alarmClockSegmentAtPosition(elements.value, position));
  });
  elements.value?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !eventIsTextComposition(event)) {
      event.preventDefault();
      elements.value.blur();
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      moveAlarmClockSegment(elements.value, event.key === "ArrowLeft" ? -1 : 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      adjustAlarmClock(1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      adjustAlarmClock(-1);
    }
  });

  clearInterval(alarmClockTimer);
  alarmClockTimer = setInterval(() => checkAlarmClock(new Date()), 1000);
  checkAlarmClock(new Date());
}
