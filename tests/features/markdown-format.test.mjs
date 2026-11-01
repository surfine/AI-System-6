// The formatting engine behind the writing surfaces, exercised as a pure
// function: same semantics as apps/desktop/app/core/markdown-editor.js
// (mdeToggleWrap / mdeIsLoneMarker / mdeLink / mdeIndent), but without the DOM,
// so each rule can be pinned by input and output alone.
import test from "node:test";
import assert from "node:assert/strict";
import { FORMAT_COMMANDS, applyFormat, formatMarkdown } from "../../tooling/vendor/writing-editor/format.mjs";

// Run a command over a selection and return the resulting document, selection
// and caret, the three things the host actually needs.
function run(text, from, to, command) {
  const result = formatMarkdown(text, from, to, command);
  if (!result) return null;
  return { text: applyFormat(text, result), anchor: result.anchor, head: result.head };
}

function textOf(text, from, to, command) {
  const out = run(text, from, to, command);
  assert.ok(out, command + " produced a result");
  return out.text;
}

function selectionOf(text, from, to, command) {
  const out = run(text, from, to, command);
  assert.ok(out, command + " produced a result");
  return out.text.slice(out.anchor, out.head);
}

test("FORMAT_COMMANDS lists every supported command once", () => {
  const expected = [
    "bold", "italic", "strike", "code", "link",
    "heading-0", "heading-1", "heading-2", "heading-3",
    "quote", "bullet", "numbered", "task",
    "indent", "outdent", "code-block", "rule", "table",
  ];
  assert.deepEqual([...FORMAT_COMMANDS], expected);
  assert.equal(new Set(FORMAT_COMMANDS).size, FORMAT_COMMANDS.length);
});

test("an unknown command and degenerate selections do not throw", () => {
  assert.equal(formatMarkdown("hello", 0, 0, "nope"), null);
  assert.equal(formatMarkdown("", 0, 0, "bold")?.insert, "****");
  assert.equal(formatMarkdown("", 0, 0, "rule")?.insert, "---\n");
  assert.equal(formatMarkdown("", 0, 0, "quote")?.insert, "");
  assert.equal(applyFormat("abc", null), "abc");

  // Offsets outside the document clamp instead of producing a bad slice.
  assert.equal(textOf("abc", 0, 99, "bold"), "**abc**");
  assert.equal(textOf("abc", 5, 9, "bold"), "abc****");
  assert.equal(textOf("", 7, 7, "bullet"), "");
});

test("bold wraps, unwraps from inside, and unwraps from outside", () => {
  assert.equal(textOf("hello world", 0, 5, "bold"), "**hello** world");
  assert.equal(textOf("**hello** world", 2, 7, "bold"), "hello world");
  assert.equal(textOf("**hello** world", 0, 9, "bold"), "hello world");
  assert.equal(selectionOf("**hello** world", 2, 7, "bold"), "hello");
  assert.equal(selectionOf("hello world", 0, 5, "bold"), "hello");
  assert.equal(textOf("未来通车之后", 0, 6, "bold"), "**未来通车之后**");
});

test("bold toggling twice restores the original text", () => {
  const once = run("hello world", 0, 5, "bold");
  const twice = run(once.text, once.anchor, once.head, "bold");
  assert.equal(twice.text, "hello world");
});

test("italic marks a word, and a single * inside ** is not italic markup", () => {
  assert.equal(textOf("hello world", 6, 11, "italic"), "hello *world*");
  assert.equal(textOf("*hello* world", 1, 6, "italic"), "hello world");
  assert.equal(selectionOf("*hello* world", 1, 6, "italic"), "hello");

  // The lone marker check: "*" must not match inside the run "**".
  assert.equal(textOf("**bold**", 0, 8, "italic"), "***bold***");
  assert.equal(selectionOf("**bold**", 0, 8, "italic"), "**bold**");
});

test("italic and code toggling twice restore the original text", () => {
  const italicOnce = run("未来通车之后", 0, 6, "italic");
  assert.equal(italicOnce.text, "*未来通车之后*");
  const italicTwice = run(italicOnce.text, italicOnce.anchor, italicOnce.head, "italic");
  assert.equal(italicTwice.text, "未来通车之后");

  // A lone backtick marker follows the same rule as "*".
  const codeOnce = run("npm run test", 0, 3, "code");
  assert.equal(codeOnce.text, "`npm` run test");
  const codeTwice = run(codeOnce.text, codeOnce.anchor, codeOnce.head, "code");
  assert.equal(codeTwice.text, "npm run test");
});

