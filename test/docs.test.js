import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docs = path.join(root, "docs");
const read = (f) => fs.readFileSync(path.join(docs, f), "utf8");
const PAGES = ["index.html", "privacy.html"];

describe("GitHub Pages site (docs/)", () => {
  it("has the pages, stylesheet, and .nojekyll", () => {
    [...PAGES, "style.css", ".nojekyll"].forEach((f) =>
      expect(fs.existsSync(path.join(docs, f)), f).toBe(true)
    );
  });

  it.each(PAGES)("%s is a complete, mobile-friendly HTML document", (f) => {
    const html = read(f);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toMatch(/<html lang="en">/);
    expect(html).toMatch(/<meta name="viewport"/);
    expect(html).toMatch(/<title>[^<]{3,}<\/title>/);
    expect(html).toMatch(/<h1>/);
    expect(html).not.toMatch(/<script/i); // static, no scripts, nothing to track
    expect(html).not.toMatch(/TODO|FIXME|\[CONTACT/);
  });

  it("every relative link and stylesheet points at a file that exists", () => {
    for (const f of PAGES) {
      const refs = [...read(f).matchAll(/(?:href|src)="([^"#]+)(?:#[^"]*)?"/g)].map((m) => m[1]);
      refs
        .filter((r) => !/^(https?:|mailto:)/.test(r))
        .forEach((r) => {
          const target = r === "./" ? "index.html" : r;
          expect(fs.existsSync(path.join(docs, target)), `${f} -> ${r}`).toBe(true);
        });
    }
  });

  it("the privacy policy covers what the extension actually does", () => {
    const text = read("privacy.html").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(text).toMatch(/does not collect, sell, or share personal data/);
    expect(text).toMatch(/no network requests of its own/);
    expect(text).toMatch(/Google/); // discloses online voices
    expect(text).toMatch(/Wikimedia Foundation/);
    expect(text).toMatch(/Last updated: \d{4}-\d{2}-\d{2}/);
  });

  it("the privacy policy's claims match the manifest", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
    expect(manifest.permissions).toEqual(["storage"]); // policy mentions only extension storage
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.content_scripts[0].matches).toEqual(["https://*.wikipedia.org/wiki/*"]);
    expect(read("privacy.html")).toContain("https://*.wikipedia.org/wiki/");
  });

  it("is not shipped inside the extension package", () => {
    const script = fs.readFileSync(path.join(root, "scripts/package.sh"), "utf8");
    const zipLine = script.split("\n").find((l) => l.trim().startsWith("zip "));
    expect(zipLine).toMatch(/manifest\.json src /); // only the extension itself
    expect(zipLine).not.toMatch(/docs/);
  });
});
