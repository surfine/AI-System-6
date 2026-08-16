// The shape of speech — structure only, never a word.
//
// Ten minutes of talking arrives as one unbroken run: no paragraphs, no list
// where the speaker counted things off, question and answer stuck together.
// Giving it a shape is the one job the person who just stopped talking least
// wants to do, so this does it here, on the machine, with no model in the loop.
//
// The rule this module exists to keep is that it may insert line breaks and
// nothing else. No filler word removed, no false start repaired, no clause
// tightened, no punctuation reinterpreted. "嘛、其实、就是、然后、emmm", the
// self-interruptions and the small repetitions are the part that proves a
// person said it, and this product keeps them on purpose.
//
// That rule is not a promise in a comment. Every result goes through
// dictationShapeIsVerbatim() before it may leave: strip the line breaks the
// shaper is allowed to add and the speaker's own text must come back,
// character for character. A result that fails is thrown away whole, and the
// caller says so.
//
// Text in, text out: no DOM, no record, no translations, so the feature test
// runs it in a bare vm and can swap the shaper for a word-changing one to prove
// the gate really closes.

// A sentence ends at Chinese terminal punctuation, or at Latin terminal
// punctuation that is actually the end of something (a period inside "3.5" or
// "v1.2" is not). Trailing spaces are taken with the terminator so the break
// lands after them: the next word starts its line, and the space it used to
// have is still there, at the end of the line before.
const dictationShapeTerminator = /[。！？；…]+[ \t]*|[.!?]+(?=[ \t]|$)[ \t]*/g;

// The speaker's own "第一" is the bullet. A "- " would be a character nobody
// said, and the whole point of this module is that nothing is added but shape.
const dictationShapeEnumerator = /^(?:第[一二三四五六七八九十\d](?![次名年月日种类步天回])|[一二三四五六七八九十]是|首先|其次|再者|最后|(?:first|second|third|fourth|fifth|next|finally|last)(?:ly)?\b)/i;

// Dictated speech often arrives with no punctuation at all. The numbers the
// speaker counted off are then the only boundary there is, so they also break
// a run mid-sentence — and a zero-width split consumes nothing.
const dictationShapeEnumeratorInline = /(?!^)(?=第[一二三四五六七八九十](?![次名年月日种类步天回]))/;

// Where a speaker turns to the next thing. On its own this is not enough to
// start a paragraph — spoken Chinese begins half its sentences with "然后".
const dictationShapePivot = /^(?:然后|但是|不过|所以|另外|对了|还有|总之|后来|反正|回到|(?:so|but|anyway|also|okay|now|actually|well)\b)/i;

// A paragraph that grows past this stops being a paragraph.
const DICTATION_SHAPE_MAX_SENTENCES = 4;
const DICTATION_SHAPE_MAX_CHARS = 180;

// Everything this shaper is allowed to add, and the only thing it adds.
function dictationShapeSignature(text) {
  return String(text ?? "").replace(/\n/g, "");
}

// The gate. Remove the structure and the two texts must be the same text.
function dictationShapeIsVerbatim(source, shaped) {
  return dictationShapeSignature(shaped) === dictationShapeSignature(source);
}

// Slices only — the parts concatenate back into the segment exactly.
function dictationShapeSentences(segment) {
  const sentences = [];
  let start = 0;
  dictationShapeTerminator.lastIndex = 0;
  for (let match = dictationShapeTerminator.exec(segment); match; match = dictationShapeTerminator.exec(segment)) {
    const end = match.index + match[0].length;
    if (end > start) sentences.push(segment.slice(start, end));
    start = end;
  }
  if (start < segment.length) sentences.push(segment.slice(start));
  return sentences.length ? sentences : [segment];
}

// One sentence finds its line. Items and questions get their own; ordinary
// prose collects into the paragraph above it until the speaker turns away from
// the subject or the paragraph simply gets long.
function dictationShapePlace(lines, sentence) {
  const head = sentence.replace(/^\s+/, "");
  const previous = lines[lines.length - 1];
  if (dictationShapeEnumerator.test(head)) {
    lines.push({ kind: "item", text: sentence, count: 1 });
    return;
  }
  if (/[？?][ \t]*$/.test(sentence)) {
    lines.push({ kind: "question", text: sentence, count: 1 });
    return;
  }
  // What follows a question is the answer to it, and it belongs directly under
  // the question rather than adrift in the next paragraph.
  if (previous?.kind === "question") {
    lines.push({ kind: "answer", text: sentence, count: 1 });
    return;
  }
  if (
    previous?.kind === "paragraph"
    && previous.count < DICTATION_SHAPE_MAX_SENTENCES
    && previous.text.length < DICTATION_SHAPE_MAX_CHARS
    && !(previous.count >= 2 && dictationShapePivot.test(head))
  ) {
    previous.text += sentence;
    previous.count += 1;
    return;
  }
  lines.push({ kind: "paragraph", text: sentence, count: 1 });
}

// A stretch with no line break in it already.
function dictationShapeSegment(segment) {
  if (!segment.trim()) return segment;
  const lines = [];
  for (const sentence of dictationShapeSentences(segment)) {
    for (const piece of sentence.split(dictationShapeEnumeratorInline)) {
      if (piece) dictationShapePlace(lines, piece);
    }
  }
  return lines.map((line, index) => {
    if (!index) return line.text;
    const previous = lines[index - 1];
    // Counted items sit together, and an answer sits under its question. A
    // blank line between them would read as two subjects, not one list.
    const tight = (line.kind === "item" && previous.kind === "item")
      || (line.kind === "answer" && previous.kind === "question");
    return `${tight ? "\n" : "\n\n"}${line.text}`;
  }).join("");
}

// Line breaks the writer already made are boundaries this keeps: each stretch
// between them is shaped on its own and the break stays where it was. That is
// also why running this twice cannot change anything the first run decided —
// every decision reads only the stretch it is inside.
function dictationShapeRun(text) {
  return String(text ?? "")
    .split(/(\n+)/)
    .map((piece, index) => (index % 2 === 1
      ? (piece.length > 1 ? "\n\n" : "\n")
      : dictationShapeSegment(piece)))
    .join("");
}

// The one door. Returns the shaped text, or null when shaping would have
// touched the words — in which case the caller must land nothing and say so.
function shapeDictationText(source) {
  const text = String(source ?? "");
  let shaped;
  try {
    shaped = dictationShapeRun(text);
  } catch {
    return null;
  }
  return dictationShapeIsVerbatim(text, shaped) ? shaped : null;
}

// How many blocks the writer got, for the line that reports what happened.
function dictationShapeBlockCount(text) {
  return String(text ?? "").split(/\n{2,}/).filter((block) => block.trim()).length;
}
