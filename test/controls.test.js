import { describe, it, expect, vi, beforeEach } from "vitest";
import controls from "../src/content/controls.js";

const sampleSections = [
  { id: "lead", headingText: "", level: 0 },
  { id: "History", headingText: "History", level: 2 },
  { id: "Early_history", headingText: "Early history", level: 3 },
  { id: "References", headingText: "References", level: 2 },
];

describe("buildOutlineList", () => {
  it("creates one checked checkbox per section", () => {
    const list = controls.buildOutlineList(sampleSections, { document });
    const boxes = list.querySelectorAll('input[type="checkbox"]');
    expect(boxes.length).toBe(4);
    boxes.forEach((b) => expect(b.checked).toBe(true));
  });

  it("labels the lead section as Introduction", () => {
    const list = controls.buildOutlineList(sampleSections, { document });
    const firstLabel = list.querySelector("label");
    expect(firstLabel.textContent).toBe("Introduction");
  });

  it("indents by heading level", () => {
    const list = controls.buildOutlineList(sampleSections, { document });
    const rows = list.querySelectorAll(".wr-outline-row");
    // History (level 2) -> indent 0; Early history (level 3) -> indent 1.
    expect(rows[1].className).toContain("wr-indent-0");
    expect(rows[2].className).toContain("wr-indent-1");
  });

  it("tags checkboxes with their section id", () => {
    const list = controls.buildOutlineList(sampleSections, { document });
    const ids = Array.from(list.querySelectorAll("input")).map((i) =>
      i.getAttribute("data-section-id")
    );
    expect(ids).toEqual(["lead", "History", "Early_history", "References"]);
  });
});

describe("collectSelectedIds", () => {
  it("returns only checked ids in document order", () => {
    const list = controls.buildOutlineList(sampleSections, { document });
    const boxes = list.querySelectorAll('input[type="checkbox"]');
    boxes[1].checked = false; // uncheck History
    boxes[3].checked = false; // uncheck References
    expect(controls.collectSelectedIds(list)).toEqual(["lead", "Early_history"]);
  });

  it("returns all ids when all are checked", () => {
    const list = controls.buildOutlineList(sampleSections, { document });
    expect(controls.collectSelectedIds(list)).toEqual([
      "lead",
      "History",
      "Early_history",
      "References",
    ]);
  });

  it("returns an empty array for a null list", () => {
    expect(controls.collectSelectedIds(null)).toEqual([]);
  });
});

describe("createControlBar", () => {
  it("wires button clicks to handlers", () => {
    const onToggle = vi.fn();
    const onStop = vi.fn();
    const onSkip = vi.fn();
    const onSettings = vi.fn();
    const bar = controls.createControlBar(
      { onToggle, onStop, onSkip, onSettings },
      { document }
    );
    bar.playBtn.click();
    bar.stopBtn.click();
    bar.skipBtn.click();
    bar.settingsBtn.click();
    expect(onToggle).toHaveBeenCalledOnce();
    expect(onStop).toHaveBeenCalledOnce();
    expect(onSkip).toHaveBeenCalledOnce();
    expect(onSettings).toHaveBeenCalledOnce();
  });

  it("reflects engine state into the play button", () => {
    const bar = controls.createControlBar({}, { document });
    bar.setState("playing");
    expect(bar.playBtn.textContent).toBe("⏸");
    expect(bar.playBtn.getAttribute("aria-label")).toBe("Pause");
    bar.setState("paused");
    expect(bar.playBtn.getAttribute("aria-label")).toBe("Resume");
    bar.setState("idle");
    expect(bar.playBtn.textContent).toBe("▶");
  });
});

describe("mount", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("mounts a single container and replaces a prior one", () => {
    controls.mount(document, { sections: sampleSections, handlers: {} });
    controls.mount(document, { sections: sampleSections, handlers: {} });
    expect(document.querySelectorAll("#wikireader-root").length).toBe(1);
  });

  it("exposes getSelectedIds reflecting checkbox state", () => {
    const ui = controls.mount(document, { sections: sampleSections, handlers: {} });
    expect(ui.getSelectedIds().length).toBe(4);
    ui.outlineEl.querySelector('input[data-section-id="References"]').checked = false;
    expect(ui.getSelectedIds()).not.toContain("References");
  });
});

describe("buildSelectAll", () => {
  function setup() {
    document.body.innerHTML = "";
    const list = controls.buildOutlineList(sampleSections, { document });
    document.body.appendChild(list);
    const selectAll = controls.buildSelectAll(list, { document });
    document.body.appendChild(selectAll.row);
    return { list, selectAll };
  }

  it("starts checked when every section is selected", () => {
    const { selectAll } = setup();
    expect(selectAll.master.checked).toBe(true);
    expect(selectAll.master.indeterminate).toBe(false);
  });

  it("deselects every section when toggled off", () => {
    const { list, selectAll } = setup();
    selectAll.master.checked = false;
    selectAll.master.dispatchEvent(new Event("change"));
    const boxes = list.querySelectorAll('input[type="checkbox"]');
    boxes.forEach((b) => expect(b.checked).toBe(false));
    expect(controls.collectSelectedIds(list)).toEqual([]);
  });

  it("reselects every section when toggled back on", () => {
    const { list, selectAll } = setup();
    selectAll.master.checked = false;
    selectAll.master.dispatchEvent(new Event("change"));
    selectAll.master.checked = true;
    selectAll.master.dispatchEvent(new Event("change"));
    const boxes = list.querySelectorAll('input[type="checkbox"]');
    boxes.forEach((b) => expect(b.checked).toBe(true));
  });

  it("becomes indeterminate when only some sections are selected", () => {
    const { list, selectAll } = setup();
    const first = list.querySelector('input[type="checkbox"]');
    first.checked = false;
    first.dispatchEvent(new Event("change", { bubbles: true }));
    expect(selectAll.master.checked).toBe(false);
    expect(selectAll.master.indeterminate).toBe(true);
  });

  it("becomes unchecked when all sections are manually deselected", () => {
    const { list, selectAll } = setup();
    list.querySelectorAll('input[type="checkbox"]').forEach((b) => {
      b.checked = false;
      b.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(selectAll.master.checked).toBe(false);
    expect(selectAll.master.indeterminate).toBe(false);
  });

  it("clicking from indeterminate selects everything", () => {
    const { list, selectAll } = setup();
    const first = list.querySelector('input[type="checkbox"]');
    first.checked = false;
    first.dispatchEvent(new Event("change", { bubbles: true }));
    // Now indeterminate; simulate a user click driving it to all-selected.
    selectAll.master.dispatchEvent(new Event("change"));
    const boxes = list.querySelectorAll('input[type="checkbox"]');
    boxes.forEach((b) => expect(b.checked).toBe(true));
    expect(selectAll.master.indeterminate).toBe(false);
    expect(selectAll.master.checked).toBe(true);
  });
});

describe("mount select-all integration", () => {
  it("exposes a selectAll master wired to the outline", () => {
    document.body.innerHTML = "";
    const ui = controls.mount(document, { sections: sampleSections, handlers: {} });
    expect(ui.selectAll.master).toBeTruthy();
    ui.selectAll.master.checked = false;
    ui.selectAll.master.dispatchEvent(new Event("change"));
    expect(ui.getSelectedIds()).toEqual([]);
    ui.destroy();
  });
});
