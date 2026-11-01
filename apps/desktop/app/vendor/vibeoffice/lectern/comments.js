/* Lectern — comment parts belong to slides; authors are an implicit dependency. */
(function () {
  'use strict';
  const L = window.L, K = L.opc, X = L.xmlTree, C = (L.comments = {}), N = K.NS;
  const MODERN = 'http://schemas.microsoft.com/office/powerpoint/2018/8/main';
  const PC = 'http://schemas.microsoft.com/office/powerpoint/2013/main/command';
  const AC = 'http://schemas.microsoft.com/office/drawing/2013/main/command';
  const RT = 'http://schemas.microsoft.com/office/2018/10/relationships/';
  const types = [N.rel + '/comments', RT + 'comments'];
  const authors = [N.rel + '/commentAuthors', RT + 'authors'];
  C.types = types;
  const kids = (e, tag) => Array.from(e?.children || []).filter(c => !tag || c.localName === tag);
  const all = e => e ? [e, ...kids(e).flatMap(all)] : [];
  const at = (e, key) => e?.getAttribute(key);
  const kind = rel => types.indexOf(K.relationshipType(rel.type));
  const related = (pkg, type) => pkg?.rels(pkg.main).find(r => K.relationshipType(r.type) === type && !r.external);
  function guid(seed) {
    const bytes = L.sha.sha1(new TextEncoder().encode(seed)).slice(0, 16);
    bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
    const h = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    return '{' + [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20)].join('-') + '}';
  }
  function rewrite(xml, change) {
    const edits = [], root = K.parse(xml);
    for (const el of all(root)) {
      const attrs = change(el); if (!attrs || !Object.keys(attrs).length) continue;
      const p = X.source.get(el);
      const updated = X.source.get(K.parse(K.attributes(K.raw(el), attrs)));
      edits.push({ start: p.start, end: p.openEnd, value: updated.text.slice(updated.start, updated.openEnd) });
    }
    return edits.length ? K.patch(X.source.get(root).text, edits) : xml;
  }
  C.read = function (slide, original, pkg, part) {
    const records = pkg.rels(part).filter(r => kind(r) >= 0 && !r.external).map(r => {
      const author = related(pkg, authors[kind(r)]);
      return { source: pkg.id, part: r.part, type: r.type, id: r.id, author: author && { source: pkg.id, part: author.part, type: author.type } };
    });
    if (!records.length) return;
    slide.keep.comments = records;
    const ext = kids(kids(original, 'extLst')[0]).filter(e => all(e).some(n => n.namespaceURI === MODERN && n.localName === 'commentRel'));
    slide.keep.commentExt = ext.map(e => K.fragment(e, { pkg, part }));
    if (!records.some(r => kind(r) === 1)) return;
    const creation = kids(kids(kids(original, 'cSld')[0], 'extLst')[0]).filter(e => all(e).some(n => n.localName === 'creationId'));
    slide.keep.commentCreation = creation.map(K.raw);
    const refs = new Set();
    for (const r of records.filter(r => kind(r) === 1)) {
      let tree; try { tree = pkg.xml(r.part); } catch (_) { continue; }
      for (const el of all(tree)) if (el.namespaceURI === AC && /^(sp|grpSp|graphicFrame|cxnSp|pic|ink)Mk$/.test(el.localName)) refs.add(at(el, 'id'));
    }
    L.model.walk(slide.shapes, s => {
      const id = s.keep?.identity?.ids.find(i => i.kind === 'shape' && i.definition)?.id;
      if (refs.has(id)) s.keep.commentAnchor = { owner: s.id, text: s.tx ? L.txt.plain(s.tx) : null };
      return true;
    });
  };

  /* ---- ClioWorks M2-A: comment text, add and reply (local addition) ----
   * Existing comment parts are still carried byte for byte. New comments and replies
   * live on the slide as plain data (slide.keep.cwAdds) so they travel with the model
   * snapshot, and are written into the matching part at save time. */
  const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const P15 = 'http://schemas.microsoft.com/office/powerpoint/2012/main';
  const THREAD = '{C676402C-5697-4E1C-873F-D02D1690AC5C}';
  const COMMENT_REL = '{6950BFC3-D8DA-4A85-94F7-54DA5524770B}';
  const CT_MODERN = 'application/vnd.ms-powerpoint.comments+xml';
  const CT_LEGACY = 'application/vnd.openxmlformats-officedocument.presentationml.comments+xml';
  const CT_AUTHORS = 'application/vnd.ms-powerpoint.authors+xml';
  const MARK = /^(sp|grpSp|graphicFrame|cxnSp|pic|ink)Mk$/;
  const paras = tx => kids(tx, 'p').map(p => all(p).filter(e => e.localName === 't' || e.localName === 'br').map(e => e.localName === 'br' ? '\n' : e.textContent).join('')).join('\n');
  const authorTable = (pkg, rel) => {
    const out = new Map(); if (!rel) return out;
    let root; try { root = pkg.xml(rel.part); } catch (_) { return out; }
    for (const e of kids(root)) out.set(at(e, 'id'), { name: at(e, 'name') || '', initials: at(e, 'initials') || '' });
    return out;
  };
  const stamp = d => { const t = new Date(d); return Number.isNaN(t.getTime()) ? String(d || '') : t.toISOString(); };
  /** Every comment of one slide, in reading order: roots then their replies. Never throws. */
  C.entries = function (pres, slide) {
    const pkg = pres.pkg, out = [], sid = slide.id, adds = slide.keep?.cwAdds || [];
    const shapeOf = new Map();
    L.model.walk(slide.shapes, s => { for (const i of s.keep?.identity?.ids || []) if (i.kind === 'shape' && i.definition) shapeOf.set(String(i.id), s.id); return true; });
    for (const r of slide.keep?.comments || []) {
      if (!pkg) break;
      let root; try { root = pkg.xml(r.part); } catch (_) { continue; }
      const n = kind(r), names = authorTable(pkg, r.author ? { part: r.author.part } : null);
      const who = id => names.get(id)?.name || '';
      if (n === 1) {
        for (const cm of kids(root, 'cm')) {
          const id = sid + '#' + at(cm, 'id');
          const mk = all(cm).find(e => e.namespaceURI === AC && MARK.test(e.localName));
          out.push({ id, slideId: sid, anchorShapeId: mk ? shapeOf.get(at(mk, 'id')) : undefined, author: who(at(cm, 'authorId')), text: paras(kids(cm, 'txBody')[0]), date: at(cm, 'created') || '', done: at(cm, 'status') === 'resolved', parentId: null, modern: true });
          for (const rp of kids(kids(cm, 'replyLst')[0], 'reply')) out.push({ id: sid + '#' + at(rp, 'id'), slideId: sid, author: who(at(rp, 'authorId')), text: paras(kids(rp, 'txBody')[0]), date: at(rp, 'created') || '', done: false, parentId: id, modern: true });
        }
      } else {
        for (const cm of kids(root, 'cm')) {
          const key = at(cm, 'authorId') + '.' + at(cm, 'idx'), parent = all(cm).find(e => e.localName === 'parentCm');
          out.push({ id: sid + '#L' + key, slideId: sid, author: who(at(cm, 'authorId')), text: kids(cm, 'text')[0]?.textContent || '', date: at(cm, 'dt') || '', done: false, parentId: parent ? sid + '#L' + at(parent, 'authorId') + '.' + at(parent, 'idx') : null, modern: false });
        }
      }
    }
    for (const a of adds) out.push({ id: sid + '#' + a.uid, slideId: sid, anchorShapeId: a.anchor || undefined, author: a.author, text: a.text, date: a.date, done: false, parentId: a.parent ? sid + '#' + a.parent : null, modern: !!a.modern });
    // Replies sit under their root; a reply whose root is unknown stays visible as a root.
    // A reply to a reply is flattened under its thread root.
    const byId = new Map(out.map(c => [c.id, c])), rootOf = c => { const seen = new Set(); while (c.parentId && byId.has(c.parentId) && !seen.has(c.id)) { seen.add(c.id); c = byId.get(c.parentId); } return c; };
    const roots = out.filter(c => rootOf(c) === c);
    return roots.flatMap(c => [c, ...out.filter(x => x !== c && rootOf(x) === c)]);
  };
  /** Which flavour a new root comment on this slide should use: follow what the slide or deck already has. */
  C.flavour = function (pres, slide) {
    const mine = slide.keep?.comments || [];
    if (mine.some(r => kind(r) === 1)) return true;
    if (mine.length) return false;
    const rel = related(pres.pkg, authors[0]);
    return !rel || !!related(pres.pkg, authors[1]);
  };
  C.add = function (slide, item) { (slide.keep ||= {}).cwAdds = [...(slide.keep.cwAdds || []), item]; };

  function initials(name) { const parts = String(name).trim().split(/\s+/).filter(Boolean); return (parts.length > 1 ? parts.map(p => p[0]).join('').slice(0, 3) : String(name).trim().slice(0, 2)).toUpperCase(); }
  function authorEntry(t, name) {
    name = String(name || '').trim() || 'Author';
    const key = 'cw:' + name;
    if (t.maps.has(key)) return t.maps.get(key);
    for (const [id, e] of t.entries) {
      let nm; try { nm = at(K.parse(e.xml), 'name'); } catch (_) { nm = (/\bname="([^"]*)"/.exec(e.xml) || [])[1]; }
      if (nm === name) { t.maps.set(key, id); return id; }
    }
    let id, xml;
    if (t.n) {
      id = guid('author:' + name); xml = '<p188:author xmlns:p188="' + MODERN + '" id="' + id + '" name="' + esc(name) + '" initials="' + esc(initials(name)) + '" userId="' + esc(name) + '" providerId="None"/>';
    } else {
      id = String(Math.max(-1, ...Array.from(t.entries.keys(), Number)) + 1);
      xml = '<p:cmAuthor xmlns:p="' + N.p + '" id="' + id + '" name="' + esc(name) + '" initials="' + esc(initials(name)) + '" lastIdx="0" clrIdx="' + id + '"/>';
    }
    t.entries.set(id, { xml, last: 0 }); t.maps.set(key, id); t.changed = true; return id;
  }
  const body = text => '<p188:txBody><a:bodyPr xmlns:a="' + A + '"/><a:lstStyle xmlns:a="' + A + '"/>' + String(text).split(/\r?\n/).map(l => '<a:p xmlns:a="' + A + '"><a:r><a:rPr lang="zh-CN" dirty="0"/><a:t>' + esc(l) + '</a:t></a:r></a:p>').join('') + '</p188:txBody>';
  const modernId = (slide, item) => guid('cw-comment:' + slide.id + ':' + item.uid);
  const replyXML = (state, slide, r) => '<p188:reply xmlns:p188="' + MODERN + '" id="' + modernId(slide, r) + '" authorId="' + authorEntry(state.table(1), r.author) + '" created="' + esc(stamp(r.date)) + '">' + body(r.text) + '</p188:reply>';
  function modernCm(state, slide, ctx, item, replies) {
    const w = state.w, aid = authorEntry(state.table(1), item.author);
    const mk = '<pc:docMk/><pc:sldMk cId="' + state.creationId(slide) + '" sldId="' + w.slideIds.get(slide.id) + '"/>';
    const sid = item.anchor && ctx.idOf(item.anchor);
    const anchor = sid ? '<ac:deMkLst xmlns:ac="' + AC + '" xmlns:pc="' + PC + '">' + mk + '<ac:spMk id="' + sid + '"/></ac:deMkLst>' : '<pc:sldMkLst xmlns:pc="' + PC + '">' + mk + '</pc:sldMkLst>';
    return '<p188:cm xmlns:p188="' + MODERN + '" id="' + modernId(slide, item) + '" authorId="' + aid + '" created="' + esc(stamp(item.date)) + '">' + anchor + (replies.length ? '<p188:replyLst>' + replies.map(r => replyXML(state, slide, r)).join('') + '</p188:replyLst>' : '') + body(item.text) + '</p188:cm>';
  }
  function legacyCm(state, item, parentRef, shape) {
    const t = state.table(0), aid = authorEntry(t, item.author), entry = t.entries.get(aid), idx = ++entry.last; t.changed = true;
    const x = shape ? Math.max(0, Math.round(shape.x * 8)) : 10, y = shape ? Math.max(0, Math.round(shape.y * 8)) : 10;
    const thread = parentRef ? '<p:extLst><p:ext uri="' + THREAD + '"><p15:threadingInfo xmlns:p15="' + P15 + '" timeZoneBias="0"><p15:parentCm authorId="' + parentRef.authorId + '" idx="' + parentRef.idx + '"/></p15:threadingInfo></p:ext></p:extLst>' : '';
    return { ref: { authorId: aid, idx }, xml: '<p:cm xmlns:p="' + N.p + '" authorId="' + aid + '" dt="' + esc(stamp(item.date).replace(/Z$/, '')) + '" idx="' + idx + '"><p:pos x="' + x + '" y="' + y + '"/><p:text>' + esc(item.text) + '</p:text>' + thread + '</p:cm>' };
  }
  const insertInto = (xml, tag, fragment) => {
    const m = new RegExp('</(?:[\\w.-]+:)?' + tag + '>\\s*$').exec(xml);
    if (m) return xml.slice(0, m.index) + fragment + xml.slice(m.index);
    const e = new RegExp('<((?:[\\w.-]+:)?' + tag + ')((?:\\s[^>]*?)?)\\s*/>\\s*$').exec(xml);
    return e ? xml.slice(0, e.index) + '<' + e[1] + e[2] + '>' + fragment + '</' + e[1] + '>' : xml;
  };
  /** Patch replies into the modern comments this part already has, and append new roots (with their replies). */
  function patchModern(state, slide, ctx, xml, adds, done, copy) {
    const tree = K.parse(xml), edits = [], fresh = new Map();
    for (const r of adds) {
      if (done.has(r.uid) || !r.parent) continue;
      const cm = kids(tree, 'cm').find(c => at(c, 'id') === (copy ? guid('comment:' + slide.id + ':' + r.parent) : r.parent)); if (!cm) continue;
      const frag = replyXML(state, slide, r), list = kids(cm, 'replyLst')[0];
      if (list) { const p = X.source.get(list), pos = p.text.lastIndexOf('</', p.end - 1); edits.push({ start: pos, end: pos, value: frag }); }
      else { const g = fresh.get(cm) || fresh.set(cm, []).get(cm); g.push(frag); }
      done.add(r.uid);
    }
    // One p188:replyLst per cm (the schema allows exactly one), however many replies it gains.
    for (const [cm, frags] of fresh) { const p = X.source.get(kids(cm, 'txBody')[0]); edits.push({ start: p.start, end: p.start, value: '<p188:replyLst xmlns:p188="' + MODERN + '">' + frags.join('') + '</p188:replyLst>' }); }
    return edits.length ? K.patch(X.source.get(tree).text, edits) : xml;
  }
  function newModernRoots(state, slide, ctx, adds, done) {
    return adds.filter(r => !done.has(r.uid) && !r.parent && r.modern).map(r => {
      done.add(r.uid);
      return modernCm(state, slide, ctx, r, adds.filter(x => x.parent === r.uid && !done.has(x.uid)).map(x => (done.add(x.uid), x)));
    }).join('');
  }
  /** New legacy comments (and threaded replies) as p:cm fragments. lookup(authorId, idx) resolves a reply's existing parent. */
  function legacyFragments(state, slide, adds, done, lookup) {
    const refs = new Map(), frags = [];
    const place = (r, parentRef) => { const c = legacyCm(state, r, parentRef, r.anchor && L.model.shapeById(slide, r.anchor)); refs.set(r.uid, c.ref); frags.push(c.xml); done.add(r.uid); };
    for (const r of adds) if (!done.has(r.uid) && !r.parent && !r.modern) place(r);
    for (const r of adds) {
      if (done.has(r.uid) || !r.parent || r.modern) continue;
      let ref = refs.get(r.parent);
      if (!ref && /^L\d+\.\d+$/.test(r.parent)) ref = lookup(...r.parent.slice(1).split('.'));
      if (ref) place(r, ref);
    }
    return frags.join('');
  }
  C.apply = { CT_MODERN, CT_LEGACY, CT_AUTHORS, COMMENT_REL };
  C.references = function (item) {
    return (item.slides || []).flatMap(s => (s.keep?.comments || []).flatMap(r => [r, ...(r.author ? [r.author] : [])]));
  };
  C.shapeIdentity = function (shape, ctx, xml) {
    const f = shape.keep?.identity;
    if (!f || !f.copy && f.source === ctx.writer?.pkg?.id && f.part === ctx.part) return xml;
    return rewrite(xml, el => el.localName === 'creationId' && /^\{/.test(at(el, 'id') || '') ? { id: guid('shape:' + shape.id + ':' + at(el, 'id')) } : null);
  };
  C.begin = function (pres, pack) {
    const w = pack.writer, tables = new Map(), creationIds = new Map(), usedCreation = new Set();
    for (const r of pres.pkg?.rels(pres.pkg.main) || []) if (K.relationshipType(r.type) === N.rel + '/slide' && !r.external) {
      let root; try { root = pres.pkg.xml(r.part); } catch (_) { continue; }
      for (const e of all(root)) if (e.localName === 'creationId' && e.hasAttribute('val')) usedCreation.add(+at(e, 'val'));
    }
    function creationId(slide) {
      if (!creationIds.has(slide.id)) {
        const original = !slide.keep?.copy && slide.keep?.source === pres.pkg?.id && (slide.keep.commentCreation || []).flatMap(xml => all(K.parse(xml))).find(e => e.localName === 'creationId' && e.hasAttribute('val'));
        if (original) { creationIds.set(slide.id, +at(original, 'val')); return creationIds.get(slide.id); }
        let id = parseInt(guid('slide:' + slide.id).slice(1, 9), 16);
        while (!id || usedCreation.has(id)) id = (id + 1) >>> 0;
        usedCreation.add(id); creationIds.set(slide.id, id);
      }
      return creationIds.get(slide.id);
    }
    function table(n) {
      if (tables.has(n)) return tables.get(n);
      const rel = related(pres.pkg, authors[n]), source = rel?.part;
      const xml = source ? pres.pkg.text(source) : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + (n ? '<p188:authorLst xmlns:p188="' + MODERN + '"/>' : '<p:cmAuthorLst xmlns:p="' + N.p + '"/>');
      const root = K.parse(xml), entries = new Map(kids(root).map(e => [at(e, 'id'), { xml: K.raw(e), last: +(at(e, 'lastIdx') || 0) }]));
      const t = { n, rel, source, xml, ns: root.namespaceURI, entries, maps: new Map(), changed: false };
      // A stale source counter must not allocate an already-used author/index pair.
      if (!n) for (const name of pres.pkg?.names || []) if (pres.pkg.type(name)?.endsWith('.comments+xml')) {
        let root; try { root = pres.pkg.xml(name); } catch (_) { continue; }
        for (const e of kids(root, 'cm')) { const author = entries.get(at(e, 'authorId')); if (author) author.last = Math.max(author.last, +at(e, 'idx') || 0); }
      }
      tables.set(n, t); return t;
    }
    function author(t, record, id) {
      if (record.source === pres.pkg?.id) return id;
      const key = record.source + ':' + record.author?.part + ':' + id;
      if (t.maps.has(key)) return t.maps.get(key);
      const pkg = K.package(record.source), original = kids(record.author && pkg.xml(record.author.part)).find(e => at(e, 'id') === id);
      if (!original) throw Error('Missing comment author ' + id);
      let fresh = t.n ? id : String(Math.max(-1, ...Array.from(t.entries.keys(), Number)) + 1);
      if (t.n && t.entries.has(fresh)) {
        // Reuse a modern author only when its entire record agrees.
        if (K.serialize(K.parse(t.entries.get(fresh).xml)) === K.serialize(K.parse(K.raw(original)))) { t.maps.set(key, fresh); return fresh; }
        fresh = guid('author:' + key);
      }
      t.entries.set(fresh, { xml: K.attributes(K.raw(original), { id: fresh, ...(t.n ? {} : { lastIdx: 0 }) }), last: 0 });
      t.maps.set(key, fresh); t.changed = true; return fresh;
    }
    return { pres, pack, w, table, author, tables, creationId };
  };
  function modernXML(state, slide, record, ctx, xml, copy) {
    const { w } = state, t = state.table(1), shapeMap = new Map();
    L.model.walk(slide.shapes, s => {
      const ref = s.keep?.identity?.ids.find(i => i.definition && i.kind === 'shape');
      if (ref && s.keep.commentAnchor?.owner === s.id && s.keep.source === record.source && s.keep.part === slide.keep.part) shapeMap.set(String(ref.id), s);
      return true;
    });
    const anchorTags = new Set(['sldMkLst', 'deMkLst', 'txMkLst']);
    const tree = K.parse(xml), changes = [];
    for (const cm of kids(tree, 'cm')) {
      const anchors = kids(cm).filter(e => anchorTags.has(e.localName));
      const refs = anchors.flatMap(all).filter(e => e.namespaceURI === AC && /^(sp|grpSp|graphicFrame|cxnSp|pic|ink)Mk$/.test(e.localName));
      const absent = refs.some(e => !shapeMap.has(at(e, 'id')));
      const textChanged = anchors.some(e => e.localName === 'txMkLst') && refs.some(e => {
        const shape = shapeMap.get(at(e, 'id')); return shape?.keep.commentAnchor && shape.keep.commentAnchor.text !== (shape.tx ? L.txt.plain(shape.tx) : null);
      });
      if (absent || textChanged) {
        const sldId = w.slideIds.get(slide.id);
        anchors.forEach((anchor, i) => {
          const p = X.source.get(anchor);
          changes.push({ start: p.start, end: p.end, value: i ? '' : '<pc:sldMkLst xmlns:pc="' + PC + '"><pc:docMk/><pc:sldMk cId="' + state.creationId(slide) + '" sldId="' + sldId + '"/></pc:sldMkLst>' });
        });
        w.loss({ id: 'comment-anchor:' + slide.id + ':' + at(cm, 'id'), what: absent ? 'A comment on a deleted object is now attached to its slide.' : 'A comment on edited text is now attached to its slide.', where: 'Slide comments', action: 'conversion' });
      }
    }
    if (changes.length) xml = K.patch(X.source.get(tree).text, changes);
    return rewrite(xml, el => {
      const attrs = {};
      if (copy && el.namespaceURI === MODERN && ['cm', 'reply'].includes(el.localName)) attrs.id = guid('comment:' + slide.id + ':' + at(el, 'id'));
      if (record.source !== state.pres.pkg?.id) {
        if (el.hasAttribute('authorId')) attrs.authorId = state.author(t, record, at(el, 'authorId'));
        if (el.hasAttribute('assignedTo')) attrs.assignedTo = at(el, 'assignedTo').split(/\s+/).filter(Boolean).map(id => state.author(t, record, id)).join(' ');
      }
      if (el.namespaceURI === PC && el.localName === 'sldMk') {
        if (at(el, 'sldId') !== String(w.slideIds.get(slide.id))) attrs.sldId = w.slideIds.get(slide.id);
        if (copy || !el.hasAttribute('cId') || !slide.keep?.commentCreation?.length) attrs.cId = state.creationId(slide);
      }
      if (el.namespaceURI === AC && /^(sp|grpSp|graphicFrame|cxnSp|pic|ink)Mk$/.test(el.localName)) {
        const shape = shapeMap.get(at(el, 'id'));
        if (shape) {
          if (at(el, 'id') !== String(ctx.nextId(shape.id))) attrs.id = ctx.nextId(shape.id);
          if (shape.keep.identity.copy && el.hasAttribute('creationId')) attrs.creationId = guid('shape:' + shape.id + ':' + at(el, 'creationId'));
        }
      }
      return attrs;
    });
  }
  C.slide = function (state, slide, ctx) {
    const { w, pres } = state, comments = slide.keep?.comments || [], relIds = new Map();
    const adds = slide.keep?.cwAdds || [], done = new Set(), extra = [];
    for (const record of comments) {
      const pkg = K.package(record.source), n = kind(record), copy = !!slide.keep.copy || record.source !== pres.pkg?.id;
      try {
        let xml = pkg.text(record.part), changed = false, rewritten = copy;
        if (n === 1) {
          const next = modernXML(state, slide, record, ctx, xml, copy); changed = next !== xml; rewritten = rewritten || changed; xml = next;
          if (adds.length) {
            let patched = patchModern(state, slide, ctx, xml, adds, done, copy);
            const roots = newModernRoots(state, slide, ctx, adds, done);
            if (roots) patched = insertInto(patched, 'cmLst', roots);
            if (patched !== xml) { xml = patched; changed = true; }
          }
        } else {
          let remap = null;
          if (copy) {
            const t = state.table(0), ids = new Map();
            for (const cm of kids(K.parse(xml), 'cm')) {
              const id = state.author(t, record, at(cm, 'authorId')), entry = t.entries.get(id);
              if (!entry) throw Error('Missing comment author ' + id);
              ids.set(at(cm, 'authorId') + ':' + at(cm, 'idx'), { authorId: id, idx: ++entry.last }); t.changed = true;
            }
            xml = rewrite(xml, el => ['cm', 'parentCm'].includes(el.localName) ? ids.get(at(el, 'authorId') + ':' + at(el, 'idx')) : null); changed = true; remap = ids;
          }
          if (adds.length) {
            const known = new Set(kids(K.parse(pkg.text(record.part)), 'cm').map(cm => at(cm, 'authorId') + '.' + at(cm, 'idx')));
            const frag = legacyFragments(state, slide, adds, done, (a, i) => known.has(a + '.' + i) ? (remap ? remap.get(a + ':' + i) : { authorId: a, idx: i }) : null);
            if (frag) { xml = insertInto(xml, 'cmLst', frag); changed = true; }
          }
        }
        const target = copy ? w.name('ppt/comments', 'comment', 'xml') : w.target(pkg, record.part);
        if (copy) w.copyPart(pkg, record.part, target);
        else w.carry(pkg, record.part);
        // Only additions: the comments that were already there keep their exact bytes.
        if (changed) w.put(target, rewritten ? K.hoistNamespaces(xml) : xml, pkg.type(record.part));
        const id = w.rels(ctx.part).add(record.type, K.relative(ctx.part, target), false, copy ? undefined : record.id);
        relIds.set(record.id, id);
      } catch (error) {
        w.loss({ id: 'comments:' + slide.id + ':' + record.part, what: 'Comments on this slide couldn\'t be kept and will be removed.', detail: error.message, where: record.part, place: ctx.place, action: 'drop', notify: !L.opc.sourceMissing(error) });
      }
    }
    // Comments added here that no existing part of this slide could take get a part of their own.
    let addedModern = false;
    if (adds.some(r => !done.has(r.uid))) try {
      const roots = newModernRoots(state, slide, ctx, adds, done);
      if (roots) {
        const target = w.name('ppt/comments', 'modernComment_', 'xml');
        w.put(target, K.hoistNamespaces('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p188:cmLst xmlns:p188="' + MODERN + '">' + roots + '</p188:cmLst>'), CT_MODERN);
        const rid = w.rels(ctx.part).add(RT + 'comments', K.relative(ctx.part, target));
        extra.push('<p:ext uri="' + COMMENT_REL + '"><p188:commentRel xmlns:p188="' + MODERN + '" r:id="' + rid + '"/></p:ext>');
        addedModern = true;
      }
      const frag = legacyFragments(state, slide, adds, done, () => null);
      if (frag) {
        const target = w.name('ppt/comments', 'comment', 'xml');
        w.put(target, K.hoistNamespaces('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:cmLst xmlns:p="' + N.p + '">' + frag + '</p:cmLst>'), CT_LEGACY);
        w.rels(ctx.part).add(N.rel + '/comments', K.relative(ctx.part, target));
      }
    } catch (error) {
      w.loss({ id: 'comments-add:' + slide.id, what: 'New comments on this slide couldn\'t be saved.', detail: error.message, where: ctx.place, place: ctx.place, action: 'drop', notify: true });
    }
    for (const r of adds) if (!done.has(r.uid)) w.loss({ id: 'comment-orphan:' + slide.id + ':' + r.uid, what: 'A reply was dropped because the comment it answers is no longer there.', where: ctx.place, place: ctx.place, action: 'drop', notify: true });
    const extensions = (slide.keep?.commentExt || []).flatMap(f => {
      // The relationship belongs to this particular slide copy, not the shared source part.
      if (f.deps.some(d => !relIds.has(d.id))) return [];
      return [f.xml.replace(/\u0001rel:(\d+)\u0001/g, (_, i) => relIds.get(f.deps[+i].id))];
    }).concat(extra).join('');
    let creation = (slide.keep?.commentCreation || []).map(xml => slide.keep.copy || slide.keep.source !== pres.pkg?.id
      ? rewrite(xml, e => e.localName === 'creationId' ? { val: state.creationId(slide) } : null) : xml).join('');
    if (!creation && (addedModern || comments.some(r => kind(r) === 1 && relIds.has(r.id)))) creation = '<p:ext uri="{BB962C8B-B14F-4D97-AF65-F5344CB8AC3E}"><p14:creationId xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" val="' + state.creationId(slide) + '"/></p:ext>';
    return { ext: extensions ? '<p:extLst>' + extensions + '</p:extLst>' : '', creation: creation ? '<p:extLst>' + creation + '</p:extLst>' : '' };
  };
  C.finish = function (state) {
    const { pres, w, pack } = state;
    for (const t of state.tables.values()) if (t.changed) {
      const target = t.source ? w.target(pres.pkg, t.source) : w.name('ppt', t.n ? 'authors' : 'commentAuthors', 'xml');
      if (t.source) w.claim(t.source, 'merged', target);
      const entries = [...t.entries.values()].map(e => t.n ? e.xml : K.attributes(e.xml, { lastIdx: e.last }));
      const xml = K.mergeBag(t.xml, { ['{' + t.ns + '}' + (t.n ? 'author' : 'cmAuthor')]: entries });
      w.put(target, K.hoistNamespaces(xml), pres.pkg?.type(t.source) || (t.n ? 'application/vnd.ms-powerpoint.authors+xml' : 'application/vnd.openxmlformats-officedocument.presentationml.commentAuthors+xml'));
      if (t.source) w.carryRels(pres.pkg, t.source, target);
      const owner = pack.part('ppt/presentation.xml');
      w.rels(owner).add(t.rel?.type || authors[t.n], K.relative(owner, target), false, t.rel?.id);
    }
    // A source part is dropped only when none of its original owners survives.
    const live = new Set(pres.slides.filter(s => s.keep?.source && s.keep.source === pres.pkg?.id && !s.keep.copy).flatMap(s => (s.keep.comments || []).map(r => r.part)));
    for (const name of pres.pkg?.names || []) for (const r of pres.pkg.rels(name).filter(r => kind(r) >= 0 && !r.external)) {
      if (!live.has(r.part)) w.omit(r.part, 'The slide containing these comments was deleted.');
    }
  };
})();
