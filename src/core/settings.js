// settings.js — load/save persisted settings via chrome.storage.sync.
//
// Settings are split into two groups:
//   voice   — { voiceURI, rate, pitch, volume }
//   filters — { infobox, table, caption, math, footnote, code } booleans
//   display — { highlight, follow } booleans (sentence highlight, auto-scroll)
//
// The storage layer is dependency-injected (defaults to chrome.storage.sync)
// so it can be unit tested with a mock.
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.WikiReader = root.WikiReader || {};
  root.WikiReader.settings = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const DEFAULTS = {
    voice: {
      voiceURI: null, // null => browser default voice
      rate: 1,
      pitch: 1,
      volume: 1,
    },
    filters: {
      infobox: true,
      table: true,
      caption: true,
      math: true,
      footnote: true,
      code: true,
    },
    display: {
      highlight: true, // highlight the sentence being read
      follow: true, // scroll the page to keep that sentence in view
    },
  };

  const STORAGE_KEY = "wikiReaderSettings";

  const RANGES = {
    rate: { min: 0.5, max: 3, def: 1 },
    pitch: { min: 0, max: 2, def: 1 },
    volume: { min: 0, max: 1, def: 1 },
  };

  function clampNumber(value, range) {
    const n = Number(value);
    if (!Number.isFinite(n)) return range.def;
    return Math.min(range.max, Math.max(range.min, n));
  }

  function asBool(value, fallback) {
    if (typeof value === "boolean") return value;
    if (value === undefined || value === null) return fallback;
    return Boolean(value);
  }

  // Merge a partial/untrusted stored object onto the defaults, validating types
  // and clamping numeric ranges. Always returns a complete, safe object.
  function normalize(stored) {
    const s = stored && typeof stored === "object" ? stored : {};
    const v = s.voice && typeof s.voice === "object" ? s.voice : {};
    const f = s.filters && typeof s.filters === "object" ? s.filters : {};
    const d = s.display && typeof s.display === "object" ? s.display : {};
    return {
      voice: {
        voiceURI:
          typeof v.voiceURI === "string" && v.voiceURI ? v.voiceURI : null,
        rate: clampNumber(v.rate, RANGES.rate),
        pitch: clampNumber(v.pitch, RANGES.pitch),
        volume: clampNumber(v.volume, RANGES.volume),
      },
      filters: {
        infobox: asBool(f.infobox, DEFAULTS.filters.infobox),
        table: asBool(f.table, DEFAULTS.filters.table),
        caption: asBool(f.caption, DEFAULTS.filters.caption),
        math: asBool(f.math, DEFAULTS.filters.math),
        footnote: asBool(f.footnote, DEFAULTS.filters.footnote),
        code: asBool(f.code, DEFAULTS.filters.code),
      },
      display: {
        highlight: asBool(d.highlight, DEFAULTS.display.highlight),
        follow: asBool(d.follow, DEFAULTS.display.follow),
      },
    };
  }

  function getStorage(storage) {
    if (storage) return storage;
    if (
      typeof chrome !== "undefined" &&
      chrome.storage &&
      chrome.storage.sync
    ) {
      return chrome.storage.sync;
    }
    return null;
  }

  // Load settings. Never rejects: any storage failure yields the defaults.
  async function load(storage) {
    const s = getStorage(storage);
    if (!s) return normalize(null);
    try {
      const result = await s.get({ [STORAGE_KEY]: null });
      return normalize(result && result[STORAGE_KEY]);
    } catch (e) {
      return normalize(null);
    }
  }

  // Persist settings. Never rejects (e.g. when the extension context was
  // invalidated by a reload); resolves with the normalized value either way.
  async function save(partial, storage) {
    const s = getStorage(storage);
    const normalized = normalize(partial);
    if (!s) return normalized;
    try {
      await s.set({ [STORAGE_KEY]: normalized });
    } catch (e) {
      /* ignore: settings simply won't persist */
    }
    return normalized;
  }

  return {
    DEFAULTS,
    STORAGE_KEY,
    RANGES,
    normalize,
    clampNumber,
    load,
    save,
  };
});
