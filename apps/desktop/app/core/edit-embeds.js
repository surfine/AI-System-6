// @ts-check
// Edit kernel: one envelope for anything one editor puts into another's page.
//
// A ClioStage page used to carry a drawing three different ways — a
// clio-diagram-data comment (editable), a clio-diagram outline comment and a
// clio-chart table comment (both read-only) — and a page sent from ClioChart
// was marked so the whole deck could not be edited. Now every embed is the
// picture plus one comment:
//
//   ![alt](data:image/svg+xml;base64,…)
//
//   <!-- clio-embed diagram: <base64 JSON envelope> -->
//
// The envelope is { v: 1, kind, data, source? }:
//   kind    diagram | chart | cover | sketch — which editor opens it;
//   data    the editor's own document, a copy (owner's decision 2026-10-09:
//           an embed is a copy with a link back, never a live reference);
//   source  { app, fileId, ref, rev, kept } — where the copy came from (a
//           saved diagram, a DocMap branch, a ClioProject plan, a table), the
//           content hash it was copied at, and the hash the writer chose to
//           keep the copy at. A changed original is offered, never applied.
//
// The picture is redrawn from data on every edit, so a deck read anywhere
// (Marp, a print, a plain Markdown viewer) still shows the drawing. Older
// pages keep working: their comments are read as embeds of the same kinds.
//
// Pure: no DOM, no translations. The executable contract runs it bare.

(function installEditEmbeds(root) {
  if (root.AISystem6EditEmbeds) return;

  const EMBED_KINDS = Object.freeze(["diagram", "chart", "cover", "sketch"]);
  const EMBED_COMMENT = /<!--\s*clio-embed\s+([a-z]+):\s*([A-Za-z0-9+/=]+)\s*-->/g;
  const LEGACY_DIAGRAM = /<!--\s*clio-diagram-data:\s*([A-Za-z0-9+/=]+)\s*-->/g;
  const LEGACY_CHART = /<!--\s*clio-chart:\s*([\s\S]*?)\s*-->/g;
  const IMAGE = /!\[([^\]]*)\]\(data:image\/(?:svg\+xml|png|jpeg|webp);base64,[A-Za-z0-9+/=]+\)/g;

  function toBase64(text) {
    const bytes = new TextEncoder().encode(String(text));
    let binary = "";
    for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
    return btoa(binary);
  }

  function fromBase64(encoded) {
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new TextDecoder().decode(bytes);
  }

  /** A short content hash (FNV-1a, 32 bit) — enough to notice that an original changed. */
  function contentRev(value) {
    const text = typeof value === "string" ? value : JSON.stringify(value ?? null);
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(36);
  }

  // The picture an embed belongs to is the last data-URL image before its
  // comment on the same page.
  function imageBefore(page, at) {
    let found = null;
    IMAGE.lastIndex = 0;
    let match;
    while ((match = IMAGE.exec(page)) && match.index < at) found = { alt: match[1], start: match.index, end: match.index + match[0].length };
    return found;
  }

  /**
   * Every embed on a page, in order: { kind, data, source, legacy, start, end, image }.
   * start / end cover the comment; image covers the picture it labels (or null).
   * @param {string} page
   */
  function parseEmbeds(page = "") {
    const text = String(page || "");
    const embeds = [];
    const push = (entry) => embeds.push({ ...entry, image: imageBefore(text, entry.start) });
    for (const match of text.matchAll(EMBED_COMMENT)) {
      try {
        const envelope = JSON.parse(fromBase64(match[2]));
        if (!EMBED_KINDS.includes(envelope?.kind) || envelope.kind !== match[1]) continue;
        push({ kind: envelope.kind, data: envelope.data, source: envelope.source || null, legacy: false, start: match.index, end: match.index + match[0].length });
      } catch {
        // An envelope that does not decode is left alone, never guessed at.
      }
    }
    for (const match of text.matchAll(LEGACY_DIAGRAM)) {
      try {
        const data = JSON.parse(fromBase64(match[1]));
        if (Array.isArray(data?.nodes)) push({ kind: "diagram", data, source: null, legacy: true, start: match.index, end: match.index + match[0].length });
      } catch {
        // as above
      }
    }
    for (const match of text.matchAll(LEGACY_CHART)) {
      // The old chart comment carried the source table with its line breaks
      // folded to " / ": unfold it back into the Markdown table it was.
      const table = match[1].split(" / ").join("\n").replace(/—/g, "--");
      if (/^\s*\|/m.test(table)) push({ kind: "chart", data: { markdown: table }, source: null, legacy: true, start: match.index, end: match.index + match[0].length });
    }
    return embeds.sort((left, right) => left.start - right.start);
  }

  function embedComment(kind, data, source = null) {
    if (!EMBED_KINDS.includes(kind)) throw new Error(`edit embeds: unknown kind ${kind}`);
    const envelope = { v: 1, kind, data, ...(source ? { source } : {}) };
    return `<!-- clio-embed ${kind}: ${toBase64(JSON.stringify(envelope))} -->`;
  }

  /**
   * The Markdown for a new embed: the picture, a blank line, the comment.
   * @param {{ kind: string, alt?: string, svg?: string, png?: string, data: any, source?: any }} spec
   */
  function embedMarkdown({ kind, alt = "", svg = "", png = "", data, source = null }) {
    const picture = svg
      ? `data:image/svg+xml;base64,${toBase64(svg)}`
      : String(png || "");
    const label = String(alt || "").replace(/[[\]]/g, "");
    return `![${label}](${picture})\n\n${embedComment(kind, data, source)}`;
  }

  /**
   * The page with one embed rewritten: new data (and so a new picture), and
   * the source updated when given. Legacy embeds come back in the new form.
   * @param {string} page
   * @param {number} index which embed on the page
   * @param {{ data: any, svg?: string, png?: string, source?: any }} next
   */
  function replaceEmbed(page, index, next) {
    const text = String(page || "");
    const embed = parseEmbeds(text)[index];
    if (!embed) return null;
    const source = next.source === undefined ? embed.source : next.source;
    const comment = embedComment(embed.kind, next.data, source);
    let out = `${text.slice(0, embed.start)}${comment}${text.slice(embed.end)}`;
    if (embed.image && (next.svg || next.png)) {
      const picture = next.svg ? `data:image/svg+xml;base64,${toBase64(next.svg)}` : String(next.png);
      out = `${out.slice(0, embed.image.start)}![${embed.image.alt}](${picture})${out.slice(embed.image.end)}`;
    }
    return out;
  }

  /**
   * Does the original still match the copy? "current" when it does (or the
   * embed has no original), "changed" when it moved on since the copy (and
   * since the writer last chose to keep it), "missing" when it is gone.
   * @param {any} embed
   * @param {string | null} currentRev the original's rev now, or null when it no longer exists
   */
  function sourceState(embed, currentRev) {
    const source = embed?.source;
    if (!source?.rev) return "current";
    if (currentRev === null) return "missing";
    if (currentRev === source.rev || currentRev === source.kept) return "current";
    return "changed";
  }

  root.AISystem6EditEmbeds = Object.freeze({
    EMBED_KINDS,
    parseEmbeds,
    embedComment,
    embedMarkdown,
    replaceEmbed,
    sourceState,
    contentRev,
    toBase64,
    fromBase64,
  });
})(typeof window !== "undefined" ? window : globalThis);
