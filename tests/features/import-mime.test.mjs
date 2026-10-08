// MIME import: .eml provenance and bodies, .mbox splitting, .mhtml roots.
//
// Every fixture here is built inline as a string. No binary file ships with
// the test, because the point of the importer is exactly the parsing of bytes
// that arrive from the network, and a checked-in blob would hide how each
// header spelling was produced.

import { createRequire } from "node:module";
import { createFeatureTest, root } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const {
  parseMimeMessage,
  extractEmlText,
  extractMboxText,
  extractMhtmlText,
  looksLikeMimeMessage,
  looksLikeMbox,
} = require(`${root}/apps/server/server/importers/mime.js`);

const test = createFeatureTest("import-mime");
const CRLF = "\r\n";

/** Join header lines and a body into one RFC 5322-shaped buffer. */
function email(headers, body) {
  return Buffer.from(headers.join(CRLF) + CRLF + CRLF + body, "utf8");
}

/** Encode bytes as an RFC 2047 base64 encoded-word for a charset label. */
function encodedWord(charset, bytes) {
  return `=?${charset}?B?${Buffer.from(bytes).toString("base64")}?=`;
}

/** Encode an ASCII string to quoted-printable, splitting on a soft break. */
function quotedPrintableAscii(text) {
  return text.split("").join("");
}

// --- Encoded-word subjects ---------------------------------------------------

// "报告" in GBK: B1 A8 B8 E6. Declared as GB2312, the way an older client
// would have written it; the decoder must accept the alias.
const gbkSubject = encodedWord("GBK", [0xb1, 0xa8, 0xb8, 0xe6]);
const gbkEml = email([
  "From: alice@example.com",
  "To: bob@example.com",
  "Subject: " + gbkSubject,
  "Date: Mon, 1 Jan 2024 00:00:00 +0000",
  "MIME-Version: 1.0",
  "Content-Type: text/plain; charset=utf-8",
], "Plain hello");
{
  const out = await extractEmlText(gbkEml);
  test.assert(out.includes("**From:** alice@example.com"), "the From header is quoted in the provenance block");
  test.assert(out.includes("**To:** bob@example.com"), "the To header is quoted");
  test.assert(out.includes("**Subject:** 报告"), "a GBK base64 encoded-word subject decodes");
  test.assert(out.includes("Plain hello"), "the text/plain body is kept");
}

// A UTF-8 Q-encoded subject folded across two header lines: the whitespace at
// the fold is not part of the subject, so the words join without it.
const qSubject = "=?utf-8?Q?=E6=8A=A5?=" + CRLF + " =?utf-8?Q?=E5=91=8A?=";
const qEml = Buffer.from([
  "From: alice@example.com",
  "To: bob@example.com",
  "Subject: " + qSubject,
  "Date: Mon, 1 Jan 2024 00:00:00 +0000",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "Hi",
].join(CRLF), "utf8");
{
  const out = await extractEmlText(qEml);
  test.assert(out.includes("**Subject:** 报告"), "Q-encoded words across a fold join into one subject");
}

// --- Bodies ------------------------------------------------------------------

// "报告" as quoted-printable UTF-8, with a soft line break in the middle.
const qpEml = email([
  "From: alice@example.com",
  "To: bob@example.com",
  "Subject: QP body",
  "Content-Type: text/plain; charset=utf-8",
  "Content-Transfer-Encoding: quoted-printable",
], "=E6=8A=A5=E5=91=8A done=" + CRLF + " well");
{
  const out = await extractEmlText(qpEml);
  test.assert(out.includes("报告 done well"), "quoted-printable UTF-8 Chinese body decodes and soft breaks join");
}

const alternativeEml = email([
  "From: alice@example.com",
  "To: bob@example.com",
  "Subject: Alternative",
  "Content-Type: multipart/alternative; boundary=\"ALT\"",
], [
  "--ALT",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "plain body text",
  "--ALT",
  "Content-Type: text/html; charset=utf-8",
  "",
  "<p>html body text</p>",
  "--ALT--",
  "",
].join(CRLF));
{
  const out = await extractEmlText(alternativeEml);
  test.assert(out.includes("plain body text"), "multipart/alternative prefers the text/plain part");
  test.assert(out.includes("html body text") === false, "the html alternative is not also folded in");
}

