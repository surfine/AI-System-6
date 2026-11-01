// ClioCode command policy: classifies one shell command string as
//   - "readonly"   every segment is on the allowlist, parsed flag by flag, and
//                  nothing can write, execute another program or expand into
//                  something unseen (no redirection, substitution, variables,
//                  subshells, background jobs, env-assignment prefixes);
//   - "dangerous"  matches the danger list (recursive delete, force push,
//                  hard reset, disk writers, sudo, curl|sh, secret paths ...);
//   - "ordinary"   everything else.
// Danger wins over read-only. When in doubt a command is NOT read-only.
//
// The command is parsed, never evaluated. permission-modes.js turns the class
// into a decision (a read-only command runs without a prompt; a dangerous one
// asks every time in every mode but Plan); the Seatbelt profile stays the real
// boundary, this only decides who gets asked.
//
// The shape (a read-only allowlist plus a separate danger matcher) follows
// ZCode's bash-readonly-policy and guarded/command.ts; the tables and parser
// below are written for ClioCode.
// adapted from ZCode (Apache-2.0) apps/zcode-cli/packages/core/src/tool/handlers/guarded/command.ts

"use strict";

const path = require("node:path");

/** Danger codes the approval card can explain (client table: cliocode_danger_<code>). */
const DANGER_CODES = Object.freeze([
  "recursive_delete",
  "delete_outside_project",
  "force_push",
  "hard_reset",
  "force_clean",
  "mirror_delete",
  "recursive_chmod",
  "disk_write",
  "privilege_escalation",
  "pipe_to_shell",
  "sensitive_path",
]);

const MAX_LENGTH = 10_000;
const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh", "fish", "csh", "tcsh"]);
const STDIN_INTERPRETERS = new Set(["python", "python3", "perl", "ruby", "node"]);
const ELEVATORS = new Set(["sudo", "doas", "su", "pkexec"]);
const WRAPPERS = new Set(["env", "command", "builtin", "nohup", "nice", "time", "exec", "timeout", "stdbuf", "ionice", "xargs", ...ELEVATORS]);
const LEADING = new Set(["{", "!", "then", "do", "else", "elif", "if", "while", "until"]);

// --- Tokenizer -----------------------------------------------------------------

/**
 * @typedef {{ text: string, glob: boolean, brace: boolean, tilde: boolean }} Word
 * @typedef {{ words: Word[], before: string }} Segment
 */

/**
 * Split a command into segments (at ; && || | & newline) and words, with
 * shell quoting resolved. Returns the constructs that make a command
 * unanalysable as `unsafe` reasons; never evaluates anything.
 * @param {string} command
 * @returns {{ ok: boolean, segments: Segment[], unsafe: Set<string> }}
 */
