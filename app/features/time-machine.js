// Feature module: Time Machine.
//
// A restricted browser that can keep navigating the live web or resolve each
// clicked URL near one historical date. Remote scripts never enter the desktop:
// the server sanitizes HTML and this client renders it in an opaque sandbox.

var currentTimeMachinePage = null;
var currentTimeMachineRequest = null;
var currentTimeMachineView = "web";
var currentTimeMachineClipCount = 0;
var timeMachineLaunchPrepared = false;
var timeMachineCalendarRequest = null;
var timeMachineCalendarUrl = "";
var timeMachineCalendarTimeline = null;
var timeMachineCalendarDaysByYear = Object.create(null);
var timeMachineCalendarDisplayDate = null;

const timeMachineWindowEl = document.querySelector('[data-window="timeMachine"]');
const timeMachineTitleEl = document.querySelector("#time-machine-title");
const timeMachineBackButton = document.querySelector("#time-machine-back");
const timeMachineForwardButton = document.querySelector("#time-machine-forward");
const timeMachineStopButton = document.querySelector("#time-machine-stop");
const timeMachineSourceSwitchButton = document.querySelector("#time-machine-source-switch");
const timeMachineSourceLabelEl = document.querySelector("#time-machine-source-label");
const timeMachineWebViewButton = document.querySelector("#time-machine-web-view");
const timeMachineReaderViewButton = document.querySelector("#time-machine-reader-view");
const timeMachineEnabledInput = document.querySelector("#time-machine-enabled");
const timeMachineDateInput = document.querySelector("#time-machine-date");
const timeMachineDateRangeEl = document.querySelector("#time-machine-date-range");
const timeMachineDateCountEl = document.querySelector("#time-machine-date-count");
const timeMachineDateControlEl = document.querySelector(".time-machine-date-control");
const timeMachineCalendarButton = document.querySelector("#time-machine-calendar-button");
const timeMachineDatePopover = document.querySelector("#time-machine-date-popover");
const timeMachineCalendarStatusEl = document.querySelector("#time-machine-calendar-status");
const timeMachineYearStripEl = document.querySelector("#time-machine-year-strip");
const timeMachineCalendarPreviousButton = document.querySelector("#time-machine-calendar-previous");
const timeMachineCalendarNextButton = document.querySelector("#time-machine-calendar-next");
const timeMachineCalendarMonthEl = document.querySelector("#time-machine-calendar-month");
const timeMachineCalendarWeekdaysEl = document.querySelector("#time-machine-calendar-weekdays");
const timeMachineCalendarGridEl = document.querySelector("#time-machine-calendar-grid");
const timeMachineProviderInput = document.querySelector("#time-machine-provider");
const timeMachineTimeBandEl = document.querySelector("#time-machine-address-form");
const timeMachineAddressForm = document.querySelector("#time-machine-address-form");
const timeMachineAddressInput = document.querySelector("#time-machine-address");
const timeMachineTabsEl = document.querySelector("#time-machine-tabs");
const timeMachineFrameEl = document.querySelector("#time-machine-frame");
// #time-machine-frame is sandboxed to an opaque origin, so the parent can't
// read its contentDocument to know when a navigation actually finished
// painting — /api/time-machine/render owns an independent document response
// (normally served from the server's short-lived /browse result cache).
// data-frame-ready is the only
// externally observable "is the page actually up yet" signal (used by the
// promo recording script).
timeMachineFrameEl?.addEventListener("load", () => {
  timeMachineFrameEl.dataset.frameReady = "true";
});
const timeMachineReaderEl = document.querySelector("#time-machine-reader");
const timeMachineHomeEl = document.querySelector("#time-machine-home");
const timeMachineLoadingEl = document.querySelector("#time-machine-loading");
const timeMachineClipButton = document.querySelector("#time-machine-clip");
const timeMachineClipTranslateButton = document.querySelector("#time-machine-clip-translate");
const timeMachineDocMapButton = document.querySelector("#time-machine-docmap");
const timeMachineAskForm = document.querySelector("#time-machine-ask-form");
const timeMachineQuestionInput = document.querySelector("#time-machine-question");
const timeMachineProvenanceEl = document.querySelector("#time-machine-provenance");
let timeMachineReceiptTimer = 0;
const timeMachineSendManuscriptButton = document.querySelector("#time-machine-send-manuscript");
const timeMachineSaveWaybackLink = document.querySelector("#time-machine-save-wayback");
const timeMachineSaveArchiveIsLink = document.querySelector("#time-machine-save-archive-is");

function timeMachineToday() {
  return new Date().toISOString().slice(0, 10);
}

function timeMachineNormalizeAddress(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  const parsed = new URL(candidate);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error(t("time_machine_invalid_url"));
  parsed.hash = "";
  return parsed.href;
}

function timeMachineUnwrapArchiveUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return value;
  }
  if (parsed.hostname.toLowerCase() !== "web.archive.org") return parsed.href;
  const match = parsed.pathname.match(/^\/web\/\d+(?:[a-z_]+)?\/(https?:\/\/.+)$/i);
  if (match) {
    try {
      return new URL(`${match[1]}${parsed.search}`).href;
    } catch {
      return parsed.href;
    }
  }
  const originalUrl = currentTimeMachinePage?.url || activeTimeMachineTab()?.state?.address || "";
  if (originalUrl) {
    try {
      return new URL(`${parsed.pathname}${parsed.search}`, originalUrl).href;
    } catch {
      return parsed.href;
    }
  }
  return parsed.href;
}

function timeMachineCanonicalProvider(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "wayback" || raw === "web.archive.org") return "wayback";
  if (raw === "archive-is" || raw === "archive-today") return "archive-is";
  let hostname = raw;
  try {
    hostname = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase();
  } catch {
    hostname = raw;
  }
  return ["archive.today", "archive.is", "archive.ph", "archive.vn", "archive.fo", "archive.li", "archive.md"].includes(hostname)
    ? "archive-is"
    : "";
}

function timeMachineWaybackCapturedAt(value) {
  let timestamp = "";
  try {
    timestamp = new URL(value).pathname.match(/^\/web\/(\d{14})/i)?.[1] || "";
  } catch {
    timestamp = "";
  }
  if (!timestamp) return "";
  const iso = `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}T${timestamp.slice(8, 10)}:${timestamp.slice(10, 12)}:${timestamp.slice(12, 14)}.000Z`;
  return Number.isNaN(Date.parse(iso)) ? "" : iso;
}

function timeMachineProviderLabel(provider) {
  const canonical = timeMachineCanonicalProvider(provider);
  if (canonical === "wayback") return "Wayback";
  if (canonical === "archive-is") return "archive.today";
  return t("automatic");
}

function timeMachineEffectiveProvider() {
  const actual = timeMachineCanonicalProvider(currentTimeMachinePage?.archive?.provider);
  if (actual) return actual;
  const tabPreference = timeMachineCanonicalProvider(activeTimeMachineTab()?.state?.providerPreference);
  if (tabPreference) return tabPreference;
  return timeMachineCanonicalProvider(timeMachineProviderInput?.value) || "wayback";
}

function timeMachineUpdateSourceSwitch(provider = "") {
  if (!timeMachineSourceSwitchButton || !timeMachineSourceLabelEl) return;
  const current = timeMachineCanonicalProvider(provider) || timeMachineEffectiveProvider();
  const next = current === "wayback" ? "archive-is" : "wayback";
  timeMachineSourceLabelEl.textContent = timeMachineProviderLabel(current);
  const switchLabel = t("time_machine_switch_to_source", timeMachineProviderLabel(next));
  timeMachineSourceSwitchButton.setAttribute("aria-label", switchLabel);
  timeMachineSourceSwitchButton.title = switchLabel;
  timeMachineSourceSwitchButton.disabled = !timeMachineEnabledInput?.checked
    || !timeMachineAddressInput?.value?.trim();
}

function timeMachineCalendarLocale() {
  return currentLanguage === "zh" ? "zh-CN" : "en-US";
}

function timeMachineCalendarDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3] || 1)));
  return Number.isNaN(date.getTime()) ? null : date;
}

function timeMachineCalendarDateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function timeMachineCalendarDateLabel(value) {
  const date = timeMachineCalendarDate(String(value || "").slice(0, 10));
  if (!date) return "";
  return new Intl.DateTimeFormat(timeMachineCalendarLocale(), {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function timeMachineCalendarAddress() {
  try {
    return timeMachineNormalizeAddress(timeMachineAddressInput?.value || "");
  } catch {
    return "";
  }
}

function timeMachineCalendarTimelineMatchesAddress() {
  return !!timeMachineCalendarTimeline && timeMachineCalendarUrl === timeMachineCalendarAddress();
}

function timeMachineRenderCalendarSummary() {
  if (!timeMachineDateRangeEl || !timeMachineDateCountEl) return;
  const address = timeMachineCalendarAddress();
  const timeline = timeMachineCalendarTimelineMatchesAddress() ? timeMachineCalendarTimeline : null;
  if (!address) {
    timeMachineDateRangeEl.textContent = t("time_machine_calendar_enter_url");
    timeMachineDateCountEl.textContent = "";
    return;
  }
  if (!timeline?.firstCapturedAt || !timeline?.lastCapturedAt) {
    timeMachineDateRangeEl.textContent = t("time_machine_calendar_open_to_query");
    timeMachineDateCountEl.textContent = "";
    return;
  }
  timeMachineDateRangeEl.textContent = t(
    "time_machine_date_range_actual",
    timeMachineCalendarDateLabel(timeline.firstCapturedAt),
    timeMachineCalendarDateLabel(timeline.lastCapturedAt)
  );
  timeMachineDateCountEl.textContent = t(
    "time_machine_saved_times",
    new Intl.NumberFormat(timeMachineCalendarLocale()).format(timeline.totalCaptures || 0)
  );
}

function timeMachineUpdateDateRange() {
  if (!timeMachineDateInput) return;
  timeMachineDateInput.max = timeMachineToday();
  const timeline = timeMachineCalendarTimelineMatchesAddress() ? timeMachineCalendarTimeline : null;
  if (timeline?.firstCapturedAt) {
    timeMachineDateInput.min = timeline.firstCapturedAt.slice(0, 10);
  } else {
    timeMachineDateInput.removeAttribute("min");
  }
  if (timeline?.lastCapturedAt) {
    timeMachineDateInput.max = [timeMachineToday(), timeline.lastCapturedAt.slice(0, 10)].sort()[0];
  }
  timeMachineRenderCalendarSummary();
}

function timeMachineSetCalendarStatus(message = "", kind = "") {
  if (!timeMachineCalendarStatusEl) return;
  timeMachineCalendarStatusEl.textContent = message;
  timeMachineCalendarStatusEl.dataset.kind = kind;
  timeMachineCalendarStatusEl.hidden = !message;
}

function timeMachineRenderCalendarWeekdays() {
  if (!timeMachineCalendarWeekdaysEl) return;
  timeMachineCalendarWeekdaysEl.replaceChildren();
  const formatter = new Intl.DateTimeFormat(timeMachineCalendarLocale(), {
    weekday: "short",
    timeZone: "UTC",
  });
  for (let day = 7; day < 14; day += 1) {
    const label = document.createElement("span");
    label.textContent = formatter.format(new Date(Date.UTC(2024, 0, day)));
    timeMachineCalendarWeekdaysEl.append(label);
  }
}

function timeMachineRenderYearStrip() {
  if (!timeMachineYearStripEl) return;
  timeMachineYearStripEl.replaceChildren();
  const years = timeMachineCalendarTimelineMatchesAddress()
    ? timeMachineCalendarTimeline?.years || []
    : [];
  if (!years.length) {
    timeMachineYearStripEl.hidden = true;
    return;
  }
  timeMachineYearStripEl.hidden = false;
  const activeYear = timeMachineCalendarDisplayDate?.getUTCFullYear();
  const maxCount = Math.max(...years.map((entry) => entry.count || 0), 1);
  years.forEach((entry, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "time-machine-year";
    if (entry.year === activeYear) button.classList.add("is-selected");
    if (index === 0 || index === years.length - 1 || entry.year % 5 === 0) {
      button.classList.add("is-labeled");
    }
    button.dataset.year = String(entry.year);
    button.style.setProperty(
      "--capture-intensity",
      `${Math.round(Math.max(0.06, entry.count / maxCount) * 100)}%`
    );
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", String(entry.year === activeYear));
    button.setAttribute("aria-label", t("time_machine_year_captures", entry.year, entry.count));
    button.title = t("time_machine_year_captures", entry.year, entry.count);
    const bar = document.createElement("span");
    bar.className = "time-machine-year-bar";
    const label = document.createElement("span");
    label.className = "time-machine-year-label";
    label.textContent = String(entry.year);
    button.append(bar, label);
    button.addEventListener("click", () => {
      const months = entry.months?.length ? entry.months : Array(12).fill(0);
      const busiest = months.indexOf(Math.max(...months));
      timeMachineCalendarDisplayDate = new Date(Date.UTC(entry.year, Math.max(0, busiest), 1));
      timeMachineLoadArchiveCalendar(entry.year);
    });
    timeMachineYearStripEl.append(button);
  });
}

function timeMachineCalendarDayData(year, date) {
  return (timeMachineCalendarDaysByYear[String(year)] || []).find((entry) => entry.date === date) || null;
}

function timeMachineChooseCalendarDate(date, dayData = null) {
  if (!timeMachineDateInput) return;
  timeMachineDateInput.value = date;
  captureActiveTimeMachineTabState();
  timeMachineSetDatePopover(false);
  const address = timeMachineCalendarAddress();
  if (!timeMachineEnabledInput?.checked || !address) return;
  if (dayData?.timestamp) {
    const timestamp = String(dayData.timestamp);
    const capturedAt = timeMachineWaybackCapturedAt(`https://web.archive.org/web/${timestamp}/${address}`);
    timeMachineNavigate(address, {
      capture: {
        provider: "wayback",
        originalUrl: address,
        snapshotUrl: `https://web.archive.org/web/${timestamp}/${address}`,
        browseUrl: `https://web.archive.org/web/${timestamp}id_/${address}`,
        capturedAt,
      },
    });
    return;
  }
  timeMachineNavigate(address);
}

function timeMachineRenderMonthCalendar() {
  if (!timeMachineCalendarGridEl || !timeMachineCalendarMonthEl) return;
  const displayDate = timeMachineCalendarDisplayDate
    || timeMachineCalendarDate(timeMachineDateInput?.value)
    || timeMachineCalendarDate(timeMachineToday());
  if (!displayDate) return;
  timeMachineCalendarDisplayDate = displayDate;
  const year = displayDate.getUTCFullYear();
  const month = displayDate.getUTCMonth();
  timeMachineCalendarMonthEl.textContent = new Intl.DateTimeFormat(timeMachineCalendarLocale(), {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(displayDate);
  timeMachineCalendarGridEl.replaceChildren();
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const dayCount = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const monthDays = (timeMachineCalendarDaysByYear[String(year)] || [])
    .filter((entry) => Number(entry.date.slice(5, 7)) === month + 1);
  const maxCount = Math.max(...monthDays.map((entry) => entry.count || 0), 1);
  const timeline = timeMachineCalendarTimelineMatchesAddress() ? timeMachineCalendarTimeline : null;
  const firstAvailable = String(timeline?.firstCapturedAt || "").slice(0, 10);
  const lastAvailable = String(timeline?.lastCapturedAt || "").slice(0, 10);
  for (let index = 0; index < firstWeekday; index += 1) {
    const blank = document.createElement("span");
    blank.className = "time-machine-calendar-blank";
    blank.setAttribute("aria-hidden", "true");
    timeMachineCalendarGridEl.append(blank);
  }
  for (let day = 1; day <= dayCount; day += 1) {
    const date = timeMachineCalendarDateKey(year, month, day);
    const dayData = timeMachineCalendarDayData(year, date);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "time-machine-calendar-day";
    button.dataset.date = date;
    if (date === timeMachineDateInput?.value) button.classList.add("is-selected");
    if (dayData) {
      button.classList.add("has-captures");
      button.dataset.density = String(Math.max(1, Math.ceil((dayData.count / maxCount) * 4)));
    }
    const outsideRange = !timeline
      || (firstAvailable && date < firstAvailable)
      || (lastAvailable && date > lastAvailable)
      || date > timeMachineToday();
    button.disabled = !!outsideRange;
    const number = document.createElement("span");
    number.textContent = String(day);
    button.append(number);
    if (dayData) {
      const count = document.createElement("small");
      count.textContent = String(dayData.count);
      button.append(count);
    }
    const accessibleLabel = dayData
      ? t("time_machine_day_captures", timeMachineCalendarDateLabel(date), dayData.count)
      : t("time_machine_day_nearest", timeMachineCalendarDateLabel(date));
    button.setAttribute("aria-label", accessibleLabel);
    button.title = accessibleLabel;
    button.addEventListener("click", () => timeMachineChooseCalendarDate(date, dayData));
    timeMachineCalendarGridEl.append(button);
  }
  const occupied = firstWeekday + dayCount;
  const trailing = (7 - (occupied % 7)) % 7;
  for (let index = 0; index < trailing; index += 1) {
    const blank = document.createElement("span");
    blank.className = "time-machine-calendar-blank";
    blank.setAttribute("aria-hidden", "true");
    timeMachineCalendarGridEl.append(blank);
  }
  if (timeMachineCalendarPreviousButton) {
    timeMachineCalendarPreviousButton.disabled = !timeline || !!(firstAvailable
      && timeMachineCalendarDateKey(year, month, 1) <= firstAvailable.slice(0, 8) + "01");
  }
  if (timeMachineCalendarNextButton) {
    timeMachineCalendarNextButton.disabled = !timeline || !!(lastAvailable
      && timeMachineCalendarDateKey(year, month, 1) >= lastAvailable.slice(0, 8) + "01");
  }
}

function timeMachineRenderArchiveCalendar() {
  timeMachineRenderCalendarSummary();
  timeMachineRenderCalendarWeekdays();
  timeMachineRenderYearStrip();
  timeMachineRenderMonthCalendar();
}

async function timeMachineLoadArchiveCalendar(year = 0) {
  const address = timeMachineCalendarAddress();
  if (!address) {
    timeMachineCalendarUrl = "";
    timeMachineCalendarTimeline = null;
    timeMachineCalendarDaysByYear = Object.create(null);
    timeMachineSetCalendarStatus("");
    timeMachineRenderArchiveCalendar();
    return false;
  }
  const selectedDate = timeMachineCalendarDisplayDate
    || timeMachineCalendarDate(timeMachineDateInput?.value)
    || timeMachineCalendarDate(timeMachineToday());
  const selectedYear = Number(year || selectedDate?.getUTCFullYear() || new Date().getUTCFullYear());
  if (timeMachineCalendarUrl !== address) {
    timeMachineCalendarRequest?.abort();
    timeMachineCalendarUrl = address;
    timeMachineCalendarTimeline = null;
    timeMachineCalendarDaysByYear = Object.create(null);
  }
  if (timeMachineCalendarTimeline && timeMachineCalendarDaysByYear[String(selectedYear)]) {
    timeMachineRenderArchiveCalendar();
    return true;
  }
  timeMachineCalendarRequest?.abort();
  const controller = new AbortController();
  timeMachineCalendarRequest = controller;
  timeMachineSetCalendarStatus(t("time_machine_calendar_loading"));
  try {
    const params = new URLSearchParams({ url: address, year: String(selectedYear) });
    const result = await timeMachineFetchJson(`/api/time-machine/calendar?${params}`, controller.signal);
    if (controller.signal.aborted) return false;
    if (result.timeline) timeMachineCalendarTimeline = result.timeline;
    timeMachineCalendarDaysByYear[String(selectedYear)] = result.days || [];
    const first = String(timeMachineCalendarTimeline?.firstCapturedAt || "").slice(0, 10);
    const last = String(timeMachineCalendarTimeline?.lastCapturedAt || "").slice(0, 10);
    const selectedKey = timeMachineDateInput?.value || "";
    if (first && last && (!selectedKey || selectedKey < first || selectedKey > last)) {
      timeMachineCalendarDisplayDate = timeMachineCalendarDate(last);
    }
    timeMachineUpdateDateRange();
    timeMachineSetCalendarStatus(
      result.timelineError || result.calendarError ? t("time_machine_calendar_partial") : ""
    );
    timeMachineRenderArchiveCalendar();
    return true;
  } catch (error) {
    if (error?.name === "AbortError") return false;
    timeMachineSetCalendarStatus(t("time_machine_calendar_error"), "error");
    timeMachineRenderArchiveCalendar();
    return false;
  } finally {
    if (timeMachineCalendarRequest === controller) timeMachineCalendarRequest = null;
  }
}

function timeMachineShiftCalendarMonth(delta) {
  const current = timeMachineCalendarDisplayDate
    || timeMachineCalendarDate(timeMachineDateInput?.value)
    || timeMachineCalendarDate(timeMachineToday());
  if (!current) return;
  timeMachineCalendarDisplayDate = new Date(Date.UTC(
    current.getUTCFullYear(),
    current.getUTCMonth() + delta,
    1
  ));
  timeMachineLoadArchiveCalendar(timeMachineCalendarDisplayDate.getUTCFullYear());
}

function timeMachineSetDatePopover(open) {
  if (!timeMachineDatePopover || !timeMachineCalendarButton) return;
  const visible = !!open;
  timeMachineDatePopover.hidden = !visible;
  timeMachineCalendarButton.setAttribute("aria-expanded", String(visible));
  if (visible) {
    timeMachineCalendarDisplayDate = timeMachineCalendarDate(timeMachineDateInput?.value)
      || timeMachineCalendarDate(timeMachineToday());
    timeMachineRenderArchiveCalendar();
    timeMachineLoadArchiveCalendar();
    timeMachineCalendarPreviousButton?.focus();
  } else {
    timeMachineCalendarRequest?.abort();
  }
}

// The title bar carries the date next to the page title, so it wants the day,
// not the snapshot's clock time — otherwise the time eats the title.
function timeMachineCapturedDayLabel(value) {
  if (!value) return t("time_machine_unknown_date");
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return t("time_machine_unknown_date");
  return parsed.toLocaleDateString();
}

function timeMachineCapturedLabel(value) {
  if (!value) return t("time_machine_unknown_date");
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return t("time_machine_unknown_date");
  return parsed.toLocaleString();
}

function timeMachineUpdateWindowTitle(page = null, archive = null, targetDate = "", live = false) {
  if (!timeMachineTitleEl) return;
  const pageTitle = page?.title || page?.reader?.title || "";
  if (archive) {
    timeMachineTitleEl.textContent = t(
      "time_machine_title_archive",
      timeMachineCapturedDayLabel(archive.capturedAt),
      pageTitle || t("time_machine")
    );
    return;
  }
  if (targetDate) {
    timeMachineTitleEl.textContent = t("time_machine_title_target", targetDate);
    return;
  }
  if (page || live) {
    timeMachineTitleEl.textContent = t("time_machine_title_live", pageTitle || t("time_machine"));
    return;
  }
  timeMachineTitleEl.textContent = t("time_machine");
}

function activeTimeMachineTab(project = getActiveProject()) {
  return typeof getActiveDocumentTab === "function" ? getActiveDocumentTab("timeMachine", project) : null;
}

function getTimeMachineTabs(project = getActiveProject()) {
  return typeof getDocumentTabs === "function" ? getDocumentTabs("timeMachine", project) : [];
}

function createTimeMachineTab(options = {}) {
  const project = getActiveProject();
  if (!project) return null;
  const tab = upsertDocumentTab("timeMachine", "web_navigation", {
    title: options.title || t("time_machine_new_tab"),
    backing: {
      type: "webNavigation",
      id: crypto.randomUUID(),
      url: options.url || "",
    },
    state: {
      address: options.url || "",
      archiveEnabled: !!options.archiveEnabled,
      targetDate: options.targetDate || "",
      providerPreference: options.providerPreference || timeMachineProviderInput?.value || "auto",
      history: [],
      historyIndex: -1,
      viewMode: "web",
      page: null,
    },
    forceNew: true,
  }, project);
  renderTimeMachineTabs(project);
  saveDeskState();
  return tab;
}

function captureActiveTimeMachineTabState() {
  const tab = activeTimeMachineTab();
  if (!tab) return;
  const previousState = tab.state || {};
  tab.title = currentTimeMachinePage?.title || tab.title || t("time_machine_new_tab");
  tab.backing = {
    ...(tab.backing || {}),
    type: "webNavigation",
    url: timeMachineAddressInput?.value || previousState.address || "",
  };
  tab.state = {
    ...previousState,
    address: timeMachineAddressInput?.value || "",
    archiveEnabled: !!timeMachineEnabledInput?.checked,
    targetDate: timeMachineDateInput?.value || "",
    providerPreference: timeMachineProviderInput?.value || "auto",
    viewMode: currentTimeMachineView,
    page: currentTimeMachinePage ? {
      title: currentTimeMachinePage.title || "",
      url: currentTimeMachinePage.url || "",
      fetchedUrl: currentTimeMachinePage.fetchedUrl || "",
      reader: currentTimeMachinePage.reader || null,
      retrievedAt: currentTimeMachinePage.retrievedAt || "",
      archive: currentTimeMachinePage.archive || null,
    } : null,
    readerScrollTop: timeMachineReaderEl?.scrollTop || 0,
  };
  tab.updatedAt = new Date().toISOString();
}

function renderTimeMachineTabs(project = getActiveProject()) {
  if (!timeMachineTabsEl) return;
  const tabs = getTimeMachineTabs(project);
  renderTdiTabStrip(timeMachineTabsEl, tabs, {
    activeId: project?.activeDocumentTabIds?.timeMachine,
    labelFor: (tab, index) => `${index + 1}. ${tab.title || t("time_machine_new_tab")}`,
    sublabelFor: (tab) => {
      const state = tab.state || {};
      if (state.archiveEnabled) return `${timeMachineProviderLabel(state.page?.archive?.provider || state.providerPreference)} · ${state.targetDate || t("time_machine_past")}`;
      try {
        return new URL(state.address || tab.backing?.url || "").hostname.replace(/^www\./, "");
      } catch {
        return t("time_machine_live");
      }
    },
    closableFor: () => tabs.length > 1,
    onOpen: (tab) => openTimeMachineTab(tab.id),
    onClose: (tab) => closeTimeMachineTab(tab.id),
    onMove: (tabId, targetTabId) => {
      if (!moveDocumentTab("timeMachine", tabId, targetTabId, project)) return;
      renderTimeMachineTabs(project);
      saveDeskState();
    },
  });
}

function closeTimeMachineTab(tabId) {
  const project = getActiveProject();
  captureActiveTimeMachineTabState();
  const result = removeDocumentTab("timeMachine", tabId, project);
  if (!result) return false;
  renderTimeMachineTabs(project);
  if (result.wasActive && result.next) openTimeMachineTab(result.next.id);
  if (result.wasActive && !result.next) timeMachineShowHome();
  saveDeskState();
  return true;
}

function timeMachineApplyTabControls(tab) {
  const state = tab?.state || {};
  timeMachineAddressInput.value = state.address || tab?.backing?.url || "";
  timeMachineEnabledInput.checked = !!state.archiveEnabled;
  timeMachineDateInput.value = state.targetDate || "";
  currentTimeMachineView = state.viewMode === "reader" ? "reader" : "web";
  timeMachineTimeBandEl.classList.toggle("is-active", !!state.archiveEnabled);
  timeMachineUpdateDateRange();
  timeMachineUpdateSourceSwitch(state.providerPreference);
}

async function openTimeMachineTab(tabId) {
  const project = getActiveProject();
  const next = getTimeMachineTabs(project).find((tab) => tab.id === tabId);
  if (!next) return false;
  if (activeTimeMachineTab(project)?.id !== tabId) captureActiveTimeMachineTabState();
  setActiveDocumentTab("timeMachine", tabId, project);
  timeMachineApplyTabControls(next);
  currentTimeMachinePage = null;
  renderTimeMachineTabs(project);
  const address = next.state?.address || next.backing?.url || "";
  if (address) {
    await timeMachineNavigate(address, {
      fromHistory: true,
      restoreState: next.state,
    });
  } else {
    timeMachineShowHome();
  }
  return true;
}

function timeMachineHistoryState() {
  const tab = activeTimeMachineTab();
  if (!tab) return { history: [], historyIndex: -1 };
  if (!Array.isArray(tab.state.history)) tab.state.history = [];
  if (!Number.isInteger(tab.state.historyIndex)) tab.state.historyIndex = tab.state.history.length - 1;
  return tab.state;
}

function timeMachinePushHistory(entry) {
  const state = timeMachineHistoryState();
  state.history = state.history.slice(0, state.historyIndex + 1);
  state.history.push(entry);
  if (state.history.length > 80) state.history.shift();
  state.historyIndex = state.history.length - 1;
}

function timeMachineUpdateNavigationButtons() {
  const state = timeMachineHistoryState();
  if (timeMachineBackButton) timeMachineBackButton.disabled = state.historyIndex <= 0;
  if (timeMachineForwardButton) timeMachineForwardButton.disabled = state.historyIndex < 0 || state.historyIndex >= state.history.length - 1;
  if (timeMachineStopButton) timeMachineStopButton.disabled = !currentTimeMachineRequest;
}

function timeMachineSetLoading(active, message = "") {
  if (timeMachineLoadingEl) {
    timeMachineLoadingEl.hidden = !active;
    if (message) timeMachineLoadingEl.textContent = message;
  }
  if (timeMachineStopButton) timeMachineStopButton.disabled = !active;
  if (active) document.body.classList.add("is-busy");
  else document.body.classList.remove("is-busy");
}

// Time Machine's receipts belong in Time Machine. They still go through
// setStatus so the desktop notification pipeline sees them, but the window
// says them itself rather than relying on ClioTalk's details bar being open.
function timeMachineSetStatus(message, options = {}) {
  if (!message) return;
  // "Ready" is the absence of news, the same reading the desktop status line
  // takes: no receipt, just the provenance the slot normally shows.
  const idle = String(message).trim() === String(t("ready") || "").trim();
  if (timeMachineProvenanceEl) {
    window.clearTimeout(timeMachineReceiptTimer);
    if (idle) {
      renderTimeMachineProvenance();
    } else {
      timeMachineProvenanceEl.textContent = message;
      timeMachineProvenanceEl.classList.add("is-receipt");
      timeMachineProvenanceEl.classList.toggle("is-error", options.error === true);
      timeMachineReceiptTimer = window.setTimeout(renderTimeMachineProvenance, 6000);
    }
  }
  // A failure is a notification, not just a line that scrolls past. Saying so
  // explicitly beats setStatus sniffing the wording for "failed" / "无法".
  if (typeof setStatus === "function") {
    setStatus(message, options.error === true ? { notify: true } : {});
  }
}

// Which snapshot is on screen. Lives in the navigation row's former spacer, so
// the web view no longer hides what year it is showing.
function renderTimeMachineProvenance() {
  if (!timeMachineProvenanceEl) return;
  window.clearTimeout(timeMachineReceiptTimer);
  timeMachineProvenanceEl.classList.remove("is-receipt", "is-error");
  const page = currentTimeMachinePage;
  if (!page) {
    timeMachineProvenanceEl.textContent = "";
    return;
  }
  // Division of labour with the title bar, which already reads
  // "<capture date> · <page title>": the title says when and what, this says
  // which archive it came from — the one thing the title cannot carry.
  timeMachineProvenanceEl.textContent = page.archive
    ? timeMachineProviderLabel(page.archive.provider)
    : t("time_machine_live");
}

function timeMachineSetReaderActions(enabled) {
  [
    timeMachineReaderViewButton,
    timeMachineClipButton,
    timeMachineClipTranslateButton,
    timeMachineDocMapButton,
    timeMachineSendManuscriptButton,
  ].forEach((button) => {
    if (button) button.disabled = !enabled;
  });
  // The ask bar's own input and button are owned by describeTimeMachineAskScope
  // so all five ask bars gate on the same rule.
  refreshAskBar("timeMachine");
  renderTimeMachineProvenance();
}

function timeMachineShowHome() {
  currentTimeMachinePage = null;
  currentTimeMachineView = "web";
  timeMachineUpdateWindowTitle();
  if (timeMachineHomeEl) {
    timeMachineHomeEl.hidden = false;
    const copy = timeMachineHomeEl.querySelector(".time-machine-home-copy");
    if (copy) {
      copy.querySelector("h3").textContent = t("time_machine_home_title");
      copy.querySelector("p").textContent = t("time_machine_home_body");
    }
  }
  if (timeMachineFrameEl) {
    timeMachineFrameEl.removeAttribute("src");
    timeMachineFrameEl.srcdoc = "";
    delete timeMachineFrameEl.dataset.frameReady;
    timeMachineFrameEl.classList.remove("is-hidden");
  }
  timeMachineReaderEl?.classList.add("is-hidden");
  timeMachineSetReaderActions(false);
  timeMachineSetStatus(t("ready"));
  timeMachineUpdateDateRange();
  timeMachineUpdateSourceSwitch();
  timeMachineSyncViewButtons();
  timeMachineUpdateNavigationButtons();
}

/**
 * The frame loads through /api/time-machine/render rather than being handed
 * an assembled srcdoc string, because a srcdoc document inherits the app's
 * own (stricter) global CSP on top of any it declares, so an <img> allowance
 * meant for archived pages never actually took effect — see
 * src/server/time-machine.js's renderTimeMachineFrameDocument for the shell
 * this endpoint wraps the page in.
 */
function timeMachineFrameRenderUrl(page) {
  const params = new URLSearchParams({
    url: page?.fetchedUrl || page?.url || "",
    original: page?.url || "",
  });
  return `/api/time-machine/render?${params}`;
}

function timeMachineRenderReader() {
  const reader = currentTimeMachinePage?.reader;
  timeMachineReaderEl.replaceChildren();
  if (!reader?.text?.trim()) {
    const empty = document.createElement("div");
    empty.className = "empty-folder-note";
    empty.textContent = t("time_machine_reader_unavailable");
    timeMachineReaderEl.append(empty);
    return;
  }
  const title = document.createElement("h1");
  title.textContent = reader.title || currentTimeMachinePage.title || t("time_machine");
  const meta = document.createElement("div");
  meta.className = "time-machine-reader-meta";
  const archive = currentTimeMachinePage.archive;
  meta.textContent = archive
    ? `${timeMachineProviderLabel(archive.provider)} · ${timeMachineCapturedLabel(archive.capturedAt)} · ${currentTimeMachinePage.url}`
    : currentTimeMachinePage.url;
  const body = document.createElement("div");
  body.className = "reader-body-content";
  body.innerHTML = markdownToSystemHtml(reader.text);
  const partial = reader.completeness === "partial";
  if (partial) {
    const warning = document.createElement("p");
    warning.className = "hint control-status";
    warning.setAttribute("role", "status");
    warning.textContent = t("time_machine_reader_partial");
    timeMachineReaderEl.append(title, meta, warning, body);
    return;
  }
  timeMachineReaderEl.append(title, meta, body);
}

function timeMachineSyncViewButtons() {
  const reading = currentTimeMachineView === "reader";
  timeMachineFrameEl?.classList.toggle("is-hidden", reading);
  timeMachineReaderEl?.classList.toggle("is-hidden", !reading);
  timeMachineWebViewButton?.setAttribute("aria-pressed", reading ? "false" : "true");
  timeMachineReaderViewButton?.setAttribute("aria-pressed", reading ? "true" : "false");
}

function showTimeMachineWebView() {
  currentTimeMachineView = "web";
  timeMachineSyncViewButtons();
  captureActiveTimeMachineTabState();
  saveDeskState();
}

function showTimeMachineReaderView() {
  if (!currentTimeMachinePage?.reader?.text) {
    timeMachineSetStatus(t("time_machine_reader_unavailable"), { error: true });
    return;
  }
  currentTimeMachineView = "reader";
  timeMachineRenderReader();
  timeMachineSyncViewButtons();
  captureActiveTimeMachineTabState();
  saveDeskState();
}

function timeMachineApplyPage(page, archive = null, restoreState = null) {
  currentTimeMachinePage = {
    ...page,
    archive,
    kind: archive ? "archiveSnapshot" : "web",
  };
  currentTimeMachineClipCount = 0;
  timeMachineUpdateWindowTitle(page, archive);
  timeMachineAddressInput.value = page.url || timeMachineAddressInput.value;
  timeMachineHomeEl.hidden = true;
  // A present-but-empty srcdoc attribute still wins over src per spec, so
  // the frame would keep rendering blank about:srcdoc — must fully remove
  // the attribute, not just clear its value.
  timeMachineFrameEl.removeAttribute("srcdoc");
  delete timeMachineFrameEl.dataset.frameReady;
  timeMachineFrameEl.src = timeMachineFrameRenderUrl(currentTimeMachinePage);
  timeMachineRenderReader();
  currentTimeMachineView = restoreState?.viewMode === "reader" && page.reader?.text ? "reader" : currentTimeMachineView;
  timeMachineSyncViewButtons();
  timeMachineSetReaderActions(!!page.reader?.text);
  timeMachineUpdateSourceSwitch(archive?.provider || "");
  const tab = activeTimeMachineTab();
  if (tab) {
    tab.title = page.title || page.url || t("time_machine_new_tab");
    tab.backing.url = page.url || "";
  }
  renderTimeMachineTabs();
  captureActiveTimeMachineTabState();
  saveDeskState();
  if (restoreState?.readerScrollTop) {
    requestAnimationFrame(() => {
      timeMachineReaderEl.scrollTop = Number(restoreState.readerScrollTop) || 0;
    });
  }
}

async function timeMachineFetchJson(url, signal) {
  const response = await fetch(url, { signal });
  const text = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }
  if (!response.ok) throw new Error(serviceErrorDetail(response.status, text));
  // A 200 carrying something other than JSON is a gateway page standing in for
  // this app's API, not an answer from it.
  if (!payload) throw new Error(serviceErrorDetail(response.status, text));
  return payload;
}

async function timeMachineNavigate(value, options = {}) {
  let originalUrl;
  try {
    originalUrl = timeMachineNormalizeAddress(timeMachineUnwrapArchiveUrl(value));
  } catch {
    timeMachineSetStatus(t("time_machine_invalid_url"), { error: true });
    return false;
  }
  let tab = activeTimeMachineTab();
  if (!tab) tab = createTimeMachineTab({ url: originalUrl });
  if (!tab) {
    timeMachineSetStatus(t("no_project_mounted"), { error: true });
    return false;
  }

  const archiveEnabled = options.capture ? true : !!timeMachineEnabledInput.checked;
  const targetDate = options.capture?.capturedAt?.slice?.(0, 10) || timeMachineDateInput.value || "";
  const providerPreference = options.capture?.provider
    || options.providerPreference
    || timeMachineProviderInput?.value
    || "auto";
  if (archiveEnabled && !targetDate && !options.capture) {
    timeMachineDateInput.value = timeMachineToday();
  }
  tab.state.address = originalUrl;
  tab.state.archiveEnabled = archiveEnabled;
  tab.state.targetDate = timeMachineDateInput.value || targetDate;
  tab.state.providerPreference = providerPreference;
  timeMachineAddressInput.value = originalUrl;
  timeMachineTimeBandEl.classList.toggle("is-active", archiveEnabled);
  timeMachineUpdateDateRange();
  timeMachineUpdateSourceSwitch(providerPreference);
  timeMachineUpdateWindowTitle(null, null, archiveEnabled ? tab.state.targetDate : "", !archiveEnabled);
  if (!options.fromHistory) {
    timeMachinePushHistory({
      url: originalUrl,
      archiveEnabled,
      targetDate: tab.state.targetDate,
      providerPreference,
      capture: options.capture || null,
    });
  }
  timeMachineUpdateNavigationButtons();

  currentTimeMachineRequest?.abort();
  const controller = new AbortController();
  currentTimeMachineRequest = controller;
  timeMachineSetLoading(true, archiveEnabled ? t("time_machine_finding_capture") : t("time_machine_loading_live"));
  timeMachineSetStatus(archiveEnabled ? t("time_machine_finding_capture") : t("time_machine_loading_live"));
  try {
    let capture = options.capture || null;
    let captureCandidates = capture ? [capture] : [];
    let providerStatus = "";
    if (archiveEnabled && !capture) {
      const params = new URLSearchParams({
        url: originalUrl,
        date: tab.state.targetDate,
        provider: providerPreference,
      });
      const captureResult = await timeMachineFetchJson(`/api/time-machine/captures?${params}`, controller.signal);
      timeMachineUpdateDateRange();
      capture = captureResult.closest || null;
      const seenProviders = new Set();
      captureCandidates = [capture, ...(captureResult.captures || [])].filter((candidate) => {
        const provider = timeMachineCanonicalProvider(candidate?.provider);
        if (!candidate?.snapshotUrl || !provider || seenProviders.has(provider)) return false;
        seenProviders.add(provider);
        return true;
      });
      providerStatus = Object.entries(captureResult.providers || {})
        .map(([provider, state]) => `${timeMachineProviderLabel(provider)}: ${state.status === "ready" ? state.count : t(`time_machine_provider_${state.status}`)}`)
        .join(" · ");
      if (!capture) {
        const details = Object.values(captureResult.providers || {}).map((state) => state.detail).filter(Boolean);
        throw new Error(details[0] || t("time_machine_no_capture"));
      }
    }
    let page = null;
    let browseError = null;
    let partialFallback = null;
    let pageFallback = null;
    const browseCandidates = archiveEnabled ? captureCandidates : [null];
    for (const candidate of browseCandidates) {
      try {
        const browseTarget = candidate?.browseUrl || candidate?.snapshotUrl || originalUrl;
        const browseParams = new URLSearchParams({ url: browseTarget, original: originalUrl });
        page = await timeMachineFetchJson(`/api/time-machine/browse?${browseParams}`, controller.signal);
        let resolvedCapture = candidate;
        const replayCapturedAt = timeMachineCanonicalProvider(candidate?.provider) === "wayback"
          ? timeMachineWaybackCapturedAt(page?.fetchedUrl)
          : "";
        if (replayCapturedAt) resolvedCapture = { ...candidate, capturedAt: replayCapturedAt };
        if (archiveEnabled && page?.reader?.completeness !== "complete") {
          const fallback = { page, capture: resolvedCapture };
          if (page?.reader?.completeness === "partial") partialFallback ||= fallback;
          else pageFallback ||= fallback;
          page = null;
          continue;
        }
        capture = resolvedCapture;
        break;
      } catch (error) {
        if (error?.name === "AbortError") throw error;
        browseError = error;
      }
    }
    if (!page && (partialFallback || pageFallback)) {
      const fallback = partialFallback || pageFallback;
      page = fallback.page;
      capture = fallback.capture;
    }
    if (!page) throw browseError || new Error(t("time_machine_no_capture"));
    if (controller.signal.aborted) return false;
    timeMachineApplyPage(page, capture, options.restoreState || null);
    timeMachineSetStatus(
      page.reader?.completeness === "partial"
        ? t("time_machine_reader_partial_status")
        : archiveEnabled ? t("time_machine_browsing_past") : t("time_machine_browsing_live"),
      providerStatus || (capture ? timeMachineProviderLabel(capture.provider) : "")
    );
    return true;
  } catch (error) {
    if (error?.name === "AbortError") return false;
    currentTimeMachinePage = null;
    timeMachineFrameEl.removeAttribute("src");
    timeMachineFrameEl.srcdoc = "";
    delete timeMachineFrameEl.dataset.frameReady;
    timeMachineReaderEl.replaceChildren();
    timeMachineReaderEl.classList.add("is-hidden");
    timeMachineFrameEl.classList.remove("is-hidden");
    timeMachineSetReaderActions(false);
    timeMachineHomeEl.hidden = false;
    const copy = timeMachineHomeEl.querySelector(".time-machine-home-copy");
    if (copy) {
      copy.querySelector("h3").textContent = t("time_machine_could_not_open");
      copy.querySelector("p").textContent = error.message;
    }
    timeMachineSetStatus(t("time_machine_could_not_open"));
    timeMachineSetStatus(t("time_machine_error", error.message), { error: true });
    return false;
  } finally {
    // A superseded request (address/date/checkbox changes each fire their
    // own navigate) must not clear the loading flag for the request that
    // replaced it — otherwise the UI reports "done loading" while the real,
    // still-in-flight navigation is the one actually filling the frame.
    if (currentTimeMachineRequest === controller) {
      currentTimeMachineRequest = null;
      timeMachineSetLoading(false);
    }
    timeMachineUpdateNavigationButtons();
  }
}

function prepareTimeMachineBlankLaunch() {
  if (timeMachineLaunchPrepared) return activeTimeMachineTab();
  const project = getActiveProject();
  if (!project) return null;
  let blank = getTimeMachineTabs(project).find((tab) => {
    const address = tab.state?.address || tab.backing?.url || "";
    return !String(address).trim();
  });
  if (!blank) blank = createTimeMachineTab();
  if (!blank) return null;
  setActiveDocumentTab("timeMachine", blank.id, project);
  blank.title = t("time_machine_new_tab");
  blank.backing.url = "";
  blank.state = {
    ...(blank.state || {}),
    address: "",
    archiveEnabled: false,
    targetDate: "",
    providerPreference: timeMachineProviderInput?.value || "auto",
    history: [],
    historyIndex: -1,
    viewMode: "web",
    page: null,
  };
  timeMachineApplyTabControls(blank);
  timeMachineAddressInput.value = "";
  timeMachineShowHome();
  renderTimeMachineTabs(project);
  timeMachineLaunchPrepared = true;
  saveDeskState();
  return blank;
}

function openTimeMachineWindow() {
  const project = getActiveProject();
  const firstLaunch = !timeMachineLaunchPrepared;
  let active = firstLaunch ? prepareTimeMachineBlankLaunch() : activeTimeMachineTab(project);
  if (!active) active = createTimeMachineTab();
  renderTimeMachineTabs(project);
  openWindow("timeMachine");
  if (active && !firstLaunch) {
    timeMachineApplyTabControls(active);
    if (active.state?.address && !currentTimeMachinePage) {
      openTimeMachineTab(active.id);
    } else if (!active.state?.address) {
      timeMachineShowHome();
    }
  }
  timeMachineAddressInput?.focus();
}

function newTimeMachineTab() {
  captureActiveTimeMachineTabState();
  const tab = createTimeMachineTab();
  if (tab) openTimeMachineTab(tab.id);
  timeMachineAddressInput?.focus();
}

function stopTimeMachineNavigation() {
  currentTimeMachineRequest?.abort();
  currentTimeMachineRequest = null;
  timeMachineSetLoading(false);
  timeMachineSetStatus(t("time_machine_stopped"));
  timeMachineUpdateNavigationButtons();
}

function refreshTimeMachinePage() {
  const address = timeMachineAddressInput?.value || activeTimeMachineTab()?.state?.address || "";
  if (address) timeMachineNavigate(address, { fromHistory: true });
}

function switchTimeMachineSource() {
  const address = timeMachineAddressInput?.value?.trim() || "";
  if (!timeMachineEnabledInput?.checked || !address) return false;
  const current = timeMachineEffectiveProvider();
  const next = current === "wayback" ? "archive-is" : "wayback";
  const state = timeMachineHistoryState();
  if (state.historyIndex >= 0 && state.history[state.historyIndex]) {
    state.history[state.historyIndex].providerPreference = next;
    state.history[state.historyIndex].capture = null;
  }
  if (activeTimeMachineTab()) activeTimeMachineTab().state.providerPreference = next;
  timeMachineUpdateSourceSwitch(next);
  timeMachineNavigate(address, { fromHistory: true, providerPreference: next });
  return true;
}

function goBackTimeMachine() {
  const state = timeMachineHistoryState();
  if (state.historyIndex <= 0) return;
  state.historyIndex -= 1;
  const entry = state.history[state.historyIndex];
  timeMachineEnabledInput.checked = !!entry.archiveEnabled;
  timeMachineDateInput.value = entry.targetDate || "";
  timeMachineNavigate(entry.url, {
    fromHistory: true,
    capture: entry.capture || null,
    providerPreference: entry.providerPreference || "auto",
  });
}

function goForwardTimeMachine() {
  const state = timeMachineHistoryState();
  if (state.historyIndex >= state.history.length - 1) return;
  state.historyIndex += 1;
  const entry = state.history[state.historyIndex];
  timeMachineEnabledInput.checked = !!entry.archiveEnabled;
  timeMachineDateInput.value = entry.targetDate || "";
  timeMachineNavigate(entry.url, {
    fromHistory: true,
    capture: entry.capture || null,
    providerPreference: entry.providerPreference || "auto",
  });
}

function toggleTimeMachineArchiveMode() {
  timeMachineEnabledInput.checked = !timeMachineEnabledInput.checked;
  timeMachineHandleModeChange();
}

function timeMachineHandleModeChange() {
  const enabled = !!timeMachineEnabledInput.checked;
  timeMachineTimeBandEl.classList.toggle("is-active", enabled);
  if (enabled && !timeMachineDateInput.value) timeMachineDateInput.value = timeMachineToday();
  captureActiveTimeMachineTabState();
  timeMachineUpdateDateRange();
  timeMachineUpdateSourceSwitch();
  const address = timeMachineAddressInput.value.trim();
  if (address) timeMachineNavigate(address);
}

function timeMachineHandleDateChange() {
  timeMachineCalendarDisplayDate = timeMachineCalendarDate(timeMachineDateInput?.value);
  captureActiveTimeMachineTabState();
  timeMachineUpdateDateRange();
  if (timeMachineDatePopover && !timeMachineDatePopover.hidden) {
    timeMachineLoadArchiveCalendar(timeMachineCalendarDisplayDate?.getUTCFullYear());
  }
  if (timeMachineEnabledInput.checked && timeMachineAddressInput.value.trim()) {
    timeMachineNavigate(timeMachineAddressInput.value);
  }
}

// A selection inside the reader view narrows the question to that passage (see
// askTimeMachineSource); otherwise the whole readable page goes.
function describeTimeMachineAskScope() {
  const page = currentTimeMachinePage;
  if (!page?.reader?.text) return { ready: false };
  const selection = timeMachineReaderSelection().text;
  return {
    ready: true,
    object: page.reader.title || page.title || t("time_machine"),
    range: selection ? t("ask_scope_selection") : t("ask_scope_whole_page"),
  };
}

function timeMachineReaderSelection() {
  const selection = window.getSelection();
  if (!selection?.rangeCount || currentTimeMachineView !== "reader") return { selection: null, text: "" };
  const anchor = selection.anchorNode?.nodeType === Node.ELEMENT_NODE ? selection.anchorNode : selection.anchorNode?.parentElement;
  const focus = selection.focusNode?.nodeType === Node.ELEMENT_NODE ? selection.focusNode : selection.focusNode?.parentElement;
  if (!anchor || !focus || !timeMachineReaderEl.contains(anchor) || !timeMachineReaderEl.contains(focus)) {
    return { selection: null, text: "" };
  }
  return { selection, text: selection.toString().trim() };
}

function timeMachineSelectionContext(selection, text, radius = 220) {
  const fullText = (timeMachineReaderEl.querySelector(".reader-body-content")?.innerText || currentTimeMachinePage?.reader?.text || "")
    .replace(/\s+/g, " ").trim();
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  const index = fullText.indexOf(normalized);
  if (!selection || index < 0) return { before: "", selected: text, after: "", text };
  const before = fullText.slice(Math.max(0, index - radius), index).trim();
  const after = fullText.slice(index + normalized.length, index + normalized.length + radius).trim();
  return { before, selected: text, after, text: [before, text, after].filter(Boolean).join(" ") };
}

function timeMachineSourceContract(context, selectedText, capturedAt) {
  const page = currentTimeMachinePage;
  const archive = page?.archive;
  return {
    type: "reader-clip",
    readerKind: archive ? "archiveSnapshot" : "web",
    sourceKind: archive ? "archive_snapshot" : "web",
    title: page?.reader?.title || page?.title || t("time_machine"),
    sourceTitle: page?.reader?.title || page?.title || t("time_machine"),
    url: archive?.snapshotUrl || page?.url || "",
    originalUrl: page?.url || "",
    snapshotUrl: archive?.snapshotUrl || "",
    archiveProvider: archive?.provider || "",
    readerCompleteness: page?.reader?.completeness || "unavailable",
    targetDate: timeMachineDateInput.value || "",
    snapshotTimestamp: archive?.capturedAt || "",
    site: (() => {
      try {
        return new URL(page?.url || "").hostname.replace(/^www\./, "");
      } catch {
        return "";
      }
    })(),
    author: page?.reader?.author || "",
    date: page?.reader?.date || "",
    capturedAt,
    retrievedAt: page?.retrievedAt || capturedAt,
    nearbyContext: context,
    selectedText,
  };
}

function timeMachinePreservationDestination(provider, url) {
  if (provider === "wayback") return `https://web.archive.org/save/${url}`;
  if (provider === "archive-is") return `https://archive.is/?run=1&url=${encodeURIComponent(url)}`;
  return "";
}

function preserveCurrentTimeMachinePage(provider) {
  const page = currentTimeMachinePage;
  if (!page?.url) {
    timeMachineSetStatus(t("time_machine_preserve_no_page"), { error: true });
    return false;
  }
  if (page.archive || timeMachineEnabledInput?.checked) {
    timeMachineSetStatus(t("time_machine_preserve_live_only"), { error: true });
    return false;
  }
  const destination = timeMachinePreservationDestination(provider, page.url);
  const link = provider === "wayback" ? timeMachineSaveWaybackLink : timeMachineSaveArchiveIsLink;
  if (!destination || !link) return false;

  const requestedAt = new Date().toISOString();
  const providerLabel = timeMachineProviderLabel(provider);
  const title = page.reader?.title || page.title || page.url;
  let site = "";
  try {
    site = new URL(page.url).hostname.replace(/^www\./, "");
  } catch {
    site = "";
  }
  const scrap = createScrap(
    t("time_machine_preservation_record_title", title),
    [
      t("time_machine_preservation_record_body"),
      "",
      `Source: ${title}`,
      site ? `Site: ${site}` : "",
      `URL: ${page.url}`,
      `Archive provider: ${providerLabel}`,
      `Requested at: ${requestedAt}`,
      `Save page: ${destination}`,
    ].filter(Boolean).join("\n"),
    {
      source: {
        type: "time-machine-preservation",
        readerKind: "web",
        sourceKind: "web_archive_request",
        title,
        sourceTitle: title,
        url: page.url,
        site,
        archiveProvider: provider,
        preservationUrl: destination,
        requestedAt,
      },
      sourceTitle: title,
      sourceKind: "web_archive_request",
      capturedAt: requestedAt,
      reveal: false,
    }
  );
  if (scrap) {
    scrap.tags = [...new Set(["time-machine", "preservation-request", provider, ...(scrap.tags || [])])];
    saveDeskState();
    renderScraps();
  }

  link.href = destination;
  link.click();
  timeMachineSetStatus(t("time_machine_preserve_opened", providerLabel));
  return true;
}

function createTimeMachineClip(text, translatedText = "", translationMeta = {}) {
  const { selection } = timeMachineReaderSelection();
  const context = timeMachineSelectionContext(selection, text);
  const capturedAt = new Date().toISOString();
  const source = timeMachineSourceContract(context, text, capturedAt);
  const archiveRows = source.archiveProvider ? [
    `Archive provider: ${source.archiveProvider}`,
    `Snapshot: ${source.snapshotUrl}`,
    `Snapshot time: ${source.snapshotTimestamp || "unknown"}`,
    `Target date: ${source.targetDate || "unknown"}`,
    source.readerCompleteness === "partial" ? "Readable text: preview only" : "",
  ] : [];
  const body = [
    "Selected passage:",
    text,
    translatedText ? "" : null,
    translatedText ? `${formatTranslationMeta(translationMeta.language, translationMeta.createdAt, "Time Machine", translationMeta.model)}:` : null,
    translatedText || null,
    "",
    "---",
    `Source: ${source.title}`,
    `URL: ${source.originalUrl}`,
    ...archiveRows,
    source.author ? `Author: ${source.author}` : "",
    source.date ? `Date: ${source.date}` : "",
    `Time: ${new Date(capturedAt).toLocaleString()}`,
    "",
    "Context before:",
    context.before || "[start of readable text]",
    "",
    "Context after:",
    context.after || "[end of readable text]",
  ].filter((item) => item !== null && item !== "").join("\n");
  const scrap = createScrap(`Clip: ${text.slice(0, 20)}...`, body, {
    source,
    selectedText: text,
    sourceTitle: source.title,
    sourceKind: source.sourceKind,
    nearbyContext: context,
    capturedAt,
    translatedText,
    translationLanguage: translationMeta.language || "",
    translationCreatedAt: translationMeta.createdAt || "",
    translationSource: translatedText ? "Time Machine" : "",
    translationModel: translationMeta.model || "",
    context,
  });
  if (!scrap) return null;
  scrap.tags = [...new Set([
    "reader-clip",
    source.archiveProvider ? "archive-snapshot" : "web",
    source.archiveProvider || "",
    translatedText ? "translation" : "",
    ...(scrap.tags || []),
  ].filter(Boolean))];
  currentTimeMachineClipCount += 1;
  saveDeskState();
  renderScraps();
  updateFlowGuideChecklist({ render: false });
  timeMachineSetStatus(t("time_machine_clips_count", currentTimeMachineClipCount));
  return scrap;
}

function clipTimeMachineSelection() {
  const { text } = timeMachineReaderSelection();
  if (!text) {
    timeMachineSetStatus(t("select_text_first"));
    return;
  }
  createTimeMachineClip(text);
  timeMachineSetStatus(t("reader_clipped"));
}

async function clipTimeMachineSelectionWithTranslation() {
  const { text } = timeMachineReaderSelection();
  if (!text) {
    timeMachineSetStatus(t("select_text_first"));
    return;
  }
  const language = getTranslationTargetForUi(text);
  if (!language) {
    timeMachineSetStatus(t("reader_clip_no_translation_needed"));
    return;
  }
  try {
    document.body.classList.add("is-busy");
    timeMachineClipTranslateButton.disabled = true;
    const createdAt = new Date().toISOString();
    const model = currentTranslationModel();
    const translatedText = await translateTextWithLocalModel(text, language, {
      preserveMarkdown: false,
      title: currentTimeMachinePage?.title || t("time_machine"),
    });
    createTimeMachineClip(text, translatedText, { language, createdAt, model });
    timeMachineSetStatus(t("reader_bilingual_clipped"));
  } catch (error) {
    timeMachineSetStatus(t("translation_failed", error.message), { error: true });
  } finally {
    document.body.classList.remove("is-busy");
    timeMachineClipTranslateButton.disabled = !currentTimeMachinePage?.reader?.text;
  }
}

// The loaded page as a DocMap source. DocMap's own entry points (the desktop
// icon, the Special menu, a keyboard shortcut) reach for this too, because by
// the time they run the Time Machine window is no longer the active one.
function timeMachineDocMapSource() {
  const selection = timeMachineReaderSelection().text;
  const text = selection || currentTimeMachinePage?.reader?.text || "";
  if (!text.trim()) return null;
  return {
    text,
    label: currentTimeMachinePage?.reader?.title || currentTimeMachinePage?.title || t("time_machine"),
    scope: "timeMachine",
    meta: {
      url: currentTimeMachinePage?.url || "",
      snapshotUrl: currentTimeMachinePage?.archive?.snapshotUrl || "",
      archiveProvider: currentTimeMachinePage?.archive?.provider || "",
      readerCompleteness: currentTimeMachinePage?.reader?.completeness || "unavailable",
    },
    threshold: selection ? docMapMinSelectionChars : docMapMinDocumentChars,
  };
}

function makeTimeMachineDocMap() {
  return makeDocMapFromCurrentSource(timeMachineDocMapSource() || { text: "", scope: "timeMachine" });
}

async function askTimeMachineSource() {
  const page = currentTimeMachinePage;
  if (!page?.reader?.text) return;
  const question = timeMachineQuestionInput?.value?.trim() || "";
  if (!question) {
    timeMachineQuestionInput?.focus();
    return;
  }
  const selection = timeMachineReaderSelection().text;
  const source = selection || page.reader.text;
  const archiveLine = page.archive
    ? `${timeMachineProviderLabel(page.archive.provider)} · ${timeMachineCapturedLabel(page.archive.capturedAt)} · ${page.archive.snapshotUrl}`
    : t("time_machine_live");
  const completenessLine = page.reader.completeness === "partial"
    ? t("time_machine_reader_partial_source")
    : "";
  const prompt = currentLanguage === "zh"
    ? [
      "你正在回答时光机中的网页来源。请区分网页原文、你的推断、以及仍需核对的事实。",
      `问题：${question.trim()}`,
      `网页：${page.reader.title || page.title}`,
      `来源：${archiveLine}`,
      ...(completenessLine ? [completenessLine] : []),
      "",
      clipContextContent(source, selection ? 6000 : 12000),
    ].join("\n")
    : [
      "Answer about the Time Machine web source. Separate source text, inference, and facts that still need checking.",
      `Question: ${question.trim()}`,
      `Page: ${page.reader.title || page.title}`,
      `Source: ${archiveLine}`,
      ...(completenessLine ? [completenessLine] : []),
      "",
      clipContextContent(source, selection ? 6000 : 12000),
    ].join("\n");
  // Pair the page with ClioTalk the way Reader, Scrapbook, DocMap, and
  // ClioStage do, so the answer arrives in a SideAsk session beside its source.
  const paired = typeof arrangeWindowAssistantSplit === "function"
    ? await arrangeWindowAssistantSplit("timeMachine")
    : (await openWindow("assistant"), true);
  if (!paired) return;
  if (timeMachineQuestionInput) timeMachineQuestionInput.value = "";
  markAskBarSent("timeMachine");
  timeMachineSetStatus(t("time_machine_question_sent"));
  await submitUserText(prompt, {
    displayText: `${t("time_machine")}: ${question.trim()}`,
    skipContext: true,
    taskKind: "reader",
  });
}

function sendTimeMachineCopyToManuscript() {
  const selection = timeMachineReaderSelection().text;
  const text = selection || currentTimeMachinePage?.reader?.text || "";
  if (!text.trim()) return;
  insertIntoTeachText(text, {
    title: currentTimeMachinePage?.reader?.title || currentTimeMachinePage?.title || t("time_machine"),
    plain: true,
  });
  timeMachineSetStatus(t(selection ? "reader_selection_sent_manuscript" : "reader_copy_sent_manuscript"));
}

function openTimeMachineSnapshotSource(source = {}) {
  openTimeMachineWindow();
  timeMachineEnabledInput.checked = true;
  timeMachineTimeBandEl.classList.add("is-active");
  timeMachineDateInput.value = String(source.snapshotTimestamp || source.targetDate || "").slice(0, 10) || timeMachineToday();
  return timeMachineNavigate(source.originalUrl || source.url, {
    capture: source.snapshotUrl ? {
      provider: source.archiveProvider || "wayback",
      originalUrl: source.originalUrl || "",
      snapshotUrl: source.snapshotUrl,
      browseUrl: source.snapshotUrl,
      capturedAt: source.snapshotTimestamp || "",
    } : null,
  });
}

function timeMachineHandleFrameMessage(event) {
  if (!timeMachineFrameEl || event.source !== timeMachineFrameEl.contentWindow) return;
  const message = event.data;
  if (!message || message.channel !== "ai-system-6-time-machine") return;
  if (message.type === "navigate" && message.url) {
    timeMachineNavigate(message.url);
    return;
  }
  if (message.type === "blocked") {
    timeMachineSetStatus(t("time_machine_blocked_form"), { error: true });
  }
}

timeMachineAddressForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  timeMachineNavigate(timeMachineAddressInput.value);
});
timeMachineAskForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  askTimeMachineSource();
});
registerAskBarSource("timeMachine", describeTimeMachineAskScope);
timeMachineEnabledInput?.addEventListener("change", timeMachineHandleModeChange);
timeMachineDateInput?.addEventListener("change", timeMachineHandleDateChange);
timeMachineCalendarButton?.addEventListener("click", (event) => {
  event.stopPropagation();
  timeMachineSetDatePopover(timeMachineDatePopover?.hidden !== false);
});
timeMachineCalendarPreviousButton?.addEventListener("click", (event) => {
  event.stopPropagation();
  timeMachineShiftCalendarMonth(-1);
});
timeMachineCalendarNextButton?.addEventListener("click", (event) => {
  event.stopPropagation();
  timeMachineShiftCalendarMonth(1);
});
document.addEventListener("pointerdown", (event) => {
  if (!timeMachineDatePopover || timeMachineDatePopover.hidden) return;
  if (!timeMachineDateControlEl?.contains(event.target)) timeMachineSetDatePopover(false);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && timeMachineDatePopover && !timeMachineDatePopover.hidden) {
    timeMachineSetDatePopover(false);
    timeMachineCalendarButton?.focus();
  }
});
timeMachineProviderInput?.addEventListener("change", () => {
  captureActiveTimeMachineTabState();
  saveDeskState();
  timeMachineUpdateSourceSwitch();
  if (timeMachineEnabledInput.checked && timeMachineAddressInput.value.trim()) {
    timeMachineNavigate(timeMachineAddressInput.value);
  }
});
window.addEventListener("message", timeMachineHandleFrameMessage);

