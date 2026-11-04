// filters.js — pure functions that turn a section's content nodes into clean,
// speakable sentence chunks, applying per-category filters.
//
// Filter categories (each independently toggleable):
//   infobox  — table.infobox and similar metadata boxes
//   table    — all other tables (wikitable, etc.)
//   caption  — figure/image captions (figcaption, .thumbcaption)
//   math     — rendered math (.mwe-math-element)
//   footnote — inline reference markers (sup.reference) and bracketed [1] text
//
// The functions operate on cloned nodes so the live page DOM is never mutated.
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.WikiReader = root.WikiReader || {};
  root.WikiReader.filters = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  // Silent gap after each list item, in ms (shorter than the post-heading gap).
  const DEFAULT_ITEM_PAUSE_MS = 450;

  const DEFAULT_FILTERS = {
    infobox: true,
    table: true,
    caption: true,
    math: true,
    footnote: true,
    code: true,
  };

  // Selectors removed from a cloned subtree, keyed by filter category.
  // code: syntax-highlighted blocks (SyntaxHighlight extension -> .mw-highlight),
  //       preformatted/source blocks (<pre>), and <code> elements. We match the
  //       <code> tag itself, not the .mw-code class, which Wikipedia also puts
  //       on markup that is not code.
  const REMOVAL_SELECTORS = {
    infobox: ["table.infobox", ".infobox", ".sidebar", ".navbox", ".vcard"],
    table: ["table"],
    caption: ["figcaption", ".thumbcaption", ".thumb", "figure"],
    math: [".mwe-math-element", "math"],
    footnote: ["sup.reference", "sup.noprint", ".mw-ref", ".reference"],
    code: [".mw-highlight", "pre", "code", "syntaxhighlight", ".mw-geshi"],
  };

  // Structural noise always removed regardless of toggles.
  // .shortdescription is Wikipedia's hidden one-line page summary injected at
  // the top of the article; it should never be read before the real intro.
  const ALWAYS_REMOVE = [
    ".mw-editsection",
    "style",
    "script",
    ".hatnote",
    ".mw-empty-elt",
    "#coordinates",
    ".shortdescription",
    ".nomobile",
  ];

  // Private-use marker appended to the end of every list item so item
  // boundaries survive the flatten-to-text step. List items rarely end in
  // punctuation, so without it "Apples" / "Pears" would run together as one
  // phrase with no audible break.
  // ITEM_START marks where an item begins (a boundary, no pause) so a short
  // item is never merged into the text before it; ITEM_BREAK marks where it
  // ends (a boundary, plus a pause).
  const ITEM_BREAK = "\uE000";
  const ITEM_START = "\uE001";
  const MARKERS = /[\uE000\uE001]/g;

  // Bracketed footnote markers that survive as plain text: "[1]", "[12]",
  // "[a]", "[citation needed]". Shared with the locator so both agree on which
  // characters are never spoken.
  const FOOTNOTE_TEXT_RE = /\[\s*(?:\d+|[a-z]|citation needed|note \d+)\s*\]/gi;

  function mergeFilters(filters) {
    return Object.assign({}, DEFAULT_FILTERS, filters || {});
  }

  function isElement(node) {
    return node && node.nodeType === 1;
  }

  // Whether a top-level content node should be dropped entirely based on what
  // it *is* (e.g. the node itself is an infobox table or a figure).
  function nodeIsFilteredOut(node, filters) {
    if (!isElement(node)) return false;
    const el = node;
    const matches = (sel) => el.matches && el.matches(sel);
    // Always-removed structural noise, regardless of the toggle config. This
    // covers a top-level <style>/<script> (whose textContent is raw CSS/JS,
    // e.g. the TemplateStyles blocks around blockquotes), .shortdescription,
    // .hatnote, etc. — the same selectors stripped as descendants below.
    if (ALWAYS_REMOVE.some((sel) => matches(sel))) {
      return true;
    }
    if (filters.infobox && (matches("table.infobox") || matches(".infobox") || matches(".navbox") || matches(".sidebar"))) {
      return true;
    }
    if (filters.table && matches("table")) return true;
    if (filters.caption && (matches("figure") || matches("figcaption"))) {
      return true;
    }
    if (filters.math && matches(".mwe-math-element")) return true;
    if (
      filters.code &&
      (matches(".mw-highlight") || matches("pre") || matches("code"))
    ) {
      return true;
    }
    return false;
  }

  // Strip disallowed descendants from an already-cloned node, in place.
  function cleanClone(clone, filters) {
    if (!isElement(clone)) return clone;

    const selectors = [...ALWAYS_REMOVE];
    for (const cat of Object.keys(REMOVAL_SELECTORS)) {
      if (filters[cat]) selectors.push(...REMOVAL_SELECTORS[cat]);
    }
    // Remove matching descendants.
    selectors.forEach((sel) => {
      clone.querySelectorAll(sel).forEach((n) => n.remove());
    });
    return clone;
  }

  // Clone a node and strip disallowed descendants per the filter config.
  function cleanNode(node, filters) {
    return cleanClone(node.cloneNode(true), filters);
  }

  // Extract text from the surviving content nodes of one section, keeping an
  // ITEM_BREAK marker after each <li>. Internal; see sectionText for the
  // marker-free version.
  function sectionTextWithBreaks(contentNodes, filters) {
    const f = mergeFilters(filters);
    const parts = [];
    for (const node of contentNodes || []) {
      if (nodeIsFilteredOut(node, f)) continue;
      const cleaned = cleanNode(node, f);
      if (isElement(cleaned)) {
        const doc = cleaned.ownerDocument;
        cleaned.querySelectorAll("li").forEach((li) => {
          // Speak a parent item's own text, then pause, before its sub-list.
          Array.from(li.children)
            .filter((c) => c.tagName === "UL" || c.tagName === "OL")
            .forEach((sub) => li.insertBefore(doc.createTextNode(ITEM_BREAK), sub));
          li.insertBefore(doc.createTextNode(ITEM_START), li.firstChild);
          li.appendChild(doc.createTextNode(ITEM_BREAK));
        });
      }
      const text = cleaned.textContent || "";
      if (text.replace(MARKERS, "").trim()) parts.push(text);
    }
    let joined = parts.join(" ");
    // Remove any bracketed footnote markers that slipped through as plain text
    // (e.g. "[1]", "[12]", "[a]", "[citation needed]").
    if (f.footnote) {
      joined = joined.replace(FOOTNOTE_TEXT_RE, "");
    }
    return normalizeWhitespace(joined);
  }

  // Extract normalized plain text from the surviving content nodes of one
  // section (list-item markers become spaces).
  function sectionText(contentNodes, filters) {
    return normalizeWhitespace(
      sectionTextWithBreaks(contentNodes, filters).replace(MARKERS, " ")
    );
  }

  function normalizeWhitespace(s) {
    return (s || "")
      .replace(/\u00a0/g, " ") // non-breaking spaces
      .replace(/\s+/g, " ")
      .trim();
  }

  // Split prose into sentence-sized chunks. Keeps sentence-ending punctuation,
  // avoids splitting on common abbreviations, and merges very short fragments.
  function chunkIntoSentences(text, opts) {
    const options = Object.assign({ maxChars: 240, minChars: 12 }, opts || {});
    const normalized = normalizeWhitespace(text);
    if (!normalized) return [];

    // Protect a few abbreviations from being treated as sentence ends.
    const protectedText = normalized
      .replace(/(\d)\.(?=\d)/g, "$1\u0001") // decimal points: version 1.0, 3.14
      .replace(/\b([A-Z])\.\s/g, "$1\u0001 ") // single initials: J. Smith
      .replace(/\b(Mr|Mrs|Ms|Dr|Prof|St|vs|etc|e\.g|i\.e|No|Vol|pp|cf)\.\s/gi, "$1\u0001 ");

    const rawSentences = protectedText.match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g) || [
      protectedText,
    ];

    const restore = (s) => s.replace(/\u0001/g, ".");

    const chunks = [];
    let buffer = "";
    for (let sentence of rawSentences) {
      sentence = restore(sentence).trim();
      if (!sentence) continue;

      // Split overly long sentences on clause boundaries to stay under maxChars.
      if (sentence.length > options.maxChars) {
        // Emit the sentence waiting in the buffer first; dropping it would
        // silently skip text and put the long sentence out of order.
        if (buffer) pushChunk(chunks, buffer, options);
        buffer = "";
        const pieces = splitLong(sentence, options.maxChars);
        for (const p of pieces) pushChunk(chunks, p, options);
        continue;
      }

      if (buffer && (buffer.length + sentence.length + 1) <= options.minChars) {
        buffer = `${buffer} ${sentence}`.trim();
      } else {
        if (buffer) pushChunk(chunks, buffer, options);
        buffer = sentence;
      }
    }
    if (buffer) pushChunk(chunks, buffer, options);
    return chunks;
  }

  function pushChunk(chunks, text, options) {
    const t = normalizeWhitespace(text);
    if (!t) return;
    // Merge a too-short trailing fragment into the previous chunk.
    if (chunks.length && t.length < options.minChars) {
      chunks[chunks.length - 1] = `${chunks[chunks.length - 1]} ${t}`;
    } else {
      chunks.push(t);
    }
  }

  function splitLong(sentence, maxChars) {
    const clauses = sentence.split(/(?<=[,;:])\s+/);
    const out = [];
    let buf = "";
    for (const clause of clauses) {
      if (!buf) {
        buf = clause;
      } else if ((buf.length + clause.length + 1) <= maxChars) {
        buf = `${buf} ${clause}`;
      } else {
        out.push(buf);
        buf = clause;
      }
      // Hard wrap any single clause that is still too long.
      while (buf.length > maxChars) {
        out.push(buf.slice(0, maxChars));
        buf = buf.slice(maxChars);
      }
    }
    if (buf) out.push(buf);
    return out;
  }

  // Full pipeline for one section: nodes -> clean text -> sentence chunks.
  function sectionToChunks(contentNodes, filters, chunkOpts) {
    return chunkIntoSentences(sectionText(contentNodes, filters), chunkOpts);
  }

  // Like sectionToChunks, but returns { text, pauseAfterMs? } items: the last
  // chunk of every list item carries `pauseAfterMs` so the speech engine
  // leaves an audible gap between items. Each item is chunked on its own, so a
  // short item is never merged into its neighbour (which would lose the gap).
  function sectionToItems(contentNodes, filters, chunkOpts, itemPauseMs) {
    const pause = itemPauseMs == null ? DEFAULT_ITEM_PAUSE_MS : itemPauseMs;
    // Splitting on a capture group keeps the delimiters: [text, marker, text, ...].
    const tokens = sectionTextWithBreaks(contentNodes, filters).split(
      /([\uE000\uE001])/
    );
    const items = [];
    for (const token of tokens) {
      if (token === ITEM_BREAK) {
        // Pause after the most recent chunk, if anything has been spoken yet.
        if (pause > 0 && items.length > 0) items[items.length - 1].pauseAfterMs = pause;
      } else if (token !== ITEM_START) {
        chunkIntoSentences(token, chunkOpts).forEach((text) => items.push({ text }));
      }
    }
    return items;
  }

  return {
    DEFAULT_FILTERS,
    mergeFilters,
    nodeIsFilteredOut,
    cleanNode,
    cleanClone,
    FOOTNOTE_TEXT_RE,
    sectionText,
    normalizeWhitespace,
    chunkIntoSentences,
    sectionToChunks,
    sectionToItems,
    ITEM_BREAK,
    ITEM_START,
    DEFAULT_ITEM_PAUSE_MS,
  };
});
