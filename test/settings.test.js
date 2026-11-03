import { describe, it, expect } from "vitest";
import settings from "../src/core/settings.js";

// Mock chrome.storage.sync using the callback style.
function makeMockStorage(initial) {
  let store = initial ? { [settings.STORAGE_KEY]: initial } : {};
  return {
    store,
    get(query, cb) {
      const key = Object.keys(query)[0];
      cb({ [key]: store[key] !== undefined ? store[key] : query[key] });
    },
    set(obj, cb) {
      Object.assign(store, obj);
      cb();
    },
  };
}

describe("settings.normalize", () => {
  it("returns complete defaults for empty input", () => {
    const s = settings.normalize(null);
    expect(s).toEqual(settings.DEFAULTS);
  });

  it("merges a partial object onto defaults", () => {
    const s = settings.normalize({ voice: { rate: 2 } });
    expect(s.voice.rate).toBe(2);
    expect(s.voice.pitch).toBe(1); // default preserved
    expect(s.filters.infobox).toBe(true);
  });

  it("clamps out-of-range numeric values", () => {
    const s = settings.normalize({
      voice: { rate: 99, pitch: -5, volume: 10 },
    });
    expect(s.voice.rate).toBe(settings.RANGES.rate.max);
    expect(s.voice.pitch).toBe(settings.RANGES.pitch.min);
    expect(s.voice.volume).toBe(settings.RANGES.volume.max);
  });

  it("falls back to default for non-numeric values", () => {
    const s = settings.normalize({ voice: { rate: "fast" } });
    expect(s.voice.rate).toBe(settings.RANGES.rate.def);
  });

  it("coerces filter values to booleans", () => {
    const s = settings.normalize({ filters: { infobox: 0, table: 1 } });
    expect(s.filters.infobox).toBe(false);
    expect(s.filters.table).toBe(true);
    expect(s.filters.math).toBe(true); // default preserved
  });

  it("includes the code filter, defaulting to on", () => {
    expect(settings.DEFAULTS.filters.code).toBe(true);
    const s = settings.normalize({ filters: { code: false } });
    expect(s.filters.code).toBe(false);
    const d = settings.normalize({ filters: {} });
    expect(d.filters.code).toBe(true);
  });

  it("rejects an empty voiceURI in favor of null", () => {
    const s = settings.normalize({ voice: { voiceURI: "" } });
    expect(s.voice.voiceURI).toBe(null);
  });
});

describe("settings.load / save", () => {
  it("returns defaults when storage is empty", async () => {
    const storage = makeMockStorage(null);
    const s = await settings.load(storage);
    expect(s).toEqual(settings.DEFAULTS);
  });

  it("round-trips a saved value", async () => {
    const storage = makeMockStorage(null);
    await settings.save(
      { voice: { voiceURI: "urn:voice:x", rate: 1.4 }, filters: { math: false } },
      storage
    );
    const s = await settings.load(storage);
    expect(s.voice.voiceURI).toBe("urn:voice:x");
    expect(s.voice.rate).toBe(1.4);
    expect(s.filters.math).toBe(false);
    expect(s.filters.infobox).toBe(true);
  });

  it("normalizes untrusted stored data on load", async () => {
    const storage = makeMockStorage({ voice: { rate: 999 }, filters: "nope" });
    const s = await settings.load(storage);
    expect(s.voice.rate).toBe(settings.RANGES.rate.max);
    expect(s.filters.infobox).toBe(true);
  });

  it("falls back to defaults when no storage is available", async () => {
    const s = await settings.load(null);
    expect(s).toEqual(settings.DEFAULTS);
  });
});