const htmlOnlyEml = email([
  "From: alice@example.com",
  "To: bob@example.com",
  "Subject: HTML only",
  "Content-Type: text/html; charset=utf-8",
], "<h1>Title</h1><p>Hello world</p>");
{
  const out = await extractEmlText(htmlOnlyEml);
  test.assert(out.includes("# Title"), "an html-only body is converted to Markdown");
  test.assert(out.includes("Hello world"), "html body text survives conversion");
}

// A quoted reply stays a blockquote; ">quoted" gains the space Markdown needs.
const quotedEml = email([
  "From: alice@example.com",
  "To: bob@example.com",
  "Subject: Reply",
  "Content-Type: text/plain; charset=utf-8",
], "My answer" + CRLF + ">quoted line" + CRLF + "> spaced quote");
{
  const out = await extractEmlText(quotedEml);
  test.assert(out.includes("> quoted line"), "a bare > reply line becomes a Markdown blockquote");
  test.assert(out.includes("> spaced quote"), "an existing blockquote is left alone");
  test.assert(out.includes("My answer"), "the reply text above the quote is kept");
}

// --- Attachments -------------------------------------------------------------

// filename*=UTF-8''%E6%8A=A5... is RFC 2231's spelling of "报告.txt".
const rfc2231Name = "UTF-8''%E6%8A%A5%E5%91%8A.txt";
const attachmentPayload = Buffer.from("attachment bytes", "utf8").toString("base64");
const attachmentEml = email([
  "From: alice@example.com",
  "To: bob@example.com",
  "Subject: With attachment",
  "Content-Type: multipart/mixed; boundary=\"MIX\"",
], [
  "--MIX",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "see attached",
  "--MIX",
  "Content-Type: application/octet-stream; name*=" + rfc2231Name,
  "Content-Disposition: attachment; filename*=" + rfc2231Name,
  "Content-Transfer-Encoding: base64",
  "",
  attachmentPayload,
  "--MIX--",
  "",
].join(CRLF));
{
  const peeled = [];
  const out = await extractEmlText(attachmentEml, {
    peelAttachment: async (name, mimeType, buffer, depth) => {
      peeled.push({ name, mimeType, depth, text: buffer.toString("utf8") });
      return "PEELED " + buffer.toString("utf8");
    },
  });
  test.assert(out.includes("## 附件：报告.txt"), "an RFC 2231 filename* decodes into the attachment heading");
  test.assert(peeled.length === 1, "the peel callback runs once per attachment");
  test.assert(peeled[0].name === "报告.txt", "the callback receives the decoded filename");
  test.assert(peeled[0].mimeType === "application/octet-stream", "the callback receives the part media type");
  test.assert(peeled[0].text === "attachment bytes", "the callback receives the decoded base64 bytes");
  test.assert(peeled[0].depth === 1, "an attachment is peeled one level below its message");
  test.assert(out.includes("PEELED attachment bytes"), "the peeled text is appended under its heading");
}

{
  const out = await extractEmlText(attachmentEml, {
    peelAttachment: async () => {
      throw new Error("boom");
    },
  });
  test.assert(out.includes("## 附件：报告.txt"), "a failed peel keeps the attachment heading");
  test.assert(out.includes("（无法读取：boom）"), "a failed peel becomes a one-line note with the error");
}

{
  const out = await extractEmlText(attachmentEml);
  test.assert(out.includes("- 报告.txt (application/octet-stream, 16 bytes)"), "without a callback attachments are listed with mime and size");
}

// --- mbox --------------------------------------------------------------------

// mboxrd stores a body line that looks like a separator with one extra ">";
// the importer must restore it, and must not mistake it for a new message.
const mboxText = [
  "From alice@example.com Mon Jan  1 00:00:00 2024",
  "From: alice@example.com",
  "To: bob@example.com",
  "Subject: First",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "Body one",
  ">From the start",
  "From bob@example.com Mon Jan  1 00:00:01 2024",
  "From: bob@example.com",
  "To: alice@example.com",
  "Subject: Second",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "Body two",
  "",
].join(CRLF);
const mboxBuffer = Buffer.from(mboxText, "utf8");
{
  const out = await extractMboxText(mboxBuffer);
  test.assert(out.includes("**Subject:** First"), "mbox imports the first message");
  test.assert(out.includes("**Subject:** Second"), "mbox imports the second message");
  test.assert(out.split("**Subject:**").length - 1 === 2, "an escaped >From line does not split a third message");
  test.assert(out.includes("Body one") && out.includes("Body two"), "both mbox bodies are kept");
  test.assert(out.includes("\n\n---\n\n"), "mbox messages are joined with a separator");
  test.assert(out.includes("From the start"), "an mboxrd >From line is unescaped");
  test.assert(out.includes(">From the start") === false, "the escaped separator does not survive as a quote");
}

