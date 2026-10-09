// @ts-check
// Review comments: threads on the manuscript, kept on the project record.
//
// A comment points at a passage by what it says (app/core/text-quote.js), so
// it still finds its passage after the writer has edited around it, and
// reports "anchor lost" when the passage is gone instead of guessing. A thread
// is the comment and its replies. The state of a review (Accepted, Rejected,
// Completed, or Reopened) is a reply too: a state reply is appended, and the
// comment it answers is never edited. Everyone's words are kept as typed, with
// who wrote them; nothing here summarises a person's view.
//
// project.reviewComments is one flat array. Three kinds of record only ever
// grow (comment, reply, state); two small records are kept current in place
// because they are not anybody's words: a track (the offset a comment's
// passage was last seen at) and a tick (a reviewer's private "checked" mark).
//
// No DOM, no translations: the executable contract runs this bare.

(function installReviewComments(root) {
  if (root.AISystem6ReviewComments) return;

  const KINDS = Object.freeze(["note", "voice", "fact", "structure"]);
  const STATES = Object.freeze(["accepted", "rejected", "completed"]);
  /** A state reply may also reopen a thread. */
  const STATE_REPLIES = Object.freeze([...STATES, "open"]);
  const TYPES = Object.freeze(["comment", "reply", "state", "track", "tick"]);
  const MAX_TEXT = 8000;
  const MAX_NAME = 80;
  const MAX_COMMENTS = 2000;

  let sequence = 0;
  function newId() {
    if (root.crypto && typeof root.crypto.randomUUID === "function") return root.crypto.randomUUID();
    sequence += 1;
    return `rc-${Date.now().toString(36)}-${sequence}-${Math.random().toString(36).slice(2, 8)}`;
  }

  const quoteApi = () => root.AISystem6TextQuote;

  /** @param {any} author */
  function cleanAuthor(author) {
    const role = author?.role === "reviewer" ? "reviewer" : "writer";
    const name = typeof author?.name === "string" ? author.name.trim().slice(0, MAX_NAME) : "";
    // A reviewer is somebody: a nameless reviewer comment would read as the
    // writer's own words.
    if (role === "reviewer" && !name) return null;
    return { role, name };
  }

  /** @param {any} value */
  function cleanText(value) {
    return typeof value === "string" ? value.slice(0, MAX_TEXT) : "";
  }

  /** @param {any} options */
  function createComment(options = {}) {
    const text = cleanText(options.text);
    const author = cleanAuthor(options.author);
    const anchor = options.anchor;
    if (!text.trim() || !author) return null;
    if (!anchor || typeof anchor.quote !== "string" || !anchor.quote.trim()) return null;
    const id = String(options.id || newId());
    return {
      id,
      type: "comment",
      rootId: id,
      replyTo: "",
      kind: KINDS.includes(options.kind) ? options.kind : "note",
      text,
      author,
      anchor: {
        quote: anchor.quote,
        prefix: typeof anchor.prefix === "string" ? anchor.prefix : "",
        suffix: typeof anchor.suffix === "string" ? anchor.suffix : "",
        offset: Number.isFinite(anchor.offset) ? Number(anchor.offset) : 0,
      },
      createdAt: String(options.now || new Date().toISOString()),
    };
  }

  /** @param {any} options  { rootId, replyTo?, text, author, id?, now? } */
  function createReply(options = {}) {
    const text = cleanText(options.text);
    const author = cleanAuthor(options.author);
    if (!text.trim() || !author || !options.rootId) return null;
    return {
      id: String(options.id || newId()),
      type: "reply",
      rootId: String(options.rootId),
      replyTo: String(options.replyTo || options.rootId),
      text,
      author,
      createdAt: String(options.now || new Date().toISOString()),
    };
  }

  /** @param {any} options  { rootId, state, text?, author, id?, now? } */
  function createStateReply(options = {}) {
    const author = cleanAuthor(options.author);
    if (!STATE_REPLIES.includes(options.state) || !author || !options.rootId) return null;
    return {
      id: String(options.id || newId()),
      type: "state",
      rootId: String(options.rootId),
      replyTo: String(options.replyTo || options.rootId),
      state: String(options.state),
      text: cleanText(options.text),
      author,
      createdAt: String(options.now || new Date().toISOString()),
    };
  }

  /**
   * @param {any[]} list
   * @param {any} record
   * @returns {any[] | null} a new array that holds the old records untouched
   *   plus this one, or null when the record does not belong (a duplicate id,
   *   a reply to a comment that is not there, a state that is not one).
   */
  function append(list, record) {
    const current = Array.isArray(list) ? list : [];
    if (!record || typeof record.id !== "string" || !record.id) return null;
    if (current.length >= MAX_COMMENTS) return null;
    if (current.some((item) => item?.id === record.id)) return null;
    if (record.type === "comment") {
      if (record.rootId !== record.id || !record.anchor?.quote) return null;
    } else if (record.type === "reply" || record.type === "state") {
      const rootRecord = current.find((item) => item?.id === record.rootId);
      if (!rootRecord || rootRecord.type !== "comment") return null;
      if (record.type === "state" && !STATE_REPLIES.includes(record.state)) return null;
    } else {
      return null; // tracks and ticks go through track() and tick()
    }
    return [...current, record];
  }

  /**
   * The offset a comment's passage was last seen at. One record per comment,
   * replaced in place: it is bookkeeping, not anybody's words.
   * @param {any[]} list @param {string} rootId @param {number} offset @param {string} [now]
   */
  function track(list, rootId, offset, now) {
    const current = Array.isArray(list) ? list : [];
    const id = `track:${rootId}`;
    const existing = current.find((item) => item?.id === id);
    if (existing && existing.offset === offset) return current;
    const record = { id, type: "track", rootId, offset, createdAt: String(now || new Date().toISOString()) };
    return existing ? current.map((item) => (item === existing ? record : item)) : [...current, record];
  }

  /**
   * A reviewer's private "checked" tick, one per (comment, reviewer). It is a
   * flag beside the thread: it never appears as a reply and never changes the
   * thread's state.
   * @param {any[]} list @param {string} rootId @param {string} by @param {boolean} checked
   */
  function tick(list, rootId, by, checked, now) {
    const current = Array.isArray(list) ? list : [];
    const name = String(by || "").trim().slice(0, MAX_NAME);
    if (!name || !current.some((item) => item?.id === rootId && item.type === "comment")) return current;
    const id = `tick:${rootId}:${name}`;
    const existing = current.find((item) => item?.id === id);
    if (existing && existing.checked === !!checked) return current;
    const record = { id, type: "tick", rootId, by: name, checked: !!checked, createdAt: String(now || new Date().toISOString()) };
    return existing ? current.map((item) => (item === existing ? record : item)) : [...current, record];
  }

  /**
   * Threads in document order. A thread whose passage is lost sorts after the
   * ones that were found, by when it was written; with no text to look in,
   * every thread keeps the order it was written in and is "unresolved".
   * @param {any[]} list
   * @param {string | null} text the manuscript, or null when it is not at hand
   */
  function buildThreads(list, text) {
    const records = Array.isArray(list) ? list : [];
    const quote = quoteApi();
    const byRoot = new Map();
    for (const record of records) {
      if (record?.type !== "comment") continue;
      byRoot.set(record.id, { id: record.id, root: record, replies: [], states: [], ticks: [], track: null });
    }
    for (const record of records) {
      const thread = byRoot.get(record?.rootId);
      if (!thread) continue;
      if (record.type === "reply") thread.replies.push(record);
      else if (record.type === "state") thread.states.push(record);
      else if (record.type === "tick") thread.ticks.push(record);
      else if (record.type === "track") thread.track = record;
    }
    const threads = [...byRoot.values()].map((thread) => {
      const last = thread.states[thread.states.length - 1];
      const anchor = thread.track && Number.isFinite(thread.track.offset)
        ? { ...thread.root.anchor, offset: thread.track.offset }
        : thread.root.anchor;
      const place = text === null || text === undefined || !quote
        ? { status: "unresolved", start: -1, end: -1, how: "", moved: false }
        : quote.resolveAnchor(text, anchor);
      return {
        id: thread.id,
        root: thread.root,
        replies: thread.replies,
        states: thread.states,
        // The thread's state is its latest state reply. Accepted, rejected and
        // completed are answers; "open" is where every thread starts and what
        // a reopening goes back to.
        state: last && last.state !== "open" ? last.state : "open",
        ticks: thread.ticks.filter((item) => item.checked).map((item) => item.by),
        place,
        lost: place.status === "lost",
        anchor,
        lastAt: [thread.root, ...thread.replies, ...thread.states].reduce((latest, item) => (item.createdAt > latest ? item.createdAt : latest), ""),
      };
    });
    return threads.sort((a, b) => {
      const aFound = a.place.status === "found";
      const bFound = b.place.status === "found";
      if (aFound && bFound) return a.place.start - b.place.start || a.root.createdAt.localeCompare(b.root.createdAt);
      if (aFound !== bFound) return aFound ? -1 : 1;
      return a.root.createdAt.localeCompare(b.root.createdAt);
    });
  }

  /**
   * The track records that would bring each found comment's last-known offset
   * up to where its passage is now. Returns the same array when nothing moved.
   * @param {any[]} list @param {string} text
   */
  function refreshTracks(list, text, now) {
    let next = Array.isArray(list) ? list : [];
    for (const thread of buildThreads(next, text)) {
      if (thread.place.status !== "found") continue;
      if (thread.place.start !== thread.anchor.offset) next = track(next, thread.id, thread.place.start, now);
    }
    return next;
  }

  /** The text a search looks in: the quote, every word written in the thread and who wrote it. */
  function searchableText(thread) {
    const parts = [thread.root.anchor.quote, thread.root.text, thread.root.author.name];
    for (const reply of thread.replies) parts.push(reply.text, reply.author.name);
    for (const state of thread.states) parts.push(state.text, state.author.name);
    return parts.join("\n").toLowerCase();
  }

  /**
   * @param {ReturnType<typeof buildThreads>} threads
   * @param {{ query?: string, state?: string, kind?: string }} filter
   */
  function filterThreads(threads, filter = {}) {
    const query = String(filter.query || "").trim().toLowerCase();
    const state = filter.state || "all";
    const kind = filter.kind || "all";
    return threads.filter((thread) => {
      if (state !== "all" && thread.state !== state) return false;
      if (kind !== "all" && thread.root.kind !== kind) return false;
      return !query || searchableText(thread).includes(query);
    });
  }

  /** @param {ReturnType<typeof buildThreads>} threads */
  function countThreads(threads) {
    const counts = { total: threads.length, open: 0, accepted: 0, rejected: 0, completed: 0, lost: 0, byKind: { note: 0, voice: 0, fact: 0, structure: 0 } };
    for (const thread of threads) {
      counts[thread.state] += 1;
      if (thread.lost) counts.lost += 1;
      if (thread.root.kind in counts.byKind) counts.byKind[thread.root.kind] += 1;
    }
    return counts;
  }

  /** @param {any} value */
  const isObject = (value) => !!value && typeof value === "object" && !Array.isArray(value);

  const hasAuthor = (/** @type {any} */ item) => isObject(item.author) && ["writer", "reviewer"].includes(item.author.role);

  /**
   * What is wrong with one record, or "" when it is sound. `roots` holds the
   * ids of the comments seen so far; every other record has to answer one.
   * @param {any} item @param {Set<string>} roots
   */
  function recordProblem(item, roots) {
    if (!isObject(item)) return "must be an object";
    if (typeof item.id !== "string" || !item.id) return "id is required";
    if (!TYPES.includes(item.type)) return "unknown type";
    if (item.type === "comment") {
      if (item.rootId !== item.id) return "a comment is its own root";
      if (typeof item.text !== "string") return "text must be a string";
      if (!isObject(item.anchor) || typeof item.anchor.quote !== "string" || !item.anchor.quote
        || typeof item.anchor.prefix !== "string" || typeof item.anchor.suffix !== "string"
        || !Number.isFinite(item.anchor.offset)) return "anchor must carry quote, prefix, suffix and offset";
      if (!hasAuthor(item)) return "author role is required";
      return "";
    }
    if (!roots.has(item.rootId)) return `refers to missing comment ${item.rootId}`;
    if (item.type === "reply" || item.type === "state") {
      if (typeof item.text !== "string") return "text must be a string";
      if (!hasAuthor(item)) return "author role is required";
    }
    if (item.type === "state" && !STATE_REPLIES.includes(item.state)) return "unknown state";
    if (item.type === "track" && !Number.isFinite(item.offset)) return "offset must be a number";
    if (item.type === "tick" && (typeof item.by !== "string" || typeof item.checked !== "boolean")) return "tick needs a name and a flag";
    return "";
  }

  /**
   * Problems with a stored list, as { path, message }. Empty when it is sound.
   * The backup validator (project-disk-backup.js) checks the same rules.
   * @param {any} list
   */
  function validateList(list) {
    const problems = [];
    if (list === undefined) return problems;
    if (!Array.isArray(list)) return [{ path: "", message: "reviewComments must be an array" }];
    const ids = new Set();
    // Comments are collected first: a reply may be stored before its comment
    // only in a damaged list, and that is reported as the reply's problem.
    const roots = new Set(list.filter((item) => isObject(item) && item.type === "comment" && typeof item.id === "string").map((item) => item.id));
    list.forEach((item, index) => {
      const message = recordProblem(item, roots);
      if (message) problems.push({ path: `[${index}]`, message });
      else if (ids.has(item.id)) problems.push({ path: `[${index}].id`, message: `duplicate id ${item.id}` });
      else ids.add(item.id);
    });
    return problems;
  }

  /**
   * What a stored list becomes on the desk: sound records kept as they are,
   * unsound ones dropped. Never throws, so a damaged list opens as far as it
   * can instead of taking the Review Desk with it.
   * @param {any} list
   */
  function sanitize(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const roots = new Set();
    const kept = [];
    for (const item of list) {
      if (recordProblem(item, roots) || seen.has(item.id)) continue;
      seen.add(item.id);
      if (item.type === "comment") roots.add(item.id);
      kept.push(item);
    }
    return kept;
  }

  root.AISystem6ReviewComments = Object.freeze({
    KINDS, STATES, STATE_REPLIES, TYPES, MAX_TEXT,
    createComment, createReply, createStateReply, append, track, tick,
    buildThreads, refreshTracks, filterThreads, countThreads, validateList, sanitize,
  });
})(typeof window !== "undefined" ? window : globalThis);
