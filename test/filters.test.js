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

  it("never reads the .shortdescription summary, before the intro prose", () => {
    const lead = sectionByHeading(root, "");
    const text = filters.sectionText(lead.contentNodes, filters.DEFAULT_FILTERS);
    expect(text).not.toContain("Short summary that should not be read");
    // The real intro prose still comes through.
    expect(text).toContain("example subject");
  });

  it("drops shortdescription even if all toggle filters are off", () => {
    const lead = sectionByHeading(root, "");
    const allOff = {
      infobox: false,
      table: false,
      caption: false,
      math: false,
      footnote: false,
      code: false,
    };
    const text = filters.sectionText(lead.contentNodes, allOff);
    expect(text).not.toContain("Short summary that should not be read");
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

describe("filters.sectionText code blocks", () => {
  let root;
  beforeEach(() => {
    root = loadFixture("sample-article.html");
  });

  it("drops syntax-highlighted code blocks when the code filter is on", () => {
    const legacy = sectionByHeading(root, "Legacy section");
    const text = filters.sectionText(legacy.contentNodes, filters.DEFAULT_FILTERS);
    expect(text).toContain("legacy heading markup");
    expect(text).toContain("Prose after the code example continues here");
    expect(text).not.toContain("int main");
  });

  it("drops bare <pre> blocks when the code filter is on", () => {
    const legacy = sectionByHeading(root, "Legacy section");
    const text = filters.sectionText(legacy.contentNodes, filters.DEFAULT_FILTERS);
    expect(text).not.toContain("plain preformatted console output");
  });

  it("keeps code text when the code filter is off", () => {
    const legacy = sectionByHeading(root, "Legacy section");
    const text = filters.sectionText(legacy.contentNodes, {
      code: false,
      table: false,
      infobox: false,
    });
    expect(text).toContain("int main");
    expect(text).toContain("plain preformatted console output");
  });

  it("code is in the default filter set and defaults to on", () => {
    expect(filters.DEFAULT_FILTERS.code).toBe(true);
  });
});

describe("filters: top-level <style> / TemplateStyles noise", () => {
  // Reproduces the Recursion (computer science) article bug: a <style> block
  // (TemplateStyles) sits as a top-level content node next to a blockquote,
  // and its raw CSS text (".mw-parser-output ...") was being read aloud.
  let root;
  beforeEach(() => {
    root = loadFixture("parsoid-article.html");
  });

  it("never reads CSS text from a top-level <style> block", () => {
    const sections = extractor.extractSections(root);
    const lead = sections[0];
    const text = filters.sectionText(lead.contentNodes, filters.DEFAULT_FILTERS);
    expect(text).not.toContain("mw-parser-output");
    expect(text).not.toContain("templatequote");
    expect(text).not.toContain("overflow:hidden");
    expect(text).not.toContain("{");
  });

  it("still reads the real blockquote prose next to the style block", () => {
    const sections = extractor.extractSections(root);
    const lead = sections[0];
    const text = filters.sectionText(lead.contentNodes, filters.DEFAULT_FILTERS);
    expect(text).toContain("An inspiring quotation that is real article content");
  });

  it("drops the style block even with all toggle filters off", () => {
    const sections = extractor.extractSections(root);
    const lead = sections[0];
    const allOff = {
      infobox: false,
      table: false,
      caption: false,
      math: false,
      footnote: false,
      code: false,
    };
    const text = filters.sectionText(lead.contentNodes, allOff);
    expect(text).not.toContain("mw-parser-output");
  });
});
