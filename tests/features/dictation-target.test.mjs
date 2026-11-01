// Where the words land, against the acceptance table in
// internal/plans/DICTATION-ENHANCEMENT-2026-10-03.acceptance.json.
//
// The real service (app/features/dictation.js), the real editor transaction
// (app/core/markdown-editor.js) and the real pad run here over a small fake
// DOM: captured position, safe field types, refusal instead of a silent
// re-route, one edit transaction, and plain text in.
import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("dictation-target");

function fakeEnvironment() {
  const created = [];
  class FakeElement {
    constructor(tag, options = {}) {
      this.tagName = tag.toUpperCase();
      this.children = [];
      this.parent = null;
      this.dataset = { ...(options.dataset || {}) };
      this.attributes = { ...(options.attributes || {}) };
      this.classList = {
        _set: new Set(options.classes || []),
        add(...names) { names.forEach((name) => this._set.add(name)); },
        remove(...names) { names.forEach((name) => this._set.delete(name)); },
        toggle(name, on) { if (on) this._set.add(name); else this._set.delete(name); },
        contains(name) { return this._set.has(name); },
      };
      this.hidden = options.hidden === true;
      this.disabled = options.disabled === true;
      this.readOnly = options.readOnly === true;
      this.isContentEditable = options.editable === true;
      this.textContent = options.textContent || "";
      this.style = {};
      this.selectionStart = 0;
      this.selectionEnd = 0;
      this.rects = options.rects === 0 ? [] : [{}];
      created.push(this);
    }
    get value() { return this._value ?? ""; }
    set value(next) { this._value = String(next); }
    get type() { return this.attributes.type || "text"; }
    closest(selector) {
      const wanted = String(selector);
      for (const name of wanted.split(",").map((part) => part.trim())) {
        if (name.startsWith("[data-window=") && this.dataset.window === name.slice(13, -2)) return this;
        if (name === ".dictation-window" && this.classList.contains("dictation-window")) return this;
        if (name === '[data-dictation="off"]' && this.attributes["data-dictation"] === "off") return this;
        if (name === "[contenteditable='true'], [contenteditable='']" && this.isContentEditable) return this;
        if (name === ".window" && this.dataset.window) return this;
        if (name === "[hidden], .is-hidden, .is-app-hidden"
          && (this.hidden || this.classList.contains("is-hidden") || this.classList.contains("is-app-hidden"))) return this;
      }
      let node = this.parent;
      while (node) {
        for (const name of wanted.split(",").map((part) => part.trim())) {
          if (name === '[data-dictation="off"]' && node.attributes["data-dictation"] === "off") return node;
          if (name === ".window" && node.dataset.window) return node;
          if (name === ".dictation-window" && node.classList.contains("dictation-window")) return node;
        }
        node = node.parent;
      }
      return null;
    }
    contains(other) {
      let node = other?.parent || null;
      while (node) { if (node === this) return true; node = node.parent; }
      return false;
    }
    append(child) { child.parent = this; this.children.push(child); return child; }
    getClientRects() { return this.rects; }
    focus() { documentStub.activeElement = this; }
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
    setRangeText(text, start, end, mode) {
      const next = this.value.slice(0, start) + text + this.value.slice(end);
      this.value = next;
      this.selectionStart = this.selectionEnd = mode === "end" ? start + text.length : start;
    }
    dispatchEvent(event) { dispatched.push({ target: this, type: event.type }); return true; }
    addEventListener() {}
    removeEventListener() {}
    querySelector() { return null; }
    setAttribute(name, value) { this.attributes[name] = value; }
    getAttribute(name) { return this.attributes[name] ?? null; }
  }

  const dispatched = [];
  const documentStub = {
    body: new FakeElement("body"),
    activeElement: null,
    createElement: (tag) => new FakeElement(tag),
    createTextNode: (text) => ({ nodeType: 3, textContent: text, parent: null }),
    createRange: () => ({
      setStartAfter() {},
      collapse() {},
      deleteContents() {},
      insertNode(node) { node.parent = null; },
      cloneRange() { return this; },
      commonAncestorContainer: null,
    }),
    getElementById: (id) => byId.get(id) || null,
    querySelector: () => null,
    contains: (element) => !!(element && element._inDocument),
  };
  const byId = new Map();
  // The subclasses are what `instanceof HTMLTextAreaElement` sees, so `make`
  // has to build the same class the window would.
  class FakeTextArea extends FakeElement {}
  class FakeInput extends FakeElement {}
  const make = (tag, options = {}) => {
    const element = tag === "textarea"
      ? new FakeTextArea(tag, options)
      : tag === "input" ? new FakeInput(tag, options) : new FakeElement(tag, options);
    if (options.id) byId.set(options.id, element);
    element._inDocument = options.inDocument !== false;
    return element;
  };

  const context = vm.createContext({
    window: {},
    document: documentStub,
    Node: { ELEMENT_NODE: 1 },
    Event: class { constructor(type) { this.type = type; } },
    HTMLElement: FakeElement,
    HTMLInputElement: FakeInput,
    HTMLTextAreaElement: FakeTextArea,
    CSS: { escape: (value) => String(value) },
    TextEncoder,
    setTimeout,
    clearTimeout,
    AbortController,
    AbortSignal,
    console,
    navigator: { clipboard: { writeText: () => Promise.resolve() } },
  });
  return { context, documentStub, byId, make, dispatched, FakeElement, FakeInput, FakeTextArea, created };
}

