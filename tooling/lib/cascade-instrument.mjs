// The part of the in-page cascade instrument that every cascade tool shares.
//
// measure-layer-flips.mjs (today's cascade against an @layer-wrapped variant)
// and cascade-ledger.mjs (today's cascade against a committed baseline) both
// need the same thing from the live page: the elements and pseudo-elements
// that render, a name for each, the rules of every enabled stylesheet with a
// real specificity, and the winner of the cascade for one property. That is
// installCascadeCore. It is a plain function with no closures so a driver can
// toString() it into the page; each tool builds its own API on top of the
// object it returns (buildInstrumentSource).
//
// Nothing here knows about variants, baselines or reports.

/**
 * Runs in the page. Returns the helpers; keeps no per-capture state.
 * @param {string[]} layerOrderList cascade layer names, lowest rank first
 */
export function installCascadeCore(layerOrderList) {
  const SEP = "\u0001";
  const PSEUDOS = ["", "::before", "::after"];
  const layerRank = new Map(layerOrderList.map((name, index) => [name, index]));
  let propertyNames = null;
  const properties = () => {
    if (propertyNames) return propertyNames;
    // Logical longhands (padding-inline-start, inset-block-end, inline-size…)
    // restate a physical one in horizontal, left-to-right writing; comparing
    // both would count every such difference twice, and only the physical one
    // is what the rules here declare.
    const style = getComputedStyle(document.documentElement);
    const names = [];
    for (let index = 0; index < style.length; index += 1) {
      const name = style.item(index);
      if (/-(?:inline|block)(?:-|$)|^(?:min-|max-)?(?:inline|block)-size$/.test(name)) continue;
      names.push(name);
    }
    propertyNames = names;
    return names;
  };

  function splitList(text) {
    const out = [];
    let current = "";
    let paren = 0;
    let bracket = 0;
    let quote = "";
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (quote) {
        current += char;
        if (char === "\\") { current += text[i + 1] || ""; i += 1; } else if (char === quote) quote = "";
        continue;
      }
      if (char === '"' || char === "'") { quote = char; current += char; continue; }
      if (char === "(") paren += 1;
      else if (char === ")") paren -= 1;
      else if (char === "[") bracket += 1;
      else if (char === "]") bracket -= 1;
      if (char === "," && !paren && !bracket) { out.push(current.trim()); current = ""; } else current += char;
    }
    if (current.trim()) out.push(current.trim());
    return out;
  }

  // Selectors Level 4 specificity: :where() is zero, :is()/:not()/:has() take
  // their most specific argument, :nth-child(… of S) adds S.
  function specificity(selector) {
    let a = 0;
    let b = 0;
    let c = 0;
    let i = 0;
    const identEnd = (start) => {
      let j = start;
      while (j < selector.length && /[\w\-\u0080-￿\\]/.test(selector[j])) j += selector[j] === "\\" ? 2 : 1;
      return j;
    };
    const parenEnd = (start) => {
      let depth = 0;
      let quote = "";
      for (let j = start; j < selector.length; j += 1) {
        const char = selector[j];
        if (quote) { if (char === "\\") j += 1; else if (char === quote) quote = ""; continue; }
        if (char === '"' || char === "'") quote = char;
        else if (char === "(") depth += 1;
        else if (char === ")") { depth -= 1; if (!depth) return j + 1; }
      }
      return selector.length;
    };
    const maxOf = (list) => splitList(list).map(specificity)
      .reduce((best, next) => (compare(next, best) > 0 ? next : best), [0, 0, 0]);
    while (i < selector.length) {
      const char = selector[i];
      if (char === "#") { a += 1; i = identEnd(i + 1); } else if (char === ".") { b += 1; i = identEnd(i + 1); } else if (char === "[") {
        b += 1;
        let quote = "";
        let j = i + 1;
        for (; j < selector.length; j += 1) {
          const inner = selector[j];
          if (quote) { if (inner === quote) quote = ""; continue; }
          if (inner === '"' || inner === "'") quote = inner;
          else if (inner === "]") break;
        }
        i = j + 1;
      } else if (char === ":") {
        if (selector[i + 1] === ":") {
          c += 1;
          i = identEnd(i + 2);
          if (selector[i] === "(") i = parenEnd(i);
          continue;
        }
        const end = identEnd(i + 1);
        const name = selector.slice(i + 1, end).toLowerCase();
        i = end;
        if (selector[i] === "(") {
          const close = parenEnd(i);
          const inner = selector.slice(i + 1, close - 1);
          i = close;
          if (name === "where") continue;
          if (["is", "not", "has", "matches", "-webkit-any"].includes(name)) {
            const [x, y, z] = maxOf(inner);
            a += x; b += y; c += z;
          } else if (name === "nth-child" || name === "nth-last-child") {
            b += 1;
            const of = inner.search(/\sof\s/i);
            if (of !== -1) { const [x, y, z] = maxOf(inner.slice(of + 4)); a += x; b += y; c += z; }
          } else b += 1;
        } else if (["before", "after", "first-line", "first-letter"].includes(name)) c += 1;
        else b += 1;
      } else if (/[A-Za-z_\u0080-￿\\-]/.test(char)) {
        c += 1;
        i = identEnd(i);
      } else i += 1;
    }
    return [a, b, c];
  }
  function compare(left, right) {
    for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
      const delta = (left[index] ?? 0) - (right[index] ?? 0);
      if (delta) return delta;
    }
    return 0;
  }

  const pseudoOf = (selector) => {
    const match = selector.match(/(::?(?:before|after))\s*$/i);
    if (match) return { pseudo: `::${match[1].replace(/^:+/, "").toLowerCase()}`, base: selector.slice(0, -match[0].length) || "*" };
    if (/::[\w-]+(\([^)]*\))?\s*$/.test(selector)) return { pseudo: "other", base: selector };
    return { pseudo: "", base: selector };
  };

  function sheetLabel(sheet, index) {
    const node = sheet.ownerNode;
    if (node?.dataset?.layerVariant) return node.dataset.layerVariant;
    if (sheet.href) return new URL(sheet.href).pathname.split("/").pop();
    const id = node?.id ? `#${node.id}` : "";
    return `inline <style>${id} #${index}`;
  }

  function collectRules() {
    const rules = [];
    const walk = (list, context) => {
      for (const rule of list) {
        if (rule instanceof CSSLayerBlockRule) walk(rule.cssRules, { ...context, layer: rule.name });
        else if (rule instanceof CSSMediaRule) { if (matchMedia(rule.conditionText || rule.media.mediaText).matches) walk(rule.cssRules, context); } else if (rule instanceof CSSSupportsRule) { if (CSS.supports(rule.conditionText)) walk(rule.cssRules, context); } else if (typeof CSSContainerRule !== "undefined" && rule instanceof CSSContainerRule) walk(rule.cssRules, { ...context, container: rule.conditionText });
        else if (rule instanceof CSSStyleRule) {
          rules.push({
            rule,
            selectors: splitList(rule.selectorText).map((text) => ({ text, ...pseudoOf(text), spec: specificity(text) })),
            layer: context.layer ?? null,
            sheet: context.sheet,
            container: context.container || null,
            order: rules.length,
          });
        }
      }
    };
    Array.from(document.styleSheets).forEach((sheet, index) => {
      if (sheet.disabled) return;
      let list;
      try { list = sheet.cssRules; } catch { return; }
      walk(list, { sheet: sheetLabel(sheet, index), layer: null });
    });
    return rules;
  }

  // Every rule that matches one target, with its most specific matching
  // selector; computed once per target and filtered per property.
  function matchedRules(rules, element, pseudo) {
    const found = [];
    for (const entry of rules) {
      let best = null;
      for (const selector of entry.selectors) {
        if (selector.pseudo !== pseudo) continue;
        let hit = false;
        try { hit = element.matches(selector.base); } catch { hit = false; }
        if (hit && (!best || compare(selector.spec, best.spec) > 0)) best = selector;
      }
      if (best) found.push({ entry, selector: best });
    }
    return found;
  }

  function candidatesFor(matched, property) {
    const found = [];
    for (const { entry, selector } of matched) {
      const value = entry.rule.style.getPropertyValue(property);
      if (!value) continue;
      found.push({ entry, selector, value, important: entry.rule.style.getPropertyPriority(property) === "important" });
    }
    return found;
  }

  // Today: no layers anywhere, so importance, then specificity, then order.
  // After the wrap: normal declarations rank layers first (unlayered above
  // every layer), important ones rank them in reverse (unlayered below).
  function winner(candidates, layered) {
    let best = null;
    let bestKey = null;
    for (const candidate of candidates) {
      const rank = candidate.entry.layer === null ? Infinity : (layerRank.get(candidate.entry.layer) ?? -1);
      const layerKey = !layered ? 0 : candidate.important ? -rank : rank;
      const key = [candidate.important ? 1 : 0, layerKey, ...candidate.selector.spec, candidate.entry.order];
      if (!best || compare(key, bestKey) > 0) { best = candidate; bestKey = key; }
    }
    return best;
  }

  function describe(candidate, inlineValue) {
    if (inlineValue) return { file: "inline style attribute", selector: "", value: inlineValue };
    if (!candidate) return null;
    return {
      sheet: candidate.entry.sheet,
      layer: candidate.entry.layer,
      selector: candidate.selector.text,
      specificity: candidate.selector.spec.join(","),
      important: candidate.important,
      value: candidate.value,
      ...(candidate.entry.container ? { container: candidate.entry.container } : {}),
    };
  }

  function pathOf(element) {
    const parts = [];
    let node = element;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      let part = node.localName;
      if (node.id) part += `#${node.id}`;
      else {
        const classes = [...node.classList].slice(0, 3);
        if (classes.length) part += `.${classes.join(".")}`;
        const parent = node.parentElement;
        if (parent) {
          const same = [...parent.children].filter((child) => child.localName === node.localName);
          if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
        }
      }
      if (node.dataset?.window) part += `[data-window="${node.dataset.window}"]`;
      parts.unshift(part);
      if (node.id) break;
      node = node.parentElement;
    }
    return parts.join(" > ");
  }

  function visibleTargets() {
    const targets = [];
    for (const element of [document.documentElement, ...document.body.querySelectorAll("*"), document.body]) {
      if (element !== document.documentElement && element !== document.body
        && !element.checkVisibility({ visibilityProperty: true })) continue;
      // A status line with data-state reports a runtime probe (does a local
      // model answer right now), not a cascade result: its state flips with
      // the machine and the boot timing. The ledger's unit is the winning CSS
      // rule, so these never enter it.
      if (element.matches?.(".control-status[data-state]")) continue;
      // A memory card's colour class is dealt at random when the board opens.
      // The capture reseeds per window, but the deal still depends on when the
      // board's own timer runs, so which card is green is a draw, not a rule.
      if (element.matches?.(".memory-card")) continue;
      for (const pseudo of PSEUDOS) {
        if (pseudo) {
          const content = getComputedStyle(element, pseudo).content;
          if (!content || content === "none" || content === "normal") continue;
        }
        targets.push([element, pseudo]);
      }
    }
    return targets;
  }

  return {
    SEP, PSEUDOS, layerRank, properties, splitList, specificity, compare, pseudoOf, sheetLabel,
    collectRules, matchedRules, candidatesFor, winner, describe, pathOf, visibleTargets,
  };
}