test("strike wraps and unwraps, and needs a lone marker pair", () => {
  assert.equal(textOf("done today", 0, 4, "strike"), "~~done~~ today");
  assert.equal(selectionOf("done today", 0, 4, "strike"), "done");
  assert.equal(textOf("", 0, 0, "strike"), "~~~~");
  // An empty selection between two runs of "~" is not a marker pair, so it wraps.
  assert.equal(textOf("~~done~~", 2, 2, "strike"), "~~~~~~done~~");
});

test("link puts the caret in the URL slot, or in the label slot when empty", () => {
  const withSelection = run("see the docs", 4, 12, "link");
  assert.equal(withSelection.text, "see [the docs]()");
  assert.equal(withSelection.anchor, withSelection.head);
  // Inside the parentheses: exactly between "(" and ")".
  assert.equal(withSelection.text[withSelection.anchor - 1], "(");
  assert.equal(withSelection.text[withSelection.anchor], ")");

  const empty = run("abc", 3, 3, "link");
  assert.equal(empty.text, "abc[]()");
  // Inside the brackets: between "[" and "]".
  assert.equal(empty.text[empty.anchor - 1], "[");
  assert.equal(empty.text[empty.anchor], "]");

  const atEnd = run("", 0, 0, "link");
  assert.equal(atEnd.text, "[]()");
  assert.equal(atEnd.anchor, 1);
});

test("headings set and clear a level while keeping a trailing section id", () => {
  assert.equal(textOf("hello {#a7f3c1}", 0, 0, "heading-2"), "## hello {#a7f3c1}");
  assert.equal(textOf("## hello {#a7f3c1}", 0, 0, "heading-0"), "hello {#a7f3c1}");
  assert.equal(textOf("###### deep {#a7f3c1}", 0, 0, "heading-1"), "# deep {#a7f3c1}");
  assert.equal(textOf("### old", 0, 0, "heading-3"), "### old");
});

test("heading-2 then heading-0 restores a plain line", () => {
  const once = run("plain line", 0, 0, "heading-2");
  assert.equal(once.text, "## plain line");
  const twice = run(once.text, once.anchor, once.head, "heading-0");
  assert.equal(twice.text, "plain line");
});

test("headings apply to every touched line and keep the caret on its line", () => {
  // A selection ending at column 0 of line three leaves that line untouched.
  assert.equal(textOf("one\ntwo\nthree", 0, 4, "heading-1"), "# one\ntwo\nthree");
  assert.equal(textOf("one\ntwo\nthree", 0, 7, "heading-1"), "# one\n# two\nthree");
  // An empty line inside a block stays empty.
  assert.equal(textOf("one\n\ntwo", 0, 8, "heading-2"), "## one\n\n## two");
  // An empty single line does take the marker, so it can be typed into.
  assert.equal(textOf("", 0, 0, "heading-2"), "## ");
  // A caret on an empty line lands after the new marker, where typing goes on.
  const emptyCaret = run("", 0, 0, "heading-2");
  assert.equal(emptyCaret.anchor, 3);
  assert.equal(emptyCaret.head, 3);

  // A caret on line two touches line two only, and stays between "t" and "w".
  const caret = run("one\ntwo", 5, 5, "heading-1");
  assert.equal(caret.text, "one\n# two");
  assert.equal(caret.anchor, 7);
  assert.equal(caret.text.slice(caret.anchor - 3, caret.anchor), "# t");
  assert.equal(caret.text[caret.anchor], "w");
});

test("quote toggles on every non-empty touched line", () => {
  assert.equal(textOf("hello", 0, 0, "quote"), "> hello");
  assert.equal(textOf("> hello", 0, 0, "quote"), "hello");
  assert.equal(textOf("a\n\nb", 0, 4, "quote"), "> a\n\n> b");
  assert.equal(textOf("> a\n\n> b", 0, 0, "quote"), "a\n\n> b");
  assert.equal(textOf("", 0, 0, "quote"), "");
});

test("quote toggling twice restores the original text", () => {
  const once = run("未来通车之后", 0, 6, "quote");
  assert.equal(once.text, "> 未来通车之后");
  const twice = run(once.text, 0, once.text.length, "quote");
  assert.equal(twice.text, "未来通车之后");
});

