// 文思泉涌 rule packages: one package = a named set of checks, each finding
// carrying a severity (D4) and, where it can, a place to look.
//
// Pure: no DOM, storage or network, Node-requireable — the same file runs in
// the desk (文思泉涌's checks panel, P2) and in the server (the /check route,
// P2), so both sides judge an article identically. The shape is the shared
// contract (CONTRACTS「规则包」):
//
//   Package = { id, label, version, checks: [Check] }
//   Check   = { id, label, defaultSeverity, run(ctx) → Finding[] }
//   ctx     = { site, contentType, article: { filename, frontMatter, body,
//             existing }, taxonomy, siteRoot }
//   Finding = { checkId, severity, message, line?, excerpt?, fixHint? }
//
// severity ∈ "error" | "warn" | "info" — D4: 原话对不上、说话人错、必填缺失、
// 网址冲突挡发布;AI 腔、推测句、description 超长只提示;其余是建议。
//
// Script-backed checks (P2) parse a site script's stdout through
// parseScriptOutput; the five parser ids are registered now, one minimal
// parser (check_provenance) proves the seam, and the real five arrive in P2.

(function exposeRulePackages(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.AISystem6RulePackages = api;
    root.AISystem6RulePackagesLoaded = true;
  }
})(typeof globalThis !== "undefined" ? (/** @type {any} */ (globalThis)).window || null : null, () => {
  const SEVERITIES = Object.freeze(["error", "warn", "info"]);

  // aaronlau's five site scripts (PLAN G5). The ids are the registry; the
  // parsers behind four of them are P2 work.
  const PARSER_IDS = Object.freeze(["check_v3", "check_2020_2024", "check_provenance", "check_notes", "humanizer_scan"]);
  const PARSER_ID_SET = new Set(PARSER_IDS);

  const ID_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
  const hasLabel = (value) => typeof value === "string" && !!value.trim();
  const validId = (value) => typeof value === "string" && ID_PATTERN.test(value);

  /**
   * One check of a package: what it is called, how loud it is by default, and
   * the pure function that judges one article.
   * @param {any} check
   */
  function validateCheck(check) {
    return !!check
      && typeof check === "object"
      && validId(check.id)
      && hasLabel(check.label)
      && SEVERITIES.includes(check.defaultSeverity)
      && typeof check.run === "function";
  }

  /**
   * Validate a package manifest (the shape a site description names in its
   * rulePackages list, and what a loaded script package must answer to).
   * @param {any} pack
   */
  function validatePackage(pack) {
    return !!pack
      && typeof pack === "object"
      && validId(pack.id)
      && hasLabel(pack.label)
      && hasLabel(pack.version)
      && Array.isArray(pack.checks)
      && pack.checks.length > 0
      && pack.checks.every((check) => validateCheck(check));
  }

  /**
   * Bring one finding to the contract shape: the check owns the id unless the
   * finding says otherwise, an unknown severity falls back to the check's
   * default, and the optional locators only ride along when they are real.
   * Anything without a message is not a finding.
   * @param {any} check
   * @param {any} finding
   */
  function normalizeFinding(check, finding) {
    if (!finding || typeof finding !== "object") return null;
    if (typeof finding.message !== "string" || !finding.message.trim()) return null;
    const severity = SEVERITIES.includes(finding.severity) ? finding.severity : check.defaultSeverity;
    return {
      checkId: validId(finding.checkId) ? finding.checkId : check.id,
      severity,
      message: finding.message,
      ...(Number.isInteger(finding.line) && finding.line > 0 ? { line: finding.line } : {}),
      ...(typeof finding.excerpt === "string" && finding.excerpt ? { excerpt: finding.excerpt } : {}),
      ...(typeof finding.fixHint === "string" && finding.fixHint ? { fixHint: finding.fixHint } : {}),
    };
  }

  /**
   * Run every check of one package against one article. A throwing check
   * becomes a warn against itself: one broken check must not take the whole
   * list down, and it must not pass in silence either.
   * @param {any} pack a validated package
   * @param {any} ctx { site, contentType, article, taxonomy, siteRoot }
   * @returns {Array<any>} Finding[]
   */
  function runPackage(pack, ctx) {
    const findings = [];
    for (const check of Array.isArray(pack?.checks) ? pack.checks : []) {
      if (!validateCheck(check)) continue;
      try {
        const produced = check.run(ctx);
        if (Array.isArray(produced)) {
          for (const finding of produced) {
            const normalized = normalizeFinding(check, finding);
            if (normalized) findings.push(normalized);
          }
        }
      } catch (error) {
        findings.push({ checkId: check.id, severity: "warn", message: `检查「${check.label}」没能完成：${String(error?.message || error)}` });
      }
    }
    return findings;
  }

  // The slug half of a URL: lowercase letters and digits, words joined by
  // single hyphens, nothing hanging off the ends.
  const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  const isBlank = (value) => value === undefined || value === null
    || (typeof value === "string" && !value.trim())
    || (Array.isArray(value) && value.length === 0);

  // --- builtin-generic: the interface's living sample -----------------------
  //
  // Three checks, the ones any git-static site needs before its own scripts
  // exist. They read only the ctx the caller hands over — the site
  // description's field table, the article's front matter, and the same-site
  // filenames and front matters the caller gathered for dedupe.

  const requiredFieldsCheck = {
    id: "required-fields",
    label: "必填字段",
    defaultSeverity: "error",
    run(ctx) {
      const findings = [];
      const fields = Array.isArray(ctx?.contentType?.fields) ? ctx.contentType.fields : [];
      const frontMatter = ctx?.article?.frontMatter || {};
      for (const field of fields) {
        if (!field?.key || !field.required) continue;
        if (isBlank(frontMatter[field.key])) {
          findings.push({
            severity: "error",
            message: `缺少必填字段「${field.key}」。`,
            fixHint: `在 front matter 补上 ${field.key}，再发。`,
          });
          continue;
        }
        // A required date must also be the date the site reads: the generator
        // compares strings and builds URLs from them, so 2026/11/08 is a hole
        // the writer cannot see until the page is wrong.
        if (field.type === "date" && (field.format || "YYYY-MM-DD") === "YYYY-MM-DD") {
          const value = String(frontMatter[field.key]).trim();
          if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
            findings.push({
              severity: "error",
              message: `「${field.key}」要写成 YYYY-MM-DD，现在是「${value}」。`,
              fixHint: `改成 2026-11-08 这样的写法。`,
              excerpt: value.slice(0, 40),
            });
          }
        }
      }
      return findings;
    },
  };

  const slugCheck = {
    id: "slug-format-dedupe",
    label: "slug 格式与查重",
    defaultSeverity: "error",
    run(ctx) {
      const findings = [];
      const frontMatter = ctx?.article?.frontMatter || {};
      const slug = typeof frontMatter.slug === "string" ? frontMatter.slug.trim() : "";
      if (slug && !SLUG_PATTERN.test(slug)) {
        findings.push({
          severity: "error",
          message: `slug「${slug}」不是网址形状（小写字母数字，词间连字）。`,
          fixHint: "改成小写字母和数字，词与词之间用一个连字。",
        });
      }
      // 查重只查同站的文件名/front matter，ctx 里给。同一篇（同名文件）不算撞。
      const filename = typeof ctx?.article?.filename === "string" ? ctx.article.filename : "";
      const existing = Array.isArray(ctx?.article?.existing) ? ctx.article.existing : [];
      for (const other of existing) {
        if (!other || typeof other !== "object") continue;
        const otherSlug = typeof other.frontMatter?.slug === "string" ? other.frontMatter.slug.trim() : "";
        if (!slug || !otherSlug || otherSlug !== slug || other.filename === filename) continue;
        const occupiedBy = typeof other.frontMatter?.title === "string" && other.frontMatter.title.trim()
          ? `《${other.frontMatter.title.trim()}》（${other.filename}）`
          : String(other.filename || "另一篇");
        findings.push({
          severity: "error",
          message: `slug「${slug}」已被 ${occupiedBy} 占用，两个网址会撞在一起。`,
          fixHint: "换一个 slug。",
        });
      }
      return findings;
    },
  };

  const descriptionLengthCheck = {
    id: "description-length",
    label: "description 长度",
    defaultSeverity: "warn",
    run(ctx) {
      const fields = Array.isArray(ctx?.contentType?.fields) ? ctx.contentType.fields : [];
      const limit = fields.find((field) => field?.key === "description")?.maxLength;
      if (!Number.isInteger(limit) || limit <= 0) return [];
      const description = ctx?.article?.frontMatter?.description;
      if (typeof description !== "string") return [];
      const length = [...description].length;
      if (length <= limit) return [];
      return [{
        severity: "warn",
        message: `description 写了 ${length} 个字，超过上限 ${limit}。`,
        fixHint: `压到 ${limit} 字以内；超长只会让摘要页难看，不挡发布。`,
      }];
    },
  };

  const BUILTIN_GENERIC = Object.freeze({
    id: "builtin-generic",
    label: "通用检查",
    version: "1.0.0",
    checks: Object.freeze([requiredFieldsCheck, slugCheck, descriptionLengthCheck]),
  });

  // --- Script-backed checks (P2), the parsing seam --------------------------

  /**
   * check_provenance's minimal parser: one provenance note per line, shaped
   * 「<post> | <reason> | <quote[:40]>」. A well-formed line is an info (an
   * attribution to keep); a line that ignores the shape is a warn (the script
   * said something, but not in the language the panel can place). A non-zero
   * exit with nothing parseable is a warn too. The real parser (P2) reads the
   * full v3 report; this one proves the seam.
   * @param {{ filename?: string, stdout?: string, exitCode?: number }} [output]
   */
  function parseProvenanceOutput({ filename = "", stdout = "", exitCode = 0 } = {}) {
    const findings = [];
    const lines = String(stdout || "").split(/\r?\n/).filter((line) => line.trim());
    for (const line of lines) {
      // The run footer counts the whole batch; it is not a per-quote row.
      if (/^flagged\s+\d+\s+of\s+\d+\s+quotes/i.test(line.trim())) continue;
      const parts = line.split("|").map((part) => part.trim());
      // A quote may itself carry pipes: everything from the third column on is
      // the quote, and it is bounded at 40 characters by the script's own rule.
      const post = parts[0];
      const reason = parts[1];
      const quote = parts.length > 2 ? parts.slice(2).join(" | ") : "";
      if (post && reason) {
        findings.push({
          checkId: "check_provenance",
          severity: "info",
          message: `${post} —— ${reason}`,
          ...(quote ? { excerpt: quote.slice(0, 40) } : {}),
        });
      } else {
        findings.push({
          checkId: "check_provenance",
          severity: "warn",
          message: "check_provenance 有一行没按「post | reason | quote」的约定输出。",
          excerpt: line.slice(0, 40),
        });
      }
    }
    const code = Number(exitCode) || 0;
    if (code !== 0 && !findings.length) {
      findings.push({
        checkId: "check_provenance",
        severity: "warn",
        message: `check_provenance 以退出码 ${code} 结束，没有可解析的输出。`,
        ...(filename ? { excerpt: filename } : {}),
      });
    }
    return findings;
  }

  /**
   * Parse one site script's output into findings. The five parser ids are the
   * registry; today only check_provenance parses — the others throw, so a
   * caller wiring them early fails loudly instead of passing silently.
   * @param {string} parserId one of PARSER_IDS
   * @param {{ filename?: string, stdout?: string, exitCode?: number }} [output]
   * @returns {Array<any>} Finding[]
   */
  /**
   * check_v3.py / check_notes.py print one line per file — `OK <name> chars=N …`
   * or `ERR <name>` — with each problem indented under it as `- <error>`. The
   * footer (`total errors N`) belongs to the run, not the article, so it is
   * skipped: the caller judges one article at a time.
   * @param {string} checkId the check id the findings carry
   * @param {{ filename?: string, stdout?: string, exitCode?: number }} [output]
   */
  function parsePerFileReport(checkId, { filename = "", stdout = "", exitCode = 0 } = {}) {
    const findings = [];
    let current = "";
    for (const raw of String(stdout || "").split(/\r?\n/)) {
      const line = raw.replace(/\s+$/, "");
      if (!line.trim()) continue;
      if (/^\s*-\s+/.test(line)) {
        findings.push({ checkId, severity: "error", message: line.replace(/^\s*-\s+/, "").trim(), ...(current ? { excerpt: current } : {}) });
        continue;
      }
      const verdict = line.match(/^(OK|ERR)\s+(\S+)/);
      if (verdict) {
        current = verdict[2];
        if (verdict[1] === "ERR") findings.push({ checkId, severity: "error", message: `${verdict[2]} fails the site's check`, excerpt: verdict[2] });
        continue;
      }
      if (/^(total errors|deep posts|flagged \d+ of|\d+ (posts|notes),)/i.test(line.trim())) continue;
      if (/^\s*(ERROR|WARN)\b/.test(line)) {
        const kind = /^\s*WARN\b/.test(line) ? "warn" : "error";
        findings.push({ checkId, severity: kind, message: line.trim() });
        continue;
      }
      findings.push({ checkId, severity: "info", message: line.trim().slice(0, 200) });
    }
    const code = Number(exitCode) || 0;
    if (code !== 0 && !findings.some((f) => f.severity === "error")) {
      findings.push({ checkId, severity: "warn", message: `${checkId} 以退出码 ${code} 结束，没有报出具体问题。`, ...(filename ? { excerpt: filename } : {}) });
    }
    return findings;
  }

  /**
   * check_2020_2024.py prints a `### <name>` header per post, then `  ERROR …`
   * and `  WARN <name>: …` rows, then a run footer.
   * @param {{ filename?: string, stdout?: string, exitCode?: number }} [output]
   */
  function parseMonthlyReport({ filename = "", stdout = "", exitCode = 0 } = {}) {
    const findings = [];
    for (const raw of String(stdout || "").split(/\r?\n/)) {
      const line = raw.replace(/\s+$/, "");
      if (!line.trim() || /^###\s/.test(line.trim())) continue;
      if (/^\s*ERROR\b/.test(line)) { findings.push({ checkId: "check_2020_2024", severity: "error", message: line.trim() }); continue; }
      if (/^\s*WARN\b/.test(line)) { findings.push({ checkId: "check_2020_2024", severity: "warn", message: line.trim() }); continue; }
      if (/^\d+ posts,/.test(line.trim())) continue;
      findings.push({ checkId: "check_2020_2024", severity: "info", message: line.trim().slice(0, 200) });
    }
    const code = Number(exitCode) || 0;
    if (code !== 0 && !findings.some((f) => f.severity === "error")) {
      findings.push({ checkId: "check_2020_2024", severity: "warn", message: `check_2020_2024 以退出码 ${code} 结束，没有报出具体问题。`, ...(filename ? { excerpt: filename } : {}) });
    }
    return findings;
  }

  /**
   * humanizer_scan.mjs prints `### <basename>` then `  <severity>  <ruleId>  …ctx…`.
   * Its severity vocabulary is the script's own (D4 maps them: style issues warn).
   * @param {{ filename?: string, stdout?: string, exitCode?: number }} [output]
   */
  function parseHumanizerScan({ filename = "", stdout = "", exitCode = 0 } = {}) {
    const findings = [];
    for (const raw of String(stdout || "").split(/\r?\n/)) {
      const line = raw.replace(/\s+$/, "");
      if (!line.trim() || /^###\s/.test(line.trim())) continue;
      const hit = line.match(/^\s*(error|warn|info|high|medium|low)\s+(\S+)\s*(.*)$/i);
      if (hit) {
        const word = hit[1].toLowerCase();
        const severity = word === "error" || word === "high" ? "warn" : word === "info" || word === "low" ? "info" : "warn";
        findings.push({ checkId: "humanizer_scan", severity, message: `${hit[2]}${hit[3] ? `：${hit[3].trim()}` : ""}`.slice(0, 240) });
        continue;
      }
      if (/^\d+ files,/.test(line.trim())) continue;
      findings.push({ checkId: "humanizer_scan", severity: "info", message: line.trim().slice(0, 200) });
    }
    const code = Number(exitCode) || 0;
    if (code !== 0 && !findings.length) {
      findings.push({ checkId: "humanizer_scan", severity: "warn", message: `humanizer_scan 以退出码 ${code} 结束，没有可解析的输出。`, ...(filename ? { excerpt: filename } : {}) });
    }
    return findings;
  }

  function parseScriptOutput(parserId, output = {}) {
    const id = String(parserId || "");
    if (!PARSER_ID_SET.has(id)) throw new TypeError(`未知的规则解析器：${id}`);
    if (id === "check_provenance") return parseProvenanceOutput(output);
    if (id === "check_v3" || id === "check_notes") return parsePerFileReport(id, output);
    if (id === "check_2020_2024") return parseMonthlyReport(output);
    if (id === "humanizer_scan") return parseHumanizerScan(output);
    throw new TypeError(`解析器 ${id} 未实现。`);
  }

  return Object.freeze({
    SEVERITIES,
    PARSER_IDS,
    validatePackage,
    validateCheck,
    runPackage,
    parseScriptOutput,
    builtinGeneric: BUILTIN_GENERIC,
  });
});
