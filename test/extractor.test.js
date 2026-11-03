import { describe, it, expect, beforeEach } from "vitest";
import extractor from "../src/core/extractor.js";
import { loadFixture } from "./helpers/loadFixture.js";

describe("extractor", () => {
  let root;
  beforeEach(() => {
    root = loadFixture("sample-article.html");
  });

  it("produces sections in document order", () => {
    const outline = extractor.extractOutline(root);
    const headings = outline.map((s) => s.headingText);
    expect(headings).toEqual([
      "", // lead
      "History",
      "Early history",
      "Legacy section",
      "References",
      "External links",
    ]);
  });

  it("captures the lead section before the first heading", () => {
    const sections = extractor.extractSections(root);
    const lead = sections[0];
    expect(lead.level).toBe(0);
    expect(lead.id).toBe("lead");
    // Two lead <p> paragraphs plus the infobox table.
    expect(lead.contentNodes.length).toBeGreaterThanOrEqual(2);
    const text = lead.contentNodes.map((n) => n.textContent).join(" ");
    expect(text).toContain("example subject");
  });

  it("assigns correct heading levels across both markup styles", () => {
    const outline = extractor.extractOutline(root);
    const byText = Object.fromEntries(
      outline.map((s) => [s.headingText, s.level])
    );
    expect(byText["History"]).toBe(2); // Parsoid wrapper
    expect(byText["Early history"]).toBe(3); // Parsoid wrapper h3
    expect(byText["Legacy section"]).toBe(2); // legacy mw-headline span
    expect(byText["References"]).toBe(2);
  });

  it("reads ids from both the heading and the mw-headline span", () => {
    const outline = extractor.extractOutline(root);
    const byText = Object.fromEntries(
      outline.map((s) => [s.headingText, s.id])
    );
    expect(byText["History"]).toBe("History");
    expect(byText["Legacy section"]).toBe("Legacy_section");
  });

  it("groups content nodes under the owning section", () => {
    const sections = extractor.extractSections(root);
    const history = sections.find((s) => s.headingText === "History");
    const text = history.contentNodes.map((n) => n.textContent).join(" ");
    expect(text).toContain("history section describes past events");
    // Early-history prose belongs to its own subsection, not History.
    expect(text).not.toContain("Early history details");
  });

  it("returns an empty array when no parser-output is present", () => {
    const empty = document.createElement("div");
    expect(extractor.extractSections(empty)).toEqual([]);
  });
});
