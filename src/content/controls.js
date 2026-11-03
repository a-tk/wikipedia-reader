// controls.js — builds the in-page floating control bar and the interactive
// section outline. DOM construction is factored into functions that take data
// and callbacks and return elements, so they can be unit tested in jsdom.
//
// Public surface (on WikiReader.controls):
//   buildOutlineList(sections, opts) -> <ul> of checkboxes (all checked)
//   collectSelectedIds(listEl)       -> string[] of checked section ids
//   createControlBar(handlers)       -> { root, setState, setSectionLabel }
//   mount(doc, { sections, handlers }) -> { bar, outline, destroy }
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.WikiReader = root.WikiReader || {};
  root.WikiReader.controls = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const CONTAINER_ID = "wikireader-root";

  function h(doc, tag, props, children) {
    const el = doc.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (k === "class") el.className = v;
        else if (k === "text") el.textContent = v;
        else if (k.startsWith("aria") || k === "role" || k === "for" || k === "type" || k === "id" || k === "title")
          el.setAttribute(k === "htmlFor" ? "for" : k, v);
        else if (k.startsWith("on") && typeof v === "function")
          el.addEventListener(k.slice(2).toLowerCase(), v);
        else el[k] = v;
      }
    }
    (children || []).forEach((c) => c != null && el.appendChild(c));
    return el;
  }

  // Build the outline checklist. Each section becomes a checkbox row, indented
  // by heading level, checked by default.
  function buildOutlineList(sections, opts) {
    const options = opts || {};
    const doc = options.document || document;
    const list = h(doc, "ul", {
      class: "wr-outline-list",
      role: "group",
      "aria-label": "Sections to read",
    });

    (sections || []).forEach((section) => {
      const id = section.id;
      const inputId = `wr-sec-${id}`;
      const checkbox = h(doc, "input", {
        type: "checkbox",
        id: inputId,
        checked: true,
      });
      checkbox.setAttribute("data-section-id", id);
      checkbox.checked = true;

      const labelText =
        section.level === 0 ? "Introduction" : section.headingText || "(untitled)";
      const label = h(doc, "label", { for: inputId, text: labelText });

      const indent = Math.max(0, (section.level || 0) - 2);
      const row = h(doc, "li", {
        class: `wr-outline-row wr-indent-${indent}`,
      }, [checkbox, label]);
      list.appendChild(row);
    });
    return list;
  }

  // Build a "Select all" master checkbox that toggles every section checkbox
  // in the given list and reflects their combined state (checked / unchecked /
  // indeterminate when the selection is mixed). Returns the row element plus a
  // sync() to refresh the master from the current section checkboxes.
  function buildSelectAll(listEl, opts) {
    const doc = (opts && opts.document) || document;
    const master = h(doc, "input", { type: "checkbox", id: "wr-select-all" });
    master.checked = true;

    const sectionBoxes = () =>
      Array.from(listEl.querySelectorAll('input[type="checkbox"]'));

    function sync() {
      const boxes = sectionBoxes();
      const total = boxes.length;
      const checked = boxes.filter((b) => b.checked).length;
      master.checked = total > 0 && checked === total;
      master.indeterminate = checked > 0 && checked < total;
    }

    master.addEventListener("change", () => {
      // When clicked from an indeterminate state, drive everything to checked.
      const target = master.indeterminate ? true : master.checked;
      master.indeterminate = false;
      master.checked = target;
      sectionBoxes().forEach((b) => {
        b.checked = target;
      });
    });

    // Keep the master in sync when individual section boxes change.
    listEl.addEventListener("change", (ev) => {
      if (ev.target && ev.target !== master && ev.target.type === "checkbox") {
        sync();
      }
    });

    const label = h(doc, "label", { for: "wr-select-all", text: "Select all" });
    const row = h(doc, "div", { class: "wr-select-all-row" }, [master, label]);
    sync();
    return { row, master, sync };
  }

  // Read the ids of the checked sections, in document order.
  function collectSelectedIds(listEl) {
    if (!listEl) return [];
    return Array.from(listEl.querySelectorAll('input[type="checkbox"]'))
      .filter((cb) => cb.checked)
      .map((cb) => cb.getAttribute("data-section-id"));
  }

  // Build the control bar.
  // handlers = { onToggle, onStop, onPrev, onSkip, onSettings, onVolume }.
  // Returns helpers to reflect engine state back into the UI.
  function createControlBar(handlers, opts) {
    const h2 = opts && opts.document ? opts.document : document;
    const cb = handlers || {};
    const initialVolume =
      opts && typeof opts.volume === "number" ? opts.volume : 1;
    const initialRate =
      opts && typeof opts.rate === "number" ? opts.rate : 1;

    // Build a labeled slider row: [min label] [slider] [max label].
    function sliderRow(config) {
      const slider = h(h2, "input", {
        class: config.className,
        type: "range",
        min: String(config.min),
        max: String(config.max),
        step: String(config.step),
        "aria-label": config.ariaLabel,
        title: config.ariaLabel,
      });
      slider.value = String(config.value);
      slider.addEventListener("input", () => {
        if (config.onInput) config.onInput(Number(slider.value));
      });
      const row = h(h2, "div", { class: config.rowClass }, [
        h(h2, "span", {
          class: "wr-slider-end",
          "aria-hidden": "true",
          text: config.minLabel,
        }),
        slider,
        h(h2, "span", {
          class: "wr-slider-end",
          "aria-hidden": "true",
          text: config.maxLabel,
        }),
      ]);
      return { slider, row };
    }

    const playBtn = h(h2, "button", {
      class: "wr-btn wr-play",
      type: "button",
      "aria-label": "Play",
      title: "Play / pause (Alt+Shift+P)",
      text: "▶",
      onClick: () => cb.onToggle && cb.onToggle(),
    });
    const stopBtn = h(h2, "button", {
      class: "wr-btn wr-stop",
      type: "button",
      "aria-label": "Stop",
      title: "Stop (Alt+Shift+S)",
      text: "■",
      onClick: () => cb.onStop && cb.onStop(),
    });
    const prevBtn = h(h2, "button", {
      class: "wr-btn wr-prev",
      type: "button",
      "aria-label": "Previous section",
      title: "Previous section (Alt+Shift+B)",
      text: "⏮",
      onClick: () => cb.onPrev && cb.onPrev(),
    });
    const skipBtn = h(h2, "button", {
      class: "wr-btn wr-skip",
      type: "button",
      "aria-label": "Next section",
      title: "Next section (Alt+Shift+N)",
      text: "⏭",
      onClick: () => cb.onSkip && cb.onSkip(),
    });
    const settingsBtn = h(h2, "button", {
      class: "wr-btn wr-settings",
      type: "button",
      "aria-label": "Settings",
      title: "Settings",
      text: "⚙",
      onClick: () => cb.onSettings && cb.onSettings(),
    });

    const sectionLabel = h(h2, "span", {
      class: "wr-section-label",
      role: "status",
      "aria-live": "polite",
      text: "",
    });

    // Volume slider row (labeled 0% .. 100%).
    const volume = sliderRow({
      className: "wr-volume",
      rowClass: "wr-slider-row wr-volume-row",
      ariaLabel: "Volume",
      min: 0,
      max: 1,
      step: 0.05,
      value: initialVolume,
      minLabel: "0%",
      maxLabel: "100%",
      onInput: (v) => cb.onVolume && cb.onVolume(v),
    });
    const volumeSlider = volume.slider;
    const volumeRow = volume.row;

    // Playback-speed slider row (labeled 0.5× .. 3.0×), below the volume row.
    const rate = sliderRow({
      className: "wr-rate",
      rowClass: "wr-slider-row wr-rate-row",
      ariaLabel: "Playback speed",
      min: 0.5,
      max: 3,
      step: 0.1,
      value: initialRate,
      minLabel: "0.5\u00d7",
      maxLabel: "3.0\u00d7",
      onInput: (v) => cb.onRate && cb.onRate(v),
    });
    const rateSlider = rate.slider;
    const rateRow = rate.row;

    const controlsRow = h(h2, "div", { class: "wr-controls-row" }, [
      prevBtn,
      playBtn,
      stopBtn,
      skipBtn,
      settingsBtn,
    ]);

    const root = h(h2, "div", {
      class: "wr-bar",
      role: "region",
      "aria-label": "Wikipedia Reader controls",
    }, [controlsRow, volumeRow, rateRow, sectionLabel]);

    function setState(state) {
      root.setAttribute("data-state", state);
      if (state === "playing") {
        playBtn.textContent = "⏸";
        playBtn.setAttribute("aria-label", "Pause");
      } else {
        playBtn.textContent = "▶";
        playBtn.setAttribute("aria-label", state === "paused" ? "Resume" : "Play");
      }
    }

    function setSectionLabel(text) {
      sectionLabel.textContent = text || "";
    }

    function setVolume(value) {
      volumeSlider.value = String(value);
    }

    function setRate(value) {
      rateSlider.value = String(value);
    }

    setState("idle");
    return {
      root,
      playBtn,
      stopBtn,
      prevBtn,
      skipBtn,
      settingsBtn,
      volumeSlider,
      rateSlider,
      setState,
      setSectionLabel,
      setVolume,
      setRate,
    };
  }

  // Mount everything into the page. Returns handles and a destroy().
  function mount(doc, config) {
    const d = doc || document;
    const cfg = config || {};
    // Remove any previous instance.
    const existing = d.getElementById(CONTAINER_ID);
    if (existing) existing.remove();

    const bar = createControlBar(cfg.handlers, {
      document: d,
      volume: cfg.volume,
      rate: cfg.rate,
    });
    const outline = buildOutlineList(cfg.sections, { document: d });
    const selectAll = buildSelectAll(outline, { document: d });

    const outlinePanel = h(d, "div", {
      class: "wr-outline-panel",
      role: "region",
      "aria-label": "Choose sections to read",
    }, [
      h(d, "div", { class: "wr-outline-title", text: "Read these sections" }),
      selectAll.row,
      outline,
    ]);

    const container = h(d, "div", { id: CONTAINER_ID, class: "wr-container" }, [
      bar.root,
      outlinePanel,
    ]);

    (d.body || d.documentElement).appendChild(container);

    return {
      container,
      bar,
      outlineEl: outline,
      selectAll,
      getSelectedIds: () => collectSelectedIds(outline),
      destroy: () => container.remove(),
    };
  }

  return {
    CONTAINER_ID,
    buildOutlineList,
    buildSelectAll,
    collectSelectedIds,
    createControlBar,
    mount,
  };
});