function loadService() {
  const environment = fakeEnvironment();
  const { context, make, byId, documentStub } = environment;
  context.currentLanguage = "zh";
  context.activeProjectId = "p1";
  context.t = (key, ...args) => (typeof key === "string" ? `${key}${args.length ? `(${args.join(",")})` : ""}` : String(key));
  context.dictationIntentDestination = "assistant";
  context.window.getSelection = () => ({ rangeCount: 0, getRangeAt: () => null, removeAllRanges() {}, addRange() {} });
  context.window.matchMedia = () => ({ matches: false });
  context.window.addEventListener = () => {};
  context.lifecycles = [];
  context.window.AISystem6ApplicationRegistry = {
    registerApplicationLifecycle: (id, hooks) => { context.lifecycles.push({ id, hooks }); },
  };
  // The pad and the session are the real files; the DOM handles they read are
  // the ones the window really has.
  const handles = {
    dictationStatusEl: make("span", { id: "dictation-status" }),
    dictationIntentTargetEl: make("span", { id: "dictation-intent-target" }),
    dictationRawInput: make("textarea", { id: "dictation-raw" }),
    dictationCleanedInput: make("textarea", { id: "dictation-cleaned" }),
    dictationRecordButton: make("button", { id: "dictation-record" }),
    dictationStopButton: make("button", { id: "dictation-stop" }),
    dictationShapeButton: make("button", { id: "dictation-shape" }),
    dictationCleanButton: make("button", { id: "dictation-clean" }),
    dictationClearButton: make("button", { id: "dictation-clear" }),
    dictationSendButton: make("button", { id: "dictation-send" }),
  };
  Object.assign(context, handles);
  context.openWindow = () => {};
  context.setStatus = (text) => { context.lastStatus = text; };
  context.openAppDb = undefined;
  context.keyvalStoreName = "keyval";
  context.idbRequest = () => null;
  context.appendToNotePad = (text) => { context.notePadCalls.push(text); };
  context.notePadCalls = [];
  context.markTeachTextModified = () => { context.teachTextModified = (context.teachTextModified || 0) + 1; };
  context.shapeDictationText = (text) => text;
  context.dictationShapeBlockCount = () => 1;
  context.dictationDestinationLabel = (dest) => dest;
  context.getLongTaskSignal = () => null;
  // The pad compares the target against these window-owned fields, so they
  // have to exist as identifiers even when a test never uses them.
  context.teachTextBodyInput = null;
  context.currentLanguage = "zh";
  // app.js owns the pad's own globals; the boot scope has to have them before
  // the pad is loaded, or a module-level read throws instead of seeing null.
  vm.runInContext("var dictationInputTarget = null; var dictationIntentDestination = 'assistant';", context);
  vm.runInContext(read("app/core/dictation-shape.js"), context);
  vm.runInContext(read("app/core/markdown-editor.js"), context);
  vm.runInContext(read("app/features/dictation.js"), context);
  vm.runInContext(read("app/core/dictation-session.js"), context);
  vm.runInContext(read("app/features/dictation-pad.js"), context);
  // Top-level `let` in a script is a lexical binding, not a property of the
  // global object, so the captured snapshot has to be written from inside the
  // same scope the service reads it from.
  const setTargetSnapshot = (snapshot) => {
    context.__dictationSnapshot = snapshot;
    vm.runInContext("dictationTargetSnapshot = __dictationSnapshot;", context);
  };
  const service = vm.runInContext("({ getEditableTextTarget, dictationInputIsSafe, captureDictationTarget, dictationTargetProblem, insertTextIntoInputTarget, openDictationPad })", context);
  const pad = vm.runInContext("({ ensureDictationSession, sendTranscript, clearDictationTranscript, mountDictationPad, cleanTranscript, buildDictationCleanMessages, updateDictationTranscriptButtons })", context);
  const session = pad.ensureDictationSession();
  return { ...environment, ...handles, context, service, pad, session, documentStub, make, byId, setTargetSnapshot };
}

