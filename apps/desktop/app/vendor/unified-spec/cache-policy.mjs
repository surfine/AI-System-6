// Unified spec (2026-10-10) C06: cache policy per provider adapter.
// Pure policy — no network, no storage, no DOM. The adapter (C05's send
// orchestration) calls these before dispatch and after the response, and the
// run record consumes the hit/miss accounting. Unknown providers get a
// closed-off profile: no directives, no fork, "unknown" accounting.
const ADAPTERS = {
  deepseek: {
    // Automatic context caching: no directives on the wire, no TTL fields.
    // Hit/miss is read from the usage (prompt_cache_hit_tokens).
    wireDirectives: () => ({}),
    allowFork: true,
    accounting: 'hit-miss',
  },
  openai: {
    // Per model and endpoint configuration; unless a model-specific adapter
    // is wired, no unknown fields are sent. Cached tokens are read-only.
    wireDirectives: () => ({}),
    allowFork: true,
    accounting: 'cached-read-only',
  },
  anthropic: {
    // Explicit breakpoints with TTL. Existing valid breakpoints are preserved;
    // short-lived suffixes may use 5m. The long-lived prefix is never globally
    // rewritten. Directives are computed from the message count: one
    // breakpoint at the last history message (5m) plus an optional
    // long-lived marker the caller may pin.
    wireDirectives: ({ historyMessageCount = 0, longLivedPrefix = false } = {}) => ({
      cache_control: [
        ...Array.from({ length: Math.min(historyMessageCount, 4) }, (_, i) => ({
          index: 'history', position: i, ttl: '5m',
        })),
        ...(longLivedPrefix ? [{ index: 'system', ttl: '1h' }] : []),
      ],
    }),
    allowFork: false,
    accounting: 'breakpoint-ttl',
  },
  'lm-studio': {
    // Local: the loaded window is what it is — no cloud TTL or billing claims.
    wireDirectives: () => ({}),
    allowFork: false,
    accounting: 'none',
  },
  'subscription-cli': {
    // The CLI's internal upstream body is not visible to the frontend; the
    // first version does not claim compact parity.
    wireDirectives: () => ({}),
    allowFork: false,
    accounting: 'none',
  },
};

export function cacheAdapterFor(provider) {
  const key = String(provider || '').toLowerCase();
  if (ADAPTERS[key]) return { provider: key, ...ADAPTERS[key], known: true };
  return { provider: null, wireDirectives: () => ({}), allowFork: false, accounting: 'none', known: false };
}

/** The directives a provider's request may carry. Each adapter returns only
 * what its provider documents: DeepSeek and OpenAI send nothing (automatic /
 * unconfigured), Anthropic carries its breakpoints, unknown providers invent
 * nothing. The allowFork flag (C04) is a separate decision — directives on a
 * normal request do not imply a compaction fork. */
export function summaryRequestDirectives(provider, options = {}) {
  const adapter = cacheAdapterFor(provider);
  if (!adapter.known) return {};
  return adapter.wireDirectives(options);
}

/** Hit/miss accounting from the vendored normalizeUsage output. Returns
 * 'hit' when cached reads served part of the prompt, 'miss' when a write
 * happened without reads, 'none' when the provider reports no cache data. */
export function cacheOutcome(normalizedUsage) {
  const usage = normalizedUsage || {};
  if (typeof usage.cacheRead === 'number' && usage.cacheRead > 0) return 'hit';
  if (typeof usage.cacheWrite === 'number' && usage.cacheWrite > 0) return 'write';
  if (usage.reported) return 'none';
  return 'unknown';
}