/**
 * Source of an expression that evaluates, in the page, to
 * extension(core, layerOrderList). The extension is a plain function too.
 * @param {Function} extension (core, layerOrderList) => api
 * @param {string[]} layerOrderList
 */
export function buildInstrumentSource(extension, layerOrderList) {
  return `((layerOrderList) => (${extension.toString()})((${installCascadeCore.toString()})(layerOrderList), layerOrderList))(${JSON.stringify(layerOrderList)})`;
}

// ---------------------------------------------------------------------------
// The ledger half: today's cascade only, every declared (target, property).
// ---------------------------------------------------------------------------

/**
 * Runs in the page, on top of installCascadeCore's object. Records, for every
 * rendered target, each property some rule or the style attribute declares on
 * it: the computed value and the rule that wins today (source file, selector,
 * specificity). A property no rule declares for that target (inherited, or the
 * initial value) has no winner and is not recorded; whatever moved it is a
 * declared cell on an ancestor.
 *
 * The served sheets are concatenations of source files, so a rule's file is
 * found by position: install() parses every source file on its own, counts its
 * style rules, and the Nth style rule of a bundle belongs to the file whose
 * running count covers N. A sheet whose total disagrees with the sum falls back
 * to the sheet's own name and says so in stats.mappingProblems.
 *
 * @param {object} core installCascadeCore's result
 * @param {string[]} layerOrderList
 */
