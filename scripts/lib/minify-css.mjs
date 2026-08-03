// CSS minifier for the style bundle. Kept out of build-app-bundle.mjs so the
// selector rules below can be tested directly (tests/features/css-bundle.test.mjs)
// without running — and rewriting — the real bundles.

function stripCssComments(source) {
  let output = "";
  let quote = "";
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (quote) {
      output += char;
      if (char === "\\") {
        output += next || "";
        index += 1;
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      output += char;
      continue;
    }

    if (char === "/" && next === "*") {
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) index += 1;
      index += 1;
      continue;
    }

    output += char;
  }
  return output;
}

export function minifyCss(source) {
  const withoutComments = stripCssComments(source);
  let output = "";
  let quote = "";
  let pendingSpace = false;
  const tightBefore = new Set("{}:;,>+~)]=");
  const tightAfter = new Set("{}:;,>+~([=");
  // Stack of open parens; each entry is true when that paren (or an ancestor)
  // is inside a CSS math function. Inside math context, `+`/`-` are arithmetic
  // operators that REQUIRE surrounding whitespace, so they must not be tightened
  // like the adjacent-sibling/`+` selector combinator. `-`/`*`/`/` are never in
  // the tight sets, so only `+` needs the guard, but we keep the context general.
  const mathFn = /(?:^|[^\w-])(?:calc|min|max|clamp)$/i;
  const parenStack = [];
  // Stack of open blocks; each entry is true when the block holds rules rather
  // than declarations (top level, plus conditional at-rules whose body is more
  // rules). In a rule body the `:` of a pseudo-class must NOT swallow the space
  // in front of it — `.a :is(b)` (descendant) is a different selector from
  // `.a:is(b)`. Inside a declaration block the property/value `:` still tightens.
  const nestedAtRule = /(?:^|[{};])\s*@(?:media|container|supports|layer|scope)\b[^{}]*$/i;
  const blockStack = [];
  const inSelectorPrelude = () =>
    parenStack.length === 0 && (blockStack.length === 0 || blockStack[blockStack.length - 1]);
  const inMath = () => parenStack.length > 0 && parenStack[parenStack.length - 1];
  const needsPreludeSpaceBeforeParen = () => {
    if (!pendingSpace) return false;
    if (/(?:^|[^\w-])(?:and|or|not)$/i.test(output)) return true;
    const blockStart = Math.max(output.lastIndexOf("{"), output.lastIndexOf("}"));
    const prelude = output.slice(blockStart + 1);
    return /^@(media|supports|container|scope)(?:\s+[a-z_][\w-]*)?$/i.test(prelude);
  };
  // A `+` directly after the previous token normally suppresses the following
  // space (selector combinator), but inside a math function the trailing space
  // must survive too.
  const suppressLeadingSpace = (prev) => tightAfter.has(prev) && !(prev === "+" && inMath());

  for (let index = 0; index < withoutComments.length; index += 1) {
    const char = withoutComments[index];

    if (quote) {
      output += char;
      if (char === "\\") {
        output += withoutComments[index + 1] || "";
        index += 1;
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      if (pendingSpace && output && !suppressLeadingSpace(output.at(-1))) output += " ";
      pendingSpace = false;
      quote = char;
      output += char;
      continue;
    }

    if (/\s/.test(char)) {
      pendingSpace = true;
      continue;
    }

    if (char === "(") {
      const parentMath = inMath();
      const startsMathFn = mathFn.test(output.slice(-10));
      // Outside math, `(` tightens the preceding token. Inside math the space
      // can be a required operator gap (e.g. `25px + (…)`), so preserve it.
      if (parentMath || needsPreludeSpaceBeforeParen()) {
        if (pendingSpace && output && !suppressLeadingSpace(output.at(-1))) output += " ";
      } else {
        output = output.trimEnd();
      }
      output += char;
      pendingSpace = false;
      parenStack.push(parentMath || startsMathFn);
      continue;
    }

    if (char === ")") {
      output = output.trimEnd();
      output += char;
      pendingSpace = false;
      parenStack.pop();
      continue;
    }

    // Inside a math function, `+` is an arithmetic operator needing whitespace;
    // treat it as a normal token so the surrounding spaces are preserved.
    const tightenBefore =
      tightBefore.has(char) &&
      !(char === "+" && inMath()) &&
      !(char === ":" && inSelectorPrelude());
    if (tightenBefore) output = output.trimEnd();
    else if (pendingSpace && output && !suppressLeadingSpace(output.at(-1))) output += " ";

    if (char === "{") blockStack.push(nestedAtRule.test(output));
    else if (char === "}") blockStack.pop();

    output += char;
    pendingSpace = false;
  }

  return output.trim();
}