const withWindow = (element, name) => {
  const win = element.parent || null;
  if (win) win.dataset.window = name;
  return element;
};

// T01 — the position is captured when the pad opens, not guessed later.
{
  const world = loadService();
  const windowEl = world.make("section", { id: "teachtext-win", classes: ["window"], dataset: { window: "teachText" } });
  const field = world.make("textarea", { id: "teachtext-body", inDocument: true });
  windowEl.append(field);
  field.value = "甲新丁";
  field.setSelectionRange(1, 2);
  const snapshot = world.service.captureDictationTarget(field);
  test.assert(snapshot.value === "甲新丁", "T01: the value at capture is kept");
  test.assert(snapshot.selectionStart === 1 && snapshot.selectionEnd === 2, "T01: the selection at capture is kept");
  test.assert(snapshot.documentId === "teachText:p1", "T01: the document identity is kept");
  test.assert(world.dispatched.length === 0, "T01: capturing submits and sends nothing");
}

// T02 — a removed target is refused, and the words do not drift to the Note Pad.
{
  const world = loadService();
  const field = world.make("textarea", { id: "prompt", inDocument: true });
  field.value = "带我去便签";
  const snapshot = world.service.captureDictationTarget(field);
  field._inDocument = false;
  test.assert(world.service.dictationTargetProblem(snapshot) === "target-missing", "T02: a removed target is refused");
  world.setTargetSnapshot(snapshot);
  world.dictationRawInput.value = "带我去便签";
  world.session.setRaw("带我去便签");
  world.context.notePadCalls.length = 0;
  world.pad.sendTranscript();
  test.assert(world.context.notePadCalls.length === 0, "T02: nothing is written to the Note Pad");
  test.assert(world.session.state.raw === "带我去便签", "T02: the words are kept");
  test.assert(String(world.dictationStatusEl.textContent).includes("dictation_target_unavailable"), "T02: the pad says why");
}

// T03 — the same element with different text is a different piece of writing.
{
  const world = loadService();
  const windowEl = world.make("section", { id: "assistant-win", classes: ["window"], dataset: { window: "assistant" } });
  const field = world.make("textarea", { id: "prompt", inDocument: true });
  windowEl.append(field);
  field.value = "原来的话";
  const snapshot = world.service.captureDictationTarget(field);
  field.value = "换掉的话";
  test.assert(world.service.dictationTargetProblem(snapshot) === "target-changed", "T03: a changed value refuses the insert");
  const otherProject = world.service.captureDictationTarget(field);
  world.context.activeProjectId = "p2";
  test.assert(world.service.dictationTargetProblem(otherProject) === "target-changed", "T03: another project refuses it too");
}

