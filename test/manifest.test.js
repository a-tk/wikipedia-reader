import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const exists = (rel) => fs.existsSync(path.join(root, rel));

// PNG width/height live in the IHDR chunk at bytes 16..23.
function pngSize(rel) {
  const buf = fs.readFileSync(path.join(root, rel));
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

describe("manifest.json", () => {
  it("is Manifest V3 with the expected name", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.name).toBe("Audio for Wikipedia");
  });

  it("references only files that exist", () => {
    const files = [
      manifest.background.service_worker,
      manifest.options_page,
      ...manifest.content_scripts.flatMap((c) => [...c.js, ...(c.css || [])]),
      ...Object.values(manifest.icons),
      ...Object.values(manifest.action.default_icon),
    ];
    files.forEach((f) => expect(exists(f), f).toBe(true));
  });

  it("uses a separate PNG of the right pixel size for every icon", () => {
    for (const icons of [manifest.icons, manifest.action.default_icon]) {
      for (const [size, file] of Object.entries(icons)) {
        expect(pngSize(file), file).toEqual([Number(size), Number(size)]);
      }
    }
  });

  it("requests only the storage permission and no host permissions", () => {
    expect(manifest.permissions).toEqual(["storage"]);
    expect(manifest.host_permissions).toBeUndefined();
  });

  it("only injects on https Wikipedia article pages", () => {
    manifest.content_scripts.forEach((c) =>
      c.matches.forEach((m) => expect(m.startsWith("https://")).toBe(true))
    );
  });

  it("keeps within Chrome's limit of 4 suggested shortcuts", () => {
    const suggested = Object.values(manifest.commands).filter((c) => c.suggested_key);
    expect(suggested.length).toBeLessThanOrEqual(4);
  });

  it("loads the new modules in dependency order", () => {
    const js = manifest.content_scripts[0].js;
    const at = (f) => js.indexOf(f);
    expect(at("src/core/filters.js")).toBeGreaterThanOrEqual(0);
    expect(at("src/core/locator.js")).toBeGreaterThan(at("src/core/filters.js"));
    expect(at("src/content/highlighter.js")).toBeGreaterThanOrEqual(0);
    expect(at("src/content/content.js")).toBe(js.length - 1);
    expect(at("src/content/highlighter.js")).toBeLessThan(at("src/content/content.js"));
  });
});

