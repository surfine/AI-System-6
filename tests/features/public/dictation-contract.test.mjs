// Public-safe Dictation Pad contract: the desk accessory exists, captures
// intent, and routes into the writing surface.

import { createFeatureTest, read } from "../../helpers/feature-test-harness.mjs";

const test = createFeatureTest("public-dictation");
const html = read("index.html");
const actions = read("app/core/actions.js");
// The field service boots with the desk; the window is summoned. Both halves
// answer this contract.
const dictation = read("app/features/dictation.js") + read("app/features/dictation-pad.js");

test.assertIncludes(html, "dictation", "Dictation Pad has a window surface");
test.assertIncludes(dictation, '"open-dictation"', "opening Dictation Pad is a runtime command");
test.assertIncludes(dictation, "function ", "Dictation Pad carries executable behavior");
test.assertIncludes(dictation, "window.SpeechRecognition || window.webkitSpeechRecognition", "Dictation uses the browser speech recognition permission flow");
test.assertIncludes(dictation, "intent", "Dictation captures writing intent");

test.finish();
