// locator.js — maps spoken text back to where it lives in the live page, so the
// sentence being read can be highlighted.
//
// The speech queue is built from filtered *clones* of the article, so a chunk
// of text has no link to the real DOM. The locator rebuilds that link:
//
//   1. For each content node, clone it and pair every clone text node with its
//      live twin (cloneNode(true) preserves structure, so a parallel walk lines
//      them up).
//   2. Run the real filter (filters.cleanClone) on that same clone. Whatever
//      survives is exactly what can be spoken, and each surviving text node
//      still knows its live twin. No filter selectors are duplicated here.
//   3. Concatenate the surviving text, drop the footnote markers the filter
//      drops, and ignore whitespace (the chunker normalizes and sometimes
//      re-spaces text). locate(text) then finds each chunk in that stream, in
//      order, and returns the live start/end positions.
//
// A location is { sn, so, en, eo } (start node/offset, end node/offset) in the
// live DOM. Plain objects rather than Range objects: live Ranges are updated on
// every DOM mutation, so creating hundreds up front would slow the page.
//
// Pure DOM — no extension APIs — so it runs in the content script and in jsdom.
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.WikiReader = root.WikiReader || {};
  root.WikiReader.locator = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const TEXT_NODE = 3;
  const SHOW_TEXT = 4; // NodeFilter.SHOW_TEXT

  // Record clone text node -> live text node.
  function pairTextNodes(live, clone, pairs) {
    if (live.nodeType === TEXT_NODE) {
      pairs.set(clone, live);
      return;
    }
    const a = live.childNodes;
    const b = clone.childNodes;
    for (let i = 0; i < a.length; i++) pairTextNodes(a[i], b[i], pairs);
  }

  // Concatenate the speakable text of the content nodes, remembering which live
  // text node each stretch came from.
  function buildStream(contentNodes, filters, filterCfg) {
    const f = filters.mergeFilters(filterCfg);
    const segments = []; // { node, start, length } in stream coordinates
    const parts = [];
    let pos = 0;
    for (const live of contentNodes || []) {
      if (!live || live.nodeType !== 1) continue;
      if (filters.nodeIsFilteredOut(live, f)) continue;
      const clone = live.cloneNode(true);
      const pairs = new Map();
      pairTextNodes(live, clone, pairs);
      filters.cleanClone(clone, f);
      const walker = clone.ownerDocument.createTreeWalker(clone, SHOW_TEXT);
      let t;
      while ((t = walker.nextNode())) {
        const source = pairs.get(t);
        if (!source || !t.data) continue;
        segments.push({ node: source, start: pos, length: t.data.length });
        parts.push(t.data);
        pos += t.data.length;
      }
      parts.push(" "); // content nodes are joined with a space when spoken
      pos += 1;
    }
    return { raw: parts.join(""), segments, filters: f };
  }

  // Create a locator for one section's content nodes.
  //   deps.filters — the filters module (required)
  // Returns { locate(text) -> location | null }. Call locate() with chunk texts
  // in speaking order; it keeps a cursor so repeated sentences resolve to the
  // right occurrence.
  function createLocator(contentNodes, filterCfg, deps) {
    const filters = deps && deps.filters;
    if (!filters) throw new Error("createLocator requires deps.filters");
    const { raw, segments, filters: f } = buildStream(contentNodes, filters, filterCfg);

    // Characters that are never spoken: footnote markers left as plain text.
    const dropped = new Uint8Array(raw.length);
    if (f.footnote) {
      const re = new RegExp(filters.FOOTNOTE_TEXT_RE.source, "gi");
      for (const m of raw.matchAll(re)) {
        dropped.fill(1, m.index, m.index + m[0].length);
      }
    }

    // Compact form: only the non-space, non-dropped characters, with a map from
    // each compact position back to its position in the raw stream.
    const kept = [];
    const rawIndex = [];
    for (let i = 0; i < raw.length; i++) {
      if (dropped[i] || /\s/.test(raw[i])) continue;
      kept.push(raw[i]);
      rawIndex.push(i);
    }
    const compact = kept.join("");

    // Raw stream position -> (live text node, offset), by binary search.
    function resolve(position) {
      let lo = 0;
      let hi = segments.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (segments[mid].start <= position) lo = mid;
        else hi = mid - 1;
      }
      const seg = segments[lo];
      return { node: seg.node, offset: position - seg.start };
    }

    let cursor = 0;
    function locate(text) {
      const needle = String(text || "").replace(/\s+/g, "");
      if (!needle || segments.length === 0) return null;
      // Chunks tile the stream in order, so the match is normally right at the
      // cursor; fall back to searching ahead if something was skipped.
      const at = compact.startsWith(needle, cursor)
        ? cursor
        : compact.indexOf(needle, cursor);
      if (at < 0) return null;
      cursor = at + needle.length;
      const start = resolve(rawIndex[at]);
      const end = resolve(rawIndex[at + needle.length - 1]);
      return { sn: start.node, so: start.offset, en: end.node, eo: end.offset + 1 };
    }

    return { locate };
  }

  return { createLocator };
});
