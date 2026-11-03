import { describe, it, expect, beforeEach } from "vitest";
import extractor from "../src/core/extractor.js";
import filters from "../src/core/filters.js";
import { loadFixture } from "./helpers/loadFixture.js";

function sectionByHeading(root, heading) {
  const sections = extractor.extractSections(root);
  return sections.find((s) => s.headingText === heading);
}

describe("filters.sectionText", () => {
  let root;
  beforeEach(() => {
    root = loadFixture("sample-article.html");
  });

  it("drops inline footnote markers like [1]", () => {
    const lead = sectionByHeading(root, "");
    const text = filters.sectionText(lead.contentNodes, filters.DEFAULT_FILTERS);
    expect(text).toContain("example subject");
    expect(text).not.toMatch(/\[\s*1\s*\]/);
  });

  it("drops infobox content from the lead", () => {
    const lead = sectionByHeading(root, "");
    const text = filters.sectionText(lead.contentNodes, filters.DEFAULT_FILTERS);
    expect(text).not.toContain("1 January 1900");
  });

  it("drops math elements when the math filter is on", () => {
    const lead = sectionByHeading(root, "");
    const text = filters.sectionText(lead.contentNodes, filters.DEFAULT_FILTERS);
    expect(text).not.toContain("E = mc^2");
  });

  it("keeps math text when the math filter is off", () => {
    const lead = sectionByHeading(root, "");
    const text = filters.sectionText(lead.contentNodes, { math: false });
    expect(text).toContain("E = mc^2");
  });

  it("drops figure captions in the History section", () => {
    const history = sectionByHeading(root, "History");
    const text = filters.sectionText(history.contentNodes, filters.DEFAULT_FILTERS);
    expect(text).toContain("history section describes past events");
    expect(text).toContain("More history prose");
    expect(text).not.toContain("caption that should not be read");
  });

  it("drops a wikitable from the Legacy section", () => {
    const legacy = sectionByHeading(root, "Legacy section");
    const text = filters.sectionText(legacy.contentNodes, filters.DEFAULT_FILTERS);
    expect(text).toContain("legacy heading markup");
    expect(text).not.toContain("Something happened");
  });

  it("keeps table text when the table filter is off", () => {
    const legacy = sectionByHeading(root, "Legacy section");
    const text = filters.sectionText(legacy.contentNodes, { table: false, infobox: false });
    expect(text).toContain("Something happened");
  });
});

describe("filters.chunkIntoSentences", () => {
  it("splits on sentence boundaries without dropping words", () => {
    const text = "First sentence here. Second sentence follows! Third one? Done.";
    const chunks = filters.chunkIntoSentences(text, { minChars: 1 });
    expect(chunks.length).toBe(4);
    const rejoined = chunks.join(" ").replace(/\s+/g, " ");
    expect(rejoined).toBe(text);
  });

  it("does not split on common abbreviations", () => {
    const text = "Dr. Smith went to Washington. He stayed a week.";
    const chunks = filters.chunkIntoSentences(text, { minChars: 1 });
    expect(chunks.length).toBe(2);
    expect(chunks[0]).toBe("Dr. Smith went to Washington.");
  });

  it("breaks very long sentences into bounded chunks", () => {
    const long =
      "This clause is one, this clause is two, this clause is three, " +
      "this clause is four, this clause is five, this clause is six.";
    const chunks = filters.chunkIntoSentences(long, { maxChars: 40 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(60);
  });

  it("returns an empty array for empty input", () => {
    expect(filters.chunkIntoSentences("")).toEqual([]);
    expect(filters.chunkIntoSentences("   ")).toEqual([]);
  });
});

describe("filters.sectionToChunks", () => {
  it("produces clean chunks end to end", () => {
    const root = loadFixture("sample-article.html");
    const history = sectionByHeading(root, "History");
    const chunks = filters.sectionToChunks(history.contentNodes, filters.DEFAULT_FILTERS, {
      minChars: 1,
    });
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    const all = chunks.join(" ");
    expect(all).not.toContain("[2]");
    expect(all).not.toContain("caption");
  });
});
