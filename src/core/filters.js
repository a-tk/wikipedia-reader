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
  const DEFAULT_FILTERS = {
    infobox: true,
    table: true,
    caption: true,
    math: true,
    footnote: true,
  };

  // Selectors removed from a cloned subtree, keyed by filter category.
  const REMOVAL_SELECTORS = {
    infobox: ["table.infobox", ".infobox", ".sidebar", ".navbox", ".vcard"],
    table: ["table"],
    caption: ["figcaption", ".thumbcaption", ".thumb", "figure"],
    math: [".mwe-math-element", "math"],
    footnote: ["sup.reference", "sup.noprint", ".mw-ref", ".reference"],
  };

  // Structural noise always removed regardless of toggles.
  const ALWAYS_REMOVE = [
    ".mw-editsection",
    "style",
    "script",
    ".hatnote",
    ".mw-empty-elt",
    "#coordinates",
  ];

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
    if (filters.infobox && (matches("table.infobox") || matches(".infobox") || matches(".navbox") || matches(".sidebar"))) {
      return true;
    }
    if (filters.table && matches("table")) return true;
    if (filters.caption && (matches("figure") || matches("figcaption"))) {
      return true;
    }
    if (filters.math && matches(".mwe-math-element")) return true;
    return false;
  }

  // Clone a node and strip disallowed descendants per the filter config.
  function cleanNode(node, filters) {
    const clone = node.cloneNode(true);
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

  // Extract normalized text from the surviving content nodes of one section.
  function sectionText(contentNodes, filters) {
    const f = mergeFilters(filters);
    const parts = [];
    for (const node of contentNodes || []) {
      if (nodeIsFilteredOut(node, f)) continue;
      const cleaned = cleanNode(node, f);
      const text = cleaned.textContent || "";
      if (text.trim()) parts.push(text);
    }
    let joined = parts.join(" ");
    // Remove any bracketed footnote markers that slipped through as plain text
    // (e.g. "[1]", "[12]", "[a]", "[citation needed]").
    if (f.footnote) {
      joined = joined.replace(/\[\s*(?:\d+|[a-z]|citation needed|note \d+)\s*\]/gi, "");
    }
    return normalizeWhitespace(joined);
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
        const pieces = splitLong(sentence, options.maxChars);
        for (const p of pieces) pushChunk(chunks, p, options);
        buffer = "";
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

  return {
    DEFAULT_FILTERS,
    mergeFilters,
    nodeIsFilteredOut,
    cleanNode,
    sectionText,
    normalizeWhitespace,
    chunkIntoSentences,
    sectionToChunks,
  };
});
