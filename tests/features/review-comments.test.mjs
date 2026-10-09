// Review Desk comments: the anchor that survives edits, the thread that only
// grows, the marks that follow the text, and the Reader clip's own anchor.
// Every module runs as written, in a bare context (no DOM).

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("review-comments");
const eq = (actual, expected, message) => test.assert(
  JSON.stringify(actual) === JSON.stringify(expected),
  `${message} (got ${JSON.stringify(actual)})`,
);

const context = vm.createContext({ window: {}, console });
context.globalThis = context.window;
vm.runInContext(read("app/core/text-quote.js"), context);
vm.runInContext(read("app/core/review-comments.js"), context);
const Quote = context.window.AISystem6TextQuote;
const Comments = context.window.AISystem6ReviewComments;

// ---- A. TextQuote re-anchoring ----------------------------------------------

const manuscript = "第一段先交代背景。这是一句话。第二段写了很多别的东西。结尾这是一句话。完。";
const first = manuscript.indexOf("这是一句话");
const anchor = Quote.createAnchor(manuscript, first, first + 5);
eq([anchor.quote, anchor.offset], ["这是一句话", first], "an anchor records the quote and where it stood");
test.assert(anchor.prefix.endsWith("交代背景。") && anchor.suffix.startsWith("。第二段"), "and the words either side of it");
test.assert(Quote.createAnchor(manuscript, 4, 4) === null && Quote.createAnchor(manuscript, 0, 0) === null, "an empty selection anchors nothing");
test.assert(Quote.createAnchor("   ", 0, 3) === null, "so does a selection of only spaces");

// The same words stand twice. Typing in front of the passage moves it, and the
// copy whose neighbours still match wins over the copy nearest the old offset.
const typedBefore = `补上的一整段话，把后面的一切都往后推。${manuscript}`;
let place = Quote.resolveAnchor(typedBefore, anchor);
eq([place.status, place.how, place.start], ["found", "context", typedBefore.indexOf("这是一句话")], "text typed before the passage moves the anchor, and the context picks the right copy");
test.assert(place.moved === true, "and it is reported as moved");

// An edit just after the passage breaks the suffix but not the prefix.
const editedAfter = manuscript.replace("。第二段", "，也就是说。第二段");
place = Quote.resolveAnchor(editedAfter, anchor);
eq([place.status, place.how, place.start], ["found", "side", first], "an edit beside the passage still finds it, from the side that is intact");

// Both neighbours rewritten: only the offset is left to choose between copies.
const rewritten = "起笔全改了。这是一句话。中段也改了。又一处这是一句话。收束。";
const firstCopy = rewritten.indexOf("这是一句话");
const lastCopy = rewritten.lastIndexOf("这是一句话");
const nearOffset = Quote.resolveAnchor(rewritten, { ...anchor, offset: firstCopy + 2 });
eq([nearOffset.status, nearOffset.how], ["found", "nearest"], "with no neighbour left, the copy nearest the old offset is taken");
test.assert(nearOffset.start === firstCopy && Quote.resolveAnchor(rewritten, { ...anchor, offset: lastCopy - 1 }).start === lastCopy, "and which copy that is follows the offset");

// The passage is edited inside, or deleted: lost, and never a guessed position.
const single = "第一段先交代背景。这是一句话。第二段写了很多别的东西。完。";
const singleAnchor = Quote.createAnchor(single, single.indexOf("这是一句话"), single.indexOf("这是一句话") + 5);
for (const [label, text] of [
  ["edited inside", single.replace("这是一句话", "这是一句改过的话")],
  ["deleted", "第一段先交代背景。第二段写了很多别的东西。完。"],
  ["empty", ""],
]) {
  place = Quote.resolveAnchor(text, singleAnchor);
  eq([place.status, place.start, place.end], ["lost", -1, -1], `a passage ${label} is lost, with no position`);
}
test.assert(Quote.resolveAnchor(manuscript, null).status === "lost", "an anchor that is not there at all is lost");
// ... and found again when the words come back (an undo, a restored version).
test.assert(Quote.resolveAnchor(manuscript, anchor).status === "found", "a lost passage is found again when its words return");

const pair = "表情😀很重要";
const emoji = Quote.createAnchor(pair, 2, 3);
test.assert(emoji.quote === "😀", "a selection that ends inside a surrogate pair is moved to the pair's edge");

// ---- B. threads only grow ---------------------------------------------------

