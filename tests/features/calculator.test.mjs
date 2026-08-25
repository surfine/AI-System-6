// The Calculator desk accessory.
//
// It could not add. `calculateExpression` evaluated with
// `Function("return (" + expression + ")")`, and the product's own CSP sets
// `script-src 'self'` with no `'unsafe-eval'` — so that call threw everywhere
// the CSP is enforced, which is `npm start` and the Mac app, and the throw was
// caught and displayed as "Error". Every operation, including 1+2.
//
// Nothing static could have caught it and a console could not either: DevTools
// evaluation is exempt from CSP, so `Function()` answers 56 there while the
// same call inside the page is blocked. It was found by pressing the keys.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("calculator");

const source = read("app/features/desktop-tools.js");

// The rule this contract exists to hold: no arithmetic through eval, ever.
test.assertNotIncludes(source, 'Function(`"use strict"; return', "arithmetic is not evaluated with the Function constructor");
test.assertIncludes(source, "function evaluateArithmetic(", "there is a real evaluator instead");

// Execute the evaluator rather than assert its shape.
const context = vm.createContext({});
const start = source.indexOf("function applyArithmeticOperator(");
const end = source.indexOf("function calculateExpression()");
test.assert(start >= 0 && end > start, "the evaluator can be extracted for execution");
vm.runInContext(`${source.slice(start, end)}; globalThis.evaluateArithmetic = evaluateArithmetic;`, context);
const evaluate = context.evaluateArithmetic;

const cases = [
  ["1+2", 3],
  ["7*8", 56],
  ["9-4", 5],
  ["8/2", 4],
  ["1.5+2.25", 3.75],
  // Precedence is the thing a naive left-to-right calculator gets wrong.
  ["2+3*4", 14],
  ["10-2*3", 4],
  ["(2+3)*4", 20],
  // A leading minus is a sign, not a subtraction with nothing on its left.
  ["-5+8", 3],
  ["(-4)*3", -12],
];
cases.forEach(([expression, expected]) => {
  test.assert(evaluate(expression) === expected, `${expression} = ${expected}`);
});

// Refused rather than guessed at. Infinity is not a number a calculator should
// show, and a half-typed expression is not an answer.
[["5/0", "divide by zero"], ["1+", "a trailing operator"], ["(1+2", "an unclosed bracket"], ["1+2)", "an unopened bracket"], ["", "nothing at all"]]
  .forEach(([expression, why]) => {
    test.assert(evaluate(expression) === null, `${why} is refused, not answered`);
  });

// The keypad sends ASCII through data-calc; the display glyphs are a rendering
// concern, and calculateExpression translates them back before evaluating.
const html = read("index.html");
test.assertIncludes(html, 'data-calc="*"', "the multiply key sends ASCII, not the display glyph");
test.assertIncludes(source, 'replace(/×/g, "*").replace(/÷/g, "/")', "and any display glyph is translated before evaluation");

test.finish();