// T04 — opening the pad with no field declares the Note Pad up front.
{
  const world = loadService();
  world.dictationRawInput.value = "没有指定目标";
  world.session.setRaw("没有指定目标");
  world.setTargetSnapshot(null);
  world.context.notePadCalls.length = 0;
  world.pad.sendTranscript();
  test.assert(world.context.notePadCalls.length === 1, "T04: the Note Pad receives the text once");
  test.assert(world.session.state.raw === "", "T04: the pad is cleared only after it landed");
}

// T05 — one edit transaction, and a failure clears nothing.
{
  const world = loadService();
  const field = world.make("textarea", { id: "prompt", inDocument: true });
  field.value = "前文";
  field.setSelectionRange(2, 2);
  const snapshot = world.service.captureDictationTarget(field);
  world.setTargetSnapshot(snapshot);
  world.dictationRawInput.value = "插入的内容";
  world.session.setRaw("插入的内容");
  let edits = 0;
  world.context.mdeApply = (textarea, { from, to, insert, selStart }) => {
    edits += 1;
    textarea.setRangeText(insert, from, to, "end");
    if (typeof selStart === "number") textarea.setSelectionRange(selStart, selStart);
  };
  world.pad.sendTranscript();
  test.assert(edits === 1, "T05: the insert is one editing transaction");
  test.assert(field.value === "前文插入的内容", "T05: the words land at the captured position");
  test.assert(world.session.state.raw === "", "T05: a successful insert clears the pad");
  test.assert(world.context.notePadCalls.length === 0, "T05: and does not also go to the Note Pad");

  const refused = loadService();
  const gone = refused.make("textarea", { id: "prompt", inDocument: true });
  gone.value = "原文";
  const goneSnapshot = refused.service.captureDictationTarget(gone);
  gone._inDocument = false;
  refused.setTargetSnapshot(goneSnapshot);
  refused.dictationRawInput.value = "不能丢的字";
  refused.session.setRaw("不能丢的字");
  refused.pad.sendTranscript();
  test.assert(refused.session.state.raw === "不能丢的字", "T05: a failed insert clears nothing");
  test.assert(refused.session.state.inserting === false, "T05: and does not retry by itself");
}

// T06 — only prose fields are dictation targets.
{
  const world = loadService();
  const password = world.make("input", { attributes: { type: "password" }, inDocument: true });
  const number = world.make("input", { attributes: { type: "number" }, inDocument: true });
  const oneTime = world.make("input", { attributes: { type: "text", autocomplete: "one-time-code" }, inDocument: true });
  const search = world.make("input", { attributes: { type: "search" }, inDocument: true });
  const text = world.make("input", { attributes: { type: "text" }, inDocument: true });
  for (const [label, element] of [["password", password], ["number", number], ["one-time code", oneTime]]) {
    test.assert(world.service.getEditableTextTarget(element) === null, `T06: ${label} is not a dictation target`);
    test.assert(world.service.dictationInputIsSafe(element) === false, `T06: ${label} is not safe to write into`);
  }
  test.assert(world.service.getEditableTextTarget(search) === search, "T06: a search field is a target");
  test.assert(world.service.getEditableTextTarget(text) === text, "T06: a text field is a target");
  let wrote = 0;
  world.context.mdeApply = () => { wrote += 1; };
  test.assert(world.service.insertTextIntoInputTarget(password, "秘密") === false, "T06: no insert is attempted on it");
  test.assert(wrote === 0, "T06: and no editor transaction is opened");
}

// T07 — inserted text is text: no markup, no new elements, no scripts.
{
  const world = loadService();
  const field = world.make("textarea", { id: "prompt", inDocument: true });
  field.value = "";
  const snapshot = world.service.captureDictationTarget(field);
  world.setTargetSnapshot(snapshot);
  world.dictationRawInput.value = "<img src=x onerror=alert(1)>脚本";
  world.session.setRaw("<img src=x onerror=alert(1)>脚本");
  const before = world.created.length;
  world.pad.sendTranscript();
  test.assert(field.value === "<img src=x onerror=alert(1)>脚本", "T07: the text is inserted verbatim as text");
  test.assert(world.created.length === before, "T07: no image or script element is created");
  test.assert(world.dispatched.every((entry) => entry.type === "input" || entry.type === "change"),
    "T07: only ordinary edit events are fired");
}