function tokenize(command) {
  /** @type {Segment[]} */
  const segments = [];
  const unsafe = new Set();
  let words = /** @type {Word[]} */ ([]);
  let before = "";
  let text = "";
  let raw = ""; // the word as the shell sees it unquoted: quoted characters become "x"
  let inWord = false;
  const endWord = () => {
    if (!inWord) return;
    words.push({
      text,
      glob: /[*?[]/.test(raw),
      brace: /\{[^{}]*(,|\.\.)[^{}]*\}/.test(raw),
      tilde: raw.startsWith("~"),
    });
    text = "";
    raw = "";
    inWord = false;
  };
  const endSegment = (op) => {
    endWord();
    if (words.length) segments.push({ words, before });
    words = [];
    before = op;
  };
  const add = (ch, quoted) => {
    text += ch;
    raw += quoted ? "x" : ch;
    inWord = true;
  };
  const n = command.length;
  for (let i = 0; i < n; i += 1) {
    const ch = command[i];
    const next = command[i + 1] || "";
    if (ch === " " || ch === "\t" || ch === "\r") endWord();
    else if (ch === "\n") endSegment(";");
    else if (ch === "'") {
      const close = command.indexOf("'", i + 1);
      if (close < 0) return { ok: false, segments, unsafe };
      inWord = true;
      for (const c of command.slice(i + 1, close)) add(c, true);
      i = close;
    } else if (ch === '"') {
      inWord = true;
      let j = i + 1;
      for (; j < n && command[j] !== '"'; j += 1) {
        const c = command[j];
        const d = command[j + 1] || "";
        if (c === "\\" && (d === '"' || d === "\\" || d === "$" || d === "`")) { add(d, true); j += 1; }
        else if (c === "\\" && d === "\n") j += 1;
        else if (c === "`") { unsafe.add("substitution"); add(c, true); }
        else if (c === "$") {
          if (d === "(") unsafe.add("substitution");
          else if (/[A-Za-z0-9_{@*#?$!-]/.test(d)) unsafe.add("variable");
          add(c, true);
        } else add(c, true);
      }
      if (j >= n) return { ok: false, segments, unsafe };
      i = j;
    } else if (ch === "\\") {
      if (i + 1 >= n) return { ok: false, segments, unsafe };
      if (next !== "\n") add(next, true);
      i += 1;
      inWord = true;
    } else if (ch === "$") {
      if (next === "(") unsafe.add("substitution");
      else if (next === "'") unsafe.add("variable");
      else if (/[A-Za-z0-9_{@*#?$!-]/.test(next)) unsafe.add("variable");
      add(ch, false);
    } else if (ch === "`") {
      unsafe.add("substitution");
      add(ch, false);
    } else if (ch === ";") endSegment(";");
    else if (ch === "|") {
      if (next === "|") { endSegment("||"); i += 1; }
      else { endSegment("|"); if (next === "&") i += 1; }
    } else if (ch === "&") {
      if (next === "&") { endSegment("&&"); i += 1; }
      else if (next === ">") { unsafe.add("redirect"); endWord(); }
      else { unsafe.add("background"); endSegment("&"); }
    } else if (ch === ">" || ch === "<") { unsafe.add("redirect"); endWord(); }
    else if (ch === "(" || ch === ")") { unsafe.add("subshell"); endWord(); }
    else if (ch === "#" && !inWord) {
      unsafe.add("comment");
      const eol = command.indexOf("\n", i);
      if (eol < 0) break;
      i = eol - 1;
    } else add(ch, false);
  }
  endSegment(";");
  return { ok: true, segments, unsafe };
}

// --- Paths ---------------------------------------------------------------------

/** @param {string} child @param {string} parent */
function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

/**
 * Resolve a word as a path against the command's cwd; null when it cannot be
 * known statically (another user's home, an unresolved variable).
 * @param {string} text
 * @param {{ cwd: string, home: string }} ctx
 */
function resolveWord(text, ctx) {
  let value = text;
  if (value === "~" || value.startsWith("~/")) value = ctx.home + value.slice(1);
  else if (/^\$\{?HOME\}?(\/|$)/.test(value)) value = value.replace(/^\$\{?HOME\}?/, ctx.home);
  else if (value.startsWith("~") || value.includes("$")) return null;
  return path.resolve(ctx.cwd, value);
}

/** Absolute prefixes whose touching always asks, whatever the command. */
function sensitiveRoots(home) {
  return [
    ".ssh", ".aws", ".gnupg", ".netrc", ".config/gh", ".docker/config.json", ".kube",
    "Library/Keychains", "Library/LaunchAgents", ".zshrc", ".zprofile", ".zshenv", ".bashrc", ".bash_profile", ".profile",
  ].map((rel) => path.join(home, rel)).concat(["/etc", "/private/etc", "/Library/LaunchAgents", "/Library/LaunchDaemons"]);
}

/** @param {string} text @param {{ cwd: string, home: string }} ctx */
function touchesSensitivePath(text, ctx) {
  const roots = sensitiveRoots(ctx.home);
  for (const part of [text, text.includes("=") ? text.slice(text.indexOf("=") + 1) : ""]) {
    if (!part || !(part.includes("/") || part.startsWith("~") || part.startsWith("$HOME") || part.startsWith("${HOME}"))) continue;
    const resolved = resolveWord(part, ctx);
    if (resolved && roots.some((root) => isInside(resolved, root))) return true;
  }
  return false;
}

// --- Danger --------------------------------------------------------------------

const base = (word) => path.basename(String(word || ""));
const isAssign = (text) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(text);
/** A short-flag cluster (not --long) that contains one of `chars`. */
const clusterHas = (text, chars) => /^-[A-Za-z]/.test(text) && !text.startsWith("--") && [...text.slice(1)].some((c) => chars.includes(c));

/**
 * The command invocations hidden in a segment: itself, what a wrapper (env,
 * xargs, time, sudo ...) runs, and what find -exec runs. Over-matching only
 * makes a command ask more often.
 * @param {string[]} words
 * @param {number} [depth]
 * @returns {string[][]}
 */
function invocations(words, depth = 0) {
  /** @type {string[][]} */
  const out = [];
  if (depth > 6) return out;
  let i = 0;
  while (i < words.length && (isAssign(words[i]) || LEADING.has(words[i]))) i += 1;
  const rest = words.slice(i);
  if (!rest.length) return out;
  out.push(rest);
  const name = base(rest[0]);
  if (WRAPPERS.has(name)) {
    for (let j = 1; j < rest.length && j < 12; j += 1) out.push(...invocations(rest.slice(j), depth + 1));
  }
  if (name === "find") {
    rest.forEach((word, k) => {
      if (["-exec", "-execdir", "-ok", "-okdir"].includes(word)) out.push(...invocations(rest.slice(k + 1), depth + 1));
    });
  }
  return out;
}

/** The global options of git, skipped to find the subcommand. */
function gitSubcommand(args) {
  let i = 0;
  while (i < args.length && args[i].startsWith("-")) {
    i += ["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path"].includes(args[i]) ? 2 : 1;
  }
  return { sub: args[i] || "", rest: args.slice(i + 1) };
}

/**
 * The danger code of one invocation, or "".
 * @param {string[]} inv
 * @param {{ cwd: string, home: string, project: string }} ctx
 */
function dangerOfInvocation(inv, ctx) {
  const name = base(inv[0]);
  const args = inv.slice(1);
  if (ELEVATORS.has(name)) return "privilege_escalation";
  if (name === "rm") {
    const targets = [];
    let recursive = false;
    let endOpts = false;
    for (const arg of args) {
      if (!endOpts && arg === "--") endOpts = true;
      else if (!endOpts && arg.startsWith("-") && arg.length > 1) recursive = recursive || arg === "--recursive" || clusterHas(arg, "rR");
      else targets.push(arg);
    }
    if (recursive) return "recursive_delete";
    for (const target of targets) {
      const resolved = resolveWord(target, ctx);
      if (!resolved || !isInside(resolved, ctx.project)) return "delete_outside_project";
    }
    return "";
  }
  if (name === "find" && args.includes("-delete")) return "recursive_delete";
  if (name === "git") {
    const { sub, rest } = gitSubcommand(args);
    if (sub === "push" && rest.some((a) => /^--force/.test(a) || a === "--mirror" || clusterHas(a, "f") || /^\+./.test(a))) return "force_push";
    if (sub === "reset" && rest.includes("--hard")) return "hard_reset";
    if (sub === "clean" && rest.some((a) => a === "--force" || clusterHas(a, "f")) && !rest.some((a) => a === "--dry-run" || clusterHas(a, "n"))) return "force_clean";
    return "";
  }
  if (name === "rsync" && args.some((a) => /^--del($|e)/.test(a) || a === "--remove-source-files")) return "mirror_delete";
  if (["chmod", "chown", "chgrp"].includes(name) && args.some((a) => a === "--recursive" || clusterHas(a, "R"))) return "recursive_chmod";
  if (name.startsWith("mkfs") || name.startsWith("newfs") || ["dd", "shred", "fdisk"].includes(name)) return "disk_write";
  if (name === "diskutil" && args.some((a) => /^(erase|partition|zero|secure|reformat|apfs)/i.test(a) && /(erase|partition|zero|secure|reformat|delete)/i.test(a))) return "disk_write";
  return "";
}

/**
 * The danger code of a whole command string, or "".
 * @param {string} command
 * @param {{ cwd: string, home: string, project: string }} ctx
 * @param {number} [depth]
 */
function dangerOf(command, ctx, depth = 0) {
  if (depth > 4) return "";
  if (/\b(sh|bash|zsh|dash|ksh|eval|source)\b[^|;&\n]*(\$\(|`|<\()\s*(curl|wget)\b/.test(command)) return "pipe_to_shell";
  const tokens = tokenize(command);
  for (const body of substitutionBodies(command)) {
    const code = dangerOf(body, ctx, depth + 1);
    if (code) return code;
  }
  for (const segment of tokens.segments) {
    const texts = segment.words.map((w) => w.text);
    const calls = invocations(texts);
    if (segment.before === "|" && calls.some((inv) => {
      const name = base(inv[0]);
      return SHELLS.has(name) || (STDIN_INTERPRETERS.has(name) && inv.slice(1).every((a) => a === "-"));
    })) return "pipe_to_shell";
    for (const inv of calls) {
      const code = dangerOfInvocation(inv, ctx);
      if (code) return code;
      if (SHELLS.has(base(inv[0]))) {
        const c = inv.findIndex((a, k) => k > 0 && clusterHas(a, "c"));
        if (c > 0 && inv[c + 1] !== undefined) {
          const inner = dangerOf(inv[c + 1], ctx, depth + 1);
          if (inner) return inner;
        }
      }
    }
    if (texts.some((text) => touchesSensitivePath(text, ctx))) return "sensitive_path";
  }
  return "";
}

/** The bodies of $( ... ) and backtick substitutions that the shell would run (not inside single quotes). */
function substitutionBodies(command) {
  const bodies = [];
  let inSingle = false;
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];
    if (ch === "'" ) inSingle = !inSingle;
    else if (!inSingle && ch === "\\") i += 1;
    else if (!inSingle && ch === "$" && command[i + 1] === "(") {
      let depth = 1;
      let j = i + 2;
      for (; j < command.length && depth; j += 1) {
        if (command[j] === "(") depth += 1;
        else if (command[j] === ")") depth -= 1;
      }
      bodies.push(command.slice(i + 2, depth ? command.length : j - 1));
    } else if (!inSingle && ch === "`") {
      const close = command.indexOf("`", i + 1);
      bodies.push(command.slice(i + 1, close < 0 ? command.length : close));
      if (close < 0) break;
      i = close;
    }
  }
  return bodies;
}

// --- Read-only allowlist -------------------------------------------------------

const set = (text) => new Set(text.split(/\s+/).filter(Boolean));

/**
 * @typedef {object} Spec  one command's flags, parsed flag by flag
 * @property {string} [shortBool]  short flag letters without a value
 * @property {string} [shortVal]   short flag letters that take a value (attached or the next word)
 * @property {Set<string>} [bool]  --long flags without a value
 * @property {Set<string>} [val]   --long flags with a value (next word, or only --x=v when eqOnly)
 * @property {Set<string>} [opt]   --long flags with an optional attached value
 * @property {Set<string>} [valSep] --long flags whose value may be the next word, if it is not a flag
 * @property {boolean} [eqOnly]    long values only as --flag=value
 * @property {boolean} [numeric]   accepts -<digits>
 * @property {RegExp[]} [re]       whole tokens accepted as they are
 */

/** @type {Record<string, Spec>} */
const SIMPLE = {
  ls: { shortBool: "aAbCcdFfGgHhiklmnopqRrSsTtUuwx1@eO", bool: set("--help") },
  cat: { shortBool: "nbsvetETAu", bool: set("--help") },
  head: { shortBool: "qv", shortVal: "nc", val: set("--lines --bytes"), numeric: true, bool: set("--quiet --silent --verbose") },
  tail: { shortBool: "qv", shortVal: "nc", val: set("--lines --bytes"), numeric: true, bool: set("--quiet --silent --verbose") },
  wc: { shortBool: "clmwL", bool: set("--lines --words --bytes --chars --max-line-length") },
  pwd: { shortBool: "LP" },
  which: { shortBool: "as" },
  sort: {
    shortBool: "bcCdfghimMnrRsuVz", shortVal: "ktS",
    bool: set("--reverse --unique --numeric-sort --ignore-case --version-sort --human-numeric-sort --month-sort --stable --check --ignore-leading-blanks --dictionary-order --general-numeric-sort"),
    val: set("--key --field-separator --buffer-size"),
  },
  uniq: { shortBool: "cdDiu", shortVal: "fsw", bool: set("--count --repeated --unique --ignore-case") },
  rg: {
    shortBool: "iSsnNHIlcovwxFPuabLUq0p",
    shortVal: "eglTtABCmjdMEr",
    bool: set("--hidden --no-ignore --no-ignore-vcs --files --count --count-matches --files-with-matches --files-without-match --line-number --no-line-number --with-filename --no-filename --heading --no-heading --ignore-case --smart-case --case-sensitive --fixed-strings --word-regexp --line-regexp --only-matching --invert-match --json --follow --stats --vimgrep --column --trim --multiline --text --null --pcre2 --no-messages --quiet --pretty --unrestricted --byte-offset --no-config --max-columns-preview"),
    val: set("--regexp --glob --iglob --type --type-not --max-count --max-depth --context --after-context --before-context --threads --max-columns --color --encoding --replace --sort --sortr"),
  },
  grep: {
    shortBool: "ivncLlhHrRwxFEGoqsaIbZ",
    shortVal: "emABC",
    bool: set("--ignore-case --invert-match --line-number --count --files-with-matches --files-without-match --no-filename --with-filename --recursive --dereference-recursive --word-regexp --line-regexp --fixed-strings --extended-regexp --basic-regexp --only-matching --quiet --no-messages --text --binary-files --null"),
    val: set("--regexp --max-count --after-context --before-context --context --include --exclude --exclude-dir"),
    opt: set("--color --colour"),
  },
};

const GIT_DIFFISH = {
  shortBool: "pustbwzRiaqvMCsl",
  shortVal: "SGnLUm",
  numeric: true,
  eqOnly: true,
  bool: set("--oneline --graph --stat --shortstat --numstat --name-only --name-status --patch --no-patch --abbrev-commit --no-abbrev-commit --all --no-merges --merges --first-parent --reverse --follow --no-color --cached --staged --check --summary --raw --full-index --binary --text --minimal --patience --histogram --ignore-space-change --ignore-all-space --ignore-space-at-eol --ignore-blank-lines --quiet --exit-code --topo-order --date-order --left-right --cherry-pick --branches --tags --remotes --regexp-ignore-case --no-ext-diff --no-textconv --no-renames --find-renames --name-only"),
  val: set("--max-count --skip --since --until --after --before --author --committer --grep --format --pretty --date --diff-filter --unified --relative --word-diff-regex --src-prefix --dst-prefix"),
  opt: set("--decorate --color --abbrev --stat --word-diff --color-words --find-renames --find-copies --dirstat --no-decorate"),
};

/** @type {Record<string, Spec>} */
const GIT = {
  status: {
    shortBool: "sbvz",
    bool: set("--short --branch --long --verbose --show-stash --ahead-behind --no-ahead-behind --renames --no-renames --null"),
    opt: set("--porcelain --untracked-files --ignored --ignore-submodules --column"),
    re: [/^-u(no|normal|all)?$/],
  },
  log: GIT_DIFFISH,
  diff: GIT_DIFFISH,
  show: GIT_DIFFISH,
  branch: {
    shortBool: "arvi",
    bool: set("--all --remotes --verbose --list --show-current --no-color --ignore-case"),
    opt: set("--color --abbrev --column"),
    val: set("--sort --format"),
    valSep: set("--contains --no-contains --merged --no-merged --points-at"),
    eqOnly: true,
  },
  "rev-parse": {
    shortBool: "q",
    eqOnly: true,
    bool: set("--show-toplevel --git-dir --verify --is-inside-work-tree --is-bare-repository --show-prefix --show-cdup --symbolic-full-name --absolute-git-dir --git-common-dir --quiet --sq --symbolic --is-inside-git-dir"),
    opt: set("--abbrev-ref --short"),
  },
  "ls-files": {
    shortBool: "cdmoiksuzvt",
    eqOnly: true,
    bool: set("--cached --deleted --modified --others --ignored --stage --killed --unmerged --exclude-standard --full-name --error-unmatch --deduplicate --eol --directory --no-empty-directory --resolve-undo"),
    val: set("--exclude"),
  },
  blame: {
    shortBool: "ltsewpfbnMCh",
    shortVal: "L",
    eqOnly: true,
    bool: set("--porcelain --line-porcelain --incremental --show-name --show-number --show-email --root --no-color --color-lines --color-by-age"),
    val: set("--date --abbrev"),
  },
  // (--output, -c, --ext-diff, --no-index, --contents and any flag not listed
  // above are not here, so any command that uses them is not read-only.)
};

/** @param {Word} w */
function wordOk(w) {
  if (w.brace) return false;
  if (w.tilde && !(w.text === "~" || w.text.startsWith("~/"))) return false;
  if (w.glob && (/^[*?[]/.test(w.text) || w.text.startsWith("-"))) return false;
  return true;
}

/**
 * Parse arguments against a spec. Null when any flag or word is outside it.
 * @param {Word[]} args
 * @param {Spec} spec
 * @returns {{ pos: Word[], seen: Set<string> } | null}
 */
function parseArgs(args, spec) {
  /** @type {Word[]} */
  const pos = [];
  const seen = new Set();
  let endOpts = false;
  for (let i = 0; i < args.length; i += 1) {
    const w = args[i];
    const t = w.text;
    if (!endOpts && spec.re?.some((re) => re.test(t))) { seen.add(t); continue; }
    if (endOpts || t === "-" || !t.startsWith("-")) {
      if (!wordOk(w)) return null;
      pos.push(w);
      continue;
    }
    if (t === "--") { endOpts = true; seen.add("--"); continue; }
    if (t.startsWith("--")) {
      const eq = t.indexOf("=");
      const name = eq < 0 ? t : t.slice(0, eq);
      if (spec.val?.has(name)) {
        seen.add(name);
        if (eq < 0) {
          if (spec.eqOnly || i + 1 >= args.length || !wordOk(args[i + 1])) return null;
          i += 1;
        }
      } else if (spec.valSep?.has(name)) {
        seen.add(name);
        if (eq < 0 && i + 1 < args.length && !args[i + 1].text.startsWith("-")) {
          if (!wordOk(args[i + 1])) return null;
          i += 1;
        }
      } else if (spec.opt?.has(name)) seen.add(name);
      else if (spec.bool?.has(name) && eq < 0) seen.add(name);
      else return null;
      continue;
    }
    if (spec.numeric && /^-\d+$/.test(t)) { seen.add("-n"); continue; }
    for (let k = 1; k < t.length; k += 1) {
      const c = t[k];
      if (spec.shortVal?.includes(c)) {
        seen.add(`-${c}`);
        if (k === t.length - 1) {
          if (i + 1 >= args.length || !wordOk(args[i + 1])) return null;
          i += 1;
        }
        break;
      }
      if (spec.shortBool?.includes(c)) seen.add(`-${c}`);
      else return null;
    }
  }
  return { pos, seen };
}

/** Every word names a file inside the project that is not a dotenv file. */
function pathsOk(words, ctx) {
  return words.every((w) => {
    const resolved = resolveWord(w.text, ctx);
    return Boolean(resolved) && isInside(resolved, ctx.project) && !/^\.env($|\.)/.test(path.basename(resolved));
  });
}

/** @param {Word[]} args @param {{ cwd: string, home: string, project: string }} ctx */
function findReadOnly(args, ctx) {
  const VALUE = set("-name -iname -path -ipath -wholename -iwholename -regex -iregex -type -xtype -maxdepth -mindepth -size -mtime -atime -ctime -mmin -amin -cmin -newer -perm -user -group -links -inum -samefile -lname -ilname -uid -gid -newermt");
  const PLAIN = set("-print -print0 -prune -not -and -or -a -o -depth -d -L -H -P -xdev -mount -empty -readable -writable -executable -true -false -noleaf -nogroup -nouser ! ( )");
  const paths = [];
  let expr = false;
  for (let i = 0; i < args.length; i += 1) {
    const w = args[i];
    const t = w.text;
    if (!wordOk(w) && !t.startsWith("-")) return false;
    if (VALUE.has(t)) {
      i += 1;
      if (i >= args.length || !wordOk(args[i])) return false;
      expr = true;
    } else if (PLAIN.has(t)) expr = expr || !["-L", "-H", "-P"].includes(t);
    else if (t.startsWith("-") || t === "{}" || expr) return false;
    else paths.push(w);
  }
  return pathsOk(paths, ctx);
}

/** @param {Word[]} args @param {{ cwd: string, home: string, project: string }} ctx */
function gitReadOnly(args, ctx) {
  let i = 0;
  while (i < args.length && args[i].text.startsWith("-")) {
    if (!["--no-pager", "-P", "--no-optional-locks"].includes(args[i].text)) return false;
    i += 1;
  }
  const sub = args[i]?.text || "";
  const spec = Object.prototype.hasOwnProperty.call(GIT, sub) ? GIT[sub] : null;
  if (!spec) return false;
  const parsed = parseArgs(args.slice(i + 1), spec);
  if (!parsed) return false;
  if (sub === "branch" && parsed.pos.length && !parsed.seen.has("--list")) return false;
  return pathsOk(parsed.pos, ctx);
}

/**
 * Is this one segment a read-only command?
 * @param {Word[]} words
 * @param {{ cwd: string, home: string, project: string }} ctx
 */
function segmentReadOnly(words, ctx) {
  const head = words[0];
  if (!head || head.glob || head.brace || head.tilde || /[/=]/.test(head.text)) return false;
  const name = head.text;
  const args = words.slice(1);
  if (name === "echo") return args.every(wordOk);
  if (name === "find") return findReadOnly(args, ctx);
  if (name === "git") return gitReadOnly(args, ctx);
  if (name === "node") return args.length === 1 && (args[0].text === "--version" || args[0].text === "-v");
  if (name === "npm") {
    if (args.length === 1 && (args[0].text === "--version" || args[0].text === "-v")) return true;
    if (!["ls", "list", "ll", "la"].includes(args[0]?.text)) return false;
    const parsed = parseArgs(args.slice(1), {
      shortBool: "alpg", shortVal: "w",
      bool: set("--all --long --json --parseable --prod --production --dev --development --link --global --unicode --no-unicode --workspaces --include-workspace-root"),
      val: set("--omit --depth --workspace"),
    });
    return Boolean(parsed);
  }
  const spec = Object.prototype.hasOwnProperty.call(SIMPLE, name) ? SIMPLE[name] : null;
  if (!spec) return false;
  const parsed = parseArgs(args, spec);
  if (!parsed) return false;
  let files = parsed.pos;
  if (name === "pwd") return files.length === 0;
  if (name === "which") return true;
  if (name === "uniq") return files.length <= 1 && pathsOk(files, ctx);
  if (name === "rg" || name === "grep") {
    const hasPattern = ["-e", "--regexp", "--files"].some((flag) => parsed.seen.has(flag));
    if (!hasPattern) files = files.slice(1);
  }
  return pathsOk(files, ctx);
}

// --- Public --------------------------------------------------------------------

/**
 * Quote an argv array into the one command string the policy reads.
 * @param {unknown[]} argv
 */
function joinArgv(argv) {
  return argv.map((value) => {
    const text = String(value);
    return /^[A-Za-z0-9_@%+=:,./-]+$/.test(text) ? text : `'${text.replace(/'/g, "'\\''")}'`;
  }).join(" ");
}

/**
 * @typedef {"readonly" | "ordinary" | "dangerous"} CommandClass
 * @param {string} command
 * @param {{ project: string, cwd?: string, home?: string }} context
 * @returns {{ commandClass: CommandClass, danger: string }}
 */
function classifyCommand(command, context) {
  const text = String(command || "");
  const home = context.home || require("node:os").homedir();
  const project = path.resolve(context.project);
  const ctx = { project, cwd: context.cwd ? path.resolve(context.cwd) : project, home };
  if (!text.trim() || text.length > MAX_LENGTH) return { commandClass: "ordinary", danger: "" };
  const danger = dangerOf(text, ctx);
  if (danger) return { commandClass: "dangerous", danger };
  const tokens = tokenize(text);
  if (!tokens.ok || tokens.unsafe.size || !tokens.segments.length) return { commandClass: "ordinary", danger: "" };
  const readonly = tokens.segments.every((segment) => segment.before !== "&" && segmentReadOnly(segment.words, ctx));
  return { commandClass: readonly ? "readonly" : "ordinary", danger: "" };
}

module.exports = { DANGER_CODES, classifyCommand, joinArgv, tokenize };
