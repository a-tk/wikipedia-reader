import { describe, it, expect, beforeEach, vi } from "vitest";
import extractor from "../src/core/extractor.js";
import filters from "../src/core/filters.js";
import speech from "../src/core/speech.js";
import controls from "../src/content/controls.js";
import settings from "../src/core/settings.js";
import { loadFixture } from "./helpers/loadFixture.js";

const { SpeechEngine } = speech;

// Reproduces the queue-building the content script performs: speak each
// selected section's heading, then its filtered sentence chunks, in order.
function buildQueue(sections, selectedIds, filterCfg) {
  const queue = [];
  sections.forEach((section, sectionIndex) => {
    if (!selectedIds.includes(section.id)) return;
    if (section.level !== 0 && section.headingText) {
      queue.push({
        sectionId: section.id,
        sectionIndex,
        text: section.headingText + ".",
        isHeading: true,
        pauseAfterMs: 700,
      });
    }
    filters
      .sectionToChunks(section.contentNodes, filterCfg)
      .forEach((text) => queue.push({ sectionId: section.id, sectionIndex, text }));
  });
  return queue;
}

function makeMockSynth() {
  const spoken = [];
  return {
    spoken,
    getVoices: () => [],
    speak(u) {
      spoken.push(u);
    },
    pause() {},
    resume() {},
    cancel() {},
    finishCurrent() {
      const u = spoken[spoken.length - 1];
      if (u && u.onend) u.onend({});
    },
  };
}

describe("end-to-end: extract -> filter -> speak", () => {
  let root;
  let sections;
  beforeEach(() => {
    root = loadFixture("sample-article.html");
    sections = extractor.extractSections(root);
  });

  it("reads only the selected sections, headings first, filters applied", () => {
    const selected = ["lead", "History"]; // skip Legacy/References/External links
    const queue = buildQueue(sections, selected, settings.DEFAULTS.filters);

    const texts = queue.map((q) => q.text);
    const all = texts.join(" ");

    // Heading of History is announced before its prose.
    const historyHeadingIdx = texts.findIndex((t) => t === "History.");
    const historyProseIdx = texts.findIndex((t) => t.includes("history section"));
    expect(historyHeadingIdx).toBeGreaterThanOrEqual(0);
    expect(historyProseIdx).toBeGreaterThan(historyHeadingIdx);

    // Lead comes before History in the queue.
    const leadIdx = texts.findIndex((t) => t.includes("example subject"));
    expect(leadIdx).toBeLessThan(historyHeadingIdx);

    // Unselected sections never appear.
    expect(all).not.toContain("legacy heading markup");
    expect(all).not.toContain("Example site");

    // Filters removed non-prose.
    expect(all).not.toContain("1 January 1900"); // infobox
    expect(all).not.toContain("E = mc^2"); // math
    expect(all).not.toContain("caption that should not be read");
    expect(all).not.toMatch(/\[\s*\d+\s*\]/); // footnote markers
  });

  it("drives the speech engine through the whole queue in order", () => {
    vi.useFakeTimers();
    try {
      const selected = ["lead", "History"];
      const queue = buildQueue(sections, selected, settings.DEFAULTS.filters);

      const synth = makeMockSynth();
      const engine = new SpeechEngine({
        synth,
        createUtterance: (text) => ({ text }),
        keepAliveMs: 0,
      });
      const sectionsEntered = [];
      engine.on("section", ({ sectionId }) => sectionsEntered.push(sectionId));

      engine.load(queue);
      engine.play();
      // Drain the queue, flushing any post-heading pause gaps.
      let guard = 0;
      while (engine.getState() === "playing" && guard++ < 100) {
        synth.finishCurrent();
        vi.advanceTimersByTime(1000); // release any pending gap timer
      }

      expect(engine.getState()).toBe("idle");
      expect(synth.spoken.map((u) => u.text)).toEqual(queue.map((q) => q.text));
      expect(sectionsEntered).toEqual(["lead", "History"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("respects a filter toggle change (keep tables) through the pipeline", () => {
    const selected = ["Legacy_section"]; // section id, not heading text
    const cfg = Object.assign({}, settings.DEFAULTS.filters, { table: false, infobox: false });
    const queue = buildQueue(sections, selected, cfg);
    const all = queue.map((q) => q.text).join(" ");
    expect(all).toContain("Something happened"); // table content now included
  });

  it("outline selection feeds the queue (UI + core integration)", () => {
    const ui = controls.mount(document, {
      sections: sections.map((s) => ({ id: s.id, headingText: s.headingText, level: s.level })),
      handlers: {},
    });
    // Uncheck everything except History.
    ui.outlineEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.checked = cb.getAttribute("data-section-id") === "History";
    });
    const selected = ui.getSelectedIds();
    expect(selected).toEqual(["History"]);

    const queue = buildQueue(sections, selected, settings.DEFAULTS.filters);
    expect(queue[0].text).toBe("History.");
    expect(queue.length).toBeGreaterThan(1);
    ui.destroy();
  });
});

describe("end-to-end with Parsoid section-wrapped markup", () => {
  let sections;
  beforeEach(() => {
    const root = loadFixture("parsoid-article.html");
    sections = extractor.extractSections(root);
  });

  it("lists every section including nested subsections", () => {
    const outline = sections.map((s) => s.headingText);
    expect(outline).toEqual(["", "History", "Early history", "Culture", "References"]);
  });

  it("announces each heading with a trailing pause before its prose", () => {
    const selected = ["History", "Culture"];
    const queue = buildQueue(sections, selected, settings.DEFAULTS.filters);

    const historyHeading = queue.find((q) => q.text === "History.");
    expect(historyHeading.isHeading).toBe(true);
    expect(historyHeading.pauseAfterMs).toBeGreaterThan(0);

    // Heading immediately followed in the queue by its prose chunk.
    const hIdx = queue.indexOf(historyHeading);
    expect(queue[hIdx + 1].text).toContain("history section");
  });

  it("reads only selected sections from the wrapped layout", () => {
    const queue = buildQueue(sections, ["Culture"], settings.DEFAULTS.filters);
    const all = queue.map((q) => q.text).join(" ");
    expect(all).toContain("Culture.");
    expect(all).toContain("prose about culture");
    expect(all).not.toContain("history section");
  });
});
