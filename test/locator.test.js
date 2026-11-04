import { describe, it, expect, beforeEach } from "vitest";
import extractor from "../src/core/extractor.js";
import filters from "../src/core/filters.js";
import locator from "../src/core/locator.js";
import settings from "../src/core/settings.js";
import { loadFixture } from "./helpers/loadFixture.js";

const F = settings.DEFAULTS.filters;
const squash = (s) => s.replace(/\s+/g, "");

// Build live content nodes from an HTML string.
function nodesFor(html) {
  const div = document.createElement("div");
  div.innerHTML = html;
  document.body.appendChild(div); // connected, like a real page
  return Array.from(div.children);
}

// The text a location covers in the live DOM.
function textOf(loc) {
  const r = document.createRange();
  r.setStart(loc.sn, loc.so);
  r.setEnd(loc.en, loc.eo);
  return r.toString();
}

// Locate every spoken item for these nodes, in speaking order.
function locateAll(nodes, cfg = F) {
  const items = filters.sectionToItems(nodes, cfg);
  const finder = locator.createLocator(nodes, cfg, { filters });
  return items.map((item) => ({ item, loc: finder.locate(item.text) }));
}

describe("locator.createLocator", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("requires the filters module", () => {
    expect(() => locator.createLocator([], F, {})).toThrow();
  });

  it("locates each sentence of a paragraph, exactly", () => {
    const nodes = nodesFor("<p>The first sentence is here. The second sentence follows it.</p>");
    const found = locateAll(nodes);
    expect(found.map((f) => textOf(f.loc))).toEqual([
      "The first sentence is here.",
      "The second sentence follows it.",
    ]);
  });

  it("ranges span links, bold text and other inline elements", () => {
    const nodes = nodesFor(
      '<p>See <a href="#x">the <b>linked</b> page</a> for more. Then stop right there.</p>'
    );
    const [first, second] = locateAll(nodes);
    expect(first.loc.sn).not.toBe(first.loc.en); // crosses element boundaries
    expect(textOf(first.loc)).toBe("See the linked page for more.");
    expect(textOf(second.loc)).toBe("Then stop right there.");
  });

  it("skips footnote markers between sentences (the Go 'version 1.0' case)", () => {
    const nodes = nodesFor(
      '<p>Go was announced in 2009, and version 1.0 was released in March 2012.' +
        '<sup class="reference"><a href="#n31">[31]</a></sup><sup class="reference"><a href="#n32">[32]</a></sup>' +
        " Go is widely used in production at Google and in other places.</p>"
    );
    const found = locateAll(nodes);
    expect(found.map((f) => textOf(f.loc))).toEqual([
      "Go was announced in 2009, and version 1.0 was released in March 2012.",
      "Go is widely used in production at Google and in other places.",
    ]);
  });

  it("a sentence containing a footnote marker covers it, but still starts and ends on spoken text", () => {
    const nodes = nodesFor(
      '<p>The gopher was named Gordon,<sup class="reference"><a>[35]</a></sup> but nameless since 2010.</p>'
    );
    const [only] = locateAll(nodes);
    const covered = textOf(only.loc);
    expect(covered.startsWith("The gopher")).toBe(true);
    expect(covered.endsWith("since 2010.")).toBe(true);
    expect(covered).toContain("[35]"); // skipped when speaking, harmless to highlight
  });

  it("ignores bracketed markers left as plain text", () => {
    const nodes = nodesFor("<p>An unsourced claim[1] stands here. Another claim[citation needed] stands.</p>");
    const found = locateAll(nodes);
    expect(found.every((f) => f.loc)).toBe(true);
    expect(found.map((f) => f.item.text)).toEqual([
      "An unsourced claim stands here.",
      "Another claim stands.",
    ]);
  });

  it("locates text around filtered-out blocks (tables, figures, infoboxes)", () => {
    const nodes = nodesFor(
      "<p>Before the table comes this sentence.</p>" +
        '<table class="wikitable"><tr><td>Cell text that is never spoken</td></tr></table>' +
        '<figure><figcaption>A caption never spoken</figcaption></figure>' +
        "<p>After the table comes another sentence.</p>"
    );
    const found = locateAll(nodes);
    expect(found.map((f) => textOf(f.loc))).toEqual([
      "Before the table comes this sentence.",
      "After the table comes another sentence.",
    ]);
  });

  it("keeps working when inline <code> is filtered out of a sentence", () => {
    const nodes = nodesFor("<p>Use the <code>struct</code> keyword to define record types here.</p>");
    const [only] = locateAll(nodes);
    expect(only.item.text).toBe("Use the keyword to define record types here.");
    expect(textOf(only.loc)).toBe("Use the struct keyword to define record types here.");
  });

  it("locates list items one by one", () => {
    const nodes = nodesFor("<ul><li>Apples</li><li>Pears</li><li>Plums</li></ul>");
    const found = locateAll(nodes);
    expect(found.map((f) => textOf(f.loc))).toEqual(["Apples", "Pears", "Plums"]);
  });

  it("resolves repeated sentences to successive occurrences", () => {
    const nodes = nodesFor("<p>Yes it is so. Yes it is so. Yes it is so.</p>");
    const found = locateAll(nodes);
    expect(found).toHaveLength(3);
    const starts = found.map((f) => f.loc.so);
    expect(new Set(starts).size).toBe(3);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it("tolerates spacing differences introduced by the chunker", () => {
    const nodes = nodesFor("<p>See the page at www.example.com for details.</p>");
    const finder = locator.createLocator(nodes, F, { filters });
    const loc = finder.locate("See the page at www. example. com for details.");
    expect(textOf(loc)).toBe("See the page at www.example.com for details.");
  });

  it("returns null for unknown text and does not lose its place", () => {
    const nodes = nodesFor("<p>Alpha sentence goes here. Beta sentence goes here.</p>");
    const finder = locator.createLocator(nodes, F, { filters });
    expect(finder.locate("Alpha sentence goes here.")).not.toBeNull();
    expect(finder.locate("This text is nowhere in the page.")).toBeNull();
    expect(textOf(finder.locate("Beta sentence goes here."))).toBe("Beta sentence goes here.");
    expect(finder.locate("")).toBeNull();
  });

  it("returns null when nothing is speakable", () => {
    const nodes = nodesFor('<table class="wikitable"><tr><td>Only a table here</td></tr></table>');
    const finder = locator.createLocator(nodes, F, { filters });
    expect(finder.locate("Only a table here")).toBeNull();
  });

  it("does not mutate the live DOM", () => {
    const nodes = nodesFor('<p>Keep this <sup class="reference">[1]</sup> intact please.</p>');
    const before = nodes.map((n) => n.outerHTML).join("");
    locateAll(nodes);
    expect(nodes.map((n) => n.outerHTML).join("")).toBe(before);
  });

  it("honors the code filter being off (inline code is spoken and located)", () => {
    const nodes = nodesFor("<p>Use the <code>struct</code> keyword to define record types here.</p>");
    const cfg = { ...F, code: false };
    const [only] = locateAll(nodes, cfg);
    expect(only.item.text).toContain("struct");
    expect(textOf(only.loc)).toBe("Use the struct keyword to define record types here.");
  });
});

describe("locator on the sample fixtures: every spoken sentence is found", () => {
  for (const name of ["sample-article.html", "parsoid-article.html"]) {
    it(`${name}`, () => {
      document.body.innerHTML = "";
      const root = loadFixture(name);
      document.body.appendChild(root);
      const sections = extractor.extractSections(root);
      let total = 0;
      for (const s of sections) {
        for (const { item, loc } of locateAll(s.contentNodes)) {
          total += 1;
          expect(loc, `${name}: "${item.text}"`).not.toBeNull();
          expect(squash(textOf(loc)).startsWith(squash(item.text).slice(0, 10))).toBe(true);
        }
      }
      expect(total).toBeGreaterThan(0);
    });
  }
});
