// 文思泉涌 P5 · 联络人.
//
// The corpus's guest list used to be eight lines inside sync_all.sh. It is a
// file now, and this contract owns the desk's half: read it as the writer sees
// it, and toggle entries without ever rewriting the list. "Off" keeps the entry
// visible so turning someone back on is one click.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createRequire } from "node:module";

import { createFeatureTest } from "../helpers/feature-test-harness.mjs";

const require = createRequire(import.meta.url);
const test = createFeatureTest("wensi-d-contacts");

const contacts = require("../../apps/server/server/lib/blog-sites/contacts.js");

const root = mkdtempSync(join(tmpdir(), "wensi-contacts-"));
const toolsDir = join(root, "tools");
mkdirSync(toolsDir, { recursive: true });
const file = join(toolsDir, "contacts.json");

const seed = {
  schema: 1,
  note: "名单说明",
  qq: {
    senders: ["u_a", "u_b", "u_c"],
    disabledSenders: [],
    conversations: [
      { prefix: "231（示例甲）", kind: "c2c", id: "u_a", enabled: true },
      { prefix: "群_AppleTalk（708337741）_五人发言", kind: "group", id: "708337741", enabled: true },
      { prefix: "群_本人与示例乙（1041838344）", kind: "group", id: "1041838344", senders: ["u_a", "u_b"], enabled: true, note: "拍板" },
    ],
  },
};
writeFileSync(file, `${JSON.stringify(seed, null, 2)}\n`);

const site = { schema: 1, id: "probe", label: "probe", channel: { root }, tools: { dir: toolsDir }, contentTypes: {} };

// ---- read ----

const view = contacts.readContacts(site);
test.assert(view.summary.conversations === 3 && view.summary.senders === 3, "the view counts conversations and people");
test.assert(view.qq.conversations[0].prefix === "231（示例甲）" && view.qq.conversations[1].kind === "group", "each conversation keeps its prefix and kind");
test.assert(view.qq.conversations[2].senders.join(",") === "u_a,u_b" && view.qq.conversations[2].note === "拍板", "per-conversation senders and notes survive");
test.assert(/Telegram/.test(view.note), "the view says the other platforms are configured elsewhere");

// ---- toggle a conversation: it stays in the list, marked off ----

const off = contacts.updateContacts(site, { conversations: [{ id: "708337741", kind: "group", enabled: false }] });
test.assert(off.changed.length === 1 && off.changed[0].enabled === false, "turning a conversation off is reported");
const afterOff = JSON.parse(readFileSync(file, "utf8"));
test.assert(afterOff.qq.conversations[1].enabled === false && afterOff.qq.conversations[1].prefix.includes("AppleTalk"),
  "the entry stays in the file with its name intact");
test.assert(afterOff.note === "名单说明" && afterOff.qq.conversations[2].senders.join(",") === "u_a,u_b",
  "everything this edit does not own is copied through");

const backOn = contacts.updateContacts(site, { conversations: [{ id: "708337741", kind: "group", enabled: true }] });
test.assert(backOn.changed[0].enabled === true && JSON.parse(readFileSync(file, "utf8")).qq.conversations[1].enabled === true,
  "turning it back on is the same one-click path");

const noop = contacts.updateContacts(site, { conversations: [{ id: "708337741", kind: "group", enabled: true }] });
test.assert(noop.changed.length === 0 && noop.note.includes("没有要改的"), "a toggle that changes nothing writes nothing");

// ---- people: disabled, not deleted ----

const senderOff = contacts.updateContacts(site, { senders: [{ id: "u_b", enabled: false }] });
test.assert(senderOff.changed.length === 1, "disabling a sender is reported");
const afterSender = JSON.parse(readFileSync(file, "utf8"));
test.assert(afterSender.qq.senders.includes("u_b") && afterSender.qq.disabledSenders.join(",") === "u_b",
  "the sender stays in the list and is marked disabled");
test.assert(contacts.readContacts(site).summary.sendersOff === 1, "the view reports how many people are off");
contacts.updateContacts(site, { senders: [{ id: "u_b", enabled: true }] });
test.assert(JSON.parse(readFileSync(file, "utf8")).qq.disabledSenders.length === 0, "re-enabling removes the mark");

// ---- refusals ----

let code = "";
try { contacts.updateContacts(site, { conversations: [{ id: "nope", enabled: false }] }); } catch (error) { code = error.code; }
test.assert(code === "conversation_missing", "an unknown conversation is a named refusal");
try { contacts.updateContacts(site, { senders: [{ id: "u_zzz", enabled: false }] }); } catch (error) { code = error.code; }
test.assert(code === "sender_missing", "an unknown sender is a named refusal");

writeFileSync(file, "{ broken");
try { contacts.readContacts(site); } catch (error) { code = error.code; }
test.assert(code === "contacts_unreadable", "a broken file is reported, not guessed at");
try { contacts.updateContacts(site, { conversations: [{ id: "u_a", enabled: false }] }); } catch (error) { code = error.code; }
test.assert(code === "contacts_unreadable", "a broken file cannot be written back");

rmSync(file, { force: true });
try { contacts.readContacts(site); } catch (error) { code = error.code; }
test.assert(code === "contacts_missing", "a missing list says where it should be");
try { contacts.contactsPath({ tools: {}, routine: {} }); } catch (error) { code = error.code; }
test.assert(code === "contacts_not_configured", "a site with no tools folder cannot name a list");

// The path can be configured explicitly, and that wins over the default.
writeFileSync(file, `${JSON.stringify(seed, null, 2)}\n`);
const custom = contacts.contactsPath({ ...site, routine: { contacts: { path: file } } });
test.assert(custom === file, "routine.contacts.path overrides the tools-folder default");

rmSync(root, { recursive: true, force: true });
test.finish();