// T08 — the editor's own undo path, and an honest copy when insert is not
// possible.
{
  const world = loadService();
  const field = world.make("textarea", { id: "teachtext-body", inDocument: true });
  field.value = "原稿";
  const snapshot = world.service.captureDictationTarget(field);
  world.setTargetSnapshot(snapshot);
  world.context.teachTextBodyInput = field;
  world.dictationRawInput.value = "补一句";
  world.session.setRaw("补一句");
  let transactions = 0;
  world.context.document.execCommand = () => { transactions += 1; return true; };
  world.context.mdeApply = (textarea, { from, to, insert }) => {
    transactions += 1;
    const before = textarea.value;
    textarea.setRangeText(insert, from, to, "end");
    if (textarea.value === before) textarea.value = before + insert;
  };
  world.pad.sendTranscript();
  test.assert(transactions === 1, "T08: one undoable transaction");
  test.assert(field.value.includes("补一句"), "T08: the editor's own value moved");
  test.assert(world.context.teachTextModified >= 1, "T08: TeachText knows its manuscript changed");

  const notEditable = loadService();
  const plain = notEditable.make("div", { id: "not-editable", inDocument: true });
  const plainSnapshot = notEditable.service.captureDictationTarget(plain);
  test.assert(plainSnapshot === null, "T08: an element that cannot receive text is not captured");
  const rejected = notEditable.make("textarea", { id: "prompt", inDocument: true });
  rejected.value = "写";
  const rejectedSnapshot = notEditable.service.captureDictationTarget(rejected);
  rejected.readOnly = true;
  test.assert(notEditable.service.dictationTargetProblem(rejectedSnapshot) === "target-locked",
    "T08: a read-only field is refused rather than quietly replaced");
}

// C16 (manual half) — organizing again over a draft the writer edited asks
// first, and a refused confirmation starts nothing.
{
  const world = loadService();
  world.context.fetchModelPayload = async () => ({ ok: true });
  world.context.readChatJson = async () => ({ choices: [{ message: { content: "整理稿" }, finish_reason: "stop" }] });
  world.context.withMarkdownModelMessages = (messages) => messages;
  world.context.getLocalModelRequestName = () => "model";
  const asked = [];
  world.context.showSystemModal = async (message) => { asked.push(message); return world.context.__answer; };
  world.dictationRawInput.value = "原文";
  world.session.setRaw("原文");
  world.session.editCleaned("我改过的整理稿");
  world.context.__answer = "cancel";
  await world.pad.cleanTranscript();
  test.assert(asked.length === 1, "C16: re-organizing an edited draft asks first");
  test.assert(world.session.state.cleanRequestId === 0, "C16: a refused confirmation starts no request");
  test.assert(world.session.state.cleaned === "我改过的整理稿", "C16: and the writer's draft is untouched");
  world.context.__answer = "yes";
  await world.pad.cleanTranscript();
  test.assert(world.session.state.cleanRequestId === 1, "C16: a confirmed one runs the single request");
  test.assert(world.session.state.cleaned === "整理稿", "C16: and the new result replaces the old draft");
}

// P04 — the glossary travels as data the writer owns, never as a system
// instruction.
{
  const world = loadService();
  const messages = world.pad.buildDictationCleanMessages("原话里的 AI System 6", { terms: ["AI System 6", "WindowShade"] });
  const system = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n");
  const user = messages.filter((message) => message.role === "user").map((message) => message.content).join("\n");
  const payload = JSON.parse(user.replace(/^[\s\S]*?\n/, ""));
  test.assert(payload.transcript === "原话里的 AI System 6", "P04: the transcript travels as data");
  test.assert(payload.terms.includes("AI System 6") && payload.terms.includes("WindowShade"), "P04: the saved spellings travel with the transcript");
  test.assert(!system.includes("WindowShade"), "P04: and never enter the system turn");
  test.assert(/拼写参考|spelling reference only/.test(system), "P04: the glossary is described as a reference, not a rule");
  test.assert(/待处理的数据|data to process only/.test(user), "P04: the user turn is labelled as data, not instructions");
}

