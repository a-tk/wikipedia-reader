import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import speech from "../src/core/speech.js";

const { SpeechEngine, loadVoices } = speech;

// A controllable mock synth. speak() stores the utterance; tests drive
// completion by calling finishCurrent() to fire onend.
function makeMockSynth() {
  const spoken = [];
  let current = null;
  return {
    spoken,
    pauseCalls: 0,
    resumeCalls: 0,
    cancelCalls: 0,
    getVoices: () => [],
    speak(u) {
      current = u;
      spoken.push(u);
    },
    pause() {
      this.pauseCalls += 1;
    },
    resume() {
      this.resumeCalls += 1;
    },
    cancel() {
      this.cancelCalls += 1;
      current = null;
    },
    // test helper
    finishCurrent() {
      const u = spoken[spoken.length - 1];
      if (u && typeof u.onend === "function") u.onend({});
    },
  };
}

function makeEngine(synth) {
  return new SpeechEngine({
    synth,
    createUtterance: (text) => ({ text }),
    keepAliveMs: 0, // disable timers in unit tests
  });
}

const items = [
  { sectionId: "lead", sectionIndex: 0, text: "Lead one." },
  { sectionId: "lead", sectionIndex: 0, text: "Lead two." },
  { sectionId: "History", sectionIndex: 1, text: "History one." },
];

describe("SpeechEngine queue", () => {
  let synth;
  let engine;
  beforeEach(() => {
    synth = makeMockSynth();
    engine = makeEngine(synth);
    engine.load(items);
  });

  it("speaks the first chunk on play", () => {
    engine.play();
    expect(engine.getState()).toBe("playing");
    expect(synth.spoken.length).toBe(1);
    expect(synth.spoken[0].text).toBe("Lead one.");
  });

  it("advances through the queue on end events", () => {
    engine.play();
    synth.finishCurrent();
    expect(synth.spoken[1].text).toBe("Lead two.");
    synth.finishCurrent();
    expect(synth.spoken[2].text).toBe("History one.");
  });

  it("emits end and returns to idle after the last chunk", () => {
    const onEnd = vi.fn();
    engine.on("end", onEnd);
    engine.play();
    synth.finishCurrent();
    synth.finishCurrent();
    synth.finishCurrent();
    expect(onEnd).toHaveBeenCalledOnce();
    expect(engine.getState()).toBe("idle");
  });

  it("applies voice settings to each utterance", () => {
    engine.applySettings({ rate: 1.5, pitch: 0.8, volume: 0.6 });
    engine.play();
    const u = synth.spoken[0];
    expect(u.rate).toBe(1.5);
    expect(u.pitch).toBe(0.8);
    expect(u.volume).toBe(0.6);
  });
});

describe("SpeechEngine state transitions", () => {
  let synth;
  let engine;
  beforeEach(() => {
    synth = makeMockSynth();
    engine = makeEngine(synth);
    engine.load(items);
  });

  it("pause() and resume() move between paused and playing", () => {
    engine.play();
    engine.pause();
    expect(engine.getState()).toBe("paused");
    expect(synth.pauseCalls).toBe(1);
    engine.resume();
    expect(engine.getState()).toBe("playing");
    expect(synth.resumeCalls).toBe(1);
  });

  it("togglePlay cycles play -> pause -> resume", () => {
    engine.togglePlay();
    expect(engine.getState()).toBe("playing");
    engine.togglePlay();
    expect(engine.getState()).toBe("paused");
    engine.togglePlay();
    expect(engine.getState()).toBe("playing");
  });

  it("stop() cancels and returns to idle", () => {
    engine.play();
    engine.stop();
    expect(engine.getState()).toBe("idle");
    expect(synth.cancelCalls).toBeGreaterThanOrEqual(1);
  });

  it("ignores a stale onend fired after stop", () => {
    engine.play();
    const u = synth.spoken[0];
    engine.stop();
    // Fire the end event late; should not advance or throw.
    u.onend({});
    expect(engine.getState()).toBe("idle");
  });
});

