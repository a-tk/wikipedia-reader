// highlighter.js — highlights the sentence being read, using the CSS Custom
// Highlight API (Chrome 105+). Nothing is added to or changed in the page's
// DOM: a Range is registered under a name and styled with ::highlight(name) in
// controls.css, so it works across links, bold text and footnote markers, and
// can never break Wikipedia's own markup or scripts.
//
// A "location" is either:
//   { sn, so, en, eo }  — start/end text node + offset (from locator.js), or
//   { el }              — a whole element (used for spoken headings / title).
//
// The browser APIs are injectable so this can be unit tested in jsdom, which
// has neither CSS.highlights nor Highlight.
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.WikiReader = root.WikiReader || {};
  root.WikiReader.highlighter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const HIGHLIGHT_NAME = "wr-sentence";
  // After the user scrolls by hand, don't yank the page back for a while.
  const USER_SCROLL_GRACE_MS = 4000;
  const SCROLL_KEYS = new Set([
    "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " ",
  ]);

  // opts: { document, window, registry, Highlight, enabled, follow, now }
  function createHighlighter(opts) {
    const o = opts || {};
    const doc = o.document || document;
    const win = o.window || doc.defaultView || null;
    const registry =
      o.registry !== undefined
        ? o.registry
        : typeof CSS !== "undefined" && CSS.highlights
        ? CSS.highlights
        : null;
    const HighlightCtor =
      o.Highlight !== undefined
        ? o.Highlight
        : typeof Highlight !== "undefined"
        ? Highlight
        : null;
    const now = o.now || (() => Date.now());

    const supported = !!(registry && HighlightCtor && typeof doc.createRange === "function");
    let enabled = o.enabled !== false;
    let follow = o.follow !== false;
    let lastUserScroll = -Infinity;

    // Track manual scrolling so auto-follow doesn't fight the reader.
    const markUserScroll = () => {
      lastUserScroll = now();
    };
    const onKey = (ev) => {
      if (ev && SCROLL_KEYS.has(ev.key)) markUserScroll();
    };
    if (win && win.addEventListener) {
      win.addEventListener("wheel", markUserScroll, { passive: true });
      win.addEventListener("touchmove", markUserScroll, { passive: true });
      win.addEventListener("keydown", onKey, { passive: true });
    }

    function rangeFor(loc) {
      const range = doc.createRange();
      try {
        if (loc.el) {
          if (!loc.el.isConnected) return null;
          range.selectNodeContents(loc.el);
        } else {
          if (!loc.sn || !loc.en || !loc.sn.isConnected || !loc.en.isConnected) {
            return null;
          }
          range.setStart(loc.sn, loc.so);
          range.setEnd(loc.en, loc.eo);
        }
      } catch (e) {
        // The page changed under us (node detached, offsets out of range).
        return null;
      }
      return range;
    }

    function scrollIntoComfortableView(range) {
      if (!follow || !win || typeof win.scrollTo !== "function") return;
      if (now() - lastUserScroll < USER_SCROLL_GRACE_MS) return;
      const rect = range.getBoundingClientRect && range.getBoundingClientRect();
      // Zero-size means the text is hidden (e.g. a collapsed section); nothing to follow.
      if (!rect || (rect.width === 0 && rect.height === 0)) return;
      const viewport = win.innerHeight || doc.documentElement.clientHeight || 0;
      if (!viewport) return;
      const margin = viewport * 0.15;
      if (rect.top >= margin && rect.bottom <= viewport - margin) return; // already in view
      const reduce =
        typeof win.matchMedia === "function" &&
        win.matchMedia("(prefers-reduced-motion: reduce)").matches;
      win.scrollTo({
        top: Math.max(0, (win.scrollY || 0) + rect.top - viewport * 0.3),
        behavior: reduce ? "auto" : "smooth",
      });
    }

    function clear() {
      if (supported) registry.delete(HIGHLIGHT_NAME);
    }

    // Highlight a location. Returns true if something is now highlighted, so
    // the caller can fall back to a coarser highlight when it returns false.
    function show(loc) {
      if (!supported || !enabled || !loc) {
        clear();
        return false;
      }
      const range = rangeFor(loc);
      if (!range) {
        clear();
        return false;
      }
      registry.set(HIGHLIGHT_NAME, new HighlightCtor(range));
      scrollIntoComfortableView(range);
      return true;
    }

    function setOptions(next) {
      if (!next) return;
      if (typeof next.enabled === "boolean") enabled = next.enabled;
      if (typeof next.follow === "boolean") follow = next.follow;
      if (!enabled) clear();
    }

    function destroy() {
      clear();
      if (win && win.removeEventListener) {
        win.removeEventListener("wheel", markUserScroll);
        win.removeEventListener("touchmove", markUserScroll);
        win.removeEventListener("keydown", onKey);
      }
    }

    return { supported, show, clear, setOptions, destroy, NAME: HIGHLIGHT_NAME };
  }

  return { createHighlighter, HIGHLIGHT_NAME, USER_SCROLL_GRACE_MS };
});