test("bullet adds after the indent, strips other markers, and toggles off", () => {
  assert.equal(textOf("hello", 0, 0, "bullet"), "- hello");
  assert.equal(textOf("  hello", 0, 0, "bullet"), "  - hello");
  assert.equal(textOf("1. hello", 0, 0, "bullet"), "- hello");
  assert.equal(textOf("- [ ] hello", 0, 0, "bullet"), "- hello");
  assert.equal(textOf("- a\n- b", 0, 7, "bullet"), "a\nb");
  assert.equal(textOf("one\ntwo", 0, 7, "bullet"), "- one\n- two");
});

test("bullet toggling twice restores the original text", () => {
  const once = run("one\ntwo", 0, 7, "bullet");
  assert.equal(once.text, "- one\n- two");
  const twice = run(once.text, 0, once.text.length, "bullet");
  assert.equal(twice.text, "one\ntwo");
});

test("numbered numbers the non-empty lines from one", () => {
  assert.equal(textOf("one\ntwo\nthree", 0, 13, "numbered"), "1. one\n2. two\n3. three");
  assert.equal(textOf("one\n\ntwo", 0, 8, "numbered"), "1. one\n\n2. two");
  assert.equal(textOf("- one\n- two", 0, 11, "numbered"), "1. one\n2. two");
  assert.equal(textOf("  1. a", 0, 0, "numbered"), "  a");
  assert.equal(textOf("", 0, 0, "numbered"), "");
});

test("numbered toggling twice restores the original text", () => {
  const once = run("alpha\nbeta", 0, 10, "numbered");
  assert.equal(once.text, "1. alpha\n2. beta");
  const twice = run(once.text, 0, once.text.length, "numbered");
  assert.equal(twice.text, "alpha\nbeta");
});

test("task toggles a checkbox and strips the other list markers", () => {
  assert.equal(textOf("todo", 0, 0, "task"), "- [ ] todo");
  assert.equal(textOf("1. todo", 0, 0, "task"), "- [ ] todo");
  assert.equal(textOf("- [x] todo", 2, 2, "task"), "todo");
  assert.equal(textOf("- [ ] a\n- [x] b", 0, 17, "task"), "a\nb");
  assert.equal(textOf("a\nb", 0, 3, "task"), "- [ ] a\n- [ ] b");
});

test("task toggling twice restores the original text", () => {
  const once = run("todo", 0, 4, "task");
  assert.equal(once.text, "- [ ] todo");
  const twice = run(once.text, 0, once.text.length, "task");
  assert.equal(twice.text, "todo");
});

test("indent indents every touched line and always acts", () => {
  assert.equal(textOf("hello", 0, 0, "indent"), "  hello");
  assert.equal(textOf("one\ntwo", 0, 7, "indent"), "  one\n  two");
  assert.equal(textOf("one\ntwo", 0, 3, "indent"), "  one\ntwo");
  assert.equal(selectionOf("one\ntwo", 0, 3, "indent"), "one");
  // Plain text is indented too; the host decides when Tab keeps its default.
  assert.notEqual(formatMarkdown("plain", 0, 0, "indent"), null);
});

test("outdent removes up to two spaces or one tab", () => {
  assert.equal(textOf("  hello", 2, 2, "outdent"), "hello");
  assert.equal(textOf(" hello", 1, 1, "outdent"), "hello");
  assert.equal(textOf("\thello", 1, 1, "outdent"), "hello");
  assert.equal(textOf("hello", 0, 0, "outdent"), "hello");
  assert.equal(textOf("  one\n    two", 0, 13, "outdent"), "one\n  two");
});

test("code-block wraps the touched lines in fences, top and bottom", () => {
  assert.equal(textOf("const a = 1;", 0, 0, "code-block"), "```\nconst a = 1;\n```");
  assert.equal(textOf("a\nb", 0, 3, "code-block"), "```\na\nb\n```");
  // Fence lines are added to the block, so the selection follows the body.
  assert.equal(selectionOf("a\nb", 0, 3, "code-block"), "a\nb");

  const wrapped = run("const a = 1;", 0, 12, "code-block");
  assert.equal(wrapped.text, "```\nconst a = 1;\n```");
  assert.equal(wrapped.text.slice(wrapped.anchor, wrapped.head), "const a = 1;");
});

