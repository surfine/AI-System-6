/* ClioWrite × ClioTalk 署名修订（work order B2，所有者裁决 D1/D2）。
 *
 * ClioTalk 引擎在借出的 Office 投影上改完之后，桌面 diff 投影前后得到候选
 * （agent-projection.js 的 diff）。本模块是 ClioWrite 收件的一半：
 *
 *   classify(candidate, sources) → 'errand' | 'voice' | 'others-words'
 *     确定性规则，无模型调用。跑腿件（errand）：数字、日期、人名、引用格式、
 *     单字元拼写/标点修正，而且新值能在借出的卷宗里逐字找到出处；别人的话
 *     （others-words）：改动落在文稿标注为他人所说的话里面；其余都是动字件
 *     （voice）。分类是页面自己的纪律（裁定 D2），不由模型自己说。
 *
 *   deliver(adapter, candidates, { author, label, sources, round })
 *     每条候选先 AISystem6AgentProjection.relocate 对位；exact 的按
 *     clio-write-compare.js 的 applyCandidates 写成跟踪插入/删除（w:ins/w:del，
 *     署名 ClioTalk），整批 ONE 个命名撤销步「ClioTalk：第 N 轮的 M 条修订」。
 *     绝不用 setRunText，也不走查找替换。lost/ambiguous 的不写，作为
 *     「原文已经改过，这条没挂上」回到旁注栏；others-words 拒收并说明。
 *     每条送达的修订带着 { class, reason, basis }，旁注栏照此画标签与依据。
 *
 *   queueForDocument(docId, candidates[, options]) + onDocumentMounted
 *     候选按文件持有，写作者打开这份文件（ClioWrite 挂载）才送达；从不
 *     在后台写项目硬盘，也不碰保存。
 *
 *   AI 字（裁定 D2）：动字件被收下时，把它的范围记进这份文件的 AI 字台账
 *     （桌面侧，不写进 .docx）；文稿里画点虚线和小「AI 字」标，直到写作者
 *     自己改写那几个字。台账活在 ClioWrite 的会话状态里（本模块按 docId
 *     记住），不需要新的 IndexedDB store。aiTextRanges(docId) 给审校台读。
 *     随文件存（所有者裁决 U3）：ClioWrite 存档时 storedLedger(docId) 写到
 *     record.aiText，项目文件条目（chatFiles 的 office 项）和软盘记录各带一份；
 *     下次打开时 onDocumentMounted 按字把范围重新挂回段落（段落 id 每次开档
 *     都会变）。每个范围另存前后各几个字，和所在段落在「同文段落」里的序号：
 *     短语重复时先认上下文，再认序号，再认离原位最近的；仍分不出就丢掉，
 *     宁可少标，不标错。复原（revert）把存下的台账重读一遍；另存为的副本带着
 *     同一份（字还是那些 AI 字）；ClioTalk 云端写入换掉了字节，对不上的范围
 *     下次打开就丢。旧文件没有这个字段，就是空台账。
 *
 * 视觉（点虚线）用 CSS Custom Highlight API 画：只圈已有的文字节点，不改
 * 段落 DOM——上游编辑器按 data-o/data-n 把 DOM 位置映回模型，改 DOM 会弄坏
 * 它。API 不在场（旧 WebView、Node 合同）就不画，台账照记。
 *
 * 本文件不做模型工作：写修订走 ClioWorksQuireReview/compare 已有的引擎，
 * 对位走 AISystem6AgentProjection。无 DOM 依赖的另一半（分类、送达、台账）
 * 在合同的 vm 里裸跑（tests/features/clio-write-agent-delivery.test.mjs）。
 */