// The repairs from the run's own review: typing is an edit, and leaving the
// window ends the round.
{
  const world = loadService();
  world.session.setRaw("原稿");
  const request = world.session.beginClean();
  world.session.completeClean(request.requestId, { descriptor: request, text: "整理稿", finishReason: "stop" });
  test.assert(world.session.state.selectedSource === "cleaned", "repair: a current draft is selected");
  const before = world.session.state.rawRevision;
  // The writer types into the field itself; the boot listener routes it here.
  world.dictationRawInput.value = "原稿，手打补一句";
  world.pad.updateDictationTranscriptButtons();
  test.assert(world.session.state.rawRevision > before, "repair: typing moves the revision");
  test.assert(world.session.cleanedIsStale(), "repair: and retires the draft that answered the older text");
  test.assert(world.session.insertText().source === "raw", "repair: the insert source falls back to the writer's words");

  const registration = world.context.lifecycles.find((entry) => entry.id === "dictation");
  test.assert(registration && typeof registration.hooks.onDispose === "function",
    "repair: the pad registers a dispose hook for its own window");
  let modelCalls = 0;
  world.context.fetchModelPayload = () => { modelCalls += 1; return new Promise(() => {}); };
  world.context.readChatJson = async () => ({});
  world.context.withMarkdownModelMessages = (messages) => messages;
  world.context.getLocalModelRequestName = () => "model";
  let thrown = "none";
  try {
    world.pad.cleanTranscript({ skipConfirm: true });
  } catch (error) {
    thrown = String((error && error.stack) || error);
  }
  test.assert(world.session.state.cleanBusy === true && modelCalls === 1 && thrown === "none",
    "repair: a request is in flight (one model call, no exception)");
  registration.hooks.onDispose();
  test.assert(world.session.state.cleanBusy === false, "repair: leaving the window cancels it");
  test.assert(world.session.state.raw === "原稿，手打补一句", "repair: and nothing is sent on the way out");
}

// P05 (storage half) — one versioned preference key, no new store, and nothing
// but the three settings in it.
{
  const world = loadService();
  const config = read("app/core/config.js");
  const pad = read("app/features/dictation-pad.js");
  test.assert(!/dictationStoreName|dictationPreferencesStoreName/.test(config), "P05: no store is added for dictation");
  test.assert(/DICTATION_PREFS_KEY = "dictation\.preferences\.v1"/.test(pad), "P05: the preference key is versioned");
  test.assert(/keyvalStoreName/.test(pad) && /put\(prefs, DICTATION_PREFS_KEY\)/.test(pad),
    "P05: it is written through the existing keyval facade");
  const prefs = world.context.normalizeDictationPreferences
    ? world.context.normalizeDictationPreferences({ version: 1, autoCleanOnStop: true, terms: ["AI System 6"], transcript: "不该在这里", cleaned: "也不该" })
    : null;
  if (prefs) {
    test.assert(!("transcript" in prefs) && !("cleaned" in prefs), "P05: no transcript and no draft enter the record");
    test.assert(prefs.terms.length === 1, "P05: only the three fields are kept");
  } else {
    vm.runInContext("__prefs = normalizeDictationPreferences({ version: 1, autoCleanOnStop: true, terms: ['AI System 6'], transcript: 'x', cleaned: 'y' });", world.context);
    const stored = world.context.__prefs;
    test.assert(!("transcript" in stored) && !("cleaned" in stored), "P05: no transcript and no draft enter the record");
    test.assert(stored.terms.length === 1 && stored.autoCleanOnStop === true, "P05: only the three fields are kept");
  }
}

test.finish();
