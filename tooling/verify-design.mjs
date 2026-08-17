// Ratcheting design-governance checks.
//
// This is not a beauty linter. It turns docs/design/DESIGN.md into a small set of
// enforceable "do not get worse" gates for the recurring agent defaults that
// make AI System 6 drift: marketing-page patterns, thick accent stripes,
// layout-property motion, arbitrary layering, placeholder copy, and sketchy
// decorative SVG tells.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const budgetPath = "tooling/design-budget.json";
const budget = JSON.parse(readFileSync(join(root, budgetPath), "utf8"));
const failures = [];

function ok(message) {
  console.log(`OK  ${message}`);
}

function fail(message) {
  failures.push(message);
  console.error(`NO  ${message}`);
}

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["vendor", "node_modules", ".git"].includes(entry.name)) continue;
      walk(abs, acc);
      continue;
    }
    if (entry.isFile()) acc.push(abs);
  }
  return acc;
}

const sourceFiles = [
  join(root, "apps/desktop/index.html"),
  join(root, "apps/desktop/app.js"),
  ...walk(join(root, "apps", "desktop", "app")),
  ...walk(join(root, "apps", "desktop", "styles")),
]
  .filter((abs) => /\.(html|js|css)$/i.test(abs))
  .filter((abs) => !/[\\/](app|styles)\.bundle\.(js|css)$/.test(abs))
  .sort();

const cssFiles = sourceFiles.filter((abs) => abs.endsWith(".css"));
const allSourceFiles = sourceFiles.map((abs) => ({
  abs,
  rel: relative(root, abs),
  text: readFileSync(abs, "utf8"),
}));
const cssSourceFiles = allSourceFiles.filter((file) => file.rel.endsWith(".css"));

function lineOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

function addFinding(findings, file, line, snippet) {
  findings.push({
    file: file.rel,
    line,
    snippet: snippet.trim().replace(/\s+/g, " ").slice(0, 160),
  });
}

function regexFindings(files, pattern) {
  const findings = [];
  for (const file of files) {
    for (const match of file.text.matchAll(pattern)) {
      addFinding(findings, file, lineOf(file.text, match.index || 0), match[0]);
    }
  }
  return findings;
}

function cssDeclarationFindings(pattern, predicate = () => true) {
  const findings = [];
  for (const file of cssSourceFiles) {
    file.text.split("\n").forEach((line, index) => {
      const match = line.match(pattern);
      if (match && predicate(match, line)) addFinding(findings, file, index + 1, line);
    });
  }
  return findings;
}

function cssRuleFindings(predicate) {
  const findings = [];
  for (const file of cssSourceFiles) {
    const text = file.text.replace(/\/\*[\s\S]*?\*\//g, "");
    const rulePattern = /([^{}@][^{}]*)\{([^{}]*)\}/g;
    for (const match of text.matchAll(rulePattern)) {
      const selector = match[1].trim();
      const body = match[2].trim();
      if (selector && body && predicate(selector, body)) {
        addFinding(findings, file, lineOf(file.text, match.index || 0), `${selector} { ${body} }`);
      }
    }
  }
  return findings;
}

const pxWidth = (raw) => {
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : 0;
};

function isCardComponentClass(name) {
  return /(?:^|[-_])card(?:$|[-_])/i.test(name);
}

function hasIndependentNestedCardSelector(selector) {
  const descendantPair = /\.([-_a-z0-9]+)\b[^,{]*\s+\.([-_a-z0-9]+)\b/gi;
  for (const match of selector.matchAll(descendantPair)) {
    const [, parent, child] = match;
    if (!isCardComponentClass(parent) || !isCardComponentClass(child)) continue;
    if (child.startsWith(`${parent}-`) || child.startsWith(`${parent}_`)) continue;
    return true;
  }
  return false;
}

// Extract the body (and the 1-based line of its opening brace) of the first
// top-level block whose selector contains `selector`. Used to scope fidelity
// checks to one theme block instead of sweeping all six appearances.
function extractBlock(text, selector) {
  const start = text.indexOf(selector);
  if (start === -1) return { body: "", line: 0 };
  const open = text.indexOf("{", start);
  if (open === -1) return { body: "", line: 0 };
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) {
        return { body: text.slice(open + 1, i), line: text.slice(0, open).split("\n").length };
      }
    }
  }
  return { body: text.slice(open + 1), line: text.slice(0, open).split("\n").length };
}

// A soft shadow has a non-zero blur radius (third length) and a real shadow
// declaration; `0 0 0 2px` (a hard spread ring) is excluded by the third-length
// gate, and padding triples never match because the line must declare a shadow.
const SOFT_CHROME_SHADOW = /-?\d+(?:\.\d+)?px\s+-?\d+(?:\.\d+)?px\s+[1-9]\d*(?:\.\d+)?px\b/;

function softShadowInBlockFindings(files, selector) {
  const findings = [];
  for (const file of files) {
    const { body, line: base } = extractBlock(file.text, selector);
    if (!body) continue;
    body.split("\n").forEach((lineText, i) => {
      if (/shadow\s*:/.test(lineText) && SOFT_CHROME_SHADOW.test(lineText)) {
        addFinding(findings, file, base + i + 1, lineText);
      }
    });
  }
  return findings;
}

