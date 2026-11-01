// ClioWorks unified spec (C08): the run-details surfaces — usage accounting,
// receipt shaping, and the context panel's folded run details. Lazy: the eager
// bundle keeps only thin delegates, so the boot budget pays nothing for this
// until a run actually reports usage or a compaction boundary exists.
// Pure policy over the vendored contracts/cache-policy modules; nothing here
// is sent to any model.
(function (root) {
  'use strict';
  if (root.AISystem6ChatRunDetails) return;

  /** What the provider accounted for this response, in the vendored normal
   * form, plus the cache verdict from the vendored policy. When the transport
   * brought no native usage the numbers are the desk's own estimate and say
   * so; an unverified cache stays "unknown" rather than being guessed. */
  function usageSummary(rawUsage, fallbackTokens) {
    const usage = rawUsage && typeof rawUsage === "object" ? rawUsage : {};
    const cloudActive = typeof root.cloudConfig !== "undefined" && root.cloudConfig && root.cloudConfig.active;
    const providerKey = cloudActive ? String(root.cloudConfig.provider || "deepseek") : "openai";
    const contracts = root.ClioWorksUnifiedContracts;
    const policy = root.AISystem6ChatCachePolicy;
    const normalized = contracts?.normalizeUsage ? contracts.normalizeUsage(providerKey, usage) : null;
    const cacheOutcome = normalized && policy?.cacheOutcome ? policy.cacheOutcome(normalized) : "unknown";
    const nativeTokens = Number(usage.completion_tokens || usage.total_tokens || 0);
    const inputTokens = Number(normalized?.input ?? usage.prompt_tokens ?? 0);
    return {
      provider: providerKey,
      inputTokens: Number.isFinite(inputTokens) ? inputTokens : 0,
      outputTokens: Number(normalized?.output ?? nativeTokens) || 0,
      cachedTokens: Number(normalized?.cacheRead ?? usage.cached_tokens ?? 0) || 0,
      cacheOutcome,
      costCny: Number(usage.cost_cny ?? usage.cost ?? 0) || 0,
      requests: 1,
      // No native token accounting means the count is the desk's own estimate.
      estimated: !nativeTokens,
      tokens: nativeTokens || Number(fallbackTokens) || 0,
    };
  }

  /** Keep only the receipt's own usage fields; anything else the caller
   * attached (transport internals, provider payloads) does not become
   * evidence. */
  function usageFromInput(input) {
    if (!input || typeof input !== "object") return null;
    return {
      provider: String(input.provider || ""),
      inputTokens: Number(input.inputTokens) || 0,
      outputTokens: Number(input.outputTokens) || 0,
      cachedTokens: Number(input.cachedTokens) || 0,
      cacheOutcome: String(input.cacheOutcome || "unknown"),
      costCny: Number(input.costCny) || 0,
      requests: Number(input.requests) || 1,
      estimated: input.estimated === true,
      tokens: Number(input.tokens) || 0,
    };
  }

  /** The receipt's one-line usage verdict — an estimate is named as one, an
   * unverified cache says so, and cost appears only when the provider
   * actually reported it. */
  function usageLine(usage) {
    if (!usage) return "—";
    const parts = [
      `${Number(usage.outputTokens || 0)} tok out`,
      `${Number(usage.inputTokens || 0)} tok in`,
    ];
    if (Number(usage.cachedTokens || 0) > 0) parts.push(`${Number(usage.cachedTokens)} tok cached`);
    parts.push(`cache ${usage.cacheOutcome || "unknown"}`);
    if (Number(usage.costCny || 0) > 0) parts.push(`¥${Number(usage.costCny).toFixed(4)}`);
    parts.push(usage.estimated === true ? "estimated" : "provider-reported");
    return parts.join(" · ");
  }

  /** The run-details block the context panel folds by default — how far the
   * compaction reaches, what stayed verbatim, and whether the cache verdict
   * comes from the provider or is simply unverified. Pure data; the caller
   * draws it. */
  function contextRunDetails(compaction, usage, language) {
    const zh = language === "zh";
    const rows = [];
    if (compaction) {
      rows.push({
        label: zh ? "整理进度" : "Compacted",
        value: compaction.sourceMessages > 0
          ? (zh ? `较早对话已整理：前 ${compaction.sourceMessages} 条（至 ${compaction.through || "?"}）`
                : `Earlier turns compacted: first ${compaction.sourceMessages} (through ${compaction.through || "?"})`)
          : (zh ? "已存在整理记录" : "A compaction record exists"),
      });
      if (compaction.keptFrom) {
        rows.push({
          label: zh ? "原文保留" : "Verbatim",
          value: zh ? `自 ${compaction.keptFrom} 起逐字保留` : `kept verbatim from ${compaction.keptFrom}`,
        });
      }
    } else {
      rows.push({
        label: zh ? "整理进度" : "Compacted",
        value: zh ? "原始对话完整保留，未替换" : "full original history — nothing replaced",
      });
    }
    if (usage) {
      const cache = String(usage.cacheOutcome || "unknown");
      rows.push({
        label: zh ? "缓存" : "Cache",
        value: cache === "unknown"
          ? (zh ? "未验证（供应商未报告）" : "unverified (provider silent)")
          : (zh ? `供应商报告：${cache}` : `provider-reported: ${cache}`),
      });
      rows.push({
        label: zh ? "token 计数" : "Token count",
        value: usage.estimated === true
          ? (zh ? "估算（无原生计数）" : "estimated (no native accounting)")
          : (zh ? "供应商报告" : "provider-reported"),
      });
      if (Number(usage.costCny || 0) > 0) {
        rows.push({ label: zh ? "费用" : "Cost", value: `¥${Number(usage.costCny).toFixed(4)}` });
      }
    }
    return { title: zh ? "本次运行" : "This run", rows };
  }

  root.AISystem6ChatRunDetails = Object.freeze({
    usageSummary,
    usageFromInput,
    usageLine,
    contextRunDetails,
    /** Draw the folded run details into the context panel's list. Only called
     * when a compaction boundary or accounted usage exists — the spec's
     * 只有需要时. Closed by default. */
    renderInto(listEl, compaction, usage, language) {
      if (!listEl || typeof document === "undefined") return;
      const details = contextRunDetails(compaction, usage, language);
      if (!details.rows.length) return;
      const fold = document.createElement("details");
      fold.className = "context-run-details";
      fold.style.cssText = "margin:8px 0 0;border-bottom:var(--context-section-title-border-bottom);font:11px var(--text-font)";
      const foldTitle = document.createElement("summary");
      foldTitle.textContent = details.title;
      foldTitle.style.cssText = "padding-bottom:3px;font-family:var(--title-font);font-weight:bold;cursor:pointer";
      fold.append(foldTitle);
      details.rows.forEach((row) => {
        const line = document.createElement("div");
        line.className = "context-run-detail-row";
        line.style.cssText = "padding:2px 0;overflow-wrap:anywhere";
        const rowLabel = document.createElement("strong");
        rowLabel.style.cssText = "margin-right:4px";
        rowLabel.textContent = row.label;
        line.append(rowLabel, document.createTextNode(` ${row.value}`));
        fold.append(line);
      });
      listEl.append(fold);
    },
  });
})(typeof window !== "undefined" ? window : globalThis);
