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

describe("filters.sectionToItems (list item pauses)", () => {
  function nodesFor(html) {
    const div = document.createElement("div");
    div.innerHTML = html;
    return Array.from(div.children);
  }

  it("puts a pause after every list item, even without punctuation", () => {
    const nodes = nodesFor(
      "<p>Intro sentence here.</p><ul><li>Apples</li><li>Pears</li><li>Plums</li></ul>"
    );
    const items = filters.sectionToItems(nodes, filters.DEFAULT_FILTERS);
    expect(items.map((i) => i.text)).toEqual([
      "Intro sentence here.",
      "Apples",
      "Pears",
      "Plums",
    ]);
    expect(items[0].pauseAfterMs).toBeUndefined();
    expect(items.slice(1).every((i) => i.pauseAfterMs > 0)).toBe(true);
  });

  it("pauses only after the last chunk of a multi-sentence item", () => {
    const nodes = nodesFor(
      "<ul><li>First sentence is here. Second sentence is here.</li><li>Next item.</li></ul>"
    );
    const items = filters.sectionToItems(nodes, filters.DEFAULT_FILTERS);
    expect(items.map((i) => i.text)).toEqual([
      "First sentence is here.",
      "Second sentence is here.",
      "Next item.",
    ]);
    expect(items[0].pauseAfterMs).toBeUndefined();
    expect(items[1].pauseAfterMs).toBeGreaterThan(0);
  });

  it("handles nested lists without losing text or stacking pauses", () => {
    const nodes = nodesFor(
      "<ul><li>Parent item<ul><li>Child one</li><li>Child two</li></ul></li><li>Sibling</li></ul>"
    );
    const items = filters.sectionToItems(nodes, filters.DEFAULT_FILTERS);
    expect(items.map((i) => i.text)).toEqual([
      "Parent item",
      "Child one",
      "Child two",
      "Sibling",
    ]);
    expect(items.every((i) => i.pauseAfterMs > 0)).toBe(true);
  });

  it("honors a custom pause length, and 0 disables pauses", () => {
    const nodes = nodesFor("<ul><li>Alpha beta</li><li>Gamma delta</li></ul>");
    const custom = filters.sectionToItems(nodes, filters.DEFAULT_FILTERS, undefined, 900);
    expect(custom[0].pauseAfterMs).toBe(900);
    const none = filters.sectionToItems(nodes, filters.DEFAULT_FILTERS, undefined, 0);
    expect(none.some((i) => i.pauseAfterMs)).toBe(false);
  });

  it("text without lists has no pauses, and matches sectionToChunks", () => {
    const nodes = nodesFor("<p>One sentence is here. Another sentence is here.</p>");
    const items = filters.sectionToItems(nodes, filters.DEFAULT_FILTERS);
    expect(items.some((i) => i.pauseAfterMs)).toBe(false);
    expect(items.map((i) => i.text)).toEqual(
      filters.sectionToChunks(nodes, filters.DEFAULT_FILTERS)
    );
  });

  it("sectionText never leaks the internal marker and separates items", () => {
    const nodes = nodesFor("<ul><li>Apples</li><li>Pears</li></ul>");
    const text = filters.sectionText(nodes, filters.DEFAULT_FILTERS);
    expect(text).toBe("Apples Pears");
    expect(text).not.toContain(filters.ITEM_BREAK);
    expect(text).not.toContain(filters.ITEM_START);
  });

  it("drops filtered content inside lists before pausing", () => {
    const nodes = nodesFor(
      '<ul><li>Keep this one<sup class="reference">[1]</sup></li><li>And this one</li></ul>'
    );
    const items = filters.sectionToItems(nodes, filters.DEFAULT_FILTERS);
    expect(items.map((i) => i.text)).toEqual(["Keep this one", "And this one"]);
  });
});

describe("filters.chunkIntoSentences: no lost text", () => {
  const widelyUsed =
    "Go is widely used in production at Google and in many other organizations and open-source projects.";
  const longSentence =
    "Go developers implemented runtime support for concurrency in response to the availability of multicore systems: Although the design of most languages concentrates on innovations in syntax, semantics, or typing, Go is focused on the software development process itself.";

  it("keeps the sentence that precedes an over-long sentence", () => {
    expect(longSentence.length).toBeGreaterThan(240);
    const chunks = filters.chunkIntoSentences(`${widelyUsed} ${longSentence}`);
    expect(chunks[0]).toBe(widelyUsed);
    // ...and everything is still there, in order.
    const joined = chunks.join(" ").replace(/\s+/g, " ");
    expect(joined.indexOf("widely used")).toBeLessThan(joined.indexOf("Go developers"));
    expect(joined).toContain("software development process itself.");
  });

  it("does not lose any words across a mix of short and long sentences", () => {
    const text = [
      "Short one here.",
      longSentence,
      "Another short sentence follows.",
      longSentence,
      "The end of the passage.",
    ].join(" ");
    const words = (s) => s.replace(/\s+/g, " ").trim().split(" ");
    expect(words(filters.chunkIntoSentences(text).join(" "))).toEqual(words(text));
  });

  it("keeps a short buffered sentence even if it is below the minimum length", () => {
    const chunks = filters.chunkIntoSentences(`Yes. ${longSentence}`);
    expect(chunks.join(" ")).toContain("Yes.");
  });

  it("does not split on decimal points inside numbers", () => {
    const chunks = filters.chunkIntoSentences(
      "Go was announced in November 2009, and version 1.0 was released in March 2012. Generics arrived in Go 1.18 on March 15, 2022. Pi is about 3.14159."
    );
    expect(chunks).toEqual([
      "Go was announced in November 2009, and version 1.0 was released in March 2012.",
      "Generics arrived in Go 1.18 on March 15, 2022.",
      "Pi is about 3.14159.",
    ]);
  });

  it("still splits at a real sentence end followed by a digit-leading sentence", () => {
    const chunks = filters.chunkIntoSentences("It ended in 2012. 2013 was quieter for everyone.");
    expect(chunks).toEqual(["It ended in 2012.", "2013 was quieter for everyone."]);
  });
});