test("code-block on an empty line makes an empty block with the caret inside", () => {
  const result = run("", 0, 0, "code-block");
  assert.equal(result.text, "```\n\n```");
  assert.equal(result.anchor, 4);
  assert.equal(result.head, 4);
  assert.equal(result.text[result.anchor], "\n");
});

test("code-block toggling twice restores the original text", () => {
  const once = run("a\nb", 0, 3, "code-block");
  assert.equal(once.text, "```\na\nb\n```");
  // The body plus its fences: the anchor lands right after the opening fence's
  // newline, so the selection is exactly the body text.
  assert.equal(once.anchor, 4);
  assert.equal(once.head, 7);
  // Toggle back with the body selected, which is what the first pass selects.
  const twice = run(once.text, 4, 7, "code-block");
  assert.equal(twice.text, "a\nb");
  const fromFence = run(once.text, 0, 0, "code-block");
  assert.equal(fromFence.text, "a\nb");

  const cjkOnce = run("未来通车之后", 0, 6, "code-block");
  assert.equal(cjkOnce.text, "```\n未来通车之后\n```");
  const cjkTwice = run(cjkOnce.text, cjkOnce.anchor, cjkOnce.head, "code-block");
  assert.equal(cjkTwice.text, "未来通车之后");
});

test("rule inserts a horizontal rule after the line containing to", () => {
  const mid = run("one\ntwo", 3, 3, "rule");
  assert.equal(mid.text, "one\n\n---\n\ntwo");
  assert.equal(mid.anchor, mid.head);
  assert.equal(mid.text[mid.anchor - 1], "\n");

  const atEnd = run("one", 0, 3, "rule");
  assert.equal(atEnd.text, "one\n\n---\n");
  assert.equal(atEnd.anchor, atEnd.text.length);
  assert.equal(atEnd.text[atEnd.anchor - 1], "\n");

  // The line containing to is empty, so it becomes the rule itself; the newline
  // that already ended it stays, and the caret stops after the rule.
  const emptyLine = run("one\n\n", 4, 4, "rule");
  assert.equal(emptyLine.text, "one\n---\n");
  assert.equal(emptyLine.anchor, 7);
  assert.equal(emptyLine.text[emptyLine.anchor], "\n");

  // With nothing after it, the rule still ends the document on its own line.
  const emptyLineAtEnd = run("one\n", 4, 4, "rule");
  assert.equal(emptyLineAtEnd.text, "one\n---\n");
});

test("table inserts a skeleton and selects the first placeholder", () => {
  const midDoc = run("one", 3, 3, "table");
  assert.equal(
    midDoc.text,
    "one\n\n| 列 1 | 列 2 | 列 3 |\n| --- | --- | --- |\n|  |  |  |\n",
  );
  assert.equal(midDoc.text.slice(midDoc.anchor, midDoc.head), "列 1");

  const lineStart = run("one\ntwo", 4, 4, "table");
  // The caret already follows a newline, so one blank line is enough.
  assert.equal(lineStart.text, "one\n\n| 列 1 | 列 2 | 列 3 |\n| --- | --- | --- |\n|  |  |  |\ntwo");

  const empty = run("", 0, 0, "table");
  assert.equal(empty.text.startsWith("| 列 1 |"), true);
  assert.equal(empty.anchor, 2);
  assert.equal(empty.text.slice(empty.anchor, empty.head), "列 1");
});

test("touched lines stop at the line boundary of to", () => {
  // to sits at column 0 of line three, so line three is untouched.
  assert.equal(textOf("a\nb\nc", 0, 4, "bullet"), "- a\n- b\nc");
  // to inside line two does touch line two.
  assert.equal(textOf("a\nb\nc", 0, 3, "bullet"), "- a\n- b\nc");
  // An empty selection on line two touches only line two.
  assert.equal(textOf("a\nb\nc", 2, 2, "bullet"), "a\n- b\nc");
});

test("multi-line CJK selections format line by line", () => {
  const doc = "未来通车之后\n路上的车流";
  const bulleted = run(doc, 0, doc.length, "bullet");
  assert.equal(bulleted.text, "- 未来通车之后\n- 路上的车流");
  const headed = run(doc, 0, doc.length, "heading-3");
  assert.equal(headed.text, "### 未来通车之后\n### 路上的车流");
});
