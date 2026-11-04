// Options page logic. Loads persisted settings, renders them into the form,
// saves on change, and offers a voice preview. Uses WikiReader.settings and
// the Web Speech API directly (this page runs in a document context).
"use strict";
(function () {
  const S = window.WikiReader.settings;

  const el = (id) => document.getElementById(id);
  const controls = {
    voice: el("voice"),
    rate: el("rate"),
    pitch: el("pitch"),
    volume: el("volume"),
    rateOut: el("rate-out"),
    pitchOut: el("pitch-out"),
    volumeOut: el("volume-out"),
    preview: el("preview"),
    status: el("status"),
    filters: {
      infobox: el("f-infobox"),
      table: el("f-table"),
      caption: el("f-caption"),
      math: el("f-math"),
      footnote: el("f-footnote"),
      code: el("f-code"),
    },
    display: {
      highlight: el("d-highlight"),
      follow: el("d-follow"),
    },
  };

  let current = S.DEFAULTS;
  let statusTimer = null;

  function setStatus(msg) {
    controls.status.textContent = msg;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => (controls.status.textContent = ""), 1800);
  }

  async function populateVoices() {
    const voices = await window.WikiReader.loadVoices();
    controls.voice.innerHTML = "";
    const def = document.createElement("option");
    def.value = "";
    def.textContent = "Default voice";
    controls.voice.appendChild(def);
    voices
      .slice()
      .sort((a, b) => a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name))
      .forEach((v) => {
        const opt = document.createElement("option");
        opt.value = v.voiceURI;
        opt.textContent = `${v.name} (${v.lang})${v.default ? " — default" : ""}`;
        controls.voice.appendChild(opt);
      });
    if (current.voice.voiceURI) controls.voice.value = current.voice.voiceURI;
  }

  function renderOutputs() {
    controls.rateOut.textContent = Number(controls.rate.value).toFixed(1);
    controls.pitchOut.textContent = Number(controls.pitch.value).toFixed(1);
    controls.volumeOut.textContent = Math.round(Number(controls.volume.value) * 100);
  }

  function renderFromSettings(settings) {
    current = settings;
    controls.rate.value = settings.voice.rate;
    controls.pitch.value = settings.voice.pitch;
    controls.volume.value = settings.voice.volume;
    Object.keys(controls.filters).forEach((k) => {
      controls.filters[k].checked = settings.filters[k];
    });
    Object.keys(controls.display).forEach((k) => {
      controls.display[k].checked = settings.display[k];
    });
    renderOutputs();
  }

  function collect() {
    return {
      voice: {
        voiceURI: controls.voice.value || null,
        rate: Number(controls.rate.value),
        pitch: Number(controls.pitch.value),
        volume: Number(controls.volume.value),
      },
      filters: {
        infobox: controls.filters.infobox.checked,
        table: controls.filters.table.checked,
        caption: controls.filters.caption.checked,
        math: controls.filters.math.checked,
        footnote: controls.filters.footnote.checked,
        code: controls.filters.code.checked,
      },
      display: {
        highlight: controls.display.highlight.checked,
        follow: controls.display.follow.checked,
      },
    };
  }

  async function persist() {
    current = await S.save(collect());
    setStatus("Saved.");
  }

  function preview() {
    if (typeof speechSynthesis === "undefined") return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(
      "This is a preview of the selected Audio for Wikipedia voice."
    );
    const chosen = controls.voice.value;
    if (chosen) {
      const match = speechSynthesis.getVoices().find((v) => v.voiceURI === chosen);
      if (match) u.voice = match;
    }
    u.rate = Number(controls.rate.value);
    u.pitch = Number(controls.pitch.value);
    u.volume = Number(controls.volume.value);
    speechSynthesis.speak(u);
  }

  function wire() {
    ["rate", "pitch", "volume"].forEach((k) => {
      controls[k].addEventListener("input", renderOutputs);
      controls[k].addEventListener("change", persist);
    });
    controls.voice.addEventListener("change", persist);
    Object.values(controls.filters).forEach((c) =>
      c.addEventListener("change", persist)
    );
    Object.values(controls.display).forEach((c) =>
      c.addEventListener("change", persist)
    );
    controls.preview.addEventListener("click", preview);
    if (typeof speechSynthesis !== "undefined") {
      speechSynthesis.addEventListener &&
        speechSynthesis.addEventListener("voiceschanged", populateVoices);
    }
  }

  // Show the shortcuts as currently bound (users can rebind them).
  async function renderShortcuts() {
    const list = el("shortcut-list");
    if (!list || typeof chrome === "undefined" || !chrome.commands) return;
    try {
      const commands = await chrome.commands.getAll();
      list.textContent = "";
      commands.forEach((c) => {
        if (!c.description) return;
        const li = document.createElement("li");
        li.append(`${c.description}: `);
        const kbd = document.createElement("kbd");
        kbd.textContent = c.shortcut || "not set";
        li.append(kbd);
        list.append(li);
      });
    } catch (e) {
      /* leave the list empty */
    }
  }

  async function init() {
    const settings = await S.load();
    renderFromSettings(settings);
    await populateVoices();
    wire();
    renderShortcuts();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
