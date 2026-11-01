/* VibeOffice — ZIP container engine (read + write), no dependencies; shared by Quire, Ledger and Lectern.
 * Uses the browser's Compression Streams when present and ships a small pure-JS inflater, so Office
 * Open XML packages open in any modern browser (and in Node, for the tests).
 *
 * Also loaded by the service worker (public/sw.js, importScripts), which unpacks the whole published site
 * from updater/web-<version>.zip with read(), entry.bytes(), entry.usize, entry.crc and crc32(). Careful when
 * editing: it runs there with no window or DOM (only self/globalThis), a change to it is a change to the
 * worker (browsers reinstall it), and a bug here can stop the site from caching or updating for every
 * visitor. Keep those members working, and check tests/sw.test.mjs as well as the apps.
 */
(function (root) {
  'use strict';
  const L = root.L || (root.L = {});
  /* ClioWorks deviation (documented): L.t / L.N are defined upstream by common/i18n.js, which ClioWorks does not
     vendor, yet vendored files call them (some while loading). English fall-through; i18n.js would overwrite it. zip.js is the
     first file every ClioWorks codec load list names, so L exists with them before any file that calls L.N at load. */
  if (!L.N) L.N = (s) => s;
  if (!L.t) L.t = (s, ...a) => String(s).replace(/(\S)\|[A-Za-z][A-Za-z -]*$/, '$1').replace(/\{(\d+)\}/g, (m, i) => (a[i] != null ? a[i] : m));
  const te = new TextEncoder();
  const td = new TextDecoder('utf-8');

  /* ---------- CRC-32 ---------- */
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  /* ---------- pure-JS inflate (RFC 1951) ----------
     Derived from puff contrib/puff/puff.c (zlib licence): Mark Adler's puff.c translated to JavaScript and
     altered (typed arrays, a growing output buffer). This is an altered version, not the original puff. Its
     notice:

       Copyright (C) 2002-2013 Mark Adler, all rights reserved
       version 2.3, 21 Jan 2013

       This software is provided 'as-is', without any express or implied
       warranty.  In no event will the author be held liable for any damages
       arising from the use of this software.

       Permission is granted to anyone to use this software for any purpose,
       including commercial applications, and to alter it and redistribute it
       freely, subject to the following restrictions:

       1. The origin of this software must not be misrepresented; you must not
          claim that you wrote the original software. If you use this software
          in a product, an acknowledgment in the product documentation would be
          appreciated but is not required.
       2. Altered source versions must be plainly marked as such, and must not be
          misrepresented as being the original software.
       3. This notice may not be removed or altered from any source distribution.

       Mark Adler */
  const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  const DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  const DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  const CLORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

  function buildHuff(lengths, n) {
    const counts = new Uint16Array(16), offs = new Uint16Array(16), syms = new Uint16Array(n);
    for (let i = 0; i < n; i++) counts[lengths[i]]++;
    counts[0] = 0;
    for (let i = 1; i < 15; i++) offs[i + 1] = offs[i] + counts[i];
    for (let i = 0; i < n; i++) if (lengths[i]) syms[offs[lengths[i]]++] = i;
    return { counts, syms };
  }
  let FIXED_L = null, FIXED_D = null;
  function fixedTables() {
    if (FIXED_L) return;
    const l = new Uint8Array(288);
    for (let i = 0; i < 144; i++) l[i] = 8;
    for (let i = 144; i < 256; i++) l[i] = 9;
    for (let i = 256; i < 280; i++) l[i] = 7;
    for (let i = 280; i < 288; i++) l[i] = 8;
    FIXED_L = buildHuff(l, 288);
    const d = new Uint8Array(30).fill(5);
    FIXED_D = buildHuff(d, 30);
  }

  function inflateRawJS(data, sizeHint) {
    let pos = 0, bitbuf = 0, bitcnt = 0;
    let out = new Uint8Array(Math.max(1024, sizeHint || data.length * 4)), op = 0;
    const need = (n) => {
      if (op + n <= out.length) return;
      let sz = out.length * 2; while (sz < op + n) sz *= 2;
      const nb = new Uint8Array(sz); nb.set(out.subarray(0, op)); out = nb;
    };
    const bits = (n) => {
      while (bitcnt < n) {
        if (pos >= data.length) throw new Error('inflate: unexpected end of data');
        bitbuf |= data[pos++] << bitcnt; bitcnt += 8;
      }
      const v = bitbuf & ((1 << n) - 1);
      bitbuf >>>= n; bitcnt -= n;
      return v;
    };
    const decode = (h) => {
      let code = 0, first = 0, index = 0;
      for (let len = 1; len < 16; len++) {
        code |= bits(1);
        const count = h.counts[len];
        if (code - count < first) return h.syms[index + (code - first)];
        index += count; first += count; first <<= 1; code <<= 1;
      }
      throw new Error('inflate: bad code');
    };
    const codes = (lt, dt) => {
      for (;;) {
        let sym = decode(lt);
        if (sym < 256) { need(1); out[op++] = sym; }
        else if (sym === 256) return;
        else {
          sym -= 257;
          if (sym >= 29) throw new Error('inflate: bad length');
          const len = LBASE[sym] + bits(LEXT[sym]);
          const ds = decode(dt);
          const dist = DBASE[ds] + bits(DEXT[ds]);
          if (dist > op) throw new Error('inflate: distance too far');
          need(len);
          for (let i = 0; i < len; i++) { out[op] = out[op - dist]; op++; }
        }
      }
    };
    let last;
    do {
      last = bits(1);
      const type = bits(2);
      if (type === 0) {
        bitbuf = 0; bitcnt = 0;
        const len = data[pos] | (data[pos + 1] << 8);
        pos += 4;
        need(len);
        out.set(data.subarray(pos, pos + len), op);
        op += len; pos += len;
      } else if (type === 1) {
        fixedTables();
        codes(FIXED_L, FIXED_D);
      } else if (type === 2) {
        const nlen = bits(5) + 257, ndist = bits(5) + 1, ncode = bits(4) + 4;
        const cl = new Uint8Array(19);
        for (let i = 0; i < ncode; i++) cl[CLORDER[i]] = bits(3);
        const clh = buildHuff(cl, 19);
        const lens = new Uint8Array(nlen + ndist);
        let i = 0;
        while (i < nlen + ndist) {
          const sym = decode(clh);
          if (sym < 16) lens[i++] = sym;
          else {
            let rep = 0, val = 0;
            if (sym === 16) { if (!i) throw new Error('inflate: repeat with no prior'); val = lens[i - 1]; rep = 3 + bits(2); }
            else if (sym === 17) rep = 3 + bits(3);
            else rep = 11 + bits(7);
            while (rep--) lens[i++] = val;
          }
        }
        codes(buildHuff(lens.subarray(0, nlen), nlen), buildHuff(lens.subarray(nlen), ndist));
      } else throw new Error('inflate: bad block type');
    } while (!last);
    return out.slice(0, op);
  }

  async function streamThrough(data, stream) {
    const res = new Response(new Blob([data]).stream().pipeThrough(stream));
    return new Uint8Array(await res.arrayBuffer());
  }
  async function inflateRaw(data, size) {
    if (typeof DecompressionStream === 'function') {
      try { return await streamThrough(data, new DecompressionStream('deflate-raw')); } catch (e) { /* fall back */ }
    }
    return inflateRawJS(data, size);
  }
  async function deflateRaw(data) {
    if (typeof CompressionStream === 'function') {
      try { return await streamThrough(data, new CompressionStream('deflate-raw')); } catch (e) { /* store */ }
    }
    return null;
  }

  /* ---------- reader ---------- */
  /* crc: the CRC-32 the central directory records (undefined for an entry found by the repair path) */
  function makeEntry(u8, dv, name, method, csize, usize, loff, dataStart, crc, cen) {
    return {
      name, method, csize, usize, loff, crc, cen,
      async bytes() {
        if (this._cache) return this._cache;
        let start = dataStart;
        if (start == null) {
          const lh = this.loff;
          if (lh + 30 > u8.length || dv.getUint32(lh, true) !== 0x04034b50) throw new Error('Damaged entry ' + this.name);
          start = lh + 30 + dv.getUint16(lh + 26, true) + dv.getUint16(lh + 28, true);
        }
        const raw = u8.subarray(start, Math.min(u8.length, start + this.csize));
        let out;
        if (this.method === 0) out = raw.slice();
        else if (this.method === 8) out = await inflateRaw(raw, this.usize);
        else throw new Error('Unsupported compression method ' + this.method + ' in ' + this.name);
        this._cache = out;
        return out;
      },
      async text() { return td.decode(await this.bytes()); },
      /* ClioWorks deviation (documented): the entry's stored records, for write() to copy verbatim (part
         preservation): the whole local record (header, data, data descriptor) and the central directory record.
         null when the entry cannot be copied safely (repair-path entry, encrypted, zip64, truncated). */
      raw() {
        const lh = this.loff, cp = this.cen;
        if (cp == null || this.crc == null || lh + 30 > u8.length || dv.getUint32(lh, true) !== 0x04034b50) return null;
        const flags = dv.getUint16(lh + 6, true);
        const start = lh + 30 + dv.getUint16(lh + 26, true) + dv.getUint16(lh + 28, true);
        let end = start + this.csize;
        if (flags & 1 || end > u8.length || this.csize >= 0xffffffff || this.usize >= 0xffffffff) return null;
        if (flags & 8) end += end + 4 <= u8.length && dv.getUint32(end, true) === 0x08074b50 ? 16 : 12;
        const cend = cp + 46 + dv.getUint16(cp + 28, true) + dv.getUint16(cp + 30, true) + dv.getUint16(cp + 32, true);
        if (end > u8.length || cend > u8.length) return null;
        for (let xp = cp + 46 + dv.getUint16(cp + 28, true), xe = xp + dv.getUint16(cp + 30, true); xp + 4 <= xe; xp += 4 + dv.getUint16(xp + 2, true)) if (dv.getUint16(xp, true) === 1) return null;
        return { local: u8.subarray(lh, end), central: u8.subarray(cp, cend) };
      },
    };
  }
  const decodeName = (u8, flags) => (flags & 0x800 ? td.decode(u8) : Array.from(u8, (b) => String.fromCharCode(b)).join(''));
  function addEntry(files, entry) {
    if (entry.name.endsWith('/')) return;
    files.set(entry.name, entry);
    /* tolerate packages written with backslashes */
    const norm = entry.name.replace(/\\/g, '/');
    if (norm !== entry.name && !files.has(norm)) files.set(norm, entry);
  }
  function readCentral(u8, dv) {
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) return null;
    let count = dv.getUint16(eocd + 10, true);
    let cdOff = dv.getUint32(eocd + 16, true);
    /* ZIP64 end of central directory */
    if (cdOff === 0xffffffff || count === 0xffff) {
      const loc = eocd - 20;
      if (loc >= 0 && dv.getUint32(loc, true) === 0x07064b50) {
        const z64 = Number(dv.getBigUint64(loc + 8, true));
        count = Number(dv.getBigUint64(z64 + 32, true));
        cdOff = Number(dv.getBigUint64(z64 + 48, true));
      }
    }
    const files = new Map();
    let p = cdOff;
    for (let n = 0; n < count; n++) {
      if (p + 46 > u8.length || dv.getUint32(p, true) !== 0x02014b50) break;
      const flags = dv.getUint16(p + 8, true);
      const method = dv.getUint16(p + 10, true);
      const crc = dv.getUint32(p + 16, true);
      let csize = dv.getUint32(p + 20, true);
      let usize = dv.getUint32(p + 24, true);
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      let loff = dv.getUint32(p + 42, true);
      const name = decodeName(u8.subarray(p + 46, p + 46 + nlen), flags);
      /* zip64 extra field */
      let xp = p + 46 + nlen; const xend = Math.min(u8.length, xp + xlen);
      while (xp + 4 <= xend) {
        const id = dv.getUint16(xp, true), sz = dv.getUint16(xp + 2, true);
        if (id === 1) {
          let q = xp + 4;
          if (usize === 0xffffffff) { usize = Number(dv.getBigUint64(q, true)); q += 8; }
          if (csize === 0xffffffff) { csize = Number(dv.getBigUint64(q, true)); q += 8; }
          if (loff === 0xffffffff) { loff = Number(dv.getBigUint64(q, true)); }
        }
        xp += 4 + sz;
      }
      const cen = p;
      p += 46 + nlen + xlen + clen;
      addEntry(files, makeEntry(u8, dv, name, method, csize, usize, loff, undefined, crc, cen));
    }
    return files.size ? files : null;
  }
  /** Repair path: walk the local file headers when the central directory is missing or damaged. */
  function readLocal(u8, dv) {
    const files = new Map();
    let p = 0;
    while (p + 30 <= u8.length) {
      if (dv.getUint32(p, true) !== 0x04034b50) {
        /* resynchronise on the next local header */
        let q = p + 1;
        while (q + 4 <= u8.length && !(u8[q] === 0x50 && u8[q + 1] === 0x4b && u8[q + 2] === 0x03 && u8[q + 3] === 0x04)) q++;
        if (q + 30 > u8.length) break;
        p = q;
        continue;
      }
      const flags = dv.getUint16(p + 6, true), method = dv.getUint16(p + 8, true);
      let csize = dv.getUint32(p + 18, true), usize = dv.getUint32(p + 22, true);
      const nlen = dv.getUint16(p + 26, true), xlen = dv.getUint16(p + 28, true);
      const name = decodeName(u8.subarray(p + 30, p + 30 + nlen), flags);
      const start = p + 30 + nlen + xlen;
      let next = start + csize;
      if ((flags & 8) || csize === 0xffffffff || (csize === 0 && method === 8)) {
        /* sizes live in a trailing data descriptor: find one whose size field matches */
        let q = start, found = false;
        while (q + 16 <= u8.length) {
          if (u8[q] === 0x50 && u8[q + 1] === 0x4b) {
            const sig = dv.getUint32(q, true);
            if (sig === 0x08074b50 && dv.getUint32(q + 8, true) === q - start) { csize = q - start; usize = dv.getUint32(q + 12, true); next = q + 16; found = true; break; }
            if (sig === 0x04034b50 || sig === 0x02014b50) { csize = q - start; usize = 0; next = q; found = true; break; }
          }
          q++;
        }
        if (!found) { csize = u8.length - start; usize = 0; next = u8.length; }
      }
      if (start > u8.length) break;
      addEntry(files, makeEntry(u8, dv, name, method, csize, usize, p, start));
      p = Math.max(next, p + 30);
    }
    return files;
  }
  async function read(buffer) {
    const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (u8.length < 22) throw new Error('This file is not a valid Office Open XML (ZIP) package.');
    if (dv.getUint32(0, true) !== 0x04034b50) {
      if (dv.getUint32(0, true) === 0xe011cfd0) {
        /* OLE compound file: an encrypted OOXML package or a legacy binary .ppt */
        const probe = new TextDecoder('utf-16le').decode(u8.subarray(0, Math.min(u8.length, 1 << 20)));
        const enc = /EncryptedPackage/.test(probe);
        const err = new Error(enc
          ? 'This file is password-protected.'
          : 'This is a binary Office 97–2003 file, not an Office Open XML package.');
        err.code = 'ole';
        err.encrypted = enc;
        err.bytes = u8;
        throw err;
      }
    }
    let files = null;
    try { files = readCentral(u8, dv); } catch (e) { files = null; }
    if (!files) {
      try { files = readLocal(u8, dv); } catch (e) { files = null; }
      if (!files || !files.size) throw new Error(dv.getUint32(0, true) === 0x04034b50 ? 'This file is damaged and could not be repaired.' : 'This file is not a valid Office Open XML (ZIP) package.');
      files.repaired = true;
    }
    return files;
  }

  /* ---------- writer ---------- */
  function dosDateTime(d) {
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    return { time, date };
  }
  /** files: [{name, data: Uint8Array|string, store?: bool, raw?: entry.raw()}] → Blob
      ClioWorks deviation (documented): a file with `raw` is copied as stored (local record and central record byte
      for byte; only the central record's offset moves), so an untouched part keeps its container bytes too. */
  async function write(files, mime) {
    const parts = [];
    const central = [];
    let offset = 0;
    const { time, date } = dosDateTime(new Date());
    for (const f of files) {
      if (f.raw) {
        const ch = f.raw.central.slice();
        new DataView(ch.buffer).setUint32(42, offset, true);
        parts.push(f.raw.local);
        central.push(ch);
        offset += f.raw.local.length;
        continue;
      }
      const nameBytes = te.encode(f.name);
      const data = typeof f.data === 'string' ? te.encode(f.data) : f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data);
      const crc = crc32(data);
      let comp = null;
      if (!f.store && data.length > 64) comp = await deflateRaw(data);
      const method = comp && comp.length < data.length ? 8 : 0;
      const body = method === 8 ? comp : data;
      const lh = new Uint8Array(30 + nameBytes.length);
      const ldv = new DataView(lh.buffer);
      ldv.setUint32(0, 0x04034b50, true);
      ldv.setUint16(4, 20, true);
      ldv.setUint16(6, 0x0800, true);
      ldv.setUint16(8, method, true);
      ldv.setUint16(10, time, true);
      ldv.setUint16(12, date, true);
      ldv.setUint32(14, crc, true);
      ldv.setUint32(18, body.length, true);
      ldv.setUint32(22, data.length, true);
      ldv.setUint16(26, nameBytes.length, true);
      ldv.setUint16(28, 0, true);
      lh.set(nameBytes, 30);
      parts.push(lh, body);
      const ch = new Uint8Array(46 + nameBytes.length);
      const cdv = new DataView(ch.buffer);
      cdv.setUint32(0, 0x02014b50, true);
      cdv.setUint16(4, 20, true);
      cdv.setUint16(6, 20, true);
      cdv.setUint16(8, 0x0800, true);
      cdv.setUint16(10, method, true);
      cdv.setUint16(12, time, true);
      cdv.setUint16(14, date, true);
      cdv.setUint32(16, crc, true);
      cdv.setUint32(20, body.length, true);
      cdv.setUint32(24, data.length, true);
      cdv.setUint16(28, nameBytes.length, true);
      cdv.setUint32(42, offset, true);
      ch.set(nameBytes, 46);
      central.push(ch);
      offset += lh.length + body.length;
    }
    const cdSize = central.reduce((a, c) => a + c.length, 0);
    const end = new Uint8Array(22);
    const edv = new DataView(end.buffer);
    edv.setUint32(0, 0x06054b50, true);
    edv.setUint16(8, files.length, true);
    edv.setUint16(10, files.length, true);
    edv.setUint32(12, cdSize, true);
    edv.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end], { type: mime || 'application/zip' });
  }

  /* ---------- ClioWorks deviation (documented): part-level preservation after an edit ----------
     A three-way merge at part granularity. original = the file as opened; baseline = what the writer makes of the
     UNEDITED model; edited = what it makes of the edited model. A part the edit did not change (baseline and edited
     agree, byte for byte, including both lacking it) is taken from the original in its stored form (or stays absent,
     or stays present); only a part whose written bytes moved is taken from the writer. Re-serialising parts the edit
     never touched is what makes Office "repair" a file. The writer's numbering (relationship ids, style indices, ...)
     may differ from the original's, so a merged package is accepted only when consistent() finds every cross-part
     reference between kept and written parts intact; otherwise the writer's package stands.
     `patch(name, originalBytes)` may return new bytes for a part that is otherwise kept: a minimal edit of the
     original text that the codec's writer would make anyway (the Ledger adapter's recalculate-on-load request).
     Returns { buffer, kept, written } or null (nothing to keep, unreadable package, or the check failed). */
  async function partsOf(buffer) {
    const files = await read(buffer);
    if (files.repaired) throw new Error('repaired package');
    const out = new Map();
    for (const entry of new Set(files.values())) out.set(entry.name, entry);
    return out;
  }
  async function sameBytes(a, b) {
    if (!a || !b) return !a && !b;
    if (a.usize != null && b.usize != null && a.usize !== b.usize && a.crc != null) return false;
    const x = await a.bytes(), y = await b.bytes();
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
    return true;
  }
  /* The consistency check, without the codec: what can break when original parts and written parts meet is a
     cross-part reference the writer renumbered. Three families are checked (generic OPC plus the identifiers the
     three formats share across parts):
       relationships  a written part keeps an original .rels only if every relationship it was written against is in
                      that .rels unchanged (and the other way round), and no relationship dangles that did not before;
       content types  every part keeps the content type its own package gave it;
       identities     definitions referred to from another part (comment, note, list, style, number-format, sheet,
                      author and slide ids; positional shared strings and cell formats; paragraph ids) — a kept part
                      that the writer would write differently must define every identity the writer's version does,
                      with the same content; a written part must still define every identity the original did. */
  const IDENTITY_ATTRS = { comment: 'id', footnote: 'id', endnote: 'id', num: 'numId', abstractNum: 'abstractNumId', style: 'styleId', numFmt: 'numFmtId', sheet: 'sheetId', cmAuthor: 'id', author: 'id', sldId: 'id', sldMasterId: 'id' };
  const POSITIONAL = { 'sst/si': 1, 'cellXfs/xf': 1, 'cellStyleXfs/xf': 1, 'dxfs/dxf': 1 };
  const PRINT_ATTRS = ['numFmtId', 'fontId', 'fillId', 'borderId', 'xfId', 'formatCode', 'name'];
  const TAG_RE = /<(\/?)(?:[\w.-]+:)?([\w.-]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<!\[CDATA\[([\s\S]*?)\]\]>|<[!?][\s\S]*?>/g;
  /* an attribute by local name, any prefix but r: (r:id is a relationship, not an identity) */
  const attrOf = (attrs, local) => { const m = new RegExp('(?:^|\\s)(?:(?!r:)[\\w.-]+:)?' + local + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')').exec(attrs); return m ? (m[1] != null ? m[1] : m[2]) : null; };
  /* text content for comparison: entities decoded, whitespace (indentation of a pretty-printed original) ignored */
  const plain = (t) => t.replace(/&(?:#x([0-9a-f]+)|#(\d+)|(amp|lt|gt|quot|apos));/gi, (all, hex, dec, name) => (hex ? String.fromCodePoint(parseInt(hex, 16)) : dec ? String.fromCodePoint(+dec) : { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[name.toLowerCase()])).replace(/\s+/g, '');
  function identities(text) {
    const out = new Map(), stack = [], counts = new Map();
    let open = 0, last = 0, m;
    TAG_RE.lastIndex = 0;
    while ((m = TAG_RE.exec(text))) {
      if (open && m.index > last) { const t = text.slice(last, m.index); for (const f of stack) if (f.key && f.withText) f.text += t; }
      last = TAG_RE.lastIndex;
      if (m[5] != null) { if (open) for (const f of stack) if (f.key && f.withText) f.text += m[5]; continue; }
      if (!m[2]) continue;
      if (m[1]) { const f = stack.pop(); if (f && f.key) { open--; out.set(f.key, f.print + '|' + plain(f.text)); } continue; }
      const local = m[2], attrs = m[3] || '';
      const parent = stack.length ? stack[stack.length - 1].local : '';
      let key = null;
      if (POSITIONAL[parent + '/' + local]) { const c = (counts.get(stack.length + parent) || 0); counts.set(stack.length + parent, c + 1); key = parent + '/' + local + '[' + c + ']'; }
      else if (IDENTITY_ATTRS[local]) { const v = attrOf(attrs, IDENTITY_ATTRS[local]); if (v != null) key = local + '#' + v; }
      else if (local === 'p' && stack.some((f) => f.local === 'comment')) { const v = attrOf(attrs, 'paraId'); if (v != null) key = 'p#' + v; }
      const print = key ? PRINT_ATTRS.map((a) => attrOf(attrs, a) || '').join(',') : '';
      if (m[4]) { if (key) out.set(key, print + '|'); continue; }
      if (key) open++;
      stack.push({ local, key, print, text: '', withText: !!key && local !== 'p' });
    }
    return out;
  }
  function relsOf(text, relsName) {
    const dir = relsName.replace(/(^|\/)_rels\/[^/]*$/, '$1');
    const out = new Map();
    for (const m of text.matchAll(/<(?:[\w.-]+:)?Relationship\b([^>]*)>/g)) {
      const id = attrOf(m[1], 'Id'), type = attrOf(m[1], 'Type') || '', mode = attrOf(m[1], 'TargetMode') || '';
      let target = attrOf(m[1], 'Target') || '';
      if (mode !== 'External') {
        target = target.split('#')[0];
        const parts = (target.startsWith('/') ? target.slice(1) : dir + target).split('/'), norm = [];
        for (const p of parts) { if (p === '..') norm.pop(); else if (p && p !== '.') norm.push(p); }
        try { target = decodeURIComponent(norm.join('/')); } catch (e) { target = norm.join('/'); }
      }
      out.set(id, type + '|' + mode + '|' + target);
    }
    return out;
  }
  function typesOf(text) {
    const defaults = new Map(), overrides = new Map();
    for (const m of text.matchAll(/<(?:[\w.-]+:)?Default\b([^>]*)>/g)) defaults.set((attrOf(m[1], 'Extension') || '').toLowerCase(), attrOf(m[1], 'ContentType'));
    for (const m of text.matchAll(/<(?:[\w.-]+:)?Override\b([^>]*)>/g)) overrides.set((attrOf(m[1], 'PartName') || '').replace(/^\//, '').toLowerCase(), attrOf(m[1], 'ContentType'));
    return (name) => overrides.get(name.toLowerCase()) || defaults.get((name.split('.').pop() || '').toLowerCase()) || null;
  }
  const relsOwner = (name) => { const m = /^(.*?)_rels\/([^/]*)\.rels$/.exec(name); return m ? m[1] + m[2] : null; };
  const isXml = (name) => /\.(xml|rels|vml)$/i.test(name);
  async function consistent(O, W, from, names) {
    const text = async (pkg, name) => { const e = pkg.get(name); return e && isXml(name) ? td.decode(await e.bytes()) : null; };
    const pkgOf = (name) => (from.get(name) === 'W' ? W : O);
    const differs = async (name) => !(await sameBytes(O.get(name), W.get(name)));
    /* relationships */
    for (const name of names) {
      if (!name.endsWith('.rels')) continue;
      const owner = relsOwner(name);
      if (owner == null || !from.has(owner) || from.get(owner) === from.get(name) || !(await differs(name))) continue;
      const mine = relsOf(await text(pkgOf(name), name) || '', name);
      const needed = relsOf(await text(pkgOf(owner), name) || '', name);
      const ownerText = await text(pkgOf(owner), owner) || '';
      /* only ids the owner names; implicit relationships (styles, settings, theme...) are found by type */
      for (const [id, rel] of needed) if (mine.get(id) !== rel && (ownerText.includes('"' + id + '"') || ownerText.includes("'" + id + "'"))) return 'relationship ' + id + ' of ' + owner;
    }
    const exists = (pkg, target) => pkg.has(target);
    for (const name of names) {
      if (!name.endsWith('.rels')) continue;
      const rels = relsOf(await text(pkgOf(name), name) || '', name);
      for (const rel of rels.values()) {
        const [, mode, target] = rel.split('|');
        if (mode === 'External' || !target || names.has(target)) continue;
        if (!exists(pkgOf(name), target)) continue; /* already dangling in its own package */
        return 'dangling ' + target;
      }
    }
    /* content types */
    const ctName = '[Content_Types].xml';
    if (from.has(ctName) && await differs(ctName)) {
      const final = typesOf(await text(pkgOf(ctName), ctName) || '');
      const typeO = typesOf(await text(O, ctName) || ''), typeW = typesOf(await text(W, ctName) || '');
      for (const name of names) {
        if (name === ctName) continue;
        const own = (from.get(name) === 'W' ? typeW : typeO)(name);
        if (own && final(name) !== own) return 'content type of ' + name;
      }
    }
    /* identities: only those the other side actually names (an attribute value in its parts) can break */
    const named = async (side) => {
      const values = new Set();
      for (const name of names) if (from.get(name) === side && isXml(name) && !name.endsWith('.rels')) {
        for (const m of (await text(side === 'W' ? W : O, name) || '').matchAll(/=\s*(?:"([^"]*)"|'([^']*)')/g)) values.add(m[1] != null ? m[1] : m[2]);
      }
      return values;
    };
    let byWritten = null, byKept = null;
    const valueOf = (key) => { const i = key.indexOf('#'); return i >= 0 ? key.slice(i + 1) : key.slice(key.lastIndexOf('[') + 1, -1); };
    for (const name of names) {
      if (!isXml(name) || name.endsWith('.rels') || !O.has(name) || !W.has(name) || !(await differs(name))) continue;
      const o = identities(await text(O, name)), w = identities(await text(W, name));
      if (from.get(name) === 'W') {
        /* written: every identity the kept parts name is still defined (the edit may change its content) */
        byKept = byKept || await named('O');
        for (const key of o.keys()) if (!w.has(key) && byKept.has(valueOf(key))) return 'identity ' + key + ' gone from ' + name;
      } else {
        /* kept: every identity the written parts name is defined here, with the content the writer gave it */
        byWritten = byWritten || await named('W');
        for (const [key, print] of w) if (o.get(key) !== print && byWritten.has(valueOf(key))) return 'identity ' + key + ' differs in ' + name;
      }
    }
    return '';
  }

  async function preserveUntouched({ original, baseline, edited, mime, patch }) {
    try {
      const O = await partsOf(original), B = await partsOf(baseline), W = await partsOf(edited);
      const files = [], kept = [], written = [], from = new Map();
      for (const [name, o] of O) {
        const b = B.get(name), w = W.get(name);
        if (await sameBytes(b, w)) {
          const patched = patch ? await patch(name, await o.bytes()) : null;
          from.set(name, 'O');
          if (patched) { files.push({ name, data: patched }); written.push(name); continue; }
          const raw = o.raw();
          if (raw) files.push({ name, raw }); else files.push({ name, data: await o.bytes() });
          kept.push(name);
        } else if (w) { files.push({ name, data: await w.bytes() }); written.push(name); from.set(name, 'W'); }
        else written.push('-' + name);
      }
      for (const [name, w] of W) {
        if (O.has(name)) continue;
        if (await sameBytes(B.get(name), w)) continue; /* the writer adds it whether or not the edit happened */
        files.push({ name, data: await w.bytes() });
        written.push('+' + name);
        from.set(name, 'W');
      }
      if (!kept.length) return null;
      /* nothing the edit made differs from the unedited write (an edit undone): the original file stands */
      if (!written.length) return { buffer: original instanceof Uint8Array ? original.slice().buffer : original.slice(0), kept, written };
      if (await consistent(O, W, from, new Set(from.keys()))) return null;
      return { buffer: await (await write(files, mime)).arrayBuffer(), kept, written };
    } catch (e) {
      return null;
    }
  }

  /* The baseline write for preserveUntouched, kept off the save path: taken once, while `unchanged()` holds (no edit
     yet), in idle time in a browser (requestIdleCallback, else a short timer) and at once where there is no frame
     loop (tests, node). A save before it is ready gets null and saves as the plain writer does. A save while it is
     being written waits for that one write, so two writes never run interleaved over the codec's shared state. */
  function idleBaseline(writeBaseline, unchanged) {
    let value = null, running = null, tried = false;
    const run = () => {
      if (tried || !unchanged()) return running;
      tried = true;
      running = Promise.resolve().then(writeBaseline).then((b) => { if (unchanged()) value = b; }, () => {}).then(() => { running = null; });
      return running;
    };
    return {
      schedule() {
        if (typeof requestIdleCallback === 'function') requestIdleCallback(() => run(), { timeout: 2000 });
        else if (typeof requestAnimationFrame === 'function') setTimeout(run, 250);
        else return run();
        return null;
      },
      async get() { if (running) await running; return value; },
    };
  }

  L.zip = { read, write, crc32, inflateRawJS, encode: (s) => te.encode(s), decode: (b) => td.decode(b), preserveUntouched, idleBaseline };
})(typeof window !== 'undefined' ? window : globalThis);
