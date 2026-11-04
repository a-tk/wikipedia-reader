import { describe, it, expect, beforeEach, vi } from "vitest";
import highlighterModule from "../src/content/highlighter.js";

const { createHighlighter, HIGHLIGHT_NAME, USER_SCROLL_GRACE_MS } = highlighterModule;

// jsdom has neither CSS.highlights nor Highlight, so inject fakes.
class FakeHighlight {
  constructor(range) {
    this.range = range;
  }
}
function makeRegistry() {
  const map = new Map();
  return { map, set: (k, v) => map.set(k, v), delete: (k) => map.delete(k) };
}

function setup(extra = {}) {
  document.body.innerHTML = "<p id='p'>Hello <b>big</b> world. Second sentence.</p>";
  const p = document.getElementById("p");
  const registry = makeRegistry();
  let t = 1_000_000;
  const win = {
    innerHeight: 800,
    scrollY: 0,
    scrollTo: vi.fn(),
    matchMedia: () => ({ matches: false }),
    listeners: {},
    addEventListener(type, fn) {
      (this.listeners[type] = this.listeners[type] || []).push(fn);
    },
    removeEventListener() {},
    fire(type, ev) {
      (this.listeners[type] || []).forEach((fn) => fn(ev || {}));
    },
  };
  const hl = createHighlighter({
    document,
    window: win,
    registry,
    Highlight: FakeHighlight,
    now: () => t,
    ...extra,
  });
  const text = p.firstChild; // "Hello "
  const tail = p.lastChild; // " world. Second sentence."
  return {
    hl, registry, win, p, advance: (ms) => (t += ms),
    loc: { sn: text, so: 0, en: tail, eo: 7 }, // "Hello big world."
  };
}

// Make Range.getBoundingClientRect return a chosen rect.
function stubRect(rect) {
  const proto = Range.prototype;
  const original = proto.getBoundingClientRect;
  proto.getBoundingClientRect = () => rect;
  return () => (proto.getBoundingClientRect = original);
}

describe("highlighter", () => {
  let restore = () => {};
  beforeEach(() => restore());

  it("registers a Range under the highlight name, covering the location", () => {
    const { hl, registry, loc } = setup();
    expect(hl.supported).toBe(true);
    expect(hl.show(loc)).toBe(true);
    const h = registry.map.get(HIGHLIGHT_NAME);
    expect(h).toBeInstanceOf(FakeHighlight);
    expect(h.range.toString()).toBe("Hello big world.");
  });

  it("replaces the previous highlight rather than adding another", () => {
    const { hl, registry, loc, p } = setup();
    hl.show(loc);
    hl.show({ el: p });
    expect(registry.map.size).toBe(1);
    expect(registry.map.get(HIGHLIGHT_NAME).range.toString()).toContain("Second sentence.");
  });

  it("highlights a whole element location (headings)", () => {
    const { hl, registry, p } = setup();
    expect(hl.show({ el: p })).toBe(true);
    expect(registry.map.get(HIGHLIGHT_NAME).range.toString()).toBe("Hello big world. Second sentence.");
  });

  it("clear() removes the highlight", () => {
    const { hl, registry, loc } = setup();
    hl.show(loc);
    hl.clear();
    expect(registry.map.has(HIGHLIGHT_NAME)).toBe(false);
  });

  it("returns false (so callers can fall back) for a missing location", () => {
    const { hl, registry, loc } = setup();
    hl.show(loc);
    expect(hl.show(null)).toBe(false);
    expect(registry.map.has(HIGHLIGHT_NAME)).toBe(false);
  });

  it("returns false when the target text was removed from the page", () => {
    const { hl, loc, p } = setup();
    p.remove(); // detached nodes: page changed under us
    expect(hl.show(loc)).toBe(false);
  });

  it("returns false (no throw) for out-of-range offsets", () => {
    const { hl, loc } = setup();
    expect(hl.show({ ...loc, so: 9999 })).toBe(false);
  });

  it("does nothing and reports false when the API is unsupported", () => {
    const { hl, loc } = setup({ registry: null, Highlight: null });
    expect(hl.supported).toBe(false);
    expect(hl.show(loc)).toBe(false);
    expect(() => hl.clear()).not.toThrow();
  });

  it("setOptions({enabled:false}) clears and disables", () => {
    const { hl, registry, loc } = setup();
    hl.show(loc);
    hl.setOptions({ enabled: false });
    expect(registry.map.has(HIGHLIGHT_NAME)).toBe(false);
    expect(hl.show(loc)).toBe(false);
    hl.setOptions({ enabled: true });
    expect(hl.show(loc)).toBe(true);
  });

  describe("follow-along scrolling", () => {
    it("scrolls when the sentence is off screen", () => {
      const { hl, win, loc } = setup();
      restore = stubRect({ top: 1500, bottom: 1540, width: 300, height: 40 });
      hl.show(loc);
      expect(win.scrollTo).toHaveBeenCalledTimes(1);
      const arg = win.scrollTo.mock.calls[0][0];
      expect(arg.top).toBeCloseTo(1500 - 800 * 0.3);
      expect(arg.behavior).toBe("smooth");
    });

    it("does not scroll when the sentence is comfortably in view", () => {
      const { hl, win, loc } = setup();
      restore = stubRect({ top: 300, bottom: 340, width: 300, height: 40 });
      hl.show(loc);
      expect(win.scrollTo).not.toHaveBeenCalled();
    });

    it("scrolls when the sentence is near the edge", () => {
      const { hl, win, loc } = setup();
      restore = stubRect({ top: 10, bottom: 50, width: 300, height: 40 });
      hl.show(loc);
      expect(win.scrollTo).toHaveBeenCalled();
    });

    it("skips scrolling for hidden (zero-size) text", () => {
      const { hl, win, loc } = setup();
      restore = stubRect({ top: 0, bottom: 0, width: 0, height: 0 });
      hl.show(loc);
      expect(win.scrollTo).not.toHaveBeenCalled();
    });

    it("does not scroll when follow is off", () => {
      const { hl, win, loc } = setup({ follow: false });
      restore = stubRect({ top: 1500, bottom: 1540, width: 300, height: 40 });
      hl.show(loc);
      expect(win.scrollTo).not.toHaveBeenCalled();
    });

    it("respects prefers-reduced-motion", () => {
      const { hl, win, loc } = setup();
      win.matchMedia = () => ({ matches: true });
      restore = stubRect({ top: 1500, bottom: 1540, width: 300, height: 40 });
      hl.show(loc);
      expect(win.scrollTo.mock.calls[0][0].behavior).toBe("auto");
    });

    it("backs off after the user scrolls by hand, then resumes", () => {
      const { hl, win, loc, advance } = setup();
      restore = stubRect({ top: 1500, bottom: 1540, width: 300, height: 40 });
      win.fire("wheel");
      hl.show(loc);
      expect(win.scrollTo).not.toHaveBeenCalled();
      advance(USER_SCROLL_GRACE_MS + 1);
      hl.show(loc);
      expect(win.scrollTo).toHaveBeenCalledTimes(1);
    });

    it("treats scrolling keys, but not other keys, as user scrolling", () => {
      const { hl, win, loc } = setup();
      restore = stubRect({ top: 1500, bottom: 1540, width: 300, height: 40 });
      win.fire("keydown", { key: "a" });
      hl.show(loc);
      expect(win.scrollTo).toHaveBeenCalledTimes(1);
      win.fire("keydown", { key: "PageDown" });
      hl.show(loc);
      expect(win.scrollTo).toHaveBeenCalledTimes(1); // suppressed
    });
  });
});