// --- MHTML: the root page out of a saved web archive -----------------------
const mhtml = [
  "From: <Saved by Blink>",
  "Snapshot-Content-Location: https://news.example.com/a/story",
  "Subject: Story",
  "MIME-Version: 1.0",
  'Content-Type: multipart/related; type="text/html"; boundary="----MultipartBoundary--x"',
  "",
  "------MultipartBoundary--x",
  "Content-Type: text/html",
  "Content-Transfer-Encoding: quoted-printable",
  "",
  "<html><head><title>Story</title></head><body><h1>=E6=A0=87=E9=A2=98</h1><p>A long en=",
  "ough paragraph of the saved story.</p></body></html>",
  "------MultipartBoundary--x",
  "Content-Type: image/png",
  "Content-Transfer-Encoding: base64",
  "Content-Location: https://news.example.com/a/pic.png",
  "",
  "iVBORw0KGgo=",
  "------MultipartBoundary--x--",
  "",
].join(CRLF);
{
  let base = "";
  const out = extractMhtmlText(Buffer.from(mhtml, "utf8"), {
    htmlToText: (html, baseUrl) => {
      base = baseUrl;
      return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    },
  });
  test.assert(out.includes("标题"), "the quoted-printable root page decodes as UTF-8");
  test.assert(out.includes("A long enough paragraph"), "a soft line break inside the page is joined");
  test.assert(base === "https://news.example.com/a/story", "the converter is given the page the snapshot came from");
  test.assert(!out.includes("iVBOR"), "the image part is not read as text");
  test.assert(extractMhtmlText(Buffer.from(mhtml, "utf8")).includes("标题"), "without a converter the shared HTML extractor reads the page");
}

// --- Nesting: mixed > related > html ---------------------------------------
const nested = [
  "From: Writer <w@example.com>",
  "To: Editor <e@example.com>",
  "Subject: Nested",
  "MIME-Version: 1.0",
  'Content-Type: multipart/mixed; boundary="outer"',
  "",
  "--outer",
  'Content-Type: multipart/related; boundary="inner"',
  "",
  "--inner",
  "Content-Type: text/html; charset=utf-8",
  "",
  "<p>Inner html body text</p>",
  "--inner--",
  "--outer--",
  "",
].join(CRLF);
{
  const out = await extractEmlText(Buffer.from(nested, "utf8"));
  test.assert(out.includes("Inner html body text"), "a body nested two multiparts deep is found");
  test.assert(out.includes("**From:** Writer <w@example.com>"), "the sender is quoted verbatim");
}

// --- Sniffing ----------------------------------------------------------------
test.assert(looksLikeMimeMessage(Buffer.from(nested, "utf8")), "a mail message is recognised");
test.assert(!looksLikeMimeMessage(Buffer.from("Dear diary,\nFrom today on I write.\n", "utf8")), "a note that mentions From is not mail");
test.assert(looksLikeMbox(mboxBuffer), "an mbox is recognised by its From line and headers");
test.assert(!looksLikeMbox(Buffer.from("From the desk of a writer\n\nBody", "utf8")), "a body starting with From is not a mailbox");


// Raw UTF-8 in a header (RFC 6532), as most mail clients now write it.
{
  const raw = Buffer.from("From: 编辑 <editor@example.com>\r\nTo: 作者 <w@example.com>\r\nSubject: 修改意见\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n正文", "utf8");
  const out = await extractEmlText(raw);
  test.assert(out.includes("**From:** 编辑 <editor@example.com>") && out.includes("**Subject:** 修改意见"), "a raw UTF-8 header is read as UTF-8");
}


// --- Through the import route, as a dropped file arrives -------------------
// The route sniffs the bytes, skips MarkItDown for a mail container and
// peels it: the same path File Floppy and Reader take.
{
  const { extractImportedText } = require("../../apps/server/server/routes/import-text.js");
  const routed = await extractImportedText("note.eml", "message/rfc822", Buffer.from(
    "From: 编辑 <e@example.com>\r\nTo: 作者 <w@example.com>\r\nSubject: 第三段\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n论据还不够。",
    "utf8"
  ), { modelExecution: "client" });
  test.assert(routed.includes("**From:** 编辑 <e@example.com>") && routed.includes("论据还不够。"), "a dropped .eml is read through the import route with its sender quoted");
}

test.finish();
