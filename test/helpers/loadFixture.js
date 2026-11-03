import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load a fixture HTML file into the current jsdom document and return the
// container element holding the parsed markup.
export function loadFixture(name) {
  const path = resolve(__dirname, "..", "fixtures", name);
  const html = readFileSync(path, "utf8");
  const container = document.createElement("div");
  container.innerHTML = html;
  return container;
}
