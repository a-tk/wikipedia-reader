// extractor.js — pure DOM -> section-outline functions.
//
// Given the Wikipedia parser-output root, produce an ordered list of
// sections. Each section is:
//   { id, headingText, level (2..6 | 0 for lead), contentNodes: Element[] }
//
// Heading detection is defensive because the markup differs by skin:
//   - Parsoid / Vector 2022:
//       <div class="mw-heading mw-heading2"><h2 id="History">History</h2></div>
//   - Legacy:
//       <h2><span class="mw-headline" id="History">History</span></h2>
//
// No extension or DOM-global APIs are used beyond what a passed-in element
// provides, so these functions run both in the content script and in jsdom.
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.WikiReader = root.WikiReader || {};
  root.WikiReader.extractor = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const HEADING_TAGS = new Set(["H2", "H3", "H4", "H5", "H6"]);

  // Return the <hN> element for a node if the node *is* a heading or *wraps*
  // one (the Parsoid `div.mw-heading` wrapper). Otherwise null.
  function headingElementFor(node) {
    if (!node || node.nodeType !== 1) return null;
    const el = /** @type {Element} */ (node);
    if (HEADING_TAGS.has(el.tagName)) return el;
    // Parsoid wrapper: a div whose class marks it as a heading container.
    if (
      el.tagName === "DIV" &&
      typeof el.className === "string" &&
      /\bmw-heading\b/.test(el.className)
    ) {
      const inner = el.querySelector("h2, h3, h4, h5, h6");
      if (inner) return inner;
    }
    return null;
  }

  function levelFromHeading(h) {
    return Number(h.tagName.substring(1));
  }

  // Heading text: prefer the .mw-headline span (legacy), else the heading's
  // own text, with the "[edit]" section link and reference markers stripped.
  function headingText(h) {
    const headline = h.querySelector(".mw-headline");
    const source = headline || h;
    const clone = source.cloneNode(true);
    clone
      .querySelectorAll(".mw-editsection, sup.reference, .mw-editsection-like")
      .forEach((n) => n.remove());
    return (clone.textContent || "").replace(/\s+/g, " ").trim();
  }

  function headingId(h, fallbackIndex) {
    const headline = h.querySelector(".mw-headline");
    const id =
      (headline && headline.id) ||
      h.id ||
      (h.getAttribute && h.getAttribute("id"));
    return id || `section-${fallbackIndex}`;
  }

  // Locate the parser-output root from any ancestor (document, #mw-content-text,
  // or the parser-output element itself).
  function findParserOutput(rootEl) {
    if (!rootEl) return null;
    if (
      rootEl.classList &&
      rootEl.classList.contains("mw-parser-output")
    ) {
      return rootEl;
    }
    const q = rootEl.querySelector
      ? rootEl.querySelector(".mw-parser-output")
      : null;
    return q || null;
  }

  // Build the ordered section list. The lead section (level 0) holds content
  // that precedes the first heading; it is omitted if it has no content nodes.
  function extractSections(rootEl) {
    const parserOutput = findParserOutput(rootEl);
    if (!parserOutput) return [];

    const sections = [];
    let current = {
      id: "lead",
      headingText: "",
      level: 0,
      contentNodes: [],
    };
    let headingCount = 0;

    const children = Array.from(parserOutput.children);
    for (const node of children) {
      const h = headingElementFor(node);
      if (h) {
        // Close the previous section before starting a new one.
        if (current.level !== 0 || current.contentNodes.length > 0) {
          sections.push(current);
        }
        headingCount += 1;
        current = {
          id: headingId(h, headingCount),
          headingText: headingText(h),
          level: levelFromHeading(h),
          contentNodes: [],
        };
      } else {
        current.contentNodes.push(node);
      }
    }
    // Push the trailing section.
    if (current.level !== 0 || current.contentNodes.length > 0) {
      sections.push(current);
    }
    return sections;
  }

  // Convenience: a flat outline (no content nodes) for building UI.
  function extractOutline(rootEl) {
    return extractSections(rootEl).map((s) => ({
      id: s.id,
      headingText: s.headingText,
      level: s.level,
    }));
  }

  return {
    HEADING_TAGS,
    headingElementFor,
    headingText,
    headingId,
    findParserOutput,
    extractSections,
    extractOutline,
  };
});
