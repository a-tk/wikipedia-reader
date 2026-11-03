// speech.js — a managed queue over the Web Speech API (speechSynthesis).
//
// Why a queue instead of one big utterance:
//   Chrome truncates long utterances and can stall queued speech after ~15s.
//   We split content into short chunks (from filters.js), speak them one at a
//   time, and run a periodic pause()/resume() keep-alive while speaking.
//
// The engine is dependency-injected (synth + utterance factory) so it can be
// unit tested with a mock in jsdom, where real speechSynthesis is absent.
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.WikiReader = root.WikiReader || {};
  root.WikiReader.SpeechEngine = api.SpeechEngine;
  root.WikiReader.loadVoices = api.loadVoices;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const STATE = {
    IDLE: "idle",
    PLAYING: "playing",
    PAUSED: "paused",
  };

  // Resolve the available voices, waiting for the async `voiceschanged` event
  // if the list is not yet populated. Returns a Promise<SpeechSynthesisVoice[]>.
  function loadVoices(synth, timeoutMs = 2000) {
    const s = synth || (typeof speechSynthesis !== "undefined" ? speechSynthesis : null);
    return new Promise((resolve) => {
      if (!s) return resolve([]);
      const existing = s.getVoices ? s.getVoices() : [];
      if (existing && existing.length) return resolve(existing);

      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve(s.getVoices ? s.getVoices() : []);
      };
      if (typeof s.addEventListener === "function") {
        s.addEventListener("voiceschanged", finish, { once: true });
      } else if ("onvoiceschanged" in s) {
        s.onvoiceschanged = finish;
      }
      setTimeout(finish, timeoutMs);
    });
  }

  class SpeechEngine {
    // deps: { synth, createUtterance, keepAliveMs }
    //   synth           — a speechSynthesis-like object
    //   createUtterance — (text) => SpeechSynthesisUtterance-like object
    //   keepAliveMs     — interval for the pause/resume keep-alive (0 disables)
    constructor(deps = {}) {
      this.synth =
        deps.synth ||
        (typeof speechSynthesis !== "undefined" ? speechSynthesis : null);
      this.createUtterance =
        deps.createUtterance ||
        ((text) =>
          typeof SpeechSynthesisUtterance !== "undefined"
            ? new SpeechSynthesisUtterance(text)
            : { text });
      this.keepAliveMs = deps.keepAliveMs == null ? 10000 : deps.keepAliveMs;

      this.queue = [];
      this.index = -1;
      this.state = STATE.IDLE;
      this.settings = { voice: null, rate: 1, pitch: 1, volume: 1 };
      this.listeners = {};
      this._keepAliveTimer = null;
      this._gapTimer = null;
      this._current = null;
    }

    _clearGapTimer() {
      if (this._gapTimer) {
        clearTimeout(this._gapTimer);
        this._gapTimer = null;
      }
    }

    on(event, cb) {
      (this.listeners[event] = this.listeners[event] || []).push(cb);
      return this;
    }

    _emit(event, payload) {
      (this.listeners[event] || []).forEach((cb) => {
        try {
          cb(payload);
        } catch (e) {
          /* listener errors must not break the queue */
        }
      });
    }

    applySettings(settings) {
      this.settings = Object.assign({}, this.settings, settings || {});
    }

    // queue: array of { sectionId, sectionIndex, text, pauseAfterMs? }
    // pauseAfterMs inserts a silent gap after the chunk before the next one.
    load(items) {
      this.stop();
      this.queue = Array.isArray(items) ? items.slice() : [];
      this.index = -1;
      return this;
    }

    get length() {
      return this.queue.length;
    }

    getState() {
      return this.state;
    }

    currentItem() {
      return this.index >= 0 ? this.queue[this.index] || null : null;
    }

    play() {
      if (!this.synth || this.queue.length === 0) return;
      if (this.state === STATE.PAUSED) {
        this.resume();
        return;
      }
      if (this.state === STATE.PLAYING) return;
      this.state = STATE.PLAYING;
      if (this.index < 0) this.index = 0;
      this._emit("start", { total: this.queue.length });
      this._speakCurrent();
      this._startKeepAlive();
    }

    _speakCurrent() {
      const item = this.queue[this.index];
      if (!item) {
        this._finishAll();
        return;
      }
      const prev = this._current && this._current.sectionId;
      if (item.sectionId !== prev) {
        this._emit("section", {
          sectionId: item.sectionId,
          sectionIndex: item.sectionIndex,
        });
      }
      this._current = item;

      const u = this.createUtterance(item.text);
      if (this.settings.voice) u.voice = this.settings.voice;
      u.rate = this.settings.rate;
      u.pitch = this.settings.pitch;
      u.volume = this.settings.volume;

      u.onboundary = (ev) => {
        this._emit("boundary", {
          index: this.index,
          charIndex: ev && ev.charIndex,
          item,
        });
      };
      u.onend = () => {
        // Ignore stale end events fired after a stop().
        if (this.state === STATE.IDLE) return;
        this._emit("chunkend", { index: this.index, item });
        this.index += 1;
        if (this.index >= this.queue.length) {
          this._finishAll();
        } else if (this.state === STATE.PLAYING) {
          // Honor a requested silent gap after this chunk (e.g. the pause that
          // follows a spoken section heading) before speaking the next one.
          const gap = Number(item.pauseAfterMs) || 0;
          if (gap > 0) {
            this._gapTimer = setTimeout(() => {
              this._gapTimer = null;
              if (this.state === STATE.PLAYING) this._speakCurrent();
            }, gap);
          } else {
            this._speakCurrent();
          }
        }
      };
      u.onerror = (ev) => {
        this._emit("error", { index: this.index, error: ev && ev.error });
        // Advance past the failed chunk so one bad chunk can't wedge playback.
        if (this.state === STATE.PLAYING) {
          this.index += 1;
          if (this.index >= this.queue.length) this._finishAll();
          else this._speakCurrent();
        }
      };

      this._emit("chunkstart", { index: this.index, item });
      this.synth.speak(u);
    }

    pause() {
      if (this.state !== STATE.PLAYING) return;
      // If we're in a post-heading silent gap, remember so resume re-speaks
      // the pending chunk rather than relying on the synth to resume it.
      const wasInGap = this._gapTimer != null;
      this._clearGapTimer();
      this.state = STATE.PAUSED;
      this._pausedInGap = wasInGap;
      if (this.synth.pause) this.synth.pause();
      this._stopKeepAlive();
      this._emit("pause", { index: this.index });
    }

    resume() {
      if (this.state !== STATE.PAUSED) return;
      this.state = STATE.PLAYING;
      this._startKeepAlive();
      this._emit("resume", { index: this.index });
      if (this._pausedInGap) {
        // The next chunk had not started speaking yet; start it now.
        this._pausedInGap = false;
        this._speakCurrent();
      } else if (this.synth.resume) {
        this.synth.resume();
      }
    }

    togglePlay() {
      if (this.state === STATE.PLAYING) this.pause();
      else if (this.state === STATE.PAUSED) this.resume();
      else this.play();
    }

    stop() {
      const wasActive = this.state !== STATE.IDLE;
      this.state = STATE.IDLE;
      this._clearGapTimer();
      this._pausedInGap = false;
      this._stopKeepAlive();
      this._current = null;
      if (this.synth && this.synth.cancel) this.synth.cancel();
      if (wasActive) this._emit("stop", {});
    }

    // Skip to the first chunk of the next section (or end if none).
    skipSection() {
      if (this.queue.length === 0) return;
      const current = this.queue[this.index] || this.queue[0];
      const currentSection = current ? current.sectionId : null;
      let next = this.index + 1;
      while (next < this.queue.length && this.queue[next].sectionId === currentSection) {
        next += 1;
      }
      this._jumpTo(next);
    }

    skipSentence() {
      this._jumpTo(this.index + 1);
    }

    // Go to the previous section. Media-player style: if we're past the first
    // chunk of the current section, restart the current section; otherwise jump
    // to the start of the preceding section.
    prevSection() {
      if (this.queue.length === 0) return;
      const idx = Math.max(0, this.index);
      const currentSection = this.queue[idx] ? this.queue[idx].sectionId : null;

      // Find the first chunk index of the current section.
      let start = idx;
      while (start > 0 && this.queue[start - 1].sectionId === currentSection) {
        start -= 1;
      }

      if (idx > start) {
        // Partway through: restart the current section.
        this._jumpTo(start);
        return;
      }
      // At the start of the section: jump to the previous section's start.
      if (start === 0) {
        this._jumpTo(0);
        return;
      }
      const prevSectionId = this.queue[start - 1].sectionId;
      let prevStart = start - 1;
      while (prevStart > 0 && this.queue[prevStart - 1].sectionId === prevSectionId) {
        prevStart -= 1;
      }
      this._jumpTo(prevStart);
    }

    _jumpTo(targetIndex) {
      if (targetIndex >= this.queue.length) {
        this.stop();
        this._finishAll();
        return;
      }
      const resume = this.state !== STATE.IDLE;
      this._clearGapTimer();
      this._pausedInGap = false;
      // Cancel current utterance without emitting a user-facing stop.
      if (this.synth && this.synth.cancel) this.synth.cancel();
      this.index = Math.max(0, targetIndex);
      if (resume) {
        this.state = STATE.PLAYING;
        this._speakCurrent();
        this._startKeepAlive();
      }
    }

    _finishAll() {
      this.state = STATE.IDLE;
      this._clearGapTimer();
      this._pausedInGap = false;
      this._stopKeepAlive();
      this._current = null;
      this._emit("end", {});
    }

    _startKeepAlive() {
      if (!this.keepAliveMs || this._keepAliveTimer) return;
      this._keepAliveTimer = setInterval(() => {
        // The documented Chrome workaround: a quick pause()+resume() keeps the
        // synth from stalling on long queues.
        if (this.state === STATE.PLAYING && this.synth.pause && this.synth.resume) {
          this.synth.pause();
          this.synth.resume();
        }
      }, this.keepAliveMs);
    }

    _stopKeepAlive() {
      if (this._keepAliveTimer) {
        clearInterval(this._keepAliveTimer);
        this._keepAliveTimer = null;
      }
    }
  }

  return { SpeechEngine, loadVoices, STATE };
});