function attachTimeMachineWindow() {
  const project = getActiveProject();
  const active = activeTimeMachineTab(project) || prepareTimeMachineBlankLaunch();
  renderTimeMachineTabs(project);
  if (active) timeMachineApplyTabControls(active);
  timeMachineUpdateNavigationButtons();
  timeMachineUpdateSourceSwitch();
}

function runTimeMachineMenuCommand(command) {
  if (command === "open") return openTimeMachineWindow();
  if (command === "new-tab") return newTimeMachineTab();
  if (command === "close-tab") {
    const tab = activeTimeMachineTab();
    return tab ? closeTimeMachineTab(tab.id) : false;
  }
  if (command === "back") return goBackTimeMachine();
  if (command === "forward") return goForwardTimeMachine();
  if (command === "stop") return stopTimeMachineNavigation();
  if (command === "refresh") return refreshTimeMachinePage();
  if (command === "switch-source") return switchTimeMachineSource();
  if (command === "toggle") return toggleTimeMachineArchiveMode();
  if (command === "web-view") return showTimeMachineWebView();
  if (command === "reader-view") return showTimeMachineReaderView();
  if (command === "preserve-wayback") return preserveCurrentTimeMachinePage("wayback");
  if (command === "preserve-archive-is") return preserveCurrentTimeMachinePage("archive-is");
  if (command === "clip") return clipTimeMachineSelection();
  if (command === "clip-translate") return clipTimeMachineSelectionWithTranslation();
  if (command === "docmap") return makeTimeMachineDocMap();
  if (command === "ask") return askTimeMachineSource();
  if (command === "send-manuscript") return sendTimeMachineCopyToManuscript();
}

function captureTimeMachineSession() {
  captureActiveTimeMachineTabState();
  return {
    projectId: activeProjectId,
    activeTabId: activeTimeMachineTab()?.id || "",
  };
}

function restoreTimeMachineSession() {
  return prepareTimeMachineBlankLaunch();
}

window.AISystem6TimeMachine = Object.freeze({
  attach: attachTimeMachineWindow,
  captureSession: captureTimeMachineSession,
  restoreSession: restoreTimeMachineSession,
  runMenuCommand: runTimeMachineMenuCommand,
  openSnapshot: openTimeMachineSnapshotSource,
  docMapSource: timeMachineDocMapSource,
});
window.AISystem6TimeMachineLoaded = true;
