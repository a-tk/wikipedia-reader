// content.js — orchestrates extraction, the UI, and the speech engine on a
// Wikipedia article page.
(function () {
  "use strict";

  const WR = window.WikiReader || {};
  const { extractor, filters, settings, controls, SpeechEngine, loadVoices } = WR;

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

  // Let the page paint/handle input between sections of heavy work.
  const yieldToPage = () => new Promise((resolve) => setTimeout(resolve, 0));

  // Build the flat chunk queue for the currently selected sections. Cloning and
  // filtering is the expensive part on very long articles, so yield to the
  // page between sections instead of blocking the main thread in one go.
  async function buildQueue(selectedIds) {
    const filterCfg = currentSettings.filters;
    const title = articleTitle();
    const queue = [];
    for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
      const section = sections[sectionIndex];
      if (!selectedIds.includes(section.id)) continue;
      if (queue.length > 0) await yieldToPage();
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
      // List items carry a short pauseAfterMs so each item is audibly separate.
      filters
        .sectionToItems(section.contentNodes, filterCfg)
        .forEach((item) =>
          queue.push({ sectionId: section.id, sectionIndex, ...item })
        );
    }
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

  let starting = false;
  async function startPlayback() {
    if (starting) return; // ignore repeat clicks while the queue is building
    starting = true;
    try {
      const queue = await buildQueue(ui.getSelectedIds());
      if (queue.length === 0) {
        ui.bar.setSectionLabel("Nothing selected to read.");
        return;
      }
      engine.applySettings(voiceSettings());
      engine.load(queue);
      engine.play();
    } finally {
      starting = false;
    }
  }

  // Debounce persistence so dragging a slider doesn't hammer storage. Only the
  // slider-controlled values are written, merged onto the latest stored
  // settings, so a stale in-memory copy can never revert voice/filter changes
  // made on the options page.
  let persistTimer = null;
  function persistSettingsSoon() {
    if (!settings) return;
    clearTimeout(persistTimer);
    persistTimer = setTimeout(async () => {
      const { volume, rate } = currentSettings.voice;
      const latest = await settings.load();
      latest.voice.volume = volume;
      latest.voice.rate = rate;
      await settings.save(latest);
      persistTimer = null;
    }, 300);
  }

  // Pick up changes made elsewhere (the options page, another tab) so open
  // articles use the new voice/filters without a reload.
  function applyExternalSettings(next) {
    const keepSliders = persistTimer !== null; // a local slider change is pending
    const volume = keepSliders ? currentSettings.voice.volume : next.voice.volume;
    const rate = keepSliders ? currentSettings.voice.rate : next.voice.rate;
    currentSettings = next;
    currentSettings.voice.volume = volume;
    currentSettings.voice.rate = rate;
    if (ui) {
      ui.bar.setVolume(volume);
      ui.bar.setRate(rate);
    }
    if (engine) engine.applySettings(voiceSettings());
  }

  // Live volume change from the control-bar slider. Applies to the next spoken
  // chunk immediately and persists the new value so it is remembered.
  function setVolume(value) {
    const v = Math.min(1, Math.max(0, Number(value)));
    currentSettings.voice.volume = v;
    if (engine) engine.applySettings({ volume: v });
    persistSettingsSoon();
  }

  // Live playback-speed change from the control-bar slider.
  function setRate(value) {
    const r = Math.min(3, Math.max(0.5, Number(value)));
    currentSettings.voice.rate = r;
    if (engine) engine.applySettings({ rate: r });
    persistSettingsSoon();
  }

  // Chrome populates the voice list lazily, so a getVoices() call at click time
  // can return [] and silently drop the user's chosen voice. Load it up front.
  let voices = [];
  function primeVoices() {
    if (typeof loadVoices !== "function") return;
    const refresh = () => {
      if (typeof speechSynthesis !== "undefined") {
        voices = speechSynthesis.getVoices() || voices;
      }
    };
    loadVoices().then((list) => {
      if (list && list.length) voices = list;
    });
    if (typeof speechSynthesis !== "undefined" && speechSynthesis.addEventListener) {
      speechSynthesis.addEventListener("voiceschanged", refresh);
    }
  }

  function voiceSettings() {
    const v = currentSettings.voice;
    let voice = null;
    if (v.voiceURI) {
      const pool =
        voices.length || typeof speechSynthesis === "undefined"
          ? voices
          : speechSynthesis.getVoices();
      voice = pool.find((x) => x.voiceURI === v.voiceURI) || null;
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
      .on("error", ({ error }) => {
        // Chrome blocks speech until the user has interacted with the page, and
        // a keyboard shortcut does not count as page interaction.
        if (error === "not-allowed") {
          ui.bar.setSectionLabel("Click the page once, then press play.");
        }
      })
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
    prevSection() {
      engine && engine.prevSection();
    },
  };
  window.WikiReader.actions = actions;

  // Content scripts can only reach chrome.* while the extension context is
  // valid; after an extension reload/update it is orphaned and calls throw.
  function extensionAlive() {
    try {
      return typeof chrome !== "undefined" && !!chrome.runtime && !!chrome.runtime.id;
    } catch (e) {
      return false;
    }
  }

  async function openSettings() {
    // openOptionsPage() is not available in a content script, so ask the
    // service worker to open the options page on our behalf.
    if (!extensionAlive()) {
      ui.bar.setSectionLabel("Extension was updated — reload this page.");
      return;
    }
    try {
      await chrome.runtime.sendMessage({ type: "open-options" });
    } catch (e) {
      ui.bar.setSectionLabel("Extension was updated — reload this page.");
    }
  }

  async function fetchShortcuts() {
    if (!extensionAlive()) return {};
    try {
      const res = await chrome.runtime.sendMessage({ type: "get-shortcuts" });
      return (res && res.shortcuts) || {};
    } catch (e) {
      return {};
    }
  }

  // Receive commands relayed from the service worker.
  if (extensionAlive() && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (!msg || msg.type !== "command") return;
      const action = WR.commands && WR.commands.actionForCommand(msg.command);
      if (action && actions[action]) actions[action]();
    });
  }

  // Live-update from the options page.
  if (extensionAlive() && chrome.storage && chrome.storage.onChanged && settings) {
    chrome.storage.onChanged.addListener((changes, area) => {
      const change = changes[settings.STORAGE_KEY];
      if (area === "sync" && change) {
        applyExternalSettings(settings.normalize(change.newValue));
      }
    });
  }

  async function init() {
    sections = extractor.extractSections(rootEl);
    if (sections.length === 0) return;
    if (settings) currentSettings = await settings.load();
    primeVoices();

    ui = controls.mount(document, {
      sections,
      volume: currentSettings.voice.volume,
      rate: currentSettings.voice.rate,
      // Minimized by default so the panel doesn't cover the article; the
      // user expands it to pick sections or adjust sliders.
      collapsed: true,
      handlers: {
        onToggle: actions.togglePlay,
        onStop: actions.stop,
        onPrev: actions.prevSection,
        onSkip: actions.skipSection,
        onSettings: openSettings,
        onVolume: setVolume,
        onRate: setRate,
      },
    });
    wireEngine();
    ui.bar.setShortcuts(await fetchShortcuts());
  }

  init();
})();