const checks = [
  {
    key: "thickSideAccentDeclarations",
    label: "thick side accent declarations",
    reason: "Use full borders, rows, or tokens instead of agent-default side stripes.",
    findings: () => cssDeclarationFindings(
      /\bborder-(left|right)(?:-width)?\s*:\s*([0-9]*\.?[0-9]+)px\b/i,
      (match) => pxWidth(match[2]) > 2
    ),
  },
  {
    key: "layoutPropertyTransitions",
    label: "layout-property transitions",
    reason: "Animate transform/opacity for product feedback; layout-property motion is janky and visually unstable.",
    findings: () => cssDeclarationFindings(
      /\btransition(?:-property)?\s*:\s*[^;]*(width|height|top|left|right|bottom|padding|margin|max-width|max-height|min-width|min-height)\b/i
    ),
  },
  {
    key: "gradientTextRules",
    label: "gradient text rules",
    reason: "Gradient text is a forbidden default in docs/design/DESIGN.md; use weight, size, or a solid token color.",
    findings: () => cssRuleFindings((selector, body) =>
      /gradient\s*\(/i.test(body) &&
      /(?:-webkit-)?background-clip\s*:\s*text/i.test(body)
    ),
  },
  {
    key: "nestedCardSelectors",
    label: "nested card selectors",
    reason: "Cards inside cards are banned; use pane structure, rows, dividers, or spacing.",
    findings: () => cssRuleFindings((selector) => hasIndependentNestedCardSelector(selector)),
  },
  {
    key: "marketingHeroClassUses",
    label: "marketing hero class uses",
    reason: "AI System 6 is product UI; new surfaces should use windows, panes, Finder objects, or DAs.",
    findings: () => regexFindings(
      allSourceFiles,
      /\b(?:class|className)\s*=\s*["'`][^"'`]*(?:\bhero\b|[-_]hero\b|hero[-_])[^"'`]*/gi
    ),
  },
  {
    key: "arbitraryZIndexDeclarations",
    label: "arbitrary z-index declarations",
    reason: "Layering must use the existing --z-* vocabulary rather than new numeric stacks.",
    findings: () => cssDeclarationFindings(/\bz-index\s*:\s*(?!var\()[0-9]+\b/i),
  },
  {
    key: "placeholderCopyUses",
    label: "placeholder or AI-cliche copy uses",
    reason: "Visible UI should be object-specific and concrete, not generic placeholder or marketing copy.",
    findings: () => regexFindings(
      allSourceFiles,
      /\b(lorem ipsum|john doe|jane doe|jane smith|acme corp|smartflow|next-gen|game-changer|unleash|elevate)\b/gi
    ),
  },
  {
    key: "sketchyDecorativeSvgTells",
    label: "sketchy decorative SVG tells",
    reason: "Sketchy hand-drawn SVG decoration is a Codex design tell; use real assets or system icons.",
    findings: () => regexFindings(
      allSourceFiles,
      /\b(feTurbulence|feDisplacementMap|loose-sketch|sketchy|doodle)\b/gi
    ),
  },
  {
    key: "classicSoftChromeShadow",
    label: "soft chrome shadows (Classic :root)",
    reason: "Classic chrome keeps a 1-bit structure; blurred/soft shadows are forbidden in the default (Classic) token block.",
    findings: () => softShadowInBlockFindings(
      cssSourceFiles.filter((file) => file.rel.includes("styles/00-foundation.css")),
      ":root"
    ),
  },
  {
    key: "platinumSoftChromeShadow",
    label: "soft chrome shadows (Platinum block)",
    reason: "Platinum chrome uses 0-blur hard bevels; blurred/soft shadows are forbidden in the Platinum theme block.",
    findings: () => softShadowInBlockFindings(
      cssSourceFiles.filter((file) => file.rel.includes("styles/65-appearance-themes.css")),
      'body[data-theme="platinum"]'
    ),
  },
];

for (const check of checks) {
  const findings = check.findings();
  const allowed = budget.checks?.[check.key];
  if (typeof allowed !== "number") {
    fail(`${budgetPath} missing budget for ${check.key}; current count is ${findings.length}`);
    continue;
  }
  if (findings.length > allowed) {
    fail(`${check.label}: ${findings.length}/${allowed}. ${check.reason}`);
    findings.slice(0, 10).forEach((item) => {
      fail(`  ${item.file}:${item.line} ${item.snippet}`);
    });
    if (findings.length > 10) fail(`  ... and ${findings.length - 10} more`);
  } else {
    ok(`${check.label} ${findings.length}/${allowed}`);
  }
}

for (const key of Object.keys(budget.checks || {})) {
  if (!checks.some((check) => check.key === key)) {
    fail(`${budgetPath} has stale design budget key: ${key}`);
  }
}

if (cssFiles.length === 0) fail("No CSS files found for design verification");

if (failures.length) {
  console.error(`\nDesign governance verification failed: ${failures.length} issue(s).`);
  console.error("See docs/design/DESIGN.md for the project design contract.");
  process.exit(1);
}

console.log("\nDesign governance verification passed.");
