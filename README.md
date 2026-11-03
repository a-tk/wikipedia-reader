# Wikipedia Reader

A Chrome / Chromium browser extension (Manifest V3) that reads Wikipedia
articles aloud using the browser's built-in speech synthesis. Pick which
sections to read, filter out non-prose content, and control playback from
in-page buttons or the keyboard.

No accounts, no API keys, no network calls — all speech uses the offline
`speechSynthesis` Web Speech API that ships with your browser.

## Features

- **Read aloud** any Wikipedia article with the browser's native voices.
- **Per-article section picker** — before you press play, tick exactly which
  headings/sections get read. Everything is selected by default.
- **Content filters** — skip infoboxes, tables, image captions, math formulas,
  and inline footnote markers like `[1]`. Toggle each category in settings.
- **Voice settings** — choose voice, rate, pitch, and volume. Settings persist
  across sessions and sync via your browser profile.
- **In-page controls** — a floating bar with play/pause, stop, and next-section.
- **Keyboard shortcuts** — control playback without reaching for the mouse.
- **Section highlighting** — the section currently being read is highlighted,
  and its title is announced before its content.

## Install (unpacked)

1. Open `chrome://extensions` in Chrome, Edge, Brave, or another Chromium browser.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this project folder
   (the one containing `manifest.json`).
4. Open any article on `*.wikipedia.org/wiki/...`. The floating control bar and
   section list appear in the bottom-right corner.

There is no build step — the extension runs the plain files in `src/` directly.

## Usage

1. On a Wikipedia article, the control bar and a **"Read these sections"** list
   appear. Untick any sections you want to skip.
2. Press **▶** (or the play/pause shortcut) to start. Each selected section's
   heading is spoken first, then its prose.
3. Use the buttons or shortcuts to pause/resume, stop, or jump to the next
   section.
4. Click **⚙** to open settings and adjust the voice, speed, and content filters.

### Default keyboard shortcuts

| Action        | Shortcut        |
| ------------- | --------------- |
| Play / pause  | `Alt+Shift+P`   |
| Stop          | `Alt+Shift+S`   |
| Next section  | `Alt+Shift+N`   |

Change these at `chrome://extensions/shortcuts`.

## Settings

Open the options page from the control bar's ⚙ button, or from the extension's
entry in `chrome://extensions`.

- **Voice / Rate / Pitch / Volume** — standard speech controls, with a
  **Preview voice** button.
- **Skip this content** — checkboxes for infoboxes, tables, image captions,
  math formulas, and footnote markers. Checked means "skip, don't read".

## Project structure

```
manifest.json            MV3 manifest (content scripts, commands, options)
src/
  service_worker.js      Relays keyboard commands to the active tab
  core/
    extractor.js         DOM -> ordered section outline (pure)
    filters.js           Strip non-prose + chunk into sentences (pure)
    speech.js            speechSynthesis queue engine
    settings.js          Load/save settings via chrome.storage.sync
    commands.js          Command -> action mapping
  content/
    content.js           Orchestrates extract -> UI -> speak
    controls.js          Floating control bar + outline checklist
    controls.css         Control bar styles
  options/
    options.html/js/css  Settings page
test/                    Vitest unit + integration tests (not shipped)
```

## How it works

`speechSynthesis` only exists in page contexts, so all speaking happens in the
content script; the service worker exists only to forward keyboard commands to
the active tab. Long articles are split into short sentence-sized chunks and
spoken as a managed queue, with a periodic `pause()`/`resume()` keep-alive to
work around Chromium stalling long speech queues.

The extension parses the live article DOM, handling both the legacy
(`<h2><span class="mw-headline">`) and newer Parsoid
(`<div class="mw-heading"><h2>`) heading markup.

## Development

Core logic is covered by unit and integration tests using Vitest + jsdom. The
tests are not part of the shipped extension.

```bash
npm install
npm test
```

The core modules use a small UMD-style wrapper so the same source works both as
a plain browser content script (attaching to a `WikiReader` global) and as a
CommonJS import in the tests — keeping a single source of truth with no build
step.

## Limitations

- Voice quality depends on the voices installed in your operating system and
  browser.
- The extension runs on `*.wikipedia.org/wiki/*` article pages.
- Sibling-language Wikimedia sites (Wiktionary, etc.) are not matched by default;
  add their host patterns to `manifest.json` if you want them.

## License

See [LICENSE](LICENSE).