(function (root) {
  'use strict';
  if (root.AISystem6ClioWriteAgentDelivery) return;

  const tr = (key, ...args) => (typeof root.t === 'function' ? root.t(key, ...args) : key);

  const AUTHOR = 'ClioTalk';
  const CLASSES = new Set(['errand', 'voice', 'others-words']);

  /* --------------------------------------------------- 分类：确定性的形状规则 */

  // 别人的话：引号包住、旁边跟着言语动词（谁对谁说的原话，逐字引用的那句）。
  const QUOTE_PAIRS = [['「', '」'], ['『', '』'], ['“', '”']];
  const SPEECH_VERB = /(?:说|说道|问道|问|答道|答|写道|写着|表示|提到|喊道|笑道|嘀咕|追问|补充|回应|开口)/;

  function quotedSpans(text) {
    const spans = [];
    for (const [open, close] of QUOTE_PAIRS) {
      let from = text.indexOf(open);
      while (from >= 0) {
        const to = text.indexOf(close, from + 1);
        if (to < 0) break;
        spans.push([from, to + 1]);
        from = text.indexOf(open, to + 1);
      }
    }
    return spans;
  }

  /** The quote is the document's attribution of someone else's words when a
   * speech verb sits within 12 characters on either side of it (「……」林姐说). */
  function attributedQuote(text, span) {
    const head = text.slice(Math.max(0, span[0] - 12), span[0]);
    const tail = text.slice(span[1], span[1] + 12);
    return SPEECH_VERB.test(tail) || SPEECH_VERB.test(head);
  }

  /** The changed spans of one candidate in BEFORE coordinates, word-level where
   * the shared diff core is loaded, the whole paragraph where it is not. */
  function changedSpans(before, after) {
    const api = root.AISystem6WordDiff;
    const hunks = api && typeof api.wordDiff === 'function' ? (api.wordDiff(before, after).hunks || []) : [];
    if (!hunks.length) return [{ before: { start: 0, end: before.length }, after: { start: 0, end: after.length } }];
    return hunks;
  }

  function othersWords(before, after) {
    const spans = quotedSpans(before).filter((span) => attributedQuote(before, span));
    if (!spans.length) return false;
    for (const hunk of changedSpans(before, after)) {
      const [s, e] = [hunk.before.start, hunk.before.end];
      for (const [q0, q1] of spans) {
        if (s === e ? (s > q0 && s < q1) : (s < q1 && e > q0)) return true;
      }
    }
    return false;
  }

  /** 拼写修正的形状：整段恰好差一个字符（换、添、删一处）。 */
  function singleCharDelta(before, after) {
    if (before === after) return false;
    const n = before.length;
    const m = after.length;
    if (n === m) {
      let diff = 0;
      for (let i = 0; i < n; i += 1) {
        if (before[i] !== after[i]) { diff += 1; if (diff > 1) return false; }
      }
      return diff === 1;
    }
    if (Math.abs(n - m) === 1) {
      const [short, long] = n < m ? [before, after] : [after, before];
      let i = 0;
      while (i < short.length && short[i] === long[i]) i += 1;
      return short.slice(i) === long.slice(i + 1);
    }
    return false;
  }

  // 数字与日期：数位加年份/量词的少数搭配；"8 人"、"1,240"、"2025 年" 都是。
  const NUMBER_DATE = /^[\s\d０-９.,，、．%‰:：\-–—年月日时分秒人世纪亿万千佰]*[\d０-９][\s\d０-９.,，、．%‰:：\-–—年月日时分秒人世纪亿万千佰]*$/;
  // 引用/格式：只动了成对括号、引号、点划一类的排版符号。
  const PUNCT_ONLY = /^[\s.,，、．;；:：!！?？()（）[\]【】《》〈〉“”‘’「」『』·\-–—…/]+$/;
  const SENTENCE_PUNCT = /[。！？；：，、""''「」『』()（）[\]{}]/;

  /** 新值在某份卷宗里逐字出现：先原样找，再做空格归一后的查找（"8 人" 对 "8人"）。 */
  function findBasis(value, sources) {
    const text = String(value == null ? '' : value);
    if (!text) return null;
    for (let i = 0; i < sources.length; i += 1) {
      const source = String(sources[i] == null ? '' : sources[i]);
      const at = source.indexOf(text);
      if (at >= 0) return { source: i + 1, at, quote: text };
    }
    const packed = text.replace(/\s+/g, '');
    if (packed && packed !== text) {
      for (let i = 0; i < sources.length; i += 1) {
        const source = String(sources[i] == null ? '' : sources[i]);
        const at = source.indexOf(packed);
        if (at >= 0) return { source: i + 1, at, quote: text };
      }
    }
    return null;
  }

  /** One changed span's errand shape, or null when the span is the writer's own
   * wording. The new value must come verbatim out of the lent sources (the
   * ruling's own conjunction); a one-character deletion has no new value, so it
   * counts only when the character that went was punctuation. */
  function errandShape(before, after, span, sources) {
    const del = before.slice(span.before.start, span.before.end);
    const ins = after.slice(span.after.start, span.after.end);
    if (NUMBER_DATE.test(ins)) return { key: 'clio_write_agent_reason_number', basis: findBasis(ins, sources) };
    if (singleCharDelta(before, after)) {
      const newValue = ins || '';
      if (newValue) return { key: 'clio_write_agent_reason_single_char', basis: findBasis(newValue, sources) };
      if (PUNCT_ONLY.test(del)) return { key: 'clio_write_agent_reason_punct', basis: null };
      return null;
    }
    if (PUNCT_ONLY.test(ins) && (del === '' || PUNCT_ONLY.test(del))) {
      return { key: 'clio_write_agent_reason_punct', basis: findBasis(ins.replace(/\s+/g, ''), sources) };
    }
    if (ins && ins.length <= 8 && !/\s/.test(ins) && !SENTENCE_PUNCT.test(ins) && del.length <= 8) {
      return { key: 'clio_write_agent_reason_name', basis: findBasis(ins, sources) };
    }
    return null;
  }

  /**
   * The candidate's class, reason and basis by deterministic rules. No model
   * calls; the sources are the texts the task lent in (the ruling's 「新值能在
   * 卷宗裡逐字找到出處」). Every changed span must be an errand shape with a
   * source for its new value, or the whole candidate is the writer's voice.
   */
  function describe(candidate, sources) {
    const voice = { class: 'voice', reason: { key: 'clio_write_agent_reason_voice', args: [] }, basis: null };
    if (!candidate || typeof candidate !== 'object') return voice;
    const before = String(candidate.before == null ? '' : candidate.before);
    const after = String(candidate.after == null ? '' : candidate.after);
    if (before === after) return voice;
    const list = Array.isArray(sources) ? sources : [];
    if (othersWords(before, after)) return { class: 'others-words', reason: { key: 'clio_write_agent_reason_others_words', args: [] }, basis: null };
    let shape = null;
    for (const span of changedSpans(before, after)) {
      const one = errandShape(before, after, span, list);
      if (!one || (one.basis === null && one.key !== 'clio_write_agent_reason_punct')) return voice;
      if (!shape) shape = one;
    }
    return shape ? { class: 'errand', reason: { key: shape.key, args: [] }, basis: shape.basis } : voice;
  }

  /**
   * The candidate's class by the same deterministic rules.
   * @returns {'errand'|'voice'|'others-words'}
   */
  function classify(candidate, sources) {
    return describe(candidate, sources).class;
  }

  const DEFAULT_REASON = Object.freeze({
    errand: 'clio_write_agent_reason_errand',
    voice: 'clio_write_agent_reason_voice',
    'others-words': 'clio_write_agent_reason_others_words',
  });

  /** The delivery decision for one candidate: a class the caller already
   * chose stands (with the reason the queue attached); an unclassified one is
   * described here against the sources the delivery was given. */
  function decide(candidate, sources) {
    if (candidate && CLASSES.has(candidate.class)) {
      const reason = candidate.agentReason && candidate.agentReason.key ? candidate.agentReason : { key: DEFAULT_REASON[candidate.class], args: [] };
      return { class: candidate.class, reason, basis: candidate.agentBasis || null };
    }
    return describe(candidate, sources);
  }

  /* ------------------------------------------------------------- 送达与登记 */

  // bindings: docId → { adapter, root, scroller, fileName, refresh, tagEls }
  const bindings = new Map();
  // queue: docId → { candidates, options }
  const queue = new Map();
  // deliveries: docId → { author, items: [{ class, reason, basis, before, after, paragraphId, round }] }
  const deliveries = new Map();
  // unattached: docId → [ { status, class, reason, before, after } ]
  const unattached = new Map();
  // aiText: docId → [ { paragraphId, from, to, text } ]
  const aiText = new Map();
  // restored: docIds whose stored ledger was read this session; after that the
  // live ledger (pruned or not) is the truth until the next save writes it.
  const restored = new Set();
  let tellHandler = null;

  const review = () => {
    const api = root.AISystem6ClioWriteReview;
    return api && typeof api.refresh === 'function' ? api : null;
  };
  const afterAgentChange = () => {
    const api = review();
    if (api) { try { api.refresh(); } catch (error) { /* the panel repaints on its next draw */ } }
  };

  // The undo step's canonical name (the model stores it as-is, the way the
  // compare adoption does); clio-write.js's stepKey names it for the Edit menu.
  const labelFor = (options, count) => options.label || (options.round ? `ClioTalk：第 ${options.round} 轮的 ${count} 条修订` : `ClioTalk：${count} 条修订`);

  /** The paragraph one exact relocation landed in: the offsets the locate
   * answered are on the paragraphs-joined projection text, the same walk the
   * projection made. The paragraph is kept only when its words still are the
   * quote's — a moved-on paragraph is never written on a guess. */
  function candidateForDocx(candidate, located, adapter) {
    if (typeof adapter.paragraphs !== 'function' || !Number.isFinite(located.start) || !Number.isFinite(located.end)) return null;
    const paragraphs = adapter.paragraphs();
    let at = 0;
    for (const p of paragraphs) {
      const len = String(p.text || '').length;
      if (located.start >= at && located.end <= at + len) return p.text === candidate.before ? p : null;
      at += len + 1;
    }
    return null;
  }

  /**
   * Relocate every candidate, then apply the exact docx ones as tracked
   * ins/del in ONE named undo step. Nothing here writes a file, and nothing
   * guesses: a paragraph whose words moved on is reported, not written.
   * @returns {{ applied: object[], unapplied: object[] }}
   */
  function deliver(adapter, candidates, options = {}) {
    const projection = root.AISystem6AgentProjection;
    if (!projection || typeof projection.relocate !== 'function') throw new Error('clio-write-agent-delivery: app/features/agent-projection.js is required');
    const compare = root.AISystem6ClioWriteCompare;
    if (!compare || typeof compare.apply !== 'function') throw new Error('clio-write-agent-delivery: app/features/clio-write-compare.js is required');
    const author = String(options.author || AUTHOR);
    const sources = Array.isArray(options.sources) ? options.sources : [];
    const applied = [];
    const unapplied = [];
    const built = [];
    const rows = Array.isArray(candidates) ? candidates : [];
    for (const candidate of rows) {
      const details = decide(candidate, sources);
      const cls = details.class;
      if (cls === 'others-words') { unapplied.push({ candidate, status: 'refused', class: cls, reason: details.reason, basis: details.basis }); continue; }
      let located = null;
      try { located = projection.relocate(candidate, adapter); } catch (error) { located = { resolution: 'lost', reason: 'relocate-failed', detail: String((error && error.message) || error) }; }
      if (!located || located.resolution !== 'exact') {
        unapplied.push({ candidate, status: located && located.resolution === 'ambiguous' ? 'ambiguous' : 'lost', class: cls, reason: { key: located && located.resolution === 'ambiguous' ? 'clio_write_agent_reason_ambiguous' : 'clio_write_agent_reason_lost', args: [] }, basis: details.basis });
        continue;
      }
      if (!candidate.location || candidate.location.kind !== 'text') {
        // ClioWrite receives the word processor's candidates; a workbook or
        // deck row is reported, never forced into a .docx.
        unapplied.push({ candidate, status: 'unsupported', class: cls, reason: { key: 'clio_write_agent_reason_unsupported', args: [] }, basis: details.basis });
        continue;
      }
      const paragraph = candidateForDocx(candidate, located, adapter);
      if (!paragraph) { unapplied.push({ candidate, status: 'lost', class: cls, reason: { key: 'clio_write_agent_reason_lost', args: [] }, basis: details.basis }); continue; }
      const api = root.AISystem6WordDiff;
      const diff = api && typeof api.wordDiff === 'function' ? api.wordDiff(String(candidate.before), String(candidate.after)) : null;
      const hunks = diff && diff.hunks && diff.hunks.length ? diff.hunks : [{ kind: 'replace', before: { start: 0, end: String(candidate.before).length }, after: { start: 0, end: String(candidate.after).length } }];
      built.push({ kind: 'changed', adoptable: true, paragraphId: String(paragraph.id), before: candidate.before, after: candidate.after, hunks });
      applied.push({ candidate, status: 'applied', class: cls, reason: details.reason, basis: details.basis, paragraphId: String(paragraph.id) });
    }
    if (built.length) {
      const count = built.length;
      compare.apply(adapter, built, author, labelFor(options, count));
      const docId = docIdOfAdapter(adapter);
      if (docId) {
        const record = deliveries.get(docId) || { author, items: [] };
        for (const row of applied) {
          record.items.push({ class: row.class, reason: row.reason, basis: row.basis, before: row.candidate.before, after: row.candidate.after, paragraphId: row.paragraphId, round: options.round || 0 });
        }
        deliveries.set(docId, record);
      }
    }
    return { applied, unapplied };
  }

  /* ------------------------------------------------------- 按文件排队与送达 */

  function docIdOfAdapter(adapter) {
    for (const [docId, binding] of bindings) if (binding.adapter === adapter) return docId;
    return null;
  }

  /** Hold the candidates for one document; delivered when the writer opens it.
   * Options may carry { sources, author, label, round }. Unclassified
   * candidates are classified here, once, so the delivery shows the same
   * reason and basis the queue decided on. A document that is open right now
   * takes its delivery at once — that is the writer having opened it. */
  function queueForDocument(docId, candidates, options = {}) {
    const key = String(docId || '');
    if (!key || !Array.isArray(candidates)) return;
    const sources = Array.isArray(options.sources) ? options.sources : [];
    const rows = candidates.slice();
    for (const candidate of rows) {
      if (candidate && !CLASSES.has(candidate.class)) {
        const details = describe(candidate, sources);
        candidate.class = details.class;
        candidate.agentReason = details.reason;
        candidate.agentBasis = details.basis;
      }
    }
    const binding = bindings.get(key);
    if (binding) {
      const outcome = deliver(binding.adapter, rows, options);
      report(key, outcome);
    } else {
      queue.set(key, { candidates: rows, options });
    }
  }

  function report(docId, outcome) {
    if (!outcome) return;
    const rows = (outcome.unapplied || []).map((row) => ({ status: row.status, class: row.class, reason: row.reason, basis: row.basis, before: row.candidate.before, after: row.candidate.after }));
    if (rows.length) unattached.set(docId, (unattached.get(docId) || []).concat(rows));   // 每一轮没挂上的都留着看
    afterAgentChange();
    const binding = bindings.get(docId);
    if (binding && typeof binding.refresh === 'function') { try { binding.refresh(); } catch (error) { /* the rail updates on its next draw */ } }
  }

  /* ------------------------------------------- 挂载钩子（写作者打开才送达） */

  /** ClioWrite calls this when one document finishes mounting (and again when
   * the lazy delivery module arrives beside it). Holds the binding the rail
   * and the ledger read, and delivers whatever this document has queued. A
   * delivery that cannot run yet (its projection module not loaded — the
   * ClioTalk side loads it when it queues) keeps the queue and says so; the
   * document opens either way. */
  function onDocumentMounted(info) {
    const docId = String(info && info.docId || '');
    if (!docId || !info.adapter) return;
    bindings.set(docId, { adapter: info.adapter, root: info.root || null, scroller: info.scroller || null, fileName: info.fileName || '', refresh: typeof info.refresh === 'function' ? info.refresh : null, tagEls: [] });
    if (info.reread) forgetLedger(docId);   // a revert: the document is the stored bytes again
    restoreLedger(docId, info.adapter, info.aiText);
    const queued = queue.get(docId);
    if (queued) {
      try {
        const outcome = deliver(info.adapter, queued.candidates, queued.options || {});
        queue.delete(docId);
        report(docId, outcome);
      } catch (error) {
        console.warn('ClioWrite agent delivery:', error);   // the queue stays for the next open
      }
    }
    paint(docId);
  }

  function onDocumentUnmounted(docId) {
    const key = String(docId || '');
    const binding = bindings.get(key);
    if (binding && binding.tagEls) for (const el of binding.tagEls) { try { el.remove(); } catch (error) { /* already gone */ } }
    bindings.delete(key);
  }

  /* -------------------------------------------------------- AI 字（裁定 D2） */

  /** The review windoid calls this when the writer ACCEPTS one of ClioTalk's
   * voice revisions: the words are theirs to keep now, and the desk marks them
   * as AI 字 until the writer rewrites them. Errand rows never record, and
   * only an insertion is AI 字: the words a voice revision struck out are
   * gone from the document once it is taken, so a deletion records nothing.
   * The insertion's offsets were read before the take removed the struck
   * words ahead of it, so the range is found again in its paragraph as it
   * reads now (the nearest occurrence of its words). */
  function noteVoiceAccepted(docId, record) {
    const key = String(docId || '');
    if (!key || !record || !record.paragraphId) return;
    if (record.type && record.type !== 'ins' && record.type !== 'mins') return;
    const text = String(record.text || '');
    let from = Number(record.from) || 0;
    const binding = bindings.get(key);
    if (text && binding && typeof binding.adapter.paragraphs === 'function') {
      let paragraphs = [];
      try { paragraphs = binding.adapter.paragraphs(); } catch (error) { paragraphs = []; }
      const p = paragraphs.find((para) => String(para.id) === String(record.paragraphId));
      const at = p ? nearest(occurrencesOf(String(p.text || ''), text), (place) => Math.abs(place - from)) : -1;
      if (at >= 0) from = at;
    }
    const list = aiText.get(key) || [];
    list.push({ paragraphId: String(record.paragraphId), from, to: text ? from + text.length : Number(record.to) || 0, text });
    aiText.set(key, list);
    paint(key);
  }

  /** Any writer edit prunes the ledger: a range whose words are no longer in
   * its paragraph (at all, or because the writer reworded part of them) is
   * done being AI 字. A range that only moved keeps its place. */
  function noteWriterEdit(doc) {
    if (!doc) return;
    for (const [docId, binding] of bindings) {
      let model = null;
      try { model = typeof binding.adapter.document === 'function' ? binding.adapter.document() : null; } catch (error) { model = null; }
      if (model !== doc) continue;
      const list = aiText.get(docId) || [];
      const kept = [];
      if (typeof binding.adapter.paragraphs === 'function') {
        const paragraphs = binding.adapter.paragraphs();
        for (const range of list) {
          const p = paragraphs.find((para) => String(para.id) === range.paragraphId);
          const text = p ? String(p.text || '') : '';
          const at = p && range.text ? nearest(occurrencesOf(text, range.text), (place) => Math.abs(place - range.from)) : -1;
          if (at >= 0) kept.push({ ...range, from: at, to: at + range.text.length });
        }
      }
      if (kept.length) aiText.set(docId, kept);
      else aiText.delete(docId);
      paint(docId);
    }
  }

  /** The Review Desk reads these later: the ranges this document still marks. */
  function aiTextRanges(docId) {
    return (aiText.get(String(docId || '')) || []).map((range) => ({ ...range }));
  }

  /** Every offset at which `words` sits in `text`. */
  function occurrencesOf(text, words) {
    const found = [];
    for (let at = text.indexOf(words); at >= 0; at = text.indexOf(words, at + 1)) found.push(at);
    return found;
  }

  /** The offset with the smallest distance, -1 for none. */
  function nearest(candidates, distance) {
    let best = -1;
    let bestAt = Infinity;
    for (const candidate of candidates) {
      const d = distance(candidate);
      if (d < bestAt) { best = candidate; bestAt = d; }
    }
    return best;
  }

  // How many characters either side of a range the ledger keeps to find it again.
  const LEDGER_CONTEXT = 8;

  /** Where one stored range sits in the paragraphs now: its words with the same
   * context around them, else the same words nearest the stored place, and
   * nothing when two places are equally good — a wrong mark is worse than none.
   * Paragraphs that read the same are told apart by their ordinal (nth). */
  function placeRange(range, paragraphs) {
    const words = String(range && range.text || '');
    if (!words) return null;
    const prefix = String(range.prefix || '');
    const suffix = String(range.suffix || '');
    const all = [];
    for (const p of paragraphs) {
      for (const at of occurrencesOf(p.text, words)) {
        const framed = p.text.slice(Math.max(0, at - prefix.length), at) === prefix && p.text.slice(at + words.length, at + words.length + suffix.length) === suffix;
        all.push({ p, at, framed });
      }
    }
    let pool = all.filter((one) => one.framed);
    if (!pool.length) pool = all;
    else if (Number.isInteger(range.nth) && pool.some((one) => one.p.ordinal === range.nth)) pool = pool.filter((one) => one.p.ordinal === range.nth);
    const place = Number(range.index) || 0;
    const from = Number(range.from) || 0;
    const ranked = pool
      .map((one) => ({ ...one, miss: [Math.abs(one.p.index - place), Math.abs(one.at - from)] }))
      .sort((x, y) => (x.miss[0] - y.miss[0]) || (x.miss[1] - y.miss[1]));
    if (!ranked.length) return null;
    if (ranked.length > 1 && ranked[0].miss[0] === ranked[1].miss[0] && ranked[0].miss[1] === ranked[1].miss[1]) return null;
    return { paragraphId: ranked[0].p.id, from: ranked[0].at, to: ranked[0].at + words.length, text: words };
  }

  /** U3: the ledger the document carried from its last save, hung back on the
   * paragraphs it has now. Paragraph ids are the codec's per-open ids, so a
   * range finds its place by its words and their context (placeRange). Words
   * no longer in the document are no longer AI 字. Read once per session
   * (again on a revert); a live ledger already here wins. */
  function restoreLedger(docId, adapter, stored) {
    if (restored.has(docId)) return;
    restored.add(docId);
    if (!Array.isArray(stored) || !stored.length || aiText.has(docId) || typeof adapter.paragraphs !== 'function') return;
    const seen = new Map();
    const paragraphs = adapter.paragraphs().map((p, index) => {
      const text = String(p.text || '');
      const ordinal = seen.get(text) || 0;
      seen.set(text, ordinal + 1);
      return { id: String(p.id), text, index, ordinal };
    });
    const kept = stored.map((range) => placeRange(range, paragraphs)).filter(Boolean);
    if (kept.length) aiText.set(docId, kept);
  }

  /** U3: the ledger as the document stores it — each range with its paragraph's
   * place, the words around it, and the paragraph's ordinal among paragraphs
   * that read the same — or null when this document's ledger was never read
   * this session (saving then leaves the stored one as it was). */
  function storedLedger(docId) {
    const key = String(docId || '');
    if (!restored.has(key)) return null;
    const binding = bindings.get(key);
    const paragraphs = binding && typeof binding.adapter.paragraphs === 'function' ? binding.adapter.paragraphs() : [];
    return aiTextRanges(key).map((range) => {
      const index = paragraphs.findIndex((p) => String(p.id) === range.paragraphId);
      const text = index >= 0 ? String(paragraphs[index].text || '') : '';
      return {
        ...range,
        index: Math.max(0, index),
        prefix: text.slice(Math.max(0, range.from - LEDGER_CONTEXT), range.from),
        suffix: text.slice(range.to, range.to + LEDGER_CONTEXT),
        nth: index >= 0 ? paragraphs.slice(0, index).filter((p) => String(p.text || '') === text).length : 0,
      };
    });
  }

  /** The document's live ledger is let go, so its next mount reads the stored
   * one again (a document that left this window for a copy, a revert). */
  function forgetLedger(docId) {
    const key = String(docId || '');
    restored.delete(key);
    aiText.delete(key);
  }

  /* ------------------------------------------------------------- 旁注栏的料 */

  /** What the 修订 tab needs to draw ClioTalk's rows and the unattached ones. */
  function reportFor(adapter) {
    const docId = docIdOfAdapter(adapter);
    if (!docId) return null;
    const record = deliveries.get(docId);
    const rows = unattached.get(docId) || [];
    if (!record && !rows.length) return null;
    return { docId, author: record ? record.author : AUTHOR, items: record ? record.items : [], unattached: rows };
  }

  /** Match one revision record to its delivery: the struck words read out of
   * the candidate's before, the inserted words out of its after. */
  function infoForItem(item, type, text) {
    if (type === 'del' || type === 'mdel') return typeof item.before === 'string' && item.before.includes(text);
    if (type === 'ins' || type === 'mins') return typeof item.after === 'string' && item.after.includes(text);
    return true;
  }

  function metaForRecord(adapter, record) {
    const report = reportFor(adapter);
    if (!report || record.author !== report.author) return null;
    const items = report.items.filter((item) => item.paragraphId === String(record.paragraphId) && infoForItem(item, record.type, String(record.text || '')));
    const item = items[0] || report.items.find((one) => one.paragraphId === String(record.paragraphId));
    return item ? { class: item.class, reason: item.reason, basis: item.basis, round: item.round } : null;
  }

  /** The live adapter a mounted document is bound by, or null: ClioTalk's
   * document panel reads this file's revisions through it (read only; it
   * resolves them through the review module's take, the 修订 list's road). */
  function adapterFor(docId) {
    const binding = bindings.get(String(docId || ''));
    return binding ? binding.adapter : null;
  }

  function setTellHandler(fn) { tellHandler = typeof fn === 'function' ? fn : null; }
  function hasTellHandler() { return !!tellHandler; }
  function tell(row) { if (tellHandler) { try { tellHandler(row); } catch (error) { console.warn('ClioWrite agent delivery:', error); } } }

  /* ------------------------------------------------------- 点虚线与小标签 */

  let paintRuleInjected = false;
  function ensurePaintRule() {
    if (paintRuleInjected || typeof document === 'undefined' || !document.head) return;
    const el = document.createElement('style');
    el.textContent = '::highlight(clio-write-ai-text){text-decoration:underline dotted;}';
    document.head.appendChild(el);
    paintRuleInjected = true;
  }

  /** Text-node sub-ranges of one paragraph for [from, to): the renderer maps
   * runs to spans with data-o (start) and data-n (length); we only ever read. */
  function rangeInParagraph(doc, frag, from, to) {
    if (!doc || typeof doc.createRange !== 'function') return [];
    const spans = [];
    const walk = (node, base) => {
      for (const child of node.childNodes) {
        if (child.nodeType === 3) spans.push({ node: child, start: base, end: base + child.length });
        else if (child.dataset && child.dataset.o != null && child.dataset.n != null) walk(child, Number(child.dataset.o));
      }
    };
    const body = frag.querySelector('.pc') || frag;
    walk(body, Number(frag.dataset.from) || 0);
    const ranges = [];
    for (const span of spans) {
      const s = Math.max(span.start, from);
      const e = Math.min(span.end, to);
      if (e <= s) continue;
      try {
        const range = doc.createRange();
        range.setStart(span.node, s - span.start);
        range.setEnd(span.node, e - span.start);
        ranges.push(range);
      } catch (error) { /* linkedom's stub range: nothing to paint here */ }
    }
    return ranges;
  }

  /** Dotted underline over the ledger's live ranges, plus a small 「AI 字」
   * tag beside the first one. Both need the Custom Highlight API; without it
   * nothing draws and nothing breaks. */
  function paint(docId) {
    const binding = bindings.get(String(docId || ''));
    if (!binding || !binding.root || typeof binding.root.querySelectorAll !== 'function') return;
    const HighlightCtor = root.Highlight;
    const highlights = root.CSS && root.CSS.highlights;
    if (binding.tagEls) for (const el of binding.tagEls) { try { el.remove(); } catch (error) { /* already gone */ } }
    binding.tagEls = [];
    if (typeof HighlightCtor !== 'function' || !highlights) return;
    highlights.delete('clio-write-ai-text');
    const ranges = [];
    const doc = typeof document !== 'undefined' ? document : null;
    for (const range of aiText.get(String(docId)) || []) {
      const frag = [...binding.root.querySelectorAll('.p[data-pid]')].find((el) => String(el.dataset.pid) === range.paragraphId);
      if (frag) ranges.push(...rangeInParagraph(doc, frag, range.from, range.to));
    }
    if (!ranges.length) return;
    ensurePaintRule();
    try { highlights.set('clio-write-ai-text', new HighlightCtor(...ranges)); } catch (error) { return; }
    // The small tag needs layout; skip it where rects say nothing (tests, no layout).
    const first = ranges[0];
    let rect = null;
    try { rect = first.getClientRects()[0] || null; } catch (error) { rect = null; }
    const host = binding.scroller;
    if (rect && host && typeof host.getBoundingClientRect === 'function' && typeof document !== 'undefined') {
      const box = host.getBoundingClientRect();
      if (rect.top || rect.left) {
        const tag = document.createElement('span');
        tag.className = 'cw-ai-text-tag';
        tag.textContent = tr('clio_write_agent_ai_tag');
        // The stylesheet owns the layout (84-clio-write.css); paint only feeds the coordinates.
        tag.style.setProperty('--cw-ai-tag-top', `${Math.max(0, rect.top - box.top - 14)}px`);
        tag.style.setProperty('--cw-ai-tag-left', `${Math.max(0, rect.left - box.left)}px`);
        host.appendChild(tag);
        binding.tagEls.push(tag);
      }
    }
  }

  root.AISystem6ClioWriteAgentDelivery = Object.freeze({
    classify,
    deliver,
    queueForDocument,
    onDocumentMounted,
    onDocumentUnmounted,
    noteWriterEdit,
    noteVoiceAccepted,
    aiTextRanges,
    storedLedger,
    forgetLedger,
    reportFor,
    adapterFor,
    metaForRecord,
    setTellHandler,
    hasTellHandler,
    tell,
  });
  root.AISystem6ClioWriteAgentDeliveryLoaded = true;
})(typeof window !== 'undefined' ? window : globalThis);