export function installCascadeLedger(core, layerOrderList) {
  const { PSEUDOS, layerRank, properties, splitList, specificity, pseudoOf, sheetLabel, visibleTargets } = core;
  const state = { sourceCounts: {}, targets: new Map() };

  // Logical longhands restate a physical one (horizontal-tb, ltr). The
  // property list drops them, so a rule that declares one is counted under the
  // physical name it computes to.
  const SIDE = { "inline-start": "left", "inline-end": "right", "block-start": "top", "block-end": "bottom" };
  const CORNER = { "start-start": "top-left", "start-end": "top-right", "end-start": "bottom-left", "end-end": "bottom-right" };
  function physicalName(name) {
    if (name.startsWith("--")) return name;
    let match = name.match(/^(margin|padding)-(inline-start|inline-end|block-start|block-end)$/);
    if (match) return `${match[1]}-${SIDE[match[2]]}`;
    match = name.match(/^border-(inline-start|inline-end|block-start|block-end)(-width|-style|-color)$/);
    if (match) return `border-${SIDE[match[1]]}${match[2]}`;
    match = name.match(/^inset-(inline-start|inline-end|block-start|block-end)$/);
    if (match) return SIDE[match[1]];
    match = name.match(/^border-(start-start|start-end|end-start|end-end)-radius$/);
    if (match) return `border-${CORNER[match[1]]}-radius`;
    match = name.match(/^(min-|max-)?(inline|block)-size$/);
    if (match) return `${match[1] || ""}${match[2] === "inline" ? "width" : "height"}`;
    return name;
  }

  // The part of a selector every matching element must have, to bucket rules
  // the way a browser does: an id, else a class, else a type, else none.
  function bucketOf(base) {
    let start = 0;
    let depth = 0;
    let quote = "";
    for (let i = 0; i < base.length; i += 1) {
      const char = base[i];
      if (quote) { if (char === "\\") i += 1; else if (char === quote) quote = ""; continue; }
      if (char === "\\") return { kind: "any" };
      if (char === '"' || char === "'") { quote = char; continue; }
      if (char === "(" || char === "[") depth += 1;
      else if (char === ")" || char === "]") depth -= 1;
      else if (!depth && (char === " " || char === ">" || char === "+" || char === "~" || char === "\t" || char === "\n")) start = i + 1;
    }
    let scrubbed = "";
    depth = 0;
    quote = "";
    for (const char of base.slice(start)) {
      if (quote) { if (char === quote) quote = ""; continue; }
      if (char === '"' || char === "'") { quote = char; continue; }
      if (char === "(" || char === "[") { depth += 1; continue; }
      if (char === ")" || char === "]") { depth -= 1; continue; }
      if (!depth) scrubbed += char;
    }
    const id = scrubbed.match(/#([\w-]+)/);
    if (id) return { kind: "id", name: id[1] };
    const cls = scrubbed.match(/\.([\w-]+)/);
    if (cls) return { kind: "cls", name: cls[1] };
    const tag = scrubbed.match(/^([A-Za-z][\w-]*)/);
    if (tag) return { kind: "tag", name: tag[1].toLowerCase() };
    return { kind: "any" };
  }

  // Walk one sheet in tree order. `visit(rule, ctx, active)` gets every style
  // rule, including those under a media/supports condition that is false now
  // (active=false), because the file mapping counts all of them.
  function walkSheet(list, visit, ctx, active) {
    for (const rule of list) {
      if (rule instanceof CSSLayerBlockRule) walkSheet(rule.cssRules, visit, { ...ctx, layer: rule.name }, active);
      else if (rule instanceof CSSMediaRule) walkSheet(rule.cssRules, visit, { ...ctx, media: rule.conditionText || rule.media.mediaText }, active && matchMedia(rule.conditionText || rule.media.mediaText).matches);
      else if (rule instanceof CSSSupportsRule) walkSheet(rule.cssRules, visit, { ...ctx, supports: rule.conditionText }, active && CSS.supports(rule.conditionText));
      else if (typeof CSSContainerRule !== "undefined" && rule instanceof CSSContainerRule) {
        const query = { name: rule.containerName || "", query: rule.containerQuery ?? rule.conditionText, text: rule.conditionText };
        walkSheet(rule.cssRules, visit, { ...ctx, containers: [...(ctx.containers || []), query] }, active);
      }
      else if (rule instanceof CSSStyleRule) visit(rule, ctx, active);
    }
  }

  function countStyleRules(list) {
    let total = 0;
    walkSheet(list, () => { total += 1; }, {}, true);
    return total;
  }

  function buildRules() {
    const entries = [];
    const mappingProblems = [];
    const occurrences = new Map();
    Array.from(document.styleSheets).forEach((sheet, sheetIndex) => {
      if (sheet.disabled) return;
      let list;
      try { list = sheet.cssRules; } catch { return; }
      const label = sheetLabel(sheet, sheetIndex);
      const counts = state.sourceCounts[label];
      let files = null;
      if (counts) {
        const expected = counts.reduce((total, [, n]) => total + n, 0);
        const actual = countStyleRules(list);
        if (expected === actual) files = counts;
        else mappingProblems.push(`${label}: ${actual} style rules in the sheet, ${expected} in its sources`);
      }
      let position = 0;
      let cursor = 0;
      let upTo = files ? files[0][1] : 0;
      walkSheet(list, (rule, ctx, active) => {
        while (files && position >= upTo && cursor < files.length - 1) { cursor += 1; upTo += files[cursor][1]; }
        position += 1;
        if (!active) return;
        const file = files ? files[cursor][0] : label;
        const suffix = [ctx.media && `@media ${ctx.media}`, ctx.supports && `@supports ${ctx.supports}`, ...(ctx.containers || []).map((container) => `@container ${container.text}`)].filter(Boolean).join(" ");
        const selectors = splitList(rule.selectorText).map((text) => {
          const parts = pseudoOf(text);
          const identity = `${file} :: ${text}${suffix ? ` ${suffix}` : ""}`;
          const occurrence = (occurrences.get(identity) || 0) + 1;
          occurrences.set(identity, occurrence);
          return { text, ...parts, spec: specificity(text), key: occurrence > 1 ? `${identity} [${occurrence}]` : identity, file };
        });
        const decls = [];
        const style = rule.style;
        for (let i = 0; i < style.length; i += 1) {
          const name = style.item(i);
          decls.push([physicalName(name), style.getPropertyValue(name), style.getPropertyPriority(name) === "important"]);
        }
        entries.push({ rule, selectors, decls, layer: ctx.layer ?? null, containers: ctx.containers || [], order: entries.length });
      }, { layer: null }, true);
    });
    return { entries, mappingProblems };
  }

  function buildIndex(entries) {
    const index = {};
    for (const pseudo of PSEUDOS) index[pseudo] = { id: new Map(), cls: new Map(), tag: new Map(), any: [] };
    let items = 0;
    for (const entry of entries) {
      for (const selector of entry.selectors) {
        const buckets = index[selector.pseudo];
        if (!buckets) continue;
        const bucket = bucketOf(selector.base);
        const item = { entry, selector };
        items += 1;
        if (bucket.kind === "any") buckets.any.push(item);
        else {
          const map = buckets[bucket.kind];
          if (!map.has(bucket.name)) map.set(bucket.name, []);
          map.get(bucket.name).push(item);
        }
      }
    }
    return { index, items };
  }

  function candidateItems(buckets, element) {
    const found = [buckets.any];
    if (element.id && buckets.id.has(element.id)) found.push(buckets.id.get(element.id));
    for (const name of element.classList) if (buckets.cls.has(name)) found.push(buckets.cls.get(name));
    const tag = buckets.tag.get(element.localName.toLowerCase());
    if (tag) found.push(tag);
    return found;
  }

  // @container conditions. The CSSOM lists a rule under a container query
  // whether or not the query holds, so without this a rule in a false query
  // would win. The evaluator reads the nearest eligible container's content
  // box and handles the size features this project writes (min-/max-/range
  // width and height, aspect-ratio, and/or/not); a condition it cannot parse
  // counts as holding, which is what the unfiltered list did.
  const containerMemo = new Map();
  function findContainer(element, pseudo, name) {
    for (let node = pseudo ? element : element.parentElement; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (!style.containerType || style.containerType === "normal") continue;
      if (name && !style.containerName.split(/\s+/).includes(name)) continue;
      const rect = node.getBoundingClientRect();
      const px = (value) => parseFloat(value) || 0;
      return {
        node,
        type: style.containerType,
        width: rect.width - px(style.paddingLeft) - px(style.paddingRight) - px(style.borderLeftWidth) - px(style.borderRightWidth),
        height: rect.height - px(style.paddingTop) - px(style.paddingBottom) - px(style.borderTopWidth) - px(style.borderBottomWidth),
      };
    }
    return null;
  }
  function sizeFeature(text, container) {
    const length = (value) => {
      const match = String(value).trim().match(/^(-?[\d.]+)(px|em|rem)?$/);
      return match ? parseFloat(match[1]) * (match[2] === "em" || match[2] === "rem" ? 16 : 1) : null;
    };
    const ratio = (value) => {
      const match = String(value).trim().match(/^([\d.]+)\s*(?:\/\s*([\d.]+))?$/);
      return match ? parseFloat(match[1]) / (match[2] ? parseFloat(match[2]) : 1) : null;
    };
    const measure = (feature) => {
      if (feature === "width") return { value: container.width, parse: length, inline: true };
      if (feature === "height") return { value: container.height, parse: length, inline: false };
      if (feature === "aspect-ratio") return { value: container.width / (container.height || 1), parse: ratio, inline: false };
      return null;
    };
    const compare = (left, operator, right) => (operator === "<" ? left < right : operator === "<=" ? left <= right : operator === ">" ? left > right : operator === ">=" ? left >= right : left === right);
    let match = text.match(/^(min-|max-)?(width|height|aspect-ratio)\s*:\s*(.+)$/);
    if (match) {
      const subject = measure(match[2]);
      const wanted = subject.parse(match[3]);
      if (wanted === null) return null;
      if (!subject.inline && container.type === "inline-size") return false;
      return match[1] === "min-" ? subject.value >= wanted : match[1] === "max-" ? subject.value <= wanted : Math.abs(subject.value - wanted) < 0.5;
    }
    match = text.match(/^(width|height|aspect-ratio)\s*(<=|>=|<|>|=)\s*(.+)$/);
    if (match) {
      const subject = measure(match[1]);
      const wanted = subject.parse(match[3]);
      if (wanted === null) return null;
      if (!subject.inline && container.type === "inline-size") return false;
      return compare(subject.value, match[2], wanted);
    }
    match = text.match(/^(.+?)\s*(<=|<)\s*(width|height|aspect-ratio)\s*(<=|<)\s*(.+)$/);
    if (match) {
      const subject = measure(match[3]);
      const low = subject.parse(match[1]);
      const high = subject.parse(match[5]);
      if (low === null || high === null) return null;
      if (!subject.inline && container.type === "inline-size") return false;
      return compare(low, match[2], subject.value) && compare(subject.value, match[4], high);
    }
    return null;
  }
  function evaluateQuery(source, container) {
    let at = 0;
    const skip = () => { while (source[at] === " ") at += 1; };
    const group = () => {
      const start = at;
      let depth = 0;
      for (; at < source.length; at += 1) {
        if (source[at] === "(") depth += 1;
        else if (source[at] === ")") { depth -= 1; if (!depth) { at += 1; return source.slice(start + 1, at - 1); } }
      }
      throw new Error("unbalanced");
    };
    const term = () => {
      skip();
      if (/^not\b/i.test(source.slice(at))) { at += 3; const inner = term(); return inner === null ? null : !inner; }
      if (source[at] !== "(") throw new Error("expected (");
      const inner = group().trim();
      return inner.startsWith("(") || /^not\b/i.test(inner) ? evaluateQuery(inner, container) : sizeFeature(inner, container);
    };
    let value = term();
    for (;;) {
      skip();
      if (at >= source.length) return value;
      const word = (source.slice(at).match(/^(and|or)\b/i) || [])[1];
      if (!word) throw new Error("expected and/or");
      at += word.length;
      const next = term();
      value = word.toLowerCase() === "and"
        ? (value === false || next === false ? false : value === null || next === null ? null : true)
        : (value === true || next === true ? true : value === null || next === null ? null : false);
    }
  }
  function containersHold(containers, element, pseudo) {
    for (const { name, query } of containers) {
      const container = findContainer(element, pseudo, name);
      if (!container) return false;
      let memo = containerMemo.get(container.node);
      if (!memo) { memo = new Map(); containerMemo.set(container.node, memo); }
      const key = `${container.type}|${query}`;
      if (!memo.has(key)) {
        let held = null;
        try { held = evaluateQuery(query, container); } catch { held = null; }
        memo.set(key, held);
      }
      if (memo.get(key) === false) return false;
    }
    return true;
  }

  // 0 author normal < 1 inline normal < 2 author important < 3 inline important;
  // inside an author level: layer (reversed for important), specificity, order.
  function beats(left, right) {
    if (left.level !== right.level) return left.level > right.level;
    if (left.layerKey !== right.layerKey) return left.layerKey > right.layerKey;
    for (let i = 0; i < 3; i += 1) if (left.spec[i] !== right.spec[i]) return left.spec[i] > right.spec[i];
    return left.order > right.order;
  }

  // The server's port is a different number every run and is part of every
  // resolved url(); the ledger keeps the path only.
  const valueOf = (style, property) => style.getPropertyValue(property).split(location.origin).join("");

  // Stable name for a rendered target. Generated ids and run-state classes are
  // left out so the same element has the same name in every run.
  const STATE_CLASS = /^(?:is|has|was|will|js)-|^(?:active|open|opened|selected|focused|disabled|checked|current|busy|loading|hidden|visible|pressed|expanded|collapsed|dragging|dirty)$/;
  const GENERATED_ID = /\d{4,}|[0-9a-f]{8,}|(?:^|[-_])\d+$/i;
  const stableClasses = (node) => [...node.classList].filter((name) => !STATE_CLASS.test(name));
  function targetPath(element, cache) {
    if (element === document.documentElement) return "html";
    if (cache.has(element)) return cache.get(element);
    const stableId = element.id && !GENERATED_ID.test(element.id);
    let part = element.localName;
    if (element === document.body) return part;
    if (stableId) part += `#${element.id}`;
    else {
      const classes = stableClasses(element);
      if (classes.length) part += `.${classes.slice(0, 3).join(".")}`;
      const parent = element.parentElement;
      if (parent) {
        const signature = classes.join(" ");
        const same = [...parent.children].filter((child) => child.localName === element.localName && stableClasses(child).join(" ") === signature);
        if (same.length > 1) part += `:nth-of-type(${same.indexOf(element) + 1})`;
      }
    }
    if (element.dataset?.window) part += `[data-window="${element.dataset.window}"]`;
    const parent = element.parentElement;
    const path = stableId || !parent || parent === document.documentElement ? part : `${targetPath(parent, cache)} > ${part}`;
    cache.set(element, path);
    return path;
  }

  return {
    /**
     * Parse each source file of each served sheet on its own and keep its
     * style-rule count.
     * @param {Record<string, Array<[string, string]>>} sources sheet file name -> [source path, source text][]
     */
    install(sources) {
      state.sourceCounts = {};
      for (const [sheetName, files] of Object.entries(sources)) {
        state.sourceCounts[sheetName] = files.map(([path, text]) => {
          const sheet = new CSSStyleSheet();
          sheet.replaceSync(text);
          return [path, countStyleRules(sheet.cssRules)];
        });
      }
      return Object.fromEntries(Object.entries(state.sourceCounts).map(([name, counts]) => [name, counts.length]));
    },

    /**
     * Every rendered target and the cells declared on it.
     * Returns dictionaries and, per target, a flat [property, value, rule, ...]
     * list of indices into them. expandCapture() turns it into
     * path -> property -> { value, winner: { file, selector, specificity } }.
     */
    capture() {
      const names = new Set(properties());
      const { entries, mappingProblems } = buildRules();
      const { index, items } = buildIndex(entries);
      const tables = { properties: [], rules: [], values: [] };
      const lookup = { properties: new Map(), rules: new Map(), values: new Map() };
      const intern = (table, key, make) => {
        if (!lookup[table].has(key)) { lookup[table].set(key, tables[table].length); tables[table].push(make ? make() : key); }
        return lookup[table].get(key);
      };
      const layered = (layer) => (layer === null ? Infinity : (layerRank.get(layer) ?? -1));
      const targets = [];
      const seen = new Map();
      const pathCache = new Map();
      state.targets = new Map();
      containerMemo.clear();
      const check = { agree: 0, disagree: 0, samples: [] };
      for (const [element, pseudo] of visibleTargets()) {
        const buckets = index[pseudo];
        const style = getComputedStyle(element, pseudo || null);
        const best = new Map();
        const consider = (property, candidate) => {
          const current = best.get(property);
          if (!current || beats(candidate, current)) best.set(property, candidate);
        };
        const bestSelector = new Map();
        for (const list of candidateItems(buckets, element)) {
          for (const { entry, selector } of list) {
            const known = bestSelector.get(entry);
            if (known && !specificityGreater(selector.spec, known.spec)) continue;
            let hit = false;
            try { hit = element.matches(selector.base); } catch { hit = false; }
            if (hit) bestSelector.set(entry, selector);
          }
        }
        for (const [entry, selector] of bestSelector) {
          if (entry.containers.length && !containersHold(entry.containers, element, pseudo)) continue;
          for (const [property, value, important] of entry.decls) {
            if (!names.has(property) && !property.startsWith("--")) continue;
            consider(property, {
              level: important ? 2 : 0,
              layerKey: important ? -layered(entry.layer) : layered(entry.layer),
              spec: selector.spec,
              order: entry.order,
              value,
              selector,
            });
          }
        }
        if (!pseudo && element.style) {
          for (let i = 0; i < element.style.length; i += 1) {
            const name = element.style.item(i);
            const property = physicalName(name);
            if (!names.has(property) && !property.startsWith("--")) continue;
            const important = element.style.getPropertyPriority(name) === "important";
            consider(property, { level: important ? 3 : 1, layerKey: 0, spec: [0, 0, 0], order: 0, value: element.style.getPropertyValue(name), selector: null });
          }
        }
        let path = targetPath(element, pathCache) + pseudo;
        const count = (seen.get(path) || 0) + 1;
        seen.set(path, count);
        if (count > 1) path += ` #${count}`;
        state.targets.set(path, [element, pseudo]);
        const cells = [];
        for (const [property, winner] of best) {
          // Two kinds of cell would record layout and script state instead of
          // a rule's effect, and differ between page loads: a property the
          // style attribute sets (window placement and the like: script
          // state) and an auto margin (resolved against whatever width the
          // content had that run). Their value is kept as what was declared.
          const computed = valueOf(style, property);
          const value = !winner.selector ? "(inline)" : winner.value === "auto" && property.startsWith("margin-") ? "auto" : computed;
          const rule = winner.selector
            ? intern("rules", winner.selector.key, () => ({ file: winner.selector.file, selector: winner.selector.text, specificity: winner.selector.spec.join(","), key: winner.selector.key }))
            : intern("rules", "inline style attribute", () => ({ file: "inline style attribute", selector: "", specificity: "1,0,0,0", key: "inline style attribute" }));
          cells.push(intern("properties", property), intern("values", value), rule);
          if (/^-?\d+(?:\.\d+)?px$/.test(winner.value)) {
            if (winner.value === computed || (winner.value === "0px" && (computed === "normal" || computed === "none"))) check.agree += 1;
            else { check.disagree += 1; if (check.samples.length < 8) check.samples.push(`${path} ${property}: ${winner.selector ? winner.selector.key : "inline"} says ${winner.value}, computed ${computed}`); }
          }
        }
        targets.push([path, cells]);
      }
      return {
        ...tables,
        targets,
        stats: { renderedTargets: targets.length, rules: entries.length, indexItems: items, mappingProblems, winnerCheck: check },
      };
    },

    /** Current computed values for [path, property] pairs from the last capture(). */
    probe(pairs) {
      return pairs.map(([path, property]) => {
        const target = state.targets.get(path);
        if (!target || !target[0].isConnected) return null;
        return valueOf(getComputedStyle(target[0], target[1] || null), property);
      });
    },
  };

  function specificityGreater(left, right) {
    for (let i = 0; i < 3; i += 1) if (left[i] !== right[i]) return left[i] > right[i];
    return false;
  }
}

/** Source of the page-side ledger instrument for installCascadeLedger. */
export function ledgerInstrumentSource(layerOrderList) {
  return buildInstrumentSource(installCascadeLedger, layerOrderList);
}

/**
 * Turn a capture() result into path -> property -> { value, winner }.
 * Convenient for tests and probes; the ledger file keeps the compact form.
 */
export function expandCapture(capture) {
  const out = {};
  for (const [path, cells] of capture.targets) {
    const byProperty = {};
    for (let i = 0; i < cells.length; i += 3) {
      const rule = capture.rules[cells[i + 2]];
      byProperty[capture.properties[cells[i]]] = {
        value: capture.values[cells[i + 1]],
        winner: { file: rule.file, selector: rule.selector, specificity: rule.specificity },
      };
    }
    out[path] = byProperty;
  }
  return out;
}
