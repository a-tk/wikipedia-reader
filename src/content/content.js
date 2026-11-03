// content.js — orchestrates extraction, the UI, and the speech engine on a
// Wikipedia article page.
(function () {
  "use strict";

  const WR = window.WikiReader || {};
  const { extractor, filters, settings, controls, SpeechEngine } = WR;

  // Guard: only run on article pages that actually have parser output.
  const rootEl = document.querySelector("#mw-content-text") || document.body;
  if (!extractor || !extractor.findParserOutput(rootEl)) {
    return;
  }

  let sections = [];
  let ui = null;
  let engine = null;
  let currentSettings = settings ? settings.DEFAULTS : null;

  function sectionById(id) {
    return sections.find((s) => s.id === id) || null;
  }

  function labelFor(section) {
    if (!section) return "";
    return section.level === 0 ? "Introduction" : section.headingText;
  }

  // Silence inserted after a spoken section heading, before its prose.
  const PAUSE_AFTER_HEADING_MS = 700;

  // The article title, read before the Introduction. Prefer the main-title
  // span (modern skins) and fall back to #firstHeading's text, stripping any
  // parenthetical disambiguation marker Wikipedia adds for screen readers.
  function articleTitle() {
    const h1 = document.querySelector("#firstHeading, .mw-first-heading, h1.firstHeading");
    if (!h1) return "";
    const main = h1.querySelector(".mw-page-title-main");
    const source = main || h1;
    const clone = source.cloneNode(true);
    clone.querySelectorAll(".mw-editsection, sup.reference").forEach((n) => n.remove());
    return (clone.textContent || "").replace(/\s+/g, " ").trim();
  }

  // Build the flat chunk queue for the currently selected sections.
  function buildQueue(selectedIds) {
    const filterCfg = currentSettings.filters;
    const title = articleTitle();
    const queue = [];
    sections.forEach((section, sectionIndex) => {
      if (!selectedIds.includes(section.id)) return;
      // The lead/Introduction has no heading of its own, so announce the
      // article title before it. Other sections announce their own heading.
      if (section.level === 0 && title) {
        queue.push({
          sectionId: section.id,
          sectionIndex,
          text: title + ".",
          isHeading: true,
          pauseAfterMs: PAUSE_AFTER_HEADING_MS,
        });
      }
      // Speak the heading first (except for the lead), then pause before the
      // section's prose so the title is clearly set off from the content.
      if (section.level !== 0 && section.headingText) {
        queue.push({
          sectionId: section.id,
          sectionIndex,
          text: section.headingText + ".",
          isHeading: true,
          pauseAfterMs: PAUSE_AFTER_HEADING_MS,
        });
      }
      const chunks = filters.sectionToChunks(section.contentNodes, filterCfg);
      chunks.forEach((text) =>
        queue.push({ sectionId: section.id, sectionIndex, text })
      );
    });
    return queue;
  }

  function highlightSection(id) {
    document
      .querySelectorAll(".wikireader-active-section")
      .forEach((n) => n.classList.remove("wikireader-active-section"));
    const section = sectionById(id);
    if (section && section.contentNodes[0] && section.contentNodes[0].classList) {
      section.contentNodes[0].classList.add("wikireader-active-section");
    }
  }

  function startPlayback() {
    const selected = ui.getSelectedIds();
    const queue = buildQueue(selected);
    if (queue.length === 0) {
      ui.bar.setSectionLabel("Nothing selected to read.");
      return;
    }
    engine.applySettings(voiceSettings());
    engine.load(queue);
    engine.play();
  }

  function voiceSettings() {
    const v = currentSettings.voice;
    let voice = null;
    if (v.voiceURI && typeof speechSynthesis !== "undefined") {
      voice = speechSynthesis.getVoices().find((x) => x.voiceURI === v.voiceURI) || null;
    }
    return { voice, rate: v.rate, pitch: v.pitch, volume: v.volume };
  }

  function wireEngine() {
    engine = new SpeechEngine({});
    engine
      .on("section", ({ sectionId }) => {
        const s = sectionById(sectionId);
        ui.bar.setSectionLabel(labelFor(s));
        highlightSection(sectionId);
      })
      .on("start", () => ui.bar.setState("playing"))
      .on("resume", () => ui.bar.setState("playing"))
      .on("pause", () => ui.bar.setState("paused"))
      .on("stop", () => {
        ui.bar.setState("idle");
        ui.bar.setSectionLabel("");
        highlightSection(null);
      })
      .on("end", () => {
        ui.bar.setState("idle");
        ui.bar.setSectionLabel("Finished.");
        highlightSection(null);
      });
  }

  // Actions also used by keyboard commands (Task 7).
  const actions = {
    togglePlay() {
      if (!engine) return;
      if (engine.getState() === "idle") startPlayback();
      else engine.togglePlay();
    },
    stop() {
      engine && engine.stop();
    },
    skipSection() {
      engine && engine.skipSection();
    },
  };
  window.WikiReader.actions = actions;

  function openSettings() {
    // openOptionsPage() is not available in a content script, so ask the
    // service worker to open the options page on our behalf.
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: "open-options" }, () => {
        void (chrome.runtime && chrome.runtime.lastError);
      });
    }
  }

  // Receive commands relayed from the service worker (Task 7).
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (!msg || msg.type !== "command") return;
      const action = WR.commands && WR.commands.actionForCommand(msg.command);
      if (action && actions[action]) actions[action]();
    });
  }

  async function init() {
    sections = extractor.extractSections(rootEl);
    if (sections.length === 0) return;
    if (settings) currentSettings = await settings.load();

    ui = controls.mount(document, {
      sections,
      handlers: {
        onToggle: actions.togglePlay,
        onStop: actions.stop,
        onSkip: actions.skipSection,
        onSettings: openSettings,
      },
    });
    wireEngine();
  }

  init();
})();