let ids = 0;
const nextId = () => `id-${(ids += 1)}`;
const writer = { role: "writer", name: "" };
const reviewer = { role: "reviewer", name: "小周" };
const comment = Comments.createComment({ id: nextId(), now: "2026-10-09T10:00:00.000Z", kind: "voice", text: "这句像嘴替，没有你自己的细节。", author: reviewer, anchor });
test.assert(comment && comment.id === comment.rootId && comment.replyTo === "", "a comment is the root of its own thread");
test.assert(Comments.createComment({ text: "x", author: { role: "reviewer", name: "  " }, anchor }) === null, "a reviewer must be named, or the words would read as the writer's");
test.assert(Comments.createComment({ text: "", author: writer, anchor }) === null, "an empty comment is not a comment");
test.assert(Comments.createComment({ text: "x", author: writer, anchor: { quote: "" } }) === null, "a comment with nothing quoted points at nothing");

let list = Comments.append([], comment);
const afterComment = list;
const reply = Comments.createReply({ id: nextId(), now: "2026-10-09T10:05:00.000Z", rootId: comment.id, text: "我是故意这么写的。", author: writer });
list = Comments.append(list, reply);
const state = Comments.createStateReply({ id: nextId(), now: "2026-10-09T10:10:00.000Z", rootId: comment.id, state: "accepted", text: "好，改。", author: reviewer });
list = Comments.append(list, state);

test.assert(afterComment.length === 1 && afterComment[0] === comment, "appending returns a new list and leaves the old one as it was");
eq(list.slice(0, 1), [comment], "the comment is the same record after replies and a state came in");
test.assert(JSON.stringify(list[0]) === JSON.stringify(comment) && comment.text === "这句像嘴替，没有你自己的细节。", "its words are untouched");
eq(Comments.buildThreads(list, manuscript)[0].state, "accepted", "the thread's state is its latest state reply");
const reopened = Comments.append(list, Comments.createStateReply({ id: nextId(), rootId: comment.id, state: "open", author: writer }));
eq(Comments.buildThreads(reopened, manuscript)[0].state, "open", "a reopening is another state reply, not an edit");
test.assert(reopened.length === list.length + 1 && reopened.slice(0, list.length).every((record, index) => record === list[index]), "every earlier record is kept as it was");
eq(Comments.buildThreads(list, manuscript)[0].replies.map((item) => item.text), ["我是故意这么写的。"], "a reply keeps its words verbatim");
test.assert(Comments.append(list, { ...reply }) === null, "a duplicate id is refused");
test.assert(Comments.append(list, Comments.createReply({ rootId: "nobody", text: "?", author: writer })) === null, "a reply to a comment that is not there is refused");
test.assert(Comments.append(list, { id: "x", type: "state", rootId: comment.id, state: "deleted", text: "", author: writer, createdAt: "z" }) === null, "an unknown state is refused");
test.assert(Comments.createStateReply({ rootId: comment.id, state: "deleted", author: writer }) === null, "and cannot be made");

// The private tick is a flag beside the thread, not a reply and not a state.
const ticked = Comments.tick(list, comment.id, "小周", true);
const thread = Comments.buildThreads(ticked, manuscript)[0];
eq(thread.ticks, ["小周"], "a reviewer's tick is recorded under their name");
eq([thread.replies.length, thread.states.length, thread.state], [1, 1, "accepted"], "and changes neither the replies nor the state");
test.assert(ticked.slice(0, list.length).every((record, index) => record === list[index]), "the thread's own records are untouched by a tick");
eq(Comments.buildThreads(Comments.tick(ticked, comment.id, "小周", false), manuscript)[0].ticks, [], "a tick can be taken off");

// Following edits moves the bookkeeping, never the words.
const moved = Comments.refreshTracks(list, typedBefore);
const movedThread = Comments.buildThreads(moved, typedBefore)[0];
test.assert(movedThread.anchor.offset === typedBefore.indexOf("这是一句话") && movedThread.root === comment, "the last-known offset follows the passage while the comment itself stays the same record");
test.assert(Comments.refreshTracks(moved, typedBefore) === moved, "and nothing is written when nothing moved");
const lostThread = Comments.buildThreads(list, "全删了")[0];
test.assert(lostThread.lost && lostThread.root.anchor.quote === "这是一句话", "a thread whose passage is gone is flagged lost and keeps its original quote");
test.assert(Comments.refreshTracks(list, "全删了") === list, "losing a passage does not write a made-up offset");

// ---- C. filters, search, counts, order --------------------------------------