describe("SpeechEngine skipping", () => {
  let synth;
  let engine;
  beforeEach(() => {
    synth = makeMockSynth();
    engine = makeEngine(synth);
    engine.load(items);
  });

  it("skipSection jumps to the next section's first chunk", () => {
    engine.play();
    expect(engine.currentItem().text).toBe("Lead one.");
    engine.skipSection();
    // Should now be speaking the History section (skipping Lead two).
    expect(engine.currentItem().sectionId).toBe("History");
    expect(synth.spoken[synth.spoken.length - 1].text).toBe("History one.");
  });

  it("skipSentence advances by one chunk", () => {
    engine.play();
    engine.skipSentence();
    expect(engine.currentItem().text).toBe("Lead two.");
  });

  it("skipping past the end stops playback", () => {
    const onEnd = vi.fn();
    engine.on("end", onEnd);
    engine.load([items[2]]);
    engine.play();
    engine.skipSection();
    expect(engine.getState()).toBe("idle");
    expect(onEnd).toHaveBeenCalled();
  });

  it("emits a section event when entering a new section", () => {
    const onSection = vi.fn();
    engine.on("section", onSection);
    engine.play();
    synth.finishCurrent(); // lead two, same section
    synth.finishCurrent(); // enters History
    const sections = onSection.mock.calls.map((c) => c[0].sectionId);
    expect(sections).toContain("lead");
    expect(sections).toContain("History");
  });
});

describe("loadVoices", () => {
  it("resolves immediately when voices are already present", async () => {
    const synth = {
      getVoices: () => [{ name: "A" }, { name: "B" }],
    };
    const voices = await loadVoices(synth);
    expect(voices.map((v) => v.name)).toEqual(["A", "B"]);
  });

  it("waits for voiceschanged when the list starts empty", async () => {
    let voices = [];
    const handlers = {};
    const synth = {
      getVoices: () => voices,
      addEventListener: (ev, cb) => {
        handlers[ev] = cb;
      },
    };
    const p = loadVoices(synth, 1000);
    voices = [{ name: "Late" }];
    handlers["voiceschanged"]();
    const result = await p;
    expect(result.map((v) => v.name)).toEqual(["Late"]);
  });
});

describe("SpeechEngine post-heading pause gap", () => {
  let synth;
  let engine;
  const gapItems = [
    { sectionId: "History", sectionIndex: 1, text: "History.", pauseAfterMs: 700 },
    { sectionId: "History", sectionIndex: 1, text: "History prose." },
  ];

  beforeEach(() => {
    vi.useFakeTimers();
    synth = makeMockSynth();
    engine = makeEngine(synth);
    engine.load(gapItems);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("delays the next chunk until the gap elapses", () => {
    engine.play();
    expect(synth.spoken[0].text).toBe("History.");
    // Heading finishes; prose should NOT be spoken immediately.
    synth.finishCurrent();
    expect(synth.spoken.length).toBe(1);
    // After the gap, the prose chunk is spoken.
    vi.advanceTimersByTime(700);
    expect(synth.spoken.length).toBe(2);
    expect(synth.spoken[1].text).toBe("History prose.");
  });

  it("does not speak the next chunk if stopped during the gap", () => {
    engine.play();
    synth.finishCurrent(); // heading ends, gap timer running
    engine.stop();
    vi.advanceTimersByTime(700);
    expect(synth.spoken.length).toBe(1);
    expect(engine.getState()).toBe("idle");
  });

  it("resumes the pending chunk after pausing during the gap", () => {
    engine.play();
    synth.finishCurrent(); // heading ends, gap timer running
    engine.pause();
    vi.advanceTimersByTime(700); // timer was cleared, nothing happens
    expect(synth.spoken.length).toBe(1);
    engine.resume();
    expect(synth.spoken.length).toBe(2);
    expect(synth.spoken[1].text).toBe("History prose.");
  });
});
