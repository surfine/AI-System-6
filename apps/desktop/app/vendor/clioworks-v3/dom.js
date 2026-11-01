/* DOM utilities with disposal, keyboard navigation and plain-text selection bookmarks. */
(function (root) {
  'use strict';
  function h(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'text') node.textContent = value;
      else if (key === 'class') node.className = value;
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
      else if (key in node && !key.startsWith('aria-') && key !== 'role') node[key] = value;
      else node.setAttribute(key, String(value));
    }
    for (const child of [].concat(children)) if (child !== null && child !== undefined)
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    return node;
  }
  function disposable() {
    const cleanup = []; let dead = false;
    return {
      add(fn) { if (dead) fn(); else cleanup.push(fn); return fn; },
      on(target, event, fn, options) { target.addEventListener(event, fn, options); this.add(() => target.removeEventListener(event, fn, options)); },
      dispose() { if (dead) return; dead = true; const errors=[]; for (const fn of cleanup.splice(0).reverse()) {try {fn();} catch(error) {errors.push(error);}} if(errors.length) console.error("ClioWorks cleanup failed",...errors); },
      get disposed() { return dead; }
    };
  }
  function visible(node) { return !!node && !!(node.offsetWidth || node.offsetHeight || node.getClientRects().length) && !node.hidden; }
  function isTextInput(node) { return !!node?.matches?.('input,textarea,select,[contenteditable="true"],[contenteditable="plaintext-only"]'); }
  function roving(container, selector = 'button:not(:disabled)', vertical = false) {
    const bag = disposable();
    const entries = () => [...container.querySelectorAll(selector)].filter(visible);
    function sync(preferred) {
      const items = entries(), chosen = preferred && items.includes(preferred) ? preferred : items.find(x => x.tabIndex === 0) || items[0];
      for (const item of items) item.tabIndex = item === chosen ? 0 : -1;
    }
    bag.on(container, 'focusin', e => { if (e.target.matches(selector)) sync(e.target); });
    bag.on(container, 'keydown', e => {
      if (e.isComposing || isTextInput(e.target)) return;
      const items = entries(), index = items.indexOf(e.target); if (index < 0) return;
      const forward = vertical ? 'ArrowDown' : 'ArrowRight', back = vertical ? 'ArrowUp' : 'ArrowLeft';
      let next;
      if (e.key === forward) next = (index + 1) % items.length;
      if (e.key === back) next = (index - 1 + items.length) % items.length;
      if (e.key === 'Home') next = 0;
      if (e.key === 'End') next = items.length - 1;
      if (next === undefined) return;
      e.preventDefault(); sync(items[next]); items[next].focus();
    });
    sync(); return {...bag, sync};
  }
  // Only plain text editables use this helper. Rich editors must inject their own bookmark adapter.
  function bookmark(node) {
    if (!node?.isConnected) return null;
    if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement)
      return {key:node.dataset.editKey, start:node.selectionStart, end:node.selectionEnd, direction:node.selectionDirection, input:true};
    const s = window.getSelection();
    if (!s?.rangeCount || !node.contains(s.anchorNode) || !node.contains(s.focusNode)) return {key:node.dataset.editKey, start:0, end:0};
    const range = s.getRangeAt(0), a = document.createRange(), b = document.createRange();
    a.selectNodeContents(node); a.setEnd(range.startContainer, range.startOffset);
    b.selectNodeContents(node); b.setEnd(range.endContainer, range.endOffset);
    return {key:node.dataset.editKey, start:a.toString().length, end:b.toString().length};
  }
  function restoreBookmark(scope, mark) {
    if (!mark?.key) return false;
    const node = [...scope.querySelectorAll('[data-edit-key]')].find(x => x.dataset.editKey === mark.key);
    if (!node || !visible(node)) return false;
    node.focus({preventScroll:true});
    if (mark.input) { try { node.setSelectionRange(mark.start, mark.end, mark.direction); } catch {} return true; }
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT), positions = [];
    let current, total = 0;
    while ((current = walker.nextNode())) { positions.push({node:current, start:total}); total += current.length; }
    if (!positions.length) { node.appendChild(document.createTextNode('')); positions.push({node:node.firstChild,start:0}); }
    const position = offset => {
      const n = Math.min(total, Math.max(0, offset || 0));
      for (const p of positions) if (n <= p.start + p.node.length) return [p.node, n-p.start];
      const p = positions[positions.length-1]; return [p.node,p.node.length];
    };
    const r = document.createRange(), a = position(mark.start), b = position(mark.end);
    r.setStart(...a); r.setEnd(...b); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    return true;
  }
  function insertPlainText(node, text) {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !node.contains(selection.anchorNode)) return false;
    const range = selection.getRangeAt(0); range.deleteContents();
    const leaf = document.createTextNode(text); range.insertNode(leaf); range.setStartAfter(leaf); range.collapse(true);
    selection.removeAllRanges(); selection.addRange(range);
    node.dispatchEvent(new Event('input', {bubbles:true})); return true;
  }
  // Native-host builds may inject their existing overlay service instead of this standalone layer.
  class Overlays {
    constructor(owner, {onOpen = () => {}, onClose = () => {}} = {}) { this.owner=owner; this.onOpen=onOpen; this.onClose=onClose; this.active=null; this.disposed=false; }
    open({title, content, actions, initial = 'cancel', description, onCancel}) {
      if (this.disposed) return Promise.resolve({action:'cancel',reason:'disposed'});
      if (this.active) this.active.finish('cancel');
      const invoker = document.activeElement;
      const d = h('dialog', {class:'cw-root cw-dialog', 'aria-labelledby':'cw-dialog-title'});
      const titleNode = h('h2',{id:'cw-dialog-title', text:title, tabIndex:-1});
      const body = h('div',{class:'cw-dialog-body'},[titleNode]);
      if (description) body.append(h('p',{class:'cw-help', text:description}));
      if (content) body.append(content);
      const footer = h('footer',{class:'cw-dialog-actions'}), bag = disposable();
      let resolvePromise, settled=false, processing=false;
      const result = new Promise(resolve => {resolvePromise=resolve;});
      const finish = action => {
        if (settled) return; settled = true;
        bag.dispose(); if (d.open) d.close(); d.remove(); this.active=null;
        if (action==='cancel') onCancel?.();
        this.onClose();
        if (invoker?.isConnected && visible(invoker)) invoker.focus({preventScroll:true});
        resolvePromise({action});
      };
      const buttons=[];
      for (const action of actions || [{id:'cancel',label:'关闭'}]) {
        const button = h('button',{type:'button',class:`btn cw-button ${action.primary?'default':''} ${action.danger?'cw-danger':''}`,
          text:action.label,disabled:action.disabled,dataset:{dialogAction:action.id}});
        bag.on(button,'click', async () => {
          if (button.disabled || processing) return;
          processing=true;
          try {
            const answer = action.run ? await action.run({dialog:d,button,finish}) : undefined;
            if (!settled) finish(action.id);
          } catch (err) { showError(err.message || '操作未完成。'); } finally { processing=false; }
        });
        footer.append(button); buttons.push(button);
      }
      let errorNode;
      function showError(message) {
        if (!errorNode) {errorNode=h('p',{class:'cw-field-error',role:'alert'}); body.append(errorNode);}
        errorNode.textContent=message;
      }
      bag.on(d,'cancel', e => { e.preventDefault(); finish('cancel'); });
      bag.on(d,'close', () => finish('cancel'));
      // Native dialog supplies inertness; explicit wrapping makes keyboard behavior testable.
      bag.on(d,'keydown', e => {
        if (e.key!=='Tab') return;
        const list=[...d.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(visible);
        if (!list.length) {e.preventDefault();titleNode.focus();return;}
        const index=list.indexOf(document.activeElement);
        if (e.shiftKey && index<=0) { e.preventDefault();list[list.length-1].focus(); }
        else if (!e.shiftKey && (index===list.length-1 || index<0)) {e.preventDefault();list[0].focus();}
      });
      d.append(body,footer); this.owner.append(d); this.active={dialog:d,finish,showError}; this.onOpen();
      if (typeof d.showModal !== 'function') {
        finish('cancel'); throw new Error('当前浏览器不支持此原型的对话框，请在宿主中注入已有 modal 服务。');
      }
      d.showModal();
      const initialNode = initial==='field' ? body.querySelector('input,textarea,select') : buttons.find(b=>b.dataset.dialogAction===initial&&!b.disabled);
      (initialNode || titleNode).focus(); return result;
    }
    close() { this.active?.finish('cancel'); }
    dispose() { this.close(); this.disposed=true; }
  }
  root.ClioWorksDOM = Object.freeze({h, disposable, visible, isTextInput, roving, bookmark, restoreBookmark, insertPlainText, Overlays});
})(globalThis);
