/* ClioWorks UI kit v3. Framework-free, no storage and no office-format code.
 * Proposed new code, not a declaration of existing AI System 6 APIs.
 * This file can also be required by Node for contract tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ClioWorksCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  function error(code, message) { return Object.assign(new Error(message), {code}); }
  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
  function finite(value, fallback = 0) { return Number.isFinite(Number(value)) ? Number(value) : fallback; }
  function normalizeName(input) {
    const name = String(input || '').trim().normalize('NFC');
    if (!name || name.length > 120 || /[\u0000-\u001f\u007f/\\]/u.test(name) || /^(\.|\.\.)$/u.test(name))
      throw error('INVALID_NAME', '请输入 1 至 120 个字符的名称，不含斜线或控制字符。');
    return name;
  }
  function normalizeHex(input) {
    const value = String(input || '').trim();
    if (!/^#[a-f\d]{6}$/i.test(value)) throw error('INVALID_COLOR', '颜色应为六位十六进制，例如 #284F62。');
    return value.toUpperCase();
  }
  function moveByIds(items, selectedIds, delta) {
    const selected = new Set(selectedIds);
    const copy = items.slice();
    if (delta !== -1 && delta !== 1) throw error('INVALID_MOVE', '一次只移动一个位置。');
    if (delta < 0) {
      for (let i = 1; i < copy.length; i++) if (selected.has(copy[i].id) && !selected.has(copy[i - 1].id))
        [copy[i - 1], copy[i]] = [copy[i], copy[i - 1]];
    } else {
      for (let i = copy.length - 2; i >= 0; i--) if (selected.has(copy[i].id) && !selected.has(copy[i + 1].id))
        [copy[i], copy[i + 1]] = [copy[i + 1], copy[i]];
    }
    return copy;
  }
  function selectRange(items, current, anchorId, targetId, opts = {}) {
    const ids = items.map(i => i.id);
    if (!ids.includes(targetId)) return current.slice();
    if (opts.shift && ids.includes(anchorId)) {
      const a = ids.indexOf(anchorId), b = ids.indexOf(targetId);
      const range = ids.slice(Math.min(a, b), Math.max(a, b) + 1);
      return opts.toggle ? [...new Set([...current, ...range])] : range;
    }
    if (opts.toggle) return current.includes(targetId) ? current.filter(i => i !== targetId) : [...current, targetId];
    return [targetId];
  }
  // Input is screen geometry. Output remains in the document's point coordinate space.
  function translateRect(rect, dx, dy, viewport, docSize, snap = 1) {
    if (!(viewport.width > 0 && viewport.height > 0 && docSize.width > 0 && docSize.height > 0))
      throw error('INVALID_VIEWPORT', '画布尺寸尚未就绪。');
    const step = Math.max(0.01, finite(snap, 1));
    const q = n => Math.round(n / step) * step;
    return {...rect, x: clamp(q(rect.x + dx * docSize.width / viewport.width), 0, Math.max(0, docSize.width - rect.width)),
      y: clamp(q(rect.y + dy * docSize.height / viewport.height), 0, Math.max(0, docSize.height - rect.height))};
  }
  function resizeRect(rect, dx, dy, viewport, docSize, preserveRatio = false) {
    if (!(viewport.width > 0 && viewport.height > 0)) throw error('INVALID_VIEWPORT', '画布尺寸尚未就绪。');
    const min = 12;
    let width = clamp(rect.width + dx * docSize.width / viewport.width, min, docSize.width - rect.x);
    let height = clamp(rect.height + dy * docSize.height / viewport.height, min, docSize.height - rect.y);
    if (preserveRatio) {
      const ratio = rect.width / rect.height;
      height = width / ratio;
      if (height > docSize.height - rect.y) { height = docSize.height - rect.y; width = height * ratio; }
    }
    return {...rect, width, height};
  }
  function parsePageRange(input, count) {
    const parts = String(input).trim().split(',');
    if (!Number.isInteger(count) || count < 1 || parts.length > 100) throw error('INVALID_RANGE', '页面范围无效。');
    const selected = new Set();
    for (const part of parts) {
      const m = part.trim().match(/^(\d+)(?:\s*[-–]\s*(\d+))?$/);
      if (!m) throw error('INVALID_RANGE', '请输入页码，例如 1–3, 5。');
      const a = Number(m[1]), b = Number(m[2] || m[1]);
      if (a < 1 || b < a || b > count) throw error('INVALID_RANGE', `页码必须介于 1 和 ${count} 之间，并按升序填写。`);
      for (let i = a; i <= b; i++) selected.add(i - 1);
    }
    return [...selected].sort((a,b) => a-b);
  }
  function inspectSource(embed, source) {
    if (!embed.source) return 'detached';
    if (!source || (embed.source.fileId && source.id && embed.source.fileId !== source.id)) return 'missing';
    if (source.revision === embed.source.revision || source.revision === embed.source.keptRevision) return 'current';
    return embed.localEdited ? 'changed-and-edited' : 'changed';
  }
  function findText(blocks, query, caseSensitive = false) {
    if (!query) return [];
    // Escape literals rather than lowercasing strings: case conversion can change
    // UTF-16 lengths (for example U+0130), corrupting the resulting selection.
    const pattern=String(query).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const expression=new RegExp(pattern,caseSensitive?'gu':'giu'),result=[];
    for (const block of blocks) {
      expression.lastIndex=0;
      let match;
      while ((match=expression.exec(block.text))) {
        result.push({blockId:block.id,start:match.index,end:match.index+match[0].length});
        if (result.length>=1000) return result;
      }
    }
    return result;
  }
  // Counts save replies, never writes data. Repository transactions remain the host's job.
  class SaveTracker {
    constructor(documentId, generation = 1) {
      this.documentId = documentId; this.generation = generation;
      this.editRevision = 0; this.savedThrough = 0; this.pending = null; this.failure = null; this.closed = false;
    }
    changed() { if (this.closed) throw error('CLOSED', '文件已经关闭。'); this.failure = null; return ++this.editRevision; }
    get dirty() { return this.editRevision > this.savedThrough; }
    begin(requestId) {
      if (this.closed) throw error('CLOSED', '文件已经关闭。');
      if (this.pending) throw error('SAVE_BUSY', '已有一次保存正在进行。');
      if (!requestId) throw error('INVALID_REQUEST', '保存缺少请求标识。');
      this.failure = null;
      this.pending = Object.freeze({requestId, documentId: this.documentId, generation: this.generation, editRevision: this.editRevision});
      return this.pending;
    }
    matches(ticket) {
      return !this.closed && !!this.pending && ticket?.requestId === this.pending.requestId &&
        ticket.documentId === this.documentId && ticket.generation === this.generation && ticket.editRevision === this.pending.editRevision;
    }
    finish(ticket) {
      if (!this.matches(ticket)) return false;
      this.savedThrough = Math.max(this.savedThrough, ticket.editRevision); this.pending = null; this.failure = null;
      return true;
    }
    fail(ticket, code) {
      if (!this.matches(ticket)) return false;
      this.pending = null; this.failure = code || 'SAVE_FAILED'; return true;
    }
    close() { this.closed = true; this.pending = null; }
    status() { return this.pending ? 'saving' : this.failure ? 'failed' : this.dirty ? 'dirty' : 'saved'; }
  }
  const COMMANDS = Object.freeze([
    {id:'file.new', label:'新建…', icon:'new', group:'file', key:'Mod+N', modifies:false},
    {id:'file.open', label:'打开…', icon:'open', group:'file', key:'Mod+O', modifies:false},
    {id:'file.save', label:'保存', icon:'save', group:'file', key:'Mod+S', modifies:false},
    {id:'file.rename', label:'重新命名…', icon:'rename', group:'file', modifies:true},
    {id:'file.export', label:'导出…', icon:'export', group:'file', modifies:false},
    {id:'file.close', label:'关闭文件', icon:'close', group:'file', modifies:false},
    {id:'edit.undo', label:'撤销', icon:'undo', group:'edit', key:'Mod+Z', modifies:true},
    {id:'edit.redo', label:'重做', icon:'redo', group:'edit', key:'Mod+Shift+Z', modifies:true},
    {id:'edit.find', label:'查找与替换…', icon:'find', group:'edit', key:'Mod+F', modifies:false},
    {id:'object.insert', label:'插入', icon:'insert', group:'insert', modifies:true},
    {id:'comment.open', label:'批注', icon:'comment', group:'insert', modifies:false},
    {id:'format.open', label:'格式', icon:'format', group:'format', modifies:false},
    {id:'view.outline', label:'导航', icon:'outline', group:'view', modifies:false},
    {id:'view.focus', label:'专注编辑', icon:'focus', group:'view', modifies:false},
    {id:'view.preview', label:'页面预览', icon:'page', group:'view', modifies:false},
    {id:'ask.open', label:'问一问', icon:'ask', group:'tools', modifies:false},
    {id:'source.open', label:'检查来源更新…', icon:'source', group:'tools', modifies:false},
    {id:'stage.present', label:'放映', icon:'play', group:'tools', modifies:false, kind:'stage'},
    {id:'stage.add', label:'新建页面', icon:'new', group:'insert', modifies:true, kind:'stage'},
    {id:'stage.duplicate', label:'复制页面', icon:'copy', group:'edit', modifies:true, kind:'stage'},
    {id:'stage.delete', label:'删除页面', icon:'delete', group:'edit', modifies:true, kind:'stage'},
    {id:'stage.before', label:'页面前移', icon:'up', group:'edit', modifies:true, kind:'stage'},
    {id:'stage.after', label:'页面后移', icon:'down', group:'edit', modifies:true, kind:'stage'},
    {id:'pdf.rotate', label:'顺时针旋转', icon:'rotate', group:'edit', modifies:true, kind:'pdf'},
    {id:'pdf.before', label:'页面前移', icon:'up', group:'edit', modifies:true, kind:'pdf'},
    {id:'pdf.after', label:'页面后移', icon:'down', group:'edit', modifies:true, kind:'pdf'},
    {id:'pdf.extract', label:'提取页面…', icon:'copy', group:'file', modifies:false, kind:'pdf'},
    {id:'pdf.delete', label:'删除页面…', icon:'delete', group:'edit', modifies:true, kind:'pdf'}
  ]);
  function commandState(id, context) {
    const item = COMMANDS.find(c => c.id === id);
    if (!item) return {enabled:false, reason:'没有这个命令。'};
    if (item.kind && item.kind !== context.kind) return {enabled:false, reason:'不适用于当前文件。'};
    if (context.closed && !['file.new','file.open'].includes(id)) return {enabled:false, reason:'请先打开文件。'};
    if (context.composing && (item.modifies || ['file.save','file.close','file.new'].includes(id)))
      return {enabled:false, reason:'请先完成输入法候选选择。'};
    if (context.readonly && item.modifies) return {enabled:false, reason:'当前文件只读。'};
    if (id === 'file.save' && (context.readonly || context.saving))
      return {enabled:false, reason:context.readonly ? '当前文件只读，可导出副本。' : '正在保存。'};
    if (id === 'edit.undo' && !context.canUndo) return {enabled:false, reason:'没有可撤销的修改。'};
    if (id === 'edit.redo' && !context.canRedo) return {enabled:false, reason:'没有可重做的修改。'};
    if (context.supported && !context.supported.includes(id)) return {enabled:false, reason:'当前编辑器尚未接入此操作。'};
    return {enabled:true, reason:''};
  }
  return Object.freeze({clone, error, clamp, finite, normalizeName, normalizeHex, moveByIds, selectRange,
    translateRect, resizeRect, parsePageRange, inspectSource, findText, SaveTracker, COMMANDS, commandState});
});