const second = Comments.createComment({ id: nextId(), now: "2026-10-09T11:00:00.000Z", kind: "fact", text: "这个数字要核一下", author: writer, anchor: Quote.createAnchor(manuscript, manuscript.indexOf("第二段"), manuscript.indexOf("第二段") + 3) });
const third = Comments.createComment({ id: nextId(), now: "2026-10-09T12:00:00.000Z", kind: "note", text: "这段已经删了", author: writer, anchor: { quote: "不存在的一句", prefix: "", suffix: "", offset: 3 } });
let all = list;
for (const record of [second, third]) all = Comments.append(all, record);
const threads = Comments.buildThreads(all, manuscript);
eq(threads.map((item) => item.id), [comment.id, second.id, third.id], "threads follow the document, and a lost one comes last");
eq(Comments.countThreads(threads), { total: 3, open: 2, accepted: 1, rejected: 0, completed: 0, lost: 1, byKind: { note: 1, voice: 1, fact: 1, structure: 0 } }, "counts by state and kind, with the lost ones");
eq(Comments.filterThreads(threads, { state: "open" }).map((item) => item.id), [second.id, third.id], "filter by state");
eq(Comments.filterThreads(threads, { kind: "voice" }).map((item) => item.id), [comment.id], "filter by kind");
eq(Comments.filterThreads(threads, { query: "小周" }).map((item) => item.id), [comment.id], "search finds who wrote it");
eq(Comments.filterThreads(threads, { query: "故意" }).map((item) => item.id), [comment.id], "and finds words in a reply");
eq(Comments.filterThreads(threads, { query: "这是一句话" }).map((item) => item.id), [comment.id], "and the quoted passage");
eq(Comments.filterThreads(threads, { query: "没有这个词" }), [], "and nothing when nothing matches");

// ---- D. a damaged list opens as far as it can --------------------------------

const damaged = [comment, { id: "r", type: "reply", rootId: "gone", text: "孤儿", author: writer, createdAt: "z" }, null, { ...comment }, reply];
eq(Comments.sanitize(damaged).map((item) => item.id), [comment.id, reply.id], "sanitize keeps the sound records and drops orphans, junk and duplicates");
test.assert(Comments.validateList(damaged).length >= 2, "the validator names what is wrong");
eq(Comments.validateList(list), [], "a sound list has no problems");
eq(Comments.sanitize("not a list"), [], "and a list that is not a list is empty");

// ---- E. Reader clips store an anchor ---------------------------------------------

{
  const source = read("app/features/scrapbook.js");
  const start = source.indexOf("function getReaderSelectionContext");
  let depth = 0;
  let end = start;
  for (let index = source.indexOf("{", start); index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") { depth -= 1; if (depth === 0) { end = index + 1; break; } }
  }
  const page = "Intro   line.\n\nThe mouthpiece  sounds like\nno one in particular.  Another sentence follows here, and then a long way on, the end.";
  const body = { innerText: page, closest: () => body };
  const clipContext = vm.createContext({
    readerContentEl: { querySelector: () => body },
    currentReaderPage: { text: page },
  });
  vm.runInContext(`${source.slice(start, end)}\nglobalThis.__context = getReaderSelectionContext;`, clipContext);
  const selection = { rangeCount: 1, getRangeAt: () => ({ commonAncestorContainer: { parentElement: body } }) };
  const result = clipContext.__context(selection, "mouthpiece  sounds like\nno one");
  test.assert(result.anchor && result.anchor.quote === "mouthpiece sounds like no one", "a new clip carries the quote it was taken from");
  const collapsed = Quote.collapse(page);
  const found = Quote.resolveAnchor(collapsed, result.anchor);
  test.assert(found.status === "found" && collapsed.slice(found.start, found.end) === result.anchor.quote, "and the quote is found again in the page's own text");
  test.assert(result.anchor.prefix.length === 32 || result.anchor.prefix === collapsed.slice(0, result.anchor.offset), "with up to 32 characters of what came before");
  const shifted = Quote.resolveAnchor(`A new paragraph went in front. ${collapsed}`, result.anchor);
  test.assert(shifted.status === "found" && shifted.how === "context", "even after the page grew in front of it");
  const older = clipContext.__context({ rangeCount: 0 }, "x");
  test.assert(!older.anchor, "a selection that cannot be placed stores no anchor, as every clip did before");
  test.assert(Quote.resolveAnchor(collapsed, undefined).status === "lost", "a clip made before anchors has none, and resolving it simply finds nothing");
}

test.finish();
