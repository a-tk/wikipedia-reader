// settings.js — load/save persisted settings via chrome.storage.sync.
//
// Settings are split into two groups:
//   voice   — { voiceURI, rate, pitch, volume }
//   filters — { infobox, table, caption, math, footnote } booleans
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

  // Promise-based get that works with both callback and promise chrome APIs.
  function load(storage) {
    const s = getStorage(storage);
    return new Promise((resolve) => {
      if (!s) return resolve(normalize(null));
      try {
        const maybe = s.get({ [STORAGE_KEY]: null }, (result) => {
          resolve(normalize(result && result[STORAGE_KEY]));
        });
        // Some polyfills return a promise instead of using the callback.
        if (maybe && typeof maybe.then === "function") {
          maybe.then((result) =>
            resolve(normalize(result && result[STORAGE_KEY]))
          );
        }
      } catch (e) {
        resolve(normalize(null));
      }
    });
  }

  function save(partial, storage) {
    const s = getStorage(storage);
    const normalized = normalize(partial);
    return new Promise((resolve) => {
      if (!s) return resolve(normalized);
      try {
        const maybe = s.set({ [STORAGE_KEY]: normalized }, () =>
          resolve(normalized)
        );
        if (maybe && typeof maybe.then === "function") {
          maybe.then(() => resolve(normalized));
        }
      } catch (e) {
        resolve(normalized);
      }
    });
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
